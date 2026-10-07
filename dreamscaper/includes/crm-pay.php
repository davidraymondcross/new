<?php
/**
 * DreamScaper – contractor payments with Stripe Connect (Express accounts, destination charges).
 * The homeowner pays on Stripe Checkout by card or bank account (ACH); the money goes to the
 * contractor's Stripe account minus the processing rate for that method (Settings → DreamScaper →
 * Contractor payments; defaults: card 3.5% + $0.30, ACH 1.5%). The site pays Stripe's own fees out
 * of that. Contractors can also take an Instant Payout to a debit card for a % of the payout.
 * Bank payments take a few business days: the invoice shows "processing" until Stripe confirms.
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

add_action( 'rest_api_init', function () {
	$auth = function () {
		return is_user_logged_in();
	};
	register_rest_route( 'dreamscaper/v1', '/crm/connect', array( 'methods' => 'POST', 'callback' => 'dreamscaper_crm_connect', 'permission_callback' => $auth ) );
	register_rest_route( 'dreamscaper/v1', '/crm/connect/status', array( 'methods' => 'GET', 'callback' => 'dreamscaper_crm_connect_status', 'permission_callback' => $auth ) );
	register_rest_route( 'dreamscaper/v1', '/crm/pay', array( 'methods' => 'POST', 'callback' => 'dreamscaper_crm_pay', 'permission_callback' => '__return_true' ) );
	register_rest_route( 'dreamscaper/v1', '/crm/payouts', array( 'methods' => 'GET', 'callback' => 'dreamscaper_crm_payouts', 'permission_callback' => $auth ) );
	register_rest_route( 'dreamscaper/v1', '/crm/payout/instant', array( 'methods' => 'POST', 'callback' => 'dreamscaper_crm_payout_instant', 'permission_callback' => $auth ) );
} );

/** The processing rates, as shown to contractors and customers. */
function dreamscaper_pay_rates() {
	return array(
		'card_pct'    => (float) dreamscaper_opt( 'fee_card_pct' ),
		'card_fixed'  => (float) dreamscaper_opt( 'fee_card_fixed' ),
		'ach_pct'     => (float) dreamscaper_opt( 'fee_ach_pct' ),
		'instant_pct' => (float) dreamscaper_opt( 'fee_instant_pct' ),
		'ach'         => (bool) dreamscaper_opt( 'pay_ach' ),
		'instant'     => (bool) dreamscaper_opt( 'pay_instant' ),
	);
}
/** The processing fee in cents for a payment of $cents by 'card' or 'ach' (never more than the payment). */
function dreamscaper_pay_fee( $cents, $method ) {
	$r   = dreamscaper_pay_rates();
	$fee = 'ach' === $method ? $cents * $r['ach_pct'] / 100 : $cents * $r['card_pct'] / 100 + $r['card_fixed'] * 100;
	return (int) min( $cents, max( 0, round( $fee ) ) );
}

/** Start (or continue) Stripe onboarding for the contractor. */
function dreamscaper_crm_connect() {
	global $wpdb;
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	if ( ! dreamscaper_opt( 'stripe_secret' ) ) {
		return dreamscaper_crm_err( 'Online payments aren’t set up on this site yet.', 503 );
	}
	$acct = $p->stripe_acct;
	if ( ! $acct ) {
		$a = dreamscaper_stripe( 'POST', 'accounts', array(
			'type'                                    => 'express',
			'country'                                 => 'US',
			'email'                                   => $p->email,
			'business_type'                           => 'company',
			'business_profile[name]'                  => $p->business,
			'business_profile[mcc]'                   => '0780', // landscaping & horticultural services
			'business_profile[url]'                   => $p->website ? $p->website : home_url( '/' ),
			'capabilities[card_payments][requested]'  => 'true',
			'capabilities[us_bank_account_ach_payments][requested]' => 'true',
			'capabilities[transfers][requested]'      => 'true',
			'metadata[dreamscaper_pro]'               => $p->user_id,
		) );
		if ( is_wp_error( $a ) ) {
			return $a;
		}
		$acct = $a['id'];
	} elseif ( dreamscaper_opt( 'pay_ach' ) ) {
		// accounts made before bank payments existed: ask Stripe for the ACH capability too (harmless if already on)
		dreamscaper_stripe( 'POST', 'accounts/' . rawurlencode( $acct ), array( 'capabilities[us_bank_account_ach_payments][requested]' => 'true' ) );
	}
	if ( ! $p->stripe_acct ) {
		$wpdb->update( dreamscaper_t( 'pros' ), array( 'stripe_acct' => $acct ), array( 'user_id' => $p->user_id ) );
	}
	$back = dreamscaper_app_url( array( 'ds_hub' => 'pay' ) );
	$link = dreamscaper_stripe( 'POST', 'account_links', array( 'account' => $acct, 'refresh_url' => $back, 'return_url' => $back, 'type' => 'account_onboarding' ) );
	return is_wp_error( $link ) ? $link : array( 'url' => $link['url'] );
}

function dreamscaper_crm_connect_refresh( $p ) {
	global $wpdb;
	if ( ! $p->stripe_acct ) {
		return false;
	}
	$a = dreamscaper_stripe( 'GET', 'accounts/' . rawurlencode( $p->stripe_acct ) );
	if ( is_wp_error( $a ) ) {
		return (bool) $p->stripe_ready;
	}
	$ready = ! empty( $a['charges_enabled'] ) && ! empty( $a['details_submitted'] );
	$wpdb->update( dreamscaper_t( 'pros' ), array( 'stripe_ready' => $ready ? 1 : 0 ), array( 'user_id' => $p->user_id ) );
	return $ready;
}
function dreamscaper_crm_connect_status() {
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$ready = dreamscaper_crm_connect_refresh( $p );
	$out   = array( 'ready' => $ready, 'started' => '' !== $p->stripe_acct );
	if ( $ready ) {
		$l = dreamscaper_stripe( 'POST', 'accounts/' . rawurlencode( $p->stripe_acct ) . '/login_links' );
		if ( ! is_wp_error( $l ) ) {
			$out['dashboard'] = $l['url'];
		}
	}
	return $out;
}

/** Checkout for an invoice (public: the invoice token is the key). */
function dreamscaper_crm_pay( WP_REST_Request $r ) {
	global $wpdb;
	$j   = $r->get_json_params();
	$tok = preg_replace( '/[^a-z0-9]/', '', strtolower( (string) ( isset( $j['t'] ) ? $j['t'] : '' ) ) );
	$inv = $tok ? $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( 'invoices' ) . ' WHERE token=%s', $tok ) ) : null;
	if ( ! $inv || 'sent' !== $inv->status ) {
		return dreamscaper_crm_err( $inv && 'paid' === $inv->status ? 'This invoice is already paid. Thank you!' : ( $inv && 'processing' === $inv->status ? 'Your bank payment is already on its way — it usually clears in about 4 business days.' : 'Invoice not found.' ), 404 );
	}
	$method = isset( $j['method'] ) && 'ach' === $j['method'] ? 'ach' : 'card';
	if ( 'ach' === $method && ! dreamscaper_opt( 'pay_ach' ) ) {
		return dreamscaper_crm_err( 'Bank payments aren’t available — please pay by card.', 400 );
	}
	$p = dreamscaper_pro_row( $inv->pro_id );
	if ( ! $p || ! $p->stripe_acct || ! dreamscaper_opt( 'stripe_secret' ) ) {
		return dreamscaper_crm_err( 'This contractor doesn’t take online payments yet. Please pay them directly.', 503 );
	}
	if ( ! $p->stripe_ready && ! dreamscaper_crm_connect_refresh( $p ) ) {
		return dreamscaper_crm_err( 'This contractor is still setting up online payments. Please try again later or pay them directly.', 503 );
	}
	if ( ! dreamscaper_limit( 'pay', 30, HOUR_IN_SECONDS ) ) {
		return dreamscaper_crm_err( 'Please wait a moment and try again.', 429 );
	}
	$c     = $inv->client_id ? dreamscaper_crm_get( 'clients', $inv->client_id, $inv->pro_id ) : null;
	$cents = (int) round( $inv->amount * 100 );
	$fee   = dreamscaper_pay_fee( $cents, $method );
	$url   = dreamscaper_invoice_url( $inv->token );
	$body  = array(
		'mode'                                           => 'payment',
		'line_items[0][quantity]'                        => 1,
		'line_items[0][price_data][currency]'            => 'usd',
		'line_items[0][price_data][unit_amount]'         => $cents,
		'line_items[0][price_data][product_data][name]'  => mb_substr( $inv->number . ' – ' . $inv->title, 0, 120 ),
		'line_items[0][price_data][product_data][description]' => mb_substr( $p->business, 0, 120 ),
		'payment_intent_data[transfer_data][destination]' => $p->stripe_acct,
		'payment_intent_data[on_behalf_of]'              => $p->stripe_acct,
		'payment_intent_data[description]'               => mb_substr( $p->business . ' ' . $inv->number, 0, 200 ),
		'payment_intent_data[metadata][dreamscaper_invoice]' => $inv->id,
		'payment_intent_data[metadata][dreamscaper_method]' => $method,
		'payment_method_types[0]'                        => 'ach' === $method ? 'us_bank_account' : 'card',
		'metadata[dreamscaper_invoice]'                  => $inv->id,
		'success_url'                                    => add_query_arg( 'paid', '{CHECKOUT_SESSION_ID}', $url ),
		'cancel_url'                                     => $url,
	);
	if ( 'ach' === $method ) {
		// instant bank login through Stripe Financial Connections, with micro-deposits as the fallback
		$body['payment_method_options[us_bank_account][verification_method]'] = 'automatic';
	}
	if ( $fee > 0 ) {
		$body['payment_intent_data[application_fee_amount]'] = $fee;
	}
	if ( $c && is_email( $c->email ) ) {
		$body['customer_email'] = $c->email;
	}
	$s = dreamscaper_stripe( 'POST', 'checkout/sessions', $body );
	if ( is_wp_error( $s ) ) {
		return $s;
	}
	$wpdb->update( dreamscaper_t( 'invoices' ), array( 'stripe_session' => $s['id'] ), array( 'id' => $inv->id ) );
	return array( 'url' => $s['url'] );
}

/** Mark an invoice paid from a completed Checkout Session (webhook or return). Idempotent. */
function dreamscaper_crm_invoice_paid( $s ) {
	global $wpdb;
	$id = (int) ( isset( $s['metadata']['dreamscaper_invoice'] ) ? $s['metadata']['dreamscaper_invoice'] : 0 );
	$I  = dreamscaper_t( 'invoices' );
	if ( $id && 'unpaid' === ( isset( $s['payment_status'] ) ? $s['payment_status'] : '' ) && 'complete' === ( isset( $s['status'] ) ? $s['status'] : '' ) ) {
		// a bank (ACH) payment was started: it clears in a few business days
		if ( $wpdb->query( $wpdb->prepare( "UPDATE $I SET status='processing' WHERE id=%d AND status='sent'", $id ) ) ) {
			$inv = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $I WHERE id=%d", $id ) );
			dreamscaper_crm_log( $inv->pro_id, $inv->client_id, $inv->quote_id, 'payment', 'Bank payment started: ' . $inv->number . ' ($' . number_format( (float) $inv->amount, 2 ) . ') — usually clears in about 4 business days', 0 );
			dreamscaper_crm_tell_pro( (int) $inv->pro_id, 'Bank payment started for ' . $inv->number, 'Your customer paid ' . $inv->number . ' by bank account. It usually clears in about 4 business days — we’ll tell you when it does.', $inv->quote_id );
		}
		return true;
	}
	if ( ! $id || 'paid' !== ( isset( $s['payment_status'] ) ? $s['payment_status'] : '' ) ) {
		return false;
	}
	$inv = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $I WHERE id=%d", $id ) );
	if ( ! $inv || ( isset( $s['amount_total'] ) && (int) $s['amount_total'] !== (int) round( $inv->amount * 100 ) ) ) {
		return false;
	}
	$how = isset( $s['payment_method_types'][0] ) && 'us_bank_account' === $s['payment_method_types'][0] ? 'ach' : 'card';
	if ( ! $wpdb->query( $wpdb->prepare( "UPDATE $I SET status='paid', paid_at=%s WHERE id=%d AND status<>'paid'", dreamscaper_now(), $id ) ) ) {
		return true; // already counted
	}
	$fee = dreamscaper_pay_fee( (int) round( $inv->amount * 100 ), $how ) / 100;
	dreamscaper_crm_log( $inv->pro_id, $inv->client_id, $inv->quote_id, 'payment', 'Paid online by ' . ( 'ach' === $how ? 'bank account' : 'card' ) . ': ' . $inv->number . ' ($' . number_format( (float) $inv->amount, 2 ) . '; processing $' . number_format( $fee, 2 ) . ', you receive $' . number_format( (float) $inv->amount - $fee, 2 ) . ')', 0 );
	$pp = dreamscaper_pro_row( $inv->pro_id );
	if ( $pp ) {
		$inv2 = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $I WHERE id=%d", $id ) );
		$cc   = $inv2->client_id ? dreamscaper_crm_get( 'clients', $inv2->client_id, $pp->user_id ) : null;
		$qq   = $inv2->quote_id ? dreamscaper_crm_get( 'quotes', $inv2->quote_id, $pp->user_id ) : null;
		dreamscaper_tpl_send( $pp, 'alert_payment', array( 'invoice' => $inv2, 'client' => $cc ), array(), array( 'force' => true, 'hub' => 'invoices', 'target' => $inv2->id ) );
		// the receipt goes out even if the account is paused: the customer paid
		dreamscaper_tpl_send( $pp, 'payment_received', array( 'invoice' => $inv2, 'client' => $cc, 'quote' => $qq ), dreamscaper_tpl_to_client( $cc ), array( 'force' => true, 'thread_id' => $qq ? dreamscaper_thread_for_quote( $qq ) : 0, 'ref_type' => 'invoice', 'ref_id' => $inv2->id, 'target' => $inv2->id ) );
	}
	if ( 'deposit' === $inv->kind && $inv->quote_id ) {
		$wpdb->query( $wpdb->prepare( 'UPDATE ' . dreamscaper_t( 'quotes' ) . " SET job_status='ready' WHERE id=%d AND job_status=''", $inv->quote_id ) );
	}
	return true;
}

add_action( 'dreamscaper_stripe_event', function ( $e ) {
	$type = isset( $e['type'] ) ? $e['type'] : '';
	if ( in_array( $type, array( 'checkout.session.completed', 'checkout.session.async_payment_succeeded' ), true ) ) {
		dreamscaper_crm_invoice_paid( $e['data']['object'] );
	}
	if ( 'checkout.session.async_payment_failed' === $type ) {
		// the bank payment didn't go through (insufficient funds, closed account…): the invoice is open again
		global $wpdb;
		$s  = $e['data']['object'];
		$id = (int) ( isset( $s['metadata']['dreamscaper_invoice'] ) ? $s['metadata']['dreamscaper_invoice'] : 0 );
		$I  = dreamscaper_t( 'invoices' );
		if ( $id && $wpdb->query( $wpdb->prepare( "UPDATE $I SET status='sent' WHERE id=%d AND status='processing'", $id ) ) ) {
			$inv = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $I WHERE id=%d", $id ) );
			dreamscaper_crm_log( $inv->pro_id, $inv->client_id, $inv->quote_id, 'payment', 'Bank payment failed: ' . $inv->number . ' — the invoice is open again', 0 );
			dreamscaper_crm_tell_pro( (int) $inv->pro_id, 'Bank payment failed for ' . $inv->number, 'The bank payment for ' . $inv->number . ' didn’t go through, so the invoice is open again. Your customer can pay by card or try another bank account from the same link.', $inv->quote_id );
			$c = $inv->client_id ? dreamscaper_crm_get( 'clients', $inv->client_id, $inv->pro_id ) : null;
			if ( $c && is_email( $c->email ) ) {
				$pp = dreamscaper_pro_row( $inv->pro_id );
				wp_mail( $c->email, 'Your bank payment didn’t go through — ' . $inv->number, "Hi,\n\nYour bank payment for {$inv->number} didn’t go through. No problem — you can pay by card or try another bank account here:\n" . dreamscaper_invoice_url( $inv->token ) . "\n\n" . ( $pp ? $pp->business : '' ) );
			}
		}
	}
	if ( 'account.updated' === $type && ! empty( $e['data']['object']['id'] ) ) {
		global $wpdb;
		$a = $e['data']['object'];
		$wpdb->update( dreamscaper_t( 'pros' ), array( 'stripe_ready' => ( ! empty( $a['charges_enabled'] ) && ! empty( $a['details_submitted'] ) ) ? 1 : 0 ), array( 'stripe_acct' => $a['id'] ) );
	}
} );

/** When a quote is signed, create the deposit invoice (if the contractor uses deposits). */
function dreamscaper_crm_deposit_invoice( $q ) {
	global $wpdb;
	$docs = dreamscaper_json( $q->docs );
	$dep  = isset( $docs['totals']['deposit'] ) ? round( (float) $docs['totals']['deposit'], 2 ) : 0;
	if ( $dep <= 0 ) {
		return null;
	}
	$I = dreamscaper_t( 'invoices' );
	$ex = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $I WHERE quote_id=%d AND kind='deposit'", $q->id ) );
	if ( $ex ) {
		return $ex;
	}
	$c = dreamscaper_crm_get( 'clients', $q->client_id, $q->pro_id );
	$wpdb->insert( $I, array(
		'pro_id' => $q->pro_id, 'quote_id' => $q->id, 'client_id' => $q->client_id, 'user_id' => $c ? (int) $c->user_id : 0,
		'number' => dreamscaper_next_number( $q->pro_id, 'INV' ), 'kind' => 'deposit', 'title' => $q->title . ' – Deposit',
		'items' => wp_json_encode( array( array( 'name' => 'Deposit for ' . $q->number . ' ' . $q->title, 'qty' => 1, 'rate' => $dep ) ) ), 'amount' => $dep,
		'status' => 'sent', 'token' => dreamscaper_token(), 'due' => gmdate( 'Y-m-d', strtotime( '+7 days' ) ), 'sent_at' => dreamscaper_now(), 'created' => dreamscaper_now(),
	) );
	return $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $I WHERE id=%d", $wpdb->insert_id ) );
}

/* ------------------------------------------------------------ Instant Payouts */

/** The site's own Stripe account id (where Instant Payout fees go). */
function dreamscaper_platform_acct() {
	$id = get_option( 'dreamscaper_platform_acct' );
	if ( $id ) {
		return $id;
	}
	$a = dreamscaper_stripe( 'GET', 'account' );
	if ( is_wp_error( $a ) || empty( $a['id'] ) ) {
		return '';
	}
	update_option( 'dreamscaper_platform_acct', $a['id'], false );
	return $a['id'];
}

/** What can be paid out right now, and what an instant payout costs. */
function dreamscaper_crm_payouts() {
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$r   = dreamscaper_pay_rates();
	$out = array( 'rates' => $r, 'ready' => (bool) $p->stripe_ready, 'instant' => 0, 'available' => 0, 'pending' => 0 );
	if ( ! $p->stripe_acct || ! $p->stripe_ready ) {
		return $out;
	}
	$b = dreamscaper_stripe_x( 'GET', 'balance', array(), $p->stripe_acct );
	if ( is_wp_error( $b ) ) {
		return $out;
	}
	$sum = function ( $list ) {
		$n = 0;
		foreach ( (array) $list as $x ) {
			if ( isset( $x['currency'] ) && 'usd' === $x['currency'] ) {
				$n += (int) $x['amount'];
			}
		}
		return $n / 100;
	};
	$out['available'] = $sum( isset( $b['available'] ) ? $b['available'] : array() );
	$out['pending']   = $sum( isset( $b['pending'] ) ? $b['pending'] : array() );
	$out['instant']   = $sum( isset( $b['instant_available'] ) ? $b['instant_available'] : array() );
	return $out;
}

/**
 * Instant Payout to the contractor's debit card. The fee (instant %) is taken first as an account
 * debit to the site, then the rest is paid out instantly. If the payout fails, the fee is returned.
 */
function dreamscaper_crm_payout_instant( WP_REST_Request $r ) {
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	if ( ! dreamscaper_opt( 'pay_instant' ) ) {
		return dreamscaper_crm_err( 'Instant Payouts aren’t switched on on this website.', 503 );
	}
	if ( ! $p->stripe_acct || ! $p->stripe_ready ) {
		return dreamscaper_crm_err( 'Connect Stripe first (Settings → Get paid online).', 409 );
	}
	if ( ! dreamscaper_limit( 'instantpay', 10, DAY_IN_SECONDS ) ) {
		return dreamscaper_crm_err( 'That’s a lot of instant payouts today. Please try again tomorrow.', 429 );
	}
	$j      = $r->get_json_params();
	$cents  = (int) round( (float) ( isset( $j['amount'] ) ? $j['amount'] : 0 ) * 100 );
	$bal    = dreamscaper_crm_payouts();
	$avail  = (int) round( $bal['instant'] * 100 );
	if ( $cents < 100 || $cents > $avail ) {
		return dreamscaper_crm_err( $avail < 100 ? 'Nothing is available for an instant payout right now.' : 'You can pay out up to $' . number_format( $avail / 100, 2 ) . ' instantly.' );
	}
	$fee = (int) max( 50, ceil( $cents * dreamscaper_pay_rates()['instant_pct'] / 100 ) );
	if ( $fee >= $cents ) {
		return dreamscaper_crm_err( 'That amount is too small for an instant payout.' );
	}
	$site = dreamscaper_platform_acct();
	if ( ! $site ) {
		return dreamscaper_crm_err( 'Instant Payouts are unavailable right now. Please try again later.', 502 );
	}
	// 1. the fee, as an account debit from the contractor's balance to the site
	$debit = dreamscaper_stripe_x( 'POST', 'transfers', array( 'amount' => $fee, 'currency' => 'usd', 'destination' => $site, 'description' => 'DreamScaper Instant Payout fee', 'metadata[dreamscaper_pro]' => $p->user_id ), $p->stripe_acct );
	if ( is_wp_error( $debit ) ) {
		return $debit;
	}
	// 2. the rest, paid out instantly to their debit card
	$po = dreamscaper_stripe_x( 'POST', 'payouts', array( 'amount' => $cents - $fee, 'currency' => 'usd', 'method' => 'instant', 'metadata[dreamscaper_pro]' => $p->user_id ), $p->stripe_acct );
	if ( is_wp_error( $po ) ) {
		dreamscaper_stripe_x( 'POST', 'transfers/' . rawurlencode( $debit['id'] ) . '/reversals', array(), $p->stripe_acct ); // give the fee back
		return $po;
	}
	dreamscaper_crm_log( $p->user_id, 0, 0, 'payment', 'Instant payout: $' . number_format( ( $cents - $fee ) / 100, 2 ) . ' to your debit card (fee $' . number_format( $fee / 100, 2 ) . ')', $p->user_id );
	return array( 'ok' => true, 'paid' => ( $cents - $fee ) / 100, 'fee' => $fee / 100, 'arrives' => 'within about 30 minutes' );
}

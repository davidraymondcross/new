<?php
/**
 * DreamScaper – contractor payments with Stripe Connect (Express accounts, destination charges).
 * The homeowner pays on Stripe Checkout; the money goes to the contractor's Stripe account and
 * the site keeps the optional platform fee (Settings → DreamScaper → Contractor payments).
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
} );

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
			'capabilities[transfers][requested]'      => 'true',
			'metadata[dreamscaper_pro]'               => $p->user_id,
		) );
		if ( is_wp_error( $a ) ) {
			return $a;
		}
		$acct = $a['id'];
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
		return dreamscaper_crm_err( $inv && 'paid' === $inv->status ? 'This invoice is already paid. Thank you!' : 'Invoice not found.', 404 );
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
	$fee   = (int) round( $cents * max( 0, min( 20, (float) dreamscaper_opt( 'connect_fee_pct' ) ) ) / 100 );
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
		'metadata[dreamscaper_invoice]'                  => $inv->id,
		'success_url'                                    => add_query_arg( 'paid', '{CHECKOUT_SESSION_ID}', $url ),
		'cancel_url'                                     => $url,
	);
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
	if ( ! $id || 'paid' !== ( isset( $s['payment_status'] ) ? $s['payment_status'] : '' ) ) {
		return false;
	}
	$I   = dreamscaper_t( 'invoices' );
	$inv = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $I WHERE id=%d", $id ) );
	if ( ! $inv || ( isset( $s['amount_total'] ) && (int) $s['amount_total'] !== (int) round( $inv->amount * 100 ) ) ) {
		return false;
	}
	if ( ! $wpdb->query( $wpdb->prepare( "UPDATE $I SET status='paid', paid_at=%s WHERE id=%d AND status<>'paid'", dreamscaper_now(), $id ) ) ) {
		return true; // already counted
	}
	dreamscaper_crm_log( $inv->pro_id, $inv->client_id, $inv->quote_id, 'payment', 'Paid online: ' . $inv->number . ' ($' . number_format( (float) $inv->amount, 2 ) . ')', 0 );
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

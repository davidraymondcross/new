<?php
/**
 * DreamScaper – public pages and webhooks for the CRM:
 *  ?ds_quote=TOKEN   proposal page: view, choose add-ons, sign electronically or decline
 *  ?ds_invoice=TOKEN invoice page: view and pay (Stripe Checkout)
 *  /crm/sign, /crm/decline   e-signature endpoints (token is the key)
 *  /crm/twilio       inbound texts (replies, STOP/START, new leads by text)
 *  [dreamscaper_quote] lead form for a contractor's website
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

add_action( 'rest_api_init', function () {
	foreach ( array( array( '/crm/sign', 'dreamscaper_crm_sign' ), array( '/crm/decline', 'dreamscaper_crm_decline' ), array( '/crm/twilio', 'dreamscaper_crm_twilio' ) ) as $r ) {
		register_rest_route( 'dreamscaper/v1', $r[0], array( 'methods' => 'POST', 'callback' => $r[1], 'permission_callback' => '__return_true' ) );
	}
} );

function dreamscaper_quote_by_token( $tok ) {
	global $wpdb;
	$tok = preg_replace( '/[^a-z0-9]/', '', strtolower( (string) $tok ) );
	return strlen( $tok ) >= 20 ? $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( 'quotes' ) . ' WHERE token=%s', $tok ) ) : null;
}

/** Fingerprint of exactly what the customer agreed to. */
function dreamscaper_quote_hash( $q ) {
	$d = dreamscaper_json( $q->docs );
	return hash( 'sha256', wp_json_encode( array( $q->number, $q->title, isset( $d['proposal'] ) ? $d['proposal'] : array(), isset( $d['terms'] ) ? $d['terms'] : '', isset( $d['totals']['total'] ) ? $d['totals']['total'] : 0, isset( $d['payments'] ) ? $d['payments'] : array() ) ) );
}

/** Totals for the add-ons a customer ticks (same tax rule as the quote). */
function dreamscaper_addon_total( $docs, $ids ) {
	$sum = 0;
	$tax = isset( $docs['totals']['taxPct'] ) ? (float) $docs['totals']['taxPct'] : 0;
	$on  = isset( $docs['totals']['taxOn'] ) ? $docs['totals']['taxOn'] : 'all';
	$share = array();
	foreach ( isset( $docs['totals']['sections'] ) ? (array) $docs['totals']['sections'] : array() as $s ) {
		$share[ $s['id'] ] = isset( $s['materialShare'] ) ? (float) $s['materialShare'] : 0;
	}
	foreach ( isset( $docs['proposal']['sections'] ) ? $docs['proposal']['sections'] : array() as $s ) {
		if ( ! empty( $s['optional'] ) && in_array( $s['id'], (array) $ids, true ) ) {
			$t    = 'all' === $on ? 1 : ( 'materials' === $on ? ( isset( $share[ $s['id'] ] ) ? $share[ $s['id'] ] : 0 ) : 0 );
			$sum += (float) $s['price'] * ( 1 + $tax / 100 * $t );
		}
	}
	return round( $sum, 2 );
}

function dreamscaper_crm_sign( WP_REST_Request $r ) {
	global $wpdb;
	if ( ! dreamscaper_limit( 'sign', 20, HOUR_IN_SECONDS ) ) {
		return dreamscaper_crm_err( 'Please wait a moment and try again.', 429 );
	}
	$j = $r->get_json_params();
	$q = dreamscaper_quote_by_token( isset( $j['t'] ) ? $j['t'] : '' );
	if ( ! $q ) {
		return dreamscaper_crm_err( 'Proposal not found.', 404 );
	}
	if ( 'signed' === $q->status ) {
		return dreamscaper_crm_err( 'This proposal is already signed.' );
	}
	if ( ! in_array( $q->status, array( 'sent', 'viewed' ), true ) || ( $q->valid_until && $q->valid_until < gmdate( 'Y-m-d' ) ) ) {
		return dreamscaper_crm_err( 'This proposal has expired or was withdrawn. Please contact the contractor for an updated one.' );
	}
	$name = dreamscaper_crm_txt( $j, 'name', 120 );
	if ( strlen( $name ) < 3 || empty( $j['agree'] ) ) {
		return dreamscaper_crm_err( 'Type your full name and tick the box to agree.' );
	}
	$img = isset( $j['signature'] ) ? (string) $j['signature'] : '';
	if ( strlen( $img ) > 700000 || ! dreamscaper_data_image( $img, 500000 ) ) {
		return dreamscaper_crm_err( 'Please draw your signature in the box.' );
	}
	$docs   = dreamscaper_json( $q->docs );
	$opt    = array();
	foreach ( isset( $docs['proposal']['sections'] ) ? $docs['proposal']['sections'] : array() as $s ) {
		if ( ! empty( $s['optional'] ) ) {
			$opt[] = $s['id'];
		}
	}
	$addons = array_values( array_intersect( array_map( 'sanitize_key', (array) ( isset( $j['addons'] ) ? $j['addons'] : array() ) ), $opt ) );
	$extra  = dreamscaper_addon_total( $docs, $addons );
	$url    = dreamscaper_crm_store_image( $img, 500000 );
	$sign   = array(
		'name' => $name, 'image' => $url, 'at' => time(), 'ip' => isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : '',
		'ua' => isset( $_SERVER['HTTP_USER_AGENT'] ) ? mb_substr( sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ) ), 0, 250 ) : '',
		'hash' => dreamscaper_quote_hash( $q ), 'addons' => $addons, 'addon_total' => $extra, 'consent' => 'I agree to the scope, price and terms in this proposal and to sign it electronically.',
		'user' => get_current_user_id(),
	);
	$total = round( (float) $q->total + $extra, 2 );
	if ( $addons ) {
		$dep                         = isset( $docs['totals']['depositPct'] ) ? (float) $docs['totals']['depositPct'] : 0;
		$docs['totals']['signedTotal'] = $total;
		if ( $dep ) {
			$docs['totals']['deposit'] = round( $total * $dep / 100, 2 );
		}
	}
	$ok = $wpdb->query( $wpdb->prepare( 'UPDATE ' . dreamscaper_t( 'quotes' ) . " SET status='signed', signed_at=%s, sign=%s, docs=%s, total=%f, updated=%s WHERE id=%d AND status IN ('sent','viewed')", dreamscaper_now(), wp_json_encode( $sign ), wp_json_encode( $docs ), $total, dreamscaper_now(), $q->id ) );
	if ( ! $ok ) {
		return dreamscaper_crm_err( 'This proposal changed while you were signing. Please reload the page.' );
	}
	$q = dreamscaper_quote_by_token( $q->token );
	$wpdb->update( dreamscaper_t( 'followups' ), array( 'status' => 'cancelled' ), array( 'quote_id' => $q->id, 'status' => 'scheduled' ) );
	$wpdb->update( dreamscaper_t( 'clients' ), array( 'stage' => 'customer', 'updated' => dreamscaper_now() ), array( 'id' => $q->client_id ) );
	if ( get_current_user_id() && ! $q->user_id && (int) $q->pro_id !== get_current_user_id() ) {
		$wpdb->update( dreamscaper_t( 'quotes' ), array( 'user_id' => get_current_user_id() ), array( 'id' => $q->id ) );
	}
	dreamscaper_crm_log( $q->pro_id, $q->client_id, $q->id, 'signed', 'Signed by ' . $name . ( $addons ? ' with ' . count( $addons ) . ' add-on(s)' : '' ) . ' — $' . number_format( $total, 2 ), 0 );
	$p   = dreamscaper_pro_row( $q->pro_id );
	$inv = dreamscaper_crm_deposit_invoice( $q );
	dreamscaper_crm_tell_pro( (int) $q->pro_id, '🎉 Signed! ' . $q->title . ' ($' . number_format( $total, 0 ) . ')', "{$name} signed {$q->number} {$q->title} for $" . number_format( $total, 2 ) . ".\n\nSchedule the job from your Contractor Hub → Jobs.", $q->id );
	$c = dreamscaper_crm_get( 'clients', $q->client_id, $q->pro_id );
	if ( $p && $c && is_email( $c->email ) ) {
		dreamscaper_crm_mail( $p, $c->email, 'Signed: ' . $q->title . ' (' . $q->number . ')', 'Hi ' . preg_split( '/\s+/', $c->name )[0] . ",\n\nThank you! Your signed proposal is saved here for your records." . ( $inv ? "\n\nTo reserve your place on the schedule, the deposit of $" . number_format( (float) $inv->amount, 2 ) . ' is due now.' : '' ) . "\n\n" . ( $p->contact ? $p->contact : $p->business ), array( 'link' => dreamscaper_quote_url( $q->token ), 'button' => 'View signed proposal' ) );
	}
	if ( $q->user_id || ( $c && $c->user_id ) ) {
		dreamscaper_crm_tell_user( $q->user_id ? $q->user_id : $c->user_id, 'You hired ' . ( $p ? $p->business : 'a contractor' ) . ' for ' . $q->title . '. Track it in My Projects.', $q->id );
	}
	return array( 'ok' => true, 'invoice' => $inv ? dreamscaper_invoice_url( $inv->token ) : '', 'pay' => $inv && $p && $p->stripe_ready );
}

function dreamscaper_crm_decline( WP_REST_Request $r ) {
	global $wpdb;
	$j = $r->get_json_params();
	$q = dreamscaper_quote_by_token( isset( $j['t'] ) ? $j['t'] : '' );
	if ( ! $q || ! in_array( $q->status, array( 'sent', 'viewed' ), true ) ) {
		return dreamscaper_crm_err( 'Proposal not found.', 404 );
	}
	$why = dreamscaper_crm_area( $j, 'reason', 1000 );
	$wpdb->update( dreamscaper_t( 'quotes' ), array( 'status' => 'declined', 'updated' => dreamscaper_now() ), array( 'id' => $q->id ) );
	$wpdb->update( dreamscaper_t( 'followups' ), array( 'status' => 'cancelled' ), array( 'quote_id' => $q->id, 'status' => 'scheduled' ) );
	dreamscaper_crm_log( $q->pro_id, $q->client_id, $q->id, 'declined', 'Customer declined' . ( $why ? ': ' . $why : '' ), 0 );
	dreamscaper_crm_tell_pro( (int) $q->pro_id, 'Declined: ' . $q->title, 'The customer declined ' . $q->number . ' ' . $q->title . ( $why ? ".\n\nTheir reason: " . $why : '.' ), $q->id );
	return array( 'ok' => true );
}

/* ------------------------------------------------------------- Twilio */

function dreamscaper_twilio_valid( WP_REST_Request $r ) {
	$token = dreamscaper_opt( 'twilio_token' );
	$sig   = (string) $r->get_header( 'x_twilio_signature' );
	if ( ! $token || ! $sig ) {
		return false;
	}
	$params = $r->get_body_params();
	ksort( $params );
	$data = rest_url( 'dreamscaper/v1/crm/twilio' );
	foreach ( $params as $k => $v ) {
		$data .= $k . $v;
	}
	return hash_equals( base64_encode( hash_hmac( 'sha1', $data, $token, true ) ), $sig );
}

function dreamscaper_crm_twilio( WP_REST_Request $r ) {
	global $wpdb;
	if ( ! dreamscaper_twilio_valid( $r ) ) {
		return new WP_Error( 'dreamscaper', 'Bad signature.', array( 'status' => 403 ) );
	}
	$from = dreamscaper_e164( (string) $r->get_param( 'From' ) );
	$body = trim( sanitize_textarea_field( (string) $r->get_param( 'Body' ) ) );
	$list = get_option( 'dreamscaper_sms_optout', array() );
	$list = is_array( $list ) ? $list : array();
	$word = strtoupper( preg_replace( '/[^a-z]/i', '', $body ) );
	if ( in_array( $word, array( 'STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'OPTOUT' ), true ) ) {
		$list[ md5( $from ) ] = time();
		update_option( 'dreamscaper_sms_optout', $list, false );
	} elseif ( in_array( $word, array( 'START', 'UNSTOP', 'YES' ), true ) ) {
		unset( $list[ md5( $from ) ] );
		update_option( 'dreamscaper_sms_optout', $list, false );
	} elseif ( $from && '' !== $body ) {
		$last10  = substr( preg_replace( '/\D/', '', $from ), -10 );
		$clients = $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( 'clients' ) . " WHERE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone,'-',''),' ',''),'(',''),')',''),'.','') LIKE %s ORDER BY updated DESC LIMIT 5", '%' . $wpdb->esc_like( $last10 ) ) );
		if ( $clients ) {
			foreach ( $clients as $c ) {
				dreamscaper_crm_log( $c->pro_id, $c->id, 0, 'sms_in', 'Text from customer: ' . $body, 0 );
				dreamscaper_crm_tell_pro( (int) $c->pro_id, 'Text from ' . $c->name, $c->name . ' (' . $c->phone . ') texted:' . "\n\n" . $body, $c->id );
			}
		} else {
			// New lead by text → the site owner's business.
			$owner = (int) $wpdb->get_var( 'SELECT p.user_id FROM ' . dreamscaper_t( 'pros' ) . " p WHERE p.status='approved' ORDER BY p.created LIMIT 1" );
			foreach ( get_users( array( 'role' => 'administrator', 'number' => 1, 'fields' => 'ID' ) ) as $admin ) {
				if ( dreamscaper_pro_row( $admin ) ) {
					$owner = (int) $admin;
				}
			}
			if ( $owner ) {
				$ids = dreamscaper_crm_new_lead( $owner, array( 'name' => 'Text lead ' . $from, 'phone' => $from, 'message' => $body ), 'text' );
				dreamscaper_crm_tell_pro( $owner, 'New lead by text: ' . $from, $from . " texted:\n\n" . $body, $ids['client'] );
			}
		}
	}
	header( 'Content-Type: text/xml; charset=utf-8' );
	echo '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
	exit;
}

/* ------------------------------------------------------- public pages */

add_action( 'template_redirect', function () {
	if ( isset( $_GET['ds_quote'] ) ) { // phpcs:ignore
		dreamscaper_quote_page( sanitize_text_field( wp_unslash( $_GET['ds_quote'] ) ) ); // phpcs:ignore
		exit;
	}
	if ( isset( $_GET['ds_invoice'] ) ) { // phpcs:ignore
		dreamscaper_invoice_page( sanitize_text_field( wp_unslash( $_GET['ds_invoice'] ) ) ); // phpcs:ignore
		exit;
	}
} );

function dreamscaper_page_head( $title, $p ) {
	nocache_headers();
	header( 'X-Robots-Tag: noindex, nofollow' );
	header( 'Referrer-Policy: no-referrer' );
	?><!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title><?php echo esc_html( $title ); ?></title>
<style>
:root{--ink:#1d2a22;--muted:#5d6f63;--line:#dfe7e1;--accent:#1f7a46;--bg:#f4f7f5;--card:#fff}
@media (prefers-color-scheme:dark){:root{--ink:#e9f3ec;--muted:#a3b8aa;--line:#2b3d32;--accent:#7be0a0;--bg:#0f1913;--card:#16241b}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 "Segoe UI",Roboto,system-ui,-apple-system,sans-serif}
.w{max-width:860px;margin:0 auto;padding:16px}.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:20px;margin:14px 0}
h1{font-size:26px;margin:4px 0 2px}h2{font-size:19px;margin:0 0 8px}h3{font-size:16px;margin:0}.muted{color:var(--muted)}.sm{font-size:14px}
.head{display:flex;gap:14px;align-items:center;flex-wrap:wrap}.head img{max-height:64px;max-width:180px}.sp{flex:1}
.ba{display:grid;grid-template-columns:1fr 1fr;gap:10px}.ba figure{margin:0}.ba img{width:100%;border-radius:12px;display:block}.ba figcaption{font-size:13px;color:var(--muted);text-align:center;margin-top:4px}
@media(max-width:600px){.ba{grid-template-columns:1fr}}
.sec{border-top:1px solid var(--line);padding:14px 0}.sec:first-child{border-top:0}.row{display:flex;gap:10px;align-items:baseline}.price{font-weight:700;white-space:nowrap}
ul{margin:6px 0 0;padding-left:20px}li{margin:3px 0}.opt{background:rgba(31,122,70,.07);border-radius:12px;padding:12px;margin-top:8px}
.tot{display:grid;grid-template-columns:1fr auto;gap:4px 16px;max-width:360px;margin-left:auto}.tot b{font-size:20px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:0;border-radius:999px;padding:14px 24px;background:var(--accent);color:#fff;font-weight:700;font-size:16px;cursor:pointer;text-decoration:none;min-height:48px}
@media (prefers-color-scheme:dark){.btn{color:#0b2a18}}
.btn.ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}.btn[disabled]{opacity:.5;cursor:default}
input[type=text],textarea{width:100%;padding:12px;border-radius:10px;border:1px solid var(--line);font:inherit;background:var(--card);color:var(--ink)}
canvas{width:100%;height:160px;border:2px dashed var(--line);border-radius:12px;background:#fff;touch-action:none}
.chk{display:flex;gap:10px;align-items:flex-start;margin:12px 0}.chk input{width:22px;height:22px;flex:none;margin-top:2px}
.badge{display:inline-block;padding:3px 10px;border-radius:999px;font-size:13px;font-weight:700;background:rgba(31,122,70,.12);color:var(--accent)}.warn{background:#fdecea;color:#a1260d}
.terms{white-space:pre-line;font-size:14px;color:var(--muted)}.sig img{max-width:280px;background:#fff;border-radius:8px}
.err{color:#c62828;font-weight:600}@media print{.np{display:none!important}body{background:#fff}.card{border:0}}
table{width:100%;border-collapse:collapse}td,th{padding:8px 4px;border-bottom:1px solid var(--line);text-align:left}td.n,th.n{text-align:right}
</style></head><body><div class="w">
<div class="head"><?php if ( $p && $p->logo ) : ?><img src="<?php echo esc_url( $p->logo ); ?>" alt=""><?php endif; ?><div><b><?php echo esc_html( $p ? $p->business : '' ); ?></b><div class="muted sm"><?php echo esc_html( $p ? trim( $p->phone . ( $p->email ? ' · ' . $p->email : '' ) ) : '' ); ?></div></div><div class="sp"></div><button class="btn ghost np" onclick="print()">Print / Save PDF</button></div>
	<?php
}

function dreamscaper_quote_page( $tok ) {
	global $wpdb;
	$q = dreamscaper_quote_by_token( $tok );
	$p = $q ? dreamscaper_pro_row( $q->pro_id ) : null;
	if ( ! $q || ! $p || in_array( $q->status, array( 'draft', 'request' ), true ) ) {
		status_header( 404 );
		dreamscaper_page_head( 'Proposal not found', $p );
		echo '<div class="card"><h1>Proposal not found</h1><p class="muted">This link may be old. Please ask the contractor to send it again.</p></div></div></body></html>';
		return;
	}
	if ( 'sent' === $q->status && (int) $q->pro_id !== get_current_user_id() ) {
		$wpdb->update( dreamscaper_t( 'quotes' ), array( 'status' => 'viewed', 'viewed_at' => dreamscaper_now() ), array( 'id' => $q->id, 'status' => 'sent' ) );
		dreamscaper_crm_log( $q->pro_id, $q->client_id, $q->id, 'viewed', 'Customer opened the proposal', 0 );
		dreamscaper_crm_tell_pro( (int) $q->pro_id, '👀 Viewed: ' . $q->title, 'Your customer just opened proposal ' . $q->number . ' ' . $q->title . '. A quick call now is often well-timed.', $q->id );
		$q->status = 'viewed';
	}
	$docs  = dreamscaper_json( $q->docs );
	$des   = dreamscaper_json( $q->design );
	$sign  = dreamscaper_json( $q->sign );
	$c     = dreamscaper_crm_get( 'clients', $q->client_id, $q->pro_id );
	$prop  = $q->prop_id ? dreamscaper_crm_get( 'props', $q->prop_id, $q->pro_id ) : null;
	$t     = isset( $docs['totals'] ) ? $docs['totals'] : array();
	$money = function ( $v ) {
		return '$' . number_format( (float) $v, 2 );
	};
	$show  = isset( $docs['proposal']['showPrices'] ) ? $docs['proposal']['showPrices'] : 'section';
	$open  = in_array( $q->status, array( 'sent', 'viewed' ), true ) && ( ! $q->valid_until || $q->valid_until >= gmdate( 'Y-m-d' ) );
	dreamscaper_page_head( $q->title . ' – ' . $p->business, $p );
	?>
	<div class="card">
		<div class="row"><span class="muted sm">Proposal <?php echo esc_html( $q->number ); ?> · <?php echo esc_html( wp_date( 'F j, Y', strtotime( ( $q->sent_at ? $q->sent_at : $q->created ) . ' UTC' ) ) ); ?></span><span class="sp"></span>
		<?php
		$labels = array( 'signed' => 'Signed', 'declined' => 'Declined', 'expired' => 'Expired', 'viewed' => 'Awaiting your approval', 'sent' => 'Awaiting your approval' );
		echo '<span class="badge' . ( in_array( $q->status, array( 'declined', 'expired' ), true ) ? ' warn' : '' ) . '">' . esc_html( isset( $labels[ $q->status ] ) ? $labels[ $q->status ] : $q->status ) . '</span>';
		?>
		</div>
		<h1><?php echo esc_html( $q->title ); ?></h1>
		<p class="muted"><?php echo esc_html( trim( ( $c ? 'Prepared for ' . $c->name : '' ) . ( $prop && $prop->address ? ' · ' . $prop->address : ( $c && $c->address ? ' · ' . $c->address . ', ' . $c->town : '' ) ) ) ); ?><?php echo $q->valid_until ? '<br>Pricing good until ' . esc_html( wp_date( 'F j, Y', strtotime( $q->valid_until ) ) ) : ''; ?></p>
		<?php if ( ! empty( $docs['intro'] ) ) : ?><p><?php echo nl2br( esc_html( $docs['intro'] ) ); ?></p><?php endif; ?>
		<?php if ( ! empty( $des['after'] ) ) : ?>
		<div class="ba"><?php if ( ! empty( $des['before'] ) ) : ?><figure><img src="<?php echo esc_url( $des['before'] ); ?>" alt="Before"><figcaption>Before</figcaption></figure><?php endif; ?><figure><img src="<?php echo esc_url( $des['after'] ); ?>" alt="Your design"><figcaption>Your design</figcaption></figure></div>
		<?php endif; ?>
	</div>
	<div class="card"><h2>Scope of work</h2><p class="muted sm">Exactly what we will do. Anything not listed is not included.</p>
	<?php foreach ( isset( $docs['proposal']['sections'] ) ? $docs['proposal']['sections'] : array() as $s ) : ?>
		<div class="sec<?php echo ! empty( $s['optional'] ) ? ' opt' : ''; ?>">
			<div class="row"><h3><?php echo ! empty( $s['optional'] ) ? ( $open ? '<label><input type="checkbox" class="addon" value="' . esc_attr( $s['id'] ) . '" data-price="' . esc_attr( $s['price'] ) . '"> ' : '' ) . 'Optional: ' : ''; ?><?php echo esc_html( $s['title'] ); ?><?php echo ! empty( $s['optional'] ) && $open ? '</label>' : ''; ?></h3><span class="sp"></span><?php if ( 'section' === $show || ! empty( $s['optional'] ) ) : ?><span class="price"><?php echo esc_html( $money( $s['price'] ) ); ?></span><?php endif; ?></div>
			<ul><?php foreach ( (array) $s['scope'] as $line ) : ?><li><?php echo esc_html( ltrim( $line, '• ' ) ); ?></li><?php endforeach; ?></ul>
		</div>
	<?php endforeach; ?>
	<div class="tot" style="margin-top:12px">
		<span>Subtotal</span><span class="n"><?php echo esc_html( $money( isset( $t['price'] ) ? $t['price'] : 0 ) ); ?></span>
		<?php if ( ! empty( $t['tax'] ) ) : ?><span>Sales tax (<?php echo esc_html( isset( $t['taxPct'] ) ? $t['taxPct'] : '' ); ?>%)</span><span class="n"><?php echo esc_html( $money( $t['tax'] ) ); ?></span><?php endif; ?>
		<span id="addrow" hidden>Add-ons (incl. tax)</span><span id="addv" class="n" hidden></span>
		<b>Total</b><b class="n" id="total" data-base="<?php echo esc_attr( isset( $t['total'] ) ? $t['total'] : 0 ); ?>"><?php echo esc_html( $money( 'signed' === $q->status ? $q->total : ( isset( $t['total'] ) ? $t['total'] : 0 ) ) ); ?></b>
		<?php if ( ! empty( $t['deposit'] ) ) : ?><span class="muted">Deposit to schedule (<?php echo esc_html( isset( $t['depositPct'] ) ? $t['depositPct'] : '' ); ?>%)</span><span class="muted n" id="dep" data-pct="<?php echo esc_attr( isset( $t['depositPct'] ) ? $t['depositPct'] : 0 ); ?>"><?php echo esc_html( $money( $t['deposit'] ) ); ?></span><?php endif; ?>
	</div>
	<?php if ( ! empty( $docs['payments'] ) ) : ?><h3 style="margin-top:16px">Payment schedule</h3><ul><?php foreach ( (array) $docs['payments'] as $pay ) : ?><li><?php echo esc_html( ( isset( $pay['label'] ) ? $pay['label'] : '' ) . ( isset( $pay['pct'] ) ? ' – ' . $pay['pct'] . '%' : '' ) . ( isset( $pay['when'] ) ? ' ' . $pay['when'] : '' ) ); ?></li><?php endforeach; ?></ul><?php endif; ?>
	</div>
	<?php if ( ! empty( $docs['terms'] ) ) : ?><div class="card"><h2>Terms</h2><div class="terms"><?php echo esc_html( $docs['terms'] ); ?></div></div><?php endif; ?>
	<div class="card" id="signbox">
	<?php if ( 'signed' === $q->status ) : ?>
		<h2>✅ Signed</h2>
		<p>Signed by <b><?php echo esc_html( $sign['name'] ); ?></b> on <?php echo esc_html( wp_date( 'F j, Y \a\t g:i a', (int) $sign['at'] ) ); ?>.</p>
		<?php if ( ! empty( $sign['image'] ) ) : ?><p class="sig"><img src="<?php echo esc_url( $sign['image'] ); ?>" alt="Signature"></p><?php endif; ?>
		<p class="muted sm">Electronic signature record: IP <?php echo esc_html( $sign['ip'] ); ?> · document fingerprint <?php echo esc_html( substr( $sign['hash'], 0, 16 ) ); ?>…</p>
		<?php
		$dep = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( 'invoices' ) . " WHERE quote_id=%d AND kind='deposit' AND status='sent'", $q->id ) );
		if ( $dep ) {
			echo '<p><a class="btn np" href="' . esc_url( dreamscaper_invoice_url( $dep->token ) ) . '">' . ( $p->stripe_ready ? 'Pay deposit ' : 'View deposit invoice ' ) . esc_html( $money( $dep->amount ) ) . '</a></p>';
		}
		?>
	<?php elseif ( $open ) : ?>
		<h2>Approve &amp; sign</h2>
		<label for="nm">Your full name</label>
		<input type="text" id="nm" autocomplete="name" value="<?php echo esc_attr( $c ? $c->name : '' ); ?>">
		<p style="margin:14px 0 6px">Draw your signature <button class="btn ghost np" style="padding:4px 12px;min-height:0;font-size:13px" onclick="clr()">Clear</button></p>
		<canvas id="pad" aria-label="Signature box"></canvas>
		<label class="chk"><input type="checkbox" id="ag"> <span>I agree to the scope, price and terms in this proposal and to sign it electronically. I understand my electronic signature is legally binding, the same as signing on paper.</span></label>
		<p id="msg" class="err" role="alert"></p>
		<div class="row np" style="flex-wrap:wrap;gap:10px"><button class="btn" id="go">Approve &amp; sign</button><button class="btn ghost" id="no">Decline</button></div>
	<?php else : ?>
		<h2><?php echo 'declined' === $q->status ? 'This proposal was declined' : 'This proposal has expired'; ?></h2>
		<p class="muted">Want to go ahead? Contact <?php echo esc_html( $p->business ); ?><?php echo $p->phone ? ' at ' . esc_html( $p->phone ) : ''; ?> for an updated proposal.</p>
	<?php endif; ?>
	</div>
	<p class="muted sm" style="text-align:center">Powered by DreamScaper</p>
	</div>
	<?php if ( $open ) : ?>
	<script>
	(function(){
		var api=<?php echo wp_json_encode( esc_url_raw( rest_url( 'dreamscaper/v1/' ) ) ); ?>, tok=<?php echo wp_json_encode( $q->token ); ?>;
		var c=document.getElementById('pad'), x=c.getContext('2d'), drawn=false, last=null;
		function size(){var r=c.getBoundingClientRect(), d=window.devicePixelRatio||1; c.width=r.width*d; c.height=r.height*d; x.scale(d,d); x.lineWidth=2.4; x.lineCap='round'; x.lineJoin='round'; x.strokeStyle='#111';}
		size(); window.clr=function(){x.clearRect(0,0,c.width,c.height); drawn=false;};
		function pt(e){var r=c.getBoundingClientRect(); return [e.clientX-r.left, e.clientY-r.top];}
		c.addEventListener('pointerdown',function(e){c.setPointerCapture(e.pointerId); last=pt(e);});
		c.addEventListener('pointermove',function(e){if(!last)return; var p=pt(e); x.beginPath(); x.moveTo(last[0],last[1]); x.lineTo(p[0],p[1]); x.stroke(); last=p; drawn=true;});
		c.addEventListener('pointerup',function(){last=null;});
		var money=function(v){return '$'+v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});};
		var tax=<?php echo wp_json_encode( array( 'pct' => isset( $t['taxPct'] ) ? (float) $t['taxPct'] : 0, 'on' => isset( $t['taxOn'] ) ? $t['taxOn'] : 'all' ) ); ?>;
		function addons(){var s=0, ids=[]; document.querySelectorAll('.addon:checked').forEach(function(b){ids.push(b.value); s+=parseFloat(b.dataset.price)*(1+(tax.on==='all'?tax.pct/100:0));}); return {s:Math.round(s*100)/100, ids:ids};}
		document.querySelectorAll('.addon').forEach(function(b){b.addEventListener('change',function(){var a=addons(), base=parseFloat(document.getElementById('total').dataset.base); document.getElementById('addrow').hidden=document.getElementById('addv').hidden=!a.s; document.getElementById('addv').textContent=money(a.s); document.getElementById('total').textContent=money(base+a.s); var d=document.getElementById('dep'); if(d){d.textContent=money((base+a.s)*parseFloat(d.dataset.pct)/100);}});});
		var msg=document.getElementById('msg');
		function post(path,body){return fetch(api+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),credentials:'same-origin'}).then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.message||'Something went wrong.');return j;});});}
		document.getElementById('go').onclick=function(){
			var nm=document.getElementById('nm').value.trim();
			if(nm.length<3){msg.textContent='Please type your full name.';return;}
			if(!drawn){msg.textContent='Please draw your signature in the box.';return;}
			if(!document.getElementById('ag').checked){msg.textContent='Please tick the box to agree.';return;}
			this.disabled=true; msg.textContent='';
			var out=document.createElement('canvas'); out.width=600; out.height=Math.round(600*c.height/c.width); var o=out.getContext('2d'); o.fillStyle='#fff'; o.fillRect(0,0,out.width,out.height); o.drawImage(c,0,0,out.width,out.height);
			post('crm/sign',{t:tok,name:nm,agree:true,signature:out.toDataURL('image/png'),addons:addons().ids}).then(function(j){ if(j.invoice&&j.pay){location.href=j.invoice;} else {location.reload();} }).catch(function(e){msg.textContent=e.message; document.getElementById('go').disabled=false;});
		};
		document.getElementById('no').onclick=function(){var why=prompt('Sorry to hear that. Could you tell us why? (optional)'); if(why===null)return; post('crm/decline',{t:tok,reason:why}).then(function(){location.reload();}).catch(function(e){msg.textContent=e.message;});};
	})();
	</script>
	<?php endif; ?>
	</body></html>
	<?php
}

function dreamscaper_invoice_page( $tok ) {
	global $wpdb;
	$tok = preg_replace( '/[^a-z0-9]/', '', strtolower( (string) $tok ) );
	$inv = strlen( $tok ) >= 20 ? $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( 'invoices' ) . ' WHERE token=%s', $tok ) ) : null;
	$p   = $inv ? dreamscaper_pro_row( $inv->pro_id ) : null;
	if ( $inv && ! empty( $_GET['paid'] ) && 'sent' === $inv->status && dreamscaper_opt( 'stripe_secret' ) ) { // phpcs:ignore
		$sid = preg_replace( '/[^A-Za-z0-9_]/', '', wp_unslash( $_GET['paid'] ) ); // phpcs:ignore
		if ( $sid && $sid === $inv->stripe_session ) {
			$s = dreamscaper_stripe( 'GET', 'checkout/sessions/' . rawurlencode( $sid ) );
			if ( ! is_wp_error( $s ) ) {
				dreamscaper_crm_invoice_paid( $s );
				$inv = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( 'invoices' ) . ' WHERE id=%d', $inv->id ) );
			}
		}
	}
	if ( ! $inv || ! $p || 'draft' === $inv->status ) {
		status_header( 404 );
		dreamscaper_page_head( 'Invoice not found', $p );
		echo '<div class="card"><h1>Invoice not found</h1></div></div></body></html>';
		return;
	}
	$c     = dreamscaper_crm_get( 'clients', $inv->client_id, $inv->pro_id );
	$money = function ( $v ) {
		return '$' . number_format( (float) $v, 2 );
	};
	dreamscaper_page_head( 'Invoice ' . $inv->number . ' – ' . $p->business, $p );
	?>
	<div class="card">
		<div class="row"><span class="muted sm">Invoice <?php echo esc_html( $inv->number ); ?> · <?php echo esc_html( wp_date( 'F j, Y', strtotime( $inv->created . ' UTC' ) ) ); ?></span><span class="sp"></span><span class="badge<?php echo 'void' === $inv->status ? ' warn' : ''; ?>"><?php echo esc_html( 'paid' === $inv->status ? 'Paid' : ( 'void' === $inv->status ? 'Void' : 'Due ' . ( $inv->due ? wp_date( 'M j', strtotime( $inv->due ) ) : 'now' ) ) ); ?></span></div>
		<h1><?php echo esc_html( $inv->title ); ?></h1>
		<p class="muted"><?php echo esc_html( $c ? 'Bill to: ' . $c->name . ( $c->address ? ', ' . $c->address . ' ' . $c->town : '' ) : '' ); ?></p>
		<table><thead><tr><th>Description</th><th class="n">Qty</th><th class="n">Rate</th><th class="n">Amount</th></tr></thead><tbody>
		<?php foreach ( dreamscaper_json( $inv->items ) as $it ) : ?>
			<tr><td><?php echo esc_html( $it['name'] ); ?></td><td class="n"><?php echo esc_html( $it['qty'] ); ?></td><td class="n"><?php echo esc_html( $money( $it['rate'] ) ); ?></td><td class="n"><?php echo esc_html( $money( $it['qty'] * $it['rate'] ) ); ?></td></tr>
		<?php endforeach; ?>
		</tbody></table>
		<div class="tot" style="margin-top:12px"><b>Total</b><b class="n"><?php echo esc_html( $money( $inv->amount ) ); ?></b></div>
		<?php if ( 'paid' === $inv->status ) : ?>
			<p><span class="badge">✅ Paid <?php echo esc_html( wp_date( 'F j, Y', strtotime( $inv->paid_at . ' UTC' ) ) ); ?></span> Thank you!</p>
		<?php elseif ( 'sent' === $inv->status && $p->stripe_ready ) : ?>
			<p class="np"><button class="btn" id="pay">Pay <?php echo esc_html( $money( $inv->amount ) ); ?> securely</button></p>
			<p class="muted sm np">Card, Apple Pay or Google Pay through Stripe. <?php echo esc_html( $p->business ); ?> receives your payment directly.</p><p id="msg" class="err"></p>
			<script>document.getElementById('pay').onclick=function(){var b=this;b.disabled=true;fetch(<?php echo wp_json_encode( esc_url_raw( rest_url( 'dreamscaper/v1/crm/pay' ) ) ); ?>,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({t:<?php echo wp_json_encode( $inv->token ); ?>})}).then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.message);location.href=j.url;});}).catch(function(e){document.getElementById('msg').textContent=e.message;b.disabled=false;});};</script>
		<?php elseif ( 'sent' === $inv->status ) : ?>
			<p class="muted">Please pay <?php echo esc_html( $p->business ); ?> directly<?php echo $p->phone ? ' (' . esc_html( $p->phone ) . ')' : ''; ?>.</p>
		<?php endif; ?>
	</div></div></body></html>
	<?php
}

/* ------------------------------------------------ website lead form */

/** [dreamscaper_quote pro="USER_ID" title="Get a free quote"] */
add_shortcode( 'dreamscaper_quote', function ( $atts ) {
	global $wpdb;
	if ( ! dreamscaper_crm_on() ) {
		return '';
	}
	$a   = shortcode_atts( array( 'pro' => 0, 'title' => 'Get a free design & quote' ), $atts, 'dreamscaper_quote' );
	$pro = (int) $a['pro'];
	if ( ! $pro ) {
		$pro = (int) $wpdb->get_var( 'SELECT p.user_id FROM ' . dreamscaper_t( 'pros' ) . ' p INNER JOIN ' . $wpdb->usermeta . " m ON m.user_id=p.user_id AND m.meta_key='" . $wpdb->prefix . "capabilities' AND m.meta_value LIKE '%administrator%' WHERE p.status='approved' ORDER BY p.created LIMIT 1" );
	}
	if ( ! $pro ) {
		return '';
	}
	$id  = 'dsq' . wp_rand( 1000, 9999 );
	$app = dreamscaper_app_url( array( 'ds_pro' => $pro ) );
	ob_start();
	?>
	<form id="<?php echo esc_attr( $id ); ?>" class="dsq-form" style="max-width:560px;margin:20px auto;padding:22px;border-radius:18px;background:#f4f7f5;border:1px solid #dfe7e1;font:16px/1.5 system-ui,sans-serif;color:#1d2a22">
		<h3 style="margin:0 0 6px"><?php echo esc_html( $a['title'] ); ?></h3>
		<p style="margin:0 0 14px;color:#5d6f63">Start with your address. We’ll walk you through a few photos of your yard so your design and quote are accurate.</p>
		<?php foreach ( array( array( 'address', 'Property address', 'street-address' ), array( 'town', 'Town', 'address-level2' ), array( 'name', 'Your name', 'name' ), array( 'email', 'Email', 'email' ), array( 'phone', 'Phone', 'tel' ) ) as $fld ) : ?>
			<label style="display:block;margin:8px 0 2px;font-weight:600"><?php echo esc_html( $fld[1] ); ?></label><input name="<?php echo esc_attr( $fld[0] ); ?>" autocomplete="<?php echo esc_attr( $fld[2] ); ?>" style="width:100%;padding:12px;border-radius:10px;border:1px solid #cfd9d2;font:inherit" <?php echo in_array( $fld[0], array( 'name', 'address' ), true ) ? 'required' : ''; ?>>
		<?php endforeach; ?>
		<label style="display:block;margin:8px 0 2px;font-weight:600">What would you like done?</label><textarea name="message" rows="3" style="width:100%;padding:12px;border-radius:10px;border:1px solid #cfd9d2;font:inherit"></textarea>
		<input name="hp" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
		<p style="display:flex;gap:10px;flex-wrap:wrap;margin:16px 0 0"><button type="submit" style="border:0;border-radius:999px;padding:14px 22px;background:#1f7a46;color:#fff;font-weight:700;font-size:16px;cursor:pointer">Request my quote</button>
		<a href="<?php echo esc_url( $app ); ?>" style="border-radius:999px;padding:14px 22px;border:1px solid #1f7a46;color:#1f7a46;font-weight:700;text-decoration:none">🎨 Design it with DreamScaper first</a></p>
		<p class="dsq-msg" role="status" style="margin:12px 0 0;font-weight:600"></p>
	</form>
	<script>(function(){var f=document.getElementById(<?php echo wp_json_encode( $id ); ?>);f.addEventListener('submit',function(e){e.preventDefault();var d=Object.fromEntries(new FormData(f));d.pro=<?php echo (int) $pro; ?>;d.source='website';var m=f.querySelector('.dsq-msg');m.textContent='Sending…';fetch(<?php echo wp_json_encode( esc_url_raw( rest_url( 'dreamscaper/v1/crm/lead' ) ) ); ?>,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)}).then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.message);m.textContent='Thank you! We’ll be in touch shortly.';f.reset();});}).catch(function(e){m.textContent=e.message;});});})();</script>
	<?php
	return ob_get_clean();
} );

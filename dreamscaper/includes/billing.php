<?php
/**
 * DreamScaper – buying extra AI credits with Stripe Checkout.
 * Customers pick a pack (or a custom number of credits), pay on Stripe's hosted page
 * (cards, Apple Pay, Google Pay, Link), and credits are added when Stripe confirms payment
 * — by webhook, and again on return as a backup. Each payment is only ever counted once.
 * Purchased credits never expire and are used after the daily free credits.
 * The same flow sells extra online storage (one-time, never expires): it raises the
 * customer's server-side quota as soon as the payment is confirmed.
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** Packs from settings: lines like "Starter | 20 | 4.99". */
function dreamscaper_shop_packs( $key = 'shop_packs' ) {
	$out = array();
	foreach ( preg_split( '/\r?\n/', (string) dreamscaper_opt( $key ) ) as $i => $line ) {
		$p = array_map( 'trim', explode( '|', $line ) );
		if ( count( $p ) < 3 || (int) $p[1] < 1 || (float) $p[2] <= 0 ) {
			continue;
		}
		$out[] = array( 'id' => 'p' . $i, 'name' => sanitize_text_field( $p[0] ), 'credits' => (int) $p[1], 'price' => round( (float) $p[2], 2 ) );
	}
	return $out;
}

function dreamscaper_shop_enabled() {
	return dreamscaper_opt( 'shop_on' ) && dreamscaper_opt( 'stripe_secret' ) && dreamscaper_opt( 'bfl_key' );
}

/** What the app needs to show the store. */
function dreamscaper_shop_public() {
	if ( ! dreamscaper_shop_enabled() ) {
		return null;
	}
	$packs = dreamscaper_shop_packs();
	$best  = null;
	foreach ( $packs as $p ) {
		$per = $p['price'] / $p['credits'];
		if ( null === $best || $per < $best ) {
			$best = $per;
		}
	}
	return array(
		'packs'    => $packs,
		'each'     => (float) dreamscaper_opt( 'shop_each' ),
		'min'      => max( 1, (int) dreamscaper_opt( 'shop_min' ) ),
		'max'      => 500,
		'currency' => 'usd',
	);
}

/** Storage packs: same format, the number is megabytes. */
function dreamscaper_storage_shop() {
	if ( ! dreamscaper_opt( 'storage_on' ) || ! dreamscaper_opt( 'stripe_secret' ) || ! (int) dreamscaper_opt( 'cloud_mb' ) ) {
		return null;
	}
	$out = array();
	foreach ( dreamscaper_shop_packs( 'storage_packs' ) as $p ) {
		$out[] = array( 'id' => 's' . substr( $p['id'], 1 ), 'name' => $p['name'], 'mb' => $p['credits'], 'price' => $p['price'] );
	}
	return $out ? array( 'packs' => $out ) : null;
}

add_action( 'rest_api_init', function () {
	register_rest_route( 'dreamscaper/v1', '/credits/checkout', array(
		'methods'             => 'POST',
		'callback'            => 'dreamscaper_rest_checkout',
		'permission_callback' => function () {
			return is_user_logged_in();
		},
	) );
	register_rest_route( 'dreamscaper/v1', '/credits/confirm', array(
		'methods'             => 'POST',
		'callback'            => 'dreamscaper_rest_confirm',
		'permission_callback' => function () {
			return is_user_logged_in();
		},
	) );
	register_rest_route( 'dreamscaper/v1', '/stripe', array(
		'methods'             => 'POST',
		'callback'            => 'dreamscaper_rest_stripe_webhook',
		'permission_callback' => '__return_true',
	) );
} );

function dreamscaper_stripe( $method, $path, $body = array() ) {
	$res  = wp_remote_request( 'https://api.stripe.com/v1/' . $path, array(
		'method'  => $method,
		'timeout' => 25,
		'headers' => array( 'Authorization' => 'Bearer ' . dreamscaper_opt( 'stripe_secret' ), 'Stripe-Version' => '2024-06-20' ),
		'body'    => $body ? $body : null,
	) );
	$code = is_wp_error( $res ) ? 0 : wp_remote_retrieve_response_code( $res );
	$j    = is_wp_error( $res ) ? null : json_decode( wp_remote_retrieve_body( $res ), true );
	if ( $code < 200 || $code >= 300 || ! is_array( $j ) ) {
		return new WP_Error( 'dreamscaper', 'Payments are unavailable right now. Please try again later.', array( 'status' => 502 ) );
	}
	return $j;
}

/** Start a Stripe Checkout for a pack or a custom number of credits. */
function dreamscaper_rest_checkout( WP_REST_Request $r ) {
	$j = $r->get_json_params();
	if ( isset( $j['storage'] ) ) {
		return dreamscaper_rest_storage_checkout( $j );
	}
	$shop = dreamscaper_shop_public();
	if ( ! $shop ) {
		return new WP_Error( 'dreamscaper', 'Buying credits isn’t available yet.', array( 'status' => 503 ) );
	}
	if ( ! dreamscaper_limit( 'buy', 20, HOUR_IN_SECONDS ) ) {
		return new WP_Error( 'dreamscaper', 'Please wait a bit and try again.', array( 'status' => 429 ) );
	}
	$pack = null;
	foreach ( $shop['packs'] as $p ) {
		if ( isset( $j['pack'] ) && $p['id'] === $j['pack'] ) {
			$pack = $p;
		}
	}
	if ( $pack ) {
		$credits = $pack['credits'];
		$cents   = (int) round( $pack['price'] * 100 );
		$label   = $pack['name'] . ' pack – ' . $credits . ' Dreamscape AI credits';
	} else {
		$credits = (int) ( isset( $j['credits'] ) ? $j['credits'] : 0 );
		if ( $shop['each'] <= 0 || $credits < $shop['min'] || $credits > $shop['max'] ) {
			return new WP_Error( 'dreamscaper', 'Choose between ' . $shop['min'] . ' and ' . $shop['max'] . ' credits.', array( 'status' => 400 ) );
		}
		$cents = (int) round( $shop['each'] * 100 * $credits );
		$label = $credits . ' Dreamscape AI credits';
	}
	return dreamscaper_stripe_session( $j, $cents, $label, 'Credits never expire. Used after your free daily credits.', array( 'dreamscaper_credits' => $credits ) );
}

/** Start a Stripe Checkout for a storage pack. */
function dreamscaper_rest_storage_checkout( $j ) {
	$shop = dreamscaper_storage_shop();
	if ( ! $shop ) {
		return new WP_Error( 'dreamscaper', 'Buying storage isn’t available yet.', array( 'status' => 503 ) );
	}
	if ( ! dreamscaper_limit( 'buy', 20, HOUR_IN_SECONDS ) ) {
		return new WP_Error( 'dreamscaper', 'Please wait a bit and try again.', array( 'status' => 429 ) );
	}
	foreach ( $shop['packs'] as $p ) {
		if ( $p['id'] === $j['storage'] ) {
			$size = $p['mb'] >= 1024 ? round( $p['mb'] / 1024, 1 ) . ' GB' : $p['mb'] . ' MB';
			return dreamscaper_stripe_session( $j, (int) round( $p['price'] * 100 ), $p['name'] . ' – ' . $size . ' extra DreamScaper storage', 'One-time purchase. Never expires.', array( 'dreamscaper_storage_mb' => $p['mb'] ) );
		}
	}
	return new WP_Error( 'dreamscaper', 'Please choose a storage pack.', array( 'status' => 400 ) );
}

/** Create the hosted Checkout page and return its URL. */
function dreamscaper_stripe_session( $j, $cents, $label, $desc, $meta ) {
	if ( $cents < 50 ) {
		return new WP_Error( 'dreamscaper', 'The minimum purchase is $0.50.', array( 'status' => 400 ) );
	}
	$return = isset( $j['return'] ) ? esc_url_raw( $j['return'] ) : home_url( '/' );
	$return = wp_validate_redirect( $return, home_url( '/' ) );
	$return = remove_query_arg( array( 'ds_paid', 'ds_cancel' ), preg_replace( '/#.*$/', '', $return ) );
	$u      = wp_get_current_user();
	$body   = array(
		'mode'                                                 => 'payment',
		'success_url'                                          => add_query_arg( 'ds_paid', '{CHECKOUT_SESSION_ID}', $return ) . '#dreamscaper',
		'cancel_url'                                           => add_query_arg( 'ds_cancel', '1', $return ) . '#dreamscaper',
		'client_reference_id'                                  => (string) $u->ID,
		'customer_email'                                       => is_email( $u->user_email ) && ! preg_match( '/invalid$/', $u->user_email ) ? $u->user_email : null,
		'line_items[0][quantity]'                              => 1,
		'line_items[0][price_data][currency]'                  => 'usd',
		'line_items[0][price_data][unit_amount]'               => $cents,
		'line_items[0][price_data][product_data][name]'        => $label,
		'line_items[0][price_data][product_data][description]' => $desc,
		'metadata[dreamscaper_user]'                           => $u->ID,
		'payment_intent_data[description]'                     => $label . ' (' . dreamscaper_opt( 'brand' ) . ')',
	);
	foreach ( $meta as $k => $v ) {
		$body[ 'metadata[' . $k . ']' ] = $v;
	}
	$s = dreamscaper_stripe( 'POST', 'checkout/sessions', $body );
	if ( is_wp_error( $s ) ) {
		return $s;
	}
	return array( 'url' => $s['url'] );
}

/** Add credits for a paid Checkout session exactly once. */
function dreamscaper_credit_session( $s ) {
	if ( empty( $s['id'] ) || 'paid' !== ( isset( $s['payment_status'] ) ? $s['payment_status'] : '' ) ) {
		return 0;
	}
	$uid     = (int) ( isset( $s['metadata']['dreamscaper_user'] ) ? $s['metadata']['dreamscaper_user'] : ( isset( $s['client_reference_id'] ) ? $s['client_reference_id'] : 0 ) );
	$credits = (int) ( isset( $s['metadata']['dreamscaper_credits'] ) ? $s['metadata']['dreamscaper_credits'] : 0 );
	$mb      = (int) ( isset( $s['metadata']['dreamscaper_storage_mb'] ) ? $s['metadata']['dreamscaper_storage_mb'] : 0 );
	if ( ! $uid || ( $credits < 1 && $mb < 1 ) || ! get_userdata( $uid ) ) {
		return 0;
	}
	$key = 'dscp_paid_' . md5( $s['id'] );
	if ( ! add_option( $key, time(), '', false ) ) {
		return 0; // already counted
	}
	if ( $credits ) {
		update_user_meta( $uid, 'dscp_ai_bought', dreamscaper_ai_bought( $uid ) + $credits );
		$what = $credits . ' AI credits';
	} else {
		update_user_meta( $uid, 'dscp_storage_mb', (int) get_user_meta( $uid, 'dscp_storage_mb', true ) + $mb );
		$what = $mb . ' MB of extra storage';
	}
	$amount = isset( $s['amount_total'] ) ? $s['amount_total'] / 100 : 0;
	$log    = get_user_meta( $uid, 'dscp_purchases', true );
	$log    = is_array( $log ) ? $log : array();
	$log[]  = array( 'at' => time(), 'credits' => $credits, 'mb' => $mb, 'amount' => $amount, 'session' => $s['id'] );
	update_user_meta( $uid, 'dscp_purchases', array_slice( $log, -50 ) );
	if ( dreamscaper_opt( 'notify_email' ) && dreamscaper_opt( 'shop_notify' ) ) {
		$p = dreamscaper_profile( $uid );
		wp_mail( dreamscaper_opt( 'notify_email' ), 'DreamScaper purchase: ' . $p['name'], "{$p['name']} ({$p['email']}) bought {$what} for $" . number_format( $amount, 2 ) . '.' );
	}
	return $credits ? $credits : $mb;
}

/** Backup to the webhook: the app confirms the session when the customer comes back. */
function dreamscaper_rest_confirm( WP_REST_Request $r ) {
	$id = sanitize_text_field( (string) $r->get_param( 'session' ) );
	if ( ! preg_match( '/^cs_[A-Za-z0-9_]+$/', $id ) ) {
		return new WP_Error( 'dreamscaper', 'Unknown payment.', array( 'status' => 400 ) );
	}
	$s = dreamscaper_stripe( 'GET', 'checkout/sessions/' . $id );
	if ( is_wp_error( $s ) ) {
		return $s;
	}
	$uid = get_current_user_id();
	if ( (int) ( isset( $s['metadata']['dreamscaper_user'] ) ? $s['metadata']['dreamscaper_user'] : 0 ) !== $uid ) {
		return new WP_Error( 'dreamscaper', 'That payment belongs to another account.', array( 'status' => 403 ) );
	}
	$added = dreamscaper_credit_session( $s );
	return array(
		'paid'    => 'paid' === $s['payment_status'],
		'added'   => $added,
		'credits' => (int) ( isset( $s['metadata']['dreamscaper_credits'] ) ? $s['metadata']['dreamscaper_credits'] : 0 ),
		'mb'      => (int) ( isset( $s['metadata']['dreamscaper_storage_mb'] ) ? $s['metadata']['dreamscaper_storage_mb'] : 0 ),
		'ai'      => dreamscaper_ai_status( $uid ),
		'storage' => dreamscaper_storage_status( $uid ),
	);
}

/** Stripe webhook: checkout.session.completed (signature verified). */
function dreamscaper_rest_stripe_webhook( WP_REST_Request $r ) {
	$secret  = dreamscaper_opt( 'stripe_webhook' );
	$payload = $r->get_body();
	$sig     = (string) $r->get_header( 'stripe-signature' );
	if ( ! $secret || ! $sig ) {
		return new WP_Error( 'dreamscaper', 'Not configured.', array( 'status' => 400 ) );
	}
	$t  = '';
	$v1 = array();
	foreach ( explode( ',', $sig ) as $part ) {
		$kv = explode( '=', trim( $part ), 2 );
		if ( 2 !== count( $kv ) ) {
			continue;
		}
		if ( 't' === $kv[0] ) {
			$t = $kv[1];
		} elseif ( 'v1' === $kv[0] ) {
			$v1[] = $kv[1];
		}
	}
	$expected = hash_hmac( 'sha256', $t . '.' . $payload, $secret );
	$ok       = false;
	foreach ( $v1 as $s ) {
		if ( hash_equals( $expected, $s ) ) {
			$ok = true;
		}
	}
	if ( ! $ok || abs( time() - (int) $t ) > 600 ) {
		return new WP_Error( 'dreamscaper', 'Bad signature.', array( 'status' => 400 ) );
	}
	$e = json_decode( $payload, true );
	if ( isset( $e['type'] ) && in_array( $e['type'], array( 'checkout.session.completed', 'checkout.session.async_payment_succeeded' ), true ) ) {
		dreamscaper_credit_session( $e['data']['object'] );
	}
	do_action( 'dreamscaper_stripe_event', $e );
	return array( 'received' => true );
}

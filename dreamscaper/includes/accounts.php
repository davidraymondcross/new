<?php
/**
 * DreamScaper – customer accounts.
 * Customers get a normal WordPress account (role: subscriber) with their contact
 * details in user meta. Email + password, or Google / Facebook sign-in.
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/* So a nonce created right after wp_signon() matches the new session cookie. */
add_action( 'set_logged_in_cookie', function ( $cookie ) {
	$_COOKIE[ LOGGED_IN_COOKIE ] = $cookie;
} );

/* Keep customers out of wp-admin and hide the toolbar for them. */
add_action( 'admin_init', function () {
	if ( wp_doing_ajax() || ! is_user_logged_in() ) {
		return;
	}
	$u = wp_get_current_user();
	if ( get_user_meta( $u->ID, 'dscp_customer', true ) && ! current_user_can( 'edit_posts' ) ) {
		wp_safe_redirect( home_url( '/#dreamscaper' ) );
		exit;
	}
} );
add_filter( 'show_admin_bar', function ( $show ) {
	if ( is_user_logged_in() && get_user_meta( get_current_user_id(), 'dscp_customer', true ) && ! current_user_can( 'edit_posts' ) ) {
		return false;
	}
	return $show;
} );

function dreamscaper_profile( $user_id ) {
	$u = get_userdata( $user_id );
	if ( ! $u ) {
		return null;
	}
	$m = function ( $k ) use ( $user_id ) {
		return (string) get_user_meta( $user_id, 'dscp_' . $k, true );
	};
	$p = array(
		'id'       => (int) $user_id,
		'name'     => $u->display_name,
		'email'    => $u->user_email,
		'phone'    => $m( 'phone' ),
		'address'  => $m( 'address' ),
		'town'     => $m( 'town' ),
		'zip'      => $m( 'zip' ),
		'state'    => $m( 'state' ),
		'contact'  => $m( 'contact' ) !== '0',
		'provider' => $m( 'provider' ),
		'avatar'   => $m( 'avatar' ) ? $m( 'avatar' ) : get_avatar_url( $user_id, array( 'size' => 64, 'default' => 'blank' ) ),
		'owner'    => user_can( $user_id, 'manage_options' ),
	);
	$p['complete'] = strlen( $p['name'] ) > 1 && is_email( $p['email'] ) && strlen( preg_replace( '/\D/', '', $p['phone'] ) ) >= 10 && strlen( $p['address'] ) > 3;
	return $p;
}

/** Session info for the app (admin-ajax so it works on cached pages, no nonce needed). */
function dreamscaper_session_payload() {
	$uid = get_current_user_id();
	return array(
		'user'    => $uid ? dreamscaper_profile( $uid ) : null,
		'nonce'   => wp_create_nonce( 'wp_rest' ),
		'ai'      => dreamscaper_ai_status( $uid ),
		'socials' => dreamscaper_social_providers(),
		'region'  => dreamscaper_region( $uid ),
		'terms'   => dreamscaper_terms_public( $uid ),
		'storage' => dreamscaper_storage_status( $uid ),
		'community' => dreamscaper_community_status( $uid ),
		'crm'       => function_exists( 'dreamscaper_crm_status' ) ? dreamscaper_crm_status( $uid ) : array( 'on' => false ),
		'inbox'     => function_exists( 'dreamscaper_inbox_unread' ) ? array( 'unread' => dreamscaper_inbox_unread( $uid ) ) : null,
	);
}
function dreamscaper_ajax_me() {
	nocache_headers();
	wp_send_json( dreamscaper_session_payload() );
}
add_action( 'wp_ajax_dreamscaper_me', 'dreamscaper_ajax_me' );
add_action( 'wp_ajax_nopriv_dreamscaper_me', 'dreamscaper_ajax_me' );

function dreamscaper_clean_profile( $p ) {
	$out = array();
	foreach ( array( 'phone', 'address', 'town', 'zip' ) as $k ) {
		if ( isset( $p[ $k ] ) ) {
			$out[ $k ] = sanitize_text_field( wp_unslash( (string) $p[ $k ] ) );
		}
	}
	if ( isset( $p['state'] ) ) {
		$out['state'] = dreamscaper_state_abbr( wp_unslash( (string) $p['state'] ) );
	}
	if ( isset( $p['contact'] ) ) {
		$out['contact'] = $p['contact'] ? '1' : '0';
	}
	return $out;
}

function dreamscaper_save_profile( $user_id, $p ) {
	foreach ( dreamscaper_clean_profile( $p ) as $k => $v ) {
		update_user_meta( $user_id, 'dscp_' . $k, $v );
	}
	if ( ! empty( $p['name'] ) ) {
		$name  = sanitize_text_field( wp_unslash( (string) $p['name'] ) );
		$parts = preg_split( '/\s+/', $name, 2 );
		wp_update_user( array(
			'ID'           => $user_id,
			'display_name' => $name,
			'first_name'   => $parts[0],
			'last_name'    => isset( $parts[1] ) ? $parts[1] : '',
		) );
	}
}

/** Create (or find) a customer. Returns user id or WP_Error. */
function dreamscaper_create_customer( $email, $name, $password = '', $provider = '' ) {
	$email = sanitize_email( $email );
	if ( ! is_email( $email ) ) {
		return new WP_Error( 'dreamscaper', 'Please enter a valid email address.', array( 'status' => 400 ) );
	}
	$existing = get_user_by( 'email', $email );
	if ( $existing ) {
		return $existing->ID;
	}
	$base  = sanitize_user( strtolower( strstr( $email, '@', true ) ), true );
	$login = $base ? $base : 'customer';
	$i     = 1;
	while ( username_exists( $login ) ) {
		$login = $base . ( ++$i );
	}
	$id = wp_insert_user( array(
		'user_login'   => $login,
		'user_email'   => $email,
		'user_pass'    => $password ? $password : wp_generate_password( 32, true, true ),
		'display_name' => $name ? $name : $login,
		'first_name'   => $name ? strtok( $name, ' ' ) : '',
		'role'         => get_option( 'default_role', 'subscriber' ) === 'administrator' ? 'subscriber' : 'subscriber',
	) );
	if ( is_wp_error( $id ) ) {
		return new WP_Error( 'dreamscaper', $id->get_error_message(), array( 'status' => 400 ) );
	}
	update_user_meta( $id, 'dscp_customer', 1 );
	update_user_meta( $id, 'dscp_joined', time() );
	if ( $provider ) {
		update_user_meta( $id, 'dscp_provider', $provider );
	}
	dreamscaper_notify_new_customer( $id );
	return $id;
}

function dreamscaper_notify_new_customer( $id ) {
	$to = dreamscaper_opt( 'notify_email' );
	if ( ! $to || ! dreamscaper_opt( 'notify_signup' ) ) {
		return;
	}
	$p = dreamscaper_profile( $id );
	wp_mail( $to, 'New DreamScaper sign-up: ' . $p['name'], "A customer created a DreamScaper account.\n\nName: {$p['name']}\nEmail: {$p['email']}\nSigned up with: " . ( $p['provider'] ? ucfirst( $p['provider'] ) : 'email' ) . "\n\nTheir phone and address appear in later emails once they add them." );
}

function dreamscaper_login_response( $user_id, $remember = true ) {
	wp_set_current_user( $user_id );
	wp_set_auth_cookie( $user_id, $remember, is_ssl() );
	do_action( 'wp_login', get_userdata( $user_id )->user_login, get_userdata( $user_id ) );
	return dreamscaper_session_payload();
}

/* ------------------------------------------------------------------ REST */

add_action( 'rest_api_init', function () {
	$open = '__return_true';
	$auth = function () {
		return is_user_logged_in();
	};
	$routes = array(
		array( '/auth/register', 'POST', 'dreamscaper_rest_register', $open ),
		array( '/auth/login', 'POST', 'dreamscaper_rest_login', $open ),
		array( '/auth/lost', 'POST', 'dreamscaper_rest_lost', $open ),
		array( '/auth/logout', 'POST', 'dreamscaper_rest_logout', $auth ),
		array( '/auth/profile', 'POST', 'dreamscaper_rest_profile', $auth ),
		array( '/auth/delete', 'POST', 'dreamscaper_rest_delete_account', $auth ),
	);
	foreach ( $routes as $r ) {
		register_rest_route( 'dreamscaper/v1', $r[0], array( 'methods' => $r[1], 'callback' => $r[2], 'permission_callback' => $r[3] ) );
	}
} );

function dreamscaper_rest_register( WP_REST_Request $r ) {
	if ( ! dreamscaper_limit( 'reg', 8, HOUR_IN_SECONDS ) ) {
		return new WP_Error( 'dreamscaper', 'Too many sign-ups from here. Please try again later.', array( 'status' => 429 ) );
	}
	$p = $r->get_json_params();
	if ( ! empty( $p['hp'] ) ) {
		return new WP_Error( 'dreamscaper', 'Error.', array( 'status' => 400 ) );
	}
	$email = sanitize_email( isset( $p['email'] ) ? $p['email'] : '' );
	$name  = sanitize_text_field( isset( $p['name'] ) ? $p['name'] : '' );
	$pass  = isset( $p['password'] ) ? (string) $p['password'] : '';
	if ( strlen( $name ) < 2 ) {
		return new WP_Error( 'dreamscaper', 'Please add your name.', array( 'status' => 400 ) );
	}
	if ( strlen( $pass ) < 8 ) {
		return new WP_Error( 'dreamscaper', 'Use a password with at least 8 characters.', array( 'status' => 400 ) );
	}
	if ( empty( $p['agree'] ) ) {
		return new WP_Error( 'dreamscaper', 'Please tick the box to agree to the Terms of Service.', array( 'status' => 400 ) );
	}
	if ( email_exists( $email ) ) {
		return new WP_Error( 'dreamscaper', 'That email already has an account. Sign in instead (or use “Forgot password”).', array( 'status' => 409 ) );
	}
	$id = dreamscaper_create_customer( $email, $name, $pass );
	if ( is_wp_error( $id ) ) {
		return $id;
	}
	dreamscaper_save_profile( $id, $p );
	dreamscaper_terms_accept( $id, 'signup' );
	return dreamscaper_login_response( $id, true );
}

function dreamscaper_rest_login( WP_REST_Request $r ) {
	if ( ! dreamscaper_limit( 'login', 20, 15 * MINUTE_IN_SECONDS ) ) {
		return new WP_Error( 'dreamscaper', 'Too many attempts. Please wait a few minutes.', array( 'status' => 429 ) );
	}
	$p     = $r->get_json_params();
	$email = isset( $p['email'] ) ? sanitize_text_field( $p['email'] ) : '';
	$u     = is_email( $email ) ? get_user_by( 'email', $email ) : get_user_by( 'login', $email );
	$user  = $u ? wp_signon( array( 'user_login' => $u->user_login, 'user_password' => isset( $p['password'] ) ? (string) $p['password'] : '', 'remember' => true ), is_ssl() ) : null;
	if ( ! $user || is_wp_error( $user ) ) {
		return new WP_Error( 'dreamscaper', 'That email and password don’t match. Try again or reset your password.', array( 'status' => 401 ) );
	}
	return dreamscaper_login_response( $user->ID, true );
}

function dreamscaper_rest_lost( WP_REST_Request $r ) {
	if ( ! dreamscaper_limit( 'lost', 5, HOUR_IN_SECONDS ) ) {
		return new WP_Error( 'dreamscaper', 'Please wait a bit before trying again.', array( 'status' => 429 ) );
	}
	$email = sanitize_email( (string) $r->get_param( 'email' ) );
	if ( is_email( $email ) && email_exists( $email ) ) {
		$u = get_user_by( 'email', $email );
		retrieve_password( $u->user_login );
	}
	return array( 'ok' => true, 'message' => 'If that email has an account, a reset link is on its way.' );
}

function dreamscaper_rest_logout() {
	wp_logout();
	wp_set_current_user( 0 );
	return dreamscaper_session_payload();
}

function dreamscaper_rest_profile( WP_REST_Request $r ) {
	$p = $r->get_json_params();
	if ( isset( $p['email'] ) ) {
		$email = sanitize_email( $p['email'] );
		$cur   = wp_get_current_user();
		if ( $email && $email !== $cur->user_email ) {
			if ( ! is_email( $email ) || email_exists( $email ) ) {
				return new WP_Error( 'dreamscaper', 'That email can’t be used.', array( 'status' => 400 ) );
			}
			wp_update_user( array( 'ID' => $cur->ID, 'user_email' => $email ) );
		}
	}
	dreamscaper_save_profile( get_current_user_id(), $p );
	return dreamscaper_session_payload();
}

/** Customers can delete their account and every design/file. */
function dreamscaper_rest_delete_account() {
	$uid = get_current_user_id();
	if ( user_can( $uid, 'edit_posts' ) ) {
		return new WP_Error( 'dreamscaper', 'Staff accounts can’t be deleted here.', array( 'status' => 403 ) );
	}
	dreamscaper_cloud_wipe( $uid );
	require_once ABSPATH . 'wp-admin/includes/user.php';
	wp_logout();
	wp_delete_user( $uid );
	wp_set_current_user( 0 );
	return dreamscaper_session_payload();
}

/* ------------------------------------------------------------ social sign-in */

function dreamscaper_social_providers() {
	$out = array();
	if ( dreamscaper_opt( 'google_id' ) && dreamscaper_opt( 'google_secret' ) ) {
		$out[] = 'google';
	}
	if ( dreamscaper_opt( 'facebook_id' ) && dreamscaper_opt( 'facebook_secret' ) ) {
		$out[] = 'facebook';
	}
	return $out;
}

function dreamscaper_oauth_redirect_uri( $provider ) {
	return add_query_arg( 'dreamscaper_oauth', $provider, home_url( '/' ) );
}

function dreamscaper_oauth_conf( $provider ) {
	if ( 'google' === $provider ) {
		return array(
			'auth'   => 'https://accounts.google.com/o/oauth2/v2/auth',
			'token'  => 'https://oauth2.googleapis.com/token',
			'scope'  => 'openid email profile',
			'id'     => dreamscaper_opt( 'google_id' ),
			'secret' => dreamscaper_opt( 'google_secret' ),
		);
	}
	if ( 'facebook' === $provider ) {
		return array(
			'auth'   => 'https://www.facebook.com/v19.0/dialog/oauth',
			'token'  => 'https://graph.facebook.com/v19.0/oauth/access_token',
			'scope'  => 'email,public_profile',
			'id'     => dreamscaper_opt( 'facebook_id' ),
			'secret' => dreamscaper_opt( 'facebook_secret' ),
		);
	}
	return null;
}

add_action( 'init', function () {
	if ( empty( $_GET['dreamscaper_oauth'] ) ) {
		return;
	}
	$provider = sanitize_key( wp_unslash( $_GET['dreamscaper_oauth'] ) );
	$c        = dreamscaper_oauth_conf( $provider );
	if ( ! $c || ! $c['id'] ) {
		dreamscaper_oauth_finish( false, 'That sign-in option isn’t set up yet.' );
	}
	// Step 1: send the visitor to Google/Facebook.
	if ( isset( $_GET['start'] ) ) {
		$state  = wp_generate_password( 32, false );
		$return = isset( $_GET['return'] ) ? esc_url_raw( wp_unslash( $_GET['return'] ) ) : home_url( '/' );
		set_transient( 'dscp_oauth_' . $state, array( 'p' => $provider, 'return' => wp_validate_redirect( $return, home_url( '/' ) ), 'popup' => ! empty( $_GET['popup'] ) ), 15 * MINUTE_IN_SECONDS );
		$url = add_query_arg( array_filter( array(
			'client_id'     => $c['id'],
			'redirect_uri'  => dreamscaper_oauth_redirect_uri( $provider ),
			'response_type' => 'code',
			'scope'         => $c['scope'],
			'state'         => $state,
			'prompt'        => 'google' === $provider ? 'select_account' : null,
		) ), $c['auth'] );
		wp_redirect( $url ); // phpcs:ignore WordPress.Security.SafeRedirect -- provider URL
		exit;
	}
	// Step 2: provider sends them back with a code.
	$state = isset( $_GET['state'] ) ? sanitize_text_field( wp_unslash( $_GET['state'] ) ) : '';
	$st    = $state ? get_transient( 'dscp_oauth_' . $state ) : false;
	if ( ! $st || $st['p'] !== $provider ) {
		dreamscaper_oauth_finish( false, 'That sign-in link expired. Please try again.' );
	}
	delete_transient( 'dscp_oauth_' . $state );
	if ( empty( $_GET['code'] ) ) {
		dreamscaper_oauth_finish( false, 'Sign-in was cancelled.', $st );
	}
	$code = sanitize_text_field( wp_unslash( $_GET['code'] ) );
	$tok  = wp_remote_post( $c['token'], array(
		'timeout' => 20,
		'body'    => array(
			'code'          => $code,
			'client_id'     => $c['id'],
			'client_secret' => $c['secret'],
			'redirect_uri'  => dreamscaper_oauth_redirect_uri( $provider ),
			'grant_type'    => 'authorization_code',
		),
	) );
	$tj = is_wp_error( $tok ) ? null : json_decode( wp_remote_retrieve_body( $tok ), true );
	if ( empty( $tj['access_token'] ) ) {
		dreamscaper_oauth_finish( false, 'We couldn’t finish signing you in. Please try again.', $st );
	}
	$profile = null;
	if ( 'google' === $provider ) {
		$res = wp_remote_get( 'https://openidconnect.googleapis.com/v1/userinfo', array( 'timeout' => 15, 'headers' => array( 'Authorization' => 'Bearer ' . $tj['access_token'] ) ) );
		$pj  = is_wp_error( $res ) ? null : json_decode( wp_remote_retrieve_body( $res ), true );
		if ( ! empty( $pj['email'] ) && ! empty( $pj['email_verified'] ) ) {
			$profile = array( 'email' => $pj['email'], 'name' => isset( $pj['name'] ) ? $pj['name'] : '', 'avatar' => isset( $pj['picture'] ) ? $pj['picture'] : '' );
		}
	} else {
		$proof = hash_hmac( 'sha256', $tj['access_token'], $c['secret'] );
		$res   = wp_remote_get( add_query_arg( array( 'fields' => 'id,name,email,picture.type(normal)', 'access_token' => $tj['access_token'], 'appsecret_proof' => $proof ), 'https://graph.facebook.com/v19.0/me' ), array( 'timeout' => 15 ) );
		$pj    = is_wp_error( $res ) ? null : json_decode( wp_remote_retrieve_body( $res ), true );
		if ( ! empty( $pj['id'] ) ) {
			$profile = array( 'email' => isset( $pj['email'] ) ? $pj['email'] : '', 'name' => isset( $pj['name'] ) ? $pj['name'] : '', 'fbid' => $pj['id'], 'avatar' => isset( $pj['picture']['data']['url'] ) ? $pj['picture']['data']['url'] : '' );
		}
	}
	if ( ! $profile ) {
		dreamscaper_oauth_finish( false, 'We couldn’t read your account details. Please try again or use email.', $st );
	}
	$uid = 0;
	if ( ! empty( $profile['fbid'] ) ) {
		$found = get_users( array( 'meta_key' => 'dscp_fbid', 'meta_value' => $profile['fbid'], 'number' => 1, 'fields' => 'ID' ) );
		$uid   = $found ? (int) $found[0] : 0;
	}
	if ( ! $uid ) {
		if ( ! is_email( $profile['email'] ) ) {
			// Facebook accounts without an email: make a placeholder; the app asks for a real one.
			$profile['email'] = 'fb' . preg_replace( '/\D/', '', $profile['fbid'] ) . '@users.dreamscaper.invalid';
		}
		$uid = dreamscaper_create_customer( $profile['email'], $profile['name'], '', $provider );
		if ( is_wp_error( $uid ) ) {
			dreamscaper_oauth_finish( false, $uid->get_error_message(), $st );
		}
	}
	if ( ! empty( $profile['fbid'] ) ) {
		update_user_meta( $uid, 'dscp_fbid', $profile['fbid'] );
	}
	if ( ! empty( $profile['avatar'] ) ) {
		update_user_meta( $uid, 'dscp_avatar', esc_url_raw( $profile['avatar'] ) );
	}
	if ( user_can( $uid, 'edit_posts' ) && ! user_can( $uid, 'manage_options' ) ) {
		dreamscaper_oauth_finish( false, 'Please sign in to staff accounts with a password.', $st );
	}
	wp_set_current_user( $uid );
	wp_set_auth_cookie( $uid, true, is_ssl() );
	dreamscaper_oauth_finish( true, '', $st );
} );

/** Close the popup (telling the app) or go back to the page. */
function dreamscaper_oauth_finish( $ok, $msg, $st = null ) {
	$return = $st && ! empty( $st['return'] ) ? $st['return'] : home_url( '/' );
	$return = remove_query_arg( array( 'ds_login' ), $return );
	$popup  = $st ? ! empty( $st['popup'] ) : true;
	nocache_headers();
	if ( ! $popup ) {
		wp_safe_redirect( add_query_arg( 'ds_login', $ok ? 'ok' : rawurlencode( $msg ), $return ) . '#dreamscaper' );
		exit;
	}
	$payload = wp_json_encode( array( 'dreamscaper' => 'login', 'ok' => (bool) $ok, 'message' => $msg ) );
	$origin  = wp_json_encode( home_url() );
	header( 'Content-Type: text/html; charset=utf-8' );
	echo '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Signing in…</title>'
		. '<body style="font:16px system-ui;padding:30px;text-align:center;color:#123">'
		. '<p>' . ( $ok ? 'Signed in! You can close this window.' : esc_html( $msg ) ) . '</p>'
		. '<script>try{var o=' . $origin . ';var u=new URL(o);if(window.opener){window.opener.postMessage(' . $payload . ',u.origin);setTimeout(function(){window.close()},' . ( $ok ? 150 : 2500 ) . ')}else{location.href=' . wp_json_encode( esc_url_raw( $return ) . '#dreamscaper' ) . '}}catch(e){}</script>';
	exit;
}

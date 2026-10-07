<?php
/**
 * DreamScaper – Contractor CRM (Design → Quote).
 *
 * Any contractor can apply; the site owner approves them (Settings → DreamScaper Contractors).
 * Approved contractors get the Contractor Hub: customers, properties, the 2D site plan,
 * automatic takeoff & estimate, two quotes (job cost + customer proposal), e-signature,
 * follow-ups by email and text (Twilio), scheduling, job costing and invoices (Stripe Connect).
 * Homeowners use the same DreamScaper account as their customer portal.
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'DREAMSCAPER_CRM_DB', 2 );

/* --------------------------------------------------------------------- schema */

function dreamscaper_crm_install_db() {
	global $wpdb;
	require_once ABSPATH . 'wp-admin/includes/upgrade.php';
	$c   = $wpdb->get_charset_collate();
	$sql = array(
		'CREATE TABLE ' . dreamscaper_t( 'pros' ) . " (
			user_id bigint(20) unsigned NOT NULL,
			status varchar(12) NOT NULL DEFAULT 'pending',
			business varchar(120) NOT NULL DEFAULT '',
			contact varchar(80) NOT NULL DEFAULT '',
			phone varchar(30) NOT NULL DEFAULT '',
			email varchar(120) NOT NULL DEFAULT '',
			website varchar(200) NOT NULL DEFAULT '',
			license varchar(80) NOT NULL DEFAULT '',
			insured tinyint(1) NOT NULL DEFAULT 0,
			years smallint(6) NOT NULL DEFAULT 0,
			address varchar(200) NOT NULL DEFAULT '',
			town varchar(80) NOT NULL DEFAULT '',
			state varchar(20) NOT NULL DEFAULT '',
			zip varchar(12) NOT NULL DEFAULT '',
			lat double NOT NULL DEFAULT 0,
			lng double NOT NULL DEFAULT 0,
			radius smallint(6) NOT NULL DEFAULT 25,
			services varchar(400) NOT NULL DEFAULT '',
			bio text NOT NULL,
			logo varchar(255) NOT NULL DEFAULT '',
			settings longtext NOT NULL,
			stripe_acct varchar(40) NOT NULL DEFAULT '',
			stripe_ready tinyint(1) NOT NULL DEFAULT 0,
			rating_sum int(11) NOT NULL DEFAULT 0,
			rating_n int(11) NOT NULL DEFAULT 0,
			reality_sum int(11) NOT NULL DEFAULT 0,
			reality_n int(11) NOT NULL DEFAULT 0,
			jobs_done int(11) NOT NULL DEFAULT 0,
			created datetime NOT NULL,
			PRIMARY KEY  (user_id),
			KEY status (status)
		) $c;",
		'CREATE TABLE ' . dreamscaper_t( 'clients' ) . " (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			pro_id bigint(20) unsigned NOT NULL,
			user_id bigint(20) unsigned NOT NULL DEFAULT 0,
			stage varchar(12) NOT NULL DEFAULT 'lead',
			source varchar(20) NOT NULL DEFAULT '',
			name varchar(120) NOT NULL DEFAULT '',
			company varchar(120) NOT NULL DEFAULT '',
			email varchar(120) NOT NULL DEFAULT '',
			phone varchar(30) NOT NULL DEFAULT '',
			address varchar(200) NOT NULL DEFAULT '',
			town varchar(80) NOT NULL DEFAULT '',
			state varchar(20) NOT NULL DEFAULT '',
			zip varchar(12) NOT NULL DEFAULT '',
			photo varchar(255) NOT NULL DEFAULT '',
			tags varchar(400) NOT NULL DEFAULT '',
			data longtext NOT NULL,
			created datetime NOT NULL,
			updated datetime NOT NULL,
			PRIMARY KEY  (id),
			KEY pro_stage (pro_id,stage),
			KEY user_id (user_id),
			KEY phone (phone)
		) $c;",
		'CREATE TABLE ' . dreamscaper_t( 'props' ) . " (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			pro_id bigint(20) unsigned NOT NULL DEFAULT 0,
			client_id bigint(20) unsigned NOT NULL DEFAULT 0,
			user_id bigint(20) unsigned NOT NULL DEFAULT 0,
			address varchar(200) NOT NULL DEFAULT '',
			lat double NOT NULL DEFAULT 0,
			lng double NOT NULL DEFAULT 0,
			aerial varchar(255) NOT NULL DEFAULT '',
			ppf double NOT NULL DEFAULT 0,
			photos longtext NOT NULL,
			plan longtext NOT NULL,
			data longtext NOT NULL,
			created datetime NOT NULL,
			updated datetime NOT NULL,
			PRIMARY KEY  (id),
			KEY client_id (client_id),
			KEY user_id (user_id)
		) $c;",
		'CREATE TABLE ' . dreamscaper_t( 'quotes' ) . " (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			pro_id bigint(20) unsigned NOT NULL,
			client_id bigint(20) unsigned NOT NULL DEFAULT 0,
			prop_id bigint(20) unsigned NOT NULL DEFAULT 0,
			user_id bigint(20) unsigned NOT NULL DEFAULT 0,
			number varchar(20) NOT NULL DEFAULT '',
			title varchar(160) NOT NULL DEFAULT '',
			status varchar(12) NOT NULL DEFAULT 'draft',
			job_status varchar(12) NOT NULL DEFAULT '',
			token varchar(40) NOT NULL DEFAULT '',
			design longtext NOT NULL,
			estimate longtext NOT NULL,
			docs longtext NOT NULL,
			job longtext NOT NULL,
			sign longtext NOT NULL,
			price decimal(12,2) NOT NULL DEFAULT 0,
			cost decimal(12,2) NOT NULL DEFAULT 0,
			total decimal(12,2) NOT NULL DEFAULT 0,
			valid_until date DEFAULT NULL,
			sent_at datetime DEFAULT NULL,
			viewed_at datetime DEFAULT NULL,
			signed_at datetime DEFAULT NULL,
			origin varchar(12) NOT NULL DEFAULT '',
			created datetime NOT NULL,
			updated datetime NOT NULL,
			PRIMARY KEY  (id),
			UNIQUE KEY token (token),
			KEY pro_status (pro_id,status),
			KEY client_id (client_id),
			KEY user_id (user_id)
		) $c;",
		'CREATE TABLE ' . dreamscaper_t( 'visits' ) . " (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			pro_id bigint(20) unsigned NOT NULL,
			quote_id bigint(20) unsigned NOT NULL DEFAULT 0,
			client_id bigint(20) unsigned NOT NULL DEFAULT 0,
			title varchar(160) NOT NULL DEFAULT '',
			start datetime NOT NULL,
			end datetime NOT NULL,
			crew varchar(255) NOT NULL DEFAULT '',
			status varchar(12) NOT NULL DEFAULT 'scheduled',
			notes text NOT NULL,
			user_id bigint(20) unsigned NOT NULL DEFAULT 0,
			kind varchar(12) NOT NULL DEFAULT 'job',
			location varchar(200) NOT NULL DEFAULT '',
			remind text,
			cust_status varchar(12) NOT NULL DEFAULT '',
			cust_note varchar(500) NOT NULL DEFAULT '',
			uid varchar(40) NOT NULL DEFAULT '',
			seq int(11) NOT NULL DEFAULT 0,
			created datetime NOT NULL,
			PRIMARY KEY  (id),
			KEY pro_start (pro_id,start),
			KEY quote_id (quote_id),
			KEY user_start (user_id,start),
			KEY uid (uid)
		) $c;",
		'CREATE TABLE ' . dreamscaper_t( 'invoices' ) . " (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			pro_id bigint(20) unsigned NOT NULL,
			quote_id bigint(20) unsigned NOT NULL DEFAULT 0,
			client_id bigint(20) unsigned NOT NULL DEFAULT 0,
			user_id bigint(20) unsigned NOT NULL DEFAULT 0,
			number varchar(20) NOT NULL DEFAULT '',
			kind varchar(12) NOT NULL DEFAULT 'final',
			title varchar(160) NOT NULL DEFAULT '',
			items longtext NOT NULL,
			amount decimal(12,2) NOT NULL DEFAULT 0,
			status varchar(10) NOT NULL DEFAULT 'draft',
			token varchar(40) NOT NULL DEFAULT '',
			due date DEFAULT NULL,
			recur varchar(10) NOT NULL DEFAULT '',
			next_at date DEFAULT NULL,
			stripe_session varchar(80) NOT NULL DEFAULT '',
			paid_at datetime DEFAULT NULL,
			sent_at datetime DEFAULT NULL,
			reminded_at datetime DEFAULT NULL,
			reminders smallint(6) NOT NULL DEFAULT 0,
			created datetime NOT NULL,
			PRIMARY KEY  (id),
			UNIQUE KEY token (token),
			KEY pro_status (pro_id,status),
			KEY quote_id (quote_id),
			KEY user_id (user_id)
		) $c;",
		'CREATE TABLE ' . dreamscaper_t( 'followups' ) . " (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			pro_id bigint(20) unsigned NOT NULL,
			quote_id bigint(20) unsigned NOT NULL,
			client_id bigint(20) unsigned NOT NULL DEFAULT 0,
			channel varchar(6) NOT NULL DEFAULT 'email',
			send_at datetime NOT NULL,
			subject varchar(200) NOT NULL DEFAULT '',
			body text NOT NULL,
			include varchar(200) NOT NULL DEFAULT '',
			recipients text NOT NULL,
			status varchar(10) NOT NULL DEFAULT 'scheduled',
			sent_at datetime DEFAULT NULL,
			error varchar(255) NOT NULL DEFAULT '',
			PRIMARY KEY  (id),
			KEY due (status,send_at),
			KEY quote_id (quote_id)
		) $c;",
		'CREATE TABLE ' . dreamscaper_t( 'activity' ) . " (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			pro_id bigint(20) unsigned NOT NULL,
			client_id bigint(20) unsigned NOT NULL DEFAULT 0,
			quote_id bigint(20) unsigned NOT NULL DEFAULT 0,
			kind varchar(16) NOT NULL,
			text text NOT NULL,
			by_user bigint(20) unsigned NOT NULL DEFAULT 0,
			created datetime NOT NULL,
			PRIMARY KEY  (id),
			KEY client (pro_id,client_id,created)
		) $c;",
		'CREATE TABLE ' . dreamscaper_t( 'reviews' ) . " (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			pro_id bigint(20) unsigned NOT NULL,
			user_id bigint(20) unsigned NOT NULL,
			quote_id bigint(20) unsigned NOT NULL,
			stars tinyint(4) NOT NULL,
			reality tinyint(4) NOT NULL DEFAULT 0,
			text text NOT NULL,
			photo varchar(255) NOT NULL DEFAULT '',
			reply text NOT NULL,
			status varchar(10) NOT NULL DEFAULT 'live',
			created datetime NOT NULL,
			PRIMARY KEY  (id),
			UNIQUE KEY once (user_id,quote_id),
			KEY pro_id (pro_id)
		) $c;",
	);
	foreach ( $sql as $q ) {
		dbDelta( $q );
	}
	update_option( 'dreamscaper_crm_db', DREAMSCAPER_CRM_DB );
}
add_action( 'init', function () {
	if ( (int) get_option( 'dreamscaper_crm_db' ) !== DREAMSCAPER_CRM_DB ) {
		dreamscaper_crm_install_db();
	}
}, 6 );

/* ------------------------------------------------------------------ basics */

function dreamscaper_crm_on() {
	return (bool) dreamscaper_opt( 'crm_on' );
}
function dreamscaper_token() {
	return strtolower( wp_generate_password( 32, false, false ) );
}
function dreamscaper_crm_err( $msg, $status = 400 ) {
	return new WP_Error( 'dreamscaper', $msg, array( 'status' => $status ) );
}
function dreamscaper_json( $s, $default = array() ) {
	$v = json_decode( (string) $s, true );
	return is_array( $v ) ? $v : $default;
}
function dreamscaper_ms( $mysql ) {
	return $mysql ? strtotime( $mysql . ' UTC' ) * 1000 : null;
}
function dreamscaper_app_url( $args = array() ) {
	$base = get_option( 'dreamscaper_page' ) ? get_permalink( (int) get_option( 'dreamscaper_page' ) ) : home_url( '/' );
	return add_query_arg( $args, $base ) . '#dreamscaper';
}
function dreamscaper_quote_url( $token ) {
	return add_query_arg( 'ds_quote', $token, home_url( '/' ) );
}
function dreamscaper_invoice_url( $token ) {
	return add_query_arg( 'ds_invoice', $token, home_url( '/' ) );
}

/** E.164 for US numbers (10 digits → +1…). Returns '' when it can't be a phone number. */
function dreamscaper_e164( $phone ) {
	$d = preg_replace( '/\D/', '', (string) $phone );
	if ( 10 === strlen( $d ) ) {
		return '+1' . $d;
	}
	if ( 11 === strlen( $d ) && '1' === $d[0] ) {
		return '+' . $d;
	}
	return ( strlen( $d ) > 10 && '+' === substr( trim( (string) $phone ), 0, 1 ) ) ? '+' . $d : '';
}

/** Save an uploaded data-URI picture for the CRM (unguessable file name). */
function dreamscaper_crm_store_image( $uri, $max = 8388608 ) {
	if ( is_string( $uri ) && preg_match( '#^https?://#', $uri ) ) {
		$u = wp_upload_dir();
		return 0 === strpos( $uri, trailingslashit( $u['baseurl'] ) ) ? esc_url_raw( $uri ) : '';
	}
	$img = dreamscaper_data_image( $uri, $max );
	if ( ! $img ) {
		return '';
	}
	// contractors: plan storage, and no large uploads while a payment is outstanding
	$uid = get_current_user_id();
	$err = function_exists( 'dreamscaper_pro_upload_err' ) ? dreamscaper_pro_upload_err( $uid, strlen( $img['bin'] ) ) : null;
	if ( $err ) {
		$GLOBALS['dscp_upload_err'] = $err;
		return '';
	}
	$u   = wp_upload_dir();
	$sub = 'dreamscaper-crm/' . gmdate( 'Y/m' ) . '/';
	$dir = trailingslashit( $u['basedir'] ) . $sub;
	wp_mkdir_p( $dir );
	$root = trailingslashit( $u['basedir'] ) . 'dreamscaper-crm/';
	if ( ! file_exists( $root . 'index.html' ) ) {
		@file_put_contents( $root . 'index.html', '' );
	}
	$ext  = array( 'image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp' )[ $img['mime'] ];
	$name = strtolower( wp_generate_password( 24, false ) ) . '.' . $ext;
	if ( false === file_put_contents( $dir . $name, $img['bin'] ) ) {
		return '';
	}
	if ( function_exists( 'dreamscaper_is_billed_pro' ) && dreamscaper_is_billed_pro( $uid ) ) {
		update_user_meta( $uid, 'dscp_crm_bytes', (int) get_user_meta( $uid, 'dscp_crm_bytes', true ) + strlen( $img['bin'] ) );
	}
	return trailingslashit( $u['baseurl'] ) . $sub . $name;
}

/* ---------------------------------------------------------------- contractors */

function dreamscaper_pro_row( $uid ) {
	global $wpdb;
	return $uid ? $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( 'pros' ) . ' WHERE user_id=%d', $uid ) ) : null;
}

/** The site owner is always an approved contractor (their own business). */
function dreamscaper_ensure_owner_pro( $uid ) {
	global $wpdb;
	if ( ! $uid || ! user_can( $uid, 'manage_options' ) ) {
		return;
	}
	$row = dreamscaper_pro_row( $uid );
	if ( ! $row ) {
		$u = get_userdata( $uid );
		$wpdb->insert( dreamscaper_t( 'pros' ), array(
			'user_id'  => $uid,
			'status'   => 'approved',
			'business' => dreamscaper_opt( 'brand' ),
			'contact'  => dreamscaper_opt( 'short_brand' ),
			'email'    => dreamscaper_opt( 'notify_email' ) ? dreamscaper_opt( 'notify_email' ) : $u->user_email,
			'phone'    => (string) get_user_meta( $uid, 'dscp_phone', true ),
			'website'  => dreamscaper_opt( 'site' ),
			'state'    => 'CT',
			'bio'      => '',
			'settings' => '{}',
			'created'  => dreamscaper_now(),
		) );
	} elseif ( 'approved' !== $row->status ) {
		$wpdb->update( dreamscaper_t( 'pros' ), array( 'status' => 'approved' ), array( 'user_id' => $uid ) );
	}
}

/** Current user as an approved contractor, or WP_Error. */
function dreamscaper_crm_pro() {
	if ( ! dreamscaper_crm_on() ) {
		return dreamscaper_crm_err( 'The contractor tools aren’t switched on yet.', 503 );
	}
	$uid = get_current_user_id();
	if ( ! $uid ) {
		return dreamscaper_crm_err( 'Please sign in first.', 401 );
	}
	dreamscaper_ensure_owner_pro( $uid );
	$p = dreamscaper_pro_row( $uid );
	if ( ! $p || 'approved' !== $p->status ) {
		return dreamscaper_crm_err( $p && 'pending' === $p->status ? 'Your contractor application is waiting for approval.' : 'This is for approved contractors. Apply from My Account → Become a DreamScaper contractor.', 403 );
	}
	// paused / not-started accounts can read and export, but not create, change or send
	if ( function_exists( 'dreamscaper_rest_is_write' ) && dreamscaper_rest_is_write() && ! dreamscaper_pro_writable( $uid ) ) {
		return dreamscaper_paused_err( $uid );
	}
	return $p;
}

function dreamscaper_pro_settings( $p ) {
	return dreamscaper_json( is_object( $p ) ? $p->settings : '' );
}

/** Public card for a contractor (no private settings). */
function dreamscaper_pro_public( $p, $full = false ) {
	$out = array(
		'id'       => (int) $p->user_id,
		'business' => $p->business,
		'town'     => $p->town,
		'state'    => $p->state,
		'logo'     => $p->logo,
		'rating'   => $p->rating_n ? round( $p->rating_sum / $p->rating_n, 1 ) : 0,
		'reviews'  => (int) $p->rating_n,
		'reality'  => $p->reality_n ? round( $p->reality_sum / $p->reality_n, 1 ) : 0,
		'reality_n'=> (int) $p->reality_n,
		'jobs'     => (int) $p->jobs_done,
		'services' => array_values( array_filter( explode( ',', trim( $p->services, ',' ) ) ) ),
		'insured'  => (bool) $p->insured,
		'licensed' => '' !== $p->license,
		'years'    => (int) $p->years,
		'radius'   => (int) $p->radius,
		'pay'      => (bool) $p->stripe_ready,
	);
	$out['socials']   = function_exists( 'dreamscaper_pro_socials' ) ? dreamscaper_pro_socials( $p ) : array();
	$out['featured']  = function_exists( 'dreamscaper_pro_can' ) && dreamscaper_subs_on() ? dreamscaper_pro_can( (int) $p->user_id, 'featured' ) && ! dreamscaper_is_owner_pro( (int) $p->user_id ) : false;
	$out['accepting'] = function_exists( 'dreamscaper_pro_accepting' ) ? dreamscaper_pro_accepting( (int) $p->user_id ) : true;
	if ( $full ) {
		$out['gallery'] = function_exists( 'dreamscaper_pro_gallery' ) ? dreamscaper_pro_gallery( $p ) : array();
		$out['bio']     = $p->bio;
		$out['phone']   = $p->phone;
		$out['website'] = $p->website;
		$out['license'] = $p->license;
		$out['contact'] = $p->contact;
		$out['since']   = dreamscaper_ms( $p->created );
	}
	return $out;
}

/** Distance in miles between two points. */
function dreamscaper_miles( $a_lat, $a_lng, $b_lat, $b_lng ) {
	$r  = 3958.8;
	$dl = deg2rad( $b_lat - $a_lat );
	$dn = deg2rad( $b_lng - $a_lng );
	$h  = sin( $dl / 2 ) ** 2 + cos( deg2rad( $a_lat ) ) * cos( deg2rad( $b_lat ) ) * sin( $dn / 2 ) ** 2;
	return 2 * $r * asin( min( 1, sqrt( $h ) ) );
}

/** Next quote / invoice number for a contractor. */
function dreamscaper_next_number( $pro_id, $prefix ) {
	global $wpdb;
	$p   = dreamscaper_pro_row( $pro_id );
	$s   = dreamscaper_pro_settings( $p );
	$key = 'Q' === $prefix ? 'nextQuote' : 'nextInvoice';
	$n   = isset( $s[ $key ] ) ? max( 1, (int) $s[ $key ] ) : 1001;
	$s[ $key ] = $n + 1;
	$wpdb->update( dreamscaper_t( 'pros' ), array( 'settings' => wp_json_encode( $s ) ), array( 'user_id' => $pro_id ) );
	return $prefix . '-' . $n;
}

/* ---------------------------------------------------------------- activity */

function dreamscaper_crm_log( $pro_id, $client_id, $quote_id, $kind, $text, $by = null ) {
	global $wpdb;
	$wpdb->insert( dreamscaper_t( 'activity' ), array(
		'pro_id'    => (int) $pro_id,
		'client_id' => (int) $client_id,
		'quote_id'  => (int) $quote_id,
		'kind'      => substr( $kind, 0, 16 ),
		'text'      => mb_substr( (string) $text, 0, 4000 ),
		'by_user'   => null === $by ? get_current_user_id() : (int) $by,
		'created'   => dreamscaper_now(),
	) );
}

/** Tell the contractor (in-app + email). */
function dreamscaper_crm_tell_pro( $pro_id, $subject, $text, $target = 0 ) {
	if ( function_exists( 'dreamscaper_note' ) ) {
		global $wpdb;
		$wpdb->insert( dreamscaper_t( 'notes' ), array( 'user_id' => $pro_id, 'type' => 'crm', 'actor' => 0, 'target' => (int) $target, 'text' => mb_substr( $subject, 0, 250 ), 'created' => dreamscaper_now() ) );
	}
	$p  = dreamscaper_pro_row( $pro_id );
	$to = $p && is_email( $p->email ) ? $p->email : ( get_userdata( $pro_id ) ? get_userdata( $pro_id )->user_email : '' );
	if ( $to ) {
		wp_mail( $to, 'DreamScaper: ' . $subject, $text . "\n\nOpen your Contractor Hub: " . dreamscaper_app_url( array( 'ds_hub' => 1 ) ) );
	}
}
/** Tell a homeowner with a DreamScaper account (in-app note). */
function dreamscaper_crm_tell_user( $uid, $text, $target = 0 ) {
	global $wpdb;
	if ( $uid ) {
		$wpdb->insert( dreamscaper_t( 'notes' ), array( 'user_id' => (int) $uid, 'type' => 'project', 'actor' => 0, 'target' => (int) $target, 'text' => mb_substr( $text, 0, 250 ), 'created' => dreamscaper_now() ) );
	}
}

/* ------------------------------------------------------------- messaging */

function dreamscaper_sms_ready() {
	return dreamscaper_opt( 'twilio_sid' ) && dreamscaper_opt( 'twilio_token' ) && ( dreamscaper_opt( 'twilio_from' ) || dreamscaper_opt( 'twilio_msid' ) );
}
function dreamscaper_sms_opted_out( $e164 ) {
	$list = get_option( 'dreamscaper_sms_optout', array() );
	return is_array( $list ) && isset( $list[ md5( $e164 ) ] );
}

/** Send one text via Twilio. Returns true or WP_Error. */
function dreamscaper_sms( $to, $body ) {
	if ( ! dreamscaper_sms_ready() ) {
		return dreamscaper_crm_err( 'Text messages aren’t set up yet (Settings → DreamScaper → Text messages).', 503 );
	}
	$to = dreamscaper_e164( $to );
	if ( ! $to ) {
		return dreamscaper_crm_err( 'That phone number doesn’t look right.' );
	}
	if ( dreamscaper_sms_opted_out( $to ) ) {
		return dreamscaper_crm_err( 'This customer replied STOP, so texts to them are turned off.' );
	}
	if ( ! preg_match( '/\bSTOP\b/i', $body ) ) {
		$body .= ' Reply STOP to opt out.';
	}
	$args = array( 'To' => $to, 'Body' => mb_substr( $body, 0, 1500 ) );
	if ( dreamscaper_opt( 'twilio_msid' ) ) {
		$args['MessagingServiceSid'] = dreamscaper_opt( 'twilio_msid' );
	} else {
		$args['From'] = dreamscaper_e164( dreamscaper_opt( 'twilio_from' ) );
	}
	$sid = dreamscaper_opt( 'twilio_sid' );
	$res = wp_remote_post( 'https://api.twilio.com/2010-04-01/Accounts/' . rawurlencode( $sid ) . '/Messages.json', array(
		'timeout' => 15,
		'headers' => array( 'Authorization' => 'Basic ' . base64_encode( $sid . ':' . dreamscaper_opt( 'twilio_token' ) ) ),
		'body'    => $args,
	) );
	$code = is_wp_error( $res ) ? 0 : wp_remote_retrieve_response_code( $res );
	if ( $code < 200 || $code >= 300 ) {
		$j = is_wp_error( $res ) ? null : json_decode( wp_remote_retrieve_body( $res ), true );
		return dreamscaper_crm_err( 'Text not sent: ' . ( isset( $j['message'] ) ? $j['message'] : 'the text service didn’t answer.' ), 502 );
	}
	return true;
}

/** Branded HTML email from a contractor. */
function dreamscaper_crm_mail( $p, $to, $subject, $text, $opts = array() ) {
	if ( ! is_email( $to ) ) {
		return dreamscaper_crm_err( 'That email address doesn’t look right.' );
	}
	$brand = esc_html( $p->business );
	$html  = '<div style="font-family:Segoe UI,Roboto,Arial,sans-serif;max-width:620px;margin:0 auto;color:#1d2a22;line-height:1.55">';
	if ( $p->logo ) {
		$html .= '<p><img src="' . esc_url( $p->logo ) . '" alt="' . $brand . '" style="max-height:64px"></p>';
	}
	$html .= '<div style="font-size:15px">' . nl2br( make_clickable( esc_html( $text ) ) ) . '</div>';
	if ( ! empty( $opts['image'] ) ) {
		$html .= '<p><img src="' . esc_url( $opts['image'] ) . '" alt="Your design" style="width:100%;max-width:620px;border-radius:10px"></p>';
	}
	if ( ! empty( $opts['scope'] ) ) {
		$html .= '<h3 style="margin:18px 0 6px">What’s included</h3><ul style="padding-left:20px">';
		foreach ( (array) $opts['scope'] as $line ) {
			$html .= '<li>' . esc_html( $line ) . '</li>';
		}
		$html .= '</ul>';
	}
	if ( ! empty( $opts['total'] ) ) {
		$html .= '<p style="font-size:17px"><b>Total: ' . esc_html( $opts['total'] ) . '</b></p>';
	}
	if ( ! empty( $opts['link'] ) ) {
		$html .= '<p style="margin:22px 0"><a href="' . esc_url( $opts['link'] ) . '" style="background:#1f7a46;color:#fff;text-decoration:none;padding:13px 22px;border-radius:999px;font-weight:700;display:inline-block">' . esc_html( isset( $opts['button'] ) ? $opts['button'] : 'View your proposal' ) . '</a></p>';
	}
	$html .= '<hr style="border:0;border-top:1px solid #dde5df;margin:24px 0"><p style="font-size:13px;color:#5d6f63">' . $brand . ( $p->phone ? ' · ' . esc_html( $p->phone ) : '' ) . ( $p->website ? ' · ' . esc_html( $p->website ) : '' ) . '<br>Sent with DreamScaper</p></div>';
	$headers = array( 'Content-Type: text/html; charset=UTF-8' );
	if ( is_email( $p->email ) ) {
		$headers[] = 'Reply-To: ' . str_replace( array( "\r", "\n", '"' ), '', $p->business ) . ' <' . $p->email . '>';
	}
	return wp_mail( $to, $subject, $html, $headers ) ? true : dreamscaper_crm_err( 'The email couldn’t be sent from this website.', 500 );
}

/** Values for {shortcodes} in messages. */
function dreamscaper_crm_codes( $q, $c, $p ) {
	$d     = dreamscaper_json( $q->docs );
	$t     = isset( $d['totals'] ) ? $d['totals'] : array();
	$money = function ( $v ) {
		return '$' . number_format( (float) $v, 0 );
	};
	$prop  = $q->prop_id ? dreamscaper_crm_get( 'props', $q->prop_id, $q->pro_id ) : null;
	$name  = $c ? trim( $c->name ) : '';
	$parts = preg_split( '/\s+/', $name );
	return array(
		'customer_name'       => $name,
		'customer_first_name' => $parts ? $parts[0] : '',
		'customer_address'    => $prop && $prop->address ? $prop->address : ( $c ? trim( $c->address . ( $c->town ? ', ' . $c->town : '' ) . ( $c->state ? ', ' . $c->state : '' ) ) : '' ),
		'customer_town'       => $c ? $c->town : '',
		'project_name'        => $q->title,
		'quote_number'        => $q->number,
		'quote_total'         => $money( $q->total ),
		'deposit_amount'      => $money( isset( $t['deposit'] ) ? $t['deposit'] : 0 ),
		'quote_link'          => dreamscaper_quote_url( $q->token ),
		'valid_until'         => $q->valid_until ? wp_date( 'F j', strtotime( $q->valid_until ) ) : '',
		'company_name'        => $p->business,
		'contractor_name'     => $p->contact ? $p->contact : $p->business,
		'contractor_phone'    => $p->phone,
		'contractor_email'    => $p->email,
		'month'               => wp_date( 'F' ),
		'today'               => wp_date( 'F j' ),
	);
}
function dreamscaper_merge( $text, $codes ) {
	return preg_replace_callback( '/\{([a-z_]+)\}/i', function ( $m ) use ( $codes ) {
		$k = strtolower( $m[1] );
		return isset( $codes[ $k ] ) && '' !== $codes[ $k ] ? $codes[ $k ] : $m[0];
	}, (string) $text );
}

/** Row by id that belongs to a contractor. */
function dreamscaper_crm_get( $table, $id, $pro_id ) {
	global $wpdb;
	return $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( $table ) . ' WHERE id=%d AND pro_id=%d', $id, $pro_id ) );
}

/**
 * Send a quote message (email/sms/both) to recipients with optional extras.
 * $inc: link, image, total, scope. Returns array( sent => n, errors => [] ).
 */
function dreamscaper_crm_deliver( $q, $p, $recipients, $channel, $subject, $body, $inc ) {
	$c     = $q->client_id ? dreamscaper_crm_get( 'clients', $q->client_id, $q->pro_id ) : null;
	$codes = dreamscaper_crm_codes( $q, $c, $p );
	$docs  = dreamscaper_json( $q->docs );
	$des   = dreamscaper_json( $q->design );
	$scope = array();
	if ( ! empty( $inc['scope'] ) && ! empty( $docs['proposal']['sections'] ) ) {
		foreach ( $docs['proposal']['sections'] as $s ) {
			if ( empty( $s['optional'] ) ) {
				$scope[] = $s['title'];
			}
		}
	}
	$sent = 0;
	$errs = array();
	foreach ( (array) $recipients as $r ) {
		$rname  = isset( $r['name'] ) ? sanitize_text_field( $r['name'] ) : '';
		$rcodes = $codes;
		if ( $rname ) {
			$rcodes['customer_name']       = $rname;
			$rcodes['customer_first_name'] = preg_split( '/\s+/', $rname )[0];
		}
		$msg = dreamscaper_merge( $body, $rcodes );
		if ( in_array( $channel, array( 'email', 'both' ), true ) && ! empty( $r['email'] ) ) {
			$ok = dreamscaper_crm_mail( $p, sanitize_email( $r['email'] ), dreamscaper_merge( $subject ? $subject : '{project_name} proposal from {company_name}', $rcodes ), $msg, array(
				'link'  => ! empty( $inc['link'] ) ? $codes['quote_link'] : '',
				'image' => ! empty( $inc['image'] ) && ! empty( $des['after'] ) ? $des['after'] : '',
				'total' => ! empty( $inc['total'] ) ? $codes['quote_total'] : '',
				'scope' => $scope,
			) );
			if ( true === $ok ) {
				$sent++;
				dreamscaper_crm_log( $q->pro_id, $q->client_id, $q->id, 'email', 'Email to ' . $r['email'] . ': ' . dreamscaper_merge( $subject, $rcodes ), 0 );
			} else {
				$errs[] = $ok->get_error_message();
			}
		}
		if ( in_array( $channel, array( 'sms', 'both' ), true ) && ! empty( $r['phone'] ) ) {
			$txt = $msg;
			if ( ! empty( $inc['link'] ) && false === strpos( $txt, $codes['quote_link'] ) ) {
				$txt .= ' ' . $codes['quote_link'];
			}
			if ( ! empty( $inc['total'] ) && false === strpos( $txt, $codes['quote_total'] ) ) {
				$txt .= ' Total: ' . $codes['quote_total'] . '.';
			}
			$ok = dreamscaper_sms( $r['phone'], $txt );
			if ( true === $ok ) {
				$sent++;
				dreamscaper_crm_log( $q->pro_id, $q->client_id, $q->id, 'sms', 'Text to ' . $r['phone'] . ': ' . $txt, 0 );
			} else {
				$errs[] = $ok->get_error_message();
			}
		}
	}
	return array( 'sent' => $sent, 'errors' => array_values( array_unique( $errs ) ) );
}

/* ------------------------------------------------------------------ cron */

add_filter( 'cron_schedules', function ( $s ) {
	$s['dscp_5min'] = array( 'interval' => 300, 'display' => 'Every 5 minutes (DreamScaper)' );
	return $s;
} );
add_action( 'init', function () {
	if ( ! wp_next_scheduled( 'dreamscaper_crm_tick' ) ) {
		wp_schedule_event( time() + 60, 'dscp_5min', 'dreamscaper_crm_tick' );
	}
} );
add_action( 'dreamscaper_crm_tick', 'dreamscaper_crm_tick' );

/** Due follow-ups, recurring invoices, expiring quotes. */
function dreamscaper_crm_tick() {
	global $wpdb;
	if ( ! dreamscaper_crm_on() ) {
		return;
	}
	$F   = dreamscaper_t( 'followups' );
	$Q   = dreamscaper_t( 'quotes' );
	$due   = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM $F WHERE status='scheduled' AND send_at <= %s ORDER BY send_at LIMIT 200", dreamscaper_now() ) );
	$sends = 0;
	foreach ( $due as $f ) {
		if ( $sends >= 40 ) {
			break;
		}
		// paused accounts: leave it scheduled; it's held for review when they come back
		if ( function_exists( 'dreamscaper_sub_can_send' ) && ! dreamscaper_sub_can_send( (int) $f->pro_id ) ) {
			continue;
		}
		// payment outstanding (restricted stage): automatic texts wait; emails still go
		if ( 'email' !== $f->channel && function_exists( 'dreamscaper_pro_costly_err' ) && dreamscaper_pro_costly_err( (int) $f->pro_id, 'auto_sms' ) ) {
			continue;
		}
		$sends++;
		$q = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $Q WHERE id=%d", $f->quote_id ) );
		if ( ! $q || in_array( $q->status, array( 'signed', 'declined', 'draft' ), true ) ) {
			$wpdb->update( $F, array( 'status' => 'skipped', 'error' => $q ? 'Quote is ' . $q->status : 'Quote deleted' ), array( 'id' => $f->id ) );
			continue;
		}
		$p = dreamscaper_pro_row( $q->pro_id );
		if ( ! $p || 'approved' !== $p->status ) {
			$wpdb->update( $F, array( 'status' => 'skipped', 'error' => 'Contractor not active' ), array( 'id' => $f->id ) );
			continue;
		}
		// claim it first so two cron runs can't send it twice
		if ( ! $wpdb->update( $F, array( 'status' => 'sending' ), array( 'id' => $f->id, 'status' => 'scheduled' ) ) ) {
			continue;
		}
		$r = dreamscaper_crm_deliver( $q, $p, dreamscaper_json( $f->recipients ), $f->channel, $f->subject, $f->body, dreamscaper_json( $f->include ) );
		$wpdb->update( $F, array( 'status' => $r['sent'] ? 'sent' : 'failed', 'sent_at' => dreamscaper_now(), 'error' => mb_substr( implode( ' ', $r['errors'] ), 0, 250 ) ), array( 'id' => $f->id ) );
	}
	// quotes past their date
	$wpdb->query( $wpdb->prepare( "UPDATE $Q SET status='expired' WHERE status IN ('sent','viewed') AND valid_until IS NOT NULL AND valid_until < %s", gmdate( 'Y-m-d' ) ) );
	// recurring invoices (maintenance contracts)
	$I = dreamscaper_t( 'invoices' );
	foreach ( $wpdb->get_results( $wpdb->prepare( "SELECT * FROM $I WHERE recur<>'' AND next_at IS NOT NULL AND next_at <= %s AND status<>'void' LIMIT 60", gmdate( 'Y-m-d' ) ) ) as $inv ) {
		if ( function_exists( 'dreamscaper_sub_can_send' ) && ! dreamscaper_sub_can_send( (int) $inv->pro_id ) ) {
			continue; // resumes when the account is active again
		}
		$next = gmdate( 'Y-m-d', strtotime( $inv->next_at . ( 'weekly' === $inv->recur ? ' +1 week' : ( 'yearly' === $inv->recur ? ' +1 year' : ' +1 month' ) ) ) );
		$wpdb->update( $I, array( 'recur' => '', 'next_at' => null ), array( 'id' => $inv->id ) );
		$copy = (array) $inv;
		unset( $copy['id'] );
		$copy = array_merge( $copy, array( 'number' => dreamscaper_next_number( $inv->pro_id, 'INV' ), 'status' => 'sent', 'token' => dreamscaper_token(), 'stripe_session' => '', 'paid_at' => null, 'sent_at' => dreamscaper_now(), 'created' => dreamscaper_now(), 'due' => gmdate( 'Y-m-d', strtotime( '+14 days' ) ), 'next_at' => $next ) );
		$wpdb->insert( $I, $copy );
		$new = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $I WHERE id=%d", $wpdb->insert_id ) );
		if ( $new ) {
			dreamscaper_invoice_email( $new );
		}
	}
	dreamscaper_crm_tick_nudges();
}

/** Overdue-invoice nudges and review requests, on each contractor's own timing. */
function dreamscaper_crm_tick_nudges() {
	global $wpdb;
	if ( ! function_exists( 'dreamscaper_tpl_send' ) ) {
		return;
	}
	$I     = dreamscaper_t( 'invoices' );
	$cache = array();
	$pro   = function ( $id ) use ( &$cache ) {
		if ( ! isset( $cache[ $id ] ) ) {
			$cache[ $id ] = dreamscaper_pro_row( $id );
		}
		return $cache[ $id ];
	};
	foreach ( $wpdb->get_results( $wpdb->prepare( "SELECT * FROM $I WHERE status='sent' AND due IS NOT NULL AND due < %s ORDER BY due LIMIT 80", gmdate( 'Y-m-d' ) ) ) as $inv ) {
		$p = $pro( $inv->pro_id );
		if ( ! $p || ! dreamscaper_sub_can_send( $p->user_id ) ) {
			continue;
		}
		$t = dreamscaper_tpl_get( $p, 'invoice_overdue' );
		if ( ! $t['on'] ) {
			continue;
		}
		$tv   = $t['timingv'];
		$late = (int) floor( ( time() - strtotime( $inv->due . ' 12:00:00 UTC' ) ) / DAY_IN_SECONDS );
		if ( $late < $tv['after_days'] || (int) $inv->reminders >= $tv['max'] ) {
			continue;
		}
		if ( $inv->reminded_at && strtotime( $inv->reminded_at . ' UTC' ) > time() - max( 1, $tv['every_days'] ) * DAY_IN_SECONDS ) {
			continue;
		}
		if ( ! $wpdb->query( $wpdb->prepare( "UPDATE $I SET reminded_at=%s, reminders=reminders+1 WHERE id=%d AND reminders=%d", dreamscaper_now(), $inv->id, (int) $inv->reminders ) ) ) {
			continue;
		}
		$c = $inv->client_id ? dreamscaper_crm_get( 'clients', $inv->client_id, $p->user_id ) : null;
		dreamscaper_tpl_send( $p, 'invoice_overdue', array( 'invoice' => $inv, 'client' => $c ), dreamscaper_tpl_to_client( $c ), array( 'link' => dreamscaper_invoice_url( $inv->token ), 'button' => $p->stripe_ready ? 'View & pay invoice' : 'View invoice', 'target' => $inv->id ) );
	}
	$Q = dreamscaper_t( 'quotes' );
	foreach ( $wpdb->get_results( "SELECT * FROM $Q WHERE status='signed' AND job_status='done' AND updated > '" . gmdate( 'Y-m-d H:i:s', time() - 120 * DAY_IN_SECONDS ) . "' ORDER BY updated LIMIT 200" ) as $q ) { // phpcs:ignore
		$job = dreamscaper_json( $q->job );
		if ( ! empty( $job['review_asked'] ) ) {
			continue;
		}
		$p = $pro( $q->pro_id );
		if ( ! $p || ! dreamscaper_sub_can_send( $p->user_id ) ) {
			continue;
		}
		$t    = dreamscaper_tpl_get( $p, 'review_request' );
		$done = ! empty( $job['done_at'] ) ? (int) ( $job['done_at'] / 1000 ) : strtotime( $q->updated . ' UTC' );
		if ( ! $t['on'] || $done > time() - $t['timingv']['after_days'] * DAY_IN_SECONDS ) {
			continue;
		}
		$job['review_asked'] = time() * 1000;
		$wpdb->update( $Q, array( 'job' => wp_json_encode( $job ) ), array( 'id' => $q->id ) );
		if ( $wpdb->get_var( $wpdb->prepare( 'SELECT id FROM ' . dreamscaper_t( 'reviews' ) . ' WHERE quote_id=%d', $q->id ) ) ) {
			continue; // they already reviewed
		}
		$c = dreamscaper_crm_get( 'clients', $q->client_id, $p->user_id );
		dreamscaper_tpl_send( $p, 'review_request', array( 'quote' => $q, 'client' => $c ), dreamscaper_tpl_to_client( $c ), array( 'link' => dreamscaper_app_url( array( 'ds_projects' => 1, 'ds_review' => $q->id ) ), 'button' => 'Leave a review', 'target' => $q->id ) );
	}
}

/** Email an invoice to its customer (the contractor's “Invoice sent” message). */
function dreamscaper_invoice_email( $inv ) {
	$p = dreamscaper_pro_row( $inv->pro_id );
	$c = $inv->client_id ? dreamscaper_crm_get( 'clients', $inv->client_id, $inv->pro_id ) : null;
	if ( ! $p || ! $c ) {
		return false;
	}
	$q   = $inv->quote_id ? dreamscaper_crm_get( 'quotes', $inv->quote_id, $inv->pro_id ) : null;
	$tid = $q && function_exists( 'dreamscaper_thread_for_quote' ) ? dreamscaper_thread_for_quote( $q ) : 0;
	$res = dreamscaper_tpl_send( $p, 'invoice_sent', array( 'invoice' => $inv, 'client' => $c, 'quote' => $q ), dreamscaper_tpl_to_client( $c ), array(
		'force' => true, 'link' => dreamscaper_invoice_url( $inv->token ), 'button' => $p->stripe_ready ? 'View & pay invoice' : 'View invoice',
		'thread_id' => $tid, 'ref_type' => 'invoice', 'ref_id' => $inv->id, 'target' => $inv->id,
	) );
	if ( in_array( 'email', $res['channels'], true ) ) {
		dreamscaper_crm_log( $inv->pro_id, $inv->client_id, $inv->quote_id, 'invoice', 'Invoice ' . $inv->number . ' emailed to ' . $c->email, 0 );
	}
	return in_array( 'email', $res['channels'], true );
}

/* ------------------------------------------------------------ session */

function dreamscaper_crm_status( $uid ) {
	global $wpdb;
	if ( ! dreamscaper_crm_on() ) {
		return array( 'on' => false );
	}
	$out = array( 'on' => true, 'sms' => (bool) dreamscaper_sms_ready(), 'pay' => (bool) dreamscaper_opt( 'stripe_secret' ), 'tidy' => (bool) dreamscaper_opt( 'fal_key' ) );
	if ( ! $uid ) {
		return $out;
	}
	dreamscaper_ensure_owner_pro( $uid );
	$p = dreamscaper_pro_row( $uid );
	$out['pro'] = $p ? array( 'status' => $p->status, 'business' => $p->business ) : null;
	if ( $p && 'approved' === $p->status ) {
		$Q = dreamscaper_t( 'quotes' );
		$out['pro']['requests'] = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM $Q WHERE pro_id=%d AND status='request'", $uid ) );
	}
	$user = get_userdata( $uid );
	$Q    = dreamscaper_t( 'quotes' );
	$C    = dreamscaper_t( 'clients' );
	$out['portal'] = array(
		'quotes'   => (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM $Q q LEFT JOIN $C c ON c.id=q.client_id WHERE (q.user_id=%d OR c.user_id=%d) AND q.status IN ('sent','viewed')", $uid, $uid ) ),
		'invoices' => (int) $wpdb->get_var( $wpdb->prepare( 'SELECT COUNT(*) FROM ' . dreamscaper_t( 'invoices' ) . " WHERE user_id=%d AND status='sent'", $uid ) ),
	);
	unset( $user );
	if ( $p && 'approved' === $p->status && function_exists( 'dreamscaper_sub' ) ) {
		$sub = dreamscaper_sub( $uid );
		$pl  = dreamscaper_pro_plan( $uid );
		$out['pro']['sub'] = array(
			'status' => $sub->status, 'plan' => $pl['def']['name'], 'billing_on' => dreamscaper_subs_on(), 'writable' => dreamscaper_pro_writable( $uid ),
			'stage' => dreamscaper_sub_stage( $uid ), 'suspend_on' => ! empty( $sub->past_due_at ) ? dreamscaper_ms( dreamscaper_sub_suspend_at( $sub ) ) : null,
			'trial_days_left' => $sub->trial_ends ? max( 0, (int) ceil( ( strtotime( $sub->trial_ends . ' UTC' ) - time() ) / DAY_IN_SECONDS ) ) : null,
		);
	}
	return $out;
}

require_once __DIR__ . '/subs.php';
require_once __DIR__ . '/templates.php';
require_once __DIR__ . '/inbox.php';
require_once __DIR__ . '/calendar.php';
require_once __DIR__ . '/requests.php';
require_once __DIR__ . '/social.php';
require_once __DIR__ . '/canvass.php';
require_once __DIR__ . '/trust.php';
require_once __DIR__ . '/crm-api.php';
require_once __DIR__ . '/crm-portal.php';
require_once __DIR__ . '/crm-pay.php';
require_once __DIR__ . '/crm-public.php';
require_once __DIR__ . '/crm-admin.php';
require_once __DIR__ . '/subs-admin.php';

<?php
/**
 * DreamScaper – contractor social links and work gallery on the contractor page.
 *
 * Paste a full link or just a handle; it's normalised to a canonical URL and only accepted when
 * it points at that network's own domain. Shown as plain links (no third-party scripts or
 * trackers) with rel="noopener noreferrer nofollow ugc". How many show depends on the plan.
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** key => [label, allowed hosts, handle → URL pattern ('' = full link only)] */
function dreamscaper_social_networks() {
	return array(
		'facebook'  => array( 'Facebook', array( 'facebook.com', 'fb.com', 'm.facebook.com' ), 'https://www.facebook.com/%s' ),
		'instagram' => array( 'Instagram', array( 'instagram.com' ), 'https://www.instagram.com/%s' ),
		'google'    => array( 'Google Business Profile', array( 'g.page', 'google.com', 'maps.google.com', 'goo.gl', 'maps.app.goo.gl', 'business.google.com', 'g.co' ), '' ),
		'houzz'     => array( 'Houzz', array( 'houzz.com' ), 'https://www.houzz.com/pro/%s' ),
		'youtube'   => array( 'YouTube', array( 'youtube.com', 'youtu.be' ), 'https://www.youtube.com/@%s' ),
		'tiktok'    => array( 'TikTok', array( 'tiktok.com' ), 'https://www.tiktok.com/@%s' ),
		'x'         => array( 'X (Twitter)', array( 'x.com', 'twitter.com' ), 'https://x.com/%s' ),
		'linkedin'  => array( 'LinkedIn', array( 'linkedin.com' ), '' ),
		'pinterest' => array( 'Pinterest', array( 'pinterest.com' ), 'https://www.pinterest.com/%s' ),
		'nextdoor'  => array( 'Nextdoor', array( 'nextdoor.com' ), '' ),
		'yelp'      => array( 'Yelp', array( 'yelp.com' ), '' ),
		'angi'      => array( 'Angi', array( 'angi.com', 'angieslist.com' ), '' ),
		'bbb'       => array( 'BBB', array( 'bbb.org' ), '' ),
	);
}

/** Normalise one social entry. Returns the URL or a WP_Error. */
function dreamscaper_social_normalize( $key, $val ) {
	$nets = dreamscaper_social_networks();
	$val  = trim( (string) $val );
	if ( '' === $val || ! isset( $nets[ $key ] ) ) {
		return '';
	}
	list( $label, $hosts, $pattern ) = $nets[ $key ];
	if ( ! preg_match( '#^https?://#i', $val ) && ! preg_match( '#^[a-z0-9.-]+\.[a-z]{2,}/#i', $val ) ) {
		$handle = ltrim( preg_replace( '/\s+/', '', $val ), '@' );
		if ( ! $pattern ) {
			return new WP_Error( 'dreamscaper', 'Paste the full ' . $label . ' link (copy it from your browser’s address bar).' );
		}
		if ( ! preg_match( '/^[A-Za-z0-9._\-]{1,80}$/', $handle ) ) {
			return new WP_Error( 'dreamscaper', 'That ' . $label . ' name doesn’t look right.' );
		}
		return sprintf( $pattern, $handle );
	}
	$url  = preg_match( '#^https?://#i', $val ) ? $val : 'https://' . $val;
	$host = strtolower( (string) wp_parse_url( $url, PHP_URL_HOST ) );
	$host = preg_replace( '/^www\./', '', $host );
	$ok   = false;
	foreach ( $hosts as $h ) {
		if ( $host === $h || substr( $host, -strlen( '.' . $h ) ) === '.' . $h ) {
			$ok = true;
		}
	}
	if ( ! $ok ) {
		return new WP_Error( 'dreamscaper', 'That link isn’t a ' . $label . ' link.' );
	}
	$url = esc_url_raw( preg_replace( '#^http://#i', 'https://', $url ) );
	return $url ? $url : new WP_Error( 'dreamscaper', 'That ' . $label . ' link doesn’t look right.' );
}

/** The contractor's social links to show publicly (plan limit applied, in the order they chose). */
function dreamscaper_pro_socials( $p ) {
	$s    = dreamscaper_pro_settings( $p );
	$list = isset( $s['socials'] ) && is_array( $s['socials'] ) ? $s['socials'] : array();
	$nets = dreamscaper_social_networks();
	$lim  = function_exists( 'dreamscaper_pro_plan' ) ? (int) dreamscaper_pro_plan( $p->user_id )['def']['f']['socials'] : -1;
	$out  = array();
	foreach ( $list as $k => $url ) {
		if ( $url && isset( $nets[ $k ] ) ) {
			$out[] = array( 'key' => $k, 'label' => $nets[ $k ][0], 'url' => $url );
		}
	}
	return $lim < 0 ? $out : array_slice( $out, 0, $lim );
}

function dreamscaper_pro_gallery( $p ) {
	if ( function_exists( 'dreamscaper_pro_can' ) && ! dreamscaper_pro_can( $p->user_id, 'gallery' ) ) {
		return array();
	}
	$s = dreamscaper_pro_settings( $p );
	return isset( $s['gallery'] ) && is_array( $s['gallery'] ) ? array_values( $s['gallery'] ) : array();
}

add_action( 'rest_api_init', function () {
	$auth = function () {
		return is_user_logged_in();
	};
	register_rest_route( 'dreamscaper/v1', '/crm/socials', array( 'methods' => 'GET', 'callback' => 'dreamscaper_rest_socials_get', 'permission_callback' => $auth ) );
	register_rest_route( 'dreamscaper/v1', '/crm/socials', array( 'methods' => 'POST', 'callback' => 'dreamscaper_rest_socials_save', 'permission_callback' => $auth ) );
	register_rest_route( 'dreamscaper/v1', '/crm/gallery', array( 'methods' => 'POST', 'callback' => 'dreamscaper_rest_gallery', 'permission_callback' => $auth ) );
} );

function dreamscaper_rest_socials_get() {
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$s    = dreamscaper_pro_settings( $p );
	$nets = array();
	foreach ( dreamscaper_social_networks() as $k => $n ) {
		$nets[] = array( 'key' => $k, 'label' => $n[0], 'handle' => '' !== $n[2] );
	}
	return array(
		'networks' => $nets,
		'socials'  => isset( $s['socials'] ) && is_array( $s['socials'] ) ? $s['socials'] : new stdClass(),
		'limit'    => dreamscaper_pro_limit( $p->user_id, 'socials' ),
		'gallery'  => isset( $s['gallery'] ) && is_array( $s['gallery'] ) ? array_values( $s['gallery'] ) : array(),
		'gallery_on' => dreamscaper_pro_can( $p->user_id, 'gallery' ),
	);
}

function dreamscaper_rest_socials_save( WP_REST_Request $r ) {
	global $wpdb;
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$j    = $r->get_json_params();
	$out  = array();
	$errs = array();
	foreach ( (array) ( isset( $j['socials'] ) ? $j['socials'] : array() ) as $k => $v ) {
		$k = sanitize_key( $k );
		$u = dreamscaper_social_normalize( $k, $v );
		if ( is_wp_error( $u ) ) {
			$errs[ $k ] = $u->get_error_message();
		} elseif ( $u ) {
			$out[ $k ] = $u;
		}
	}
	if ( $errs ) {
		return new WP_Error( 'dreamscaper', reset( $errs ), array( 'status' => 400, 'fields' => $errs ) );
	}
	$s            = dreamscaper_pro_settings( $p );
	$s['socials'] = $out;
	$wpdb->update( dreamscaper_t( 'pros' ), array( 'settings' => wp_json_encode( $s ) ), array( 'user_id' => $p->user_id ) );
	$lim = dreamscaper_pro_limit( $p->user_id, 'socials' );
	return array( 'socials' => $out ? $out : new stdClass(), 'limit' => $lim, 'note' => $lim['limit'] >= 0 && count( $out ) > $lim['limit'] ? 'All your links are saved. Your plan shows the first ' . $lim['limit'] . ' on your profile — upgrade to show them all.' : '' );
}

/** Work gallery: add (data URI or one of your job photos), remove, reorder. */
function dreamscaper_rest_gallery( WP_REST_Request $r ) {
	global $wpdb;
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$gate = dreamscaper_pro_gate( $p->user_id, 'gallery' );
	if ( is_wp_error( $gate ) ) {
		return $gate;
	}
	$j = $r->get_json_params();
	$s = dreamscaper_pro_settings( $p );
	$g = isset( $s['gallery'] ) && is_array( $s['gallery'] ) ? array_values( $s['gallery'] ) : array();
	if ( ! empty( $j['add'] ) ) {
		if ( count( $g ) >= 60 ) {
			return dreamscaper_crm_err( 'Your gallery holds 60 photos. Remove one to add another.' );
		}
		$url = dreamscaper_crm_store_image( $j['add'], 8 * MB_IN_BYTES );
		if ( ! $url ) {
			return dreamscaper_crm_err( 'That picture couldn’t be added.' );
		}
		$g[] = array( 'url' => $url, 'caption' => mb_substr( sanitize_text_field( isset( $j['caption'] ) ? $j['caption'] : '' ), 0, 120 ) );
	}
	if ( ! empty( $j['remove'] ) ) {
		$g = array_values( array_filter( $g, function ( $x ) use ( $j ) { return $x['url'] !== $j['remove']; } ) );
	}
	if ( isset( $j['order'] ) && is_array( $j['order'] ) ) {
		$by = array();
		foreach ( $g as $x ) {
			$by[ $x['url'] ] = $x;
		}
		$n = array();
		foreach ( $j['order'] as $u ) {
			if ( isset( $by[ $u ] ) ) {
				$n[] = $by[ $u ];
				unset( $by[ $u ] );
			}
		}
		$g = array_merge( $n, array_values( $by ) );
	}
	$s['gallery'] = $g;
	$wpdb->update( dreamscaper_t( 'pros' ), array( 'settings' => wp_json_encode( $s ) ), array( 'user_id' => $p->user_id ) );
	return array( 'gallery' => $g );
}

<?php
/**
 * DreamScaper – contractor social links and work gallery on the contractor page.
 *
 * Paste a full link or just a handle; it's normalised to a canonical URL and only accepted when
 * it points at that network's own domain. Each link has its own on/off switch, and a switched-on
 * link shows everywhere the contractor appears (profile, directory card, proposals, invoices).
 * Plain links only — no third-party scripts or trackers — with rel="noopener noreferrer nofollow ugc".
 * Every plan gets every network; the work gallery depends on the plan.
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * key => [label, allowed hosts, handle → URL pattern ('' = full link only)].
 * In display order, most valuable to a landscaping business first — where space is tight
 * (the Find a Contractor card) the first three switched-on links are shown.
 * Add a network with the 'dreamscaper_social_networks' filter.
 */
function dreamscaper_social_networks() {
	return apply_filters( 'dreamscaper_social_networks', array(
		'google'    => array( 'Google Business Profile', array( 'g.page', 'google.com', 'maps.google.com', 'goo.gl', 'maps.app.goo.gl', 'business.google.com', 'g.co', 'share.google' ), '' ),
		'facebook'  => array( 'Facebook', array( 'facebook.com', 'fb.com', 'm.facebook.com' ), 'https://www.facebook.com/%s' ),
		'instagram' => array( 'Instagram', array( 'instagram.com' ), 'https://www.instagram.com/%s' ),
		'houzz'     => array( 'Houzz', array( 'houzz.com', 'houzz.co.uk', 'houzz.ca', 'houzz.com.au' ), 'https://www.houzz.com/pro/%s' ),
		'youtube'   => array( 'YouTube', array( 'youtube.com', 'youtu.be' ), 'https://www.youtube.com/@%s' ),
		'nextdoor'  => array( 'Nextdoor', array( 'nextdoor.com' ), '' ),
		'tiktok'    => array( 'TikTok', array( 'tiktok.com' ), 'https://www.tiktok.com/@%s' ),
		'linkedin'  => array( 'LinkedIn', array( 'linkedin.com' ), '' ),
	) );
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
		// friendlier: say which network it does belong to
		foreach ( $nets as $k => $n ) {
			foreach ( $n[1] as $h ) {
				if ( $host === $h || substr( $host, -strlen( '.' . $h ) ) === '.' . $h ) {
					return new WP_Error( 'dreamscaper', 'That looks like a ' . $n[0] . ' link — paste it in the ' . $n[0] . ' row.' );
				}
			}
		}
		return new WP_Error( 'dreamscaper', 'That link isn’t a ' . $label . ' link.' );
	}
	// drop tracking parameters (utm_*, fbclid, igshid, si…) so the link is clean and shareable
	$q = (string) wp_parse_url( $url, PHP_URL_QUERY );
	if ( $q ) {
		parse_str( $q, $args );
		foreach ( array_keys( $args ) as $k ) {
			if ( preg_match( '/^(utm_|fbclid$|gclid$|igshid$|igsh$|si$|mibextid$|ref$|ref_src$|_r$)/i', $k ) ) {
				unset( $args[ $k ] );
			}
		}
		$url = strtok( $url, '?' ) . ( $args ? '?' . http_build_query( $args ) : '' );
	}
	$url = esc_url_raw( preg_replace( '#^http://#i', 'https://', $url ) );
	return $url ? $url : new WP_Error( 'dreamscaper', 'That ' . $label . ' link doesn’t look right.' );
}

/** Saved links (key => url) and the ones the contractor switched off (key => true). */
function dreamscaper_pro_social_state( $p ) {
	$s    = dreamscaper_pro_settings( $p );
	$list = isset( $s['socials'] ) && is_array( $s['socials'] ) ? $s['socials'] : array();
	$off  = isset( $s['socials_off'] ) && is_array( $s['socials_off'] ) ? array_fill_keys( $s['socials_off'], true ) : array();
	return array( $list, $off );
}

/**
 * The contractor's social links to show publicly: switched-on links only, in network order.
 * Every surface (profile, Find a Contractor card, proposals, invoices, emails) uses this, so a
 * link switched off disappears everywhere at once.
 */
function dreamscaper_pro_socials( $p ) {
	list( $list, $off ) = dreamscaper_pro_social_state( $p );
	$out = array();
	foreach ( dreamscaper_social_networks() as $k => $n ) {
		if ( ! empty( $list[ $k ] ) && empty( $off[ $k ] ) ) {
			$out[] = array( 'key' => $k, 'label' => $n[0], 'url' => $list[ $k ] );
		}
	}
	return $out;
}

/** Plain-text social links for printed proposals and invoices ("Instagram: instagram.com/name"). */
function dreamscaper_pro_socials_footer( $p ) {
	if ( ! $p ) {
		return '';
	}
	$links = dreamscaper_pro_socials( $p );
	if ( ! $links ) {
		return '';
	}
	$out = '<div class="card sm" style="text-align:center"><span class="muted">Find ' . esc_html( $p->business ) . ' on</span><br>';
	foreach ( $links as $i => $l ) {
		$short = preg_replace( '#^https?://(www\.)?#', '', rtrim( $l['url'], '/' ) );
		$out  .= ( $i ? ' · ' : '' ) . '<a href="' . esc_url( $l['url'] ) . '" target="_blank" rel="noopener noreferrer nofollow ugc" aria-label="' . esc_attr( $p->business . ' on ' . $l['label'] ) . '"><b>' . esc_html( $l['label'] ) . '</b></a> <span class="muted">' . esc_html( mb_substr( $short, 0, 48 ) ) . '</span>';
	}
	return $out . '</div>';
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
	list( $list, $off ) = dreamscaper_pro_social_state( $p );
	$s    = dreamscaper_pro_settings( $p );
	$nets = array();
	foreach ( dreamscaper_social_networks() as $k => $n ) {
		$nets[] = array( 'key' => $k, 'label' => $n[0], 'handle' => '' !== $n[2], 'url' => isset( $list[ $k ] ) ? $list[ $k ] : '', 'on' => empty( $off[ $k ] ) );
	}
	return array(
		'networks'   => $nets,
		'socials'    => $list ? $list : new stdClass(),
		'gallery'    => isset( $s['gallery'] ) && is_array( $s['gallery'] ) ? array_values( $s['gallery'] ) : array(),
		'gallery_on' => dreamscaper_pro_can( $p->user_id, 'gallery' ),
	);
}

/** Save links and on/off switches. Body: { socials: {key: url}, off: [keys] } */
function dreamscaper_rest_socials_save( WP_REST_Request $r ) {
	global $wpdb;
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	if ( ! dreamscaper_limit( 'socials', 60, HOUR_IN_SECONDS ) ) {
		return dreamscaper_crm_err( 'Please wait a moment and try again.', 429 );
	}
	$j    = $r->get_json_params();
	$nets = dreamscaper_social_networks();
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
	$off = array_values( array_intersect( array_map( 'sanitize_key', (array) ( isset( $j['off'] ) ? $j['off'] : array() ) ), array_keys( $nets ) ) );
	$s   = dreamscaper_pro_settings( $p );
	// links for networks no longer offered stay saved (just not shown)
	$keep = array_diff_key( isset( $s['socials'] ) && is_array( $s['socials'] ) ? $s['socials'] : array(), $nets );
	$s['socials']     = array_merge( $keep, $out );
	$s['socials_off'] = $off;
	$wpdb->update( dreamscaper_t( 'pros' ), array( 'settings' => wp_json_encode( $s ) ), array( 'user_id' => $p->user_id ) );
	$shown = count( dreamscaper_pro_socials( dreamscaper_pro_row( $p->user_id ) ) );
	return array( 'socials' => $out ? $out : new stdClass(), 'off' => $off, 'shown' => $shown );
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
			return ! empty( $GLOBALS['dscp_upload_err'] ) ? $GLOBALS['dscp_upload_err'] : dreamscaper_crm_err( 'That picture couldn’t be added.' );
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

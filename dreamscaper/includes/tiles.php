<?php
/**
 * DreamScaper – aerial imagery as map tiles, so measuring happens on a map you can pan and zoom freely
 * (no edge of a picture, no blank space). Standard web-map tiles (z/x/y, Web Mercator, 256 px shown,
 * 512 px fetched for sharp screens), cut from the same imagery as the bird's-eye view: Connecticut's
 * 3-inch state imagery inside CT, the nationwide service from Settings elsewhere (USGS NAIP by default).
 *
 *  ?ds_tile=1&z=19&x=…&y=…   one tile (JPEG) — signed-in users only; cached on disk for 60 days
 *  GET /aerial/info          which imagery covers a point (lat/lng, or an address to look up) and how sharp it is
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const DREAMSCAPER_TILE_MAXZ = 21;

add_action( 'init', function () {
	if ( empty( $_GET['ds_tile'] ) ) { // phpcs:ignore
		return;
	}
	$z = isset( $_GET['z'] ) ? (int) $_GET['z'] : 0; // phpcs:ignore
	$x = isset( $_GET['x'] ) ? (int) $_GET['x'] : 0; // phpcs:ignore
	$y = isset( $_GET['y'] ) ? (int) $_GET['y'] : 0; // phpcs:ignore
	dreamscaper_tile_serve( $z, $x, $y );
	exit;
}, 1 );

/** Lat/lng of a tile corner (Web Mercator). */
function dreamscaper_tile_latlng( $z, $x, $y ) {
	$n = pow( 2, $z );
	return array( rad2deg( atan( sinh( M_PI * ( 1 - 2 * $y / $n ) ) ) ), $x / $n * 360 - 180 );
}

function dreamscaper_tile_serve( $z, $x, $y ) {
	$n = pow( 2, max( 0, $z ) );
	if ( $z < 10 || $z > DREAMSCAPER_TILE_MAXZ || $x < 0 || $y < 0 || $x >= $n || $y >= $n ) {
		status_header( 404 );
		return;
	}
	if ( ! is_user_logged_in() ) {
		status_header( 403 );
		return;
	}
	// centre of the tile decides which imagery to use
	$c   = dreamscaper_tile_latlng( $z, $x + 0.5, $y + 0.5 );
	$src = dreamscaper_aerial_source( $c[0], $c[1] );
	if ( ! $src ) {
		status_header( 404 );
		return;
	}
	$key  = false !== strpos( $src[0], 'cteco' ) ? 'ct' : substr( md5( $src[0] ), 0, 8 );
	$up   = wp_upload_dir();
	$dir  = trailingslashit( $up['basedir'] ) . 'dreamscaper-tiles/' . $key . "/$z/$x";
	$file = "$dir/$y.jpg";
	if ( ! file_exists( $file ) || filemtime( $file ) < time() - 60 * DAY_IN_SECONDS ) {
		if ( ! dreamscaper_limit( 'tile', 6000, HOUR_IN_SECONDS ) ) {
			status_header( 429 );
			return;
		}
		$E    = 20037508.342789244;
		$size = 2 * $E / $n;
		$minx = -$E + $x * $size;
		$maxy = $E - $y * $size;
		$url  = add_query_arg( array(
			'bbox'        => implode( ',', array( $minx, $maxy - $size, $minx + $size, $maxy ) ),
			'bboxSR'      => 3857,
			'imageSR'     => 3857,
			'size'        => '512,512',
			'format'      => 'jpg',
			'bandIds'     => '0,1,2',
			'compression' => 85,
			'f'           => 'image',
		), $src[0] );
		$res = wp_remote_get( $url, array( 'timeout' => 20 ) );
		$ct  = wp_remote_retrieve_header( $res, 'content-type' );
		if ( is_wp_error( $res ) || 200 !== wp_remote_retrieve_response_code( $res ) || false === strpos( (string) $ct, 'image' ) ) {
			status_header( 502 );
			return;
		}
		wp_mkdir_p( $dir );
		$root = trailingslashit( $up['basedir'] ) . 'dreamscaper-tiles/';
		if ( ! file_exists( $root . 'index.html' ) ) {
			@file_put_contents( $root . 'index.html', '' );
		}
		file_put_contents( $file, wp_remote_retrieve_body( $res ) );
	}
	// cached by this browser only (tiles need a signed-in user, so never by shared caches)
	if ( function_exists( 'header_remove' ) ) {
		header_remove( 'Pragma' );
		header_remove( 'Expires' );
	}
	header( 'Content-Type: image/jpeg' );
	header( 'Cache-Control: private, max-age=2592000' );
	header( 'Content-Length: ' . filesize( $file ) );
	readfile( $file ); // phpcs:ignore
}

add_action( 'rest_api_init', function () {
	register_rest_route( 'dreamscaper/v1', '/aerial/info', array( 'methods' => 'GET', 'callback' => 'dreamscaper_rest_aerial_info', 'permission_callback' => function () { return is_user_logged_in(); } ) );
} );
function dreamscaper_rest_aerial_info( WP_REST_Request $r ) {
	$lat  = (float) $r->get_param( 'lat' );
	$lng  = (float) $r->get_param( 'lng' );
	$addr = sanitize_text_field( (string) $r->get_param( 'address' ) );
	// typed by hand (not picked from the suggestions): find it first
	if ( ( ! $lat || ! $lng ) && '' !== $addr ) {
		if ( ! dreamscaper_limit( 'geo', 300, HOUR_IN_SECONDS ) ) {
			return new WP_Error( 'dreamscaper', 'Too many address lookups. Please wait a bit.', array( 'status' => 429 ) );
		}
		$g = dreamscaper_geocode( $addr );
		if ( ! $g ) {
			return new WP_Error( 'dreamscaper', 'We couldn\'t find that address. Include the street number, town and state.', array( 'status' => 404 ) );
		}
		$lat = (float) $g['lat'];
		$lng = (float) $g['lng'];
	}
	if ( ! $lat || ! $lng ) {
		return new WP_Error( 'dreamscaper', 'Type the address first.', array( 'status' => 400 ) );
	}
	$src = dreamscaper_aerial_source( $lat, $lng );
	return array(
		'lat'    => $lat,
		'lng'    => $lng,
		'ok'     => (bool) $src,
		'source' => $src ? $src[1] : '',
		'res'    => $src ? (float) $src[2] : 0,
		'ct'     => $src && false !== strpos( $src[0], 'cteco' ),
		'tiles'  => add_query_arg( array( 'ds_tile' => 1 ), home_url( '/' ) ) . '&z={z}&x={x}&y={y}',
		'max'    => DREAMSCAPER_TILE_MAXZ,
	);
}

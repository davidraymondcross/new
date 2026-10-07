<?php
/**
 * DreamScaper – Route planner (server side). The browser does the ordering (assets/js/routeopt.js);
 * the server answers what needs outside data, cached and rate-limited:
 *
 *  GET  /crm/route/vehicles   vehicle catalogue (typical MPG, tank size, fuel) + the contractor's own vehicles
 *  POST /crm/route/geocode    addresses → coordinates (US Census geocoder, cached)
 *  POST /crm/route/matrix     driving miles & minutes between points: Google Routes API when a key is set,
 *                             else an OSRM server if one is set, else null (the browser estimates)
 *  POST /crm/route/places     restaurants or gas stations near a point: Google Places (with gas prices) when a
 *                             key is set, else OpenStreetMap (no prices)
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

add_action( 'rest_api_init', function () {
	$auth = function () {
		return is_user_logged_in();
	};
	register_rest_route( 'dreamscaper/v1', '/crm/route/vehicles', array( 'methods' => 'GET', 'callback' => 'dreamscaper_rest_route_vehicles', 'permission_callback' => $auth ) );
	foreach ( array( 'geocode', 'matrix', 'places' ) as $k ) {
		register_rest_route( 'dreamscaper/v1', '/crm/route/' . $k, array( 'methods' => 'POST', 'callback' => 'dreamscaper_rest_route_' . $k, 'permission_callback' => $auth ) );
	}
} );

/**
 * Common work vehicles: [ label, typical combined MPG, tank gallons, fuel ].
 * EPA combined ratings where the vehicle is rated; heavy-duty trucks and vans aren't EPA-rated, so those
 * are typical real-world figures. Contractors can adjust the MPG for their own truck.
 */
function dreamscaper_vehicles() {
	return array(
		'f150_eco'      => array( 'Ford F-150 (2.7L/3.5L EcoBoost, 4x4)', 20, 26, 'gas' ),
		'f150_v8'       => array( 'Ford F-150 (5.0L V8, 4x4)', 18, 26, 'gas' ),
		'f150_hybrid'   => array( 'Ford F-150 PowerBoost hybrid', 23, 30.4, 'gas' ),
		'f250_gas'      => array( 'Ford F-250 Super Duty (gas)', 13, 34, 'gas' ),
		'f250_diesel'   => array( 'Ford F-250 Super Duty (6.7L diesel)', 16, 34, 'diesel' ),
		'f350_gas'      => array( 'Ford F-350 Super Duty (gas)', 12, 34, 'gas' ),
		'f350_diesel'   => array( 'Ford F-350 Super Duty (6.7L diesel)', 15, 48, 'diesel' ),
		'ranger'        => array( 'Ford Ranger (2.3L)', 22, 18, 'gas' ),
		'maverick_hyb'  => array( 'Ford Maverick hybrid', 37, 13.8, 'gas' ),
		'maverick'      => array( 'Ford Maverick (2.0L EcoBoost)', 25, 13.8, 'gas' ),
		'transit'       => array( 'Ford Transit cargo van (3.5L)', 15, 25, 'gas' ),
		'e350'          => array( 'Ford E-350 cutaway / box truck (7.3L)', 10, 40, 'gas' ),
		'silverado_v8'  => array( 'Chevrolet Silverado 1500 (5.3L V8, 4WD)', 17, 24, 'gas' ),
		'silverado_27'  => array( 'Chevrolet Silverado 1500 (2.7L Turbo)', 19, 24, 'gas' ),
		'silverado_d'   => array( 'Chevrolet Silverado 1500 (3.0L Duramax diesel)', 26, 24, 'diesel' ),
		'silverado_hd'  => array( 'Chevrolet Silverado 2500HD (6.6L gas)', 13, 36, 'gas' ),
		'silverado_hdd' => array( 'Chevrolet Silverado 2500HD (6.6L Duramax diesel)', 15, 36, 'diesel' ),
		'colorado'      => array( 'Chevrolet Colorado (2.7L Turbo)', 20, 21, 'gas' ),
		'express'       => array( 'Chevrolet Express 2500 van (6.6L)', 13, 31, 'gas' ),
		'sierra_v8'     => array( 'GMC Sierra 1500 (5.3L V8)', 17, 24, 'gas' ),
		'sierra_hd'     => array( 'GMC Sierra 2500HD (6.6L gas)', 13, 36, 'gas' ),
		'ram_hemi'      => array( 'Ram 1500 (5.7L HEMI, 4x4)', 19, 26, 'gas' ),
		'ram_hurricane' => array( 'Ram 1500 (3.0L Hurricane)', 20, 23, 'gas' ),
		'ram_2500'      => array( 'Ram 2500 (6.4L gas)', 12, 31, 'gas' ),
		'ram_2500d'     => array( 'Ram 2500 (6.7L Cummins diesel)', 16, 32, 'diesel' ),
		'promaster'     => array( 'Ram ProMaster van (3.6L)', 15, 24, 'gas' ),
		'tacoma'        => array( 'Toyota Tacoma (2.4L turbo)', 21, 18, 'gas' ),
		'tundra'        => array( 'Toyota Tundra (3.4L twin-turbo, 4x4)', 19, 32.2, 'gas' ),
		'tundra_hyb'    => array( 'Toyota Tundra i-FORCE MAX hybrid', 20, 32.2, 'gas' ),
		'frontier'      => array( 'Nissan Frontier (3.8L)', 20, 21.1, 'gas' ),
		'sprinter'      => array( 'Mercedes-Benz Sprinter (2.0L diesel)', 20, 24.5, 'diesel' ),
		'isuzu_npr'     => array( 'Isuzu NPR-HD (6.6L gas)', 9, 40, 'gas' ),
	);
}
function dreamscaper_rest_route_vehicles() {
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$out = array();
	foreach ( dreamscaper_vehicles() as $id => $v ) {
		$out[] = array( 'id' => $id, 'label' => $v[0], 'mpg' => $v[1], 'tank' => $v[2], 'fuel' => $v[3] );
	}
	$s = dreamscaper_pro_settings( $p );
	return array( 'items' => $out, 'mine' => isset( $s['vehicles'] ) && is_array( $s['vehicles'] ) ? $s['vehicles'] : array(), 'google' => '' !== dreamscaper_route_key() );
}

/** The Google key for server calls: a dedicated server key if set, else the site key. */
function dreamscaper_route_key() {
	$k = (string) dreamscaper_opt( 'maps_server_key' );
	return '' !== $k ? $k : (string) dreamscaper_opt( 'maps_key' );
}
/** Headers for Google web services; a browser key restricted to this site also needs the site as referer. */
function dreamscaper_google_headers( $mask ) {
	return array( 'Content-Type' => 'application/json', 'X-Goog-Api-Key' => dreamscaper_route_key(), 'X-Goog-FieldMask' => $mask, 'Referer' => home_url( '/' ) );
}

function dreamscaper_rest_route_geocode( WP_REST_Request $r ) {
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	if ( ! dreamscaper_limit( 'rgeo', 300, HOUR_IN_SECONDS ) ) {
		return dreamscaper_crm_err( 'Too many address lookups — please wait a few minutes.', 429 );
	}
	$out = array();
	foreach ( array_slice( (array) $r->get_param( 'addresses' ), 0, 30 ) as $a ) {
		$a  = mb_substr( sanitize_text_field( (string) $a ), 0, 200 );
		$ck = 'dscp_geo_' . md5( strtolower( $a ) );
		$g  = get_transient( $ck );
		if ( false === $g ) {
			$g = $a ? dreamscaper_geocode( $a ) : null;
			set_transient( $ck, $g ? $g : 0, $g ? 30 * DAY_IN_SECONDS : HOUR_IN_SECONDS );
		}
		$out[] = $g ? array( 'address' => $a, 'lat' => (float) $g['lat'], 'lng' => (float) $g['lng'], 'ok' => true ) : array( 'address' => $a, 'ok' => false );
	}
	return array( 'items' => $out );
}

/** Driving miles and minutes between every pair of points (null when no routing service is set up). */
function dreamscaper_rest_route_matrix( WP_REST_Request $r ) {
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	if ( ! dreamscaper_limit( 'rmx', 60, HOUR_IN_SECONDS ) ) {
		return dreamscaper_crm_err( 'Too many route calculations — please wait a few minutes.', 429 );
	}
	$pts = array();
	foreach ( array_slice( (array) $r->get_param( 'points' ), 0, 25 ) as $q ) {
		$pts[] = array( (float) $q[0], (float) $q[1] );
	}
	$n = count( $pts );
	if ( $n < 2 ) {
		return array( 'miles' => null, 'minutes' => null, 'source' => 'none' );
	}
	$ck = 'dscp_rmx_' . md5( wp_json_encode( $pts ) );
	$c  = get_transient( $ck );
	if ( false !== $c ) {
		return $c;
	}
	$miles = $mins = null;
	$src   = 'estimate';
	if ( '' !== dreamscaper_route_key() ) {
		$wp = array_map( function ( $q ) { return array( 'waypoint' => array( 'location' => array( 'latLng' => array( 'latitude' => $q[0], 'longitude' => $q[1] ) ) ) ); }, $pts );
		$res = wp_remote_post( 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix', array(
			'timeout' => 20,
			'headers' => dreamscaper_google_headers( 'originIndex,destinationIndex,distanceMeters,duration,condition' ),
			'body'    => wp_json_encode( array( 'origins' => $wp, 'destinations' => $wp, 'travelMode' => 'DRIVE', 'routingPreference' => 'TRAFFIC_UNAWARE' ) ),
		) );
		$j = is_wp_error( $res ) ? null : json_decode( wp_remote_retrieve_body( $res ), true );
		if ( is_array( $j ) && isset( $j[0]['originIndex'] ) ) {
			$miles = array_fill( 0, $n, array_fill( 0, $n, null ) );
			$mins  = $miles;
			foreach ( $j as $e ) {
				if ( isset( $e['condition'] ) && 'ROUTE_EXISTS' !== $e['condition'] ) {
					continue;
				}
				$o = (int) $e['originIndex'];
				$d = (int) $e['destinationIndex'];
				$miles[ $o ][ $d ] = isset( $e['distanceMeters'] ) ? $e['distanceMeters'] / 1609.344 : 0;
				$mins[ $o ][ $d ]  = isset( $e['duration'] ) ? (float) rtrim( $e['duration'], 's' ) / 60 : 0;
			}
			$src = 'google';
		}
	}
	$osrm = rtrim( (string) dreamscaper_opt( 'osrm_url' ), '/' );
	if ( null === $miles && '' !== $osrm ) {
		$coords = implode( ';', array_map( function ( $q ) { return $q[1] . ',' . $q[0]; }, $pts ) );
		$res    = wp_remote_get( $osrm . '/table/v1/driving/' . $coords . '?annotations=distance,duration', array( 'timeout' => 20, 'user-agent' => 'DreamScaper/' . DREAMSCAPER_VERSION ) );
		$j      = is_wp_error( $res ) ? null : json_decode( wp_remote_retrieve_body( $res ), true );
		if ( is_array( $j ) && isset( $j['code'] ) && 'Ok' === $j['code'] ) {
			$miles = array_map( function ( $row ) { return array_map( function ( $m ) { return null === $m ? null : $m / 1609.344; }, $row ); }, $j['distances'] );
			$mins  = array_map( function ( $row ) { return array_map( function ( $s ) { return null === $s ? null : $s / 60; }, $row ); }, $j['durations'] );
			$src   = 'osrm';
		}
	}
	$out = array( 'miles' => $miles, 'minutes' => $mins, 'source' => $src );
	if ( 'estimate' !== $src ) {
		set_transient( $ck, $out, DAY_IN_SECONDS );
	}
	return $out;
}

/** Restaurants ("food") or gas stations ("fuel") near a point, nearest first, with regular/diesel prices when known. */
function dreamscaper_rest_route_places( WP_REST_Request $r ) {
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	if ( ! dreamscaper_limit( 'rpl', 120, HOUR_IN_SECONDS ) ) {
		return dreamscaper_crm_err( 'Too many place searches — please wait a few minutes.', 429 );
	}
	$lat  = (float) $r->get_param( 'lat' );
	$lng  = (float) $r->get_param( 'lng' );
	$kind = 'fuel' === $r->get_param( 'kind' ) ? 'fuel' : 'food';
	$rad  = max( 300, min( 15000, (int) $r->get_param( 'radius' ) ) );
	$ck   = 'dscp_rpl_' . md5( $kind . round( $lat, 3 ) . round( $lng, 3 ) . $rad );
	$c    = get_transient( $ck );
	if ( false !== $c ) {
		return $c;
	}
	$items = array();
	$src   = 'none';
	if ( '' !== dreamscaper_route_key() ) {
		$types = 'fuel' === $kind ? array( 'gas_station' ) : array( 'fast_food_restaurant', 'restaurant', 'sandwich_shop', 'hamburger_restaurant', 'pizza_restaurant', 'meal_takeaway' );
		$res   = wp_remote_post( 'https://places.googleapis.com/v1/places:searchNearby', array(
			'timeout' => 15,
			'headers' => dreamscaper_google_headers( 'places.displayName,places.location,places.formattedAddress' . ( 'fuel' === $kind ? ',places.fuelOptions' : '' ) ),
			'body'    => wp_json_encode( array( 'includedTypes' => $types, 'maxResultCount' => 20, 'rankPreference' => 'DISTANCE', 'locationRestriction' => array( 'circle' => array( 'center' => array( 'latitude' => $lat, 'longitude' => $lng ), 'radius' => $rad ) ) ) ),
		) );
		$j = is_wp_error( $res ) ? null : json_decode( wp_remote_retrieve_body( $res ), true );
		if ( is_array( $j ) && isset( $j['places'] ) ) {
			$src = 'google';
			foreach ( $j['places'] as $pl ) {
				$it = array( 'name' => isset( $pl['displayName']['text'] ) ? $pl['displayName']['text'] : 'Place', 'lat' => (float) $pl['location']['latitude'], 'lng' => (float) $pl['location']['longitude'], 'address' => isset( $pl['formattedAddress'] ) ? $pl['formattedAddress'] : '' );
				if ( ! empty( $pl['fuelOptions']['fuelPrices'] ) ) {
					foreach ( $pl['fuelOptions']['fuelPrices'] as $fp ) {
						$price = (float) ( isset( $fp['price']['units'] ) ? $fp['price']['units'] : 0 ) + (float) ( isset( $fp['price']['nanos'] ) ? $fp['price']['nanos'] : 0 ) / 1e9;
						if ( 'REGULAR_UNLEADED' === $fp['type'] ) {
							$it['regular'] = $price;
						}
						if ( 'DIESEL' === $fp['type'] ) {
							$it['diesel'] = $price;
						}
						if ( isset( $fp['updateTime'] ) ) {
							$it['updated'] = $fp['updateTime'];
						}
					}
				}
				$items[] = $it;
			}
		} elseif ( is_array( $j ) && isset( $j['error']['message'] ) ) {
			$src = 'google_error';
		}
	}
	if ( 'google' !== $src ) {
		$q   = 'fuel' === $kind ? '["amenity"="fuel"]' : '["amenity"~"^(fast_food|restaurant|cafe)$"]';
		$ql  = '[out:json][timeout:15];nwr(around:' . $rad . ',' . $lat . ',' . $lng . ')' . $q . ';out center 40;';
		$res = wp_remote_post( 'https://overpass-api.de/api/interpreter', array( 'timeout' => 20, 'body' => array( 'data' => $ql ), 'user-agent' => 'DreamScaper/' . DREAMSCAPER_VERSION ) );
		$j   = is_wp_error( $res ) ? null : json_decode( wp_remote_retrieve_body( $res ), true );
		if ( is_array( $j ) && isset( $j['elements'] ) ) {
			$src = 'osm';
			foreach ( $j['elements'] as $e ) {
				$la = isset( $e['lat'] ) ? $e['lat'] : ( isset( $e['center']['lat'] ) ? $e['center']['lat'] : null );
				$lo = isset( $e['lon'] ) ? $e['lon'] : ( isset( $e['center']['lon'] ) ? $e['center']['lon'] : null );
				if ( null === $la ) {
					continue;
				}
				$items[] = array( 'name' => isset( $e['tags']['name'] ) ? $e['tags']['name'] : ( isset( $e['tags']['brand'] ) ? $e['tags']['brand'] : ( 'fuel' === $kind ? 'Gas station' : 'Restaurant' ) ), 'lat' => (float) $la, 'lng' => (float) $lo, 'address' => trim( ( isset( $e['tags']['addr:housenumber'] ) ? $e['tags']['addr:housenumber'] . ' ' : '' ) . ( isset( $e['tags']['addr:street'] ) ? $e['tags']['addr:street'] : '' ) ) );
			}
		}
	}
	$out = array( 'items' => array_slice( $items, 0, 30 ), 'source' => $src, 'prices' => 'google' === $src && 'fuel' === $kind );
	if ( 'none' !== $src && 'google_error' !== $src ) {
		set_transient( $ck, $out, 'fuel' === $kind ? 2 * HOUR_IN_SECONDS : 7 * DAY_IN_SECONDS );
	}
	return $out;
}

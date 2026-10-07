<?php
/**
 * DreamScaper – Measure Property Features (Contractor Hub).
 *
 *  POST /crm/measurement          save a measurement (screenshot, named areas, total) to a customer's property —
 *                                 an existing customer, a new one (created here) and/or a given property
 *  POST /crm/measurement/delete   remove one
 *
 * Measurements live on the property (data.measurements, newest first) so they show on the customer page
 * and stay with the address. The screenshot is stored like other contractor uploads (counts toward storage).
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

add_action( 'rest_api_init', function () {
	$auth = function () {
		return is_user_logged_in();
	};
	register_rest_route( 'dreamscaper/v1', '/crm/measurement', array( 'methods' => 'POST', 'callback' => 'dreamscaper_rest_measurement_save', 'permission_callback' => $auth ) );
	register_rest_route( 'dreamscaper/v1', '/crm/measurement/delete', array( 'methods' => 'POST', 'callback' => 'dreamscaper_rest_measurement_delete', 'permission_callback' => $auth ) );
} );

/** Same address? (case, punctuation and "Street"/"St" differences ignored) */
function dreamscaper_same_address( $a, $b ) {
	$n = function ( $s ) {
		$s = strtolower( (string) $s );
		$s = preg_replace( '/\b(street)\b/', 'st', $s );
		$s = preg_replace( '/\b(avenue)\b/', 'ave', $s );
		$s = preg_replace( '/\b(road)\b/', 'rd', $s );
		$s = preg_replace( '/\b(drive)\b/', 'dr', $s );
		$s = preg_replace( '/\b(lane)\b/', 'ln', $s );
		$s = preg_replace( '/\b(court)\b/', 'ct', $s );
		$s = preg_replace( '/[^a-z0-9]+/', ' ', $s );
		return trim( implode( ' ', array_slice( explode( ' ', trim( $s ) ), 0, 3 ) ) ); // number + street name
	};
	return '' !== $n( $a ) && $n( $a ) === $n( $b );
}

function dreamscaper_rest_measurement_save( WP_REST_Request $r ) {
	global $wpdb;
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$j       = $r->get_json_params();
	$address = dreamscaper_crm_txt( $j, 'address', 200 );
	$client  = (int) ( isset( $j['client_id'] ) ? $j['client_id'] : 0 );
	// a new customer, created with this address as their first property
	if ( ! $client && ! empty( $j['new_client'] ) && is_array( $j['new_client'] ) ) {
		$nc  = $j['new_client'];
		$req = new WP_REST_Request( 'POST' );
		$req->set_header( 'content-type', 'application/json' );
		$req->set_body( wp_json_encode( array(
			'name'    => isset( $nc['name'] ) ? $nc['name'] : '',
			'phone'   => isset( $nc['phone'] ) ? $nc['phone'] : '',
			'email'   => isset( $nc['email'] ) ? $nc['email'] : '',
			'address' => $address,
			'stage'   => 'lead',
			'source'  => 'other',
		) ) );
		$c = dreamscaper_crm_client_save( $req );
		if ( is_wp_error( $c ) ) {
			return $c;
		}
		$client = (int) $c['id'];
	}
	if ( ! dreamscaper_crm_get( 'clients', $client, $p->user_id ) ) {
		return dreamscaper_crm_err( 'Choose the customer to save this measurement to.' );
	}
	// the property: the one given, else the customer's property at this address, else a new one
	$prop = null;
	if ( ! empty( $j['prop_id'] ) ) {
		$prop = dreamscaper_crm_get( 'props', (int) $j['prop_id'], $p->user_id );
		if ( $prop && (int) $prop->client_id !== $client ) {
			$prop = null;
		}
	}
	if ( ! $prop ) {
		foreach ( $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( 'props' ) . ' WHERE pro_id=%d AND client_id=%d', $p->user_id, $client ) ) as $x ) {
			if ( dreamscaper_same_address( $x->address, $address ) ) {
				$prop = $x;
				break;
			}
		}
	}
	if ( ! $prop ) {
		if ( '' === $address ) {
			return dreamscaper_crm_err( 'The measurement needs the property address.' );
		}
		$wpdb->insert( dreamscaper_t( 'props' ), array( 'pro_id' => $p->user_id, 'client_id' => $client, 'address' => $address, 'lat' => (float) ( isset( $j['lat'] ) ? $j['lat'] : 0 ), 'lng' => (float) ( isset( $j['lng'] ) ? $j['lng'] : 0 ), 'photos' => '[]', 'plan' => '{}', 'data' => '{}', 'created' => dreamscaper_now(), 'updated' => dreamscaper_now() ) );
		$prop = dreamscaper_crm_get( 'props', $wpdb->insert_id, $p->user_id );
	}
	$sections = array();
	$total    = 0;
	foreach ( array_slice( (array) ( isset( $j['sections'] ) ? $j['sections'] : array() ), 0, 60 ) as $s ) {
		$sq = max( 0, (float) ( isset( $s['sqft'] ) ? $s['sqft'] : 0 ) );
		if ( ! $sq ) {
			continue;
		}
		$pitch      = isset( $s['pitch'] ) ? max( 0, min( 24, (float) $s['pitch'] ) ) : 0;
		$surface    = $pitch ? $sq * sqrt( 1 + pow( $pitch / 12, 2 ) ) : $sq;
		$sections[] = array(
			'name'    => mb_substr( sanitize_text_field( isset( $s['name'] ) ? $s['name'] : 'Area' ), 0, 80 ),
			'kind'    => sanitize_key( isset( $s['kind'] ) ? $s['kind'] : 'other' ),
			'sqft'    => round( $sq, 1 ),
			'perim'   => round( max( 0, (float) ( isset( $s['perim'] ) ? $s['perim'] : 0 ) ), 1 ),
			'pitch'   => $pitch,
			'surface' => round( $surface, 1 ),
			'pts'     => array_slice( array_map( function ( $q ) { return array( round( (float) $q[0], 2 ), round( (float) $q[1], 2 ) ); }, array_filter( (array) ( isset( $s['pts'] ) ? $s['pts'] : array() ), 'is_array' ) ), 0, 400 ),
		);
		$total += $surface;
	}
	if ( ! $sections ) {
		return dreamscaper_crm_err( 'Measure at least one area first.' );
	}
	$image = ! empty( $j['image'] ) ? dreamscaper_crm_store_image( $j['image'], 6 * MB_IN_BYTES ) : '';
	if ( ! empty( $GLOBALS['dscp_upload_err'] ) ) {
		return $GLOBALS['dscp_upload_err'];
	}
	$m = array(
		'id'       => 'm' . wp_generate_password( 10, false ),
		'at'       => time() * 1000,
		'title'    => mb_substr( sanitize_text_field( isset( $j['title'] ) ? $j['title'] : '' ), 0, 120 ),
		'address'  => $prop->address ? $prop->address : $address,
		'total'    => round( $total, 1 ),
		'sections' => $sections,
		'image'    => $image,
		'source'   => mb_substr( sanitize_text_field( isset( $j['source'] ) ? $j['source'] : '' ), 0, 120 ),
		'res'      => (float) ( isset( $j['res'] ) ? $j['res'] : 0 ),
		'visit_id' => (int) ( isset( $j['visit_id'] ) ? $j['visit_id'] : 0 ),
		'note'     => mb_substr( sanitize_textarea_field( isset( $j['note'] ) ? $j['note'] : '' ), 0, 1000 ),
	);
	$data                 = dreamscaper_json( $prop->data );
	$list                 = isset( $data['measurements'] ) && is_array( $data['measurements'] ) ? $data['measurements'] : array();
	array_unshift( $list, $m );
	$data['measurements'] = array_slice( $list, 0, 100 );
	$wpdb->update( dreamscaper_t( 'props' ), array( 'data' => wp_json_encode( $data ), 'updated' => dreamscaper_now() ), array( 'id' => $prop->id ) );
	$names = implode( ', ', array_map( function ( $s ) { return $s['name']; }, $sections ) );
	dreamscaper_crm_log( (int) $p->user_id, $client, 0, 'note', '📏 Measured ' . $names . ': ' . number_format( $total ) . ' sq ft total (' . $m['address'] . ')', get_current_user_id() );
	return array( 'ok' => true, 'client_id' => $client, 'prop_id' => (int) $prop->id, 'measurement' => $m );
}

function dreamscaper_rest_measurement_delete( WP_REST_Request $r ) {
	global $wpdb;
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$j    = $r->get_json_params();
	$prop = dreamscaper_crm_get( 'props', (int) ( isset( $j['prop_id'] ) ? $j['prop_id'] : 0 ), $p->user_id );
	if ( ! $prop ) {
		return dreamscaper_crm_err( 'Property not found.', 404 );
	}
	$id   = sanitize_text_field( isset( $j['id'] ) ? $j['id'] : '' );
	$data = dreamscaper_json( $prop->data );
	$data['measurements'] = array_values( array_filter( isset( $data['measurements'] ) ? (array) $data['measurements'] : array(), function ( $m ) use ( $id ) { return ! isset( $m['id'] ) || $m['id'] !== $id; } ) );
	$wpdb->update( dreamscaper_t( 'props' ), array( 'data' => wp_json_encode( $data ), 'updated' => dreamscaper_now() ), array( 'id' => $prop->id ) );
	return array( 'ok' => true );
}

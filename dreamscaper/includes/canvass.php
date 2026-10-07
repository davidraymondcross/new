<?php
/**
 * DreamScaper – door-to-door canvassing (contractors only).
 *
 * The contractor taps a house on the map; we look up its address and they record what happened:
 * flyer left, talked, interested, not interested, call back, wants a quote, do not return, no
 * soliciting, and more — with notes, a follow-up date and the person's contact details. Every
 * change is kept in a short history, so nobody knocks on the same door twice by accident and
 * every interested homeowner gets followed up. "Wants a quote" turns the house into a lead.
 *
 * Houses belong to the contractor's business and are never shown to homeowners or other contractors.
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'DREAMSCAPER_CANVASS_DB', 1 );

add_action( 'init', function () {
	if ( (int) get_option( 'dreamscaper_canvass_db' ) === DREAMSCAPER_CANVASS_DB ) {
		return;
	}
	global $wpdb;
	require_once ABSPATH . 'wp-admin/includes/upgrade.php';
	$c = $wpdb->get_charset_collate();
	dbDelta( 'CREATE TABLE ' . dreamscaper_t( 'canvass' ) . " (
		id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
		pro_id bigint(20) unsigned NOT NULL,
		user_id bigint(20) unsigned NOT NULL DEFAULT 0,
		lat decimal(10,7) NOT NULL DEFAULT 0,
		lng decimal(10,7) NOT NULL DEFAULT 0,
		address varchar(200) NOT NULL DEFAULT '',
		status varchar(20) NOT NULL DEFAULT 'not_home',
		flags varchar(255) NOT NULL DEFAULT '',
		name varchar(120) NOT NULL DEFAULT '',
		phone varchar(40) NOT NULL DEFAULT '',
		email varchar(120) NOT NULL DEFAULT '',
		notes text,
		follow_up date DEFAULT NULL,
		client_id bigint(20) unsigned NOT NULL DEFAULT 0,
		visits int(11) NOT NULL DEFAULT 1,
		last_at datetime NOT NULL,
		created datetime NOT NULL,
		updated datetime NOT NULL,
		PRIMARY KEY  (id),
		KEY pro_geo (pro_id,lat,lng),
		KEY pro_status (pro_id,status),
		KEY pro_follow (pro_id,follow_up)
	) $c;" );
	dbDelta( 'CREATE TABLE ' . dreamscaper_t( 'canvass_log' ) . " (
		id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
		canvass_id bigint(20) unsigned NOT NULL,
		user_id bigint(20) unsigned NOT NULL DEFAULT 0,
		status varchar(20) NOT NULL DEFAULT '',
		note varchar(500) NOT NULL DEFAULT '',
		created datetime NOT NULL,
		PRIMARY KEY  (id),
		KEY canvass_id (canvass_id,id)
	) $c;" );
	update_option( 'dreamscaper_canvass_db', DREAMSCAPER_CANVASS_DB );
}, 7 );

/** What can happen at a door: key => [label, emoji, colour, meaning]. 'stop' = never knock again. */
function dreamscaper_canvass_statuses() {
	return apply_filters( 'dreamscaper_canvass_statuses', array(
		'flyer'          => array( 'Flyer left', '📄', '#f4c95d', 'Nobody answered — left a flyer or door hanger' ),
		'not_home'       => array( 'Not home', '🚪', '#9aa5a0', 'Nobody answered, nothing left' ),
		'talked'         => array( 'Talked with them', '💬', '#5cc8ff', 'Spoke with someone at the house' ),
		'interested'     => array( 'Interested', '👍', '#2fbf71', 'Wants to hear more' ),
		'quote'          => array( 'Wants a quote', '📝', '#1f9d55', 'Ready for an estimate — becomes a lead' ),
		'callback'       => array( 'Call back / come back', '🔁', '#a77bf0', 'Asked to be contacted later' ),
		'not_interested' => array( 'Not interested', '👎', '#e8875d', 'Said no for now' ),
		'customer'       => array( 'Already a customer', '⭐', '#14806b', 'Already works with you' ),
		'competitor'     => array( 'Uses another company', '🏷️', '#c08a3e', 'Has a landscaper / lawn service already' ),
		'vacant'         => array( 'Vacant / for sale', '🏚️', '#7d8a84', 'Empty house, for sale or under construction' ),
		'access'         => array( 'Can’t reach the door', '🐕', '#b98b6e', 'Gate, dog or no access' ),
		'do_not_return'  => array( 'Do not come back', '⛔', '#d64545', 'Asked not to be visited again', 'stop' ),
		'no_soliciting'  => array( 'No soliciting sign', '🚫', '#b31b1b', 'Posted sign — never knock', 'stop' ),
	) );
}
/** Extra things that can be ticked at any door. */
function dreamscaper_canvass_flags() {
	return array(
		'flyer'    => 'Flyer / door hanger left',
		'card'     => 'Business card given',
		'owner'    => 'Spoke to the owner',
		'renter'   => 'Renter / tenant',
		'hoa'      => 'HOA neighborhood',
		'lawn'     => 'Needs lawn care',
		'beds'     => 'Beds / mulch need work',
		'hardscape'=> 'Hardscape opportunity',
		'trees'    => 'Tree work needed',
		'snow'     => 'Snow removal prospect',
	);
}

function dreamscaper_canvass_out( $r ) {
	return array(
		'id' => (int) $r->id, 'lat' => (float) $r->lat, 'lng' => (float) $r->lng, 'address' => $r->address, 'status' => $r->status,
		'flags' => array_values( array_filter( explode( ',', $r->flags ) ) ), 'name' => $r->name, 'phone' => $r->phone, 'email' => $r->email,
		'notes' => (string) $r->notes, 'follow_up' => $r->follow_up, 'client_id' => (int) $r->client_id, 'visits' => (int) $r->visits,
		'last_at' => dreamscaper_ms( $r->last_at ), 'created' => dreamscaper_ms( $r->created ),
	);
}

add_action( 'rest_api_init', function () {
	$auth = function () {
		return is_user_logged_in();
	};
	foreach ( array(
		array( '/crm/canvass', 'GET', 'dreamscaper_rest_canvass_list' ),
		array( '/crm/canvass', 'POST', 'dreamscaper_rest_canvass_save' ),
		array( '/crm/canvass/one', 'GET', 'dreamscaper_rest_canvass_one' ),
		array( '/crm/canvass/delete', 'POST', 'dreamscaper_rest_canvass_delete' ),
		array( '/crm/canvass/lead', 'POST', 'dreamscaper_rest_canvass_lead' ),
		array( '/crm/canvass/where', 'GET', 'dreamscaper_rest_canvass_where' ),
		array( '/crm/canvass/export', 'GET', 'dreamscaper_rest_canvass_export' ),
	) as $r ) {
		register_rest_route( 'dreamscaper/v1', $r[0], array( 'methods' => $r[1], 'callback' => $r[2], 'permission_callback' => $auth ) );
	}
} );

/**
 * Houses in the map view (bbox = south,west,north,east), or a list filtered by status / follow-ups due.
 * Also returns the status catalogue and where to centre the map.
 */
function dreamscaper_rest_canvass_list( WP_REST_Request $r ) {
	global $wpdb;
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$T    = dreamscaper_t( 'canvass' );
	$sql  = $wpdb->prepare( "SELECT * FROM $T WHERE pro_id=%d", $p->user_id );
	$bbox = array_map( 'floatval', explode( ',', (string) $r->get_param( 'bbox' ) ) );
	if ( 4 === count( $bbox ) && $bbox[2] > $bbox[0] ) {
		$sql .= $wpdb->prepare( ' AND lat BETWEEN %f AND %f AND lng BETWEEN %f AND %f', $bbox[0], $bbox[2], $bbox[1], $bbox[3] );
	}
	$st = sanitize_key( (string) $r->get_param( 'status' ) );
	if ( $st && isset( dreamscaper_canvass_statuses()[ $st ] ) ) {
		$sql .= $wpdb->prepare( ' AND status=%s', $st );
	}
	if ( $r->get_param( 'due' ) ) {
		$sql .= $wpdb->prepare( ' AND follow_up IS NOT NULL AND follow_up <= %s', gmdate( 'Y-m-d', time() + DAY_IN_SECONDS ) );
	}
	$q = trim( sanitize_text_field( (string) $r->get_param( 'q' ) ) );
	if ( '' !== $q ) {
		$like = '%' . $wpdb->esc_like( $q ) . '%';
		$sql .= $wpdb->prepare( ' AND (address LIKE %s OR name LIKE %s OR notes LIKE %s)', $like, $like, $like );
	}
	$rows   = $wpdb->get_results( $sql . ' ORDER BY ' . ( $r->get_param( 'due' ) ? 'follow_up ASC' : 'last_at DESC' ) . ' LIMIT 3000' ); // phpcs:ignore -- prepared above
	$counts = array();
	foreach ( $wpdb->get_results( $wpdb->prepare( "SELECT status, COUNT(*) n FROM $T WHERE pro_id=%d GROUP BY status", $p->user_id ) ) as $c ) {
		$counts[ $c->status ] = (int) $c->n;
	}
	$sts = array();
	foreach ( dreamscaper_canvass_statuses() as $k => $s ) {
		$sts[] = array( 'key' => $k, 'label' => $s[0], 'icon' => $s[1], 'color' => $s[2], 'desc' => $s[3], 'stop' => isset( $s[4] ) && 'stop' === $s[4] );
	}
	return array(
		'items'    => array_map( 'dreamscaper_canvass_out', $rows ),
		'statuses' => $sts,
		'flags'    => dreamscaper_canvass_flags(),
		'counts'   => $counts,
		'due'      => (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM $T WHERE pro_id=%d AND follow_up IS NOT NULL AND follow_up <= %s", $p->user_id, gmdate( 'Y-m-d', time() + DAY_IN_SECONDS ) ) ),
		'center'   => (float) $p->lat ? array( (float) $p->lat, (float) $p->lng ) : null,
		'tiles'    => dreamscaper_map_tiles(),
	);
}

/** The map imagery (owner setting; OpenStreetMap by default). */
function dreamscaper_map_tiles() {
	$url = trim( (string) dreamscaper_opt( 'map_tiles' ) );
	return array(
		'url'  => $url ? $url : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
		'attr' => $url ? (string) dreamscaper_opt( 'map_tiles_attr' ) : '© OpenStreetMap contributors',
		'max'  => $url ? max( 15, min( 22, (int) dreamscaper_opt( 'map_tiles_max' ) ) ) : 19,
	);
}

/** One house with its history. */
function dreamscaper_rest_canvass_one( WP_REST_Request $r ) {
	global $wpdb;
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$row = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( 'canvass' ) . ' WHERE id=%d AND pro_id=%d', (int) $r->get_param( 'id' ), $p->user_id ) );
	if ( ! $row ) {
		return dreamscaper_crm_err( 'House not found.', 404 );
	}
	$log = $wpdb->get_results( $wpdb->prepare( 'SELECT status, note, created FROM ' . dreamscaper_t( 'canvass_log' ) . ' WHERE canvass_id=%d ORDER BY id DESC LIMIT 30', $row->id ) );
	$out = dreamscaper_canvass_out( $row );
	$out['log'] = array_map( function ( $l ) { return array( 'status' => $l->status, 'note' => $l->note, 'at' => dreamscaper_ms( $l->created ) ); }, $log );
	return $out;
}

/** The nearest house already marked within ~25 m of a point (so a door is never logged twice). */
function dreamscaper_canvass_near( $pro_id, $lat, $lng, $meters = 25 ) {
	global $wpdb;
	$d   = $meters / 111000;
	$e   = $d / max( 0.2, cos( deg2rad( $lat ) ) );
	$all = $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( 'canvass' ) . ' WHERE pro_id=%d AND lat BETWEEN %f AND %f AND lng BETWEEN %f AND %f LIMIT 50', $pro_id, $lat - $d, $lat + $d, $lng - $e, $lng + $e ) );
	$best = null;
	$bd   = INF;
	foreach ( $all as $x ) {
		$dist = dreamscaper_miles( $lat, $lng, (float) $x->lat, (float) $x->lng ) * 1609.34;
		if ( $dist < $bd && $dist <= $meters ) {
			$bd   = $dist;
			$best = $x;
		}
	}
	return $best;
}

/**
 * What's at this spot: an already-marked house nearby, or the street address (reverse geocoding:
 * Google when a Maps key is set, otherwise OpenStreetMap Nominatim, cached).
 */
function dreamscaper_rest_canvass_where( WP_REST_Request $r ) {
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$lat = max( -90, min( 90, (float) $r->get_param( 'lat' ) ) );
	$lng = max( -180, min( 180, (float) $r->get_param( 'lng' ) ) );
	$hit = dreamscaper_canvass_near( (int) $p->user_id, $lat, $lng );
	if ( $hit ) {
		return array( 'existing' => dreamscaper_canvass_out( $hit ) );
	}
	if ( ! dreamscaper_limit( 'canvgeo', 600, HOUR_IN_SECONDS ) ) {
		return array( 'address' => '', 'lat' => $lat, 'lng' => $lng );
	}
	return array( 'address' => dreamscaper_reverse_geocode( $lat, $lng ), 'lat' => $lat, 'lng' => $lng );
}

function dreamscaper_reverse_geocode( $lat, $lng ) {
	$ck = 'dscp_rgeo_' . md5( round( $lat, 5 ) . ',' . round( $lng, 5 ) );
	$c  = get_transient( $ck );
	if ( false !== $c ) {
		return $c;
	}
	$addr = '';
	$key  = dreamscaper_opt( 'maps_key' );
	if ( $key ) {
		$res = wp_remote_get( add_query_arg( array( 'latlng' => $lat . ',' . $lng, 'result_type' => 'street_address|premise', 'key' => $key ), 'https://maps.googleapis.com/maps/api/geocode/json' ), array( 'timeout' => 8, 'headers' => array( 'Referer' => home_url( '/' ) ) ) );
		$j   = is_wp_error( $res ) ? null : json_decode( wp_remote_retrieve_body( $res ), true );
		if ( ! empty( $j['results'][0]['formatted_address'] ) ) {
			$addr = preg_replace( '/, USA$/', '', $j['results'][0]['formatted_address'] );
		}
	}
	if ( ! $addr ) {
		$res = wp_remote_get( add_query_arg( array( 'lat' => $lat, 'lon' => $lng, 'format' => 'jsonv2', 'zoom' => 18, 'addressdetails' => 1 ), 'https://nominatim.openstreetmap.org/reverse' ), array( 'timeout' => 8, 'user-agent' => 'DreamScaper/' . DREAMSCAPER_VERSION . ' (' . home_url() . ')' ) );
		$j   = is_wp_error( $res ) ? null : json_decode( wp_remote_retrieve_body( $res ), true );
		if ( ! empty( $j['address'] ) ) {
			$a     = $j['address'];
			$st    = isset( $a['state'] ) ? dreamscaper_state_abbr( $a['state'] ) : '';
			$town  = isset( $a['city'] ) ? $a['city'] : ( isset( $a['town'] ) ? $a['town'] : ( isset( $a['village'] ) ? $a['village'] : ( isset( $a['hamlet'] ) ? $a['hamlet'] : '' ) ) );
			$line  = trim( ( isset( $a['house_number'] ) ? $a['house_number'] . ' ' : '' ) . ( isset( $a['road'] ) ? $a['road'] : '' ) );
			$addr  = implode( ', ', array_filter( array( $line, $town, trim( $st . ' ' . ( isset( $a['postcode'] ) ? $a['postcode'] : '' ) ) ) ) );
		}
	}
	set_transient( $ck, $addr, 30 * DAY_IN_SECONDS );
	return $addr;
}

/** Create or update a house: status, extra flags, contact, notes, follow-up date. */
function dreamscaper_rest_canvass_save( WP_REST_Request $r ) {
	global $wpdb;
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	if ( ! dreamscaper_limit( 'canvsave', 600, HOUR_IN_SECONDS ) ) {
		return dreamscaper_crm_err( 'Slow down a little and try again.', 429 );
	}
	$j   = $r->get_json_params();
	$T   = dreamscaper_t( 'canvass' );
	$sts = dreamscaper_canvass_statuses();
	$id  = (int) ( isset( $j['id'] ) ? $j['id'] : 0 );
	$row = $id ? $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $T WHERE id=%d AND pro_id=%d", $id, $p->user_id ) ) : null;
	if ( $id && ! $row ) {
		return dreamscaper_crm_err( 'House not found.', 404 );
	}
	$lat = $row ? (float) $row->lat : max( -90, min( 90, (float) ( isset( $j['lat'] ) ? $j['lat'] : 0 ) ) );
	$lng = $row ? (float) $row->lng : max( -180, min( 180, (float) ( isset( $j['lng'] ) ? $j['lng'] : 0 ) ) );
	if ( ! $row ) {
		if ( ! $lat && ! $lng ) {
			return dreamscaper_crm_err( 'Tap the house on the map first.' );
		}
		$row = dreamscaper_canvass_near( (int) $p->user_id, $lat, $lng ); // never two pins on one door
	}
	$status = isset( $j['status'] ) && isset( $sts[ $j['status'] ] ) ? $j['status'] : ( $row ? $row->status : 'not_home' );
	$flags  = array_values( array_intersect( array_map( 'sanitize_key', (array) ( isset( $j['flags'] ) ? $j['flags'] : array() ) ), array_keys( dreamscaper_canvass_flags() ) ) );
	$fu     = isset( $j['follow_up'] ) && preg_match( '/^\d{4}-\d{2}-\d{2}$/', (string) $j['follow_up'] ) ? $j['follow_up'] : null;
	if ( in_array( $status, array( 'do_not_return', 'no_soliciting' ), true ) ) {
		$fu = null; // never schedule a return to a door that said no
	}
	$f = array(
		'address'   => isset( $j['address'] ) ? mb_substr( sanitize_text_field( $j['address'] ), 0, 200 ) : ( $row ? $row->address : '' ),
		'status'    => $status,
		'flags'     => implode( ',', $flags ),
		'name'      => mb_substr( sanitize_text_field( isset( $j['name'] ) ? $j['name'] : '' ), 0, 120 ),
		'phone'     => mb_substr( sanitize_text_field( isset( $j['phone'] ) ? $j['phone'] : '' ), 0, 40 ),
		'email'     => sanitize_email( isset( $j['email'] ) ? $j['email'] : '' ),
		'notes'     => mb_substr( sanitize_textarea_field( isset( $j['notes'] ) ? $j['notes'] : '' ), 0, 2000 ),
		'follow_up' => $fu,
		'updated'   => dreamscaper_now(),
	);
	$visit = ! empty( $j['visit'] ); // a new knock (vs. editing notes later)
	if ( $row ) {
		if ( $visit ) {
			$f['visits']  = (int) $row->visits + 1;
			$f['last_at'] = dreamscaper_now();
		}
		$wpdb->update( $T, $f, array( 'id' => $row->id ) );
		$cid = (int) $row->id;
	} else {
		$wpdb->insert( $T, array_merge( $f, array( 'pro_id' => $p->user_id, 'user_id' => get_current_user_id(), 'lat' => $lat, 'lng' => $lng, 'visits' => 1, 'last_at' => dreamscaper_now(), 'created' => dreamscaper_now() ) ) );
		$cid = (int) $wpdb->insert_id;
	}
	if ( ! $row || $row->status !== $status || $visit || ! empty( $j['log'] ) ) {
		$wpdb->insert( dreamscaper_t( 'canvass_log' ), array( 'canvass_id' => $cid, 'user_id' => get_current_user_id(), 'status' => $status, 'note' => mb_substr( sanitize_text_field( isset( $j['log'] ) ? $j['log'] : '' ), 0, 500 ), 'created' => dreamscaper_now() ) );
	}
	$out = dreamscaper_canvass_out( $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $T WHERE id=%d", $cid ) ) );
	// "Wants a quote" with a name and a way to reach them → a lead in the CRM, once
	if ( 'quote' === $status && ! $out['client_id'] && $f['name'] && ( $f['phone'] || is_email( $f['email'] ) ) ) {
		$lead = dreamscaper_canvass_make_lead( $p, $cid );
		if ( ! is_wp_error( $lead ) ) {
			$out['client_id'] = $lead;
			$out['lead']      = true;
		}
	}
	return $out;
}

/** Turn a house into a CRM lead (customer + property + a quote request), linked back to the pin. */
function dreamscaper_canvass_make_lead( $p, $cid ) {
	global $wpdb;
	$T   = dreamscaper_t( 'canvass' );
	$row = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $T WHERE id=%d AND pro_id=%d", $cid, $p->user_id ) );
	if ( ! $row ) {
		return new WP_Error( 'dreamscaper', 'House not found.', array( 'status' => 404 ) );
	}
	if ( $row->client_id ) {
		return (int) $row->client_id;
	}
	if ( ! $row->name || ( ! $row->phone && ! is_email( $row->email ) ) ) {
		return new WP_Error( 'dreamscaper', 'Add their name and a phone number or email first.', array( 'status' => 400 ) );
	}
	$parts = array_map( 'trim', explode( ',', $row->address ) );
	$stzip = isset( $parts[2] ) ? preg_split( '/\s+/', $parts[2] ) : array();
	$flags = array_intersect_key( dreamscaper_canvass_flags(), array_flip( array_filter( explode( ',', $row->flags ) ) ) );
	$ids   = dreamscaper_crm_new_lead( (int) $p->user_id, array(
		'name' => $row->name, 'email' => $row->email, 'phone' => $row->phone,
		'address' => isset( $parts[0] ) ? $parts[0] : $row->address, 'town' => isset( $parts[1] ) ? $parts[1] : '',
		'state' => isset( $stzip[0] ) ? dreamscaper_state_abbr( $stzip[0] ) : '', 'zip' => isset( $stzip[1] ) ? $stzip[1] : '',
		'message' => trim( 'Met door-to-door on ' . wp_date( 'M j, Y', strtotime( $row->last_at . ' UTC' ) ) . '. ' . ( $flags ? implode( ', ', $flags ) . '. ' : '' ) . $row->notes ),
	), 'door', 0, null, array( 'address' => $row->address, 'lat' => (float) $row->lat, 'lng' => (float) $row->lng ) );
	$client = is_array( $ids ) && ! empty( $ids['client'] ) ? (int) $ids['client'] : 0;
	if ( $client ) {
		$wpdb->update( $T, array( 'client_id' => $client ), array( 'id' => $cid ) );
		dreamscaper_crm_log( (int) $p->user_id, $client, is_array( $ids ) && ! empty( $ids['quote'] ) ? (int) $ids['quote'] : 0, 'note', 'New lead from door-to-door: ' . $row->address, get_current_user_id() );
	}
	return $client ? $client : new WP_Error( 'dreamscaper', 'The lead couldn’t be created.', array( 'status' => 500 ) );
}
function dreamscaper_rest_canvass_lead( WP_REST_Request $r ) {
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$j   = $r->get_json_params();
	$res = dreamscaper_canvass_make_lead( $p, (int) ( isset( $j['id'] ) ? $j['id'] : 0 ) );
	return is_wp_error( $res ) ? $res : array( 'client_id' => $res );
}

function dreamscaper_rest_canvass_delete( WP_REST_Request $r ) {
	global $wpdb;
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$j  = $r->get_json_params();
	$id = (int) ( isset( $j['id'] ) ? $j['id'] : 0 );
	if ( $wpdb->delete( dreamscaper_t( 'canvass' ), array( 'id' => $id, 'pro_id' => $p->user_id ) ) ) {
		$wpdb->delete( dreamscaper_t( 'canvass_log' ), array( 'canvass_id' => $id ) );
	}
	return array( 'ok' => true );
}

/** Spreadsheet of every house (always available, even read-only). */
function dreamscaper_rest_canvass_export() {
	global $wpdb;
	$p = function_exists( 'dreamscaper_billing_pro' ) ? dreamscaper_billing_pro() : dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$rows = $wpdb->get_results( $wpdb->prepare( 'SELECT address, status, flags, name, phone, email, notes, follow_up, visits, last_at, lat, lng FROM ' . dreamscaper_t( 'canvass' ) . ' WHERE pro_id=%d ORDER BY last_at DESC', $p->user_id ), ARRAY_A );
	$sts  = dreamscaper_canvass_statuses();
	nocache_headers();
	header( 'Content-Type: text/csv; charset=utf-8' );
	header( 'Content-Disposition: attachment; filename="door-to-door-' . gmdate( 'Y-m-d' ) . '.csv"' );
	$out = fopen( 'php://output', 'w' );
	fwrite( $out, "\xEF\xBB\xBF" );
	fputcsv( $out, array( 'Address', 'Result', 'Notes ticked', 'Name', 'Phone', 'Email', 'Notes', 'Follow up', 'Visits', 'Last visit', 'Lat', 'Lng' ) );
	foreach ( $rows as $row ) {
		$row['status'] = isset( $sts[ $row['status'] ] ) ? $sts[ $row['status'] ][0] : $row['status'];
		fputcsv( $out, array_map( function ( $v ) { return is_string( $v ) && preg_match( '/^[=+\-@]/', $v ) ? "'" . $v : $v; }, array_values( $row ) ) );
	}
	fclose( $out );
	exit;
}

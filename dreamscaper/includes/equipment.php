<?php
/**
 * DreamScaper – Equipment maintenance (Contractor Hub).
 *
 * Each piece of equipment has a type, details (make, model, serial…), the contractor's own extra fields,
 * a meter (engine hours, miles, or none) and a list of maintenance tasks — each "every N hours/miles
 * and/or every N days", whichever comes first. Common equipment comes with the usual maintenance already
 * filled in (from typical manufacturer schedules; every interval can be changed, tasks added or removed).
 * A task is due when either interval is reached and "due soon" in the last 10%. An hourly job sends one
 * digest per day when something becomes due soon or due (again weekly while overdue), by email, text or
 * both, and nudges for meter readings that haven't been updated in two weeks.
 *
 *  GET  /crm/equipment            list with due status, the catalog, reminder settings
 *  POST /crm/equipment            add / update one (new ones get the type's tasks)
 *  POST /crm/equipment/delete
 *  POST /crm/equipment/meter      new hour / mile reading
 *  POST /crm/equipment/done       log a task as done (date, reading, note, cost) — resets it
 *  POST /crm/equipment/settings   reminder settings
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'DREAMSCAPER_EQUIP_DB', 1 );
add_action( 'init', function () {
	if ( (int) get_option( 'dreamscaper_equip_db' ) === DREAMSCAPER_EQUIP_DB ) {
		return;
	}
	global $wpdb;
	require_once ABSPATH . 'wp-admin/includes/upgrade.php';
	dbDelta( 'CREATE TABLE ' . dreamscaper_t( 'equipment' ) . " (
		id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
		pro_id bigint(20) unsigned NOT NULL,
		name varchar(120) NOT NULL DEFAULT '',
		type varchar(30) NOT NULL DEFAULT 'other',
		meter_unit varchar(8) NOT NULL DEFAULT 'hours',
		meter double NOT NULL DEFAULT 0,
		meter_at datetime DEFAULT NULL,
		data longtext NULL,
		tasks longtext NULL,
		log longtext NULL,
		active tinyint(1) NOT NULL DEFAULT 1,
		created datetime NOT NULL,
		updated datetime NOT NULL,
		PRIMARY KEY  (id),
		KEY pro_id (pro_id)
	) " . $wpdb->get_charset_collate() . ';' );
	update_option( 'dreamscaper_equip_db', DREAMSCAPER_EQUIP_DB );
}, 8 );

/**
 * Equipment types: [ label, icon, meter unit, tasks[ [ name, every meter, every days, how ] ] ].
 * Intervals are typical manufacturer recommendations for commercial use — check your owner's manual.
 */
function dreamscaper_equipment_catalog() {
	return array(
		'ztr_mower'    => array( 'Zero-turn mower (commercial)', '🚜', 'hours', array(
			array( 'Change engine oil & filter', 100, 365, 'First change after the 8-hour break-in, then every 100 hours or once a season.' ),
			array( 'Sharpen or replace blades', 25, 0, 'Sharp blades cut cleaner and save fuel. Balance after sharpening.' ),
			array( 'Grease spindles, caster & pivot fittings', 40, 0, 'Wipe the fittings clean, pump until fresh grease shows.' ),
			array( 'Clean the air filter (pre-cleaner)', 25, 0, 'More often in dusty conditions.' ),
			array( 'Replace the air filter', 200, 365, '' ),
			array( 'Check tire pressure', 0, 30, 'Uneven pressure gives an uneven cut.' ),
			array( 'Inspect deck & drive belts', 50, 0, 'Look for cracks, glazing and fraying; check tension.' ),
			array( 'Clean deck underside & cooling fins', 25, 0, '' ),
			array( 'Replace the fuel filter', 250, 365, '' ),
			array( 'Replace spark plugs', 200, 365, 'Gas engines.' ),
			array( 'Change hydraulic oil & filters', 500, 730, 'Hydro drive units — use the oil your manual specifies.' ),
		) ),
		'walk_mower'   => array( 'Walk-behind mower', '🌱', 'hours', array(
			array( 'Change engine oil', 50, 365, '' ),
			array( 'Sharpen or replace blade', 25, 0, '' ),
			array( 'Clean or replace the air filter', 25, 365, '' ),
			array( 'Replace the spark plug', 100, 365, '' ),
			array( 'Inspect drive belt & cables', 50, 0, '' ),
			array( 'Clean under the deck', 10, 0, '' ),
		) ),
		'trimmer'      => array( 'String trimmer', '🌾', 'hours', array(
			array( 'Clean the air filter', 10, 0, '' ),
			array( 'Grease the gearhead', 50, 0, '' ),
			array( 'Clean the spark arrestor screen', 50, 0, '' ),
			array( 'Replace the spark plug', 100, 365, '' ),
			array( 'Replace the fuel filter', 0, 365, '' ),
		) ),
		'blower'       => array( 'Backpack / handheld blower', '💨', 'hours', array(
			array( 'Clean the air filter (pre-filter)', 10, 0, '' ),
			array( 'Replace the air filter', 100, 365, '' ),
			array( 'Clean the spark arrestor screen', 50, 0, '' ),
			array( 'Replace the spark plug', 100, 365, '' ),
			array( 'Replace the fuel filter', 0, 365, '' ),
		) ),
		'hedge'        => array( 'Hedge trimmer', '✂️', 'hours', array(
			array( 'Clean & lubricate the blades', 8, 0, 'Resin cleaner, then light oil on the blades.' ),
			array( 'Grease the gearbox', 25, 0, '' ),
			array( 'Sharpen the blades', 50, 0, '' ),
			array( 'Clean the air filter', 10, 0, '' ),
			array( 'Replace the spark plug', 100, 365, '' ),
		) ),
		'chainsaw'     => array( 'Chainsaw', '🪚', 'hours', array(
			array( 'Sharpen the chain', 5, 0, 'Or whenever it makes dust instead of chips.' ),
			array( 'Clean the air filter', 8, 0, '' ),
			array( 'Clean the bar groove & flip the bar', 10, 0, '' ),
			array( 'Check the chain brake', 0, 30, '' ),
			array( 'Replace the spark plug', 100, 365, '' ),
		) ),
		'edger'        => array( 'Edger', '📏', 'hours', array(
			array( 'Replace the edger blade', 25, 0, '' ),
			array( 'Clean the air filter', 25, 0, '' ),
			array( 'Change engine oil (4-stroke)', 50, 365, '' ),
			array( 'Replace the spark plug', 100, 365, '' ),
		) ),
		'aerator'      => array( 'Core aerator', '🕳️', 'hours', array(
			array( 'Change engine oil', 50, 365, '' ),
			array( 'Inspect / replace tines', 50, 0, '' ),
			array( 'Grease fittings & chains', 25, 0, '' ),
			array( 'Clean the air filter', 25, 0, '' ),
		) ),
		'dethatcher'   => array( 'Dethatcher / power rake', '🧹', 'hours', array(
			array( 'Inspect blades / tines', 25, 0, '' ),
			array( 'Change engine oil', 50, 365, '' ),
			array( 'Inspect the belt', 50, 0, '' ),
		) ),
		'sod_cutter'   => array( 'Sod cutter', '🟩', 'hours', array(
			array( 'Change engine oil', 50, 365, '' ),
			array( 'Sharpen / replace the blade', 25, 0, '' ),
			array( 'Grease fittings', 25, 0, '' ),
		) ),
		'skid_steer'   => array( 'Skid steer / compact track loader', '🏗️', 'hours', array(
			array( 'Grease all pivot points', 10, 0, 'Daily when working: loader arms, bucket pivots, cylinders.' ),
			array( 'Change engine oil & filter', 250, 365, 'First change at 50 hours on a new machine.' ),
			array( 'Check the air filter', 50, 0, 'Replace the outer element at 500 hours or when the indicator shows.' ),
			array( 'Check track / tire tension', 50, 0, '' ),
			array( 'Replace the hydraulic filter', 500, 0, '' ),
			array( 'Replace the fuel filter', 500, 0, '' ),
			array( 'Change hydraulic fluid', 1000, 730, '' ),
			array( 'Change coolant', 2000, 730, '' ),
		) ),
		'mini_ex'      => array( 'Mini excavator', '⛏️', 'hours', array(
			array( 'Grease boom, arm & bucket pins', 10, 0, '' ),
			array( 'Change engine oil & filter', 250, 365, 'First change at 50 hours.' ),
			array( 'Check track tension', 50, 0, '' ),
			array( 'Replace the hydraulic return filter', 500, 0, '' ),
			array( 'Replace the fuel filter', 500, 0, '' ),
			array( 'Change hydraulic oil', 1000, 730, '' ),
		) ),
		'stump_grinder' => array( 'Stump grinder', '🪵', 'hours', array(
			array( 'Inspect / rotate cutter teeth', 5, 0, '' ),
			array( 'Grease bearings', 8, 0, '' ),
			array( 'Inspect drive belts', 50, 0, '' ),
			array( 'Change engine oil', 100, 365, '' ),
		) ),
		'snow_blower'  => array( 'Snow blower', '❄️', 'hours', array(
			array( 'Check shear pins', 10, 0, 'Carry spares.' ),
			array( 'Change engine oil', 25, 365, '' ),
			array( 'Lubricate the auger gearbox', 25, 365, '' ),
			array( 'Inspect belts', 50, 0, '' ),
			array( 'Replace the spark plug', 100, 365, '' ),
		) ),
		'generator'    => array( 'Generator', '🔌', 'hours', array(
			array( 'Change engine oil', 100, 365, 'First change at 25 hours.' ),
			array( 'Clean the air filter', 50, 0, '' ),
			array( 'Replace the spark plug', 100, 365, '' ),
			array( 'Run it under load', 0, 30, 'Keeps the fuel system and battery healthy.' ),
		) ),
		'truck'        => array( 'Truck / van', '🛻', 'miles', array(
			array( 'Oil & filter change', 5000, 180, 'Severe service (towing, idling, short trips) — follow the severe schedule in your manual.' ),
			array( 'Rotate tires & check tread', 7500, 0, '' ),
			array( 'Inspect brakes', 15000, 365, '' ),
			array( 'Replace the engine air filter', 15000, 0, '' ),
			array( 'Replace the cabin air filter', 15000, 365, '' ),
			array( 'Test the battery', 0, 365, '' ),
			array( 'Replace wiper blades', 0, 365, '' ),
			array( 'Change transmission fluid', 60000, 0, '' ),
			array( 'Flush coolant', 100000, 1825, '' ),
			array( 'Registration / inspection renewal', 0, 365, 'Set the last date to your last renewal.' ),
		) ),
		'trailer'      => array( 'Trailer', '🚚', 'miles', array(
			array( 'Check tire pressure & lug nuts', 0, 30, '' ),
			array( 'Check lights & wiring', 0, 30, '' ),
			array( 'Check hitch, coupler & safety chains', 0, 90, '' ),
			array( 'Grease / repack wheel bearings', 12000, 365, '' ),
			array( 'Inspect brakes', 12000, 365, 'If equipped.' ),
			array( 'Registration renewal', 0, 365, '' ),
		) ),
		'dump_trailer' => array( 'Dump trailer', '🚛', 'miles', array(
			array( 'Check tire pressure & lug nuts', 0, 30, '' ),
			array( 'Check lights & wiring', 0, 30, '' ),
			array( 'Check hydraulic fluid & hoses', 0, 90, '' ),
			array( 'Grease hoist pivots', 0, 90, '' ),
			array( 'Grease / repack wheel bearings', 12000, 365, '' ),
			array( 'Charge / test the battery', 0, 90, '' ),
		) ),
		'snow_plow'    => array( 'Snow plow', '🧊', 'none', array(
			array( 'Grease pivot points', 0, 30, 'During the season.' ),
			array( 'Check hydraulic fluid', 0, 90, '' ),
			array( 'Inspect the cutting edge', 0, 30, '' ),
			array( 'Change hydraulic fluid', 0, 365, 'Before the season.' ),
		) ),
		'sprayer'      => array( 'Sprayer / spreader', '💧', 'none', array(
			array( 'Calibrate', 0, 90, 'And whenever you change nozzles or products.' ),
			array( 'Flush & clean', 0, 30, '' ),
			array( 'Inspect hoses, nozzles & seals', 0, 90, '' ),
		) ),
		'other'        => array( 'Other', '🔧', 'hours', array() ),
	);
}
function dreamscaper_equipment_tasks_from( $type ) {
	$cat = dreamscaper_equipment_catalog();
	$t   = isset( $cat[ $type ] ) ? $cat[ $type ][3] : array();
	return array_map( function ( $x ) { return array( 'id' => 't' . wp_generate_password( 6, false ), 'name' => $x[0], 'meter' => (float) $x[1], 'days' => (int) $x[2], 'how' => $x[3], 'on' => true, 'last_date' => '', 'last_meter' => null ); }, $t );
}
function dreamscaper_equipment_settings( $p ) {
	$s = dreamscaper_pro_settings( $p );
	return array_merge( array( 'remind' => true, 'channel' => 'email', 'soon' => 10, 'meter_nudge' => 14 ), isset( $s['equipment'] ) && is_array( $s['equipment'] ) ? $s['equipment'] : array() );
}

/** Where a task stands: state ok|soon|due, how far along (0–1+), and words for what's left. */
function dreamscaper_equipment_task_status( $e, $t, $soon = 10 ) {
	$now   = time();
	$since = $t['last_date'] ? strtotime( $t['last_date'] . ' 12:00:00' ) : strtotime( $e->created );
	$base  = null !== $t['last_meter'] && '' !== $t['last_meter'] ? (float) $t['last_meter'] : (float) ( isset( $e->meter0 ) ? $e->meter0 : 0 );
	$fr    = 0;
	$left  = array();
	$unit  = 'miles' === $e->meter_unit ? 'mi' : 'hrs';
	if ( $t['meter'] > 0 && 'none' !== $e->meter_unit ) {
		$used = max( 0, (float) $e->meter - $base );
		$fr   = max( $fr, $used / $t['meter'] );
		$rem  = $t['meter'] - $used;
		$dec    = abs( $rem ) < 10 && abs( $rem - round( $rem ) ) > 0.05 ? 1 : 0; // "8 hrs", "2.5 hrs", "120 hrs"
		$left[] = $rem >= 0 ? 'in ' . number_format( $rem, $dec ) . ' ' . $unit : number_format( -$rem, $dec ) . ' ' . $unit . ' over';
	}
	if ( $t['days'] > 0 ) {
		$days = ( $now - $since ) / DAY_IN_SECONDS;
		$fr   = max( $fr, $days / $t['days'] );
		$rem  = (int) round( $t['days'] - $days );
		$left[] = $rem >= 0 ? ( 0 === $rem ? 'today' : 'in ' . $rem . ' day' . ( 1 === $rem ? '' : 's' ) ) : -$rem . ' day' . ( -1 === $rem ? '' : 's' ) . ' overdue';
	}
	$state = $fr >= 1 ? 'due' : ( $fr >= 1 - $soon / 100 ? 'soon' : 'ok' );
	return array( 'state' => $state, 'frac' => round( $fr, 3 ), 'left' => implode( ' or ', $left ) );
}
function dreamscaper_equipment_out( $e, $soon = 10 ) {
	$data  = dreamscaper_json( $e->data );
	$e->meter0 = isset( $data['meter0'] ) ? (float) $data['meter0'] : 0;
	$tasks = array();
	foreach ( dreamscaper_json( $e->tasks ) as $t ) {
		$t       = array_merge( array( 'on' => true, 'meter' => 0, 'days' => 0, 'last_date' => '', 'last_meter' => null, 'how' => '' ), $t );
		$t['st'] = ! empty( $t['on'] ) ? dreamscaper_equipment_task_status( $e, $t, $soon ) : array( 'state' => 'off', 'frac' => 0, 'left' => '' );
		$tasks[] = $t;
	}
	$cat = dreamscaper_equipment_catalog();
	return array(
		'id' => (int) $e->id, 'name' => $e->name, 'type' => $e->type, 'icon' => isset( $cat[ $e->type ] ) ? $cat[ $e->type ][1] : '🔧', 'meter_unit' => $e->meter_unit, 'meter' => (float) $e->meter,
		'meter_at' => dreamscaper_ms( $e->meter_at ), 'data' => $data ? $data : new stdClass(), 'tasks' => $tasks, 'log' => array_slice( dreamscaper_json( $e->log ), 0, 50 ), 'active' => (bool) $e->active,
		'due' => count( array_filter( $tasks, function ( $t ) { return 'due' === $t['st']['state']; } ) ), 'soon' => count( array_filter( $tasks, function ( $t ) { return 'soon' === $t['st']['state']; } ) ),
	);
}

/* -------------------------------------------------------------------- REST */

add_action( 'rest_api_init', function () {
	$auth = function () {
		return is_user_logged_in();
	};
	register_rest_route( 'dreamscaper/v1', '/crm/equipment', array( 'methods' => 'GET', 'callback' => 'dreamscaper_rest_equipment', 'permission_callback' => $auth ) );
	foreach ( array( '' => 'save', '/delete' => 'delete', '/meter' => 'meter', '/done' => 'done', '/settings' => 'settings' ) as $path => $fn ) {
		register_rest_route( 'dreamscaper/v1', '/crm/equipment' . $path, array( 'methods' => 'POST', 'callback' => 'dreamscaper_rest_equipment_' . $fn, 'permission_callback' => $auth ) );
	}
} );
function dreamscaper_equipment_get( $id, $pro ) {
	global $wpdb;
	return $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( 'equipment' ) . ' WHERE id=%d AND pro_id=%d', $id, $pro ) );
}
function dreamscaper_rest_equipment() {
	global $wpdb;
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$set  = dreamscaper_equipment_settings( $p );
	$rows = $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( 'equipment' ) . ' WHERE pro_id=%d ORDER BY active DESC, name', $p->user_id ) );
	$cat  = array();
	foreach ( dreamscaper_equipment_catalog() as $k => $v ) {
		$cat[] = array( 'id' => $k, 'label' => $v[0], 'icon' => $v[1], 'unit' => $v[2], 'tasks' => dreamscaper_equipment_tasks_from( $k ) );
	}
	return array( 'items' => array_map( function ( $e ) use ( $set ) { return dreamscaper_equipment_out( $e, $set['soon'] ); }, $rows ), 'catalog' => $cat, 'settings' => $set, 'sms' => (bool) dreamscaper_sms_ready() && dreamscaper_pro_can( $p->user_id, 'sms' ) );
}
function dreamscaper_equipment_tasks_clean( $list, $old = array() ) {
	$prev = array();
	foreach ( (array) $old as $t ) {
		if ( isset( $t['id'] ) ) {
			$prev[ $t['id'] ] = $t;
		}
	}
	$out = array();
	foreach ( array_slice( (array) $list, 0, 40 ) as $t ) {
		$name = mb_substr( sanitize_text_field( isset( $t['name'] ) ? $t['name'] : '' ), 0, 120 );
		if ( '' === $name ) {
			continue;
		}
		$id    = isset( $t['id'] ) && preg_match( '/^[A-Za-z0-9]{2,20}$/', $t['id'] ) ? $t['id'] : 't' . wp_generate_password( 6, false );
		$out[] = array(
			'id' => $id, 'name' => $name, 'on' => ! isset( $t['on'] ) || ! empty( $t['on'] ),
			'meter' => max( 0, (float) ( isset( $t['meter'] ) ? $t['meter'] : 0 ) ), 'days' => max( 0, min( 3650, (int) ( isset( $t['days'] ) ? $t['days'] : 0 ) ) ),
			'how' => mb_substr( sanitize_textarea_field( isset( $t['how'] ) ? $t['how'] : '' ), 0, 600 ),
			'last_date' => isset( $t['last_date'] ) && preg_match( '/^\d{4}-\d{2}-\d{2}$/', (string) $t['last_date'] ) ? $t['last_date'] : ( isset( $prev[ $id ]['last_date'] ) ? $prev[ $id ]['last_date'] : '' ),
			'last_meter' => isset( $t['last_meter'] ) && '' !== $t['last_meter'] && null !== $t['last_meter'] ? (float) $t['last_meter'] : ( isset( $prev[ $id ]['last_meter'] ) ? $prev[ $id ]['last_meter'] : null ),
			'notified' => isset( $prev[ $id ]['notified'] ) ? $prev[ $id ]['notified'] : null,
		);
	}
	return $out;
}
function dreamscaper_rest_equipment_save( WP_REST_Request $r ) {
	global $wpdb;
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$j    = $r->get_json_params();
	$id   = (int) ( isset( $j['id'] ) ? $j['id'] : 0 );
	$e    = $id ? dreamscaper_equipment_get( $id, $p->user_id ) : null;
	if ( $id && ! $e ) {
		return dreamscaper_crm_err( 'Equipment not found.', 404 );
	}
	$cat  = dreamscaper_equipment_catalog();
	$type = isset( $j['type'] ) && isset( $cat[ $j['type'] ] ) ? $j['type'] : ( $e ? $e->type : 'other' );
	$name = mb_substr( sanitize_text_field( isset( $j['name'] ) ? $j['name'] : '' ), 0, 120 );
	if ( '' === $name ) {
		$name = $cat[ $type ][0];
	}
	$unit  = isset( $j['meter_unit'] ) && in_array( $j['meter_unit'], array( 'hours', 'miles', 'none' ), true ) ? $j['meter_unit'] : ( $e ? $e->meter_unit : $cat[ $type ][2] );
	$meter = isset( $j['meter'] ) && '' !== $j['meter'] ? max( 0, (float) $j['meter'] ) : ( $e ? (float) $e->meter : 0 );
	$old   = $e ? dreamscaper_json( $e->data ) : array();
	$data  = array(
		'make' => '', 'model' => '', 'year' => '', 'serial' => '', 'plate' => '', 'purchased' => '', 'notes' => '', 'fields' => array(),
	);
	foreach ( array( 'make', 'model', 'year', 'serial', 'plate' ) as $k ) {
		$data[ $k ] = mb_substr( sanitize_text_field( isset( $j['data'][ $k ] ) ? $j['data'][ $k ] : ( isset( $old[ $k ] ) ? $old[ $k ] : '' ) ), 0, 80 );
	}
	$data['purchased'] = isset( $j['data']['purchased'] ) && preg_match( '/^\d{4}-\d{2}-\d{2}$/', (string) $j['data']['purchased'] ) ? $j['data']['purchased'] : ( isset( $old['purchased'] ) ? $old['purchased'] : '' );
	$data['notes']     = mb_substr( sanitize_textarea_field( isset( $j['data']['notes'] ) ? $j['data']['notes'] : ( isset( $old['notes'] ) ? $old['notes'] : '' ) ), 0, 2000 );
	$data['fields']    = array_values( array_filter( array_map( function ( $f ) { return array( 'label' => mb_substr( sanitize_text_field( isset( $f['label'] ) ? $f['label'] : '' ), 0, 60 ), 'value' => mb_substr( sanitize_text_field( isset( $f['value'] ) ? $f['value'] : '' ), 0, 200 ) ); }, array_slice( isset( $j['data']['fields'] ) ? (array) $j['data']['fields'] : ( isset( $old['fields'] ) ? $old['fields'] : array() ), 0, 20 ) ), function ( $f ) { return '' !== $f['label']; } ) );
	$data['meter0']    = isset( $old['meter0'] ) ? $old['meter0'] : $meter;
	$tasks = isset( $j['tasks'] ) && is_array( $j['tasks'] ) ? dreamscaper_equipment_tasks_clean( $j['tasks'], $e ? dreamscaper_json( $e->tasks ) : array() ) : ( $e ? dreamscaper_json( $e->tasks ) : dreamscaper_equipment_tasks_from( $type ) );
	$f = array( 'name' => $name, 'type' => $type, 'meter_unit' => $unit, 'meter' => $meter, 'data' => wp_json_encode( $data ), 'tasks' => wp_json_encode( $tasks ), 'active' => ! isset( $j['active'] ) || ! empty( $j['active'] ) ? 1 : 0, 'updated' => dreamscaper_now() );
	if ( ! $e || (float) $e->meter !== $meter ) {
		$f['meter_at'] = dreamscaper_now();
	}
	if ( $e ) {
		$wpdb->update( dreamscaper_t( 'equipment' ), $f, array( 'id' => $e->id ) );
	} else {
		$wpdb->insert( dreamscaper_t( 'equipment' ), array_merge( $f, array( 'pro_id' => $p->user_id, 'log' => '[]', 'created' => dreamscaper_now() ) ) );
		$id = $wpdb->insert_id;
	}
	return dreamscaper_equipment_out( dreamscaper_equipment_get( $id, $p->user_id ), dreamscaper_equipment_settings( $p )['soon'] );
}
function dreamscaper_rest_equipment_delete( WP_REST_Request $r ) {
	global $wpdb;
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$wpdb->delete( dreamscaper_t( 'equipment' ), array( 'id' => (int) $r->get_param( 'id' ), 'pro_id' => $p->user_id ) );
	return array( 'ok' => true );
}
function dreamscaper_rest_equipment_meter( WP_REST_Request $r ) {
	global $wpdb;
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$e = dreamscaper_equipment_get( (int) $r->get_param( 'id' ), $p->user_id );
	if ( ! $e ) {
		return dreamscaper_crm_err( 'Equipment not found.', 404 );
	}
	$v = (float) $r->get_param( 'value' );
	if ( $v < (float) $e->meter && ! $r->get_param( 'force' ) ) {
		return dreamscaper_crm_err( sprintf( 'That’s lower than the last reading (%s). Check the meter — or confirm to correct it.', number_format( (float) $e->meter, 1 ) ), 409 );
	}
	$log = dreamscaper_json( $e->log );
	array_unshift( $log, array( 'at' => time() * 1000, 'kind' => 'meter', 'text' => sprintf( '%s reading: %s', 'miles' === $e->meter_unit ? 'Odometer' : 'Hour meter', number_format( $v, 1 ) ), 'meter' => $v ) );
	$wpdb->update( dreamscaper_t( 'equipment' ), array( 'meter' => max( 0, $v ), 'meter_at' => dreamscaper_now(), 'log' => wp_json_encode( array_slice( $log, 0, 200 ) ), 'updated' => dreamscaper_now() ), array( 'id' => $e->id ) );
	return dreamscaper_equipment_out( dreamscaper_equipment_get( $e->id, $p->user_id ), dreamscaper_equipment_settings( $p )['soon'] );
}
function dreamscaper_rest_equipment_done( WP_REST_Request $r ) {
	global $wpdb;
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$j = $r->get_json_params();
	$e = dreamscaper_equipment_get( (int) ( isset( $j['id'] ) ? $j['id'] : 0 ), $p->user_id );
	if ( ! $e ) {
		return dreamscaper_crm_err( 'Equipment not found.', 404 );
	}
	$date  = isset( $j['date'] ) && preg_match( '/^\d{4}-\d{2}-\d{2}$/', $j['date'] ) ? $j['date'] : wp_date( 'Y-m-d' );
	$meter = isset( $j['meter'] ) && '' !== $j['meter'] ? max( 0, (float) $j['meter'] ) : (float) $e->meter;
	$tasks = dreamscaper_json( $e->tasks );
	$names = array();
	foreach ( $tasks as &$t ) {
		if ( in_array( $t['id'], (array) ( isset( $j['tasks'] ) ? $j['tasks'] : array() ), true ) ) {
			$t['last_date']  = $date;
			$t['last_meter'] = $meter;
			$t['notified']   = null;
			$names[]         = $t['name'];
		}
	}
	unset( $t );
	if ( ! $names ) {
		return dreamscaper_crm_err( 'Pick what was done.' );
	}
	$log = dreamscaper_json( $e->log );
	array_unshift( $log, array( 'at' => strtotime( $date . ' 12:00:00' ) * 1000, 'kind' => 'done', 'text' => implode( ', ', $names ), 'meter' => 'none' === $e->meter_unit ? null : $meter, 'note' => mb_substr( sanitize_textarea_field( isset( $j['note'] ) ? $j['note'] : '' ), 0, 600 ), 'cost' => max( 0, (float) ( isset( $j['cost'] ) ? $j['cost'] : 0 ) ), 'by' => mb_substr( sanitize_text_field( isset( $j['by'] ) ? $j['by'] : '' ), 0, 60 ) ) );
	$f = array( 'tasks' => wp_json_encode( $tasks ), 'log' => wp_json_encode( array_slice( $log, 0, 200 ) ), 'updated' => dreamscaper_now() );
	if ( $meter > (float) $e->meter ) {
		$f['meter']    = $meter;
		$f['meter_at'] = dreamscaper_now();
	}
	$wpdb->update( dreamscaper_t( 'equipment' ), $f, array( 'id' => $e->id ) );
	return dreamscaper_equipment_out( dreamscaper_equipment_get( $e->id, $p->user_id ), dreamscaper_equipment_settings( $p )['soon'] );
}
function dreamscaper_rest_equipment_settings( WP_REST_Request $r ) {
	global $wpdb;
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$j = $r->get_json_params();
	$s = dreamscaper_pro_settings( $p );
	$s['equipment'] = array(
		'remind' => ! empty( $j['remind'] ),
		'channel' => isset( $j['channel'] ) && in_array( $j['channel'], array( 'email', 'sms', 'both' ), true ) ? $j['channel'] : 'email',
		'soon' => max( 0, min( 50, (int) ( isset( $j['soon'] ) ? $j['soon'] : 10 ) ) ),
		'meter_nudge' => max( 0, min( 90, (int) ( isset( $j['meter_nudge'] ) ? $j['meter_nudge'] : 14 ) ) ),
	);
	$wpdb->update( dreamscaper_t( 'pros' ), array( 'settings' => wp_json_encode( $s ) ), array( 'user_id' => $p->user_id ) );
	return array( 'settings' => $s['equipment'] );
}

/* -------------------------------------------------------------- reminders */

add_action( 'dreamscaper_subs_daily', 'dreamscaper_equipment_tick' ); // runs hourly; each contractor gets at most one digest a day
function dreamscaper_equipment_tick() {
	global $wpdb;
	$E = dreamscaper_t( 'equipment' );
	if ( $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $E ) ) !== $E ) {
		return;
	}
	$hour = (int) wp_date( 'G' );
	if ( $hour < 7 || $hour > 19 ) {
		return; // reminders go out in working hours
	}
	foreach ( $wpdb->get_col( "SELECT DISTINCT pro_id FROM $E WHERE active=1" ) as $pid ) { // phpcs:ignore
		$key = 'dscp_eqd_' . $pid . '_' . wp_date( 'Ymd' );
		if ( get_transient( $key ) ) {
			continue;
		}
		$p = dreamscaper_pro_row( (int) $pid );
		if ( ! $p || 'approved' !== $p->status ) {
			continue;
		}
		set_transient( $key, 1, DAY_IN_SECONDS );
		$set = dreamscaper_equipment_settings( $p );
		if ( empty( $set['remind'] ) ) {
			continue;
		}
		dreamscaper_equipment_digest( $p, $set );
	}
}
/** Build and send today's digest for one contractor (returns the lines sent, for tests). */
function dreamscaper_equipment_digest( $p, $set, $send = true ) {
	global $wpdb;
	$E     = dreamscaper_t( 'equipment' );
	$lines = array();
	$meterLines = array();
	foreach ( $wpdb->get_results( $wpdb->prepare( "SELECT * FROM $E WHERE pro_id=%d AND active=1", $p->user_id ) ) as $e ) {
		$o       = dreamscaper_equipment_out( $e, $set['soon'] );
		$tasks   = dreamscaper_json( $e->tasks );
		$changed = false;
		foreach ( $o['tasks'] as $k => $t ) {
			$st = $t['st']['state'];
			if ( 'due' !== $st && 'soon' !== $st ) {
				continue;
			}
			$n = isset( $tasks[ $k ]['notified'] ) ? $tasks[ $k ]['notified'] : null;
			// tell once when it becomes "soon", once when "due", then weekly while overdue
			$again = 'due' === $st && $n && 'due' === $n['state'] && time() - $n['at'] > 7 * DAY_IN_SECONDS;
			if ( $n && $n['state'] === $st && ! $again ) {
				continue;
			}
			$lines[] = ( 'due' === $st ? '🔴 DUE' : '🟡 Soon' ) . ' — ' . $o['name'] . ': ' . $t['name'] . ' (' . $t['st']['left'] . ')' . ( $t['how'] ? "\n     " . $t['how'] : '' );
			$tasks[ $k ]['notified'] = array( 'state' => $st, 'at' => time() );
			$changed = true;
		}
		if ( $changed && $send ) {
			$wpdb->update( $E, array( 'tasks' => wp_json_encode( $tasks ) ), array( 'id' => $e->id ) );
		}
		if ( 'none' !== $e->meter_unit && $set['meter_nudge'] && ( ! $e->meter_at || strtotime( $e->meter_at . ' UTC' ) < time() - $set['meter_nudge'] * DAY_IN_SECONDS ) && (int) wp_date( 'N' ) === 1 ) {
			$meterLines[] = $o['name'] . ' (last ' . ( 'miles' === $e->meter_unit ? 'odometer' : 'hour meter' ) . ' reading: ' . number_format( (float) $e->meter ) . ')';
		}
	}
	if ( ! $lines && ! $meterLines ) {
		return array();
	}
	$text = ( $lines ? "Equipment maintenance coming up:\n\n" . implode( "\n", $lines ) . "\n\n" : '' )
		. ( $meterLines ? "Please update these readings so reminders stay accurate (Monday check):\n• " . implode( "\n• ", $meterLines ) . "\n\n" : '' )
		. 'Mark tasks done or update readings in your Contractor Hub → Equipment.';
	if ( $send ) {
		$ch = 'both' === $set['channel'] ? array( 'email', 'sms' ) : array( $set['channel'] );
		$u  = get_userdata( $p->user_id );
		$to = is_email( $p->email ) ? $p->email : ( $u ? $u->user_email : '' );
		if ( in_array( 'email', $ch, true ) && $to ) {
			dreamscaper_crm_mail( $p, $to, ( $lines ? count( $lines ) . ' equipment maintenance task' . ( 1 === count( $lines ) ? '' : 's' ) : 'Update your equipment readings' ), $text, array( 'link' => dreamscaper_app_url( array( 'ds_hub' => 'equipment' ) ), 'button' => 'Open Equipment' ) );
		}
		if ( in_array( 'sms', $ch, true ) && $p->phone && dreamscaper_sms_ready() && ! dreamscaper_quiet_now( $p ) ) {
			dreamscaper_sms( $p->phone, 'DreamScaper: ' . ( $lines ? count( $lines ) . ' equipment maintenance task(s) due or coming up — ' . mb_substr( preg_replace( '/\s+/', ' ', str_replace( array( '🔴 ', '🟡 ' ), '', $lines[0] ) ), 0, 120 ) . ( count( $lines ) > 1 ? ' and more.' : '' ) : 'please update your equipment hour/mile readings.' ) . ' Open your Contractor Hub → Equipment.' );
		}
	}
	return $lines;
}

<?php
/**
 * DreamScaper – Landscape Plan wizard (server side).
 *
 *  GET  /crm/plans        every property of this contractor with its plan status (and any wizard in progress)
 *  GET  /crm/plan/zone    USDA hardiness zone for a ZIP code (cached; the contractor can always change it)
 *  POST /ai/photocheck    optional AI second opinion on a guided site photo (is it the right view of a yard?)
 *
 * The wizard itself runs in the browser (assets/js/planwiz.js). Plans, photos, the aerial and the
 * wizard's progress are saved on the property through the existing /crm/property endpoint, so the
 * monthly "landscape plans" allowance and storage limits apply exactly as before.
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

add_action( 'rest_api_init', function () {
	$auth = function () {
		return is_user_logged_in();
	};
	register_rest_route( 'dreamscaper/v1', '/crm/plans', array( 'methods' => 'GET', 'callback' => 'dreamscaper_rest_plans', 'permission_callback' => $auth ) );
	register_rest_route( 'dreamscaper/v1', '/crm/plan/zone', array( 'methods' => 'GET', 'callback' => 'dreamscaper_rest_plan_zone', 'permission_callback' => $auth ) );
	register_rest_route( 'dreamscaper/v1', '/ai/photocheck', array( 'methods' => 'POST', 'callback' => 'dreamscaper_rest_photocheck', 'permission_callback' => 'dreamscaper_ai_permission' ) );
} );

/** Properties with their plan status, newest first. */
function dreamscaper_rest_plans( WP_REST_Request $r ) {
	global $wpdb;
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$q    = trim( sanitize_text_field( (string) $r->get_param( 'q' ) ) );
	$sql  = $wpdb->prepare( 'SELECT pr.id, pr.client_id, pr.address, pr.lat, pr.lng, pr.aerial, pr.plan, pr.data, pr.updated, c.name client_name FROM ' . dreamscaper_t( 'props' ) . ' pr LEFT JOIN ' . dreamscaper_t( 'clients' ) . ' c ON c.id=pr.client_id WHERE pr.pro_id=%d', $p->user_id );
	if ( '' !== $q ) {
		$like = '%' . $wpdb->esc_like( $q ) . '%';
		$sql .= $wpdb->prepare( ' AND (pr.address LIKE %s OR c.name LIKE %s)', $like, $like );
	}
	$rows = $wpdb->get_results( $sql . ' ORDER BY pr.updated DESC LIMIT 200' ); // phpcs:ignore -- prepared above
	$out  = array();
	foreach ( $rows as $x ) {
		$plan = dreamscaper_json( $x->plan );
		$data = dreamscaper_json( $x->data );
		$wiz  = isset( $data['planwiz'] ) && is_array( $data['planwiz'] ) ? $data['planwiz'] : null;
		$out[] = array(
			'id'        => (int) $x->id,
			'client_id' => (int) $x->client_id,
			'client'    => (string) $x->client_name,
			'address'   => $x->address,
			'shapes'    => isset( $plan['shapes'] ) && is_array( $plan['shapes'] ) ? count( $plan['shapes'] ) : 0,
			'meta'      => isset( $plan['meta'] ) && is_array( $plan['meta'] ) ? array_intersect_key( $plan['meta'], array_flip( array( 'style', 'accuracy', 'generated', 'areas' ) ) ) : null,
			'wizard'    => $wiz ? array( 'step' => isset( $wiz['step'] ) ? (int) $wiz['step'] : 0, 'done' => ! empty( $wiz['done'] ), 'saved' => isset( $wiz['saved'] ) ? (int) $wiz['saved'] : 0 ) : null,
			'aerial'    => '' !== $x->aerial,
			'updated'   => dreamscaper_ms( $x->updated ),
		);
	}
	return array( 'items' => $out );
}

/** USDA plant hardiness zone for a ZIP (phzmapi.org, built from the USDA 2023 map). Null when unknown. */
function dreamscaper_rest_plan_zone( WP_REST_Request $r ) {
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$zip = substr( preg_replace( '/\D/', '', (string) $r->get_param( 'zip' ) ), 0, 5 );
	if ( 5 !== strlen( $zip ) ) {
		return array( 'zone' => null );
	}
	$ck = 'dscp_zone_' . $zip;
	$z  = get_transient( $ck );
	if ( false === $z ) {
		$res = wp_remote_get( 'https://phzmapi.org/' . $zip . '.json', array( 'timeout' => 8 ) );
		$j   = is_wp_error( $res ) ? null : json_decode( wp_remote_retrieve_body( $res ), true );
		$z   = is_array( $j ) && ! empty( $j['zone'] ) && preg_match( '/^\d{1,2}[ab]?$/', $j['zone'] ) ? $j['zone'] : '';
		set_transient( $ck, $z, $z ? 30 * DAY_IN_SECONDS : HOUR_IN_SECONDS );
	}
	return array( 'zone' => $z ? $z : null );
}

/**
 * AI second opinion on one guided photo. The browser has already checked size, sharpness, light,
 * location and direction; this answers what only "looking" can: is it an outdoor photo of this kind
 * of view of a home's yard, is the whole area in frame, and what is in the way.
 */
function dreamscaper_rest_photocheck( WP_REST_Request $r ) {
	$j     = $r->get_json_params();
	$views = array(
		'front'       => 'the FRONT of the house and front yard, taken from the street or curb facing the house',
		'front_left'  => 'the front yard taken diagonally from the front-left corner of the property toward the house',
		'front_right' => 'the front yard taken diagonally from the front-right corner of the property toward the house',
		'back'        => 'the BACK yard and back of the house, taken from the back of the property facing the house',
		'back_left'   => 'the back yard taken diagonally from the back-left corner of the property',
		'back_right'  => 'the back yard taken diagonally from the back-right corner of the property',
		'left'        => 'the LEFT side yard (as seen from the street), taken from the front corner of the house looking down the side',
		'right'       => 'the RIGHT side yard (as seen from the street), taken from the front corner of the house looking down the side',
		'detail'      => 'a close-up of a specific landscape problem or feature (drainage, slope, a tree, utilities, an existing bed)',
	);
	$view = isset( $j['view'] ) && isset( $views[ $j['view'] ] ) ? $j['view'] : 'detail';
	$prompt = 'A landscape contractor is photographing a property to draw an accurate 2D landscape plan. This photo is supposed to show ' . $views[ $view ] . ".\n"
		. "Judge only what you can see. Rules:\n"
		. "1. 'outdoor_yard': true only if this is an outdoor photo of a residential property (not a screenshot, document, indoor room, map, or a close-up of a single object unless the view is 'detail').\n"
		. "2. 'matches': true if the photo plausibly shows the requested view; false if it clearly shows something else (e.g. a back yard when the front was asked for). If unsure, true.\n"
		. "3. 'whole_area': false if important parts of the area are cut off (e.g. the house corners or the yard edges are out of frame).\n"
		. "4. 'obstructions': things blocking the view (cars, people, trash cans, snow cover, heavy shadows, glare, a finger over the lens). Empty if none.\n"
		. "5. 'seen': one short sentence describing what the photo shows.\n"
		. "6. 'tips': up to 2 short instructions to retake it better, only if needed.\n"
		. 'Return: {"outdoor_yard": bool, "matches": bool, "whole_area": bool, "obstructions": [string], "seen": string, "tips": [string]}';
	$out = dreamscaper_vlm( dreamscaper_ai_role(), $prompt, array( isset( $j['image'] ) ? $j['image'] : '' ), 500 );
	if ( is_wp_error( $out ) ) {
		return $out;
	}
	return array(
		'outdoor_yard' => ! isset( $out['outdoor_yard'] ) || (bool) $out['outdoor_yard'],
		'matches'      => ! isset( $out['matches'] ) || (bool) $out['matches'],
		'whole_area'   => ! isset( $out['whole_area'] ) || (bool) $out['whole_area'],
		'obstructions' => dreamscaper_ai_list( isset( $out['obstructions'] ) ? $out['obstructions'] : array(), 5, 80 ),
		'seen'         => dreamscaper_ai_txt( isset( $out['seen'] ) ? $out['seen'] : '', 200 ),
		'tips'         => dreamscaper_ai_list( isset( $out['tips'] ) ? $out['tips'] : array(), 2, 160 ),
	);
}

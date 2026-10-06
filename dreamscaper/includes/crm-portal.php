<?php
/**
 * DreamScaper – homeowner side of the CRM: Find a Local Contractor, contractor profiles
 * (ratings, reviews, "Dream-to-Reality" score, finished Dreamscapes), quote requests with the
 * guided property capture, and the customer portal (My Projects) inside their own account.
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

add_action( 'rest_api_init', function () {
	$pub  = '__return_true';
	$auth = function () {
		return is_user_logged_in();
	};
	foreach ( array(
		array( '/crm/pros', 'GET', 'dreamscaper_crm_pros', $pub ),
		array( '/crm/pro', 'GET', 'dreamscaper_crm_pro_profile', $pub ),
		array( '/crm/lead', 'POST', 'dreamscaper_crm_lead', $pub ),
		array( '/crm/portal', 'GET', 'dreamscaper_crm_portal', $auth ),
		array( '/crm/request', 'POST', 'dreamscaper_crm_request', $auth ),
		array( '/crm/review', 'POST', 'dreamscaper_crm_review', $auth ),
		array( '/crm/myproperty', 'GET', 'dreamscaper_crm_myproperties', $auth ),
		array( '/crm/myproperty', 'POST', 'dreamscaper_crm_myproperty_save', $auth ),
	) as $r ) {
		register_rest_route( 'dreamscaper/v1', $r[0], array( 'methods' => $r[1], 'callback' => $r[2], 'permission_callback' => $r[3] ) );
	}
} );

/* ----------------------------------------------------------- find a pro */

function dreamscaper_crm_pros( WP_REST_Request $r ) {
	global $wpdb;
	if ( ! dreamscaper_crm_on() ) {
		return array( 'items' => array(), 'off' => true );
	}
	$lat  = (float) $r->get_param( 'lat' );
	$lng  = (float) $r->get_param( 'lng' );
	$near = sanitize_text_field( (string) $r->get_param( 'near' ) );
	$where_label = '';
	if ( ! $lat && $near ) {
		$ck = 'dscp_near_' . md5( strtolower( $near ) );
		$g  = get_transient( $ck );
		if ( false === $g && dreamscaper_limit( 'near', 60, HOUR_IN_SECONDS ) ) {
			$g = dreamscaper_geocode( preg_match( '/^\d{5}$/', $near ) ? $near : $near . ( preg_match( '/,\s*[A-Z]{2}\b/', $near ) ? '' : ', CT' ) );
			set_transient( $ck, $g ? $g : 0, WEEK_IN_SECONDS );
		}
		if ( $g ) {
			$lat         = $g['lat'];
			$lng         = $g['lng'];
			$where_label = $near;
		}
	}
	if ( ! $lat && is_user_logged_in() ) {
		$addr = trim( get_user_meta( get_current_user_id(), 'dscp_address', true ) . ', ' . get_user_meta( get_current_user_id(), 'dscp_town', true ), ', ' );
		if ( $addr ) {
			$ck = 'dscp_near_' . md5( strtolower( $addr ) );
			$g  = get_transient( $ck );
			if ( false === $g ) {
				$g = dreamscaper_geocode( $addr );
				set_transient( $ck, $g ? $g : 0, WEEK_IN_SECONDS );
			}
			if ( $g ) {
				$lat         = $g['lat'];
				$lng         = $g['lng'];
				$where_label = $addr;
			}
		}
	}
	$q       = trim( sanitize_text_field( (string) $r->get_param( 'q' ) ) );
	$service = trim( sanitize_text_field( (string) $r->get_param( 'service' ) ) );
	$sql     = 'SELECT * FROM ' . dreamscaper_t( 'pros' ) . " WHERE status='approved'";
	if ( '' !== $q ) {
		$like = '%' . $wpdb->esc_like( $q ) . '%';
		$sql .= $wpdb->prepare( ' AND (business LIKE %s OR town LIKE %s OR services LIKE %s)', $like, $like, $like );
	}
	if ( '' !== $service ) {
		$sql .= $wpdb->prepare( ' AND services LIKE %s', '%,' . $wpdb->esc_like( $service ) . ',%' );
	}
	$items = array();
	foreach ( $wpdb->get_results( $sql . ' LIMIT 500' ) as $p ) { // phpcs:ignore
		// paused accounts and contractors at their monthly request limit aren't shown to new homeowners
		if ( ! dreamscaper_pro_accepting( (int) $p->user_id ) && ! dreamscaper_is_owner_pro( (int) $p->user_id ) ) {
			continue;
		}
		$o          = dreamscaper_pro_public( $p );
		$o['miles'] = ( $lat && (float) $p->lat ) ? round( dreamscaper_miles( $lat, $lng, (float) $p->lat, (float) $p->lng ), 1 ) : null;
		if ( null !== $o['miles'] && $o['miles'] > max( (int) $p->radius * 2, 15 ) ) {
			continue; // far outside where they work
		}
		$o['serves'] = null === $o['miles'] ? null : $o['miles'] <= (int) $p->radius;
		$items[]     = $o;
	}
	$sort = sanitize_key( (string) $r->get_param( 'sort' ) );
	usort( $items, function ( $a, $b ) use ( $sort ) {
		if ( 'rating' === $sort ) {
			return array( $b['rating'], $b['reviews'] ) <=> array( $a['rating'], $a['reviews'] );
		}
		if ( 'reality' === $sort ) {
			return array( $b['reality'], $b['reality_n'] ) <=> array( $a['reality'], $a['reality_n'] );
		}
		$da = null === $a['miles'] ? 9999 : $a['miles'];
		$db = null === $b['miles'] ? 9999 : $b['miles'];
		return array( ! $a['serves'], ! $a['featured'], $da, -$a['rating'] ) <=> array( ! $b['serves'], ! $b['featured'], $db, -$b['rating'] );
	} );
	return array( 'items' => array_slice( $items, 0, 60 ), 'near' => $where_label, 'located' => (bool) $lat );
}

function dreamscaper_crm_pro_profile( WP_REST_Request $r ) {
	global $wpdb;
	$p = dreamscaper_pro_row( (int) $r->get_param( 'id' ) );
	if ( ! $p || 'approved' !== $p->status || ! dreamscaper_crm_on() ) {
		return dreamscaper_crm_err( 'Contractor not found.', 404 );
	}
	$out            = dreamscaper_pro_public( $p, true );
	$out['reviews_list'] = array_map( 'dreamscaper_review_out', $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( 'reviews' ) . " WHERE pro_id=%d AND status='live' ORDER BY id DESC LIMIT 50", $p->user_id ) ) );
	$out['stars']   = array_map( 'intval', array_column( $wpdb->get_results( $wpdb->prepare( 'SELECT stars, COUNT(*) n FROM ' . dreamscaper_t( 'reviews' ) . " WHERE pro_id=%d AND status='live' GROUP BY stars", $p->user_id ), ARRAY_A ), 'n', 'stars' ) );
	$out['portfolio'] = array();
	foreach ( $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( 'quotes' ) . " WHERE pro_id=%d AND status='signed' AND job_status='done' ORDER BY updated DESC LIMIT 60", $p->user_id ) ) as $q ) {
		$job = dreamscaper_json( $q->job );
		$des = dreamscaper_json( $q->design );
		if ( empty( $job['showcase'] ) || empty( $des['after'] ) ) {
			continue;
		}
		$rv = $wpdb->get_row( $wpdb->prepare( 'SELECT stars, reality FROM ' . dreamscaper_t( 'reviews' ) . " WHERE quote_id=%d AND status='live'", $q->id ) );
		$out['portfolio'][] = array( 'title' => $q->title, 'before' => isset( $des['before'] ) ? $des['before'] : '', 'design' => $des['after'], 'finished' => ! empty( $job['photos'] ) ? $job['photos'][0] : '', 'stars' => $rv ? (int) $rv->stars : 0, 'reality' => $rv ? (int) $rv->reality : 0, 'at' => dreamscaper_ms( $q->updated ) );
	}
	if ( is_user_logged_in() ) {
		$out['hired'] = (bool) $wpdb->get_var( $wpdb->prepare( 'SELECT q.id FROM ' . dreamscaper_t( 'quotes' ) . ' q WHERE q.pro_id=%d AND q.user_id=%d AND q.status=\'signed\' LIMIT 1', $p->user_id, get_current_user_id() ) );
	}
	return $out;
}

/* ------------------------------------------------------------ lead intake */

/**
 * Create (or reuse) a customer, a property and a quote request for a contractor.
 * $f: name, email, phone, address, town, state, zip, message. Returns array( client, prop, quote ).
 */
function dreamscaper_crm_new_lead( $pro_id, $f, $source, $user_id = 0, $design = null, $property = null ) {
	global $wpdb;
	$C = dreamscaper_t( 'clients' );
	$c = null;
	if ( $user_id ) {
		$c = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $C WHERE pro_id=%d AND user_id=%d LIMIT 1", $pro_id, $user_id ) );
	}
	if ( ! $c && ! empty( $f['email'] ) ) {
		$c = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $C WHERE pro_id=%d AND email=%s LIMIT 1", $pro_id, $f['email'] ) );
	}
	if ( ! $c && ! empty( $f['phone'] ) && strlen( preg_replace( '/\D/', '', $f['phone'] ) ) >= 10 ) {
		$c = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $C WHERE pro_id=%d AND phone=%s LIMIT 1", $pro_id, $f['phone'] ) );
	}
	if ( $c ) {
		$client = (int) $c->id;
		$wpdb->update( $C, array( 'updated' => dreamscaper_now(), 'user_id' => $user_id ? $user_id : $c->user_id ), array( 'id' => $client ) );
	} else {
		$wpdb->insert( $C, array(
			'pro_id' => $pro_id, 'user_id' => (int) $user_id, 'stage' => 'lead', 'source' => $source,
			'name' => $f['name'], 'company' => '', 'email' => isset( $f['email'] ) ? $f['email'] : '', 'phone' => isset( $f['phone'] ) ? $f['phone'] : '',
			'address' => isset( $f['address'] ) ? $f['address'] : '', 'town' => isset( $f['town'] ) ? $f['town'] : '', 'state' => isset( $f['state'] ) ? $f['state'] : '', 'zip' => isset( $f['zip'] ) ? $f['zip'] : '',
			'photo' => '', 'tags' => '', 'data' => wp_json_encode( array( 'notes' => isset( $f['message'] ) ? $f['message'] : '' ) ), 'created' => dreamscaper_now(), 'updated' => dreamscaper_now(),
		) );
		$client = (int) $wpdb->insert_id;
	}
	$prop = 0;
	$addr = $property && ! empty( $property['address'] ) ? $property['address'] : trim( ( isset( $f['address'] ) ? $f['address'] : '' ) . ', ' . ( isset( $f['town'] ) ? $f['town'] : '' ) . ', ' . ( isset( $f['state'] ) ? $f['state'] : '' ), ', ' );
	if ( $addr || $property ) {
		$P     = dreamscaper_t( 'props' );
		$exist = $addr ? $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $P WHERE pro_id=%d AND client_id=%d AND address=%s LIMIT 1", $pro_id, $client, $addr ) ) : null;
		$row   = array(
			'pro_id' => $pro_id, 'client_id' => $client, 'address' => $addr,
			'lat' => $property && ! empty( $property['lat'] ) ? (float) $property['lat'] : 0, 'lng' => $property && ! empty( $property['lng'] ) ? (float) $property['lng'] : 0,
			'aerial' => $property && ! empty( $property['aerial'] ) ? $property['aerial'] : '', 'ppf' => $property && ! empty( $property['ppf'] ) ? (float) $property['ppf'] : 0,
			'photos' => wp_json_encode( $property && ! empty( $property['photos'] ) ? $property['photos'] : array() ),
			'plan' => wp_json_encode( $property && ! empty( $property['plan'] ) ? $property['plan'] : new stdClass() ),
			'data' => wp_json_encode( $property && ! empty( $property['data'] ) ? $property['data'] : new stdClass() ), 'updated' => dreamscaper_now(),
		);
		if ( ! $row['lat'] && $addr ) {
			$g = dreamscaper_geocode( $addr );
			if ( $g ) {
				$row['lat'] = $g['lat'];
				$row['lng'] = $g['lng'];
			}
		}
		if ( $exist ) {
			$wpdb->update( $P, $row, array( 'id' => $exist->id ) );
			$prop = (int) $exist->id;
		} else {
			$wpdb->insert( $P, array_merge( $row, array( 'created' => dreamscaper_now() ) ) );
			$prop = (int) $wpdb->insert_id;
		}
	}
	$quote = 0;
	if ( $design ) {
		$wpdb->insert( dreamscaper_t( 'quotes' ), array(
			'pro_id' => $pro_id, 'client_id' => $client, 'prop_id' => $prop, 'user_id' => (int) $user_id,
			'number' => dreamscaper_next_number( $pro_id, 'Q' ), 'title' => $design['title'], 'status' => 'request', 'token' => dreamscaper_token(),
			'design' => wp_json_encode( $design ), 'estimate' => '{}', 'docs' => '{}', 'job' => '{}', 'sign' => '{}', 'created' => dreamscaper_now(), 'updated' => dreamscaper_now(),
		) );
		$quote = (int) $wpdb->insert_id;
	}
	$label = array( 'website' => 'website form', 'dreamscaper' => 'DreamScaper', 'text' => 'text message', 'phone' => 'phone call', 'referral' => 'referral', 'social' => 'social media', 'contractor' => 'contractor referral' );
	dreamscaper_crm_log( $pro_id, $client, $quote, 'lead', 'New ' . ( $design ? 'quote request' : 'lead' ) . ' from ' . ( isset( $label[ $source ] ) ? $label[ $source ] : $source ) . ( ! empty( $f['message'] ) ? ': ' . $f['message'] : '' ), (int) $user_id );
	return array( 'client' => $client, 'prop' => $prop, 'quote' => $quote );
}

/** Public lead form (contractor's website: [dreamscaper_quote pro="ID"] or any form posting here). */
function dreamscaper_crm_lead( WP_REST_Request $r ) {
	if ( ! dreamscaper_crm_on() ) {
		return dreamscaper_crm_err( 'Not available.', 503 );
	}
	$j = $r->get_json_params();
	if ( ! empty( $j['hp'] ) ) {
		return dreamscaper_crm_err( 'Error.' );
	}
	if ( ! dreamscaper_limit( 'lead', 8, DAY_IN_SECONDS ) ) {
		return dreamscaper_crm_err( 'You’ve sent several requests today. Please call us instead.', 429 );
	}
	$p = dreamscaper_pro_row( (int) ( isset( $j['pro'] ) ? $j['pro'] : 0 ) );
	if ( ! $p || 'approved' !== $p->status ) {
		return dreamscaper_crm_err( 'Contractor not found.', 404 );
	}
	$f = array( 'name' => dreamscaper_crm_txt( $j, 'name', 120 ), 'email' => sanitize_email( isset( $j['email'] ) ? $j['email'] : '' ), 'phone' => dreamscaper_crm_txt( $j, 'phone', 30 ), 'address' => dreamscaper_crm_txt( $j, 'address', 200 ), 'town' => dreamscaper_crm_txt( $j, 'town', 80 ), 'state' => 'CT', 'message' => dreamscaper_crm_area( $j, 'message', 2000 ) );
	if ( strlen( $f['name'] ) < 2 || ( ! is_email( $f['email'] ) && strlen( preg_replace( '/\D/', '', $f['phone'] ) ) < 10 ) ) {
		return dreamscaper_crm_err( 'Please add your name and an email or phone number.' );
	}
	$src = in_array( isset( $j['source'] ) ? $j['source'] : '', array( 'website', 'referral', 'social', 'contractor' ), true ) ? $j['source'] : 'website';
	$ids = dreamscaper_crm_new_lead( (int) $p->user_id, $f, $src );
	dreamscaper_crm_tell_pro( (int) $p->user_id, 'New lead: ' . $f['name'], "New lead from your website:\n\n{$f['name']}\n{$f['email']}\n{$f['phone']}\n{$f['address']} {$f['town']}\n\n{$f['message']}", $ids['client'] );
	return array( 'ok' => true );
}

/* ------------------------------------------------------- homeowner portal */

/** A homeowner asks a contractor for a quote on one of their Dreamscapes. */
function dreamscaper_crm_request( WP_REST_Request $r ) {
	global $wpdb;
	if ( ! dreamscaper_crm_on() ) {
		return dreamscaper_crm_err( 'Not available yet.', 503 );
	}
	$uid = get_current_user_id();
	$j   = $r->get_json_params();
	$p   = dreamscaper_pro_row( (int) ( isset( $j['pro'] ) ? $j['pro'] : 0 ) );
	if ( ! $p || 'approved' !== $p->status ) {
		return dreamscaper_crm_err( 'Contractor not found.', 404 );
	}
	if ( (int) $p->user_id === $uid ) {
		return dreamscaper_crm_err( 'That’s your own business!' );
	}
	if ( ! dreamscaper_pro_accepting( (int) $p->user_id ) ) {
		return dreamscaper_crm_err( $p->business . ' isn’t taking new requests right now. Try another contractor nearby.', 409 );
	}
	if ( ! dreamscaper_limit( 'qreq', 60, DAY_IN_SECONDS ) ) {
		return dreamscaper_crm_err( 'You’ve sent a lot of requests today. Try again tomorrow.', 429 );
	}
	$prof = dreamscaper_profile( $uid );
	$f    = array( 'name' => $prof['name'], 'email' => $prof['email'], 'phone' => dreamscaper_crm_txt( $j, 'phone', 30 ) ? dreamscaper_crm_txt( $j, 'phone', 30 ) : $prof['phone'], 'address' => $prof['address'], 'town' => $prof['town'], 'state' => 'CT', 'zip' => $prof['zip'], 'message' => dreamscaper_crm_area( $j, 'message', 2000 ) );
	if ( strlen( preg_replace( '/\D/', '', $f['phone'] ) ) < 10 ) {
		return dreamscaper_crm_err( 'Please add a phone number so the contractor can reach you.' );
	}
	if ( ! empty( $f['phone'] ) && ! $prof['phone'] ) {
		update_user_meta( $uid, 'dscp_phone', $f['phone'] );
	}
	$d      = isset( $j['design'] ) && is_array( $j['design'] ) ? $j['design'] : array();
	$design = array(
		'title'   => mb_substr( sanitize_text_field( isset( $d['title'] ) ? $d['title'] : 'My Dreamscape' ), 0, 160 ),
		'before'  => ! empty( $d['before'] ) ? dreamscaper_crm_store_image( $d['before'], 8 * MB_IN_BYTES ) : '',
		'after'   => ! empty( $d['after'] ) ? dreamscaper_crm_store_image( $d['after'], 8 * MB_IN_BYTES ) : '',
		'assets'  => isset( $d['assets'] ) ? dreamscaper_crm_clean( array_slice( (array) $d['assets'], 0, 200 ) ) : array(),
		'ground'  => isset( $d['ground'] ) ? dreamscaper_crm_clean( array_slice( (array) $d['ground'], 0, 50 ) ) : array(),
		'season'  => sanitize_key( isset( $d['season'] ) ? $d['season'] : '' ),
		'ai'      => ! empty( $d['ai'] ),
		'message' => $f['message'],
		'timing'  => sanitize_text_field( isset( $j['timing'] ) ? $j['timing'] : '' ),
		'budget'  => sanitize_text_field( isset( $j['budget'] ) ? $j['budget'] : '' ),
		'source'  => 'dreamscaper',
	);
	$property = null;
	$pid      = (int) ( isset( $j['property'] ) ? $j['property'] : 0 );
	if ( $pid ) {
		$mine = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( 'props' ) . ' WHERE id=%d AND user_id=%d AND pro_id=0', $pid, $uid ) );
		if ( $mine ) {
			$property = array( 'address' => $mine->address, 'lat' => $mine->lat, 'lng' => $mine->lng, 'aerial' => $mine->aerial, 'ppf' => $mine->ppf, 'photos' => dreamscaper_json( $mine->photos ), 'plan' => dreamscaper_json( $mine->plan ), 'data' => dreamscaper_json( $mine->data ) );
		}
	}
	if ( isset( $d['plan'] ) && is_array( $d['plan'] ) && ! empty( $d['plan']['shapes'] ) ) {
		$property         = $property ? $property : array( 'address' => trim( $f['address'] . ', ' . $f['town'], ', ' ), 'photos' => array() );
		$plan             = dreamscaper_crm_clean( $d['plan'] );
		$plan['fromDesign'] = true;
		if ( empty( $property['plan']['shapes'] ) ) {
			$property['plan'] = $plan;
		} else {
			$design['plan'] = $plan; // the contractor can import it into their plan
		}
	}
	$ids = dreamscaper_crm_new_lead( (int) $p->user_id, $f, 'dreamscaper', $uid, $design, $property );
	$wpdb->update( dreamscaper_t( 'quotes' ), array( 'origin' => 'market' ), array( 'id' => $ids['quote'] ) );
	$q   = dreamscaper_crm_get( 'quotes', $ids['quote'], $p->user_id );
	$c   = dreamscaper_crm_get( 'clients', $ids['client'], $p->user_id );
	$tid = dreamscaper_thread_hire( (int) $p->user_id, $uid, (int) $ids['quote'], (int) $ids['client'], $design['title'] );
	dreamscaper_thread_post( $tid, $uid, "📋 Quote request: {$design['title']}\nTiming: {$design['timing']}\nBudget: {$design['budget']}" . ( $f['message'] ? "\n\n" . $f['message'] : '' ), array( 'kind' => 'brief', 'attach' => $design['after'] ? array( array( 'url' => $design['after'], 'name' => 'Dreamscape design' ) ) : array(), 'ref_type' => 'quote', 'ref_id' => $ids['quote'], 'notify' => false ) );
	dreamscaper_tpl_send( $p, 'alert_new_request', array( 'quote' => $q, 'client' => $c ), array(), array( 'force' => true, 'hub' => 'inbox', 'target' => $ids['quote'] ) );
	dreamscaper_tpl_send( $p, 'request_received', array( 'quote' => $q, 'client' => $c ), dreamscaper_tpl_to_client( $c ), array( 'thread_id' => $tid, 'ref_type' => 'quote', 'ref_id' => $ids['quote'], 'channels' => array_diff( dreamscaper_tpl_get( $p, 'request_received' )['channels'], array( 'inapp' ) ) ) );
	return array( 'ok' => true, 'quote' => $ids['quote'], 'thread' => $tid );
}

function dreamscaper_crm_portal() {
	global $wpdb;
	$uid = get_current_user_id();
	$Q   = dreamscaper_t( 'quotes' );
	$C   = dreamscaper_t( 'clients' );
	$rows = $wpdb->get_results( $wpdb->prepare( "SELECT q.* FROM $Q q LEFT JOIN $C c ON c.id=q.client_id WHERE (q.user_id=%d OR c.user_id=%d) ORDER BY q.updated DESC LIMIT 200", $uid, $uid ) );
	$items = array();
	foreach ( $rows as $q ) {
		$p    = dreamscaper_pro_row( $q->pro_id );
		$docs = dreamscaper_json( $q->docs );
		$des  = dreamscaper_json( $q->design );
		$it   = array(
			'id' => (int) $q->id, 'number' => $q->number, 'title' => $q->title, 'status' => $q->status, 'job_status' => $q->job_status,
			'pro' => $p ? dreamscaper_pro_public( $p, true ) : null, 'total' => (float) $q->total,
			'before' => isset( $des['before'] ) ? $des['before'] : '', 'after' => isset( $des['after'] ) ? $des['after'] : '',
			'link' => in_array( $q->status, array( 'sent', 'viewed', 'signed', 'expired', 'declined' ), true ) ? dreamscaper_quote_url( $q->token ) : '',
			'sections' => isset( $docs['proposal']['sections'] ) ? array_map( function ( $s ) { return array( 'title' => $s['title'], 'scope' => isset( $s['scope'] ) ? $s['scope'] : array(), 'optional' => ! empty( $s['optional'] ) ); }, $docs['proposal']['sections'] ) : array(),
			'created' => dreamscaper_ms( $q->created ), 'sent' => dreamscaper_ms( $q->sent_at ), 'signed' => dreamscaper_ms( $q->signed_at ),
			'visits' => array_map( 'dreamscaper_cal_visit_out', $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( 'visits' ) . " WHERE quote_id=%d AND status<>'cancelled' ORDER BY start", $q->id ) ) ),
			'thread' => (int) $wpdb->get_var( $wpdb->prepare( 'SELECT id FROM ' . dreamscaper_t( 'threads' ) . " WHERE kind='hire' AND quote_id=%d AND user_b=%d LIMIT 1", $q->id, $uid ) ),
			'brief' => isset( $des['brief'] ) ? array( 'services' => $des['brief']['services'], 'score' => isset( $des['brief']['score'] ) ? (int) $des['brief']['score'] : null, 'missing' => isset( $des['brief']['missing'] ) ? $des['brief']['missing'] : array() ) : null,
			'invoices' => array_map( function ( $i ) { return array( 'number' => $i->number, 'title' => $i->title, 'amount' => (float) $i->amount, 'status' => $i->status, 'due' => $i->due, 'link' => dreamscaper_invoice_url( $i->token ) ); }, $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( 'invoices' ) . " WHERE quote_id=%d AND status IN ('sent','paid') ORDER BY id", $q->id ) ) ),
			'reviewed' => (bool) $wpdb->get_var( $wpdb->prepare( 'SELECT id FROM ' . dreamscaper_t( 'reviews' ) . ' WHERE quote_id=%d AND user_id=%d', $q->id, $uid ) ),
		);
		$items[] = $it;
	}
	$hired = array();
	foreach ( $items as $it ) {
		if ( 'signed' === $it['status'] && $it['pro'] ) {
			$hired[ $it['pro']['id'] ] = isset( $hired[ $it['pro']['id'] ] ) ? $hired[ $it['pro']['id'] ] : array( 'pro' => $it['pro'], 'jobs' => array() );
			$hired[ $it['pro']['id'] ]['jobs'][] = array( 'id' => $it['id'], 'title' => $it['title'], 'status' => $it['job_status'] ? $it['job_status'] : 'signed', 'signed' => $it['signed'], 'total' => $it['total'] );
		}
	}
	$other_inv = array_map( function ( $i ) { return array( 'number' => $i->number, 'title' => $i->title, 'amount' => (float) $i->amount, 'status' => $i->status, 'due' => $i->due, 'link' => dreamscaper_invoice_url( $i->token ) ); }, $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( 'invoices' ) . " WHERE user_id=%d AND quote_id=0 AND status IN ('sent','paid') ORDER BY id DESC LIMIT 50", $uid ) ) );
	return array( 'items' => $items, 'hired' => array_values( $hired ), 'invoices' => $other_inv );
}

/** Review after a finished (or paid) job: stars + "how well did they turn my Dreamscape into reality". */
function dreamscaper_crm_review( WP_REST_Request $r ) {
	global $wpdb;
	$uid = get_current_user_id();
	$j   = $r->get_json_params();
	$q   = $wpdb->get_row( $wpdb->prepare( 'SELECT q.* FROM ' . dreamscaper_t( 'quotes' ) . ' q LEFT JOIN ' . dreamscaper_t( 'clients' ) . " c ON c.id=q.client_id WHERE q.id=%d AND (q.user_id=%d OR c.user_id=%d) AND q.status='signed'", (int) ( isset( $j['quote_id'] ) ? $j['quote_id'] : 0 ), $uid, $uid ) );
	if ( ! $q ) {
		return dreamscaper_crm_err( 'You can review a contractor after they’ve done a job for you.' );
	}
	$stars   = max( 1, min( 5, (int) ( isset( $j['stars'] ) ? $j['stars'] : 0 ) ) );
	$reality = max( 0, min( 5, (int) ( isset( $j['reality'] ) ? $j['reality'] : 0 ) ) );
	$text    = dreamscaper_crm_area( $j, 'text', 3000 );
	if ( function_exists( 'dreamscaper_text_ok' ) && ! dreamscaper_text_ok( $text ) ) {
		return dreamscaper_crm_err( 'Please keep reviews family-friendly.' );
	}
	$photo = ! empty( $j['photo'] ) ? dreamscaper_crm_store_image( $j['photo'], 8 * MB_IN_BYTES ) : '';
	$old   = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( 'reviews' ) . ' WHERE user_id=%d AND quote_id=%d', $uid, $q->id ) );
	$P     = dreamscaper_t( 'pros' );
	if ( $old ) {
		$wpdb->update( dreamscaper_t( 'reviews' ), array( 'stars' => $stars, 'reality' => $reality, 'text' => $text, 'photo' => $photo ? $photo : $old->photo ), array( 'id' => $old->id ) );
		$wpdb->query( $wpdb->prepare( "UPDATE $P SET rating_sum=rating_sum+%d, reality_sum=reality_sum+%d, reality_n=reality_n+%d WHERE user_id=%d", $stars - $old->stars, $reality - $old->reality, ( $reality ? 1 : 0 ) - ( $old->reality ? 1 : 0 ), $q->pro_id ) );
	} else {
		$wpdb->insert( dreamscaper_t( 'reviews' ), array( 'pro_id' => $q->pro_id, 'user_id' => $uid, 'quote_id' => $q->id, 'stars' => $stars, 'reality' => $reality, 'text' => $text, 'photo' => $photo, 'reply' => '', 'created' => dreamscaper_now() ) );
		$wpdb->query( $wpdb->prepare( "UPDATE $P SET rating_sum=rating_sum+%d, rating_n=rating_n+1, reality_sum=reality_sum+%d, reality_n=reality_n+%d WHERE user_id=%d", $stars, $reality, $reality ? 1 : 0, $q->pro_id ) );
		dreamscaper_crm_tell_pro( (int) $q->pro_id, 'New ' . $stars . '-star review for ' . $q->title, "A customer left a {$stars}-star review" . ( $reality ? " (Dream-to-Reality: {$reality}/5)" : '' ) . ":\n\n{$text}", $q->id );
		if ( $photo ) {
			$job = dreamscaper_json( $q->job );
			if ( empty( $job['photos'] ) ) {
				$job['photos'] = array( $photo );
				$wpdb->update( dreamscaper_t( 'quotes' ), array( 'job' => wp_json_encode( $job ) ), array( 'id' => $q->id ) );
			}
		}
	}
	// happy customers (4–5 stars) are offered a one-tap public review on the contractor's Google Business
	// Profile (or Facebook / Houzz if that's what they have switched on). Unhappy ratings never see it.
	$also = null;
	if ( $stars >= 4 && function_exists( 'dreamscaper_pro_socials' ) ) {
		$pro = dreamscaper_pro_row( $q->pro_id );
		foreach ( $pro ? dreamscaper_pro_socials( $pro ) : array() as $l ) {
			if ( in_array( $l['key'], array( 'google', 'facebook', 'houzz' ), true ) ) {
				$also = array( 'url' => $l['url'], 'label' => $l['label'], 'business' => $pro->business );
				break;
			}
		}
	}
	return array( 'ok' => true, 'also' => $also );
}

/* --------------------------------------------- homeowner's own properties */

function dreamscaper_crm_myproperties() {
	global $wpdb;
	return array( 'items' => array_map( 'dreamscaper_prop_out', $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( 'props' ) . ' WHERE user_id=%d AND pro_id=0 ORDER BY id', get_current_user_id() ) ) ) );
}

/** Guided property capture result (address, aerial, step photos) saved to the homeowner's account. */
function dreamscaper_crm_myproperty_save( WP_REST_Request $r ) {
	global $wpdb;
	$uid = get_current_user_id();
	$j   = $r->get_json_params();
	$id  = (int) ( isset( $j['id'] ) ? $j['id'] : 0 );
	$P   = dreamscaper_t( 'props' );
	$row = $id ? $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $P WHERE id=%d AND user_id=%d AND pro_id=0", $id, $uid ) ) : null;
	if ( $id && ! $row ) {
		return dreamscaper_crm_err( 'Property not found.', 404 );
	}
	if ( ! dreamscaper_limit( 'myprop', 60, DAY_IN_SECONDS ) ) {
		return dreamscaper_crm_err( 'Please try again later.', 429 );
	}
	$f = array( 'updated' => dreamscaper_now() );
	if ( isset( $j['address'] ) ) {
		$f['address'] = dreamscaper_crm_txt( $j, 'address', 200 );
		if ( ! $row || $row->address !== $f['address'] ) {
			$g = dreamscaper_geocode( $f['address'] );
			if ( $g ) {
				$f['lat'] = $g['lat'];
				$f['lng'] = $g['lng'];
			}
		}
	}
	if ( ! empty( $j['aerial'] ) ) {
		$f['aerial'] = dreamscaper_crm_store_image( $j['aerial'], 6 * MB_IN_BYTES );
		$f['ppf']    = max( 0, (float) ( isset( $j['ppf'] ) ? $j['ppf'] : 0 ) );
	}
	if ( isset( $j['photos'] ) && is_array( $j['photos'] ) ) {
		$ph = array();
		foreach ( array_slice( $j['photos'], 0, 30 ) as $x ) {
			$url = isset( $x['url'] ) ? dreamscaper_crm_store_image( $x['url'], 6 * MB_IN_BYTES ) : '';
			if ( $url ) {
				$ph[] = array( 'step' => sanitize_key( isset( $x['step'] ) ? $x['step'] : 'other' ), 'url' => $url, 'note' => mb_substr( sanitize_text_field( isset( $x['note'] ) ? $x['note'] : '' ), 0, 300 ) );
			}
		}
		$f['photos'] = wp_json_encode( $ph );
	}
	if ( isset( $j['data'] ) && is_array( $j['data'] ) ) {
		$f['data'] = wp_json_encode( dreamscaper_crm_clean( $j['data'] ) );
	}
	if ( $row ) {
		$wpdb->update( $P, $f, array( 'id' => $row->id ) );
	} else {
		$wpdb->insert( $P, array_merge( array( 'pro_id' => 0, 'client_id' => 0, 'user_id' => $uid, 'address' => '', 'photos' => '[]', 'plan' => '{}', 'data' => '{}', 'created' => dreamscaper_now() ), $f ) );
		$id = $wpdb->insert_id;
	}
	return dreamscaper_prop_out( $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $P WHERE id=%d", $id ) ) );
}

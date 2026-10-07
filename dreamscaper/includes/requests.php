<?php
/**
 * DreamScaper – the Project Request: a homeowner's guided brief, sent to as many contractors
 * as they choose, built so the contractor has what they need to quote without follow-up calls.
 *
 *  - Default questions per service, plus each contractor's own intake questions.
 *  - Site facts that change the price (access, slope, utilities, HOA…), priorities, budget, timing.
 *  - A completeness score and a plain list of what's missing (and why it matters).
 *  - On send: for each contractor, a customer + property + request (quote status 'request'),
 *    a project message thread pre-loaded with the brief, the contractor's alert and auto-reply.
 *  - Drafts save to the homeowner's account so a dead phone loses nothing.
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/* --------------------------------------------------------------- questions */

/** The site facts every request asks (tap answers). */
function dreamscaper_req_site_questions() {
	$yn  = array( 'Yes', 'No', 'Not sure' );
	return array(
		array( 'id' => 'access', 'q' => 'How wide is the way into the work area?', 'type' => 'choice', 'options' => array( 'Wide open (8 ft or more)', 'A gate 4–8 ft wide', 'Narrow (under 4 ft) or no gate', 'Not sure' ), 'why' => 'Decides whether machines fit or everything is moved by hand — a big part of the labor cost.' ),
		array( 'id' => 'slope', 'q' => 'Is the work area flat or sloped?', 'type' => 'choice', 'options' => array( 'Flat', 'Gentle slope', 'Steep slope', 'Not sure' ), 'why' => 'Slopes change drainage, material amounts and whether walls or steps are needed.' ),
		array( 'id' => 'wet', 'q' => 'Any spots that stay wet or puddle after rain?', 'type' => 'choice', 'options' => $yn, 'why' => 'Wet areas need drainage or different plants — better to know before pricing.' ),
		array( 'id' => 'septic', 'q' => 'Is there a septic system?', 'type' => 'choice', 'options' => $yn, 'why' => 'Heavy equipment and deep roots must stay off septic fields.' ),
		array( 'id' => 'well', 'q' => 'Is there a well on the property?', 'type' => 'choice', 'options' => $yn, 'why' => 'Wells need to be protected and avoided when digging.' ),
		array( 'id' => 'tank', 'q' => 'Propane or oil tank in the yard?', 'type' => 'choice', 'options' => $yn, 'why' => 'Buried lines and tanks change where we can dig.' ),
		array( 'id' => 'irrigation', 'q' => 'Is there an irrigation (sprinkler) system?', 'type' => 'choice', 'options' => $yn, 'why' => 'Sprinkler lines get cut if we don’t know they’re there.' ),
		array( 'id' => 'hoa', 'q' => 'Does an HOA need to approve changes?', 'type' => 'choice', 'options' => $yn, 'why' => 'HOA approval can add time and rules about materials and plants.' ),
		array( 'id' => 'pets', 'q' => 'Pets or children who use the yard?', 'type' => 'choice', 'options' => array( 'Pets', 'Children', 'Both', 'Neither' ), 'why' => 'Affects plant choices (toxic plants), gate rules and work-day safety.' ),
		array( 'id' => 'parking', 'q' => 'Where can a truck and trailer park?', 'type' => 'choice', 'options' => array( 'In the driveway', 'On the street', 'Tight — hard to park', 'Not sure' ), 'why' => 'Parking and unloading time are part of every price.' ),
		array( 'id' => 'drop', 'q' => 'Where can materials be dropped off?', 'type' => 'choice', 'options' => array( 'Driveway', 'Lawn', 'Street', 'Not sure' ), 'why' => 'Mulch, stone and soil are delivered by dump truck — the drop spot changes the work.' ),
	);
}

/** Default questions per service (the contractor's own questions are added to these). */
function dreamscaper_req_service_questions() {
	$yn = array( 'Yes', 'No', 'Not sure' );
	$q  = function ( $id, $text, $type, $opts = array(), $why = '' ) {
		return array( 'id' => $id, 'q' => $text, 'type' => $type, 'options' => $opts, 'why' => $why );
	};
	return array(
		'Landscape design'   => array(
			$q( 'ld_areas', 'Which areas should the design cover?', 'multi', array( 'Front yard', 'Backyard', 'Side yard', 'Whole property' ) ),
			$q( 'ld_style', 'What style do you like?', 'choice', array( 'Classic / formal', 'Cottage / colorful', 'Modern / clean', 'Natural / native', 'Low-maintenance', 'Not sure yet' ) ),
			$q( 'ld_care', 'How much yard care do you want to do?', 'choice', array( 'As little as possible', 'Some', 'I love gardening' ), 'Shapes plant choices for the long run.' ),
			$q( 'ld_install', 'Do you want it installed too, or only the design?', 'choice', array( 'Design and install', 'Design only', 'Not sure' ) ),
		),
		'Planting'           => array(
			$q( 'pl_what', 'What would you like planted?', 'multi', array( 'Trees', 'Shrubs', 'Perennials', 'Annuals', 'Privacy screen', 'Foundation plantings' ) ),
			$q( 'pl_goal', 'What’s the goal?', 'multi', array( 'Privacy', 'Color', 'Curb appeal', 'Shade', 'Stop erosion', 'Replace dead plants' ) ),
			$q( 'pl_sun', 'How much sun does the area get?', 'choice', array( 'Full sun (6+ hours)', 'Part sun', 'Mostly shade', 'A mix', 'Not sure' ), 'The right plant for the light is what keeps it alive.' ),
			$q( 'pl_deer', 'Do deer visit your yard?', 'choice', array( 'Never', 'Sometimes', 'Constantly', 'Not sure' ), 'Deer-resistant choices save you from replacing plants.' ),
			$q( 'pl_remove', 'Should existing plants be removed first?', 'choice', $yn ),
			$q( 'pl_water', 'How will new plants be watered?', 'choice', array( 'Sprinkler system', 'Hose / by hand', 'No plan yet' ), 'New plants need regular water the first season.' ),
		),
		'Mulch & stone'      => array(
			$q( 'mu_type', 'Which material?', 'choice', array( 'Dark brown mulch', 'Black mulch', 'Natural / hemlock', 'Red mulch', 'Decorative stone', 'Not sure' ) ),
			$q( 'mu_beds', 'How many beds?', 'choice', array( '1–2 small beds', 'Several beds', 'All beds on the property', 'Not sure' ) ),
			$q( 'mu_now', 'What’s in the beds now?', 'choice', array( 'Old mulch — just a top-up', 'Very thin or bare', 'New beds to create', 'Weeds have taken over' ), 'Tells us how much prep and how many yards are needed.' ),
			$q( 'mu_edge', 'Fresh edging along the beds?', 'choice', $yn ),
		),
		'Lawn installation'  => array(
			$q( 'lw_method', 'Sod or seed?', 'choice', array( 'Sod (instant lawn)', 'Seed', 'Hydroseed', 'Recommend one' ) ),
			$q( 'lw_size', 'About how big is the lawn area?', 'choice', array( 'Under 1,000 sq ft', '1,000–5,000 sq ft', 'Over 5,000 sq ft', 'Not sure' ) ),
			$q( 'lw_old', 'Does the old lawn need to be removed?', 'choice', $yn ),
			$q( 'lw_water', 'How will the new lawn be watered?', 'choice', array( 'Sprinkler system', 'Hose', 'No plan yet' ), 'New lawns fail without daily water for the first weeks.' ),
		),
		'Patios & walkways'  => array(
			$q( 'pa_mat', 'Which material?', 'choice', array( 'Pavers', 'Natural stone / bluestone', 'Concrete', 'Gravel', 'Not sure' ) ),
			$q( 'pa_size', 'About how big?', 'choice', array( 'Small (under 150 sq ft)', 'Medium (150–400 sq ft)', 'Large (over 400 sq ft)', 'Walkway only', 'Not sure' ) ),
			$q( 'pa_use', 'What will it be used for?', 'multi', array( 'Dining', 'Fire pit', 'Lounging', 'Walkway', 'Pool deck', 'Grill area' ) ),
			$q( 'pa_old', 'Is there an old patio or walk to remove?', 'choice', $yn ),
			$q( 'pa_steps', 'Any steps or a change in height?', 'choice', $yn, 'Steps and grade changes need walls or risers.' ),
			$q( 'pa_extras', 'Any extras?', 'multi', array( 'Seat walls', 'Lighting', 'Fire pit', 'Pillars', 'None' ) ),
		),
		'Retaining walls'    => array(
			$q( 'rw_height', 'How tall is the wall?', 'choice', array( 'Under 2 ft', '2–4 ft', 'Over 4 ft', 'Not sure' ), 'Walls over 4 ft usually need an engineer’s design.' ),
			$q( 'rw_length', 'About how long (feet)?', 'number' ),
			$q( 'rw_why', 'What’s it for?', 'multi', array( 'Level the yard', 'Stop erosion', 'Raised garden beds', 'Looks' ) ),
			$q( 'rw_mat', 'Which material?', 'choice', array( 'Concrete block', 'Natural stone', 'Timber', 'Not sure' ) ),
			$q( 'rw_old', 'Replacing an existing wall?', 'choice', $yn ),
		),
		'Landscape lighting' => array(
			$q( 'li_where', 'What should be lit?', 'multi', array( 'Paths', 'Trees', 'House front', 'Patio', 'Steps', 'Driveway' ) ),
			$q( 'li_outlet', 'Is there an outdoor outlet near where the transformer would go?', 'choice', $yn ),
			$q( 'li_smart', 'Phone / smart control?', 'choice', $yn ),
		),
		'Fencing'            => array(
			$q( 'fe_why', 'What’s the fence for?', 'multi', array( 'Privacy', 'Pets', 'Pool (code)', 'Looks', 'Keep deer out' ) ),
			$q( 'fe_mat', 'Which material?', 'choice', array( 'Wood', 'Vinyl', 'Aluminum', 'Chain link', 'Not sure' ) ),
			$q( 'fe_len', 'About how many feet of fence?', 'number' ),
			$q( 'fe_height', 'How tall?', 'choice', array( '3–4 ft', '5 ft', '6 ft', 'Not sure' ) ),
			$q( 'fe_pins', 'Do you know where your property lines are?', 'choice', array( 'Yes — pins are marked', 'Roughly', 'No' ), 'Fences must be on your side of the line.' ),
		),
		'Drainage & grading' => array(
			$q( 'dr_what', 'What’s happening?', 'multi', array( 'Standing water', 'Wet basement', 'Erosion', 'Downspout water pools', 'Low spot in the lawn' ) ),
			$q( 'dr_when', 'When is it worst?', 'choice', array( 'After storms', 'Always wet', 'Spring snow melt', 'Not sure' ) ),
			$q( 'dr_down', 'Are downspouts piped underground?', 'choice', $yn ),
			$q( 'dr_toward', 'Does the ground slope toward the house anywhere?', 'choice', $yn, 'Ground sloping toward a house is the most common cause of wet basements.' ),
		),
		'Tree work'          => array(
			$q( 'tr_what', 'What do you need?', 'multi', array( 'Removal', 'Pruning', 'Stump grinding', 'Planting' ) ),
			$q( 'tr_n', 'How many trees?', 'number' ),
			$q( 'tr_size', 'How tall are they?', 'choice', array( 'Under 20 ft', '20–50 ft', 'Over 50 ft', 'Mixed' ) ),
			$q( 'tr_near', 'Near the house, wires or a fence?', 'choice', $yn, 'Close trees need climbing and rigging instead of felling.' ),
			$q( 'tr_wood', 'Keep the wood?', 'choice', array( 'Haul it all away', 'Leave firewood', 'Not sure' ) ),
		),
		'Lawn care'          => array(
			$q( 'lc_what', 'Which services?', 'multi', array( 'Mowing', 'Aeration', 'Overseeding', 'Dethatching', 'Spring cleanup', 'Fall cleanup' ) ),
			$q( 'lc_size', 'Lawn size?', 'choice', array( 'Small (under ¼ acre)', 'Medium (¼–½ acre)', 'Large (over ½ acre)', 'Not sure' ) ),
			$q( 'lc_freq', 'How often?', 'choice', array( 'Weekly', 'Every two weeks', 'One-time', 'Not sure' ) ),
		),
		'Irrigation'         => array(
			$q( 'ir_what', 'New system or repair?', 'choice', array( 'New system', 'Repair', 'Spring start-up / fall shut-down', 'Not sure' ) ),
			$q( 'ir_src', 'Water source?', 'choice', array( 'Town water', 'Well', 'Not sure' ) ),
		),
	);
}

/** Questions for the chosen services and contractors: site facts, service defaults, each contractor's own. */
function dreamscaper_req_questions( $services, $pro_ids ) {
	$all  = dreamscaper_req_service_questions();
	$svc  = array();
	foreach ( (array) $services as $s ) {
		if ( isset( $all[ $s ] ) ) {
			$svc[ $s ] = $all[ $s ];
		}
	}
	$pros = array();
	foreach ( array_slice( array_unique( array_map( 'intval', (array) $pro_ids ) ), 0, 500 ) as $pid ) {
		$p = dreamscaper_pro_row( $pid );
		if ( ! $p || 'approved' !== $p->status || ( function_exists( 'dreamscaper_pro_can' ) && ! dreamscaper_pro_can( $pid, 'intake' ) ) ) {
			continue;
		}
		$s  = dreamscaper_pro_settings( $p );
		$qs = array();
		foreach ( isset( $s['intake'] ) && is_array( $s['intake'] ) ? $s['intake'] : array() as $service => $list ) {
			if ( '*' !== $service && ! in_array( $service, (array) $services, true ) ) {
				continue;
			}
			foreach ( (array) $list as $x ) {
				if ( ! empty( $x['q'] ) ) {
					$qs[] = array_merge( $x, array( 'service' => $service ) );
				}
			}
		}
		if ( $qs ) {
			$pros[ $pid ] = array( 'business' => $p->business, 'questions' => $qs );
		}
	}
	return array( 'site' => dreamscaper_req_site_questions(), 'services' => $svc, 'pros' => $pros ? $pros : new stdClass() );
}

/* ------------------------------------------------------------ completeness */

/**
 * Score a brief out of 100 and list what's missing (with why it matters).
 * $prop: the homeowner's property row (or null). $has_design: bool.
 */
function dreamscaper_req_score( $b, $prop, $has_design ) {
	$score   = 0;
	$missing = array();
	$add = function ( $ok, $pts, $what, $why ) use ( &$score, &$missing ) {
		if ( $ok ) {
			$score += $pts;
		} else {
			$missing[] = array( 'what' => $what, 'why' => $why, 'pts' => $pts );
		}
	};
	$add( ! empty( $b['services'] ), 10, 'What you want done', 'So the right contractor sees your request.' );
	$add( isset( $b['description'] ) && mb_strlen( trim( $b['description'] ) ) >= 40, 10, 'A few sentences about the project', 'Your own words catch the details a form can’t.' );
	$add( $prop && $prop->address, 10, 'Your address', 'Needed to check the service area and measure from above.' );
	$add( $prop && $prop->aerial, 8, 'The bird’s-eye view of your property', 'Lets the contractor measure lawn, beds and patios to scale.' );
	$photos = $prop ? dreamscaper_json( $prop->photos ) : array();
	$steps  = array();
	foreach ( $photos as $ph ) {
		$steps[ isset( $ph['step'] ) ? $ph['step'] : 'other' ] = 1;
	}
	$labels = array( 'front' => 'front of the house', 'left' => 'left side', 'right' => 'right side', 'back' => 'backyard', 'structures' => 'structures near the work area', 'existing' => 'existing plants and problem spots' );
	foreach ( $labels as $k => $l ) {
		$add( isset( $steps[ $k ] ), 3, 'A photo of the ' . $l, 'Without it, a contractor has to visit or guess before pricing.' );
	}
	$add( $has_design, 10, 'A Dreamscape design', 'Shows exactly what you want — plants, beds and materials.' );
	$add( ! empty( $b['budget'] ), 8, 'Your budget range', 'Lets the contractor suggest what fits, instead of a quote you’ll turn down.' );
	$add( ! empty( $b['timing']['start'] ), 8, 'When you want it done', 'Busy seasons book up — timing decides scheduling.' );
	$site = isset( $b['site'] ) && is_array( $b['site'] ) ? array_filter( $b['site'], function ( $v ) { return '' !== $v && null !== $v; } ) : array();
	$add( count( $site ) >= 6, 8, 'The site questions (access, slope, utilities…)', 'These are what change the price most after you’ve been quoted.' );
	$add( ! empty( $b['priorities']['must'] ), 5, 'What matters most to you', 'Helps a contractor offer phases or options that fit your budget.' );
	$add( ! empty( $b['contact']['channel'] ), 5, 'How you’d like to be contacted', 'So nobody calls when you’d rather text.' );
	return array( 'score' => min( 100, $score ), 'missing' => $missing );
}

/* ------------------------------------------------------------------ REST */

add_action( 'rest_api_init', function () {
	$pub  = '__return_true';
	$auth = function () {
		return is_user_logged_in();
	};
	foreach ( array(
		array( '/req/questions', 'GET', 'dreamscaper_rest_req_questions', $pub ),
		array( '/req/draft', 'GET', 'dreamscaper_rest_req_draft_get', $auth ),
		array( '/req/draft', 'POST', 'dreamscaper_rest_req_draft_save', $auth ),
		array( '/req/send', 'POST', 'dreamscaper_rest_req_send', $auth ),
		array( '/req/missing', 'POST', 'dreamscaper_rest_req_missing', $auth ),
		array( '/req/tidy', 'POST', 'dreamscaper_rest_req_tidy', $auth ),
		array( '/crm/intake', 'GET', 'dreamscaper_rest_intake_get', $auth ),
		array( '/crm/intake', 'POST', 'dreamscaper_rest_intake_save', $auth ),
	) as $r ) {
		register_rest_route( 'dreamscaper/v1', $r[0], array( 'methods' => $r[1], 'callback' => $r[2], 'permission_callback' => $r[3] ) );
	}
} );

function dreamscaper_rest_req_questions( WP_REST_Request $r ) {
	$svc  = array_filter( array_map( 'sanitize_text_field', explode( '|', (string) $r->get_param( 'services' ) ) ) );
	$pros = array_filter( array_map( 'intval', explode( ',', (string) $r->get_param( 'pros' ) ) ) );
	return dreamscaper_req_questions( $svc, $pros );
}

function dreamscaper_rest_req_draft_get() {
	$d = get_user_meta( get_current_user_id(), 'dscp_req_draft', true );
	return array( 'draft' => is_array( $d ) ? $d : null );
}
function dreamscaper_rest_req_draft_save( WP_REST_Request $r ) {
	$j = $r->get_json_params();
	if ( ! empty( $j['clear'] ) ) {
		delete_user_meta( get_current_user_id(), 'dscp_req_draft' );
		return array( 'ok' => true );
	}
	$d = dreamscaper_crm_clean( isset( $j['draft'] ) ? $j['draft'] : array() );
	if ( strlen( wp_json_encode( $d ) ) > 200000 ) {
		return dreamscaper_crm_err( 'That draft is too large to save.' );
	}
	$d['saved'] = time();
	update_user_meta( get_current_user_id(), 'dscp_req_draft', $d );
	return array( 'ok' => true, 'saved' => $d['saved'] * 1000 );
}

/** Clean the brief from the app. */
function dreamscaper_req_clean_brief( $b ) {
	$b   = is_array( $b ) ? $b : array();
	$txt = function ( $v, $n = 200 ) {
		return mb_substr( sanitize_text_field( (string) $v ), 0, $n );
	};
	$out = array(
		'services'    => array_slice( array_values( array_filter( array_map( $txt, (array) ( isset( $b['services'] ) ? $b['services'] : array() ) ) ) ), 0, 20 ),
		'other'       => $txt( isset( $b['other'] ) ? $b['other'] : '', 200 ),
		'description' => mb_substr( sanitize_textarea_field( isset( $b['description'] ) ? $b['description'] : '' ), 0, 4000 ),
		'budget'      => $txt( isset( $b['budget'] ) ? $b['budget'] : '', 60 ),
		'financing'   => ! empty( $b['financing'] ),
		'timing'      => array(
			'start'    => $txt( isset( $b['timing']['start'] ) ? $b['timing']['start'] : '', 60 ),
			'deadline' => preg_match( '/^\d{4}-\d{2}-\d{2}$/', isset( $b['timing']['deadline'] ) ? $b['timing']['deadline'] : '' ) ? $b['timing']['deadline'] : '',
			'reason'   => $txt( isset( $b['timing']['reason'] ) ? $b['timing']['reason'] : '', 200 ),
			'flexible' => $txt( isset( $b['timing']['flexible'] ) ? $b['timing']['flexible'] : '', 40 ),
		),
		'site'        => array(),
		'answers'     => array(),
		'pro_answers' => array(),
		'priorities'  => array(
			'must' => array_slice( array_values( array_filter( array_map( $txt, (array) ( isset( $b['priorities']['must'] ) ? $b['priorities']['must'] : array() ) ) ) ), 0, 20 ),
			'nice' => array_slice( array_values( array_filter( array_map( $txt, (array) ( isset( $b['priorities']['nice'] ) ? $b['priorities']['nice'] : array() ) ) ) ), 0, 20 ),
		),
		'contact'     => array(
			'channel'   => $txt( isset( $b['contact']['channel'] ) ? $b['contact']['channel'] : '', 30 ),
			'times'     => $txt( isset( $b['contact']['times'] ) ? $b['contact']['times'] : '', 120 ),
			'deciders'  => $txt( isset( $b['contact']['deciders'] ) ? $b['contact']['deciders'] : '', 120 ),
			'others'    => $txt( isset( $b['contact']['others'] ) ? $b['contact']['others'] : '', 60 ),
		),
	);
	foreach ( array( 'site', 'answers' ) as $k ) {
		foreach ( (array) ( isset( $b[ $k ] ) ? $b[ $k ] : array() ) as $qid => $v ) {
			$qid = preg_replace( '/[^a-z0-9_]/i', '', (string) $qid );
			if ( $qid ) {
				$out[ $k ][ $qid ] = is_array( $v ) ? array_slice( array_map( $txt, $v ), 0, 20 ) : mb_substr( sanitize_textarea_field( (string) $v ), 0, 1000 );
			}
		}
	}
	foreach ( (array) ( isset( $b['pro_answers'] ) ? $b['pro_answers'] : array() ) as $pid => $ans ) {
		foreach ( (array) $ans as $qid => $v ) {
			$qid = preg_replace( '/[^a-z0-9_]/i', '', (string) $qid );
			if ( $qid ) {
				$out['pro_answers'][ (int) $pid ][ $qid ] = is_array( $v ) ? array_slice( array_map( $txt, $v ), 0, 20 ) : mb_substr( sanitize_textarea_field( (string) $v ), 0, 1000 );
			}
		}
	}
	return $out;
}

/** The brief as readable text (for the first message in each project thread). */
function dreamscaper_req_brief_text( $b, $pro_id, $prop ) {
	$qs   = dreamscaper_req_questions( $b['services'], array( $pro_id ) );
	$find = function ( $list, $id ) {
		foreach ( $list as $x ) {
			if ( $x['id'] === $id ) {
				return $x['q'];
			}
		}
		return $id;
	};
	$val  = function ( $v ) {
		return is_array( $v ) ? implode( ', ', $v ) : (string) $v;
	};
	$t  = "📋 Project request\n\n";
	$t .= 'Services: ' . implode( ', ', $b['services'] ) . ( $b['other'] ? ' (' . $b['other'] . ')' : '' ) . "\n";
	if ( $prop && $prop->address ) {
		$t .= 'Address: ' . $prop->address . "\n";
	}
	if ( $b['budget'] ) {
		$t .= 'Budget: ' . $b['budget'] . ( $b['financing'] ? ' (interested in financing)' : '' ) . "\n";
	}
	if ( $b['timing']['start'] ) {
		$t .= 'Timing: ' . $b['timing']['start'] . ( $b['timing']['deadline'] ? ', must be done by ' . wp_date( 'F j', strtotime( $b['timing']['deadline'] . ' 12:00' ) ) : '' ) . ( $b['timing']['reason'] ? ' — ' . $b['timing']['reason'] : '' ) . ( $b['timing']['flexible'] ? ' (' . $b['timing']['flexible'] . ')' : '' ) . "\n";
	}
	if ( $b['description'] ) {
		$t .= "\n" . $b['description'] . "\n";
	}
	if ( $b['priorities']['must'] ) {
		$t .= "\nMust have: " . implode( '; ', $b['priorities']['must'] );
	}
	if ( $b['priorities']['nice'] ) {
		$t .= "\nNice to have: " . implode( '; ', $b['priorities']['nice'] );
	}
	$sv = '';
	foreach ( $qs['services'] as $svc => $list ) {
		foreach ( $list as $x ) {
			if ( isset( $b['answers'][ $x['id'] ] ) && '' !== $val( $b['answers'][ $x['id'] ] ) ) {
				$sv .= '• ' . $x['q'] . ' ' . $val( $b['answers'][ $x['id'] ] ) . "\n";
			}
		}
	}
	if ( $sv ) {
		$t .= "\n\nAbout the work:\n" . $sv;
	}
	$own = isset( $b['pro_answers'][ $pro_id ] ) ? $b['pro_answers'][ $pro_id ] : array();
	if ( $own && ! empty( $qs['pros'][ $pro_id ]['questions'] ) ) {
		$t .= "\nYour questions:\n";
		foreach ( $qs['pros'][ $pro_id ]['questions'] as $x ) {
			if ( isset( $own[ $x['id'] ] ) ) {
				$t .= '• ' . $x['q'] . ' ' . $val( $own[ $x['id'] ] ) . "\n";
			}
		}
	}
	$site = '';
	foreach ( $b['site'] as $id => $v ) {
		$site .= '• ' . $find( $qs['site'], $id ) . ' ' . $val( $v ) . "\n";
	}
	if ( $site ) {
		$t .= "\nThe site:\n" . $site;
	}
	$c = $b['contact'];
	if ( $c['channel'] || $c['times'] ) {
		$t .= "\nBest way to reach me: " . trim( $c['channel'] . ( $c['times'] ? ', ' . $c['times'] : '' ), ', ' );
	}
	if ( $c['deciders'] ) {
		$t .= "\nWho decides: " . $c['deciders'];
	}
	if ( $c['others'] ) {
		$t .= "\nOther quotes: " . $c['others'];
	}
	return trim( $t );
}

/**
 * Send the request to any number of contractors.
 * body: pros[], brief{}, property (id), design{}, phone, consent (true).
 */
function dreamscaper_rest_req_send( WP_REST_Request $r ) {
	global $wpdb;
	if ( ! dreamscaper_crm_on() ) {
		return dreamscaper_crm_err( 'Not available yet.', 503 );
	}
	$uid = get_current_user_id();
	$j   = $r->get_json_params();
	if ( empty( $j['consent'] ) ) {
		return dreamscaper_crm_err( 'Please confirm the contractors you chose may see your details.' );
	}
	$pros = array_values( array_unique( array_filter( array_map( 'intval', (array) ( isset( $j['pros'] ) ? $j['pros'] : array() ) ) ) ) );
	if ( ! $pros ) {
		return dreamscaper_crm_err( 'Choose at least one contractor.' );
	}
	// anti-spam only: no cap on how many contractors one request goes to
	if ( ! dreamscaper_limit( 'reqsend', 20, DAY_IN_SECONDS ) ) {
		return dreamscaper_crm_err( 'You’ve sent a lot of requests today. Please try again tomorrow.', 429 );
	}
	$day_key = 'dscp_reqn_' . $uid . '_' . gmdate( 'Ymd' );
	$today   = (int) get_transient( $day_key );
	if ( $today + count( $pros ) > 300 ) {
		return dreamscaper_crm_err( 'That’s more contractors than we can send to in one day. Please send the rest tomorrow.', 429 );
	}
	$prof = dreamscaper_profile( $uid );
	$phone = dreamscaper_crm_txt( $j, 'phone', 30 );
	$phone = $phone ? $phone : $prof['phone'];
	if ( strlen( preg_replace( '/\D/', '', $phone ) ) < 10 ) {
		return dreamscaper_crm_err( 'Please add a phone number so contractors can reach you.' );
	}
	if ( ! $prof['phone'] ) {
		update_user_meta( $uid, 'dscp_phone', $phone );
	}
	$brief = dreamscaper_req_clean_brief( isset( $j['brief'] ) ? $j['brief'] : array() );
	if ( ! $brief['services'] ) {
		return dreamscaper_crm_err( 'Choose what you want done.' );
	}
	$P    = dreamscaper_t( 'props' );
	$mine = ! empty( $j['property'] ) ? $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $P WHERE id=%d AND user_id=%d AND pro_id=0", (int) $j['property'], $uid ) ) : null;
	// design pictures are stored once and shared by every request
	$d      = isset( $j['design'] ) && is_array( $j['design'] ) ? $j['design'] : array();
	$design = array(
		'title'  => mb_substr( sanitize_text_field( ! empty( $d['title'] ) ? $d['title'] : ( ! empty( $j['title'] ) ? $j['title'] : implode( ' & ', array_slice( $brief['services'], 0, 2 ) ) ) ), 0, 160 ),
		'before' => ! empty( $d['before'] ) ? dreamscaper_crm_store_image( $d['before'], 8 * MB_IN_BYTES ) : '',
		'after'  => ! empty( $d['after'] ) ? dreamscaper_crm_store_image( $d['after'], 8 * MB_IN_BYTES ) : '',
		'assets' => isset( $d['assets'] ) ? dreamscaper_crm_clean( array_slice( (array) $d['assets'], 0, 200 ) ) : array(),
		'ground' => isset( $d['ground'] ) ? dreamscaper_crm_clean( array_slice( (array) $d['ground'], 0, 50 ) ) : array(),
		'season' => sanitize_key( isset( $d['season'] ) ? $d['season'] : '' ),
		'ai'     => ! empty( $d['ai'] ),
		'message' => $brief['description'],
		'timing' => $brief['timing']['start'],
		'budget' => $brief['budget'],
		'source' => 'dreamscaper',
	);
	$has_design = (bool) $design['after'];
	$sc         = dreamscaper_req_score( $brief, $mine, $has_design );
	$brief['score']   = $sc['score'];
	$brief['missing'] = array_map( function ( $m ) { return $m['what']; }, $sc['missing'] );
	$property = null;
	if ( $mine ) {
		$property = array( 'address' => $mine->address, 'lat' => $mine->lat, 'lng' => $mine->lng, 'aerial' => $mine->aerial, 'ppf' => $mine->ppf, 'photos' => dreamscaper_json( $mine->photos ), 'plan' => dreamscaper_json( $mine->plan ), 'data' => dreamscaper_json( $mine->data ) );
	}
	if ( isset( $d['plan'] ) && is_array( $d['plan'] ) && ! empty( $d['plan']['shapes'] ) ) {
		$property = $property ? $property : array( 'address' => trim( $prof['address'] . ', ' . $prof['town'], ', ' ), 'photos' => array() );
		$plan     = dreamscaper_crm_clean( $d['plan'] );
		$plan['fromDesign'] = true;
		if ( empty( $property['plan']['shapes'] ) ) {
			$property['plan'] = $plan;
		} else {
			$design['plan'] = $plan;
		}
	}
	$f = array( 'name' => $prof['name'], 'email' => $prof['email'], 'phone' => $phone, 'address' => $mine ? $mine->address : $prof['address'], 'town' => $prof['town'], 'state' => $prof['state'], 'zip' => $prof['zip'], 'message' => $brief['description'] );
	$sent = array();
	$skip = array();
	$Q    = dreamscaper_t( 'quotes' );
	foreach ( $pros as $pid ) {
		$p = dreamscaper_pro_row( $pid );
		if ( ! $p || 'approved' !== $p->status ) {
			$skip[] = array( 'id' => $pid, 'reason' => 'not found' );
			continue;
		}
		if ( (int) $p->user_id === $uid ) {
			$skip[] = array( 'id' => $pid, 'business' => $p->business, 'reason' => 'that’s your own business' );
			continue;
		}
		if ( ! dreamscaper_pro_accepting( $pid ) ) {
			$skip[] = array( 'id' => $pid, 'business' => $p->business, 'reason' => 'isn’t taking new requests right now' );
			continue;
		}
		// the same request to the same contractor within a day is a duplicate
		$dup = $wpdb->get_var( $wpdb->prepare( "SELECT q.id FROM $Q q WHERE q.pro_id=%d AND q.user_id=%d AND q.status='request' AND q.created > %s AND q.title=%s LIMIT 1", $pid, $uid, gmdate( 'Y-m-d H:i:s', time() - DAY_IN_SECONDS ), $design['title'] ) );
		if ( $dup ) {
			$skip[] = array( 'id' => $pid, 'business' => $p->business, 'reason' => 'already has this request from today' );
			continue;
		}
		$des          = $design;
		$des['brief'] = $brief;
		$ids          = dreamscaper_crm_new_lead( (int) $pid, $f, 'dreamscaper', $uid, $des, $property );
		if ( ! $ids['quote'] ) {
			$skip[] = array( 'id' => $pid, 'business' => $p->business, 'reason' => 'couldn’t be created' );
			continue;
		}
		$wpdb->update( $Q, array( 'origin' => 'market' ), array( 'id' => $ids['quote'] ) );
		$q    = dreamscaper_crm_get( 'quotes', $ids['quote'], $pid );
		$c    = dreamscaper_crm_get( 'clients', $ids['client'], $pid );
		$prop = $ids['prop'] ? dreamscaper_crm_get( 'props', $ids['prop'], $pid ) : null;
		$tid  = dreamscaper_thread_hire( (int) $pid, $uid, (int) $ids['quote'], (int) $ids['client'], $design['title'] );
		$attach = array();
		foreach ( array( $design['after'], $design['before'] ) as $img ) {
			if ( $img ) {
				$attach[] = array( 'url' => $img, 'name' => $img === $design['after'] ? 'Dreamscape design' : 'Before' );
			}
		}
		dreamscaper_thread_post( $tid, $uid, dreamscaper_req_brief_text( $brief, (int) $pid, $prop ), array( 'kind' => 'brief', 'attach' => $attach, 'ref_type' => 'quote', 'ref_id' => $ids['quote'], 'notify' => false ) );
		dreamscaper_tpl_send( $p, 'alert_new_request', array( 'quote' => $q, 'client' => $c, 'prop' => $prop ), array(), array( 'force' => true, 'hub' => 'inbox', 'target' => $ids['quote'] ) );
		dreamscaper_tpl_send( $p, 'request_received', array( 'quote' => $q, 'client' => $c, 'prop' => $prop ), dreamscaper_tpl_to_client( $c ), array( 'thread_id' => $tid, 'ref_type' => 'quote', 'ref_id' => $ids['quote'], 'channels' => array_diff( dreamscaper_tpl_get( $p, 'request_received' )['channels'], array( 'inapp' ) ) ) );
		$sent[] = array( 'id' => (int) $pid, 'business' => $p->business, 'quote' => (int) $ids['quote'], 'thread' => $tid );
	}
	set_transient( $day_key, $today + count( $sent ), DAY_IN_SECONDS );
	if ( $sent ) {
		delete_user_meta( $uid, 'dscp_req_draft' );
		$names = implode( ', ', array_map( function ( $x ) { return $x['business']; }, $sent ) );
		dreamscaper_crm_tell_user( $uid, 'Your request went to ' . count( $sent ) . ' contractor' . ( 1 === count( $sent ) ? '' : 's' ) . ': ' . mb_substr( $names, 0, 180 ) );
		if ( is_email( $prof['email'] ) ) {
			wp_mail( $prof['email'], 'Your DreamScaper request was sent to ' . count( $sent ) . ' contractor' . ( 1 === count( $sent ) ? '' : 's' ), "Hi " . preg_split( '/\s+/', $prof['name'] )[0] . ",\n\nYour request “{$design['title']}” went to:\n\n• " . implode( "\n• ", array_map( function ( $x ) { return $x['business']; }, $sent ) ) . "\n\nEach contractor can message you, book a visit and send a quote. You’ll see everything in DreamScaper → Messages and My Projects:\n" . dreamscaper_app_url( array( 'ds_projects' => 1 ) ) );
		}
	}
	return array( 'sent' => $sent, 'skipped' => $skip, 'score' => $sc['score'] );
}

/** Is this contractor taking new homeowner requests (active account, under their monthly limit)? */
function dreamscaper_pro_accepting( $pro_id ) {
	if ( ! function_exists( 'dreamscaper_pro_writable' ) ) {
		return true;
	}
	if ( ! dreamscaper_pro_writable( $pro_id ) ) {
		return false;
	}
	$l = dreamscaper_pro_limit( $pro_id, 'leads_month' );
	return 0 !== $l['left'];
}

/** Contractor: ask the homeowner for what's missing, in one specific message. */
function dreamscaper_rest_req_missing( WP_REST_Request $r ) {
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$j = $r->get_json_params();
	$q = dreamscaper_crm_get( 'quotes', (int) ( isset( $j['quote_id'] ) ? $j['quote_id'] : 0 ), $p->user_id );
	if ( ! $q ) {
		return dreamscaper_crm_err( 'Request not found.', 404 );
	}
	$items = array_slice( array_filter( array_map( function ( $x ) { return mb_substr( sanitize_text_field( (string) $x ), 0, 200 ); }, (array) ( isset( $j['items'] ) ? $j['items'] : array() ) ) ), 0, 20 );
	$note  = mb_substr( sanitize_textarea_field( isset( $j['note'] ) ? $j['note'] : '' ), 0, 1000 );
	if ( ! $items && ! $note ) {
		return dreamscaper_crm_err( 'Pick what you need, or write a note.' );
	}
	$list = ( $items ? '• ' . implode( "\n• ", $items ) : '' ) . ( $note ? ( $items ? "\n\n" : '' ) . $note : '' );
	$c    = dreamscaper_crm_get( 'clients', $q->client_id, $p->user_id );
	$tid  = dreamscaper_thread_for_quote( $q );
	$res  = dreamscaper_tpl_send( $p, 'missing_info', array( 'quote' => $q, 'client' => $c ), dreamscaper_tpl_to_client( $c ), array( 'force' => true, 'thread_id' => $tid, 'ref_type' => 'quote', 'ref_id' => $q->id, 'extra' => array( 'missing_items' => $list ), 'link' => dreamscaper_app_url( array( 'ds_projects' => 1 ) ), 'button' => 'Add the details' ) );
	dreamscaper_crm_log( $p->user_id, $q->client_id, $q->id, 'note', 'Asked the customer for: ' . str_replace( "\n", ' ', $list ) );
	return array( 'ok' => true, 'sent' => $res['sent'] + ( $tid ? 1 : 0 ), 'thread' => $tid );
}

/* ---------------------------------------------- contractor intake editor */

function dreamscaper_rest_intake_get() {
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$s = dreamscaper_pro_settings( $p );
	return array(
		'intake'   => isset( $s['intake'] ) && is_array( $s['intake'] ) ? $s['intake'] : new stdClass(),
		'defaults' => dreamscaper_req_service_questions(),
		'site'     => dreamscaper_req_site_questions(),
		'services' => array_values( array_filter( explode( ',', trim( $p->services, ',' ) ) ) ),
		'allowed'  => dreamscaper_pro_can( $p->user_id, 'intake' ),
	);
}

function dreamscaper_rest_intake_save( WP_REST_Request $r ) {
	global $wpdb;
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$gate = dreamscaper_pro_gate( $p->user_id, 'intake' );
	if ( is_wp_error( $gate ) ) {
		return $gate;
	}
	$j   = $r->get_json_params();
	$out = array();
	$n   = 0;
	foreach ( (array) ( isset( $j['intake'] ) ? $j['intake'] : array() ) as $service => $list ) {
		$service = mb_substr( sanitize_text_field( (string) $service ), 0, 60 );
		foreach ( array_slice( (array) $list, 0, 25 ) as $x ) {
			$q = mb_substr( sanitize_text_field( isset( $x['q'] ) ? $x['q'] : '' ), 0, 200 );
			if ( '' === $q ) {
				continue;
			}
			$type = in_array( isset( $x['type'] ) ? $x['type'] : '', array( 'text', 'long', 'choice', 'multi', 'yesno', 'number', 'date' ), true ) ? $x['type'] : 'text';
			$out[ $service ][] = array(
				'id'       => ! empty( $x['id'] ) ? substr( preg_replace( '/[^a-z0-9_]/', '', strtolower( $x['id'] ) ), 0, 24 ) : 'p' . substr( md5( $service . $q . $n ), 0, 10 ),
				'q'        => $q,
				'type'     => $type,
				'options'  => in_array( $type, array( 'choice', 'multi' ), true ) ? array_slice( array_values( array_filter( array_map( function ( $o ) { return mb_substr( sanitize_text_field( (string) $o ), 0, 80 ); }, (array) ( isset( $x['options'] ) ? $x['options'] : array() ) ) ) ), 0, 12 ) : array(),
				'why'      => mb_substr( sanitize_text_field( isset( $x['why'] ) ? $x['why'] : '' ), 0, 200 ),
				'required' => ! empty( $x['required'] ),
			);
			$n++;
		}
	}
	$s           = dreamscaper_pro_settings( $p );
	$s['intake'] = $out;
	$wpdb->update( dreamscaper_t( 'pros' ), array( 'settings' => wp_json_encode( $s ) ), array( 'user_id' => $p->user_id ) );
	return array( 'intake' => $out ? $out : new stdClass(), 'count' => $n );
}

/**
 * Tidy a rambling description into a clear scope summary. The homeowner sees the result and
 * chooses whether to use it — it is never sent anywhere on its own.
 */
function dreamscaper_rest_req_tidy( WP_REST_Request $r ) {
	if ( ! dreamscaper_opt( 'fal_key' ) ) {
		return dreamscaper_crm_err( 'This helper isn’t switched on yet.', 503 );
	}
	if ( ! dreamscaper_limit( 'reqtidy', 20, DAY_IN_SECONDS ) ) {
		return dreamscaper_crm_err( 'Try again tomorrow.', 429 );
	}
	$j    = $r->get_json_params();
	$text = mb_substr( sanitize_textarea_field( isset( $j['text'] ) ? $j['text'] : '' ), 0, 3000 );
	$svc  = implode( ', ', array_map( 'sanitize_text_field', array_slice( (array) ( isset( $j['services'] ) ? $j['services'] : array() ), 0, 10 ) ) );
	if ( mb_strlen( $text ) < 15 ) {
		return dreamscaper_crm_err( 'Write or say a little more first.' );
	}
	$out = dreamscaper_fal( 'fal-ai/any-llm', array(
		'model'         => dreamscaper_opt( 'vision_model' ),
		'system_prompt' => 'You rewrite a homeowner’s description of a landscaping project so a contractor can quote it. Keep every fact they gave, invent nothing, keep their voice (first person), use short plain sentences, and put any specific wants (plants, materials, sizes, problems, deadlines) in a short bulleted list at the end. No headings. Under 160 words.',
		'prompt'        => ( $svc ? "Services: $svc\n\n" : '' ) . "Their words:\n" . $text,
		'max_tokens'    => 450,
	) );
	if ( is_wp_error( $out ) || empty( $out['output'] ) ) {
		return dreamscaper_crm_err( 'The helper is busy. Please try again.', 502 );
	}
	return array( 'text' => mb_substr( trim( sanitize_textarea_field( (string) $out['output'] ) ), 0, 3000 ) );
}

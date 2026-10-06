<?php
/**
 * DreamScaper – AI features (signed-in customers only).
 *  - Image editing / generation: Black Forest Labs FLUX.2 [klein] 4B (api.bfl.ai)
 *  - Smart select (text-prompted segmentation): Meta SAM 3 via fal.ai
 *  - Identify: Pl@ntNet for plants, a vision model via fal.ai for everything else
 * All keys stay on the server. Image generations count against a daily limit.
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

function dreamscaper_ai_limit() {
	return max( 0, (int) dreamscaper_opt( 'ai_daily' ) );
}

function dreamscaper_ai_today() {
	return wp_date( 'Y-m-d' );
}

function dreamscaper_ai_used( $uid ) {
	if ( ! $uid ) {
		return 0;
	}
	$d = get_user_meta( $uid, 'dscp_ai_day', true );
	return dreamscaper_ai_today() === $d ? (int) get_user_meta( $uid, 'dscp_ai_used', true ) : 0;
}

function dreamscaper_ai_unlimited( $uid ) {
	return $uid && user_can( $uid, 'manage_options' ) && dreamscaper_opt( 'ai_owner_unlimited' );
}

function dreamscaper_ai_bought( $uid ) {
	return $uid ? max( 0, (int) get_user_meta( $uid, 'dscp_ai_bought', true ) ) : 0;
}

function dreamscaper_ai_status( $uid ) {
	$limit  = dreamscaper_ai_limit();
	$used   = dreamscaper_ai_used( $uid );
	$free   = max( 0, $limit - $used );
	$bought = dreamscaper_ai_bought( $uid );
	return array(
		'enabled'   => (bool) dreamscaper_opt( 'bfl_key' ),
		'segment'   => (bool) dreamscaper_opt( 'fal_key' ),
		'identify'  => (bool) ( dreamscaper_opt( 'plantnet_key' ) || dreamscaper_opt( 'fal_key' ) ),
		'limit'     => $limit,
		'used'      => $used,
		'free'      => $free,
		'bought'    => $bought,
		'left'      => dreamscaper_ai_unlimited( $uid ) ? 999 : $free + $bought,
		'unlimited' => dreamscaper_ai_unlimited( $uid ),
		'shop'      => dreamscaper_shop_public(),
	);
}

/** Use one credit: today's free ones first, then purchased. Returns 'free' | 'paid' | 'admin' | false. */
function dreamscaper_ai_take( $uid ) {
	if ( dreamscaper_ai_unlimited( $uid ) ) {
		return 'admin';
	}
	$used = dreamscaper_ai_used( $uid );
	if ( $used < dreamscaper_ai_limit() ) {
		update_user_meta( $uid, 'dscp_ai_day', dreamscaper_ai_today() );
		update_user_meta( $uid, 'dscp_ai_used', $used + 1 );
		return 'free';
	}
	$b = dreamscaper_ai_bought( $uid );
	if ( $b > 0 ) {
		update_user_meta( $uid, 'dscp_ai_bought', $b - 1 );
		return 'paid';
	}
	return false;
}

function dreamscaper_ai_refund( $uid, $kind = 'free' ) {
	if ( 'paid' === $kind ) {
		update_user_meta( $uid, 'dscp_ai_bought', dreamscaper_ai_bought( $uid ) + 1 );
		return;
	}
	if ( 'free' !== $kind ) {
		return;
	}
	$used = dreamscaper_ai_used( $uid );
	if ( $used > 0 ) {
		update_user_meta( $uid, 'dscp_ai_used', $used - 1 );
	}
}

/** Decode a data: URI image into a temp file path (jpeg/png/webp only). */
function dreamscaper_data_image( $uri, $max = 10485760 ) {
	if ( ! is_string( $uri ) || ! preg_match( '#^data:image/(jpeg|png|webp);base64,#', $uri, $m ) || strlen( $uri ) > $max * 1.4 ) {
		return null;
	}
	$bin = base64_decode( substr( $uri, strpos( $uri, ',' ) + 1 ), true );
	if ( ! $bin || ! @getimagesizefromstring( $bin ) ) {
		return null;
	}
	return array( 'bin' => $bin, 'mime' => 'image/' . $m[1], 'uri' => $uri );
}

add_action( 'rest_api_init', function () {
	$auth = function () {
		return is_user_logged_in();
	};
	foreach ( array(
		array( '/ai/edit', 'POST', 'dreamscaper_rest_ai_edit' ),
		array( '/ai/job', 'GET', 'dreamscaper_rest_ai_job' ),
		array( '/ai/segment', 'POST', 'dreamscaper_rest_ai_segment' ),
		array( '/ai/identify', 'POST', 'dreamscaper_rest_ai_identify' ),
		array( '/ai/growth', 'POST', 'dreamscaper_rest_ai_growth' ),
	) as $r ) {
		register_rest_route( 'dreamscaper/v1', $r[0], array( 'methods' => $r[1], 'callback' => $r[2], 'permission_callback' => $auth ) );
	}
} );

/* ------------------------------------------------------- FLUX.2 [klein] 4B */

function dreamscaper_rest_ai_edit( WP_REST_Request $r ) {
	$uid = get_current_user_id();
	$key = dreamscaper_opt( 'bfl_key' );
	if ( ! $key ) {
		return new WP_Error( 'dreamscaper', 'Dreamscape AI isn’t switched on yet.', array( 'status' => 503 ) );
	}
	$j      = $r->get_json_params();
	$prompt = trim( sanitize_textarea_field( isset( $j['prompt'] ) ? $j['prompt'] : '' ) );
	$img    = dreamscaper_data_image( isset( $j['image'] ) ? $j['image'] : '' );
	if ( ! $img || strlen( $prompt ) < 4 ) {
		return new WP_Error( 'dreamscaper', 'Add a photo and pick what you’d like first.', array( 'status' => 400 ) );
	}
	if ( strlen( $prompt ) > 3000 ) {
		$prompt = substr( $prompt, 0, 3000 );
	}
	if ( ! dreamscaper_limit( 'aiedit', 60, HOUR_IN_SECONDS ) ) {
		return new WP_Error( 'dreamscaper', 'Slow down a little — try again in a few minutes.', array( 'status' => 429 ) );
	}
	$took = dreamscaper_ai_take( $uid );
	if ( ! $took ) {
		return new WP_Error( 'dreamscaper', 'You’ve used today’s ' . dreamscaper_ai_limit() . ' free AI credits. They refill tomorrow — or add more credits anytime.', array( 'status' => 429, 'ai' => dreamscaper_ai_status( $uid ), 'needCredits' => true ) );
	}
	$w       = isset( $j['width'] ) ? (int) $j['width'] : 0;
	$h       = isset( $j['height'] ) ? (int) $j['height'] : 0;
	$payload = array(
		'prompt'           => $prompt,
		'input_image'      => $img['uri'],
		'output_format'    => 'jpeg',
		'safety_tolerance' => 2,
	);
	if ( $w >= 256 && $h >= 256 && $w <= 2048 && $h <= 2048 ) {
		$payload['width']  = $w - ( $w % 16 );
		$payload['height'] = $h - ( $h % 16 );
	}
	if ( isset( $j['seed'] ) && is_numeric( $j['seed'] ) ) {
		$payload['seed'] = (int) $j['seed'];
	}
	$n = 2;
	foreach ( array_slice( (array) ( isset( $j['refs'] ) ? $j['refs'] : array() ), 0, 3 ) as $ref ) {
		$ri = dreamscaper_data_image( $ref, 6 * MB_IN_BYTES );
		if ( $ri ) {
			$payload[ 'input_image_' . $n++ ] = $ri['uri'];
		}
	}
	$res  = wp_remote_post( 'https://api.bfl.ai/v1/' . dreamscaper_opt( 'bfl_model' ), array(
		'timeout' => 45,
		'headers' => array( 'x-key' => $key, 'Content-Type' => 'application/json', 'Accept' => 'application/json' ),
		'body'    => wp_json_encode( $payload ),
	) );
	$code = is_wp_error( $res ) ? 0 : wp_remote_retrieve_response_code( $res );
	$body = is_wp_error( $res ) ? null : json_decode( wp_remote_retrieve_body( $res ), true );
	if ( $code < 200 || $code >= 300 || empty( $body['id'] ) || empty( $body['polling_url'] ) ) {
		dreamscaper_ai_refund( $uid, $took );
		$msg = 402 === $code ? 'Dreamscape AI is out of credits right now. Please let us know!' : 'The AI couldn’t start that one. Please try again.';
		return new WP_Error( 'dreamscaper', $msg, array( 'status' => 502 ) );
	}
	$job = strtolower( wp_generate_password( 16, false ) );
	list( $dir ) = dreamscaper_cloud_dir( $uid );
	file_put_contents( $dir . 'aiin-' . $job . '.jpg', $img['bin'] );
	set_transient( 'dscp_job_' . $job, array(
		'uid'     => $uid,
		'poll'    => esc_url_raw( $body['polling_url'] ),
		'mode'    => sanitize_key( isset( $j['mode'] ) ? $j['mode'] : 'dream' ),
		'prompt'  => $prompt,
		'summary' => sanitize_textarea_field( isset( $j['summary'] ) ? $j['summary'] : '' ),
		'lead'    => ! empty( $j['lead'] ),
		'took'    => $took,
		'status'  => 'pending',
		'started' => time(),
	), HOUR_IN_SECONDS );
	return array( 'job' => $job, 'ai' => dreamscaper_ai_status( $uid ) );
}

function dreamscaper_rest_ai_job( WP_REST_Request $r ) {
	$uid = get_current_user_id();
	$job = sanitize_key( (string) $r->get_param( 'id' ) );
	$st  = get_transient( 'dscp_job_' . $job );
	if ( ! $st || (int) $st['uid'] !== $uid ) {
		return new WP_Error( 'dreamscaper', 'That design request has expired.', array( 'status' => 404 ) );
	}
	list( $dir, $url ) = dreamscaper_cloud_dir( $uid );
	if ( 'ready' === $st['status'] ) {
		return array( 'status' => 'ready', 'url' => $url . 'ai-' . $job . '.jpg', 'ai' => dreamscaper_ai_status( $uid ) );
	}
	if ( 'failed' === $st['status'] ) {
		return array( 'status' => 'failed', 'message' => $st['message'], 'ai' => dreamscaper_ai_status( $uid ) );
	}
	$res = wp_remote_get( $st['poll'], array( 'timeout' => 20, 'headers' => array( 'x-key' => dreamscaper_opt( 'bfl_key' ), 'Accept' => 'application/json' ) ) );
	$b   = is_wp_error( $res ) ? null : json_decode( wp_remote_retrieve_body( $res ), true );
	$s   = isset( $b['status'] ) ? $b['status'] : '';
	if ( 'Ready' === $s && ! empty( $b['result']['sample'] ) ) {
		$img = wp_remote_get( $b['result']['sample'], array( 'timeout' => 45 ) );
		if ( is_wp_error( $img ) || 200 !== wp_remote_retrieve_response_code( $img ) ) {
			return array( 'status' => 'pending' );
		}
		file_put_contents( $dir . 'ai-' . $job . '.jpg', wp_remote_retrieve_body( $img ) );
		$st['status'] = 'ready';
		set_transient( 'dscp_job_' . $job, $st, HOUR_IN_SECONDS );
		if ( 'dream' === $st['mode'] && $st['lead'] ) {
			dreamscaper_ai_lead_email( $uid, $st, $dir . 'aiin-' . $job . '.jpg', $dir . 'ai-' . $job . '.jpg' );
		}
		return array( 'status' => 'ready', 'url' => $url . 'ai-' . $job . '.jpg', 'ai' => dreamscaper_ai_status( $uid ) );
	}
	$bad = array( 'Error', 'Failed', 'Content Moderated', 'Request Moderated', 'Task not found' );
	if ( in_array( $s, $bad, true ) || time() - $st['started'] > 300 ) {
		dreamscaper_ai_refund( $uid, isset( $st['took'] ) ? $st['took'] : 'free' );
		$st['status']  = 'failed';
		$st['message'] = false !== strpos( $s, 'Moderated' ) ? 'The AI flagged that request. Try different wording or another photo.' : 'That one didn’t work out (it didn’t count against you). Please try again.';
		set_transient( 'dscp_job_' . $job, $st, HOUR_IN_SECONDS );
		return array( 'status' => 'failed', 'message' => $st['message'], 'ai' => dreamscaper_ai_status( $uid ) );
	}
	return array( 'status' => 'pending', 'progress' => isset( $b['progress'] ) ? $b['progress'] : null );
}

function dreamscaper_ai_lead_email( $uid, $st, $before, $after ) {
	$to = dreamscaper_opt( 'notify_email' );
	if ( ! $to || ! dreamscaper_opt( 'ai_lead_email' ) ) {
		return;
	}
	$p    = dreamscaper_profile( $uid );
	$body = "A customer created a Dreamscape AI design.\n\n"
		. "Name: {$p['name']}\nEmail: {$p['email']}\nPhone: {$p['phone']}\nAddress: {$p['address']} {$p['town']} {$p['zip']}\n"
		. 'OK to contact: ' . ( $p['contact'] ? 'yes' : 'no' ) . "\n\n"
		. ( $st['summary'] ? "What they picked:\n{$st['summary']}\n\n" : '' )
		. "Prompt sent to the AI:\n{$st['prompt']}\n\nBefore and after are attached.";
	wp_mail( $to, 'Dreamscape AI design from ' . $p['name'] . ( $p['town'] ? ' (' . $p['town'] . ')' : '' ), $body, array( 'Reply-To: ' . $p['name'] . ' <' . $p['email'] . '>' ), array( $before, $after ) );
}

/* -------------------------------------------------------------- fal.ai */

function dreamscaper_fal( $model, $input, $timeout = 60 ) {
	$key = dreamscaper_opt( 'fal_key' );
	if ( ! $key ) {
		return new WP_Error( 'dreamscaper', 'This AI tool isn’t switched on yet.', array( 'status' => 503 ) );
	}
	$res  = wp_remote_post( 'https://fal.run/' . $model, array(
		'timeout' => $timeout,
		'headers' => array( 'Authorization' => 'Key ' . $key, 'Content-Type' => 'application/json', 'Accept' => 'application/json' ),
		'body'    => wp_json_encode( $input ),
	) );
	$code = is_wp_error( $res ) ? 0 : wp_remote_retrieve_response_code( $res );
	$b    = is_wp_error( $res ) ? null : json_decode( wp_remote_retrieve_body( $res ), true );
	if ( $code < 200 || $code >= 300 || ! is_array( $b ) ) {
		return new WP_Error( 'dreamscaper', 'The AI tool is busy. Please try again.', array( 'status' => 502 ) );
	}
	return $b;
}

/** Smart select: returns mask images (as data URIs) for “the lawn”, “trash cans”, … */
function dreamscaper_rest_ai_segment( WP_REST_Request $r ) {
	if ( ! dreamscaper_limit( 'aiseg', 120, DAY_IN_SECONDS ) ) {
		return new WP_Error( 'dreamscaper', 'That’s a lot of selecting today! Try again tomorrow.', array( 'status' => 429 ) );
	}
	$j    = $r->get_json_params();
	$img  = dreamscaper_data_image( isset( $j['image'] ) ? $j['image'] : '' );
	$text = sanitize_text_field( isset( $j['prompt'] ) ? $j['prompt'] : '' );
	if ( ! $img || strlen( $text ) < 2 ) {
		return new WP_Error( 'dreamscaper', 'Say what to select.', array( 'status' => 400 ) );
	}
	$out = dreamscaper_fal( 'fal-ai/sam-3/image', array(
		'image_url'             => $img['uri'],
		'prompt'                => $text,
		'apply_mask'            => false,
		'output_format'         => 'png',
		'return_multiple_masks' => true,
		'max_masks'             => 12,
		'include_scores'        => true,
	) );
	if ( is_wp_error( $out ) ) {
		return $out;
	}
	$masks = array();
	foreach ( (array) ( isset( $out['masks'] ) ? $out['masks'] : array() ) as $i => $m ) {
		$u = is_array( $m ) && ! empty( $m['url'] ) ? $m['url'] : '';
		if ( ! $u ) {
			continue;
		}
		if ( 0 === strpos( $u, 'data:' ) ) {
			$masks[] = $u;
			continue;
		}
		$g = wp_remote_get( $u, array( 'timeout' => 20 ) );
		if ( ! is_wp_error( $g ) && 200 === wp_remote_retrieve_response_code( $g ) ) {
			$masks[] = 'data:image/png;base64,' . base64_encode( wp_remote_retrieve_body( $g ) );
		}
	}
	return array( 'masks' => $masks, 'scores' => isset( $out['scores'] ) ? $out['scores'] : array() );
}

/** Identify a plant (Pl@ntNet) or a garden item/material (vision model). */
function dreamscaper_rest_ai_identify( WP_REST_Request $r ) {
	if ( ! dreamscaper_limit( 'aiid', 60, DAY_IN_SECONDS ) ) {
		return new WP_Error( 'dreamscaper', 'That’s a lot of identifying today! Try again tomorrow.', array( 'status' => 429 ) );
	}
	$j   = $r->get_json_params();
	$img = dreamscaper_data_image( isset( $j['image'] ) ? $j['image'] : '' );
	if ( ! $img ) {
		return new WP_Error( 'dreamscaper', 'Add a photo first.', array( 'status' => 400 ) );
	}
	$organ = sanitize_key( isset( $j['organ'] ) ? $j['organ'] : 'auto' );
	$plant = null;
	if ( dreamscaper_opt( 'plantnet_key' ) ) {
		$plant = dreamscaper_plantnet( $img, in_array( $organ, array( 'leaf', 'flower', 'fruit', 'bark', 'auto' ), true ) ? $organ : 'auto' );
	}
	$vision = null;
	if ( dreamscaper_opt( 'fal_key' ) && ( ! $plant || $plant['score'] < 0.35 ) ) {
		$vision = dreamscaper_vision_identify( $img );
	}
	if ( $plant && ( $plant['score'] >= 0.35 || ! $vision || 'plant' === $vision['kind'] ) ) {
		$plant['kind']  = 'plant';
		$plant['by']    = 'Pl@ntNet';
		if ( $vision && 'plant' === $vision['kind'] && ! empty( $vision['category'] ) ) {
			$plant['category'] = $vision['category'];
		}
		return $plant;
	}
	if ( $vision && 'plant' === $vision['kind'] ) {
		return $vision;
	}
	if ( $vision ) {
		return new WP_Error( 'dreamscaper', 'That doesn’t look like a plant. Plant ID only identifies plants — trees, shrubs, flowers, grasses and weeds. Try a close photo of a leaf or flower.', array( 'status' => 422, 'notPlant' => true ) );
	}
	return new WP_Error( 'dreamscaper', 'We couldn’t identify that plant. Try a closer, clearer photo of one leaf or flower.', array( 'status' => 422 ) );
}

function dreamscaper_plantnet( $img, $organ ) {
	$boundary = wp_generate_password( 24, false );
	$body     = "--{$boundary}\r\nContent-Disposition: form-data; name=\"organs\"\r\n\r\n{$organ}\r\n"
		. "--{$boundary}\r\nContent-Disposition: form-data; name=\"images\"; filename=\"photo.jpg\"\r\nContent-Type: {$img['mime']}\r\n\r\n{$img['bin']}\r\n--{$boundary}--\r\n";
	$url      = add_query_arg( array( 'api-key' => dreamscaper_opt( 'plantnet_key' ), 'lang' => 'en', 'nb-results' => 5, 'include-related-images' => 'false' ), 'https://my-api.plantnet.org/v2/identify/all' );
	$res      = wp_remote_post( $url, array( 'timeout' => 30, 'headers' => array( 'Content-Type' => 'multipart/form-data; boundary=' . $boundary ), 'body' => $body ) );
	$b        = is_wp_error( $res ) ? null : json_decode( wp_remote_retrieve_body( $res ), true );
	if ( empty( $b['results'][0] ) ) {
		return null;
	}
	$alts = array();
	foreach ( array_slice( $b['results'], 0, 4 ) as $x ) {
		$alts[] = array(
			'sci'    => isset( $x['species']['scientificNameWithoutAuthor'] ) ? $x['species']['scientificNameWithoutAuthor'] : '',
			'common' => isset( $x['species']['commonNames'][0] ) ? $x['species']['commonNames'][0] : '',
			'family' => isset( $x['species']['family']['scientificNameWithoutAuthor'] ) ? $x['species']['family']['scientificNameWithoutAuthor'] : '',
			'genus'  => isset( $x['species']['genus']['scientificNameWithoutAuthor'] ) ? $x['species']['genus']['scientificNameWithoutAuthor'] : '',
			'score'  => round( (float) $x['score'], 3 ),
		);
	}
	$top = $alts[0];
	return array(
		'name'         => $top['common'] ? ucwords( $top['common'] ) : $top['sci'],
		'sci'          => $top['sci'],
		'family'       => $top['family'],
		'genus'        => $top['genus'],
		'score'        => $top['score'],
		'alternatives' => array_slice( $alts, 1 ),
		'weed'         => null,
	);
}

function dreamscaper_vision_identify( $img ) {
	$sys = 'You identify things in residential landscape photos for a New England landscaping company. Reply with JSON only.';
	$q   = 'Identify the plant in this photo. If the main subject is not a living plant (for example a stone, paver, statue or furniture), set kind to "item". Return JSON with keys: kind ("plant" or "item"), name (common name, short), sci (botanical name for plants, else ""), category (one of: trees, evergreens, shrubs, perennials, grasses, annuals, vines, weeds, features), group (for items: one of Stone, Water, Furniture, Fire, Lighting, Structures, Containers, Decor, Play, Utility, Hardscape; for plants ""), weed (true/false), confidence (0-1), description (one short sentence a homeowner understands, include if it is a weed or invasive in Connecticut), tags (array of 3-8 search words).';
	$out = dreamscaper_fal( 'fal-ai/any-llm/vision', array(
		'model'         => dreamscaper_opt( 'vision_model' ),
		'system_prompt' => $sys,
		'prompt'        => $q,
		'image_urls'    => array( $img['uri'] ),
		'max_tokens'    => 400,
	) );
	if ( is_wp_error( $out ) || empty( $out['output'] ) ) {
		return null;
	}
	$txt = (string) $out['output'];
	if ( preg_match( '/\{.*\}/s', $txt, $m ) ) {
		$txt = $m[0];
	}
	$v = json_decode( $txt, true );
	if ( ! is_array( $v ) || empty( $v['name'] ) ) {
		return null;
	}
	$cats = array( 'trees', 'evergreens', 'shrubs', 'perennials', 'grasses', 'annuals', 'vines', 'weeds', 'features' );
	return array(
		'kind'         => 'plant' === ( isset( $v['kind'] ) ? $v['kind'] : '' ) ? 'plant' : 'item',
		'name'         => sanitize_text_field( $v['name'] ),
		'sci'          => sanitize_text_field( isset( $v['sci'] ) ? $v['sci'] : '' ),
		'category'     => in_array( isset( $v['category'] ) ? $v['category'] : '', $cats, true ) ? $v['category'] : 'features',
		'group'        => sanitize_text_field( isset( $v['group'] ) ? $v['group'] : '' ),
		'weed'         => ! empty( $v['weed'] ),
		'score'        => isset( $v['confidence'] ) ? (float) $v['confidence'] : 0.5,
		'description'  => sanitize_text_field( isset( $v['description'] ) ? $v['description'] : '' ),
		'tags'         => array_map( 'sanitize_text_field', array_slice( (array) ( isset( $v['tags'] ) ? $v['tags'] : array() ), 0, 8 ) ),
		'alternatives' => array(),
		'by'           => 'AI vision',
	);
}

/**
 * Growth profile for a plant that isn't in the DreamScaper library yet, so it can grow
 * realistically in designs. Cached per species for 60 days (shared by all customers). Free.
 */
function dreamscaper_rest_ai_growth( WP_REST_Request $r ) {
	$j    = $r->get_json_params();
	$sci  = sanitize_text_field( isset( $j['sci'] ) ? $j['sci'] : '' );
	$name = sanitize_text_field( isset( $j['name'] ) ? $j['name'] : '' );
	if ( ! $sci && ! $name ) {
		return new WP_Error( 'dreamscaper', 'Which plant?', array( 'status' => 400 ) );
	}
	$key = 'dscp_grow_' . md5( strtolower( $sci ? $sci : $name ) );
	$hit = get_transient( $key );
	if ( $hit ) {
		return $hit;
	}
	if ( ! dreamscaper_limit( 'aigrow', 80, DAY_IN_SECONDS ) ) {
		return new WP_Error( 'dreamscaper', 'Try again tomorrow.', array( 'status' => 429 ) );
	}
	$q   = 'Plant: ' . $name . ( $sci ? ' (' . $sci . ')' : '' ) . '. Give typical landscape values for a garden in Connecticut (USDA zone 6), from university extension references. Return JSON only with keys: '
		. 'cat (one of trees, evergreens, shrubs, perennials, grasses, annuals, vines), h (mature height in feet), w (mature spread in feet), '
		. 'g (for trees, evergreens and shrubs: average growth in inches per year; for perennials and grasses: number of growing seasons to reach full size, 1-4; annuals: 1; vines: feet per year), '
		. 'sun ("F" full sun, "P" part shade, "S" shade, or combinations like "FP"), ev (true if it keeps leaves in winter), native (true if native to the eastern US), '
		. 'zones (like "4-8"), bloom (main flower color as one word: white, pink, red, yellow, orange, purple, blue, lavender, or "" if not showy), months (bloom months like "Jun-Aug" or ""), '
		. 'fall (fall leaf color as one word: red, orange, yellow, gold, purple, burgundy, bronze, or ""), note (one helpful sentence for a homeowner about growth and care).';
	$out = dreamscaper_fal( 'fal-ai/any-llm', array(
		'model'         => dreamscaper_opt( 'vision_model' ),
		'system_prompt' => 'You are a horticulturist. Reply with JSON only.',
		'prompt'        => $q,
		'max_tokens'    => 400,
	) );
	if ( is_wp_error( $out ) || empty( $out['output'] ) ) {
		return new WP_Error( 'dreamscaper', 'Growth details aren’t available right now.', array( 'status' => 502 ) );
	}
	$txt = (string) $out['output'];
	if ( preg_match( '/\{.*\}/s', $txt, $m ) ) {
		$txt = $m[0];
	}
	$v = json_decode( $txt, true );
	if ( ! is_array( $v ) || empty( $v['h'] ) ) {
		return new WP_Error( 'dreamscaper', 'Growth details aren’t available right now.', array( 'status' => 502 ) );
	}
	$cats = array( 'trees', 'evergreens', 'shrubs', 'perennials', 'grasses', 'annuals', 'vines' );
	$word = function ( $k ) use ( $v ) {
		return isset( $v[ $k ] ) ? strtolower( preg_replace( '/[^a-zA-Z-]/', '', (string) $v[ $k ] ) ) : '';
	};
	$p = array(
		'cat'    => in_array( $word( 'cat' ), $cats, true ) ? $word( 'cat' ) : 'shrubs',
		'h'      => max( 0.2, min( 150, (float) $v['h'] ) ),
		'w'      => max( 0.2, min( 100, (float) ( isset( $v['w'] ) ? $v['w'] : $v['h'] ) ) ),
		'g'      => max( 0.5, min( 60, (float) ( isset( $v['g'] ) ? $v['g'] : 6 ) ) ),
		'sun'    => preg_match( '/^[FPS]{1,3}$/', isset( $v['sun'] ) ? (string) $v['sun'] : '' ) ? $v['sun'] : 'F',
		'ev'     => ! empty( $v['ev'] ),
		'native' => ! empty( $v['native'] ),
		'zones'  => preg_match( '/^\d{1,2}-\d{1,2}$/', isset( $v['zones'] ) ? (string) $v['zones'] : '' ) ? $v['zones'] : '',
		'bloom'  => $word( 'bloom' ),
		'months' => preg_match( '/^[A-Z][a-z]{2}(-[A-Z][a-z]{2})?$/', isset( $v['months'] ) ? (string) $v['months'] : '' ) ? $v['months'] : '',
		'fall'   => $word( 'fall' ),
		'note'   => sanitize_text_field( isset( $v['note'] ) ? $v['note'] : '' ),
		'source' => 'estimate',
	);
	set_transient( $key, $p, 60 * DAY_IN_SECONDS );
	return $p;
}

<?php
/**
 * DreamScaper – AI design assistant (vision language model via fal any-llm; no image credits used):
 *  /ai/ask      natural-language request → one precise image-edit instruction (+ small/full change)
 *  /ai/analyze  landscape analysis: curb appeal, privacy, planting, hardscape, lighting, drainage,
 *               erosion, underused areas, maintenance — each with a ready-to-run idea
 *  /ai/explain  why the design works (before vs after)
 *  /ai/style    common style across Inspiration Board pictures → a prompt to apply it
 *
 * Every prompt asks for strict JSON, forbids inventing things that aren't visible, and the reply is
 * validated and cleaned here before it reaches the app.
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

add_action( 'rest_api_init', function () {
	$auth = function () {
		return is_user_logged_in();
	};
	foreach ( array( 'ask', 'analyze', 'explain', 'style' ) as $r ) {
		register_rest_route( 'dreamscaper/v1', '/ai/' . $r, array( 'methods' => 'POST', 'callback' => 'dreamscaper_ai_' . $r, 'permission_callback' => 'dreamscaper_ai_permission' ) );
	}
} );

/** Shared: run the vision model and return decoded JSON (or WP_Error). */
function dreamscaper_vlm( $system, $prompt, $images, $max_tokens = 1200 ) {
	if ( ! dreamscaper_opt( 'fal_key' ) ) {
		return new WP_Error( 'dreamscaper', 'The AI assistant isn’t switched on yet.', array( 'status' => 503 ) );
	}
	$uid = get_current_user_id();
	$k   = 'dscp_vlm_' . $uid . '_' . gmdate( 'Ymd' );
	$n   = (int) get_transient( $k );
	if ( $n >= 60 && ! user_can( $uid, 'manage_options' ) ) {
		return new WP_Error( 'dreamscaper', 'That’s a lot of AI questions today! Try again tomorrow.', array( 'status' => 429 ) );
	}
	set_transient( $k, $n + 1, DAY_IN_SECONDS );
	$urls = array();
	foreach ( array_slice( (array) $images, 0, 6 ) as $img ) {
		$d = dreamscaper_data_image( $img, 4 * MB_IN_BYTES );
		if ( $d ) {
			$urls[] = $d['uri'];
		}
	}
	$args = array( 'model' => dreamscaper_opt( 'vision_model' ), 'system_prompt' => $system, 'prompt' => $prompt, 'max_tokens' => $max_tokens, 'temperature' => 0.3 );
	$out  = $urls ? dreamscaper_fal( 'fal-ai/any-llm/vision', array_merge( $args, array( 'image_urls' => $urls ) ), 90 ) : dreamscaper_fal( 'fal-ai/any-llm', $args, 60 );
	if ( is_wp_error( $out ) ) {
		return $out;
	}
	$txt = isset( $out['output'] ) ? (string) $out['output'] : '';
	$txt = preg_replace( '/^```(?:json)?|```$/m', '', trim( $txt ) );
	if ( preg_match( '/\{.*\}/s', $txt, $m ) ) {
		$txt = $m[0];
	}
	$j = json_decode( $txt, true );
	if ( ! is_array( $j ) ) {
		return new WP_Error( 'dreamscaper', 'The AI answer didn’t come through. Please try again.', array( 'status' => 502 ) );
	}
	return $j;
}
function dreamscaper_ai_txt( $v, $max = 400 ) {
	return mb_substr( trim( sanitize_text_field( is_scalar( $v ) ? (string) $v : '' ) ), 0, $max );
}
function dreamscaper_ai_list( $v, $max_items = 8, $max = 120 ) {
	$out = array();
	foreach ( array_slice( (array) $v, 0, $max_items ) as $x ) {
		$t = dreamscaper_ai_txt( $x, $max );
		if ( '' !== $t ) {
			$out[] = $t;
		}
	}
	return $out;
}
const DREAMSCAPER_AI_ROLE = 'You are a senior residential landscape designer in Connecticut (USDA zones 5b–7a) with 20 years of installation experience. You give specific, practical, buildable advice using plants that thrive in New England. You only describe things you can actually see in the photo; when you are not sure, you say so instead of guessing. You always reply with valid JSON only — no markdown, no extra text.';

/** Ask DreamScaper: turn a homeowner's words into one precise FLUX edit instruction. */
function dreamscaper_ai_ask( WP_REST_Request $r ) {
	$j   = $r->get_json_params();
	$ask = dreamscaper_ai_txt( isset( $j['request'] ) ? $j['request'] : '', 600 );
	if ( mb_strlen( $ask ) < 4 ) {
		return new WP_Error( 'dreamscaper', 'Tell DreamScaper what you’d like.', array( 'status' => 400 ) );
	}
	$aerial = ! empty( $j['aerial'] );
	$keep   = dreamscaper_ai_list( isset( $j['keep'] ) ? $j['keep'] : array(), 12, 60 );
	$prompt = "The homeowner looked at the attached " . ( $aerial ? 'top-down aerial photo' : 'photo' ) . " of their yard and asked: \"{$ask}\"\n\n"
		. "Write ONE instruction for an image-editing AI that will repaint this exact photo. Rules:\n"
		. "1. Be concrete: name specific plants (common names), materials, colors, sizes and WHERE in the photo (e.g. 'along the front foundation, left of the steps').\n"
		. "2. Only refer to things visible in the photo. If the request can't apply (e.g. no walkway exists to change), adapt it sensibly and say so in 'note'.\n"
		. "3. Keep the house, roof, windows, doors, driveway, camera angle and framing exactly the same" . ( $keep ? '; also keep: ' . implode( ', ', $keep ) : '' ) . ".\n"
		. "4. 'scope' is 'small' if it changes one area or element, 'full' if it redesigns the whole landscape.\n"
		. "5. 'explain' is 1–2 friendly sentences for the homeowner about what will change and why it will look good.\n"
		. "Return: {\"instruction\": string (under 90 words), \"scope\": \"small\"|\"full\", \"explain\": string, \"note\": string}";
	$out = dreamscaper_vlm( DREAMSCAPER_AI_ROLE, $prompt, array( isset( $j['image'] ) ? $j['image'] : '' ), 600 );
	if ( is_wp_error( $out ) ) {
		return $out;
	}
	$ins = dreamscaper_ai_txt( isset( $out['instruction'] ) ? $out['instruction'] : '', 900 );
	if ( mb_strlen( $ins ) < 10 ) {
		return new WP_Error( 'dreamscaper', 'The AI couldn’t turn that into a design. Try saying it another way.', array( 'status' => 502 ) );
	}
	return array( 'instruction' => $ins, 'scope' => ( isset( $out['scope'] ) && 'full' === $out['scope'] ) ? 'full' : 'small', 'explain' => dreamscaper_ai_txt( isset( $out['explain'] ) ? $out['explain'] : '' ), 'note' => dreamscaper_ai_txt( isset( $out['note'] ) ? $out['note'] : '' ) );
}

/** Give me ideas / AI landscape analysis. */
function dreamscaper_ai_analyze( WP_REST_Request $r ) {
	$j    = $r->get_json_params();
	$cats = array( 'curb_appeal' => 'Curb appeal', 'privacy' => 'Privacy', 'planting' => 'Planting', 'hardscape' => 'Hardscape', 'lighting' => 'Lighting', 'drainage' => 'Drainage', 'erosion' => 'Erosion', 'underused' => 'Underused area', 'maintenance' => 'Maintenance' );
	$prompt = "Analyze the landscape in the attached photo of a home in Connecticut and list the best improvement opportunities.\n"
		. "Consider each category: " . implode( ', ', array_keys( $cats ) ) . ".\n"
		. "Rules:\n"
		. "1. Only include an item if you can see evidence for it in the photo; say what you saw in 'seen' (e.g. 'bare soil on the slope left of the driveway').\n"
		. "2. Drainage and erosion items must point to visible signs (bare/washed soil, downspouts dumping onto beds, low spots, slopes). Never invent water problems.\n"
		. "3. 'idea' is ONE concrete change written as an instruction for an image-editing AI (specific plants/materials and where), under 45 words, keeping the house and camera angle the same.\n"
		. "4. 'priority' 1 (do first) – 3 (nice to have). Give 4–8 items, best first.\n"
		. "5. 'summary': 2 friendly sentences about the yard's current state and biggest opportunity.\n"
		. "Return: {\"summary\": string, \"items\": [{\"cat\": one of the categories, \"title\": string (max 8 words), \"seen\": string, \"why\": string (one sentence), \"idea\": string, \"priority\": 1|2|3}]}";
	$out = dreamscaper_vlm( DREAMSCAPER_AI_ROLE, $prompt, array( isset( $j['image'] ) ? $j['image'] : '' ), 1600 );
	if ( is_wp_error( $out ) ) {
		return $out;
	}
	$items = array();
	foreach ( array_slice( (array) ( isset( $out['items'] ) ? $out['items'] : array() ), 0, 10 ) as $it ) {
		$cat = isset( $it['cat'] ) && isset( $cats[ $it['cat'] ] ) ? $it['cat'] : '';
		$idea = dreamscaper_ai_txt( isset( $it['idea'] ) ? $it['idea'] : '', 500 );
		if ( ! $cat || mb_strlen( $idea ) < 10 ) {
			continue;
		}
		$items[] = array( 'cat' => $cat, 'label' => $cats[ $cat ], 'title' => dreamscaper_ai_txt( isset( $it['title'] ) ? $it['title'] : '', 80 ), 'seen' => dreamscaper_ai_txt( isset( $it['seen'] ) ? $it['seen'] : '', 200 ), 'why' => dreamscaper_ai_txt( isset( $it['why'] ) ? $it['why'] : '', 300 ), 'idea' => $idea, 'priority' => max( 1, min( 3, (int) ( isset( $it['priority'] ) ? $it['priority'] : 2 ) ) ) );
	}
	usort( $items, function ( $a, $b ) { return $a['priority'] - $b['priority']; } );
	if ( ! $items ) {
		return new WP_Error( 'dreamscaper', 'The AI couldn’t read this photo well. Try a clearer photo of the yard.', array( 'status' => 502 ) );
	}
	return array( 'summary' => dreamscaper_ai_txt( isset( $out['summary'] ) ? $out['summary'] : '', 500 ), 'items' => $items );
}

/** Explain the design: before (first image) vs after (second). */
function dreamscaper_ai_explain( WP_REST_Request $r ) {
	$j      = $r->get_json_params();
	$prompt = "Image 1 is the homeowner's yard before. Image 2 is the new landscape design for the same yard.\n"
		. ( ! empty( $j['instructions'] ) ? 'The design was made from these instructions: "' . dreamscaper_ai_txt( $j['instructions'], 900 ) . "\"\n" : '' )
		. "Explain the design to the homeowner like a landscape designer presenting it. Rules:\n"
		. "1. Describe only changes you can actually see between the two images.\n"
		. "2. For each point: what changed, and the design reason (e.g. framing the entry, layering heights, year-round interest, softening the foundation, repetition, color echo, low maintenance, privacy, drainage).\n"
		. "3. Mention care tips or things to confirm with a contractor in 'notes' (sun, spacing, mature size, deer).\n"
		. "Return: {\"summary\": string (2 sentences), \"points\": [{\"title\": string (max 6 words), \"why\": string (1–2 sentences)}] (3–6 points), \"notes\": [string] (0–3)}";
	$out = dreamscaper_vlm( DREAMSCAPER_AI_ROLE, $prompt, array( isset( $j['before'] ) ? $j['before'] : '', isset( $j['after'] ) ? $j['after'] : '' ), 1200 );
	if ( is_wp_error( $out ) ) {
		return $out;
	}
	$points = array();
	foreach ( array_slice( (array) ( isset( $out['points'] ) ? $out['points'] : array() ), 0, 8 ) as $p ) {
		$t = dreamscaper_ai_txt( isset( $p['title'] ) ? $p['title'] : '', 80 );
		$w = dreamscaper_ai_txt( isset( $p['why'] ) ? $p['why'] : '', 400 );
		if ( $t && $w ) {
			$points[] = array( 'title' => $t, 'why' => $w );
		}
	}
	return array( 'summary' => dreamscaper_ai_txt( isset( $out['summary'] ) ? $out['summary'] : '', 500 ), 'points' => $points, 'notes' => dreamscaper_ai_list( isset( $out['notes'] ) ? $out['notes'] : array(), 3, 300 ) );
}

/** Inspiration Board → common style and a prompt to apply it. */
function dreamscaper_ai_style( WP_REST_Request $r ) {
	$j     = $r->get_json_params();
	$extra = array();
	foreach ( array( 'plants' => 'Plants they saved', 'materials' => 'Materials they saved', 'styles' => 'Styles they picked', 'notes' => 'Their notes' ) as $k => $label ) {
		$list = dreamscaper_ai_list( isset( $j[ $k ] ) ? $j[ $k ] : array(), 20, 120 );
		if ( $list ) {
			$extra[] = $label . ': ' . implode( '; ', $list );
		}
	}
	$n      = count( (array) ( isset( $j['images'] ) ? $j['images'] : array() ) );
	$prompt = "A homeowner saved " . ( $n ? "{$n} inspiration pictures (attached)" : 'these favorites' ) . " for their own yard." . ( $extra ? "\n" . implode( "\n", $extra ) : '' ) . "\n\n"
		. "Identify the landscape style they are drawn to. Rules:\n"
		. "1. Base it on what the pictures and saved items have in common; ignore one-off details.\n"
		. "2. 'style' is a short name (max 4 words), e.g. 'Relaxed cottage', 'Clean modern', 'New England traditional'.\n"
		. "3. 'plants' must be plants that grow well in Connecticut and match the look.\n"
		. "4. 'prompt' is ONE instruction for an image-editing AI to restyle a different home's yard in this look, under 80 words: plants, materials, bed shapes, colors, mood. It must say to keep the house, driveway and camera angle the same.\n"
		. "Return: {\"style\": string, \"summary\": string (2 sentences), \"characteristics\": [string] (3–6), \"plants\": [string] (4–8), \"materials\": [string] (0–4), \"colors\": [string] (2–5), \"prompt\": string}";
	$out = dreamscaper_vlm( DREAMSCAPER_AI_ROLE, $prompt, isset( $j['images'] ) ? (array) $j['images'] : array(), 1200 );
	if ( is_wp_error( $out ) ) {
		return $out;
	}
	$p = dreamscaper_ai_txt( isset( $out['prompt'] ) ? $out['prompt'] : '', 900 );
	if ( mb_strlen( $p ) < 10 ) {
		return new WP_Error( 'dreamscaper', 'The AI couldn’t find a style yet. Add a few more pictures.', array( 'status' => 502 ) );
	}
	return array( 'style' => dreamscaper_ai_txt( isset( $out['style'] ) ? $out['style'] : 'Your style', 60 ), 'summary' => dreamscaper_ai_txt( isset( $out['summary'] ) ? $out['summary'] : '', 500 ), 'characteristics' => dreamscaper_ai_list( isset( $out['characteristics'] ) ? $out['characteristics'] : array(), 6, 160 ), 'plants' => dreamscaper_ai_list( isset( $out['plants'] ) ? $out['plants'] : array(), 8, 60 ), 'materials' => dreamscaper_ai_list( isset( $out['materials'] ) ? $out['materials'] : array(), 4, 60 ), 'colors' => dreamscaper_ai_list( isset( $out['colors'] ) ? $out['colors'] : array(), 5, 40 ), 'prompt' => $p );
}

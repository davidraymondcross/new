<?php
/**
 * DreamScaper – community REST API (namespace dreamscaper/v1, routes start with /c/).
 * Reading is public; everything that writes needs a signed-in, non-banned member.
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

add_action( 'rest_api_init', function () {
	$pub  = '__return_true';
	$auth = function () {
		return is_user_logged_in();
	};
	$routes = array(
		array( '/c/feed', 'GET', 'dreamscaper_c_feed', $pub ),
		array( '/c/post', 'GET', 'dreamscaper_c_post_get', $pub ),
		array( '/c/post', 'POST', 'dreamscaper_c_post_create', $auth ),
		array( '/c/post/delete', 'POST', 'dreamscaper_c_post_delete', $auth ),
		array( '/c/post/edit', 'POST', 'dreamscaper_c_post_edit', $auth ),
		array( '/c/like', 'POST', 'dreamscaper_c_like', $auth ),
		array( '/c/rate', 'POST', 'dreamscaper_c_rate', $auth ),
		array( '/c/comments', 'GET', 'dreamscaper_c_comments', $pub ),
		array( '/c/comment', 'POST', 'dreamscaper_c_comment', $auth ),
		array( '/c/comment/delete', 'POST', 'dreamscaper_c_comment_delete', $auth ),
		array( '/c/report', 'POST', 'dreamscaper_c_report', $auth ),
		array( '/c/user', 'GET', 'dreamscaper_c_user', $pub ),
		array( '/c/users', 'GET', 'dreamscaper_c_users', $pub ),
		array( '/c/tags', 'GET', 'dreamscaper_c_tags', $pub ),
		array( '/c/leaderboard', 'GET', 'dreamscaper_c_leaderboard', $pub ),
		array( '/c/follow', 'POST', 'dreamscaper_c_follow', $auth ),
		array( '/c/follows', 'GET', 'dreamscaper_c_follows', $pub ),
		array( '/c/friend', 'POST', 'dreamscaper_c_friend', $auth ),
		array( '/c/friends', 'GET', 'dreamscaper_c_friends', $auth ),
		array( '/c/block', 'POST', 'dreamscaper_c_block', $auth ),
		array( '/c/profile', 'POST', 'dreamscaper_c_profile', $auth ),
		array( '/c/me', 'GET', 'dreamscaper_c_me', $auth ),
		array( '/c/redeem', 'POST', 'dreamscaper_c_redeem', $auth ),
		array( '/c/notes', 'GET', 'dreamscaper_c_notes', $auth ),
		array( '/c/notes/read', 'POST', 'dreamscaper_c_notes_read', $auth ),
		array( '/c/messages', 'GET', 'dreamscaper_c_threads', $auth ),
		array( '/c/thread', 'GET', 'dreamscaper_c_thread', $auth ),
		array( '/c/send', 'POST', 'dreamscaper_c_send', $auth ),
		array( '/c/event', 'POST', 'dreamscaper_c_event', $auth ),
		array( '/c/status', 'GET', 'dreamscaper_c_status', $pub ),
	);
	foreach ( $routes as $r ) {
		register_rest_route( 'dreamscaper/v1', $r[0], array( 'methods' => $r[1], 'callback' => $r[2], 'permission_callback' => $r[3] ) );
	}
} );

/* ---------------------------------------------------------------- helpers */

function dreamscaper_c_err( $msg, $status = 400, $extra = array() ) {
	return new WP_Error( 'dreamscaper', $msg, array_merge( array( 'status' => $status ), $extra ) );
}

/** Can this member write to the community? */
function dreamscaper_c_can() {
	if ( ! dreamscaper_opt( 'community_on' ) ) {
		return dreamscaper_c_err( 'The community isn’t open yet.', 503 );
	}
	$uid = get_current_user_id();
	if ( ! $uid ) {
		return dreamscaper_c_err( 'Please sign in first.', 401 );
	}
	if ( get_user_meta( $uid, 'dscp_banned', true ) ) {
		return dreamscaper_c_err( 'Your account can’t post in the community. Contact us if you think this is a mistake.', 403 );
	}
	return true;
}

/** A small, family-friendly word filter. Returns true when text is OK. */
function dreamscaper_text_ok( $s ) {
	$bad = '/(\bf[\*\#@]{2,}k?(?!\w)|\bs[\*\#@]{2,}t(?!\w))|\b(f+u+c+k+\w*|sh[i1]t+\w*|c+u+n+t+s?|b[i1]tch\w*|a+s+s+h+o+l+e+s?|n[i1]gg\w*|f[a@]gg?\w*|r[e3]tard\w*|wh[o0]re\w*|sl+u+t+s?|d[i1]ck(head)?s?|p[o0]rn\w*|kill yourself|kys)\b/i';
	return ! preg_match( $bad, $s );
}
function dreamscaper_clean( $s, $max ) {
	$s = trim( preg_replace( "/[ \t]+/", ' ', wp_strip_all_tags( (string) $s ) ) );
	$s = preg_replace( "/\n{3,}/", "\n\n", $s );
	return mb_substr( $s, 0, $max );
}

/** Optional AI check that an image is fine for a family community. */
function dreamscaper_image_ok( $img ) {
	if ( ! dreamscaper_opt( 'community_ai_check' ) || ! dreamscaper_opt( 'fal_key' ) ) {
		return true;
	}
	$out = dreamscaper_fal( 'fal-ai/any-llm/vision', array(
		'model'         => dreamscaper_opt( 'vision_model' ),
		'system_prompt' => 'You review photos posted to a family-friendly home landscaping community. Reply with JSON only.',
		'prompt'        => 'Is this image appropriate to post publicly? It must not contain nudity, sexual content, violence, gore, hate symbols or readable personal documents. Ordinary photos of houses, yards and gardens are fine. Return {"ok": true|false, "reason": "short reason"}.',
		'image_urls'    => array( $img['uri'] ),
		'max_tokens'    => 100,
	), 30 );
	if ( is_wp_error( $out ) || empty( $out['output'] ) ) {
		return true; // never block posting because the checker is down; reports still work
	}
	return ! preg_match( '/"ok"\s*:\s*false/i', (string) $out['output'] );
}

/** Save a community image (data URI, JPEG/PNG/WebP). Returns URL or WP_Error. */
function dreamscaper_c_store_image( $uri, $max_bytes ) {
	$img = dreamscaper_data_image( $uri, $max_bytes );
	if ( ! $img ) {
		return dreamscaper_c_err( 'The picture didn’t come through. Please try again.' );
	}
	$u   = wp_upload_dir();
	$sub = 'dreamscaper-community/' . gmdate( 'Y/m' ) . '/';
	$dir = trailingslashit( $u['basedir'] ) . $sub;
	wp_mkdir_p( $dir );
	if ( ! file_exists( trailingslashit( $u['basedir'] ) . 'dreamscaper-community/index.html' ) ) {
		@file_put_contents( trailingslashit( $u['basedir'] ) . 'dreamscaper-community/index.html', '' );
	}
	$ext  = array( 'image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp' )[ $img['mime'] ];
	$name = strtolower( wp_generate_password( 16, false ) ) . '.' . $ext;
	if ( false === file_put_contents( $dir . $name, $img['bin'] ) ) {
		return dreamscaper_c_err( 'Couldn’t save the picture.', 500 );
	}
	return array( 'url' => trailingslashit( $u['baseurl'] ) . $sub . $name, 'img' => $img );
}

function dreamscaper_blocked_ids( $uid ) {
	$b = get_user_meta( $uid, 'dscp_blocked', true );
	return is_array( $b ) ? array_map( 'intval', $b ) : array();
}
function dreamscaper_is_blocked( $by, $who ) {
	return in_array( (int) $who, dreamscaper_blocked_ids( $by ), true );
}

function dreamscaper_c_tags_in( $tags ) {
	$out = array();
	foreach ( array_slice( (array) $tags, 0, 8 ) as $t ) {
		$t = trim( preg_replace( '/[,]+/', ' ', sanitize_text_field( (string) $t ) ) );
		if ( '' !== $t && mb_strlen( $t ) <= 30 && ! in_array( $t, $out, true ) && dreamscaper_text_ok( $t ) ) {
			$out[] = $t;
		}
	}
	return $out;
}

/** Post row → app object. */
function dreamscaper_c_post_out( $p, $full = false ) {
	global $wpdb;
	$uid  = get_current_user_id();
	$meta = json_decode( $p->meta, true );
	$out  = array(
		'id'       => (int) $p->id,
		'kind'     => $p->kind,
		'title'    => $p->title,
		'tags'     => array_values( array_filter( explode( ',', trim( $p->tags, ',' ) ) ) ),
		'thumb'    => $p->thumb ? $p->thumb : $p->image,
		'image'    => $p->image,
		'likes'    => (int) $p->likes,
		'rating'   => $p->rating_n ? round( $p->rating_sum / $p->rating_n, 1 ) : 0,
		'ratings'  => (int) $p->rating_n,
		'comments' => (int) $p->comments,
		'views'    => (int) $p->views,
		'created'  => strtotime( $p->created . ' UTC' ) * 1000,
		'author'   => dreamscaper_member( (int) $p->user_id ),
		'mine'     => $uid && (int) $p->user_id === $uid,
		'status'   => $p->status,
		'season'   => isset( $meta['season'] ) ? $meta['season'] : '',
	);
	if ( $uid ) {
		$out['liked'] = (bool) $wpdb->get_var( $wpdb->prepare( 'SELECT 1 FROM ' . dreamscaper_t( 'likes' ) . " WHERE user_id=%d AND kind='post' AND target=%d", $uid, $p->id ) );
	}
	if ( $full ) {
		$out['body']   = $p->body;
		$out['before'] = $p->before_img;
		$out['meta']   = is_array( $meta ) ? $meta : array();
		if ( $uid ) {
			$out['my_rating'] = (int) $wpdb->get_var( $wpdb->prepare( 'SELECT stars FROM ' . dreamscaper_t( 'ratings' ) . ' WHERE user_id=%d AND post_id=%d', $uid, $p->id ) );
			$out['following'] = (bool) $wpdb->get_var( $wpdb->prepare( 'SELECT 1 FROM ' . dreamscaper_t( 'follows' ) . ' WHERE follower=%d AND followee=%d', $uid, $p->user_id ) );
		}
	}
	return $out;
}

function dreamscaper_c_get_post( $id, $any = false ) {
	global $wpdb;
	$p = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( 'posts' ) . ' WHERE id=%d', $id ) );
	if ( ! $p || 'removed' === $p->status ) {
		return null;
	}
	if ( 'live' !== $p->status && ! $any && (int) $p->user_id !== get_current_user_id() && ! current_user_can( 'manage_options' ) ) {
		return null;
	}
	return $p;
}

/* ------------------------------------------------------------------ feed */

function dreamscaper_c_feed( WP_REST_Request $r ) {
	global $wpdb;
	if ( ! dreamscaper_opt( 'community_on' ) ) {
		return array( 'items' => array(), 'more' => false, 'off' => true );
	}
	$P     = dreamscaper_t( 'posts' );
	$uid   = get_current_user_id();
	$where = array( "p.status='live'" );
	$args  = array();
	$kind  = (string) $r->get_param( 'kind' );
	if ( in_array( $kind, array( 'design', 'help' ), true ) ) {
		$where[] = 'p.kind=%s';
		$args[]  = $kind;
	}
	$tag = sanitize_text_field( (string) $r->get_param( 'tag' ) );
	if ( '' !== $tag ) {
		$where[] = 'p.tags LIKE %s';
		$args[]  = '%,' . $wpdb->esc_like( $tag ) . ',%';
	}
	$q = sanitize_text_field( (string) $r->get_param( 'q' ) );
	if ( '' !== $q ) {
		foreach ( array_slice( preg_split( '/\s+/', $q ), 0, 5 ) as $w ) {
			$like    = '%' . $wpdb->esc_like( $w ) . '%';
			$where[] = '(p.title LIKE %s OR p.body LIKE %s OR p.tags LIKE %s OR p.meta LIKE %s)';
			array_push( $args, $like, $like, $like, $like );
		}
	}
	$user = (int) $r->get_param( 'user' );
	if ( $user ) {
		$where[] = 'p.user_id=%d';
		$args[]  = $user;
	}
	if ( $r->get_param( 'following' ) && $uid ) {
		$where[] = 'p.user_id IN (SELECT followee FROM ' . dreamscaper_t( 'follows' ) . ' WHERE follower=%d)';
		$args[]  = $uid;
	}
	$range = array( 'week' => 7, 'month' => 31, 'year' => 366 )[ (string) $r->get_param( 'range' ) ] ?? 0;
	if ( $range ) {
		$where[] = 'p.created > %s';
		$args[]  = gmdate( 'Y-m-d H:i:s', time() - $range * DAY_IN_SECONDS );
	}
	$min = (float) $r->get_param( 'min_rating' );
	if ( $min > 0 ) {
		$where[] = 'p.rating_n > 0 AND p.rating_sum / p.rating_n >= %f';
		$args[]  = $min;
	}
	if ( $uid && ( $blocked = dreamscaper_blocked_ids( $uid ) ) ) {
		$where[] = 'p.user_id NOT IN (' . implode( ',', array_map( 'intval', $blocked ) ) . ')';
	}
	$sorts = array(
		'trending'  => 'p.created DESC',
		'new'       => 'p.created DESC',
		'top'       => '(p.rating_sum + 9) / (p.rating_n + 3) DESC, p.rating_n DESC',
		'liked'     => 'p.likes DESC, p.created DESC',
		'discussed' => 'p.comments DESC, p.created DESC',
		'viewed'    => 'p.views DESC',
	);
	$sort  = (string) $r->get_param( 'sort' );
	$order = isset( $sorts[ $sort ] ) ? $sorts[ $sort ] : $sorts['trending'];
	$page  = max( 1, (int) $r->get_param( 'page' ) );
	$per   = 18;
	$trend = ! isset( $sorts[ $sort ] ) || 'trending' === $sort;
	// Trending = engagement that decays with age; scored in PHP so it works on any database.
	$sql  = "SELECT p.* FROM $P p WHERE " . implode( ' AND ', $where ) . " ORDER BY $order LIMIT " . ( $trend ? '0, 600' : ( ( $page - 1 ) * $per ) . ', ' . ( $per + 1 ) );
	$rows = $wpdb->get_results( $args ? $wpdb->prepare( $sql, $args ) : $sql );
	if ( $trend ) {
		$now = time();
		foreach ( $rows as $row ) {
			$hours      = max( 0, ( $now - strtotime( $row->created . ' UTC' ) ) / 3600 );
			$row->score = ( $row->likes * 2 + $row->comments * 3 + $row->rating_sum + $row->views * 0.05 + 1 ) / pow( $hours + 2, 1.4 );
		}
		usort( $rows, function ( $a, $b ) {
			return $b->score <=> $a->score;
		} );
		$rows = array_slice( $rows, ( $page - 1 ) * $per, $per + 1 );
	}
	$more = count( $rows ) > $per;
	return array( 'items' => array_map( 'dreamscaper_c_post_out', array_slice( $rows, 0, $per ) ), 'more' => $more, 'page' => $page );
}

function dreamscaper_c_status() {
	return dreamscaper_community_status( get_current_user_id() );
}

/* ------------------------------------------------------------------ posts */

function dreamscaper_c_post_get( WP_REST_Request $r ) {
	global $wpdb;
	$p = dreamscaper_c_get_post( (int) $r->get_param( 'id' ) );
	if ( ! $p ) {
		return dreamscaper_c_err( 'This post isn’t available.', 404 );
	}
	$key = 'dscp_v_' . md5( $p->id . '|' . dreamscaper_ip_key( 'v' ) );
	if ( ! get_transient( $key ) ) {
		set_transient( $key, 1, 6 * HOUR_IN_SECONDS );
		$wpdb->query( $wpdb->prepare( 'UPDATE ' . dreamscaper_t( 'posts' ) . ' SET views=views+1 WHERE id=%d', $p->id ) );
	}
	return dreamscaper_c_post_out( $p, true );
}

function dreamscaper_c_post_create( WP_REST_Request $r ) {
	global $wpdb;
	$ok = dreamscaper_c_can();
	if ( is_wp_error( $ok ) ) {
		return $ok;
	}
	if ( ! dreamscaper_limit( 'cpost', 12, DAY_IN_SECONDS ) ) {
		return dreamscaper_c_err( 'You’ve posted a lot today — try again tomorrow.', 429 );
	}
	$j     = $r->get_json_params();
	$kind  = isset( $j['kind'] ) && 'help' === $j['kind'] ? 'help' : 'design';
	$title = dreamscaper_clean( isset( $j['title'] ) ? $j['title'] : '', 100 );
	$body  = dreamscaper_clean( isset( $j['body'] ) ? $j['body'] : '', 3000 );
	if ( mb_strlen( $title ) < 3 ) {
		return dreamscaper_c_err( 'Give your post a title (at least 3 letters).' );
	}
	if ( ! dreamscaper_text_ok( $title . ' ' . $body ) ) {
		return dreamscaper_c_err( 'Please keep it friendly — some words aren’t allowed in the community.' );
	}
	$main = dreamscaper_c_store_image( isset( $j['image'] ) ? $j['image'] : '', 4 * MB_IN_BYTES );
	if ( is_wp_error( $main ) ) {
		return $main;
	}
	if ( ! dreamscaper_image_ok( $main['img'] ) ) {
		return dreamscaper_c_err( 'That picture can’t be posted in the community. Please choose a photo of your yard or design.' );
	}
	$thumb  = ! empty( $j['thumb'] ) ? dreamscaper_c_store_image( $j['thumb'], 400 * 1024 ) : null;
	$before = ! empty( $j['before'] ) ? dreamscaper_c_store_image( $j['before'], 4 * MB_IN_BYTES ) : null;
	$meta   = array(
		'assets' => array(),
		'ground' => array(),
		'season' => sanitize_key( isset( $j['season'] ) ? $j['season'] : '' ),
		'years'  => isset( $j['years'] ) ? max( 0, min( 60, (float) $j['years'] ) ) : 0,
		'ai'     => ! empty( $j['ai'] ),
		'w'      => isset( $j['w'] ) ? (int) $j['w'] : 0,
		'h'      => isset( $j['h'] ) ? (int) $j['h'] : 0,
	);
	foreach ( array_slice( (array) ( isset( $j['assets'] ) ? $j['assets'] : array() ), 0, 80 ) as $a ) {
		if ( ! is_array( $a ) || empty( $a['name'] ) ) {
			continue;
		}
		$meta['assets'][] = array(
			'id'    => sanitize_key( isset( $a['id'] ) ? $a['id'] : '' ),
			'name'  => sanitize_text_field( $a['name'] ),
			'sci'   => sanitize_text_field( isset( $a['sci'] ) ? $a['sci'] : '' ),
			'cat'   => sanitize_key( isset( $a['cat'] ) ? $a['cat'] : '' ),
			'count' => max( 1, (int) ( isset( $a['count'] ) ? $a['count'] : 1 ) ),
			'age'   => isset( $a['age'] ) ? round( (float) $a['age'], 1 ) : null,
			'h'     => isset( $a['h'] ) ? round( (float) $a['h'], 1 ) : null,
			'w'     => isset( $a['w'] ) ? round( (float) $a['w'], 1 ) : null,
			'mine'  => ! empty( $a['mine'] ),
		);
	}
	foreach ( array_slice( (array) ( isset( $j['ground'] ) ? $j['ground'] : array() ), 0, 30 ) as $g ) {
		$meta['ground'][] = sanitize_text_field( (string) $g );
	}
	$tags = dreamscaper_c_tags_in( isset( $j['tags'] ) ? $j['tags'] : array() );
	$wpdb->insert( dreamscaper_t( 'posts' ), array(
		'user_id'    => get_current_user_id(),
		'kind'       => $kind,
		'title'      => $title,
		'body'       => $body,
		'tags'       => $tags ? ',' . implode( ',', $tags ) . ',' : '',
		'image'      => $main['url'],
		'thumb'      => $thumb && ! is_wp_error( $thumb ) ? $thumb['url'] : '',
		'before_img' => $before && ! is_wp_error( $before ) ? $before['url'] : '',
		'meta'       => wp_json_encode( $meta ),
		'status'     => 'live',
		'created'    => dreamscaper_now(),
	) );
	$id = (int) $wpdb->insert_id;
	if ( ! $id ) {
		return dreamscaper_c_err( 'Couldn’t post right now.', 500 );
	}
	$uid = get_current_user_id();
	if ( 'design' === $kind ) {
		dreamscaper_award( $uid, 'post', 'p' . $id );
	}
	// let followers know
	$me  = dreamscaper_member( $uid );
	$fol = $wpdb->get_col( $wpdb->prepare( 'SELECT follower FROM ' . dreamscaper_t( 'follows' ) . ' WHERE followee=%d LIMIT 500', $uid ) );
	foreach ( $fol as $f ) {
		dreamscaper_note( (int) $f, 'post', $uid, $id, $me['name'] . ( 'help' === $kind ? ' asked for ideas: “' : ' shared a new design: “' ) . $title . '”' );
	}
	if ( dreamscaper_opt( 'community_notify_admin' ) && dreamscaper_opt( 'notify_email' ) ) {
		wp_mail( dreamscaper_opt( 'notify_email' ), 'New DreamScaper community post: ' . $title, $me['name'] . ' posted “' . $title . '” (' . $kind . ").\n\n" . $main['url'] );
	}
	return dreamscaper_c_post_out( dreamscaper_c_get_post( $id ), true );
}

function dreamscaper_c_post_edit( WP_REST_Request $r ) {
	global $wpdb;
	$j = $r->get_json_params();
	$p = dreamscaper_c_get_post( (int) ( isset( $j['id'] ) ? $j['id'] : 0 ) );
	if ( ! $p || (int) $p->user_id !== get_current_user_id() ) {
		return dreamscaper_c_err( 'You can only edit your own posts.', 403 );
	}
	$title = dreamscaper_clean( isset( $j['title'] ) ? $j['title'] : $p->title, 100 );
	$body  = dreamscaper_clean( isset( $j['body'] ) ? $j['body'] : $p->body, 3000 );
	if ( ! dreamscaper_text_ok( $title . ' ' . $body ) ) {
		return dreamscaper_c_err( 'Please keep it friendly — some words aren’t allowed in the community.' );
	}
	$tags = isset( $j['tags'] ) ? dreamscaper_c_tags_in( $j['tags'] ) : null;
	$wpdb->update( dreamscaper_t( 'posts' ), array_filter( array( 'title' => $title, 'body' => $body, 'tags' => null === $tags ? null : ( $tags ? ',' . implode( ',', $tags ) . ',' : '' ) ), function ( $v ) {
		return null !== $v;
	} ), array( 'id' => $p->id ) );
	return dreamscaper_c_post_out( dreamscaper_c_get_post( $p->id ), true );
}

function dreamscaper_c_post_delete( WP_REST_Request $r ) {
	global $wpdb;
	$j = $r->get_json_params();
	$p = dreamscaper_c_get_post( (int) ( isset( $j['id'] ) ? $j['id'] : 0 ), true );
	if ( ! $p || ( (int) $p->user_id !== get_current_user_id() && ! current_user_can( 'manage_options' ) ) ) {
		return dreamscaper_c_err( 'You can only delete your own posts.', 403 );
	}
	$wpdb->update( dreamscaper_t( 'posts' ), array( 'status' => 'removed' ), array( 'id' => $p->id ) );
	return array( 'ok' => true );
}

/* ---------------------------------------------------------- likes & ratings */

function dreamscaper_c_like( WP_REST_Request $r ) {
	global $wpdb;
	$ok = dreamscaper_c_can();
	if ( is_wp_error( $ok ) ) {
		return $ok;
	}
	$j    = $r->get_json_params();
	$kind = isset( $j['kind'] ) && 'comment' === $j['kind'] ? 'comment' : 'post';
	$id   = (int) ( isset( $j['id'] ) ? $j['id'] : 0 );
	$uid  = get_current_user_id();
	$T    = 'comment' === $kind ? dreamscaper_t( 'comments' ) : dreamscaper_t( 'posts' );
	$row  = $wpdb->get_row( $wpdb->prepare( "SELECT id,user_id FROM $T WHERE id=%d AND status='live'", $id ) );
	if ( ! $row ) {
		return dreamscaper_c_err( 'Not found.', 404 );
	}
	$L   = dreamscaper_t( 'likes' );
	$has = $wpdb->get_var( $wpdb->prepare( "SELECT 1 FROM $L WHERE user_id=%d AND kind=%s AND target=%d", $uid, $kind, $id ) );
	if ( $has ) {
		$wpdb->delete( $L, array( 'user_id' => $uid, 'kind' => $kind, 'target' => $id ) );
		$wpdb->query( $wpdb->prepare( "UPDATE $T SET likes=GREATEST(likes-1,0) WHERE id=%d", $id ) );
	} else {
		$wpdb->insert( $L, array( 'user_id' => $uid, 'kind' => $kind, 'target' => $id, 'created' => dreamscaper_now() ) );
		$wpdb->query( $wpdb->prepare( "UPDATE $T SET likes=likes+1 WHERE id=%d", $id ) );
		if ( (int) $row->user_id !== $uid ) {
			dreamscaper_award( (int) $row->user_id, 'like_got', $kind[0] . $id . 'u' . $uid );
			if ( 'post' === $kind ) {
				$me = dreamscaper_member( $uid );
				dreamscaper_note( (int) $row->user_id, 'like', $uid, $id, $me['name'] . ' liked your design 👍' );
			}
			dreamscaper_check_badges( (int) $row->user_id );
		}
	}
	return array( 'liked' => ! $has, 'likes' => (int) $wpdb->get_var( $wpdb->prepare( "SELECT likes FROM $T WHERE id=%d", $id ) ) );
}

function dreamscaper_c_rate( WP_REST_Request $r ) {
	global $wpdb;
	$ok = dreamscaper_c_can();
	if ( is_wp_error( $ok ) ) {
		return $ok;
	}
	$j     = $r->get_json_params();
	$id    = (int) ( isset( $j['id'] ) ? $j['id'] : 0 );
	$stars = max( 1, min( 5, (int) ( isset( $j['stars'] ) ? $j['stars'] : 0 ) ) );
	$p     = dreamscaper_c_get_post( $id );
	$uid   = get_current_user_id();
	if ( ! $p || 'design' !== $p->kind ) {
		return dreamscaper_c_err( 'Not found.', 404 );
	}
	if ( (int) $p->user_id === $uid ) {
		return dreamscaper_c_err( 'You can’t rate your own design.' );
	}
	$R   = dreamscaper_t( 'ratings' );
	$old = (int) $wpdb->get_var( $wpdb->prepare( "SELECT stars FROM $R WHERE user_id=%d AND post_id=%d", $uid, $id ) );
	$wpdb->replace( $R, array( 'user_id' => $uid, 'post_id' => $id, 'stars' => $stars ) );
	$wpdb->query( $wpdb->prepare( 'UPDATE ' . dreamscaper_t( 'posts' ) . ' SET rating_sum=rating_sum+%d, rating_n=rating_n+%d WHERE id=%d', $stars - $old, $old ? 0 : 1, $id ) );
	if ( ! $old && $stars >= 4 ) {
		dreamscaper_award( (int) $p->user_id, 'rating_got', 'r' . $id . 'u' . $uid );
	}
	if ( ! $old ) {
		$me = dreamscaper_member( $uid );
		dreamscaper_note( (int) $p->user_id, 'rate', $uid, $id, $me['name'] . ' rated your design ' . str_repeat( '⭐', $stars ) );
	}
	dreamscaper_check_badges( $uid );
	dreamscaper_check_badges( (int) $p->user_id );
	$p = dreamscaper_c_get_post( $id );
	return array( 'rating' => $p->rating_n ? round( $p->rating_sum / $p->rating_n, 1 ) : 0, 'ratings' => (int) $p->rating_n, 'mine' => $stars );
}

/* --------------------------------------------------------------- comments */

function dreamscaper_c_comments( WP_REST_Request $r ) {
	global $wpdb;
	$id   = (int) $r->get_param( 'id' );
	$uid  = get_current_user_id();
	$rows = $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( 'comments' ) . " WHERE post_id=%d AND status='live' ORDER BY created ASC LIMIT 400", $id ) );
	$bl   = $uid ? dreamscaper_blocked_ids( $uid ) : array();
	$out  = array();
	foreach ( $rows as $c ) {
		if ( in_array( (int) $c->user_id, $bl, true ) ) {
			continue;
		}
		$out[] = array(
			'id'      => (int) $c->id,
			'parent'  => (int) $c->parent_id,
			'body'    => $c->body,
			'image'   => $c->image,
			'likes'   => (int) $c->likes,
			'liked'   => $uid ? (bool) $wpdb->get_var( $wpdb->prepare( 'SELECT 1 FROM ' . dreamscaper_t( 'likes' ) . " WHERE user_id=%d AND kind='comment' AND target=%d", $uid, $c->id ) ) : false,
			'created' => strtotime( $c->created . ' UTC' ) * 1000,
			'author'  => dreamscaper_member( (int) $c->user_id ),
			'mine'    => $uid && (int) $c->user_id === $uid,
		);
	}
	return array( 'items' => $out );
}

function dreamscaper_c_comment( WP_REST_Request $r ) {
	global $wpdb;
	$ok = dreamscaper_c_can();
	if ( is_wp_error( $ok ) ) {
		return $ok;
	}
	if ( ! dreamscaper_limit( 'ccom', 60, HOUR_IN_SECONDS ) ) {
		return dreamscaper_c_err( 'Slow down a little — try again in a few minutes.', 429 );
	}
	$j    = $r->get_json_params();
	$p    = dreamscaper_c_get_post( (int) ( isset( $j['post'] ) ? $j['post'] : 0 ) );
	$uid  = get_current_user_id();
	$body = dreamscaper_clean( isset( $j['body'] ) ? $j['body'] : '', 2000 );
	if ( ! $p ) {
		return dreamscaper_c_err( 'This post isn’t available.', 404 );
	}
	if ( dreamscaper_is_blocked( (int) $p->user_id, $uid ) ) {
		return dreamscaper_c_err( 'You can’t comment on this post.', 403 );
	}
	if ( mb_strlen( $body ) < 1 && empty( $j['image'] ) ) {
		return dreamscaper_c_err( 'Write something first.' );
	}
	if ( ! dreamscaper_text_ok( $body ) ) {
		return dreamscaper_c_err( 'Please keep it friendly — some words aren’t allowed in the community.' );
	}
	$image = '';
	if ( ! empty( $j['image'] ) ) {
		$st = dreamscaper_c_store_image( $j['image'], 3 * MB_IN_BYTES );
		if ( is_wp_error( $st ) ) {
			return $st;
		}
		if ( ! dreamscaper_image_ok( $st['img'] ) ) {
			return dreamscaper_c_err( 'That picture can’t be posted in the community.' );
		}
		$image = $st['url'];
	}
	$parent = (int) ( isset( $j['parent'] ) ? $j['parent'] : 0 );
	$pc     = $parent ? $wpdb->get_row( $wpdb->prepare( 'SELECT id,user_id,parent_id FROM ' . dreamscaper_t( 'comments' ) . ' WHERE id=%d AND post_id=%d', $parent, $p->id ) ) : null;
	if ( $pc && $pc->parent_id ) {
		$parent = (int) $pc->parent_id; // one level of replies keeps threads readable on a phone
	}
	$wpdb->insert( dreamscaper_t( 'comments' ), array( 'post_id' => $p->id, 'user_id' => $uid, 'parent_id' => $pc ? $parent : 0, 'body' => $body, 'image' => $image, 'status' => 'live', 'created' => dreamscaper_now() ) );
	$cid = (int) $wpdb->insert_id;
	$wpdb->query( $wpdb->prepare( 'UPDATE ' . dreamscaper_t( 'posts' ) . ' SET comments=comments+1 WHERE id=%d', $p->id ) );
	$me = dreamscaper_member( $uid );
	dreamscaper_award( $uid, 'comment', 'c' . $cid );
	if ( 'help' === $p->kind && (int) $p->user_id !== $uid ) {
		$first = ! $wpdb->get_var( $wpdb->prepare( 'SELECT id FROM ' . dreamscaper_t( 'comments' ) . ' WHERE post_id=%d AND user_id=%d AND id<>%d LIMIT 1', $p->id, $uid, $cid ) );
		if ( $first ) {
			dreamscaper_award( $uid, 'help', 'h' . $p->id );
		}
	}
	dreamscaper_note( (int) $p->user_id, 'comment', $uid, $p->id, $me['name'] . ( $image ? ' replied with a design on “' : ' commented on “' ) . $p->title . '”' );
	if ( $pc && (int) $pc->user_id !== (int) $p->user_id ) {
		dreamscaper_note( (int) $pc->user_id, 'reply', $uid, $p->id, $me['name'] . ' replied to your comment on “' . $p->title . '”' );
	}
	return array( 'ok' => true, 'id' => $cid );
}

function dreamscaper_c_comment_delete( WP_REST_Request $r ) {
	global $wpdb;
	$j = $r->get_json_params();
	$c = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( 'comments' ) . ' WHERE id=%d', (int) ( isset( $j['id'] ) ? $j['id'] : 0 ) ) );
	if ( ! $c || ( (int) $c->user_id !== get_current_user_id() && ! current_user_can( 'manage_options' ) ) ) {
		return dreamscaper_c_err( 'You can only delete your own comments.', 403 );
	}
	$wpdb->update( dreamscaper_t( 'comments' ), array( 'status' => 'removed' ), array( 'id' => $c->id ) );
	$wpdb->query( $wpdb->prepare( 'UPDATE ' . dreamscaper_t( 'posts' ) . ' SET comments=GREATEST(comments-1,0) WHERE id=%d', $c->post_id ) );
	return array( 'ok' => true );
}

/* -------------------------------------------------------------- reporting */

function dreamscaper_c_report( WP_REST_Request $r ) {
	global $wpdb;
	$j      = $r->get_json_params();
	$kind   = in_array( isset( $j['kind'] ) ? $j['kind'] : '', array( 'post', 'comment', 'user' ), true ) ? $j['kind'] : 'post';
	$id     = (int) ( isset( $j['id'] ) ? $j['id'] : 0 );
	$reason = dreamscaper_clean( isset( $j['reason'] ) ? $j['reason'] : '', 250 );
	$ins    = $wpdb->insert( dreamscaper_t( 'reports' ), array( 'user_id' => get_current_user_id(), 'kind' => $kind, 'target' => $id, 'reason' => $reason, 'created' => dreamscaper_now() ) );
	if ( $ins && in_array( $kind, array( 'post', 'comment' ), true ) ) {
		$T = 'post' === $kind ? dreamscaper_t( 'posts' ) : dreamscaper_t( 'comments' );
		$wpdb->query( $wpdb->prepare( "UPDATE $T SET reports=reports+1 WHERE id=%d", $id ) );
		$wpdb->query( $wpdb->prepare( "UPDATE $T SET status='hidden' WHERE id=%d AND reports>=%d AND status='live'", $id, max( 1, (int) dreamscaper_opt( 'community_hide_at' ) ) ) );
	}
	if ( dreamscaper_opt( 'notify_email' ) ) {
		wp_mail( dreamscaper_opt( 'notify_email' ), 'DreamScaper community report', "A member reported a $kind (#$id).\nReason: $reason\n\nReview it in WordPress → Settings → DreamScaper Community." );
	}
	return array( 'ok' => true );
}

/* ---------------------------------------------------------------- members */

function dreamscaper_c_user( WP_REST_Request $r ) {
	global $wpdb;
	$id = (int) $r->get_param( 'id' );
	if ( ! $id || ! get_userdata( $id ) ) {
		return dreamscaper_c_err( 'Member not found.', 404 );
	}
	$out = dreamscaper_member( $id, true );
	$uid = get_current_user_id();
	if ( $uid && $uid !== $id ) {
		$out['following'] = (bool) $wpdb->get_var( $wpdb->prepare( 'SELECT 1 FROM ' . dreamscaper_t( 'follows' ) . ' WHERE follower=%d AND followee=%d', $uid, $id ) );
		$f                = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( 'friends' ) . ' WHERE (a=%d AND b=%d) OR (a=%d AND b=%d)', $uid, $id, $id, $uid ) );
		$out['friend']    = $f ? ( 'accepted' === $f->status ? 'friends' : ( (int) $f->a === $uid ? 'sent' : 'received' ) ) : 'none';
		$out['blocked']   = dreamscaper_is_blocked( $uid, $id );
	}
	$out['me'] = $uid === $id;
	return $out;
}

function dreamscaper_c_users( WP_REST_Request $r ) {
	global $wpdb;
	$q = sanitize_text_field( (string) $r->get_param( 'q' ) );
	if ( mb_strlen( $q ) < 2 ) {
		return array( 'items' => array() );
	}
	$like = '%' . $wpdb->esc_like( $q ) . '%';
	$ids  = $wpdb->get_col( $wpdb->prepare(
		"SELECT DISTINCT u.ID FROM {$wpdb->users} u LEFT JOIN {$wpdb->usermeta} m ON m.user_id=u.ID AND m.meta_key='dscp_handle'
		 WHERE (u.display_name LIKE %s OR m.meta_value LIKE %s) AND EXISTS (SELECT 1 FROM {$wpdb->usermeta} x WHERE x.user_id=u.ID AND x.meta_key='dscp_pts_total') LIMIT 20",
		$like, $like
	) );
	return array( 'items' => array_map( function ( $id ) {
		return dreamscaper_member( (int) $id );
	}, $ids ) );
}

function dreamscaper_c_tags() {
	global $wpdb;
	$cache = get_transient( 'dscp_ctags' );
	if ( $cache ) {
		return $cache;
	}
	$count = array();
	foreach ( $wpdb->get_col( 'SELECT tags FROM ' . dreamscaper_t( 'posts' ) . " WHERE status='live' ORDER BY id DESC LIMIT 2000" ) as $t ) {
		foreach ( array_filter( explode( ',', $t ) ) as $x ) {
			$count[ $x ] = ( isset( $count[ $x ] ) ? $count[ $x ] : 0 ) + 1;
		}
	}
	arsort( $count );
	$out = array( 'tags' => array_slice( array_keys( $count ), 0, 24 ) );
	set_transient( 'dscp_ctags', $out, 10 * MINUTE_IN_SECONDS );
	return $out;
}

function dreamscaper_c_leaderboard( WP_REST_Request $r ) {
	global $wpdb;
	$range = 'all' === $r->get_param( 'range' ) ? 'all' : 'month';
	if ( 'all' === $range ) {
		$rows = $wpdb->get_results( "SELECT user_id AS uid, CAST(meta_value AS UNSIGNED) AS pts FROM {$wpdb->usermeta} WHERE meta_key='dscp_pts_total' ORDER BY pts DESC LIMIT 25" );
	} else {
		$start = gmdate( 'Y-m-01 00:00:00' );
		$rows  = $wpdb->get_results( $wpdb->prepare( 'SELECT user_id AS uid, SUM(points) AS pts FROM ' . dreamscaper_t( 'points' ) . " WHERE points>0 AND action<>'redeem' AND created >= %s GROUP BY user_id ORDER BY pts DESC LIMIT 25", $start ) );
		// last month's top 10 earn the Top Designer badge (done once per month)
		$last = gmdate( 'Y-m', strtotime( 'first day of last month' ) );
		if ( get_option( 'dscp_top10_done' ) !== $last ) {
			update_option( 'dscp_top10_done', $last, false );
			$prev = $wpdb->get_col( $wpdb->prepare( 'SELECT user_id FROM ' . dreamscaper_t( 'points' ) . " WHERE points>0 AND action<>'redeem' AND created >= %s AND created < %s GROUP BY user_id ORDER BY SUM(points) DESC LIMIT 10", $last . '-01 00:00:00', $start ) );
			foreach ( $prev as $u ) {
				dreamscaper_give_badge( (int) $u, 'top10' );
			}
		}
	}
	$out = array();
	foreach ( $rows as $i => $row ) {
		if ( (int) $row->pts <= 0 || get_user_meta( (int) $row->uid, 'dscp_banned', true ) ) {
			continue;
		}
		$out[] = array( 'rank' => count( $out ) + 1, 'points' => (int) $row->pts, 'member' => dreamscaper_member( (int) $row->uid ) );
	}
	return array( 'range' => $range, 'items' => $out );
}

/* -------------------------------------------------------- follows & friends */

function dreamscaper_c_follow( WP_REST_Request $r ) {
	global $wpdb;
	$ok = dreamscaper_c_can();
	if ( is_wp_error( $ok ) ) {
		return $ok;
	}
	$j   = $r->get_json_params();
	$id  = (int) ( isset( $j['id'] ) ? $j['id'] : 0 );
	$uid = get_current_user_id();
	if ( ! $id || $id === $uid || ! get_userdata( $id ) ) {
		return dreamscaper_c_err( 'Can’t follow that member.' );
	}
	$F   = dreamscaper_t( 'follows' );
	$has = $wpdb->get_var( $wpdb->prepare( "SELECT 1 FROM $F WHERE follower=%d AND followee=%d", $uid, $id ) );
	if ( $has ) {
		$wpdb->delete( $F, array( 'follower' => $uid, 'followee' => $id ) );
	} else {
		if ( dreamscaper_is_blocked( $id, $uid ) ) {
			return dreamscaper_c_err( 'You can’t follow this member.', 403 );
		}
		$wpdb->insert( $F, array( 'follower' => $uid, 'followee' => $id, 'created' => dreamscaper_now() ) );
		$me = dreamscaper_member( $uid );
		dreamscaper_note( $id, 'follow', $uid, $uid, $me['name'] . ' started following you' );
		dreamscaper_award( $id, 'follow_got', 'f' . $uid );
		dreamscaper_check_badges( $uid );
	}
	return array( 'following' => ! $has, 'followers' => (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM $F WHERE followee=%d", $id ) ) );
}

function dreamscaper_c_follows( WP_REST_Request $r ) {
	global $wpdb;
	$id  = (int) $r->get_param( 'id' );
	$dir = 'following' === $r->get_param( 'dir' ) ? 'following' : 'followers';
	$F   = dreamscaper_t( 'follows' );
	$ids = 'following' === $dir
		? $wpdb->get_col( $wpdb->prepare( "SELECT followee FROM $F WHERE follower=%d ORDER BY created DESC LIMIT 200", $id ) )
		: $wpdb->get_col( $wpdb->prepare( "SELECT follower FROM $F WHERE followee=%d ORDER BY created DESC LIMIT 200", $id ) );
	return array( 'items' => array_map( function ( $x ) {
		return dreamscaper_member( (int) $x );
	}, $ids ) );
}

function dreamscaper_c_friend( WP_REST_Request $r ) {
	global $wpdb;
	$ok = dreamscaper_c_can();
	if ( is_wp_error( $ok ) ) {
		return $ok;
	}
	$j      = $r->get_json_params();
	$id     = (int) ( isset( $j['id'] ) ? $j['id'] : 0 );
	$action = isset( $j['action'] ) ? (string) $j['action'] : 'request';
	$uid    = get_current_user_id();
	$Fr     = dreamscaper_t( 'friends' );
	if ( ! $id || $id === $uid || ! get_userdata( $id ) ) {
		return dreamscaper_c_err( 'Member not found.', 404 );
	}
	$row = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $Fr WHERE (a=%d AND b=%d) OR (a=%d AND b=%d)", $uid, $id, $id, $uid ) );
	$me  = dreamscaper_member( $uid );
	if ( 'request' === $action ) {
		if ( dreamscaper_is_blocked( $id, $uid ) ) {
			return dreamscaper_c_err( 'You can’t add this member.', 403 );
		}
		if ( ! $row ) {
			$wpdb->insert( $Fr, array( 'a' => $uid, 'b' => $id, 'status' => 'pending', 'created' => dreamscaper_now() ) );
			dreamscaper_note( $id, 'friend', $uid, $uid, $me['name'] . ' sent you a friend request' );
		} elseif ( 'pending' === $row->status && (int) $row->b === $uid ) {
			$action = 'accept';
		}
	}
	if ( 'accept' === $action && $row && 'pending' === $row->status && (int) $row->b === $uid ) {
		$wpdb->update( $Fr, array( 'status' => 'accepted' ), array( 'a' => $row->a, 'b' => $row->b ) );
		dreamscaper_note( (int) $row->a, 'friend_ok', $uid, $uid, $me['name'] . ' accepted your friend request 🎉' );
	}
	if ( in_array( $action, array( 'decline', 'remove', 'cancel' ), true ) && $row ) {
		$wpdb->delete( $Fr, array( 'a' => $row->a, 'b' => $row->b ) );
	}
	$row = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $Fr WHERE (a=%d AND b=%d) OR (a=%d AND b=%d)", $uid, $id, $id, $uid ) );
	return array( 'friend' => $row ? ( 'accepted' === $row->status ? 'friends' : ( (int) $row->a === $uid ? 'sent' : 'received' ) ) : 'none' );
}

function dreamscaper_c_friends() {
	global $wpdb;
	$uid  = get_current_user_id();
	$rows = $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( 'friends' ) . ' WHERE a=%d OR b=%d ORDER BY created DESC LIMIT 500', $uid, $uid ) );
	$out  = array( 'friends' => array(), 'received' => array(), 'sent' => array() );
	foreach ( $rows as $f ) {
		$other = (int) $f->a === $uid ? (int) $f->b : (int) $f->a;
		$key   = 'accepted' === $f->status ? 'friends' : ( (int) $f->a === $uid ? 'sent' : 'received' );
		$out[ $key ][] = dreamscaper_member( $other );
	}
	return $out;
}

function dreamscaper_c_block( WP_REST_Request $r ) {
	global $wpdb;
	$j   = $r->get_json_params();
	$id  = (int) ( isset( $j['id'] ) ? $j['id'] : 0 );
	$uid = get_current_user_id();
	$b   = dreamscaper_blocked_ids( $uid );
	if ( in_array( $id, $b, true ) ) {
		$b = array_values( array_diff( $b, array( $id ) ) );
	} elseif ( $id && $id !== $uid ) {
		$b[] = $id;
		// blocking also unfollows and unfriends both ways
		$wpdb->query( $wpdb->prepare( 'DELETE FROM ' . dreamscaper_t( 'follows' ) . ' WHERE (follower=%d AND followee=%d) OR (follower=%d AND followee=%d)', $uid, $id, $id, $uid ) );
		$wpdb->query( $wpdb->prepare( 'DELETE FROM ' . dreamscaper_t( 'friends' ) . ' WHERE (a=%d AND b=%d) OR (a=%d AND b=%d)', $uid, $id, $id, $uid ) );
	}
	update_user_meta( $uid, 'dscp_blocked', $b );
	return array( 'blocked' => in_array( $id, $b, true ), 'list' => array_map( 'dreamscaper_member', $b ) );
}

/* ------------------------------------------------------- my profile & points */

function dreamscaper_c_profile( WP_REST_Request $r ) {
	$ok = dreamscaper_c_can();
	if ( is_wp_error( $ok ) ) {
		return $ok;
	}
	$uid = get_current_user_id();
	$j   = $r->get_json_params();
	if ( isset( $j['handle'] ) ) {
		$h = dreamscaper_clean( $j['handle'], 30 );
		if ( mb_strlen( $h ) < 2 || ! dreamscaper_text_ok( $h ) ) {
			return dreamscaper_c_err( 'Please choose a friendly display name (2–30 letters).' );
		}
		update_user_meta( $uid, 'dscp_handle', $h );
	}
	if ( isset( $j['bio'] ) ) {
		$b = dreamscaper_clean( $j['bio'], 300 );
		if ( ! dreamscaper_text_ok( $b ) ) {
			return dreamscaper_c_err( 'Please keep your bio friendly.' );
		}
		update_user_meta( $uid, 'dscp_bio', $b );
	}
	if ( ! empty( $j['avatar'] ) ) {
		$st = dreamscaper_c_store_image( $j['avatar'], 400 * 1024 );
		if ( is_wp_error( $st ) ) {
			return $st;
		}
		if ( ! dreamscaper_image_ok( $st['img'] ) ) {
			return dreamscaper_c_err( 'That picture can’t be used as a profile photo.' );
		}
		update_user_meta( $uid, 'dscp_avatar', $st['url'] );
	} elseif ( isset( $j['avatar'] ) && '' === $j['avatar'] && ! empty( $j['remove_avatar'] ) ) {
		delete_user_meta( $uid, 'dscp_avatar' );
	}
	if ( isset( $j['title'] ) ) {
		$titles = dreamscaper_titles_for( $uid );
		update_user_meta( $uid, 'dscp_title', isset( $titles[ $j['title'] ] ) ? $j['title'] : '' );
	}
	if ( isset( $j['style'] ) ) {
		$styles = dreamscaper_styles_for( $uid );
		update_user_meta( $uid, 'dscp_style', isset( $styles[ $j['style'] ] ) && $styles[ $j['style'] ][1] ? $j['style'] : 'plain' );
	}
	if ( isset( $j['notify'] ) && is_array( $j['notify'] ) ) {
		$p = dreamscaper_notify_prefs( $uid );
		foreach ( $p as $k => $v ) {
			if ( isset( $j['notify'][ $k ] ) ) {
				$p[ $k ] = $j['notify'][ $k ] ? 1 : 0;
			}
		}
		update_user_meta( $uid, 'dscp_notify', $p );
	}
	if ( get_user_meta( $uid, 'dscp_avatar', true ) && get_user_meta( $uid, 'dscp_bio', true ) ) {
		dreamscaper_award( $uid, 'profile' );
	}
	return dreamscaper_c_me();
}

function dreamscaper_c_me() {
	global $wpdb;
	$uid    = get_current_user_id();
	$styles = array();
	foreach ( dreamscaper_styles_for( $uid ) as $id => $s ) {
		$styles[] = array( 'id' => $id, 'name' => $s[0], 'unlocked' => $s[1] );
	}
	$titles = array();
	foreach ( dreamscaper_titles_for( $uid ) as $id => $t ) {
		$titles[] = array( 'id' => $id, 'name' => $t );
	}
	$labels = dreamscaper_point_labels();
	$log    = array();
	foreach ( $wpdb->get_results( $wpdb->prepare( 'SELECT action,points,created FROM ' . dreamscaper_t( 'points' ) . ' WHERE user_id=%d ORDER BY id DESC LIMIT 30', $uid ) ) as $row ) {
		$log[] = array( 'why' => isset( $labels[ $row->action ] ) ? $labels[ $row->action ] : $row->action, 'points' => (int) $row->points, 'at' => strtotime( $row->created . ' UTC' ) * 1000 );
	}
	$all   = array();
	$mine  = dreamscaper_user_badges( $uid );
	foreach ( dreamscaper_badges() as $id => $b ) {
		$all[] = array( 'id' => $id, 'name' => $b[0], 'emoji' => $b[1], 'how' => $b[2], 'have' => isset( $mine[ $id ] ) );
	}
	$ways = array();
	foreach ( dreamscaper_point_rules() as $action => $rule ) {
		$pts = (int) dreamscaper_opt( $rule[0] );
		if ( $pts > 0 ) {
			$ways[] = array( 'why' => $labels[ $action ], 'points' => $pts, 'once' => $rule[2], 'cap' => $rule[1] );
		}
	}
	return array_merge( dreamscaper_community_status( $uid ), array(
		'profile'   => dreamscaper_member( $uid, true ),
		'handle'    => (string) get_user_meta( $uid, 'dscp_handle', true ),
		'title_id'  => (string) get_user_meta( $uid, 'dscp_title', true ),
		'styles'    => $styles,
		'titles'    => $titles,
		'all_badges'=> $all,
		'levels'    => array_map( function ( $l ) {
			return array( 'at' => $l[0], 'name' => $l[1], 'emoji' => $l[2] );
		}, dreamscaper_levels() ),
		'log'       => $log,
		'ways'      => $ways,
		'notify'    => dreamscaper_notify_prefs( $uid ),
		'blocked'   => array_map( 'dreamscaper_member', dreamscaper_blocked_ids( $uid ) ),
		'streak'    => (int) get_user_meta( $uid, 'dscp_streak', true ),
	) );
}

/** Trade points for AI credits or storage. */
function dreamscaper_c_redeem( WP_REST_Request $r ) {
	global $wpdb;
	$ok = dreamscaper_c_can();
	if ( is_wp_error( $ok ) ) {
		return $ok;
	}
	$uid  = get_current_user_id();
	$j    = $r->get_json_params();
	$what = isset( $j['what'] ) && 'storage' === $j['what'] ? 'storage' : 'credit';
	$qty  = max( 1, min( 50, (int) ( isset( $j['qty'] ) ? $j['qty'] : 1 ) ) );
	$unit = 'storage' === $what ? (int) dreamscaper_opt( 'redeem_storage_pts' ) : (int) dreamscaper_opt( 'redeem_credit_pts' );
	if ( $unit <= 0 ) {
		return dreamscaper_c_err( 'This reward isn’t available.' );
	}
	$cost = $unit * $qty;
	$have = (int) get_user_meta( $uid, 'dscp_pts', true );
	if ( $have < $cost ) {
		return dreamscaper_c_err( 'You need ' . number_format( $cost ) . ' points for that — you have ' . number_format( $have ) . '.' );
	}
	update_user_meta( $uid, 'dscp_pts', $have - $cost );
	$wpdb->insert( dreamscaper_t( 'points' ), array( 'user_id' => $uid, 'action' => 'redeem', 'points' => -$cost, 'ref' => $what . 'x' . $qty, 'created' => dreamscaper_now() ) );
	if ( 'storage' === $what ) {
		$mb = (int) dreamscaper_opt( 'redeem_storage_mb' ) * $qty;
		update_user_meta( $uid, 'dscp_storage_mb', (int) get_user_meta( $uid, 'dscp_storage_mb', true ) + $mb );
		$msg = '+' . $mb . ' MB of storage added to your account.';
	} else {
		update_user_meta( $uid, 'dscp_ai_bought', dreamscaper_ai_bought( $uid ) + $qty );
		$msg = '+' . $qty . ' AI credit' . ( $qty > 1 ? 's' : '' ) . ' added to your account.';
	}
	return array( 'ok' => true, 'message' => $msg, 'points' => $have - $cost, 'ai' => dreamscaper_ai_status( $uid ), 'storage' => dreamscaper_storage_status( $uid ) );
}

/** Events that happen in the browser (capped & once-only rules stop abuse). */
function dreamscaper_c_event( WP_REST_Request $r ) {
	$uid  = get_current_user_id();
	$j    = $r->get_json_params();
	$type = isset( $j['type'] ) ? (string) $j['type'] : '';
	$ref  = sanitize_key( isset( $j['ref'] ) ? $j['ref'] : '' );
	if ( 'design' === $type ) {
		if ( ! dreamscaper_award( $uid, 'first_design', $ref ) ) {
			dreamscaper_award( $uid, 'design', $ref );
		}
	} elseif ( 'share' === $type ) {
		dreamscaper_award( $uid, 'share', $ref );
	}
	return array( 'ok' => true, 'status' => dreamscaper_community_status( $uid ) );
}

/* ---------------------------------------------------------- notifications */

function dreamscaper_c_notes() {
	global $wpdb;
	$uid  = get_current_user_id();
	$rows = $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( 'notes' ) . ' WHERE user_id=%d ORDER BY id DESC LIMIT 60', $uid ) );
	return array( 'items' => array_map( function ( $n ) {
		return array( 'id' => (int) $n->id, 'type' => $n->type, 'text' => $n->text, 'target' => (int) $n->target, 'actor' => $n->actor ? dreamscaper_member( (int) $n->actor ) : null, 'created' => strtotime( $n->created . ' UTC' ) * 1000, 'read' => (bool) $n->read_at );
	}, $rows ), 'unread' => dreamscaper_unread( $uid ) );
}

function dreamscaper_c_notes_read( WP_REST_Request $r ) {
	global $wpdb;
	$uid = get_current_user_id();
	$wpdb->query( $wpdb->prepare( 'UPDATE ' . dreamscaper_t( 'notes' ) . ' SET read_at=%s WHERE user_id=%d AND read_at IS NULL', dreamscaper_now(), $uid ) );
	return array( 'unread' => dreamscaper_unread( $uid ) );
}

/* --------------------------------------------------------------- messages */

/*
 * 2.7: member messages live in Inbox threads (includes/inbox.php). These three routes keep their
 * 2.6 shapes so older cached pages keep working, but read and write the threads.
 */
function dreamscaper_c_threads() {
	global $wpdb;
	$uid  = get_current_user_id();
	$rows = $wpdb->get_results( $wpdb->prepare( 'SELECT t.*, tu.unread FROM ' . dreamscaper_t( 'thread_users' ) . ' tu JOIN ' . dreamscaper_t( 'threads' ) . " t ON t.id=tu.thread_id WHERE tu.user_id=%d AND tu.archived=0 AND t.kind='member' AND t.msgs>0 ORDER BY t.last_at DESC LIMIT 100", $uid ) );
	$out  = array();
	foreach ( $rows as $t ) {
		$other = (int) $t->user_a === $uid ? (int) $t->user_b : (int) $t->user_a;
		$out[] = array( 'with' => dreamscaper_member( $other ), 'thread' => (int) $t->id, 'unread' => (int) $t->unread, 'last' => mb_substr( $t->last_text, 0, 80 ), 'mine' => (int) $t->last_user === $uid, 'at' => dreamscaper_ms( $t->last_at ) );
	}
	return array( 'items' => $out, 'unread' => dreamscaper_unread( $uid ) );
}

function dreamscaper_c_thread( WP_REST_Request $r ) {
	$uid   = get_current_user_id();
	$other = (int) $r->get_param( 'with' );
	$req   = new WP_REST_Request( 'GET' );
	$req->set_param( 'with', $other );
	$j = dreamscaper_rest_inbox_thread( $req );
	if ( is_wp_error( $j ) ) {
		return $j;
	}
	return array(
		'with'    => dreamscaper_member( $other ),
		'blocked' => dreamscaper_is_blocked( $uid, $other ),
		'items'   => array_map( function ( $m ) use ( $j ) {
			return array( 'id' => $m['id'], 'body' => $m['body'], 'mine' => $m['mine'], 'at' => $m['at'], 'read' => $m['mine'] && $j['other_read'] && $j['other_read'] >= $m['at'] );
		}, isset( $j['items'] ) ? $j['items'] : array() ),
		'unread'  => dreamscaper_unread( $uid ),
	);
}

function dreamscaper_c_send( WP_REST_Request $r ) {
	$j   = $r->get_json_params();
	$req = new WP_REST_Request( 'POST' );
	$req->set_header( 'Content-Type', 'application/json' );
	$req->set_body( wp_json_encode( array( 'with' => (int) ( isset( $j['to'] ) ? $j['to'] : 0 ), 'body' => isset( $j['body'] ) ? (string) $j['body'] : '' ) ) );
	$res = dreamscaper_rest_inbox_send( $req );
	return is_wp_error( $res ) ? $res : array( 'ok' => true, 'id' => $res['message']['id'], 'thread' => $res['id'] );
}

/* --------------------------------------------------------- hooks from other parts */

// Plant ID and AI designs earn points (server-side, so they can't be faked).
add_filter( 'rest_post_dispatch', function ( $res, $server, $req ) {
	$route = $req->get_route();
	$uid   = get_current_user_id();
	if ( ! $uid || is_wp_error( $res ) || $res->get_status() >= 300 ) {
		return $res;
	}
	if ( '/dreamscaper/v1/ai/identify' === $route ) {
		if ( ! dreamscaper_award( $uid, 'first_id' ) ) {
			dreamscaper_award( $uid, 'plantid', 'id' . time() );
		}
	} elseif ( '/dreamscaper/v1/ai/job' === $route ) {
		$d = $res->get_data();
		if ( is_array( $d ) && isset( $d['status'] ) && 'ready' === $d['status'] ) {
			dreamscaper_award( $uid, 'first_ai' );
		}
	} elseif ( '/dreamscaper/v1/publish' === $route ) {
		dreamscaper_award( $uid, 'share', 'pub' . time() );
	}
	return $res;
}, 5, 3 );

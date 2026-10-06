<?php
/**
 * DreamScaper – cloud saves for signed-in customers.
 * Designs and My Library are stored as private posts (JSON) owned by the customer;
 * their photos live in an unguessable per-customer folder in uploads.
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

add_action( 'init', function () {
	foreach ( array( 'dscp_design' => 'Dreamscapes', 'dscp_asset' => 'DreamScaper assets', 'dscp_share' => 'DreamScaper shares' ) as $type => $label ) {
		register_post_type( $type, array(
			'label'           => $label,
			'public'          => false,
			'show_ui'         => false,
			'rewrite'         => false,
			'query_var'       => false,
			'supports'        => array( 'title', 'author' ),
			'capability_type' => 'post',
		) );
	}
} );

function dreamscaper_cloud_dir( $uid ) {
	$u    = wp_upload_dir();
	$slug = 'u' . (int) $uid . '-' . substr( hash_hmac( 'sha256', 'dscp' . $uid, wp_salt( 'auth' ) ), 0, 20 );
	$dir  = trailingslashit( $u['basedir'] ) . 'dreamscaper-cloud/' . $slug . '/';
	if ( ! is_dir( $dir ) ) {
		wp_mkdir_p( $dir );
		@file_put_contents( $dir . 'index.html', '' );
		$root = trailingslashit( $u['basedir'] ) . 'dreamscaper-cloud/';
		if ( ! file_exists( $root . 'index.html' ) ) {
			@file_put_contents( $root . 'index.html', '' );
		}
	}
	return array( $dir, trailingslashit( $u['baseurl'] ) . 'dreamscaper-cloud/' . $slug . '/' );
}

function dreamscaper_cloud_usage( $uid ) {
	list( $dir ) = dreamscaper_cloud_dir( $uid );
	$n           = 0;
	foreach ( (array) glob( $dir . '*.{jpg,png,webp}', GLOB_BRACE ) as $f ) {
		$n += (int) @filesize( $f );
	}
	return $n;
}

/** Bytes this customer may store online: the free allowance plus any storage they bought. 0 = unlimited. */
function dreamscaper_storage_quota( $uid ) {
	$base = (int) dreamscaper_opt( 'cloud_mb' );
	if ( ! $base ) {
		return 0;
	}
	return ( $base + (int) get_user_meta( $uid, 'dscp_storage_mb', true ) ) * MB_IN_BYTES;
}

/** Storage summary for the app (cheap: used + quota). $detail adds the library/designs split. */
function dreamscaper_storage_status( $uid, $detail = false ) {
	if ( ! $uid ) {
		return null;
	}
	$out = array(
		'used'      => dreamscaper_cloud_usage( $uid ),
		'quota'     => dreamscaper_storage_quota( $uid ),
		'free_mb'   => (int) dreamscaper_opt( 'cloud_mb' ),
		'bought_mb' => (int) get_user_meta( $uid, 'dscp_storage_mb', true ),
		'shop'      => function_exists( 'dreamscaper_storage_shop' ) ? dreamscaper_storage_shop() : null,
	);
	if ( $detail ) {
		list( $dir ) = dreamscaper_cloud_dir( $uid );
		$lib         = 0;
		$n           = 0;
		foreach ( get_posts( array( 'post_type' => 'dscp_asset', 'author' => $uid, 'numberposts' => -1, 'post_status' => 'any' ) ) as $p ) {
			$d = json_decode( $p->post_content, true );
			$n++;
			foreach ( (array) ( isset( $d['files'] ) ? $d['files'] : array() ) as $f ) {
				$f = sanitize_file_name( (string) $f );
				if ( $f && file_exists( $dir . $f ) ) {
					$lib += (int) filesize( $dir . $f );
				}
			}
		}
		$out['library']       = $lib;
		$out['library_count'] = $n;
		$out['designs']       = max( 0, $out['used'] - $lib );
		$out['designs_count'] = count( get_posts( array( 'post_type' => 'dscp_design', 'author' => $uid, 'numberposts' => -1, 'post_status' => 'any', 'fields' => 'ids' ) ) );
	}
	return $out;
}

function dreamscaper_rest_storage() {
	return dreamscaper_storage_status( get_current_user_id(), true );
}

/** Tags, favorite and name for one or many designs (works for designs only in the account, too). */
function dreamscaper_rest_cloud_meta( WP_REST_Request $r ) {
	$j    = $r->get_json_params();
	$uid  = get_current_user_id();
	$done = 0;
	foreach ( array_slice( (array) ( isset( $j['items'] ) ? $j['items'] : array() ), 0, 500 ) as $it ) {
		$p = dreamscaper_cloud_find( $uid, 'design', sanitize_key( isset( $it['cid'] ) ? $it['cid'] : '' ) );
		if ( ! $p ) {
			continue;
		}
		$d = json_decode( $p->post_content, true );
		if ( ! is_array( $d ) ) {
			continue;
		}
		$post = array( 'ID' => $p->ID );
		if ( isset( $it['tags'] ) ) {
			$d['tags'] = dreamscaper_clean_tags( $it['tags'] );
			update_post_meta( $p->ID, 'dscp_tags', $d['tags'] );
		}
		if ( isset( $it['fav'] ) ) {
			$d['fav'] = (bool) $it['fav'];
			update_post_meta( $p->ID, 'dscp_fav', $d['fav'] ? 1 : 0 );
		}
		if ( isset( $it['name'] ) && trim( (string) $it['name'] ) !== '' ) {
			$d['name']          = sanitize_text_field( $it['name'] );
			$post['post_title'] = $d['name'];
		}
		$d['metaAt'] = (int) ( isset( $it['metaAt'] ) ? $it['metaAt'] : time() * 1000 );
		update_post_meta( $p->ID, 'dscp_meta_at', $d['metaAt'] );
		$post['post_content'] = wp_slash( wp_json_encode( $d ) );
		wp_update_post( $post );
		$done++;
	}
	return array( 'ok' => true, 'updated' => $done );
}

function dreamscaper_clean_tags( $tags ) {
	$out = array();
	foreach ( array_slice( (array) $tags, 0, 30 ) as $t ) {
		$t = trim( sanitize_text_field( (string) $t ) );
		if ( '' !== $t && strlen( $t ) <= 40 && ! in_array( $t, $out, true ) ) {
			$out[] = $t;
		}
	}
	return $out;
}

/** The customer's own tag names (kept even when no design uses them yet). */
function dreamscaper_rest_tags( WP_REST_Request $r ) {
	$uid = get_current_user_id();
	if ( 'POST' === $r->get_method() ) {
		$j = $r->get_json_params();
		update_user_meta( $uid, 'dscp_tags', dreamscaper_clean_tags( isset( $j['tags'] ) ? $j['tags'] : array() ) );
	}
	$t = get_user_meta( $uid, 'dscp_tags', true );
	return array( 'tags' => is_array( $t ) ? array_values( $t ) : array() );
}

function dreamscaper_cloud_wipe( $uid ) {
	foreach ( array( 'dscp_design', 'dscp_asset', 'dscp_share' ) as $type ) {
		foreach ( get_posts( array( 'post_type' => $type, 'author' => $uid, 'numberposts' => -1, 'post_status' => 'any', 'fields' => 'ids' ) ) as $id ) {
			wp_delete_post( $id, true );
		}
	}
	list( $dir ) = dreamscaper_cloud_dir( $uid );
	foreach ( (array) glob( $dir . '*' ) as $f ) {
		@unlink( $f );
	}
	@rmdir( $dir );
}

add_action( 'rest_api_init', function () {
	$auth = function () {
		return is_user_logged_in();
	};
	$routes = array(
		array( '/cloud/list', 'GET', 'dreamscaper_rest_cloud_list' ),
		array( '/cloud/get', 'GET', 'dreamscaper_rest_cloud_get' ),
		array( '/cloud/put', 'POST', 'dreamscaper_rest_cloud_put' ),
		array( '/cloud/delete', 'POST', 'dreamscaper_rest_cloud_delete' ),
		array( '/cloud/file', 'POST', 'dreamscaper_rest_cloud_file' ),
		array( '/cloud/has', 'POST', 'dreamscaper_rest_cloud_has' ),
		array( '/publish', 'POST', 'dreamscaper_rest_publish' ),
		array( '/storage', 'GET', 'dreamscaper_rest_storage' ),
		array( '/cloud/meta', 'POST', 'dreamscaper_rest_cloud_meta' ),
		array( '/tags', 'GET,POST', 'dreamscaper_rest_tags' ),
	);
	foreach ( $routes as $r ) {
		register_rest_route( 'dreamscaper/v1', $r[0], array( 'methods' => $r[1], 'callback' => $r[2], 'permission_callback' => $auth ) );
	}
} );

function dreamscaper_cloud_type( $kind ) {
	return 'asset' === $kind ? 'dscp_asset' : 'dscp_design';
}

function dreamscaper_cloud_find( $uid, $kind, $cid ) {
	$q = get_posts( array(
		'post_type'   => dreamscaper_cloud_type( $kind ),
		'author'      => $uid,
		'numberposts' => 1,
		'post_status' => 'any',
		'meta_key'    => 'dscp_cid',
		'meta_value'  => $cid,
	) );
	return $q ? $q[0] : null;
}

/** List designs or assets (summaries). */
function dreamscaper_rest_cloud_list( WP_REST_Request $r ) {
	$kind = 'asset' === $r->get_param( 'kind' ) ? 'asset' : 'design';
	$uid  = get_current_user_id();
	$out  = array();
	foreach ( get_posts( array( 'post_type' => dreamscaper_cloud_type( $kind ), 'author' => $uid, 'numberposts' => 500, 'post_status' => 'any', 'orderby' => 'modified' ) ) as $p ) {
		$row = array(
			'cid'     => get_post_meta( $p->ID, 'dscp_cid', true ),
			'name'    => $p->post_title,
			'updated' => (int) get_post_meta( $p->ID, 'dscp_updated', true ),
			'thumb'   => get_post_meta( $p->ID, 'dscp_thumb', true ),
			'views'   => (int) get_post_meta( $p->ID, 'dscp_views', true ),
		);
		if ( 'design' === $kind ) {
			$t              = get_post_meta( $p->ID, 'dscp_tags', true );
			$row['tags']    = is_array( $t ) ? array_values( $t ) : array();
			$row['fav']     = (bool) get_post_meta( $p->ID, 'dscp_fav', true );
			$row['metaAt']  = (int) get_post_meta( $p->ID, 'dscp_meta_at', true );
			$row['created'] = (int) get_post_time( 'U', true, $p ) * 1000;
		}
		if ( 'asset' === $kind ) {
			$row['data'] = json_decode( $p->post_content, true );
		}
		$out[] = $row;
	}
	list( , $url ) = dreamscaper_cloud_dir( $uid );
	return array( 'items' => $out, 'files' => $url, 'used' => dreamscaper_cloud_usage( $uid ), 'quota' => dreamscaper_storage_quota( $uid ) );
}

function dreamscaper_rest_cloud_get( WP_REST_Request $r ) {
	$kind = 'asset' === $r->get_param( 'kind' ) ? 'asset' : 'design';
	$p    = dreamscaper_cloud_find( get_current_user_id(), $kind, sanitize_key( (string) $r->get_param( 'cid' ) ) );
	if ( ! $p ) {
		return new WP_Error( 'dreamscaper', 'Not found.', array( 'status' => 404 ) );
	}
	list( , $url ) = dreamscaper_cloud_dir( get_current_user_id() );
	return array( 'data' => json_decode( $p->post_content, true ), 'files' => $url );
}

/** Save a design/asset record (JSON). Files are uploaded separately by blob id. */
function dreamscaper_rest_cloud_put( WP_REST_Request $r ) {
	$j    = $r->get_json_params();
	$kind = isset( $j['kind'] ) && 'asset' === $j['kind'] ? 'asset' : 'design';
	$data = isset( $j['data'] ) && is_array( $j['data'] ) ? $j['data'] : null;
	$cid  = $data && isset( $data['id'] ) ? sanitize_key( $data['id'] ) : '';
	if ( ! $cid ) {
		return new WP_Error( 'dreamscaper', 'Missing data.', array( 'status' => 400 ) );
	}
	$thumb = '';
	if ( 'design' === $kind && isset( $data['thumb'] ) && is_string( $data['thumb'] ) && 0 === strpos( $data['thumb'], 'data:image/jpeg;base64,' ) ) {
		$bin = base64_decode( substr( $data['thumb'], 23 ) );
		if ( $bin && strlen( $bin ) < 400 * 1024 ) {
			list( $dir, $url ) = dreamscaper_cloud_dir( get_current_user_id() );
			$f                 = 'thumb-' . $cid . '.jpg';
			file_put_contents( $dir . $f, $bin );
			$thumb = $url . $f . '?v=' . time();
		}
		$data['thumb'] = null;
	}
	$json = wp_json_encode( $data );
	if ( strlen( $json ) > 4 * MB_IN_BYTES ) {
		return new WP_Error( 'dreamscaper', 'This design is too large to save online.', array( 'status' => 413 ) );
	}
	$uid      = get_current_user_id();
	$existing = dreamscaper_cloud_find( $uid, $kind, $cid );
	$post     = array(
		'post_type'    => dreamscaper_cloud_type( $kind ),
		'post_status'  => 'private',
		'post_author'  => $uid,
		'post_title'   => sanitize_text_field( isset( $data['name'] ) ? $data['name'] : 'Dreamscape' ),
		'post_content' => wp_slash( $json ),
	);
	if ( $existing ) {
		$post['ID'] = $existing->ID;
		$id         = wp_update_post( $post, true );
	} else {
		$id = wp_insert_post( $post, true );
	}
	if ( is_wp_error( $id ) ) {
		return new WP_Error( 'dreamscaper', 'Couldn’t save online right now.', array( 'status' => 500 ) );
	}
	update_post_meta( $id, 'dscp_cid', $cid );
	update_post_meta( $id, 'dscp_updated', isset( $data['updated'] ) ? (int) $data['updated'] : time() * 1000 );
	if ( 'design' === $kind ) {
		update_post_meta( $id, 'dscp_views', isset( $data['views'] ) ? count( (array) $data['views'] ) : 0 );
		update_post_meta( $id, 'dscp_tags', dreamscaper_clean_tags( isset( $data['tags'] ) ? $data['tags'] : array() ) );
		update_post_meta( $id, 'dscp_fav', empty( $data['fav'] ) ? 0 : 1 );
		update_post_meta( $id, 'dscp_meta_at', isset( $data['metaAt'] ) ? (int) $data['metaAt'] : 0 );
		if ( $thumb ) {
			update_post_meta( $id, 'dscp_thumb', $thumb );
		}
	}
	return array( 'ok' => true );
}

function dreamscaper_rest_cloud_delete( WP_REST_Request $r ) {
	$j    = $r->get_json_params();
	$kind = isset( $j['kind'] ) && 'asset' === $j['kind'] ? 'asset' : 'design';
	$p    = dreamscaper_cloud_find( get_current_user_id(), $kind, sanitize_key( isset( $j['cid'] ) ? $j['cid'] : '' ) );
	if ( $p ) {
		wp_delete_post( $p->ID, true );
	}
	list( $dir ) = dreamscaper_cloud_dir( get_current_user_id() );
	foreach ( (array) ( isset( $j['files'] ) ? $j['files'] : array() ) as $fid ) {
		$fid = sanitize_key( $fid );
		foreach ( array( 'jpg', 'png', 'webp' ) as $ext ) {
			if ( $fid && file_exists( $dir . $fid . '.' . $ext ) ) {
				@unlink( $dir . $fid . '.' . $ext );
			}
		}
	}
	return array( 'ok' => true );
}

/** Which blob ids are already uploaded. */
function dreamscaper_rest_cloud_has( WP_REST_Request $r ) {
	list( $dir ) = dreamscaper_cloud_dir( get_current_user_id() );
	$out         = array();
	foreach ( (array) $r->get_param( 'ids' ) as $id ) {
		$id = sanitize_key( $id );
		foreach ( array( 'jpg', 'png', 'webp' ) as $ext ) {
			if ( $id && file_exists( $dir . $id . '.' . $ext ) ) {
				$out[ $id ] = $id . '.' . $ext;
			}
		}
	}
	return array( 'have' => (object) $out );
}

/** Upload one image file (multipart "file", field "id" = blob id). */
function dreamscaper_rest_cloud_file( WP_REST_Request $r ) {
	$uid   = get_current_user_id();
	$files = $r->get_file_params();
	$id    = sanitize_key( (string) $r->get_param( 'id' ) );
	if ( ! $id || empty( $files['file']['tmp_name'] ) ) {
		return new WP_Error( 'dreamscaper', 'No file.', array( 'status' => 400 ) );
	}
	$f = $files['file'];
	if ( $f['size'] > 12 * MB_IN_BYTES ) {
		return new WP_Error( 'dreamscaper', 'That image is too large.', array( 'status' => 413 ) );
	}
	$info = @getimagesize( $f['tmp_name'] );
	$ext  = $info ? array( 'image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp' )[ $info['mime'] ] ?? '' : '';
	if ( ! $ext ) {
		return new WP_Error( 'dreamscaper', 'Only photos can be saved.', array( 'status' => 400 ) );
	}
	$quota = dreamscaper_storage_quota( $uid );
	if ( $quota && dreamscaper_cloud_usage( $uid ) + $f['size'] > $quota ) {
		return new WP_Error( 'dreamscaper', 'Your online storage is full. Get more storage or delete something you no longer need.', array( 'status' => 413, 'needStorage' => true ) );
	}
	list( $dir, $url ) = dreamscaper_cloud_dir( $uid );
	if ( ! @move_uploaded_file( $f['tmp_name'], $dir . $id . '.' . $ext ) && ! @copy( $f['tmp_name'], $dir . $id . '.' . $ext ) ) {
		return new WP_Error( 'dreamscaper', 'Couldn’t store that image.', array( 'status' => 500 ) );
	}
	return array( 'name' => $id . '.' . $ext, 'url' => $url . $id . '.' . $ext );
}

/* --------------------------------------------------------- public sharing */

/** Publish a finished picture so it can be shared on social media. */
function dreamscaper_rest_publish( WP_REST_Request $r ) {
	if ( ! dreamscaper_limit( 'pub', 40, DAY_IN_SECONDS ) ) {
		return new WP_Error( 'dreamscaper', 'You’ve shared a lot today! Try again tomorrow.', array( 'status' => 429 ) );
	}
	$j     = $r->get_json_params();
	$image = isset( $j['image'] ) ? (string) $j['image'] : '';
	if ( 0 !== strpos( $image, 'data:image/jpeg;base64,' ) || strlen( $image ) > 8 * MB_IN_BYTES ) {
		return new WP_Error( 'dreamscaper', 'The picture didn’t come through.', array( 'status' => 400 ) );
	}
	$token = strtolower( wp_generate_password( 12, false ) );
	$u     = wp_upload_dir();
	$dir   = trailingslashit( $u['basedir'] ) . 'dreamscaper-shared/';
	wp_mkdir_p( $dir );
	if ( ! file_exists( $dir . 'index.html' ) ) {
		@file_put_contents( $dir . 'index.html', '' );
	}
	file_put_contents( $dir . $token . '.jpg', base64_decode( substr( $image, 23 ) ) );
	$before = isset( $j['before'] ) ? (string) $j['before'] : '';
	if ( 0 === strpos( $before, 'data:image/jpeg;base64,' ) && strlen( $before ) < 6 * MB_IN_BYTES ) {
		file_put_contents( $dir . $token . '-before.jpg', base64_decode( substr( $before, 23 ) ) );
	}
	$id = wp_insert_post( array(
		'post_type'   => 'dscp_share',
		'post_status' => 'publish',
		'post_author' => get_current_user_id(),
		'post_title'  => sanitize_text_field( isset( $j['title'] ) ? $j['title'] : 'My Dreamscape' ),
	) );
	update_post_meta( $id, 'dscp_token', $token );
	return array( 'url' => add_query_arg( 'dreamscape', $token, home_url( '/' ) ), 'image' => trailingslashit( $u['baseurl'] ) . 'dreamscaper-shared/' . $token . '.jpg' );
}

/** The public share page (with Open Graph tags so Facebook/Pinterest show the picture). */
add_action( 'template_redirect', function () {
	if ( empty( $_GET['dreamscape'] ) ) {
		return;
	}
	$token = sanitize_key( wp_unslash( $_GET['dreamscape'] ) );
	$q     = get_posts( array( 'post_type' => 'dscp_share', 'meta_key' => 'dscp_token', 'meta_value' => $token, 'numberposts' => 1 ) );
	if ( ! $q ) {
		return;
	}
	$u      = wp_upload_dir();
	$img    = trailingslashit( $u['baseurl'] ) . 'dreamscaper-shared/' . $token . '.jpg';
	$before = file_exists( trailingslashit( $u['basedir'] ) . 'dreamscaper-shared/' . $token . '-before.jpg' ) ? trailingslashit( $u['baseurl'] ) . 'dreamscaper-shared/' . $token . '-before.jpg' : '';
	$title  = $q[0]->post_title;
	$brand  = dreamscaper_opt( 'brand' );
	$desc   = 'Designed with DreamScaper by ' . $brand . '. Design your own dream yard for free.';
	$cta    = home_url( '/#dreamscaper' );
	$page   = get_option( 'dreamscaper_page' );
	if ( $page ) {
		$cta = get_permalink( $page ) . '#dreamscaper';
	}
	status_header( 200 );
	nocache_headers();
	?><!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title><?php echo esc_html( $title . ' · DreamScaper' ); ?></title>
<meta name="description" content="<?php echo esc_attr( $desc ); ?>">
<meta property="og:type" content="article"><meta property="og:title" content="<?php echo esc_attr( $title ); ?>">
<meta property="og:description" content="<?php echo esc_attr( $desc ); ?>"><meta property="og:image" content="<?php echo esc_url( $img ); ?>">
<meta property="og:url" content="<?php echo esc_url( add_query_arg( 'dreamscape', $token, home_url( '/' ) ) ); ?>">
<meta name="twitter:card" content="summary_large_image"><meta name="robots" content="noindex">
<style>body{margin:0;font:16px/1.5 system-ui,sans-serif;background:#0f1d16;color:#eef7f0}main{max-width:1000px;margin:auto;padding:20px}img{width:100%;border-radius:14px;display:block}h1{font-size:26px;margin:8px 0 14px}.cta{display:inline-block;margin:18px 0;background:#7be0a0;color:#0b2a18;font-weight:800;padding:14px 24px;border-radius:999px;text-decoration:none}.b{opacity:.75;font-size:14px;margin-top:20px}.row{display:grid;gap:12px}@media(min-width:760px){.row.two{grid-template-columns:1fr 1fr}}small{opacity:.7}</style>
</head><body><main>
<h1><?php echo esc_html( $title ); ?></h1>
<div class="row<?php echo $before ? ' two' : ''; ?>">
<?php if ( $before ) : ?><figure style="margin:0"><img src="<?php echo esc_url( $before ); ?>" alt="Before"><small>Before</small></figure><?php endif; ?>
<figure style="margin:0"><img src="<?php echo esc_url( $img ); ?>" alt="<?php echo esc_attr( $title ); ?>"><?php if ( $before ) : ?><small>After</small><?php endif; ?></figure>
</div>
<a class="cta" href="<?php echo esc_url( $cta ); ?>">Design your own yard free →</a>
<p class="b">Made with DreamScaper by <?php echo esc_html( $brand ); ?><?php echo dreamscaper_opt( 'site' ) ? ' · ' . esc_html( dreamscaper_opt( 'site' ) ) : ''; ?></p>
</main></body></html>
	<?php
	exit;
} );

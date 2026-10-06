<?php
/**
 * DreamScaper – community moderation screen (Settings → DreamScaper Community).
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

add_action( 'admin_post_dreamscaper_mod', function () {
	global $wpdb;
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( 'No.' );
	}
	check_admin_referer( 'dreamscaper_mod' );
	$do   = sanitize_key( isset( $_POST['do'] ) ? $_POST['do'] : '' );
	$kind = 'comment' === ( isset( $_POST['kind'] ) ? $_POST['kind'] : '' ) ? 'comment' : 'post';
	$id   = (int) ( isset( $_POST['id'] ) ? $_POST['id'] : 0 );
	$T    = 'comment' === $kind ? dreamscaper_t( 'comments' ) : dreamscaper_t( 'posts' );
	$R    = dreamscaper_t( 'reports' );
	$msg  = 'Done.';
	if ( 'keep' === $do ) {
		$wpdb->update( $T, array( 'status' => 'live', 'reports' => 0 ), array( 'id' => $id ) );
		$wpdb->update( $R, array( 'done' => 1 ), array( 'kind' => $kind, 'target' => $id ) );
		$msg = 'Restored and reports dismissed.';
	} elseif ( 'hide' === $do ) {
		$wpdb->update( $T, array( 'status' => 'hidden' ), array( 'id' => $id ) );
	} elseif ( 'remove' === $do ) {
		$wpdb->update( $T, array( 'status' => 'removed' ), array( 'id' => $id ) );
		$wpdb->update( $R, array( 'done' => 1 ), array( 'kind' => $kind, 'target' => $id ) );
		$msg = 'Removed.';
	} elseif ( 'ban' === $do || 'unban' === $do ) {
		$uid = (int) ( isset( $_POST['user'] ) ? $_POST['user'] : 0 );
		if ( $uid && ! user_can( $uid, 'manage_options' ) ) {
			if ( 'ban' === $do ) {
				update_user_meta( $uid, 'dscp_banned', 1 );
				$wpdb->update( dreamscaper_t( 'posts' ), array( 'status' => 'hidden' ), array( 'user_id' => $uid, 'status' => 'live' ) );
				$msg = 'Member banned and their posts hidden.';
			} else {
				delete_user_meta( $uid, 'dscp_banned' );
				$msg = 'Member can post again (restore their posts one by one if you want them back).';
			}
		}
	} elseif ( 'bonus' === $do ) {
		$uid = (int) ( isset( $_POST['user'] ) ? $_POST['user'] : 0 );
		$pts = (int) ( isset( $_POST['points'] ) ? $_POST['points'] : 0 );
		if ( $uid && $pts ) {
			$wpdb->insert( dreamscaper_t( 'points' ), array( 'user_id' => $uid, 'action' => 'admin', 'points' => $pts, 'ref' => '', 'created' => dreamscaper_now() ) );
			dreamscaper_points_add( $uid, $pts );
			dreamscaper_note( $uid, 'bonus', 0, 0, ( $pts > 0 ? 'You received ' . $pts . ' bonus points from the team! 🎁' : 'Points adjusted by the team: ' . $pts ) );
			$msg = 'Points given.';
		}
	}
	wp_safe_redirect( add_query_arg( array( 'page' => 'dreamscaper-community', 'msg' => rawurlencode( $msg ) ), admin_url( 'options-general.php' ) ) );
	exit;
} );

function dreamscaper_mod_button( $label, $do, $kind, $id, $user = 0, $danger = false ) {
	echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" style="display:inline">';
	wp_nonce_field( 'dreamscaper_mod' );
	echo '<input type="hidden" name="action" value="dreamscaper_mod"><input type="hidden" name="do" value="' . esc_attr( $do ) . '"><input type="hidden" name="kind" value="' . esc_attr( $kind ) . '"><input type="hidden" name="id" value="' . (int) $id . '"><input type="hidden" name="user" value="' . (int) $user . '">';
	echo '<button class="button' . ( $danger ? ' button-link-delete' : '' ) . '"' . ( $danger ? ' onclick="return confirm(\'Are you sure?\')"' : '' ) . '>' . esc_html( $label ) . '</button></form> ';
}

function dreamscaper_community_admin() {
	global $wpdb;
	$P = dreamscaper_t( 'posts' );
	$C = dreamscaper_t( 'comments' );
	echo '<div class="wrap"><h1>DreamScaper Community</h1>';
	if ( ! empty( $_GET['msg'] ) ) {
		echo '<div class="notice notice-success"><p>' . esc_html( wp_unslash( $_GET['msg'] ) ) . '</p></div>';
	}
	$stats = array(
		'Posts'    => (int) $wpdb->get_var( "SELECT COUNT(*) FROM $P WHERE status='live'" ),
		'Comments' => (int) $wpdb->get_var( "SELECT COUNT(*) FROM $C WHERE status='live'" ),
		'Members with points' => (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->usermeta} WHERE meta_key='dscp_pts_total'" ),
		'Messages' => (int) $wpdb->get_var( 'SELECT COUNT(*) FROM ' . dreamscaper_t( 'messages' ) ),
	);
	echo '<p>';
	foreach ( $stats as $k => $v ) {
		echo '<strong>' . esc_html( number_format( $v ) ) . '</strong> ' . esc_html( $k ) . ' &nbsp; ';
	}
	echo '</p>';

	// Needs review: hidden items + open reports
	echo '<h2>Needs review</h2>';
	$items = $wpdb->get_results( "SELECT 'post' AS kind, id, user_id, title AS text, image, status, reports FROM $P WHERE status='hidden' OR (reports>0 AND status='live')
		UNION ALL SELECT 'comment' AS kind, id, user_id, body AS text, image, status, reports FROM $C WHERE status='hidden' OR (reports>0 AND status='live') ORDER BY reports DESC LIMIT 50" );
	if ( ! $items ) {
		echo '<p>Nothing to review. 🎉</p>';
	} else {
		echo '<table class="widefat striped"><thead><tr><th>What</th><th>Member</th><th>Reports</th><th>Reasons</th><th>Status</th><th>Action</th></tr></thead><tbody>';
		foreach ( $items as $it ) {
			$u       = get_userdata( (int) $it->user_id );
			$reasons = $wpdb->get_col( $wpdb->prepare( 'SELECT reason FROM ' . dreamscaper_t( 'reports' ) . ' WHERE kind=%s AND target=%d AND done=0 LIMIT 5', $it->kind, $it->id ) );
			echo '<tr><td>' . ( $it->image ? '<img src="' . esc_url( $it->image ) . '" style="width:90px;height:60px;object-fit:cover;vertical-align:middle;margin-right:8px">' : '' ) . esc_html( ucfirst( $it->kind ) . ': ' . mb_substr( $it->text, 0, 120 ) ) . '</td>';
			echo '<td>' . esc_html( $u ? $u->display_name . ' (' . $u->user_email . ')' : '—' ) . '</td><td>' . (int) $it->reports . '</td><td>' . esc_html( implode( ' · ', array_filter( $reasons ) ) ) . '</td><td>' . esc_html( $it->status ) . '</td><td>';
			dreamscaper_mod_button( 'Keep (it’s fine)', 'keep', $it->kind, $it->id );
			dreamscaper_mod_button( 'Remove', 'remove', $it->kind, $it->id, 0, true );
			if ( $u ) {
				dreamscaper_mod_button( 'Ban member', 'ban', $it->kind, $it->id, $u->ID, true );
			}
			echo '</td></tr>';
		}
		echo '</tbody></table>';
	}

	echo '<h2>Latest posts</h2><table class="widefat striped"><thead><tr><th>Post</th><th>Member</th><th>Likes</th><th>Rating</th><th>Comments</th><th>Status</th><th>Action</th></tr></thead><tbody>';
	foreach ( $wpdb->get_results( "SELECT * FROM $P WHERE status<>'removed' ORDER BY id DESC LIMIT 30" ) as $p ) {
		$u = get_userdata( (int) $p->user_id );
		echo '<tr><td><img src="' . esc_url( $p->thumb ? $p->thumb : $p->image ) . '" style="width:90px;height:60px;object-fit:cover;vertical-align:middle;margin-right:8px">' . esc_html( ( 'help' === $p->kind ? '[Ask for ideas] ' : '' ) . $p->title ) . '</td>';
		echo '<td>' . esc_html( $u ? $u->display_name : '—' ) . '</td><td>' . (int) $p->likes . '</td><td>' . ( $p->rating_n ? esc_html( round( $p->rating_sum / $p->rating_n, 1 ) . ' (' . $p->rating_n . ')' ) : '—' ) . '</td><td>' . (int) $p->comments . '</td><td>' . esc_html( $p->status ) . '</td><td>';
		if ( 'live' === $p->status ) {
			dreamscaper_mod_button( 'Hide', 'hide', 'post', $p->id );
		} else {
			dreamscaper_mod_button( 'Restore', 'keep', 'post', $p->id );
		}
		dreamscaper_mod_button( 'Remove', 'remove', 'post', $p->id, 0, true );
		echo '</td></tr>';
	}
	echo '</tbody></table>';

	echo '<h2>Members</h2><p>Top members by lifetime points. Banned members can still design, but can’t post, comment, like or message.</p><table class="widefat striped"><thead><tr><th>Member</th><th>Level</th><th>Points (balance / lifetime)</th><th>Status</th><th>Action</th></tr></thead><tbody>';
	foreach ( $wpdb->get_results( "SELECT user_id, CAST(meta_value AS UNSIGNED) AS t FROM {$wpdb->usermeta} WHERE meta_key='dscp_pts_total' ORDER BY t DESC LIMIT 40" ) as $row ) {
		$u = get_userdata( (int) $row->user_id );
		if ( ! $u ) {
			continue;
		}
		$m      = dreamscaper_member( $u->ID );
		$banned = (bool) get_user_meta( $u->ID, 'dscp_banned', true );
		echo '<tr><td>' . esc_html( $m['name'] . ' — ' . $u->display_name . ' (' . $u->user_email . ')' ) . '</td><td>' . esc_html( $m['level']['emoji'] . ' ' . $m['level']['name'] ) . '</td><td>' . (int) get_user_meta( $u->ID, 'dscp_pts', true ) . ' / ' . (int) $row->t . '</td><td>' . ( $banned ? '<strong style="color:#b32d2e">Banned</strong>' : 'OK' ) . '</td><td>';
		dreamscaper_mod_button( $banned ? 'Unban' : 'Ban', $banned ? 'unban' : 'ban', 'post', 0, $u->ID, ! $banned );
		echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" style="display:inline">';
		wp_nonce_field( 'dreamscaper_mod' );
		echo '<input type="hidden" name="action" value="dreamscaper_mod"><input type="hidden" name="do" value="bonus"><input type="hidden" name="user" value="' . (int) $u->ID . '"><input type="number" name="points" value="50" style="width:70px"> <button class="button">Give points</button></form>';
		echo '</td></tr>';
	}
	echo '</tbody></table></div>';
}

<?php
/**
 * DreamScaper – community ("Dreamscape Browser"): public posts of finished designs and
 * "ask for ideas" requests, likes, star ratings, comments, follows, friends, messages,
 * notifications, points, levels, badges and rewards.
 *
 * Moderation: posts go live immediately; anyone can report; anything with 3 reports is
 * hidden until an admin reviews it (Settings → DreamScaper Community). Optional AI check
 * of images (fal vision) and a word filter for text. Admins can ban members.
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'DREAMSCAPER_DB', 3 );

/* --------------------------------------------------------------------- schema */

function dreamscaper_t( $name ) {
	global $wpdb;
	return $wpdb->prefix . 'dscp_' . $name;
}

function dreamscaper_install_db() {
	global $wpdb;
	require_once ABSPATH . 'wp-admin/includes/upgrade.php';
	$c = $wpdb->get_charset_collate();
	$sql = array(
		'CREATE TABLE ' . dreamscaper_t( 'posts' ) . " (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			user_id bigint(20) unsigned NOT NULL,
			kind varchar(12) NOT NULL DEFAULT 'design',
			title varchar(120) NOT NULL DEFAULT '',
			body text NOT NULL,
			tags varchar(400) NOT NULL DEFAULT '',
			image varchar(255) NOT NULL DEFAULT '',
			thumb varchar(255) NOT NULL DEFAULT '',
			before_img varchar(255) NOT NULL DEFAULT '',
			meta longtext NOT NULL,
			status varchar(10) NOT NULL DEFAULT 'live',
			likes int(11) NOT NULL DEFAULT 0,
			rating_sum int(11) NOT NULL DEFAULT 0,
			rating_n int(11) NOT NULL DEFAULT 0,
			comments int(11) NOT NULL DEFAULT 0,
			views int(11) NOT NULL DEFAULT 0,
			reports int(11) NOT NULL DEFAULT 0,
			created datetime NOT NULL,
			PRIMARY KEY  (id),
			KEY user_id (user_id),
			KEY status_created (status,created)
		) $c;",
		'CREATE TABLE ' . dreamscaper_t( 'comments' ) . " (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			post_id bigint(20) unsigned NOT NULL,
			user_id bigint(20) unsigned NOT NULL,
			parent_id bigint(20) unsigned NOT NULL DEFAULT 0,
			body text NOT NULL,
			image varchar(255) NOT NULL DEFAULT '',
			likes int(11) NOT NULL DEFAULT 0,
			reports int(11) NOT NULL DEFAULT 0,
			status varchar(10) NOT NULL DEFAULT 'live',
			created datetime NOT NULL,
			PRIMARY KEY  (id),
			KEY post_id (post_id)
		) $c;",
		'CREATE TABLE ' . dreamscaper_t( 'likes' ) . " (
			user_id bigint(20) unsigned NOT NULL,
			kind varchar(8) NOT NULL,
			target bigint(20) unsigned NOT NULL,
			created datetime NOT NULL,
			PRIMARY KEY  (user_id,kind,target),
			KEY target (kind,target)
		) $c;",
		'CREATE TABLE ' . dreamscaper_t( 'ratings' ) . " (
			user_id bigint(20) unsigned NOT NULL,
			post_id bigint(20) unsigned NOT NULL,
			stars tinyint(4) NOT NULL,
			PRIMARY KEY  (user_id,post_id)
		) $c;",
		'CREATE TABLE ' . dreamscaper_t( 'follows' ) . " (
			follower bigint(20) unsigned NOT NULL,
			followee bigint(20) unsigned NOT NULL,
			created datetime NOT NULL,
			PRIMARY KEY  (follower,followee),
			KEY followee (followee)
		) $c;",
		'CREATE TABLE ' . dreamscaper_t( 'friends' ) . " (
			a bigint(20) unsigned NOT NULL,
			b bigint(20) unsigned NOT NULL,
			status varchar(10) NOT NULL DEFAULT 'pending',
			created datetime NOT NULL,
			PRIMARY KEY  (a,b),
			KEY b (b)
		) $c;",
		'CREATE TABLE ' . dreamscaper_t( 'messages' ) . " (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			from_id bigint(20) unsigned NOT NULL,
			to_id bigint(20) unsigned NOT NULL,
			body text NOT NULL,
			created datetime NOT NULL,
			read_at datetime DEFAULT NULL,
			PRIMARY KEY  (id),
			KEY pair (from_id,to_id),
			KEY to_read (to_id,read_at)
		) $c;",
		'CREATE TABLE ' . dreamscaper_t( 'notes' ) . " (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			user_id bigint(20) unsigned NOT NULL,
			type varchar(20) NOT NULL,
			actor bigint(20) unsigned NOT NULL DEFAULT 0,
			target bigint(20) unsigned NOT NULL DEFAULT 0,
			text varchar(255) NOT NULL DEFAULT '',
			created datetime NOT NULL,
			read_at datetime DEFAULT NULL,
			PRIMARY KEY  (id),
			KEY user_read (user_id,read_at)
		) $c;",
		'CREATE TABLE ' . dreamscaper_t( 'points' ) . " (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			user_id bigint(20) unsigned NOT NULL,
			action varchar(20) NOT NULL,
			points int(11) NOT NULL,
			ref varchar(40) NOT NULL DEFAULT '',
			created datetime NOT NULL,
			PRIMARY KEY  (id),
			KEY user_action (user_id,action,created)
		) $c;",
		'CREATE TABLE ' . dreamscaper_t( 'reports' ) . " (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			user_id bigint(20) unsigned NOT NULL,
			kind varchar(10) NOT NULL,
			target bigint(20) unsigned NOT NULL,
			reason varchar(255) NOT NULL DEFAULT '',
			created datetime NOT NULL,
			done tinyint(1) NOT NULL DEFAULT 0,
			PRIMARY KEY  (id),
			UNIQUE KEY once (user_id,kind,target)
		) $c;",
	);
	foreach ( $sql as $q ) {
		dbDelta( $q );
	}
	update_option( 'dreamscaper_db', DREAMSCAPER_DB );
}
add_action( 'init', function () {
	if ( (int) get_option( 'dreamscaper_db' ) !== DREAMSCAPER_DB ) {
		dreamscaper_install_db();
	}
}, 5 );

function dreamscaper_now() {
	return current_time( 'mysql', true );
}

/* ------------------------------------------------------- levels, badges, styles */

/** [min lifetime points, name, emoji] */
function dreamscaper_levels() {
	return array(
		array( 0, 'Seedling', '🌱' ),
		array( 100, 'Sprout', '🌿' ),
		array( 300, 'Gardener', '🪴' ),
		array( 750, 'Green Thumb', '👍' ),
		array( 1500, 'Landscaper', '🌳' ),
		array( 3000, 'Master Gardener', '🏅' ),
		array( 6000, 'Garden Legend', '👑' ),
	);
}
function dreamscaper_level( $total ) {
	$levels = dreamscaper_levels();
	$i      = 0;
	foreach ( $levels as $k => $l ) {
		if ( $total >= $l[0] ) {
			$i = $k;
		}
	}
	$next = isset( $levels[ $i + 1 ] ) ? $levels[ $i + 1 ] : null;
	return array( 'n' => $i + 1, 'name' => $levels[ $i ][1], 'emoji' => $levels[ $i ][2], 'next' => $next ? $next[1] : null, 'next_at' => $next ? $next[0] : null, 'from' => $levels[ $i ][0] );
}

/** id => [name, emoji, how to earn] */
function dreamscaper_badges() {
	return array(
		'first_design' => array( 'First Dreamscape', '🏡', 'Create your first Dreamscape' ),
		'first_id'     => array( 'Plant Spotter', '🔎', 'Identify your first plant' ),
		'detective'    => array( 'Plant Detective', '🕵️', 'Identify 25 plants' ),
		'first_post'   => array( 'Show-off', '📸', 'Share your first design in the Dreamscape Browser' ),
		'prolific'     => array( 'Prolific Designer', '🎨', 'Share 10 designs' ),
		'favorite'     => array( 'Crowd Favorite', '❤️', 'Get 25 likes on one design' ),
		'five_star'    => array( 'Five-Star Design', '⭐', 'Get a 4.5+ average from 5 or more ratings' ),
		'helper'       => array( 'Helpful Neighbor', '🤝', 'Reply with ideas on 5 “Ask for ideas” posts' ),
		'social'       => array( 'Social Butterfly', '🦋', 'Follow 10 members' ),
		'popular'      => array( 'Popular', '🌟', 'Have 25 followers' ),
		'critic'       => array( 'Design Critic', '🧐', 'Rate 20 designs' ),
		'streak7'      => array( 'Week Streak', '🔥', 'Visit 7 days in a row' ),
		'streak30'     => array( 'Month Streak', '☄️', 'Visit 30 days in a row' ),
		'year1'        => array( 'One-Year Member', '🎂', 'A member for 1 year' ),
		'top10'        => array( 'Top Designer', '🏆', 'Finish a month in the top 10 on the leaderboard' ),
		'ai_artist'    => array( 'AI Artist', '✨', 'Create your first Dreamscape AI design' ),
	);
}

/** Name styles unlocked by level / badges. id => [label, unlocked?] */
function dreamscaper_styles_for( $uid ) {
	$lvl    = dreamscaper_level( (int) get_user_meta( $uid, 'dscp_pts_total', true ) )['n'];
	$badges = dreamscaper_user_badges( $uid );
	return array(
		'plain'   => array( 'Classic', true ),
		'green'   => array( 'Leaf green', $lvl >= 3 ),
		'gold'    => array( 'Gold', $lvl >= 5 ),
		'rainbow' => array( 'Blooming gradient', $lvl >= 6 ),
		'legend'  => array( 'Legend glow', $lvl >= 7 || isset( $badges['top10'] ) ),
	);
}
/** Titles a member may show under their name. */
function dreamscaper_titles_for( $uid ) {
	$total = (int) get_user_meta( $uid, 'dscp_pts_total', true );
	$out   = array();
	foreach ( dreamscaper_levels() as $l ) {
		if ( $total >= $l[0] ) {
			$out[ 'lvl:' . $l[1] ] = $l[2] . ' ' . $l[1];
		}
	}
	$all = dreamscaper_badges();
	foreach ( dreamscaper_user_badges( $uid ) as $id => $at ) {
		if ( isset( $all[ $id ] ) ) {
			$out[ 'badge:' . $id ] = $all[ $id ][1] . ' ' . $all[ $id ][0];
		}
	}
	return $out;
}

function dreamscaper_user_badges( $uid ) {
	$b = get_user_meta( $uid, 'dscp_badges', true );
	return is_array( $b ) ? $b : array();
}

/** Public card for a member (never email/phone/address). */
function dreamscaper_member( $uid, $full = false ) {
	$u = get_userdata( $uid );
	if ( ! $u ) {
		return array( 'id' => 0, 'name' => 'Former member', 'avatar' => '', 'level' => dreamscaper_level( 0 ), 'style' => 'plain', 'title' => '' );
	}
	$total  = (int) get_user_meta( $uid, 'dscp_pts_total', true );
	$name   = (string) get_user_meta( $uid, 'dscp_handle', true );
	if ( '' === $name ) {
		$parts = preg_split( '/\s+/', trim( $u->display_name ) );
		$name  = $parts[0] . ( count( $parts ) > 1 ? ' ' . strtoupper( mb_substr( end( $parts ), 0, 1 ) ) . '.' : '' );
	}
	$style  = (string) get_user_meta( $uid, 'dscp_style', true );
	$styles = dreamscaper_styles_for( $uid );
	if ( ! isset( $styles[ $style ] ) || ! $styles[ $style ][1] ) {
		$style = 'plain';
	}
	$title  = (string) get_user_meta( $uid, 'dscp_title', true );
	$titles = dreamscaper_titles_for( $uid );
	$level  = dreamscaper_level( $total );
	$out    = array(
		'id'     => (int) $uid,
		'name'   => $name,
		'avatar' => (string) get_user_meta( $uid, 'dscp_avatar', true ),
		'level'  => $level,
		'style'  => $style,
		'title'  => isset( $titles[ $title ] ) ? $titles[ $title ] : $level['emoji'] . ' ' . $level['name'],
		'staff'  => user_can( $uid, 'manage_options' ),
	);
	if ( $full ) {
		global $wpdb;
		$out['bio']       = (string) get_user_meta( $uid, 'dscp_bio', true );
		$out['joined']    = strtotime( $u->user_registered ) * 1000;
		$out['points']    = $total;
		$out['badges']    = array();
		$all              = dreamscaper_badges();
		foreach ( dreamscaper_user_badges( $uid ) as $id => $at ) {
			if ( isset( $all[ $id ] ) ) {
				$out['badges'][] = array( 'id' => $id, 'name' => $all[ $id ][0], 'emoji' => $all[ $id ][1], 'how' => $all[ $id ][2], 'at' => $at * 1000 );
			}
		}
		$out['followers'] = (int) $wpdb->get_var( $wpdb->prepare( 'SELECT COUNT(*) FROM ' . dreamscaper_t( 'follows' ) . ' WHERE followee=%d', $uid ) );
		$out['following'] = (int) $wpdb->get_var( $wpdb->prepare( 'SELECT COUNT(*) FROM ' . dreamscaper_t( 'follows' ) . ' WHERE follower=%d', $uid ) );
		$out['posts']     = (int) $wpdb->get_var( $wpdb->prepare( 'SELECT COUNT(*) FROM ' . dreamscaper_t( 'posts' ) . " WHERE user_id=%d AND status='live'", $uid ) );
		$out['friends']   = (int) $wpdb->get_var( $wpdb->prepare( 'SELECT COUNT(*) FROM ' . dreamscaper_t( 'friends' ) . " WHERE (a=%d OR b=%d) AND status='accepted'", $uid, $uid ) );
	}
	return $out;
}

/* ---------------------------------------------------------------- points */

/** action => [setting key for points, max per day (0 = no cap), once ever] */
function dreamscaper_point_rules() {
	return array(
		'signin'       => array( 'pts_signin', 1, false ),
		'first_design' => array( 'pts_first_design', 0, true ),
		'design'       => array( 'pts_design', 3, false ),
		'post'         => array( 'pts_post', 3, false ),
		'like_got'     => array( 'pts_like', 25, false ),
		'comment'      => array( 'pts_comment', 10, false ),
		'help'         => array( 'pts_help', 5, false ),
		'first_id'     => array( 'pts_plantid_first', 0, true ),
		'plantid'      => array( 'pts_plantid', 5, false ),
		'share'        => array( 'pts_share', 3, false ),
		'profile'      => array( 'pts_profile', 0, true ),
		'first_ai'     => array( 'pts_first_ai', 0, true ),
		'rating_got'   => array( 'pts_rating', 20, false ),
		'follow_got'   => array( 'pts_follow', 20, false ),
	);
}
function dreamscaper_point_labels() {
	return array(
		'signin' => 'Daily visit', 'first_design' => 'Your first Dreamscape', 'design' => 'New Dreamscape', 'post' => 'Shared a design',
		'like_got' => 'Someone liked your post', 'comment' => 'Joined the conversation', 'help' => 'Helped a neighbor with ideas',
		'first_id' => 'Your first Plant ID', 'plantid' => 'Identified a plant', 'share' => 'Shared on social media', 'profile' => 'Completed your profile',
		'first_ai' => 'Your first AI design', 'rating_got' => 'Your design got a great rating', 'follow_got' => 'New follower',
		'redeem' => 'Traded for a reward', 'admin' => 'Bonus from the team',
	);
}

/**
 * Give points for an action, respecting daily caps and once-only rules.
 * Returns points awarded (0 if none). Rewards are collected for the REST response.
 */
function dreamscaper_award( $uid, $action, $ref = '' ) {
	global $wpdb;
	if ( ! $uid || ! dreamscaper_opt( 'community_on' ) || get_user_meta( $uid, 'dscp_banned', true ) ) {
		return 0;
	}
	$rules = dreamscaper_point_rules();
	if ( ! isset( $rules[ $action ] ) ) {
		return 0;
	}
	list( $key, $cap, $once ) = $rules[ $action ];
	$pts = (int) dreamscaper_opt( $key );
	if ( $pts <= 0 ) {
		return 0;
	}
	$t = dreamscaper_t( 'points' );
	if ( $once && $wpdb->get_var( $wpdb->prepare( "SELECT id FROM $t WHERE user_id=%d AND action=%s LIMIT 1", $uid, $action ) ) ) {
		return 0;
	}
	if ( $ref && $wpdb->get_var( $wpdb->prepare( "SELECT id FROM $t WHERE user_id=%d AND action=%s AND ref=%s LIMIT 1", $uid, $action, $ref ) ) ) {
		return 0; // e.g. the same like counted twice
	}
	if ( $cap ) {
		$n = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM $t WHERE user_id=%d AND action=%s AND created > %s", $uid, $action, gmdate( 'Y-m-d H:i:s', time() - DAY_IN_SECONDS ) ) );
		if ( $n >= $cap ) {
			return 0;
		}
	}
	$wpdb->insert( $t, array( 'user_id' => $uid, 'action' => $action, 'points' => $pts, 'ref' => substr( (string) $ref, 0, 40 ), 'created' => dreamscaper_now() ) );
	dreamscaper_points_add( $uid, $pts );
	$labels = dreamscaper_point_labels();
	dreamscaper_reward_out( $uid, array( 'points' => $pts, 'why' => isset( $labels[ $action ] ) ? $labels[ $action ] : '' ) );
	dreamscaper_check_badges( $uid );
	return $pts;
}

function dreamscaper_points_add( $uid, $pts ) {
	$before = (int) get_user_meta( $uid, 'dscp_pts_total', true );
	update_user_meta( $uid, 'dscp_pts', max( 0, (int) get_user_meta( $uid, 'dscp_pts', true ) + $pts ) );
	if ( $pts > 0 ) {
		update_user_meta( $uid, 'dscp_pts_total', $before + $pts );
		$l0 = dreamscaper_level( $before );
		$l1 = dreamscaper_level( $before + $pts );
		if ( $l1['n'] > $l0['n'] ) {
			dreamscaper_note( $uid, 'level', 0, 0, 'You reached level ' . $l1['n'] . ': ' . $l1['emoji'] . ' ' . $l1['name'] . '!' );
			dreamscaper_reward_out( $uid, array( 'level' => $l1 ) );
		}
	}
}

/** Rewards for the person making this request are sent back with the response. */
function dreamscaper_reward_out( $uid, $r ) {
	if ( get_current_user_id() === (int) $uid ) {
		$GLOBALS['dscp_rewards'][] = $r;
	}
}
add_filter( 'rest_post_dispatch', function ( $res, $server, $req ) {
	if ( ! empty( $GLOBALS['dscp_rewards'] ) && 0 === strpos( $req->get_route(), '/dreamscaper/v1' ) && $res instanceof WP_REST_Response ) {
		$d = $res->get_data();
		if ( is_array( $d ) ) {
			$d['rewards'] = $GLOBALS['dscp_rewards'];
			$res->set_data( $d );
		}
		$GLOBALS['dscp_rewards'] = array();
	}
	return $res;
}, 10, 3 );

function dreamscaper_give_badge( $uid, $id ) {
	$b = dreamscaper_user_badges( $uid );
	if ( isset( $b[ $id ] ) ) {
		return;
	}
	$b[ $id ] = time();
	update_user_meta( $uid, 'dscp_badges', $b );
	$all = dreamscaper_badges();
	if ( isset( $all[ $id ] ) ) {
		dreamscaper_note( $uid, 'badge', 0, 0, 'New badge: ' . $all[ $id ][1] . ' ' . $all[ $id ][0] . '!' );
		dreamscaper_reward_out( $uid, array( 'badge' => array( 'id' => $id, 'name' => $all[ $id ][0], 'emoji' => $all[ $id ][1] ) ) );
	}
}

function dreamscaper_check_badges( $uid ) {
	global $wpdb;
	$t   = dreamscaper_t( 'points' );
	$cnt = function ( $action ) use ( $wpdb, $t, $uid ) {
		return (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM $t WHERE user_id=%d AND action=%s", $uid, $action ) );
	};
	if ( $cnt( 'first_design' ) ) {
		dreamscaper_give_badge( $uid, 'first_design' );
	}
	if ( $cnt( 'first_id' ) ) {
		dreamscaper_give_badge( $uid, 'first_id' );
	}
	if ( $cnt( 'first_ai' ) ) {
		dreamscaper_give_badge( $uid, 'ai_artist' );
	}
	if ( $cnt( 'first_id' ) + $cnt( 'plantid' ) >= 25 ) {
		dreamscaper_give_badge( $uid, 'detective' );
	}
	$P     = dreamscaper_t( 'posts' );
	$posts = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM $P WHERE user_id=%d AND kind='design' AND status<>'removed'", $uid ) );
	if ( $posts >= 1 ) {
		dreamscaper_give_badge( $uid, 'first_post' );
	}
	if ( $posts >= 10 ) {
		dreamscaper_give_badge( $uid, 'prolific' );
	}
	if ( (int) $wpdb->get_var( $wpdb->prepare( "SELECT MAX(likes) FROM $P WHERE user_id=%d", $uid ) ) >= 25 ) {
		dreamscaper_give_badge( $uid, 'favorite' );
	}
	if ( $wpdb->get_var( $wpdb->prepare( "SELECT id FROM $P WHERE user_id=%d AND rating_n>=5 AND rating_sum/rating_n>=4.5 LIMIT 1", $uid ) ) ) {
		dreamscaper_give_badge( $uid, 'five_star' );
	}
	if ( $cnt( 'help' ) >= 5 ) {
		dreamscaper_give_badge( $uid, 'helper' );
	}
	$F = dreamscaper_t( 'follows' );
	if ( (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM $F WHERE follower=%d", $uid ) ) >= 10 ) {
		dreamscaper_give_badge( $uid, 'social' );
	}
	if ( (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM $F WHERE followee=%d", $uid ) ) >= 25 ) {
		dreamscaper_give_badge( $uid, 'popular' );
	}
	if ( (int) $wpdb->get_var( $wpdb->prepare( 'SELECT COUNT(*) FROM ' . dreamscaper_t( 'ratings' ) . ' WHERE user_id=%d', $uid ) ) >= 20 ) {
		dreamscaper_give_badge( $uid, 'critic' );
	}
	$streak = (int) get_user_meta( $uid, 'dscp_streak', true );
	if ( $streak >= 7 ) {
		dreamscaper_give_badge( $uid, 'streak7' );
	}
	if ( $streak >= 30 ) {
		dreamscaper_give_badge( $uid, 'streak30' );
	}
	$u = get_userdata( $uid );
	if ( $u && time() - strtotime( $u->user_registered ) >= YEAR_IN_SECONDS ) {
		dreamscaper_give_badge( $uid, 'year1' );
	}
}

/** Daily visit: points + streak (called when the app loads the session). */
function dreamscaper_daily_visit( $uid ) {
	if ( ! $uid || ! dreamscaper_opt( 'community_on' ) ) {
		return;
	}
	$today = gmdate( 'Y-m-d', current_time( 'timestamp' ) );
	$last  = (string) get_user_meta( $uid, 'dscp_last_day', true );
	if ( $last === $today ) {
		return;
	}
	$yday = gmdate( 'Y-m-d', current_time( 'timestamp' ) - DAY_IN_SECONDS );
	update_user_meta( $uid, 'dscp_streak', $last === $yday ? (int) get_user_meta( $uid, 'dscp_streak', true ) + 1 : 1 );
	update_user_meta( $uid, 'dscp_last_day', $today );
	dreamscaper_award( $uid, 'signin', $today );
}

/* ---------------------------------------------------------- notifications */

function dreamscaper_note( $uid, $type, $actor, $target, $text ) {
	global $wpdb;
	if ( ! $uid || (int) $uid === (int) $actor ) {
		return;
	}
	$wpdb->insert( dreamscaper_t( 'notes' ), array( 'user_id' => $uid, 'type' => $type, 'actor' => (int) $actor, 'target' => (int) $target, 'text' => mb_substr( $text, 0, 250 ), 'created' => dreamscaper_now() ) );
	// email, if the member wants it for this kind of notice
	$prefs = dreamscaper_notify_prefs( $uid );
	$map   = array( 'message' => 'email_messages', 'comment' => 'email_comments', 'reply' => 'email_comments', 'follow' => 'email_social', 'friend' => 'email_social', 'friend_ok' => 'email_social' );
	if ( dreamscaper_opt( 'community_email' ) && isset( $map[ $type ] ) && ! empty( $prefs[ $map[ $type ] ] ) ) {
		$u    = get_userdata( $uid );
		$last = (int) get_user_meta( $uid, 'dscp_last_mail_' . $type, true );
		if ( $u && is_email( $u->user_email ) && ! preg_match( '/invalid$/', $u->user_email ) && time() - $last > 15 * MINUTE_IN_SECONDS ) {
			update_user_meta( $uid, 'dscp_last_mail_' . $type, time() );
			$page = get_option( 'dreamscaper_page' ) ? get_permalink( (int) get_option( 'dreamscaper_page' ) ) : home_url( '/' );
			wp_mail( $u->user_email, 'DreamScaper: ' . $text, $text . "\n\nOpen DreamScaper to see it: " . $page . "#dreamscaper\n\nYou can change these emails in DreamScaper → My Account → Notifications." );
		}
	}
}

function dreamscaper_notify_prefs( $uid ) {
	$p = get_user_meta( $uid, 'dscp_notify', true );
	return wp_parse_args( is_array( $p ) ? $p : array(), array( 'email_messages' => 1, 'email_comments' => 1, 'email_social' => 0 ) );
}

function dreamscaper_unread( $uid ) {
	global $wpdb;
	return array(
		'notes' => (int) $wpdb->get_var( $wpdb->prepare( 'SELECT COUNT(*) FROM ' . dreamscaper_t( 'notes' ) . ' WHERE user_id=%d AND read_at IS NULL', $uid ) ),
		'msgs'  => function_exists( 'dreamscaper_inbox_unread' ) && get_option( 'dreamscaper_inbox_migrated' ) ? dreamscaper_inbox_unread( $uid )['total'] : (int) $wpdb->get_var( $wpdb->prepare( 'SELECT COUNT(*) FROM ' . dreamscaper_t( 'messages' ) . ' WHERE to_id=%d AND read_at IS NULL', $uid ) ),
	);
}

/** Session summary for the app. */
function dreamscaper_community_status( $uid ) {
	if ( ! dreamscaper_opt( 'community_on' ) ) {
		return array( 'on' => false );
	}
	if ( ! $uid ) {
		return array( 'on' => true );
	}
	dreamscaper_daily_visit( $uid );
	$rewards = isset( $GLOBALS['dscp_rewards'] ) ? $GLOBALS['dscp_rewards'] : array();
	$GLOBALS['dscp_rewards'] = array();
	$total = (int) get_user_meta( $uid, 'dscp_pts_total', true );
	return array(
		'rewards' => $rewards,
		'on'      => true,
		'me'      => dreamscaper_member( $uid ),
		'points'  => (int) get_user_meta( $uid, 'dscp_pts', true ),
		'total'   => $total,
		'level'   => dreamscaper_level( $total ),
		'unread'  => dreamscaper_unread( $uid ),
		'banned'  => (bool) get_user_meta( $uid, 'dscp_banned', true ),
		'redeem'  => array(
			'credit_pts'  => (int) dreamscaper_opt( 'redeem_credit_pts' ),
			'storage_pts' => (int) dreamscaper_opt( 'redeem_storage_pts' ),
			'storage_mb'  => (int) dreamscaper_opt( 'redeem_storage_mb' ),
		),
	);
}

require_once __DIR__ . '/community-api.php';

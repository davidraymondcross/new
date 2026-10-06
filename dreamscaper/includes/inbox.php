<?php
/**
 * DreamScaper – Inbox: one place for every conversation.
 *
 *  - member threads: homeowner ↔ homeowner (community direct messages, migrated from 2.6)
 *  - hire threads:   homeowner ↔ contractor, attached to a project (quote request / quote / job)
 *
 * Each message alerts the other side in-app (badge + notification), by email (at most one per
 * conversation every 15 minutes while it stays unread) and — for contractors who want it — by text.
 * Routes: /inbox, /inbox/thread, /inbox/send, /inbox/update, /inbox/start, /inbox/unread.
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'DREAMSCAPER_INBOX_DB', 1 );

function dreamscaper_inbox_install_db() {
	global $wpdb;
	require_once ABSPATH . 'wp-admin/includes/upgrade.php';
	$c = $wpdb->get_charset_collate();
	dbDelta( 'CREATE TABLE ' . dreamscaper_t( 'threads' ) . " (
		id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
		kind varchar(10) NOT NULL DEFAULT 'member',
		subject varchar(160) NOT NULL DEFAULT '',
		user_a bigint(20) unsigned NOT NULL DEFAULT 0,
		user_b bigint(20) unsigned NOT NULL DEFAULT 0,
		pro_id bigint(20) unsigned NOT NULL DEFAULT 0,
		client_id bigint(20) unsigned NOT NULL DEFAULT 0,
		quote_id bigint(20) unsigned NOT NULL DEFAULT 0,
		status varchar(10) NOT NULL DEFAULT 'open',
		last_at datetime NOT NULL,
		last_user bigint(20) unsigned NOT NULL DEFAULT 0,
		last_text varchar(200) NOT NULL DEFAULT '',
		msgs int(11) NOT NULL DEFAULT 0,
		created datetime NOT NULL,
		PRIMARY KEY  (id),
		KEY pair (user_a,user_b,kind,quote_id),
		KEY pro_last (pro_id,last_at),
		KEY quote_id (quote_id)
	) $c;" );
	dbDelta( 'CREATE TABLE ' . dreamscaper_t( 'thread_users' ) . " (
		thread_id bigint(20) unsigned NOT NULL,
		user_id bigint(20) unsigned NOT NULL,
		role varchar(10) NOT NULL DEFAULT 'member',
		unread int(11) NOT NULL DEFAULT 0,
		last_read_at datetime DEFAULT NULL,
		muted tinyint(1) NOT NULL DEFAULT 0,
		archived tinyint(1) NOT NULL DEFAULT 0,
		state varchar(10) NOT NULL DEFAULT '',
		first_reply_at datetime DEFAULT NULL,
		notified_at datetime DEFAULT NULL,
		PRIMARY KEY  (thread_id,user_id),
		KEY user_list (user_id,archived,unread)
	) $c;" );
	// 2.7 columns on the 2.6 messages table (old rows keep working: thread_id 0 until migrated)
	dbDelta( 'CREATE TABLE ' . dreamscaper_t( 'messages' ) . " (
		id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
		from_id bigint(20) unsigned NOT NULL,
		to_id bigint(20) unsigned NOT NULL,
		body text NOT NULL,
		created datetime NOT NULL,
		read_at datetime DEFAULT NULL,
		thread_id bigint(20) unsigned NOT NULL DEFAULT 0,
		kind varchar(10) NOT NULL DEFAULT 'text',
		attach text,
		ref_type varchar(10) NOT NULL DEFAULT '',
		ref_id bigint(20) unsigned NOT NULL DEFAULT 0,
		deleted_at datetime DEFAULT NULL,
		PRIMARY KEY  (id),
		KEY pair (from_id,to_id),
		KEY to_read (to_id,read_at),
		KEY thread (thread_id,id)
	) $c;" );
	update_option( 'dreamscaper_inbox_db', DREAMSCAPER_INBOX_DB );
}
add_action( 'init', function () {
	if ( (int) get_option( 'dreamscaper_inbox_db' ) !== DREAMSCAPER_INBOX_DB && (int) get_option( 'dreamscaper_db' ) ) {
		dreamscaper_inbox_install_db();
	}
	if ( (int) get_option( 'dreamscaper_inbox_db' ) && ! get_option( 'dreamscaper_inbox_migrated' ) ) {
		dreamscaper_inbox_migrate();
	}
}, 12 );

/**
 * Move 2.6 direct messages into member threads, a batch at a time (safe to run on every request
 * until done; a short lock stops two requests doing the same batch).
 */
function dreamscaper_inbox_migrate( $batch = 1500 ) {
	global $wpdb;
	if ( get_transient( 'dscp_inbox_mig_lock' ) ) {
		return false;
	}
	set_transient( 'dscp_inbox_mig_lock', 1, 60 );
	$M    = dreamscaper_t( 'messages' );
	$rows = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM $M WHERE thread_id=0 ORDER BY id LIMIT %d", $batch ) );
	$touched = array();
	foreach ( $rows as $m ) {
		$tid = dreamscaper_thread_member( (int) $m->from_id, (int) $m->to_id, true, $m->created );
		$wpdb->update( $M, array( 'thread_id' => $tid ), array( 'id' => $m->id ) );
		$touched[ $tid ] = 1;
	}
	foreach ( array_keys( $touched ) as $tid ) {
		dreamscaper_thread_recount( $tid );
	}
	delete_transient( 'dscp_inbox_mig_lock' );
	if ( count( $rows ) < $batch ) {
		update_option( 'dreamscaper_inbox_migrated', time() );
		return true;
	}
	return false;
}

/** Rebuild a thread's summary and each member's unread count from its messages. */
function dreamscaper_thread_recount( $tid ) {
	global $wpdb;
	$M    = dreamscaper_t( 'messages' );
	$last = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $M WHERE thread_id=%d AND deleted_at IS NULL ORDER BY id DESC LIMIT 1", $tid ) );
	$n    = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM $M WHERE thread_id=%d AND deleted_at IS NULL", $tid ) );
	if ( $last ) {
		$wpdb->update( dreamscaper_t( 'threads' ), array( 'last_at' => $last->created, 'last_user' => $last->from_id, 'last_text' => mb_substr( wp_strip_all_tags( $last->body ), 0, 190 ), 'msgs' => $n ), array( 'id' => $tid ) );
	}
	foreach ( $wpdb->get_col( $wpdb->prepare( 'SELECT user_id FROM ' . dreamscaper_t( 'thread_users' ) . ' WHERE thread_id=%d', $tid ) ) as $uid ) {
		$un = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM $M WHERE thread_id=%d AND from_id<>%d AND deleted_at IS NULL AND read_at IS NULL", $tid, $uid ) );
		$wpdb->update( dreamscaper_t( 'thread_users' ), array( 'unread' => $un ), array( 'thread_id' => $tid, 'user_id' => $uid ) );
	}
}

/* ---------------------------------------------------------------- threads */

function dreamscaper_thread_row( $tid ) {
	global $wpdb;
	return $tid ? $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( 'threads' ) . ' WHERE id=%d', $tid ) ) : null;
}
function dreamscaper_thread_member_row( $tid, $uid ) {
	global $wpdb;
	return $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( 'thread_users' ) . ' WHERE thread_id=%d AND user_id=%d', $tid, $uid ) );
}
function dreamscaper_thread_add_user( $tid, $uid, $role ) {
	global $wpdb;
	if ( ! $uid ) {
		return;
	}
	$wpdb->query( $wpdb->prepare( 'INSERT IGNORE INTO ' . dreamscaper_t( 'thread_users' ) . ' (thread_id,user_id,role,unread) VALUES (%d,%d,%s,0)', $tid, $uid, $role ) );
}

/** The one member thread between two people (created on demand). */
function dreamscaper_thread_member( $a, $b, $create = true, $at = null ) {
	global $wpdb;
	$x  = min( $a, $b );
	$y  = max( $a, $b );
	$id = (int) $wpdb->get_var( $wpdb->prepare( 'SELECT id FROM ' . dreamscaper_t( 'threads' ) . " WHERE user_a=%d AND user_b=%d AND kind='member' LIMIT 1", $x, $y ) );
	if ( $id || ! $create ) {
		return $id;
	}
	$now = $at ? $at : dreamscaper_now();
	$wpdb->insert( dreamscaper_t( 'threads' ), array( 'kind' => 'member', 'user_a' => $x, 'user_b' => $y, 'last_at' => $now, 'created' => $now ) );
	$id = (int) $wpdb->insert_id;
	dreamscaper_thread_add_user( $id, $a, 'member' );
	dreamscaper_thread_add_user( $id, $b, 'member' );
	return $id;
}

/**
 * The hire thread between a homeowner and a contractor about one project (quote_id),
 * or their general thread (quote_id 0). Created on demand.
 */
function dreamscaper_thread_hire( $pro_id, $user_id, $quote_id = 0, $client_id = 0, $subject = '' ) {
	global $wpdb;
	$T  = dreamscaper_t( 'threads' );
	$id = (int) $wpdb->get_var( $wpdb->prepare( "SELECT id FROM $T WHERE kind='hire' AND pro_id=%d AND user_b=%d AND quote_id=%d LIMIT 1", $pro_id, $user_id, $quote_id ) );
	if ( $id ) {
		return $id;
	}
	$now = dreamscaper_now();
	$wpdb->insert( $T, array( 'kind' => 'hire', 'subject' => mb_substr( $subject, 0, 160 ), 'user_a' => $pro_id, 'user_b' => $user_id, 'pro_id' => $pro_id, 'client_id' => $client_id, 'quote_id' => $quote_id, 'last_at' => $now, 'created' => $now ) );
	$id = (int) $wpdb->insert_id;
	dreamscaper_thread_add_user( $id, $pro_id, 'pro' );
	if ( $user_id ) {
		dreamscaper_thread_add_user( $id, $user_id, 'customer' );
	}
	$wpdb->update( dreamscaper_t( 'thread_users' ), array( 'state' => 'new' ), array( 'thread_id' => $id, 'user_id' => $pro_id ) );
	return $id;
}

/** The hire thread for a quote, if the customer has a DreamScaper account (else 0). */
function dreamscaper_thread_for_quote( $q ) {
	if ( ! $q ) {
		return 0;
	}
	$uid = (int) $q->user_id;
	if ( ! $uid && $q->client_id ) {
		$c   = dreamscaper_crm_get( 'clients', $q->client_id, $q->pro_id );
		$uid = $c ? (int) $c->user_id : 0;
	}
	return $uid ? dreamscaper_thread_hire( (int) $q->pro_id, $uid, (int) $q->id, (int) $q->client_id, $q->title ) : 0;
}
/** The general hire thread for a client (no specific project). */
function dreamscaper_thread_for_client( $c ) {
	return $c && $c->user_id ? dreamscaper_thread_hire( (int) $c->pro_id, (int) $c->user_id, 0, (int) $c->id, '' ) : 0;
}

function dreamscaper_thread_users( $tid ) {
	global $wpdb;
	return $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( 'thread_users' ) . ' WHERE thread_id=%d', $tid ) );
}

/**
 * Add a message to a thread.
 * $o: kind (text|auto|system|brief|file), attach (array of {url,name}), ref_type, ref_id, notify (default true).
 * Returns the message id.
 */
function dreamscaper_thread_post( $tid, $from, $body, $o = array() ) {
	global $wpdb;
	$t = dreamscaper_thread_row( $tid );
	if ( ! $t ) {
		return 0;
	}
	$now   = dreamscaper_now();
	$users = dreamscaper_thread_users( $tid );
	$to    = 0;
	foreach ( $users as $u ) {
		if ( (int) $u->user_id !== (int) $from ) {
			$to = (int) $u->user_id;
		}
	}
	$kind = isset( $o['kind'] ) ? $o['kind'] : 'text';
	$wpdb->insert( dreamscaper_t( 'messages' ), array(
		'from_id' => (int) $from, 'to_id' => 2 === count( $users ) ? $to : 0, 'body' => (string) $body, 'created' => $now,
		'thread_id' => $tid, 'kind' => $kind, 'attach' => ! empty( $o['attach'] ) ? wp_json_encode( $o['attach'] ) : '',
		'ref_type' => isset( $o['ref_type'] ) ? substr( $o['ref_type'], 0, 10 ) : '', 'ref_id' => isset( $o['ref_id'] ) ? (int) $o['ref_id'] : 0,
	) );
	$mid = (int) $wpdb->insert_id;
	$preview = mb_substr( trim( preg_replace( '/\s+/', ' ', wp_strip_all_tags( $body ) ) ), 0, 190 );
	if ( '' === $preview && ! empty( $o['attach'] ) ) {
		$preview = '📷 Photo';
	}
	$wpdb->query( $wpdb->prepare( 'UPDATE ' . dreamscaper_t( 'threads' ) . ' SET last_at=%s, last_user=%d, last_text=%s, msgs=msgs+1 WHERE id=%d', $now, $from, $preview, $tid ) );
	$TU = dreamscaper_t( 'thread_users' );
	$wpdb->query( $wpdb->prepare( "UPDATE $TU SET unread=unread+1, archived=0 WHERE thread_id=%d AND user_id<>%d", $tid, $from ) );
	$wpdb->query( $wpdb->prepare( "UPDATE $TU SET unread=0, last_read_at=%s WHERE thread_id=%d AND user_id=%d", $now, $tid, $from ) );
	// contractor reply bookkeeping (first reply time, waiting/replied state)
	if ( 'hire' === $t->kind && 'auto' !== $kind && 'system' !== $kind ) {
		if ( (int) $from === (int) $t->pro_id ) {
			$wpdb->query( $wpdb->prepare( "UPDATE $TU SET state='replied', first_reply_at=COALESCE(first_reply_at,%s) WHERE thread_id=%d AND user_id=%d", $now, $tid, $from ) );
		} else {
			$cur  = (string) $wpdb->get_var( $wpdb->prepare( "SELECT state FROM $TU WHERE thread_id=%d AND user_id=%d", $tid, $t->pro_id ) );
			$next = array( '' => 'new', 'done' => 'new', 'replied' => 'waiting' );
			if ( isset( $next[ $cur ] ) ) {
				$wpdb->update( $TU, array( 'state' => $next[ $cur ] ), array( 'thread_id' => $tid, 'user_id' => (int) $t->pro_id ) );
			}
		}
	}
	if ( ! isset( $o['notify'] ) || $o['notify'] ) {
		foreach ( $users as $u ) {
			if ( (int) $u->user_id !== (int) $from && ! $u->muted ) {
				dreamscaper_thread_alert( $t, (int) $from, (int) $u->user_id, $preview, $u );
			}
		}
	}
	return $mid;
}

/** Tell one participant about a new message: in-app always, email/text throttled. */
function dreamscaper_thread_alert( $t, $from, $uid, $preview, $tu ) {
	global $wpdb;
	$sender = get_userdata( $from );
	$sname  = $sender ? $sender->display_name : 'Someone';
	if ( 'hire' === $t->kind && (int) $from === (int) $t->pro_id ) {
		$pp    = dreamscaper_pro_row( $from );
		$sname = $pp ? $pp->business : $sname;
	}
	$wpdb->insert( dreamscaper_t( 'notes' ), array( 'user_id' => $uid, 'type' => 'message', 'actor' => $from, 'target' => (int) $t->id, 'text' => mb_substr( $sname . ': ' . $preview, 0, 250 ), 'created' => dreamscaper_now() ) );
	// one email per thread per 15 minutes while unread
	if ( $tu->notified_at && strtotime( $tu->notified_at . ' UTC' ) > time() - 15 * MINUTE_IN_SECONDS && (int) $tu->unread > 0 ) {
		return;
	}
	$wpdb->update( dreamscaper_t( 'thread_users' ), array( 'notified_at' => dreamscaper_now() ), array( 'thread_id' => $t->id, 'user_id' => $uid ) );
	$extra = array( 'sender_name' => $sname, 'message_preview' => mb_substr( $preview, 0, 160 ) );
	if ( 'hire' === $t->kind ) {
		$p = dreamscaper_pro_row( $t->pro_id );
		if ( ! $p ) {
			return;
		}
		$q = $t->quote_id ? dreamscaper_crm_get( 'quotes', $t->quote_id, $p->user_id ) : null;
		$c = $t->client_id ? dreamscaper_crm_get( 'clients', $t->client_id, $p->user_id ) : null;
		if ( (int) $uid === (int) $p->user_id ) {
			dreamscaper_tpl_send( $p, 'alert_new_message', array( 'quote' => $q, 'client' => $c ), array(), array( 'extra' => $extra, 'channels' => array_diff( dreamscaper_tpl_get( $p, 'alert_new_message' )['channels'], array( 'inapp' ) ), 'force' => true, 'hub' => 'inbox' ) );
		} else {
			$prefs = function_exists( 'dreamscaper_notify_prefs' ) ? dreamscaper_notify_prefs( $uid ) : array( 'email_messages' => 1 );
			$u     = get_userdata( $uid );
			if ( ! empty( $prefs['email_messages'] ) && $u && is_email( $u->user_email ) && ! preg_match( '/invalid$/', $u->user_email ) ) {
				dreamscaper_tpl_send( $p, 'new_message', array( 'quote' => $q, 'client' => $c ), array( 'email' => $u->user_email, 'user_id' => 0, 'name' => $u->display_name ), array( 'extra' => $extra, 'channels' => array( 'email' ), 'link' => dreamscaper_app_url( array( 'ds_inbox' => $t->id ) ), 'button' => 'Read & reply', 'force' => true ) );
			}
		}
		return;
	}
	// member thread: the community email preference
	$prefs = function_exists( 'dreamscaper_notify_prefs' ) ? dreamscaper_notify_prefs( $uid ) : array();
	$u     = get_userdata( $uid );
	if ( dreamscaper_opt( 'community_email' ) && ! empty( $prefs['email_messages'] ) && $u && is_email( $u->user_email ) && ! preg_match( '/invalid$/', $u->user_email ) ) {
		$link = dreamscaper_app_url( array( 'ds_inbox' => $t->id ) );
		wp_mail( $u->user_email, $sname . ' sent you a message on DreamScaper', $sname . " wrote:\n\n“" . $preview . "”\n\nRead and reply: " . $link . "\n\n(Turn these emails off in DreamScaper → Messages → Settings.)" );
	}
}

/** Unread counts for the badge. */
function dreamscaper_inbox_unread( $uid ) {
	global $wpdb;
	if ( ! $uid || ! (int) get_option( 'dreamscaper_inbox_db' ) ) {
		return array( 'total' => 0, 'pros' => 0, 'members' => 0 );
	}
	$rows = $wpdb->get_results( $wpdb->prepare( 'SELECT t.kind, SUM(tu.unread) n FROM ' . dreamscaper_t( 'thread_users' ) . ' tu JOIN ' . dreamscaper_t( 'threads' ) . ' t ON t.id=tu.thread_id WHERE tu.user_id=%d AND tu.unread>0 GROUP BY t.kind', $uid ) );
	$out  = array( 'total' => 0, 'pros' => 0, 'members' => 0 );
	foreach ( $rows as $r ) {
		$out['total'] += (int) $r->n;
		if ( 'hire' === $r->kind ) {
			$out['pros'] += (int) $r->n;
		} else {
			$out['members'] += (int) $r->n;
		}
	}
	return $out;
}

/* ------------------------------------------------------------------- REST */

add_action( 'rest_api_init', function () {
	$auth = function () {
		return is_user_logged_in();
	};
	foreach ( array(
		array( '/inbox', 'GET', 'dreamscaper_rest_inbox' ),
		array( '/inbox/thread', 'GET', 'dreamscaper_rest_inbox_thread' ),
		array( '/inbox/send', 'POST', 'dreamscaper_rest_inbox_send' ),
		array( '/inbox/update', 'POST', 'dreamscaper_rest_inbox_update' ),
		array( '/inbox/start', 'POST', 'dreamscaper_rest_inbox_start' ),
		array( '/inbox/unread', 'GET', 'dreamscaper_rest_inbox_unread' ),
	) as $r ) {
		register_rest_route( 'dreamscaper/v1', $r[0], array( 'methods' => $r[1], 'callback' => $r[2], 'permission_callback' => $auth ) );
	}
} );

/** Who's on the other side of a thread, as the viewer sees them. */
function dreamscaper_thread_other( $t, $uid ) {
	if ( 'hire' === $t->kind ) {
		if ( (int) $uid === (int) $t->pro_id ) {
			$c    = $t->client_id ? dreamscaper_crm_get( 'clients', $t->client_id, $t->pro_id ) : null;
			$u    = get_userdata( $t->user_b );
			$name = $c ? $c->name : ( $u ? $u->display_name : 'Customer' );
			return array( 'id' => (int) $t->user_b, 'name' => $name, 'avatar' => $c && $c->photo ? $c->photo : '', 'role' => 'customer', 'client_id' => (int) $t->client_id, 'phone' => $c ? $c->phone : '' );
		}
		$p = dreamscaper_pro_row( $t->pro_id );
		return array( 'id' => (int) $t->pro_id, 'name' => $p ? $p->business : 'Contractor', 'avatar' => $p ? $p->logo : '', 'role' => 'pro', 'phone' => $p ? $p->phone : '' );
	}
	$other = (int) $t->user_a === (int) $uid ? (int) $t->user_b : (int) $t->user_a;
	$m     = function_exists( 'dreamscaper_member' ) ? dreamscaper_member( $other ) : array( 'id' => $other, 'name' => get_userdata( $other ) ? get_userdata( $other )->display_name : 'Member' );
	$m['role'] = 'member';
	$pro   = dreamscaper_pro_row( $other );
	if ( $pro && 'approved' === $pro->status ) {
		$m['business'] = $pro->business;
	}
	return $m;
}

function dreamscaper_thread_project( $t ) {
	if ( ! $t->quote_id ) {
		return null;
	}
	$q = dreamscaper_crm_get( 'quotes', $t->quote_id, $t->pro_id );
	return $q ? array( 'id' => (int) $q->id, 'title' => $q->title, 'number' => $q->number, 'status' => $q->status, 'job_status' => $q->job_status ) : null;
}

function dreamscaper_rest_inbox( WP_REST_Request $r ) {
	global $wpdb;
	$uid    = get_current_user_id();
	$filter = sanitize_key( (string) $r->get_param( 'filter' ) );
	$qtxt   = trim( sanitize_text_field( (string) $r->get_param( 'q' ) ) );
	$as_pro = (bool) $r->get_param( 'pro' );
	$T      = dreamscaper_t( 'threads' );
	$TU     = dreamscaper_t( 'thread_users' );
	$where  = $wpdb->prepare( 'tu.user_id=%d', $uid );
	if ( 'archived' === $filter ) {
		$where .= ' AND tu.archived=1';
	} else {
		$where .= ' AND tu.archived=0';
	}
	if ( 'unread' === $filter ) {
		$where .= ' AND tu.unread>0';
	} elseif ( 'pros' === $filter ) {
		$where .= $wpdb->prepare( " AND t.kind='hire' AND t.pro_id<>%d", $uid );
	} elseif ( 'community' === $filter ) {
		$where .= " AND t.kind='member'";
	} elseif ( 'projects' === $filter ) {
		$where .= ' AND t.quote_id>0';
	} elseif ( 'customers' === $filter ) {
		$where .= $wpdb->prepare( " AND t.kind='hire' AND t.pro_id=%d", $uid );
	} elseif ( 'needs_reply' === $filter ) {
		$where .= $wpdb->prepare( " AND t.kind='hire' AND t.pro_id=%d AND tu.state IN ('new','waiting')", $uid );
	}
	if ( $as_pro ) {
		$where .= $wpdb->prepare( " AND t.kind='hire' AND t.pro_id=%d", $uid );
	}
	if ( '' !== $qtxt ) {
		$like   = '%' . $wpdb->esc_like( $qtxt ) . '%';
		$where .= $wpdb->prepare( ' AND (t.subject LIKE %s OR t.last_text LIKE %s OR t.id IN (SELECT thread_id FROM ' . dreamscaper_t( 'messages' ) . ' WHERE body LIKE %s))', $like, $like, $like );
	}
	$rows  = $wpdb->get_results( "SELECT t.*, tu.unread, tu.muted, tu.archived, tu.state, tu.first_reply_at FROM $TU tu JOIN $T t ON t.id=tu.thread_id WHERE $where AND t.msgs>0 ORDER BY t.last_at DESC LIMIT 150" ); // phpcs:ignore
	$items = array();
	foreach ( $rows as $t ) {
		$items[] = array(
			'id' => (int) $t->id, 'kind' => $t->kind, 'subject' => $t->subject, 'with' => dreamscaper_thread_other( $t, $uid ), 'project' => dreamscaper_thread_project( $t ),
			'last' => $t->last_text, 'mine' => (int) $t->last_user === $uid, 'at' => dreamscaper_ms( $t->last_at ), 'unread' => (int) $t->unread,
			'muted' => (bool) $t->muted, 'archived' => (bool) $t->archived, 'state' => (int) $t->pro_id === $uid ? $t->state : '', 'as_pro' => (int) $t->pro_id === $uid && 'hire' === $t->kind,
			'since' => (int) $t->pro_id === $uid && in_array( $t->state, array( 'new', 'waiting' ), true ) ? dreamscaper_ms( $t->last_at ) : null,
		);
	}
	return array( 'items' => $items, 'unread' => dreamscaper_inbox_unread( $uid ) );
}

/** Context card for a hire thread: property, project, next appointment, money. */
function dreamscaper_thread_context( $t, $uid ) {
	global $wpdb;
	if ( 'hire' !== $t->kind ) {
		return null;
	}
	$p   = dreamscaper_pro_row( $t->pro_id );
	$q   = $t->quote_id ? dreamscaper_crm_get( 'quotes', $t->quote_id, $t->pro_id ) : null;
	$c   = $t->client_id ? dreamscaper_crm_get( 'clients', $t->client_id, $t->pro_id ) : null;
	$out = array( 'pro' => $p ? array( 'id' => (int) $p->user_id, 'business' => $p->business, 'phone' => $p->phone ) : null, 'is_pro' => (int) $uid === (int) $t->pro_id );
	if ( $q ) {
		$des  = dreamscaper_json( $q->design );
		$prop = $q->prop_id ? dreamscaper_crm_get( 'props', $q->prop_id, $q->pro_id ) : null;
		$out['project'] = array(
			'id' => (int) $q->id, 'title' => $q->title, 'number' => $q->number, 'status' => $q->status, 'job_status' => $q->job_status, 'total' => (float) $q->total,
			'link' => in_array( $q->status, array( 'sent', 'viewed', 'signed', 'expired', 'declined' ), true ) ? dreamscaper_quote_url( $q->token ) : '',
			'address' => $prop ? $prop->address : ( $c ? trim( $c->address . ', ' . $c->town, ', ' ) : '' ),
			'services' => ! empty( $des['brief']['services'] ) ? array_values( (array) $des['brief']['services'] ) : array(),
			'score' => isset( $des['brief']['score'] ) ? (int) $des['brief']['score'] : null,
			'missing' => ! empty( $des['brief']['missing'] ) ? array_values( (array) $des['brief']['missing'] ) : array(),
			'after' => isset( $des['after'] ) ? $des['after'] : '',
		);
		$v = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( 'visits' ) . " WHERE quote_id=%d AND status NOT IN ('cancelled','done') AND end >= %s ORDER BY start LIMIT 1", $q->id, dreamscaper_now() ) );
		if ( $v ) {
			$out['next'] = array( 'id' => (int) $v->id, 'title' => $v->title, 'kind' => isset( $v->kind ) ? $v->kind : 'job', 'start' => dreamscaper_ms( $v->start ), 'end' => dreamscaper_ms( $v->end ), 'cust_status' => isset( $v->cust_status ) ? $v->cust_status : '' );
		}
		$out['due'] = (float) $wpdb->get_var( $wpdb->prepare( 'SELECT COALESCE(SUM(amount),0) FROM ' . dreamscaper_t( 'invoices' ) . " WHERE quote_id=%d AND status='sent'", $q->id ) );
	}
	if ( $c && (int) $uid === (int) $t->pro_id ) {
		$out['client'] = array( 'id' => (int) $c->id, 'name' => $c->name, 'phone' => $c->phone, 'email' => $c->email );
	}
	return $out;
}

function dreamscaper_message_out( $m, $uid ) {
	return array(
		'id' => (int) $m->id, 'body' => $m->body, 'mine' => (int) $m->from_id === $uid, 'from' => (int) $m->from_id, 'kind' => $m->kind ? $m->kind : 'text',
		'attach' => $m->attach ? dreamscaper_json( $m->attach ) : array(), 'ref' => $m->ref_type ? array( 'type' => $m->ref_type, 'id' => (int) $m->ref_id ) : null,
		'at' => dreamscaper_ms( $m->created ),
	);
}

/** Resolve the thread the viewer asks for: ?id=, ?with=member, ?pro=contractor (general), ?quote= */
function dreamscaper_inbox_resolve( $r, $create = false ) {
	$uid = get_current_user_id();
	$tid = (int) $r->get_param( 'id' );
	if ( ! $tid && (int) $r->get_param( 'with' ) ) {
		$other = (int) $r->get_param( 'with' );
		if ( $other === $uid || ! get_userdata( $other ) ) {
			return dreamscaper_crm_err( 'Member not found.', 404 );
		}
		$tid = dreamscaper_thread_member( $uid, $other, $create );
		if ( ! $tid ) {
			return array( 'new' => true, 'with' => dreamscaper_member( $other ) );
		}
	}
	if ( ! $tid && (int) $r->get_param( 'quote' ) ) {
		global $wpdb;
		$q = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( 'quotes' ) . ' WHERE id=%d', (int) $r->get_param( 'quote' ) ) );
		if ( ! $q ) {
			return dreamscaper_crm_err( 'Project not found.', 404 );
		}
		$c = $q->client_id ? dreamscaper_crm_get( 'clients', $q->client_id, $q->pro_id ) : null;
		if ( (int) $q->pro_id !== $uid && (int) $q->user_id !== $uid && ! ( $c && (int) $c->user_id === $uid ) ) {
			return dreamscaper_crm_err( 'Project not found.', 404 );
		}
		$tid = dreamscaper_thread_for_quote( $q );
		if ( ! $tid ) {
			return dreamscaper_crm_err( 'This customer doesn’t have a DreamScaper account yet, so messages go by email or text from the customer’s page.', 409 );
		}
	}
	$t = dreamscaper_thread_row( $tid );
	if ( ! $t || ! dreamscaper_thread_member_row( $tid, $uid ) ) {
		return dreamscaper_crm_err( 'Conversation not found.', 404 );
	}
	return $t;
}

function dreamscaper_rest_inbox_thread( WP_REST_Request $r ) {
	global $wpdb;
	$uid = get_current_user_id();
	$t   = dreamscaper_inbox_resolve( $r );
	if ( is_wp_error( $t ) ) {
		return $t;
	}
	if ( is_array( $t ) ) {
		return array( 'id' => 0, 'kind' => 'member', 'with' => $t['with'], 'items' => array(), 'blocked' => false, 'unread' => dreamscaper_inbox_unread( $uid ) );
	}
	$M      = dreamscaper_t( 'messages' );
	$before = (int) $r->get_param( 'before' );
	$rows   = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM $M WHERE thread_id=%d AND deleted_at IS NULL" . ( $before ? ' AND id<%d' : ' AND id>%d' ) . ' ORDER BY id DESC LIMIT 80', $t->id, $before ) );
	$now    = dreamscaper_now();
	$wpdb->update( dreamscaper_t( 'thread_users' ), array( 'unread' => 0, 'last_read_at' => $now ), array( 'thread_id' => $t->id, 'user_id' => $uid ) );
	$wpdb->query( $wpdb->prepare( "UPDATE $M SET read_at=%s WHERE thread_id=%d AND from_id<>%d AND read_at IS NULL", $now, $t->id, $uid ) );
	$wpdb->query( $wpdb->prepare( 'UPDATE ' . dreamscaper_t( 'notes' ) . " SET read_at=%s WHERE user_id=%d AND type='message' AND target=%d AND read_at IS NULL", $now, $uid, $t->id ) );
	$other_read = null;
	foreach ( dreamscaper_thread_users( $t->id ) as $u ) {
		if ( (int) $u->user_id !== $uid ) {
			$other_read = dreamscaper_ms( $u->last_read_at );
		}
	}
	$me = dreamscaper_thread_member_row( $t->id, $uid );
	$other = dreamscaper_thread_other( $t, $uid );
	return array(
		'id' => (int) $t->id, 'kind' => $t->kind, 'subject' => $t->subject, 'with' => $other, 'context' => dreamscaper_thread_context( $t, $uid ),
		'items' => array_reverse( array_map( function ( $m ) use ( $uid ) { return dreamscaper_message_out( $m, $uid ); }, $rows ) ),
		'more' => count( $rows ) === 80, 'other_read' => $other_read, 'muted' => (bool) $me->muted, 'archived' => (bool) $me->archived, 'state' => $me->state,
		'blocked' => 'member' === $t->kind && function_exists( 'dreamscaper_is_blocked' ) ? dreamscaper_is_blocked( $uid, (int) $other['id'] ) : false,
		'unread' => dreamscaper_inbox_unread( $uid ),
	);
}

function dreamscaper_rest_inbox_send( WP_REST_Request $r ) {
	global $wpdb;
	$uid = get_current_user_id();
	$j   = $r->get_json_params();
	if ( ! dreamscaper_limit( 'msg', 120, HOUR_IN_SECONDS ) ) {
		return dreamscaper_crm_err( 'You’re sending messages very quickly. Please wait a few minutes.', 429 );
	}
	$req = new WP_REST_Request( 'GET' );
	foreach ( array( 'id', 'with', 'quote' ) as $k ) {
		if ( ! empty( $j[ $k ] ) ) {
			$req->set_param( $k, (int) $j[ $k ] );
		}
	}
	if ( ! empty( $j['pro'] ) ) {
		$p = dreamscaper_pro_row( (int) $j['pro'] );
		if ( ! $p || 'approved' !== $p->status || (int) $p->user_id === $uid ) {
			return dreamscaper_crm_err( 'Contractor not found.', 404 );
		}
		$req->set_param( 'id', dreamscaper_thread_hire( (int) $p->user_id, $uid, 0, 0, '' ) );
	}
	$t = dreamscaper_inbox_resolve( $req, true );
	if ( is_wp_error( $t ) ) {
		return $t;
	}
	if ( 'member' === $t->kind ) {
		$ok = dreamscaper_c_can();
		if ( is_wp_error( $ok ) ) {
			return $ok;
		}
		$other = (int) $t->user_a === $uid ? (int) $t->user_b : (int) $t->user_a;
		if ( dreamscaper_is_blocked( $uid, $other ) || dreamscaper_is_blocked( $other, $uid ) ) {
			return dreamscaper_crm_err( 'You can’t message this member.', 403 );
		}
	}
	if ( 'hire' === $t->kind && (int) $t->pro_id === $uid ) {
		$gate = function_exists( 'dreamscaper_pro_gate' ) ? dreamscaper_pro_gate( $uid ) : true;
		if ( is_wp_error( $gate ) ) {
			return $gate;
		}
	}
	// a contractor whose account is read-only or suspended can't reply, so homeowners aren't left waiting
	// (no billing details are ever shown to the homeowner)
	if ( 'hire' === $t->kind && (int) $t->pro_id !== $uid && function_exists( 'dreamscaper_pro_writable' ) && ! dreamscaper_pro_writable( (int) $t->pro_id ) && ! dreamscaper_is_owner_pro( (int) $t->pro_id ) ) {
		return dreamscaper_crm_err( 'This contractor isn’t replying through DreamScaper right now. You can request quotes from other contractors in Find a Contractor.', 403 );
	}
	$body = mb_substr( sanitize_textarea_field( isset( $j['body'] ) ? (string) $j['body'] : '' ), 0, 4000 );
	if ( function_exists( 'dreamscaper_text_ok' ) && ! dreamscaper_text_ok( $body ) ) {
		return dreamscaper_crm_err( 'Please keep messages friendly.' );
	}
	// brand-new accounts can't send links to strangers (spam)
	$u = get_userdata( $uid );
	if ( 'member' === $t->kind && $u && strtotime( $u->user_registered . ' UTC' ) > time() - DAY_IN_SECONDS && preg_match( '#https?://|www\.#i', $body ) ) {
		return dreamscaper_crm_err( 'New accounts can’t send links yet — please describe it instead.' );
	}
	$attach = array();
	foreach ( array_slice( (array) ( isset( $j['attach'] ) ? $j['attach'] : array() ), 0, 5 ) as $a ) {
		$url = is_array( $a ) && ! empty( $a['url'] ) ? dreamscaper_crm_store_image( $a['url'], 8 * MB_IN_BYTES ) : '';
		if ( $url ) {
			$attach[] = array( 'url' => $url, 'name' => mb_substr( sanitize_text_field( isset( $a['name'] ) ? $a['name'] : '' ), 0, 80 ) );
		}
	}
	if ( ! empty( $j['attach'] ) && ! $attach && ! empty( $GLOBALS['dscp_upload_err'] ) ) {
		return $GLOBALS['dscp_upload_err']; // storage full, or a large upload while a payment is outstanding
	}
	if ( '' === trim( $body ) && ! $attach ) {
		return dreamscaper_crm_err( 'Write a message first.' );
	}
	$ref_type = in_array( isset( $j['ref']['type'] ) ? $j['ref']['type'] : '', array( 'quote', 'invoice', 'visit', 'design' ), true ) ? $j['ref']['type'] : '';
	$mid = dreamscaper_thread_post( $t->id, $uid, $body, array( 'attach' => $attach, 'ref_type' => $ref_type, 'ref_id' => $ref_type ? (int) $j['ref']['id'] : 0 ) );
	if ( 'hire' === $t->kind && $t->pro_id && $t->client_id ) {
		dreamscaper_crm_log( $t->pro_id, $t->client_id, $t->quote_id, 'note', ( (int) $t->pro_id === $uid ? 'You messaged: ' : 'Customer messaged: ' ) . mb_substr( $body, 0, 300 ), $uid );
	}
	$m = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( 'messages' ) . ' WHERE id=%d', $mid ) );
	return array( 'id' => (int) $t->id, 'message' => dreamscaper_message_out( $m, $uid ) );
}

function dreamscaper_rest_inbox_update( WP_REST_Request $r ) {
	global $wpdb;
	$uid = get_current_user_id();
	$j   = $r->get_json_params();
	$tid = (int) ( isset( $j['id'] ) ? $j['id'] : 0 );
	$me  = dreamscaper_thread_member_row( $tid, $uid );
	if ( ! $me ) {
		return dreamscaper_crm_err( 'Conversation not found.', 404 );
	}
	$f = array();
	foreach ( array( 'muted', 'archived' ) as $k ) {
		if ( isset( $j[ $k ] ) ) {
			$f[ $k ] = $j[ $k ] ? 1 : 0;
		}
	}
	if ( isset( $j['state'] ) && in_array( $j['state'], array( 'new', 'replied', 'waiting', 'done', '' ), true ) ) {
		$f['state'] = $j['state'];
	}
	if ( ! empty( $j['unread'] ) ) {
		$f['unread'] = max( 1, (int) $me->unread );
	}
	if ( $f ) {
		$wpdb->update( dreamscaper_t( 'thread_users' ), $f, array( 'thread_id' => $tid, 'user_id' => $uid ) );
	}
	return array( 'ok' => true, 'unread' => dreamscaper_inbox_unread( $uid ) );
}

/** Open (or find) a conversation with a member or a contractor; returns its id (0 = not started yet). */
function dreamscaper_rest_inbox_start( WP_REST_Request $r ) {
	$uid = get_current_user_id();
	$j   = $r->get_json_params();
	if ( ! empty( $j['pro'] ) ) {
		$p = dreamscaper_pro_row( (int) $j['pro'] );
		if ( ! $p || 'approved' !== $p->status || (int) $p->user_id === $uid ) {
			return dreamscaper_crm_err( 'Contractor not found.', 404 );
		}
		return array( 'id' => dreamscaper_thread_hire( (int) $p->user_id, $uid, 0, 0, '' ) );
	}
	if ( ! empty( $j['with'] ) ) {
		return array( 'id' => dreamscaper_thread_member( $uid, (int) $j['with'], false ) );
	}
	if ( ! empty( $j['quote'] ) ) {
		$req = new WP_REST_Request( 'GET' );
		$req->set_param( 'quote', (int) $j['quote'] );
		$t = dreamscaper_inbox_resolve( $req );
		return is_wp_error( $t ) ? $t : array( 'id' => (int) $t->id );
	}
	return dreamscaper_crm_err( 'Who do you want to message?' );
}

function dreamscaper_rest_inbox_unread() {
	return array( 'unread' => dreamscaper_inbox_unread( get_current_user_id() ) );
}

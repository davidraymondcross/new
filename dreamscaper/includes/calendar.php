<?php
/**
 * DreamScaper – shared calendar and automatic reminders.
 *
 * One appointment record (the visits table) shows on the contractor's Schedule and on the
 * homeowner's My Calendar at the same time. Each person also gets a private calendar feed
 * (?ds_ics=TOKEN) for Google / Apple / Outlook, and every appointment has an add-to-calendar
 * file (?ds_ics_event=UID).
 *
 * Reminders follow the contractor's schedule (Settings → Reminders): any number of rules, each
 * "N minutes / hours / days before", with its own channels and appointment types. They are
 * rebuilt whenever an appointment changes, never sent in the past, never sent twice, and texts
 * are never sent overnight (they move to 8 pm the evening before).
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'DREAMSCAPER_CAL_DB', 1 );

function dreamscaper_cal_install_db() {
	global $wpdb;
	require_once ABSPATH . 'wp-admin/includes/upgrade.php';
	$c = $wpdb->get_charset_collate();
	dbDelta( 'CREATE TABLE ' . dreamscaper_t( 'reminders' ) . " (
		id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
		visit_id bigint(20) unsigned NOT NULL,
		pro_id bigint(20) unsigned NOT NULL,
		send_at datetime NOT NULL,
		before_min int(11) NOT NULL DEFAULT 0,
		channel varchar(6) NOT NULL DEFAULT 'email',
		audience varchar(10) NOT NULL DEFAULT 'customer',
		status varchar(10) NOT NULL DEFAULT 'scheduled',
		sent_at datetime DEFAULT NULL,
		error varchar(255) NOT NULL DEFAULT '',
		PRIMARY KEY  (id),
		KEY due (status,send_at),
		KEY visit_id (visit_id)
	) $c;" );
	update_option( 'dreamscaper_cal_db', DREAMSCAPER_CAL_DB );
}
add_action( 'init', function () {
	if ( (int) get_option( 'dreamscaper_cal_db' ) !== DREAMSCAPER_CAL_DB && (int) get_option( 'dreamscaper_crm_db' ) ) {
		dreamscaper_cal_install_db();
	}
}, 7 );

/* ------------------------------------------------------------- reminders */

/** The recommended reminder schedule. before: minutes. kinds: [] = every type. */
function dreamscaper_reminder_defaults() {
	return array(
		'customer' => array(
			array( 'before' => 2 * 1440, 'channels' => array( 'email' ), 'kinds' => array() ),
			array( 'before' => 1440, 'channels' => array( 'email', 'sms' ), 'kinds' => array() ),
			array( 'before' => 120, 'channels' => array( 'sms' ), 'kinds' => array( 'consult', 'site_visit', 'estimate' ) ),
		),
		'pro'      => array(
			array( 'before' => 60, 'channels' => array( 'inapp' ), 'kinds' => array() ),
		),
		'notify'   => 1,
	);
}

function dreamscaper_reminder_rules( $p ) {
	$s = dreamscaper_pro_settings( $p );
	$d = dreamscaper_reminder_defaults();
	$r = isset( $s['reminders'] ) && is_array( $s['reminders'] ) ? $s['reminders'] : array();
	return array(
		'customer' => isset( $r['customer'] ) && is_array( $r['customer'] ) ? $r['customer'] : $d['customer'],
		'pro'      => isset( $r['pro'] ) && is_array( $r['pro'] ) ? $r['pro'] : $d['pro'],
		'notify'   => isset( $r['notify'] ) ? (int) $r['notify'] : 1,
	);
}

/** Clean rules from the app. */
function dreamscaper_reminder_clean( $rules, $max = 20 ) {
	$out   = array();
	$kinds = array_keys( dreamscaper_visit_kinds() );
	foreach ( array_slice( (array) $rules, 0, $max ) as $r ) {
		if ( ! is_array( $r ) ) {
			continue;
		}
		$before = max( 5, min( 60 * 24 * 60, (int) ( isset( $r['before'] ) ? $r['before'] : 0 ) ) );
		$ch     = array_values( array_intersect( array( 'email', 'sms', 'inapp' ), (array) ( isset( $r['channels'] ) ? $r['channels'] : array() ) ) );
		if ( ! $ch ) {
			continue;
		}
		$out[] = array( 'before' => $before, 'channels' => $ch, 'kinds' => array_values( array_intersect( $kinds, (array) ( isset( $r['kinds'] ) ? $r['kinds'] : array() ) ) ) );
	}
	usort( $out, function ( $a, $b ) { return $b['before'] - $a['before']; } );
	return $out;
}

/** Recreate the scheduled reminders for one appointment. */
function dreamscaper_reminders_rebuild( $v ) {
	global $wpdb;
	if ( ! $v || ! (int) get_option( 'dreamscaper_cal_db' ) ) {
		return 0;
	}
	$R = dreamscaper_t( 'reminders' );
	$wpdb->query( $wpdb->prepare( "DELETE FROM $R WHERE visit_id=%d AND status='scheduled'", $v->id ) );
	if ( in_array( $v->status, array( 'cancelled', 'done' ), true ) ) {
		return 0;
	}
	$p = dreamscaper_pro_row( $v->pro_id );
	if ( ! $p ) {
		return 0;
	}
	$rules = dreamscaper_reminder_rules( $p );
	$own   = isset( $v->remind ) && $v->remind ? dreamscaper_json( $v->remind, null ) : null;
	if ( is_array( $own ) && isset( $own['customer'] ) ) {
		$rules['customer'] = $own['customer'];
	}
	$start = strtotime( $v->start . ' UTC' );
	$kind  = isset( $v->kind ) && $v->kind ? $v->kind : 'job';
	$n     = 0;
	$sent  = $wpdb->get_results( $wpdb->prepare( "SELECT before_min, channel, audience FROM $R WHERE visit_id=%d AND status='sent'", $v->id ) );
	$done  = array();
	foreach ( $sent as $x ) {
		$done[ $x->audience . '|' . $x->channel . '|' . $x->before_min ] = 1;
	}
	foreach ( array( 'customer', 'pro' ) as $aud ) {
		foreach ( $rules[ $aud ] as $rule ) {
			if ( ! empty( $rule['kinds'] ) && ! in_array( $kind, (array) $rule['kinds'], true ) ) {
				continue;
			}
			foreach ( (array) $rule['channels'] as $ch ) {
				$at = $start - (int) $rule['before'] * 60;
				if ( 'sms' === $ch && 'customer' === $aud ) {
					$at = dreamscaper_daytime( $at );
				}
				if ( $at <= time() + 60 || $at >= $start || isset( $done[ $aud . '|' . $ch . '|' . (int) $rule['before'] ] ) ) {
					continue;
				}
				$wpdb->insert( $R, array( 'visit_id' => $v->id, 'pro_id' => $v->pro_id, 'send_at' => gmdate( 'Y-m-d H:i:s', $at ), 'before_min' => (int) $rule['before'], 'channel' => $ch, 'audience' => $aud, 'status' => 'scheduled' ) );
				$n++;
			}
		}
	}
	return $n;
}

/** Texts to customers never go out between 9 pm and 8 am: move them to 8 pm the evening before. */
function dreamscaper_daytime( $ts ) {
	$h = (int) wp_date( 'G', $ts );
	if ( $h >= 8 && $h < 21 ) {
		return $ts;
	}
	$d = new DateTime( '@' . $ts );
	$d->setTimezone( wp_timezone() );
	if ( $h < 8 ) {
		$d->modify( '-1 day' );
	}
	$d->setTime( 20, 0, 0 );
	return $d->getTimestamp();
}

/** Send reminders that are due. Called from the 5-minute CRM tick. */
function dreamscaper_reminders_due() {
	global $wpdb;
	if ( ! (int) get_option( 'dreamscaper_cal_db' ) ) {
		return;
	}
	$R   = dreamscaper_t( 'reminders' );
	$V   = dreamscaper_t( 'visits' );
	$due = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM $R WHERE status='scheduled' AND send_at <= %s ORDER BY send_at LIMIT 60", dreamscaper_now() ) );
	foreach ( $due as $r ) {
		if ( ! $wpdb->update( $R, array( 'status' => 'sending' ), array( 'id' => $r->id, 'status' => 'scheduled' ) ) ) {
			continue; // another run took it
		}
		$v = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $V WHERE id=%d", $r->visit_id ) );
		$p = $v ? dreamscaper_pro_row( $v->pro_id ) : null;
		$fail = function ( $why ) use ( $wpdb, $R, $r ) {
			$wpdb->update( $R, array( 'status' => 'skipped', 'error' => mb_substr( $why, 0, 250 ) ), array( 'id' => $r->id ) );
		};
		if ( ! $v || ! $p || in_array( $v->status, array( 'cancelled', 'done' ), true ) ) {
			$fail( 'appointment no longer active' );
			continue;
		}
		if ( strtotime( $v->start . ' UTC' ) <= time() ) {
			$fail( 'too late' );
			continue;
		}
		if ( ! dreamscaper_sub_can_send( $p->user_id ) ) {
			// paused accounts: hold it (it'll be skipped if its time passes)
			$wpdb->update( $R, array( 'status' => 'scheduled', 'send_at' => gmdate( 'Y-m-d H:i:s', time() + HOUR_IN_SECONDS ) ), array( 'id' => $r->id ) );
			continue;
		}
		$c = $v->client_id ? dreamscaper_crm_get( 'clients', $v->client_id, $p->user_id ) : null;
		if ( 'customer' === $r->audience ) {
			$to = dreamscaper_tpl_to_client( $c );
			if ( ! $to && $v->user_id ) {
				$u  = get_userdata( $v->user_id );
				$to = $u ? array( 'email' => $u->user_email, 'phone' => get_user_meta( $u->ID, 'dscp_phone', true ), 'user_id' => $u->ID ) : array();
			}
			if ( 'inapp' !== $r->channel && empty( $to[ 'sms' === $r->channel ? 'phone' : 'email' ] ) ) {
				$fail( 'no ' . ( 'sms' === $r->channel ? 'phone number' : 'email' ) );
				continue;
			}
			$res = dreamscaper_tpl_send( $p, 'appt_reminder', array( 'visit' => $v, 'client' => $c ), $to, array( 'channels' => array( $r->channel ), 'quiet' => false, 'force' => true, 'link' => dreamscaper_app_url( array( 'ds_projects' => 1 ) ), 'button' => 'See my appointment' ) );
		} else {
			$res = dreamscaper_tpl_send( $p, 'alert_appt_reminder', array( 'visit' => $v, 'client' => $c ), array(), array( 'channels' => array( $r->channel ), 'quiet' => false, 'force' => true, 'hub' => 'schedule' ) );
		}
		$wpdb->update( $R, array( 'status' => $res['sent'] ? 'sent' : 'failed', 'sent_at' => dreamscaper_now(), 'error' => mb_substr( implode( ' ', $res['errors'] ), 0, 250 ) ), array( 'id' => $r->id ) );
	}
}
add_action( 'dreamscaper_crm_tick', 'dreamscaper_reminders_due', 20 );

/* -------------------------------------------------- appointment changes */

/**
 * After an appointment is created / changed / cancelled: rebuild reminders, put it on the
 * customer's calendar, tell them (if the contractor wants), and note it in the project thread.
 * $what: booked | changed | cancelled. $notify: null = contractor's default.
 */
function dreamscaper_visit_after_save( $v, $what, $notify = null ) {
	global $wpdb;
	if ( ! $v ) {
		return array( 'sent' => 0 );
	}
	$p = dreamscaper_pro_row( $v->pro_id );
	if ( ! $p ) {
		return array( 'sent' => 0 );
	}
	$c = $v->client_id ? dreamscaper_crm_get( 'clients', $v->client_id, $p->user_id ) : null;
	if ( $c && $c->user_id && (int) $v->user_id !== (int) $c->user_id ) {
		$wpdb->update( dreamscaper_t( 'visits' ), array( 'user_id' => (int) $c->user_id ), array( 'id' => $v->id ) );
		$v->user_id = (int) $c->user_id;
	}
	dreamscaper_reminders_rebuild( $v );
	$rules = dreamscaper_reminder_rules( $p );
	$tell  = null === $notify ? (bool) $rules['notify'] : (bool) $notify;
	$future = strtotime( $v->end . ' UTC' ) > time();
	$res    = array( 'sent' => 0 );
	if ( $tell && $future && $c ) {
		$q   = $v->quote_id ? dreamscaper_crm_get( 'quotes', $v->quote_id, $p->user_id ) : null;
		$tid = $q ? dreamscaper_thread_for_quote( $q ) : dreamscaper_thread_for_client( $c );
		$key = array( 'booked' => 'appt_booked', 'changed' => 'appt_changed', 'cancelled' => 'appt_cancelled' )[ $what ];
		$res = dreamscaper_tpl_send( $p, $key, array( 'visit' => $v, 'client' => $c, 'quote' => $q ), dreamscaper_tpl_to_client( $c ), array( 'thread_id' => $tid, 'ref_type' => 'visit', 'ref_id' => $v->id, 'link' => dreamscaper_app_url( array( 'ds_projects' => 1 ) ), 'button' => 'cancelled' === $what ? 'Open my projects' : 'Confirm or reschedule', 'target' => $v->quote_id ) );
	}
	return $res;
}

/** A unique id for the appointment's calendar file (made once). */
function dreamscaper_visit_uid( $v ) {
	global $wpdb;
	if ( ! empty( $v->uid ) ) {
		return $v->uid;
	}
	$uid = dreamscaper_token();
	$wpdb->update( dreamscaper_t( 'visits' ), array( 'uid' => $uid ), array( 'id' => $v->id ) );
	$v->uid = $uid;
	return $uid;
}

/* ------------------------------------------------------------- homeowner */

add_action( 'rest_api_init', function () {
	$auth = function () {
		return is_user_logged_in();
	};
	foreach ( array(
		array( '/cal/mine', 'GET', 'dreamscaper_rest_cal_mine' ),
		array( '/cal/respond', 'POST', 'dreamscaper_rest_cal_respond' ),
		array( '/cal/feed', 'GET', 'dreamscaper_rest_cal_feed' ),
		array( '/cal/feed', 'POST', 'dreamscaper_rest_cal_feed_reset' ),
		array( '/crm/reminders', 'GET', 'dreamscaper_rest_reminders_get' ),
		array( '/crm/reminders', 'POST', 'dreamscaper_rest_reminders_save' ),
		array( '/crm/visit/onway', 'POST', 'dreamscaper_rest_visit_onway' ),
	) as $r ) {
		register_rest_route( 'dreamscaper/v1', $r[0], array( 'methods' => $r[1], 'callback' => $r[2], 'permission_callback' => $auth ) );
	}
} );

/** Appointments this homeowner is part of (any contractor). */
function dreamscaper_cal_user_visits( $uid, $from, $to ) {
	global $wpdb;
	$V = dreamscaper_t( 'visits' );
	$C = dreamscaper_t( 'clients' );
	return $wpdb->get_results( $wpdb->prepare( "SELECT v.* FROM $V v LEFT JOIN $C c ON c.id=v.client_id WHERE (v.user_id=%d OR c.user_id=%d) AND v.start >= %s AND v.start <= %s ORDER BY v.start LIMIT 300", $uid, $uid, gmdate( 'Y-m-d H:i:s', $from ), gmdate( 'Y-m-d H:i:s', $to ) ) );
}

function dreamscaper_cal_visit_out( $v, $for_pro = false ) {
	$p     = dreamscaper_pro_row( $v->pro_id );
	$kinds = dreamscaper_visit_kinds();
	$uid   = dreamscaper_visit_uid( $v );
	$q     = $v->quote_id ? dreamscaper_crm_get( 'quotes', $v->quote_id, $v->pro_id ) : null;
	$loc   = $v->location;
	if ( ! $loc && $q && $q->prop_id ) {
		$pr  = dreamscaper_crm_get( 'props', $q->prop_id, $v->pro_id );
		$loc = $pr ? $pr->address : '';
	}
	return array(
		'id' => (int) $v->id, 'title' => $v->title, 'kind' => $v->kind ? $v->kind : 'job', 'kind_label' => isset( $kinds[ $v->kind ] ) ? $kinds[ $v->kind ] : 'Appointment',
		'start' => dreamscaper_ms( $v->start ), 'end' => dreamscaper_ms( $v->end ), 'status' => $v->status, 'cust_status' => $v->cust_status, 'cust_note' => $v->cust_note,
		'location' => $loc, 'crew' => $v->crew, 'quote_id' => (int) $v->quote_id, 'project' => $q ? $q->title : '',
		'pro' => $p ? array( 'id' => (int) $p->user_id, 'business' => $p->business, 'phone' => $p->phone, 'logo' => $p->logo ) : null,
		'ics' => add_query_arg( 'ds_ics_event', $uid, home_url( '/' ) ),
		'notes' => $for_pro ? $v->notes : '',
	);
}

function dreamscaper_rest_cal_mine( WP_REST_Request $r ) {
	$uid  = get_current_user_id();
	$from = (int) ( $r->get_param( 'from' ) / 1000 );
	$to   = (int) ( $r->get_param( 'to' ) / 1000 );
	if ( ! $from || $to <= $from ) {
		$from = time() - 30 * DAY_IN_SECONDS;
		$to   = time() + 365 * DAY_IN_SECONDS;
	}
	return array( 'items' => array_map( 'dreamscaper_cal_visit_out', dreamscaper_cal_user_visits( $uid, $from, $to ) ) );
}

/** Homeowner confirms an appointment or asks to reschedule it. */
function dreamscaper_rest_cal_respond( WP_REST_Request $r ) {
	global $wpdb;
	$uid = get_current_user_id();
	$j   = $r->get_json_params();
	$V   = dreamscaper_t( 'visits' );
	$v   = $wpdb->get_row( $wpdb->prepare( "SELECT v.* FROM $V v LEFT JOIN " . dreamscaper_t( 'clients' ) . ' c ON c.id=v.client_id WHERE v.id=%d AND (v.user_id=%d OR c.user_id=%d)', (int) ( isset( $j['id'] ) ? $j['id'] : 0 ), $uid, $uid ) );
	if ( ! $v ) {
		return dreamscaper_crm_err( 'Appointment not found.', 404 );
	}
	if ( ! dreamscaper_limit( 'calresp', 30, HOUR_IN_SECONDS ) ) {
		return dreamscaper_crm_err( 'Please wait a moment and try again.', 429 );
	}
	$act  = 'reschedule' === ( isset( $j['action'] ) ? $j['action'] : '' ) ? 'reschedule' : 'confirmed';
	$note = mb_substr( sanitize_textarea_field( isset( $j['note'] ) ? $j['note'] : '' ), 0, 480 );
	$wpdb->update( $V, array( 'cust_status' => $act, 'cust_note' => $note, 'status' => 'confirmed' === $act && 'scheduled' === $v->status ? 'confirmed' : $v->status ), array( 'id' => $v->id ) );
	$v = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $V WHERE id=%d", $v->id ) );
	$p = dreamscaper_pro_row( $v->pro_id );
	$c = $v->client_id ? dreamscaper_crm_get( 'clients', $v->client_id, $v->pro_id ) : null;
	$q = $v->quote_id ? dreamscaper_crm_get( 'quotes', $v->quote_id, $v->pro_id ) : null;
	$label = 'confirmed' === $act ? 'confirmed' : 'asked to reschedule';
	if ( $p ) {
		dreamscaper_tpl_send( $p, 'alert_appt_response', array( 'visit' => $v, 'client' => $c, 'quote' => $q ), array(), array( 'extra' => array( 'customer_response' => $label, 'customer_note' => $note ), 'force' => true, 'hub' => 'schedule', 'target' => $v->quote_id ) );
		dreamscaper_crm_log( $p->user_id, $v->client_id, $v->quote_id, 'visit', 'Customer ' . $label . ': ' . $v->title . ( $note ? ' — ' . $note : '' ), $uid );
		$tid = $q ? dreamscaper_thread_for_quote( $q ) : ( $c ? dreamscaper_thread_for_client( $c ) : 0 );
		if ( $tid ) {
			$when = wp_date( 'D, M j \a\t g:i a', strtotime( $v->start . ' UTC' ) );
			dreamscaper_thread_post( $tid, $uid, ( 'confirmed' === $act ? '✅ Confirmed ' : '🔁 Asked to reschedule ' ) . $v->title . ' (' . $when . ')' . ( $note ? "\n" . $note : '' ), array( 'kind' => 'system', 'ref_type' => 'visit', 'ref_id' => $v->id, 'notify' => false ) );
		}
	}
	return dreamscaper_cal_visit_out( $v );
}

/* ------------------------------------------------------------ ICS feeds */

function dreamscaper_cal_token( $uid, $reset = false ) {
	$t = (string) get_user_meta( $uid, 'dscp_ics', true );
	if ( ! $t || $reset ) {
		$t = dreamscaper_token();
		update_user_meta( $uid, 'dscp_ics', $t );
	}
	return $t;
}
function dreamscaper_rest_cal_feed() {
	$uid = get_current_user_id();
	$url = add_query_arg( 'ds_ics', dreamscaper_cal_token( $uid ), home_url( '/' ) );
	return array( 'url' => $url, 'webcal' => preg_replace( '#^https?://#', 'webcal://', $url ), 'google' => 'https://calendar.google.com/calendar/r?cid=' . rawurlencode( preg_replace( '#^https?://#', 'webcal://', $url ) ) );
}
function dreamscaper_rest_cal_feed_reset() {
	dreamscaper_cal_token( get_current_user_id(), true );
	return dreamscaper_rest_cal_feed();
}

function dreamscaper_ics_esc( $s ) {
	return str_replace( array( '\\', ';', ',', "\r\n", "\n" ), array( '\\\\', '\;', '\,', '\n', '\n' ), (string) $s );
}
function dreamscaper_ics_fold( $line ) {
	$out = '';
	while ( strlen( $line ) > 74 ) {
		$cut  = 74;
		while ( $cut > 0 && ( ord( $line[ $cut ] ) & 0xC0 ) === 0x80 ) {
			$cut--;
		}
		$out .= substr( $line, 0, $cut ) . "\r\n ";
		$line = substr( $line, $cut );
	}
	return $out . $line . "\r\n";
}
function dreamscaper_ics_event( $v, $for_pro ) {
	$o    = dreamscaper_cal_visit_out( $v, $for_pro );
	$who  = $for_pro ? '' : ( $o['pro'] ? $o['pro']['business'] . ' — ' : '' );
	$desc = $o['kind_label'] . ( $o['project'] ? ': ' . $o['project'] : '' ) . ( $o['pro'] && ! $for_pro ? "\n" . $o['pro']['business'] . ( $o['pro']['phone'] ? ' · ' . $o['pro']['phone'] : '' ) : '' ) . ( $for_pro && $v->notes ? "\n" . $v->notes : '' ) . ( $for_pro && $v->crew ? "\nCrew: " . $v->crew : '' );
	$lines = array(
		'BEGIN:VEVENT',
		'UID:' . dreamscaper_visit_uid( $v ) . '@' . wp_parse_url( home_url(), PHP_URL_HOST ),
		'DTSTAMP:' . gmdate( 'Ymd\THis\Z' ),
		'DTSTART:' . gmdate( 'Ymd\THis\Z', strtotime( $v->start . ' UTC' ) ),
		'DTEND:' . gmdate( 'Ymd\THis\Z', strtotime( $v->end . ' UTC' ) ),
		'SEQUENCE:' . (int) $v->seq,
		'SUMMARY:' . dreamscaper_ics_esc( $who . $v->title ),
		'DESCRIPTION:' . dreamscaper_ics_esc( $desc ),
		'LOCATION:' . dreamscaper_ics_esc( $o['location'] ),
		'STATUS:' . ( 'cancelled' === $v->status ? 'CANCELLED' : 'CONFIRMED' ),
		'END:VEVENT',
	);
	return implode( '', array_map( 'dreamscaper_ics_fold', $lines ) );
}
function dreamscaper_ics_out( $name, $events ) {
	nocache_headers();
	header( 'Content-Type: text/calendar; charset=utf-8' );
	header( 'Content-Disposition: inline; filename="' . sanitize_file_name( $name ) . '.ics"' );
	echo "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//DreamScaper//EN\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n" . dreamscaper_ics_fold( 'X-WR-CALNAME:' . dreamscaper_ics_esc( $name ) ) . $events . "END:VCALENDAR\r\n"; // phpcs:ignore
	exit;
}

add_action( 'template_redirect', function () {
	global $wpdb;
	if ( isset( $_GET['ds_ics_event'] ) ) { // phpcs:ignore
		$uid = preg_replace( '/[^a-z0-9]/', '', strtolower( (string) $_GET['ds_ics_event'] ) ); // phpcs:ignore
		$v   = strlen( $uid ) >= 20 ? $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( 'visits' ) . ' WHERE uid=%s', $uid ) ) : null;
		if ( ! $v ) {
			status_header( 404 );
			exit( 'Not found' );
		}
		dreamscaper_ics_out( $v->title, dreamscaper_ics_event( $v, false ) );
	}
	if ( isset( $_GET['ds_ics'] ) ) { // phpcs:ignore
		$tok   = preg_replace( '/[^a-z0-9]/', '', strtolower( (string) $_GET['ds_ics'] ) ); // phpcs:ignore
		$users = strlen( $tok ) >= 20 ? get_users( array( 'meta_key' => 'dscp_ics', 'meta_value' => $tok, 'number' => 1, 'fields' => 'ID' ) ) : array();
		if ( ! $users ) {
			status_header( 404 );
			exit( 'Not found' );
		}
		$uid    = (int) $users[0];
		$events = '';
		$seen   = array();
		$p      = dreamscaper_pro_row( $uid );
		if ( $p && 'approved' === $p->status && dreamscaper_pro_can( $uid, 'calendar_feed' ) ) {
			foreach ( $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( 'visits' ) . ' WHERE pro_id=%d AND start >= %s ORDER BY start LIMIT 1000', $uid, gmdate( 'Y-m-d H:i:s', time() - 90 * DAY_IN_SECONDS ) ) ) as $v ) {
				$seen[ $v->id ] = 1;
				$events        .= dreamscaper_ics_event( $v, true );
			}
		}
		foreach ( dreamscaper_cal_user_visits( $uid, time() - 90 * DAY_IN_SECONDS, time() + 2 * YEAR_IN_SECONDS ) as $v ) {
			if ( ! isset( $seen[ $v->id ] ) ) {
				$events .= dreamscaper_ics_event( $v, false );
			}
		}
		dreamscaper_ics_out( $p && 'approved' === $p->status ? $p->business . ' (DreamScaper)' : 'My DreamScaper appointments', $events );
	}
} );

/* -------------------------------------------------- contractor settings */

function dreamscaper_rest_reminders_get() {
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	return array( 'rules' => dreamscaper_reminder_rules( $p ), 'defaults' => dreamscaper_reminder_defaults(), 'kinds' => dreamscaper_visit_kinds(), 'limit' => dreamscaper_pro_limit( $p->user_id, 'reminder_rules' ), 'sms' => dreamscaper_sms_ready() && dreamscaper_pro_can( $p->user_id, 'sms' ) );
}

function dreamscaper_rest_reminders_save( WP_REST_Request $r ) {
	global $wpdb;
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$j     = $r->get_json_params();
	$lim   = dreamscaper_pro_plan( $p->user_id )['def']['f']['reminder_rules'];
	$cust  = dreamscaper_reminder_clean( isset( $j['customer'] ) ? $j['customer'] : array(), $lim < 0 ? 20 : max( 1, (int) $lim ) );
	if ( $lim >= 0 && count( (array) ( isset( $j['customer'] ) ? $j['customer'] : array() ) ) > $lim ) {
		return dreamscaper_plan_err( $p->user_id, 'reminder_rules', 'Your plan includes ' . $lim . ' automatic reminder' . ( 1 === $lim ? '' : 's' ) . ' per appointment. Upgrade for more.' );
	}
	$s              = dreamscaper_pro_settings( $p );
	$s['reminders'] = array( 'customer' => $cust, 'pro' => dreamscaper_reminder_clean( isset( $j['pro'] ) ? $j['pro'] : array(), 10 ), 'notify' => empty( $j['notify'] ) ? 0 : 1 );
	$wpdb->update( dreamscaper_t( 'pros' ), array( 'settings' => wp_json_encode( $s ) ), array( 'user_id' => $p->user_id ) );
	// re-plan every upcoming appointment on the new schedule
	$n = 0;
	foreach ( $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( 'visits' ) . " WHERE pro_id=%d AND start > %s AND status NOT IN ('cancelled','done') LIMIT 500", $p->user_id, dreamscaper_now() ) ) as $v ) {
		$n += dreamscaper_reminders_rebuild( $v );
	}
	return array( 'rules' => dreamscaper_reminder_rules( dreamscaper_pro_row( $p->user_id ) ), 'scheduled' => $n );
}

/** "On our way" to the customer. */
function dreamscaper_rest_visit_onway( WP_REST_Request $r ) {
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$v = dreamscaper_crm_get( 'visits', (int) $r->get_param( 'id' ), $p->user_id );
	if ( ! $v ) {
		return dreamscaper_crm_err( 'Appointment not found.', 404 );
	}
	$c = $v->client_id ? dreamscaper_crm_get( 'clients', $v->client_id, $p->user_id ) : null;
	if ( ! $c ) {
		return dreamscaper_crm_err( 'Link this appointment to a customer first.' );
	}
	$q   = $v->quote_id ? dreamscaper_crm_get( 'quotes', $v->quote_id, $p->user_id ) : null;
	$res = dreamscaper_tpl_send( $p, 'on_the_way', array( 'visit' => $v, 'client' => $c, 'quote' => $q ), dreamscaper_tpl_to_client( $c ), array( 'force' => true, 'thread_id' => $q ? dreamscaper_thread_for_quote( $q ) : dreamscaper_thread_for_client( $c ), 'ref_type' => 'visit', 'ref_id' => $v->id ) );
	if ( 'scheduled' === $v->status || 'confirmed' === $v->status ) {
		global $wpdb;
		$wpdb->update( dreamscaper_t( 'visits' ), array( 'status' => 'in_progress' ), array( 'id' => $v->id ) );
	}
	return $res['sent'] ? array( 'ok' => true, 'channels' => $res['channels'] ) : dreamscaper_crm_err( $res['errors'] ? implode( ' ', array_unique( $res['errors'] ) ) : 'Add the customer’s mobile number or email first.' );
}

<?php
/**
 * DreamScaper – contractor-only customer records ("flags").
 *
 * Approved contractors record FACTUAL events about customers they've worked with — an invoice
 * unpaid for 60+ days, paid 30+ days late, a cancellation within 24 hours, a no-show, a reversed
 * payment, a cancellation after materials were ordered. Each record is tied to a real invoice,
 * appointment or quote in that contractor's DreamScaper account and expires after 24 months.
 *
 * Another approved contractor sees a short summary only for a customer they are actually dealing
 * with (someone in their own CRM), never which contractor recorded it, and every view is logged.
 * Customers are matched across contractors by hashed email, phone and address — the raw details
 * are never shared. Records can be disputed (hidden while the site owner reviews) and are
 * included when a customer asks for their data. Contractors earn points for accurate records.
 * Disclosure or misuse is covered in the Terms of Service (contractor termination).
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'DREAMSCAPER_TRUST_DB', 1 );

add_action( 'init', function () {
	if ( (int) get_option( 'dreamscaper_trust_db' ) === DREAMSCAPER_TRUST_DB ) {
		return;
	}
	global $wpdb;
	require_once ABSPATH . 'wp-admin/includes/upgrade.php';
	$c = $wpdb->get_charset_collate();
	dbDelta( 'CREATE TABLE ' . dreamscaper_t( 'flags' ) . " (
		id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
		pro_id bigint(20) unsigned NOT NULL,
		client_id bigint(20) unsigned NOT NULL,
		h_email char(64) NOT NULL DEFAULT '',
		h_phone char(64) NOT NULL DEFAULT '',
		h_addr char(64) NOT NULL DEFAULT '',
		kind varchar(20) NOT NULL,
		ref_type varchar(10) NOT NULL DEFAULT '',
		ref_id bigint(20) unsigned NOT NULL DEFAULT 0,
		amount decimal(10,2) NOT NULL DEFAULT 0,
		occurred date NOT NULL,
		status varchar(12) NOT NULL DEFAULT 'active',
		note varchar(255) NOT NULL DEFAULT '',
		created datetime NOT NULL,
		updated datetime NOT NULL,
		PRIMARY KEY  (id),
		UNIQUE KEY one_per_ref (pro_id,kind,ref_type,ref_id),
		KEY h_email (h_email),
		KEY h_phone (h_phone),
		KEY h_addr (h_addr),
		KEY pro_client (pro_id,client_id)
	) $c;" );
	dbDelta( 'CREATE TABLE ' . dreamscaper_t( 'flag_views' ) . " (
		id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
		pro_id bigint(20) unsigned NOT NULL,
		client_id bigint(20) unsigned NOT NULL,
		shown int(11) NOT NULL DEFAULT 0,
		created datetime NOT NULL,
		PRIMARY KEY  (id),
		KEY pro_id (pro_id,created)
	) $c;" );
	update_option( 'dreamscaper_trust_db', DREAMSCAPER_TRUST_DB );
}, 7 );

/** kind => [label, what it needs]. */
function dreamscaper_flag_kinds() {
	return array(
		'unpaid'       => array( 'Invoice unpaid 60+ days', 'invoice' ),
		'late'         => array( 'Paid 30+ days late', 'invoice' ),
		'reversed'     => array( 'Payment reversed / charged back', 'invoice' ),
		'late_cancel'  => array( 'Cancelled within 24 hours', 'visit' ),
		'no_show'      => array( 'No-show / no access at a booked visit', 'visit' ),
		'cancel_order' => array( 'Cancelled after materials were ordered', 'quote' ),
	);
}
const DREAMSCAPER_FLAG_MONTHS = 24;

/** Hashes that identify the same customer across contractors (normalised, salted, one-way). */
function dreamscaper_flag_hashes( $c ) {
	$email = function_exists( 'dreamscaper_norm_email' ) ? dreamscaper_norm_email( $c->email ) : strtolower( trim( $c->email ) );
	$phone = preg_replace( '/\D/', '', (string) $c->phone );
	$phone = strlen( $phone ) >= 10 ? substr( $phone, -10 ) : '';
	$addr  = function_exists( 'dreamscaper_norm_address' ) ? dreamscaper_norm_address( $c->address . ' ' . $c->zip ) : '';
	$h     = function ( $v ) { return '' === $v ? '' : hash( 'sha256', 'flag|' . $v . '|' . wp_salt( 'auth' ) ); };
	return array( 'h_email' => is_email( $c->email ) ? $h( $email ) : '', 'h_phone' => $h( $phone ), 'h_addr' => strlen( $addr ) >= 8 ? $h( $addr ) : '' );
}

/** Contractors who may use flags: approved, account in good standing. */
function dreamscaper_flag_pro() {
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	if ( ! get_user_meta( $p->user_id, 'dscp_flag_terms', true ) && ! user_can( $p->user_id, 'manage_options' ) ) {
		return new WP_Error( 'dreamscaper_flag_terms', 'Please read and accept the contractor-only records rules first.', array( 'status' => 428 ) );
	}
	return $p;
}

/** Record (or confirm) a flag tied to one of this contractor's own records. */
function dreamscaper_flag_add( $pro_id, $client_id, $kind, $ref_type, $ref_id, $occurred, $amount = 0, $status = 'active' ) {
	global $wpdb;
	$kinds = dreamscaper_flag_kinds();
	if ( ! isset( $kinds[ $kind ] ) ) {
		return new WP_Error( 'dreamscaper', 'Unknown record type.', array( 'status' => 400 ) );
	}
	$c = dreamscaper_crm_get( 'clients', $client_id, $pro_id );
	if ( ! $c ) {
		return new WP_Error( 'dreamscaper', 'Customer not found.', array( 'status' => 404 ) );
	}
	$T   = dreamscaper_t( 'flags' );
	$now = dreamscaper_now();
	$row = array_merge( dreamscaper_flag_hashes( $c ), array( 'pro_id' => $pro_id, 'client_id' => $client_id, 'kind' => $kind, 'ref_type' => $ref_type, 'ref_id' => $ref_id, 'amount' => round( (float) $amount, 2 ), 'occurred' => $occurred, 'status' => $status, 'created' => $now, 'updated' => $now ) );
	$ex  = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $T WHERE pro_id=%d AND kind=%s AND ref_type=%s AND ref_id=%d", $pro_id, $kind, $ref_type, $ref_id ) );
	if ( $ex ) {
		if ( 'suggested' === $ex->status && 'active' === $status ) {
			$wpdb->update( $T, array( 'status' => 'active', 'updated' => $now ), array( 'id' => $ex->id ) );
			dreamscaper_points_add_safe( $pro_id, 5 );
		}
		return (int) $ex->id;
	}
	$wpdb->insert( $T, $row );
	if ( 'active' === $status ) {
		dreamscaper_points_add_safe( $pro_id, 5 );
	}
	return (int) $wpdb->insert_id;
}
function dreamscaper_points_add_safe( $uid, $n ) {
	if ( function_exists( 'dreamscaper_points_add' ) ) {
		dreamscaper_points_add( $uid, $n );
	}
}

/** Check that a reference (invoice / visit / quote) is real, belongs to this contractor and customer, and qualifies. */
function dreamscaper_flag_check_ref( $pro_id, $client_id, $kind, $ref_id ) {
	global $wpdb;
	$need = dreamscaper_flag_kinds()[ $kind ][1];
	if ( 'invoice' === $need ) {
		$i = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( 'invoices' ) . ' WHERE id=%d AND pro_id=%d AND client_id=%d', $ref_id, $pro_id, $client_id ) );
		if ( ! $i ) {
			return new WP_Error( 'dreamscaper', 'Pick one of this customer’s invoices.', array( 'status' => 400 ) );
		}
		if ( 'unpaid' === $kind && ! ( 'sent' === $i->status && $i->due && strtotime( $i->due ) < time() - 60 * DAY_IN_SECONDS ) ) {
			return new WP_Error( 'dreamscaper', 'That invoice isn’t 60 days past due.', array( 'status' => 400 ) );
		}
		if ( 'late' === $kind && ! ( 'paid' === $i->status && $i->due && $i->paid_at && strtotime( $i->paid_at ) > strtotime( $i->due ) + 30 * DAY_IN_SECONDS ) ) {
			return new WP_Error( 'dreamscaper', 'That invoice wasn’t paid 30+ days late.', array( 'status' => 400 ) );
		}
		return array( 'date' => gmdate( 'Y-m-d', strtotime( 'late' === $kind ? $i->paid_at : ( $i->due ? $i->due : $i->created ) ) ), 'amount' => (float) $i->amount );
	}
	if ( 'visit' === $need ) {
		$v = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( 'visits' ) . ' WHERE id=%d AND pro_id=%d AND client_id=%d', $ref_id, $pro_id, $client_id ) );
		if ( ! $v ) {
			return new WP_Error( 'dreamscaper', 'Pick one of this customer’s appointments.', array( 'status' => 400 ) );
		}
		if ( 'late_cancel' === $kind && 'cancelled' !== $v->status ) {
			return new WP_Error( 'dreamscaper', 'That appointment isn’t marked cancelled.', array( 'status' => 400 ) );
		}
		if ( strtotime( $v->start . ' UTC' ) > time() ) {
			return new WP_Error( 'dreamscaper', 'That appointment hasn’t happened yet.', array( 'status' => 400 ) );
		}
		return array( 'date' => gmdate( 'Y-m-d', strtotime( $v->start . ' UTC' ) ), 'amount' => 0 );
	}
	$q = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( 'quotes' ) . ' WHERE id=%d AND pro_id=%d AND client_id=%d', $ref_id, $pro_id, $client_id ) );
	if ( ! $q || ! $q->signed_at ) {
		return new WP_Error( 'dreamscaper', 'Pick a quote this customer signed.', array( 'status' => 400 ) );
	}
	return array( 'date' => gmdate( 'Y-m-d' ), 'amount' => (float) $q->total );
}

/** Daily: suggest flags from the contractor's own invoices (they confirm before anything is shared); expire old ones. */
add_action( 'dreamscaper_subs_daily', function () {
	global $wpdb;
	if ( (int) get_option( 'dreamscaper_trust_db' ) !== DREAMSCAPER_TRUST_DB || get_transient( 'dscp_flag_tick' ) ) {
		return;
	}
	set_transient( 'dscp_flag_tick', 1, 20 * HOUR_IN_SECONDS );
	$I = dreamscaper_t( 'invoices' );
	foreach ( $wpdb->get_results( $wpdb->prepare( "SELECT id, pro_id, client_id, due, amount FROM $I WHERE status='sent' AND client_id>0 AND due IS NOT NULL AND due < %s LIMIT 300", gmdate( 'Y-m-d', time() - 60 * DAY_IN_SECONDS ) ) ) as $i ) {
		dreamscaper_flag_add( (int) $i->pro_id, (int) $i->client_id, 'unpaid', 'invoice', (int) $i->id, $i->due, $i->amount, 'suggested' );
	}
	foreach ( $wpdb->get_results( $wpdb->prepare( "SELECT id, pro_id, client_id, paid_at, amount FROM $I WHERE status='paid' AND client_id>0 AND due IS NOT NULL AND paid_at > %s AND paid_at > DATE_ADD(due, INTERVAL 30 DAY) LIMIT 300", gmdate( 'Y-m-d H:i:s', time() - 3 * DAY_IN_SECONDS ) ) ) as $i ) {
		dreamscaper_flag_add( (int) $i->pro_id, (int) $i->client_id, 'late', 'invoice', (int) $i->id, gmdate( 'Y-m-d', strtotime( $i->paid_at ) ), $i->amount, 'suggested' );
	}
	$F = dreamscaper_t( 'flags' );
	// an unpaid invoice that gets paid clears its record; anything older than 24 months expires
	$wpdb->query( "UPDATE $F f JOIN $I i ON i.id=f.ref_id AND f.ref_type='invoice' SET f.status='cleared', f.updated=NOW() WHERE f.kind='unpaid' AND f.status IN ('active','suggested') AND i.status='paid'" ); // phpcs:ignore
	$wpdb->query( $wpdb->prepare( "UPDATE $F SET status='expired' WHERE status IN ('active','suggested') AND occurred < %s", gmdate( 'Y-m-d', strtotime( '-' . DREAMSCAPER_FLAG_MONTHS . ' months' ) ) ) ); // phpcs:ignore
} );

add_action( 'rest_api_init', function () {
	$auth = function () {
		return is_user_logged_in();
	};
	register_rest_route( 'dreamscaper/v1', '/crm/flags', array( 'methods' => 'GET', 'callback' => 'dreamscaper_rest_flags', 'permission_callback' => $auth ) );
	register_rest_route( 'dreamscaper/v1', '/crm/flags', array( 'methods' => 'POST', 'callback' => 'dreamscaper_rest_flag_save', 'permission_callback' => $auth ) );
	register_rest_route( 'dreamscaper/v1', '/crm/flags/terms', array( 'methods' => 'POST', 'callback' => 'dreamscaper_rest_flag_terms', 'permission_callback' => $auth ) );
} );

function dreamscaper_rest_flag_terms() {
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	update_user_meta( $p->user_id, 'dscp_flag_terms', dreamscaper_now() );
	if ( function_exists( 'dreamscaper_terms_accept' ) ) {
		dreamscaper_terms_accept( $p->user_id, 'flags' );
	}
	return array( 'ok' => true );
}

/**
 * For one of my customers: the summary of records from ALL contractors (never who recorded them),
 * my own records with their source, suggestions waiting for my confirmation, and what I could record.
 */
function dreamscaper_rest_flags( WP_REST_Request $r ) {
	global $wpdb;
	$p = dreamscaper_flag_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$c = dreamscaper_crm_get( 'clients', (int) $r->get_param( 'client_id' ), $p->user_id );
	if ( ! $c ) {
		return dreamscaper_crm_err( 'Customer not found.', 404 );
	}
	$F    = dreamscaper_t( 'flags' );
	$hs   = array_filter( dreamscaper_flag_hashes( $c ) );
	$cut  = gmdate( 'Y-m-d', strtotime( '-' . DREAMSCAPER_FLAG_MONTHS . ' months' ) );
	$all  = array();
	if ( $hs ) {
		$w = array();
		foreach ( $hs as $k => $v ) {
			$w[] = $wpdb->prepare( "$k=%s", $v ); // phpcs:ignore -- column names are fixed
		}
		$all = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM $F WHERE status='active' AND occurred >= %s AND (", $cut ) . implode( ' OR ', $w ) . ') ORDER BY occurred DESC LIMIT 50' ); // phpcs:ignore
	}
	$kinds   = dreamscaper_flag_kinds();
	$summary = array();
	foreach ( $all as $f ) {
		$summary[] = array( 'kind' => $f->kind, 'label' => $kinds[ $f->kind ][0], 'month' => gmdate( 'M Y', strtotime( $f->occurred ) ), 'mine' => (int) $f->pro_id === (int) $p->user_id );
	}
	$wpdb->insert( dreamscaper_t( 'flag_views' ), array( 'pro_id' => $p->user_id, 'client_id' => $c->id, 'shown' => count( $summary ), 'created' => dreamscaper_now() ) );
	$mine = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM $F WHERE pro_id=%d AND client_id=%d AND status IN ('active','suggested','disputed') ORDER BY occurred DESC", $p->user_id, $c->id ) );
	// what I could record: my own invoices / appointments / signed quotes for this customer
	$inv = $wpdb->get_results( $wpdb->prepare( 'SELECT id, number, amount, status, due, paid_at FROM ' . dreamscaper_t( 'invoices' ) . ' WHERE pro_id=%d AND client_id=%d ORDER BY id DESC LIMIT 30', $p->user_id, $c->id ) );
	$vis = $wpdb->get_results( $wpdb->prepare( 'SELECT id, title, start, status FROM ' . dreamscaper_t( 'visits' ) . ' WHERE pro_id=%d AND client_id=%d AND start < %s ORDER BY start DESC LIMIT 30', $p->user_id, $c->id, dreamscaper_now() ) );
	$quo = $wpdb->get_results( $wpdb->prepare( 'SELECT id, number, title, total FROM ' . dreamscaper_t( 'quotes' ) . ' WHERE pro_id=%d AND client_id=%d AND signed_at IS NOT NULL ORDER BY id DESC LIMIT 30', $p->user_id, $c->id ) );
	return array(
		'summary' => $summary,
		'mine'    => array_map( function ( $f ) use ( $kinds ) { return array( 'id' => (int) $f->id, 'kind' => $f->kind, 'label' => $kinds[ $f->kind ][0], 'status' => $f->status, 'occurred' => $f->occurred, 'ref_type' => $f->ref_type, 'ref_id' => (int) $f->ref_id, 'amount' => (float) $f->amount ); }, $mine ),
		'kinds'   => array_map( function ( $k, $v ) { return array( 'key' => $k, 'label' => $v[0], 'needs' => $v[1] ); }, array_keys( $kinds ), $kinds ),
		'refs'    => array(
			'invoice' => array_map( function ( $i ) { return array( 'id' => (int) $i->id, 'label' => $i->number . ' · $' . number_format( (float) $i->amount, 2 ) . ' · ' . $i->status . ( $i->due ? ' · due ' . $i->due : '' ) ); }, $inv ),
			'visit'   => array_map( function ( $v ) { return array( 'id' => (int) $v->id, 'label' => wp_date( 'M j, Y', strtotime( $v->start . ' UTC' ) ) . ' · ' . $v->title . ' · ' . $v->status ); }, $vis ),
			'quote'   => array_map( function ( $q ) { return array( 'id' => (int) $q->id, 'label' => $q->number . ' · ' . $q->title . ' · $' . number_format( (float) $q->total, 2 ) ); }, $quo ),
		),
	);
}

/** Record a flag (tied to my own invoice / visit / quote), confirm a suggestion, or withdraw mine. */
function dreamscaper_rest_flag_save( WP_REST_Request $r ) {
	global $wpdb;
	$p = dreamscaper_flag_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	if ( ! dreamscaper_limit( 'flags', 60, DAY_IN_SECONDS ) ) {
		return dreamscaper_crm_err( 'That’s a lot of records today. Please try again tomorrow.', 429 );
	}
	$j  = $r->get_json_params();
	$F  = dreamscaper_t( 'flags' );
	$id = (int) ( isset( $j['id'] ) ? $j['id'] : 0 );
	if ( $id ) {
		$f = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $F WHERE id=%d AND pro_id=%d", $id, $p->user_id ) );
		if ( ! $f ) {
			return dreamscaper_crm_err( 'Record not found.', 404 );
		}
		$act = isset( $j['action'] ) ? sanitize_key( $j['action'] ) : '';
		if ( 'confirm' === $act && 'suggested' === $f->status ) {
			$wpdb->update( $F, array( 'status' => 'active', 'updated' => dreamscaper_now() ), array( 'id' => $id ) );
			dreamscaper_points_add_safe( $p->user_id, 5 );
		} elseif ( 'withdraw' === $act ) {
			$wpdb->update( $F, array( 'status' => 'withdrawn', 'updated' => dreamscaper_now() ), array( 'id' => $id ) );
		}
		return array( 'ok' => true );
	}
	$client = (int) ( isset( $j['client_id'] ) ? $j['client_id'] : 0 );
	$kind   = sanitize_key( isset( $j['kind'] ) ? $j['kind'] : '' );
	$ref    = (int) ( isset( $j['ref_id'] ) ? $j['ref_id'] : 0 );
	if ( ! isset( dreamscaper_flag_kinds()[ $kind ] ) ) {
		return dreamscaper_crm_err( 'Pick what happened.' );
	}
	$ok = dreamscaper_flag_check_ref( $p->user_id, $client, $kind, $ref );
	if ( is_wp_error( $ok ) ) {
		return $ok;
	}
	$res = dreamscaper_flag_add( (int) $p->user_id, $client, $kind, dreamscaper_flag_kinds()[ $kind ][1], $ref, $ok['date'], $ok['amount'] );
	if ( is_wp_error( $res ) ) {
		return $res;
	}
	dreamscaper_crm_log( (int) $p->user_id, $client, 0, 'note', 'Contractor-only record added: ' . dreamscaper_flag_kinds()[ $kind ][0], get_current_user_id() );
	return array( 'ok' => true, 'id' => $res );
}

/* ------------------------------------- site owner: customer data requests & disputes */

add_action( 'admin_menu', function () {
	add_options_page( 'DreamScaper Customer Records', 'DreamScaper Records', 'manage_options', 'dreamscaper-records', 'dreamscaper_records_admin' );
}, 23 );
add_action( 'admin_post_dreamscaper_records', function () {
	global $wpdb;
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( 'Not allowed.' );
	}
	check_admin_referer( 'dreamscaper_records' );
	$id  = isset( $_POST['id'] ) ? (int) $_POST['id'] : 0;
	$st  = isset( $_POST['set'] ) ? sanitize_key( $_POST['set'] ) : '';
	$why = isset( $_POST['why'] ) ? sanitize_text_field( wp_unslash( $_POST['why'] ) ) : '';
	if ( $id && in_array( $st, array( 'disputed', 'active', 'removed' ), true ) ) {
		$wpdb->update( dreamscaper_t( 'flags' ), array( 'status' => $st, 'note' => mb_substr( $why, 0, 250 ), 'updated' => dreamscaper_now() ), array( 'id' => $id ) );
	}
	wp_safe_redirect( wp_get_referer() ? wp_get_referer() : admin_url( 'options-general.php?page=dreamscaper-records' ) );
	exit;
} );
function dreamscaper_records_admin() {
	global $wpdb;
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$q = isset( $_GET['q'] ) ? sanitize_text_field( wp_unslash( $_GET['q'] ) ) : ''; // phpcs:ignore
	echo '<div class="wrap"><h1>Customer records (contractor-only)</h1><p style="max-width:900px">When a customer asks what information is held about them, or disputes a record, look them up here by email or phone. <b>Disputed</b> records are hidden from contractors until you set them back to Active; <b>Removed</b> records are never shown again. Everything here is factual and tied to a real invoice, appointment or quote.</p>';
	echo '<form method="get"><input type="hidden" name="page" value="dreamscaper-records"><input type="search" name="q" value="' . esc_attr( $q ) . '" placeholder="Customer email or phone" style="width:320px"> <button class="button">Look up</button></form>';
	if ( '' === $q ) {
		$n = (int) $wpdb->get_var( 'SELECT COUNT(*) FROM ' . dreamscaper_t( 'flags' ) . " WHERE status='active'" );
		echo '<p>' . (int) $n . ' active records.</p></div>';
		return;
	}
	$fake = (object) array( 'email' => is_email( $q ) ? $q : '', 'phone' => is_email( $q ) ? '' : $q, 'address' => '', 'zip' => '' );
	$hs   = array_filter( dreamscaper_flag_hashes( $fake ) );
	if ( ! $hs ) {
		echo '<p>Enter a full email address or a 10-digit phone number.</p></div>';
		return;
	}
	$w = array();
	foreach ( $hs as $k => $v ) {
		$w[] = $wpdb->prepare( "$k=%s", $v ); // phpcs:ignore
	}
	$rows  = $wpdb->get_results( 'SELECT f.*, p.business FROM ' . dreamscaper_t( 'flags' ) . ' f LEFT JOIN ' . dreamscaper_t( 'pros' ) . ' p ON p.user_id=f.pro_id WHERE ' . implode( ' OR ', $w ) . ' ORDER BY f.occurred DESC' ); // phpcs:ignore
	$kinds = dreamscaper_flag_kinds();
	echo '<table class="widefat striped" style="max-width:1100px"><thead><tr><th>When</th><th>Record</th><th>Recorded by</th><th>Status</th><th>Change</th></tr></thead><tbody>';
	foreach ( $rows as $f ) {
		echo '<tr><td>' . esc_html( $f->occurred ) . '</td><td>' . esc_html( isset( $kinds[ $f->kind ] ) ? $kinds[ $f->kind ][0] : $f->kind ) . ( (float) $f->amount ? ' · $' . esc_html( number_format( (float) $f->amount, 2 ) ) : '' ) . ' <small>(' . esc_html( $f->ref_type . ' #' . $f->ref_id ) . ')</small></td><td>' . esc_html( $f->business ) . '</td><td>' . esc_html( $f->status ) . ( $f->note ? '<br><small>' . esc_html( $f->note ) . '</small>' : '' ) . '</td><td><form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" style="display:flex;gap:4px">';
		wp_nonce_field( 'dreamscaper_records' );
		echo '<input type="hidden" name="action" value="dreamscaper_records"><input type="hidden" name="id" value="' . (int) $f->id . '"><select name="set"><option value="disputed">Disputed (hide)</option><option value="active">Active</option><option value="removed">Removed</option></select><input name="why" placeholder="Reason" style="width:140px"><button class="button button-small">Save</button></form></td></tr>';
	}
	echo '</tbody></table>' . ( $rows ? '' : '<p>No records for this customer.</p>' ) . '</div>';
}

/** Tools → Export Personal Data includes these records for the customer's email (CT / state privacy laws). */
add_filter( 'wp_privacy_personal_data_exporters', function ( $ex ) {
	$ex['dreamscaper-records'] = array(
		'exporter_friendly_name' => 'DreamScaper contractor records',
		'callback'               => function ( $email ) {
			global $wpdb;
			$h    = dreamscaper_flag_hashes( (object) array( 'email' => $email, 'phone' => '', 'address' => '', 'zip' => '' ) );
			$data = array();
			if ( $h['h_email'] ) {
				$kinds = dreamscaper_flag_kinds();
				foreach ( $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( 'flags' ) . " WHERE h_email=%s AND status IN ('active','disputed')", $h['h_email'] ) ) as $f ) {
					$data[] = array(
						'group_id'    => 'dreamscaper-records',
						'group_label' => 'Records made by contractors',
						'item_id'     => 'flag-' . $f->id,
						'data'        => array(
							array( 'name' => 'Record', 'value' => isset( $kinds[ $f->kind ] ) ? $kinds[ $f->kind ][0] : $f->kind ),
							array( 'name' => 'Date', 'value' => $f->occurred ),
							array( 'name' => 'Status', 'value' => $f->status ),
						),
					);
				}
			}
			return array( 'data' => $data, 'done' => true );
		},
	);
	return $ex;
} );

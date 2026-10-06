<?php
/**
 * DreamScaper – Contractor Hub REST API (dreamscaper/v1/crm/...). Every route checks that
 * the signed-in user is an approved contractor and that each record belongs to them.
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

add_action( 'rest_api_init', function () {
	$auth = function () {
		return is_user_logged_in();
	};
	foreach ( array(
		array( '/crm/apply', 'POST', 'dreamscaper_crm_apply' ),
		array( '/crm/application', 'GET', 'dreamscaper_crm_application' ),
		array( '/crm/me', 'GET', 'dreamscaper_crm_me' ),
		array( '/crm/settings', 'POST', 'dreamscaper_crm_settings' ),
		array( '/crm/clients', 'GET', 'dreamscaper_crm_clients' ),
		array( '/crm/client', 'GET', 'dreamscaper_crm_client' ),
		array( '/crm/client', 'POST', 'dreamscaper_crm_client_save' ),
		array( '/crm/client/delete', 'POST', 'dreamscaper_crm_client_delete' ),
		array( '/crm/property', 'POST', 'dreamscaper_crm_property_save' ),
		array( '/crm/property/delete', 'POST', 'dreamscaper_crm_property_delete' ),
		array( '/crm/note', 'POST', 'dreamscaper_crm_note' ),
		array( '/crm/quotes', 'GET', 'dreamscaper_crm_quotes' ),
		array( '/crm/quote', 'GET', 'dreamscaper_crm_quote' ),
		array( '/crm/quote', 'POST', 'dreamscaper_crm_quote_save' ),
		array( '/crm/quote/delete', 'POST', 'dreamscaper_crm_quote_delete' ),
		array( '/crm/quote/copy', 'POST', 'dreamscaper_crm_quote_copy' ),
		array( '/crm/quote/send', 'POST', 'dreamscaper_crm_quote_send' ),
		array( '/crm/quote/status', 'POST', 'dreamscaper_crm_quote_status' ),
		array( '/crm/followups', 'POST', 'dreamscaper_crm_followups_save' ),
		array( '/crm/followup/test', 'POST', 'dreamscaper_crm_followup_test' ),
		array( '/crm/ai/scope', 'POST', 'dreamscaper_crm_ai_scope' ),
		array( '/crm/elevation', 'POST', 'dreamscaper_crm_elevation' ),
		array( '/crm/schedule', 'GET', 'dreamscaper_crm_schedule' ),
		array( '/crm/visit', 'POST', 'dreamscaper_crm_visit_save' ),
		array( '/crm/visit/delete', 'POST', 'dreamscaper_crm_visit_delete' ),
		array( '/crm/visit/notify', 'POST', 'dreamscaper_crm_visit_notify' ),
		array( '/crm/job', 'POST', 'dreamscaper_crm_job_save' ),
		array( '/crm/invoices', 'GET', 'dreamscaper_crm_invoices' ),
		array( '/crm/invoice', 'POST', 'dreamscaper_crm_invoice_save' ),
		array( '/crm/invoice/send', 'POST', 'dreamscaper_crm_invoice_send' ),
		array( '/crm/review/reply', 'POST', 'dreamscaper_crm_review_reply' ),
	) as $r ) {
		register_rest_route( 'dreamscaper/v1', $r[0], array( 'methods' => $r[1], 'callback' => $r[2], 'permission_callback' => $auth ) );
	}
} );

/* ---------------------------------------------------------------- helpers */

function dreamscaper_crm_txt( $j, $k, $max = 200 ) {
	return mb_substr( sanitize_text_field( isset( $j[ $k ] ) ? (string) $j[ $k ] : '' ), 0, $max );
}
function dreamscaper_crm_area( $j, $k, $max = 4000 ) {
	return mb_substr( sanitize_textarea_field( isset( $j[ $k ] ) ? (string) $j[ $k ] : '' ), 0, $max );
}
/** Recursively clean an array from the app (strings sanitized, numbers kept, depth/size limited). */
function dreamscaper_crm_clean( $v, $depth = 0 ) {
	if ( $depth > 8 ) {
		return null;
	}
	if ( is_array( $v ) ) {
		$out = array();
		$n   = 0;
		foreach ( $v as $k => $x ) {
			if ( ++$n > 4000 ) {
				break;
			}
			$key         = is_int( $k ) ? $k : preg_replace( '/[^A-Za-z0-9_\-]/', '', (string) $k );
			$out[ $key ] = dreamscaper_crm_clean( $x, $depth + 1 );
		}
		return $out;
	}
	if ( is_bool( $v ) || is_int( $v ) || is_float( $v ) || null === $v ) {
		return is_float( $v ) && ! is_finite( $v ) ? 0 : $v;
	}
	return mb_substr( sanitize_textarea_field( (string) $v ), 0, 4000 );
}

function dreamscaper_client_out( $c, $full = false ) {
	$d   = dreamscaper_json( $c->data );
	$out = array(
		'id' => (int) $c->id, 'stage' => $c->stage, 'source' => $c->source, 'name' => $c->name, 'company' => $c->company,
		'email' => $c->email, 'phone' => $c->phone, 'address' => $c->address, 'town' => $c->town, 'state' => $c->state, 'zip' => $c->zip,
		'photo' => $c->photo, 'tags' => array_values( array_filter( explode( ',', trim( $c->tags, ',' ) ) ) ), 'linked' => (bool) $c->user_id,
		'created' => dreamscaper_ms( $c->created ), 'updated' => dreamscaper_ms( $c->updated ),
	);
	$out['data'] = $d;
	return $out;
}
function dreamscaper_prop_out( $p ) {
	return array(
		'id' => (int) $p->id, 'client_id' => (int) $p->client_id, 'address' => $p->address, 'lat' => (float) $p->lat, 'lng' => (float) $p->lng,
		'aerial' => $p->aerial, 'ppf' => (float) $p->ppf, 'photos' => dreamscaper_json( $p->photos ), 'plan' => dreamscaper_json( $p->plan, new stdClass() ),
		'data' => dreamscaper_json( $p->data, new stdClass() ), 'updated' => dreamscaper_ms( $p->updated ),
	);
}
function dreamscaper_quote_out( $q, $full = false ) {
	global $wpdb;
	$c   = $q->client_id ? $wpdb->get_row( $wpdb->prepare( 'SELECT id,name,email,phone,user_id FROM ' . dreamscaper_t( 'clients' ) . ' WHERE id=%d', $q->client_id ) ) : null;
	$des = dreamscaper_json( $q->design );
	$out = array(
		'id' => (int) $q->id, 'number' => $q->number, 'title' => $q->title, 'status' => $q->status, 'job_status' => $q->job_status,
		'client_id' => (int) $q->client_id, 'prop_id' => (int) $q->prop_id, 'client' => $c ? $c->name : '',
		'price' => (float) $q->price, 'cost' => (float) $q->cost, 'total' => (float) $q->total,
		'thumb' => isset( $des['after'] ) ? $des['after'] : '', 'valid_until' => $q->valid_until,
		'sent' => dreamscaper_ms( $q->sent_at ), 'viewed' => dreamscaper_ms( $q->viewed_at ), 'signed' => dreamscaper_ms( $q->signed_at ),
		'created' => dreamscaper_ms( $q->created ), 'updated' => dreamscaper_ms( $q->updated ), 'link' => dreamscaper_quote_url( $q->token ),
	);
	if ( $full ) {
		$out['design']   = $des;
		$out['estimate'] = dreamscaper_json( $q->estimate, new stdClass() );
		$out['docs']     = dreamscaper_json( $q->docs, new stdClass() );
		$out['job']      = dreamscaper_json( $q->job, new stdClass() );
		$out['sign']     = dreamscaper_json( $q->sign, new stdClass() );
		$out['contacts'] = $c ? array( array( 'name' => $c->name, 'email' => $c->email, 'phone' => $c->phone, 'role' => 'Customer' ) ) : array();
		if ( $c ) {
			$cd = dreamscaper_json( $wpdb->get_var( $wpdb->prepare( 'SELECT data FROM ' . dreamscaper_t( 'clients' ) . ' WHERE id=%d', $c->id ) ) );
			foreach ( isset( $cd['contacts'] ) ? (array) $cd['contacts'] : array() as $x ) {
				if ( ! empty( $x['email'] ) || ! empty( $x['phone'] ) ) {
					$out['contacts'][] = array( 'name' => isset( $x['name'] ) ? $x['name'] : '', 'email' => isset( $x['email'] ) ? $x['email'] : '', 'phone' => isset( $x['phone'] ) ? $x['phone'] : '', 'role' => isset( $x['role'] ) ? $x['role'] : 'Contact' );
				}
			}
		}
		$out['followups'] = array_map( function ( $f ) {
			return array( 'id' => (int) $f->id, 'channel' => $f->channel, 'at' => dreamscaper_ms( $f->send_at ), 'subject' => $f->subject, 'body' => $f->body, 'include' => dreamscaper_json( $f->include ), 'recipients' => dreamscaper_json( $f->recipients ), 'status' => $f->status, 'error' => $f->error, 'sent' => dreamscaper_ms( $f->sent_at ) );
		}, $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( 'followups' ) . ' WHERE quote_id=%d ORDER BY send_at', $q->id ) ) );
		$out['visits']    = array_map( 'dreamscaper_visit_out', $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( 'visits' ) . ' WHERE quote_id=%d ORDER BY start', $q->id ) ) );
		$out['invoices']  = array_map( 'dreamscaper_invoice_out', $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( 'invoices' ) . ' WHERE quote_id=%d ORDER BY id', $q->id ) ) );
	}
	return $out;
}
function dreamscaper_visit_out( $v ) {
	$out = array( 'id' => (int) $v->id, 'quote_id' => (int) $v->quote_id, 'client_id' => (int) $v->client_id, 'title' => $v->title, 'start' => dreamscaper_ms( $v->start ), 'end' => dreamscaper_ms( $v->end ), 'crew' => $v->crew, 'status' => $v->status, 'notes' => $v->notes );
	if ( isset( $v->kind ) ) {
		$out['kind']        = $v->kind ? $v->kind : 'job';
		$out['location']    = $v->location;
		$out['cust_status'] = $v->cust_status;
		$out['cust_note']   = $v->cust_note;
		$out['remind']      = $v->remind ? dreamscaper_json( $v->remind, null ) : null;
		$out['linked']      = (bool) $v->user_id;
		if ( function_exists( 'dreamscaper_visit_uid' ) ) {
			$out['ics'] = add_query_arg( 'ds_ics_event', dreamscaper_visit_uid( $v ), home_url( '/' ) );
		}
		if ( (int) get_option( 'dreamscaper_cal_db' ) ) {
			global $wpdb;
			$out['reminders'] = array_map( function ( $x ) { return array( 'at' => dreamscaper_ms( $x->send_at ), 'channel' => $x->channel, 'audience' => $x->audience, 'status' => $x->status ); }, $wpdb->get_results( $wpdb->prepare( 'SELECT send_at, channel, audience, status FROM ' . dreamscaper_t( 'reminders' ) . ' WHERE visit_id=%d ORDER BY send_at', $v->id ) ) );
		}
	}
	return $out;
}
function dreamscaper_invoice_out( $i ) {
	return array( 'id' => (int) $i->id, 'quote_id' => (int) $i->quote_id, 'client_id' => (int) $i->client_id, 'number' => $i->number, 'kind' => $i->kind, 'title' => $i->title, 'items' => dreamscaper_json( $i->items ), 'amount' => (float) $i->amount, 'status' => $i->status, 'due' => $i->due, 'recur' => $i->recur, 'next_at' => $i->next_at, 'paid' => dreamscaper_ms( $i->paid_at ), 'sent' => dreamscaper_ms( $i->sent_at ), 'link' => dreamscaper_invoice_url( $i->token ) );
}

/* ------------------------------------------------------------- application */

function dreamscaper_crm_application() {
	$p = dreamscaper_pro_row( get_current_user_id() );
	if ( ! $p ) {
		return array( 'pro' => null );
	}
	$out           = dreamscaper_pro_public( $p, true );
	$out['status'] = $p->status;
	$out['email']  = $p->email;
	$out['address'] = $p->address;
	$out['zip']    = $p->zip;
	return array( 'pro' => $out );
}

/** Apply to be a contractor, or update your business profile. */
function dreamscaper_crm_apply( WP_REST_Request $r ) {
	global $wpdb;
	if ( ! dreamscaper_crm_on() ) {
		return dreamscaper_crm_err( 'Contractor sign-up isn’t open yet.', 503 );
	}
	$uid = get_current_user_id();
	$j   = $r->get_json_params();
	$f   = array(
		'business' => dreamscaper_crm_txt( $j, 'business', 120 ),
		'contact'  => dreamscaper_crm_txt( $j, 'contact', 80 ),
		'phone'    => dreamscaper_crm_txt( $j, 'phone', 30 ),
		'email'    => sanitize_email( isset( $j['email'] ) ? $j['email'] : '' ),
		'website'  => esc_url_raw( isset( $j['website'] ) ? $j['website'] : '' ),
		'license'  => dreamscaper_crm_txt( $j, 'license', 80 ),
		'insured'  => empty( $j['insured'] ) ? 0 : 1,
		'years'    => max( 0, min( 100, (int) ( isset( $j['years'] ) ? $j['years'] : 0 ) ) ),
		'address'  => dreamscaper_crm_txt( $j, 'address', 200 ),
		'town'     => dreamscaper_crm_txt( $j, 'town', 80 ),
		'state'    => strtoupper( dreamscaper_crm_txt( $j, 'state', 20 ) ),
		'zip'      => dreamscaper_crm_txt( $j, 'zip', 12 ),
		'radius'   => max( 5, min( 200, (int) ( isset( $j['radius'] ) ? $j['radius'] : 25 ) ) ),
		'services' => ',' . implode( ',', array_slice( array_filter( array_map( function ( $s ) { return str_replace( ',', ' ', sanitize_text_field( $s ) ); }, (array) ( isset( $j['services'] ) ? $j['services'] : array() ) ) ), 0, 30 ) ) . ',',
		'bio'      => dreamscaper_crm_area( $j, 'bio', 2000 ),
	);
	if ( strlen( $f['business'] ) < 2 || strlen( preg_replace( '/\D/', '', $f['phone'] ) ) < 10 || ! is_email( $f['email'] ) || ! $f['town'] ) {
		return dreamscaper_crm_err( 'Please add your business name, phone, email and town.' );
	}
	if ( ! empty( $j['logo'] ) ) {
		$logo = dreamscaper_crm_store_image( $j['logo'], 2 * MB_IN_BYTES );
		if ( $logo ) {
			$f['logo'] = $logo;
		}
	}
	$g = dreamscaper_geocode( trim( $f['address'] . ', ' . $f['town'] . ', ' . $f['state'] . ' ' . $f['zip'], ', ' ) );
	if ( $g ) {
		$f['lat'] = $g['lat'];
		$f['lng'] = $g['lng'];
	}
	$p = dreamscaper_pro_row( $uid );
	if ( $p ) {
		$wpdb->update( dreamscaper_t( 'pros' ), $f, array( 'user_id' => $uid ) );
	} else {
		$f = array_merge( $f, array( 'user_id' => $uid, 'status' => dreamscaper_opt( 'crm_auto_approve' ) ? 'approved' : 'pending', 'settings' => '{}', 'created' => dreamscaper_now() ) );
		$wpdb->insert( dreamscaper_t( 'pros' ), $f );
		if ( dreamscaper_opt( 'notify_email' ) ) {
			wp_mail( dreamscaper_opt( 'notify_email' ), 'New DreamScaper contractor application: ' . $f['business'], "{$f['business']} ({$f['contact']}, {$f['phone']}, {$f['email']}) in {$f['town']} applied to be a DreamScaper contractor.\nLicense: {$f['license']}\nInsured: " . ( $f['insured'] ? 'yes' : 'no' ) . "\n\nReview it: " . admin_url( 'options-general.php?page=dreamscaper-contractors' ) );
		}
	}
	return dreamscaper_crm_application();
}

/* ------------------------------------------------------------ dashboard */

function dreamscaper_crm_me() {
	global $wpdb;
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$id = (int) $p->user_id;
	$Q  = dreamscaper_t( 'quotes' );
	$I  = dreamscaper_t( 'invoices' );
	$C  = dreamscaper_t( 'clients' );
	$pipe = array();
	foreach ( $wpdb->get_results( $wpdb->prepare( "SELECT status, COUNT(*) n, SUM(total) v FROM $Q WHERE pro_id=%d GROUP BY status", $id ) ) as $row ) {
		$pipe[ $row->status ] = array( 'n' => (int) $row->n, 'v' => (float) $row->v );
	}
	$since = gmdate( 'Y-m-d H:i:s', time() - 90 * DAY_IN_SECONDS );
	$won   = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM $Q WHERE pro_id=%d AND status='signed' AND sent_at > %s", $id, $since ) );
	$sent  = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM $Q WHERE pro_id=%d AND sent_at > %s", $id, $since ) );
	$out   = dreamscaper_pro_public( $p, true );
	$out['email']   = $p->email;
	$out['address'] = $p->address;
	$out['zip']     = $p->zip;
	$s = dreamscaper_pro_settings( $p );
	return array(
		'pro'       => $out,
		'settings'  => $s ? $s : new stdClass(),
		'pipeline'  => $pipe ? $pipe : new stdClass(),
		'close_rate'=> $sent ? round( 100 * $won / $sent ) : null,
		'leads'     => (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM $C WHERE pro_id=%d AND stage='lead'", $id ) ),
		'clients'   => (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM $C WHERE pro_id=%d", $id ) ),
		'unpaid'    => (float) $wpdb->get_var( $wpdb->prepare( "SELECT COALESCE(SUM(amount),0) FROM $I WHERE pro_id=%d AND status='sent'", $id ) ),
		'paid30'    => (float) $wpdb->get_var( $wpdb->prepare( "SELECT COALESCE(SUM(amount),0) FROM $I WHERE pro_id=%d AND status='paid' AND paid_at > %s", $id, gmdate( 'Y-m-d H:i:s', time() - 30 * DAY_IN_SECONDS ) ) ),
		'upcoming'  => array_map( 'dreamscaper_visit_out', $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( 'visits' ) . " WHERE pro_id=%d AND start >= %s AND status<>'cancelled' ORDER BY start LIMIT 6", $id, gmdate( 'Y-m-d 00:00:00' ) ) ) ),
		'recent'    => array_map( function ( $a ) {
			return array( 'kind' => $a->kind, 'text' => $a->text, 'client_id' => (int) $a->client_id, 'quote_id' => (int) $a->quote_id, 'at' => dreamscaper_ms( $a->created ) );
		}, $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( 'activity' ) . ' WHERE pro_id=%d ORDER BY id DESC LIMIT 12', $id ) ) ),
		'reviews'   => array_map( 'dreamscaper_review_out', $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( 'reviews' ) . " WHERE pro_id=%d AND status='live' ORDER BY id DESC LIMIT 10", $id ) ) ),
		'sms'       => (bool) dreamscaper_sms_ready() && dreamscaper_pro_can( $id, 'sms' ),
		'needs_reply' => (int) $wpdb->get_var( $wpdb->prepare( 'SELECT COUNT(*) FROM ' . dreamscaper_t( 'thread_users' ) . ' tu JOIN ' . dreamscaper_t( 'threads' ) . " t ON t.id=tu.thread_id WHERE tu.user_id=%d AND t.pro_id=%d AND t.kind='hire' AND t.msgs>0 AND tu.archived=0 AND tu.state IN ('new','waiting')", $id, $id ) ),
		'held'      => (int) $wpdb->get_var( $wpdb->prepare( 'SELECT COUNT(*) FROM ' . dreamscaper_t( 'followups' ) . " WHERE pro_id=%d AND status='held'", $id ) ),
		'connect'   => array( 'on' => (bool) dreamscaper_opt( 'stripe_secret' ), 'ready' => (bool) $p->stripe_ready, 'started' => '' !== $p->stripe_acct, 'fee' => (float) dreamscaper_opt( 'connect_fee_pct' ) ),
	);
}

function dreamscaper_crm_settings( WP_REST_Request $r ) {
	global $wpdb;
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$j = $r->get_json_params();
	$s = dreamscaper_pro_settings( $p );
	foreach ( array( 'costs', 'book', 'followups', 'crew', 'signature', 'scopeIntro', 'payments', 'emailIntro', 'snippets' ) as $k ) {
		if ( array_key_exists( $k, $j ) ) {
			$s[ $k ] = dreamscaper_crm_clean( $j[ $k ] );
		}
	}
	if ( array_key_exists( 'terms', $j ) ) {
		$s['terms'] = dreamscaper_crm_area( $j, 'terms', 8000 );
	}
	if ( isset( $s['snippets'] ) && is_array( $s['snippets'] ) ) {
		$lim = (int) dreamscaper_pro_plan( $p->user_id )['def']['f']['snippets'];
		$s['snippets'] = array_values( array_filter( array_map( function ( $x ) { return mb_substr( is_string( $x ) ? $x : '', 0, 1000 ); }, $s['snippets'] ) ) );
		if ( $lim >= 0 && count( $s['snippets'] ) > $lim ) {
			return dreamscaper_plan_err( $p->user_id, 'snippets', 'Your plan includes ' . $lim . ' saved quick replies. Upgrade for more.' );
		}
	}
	$wpdb->update( dreamscaper_t( 'pros' ), array( 'settings' => wp_json_encode( $s ) ), array( 'user_id' => $p->user_id ) );
	return array( 'settings' => $s );
}

/* -------------------------------------------------------------- customers */

function dreamscaper_crm_clients( WP_REST_Request $r ) {
	global $wpdb;
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$C     = dreamscaper_t( 'clients' );
	$where = $wpdb->prepare( 'pro_id=%d', $p->user_id );
	$stage = sanitize_key( (string) $r->get_param( 'stage' ) );
	if ( $stage ) {
		$where .= $wpdb->prepare( ' AND stage=%s', $stage );
	}
	$q = trim( sanitize_text_field( (string) $r->get_param( 'q' ) ) );
	if ( '' !== $q ) {
		$like   = '%' . $wpdb->esc_like( $q ) . '%';
		$where .= $wpdb->prepare( ' AND (name LIKE %s OR email LIKE %s OR phone LIKE %s OR address LIKE %s OR town LIKE %s OR company LIKE %s OR tags LIKE %s)', $like, $like, $like, $like, $like, $like, $like );
	}
	$rows = $wpdb->get_results( "SELECT * FROM $C WHERE $where ORDER BY updated DESC LIMIT 500" ); // phpcs:ignore
	return array( 'items' => array_map( 'dreamscaper_client_out', $rows ) );
}

function dreamscaper_crm_client( WP_REST_Request $r ) {
	global $wpdb;
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$c = dreamscaper_crm_get( 'clients', (int) $r->get_param( 'id' ), $p->user_id );
	if ( ! $c ) {
		return dreamscaper_crm_err( 'Customer not found.', 404 );
	}
	$out               = dreamscaper_client_out( $c, true );
	$out['properties'] = array_map( 'dreamscaper_prop_out', $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( 'props' ) . ' WHERE client_id=%d AND pro_id=%d ORDER BY id', $c->id, $p->user_id ) ) );
	$out['quotes']     = array_map( 'dreamscaper_quote_out', $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( 'quotes' ) . ' WHERE client_id=%d AND pro_id=%d ORDER BY id DESC', $c->id, $p->user_id ) ) );
	$out['invoices']   = array_map( 'dreamscaper_invoice_out', $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( 'invoices' ) . ' WHERE client_id=%d AND pro_id=%d ORDER BY id DESC', $c->id, $p->user_id ) ) );
	$out['activity']   = array_map( function ( $a ) {
		return array( 'id' => (int) $a->id, 'kind' => $a->kind, 'text' => $a->text, 'quote_id' => (int) $a->quote_id, 'at' => dreamscaper_ms( $a->created ) );
	}, $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( 'activity' ) . ' WHERE client_id=%d AND pro_id=%d ORDER BY id DESC LIMIT 200', $c->id, $p->user_id ) ) );
	return $out;
}

/** Fields kept in a customer's "data" (everything a service business wants to know). */
function dreamscaper_client_data_keys() {
	return array( 'contacts', 'pref', 'best_time', 'referred_by', 'budget', 'timeline', 'interests', 'gate', 'pets', 'irrigation', 'hoa', 'property_type', 'billing_address', 'tax_exempt', 'notes', 'phone2', 'birthday', 'lot_size', 'maintenance', 'utilities' );
}

function dreamscaper_crm_client_save( WP_REST_Request $r ) {
	global $wpdb;
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$j  = $r->get_json_params();
	$id = (int) ( isset( $j['id'] ) ? $j['id'] : 0 );
	$c  = $id ? dreamscaper_crm_get( 'clients', $id, $p->user_id ) : null;
	if ( $id && ! $c ) {
		return dreamscaper_crm_err( 'Customer not found.', 404 );
	}
	if ( ! $c ) {
		$gate = dreamscaper_pro_gate( $p->user_id, 'clients' );
		if ( is_wp_error( $gate ) ) {
			return $gate;
		}
	}
	$f = array(
		'name' => dreamscaper_crm_txt( $j, 'name', 120 ), 'company' => dreamscaper_crm_txt( $j, 'company', 120 ),
		'email' => sanitize_email( isset( $j['email'] ) ? $j['email'] : '' ), 'phone' => dreamscaper_crm_txt( $j, 'phone', 30 ),
		'address' => dreamscaper_crm_txt( $j, 'address', 200 ), 'town' => dreamscaper_crm_txt( $j, 'town', 80 ),
		'state' => strtoupper( dreamscaper_crm_txt( $j, 'state', 20 ) ), 'zip' => dreamscaper_crm_txt( $j, 'zip', 12 ),
		'stage' => in_array( isset( $j['stage'] ) ? $j['stage'] : '', array( 'lead', 'prospect', 'customer', 'past', 'lost' ), true ) ? $j['stage'] : 'lead',
		'source' => sanitize_key( isset( $j['source'] ) ? $j['source'] : '' ),
		'tags' => ',' . implode( ',', array_slice( array_filter( array_map( function ( $t ) { return str_replace( ',', ' ', sanitize_text_field( $t ) ); }, (array) ( isset( $j['tags'] ) ? $j['tags'] : array() ) ) ), 0, 20 ) ) . ',',
		'updated' => dreamscaper_now(),
	);
	if ( strlen( $f['name'] ) < 2 ) {
		return dreamscaper_crm_err( 'Please add the customer’s name.' );
	}
	$data = array();
	$in   = isset( $j['data'] ) && is_array( $j['data'] ) ? $j['data'] : array();
	foreach ( dreamscaper_client_data_keys() as $k ) {
		if ( isset( $in[ $k ] ) ) {
			$data[ $k ] = dreamscaper_crm_clean( $in[ $k ] );
		}
	}
	$f['data'] = wp_json_encode( $data );
	if ( ! empty( $j['photo'] ) ) {
		$f['photo'] = dreamscaper_crm_store_image( $j['photo'], 6 * MB_IN_BYTES );
	} elseif ( array_key_exists( 'photo', $j ) && ! $j['photo'] ) {
		$f['photo'] = '';
	}
	// Link to a DreamScaper account with the same email (their customer portal).
	if ( $f['email'] ) {
		$u = get_user_by( 'email', $f['email'] );
		$f['user_id'] = $u ? $u->ID : 0;
	}
	if ( $c ) {
		$wpdb->update( dreamscaper_t( 'clients' ), $f, array( 'id' => $c->id ) );
		$id = $c->id;
	} else {
		$f['pro_id']  = $p->user_id;
		$f['created'] = dreamscaper_now();
		$wpdb->insert( dreamscaper_t( 'clients' ), $f );
		$id = $wpdb->insert_id;
		dreamscaper_crm_log( $p->user_id, $id, 0, 'lead', 'Customer added' . ( $f['source'] ? ' (source: ' . $f['source'] . ')' : '' ) );
		// First property = the customer's address.
		if ( $f['address'] ) {
			$addr = trim( $f['address'] . ', ' . $f['town'] . ', ' . $f['state'] . ' ' . $f['zip'], ', ' );
			$g    = dreamscaper_geocode( $addr );
			$wpdb->insert( dreamscaper_t( 'props' ), array( 'pro_id' => $p->user_id, 'client_id' => $id, 'address' => $addr, 'lat' => $g ? $g['lat'] : 0, 'lng' => $g ? $g['lng'] : 0, 'photos' => $f['photo'] ? wp_json_encode( array( array( 'step' => 'front', 'url' => $f['photo'] ) ) ) : '[]', 'plan' => '{}', 'data' => '{}', 'created' => dreamscaper_now(), 'updated' => dreamscaper_now() ) );
		}
	}
	return dreamscaper_crm_client( dreamscaper_crm_req( array( 'id' => $id ) ) );
}
/** Small helper to build an internal GET request. */
function dreamscaper_crm_req( $params ) {
	$r = new WP_REST_Request( 'GET' );
	foreach ( $params as $k => $v ) {
		$r->set_param( $k, $v );
	}
	return $r;
}

function dreamscaper_crm_client_delete( WP_REST_Request $r ) {
	global $wpdb;
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$c = dreamscaper_crm_get( 'clients', (int) $r->get_param( 'id' ), $p->user_id );
	if ( ! $c ) {
		return dreamscaper_crm_err( 'Customer not found.', 404 );
	}
	if ( $wpdb->get_var( $wpdb->prepare( 'SELECT id FROM ' . dreamscaper_t( 'quotes' ) . " WHERE client_id=%d AND status IN ('signed') LIMIT 1", $c->id ) ) ) {
		return dreamscaper_crm_err( 'This customer has a signed job. Mark them “Past customer” instead of deleting.' );
	}
	foreach ( array( 'props', 'activity', 'followups', 'visits' ) as $t ) {
		$wpdb->delete( dreamscaper_t( $t ), array( 'client_id' => $c->id, 'pro_id' => $p->user_id ) );
	}
	$wpdb->delete( dreamscaper_t( 'quotes' ), array( 'client_id' => $c->id, 'pro_id' => $p->user_id ) );
	$wpdb->delete( dreamscaper_t( 'clients' ), array( 'id' => $c->id ) );
	return array( 'ok' => true );
}

function dreamscaper_crm_note( WP_REST_Request $r ) {
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$j = $r->get_json_params();
	$c = dreamscaper_crm_get( 'clients', (int) ( isset( $j['client_id'] ) ? $j['client_id'] : 0 ), $p->user_id );
	if ( ! $c ) {
		return dreamscaper_crm_err( 'Customer not found.', 404 );
	}
	$kind = in_array( isset( $j['kind'] ) ? $j['kind'] : '', array( 'note', 'call', 'email', 'sms', 'meeting', 'visit' ), true ) ? $j['kind'] : 'note';
	$text = dreamscaper_crm_area( $j, 'text', 4000 );
	if ( '' === trim( $text ) ) {
		return dreamscaper_crm_err( 'Write something first.' );
	}
	dreamscaper_crm_log( $p->user_id, $c->id, (int) ( isset( $j['quote_id'] ) ? $j['quote_id'] : 0 ), $kind, $text );
	global $wpdb;
	$wpdb->update( dreamscaper_t( 'clients' ), array( 'updated' => dreamscaper_now() ), array( 'id' => $c->id ) );
	return array( 'ok' => true );
}

/* ------------------------------------------------------------- properties */

function dreamscaper_crm_property_save( WP_REST_Request $r ) {
	global $wpdb;
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$j  = $r->get_json_params();
	$id = (int) ( isset( $j['id'] ) ? $j['id'] : 0 );
	$pr = $id ? dreamscaper_crm_get( 'props', $id, $p->user_id ) : null;
	if ( $id && ! $pr ) {
		return dreamscaper_crm_err( 'Property not found.', 404 );
	}
	$client = (int) ( isset( $j['client_id'] ) ? $j['client_id'] : ( $pr ? $pr->client_id : 0 ) );
	if ( ! dreamscaper_crm_get( 'clients', $client, $p->user_id ) ) {
		return dreamscaper_crm_err( 'Choose a customer for this property.' );
	}
	$f = array( 'client_id' => $client, 'updated' => dreamscaper_now() );
	if ( isset( $j['address'] ) ) {
		$f['address'] = dreamscaper_crm_txt( $j, 'address', 200 );
		if ( ! $pr || $pr->address !== $f['address'] ) {
			$g = dreamscaper_geocode( $f['address'] );
			if ( $g ) {
				$f['lat'] = $g['lat'];
				$f['lng'] = $g['lng'];
			}
		}
	}
	if ( isset( $j['lat'], $j['lng'] ) && (float) $j['lat'] ) {
		$f['lat'] = (float) $j['lat'];
		$f['lng'] = (float) $j['lng'];
	}
	if ( ! empty( $j['aerial'] ) ) {
		$f['aerial'] = dreamscaper_crm_store_image( $j['aerial'], 6 * MB_IN_BYTES );
		$f['ppf']    = max( 0, (float) ( isset( $j['ppf'] ) ? $j['ppf'] : 0 ) );
	}
	if ( isset( $j['photos'] ) && is_array( $j['photos'] ) ) {
		$ph = array();
		foreach ( array_slice( $j['photos'], 0, 40 ) as $x ) {
			$url = isset( $x['url'] ) ? dreamscaper_crm_store_image( $x['url'], 6 * MB_IN_BYTES ) : '';
			if ( $url ) {
				$ph[] = array( 'step' => sanitize_key( isset( $x['step'] ) ? $x['step'] : 'other' ), 'url' => $url, 'note' => mb_substr( sanitize_text_field( isset( $x['note'] ) ? $x['note'] : '' ), 0, 300 ) );
			}
		}
		$f['photos'] = wp_json_encode( $ph );
	}
	if ( isset( $j['plan'] ) && is_array( $j['plan'] ) ) {
		$plan = dreamscaper_crm_clean( $j['plan'] );
		if ( ! empty( $j['plan']['bg']['url'] ) && 0 === strpos( (string) $j['plan']['bg']['url'], 'data:' ) ) {
			$plan['bg']['url'] = dreamscaper_crm_store_image( $j['plan']['bg']['url'], 8 * MB_IN_BYTES );
		}
		$f['plan'] = wp_json_encode( $plan );
	}
	if ( isset( $j['data'] ) && is_array( $j['data'] ) ) {
		$f['data'] = wp_json_encode( dreamscaper_crm_clean( $j['data'] ) );
	}
	if ( $pr ) {
		$wpdb->update( dreamscaper_t( 'props' ), $f, array( 'id' => $pr->id ) );
	} else {
		$wpdb->insert( dreamscaper_t( 'props' ), array_merge( array( 'pro_id' => $p->user_id, 'address' => '', 'photos' => '[]', 'plan' => '{}', 'data' => '{}', 'created' => dreamscaper_now() ), $f ) );
		$id = $wpdb->insert_id;
	}
	return dreamscaper_prop_out( dreamscaper_crm_get( 'props', $id, $p->user_id ) );
}
function dreamscaper_crm_property_delete( WP_REST_Request $r ) {
	global $wpdb;
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$pr = dreamscaper_crm_get( 'props', (int) $r->get_param( 'id' ), $p->user_id );
	if ( ! $pr ) {
		return dreamscaper_crm_err( 'Property not found.', 404 );
	}
	$wpdb->delete( dreamscaper_t( 'props' ), array( 'id' => $pr->id ) );
	return array( 'ok' => true );
}

/* ----------------------------------------------------------------- quotes */

function dreamscaper_crm_quotes( WP_REST_Request $r ) {
	global $wpdb;
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$where  = $wpdb->prepare( 'pro_id=%d', $p->user_id );
	$status = sanitize_key( (string) $r->get_param( 'status' ) );
	if ( 'jobs' === $status ) {
		$where .= " AND status='signed'";
	} elseif ( $status ) {
		$where .= $wpdb->prepare( ' AND status=%s', $status );
	}
	$q = trim( sanitize_text_field( (string) $r->get_param( 'q' ) ) );
	if ( '' !== $q ) {
		$like   = '%' . $wpdb->esc_like( $q ) . '%';
		$where .= $wpdb->prepare( ' AND (title LIKE %s OR number LIKE %s)', $like, $like );
	}
	return array( 'items' => array_map( 'dreamscaper_quote_out', $wpdb->get_results( 'SELECT * FROM ' . dreamscaper_t( 'quotes' ) . " WHERE $where ORDER BY updated DESC LIMIT 300" ) ) ); // phpcs:ignore
}

function dreamscaper_crm_quote( WP_REST_Request $r ) {
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$q = dreamscaper_crm_get( 'quotes', (int) $r->get_param( 'id' ), $p->user_id );
	return $q ? dreamscaper_quote_out( $q, true ) : dreamscaper_crm_err( 'Quote not found.', 404 );
}

/** Create or update a quote (design, plan-derived estimate, both documents). */
function dreamscaper_crm_quote_save( WP_REST_Request $r ) {
	global $wpdb;
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$j  = $r->get_json_params();
	$id = (int) ( isset( $j['id'] ) ? $j['id'] : 0 );
	$q  = $id ? dreamscaper_crm_get( 'quotes', $id, $p->user_id ) : null;
	if ( $id && ! $q ) {
		return dreamscaper_crm_err( 'Quote not found.', 404 );
	}
	if ( ! $q ) {
		$gate = dreamscaper_pro_gate( $p->user_id, 'quotes_month' );
		if ( is_wp_error( $gate ) ) {
			return $gate;
		}
	}
	if ( $q && 'signed' === $q->status ) {
		return dreamscaper_crm_err( 'This quote is signed, so it can’t be changed. Use “Copy as change order” to make a new version.' );
	}
	$client = (int) ( isset( $j['client_id'] ) ? $j['client_id'] : ( $q ? $q->client_id : 0 ) );
	$c      = dreamscaper_crm_get( 'clients', $client, $p->user_id );
	if ( ! $c ) {
		return dreamscaper_crm_err( 'Choose a customer for this quote.' );
	}
	$prop = (int) ( isset( $j['prop_id'] ) ? $j['prop_id'] : ( $q ? $q->prop_id : 0 ) );
	if ( $prop && ! dreamscaper_crm_get( 'props', $prop, $p->user_id ) ) {
		$prop = 0;
	}
	$f = array( 'client_id' => $client, 'prop_id' => $prop, 'user_id' => (int) $c->user_id, 'updated' => dreamscaper_now() );
	if ( isset( $j['title'] ) ) {
		$f['title'] = dreamscaper_crm_txt( $j, 'title', 160 );
	}
	if ( isset( $j['design'] ) && is_array( $j['design'] ) ) {
		$d = dreamscaper_crm_clean( $j['design'] );
		foreach ( array( 'before', 'after' ) as $k ) {
			$d[ $k ] = ! empty( $j['design'][ $k ] ) ? dreamscaper_crm_store_image( $j['design'][ $k ], 8 * MB_IN_BYTES ) : '';
		}
		$f['design'] = wp_json_encode( $d );
	}
	if ( isset( $j['estimate'] ) && is_array( $j['estimate'] ) ) {
		$f['estimate'] = wp_json_encode( dreamscaper_crm_clean( $j['estimate'] ) );
	}
	if ( isset( $j['docs'] ) && is_array( $j['docs'] ) ) {
		$docs      = dreamscaper_crm_clean( $j['docs'] );
		$t         = isset( $docs['totals'] ) ? $docs['totals'] : array();
		$f['docs'] = wp_json_encode( $docs );
		$f['price'] = round( (float) ( isset( $t['price'] ) ? $t['price'] : 0 ), 2 );
		$f['cost']  = round( (float) ( isset( $t['cost'] ) ? $t['cost'] : 0 ), 2 );
		$f['total'] = round( (float) ( isset( $t['total'] ) ? $t['total'] : 0 ), 2 );
	}
	if ( ! empty( $j['valid_until'] ) && preg_match( '/^\d{4}-\d{2}-\d{2}$/', $j['valid_until'] ) ) {
		$f['valid_until'] = $j['valid_until'];
	}
	if ( $q ) {
		if ( 'request' === $q->status && ! empty( $j['docs'] ) ) {
			$f['status'] = 'draft';
		}
		$wpdb->update( dreamscaper_t( 'quotes' ), $f, array( 'id' => $q->id ) );
	} else {
		$s = dreamscaper_pro_settings( $p );
		$valid = isset( $s['costs']['validDays'] ) ? max( 1, (int) $s['costs']['validDays'] ) : 30;
		$wpdb->insert( dreamscaper_t( 'quotes' ), array_merge( array(
			'pro_id' => $p->user_id, 'number' => dreamscaper_next_number( $p->user_id, 'Q' ), 'title' => 'Landscape project', 'status' => 'draft', 'token' => dreamscaper_token(),
			'design' => '{}', 'estimate' => '{}', 'docs' => '{}', 'job' => '{}', 'sign' => '{}', 'valid_until' => gmdate( 'Y-m-d', time() + $valid * DAY_IN_SECONDS ), 'created' => dreamscaper_now(),
		), $f ) );
		$id = $wpdb->insert_id;
		dreamscaper_crm_log( $p->user_id, $client, $id, 'quote', 'Quote started' );
		if ( 'lead' === $c->stage ) {
			$wpdb->update( dreamscaper_t( 'clients' ), array( 'stage' => 'prospect' ), array( 'id' => $c->id ) );
		}
	}
	return dreamscaper_quote_out( dreamscaper_crm_get( 'quotes', $id, $p->user_id ), true );
}

function dreamscaper_crm_quote_delete( WP_REST_Request $r ) {
	global $wpdb;
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$q = dreamscaper_crm_get( 'quotes', (int) $r->get_param( 'id' ), $p->user_id );
	if ( ! $q ) {
		return dreamscaper_crm_err( 'Quote not found.', 404 );
	}
	if ( 'signed' === $q->status ) {
		return dreamscaper_crm_err( 'Signed quotes are kept as your record of the agreement.' );
	}
	$wpdb->delete( dreamscaper_t( 'followups' ), array( 'quote_id' => $q->id ) );
	$wpdb->delete( dreamscaper_t( 'quotes' ), array( 'id' => $q->id ) );
	return array( 'ok' => true );
}

/** Copy a quote (also used for change orders on signed jobs). */
function dreamscaper_crm_quote_copy( WP_REST_Request $r ) {
	global $wpdb;
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$q = dreamscaper_crm_get( 'quotes', (int) $r->get_param( 'id' ), $p->user_id );
	if ( ! $q ) {
		return dreamscaper_crm_err( 'Quote not found.', 404 );
	}
	$row = (array) $q;
	unset( $row['id'] );
	$change = 'signed' === $q->status;
	$row    = array_merge( $row, array( 'number' => dreamscaper_next_number( $p->user_id, 'Q' ), 'title' => ( $change ? 'Change order – ' : 'Copy of ' ) . $q->title, 'status' => 'draft', 'job_status' => '', 'token' => dreamscaper_token(), 'job' => '{}', 'sign' => '{}', 'sent_at' => null, 'viewed_at' => null, 'signed_at' => null, 'created' => dreamscaper_now(), 'updated' => dreamscaper_now() ) );
	$wpdb->insert( dreamscaper_t( 'quotes' ), $row );
	return dreamscaper_quote_out( dreamscaper_crm_get( 'quotes', $wpdb->insert_id, $p->user_id ), true );
}

/** Send now (to chosen contacts) and/or for signature; also schedules the follow-up plan. */
function dreamscaper_crm_quote_send( WP_REST_Request $r ) {
	global $wpdb;
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$j = $r->get_json_params();
	$q = dreamscaper_crm_get( 'quotes', (int) ( isset( $j['id'] ) ? $j['id'] : 0 ), $p->user_id );
	if ( ! $q ) {
		return dreamscaper_crm_err( 'Quote not found.', 404 );
	}
	$docs = dreamscaper_json( $q->docs );
	if ( empty( $docs['proposal']['sections'] ) ) {
		return dreamscaper_crm_err( 'Build the estimate first — the proposal is empty.' );
	}
	$rec = array();
	foreach ( array_slice( (array) ( isset( $j['recipients'] ) ? $j['recipients'] : array() ), 0, 25 ) as $x ) {
		$e = sanitize_email( isset( $x['email'] ) ? $x['email'] : '' );
		$ph = sanitize_text_field( isset( $x['phone'] ) ? $x['phone'] : '' );
		if ( $e || $ph ) {
			$rec[] = array( 'name' => sanitize_text_field( isset( $x['name'] ) ? $x['name'] : '' ), 'email' => $e, 'phone' => $ph );
		}
	}
	if ( ! $rec ) {
		return dreamscaper_crm_err( 'Choose at least one contact to send it to.' );
	}
	$channel = in_array( isset( $j['channel'] ) ? $j['channel'] : '', array( 'email', 'sms', 'both' ), true ) ? $j['channel'] : 'email';
	if ( 'email' !== $channel && ! dreamscaper_pro_can( $p->user_id, 'sms' ) ) {
		return dreamscaper_plan_err( $p->user_id, 'sms' );
	}
	$inc     = array( 'link' => true, 'image' => ! empty( $j['include']['image'] ), 'total' => ! empty( $j['include']['total'] ), 'scope' => ! empty( $j['include']['scope'] ) );
	$res     = dreamscaper_crm_deliver( $q, $p, $rec, $channel, dreamscaper_crm_txt( $j, 'subject', 200 ), dreamscaper_crm_area( $j, 'body', 4000 ), $inc );
	if ( ! $res['sent'] ) {
		return dreamscaper_crm_err( $res['errors'] ? implode( ' ', $res['errors'] ) : 'Nothing was sent.' );
	}
	$wpdb->update( dreamscaper_t( 'quotes' ), array( 'status' => in_array( $q->status, array( 'viewed' ), true ) ? $q->status : 'sent', 'sent_at' => dreamscaper_now(), 'updated' => dreamscaper_now() ), array( 'id' => $q->id ) );
	dreamscaper_crm_log( $p->user_id, $q->client_id, $q->id, 'sent', 'Quote ' . $q->number . ' sent' . ( ! empty( $j['signature'] ) ? ' for signature' : '' ) . ' to ' . count( $rec ) . ' contact(s)' );
	if ( $q->user_id ) {
		dreamscaper_crm_tell_user( $q->user_id, $p->business . ' sent you a quote: ' . $q->title . '. Open My Projects to view and sign it.', $q->id );
	}
	if ( isset( $j['followups'] ) && is_array( $j['followups'] ) ) {
		dreamscaper_crm_followups_write( $q, $p, $j['followups'], $rec );
	}
	return array( 'ok' => true, 'sent' => $res['sent'], 'errors' => $res['errors'], 'quote' => dreamscaper_quote_out( dreamscaper_crm_get( 'quotes', $q->id, $p->user_id ), true ) );
}

function dreamscaper_crm_quote_status( WP_REST_Request $r ) {
	global $wpdb;
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$j = $r->get_json_params();
	$q = dreamscaper_crm_get( 'quotes', (int) ( isset( $j['id'] ) ? $j['id'] : 0 ), $p->user_id );
	if ( ! $q ) {
		return dreamscaper_crm_err( 'Quote not found.', 404 );
	}
	$s = isset( $j['status'] ) ? $j['status'] : '';
	if ( ! in_array( $s, array( 'draft', 'sent', 'declined', 'expired' ), true ) || 'signed' === $q->status ) {
		return dreamscaper_crm_err( 'That status can’t be set here.' );
	}
	$wpdb->update( dreamscaper_t( 'quotes' ), array( 'status' => $s, 'updated' => dreamscaper_now() ), array( 'id' => $q->id ) );
	if ( 'declined' === $s ) {
		$wpdb->update( dreamscaper_t( 'followups' ), array( 'status' => 'cancelled' ), array( 'quote_id' => $q->id, 'status' => 'scheduled' ) );
		dreamscaper_crm_log( $p->user_id, $q->client_id, $q->id, 'status', 'Marked as declined' . ( ! empty( $j['reason'] ) ? ': ' . sanitize_text_field( $j['reason'] ) : '' ) );
	}
	return dreamscaper_quote_out( dreamscaper_crm_get( 'quotes', $q->id, $p->user_id ), true );
}

/* --------------------------------------------------------------- follow-ups */

/** Replace a quote's scheduled follow-ups (already sent ones are kept as history). */
function dreamscaper_crm_followups_write( $q, $p, $items, $default_rec = array() ) {
	global $wpdb;
	$F = dreamscaper_t( 'followups' );
	$wpdb->query( $wpdb->prepare( "DELETE FROM $F WHERE quote_id=%d AND status IN ('scheduled','cancelled')", $q->id ) );
	$n = 0;
	foreach ( array_slice( (array) $items, 0, 20 ) as $f ) {
		if ( ! empty( $f['off'] ) ) {
			continue;
		}
		$at = isset( $f['at'] ) ? (int) ( $f['at'] / 1000 ) : 0;
		if ( $at < time() - 300 ) {
			continue;
		}
		$rec = isset( $f['recipients'] ) && is_array( $f['recipients'] ) && $f['recipients'] ? dreamscaper_crm_clean( $f['recipients'] ) : $default_rec;
		if ( ! $rec ) {
			$c   = dreamscaper_crm_get( 'clients', $q->client_id, $p->user_id );
			$rec = $c ? array( array( 'name' => $c->name, 'email' => $c->email, 'phone' => $c->phone ) ) : array();
		}
		$ch = in_array( isset( $f['channel'] ) ? $f['channel'] : '', array( 'email', 'sms', 'both' ), true ) ? $f['channel'] : 'email';
		if ( 'email' !== $ch && ! dreamscaper_pro_can( $p->user_id, 'sms' ) ) {
			$ch = 'email'; // texts aren't in this plan: the follow-up still goes by email
		}
		$wpdb->insert( $F, array(
			'pro_id' => $p->user_id, 'quote_id' => $q->id, 'client_id' => $q->client_id,
			'channel' => $ch,
			'send_at' => gmdate( 'Y-m-d H:i:s', $at ), 'subject' => dreamscaper_crm_txt( $f, 'subject', 200 ), 'body' => dreamscaper_crm_area( $f, 'body', 4000 ),
			'include' => wp_json_encode( array( 'link' => ! empty( $f['include']['link'] ), 'image' => ! empty( $f['include']['image'] ), 'total' => ! empty( $f['include']['total'] ), 'scope' => ! empty( $f['include']['scope'] ) ) ),
			'recipients' => wp_json_encode( $rec ), 'status' => 'scheduled',
		) );
		$n++;
	}
	return $n;
}
function dreamscaper_crm_followups_save( WP_REST_Request $r ) {
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$j = $r->get_json_params();
	$q = dreamscaper_crm_get( 'quotes', (int) ( isset( $j['quote_id'] ) ? $j['quote_id'] : 0 ), $p->user_id );
	if ( ! $q ) {
		return dreamscaper_crm_err( 'Quote not found.', 404 );
	}
	$n = dreamscaper_crm_followups_write( $q, $p, isset( $j['items'] ) ? $j['items'] : array() );
	return array( 'scheduled' => $n, 'quote' => dreamscaper_quote_out( $q, true ) );
}
/** Send one follow-up to the contractor themself, to preview it. */
function dreamscaper_crm_followup_test( WP_REST_Request $r ) {
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$j = $r->get_json_params();
	$q = dreamscaper_crm_get( 'quotes', (int) ( isset( $j['quote_id'] ) ? $j['quote_id'] : 0 ), $p->user_id );
	if ( ! $q ) {
		return dreamscaper_crm_err( 'Save the quote first.', 404 );
	}
	$ch  = in_array( isset( $j['channel'] ) ? $j['channel'] : '', array( 'email', 'sms', 'both' ), true ) ? $j['channel'] : 'email';
	$res = dreamscaper_crm_deliver( $q, $p, array( array( 'name' => '', 'email' => $p->email, 'phone' => $p->phone ) ), $ch, '[Test] ' . dreamscaper_crm_txt( $j, 'subject', 200 ), dreamscaper_crm_area( $j, 'body', 4000 ), isset( $j['include'] ) ? (array) $j['include'] : array() );
	return $res['sent'] ? array( 'ok' => true ) : dreamscaper_crm_err( implode( ' ', $res['errors'] ) ? implode( ' ', $res['errors'] ) : 'Not sent.' );
}

/* ---------------------------------------------------------------- AI wording */

/**
 * AI rewrites the customer-facing wording ONLY. Quantities and prices are fixed inputs;
 * the model must echo them exactly. Output is validated against the input numbers.
 */
function dreamscaper_crm_ai_scope( WP_REST_Request $r ) {
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$gate = dreamscaper_pro_gate( $p->user_id, 'ai' );
	if ( is_wp_error( $gate ) ) {
		return $gate;
	}
	if ( ! dreamscaper_opt( 'fal_key' ) ) {
		return dreamscaper_crm_err( 'AI wording needs the fal.ai key (Settings → DreamScaper → AI).', 503 );
	}
	if ( ! dreamscaper_limit( 'crmai', 60, DAY_IN_SECONDS ) ) {
		return dreamscaper_crm_err( 'That’s a lot of AI writing today. Try again tomorrow.', 429 );
	}
	$j        = $r->get_json_params();
	$sections = array();
	foreach ( array_slice( (array) ( isset( $j['sections'] ) ? $j['sections'] : array() ), 0, 30 ) as $s ) {
		$sections[] = array( 'id' => sanitize_key( isset( $s['id'] ) ? $s['id'] : '' ), 'title' => sanitize_text_field( isset( $s['title'] ) ? $s['title'] : '' ), 'scope' => array_map( 'sanitize_text_field', array_slice( (array) ( isset( $s['scope'] ) ? $s['scope'] : array() ), 0, 20 ) ) );
	}
	if ( ! $sections ) {
		return dreamscaper_crm_err( 'Nothing to write yet.' );
	}
	$images = array();
	foreach ( array( 'before', 'after' ) as $k ) {
		if ( ! empty( $j[ $k ] ) && preg_match( '#^https?://#', $j[ $k ] ) ) {
			$images[] = esc_url_raw( $j[ $k ] );
		}
	}
	$system = 'You are an estimator for a professional residential landscaping company in Connecticut. You write clear, specific, plain-English proposal text that a homeowner understands and that precisely defines what the contractor will do. You never invent work, materials, quantities, sizes, depths, dimensions or prices. Reply with JSON only.';
	$prompt = "Rewrite the scope of work below so it reads well in a customer proposal.\n\nRules:\n1. Keep every section id and title meaning. You may polish the title.\n2. Every number in the input (quantities, square feet, cubic yards, tons, inches, feet, counts) must appear unchanged in your output. Do not add any new numbers.\n3. Do not add or remove work items. Do not mention prices.\n4. Each bullet: one action, starting with a verb, under 25 words.\n5. Add an 'intro' of 2-3 sentences describing the finished result" . ( $images ? ' as seen in the attached before (first image) and design (second image) pictures' : '' ) . ". The intro must not contain numbers.\n6. Output schema: {\"intro\": string, \"sections\": [{\"id\": string, \"title\": string, \"scope\": [string]}]}\n\nInput:\n" . wp_json_encode( $sections );
	$args   = array( 'model' => dreamscaper_opt( 'vision_model' ), 'system_prompt' => $system, 'prompt' => $prompt, 'max_tokens' => 2500, 'temperature' => 0.2 );
	$model  = 'fal-ai/any-llm';
	if ( $images ) {
		$args['image_urls'] = $images;
		$model              = 'fal-ai/any-llm/vision';
	}
	$out = dreamscaper_fal( $model, $args, 60 );
	if ( is_wp_error( $out ) ) {
		return $out;
	}
	$txt = isset( $out['output'] ) ? (string) $out['output'] : '';
	if ( preg_match( '/\{.*\}/s', $txt, $m ) ) {
		$txt = $m[0];
	}
	$res = json_decode( $txt, true );
	if ( ! is_array( $res ) || empty( $res['sections'] ) ) {
		return dreamscaper_crm_err( 'The AI answer didn’t come through. Please try again.', 502 );
	}
	// Validate: per section, the multiset of numbers must be unchanged; otherwise keep the original wording.
	$nums = function ( $lines ) {
		preg_match_all( '/\d+(?:[.,]\d+)?/', implode( ' ', (array) $lines ), $m );
		$n = array_map( function ( $x ) { return str_replace( ',', '', $x ); }, $m[0] );
		sort( $n );
		return $n;
	};
	$by    = array();
	foreach ( $res['sections'] as $s ) {
		if ( isset( $s['id'] ) ) {
			$by[ $s['id'] ] = $s;
		}
	}
	$final = array();
	$kept  = 0;
	foreach ( $sections as $s ) {
		$ai = isset( $by[ $s['id'] ] ) ? $by[ $s['id'] ] : null;
		if ( $ai && ! empty( $ai['scope'] ) && $nums( $ai['scope'] ) === $nums( $s['scope'] ) ) {
			$final[] = array( 'id' => $s['id'], 'title' => sanitize_text_field( isset( $ai['title'] ) ? $ai['title'] : $s['title'] ), 'scope' => array_map( 'sanitize_text_field', array_slice( (array) $ai['scope'], 0, 20 ) ) );
		} else {
			$final[] = $s;
			$kept++;
		}
	}
	$intro = sanitize_textarea_field( isset( $res['intro'] ) ? (string) $res['intro'] : '' );
	if ( preg_match( '/\d/', $intro ) ) {
		$intro = '';
	}
	return array( 'intro' => $intro, 'sections' => $final, 'kept' => $kept );
}

/** Elevation samples (USGS 3DEP) around a point → slope estimate across the lot. */
function dreamscaper_crm_elevation( WP_REST_Request $r ) {
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$gate = dreamscaper_pro_gate( $p->user_id, 'ai' );
	if ( is_wp_error( $gate ) ) {
		return $gate;
	}
	$lat = (float) $r->get_param( 'lat' );
	$lng = (float) $r->get_param( 'lng' );
	if ( ! $lat || ! $lng ) {
		return dreamscaper_crm_err( 'Add the property’s location first.' );
	}
	$ck = 'dscp_elev_' . md5( round( $lat, 5 ) . ',' . round( $lng, 5 ) );
	$c  = get_transient( $ck );
	if ( $c ) {
		return $c;
	}
	$d   = 60 / 3.28084; // 60 ft in meters
	$pts = array( 'center' => array( $lat, $lng ), 'north' => array( $lat + $d / 111320, $lng ), 'south' => array( $lat - $d / 111320, $lng ), 'east' => array( $lat, $lng + $d / ( 111320 * cos( deg2rad( $lat ) ) ) ), 'west' => array( $lat, $lng - $d / ( 111320 * cos( deg2rad( $lat ) ) ) ) );
	$ft  = array();
	foreach ( $pts as $k => $pt ) {
		$res = wp_remote_get( add_query_arg( array( 'x' => $pt[1], 'y' => $pt[0], 'units' => 'Feet', 'wkid' => 4326 ), 'https://epqs.nationalmap.gov/v1/json' ), array( 'timeout' => 10 ) );
		$j   = is_wp_error( $res ) ? null : json_decode( wp_remote_retrieve_body( $res ), true );
		if ( ! isset( $j['value'] ) || ! is_numeric( $j['value'] ) || $j['value'] < -1000 ) {
			return dreamscaper_crm_err( 'The elevation service didn’t answer. Try again later, or set the slope by hand.', 502 );
		}
		$ft[ $k ] = round( (float) $j['value'], 1 );
	}
	$ns    = abs( $ft['north'] - $ft['south'] ) / 120 * 100;
	$ew    = abs( $ft['east'] - $ft['west'] ) / 120 * 100;
	$slope = round( max( $ns, $ew ), 1 );
	$out   = array( 'elev' => $ft, 'slope' => $slope, 'class' => $slope < 2 ? 'flat' : ( $slope < 6 ? 'gentle' : ( $slope < 15 ? 'moderate' : 'steep' ) ), 'downhill' => $ns >= $ew ? ( $ft['north'] < $ft['south'] ? 'north' : 'south' ) : ( $ft['east'] < $ft['west'] ? 'east' : 'west' ), 'source' => 'USGS 3D Elevation Program' );
	set_transient( $ck, $out, 30 * DAY_IN_SECONDS );
	return $out;
}

/* --------------------------------------------------------------- schedule */

function dreamscaper_crm_schedule( WP_REST_Request $r ) {
	global $wpdb;
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$from = (int) ( $r->get_param( 'from' ) / 1000 );
	$to   = (int) ( $r->get_param( 'to' ) / 1000 );
	if ( ! $from || ! $to || $to < $from ) {
		$from = time() - 7 * DAY_IN_SECONDS;
		$to   = time() + 60 * DAY_IN_SECONDS;
	}
	$rows = $wpdb->get_results( $wpdb->prepare( 'SELECT v.*, c.name client_name, c.address client_address, c.town client_town, c.phone client_phone FROM ' . dreamscaper_t( 'visits' ) . ' v LEFT JOIN ' . dreamscaper_t( 'clients' ) . ' c ON c.id=v.client_id WHERE v.pro_id=%d AND v.start >= %s AND v.start <= %s ORDER BY v.start', $p->user_id, gmdate( 'Y-m-d H:i:s', $from ), gmdate( 'Y-m-d H:i:s', $to ) ) );
	$jobs = $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( 'quotes' ) . " WHERE pro_id=%d AND status='signed' AND job_status NOT IN ('done','cancelled') ORDER BY signed_at", $p->user_id ) );
	return array(
		'items' => array_map( function ( $v ) {
			$o = dreamscaper_visit_out( $v );
			$o['client'] = $v->client_name;
			$o['address'] = trim( $v->client_address . ( $v->client_town ? ', ' . $v->client_town : '' ), ', ' );
			$o['phone'] = $v->client_phone;
			return $o;
		}, $rows ),
		'jobs'  => array_map( 'dreamscaper_quote_out', $jobs ),
		'crew'  => ( function () use ( $p ) { $s = dreamscaper_pro_settings( $p ); return isset( $s['crew'] ) ? $s['crew'] : array(); } )(),
	);
}

function dreamscaper_crm_visit_save( WP_REST_Request $r ) {
	global $wpdb;
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$j     = $r->get_json_params();
	$id    = (int) ( isset( $j['id'] ) ? $j['id'] : 0 );
	$v     = $id ? dreamscaper_crm_get( 'visits', $id, $p->user_id ) : null;
	$quote = (int) ( isset( $j['quote_id'] ) ? $j['quote_id'] : ( $v ? $v->quote_id : 0 ) );
	$q     = $quote ? dreamscaper_crm_get( 'quotes', $quote, $p->user_id ) : null;
	$start = (int) ( isset( $j['start'] ) ? $j['start'] / 1000 : 0 );
	$end   = (int) ( isset( $j['end'] ) ? $j['end'] / 1000 : 0 );
	if ( ! $start || $end <= $start ) {
		return dreamscaper_crm_err( 'Pick a start and end time.' );
	}
	$kinds = array_keys( dreamscaper_visit_kinds() );
	$f = array(
		'quote_id' => $q ? $q->id : 0, 'client_id' => $q ? $q->client_id : (int) ( isset( $j['client_id'] ) ? $j['client_id'] : 0 ),
		'title' => dreamscaper_crm_txt( $j, 'title', 160 ), 'start' => gmdate( 'Y-m-d H:i:s', $start ), 'end' => gmdate( 'Y-m-d H:i:s', $end ),
		'crew' => dreamscaper_crm_txt( $j, 'crew', 255 ), 'notes' => dreamscaper_crm_area( $j, 'notes', 2000 ),
		'status' => in_array( isset( $j['status'] ) ? $j['status'] : '', array( 'scheduled', 'confirmed', 'in_progress', 'done', 'cancelled' ), true ) ? $j['status'] : 'scheduled',
		'kind' => in_array( isset( $j['kind'] ) ? $j['kind'] : '', $kinds, true ) ? $j['kind'] : ( $v ? $v->kind : ( $q && in_array( $q->status, array( 'request', 'draft' ), true ) ? 'site_visit' : 'job' ) ),
		'location' => dreamscaper_crm_txt( $j, 'location', 200 ),
	);
	if ( array_key_exists( 'remind', $j ) ) {
		$f['remind'] = is_array( $j['remind'] ) && isset( $j['remind']['customer'] ) ? wp_json_encode( array( 'customer' => dreamscaper_reminder_clean( $j['remind']['customer'] ) ) ) : '';
	}
	if ( $f['client_id'] && ! dreamscaper_crm_get( 'clients', $f['client_id'], $p->user_id ) ) {
		$f['client_id'] = 0;
	}
	if ( ! $f['title'] ) {
		$f['title'] = $q ? $q->title : 'Visit';
	}
	$what = 'booked';
	if ( $v ) {
		$moved = $v->start !== $f['start'] || $v->end !== $f['end'];
		if ( $moved ) {
			$f['cust_status'] = ''; // the customer confirms the new time
			$f['seq']         = (int) $v->seq + 1;
		}
		$what = 'cancelled' === $f['status'] && 'cancelled' !== $v->status ? 'cancelled' : ( $moved ? 'changed' : '' );
		$wpdb->update( dreamscaper_t( 'visits' ), $f, array( 'id' => $v->id ) );
	} else {
		$wpdb->insert( dreamscaper_t( 'visits' ), array_merge( $f, array( 'pro_id' => $p->user_id, 'uid' => dreamscaper_token(), 'created' => dreamscaper_now() ) ) );
		$id = $wpdb->insert_id;
		if ( $q && ! $q->job_status && 'job' === $f['kind'] ) {
			$wpdb->update( dreamscaper_t( 'quotes' ), array( 'job_status' => 'scheduled' ), array( 'id' => $q->id ) );
		}
		dreamscaper_crm_log( $p->user_id, $f['client_id'], $f['quote_id'], 'visit', 'Scheduled: ' . $f['title'] . ' on ' . wp_date( 'D M j, g:i a', $start ) );
	}
	$row    = dreamscaper_crm_get( 'visits', $id, $p->user_id );
	$notify = isset( $j['notify'] ) ? (bool) $j['notify'] : null;
	$res    = $what ? dreamscaper_visit_after_save( $row, $what, $notify ) : array( 'sent' => 0 );
	if ( ! $what ) {
		dreamscaper_reminders_rebuild( $row );
	}
	$out          = dreamscaper_visit_out( dreamscaper_crm_get( 'visits', $id, $p->user_id ) );
	$out['told']  = ! empty( $res['channels'] ) ? $res['channels'] : array();
	return $out;
}
function dreamscaper_crm_visit_delete( WP_REST_Request $r ) {
	global $wpdb;
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$v = dreamscaper_crm_get( 'visits', (int) $r->get_param( 'id' ), $p->user_id );
	if ( ! $v ) {
		return dreamscaper_crm_err( 'Visit not found.', 404 );
	}
	// an upcoming appointment the customer knows about gets a cancellation notice first
	if ( strtotime( $v->start . ' UTC' ) > time() && ! in_array( $v->status, array( 'cancelled', 'done' ), true ) && false !== $r->get_param( 'notify' ) && '0' !== (string) $r->get_param( 'notify' ) ) {
		$v->status = 'cancelled';
		dreamscaper_visit_after_save( $v, 'cancelled' );
	}
	$wpdb->delete( dreamscaper_t( 'visits' ), array( 'id' => $v->id ) );
	if ( (int) get_option( 'dreamscaper_cal_db' ) ) {
		$wpdb->delete( dreamscaper_t( 'reminders' ), array( 'visit_id' => $v->id, 'status' => 'scheduled' ) );
	}
	return array( 'ok' => true );
}
/** Dispatch: send the crew sheet and/or tell the customer when you're coming. */
function dreamscaper_crm_visit_notify( WP_REST_Request $r ) {
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$j = $r->get_json_params();
	$v = dreamscaper_crm_get( 'visits', (int) ( isset( $j['id'] ) ? $j['id'] : 0 ), $p->user_id );
	if ( ! $v ) {
		return dreamscaper_crm_err( 'Visit not found.', 404 );
	}
	$c    = $v->client_id ? dreamscaper_crm_get( 'clients', $v->client_id, $p->user_id ) : null;
	$q    = $v->quote_id ? dreamscaper_crm_get( 'quotes', $v->quote_id, $p->user_id ) : null;
	$when = wp_date( 'l, F j \a\t g:i a', strtotime( $v->start . ' UTC' ) );
	$sent = 0;
	$errs = array();
	if ( ! empty( $j['customer'] ) && $c ) {
		$chs = array( 'email', 'inapp' );
		if ( ! empty( $j['sms'] ) && dreamscaper_pro_can( $p->user_id, 'sms' ) ) {
			$chs[] = 'sms';
		}
		$res  = dreamscaper_tpl_send( $p, 'appt_booked', array( 'visit' => $v, 'client' => $c, 'quote' => $q ), dreamscaper_tpl_to_client( $c ), array( 'force' => true, 'channels' => $chs, 'thread_id' => $q ? dreamscaper_thread_for_quote( $q ) : dreamscaper_thread_for_client( $c ), 'ref_type' => 'visit', 'ref_id' => $v->id, 'link' => dreamscaper_app_url( array( 'ds_projects' => 1 ) ), 'button' => 'Confirm or reschedule', 'target' => $v->quote_id ) );
		$sent += count( array_diff( $res['channels'], array( 'inapp' ) ) );
		$errs  = array_merge( $errs, array_diff( $res['errors'], array( 'quiet hours' ) ) );
		dreamscaper_crm_log( $p->user_id, $v->client_id, $v->quote_id, 'visit', 'Customer told about visit on ' . $when );
	}
	if ( ! empty( $j['crew'] ) ) {
		$to = array_filter( array_map( 'sanitize_text_field', (array) $j['crew'] ) );
		$sheet = "Job: {$v->title}\nWhen: {$when}\n" . ( $c ? "Customer: {$c->name} {$c->phone}\nAddress: " . trim( $c->address . ', ' . $c->town ) . "\nMap: https://maps.google.com/?q=" . rawurlencode( trim( $c->address . ', ' . $c->town . ', ' . $c->state ) ) . "\n" : '' ) . ( $v->notes ? "Notes: {$v->notes}\n" : '' );
		if ( $q ) {
			$docs = dreamscaper_json( $q->docs );
			$sheet .= "\nScope:\n";
			foreach ( isset( $docs['proposal']['sections'] ) ? $docs['proposal']['sections'] : array() as $s ) {
				if ( empty( $s['optional'] ) ) {
					$sheet .= '- ' . $s['title'] . "\n";
					foreach ( (array) $s['scope'] as $line ) {
						$sheet .= '    ' . $line . "\n";
					}
				}
			}
		}
		foreach ( $to as $dest ) {
			if ( is_email( $dest ) ) {
				$ok = dreamscaper_crm_mail( $p, $dest, 'Crew sheet: ' . $v->title . ' – ' . $when, $sheet );
			} else {
				$ok = dreamscaper_sms( $dest, mb_substr( $sheet, 0, 1400 ) );
			}
			if ( true === $ok ) {
				$sent++;
			} else {
				$errs[] = $ok->get_error_message();
			}
		}
	}
	return $sent ? array( 'ok' => true, 'sent' => $sent, 'errors' => $errs ) : dreamscaper_crm_err( $errs ? implode( ' ', array_unique( $errs ) ) : 'Nothing to send — add the customer’s email/phone or crew contacts.' );
}

/* ----------------------------------------------------------- job costing */

/** Job status + actual costs (materials, labor hours, equipment, subs) + finished photos. */
function dreamscaper_crm_job_save( WP_REST_Request $r ) {
	global $wpdb;
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$j = $r->get_json_params();
	$q = dreamscaper_crm_get( 'quotes', (int) ( isset( $j['id'] ) ? $j['id'] : 0 ), $p->user_id );
	if ( ! $q || 'signed' !== $q->status ) {
		return dreamscaper_crm_err( 'Jobs start when a quote is signed.' );
	}
	$job = dreamscaper_json( $q->job );
	if ( isset( $j['actuals'] ) && is_array( $j['actuals'] ) ) {
		$job['actuals'] = dreamscaper_crm_clean( $j['actuals'] );
	}
	if ( isset( $j['photos'] ) && is_array( $j['photos'] ) ) {
		$ph = array();
		foreach ( array_slice( $j['photos'], 0, 12 ) as $x ) {
			$u = dreamscaper_crm_store_image( $x, 8 * MB_IN_BYTES );
			if ( $u ) {
				$ph[] = $u;
			}
		}
		$job['photos'] = $ph;
	}
	if ( isset( $j['showcase'] ) ) {
		$job['showcase'] = ! empty( $j['showcase'] );
	}
	if ( isset( $j['notes'] ) ) {
		$job['notes'] = dreamscaper_crm_area( $j, 'notes', 4000 );
	}
	$f      = array( 'job' => wp_json_encode( $job ), 'updated' => dreamscaper_now() );
	$status = isset( $j['job_status'] ) ? $j['job_status'] : '';
	if ( in_array( $status, array( 'scheduled', 'in_progress', 'done', 'cancelled' ), true ) && $status !== $q->job_status ) {
		$f['job_status'] = $status;
		if ( 'done' === $status ) {
			$wpdb->query( $wpdb->prepare( 'UPDATE ' . dreamscaper_t( 'pros' ) . ' SET jobs_done=jobs_done+1 WHERE user_id=%d', $p->user_id ) );
			$wpdb->update( dreamscaper_t( 'clients' ), array( 'stage' => 'customer' ), array( 'id' => $q->client_id ) );
			$job['done_at'] = time() * 1000;
			$f['job']       = wp_json_encode( $job );
			$c              = dreamscaper_crm_get( 'clients', $q->client_id, $p->user_id );
			dreamscaper_tpl_send( $p, 'job_complete', array( 'quote' => $q, 'client' => $c ), dreamscaper_tpl_to_client( $c ), array( 'thread_id' => dreamscaper_thread_for_quote( $q ), 'ref_type' => 'quote', 'ref_id' => $q->id, 'target' => $q->id, 'link' => dreamscaper_app_url( array( 'ds_projects' => 1 ) ), 'button' => 'Open my project' ) );
		}
		dreamscaper_crm_log( $p->user_id, $q->client_id, $q->id, 'job', 'Job ' . str_replace( '_', ' ', $status ) );
	}
	$wpdb->update( dreamscaper_t( 'quotes' ), $f, array( 'id' => $q->id ) );
	return dreamscaper_quote_out( dreamscaper_crm_get( 'quotes', $q->id, $p->user_id ), true );
}

/* --------------------------------------------------------------- invoices */

function dreamscaper_crm_invoices( WP_REST_Request $r ) {
	global $wpdb;
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$rows = $wpdb->get_results( $wpdb->prepare( 'SELECT i.*, c.name client_name FROM ' . dreamscaper_t( 'invoices' ) . ' i LEFT JOIN ' . dreamscaper_t( 'clients' ) . ' c ON c.id=i.client_id WHERE i.pro_id=%d ORDER BY i.id DESC LIMIT 300', $p->user_id ) );
	return array( 'items' => array_map( function ( $i ) {
		$o = dreamscaper_invoice_out( $i );
		$o['client'] = $i->client_name;
		return $o;
	}, $rows ) );
}

function dreamscaper_crm_invoice_save( WP_REST_Request $r ) {
	global $wpdb;
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$j   = $r->get_json_params();
	$id  = (int) ( isset( $j['id'] ) ? $j['id'] : 0 );
	$inv = $id ? dreamscaper_crm_get( 'invoices', $id, $p->user_id ) : null;
	if ( $inv && 'paid' === $inv->status ) {
		return dreamscaper_crm_err( 'Paid invoices can’t be changed.' );
	}
	$q      = ! empty( $j['quote_id'] ) ? dreamscaper_crm_get( 'quotes', (int) $j['quote_id'], $p->user_id ) : null;
	$client = $q ? (int) $q->client_id : (int) ( isset( $j['client_id'] ) ? $j['client_id'] : ( $inv ? $inv->client_id : 0 ) );
	$c      = dreamscaper_crm_get( 'clients', $client, $p->user_id );
	if ( ! $c ) {
		return dreamscaper_crm_err( 'Choose a customer for this invoice.' );
	}
	$items = array();
	$sum   = 0;
	foreach ( array_slice( (array) ( isset( $j['items'] ) ? $j['items'] : array() ), 0, 60 ) as $it ) {
		$qty  = round( (float) ( isset( $it['qty'] ) ? $it['qty'] : 1 ), 2 );
		$rate = round( (float) ( isset( $it['rate'] ) ? $it['rate'] : 0 ), 2 );
		$name = mb_substr( sanitize_text_field( isset( $it['name'] ) ? $it['name'] : '' ), 0, 200 );
		if ( '' === $name ) {
			continue;
		}
		$items[] = array( 'name' => $name, 'qty' => $qty, 'rate' => $rate );
		$sum    += $qty * $rate;
	}
	if ( $sum <= 0 ) {
		return dreamscaper_crm_err( 'Add at least one line with an amount.' );
	}
	$f = array(
		'client_id' => $client, 'quote_id' => $q ? $q->id : 0, 'user_id' => (int) $c->user_id,
		'kind' => in_array( isset( $j['kind'] ) ? $j['kind'] : '', array( 'deposit', 'progress', 'final', 'recurring', 'other' ), true ) ? $j['kind'] : 'final',
		'title' => dreamscaper_crm_txt( $j, 'title', 160 ), 'items' => wp_json_encode( $items ), 'amount' => round( $sum, 2 ),
		'due' => ! empty( $j['due'] ) && preg_match( '/^\d{4}-\d{2}-\d{2}$/', $j['due'] ) ? $j['due'] : gmdate( 'Y-m-d', strtotime( '+14 days' ) ),
		'recur' => in_array( isset( $j['recur'] ) ? $j['recur'] : '', array( 'weekly', 'monthly', 'yearly' ), true ) ? $j['recur'] : '',
	);
	$f['next_at'] = $f['recur'] ? ( ! empty( $j['next_at'] ) && preg_match( '/^\d{4}-\d{2}-\d{2}$/', $j['next_at'] ) ? $j['next_at'] : gmdate( 'Y-m-d', strtotime( $f['due'] . ( 'weekly' === $f['recur'] ? ' +1 week' : ( 'yearly' === $f['recur'] ? ' +1 year' : ' +1 month' ) ) ) ) ) : null;
	if ( ! $f['title'] ) {
		$f['title'] = ( $q ? $q->title : 'Landscape services' ) . ' – ' . ucfirst( $f['kind'] );
	}
	if ( $inv ) {
		$wpdb->update( dreamscaper_t( 'invoices' ), $f, array( 'id' => $inv->id ) );
	} else {
		$wpdb->insert( dreamscaper_t( 'invoices' ), array_merge( $f, array( 'pro_id' => $p->user_id, 'number' => dreamscaper_next_number( $p->user_id, 'INV' ), 'status' => 'draft', 'token' => dreamscaper_token(), 'created' => dreamscaper_now() ) ) );
		$id = $wpdb->insert_id;
	}
	if ( ! empty( $j['status'] ) && in_array( $j['status'], array( 'void', 'paid' ), true ) ) {
		$wpdb->update( dreamscaper_t( 'invoices' ), array( 'status' => $j['status'], 'paid_at' => 'paid' === $j['status'] ? dreamscaper_now() : null ), array( 'id' => $id ) );
		if ( 'paid' === $j['status'] ) {
			dreamscaper_crm_log( $p->user_id, $client, $q ? $q->id : 0, 'payment', 'Invoice marked paid (' . sanitize_text_field( isset( $j['method'] ) ? $j['method'] : 'cash/check' ) . ')' );
		}
	}
	return dreamscaper_invoice_out( dreamscaper_crm_get( 'invoices', $id, $p->user_id ) );
}

function dreamscaper_crm_invoice_send( WP_REST_Request $r ) {
	global $wpdb;
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$inv = dreamscaper_crm_get( 'invoices', (int) $r->get_param( 'id' ), $p->user_id );
	if ( ! $inv || in_array( $inv->status, array( 'paid', 'void' ), true ) ) {
		return dreamscaper_crm_err( 'This invoice can’t be sent.' );
	}
	$wpdb->update( dreamscaper_t( 'invoices' ), array( 'status' => 'sent', 'sent_at' => dreamscaper_now() ), array( 'id' => $inv->id ) );
	$inv = dreamscaper_crm_get( 'invoices', $inv->id, $p->user_id );
	if ( ! dreamscaper_invoice_email( $inv ) ) {
		return dreamscaper_crm_err( 'The customer needs an email address to receive invoices. The link is ready to share: ' . dreamscaper_invoice_url( $inv->token ) );
	}
	return dreamscaper_invoice_out( $inv );
}

/* ---------------------------------------------------------------- reviews */

function dreamscaper_review_out( $rv ) {
	$m = function_exists( 'dreamscaper_member' ) ? dreamscaper_member( (int) $rv->user_id ) : array( 'name' => 'Customer' );
	global $wpdb;
	$q   = $wpdb->get_row( $wpdb->prepare( 'SELECT title, design FROM ' . dreamscaper_t( 'quotes' ) . ' WHERE id=%d', $rv->quote_id ) );
	$des = $q ? dreamscaper_json( $q->design ) : array();
	return array( 'id' => (int) $rv->id, 'stars' => (int) $rv->stars, 'reality' => (int) $rv->reality, 'text' => $rv->text, 'photo' => $rv->photo, 'reply' => $rv->reply, 'at' => dreamscaper_ms( $rv->created ), 'by' => array( 'name' => $m['name'], 'avatar' => isset( $m['avatar'] ) ? $m['avatar'] : '' ), 'project' => $q ? $q->title : '', 'design' => isset( $des['after'] ) ? $des['after'] : '', 'before' => isset( $des['before'] ) ? $des['before'] : '' );
}
function dreamscaper_crm_review_reply( WP_REST_Request $r ) {
	global $wpdb;
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$j  = $r->get_json_params();
	$rv = dreamscaper_crm_get( 'reviews', (int) ( isset( $j['id'] ) ? $j['id'] : 0 ), $p->user_id );
	if ( ! $rv ) {
		return dreamscaper_crm_err( 'Review not found.', 404 );
	}
	$wpdb->update( dreamscaper_t( 'reviews' ), array( 'reply' => dreamscaper_crm_area( $j, 'reply', 2000 ) ), array( 'id' => $rv->id ) );
	return dreamscaper_review_out( dreamscaper_crm_get( 'reviews', $rv->id, $p->user_id ) );
}

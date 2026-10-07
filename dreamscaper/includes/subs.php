<?php
/**
 * DreamScaper – contractor subscriptions.
 *
 *  - Four paid tiers: Starter, Professional, Business, Pro+ (names, prices, limits, features and the
 *    "what's included" lists are all editable in Settings → DreamScaper Plans).
 *  - Monthly allowances per plan: AI credits, landscape plans, storage, field employees and crews.
 *  - One 30-day trial per business, ever: verified phone (text code) and email, a card on file
 *    (Stripe Checkout, not charged until day 31), and a hashed ledger of every identity that has
 *    used a trial (email, phone, card, Stripe customer, business, address, license, account).
 *  - A missed payment steps down in stages, counted from the first failed payment (days editable):
 *      notice (day 0–3) and reminder (4–7): full access, banner + email (+ text if opted in)
 *      restricted (8–10): full access except new AI, landscape plans, credit/storage purchases and
 *                         large uploads — the things that cost us money
 *      readonly (11–13):  view, export and pay only; hidden from homeowners
 *      suspended (14+):   status 'paused' in the database; same access as readonly
 *    Nothing is ever deleted. Paying restores everything instantly and automatically.
 *  - The gate: every contractor write goes through dreamscaper_crm_pro(), which asks
 *    dreamscaper_pro_writable(); feature checks use dreamscaper_pro_can() / dreamscaper_pro_limit();
 *    costly actions ask dreamscaper_pro_costly_err().
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'DREAMSCAPER_SUBS_DB', 1 );

function dreamscaper_subs_install_db() {
	global $wpdb;
	require_once ABSPATH . 'wp-admin/includes/upgrade.php';
	$c = $wpdb->get_charset_collate();
	dbDelta( 'CREATE TABLE ' . dreamscaper_t( 'subs' ) . " (
		pro_id bigint(20) unsigned NOT NULL,
		plan varchar(12) NOT NULL DEFAULT 'pro',
		status varchar(12) NOT NULL DEFAULT 'none',
		billing varchar(6) NOT NULL DEFAULT 'month',
		seats int(11) NOT NULL DEFAULT 1,
		stripe_customer varchar(40) NOT NULL DEFAULT '',
		stripe_sub varchar(40) NOT NULL DEFAULT '',
		stripe_price varchar(60) NOT NULL DEFAULT '',
		trial_ends datetime DEFAULT NULL,
		period_end datetime DEFAULT NULL,
		cancel_at datetime DEFAULT NULL,
		past_due_at datetime DEFAULT NULL,
		paused_at datetime DEFAULT NULL,
		last_payment datetime DEFAULT NULL,
		failures int(11) NOT NULL DEFAULT 0,
		notes text,
		synced datetime DEFAULT NULL,
		created datetime NOT NULL,
		updated datetime NOT NULL,
		PRIMARY KEY  (pro_id),
		KEY status (status),
		KEY stripe_sub (stripe_sub),
		KEY stripe_customer (stripe_customer)
	) $c;" );
	dbDelta( 'CREATE TABLE ' . dreamscaper_t( 'sub_events' ) . " (
		id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
		pro_id bigint(20) unsigned NOT NULL,
		kind varchar(20) NOT NULL,
		from_status varchar(12) NOT NULL DEFAULT '',
		to_status varchar(12) NOT NULL DEFAULT '',
		plan varchar(12) NOT NULL DEFAULT '',
		amount decimal(10,2) NOT NULL DEFAULT 0,
		stripe_event varchar(80) NOT NULL DEFAULT '',
		note varchar(255) NOT NULL DEFAULT '',
		actor bigint(20) unsigned NOT NULL DEFAULT 0,
		created datetime NOT NULL,
		PRIMARY KEY  (id),
		KEY pro_id (pro_id,id)
	) $c;" );
	dbDelta( 'CREATE TABLE ' . dreamscaper_t( 'trials' ) . " (
		id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
		user_id bigint(20) unsigned NOT NULL DEFAULT 0,
		pro_id bigint(20) unsigned NOT NULL DEFAULT 0,
		started datetime NOT NULL,
		ends datetime DEFAULT NULL,
		outcome varchar(12) NOT NULL DEFAULT 'active',
		h_user char(64) NOT NULL DEFAULT '',
		h_email char(64) NOT NULL DEFAULT '',
		h_phone char(64) NOT NULL DEFAULT '',
		h_card char(64) NOT NULL DEFAULT '',
		h_customer char(64) NOT NULL DEFAULT '',
		h_business char(64) NOT NULL DEFAULT '',
		h_address char(64) NOT NULL DEFAULT '',
		h_license char(64) NOT NULL DEFAULT '',
		h_ip char(64) NOT NULL DEFAULT '',
		h_device char(64) NOT NULL DEFAULT '',
		note varchar(255) NOT NULL DEFAULT '',
		created datetime NOT NULL,
		PRIMARY KEY  (id),
		KEY h_user (h_user),
		KEY h_email (h_email),
		KEY h_phone (h_phone),
		KEY h_card (h_card),
		KEY h_customer (h_customer),
		KEY h_business (h_business),
		KEY h_address (h_address),
		KEY h_license (h_license),
		KEY h_ip (h_ip),
		KEY h_device (h_device)
	) $c;" );
	update_option( 'dreamscaper_subs_db', DREAMSCAPER_SUBS_DB );
}
add_action( 'init', function () {
	if ( (int) get_option( 'dreamscaper_subs_db' ) !== DREAMSCAPER_SUBS_DB ) {
		dreamscaper_subs_install_db();
	}
	if ( ! wp_next_scheduled( 'dreamscaper_subs_daily' ) ) {
		wp_schedule_event( time() + 300, 'hourly', 'dreamscaper_subs_daily' );
	}
}, 6 );

/* ------------------------------------------------------------------ config */

/**
 * Every feature and limit a plan can have. type: limit (number, -1 = unlimited) or flag.
 * Monthly limits reset on the 1st of each month (UTC).
 */
function dreamscaper_feature_catalog() {
	return array(
		'employees'      => array( 'limit', 'Field employees', 'Crew members you can schedule and send jobs to. You, the owner, aren’t counted.' ),
		'crews'          => array( 'limit', 'Crews', 'Named crews your employees belong to, for scheduling and dispatch.' ),
		'ai_credits'     => array( 'limit', 'AI credits per month', 'Dreamscape AI pictures (AI Erase, Make it real, Season & light…) — 1 credit each. Your free daily credits are used first, bought credits last.' ),
		'plans_month'    => array( 'limit', 'Landscape plans per month', 'New measured 2D landscape plans (with automatic quantities) you create on a property. Editing an existing plan is always free.' ),
		'storage_gb'     => array( 'limit', 'Storage (GB)', 'Designs, property photos, job photos and documents you keep online.' ),
		'clients'        => array( 'limit', 'Active customers', 'Customers in your CRM (past and lost customers don’t count).' ),
		'quotes_month'   => array( 'limit', 'Quotes & proposals per month', 'New quotes you create each calendar month.' ),
		'leads_month'    => array( 'limit', 'New DreamScaper requests per month', 'Homeowners who request a quote from you through Find a Contractor. When you reach it, you’re hidden from new homeowners until next month.' ),
		'reminder_rules' => array( 'limit', 'Automatic reminder rules', 'How many reminders you can schedule before each appointment.' ),
		'snippets'       => array( 'limit', 'Saved quick replies', 'One-tap answers you reuse in the Inbox.' ),
		'ai'             => array( 'flag', 'AI Quoter', 'AI writes your scope of work and builds elevation views from a design.' ),
		'sms'            => array( 'flag', 'Text messages', 'Follow-ups, appointment reminders and alerts by text.' ),
		'intake'         => array( 'flag', 'Custom intake questions', 'Your own questions in the homeowner’s request form, per service.' ),
		'inbox_pro'      => array( 'flag', 'Inbox tools', 'Needs-reply tracking, reply timer and quick replies.' ),
		'calendar_feed'  => array( 'flag', 'Calendar sync', 'Your schedule in Google, Apple or Outlook calendar.' ),
		'gallery'        => array( 'flag', 'Work gallery on your profile', 'A curated gallery of your best finished jobs.' ),
		'featured'       => array( 'flag', 'Featured placement', 'Shown first (labelled “Featured”) to homeowners in your service area.' ),
	);
}

/**
 * The plans. 'includes' is the plain-English list on the pricing cards ("Everything in Starter plus…");
 * 'not' lists what a plan leaves out. Both are editable, so new modules can be announced without code.
 */
function dreamscaper_plan_defaults() {
	$base = array( 'clients' => -1, 'quotes_month' => -1, 'leads_month' => -1, 'intake' => 1, 'calendar_feed' => 1 );
	return array(
		'starter'  => array( 'name' => 'Starter', 'tag' => 'Owner + one crew leader', 'month' => 59, 'year' => 590, 'price_month' => '', 'price_year' => '', 'popular' => 0,
			'includes' => "CRM, customers & leads\nCalendar & scheduling\nEmployee manager & day-to-day task manager\nEstimates, proposals & invoicing\nCustomer portal\nBasic AI assistant",
			'not'      => "AI Quoter\nRoute Optimizer\nLandscape Plan Generator",
			'f' => $base + array( 'employees' => 1, 'crews' => 1, 'ai_credits' => 50, 'plans_month' => 0, 'storage_gb' => 5, 'reminder_rules' => 2, 'snippets' => 5, 'ai' => 0, 'sms' => 0, 'inbox_pro' => 0, 'gallery' => 0, 'featured' => 0 ) ),
		'pro'      => array( 'name' => 'Professional', 'tag' => 'A growing company', 'month' => 129, 'year' => 1290, 'price_month' => '', 'price_year' => '', 'popular' => 1,
			'includes' => "Everything in Starter, plus:\nAI Quoter\nRoute Optimizer\nAdvanced calendar & multi-crew scheduling\nEmployee management\nAutomated customer follow-ups\nAI automations\nJob photos\n3 landscape plans a month",
			'not'      => '',
			'f' => $base + array( 'employees' => 5, 'crews' => 2, 'ai_credits' => 200, 'plans_month' => 3, 'storage_gb' => 25, 'reminder_rules' => 6, 'snippets' => 50, 'ai' => 1, 'sms' => 1, 'inbox_pro' => 1, 'gallery' => 0, 'featured' => 0 ) ),
		'business' => array( 'name' => 'Business', 'tag' => 'A multi-crew operation', 'month' => 249, 'year' => 2490, 'price_month' => '', 'price_year' => '', 'popular' => 0,
			'includes' => "Everything in Professional, plus:\nAdvanced AI Quoter & Route Optimizer\nAdvanced employee & task management\nJob costing & profitability tracking\nMaterial / labor calculations & material takeoffs\nAdvanced reporting & automations\n15 landscape plans a month\nAdvanced landscape design tools\nEnhanced customer portal\nWork gallery on your profile",
			'not'      => '',
			'f' => $base + array( 'employees' => 15, 'crews' => 5, 'ai_credits' => 750, 'plans_month' => 15, 'storage_gb' => 100, 'reminder_rules' => -1, 'snippets' => -1, 'ai' => 1, 'sms' => 1, 'inbox_pro' => 1, 'gallery' => 1, 'featured' => 0 ) ),
		'proplus'  => array( 'name' => 'Pro+', 'tag' => 'Large or multi-location company', 'month' => 499, 'year' => 4990, 'price_month' => '', 'price_year' => '', 'popular' => 0,
			'includes' => "Everything in Business, plus:\nUnlimited landscape plans (fair use)\nAdvanced AI automation & landscape planning\nAdvanced material takeoffs & profitability analytics\nMulti-location\nAPI access\nWhite-label customer portal\nAdvanced permissions & custom workflows\nFeatured placement in Find a Contractor\nPriority support",
			'not'      => '',
			'f' => $base + array( 'employees' => 50, 'crews' => -1, 'ai_credits' => 2500, 'plans_month' => -1, 'storage_gb' => 500, 'reminder_rules' => -1, 'snippets' => -1, 'ai' => 1, 'sms' => 1, 'inbox_pro' => 1, 'gallery' => 1, 'featured' => 1 ) ),
	);
}

/** The non-payment stages, in order, with the default day each one starts (counted from the first failed payment). */
function dreamscaper_dunning_defaults() {
	return array( 'reminder' => 4, 'restricted' => 8, 'readonly' => 11 );
}

function dreamscaper_subs_cfg() {
	$o = get_option( 'dreamscaper_subs', array() );
	$o = is_array( $o ) ? $o : array();
	$d = array(
		'on' => 0, 'trial_days' => 30, 'trial_plan' => 'pro', 'grace_days' => 14, 'otp' => 1, 'card' => 1, 'retention_months' => 12, 'since' => 0,
		// trial allowances (lower than the paid plan, to protect AI costs; the trial still shows every feature)
		'trial_ai_credits' => 100, 'trial_plans' => 2,
		// non-payment: the day each stage starts (grace_days = the day the account is suspended)
		'stages' => dreamscaper_dunning_defaults(),
		// restricted stage: what pauses (each can be switched off)
		'restrict_ai' => 1, 'restrict_plans' => 1, 'restrict_buy' => 1, 'restrict_uploads' => 1, 'restrict_auto_sms' => 1, 'big_upload_mb' => 10,
		// fair-use alert to the site owner for "unlimited" landscape plans
		'fair_plans' => 100,
		'deletion_days' => 90,
	);
	$c = wp_parse_args( $o, $d );
	$c['stages'] = wp_parse_args( is_array( $c['stages'] ) ? $c['stages'] : array(), dreamscaper_dunning_defaults() );
	$plans = dreamscaper_plan_defaults();
	// plans saved before the four-tier pricing (no plans_v) are ignored: the new prices and limits apply
	$saved = ! empty( $o['plans_v'] ) && isset( $o['plans'] ) && is_array( $o['plans'] ) ? $o['plans'] : array();
	foreach ( $plans as $k => $p ) {
		if ( isset( $saved[ $k ] ) && is_array( $saved[ $k ] ) ) {
			$x            = $saved[ $k ];
			$plans[ $k ]  = array_merge( $p, array_intersect_key( $x, $p ) );
			$plans[ $k ]['f'] = array_merge( $p['f'], isset( $x['f'] ) && is_array( $x['f'] ) ? array_intersect_key( $x['f'], $p['f'] ) : array() );
		}
	}
	$c['plans'] = $plans;
	unset( $c['plans_v'] );
	return $c;
}
function dreamscaper_plans() {
	return dreamscaper_subs_cfg()['plans'];
}
/** Billing is live only when the owner turned it on and Stripe is connected. */
function dreamscaper_subs_on() {
	$c = dreamscaper_subs_cfg();
	return ! empty( $c['on'] ) && dreamscaper_opt( 'stripe_secret' );
}
function dreamscaper_is_owner_pro( $pro_id ) {
	return $pro_id && user_can( (int) $pro_id, 'manage_options' );
}

/* ------------------------------------------------------------- the record */

function dreamscaper_sub_row( $pro_id ) {
	global $wpdb;
	return $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . dreamscaper_t( 'subs' ) . ' WHERE pro_id=%d', $pro_id ) );
}

function dreamscaper_sub_event( $pro_id, $kind, $from, $to, $note = '', $o = array() ) {
	global $wpdb;
	$wpdb->insert( dreamscaper_t( 'sub_events' ), array(
		'pro_id' => (int) $pro_id, 'kind' => substr( $kind, 0, 20 ), 'from_status' => (string) $from, 'to_status' => (string) $to,
		'plan' => isset( $o['plan'] ) ? $o['plan'] : '', 'amount' => isset( $o['amount'] ) ? (float) $o['amount'] : 0,
		'stripe_event' => isset( $o['event'] ) ? substr( $o['event'], 0, 80 ) : '', 'note' => mb_substr( (string) $note, 0, 250 ),
		'actor' => isset( $o['actor'] ) ? (int) $o['actor'] : get_current_user_id(), 'created' => dreamscaper_now(),
	) );
}

/** Change fields on a subscription, logging any status change. */
function dreamscaper_sub_update( $pro_id, $f, $kind = 'update', $note = '', $o = array() ) {
	global $wpdb;
	$old = dreamscaper_sub_row( $pro_id );
	$f['updated'] = dreamscaper_now();
	dreamscaper_sub_flush( $pro_id );
	if ( $old ) {
		$wpdb->update( dreamscaper_t( 'subs' ), $f, array( 'pro_id' => $pro_id ) );
	} else {
		$wpdb->insert( dreamscaper_t( 'subs' ), array_merge( array( 'pro_id' => $pro_id, 'created' => dreamscaper_now() ), $f ) );
	}
	$from = $old ? $old->status : '';
	$to   = isset( $f['status'] ) ? $f['status'] : $from;
	if ( $from !== $to || 'update' !== $kind ) {
		dreamscaper_sub_event( $pro_id, $kind, $from, $to, $note, array_merge( array( 'plan' => isset( $f['plan'] ) ? $f['plan'] : ( $old ? $old->plan : '' ) ), $o ) );
	}
	if ( $from !== $to ) {
		dreamscaper_sub_status_changed( $pro_id, $from, $to );
	}
	return dreamscaper_sub_row( $pro_id );
}

/**
 * The contractor's subscription, as the app should treat it.
 * When billing is off (or for the site owner) everyone is "comped" on the top plan.
 */
function dreamscaper_sub( $pro_id ) {
	if ( ! isset( $GLOBALS['dscp_sub_cache'] ) ) {
		$GLOBALS['dscp_sub_cache'] = array();
	}
	$cache = &$GLOBALS['dscp_sub_cache'];
	if ( isset( $cache[ $pro_id ] ) ) {
		return $cache[ $pro_id ];
	}
	if ( dreamscaper_is_owner_pro( $pro_id ) || ! dreamscaper_subs_on() ) {
		$cache[ $pro_id ] = (object) array( 'pro_id' => (int) $pro_id, 'plan' => 'proplus', 'status' => 'comped', 'virtual' => true, 'trial_ends' => null, 'period_end' => null, 'cancel_at' => null, 'stripe_customer' => '', 'stripe_sub' => '', 'billing' => 'month', 'past_due_at' => null, 'paused_at' => null );
		return $cache[ $pro_id ];
	}
	$row = dreamscaper_sub_row( $pro_id );
	if ( ! $row ) {
		$p   = dreamscaper_pro_row( $pro_id );
		$cfg = dreamscaper_subs_cfg();
		// contractors approved before billing was switched on get one grandfathered trial (recorded in the ledger)
		if ( $p && 'approved' === $p->status && $cfg['since'] && strtotime( $p->created . ' UTC' ) < (int) $cfg['since'] ) {
			$ends = gmdate( 'Y-m-d H:i:s', time() + (int) $cfg['trial_days'] * DAY_IN_SECONDS );
			$row  = dreamscaper_sub_update( $pro_id, array( 'plan' => $cfg['trial_plan'], 'status' => 'trialing', 'trial_ends' => $ends ), 'grandfather', 'Existing contractor when billing started' );
			dreamscaper_trial_ledger_add( $pro_id, dreamscaper_trial_identity( $pro_id ), $ends, 'Grandfathered (existing contractor)' );
		} else {
			$row = (object) array( 'pro_id' => (int) $pro_id, 'plan' => $cfg['trial_plan'], 'status' => 'none', 'trial_ends' => null, 'period_end' => null, 'cancel_at' => null, 'stripe_customer' => '', 'stripe_sub' => '', 'billing' => 'month', 'past_due_at' => null, 'paused_at' => null );
		}
	}
	$cache[ $pro_id ] = $row;
	return $row;
}
function dreamscaper_sub_flush( $pro_id = 0 ) {
	if ( $pro_id ) {
		unset( $GLOBALS['dscp_sub_cache'][ $pro_id ] );
	} else {
		$GLOBALS['dscp_sub_cache'] = array();
	}
}

/** Statuses that may create, edit and send (past due only until the read-only stage). */
function dreamscaper_sub_active_status( $s ) {
	return in_array( $s, array( 'trialing', 'active', 'past_due', 'comped' ), true );
}
function dreamscaper_pro_writable( $pro_id ) {
	$s = dreamscaper_sub( $pro_id );
	if ( ! dreamscaper_sub_active_status( $s->status ) ) {
		return false;
	}
	return 'past_due' !== $s->status || ! in_array( dreamscaper_sub_stage( $pro_id ), array( 'readonly', 'suspended' ), true );
}

/** Whole days since the first failed payment of the unpaid invoice (0 on the day it failed). */
function dreamscaper_sub_days_due( $s ) {
	return ! empty( $s->past_due_at ) ? max( 0, (int) floor( ( time() - strtotime( $s->past_due_at . ' UTC' ) ) / DAY_IN_SECONDS ) ) : 0;
}

/**
 * Where an account is in the non-payment policy:
 * '' (paid up) | notice | reminder | restricted | readonly | suspended.
 */
function dreamscaper_sub_stage( $pro_id ) {
	$s = dreamscaper_sub( $pro_id );
	if ( 'paused' === $s->status ) {
		return 'suspended';
	}
	if ( 'past_due' !== $s->status ) {
		return '';
	}
	$cfg = dreamscaper_subs_cfg();
	$d   = dreamscaper_sub_days_due( $s );
	if ( $d >= (int) $cfg['grace_days'] || $d >= (int) $cfg['stages']['readonly'] ) {
		return 'readonly'; // the hourly check moves it to suspended on the day
	}
	if ( $d >= (int) $cfg['stages']['restricted'] ) {
		return 'restricted';
	}
	return $d >= (int) $cfg['stages']['reminder'] ? 'reminder' : 'notice';
}

/** The date (UTC) the account will be suspended if it isn't paid. */
function dreamscaper_sub_suspend_at( $s ) {
	return ! empty( $s->past_due_at ) ? gmdate( 'Y-m-d H:i:s', strtotime( $s->past_due_at . ' UTC' ) + (int) dreamscaper_subs_cfg()['grace_days'] * DAY_IN_SECONDS ) : null;
}

/**
 * Is this costly action ($what: ai | plans | buy | uploads | auto_sms) paused for a contractor who
 * hasn't paid? Returns a 402 WP_Error that names the fix, or null. Non-contractors always get null.
 */
function dreamscaper_pro_costly_err( $uid, $what ) {
	if ( ! $uid || ! dreamscaper_subs_on() || dreamscaper_is_owner_pro( $uid ) ) {
		return null;
	}
	$p = dreamscaper_pro_row( $uid );
	if ( ! $p || 'approved' !== $p->status ) {
		return null;
	}
	$stage = dreamscaper_sub_stage( $uid );
	if ( ! in_array( $stage, array( 'restricted', 'readonly', 'suspended' ), true ) ) {
		return null;
	}
	if ( 'restricted' === $stage && empty( dreamscaper_subs_cfg()[ 'restrict_' . $what ] ) ) {
		return null;
	}
	$label = array( 'ai' => 'AI tools', 'plans' => 'New landscape plans', 'buy' => 'Buying extra credits or storage', 'uploads' => 'Large uploads', 'auto_sms' => 'Automatic texts' );
	return new WP_Error( 'dreamscaper_paused', ( isset( $label[ $what ] ) ? $label[ $what ] : 'This' ) . ( 'restricted' === $stage ? ' is paused while your subscription payment is outstanding. Update your payment method and it’s back instantly.' : ' is unavailable until your subscription payment goes through. Everything is safe — update your payment method to restore your account.' ), array( 'status' => 402, 'paused' => $stage, 'stage' => $stage, 'what' => $what ) );
}
/** Automatic messages (reminders, follow-ups, auto-replies) only go out for active accounts. */
function dreamscaper_sub_can_send( $pro_id ) {
	return dreamscaper_pro_writable( $pro_id );
}

/** The plan definition in force (trials use the trial plan). */
function dreamscaper_pro_plan( $pro_id ) {
	$s     = dreamscaper_sub( $pro_id );
	$plans = dreamscaper_plans();
	$key   = isset( $plans[ $s->plan ] ) ? $s->plan : 'pro';
	$def   = $plans[ $key ];
	if ( 'trialing' === $s->status ) {
		$cfg = dreamscaper_subs_cfg();
		$key = isset( $plans[ $cfg['trial_plan'] ] ) ? $cfg['trial_plan'] : 'pro';
		$def = $plans[ $key ];
		// the trial shows every feature of the plan, with smaller AI and landscape-plan allowances
		foreach ( array( 'ai_credits' => 'trial_ai_credits', 'plans_month' => 'trial_plans' ) as $f => $t ) {
			$def['f'][ $f ] = $def['f'][ $f ] < 0 ? (int) $cfg[ $t ] : min( (int) $def['f'][ $f ], (int) $cfg[ $t ] );
		}
	}
	return array( 'key' => $key, 'def' => $def );
}

function dreamscaper_pro_can( $pro_id, $feat ) {
	if ( ! dreamscaper_pro_writable( $pro_id ) ) {
		return false;
	}
	$p = dreamscaper_pro_plan( $pro_id );
	$v = isset( $p['def']['f'][ $feat ] ) ? (int) $p['def']['f'][ $feat ] : 0;
	$cat = dreamscaper_feature_catalog();
	return isset( $cat[ $feat ] ) && 'limit' === $cat[ $feat ][0] ? 0 !== $v : 1 === $v;
}

/** How much of a limit is used: array( used, limit (-1 = unlimited), left ). */
function dreamscaper_pro_limit( $pro_id, $key ) {
	global $wpdb;
	$p     = dreamscaper_pro_plan( $pro_id );
	$limit = isset( $p['def']['f'][ $key ] ) ? (int) $p['def']['f'][ $key ] : 0;
	$month = gmdate( 'Y-m-01 00:00:00' );
	$used  = 0;
	switch ( $key ) {
		case 'clients':
			$used = (int) $wpdb->get_var( $wpdb->prepare( 'SELECT COUNT(*) FROM ' . dreamscaper_t( 'clients' ) . " WHERE pro_id=%d AND stage NOT IN ('past','lost')", $pro_id ) );
			break;
		case 'quotes_month':
			$used = (int) $wpdb->get_var( $wpdb->prepare( 'SELECT COUNT(*) FROM ' . dreamscaper_t( 'quotes' ) . " WHERE pro_id=%d AND created >= %s AND origin<>'market'", $pro_id, $month ) );
			break;
		case 'leads_month':
			$used = (int) $wpdb->get_var( $wpdb->prepare( 'SELECT COUNT(*) FROM ' . dreamscaper_t( 'quotes' ) . " WHERE pro_id=%d AND created >= %s AND origin='market'", $pro_id, $month ) );
			break;
		case 'ai_credits':
		case 'plans_month':
			$used = dreamscaper_pro_month_count( $pro_id, $key );
			break;
		case 'storage_gb':
			$used = round( dreamscaper_pro_storage_bytes( $pro_id ) / GB_IN_BYTES, 2 );
			break;
		case 'employees':
		case 'crews':
			$crew = dreamscaper_pro_settings( dreamscaper_pro_row( $pro_id ) );
			$used = dreamscaper_crew_counts( isset( $crew['crew'] ) ? $crew['crew'] : array() )[ $key ];
			break;
		default:
			$s   = dreamscaper_pro_settings( dreamscaper_pro_row( $pro_id ) );
			$map = array( 'snippets' => 'snippets' );
			if ( isset( $map[ $key ] ) && ! empty( $s[ $map[ $key ] ] ) && is_array( $s[ $map[ $key ] ] ) ) {
				$used = count( array_filter( $s[ $map[ $key ] ] ) );
			} elseif ( 'reminder_rules' === $key && function_exists( 'dreamscaper_reminder_rules' ) ) {
				$used = count( dreamscaper_reminder_rules( dreamscaper_pro_row( $pro_id ) )['customer'] );
			}
	}
	$left = $limit < 0 ? -1 : max( 0, $limit - $used );
	return array( 'used' => $used, 'limit' => $limit, 'left' => is_float( $left ) ? round( $left, 2 ) : $left, 'resets' => in_array( $key, array( 'ai_credits', 'plans_month', 'quotes_month', 'leads_month' ), true ) ? dreamscaper_ms( gmdate( 'Y-m-01 00:00:00', strtotime( 'first day of next month' ) ) ) : null );
}

/* ------------------------------------------------- monthly allowances */

/** A per-contractor counter that starts again on the 1st of each month (UTC). */
function dreamscaper_pro_month_count( $pro_id, $key ) {
	$m = get_user_meta( $pro_id, 'dscp_m_' . $key, true );
	return is_array( $m ) && isset( $m['m'] ) && gmdate( 'Y-m' ) === $m['m'] ? (int) $m['n'] : 0;
}
function dreamscaper_pro_month_add( $pro_id, $key, $n = 1 ) {
	$v = max( 0, dreamscaper_pro_month_count( $pro_id, $key ) + (int) $n );
	update_user_meta( $pro_id, 'dscp_m_' . $key, array( 'm' => gmdate( 'Y-m' ), 'n' => $v ) );
	return $v;
}

/** Count a new landscape plan; tell the site owner once a month when an "unlimited" plan passes the fair-use mark. */
function dreamscaper_plan_used( $pro_id ) {
	$n   = dreamscaper_pro_month_add( $pro_id, 'plans_month', 1 );
	$cfg = dreamscaper_subs_cfg();
	$lim = (int) dreamscaper_pro_plan( $pro_id )['def']['f']['plans_month'];
	if ( $lim < 0 && (int) $cfg['fair_plans'] > 0 && $n === (int) $cfg['fair_plans'] ) {
		$p = dreamscaper_pro_row( $pro_id );
		dreamscaper_sub_event( $pro_id, 'fair_use', '', '', $n . ' landscape plans this month — over the fair-use mark. Nothing was blocked.', array( 'actor' => 0 ) );
		wp_mail( get_option( 'admin_email' ), 'DreamScaper: fair-use check for ' . ( $p ? $p->business : '#' . $pro_id ), ( $p ? $p->business : 'A contractor' ) . ' has created ' . $n . " landscape plans this month on an unlimited plan. Nothing has been blocked — this is just so you can take a look.\n\n" . admin_url( 'options-general.php?page=dreamscaper-plans#pro-' . (int) $pro_id ) );
	}
}

/** Field employees = crew members; crews = the distinct crew names they're in (1 when none are named). */
function dreamscaper_crew_counts( $crew ) {
	$crew  = is_array( $crew ) ? array_filter( $crew, function ( $c ) { return is_array( $c ) && ! empty( $c['name'] ); } ) : array();
	$teams = array();
	foreach ( $crew as $c ) {
		if ( ! empty( $c['team'] ) ) {
			$teams[ strtolower( trim( (string) $c['team'] ) ) ] = 1;
		}
	}
	return array( 'employees' => count( $crew ), 'crews' => $teams ? count( $teams ) : ( $crew ? 1 : 0 ) );
}

/**
 * A contractor billed through DreamScaper (approved, billing on, not the site owner, account running)?
 * Members, the site owner and contractors without an active plan use the ordinary member allowances.
 */
function dreamscaper_is_billed_pro( $uid ) {
	if ( ! $uid || ! dreamscaper_subs_on() || dreamscaper_is_owner_pro( $uid ) ) {
		return false;
	}
	$p = dreamscaper_pro_row( $uid );
	return $p && 'approved' === $p->status && in_array( dreamscaper_sub( $uid )->status, array( 'trialing', 'active', 'past_due', 'comped', 'paused' ), true );
}

/** The plan's monthly AI credits for this user: array( used, limit, left ) or null if not a billed contractor. */
function dreamscaper_pro_ai_allowance( $uid ) {
	return dreamscaper_is_billed_pro( $uid ) ? dreamscaper_pro_limit( $uid, 'ai_credits' ) : null;
}

/** Bytes a contractor keeps online: saved designs plus Contractor Hub uploads (photos, plans, gallery, attachments). */
function dreamscaper_pro_storage_bytes( $pro_id ) {
	return ( function_exists( 'dreamscaper_cloud_usage' ) ? dreamscaper_cloud_usage( $pro_id ) : 0 ) + max( 0, (int) get_user_meta( $pro_id, 'dscp_crm_bytes', true ) );
}

/** The plan's storage in bytes (0 = unlimited) or null if not a billed contractor. Bought storage packs are added on top. */
function dreamscaper_pro_storage_quota( $uid ) {
	if ( ! dreamscaper_is_billed_pro( $uid ) ) {
		return null;
	}
	$gb = (int) dreamscaper_pro_plan( $uid )['def']['f']['storage_gb'];
	return $gb < 0 ? 0 : (int) ( $gb * GB_IN_BYTES + (int) get_user_meta( $uid, 'dscp_storage_mb', true ) * MB_IN_BYTES );
}

/**
 * Before a Contractor Hub upload of $bytes: is there room, and is it allowed at this billing stage?
 * Returns a WP_Error or null. Members and the site owner are never limited here.
 */
function dreamscaper_pro_upload_err( $uid, $bytes ) {
	if ( ! dreamscaper_is_billed_pro( $uid ) ) {
		return null;
	}
	$cfg = dreamscaper_subs_cfg();
	if ( $bytes > (int) $cfg['big_upload_mb'] * MB_IN_BYTES ) {
		$e = dreamscaper_pro_costly_err( $uid, 'uploads' );
		if ( $e ) {
			return $e;
		}
	}
	$q = dreamscaper_pro_storage_quota( $uid );
	if ( $q && dreamscaper_pro_storage_bytes( $uid ) + $bytes > $q ) {
		return dreamscaper_plan_err( $uid, 'storage_gb', 'Your online storage is full. Nothing is lost — upgrade your plan or add a storage pack to keep uploading.' );
	}
	return null;
}

/** A 402 error that tells the app which feature and plan are needed. */
function dreamscaper_plan_err( $pro_id, $feat, $msg = '' ) {
	$cat   = dreamscaper_feature_catalog();
	$need  = '';
	foreach ( dreamscaper_plans() as $k => $pl ) {
		$v = isset( $pl['f'][ $feat ] ) ? (int) $pl['f'][ $feat ] : 0;
		if ( ( isset( $cat[ $feat ] ) && 'limit' === $cat[ $feat ][0] ) ? ( $v < 0 || $v > (int) dreamscaper_pro_plan( $pro_id )['def']['f'][ $feat ] ) : 1 === $v ) {
			$need = $pl['name'];
			break;
		}
	}
	if ( ! $msg ) {
		$label = isset( $cat[ $feat ] ) ? $cat[ $feat ][1] : $feat;
		$msg   = $label . ( $need ? ' is included in the ' . $need . ' plan.' : ' isn’t included in your plan.' );
	}
	return new WP_Error( 'dreamscaper_plan', $msg, array( 'status' => 402, 'feature' => $feat, 'need' => $need ) );
}

/** The message a paused / not-started account sees when it tries to change something. */
function dreamscaper_paused_err( $pro_id ) {
	$s = dreamscaper_sub( $pro_id );
	$msg = array(
		'none'      => 'Start your free 30-day trial to use the Contractor Hub.',
		'paused'    => 'Your account is suspended because your subscription payment is past due. Everything is safe — update your payment method and it’s restored instantly.',
		'past_due'  => 'Your account is read-only until your subscription payment goes through (suspension on ' . dreamscaper_sub_suspend_label( $s ) . '). You can still view, export and pay — update your payment method to switch everything back on.',
		'cancelled' => 'Your subscription has ended. Your records are safe and you can still view and export them — choose a plan to start working again.',
	);
	return new WP_Error( 'dreamscaper_paused', isset( $msg[ $s->status ] ) ? $msg[ $s->status ] : 'Your contractor account isn’t active.', array( 'status' => 402, 'paused' => $s->status, 'stage' => dreamscaper_sub_stage( $pro_id ) ) );
}

/**
 * Gate for contractor writes. Pass a feature to also require it, or a limit key to require headroom.
 * Returns the pro row or a WP_Error (402).
 */
function dreamscaper_pro_gate( $pro_id, $feat = '' ) {
	if ( ! dreamscaper_pro_writable( $pro_id ) ) {
		return dreamscaper_paused_err( $pro_id );
	}
	if ( $feat ) {
		$cat = dreamscaper_feature_catalog();
		if ( isset( $cat[ $feat ] ) && 'limit' === $cat[ $feat ][0] ) {
			$l = dreamscaper_pro_limit( $pro_id, $feat );
			if ( 0 === $l['left'] ) {
				return dreamscaper_plan_err( $pro_id, $feat, 'You’ve reached your plan’s limit of ' . $l['limit'] . ' ' . strtolower( $cat[ $feat ][1] ) . '. Nothing is lost — upgrade to add more.' );
			}
		} elseif ( ! dreamscaper_pro_can( $pro_id, $feat ) ) {
			return dreamscaper_plan_err( $pro_id, $feat );
		}
	}
	return dreamscaper_pro_row( $pro_id );
}

/* ---------------------------------------------------------- write tracking */

/** Remember the REST request being served so dreamscaper_crm_pro() can tell reads from writes. */
add_filter( 'rest_pre_dispatch', function ( $res, $server, $request ) {
	$GLOBALS['dscp_rest_req'] = $request;
	return $res;
}, 10, 3 );
function dreamscaper_rest_is_write() {
	$r = isset( $GLOBALS['dscp_rest_req'] ) ? $GLOBALS['dscp_rest_req'] : null;
	return $r && 'GET' !== strtoupper( $r->get_method() );
}

/* ------------------------------------------------------- status changes */

function dreamscaper_sub_mail( $pro_id, $subject, $text, $button = 'Open Plan & billing' ) {
	$p = dreamscaper_pro_row( $pro_id );
	$u = get_userdata( $pro_id );
	$to = $p && is_email( $p->email ) ? $p->email : ( $u ? $u->user_email : '' );
	if ( ! $to ) {
		return;
	}
	$brand = dreamscaper_opt( 'brand' );
	$html  = '<div style="font-family:Segoe UI,Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;color:#1d2a22;line-height:1.55;font-size:15px">' . nl2br( esc_html( $text ) ) .
		'<p style="margin:22px 0"><a href="' . esc_url( dreamscaper_app_url( array( 'ds_hub' => 'plan' ) ) ) . '" style="background:#1f7a46;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:700;display:inline-block">' . esc_html( $button ) . '</a></p>' .
		'<p style="font-size:13px;color:#5d6f63">DreamScaper by ' . esc_html( $brand ) . '</p></div>';
	wp_mail( $to, $subject, $html, array( 'Content-Type: text/html; charset=UTF-8' ) );
	dreamscaper_crm_tell_user( $pro_id, $subject );
}

/** A billing text, only for contractors who opted in to billing texts, and never overnight. */
function dreamscaper_sub_text( $pro_id, $text ) {
	if ( ! get_user_meta( $pro_id, 'dscp_billing_sms', true ) || ! dreamscaper_sms_ready() ) {
		return;
	}
	$h = (int) wp_date( 'G' );
	if ( $h < 8 || $h >= 20 ) {
		return;
	}
	$p     = dreamscaper_pro_row( $pro_id );
	$phone = (string) get_user_meta( $pro_id, 'dscp_phone_verified', true );
	$phone = $phone ? $phone : ( $p ? dreamscaper_e164( $p->phone ) : '' );
	if ( $phone ) {
		dreamscaper_sms( $phone, $text . ' ' . dreamscaper_app_url( array( 'ds_hub' => 'plan' ) ) );
	}
}

/** The suspension date as the contractor sees it. */
function dreamscaper_sub_suspend_label( $s ) {
	$at = dreamscaper_sub_suspend_at( $s );
	return $at ? wp_date( 'F j', strtotime( $at . ' UTC' ) ) : 'soon';
}

/** The non-payment messages: [ subject, email text, text message ]. Day 0 is 'notice'. */
function dreamscaper_dunning_copy( $stage, $name, $date, $keep = 12 ) {
	$c = array(
		'notice'     => array( 'Payment issue — no action required yet',
			"Hi {$name},\n\nWe couldn’t process your latest DreamScaper payment. Your account remains fully active while we retry the payment — nothing changes for you or your customers.\n\nThis is usually an expired or replaced card, a temporary bank decline or a bank security check. Updating your payment method takes a minute.",
			'DreamScaper: we couldn’t process your latest payment. Your account is still fully active — please update your payment method:' ),
		'reminder'   => array( 'Your DreamScaper subscription payment is still outstanding',
			"Hi {$name},\n\nWe haven’t been able to process your subscription payment. Please update your payment method by {$date} to avoid interruption to your account.\n\nEverything still works today.",
			"DreamScaper: your subscription payment is still outstanding. Please update your payment method by {$date} to avoid interruption:" ),
		'restricted' => array( 'Some DreamScaper features are paused until your payment goes through',
			"Hi {$name},\n\nYour subscription payment is still outstanding, so we’ve paused the features that cost us money to run: new AI pictures and AI Quoter jobs, new landscape plans, buying extra credits or storage, large uploads and automatic texts.\n\nEverything else still works — customers, jobs, your calendar, estimates, proposals and invoices — so you can keep earning. Nothing has been deleted or hidden.\n\nUpdate your payment method before {$date} to avoid your account being suspended. Paused features come back the moment the payment goes through.",
			"DreamScaper: AI and some extras are paused until your payment goes through. Update your payment method before {$date} to avoid suspension:" ),
		'readonly'   => array( "Your DreamScaper account will be suspended on {$date}",
			"Hi {$name},\n\nWe haven’t received payment for your subscription. Your account is now read-only, and you’re not shown to new homeowners.\n\nUpdate your payment method before {$date} to maintain access to your account and all of your saved business data. You can still sign in, view and export everything, and pay.\n\nProposals and invoices you already sent keep working for your customers.",
			"DreamScaper: your account will be suspended on {$date}. Update your payment method to keep access:" ),
		'final'      => array( 'Your DreamScaper account will be suspended tomorrow',
			"Hi {$name},\n\nThis is a final reminder: your account will be suspended tomorrow ({$date}) because your subscription payment is past due.\n\nUpdate your payment method today and nothing changes. Your data is safe either way.",
			'DreamScaper: your account will be suspended tomorrow. Update your payment method today:' ),
		'suspended'  => array( 'Your DreamScaper account is suspended — payment required',
			"Hi {$name},\n\nYour account is currently suspended because your subscription payment is past due.\n\nAll of your customers, employees, jobs, estimates, proposals, invoices, calendar, routes, landscape plans, photos, documents, settings and AI history are safe and intact. You can still sign in, view and export everything.\n\nUpdate your payment method and your account is restored instantly — no need to contact us.",
			'DreamScaper: your account is suspended until your subscription payment goes through. Everything is safe — restore it here:' ),
		'susp_7'     => array( 'Everything is waiting for you on DreamScaper',
			"Hi {$name},\n\nYour DreamScaper account is still suspended. Everything is exactly as you left it — restoring it takes one click: update your payment method and it’s back instantly.", '' ),
		'susp_30'    => array( 'Your DreamScaper records are safe',
			"Hi {$name},\n\nYour account has been suspended for a month. Your records are kept for at least {$keep} months, and you can sign in to view or export them any time. Update your payment method whenever you’re ready and everything comes back exactly as it was.", '' ),
		'susp_60'    => array( 'Still here when you’re ready — DreamScaper',
			"Hi {$name},\n\nA quick reminder that your DreamScaper account is suspended. Your records are safe. You can export everything, or update your payment method to restore your account instantly.", '' ),
	);
	return isset( $c[ $stage ] ) ? $c[ $stage ] : null;
}

/** Send a non-payment message once (recorded as a billing event so it never goes twice). */
function dreamscaper_dun( $s, $stage, $since ) {
	global $wpdb;
	$pro_id = (int) $s->pro_id;
	$sent   = $wpdb->get_var( $wpdb->prepare( 'SELECT id FROM ' . dreamscaper_t( 'sub_events' ) . ' WHERE pro_id=%d AND kind=%s AND created >= %s LIMIT 1', $pro_id, 'dun_' . $stage, $since ) );
	if ( $sent ) {
		return false;
	}
	$p    = dreamscaper_pro_row( $pro_id );
	$name = $p && $p->contact ? preg_split( '/\s+/', trim( $p->contact ) )[0] : 'there';
	$copy = dreamscaper_dunning_copy( $stage, $name, dreamscaper_sub_suspend_label( $s ), (int) dreamscaper_subs_cfg()['retention_months'] );
	if ( ! $copy ) {
		return false;
	}
	dreamscaper_sub_event( $pro_id, 'dun_' . $stage, $s->status, $s->status, $copy[0], array( 'actor' => 0 ) );
	dreamscaper_sub_mail( $pro_id, $copy[0], $copy[1], 'suspended' === $stage || 0 === strpos( $stage, 'susp_' ) ? 'Update Payment Method & Restore Account' : 'Update payment method' );
	if ( $copy[2] ) {
		dreamscaper_sub_text( $pro_id, $copy[2] );
	}
	return true;
}

/** Side effects of moving between statuses. */
function dreamscaper_sub_status_changed( $pro_id, $from, $to ) {
	global $wpdb;
	$p    = dreamscaper_pro_row( $pro_id );
	$name = $p && $p->contact ? $p->contact : 'there';
	if ( 'paused' === $to ) {
		$wpdb->update( dreamscaper_t( 'subs' ), array( 'paused_at' => dreamscaper_now() ), array( 'pro_id' => $pro_id ) );
		dreamscaper_sub_flush( $pro_id );
		$s = dreamscaper_sub_row( $pro_id );
		if ( $s && 'past_due' === $from ) {
			dreamscaper_dun( $s, 'suspended', $s->paused_at );
		} else {
			dreamscaper_sub_mail( $pro_id, 'Your DreamScaper account is suspended', "Hi {$name},\n\nYour Contractor Hub is suspended.\n\nNothing has been deleted. Your customers, properties, designs, quotes, invoices and messages are all safe, and you can still view and export them.\n\nWhile suspended you can’t create or send anything, automatic follow-ups and reminders are on hold, and you’re hidden from new homeowners. Proposals and invoices you already sent still work for your customers.", 'Open Plan & billing' );
		}
	}
	if ( 'cancelled' === $to ) {
		$keep = (int) dreamscaper_subs_cfg()['retention_months'];
		dreamscaper_sub_mail( $pro_id, 'Your DreamScaper subscription has ended', "Hi {$name},\n\nYour subscription has ended. Your records are kept safe for at least {$keep} months, and you can view and export them any time. We’ll email you well before anything is ever removed.\n\nCome back whenever you like — choose a plan and everything is exactly where you left it.", 'Export or reactivate' );
	}
	if ( 'past_due' === $to ) {
		$wpdb->query( $wpdb->prepare( 'UPDATE ' . dreamscaper_t( 'subs' ) . ' SET past_due_at=%s WHERE pro_id=%d AND past_due_at IS NULL', dreamscaper_now(), $pro_id ) );
		dreamscaper_sub_flush( $pro_id );
		$s = dreamscaper_sub_row( $pro_id );
		if ( $s ) {
			dreamscaper_dun( $s, 'notice', $s->past_due_at );
		}
	}
	if ( in_array( $to, array( 'active', 'trialing' ), true ) && in_array( $from, array( 'paused', 'cancelled', 'past_due', 'none' ), true ) ) {
		$old  = dreamscaper_sub_row( $pro_id );
		$late = $old && $old->past_due_at && dreamscaper_sub_days_due( $old ) >= (int) dreamscaper_subs_cfg()['stages']['restricted'];
		$wpdb->update( dreamscaper_t( 'subs' ), array( 'past_due_at' => null, 'paused_at' => null, 'failures' => 0 ), array( 'pro_id' => $pro_id ) );
		dreamscaper_sub_flush( $pro_id );
		if ( in_array( $from, array( 'paused', 'cancelled' ), true ) || ( 'past_due' === $from && $late ) ) {
			// follow-ups whose time passed while restricted or suspended wait for review instead of firing late
			$held = $wpdb->query( $wpdb->prepare( 'UPDATE ' . dreamscaper_t( 'followups' ) . " SET status='held' WHERE pro_id=%d AND status='scheduled' AND send_at < %s", $pro_id, dreamscaper_now() ) );
			if ( (int) get_option( 'dreamscaper_cal_db' ) ) {
				$wpdb->query( $wpdb->prepare( 'UPDATE ' . dreamscaper_t( 'reminders' ) . " SET status='skipped', error='paused' WHERE pro_id=%d AND status='scheduled' AND send_at < %s", $pro_id, dreamscaper_now() ) );
			}
			$hidden = 'past_due' !== $from || dreamscaper_sub_days_due( $old ) >= (int) dreamscaper_subs_cfg()['stages']['readonly'];
			dreamscaper_sub_mail( $pro_id, 'You’re all set — your DreamScaper account is fully active', "Hi {$name},\n\nThanks! Your payment went through and your Contractor Hub is fully active again — everything is exactly where you left it" . ( $hidden ? ', and you’re visible to homeowners again.' : '.' ) . ( $held ? "\n\nA few follow-ups came due while your payment was outstanding. They’re waiting for you to review on your dashboard, so nothing goes out late without your OK." : '' ), 'Open my Contractor Hub' );
		}
	}
}

/* ------------------------------------------------------------- the trial */

function dreamscaper_hash( $v ) {
	$v = trim( (string) $v );
	return '' === $v ? '' : hash( 'sha256', $v . '|' . wp_salt( 'auth' ) );
}
function dreamscaper_norm_email( $e ) {
	$e = strtolower( trim( (string) $e ) );
	if ( ! strpos( $e, '@' ) ) {
		return '';
	}
	list( $u, $d ) = explode( '@', $e, 2 );
	$u = preg_replace( '/\+.*$/', '', $u );
	if ( in_array( $d, array( 'gmail.com', 'googlemail.com' ), true ) ) {
		$u = str_replace( '.', '', $u );
		$d = 'gmail.com';
	}
	return $u . '@' . $d;
}
function dreamscaper_norm_words( $s ) {
	$s = strtolower( remove_accents( (string) $s ) );
	$s = preg_replace( '/\b(llc|inc|co|corp|company|ltd|the|and|services?|landscap\w*|lawn|care|&)\b/', ' ', $s );
	return trim( preg_replace( '/[^a-z0-9]+/', '', $s ) );
}
function dreamscaper_norm_address( $s ) {
	$s = strtolower( (string) $s );
	$s = str_replace( array( ' street', ' st.', ' road', ' rd.', ' avenue', ' ave.', ' drive', ' dr.', ' lane', ' ln.' ), array( ' st', ' st', ' rd', ' rd', ' ave', ' ave', ' dr', ' dr', ' ln', ' ln' ), $s );
	return preg_replace( '/[^a-z0-9]+/', '', $s );
}
function dreamscaper_disposable_email( $e ) {
	$d = strtolower( substr( strrchr( (string) $e, '@' ), 1 ) );
	$list = array( 'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'sharklasers.com', '10minutemail.com', 'tempmail.com', 'temp-mail.org', 'yopmail.com', 'trashmail.com', 'getnada.com', 'dispostable.com', 'maildrop.cc', 'throwawaymail.com', 'fakeinbox.com', 'moakt.com', 'emailondeck.com', 'mohmal.com', 'burnermail.io', 'mintemail.com', 'mailnesia.com', 'spamgourmet.com', 'tempail.com', 'tempr.email', 'discard.email', 'inboxkitten.com', 'mail.tm', 'tmpmail.org', 'tmail.ws', 'mytemp.email', '33mail.com', 'getairmail.com', 'spambox.us', 'emailfake.com', 'byom.de', 'trashmail.de', 'wegwerfmail.de', 'grr.la', 'pokemail.net', 'mailpoof.com', 'anonaddy.me', 'tempinbox.com' );
	$extra = apply_filters( 'dreamscaper_disposable_domains', array() );
	return in_array( $d, array_merge( $list, (array) $extra ), true );
}

/** Everything that identifies this business, hashed. $extra: card, customer, ip, device. */
function dreamscaper_trial_identity( $pro_id, $extra = array() ) {
	$p = dreamscaper_pro_row( $pro_id );
	$u = get_userdata( $pro_id );
	$phone = (string) get_user_meta( $pro_id, 'dscp_phone_verified', true );
	if ( ! $phone && $p ) {
		$phone = dreamscaper_e164( $p->phone );
	}
	$biz  = $p ? dreamscaper_norm_words( $p->business ) : '';
	$town = $p ? dreamscaper_norm_words( $p->town ) : '';
	$addr = $p && $p->address ? dreamscaper_norm_address( $p->address . ' ' . $p->zip ) : '';
	$lic  = $p ? preg_replace( '/[^a-z0-9]/', '', strtolower( $p->license ) ) : '';
	return array(
		'h_user'     => dreamscaper_hash( 'u' . (int) $pro_id ),
		'h_email'    => dreamscaper_hash( dreamscaper_norm_email( $p && is_email( $p->email ) ? $p->email : ( $u ? $u->user_email : '' ) ) ),
		'h_phone'    => dreamscaper_hash( $phone ),
		'h_business' => strlen( $biz ) >= 3 ? dreamscaper_hash( $biz . '|' . $town ) : '',
		'h_address'  => strlen( $addr ) >= 6 ? dreamscaper_hash( $addr ) : '',
		'h_license'  => strlen( $lic ) >= 4 ? dreamscaper_hash( $lic ) : '',
		'h_card'     => isset( $extra['card'] ) ? dreamscaper_hash( $extra['card'] ) : '',
		'h_customer' => isset( $extra['customer'] ) ? dreamscaper_hash( $extra['customer'] ) : '',
		'h_ip'       => dreamscaper_hash( isset( $_SERVER['REMOTE_ADDR'] ) ? $_SERVER['REMOTE_ADDR'] : '' ),
		'h_device'   => isset( $extra['device'] ) ? dreamscaper_hash( preg_replace( '/[^a-z0-9]/i', '', $extra['device'] ) ) : '',
	);
}

/**
 * Has any part of this identity used a trial before?
 * Returns array( 'block' => [fields that hard-block], 'flag' => [weak signals] ).
 */
function dreamscaper_trial_lookup( $id, $exclude_pro = 0 ) {
	global $wpdb;
	$T     = dreamscaper_t( 'trials' );
	$hard  = array( 'h_user', 'h_email', 'h_phone', 'h_card', 'h_customer', 'h_business', 'h_address', 'h_license' );
	$weak  = array( 'h_ip', 'h_device' );
	$out   = array( 'block' => array(), 'flag' => array() );
	foreach ( array_merge( $hard, $weak ) as $k ) {
		if ( empty( $id[ $k ] ) ) {
			continue;
		}
		$hit = (int) $wpdb->get_var( $wpdb->prepare( "SELECT id FROM $T WHERE $k=%s AND pro_id<>%d LIMIT 1", $id[ $k ], $exclude_pro ) ); // phpcs:ignore
		if ( ! $hit && 'h_user' === $k ) {
			$hit = (int) $wpdb->get_var( $wpdb->prepare( "SELECT id FROM $T WHERE h_user=%s LIMIT 1", $id[ $k ] ) );
		}
		if ( $hit ) {
			$out[ in_array( $k, $hard, true ) ? 'block' : 'flag' ][] = substr( $k, 2 );
		}
	}
	return $out;
}

function dreamscaper_trial_ledger_add( $pro_id, $id, $ends, $note = '' ) {
	global $wpdb;
	$wpdb->insert( dreamscaper_t( 'trials' ), array_merge( array_intersect_key( $id, array_flip( array( 'h_user', 'h_email', 'h_phone', 'h_card', 'h_customer', 'h_business', 'h_address', 'h_license', 'h_ip', 'h_device' ) ) ), array(
		'user_id' => (int) $pro_id, 'pro_id' => (int) $pro_id, 'started' => dreamscaper_now(), 'ends' => $ends, 'outcome' => 'active', 'note' => mb_substr( $note, 0, 250 ), 'created' => dreamscaper_now(),
	) ) );
	// a mirror that survives an uninstall/reinstall of the tables
	$mirror = get_option( 'dreamscaper_trial_mirror', array() );
	$mirror = is_array( $mirror ) ? $mirror : array();
	foreach ( array( 'h_email', 'h_phone', 'h_card', 'h_customer', 'h_business', 'h_address', 'h_license', 'h_user' ) as $k ) {
		if ( ! empty( $id[ $k ] ) ) {
			$mirror[ substr( $id[ $k ], 0, 24 ) ] = 1;
		}
	}
	update_option( 'dreamscaper_trial_mirror', $mirror, false );
}
/** Restore the ledger from the mirror if the table was emptied (e.g. plugin data was wiped). */
function dreamscaper_trial_mirror_hit( $id ) {
	$mirror = get_option( 'dreamscaper_trial_mirror', array() );
	foreach ( array( 'h_email', 'h_phone', 'h_card', 'h_customer', 'h_business', 'h_address', 'h_license', 'h_user' ) as $k ) {
		if ( ! empty( $id[ $k ] ) && isset( $mirror[ substr( $id[ $k ], 0, 24 ) ] ) ) {
			return substr( $k, 2 );
		}
	}
	return '';
}

/** Can this contractor start a free trial right now? Returns array( ok, reason, needs[] ). */
function dreamscaper_trial_eligibility( $pro_id, $device = '' ) {
	$cfg = dreamscaper_subs_cfg();
	$p   = dreamscaper_pro_row( $pro_id );
	$s   = dreamscaper_sub( $pro_id );
	if ( ! $p || 'approved' !== $p->status ) {
		return array( 'ok' => false, 'reason' => 'Your contractor application needs to be approved first.' );
	}
	if ( 'none' !== $s->status ) {
		return array( 'ok' => false, 'reason' => 'trialing' === $s->status ? 'Your trial is already running.' : 'Free trials are for new accounts.' );
	}
	$u = get_userdata( $pro_id );
	$email = $p && is_email( $p->email ) ? $p->email : ( $u ? $u->user_email : '' );
	if ( dreamscaper_disposable_email( $email ) || ( $u && dreamscaper_disposable_email( $u->user_email ) ) ) {
		return array( 'ok' => false, 'reason' => 'Please use your real business email (temporary email addresses can’t start a trial).', 'fix' => 'email' );
	}
	$id   = dreamscaper_trial_identity( $pro_id, array( 'device' => $device ) );
	$hits = dreamscaper_trial_lookup( $id, $pro_id );
	$mir  = dreamscaper_trial_mirror_hit( $id );
	if ( $hits['block'] || $mir ) {
		return array( 'ok' => false, 'used' => true, 'reason' => 'It looks like this business has already used its free trial. You can start on any plan today — and cancel any time.', 'matched' => $hits['block'] ? $hits['block'] : array( $mir ) );
	}
	$needs = array();
	if ( $cfg['otp'] && dreamscaper_sms_ready() && ! get_user_meta( $pro_id, 'dscp_phone_verified', true ) ) {
		$needs[] = 'phone';
	}
	if ( ! get_user_meta( $pro_id, 'dscp_email_verified', true ) || dreamscaper_norm_email( get_user_meta( $pro_id, 'dscp_email_verified', true ) ) !== dreamscaper_norm_email( $email ) ) {
		$needs[] = 'email';
	}
	return array( 'ok' => true, 'needs' => $needs, 'flag' => $hits['flag'] );
}

/* ---------------------------------------------------------- verification */

/** Send a 6-digit code by text (phone) or email. */
function dreamscaper_otp_send( $pro_id, $channel, $dest ) {
	if ( ! dreamscaper_limit( 'otp_' . $channel, 6, DAY_IN_SECONDS ) ) {
		return dreamscaper_crm_err( 'Too many codes today. Please try again tomorrow.', 429 );
	}
	$code = (string) wp_rand( 100000, 999999 );
	update_user_meta( $pro_id, 'dscp_otp_' . $channel, array( 'h' => wp_hash_password( $code ), 'dest' => $dest, 'exp' => time() + 15 * MINUTE_IN_SECONDS, 'tries' => 0 ) );
	if ( 'phone' === $channel ) {
		$ok = dreamscaper_sms( $dest, 'Your DreamScaper verification code is ' . $code . '. It expires in 15 minutes.' );
		return true === $ok ? true : $ok;
	}
	return wp_mail( $dest, 'Your DreamScaper verification code: ' . $code, "Your verification code is {$code}.\n\nIt expires in 15 minutes. If you didn’t ask for this, you can ignore this email." ) ? true : dreamscaper_crm_err( 'The email couldn’t be sent.', 500 );
}
function dreamscaper_otp_check( $pro_id, $channel, $code ) {
	$o = get_user_meta( $pro_id, 'dscp_otp_' . $channel, true );
	if ( ! is_array( $o ) || $o['exp'] < time() ) {
		return dreamscaper_crm_err( 'That code has expired. Send a new one.' );
	}
	if ( $o['tries'] >= 5 ) {
		return dreamscaper_crm_err( 'Too many tries. Send a new code.' );
	}
	$o['tries']++;
	update_user_meta( $pro_id, 'dscp_otp_' . $channel, $o );
	if ( ! wp_check_password( preg_replace( '/\D/', '', (string) $code ), $o['h'] ) ) {
		return dreamscaper_crm_err( 'That code isn’t right. Check it and try again.' );
	}
	delete_user_meta( $pro_id, 'dscp_otp_' . $channel );
	update_user_meta( $pro_id, 'phone' === $channel ? 'dscp_phone_verified' : 'dscp_email_verified', $o['dest'] );
	return true;
}

/* ----------------------------------------------------------------- Stripe */

/** Stripe call that returns Stripe's own message on failure (for billing screens). */
function dreamscaper_stripe_x( $method, $path, $body = array(), $account = '' ) {
	$hdr = array( 'Authorization' => 'Bearer ' . dreamscaper_opt( 'stripe_secret' ), 'Stripe-Version' => '2024-06-20' );
	if ( $account ) {
		$hdr['Stripe-Account'] = $account; // act on a contractor's connected account
	}
	$res  = wp_remote_request( 'https://api.stripe.com/v1/' . $path, array(
		'method'  => $method,
		'timeout' => 25,
		'headers' => $hdr,
		'body'    => $body ? $body : null,
	) );
	$code = is_wp_error( $res ) ? 0 : wp_remote_retrieve_response_code( $res );
	$j    = is_wp_error( $res ) ? null : json_decode( wp_remote_retrieve_body( $res ), true );
	if ( $code < 200 || $code >= 300 || ! is_array( $j ) ) {
		$m = is_array( $j ) && isset( $j['error']['message'] ) ? $j['error']['message'] : 'Payments are unavailable right now. Please try again later.';
		return new WP_Error( 'dreamscaper', $m, array( 'status' => 502 ) );
	}
	return $j;
}

/** The contractor's Stripe customer (created once, tagged with the contractor id). */
function dreamscaper_sub_customer( $pro_id ) {
	$s = dreamscaper_sub_row( $pro_id );
	if ( $s && $s->stripe_customer ) {
		return $s->stripe_customer;
	}
	$p = dreamscaper_pro_row( $pro_id );
	$u = get_userdata( $pro_id );
	$c = dreamscaper_stripe_x( 'POST', 'customers', array(
		'email' => $p && is_email( $p->email ) ? $p->email : $u->user_email, 'name' => $p ? $p->business : $u->display_name,
		'phone' => $p ? dreamscaper_e164( $p->phone ) : '', 'metadata[dreamscaper_pro]' => $pro_id, 'metadata[site]' => home_url( '/' ),
	) );
	if ( is_wp_error( $c ) ) {
		return $c;
	}
	dreamscaper_sub_update( $pro_id, array( 'stripe_customer' => $c['id'] ) + ( $s ? array() : array( 'status' => 'none', 'plan' => dreamscaper_subs_cfg()['trial_plan'] ) ) );
	return $c['id'];
}

function dreamscaper_plan_price_id( $plan, $billing ) {
	$plans = dreamscaper_plans();
	return isset( $plans[ $plan ][ 'price_' . $billing ] ) ? trim( $plans[ $plan ][ 'price_' . $billing ] ) : '';
}
function dreamscaper_plan_from_price( $price ) {
	foreach ( dreamscaper_plans() as $k => $p ) {
		foreach ( array( 'month', 'year' ) as $b ) {
			if ( $price && $price === trim( $p[ 'price_' . $b ] ) ) {
				return array( $k, $b );
			}
		}
	}
	return array( '', '' );
}

/** Map a Stripe subscription object onto our record. */
function dreamscaper_sub_apply_stripe( $pro_id, $ss, $event = '' ) {
	$old   = dreamscaper_sub_row( $pro_id );
	$price = isset( $ss['items']['data'][0]['price']['id'] ) ? $ss['items']['data'][0]['price']['id'] : '';
	list( $plan, $billing ) = dreamscaper_plan_from_price( $price );
	$map = array( 'trialing' => 'trialing', 'active' => 'active', 'past_due' => 'past_due', 'unpaid' => 'past_due', 'paused' => 'paused', 'incomplete' => 'none', 'incomplete_expired' => 'none' );
	$st  = isset( $map[ $ss['status'] ] ) ? $map[ $ss['status'] ] : 'paused';
	if ( 'canceled' === $ss['status'] ) {
		$why = isset( $ss['cancellation_details']['reason'] ) ? $ss['cancellation_details']['reason'] : '';
		$st  = 'payment_failed' === $why || ( $old && in_array( $old->status, array( 'past_due', 'paused' ), true ) ) ? 'paused' : 'cancelled';
		if ( $old && 'none' === $old->status ) {
			$st = 'none';
		}
	}
	// past due for longer than the grace period stays paused even while Stripe keeps retrying
	if ( 'past_due' === $st && $old && $old->past_due_at && strtotime( $old->past_due_at . ' UTC' ) < time() - (int) dreamscaper_subs_cfg()['grace_days'] * DAY_IN_SECONDS ) {
		$st = 'paused';
	}
	$f = array(
		'status' => $st, 'stripe_sub' => $ss['id'], 'stripe_customer' => is_array( $ss['customer'] ) ? $ss['customer']['id'] : $ss['customer'], 'stripe_price' => $price,
		'trial_ends' => ! empty( $ss['trial_end'] ) ? gmdate( 'Y-m-d H:i:s', $ss['trial_end'] ) : null,
		'period_end' => ! empty( $ss['current_period_end'] ) ? gmdate( 'Y-m-d H:i:s', $ss['current_period_end'] ) : null,
		'cancel_at'  => ! empty( $ss['cancel_at'] ) ? gmdate( 'Y-m-d H:i:s', $ss['cancel_at'] ) : ( ! empty( $ss['cancel_at_period_end'] ) && ! empty( $ss['current_period_end'] ) ? gmdate( 'Y-m-d H:i:s', $ss['current_period_end'] ) : null ),
		'synced'     => dreamscaper_now(),
	);
	if ( $plan ) {
		$f['plan']    = $plan;
		$f['billing'] = $billing;
	}
	return dreamscaper_sub_update( $pro_id, $f, $event ? 'stripe' : 'sync', $event ? 'Stripe: ' . $ss['status'] : '', array( 'event' => $event ) );
}

/** A finished subscription Checkout: check the card against the trial ledger, then record it. */
function dreamscaper_sub_checkout_done( $s, $event = '' ) {
	if ( empty( $s['mode'] ) || 'subscription' !== $s['mode'] || empty( $s['metadata']['dreamscaper_pro'] ) || empty( $s['subscription'] ) ) {
		return null;
	}
	$pro_id = (int) $s['metadata']['dreamscaper_pro'];
	$key    = 'dscp_subsess_' . md5( $s['id'] );
	if ( ! add_option( $key, time(), '', false ) ) {
		return dreamscaper_sub_row( $pro_id ); // already handled
	}
	$ss = dreamscaper_stripe_x( 'GET', 'subscriptions/' . rawurlencode( $s['subscription'] ) . '?expand[]=default_payment_method' );
	if ( is_wp_error( $ss ) ) {
		delete_option( $key );
		return $ss;
	}
	$trial = ! empty( $s['metadata']['dreamscaper_trial'] ) && 'trialing' === $ss['status'];
	if ( $trial ) {
		$card   = isset( $ss['default_payment_method']['card']['fingerprint'] ) ? $ss['default_payment_method']['card']['fingerprint'] : '';
		$id     = dreamscaper_trial_identity( $pro_id, array( 'card' => $card, 'customer' => $ss['customer'], 'device' => isset( $s['metadata']['dreamscaper_device'] ) ? $s['metadata']['dreamscaper_device'] : '' ) );
		$hits   = dreamscaper_trial_lookup( $id, $pro_id );
		if ( $hits['block'] || dreamscaper_trial_mirror_hit( $id ) ) {
			// this card (or business) already had a trial: cancel before any charge and say so plainly
			dreamscaper_stripe_x( 'DELETE', 'subscriptions/' . rawurlencode( $ss['id'] ) );
			dreamscaper_sub_update( $pro_id, array( 'status' => 'none', 'stripe_sub' => '', 'stripe_customer' => is_array( $ss['customer'] ) ? $ss['customer']['id'] : $ss['customer'] ), 'trial_blocked', 'Matched a previous trial: ' . implode( ', ', $hits['block'] ? $hits['block'] : array( 'mirror' ) ), array( 'event' => $event ) );
			dreamscaper_sub_mail( $pro_id, 'About your DreamScaper free trial', "Hi,\n\nThe card you used has already been used for a DreamScaper free trial, so we cancelled this trial straight away — you have not been charged.\n\nYou can start on any plan today (and cancel any time) from Plan & billing.", 'Choose a plan' );
			return dreamscaper_sub_row( $pro_id );
		}
		dreamscaper_trial_ledger_add( $pro_id, $id, gmdate( 'Y-m-d H:i:s', $ss['trial_end'] ), 'Card trial' );
		if ( $hits['flag'] ) {
			dreamscaper_sub_event( $pro_id, 'trial_flag', '', 'trialing', 'Shares ' . implode( ' and ', $hits['flag'] ) . ' with an earlier trial — review if unsure', array( 'actor' => 0 ) );
		}
	}
	$row = dreamscaper_sub_apply_stripe( $pro_id, $ss, $event ? $event : 'checkout' );
	if ( $trial ) {
		$days = (int) dreamscaper_subs_cfg()['trial_days'];
		$pl   = dreamscaper_plans()[ $row->plan ];
		dreamscaper_sub_mail( $pro_id, 'Your ' . $days . '-day DreamScaper trial has started', "Welcome!\n\nYour free trial runs until " . wp_date( 'F j', strtotime( $row->trial_ends . ' UTC' ) ) . ". On that day your {$pl['name']} plan starts at $" . number_format( (float) $pl[ 'month' === $row->billing ? 'month' : 'year' ], 0 ) . '/' . ( 'month' === $row->billing ? 'month' : 'year' ) . " unless you cancel — we’ll remind you a week before and the day before.\n\nGood first steps: add your logo, set your labor rate, turn on your reminders and rewrite your customer messages in your own words.", 'Open my Contractor Hub' );
	}
	return $row;
}

add_action( 'dreamscaper_stripe_event', function ( $e ) {
	$type = isset( $e['type'] ) ? $e['type'] : '';
	$obj  = isset( $e['data']['object'] ) ? $e['data']['object'] : array();
	$eid  = isset( $e['id'] ) ? $e['id'] : '';
	if ( 'checkout.session.completed' === $type ) {
		dreamscaper_sub_checkout_done( $obj, $eid );
		return;
	}
	if ( in_array( $type, array( 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'customer.subscription.paused', 'customer.subscription.resumed' ), true ) ) {
		$pro = dreamscaper_sub_pro_for( $obj );
		if ( $pro ) {
			dreamscaper_sub_apply_stripe( $pro, $obj, $eid );
		}
		return;
	}
	if ( in_array( $type, array( 'invoice.paid', 'invoice.payment_failed' ), true ) && ! empty( $obj['subscription'] ) ) {
		$pro = dreamscaper_sub_pro_for( array( 'id' => $obj['subscription'], 'customer' => $obj['customer'], 'metadata' => isset( $obj['subscription_details']['metadata'] ) ? $obj['subscription_details']['metadata'] : array() ) );
		if ( ! $pro ) {
			return;
		}
		global $wpdb;
		$amount = isset( $obj['amount_paid'] ) ? $obj['amount_paid'] / 100 : 0;
		if ( 'invoice.paid' === $type ) {
			$wpdb->update( dreamscaper_t( 'subs' ), array( 'last_payment' => dreamscaper_now(), 'failures' => 0 ), array( 'pro_id' => $pro ) );
			if ( $amount > 0 ) {
				dreamscaper_sub_event( $pro, 'payment', '', '', 'Paid', array( 'amount' => $amount, 'event' => $eid, 'actor' => 0 ) );
			}
		} else {
			$wpdb->query( $wpdb->prepare( 'UPDATE ' . dreamscaper_t( 'subs' ) . ' SET failures=failures+1 WHERE pro_id=%d', $pro ) );
			dreamscaper_sub_event( $pro, 'payment_failed', '', '', 'Card declined', array( 'amount' => isset( $obj['amount_due'] ) ? $obj['amount_due'] / 100 : 0, 'event' => $eid, 'actor' => 0 ) );
		}
		$ss = dreamscaper_stripe_x( 'GET', 'subscriptions/' . rawurlencode( $obj['subscription'] ) );
		if ( ! is_wp_error( $ss ) ) {
			dreamscaper_sub_apply_stripe( $pro, $ss, $eid );
		}
	}
} );

/** Which contractor a Stripe subscription belongs to. */
function dreamscaper_sub_pro_for( $obj ) {
	global $wpdb;
	if ( ! empty( $obj['metadata']['dreamscaper_pro'] ) ) {
		return (int) $obj['metadata']['dreamscaper_pro'];
	}
	$S = dreamscaper_t( 'subs' );
	if ( ! empty( $obj['id'] ) ) {
		$pro = (int) $wpdb->get_var( $wpdb->prepare( "SELECT pro_id FROM $S WHERE stripe_sub=%s", $obj['id'] ) );
		if ( $pro ) {
			return $pro;
		}
	}
	$cus = isset( $obj['customer'] ) ? ( is_array( $obj['customer'] ) ? $obj['customer']['id'] : $obj['customer'] ) : '';
	return $cus ? (int) $wpdb->get_var( $wpdb->prepare( "SELECT pro_id FROM $S WHERE stripe_customer=%s", $cus ) ) : 0;
}

/* ------------------------------------------------------------------ daily */

add_action( 'dreamscaper_subs_daily', 'dreamscaper_subs_daily' );
function dreamscaper_subs_daily() {
	global $wpdb;
	if ( ! dreamscaper_subs_on() ) {
		return;
	}
	$S   = dreamscaper_t( 'subs' );
	$cfg = dreamscaper_subs_cfg();
	// non-payment stages: one message per stage, then suspend on the day (never more than one message a run)
	foreach ( $wpdb->get_results( "SELECT * FROM $S WHERE status='past_due' AND past_due_at IS NOT NULL LIMIT 500" ) as $s ) { // phpcs:ignore
		$d = dreamscaper_sub_days_due( $s );
		if ( $d >= (int) $cfg['grace_days'] ) {
			dreamscaper_sub_update( (int) $s->pro_id, array( 'status' => 'paused' ), 'grace_over', 'Suspended: payment ' . $d . ' days past due', array( 'actor' => 0 ) );
			continue;
		}
		$stage = $d >= (int) $cfg['grace_days'] - 1 ? 'final' : ( $d >= (int) $cfg['stages']['readonly'] ? 'readonly' : ( $d >= (int) $cfg['stages']['restricted'] ? 'restricted' : ( $d >= (int) $cfg['stages']['reminder'] ? 'reminder' : '' ) ) );
		if ( $stage ) {
			dreamscaper_dun( $s, $stage, $s->past_due_at );
		}
	}
	// suspended: gentle reminders, and flag accounts that reach the retention review (nothing is deleted automatically)
	foreach ( $wpdb->get_results( "SELECT * FROM $S WHERE status='paused' AND paused_at IS NOT NULL LIMIT 500" ) as $s ) { // phpcs:ignore
		$d = (int) floor( ( time() - strtotime( $s->paused_at . ' UTC' ) ) / DAY_IN_SECONDS );
		foreach ( array( 60 => 'susp_60', 30 => 'susp_30', 7 => 'susp_7' ) as $at => $k ) {
			if ( $d >= $at ) {
				dreamscaper_dun( $s, $k, $s->paused_at );
				break;
			}
		}
		$due_days = $s->past_due_at ? (int) floor( ( time() - strtotime( $s->past_due_at . ' UTC' ) ) / DAY_IN_SECONDS ) : $d;
		if ( $due_days >= (int) $cfg['deletion_days'] && ! $wpdb->get_var( $wpdb->prepare( 'SELECT id FROM ' . dreamscaper_t( 'sub_events' ) . " WHERE pro_id=%d AND kind='deletion_eligible' AND created >= %s LIMIT 1", $s->pro_id, $s->paused_at ) ) ) {
			dreamscaper_sub_event( (int) $s->pro_id, 'deletion_eligible', 'paused', 'paused', 'Unpaid for ' . $due_days . ' days — eligible for deletion under the retention policy. Nothing has been deleted.', array( 'actor' => 0 ) );
		}
	}
	// trials without a Stripe subscription (grandfathered) that ended → paused
	foreach ( $wpdb->get_col( $wpdb->prepare( "SELECT pro_id FROM $S WHERE status='trialing' AND stripe_sub='' AND trial_ends IS NOT NULL AND trial_ends < %s", dreamscaper_now() ) ) as $pro ) {
		dreamscaper_sub_update( (int) $pro, array( 'status' => 'paused' ), 'trial_over', 'Trial ended without a plan', array( 'actor' => 0 ) );
		$wpdb->update( dreamscaper_t( 'trials' ), array( 'outcome' => 'expired' ), array( 'pro_id' => (int) $pro, 'outcome' => 'active' ) );
	}
	// trial reminders: a week before and the day before (once each)
	foreach ( $wpdb->get_results( $wpdb->prepare( "SELECT * FROM $S WHERE status='trialing' AND trial_ends IS NOT NULL AND trial_ends > %s", dreamscaper_now() ) ) as $s ) {
		$left = (int) ceil( ( strtotime( $s->trial_ends . ' UTC' ) - time() ) / DAY_IN_SECONDS );
		foreach ( array( 7, 1 ) as $d ) {
			if ( $left <= $d && ! get_user_meta( $s->pro_id, 'dscp_trial_warn_' . $d, true ) ) {
				update_user_meta( $s->pro_id, 'dscp_trial_warn_' . $d, 1 );
				$pl  = dreamscaper_plans()[ $s->plan ];
				$txt = $s->stripe_sub
					? "Your free trial ends on " . wp_date( 'F j', strtotime( $s->trial_ends . ' UTC' ) ) . ". Your {$pl['name']} plan then starts automatically on the card you added. Want a different plan, or to cancel? You can do it in one tap from Plan & billing."
					: "Your free trial ends on " . wp_date( 'F j', strtotime( $s->trial_ends . ' UTC' ) ) . ". Choose a plan before then to keep everything running without a break — your data is safe either way.";
				dreamscaper_sub_mail( $s->pro_id, 1 === $d ? 'Your DreamScaper trial ends tomorrow' : 'Your DreamScaper trial ends in a week', $txt );
			}
		}
	}
	// reconcile with Stripe so a missed webhook can never leave an account wrong
	foreach ( $wpdb->get_results( $wpdb->prepare( "SELECT * FROM $S WHERE stripe_sub<>'' AND (synced IS NULL OR synced < %s) LIMIT 40", gmdate( 'Y-m-d H:i:s', time() - DAY_IN_SECONDS ) ) ) as $s ) {
		$ss = dreamscaper_stripe_x( 'GET', 'subscriptions/' . rawurlencode( $s->stripe_sub ) );
		if ( ! is_wp_error( $ss ) ) {
			dreamscaper_sub_apply_stripe( (int) $s->pro_id, $ss );
		} else {
			$wpdb->update( $S, array( 'synced' => dreamscaper_now() ), array( 'pro_id' => $s->pro_id ) );
		}
	}
}

/* ------------------------------------------------------------------- REST */

add_action( 'rest_api_init', function () {
	$auth = function () {
		return is_user_logged_in();
	};
	foreach ( array(
		array( '/sub/status', 'GET', 'dreamscaper_rest_sub_status' ),
		array( '/crm/capabilities', 'GET', 'dreamscaper_rest_sub_status' ),
		array( '/sub/verify/send', 'POST', 'dreamscaper_rest_sub_verify_send' ),
		array( '/sub/verify/check', 'POST', 'dreamscaper_rest_sub_verify_check' ),
		array( '/sub/checkout', 'POST', 'dreamscaper_rest_sub_checkout' ),
		array( '/sub/confirm', 'POST', 'dreamscaper_rest_sub_confirm' ),
		array( '/sub/portal', 'POST', 'dreamscaper_rest_sub_portal' ),
		array( '/sub/change', 'POST', 'dreamscaper_rest_sub_change' ),
		array( '/sub/cancel', 'POST', 'dreamscaper_rest_sub_cancel' ),
		array( '/sub/prefs', 'POST', 'dreamscaper_rest_sub_prefs' ),
		array( '/crm/export', 'GET', 'dreamscaper_rest_export' ),
		array( '/crm/held', 'GET', 'dreamscaper_rest_held' ),
		array( '/crm/held', 'POST', 'dreamscaper_rest_held_act' ),
	) as $r ) {
		register_rest_route( 'dreamscaper/v1', $r[0], array( 'methods' => $r[1], 'callback' => $r[2], 'permission_callback' => $auth ) );
	}
} );

/** The approved contractor (paused or not) for billing screens. */
function dreamscaper_billing_pro() {
	$uid = get_current_user_id();
	$p   = dreamscaper_pro_row( $uid );
	if ( ! $p || 'approved' !== $p->status ) {
		return dreamscaper_crm_err( 'This is for approved contractors.', 403 );
	}
	return $p;
}

/** Plan, status, every feature and limit with usage, and the plan catalog (also /crm/capabilities). */
function dreamscaper_sub_status_payload( $pro_id ) {
	global $wpdb;
	$s     = dreamscaper_sub( $pro_id );
	$plan  = dreamscaper_pro_plan( $pro_id );
	$cat   = dreamscaper_feature_catalog();
	$feats = array();
	foreach ( $cat as $k => $f ) {
		$x = array( 'key' => $k, 'type' => $f[0], 'label' => $f[1], 'desc' => $f[2], 'on' => dreamscaper_pro_can( $pro_id, $k ) );
		if ( 'limit' === $f[0] ) {
			$x = array_merge( $x, dreamscaper_pro_limit( $pro_id, $k ) );
		}
		$feats[ $k ] = $x;
	}
	$plans = array();
	foreach ( dreamscaper_plans() as $k => $p ) {
		$lines   = function ( $t ) { return array_values( array_filter( array_map( 'trim', explode( "\n", (string) $t ) ) ) ); };
		$plans[] = array( 'key' => $k, 'name' => $p['name'], 'tag' => $p['tag'], 'month' => (float) $p['month'], 'year' => (float) $p['year'], 'f' => $p['f'], 'popular' => ! empty( $p['popular'] ), 'includes' => $lines( $p['includes'] ), 'not' => $lines( $p['not'] ), 'buyable' => array( 'month' => '' !== trim( $p['price_month'] ), 'year' => '' !== trim( $p['price_year'] ) ) );
	}
	$cfg   = dreamscaper_subs_cfg();
	$elig  = 'none' === $s->status && dreamscaper_subs_on() ? dreamscaper_trial_eligibility( $pro_id ) : null;
	$evts  = $wpdb->get_results( $wpdb->prepare( 'SELECT kind, from_status, to_status, plan, amount, note, created FROM ' . dreamscaper_t( 'sub_events' ) . ' WHERE pro_id=%d ORDER BY id DESC LIMIT 12', $pro_id ) );
	return array(
		'billing_on' => dreamscaper_subs_on(),
		'status'     => $s->status,
		'plan'       => $plan['key'],
		'plan_name'  => $plan['def']['name'],
		'paid_plan'  => $s->plan,
		'billing'    => isset( $s->billing ) ? $s->billing : 'month',
		'writable'   => dreamscaper_pro_writable( $pro_id ),
		'trial_ends' => dreamscaper_ms( $s->trial_ends ),
		'trial_days_left' => $s->trial_ends ? max( 0, (int) ceil( ( strtotime( $s->trial_ends . ' UTC' ) - time() ) / DAY_IN_SECONDS ) ) : null,
		'period_end' => dreamscaper_ms( $s->period_end ),
		'cancel_at'  => dreamscaper_ms( $s->cancel_at ),
		'past_due_at' => dreamscaper_ms( $s->past_due_at ),
		'grace_days' => (int) $cfg['grace_days'],
		'pause_on'   => $s->past_due_at ? dreamscaper_ms( dreamscaper_sub_suspend_at( $s ) ) : null,
		'stage'      => dreamscaper_sub_stage( $pro_id ),
		'days_due'   => 'past_due' === $s->status ? dreamscaper_sub_days_due( $s ) : null,
		'stages'     => $cfg['stages'],
		'restricted' => array_keys( array_filter( array( 'ai' => $cfg['restrict_ai'], 'plans' => $cfg['restrict_plans'], 'buy' => $cfg['restrict_buy'], 'uploads' => $cfg['restrict_uploads'], 'auto_sms' => $cfg['restrict_auto_sms'] ) ) ),
		'big_upload_mb' => (int) $cfg['big_upload_mb'],
		'billing_sms' => (bool) get_user_meta( $pro_id, 'dscp_billing_sms', true ),
		'ai'         => dreamscaper_pro_ai_allowance( $pro_id ),
		'has_card'   => ! empty( $s->stripe_sub ),
		'trial'      => $elig,
		'trial_length' => (int) $cfg['trial_days'],
		'trial_ai_credits' => (int) $cfg['trial_ai_credits'],
		'trial_plans' => (int) $cfg['trial_plans'],
		'trial_plan' => $cfg['trial_plan'],
		'phone_verified' => (string) get_user_meta( $pro_id, 'dscp_phone_verified', true ),
		'email_verified' => (string) get_user_meta( $pro_id, 'dscp_email_verified', true ),
		'sms_ready'  => (bool) dreamscaper_sms_ready(),
		'features'   => $feats,
		'plans'      => $plans,
		'events'     => array_map( function ( $e ) { return array( 'kind' => $e->kind, 'from' => $e->from_status, 'to' => $e->to_status, 'plan' => $e->plan, 'amount' => (float) $e->amount, 'note' => $e->note, 'at' => dreamscaper_ms( $e->created ) ); }, $evts ),
		'retention_months' => (int) $cfg['retention_months'],
		'held_followups' => (int) $wpdb->get_var( $wpdb->prepare( 'SELECT COUNT(*) FROM ' . dreamscaper_t( 'followups' ) . " WHERE pro_id=%d AND status='held'", $pro_id ) ),
	);
}

function dreamscaper_rest_sub_status() {
	$p = dreamscaper_billing_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	return dreamscaper_sub_status_payload( (int) $p->user_id );
}

function dreamscaper_rest_sub_verify_send( WP_REST_Request $r ) {
	$p = dreamscaper_billing_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$j  = $r->get_json_params();
	$ch = 'phone' === ( isset( $j['channel'] ) ? $j['channel'] : '' ) ? 'phone' : 'email';
	if ( 'phone' === $ch ) {
		$dest = dreamscaper_e164( isset( $j['phone'] ) ? $j['phone'] : $p->phone );
		if ( ! $dest ) {
			return dreamscaper_crm_err( 'Enter a mobile number that can receive texts.' );
		}
	} else {
		$u    = get_userdata( $p->user_id );
		$dest = is_email( $p->email ) ? $p->email : $u->user_email;
		if ( dreamscaper_disposable_email( $dest ) ) {
			return dreamscaper_crm_err( 'Please use your real business email in Settings → Business profile (temporary email addresses can’t start a trial).' );
		}
	}
	$ok = dreamscaper_otp_send( (int) $p->user_id, $ch, $dest );
	return is_wp_error( $ok ) ? $ok : array( 'ok' => true, 'to' => 'phone' === $ch ? '•••' . substr( $dest, -4 ) : $dest );
}

function dreamscaper_rest_sub_verify_check( WP_REST_Request $r ) {
	$p = dreamscaper_billing_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$j  = $r->get_json_params();
	$ch = 'phone' === ( isset( $j['channel'] ) ? $j['channel'] : '' ) ? 'phone' : 'email';
	$ok = dreamscaper_otp_check( (int) $p->user_id, $ch, isset( $j['code'] ) ? $j['code'] : '' );
	if ( is_wp_error( $ok ) ) {
		return $ok;
	}
	if ( 'phone' === $ch ) {
		// a verified phone number already used for a trial can't start another one
		$id = dreamscaper_trial_identity( (int) $p->user_id );
		$h  = dreamscaper_trial_lookup( array( 'h_phone' => $id['h_phone'] ), (int) $p->user_id );
		if ( $h['block'] ) {
			return array( 'ok' => true, 'warning' => 'This phone number has already been used for a free trial, so you can start on a paid plan instead.' );
		}
	}
	return array( 'ok' => true );
}

/** Start Stripe Checkout for a plan (with the free trial when eligible). */
function dreamscaper_rest_sub_checkout( WP_REST_Request $r ) {
	$p = dreamscaper_billing_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	if ( ! dreamscaper_subs_on() ) {
		return dreamscaper_crm_err( 'Subscriptions aren’t switched on on this website yet.', 503 );
	}
	if ( ! dreamscaper_limit( 'subco', 15, HOUR_IN_SECONDS ) ) {
		return dreamscaper_crm_err( 'Please wait a moment and try again.', 429 );
	}
	$pid     = (int) $p->user_id;
	$j       = $r->get_json_params();
	$plan    = sanitize_key( isset( $j['plan'] ) ? $j['plan'] : 'pro' );
	$billing = 'year' === ( isset( $j['billing'] ) ? $j['billing'] : '' ) ? 'year' : 'month';
	$plans   = dreamscaper_plans();
	if ( ! isset( $plans[ $plan ] ) ) {
		return dreamscaper_crm_err( 'Choose a plan.' );
	}
	$price = dreamscaper_plan_price_id( $plan, $billing );
	if ( ! $price ) {
		return dreamscaper_crm_err( 'That plan isn’t available for ' . ( 'year' === $billing ? 'yearly' : 'monthly' ) . ' billing yet.', 503 );
	}
	$s = dreamscaper_sub( $pid );
	if ( ! empty( $s->stripe_sub ) && dreamscaper_sub_active_status( $s->status ) ) {
		return dreamscaper_crm_err( 'You already have a subscription — use Change plan instead.', 409 );
	}
	$device = substr( preg_replace( '/[^a-z0-9]/i', '', isset( $j['device'] ) ? (string) $j['device'] : '' ), 0, 64 );
	$trial  = false;
	if ( ! empty( $j['trial'] ) ) {
		$el = dreamscaper_trial_eligibility( $pid, $device );
		if ( ! $el['ok'] ) {
			return dreamscaper_crm_err( $el['reason'], 409 );
		}
		if ( ! empty( $el['needs'] ) ) {
			return new WP_Error( 'dreamscaper', 'Please verify your ' . implode( ' and ', $el['needs'] ) . ' first.', array( 'status' => 409, 'needs' => $el['needs'] ) );
		}
		$trial = true;
	}
	$cus = dreamscaper_sub_customer( $pid );
	if ( is_wp_error( $cus ) ) {
		return $cus;
	}
	$back = dreamscaper_app_url( array( 'ds_hub' => 'plan' ) );
	$body = array(
		'mode' => 'subscription', 'customer' => $cus, 'client_reference_id' => (string) $pid,
		'line_items[0][price]' => $price, 'line_items[0][quantity]' => 1,
		'payment_method_collection' => 'always',
		'subscription_data[metadata][dreamscaper_pro]' => $pid,
		'metadata[dreamscaper_pro]' => $pid, 'metadata[dreamscaper_device]' => $device,
		'success_url' => add_query_arg( 'ds_sub', '{CHECKOUT_SESSION_ID}', preg_replace( '/#.*$/', '', $back ) ) . '#dreamscaper',
		'cancel_url'  => $back,
		'allow_promotion_codes' => 'true',
	);
	if ( $trial ) {
		$body['subscription_data[trial_period_days]']                                   = (int) dreamscaper_subs_cfg()['trial_days'];
		$body['subscription_data[trial_settings][end_behavior][missing_payment_method]'] = 'cancel';
		$body['metadata[dreamscaper_trial]']                                            = 1;
		$body['custom_text[submit][message]'] = 'You won’t be charged today. Your plan starts after your ' . (int) dreamscaper_subs_cfg()['trial_days'] . '-day trial unless you cancel — we’ll remind you before then.';
	}
	$co = dreamscaper_stripe_x( 'POST', 'checkout/sessions', $body );
	if ( is_wp_error( $co ) ) {
		return $co;
	}
	dreamscaper_sub_event( $pid, 'checkout', $s->status, $s->status, ( $trial ? 'Trial checkout opened for ' : 'Checkout opened for ' ) . $plans[ $plan ]['name'] . ' (' . $billing . 'ly)', array( 'plan' => $plan ) );
	return array( 'url' => $co['url'] );
}

/** Returning from Checkout: record it now (the webhook does the same; whichever is first wins). */
function dreamscaper_rest_sub_confirm( WP_REST_Request $r ) {
	$p = dreamscaper_billing_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$id = preg_replace( '/[^A-Za-z0-9_]/', '', (string) $r->get_param( 'session' ) );
	if ( ! $id ) {
		return dreamscaper_crm_err( 'Missing session.' );
	}
	$s = dreamscaper_stripe_x( 'GET', 'checkout/sessions/' . $id );
	if ( is_wp_error( $s ) ) {
		return $s;
	}
	if ( (int) ( isset( $s['metadata']['dreamscaper_pro'] ) ? $s['metadata']['dreamscaper_pro'] : 0 ) !== (int) $p->user_id ) {
		return dreamscaper_crm_err( 'That checkout belongs to someone else.', 403 );
	}
	if ( 'complete' === $s['status'] ) {
		$res = dreamscaper_sub_checkout_done( $s, '' );
		if ( is_wp_error( $res ) ) {
			return $res;
		}
	}
	return dreamscaper_sub_status_payload( (int) $p->user_id );
}

/** Stripe's customer portal: update card, invoices, cancel. */
function dreamscaper_rest_sub_portal() {
	$p = dreamscaper_billing_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$s = dreamscaper_sub_row( $p->user_id );
	if ( ! $s || ! $s->stripe_customer ) {
		return dreamscaper_crm_err( 'Choose a plan first.' );
	}
	$ps = dreamscaper_stripe_x( 'POST', 'billing_portal/sessions', array( 'customer' => $s->stripe_customer, 'return_url' => dreamscaper_app_url( array( 'ds_hub' => 'plan' ) ) ) );
	return is_wp_error( $ps ) ? $ps : array( 'url' => $ps['url'] );
}

/** Switch plan or billing period (prorated by Stripe). */
function dreamscaper_rest_sub_change( WP_REST_Request $r ) {
	$p = dreamscaper_billing_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$j       = $r->get_json_params();
	$plan    = sanitize_key( isset( $j['plan'] ) ? $j['plan'] : '' );
	$billing = 'year' === ( isset( $j['billing'] ) ? $j['billing'] : '' ) ? 'year' : 'month';
	$price   = dreamscaper_plan_price_id( $plan, $billing );
	$s       = dreamscaper_sub_row( $p->user_id );
	if ( ! $price ) {
		return dreamscaper_crm_err( 'That plan isn’t available yet.' );
	}
	if ( ! $s || ! $s->stripe_sub ) {
		return dreamscaper_crm_err( 'Choose a plan first.', 409 );
	}
	$ss = dreamscaper_stripe_x( 'GET', 'subscriptions/' . rawurlencode( $s->stripe_sub ) );
	if ( is_wp_error( $ss ) ) {
		return $ss;
	}
	$up = dreamscaper_stripe_x( 'POST', 'subscriptions/' . rawurlencode( $s->stripe_sub ), array(
		'items[0][id]' => $ss['items']['data'][0]['id'], 'items[0][price]' => $price, 'proration_behavior' => 'create_prorations', 'cancel_at_period_end' => 'false',
	) );
	if ( is_wp_error( $up ) ) {
		return $up;
	}
	dreamscaper_sub_apply_stripe( (int) $p->user_id, $up, 'change' );
	return dreamscaper_sub_status_payload( (int) $p->user_id );
}

/** Billing preferences: texts about billing problems (opt-in, separate from customer texts). */
function dreamscaper_rest_sub_prefs( WP_REST_Request $r ) {
	$p = dreamscaper_billing_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$j = $r->get_json_params();
	if ( array_key_exists( 'billing_sms', $j ) ) {
		update_user_meta( (int) $p->user_id, 'dscp_billing_sms', empty( $j['billing_sms'] ) ? 0 : 1 );
		dreamscaper_sub_event( (int) $p->user_id, 'prefs', '', '', empty( $j['billing_sms'] ) ? 'Billing texts off' : 'Billing texts on' );
	}
	return dreamscaper_sub_status_payload( (int) $p->user_id );
}

/** Cancel at the end of the paid period (or undo that). */
function dreamscaper_rest_sub_cancel( WP_REST_Request $r ) {
	$p = dreamscaper_billing_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$j    = $r->get_json_params();
	$undo = ! empty( $j['undo'] );
	$s    = dreamscaper_sub_row( $p->user_id );
	if ( ! $s || ! $s->stripe_sub ) {
		return dreamscaper_crm_err( 'There’s no subscription to cancel.' );
	}
	$up = dreamscaper_stripe_x( 'POST', 'subscriptions/' . rawurlencode( $s->stripe_sub ), array( 'cancel_at_period_end' => $undo ? 'false' : 'true' ) );
	if ( is_wp_error( $up ) ) {
		return $up;
	}
	dreamscaper_sub_apply_stripe( (int) $p->user_id, $up, $undo ? 'resume' : 'cancel' );
	dreamscaper_sub_event( (int) $p->user_id, $undo ? 'resume' : 'cancel_request', $s->status, $s->status, $undo ? 'Kept subscription' : 'Cancels at the end of the period', array( 'plan' => $s->plan ) );
	if ( ! $undo ) {
		dreamscaper_sub_mail( (int) $p->user_id, 'Your DreamScaper subscription will end', 'Your subscription is set to end on ' . ( $up['current_period_end'] ? wp_date( 'F j, Y', $up['current_period_end'] ) : 'the end of this period' ) . ". You keep full access until then, and your records stay safe afterwards — export them any time from Plan & billing.\n\nChanged your mind? Tap “Keep my subscription” in Plan & billing.", 'Open Plan & billing' );
	}
	return dreamscaper_sub_status_payload( (int) $p->user_id );
}

/** CSV export of the contractor's records — always available, even when paused or cancelled. */
function dreamscaper_rest_export( WP_REST_Request $r ) {
	global $wpdb;
	$p = dreamscaper_billing_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$what = sanitize_key( (string) $r->get_param( 'what' ) );
	$id   = (int) $p->user_id;
	$sets = array(
		'customers'  => array( 'SELECT id, stage, source, name, company, email, phone, address, town, state, zip, tags, created, updated FROM ' . dreamscaper_t( 'clients' ) . ' WHERE pro_id=%d ORDER BY id', 'customers' ),
		'properties' => array( 'SELECT id, client_id, address, lat, lng, created, updated FROM ' . dreamscaper_t( 'props' ) . ' WHERE pro_id=%d ORDER BY id', 'properties' ),
		'quotes'     => array( 'SELECT id, number, title, client_id, prop_id, status, job_status, price, cost, total, valid_until, sent_at, viewed_at, signed_at, created, updated FROM ' . dreamscaper_t( 'quotes' ) . ' WHERE pro_id=%d ORDER BY id', 'quotes' ),
		'invoices'   => array( 'SELECT id, number, kind, title, quote_id, client_id, amount, status, due, recur, paid_at, sent_at, created FROM ' . dreamscaper_t( 'invoices' ) . ' WHERE pro_id=%d ORDER BY id', 'invoices' ),
		'schedule'   => array( 'SELECT * FROM ' . dreamscaper_t( 'visits' ) . ' WHERE pro_id=%d ORDER BY start', 'schedule' ),
		'activity'   => array( 'SELECT id, client_id, quote_id, kind, text, created FROM ' . dreamscaper_t( 'activity' ) . ' WHERE pro_id=%d ORDER BY id', 'activity' ),
	);
	if ( ! isset( $sets[ $what ] ) ) {
		return array( 'available' => array_keys( $sets ) );
	}
	$rows = $wpdb->get_results( $wpdb->prepare( $sets[ $what ][0], $id ), ARRAY_A ); // phpcs:ignore
	nocache_headers();
	header( 'Content-Type: text/csv; charset=utf-8' );
	header( 'Content-Disposition: attachment; filename="dreamscaper-' . $sets[ $what ][1] . '-' . gmdate( 'Y-m-d' ) . '.csv"' );
	$out = fopen( 'php://output', 'w' );
	fwrite( $out, "\xEF\xBB\xBF" );
	if ( $rows ) {
		fputcsv( $out, array_keys( $rows[0] ) );
		foreach ( $rows as $row ) {
			fputcsv( $out, array_map( function ( $v ) { return is_string( $v ) && preg_match( '/^[=+\-@]/', $v ) ? "'" . $v : $v; }, $row ) );
		}
	} else {
		fputcsv( $out, array( 'No records yet' ) );
	}
	fclose( $out );
	exit;
}

/** Follow-ups that came due while the account was paused: review before anything goes out late. */
function dreamscaper_rest_held() {
	global $wpdb;
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$rows = $wpdb->get_results( $wpdb->prepare( 'SELECT f.id, f.quote_id, f.channel, f.send_at, f.subject, q.title, q.number FROM ' . dreamscaper_t( 'followups' ) . ' f LEFT JOIN ' . dreamscaper_t( 'quotes' ) . " q ON q.id=f.quote_id WHERE f.pro_id=%d AND f.status='held' ORDER BY f.send_at LIMIT 200", $p->user_id ) );
	return array( 'items' => array_map( function ( $f ) { return array( 'id' => (int) $f->id, 'quote_id' => (int) $f->quote_id, 'title' => $f->title, 'number' => $f->number, 'channel' => $f->channel, 'subject' => $f->subject, 'was_due' => dreamscaper_ms( $f->send_at ) ); }, $rows ) );
}
function dreamscaper_rest_held_act( WP_REST_Request $r ) {
	global $wpdb;
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$j   = $r->get_json_params();
	$act = isset( $j['action'] ) && 'send' === $j['action'] ? 'send' : 'discard';
	$F   = dreamscaper_t( 'followups' );
	$ids = array_filter( array_map( 'intval', (array) ( isset( $j['ids'] ) ? $j['ids'] : array() ) ) );
	$n   = 0;
	foreach ( $ids as $id ) {
		$n += (int) $wpdb->update( $F, 'send' === $act ? array( 'status' => 'scheduled', 'send_at' => dreamscaper_now() ) : array( 'status' => 'cancelled', 'error' => 'Discarded after pause' ), array( 'id' => $id, 'pro_id' => $p->user_id, 'status' => 'held' ) );
	}
	return array( 'ok' => true, 'n' => $n );
}

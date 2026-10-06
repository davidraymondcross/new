<?php
/**
 * DreamScaper – Settings → DreamScaper Plans: switch billing on, edit the four plans (names,
 * prices, Stripe prices, "what's included" lists, every limit and feature), set the non-payment
 * timeline, and manage each contractor's subscription.
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

add_action( 'admin_menu', function () {
	add_options_page( 'DreamScaper Plans', 'DreamScaper Plans', 'manage_options', 'dreamscaper-plans', 'dreamscaper_plans_admin' );
}, 21 );

/** Save the plan settings. */
add_action( 'admin_post_dreamscaper_plans', function () {
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( 'Not allowed.' );
	}
	check_admin_referer( 'dreamscaper_plans' );
	$in  = isset( $_POST['ds'] ) ? wp_unslash( $_POST['ds'] ) : array(); // phpcs:ignore
	$old = get_option( 'dreamscaper_subs', array() );
	$old = is_array( $old ) ? $old : array();
	$on  = empty( $in['on'] ) ? 0 : 1;
	$num = function ( $k, $def, $min, $max ) use ( $in ) {
		return max( $min, min( $max, (int) ( isset( $in[ $k ] ) ? $in[ $k ] : $def ) ) );
	};
	$st  = isset( $in['stages'] ) && is_array( $in['stages'] ) ? $in['stages'] : array();
	$sd  = dreamscaper_dunning_defaults();
	$stages = array(
		'reminder'   => max( 1, min( 60, (int) ( isset( $st['reminder'] ) ? $st['reminder'] : $sd['reminder'] ) ) ),
		'restricted' => max( 1, min( 60, (int) ( isset( $st['restricted'] ) ? $st['restricted'] : $sd['restricted'] ) ) ),
		'readonly'   => max( 1, min( 60, (int) ( isset( $st['readonly'] ) ? $st['readonly'] : $sd['readonly'] ) ) ),
	);
	// keep the stages in order: reminder ≤ restricted ≤ read-only ≤ suspension
	$stages['restricted'] = max( $stages['restricted'], $stages['reminder'] );
	$stages['readonly']   = max( $stages['readonly'], $stages['restricted'] );
	$out = array(
		'on'               => $on,
		'trial_days'       => max( 0, min( 90, (int) ( isset( $in['trial_days'] ) ? $in['trial_days'] : 30 ) ) ),
		'trial_plan'       => isset( $in['trial_plan'] ) && isset( dreamscaper_plan_defaults()[ $in['trial_plan'] ] ) ? $in['trial_plan'] : 'pro',
		'trial_ai_credits' => $num( 'trial_ai_credits', 100, 0, 100000 ),
		'trial_plans'      => $num( 'trial_plans', 2, 0, 1000 ),
		'stages'           => $stages,
		'grace_days'       => max( $stages['readonly'] + 1, $num( 'grace_days', 14, 2, 90 ) ),
		'restrict_ai'      => empty( $in['restrict_ai'] ) ? 0 : 1,
		'restrict_plans'   => empty( $in['restrict_plans'] ) ? 0 : 1,
		'restrict_buy'     => empty( $in['restrict_buy'] ) ? 0 : 1,
		'restrict_uploads' => empty( $in['restrict_uploads'] ) ? 0 : 1,
		'restrict_auto_sms' => empty( $in['restrict_auto_sms'] ) ? 0 : 1,
		'big_upload_mb'    => $num( 'big_upload_mb', 10, 1, 500 ),
		'fair_plans'       => $num( 'fair_plans', 100, 0, 100000 ),
		'deletion_days'    => $num( 'deletion_days', 90, 30, 3650 ),
		'otp'              => empty( $in['otp'] ) ? 0 : 1,
		'card'             => 1,
		'retention_months' => max( 1, min( 120, (int) ( isset( $in['retention_months'] ) ? $in['retention_months'] : 12 ) ) ),
		'since'            => ! empty( $old['since'] ) ? (int) $old['since'] : ( $on ? time() : 0 ),
		'plans_v'          => 2,
		'plans'            => array(),
	);
	$cat = dreamscaper_feature_catalog();
	foreach ( dreamscaper_plan_defaults() as $k => $d ) {
		$x = isset( $in['plans'][ $k ] ) ? $in['plans'][ $k ] : array();
		$f = array();
		foreach ( $cat as $fk => $fd ) {
			if ( 'limit' === $fd[0] ) {
				$v       = isset( $x['f'][ $fk ] ) ? trim( (string) $x['f'][ $fk ] ) : (string) $d['f'][ $fk ];
				$f[ $fk ] = '' === $v || 'unlimited' === strtolower( $v ) ? -1 : max( -1, (int) $v );
			} else {
				$f[ $fk ] = empty( $x['f'][ $fk ] ) ? 0 : 1;
			}
		}
		$out['plans'][ $k ] = array(
			'name'        => sanitize_text_field( isset( $x['name'] ) && '' !== trim( $x['name'] ) ? $x['name'] : $d['name'] ),
			'tag'         => sanitize_text_field( isset( $x['tag'] ) ? $x['tag'] : $d['tag'] ),
			'month'       => max( 0, round( (float) ( isset( $x['month'] ) ? $x['month'] : $d['month'] ), 2 ) ),
			'year'        => max( 0, round( (float) ( isset( $x['year'] ) ? $x['year'] : $d['year'] ), 2 ) ),
			'price_month' => preg_replace( '/[^A-Za-z0-9_]/', '', isset( $x['price_month'] ) ? $x['price_month'] : '' ),
			'price_year'  => preg_replace( '/[^A-Za-z0-9_]/', '', isset( $x['price_year'] ) ? $x['price_year'] : '' ),
			'popular'     => isset( $in['popular'] ) && $k === $in['popular'] ? 1 : 0,
			'includes'    => sanitize_textarea_field( isset( $x['includes'] ) ? $x['includes'] : $d['includes'] ),
			'not'         => sanitize_textarea_field( isset( $x['not'] ) ? $x['not'] : $d['not'] ),
			'f'           => $f,
		);
	}
	update_option( 'dreamscaper_subs', $out );
	wp_safe_redirect( admin_url( 'options-general.php?page=dreamscaper-plans&done=saved' ) );
	exit;
} );

/** Create the Stripe products and prices from the amounts on this page (fills in the price IDs). */
add_action( 'admin_post_dreamscaper_plans_stripe', function () {
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( 'Not allowed.' );
	}
	check_admin_referer( 'dreamscaper_plans_stripe' );
	$o    = get_option( 'dreamscaper_subs', array() );
	$o    = is_array( $o ) ? $o : array();
	$cfg  = dreamscaper_subs_cfg();
	$errs = array();
	foreach ( $cfg['plans'] as $k => $pl ) {
		$prod = dreamscaper_stripe_x( 'POST', 'products', array( 'name' => 'DreamScaper ' . $pl['name'], 'description' => $pl['tag'], 'metadata[dreamscaper_plan]' => $k ) );
		if ( is_wp_error( $prod ) ) {
			$errs[] = $prod->get_error_message();
			break;
		}
		foreach ( array( 'month', 'year' ) as $b ) {
			if ( (float) $pl[ $b ] <= 0 ) {
				continue;
			}
			$pr = dreamscaper_stripe_x( 'POST', 'prices', array( 'product' => $prod['id'], 'currency' => 'usd', 'unit_amount' => (int) round( $pl[ $b ] * 100 ), 'recurring[interval]' => $b, 'nickname' => $pl['name'] . ' ' . ( 'month' === $b ? 'monthly' : 'yearly' ), 'metadata[dreamscaper_plan]' => $k ) );
			if ( is_wp_error( $pr ) ) {
				$errs[] = $pr->get_error_message();
				continue;
			}
			$o['plans'][ $k ]                 = isset( $o['plans'][ $k ] ) ? $o['plans'][ $k ] : $pl;
			$o['plans'][ $k ][ 'price_' . $b ] = $pr['id'];
		}
	}
	update_option( 'dreamscaper_subs', $o );
	wp_safe_redirect( admin_url( 'options-general.php?page=dreamscaper-plans&done=' . ( $errs ? 'stripe_err&msg=' . rawurlencode( implode( ' ', $errs ) ) : 'stripe' ) ) );
	exit;
} );

/** Owner actions on one contractor's subscription. Every action is logged with a reason. */
add_action( 'admin_post_dreamscaper_sub_admin', function () {
	global $wpdb;
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( 'Not allowed.' );
	}
	check_admin_referer( 'dreamscaper_sub_admin' );
	$pro  = isset( $_POST['pro'] ) ? (int) $_POST['pro'] : 0;
	$do   = isset( $_POST['do'] ) ? sanitize_key( $_POST['do'] ) : '';
	$why  = isset( $_POST['why'] ) ? sanitize_text_field( wp_unslash( $_POST['why'] ) ) : '';
	$plan = isset( $_POST['plan'] ) ? sanitize_key( $_POST['plan'] ) : '';
	$days = isset( $_POST['days'] ) ? max( 1, min( 90, (int) $_POST['days'] ) ) : 14;
	$s    = dreamscaper_sub_row( $pro );
	$cur  = $s ? $s->status : 'none';
	if ( ! dreamscaper_pro_row( $pro ) ) {
		wp_die( 'Contractor not found.' );
	}
	if ( in_array( $do, array( 'extend', 'second_trial', 'comp', 'grace', 'pause' ), true ) && '' === trim( $why ) ) {
		wp_safe_redirect( admin_url( 'options-general.php?page=dreamscaper-plans&done=need_reason' ) );
		exit;
	}
	switch ( $do ) {
		case 'comp':
			dreamscaper_sub_update( $pro, array( 'status' => 'comped', 'plan' => isset( dreamscaper_plans()[ $plan ] ) ? $plan : 'proplus' ), 'admin_comp', $why );
			break;
		case 'uncomp':
			dreamscaper_sub_update( $pro, array( 'status' => $s && $s->stripe_sub ? 'active' : 'none' ), 'admin_uncomp', $why );
			break;
		case 'pause':
			dreamscaper_sub_update( $pro, array( 'status' => 'paused' ), 'admin_pause', $why );
			break;
		case 'grace':
			// push the non-payment clock back (e.g. the contractor called about a bank problem)
			if ( $s && 'past_due' === $s->status && $s->past_due_at ) {
				$wpdb->update( dreamscaper_t( 'subs' ), array( 'past_due_at' => gmdate( 'Y-m-d H:i:s', strtotime( $s->past_due_at . ' UTC' ) + $days * DAY_IN_SECONDS ) ), array( 'pro_id' => $pro ) );
				dreamscaper_sub_event( $pro, 'admin_grace', 'past_due', 'past_due', ( $why ? $why : 'More time to pay' ) . ' (+' . $days . ' days)' );
				dreamscaper_sub_flush( $pro );
			}
			break;
		case 'unpause':
			dreamscaper_sub_update( $pro, array( 'status' => $s && $s->stripe_sub ? 'active' : 'trialing', 'trial_ends' => $s && $s->stripe_sub ? $s->trial_ends : gmdate( 'Y-m-d H:i:s', time() + $days * DAY_IN_SECONDS ) ), 'admin_unpause', $why );
			break;
		case 'extend':
			if ( $s && 'trialing' === $s->status ) {
				$new = gmdate( 'Y-m-d H:i:s', max( time(), strtotime( $s->trial_ends . ' UTC' ) ) + $days * DAY_IN_SECONDS );
				if ( $s->stripe_sub ) {
					dreamscaper_stripe_x( 'POST', 'subscriptions/' . rawurlencode( $s->stripe_sub ), array( 'trial_end' => strtotime( $new . ' UTC' ), 'proration_behavior' => 'none' ) );
				}
				dreamscaper_sub_update( $pro, array( 'trial_ends' => $new ), 'admin_extend', $why . ' (+' . $days . ' days)' );
			}
			break;
		case 'second_trial':
			dreamscaper_sub_update( $pro, array( 'status' => 'trialing', 'plan' => dreamscaper_subs_cfg()['trial_plan'], 'trial_ends' => gmdate( 'Y-m-d H:i:s', time() + $days * DAY_IN_SECONDS ) ), 'admin_second_trial', $why . ' (' . $days . ' days)' );
			break;
		case 'plan':
			if ( isset( dreamscaper_plans()[ $plan ] ) ) {
				dreamscaper_sub_update( $pro, array( 'plan' => $plan ), 'admin_plan', $why ? $why : 'Plan set by site owner' );
			}
			break;
	}
	unset( $cur );
	wp_safe_redirect( admin_url( 'options-general.php?page=dreamscaper-plans&done=' . $do . '#pro-' . $pro ) );
	exit;
} );

function dreamscaper_plans_admin() {
	global $wpdb;
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$cfg   = dreamscaper_subs_cfg();
	$cat   = dreamscaper_feature_catalog();
	$done  = isset( $_GET['done'] ) ? sanitize_key( $_GET['done'] ) : ''; // phpcs:ignore
	echo '<div class="wrap"><h1>DreamScaper Plans</h1>';
	if ( 'stripe_err' === $done ) {
		echo '<div class="notice notice-error"><p>Stripe said: ' . esc_html( isset( $_GET['msg'] ) ? wp_unslash( $_GET['msg'] ) : '' ) . '</p></div>'; // phpcs:ignore
	} elseif ( 'need_reason' === $done ) {
		echo '<div class="notice notice-error"><p>Please write a reason — every exception is recorded.</p></div>';
	} elseif ( $done ) {
		echo '<div class="notice notice-success is-dismissible"><p>Saved.</p></div>';
	}
	if ( ! dreamscaper_opt( 'stripe_secret' ) ) {
		echo '<div class="notice notice-warning"><p>Add your Stripe keys under <a href="' . esc_url( admin_url( 'options-general.php?page=dreamscaper' ) ) . '">Settings → DreamScaper → Selling extra AI credits</a> first. Until billing is on, every approved contractor has full access for free.</p></div>';
	}
	echo '<p style="max-width:900px">Contractors pay monthly or yearly for the Contractor Hub. New contractors get <b>one</b> free trial: they verify their phone (by text) and email, and add a card that isn’t charged until the trial ends. Every business that has had a trial is remembered (email, phone, card, Stripe customer, business name + town, address, license and account), so deleting an account, changing email or reinstalling the plugin doesn’t give anyone a second free trial. If a payment fails, access steps down in stages (below) — full access first, then the costly extras pause, then read-only, then the account is <b>suspended, never deleted</b>: they can view and export everything, and paying restores everything instantly and automatically. You are always on the top plan for free.</p>';
	echo '<h2>Stripe setup</h2><ol style="max-width:900px"><li>Fill in the prices below and save.</li><li>Click <b>Create these plans in Stripe</b> (or paste price IDs you made yourself).</li><li>In Stripe → Developers → Webhooks, on the endpoint <code>' . esc_html( rest_url( 'dreamscaper/v1/stripe' ) ) . '</code> add the events <code>customer.subscription.created</code>, <code>customer.subscription.updated</code>, <code>customer.subscription.deleted</code>, <code>invoice.paid</code> and <code>invoice.payment_failed</code> (keep <code>checkout.session.completed</code>).</li><li>In Stripe → Settings → Billing → Customer portal, turn on “Update payment methods”, “View invoices”, “Switch plans” and “Cancel subscriptions (at end of period)”.</li><li>In Stripe → Billing → Revenue recovery: turn on <b>Smart Retries</b> for <b>2 weeks</b>, set “If all retries for a payment fail” to <b>mark the subscription as unpaid</b> (so paying the invoice later restores the account), and turn <b>off</b> Stripe’s own failed-payment emails — DreamScaper sends the reminders below so contractors hear one consistent voice.</li><li>Tick <b>Turn on contractor billing</b> and save. Contractors approved before today get one grandfathered trial so nobody is cut off.</li></ol>';
	echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
	wp_nonce_field( 'dreamscaper_plans' );
	echo '<input type="hidden" name="action" value="dreamscaper_plans"><table class="form-table">';
	echo '<tr><th>Billing</th><td><label><input type="checkbox" name="ds[on]" value="1" ' . checked( $cfg['on'], 1, false ) . '> Turn on contractor billing</label>' . ( $cfg['since'] ? '<p class="description">On since ' . esc_html( wp_date( 'F j, Y', $cfg['since'] ) ) . '.</p>' : '' ) . '</td></tr>';
	echo '<tr><th>Free trial</th><td><input type="number" min="0" max="90" name="ds[trial_days]" value="' . esc_attr( $cfg['trial_days'] ) . '" class="small-text"> days on the <select name="ds[trial_plan]">';
	foreach ( $cfg['plans'] as $k => $pl ) {
		echo '<option value="' . esc_attr( $k ) . '" ' . selected( $cfg['trial_plan'], $k, false ) . '>' . esc_html( $pl['name'] ) . '</option>';
	}
	echo '</select> plan<br><label><input type="checkbox" name="ds[otp]" value="1" ' . checked( $cfg['otp'], 1, false ) . '> Require a phone number verified by text (needs Twilio)</label>' . ( dreamscaper_sms_ready() ? '' : ' <em>— Twilio isn’t set up, so this is skipped; email verification and the card still apply.</em>' ) . '</td></tr>';
	echo '<tr><th>Trial allowances</th><td><input type="number" min="0" name="ds[trial_ai_credits]" value="' . esc_attr( $cfg['trial_ai_credits'] ) . '" class="small-text"> AI credits and <input type="number" min="0" name="ds[trial_plans]" value="' . esc_attr( $cfg['trial_plans'] ) . '" class="small-text"> landscape plans during the trial <p class="description">Every feature of the trial plan is on; only these allowances are smaller, to protect AI costs. They rise to the plan’s full amounts when the paid plan starts.</p></td></tr>';
	$sd = $cfg['stages'];
	$dn = function ( $n, $v, $min = 1 ) {
		return '<input type="number" min="' . (int) $min . '" max="90" name="' . esc_attr( $n ) . '" value="' . esc_attr( $v ) . '" class="small-text">';
	};
	echo '<tr><th>When a payment fails</th><td><p class="description" style="margin-top:0">Days are counted from the first failed payment. Paying at any stage restores everything instantly.</p><ol style="margin:.5em 0 0 1.2em">'
		. '<li><b>Day 0 – notice:</b> full access, a quiet banner, one email (and a text if the contractor opted in to billing texts).</li>'
		. '<li><b>From day ' . $dn( 'ds[stages][reminder]', $sd['reminder'] ) . ' – reminder:</b> full access, a stronger banner, another email.</li>'
		. '<li><b>From day ' . $dn( 'ds[stages][restricted]', $sd['restricted'] ) . ' – restricted:</b> everything works except what costs you money: '
		. '<label><input type="checkbox" name="ds[restrict_ai]" value="1" ' . checked( $cfg['restrict_ai'], 1, false ) . '> AI (pictures, AI Quoter)</label> · '
		. '<label><input type="checkbox" name="ds[restrict_plans]" value="1" ' . checked( $cfg['restrict_plans'], 1, false ) . '> new landscape plans</label> · '
		. '<label><input type="checkbox" name="ds[restrict_buy]" value="1" ' . checked( $cfg['restrict_buy'], 1, false ) . '> buying credits / storage</label> · '
		. '<label><input type="checkbox" name="ds[restrict_uploads]" value="1" ' . checked( $cfg['restrict_uploads'], 1, false ) . '> uploads over</label> ' . $dn( 'ds[big_upload_mb]', $cfg['big_upload_mb'] ) . ' MB · '
		. '<label><input type="checkbox" name="ds[restrict_auto_sms]" value="1" ' . checked( $cfg['restrict_auto_sms'], 1, false ) . '> automatic follow-up texts (emails still go)</label>. Appointment reminders, receipts and invoices keep going to their customers.</li>'
		. '<li><b>From day ' . $dn( 'ds[stages][readonly]', $sd['readonly'] ) . ' – read-only:</b> view, export and pay only; hidden from homeowners; a final warning with the suspension date.</li>'
		. '<li><b>Day ' . $dn( 'ds[grace_days]', $cfg['grace_days'], 2 ) . ' – suspended:</b> “Suspended — Payment Required”. Nothing is deleted; reminders after 7, 30 and 60 days.</li>'
		. '<li><b>After ' . $dn( 'ds[deletion_days]', $cfg['deletion_days'], 30 ) . ' days unpaid:</b> flagged here as eligible for deletion under your retention policy. Nothing is deleted automatically.</li></ol></td></tr>';
	echo '<tr><th>Fair use</th><td>Alert me when an “unlimited” plan creates <input type="number" min="0" name="ds[fair_plans]" value="' . esc_attr( $cfg['fair_plans'] ) . '" class="small-text"> landscape plans in a month (0 = never). Nothing is blocked.</td></tr>';
	echo '<tr><th>Keep data after cancelling</th><td>at least <input type="number" min="1" max="120" name="ds[retention_months]" value="' . esc_attr( $cfg['retention_months'] ) . '" class="small-text"> months (shown to contractors; nothing is ever deleted automatically)</td></tr></table>';
	echo '<h2>Plans</h2><table class="widefat striped" style="max-width:1100px"><thead><tr><th style="width:260px"></th>';
	foreach ( $cfg['plans'] as $k => $pl ) {
		echo '<th>' . esc_html( $pl['name'] ) . '</th>';
	}
	echo '</tr></thead><tbody>';
	$row = function ( $label, $cb, $help = '' ) use ( $cfg ) {
		echo '<tr><th>' . esc_html( $label ) . ( $help ? '<br><small style="font-weight:normal;color:#646970">' . esc_html( $help ) . '</small>' : '' ) . '</th>';
		foreach ( $cfg['plans'] as $k => $pl ) {
			echo '<td>' . $cb( $k, $pl ) . '</td>'; // phpcs:ignore
		}
		echo '</tr>';
	};
	$in = function ( $name, $val, $w = '100%' ) {
		return '<input type="text" name="' . esc_attr( $name ) . '" value="' . esc_attr( $val ) . '" style="width:' . $w . '">';
	};
	$row( 'Name', function ( $k, $pl ) use ( $in ) { return $in( "ds[plans][$k][name]", $pl['name'] ); } );
	$row( 'Tagline', function ( $k, $pl ) use ( $in ) { return $in( "ds[plans][$k][tag]", $pl['tag'] ); } );
	$row( 'Most popular badge', function ( $k, $pl ) { return '<input type="radio" name="ds[popular]" value="' . esc_attr( $k ) . '" ' . checked( ! empty( $pl['popular'] ), true, false ) . '>'; } );
	$row( 'What’s included', function ( $k, $pl ) { return '<textarea name="ds[plans][' . esc_attr( $k ) . '][includes]" rows="8" style="width:100%">' . esc_textarea( $pl['includes'] ) . '</textarea>'; }, 'One line each, shown on the pricing cards.' );
	$row( 'Not included', function ( $k, $pl ) { return '<textarea name="ds[plans][' . esc_attr( $k ) . '][not]" rows="3" style="width:100%">' . esc_textarea( $pl['not'] ) . '</textarea>'; }, 'Optional. One line each.' );
	$row( 'Price per month ($)', function ( $k, $pl ) use ( $in ) { return $in( "ds[plans][$k][month]", $pl['month'], '90px' ); } );
	$row( 'Price per year ($)', function ( $k, $pl ) use ( $in ) { return $in( "ds[plans][$k][year]", $pl['year'], '90px' ); } );
	$row( 'Stripe price ID — monthly', function ( $k, $pl ) use ( $in ) { return $in( "ds[plans][$k][price_month]", $pl['price_month'] ); }, 'price_…' );
	$row( 'Stripe price ID — yearly', function ( $k, $pl ) use ( $in ) { return $in( "ds[plans][$k][price_year]", $pl['price_year'] ); } );
	foreach ( $cat as $fk => $fd ) {
		if ( 'limit' === $fd[0] ) {
			$row( $fd[1], function ( $k, $pl ) use ( $in, $fk ) { return $in( "ds[plans][$k][f][$fk]", $pl['f'][ $fk ] < 0 ? 'unlimited' : $pl['f'][ $fk ], '90px' ); }, $fd[2] . ' Use “unlimited” for no limit.' );
		} else {
			$row( $fd[1], function ( $k, $pl ) use ( $fk ) { return '<input type="checkbox" name="ds[plans][' . esc_attr( $k ) . '][f][' . esc_attr( $fk ) . ']" value="1" ' . checked( $pl['f'][ $fk ], 1, false ) . '>'; }, $fd[2] );
		}
	}
	echo '</tbody></table><p class="description">Changes apply to new subscriptions straight away. To change what existing subscribers pay, create a new Stripe price — Stripe keeps them on their current price until you move them.</p>';
	submit_button( 'Save plans' );
	echo '</form>';
	if ( dreamscaper_opt( 'stripe_secret' ) ) {
		echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
		wp_nonce_field( 'dreamscaper_plans_stripe' );
		echo '<input type="hidden" name="action" value="dreamscaper_plans_stripe">';
		submit_button( 'Create these plans in Stripe', 'secondary', 'submit', false, array( 'onclick' => "return confirm('Create a Stripe product and monthly + yearly prices for each plan, using the saved amounts?')" ) );
		echo '</form>';
	}

	// subscribers
	$S    = dreamscaper_t( 'subs' );
	$rows = $wpdb->get_results( 'SELECT p.user_id, p.business, p.contact, p.email, p.town, p.status pstatus, s.* FROM ' . dreamscaper_t( 'pros' ) . " p LEFT JOIN $S s ON s.pro_id=p.user_id WHERE p.status='approved' ORDER BY FIELD(s.status,'past_due','paused','trialing','active','comped','cancelled','none'), p.business LIMIT 500" );
	$mrr  = 0;
	$by   = array();
	foreach ( $rows as $r ) {
		$st         = $r->status ? ( 'paused' === $r->status ? 'suspended' : $r->status ) : ( dreamscaper_is_owner_pro( $r->user_id ) ? 'owner' : 'none' );
		$by[ $st ]  = isset( $by[ $st ] ) ? $by[ $st ] + 1 : 1;
		if ( in_array( $r->status, array( 'active', 'past_due' ), true ) && isset( $cfg['plans'][ $r->plan ] ) ) {
			$mrr += 'year' === $r->billing ? $cfg['plans'][ $r->plan ]['year'] / 12 : $cfg['plans'][ $r->plan ]['month'];
		}
	}
	$conv = (int) $wpdb->get_var( 'SELECT COUNT(DISTINCT pro_id) FROM ' . dreamscaper_t( 'sub_events' ) . " WHERE from_status='trialing' AND to_status='active'" );
	$tri  = (int) $wpdb->get_var( 'SELECT COUNT(*) FROM ' . dreamscaper_t( 'trials' ) );
	echo '<hr><h2>Contractors</h2><p><b>Monthly recurring revenue:</b> $' . esc_html( number_format( $mrr, 2 ) ) . ' &nbsp;·&nbsp; ';
	foreach ( $by as $k => $n ) {
		echo esc_html( ucfirst( str_replace( '_', ' ', $k ) ) . ': ' . $n ) . ' &nbsp;·&nbsp; ';
	}
	echo 'Trials ever: ' . (int) $tri . ' · converted to paid: ' . (int) $conv . '</p>';
	echo '<table class="widefat striped"><thead><tr><th>Business</th><th>Status</th><th>Plan</th><th>Trial / renews</th><th>Last payment</th><th>Notes</th><th>Owner actions (each needs a reason)</th></tr></thead><tbody>';
	foreach ( $rows as $r ) {
		$owner = dreamscaper_is_owner_pro( $r->user_id );
		$st    = $owner ? 'owner (free)' : ( 'paused' === $r->status ? 'suspended' : ( $r->status ? $r->status : 'none' ) );
		if ( 'past_due' === $r->status && $r->past_due_at ) {
			$st .= ' · ' . dreamscaper_sub_stage( (int) $r->user_id ) . ' (day ' . dreamscaper_sub_days_due( $r ) . ')';
		}
		$flags = $wpdb->get_col( $wpdb->prepare( 'SELECT note FROM ' . dreamscaper_t( 'sub_events' ) . " WHERE pro_id=%d AND kind IN ('trial_flag','trial_blocked','fair_use','deletion_eligible') ORDER BY id DESC LIMIT 3", $r->user_id ) );
		echo '<tr id="pro-' . (int) $r->user_id . '"><td><b>' . esc_html( $r->business ) . '</b><br><small>' . esc_html( $r->contact . ' · ' . $r->email . ' · ' . $r->town ) . '</small></td>';
		echo '<td>' . esc_html( $st ) . ( $r->failures ? '<br><small>' . (int) $r->failures . ' failed payment(s)</small>' : '' ) . '</td>';
		echo '<td>' . esc_html( $r->plan && isset( $cfg['plans'][ $r->plan ] ) ? $cfg['plans'][ $r->plan ]['name'] . ( $r->billing ? ' · ' . $r->billing . 'ly' : '' ) : '—' ) . '</td>';
		echo '<td>' . esc_html( 'trialing' === $r->status && $r->trial_ends ? 'Trial ends ' . wp_date( 'M j, Y', strtotime( $r->trial_ends . ' UTC' ) ) : ( $r->period_end ? ( $r->cancel_at ? 'Ends ' : 'Renews ' ) . wp_date( 'M j, Y', strtotime( $r->period_end . ' UTC' ) ) : '—' ) ) . '</td>';
		echo '<td>' . esc_html( $r->last_payment ? wp_date( 'M j, Y', strtotime( $r->last_payment . ' UTC' ) ) : '—' ) . '</td>';
		echo '<td><small>' . esc_html( implode( ' · ', $flags ) ) . '</small></td><td>';
		if ( ! $owner ) {
			echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" style="display:flex;gap:4px;flex-wrap:wrap;align-items:center">';
			wp_nonce_field( 'dreamscaper_sub_admin' );
			echo '<input type="hidden" name="action" value="dreamscaper_sub_admin"><input type="hidden" name="pro" value="' . (int) $r->user_id . '">';
			echo '<select name="do"><option value="extend">Extend trial</option><option value="comp">Give free access (comp)</option><option value="uncomp">End free access</option><option value="grace">Give more time to pay (days)</option><option value="pause">Suspend now</option><option value="unpause">Restore</option><option value="second_trial">Grant a second trial (exception)</option><option value="plan">Set plan</option></select>';
			echo '<select name="plan">';
			foreach ( $cfg['plans'] as $k => $pl ) {
				echo '<option value="' . esc_attr( $k ) . '">' . esc_html( $pl['name'] ) . '</option>';
			}
			echo '</select><input type="number" name="days" value="14" min="1" max="90" style="width:60px" title="days"><input type="text" name="why" placeholder="Reason" style="width:150px">';
			submit_button( 'Apply', 'small', 'submit', false );
			echo '</form>';
		}
		echo '</td></tr>';
	}
	echo '</tbody></table></div>';
}

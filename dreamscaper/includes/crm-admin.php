<?php
/**
 * DreamScaper – Settings → DreamScaper Contractors: approve, reject or suspend contractor
 * applications and see each contractor's activity.
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

add_action( 'admin_menu', function () {
	global $wpdb;
	$pending = 0;
	if ( (int) get_option( 'dreamscaper_crm_db' ) ) {
		$pending = (int) $wpdb->get_var( 'SELECT COUNT(*) FROM ' . dreamscaper_t( 'pros' ) . " WHERE status='pending'" );
	}
	add_options_page( 'DreamScaper Contractors', 'DreamScaper Contractors' . ( $pending ? ' <span class="awaiting-mod">' . $pending . '</span>' : '' ), 'manage_options', 'dreamscaper-contractors', 'dreamscaper_contractors_admin' );
}, 20 );

add_action( 'admin_post_dreamscaper_pro', function () {
	global $wpdb;
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( 'Not allowed.' );
	}
	check_admin_referer( 'dreamscaper_pro' );
	$uid = isset( $_POST['user'] ) ? (int) $_POST['user'] : 0;
	$do  = isset( $_POST['do'] ) ? sanitize_key( $_POST['do'] ) : '';
	$map = array( 'approve' => 'approved', 'reject' => 'rejected', 'suspend' => 'suspended' );
	$p   = dreamscaper_pro_row( $uid );
	if ( $p && isset( $map[ $do ] ) ) {
		$wpdb->update( dreamscaper_t( 'pros' ), array( 'status' => $map[ $do ] ), array( 'user_id' => $uid ) );
		$to = is_email( $p->email ) ? $p->email : ( get_userdata( $uid ) ? get_userdata( $uid )->user_email : '' );
		if ( $to && 'approve' === $do ) {
			wp_mail( $to, 'You’re approved as a DreamScaper contractor', "Hi {$p->contact},\n\nGood news — {$p->business} is approved. Open DreamScaper and tap Contractor Hub to add customers, turn Dreamscapes into quotes, send them for signature, schedule jobs and get paid.\n\n" . dreamscaper_app_url( array( 'ds_hub' => 1 ) ) . "\n\nHomeowners nearby can now find you under Find a Local Contractor." );
		} elseif ( $to && 'reject' === $do ) {
			wp_mail( $to, 'Your DreamScaper contractor application', "Hi {$p->contact},\n\nThanks for applying. We aren’t able to approve {$p->business} right now. Reply to this email if you have questions." );
		}
		if ( function_exists( 'dreamscaper_crm_tell_user' ) ) {
			dreamscaper_crm_tell_user( $uid, 'approve' === $do ? 'Your contractor account is approved! Open the Contractor Hub.' : 'Your contractor account status changed: ' . $map[ $do ] . '.' );
		}
	}
	wp_safe_redirect( admin_url( 'options-general.php?page=dreamscaper-contractors&done=' . $do ) );
	exit;
} );

function dreamscaper_contractors_admin() {
	global $wpdb;
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$rows = $wpdb->get_results( 'SELECT * FROM ' . dreamscaper_t( 'pros' ) . " ORDER BY FIELD(status,'pending','approved','suspended','rejected'), created DESC LIMIT 300" );
	$Q    = dreamscaper_t( 'quotes' );
	echo '<div class="wrap"><h1>DreamScaper Contractors</h1>';
	if ( ! dreamscaper_crm_on() ) {
		echo '<div class="notice notice-warning"><p>The contractor tools are switched off. Turn them on under <a href="' . esc_url( admin_url( 'options-general.php?page=dreamscaper' ) ) . '">Settings → DreamScaper → Contractors</a>.</p></div>';
	}
	if ( isset( $_GET['done'] ) ) { // phpcs:ignore
		echo '<div class="notice notice-success is-dismissible"><p>Saved.</p></div>';
	}
	echo '<p>Any contractor can apply from DreamScaper → My Account → Become a DreamScaper contractor. Approved contractors appear under <em>Find a Local Contractor</em> and get the Contractor Hub. Check their license and insurance before approving. You (the site owner) are always approved as ' . esc_html( dreamscaper_opt( 'brand' ) ) . '.</p>';
	if ( ! $rows ) {
		echo '<p><em>No applications yet.</em></p></div>';
		return;
	}
	echo '<table class="widefat striped"><thead><tr><th>Business</th><th>Contact</th><th>Area</th><th>License / insurance</th><th>Activity</th><th>Status</th><th></th></tr></thead><tbody>';
	foreach ( $rows as $p ) {
		$sent   = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM $Q WHERE pro_id=%d AND sent_at IS NOT NULL", $p->user_id ) );
		$signed = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM $Q WHERE pro_id=%d AND status='signed'", $p->user_id ) );
		echo '<tr><td>' . ( $p->logo ? '<img src="' . esc_url( $p->logo ) . '" style="max-height:32px;vertical-align:middle;margin-right:6px">' : '' ) . '<b>' . esc_html( $p->business ) . '</b>' . ( $p->website ? '<br><a href="' . esc_url( $p->website ) . '" target="_blank" rel="noopener">' . esc_html( $p->website ) . '</a>' : '' ) . ( $p->bio ? '<br><small>' . esc_html( wp_trim_words( $p->bio, 25 ) ) . '</small>' : '' ) . '</td>';
		echo '<td>' . esc_html( $p->contact ) . '<br>' . esc_html( $p->phone ) . '<br>' . esc_html( $p->email ) . '</td>';
		echo '<td>' . esc_html( trim( $p->town . ', ' . $p->state, ', ' ) ) . '<br><small>' . (int) $p->radius . ' mi · ' . esc_html( trim( str_replace( ',', ', ', $p->services ), ', ' ) ) . '</small></td>';
		echo '<td>' . ( $p->license ? esc_html( $p->license ) : '<em>none given</em>' ) . '<br>' . ( $p->insured ? 'Insured ✔' : '<em>not insured</em>' ) . ( $p->years ? '<br>' . (int) $p->years . ' yrs in business' : '' ) . '</td>';
		echo '<td>' . $sent . ' quotes sent<br>' . $signed . ' signed · ' . (int) $p->jobs_done . ' done<br>' . ( $p->rating_n ? round( $p->rating_sum / $p->rating_n, 1 ) . '★ (' . (int) $p->rating_n . ')' : 'no reviews' ) . '</td>';
		echo '<td><b>' . esc_html( ucfirst( $p->status ) ) . '</b><br><small>' . esc_html( wp_date( 'M j, Y', strtotime( $p->created . ' UTC' ) ) ) . '</small></td><td>';
		foreach ( array( 'approve' => 'Approve', 'suspend' => 'Suspend', 'reject' => 'Reject' ) as $do => $label ) {
			if ( ( 'approve' === $do && 'approved' === $p->status ) || ( 'suspend' === $do && 'approved' !== $p->status ) || ( 'reject' === $do && 'rejected' === $p->status ) || user_can( $p->user_id, 'manage_options' ) ) {
				continue;
			}
			echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" style="display:inline-block;margin:2px">';
			wp_nonce_field( 'dreamscaper_pro' );
			echo '<input type="hidden" name="action" value="dreamscaper_pro"><input type="hidden" name="user" value="' . (int) $p->user_id . '"><input type="hidden" name="do" value="' . esc_attr( $do ) . '"><button class="button' . ( 'approve' === $do ? ' button-primary' : '' ) . '">' . esc_html( $label ) . '</button></form>';
		}
		echo '</td></tr>';
	}
	echo '</tbody></table></div>';
}

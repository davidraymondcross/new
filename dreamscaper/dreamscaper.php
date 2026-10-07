<?php
/**
 * Plugin Name: DreamScaper
 * Description: A fun landscape design studio for your visitors. Customers photograph their yard (or use Connecticut aerial imagery), add real plants and garden features, paint mulch and stone, magic-erase what they don't want, watch plants grow year by year, and save named designs. Customer accounts (email, Google, Facebook) keep designs online across devices and unlock Dreamscape AI (FLUX.2 [klein]) plus AI Erase, Smart Select, Make it real, Season & light and plant/weed identification. Share to social media and print. Contractor CRM: Design → Quote estimating, e-signature, follow-ups, scheduling, job costing and invoices. Shortcodes: [dreamscaper], [dreamscaper_quote]
 * Version: 2.7.3
 * Author: David's Landscaping
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * License: GPLv2 or later
 * Text Domain: dreamscaper
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'DREAMSCAPER_VERSION', '2.7.3' );
define( 'DREAMSCAPER_URL', plugin_dir_url( __FILE__ ) );
define( 'DREAMSCAPER_OPT', 'dreamscaper_settings' );

/* -------------------------------------------------------------------------
 * Settings
 * ---------------------------------------------------------------------- */

function dreamscaper_defaults() {
	return array(
		'brand'              => "David's Landscaping",
		'short_brand'        => 'David',
		'site'               => 'getmylandscaped.com',
		'maps_key'           => '',
		'share'              => 1,
		'notify_email'       => 'careformygrass@gmail.com',
		'notify_signup'      => 1,
		'cloud_mb'           => 300,
		'google_id'          => '',
		'google_secret'      => '',
		'facebook_id'        => '',
		'facebook_secret'    => '',
		'bfl_key'            => '',
		'bfl_model'          => 'flux-2-klein-4b',
		'fal_key'            => '',
		'vision_model'       => 'google/gemini-2.5-flash',
		'plantnet_key'       => '',
		'ai_daily'           => 10,
		'ai_lead_email'      => 1,
		'ai_owner_unlimited' => 1,
		'shop_on'            => 1,
		'stripe_secret'      => '',
		'stripe_webhook'     => '',
		'shop_packs'         => "Starter | 15 | 2.99\nPopular | 40 | 6.99\nPro | 100 | 14.99",
		'shop_each'          => 0.25,
		'shop_min'           => 5,
		'shop_notify'        => 1,
		'storage_on'         => 1,
		'community_on'       => 1,
		'community_email'    => 1,
		'community_ai_check' => 1,
		'community_hide_at'  => 3,
		'community_notify_admin' => 1,
		'pts_signin'         => 5,
		'pts_first_design'   => 50,
		'pts_design'         => 10,
		'pts_post'           => 25,
		'pts_like'           => 2,
		'pts_comment'        => 3,
		'pts_help'           => 10,
		'pts_plantid_first'  => 50,
		'pts_plantid'        => 5,
		'pts_share'          => 10,
		'pts_profile'        => 20,
		'pts_first_ai'       => 20,
		'pts_rating'         => 3,
		'pts_follow'         => 1,
		'redeem_credit_pts'  => 100,
		'redeem_storage_pts' => 500,
		'redeem_storage_mb'  => 250,
		'storage_packs'      => "Plus 500 MB | 500 | 1.99\nExtra 2 GB | 2048 | 4.99\nPro 5 GB | 5120 | 9.99",
		'crm_on'             => 1,
		'crm_auto_approve'   => 0,
		'twilio_sid'         => '',
		'twilio_token'       => '',
		'twilio_from'        => '',
		'twilio_msid'        => '',
		'home_region'        => 'Connecticut', // plant advice for visitors who haven't said where they are
		'connect_fee_pct'    => 0, // replaced by the per-method processing rates below (kept so old settings still load)
		// what a contractor pays per customer payment (the site's Stripe fees come out of this)
		'fee_card_pct'       => 3.5,
		'fee_card_fixed'     => 0.30,
		'fee_ach_pct'        => 1.5,
		'fee_instant_pct'    => 2.5,
		'pay_ach'            => 1,
		'pay_instant'        => 0,
		// door-to-door map imagery (XYZ tile URL); blank = OpenStreetMap (fine for light use)
		'map_tiles'          => '',
		'map_tiles_attr'     => '',
		'map_tiles_max'      => 20,
	);
}

function dreamscaper_opt( $key ) {
	$o = wp_parse_args( get_option( DREAMSCAPER_OPT, array() ), dreamscaper_defaults() );
	return isset( $o[ $key ] ) ? $o[ $key ] : '';
}

require_once __DIR__ . '/includes/accounts.php';
require_once __DIR__ . '/includes/terms.php';
require_once __DIR__ . '/includes/cloud.php';
require_once __DIR__ . '/includes/ai.php';
require_once __DIR__ . '/includes/ai-tools.php';
require_once __DIR__ . '/includes/billing.php';
require_once __DIR__ . '/includes/community.php';
require_once __DIR__ . '/includes/community-admin.php';
require_once __DIR__ . '/includes/crm.php';

add_action( 'admin_menu', function () {
	add_options_page( 'DreamScaper', 'DreamScaper', 'manage_options', 'dreamscaper', 'dreamscaper_settings_page' );
	add_options_page( 'DreamScaper Community', 'DreamScaper Community', 'manage_options', 'dreamscaper-community', 'dreamscaper_community_admin' );
} );

add_action( 'admin_init', function () {
	register_setting( 'dreamscaper', DREAMSCAPER_OPT, array( 'sanitize_callback' => 'dreamscaper_sanitize' ) );
} );

add_filter( 'plugin_action_links_' . plugin_basename( __FILE__ ), function ( $links ) {
	array_unshift( $links, '<a href="' . esc_url( admin_url( 'options-general.php?page=dreamscaper' ) ) . '">Settings</a>' );
	return $links;
} );

function dreamscaper_sanitize( $in ) {
	$d   = dreamscaper_defaults();
	$old = wp_parse_args( get_option( DREAMSCAPER_OPT, array() ), $d );
	$txt = function ( $k ) use ( $in, $d ) {
		return sanitize_text_field( isset( $in[ $k ] ) ? $in[ $k ] : $d[ $k ] );
	};
	// Secret fields: keep the saved value when the box is left as dots.
	$secret = function ( $k ) use ( $in, $old ) {
		$v = isset( $in[ $k ] ) ? trim( sanitize_text_field( $in[ $k ] ) ) : '';
		return ( '' === $v || preg_match( '/^•+$/u', $v ) ) ? ( isset( $in[ $k . '_clear' ] ) ? '' : $old[ $k ] ) : $v;
	};
	$out = array(
		'brand'              => $txt( 'brand' ),
		'short_brand'        => $txt( 'short_brand' ),
		'site'               => $txt( 'site' ),
		'maps_key'           => $secret( 'maps_key' ),
		'share'              => empty( $in['share'] ) ? 0 : 1,
		'notify_email'       => sanitize_email( isset( $in['notify_email'] ) ? $in['notify_email'] : $d['notify_email'] ),
		'notify_signup'      => empty( $in['notify_signup'] ) ? 0 : 1,
		'cloud_mb'           => max( 20, min( 5000, (int) ( isset( $in['cloud_mb'] ) ? $in['cloud_mb'] : 300 ) ) ),
		'google_id'          => $txt( 'google_id' ),
		'google_secret'      => $secret( 'google_secret' ),
		'facebook_id'        => $txt( 'facebook_id' ),
		'facebook_secret'    => $secret( 'facebook_secret' ),
		'bfl_key'            => $secret( 'bfl_key' ),
		'bfl_model'          => preg_replace( '/[^a-z0-9.\-]/', '', strtolower( $txt( 'bfl_model' ) ) ) ? preg_replace( '/[^a-z0-9.\-]/', '', strtolower( $txt( 'bfl_model' ) ) ) : 'flux-2-klein-4b',
		'fal_key'            => $secret( 'fal_key' ),
		'vision_model'       => $txt( 'vision_model' ),
		'plantnet_key'       => $secret( 'plantnet_key' ),
		'ai_daily'           => max( 0, min( 500, (int) ( isset( $in['ai_daily'] ) ? $in['ai_daily'] : 10 ) ) ),
		'ai_lead_email'      => empty( $in['ai_lead_email'] ) ? 0 : 1,
		'ai_owner_unlimited' => empty( $in['ai_owner_unlimited'] ) ? 0 : 1,
		'shop_on'            => empty( $in['shop_on'] ) ? 0 : 1,
		'stripe_secret'      => $secret( 'stripe_secret' ),
		'stripe_webhook'     => $secret( 'stripe_webhook' ),
		'shop_packs'         => sanitize_textarea_field( isset( $in['shop_packs'] ) ? $in['shop_packs'] : $d['shop_packs'] ),
		'shop_each'          => max( 0, round( (float) ( isset( $in['shop_each'] ) ? $in['shop_each'] : $d['shop_each'] ), 2 ) ),
		'shop_min'           => max( 1, (int) ( isset( $in['shop_min'] ) ? $in['shop_min'] : 5 ) ),
		'shop_notify'        => empty( $in['shop_notify'] ) ? 0 : 1,
		'storage_on'         => empty( $in['storage_on'] ) ? 0 : 1,
		'community_on'       => empty( $in['community_on'] ) ? 0 : 1,
		'community_email'    => empty( $in['community_email'] ) ? 0 : 1,
		'community_ai_check' => empty( $in['community_ai_check'] ) ? 0 : 1,
		'community_notify_admin' => empty( $in['community_notify_admin'] ) ? 0 : 1,
		'community_hide_at'  => max( 1, min( 20, (int) ( isset( $in['community_hide_at'] ) ? $in['community_hide_at'] : 3 ) ) ),
		'storage_packs'      => sanitize_textarea_field( isset( $in['storage_packs'] ) ? $in['storage_packs'] : $d['storage_packs'] ),
		'crm_on'             => empty( $in['crm_on'] ) ? 0 : 1,
		'crm_auto_approve'   => empty( $in['crm_auto_approve'] ) ? 0 : 1,
		'twilio_sid'         => preg_replace( '/[^A-Za-z0-9]/', '', $txt( 'twilio_sid' ) ),
		'twilio_token'       => $secret( 'twilio_token' ),
		'twilio_from'        => $txt( 'twilio_from' ),
		'twilio_msid'        => preg_replace( '/[^A-Za-z0-9]/', '', $txt( 'twilio_msid' ) ),
		'home_region'        => sanitize_text_field( isset( $in['home_region'] ) ? $in['home_region'] : $d['home_region'] ),
		'connect_fee_pct'    => max( 0, min( 20, round( (float) ( isset( $in['connect_fee_pct'] ) ? $in['connect_fee_pct'] : 0 ), 2 ) ) ),
		'fee_card_pct'       => max( 0, min( 15, round( (float) ( isset( $in['fee_card_pct'] ) ? $in['fee_card_pct'] : $d['fee_card_pct'] ), 3 ) ) ),
		'fee_card_fixed'     => max( 0, min( 5, round( (float) ( isset( $in['fee_card_fixed'] ) ? $in['fee_card_fixed'] : $d['fee_card_fixed'] ), 2 ) ) ),
		'fee_ach_pct'        => max( 0, min( 15, round( (float) ( isset( $in['fee_ach_pct'] ) ? $in['fee_ach_pct'] : $d['fee_ach_pct'] ), 3 ) ) ),
		'fee_instant_pct'    => max( 0, min( 15, round( (float) ( isset( $in['fee_instant_pct'] ) ? $in['fee_instant_pct'] : $d['fee_instant_pct'] ), 3 ) ) ),
		'pay_ach'            => empty( $in['pay_ach'] ) ? 0 : 1,
		'pay_instant'        => empty( $in['pay_instant'] ) ? 0 : 1,
		'map_tiles'          => preg_match( '#^https://[^\s]+\{z\}[^\s]*\{x\}[^\s]*\{y\}#', isset( $in['map_tiles'] ) ? trim( $in['map_tiles'] ) : '' ) ? esc_url_raw( trim( $in['map_tiles'] ), array( 'https' ) ) : '',
		'map_tiles_attr'     => sanitize_text_field( isset( $in['map_tiles_attr'] ) ? $in['map_tiles_attr'] : '' ),
		'map_tiles_max'      => max( 15, min( 22, (int) ( isset( $in['map_tiles_max'] ) ? $in['map_tiles_max'] : 20 ) ) ),
	);
	foreach ( $d as $k => $v ) {
		if ( preg_match( '/^(pts_|redeem_)/', $k ) ) {
			$out[ $k ] = max( 0, (int) ( isset( $in[ $k ] ) ? $in[ $k ] : $v ) );
		}
	}
	return $out;
}

function dreamscaper_settings_page() {
	$o   = wp_parse_args( get_option( DREAMSCAPER_OPT, array() ), dreamscaper_defaults() );
	$n   = DREAMSCAPER_OPT;
	$row = function ( $key, $label, $desc = '', $type = 'text' ) use ( $o, $n ) {
		$val = $o[ $key ];
		if ( 'secret' === $type ) {
			$val  = $val ? str_repeat( '•', 12 ) : '';
			$type = 'password';
		}
		echo '<tr><th><label for="ds_' . esc_attr( $key ) . '">' . esc_html( $label ) . '</label></th><td><input class="regular-text" type="' . esc_attr( $type ) . '"' . ( 'number' === $type ? ' step="any" min="0"' : '' ) . ' autocomplete="off" id="ds_' . esc_attr( $key ) . '" name="' . esc_attr( $n . '[' . $key . ']' ) . '" value="' . esc_attr( $val ) . '">';
		if ( $desc ) {
			echo '<p class="description">' . wp_kses_post( $desc ) . '</p>';
		}
		echo '</td></tr>';
	};
	$check = function ( $key, $label ) use ( $o, $n ) {
		echo '<label><input type="checkbox" name="' . esc_attr( $n . '[' . $key . ']' ) . '" value="1" ' . checked( $o[ $key ], 1, false ) . '> ' . esc_html( $label ) . '</label><br>';
	};
	$redirect = function ( $p ) {
		return '<code>' . esc_html( dreamscaper_oauth_redirect_uri( $p ) ) . '</code>';
	};
	?>
	<div class="wrap">
		<h1>DreamScaper</h1>
		<p>Add <code>[dreamscaper]</code> to any page to show the launcher. Any link to <code>#dreamscaper</code> (or any element with the attribute <code>data-dreamscaper-open</code>) also opens it.</p>
		<form method="post" action="options.php">
			<?php settings_fields( 'dreamscaper' ); ?>
			<h2>Basics</h2>
			<table class="form-table">
				<?php
				$row( 'brand', 'Business name' );
				$row( 'home_region', 'Home region (for plant advice)', 'Used for visitors who haven’t told us their state (e.g. “Connecticut”). Everyone else gets advice for their own state — DreamScaper works anywhere in the US.' );
				$row( 'short_brand', 'Short name (for “Send to …” button)' );
				$row( 'site', 'Website shown on saved images' );
				$row( 'notify_email', 'Send designs and leads to', '', 'email' );
				?>
				<tr><th>Emails to you</th><td>
					<?php
					$check( 'share', 'Let customers send their finished design to you (“Send to David”)' );
					$check( 'ai_lead_email', 'Email me every Dreamscape AI design (before/after + customer details)' );
					$check( 'notify_signup', 'Email me when someone creates an account' );
					?>
				</td></tr>
				<?php $row( 'maps_key', 'Google Maps API key (optional)', 'Turns on address autocomplete powered by Google (enable <em>Places API (New)</em>) and “Explore in 3D” (enable <em>Maps JavaScript API</em>). Restrict the key to your website. Without a key, addresses autocomplete from OpenStreetMap.', 'secret' ); ?>
			</table>

			<h2>Customer accounts</h2>
			<p>Anyone can design without an account (saved on their device). Signing in saves Dreamscapes online so customers see them on any device, and unlocks the AI features. Customer accounts are normal WordPress <em>Subscriber</em> accounts (Users menu); they never see wp-admin.</p>
			<table class="form-table">
				<?php $row( 'cloud_mb', 'Online storage per customer (MB)', 'Photos are compressed; a typical Dreamscape uses 1–4 MB.', 'number' ); ?>
			</table>
			<h3>Sign in with Google</h3>
			<ol style="max-width:820px">
				<li>Go to <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">Google Cloud → APIs &amp; Services → Credentials</a> (create a project if asked).</li>
				<li>“OAuth consent screen”: choose <em>External</em>, app name “<?php echo esc_html( $o['brand'] ); ?>”, your email, and your privacy policy URL. Publish the app.</li>
				<li>“Create credentials → OAuth client ID → Web application”. Under <em>Authorized redirect URIs</em> add <?php echo $redirect( 'google' ); // phpcs:ignore ?></li>
				<li>Paste the Client ID and Client secret below.</li>
			</ol>
			<table class="form-table">
				<?php
				$row( 'google_id', 'Google Client ID' );
				$row( 'google_secret', 'Google Client secret', '', 'secret' );
				?>
			</table>
			<h3>Sign in with Facebook</h3>
			<ol style="max-width:820px">
				<li>Go to <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener">Meta for Developers → My Apps → Create app</a>, use case “Authenticate and request data from users with Facebook Login”.</li>
				<li>Facebook Login → Settings: add <?php echo $redirect( 'facebook' ); // phpcs:ignore ?> to <em>Valid OAuth Redirect URIs</em>.</li>
				<li>App settings → Basic: add your privacy policy URL and a data-deletion instructions URL (your privacy page can say customers can delete their account in DreamScaper → My account → Delete account). Switch the app to <em>Live</em>.</li>
				<li>Paste the App ID and App secret below.</li>
			</ol>
			<table class="form-table">
				<?php
				$row( 'facebook_id', 'Facebook App ID' );
				$row( 'facebook_secret', 'Facebook App secret', '', 'secret' );
				?>
			</table>

			<h2>AI</h2>
			<p>AI features only work for signed-in customers. Signed-out visitors see them greyed out with a “Sign in to use AI” prompt.</p>
			<table class="form-table">
				<?php
				$row( 'bfl_key', 'Black Forest Labs API key', 'Powers Dreamscape AI and the AI Erase, Make it real and Season &amp; Light tools. Get a key at <a href="https://dashboard.bfl.ai" target="_blank" rel="noopener">dashboard.bfl.ai</a> and add credits. FLUX.2 [klein] 4B costs about $0.014 per image.', 'secret' );
				$row( 'bfl_model', 'BFL model', 'Leave as <code>flux-2-klein-4b</code>.' );
				$row( 'ai_daily', 'AI image generations per customer per day', 'Every Dreamscape AI design, tweak and AI-tool edit uses one. Smart Select and Identify are free.', 'number' );
				?>
				<tr><th>Your account</th><td><?php $check( 'ai_owner_unlimited', 'No daily limit for site administrators (for testing)' ); ?></td></tr>
				<?php
				$row( 'fal_key', 'fal.ai API key', 'Powers AI Smart Select (Meta SAM 3, about $0.005 each) and identifying garden items and materials. Get one at <a href="https://fal.ai/dashboard/keys" target="_blank" rel="noopener">fal.ai/dashboard/keys</a>.', 'secret' );
				$row( 'vision_model', 'Vision model (fal any-llm)', 'Default <code>google/gemini-2.5-flash</code>.' );
				$row( 'plantnet_key', 'Pl@ntNet API key', 'Plant and weed identification. Free for up to 500 identifications a day: create an account at <a href="https://my.plantnet.org" target="_blank" rel="noopener">my.plantnet.org</a>, then copy your API key.', 'secret' );
				?>
			</table>

			<h2>Selling extra AI credits</h2>
			<p>Customers get the free daily credits above. When they run out, they can buy more with a card, Apple Pay or Google Pay on Stripe’s secure checkout page. Purchased credits never expire and are used after the free ones. Each AI image costs you about $0.014, so the default prices leave a healthy margin after Stripe’s fee (2.9% + 30¢).</p>
			<ol style="max-width:820px">
				<li>Create a free account at <a href="https://dashboard.stripe.com/register" target="_blank" rel="noopener">stripe.com</a> and finish the business details so you can accept payments.</li>
				<li>Developers → API keys: copy the <em>Secret key</em> (starts with <code>sk_live_</code>; use <code>sk_test_</code> to test) into the box below.</li>
				<li>Developers → Webhooks → Add endpoint: URL <code><?php echo esc_html( rest_url( 'dreamscaper/v1/stripe' ) ); ?></code>, event <code>checkout.session.completed</code>. Copy the <em>Signing secret</em> (<code>whsec_…</code>) below. (Credits are also confirmed when the customer returns, so a missed webhook never loses a purchase.)</li>
			</ol>
			<table class="form-table">
				<tr><th>Store</th><td><?php $check( 'shop_on', 'Let customers buy extra AI credits' ); $check( 'shop_notify', 'Email me about each purchase' ); ?></td></tr>
				<?php
				$row( 'stripe_secret', 'Stripe secret key', '', 'secret' );
				$row( 'stripe_webhook', 'Stripe webhook signing secret', '', 'secret' );
				?>
				<tr><th><label for="ds_packs">Credit packs</label></th><td><textarea class="large-text code" rows="4" id="ds_packs" name="<?php echo esc_attr( $n ); ?>[shop_packs]"><?php echo esc_textarea( $o['shop_packs'] ); ?></textarea>
					<p class="description">One pack per line: <code>Name | credits | price in dollars</code>. Up to 4 packs look best.</p></td></tr>
				<?php
				$row( 'shop_each', 'Price per single credit ($)', 'For customers who want a custom amount. Set 0 to only sell packs.', 'number' );
				$row( 'shop_min', 'Minimum custom purchase (credits)', '', 'number' );
				?>
			</table>

			<h2>Community (Dreamscape Browser)</h2>
			<p>Members can post finished designs and “ask for ideas” photos, like, rate, comment, follow, friend and message each other, and earn points and badges. Posts go live immediately; anything reported by several members is hidden until you review it under <a href="<?php echo esc_url( admin_url( 'options-general.php?page=dreamscaper-community' ) ); ?>">Settings → DreamScaper Community</a>.</p>
			<table class="form-table">
				<tr><th>Community</th><td><?php $check( 'community_on', 'Turn on the community, points and rewards' ); $check( 'community_email', 'Email members about new messages and comments (they can turn this off)' ); $check( 'community_ai_check', 'Check posted pictures with AI before they go live (uses your fal.ai key, about $0.001 each)' ); $check( 'community_notify_admin', 'Email me about every new community post' ); ?></td></tr>
				<?php $row( 'community_hide_at', 'Hide a post after this many reports', 'It stays hidden until you review it.', 'number' ); ?>
			</table>
			<h3>Points</h3>
			<table class="form-table">
				<?php
				foreach ( array(
					'pts_signin' => 'Daily visit (once a day)', 'pts_first_design' => 'First Dreamscape (once)', 'pts_design' => 'Each new Dreamscape (up to 3 a day)', 'pts_post' => 'Sharing a design to the community (up to 3 a day)',
					'pts_like' => 'Each like received (up to 25 a day)', 'pts_comment' => 'Each comment (up to 10 a day)', 'pts_help' => 'Answering an “ask for ideas” post (up to 5 a day)', 'pts_plantid_first' => 'First Plant ID (once)',
					'pts_plantid' => 'Each Plant ID (up to 5 a day)', 'pts_share' => 'Sharing to social media (up to 3 a day)', 'pts_profile' => 'Adding a profile photo and bio (once)', 'pts_first_ai' => 'First AI design (once)',
					'pts_rating' => 'Each 4–5 star rating received', 'pts_follow' => 'Each new follower',
				) as $k => $label ) {
					$row( $k, $label, '', 'number' );
				}
				?>
			</table>
			<h3>Rewards</h3>
			<table class="form-table">
				<?php
				$row( 'redeem_credit_pts', 'Points for 1 AI credit', 'Each AI image costs you about $0.014.', 'number' );
				$row( 'redeem_storage_pts', 'Points for extra storage', '', 'number' );
				$row( 'redeem_storage_mb', '…which gives this many MB', '', 'number' );
				?>
			</table>

			<h2>Selling extra library storage</h2>
			<p>Every signed-in customer gets the free online storage set under “Customer accounts” for their Dreamscapes and My Library (plants found with Plant ID, their own photos). They can buy more, one time, using the same Stripe account — it never expires and is added to their account the moment Stripe confirms the payment.</p>
			<table class="form-table">
				<tr><th>Storage store</th><td><?php $check( 'storage_on', 'Let customers buy extra storage' ); ?></td></tr>
				<tr><th><label for="ds_spacks">Storage packs</label></th><td><textarea class="large-text code" rows="3" id="ds_spacks" name="<?php echo esc_attr( $n ); ?>[storage_packs]"><?php echo esc_textarea( $o['storage_packs'] ); ?></textarea>
					<p class="description">One pack per line: <code>Name | megabytes | price in dollars</code> (1 GB = 1024 MB). A Plant ID plant uses about 0.2–0.5 MB; a Dreamscape about 1–4 MB.</p></td></tr>
			</table>

			<h2>Contractors (CRM)</h2>
			<p>Approved contractors get the <b>Contractor Hub</b>: customers and properties, the 2D site plan, automatic takeoff &amp; estimates, two quotes (job cost + customer proposal), e-signature, email/text follow-ups, scheduling, job costing and invoices. Homeowners use <b>Find a Local Contractor</b> and see their hires in <b>My Projects</b>. Review applications under <a href="<?php echo esc_url( admin_url( 'options-general.php?page=dreamscaper-contractors' ) ); ?>">Settings → DreamScaper Contractors</a>. Put <code>[dreamscaper_quote]</code> on a page for a lead form that goes straight into your CRM (<code>[dreamscaper_quote pro="USER_ID"]</code> for another contractor).</p>
			<table class="form-table">
				<tr><th>Contractor tools</th><td><?php $check( 'crm_on', 'Turn on the Contractor Hub, Find a Local Contractor and My Projects' ); $check( 'crm_auto_approve', 'Approve contractor applications automatically (not recommended)' ); ?></td></tr>
			</table>
			<h3>Text messages (Twilio)</h3>
			<ol style="max-width:820px">
				<li>Create an account at <a href="https://www.twilio.com/try-twilio" target="_blank" rel="noopener">twilio.com</a> and buy a local phone number with SMS.</li>
				<li>US texting requires <b>A2P 10DLC registration</b> (Twilio Console → Messaging → Regulatory Compliance). Register your business and a “Customer care / account notifications” campaign. Texts are blocked by carriers until this is approved.</li>
				<li>Optional but recommended: create a <em>Messaging Service</em>, add your number to it and paste its SID (<code>MG…</code>) below.</li>
				<li>On the phone number (or Messaging Service) set “A message comes in” to <b>Webhook, HTTP POST</b>: <code><?php echo esc_html( rest_url( 'dreamscaper/v1/crm/twilio' ) ); ?></code>. Customer replies are logged in the CRM and emailed to the contractor; texts from unknown numbers become leads for you; STOP is honored.</li>
			</ol>
			<table class="form-table">
				<?php
				$row( 'twilio_sid', 'Twilio Account SID', 'Starts with <code>AC</code>.' );
				$row( 'twilio_token', 'Twilio Auth Token', '', 'secret' );
				$row( 'twilio_from', 'Twilio phone number', 'e.g. <code>+18605550100</code>. Not needed if you use a Messaging Service.' );
				$row( 'twilio_msid', 'Messaging Service SID (optional)', 'Starts with <code>MG</code>.' );
				?>
			</table>
			<h3>Door-to-door map</h3>
			<p>Contractors tap houses on a street map to log door-to-door visits. By default the map uses OpenStreetMap, which is fine for light use. For heavy use or satellite imagery, sign up with a map tile provider (for example MapTiler or Stadia Maps) and paste its tile address here.</p>
			<table class="form-table">
				<?php
				$row( 'map_tiles', 'Map tile address (optional)', 'Like <code>https://api.maptiler.com/maps/hybrid/{z}/{x}/{y}.jpg?key=YOUR_KEY</code>. Must contain {z}, {x} and {y}.' );
				$row( 'map_tiles_attr', 'Map credit line', 'Shown on the map, as your provider requires (e.g. “© MapTiler © OpenStreetMap contributors”).' );
				$row( 'map_tiles_max', 'Deepest zoom level', 'Usually 19–20.', 'number' );
				?>
			</table>
			<h3>Contractor payments (Stripe Connect)</h3>
			<p>Contractors connect their own Stripe account from the Contractor Hub (Settings → Get paid online). Homeowners pay deposits, progress and final invoices by card, Apple Pay, Google Pay or bank account (ACH); the money goes to the contractor’s Stripe account. Uses the Stripe keys above. In your Stripe Dashboard turn on <b>Connect</b> (Express accounts) and add the events <code>checkout.session.completed</code>, <code>checkout.session.async_payment_succeeded</code>, <code>checkout.session.async_payment_failed</code> (bank payments) and <code>account.updated</code> to your webhook. Instant Payouts also need <b>Instant Payouts</b> and <b>Account Debits</b> enabled for your Connect platform — try them in test mode first.</p>
			<table class="form-table">
				<?php
				$row( 'fee_card_pct', 'Card payments — % per payment', 'Processing rate a contractor pays on each card / Apple Pay / Google Pay payment (default 3.5%). Stripe’s own card fee is paid out of this by the site.', 'number' );
				$row( 'fee_card_fixed', 'Card payments — fixed $ per payment', 'Added to the % above (default $0.30).', 'number' );
				$row( 'fee_ach_pct', 'Bank (ACH) payments — % per payment', 'Default 1.5%. Bank payments take about 4 business days to clear.', 'number' );
				$row( 'fee_instant_pct', 'Instant Payouts — % of the payout', 'Default 2.5%. Contractors can choose to get paid out instantly to a debit card instead of waiting for the standard payout.', 'number' );
				?>
				<tr><th>Payment options</th><td>
					<label><input type="checkbox" name="<?php echo esc_attr( $n ); ?>[pay_ach]" value="1" <?php checked( $o['pay_ach'], 1 ); ?>> Let customers pay by bank account (ACH)</label><br>
					<label><input type="checkbox" name="<?php echo esc_attr( $n ); ?>[pay_instant]" value="1" <?php checked( $o['pay_instant'], 1 ); ?>> Offer contractors Instant Payouts</label>
					<p class="description">Before switching Instant Payouts on: in Stripe → Connect → Settings, enable Instant Payouts for connected accounts and Account Debits (US). Test it in test mode first.</p>
				</td></tr>
			</table>
			<?php submit_button(); ?>
		</form>
		<?php dreamscaper_purchases_admin(); ?>
		<?php dreamscaper_photos_admin(); ?>
	</div>
	<?php
}

function dreamscaper_purchases_admin() {
	$users = get_users( array( 'meta_key' => 'dscp_purchases', 'number' => 50 ) );
	if ( ! $users ) {
		return;
	}
	$rows = array();
	foreach ( $users as $u ) {
		foreach ( (array) get_user_meta( $u->ID, 'dscp_purchases', true ) as $p ) {
			if ( is_array( $p ) ) {
				$rows[] = array( $p['at'], $u->display_name, $u->user_email, ! empty( $p['mb'] ) ? ( $p['mb'] >= 1024 ? round( $p['mb'] / 1024, 1 ) . ' GB storage' : $p['mb'] . ' MB storage' ) : (int) $p['credits'] . ' AI credits', $p['amount'] );
			}
		}
	}
	usort( $rows, function ( $a, $b ) { return $b[0] - $a[0]; } );
	echo '<hr><h2>Recent purchases</h2><table class="widefat striped" style="max-width:820px"><thead><tr><th>Date</th><th>Customer</th><th>Email</th><th>Bought</th><th>Paid</th></tr></thead><tbody>';
	foreach ( array_slice( $rows, 0, 30 ) as $r ) {
		echo '<tr><td>' . esc_html( wp_date( 'M j, Y g:i a', $r[0] ) ) . '</td><td>' . esc_html( $r[1] ) . '</td><td>' . esc_html( $r[2] ) . '</td><td>' . esc_html( $r[3] ) . '</td><td>$' . esc_html( number_format( (float) $r[4], 2 ) ) . '</td></tr>';
	}
	echo '</tbody></table>';
}

/* -------------------------------------------------------------------------
 * Library photos: real cut-out photos that replace the drawn plants for every
 * visitor. Make them in DreamScaper ("Add from a photo" -> link to a library
 * plant -> "Download for website"), then upload them on the settings page.
 * Files: <item-id>.webp (main) and optional <item-id>.fall.webp / .winter.webp /
 * .spring.webp / .summer.webp seasonal versions.
 * ---------------------------------------------------------------------- */

function dreamscaper_photo_dir() {
	$u = wp_upload_dir();
	return array( trailingslashit( $u['basedir'] ) . 'dreamscaper-photos/', trailingslashit( $u['baseurl'] ) . 'dreamscaper-photos/' );
}

function dreamscaper_photo_files() {
	list( $dir ) = dreamscaper_photo_dir();
	$out = array();
	if ( ! is_dir( $dir ) ) {
		return $out;
	}
	foreach ( (array) scandir( $dir ) as $f ) {
		if ( preg_match( '/\.(webp|png|jpe?g)$/', $f ) ) {
			$out[] = $f;
		}
	}
	sort( $out );
	return $out;
}

function dreamscaper_build_manifest() {
	list( $dir ) = dreamscaper_photo_dir();
	$m = array();
	foreach ( dreamscaper_photo_files() as $f ) {
		if ( ! preg_match( '/^([a-z0-9-]+)(?:\.(spring|summer|fall|winter|top))?\.(webp|png|jpe?g)$/', $f, $mm ) ) {
			continue;
		}
		$id = $mm[1];
		if ( ! isset( $m[ $id ] ) ) {
			$m[ $id ] = array( 'seasons' => new stdClass() );
		}
		if ( ! empty( $mm[2] ) ) {
			$m[ $id ]['seasons']->{$mm[2]} = $f;
		} else {
			$m[ $id ]['src'] = $f;
			$size            = @getimagesize( $dir . $f );
			if ( $size && $size[1] ) {
				$m[ $id ]['aspect'] = round( $size[0] / $size[1], 4 );
			}
		}
	}
	$m = array_filter( $m, function ( $e ) { return ! empty( $e['src'] ); } );
	wp_mkdir_p( $dir );
	file_put_contents( $dir . 'manifest.json', wp_json_encode( (object) $m ) );
	update_option( 'dreamscaper_photos_ver', time() );
	return count( $m );
}

/* Library pack installer: a .zip with photos/ (plant & feature cut-outs, <id>.webp,
 * <id>.<season>.webp) and/or materials/ (<id>.webp + materials.json). */
function dreamscaper_material_dir() {
	$u = wp_upload_dir();
	return array( trailingslashit( $u['basedir'] ) . 'dreamscaper-materials/', trailingslashit( $u['baseurl'] ) . 'dreamscaper-materials/' );
}

/** Install a library-pack zip (photos/ and/or materials/). Returns a status message. */
function dreamscaper_install_pack( $zip ) {
	require_once ABSPATH . 'wp-admin/includes/file.php';
	WP_Filesystem();
	$tmp = trailingslashit( get_temp_dir() ) . 'dreamscaper-pack-' . wp_generate_password( 8, false );
	wp_mkdir_p( $tmp );
	$res = unzip_file( $zip, $tmp );
	if ( is_wp_error( $res ) ) {
		$GLOBALS['wp_filesystem']->delete( $tmp, true );
		return 'Could not open that zip: ' . $res->get_error_message();
	}
	list( $pdir ) = dreamscaper_photo_dir();
	list( $mdir ) = dreamscaper_material_dir();
	wp_mkdir_p( $pdir );
	wp_mkdir_p( $mdir );
	$np = 0; $nm = 0;
	$it = new RecursiveIteratorIterator( new RecursiveDirectoryIterator( $tmp, FilesystemIterator::SKIP_DOTS ) );
	foreach ( $it as $f ) {
		$path = str_replace( '\\', '/', $f->getPathname() );
		$name = strtolower( basename( $path ) );
		if ( preg_match( '#/photos/#', $path ) && preg_match( '/^[a-z0-9-]+(\.(spring|summer|fall|winter|top))?\.(webp|png|jpe?g)$/', $name ) && @getimagesize( $path ) ) {
			if ( @rename( $path, $pdir . $name ) || @copy( $path, $pdir . $name ) ) { $np++; }
		} elseif ( preg_match( '#/materials/#', $path ) && preg_match( '/^[a-z0-9-]+\.(webp|png|jpe?g)$/', $name ) && @getimagesize( $path ) ) {
			if ( @rename( $path, $mdir . $name ) || @copy( $path, $mdir . $name ) ) { $nm++; }
		} elseif ( preg_match( '#/materials/materials\.json$#', $path ) ) {
			$incoming = json_decode( file_get_contents( $path ), true );
			$current  = file_exists( $mdir . 'materials.json' ) ? json_decode( file_get_contents( $mdir . 'materials.json' ), true ) : array();
			if ( ! is_array( $current ) ) { $current = array(); }
			if ( is_array( $incoming ) ) {
				foreach ( $incoming as $k => $v ) {
					if ( preg_match( '/^[a-z0-9-]+$/', $k ) && is_array( $v ) ) {
						$current[ $k ] = array_intersect_key( $v, array_flip( array( 'name', 'group', 'ft', 'avg', 'src', 'credit', 'tags' ) ) );
					}
				}
				file_put_contents( $mdir . 'materials.json', wp_json_encode( (object) $current ) );
				update_option( 'dreamscaper_materials_ver', time() );
			}
		} elseif ( preg_match( '#/credits\.json$#', $path ) ) {
			@copy( $path, $pdir . 'credits-' . substr( md5( $path ), 0, 6 ) . '.json' );
		}
	}
	$GLOBALS['wp_filesystem']->delete( $tmp, true );
	$total = dreamscaper_build_manifest();
	return sprintf( 'Library pack installed: %d photos and %d materials added. %d library items now use real photos.', $np, $nm, $total );
}

add_action( 'admin_post_dreamscaper_pack', function () {
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( 'Not allowed.' );
	}
	check_admin_referer( 'dreamscaper_pack' );
	$msg = 'No pack received.';
	if ( ! empty( $_FILES['ds_pack']['tmp_name'] ) && is_uploaded_file( $_FILES['ds_pack']['tmp_name'] ) ) {
		$msg = dreamscaper_install_pack( $_FILES['ds_pack']['tmp_name'] );
	}
	set_transient( 'dreamscaper_photos_msg', $msg, 60 );
	wp_safe_redirect( admin_url( 'options-general.php?page=dreamscaper' ) );
	exit;
} );

add_action( 'admin_post_dreamscaper_photos', function () {
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( 'Not allowed.' );
	}
	check_admin_referer( 'dreamscaper_photos' );
	list( $dir ) = dreamscaper_photo_dir();
	wp_mkdir_p( $dir );
	$added   = 0;
	$skipped = array();
	if ( ! empty( $_POST['ds_delete'] ) ) {
		foreach ( (array) wp_unslash( $_POST['ds_delete'] ) as $f ) {
			$f = basename( sanitize_file_name( $f ) );
			if ( $f && 'manifest.json' !== $f && is_file( $dir . $f ) ) {
				unlink( $dir . $f );
			}
		}
	}
	if ( ! empty( $_FILES['ds_photos']['name'] ) ) {
		$files = $_FILES['ds_photos'];
		foreach ( (array) $files['name'] as $i => $name ) {
			$tmp = $files['tmp_name'][ $i ];
			if ( empty( $tmp ) || ! is_uploaded_file( $tmp ) || $files['error'][ $i ] || $files['size'][ $i ] > 3 * MB_IN_BYTES ) {
				if ( $name ) {
					$skipped[] = $name;
				}
				continue;
			}
			$clean = strtolower( sanitize_file_name( $name ) );
			$check = wp_check_filetype_and_ext( $tmp, $clean, array( 'webp' => 'image/webp', 'png' => 'image/png', 'jpg|jpeg' => 'image/jpeg' ) );
			if ( empty( $check['type'] ) || ! preg_match( '/^[a-z0-9-]+(\.(spring|summer|fall|winter|top))?\.(webp|png|jpe?g)$/', $clean ) || ! @getimagesize( $tmp ) ) {
				$skipped[] = $name;
				continue;
			}
			if ( move_uploaded_file( $tmp, $dir . $clean ) ) {
				$added++;
			}
		}
	}
	$n   = dreamscaper_build_manifest();
	$msg = sprintf( '%d photo(s) uploaded. %d library item(s) now use real photos.', $added, $n );
	if ( $skipped ) {
		$msg .= ' Skipped: ' . implode( ', ', array_map( 'sanitize_text_field', $skipped ) ) . ' (use names like hydrangea.webp, under 3 MB).';
	}
	set_transient( 'dreamscaper_photos_msg', $msg, 60 );
	wp_safe_redirect( admin_url( 'options-general.php?page=dreamscaper' ) );
	exit;
} );

function dreamscaper_photos_admin() {
	list( , $url ) = dreamscaper_photo_dir();
	$files         = dreamscaper_photo_files();
	$msg           = get_transient( 'dreamscaper_photos_msg' );
	if ( $msg ) {
		delete_transient( 'dreamscaper_photos_msg' );
		echo '<div class="notice notice-success"><p>' . esc_html( $msg ) . '</p></div>';
	}
	?>
	<hr>
	<h2>Library packs</h2>
	<p>Real-photo library packs (plant and feature cut-outs, photo-scanned ground materials) are installed here, one zip at a time. They load only when a customer uses that item, so your pages stay fast.</p>
	<form method="post" enctype="multipart/form-data" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
		<input type="hidden" name="action" value="dreamscaper_pack">
		<?php wp_nonce_field( 'dreamscaper_pack' ); ?>
		<p><input type="file" name="ds_pack" accept=".zip,application/zip"> <?php submit_button( 'Install pack', 'primary', 'submit', false ); ?></p>
		<p class="description">If WordPress says the file is too large, ask your host to raise the upload limit to 64 MB, or install packs with an FTP client into <code>wp-content/uploads/dreamscaper-photos</code>.</p>
	</form>
	<h2>Library photos</h2>
	<p>Replace the drawn plants with real photos for every visitor. In DreamScaper (while logged in), use <strong>Add from a photo</strong>, link the photo to a library plant, save it, then open it with the pencil button and press <strong>Download for website</strong>. Upload the downloaded files here. Each photo still grows, changes color in fall and loses its leaves in winter using that plant’s data.</p>
	<p class="description">File names are the library ID, e.g. <code>hydrangea.webp</code>. Optional seasonal versions: <code>hydrangea.fall.webp</code>, <code>hydrangea.winter.webp</code>. Transparent WebP or PNG, under 3 MB (most are 20–80 KB).</p>
	<form method="post" enctype="multipart/form-data" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
		<input type="hidden" name="action" value="dreamscaper_photos">
		<?php wp_nonce_field( 'dreamscaper_photos' ); ?>
		<p><input type="file" name="ds_photos[]" accept="image/webp,image/png,image/jpeg" multiple> <?php submit_button( 'Upload photos', 'secondary', 'submit', false ); ?></p>
		<?php if ( $files ) : ?>
			<p><strong><?php echo count( $files ); ?> photo file(s).</strong> Tick any to delete, then press Upload photos.</p>
			<div style="display:flex;flex-wrap:wrap;gap:10px">
			<?php foreach ( $files as $f ) : ?>
				<label style="width:110px;text-align:center;font-size:11px;word-break:break-all;background:#f3f5f3;border-radius:8px;padding:6px">
					<img src="<?php echo esc_url( $url . $f ); ?>" alt="" style="width:96px;height:96px;object-fit:contain;display:block;margin:0 auto 4px" loading="lazy">
					<input type="checkbox" name="ds_delete[]" value="<?php echo esc_attr( $f ); ?>"> <?php echo esc_html( $f ); ?>
				</label>
			<?php endforeach; ?>
			</div>
		<?php endif; ?>
	</form>
	<?php
}

/* -------------------------------------------------------------------------
 * Shortcode / launcher
 * ---------------------------------------------------------------------- */

add_shortcode( 'dreamscaper', function ( $atts ) {
	static $printed = false;
	$a = shortcode_atts(
		array(
			'title'  => 'DreamScaper',
			'text'   => 'Design your dream yard on a photo of your own home: add trees, shrubs and flowers, paint on mulch and stone, erase what you don\'t want, and watch it all grow year by year — or let Dreamscape AI design it for you. Free and fun.',
			'button' => 'Start designing',
		),
		$atts,
		'dreamscaper'
	);
	if ( 'dreamscaper' === strtolower( trim( $a['title'] ) ) ) {
		$a['title'] = 'DreamScaper'; // the brand is always written with a capital S
	}
	ob_start();
	?>
	<div class="dreamscaper-launch">
		<img class="dreamscaper-launch-logo" src="<?php echo esc_url( DREAMSCAPER_URL . 'assets/img/dreamscaper-logo.svg' ); ?>" alt="DreamScaper logo" width="150" height="150">
		<div class="dreamscaper-launch-copy">
			<p class="dreamscaper-kicker">Free yard design studio</p>
			<h2><?php echo esc_html( $a['title'] ); ?></h2>
			<p><?php echo esc_html( $a['text'] ); ?></p>
			<button type="button" class="dreamscaper-launch-btn" data-dreamscaper-open><?php echo esc_html( $a['button'] ); ?> →</button>
		</div>
	</div>
	<?php
	if ( ! $printed ) {
		$printed = true;
		$cfg     = array(
			'api'        => esc_url_raw( rest_url( 'dreamscaper/v1/' ) ),
			'css'        => DREAMSCAPER_URL . 'assets/css/dreamscaper.css?ver=' . DREAMSCAPER_VERSION,
			'brand'      => dreamscaper_opt( 'brand' ),
			'shortBrand' => dreamscaper_opt( 'short_brand' ),
			'site'       => dreamscaper_opt( 'site' ),
			'mapsKey'    => dreamscaper_opt( 'maps_key' ),
			'share'      => (bool) dreamscaper_opt( 'share' ),
			'owner'      => current_user_can( 'manage_options' ),
			'ajax'       => admin_url( 'admin-ajax.php' ),
			'home'       => home_url( '/' ),
			'oauth'      => home_url( '/' ),
		);
		if ( is_singular() && (int) get_option( 'dreamscaper_page' ) !== get_the_ID() ) {
			update_option( 'dreamscaper_page', get_the_ID(), false );
		}
		if ( get_option( 'dreamscaper_materials_ver' ) ) {
			list( , $murl )   = dreamscaper_material_dir();
			$cfg['materials'] = $murl . 'materials.json?v=' . (int) get_option( 'dreamscaper_materials_ver' );
		}
		if ( get_option( 'dreamscaper_photos_ver' ) ) {
			list( , $purl )  = dreamscaper_photo_dir();
			$cfg['photos'] = $purl . 'manifest.json?v=' . (int) get_option( 'dreamscaper_photos_ver' );
		}
		?>
		<style>
			.dreamscaper-launch{display:flex;align-items:center;gap:6px;padding-left:22px;max-width:880px;margin:24px auto;border-radius:20px;overflow:hidden;background:linear-gradient(135deg,#123222,#1f5236);color:#eef7f0;box-shadow:0 12px 30px rgba(0,0,0,.18)}
			.dreamscaper-launch-copy{padding:30px 28px;flex:1}
			.dreamscaper-launch-logo{flex:none;width:150px;height:150px}
			@media (max-width:600px){.dreamscaper-launch{flex-direction:column;padding:18px 0 0}.dreamscaper-launch-logo{width:120px;height:120px}.dreamscaper-launch-copy{padding:8px 22px 26px;text-align:center}}
			.dreamscaper-kicker{margin:0 0 6px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#9fe3b5;font-weight:700}
			.dreamscaper-launch h2{margin:0 0 10px;color:#fff;font-size:30px;line-height:1.15}
			.dreamscaper-launch p{margin:0 0 18px;font-size:16px;line-height:1.55;color:#d8eadc}
			.dreamscaper-launch-btn{display:inline-block;border:0;border-radius:999px;padding:14px 26px;background:#7be0a0;color:#0b2a18;font-weight:800;font-size:16px;cursor:pointer}
			.dreamscaper-launch-btn:hover{filter:brightness(1.06)}
		</style>
		<script type="application/json" id="dreamscaper-config"><?php echo wp_json_encode( $cfg ); ?></script>
		<script type="module" src="<?php echo esc_url( DREAMSCAPER_URL . 'assets/js/app.js?ver=' . DREAMSCAPER_VERSION ); ?>"></script>
		<?php
	}
	return ob_get_clean();
} );

/* -------------------------------------------------------------------------
 * REST API
 * ---------------------------------------------------------------------- */

add_action( 'rest_api_init', function () {
	register_rest_route( 'dreamscaper/v1', '/suggest', array(
		'methods'             => 'GET',
		'callback'            => 'dreamscaper_rest_suggest',
		'permission_callback' => '__return_true',
	) );
	foreach ( array( 'aerial', 'geocode', 'share' ) as $route ) {
		register_rest_route( 'dreamscaper/v1', '/' . $route, array(
			'methods'             => 'POST',
			'callback'            => 'dreamscaper_rest_' . $route,
			'permission_callback' => '__return_true',
		) );
	}
} );

function dreamscaper_ip_key( $prefix ) {
	$ip = isset( $_SERVER['REMOTE_ADDR'] ) ? $_SERVER['REMOTE_ADDR'] : '';
	return 'dscp_' . $prefix . '_' . substr( hash_hmac( 'sha256', $ip, wp_salt() ), 0, 16 );
}

function dreamscaper_limit( $prefix, $max, $ttl ) {
	$k = dreamscaper_ip_key( $prefix );
	$n = (int) get_transient( $k );
	if ( $n >= $max ) {
		return false;
	}
	set_transient( $k, $n + 1, $ttl );
	return true;
}

/** US states and territories: abbreviation => name. DreamScaper works anywhere in the US. */
function dreamscaper_us_states() {
	return array( 'AL' => 'Alabama', 'AK' => 'Alaska', 'AZ' => 'Arizona', 'AR' => 'Arkansas', 'CA' => 'California', 'CO' => 'Colorado', 'CT' => 'Connecticut', 'DE' => 'Delaware', 'DC' => 'District of Columbia', 'FL' => 'Florida', 'GA' => 'Georgia', 'HI' => 'Hawaii', 'ID' => 'Idaho', 'IL' => 'Illinois', 'IN' => 'Indiana', 'IA' => 'Iowa', 'KS' => 'Kansas', 'KY' => 'Kentucky', 'LA' => 'Louisiana', 'ME' => 'Maine', 'MD' => 'Maryland', 'MA' => 'Massachusetts', 'MI' => 'Michigan', 'MN' => 'Minnesota', 'MS' => 'Mississippi', 'MO' => 'Missouri', 'MT' => 'Montana', 'NE' => 'Nebraska', 'NV' => 'Nevada', 'NH' => 'New Hampshire', 'NJ' => 'New Jersey', 'NM' => 'New Mexico', 'NY' => 'New York', 'NC' => 'North Carolina', 'ND' => 'North Dakota', 'OH' => 'Ohio', 'OK' => 'Oklahoma', 'OR' => 'Oregon', 'PA' => 'Pennsylvania', 'RI' => 'Rhode Island', 'SC' => 'South Carolina', 'SD' => 'South Dakota', 'TN' => 'Tennessee', 'TX' => 'Texas', 'UT' => 'Utah', 'VT' => 'Vermont', 'VA' => 'Virginia', 'WA' => 'Washington', 'WV' => 'West Virginia', 'WI' => 'Wisconsin', 'WY' => 'Wyoming', 'PR' => 'Puerto Rico' );
}
/** 'Connecticut' / 'ct' / 'CT' → 'CT'; '' when it isn't a US state. */
function dreamscaper_state_abbr( $s ) {
	$s = trim( (string) $s );
	if ( '' === $s ) {
		return '';
	}
	$all = dreamscaper_us_states();
	if ( isset( $all[ strtoupper( $s ) ] ) ) {
		return strtoupper( $s );
	}
	$k = array_search( strtolower( $s ), array_map( 'strtolower', $all ), true );
	return false === $k ? '' : $k;
}
/**
 * Where a person (or the site) is, for plant advice and AI prompts: their state's name, else the
 * site's home region (Settings), else "the United States".
 */
function dreamscaper_region( $uid = 0 ) {
	$uid = $uid ? $uid : get_current_user_id();
	$st  = $uid ? dreamscaper_state_abbr( get_user_meta( $uid, 'dscp_state', true ) ) : '';
	if ( ! $st && $uid && function_exists( 'dreamscaper_pro_row' ) ) {
		$p  = dreamscaper_pro_row( $uid );
		$st = $p ? dreamscaper_state_abbr( $p->state ) : '';
	}
	$all = dreamscaper_us_states();
	if ( $st ) {
		return $all[ $st ];
	}
	$home = trim( (string) dreamscaper_opt( 'home_region' ) );
	return $home ? $home : 'the United States';
}

/**
 * Address autocomplete. Google Places (New) when a Maps key is set, otherwise Photon (OpenStreetMap).
 * Results are biased toward the visitor's own area when the app passes lat/lng — never limited to one
 * state, except for the Connecticut-only aerial imagery search (ct=1).
 */
function dreamscaper_rest_suggest( WP_REST_Request $r ) {
	$q  = trim( sanitize_text_field( (string) $r->get_param( 'q' ) ) );
	$ct = '1' === (string) $r->get_param( 'ct' );
	// optional bias toward the person's area (lat/lng from their profile or a recent search)
	$blat = max( -90, min( 90, (float) $r->get_param( 'lat' ) ) );
	$blng = max( -180, min( 180, (float) $r->get_param( 'lng' ) ) );
	if ( strlen( $q ) < 3 ) {
		return array( 'items' => array() );
	}
	if ( ! dreamscaper_limit( 'sug', 400, HOUR_IN_SECONDS ) ) {
		return array( 'items' => array() );
	}
	$ck = 'dscp_sug_' . md5( strtolower( $q ) . ( $ct ? 'ct' : '' ) . round( $blat, 1 ) . round( $blng, 1 ) );
	$c  = get_transient( $ck );
	if ( false !== $c ) {
		return array( 'items' => $c );
	}
	$items = array();
	$key   = dreamscaper_opt( 'maps_key' );
	if ( $key ) {
		$body = array( 'input' => $q, 'includedRegionCodes' => array( 'us' ), 'includedPrimaryTypes' => array( 'street_address', 'premise', 'subpremise', 'route' ) );
		if ( $ct ) {
			$body['locationRestriction'] = array( 'rectangle' => array( 'low' => array( 'latitude' => 40.95, 'longitude' => -73.73 ), 'high' => array( 'latitude' => 42.06, 'longitude' => -71.78 ) ) );
		} elseif ( $blat || $blng ) {
			$body['locationBias'] = array( 'circle' => array( 'center' => array( 'latitude' => $blat, 'longitude' => $blng ), 'radius' => 50000.0 ) );
		}
		$res = wp_remote_post( 'https://places.googleapis.com/v1/places:autocomplete', array(
			'timeout' => 8,
			'headers' => array( 'Content-Type' => 'application/json', 'X-Goog-Api-Key' => $key, 'Referer' => home_url( '/' ) ),
			'body'    => wp_json_encode( $body ),
		) );
		$j   = is_wp_error( $res ) ? null : json_decode( wp_remote_retrieve_body( $res ), true );
		foreach ( (array) ( isset( $j['suggestions'] ) ? $j['suggestions'] : array() ) as $s ) {
			if ( ! empty( $s['placePrediction']['text']['text'] ) ) {
				$items[] = array( 'label' => preg_replace( '/, USA$/', '', $s['placePrediction']['text']['text'] ) );
			}
		}
	}
	if ( ! $items ) {
		$args = array( 'q' => $q, 'limit' => 6, 'lang' => 'en' );
		if ( $ct ) {
			$args['bbox'] = '-73.73,40.95,-71.78,42.06';
		} elseif ( $blat || $blng ) {
			$args['lat'] = $blat;
			$args['lon'] = $blng;
		}
		$res = wp_remote_get( add_query_arg( $args, 'https://photon.komoot.io/api/' ), array( 'timeout' => 8, 'user-agent' => 'DreamScaper/' . DREAMSCAPER_VERSION . ' (' . home_url() . ')' ) );
		$j   = is_wp_error( $res ) ? null : json_decode( wp_remote_retrieve_body( $res ), true );
		foreach ( (array) ( isset( $j['features'] ) ? $j['features'] : array() ) as $f ) {
			$p = $f['properties'];
			if ( empty( $p['countrycode'] ) || 'US' !== $p['countrycode'] ) {
				continue;
			}
			$street = trim( ( isset( $p['housenumber'] ) ? $p['housenumber'] . ' ' : '' ) . ( isset( $p['street'] ) ? $p['street'] : ( isset( $p['name'] ) ? $p['name'] : '' ) ) );
			$town   = isset( $p['city'] ) ? $p['city'] : ( isset( $p['town'] ) ? $p['town'] : ( isset( $p['village'] ) ? $p['village'] : '' ) );
			$state  = isset( $p['state'] ) ? ( dreamscaper_state_abbr( $p['state'] ) ? dreamscaper_state_abbr( $p['state'] ) : $p['state'] ) : '';
			$label  = implode( ', ', array_filter( array( $street, $town, trim( $state . ' ' . ( isset( $p['postcode'] ) ? $p['postcode'] : '' ) ) ) ) );
			if ( $street && $town ) {
				$items[] = array( 'label' => $label, 'lat' => $f['geometry']['coordinates'][1], 'lng' => $f['geometry']['coordinates'][0] );
			}
		}
	}
	$items = array_slice( $items, 0, 6 );
	set_transient( $ck, $items, DAY_IN_SECONDS );
	return array( 'items' => $items );
}

/** US Census geocoder (free, no key), with Photon as a fallback. */
function dreamscaper_geocode( $address ) {
	$res = wp_remote_get( add_query_arg( array(
		'address'   => $address,
		'benchmark' => 'Public_AR_Current',
		'format'    => 'json',
	), 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress' ), array( 'timeout' => 15 ) );
	$geo = is_wp_error( $res ) ? null : json_decode( wp_remote_retrieve_body( $res ), true );
	if ( empty( $geo['result']['addressMatches'][0]['coordinates'] ) ) {
		$res = wp_remote_get( add_query_arg( array( 'q' => $address, 'limit' => 1, 'lat' => 41.6, 'lon' => -72.7 ), 'https://photon.komoot.io/api/' ), array( 'timeout' => 10, 'user-agent' => 'DreamScaper/' . DREAMSCAPER_VERSION ) );
		$j   = is_wp_error( $res ) ? null : json_decode( wp_remote_retrieve_body( $res ), true );
		if ( ! empty( $j['features'][0]['geometry']['coordinates'] ) && 'US' === ( isset( $j['features'][0]['properties']['countrycode'] ) ? $j['features'][0]['properties']['countrycode'] : '' ) ) {
			$c = $j['features'][0]['geometry']['coordinates'];
			return array( 'lat' => (float) $c[1], 'lng' => (float) $c[0], 'match' => $address );
		}
		return null;
	}
	$c = $geo['result']['addressMatches'][0]['coordinates'];
	return array( 'lat' => (float) $c['y'], 'lng' => (float) $c['x'], 'match' => $geo['result']['addressMatches'][0]['matchedAddress'] );
}

function dreamscaper_rest_geocode( WP_REST_Request $r ) {
	if ( ! dreamscaper_limit( 'geo', 60, HOUR_IN_SECONDS ) ) {
		return new WP_Error( 'dreamscaper', 'Too many searches. Please wait a bit.', array( 'status' => 429 ) );
	}
	$address = sanitize_text_field( (string) $r->get_param( 'address' ) );
	$g       = $address ? dreamscaper_geocode( $address ) : null;
	if ( ! $g ) {
		return new WP_Error( 'dreamscaper', 'We couldn\'t find that address. Include the street, town and state.', array( 'status' => 404 ) );
	}
	return $g;
}

/** Connecticut statewide 3-inch orthoimagery (CT ECO, 2023, no use restrictions). */
function dreamscaper_rest_aerial( WP_REST_Request $r ) {
	if ( ! dreamscaper_limit( 'air', 150, HOUR_IN_SECONDS ) ) {
		return new WP_Error( 'dreamscaper', 'Too many map requests. Please wait a bit.', array( 'status' => 429 ) );
	}
	$lat  = (float) $r->get_param( 'lat' );
	$lng  = (float) $r->get_param( 'lng' );
	$span = (float) $r->get_param( 'span' );
	$span = $span ? min( 250, max( 25, $span ) ) : 70;
	$addr = sanitize_text_field( (string) $r->get_param( 'address' ) );
	if ( $addr ) {
		if ( ! preg_match( '/\b(CT|Connecticut)\b/i', $addr ) ) {
			$addr .= ', CT';
		}
		$g = dreamscaper_geocode( $addr );
		if ( ! $g ) {
			return new WP_Error( 'dreamscaper', 'We couldn\'t find that address. Try including the town.', array( 'status' => 404 ) );
		}
		$lat = $g['lat'];
		$lng = $g['lng'];
	}
	if ( $lat < 40.95 || $lat > 42.06 || $lng < -73.73 || $lng > -71.78 ) {
		return new WP_Error( 'dreamscaper', 'Bird\'s-eye view covers Connecticut addresses. Try taking or uploading a photo instead.', array( 'status' => 400 ) );
	}
	$dlat = ( $span / 2 ) / 111320;
	$dlng = ( $span / 2 ) / ( 111320 * cos( deg2rad( $lat ) ) );
	$url  = add_query_arg( array(
		'bbox'        => implode( ',', array( $lng - $dlng, $lat - $dlat, $lng + $dlng, $lat + $dlat ) ),
		'bboxSR'      => 4326,
		'imageSR'     => 3857,
		'size'        => '1280,1280',
		'format'      => 'jpg',
		'bandIds'     => '0,1,2',
		'compression' => 88,
		'f'           => 'image',
	), 'https://cteco.uconn.edu/ctraster/rest/services/images/Ortho_2023/ImageServer/exportImage' );
	$img = wp_remote_get( $url, array( 'timeout' => 25 ) );
	$ct  = wp_remote_retrieve_header( $img, 'content-type' );
	if ( is_wp_error( $img ) || 200 !== wp_remote_retrieve_response_code( $img ) || false === strpos( (string) $ct, 'image' ) ) {
		return new WP_Error( 'dreamscaper', 'The state imagery server is busy. Please try again in a moment.', array( 'status' => 502 ) );
	}
	return array(
		'lat'   => $lat,
		'lng'   => $lng,
		'span'  => $span,
		'image' => 'data:image/jpeg;base64,' . base64_encode( wp_remote_retrieve_body( $img ) ),
	);
}

/** Customer sends their finished design (optional; on/off in settings). */
function dreamscaper_rest_share( WP_REST_Request $r ) {
	if ( ! dreamscaper_opt( 'share' ) ) {
		return new WP_Error( 'dreamscaper', 'Sharing is turned off.', array( 'status' => 403 ) );
	}
	$p = $r->get_json_params();
	if ( ! empty( $p['hp'] ) ) {
		return new WP_Error( 'dreamscaper', 'Error.', array( 'status' => 400 ) );
	}
	$name  = sanitize_text_field( isset( $p['name'] ) ? $p['name'] : '' );
	$email = sanitize_email( isset( $p['email'] ) ? $p['email'] : '' );
	$phone = sanitize_text_field( isset( $p['phone'] ) ? $p['phone'] : '' );
	if ( strlen( $name ) < 2 || ! is_email( $email ) || strlen( preg_replace( '/\D/', '', $phone ) ) < 10 ) {
		return new WP_Error( 'dreamscaper', 'Please add your name, email and a 10-digit phone number.', array( 'status' => 400 ) );
	}
	$image = isset( $p['image'] ) ? (string) $p['image'] : '';
	if ( ! preg_match( '#^data:image/jpeg;base64,#', $image ) || strlen( $image ) > 6 * 1024 * 1024 ) {
		return new WP_Error( 'dreamscaper', 'The design image didn\'t come through. Please try again.', array( 'status' => 400 ) );
	}
	if ( ! dreamscaper_limit( 'share', 6, DAY_IN_SECONDS ) ) {
		return new WP_Error( 'dreamscaper', 'You\'ve sent several designs today. Give us a call and we\'ll take it from here!', array( 'status' => 429 ) );
	}
	$town    = sanitize_text_field( isset( $p['town'] ) ? $p['town'] : '' );
	$msg     = sanitize_textarea_field( isset( $p['message'] ) ? $p['message'] : '' );
	$project = sanitize_text_field( isset( $p['project'] ) ? $p['project'] : '' );
	$view    = sanitize_text_field( isset( $p['view'] ) ? $p['view'] : '' );
	$plants  = sanitize_textarea_field( isset( $p['plants'] ) ? $p['plants'] : '' );

	$kind  = in_array( isset( $p['kind'] ) ? $p['kind'] : '', array( 'consult', 'question' ), true ) ? $p['kind'] : 'design';
	$what  = array( 'design' => 'sent a DreamScaper design', 'consult' => 'requested a design consultation', 'question' => 'asked a question about their DreamScaper design' );
	$body = "A customer {$what[ $kind ]}.\n\n"
		. "Name: {$name}\nEmail: {$email}\nPhone: {$phone}\nTown: {$town}\n\n"
		. "Design: {$project} ({$view})\n\n"
		. ( $plants ? "What's in it:\n{$plants}\n\n" : '' )
		. ( $msg ? "Their note:\n{$msg}\n" : '' );

	$tmp = wp_tempnam( 'dreamscape' );
	$jpg = $tmp . '.jpg';
	file_put_contents( $jpg, base64_decode( substr( $image, strpos( $image, ',' ) + 1 ) ) );
	$ok = wp_mail(
		dreamscaper_opt( 'notify_email' ),
		( 'consult' === $kind ? 'Consultation request from ' : ( 'question' === $kind ? 'Question from ' : 'DreamScaper design from ' ) ) . $name . ( $town ? ' (' . $town . ')' : '' ),
		$body,
		array( 'Reply-To: ' . $name . ' <' . $email . '>' ),
		array( $jpg )
	);
	@unlink( $jpg );
	@unlink( $tmp );
	// Also file it in the site owner's Contractor Hub as a lead, so nothing gets lost in email.
	if ( $ok && function_exists( 'dreamscaper_crm_on' ) && dreamscaper_crm_on() ) {
		global $wpdb;
		$owner = 0;
		foreach ( get_users( array( 'role' => 'administrator', 'fields' => 'ID', 'number' => 5 ) ) as $aid ) {
			if ( dreamscaper_pro_row( $aid ) ) {
				$owner = (int) $aid;
				break;
			}
		}
		if ( $owner ) {
			$note = array( 'design' => 'Sent their design', 'consult' => 'Requested a consultation', 'question' => 'Asked a question' );
			dreamscaper_crm_new_lead( $owner, array( 'name' => $name, 'email' => $email, 'phone' => $phone, 'town' => $town, 'message' => $note[ $kind ] . ' (' . $project . '): ' . $msg ), 'dreamscaper', get_current_user_id() );
		}
	}
	if ( ! $ok ) {
		return new WP_Error( 'dreamscaper', 'We couldn\'t send that right now. Please try again later.', array( 'status' => 500 ) );
	}
	return array( 'ok' => true );
}

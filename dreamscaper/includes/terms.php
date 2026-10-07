<?php
/**
 * DreamScaper – Terms of Service.
 *
 *  - A Terms of Service page is created automatically (shortcode [dreamscaper_terms]) and linked
 *    from every screen. The text is editable in Settings → DreamScaper Terms; a sensible default
 *    covering every DreamScaper feature ships with the plugin.
 *  - Continued use = agreement: the app shows a notice ("By continuing to use this website you
 *    agree to the Terms of Service") until it's acknowledged, and again whenever the terms change.
 *  - Sign-up and the contractor application also ask for an explicit tick (stronger than notice
 *    alone), and each acceptance is recorded with the terms version and time.
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** The terms in force: the owner's text, or the default. */
function dreamscaper_terms_text() {
	$t = (string) get_option( 'dreamscaper_terms', '' );
	return '' !== trim( $t ) ? $t : dreamscaper_terms_default();
}
/** A short version id that changes whenever the text changes (so people are asked again). */
function dreamscaper_terms_version() {
	return substr( md5( dreamscaper_terms_text() ), 0, 10 );
}
/** Last updated date shown on the page. */
function dreamscaper_terms_updated() {
	$t = (int) get_option( 'dreamscaper_terms_updated', 0 );
	return $t ? $t : (int) get_option( 'dreamscaper_terms_installed', time() );
}

/** The Terms page URL (creating the page the first time it's needed). */
function dreamscaper_terms_url() {
	$id = (int) get_option( 'dreamscaper_terms_page' );
	if ( $id && 'publish' === get_post_status( $id ) ) {
		return get_permalink( $id );
	}
	if ( ! current_user_can( 'manage_options' ) ) {
		// visitors never create pages; an admin page load does (below). Until then the built-in page works.
		return home_url( '/?ds_terms=1' );
	}
	$id = wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'Terms of Service', 'post_name' => 'terms-of-service', 'post_content' => '[dreamscaper_terms]' ) );
	if ( $id && ! is_wp_error( $id ) ) {
		update_option( 'dreamscaper_terms_page', (int) $id, false );
		update_option( 'dreamscaper_terms_auto', 1, false );
		if ( ! get_option( 'dreamscaper_terms_installed' ) ) {
			update_option( 'dreamscaper_terms_installed', time(), false );
		}
		return get_permalink( $id );
	}
	return home_url( '/?ds_terms=1' );
}
add_action( 'admin_init', function () {
	if ( ! (int) get_option( 'dreamscaper_terms_page' ) && current_user_can( 'manage_options' ) ) {
		dreamscaper_terms_url();
	}
} );

/** Render the terms as simple, safe HTML (headings with "## ", paragraphs, "- " bullets). */
function dreamscaper_terms_html() {
	$brand = esc_html( dreamscaper_opt( 'brand' ) );
	$out   = '<div class="dreamscaper-terms"><p><em>Last updated ' . esc_html( wp_date( 'F j, Y', dreamscaper_terms_updated() ) ) . '</em></p>';
	$list  = false;
	foreach ( preg_split( '/\R/', dreamscaper_terms_text() ) as $line ) {
		$line = trim( str_replace( '{brand}', $brand, $line ) );
		if ( 0 === strpos( $line, '- ' ) ) {
			if ( ! $list ) {
				$out .= '<ul>';
				$list = true;
			}
			$out .= '<li>' . wp_kses( substr( $line, 2 ), array( 'strong' => array(), 'em' => array() ) ) . '</li>';
			continue;
		}
		if ( $list ) {
			$out .= '</ul>';
			$list = false;
		}
		if ( '' === $line ) {
			continue;
		}
		$out .= 0 === strpos( $line, '## ' ) ? '<h2>' . esc_html( substr( $line, 3 ) ) . '</h2>' : '<p>' . wp_kses( $line, array( 'strong' => array(), 'em' => array() ) ) . '</p>';
	}
	return $out . ( $list ? '</ul>' : '' ) . '</div>';
}
add_shortcode( 'dreamscaper_terms', 'dreamscaper_terms_html' );

/** Fallback page when the Terms page hasn't been created yet. */
add_action( 'template_redirect', function () {
	if ( empty( $_GET['ds_terms'] ) ) { // phpcs:ignore
		return;
	}
	nocache_headers();
	echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Terms of Service</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:780px;margin:0 auto;padding:20px;color:#1d2a22}h2{margin-top:1.6em}</style></head><body><h1>Terms of Service</h1>' . dreamscaper_terms_html() . '</body></html>'; // phpcs:ignore
	exit;
} );

/* -------------------------------------------------------- acceptance */

/** Record that a signed-in person accepted the current terms (how: notice | signup | contractor). */
function dreamscaper_terms_accept( $uid, $how ) {
	if ( ! $uid ) {
		return;
	}
	$log   = get_user_meta( $uid, 'dscp_terms', true );
	$log   = is_array( $log ) ? $log : array();
	$log[] = array( 'v' => dreamscaper_terms_version(), 'how' => sanitize_key( $how ), 'at' => dreamscaper_now(), 'ip' => isset( $_SERVER['REMOTE_ADDR'] ) ? substr( sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ), 0, 45 ) : '' );
	update_user_meta( $uid, 'dscp_terms', array_slice( $log, -20 ) );
	update_user_meta( $uid, 'dscp_terms_v', dreamscaper_terms_version() );
}

add_action( 'rest_api_init', function () {
	register_rest_route( 'dreamscaper/v1', '/terms/accept', array(
		'methods'             => 'POST',
		'permission_callback' => '__return_true',
		'callback'            => function ( WP_REST_Request $r ) {
			$uid = get_current_user_id();
			if ( $uid ) {
				dreamscaper_terms_accept( $uid, 'notice' );
			}
			return array( 'ok' => true, 'v' => dreamscaper_terms_version() );
		},
	) );
} );

/** For the app: where the terms are, their version, and whether this person already accepted them. */
function dreamscaper_terms_public( $uid = 0 ) {
	return array(
		'url'      => dreamscaper_terms_url(),
		'v'        => dreamscaper_terms_version(),
		'accepted' => $uid ? get_user_meta( $uid, 'dscp_terms_v', true ) === dreamscaper_terms_version() : false,
	);
}

/* --------------------------------------------------------- admin editor */

add_action( 'admin_menu', function () {
	add_options_page( 'DreamScaper Terms', 'DreamScaper Terms', 'manage_options', 'dreamscaper-terms', 'dreamscaper_terms_admin' );
}, 22 );
add_action( 'admin_post_dreamscaper_terms', function () {
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( 'Not allowed.' );
	}
	check_admin_referer( 'dreamscaper_terms' );
	$t = isset( $_POST['terms'] ) ? sanitize_textarea_field( wp_unslash( $_POST['terms'] ) ) : '';
	if ( ! empty( $_POST['reset'] ) ) {
		$t = '';
	}
	update_option( 'dreamscaper_terms', $t, false );
	update_option( 'dreamscaper_terms_updated', time(), false );
	wp_safe_redirect( admin_url( 'options-general.php?page=dreamscaper-terms&done=1' ) );
	exit;
} );
function dreamscaper_terms_admin() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	echo '<div class="wrap"><h1>DreamScaper Terms of Service</h1>';
	if ( ! empty( $_GET['done'] ) ) { // phpcs:ignore
		echo '<div class="notice notice-success"><p>Saved. Everyone will see the “Terms updated” notice the next time they use the app.</p></div>';
	}
	echo '<p style="max-width:900px">These terms are shown on <a href="' . esc_url( dreamscaper_terms_url() ) . '" target="_blank">your Terms of Service page</a> and linked from every screen of DreamScaper. Visitors see “By continuing to use this website you agree to the Terms of Service”; people creating an account or applying as a contractor also tick a box, and each acceptance is recorded with the version and time. <strong>Have your attorney review any changes.</strong> Formatting: <code>## Heading</code>, <code>- bullet</code>, blank line between paragraphs, <code>{brand}</code> for your business name.</p>';
	echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
	wp_nonce_field( 'dreamscaper_terms' );
	echo '<input type="hidden" name="action" value="dreamscaper_terms"><textarea name="terms" rows="40" style="width:100%;max-width:1100px;font-family:monospace">' . esc_textarea( dreamscaper_terms_text() ) . '</textarea>';
	submit_button( 'Save terms' );
	echo '<label><input type="checkbox" name="reset" value="1"> Reset to the DreamScaper default text</label></form></div>';
}

/** The default terms. Plain text with ## headings and - bullets. */
function dreamscaper_terms_default() {
	return <<<'TXT'
## 1. Agreement
These Terms of Service ("Terms") govern your use of this website and the DreamScaper app operated by {brand} ("we", "us"). By continuing to use this website — browsing, designing, creating an account, requesting quotes, applying for jobs, or using any contractor tools — you agree to all of these Terms and to our Privacy Policy. If you do not agree, please stop using the website.

We may update these Terms. When we do, we will show a notice in the app and change the "Last updated" date. Continuing to use the website after an update means you accept the updated Terms.

## 2. Who can use the website
- You must be at least 18 years old, or use the website with a parent or guardian.
- You are responsible for your account and for keeping your password safe.
- Information you give us (name, contact details, property address, business details) must be accurate.

## 3. Homeowners and members
- Designs, AI pictures, measurements and quantities are illustrations and estimates. They are not surveys, engineering plans or guarantees of what a finished project will look like or cost.
- When you request quotes, the contractors you choose receive the details and photos you share in your request.
- Contractors are independent businesses. We do not employ them and are not a party to agreements between you and a contractor. Check licenses, insurance and references before you hire. A "Verified" badge means only the specific checks described on the badge were completed on the date shown.
- Reviews must be honest and about your own experience.

## 4. Contractors
- Contractor accounts are approved at our discretion. Contractor tools are for running your own business lawfully.
- Subscriptions, free trials, plan limits, and what happens if a payment fails (including temporary restrictions, read-only access and suspension) are described on the Plan & billing screen and form part of these Terms. Your records are not deleted because of a failed payment; deletion follows our published retention policy.
- You are responsible for your quotes, contracts, pricing, taxes, licenses, permits, insurance and the work you perform, and for complying with all laws that apply to your business, including consumer-protection, home-improvement, solicitation, employment and privacy laws.
- Customer payments are processed by Stripe. Processing rates (shown in the Contractor Hub) are deducted from each payment: cards, bank (ACH) payments and Instant Payouts each have their own rate. Bank payments take several business days to clear and can be returned.
- Identity and business verification is performed with third-party providers (such as Stripe Identity and public licensing records). You consent to those checks when you start verification.

## 5. Contractor-only information about customers
- Approved contractors can record factual events about customers they have worked with — for example unpaid or late invoices, last-minute cancellations, no-shows, and reversed payments — and other approved contractors who are dealing with the same customer may see those records. These records are tied to real jobs, payments or appointments in DreamScaper and expire after 24 months.
- This information is confidential and for contractors' business decisions only. Contractors must not share it with customers or anyone else, must not record false or misleading information, and must not use it to harass, discriminate against or retaliate against anyone. Disclosing, misusing or falsifying this information is grounds for immediate suspension or termination of the contractor's account.
- Customers have the right to ask what information we hold about them and to dispute it. Disputed records are hidden while we review them.

## 6. Hiring, job applications and employee records
- Job postings must be for real positions and must comply with employment laws, including fair-hiring and anti-discrimination laws. Application questions about criminal history, age, disability, religion and other protected characteristics are not allowed.
- Résumés and applications are shared only with the businesses you apply to. You can withdraw an application at any time.
- Employers can keep private notes about their own applicants and employees; those notes are never shared with other employers.
- If you choose to share your DreamScaper work history as a reference, previous employers' factual records (dates worked, role, eligible for rehire) are shown to the employers you apply to. You can see these references, dispute them, and withdraw your consent at any time. Employers must only record truthful, factual statements. Misuse is grounds for termination of the employer's account.

## 7. Door-to-door canvassing tools
- Contractors who use the door-to-door map must follow local solicitation and permit rules, respect "No Soliciting" signs and requests not to return, and record only information needed to follow up or to avoid returning.

## 8. Messages, alerts and texts
- By giving us your phone number you agree to receive account and appointment messages. Text STOP to opt out of texts and START to opt back in. Message and data rates may apply.

## 9. Your content
- You keep ownership of the photos, designs and information you upload. You give us permission to store and display them to provide the service, and — only if you choose to share them publicly (for example in the community or on a contractor's gallery) — to show them to others.
- Do not upload anything you don't have the right to share, or anything unlawful, hateful, harassing or that invades someone's privacy.

## 10. Acceptable use
- No scraping, spamming, reverse engineering, attempts to get around plan limits or free-trial rules, or creating multiple accounts to obtain extra trials.
- We may suspend or close accounts that break these Terms.

## 11. Disclaimers and limits of liability
- The website is provided "as is". To the fullest extent the law allows, we disclaim all warranties, and we are not liable for indirect, incidental or consequential losses, or for the acts, work or payments of contractors, customers or job applicants.
- Our total liability for any claim is limited to the amount you paid us in the 12 months before the claim.

## 12. General
- These Terms are governed by the laws of the state where {brand} is located, except where the law of your state requires otherwise.
- If part of these Terms can't be enforced, the rest still applies.
- Questions? Contact {brand} through the website.
TXT;
}

<?php
/**
 * DreamScaper – Messages & alerts: every automatic message a contractor's customers receive,
 * and every alert the contractor receives, is a template the contractor can rewrite.
 *
 *  - On/off and channels (email, text, in-app) per message.
 *  - Email subject + email body + a separate short text body.
 *  - Merge tags: {customer_first_name}, {{job_name}}, {appointment_date}, {customer_first_name|there} …
 *    Case-insensitive, single or double braces, optional fallback after "|".
 *  - Live preview, test send, reset to default.
 *
 * dreamscaper_tpl_send() is the one function the rest of the plugin calls to send any of them.
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/* ------------------------------------------------------------------ catalog */

/**
 * Every template. aud: who receives it. ch: default channels. timing: settings shown next to it.
 * thread: also post it into the project's message thread (customer messages only).
 */
function dreamscaper_tpl_catalog() {
	static $c = null;
	if ( null !== $c ) {
		return $c;
	}
	$c = array(
		/* ---- customer: requests ---- */
		'request_received'  => array(
			'aud' => 'customer', 'group' => 'Requests', 'label' => 'Request received (auto-reply)',
			'when' => 'Right after a homeowner sends you a quote request. Posted in your message thread with them and emailed.',
			'ch' => array( 'email', 'inapp' ), 'thread' => true,
			'subject' => 'We got your request, {customer_first_name}',
			'email' => "Hi {customer_first_name|there},\n\nThanks for reaching out to {company_name} about {job_name}. We’ve received your photos and project details and will get back to you within one business day — usually sooner.\n\nIf anything changes, just reply here.\n\n{contractor_name}\n{company_name} · {contractor_phone}",
			'sms' => 'Hi {customer_first_name|there}, {company_name} got your request for {job_name}. We’ll be in touch within 1 business day.',
		),
		'missing_info'      => array(
			'aud' => 'customer', 'group' => 'Requests', 'label' => 'Ask for missing details',
			'when' => 'When you tap “Ask for what’s missing” on a request. The list of missing items is filled in for you.',
			'ch' => array( 'email', 'inapp' ), 'thread' => true,
			'subject' => 'A few more details for {job_name}',
			'email' => "Hi {customer_first_name|there},\n\nTo give you an accurate price for {job_name}, could you add:\n\n{missing_items}\n\nYou can add them right in your DreamScaper project: {portal_link}\n\nThank you!\n{contractor_name}",
			'sms' => 'Hi {customer_first_name|there}, to price {job_name} accurately we need: {missing_items}. Add them here: {portal_link}',
		),
		/* ---- customer: appointments ---- */
		'appt_booked'       => array(
			'aud' => 'customer', 'group' => 'Appointments', 'label' => 'Appointment booked',
			'when' => 'When you add an appointment for a customer (and “Tell the customer” is on). It also goes on their DreamScaper calendar automatically.',
			'ch' => array( 'email', 'sms', 'inapp' ), 'thread' => true,
			'subject' => '{appointment_type} booked: {appointment_day}, {appointment_date} at {appointment_time}',
			'email' => "Hi {customer_first_name|there},\n\nYou’re booked with {company_name}:\n\n{appointment_type} — {job_name}\n{appointment_day}, {appointment_date}, {appointment_time}–{appointment_end_time}\n{appointment_location}\n\nAdd it to your calendar: {calendar_link}\nConfirm or ask to reschedule: {portal_link}\n\nSee you then!\n{contractor_name} · {contractor_phone}",
			'sms' => '{company_name}: {appointment_type} booked {appointment_day} {appointment_date} at {appointment_time}. Confirm or reschedule: {portal_link}',
		),
		'appt_changed'      => array(
			'aud' => 'customer', 'group' => 'Appointments', 'label' => 'Appointment changed',
			'when' => 'When you move an appointment to a different day or time.',
			'ch' => array( 'email', 'sms', 'inapp' ), 'thread' => true,
			'subject' => 'New time: {appointment_type} on {appointment_day}, {appointment_date}',
			'email' => "Hi {customer_first_name|there},\n\nYour {appointment_type} for {job_name} has moved to:\n\n{appointment_day}, {appointment_date}, {appointment_time}–{appointment_end_time}\n\nYour DreamScaper calendar is already updated. If the new time doesn’t work, let us know here: {portal_link}\n\n{contractor_name} · {contractor_phone}",
			'sms' => '{company_name}: your {appointment_type} moved to {appointment_day} {appointment_date} at {appointment_time}. Questions? {portal_link}',
		),
		'appt_cancelled'    => array(
			'aud' => 'customer', 'group' => 'Appointments', 'label' => 'Appointment cancelled',
			'when' => 'When you cancel or delete an upcoming appointment.',
			'ch' => array( 'email', 'sms', 'inapp' ), 'thread' => true,
			'subject' => 'Cancelled: {appointment_type} on {appointment_date}',
			'email' => "Hi {customer_first_name|there},\n\nWe’ve cancelled the {appointment_type} for {job_name} on {appointment_day}, {appointment_date} at {appointment_time}. We’ll be in touch to find a new time.\n\n{contractor_name} · {contractor_phone}",
			'sms' => '{company_name}: the {appointment_type} on {appointment_date} at {appointment_time} is cancelled. We’ll reach out to reschedule.',
		),
		'appt_reminder'     => array(
			'aud' => 'customer', 'group' => 'Appointments', 'label' => 'Appointment reminder',
			'when' => 'Sent on your reminder schedule (Settings → Reminders): as many reminders as you like, each so many minutes, hours or days before.',
			'ch' => array( 'email', 'sms' ), 'thread' => false, 'timing' => 'reminders',
			'subject' => 'Reminder: {appointment_type} {appointment_when}',
			'email' => "Hi {customer_first_name|there},\n\nA friendly reminder that {company_name} is scheduled for your {appointment_type} ({job_name}) {appointment_when}: {appointment_day}, {appointment_date} at {appointment_time}.\n\n{appointment_location}\n\nNeed to change it? {portal_link}\n\n{contractor_name} · {contractor_phone}",
			'sms' => 'Reminder: {company_name} {appointment_type} {appointment_when}, {appointment_day} {appointment_date} at {appointment_time}. Need to change it? {portal_link}',
		),
		'on_the_way'        => array(
			'aud' => 'customer', 'group' => 'Appointments', 'label' => 'On our way',
			'when' => 'When you or your crew tap “On our way” on an appointment.',
			'ch' => array( 'sms', 'inapp' ), 'thread' => true,
			'subject' => '{company_name} is on the way',
			'email' => "Hi {customer_first_name|there},\n\n{crew_names|Our crew} is on the way to {property_address} for {job_name}. See you shortly!\n\n{company_name} · {contractor_phone}",
			'sms' => 'Hi {customer_first_name|there}, {crew_names|our crew} from {company_name} is on the way for {job_name}!',
		),
		/* ---- customer: jobs & payments ---- */
		'job_complete'      => array(
			'aud' => 'customer', 'group' => 'Jobs & payments', 'label' => 'Job complete',
			'when' => 'When you mark a job Done.',
			'ch' => array( 'email', 'inapp' ), 'thread' => true,
			'subject' => '{job_name} is complete!',
			'email' => "Hi {customer_first_name|there},\n\nWe’ve finished {job_name} at {property_address}. Thank you for choosing {company_name}!\n\nIf anything isn’t right, reply here and we’ll take care of it.\n\n{contractor_name} · {contractor_phone}",
			'sms' => '{company_name}: {job_name} is complete! Thank you. Anything not right? Reply here.',
		),
		'invoice_sent'      => array(
			'aud' => 'customer', 'group' => 'Jobs & payments', 'label' => 'Invoice sent',
			'when' => 'When you send an invoice, and when a recurring invoice goes out. Includes a View & pay button.',
			'ch' => array( 'email', 'inapp' ), 'thread' => true,
			'subject' => 'Invoice {invoice_number} from {company_name}',
			'email' => "Hi {customer_first_name|there},\n\nHere is invoice {invoice_number} for {invoice_title}: {invoice_amount}, due {invoice_due_date|on receipt}.\n\nYou can view it and pay securely online.\n\nThank you!\n{contractor_name}",
			'sms' => '{company_name} invoice {invoice_number}: {invoice_amount}, due {invoice_due_date|on receipt}. View & pay: {invoice_link}',
		),
		'invoice_overdue'   => array(
			'aud' => 'customer', 'group' => 'Jobs & payments', 'label' => 'Invoice overdue nudge',
			'when' => 'Automatically after an invoice passes its due date, on the timing below.',
			'ch' => array( 'email' ), 'thread' => false, 'timing' => 'overdue', 'off' => true,
			'subject' => 'Friendly reminder: invoice {invoice_number} is past due',
			'email' => "Hi {customer_first_name|there},\n\nJust a friendly reminder that invoice {invoice_number} for {invoice_title} ({invoice_amount}) was due {invoice_due_date}. If you’ve already paid, thank you — please ignore this.\n\n{contractor_name} · {contractor_phone}",
			'sms' => 'Friendly reminder from {company_name}: invoice {invoice_number} ({invoice_amount}) was due {invoice_due_date}. Pay here: {invoice_link}',
		),
		'payment_received'  => array(
			'aud' => 'customer', 'group' => 'Jobs & payments', 'label' => 'Payment received (receipt)',
			'when' => 'When a customer pays an invoice online.',
			'ch' => array( 'email', 'inapp' ), 'thread' => true,
			'subject' => 'Thank you — payment received for {invoice_number}',
			'email' => "Hi {customer_first_name|there},\n\nWe received your payment of {amount_paid} for invoice {invoice_number} ({invoice_title}). Thank you!\n\n{contractor_name}\n{company_name}",
			'sms' => '{company_name}: we received your {amount_paid} payment for {invoice_number}. Thank you!',
		),
		'review_request'    => array(
			'aud' => 'customer', 'group' => 'Jobs & payments', 'label' => 'Review request',
			'when' => 'Automatically after a job is marked Done, on the delay below. Never sent if the job was cancelled.',
			'ch' => array( 'email', 'inapp' ), 'thread' => false, 'timing' => 'review',
			'subject' => 'How did we do on {job_name}?',
			'email' => "Hi {customer_first_name|there},\n\nWe hope you’re enjoying your yard! Would you take a minute to tell others how {job_name} turned out? Your review means a lot to a small business like ours.\n\nLeave a review: {review_link}\n\nThank you!\n{contractor_name}",
			'sms' => 'Hi {customer_first_name|there}, how did {company_name} do on {job_name}? A quick review means a lot: {review_link}',
		),
		'new_message'       => array(
			'aud' => 'customer', 'group' => 'Messages', 'label' => 'New message alert (to customer)',
			'when' => 'When you message a customer and they haven’t read it yet. At most one email per conversation every 15 minutes.',
			'ch' => array( 'email' ), 'thread' => false,
			'subject' => 'New message from {company_name}',
			'email' => "Hi {customer_first_name|there},\n\n{sender_name} sent you a message about {job_name}:\n\n“{message_preview}”\n\nReply here: {portal_link}",
			'sms' => 'New message from {company_name}: “{message_preview}” Reply: {portal_link}',
		),
		/* ---- alerts to the contractor ---- */
		'alert_new_request' => array(
			'aud' => 'pro', 'group' => 'Alerts to you', 'label' => 'New quote request',
			'when' => 'When a homeowner sends you a request.',
			'ch' => array( 'email', 'sms', 'inapp' ),
			'subject' => '📥 New request: {job_name} from {customer_name}',
			'email' => "{customer_name} sent you a quote request for {job_name}.\n\nServices: {services_requested}\nAddress: {property_address}\nBudget: {budget}\nTiming: {timing}\nBrief completeness: {brief_score}%\n\nPhone: {customer_phone}\nEmail: {customer_email}\n\nOpen it in your Contractor Hub to reply, book a site visit or start the estimate.",
			'sms' => 'DreamScaper: new request from {customer_name} — {job_name} ({services_requested}), {property_address}. Open your Hub to reply.',
		),
		'alert_new_message' => array(
			'aud' => 'pro', 'group' => 'Alerts to you', 'label' => 'New message from a customer',
			'when' => 'When a customer messages you. At most one email per conversation every 15 minutes.',
			'ch' => array( 'email', 'inapp' ),
			'subject' => '💬 {sender_name}: {message_preview}',
			'email' => "{sender_name} sent you a message about {job_name}:\n\n“{message_preview}”\n\nReply in your Contractor Hub → Inbox.",
			'sms' => 'DreamScaper: {sender_name} messaged you about {job_name}: “{message_preview}”',
		),
		'alert_quote_viewed' => array(
			'aud' => 'pro', 'group' => 'Alerts to you', 'label' => 'Proposal viewed',
			'when' => 'The first time a customer opens a proposal you sent.',
			'ch' => array( 'email', 'inapp' ),
			'subject' => '👀 Viewed: {job_name}',
			'email' => "{customer_name} just opened proposal {quote_number} ({job_name}, {quote_total}). A quick call now is often well-timed: {customer_phone}",
			'sms' => 'DreamScaper: {customer_name} just opened your {job_name} proposal ({quote_total}). Call: {customer_phone}',
		),
		'alert_quote_signed' => array(
			'aud' => 'pro', 'group' => 'Alerts to you', 'label' => 'Proposal signed',
			'when' => 'When a customer signs a proposal.',
			'ch' => array( 'email', 'sms', 'inapp' ),
			'subject' => '🎉 Signed! {job_name} ({quote_total})',
			'email' => "{customer_name} signed {quote_number} {job_name} for {quote_total}.\n\nSchedule the job from your Contractor Hub → Jobs.",
			'sms' => 'DreamScaper: 🎉 {customer_name} signed {job_name} ({quote_total})!',
		),
		'alert_payment'     => array(
			'aud' => 'pro', 'group' => 'Alerts to you', 'label' => 'Payment received',
			'when' => 'When a customer pays an invoice online.',
			'ch' => array( 'email', 'inapp' ),
			'subject' => '💰 Payment received: {invoice_number} ({amount_paid})',
			'email' => "{customer_name} paid invoice {invoice_number} ({invoice_title}): {amount_paid}, by card through Stripe.",
			'sms' => 'DreamScaper: {customer_name} paid {invoice_number}, {amount_paid}.',
		),
		'alert_appt_response' => array(
			'aud' => 'pro', 'group' => 'Alerts to you', 'label' => 'Customer confirmed / asked to reschedule',
			'when' => 'When a customer confirms an appointment or asks for a different time.',
			'ch' => array( 'email', 'sms', 'inapp' ),
			'subject' => '{customer_name} {customer_response}: {appointment_type} {appointment_date}',
			'email' => "{customer_name} {customer_response} the {appointment_type} for {job_name} on {appointment_day}, {appointment_date} at {appointment_time}.\n\n{customer_note}\n\nOpen your Contractor Hub → Schedule.",
			'sms' => 'DreamScaper: {customer_name} {customer_response} {appointment_type} {appointment_date} {appointment_time}. {customer_note}',
		),
		'alert_appt_reminder' => array(
			'aud' => 'pro', 'group' => 'Alerts to you', 'label' => 'Your appointment reminder',
			'when' => 'Reminders to you (and your crew) on your own reminder schedule.',
			'ch' => array( 'inapp', 'email' ), 'timing' => 'pro_reminders',
			'subject' => '⏰ {appointment_when}: {appointment_type} — {customer_name}',
			'email' => "{appointment_type} {appointment_when}: {job_name}\n{appointment_day}, {appointment_date}, {appointment_time}–{appointment_end_time}\n{customer_name} · {customer_phone}\n{appointment_location}\nMap: {map_link}\nCrew: {crew_names}",
			'sms' => '⏰ {appointment_when}: {appointment_type} {customer_name} {appointment_time}, {appointment_location}',
		),
	);
	return $c;
}

/** Every merge tag: [label, sample, group]. */
function dreamscaper_tpl_tags() {
	return array(
		'customer_name'        => array( 'Customer’s full name', 'Jane Smith', 'Customer' ),
		'customer_first_name'  => array( 'Customer’s first name', 'Jane', 'Customer' ),
		'customer_last_name'   => array( 'Customer’s last name', 'Smith', 'Customer' ),
		'customer_email'       => array( 'Customer’s email', 'jane@example.com', 'Customer' ),
		'customer_phone'       => array( 'Customer’s phone', '(860) 555-0101', 'Customer' ),
		'customer_address'     => array( 'Customer’s address', '12 Maple Ave, Farmington, CT', 'Customer' ),
		'customer_town'        => array( 'Customer’s town', 'Farmington', 'Customer' ),
		'property_address'     => array( 'Job / property address', '12 Maple Ave, Farmington, CT', 'Customer' ),
		'job_name'             => array( 'Job / project name', 'Front Yard Renovation', 'Job' ),
		'services_requested'   => array( 'Services they asked for', 'Planting, Mulch & stone', 'Job' ),
		'budget'               => array( 'Their budget', '$5,000 – $10,000', 'Job' ),
		'timing'               => array( 'When they want it done', 'Within a month', 'Job' ),
		'brief_score'          => array( 'How complete their request is (%)', '86', 'Job' ),
		'missing_items'        => array( 'What’s missing from their request', '• A photo of the backyard', 'Job' ),
		'quote_number'         => array( 'Quote number', 'Q-1042', 'Quote' ),
		'quote_total'          => array( 'Quote total', '$8,450', 'Quote' ),
		'deposit_amount'       => array( 'Deposit amount', '$2,535', 'Quote' ),
		'quote_link'           => array( 'Link to view & sign the proposal', 'https://…', 'Quote' ),
		'valid_until'          => array( 'Quote good until', 'June 30', 'Quote' ),
		'appointment_type'     => array( 'Appointment type', 'Site visit', 'Appointment' ),
		'appointment_title'    => array( 'Appointment title', 'Front yard – site visit', 'Appointment' ),
		'appointment_date'     => array( 'Appointment date', 'May 14', 'Appointment' ),
		'appointment_day'      => array( 'Day of the week', 'Tuesday', 'Appointment' ),
		'appointment_time'     => array( 'Start time', '9:00 am', 'Appointment' ),
		'appointment_end_time' => array( 'End time', '10:00 am', 'Appointment' ),
		'appointment_when'     => array( 'How soon (tomorrow, in 2 hours…)', 'tomorrow', 'Appointment' ),
		'appointment_location' => array( 'Where', '12 Maple Ave, Farmington, CT', 'Appointment' ),
		'crew_names'           => array( 'Crew', 'Mike and Luis', 'Appointment' ),
		'map_link'             => array( 'Map / directions link', 'https://maps.google.com/?q=…', 'Appointment' ),
		'calendar_link'        => array( 'Add-to-calendar link', 'https://…', 'Appointment' ),
		'customer_response'    => array( 'confirmed / asked to reschedule', 'confirmed', 'Appointment' ),
		'customer_note'        => array( 'Customer’s note', 'Thursday afternoon works better.', 'Appointment' ),
		'invoice_number'       => array( 'Invoice number', 'INV-1007', 'Invoice' ),
		'invoice_title'        => array( 'Invoice title', 'Front Yard Renovation – Deposit', 'Invoice' ),
		'invoice_amount'       => array( 'Invoice amount', '$2,535.00', 'Invoice' ),
		'invoice_due_date'     => array( 'Invoice due date', 'May 21', 'Invoice' ),
		'invoice_link'         => array( 'Link to view & pay', 'https://…', 'Invoice' ),
		'amount_paid'          => array( 'Amount paid', '$2,535.00', 'Invoice' ),
		'review_link'          => array( 'Link to leave a review', 'https://…', 'Links' ),
		'portal_link'          => array( 'Link to their DreamScaper project', 'https://…', 'Links' ),
		'sender_name'          => array( 'Who sent the message', 'Jane Smith', 'Message' ),
		'message_preview'      => array( 'The message (first 160 characters)', 'Can you come Thursday instead?', 'Message' ),
		'company_name'         => array( 'Your business name', 'Green Thumb Landscaping', 'You' ),
		'contractor_name'      => array( 'Your name', 'Bob Green', 'You' ),
		'contractor_phone'     => array( 'Your phone', '(860) 555-0199', 'You' ),
		'contractor_email'     => array( 'Your email', 'bob@example.com', 'You' ),
		'contractor_website'   => array( 'Your website', 'greenthumb.example', 'You' ),
		'today'                => array( 'Today’s date', 'May 12', 'Dates' ),
		'month'                => array( 'This month', 'May', 'Dates' ),
		'year'                 => array( 'This year', '2026', 'Dates' ),
	);
}

/** Default timing settings for templates that have them. */
function dreamscaper_tpl_timing_defaults() {
	return array(
		'overdue' => array( 'after_days' => 3, 'every_days' => 7, 'max' => 3 ),
		'review'  => array( 'after_days' => 3 ),
	);
}

/* ------------------------------------------------------------ resolution */

/** A template with the contractor's changes applied. */
function dreamscaper_tpl_get( $p, $key ) {
	$cat = dreamscaper_tpl_catalog();
	if ( ! isset( $cat[ $key ] ) ) {
		return null;
	}
	$d   = $cat[ $key ];
	$s   = $p ? dreamscaper_pro_settings( $p ) : array();
	$o   = isset( $s['templates'][ $key ] ) && is_array( $s['templates'][ $key ] ) ? $s['templates'][ $key ] : array();
	$out = array(
		'key'      => $key,
		'aud'      => $d['aud'],
		'group'    => $d['group'],
		'label'    => $d['label'],
		'when'     => $d['when'],
		'thread'   => ! empty( $d['thread'] ),
		'timing'   => isset( $d['timing'] ) ? $d['timing'] : '',
		'on'       => isset( $o['on'] ) ? (bool) $o['on'] : empty( $d['off'] ),
		'channels' => isset( $o['channels'] ) && is_array( $o['channels'] ) ? array_values( array_intersect( array( 'email', 'sms', 'inapp' ), $o['channels'] ) ) : $d['ch'],
		'subject'  => isset( $o['subject'] ) ? (string) $o['subject'] : $d['subject'],
		'email'    => isset( $o['email'] ) ? (string) $o['email'] : $d['email'],
		'sms'      => isset( $o['sms'] ) ? (string) $o['sms'] : $d['sms'],
		'custom'   => ! empty( $o ),
	);
	$td = dreamscaper_tpl_timing_defaults();
	if ( $out['timing'] && isset( $td[ $out['timing'] ] ) ) {
		$t              = isset( $s['tpl_timing'][ $out['timing'] ] ) && is_array( $s['tpl_timing'][ $out['timing'] ] ) ? $s['tpl_timing'][ $out['timing'] ] : array();
		$out['timingv'] = array_map( 'intval', wp_parse_args( $t, $td[ $out['timing'] ] ) );
	}
	return $out;
}

/**
 * Fill merge tags. {tag}, {{tag}}, {tag|fallback}. Case-insensitive.
 * $strict false (preview): unknown/empty tags stay visible. true (sending): empty tags vanish.
 */
function dreamscaper_tpl_render( $text, $codes, $strict = true ) {
	$codes = array_change_key_case( (array) $codes, CASE_LOWER );
	$out   = preg_replace_callback( '/\{\{?\s*([a-z_]+)\s*(?:\|([^{}]*))?\}?\}/i', function ( $m ) use ( $codes, $strict ) {
		$k = strtolower( $m[1] );
		if ( isset( $codes[ $k ] ) && '' !== (string) $codes[ $k ] ) {
			return (string) $codes[ $k ];
		}
		if ( isset( $m[2] ) && '' !== $m[2] ) {
			return $m[2];
		}
		return $strict ? '' : $m[0];
	}, (string) $text );
	if ( $strict ) {
		$out = preg_replace( array( '/[ \t]{2,}/', '/ ([,.!?])/', '/\(\s*\)/', '/^[ \t]*[·,–-][ \t]*$/m', "/\n{3,}/" ), array( ' ', '$1', '', '', "\n\n" ), $out );
	}
	return trim( $out );
}

/** Tags a text uses that would come out empty (for warnings). */
function dreamscaper_tpl_empty_tags( $text, $codes ) {
	$codes = array_change_key_case( (array) $codes, CASE_LOWER );
	$out   = array();
	if ( preg_match_all( '/\{\{?\s*([a-z_]+)\s*(\|[^{}]*)?\}?\}/i', (string) $text, $mm, PREG_SET_ORDER ) ) {
		foreach ( $mm as $m ) {
			$k = strtolower( $m[1] );
			if ( empty( $m[2] ) && ( ! isset( $codes[ $k ] ) || '' === (string) $codes[ $k ] ) ) {
				$out[] = $k;
			}
		}
	}
	return array_values( array_unique( $out ) );
}

/* ---------------------------------------------------------------- context */

function dreamscaper_tpl_money( $v, $cents = false ) {
	return '$' . number_format( (float) $v, $cents ? 2 : 0 );
}

/** Words for "how soon" an appointment is, from the moment of sending. */
function dreamscaper_tpl_when( $start_ts, $now = null ) {
	$now  = $now ? $now : time();
	$mins = (int) round( ( $start_ts - $now ) / 60 );
	if ( $mins < 0 ) {
		return 'now';
	}
	if ( $mins < 90 ) {
		return 'in ' . max( 1, $mins ) . ' minutes';
	}
	$day_now = wp_date( 'Y-m-d', $now );
	$day_s   = wp_date( 'Y-m-d', $start_ts );
	if ( $day_now === $day_s ) {
		$h = (int) round( $mins / 60 );
		return 'in ' . $h . ' hour' . ( 1 === $h ? '' : 's' ) . ', today';
	}
	if ( wp_date( 'Y-m-d', $now + DAY_IN_SECONDS ) === $day_s ) {
		return 'tomorrow';
	}
	$d = (int) round( ( strtotime( $day_s ) - strtotime( $day_now ) ) / DAY_IN_SECONDS );
	return $d < 7 ? 'this ' . wp_date( 'l', $start_ts ) : 'in ' . $d . ' days';
}

/** Appointment type labels. */
function dreamscaper_visit_kinds() {
	return array( 'consult' => 'Consultation', 'site_visit' => 'Site visit', 'estimate' => 'Estimate walk-through', 'job' => 'Job day', 'maintenance' => 'Maintenance visit', 'followup' => 'Follow-up visit', 'meeting' => 'Meeting', 'other' => 'Appointment' );
}

/**
 * Every tag value available for one send.
 * $ctx: client, quote, visit, invoice, prop (row objects), extra (array of code => value).
 */
function dreamscaper_tpl_context( $p, $ctx = array() ) {
	$c     = isset( $ctx['client'] ) ? $ctx['client'] : null;
	$q     = isset( $ctx['quote'] ) ? $ctx['quote'] : null;
	$v     = isset( $ctx['visit'] ) ? $ctx['visit'] : null;
	$inv   = isset( $ctx['invoice'] ) ? $ctx['invoice'] : null;
	$prop  = isset( $ctx['prop'] ) ? $ctx['prop'] : null;
	if ( ! $q && $v && $v->quote_id ) {
		$q = dreamscaper_crm_get( 'quotes', $v->quote_id, $p->user_id );
	}
	if ( ! $q && $inv && $inv->quote_id ) {
		$q = dreamscaper_crm_get( 'quotes', $inv->quote_id, $p->user_id );
	}
	if ( ! $c ) {
		$cid = $q ? $q->client_id : ( $v ? $v->client_id : ( $inv ? $inv->client_id : 0 ) );
		$c   = $cid ? dreamscaper_crm_get( 'clients', $cid, $p->user_id ) : null;
	}
	if ( ! $prop && $q && $q->prop_id ) {
		$prop = dreamscaper_crm_get( 'props', $q->prop_id, $p->user_id );
	}
	$codes = array(
		'company_name'       => $p->business,
		'contractor_name'    => $p->contact ? $p->contact : $p->business,
		'contractor_phone'   => $p->phone,
		'contractor_email'   => $p->email,
		'contractor_website' => preg_replace( '#^https?://#', '', (string) $p->website ),
		'today'              => wp_date( 'F j' ),
		'month'              => wp_date( 'F' ),
		'year'               => wp_date( 'Y' ),
		'portal_link'        => dreamscaper_app_url( array( 'ds_projects' => 1 ) ),
		'review_link'        => dreamscaper_app_url( array( 'ds_projects' => 1, 'ds_review' => $q ? (int) $q->id : 0 ) ),
	);
	if ( $q ) {
		$codes = array_merge( dreamscaper_crm_codes( $q, $c, $p ), $codes );
		$codes['job_name'] = $q->title;
		$des = dreamscaper_json( $q->design );
		$brief = isset( $des['brief'] ) && is_array( $des['brief'] ) ? $des['brief'] : array();
		$codes['services_requested'] = ! empty( $brief['services'] ) ? implode( ', ', (array) $brief['services'] ) : '';
		$codes['budget']             = ! empty( $brief['budget'] ) ? $brief['budget'] : ( isset( $des['budget'] ) ? $des['budget'] : '' );
		$codes['timing']             = ! empty( $brief['timing']['start'] ) ? $brief['timing']['start'] : ( isset( $des['timing'] ) ? $des['timing'] : '' );
		$codes['brief_score']        = isset( $brief['score'] ) ? (string) (int) $brief['score'] : '';
	}
	if ( $c ) {
		$name  = trim( $c->name );
		$parts = preg_split( '/\s+/', $name );
		$codes['customer_name']       = $name;
		$codes['customer_first_name'] = $parts ? $parts[0] : '';
		$codes['customer_last_name']  = count( $parts ) > 1 ? end( $parts ) : '';
		$codes['customer_email']      = $c->email;
		$codes['customer_phone']      = $c->phone;
		$codes['customer_town']       = $c->town;
		if ( empty( $codes['customer_address'] ) ) {
			$codes['customer_address'] = trim( $c->address . ( $c->town ? ', ' . $c->town : '' ) . ( $c->state ? ', ' . $c->state : '' ), ', ' );
		}
	}
	$codes['property_address'] = $prop && $prop->address ? $prop->address : ( isset( $codes['customer_address'] ) ? $codes['customer_address'] : '' );
	if ( $v ) {
		$st    = strtotime( $v->start . ' UTC' );
		$en    = strtotime( $v->end . ' UTC' );
		$kinds = dreamscaper_visit_kinds();
		$kind  = isset( $v->kind ) && isset( $kinds[ $v->kind ] ) ? $kinds[ $v->kind ] : 'Appointment';
		$loc   = isset( $v->location ) && $v->location ? $v->location : $codes['property_address'];
		$codes = array_merge( $codes, array(
			'appointment_type'     => $kind,
			'appointment_title'    => $v->title,
			'appointment_date'     => wp_date( 'F j', $st ),
			'appointment_day'      => wp_date( 'l', $st ),
			'appointment_time'     => wp_date( 'g:i a', $st ),
			'appointment_end_time' => wp_date( 'g:i a', $en ),
			'appointment_when'     => dreamscaper_tpl_when( $st ),
			'appointment_location' => $loc,
			'map_link'             => $loc ? 'https://maps.google.com/?q=' . rawurlencode( $loc ) : '',
			'crew_names'           => $v->crew,
			'calendar_link'        => ! empty( $v->uid ) ? add_query_arg( 'ds_ics_event', $v->uid, home_url( '/' ) ) : '',
		) );
		if ( empty( $codes['job_name'] ) ) {
			$codes['job_name'] = $v->title;
		}
	}
	if ( $inv ) {
		$codes = array_merge( $codes, array(
			'invoice_number'   => $inv->number,
			'invoice_title'    => $inv->title,
			'invoice_amount'   => dreamscaper_tpl_money( $inv->amount, true ),
			'invoice_due_date' => $inv->due ? wp_date( 'F j', strtotime( $inv->due . ' 12:00:00' ) ) : '',
			'invoice_link'     => dreamscaper_invoice_url( $inv->token ),
			'amount_paid'      => dreamscaper_tpl_money( $inv->amount, true ),
		) );
		if ( empty( $codes['job_name'] ) ) {
			$codes['job_name'] = $inv->title;
		}
	}
	if ( ! empty( $ctx['extra'] ) && is_array( $ctx['extra'] ) ) {
		$codes = array_merge( $codes, $ctx['extra'] );
	}
	return $codes;
}

/** Sample values (for previews): real data from the contractor's newest customer when available. */
function dreamscaper_tpl_sample( $p ) {
	$codes = array();
	foreach ( dreamscaper_tpl_tags() as $k => $t ) {
		$codes[ $k ] = $t[1];
	}
	$codes['company_name']     = $p->business;
	$codes['contractor_name']  = $p->contact ? $p->contact : $p->business;
	$codes['contractor_phone'] = $p->phone;
	$codes['contractor_email'] = $p->email;
	$codes['contractor_website'] = preg_replace( '#^https?://#', '', (string) $p->website );
	$codes['today'] = wp_date( 'F j' );
	$codes['month'] = wp_date( 'F' );
	$codes['year']  = wp_date( 'Y' );
	return $codes;
}

/* ------------------------------------------------------------------- send */

/** Is it inside quiet hours (9 pm – 8 am, site time) for texts? */
function dreamscaper_quiet_now( $p = null ) {
	$s    = $p ? dreamscaper_pro_settings( $p ) : array();
	$from = isset( $s['quiet']['from'] ) ? (int) $s['quiet']['from'] : 21;
	$to   = isset( $s['quiet']['to'] ) ? (int) $s['quiet']['to'] : 8;
	$h    = (int) wp_date( 'G' );
	return $from > $to ? ( $h >= $from || $h < $to ) : ( $h >= $from && $h < $to );
}

/**
 * Send one template.
 * $to: array( email, phone, user_id, name ). For aud=pro templates $to is ignored (the contractor is the recipient).
 * $opts: force (send even if off), link + button (email button), thread_id, channels (override), extra (codes),
 *        subject/email/sms (draft overrides for test sends), quiet (respect quiet hours for texts, default true for pro alerts).
 * Returns array( sent => n, channels => [...], errors => [...] ).
 */
function dreamscaper_tpl_send( $p, $key, $ctx = array(), $to = array(), $opts = array() ) {
	$t = dreamscaper_tpl_get( $p, $key );
	$r = array( 'sent' => 0, 'channels' => array(), 'errors' => array() );
	if ( ! $t || ! $p ) {
		return $r;
	}
	if ( ! $t['on'] && empty( $opts['force'] ) ) {
		return $r;
	}
	if ( empty( $opts['force'] ) && function_exists( 'dreamscaper_sub_can_send' ) && ! dreamscaper_sub_can_send( $p->user_id ) ) {
		$r['errors'][] = 'paused';
		return $r;
	}
	foreach ( array( 'subject', 'email', 'sms' ) as $k ) {
		if ( isset( $opts[ $k ] ) ) {
			$t[ $k ] = (string) $opts[ $k ];
		}
	}
	$codes = isset( $opts['codes'] ) ? $opts['codes'] : dreamscaper_tpl_context( $p, array_merge( $ctx, array( 'extra' => isset( $opts['extra'] ) ? $opts['extra'] : array() ) ) );
	if ( 'pro' === $t['aud'] ) {
		$u  = get_userdata( $p->user_id );
		$to = array( 'email' => is_email( $p->email ) ? $p->email : ( $u ? $u->user_email : '' ), 'phone' => $p->phone, 'user_id' => (int) $p->user_id, 'name' => $p->contact );
	}
	$channels = isset( $opts['channels'] ) ? (array) $opts['channels'] : $t['channels'];
	$can_sms  = dreamscaper_sms_ready() && ( ! function_exists( 'dreamscaper_pro_can' ) || dreamscaper_pro_can( $p->user_id, 'sms' ) );
	$subject  = dreamscaper_tpl_render( $t['subject'], $codes );
	$body     = dreamscaper_tpl_render( $t['email'], $codes );
	$sms      = dreamscaper_tpl_render( $t['sms'], $codes );
	if ( in_array( 'email', $channels, true ) && ! empty( $to['email'] ) && is_email( $to['email'] ) ) {
		$mo = array();
		if ( ! empty( $opts['link'] ) ) {
			$mo['link']   = $opts['link'];
			$mo['button'] = isset( $opts['button'] ) ? $opts['button'] : 'Open';
		}
		if ( 'pro' === $t['aud'] ) {
			$mo['link']   = isset( $opts['link'] ) ? $opts['link'] : dreamscaper_app_url( array( 'ds_hub' => isset( $opts['hub'] ) ? $opts['hub'] : 1 ) );
			$mo['button'] = isset( $opts['button'] ) ? $opts['button'] : 'Open my Contractor Hub';
		}
		$ok = dreamscaper_crm_mail( $p, $to['email'], $subject, $body, $mo );
		if ( true === $ok ) {
			$r['sent']++;
			$r['channels'][] = 'email';
		} else {
			$r['errors'][] = $ok->get_error_message();
		}
	}
	if ( in_array( 'sms', $channels, true ) && ! empty( $to['phone'] ) && $can_sms ) {
		$quiet = isset( $opts['quiet'] ) ? $opts['quiet'] : ( 'pro' === $t['aud'] );
		if ( $quiet && dreamscaper_quiet_now( $p ) ) {
			$r['errors'][] = 'quiet hours';
		} else {
			$ok = dreamscaper_sms( $to['phone'], $sms );
			if ( true === $ok ) {
				$r['sent']++;
				$r['channels'][] = 'sms';
			} else {
				$r['errors'][] = $ok->get_error_message();
			}
		}
	}
	if ( in_array( 'inapp', $channels, true ) && ! empty( $to['user_id'] ) ) {
		global $wpdb;
		$wpdb->insert( dreamscaper_t( 'notes' ), array(
			'user_id' => (int) $to['user_id'], 'type' => 'pro' === $t['aud'] ? 'crm' : 'project', 'actor' => 0,
			'target'  => isset( $opts['target'] ) ? (int) $opts['target'] : 0, 'text' => mb_substr( $subject, 0, 250 ), 'created' => dreamscaper_now(),
		) );
		$r['channels'][] = 'inapp';
		$r['sent']++;
	}
	if ( 'customer' === $t['aud'] && $t['thread'] && ! empty( $opts['thread_id'] ) && function_exists( 'dreamscaper_thread_post' ) ) {
		dreamscaper_thread_post( (int) $opts['thread_id'], (int) $p->user_id, $body, array( 'kind' => 'auto', 'notify' => false, 'ref_type' => isset( $opts['ref_type'] ) ? $opts['ref_type'] : '', 'ref_id' => isset( $opts['ref_id'] ) ? (int) $opts['ref_id'] : 0 ) );
	}
	if ( 'customer' === $t['aud'] && $r['sent'] && ! empty( $ctx['client'] ) ) {
		dreamscaper_crm_log( $p->user_id, $ctx['client']->id, isset( $ctx['quote'] ) && $ctx['quote'] ? $ctx['quote']->id : 0, 'email', $t['label'] . ': ' . $subject . ' (' . implode( ', ', $r['channels'] ) . ')', 0 );
	}
	return $r;
}

/** Customer recipient for a client row. */
function dreamscaper_tpl_to_client( $c ) {
	return $c ? array( 'email' => $c->email, 'phone' => $c->phone, 'user_id' => (int) $c->user_id, 'name' => $c->name ) : array();
}

/* ------------------------------------------------------------------- REST */

add_action( 'rest_api_init', function () {
	$auth = function () {
		return is_user_logged_in();
	};
	foreach ( array(
		array( '/crm/templates', 'GET', 'dreamscaper_rest_templates' ),
		array( '/crm/templates', 'POST', 'dreamscaper_rest_template_save' ),
		array( '/crm/templates/reset', 'POST', 'dreamscaper_rest_template_reset' ),
		array( '/crm/templates/test', 'POST', 'dreamscaper_rest_template_test' ),
		array( '/crm/templates/timing', 'POST', 'dreamscaper_rest_template_timing' ),
	) as $r ) {
		register_rest_route( 'dreamscaper/v1', $r[0], array( 'methods' => $r[1], 'callback' => $r[2], 'permission_callback' => $auth ) );
	}
} );

function dreamscaper_rest_templates() {
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$items = array();
	foreach ( array_keys( dreamscaper_tpl_catalog() ) as $k ) {
		$t            = dreamscaper_tpl_get( $p, $k );
		$d            = dreamscaper_tpl_catalog()[ $k ];
		$t['default'] = array( 'subject' => $d['subject'], 'email' => $d['email'], 'sms' => $d['sms'], 'channels' => $d['ch'] );
		$items[]      = $t;
	}
	$tags = array();
	foreach ( dreamscaper_tpl_tags() as $k => $x ) {
		$tags[] = array( 'tag' => $k, 'label' => $x[0], 'sample' => $x[1], 'group' => $x[2] );
	}
	$s = dreamscaper_pro_settings( $p );
	return array(
		'items'  => $items,
		'tags'   => $tags,
		'sample' => dreamscaper_tpl_sample( $p ),
		'sms'    => (bool) dreamscaper_sms_ready(),
		'sms_plan' => function_exists( 'dreamscaper_pro_can' ) ? dreamscaper_pro_can( $p->user_id, 'sms' ) : true,
		'quiet'  => isset( $s['quiet'] ) ? $s['quiet'] : array( 'from' => 21, 'to' => 8 ),
	);
}

function dreamscaper_rest_template_save( WP_REST_Request $r ) {
	global $wpdb;
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$j   = $r->get_json_params();
	$key = sanitize_key( isset( $j['key'] ) ? $j['key'] : '' );
	if ( '' === $key && isset( $j['quiet'] ) && is_array( $j['quiet'] ) ) {
		$s          = dreamscaper_pro_settings( $p );
		$s['quiet'] = array( 'from' => max( 0, min( 23, (int) $j['quiet']['from'] ) ), 'to' => max( 0, min( 23, (int) $j['quiet']['to'] ) ) );
		$wpdb->update( dreamscaper_t( 'pros' ), array( 'settings' => wp_json_encode( $s ) ), array( 'user_id' => $p->user_id ) );
		return array( 'quiet' => $s['quiet'] );
	}
	if ( ! isset( dreamscaper_tpl_catalog()[ $key ] ) ) {
		return dreamscaper_crm_err( 'Unknown message.' );
	}
	$s = dreamscaper_pro_settings( $p );
	$o = array(
		'on'       => ! empty( $j['on'] ),
		'channels' => array_values( array_intersect( array( 'email', 'sms', 'inapp' ), (array) ( isset( $j['channels'] ) ? $j['channels'] : array() ) ) ),
		'subject'  => mb_substr( sanitize_text_field( isset( $j['subject'] ) ? $j['subject'] : '' ), 0, 200 ),
		'email'    => mb_substr( sanitize_textarea_field( isset( $j['email'] ) ? $j['email'] : '' ), 0, 6000 ),
		'sms'      => mb_substr( sanitize_textarea_field( isset( $j['sms'] ) ? $j['sms'] : '' ), 0, 640 ),
	);
	$s['templates']         = isset( $s['templates'] ) && is_array( $s['templates'] ) ? $s['templates'] : array();
	$s['templates'][ $key ] = $o;
	if ( isset( $j['quiet'] ) && is_array( $j['quiet'] ) ) {
		$s['quiet'] = array( 'from' => max( 0, min( 23, (int) $j['quiet']['from'] ) ), 'to' => max( 0, min( 23, (int) $j['quiet']['to'] ) ) );
	}
	$wpdb->update( dreamscaper_t( 'pros' ), array( 'settings' => wp_json_encode( $s ) ), array( 'user_id' => $p->user_id ) );
	return array( 'item' => dreamscaper_tpl_get( dreamscaper_pro_row( $p->user_id ), $key ) );
}

function dreamscaper_rest_template_reset( WP_REST_Request $r ) {
	global $wpdb;
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$key = sanitize_key( (string) $r->get_param( 'key' ) );
	$s   = dreamscaper_pro_settings( $p );
	unset( $s['templates'][ $key ] );
	$wpdb->update( dreamscaper_t( 'pros' ), array( 'settings' => wp_json_encode( $s ) ), array( 'user_id' => $p->user_id ) );
	return array( 'item' => dreamscaper_tpl_get( dreamscaper_pro_row( $p->user_id ), $key ) );
}

function dreamscaper_rest_template_timing( WP_REST_Request $r ) {
	global $wpdb;
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$j    = $r->get_json_params();
	$kind = sanitize_key( isset( $j['timing'] ) ? $j['timing'] : '' );
	$td   = dreamscaper_tpl_timing_defaults();
	if ( ! isset( $td[ $kind ] ) ) {
		return dreamscaper_crm_err( 'Unknown timing.' );
	}
	$s = dreamscaper_pro_settings( $p );
	$v = array();
	foreach ( $td[ $kind ] as $k => $def ) {
		$v[ $k ] = max( 0, min( 365, (int) ( isset( $j['values'][ $k ] ) ? $j['values'][ $k ] : $def ) ) );
	}
	$s['tpl_timing']          = isset( $s['tpl_timing'] ) && is_array( $s['tpl_timing'] ) ? $s['tpl_timing'] : array();
	$s['tpl_timing'][ $kind ] = $v;
	$wpdb->update( dreamscaper_t( 'pros' ), array( 'settings' => wp_json_encode( $s ) ), array( 'user_id' => $p->user_id ) );
	return array( 'timing' => $v );
}

/** Send a draft (or the saved version) to the contractor themself, filled with sample data. */
function dreamscaper_rest_template_test( WP_REST_Request $r ) {
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	if ( ! dreamscaper_limit( 'tpltest', 20, HOUR_IN_SECONDS ) ) {
		return dreamscaper_crm_err( 'That’s a lot of tests — try again in a little while.', 429 );
	}
	$j   = $r->get_json_params();
	$key = sanitize_key( isset( $j['key'] ) ? $j['key'] : '' );
	if ( ! isset( dreamscaper_tpl_catalog()[ $key ] ) ) {
		return dreamscaper_crm_err( 'Unknown message.' );
	}
	$u   = get_userdata( $p->user_id );
	$to  = array( 'email' => is_email( $p->email ) ? $p->email : $u->user_email, 'phone' => $p->phone, 'user_id' => 0 );
	$chs = array_values( array_intersect( array( 'email', 'sms' ), (array) ( isset( $j['channels'] ) ? $j['channels'] : array( 'email' ) ) ) );
	$res = dreamscaper_tpl_send( $p, $key, array(), $to, array(
		'force'    => true,
		'codes'    => dreamscaper_tpl_sample( $p ),
		'channels' => $chs ? $chs : array( 'email' ),
		'subject'  => '[TEST] ' . sanitize_text_field( isset( $j['subject'] ) ? $j['subject'] : dreamscaper_tpl_get( $p, $key )['subject'] ),
		'email'    => sanitize_textarea_field( isset( $j['email'] ) ? $j['email'] : dreamscaper_tpl_get( $p, $key )['email'] ),
		'sms'      => sanitize_textarea_field( isset( $j['sms'] ) ? $j['sms'] : dreamscaper_tpl_get( $p, $key )['sms'] ),
		'quiet'    => false,
	) );
	if ( ! $res['sent'] ) {
		return dreamscaper_crm_err( $res['errors'] ? implode( ' ', array_unique( $res['errors'] ) ) : 'Nothing was sent — check your email and phone in Business profile.' );
	}
	return array( 'ok' => true, 'channels' => $res['channels'] );
}

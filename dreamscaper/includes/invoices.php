<?php
/**
 * DreamScaper – invoices: design, content, reminders and repeats.
 *
 *  Design (per contractor, Settings → Invoice design): logo, its position and size, brand color, font,
 *  layout (Classic, Modern, Compact, Bold), heading, which sections show and in what order, which columns
 *  the line items have, what business / customer details appear, default custom fields, notes, terms,
 *  payment instructions, thank-you and footer text, default tax and due terms, and the default reminder plan.
 *
 *  Per invoice (stored in invoices.opts): custom fields, line details/dates/units/taxable, discount, tax,
 *  notes, terms, payment instructions, a custom repeat interval, and the reminder plan — the default plan,
 *  a custom one (before / on / after the due date, by email, text or both, with your own wording), or none.
 *
 *  GET/POST /crm/invoice/design   read / save the design (logo uploads are stored like other files)
 *  POST     /crm/invoice/preview  render an invoice (saved or not) with a design, for the live preview
 *  POST     /crm/invoice/test     send a reminder message to yourself to see how it looks
 *
 * One renderer (dreamscaper_invoice_html) draws the customer's invoice page, the printable/PDF version
 * and the live preview, so what the contractor designs is exactly what the customer gets.
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

add_action( 'rest_api_init', function () {
	$auth = function () {
		return is_user_logged_in();
	};
	register_rest_route( 'dreamscaper/v1', '/crm/invoice/design', array( 'methods' => 'GET', 'callback' => 'dreamscaper_rest_invoice_design', 'permission_callback' => $auth ) );
	register_rest_route( 'dreamscaper/v1', '/crm/invoice/design', array( 'methods' => 'POST', 'callback' => 'dreamscaper_rest_invoice_design_save', 'permission_callback' => $auth ) );
	register_rest_route( 'dreamscaper/v1', '/crm/invoice/preview', array( 'methods' => 'POST', 'callback' => 'dreamscaper_rest_invoice_preview', 'permission_callback' => $auth ) );
	register_rest_route( 'dreamscaper/v1', '/crm/invoice/test', array( 'methods' => 'POST', 'callback' => 'dreamscaper_rest_invoice_test', 'permission_callback' => $auth ) );
} );

/* ------------------------------------------------------------------ design */

function dreamscaper_invoice_fonts() {
	return array( 'system' => 'System (fast, no download)', 'Inter' => 'Inter', 'Roboto' => 'Roboto', 'Lato' => 'Lato', 'Montserrat' => 'Montserrat', 'Open Sans' => 'Open Sans', 'Merriweather' => 'Merriweather (serif)', 'Playfair Display' => 'Playfair Display (serif)', 'Source Serif 4' => 'Source Serif (serif)', 'Roboto Mono' => 'Roboto Mono' );
}
function dreamscaper_invoice_sections() {
	return array( 'header' => 'Logo & your business', 'billto' => 'Bill to', 'meta' => 'Invoice number & dates', 'fields' => 'Custom fields', 'items' => 'Line items', 'totals' => 'Totals', 'payment' => 'How to pay', 'notes' => 'Notes', 'terms' => 'Terms', 'thanks' => 'Thank-you message', 'footer' => 'Footer' );
}
/** The default reminder plan (each one can be switched off or changed). */
function dreamscaper_invoice_default_reminders() {
	return array(
		array( 'on' => true, 'when' => 'before', 'days' => 3, 'channel' => 'email', 'subject' => 'Reminder: invoice {invoice_number} is due {invoice_due_date}', 'email' => "Hi {customer_first_name|there},\n\nA quick heads-up that invoice {invoice_number} for {invoice_title} ({invoice_amount}) is due {invoice_due_date}.\n\nYou can view and pay it here: {invoice_link}\n\nThank you!\n{company_name}", 'sms' => '{company_name}: invoice {invoice_number} ({invoice_amount}) is due {invoice_due_date}. View & pay: {invoice_link}' ),
		array( 'on' => true, 'when' => 'on', 'days' => 0, 'channel' => 'both', 'subject' => 'Invoice {invoice_number} is due today', 'email' => "Hi {customer_first_name|there},\n\nInvoice {invoice_number} ({invoice_amount}) is due today. If you’ve already paid, thank you!\n\nView & pay: {invoice_link}\n\n{company_name}", 'sms' => '{company_name}: invoice {invoice_number} ({invoice_amount}) is due today. Pay here: {invoice_link}' ),
		array( 'on' => true, 'when' => 'after', 'days' => 3, 'channel' => 'sms', 'subject' => 'Friendly reminder: invoice {invoice_number}', 'email' => "Hi {customer_first_name|there},\n\nJust a friendly reminder that invoice {invoice_number} ({invoice_amount}) was due {invoice_due_date}.\n\nView & pay: {invoice_link}\n\n{company_name}", 'sms' => 'Friendly reminder from {company_name}: invoice {invoice_number} ({invoice_amount}) was due {invoice_due_date}. Pay here: {invoice_link}' ),
		array( 'on' => true, 'when' => 'after', 'days' => 7, 'channel' => 'both', 'subject' => 'Invoice {invoice_number} is {days_late} days past due', 'email' => "Hi {customer_first_name|there},\n\nInvoice {invoice_number} for {invoice_title} ({invoice_amount}) is now {days_late} days past due. Please pay it at your earliest convenience — or reply if anything’s wrong with it.\n\nView & pay: {invoice_link}\n\nThank you,\n{contractor_name}\n{company_name}", 'sms' => '{company_name}: invoice {invoice_number} ({invoice_amount}) is {days_late} days past due. Pay here: {invoice_link} — or reply with any questions.' ),
		array( 'on' => true, 'when' => 'after', 'days' => 14, 'channel' => 'email', 'subject' => 'Second notice: invoice {invoice_number}', 'email' => "Hi {customer_first_name|there},\n\nThis is a second notice that invoice {invoice_number} ({invoice_amount}) was due {invoice_due_date} and hasn’t been paid yet.\n\nView & pay: {invoice_link}\n\nIf there’s a problem, please call or reply so we can sort it out.\n\n{contractor_name}\n{company_name}", 'sms' => '{company_name}: second notice — invoice {invoice_number} ({invoice_amount}) is past due. {invoice_link}' ),
		array( 'on' => false, 'when' => 'after', 'days' => 30, 'channel' => 'email', 'subject' => 'Final notice: invoice {invoice_number}', 'email' => "Hi {customer_first_name|there},\n\nInvoice {invoice_number} ({invoice_amount}) is now {days_late} days past due. Please pay within 7 days or contact us to arrange a payment plan.\n\nView & pay: {invoice_link}\n\n{contractor_name}\n{company_name}", 'sms' => '{company_name}: final notice for invoice {invoice_number} ({invoice_amount}). Please pay or call us: {invoice_link}' ),
	);
}
function dreamscaper_invoice_design_defaults() {
	$secs = array();
	foreach ( array_keys( dreamscaper_invoice_sections() ) as $k ) {
		$secs[] = array( 'id' => $k, 'on' => ! in_array( $k, array( 'thanks' ), true ) );
	}
	return array(
		'logo' => '', 'logoPos' => 'left', 'logoSize' => 'M', 'color' => '#1f7a46', 'font' => 'system', 'layout' => 'classic', 'heading' => 'Invoice',
		'sections' => $secs,
		'columns'  => array( 'date' => false, 'qty' => true, 'unit' => false, 'rate' => true, 'amount' => true ),
		'show'     => array( 'address' => true, 'phone' => true, 'email' => true, 'website' => true, 'license' => true, 'cust_phone' => false, 'cust_email' => false, 'service_address' => true, 'paid_stamp' => true ),
		'license'  => '',
		'fields'   => array(),
		'notes'    => '',
		'terms'    => 'Payment is due by the due date shown. Thank you for your business.',
		'payment'  => '',
		'thanks'   => 'Thank you for choosing us!',
		'footer'   => '',
		'taxPct'   => 0,
		'netDays'  => 14,
		'reminders' => dreamscaper_invoice_default_reminders(),
	);
}
/** Clean a design posted from the browser. */
function dreamscaper_invoice_design_clean( $in, $old = array() ) {
	$d   = dreamscaper_invoice_design_defaults();
	$txt = function ( $k, $max = 2000 ) use ( $in ) { return isset( $in[ $k ] ) ? mb_substr( sanitize_textarea_field( (string) $in[ $k ] ), 0, $max ) : null; };
	$out = array_merge( $d, $old );
	foreach ( array( 'notes', 'terms', 'payment', 'thanks', 'footer' ) as $k ) {
		$v = $txt( $k );
		if ( null !== $v ) {
			$out[ $k ] = $v;
		}
	}
	foreach ( array( 'heading' => 40, 'license' => 80 ) as $k => $m ) {
		if ( isset( $in[ $k ] ) ) {
			$out[ $k ] = mb_substr( sanitize_text_field( $in[ $k ] ), 0, $m );
		}
	}
	if ( isset( $in['logoPos'] ) && in_array( $in['logoPos'], array( 'left', 'center', 'right' ), true ) ) {
		$out['logoPos'] = $in['logoPos'];
	}
	if ( isset( $in['logoSize'] ) && in_array( $in['logoSize'], array( 'S', 'M', 'L' ), true ) ) {
		$out['logoSize'] = $in['logoSize'];
	}
	if ( isset( $in['color'] ) && preg_match( '/^#[0-9a-f]{6}$/i', $in['color'] ) ) {
		$out['color'] = strtolower( $in['color'] );
	}
	if ( isset( $in['font'] ) && isset( dreamscaper_invoice_fonts()[ $in['font'] ] ) ) {
		$out['font'] = $in['font'];
	}
	if ( isset( $in['layout'] ) && in_array( $in['layout'], array( 'classic', 'modern', 'compact', 'bold' ), true ) ) {
		$out['layout'] = $in['layout'];
	}
	if ( isset( $in['sections'] ) && is_array( $in['sections'] ) ) {
		$known = dreamscaper_invoice_sections();
		$secs  = array();
		foreach ( $in['sections'] as $s ) {
			if ( isset( $s['id'] ) && isset( $known[ $s['id'] ] ) && ! in_array( $s['id'], wp_list_pluck( $secs, 'id' ), true ) ) {
				$secs[] = array( 'id' => $s['id'], 'on' => ! empty( $s['on'] ) );
			}
		}
		foreach ( array_keys( $known ) as $k ) {
			if ( ! in_array( $k, wp_list_pluck( $secs, 'id' ), true ) ) {
				$secs[] = array( 'id' => $k, 'on' => false );
			}
		}
		$out['sections'] = $secs;
	}
	foreach ( array( 'columns', 'show' ) as $grp ) {
		if ( isset( $in[ $grp ] ) && is_array( $in[ $grp ] ) ) {
			foreach ( $d[ $grp ] as $k => $v ) {
				if ( array_key_exists( $k, $in[ $grp ] ) ) {
					$out[ $grp ][ $k ] = (bool) $in[ $grp ][ $k ];
				}
			}
		}
	}
	if ( isset( $in['fields'] ) && is_array( $in['fields'] ) ) {
		$out['fields'] = array_values( array_filter( array_map( function ( $f ) { return array( 'label' => mb_substr( sanitize_text_field( isset( $f['label'] ) ? $f['label'] : '' ), 0, 60 ), 'value' => mb_substr( sanitize_text_field( isset( $f['value'] ) ? $f['value'] : '' ), 0, 200 ) ); }, array_slice( $in['fields'], 0, 12 ) ), function ( $f ) { return '' !== $f['label']; } ) );
	}
	if ( isset( $in['taxPct'] ) ) {
		$out['taxPct'] = max( 0, min( 30, (float) $in['taxPct'] ) );
	}
	if ( isset( $in['netDays'] ) ) {
		$out['netDays'] = max( 0, min( 120, (int) $in['netDays'] ) );
	}
	if ( isset( $in['reminders'] ) && is_array( $in['reminders'] ) ) {
		$out['reminders'] = dreamscaper_invoice_reminders_clean( $in['reminders'] );
	}
	if ( array_key_exists( 'logo', $in ) ) {
		$logo = (string) $in['logo'];
		$out['logo'] = '' === $logo ? '' : dreamscaper_crm_store_image( $logo, 2 * MB_IN_BYTES );
	}
	return $out;
}
function dreamscaper_invoice_reminders_clean( $list ) {
	$out = array();
	foreach ( array_slice( (array) $list, 0, 12 ) as $r ) {
		$out[] = array(
			'on'      => ! empty( $r['on'] ),
			'when'    => isset( $r['when'] ) && in_array( $r['when'], array( 'before', 'on', 'after' ), true ) ? $r['when'] : 'after',
			'days'    => max( 0, min( 365, (int) ( isset( $r['days'] ) ? $r['days'] : 0 ) ) ),
			'channel' => isset( $r['channel'] ) && in_array( $r['channel'], array( 'email', 'sms', 'both' ), true ) ? $r['channel'] : 'email',
			'subject' => mb_substr( sanitize_text_field( isset( $r['subject'] ) ? $r['subject'] : '' ), 0, 200 ),
			'email'   => mb_substr( sanitize_textarea_field( isset( $r['email'] ) ? $r['email'] : '' ), 0, 4000 ),
			'sms'     => mb_substr( sanitize_textarea_field( isset( $r['sms'] ) ? $r['sms'] : '' ), 0, 600 ),
		);
	}
	return $out;
}
function dreamscaper_invoice_design( $p ) {
	$s = dreamscaper_pro_settings( $p );
	$d = isset( $s['invoice'] ) && is_array( $s['invoice'] ) ? array_merge( dreamscaper_invoice_design_defaults(), $s['invoice'] ) : dreamscaper_invoice_design_defaults();
	return $d;
}
function dreamscaper_rest_invoice_design() {
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	return array( 'design' => dreamscaper_invoice_design( $p ), 'defaults' => dreamscaper_invoice_design_defaults(), 'fonts' => dreamscaper_invoice_fonts(), 'sections' => dreamscaper_invoice_sections(), 'logo' => (string) $p->logo, 'sms' => (bool) dreamscaper_sms_ready() && dreamscaper_pro_can( $p->user_id, 'sms' ) );
}
function dreamscaper_rest_invoice_design_save( WP_REST_Request $r ) {
	global $wpdb;
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$j = $r->get_json_params();
	$s = dreamscaper_pro_settings( $p );
	$s['invoice'] = dreamscaper_invoice_design_clean( isset( $j['design'] ) && is_array( $j['design'] ) ? $j['design'] : array(), isset( $s['invoice'] ) && is_array( $s['invoice'] ) ? $s['invoice'] : array() );
	if ( ! empty( $GLOBALS['dscp_upload_err'] ) ) {
		return $GLOBALS['dscp_upload_err'];
	}
	$wpdb->update( dreamscaper_t( 'pros' ), array( 'settings' => wp_json_encode( $s ) ), array( 'user_id' => $p->user_id ) );
	return array( 'design' => $s['invoice'] );
}

/* ----------------------------------------------------------- the numbers */

/** Clean line items: name, details, date, qty, unit, rate, taxable. */
function dreamscaper_invoice_items_clean( $list ) {
	$out = array();
	foreach ( array_slice( (array) $list, 0, 100 ) as $it ) {
		$name = mb_substr( sanitize_text_field( isset( $it['name'] ) ? $it['name'] : '' ), 0, 200 );
		if ( '' === $name ) {
			continue;
		}
		$out[] = array(
			'name'    => $name,
			'desc'    => mb_substr( sanitize_textarea_field( isset( $it['desc'] ) ? $it['desc'] : '' ), 0, 1000 ),
			'date'    => isset( $it['date'] ) && preg_match( '/^\d{4}-\d{2}-\d{2}$/', $it['date'] ) ? $it['date'] : '',
			'qty'     => round( (float) ( isset( $it['qty'] ) ? $it['qty'] : 1 ), 3 ),
			'unit'    => mb_substr( sanitize_text_field( isset( $it['unit'] ) ? $it['unit'] : '' ), 0, 20 ),
			'rate'    => round( (float) ( isset( $it['rate'] ) ? $it['rate'] : 0 ), 2 ),
			'taxable' => ! isset( $it['taxable'] ) || ! empty( $it['taxable'] ),
		);
	}
	return $out;
}
/** Subtotal, discount, tax and total. Discount is spread over taxable lines in proportion. */
function dreamscaper_invoice_calc( $items, $opts ) {
	$sub = 0;
	$tx  = 0;
	foreach ( $items as $it ) {
		$a    = (float) $it['qty'] * (float) $it['rate'];
		$sub += $a;
		if ( ! isset( $it['taxable'] ) || $it['taxable'] ) {
			$tx += $a;
		}
	}
	$dv   = isset( $opts['discount']['value'] ) ? max( 0, (float) $opts['discount']['value'] ) : 0;
	$disc = isset( $opts['discount']['type'] ) && 'pct' === $opts['discount']['type'] ? $sub * min( 100, $dv ) / 100 : min( $sub, $dv );
	$base = $sub > 0 ? $tx * ( 1 - $disc / $sub ) : 0;
	$rate = isset( $opts['taxPct'] ) ? max( 0, min( 30, (float) $opts['taxPct'] ) ) : 0;
	$tax  = round( $base * $rate / 100, 2 );
	return array( 'subtotal' => round( $sub, 2 ), 'discount' => round( $disc, 2 ), 'taxable' => round( $base, 2 ), 'taxPct' => $rate, 'tax' => $tax, 'total' => round( $sub - $disc + $tax, 2 ) );
}
/** Clean the per-invoice options. */
function dreamscaper_invoice_opts_clean( $in, $old = array() ) {
	$o = is_array( $old ) ? $old : array();
	foreach ( array( 'notes', 'terms', 'payment', 'thanks' ) as $k ) {
		if ( isset( $in[ $k ] ) ) {
			$o[ $k ] = mb_substr( sanitize_textarea_field( (string) $in[ $k ] ), 0, 3000 );
		}
	}
	if ( isset( $in['fields'] ) && is_array( $in['fields'] ) ) {
		$o['fields'] = array_values( array_filter( array_map( function ( $f ) { return array( 'label' => mb_substr( sanitize_text_field( isset( $f['label'] ) ? $f['label'] : '' ), 0, 60 ), 'value' => mb_substr( sanitize_text_field( isset( $f['value'] ) ? $f['value'] : '' ), 0, 200 ) ); }, array_slice( $in['fields'], 0, 12 ) ), function ( $f ) { return '' !== $f['label'] && '' !== $f['value']; } ) );
	}
	if ( isset( $in['discount'] ) && is_array( $in['discount'] ) ) {
		$o['discount'] = array( 'type' => isset( $in['discount']['type'] ) && 'pct' === $in['discount']['type'] ? 'pct' : 'amt', 'value' => max( 0, (float) ( isset( $in['discount']['value'] ) ? $in['discount']['value'] : 0 ) ), 'label' => mb_substr( sanitize_text_field( isset( $in['discount']['label'] ) ? $in['discount']['label'] : '' ), 0, 60 ) );
	}
	if ( isset( $in['taxPct'] ) ) {
		$o['taxPct'] = max( 0, min( 30, (float) $in['taxPct'] ) );
	}
	if ( isset( $in['date'] ) && preg_match( '/^\d{4}-\d{2}-\d{2}$/', (string) $in['date'] ) ) {
		$o['date'] = $in['date'];
	}
	if ( isset( $in['every'] ) && is_array( $in['every'] ) ) {
		$o['every'] = array( 'n' => max( 1, min( 365, (int) ( isset( $in['every']['n'] ) ? $in['every']['n'] : 1 ) ) ), 'unit' => isset( $in['every']['unit'] ) && in_array( $in['every']['unit'], array( 'day', 'week', 'month', 'year' ), true ) ? $in['every']['unit'] : 'month' );
	}
	if ( isset( $in['remind'] ) && in_array( $in['remind'], array( 'default', 'custom', 'off' ), true ) ) {
		$o['remind'] = $in['remind'];
	}
	if ( isset( $in['reminders'] ) && is_array( $in['reminders'] ) ) {
		$o['reminders'] = dreamscaper_invoice_reminders_clean( $in['reminders'] );
	}
	if ( isset( $in['send'] ) && is_array( $in['send'] ) ) {
		$o['send'] = array( 'channel' => isset( $in['send']['channel'] ) && in_array( $in['send']['channel'], array( 'email', 'sms', 'both' ), true ) ? $in['send']['channel'] : 'email', 'receipt' => ! isset( $in['send']['receipt'] ) || ! empty( $in['send']['receipt'] ) );
	}
	return $o;
}
/** The next date a repeating invoice goes out, from a date. */
function dreamscaper_invoice_next_date( $recur, $opts, $from ) {
	$map = array( 'weekly' => '+1 week', 'biweekly' => '+2 weeks', 'monthly' => '+1 month', 'quarterly' => '+3 months', 'yearly' => '+1 year' );
	if ( isset( $map[ $recur ] ) ) {
		return gmdate( 'Y-m-d', strtotime( $from . ' ' . $map[ $recur ] ) );
	}
	if ( 'custom' === $recur && ! empty( $opts['every'] ) ) {
		$n = max( 1, (int) $opts['every']['n'] );
		return gmdate( 'Y-m-d', strtotime( $from . ' +' . $n . ' ' . $opts['every']['unit'] . ( $n > 1 ? 's' : '' ) ) );
	}
	return null;
}
function dreamscaper_invoice_recur_label( $recur, $opts ) {
	$l = array( 'weekly' => 'every week', 'biweekly' => 'every 2 weeks', 'monthly' => 'every month', 'quarterly' => 'every 3 months', 'yearly' => 'every year' );
	if ( isset( $l[ $recur ] ) ) {
		return $l[ $recur ];
	}
	if ( 'custom' === $recur && ! empty( $opts['every'] ) ) {
		$n = (int) $opts['every']['n'];
		return 'every ' . ( 1 === $n ? '' : $n . ' ' ) . $opts['every']['unit'] . ( 1 === $n ? '' : 's' );
	}
	return '';
}

/* -------------------------------------------------------------- renderer */

/**
 * The invoice as a complete HTML page.
 * $inv: invoice row (object) — or an array with the same fields for previews. $mode: page | print | preview.
 */
function dreamscaper_invoice_html( $inv, $p, $c, $design, $mode = 'page' ) {
	$inv   = (object) $inv;
	$d     = array_merge( dreamscaper_invoice_design_defaults(), (array) $design );
	$opts  = isset( $inv->opts ) ? ( is_array( $inv->opts ) ? $inv->opts : dreamscaper_json( $inv->opts ) ) : array();
	$items = is_array( $inv->items ) ? $inv->items : dreamscaper_json( $inv->items );
	$t     = dreamscaper_invoice_calc( $items, $opts + array( 'taxPct' => 0 ) );
	$e     = 'esc_html';
	$m     = function ( $v ) { return '$' . number_format( (float) $v, 2 ); };
	$col   = $d['color'];
	$font  = 'system' === $d['font'] ? 'system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif' : '"' . $d['font'] . '",system-ui,sans-serif';
	$logo  = $d['logo'] ? $d['logo'] : ( $p && $p->logo ? $p->logo : '' );
	$lh    = array( 'S' => 48, 'M' => 76, 'L' => 120 )[ $d['logoSize'] ];
	$show  = $d['show'];
	$cols  = $d['columns'];
	$date  = ! empty( $opts['date'] ) ? $opts['date'] : ( ! empty( $inv->created ) ? substr( (string) $inv->created, 0, 10 ) : gmdate( 'Y-m-d' ) );
	$fmt   = function ( $ymd ) { return $ymd ? wp_date( 'F j, Y', strtotime( $ymd . ' 12:00:00' ) ) : ''; };
	$status = isset( $inv->status ) ? $inv->status : 'draft';
	$ln    = function ( $s ) { return nl2br( esc_html( $s ) ); };
	$sec   = array();
	// business block
	$biz = '<div class="biz"><b class="bn">' . $e( $p ? $p->business : 'Your business' ) . '</b>';
	if ( $p && $show['address'] && ( $p->address || $p->town ) ) {
		$biz .= '<div>' . $e( trim( $p->address . ( $p->town ? ', ' . $p->town : '' ) . ( isset( $p->state ) && $p->state ? ', ' . $p->state : '' ) . ( $p->zip ? ' ' . $p->zip : '' ), ', ' ) ) . '</div>';
	}
	$bits = array();
	if ( $p && $show['phone'] && $p->phone ) {
		$bits[] = $e( $p->phone );
	}
	if ( $p && $show['email'] && $p->email ) {
		$bits[] = $e( $p->email );
	}
	if ( $p && $show['website'] && ! empty( $p->website ) ) {
		$bits[] = $e( preg_replace( '#^https?://#', '', $p->website ) );
	}
	if ( $bits ) {
		$biz .= '<div>' . implode( ' · ', $bits ) . '</div>';
	}
	if ( $show['license'] && $d['license'] ) {
		$biz .= '<div class="mut">' . $e( $d['license'] ) . '</div>';
	}
	$biz .= '</div>';
	$badge = 'paid' === $status ? '<span class="st paid">Paid</span>' : ( 'void' === $status ? '<span class="st void">Void</span>' : ( 'processing' === $status ? '<span class="st">Processing</span>' : '' ) );
	$sec['header'] = '<header class="hd lp-' . $e( $d['logoPos'] ) . '">' . ( $logo ? '<img class="logo" src="' . esc_url( $logo ) . '" alt="" style="max-height:' . $lh . 'px">' : '' ) . $biz . '<div class="ttl"><h1>' . $e( $d['heading'] ) . '</h1>' . $badge . '</div></header>';
	// bill to
	if ( $c ) {
		$addr = trim( $c->address . ( $c->town ? ', ' . $c->town : '' ) . ( $c->state ? ', ' . $c->state : '' ) . ( $c->zip ? ' ' . $c->zip : '' ), ', ' );
		$b    = '<div class="blk"><h3>Bill to</h3><b>' . $e( $c->name ) . '</b>' . ( ! empty( $c->company ) ? '<div>' . $e( $c->company ) . '</div>' : '' ) . ( $addr ? '<div>' . $e( $addr ) . '</div>' : '' );
		if ( $show['cust_phone'] && $c->phone ) {
			$b .= '<div>' . $e( $c->phone ) . '</div>';
		}
		if ( $show['cust_email'] && $c->email ) {
			$b .= '<div>' . $e( $c->email ) . '</div>';
		}
		$b .= '</div>';
		if ( $show['service_address'] && ! empty( $inv->service_address ) && $inv->service_address !== $addr ) {
			$b .= '<div class="blk"><h3>Service address</h3><div>' . $e( $inv->service_address ) . '</div></div>';
		}
		$sec['billto'] = '<section class="two">' . $b . '</section>';
	}
	// number & dates
	$rl = dreamscaper_invoice_recur_label( isset( $inv->recur ) ? $inv->recur : '', $opts );
	$sec['meta'] = '<section class="meta"><div><span>Invoice #</span><b>' . $e( isset( $inv->number ) && $inv->number ? $inv->number : 'INV-0000' ) . '</b></div><div><span>Date</span><b>' . $e( $fmt( $date ) ) . '</b></div><div><span>Due</span><b>' . $e( ! empty( $inv->due ) ? $fmt( $inv->due ) : 'On receipt' ) . '</b></div>' . ( $rl ? '<div><span>Repeats</span><b>' . $e( ucfirst( $rl ) ) . '</b></div>' : '' ) . '<div class="due"><span>Amount due</span><b>' . $e( 'paid' === $status ? $m( 0 ) : $m( $t['total'] ) ) . '</b></div></section>';
	// custom fields
	$fl = ! empty( $opts['fields'] ) ? $opts['fields'] : array();
	if ( $fl ) {
		$sec['fields'] = '<section class="flds">' . implode( '', array_map( function ( $f ) use ( $e ) { return '<div><span>' . $e( $f['label'] ) . '</span><b>' . $e( $f['value'] ) . '</b></div>'; }, $fl ) ) . '</section>';
	}
	// items
	$hd = '<th>Description</th>' . ( $cols['date'] ? '<th>Date</th>' : '' ) . ( $cols['qty'] ? '<th class="n">Qty</th>' : '' ) . ( $cols['unit'] ? '<th>Unit</th>' : '' ) . ( $cols['rate'] ? '<th class="n">Rate</th>' : '' ) . ( $cols['amount'] ? '<th class="n">Amount</th>' : '' );
	$rows = '';
	foreach ( $items as $it ) {
		$rows .= '<tr><td><b>' . $e( $it['name'] ) . '</b>' . ( ! empty( $it['desc'] ) ? '<div class="ds">' . $ln( $it['desc'] ) . '</div>' : '' ) . '</td>' . ( $cols['date'] ? '<td>' . $e( ! empty( $it['date'] ) ? wp_date( 'M j', strtotime( $it['date'] . ' 12:00:00' ) ) : '' ) . '</td>' : '' ) . ( $cols['qty'] ? '<td class="n">' . $e( rtrim( rtrim( number_format( (float) $it['qty'], 3, '.', '' ), '0' ), '.' ) ) . '</td>' : '' ) . ( $cols['unit'] ? '<td>' . $e( isset( $it['unit'] ) ? $it['unit'] : '' ) . '</td>' : '' ) . ( $cols['rate'] ? '<td class="n">' . $e( $m( $it['rate'] ) ) . '</td>' : '' ) . ( $cols['amount'] ? '<td class="n">' . $e( $m( $it['qty'] * $it['rate'] ) ) . '</td>' : '' ) . '</tr>';
	}
	$sec['items'] = '<section class="items"><table><thead><tr>' . $hd . '</tr></thead><tbody>' . ( $rows ? $rows : '<tr><td class="mut" colspan="6">No lines yet</td></tr>' ) . '</tbody></table></section>';
	// totals
	$tt = '<div><span>Subtotal</span><b>' . $e( $m( $t['subtotal'] ) ) . '</b></div>';
	if ( $t['discount'] > 0 ) {
		$dl  = ! empty( $opts['discount']['label'] ) ? $opts['discount']['label'] : ( 'pct' === $opts['discount']['type'] ? 'Discount (' . (float) $opts['discount']['value'] . '%)' : 'Discount' );
		$tt .= '<div><span>' . $e( $dl ) . '</span><b>−' . $e( $m( $t['discount'] ) ) . '</b></div>';
	}
	if ( $t['tax'] > 0 ) {
		$tt .= '<div><span>Sales tax (' . $e( rtrim( rtrim( number_format( $t['taxPct'], 3 ), '0' ), '.' ) ) . '%)</span><b>' . $e( $m( $t['tax'] ) ) . '</b></div>';
	}
	$tt .= '<div class="gt"><span>Total</span><b>' . $e( $m( $t['total'] ) ) . '</b></div>';
	if ( 'paid' === $status ) {
		$tt .= '<div><span>Paid' . ( ! empty( $inv->paid_at ) ? ' ' . $e( wp_date( 'M j, Y', strtotime( $inv->paid_at . ' UTC' ) ) ) : '' ) . '</span><b>−' . $e( $m( $t['total'] ) ) . '</b></div><div class="gt"><span>Balance due</span><b>' . $e( $m( 0 ) ) . '</b></div>';
	}
	$sec['totals'] = '<section class="tots"><div class="tbox">' . $tt . '</div></section>';
	$txt = function ( $k ) use ( $opts, $d ) { return isset( $opts[ $k ] ) && '' !== trim( $opts[ $k ] ) ? $opts[ $k ] : $d[ $k ]; };
	if ( '' !== trim( $txt( 'payment' ) ) ) {
		$sec['payment'] = '<section class="note"><h3>How to pay</h3><p>' . $ln( $txt( 'payment' ) ) . '</p></section>';
	}
	if ( '' !== trim( $txt( 'notes' ) ) ) {
		$sec['notes'] = '<section class="note"><h3>Notes</h3><p>' . $ln( $txt( 'notes' ) ) . '</p></section>';
	}
	if ( '' !== trim( $txt( 'terms' ) ) ) {
		$sec['terms'] = '<section class="note"><h3>Terms</h3><p class="mut">' . $ln( $txt( 'terms' ) ) . '</p></section>';
	}
	if ( '' !== trim( $txt( 'thanks' ) ) ) {
		$sec['thanks'] = '<section class="thx">' . $ln( $txt( 'thanks' ) ) . '</section>';
	}
	if ( '' !== trim( $d['footer'] ) ) {
		$sec['footer'] = '<footer class="ft">' . $ln( $d['footer'] ) . '</footer>';
	}
	// pay box (customer page only, not printed)
	$pay = '';
	if ( 'page' === $mode && 'sent' === $status && $p ) {
		if ( $p->stripe_ready ) {
			$pay = '<section class="pay np"><button class="btn" data-m="card">💳 Pay ' . $e( $m( $t['total'] ) ) . ' by card</button>' . ( dreamscaper_opt( 'pay_ach' ) ? ' <button class="btn ghost" data-m="ach">🏦 Pay by bank account</button>' : '' ) . '<p class="mut sm">Card, Apple Pay or Google Pay' . ( dreamscaper_opt( 'pay_ach' ) ? ', or from your bank account (takes about 4 business days to clear)' : '' ) . ' — securely through Stripe. ' . $e( $p->business ) . ' receives your payment directly.</p><p id="msg" class="err"></p></section>'
				. '<script>document.querySelectorAll("[data-m]").forEach(function(b){b.onclick=function(){document.querySelectorAll("[data-m]").forEach(function(x){x.disabled=true;});fetch(' . wp_json_encode( esc_url_raw( rest_url( 'dreamscaper/v1/crm/pay' ) ) ) . ',{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({t:' . wp_json_encode( $inv->token ) . ',method:b.getAttribute("data-m")})}).then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.message);location.href=j.url;});}).catch(function(e){document.getElementById("msg").textContent=e.message;document.querySelectorAll("[data-m]").forEach(function(x){x.disabled=false;});});};});</script>';
		}
	}
	if ( 'page' === $mode && 'processing' === $status ) {
		$pay = '<section class="pay np"><p><b>⏳ Bank payment processing.</b> Bank payments usually clear in about 4 business days — you’ll get a receipt when it does.</p></section>';
	}
	$body = '';
	foreach ( $d['sections'] as $s ) {
		if ( ! empty( $s['on'] ) && isset( $sec[ $s['id'] ] ) ) {
			// the Modern layout's colored band only bleeds to the edges when the header is at the top
			$body .= '' === $body && 'header' === $s['id'] ? str_replace( '<header class="hd ', '<header class="hd first ', $sec['header'] ) : $sec[ $s['id'] ];
			if ( 'totals' === $s['id'] ) {
				$body .= $pay;
				$pay   = '';
			}
		}
	}
	$body .= $pay;
	$stamp = 'paid' === $status && $show['paid_stamp'] ? '<div class="stamp">PAID</div>' : '';
	$gf    = 'system' === $d['font'] ? '' : '<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=' . rawurlencode( $d['font'] ) . ':wght@400;600;700;800&display=swap" rel="stylesheet">';
	$css   = ':root{--c:' . $col . ';--ink:#1b211d;--mut:#5f6b63;--line:#e3e8e4}*{box-sizing:border-box}body{margin:0;background:' . ( 'preview' === $mode ? '#fff' : '#eef1ee' ) . ';color:var(--ink);font:15px/1.5 ' . $font . '}'
		. '.inv{position:relative;max-width:820px;margin:' . ( 'preview' === $mode ? '0 auto' : '24px auto' ) . ';background:#fff;padding:40px 44px;border-radius:' . ( 'preview' === $mode ? '0' : '14px' ) . ';box-shadow:' . ( 'preview' === $mode ? 'none' : '0 6px 30px rgba(0,0,0,.08)' ) . ';overflow:hidden}'
		. 'h1{margin:0;font-size:30px;letter-spacing:.02em;color:var(--c);text-transform:uppercase}h3{margin:0 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--mut)}'
		. '.hd{display:flex;gap:18px;align-items:flex-start;margin-bottom:26px}.hd .biz{flex:1;font-size:14px;color:var(--mut)}.hd .bn{display:block;font-size:18px;color:var(--ink)}.hd .ttl{text-align:right}'
		. '.hd.lp-center{flex-direction:column;align-items:center;text-align:center}.hd.lp-center .ttl{text-align:center}.hd.lp-right{flex-direction:row-reverse}.hd.lp-right .ttl{text-align:left}.logo{max-width:220px;object-fit:contain}'
		. '.st{display:inline-block;margin-top:6px;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:700;background:#e8f5ec;color:#1f7a46}.st.void{background:#fdecea;color:#a1260d}'
		. '.two{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:0 0 18px}.meta,.flds{display:flex;flex-wrap:wrap;gap:10px 28px;margin:0 0 18px;padding:12px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}'
		. '.meta div,.flds div{display:flex;flex-direction:column}.meta span,.flds span{font-size:12px;color:var(--mut);text-transform:uppercase;letter-spacing:.06em}.meta .due{margin-left:auto;text-align:right}.meta .due b{font-size:20px;color:var(--c)}'
		. 'table{width:100%;border-collapse:collapse}th{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--mut);text-align:left;padding:8px;border-bottom:2px solid var(--c)}td{padding:10px 8px;border-bottom:1px solid var(--line);vertical-align:top}.n{text-align:right;white-space:nowrap}.ds{color:var(--mut);font-size:13px;margin-top:2px}'
		. '.tots{display:flex;justify-content:flex-end;margin:14px 0 20px}.tbox{min-width:280px}.tbox div{display:flex;justify-content:space-between;gap:20px;padding:4px 0}.tbox .gt{border-top:2px solid var(--ink);margin-top:4px;padding-top:8px;font-size:18px}.tbox .gt b{color:var(--c)}'
		. '.note{margin:0 0 14px}.note p{margin:0}.mut{color:var(--mut)}.sm{font-size:13px}.thx{text-align:center;font-size:17px;font-weight:600;color:var(--c);margin:18px 0}.ft{margin-top:24px;padding-top:12px;border-top:1px solid var(--line);font-size:12px;color:var(--mut);text-align:center}'
		. '.pay{margin:0 0 22px;padding:16px;border-radius:12px;background:#f3f7f4}.btn{display:inline-flex;align-items:center;gap:8px;border:0;border-radius:999px;padding:13px 22px;background:var(--c);color:#fff;font:inherit;font-weight:700;cursor:pointer;min-height:46px}.btn.ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}.err{color:#c62828;font-weight:600}'
		. '.stamp{position:absolute;top:120px;right:-10px;transform:rotate(-14deg);border:5px solid rgba(31,122,70,.55);color:rgba(31,122,70,.55);font-size:52px;font-weight:900;padding:4px 26px;border-radius:12px;letter-spacing:.1em;pointer-events:none}'
		. '.tools{max-width:820px;margin:16px auto 0;display:flex;gap:10px;justify-content:flex-end;padding:0 16px}'
		// layouts
		. '.items{margin:0 0 14px}'
		. ( 'modern' === $d['layout'] ? '.hd{padding:24px 28px;background:var(--c);color:#fff;border-radius:12px}.hd.first{margin:-40px -44px 26px;padding:30px 44px;border-radius:0}.hd .mut{color:#fff;opacity:.85}.hd .biz,.hd .bn{color:#fff}.hd h1{color:#fff}.hd .biz div{opacity:.9}th{border-bottom:0;background:#f2f5f3}tbody tr:nth-child(even) td{background:#fafcfb}.meta{border:0;background:#f6f8f7;border-radius:10px;padding:14px 16px}' : '' )
		. ( 'compact' === $d['layout'] ? 'body{font-size:13px}.inv{padding:26px 28px}h1{font-size:22px}.hd{margin-bottom:14px}td{padding:6px}th{padding:6px}.meta,.flds{padding:8px 0;margin-bottom:12px}' : '' )
		. ( 'bold' === $d['layout'] ? 'h1{font-size:42px}th{background:var(--c);color:#fff;border-bottom:0}.tbox .gt{background:var(--c);color:#fff;border:0;padding:12px 14px;border-radius:10px}.tbox .gt b{color:#fff}.meta .due b{font-size:26px}' : '' )
		. '@media(max-width:640px){.inv{padding:24px 18px;margin:0;border-radius:0}.hd{flex-direction:column}.hd .ttl{text-align:left}.two{grid-template-columns:1fr}.meta .due{margin-left:0;text-align:left}.tbox{min-width:0;width:100%}' . ( 'modern' === $d['layout'] ? '.hd.first{margin:-24px -18px 20px;padding:22px 18px}' : '' ) . '}'
		. '@media print{body{background:#fff}.inv{box-shadow:none;margin:0;max-width:none;border-radius:0}.np,.tools{display:none!important}}';
	$title = ( isset( $inv->number ) ? $inv->number . ' – ' : '' ) . ( $p ? $p->business : 'Invoice' );
	$tools = 'page' === $mode ? '<div class="tools np"><button class="btn ghost" onclick="print()">🖨️ Print / Save PDF</button></div>' : '';
	$auto  = 'print' === $mode ? '<script>addEventListener("load",function(){setTimeout(function(){print();},400);});</script>' : '';
	return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>' . esc_html( $title ) . '</title>' . $gf . '<style>' . $css . '</style></head><body>' . $tools . '<div class="inv">' . $stamp . $body . '</div>' . ( 'page' === $mode && function_exists( 'dreamscaper_pro_socials_footer' ) ? '<div class="np" style="max-width:820px;margin:0 auto 24px;padding:0 16px">' . dreamscaper_pro_socials_footer( $p ) . '</div>' : '' ) . $auto . '</body></html>';
}

/** Live preview: the invoice being edited (or a sample) with a design. */
function dreamscaper_rest_invoice_preview( WP_REST_Request $r ) {
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	$j      = $r->get_json_params();
	$design = isset( $j['design'] ) && is_array( $j['design'] ) ? dreamscaper_invoice_design_preview( $j['design'], dreamscaper_invoice_design( $p ) ) : dreamscaper_invoice_design( $p );
	$i      = isset( $j['invoice'] ) && is_array( $j['invoice'] ) ? $j['invoice'] : array();
	$c      = ! empty( $i['client_id'] ) ? dreamscaper_crm_get( 'clients', (int) $i['client_id'], $p->user_id ) : null;
	if ( ! $c ) {
		$c = (object) array( 'name' => 'Jane Smith', 'company' => '', 'address' => '123 Example St', 'town' => 'Farmington', 'state' => 'CT', 'zip' => '06032', 'phone' => '(860) 555-0100', 'email' => 'jane@example.com' );
	}
	$items = isset( $i['items'] ) ? dreamscaper_invoice_items_clean( $i['items'] ) : array();
	if ( ! $items ) {
		$items = array( array( 'name' => 'Spring clean-up', 'desc' => 'Beds edged, weeded and cleared; leaves removed.', 'date' => '', 'qty' => 1, 'unit' => 'job', 'rate' => 450, 'taxable' => true ), array( 'name' => 'Double-ground hardwood mulch', 'desc' => '', 'date' => '', 'qty' => 8, 'unit' => 'yd³', 'rate' => 68, 'taxable' => true ) );
	}
	$opts = dreamscaper_invoice_opts_clean( isset( $i['opts'] ) && is_array( $i['opts'] ) ? $i['opts'] : array(), array( 'taxPct' => $design['taxPct'], 'fields' => array_values( array_filter( $design['fields'], function ( $f ) { return '' !== $f['value']; } ) ) ) );
	$inv  = array( 'number' => isset( $i['number'] ) && $i['number'] ? sanitize_text_field( $i['number'] ) : 'INV-1001', 'title' => '', 'items' => $items, 'opts' => $opts, 'status' => isset( $i['status'] ) ? sanitize_key( $i['status'] ) : 'sent', 'due' => isset( $i['due'] ) ? sanitize_text_field( $i['due'] ) : gmdate( 'Y-m-d', strtotime( '+' . (int) $design['netDays'] . ' days' ) ), 'recur' => isset( $i['recur'] ) ? sanitize_key( $i['recur'] ) : '', 'created' => gmdate( 'Y-m-d H:i:s' ), 'token' => '' );
	return array( 'html' => dreamscaper_invoice_html( $inv, $p, $c, $design, 'preview' ), 'totals' => dreamscaper_invoice_calc( $items, $opts ) );
}
/** A design for previewing only (no logo upload; a pasted data URL is shown as-is). */
function dreamscaper_invoice_design_preview( $in, $base ) {
	$logo = isset( $in['logo'] ) ? (string) $in['logo'] : null;
	unset( $in['logo'] );
	$d = dreamscaper_invoice_design_clean( $in, $base );
	if ( null !== $logo ) {
		$d['logo'] = 0 === strpos( $logo, 'data:image/' ) || preg_match( '#^https?://#', $logo ) ? $logo : '';
	}
	return $d;
}

/* ------------------------------------------------------------- reminders */

/** Merge codes added for reminders. */
function dreamscaper_invoice_extra_codes( $inv ) {
	$due  = $inv->due ? strtotime( $inv->due . ' 12:00:00 UTC' ) : time();
	$late = (int) floor( ( time() - $due ) / DAY_IN_SECONDS );
	return array( 'days_late' => (string) max( 0, $late ), 'days_until_due' => (string) max( 0, -$late ), 'amount_due' => dreamscaper_tpl_money( $inv->amount, true ), 'invoice_total' => dreamscaper_tpl_money( $inv->amount, true ) );
}
/** The reminder plan that applies to an invoice ([] = none). */
function dreamscaper_invoice_plan( $inv, $p ) {
	$o = dreamscaper_json( isset( $inv->opts ) ? $inv->opts : '' );
	$mode = isset( $o['remind'] ) ? $o['remind'] : '';
	if ( 'off' === $mode ) {
		return array();
	}
	if ( 'custom' === $mode ) {
		return isset( $o['reminders'] ) ? $o['reminders'] : array();
	}
	return dreamscaper_invoice_design( $p )['reminders'];
}
/** When a reminder is due (UNIX time): 10 am site time on the day before / on / after the due date. */
function dreamscaper_invoice_reminder_time( $inv, $r ) {
	$off  = 'before' === $r['when'] ? -$r['days'] : ( 'after' === $r['when'] ? $r['days'] : 0 );
	$date = gmdate( 'Y-m-d', strtotime( $inv->due . ' 12:00:00 UTC' ) + $off * DAY_IN_SECONDS );
	$tz   = wp_timezone();
	return ( new DateTimeImmutable( $date . ' 10:00:00', $tz ) )->getTimestamp();
}
add_action( 'dreamscaper_crm_tick', 'dreamscaper_invoice_reminders_tick', 20 );
function dreamscaper_invoice_reminders_tick() {
	global $wpdb;
	if ( ! function_exists( 'dreamscaper_tpl_send' ) ) {
		return;
	}
	$I    = dreamscaper_t( 'invoices' );
	$rows = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM $I WHERE status='sent' AND due IS NOT NULL AND opts IS NOT NULL AND opts LIKE %s AND due >= %s ORDER BY id LIMIT 300", '%"remind"%', gmdate( 'Y-m-d', time() - 400 * DAY_IN_SECONDS ) ) );
	$pros = array();
	foreach ( $rows as $inv ) {
		if ( ! isset( $pros[ $inv->pro_id ] ) ) {
			$pros[ $inv->pro_id ] = dreamscaper_pro_row( $inv->pro_id );
		}
		$p = $pros[ $inv->pro_id ];
		if ( ! $p || ! dreamscaper_sub_can_send( $p->user_id ) ) {
			continue;
		}
		$plan = dreamscaper_invoice_plan( $inv, $p );
		if ( ! $plan ) {
			continue;
		}
		$o    = dreamscaper_json( $inv->opts );
		$sent = isset( $o['sent'] ) && is_array( $o['sent'] ) ? $o['sent'] : array();
		$sentAt = $inv->sent_at ? strtotime( $inv->sent_at . ' UTC' ) : 0;
		$changed = false;
		foreach ( $plan as $k => $r ) {
			if ( empty( $r['on'] ) || isset( $sent[ $k ] ) ) {
				continue;
			}
			$at = dreamscaper_invoice_reminder_time( $inv, $r );
			if ( time() < $at ) {
				continue;
			}
			// skip reminders that were already in the past when the invoice was sent, or missed by days
			if ( $at < $sentAt || time() - $at > 2 * DAY_IN_SECONDS ) {
				$sent[ $k ] = 'skipped';
				$changed    = true;
				continue;
			}
			$c = $inv->client_id ? dreamscaper_crm_get( 'clients', $inv->client_id, $p->user_id ) : null;
			if ( ! $c ) {
				continue;
			}
			$ch  = 'both' === $r['channel'] ? array( 'email', 'sms' ) : array( $r['channel'] );
			$res = dreamscaper_tpl_send( $p, 'invoice_overdue', array( 'invoice' => $inv, 'client' => $c ), dreamscaper_tpl_to_client( $c ), array(
				'force' => true, 'channels' => $ch, 'quiet' => true, 'subject' => $r['subject'], 'email' => $r['email'], 'sms' => $r['sms'],
				'extra' => dreamscaper_invoice_extra_codes( $inv ), 'link' => dreamscaper_invoice_url( $inv->token ), 'button' => $p->stripe_ready ? 'View & pay invoice' : 'View invoice', 'target' => $inv->id,
			) );
			if ( in_array( 'quiet hours', $res['errors'], true ) && ! $res['sent'] ) {
				continue; // a text during quiet hours waits for the morning
			}
			$sent[ $k ] = time();
			$changed    = true;
		}
		if ( $changed ) {
			$o['sent'] = $sent;
			$wpdb->update( $I, array( 'opts' => wp_json_encode( $o ), 'reminded_at' => dreamscaper_now() ), array( 'id' => $inv->id ) );
		}
	}
}

/** Send one reminder (draft wording) to the contractor themself. */
function dreamscaper_rest_invoice_test( WP_REST_Request $r ) {
	$p = dreamscaper_crm_pro();
	if ( is_wp_error( $p ) ) {
		return $p;
	}
	if ( ! dreamscaper_limit( 'invtest', 20, HOUR_IN_SECONDS ) ) {
		return dreamscaper_crm_err( 'That’s a lot of test messages — try again later.', 429 );
	}
	$j   = $r->get_json_params();
	$rm  = dreamscaper_invoice_reminders_clean( array( isset( $j['reminder'] ) ? $j['reminder'] : array() ) )[0];
	$inv = (object) array( 'id' => 0, 'number' => 'INV-1001', 'title' => 'Spring clean-up', 'amount' => 994, 'due' => gmdate( 'Y-m-d', strtotime( '-7 days' ) ), 'token' => 'sample', 'quote_id' => 0, 'client_id' => 0 );
	$u   = get_userdata( $p->user_id );
	$to  = array( 'email' => is_email( $p->email ) ? $p->email : ( $u ? $u->user_email : '' ), 'phone' => $p->phone, 'name' => $p->contact );
	$c   = (object) array( 'id' => 0, 'name' => $p->contact ? $p->contact : 'Jane Smith', 'email' => $to['email'], 'phone' => $p->phone, 'user_id' => 0 );
	$res = dreamscaper_tpl_send( $p, 'invoice_overdue', array( 'invoice' => $inv, 'client' => $c ), $to, array( 'force' => true, 'channels' => 'both' === $rm['channel'] ? array( 'email', 'sms' ) : array( $rm['channel'] ), 'quiet' => false, 'subject' => '[Test] ' . $rm['subject'], 'email' => $rm['email'], 'sms' => $rm['sms'], 'extra' => dreamscaper_invoice_extra_codes( $inv ), 'link' => home_url( '/' ), 'button' => 'View & pay invoice' ) );
	return array( 'sent' => $res['sent'], 'channels' => $res['channels'], 'errors' => $res['errors'] );
}

<?php
// Run from the repo root: php tests/invoices-equipment.test.php dreamscaper
// Loads includes/invoices.php and includes/equipment.php with tiny WordPress stand-ins.
define( 'ABSPATH', '/' );
define( 'DAY_IN_SECONDS', 86400 );
define( 'HOUR_IN_SECONDS', 3600 );
define( 'MB_IN_BYTES', 1048576 );
function add_action() {}
function add_filter() {}
function register_rest_route() {}
function esc_html( $s ) { return htmlspecialchars( (string) $s, ENT_QUOTES ); }
function esc_attr( $s ) { return esc_html( $s ); }
function esc_url( $s ) { return (string) $s; }
function esc_url_raw( $s ) { return (string) $s; }
function sanitize_text_field( $s ) { return trim( strip_tags( (string) $s ) ); }
function sanitize_textarea_field( $s ) { return trim( strip_tags( (string) $s ) ); }
function sanitize_key( $s ) { return preg_replace( '/[^a-z0-9_\-]/', '', strtolower( (string) $s ) ); }
function wp_json_encode( $v ) { return json_encode( $v ); }
function wp_list_pluck( $l, $k ) { return array_map( function ( $x ) use ( $k ) { return $x[ $k ]; }, $l ); }
function wp_date( $f, $t = null ) { return gmdate( $f, null === $t ? time() : $t ); }
function wp_timezone() { return new DateTimeZone( 'UTC' ); }
function rest_url( $p ) { return 'https://x/wp-json/' . $p; }
function home_url( $p = '' ) { return 'https://x' . $p; }
function wp_generate_password( $n ) { return substr( md5( uniqid( '', true ) ), 0, $n ); }
function dreamscaper_json( $s, $d = array() ) { $j = json_decode( (string) $s, true ); return is_array( $j ) ? $j : $d; }
function dreamscaper_opt( $k ) { return 'pay_ach' === $k ? 1 : ''; }
function dreamscaper_crm_store_image( $u ) { return 'https://x/uploads/logo.png'; }
function dreamscaper_pro_settings( $p ) { return isset( $p->settings ) ? $p->settings : array(); }
$root = $argv[1];
require $root . '/includes/invoices.php';
require $root . '/includes/equipment.php';
$fail = 0;
function t( $ok, $m ) { global $fail; echo ( $ok ? 'PASS ' : 'FAIL ' ) . $m . "\n"; if ( ! $ok ) { $fail++; } }

// --- totals
$items = dreamscaper_invoice_items_clean( array( array( 'name' => 'Clean-up', 'qty' => 1, 'rate' => 400 ), array( 'name' => 'Mulch', 'qty' => 8, 'rate' => 50, 'taxable' => false ), array( 'name' => '', 'qty' => 1, 'rate' => 99 ) ) );
t( 2 === count( $items ), 'blank lines dropped' );
$c = dreamscaper_invoice_calc( $items, array( 'taxPct' => 6.35, 'discount' => array( 'type' => 'pct', 'value' => 10 ) ) );
t( 800.0 === $c['subtotal'] && 80.0 === $c['discount'], 'subtotal 800, 10% discount 80' );
t( abs( $c['tax'] - 22.86 ) < 0.001, 'tax only on taxable lines after their share of the discount (400×0.9×6.35% = 22.86)' );
t( abs( $c['total'] - 742.86 ) < 0.001, 'total 742.86' );
$c2 = dreamscaper_invoice_calc( $items, array( 'discount' => array( 'type' => 'amt', 'value' => 5000 ) ) );
t( 0.0 === (float) $c2['total'], 'a fixed discount never makes the total negative' );
// --- repeats
t( '2026-03-15' === dreamscaper_invoice_next_date( 'monthly', array(), '2026-02-15' ), 'monthly' );
t( '2026-03-01' === dreamscaper_invoice_next_date( 'biweekly', array(), '2026-02-15' ), 'every 2 weeks' );
t( '2026-05-15' === dreamscaper_invoice_next_date( 'quarterly', array(), '2026-02-15' ), 'quarterly' );
t( '2026-03-29' === dreamscaper_invoice_next_date( 'custom', array( 'every' => array( 'n' => 6, 'unit' => 'week' ) ), '2026-02-15' ), 'custom: every 6 weeks' );
t( '2026-02-25' === dreamscaper_invoice_next_date( 'custom', array( 'every' => array( 'n' => 10, 'unit' => 'day' ) ), '2026-02-15' ), 'custom: every 10 days' );
t( 'every 6 weeks' === dreamscaper_invoice_recur_label( 'custom', array( 'every' => array( 'n' => 6, 'unit' => 'week' ) ) ), 'custom repeat label' );
// --- design cleaning
$d = dreamscaper_invoice_design_clean( array( 'color' => '#FF0000', 'font' => 'Comic Sans', 'layout' => 'bold', 'sections' => array( array( 'id' => 'items', 'on' => true ), array( 'id' => 'header', 'on' => true ), array( 'id' => 'evil', 'on' => true ) ), 'reminders' => array( array( 'when' => 'after', 'days' => 5, 'channel' => 'both', 'subject' => '<b>Hi</b>', 'on' => true ) ), 'logo' => 'data:image/png;base64,xx' ) );
t( '#ff0000' === $d['color'] && 'system' === $d['font'] && 'bold' === $d['layout'], 'color kept, unknown font ignored, layout set' );
t( 'items' === $d['sections'][0]['id'] && 'header' === $d['sections'][1]['id'] && ! in_array( 'evil', wp_list_pluck( $d['sections'], 'id' ), true ) && count( $d['sections'] ) === count( dreamscaper_invoice_sections() ), 'section order kept, unknown dropped, missing ones added (hidden)' );
t( 'Hi' === $d['reminders'][0]['subject'] && 'both' === $d['reminders'][0]['channel'], 'reminder cleaned' );
t( 'https://x/uploads/logo.png' === $d['logo'], 'logo upload stored' );
// --- renderer
$p   = (object) array( 'business' => 'Green Acres <LLC>', 'address' => '1 Yard Rd', 'town' => 'Hartford', 'zip' => '06103', 'phone' => '860-555-0100', 'email' => 'a@b.c', 'website' => 'https://green.example', 'logo' => '', 'stripe_ready' => true );
$cl  = (object) array( 'name' => 'Jane Smith', 'company' => '', 'address' => '12 Oak St', 'town' => 'Hartford', 'state' => 'CT', 'zip' => '06103', 'phone' => '', 'email' => '' );
$des = dreamscaper_invoice_design_defaults();
$des['layout'] = 'modern';
$des['license'] = 'CT HIC #0654321';
$des['sections'] = array_merge( array( array( 'id' => 'totals', 'on' => true ) ), array_values( array_filter( $des['sections'], function ( $s ) { return 'totals' !== $s['id']; } ) ) );
$inv = array( 'number' => 'INV-1007', 'items' => $items, 'opts' => array( 'taxPct' => 6.35, 'discount' => array( 'type' => 'pct', 'value' => 10 ), 'fields' => array( array( 'label' => 'PO #', 'value' => 'A-77' ) ), 'notes' => 'Thanks!' ), 'status' => 'sent', 'due' => '2026-06-01', 'recur' => 'custom', 'created' => '2026-05-18 10:00:00', 'token' => 'tok123' );
$inv['opts']['every'] = array( 'n' => 6, 'unit' => 'week' );
$html = dreamscaper_invoice_html( $inv, $p, $cl, $des, 'page' );
t( false !== strpos( $html, 'Green Acres &lt;LLC&gt;' ), 'business name escaped' );
t( false !== strpos( $html, '$742.86' ) && false !== strpos( $html, 'PO #' ) && false !== strpos( $html, 'A-77' ), 'total and custom field shown' );
t( false !== strpos( $html, 'Every 6 weeks' ), 'custom repeat shown' );
t( strpos( $html, 'class="tots"' ) < strpos( $html, 'class="hd' ), 'section order respected (totals moved first)' );
t( false !== strpos( $html, 'data-m="card"' ) && false !== strpos( $html, 'data-m="ach"' ), 'pay buttons on the customer page' );
t( false !== strpos( $html, 'CT HIC #0654321' ), 'license line' );
$prev = dreamscaper_invoice_html( $inv, $p, $cl, $des, 'preview' );
t( false === strpos( $prev, 'data-m="card"' ), 'no pay buttons in the preview' );
$paid = dreamscaper_invoice_html( array_merge( $inv, array( 'status' => 'paid', 'paid_at' => '2026-05-20 10:00:00' ) ), $p, $cl, $des, 'page' );
t( false !== strpos( $paid, 'class="stamp"' ) && false !== strpos( $paid, 'Balance due' ), 'paid: stamp and zero balance' );
file_put_contents( sys_get_temp_dir() . '/ds-invoice-sample.html', $html );
// --- reminder timing
$ri = (object) array( 'due' => '2026-06-01' );
t( '2026-05-29 10:00' === gmdate( 'Y-m-d H:i', dreamscaper_invoice_reminder_time( $ri, array( 'when' => 'before', 'days' => 3 ) ) ), 'reminder 3 days before, 10 am' );
t( '2026-06-08 10:00' === gmdate( 'Y-m-d H:i', dreamscaper_invoice_reminder_time( $ri, array( 'when' => 'after', 'days' => 7 ) ) ), 'reminder 7 days after' );
$plan = dreamscaper_invoice_plan( (object) array( 'opts' => '{"remind":"off"}' ), (object) array() );
t( array() === $plan, 'reminders off → none' );
$plan = dreamscaper_invoice_plan( (object) array( 'opts' => '{"remind":"default"}' ), (object) array() );
t( count( $plan ) >= 5 && 'before' === $plan[0]['when'], 'default plan used' );

// --- equipment
$cat = dreamscaper_equipment_catalog();
t( count( $cat ) >= 20 && count( $cat['ztr_mower'][3] ) >= 8 && 'miles' === $cat['truck'][2], 'catalog of common equipment with tasks' );
$tasks = dreamscaper_equipment_tasks_from( 'ztr_mower' );
t( 'Change engine oil & filter' === $tasks[0]['name'] && 100.0 === $tasks[0]['meter'] && 365 === $tasks[0]['days'], 'mower oil every 100 hrs / 365 days' );
$e = (object) array( 'meter_unit' => 'hours', 'meter' => 192, 'created' => gmdate( 'Y-m-d H:i:s', time() - 30 * DAY_IN_SECONDS ), 'meter0' => 100 );
$st = dreamscaper_equipment_task_status( $e, array( 'meter' => 100, 'days' => 365, 'last_date' => '', 'last_meter' => null ), 10 );
t( 'soon' === $st['state'] && false !== strpos( $st['left'], 'in 8 hrs' ), '92 of 100 hrs → soon, "in 8 hrs" (' . $st['left'] . ')' );
$st = dreamscaper_equipment_task_status( $e, array( 'meter' => 50, 'days' => 0, 'last_date' => '', 'last_meter' => 120 ), 10 );
t( 'due' === $st['state'] && false !== strpos( $st['left'], '22 hrs over' ), 'last done at 120, now 192, every 50 → due, 22 over' );
$st = dreamscaper_equipment_task_status( $e, array( 'meter' => 0, 'days' => 30, 'last_date' => gmdate( 'Y-m-d', time() - 40 * DAY_IN_SECONDS ), 'last_meter' => null ), 10 );
t( 'due' === $st['state'] && false !== strpos( $st['left'], 'overdue' ), 'date-based: 40 days since, every 30 → overdue' );
$st = dreamscaper_equipment_task_status( (object) array( 'meter_unit' => 'miles', 'meter' => 1000, 'created' => gmdate( 'Y-m-d H:i:s' ), 'meter0' => 0 ), array( 'meter' => 5000, 'days' => 180, 'last_date' => gmdate( 'Y-m-d' ), 'last_meter' => 0 ), 10 );
t( 'ok' === $st['state'] && false !== strpos( $st['left'], 'in 4,000 mi' ), 'truck oil: 1,000 of 5,000 mi → ok, "in 4,000 mi or in 180 days" (' . $st['left'] . ')' );
$clean = dreamscaper_equipment_tasks_clean( array( array( 'id' => 'abc12', 'name' => 'Oil', 'meter' => 100 ), array( 'name' => '' ) ), array( array( 'id' => 'abc12', 'last_date' => '2026-01-01', 'last_meter' => 50, 'notified' => array( 'state' => 'soon' ) ) ) );
t( 1 === count( $clean ) && '2026-01-01' === $clean[0]['last_date'] && 50.0 === (float) $clean[0]['last_meter'], 'editing tasks keeps their history' );
echo $fail ? "\n$fail FAILED\n" : "\nALL PASSED\n";
exit( $fail ? 1 : 0 );

import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../dreamscaper/assets/js/takeoff.js';

const rect = (id, kind, w, h, props = {}, extra = {}) => ({ id, kind, pts: [[0, 0], [w, 0], [w, h], [0, h]], closed: true, props, ...extra });

test('ft-in format and parse', () => {
	assert.equal(T.fmtFtIn(32.5), `32' 6"`);
	assert.equal(T.fmtFtIn(0.75), `9"`);
	assert.equal(T.fmtFtIn(10), `10'`);
	for (const [s, v] of [[`32' 6"`, 32.5], [`32'6`, 32.5], ['32 6', 32.5], ['32ft 6in', 32.5], ['32.5', 32.5], ['390"', 32.5], ['8\'', 8]]) assert.equal(T.parseFtIn(s), v, s);
	assert.ok(Number.isNaN(T.parseFtIn('abc')));
});

test('geometry: area and perimeter', () => {
	const m = T.measure(rect('a', 'bed', 20, 20));
	assert.equal(m.area, 400);
	assert.equal(m.perimeter, 80);
	const walk = T.measure({ id: 'w', kind: 'walkway', pts: [[0, 0], [30, 0]], closed: false, props: { width: 4 } });
	assert.equal(walk.length, 30);
	assert.equal(walk.area, 120);
});

test('smooth outline area is close to the polygon for a circle-ish shape', () => {
	const n = 16, pts = Array.from({ length: n }, (_, i) => [10 * Math.cos((i / n) * 2 * Math.PI), 10 * Math.sin((i / n) * 2 * Math.PI)]);
	const a = T.measure({ id: 'c', kind: 'bed', pts, closed: true, smooth: true, props: {} }).area;
	assert.ok(Math.abs(a - Math.PI * 100) / (Math.PI * 100) < 0.02, String(a));
});

test('400 sq ft mulch bed at 3" → 3.7 yd³ measured, 4 yd³ ordered', () => {
	const secs = T.planToSections({ shapes: [rect('b', 'bed', 20, 20, { cover: 'mulch', depth: 3, edging: 'steel' })] });
	const mulch = secs.find((s) => /Mulch/.test(s.title));
	assert.equal(Math.round(mulch.qty.raw * 10) / 10, 3.7);
	assert.equal(mulch.qty.cy, 4);
	assert.equal(mulch.comps.find((c) => c.kind === 'material').qty, 4);
	const edge = secs.find((s) => /edging/i.test(s.title));
	assert.equal(edge.qty.length, 80);
	assert.ok(secs.at(-1).title === 'Final cleanup');
	assert.ok(mulch.scope.some((x) => /4 yd³/.test(x) && /3" depth/.test(x)));
});

test('patio takeoff quantities', () => {
	const [sec] = T.planToSections({ shapes: [rect('p', 'patio', 20, 15, { material: 'Concrete pavers' })] }).filter((s) => s.title.startsWith('Patio'));
	const get = (re) => sec.comps.find((c) => re.test(c.name));
	assert.equal(get(/^Concrete pavers/).qty, Math.ceil(300 * 1.08));
	assert.equal(get(/Edge restraint/).qty, 70);
	assert.equal(get(/Polymeric/).qty, 4);
	assert.equal(get(/gravel base/).qty, 9);
});

test('wall, removals, plants, lighting', () => {
	const shapes = [
		{ id: 'w', kind: 'wall', pts: [[0, 0], [30, 0]], closed: false, props: { height: 3 } },
		{ id: 't', kind: 'plant', pts: [[1, 1]], existing: true, remove: true, props: { name: 'Overgrown yew', cat: 'shrubs', count: 3 } },
		{ id: 'p1', kind: 'plant', pts: [[2, 2]], props: { id: 'hyd', name: 'Limelight hydrangea', cat: 'shrubs' } },
		{ id: 'p2', kind: 'plant', pts: [[3, 2]], props: { id: 'hyd', name: 'Limelight hydrangea', cat: 'shrubs' } },
		{ id: 'p3', kind: 'plant', pts: [[3, 3]], props: { id: 'cat', name: 'Catmint', cat: 'perennials', count: 5 } },
		{ id: 'l', kind: 'light', pts: [[0, 0]], props: { type: 'Path light', count: 6 } },
		{ id: 'h', kind: 'house', pts: [[0, 0], [10, 0], [10, 10]], closed: true, existing: true, props: {} }
	];
	const secs = T.planToSections({ shapes });
	assert.equal(secs[0].title, 'Removals & site prep');
	const wall = secs.find((s) => s.title.startsWith('Retaining'));
	assert.equal(wall.qty.face, 90);
	assert.equal(wall.comps.find((c) => /block/i.test(c.name) && c.unit === 'block').qty, Math.ceil((90 / 0.667) * 1.05));
	const pl = secs.find((s) => s.title === 'Planting');
	assert.equal(pl.qty.plants, 7);
	assert.ok(pl.scope.some((x) => /2 × Limelight hydrangea/.test(x)));
	const li = secs.find((s) => s.title === 'Landscape lighting');
	assert.equal(li.qty.fixtures, 6);
	assert.ok(!secs.some((s) => /House/.test(s.title)));
});

test('pricing: markup mode, overhead, tax, deposit, override', () => {
	const est = { sections: [{ id: 'a', title: 'A', comps: [{ kind: 'material', qty: 10, unit: 'ea', unitCost: 10 }, { kind: 'labor', qty: 2, unit: 'hr', unitCost: 0, rate: true }] }] };
	const costs = { laborRate: 50, overheadPct: 10, mode: 'markup', markup: { material: 50, labor: 100 }, taxPct: 10, taxOn: 'all', depositPct: 50, minJob: 0, roundTo: 0 };
	const t = T.priceEstimate(est, costs);
	assert.equal(t.direct, 200);
	assert.equal(t.cost, 220);
	assert.equal(t.price, 350);
	assert.equal(t.tax, 35);
	assert.equal(t.total, 385);
	assert.equal(t.gp, 130);
	assert.equal(t.deposit, 192.5);
	est.sections[0].priceOverride = 500;
	assert.equal(T.priceEstimate(est, costs).price, 500);
});

test('pricing: margin mode hits the target gross margin', () => {
	const est = { sections: [{ id: 'a', title: 'A', comps: [{ kind: 'material', qty: 1, unit: 'ea', unitCost: 600 }] }] };
	const t = T.priceEstimate(est, { mode: 'margin', marginPct: 40, overheadPct: 0, taxPct: 0, minJob: 0, roundTo: 0 });
	assert.equal(t.price, 1000);
	assert.equal(t.margin, 40);
});

test('optional sections are excluded from totals; min job applies', () => {
	const est = { sections: [{ id: 'a', title: 'A', comps: [{ kind: 'material', qty: 1, unitCost: 100 }] }, { id: 'b', title: 'B', optional: true, comps: [{ kind: 'material', qty: 1, unitCost: 1000 }] }] };
	const t = T.priceEstimate(est, { markup: { material: 0 }, overheadPct: 0, taxPct: 0, minJob: 350, roundTo: 0 });
	assert.equal(t.price, 350);
	assert.equal(t.minBump, 250);
});

test('documents: job cost has every line; proposal hides costs', () => {
	const secs = T.planToSections({ shapes: [rect('b', 'bed', 20, 20, { cover: 'mulch' })] });
	const d = T.buildDocuments({ sections: secs }, {});
	assert.ok(d.jobCost.lines.length >= 4);
	assert.ok(d.proposal.sections.every((s) => !('comps' in s)));
	assert.equal(d.proposal.total, d.totals.total);
});

test('Dreamscape aerial view converts to a to-scale plan', () => {
	const view = { kind: 'aerial', ppf: 4, W: 800, H: 800, ops: [{ t: 'poly', mat: 'm1', edging: 'steel', pts: [[0, 0], [80, 0], [80, 80], [0, 80]] }], objects: [{ item: 'x', x: 40, y: 40 }] };
	const plan = T.dreamscapeToPlan(view, { mat: () => ({ name: 'Black mulch', group: 'Mulch' }), item: () => ({ id: 'x', name: 'Boxwood', cat: 'shrubs' }) });
	assert.equal(plan.estimated, false);
	assert.equal(T.polyArea(plan.shapes[0].pts), 400);
	assert.equal(plan.shapes[0].props.edging, 'steel');
	assert.equal(plan.shapes[1].kind, 'plant');
});

test('photo view uses the camera model and is flagged as estimated', () => {
	const cam = { horizon: 300, camH: 5, focal: 800 };
	const g = T.groundPoint(500, 700, cam, 1000);
	assert.equal(g[1], 10); // 5*800/400
	assert.equal(T.groundPoint(500, 250, cam, 1000), null);
	const plan = T.dreamscapeToPlan({ kind: 'photo', W: 1000, H: 800, cam, ops: [{ t: 'poly', mat: 'm', pts: [[400, 700], [600, 700], [600, 500], [400, 500]] }], objects: [] }, { mat: () => ({ name: 'Mulch', group: 'Mulch' }) });
	assert.equal(plan.estimated, true);
	assert.ok(T.polyArea(plan.shapes[0].pts) > 0);
});

test('shortcodes merge and missing detection', () => {
	const d = { customer_first_name: 'Jane', project_name: 'Front Yard', quote_link: 'https://x' };
	assert.equal(T.merge('Hi {Customer_First_Name}, {project_name}: {quote_link}', d), 'Hi Jane, Front Yard: https://x');
	assert.deepEqual(T.missingCodes('{valid_until} {customer_first_name}', d), ['{valid_until}']);
});

test('default follow-up plan has 6 scheduled touches with email and text', () => {
	const base = new Date(2026, 4, 1, 9, 0).getTime();
	const s = T.scheduleFollowups(base);
	assert.equal(s.length, 6);
	assert.ok(s.every((x, i) => i === 0 || x.at > s[i - 1].at));
	assert.equal(new Date(s[0].at).getDate(), 2);
	assert.equal(new Date(s[0].at).getHours(), 10);
	assert.ok(s.some((x) => x.channel === 'sms') && s.some((x) => x.channel === 'email'));
	const codes = new Set(T.SHORTCODES.map((c) => c[0]));
	for (const f of T.DEFAULT_FOLLOWUPS) for (const m of (f.subject + f.body).match(/\{[a-z_]+\}/g) || []) assert.ok(codes.has(m), m);
});

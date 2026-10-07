/* DreamScaper – Design → Quantity takeoff → Estimate.
 *
 * Pure functions (no DOM) shared by the site plan, the Contractor Hub and the tests.
 * All geometry is in FEET. A plan is { shapes: [...] } where every shape is
 *   { id, kind, pts: [[x,y],...] (feet), closed, smooth, existing, remove, props: {...} }
 * Quantities come from the geometry, never from AI. AI may only write wording.
 */

/* ------------------------------------------------------------- formatting */

/** 32.5 → 32' 6"   0.75 → 9"   10 → 10' */
export function fmtFtIn(ft) {
	if (!Number.isFinite(ft)) return '';
	const neg = ft < 0;
	let inches = Math.round(Math.abs(ft) * 12);
	const f = Math.floor(inches / 12);
	inches -= f * 12;
	const s = f && inches ? `${f}' ${inches}"` : f ? `${f}'` : `${inches}"`;
	return neg ? '-' + s : s;
}

/** Accepts 32' 6", 32'6, 32 6, 32ft 6in, 32.5, 32.5', 390" → feet (or NaN). */
export function parseFtIn(s) {
	if (typeof s === 'number') return s;
	const t = String(s || '').trim().toLowerCase().replace(/feet|foot|ft/g, "'").replace(/inches|inch|in\b/g, '"').replace(/[’′]/g, "'").replace(/[”″]/g, '"');
	if (!t) return NaN;
	let m = t.match(/^(-?\d+(?:\.\d+)?)\s*'\s*(?:(\d+(?:\.\d+)?)\s*"?)?$/);
	if (m) return parseFloat(m[1]) + (m[2] ? parseFloat(m[2]) / 12 : 0);
	m = t.match(/^(-?\d+(?:\.\d+)?)\s*"$/);
	if (m) return parseFloat(m[1]) / 12;
	m = t.match(/^(-?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)$/);
	if (m) return parseFloat(m[1]) + parseFloat(m[2]) / 12;
	m = t.match(/^-?\d+(?:\.\d+)?$/);
	return m ? parseFloat(t) : NaN;
}

export const fmtArea = (sf) => `${Math.round(sf).toLocaleString('en-US')} sq ft`;
export const money = (v, cents = false) => (Number.isFinite(v) ? (v < 0 ? '-' : '') + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 }) : '$0');
export const round2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
const r1 = (v) => Math.round(v * 10) / 10;
const ceilTo = (v, step) => Math.ceil(v / step - 1e-9) * step;
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);

/* --------------------------------------------------------------- geometry */

/** Catmull-Rom sampling: the SAME curve the plan draws is the one we measure. */
export function sampleSmooth(pts, closed, per = 8) {
	const n = pts.length;
	if (n < 3) return pts.slice();
	const out = [];
	const get = (i) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
	const last = closed ? n : n - 1;
	for (let i = 0; i < last; i++) {
		const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
		for (let k = 0; k < per; k++) {
			const t = k / per, t2 = t * t, t3 = t2 * t;
			out.push([0, 1].map((d) => 0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3)));
		}
	}
	if (!closed) out.push(pts[n - 1].slice());
	return out;
}
export const outline = (s) => (s.smooth ? sampleSmooth(s.pts, !!s.closed) : s.pts);

export function polyArea(pts) {
	let a = 0;
	for (let i = 0, n = pts.length; i < n; i++) {
		const p = pts[i], q = pts[(i + 1) % n];
		a += p[0] * q[1] - q[0] * p[1];
	}
	return Math.abs(a) / 2;
}
export function pathLength(pts, closed) {
	let L = 0;
	for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
	if (closed && pts.length > 2) L += Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]);
	return L;
}
export function centroid(pts) {
	let x = 0, y = 0;
	for (const p of pts) { x += p[0]; y += p[1]; }
	return [x / pts.length, y / pts.length];
}

/** Measurements of one shape (feet / square feet). */
export function measure(s) {
	const o = outline(s);
	const p = s.props || {};
	if (GEOM[s.kind] === 'point') return { count: Math.max(1, Math.round(num(p.count, 1))) };
	if (s.closed) return { area: polyArea(o), perimeter: pathLength(o, true) };
	const length = pathLength(o, false);
	const width = num(p.width, 0);
	return { length, area: width ? length * width : 0, perimeter: width ? 2 * length + 2 * width : 0 };
}

/**
 * Photo (perspective) → ground plane in feet, using the Dreamscape camera model
 * (horizon line, camera height, focal length in px). Points at/above the horizon → null.
 */
export function groundPoint(x, y, cam, W) {
	const dy = y - cam.horizon;
	if (dy <= 0.5) return null;
	const camH = cam.camH || 5, f = cam.focal || 0.785 * W;
	const Z = (camH * f) / dy;
	return [((x - W / 2) * Z) / f, Z];
}

/* ------------------------------------------------------------ shape kinds */

/** kind → geometry: area (closed), line (open), point */
export const GEOM = {
	bed: 'area', lawn: 'area', patio: 'area', driveway: 'area', house: 'area', structure: 'area', boundary: 'area', zone: 'area', stone: 'area', grade: 'area',
	walkway: 'line', wall: 'line', edging: 'line', fence: 'line', measure: 'line', wire: 'line',
	plant: 'point', light: 'point', boulder: 'point', feature: 'point', note: 'point'
};
export const KINDS = {
	bed: { label: 'Planting bed', color: '#8a5a2b', icon: '🪴' },
	stone: { label: 'Stone area', color: '#9aa0a6', icon: '🪨' },
	lawn: { label: 'Lawn', color: '#4caf50', icon: '🌱' },
	patio: { label: 'Patio', color: '#c9a27e', icon: '🧱' },
	walkway: { label: 'Walkway', color: '#d8b48a', icon: '🚶' },
	wall: { label: 'Retaining wall', color: '#7d6e63', icon: '🧱' },
	edging: { label: 'Edging', color: '#222', icon: '〰️' },
	fence: { label: 'Fence', color: '#a1887f', icon: '🚧' },
	grade: { label: 'Grading area', color: '#bf8f5f', icon: '⛰️' },
	plant: { label: 'Plant', color: '#2e7d32', icon: '🌿' },
	light: { label: 'Light', color: '#ffd54f', icon: '💡' },
	boulder: { label: 'Boulder', color: '#90a4ae', icon: '🪨' },
	feature: { label: 'Feature', color: '#7e57c2', icon: '⛲' },
	wire: { label: 'Lighting wire', color: '#ffb300', icon: '🔌' },
	house: { label: 'House', color: '#607d8b', icon: '🏠' },
	structure: { label: 'Structure', color: '#78909c', icon: '🏚️' },
	driveway: { label: 'Driveway', color: '#9e9e9e', icon: '🚗' },
	boundary: { label: 'Property line', color: '#e53935', icon: '📐' },
	zone: { label: 'Zone', color: '#26c6da', icon: '🔷' },
	measure: { label: 'Measurement', color: '#00b0ff', icon: '📏' },
	note: { label: 'Note', color: '#fff176', icon: '📝' }
};

/* ------------------------------------------------------------- price book */

/** Contractor-editable defaults (Connecticut 2025–26 wholesale ballparks). Costs are YOUR cost. */
export const PRICEBOOK = {
	mulch: { name: 'Mulch', unit: 'yd³', cost: 38, waste: 5, hrsPerUnit: 0.75, prepPer100: 0.5, types: 'Double-ground hardwood | Black dyed | Brown dyed | Red cedar | Pine bark nuggets | Leaf compost' },
	stone: { name: 'Decorative stone', unit: 'ton', cost: 62, tonsPerCy: 1.35, waste: 5, hrsPerUnit: 1.0, fabric: 0.14, fabricPer100: 0.4, types: '3/4" crushed stone | Pea stone | River rock 1–3" | Marble chips | Mason sand' },
	newbed: { name: 'New bed (turf removal & soil prep)', removePer100: 1.5, tillPer100: 0.5, compostCost: 46, compostIn: 2, sodDepthIn: 3, disposalPerCy: 45, sodCutterDay: 95, sodCutterMin: 250 },
	edging: { name: 'Edging', steel: [3.25, 0.06], aluminum: [2.85, 0.06], plastic: [0.95, 0.05], stone: [4.1, 0.12], brick: [3.6, 0.12], natural: [0.0, 0.04] },
	sod: { name: 'Sod', unit: 'pallet', cost: 190, sfPerPallet: 450, waste: 5, prepPer100: 0.6, layPer100: 0.5, topsoilIn: 1, topsoilCost: 42 },
	seed: { name: 'Seed', lbsPer1000: 8, lbCost: 4.5, strawPer1000: 2, strawCost: 9, prepPer100: 0.5, topsoilIn: 0.5, topsoilCost: 42 },
	pavers: { name: 'Pavers', sfCost: 4.6, waste: 8, curveWaste: 12, baseIn: 6, beddingIn: 1, paverIn: 2.375, gravelTonCost: 32, sandTonCost: 38, tonsPerCy: 1.4, compact: 1.15, restraintLf: 1.6, polyBagCost: 36, sfPerBag: 75, hrsPerSf: 0.12, excavHrsPerCy: 0.6, disposalPerCy: 45, compactorDay: 95, sawDay: 90, machineDay: 350, machineMinSf: 250, sfPerDay: 300, stepCost: 260, stepHrs: 4,
		materials: 'Concrete pavers | Clay brick | Bluestone (thermal) | Natural flagstone | Porcelain pavers | Tumbled stone' },
	gravelpath: { name: 'Gravel path', baseIn: 4, stoneIn: 2, hrsPerSf: 0.05 },
	wall: { name: 'Retaining wall', blockSf: 0.667, blockCost: 4.4, capPerLf: 0.75, capCost: 6.8, waste: 5, baseGravelCyPerLf: 0.037, backfillCyPerFaceSf: 0.037, gravelTonCost: 32, drainLf: 1.25, fabricLf: 0.9, hrsPerFaceSf: 0.25, excavHrsPerLf: 0.15, geogridLf: 2.4, machineDay: 350, machineMinLf: 25 },
	plants: { name: 'Plants', trees: [260, 2.0, 15], evergreens: [215, 1.75, 12], shrubs: [46, 0.5, 4], perennials: [14, 0.15, 1], grasses: [22, 0.25, 1.5], annuals: [5, 0.06, 0.25], vines: [26, 0.3, 2], features: [0, 0.5, 0],
		sizes: { trees: '2–2.5" caliper B&B', evergreens: '6–7\' B&B', shrubs: '#3 container', perennials: '#1 container', grasses: '#2 container', annuals: '4" pot', vines: '#2 container', features: 'each' } },
	removal: { name: 'Removals', tree: [0, 4, 150], shrub: [0, 0.75, 15], plant: [0, 0.2, 2], lawn: [0, 1.5, 45], stump: [0, 1.5, 0], patio: [0, 0.08, 45], fence: [0, 0.15, 6], structure: [0, 6, 250], other: [0, 1, 25] },
	boulder: { name: 'Boulders', cost: 140, hrs: 0.75, machineDay: 350 },
	lighting: { name: 'Landscape lighting', fixture: 115, fixtureHrs: 0.6, transformer: 285, transformerHrs: 1.5, perTransformer: 18, wireLf: 0.95, wirePerFixture: 25, wireHrsPerLf: 0.02 },
	fence: { name: 'Fence', vinyl: [24, 0.35], wood: [19, 0.35], aluminum: [32, 0.35], splitrail: [9, 0.2], chainlink: [14, 0.25] },
	grade: { name: 'Grading', hrsPer100: 0.35, topsoilIn: 2, topsoilCost: 42 },
	delivery: { name: 'Delivery', cost: 85, loadCy: 15 },
	cleanup: { name: 'Final cleanup', hrs: 1.5 }
};

/** Contractor cost & pricing settings. */
export const DEFAULT_COSTS = {
	laborRate: 38, // burdened cost per crew hour (wage + taxes + workers comp + insurance)
	overheadPct: 12, // office, trucks, insurance — added to direct cost to get TRUE cost
	mode: 'markup', // 'markup' (per category) or 'margin' (target gross margin on everything)
	markup: { material: 50, labor: 100, equipment: 30, sub: 20, disposal: 25, delivery: 20, other: 30 },
	marginPct: 40,
	taxPct: 6.35, // Connecticut: landscaping services are taxable
	taxOn: 'all', // 'all' | 'materials' | 'none'
	depositPct: 30,
	minJob: 350,
	mobilization: 0,
	roundTo: 5,
	validDays: 30,
	showPrices: 'section' // 'section' | 'total'
};

export function mergeBook(over) {
	const out = JSON.parse(JSON.stringify(PRICEBOOK));
	for (const k in over || {}) if (out[k] && over[k] && typeof over[k] === 'object') Object.assign(out[k], over[k]);
	return out;
}
export function mergeCosts(over) {
	const out = { ...DEFAULT_COSTS, ...(over || {}) };
	out.markup = { ...DEFAULT_COSTS.markup, ...((over && over.markup) || {}) };
	return out;
}

/* --------------------------------------------------------- quantity rules */

const C = (kind, name, qty, unit, unitCost, extra) => ({ kind, name, qty: round2(qty), unit, unitCost: round2(unitCost), ...(extra || {}) });
const L = (name, hrs) => C('labor', name, hrs, 'hr', 0, { rate: true });
const cy = (sf, inches) => (sf * inches) / 12 / 27;

/** One plan shape → section(s): { title, comps, scope, qty } */
export function shapeSections(s, book) {
	const p = s.props || {};
	const m = measure(s);
	const out = [];
	const add = (title, comps, scope, extra) => out.push({ id: 'sec_' + s.id + '_' + out.length, shape: s.id, title, comps: comps.filter((c) => c && c.qty > 0), scope: scope.filter(Boolean), ...(extra || {}) });
	if (s.existing && !s.remove) return out;
	if (s.remove) return removalSections(s, m, book);
	const label = p.label ? ` – ${p.label}` : '';
	switch (s.kind) {
	case 'bed': {
		const area = m.area;
		if (p.isNew) out.push(...newBed(s, area, book, label));
		const cover = p.cover || 'mulch';
		if (cover === 'mulch') out.push(mulchSection(s, area, p, book, label));
		if (cover === 'stone') out.push(stoneSection(s, area, p, book, label));
		if (p.edging && p.edging !== 'none') out.push(edgingSection(s, m.perimeter, p.edging, book, label, p.edgeFrac));
		break;
	}
	case 'stone': out.push(stoneSection(s, m.area, p, book, label)); break;
	case 'lawn': {
		if (p.method === 'seed') out.push(seedSection(s, m.area, book, label));
		else if (p.method !== 'existing') out.push(sodSection(s, m.area, book, label));
		break;
	}
	case 'patio': out.push(paverSection(s, m.area, m.perimeter, p, book, 'Patio' + label, !!s.smooth)); break;
	case 'walkway': {
		const w = num(p.width, 4);
		const area = m.length * w;
		if (p.material === 'gravel') out.push(gravelPath(s, area, m.length, w, p, book, label));
		else out.push(paverSection(s, area, 2 * m.length + 2 * w, p, book, 'Walkway' + label, !!s.smooth, `${fmtFtIn(m.length)} long × ${fmtFtIn(w)} wide`));
		break;
	}
	case 'wall': out.push(wallSection(s, m.length, p, book, label)); break;
	case 'edging': out.push(edgingSection(s, m.length, p.type || 'steel', book, label)); break;
	case 'fence': {
		const t = p.type || 'vinyl', r = book.fence[t] || book.fence.vinyl, Lf = m.length;
		add(`Fence${label}`, [C('material', `${cap(t)} fence, ${p.height || 6}' high`, Lf, 'lf', r[0]), L('Install fence', Lf * r[1]), p.gates ? C('material', 'Gate', num(p.gates), 'ea', 280) : null],
			[`Install ${Math.round(Lf)} linear ft of ${t} fence, ${p.height || 6}' high${p.gates ? `, with ${p.gates} gate${p.gates > 1 ? 's' : ''}` : ''}, posts set per manufacturer specifications`, 'Call Before You Dig (811) is called to mark utilities before setting posts']);
		break;
	}
	case 'grade': {
		const g = book.grade;
		add(`Grading${label}`, [L('Rough & finish grade', (m.area / 100) * g.hrsPer100), C('material', 'Screened topsoil', ceilTo(cy(m.area, g.topsoilIn), 0.5), 'yd³', g.topsoilCost)],
			[`Grade ${fmtArea(m.area)} so water drains away from the house (min. 2% slope)`, `Add ${g.topsoilIn}" of screened topsoil where needed and rake smooth`]);
		break;
	}
	case 'boulder': {
		const n = m.count, b = book.boulder;
		add(`Boulders${label}`, [C('material', `Boulder${p.size ? ` (${p.size})` : ''}`, n, 'ea', b.cost), L('Set boulders', n * b.hrs), n >= 3 ? C('equipment', 'Skid steer / mini loader', 1, 'day', b.machineDay) : null],
			[`Set ${n} natural boulder${n > 1 ? 's' : ''}${p.size ? ` (${p.size})` : ''}, buried about one-third for a natural look`]);
		break;
	}
	case 'feature': {
		const n = m.count;
		add(p.name || 'Garden feature', [C('material', p.name || 'Garden feature', n, 'ea', num(p.cost, 0)), L('Install', n * num(p.hrs, 1))], [`Supply and install ${n} × ${p.name || 'garden feature'}`], { needsPrice: !num(p.cost, 0) });
		break;
	}
	default: break;
	}
	return out.filter((x) => x && x.comps && x.comps.length);
}

function cap(s) { return String(s).charAt(0).toUpperCase() + String(s).slice(1); }

function mulchSection(s, area, p, book, label) {
	const b = book.mulch, depth = num(p.depth, 3);
	const raw = cy(area, depth), qty = ceilTo(raw * (1 + b.waste / 100), 0.5);
	const type = p.material || 'double-ground hardwood';
	return { id: 'sec_' + s.id + '_mulch', shape: s.id, title: `Mulch installation${label}`, qty: { area, depth, cy: qty, raw },
		comps: [C('material', `${cap(type)} mulch`, qty, 'yd³', b.cost), C('delivery', 'Delivery', Math.max(1, Math.ceil(qty / book.delivery.loadCy)), 'load', book.delivery.cost), L('Bed preparation (weed, rake, define edge)', (area / 100) * b.prepPer100), L('Spread mulch', qty * b.hrsPerUnit)],
		scope: [`Prepare ${fmtArea(area)} of planting beds: remove weeds and debris and rake smooth`, `Install ${qty} yd³ of ${type} mulch at ${depth}" depth (${r1(raw)} yd³ measured + ${b.waste}% for settling)`, 'Keep mulch 2–3" away from stems, trunks and the house foundation', 'Clean up and haul away all debris'] };
}
function stoneSection(s, area, p, book, label) {
	const b = book.stone, depth = num(p.depth, 3);
	const yd = cy(area, depth) * (1 + b.waste / 100), tons = ceilTo(yd * b.tonsPerCy, 0.5);
	const type = p.material || '3/4" crushed stone';
	return { id: 'sec_' + s.id + '_stone', shape: s.id, title: `Decorative stone${label}`, qty: { area, depth, tons },
		comps: [C('material', type, tons, 'ton', b.cost), C('material', 'Commercial landscape fabric + staples', Math.ceil(area * 1.1), 'sq ft', b.fabric), C('delivery', 'Delivery', Math.max(1, Math.ceil(yd / book.delivery.loadCy)), 'load', book.delivery.cost), L('Install fabric', (area / 100) * b.fabricPer100), L('Spread stone', tons * b.hrsPerUnit)],
		scope: [`Install commercial-grade landscape fabric over ${fmtArea(area)}`, `Install ${tons} tons of ${type} at ${depth}" depth`, 'Rake level and clean up'] };
}
function newBed(s, area, book, label) {
	const b = book.newbed;
	const sodCy = cy(area, b.sodDepthIn), comp = ceilTo(cy(area, b.compostIn), 0.5);
	return [{ id: 'sec_' + s.id + '_newbed', shape: s.id, title: `New planting bed${label}`, qty: { area },
		comps: [L('Remove turf and roots', (area / 100) * b.removePer100), area >= b.sodCutterMin ? C('equipment', 'Sod cutter rental', 1, 'day', b.sodCutterDay) : null, C('disposal', 'Turf & soil disposal', ceilTo(sodCy, 0.5), 'yd³', b.disposalPerCy), C('material', 'Compost / soil amendment', comp, 'yd³', b.compostCost), L('Till amendment into soil', (area / 100) * b.tillPer100)].filter(Boolean),
		scope: [`Create a new ${fmtArea(area)} planting bed in the shape shown on the plan`, 'Remove existing turf and roots and haul away', `Work ${b.compostIn}" of compost into the soil`] }];
}
function edgingSection(s, length, type, book, label, frac) {
	const r = book.edging[type] || book.edging.steel;
	const Lf = Math.ceil(length * (frac ? Math.max(0, Math.min(1, frac)) : 1));
	const names = { steel: 'Steel edging', aluminum: 'Aluminum edging', plastic: 'Commercial plastic edging', stone: 'Stone/paver edging', brick: 'Brick edging', natural: 'Natural spade-cut edge' };
	return { id: 'sec_' + s.id + '_edge', shape: s.id, title: `${names[type] || 'Edging'}${label}`, qty: { length: Lf },
		comps: [r[0] ? C('material', names[type] || 'Edging', Lf, 'lf', r[0]) : null, L('Install edging', Lf * r[1])].filter(Boolean),
		scope: [type === 'natural' ? `Hand-cut a crisp natural edge along ${Lf} linear ft of bed line` : `Install ${Lf} linear ft of ${(names[type] || 'edging').toLowerCase()} along the bed line, set flush so a mower can pass`] };
}
function sodSection(s, area, book, label) {
	const b = book.sod, pallets = Math.ceil((area * (1 + b.waste / 100)) / b.sfPerPallet), soil = ceilTo(cy(area, b.topsoilIn), 0.5);
	return { id: 'sec_' + s.id + '_sod', shape: s.id, title: `New lawn – sod${label}`, qty: { area, pallets },
		comps: [C('material', 'Sod (Kentucky bluegrass/fescue blend)', pallets, 'pallet', b.cost), C('material', 'Screened topsoil', soil, 'yd³', b.topsoilCost), C('material', 'Starter fertilizer', Math.max(1, Math.ceil(area / 5000)), 'bag', 32), L('Soil prep and grading', (area / 100) * b.prepPer100), L('Lay and roll sod', (area / 100) * b.layPer100)],
		scope: [`Prepare ${fmtArea(area)}: remove debris, add ${b.topsoilIn}" screened topsoil, fine grade`, `Install ${pallets} pallets of fresh sod with tight, staggered seams; apply starter fertilizer and roll`, 'Water thoroughly at install; watering instructions provided'] };
}
function seedSection(s, area, book, label) {
	const b = book.seed;
	return { id: 'sec_' + s.id + '_seed', shape: s.id, title: `New lawn – seed${label}`, qty: { area },
		comps: [C('material', 'Premium grass seed', Math.ceil((area / 1000) * b.lbsPer1000), 'lb', b.lbCost), C('material', 'Seed straw / mulch', Math.max(1, Math.ceil((area / 1000) * b.strawPer1000)), 'bale', b.strawCost), C('material', 'Screened topsoil', ceilTo(cy(area, b.topsoilIn), 0.5), 'yd³', b.topsoilCost), L('Prep, seed and cover', (area / 100) * b.prepPer100)],
		scope: [`Prepare and seed ${fmtArea(area)} at ${b.lbsPer1000} lb per 1,000 sq ft`, 'Topdress, apply starter fertilizer and cover with seed straw'] };
}
function paverSection(s, area, perim, p, book, title, curved, dims) {
	const b = book.pavers, mat = p.material || 'Concrete pavers';
	const waste = curved ? b.curveWaste : b.waste;
	const excav = cy(area, b.baseIn + b.beddingIn + b.paverIn);
	const gravelT = ceilTo(cy(area, b.baseIn) * b.compact * b.tonsPerCy, 0.5), sandT = ceilTo(cy(area, b.beddingIn) * b.tonsPerCy, 0.5);
	const days = Math.max(1, Math.ceil(area / b.sfPerDay));
	const steps = Math.max(0, Math.round(num(p.steps, 0)));
	const border = p.border && p.border !== 'none';
	return { id: 'sec_' + s.id + '_pav', shape: s.id, title, qty: { area, perim },
		comps: [L('Excavate', excav * b.excavHrsPerCy), C('disposal', 'Excavated soil disposal', ceilTo(excav, 0.5), 'yd³', b.disposalPerCy), area >= b.machineMinSf ? C('equipment', 'Skid steer / mini excavator', Math.max(1, Math.ceil(days / 2)), 'day', b.machineDay) : null,
			C('material', 'Processed gravel base (3/4" minus)', gravelT, 'ton', b.gravelTonCost), C('material', 'Concrete bedding sand', sandT, 'ton', b.sandTonCost), C('material', `${mat}${border ? ' + border course' : ''}`, Math.ceil(area * (1 + waste / 100)), 'sq ft', b.sfCost),
			C('material', 'Edge restraint + spikes', Math.ceil(perim), 'lf', b.restraintLf), C('material', 'Polymeric joint sand', Math.max(1, Math.ceil(area / b.sfPerBag)), 'bag', b.polyBagCost), C('equipment', 'Plate compactor', days, 'day', b.compactorDay), C('equipment', 'Wet saw', days, 'day', b.sawDay),
			C('delivery', 'Material delivery', Math.max(1, Math.ceil((gravelT + sandT) / 20)), 'load', book.delivery.cost), L('Base, screed, lay & cut pavers', area * b.hrsPerSf),
			steps ? C('material', 'Steps (block/stone treads)', steps, 'ea', b.stepCost) : null, steps ? L('Build steps', steps * b.stepHrs) : null].filter(Boolean),
		scope: [`${title.split(' –')[0]}: ${fmtArea(area)}${dims ? ` (${dims})` : ''} in ${mat.toLowerCase()}${border ? ' with a contrasting border course' : ''}`, `Excavate about ${Math.round(b.baseIn + b.beddingIn + b.paverIn)}" deep and haul away ${ceilTo(excav, 0.5)} yd³ of soil`, `Install and compact a ${b.baseIn}" processed gravel base in lifts, then ${b.beddingIn}" of bedding sand`, `Lay pavers in the pattern chosen, cut edges clean, install ${Math.ceil(perim)} lf of edge restraint`, 'Sweep in polymeric sand and compact', 'Slope for drainage away from the house (about 1/8" per ft)', steps ? `Build ${steps} step${steps > 1 ? 's' : ''}` : '', 'Call Before You Dig (811) to mark utilities before excavating'] };
}
function gravelPath(s, area, length, w, p, book, label) {
	const g = book.gravelpath, b = book.pavers, st = book.stone;
	const baseT = ceilTo(cy(area, g.baseIn) * b.compact * b.tonsPerCy, 0.5), topT = ceilTo(cy(area, g.stoneIn) * st.tonsPerCy, 0.5);
	return { id: 'sec_' + s.id + '_gpath', shape: s.id, title: `Gravel walkway${label}`, qty: { area },
		comps: [L('Excavate and grade', cy(area, g.baseIn + g.stoneIn) * b.excavHrsPerCy), C('disposal', 'Soil disposal', ceilTo(cy(area, g.baseIn + g.stoneIn), 0.5), 'yd³', b.disposalPerCy), C('material', 'Gravel base', baseT, 'ton', b.gravelTonCost), C('material', p.stone || 'Pea stone', topT, 'ton', st.cost), C('material', 'Landscape fabric', Math.ceil(area * 1.1), 'sq ft', st.fabric), C('material', 'Steel edging (both sides)', Math.ceil(length * 2), 'lf', book.edging.steel[0]), L('Install path', area * g.hrsPerSf + length * 2 * book.edging.steel[1]), C('equipment', 'Plate compactor', 1, 'day', b.compactorDay)],
		scope: [`Gravel walkway ${fmtFtIn(length)} long × ${fmtFtIn(w)} wide (${fmtArea(area)})`, `${g.baseIn}" compacted base, fabric, ${g.stoneIn}" of ${(p.stone || 'pea stone').toLowerCase()}`, 'Steel edging on both sides'] };
}
function wallSection(s, length, p, book, label) {
	const b = book.wall, H = num(p.height, 2), face = length * H;
	const blocks = Math.ceil((face / b.blockSf) * (1 + b.waste / 100)), caps = Math.ceil(length * b.capPerLf * (1 + b.waste / 100));
	const baseT = ceilTo(length * b.baseGravelCyPerLf * 1.4 * 1.15, 0.5);
	const backT = ceilTo(face * b.backfillCyPerFaceSf * 1.4, 0.5);
	const mat = p.material || 'Segmental wall block';
	const grid = H > 3;
	return { id: 'sec_' + s.id + '_wall', shape: s.id, title: `Retaining wall${label}`, qty: { length, height: H, face },
		comps: [L('Excavate trench & base', length * b.excavHrsPerLf), length >= b.machineMinLf ? C('equipment', 'Mini excavator', Math.max(1, Math.ceil(face / 120)), 'day', b.machineDay) : null, C('material', 'Compacted gravel base', baseT, 'ton', b.gravelTonCost), C('material', `${mat}`, blocks, 'block', b.blockCost), p.cap !== false ? C('material', 'Wall caps + adhesive', caps, 'ea', b.capCost) : null,
			C('material', 'Clean drainage stone backfill', backT, 'ton', b.gravelTonCost), C('material', '4" perforated drain pipe', Math.ceil(length), 'lf', b.drainLf), C('material', 'Filter fabric', Math.ceil(length), 'lf', b.fabricLf), grid ? C('material', 'Geogrid reinforcement', Math.ceil(length * Math.floor(H / 1.5)), 'lf', b.geogridLf) : null,
			C('delivery', 'Material delivery', 1 + Math.floor(blocks / 400), 'load', book.delivery.cost), L('Build wall', face * b.hrsPerFaceSf)].filter(Boolean),
		scope: [`Build ${fmtFtIn(length)} of retaining wall, ${fmtFtIn(H)} exposed height (${Math.round(face)} face sq ft) in ${mat.toLowerCase()}`, 'Excavate a trench, bury the first course, compact a gravel leveling base', 'Backfill with clean drainage stone over filter fabric with a 4" perforated drain pipe to daylight', p.cap !== false ? 'Glue caps to the top course' : '', grid ? 'Geogrid reinforcement every other course' : '', H > 4 ? 'Walls over 4 ft need an engineered design and may need a building permit — not included unless listed' : '', p.planting ? 'Leave a planting pocket behind the wall' : ''] };
}

function removalSections(s, m, book) {
	const p = s.props || {}, r = book.removal;
	const what = { bed: 'plant', lawn: 'lawn', patio: 'patio', walkway: 'patio', driveway: 'patio', fence: 'fence', structure: 'structure', plant: p.cat === 'trees' || p.cat === 'evergreens' ? 'tree' : p.cat === 'shrubs' ? 'shrub' : 'plant', boulder: 'other', feature: 'other' }[s.kind] || 'other';
	const k = r[what] || r.other;
	let qty, unit, txt;
	if (GEOM[s.kind] === 'point') { qty = m.count; unit = 'ea'; txt = `Remove ${qty} ${p.name || KINDS[s.kind].label.toLowerCase()}${qty > 1 ? 's' : ''}${what === 'tree' ? ' (cut, chip and haul; stump ground 6" below grade)' : ' including roots'}`; }
	else if (s.kind === 'fence' || s.kind === 'wall' || s.kind === 'edging') { qty = Math.ceil(m.length); unit = 'lf'; txt = `Remove ${qty} linear ft of existing ${KINDS[s.kind].label.toLowerCase()}`; }
	else { qty = Math.ceil(m.area); unit = 'sq ft'; txt = `Remove ${fmtArea(m.area)} of existing ${KINDS[s.kind].label.toLowerCase()}`; }
	const per100 = unit === 'sq ft';
	const hrs = per100 ? (qty / 100) * k[1] : qty * k[1];
	const disp = per100 ? ceilTo(qty * (s.kind === 'lawn' ? 0.25 : 0.33) / 27, 0.5) : qty;
	return [{ id: 'sec_' + s.id + '_rm', shape: s.id, title: 'Removals & site prep', group: 'removal', qty: { [unit]: qty },
		comps: [L(`Remove ${p.name || KINDS[s.kind].label.toLowerCase()}`, hrs), k[2] ? C('disposal', 'Haul away & disposal', disp, per100 ? 'yd³' : unit, k[2]) : null, what === 'tree' ? C('equipment', 'Stump grinder', 1, 'day', 175) : null].filter(Boolean),
		scope: [txt, 'Haul away all removed material'] }];
}

/** Plants (points) are grouped into ONE planting section with a line per plant. */
function plantingSection(shapes, book) {
	const pts = shapes.filter((s) => s.kind === 'plant' && !s.existing && !s.remove);
	if (!pts.length) return null;
	const map = new Map();
	for (const s of pts) {
		const p = s.props || {};
		const key = (p.id || p.name || 'plant') + '|' + (p.size || '');
		const g = map.get(key) || { name: p.name || 'Plant', sci: p.sci || '', cat: p.cat || 'shrubs', size: p.size || '', count: 0, cost: p.cost };
		g.count += Math.max(1, Math.round(num(p.count, 1)));
		map.set(key, g);
	}
	const b = book.plants, comps = [], scope = [];
	let labor = 0, amend = 0, total = 0;
	for (const g of map.values()) {
		const r = b[g.cat] || b.shrubs, size = g.size || b.sizes[g.cat] || '';
		comps.push(C('material', `${g.name}${g.sci ? ` (${g.sci})` : ''}${size ? `, ${size}` : ''}`, g.count, 'ea', num(g.cost, r[0]), { plant: true, needsPrice: !num(g.cost, r[0]) }));
		labor += g.count * r[1];
		amend += g.count * r[2];
		total += g.count;
		scope.push(`${g.count} × ${g.name}${g.sci ? ` (${g.sci})` : ''}${size ? ` – ${size}` : ''}`);
	}
	comps.push(C('material', 'Planting mix, starter fertilizer, stakes', 1, 'lot', amend));
	comps.push(L('Plant, backfill and water in', labor));
	return { id: 'sec_planting', shape: '', title: 'Planting', qty: { plants: total }, comps,
		scope: [`Supply and plant ${total} plants as shown on the plan:`, ...scope.map((x) => '• ' + x), 'Dig each hole 2× the root-ball width, amend soil, set at proper depth and water in', 'One-year plant replacement guarantee when watered as instructed (see terms)'] };
}
function lightingSection(shapes, book) {
	const lights = shapes.filter((s) => s.kind === 'light' && !s.existing && !s.remove);
	if (!lights.length) return null;
	const b = book.lighting;
	const byType = {};
	let n = 0;
	for (const s of lights) { const t = (s.props && s.props.type) || 'Path light'; const c = Math.max(1, Math.round(num(s.props && s.props.count, 1))); byType[t] = (byType[t] || 0) + c; n += c; }
	const wires = shapes.filter((s) => s.kind === 'wire' && !s.existing);
	const wire = wires.length ? Math.ceil(wires.reduce((a, s) => a + measure(s).length, 0) * 1.1) : n * b.wirePerFixture;
	const tr = Math.max(1, Math.ceil(n / b.perTransformer));
	return { id: 'sec_lighting', shape: '', title: 'Landscape lighting', qty: { fixtures: n },
		comps: [...Object.entries(byType).map(([t, c]) => C('material', `LED ${t.toLowerCase()} (brass/aluminum, warm 2700K)`, c, 'ea', b.fixture)), C('material', 'Low-voltage transformer w/ photocell timer', tr, 'ea', b.transformer), C('material', '12/2 direct-burial wire', wire, 'lf', b.wireLf), L('Install fixtures', n * b.fixtureHrs), L('Mount transformer, trench & connect wire', tr * b.transformerHrs + wire * b.wireHrsPerLf)],
		scope: [`Install ${n} low-voltage LED fixtures: ${Object.entries(byType).map(([t, c]) => `${c} ${t.toLowerCase()}${c > 1 ? 's' : ''}`).join(', ')}`, `${tr} transformer${tr > 1 ? 's' : ''} with photocell/timer plugged into an existing outdoor GFCI outlet`, `About ${wire} ft of direct-burial wire, buried 3–6" deep`, 'Night-time aiming adjustment visit included'] };
}

/**
 * Plan → estimate sections (deterministic). Removals merged into one section.
 * plan: { shapes }, book: merged price book.
 */
export function planToSections(plan, book = PRICEBOOK) {
	const shapes = (plan && plan.shapes) || [];
	const secs = [];
	const removal = { id: 'sec_removal', shape: '', title: 'Removals & site prep', comps: [], scope: [], group: 'removal' };
	for (const s of shapes) {
		if (s.kind === 'plant' && !s.remove) continue;
		if (s.kind === 'light' || s.kind === 'wire') continue;
		for (const sec of shapeSections(s, book)) {
			if (sec.group === 'removal') { removal.comps.push(...sec.comps); removal.scope.push(...sec.scope.filter((x) => !/^Haul away all/.test(x))); }
			else secs.push(sec);
		}
	}
	if (removal.comps.length) { removal.scope.push('Haul away all removed material'); secs.unshift(removal); }
	const pl = plantingSection(shapes, book);
	if (pl) secs.push(pl);
	const li = lightingSection(shapes, book);
	if (li) secs.push(li);
	if (secs.length) secs.push({ id: 'sec_cleanup', shape: '', title: 'Final cleanup', comps: [L('Blow off hard surfaces, final walkthrough', book.cleanup.hrs)], scope: ['Blow off all hard surfaces, remove all debris, and walk the finished project with you'] });
	return secs;
}

/* ------------------------------------------------------------ pricing */

/** Cost of one component (labor uses the crew rate). */
export function compCost(c, costs) {
	const unit = c.kind === 'labor' && c.rate ? costs.laborRate : num(c.unitCost);
	return num(c.qty) * unit;
}

/**
 * Price an estimate. est = { sections: [{ title, comps, scope, priceOverride?, optional?, included? }], discount?, extras? }
 * Returns totals + per-section numbers. Pure.
 */
export function priceEstimate(est, costsIn) {
	const costs = mergeCosts(costsIn);
	const res = { sections: [], byKind: {}, direct: 0, overhead: 0, cost: 0, price: 0, taxable: 0, tax: 0, total: 0, gp: 0, margin: 0, deposit: 0, hours: 0, materials: 0 };
	const kinds = ['material', 'labor', 'equipment', 'sub', 'disposal', 'delivery', 'other'];
	for (const k of kinds) res.byKind[k] = { cost: 0, price: 0 };
	const oh = 1 + num(costs.overheadPct) / 100;
	for (const s of est.sections || []) {
		let direct = 0, price = 0, mat = 0, hrs = 0;
		const parts = {};
		for (const c of s.comps || []) {
			const k = kinds.includes(c.kind) ? c.kind : 'other';
			const cc = compCost(c, costs);
			direct += cc;
			if (k === 'labor') hrs += num(c.qty);
			if (k === 'material') mat += cc;
			const p = costs.mode === 'margin' ? (cc * oh) / Math.max(0.05, 1 - num(costs.marginPct) / 100) : cc * (1 + num(costs.markup[k]) / 100);
			price += p;
			parts[k] = (parts[k] || 0) + p;
			if (s.included !== false && !s.optional) { res.byKind[k].cost += cc; res.byKind[k].price += p; }
		}
		const computed = price;
		if (Number.isFinite(s.priceOverride) && s.priceOverride >= 0) price = s.priceOverride;
		if (costs.roundTo > 0 && !Number.isFinite(s.priceOverride)) price = Math.ceil(price / costs.roundTo - 1e-9) * costs.roundTo;
		const out = { id: s.id, direct: round2(direct), cost: round2(direct * oh), computed: round2(computed), price: round2(price), materialShare: price ? (computed ? (parts.material || 0) / computed : 0) : 0, hours: round2(hrs), optional: !!s.optional };
		res.sections.push(out);
		if (s.optional || s.included === false) continue;
		res.direct += direct;
		res.hours += hrs;
		res.materials += mat;
		res.price += price;
		res.taxable += costs.taxOn === 'all' ? price : costs.taxOn === 'materials' ? price * out.materialShare : 0;
	}
	if (num(costs.mobilization) > 0 && res.price > 0) { res.price += num(costs.mobilization); res.mobilization = num(costs.mobilization); if (costs.taxOn === 'all') res.taxable += num(costs.mobilization); }
	const disc = num(est.discount, 0);
	if (disc > 0) { const share = res.price ? res.taxable / res.price : 0; res.price -= disc; res.taxable -= disc * share; res.discount = disc; }
	if (res.price > 0 && res.price < num(costs.minJob)) { const bump = num(costs.minJob) - res.price; res.minBump = round2(bump); if (costs.taxOn === 'all') res.taxable += bump; res.price = num(costs.minJob); }
	res.overhead = res.direct * (oh - 1);
	res.cost = res.direct + res.overhead;
	res.tax = Math.max(0, res.taxable) * num(costs.taxPct) / 100;
	res.total = res.price + res.tax;
	res.gp = res.price - res.cost;
	res.margin = res.price ? res.gp / res.price : 0;
	res.deposit = res.total * num(costs.depositPct) / 100;
	for (const k of ['direct', 'overhead', 'cost', 'price', 'taxable', 'tax', 'total', 'gp', 'deposit', 'hours', 'materials']) res[k] = round2(res[k]);
	res.margin = Math.round(res.margin * 1000) / 10;
	return res;
}

/** Build both documents (internal Job Cost sheet + customer Proposal) from one estimate. */
export function buildDocuments(est, costsIn) {
	const costs = mergeCosts(costsIn);
	const t = priceEstimate(est, costs);
	const sec = new Map(t.sections.map((s) => [s.id, s]));
	const jobCost = {
		lines: (est.sections || []).flatMap((s) => (s.comps || []).map((c) => ({ section: s.title, kind: c.kind, name: c.name, qty: c.qty, unit: c.unit, unitCost: c.kind === 'labor' && c.rate ? costs.laborRate : c.unitCost, cost: round2(compCost(c, costs)), optional: !!s.optional }))),
		totals: t
	};
	const proposal = {
		sections: (est.sections || []).filter((s) => s.included !== false).map((s) => ({ id: s.id, title: s.title, scope: s.scope || [], price: sec.get(s.id) ? sec.get(s.id).price : 0, optional: !!s.optional })),
		subtotal: t.price, tax: t.tax, total: t.total, deposit: t.deposit, showPrices: costs.showPrices
	};
	return { jobCost, proposal, totals: t };
}

/* ------------------------------------------------- Dreamscape → plan */

const MAT_TO_COVER = { Mulch: 'mulch', 'Stone & Gravel': 'stone', 'Soil & Sand': 'stone', 'Lawn & Groundcover': 'lawn', Pavers: 'patio', 'Natural Stone': 'patio', 'Decking & Surfaces': 'patio' };

/**
 * Convert a Dreamscape view into plan shapes in feet.
 * view: { kind: 'aerial'|'photo', W, H, ppf?, cam?, ops: [{t:'poly'|'brush', mat, edging, pts}], objects: [{item, x, y, age}] }
 * lookup: { mat(id) → {name, group}, item(id) → {id, name, sci, cat} }
 * Aerial views are to scale (ppf). Photo views use the camera model and are marked estimated.
 */
export function dreamscapeToPlan(view, lookup) {
	const shapes = [];
	let est = false;
	const toFt = (x, y) => {
		if (view.kind === 'aerial' && view.ppf) return [x / view.ppf, y / view.ppf];
		est = true;
		return view.cam ? groundPoint(x, y, view.cam, view.W) : null;
	};
	let i = 0;
	// hidden shapes and hidden layers stay out of the quantities
	const L = view.layers || [];
	const layerHidden = (op) => !!L.length && !!(L.find((l) => l.id === (op.layer || 'base')) || L[0]).hidden;
	for (const op of view.ops || []) {
		if (op.erase || op.hidden || layerHidden(op) || op.t !== 'poly' || !op.pts || op.pts.length < 3) continue;
		const pts = op.pts.map((p) => toFt(p[0], p[1])).filter(Boolean);
		if (pts.length < 3) continue;
		const m = (lookup.mat && lookup.mat(op.mat)) || { name: 'Mulch', group: 'Mulch' };
		const cover = MAT_TO_COVER[m.group] || 'mulch';
		const id = 'd' + (i++);
		if (cover === 'lawn') shapes.push({ id, kind: 'lawn', pts, closed: true, smooth: true, props: { method: 'sod', label: m.name } });
		else if (cover === 'patio') shapes.push({ id, kind: 'patio', pts, closed: true, smooth: true, props: { material: m.name } });
		else shapes.push({ id, kind: 'bed', pts, closed: true, smooth: true, props: { cover, material: m.name.toLowerCase(), depth: cover === 'stone' ? 3 : 3, isNew: false, edging: op.edging && op.edging !== 'none' ? op.edging : 'none' } });
	}
	for (const o of view.objects || []) {
		const it = lookup.item && lookup.item(o.item);
		if (!it) continue;
		const pt = toFt(o.x, o.y);
		if (!pt) continue;
		const cat = it.cat || 'shrubs';
		shapes.push({ id: 'd' + (i++), kind: cat === 'features' ? 'feature' : 'plant', pts: [pt], props: cat === 'features' ? { name: it.name, count: 1 } : { id: it.id, name: it.name, sci: it.sci || '', cat, count: 1 } });
	}
	return { shapes, estimated: est, source: view.kind === 'aerial' ? 'aerial' : 'photo' };
}

/* ------------------------------------------------- messages & shortcodes */

export const SHORTCODES = [
	['{customer_name}', 'Customer’s full name', 'Jane Smith'],
	['{customer_first_name}', 'Customer’s first name', 'Jane'],
	['{customer_address}', 'Property address', '123 Example St, Farmington, CT'],
	['{customer_town}', 'Property town', 'Farmington'],
	['{project_name}', 'Quote / project title', 'Front Yard Renovation'],
	['{quote_number}', 'Quote number', 'Q-1042'],
	['{quote_total}', 'Total incl. tax', '$8,450'],
	['{deposit_amount}', 'Deposit to get started', '$2,535'],
	['{quote_link}', 'Link to view & sign the proposal', 'https://…'],
	['{valid_until}', 'Date the price is good until', 'June 30'],
	['{company_name}', 'Your business name', 'David’s Landscaping'],
	['{contractor_name}', 'Your name', 'David'],
	['{contractor_phone}', 'Your phone', '(860) 555-0100'],
	['{contractor_email}', 'Your email', 'david@example.com'],
	['{month}', 'Current month', 'May'],
	['{today}', 'Today’s date', 'May 6']
];

/** Replace {codes} (case-insensitive). Unknown codes are left as-is so mistakes are visible. */
export function merge(text, data) {
	return String(text || '').replace(/\{([a-z_]+)\}/gi, (m, k) => {
		const v = data[k.toLowerCase()];
		return v == null || v === '' ? m : String(v);
	});
}
/** Codes in a text that have no value (shown as a warning before sending). */
export function missingCodes(text, data) {
	const out = new Set();
	String(text || '').replace(/\{([a-z_]+)\}/gi, (m, k) => { const v = data[k.toLowerCase()]; if (v == null || v === '') out.add(m); return m; });
	return [...out];
}

/**
 * Default 6-touch follow-up plan (service-business best practice: fast first touch, mix of
 * email and text, each message adds value and has ONE call to action, a gentle scheduling
 * nudge, an "adjust the scope" offer, then a polite close-the-loop message).
 * dayOffset is counted from when the quote is sent; times are local.
 */
export const DEFAULT_FOLLOWUPS = [
	{ day: 1, time: '10:00', channel: 'email', include: { link: true, image: false, total: true, scope: false },
		subject: 'Your {project_name} proposal from {company_name}',
		body: 'Hi {customer_first_name},\n\nThanks again for the chance to quote {project_name} at {customer_address}. You can see the full proposal — the design, every step of the work and the total of {quote_total} — here:\n{quote_link}\n\nIf anything isn’t clear or you’d like to change something, just reply. Happy to adjust it.\n\n{contractor_name}\n{company_name} · {contractor_phone}' },
	{ day: 3, time: '17:30', channel: 'sms', include: { link: true, image: false, total: false, scope: false },
		subject: '',
		body: 'Hi {customer_first_name}, it’s {contractor_name} from {company_name}. Just checking you got the proposal for {project_name}: {quote_link} Any questions I can answer?' },
	{ day: 7, time: '10:00', channel: 'email', include: { link: true, image: true, total: false, scope: true },
		subject: 'Picturing your new {project_name}',
		body: 'Hi {customer_first_name},\n\nHere’s the before-and-after again so you can picture it. Everything included is listed below, so there are no surprises.\n\nWhen you’re ready, you can approve and sign online in about a minute:\n{quote_link}\n\n{contractor_name}\n{company_name}' },
	{ day: 14, time: '12:00', channel: 'sms', include: { link: true, image: false, total: false, scope: false },
		subject: '',
		body: 'Hi {customer_first_name}, {contractor_name} here. We’re booking {month} projects now. If you’d like {project_name} on the calendar, you can approve it here: {quote_link}' },
	{ day: 21, time: '10:00', channel: 'email', include: { link: true, image: false, total: true, scope: false },
		subject: 'Want to adjust {project_name}?',
		body: 'Hi {customer_first_name},\n\nSometimes a proposal needs a tweak. I can phase the work over two seasons, swap materials to fit a budget, or change the plan. Just reply with what you’d like and I’ll send an updated version.\n\nYour current proposal ({quote_total}) is here: {quote_link}\n\n{contractor_name}\n{company_name} · {contractor_phone}' },
	{ day: 30, time: '10:00', channel: 'both', include: { link: true, image: false, total: false, scope: false },
		subject: 'Should I close your file?',
		body: 'Hi {customer_first_name}, I haven’t heard back about {project_name}, so I’ll assume the timing isn’t right and close your file. If you’d still like to go ahead, your pricing is good until {valid_until}: {quote_link} Thanks for considering {company_name}!' }
];

/** Plan follow-ups starting from a send date (ms). Returns [{ at (ms), ...step }]. */
export function scheduleFollowups(sentAt, steps = DEFAULT_FOLLOWUPS) {
	return steps.map((s) => {
		const d = new Date(sentAt);
		d.setDate(d.getDate() + s.day);
		const [hh, mm] = String(s.time || '10:00').split(':').map(Number);
		d.setHours(hh || 0, mm || 0, 0, 0);
		return { ...JSON.parse(JSON.stringify(s)), at: d.getTime() };
	});
}

/** Standard terms (editable by the contractor). */
export const DEFAULT_TERMS = [
	'Price includes all labor, materials, equipment and disposal listed in this proposal. Anything not listed is not included.',
	'A deposit is due when you sign to reserve your place on the schedule; the balance is due on completion unless progress payments are listed.',
	'We call Call Before You Dig (811) before any digging. Private lines (irrigation, lighting, invisible fence, propane) are not marked by 811 — please show us where they are.',
	'Quantities are measured from the plan. If hidden conditions are found (ledge, buried debris, drainage problems), we will stop and agree on any change in writing before continuing.',
	'Plants are guaranteed for one year from planting when watered as instructed. Damage from deer, drought, storms or neglect is not covered.',
	'Changes to the scope after signing are made by written change order.',
	'Pricing is valid until the date shown.'
].join('\n');

/**
 * AI quote work items → plan shapes, so they are priced by the same rules as a Landscape plan
 * (the contractor's price book; the AI never sets a price). Areas become rectangles with the
 * given area (and perimeter, when known); lengths become straight lines; counts become points.
 */
export function aiItemsToPlan(items) {
	const shapes = [];
	let n = 0;
	const rect = (sqft, perim) => {
		const A = Math.max(1, sqft), half = perim > 0 ? perim / 2 : 0, disc = half * half - 4 * A;
		const a = half && disc >= 0 ? (half + Math.sqrt(disc)) / 2 : Math.sqrt(A), b = A / a;
		return [[0, 0], [a, 0], [a, b], [0, b]];
	};
	const line = (L) => [[0, 0], [Math.max(1, L), 0]];
	const add = (kind, pts, closed, props, extra) => shapes.push({ id: 'ai' + ++n, kind, pts, closed, props: { label: '', ...props }, ...(extra || {}) });
	for (const it of items || []) {
		const label = it.label || '';
		switch (it.kind) {
		case 'bed': add('bed', rect(it.sqft, it.perimeter_ft), true, { label, isNew: !!it.new, cover: it.cover || 'mulch', depth: it.depth_in || 3, edging: it.edging && it.edging !== 'none' ? it.edging : 'none' }); break;
		case 'stone': add('stone', rect(it.sqft, 0), true, { label, depth: it.depth_in || 3 }); break;
		case 'grade': add('grade', rect(it.sqft, 0), true, { label }); break;
		case 'lawn': add('lawn', rect(it.sqft, 0), true, { label, method: it.method || 'sod' }); break;
		case 'patio': add('patio', rect(it.sqft, it.perimeter_ft), true, { label, material: it.material || '' }); break;
		case 'walkway': add('walkway', line(it.length_ft), false, { label, width: it.width_ft || 4, material: it.material === 'gravel' ? 'gravel' : '' }); break;
		case 'wall': add('wall', line(it.length_ft), false, { label, height: it.height_ft || 2 }); break;
		case 'edging': add('edging', line(it.length_ft), false, { label, type: it.type || 'steel' }); break;
		case 'fence': add('fence', line(it.length_ft), false, { label, type: it.type || 'vinyl', height: it.height_ft || 6, gates: it.gates || 0 }); break;
		case 'plant': add('plant', [[0, 0]], false, { name: it.name, cat: it.cat || 'shrubs', count: it.count || 1 }); break;
		case 'boulder': add('boulder', [[0, 0]], false, { label, count: it.count || 1 }); break;
		case 'light': add('light', [[0, 0]], false, { type: (it.type || 'path light').replace(/^./, (c) => c.toUpperCase()), count: it.count || 1 }); break;
		case 'remove': {
			const w = it.what;
			if (w === 'tree' || w === 'shrub' || w === 'plant') add('plant', [[0, 0]], false, { name: w === 'tree' ? 'tree' : w === 'shrub' ? 'shrub' : 'plant', cat: w === 'tree' ? 'trees' : w === 'shrub' ? 'shrubs' : 'perennials', count: Math.max(1, it.count || 1) }, { remove: true });
			else if (w === 'fence') add('fence', line(it.length_ft || 10), false, {}, { remove: true });
			else add(w === 'structure' ? 'structure' : w, rect(it.sqft || 100, 0), true, {}, { remove: true });
			break;
		}
		default: break;
		}
	}
	return { shapes };
}

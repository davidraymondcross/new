/* DreamScaper – Landscape Plan wizard: geometry, checks and the plan generator.
 *
 * Plan coordinates are FEET: x east, y south, origin at the top-left of the bird's-eye image
 * (the same coordinates the 2D plan editor uses). Everything here is a pure function — no DOM — so
 * the wizard can call it and the tests can check it.
 *
 *  frame(trace)            the property's own axes: f (house → street), r (right, standing at the street)
 *  validateTrace(...)      catches tracing mistakes before anything is generated
 *  shotPlan(...)           where to stand and which way to face for every guided photo
 *  checkScale(...)         compares a traced length with the tape measurement
 *  generatePlan(input)     base map + designs (Dreamscapes or the chosen style) → plan shapes + report
 *
 * The generator follows standard residential design rules: foundation beds at least as deep as the
 * shrubs' mature width plus air space, plant centres at half their mature width + 1 ft from walls,
 * foundation plants kept below the window sills, spacing at mature width, odd-numbered repeats,
 * small trees 10+ ft from the house, 4–5 ft walks, 12–16 ft patios, nothing over the property line,
 * the driveway, the walk or a structure.
 */

/* ------------------------------------------------------------ geometry */

export const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const mul = (a, k) => [a[0] * k, a[1] * k];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
export const len = (a) => Math.hypot(a[0], a[1]);
export const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
export const dist = (a, b) => len(sub(a, b));
export function area(p) { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s) / 2; }
export function centroid(p) {
	let x = 0, y = 0, s = 0;
	for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length], c = a[0] * b[1] - b[0] * a[1]; s += c; x += (a[0] + b[0]) * c; y += (a[1] + b[1]) * c; }
	if (Math.abs(s) < 1e-9) return [p.reduce((t, q) => t + q[0], 0) / p.length, p.reduce((t, q) => t + q[1], 0) / p.length];
	return [x / (3 * s), y / (3 * s)];
}
export function inside(pt, poly) {
	if (!poly || poly.length < 3) return false;
	let ins = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const a = poly[i], b = poly[j];
		if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < ((b[0] - a[0]) * (pt[1] - a[1])) / (b[1] - a[1]) + a[0]) ins = !ins;
	}
	return ins;
}
export function segDist(p, a, b) {
	const ab = sub(b, a), L = dot(ab, ab);
	const t = L ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / L)) : 0;
	return dist(p, add(a, mul(ab, t)));
}
export function closestOnPoly(p, poly, closed = true) {
	let best = null, bd = Infinity;
	const n = closed ? poly.length : poly.length - 1;
	for (let i = 0; i < n; i++) {
		const a = poly[i], b = poly[(i + 1) % poly.length], ab = sub(b, a), L = dot(ab, ab);
		const t = L ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / L)) : 0;
		const q = add(a, mul(ab, t)), d = dist(p, q);
		if (d < bd) { bd = d; best = q; }
	}
	return { pt: best, d: bd };
}
const polyDist = (p, poly, closed = true) => closestOnPoly(p, poly, closed).d;
function segsCross(a, b, c, d) {
	const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
	return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}
export function selfCrosses(p) {
	for (let i = 0; i < p.length; i++) for (let j = i + 2; j < p.length; j++) {
		if (i === 0 && j === p.length - 1) continue;
		if (segsCross(p[i], p[(i + 1) % p.length], p[j], p[(j + 1) % p.length])) return true;
	}
	return false;
}
/** Where a ray from p along unit d first crosses the polygon (distance), or Infinity. */
export function rayHit(p, d, poly) {
	let best = Infinity;
	for (let i = 0; i < poly.length; i++) {
		const a = poly[i], b = poly[(i + 1) % poly.length], e = sub(b, a);
		const den = d[0] * e[1] - d[1] * e[0];
		if (Math.abs(den) < 1e-9) continue;
		const w = sub(a, p);
		const t = (w[0] * e[1] - w[1] * e[0]) / den, u = (w[0] * d[1] - w[1] * d[0]) / den;
		if (t > 1e-6 && u >= 0 && u <= 1) best = Math.min(best, t);
	}
	return best;
}
const scalePts = (pts, k) => pts.map((p) => [p[0] * k, p[1] * k]);

/* ------------------------------------------------------- property frame */

/**
 * The property's own axes from the house and the street point:
 * u = feet toward the street (front), v = feet to the right as seen from the street.
 */
export function frame(t) {
	const c = centroid(t.house);
	const f = unit(sub(t.street, c));
	const r = [f[1], -f[0]];
	const toL = (p) => { const q = sub(p, c); return [dot(q, f), dot(q, r)]; };
	const toP = (u, v) => add(c, add(mul(f, u), mul(r, v)));
	const ext = (pts) => { const L = pts.map(toL); return { u0: Math.min(...L.map((q) => q[0])), u1: Math.max(...L.map((q) => q[0])), v0: Math.min(...L.map((q) => q[1])), v1: Math.max(...L.map((q) => q[1])) }; };
	return { c, f, r, toL, toP, lot: ext(t.boundary), house: ext(t.house) };
}

/* -------------------------------------------------------------- checks */

/** Tracing problems, worst first. Each: { level: 'bad'|'warn', text, fix, part }. */
export function validateTrace(t, base) {
	const out = [];
	const bad = (part, text, fix) => out.push({ level: 'bad', part, text, fix });
	const warn = (part, text, fix) => out.push({ level: 'warn', part, text, fix });
	if (!t.street) bad('street', 'The street isn’t marked.', 'Tap the street in front of the house — it tells the wizard which side is the front.');
	if (!t.boundary || t.boundary.length < 3) bad('boundary', 'The property line isn’t traced.', 'Tap each corner of the property, then tap the first corner again to close it.');
	if (!t.house || t.house.length < 3) bad('house', 'The house isn’t traced.', 'Tap each corner of the house roof, then close the shape.');
	if (out.length) return out;
	const lotA = area(t.boundary), houseA = area(t.house);
	if (selfCrosses(t.boundary)) bad('boundary', 'The property line crosses over itself.', 'Undo and tap the corners in order, walking around the property.');
	if (selfCrosses(t.house)) bad('house', 'The house outline crosses over itself.', 'Undo and tap the roof corners in order around the house.');
	if (lotA < 1000) bad('boundary', `The property is only ${Math.round(lotA)} sq ft — too small to be a whole lot.`, 'Trace the full property line, not just one yard. Zoom the bird’s-eye view out if it doesn’t fit.');
	if (lotA > 2178000) warn('boundary', `The property traced is over 50 acres (${Math.round(lotA / 43560)} acres).`, 'Check the property corners. For very large properties, plan one area at a time.');
	if (houseA < 300) bad('house', `The house is only ${Math.round(houseA)} sq ft.`, 'Trace the main house roof (all of it), not a shed or a single wing.');
	if (houseA > 20000) warn('house', `The house traced is ${Math.round(houseA).toLocaleString()} sq ft — unusually big.`, 'Make sure you traced just the house roof, not the house and driveway together.');
	const inLot = t.house.filter((p) => inside(p, t.boundary) || polyDist(p, t.boundary) < 2).length / t.house.length;
	if (inLot < 0.8) bad('house', 'The house isn’t inside the property line.', 'Trace the property line around the house (or re-trace the house on this property).');
	if (houseA > lotA * 0.75) warn('boundary', 'The house covers most of the property.', 'Check that the property line goes all the way around the yard.');
	if (inside(t.street, t.house)) bad('street', 'The street point is on the house.', 'Tap the street (or sidewalk) in front of the house.');
	else if (inside(t.street, t.boundary) && polyDist(t.street, t.boundary) > 40) warn('street', 'The street point is in the middle of the yard.', 'Tap on the street or sidewalk in front of the house.');
	if (t.door && polyDist(t.door, t.house) > 12) warn('door', 'The front door point is far from the house.', 'Tap where the front door (or front steps) meets the house.');
	if (t.driveway && t.driveway.length >= 3) {
		const dA = area(t.driveway);
		if (selfCrosses(t.driveway)) bad('driveway', 'The driveway outline crosses over itself.', 'Undo and tap its corners in order.');
		if (dA < 100) warn('driveway', 'The driveway is tiny.', 'Trace the whole paved driveway, out to the street.');
		if (inside(centroid(t.driveway), t.house)) bad('driveway', 'The driveway is drawn on the house.', 'Trace the paved driveway next to the house.');
	}
	for (const s of t.structures || []) if (s.length >= 3 && !inside(centroid(s), t.boundary)) warn('structures', 'A structure is outside the property line.', 'Remove it or extend the property line if it’s on this property.');
	if (base && base.W && base.ppf) {
		const Wf = base.W / base.ppf, Hf = base.H / base.ppf;
		if (t.boundary.some((p) => p[0] < 2 || p[1] < 2 || p[0] > Wf - 2 || p[1] > Hf - 2)) warn('boundary', 'The property runs to the edge of the bird’s-eye image.', 'Go back one step, zoom out so the whole property fits with a margin, and trace again.');
	}
	return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'bad' ? -1 : 1));
}

/**
 * Compare a length traced on the image with the tape measurement.
 * Returns { k (multiply plan sizes by this), diff (fraction), level, text }.
 */
export function checkScale(planFt, tapeFt, res = 0.25) {
	if (!(planFt > 0) || !(tapeFt > 0)) return { k: 1, diff: 0, level: 'bad', text: 'Draw the line and type the tape measurement.' };
	const k = tapeFt / planFt, diff = Math.abs(1 - k);
	// a short reference on coarse imagery can be off by a pixel at each end
	const pixelSlack = (2 * res) / tapeFt;
	if (tapeFt < 8) return { k, diff, level: 'bad', text: 'Use something at least 8 ft long — short lengths can’t check the scale accurately.' };
	if (diff <= Math.max(0.03, pixelSlack)) return { k, diff, level: 'ok', text: `Matches within ${(diff * 100).toFixed(1)}% — the bird’s-eye scale is right.` };
	if (diff <= Math.max(0.1, pixelSlack * 1.5)) return { k, diff, level: 'warn', text: `${(diff * 100).toFixed(1)}% off — the wizard will correct the whole plan by this amount.` };
	return { k, diff, level: 'bad', text: `${(diff * 100).toFixed(0)}% off — too much to be the imagery. Most likely the line and the tape measured different things.` };
}

/* --------------------------------------------------------------- photos */

const SHOTS = {
	front: { label: 'Front of the house', area: 'front', how: 'Stand on the far side of the street (or at the curb) straight across from the front door. Fit the whole front of the house and both front corners in the photo.' },
	front_left: { label: 'Front yard from the left corner', area: 'front', how: 'Stand at the front-left corner of the property (as you face the house from the street). Aim diagonally across the front yard at the house.' },
	front_right: { label: 'Front yard from the right corner', area: 'front', how: 'Stand at the front-right corner of the property. Aim diagonally across the front yard at the house.' },
	back: { label: 'Back of the house', area: 'back', how: 'Stand at the back of the property, straight behind the house. Fit the whole back of the house and the yard in front of you.' },
	back_left: { label: 'Back yard from the left corner', area: 'back', how: 'Stand in the back-left corner of the property. Aim diagonally across the back yard toward the house.' },
	back_right: { label: 'Back yard from the right corner', area: 'back', how: 'Stand in the back-right corner of the property. Aim diagonally across the back yard toward the house.' },
	left: { label: 'Left side yard', area: 'left', how: 'Stand beside the front-left corner of the house and look down the side yard toward the back.' },
	right: { label: 'Right side yard', area: 'right', how: 'Stand beside the front-right corner of the house and look down the side yard toward the back.' }
};
export const SHOT_INFO = SHOTS;

/** Every guided photo for the chosen areas: where to stand (plan feet), which way to face, how. */
export function shotPlan(t, areas) {
	const F = frame(t), L = F.lot, Hs = F.house;
	const vm = (Hs.v0 + Hs.v1) / 2;
	const at = (u, v, tu, tv) => { const pos = F.toP(u, v), target = F.toP(tu, tv), d = unit(sub(target, pos)); return { pos, dir: d }; };
	const spots = {
		front: at(L.u1 + 6, vm, 0, vm),
		front_left: at(L.u1 - 2, L.v0 + 2, Hs.u1, vm),
		front_right: at(L.u1 - 2, L.v1 - 2, Hs.u1, vm),
		back: at(L.u0 + 3, vm, 0, vm),
		back_left: at(L.u0 + 2, L.v0 + 2, Hs.u0, vm),
		back_right: at(L.u0 + 2, L.v1 - 2, Hs.u0, vm),
		left: at(Hs.u1 + 3, (L.v0 + Hs.v0) / 2, Hs.u0, (L.v0 + Hs.v0) / 2),
		right: at(Hs.u1 + 3, (L.v1 + Hs.v1) / 2, Hs.u0, (L.v1 + Hs.v1) / 2)
	};
	const out = [];
	for (const id of Object.keys(SHOTS)) {
		if (!areas.includes(SHOTS[id].area)) continue;
		const s = spots[id];
		const bear = ((Math.atan2(s.dir[0], -s.dir[1]) * 180) / Math.PI + 360) % 360;
		out.push({ id, ...SHOTS[id], pos: s.pos, dir: s.dir, heading: bear, main: ['front', 'back', 'left', 'right'].includes(id) });
	}
	return out;
}

/* ---------------------------------------------------------------- styles */

const sci = (it, s) => (it.sci || '').toLowerCase().includes(s);
export const STYLES = [
	{ id: 'traditional', name: 'Traditional', ic: '🏡', desc: 'Neat, layered foundation beds with flowering shrubs, evergreens for winter, a focal tree and a clean curved edge.', depth: 6, curvy: true, edging: 'steel', cover: 'mulch', mulch: 'double-ground hardwood', walk: 'Concrete pavers', patio: 'Concrete pavers', species: 6,
		score: (it) => (it.ev ? 2 : 0) + (it.blooms ? 1 : 0) },
	{ id: 'modern', name: 'Modern', ic: '◻️', desc: 'Clean straight lines, a few plants repeated in blocks, ornamental grasses and evergreens, dark mulch or stone.', depth: 5, curvy: false, edging: 'steel', cover: 'mulch', mulch: 'black dyed', walk: 'Large-format pavers', patio: 'Large-format pavers', species: 4,
		filter: (it) => it.cat === 'grasses' || it.ev || it.upright || it.fine, score: (it) => (it.cat === 'grasses' ? 3 : 0) + (it.ev ? 2 : 0) + (it.upright ? 1 : 0) },
	{ id: 'cottage', name: 'Cottage garden', ic: '🌸', desc: 'Deep, flowing beds packed with flowering perennials and shrubs for color from spring to fall.', depth: 8, curvy: true, edging: 'none', cover: 'mulch', mulch: 'double-ground hardwood', walk: 'Natural flagstone', patio: 'Natural flagstone', species: 9,
		score: (it) => (it.blooms ? 3 : 0) + (it.bloomSeasons ? it.bloomSeasons.length : 0) },
	{ id: 'native', name: 'Native & pollinator', ic: '🦋', desc: 'Plants native to your region that feed bees, butterflies and birds — lower water, fewer chemicals.', depth: 7, curvy: true, edging: 'none', cover: 'mulch', mulch: 'leaf compost', walk: 'Natural flagstone', patio: 'Natural flagstone', species: 8,
		filter: (it) => it.native, score: (it) => (it.blooms ? 2 : 0) + (it.berries ? 1 : 0) },
	{ id: 'xeriscape', name: 'Drought-tolerant', ic: '🌵', desc: 'Sun-loving, low-water grasses and perennials in gravel beds. Best in full sun.', depth: 6, curvy: true, edging: 'steel', cover: 'stone', mulch: '3/4" crushed stone', walk: 'Decomposed granite', patio: 'Natural flagstone', species: 6, needsSun: true,
		filter: (it) => (it.sun || '').includes('F') && ['grasses', 'perennials', 'shrubs', 'evergreens'].includes(it.cat) && !it.big, score: (it) => (it.cat === 'grasses' ? 3 : 0) + (it.fine ? 1 : 0) },
	{ id: 'japanese', name: 'Japanese', ic: '⛩️', desc: 'Calm and green: clipped evergreens, Japanese maples, grasses and stone, with plenty of open space.', depth: 6, curvy: true, edging: 'none', cover: 'stone', mulch: 'river rock', walk: 'Stepping stones', patio: 'Natural flagstone', species: 5, boulders: true,
		filter: (it) => it.ev || sci(it, 'acer palmatum') || sci(it, 'hakonechloa') || it.cat === 'grasses' || sci(it, 'azalea') || sci(it, 'rhododendron'), score: (it) => (sci(it, 'acer palmatum') ? 4 : 0) + (it.ev ? 2 : 0) },
	{ id: 'formal', name: 'Formal', ic: '🏛️', desc: 'Symmetry, straight beds, clipped evergreen hedges and matching plants on both sides of the entry.', depth: 5, curvy: false, edging: 'steel', cover: 'mulch', mulch: 'black dyed', walk: 'Brick pavers', patio: 'Brick pavers', species: 3, symmetric: true,
		filter: (it) => it.ev || sci(it, 'buxus') || sci(it, 'taxus') || sci(it, 'ilex'), score: (it) => (sci(it, 'buxus') || sci(it, 'taxus') ? 4 : 0) + (it.ev ? 2 : 0) },
	{ id: 'lowmaint', name: 'Low maintenance', ic: '🧹', desc: 'Tough, slow-growing evergreens and shrubs that rarely need pruning, with few species and a clean edge.', depth: 5, curvy: true, edging: 'steel', cover: 'mulch', mulch: 'double-ground hardwood', walk: 'Concrete pavers', patio: 'Concrete pavers', species: 4,
		filter: (it) => it.cat !== 'annuals' && (it.rate === 'slow' || it.rate === 'medium' || it.cat === 'grasses' || it.ev), score: (it) => (it.ev ? 3 : 0) + (it.rate === 'slow' ? 2 : 0) + (it.deer ? 1 : 0) },
	{ id: 'woodland', name: 'Woodland & shade', ic: '🌲', desc: 'Ferns, hostas, shade shrubs and native understory for yards under trees.', depth: 7, curvy: true, edging: 'none', cover: 'mulch', mulch: 'leaf compost', walk: 'Stepping stones', patio: 'Natural flagstone', species: 7,
		filter: (it) => /[PS]/.test(it.sun || ''), score: (it) => ((it.sun || '').includes('S') ? 3 : 0) + (it.native ? 1 : 0) }
];
export const styleById = (id) => STYLES.find((s) => s.id === id) || STYLES[0];

/* ---------------------------------------------------------------- plants */

export const zoneNum = (z) => { const m = /^(\d{1,2})/.exec(String(z || '')); return m ? +m[1] : 0; };
export function zoneOk(it, z) {
	if (!z || !it.zones) return true;
	const m = /z?(\d{1,2})-(\d{1,2})/.exec(it.zones);
	return !m || (z >= +m[1] && z <= +m[2]);
}
const ROLES = {
	back: { cats: ['shrubs', 'evergreens'], w: [2, 6], h: [1.5, 7] },
	front: { cats: ['perennials', 'grasses'], w: [1, 3], h: [0.5, 3] },
	accent: { cats: ['trees'], w: [8, 25], h: [10, 30] },
	screen: { cats: ['evergreens', 'trees'], w: [3, 14], h: [8, 40], ev: true }
};
/**
 * Choose plants for one role in one area, best first.
 * site: { zone, deer }, sun: 'F'|'P'|'S', lim: { wMax, hMax }.
 * Returns { items, relaxed } — relaxed=true when the style alone didn't have enough and general picks were added.
 */
export function pickPlants(lib, style, role, sun, site, lim = {}, n = 3) {
	const R = ROLES[role], z = zoneNum(site.zone);
	const wMax = Math.min(R.w[1], lim.wMax || 99), hMax = Math.min(R.h[1], lim.hMax || 99);
	const base = lib.filter((it) => R.cats.includes(it.cat) && !it.annual && it.w >= R.w[0] && it.w <= wMax && it.h >= R.h[0] && it.h <= hMax
		&& (it.sun || 'F').includes(sun) && zoneOk(it, z) && (!site.deer || it.deer) && (!R.ev || it.ev) && (role !== 'screen' || it.upright || it.ev));
	const sc = (it) => (style.score ? style.score(it) : 0) + (it.native && site.native ? 2 : 0) + (role === 'back' && it.ev ? 1 : 0);
	const sort = (a, b) => sc(b) - sc(a) || a.name.localeCompare(b.name);
	let list = (style.filter ? base.filter(style.filter) : base).sort(sort);
	let relaxed = false;
	if (list.length < n) {
		relaxed = true;
		const more = base.filter((it) => !list.includes(it)).sort(sort);
		list = list.concat(more);
	}
	// one per form/genus first, so the palette has variety
	const seen = new Set(), out = [];
	for (const it of list) { const g = (it.sci || it.name).split(' ')[0]; if (seen.has(g)) continue; seen.add(g); out.push(it); if (out.length >= n) break; }
	for (const it of list) { if (out.length >= n) break; if (!out.includes(it)) out.push(it); }
	return { items: out, relaxed: relaxed && base.length > 0, none: !base.length };
}

/* -------------------------------------------------------------- generate */

let seq = 0;
const sid = (p) => p + (++seq).toString(36) + Math.random().toString(36).slice(2, 5);

/**
 * input: {
 *   trace: { street, door, boundary, house, driveway, structures: [], trees: [{pt, w, label}] },
 *   k: scale correction from the tape check, base: { W, H, ppf, where }
 *   areas: ['front','back','left','right'], style, site: { zone, deer, native, sill, sun: {front:'F'…}, hardscape, privacy, boundaryKnown },
 *   lib: plant library (PLANTS), designs: { area: { title, kind: 'aerial'|'photo', shapes, geo } }, shots: shotPlan()
 * }
 * Returns { shapes, report: { notes: [], warn: [], counts: {} }, bgPpf }
 */
export function generatePlan(input) {
	const t = input.trace, style = typeof input.style === 'string' ? styleById(input.style) : input.style;
	const site = input.site || {}, areas = input.areas || ['front', 'back'];
	const F = frame(t);
	const shapes = [], notes = [], warn = [];
	const obstacles = [t.house, ...(t.driveway && t.driveway.length >= 3 ? [t.driveway] : []), ...(t.structures || []).filter((s) => s.length >= 3)];
	const lines = []; // walkway centre lines with half-width + 1 ft
	const pts = []; // plant points (centre, radius) to avoid overlaps
	const okPt = (p, clear = 0) => inside(p, t.boundary) && polyDist(p, t.boundary) >= clear && !obstacles.some((o) => inside(p, o) || (clear && polyDist(p, o) < clear * 0.6)) && !lines.some((l) => polyDist(p, l.pts, false) < l.r);
	const freeFor = (p, r) => okPt(p, 0.5) && !pts.some((q) => dist(p, q.p) < (r + q.r) * 0.9) && !(t.trees || []).some((tr) => dist(p, tr.pt) < 3 + r);
	const plant = (it, p, area, role) => { shapes.push({ id: sid('p'), kind: 'plant', pts: [p], props: { id: it.id, name: it.name, sci: it.sci || '', cat: it.cat, count: 1, w: it.w, h: it.h, area, role } }); pts.push({ p, r: it.w / 2 }); };

	// 1. the base map: what's there now
	shapes.push({ id: sid('b'), kind: 'boundary', pts: t.boundary, closed: true, existing: true, props: { label: site.boundaryKnown === 'survey' ? 'Property line (from survey)' : site.boundaryKnown === 'visible' ? 'Property line (fences/curbs — approximate)' : 'Property line (approximate)' } });
	shapes.push({ id: sid('h'), kind: 'house', pts: t.house, closed: true, existing: true, props: { label: 'House (roof outline)' } });
	if (t.driveway && t.driveway.length >= 3) shapes.push({ id: sid('d'), kind: 'driveway', pts: t.driveway, closed: true, existing: true, props: { label: 'Driveway' } });
	for (const s of t.structures || []) if (s.length >= 3) shapes.push({ id: sid('s'), kind: 'structure', pts: s, closed: true, existing: true, props: { label: 'Structure' } });
	for (const tr of t.trees || []) { shapes.push({ id: sid('t'), kind: 'plant', pts: [tr.pt], existing: true, props: { name: tr.label || 'Existing tree (keep)', cat: 'trees', count: 1, w: tr.w || 20, keep: true } }); }
	if (t.door) shapes.push({ id: sid('n'), kind: 'note', pts: [t.door], props: { text: 'Front door' } });

	// 2. designs the contractor loaded (Dreamscapes) — they replace the generator for their area
	const designed = new Set();
	for (const [area, d] of Object.entries(input.designs || {})) {
		if (!areas.includes(area) || !d || !d.shapes || !d.shapes.length) continue;
		const placed = placeDesign(d, input.base, (input.shots || []).find((s) => s.id === area));
		if (!placed.shapes.length) { warn.push(`The Dreamscape for the ${area} couldn’t be placed — the style design was used instead.`); continue; }
		let outside = 0;
		for (const s of placed.shapes) { if (!s.pts.every((p) => inside(p, t.boundary))) outside++; s.props = { ...(s.props || {}), area, from: d.title || 'Dreamscape' }; shapes.push(s); if (s.kind === 'plant') pts.push({ p: s.pts[0], r: (s.props.w || 3) / 2 }); }
		designed.add(area);
		notes.push(`${cap(area)} yard: from the Dreamscape “${d.title || 'design'}”${placed.estimated ? ' (photo-based — sizes are estimates, check them in the editor)' : ' (bird’s-eye, to scale)'}.`);
		if (outside) warn.push(`${outside} shape${outside > 1 ? 's' : ''} from the ${area} Dreamscape cross the property line — check their position in the editor.`);
	}

	// 3. the style generator for every other area
	const walkW = style.id === 'formal' ? 5 : 4;
	const sunOf = (a) => (site.sun && site.sun[a]) || 'F';
	const relaxed = new Set();
	const edges = houseEdges(t.house, F);

	// front walk: door → driveway (or straight to the street)
	if (areas.includes('front') && !designed.has('front') && site.hardscape !== false && t.door) {
		let end = null;
		if (t.driveway && t.driveway.length >= 3) { const c = closestOnPoly(t.door, t.driveway); if (c.d > 3 && c.d < 120) end = c.pt; }
		if (!end) { const toStreet = rayHit(t.door, F.f, t.boundary); if (toStreet < 200) end = add(t.door, mul(F.f, toStreet - 1)); }
		if (end) {
			let path = [add(t.door, mul(unit(sub(end, t.door)), 1)), end];
			if (style.curvy && dist(path[0], end) > 18) { const m = add(mul(add(path[0], end), 0.5), mul([-(end[1] - path[0][1]), end[0] - path[0][0]], 0.12)); path = [path[0], m, end]; }
			if (!inside(path[Math.floor(path.length / 2)], t.house)) {
				shapes.push({ id: sid('w'), kind: 'walkway', pts: path, smooth: path.length > 2, props: { width: walkW, material: style.walk, isNew: true, area: 'front' } });
				lines.push({ pts: path, r: walkW / 2 + 1 });
				notes.push(`Front walk: ${walkW} ft wide ${style.walk.toLowerCase()} from the front door to the ${t.driveway ? 'driveway' : 'sidewalk'}.`);
			}
		}
	}

	// back patio on the longest back wall
	if (areas.includes('back') && !designed.has('back') && site.hardscape !== false) {
		const back = edges.filter((e) => e.side === 'back').sort((a, b) => b.len - a.len)[0];
		if (back && back.len >= 10) {
			const w = Math.max(10, Math.min(24, back.len * 0.6));
			for (let D = 16; D >= 10; D -= 2) {
				const mid = mul(add(back.a, back.b), 0.5), along = unit(sub(back.b, back.a));
				const p0 = add(mid, mul(along, -w / 2)), p1 = add(mid, mul(along, w / 2));
				const poly = [p0, p1, add(p1, mul(back.n, D)), add(p0, mul(back.n, D))];
				if (poly.every((p) => inside(p, t.boundary) && polyDist(p, t.boundary) >= 3) && !obstacles.slice(1).some((o) => poly.some((p) => inside(p, o)))) {
					shapes.push({ id: sid('pa'), kind: 'patio', pts: poly, closed: true, props: { material: style.patio, border: 'none', steps: 0, isNew: true, area: 'back' } });
					obstacles.push(poly);
					notes.push(`Back patio: ${Math.round(w)} × ${D} ft ${style.patio.toLowerCase()} off the back of the house (room for a table for six). Move it to the back door in the editor if needed.`);
					break;
				}
			}
		}
	}

	// foundation beds and their plants
	for (const e of edges) {
		const area = e.side;
		if (!areas.includes(area) || designed.has(area) || e.len < 4) continue;
		const sun = sunOf(area);
		const gap = rayHit(add(mul(add(e.a, e.b), 0.5), mul(e.n, 0.2)), e.n, t.boundary);
		let depth = area === 'left' || area === 'right' ? 3 : style.depth;
		if (area === 'left' || area === 'right') {
			if (gap < 3) continue;
			if (gap < 7) { // narrow side yard: a stone drip strip, not plants
				for (const run of runs(e, Math.min(2, gap - 1), okPt)) shapes.push({ id: sid('st'), kind: 'stone', pts: bedPoly(run, Math.min(2, gap - 1), false), closed: true, props: { depth: 3, material: '3/4" crushed stone', isNew: true, area, label: 'Stone drip strip' } });
				notes.push(`${cap(area)} side yard is only ${Math.round(gap)} ft wide — a 2 ft stone drip strip keeps it neat and lets you walk through.`);
				continue;
			}
		}
		depth = Math.min(depth, Math.max(3, gap - 4));
		if (depth < 3) continue;
		const sill = +site.sill || 3;
		const hBack = area === 'front' ? Math.max(2, sill) : area === 'back' ? Math.max(3, sill + 1) : 4;
		const backPick = pickPlants(input.lib || [], style, 'back', sun, site, { wMax: Math.max(2, depth - 1.5), hMax: hBack }, Math.max(1, Math.ceil(style.species / 2)));
		const frontPick = depth >= 4.5 ? pickPlants(input.lib || [], style, 'front', sun, site, { hMax: Math.min(3, sill) }, Math.max(1, Math.floor(style.species / 2))) : { items: [] };
		if (backPick.relaxed || frontPick.relaxed) relaxed.add(area);
		if (backPick.none) warn.push(`No shrubs in the library fit the ${area} bed (zone ${site.zone || '?'}, ${sunWord(sun)}${site.deer ? ', deer resistant' : ''}). Add plants in the editor.`);
		for (const run of runs(e, depth, okPt)) {
			shapes.push({ id: sid('bed'), kind: 'bed', pts: bedPoly(run, depth, style.curvy), closed: true, smooth: style.curvy, props: { cover: style.cover, depth: 3, isNew: true, edging: style.edging, material: style.mulch, area, label: `${cap(area)} foundation bed` } });
			fillRow(run, backPick.items, depth, 'back', area, style, freeFor, plant);
			if (frontPick.items.length) fillRow(run, frontPick.items, depth, 'front', area, style, freeFor, plant);
		}
	}

	// accent trees at the front corners
	if (areas.includes('front') && !designed.has('front')) {
		const acc = pickPlants(input.lib || [], style, 'accent', sunOf('front'), site, {}, 1).items[0];
		if (acc) {
			const fe = edges.filter((e) => e.side === 'front');
			const ends = fe.length ? [fe.map((e) => [e.a, e.b]).flat().reduce((m, p) => (F.toL(p)[1] < F.toL(m)[1] ? p : m)), fe.map((e) => [e.a, e.b]).flat().reduce((m, p) => (F.toL(p)[1] > F.toL(m)[1] ? p : m))] : [];
			let placed = 0;
			const dOff = Math.max(10, acc.w / 2 + 4);
			for (const [i, corner] of ends.entries()) {
				if (!style.symmetric && placed) break;
				const side = i === 0 ? mul(F.r, -1) : F.r;
				const p = add(corner, add(mul(F.f, dOff * 0.8), mul(side, dOff * 0.6)));
				if (freeFor(p, 3)) { plant(acc, p, 'front', 'accent'); placed++; }
			}
			if (placed) notes.push(`Focal tree: ${acc.name} ${Math.round(dOff)} ft from the house corner${placed > 1 ? 's' : ''} (mature spread ${acc.w} ft).`);
		}
	}

	// privacy screen along the back line
	if (areas.includes('back') && !designed.has('back') && site.privacy) {
		const deep = F.house.u0 - F.lot.u0;
		const scr = pickPlants(input.lib || [], style, 'screen', sunOf('back'), site, {}, 2).items;
		if (deep >= 35 && scr.length) {
			const w = scr[0].w, u = F.lot.u0 + 3 + w / 2;
			let n = 0;
			for (let v = F.lot.v0 + w / 2 + 3; v <= F.lot.v1 - w / 2 - 3; v += w * 0.8) {
				const p = F.toP(u, v);
				if (freeFor(p, w / 2 * 0.6)) { plant(scr[n % scr.length], p, 'back', 'screen'); n++; }
			}
			if (n) notes.push(`Privacy screen: ${n} ${scr.map((s) => s.name).join(' / ')} along the back line, spaced at 80% of mature width so they grow into a screen.`);
		} else if (deep < 35) warn.push('The back yard is too shallow for a privacy screen behind the house — skipped.');
	}

	if (relaxed.size) warn.push(`Few ${style.name.toLowerCase()} plants fit the ${[...relaxed].join(' and ')} conditions, so some general picks for your zone and sun were added.`);
	if (style.needsSun && areas.some((a) => sunOf(a) === 'S')) warn.push(`${style.name} plantings need sun, but part of this property is shady — check the shady beds.`);

	// 4. scale correction from the tape check, applied to everything (and the backdrop)
	const k = input.k && Math.abs(input.k - 1) > 1e-6 ? input.k : 1;
	if (k !== 1) for (const s of shapes) s.pts = scalePts(s.pts, k);
	const counts = {};
	for (const s of shapes) if (!s.existing) counts[s.kind] = (counts[s.kind] || 0) + 1;
	return { shapes, report: { notes, warn, counts }, k, bgPpf: input.base && input.base.ppf ? input.base.ppf / k : 0 };
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const sunWord = (s) => ({ F: 'full sun', P: 'part shade', S: 'shade' }[s] || s);

/** House edges with their outward normal and which side of the house they face. */
export function houseEdges(house, F) {
	const out = [];
	for (let i = 0; i < house.length; i++) {
		const a = house[i], b = house[(i + 1) % house.length], e = sub(b, a), L = len(e);
		if (L < 0.5) continue;
		let n = unit([e[1], -e[0]]);
		if (inside(add(mul(add(a, b), 0.5), mul(n, 0.5)), house)) n = mul(n, -1);
		const df = dot(n, F.f), dr = dot(n, F.r);
		const side = df > 0.6 ? 'front' : df < -0.6 ? 'back' : dr > 0 ? 'right' : 'left';
		out.push({ a, b, n, len: L, side });
	}
	return out;
}
/** Parts of a wall where a bed of this depth fits (≥ 4 ft long). */
function runs(e, depth, okPt) {
	const N = Math.max(8, Math.ceil(e.len / 1.5)), good = [];
	const along = unit(sub(e.b, e.a));
	for (let i = 0; i <= N; i++) {
		const t = i / N, w = add(e.a, mul(sub(e.b, e.a), t));
		good.push(okPt(add(w, mul(e.n, depth))) && okPt(add(w, mul(e.n, depth * 0.5))) && okPt(add(w, mul(e.n, 0.6))));
	}
	const out = [];
	let s = -1;
	for (let i = 0; i <= N + 1; i++) {
		if (i <= N && good[i]) { if (s < 0) s = i; continue; }
		if (s >= 0) { const t0 = s / N, t1 = (i - 1) / N; if ((t1 - t0) * e.len >= 4) out.push({ a: add(e.a, mul(along, t0 * e.len)), b: add(e.a, mul(along, t1 * e.len)), n: e.n, len: (t1 - t0) * e.len }); s = -1; }
	}
	return out;
}
function bedPoly(run, depth, curvy) {
	if (!curvy) return [run.a, run.b, add(run.b, mul(run.n, depth)), add(run.a, mul(run.n, depth))];
	const k = [0.7, 0.95, 1.1, 0.95, 0.7], out = [run.a, run.b];
	for (let i = 4; i >= 0; i--) out.push(add(add(run.a, mul(sub(run.b, run.a), i / 4)), mul(run.n, depth * k[i])));
	return out;
}
/** One row of plants along a bed: back row near the wall, front row near the edge, spaced at mature width. */
function fillRow(run, items, depth, row, area, style, freeFor, plant) {
	if (!items.length) return;
	const along = unit(sub(run.b, run.a));
	let s = 0, i = 0, group = 0;
	const groupSize = style.species <= 4 ? 5 : 3; // repeat plants in odd-numbered groups
	while (s < run.len) {
		const it = items[Math.floor(group / groupSize) % items.length];
		const w = it.w;
		const off = row === 'back' ? Math.max(w / 2 + 1, 2) : Math.max(depth - w / 2 - 0.5, w / 2 + 1);
		const at = s + w / 2;
		if (at + w / 2 > run.len + 0.01) break;
		const p = add(add(run.a, mul(along, at)), mul(run.n, Math.min(off, depth - 0.5)));
		if (freeFor(p, w / 2)) { plant(it, p, area, row); group++; }
		s += w;
		i++;
	}
}

/**
 * Put a Dreamscape's shapes onto the property plan.
 * Bird's-eye designs with a location are placed exactly (feet from the image centre);
 * photo designs are placed in front of the guided photo spot, facing the way the photo faced.
 */
export function placeDesign(d, base, shot) {
	const g = d.geo || {};
	const copy = (s, f) => ({ ...JSON.parse(JSON.stringify(s)), id: sid('x'), pts: s.pts.map(f) });
	if (d.kind === 'aerial' && g.ppf && g.W && base && base.where && g.where) {
		const ft = 364000;
		const dx = (g.where.lng - base.where.lng) * ft * Math.cos((base.where.lat * Math.PI) / 180);
		const dy = -(g.where.lat - base.where.lat) * ft;
		const ox = base.W / base.ppf / 2 + dx - g.W / g.ppf / 2, oy = base.H / base.ppf / 2 + dy - g.H / g.ppf / 2;
		return { shapes: d.shapes.map((s) => copy(s, (p) => [p[0] + ox, p[1] + oy])), estimated: false };
	}
	if (d.kind === 'photo' && shot) {
		const right = [-shot.dir[1], shot.dir[0]];
		return { shapes: d.shapes.map((s) => copy(s, (p) => add(shot.pos, add(mul(right, p[0]), mul(shot.dir, p[1]))))), estimated: true };
	}
	return { shapes: [], estimated: true };
}

/** Is a Dreamscape usable for this property? Returns problems: [{ level, text, fix }]. */
export function checkDesign(d, base) {
	const out = [];
	if (!d || !d.shapes || !d.shapes.length) {
		out.push({ level: 'bad', text: 'This Dreamscape has no beds or plants the plan can use.', fix: 'Open it, draw the beds with the Beds tool and place plants, then load it again. (AI pictures alone have no shapes to measure.)' });
		return out;
	}
	const g = d.geo || {};
	if (d.kind === 'aerial') {
		if (!g.where) out.push({ level: 'warn', text: 'This bird’s-eye Dreamscape has no saved location, so it can’t be lined up automatically.', fix: 'It will be placed by the guided photo spot instead — check it in the editor.' });
		else if (base && base.where) {
			const f = Math.hypot((g.where.lat - base.where.lat) * 364000, (g.where.lng - base.where.lng) * 364000 * Math.cos((base.where.lat * Math.PI) / 180));
			if (f > 600) out.push({ level: 'bad', text: `This Dreamscape is of a place about ${f > 5280 ? (f / 5280).toFixed(1) + ' miles' : Math.round(f) + ' ft'} away — not this property.`, fix: 'Pick the Dreamscape made for this address.' });
		}
	} else {
		if (!g.cam) out.push({ level: 'bad', text: 'This photo Dreamscape has no camera information, so its beds can’t be measured.', fix: 'Make the Dreamscape from one of the wizard’s guided photos (it sets the camera for you), or use a bird’s-eye Dreamscape.' });
		else out.push({ level: 'warn', text: 'Photo-based Dreamscape: bed sizes are estimated from the camera (about ±15%).', fix: 'For exact sizes, design on the bird’s-eye view instead — or check the shapes in the editor.' });
	}
	return out;
}

/** How accurate the finished plan is, in words, from what the wizard collected. */
export function accuracy(s) {
	const res = (s.base && s.base.res) || 0;
	let level = 'low', pm = 5;
	if (s.base && s.base.kind === 'aerial') { pm = Math.max(1, Math.round(res * 2)); level = res <= 0.5 ? 'high' : 'medium'; }
	else if (s.base && s.base.kind === 'survey') { pm = 1; level = 'high'; }
	if (s.check && s.check.level === 'ok') pm = Math.max(1, pm - (level === 'high' ? 0 : 1));
	if (!s.check || s.check.level === 'bad' || s.check.skipped) { level = level === 'high' ? 'medium' : 'low'; pm += 2; }
	const lines = s.boundaryKnown === 'survey' ? 'from a survey' : s.boundaryKnown === 'visible' ? 'from fences and curbs (approximate)' : 'approximate';
	return { level, pm, text: `Sizes about ±${pm} ft (${level}). Property lines ${lines}.` };
}

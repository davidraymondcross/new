/* DreamScaper – design library: ~480 East Coast plants with real growth data,
 * 140 garden features. Data rows live in data-*.js; this module turns them into
 * searchable items with color, bloom-season, sun, native and growth details.
 */
import { TREES, EVERGREENS } from './data-trees.js?v=2.7.8';
import { SHRUBS } from './data-shrubs.js?v=2.7.8';
import { PERENNIALS, GRASSES, ANNUALS, VINES } from './data-perennials.js?v=2.7.8';
import { FEATURES as FEATURE_ROWS } from './data-features.js?v=2.7.8';
import { TREES_X } from './data-x-trees.js?v=2.7.8';
import { TREES_X2 } from './data-x-trees2.js?v=2.7.8';
import { EVERGREENS_X } from './data-x-evergreens.js?v=2.7.8';
import { SHRUBS_X } from './data-x-shrubs.js?v=2.7.8';
import { SHRUBS_X2 } from './data-x-shrubs2.js?v=2.7.8';
import { PERENNIALS_X } from './data-x-perennials.js?v=2.7.8';
import { PERENNIALS_X2 } from './data-x-perennials2.js?v=2.7.8';
import { GRASSES_X, ANNUALS_X, VINES_X } from './data-x-misc.js?v=2.7.8';
import { FEATURES_X } from './data-x-features.js?v=2.7.8';
import { REAL_TREES, REAL_EVERGREENS, REAL_SHRUBS, REAL_PERENNIALS, REAL_GRASSES, REAL_ANNUALS, REAL_FEATURES } from './data-x-real.js?v=2.7.8';

export const CATEGORIES = [
	{ id: 'trees', name: 'Trees' },
	{ id: 'evergreens', name: 'Evergreens' },
	{ id: 'shrubs', name: 'Shrubs' },
	{ id: 'perennials', name: 'Perennials' },
	{ id: 'grasses', name: 'Grasses' },
	{ id: 'annuals', name: 'Annuals' },
	{ id: 'vines', name: 'Vines' },
	{ id: 'features', name: 'Features' },
	{ id: 'mine', name: 'My Library' }
];

/* Named colors used in the data → [h, s, l] */
const LEAF = {
	green: [110, 38, 30], dark: [125, 40, 22], light: [95, 45, 40], blue: [195, 22, 50], bluegreen: [165, 20, 38], gold: [55, 70, 52],
	lime: [75, 60, 48], purple: [345, 38, 24], burgundy: [352, 48, 27], red: [0, 50, 35], silver: [120, 8, 64], variegated: [105, 35, 38],
	copper: [20, 55, 40]
};
const FALL = {
	red: [2, 75, 42], scarlet: [355, 80, 45], orange: [25, 88, 50], yellow: [50, 85, 55], gold: [42, 85, 50], purple: [330, 40, 32],
	burgundy: [350, 55, 30], bronze: [28, 50, 38], brown: [30, 40, 35], copper: [22, 65, 42], apricot: [30, 80, 62], pink: [340, 50, 55]
};
const BLOOM = {
	white: [45, 30, 96], cream: [50, 50, 88], pink: [340, 65, 76], rose: [345, 60, 62], hotpink: [325, 75, 60], magenta: [315, 60, 50],
	red: [355, 80, 45], crimson: [350, 75, 36], cherry: [350, 80, 48], coral: [10, 75, 62], orange: [28, 90, 55], peach: [25, 80, 75],
	yellow: [50, 95, 55], gold: [42, 90, 50], lemon: [55, 90, 70], lime: [75, 55, 78], lavender: [265, 45, 72], purple: [275, 45, 50],
	violet: [262, 55, 45], blue: [220, 60, 62], skyblue: [205, 65, 72], burgundy: [345, 55, 30], green: [90, 35, 55], silver: [60, 8, 85],
	wheat: [40, 45, 70]
};
const BERRY = { red: [355, 80, 42], blue: [230, 40, 35], purple: [285, 55, 45], black: [260, 20, 15], orange: [25, 85, 50], white: [45, 15, 92], pink: [335, 60, 70], silver: [200, 10, 78], gold: [45, 80, 55], peach: [25, 80, 65] };
export const COLOR_SWATCH = { white: '#f6f2ea', yellow: '#f2c218', orange: '#f08a24', red: '#d42a2a', pink: '#f08bb0', purple: '#8e5bd0', blue: '#5a86e0', green: '#6bbf59' };
const COLOR_FAMILY = { white: 'white', cream: 'white', silver: 'white', pink: 'pink', rose: 'pink', hotpink: 'pink', peach: 'pink', coral: 'orange', magenta: 'purple', red: 'red', crimson: 'red', cherry: 'red', burgundy: 'red', orange: 'orange', yellow: 'yellow', gold: 'yellow', lemon: 'yellow', lime: 'green', green: 'green', lavender: 'purple', purple: 'purple', violet: 'purple', blue: 'blue', skyblue: 'blue', wheat: 'white' };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const SEASON_MONTHS = { spring: [3, 4, 5], summer: [6, 7, 8], fall: [9, 10, 11], winter: [12, 1, 2] };
const FULL_MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function parseMonths(s) {
	if (!s) return [];
	const [a, b] = s.split('-');
	const i = MONTHS.indexOf(a) + 1, j = (b ? MONTHS.indexOf(b) : MONTHS.indexOf(a)) + 1;
	if (!i || !j) return [];
	const out = [];
	for (let m = i; ; m = (m % 12) + 1) { out.push(m); if (m === j || out.length > 12) break; }
	return out;
}

const slug = (s) => s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function parsePlant(row, cat) {
	const [rawName, sci, form, h, w, g, traits, note] = row;
	const name = rawName.replace(/ Select'$/, "'").replace(/ Select$/, '');
	const t = {};
	for (const tok of traits.split(/\s+/)) {
		if (!tok) continue;
		const k = tok.indexOf(':');
		if (k > 0) t[tok.slice(0, k)] = tok.slice(k + 1);
		else t[tok] = true;
	}
	const herb = cat === 'perennials' || cat === 'grasses' || cat === 'annuals';
	const woody = !herb && cat !== 'vines';
	const it = {
		id: t.id || slug(name), name, sci, cat, form, h, w, note,
		ev: !!t.ev || (cat === 'evergreens' && !t.decid), native: !!t.n, deer: !!t.d, annual: !!t.annual, decid: !!t.decid,
		fine: !!t.fine, soft: !!t.soft, big: !!t.big, droop: !!t.droop, small: !!t.small, upright: !!t.upright, ephem: !!t.ephem,
		zones: t.z || '', sun: t.s || 'F',
		leafName: t.lf || (cat === 'evergreens' ? 'dark' : 'green'),
		fallName: t.fc || null, bloomName: t.bl || null, monthsLabel: t.w || '', fk: t.fk || null, bark: t.bk || null,
		berryName: t.br || null, plumeName: t.plume || null
	};
	it.leaf = LEAF[it.leafName] || LEAF.green;
	it.vari = it.leafName === 'variegated';
	it.fall = it.fallName ? FALL[it.fallName] || null : null;
	it.blooms = it.bloomName ? it.bloomName.split('+').map((c) => BLOOM[c] || BLOOM.white) : null;
	it.months = parseMonths(it.monthsLabel);
	it.berries = it.berryName ? BERRY[it.berryName] || BERRY.red : null;
	it.plume = it.plumeName ? BLOOM[it.plumeName] || BLOOM.wheat : null;
	// growth
	if (woody) {
		it.inYr = g;
		it.rate = g < 12 ? 'slow' : g <= 24 ? 'medium' : 'fast';
		it.yrs = Math.max(3, Math.min(60, Math.round(((h * 12) / g) * 1.35)));
	} else if (cat === 'vines') {
		it.yrs = 3; it.rate = 'fast';
	} else {
		it.fill = g;
		it.yrs = it.annual ? 0.6 : Math.max(1, g);
	}
	it.plant = defaultAge(it);
	it.colorFamilies = new Set((it.bloomName || '').split('+').map((c) => COLOR_FAMILY[c]).filter(Boolean));
	if (it.plume) it.colorFamilies.add(COLOR_FAMILY[it.plumeName] || 'white');
	it.bloomSeasons = Object.keys(SEASON_MONTHS).filter((s) => SEASON_MONTHS[s].some((m) => it.months.includes(m)));
	it.search = [name, sci, cat, form, it.bloomName, it.fallName && it.fallName + ' fall color', it.leafName !== 'green' && it.leafName, it.native && 'native', it.ev && 'evergreen', it.deer && 'deer resistant',
		sunWords(it.sun), it.months.map((m) => FULL_MONTH[m - 1]).join(' '), it.bloomSeasons.join(' '), note].filter(Boolean).join(' ').toLowerCase();
	return it;
}

function parseFeature(row) {
	const [name, kind, h, w, opts, group, desc] = row;
	const o = {};
	for (const tok of opts.split(/\s+/)) { const k = tok.indexOf(':'); if (k > 0) o[tok.slice(0, k)] = tok.slice(k + 1); }
	return {
		id: o.id || slug(name), name, cat: 'features', kind, h, w, opts: o, light: o.light === '1', group, raw: opts, desc: desc || name,
		search: [name, kind, group, 'feature', o.c].filter(Boolean).join(' ').toLowerCase()
	};
}

function sunWords(s) {
	const out = [];
	if (s.includes('F')) out.push('full sun');
	if (s.includes('P')) out.push('part shade');
	if (s.includes('S')) out.push('shade');
	return out.join(' ');
}
export function sunLabel(s) {
	const parts = [];
	if (s.includes('F')) parts.push('Full sun');
	if (s.includes('P')) parts.push('part shade');
	if (s.includes('S')) parts.push('shade');
	return parts.join(', ').replace(/^./, (c) => c.toUpperCase());
}

const seenNames = new Set();
const norm = (n) => n.toLowerCase().replace(/[\u2018\u2019']/g, "'").replace(/\s+select('?)$/, '$1').replace(/[^a-z0-9']+/g, ' ').trim();
function rows(list, cat) {
	const out = [];
	for (const r of list) {
		const k = norm(r[0]);
		if (seenNames.has(k)) continue; // already in the library
		seenNames.add(k);
		out.push(parsePlant(r, cat));
	}
	return out;
}
export const PLANTS = [
	...rows(TREES, 'trees'), ...rows(EVERGREENS, 'evergreens'), ...rows(SHRUBS, 'shrubs'), ...rows(PERENNIALS, 'perennials'),
	...rows(GRASSES, 'grasses'), ...rows(ANNUALS, 'annuals'), ...rows(VINES, 'vines'),
	...rows(TREES_X, 'trees'), ...rows(TREES_X2, 'trees'), ...rows(EVERGREENS_X, 'evergreens'), ...rows(SHRUBS_X, 'shrubs'), ...rows(SHRUBS_X2, 'shrubs'),
	...rows(PERENNIALS_X, 'perennials'), ...rows(PERENNIALS_X2, 'perennials'), ...rows(GRASSES_X, 'grasses'), ...rows(ANNUALS_X, 'annuals'), ...rows(VINES_X, 'vines'),
	...rows(REAL_TREES, 'trees'), ...rows(REAL_EVERGREENS, 'evergreens'), ...rows(REAL_SHRUBS, 'shrubs'), ...rows(REAL_PERENNIALS, 'perennials'), ...rows(REAL_GRASSES, 'grasses'), ...rows(REAL_ANNUALS, 'annuals')
];
const featNames = new Set();
export const FEATURES = [...FEATURE_ROWS, ...FEATURES_X, ...REAL_FEATURES].filter((r) => { const k = r[0].toLowerCase(); if (featNames.has(k)) return false; featNames.add(k); return true; }).map(parseFeature);
export const ALL = [...PLANTS, ...FEATURES];
export const byId = {};
for (const it of ALL) {
	let id = it.id, n = 2;
	while (byId[id]) id = `${it.id}-${n++}`;
	it.id = id;
	byId[id] = it;
}

/** Growth curve: logistic — slow establishment, steady growth, then levels off at maturity. */
function frac(age, yrs) {
	const r = 5.2 / yrs;
	const mid = yrs * 0.42;
	const f = 1 / (1 + Math.exp(-r * (age - mid)));
	const f0 = 1 / (1 + Math.exp(r * mid));
	return Math.max(0.04, ((f - f0) / (1 - f0)) * 1.02);
}

/** Size in feet of an item at a given age (years). Features don't grow. */
export function sizeAt(item, age) {
	const s = rawSize(item, age);
	// a real photo keeps its own proportions (blended a little toward the data)
	const a = item.photo && item.photo.aspect;
	if (a) s.w = s.h * a * 0.7 + s.w * 0.3;
	return s;
}
function rawSize(item, age) {
	if (item.cat === 'features' || item.fixedSize) return { h: item.h, w: item.w, f: 1 };
	if (item.annual) { const f = Math.min(1, 0.25 + Math.max(0, age) * 1.5); return { h: item.h * f, w: item.w * f, f }; }
	const f = Math.min(1.05, frac(Math.max(0, age), item.yrs));
	const fw = Math.min(1.05, Math.pow(f, 0.85));
	return { h: item.h * f, w: item.w * fw, f };
}

/** Typical nursery size at planting → starting age for each plant. */
function defaultAge(it) {
	let target;
	if (it.cat === 'trees') target = Math.min(it.h * 0.3, it.form === 'weeping' || it.h < 25 ? 5 : 8);
	else if (it.cat === 'evergreens') target = Math.min(it.h * 0.3, 6);
	else if (it.cat === 'shrubs') target = Math.min(it.h * 0.45, 2.5);
	else if (it.annual) return 0;
	else return 1;
	let best = 0;
	for (let a = 0; a <= 60; a += 0.25) { if (sizeAt(it, a).h >= target) { best = a; break; } best = a; }
	return Math.round(best);
}

export function fmtFt(ft) {
	if (ft < 1) return `${Math.round(ft * 12)} in`;
	return ft < 10 ? `${ft.toFixed(1).replace(/\.0$/, '')} ft` : `${Math.round(ft)} ft`;
}

export function growthLabel(it) {
	if (it.cat === 'features') return '';
	if (it.annual) return 'Annual: full size by midsummer, replant each spring';
	if (it.inYr) return `Grows about ${it.inYr} in. per year (${it.rate})`;
	if (it.cat === 'vines') return 'Fast climber; covers its support in about 3 years';
	return `Reaches full size in ${it.fill} season${it.fill > 1 ? 's' : ''}; ${it.ev ? 'stays green in winter' : 'dies back each winter'}`;
}

export function bloomLabel(it) {
	if (!it.blooms) return '';
	const names = it.bloomName.split('+').map((c) => c.replace('hotpink', 'hot pink').replace('skyblue', 'sky blue')).join(', ');
	return `${names[0].toUpperCase() + names.slice(1)} · ${it.monthsLabel.replace('-', '–')}`;
}

/**
 * Build a growing plant from a growth profile (used for Plant ID results that aren't in the
 * library yet). p: { name, sci, cat, h, w, g, sun, ev, bloom, months, fall, native, zones, note }
 * g = inches per year for trees/shrubs/evergreens, seasons to full size for perennials/grasses.
 */
const PROFILE_FORM = { trees: 'round', evergreens: 'pyramid', shrubs: 'mound', perennials: 'mound', grasses: 'grass', annuals: 'mound', vines: 'vine' };
export function plantFromProfile(p) {
	const cat = PROFILE_FORM[p.cat] ? p.cat : 'shrubs';
	const num = (v, lo, hi, d) => { v = +v; return Number.isFinite(v) && v > 0 ? Math.max(lo, Math.min(hi, v)) : d; };
	const h = num(p.h, 0.2, 150, cat === 'trees' ? 30 : cat === 'evergreens' ? 20 : 3);
	const w = num(p.w, 0.2, 100, h * 0.8);
	const g = num(p.g, 0.5, 60, cat === 'trees' || cat === 'evergreens' ? 12 : cat === 'shrubs' ? 8 : 2);
	const tok = [];
	if (p.native) tok.push('n');
	if (p.ev && cat !== 'evergreens') tok.push('ev');
	if (cat === 'annuals') tok.push('annual');
	if (/^z\d/.test(p.zones || '')) tok.push(p.zones); else if (/^\d+-\d+$/.test(p.zones || '')) tok.push('z' + p.zones);
	tok.push('s:' + (/^[FPS]{1,3}$/.test(p.sun || '') ? p.sun : 'F'));
	if (p.bloom && BLOOM[p.bloom]) tok.push('bl:' + p.bloom);
	if (p.bloom && /^[A-Z][a-z]{2}(-[A-Z][a-z]{2})?$/.test(p.months || '')) tok.push('w:' + p.months);
	if (p.fall && FALL[p.fall]) tok.push('fc:' + p.fall);
	return parsePlant([p.name || 'My plant', p.sci || '', PROFILE_FORM[cat], h, w, g, tok.join(' '), p.note || ''], cat);
}

export const maxAge = (item) => (item.cat === 'features' ? 0 : item.annual ? 1 : Math.max(item.inYr ? 6 : 4, Math.round(item.yrs * 1.6)));

/* ------------------------------------------------------------ My Library */

/**
 * Turn a saved photo asset record into a library item. A plant asset linked to a
 * library plant inherits all of that plant's data (growth, seasons, bloom…), so
 * the photo grows and changes like the real thing.
 */
export function assetItem(rec, getBlob) {
	const base = rec.base && byId[rec.base];
	const photo = { blob: () => getBlob(rec.blob), aspect: rec.aspect, bloom: !!rec.bloom, seasons: {}, thumb: rec.thumbUrl || null };
	let it;
	if (base && base.cat !== 'features') {
		it = { ...base, colorFamilies: base.colorFamilies, id: rec.id, name: rec.name, sci: rec.sci || base.sci, base: base.id };
	} else if (rec.growth) {
		it = { ...plantFromProfile({ ...rec.growth, name: rec.name, sci: rec.sci }), id: rec.id };
	} else {
		it = {
			id: rec.id, name: rec.name, sci: rec.sci || '', cat: 'features', kind: 'photo', h: rec.h, w: rec.h * rec.aspect, opts: {}, group: rec.group || 'My photos', raw: '',
			native: false, deer: false, ev: false, sun: '', months: [], bloomSeasons: [], colorFamilies: new Set()
		};
	}
	if (rec.h && base && base.cat !== 'features' && rec.fixed) { it.h = rec.h; it.w = rec.h * rec.aspect; it.fixedSize = true; }
	it.mine = true;
	it.note = rec.note || it.note || '';
	it.photo = photo;
	it.created = rec.created;
	it.search = [rec.name, rec.sci, 'my asset mine photo', rec.group, rec.tags, base && base.search].filter(Boolean).join(' ').toLowerCase();
	return it;
}
export function addItem(it) {
	const i = ALL.findIndex((x) => x.id === it.id);
	if (i >= 0) ALL[i] = it; else ALL.push(it);
	byId[it.id] = it;
}
export function removeItem(id) {
	const i = ALL.findIndex((x) => x.id === id);
	if (i >= 0) ALL.splice(i, 1);
	delete byId[id];
}

/* -------------------------------------------------------------- search */

const SYN = { bush: 'shrub', bushes: 'shrub', hedge: 'shrub', flower: 'perennials', pine: 'pine', rock: 'stone', rocks: 'stone', light: 'light', lights: 'light', shady: 'shade', sunny: 'sun', deer: 'deer', grasses: 'grass', vine: 'vines', climbing: 'vines', evergreens: 'evergreen' };
function edit1(a, b, max) {
	if (Math.abs(a.length - b.length) > max) return false;
	const m = a.length, n = b.length;
	// Damerau–Levenshtein (a swapped pair of letters counts as one mistake)
	let pp = new Array(n + 1).fill(0), prev = new Array(n + 1), cur = new Array(n + 1);
	for (let j = 0; j <= n; j++) prev[j] = j;
	for (let i = 1; i <= m; i++) {
		cur[0] = i;
		let best = cur[0];
		for (let j = 1; j <= n; j++) {
			let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, pp[j - 2] + 1);
			cur[j] = v;
			if (v < best) best = v;
		}
		if (best > max) return false;
		[pp, prev, cur] = [prev, cur, pp];
	}
	return prev[n] <= max;
}
const stem = (w) => w.length > 4 ? w.replace(/(ies)$/, 'y').replace(/(es|s)$/, '') : w;
/** Does an item match every word? Exact, then singular, then synonyms, then "sounds close" (for voice mistakes). */
export function matchesWords(it, words) {
	const text = it.search;
	return words.every((w) => {
		if (text.includes(w)) return true;
		const s = stem(w);
		if (s !== w && text.includes(s)) return true;
		if (SYN[w] && text.includes(SYN[w])) return true;
		if (w.length < 4) return false;
		const toks = it._toks || (it._toks = [...new Set(text.split(/[^a-z0-9]+/).filter((t) => t.length > 2))]);
		const max = w.length >= 7 ? 2 : 1;
		return toks.some((t) => edit1(w, t, max) || (t.length > w.length && edit1(w, t.slice(0, w.length), max - (max > 1 ? 1 : 0))));
	});
}

/** Relevance for sorting search results: name hits first, then scientific name. */
export function searchScore(it, words) {
	const n = it.name.toLowerCase(), sci = (it.sci || '').toLowerCase();
	let sc = 0;
	for (const w of words) { if (n.startsWith(w)) sc += 4; else if (n.includes(w)) sc += 3; else if (sci.includes(w)) sc += 2; }
	return sc + (it.mine ? 0.5 : 0);
}

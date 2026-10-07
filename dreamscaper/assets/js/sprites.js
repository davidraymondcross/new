/* DreamScaper – procedural plant & feature artwork.
 * Everything is painted in code (no image files), seeded so each plant keeps its
 * own character while it grows and changes with the seasons.
 */
import { rng, hsl, mix, clamp, canvas } from './util.js?v=2.7.8';
import { SEASON_MONTHS } from './library.js?v=2.7.8';
import { SIDE as FSIDE, topFeature } from './features-art.js?v=2.7.8';
import { seasonalPhoto, drawPhotoSprite, onPhotoReady, photoImage } from './photo.js?v=2.7.8';

const cache = new Map();
const CACHE_MAX = 500;
onPhotoReady(() => cache.clear());
let VARI = false; // current plant has variegated leaves

/**
 * Render (or fetch from cache) a sprite.
 * @param {object} item  library entry
 * @param {object} o     { w, h (px), seed, season, view: 'side'|'top', sun: -1|1 }
 * @returns {{c: HTMLCanvasElement, ax: number, ay: number, lights: Array}}
 */
export function sprite(item, o) {
	const qw = Math.max(4, Math.round(o.w / 3) * 3);
	const qh = Math.max(4, Math.round(o.h / 3) * 3);
	const key = `${item.id}|${o.seed}|${o.season}|${o.view}|${o.sun > 0 ? 1 : 0}|${qw}|${qh}`;
	let s = cache.get(key);
	if (s) { cache.delete(key); cache.set(key, s); return s; }
	s = o.view === 'top' ? drawTop(item, { ...o, w: qw, h: qh }) : drawSide(item, { ...o, w: qw, h: qh });
	cache.set(key, s);
	if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
	return s;
}

/** Best season to show a plant off in the library. */
export function showSeason(item) {
	if (item.cat === 'features') return 'summer';
	if (item.months && item.months.length) {
		const m = item.months[Math.floor(item.months.length / 2)];
		for (const k in SEASON_MONTHS) if (SEASON_MONTHS[k].includes(m)) return k === 'winter' ? (item.ev ? 'winter' : 'fall') : k;
	}
	if (item.berries && item.ev) return 'winter';
	return 'summer';
}

/** Library thumbnail: mature plant in its showiest season. */
export function thumb(item, size = 84, season) {
	const ar = (item.photo && item.photo.aspect) || item.w / item.h;
	let w = size * 0.92, h = w / ar;
	if (h > size * 0.92) { h = size * 0.92; w = h * ar; }
	w = Math.max(w, size * 0.22);
	if (item.cat === 'features' && ar > 4) { w = size * 0.95; h = Math.max(size * 0.18, w / ar); }
	const s = drawSide(item, { w, h, seed: 7, season: season || showSeason(item), sun: -1, thumb: true });
	const c = canvas(size, size);
	const x = c.getContext('2d');
	const k = Math.min(1, (size - 4) / s.c.height);
	x.drawImage(s.c, size / 2 - s.ax * k, size - 4 - s.ay * k, s.c.width * k, s.c.height * k);
	return c;
}

/* ------------------------------------------------------------------ colors */

const HERB = new Set(['perennials', 'grasses', 'annuals']);
function seasonal(item, season) {
	const leaf = item.leaf;
	if (item.annual && season === 'winter') return null;
	if (item.ephem && season !== 'spring') return null;
	if (item.ev) return season === 'winter' ? [leaf[0], Math.max(0, leaf[1] - 8), leaf[2] - 4] : season === 'spring' ? mix(leaf, [90, 55, 45], 0.12) : leaf;
	switch (season) {
		case 'spring': return leaf[0] > 290 || leaf[0] < 40 ? [leaf[0], leaf[1] + 8, leaf[2] + 6] : mix(leaf, [88, 60, 52], 0.32);
		case 'fall': return item.fall || (HERB.has(item.cat) ? mix(leaf, [40, 40, 45], 0.4) : mix(leaf, [42, 70, 48], 0.55));
		case 'winter': return null; // bare / dormant
		default: return leaf;
	}
}
function blooming(item, season) {
	if (item.cat === 'features' || !item.blooms || !item.months || !item.months.length) return null;
	if (!SEASON_MONTHS[season].some((m) => item.months.includes(m))) return null;
	if (season === 'fall' && item.form === 'hydrangea') return item.blooms.map((c) => (item.fk === 'cone' ? mix(c, [345, 50, 68], 0.55) : mix(c, [20, 30, 55], 0.45)));
	return item.blooms;
}
const pickC = (b, R) => (Array.isArray(b[0]) ? b[Math.floor(R() * b.length)] : b);
const fkOf = (item, d) => item.fk || d;
const BARK = [25, 18, 28];
const BIRCH = [28, 35, 70];
const BARKS = { birch: BIRCH, cinnamon: [18, 42, 45], gray: [30, 6, 58], sycamore: [40, 18, 72], coral: [5, 70, 52], redtwig: [355, 65, 38], yellowtwig: [55, 60, 52], lacebark: [70, 15, 55], shaggy: [25, 14, 36] };

/* ------------------------------------------------------------- primitives */

function lumpy(ctx, x, y, r, R, k = 9) {
	const n = k + Math.floor(R() * 4);
	const pts = [];
	for (let i = 0; i < n; i++) {
		const a = (i / n) * Math.PI * 2 + R() * 0.3;
		const rr = r * (0.82 + R() * 0.3);
		pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
	}
	ctx.beginPath();
	for (let i = 0; i < n; i++) {
		const p = pts[i], q = pts[(i + 1) % n];
		const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
		if (i === 0) ctx.moveTo(mx, my);
		else ctx.quadraticCurveTo(p[0], p[1], mx, my);
	}
	const p = pts[0], q = pts[1 % n];
	ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
	ctx.closePath();
}

/** One clump of leaves: shaded blob + leaf speckles. */
function clump(ctx, x, y, r, col, R, sun, fine) {
	const lx = x + sun * r * 0.38, ly = y - r * 0.42;
	const g = ctx.createRadialGradient(lx, ly, r * 0.05, x, y, r * 1.05);
	g.addColorStop(0, hsl(col, 13, 1, 4));
	g.addColorStop(0.55, hsl(col, 0));
	g.addColorStop(1, hsl(col, -11, 1, -4));
	ctx.fillStyle = g;
	lumpy(ctx, x, y, r, R);
	ctx.fill();
	const n = Math.min(fine ? 70 : 42, Math.floor(r * r * (fine ? 0.35 : 0.16)));
	const ls = Math.max(0.7, r * (fine ? 0.08 : 0.13));
	for (let i = 0; i < n; i++) {
		const a = R() * Math.PI * 2, d = Math.sqrt(R()) * r * 0.95;
		const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
		const lit = (sun * (px - x) - (py - y)) / r; // toward the sun = lighter
		ctx.fillStyle = VARI && R() < 0.38 ? hsl([55, 55, 84], (R() - 0.5) * 8, 0.95) : hsl(col, lit * 9 + (R() - 0.5) * 16, 0.9, (R() - 0.5) * 10, (R() - 0.5) * 8);
		ctx.beginPath();
		ctx.ellipse(px, py, ls * (0.7 + R() * 0.7), ls * (0.45 + R() * 0.4), R() * 3.14, 0, Math.PI * 2);
		ctx.fill();
	}
}

/** Fill a region with leaf clumps. inside(nx, ny) gets normalized -1..1 coords. */
function canopy(ctx, cx, cy, rx, ry, col, R, sun, opt = {}) {
	const r0 = clamp(Math.min(rx, ry) * (opt.rf || 0.24), 2.2, opt.rmax || 30);
	const n = clamp(Math.round((rx * ry) / (r0 * r0) * 1.9), 6, 320);
	const pts = [];
	let tries = 0;
	while (pts.length < n && tries < n * 6) {
		tries++;
		const nx = R() * 2 - 1, ny = R() * 2 - 1;
		if (!opt.square && nx * nx + ny * ny > 1) continue;
		if (opt.inside && !opt.inside(nx, ny)) continue;
		pts.push([cx + nx * (rx - r0 * 0.7), cy + ny * (ry - r0 * 0.7), nx, ny]);
	}
	pts.sort((a, b) => a[1] - b[1]);
	if (!opt.noBack) {
		ctx.fillStyle = hsl(col, -13, 1, -6);
		for (const p of pts) { lumpy(ctx, p[0], p[1] + r0 * 0.15, r0 * 1.02, R, 7); ctx.fill(); }
	}
	for (const p of pts) {
		const edge = Math.hypot(p[2], p[3]);
		const c = mix(col, col, 0);
		const dl = (sun * p[2] - p[3]) * 5 - (edge < 0.5 ? 4 : 0) + (R() - 0.5) * 6;
		clump(ctx, p[0], p[1], r0 * (0.75 + R() * 0.5), [c[0] + (R() - 0.5) * 6, c[1], c[2] + dl], R, sun, opt.fine);
	}
	return pts;
}

/** Darken the lower/shadow side of whatever has been drawn so far. */
function shade(ctx, x0, y0, x1, y1, sun, amt = 0.28) {
	ctx.save();
	ctx.globalCompositeOperation = 'source-atop';
	const g = ctx.createLinearGradient(0, y0, 0, y1);
	g.addColorStop(0, 'rgba(255,255,220,0.06)');
	g.addColorStop(0.55, 'rgba(0,0,0,0)');
	g.addColorStop(1, `rgba(0,15,0,${amt})`);
	ctx.fillStyle = g;
	ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
	const g2 = ctx.createLinearGradient(sun < 0 ? x0 : x1, 0, sun < 0 ? x1 : x0, 0);
	g2.addColorStop(0, 'rgba(0,0,0,0)');
	g2.addColorStop(0.6, 'rgba(0,0,0,0)');
	g2.addColorStop(1, `rgba(0,10,0,${amt * 0.6})`);
	ctx.fillStyle = g2;
	ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
	ctx.restore();
}

function trunk(ctx, x, yb, yt, wb, col, R, bend = 0) {
	const wt = wb * 0.45;
	ctx.beginPath();
	ctx.moveTo(x - wb / 2, yb);
	ctx.quadraticCurveTo(x - wb * 0.3 + bend * 0.5, (yb + yt) / 2, x - wt / 2 + bend, yt);
	ctx.lineTo(x + wt / 2 + bend, yt);
	ctx.quadraticCurveTo(x + wb * 0.3 + bend * 0.5, (yb + yt) / 2, x + wb / 2, yb);
	ctx.closePath();
	const g = ctx.createLinearGradient(x - wb / 2, 0, x + wb / 2, 0);
	g.addColorStop(0, hsl(col, 8));
	g.addColorStop(0.5, hsl(col, 0));
	g.addColorStop(1, hsl(col, -10));
	ctx.fillStyle = g;
	ctx.fill();
	// root flare
	ctx.fillStyle = hsl(col, -4);
	ctx.beginPath();
	ctx.ellipse(x, yb, wb * 0.75, wb * 0.18, 0, Math.PI, 0);
	ctx.fill();
}

/** Recursive bare branches (winter view and visible limbs). */
function limbs(ctx, x, y, len, ang, wid, depth, R, col, spread = 0.55, droop = 0) {
	const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
	const mx = (x + ex) / 2 + (R() - 0.5) * len * 0.25, my = (y + ey) / 2 + (R() - 0.5) * len * 0.15 + droop * len * 0.2;
	ctx.strokeStyle = hsl(col, (R() - 0.5) * 8);
	ctx.lineWidth = Math.max(0.5, wid);
	ctx.beginPath();
	ctx.moveTo(x, y);
	ctx.quadraticCurveTo(mx, my, ex, ey);
	ctx.stroke();
	if (depth <= 0 || len < 2) return;
	const kids = depth > 2 ? 2 + (R() < 0.45 ? 1 : 0) : 2;
	for (let i = 0; i < kids; i++) {
		const a = ang + (i - (kids - 1) / 2) * spread * (0.7 + R() * 0.6) + (R() - 0.5) * 0.25 + droop * 0.15;
		limbs(ctx, ex, ey, len * (0.62 + R() * 0.16), a, wid * 0.62, depth - 1, R, col, spread, droop);
	}
}

function flowers(ctx, pts, col, size, R, kind = 'dot') {
	for (const p of pts) {
		const s = size * (0.7 + R() * 0.6);
		const b = pickC(col, R);
		const c = [b[0] + (R() - 0.5) * 8, b[1], b[2] + (R() - 0.5) * 10];
		const x = p[0], y = p[1];
		switch (kind) {
			case 'star':
				ctx.fillStyle = hsl(c, 0);
				for (let k = 0; k < 4; k++) { const a = (k * Math.PI) / 2 + 0.4; ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * s * 0.55, y + Math.sin(a) * s * 0.55, s * 0.6, s * 0.35, a, 0, 7); ctx.fill(); }
				ctx.fillStyle = hsl([60, 50, 70], 0); ctx.beginPath(); ctx.arc(x, y, s * 0.2, 0, 7); ctx.fill();
				break;
			case 'cup': case 'trumpet':
				ctx.fillStyle = hsl(c, -10); ctx.beginPath(); ctx.ellipse(x, y, s * 0.8, s * 0.95, 0, 0, Math.PI); ctx.fill();
				ctx.fillStyle = hsl(c, 6); ctx.beginPath(); ctx.ellipse(x - s * 0.35, y - s * 0.1, s * 0.4, s * 0.85, -0.25, 0, 7); ctx.ellipse(x + s * 0.35, y - s * 0.1, s * 0.4, s * 0.85, 0.25, 0, 7); ctx.fill();
				if (kind === 'trumpet') { ctx.fillStyle = hsl([c[0] - 8, c[1], c[2] - 8], 0); ctx.beginPath(); ctx.arc(x, y, s * 0.35, 0, 7); ctx.fill(); }
				break;
			case 'globe': case 'umbel':
				for (let k = 0; k < 9; k++) { const a = R() * 7, d = Math.sqrt(R()) * s; ctx.fillStyle = hsl(c, (R() - 0.4) * 14); ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d * (kind === 'umbel' ? 0.5 : 1), Math.max(0.6, s * 0.32), 0, 7); ctx.fill(); }
				break;
			case 'panicle': case 'cone': case 'candle': case 'brush': {
				const L = s * (kind === 'candle' ? 3 : kind === 'brush' ? 1.6 : 2.2);
				for (let k = 0; k < 12; k++) { const u = R(); ctx.fillStyle = hsl(c, (R() - 0.5) * 14 + u * 6); ctx.beginPath(); ctx.arc(x + (R() - 0.5) * s * (1.2 - u) * (kind === 'brush' ? 0.6 : 1), y - u * L, Math.max(0.6, s * 0.3), 0, 7); ctx.fill(); }
				break;
			}
			case 'catkin':
				ctx.fillStyle = hsl(c, 4, 0.9); ctx.beginPath(); ctx.ellipse(x, y, s * 0.35, s * 0.7, R() - 0.5, 0, 7); ctx.fill();
				break;
			case 'smoke':
				ctx.fillStyle = hsl(c, 6, 0.35); ctx.beginPath(); ctx.arc(x, y, s * 2.2, 0, 7); ctx.fill();
				break;
			case 'lily':
				ctx.fillStyle = hsl(c, 0);
				for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * s * 0.6, y + Math.sin(a) * s * 0.6, s * 0.65, s * 0.22, a, 0, 7); ctx.fill(); }
				ctx.fillStyle = hsl([c[0], c[1], c[2] - 20], 0); ctx.beginPath(); ctx.arc(x, y, s * 0.2, 0, 7); ctx.fill();
				break;
			default:
				ctx.fillStyle = hsl(c, 0);
				ctx.beginPath(); ctx.arc(x, y, s, 0, 7); ctx.fill();
				ctx.fillStyle = hsl(c, 14, 0.8);
				ctx.beginPath(); ctx.arc(x - s * 0.3, y - s * 0.3, s * 0.45, 0, 7); ctx.fill();
		}
	}
}

function berriesOn(ctx, R, cx, cy, rx, ry, col, size) {
	const n = Math.round(clamp(rx * ry * 0.02, 6, 120));
	for (let i = 0; i < n; i++) {
		const a = R() * 7, d = Math.sqrt(R());
		const x = cx + Math.cos(a) * rx * d, y = cy + Math.sin(a) * ry * d;
		for (let k = 0; k < 3; k++) {
			ctx.fillStyle = hsl(col, (R() - 0.5) * 10);
			ctx.beginPath(); ctx.arc(x + (R() - 0.5) * size * 2, y + (R() - 0.5) * size * 2, size, 0, 7); ctx.fill();
		}
		ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.arc(x - size * 0.3, y - size * 0.3, size * 0.35, 0, 7); ctx.fill();
	}
}

/* --------------------------------------------------------------- side view */

const HEAD = { firepit: 1.9, firebowl: 2.05, firetable: 1.75, fountain: 1.12, bubbler: 1.15, urnfountain: 1.1, torch: 1.05, hottub: 1.1 };
function drawSide(item, o) {
	const pad = Math.max(3, Math.round(Math.max(o.w, o.h) * 0.05));
	const head = item.cat === 'features' ? HEAD[item.kind] || 1.04 : item.cat === 'perennials' || item.cat === 'annuals' ? 1.35 : 1.04;
	const W = Math.ceil(o.w * 1.12 + pad * 2), H = Math.ceil(o.h * head + pad * 2);
	const c = canvas(W, H);
	const ctx = c.getContext('2d');
	let seed = o.seed * 7919;
	for (let i = 0; i < item.id.length; i++) seed = (seed * 31 + item.id.charCodeAt(i)) >>> 0;
	const R = rng(seed);
	const cx = W / 2, base = H - pad, w = o.w, h = o.h, sun = o.sun < 0 ? -1 : 1;
	const res = { c, ax: cx, ay: base, lights: [] };
	if (item.photo && !item.photo.failed) {
		const mode = drawPhotoSprite(ctx, item, o.season, cx, base, w, h, o.thumb ? 1 : sun);
		if (mode === 'full') return res;
		if (mode === 'bare') {
			// winter: real trunk from the photo over a drawn bare-branch skeleton
			const tmp = canvas(W, H), tx = tmp.getContext('2d');
			const F0 = PLANT_FORMS[item.form] || PLANT_FORMS.round;
			F0(tx, { item, col: null, bloom: null, cx, base, w, h, R, sun, season: o.season });
			ctx.globalCompositeOperation = 'destination-over'; ctx.drawImage(tmp, 0, 0); ctx.globalCompositeOperation = 'source-over';
			return res;
		}
		if (item.mine && item.cat === 'features') return res;
		// not loaded yet (or dormant perennial) → drawn version below
	}
	if (item.cat === 'features') {
		const f = FSIDE[item.kind];
		if (f) f(ctx, cx, base, w, h, R, sun, res, item.opts || {});
		return res;
	}
	VARI = !!item.vari;
	const col = seasonal(item, o.season);
	const bloom = blooming(item, o.season);
	const F = PLANT_FORMS[item.form] || PLANT_FORMS.round;
	const early = bloom && o.season === 'spring' && !item.ev && (item.cat === 'trees' || item.form === 'multistem') && (item.months[0] <= 3 || (item.months[0] === 4 && item.months.length === 1));
	if (early) {
		// flowers open on bare branches before the leaves (redbud, cherries, magnolias, serviceberry…)
		F(ctx, { item, col: null, bloom: item.form === 'weeping' ? bloom : null, cx, base, w, h, R, sun, season: o.season });
		if (item.form !== 'weeping') {
			const top = item.form === 'multistem' ? 0.68 : 0.62;
			const rx = w * 0.46, ry = h * (item.form === 'multistem' ? 0.3 : 0.34);
			const n = Math.round(clamp((rx * ry) / Math.pow(Math.max(1.2, w * 0.02), 2) * 0.35, 20, 900));
			const pts = [];
			for (let i = 0; i < n; i++) { const a2 = R() * 7, d = Math.sqrt(R()); pts.push([cx + Math.cos(a2) * rx * d, base - h * top + Math.sin(a2) * ry * d * (Math.sin(a2) < 0 ? 1 : 0.8)]); }
			for (let i = 0; i < n * 0.15; i++) { const p = pts[i]; ctx.fillStyle = hsl([88, 55, 55], (R() - 0.5) * 10, 0.8); ctx.beginPath(); ctx.arc(p[0] + 2, p[1] + 1, Math.max(0.6, w * 0.008), 0, 7); ctx.fill(); }
			flowers(ctx, pts, bloom, Math.max(1.1, w * (item.fk === 'cup' ? 0.03 : 0.018)), R, fkOf(item, 'dot'));
		}
	} else F(ctx, { item, col, bloom, cx, base, w, h, R, sun, season: o.season });
	if (item.berries && (o.season === 'fall' || o.season === 'winter') && item.form !== 'vine') {
		const tall = item.cat === 'trees' || item.cat === 'evergreens';
		berriesOn(ctx, R, cx, base - h * (tall ? 0.6 : 0.55), w * 0.38, h * (tall ? 0.3 : 0.35), item.berries, Math.max(0.8, Math.min(w, h) * (tall ? 0.008 : 0.016)));
	}
	VARI = false;
	if (!o.thumb) realism(c, base, h, item);
	return res;
}

/* Photo-style finish for drawn plants: muted, natural colour, fine grain like a
 * camera sensor, and ambient-occlusion shade low in the plant where light can't reach. */
function realism(c, base, h, item) {
	const ctx = c.getContext('2d');
	const W = c.width, H = c.height;
	if (W * H > 700000 || W < 6 || H < 6) return;
	ctx.save();
	ctx.globalCompositeOperation = 'source-atop';
	const g = ctx.createLinearGradient(0, base - h, 0, base);
	g.addColorStop(0, 'rgba(255,250,235,0.05)');
	g.addColorStop(0.55, 'rgba(0,0,0,0)');
	g.addColorStop(1, 'rgba(10,20,8,0.28)');
	ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
	ctx.restore();
	const d = ctx.getImageData(0, 0, W, H), px = d.data;
	let seed = (W * 73856093) ^ (H * 19349663) ^ item.id.length;
	const desat = HERB.has(item.cat) ? 0.86 : 0.8;
	for (let i = 0; i < px.length; i += 4) {
		if (px[i + 3] === 0) continue;
		seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
		const n = 1 + ((seed >>> 8) / 16777216 - 0.5) * 0.11;
		const r = px[i], gg = px[i + 1], b = px[i + 2];
		const l = r * 0.3 + gg * 0.59 + b * 0.11;
		px[i] = (l + (r - l) * desat) * n;
		px[i + 1] = (l + (gg - l) * desat) * n;
		px[i + 2] = (l + (b - l) * desat) * n * 0.97;
	}
	ctx.putImageData(d, 0, 0);
}


const isTreeBark = (item) => BARKS[item.bark] || BARK;

function treeWinter(ctx, a, trunkTop, spread) {
	const { cx, base, w, h, R, item } = a;
	const bark = isTreeBark(item);
	const tw = Math.max(1.5, w * 0.07);
	trunk(ctx, cx, base, trunkTop, tw, bark, R);
	const depth = h > 160 ? 6 : h > 60 ? 5 : 4;
	const n = 3 + Math.floor(R() * 2);
	for (let i = 0; i < n; i++) {
		const ang = -Math.PI / 2 + (i - (n - 1) / 2) * spread * 0.55 + (R() - 0.5) * 0.2;
		limbs(ctx, cx, trunkTop + 2, (base - trunkTop) * 0.55 * (h / (base - trunkTop + 1)) * 0.42, ang, tw * 0.6, depth, R, bark, spread);
	}
}

const PLANT_FORMS = {
	round(ctx, a) { broadleaf(ctx, a, 0.3, 1, 0.5); },
	oval(ctx, a) { broadleaf(ctx, a, 0.22, 0.85, 0.42); },
	spreading(ctx, a) {
		const { cx, base, w, h, R, col, sun, bloom, item } = a;
		const tH = h * 0.3;
		if (!col) return treeWinter(ctx, a, base - tH, 0.9);
		const bark = isTreeBark(item);
		trunk(ctx, cx, base, base - tH - h * 0.1, Math.max(1.5, w * 0.06), bark, R, (R() - 0.5) * w * 0.05);
		for (let i = 0; i < 4; i++) limbs(ctx, cx, base - tH, h * 0.32, -Math.PI / 2 + (i - 1.5) * 0.55, w * 0.025, 1, R, bark, 0.5);
		const tiers = 3;
		const flowerPts = [];
		for (let t = 0; t < tiers; t++) {
			const ty = base - tH - (h - tH) * (0.18 + t * 0.32);
			const rx = (w / 2) * (1 - t * 0.2), ry = (h - tH) * 0.24;
			const pts = canopy(ctx, cx + (R() - 0.5) * w * 0.08, ty, rx, ry, [col[0], col[1], col[2] + t * 2], R, sun, { fine: item.fine, rf: 0.22 });
			if (bloom) for (const p of pts) if (R() < 0.85) flowerPts.push([p[0] + (R() - 0.5) * 6, p[1] - 2]);
		}
		shade(ctx, 0, base - h, ctx.canvas.width, base, sun);
		if (bloom) flowers(ctx, flowerPts, bloom, Math.max(1.2, w * 0.022), R, fkOf(item, 'dot'));
	},
	vase(ctx, a) {
		const { cx, base, w, h, R, col, sun, bloom, item } = a;
		const tH = h * 0.3;
		if (!col) return treeWinter(ctx, a, base - tH, 1.05);
		const bark = isTreeBark(item);
		trunk(ctx, cx, base, base - tH, Math.max(1.5, w * 0.06), bark, R);
		for (let i = 0; i < 3; i++) limbs(ctx, cx, base - tH, h * 0.3, -Math.PI / 2 + (i - 1) * 0.5, w * 0.03, 1, R, bark, 0.35);
		const pts = canopy(ctx, cx, base - tH - (h - tH) / 2, w / 2, (h - tH) / 2, col, R, sun, {
			inside: (nx, ny) => Math.abs(nx) < 1 - 0.5 * Math.pow((ny + 1) / 2, 1.6)
		});
		shade(ctx, 0, base - h, ctx.canvas.width, base, sun);
		if (bloom) flowers(ctx, pts.filter(() => R() < (item.id === 'redbud' ? 2 : 0.9)).map((p) => [p[0] + (R() - 0.5) * 8, p[1]]), bloom, Math.max(1.2, w * 0.02), R, fkOf(item, 'dot'));
	},
	multistem(ctx, a) {
		const { cx, base, w, h, R, col, sun, bloom, item } = a;
		const bark = isTreeBark(item);
		const n = 3 + Math.floor(R() * 2);
		const tops = [];
		for (let i = 0; i < n; i++) {
			const t = n === 1 ? 0 : i / (n - 1) - 0.5;
			const tx = cx + t * w * 0.45, ty = base - h * (0.5 + R() * 0.12);
			tops.push([tx, ty]);
			ctx.strokeStyle = hsl(bark, (R() - 0.5) * 6);
			ctx.lineCap = 'round';
			ctx.lineWidth = Math.max(1.2, w * 0.035);
			ctx.beginPath();
			ctx.moveTo(cx + t * w * 0.06, base);
			ctx.quadraticCurveTo(cx + t * w * 0.12, base - h * 0.25, tx, ty);
			ctx.stroke();
			if (item.bark === 'birch') {
				ctx.strokeStyle = 'rgba(70,45,35,.55)';
				ctx.lineWidth = Math.max(0.6, w * 0.008);
				for (let k = 0; k < 6; k++) {
					const u = 0.1 + R() * 0.8;
					const px = cx + t * w * 0.06 + (tx - cx - t * w * 0.06) * u, py = base + (ty - base) * u;
					ctx.beginPath(); ctx.moveTo(px - w * 0.012, py); ctx.lineTo(px + w * 0.012, py + 1); ctx.stroke();
				}
			}
		}
		if (!col) {
			for (const t of tops) limbs(ctx, t[0], t[1], h * 0.2, -Math.PI / 2 + (t[0] - cx) / w, w * 0.02, 4, R, bark, 0.6);
			return;
		}
		const fpts = [];
		canopy(ctx, cx, base - h * 0.68, w / 2, h * 0.32, col, R, sun, { rf: 0.2, inside: (nx, ny) => ny < 0.85 }).forEach((p) => { if (bloom && R() < 0.8) fpts.push(p); });
		shade(ctx, 0, base - h, ctx.canvas.width, base, sun);
		if (bloom) flowers(ctx, fpts, bloom, Math.max(1, w * 0.02), R, fkOf(item, 'dot'));
	},
	weeping(ctx, a) {
		const { cx, base, w, h, R, col, sun, bloom } = a;
		const top = base - h;
		trunk(ctx, cx, base, top + h * 0.12, Math.max(1.5, w * 0.06), BARK, R, w * 0.02);
		const strands = Math.round(clamp(w / 2.4, 10, 70));
		const pts = [];
		for (let i = 0; i < strands; i++) {
			const t = (i / (strands - 1)) * 2 - 1;
			const sx = cx + t * w * 0.18, sy = top + h * 0.08 + Math.abs(t) * h * 0.06;
			const ex = cx + t * w * 0.5 + (R() - 0.5) * w * 0.06, ey = base - h * (0.08 + R() * 0.25) * (1 - Math.abs(t) * 0.3);
			const cxp = cx + t * w * 0.55, cyp = top - h * 0.02;
			ctx.strokeStyle = hsl(BARK, 6, 0.9);
			ctx.lineWidth = Math.max(0.5, w * 0.006);
			ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(cxp, cyp, ex, ey); ctx.stroke();
			for (let k = 0; k < 14; k++) {
				const u = 0.25 + (k / 14) * 0.75, iu = 1 - u;
				pts.push([iu * iu * sx + 2 * iu * u * cxp + u * u * ex, iu * iu * sy + 2 * iu * u * cyp + u * u * ey]);
			}
		}
		const c2 = col || null;
		const s = Math.max(1, w * 0.018);
		for (const p of pts) {
			if (bloom && R() < 0.75) { flowers(ctx, [p], bloom, s * 1.05, R); continue; }
			if (!c2) continue;
			ctx.fillStyle = hsl(c2, (R() - 0.5) * 14);
			ctx.beginPath(); ctx.ellipse(p[0], p[1], s, s * 1.6, R(), 0, 7); ctx.fill();
		}
		if (col || bloom) shade(ctx, 0, top, ctx.canvas.width, base, sun, 0.2);
	},
	pyramid(ctx, a) {
		const { cx, base, w, h, R, col, sun, bloom, item } = a;
		const top = base - h;
		if (!col) return excurrentWinter(ctx, a, 0.95);
		ctx.fillStyle = hsl(BARK, -4);
		ctx.fillRect(cx - Math.max(1, w * 0.04), base - h * 0.1, Math.max(2, w * 0.08), h * 0.1);
		const tiers = clamp(Math.round(h / Math.max(3, w * 0.16)), 6, 22);
		const cDark = [col[0], col[1], col[2] - 6];
		for (let i = 0; i < tiers; i++) {
			const u = (i + 1) / tiers;
			const y = top + (h * 0.93) * u;
			const hw = (w / 2) * (0.12 + 0.88 * u) * (0.92 + R() * 0.12);
			const th = (h / tiers) * 1.9;
			const g = ctx.createLinearGradient(cx - hw, 0, cx + hw, 0);
			g.addColorStop(sun < 0 ? 0 : 1, hsl(col, 7));
			g.addColorStop(0.5, hsl(col, -1));
			g.addColorStop(sun < 0 ? 1 : 0, hsl(cDark, -6));
			ctx.fillStyle = g;
			ctx.beginPath();
			ctx.moveTo(cx, y - th);
			const jag = item.soft ? 7 : 11;
			for (let k = 0; k <= jag; k++) {
				const t = k / jag;
				const px = cx - hw + 2 * hw * t;
				const droop = Math.sin(t * Math.PI) * th * -0.08 + th * 0.12 * Math.abs(t - 0.5) * 2;
				const tip = (k % 2 ? th * 0.16 : 0) * (item.soft ? 1.6 : 1);
				ctx.lineTo(px, y + droop + tip * (0.6 + R() * 0.6));
			}
			ctx.closePath();
			ctx.fill();
			// needle texture
			const n = Math.min(80, Math.round(hw * th * 0.08));
			for (let k = 0; k < n; k++) {
				const t = R() * 2 - 1;
				const px = cx + t * hw * 0.9, py = y - th * 0.3 + R() * th * 0.35;
				ctx.strokeStyle = hsl(col, (R() - 0.3) * 16 + sun * t * 6, 0.8);
				ctx.lineWidth = Math.max(0.5, w * 0.008);
				ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + t * 3, py + 2 + R() * 3); ctx.stroke();
			}
		}
		if (bloom) {
			const pts = [];
			for (let i = 0; i < Math.round(w * 0.6); i++) { const u = R(); pts.push([cx + (R() * 2 - 1) * (w / 2) * u * 0.85, top + h * 0.93 * u]); }
			flowers(ctx, pts, bloom, Math.max(0.8, w * 0.012), R);
		}
	},
	columnar(ctx, a) {
		const { cx, base, w, h, R, col, sun } = a;
		if (!col) return a.item.cat === 'trees' ? excurrentWinter(ctx, a, 0.6) : shrubWinter(ctx, a);
		const top = base - h;
		// profile: widest 35% up, gently tapering to a rounded tip
		const prof = (u) => (w / 2) * (u < 0.3 ? 0.84 + 0.16 * (u / 0.3) : Math.pow(Math.max(0, 1 - Math.pow((u - 0.3) / 0.72, 2)), 0.6));
		const steps = 28;
		ctx.beginPath();
		for (let i = 0; i <= steps; i++) { const u = i / steps; ctx.lineTo(cx - prof(u) * (0.96 + R() * 0.08), base - u * h); }
		for (let i = steps; i >= 0; i--) { const u = i / steps; ctx.lineTo(cx + prof(u) * (0.96 + R() * 0.08), base - u * h); }
		ctx.closePath();
		const g = ctx.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
		g.addColorStop(sun < 0 ? 0 : 1, hsl(col, 6)); g.addColorStop(sun < 0 ? 1 : 0, hsl(col, -12));
		ctx.fillStyle = g; ctx.fill();
		const r = clamp(w * 0.13, 1.2, 10);
		const n = clamp(Math.round((w * h) / (r * r) * 0.9), 20, 600);
		for (let i = 0; i < n; i++) {
			const u = R() * 0.98, half = prof(u);
			const t = R() * 2 - 1;
			const px = cx + t * half * 0.92, py = base - u * h;
			ctx.fillStyle = hsl(col, sun * t * 9 + (R() - 0.5) * 12, 0.95, 0, (R() - 0.5) * 6);
			ctx.beginPath(); ctx.ellipse(px, py, r * (0.6 + R() * 0.6), r * (0.8 + R() * 0.7), (R() - 0.5) * 0.6, 0, 7); ctx.fill();
		}
		shade(ctx, 0, top, ctx.canvas.width, base, sun, 0.3);
	},
	dome(ctx, a) {
		const { cx, base, w, h, R, col, sun } = a;
		if (!col) return dormant(ctx, a);
		canopy(ctx, cx, base - h / 2, w / 2, h / 2, col, R, sun, { rf: 0.3, fine: true, inside: (nx, ny) => ny < 0.82 });
		shade(ctx, 0, base - h, ctx.canvas.width, base, sun, 0.32);
	},
	mound(ctx, a) {
		const { cx, base, w, h, R, col, sun, bloom, item } = a;
		if (!col) return shrubWinter(ctx, a);
		const pts = canopy(ctx, cx, base - h / 2, w / 2, h / 2, col, R, sun, {
			rf: item.big ? 0.22 : 0.26, inside: (nx, ny) => ny < 0.8 && ny > -1 + 0.35 * Math.abs(Math.sin(nx * 3.1 + 1))
		});
		shade(ctx, 0, base - h, ctx.canvas.width, base, sun, 0.3);
		if (bloom) {
			const sel = pts.filter((p) => p[3] < 0.45 && R() < 0.9);
			if (item.fk === 'panicle' || item.fk === 'umbel' || item.fk === 'globe' || item.fk === 'brush' || item.fk === 'smoke') flowers(ctx, sel, bloom, Math.max(1.4, w * 0.035), R, item.fk);
			else flowers(ctx, sel.flatMap((p) => [[p[0], p[1]], [p[0] + (R() - 0.5) * w * 0.05, p[1] + (R() - 0.5) * h * 0.05]]), bloom, Math.max(1, w * (item.big ? 0.028 : 0.022)), R);
		}
	},
	hydrangea(ctx, a) {
		const { cx, base, w, h, R, col, sun, bloom } = a;
		if (!col) return shrubWinter(ctx, a);
		const pts = canopy(ctx, cx, base - h / 2, w / 2, h / 2, col, R, sun, { rf: 0.27, inside: (nx, ny) => ny < 0.8 });
		shade(ctx, 0, base - h, ctx.canvas.width, base, sun, 0.3);
		if (!bloom) return;
		const heads = pts.filter((p) => p[3] < 0.35).filter(() => R() < 0.6);
		const r = Math.max(1.6, w * 0.075);
		heads.forEach((p) => {
			const b0 = pickC(bloom, R);
			const hc = [b0[0] + (R() - 0.5) * 14, b0[1], b0[2] + (R() - 0.5) * 8];
			if (a.item.fk === 'cone') { for (let k = 0; k < 16; k++) { const u = R(); ctx.fillStyle = hsl(hc, (R() - 0.4) * 14 + u * 6); ctx.beginPath(); ctx.arc(p[0] + (R() - 0.5) * r * 1.3 * (1 - u), p[1] + r * 0.6 - u * r * 2.2, Math.max(0.7, r * 0.28), 0, 7); ctx.fill(); } return; }
			const g = ctx.createRadialGradient(p[0] + sun * r * 0.3, p[1] - r * 0.35, r * 0.1, p[0], p[1], r);
			g.addColorStop(0, hsl(hc, 12)); g.addColorStop(1, hsl(hc, -12));
			ctx.fillStyle = g;
			ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 7); ctx.fill();
			for (let k = 0; k < Math.min(26, r * 2.5); k++) {
				const aa = R() * 7, d = Math.sqrt(R()) * r * 0.9;
				ctx.fillStyle = hsl(hc, (R() - 0.4) * 16, 0.9);
				ctx.beginPath(); ctx.arc(p[0] + Math.cos(aa) * d, p[1] + Math.sin(aa) * d, Math.max(0.6, r * 0.16), 0, 7); ctx.fill();
			}
		});
	},
	rose(ctx, a) {
		const { cx, base, w, h, R, col, sun, bloom } = a;
		if (!col) return shrubWinter(ctx, a);
		const pts = canopy(ctx, cx, base - h / 2, w / 2, h / 2, col, R, sun, { rf: 0.24, inside: (nx, ny) => ny < 0.8 });
		shade(ctx, 0, base - h, ctx.canvas.width, base, sun, 0.3);
		if (!bloom) return;
		const r = Math.max(1.2, w * 0.045);
		pts.filter((p) => p[3] < 0.5 && R() < 0.7).forEach((p) => {
			const rc = pickC(bloom, R);
			ctx.fillStyle = hsl(rc, (R() - 0.5) * 8);
			ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 7); ctx.fill();
			ctx.strokeStyle = hsl(rc, -14);
			ctx.lineWidth = Math.max(0.4, r * 0.2);
			ctx.beginPath(); ctx.arc(p[0], p[1], r * 0.5, 0, 4.5); ctx.stroke();
		});
	},
	mat(ctx, a) {
		const { cx, base, w, h, R, col, sun, bloom, item } = a;
		if (!col) return item.cat === 'shrubs' ? shrubWinter(ctx, { ...a, h: Math.max(h, w * 0.12) }) : dormant(ctx, a);
		const hh = Math.max(h, w * 0.1);
		const mp = canopy(ctx, cx, base - hh / 2, w / 2, hh / 2, col, R, sun, { rf: 0.5, rmax: 10, fine: true, inside: (nx, ny) => ny < 0.7 });
		shade(ctx, 0, base - hh, ctx.canvas.width, base, sun, 0.25);
		if (bloom) flowers(ctx, mp.filter((p) => p[3] < 0.3).flatMap((p) => [[p[0], p[1]], [p[0] + (R() - 0.5) * hh, p[1] + (R() - 0.5) * hh * 0.4]]), bloom, Math.max(0.9, Math.min(w * 0.02, hh * 0.18)), R, fkOf(item, 'dot'));
	},
	hosta(ctx, a) {
		const { cx, base, w, h, R, col, sun, bloom } = a;
		if (!col) return dormant(ctx, a);
		if (bloom) {
			for (let i = 0; i < 4; i++) {
				const sx = cx + (R() - 0.5) * w * 0.3, top = base - h * (1.25 + R() * 0.25);
				ctx.strokeStyle = hsl(col, -8); ctx.lineWidth = Math.max(0.5, w * 0.012);
				ctx.beginPath(); ctx.moveTo(sx, base - h * 0.4); ctx.lineTo(sx, top); ctx.stroke();
				for (let k = 0; k < 6; k++) { ctx.fillStyle = hsl(pickC(bloom, R), (R() - 0.5) * 10); ctx.beginPath(); ctx.ellipse(sx + (k % 2 ? 2 : -2) * w * 0.006, top + k * h * 0.07, w * 0.016, w * 0.03, 0, 0, 7); ctx.fill(); }
			}
		}
		const n = Math.round(clamp(w / 2.2, 11, 34));
		const leaves = [];
		for (let i = 0; i < n; i++) {
			const t = (i / (n - 1)) * 2 - 1 + (R() - 0.5) * 0.12;
			leaves.push({ ang: -Math.PI / 2 + t * 1.25, len: (w / 2) * (0.62 + R() * 0.3) * (1 - Math.abs(t) * 0.12), up: 1 - Math.abs(t) });
		}
		leaves.sort((p, q) => q.up - p.up); // upright leaves sit behind
		const by = base - h * 0.08, sy = (h * 1.1) / (w / 2);
		for (const L of leaves) {
			const dx = Math.cos(L.ang), dy = Math.sin(L.ang) * Math.min(1.2, sy);
			const tx = cx + dx * L.len, ty = by + dy * L.len;
			const nx = -dy, ny = dx, wd = L.len * 0.36;
			const mx = cx + dx * L.len * 0.5, my = by + dy * L.len * 0.5 - L.len * 0.08;
			const lg = ctx.createLinearGradient(cx, by, tx, ty);
			lg.addColorStop(0, hsl(col, -12)); lg.addColorStop(1, hsl(col, 6 + (R() - 0.5) * 8 - dx * sun * 5));
			ctx.fillStyle = lg;
			ctx.beginPath();
			ctx.moveTo(cx + dx * 2, by);
			ctx.quadraticCurveTo(mx + nx * wd * 1.25, my + ny * wd * 1.25, tx, ty);
			ctx.quadraticCurveTo(mx - nx * wd * 1.25, my - ny * wd * 1.25, cx + dx * 2, by);
			ctx.fill();
			ctx.strokeStyle = hsl([58, 45, 80], 0, 0.8); ctx.lineWidth = Math.max(0.4, wd * 0.09); ctx.stroke();
			ctx.strokeStyle = hsl(col, -14, 0.5); ctx.lineWidth = Math.max(0.3, wd * 0.05);
			ctx.beginPath(); ctx.moveTo(cx, by); ctx.quadraticCurveTo(mx, my, tx, ty); ctx.stroke();
		}
	},
	daylily(ctx, a) {
		const { cx, base, w, h, R, col, bloom } = a;
		if (!col) return dormant(ctx, a);
		blades(ctx, cx, base, w, h * 0.7, col, R, 34, 1.5, Math.max(1, w * 0.03));
		if (bloom) {
			for (let i = 0; i < 7; i++) {
				const fx = cx + (R() - 0.5) * w * 0.7, fy = base - h * (0.8 + R() * 0.2);
				ctx.strokeStyle = hsl(col, -6); ctx.lineWidth = Math.max(0.4, w * 0.01);
				ctx.beginPath(); ctx.moveTo(cx + (fx - cx) * 0.3, base - h * 0.3); ctx.lineTo(fx, fy); ctx.stroke();
				const r = Math.max(1.5, w * 0.07);
				for (let k = 0; k < 6; k++) {
					const aa = (k / 6) * Math.PI * 2 + 0.3;
					ctx.fillStyle = hsl(pickC(bloom, R), k % 2 ? 4 : -4);
					ctx.beginPath(); ctx.ellipse(fx + Math.cos(aa) * r * 0.5, fy + Math.sin(aa) * r * 0.35, r * 0.55, r * 0.22, aa, 0, 7); ctx.fill();
				}
				ctx.fillStyle = hsl([30, 90, 40], 0); ctx.beginPath(); ctx.arc(fx, fy, r * 0.18, 0, 7); ctx.fill();
			}
		}
	},
	daisy(ctx, a) {
		const { cx, base, w, h, R, col, sun, bloom, item } = a;
		if (!col) return dormant(ctx, a);
		canopy(ctx, cx, base - h * 0.22, w / 2, h * 0.22, col, R, sun, { rf: 0.35, rmax: 8, inside: (nx, ny) => ny < 0.8 });
		if (!bloom) return;
		const n = Math.round(clamp(w * 0.35, 6, 40));
		const r = Math.max(1.4, w * 0.075);
		for (let i = 0; i < n; i++) {
			const fx = cx + (R() - 0.5) * w * 0.85, fy = base - h * (0.55 + R() * 0.45);
			ctx.strokeStyle = hsl(col, -4); ctx.lineWidth = Math.max(0.4, w * 0.008);
			ctx.beginPath(); ctx.moveTo(cx + (fx - cx) * 0.6, base - h * 0.2); ctx.lineTo(fx, fy); ctx.stroke();
			const b0 = pickC(bloom, R);
			const pc = [b0[0] + (R() - 0.5) * 6, b0[1], b0[2] + (R() - 0.5) * 8];
			for (let k = 0; k < 10; k++) {
				const aa = (k / 10) * Math.PI * 2;
				const dy = item.droop ? Math.abs(Math.sin(aa)) * r * 0.35 + r * 0.15 : 0;
				ctx.fillStyle = hsl(pc, (k % 3) * 3 - 3);
				ctx.beginPath(); ctx.ellipse(fx + Math.cos(aa) * r * 0.55, fy + Math.sin(aa) * r * 0.3 + dy, r * 0.45, r * 0.15, aa, 0, 7); ctx.fill();
			}
			ctx.fillStyle = hsl(item.droop ? [20, 70, 30] : [25, 60, 16], 0);
			ctx.beginPath(); ctx.ellipse(fx, fy - (item.droop ? r * 0.1 : 0), r * 0.28, r * (item.droop ? 0.26 : 0.2), 0, 0, 7); ctx.fill();
		}
	},
	spike(ctx, a) {
		const { cx, base, w, h, R, col, sun, bloom } = a;
		if (!col) return dormant(ctx, a);
		canopy(ctx, cx, base - h * 0.28, w / 2, h * 0.28, col, R, sun, { rf: 0.3, rmax: 7, fine: true, inside: (nx, ny) => ny < 0.8 });
		if (!bloom) { canopy(ctx, cx, base - h * 0.42, w * 0.42, h * 0.3, col, R, sun, { rf: 0.3, rmax: 6, fine: true }); return; }
		const n = Math.round(clamp(w * 0.6, 8, 70));
		for (let i = 0; i < n; i++) {
			const t = R() * 2 - 1;
			const sx = cx + t * w * 0.38, sy = base - h * 0.3;
			const ex = cx + t * w * 0.5, ey = base - h * (0.75 + R() * 0.25);
			ctx.strokeStyle = hsl(col, -2); ctx.lineWidth = Math.max(0.4, w * 0.006);
			ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
			if (!bloom) continue;
			const sc = pickC(bloom, R);
			const k = 7;
			for (let j = 0; j < k; j++) {
				const u = 0.45 + (j / k) * 0.55;
				ctx.fillStyle = hsl(sc, (R() - 0.5) * 12 + (j / k) * 6);
				ctx.beginPath(); ctx.arc(sx + (ex - sx) * u + (R() - 0.5) * 1.2, sy + (ey - sy) * u, Math.max(0.6, w * 0.016), 0, 7); ctx.fill();
			}
		}
	},
	peony(ctx, a) {
		const { cx, base, w, h, R, col, sun, bloom } = a;
		if (!col) return dormant(ctx, a);
		const pts = canopy(ctx, cx, base - h / 2, w / 2, h / 2, col, R, sun, { rf: 0.25, inside: (nx, ny) => ny < 0.8 });
		shade(ctx, 0, base - h, ctx.canvas.width, base, sun, 0.25);
		if (!bloom) return;
		const r = Math.max(1.5, w * 0.08);
		pts.filter((p) => p[3] < 0.3 && R() < 0.5).forEach((p) => {
			const pc2 = pickC(bloom, R);
			for (let k = 0; k < 3; k++) {
				ctx.fillStyle = hsl(pc2, 6 - k * 6);
				ctx.beginPath(); ctx.arc(p[0] + (R() - 0.5) * r * 0.3, p[1] + (R() - 0.5) * r * 0.3, r * (1 - k * 0.28), 0, 7); ctx.fill();
			}
		});
	},
	plume(ctx, a) {
		const { cx, base, w, h, R, col, sun, bloom } = a;
		if (!col) return dormant(ctx, a);
		canopy(ctx, cx, base - h * 0.25, w / 2, h * 0.25, col, R, sun, { rf: 0.3, rmax: 7, fine: true, inside: (nx, ny) => ny < 0.8 });
		if (!bloom) return;
		const n = Math.round(clamp(w * 0.2, 4, 20));
		for (let i = 0; i < n; i++) {
			const px = cx + (R() - 0.5) * w * 0.75, py = base - h * (0.65 + R() * 0.35), ph = h * 0.35, pw = w * 0.09;
			const plc = pickC(bloom, R);
			for (let k = 0; k < 30; k++) {
				const u = R();
				ctx.fillStyle = hsl(plc, (R() - 0.5) * 14, 0.85);
				ctx.beginPath(); ctx.arc(px + (R() - 0.5) * pw * (1 - u), py + u * ph, Math.max(0.5, w * 0.012), 0, 7); ctx.fill();
			}
		}
	},
	fern(ctx, a) {
		const { cx, base, w, h, R, col, sun } = a;
		if (!col) return dormant(ctx, a);
		const n = Math.round(clamp(w / 4, 8, 18));
		const ts = [];
		for (let i = 0; i < n; i++) ts.push((i / (n - 1)) * 2 - 1 + (R() - 0.5) * 0.18);
		ts.sort((p, q) => Math.abs(q) - Math.abs(p));
		for (const t of ts) {
			const sx = cx + t * w * 0.05, sy = base;
			const c1x = cx + t * w * 0.22, c1y = base - h * (0.75 + R() * 0.1) * (1 - Math.abs(t) * 0.35);
			const c2x = cx + t * w * 0.42, c2y = base - h * (1.02 - Math.abs(t) * 0.4);
			const ex = cx + t * w * (0.48 + R() * 0.05), ey = base - h * (0.3 + (1 - Math.abs(t)) * 0.62);
			const P = (u) => { const v = 1 - u; return [v * v * v * sx + 3 * v * v * u * c1x + 3 * v * u * u * c2x + u * u * u * ex, v * v * v * sy + 3 * v * v * u * c1y + 3 * v * u * u * c2y + u * u * u * ey]; };
			const shadeK = sun * t * 8 + (Math.abs(t) > 0.6 ? -6 : 2);
			ctx.strokeStyle = hsl(col, -14 + shadeK); ctx.lineWidth = Math.max(0.5, w * 0.008); ctx.lineCap = 'round';
			ctx.beginPath(); ctx.moveTo(sx, sy); ctx.bezierCurveTo(c1x, c1y, c2x, c2y, ex, ey); ctx.stroke();
			const steps = 22;
			for (let k = 2; k < steps; k++) {
				const u = k / steps, [px, py] = P(u), [qx, qy] = P(Math.min(1, u + 0.01));
				const ang = Math.atan2(qy - py, qx - px);
				const len = w * 0.075 * Math.sin(Math.PI * Math.pow(u, 0.6)) * (1 - u * 0.25) + 0.8;
				for (const side of [-1, 1]) {
					const th = ang + side * 1.15;
					ctx.fillStyle = hsl(col, shadeK + (R() - 0.5) * 10 + (side * sun > 0 ? 4 : -4), 0.97);
					ctx.save(); ctx.translate(px, py); ctx.rotate(th);
					ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(len * 0.5, -len * 0.22, len, 0); ctx.quadraticCurveTo(len * 0.5, len * 0.22, 0, 0); ctx.fill();
					ctx.restore();
				}
			}
		}
	},
	grass(ctx, a) {
		const { cx, base, w, h, R, col, season, item } = a;
		const winter = season === 'winter';
		const tan = [38, 35, 60];
		const c = winter ? (item.ev ? [item.leaf[0], Math.max(0, item.leaf[1] - 10), item.leaf[2] - 4] : item.fall ? mix(item.fall, tan, 0.5) : tan) : col || item.leaf;
		const upright = item.upright;
		blades(ctx, cx, base, w, h * (item.plume ? 0.7 : 1), c, R, Math.round(clamp(w * (upright ? 2.2 : 1.4), 18, 140)), upright ? 0.85 : 1.1, Math.max(0.5, (upright ? w * 0.007 : w * (item.fine ? 0.008 : 0.012))));
		let plume = null;
		if (item.plume && item.months.length && SEASON_MONTHS[season].some((m) => item.months.includes(m))) plume = winter ? [36, 38, 68] : season === 'fall' ? mix(item.plume, [36, 40, 66], 0.4) : item.plume;
		if (plume) {
			const n = Math.round(clamp(w * 0.5, 6, 40));
			for (let i = 0; i < n; i++) {
				const t = R() * 2 - 1;
				const sx = cx + t * w * 0.12, ex = cx + t * w * (upright ? 0.45 : 0.6), ey = base - h * (upright ? 0.85 + R() * 0.15 : 0.55 + R() * 0.3);
				ctx.strokeStyle = hsl(plume, -15, 0.7); ctx.lineWidth = Math.max(0.4, w * 0.006);
				ctx.beginPath(); ctx.moveTo(sx, base - h * 0.3); ctx.lineTo(ex, ey); ctx.stroke();
				ctx.fillStyle = hsl(plume, (R() - 0.5) * 10, 0.9);
				const pl = h * (upright ? 0.16 : 0.12);
				ctx.beginPath(); ctx.ellipse(ex, ey + pl * 0.3, Math.max(0.8, w * 0.02), pl / 2, Math.atan2(ex - sx, base - ey) * -0.3, 0, 7); ctx.fill();
			}
		}
	}
};


/* Bare winter tree with a central leader (pyramidal & conifers). */
function excurrentWinter(ctx, a, spread = 0.8) {
	const { cx, base, w, h, R, item } = a;
	const bark = isTreeBark(item);
	const tw = Math.max(1.5, w * 0.06);
	trunk(ctx, cx, base, base - h * 0.98, tw, bark, R);
	const n = clamp(Math.round(h / Math.max(4, w * 0.12)), 5, 16);
	for (let i = 1; i < n; i++) {
		const u = i / n, y = base - h * (0.12 + u * 0.82), L = (w / 2) * (1 - u * 0.8) * spread;
		for (const s of [-1, 1]) limbs(ctx, cx, y, L * (0.8 + R() * 0.3), s > 0 ? -0.35 - R() * 0.4 : Math.PI + 0.35 + R() * 0.4, tw * 0.35 * (1 - u * 0.6), 2, R, bark, 0.5);
	}
}

/* Dense evergreen/broadleaf column or cone with a custom profile (0 = base, 1 = top). */
function denseProfile(ctx, a, prof) {
	const { cx, base, w, h, R, col, sun } = a;
	const top = base - h, steps = 28;
	ctx.beginPath();
	for (let i = 0; i <= steps; i++) { const u = i / steps; ctx.lineTo(cx - prof(u) * (0.96 + R() * 0.08), base - u * h); }
	for (let i = steps; i >= 0; i--) { const u = i / steps; ctx.lineTo(cx + prof(u) * (0.96 + R() * 0.08), base - u * h); }
	ctx.closePath();
	const g = ctx.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
	g.addColorStop(sun < 0 ? 0 : 1, hsl(col, 6)); g.addColorStop(sun < 0 ? 1 : 0, hsl(col, -12));
	ctx.fillStyle = g; ctx.fill();
	const r = clamp(w * 0.11, 1.1, 9);
	const n = clamp(Math.round((w * h) / (r * r) * 0.9), 20, 650);
	for (let i = 0; i < n; i++) {
		const u = R() * 0.98, half = prof(u), t = R() * 2 - 1;
		ctx.fillStyle = VARI && R() < 0.3 ? hsl([55, 55, 84], 0, 0.9) : hsl(col, sun * t * 9 + (R() - 0.5) * 12, 0.95, 0, (R() - 0.5) * 6);
		ctx.beginPath(); ctx.ellipse(cx + t * half * 0.92, base - u * h, r * (0.6 + R() * 0.6), r * (0.7 + R() * 0.6), (R() - 0.5) * 0.8, 0, 7); ctx.fill();
	}
	shade(ctx, 0, top, ctx.canvas.width, base, sun, 0.3);
}

Object.assign(PLANT_FORMS, {
	cone(ctx, a) {
		if (!a.col) return excurrentWinter(ctx, a, 0.9);
		denseProfile(ctx, a, (u) => (a.w / 2) * Math.pow(Math.max(0, 1 - u), 0.85) * (u < 0.06 ? 0.85 + u * 2.5 : 1));
	},
	pine(ctx, a) {
		const { cx, base, w, h, R, col, sun, item } = a;
		const bark = isTreeBark(item);
		const tw = Math.max(1.5, w * 0.05);
		trunk(ctx, cx, base, base - h * 0.96, tw, bark, R, (R() - 0.5) * w * 0.05);
		const tiers = clamp(Math.round(h / Math.max(5, w * 0.16)), 4, 11);
		const tufts = [];
		for (let i = 0; i < tiers; i++) {
			const u = 0.28 + (i / tiers) * 0.7, y = base - h * u;
			const spanW = (w / 2) * (1 - (i / tiers) * 0.65) * (0.72 + R() * 0.2);
			const sides = i > tiers - 2 ? [0] : [-1, 1];
			for (const s of sides) {
				const ex = cx + s * spanW * (0.4 + R() * 0.25), ey = y - h * 0.02;
				ctx.strokeStyle = hsl(bark, 4); ctx.lineWidth = Math.max(0.8, tw * 0.35);
				ctx.beginPath(); ctx.moveTo(cx, y + h * 0.03); ctx.quadraticCurveTo((cx + ex) / 2, y + h * 0.02, ex, ey); ctx.stroke();
				tufts.push([ex, ey, spanW * (0.4 + R() * 0.18), h * (0.05 + R() * 0.025)]);
			}
		}
		tufts.sort((p, q) => q[1] - p[1]);
		for (const t of tufts) {
			canopy(ctx, t[0], t[1], t[2], t[3], col, R, sun, { rf: 0.4, rmax: 12, fine: true, noBack: false });
			const n = Math.round(clamp(t[2] * 1.2, 10, 80));
			for (let k = 0; k < n; k++) {
				const px = t[0] + (R() - 0.5) * t[2] * 2, py = t[1] + (R() - 0.5) * t[3] * 1.6;
				ctx.strokeStyle = hsl(col, (R() - 0.3) * 18, 0.85); ctx.lineWidth = Math.max(0.5, w * 0.005);
				ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + (R() - 0.5) * 6, py - 2 - R() * 4); ctx.stroke();
			}
		}
		shade(ctx, 0, base - h, ctx.canvas.width, base, sun, 0.22);
	},
	weepEv(ctx, a) {
		const { cx, base, w, h, R, col, sun } = a;
		if (!col) return;
		const lean = (R() - 0.5) * w * 0.25;
		const leader = (u) => [cx + Math.sin(u * 3) * lean * u, base - h * u];
		ctx.strokeStyle = hsl(BARK, 0); ctx.lineWidth = Math.max(1, w * 0.05);
		ctx.beginPath(); for (let i = 0; i <= 12; i++) { const p = leader(i / 12); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); } ctx.stroke();
		const strands = Math.round(clamp(h / 3, 10, 60));
		for (let i = 0; i < strands; i++) {
			const u = 0.15 + (i / strands) * 0.83, p = leader(u), s = i % 2 ? 1 : -1;
			const reach = (w / 2) * (0.3 + (1 - u) * 0.55) * (0.7 + R() * 0.5);
			const ex = p[0] + s * reach, ey = Math.min(base - 2, p[1] + h * (0.15 + R() * 0.25));
			for (let k = 0; k < 10; k++) {
				const t = k / 9, x = p[0] + (ex - p[0]) * Math.sin(t * Math.PI / 2), y = p[1] + (ey - p[1]) * t * t;
				ctx.fillStyle = hsl(col, (R() - 0.5) * 14 - t * 6 + s * sun * 4);
				ctx.beginPath(); ctx.ellipse(x, y, Math.max(1, w * 0.035), Math.max(1.5, h * 0.03), 0, 0, 7); ctx.fill();
			}
		}
		shade(ctx, 0, base - h, ctx.canvas.width, base, sun, 0.2);
	},
	arching(ctx, a) {
		const { cx, base, w, h, R, col, sun, bloom, item } = a;
		const n = Math.round(clamp(w / 2.5, 9, 40));
		const stemCol = isTreeBark(item);
		const bareBloom = bloom && (a.season === 'spring') && !item.ev && (item.months[0] || 6) <= 4; // forsythia-like: flowers before leaves
		const pts = [];
		for (let i = 0; i < n; i++) {
			const t = (i / (n - 1)) * 2 - 1 + (R() - 0.5) * 0.15;
			const ex = cx + t * w * 0.5, ey = base - h * (0.15 + R() * 0.3);
			const kx = cx + t * w * 0.2, ky = base - h * (1.05 - Math.abs(t) * 0.35);
			ctx.strokeStyle = hsl(stemCol, (R() - 0.5) * 8); ctx.lineWidth = Math.max(0.5, w * 0.008);
			ctx.beginPath(); ctx.moveTo(cx + t * w * 0.05, base); ctx.quadraticCurveTo(kx, ky, ex, ey); ctx.stroke();
			for (let k = 2; k < 14; k++) {
				const u = k / 14, iu = 1 - u;
				pts.push([iu * iu * (cx + t * w * 0.05) + 2 * iu * u * kx + u * u * ex, iu * iu * base + 2 * iu * u * ky + u * u * ey]);
			}
		}
		const s = Math.max(1, w * 0.022);
		for (const p of pts) {
			if (col && !bareBloom) { ctx.fillStyle = VARI && R() < 0.35 ? hsl([55, 50, 84], 0) : hsl(col, (R() - 0.5) * 14 + (p[0] - cx) * sun * 0.02); ctx.beginPath(); ctx.ellipse(p[0], p[1], s * 1.2, s * 0.7, R() * 3, 0, 7); ctx.fill(); }
			else if (bareBloom && col && R() < 0.15) { ctx.fillStyle = hsl(col, 6); ctx.beginPath(); ctx.ellipse(p[0], p[1], s, s * 0.5, R() * 3, 0, 7); ctx.fill(); }
		}
		if (bloom) flowers(ctx, pts.filter(() => R() < (bareBloom ? 0.9 : 0.45)), bloom, s * 0.9, R, fkOf(item, 'dot'));
	},
	upright(ctx, a) {
		const { cx, base, w, h, R, col, sun, bloom, item } = a;
		const stemCol = isTreeBark(item);
		const n = 5 + Math.floor(R() * 4);
		for (let i = 0; i < n; i++) {
			const t = (i / (n - 1)) * 2 - 1;
			ctx.strokeStyle = hsl(stemCol, (R() - 0.5) * 8); ctx.lineWidth = Math.max(0.7, w * (col ? 0.012 : 0.018));
			ctx.beginPath(); ctx.moveTo(cx + t * w * 0.06, base); ctx.quadraticCurveTo(cx + t * w * 0.15, base - h * 0.5, cx + t * w * 0.38, base - h * (0.85 + R() * 0.12)); ctx.stroke();
		}
		if (!col) { if (item.bark && /twig/.test(item.bark)) return; return shrubWinter(ctx, a); }
		const pts = canopy(ctx, cx, base - h * 0.58, w / 2, h * 0.42, col, R, sun, { rf: item.fine ? 0.18 : 0.24, fine: item.fine, inside: (nx, ny) => Math.abs(nx) < 1 - 0.45 * Math.pow((ny + 1) / 2, 1.5) });
		shade(ctx, 0, base - h, ctx.canvas.width, base, sun, 0.28);
		if (bloom) flowers(ctx, pts.filter((p) => p[3] < 0.5 && R() < 0.75).map((p) => [p[0], p[1] - 2]), bloom, Math.max(1.2, w * (item.fk === 'cup' ? 0.045 : 0.03)), R, fkOf(item, 'dot'));
	},
	fastigiate(ctx, a) {
		if (!a.col) return excurrentWinter(ctx, a, 0.45);
		broadleaf(ctx, a, 0.12, 1, 0.3);
	},
	pyramidBroad(ctx, a) {
		const { cx, base, w, h, R, col, sun, bloom, item } = a;
		if (!col) return excurrentWinter(ctx, a, 0.9);
		const tH = h * 0.16;
		trunk(ctx, cx, base, base - h * 0.75, Math.max(1.5, w * 0.06), isTreeBark(item), R);
		const ry = (h - tH) / 2;
		const pts = canopy(ctx, cx, base - tH - ry, w / 2, ry, col, R, sun, { rf: 0.2, square: true, inside: (nx, ny) => ny < 0.92 && Math.abs(nx) < 0.1 + (ny + 1) * 0.44 - Math.max(0, ny - 0.6) * 0.5 });
		shade(ctx, 0, base - h, ctx.canvas.width, base, sun);
		if (bloom) flowers(ctx, pts.filter(() => R() < 0.6), bloom, Math.max(1, w * (item.fk === 'cup' ? 0.035 : 0.02)), R, fkOf(item, 'dot'));
	},
	iris(ctx, a) {
		const { cx, base, w, h, R, col, bloom, item } = a;
		if (!col) return dormant(ctx, a);
		const n = Math.round(clamp(w * 0.8, 10, 40));
		for (let i = 0; i < n; i++) {
			const t = R() * 2 - 1, lh = h * (0.55 + R() * 0.3) * (1 - Math.abs(t) * 0.2), lw = Math.max(1, w * (item.cat === 'annuals' ? 0.08 : 0.035));
			const tx = cx + t * w * 0.45, ty = base - lh;
			ctx.fillStyle = hsl(col, (R() - 0.5) * 14 + (1 - Math.abs(t)) * 4);
			ctx.beginPath(); ctx.moveTo(cx + t * w * 0.08 - lw, base); ctx.quadraticCurveTo(cx + t * w * 0.25, base - lh * 0.6, tx, ty); ctx.quadraticCurveTo(cx + t * w * 0.25 + lw, base - lh * 0.55, cx + t * w * 0.08 + lw, base); ctx.fill();
		}
		if (!bloom) return;
		const m = Math.round(clamp(w * 0.18, 3, 12));
		for (let i = 0; i < m; i++) {
			const fx = cx + (R() - 0.5) * w * 0.7, fy = base - h * (0.82 + R() * 0.18), s = Math.max(1.6, w * 0.08);
			ctx.strokeStyle = hsl(col, -8); ctx.lineWidth = Math.max(0.5, w * 0.012);
			ctx.beginPath(); ctx.moveTo(cx + (fx - cx) * 0.4, base); ctx.lineTo(fx, fy); ctx.stroke();
			const bc = pickC(bloom, R);
			ctx.fillStyle = hsl(bc, -6);
			for (const sx of [-1, 0, 1]) { ctx.beginPath(); ctx.ellipse(fx + sx * s * 0.45, fy + s * 0.35, s * 0.32, s * 0.55, sx * 0.6, 0, 7); ctx.fill(); }
			ctx.fillStyle = hsl(bc, 8);
			for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(fx + sx * s * 0.2, fy - s * 0.35, s * 0.25, s * 0.5, sx * 0.3, 0, 7); ctx.fill(); }
			ctx.fillStyle = hsl([50, 90, 60], 0); ctx.beginPath(); ctx.arc(fx, fy + s * 0.2, s * 0.12, 0, 7); ctx.fill();
		}
	},
	bulb(ctx, a) {
		const { cx, base, w, h, R, col, bloom, item, season } = a;
		const lily = item.fk === 'lily';
		const active = bloom || (lily && (season === 'spring' || season === 'summer'));
		if (!active || !col) return dormant(ctx, { ...a, h: h * 0.3 });
		const stems = Math.round(clamp(w * 0.9, 3, 12));
		const leafCol = col;
		for (let i = 0; i < stems * 2; i++) {
			const t = R() * 2 - 1, lh = h * (lily ? 0.8 : 0.4) * (0.6 + R() * 0.4);
			ctx.strokeStyle = hsl(leafCol, (R() - 0.5) * 12); ctx.lineWidth = Math.max(1, w * (lily ? 0.04 : 0.09)); ctx.lineCap = 'round';
			ctx.beginPath(); ctx.moveTo(cx + t * w * 0.15, base); ctx.quadraticCurveTo(cx + t * w * 0.3, base - lh * 0.7, cx + t * w * 0.55, base - lh); ctx.stroke();
		}
		if (!bloom) return;
		for (let i = 0; i < stems; i++) {
			const fx = cx + (R() - 0.5) * w * 0.8, fy = base - h * (0.82 + R() * 0.18);
			ctx.strokeStyle = hsl(leafCol, -6); ctx.lineWidth = Math.max(0.6, w * 0.025);
			ctx.beginPath(); ctx.moveTo(cx + (fx - cx) * 0.3, base); ctx.lineTo(fx, fy); ctx.stroke();
			const fk = item.fk || 'cup';
			const s = Math.max(1.5, w * (fk === 'globe' ? 0.32 : fk === 'spike' ? 0.12 : 0.14));
			if (fk === 'spike') flowers(ctx, [[fx, fy + s * 2]], bloom, s * 0.8, R, 'candle');
			else flowers(ctx, [[fx, fy]], bloom, s, R, fk === 'globe' ? 'globe' : fk);
		}
	},
	umbel(ctx, a) {
		const { cx, base, w, h, R, col, sun, bloom, item } = a;
		if (!col) return dormant(ctx, a);
		const pts = canopy(ctx, cx, base - h * 0.32, w / 2, h * 0.32, col, R, sun, { rf: 0.3, rmax: 8, fine: item.fine, inside: (nx, ny) => ny < 0.8 });
		shade(ctx, 0, base - h * 0.64, ctx.canvas.width, base, sun, 0.22);
		const heads = Math.round(clamp(w * 0.22, 4, 22));
		const hc = bloom || [mix(col, [70, 40, 65], 0.4)];
		for (let i = 0; i < heads; i++) {
			const fx = cx + (R() - 0.5) * w * 0.8, fy = base - h * (0.72 + R() * 0.28), s = Math.max(1.6, w * 0.1);
			ctx.strokeStyle = hsl(col, -6); ctx.lineWidth = Math.max(0.5, w * 0.01);
			ctx.beginPath(); ctx.moveTo(cx + (fx - cx) * 0.5, base - h * 0.3); ctx.lineTo(fx, fy); ctx.stroke();
			const b0 = pickC(hc, R);
			ctx.fillStyle = hsl(b0, -10); ctx.beginPath(); ctx.ellipse(fx, fy + s * 0.1, s, s * 0.45, 0, 0, 7); ctx.fill();
			for (let k = 0; k < 18; k++) { const an = R() * 7, d = Math.sqrt(R()); ctx.fillStyle = hsl(b0, (R() - 0.3) * 14); ctx.beginPath(); ctx.arc(fx + Math.cos(an) * s * d, fy + Math.sin(an) * s * 0.4 * d - s * 0.05, Math.max(0.6, s * 0.18), 0, 7); ctx.fill(); }
		}
		void pts;
	},
	vine(ctx, a) {
		const { cx, base, w, h, R, col, sun, bloom, item } = a;
		const tw = Math.max(w * 0.7, h * 0.18);
		ctx.strokeStyle = 'hsl(30 25% 45%)'; ctx.lineWidth = Math.max(1, tw * 0.04);
		for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + s * tw / 2, base); ctx.lineTo(cx + s * tw / 2, base - h); ctx.stroke(); }
		ctx.lineWidth = Math.max(0.6, tw * 0.02);
		for (let y = base - h; y < base; y += Math.max(4, tw * 0.25)) { ctx.beginPath(); ctx.moveTo(cx - tw / 2, y); ctx.lineTo(cx + tw / 2, y); ctx.stroke(); }
		ctx.beginPath(); ctx.moveTo(cx, base); ctx.lineTo(cx, base - h); ctx.stroke();
		const stems = 3;
		const pts = [];
		for (let k = 0; k < stems; k++) {
			let x = cx + (k - 1) * tw * 0.3, y = base;
			ctx.strokeStyle = hsl(BARK, 10); ctx.lineWidth = Math.max(0.6, tw * 0.025);
			ctx.beginPath(); ctx.moveTo(x, y);
			while (y > base - h * 0.98) { x = Math.max(cx - tw / 2, Math.min(cx + tw / 2, x + (R() - 0.5) * tw * 0.35)); y -= h * 0.06; ctx.lineTo(x, y); pts.push([x, y]); }
			ctx.stroke();
		}
		if (!col) return;
		const s = Math.max(1.2, tw * 0.09);
		for (const p of pts) for (let k = 0; k < 4; k++) { ctx.fillStyle = hsl(col, (R() - 0.5) * 14 + sun * (p[0] - cx) * 0.03); ctx.beginPath(); ctx.ellipse(p[0] + (R() - 0.5) * s * 3, p[1] + (R() - 0.5) * s * 2, s, s * 0.7, R() * 3, 0, 7); ctx.fill(); }
		if (bloom) flowers(ctx, pts.filter(() => R() < 0.7).map((p) => [p[0] + (R() - 0.5) * s * 3, p[1]]), bloom, s * 1.1, R, fkOf(item, 'dot'));
	}
});

function broadleaf(ctx, a, trunkFrac, widthF, topFrac) {
	const { cx, base, w, h, R, col, sun, bloom, item } = a;
	const tH = h * trunkFrac;
	if (!col) return treeWinter(ctx, a, base - tH, 0.75);
	trunk(ctx, cx, base, base - tH - h * 0.15, Math.max(1.5, w * 0.06), isTreeBark(item), R);
	const ry = (h - tH) / 2 + h * 0.02;
	const pts = canopy(ctx, cx, base - tH - ry + h * 0.02, (w / 2) * widthF, ry, col, R, sun, {
		inside: (nx, ny) => ny < 0.9 && Math.abs(nx) < 1 - Math.max(0, -ny - topFrac) * 0.6
	});
	shade(ctx, 0, base - h, ctx.canvas.width, base, sun);
	if (bloom) flowers(ctx, pts.filter(() => R() < 0.85).map((p) => [p[0] + (R() - 0.5) * 6, p[1] + (R() - 0.5) * 6]), bloom, Math.max(1, w * (item.fk === 'cup' ? 0.03 : 0.018)), R, fkOf(item, 'dot'));
}

function blades(ctx, cx, base, w, h, col, R, n, splay, lw) {
	const list = [];
	for (let i = 0; i < n; i++) list.push(R() * 2 - 1);
	list.sort((p, q) => Math.abs(q) - Math.abs(p));
	for (const t of list) {
		const ex = cx + t * w * 0.5 * splay + (R() - 0.5) * w * 0.1;
		const ey = base - h * (0.55 + (1 - Math.abs(t)) * 0.45) * (0.8 + R() * 0.25);
		const kx = cx + t * w * 0.12, ky = base - h * 0.7;
		ctx.strokeStyle = hsl(col, (R() - 0.5) * 18 + (1 - Math.abs(t)) * 4);
		ctx.lineWidth = lw * (0.7 + R() * 0.6);
		ctx.lineCap = 'round';
		ctx.beginPath();
		ctx.moveTo(cx + t * w * 0.08, base);
		ctx.quadraticCurveTo(kx, ky, ex, ey);
		ctx.stroke();
	}
}

function panicle(ctx, x, y, s, col, R) {
	for (let k = 0; k < 16; k++) {
		const u = R();
		ctx.fillStyle = hsl(col, (R() - 0.5) * 14);
		ctx.beginPath(); ctx.arc(x + (R() - 0.5) * s * (1.2 - u), y - u * s * 2, Math.max(0.6, s * 0.28), 0, 7); ctx.fill();
	}
}

function dormant(ctx, a) {
	const { cx, base, w, h, R } = a;
	const hh = Math.max(2, h * 0.18), ww = w * 0.45;
	for (let i = 0; i < Math.round(clamp(w, 8, 50)); i++) {
		const t = R() * 2 - 1;
		ctx.strokeStyle = hsl([32, 30, 38 + R() * 15], 0);
		ctx.lineWidth = Math.max(0.5, w * 0.01);
		ctx.beginPath(); ctx.moveTo(cx + t * ww * 0.3, base); ctx.lineTo(cx + t * ww, base - hh * (0.4 + R() * 0.6)); ctx.stroke();
	}
}
function shrubWinter(ctx, a) {
	if (a.item && (a.item.annual || a.item.cat === 'perennials' || a.item.cat === 'annuals')) return dormant(ctx, a);
	const { cx, base, w, h, R } = a;
	const n = 7 + Math.floor(R() * 5);
	for (let i = 0; i < n; i++) {
		const t = (i / (n - 1)) * 2 - 1;
		limbs(ctx, cx + t * w * 0.08, base, h * 0.32, -Math.PI / 2 + t * 0.6, Math.max(0.6, w * 0.02), 3, R, [25, 15, 32], 0.4);
	}
}

/* --------------------------------------------------------------- features */

/* ---------------------------------------------------------------- top view */

function drawTop(item, o) {
	const d = Math.max(o.w, 6);
	const pad = Math.ceil(d * 0.08) + 2;
	const S = Math.ceil(d + pad * 2);
	const c = canvas(S, S);
	const ctx = c.getContext('2d');
	let seed = o.seed * 7919;
	for (let i = 0; i < item.id.length; i++) seed = (seed * 31 + item.id.charCodeAt(i)) >>> 0;
	const R = rng(seed);
	const cx = S / 2, cy = S / 2, r = d / 2, sun = o.sun < 0 ? -1 : 1;
	const res = { c, ax: cx, ay: cy, lights: [] };
	if (item.photo && !item.photo.failed && item.photo.seasons && item.photo.seasons.top) {
		// a real overhead shot (3D render / drone photo) of this asset
		const got = photoImage(item, 'top');
		if (got && got.own) {
			const im = got.img, k = (r * 2) / Math.max(im.width, im.height);
			ctx.drawImage(im, cx - im.width * k / 2, cy - im.height * k / 2, im.width * k, im.height * k);
			return res;
		}
	}
	if (item.photo && !item.photo.failed) {
		const sp = seasonalPhoto(item, o.season);
		if (sp && sp.c) {
			// seen from above: the upper canopy of the photo, rounded
			// seen from above: the photo's crown (no trunk) spun into a round canopy
			const pc = sp.c, sw = pc.width, sh = Math.max(1, Math.round(pc.height * (item.cat === 'trees' ? 0.62 : 0.85)));
			ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.clip();
			for (let k = 0; k < 4; k++) {
				ctx.save(); ctx.translate(cx, cy); ctx.rotate(k * Math.PI / 2 + 0.3);
				ctx.drawImage(pc, 0, 0, sw, sh, -r, -r, r * 2, r * 2);
				ctx.restore();
			}
			const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
			g.addColorStop(0, 'rgba(255,255,255,.08)'); g.addColorStop(1, 'rgba(0,0,0,.28)');
			ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, r * 2, r * 2); ctx.globalCompositeOperation = 'source-over';
			ctx.restore();
			return res;
		}
	}
	if (item.cat === 'features') { topFeature(ctx, item, cx, cy, r, R, res); return res; }
	const col = seasonal(item, o.season);
	const bloom = blooming(item, o.season);
	VARI = !!item.vari;
	if (!col && item.form === 'grass') { /* dormant grass still shows as a tan clump */ }
	else if (!col) {
		// winter: radial branches
		if (HERB.has(item.cat)) { VARI = false; return res; }
		ctx.strokeStyle = hsl(isTreeBark(item), 6, 0.9);
		const n = item.cat === 'trees' ? 7 : 5;
		for (let i = 0; i < n; i++) limbs(ctx, cx, cy, r * 0.45, (i / n) * Math.PI * 2 + R(), Math.max(0.6, r * 0.05), 3, R, isTreeBark(item), 0.6);
		VARI = false;
		return res;
	}
	if (['pyramid', 'columnar', 'cone', 'pine', 'weepEv'].includes(item.form) && (item.ev || item.cat === 'evergreens')) {
		const arms = Math.round(clamp(r * 1.5, 12, 70));
		for (let k = 0; k < 3; k++) {
			for (let i = 0; i < arms; i++) {
				const a = (i / arms) * Math.PI * 2 + R() * 0.2;
				const len = r * (1 - k * 0.28) * (0.85 + R() * 0.15);
				ctx.strokeStyle = hsl(col, -6 + k * 6 + (R() - 0.5) * 8 + Math.cos(a - (sun < 0 ? Math.PI * 1.25 : -Math.PI * 0.25)) * 6);
				ctx.lineWidth = Math.max(1, r * 0.12);
				ctx.lineCap = 'round';
				ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len); ctx.stroke();
			}
		}
	} else if (item.form === 'grass') {
		const c2 = o.season === 'winter' ? (item.ev ? item.leaf : [38, 35, 60]) : col;
		for (let i = 0; i < Math.round(clamp(r * 4, 20, 140)); i++) {
			const a = R() * 7, len = r * (0.5 + R() * 0.5);
			ctx.strokeStyle = hsl(c2, (R() - 0.5) * 16); ctx.lineWidth = Math.max(0.5, r * 0.04);
			ctx.beginPath(); ctx.moveTo(cx, cy); ctx.quadraticCurveTo(cx + Math.cos(a + 0.3) * len * 0.6, cy + Math.sin(a + 0.3) * len * 0.6, cx + Math.cos(a) * len, cy + Math.sin(a) * len); ctx.stroke();
		}
	} else {
		const pts = canopy(ctx, cx, cy, r, r, col, R, sun, { rf: item.cat === 'trees' ? 0.22 : 0.3, fine: item.fine });
		const g = ctx.createRadialGradient(cx + sun * r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r * 1.05);
		g.addColorStop(0, 'rgba(255,255,230,.12)'); g.addColorStop(0.7, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,20,0,.28)');
		ctx.save(); ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = g; ctx.fillRect(0, 0, S, S); ctx.restore();
		if (bloom) flowers(ctx, pts.filter(() => R() < 0.8), bloom, Math.max(1, r * (item.form === 'hydrangea' ? 0.14 : 0.06)), R, ['cup', 'star', 'globe', 'lily'].includes(item.fk) ? item.fk : 'dot');
	}
	if (item.berries && (o.season === 'fall' || o.season === 'winter')) berriesOn(ctx, R, cx, cy, r * 0.7, r * 0.7, item.berries, Math.max(0.8, r * 0.04));
	VARI = false;
	return res;
}

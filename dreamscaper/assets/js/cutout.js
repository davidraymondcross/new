/* DreamScaper – on-device photo cut-out (no AI, nothing leaves the phone).
 * Separates a plant or feature from its background using colour models learned
 * from a box around the subject (an iterative "GrabCut-style" estimate), the
 * customer's keep/remove brush strokes, and a ground line. Then it cleans the
 * edges, trims to the subject and analyses colours and shape so we can suggest
 * what it is.
 */
import { canvas, clamp } from './util.js?v=2.7.4';

const WORK = 360; // segmentation resolution (long side) – fast on phones

/* ------------------------------------------------------------ colour space */
function toLab(r, g, b) {
	r /= 255; g /= 255; b /= 255;
	r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
	g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
	b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;
	let x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047, y = r * 0.2126 + g * 0.7152 + b * 0.0722, z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
	const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
	x = f(x); y = f(y); z = f(z);
	return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** k-means on Lab samples → k centres. */
function kmeans(pts, k, iters = 8) {
	const n = pts.length / 3;
	if (!n) return [];
	k = Math.min(k, n);
	const C = [];
	for (let i = 0; i < k; i++) { const j = Math.floor(((i + 0.5) / k) * n) * 3; C.push([pts[j], pts[j + 1], pts[j + 2]]); }
	const sum = C.map(() => [0, 0, 0, 0]);
	for (let it = 0; it < iters; it++) {
		for (const s of sum) s.fill(0);
		for (let i = 0; i < pts.length; i += 3) {
			let best = 0, bd = 1e9;
			for (let c = 0; c < k; c++) { const d = (pts[i] - C[c][0]) ** 2 + (pts[i + 1] - C[c][1]) ** 2 + (pts[i + 2] - C[c][2]) ** 2; if (d < bd) { bd = d; best = c; } }
			const s = sum[best]; s[0] += pts[i]; s[1] += pts[i + 1]; s[2] += pts[i + 2]; s[3]++;
		}
		for (let c = 0; c < k; c++) if (sum[c][3]) C[c] = [sum[c][0] / sum[c][3], sum[c][1] / sum[c][3], sum[c][2] / sum[c][3]];
	}
	return C;
}
function sample(lab, idxs, max = 3000) {
	const step = Math.max(1, Math.floor(idxs.length / max));
	const out = [];
	for (let i = 0; i < idxs.length; i += step) { const j = idxs[i] * 3; out.push(lab[j], lab[j + 1], lab[j + 2]); }
	return out;
}
const minDist = (C, L, a, b) => { let d = 1e9; for (const c of C) { const e = (L - c[0]) ** 2 * 0.6 + (a - c[1]) ** 2 + (b - c[2]) ** 2; if (e < d) d = e; } return Math.sqrt(d); };

function boxBlur(src, W, H, r) {
	const tmp = new Float32Array(W * H), out = new Float32Array(W * H);
	for (let y = 0; y < H; y++) {
		let acc = 0; const row = y * W;
		for (let x = -r; x <= r; x++) acc += src[row + clamp(x, 0, W - 1)];
		for (let x = 0; x < W; x++) { tmp[row + x] = acc / (2 * r + 1); acc += src[row + clamp(x + r + 1, 0, W - 1)] - src[row + clamp(x - r, 0, W - 1)]; }
	}
	for (let x = 0; x < W; x++) {
		let acc = 0;
		for (let y = -r; y <= r; y++) acc += tmp[clamp(y, 0, H - 1) * W + x];
		for (let y = 0; y < H; y++) { out[y * W + x] = acc / (2 * r + 1); acc += tmp[clamp(y + r + 1, 0, H - 1) * W + x] - tmp[clamp(y - r, 0, H - 1) * W + x]; }
	}
	return out;
}

/**
 * Prepare an image for cut-out: a work-size copy with Lab colours.
 * @returns state object reused by segment() as the customer refines.
 */
export function prepareCutout(img) {
	const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
	const k = Math.min(1, WORK / Math.max(iw, ih));
	const W = Math.max(8, Math.round(iw * k)), H = Math.max(8, Math.round(ih * k));
	const c = canvas(W, H), x = c.getContext('2d', { willReadFrequently: true });
	x.drawImage(img, 0, 0, W, H);
	const px = x.getImageData(0, 0, W, H).data;
	const lab = new Float32Array(W * H * 3);
	for (let i = 0, j = 0; i < px.length; i += 4, j += 3) { const L = toLab(px[i], px[i + 1], px[i + 2]); lab[j] = L[0]; lab[j + 1] = L[1]; lab[j + 2] = L[2]; }
	return { img, iw, ih, W, H, k, px, lab, hints: new Uint8Array(W * H), mask: null, prob: null };
}

/** Default subject box: most of the frame, a little in from each edge. */
export function defaultBox(st) {
	return { x0: st.W * 0.07, y0: st.H * 0.05, x1: st.W * 0.93, y1: st.H * 0.97 };
}

/**
 * Compute the subject mask (st.mask: 0/1 per work pixel, st.prob: 0..1).
 * box in work coordinates; groundY (work px) removes everything below it.
 */
export function segment(st, box, groundY = null) {
	const { W, H, lab, hints } = st;
	const N = W * H;
	const inBox = (x, y) => x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1;
	const bw = box.x1 - box.x0, bh = box.y1 - box.y0;
	let bg = [], fg = [];
	const cxm = (box.x0 + box.x1) / 2, cym = (box.y0 + box.y1) / 2;
	for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
		const i = y * W + x, hnt = hints[i];
		if (hnt === 2) { bg.push(i); continue; }
		if (hnt === 1) { fg.push(i); continue; }
		if (!inBox(x, y)) bg.push(i);
		else if (Math.abs(x - cxm) < bw * 0.28 && Math.abs(y - cym) < bh * 0.32) fg.push(i);
	}
	// box nearly the whole photo → use a thin border band as background
	if (bg.length < N * 0.04) {
		bg = [];
		const bx = Math.max(2, Math.round(W * 0.03)), by = Math.max(2, Math.round(H * 0.03));
		for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x < bx || x >= W - bx || y < by) && hints[y * W + x] !== 1) bg.push(y * W + x);
	}
	let FC = kmeans(sample(lab, fg), 6), BC = kmeans(sample(lab, bg), 8);
	const prob = new Float32Array(N);
	for (let iter = 0; iter < 4; iter++) {
		const nf = [], nb = [];
		for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
			const i = y * W + x, j = i * 3;
			let p;
			if (hints[i] === 1) p = 1;
			else if (hints[i] === 2 || !inBox(x, y) || (groundY != null && y > groundY)) p = 0;
			else {
				const dF = minDist(FC, lab[j], lab[j + 1], lab[j + 2]), dB = minDist(BC, lab[j], lab[j + 1], lab[j + 2]);
				p = dB / (dF + dB + 1e-6);
				// soft prior: the subject sits in the middle of its box
				const ex = Math.abs(x - cxm) / (bw / 2), ey = Math.abs(y - cym) / (bh / 2);
				p = p * (1 - 0.18 * Math.max(0, Math.max(ex, ey) - 0.6));
			}
			prob[i] = p;
			if (p > 0.62) nf.push(i); else if (p < 0.38) nb.push(i);
		}
		if (iter < 3) { if (nf.length > 30) FC = kmeans(sample(lab, nf), 6); if (nb.length > 30) BC = kmeans(sample(lab, nb.concat(bg.length > 4000 ? [] : bg)), 8); }
	}
	// smooth, threshold, then keep the main subject
	const sm = boxBlur(prob, W, H, 1);
	const mask = new Uint8Array(N);
	for (let i = 0; i < N; i++) mask[i] = hints[i] === 1 ? 1 : hints[i] === 2 ? 0 : sm[i] > 0.5 ? 1 : 0;
	keepMain(mask, W, H, box);
	fillHoles(mask, W, H, Math.max(6, N * 0.0025));
	st.mask = mask; st.prob = sm; st.box = box; st.groundY = groundY;
	return mask;
}

function components(mask, W, H, val) {
	const lab = new Int32Array(W * H).fill(-1), comps = [];
	const q = new Int32Array(W * H);
	for (let s = 0; s < W * H; s++) {
		if (mask[s] !== val || lab[s] >= 0) continue;
		const id = comps.length; let qh = 0, qt = 0, area = 0, touchEdge = false, cxs = 0, cys = 0;
		q[qt++] = s; lab[s] = id;
		while (qh < qt) {
			const i = q[qh++]; area++;
			const x = i % W, y = (i / W) | 0; cxs += x; cys += y;
			if (x === 0 || y === 0 || x === W - 1 || y === H - 1) touchEdge = true;
			if (x > 0 && mask[i - 1] === val && lab[i - 1] < 0) { lab[i - 1] = id; q[qt++] = i - 1; }
			if (x < W - 1 && mask[i + 1] === val && lab[i + 1] < 0) { lab[i + 1] = id; q[qt++] = i + 1; }
			if (y > 0 && mask[i - W] === val && lab[i - W] < 0) { lab[i - W] = id; q[qt++] = i - W; }
			if (y < H - 1 && mask[i + W] === val && lab[i + W] < 0) { lab[i + W] = id; q[qt++] = i + W; }
		}
		comps.push({ id, area, touchEdge, cx: cxs / area, cy: cys / area });
	}
	return { lab, comps };
}
function keepMain(mask, W, H, box) {
	const { lab, comps } = components(mask, W, H, 1);
	if (!comps.length) return;
	const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2, bw = box.x1 - box.x0, bh = box.y1 - box.y0;
	const score = (c) => c.area * (1.5 - Math.min(1, Math.hypot((c.cx - cx) / bw, (c.cy - cy) / bh)));
	const main = comps.reduce((a, b) => (score(b) > score(a) ? b : a));
	const keep = new Set(comps.filter((c) => c === main || c.area > main.area * 0.12).map((c) => c.id));
	for (let i = 0; i < mask.length; i++) if (mask[i] && !keep.has(lab[i])) mask[i] = 0;
}
function fillHoles(mask, W, H, maxArea) {
	const { lab, comps } = components(mask, W, H, 0);
	const fill = new Set(comps.filter((c) => !c.touchEdge && c.area <= maxArea).map((c) => c.id));
	for (let i = 0; i < mask.length; i++) if (!mask[i] && fill.has(lab[i])) mask[i] = 1;
}

/** Paint keep (1) / remove (2) / clear (0) hints along a stroke, in work coords. */
export function paintHint(st, x, y, r, v) {
	const { W, H, hints } = st;
	const r2 = r * r;
	for (let yy = Math.max(0, Math.floor(y - r)); yy <= Math.min(H - 1, Math.ceil(y + r)); yy++)
		for (let xx = Math.max(0, Math.floor(x - r)); xx <= Math.min(W - 1, Math.ceil(x + r)); xx++)
			if ((xx - x) ** 2 + (yy - y) ** 2 <= r2) hints[yy * W + xx] = v;
}

/**
 * Build the final full-quality cut-out: soft anti-aliased edges, edge colours
 * cleaned of background spill, trimmed to the subject, at most `maxH` px tall.
 */
export function renderCutout(st, maxH = 640) {
	const { mask, W, H, iw, ih } = st;
	// bounding box of the subject in work px
	let x0 = W, y0 = H, x1 = -1, y1 = -1;
	for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (mask[y * W + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
	if (x1 < 0) return null;
	const pad = 1;
	x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
	// source rect in original px
	const sx = (x0 / W) * iw, sy = (y0 / H) * ih, sw = ((x1 - x0 + 1) / W) * iw, sh = ((y1 - y0 + 1) / H) * ih;
	const k = Math.min(1, maxH / sh, 900 / sw);
	const OW = Math.max(4, Math.round(sw * k)), OH = Math.max(4, Math.round(sh * k));
	const out = canvas(OW, OH), ox = out.getContext('2d', { willReadFrequently: true });
	ox.imageSmoothingQuality = 'high';
	ox.drawImage(st.img, sx, sy, sw, sh, 0, 0, OW, OH);
	// upscale the mask with bilinear sampling, then soften the edge a touch
	const a = new Float32Array(OW * OH);
	const mw = x1 - x0 + 1, mh = y1 - y0 + 1;
	const m = (x, y) => mask[(y0 + clamp(y, 0, mh - 1)) * W + x0 + clamp(x, 0, mw - 1)];
	for (let y = 0; y < OH; y++) {
		const fy = ((y + 0.5) / OH) * mh - 0.5, iy = Math.floor(fy), ty = fy - iy;
		for (let x = 0; x < OW; x++) {
			const fx = ((x + 0.5) / OW) * mw - 0.5, ix = Math.floor(fx), tx = fx - ix;
			a[y * OW + x] = (m(ix, iy) * (1 - tx) + m(ix + 1, iy) * tx) * (1 - ty) + (m(ix, iy + 1) * (1 - tx) + m(ix + 1, iy + 1) * tx) * ty;
		}
	}
	const r = Math.max(1, Math.round(OW / mw * 0.6));
	const soft = boxBlur(a, OW, OH, r);
	const d = ox.getImageData(0, 0, OW, OH), px = d.data;
	for (let i = 0; i < OW * OH; i++) {
		// steepen the ramp so edges are crisp but not jagged
		const al = clamp((soft[i] - 0.5) * 2.2 + 0.5, 0, 1);
		px[i * 4 + 3] = Math.round(al * 255);
	}
	// decontaminate: edge pixels take colour from the nearest solid pixel inside
	const R = 3;
	for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) {
		const i = y * OW + x, al = px[i * 4 + 3];
		if (al === 0 || al > 230) continue;
		let best = -1, bd = 1e9;
		for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
			const xx = x + dx, yy = y + dy;
			if (xx < 0 || yy < 0 || xx >= OW || yy >= OH) continue;
			const j = yy * OW + xx;
			if (px[j * 4 + 3] > 240) { const dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; best = j; } }
		}
		if (best >= 0) {
			const t = 0.6;
			px[i * 4] = px[i * 4] * (1 - t) + px[best * 4] * t;
			px[i * 4 + 1] = px[i * 4 + 1] * (1 - t) + px[best * 4 + 1] * t;
			px[i * 4 + 2] = px[i * 4 + 2] * (1 - t) + px[best * 4 + 2] * t;
		}
	}
	ox.putImageData(d, 0, 0);
	return out;
}

/* --------------------------------------------------------------- analysis */

function rgbHsl(r, g, b) {
	r /= 255; g /= 255; b /= 255;
	const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
	if (mx === mn) return [0, 0, l];
	const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
	const hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
	return [hh * 60, s, l];
}
const FAMILY = (hue, l) => (l > 0.82 ? 'white' : hue < 15 || hue >= 345 ? 'red' : hue < 40 ? 'orange' : hue < 68 ? 'yellow' : hue < 170 ? 'green' : hue < 255 ? 'blue' : hue < 290 ? 'purple' : 'pink');

/**
 * Describe the cut-out: what fraction is leaves, flowers, wood, stone; its
 * outline; the flower colour family. Used to guess the category and suggest
 * library matches.
 */
export function analyse(st) {
	const { mask, W, H, px } = st;
	let n = 0, leaf = 0, bloom = 0, wood = 0, stone = 0, darkLeaf = 0;
	const bloomHue = {}; let x0 = W, x1 = 0, y0 = H, y1 = 0;
	const rowW = new Float32Array(H);
	let leafL = 0;
	for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
		const i = y * W + x;
		if (!mask[i]) continue;
		n++; rowW[y]++;
		if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
		const [hh, s, l] = rgbHsl(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
		if (hh > 55 && hh < 170 && s > 0.12 && l > 0.06) { leaf++; leafL += l; if (l < 0.22) darkLeaf++; }
		else if (s > 0.3 && l > 0.25 && !(hh > 18 && hh < 45 && l < 0.45)) { bloom++; const f = FAMILY(hh, l); bloomHue[f] = (bloomHue[f] || 0) + 1; }
		else if (s < 0.14 && l > 0.25) { stone++; if (l > 0.85) { const f = 'white'; bloomHue[f] = (bloomHue[f] || 0) + 0.3; } }
		else wood++;
	}
	if (!n) return null;
	const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
	// shape: how wide the top third is vs the bottom third (cone vs vase vs round)
	const third = (a, b) => { let s = 0, c = 0; for (let y = Math.round(y0 + bh * a); y < Math.round(y0 + bh * b); y++) { s += rowW[y]; c++; } return c ? s / c / bw : 0; };
	const top = third(0, 0.33), mid = third(0.33, 0.66), bot = third(0.66, 1);
	const colors = Object.entries(bloomHue).filter(([k]) => k !== 'green').sort((a, b) => b[1] - a[1]);
	return {
		leaf: leaf / n, bloom: bloom / n, wood: wood / n, stone: stone / n, dark: leaf ? darkLeaf / leaf : 0, leafL: leaf ? leafL / leaf : 0,
		aspect: bw / bh, fill: n / (bw * bh), top, mid, bot,
		trunk: bot < mid * 0.55 && bot < 0.35,
		color: colors.length && colors[0][1] / n > 0.02 ? colors[0][0] : null
	};
}

/** Best-guess category from the analysis. */
export function guessCategory(a) {
	if (!a) return 'features';
	const green = a.leaf + a.bloom * 0.8;
	if (green < 0.3 && a.leaf < 0.22) return 'features';
	if (a.trunk && 1 / a.aspect > 0.9) return a.dark > 0.45 && a.top < a.bot ? 'evergreens' : 'trees';
	if (a.top < a.bot * 0.55 && 1 / a.aspect > 1.15) return 'evergreens';
	if (a.bloom > 0.07 && a.aspect > 0.7 && a.fill < 0.6) return 'perennials';
	if (a.fill < 0.42 && a.aspect < 1.4 && a.leafL > 0.3) return 'grasses';
	return 'shrubs';
}

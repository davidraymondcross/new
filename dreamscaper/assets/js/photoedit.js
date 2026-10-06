/* DreamScaper – photo adjustments (light, color, detail, depth of field) and geometry
 * (crop, rotate, straighten, perspective) for the editor.
 *
 * Adjustments are non-destructive: they live on the view (view.adj) and are applied to a copy
 * of the photo whenever they change. Geometry changes make a NEW view so the original stays safe;
 * everything placed on the photo (plants, beds, measurements, horizon) is carried across with the
 * same transform.
 */

/** Slider definitions: [key, label, min, max, group]. Zero = no change. */
export const ADJUST = [
	['exposure', 'Exposure', -100, 100, 'Light'],
	['brightness', 'Brightness', -100, 100, 'Light'],
	['contrast', 'Contrast', -100, 100, 'Light'],
	['highlights', 'Highlights', -100, 100, 'Light'],
	['shadows', 'Shadows', -100, 100, 'Light'],
	['temp', 'Temperature (warm / cool)', -100, 100, 'Color'],
	['tint', 'Tint (green / magenta)', -100, 100, 'Color'],
	['saturation', 'Saturation', -100, 100, 'Color'],
	['vibrance', 'Vibrance', -100, 100, 'Color'],
	['hue', 'Hue', -180, 180, 'Color'],
	['greens', 'Greens (lawn & leaves)', -100, 100, 'Color'],
	['sharpen', 'Sharpen', 0, 100, 'Detail'],
	['denoise', 'Reduce noise', 0, 100, 'Detail'],
	['blur', 'Blur', 0, 100, 'Detail'],
	['bgblur', 'Background blur', 0, 100, 'Detail'],
	['dof', 'Depth of field', 0, 100, 'Detail']
];
export const PRESETS = [
	['Bright & fresh', { exposure: 12, contrast: 8, shadows: 25, vibrance: 25, greens: 15 }],
	['Golden hour', { exposure: 4, temp: 35, highlights: -15, shadows: 15, saturation: 10 }],
	['Lush green', { greens: 40, vibrance: 20, contrast: 6 }],
	['Overcast fix', { exposure: 18, contrast: 18, temp: 12, vibrance: 22, shadows: 10 }],
	['Soft & airy', { exposure: 15, contrast: -12, highlights: -10, saturation: -8 }]
];

export function hasAdjust(a) {
	if (!a) return false;
	for (const k in a) if (k !== 'focus' && +a[k]) return true;
	return false;
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * Light & color on RGBA pixel data (in place). Pure: no DOM, so it is unit-tested.
 * Order: exposure → brightness → contrast → highlights/shadows → temperature/tint → greens → saturation/vibrance → hue.
 */
export function adjustPixels(d, a) {
	const ev = Math.pow(2, ((a.exposure || 0) / 100) * 2);
	const br = ((a.brightness || 0) / 100) * 0.35;
	const ct = 1 + ((a.contrast || 0) / 100) * 0.9;
	const hl = (a.highlights || 0) / 100, sh = (a.shadows || 0) / 100;
	const tp = ((a.temp || 0) / 100) * 0.12, ti = ((a.tint || 0) / 100) * 0.1;
	const sat = 1 + (a.saturation || 0) / 100, vib = (a.vibrance || 0) / 100;
	const gr = (a.greens || 0) / 100;
	const hue = ((a.hue || 0) * Math.PI) / 180;
	// hue rotation matrix (luminance-preserving)
	const cs = Math.cos(hue), sn = Math.sin(hue);
	const m = hue ? [
		0.213 + cs * 0.787 - sn * 0.213, 0.715 - cs * 0.715 - sn * 0.715, 0.072 - cs * 0.072 + sn * 0.928,
		0.213 - cs * 0.213 + sn * 0.143, 0.715 + cs * 0.285 + sn * 0.140, 0.072 - cs * 0.072 - sn * 0.283,
		0.213 - cs * 0.213 - sn * 0.787, 0.715 - cs * 0.715 + sn * 0.715, 0.072 + cs * 0.928 + sn * 0.072
	] : null;
	for (let i = 0; i < d.length; i += 4) {
		let r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
		if (ev !== 1) { r *= ev; g *= ev; b *= ev; }
		if (br) { r += br; g += br; b += br; }
		if (ct !== 1) { r = (r - 0.5) * ct + 0.5; g = (g - 0.5) * ct + 0.5; b = (b - 0.5) * ct + 0.5; }
		if (hl || sh) {
			const L = clamp(0.2126 * r + 0.7152 * g + 0.0722 * b, 0, 1);
			const k = hl * L * L * 0.45 + sh * (1 - L) * (1 - L) * 0.45;
			r += k; g += k; b += k;
		}
		if (tp) { r += tp; b -= tp; }
		if (ti) { g -= ti; r += ti * 0.5; b += ti * 0.5; }
		if (gr && g > r && g > b) { const amt = Math.min(1, (g - Math.max(r, b)) * 4) * gr * 0.25; g += amt; r -= amt * 0.4; b -= amt * 0.4; }
		if (sat !== 1 || vib) {
			const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
			const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
			const cur = mx > 0 ? (mx - mn) / mx : 0;
			const k = sat * (1 + vib * (1 - cur));
			r = L + (r - L) * k; g = L + (g - L) * k; b = L + (b - L) * k;
		}
		if (m) { const R = r, G = g, B = b; r = m[0] * R + m[1] * G + m[2] * B; g = m[3] * R + m[4] * G + m[5] * B; b = m[6] * R + m[7] * G + m[8] * B; }
		d[i] = clamp(Math.round(r * 255), 0, 255);
		d[i + 1] = clamp(Math.round(g * 255), 0, 255);
		d[i + 2] = clamp(Math.round(b * 255), 0, 255);
	}
	return d;
}

function mk(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
function blurred(src, px) {
	const c = mk(src.width, src.height), x = c.getContext('2d');
	if ('filter' in x) { x.filter = `blur(${px}px)`; x.drawImage(src, 0, 0); return c; }
	// fallback: downscale/upscale blur
	const k = Math.max(1, px / 2), s = mk(src.width / k, src.height / k);
	s.getContext('2d').drawImage(src, 0, 0, s.width, s.height);
	x.imageSmoothingQuality = 'high';
	x.drawImage(s, 0, 0, c.width, c.height);
	return c;
}

/** Full adjustment of a photo canvas → new canvas. cam (photo views) places the depth-of-field focus. */
export function applyAdjust(src, a, cam) {
	const W = src.width, H = src.height;
	const out = mk(W, H), x = out.getContext('2d', { willReadFrequently: true });
	x.drawImage(src, 0, 0);
	const img = x.getImageData(0, 0, W, H);
	adjustPixels(img.data, a);
	x.putImageData(img, 0, 0);
	const diag = Math.hypot(W, H);
	if (a.denoise) { const b = blurred(out, 0.6 + (a.denoise / 100) * 1.4); x.globalAlpha = (a.denoise / 100) * 0.7; x.drawImage(b, 0, 0); x.globalAlpha = 1; }
	if (a.sharpen) {
		// unsharp mask: out + k·(out − blur)
		const b = blurred(out, 1.2 + (a.sharpen / 100) * 1.3);
		const o = x.getImageData(0, 0, W, H), bd = b.getContext('2d').getImageData(0, 0, W, H).data, k = (a.sharpen / 100) * 1.2;
		for (let i = 0; i < o.data.length; i += 4) for (let c = 0; c < 3; c++) o.data[i + c] = clamp(o.data[i + c] + k * (o.data[i + c] - bd[i + c]), 0, 255);
		x.putImageData(o, 0, 0);
	}
	if (a.blur) { const b = blurred(out, (a.blur / 100) * diag * 0.006); x.clearRect(0, 0, W, H); x.drawImage(b, 0, 0); }
	if (a.bgblur || a.dof) {
		const focus = a.focus != null ? a.focus * H : cam ? cam.horizon + (H - cam.horizon) * 0.55 : H * 0.6;
		const strength = Math.max(a.bgblur || 0, a.dof || 0) / 100;
		const b = blurred(out, strength * diag * 0.008);
		const m = mk(W, H), mx = m.getContext('2d');
		mx.drawImage(b, 0, 0);
		const gr = mx.createLinearGradient(0, 0, 0, H);
		const f = clamp(focus / H, 0.05, 0.95), band = 0.12;
		gr.addColorStop(0, 'rgba(0,0,0,1)');
		gr.addColorStop(clamp(f - band, 0, 1), 'rgba(0,0,0,0.9)');
		gr.addColorStop(f, 'rgba(0,0,0,0)');
		gr.addColorStop(clamp(f + band * 0.6, 0, 1), a.dof ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0)');
		gr.addColorStop(1, a.dof ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0)');
		mx.globalCompositeOperation = 'destination-in';
		mx.fillStyle = gr;
		mx.fillRect(0, 0, W, H);
		x.drawImage(m, 0, 0);
	}
	return out;
}

/* ------------------------------------------------------------ geometry */

/** 3×3 homography mapping 4 points src → dst (direct linear transform). */
export function homography(src, dst) {
	const A = [], B = [];
	for (let i = 0; i < 4; i++) {
		const [x, y] = src[i], [u, v] = dst[i];
		A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); B.push(u);
		A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); B.push(v);
	}
	const h = solve(A, B);
	return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}
function solve(A, b) {
	const n = b.length, M = A.map((r, i) => [...r, b[i]]);
	for (let c = 0; c < n; c++) {
		let p = c;
		for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
		[M[c], M[p]] = [M[p], M[c]];
		const d = M[c][c] || 1e-12;
		for (let k = c; k <= n; k++) M[c][k] /= d;
		for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
	}
	return M.map((r) => r[n]);
}
export function applyH(H, p) {
	const w = H[6] * p[0] + H[7] * p[1] + H[8];
	return [(H[0] * p[0] + H[1] * p[1] + H[2]) / w, (H[3] * p[0] + H[4] * p[1] + H[5]) / w];
}
export function invert3(m) {
	const [a, b, c, d, e, f, g, h, i] = m;
	const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
	const det = a * A + b * B + c * C;
	return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}

/**
 * Plan a geometry change. p: { rot90: 0..3, angle (deg), vert (−1..1), horiz (−1..1), crop: {x,y,w,h} 0..1 }.
 * Returns { W, H (output before rot90), outW, outH, H: out→src homography, map(src pt) → out pt, scale }.
 */
export function planTransform(W, H, p) {
	let Q = [[0, 0], [W, 0], [W, H], [0, H]];
	const v = clamp(p.vert || 0, -0.6, 0.6) * 0.5, hz = clamp(p.horiz || 0, -0.6, 0.6) * 0.5;
	if (v > 0) { Q[0][0] += v * W / 2; Q[1][0] -= v * W / 2; } else if (v < 0) { Q[3][0] -= v * W / 2; Q[2][0] += v * W / 2; }
	if (hz > 0) { Q[0][1] += hz * H / 2; Q[3][1] -= hz * H / 2; } else if (hz < 0) { Q[1][1] -= hz * H / 2; Q[2][1] += hz * H / 2; }
	const th = ((p.angle || 0) * Math.PI) / 180;
	if (th) {
		const c = Math.abs(Math.cos(th)), s = Math.abs(Math.sin(th));
		const k = Math.min(W / (W * c + H * s), H / (W * s + H * c));
		const cs = Math.cos(-th), sn = Math.sin(-th), cx = W / 2, cy = H / 2;
		Q = Q.map(([x, y]) => { const dx = (x - cx) * k, dy = (y - cy) * k; return [cx + dx * cs - dy * sn, cy + dx * sn + dy * cs]; });
	}
	const full = homography([[0, 0], [W, 0], [W, H], [0, H]], Q);
	const cr = p.crop || { x: 0, y: 0, w: 1, h: 1 };
	const cx0 = clamp(cr.x, 0, 1) * W, cy0 = clamp(cr.y, 0, 1) * H, cw = clamp(cr.w, 0.05, 1) * W, ch = clamp(cr.h, 0.05, 1) * H;
	const srcQuad = [[cx0, cy0], [cx0 + cw, cy0], [cx0 + cw, cy0 + ch], [cx0, cy0 + ch]].map((q) => applyH(full, q));
	const lim = Math.min(1, 2048 / Math.max(cw, ch));
	const ow = Math.max(16, Math.round(cw * lim)), oh = Math.max(16, Math.round(ch * lim));
	const Hm = homography([[0, 0], [ow, 0], [ow, oh], [0, oh]], srcQuad);
	const inv = invert3(Hm);
	const r90 = ((p.rot90 || 0) % 4 + 4) % 4;
	const outW = r90 % 2 ? oh : ow, outH = r90 % 2 ? ow : oh;
	const rot = ([x, y]) => (r90 === 0 ? [x, y] : r90 === 1 ? [oh - y, x] : r90 === 2 ? [ow - x, oh - y] : [y, ow - x]);
	const map = (pt) => rot(applyH(inv, pt));
	const a = map([W / 2, H / 2]), b = map([W / 2 + 10, H / 2]);
	const scale = Math.hypot(b[0] - a[0], b[1] - a[1]) / 10;
	return { ow, oh, outW, outH, Hm, r90, map, scale };
}

/** Render the planned transform (bilinear resampling). */
export function renderTransform(src, plan) {
	const W = src.width, H = src.height;
	const sx = mk(W, H).getContext('2d', { willReadFrequently: true });
	sx.drawImage(src, 0, 0);
	const sd = sx.getImageData(0, 0, W, H).data;
	const { ow, oh, Hm } = plan;
	const out = mk(ow, oh), ox = out.getContext('2d');
	const img = ox.createImageData(ow, oh), od = img.data;
	for (let y = 0; y < oh; y++) {
		for (let x = 0; x < ow; x++) {
			const w = Hm[6] * (x + 0.5) + Hm[7] * (y + 0.5) + Hm[8];
			const u = (Hm[0] * (x + 0.5) + Hm[1] * (y + 0.5) + Hm[2]) / w - 0.5, v = (Hm[3] * (x + 0.5) + Hm[4] * (y + 0.5) + Hm[5]) / w - 0.5;
			const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
			const i = (y * ow + x) * 4;
			if (x0 < -1 || y0 < -1 || x0 >= W || y0 >= H) { od[i + 3] = 255; continue; }
			const X0 = clamp(x0, 0, W - 1), X1 = clamp(x0 + 1, 0, W - 1), Y0 = clamp(y0, 0, H - 1), Y1 = clamp(y0 + 1, 0, H - 1);
			for (let c = 0; c < 3; c++) {
				const p00 = sd[(Y0 * W + X0) * 4 + c], p10 = sd[(Y0 * W + X1) * 4 + c], p01 = sd[(Y1 * W + X0) * 4 + c], p11 = sd[(Y1 * W + X1) * 4 + c];
				od[i + c] = (p00 * (1 - fx) + p10 * fx) * (1 - fy) + (p01 * (1 - fx) + p11 * fx) * fy;
			}
			od[i + 3] = 255;
		}
	}
	ox.putImageData(img, 0, 0);
	if (!plan.r90) return out;
	const r = mk(plan.outW, plan.outH), rx = r.getContext('2d');
	rx.translate(plan.outW / 2, plan.outH / 2);
	rx.rotate((plan.r90 * Math.PI) / 2);
	rx.drawImage(out, -ow / 2, -oh / 2);
	return r;
}

/** Carry a view's design across a transform: objects, ground shapes, measurements, horizon, scale. */
export function mapView(view, plan) {
	const v = JSON.parse(JSON.stringify(view, (k, val) => (k[0] === '_' ? undefined : val)));
	const mp = (pt) => plan.map(pt);
	for (const o of v.objects || []) { const q = mp([o.x, o.y]); o.x = q[0]; o.y = q[1]; if (plan.r90) o.rot = ((o.rot || 0) + plan.r90 * 90) % 360; }
	for (const op of v.ops || []) {
		if (op.pts) op.pts = op.pts.map(mp);
		if (op.t === 'brush') op.size = Math.max(2, op.size * plan.scale);
		if (op.t === 'mask') op.hidden = true; // pixel masks can't follow a warp — kept hidden so nothing is lost
	}
	for (const m of v.meas || []) m.pts = m.pts.map(mp);
	if (v.kind === 'aerial' && v.ppf) v.ppf *= plan.scale;
	if (v.cam && !plan.r90) { const h = mp([view.W / 2, v.cam.horizon]); v.cam.horizon = Math.round(h[1]); v.cam.focal = Math.round(v.cam.focal * plan.scale); }
	v.W = plan.outW; v.H = plan.outH;
	return v;
}

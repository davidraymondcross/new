/* DreamScaper – Magic Eraser
 *  magicSelect: pick a region by similar color (contiguous), or every object in the
 *               photo that matches its color, shape and size ("similar").
 *  inpaint:     remove the selection and rebuild the background from its surroundings
 *               (multi-scale fill for color + matched texture patches for detail).
 */

function dist(p, i, c) {
	const dr = p[i] - c[0], dg = p[i + 1] - c[1], db = p[i + 2] - c[2];
	return Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db) / 3;
}

function seedColor(img, x, y) {
	const { width: W, height: H, data: p } = img;
	const c = [0, 0, 0];
	let n = 0;
	for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
		const xx = Math.min(W - 1, Math.max(0, x + dx)), yy = Math.min(H - 1, Math.max(0, y + dy));
		const i = (yy * W + xx) * 4;
		c[0] += p[i]; c[1] += p[i + 1]; c[2] += p[i + 2]; n++;
	}
	return c.map((v) => v / n);
}

export function magicSelect(img, x, y, tol, mode = 'region') {
	const { width: W, height: H, data: p } = img;
	x = Math.round(x); y = Math.round(y);
	const c = seedColor(img, x, y);
	const thr = 6 + tol * 1.4;
	const ok = new Uint8Array(W * H);
	for (let i = 0, k = 0; k < W * H; i += 4, k++) ok[k] = dist(p, i, c) <= thr ? 1 : 0;
	ok[y * W + x] = 1;
	const mask = new Uint8Array(W * H);

	if (mode === 'region') {
		flood(ok, mask, W, H, y * W + x, 1);
	} else {
		// label connected components, keep those resembling the clicked one
		const lab = new Int32Array(W * H);
		const comps = [null];
		let id = 0;
		for (let k = 0; k < W * H; k++) {
			if (!ok[k] || lab[k]) continue;
			id++;
			comps.push(label(ok, lab, W, H, k, id));
		}
		const seed = comps[lab[y * W + x]];
		const sAR = seed.w / seed.h;
		const keep = new Uint8Array(id + 1);
		for (let i = 1; i <= id; i++) {
			const cpt = comps[i];
			if (i === lab[y * W + x]) { keep[i] = 1; continue; }
			if (cpt.n < 12) continue;
			const ar = cpt.w / cpt.h;
			const sizeOK = cpt.n > seed.n * 0.3 && cpt.n < seed.n * 3.3;
			const shapeOK = ar > sAR / 2.2 && ar < sAR * 2.2;
			const fill = cpt.n / (cpt.w * cpt.h), sFill = seed.n / (seed.w * seed.h);
			if (sizeOK && shapeOK && Math.abs(fill - sFill) < 0.35) keep[i] = 1;
		}
		for (let k = 0; k < W * H; k++) if (keep[lab[k]]) mask[k] = 1;
	}
	// close small holes and soften jagged edges
	return erode(dilate(mask, W, H, 2), W, H, 1);
}

function flood(ok, out, W, H, start, val) {
	const stack = [start];
	out[start] = val;
	while (stack.length) {
		const k = stack.pop();
		const x = k % W;
		if (x > 0 && ok[k - 1] && !out[k - 1]) { out[k - 1] = val; stack.push(k - 1); }
		if (x < W - 1 && ok[k + 1] && !out[k + 1]) { out[k + 1] = val; stack.push(k + 1); }
		if (k >= W && ok[k - W] && !out[k - W]) { out[k - W] = val; stack.push(k - W); }
		if (k < W * (H - 1) && ok[k + W] && !out[k + W]) { out[k + W] = val; stack.push(k + W); }
	}
}

function label(ok, lab, W, H, start, id) {
	const stack = [start];
	lab[start] = id;
	let n = 0, x0 = W, y0 = H, x1 = 0, y1 = 0;
	while (stack.length) {
		const k = stack.pop();
		const x = k % W, y = (k - x) / W;
		n++;
		if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
		if (x > 0 && ok[k - 1] && !lab[k - 1]) { lab[k - 1] = id; stack.push(k - 1); }
		if (x < W - 1 && ok[k + 1] && !lab[k + 1]) { lab[k + 1] = id; stack.push(k + 1); }
		if (y > 0 && ok[k - W] && !lab[k - W]) { lab[k - W] = id; stack.push(k - W); }
		if (y < H - 1 && ok[k + W] && !lab[k + W]) { lab[k + W] = id; stack.push(k + W); }
	}
	return { n, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Square dilation by r (separable running window). */
export function dilate(m, W, H, r) {
	if (r <= 0) return m;
	const tmp = new Uint8Array(W * H), out = new Uint8Array(W * H);
	for (let y = 0; y < H; y++) {
		let run = -1e9;
		for (let x = 0; x < W; x++) { if (m[y * W + x]) run = x; if (x - run <= r) tmp[y * W + x] = 1; }
		run = 1e9;
		for (let x = W - 1; x >= 0; x--) { if (m[y * W + x]) run = x; if (run - x <= r) tmp[y * W + x] = 1; }
	}
	for (let x = 0; x < W; x++) {
		let run = -1e9;
		for (let y = 0; y < H; y++) { if (tmp[y * W + x]) run = y; if (y - run <= r) out[y * W + x] = 1; }
		run = 1e9;
		for (let y = H - 1; y >= 0; y--) { if (tmp[y * W + x]) run = y; if (run - y <= r) out[y * W + x] = 1; }
	}
	return out;
}
export function erode(m, W, H, r) {
	const inv = new Uint8Array(W * H);
	for (let k = 0; k < W * H; k++) inv[k] = m[k] ? 0 : 1;
	const d = dilate(inv, W, H, r);
	for (let k = 0; k < W * H; k++) inv[k] = d[k] ? 0 : 1;
	return inv;
}

export function maskBBox(m, W, H) {
	let x0 = W, y0 = H, x1 = -1, y1 = -1;
	for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m[y * W + x]) {
		if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
	}
	return x1 < 0 ? null : { x0, y0, x1, y1 };
}

export function maskCount(m) { let n = 0; for (let k = 0; k < m.length; k++) n += m[k]; return n; }

/** Box blur (radius r) of 3-channel float image, using known-weight normalization. */
function blur3(r, g, b, wt, w, h, rad) {
	const ch = [r, g, b, wt];
	const out = ch.map(() => new Float32Array(w * h));
	const tmp = new Float32Array(w * h);
	for (let c = 0; c < 4; c++) {
		const src = c < 3 ? ch[c].map((v, i) => v * wt[i]) : wt;
		for (let y = 0; y < h; y++) {
			let acc = 0;
			const row = y * w;
			for (let x = -rad; x <= rad; x++) acc += src[row + Math.min(w - 1, Math.max(0, x))];
			for (let x = 0; x < w; x++) {
				tmp[row + x] = acc;
				acc += src[row + Math.min(w - 1, x + rad + 1)] - src[row + Math.max(0, x - rad)];
			}
		}
		const o = out[c];
		for (let x = 0; x < w; x++) {
			let acc = 0;
			for (let y = -rad; y <= rad; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
			for (let y = 0; y < h; y++) {
				o[y * w + x] = acc;
				acc += tmp[Math.min(h - 1, y + rad + 1) * w + x] - tmp[Math.max(0, y - rad) * w + x];
			}
		}
	}
	for (let i = 0; i < w * h; i++) {
		const ww = out[3][i] || 1e-6;
		out[0][i] /= ww; out[1][i] /= ww; out[2][i] /= ww;
	}
	return out;
}

/** Remove masked pixels and rebuild the background. Mutates img; returns the touched rect. */
export function inpaint(img, mask) {
	const { width: W, height: H, data: p } = img;
	const bb = maskBBox(mask, W, H);
	if (!bb) return null;
	const ext = Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0);
	const m = Math.round(Math.min(220, Math.max(28, ext * 0.6)));
	const X0 = Math.max(0, bb.x0 - m), Y0 = Math.max(0, bb.y0 - m);
	const X1 = Math.min(W - 1, bb.x1 + m), Y1 = Math.min(H - 1, bb.y1 + m);
	const w = X1 - X0 + 1, h = Y1 - Y0 + 1, N = w * h;
	const r = new Float32Array(N), g = new Float32Array(N), b = new Float32Array(N), known = new Float32Array(N);
	for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
		const k = y * w + x, gi = (Y0 + y) * W + X0 + x, i = gi * 4;
		r[k] = p[i]; g[k] = p[i + 1]; b[k] = p[i + 2];
		known[k] = mask[gi] ? 0 : 1;
	}

	// 1) pull-push: smooth multi-scale color fill
	const levels = [{ w, h, r: r.map((v, i) => v * known[i]), g: g.map((v, i) => v * known[i]), b: b.map((v, i) => v * known[i]), wt: known.slice() }];
	for (const L of [levels[0]]) for (let i = 0; i < N; i++) if (L.wt[i] > 0) { L.r[i] /= L.wt[i]; L.g[i] /= L.wt[i]; L.b[i] /= L.wt[i]; }
	while (levels[levels.length - 1].w > 1 || levels[levels.length - 1].h > 1) {
		const A = levels[levels.length - 1];
		const w2 = Math.ceil(A.w / 2), h2 = Math.ceil(A.h / 2);
		const B = { w: w2, h: h2, r: new Float32Array(w2 * h2), g: new Float32Array(w2 * h2), b: new Float32Array(w2 * h2), wt: new Float32Array(w2 * h2) };
		for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) {
			let sr = 0, sg = 0, sb = 0, sw = 0;
			for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
				const xx = x * 2 + dx, yy = y * 2 + dy;
				if (xx >= A.w || yy >= A.h) continue;
				const k = yy * A.w + xx, ww = A.wt[k];
				sr += A.r[k] * ww; sg += A.g[k] * ww; sb += A.b[k] * ww; sw += ww;
			}
			const k = y * w2 + x;
			if (sw > 0) { B.r[k] = sr / sw; B.g[k] = sg / sw; B.b[k] = sb / sw; }
			B.wt[k] = Math.min(1, sw);
		}
		levels.push(B);
	}
	for (let l = levels.length - 2; l >= 0; l--) {
		const A = levels[l], B = levels[l + 1];
		for (let y = 0; y < A.h; y++) for (let x = 0; x < A.w; x++) {
			const k = y * A.w + x, ww = A.wt[k];
			if (ww >= 1) continue;
			// bilinear sample of coarse level
			const fx = Math.min(B.w - 1, Math.max(0, (x - 0.5) / 2)), fy = Math.min(B.h - 1, Math.max(0, (y - 0.5) / 2));
			const ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
			const ix2 = Math.min(B.w - 1, ix + 1), iy2 = Math.min(B.h - 1, iy + 1);
			const s = (arr) => (arr[iy * B.w + ix] * (1 - tx) + arr[iy * B.w + ix2] * tx) * (1 - ty) + (arr[iy2 * B.w + ix] * (1 - tx) + arr[iy2 * B.w + ix2] * tx) * ty;
			A.r[k] = A.r[k] * ww + s(B.r) * (1 - ww);
			A.g[k] = A.g[k] * ww + s(B.g) * (1 - ww);
			A.b[k] = A.b[k] * ww + s(B.b) * (1 - ww);
			A.wt[k] = 1;
		}
	}
	const F = levels[0];
	for (let i = 0; i < N; i++) if (known[i]) { F.r[i] = r[i]; F.g[i] = g[i]; F.b[i] = b[i]; }

	// 2) texture: split into low + high frequencies, copy high-frequency detail from
	//    nearby patches whose low-frequency color matches the fill.
	const ones = new Float32Array(N).fill(1);
	const rad = Math.max(2, Math.round(Math.min(6, ext / 40 + 2)));
	const low = blur3(F.r, F.g, F.b, ones, w, h, rad);
	const hiR = new Float32Array(N), hiG = new Float32Array(N), hiB = new Float32Array(N);
	for (let i = 0; i < N; i++) { hiR[i] = r[i] - low[0][i]; hiG[i] = g[i] - low[1][i]; hiB[i] = b[i] - low[2][i]; }
	// integral image of unknown pixels → fast "is this patch fully known?" checks
	const integ = new Int32Array((w + 1) * (h + 1));
	for (let y = 0; y < h; y++) {
		let run = 0;
		for (let x = 0; x < w; x++) { run += known[y * w + x] ? 0 : 1; integ[(y + 1) * (w + 1) + x + 1] = integ[y * (w + 1) + x + 1] + run; }
	}
	const holes = (x, y, s) => integ[(y + s) * (w + 1) + x + s] - integ[y * (w + 1) + x + s] - integ[(y + s) * (w + 1) + x] + integ[y * (w + 1) + x];
	const B = Math.max(8, Math.min(20, Math.round(ext / 10) + 8)), step = B >> 1;
	const acR = new Float32Array(N), acG = new Float32Array(N), acB = new Float32Array(N), acW = new Float32Array(N);
	let seed = 12345;
	const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
	for (let by = 0; by <= h - B; by += step) {
		for (let bx = 0; bx <= w - B; bx += step) {
			if (holes(bx, by, B) === 0) continue;
			let best = null, bestS = 1e18;
			const searchR = Math.max(40, ext);
			for (let t = 0; t < 60; t++) {
				const sx = Math.round(bx + (rnd() * 2 - 1) * searchR), sy = Math.round(by + (rnd() * 2 - 1) * searchR * 0.5);
				if (sx < 0 || sy < 0 || sx > w - B || sy > h - B) continue;
				if (holes(sx, sy, B) > 0) continue;
				let ssd = 0;
				for (let yy = 0; yy < B; yy += 2) for (let xx = 0; xx < B; xx += 2) {
					const a = (by + yy) * w + bx + xx, c = (sy + yy) * w + sx + xx;
					const d0 = low[0][a] - low[0][c], d1 = low[1][a] - low[1][c], d2 = low[2][a] - low[2][c];
					ssd += d0 * d0 + d1 * d1 + d2 * d2;
				}
				ssd += Math.abs(sy - by) * 40 + Math.abs(sx - bx) * 4;
				if (ssd < bestS) { bestS = ssd; best = [sx, sy]; }
			}
			if (!best) continue;
			for (let yy = 0; yy < B; yy++) for (let xx = 0; xx < B; xx++) {
				const a = (by + yy) * w + bx + xx, c = (best[1] + yy) * w + best[0] + xx;
				const wt = (1 - Math.abs((xx + 0.5) / B * 2 - 1)) * (1 - Math.abs((yy + 0.5) / B * 2 - 1)) + 0.01;
				acR[a] += hiR[c] * wt; acG[a] += hiG[c] * wt; acB[a] += hiB[c] * wt; acW[a] += wt;
			}
		}
	}
	for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
		const k = y * w + x;
		if (known[k]) continue;
		const i = ((Y0 + y) * W + X0 + x) * 4;
		const ww = acW[k] || 1;
		p[i] = low[0][k] + acR[k] / ww;
		p[i + 1] = low[1][k] + acG[k] / ww;
		p[i + 2] = low[2][k] + acB[k] / ww;
	}
	return { x: X0, y: Y0, w, h };
}

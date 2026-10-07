/* DreamScaper – procedural artwork for garden features (side view + top view).
 * Every function draws with its base centered at (cx, base), w×h in pixels.
 */
import { hsl } from './util.js?v=2.7.3';

export const PAL = {
	granite: [30, 5, 58], field: [32, 16, 50], moss: [95, 22, 40], quartz: [40, 10, 88], ledge: [35, 8, 46], bluestone: [210, 10, 46],
	teak: [30, 45, 45], black: [0, 0, 14], white: [45, 14, 94], green: [150, 35, 30], blue: [205, 50, 45], red: [2, 60, 42], cedar: [25, 45, 50],
	yellow: [48, 80, 58], limestone: [40, 15, 78], bark: [28, 30, 30], canvas: [40, 25, 80], rust: [18, 55, 35], concrete: [30, 5, 62],
	terracotta: [18, 60, 48], steel: [210, 5, 58], copper: [20, 55, 45], glazeblue: [205, 60, 40], glazegreen: [140, 40, 35], bronze: [30, 40, 30],
	bamboo: [40, 50, 62], oak: [30, 45, 35], galv: [200, 6, 70], gray: [210, 6, 55], block: [30, 8, 55], brick: [8, 50, 40], gabion: [30, 8, 55],
	pink: [335, 80, 68], plaid: [0, 60, 40], orange: [25, 90, 52], roof: [210, 8, 30], succulent: [160, 25, 50], purple: [275, 45, 50],
	stripe: [10, 70, 55], grass: [95, 45, 40]
};
const C = (o, k = 'c', d = 'white') => PAL[o[k]] || PAL[d];
const F = (c, dl = 0, a = 1) => hsl(c, dl, a);

function grad(ctx, x0, x1, c, sun, amt = 12) {
	const g = ctx.createLinearGradient(x0, 0, x1, 0);
	g.addColorStop(sun < 0 ? 0 : 1, F(c, amt));
	g.addColorStop(0.5, F(c, 0));
	g.addColorStop(sun < 0 ? 1 : 0, F(c, -amt));
	return g;
}
function box(ctx, x, y, w, h, fill) { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); }
function speck(ctx, R, x0, y0, w, h, n, dark = 0.1, light = 0.08, r = 1) {
	for (let i = 0; i < n; i++) {
		ctx.fillStyle = R() < 0.5 ? `rgba(0,0,0,${dark * R()})` : `rgba(255,255,255,${light * R()})`;
		ctx.beginPath(); ctx.arc(x0 + R() * w, y0 + R() * h, Math.max(0.5, r * (0.5 + R())), 0, 7); ctx.fill();
	}
}
function lumpyPoly(ctx, cx, cy, rx, ry, R, n = 9) {
	ctx.beginPath();
	for (let i = 0; i < n; i++) {
		const a = (i / n) * Math.PI * 2;
		const k = 0.82 + R() * 0.25;
		const x = cx + Math.cos(a) * rx * k, y = cy + Math.sin(a) * ry * k;
		i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
	}
	ctx.closePath();
}
function flowersOn(ctx, R, cx, cy, rx, ry, col, n, s) {
	for (let i = 0; i < n; i++) {
		const a = R() * 7, d = Math.sqrt(R());
		const x = cx + Math.cos(a) * rx * d, y = cy + Math.sin(a) * ry * d;
		ctx.fillStyle = F([110, 40, 28 + R() * 10], 0);
		ctx.beginPath(); ctx.arc(x, y, s * 1.3, 0, 7); ctx.fill();
	}
	for (let i = 0; i < n * 0.7; i++) {
		const a = R() * 7, d = Math.sqrt(R());
		ctx.fillStyle = F(col, (R() - 0.5) * 12);
		ctx.beginPath(); ctx.arc(cx + Math.cos(a) * rx * d, cy + Math.sin(a) * ry * d - s * 0.4, s, 0, 7); ctx.fill();
	}
}
const glow = (res, x, y, r, col = [255, 215, 150], k = 1, ground) => res.lights.push({ x, y, r, col, k, ground });
function flames(ctx, R, cx, by, w, h, n = 9) {
	for (let i = 0; i < n; i++) {
		const fx = cx + (R() - 0.5) * w, fh = h * (0.45 + R() * 0.55);
		const g = ctx.createLinearGradient(0, by, 0, by - fh);
		g.addColorStop(0, 'rgba(255,200,80,.95)'); g.addColorStop(0.5, 'rgba(255,110,25,.85)'); g.addColorStop(1, 'rgba(255,60,0,0)');
		ctx.fillStyle = g;
		ctx.beginPath(); ctx.moveTo(fx - w * 0.12, by); ctx.quadraticCurveTo(fx - w * 0.1, by - fh * 0.55, fx + (R() - 0.5) * w * 0.1, by - fh);
		ctx.quadraticCurveTo(fx + w * 0.1, by - fh * 0.5, fx + w * 0.12, by); ctx.fill();
	}
}
function water(ctx, cx, cy, rx, ry) {
	const g = ctx.createLinearGradient(0, cy - ry, 0, cy + ry);
	g.addColorStop(0, 'hsl(200 40% 62%)'); g.addColorStop(1, 'hsl(205 50% 35%)');
	ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, 7); ctx.fill();
	ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = Math.max(0.5, ry * 0.12);
	ctx.beginPath(); ctx.ellipse(cx - rx * 0.2, cy - ry * 0.2, rx * 0.4, ry * 0.3, 0, Math.PI * 1.1, Math.PI * 1.7); ctx.stroke();
}

/* ------------------------------------------------------------------ side */

export const SIDE = {
	boulder(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'granite');
		const flat = o.v === 'flat';
		ctx.beginPath();
		ctx.moveTo(cx - w / 2, base);
		const n = 9;
		for (let i = 0; i <= n; i++) {
			const a = Math.PI + (i / n) * Math.PI;
			const k = flat ? 0.9 + R() * 0.12 : 0.78 + R() * 0.3;
			ctx.lineTo(cx + Math.cos(a) * w * 0.5 * (0.88 + R() * 0.12), Math.min(base, base + Math.sin(a) * h * k));
		}
		ctx.lineTo(cx + w / 2, base); ctx.closePath();
		const g = ctx.createLinearGradient(cx + sun * w * 0.4, base - h, cx - sun * w * 0.4, base);
		g.addColorStop(0, F(c, 14)); g.addColorStop(1, F(c, -16));
		ctx.fillStyle = g; ctx.fill();
		ctx.save(); ctx.clip();
		speck(ctx, R, cx - w / 2, base - h, w, h, w * 1.6, 0.18, 0.12, w * 0.012);
		if (o.c === 'moss') for (let i = 0; i < w * 0.8; i++) { ctx.fillStyle = F([95, 40, 30 + R() * 12], 0, 0.8); ctx.beginPath(); ctx.arc(cx + (R() - 0.5) * w, base - h * (0.5 + R() * 0.5), w * 0.03, 0, 7); ctx.fill(); }
		if (o.c === 'quartz') { ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(cx - w * 0.2, base - h, w * 0.08, h); }
		ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.lineWidth = Math.max(0.6, w * 0.008);
		ctx.beginPath(); ctx.moveTo(cx + (R() - 0.5) * w * 0.4, base - h * 0.95); ctx.lineTo(cx + (R() - 0.5) * w * 0.3, base - h * 0.25); ctx.stroke();
		if (flat) { ctx.beginPath(); ctx.moveTo(cx - w * 0.45, base - h * 0.45); ctx.lineTo(cx + w * 0.45, base - h * 0.5); ctx.stroke(); }
		ctx.restore();
	},
	boulders(ctx, cx, base, w, h, R, sun, res, o) {
		SIDE.boulder(ctx, cx - w * 0.22, base, w * 0.5, h, R, sun, res, o);
		SIDE.boulder(ctx, cx + w * 0.25, base, w * 0.38, h * 0.65, R, sun, res, o);
		SIDE.boulder(ctx, cx + w * 0.02, base, w * 0.3, h * 0.45, R, sun, res, o);
	},
	cairn(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'field');
		let y = base;
		for (let i = 0; i < 5; i++) {
			const sw = w * (1 - i * 0.15) * (0.9 + R() * 0.15), sh = h * 0.2;
			ctx.fillStyle = grad(ctx, cx - sw / 2, cx + sw / 2, [c[0], c[1], c[2] + (R() - 0.5) * 12], sun);
			ctx.beginPath(); ctx.ellipse(cx + (R() - 0.5) * w * 0.08, y - sh / 2, sw / 2, sh / 2, 0, 0, 7); ctx.fill();
			y -= sh * 0.92;
		}
	},
	steps(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'bluestone');
		for (let i = 0; i < 3; i++) {
			const sw = w * (1 - i * 0.12), sh = h / 3;
			const y = base - sh * (i + 1);
			box(ctx, cx - sw / 2, y, sw, sh * 0.25, F(c, 14));
			box(ctx, cx - sw / 2, y + sh * 0.25, sw, sh * 0.75, grad(ctx, cx - sw / 2, cx + sw / 2, c, sun));
		}
	},
	stepping(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'bluestone');
		ctx.fillStyle = F(c, 4);
		lumpyPoly(ctx, cx, base - Math.max(1, h), w / 2, Math.max(2, w * 0.18), R, 10); ctx.fill();
		ctx.fillStyle = F(c, -14); ctx.fillRect(cx - w * 0.45, base - Math.max(1, h) * 0.8, w * 0.9, Math.max(1, h));
	},
	bench(ctx, cx, base, w, h, R, sun, res, o) {
		const wood = C(o, 'c', 'teak'), leg = C(o, 'c2', 'black');
		const iron = o.v === 'iron';
		ctx.fillStyle = F(leg, 0);
		[-0.42, 0.38].forEach((t) => ctx.fillRect(cx + t * w, base - h * 0.5, w * 0.04, h * 0.5));
		[-0.42, 0.38].forEach((t) => ctx.fillRect(cx + t * w, base - h * 0.98, w * 0.035, h * 0.5));
		ctx.fillRect(cx - w * 0.47, base - h * 0.55, w * 0.1, h * 0.03); ctx.fillRect(cx + w * 0.37, base - h * 0.55, w * 0.1, h * 0.03);
		for (let i = 0; i < 3; i++) box(ctx, cx - w * 0.46, base - h * (0.52 + i * 0.05), w * 0.92, h * 0.045, F(wood, i * 3));
		for (let i = 0; i < 4; i++) box(ctx, cx - w * 0.44, base - h * (0.72 + i * 0.07), w * 0.88, h * (iron ? 0.025 : 0.05), F(wood, 4 - i * 2));
		if (iron) { ctx.strokeStyle = F(leg, 0); ctx.lineWidth = Math.max(0.5, w * 0.006); for (let i = 0; i < 18; i++) { const x = cx - w * 0.42 + i * w * 0.047; ctx.beginPath(); ctx.moveTo(x, base - h * 0.95); ctx.lineTo(x, base - h * 0.62); ctx.stroke(); } }
	},
	stonebench(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'limestone');
		box(ctx, cx - w * 0.35, base - h * 0.75, w * 0.12, h * 0.75, F(c, -8));
		box(ctx, cx + w * 0.23, base - h * 0.75, w * 0.12, h * 0.75, F(c, -8));
		ctx.fillStyle = grad(ctx, cx - w / 2, cx + w / 2, c, sun);
		if (o.v === 'curve') { ctx.beginPath(); ctx.moveTo(cx - w / 2, base - h * 0.95); ctx.quadraticCurveTo(cx, base - h * 0.75, cx + w / 2, base - h * 0.95); ctx.lineTo(cx + w / 2, base - h * 0.72); ctx.quadraticCurveTo(cx, base - h * 0.52, cx - w / 2, base - h * 0.72); ctx.fill(); }
		else ctx.fillRect(cx - w / 2, base - h, w, h * 0.25);
		speck(ctx, R, cx - w / 2, base - h, w, h, w * 0.6, 0.15, 0.1, w * 0.008);
	},
	logbench(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'bark');
		[-0.35, 0.35].forEach((t) => { ctx.fillStyle = F(c, -4); ctx.fillRect(cx + t * w - w * 0.08, base - h * 0.6, w * 0.16, h * 0.6); });
		ctx.fillStyle = grad(ctx, cx - w / 2, cx + w / 2, c, sun, 8); ctx.fillRect(cx - w / 2, base - h, w, h * 0.45);
		ctx.fillStyle = F([35, 45, 62], 0); ctx.beginPath(); ctx.ellipse(cx + w / 2, base - h * 0.78, w * 0.03, h * 0.22, 0, 0, 7); ctx.fill();
		ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1;
		for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(cx - w / 2, base - h * (0.6 + i * 0.06)); ctx.lineTo(cx + w / 2, base - h * (0.6 + i * 0.06) + (R() - 0.5) * 2); ctx.stroke(); }
	},
	adirondack(ctx, cx, base, w, h, R, sun, res, o) {
		const col = C(o, 'c', 'blue');
		ctx.fillStyle = F(col, -10);
		ctx.fillRect(cx - w * 0.4, base - h * 0.45, w * 0.08, h * 0.45);
		ctx.fillRect(cx + w * 0.3, base - h * 0.45, w * 0.08, h * 0.45);
		for (let i = 0; i < 5; i++) {
			ctx.fillStyle = F(col, (i % 2) * 5);
			const x = cx - w * 0.28 + i * w * 0.12, t = base - h * (0.95 - Math.abs(i - 2) * 0.05);
			ctx.beginPath(); ctx.moveTo(x, base - h * 0.42); ctx.lineTo(x + w * 0.1, base - h * 0.42); ctx.lineTo(x + w * 0.13, t);
			ctx.quadraticCurveTo(x + w * 0.06, t - h * 0.05, x + w * 0.03, t); ctx.closePath(); ctx.fill();
		}
		ctx.fillStyle = F(col, 6);
		ctx.fillRect(cx - w * 0.5, base - h * 0.5, w * 0.24, h * 0.06);
		ctx.fillRect(cx + w * 0.26, base - h * 0.5, w * 0.24, h * 0.06);
		ctx.fillRect(cx - w * 0.36, base - h * 0.42, w * 0.72, h * 0.07);
	},
	rocker(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'white');
		ctx.strokeStyle = F(c, -6); ctx.lineWidth = Math.max(1, w * 0.05);
		ctx.beginPath(); ctx.ellipse(cx, base - h * 0.4, w * 0.6, h * 0.42, 0, Math.PI * 0.32, Math.PI * 0.68); ctx.stroke();
		ctx.fillStyle = F(c, 0);
		[-0.35, 0.3].forEach((t) => ctx.fillRect(cx + t * w, base - h * 0.5, w * 0.06, h * 0.48));
		ctx.fillRect(cx - w * 0.4, base - h * 0.5, w * 0.8, h * 0.06);
		for (let i = 0; i < 5; i++) ctx.fillRect(cx - w * 0.32 + i * w * 0.15, base - h, w * 0.06, h * 0.5);
		ctx.fillRect(cx - w * 0.38, base - h, w * 0.76, h * 0.06);
		ctx.fillRect(cx - w * 0.45, base - h * 0.7, w * 0.9, h * 0.04);
	},
	bistro(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'black');
		ctx.fillStyle = F(c, 0); ctx.strokeStyle = F(c, 0); ctx.lineWidth = Math.max(1, w * 0.012);
		ctx.fillRect(cx - w * 0.02, base - h * 0.85, w * 0.04, h * 0.85);
		ctx.beginPath(); ctx.ellipse(cx, base - h * 0.86, w * 0.2, h * 0.04, 0, 0, 7); ctx.fill();
		ctx.beginPath(); ctx.ellipse(cx, base - 1, w * 0.12, h * 0.02, 0, 0, 7); ctx.fill();
		[-1, 1].forEach((s) => {
			const x = cx + s * w * 0.36;
			ctx.fillRect(x - w * 0.12, base - h * 0.55, w * 0.24, h * 0.04);
			ctx.beginPath(); ctx.moveTo(x - w * 0.1, base); ctx.lineTo(x - w * 0.1, base - h * 0.55); ctx.moveTo(x + w * 0.1, base); ctx.lineTo(x + w * 0.1, base - h * 0.55); ctx.stroke();
			const bx = x + s * w * 0.1;
			ctx.beginPath(); ctx.moveTo(bx, base - h * 0.55); ctx.quadraticCurveTo(bx + s * w * 0.03, base - h * 0.95, bx - s * w * 0.06, base - h * 1.0); ctx.stroke();
		});
	},
	dining(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'teak'), u = C(o, 'c2', 'canvas');
		ctx.fillStyle = F(c, -4);
		ctx.fillRect(cx - w * 0.3, base - h * 0.32, w * 0.03, h * 0.32); ctx.fillRect(cx + w * 0.27, base - h * 0.32, w * 0.03, h * 0.32);
		ctx.fillStyle = grad(ctx, cx - w * 0.35, cx + w * 0.35, c, sun); ctx.fillRect(cx - w * 0.35, base - h * 0.34, w * 0.7, h * 0.03);
		ctx.fillStyle = '#e8e4da'; ctx.fillRect(cx - w * 0.008, base - h * 0.95, w * 0.016, h * 0.95);
		const g = ctx.createLinearGradient(0, base - h, 0, base - h * 0.78);
		g.addColorStop(0, F(u, 8)); g.addColorStop(1, F(u, -10));
		ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(cx, base - h); ctx.lineTo(cx + w * 0.5, base - h * 0.78); ctx.lineTo(cx - w * 0.5, base - h * 0.78); ctx.fill();
		[-0.45, 0.45].forEach((t) => { const x = cx + t * w; ctx.fillStyle = F(c, 2); ctx.fillRect(x - w * 0.07, base - h * 0.22, w * 0.14, h * 0.025); ctx.fillRect(x + (t < 0 ? -w * 0.07 : w * 0.055), base - h * 0.42, w * 0.015, h * 0.42); ctx.fillRect(x + (t < 0 ? w * 0.055 : -w * 0.07), base - h * 0.22, w * 0.015, h * 0.22); });
	},
	chaise(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'teak'), cu = C(o, 'c2', 'white');
		ctx.fillStyle = F(c, -6);
		[-0.4, 0, 0.4].forEach((t) => ctx.fillRect(cx + t * w, base - h * 0.4, w * 0.025, h * 0.4));
		ctx.fillStyle = F(c, 0); ctx.fillRect(cx - w * 0.45, base - h * 0.42, w * 0.9, h * 0.08);
		ctx.fillStyle = F(cu, 0); ctx.fillRect(cx - w * 0.1, base - h * 0.52, w * 0.55, h * 0.1);
		ctx.beginPath(); ctx.moveTo(cx - w * 0.1, base - h * 0.42); ctx.lineTo(cx - w * 0.45, base - h); ctx.lineTo(cx - w * 0.38, base - h); ctx.lineTo(cx - w * 0.04, base - h * 0.52); ctx.fill();
	},
	aswing(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'cedar');
		ctx.strokeStyle = F(c, -4); ctx.lineWidth = Math.max(1.5, w * 0.03);
		[-1, 1].forEach((s) => { ctx.beginPath(); ctx.moveTo(cx + s * w * 0.5, base); ctx.lineTo(cx + s * w * 0.36, base - h); ctx.moveTo(cx + s * w * 0.22, base); ctx.lineTo(cx + s * w * 0.36, base - h); ctx.stroke(); });
		ctx.fillStyle = F(c, 4); ctx.fillRect(cx - w * 0.42, base - h * 1.0, w * 0.84, h * 0.05);
		ctx.strokeStyle = '#333'; ctx.lineWidth = Math.max(0.6, w * 0.006);
		[-0.22, 0.22].forEach((t) => { ctx.beginPath(); ctx.moveTo(cx + t * w, base - h * 0.95); ctx.lineTo(cx + t * w, base - h * 0.45); ctx.stroke(); });
		ctx.fillStyle = F(c, 0); ctx.fillRect(cx - w * 0.26, base - h * 0.45, w * 0.52, h * 0.05);
		for (let i = 0; i < 4; i++) ctx.fillRect(cx - w * 0.26, base - h * (0.5 + i * 0.06), w * 0.52, h * 0.035);
	},
	hammock(ctx, cx, base, w, h, R, sun, res, o) {
		ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = Math.max(1.5, w * 0.012);
		ctx.beginPath(); ctx.moveTo(cx - w * 0.5, base); ctx.quadraticCurveTo(cx, base - h * 0.3, cx + w * 0.5, base); ctx.stroke();
		ctx.beginPath(); ctx.moveTo(cx - w * 0.47, base - h * 0.15); ctx.lineTo(cx - w * 0.42, base - h); ctx.moveTo(cx + w * 0.47, base - h * 0.15); ctx.lineTo(cx + w * 0.42, base - h); ctx.stroke();
		const cols = ['#c8453b', '#f3e7cf', '#2f6d8f', '#f3e7cf', '#d99a2b'];
		for (let i = 0; i < 5; i++) {
			ctx.strokeStyle = cols[i]; ctx.lineWidth = Math.max(1, h * 0.06);
			ctx.beginPath(); ctx.moveTo(cx - w * 0.36, base - h * (0.72 - i * 0.04)); ctx.quadraticCurveTo(cx, base - h * (0.25 - i * 0.04), cx + w * 0.36, base - h * (0.72 - i * 0.04)); ctx.stroke();
		}
		ctx.strokeStyle = '#555'; ctx.lineWidth = 1;
		ctx.beginPath(); ctx.moveTo(cx - w * 0.42, base - h); ctx.lineTo(cx - w * 0.36, base - h * 0.72); ctx.moveTo(cx + w * 0.42, base - h); ctx.lineTo(cx + w * 0.36, base - h * 0.72); ctx.stroke();
	},
	firepit(ctx, cx, base, w, h, R, sun, res, o) {
		const stone = C(o, 'c', 'field');
		const ry = Math.max(2, w * 0.16), top = base - h + ry, sq = o.v === 'square';
		ctx.fillStyle = F(stone, -16);
		ctx.beginPath(); ctx.ellipse(cx, top, w / 2, ry, 0, 0, 7); ctx.fill();
		ctx.fillStyle = '#2a1d16'; ctx.beginPath(); ctx.ellipse(cx, top, w * 0.42, ry * 0.8, 0, 0, 7); ctx.fill();
		flames(ctx, R, cx, top + ry * 0.2, w * 0.45, h * 1.25, 11);
		ctx.beginPath();
		if (sq) { ctx.rect(cx - w / 2, top, w, base - top); }
		else { ctx.ellipse(cx, top, w / 2, ry, 0, Math.PI, 0, true); ctx.lineTo(cx + w / 2, base - ry); ctx.ellipse(cx, base - ry, w / 2, ry, 0, 0, Math.PI); ctx.closePath(); }
		ctx.fillStyle = grad(ctx, cx - w / 2, cx + w / 2, stone, sun, 14); ctx.fill();
		ctx.save(); ctx.clip();
		ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.lineWidth = Math.max(0.5, w * 0.006);
		const rows = 3, hh = base - top;
		for (let r = 0; r < rows; r++) {
			const y0 = top + (hh * r) / rows;
			ctx.beginPath(); ctx.moveTo(cx - w / 2, y0 + (sq ? 0 : ry)); ctx.lineTo(cx + w / 2, y0 + (sq ? 0 : ry)); ctx.stroke();
			for (let i = 0; i < 8; i++) { const x = cx - w / 2 + ((i + (r % 2) * 0.5) / 8) * w; ctx.beginPath(); ctx.moveTo(x, y0 + (sq ? 0 : ry)); ctx.lineTo(x, y0 + hh / rows + (sq ? 0 : ry)); ctx.stroke(); }
		}
		speck(ctx, R, cx - w / 2, top, w, hh, w * 0.6, 0.15, 0.1, w * 0.006);
		ctx.restore();
		glow(res, cx, top - h * 0.4, w * 2.2, [255, 140, 50], 0.9);
	},
	firebowl(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'rust');
		ctx.fillStyle = F(c, -10); ctx.fillRect(cx - w * 0.12, base - h * 0.45, w * 0.24, h * 0.45);
		flames(ctx, R, cx, base - h * 0.85, w * 0.5, h * 1.1, 9);
		ctx.fillStyle = grad(ctx, cx - w / 2, cx + w / 2, c, sun, 14);
		ctx.beginPath(); ctx.moveTo(cx - w / 2, base - h * 0.95); ctx.quadraticCurveTo(cx, base - h * 0.2, cx + w / 2, base - h * 0.95); ctx.closePath(); ctx.fill();
		glow(res, cx, base - h * 1.2, w * 2.2, [255, 140, 50], 0.9);
	},
	firetable(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'concrete');
		flames(ctx, R, cx, base - h, w * 0.5, h * 0.7, 10);
		ctx.fillStyle = grad(ctx, cx - w / 2, cx + w / 2, c, sun, 10); ctx.fillRect(cx - w / 2, base - h, w, h);
		ctx.fillStyle = F(c, 10); ctx.fillRect(cx - w / 2, base - h, w, h * 0.08);
		glow(res, cx, base - h * 1.2, w * 1.8, [255, 150, 60], 0.8);
	},
	chiminea(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'terracotta');
		ctx.fillStyle = '#222'; [-0.3, 0.3].forEach((t) => ctx.fillRect(cx + t * w - 1, base - h * 0.15, 2, h * 0.15));
		ctx.fillStyle = grad(ctx, cx - w / 2, cx + w / 2, c, sun, 14);
		ctx.beginPath(); ctx.ellipse(cx, base - h * 0.38, w / 2, h * 0.24, 0, 0, 7); ctx.fill();
		ctx.beginPath(); ctx.moveTo(cx - w * 0.15, base - h * 0.55); ctx.lineTo(cx - w * 0.1, base - h); ctx.lineTo(cx + w * 0.1, base - h); ctx.lineTo(cx + w * 0.15, base - h * 0.55); ctx.fill();
		ctx.fillStyle = '#2a1d16'; ctx.beginPath(); ctx.ellipse(cx, base - h * 0.38, w * 0.26, h * 0.12, 0, 0, 7); ctx.fill();
		flames(ctx, R, cx, base - h * 0.3, w * 0.3, h * 0.2, 6);
		glow(res, cx, base - h * 0.38, w * 2, [255, 140, 50], 0.8);
	},
	fireplace(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'field');
		ctx.fillStyle = grad(ctx, cx - w / 2, cx + w / 2, c, sun, 12);
		ctx.beginPath(); ctx.moveTo(cx - w / 2, base); ctx.lineTo(cx - w / 2, base - h * 0.55); ctx.lineTo(cx - w * 0.2, base - h * 0.7); ctx.lineTo(cx - w * 0.2, base - h); ctx.lineTo(cx + w * 0.2, base - h); ctx.lineTo(cx + w * 0.2, base - h * 0.7); ctx.lineTo(cx + w / 2, base - h * 0.55); ctx.lineTo(cx + w / 2, base); ctx.fill();
		speck(ctx, R, cx - w / 2, base - h, w, h, w * 2, 0.2, 0.12, w * 0.01);
		ctx.fillStyle = '#1e1510'; ctx.beginPath(); ctx.moveTo(cx - w * 0.28, base - h * 0.08); ctx.lineTo(cx - w * 0.28, base - h * 0.35); ctx.quadraticCurveTo(cx, base - h * 0.45, cx + w * 0.28, base - h * 0.35); ctx.lineTo(cx + w * 0.28, base - h * 0.08); ctx.fill();
		flames(ctx, R, cx, base - h * 0.08, w * 0.35, h * 0.25, 9);
		ctx.fillStyle = F([40, 12, 70], 0); ctx.fillRect(cx - w * 0.38, base - h * 0.08, w * 0.76, h * 0.08);
		glow(res, cx, base - h * 0.2, w * 1.6, [255, 140, 50], 0.9);
	},
	heater(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'steel');
		ctx.fillStyle = grad(ctx, cx - w * 0.2, cx + w * 0.2, c, sun);
		ctx.fillRect(cx - w * 0.2, base - h * 0.15, w * 0.4, h * 0.15);
		ctx.fillRect(cx - w * 0.04, base - h * 0.85, w * 0.08, h * 0.7);
		ctx.beginPath(); ctx.moveTo(cx - w * 0.5, base - h * 0.88); ctx.lineTo(cx, base - h); ctx.lineTo(cx + w * 0.5, base - h * 0.88); ctx.fill();
		ctx.fillStyle = 'rgba(255,120,40,.85)'; ctx.fillRect(cx - w * 0.07, base - h * 0.85, w * 0.14, h * 0.07);
		glow(res, cx, base - h * 0.8, w * 2.5, [255, 130, 50], 0.7);
	},
	birdbath(ctx, cx, base, w, h, R, sun, res, o) {
		const st = C(o, 'c', 'limestone');
		ctx.fillStyle = grad(ctx, cx - w / 2, cx + w / 2, st, sun);
		ctx.fillRect(cx - w * 0.3, base - h * 0.08, w * 0.6, h * 0.08);
		ctx.beginPath(); ctx.moveTo(cx - w * 0.12, base - h * 0.08); ctx.quadraticCurveTo(cx - w * 0.05, base - h * 0.5, cx - w * 0.14, base - h * 0.78);
		ctx.lineTo(cx + w * 0.14, base - h * 0.78); ctx.quadraticCurveTo(cx + w * 0.05, base - h * 0.5, cx + w * 0.12, base - h * 0.08); ctx.fill();
		ctx.beginPath(); ctx.ellipse(cx, base - h * 0.85, w * 0.5, h * 0.1, 0, 0, Math.PI); ctx.fill();
		ctx.fillStyle = F(st, 8); ctx.beginPath(); ctx.ellipse(cx, base - h * 0.85, w * 0.5, h * 0.06, 0, 0, 7); ctx.fill();
		water(ctx, cx, base - h * 0.85, w * 0.42, h * 0.04);
	},
	fountain(ctx, cx, base, w, h, R, sun, res, o) {
		const st = C(o, 'c', 'limestone');
		const three = o.v === 'three';
		const g = () => grad(ctx, cx - w / 2, cx + w / 2, st, sun);
		ctx.fillStyle = g();
		ctx.beginPath(); ctx.ellipse(cx, base - h * 0.14, w / 2, w * 0.12, 0, 0, Math.PI); ctx.lineTo(cx - w / 2, base - h * 0.24); ctx.ellipse(cx, base - h * 0.24, w / 2, w * 0.12, 0, Math.PI, 0); ctx.fill();
		water(ctx, cx, base - h * 0.24, w * 0.46, w * 0.09);
		const tiers = three ? [[0.62, 0.3], [0.86, 0.17]] : [[0.7, 0.28]];
		ctx.fillStyle = g(); ctx.fillRect(cx - w * 0.06, base - h * 0.92, w * 0.12, h * 0.7);
		for (const [ty, tw] of tiers) {
			ctx.fillStyle = g();
			ctx.beginPath(); ctx.ellipse(cx, base - h * ty, w * tw, w * 0.07, 0, 0, Math.PI); ctx.lineTo(cx - w * tw, base - h * (ty + 0.04)); ctx.ellipse(cx, base - h * (ty + 0.04), w * tw, w * 0.06, 0, Math.PI, 0); ctx.fill();
			water(ctx, cx, base - h * (ty + 0.04), w * tw * 0.85, w * 0.04);
		}
		ctx.strokeStyle = 'rgba(190,225,255,.75)'; ctx.lineWidth = Math.max(0.6, w * 0.012);
		for (let i = -3; i <= 3; i++) {
			ctx.beginPath(); ctx.moveTo(cx, base - h * 0.97); ctx.quadraticCurveTo(cx + i * w * 0.06, base - h * 1.04, cx + i * w * 0.08, base - h * (tiers[tiers.length - 1][0] + 0.02)); ctx.stroke();
			ctx.beginPath(); ctx.moveTo(cx + i * w * 0.08, base - h * (tiers[0][0] - 0.02)); ctx.quadraticCurveTo(cx + i * w * 0.12, base - h * 0.55, cx + i * w * 0.14, base - h * 0.27); ctx.stroke();
		}
		glow(res, cx, base - h * 0.4, w * 1.1, [150, 210, 255], 0.6);
	},
	urnfountain(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'glazeblue');
		ctx.fillStyle = grad(ctx, cx - w / 2, cx + w / 2, c, sun, 16);
		ctx.beginPath(); ctx.moveTo(cx - w * 0.2, base); ctx.quadraticCurveTo(cx - w * 0.6, base - h * 0.5, cx - w * 0.25, base - h * 0.95); ctx.lineTo(cx + w * 0.25, base - h * 0.95); ctx.quadraticCurveTo(cx + w * 0.6, base - h * 0.5, cx + w * 0.2, base); ctx.fill();
		ctx.fillStyle = 'rgba(190,225,255,.6)'; ctx.fillRect(cx - w * 0.22, base - h * 0.95, w * 0.44, h * 0.9);
		ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(cx - w * 0.3, base - h * 0.75, w * 0.05, h * 0.4);
		ctx.strokeStyle = 'rgba(220,240,255,.9)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx, base - h * 0.95); ctx.lineTo(cx, base - h * 1.05); ctx.stroke();
		glow(res, cx, base - h * 0.5, w * 1.2, [150, 210, 255], 0.5);
	},
	bubbler(ctx, cx, base, w, h, R, sun, res, o) {
		SIDE.boulder(ctx, cx, base, w, h * 0.9, R, sun, res, { c: o.c || 'field' });
		ctx.strokeStyle = 'rgba(200,235,255,.85)'; ctx.lineWidth = Math.max(1, w * 0.02);
		for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(cx, base - h * 0.9); ctx.quadraticCurveTo(cx + i * w * 0.08, base - h * 1.05, cx + i * w * 0.25, base - h * 0.6); ctx.stroke(); }
		glow(res, cx, base - h * 0.6, w * 1.4, [150, 210, 255], 0.5);
	},
	wallfountain(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'limestone');
		ctx.fillStyle = grad(ctx, cx - w / 2, cx + w / 2, c, sun, 10);
		ctx.fillRect(cx - w / 2, base - h, w, h);
		ctx.fillStyle = F(c, -10); ctx.beginPath(); ctx.arc(cx, base - h * 0.72, w * 0.12, 0, 7); ctx.fill();
		ctx.fillStyle = F(c, -4); ctx.beginPath(); ctx.ellipse(cx, base - h * 0.25, w * 0.42, h * 0.08, 0, 0, Math.PI); ctx.lineTo(cx - w * 0.42, base - h * 0.3); ctx.ellipse(cx, base - h * 0.3, w * 0.42, h * 0.05, 0, Math.PI, 0); ctx.fill();
		water(ctx, cx, base - h * 0.3, w * 0.38, h * 0.03);
		ctx.strokeStyle = 'rgba(200,235,255,.85)'; ctx.lineWidth = Math.max(1, w * 0.02); ctx.beginPath(); ctx.moveTo(cx, base - h * 0.68); ctx.quadraticCurveTo(cx + w * 0.05, base - h * 0.5, cx + w * 0.04, base - h * 0.32); ctx.stroke();
		glow(res, cx, base - h * 0.35, w, [150, 210, 255], 0.5);
	},
	pond(ctx, cx, base, w, h, R, sun, res, o) {
		const ry = Math.max(3, h * 1.4);
		ctx.fillStyle = F(C(o, 'c', 'field'), 0);
		lumpyPoly(ctx, cx, base - ry, w / 2, ry, R, 14); ctx.fill();
		water(ctx, cx, base - ry, w * 0.44, ry * 0.75);
		for (let i = 0; i < 18; i++) { const a = R() * 7; ctx.fillStyle = F([35, 10, 50 + R() * 20], 0); ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * w * 0.47, base - ry + Math.sin(a) * ry * 0.9, w * 0.04, ry * 0.12, 0, 0, 7); ctx.fill(); }
		ctx.fillStyle = 'hsl(120 40% 30%)'; ctx.beginPath(); ctx.ellipse(cx + w * 0.15, base - ry, w * 0.05, ry * 0.12, 0, 0, 7); ctx.fill();
		ctx.fillStyle = 'hsl(330 60% 80%)'; ctx.beginPath(); ctx.arc(cx + w * 0.15, base - ry - ry * 0.05, w * 0.015, 0, 7); ctx.fill();
		glow(res, cx, base - ry, w * 0.7, [150, 210, 255], 0.4);
	},
	waterfall(ctx, cx, base, w, h, R, sun, res, o) {
		SIDE.boulders(ctx, cx, base, w, h, R, sun, res, { c: o.c || 'field' });
		ctx.fillStyle = 'rgba(200,235,255,.8)'; ctx.fillRect(cx - w * 0.08, base - h * 0.85, w * 0.12, h * 0.75);
		water(ctx, cx, base - h * 0.08, w * 0.3, h * 0.06);
		glow(res, cx, base - h * 0.4, w * 0.8, [150, 210, 255], 0.5);
	},
	rainbarrel(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'green');
		ctx.fillStyle = grad(ctx, cx - w / 2, cx + w / 2, c, sun, 14);
		ctx.beginPath(); ctx.moveTo(cx - w * 0.42, base); ctx.quadraticCurveTo(cx - w * 0.55, base - h / 2, cx - w * 0.42, base - h); ctx.lineTo(cx + w * 0.42, base - h); ctx.quadraticCurveTo(cx + w * 0.55, base - h / 2, cx + w * 0.42, base); ctx.fill();
		ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1.5; [0.25, 0.75].forEach((t) => { ctx.beginPath(); ctx.moveTo(cx - w * 0.5, base - h * t); ctx.lineTo(cx + w * 0.5, base - h * t); ctx.stroke(); });
		ctx.fillStyle = '#b8b8b8'; ctx.fillRect(cx + w * 0.3, base - h * 0.2, w * 0.18, h * 0.05);
	},
	lamppost(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'black');
		const k = F(c, 0);
		const lantern = (x, y, s) => {
			ctx.fillStyle = k; ctx.fillRect(x - s * 0.3, y, s * 0.6, s * 0.06);
			ctx.fillStyle = 'rgba(255,236,190,.95)'; ctx.beginPath(); ctx.moveTo(x - s * 0.28, y); ctx.lineTo(x - s * 0.38, y - s * 0.4); ctx.lineTo(x + s * 0.38, y - s * 0.4); ctx.lineTo(x + s * 0.28, y); ctx.fill();
			ctx.fillStyle = k; ctx.beginPath(); ctx.moveTo(x - s * 0.45, y - s * 0.4); ctx.lineTo(x, y - s * 0.55); ctx.lineTo(x + s * 0.45, y - s * 0.4); ctx.fill();
			glow(res, x, y - s * 0.2, h * 1.1, [255, 215, 150], 1);
		};
		ctx.fillStyle = k;
		ctx.fillRect(cx - w * 0.06, base - h * 0.86, w * 0.12, h * 0.86);
		ctx.fillRect(cx - w * 0.18, base - h * 0.05, w * 0.36, h * 0.05);
		if (o.v === 'modern') { ctx.fillRect(cx - w * 0.15, base - h, w * 0.3, h * 0.14); ctx.fillStyle = 'rgba(255,236,190,.95)'; ctx.fillRect(cx - w * 0.12, base - h * 0.9, w * 0.24, h * 0.03); glow(res, cx, base - h * 0.88, h, [255, 225, 170], 1); return; }
		if (o.v === 'double') { ctx.fillRect(cx - w * 0.42, base - h * 0.84, w * 0.84, h * 0.02); lantern(cx - w * 0.38, base - h * 0.84, w * 0.45); lantern(cx + w * 0.38, base - h * 0.84, w * 0.45); return; }
		lantern(cx, base - h * 0.86, w);
	},
	pathlight(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'black'), k = F(c, 0);
		ctx.fillStyle = k;
		if (o.v === 'bollard') { ctx.fillRect(cx - w * 0.35, base - h, w * 0.7, h); ctx.fillStyle = 'rgba(255,236,190,.95)'; ctx.fillRect(cx - w * 0.33, base - h * 0.85, w * 0.66, h * 0.12); glow(res, cx, base - h * 0.4, h * 2, [255, 225, 170], 0.8, true); return; }
		ctx.fillRect(cx - w * 0.07, base - h * 0.8, w * 0.14, h * 0.8);
		if (o.v === 'lantern' || o.v === 'solar') {
			ctx.fillStyle = 'rgba(255,236,190,.92)'; ctx.fillRect(cx - w * 0.28, base - h * 0.98, w * 0.56, h * 0.18);
			ctx.fillStyle = k; ctx.fillRect(cx - w * 0.34, base - h, w * 0.68, h * 0.05); ctx.fillRect(cx - w * 0.3, base - h * 0.8, w * 0.6, h * 0.03);
		} else {
			ctx.fillStyle = 'rgba(255,236,190,.9)'; ctx.fillRect(cx - w * 0.18, base - h * 0.88, w * 0.36, h * 0.08);
			ctx.fillStyle = k; ctx.beginPath(); ctx.ellipse(cx, base - h * 0.9, w * 0.5, h * 0.08, 0, Math.PI, 0); ctx.fill();
		}
		glow(res, cx, base - h * 0.4, h * (o.v === 'solar' ? 1.6 : 2.4), [255, 220, 160], o.v === 'solar' ? 0.55 : 0.85, true);
	},
	torch(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'bamboo');
		ctx.fillStyle = F(c, 0); ctx.fillRect(cx - w * 0.12, base - h * 0.88, w * 0.24, h * 0.88);
		ctx.strokeStyle = F(c, -15); for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(cx - w * 0.12, base - h * i * 0.15); ctx.lineTo(cx + w * 0.12, base - h * i * 0.15); ctx.stroke(); }
		ctx.fillStyle = F(c, -10); ctx.beginPath(); ctx.moveTo(cx - w * 0.4, base - h * 0.95); ctx.lineTo(cx - w * 0.15, base - h * 0.86); ctx.lineTo(cx + w * 0.15, base - h * 0.86); ctx.lineTo(cx + w * 0.4, base - h * 0.95); ctx.fill();
		flames(ctx, R, cx, base - h * 0.95, w * 0.5, h * 0.12, 5);
		glow(res, cx, base - h, h * 0.8, [255, 150, 60], 0.8);
	},
	uplight(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'bronze');
		// ground stake + tilted cylindrical head with a glass lens
		ctx.fillStyle = F(c, -18); ctx.fillRect(cx - w * 0.06, base - h * 0.35, w * 0.12, h * 0.35);
		ctx.save(); ctx.translate(cx, base - h * 0.42); ctx.rotate(-0.35);
		ctx.fillStyle = grad(ctx, -w * 0.2, w * 0.2, c, sun, 16);
		ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-w * 0.17, -h * 0.5, w * 0.34, h * 0.62, w * 0.05) : ctx.rect(-w * 0.17, -h * 0.5, w * 0.34, h * 0.62); ctx.fill();
		ctx.fillStyle = 'rgba(255,236,190,0.95)'; ctx.beginPath(); ctx.ellipse(0, -h * 0.5, w * 0.17, h * 0.05, 0, 0, 7); ctx.fill();
		ctx.restore();
		// short leaves at the base so it reads as a garden fixture
		ctx.strokeStyle = 'rgba(70,110,50,0.9)'; ctx.lineWidth = Math.max(0.6, w * 0.03);
		for (let i = 0; i < 7; i++) { const t = (i / 6) * 2 - 1; ctx.beginPath(); ctx.moveTo(cx + t * w * 0.1, base); ctx.quadraticCurveTo(cx + t * w * 0.25, base - h * 0.2, cx + t * w * 0.45, base - h * (0.12 + R() * 0.12)); ctx.stroke(); }
		res.lights.push({ x: cx, y: base - h * 8, r: h * 10, col: [255, 225, 170], k: 0.7 });
	},
	stringlights(ctx, cx, base, w, h, R, sun, res, o) {
		ctx.fillStyle = F(C(o, 'c', 'black'), 0);
		ctx.fillRect(cx - w / 2, base - h, w * 0.02, h); ctx.fillRect(cx + w / 2 - w * 0.02, base - h, w * 0.02, h);
		ctx.strokeStyle = '#222'; ctx.lineWidth = 1;
		ctx.beginPath(); ctx.moveTo(cx - w / 2, base - h * 0.97); ctx.quadraticCurveTo(cx, base - h * 0.6, cx + w / 2, base - h * 0.97); ctx.stroke();
		for (let i = 1; i < 12; i++) {
			const t = i / 12, it = 1 - t;
			const x = it * it * (cx - w / 2) + 2 * it * t * cx + t * t * (cx + w / 2);
			const y = it * it * (base - h * 0.97) + 2 * it * t * (base - h * 0.6) + t * t * (base - h * 0.97);
			ctx.fillStyle = 'rgba(255,230,170,.95)'; ctx.beginPath(); ctx.arc(x, y + 3, Math.max(1.2, w * 0.006), 0, 7); ctx.fill();
			glow(res, x, y + 3, h * 0.35, [255, 215, 150], 0.45);
		}
	},
	hooklantern(ctx, cx, base, w, h, R, sun, res, o) {
		ctx.strokeStyle = F(C(o, 'c', 'black'), 0); ctx.lineWidth = Math.max(1, w * 0.05);
		ctx.beginPath(); ctx.moveTo(cx - w * 0.2, base); ctx.lineTo(cx - w * 0.2, base - h * 0.85); ctx.quadraticCurveTo(cx - w * 0.2, base - h, cx + w * 0.15, base - h * 0.95); ctx.stroke();
		ctx.fillStyle = 'rgba(255,236,190,.95)'; ctx.fillRect(cx + w * 0.05, base - h * 0.88, w * 0.3, h * 0.12);
		ctx.fillStyle = F(C(o, 'c', 'black'), 0); ctx.fillRect(cx + w * 0.02, base - h * 0.9, w * 0.36, h * 0.03); ctx.fillRect(cx + w * 0.02, base - h * 0.76, w * 0.36, h * 0.02);
		glow(res, cx + w * 0.2, base - h * 0.82, h * 0.8, [255, 215, 150], 0.8);
	},
	planter(ctx, cx, base, w, h, R, sun, res, o) {
		const urn = C(o, 'c', 'limestone');
		ctx.fillStyle = grad(ctx, cx - w / 2, cx + w / 2, urn, sun, 14);
		ctx.fillRect(cx - w * 0.22, base - h * 0.08, w * 0.44, h * 0.08);
		ctx.beginPath(); ctx.moveTo(cx - w * 0.1, base - h * 0.08); ctx.lineTo(cx - w * 0.12, base - h * 0.2);
		ctx.quadraticCurveTo(cx - w * 0.42, base - h * 0.3, cx - w * 0.38, base - h * 0.55); ctx.lineTo(cx + w * 0.38, base - h * 0.55);
		ctx.quadraticCurveTo(cx + w * 0.42, base - h * 0.3, cx + w * 0.12, base - h * 0.2); ctx.lineTo(cx + w * 0.1, base - h * 0.08); ctx.fill();
		flowersOn(ctx, R, cx, base - h * 0.72, w * 0.45, h * 0.2, C(o, 'c2', 'pink'), 30, Math.max(1, w * 0.045));
		for (let i = 0; i < 6; i++) {
			const t = R() * 2 - 1;
			ctx.strokeStyle = F([95, 50, 38], (R() - 0.5) * 10); ctx.lineWidth = Math.max(0.6, w * 0.02);
			ctx.beginPath(); ctx.moveTo(cx + t * w * 0.35, base - h * 0.56); ctx.quadraticCurveTo(cx + t * w * 0.6, base - h * 0.5, cx + t * w * 0.55, base - h * (0.25 + R() * 0.2)); ctx.stroke();
		}
	},
	pot(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'terracotta');
		const tall = o.v === 'tall', jar = o.v === 'jar';
		const ph = tall ? h * 0.75 : h * 0.6;
		ctx.fillStyle = grad(ctx, cx - w / 2, cx + w / 2, c, sun, 14);
		ctx.beginPath();
		if (tall) { ctx.moveTo(cx - w * 0.38, base); ctx.lineTo(cx - w * 0.45, base - ph); ctx.lineTo(cx + w * 0.45, base - ph); ctx.lineTo(cx + w * 0.38, base); }
		else if (jar) { ctx.moveTo(cx - w * 0.3, base); ctx.quadraticCurveTo(cx - w * 0.6, base - ph * 0.5, cx - w * 0.28, base - ph); ctx.lineTo(cx + w * 0.28, base - ph); ctx.quadraticCurveTo(cx + w * 0.6, base - ph * 0.5, cx + w * 0.3, base); }
		else { ctx.moveTo(cx - w * 0.32, base); ctx.lineTo(cx - w * 0.42, base - ph * 0.85); ctx.lineTo(cx + w * 0.42, base - ph * 0.85); ctx.lineTo(cx + w * 0.32, base); }
		ctx.fill();
		if (!tall && !jar) { ctx.fillStyle = F(c, 6); ctx.fillRect(cx - w * 0.47, base - ph, w * 0.94, ph * 0.18); }
		if (jar) for (let i = 0; i < 3; i++) { ctx.fillStyle = F(c, -14); ctx.beginPath(); ctx.ellipse(cx + (i - 1) * w * 0.25, base - ph * (0.35 + (i % 2) * 0.2), w * 0.08, ph * 0.06, 0, 0, 7); ctx.fill(); }
		const fc = C(o, 'c2', 'red');
		if (o.c2 === 'grass') {
			for (let i = 0; i < 40; i++) { const t = R() * 2 - 1; ctx.strokeStyle = F([95, 40, 40 + R() * 15], 0); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx + t * w * 0.2, base - ph); ctx.quadraticCurveTo(cx + t * w * 0.3, base - h * 0.9, cx + t * w * 0.6, base - ph - (h - ph) * (0.5 + R() * 0.5)); ctx.stroke(); }
		} else flowersOn(ctx, R, cx, base - ph - (h - ph) * 0.45, w * 0.45, (h - ph) * 0.55, fc, 26, Math.max(1, w * 0.05));
	},
	windowbox(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'white');
		ctx.fillStyle = F(c, -10); [-0.4, 0.4].forEach((t) => ctx.fillRect(cx + t * w - w * 0.02, base - h * 0.5, w * 0.04, h * 0.5));
		ctx.fillStyle = grad(ctx, cx - w / 2, cx + w / 2, c, sun, 8); ctx.fillRect(cx - w / 2, base - h * 0.75, w, h * 0.28);
		flowersOn(ctx, R, cx, base - h * 0.85, w * 0.5, h * 0.15, C(o, 'c2', 'pink'), 40, Math.max(1, w * 0.02));
		for (let i = 0; i < 8; i++) { const x = cx + (R() - 0.5) * w; ctx.strokeStyle = 'hsl(100 45% 35%)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, base - h * 0.75); ctx.quadraticCurveTo(x + 3, base - h * 0.6, x, base - h * (0.45 + R() * 0.15)); ctx.stroke(); }
	},
	barrel(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'oak');
		const bh = h * 0.55;
		ctx.fillStyle = grad(ctx, cx - w / 2, cx + w / 2, c, sun, 12);
		ctx.beginPath(); ctx.moveTo(cx - w * 0.42, base); ctx.quadraticCurveTo(cx - w * 0.52, base - bh / 2, cx - w * 0.46, base - bh); ctx.lineTo(cx + w * 0.46, base - bh); ctx.quadraticCurveTo(cx + w * 0.52, base - bh / 2, cx + w * 0.42, base); ctx.fill();
		ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1; for (let i = 1; i < 7; i++) { const x = cx - w * 0.45 + i * w * 0.13; ctx.beginPath(); ctx.moveTo(x, base); ctx.lineTo(x, base - bh); ctx.stroke(); }
		ctx.fillStyle = '#3d3d3d'; [0.2, 0.8].forEach((t) => ctx.fillRect(cx - w * 0.5, base - bh * t, w, bh * 0.07));
		flowersOn(ctx, R, cx, base - bh - (h - bh) * 0.45, w * 0.48, (h - bh) * 0.5, C(o, 'c2', 'yellow'), 30, Math.max(1, w * 0.045));
	},
	raisedbed(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'cedar');
		const top = base - h, depth = h * 0.5;
		ctx.fillStyle = F(c, 8);
		ctx.beginPath(); ctx.moveTo(cx - w / 2, top + depth); ctx.lineTo(cx - w / 2 + depth, top); ctx.lineTo(cx + w / 2 - depth, top); ctx.lineTo(cx + w / 2, top + depth); ctx.fill();
		ctx.fillStyle = 'hsl(25 35% 20%)';
		ctx.beginPath(); ctx.moveTo(cx - w / 2 + depth * 0.4, top + depth * 0.85); ctx.lineTo(cx - w / 2 + depth * 1.05, top + depth * 0.2); ctx.lineTo(cx + w / 2 - depth * 1.05, top + depth * 0.2); ctx.lineTo(cx + w / 2 - depth * 0.4, top + depth * 0.85); ctx.fill();
		for (let i = 0; i < 9; i++) {
			const px = cx - w * 0.36 + (i / 8) * w * 0.72, py = top + depth * 0.55;
			ctx.fillStyle = F([95 + R() * 30, 50, 34], 0);
			for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.arc(px + (R() - 0.5) * w * 0.06, py - h * (0.1 + R() * 0.35), Math.max(1, w * 0.018), 0, 7); ctx.fill(); }
			if (i % 3 === 1) { ctx.fillStyle = 'hsl(5 80% 48%)'; ctx.beginPath(); ctx.arc(px, py - h * 0.25, Math.max(1, w * 0.012), 0, 7); ctx.fill(); }
		}
		for (let i = 0; i < 3; i++) box(ctx, cx - w / 2, top + depth + (i * (h - depth)) / 3, w, (h - depth) / 3 - 0.5, F(c, -i * 4));
		if (o.c === 'galv') { ctx.strokeStyle = 'rgba(0,0,0,.15)'; for (let x = cx - w / 2; x < cx + w / 2; x += Math.max(3, w * 0.03)) { ctx.beginPath(); ctx.moveTo(x, top + depth); ctx.lineTo(x, base); ctx.stroke(); } }
		if (o.c === 'field') speck(ctx, R, cx - w / 2, top + depth, w, h - depth, w, 0.25, 0.15, w * 0.01);
	},
	basket(ctx, cx, base, w, h, R, sun, res, o) {
		ctx.strokeStyle = F(C(o, 'c', 'black'), 0); ctx.lineWidth = Math.max(1, w * 0.04);
		ctx.beginPath(); ctx.moveTo(cx - w * 0.3, base); ctx.lineTo(cx - w * 0.3, base - h * 0.95); ctx.quadraticCurveTo(cx - w * 0.3, base - h, cx + w * 0.05, base - h * 0.95); ctx.stroke();
		ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx + w * 0.05, base - h * 0.95); ctx.lineTo(cx - w * 0.15, base - h * 0.72); ctx.moveTo(cx + w * 0.05, base - h * 0.95); ctx.lineTo(cx + w * 0.25, base - h * 0.72); ctx.stroke();
		ctx.fillStyle = '#4a3a2a'; ctx.beginPath(); ctx.ellipse(cx + w * 0.05, base - h * 0.68, w * 0.25, h * 0.06, 0, 0, Math.PI); ctx.fill();
		flowersOn(ctx, R, cx + w * 0.05, base - h * 0.66, w * 0.4, h * 0.14, C(o, 'c2', 'pink'), 34, Math.max(1, w * 0.05));
	},
	trough(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'limestone');
		ctx.fillStyle = grad(ctx, cx - w / 2, cx + w / 2, c, sun, 10); ctx.fillRect(cx - w / 2, base - h * 0.6, w, h * 0.6);
		speck(ctx, R, cx - w / 2, base - h * 0.6, w, h * 0.6, w * 0.5, 0.2, 0.1, w * 0.008);
		for (let i = 0; i < 9; i++) { const x = cx - w * 0.4 + i * w * 0.1; const g = ctx.createRadialGradient(x, base - h * 0.7, 0, x, base - h * 0.7, w * 0.06); g.addColorStop(0, 'hsl(150 30% 65%)'); g.addColorStop(1, 'hsl(160 25% 40%)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, base - h * 0.68, w * 0.055, 0, 7); ctx.fill(); }
	},
	wheelbarrow(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'red');
		ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(cx + w * 0.32, base - h * 0.2, h * 0.2, 0, 7); ctx.fill();
		ctx.strokeStyle = '#555'; ctx.lineWidth = Math.max(1, w * 0.012);
		ctx.beginPath(); ctx.moveTo(cx - w * 0.5, base - h * 0.45); ctx.lineTo(cx + w * 0.32, base - h * 0.2); ctx.moveTo(cx - w * 0.25, base); ctx.lineTo(cx - w * 0.2, base - h * 0.35); ctx.stroke();
		ctx.fillStyle = grad(ctx, cx - w * 0.3, cx + w * 0.3, c, sun, 12);
		ctx.beginPath(); ctx.moveTo(cx - w * 0.3, base - h * 0.6); ctx.lineTo(cx + w * 0.3, base - h * 0.6); ctx.lineTo(cx + w * 0.15, base - h * 0.3); ctx.lineTo(cx - w * 0.2, base - h * 0.3); ctx.fill();
		flowersOn(ctx, R, cx, base - h * 0.72, w * 0.3, h * 0.18, C(o, 'c2', 'yellow'), 30, Math.max(1, w * 0.025));
	},
	arbor(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'white');
		const metal = o.v === 'metal';
		ctx.fillStyle = F(c, -4);
		const pw = metal ? 0.02 : 0.06;
		[-0.5, -0.38, 0.38, 0.5].forEach((t) => ctx.fillRect(cx + t * w - w * pw / 2, base - h * 0.78, w * pw, h * 0.78));
		ctx.strokeStyle = F(c, 0); ctx.lineWidth = Math.max(1, w * (metal ? 0.025 : 0.05));
		ctx.beginPath(); ctx.ellipse(cx, base - h * 0.78, w * 0.5, h * 0.2, 0, Math.PI, 0); ctx.stroke();
		ctx.beginPath(); ctx.ellipse(cx, base - h * 0.78, w * 0.38, h * 0.14, 0, Math.PI, 0); ctx.stroke();
		ctx.lineWidth = Math.max(0.6, w * 0.015);
		for (let y = 0.15; y < 0.75; y += 0.08) [-0.44, 0.44].forEach((t) => { ctx.beginPath(); ctx.moveTo(cx + t * w - w * 0.06, base - h * y); ctx.lineTo(cx + t * w + w * 0.06, base - h * y); ctx.stroke(); });
		if (o.v === 'bench') { ctx.fillStyle = F(c, 6); ctx.fillRect(cx - w * 0.38, base - h * 0.22, w * 0.76, h * 0.04); ctx.fillRect(cx - w * 0.38, base - h * 0.4, w * 0.76, h * 0.03); }
		const pts = [];
		for (let i = 0; i < 70; i++) { const a = Math.PI + R() * Math.PI; pts.push([cx + Math.cos(a) * w * 0.44 + (R() - 0.5) * w * 0.08, base - h * 0.78 + Math.sin(a) * h * 0.17 + (R() - 0.5) * h * 0.05]); }
		for (let i = 0; i < 40; i++) { const t = R() < 0.5 ? -0.44 : 0.44; pts.push([cx + t * w + (R() - 0.5) * w * 0.1, base - h * (0.3 + R() * 0.5)]); }
		pts.forEach((p) => { ctx.fillStyle = F([110, 40, 28], (R() - 0.5) * 14); ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(0.8, w * 0.025), 0, 7); ctx.fill(); });
		pts.filter(() => R() < 0.35).forEach((p) => { ctx.fillStyle = F([350, 70, 62], (R() - 0.5) * 10); ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(0.8, w * 0.022), 0, 7); ctx.fill(); });
	},
	pergola(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'cedar');
		ctx.fillStyle = grad(ctx, cx - w / 2, cx + w / 2, c, sun, 8);
		[-0.45, 0.42].forEach((t) => ctx.fillRect(cx + t * w, base - h * 0.85, w * 0.035, h * 0.85));
		ctx.fillStyle = F(c, -4); ctx.fillRect(cx - w * 0.5, base - h * 0.88, w, h * 0.04);
		ctx.fillStyle = F(c, 4);
		for (let i = 0; i < 11; i++) { const x = cx - w * 0.5 + i * w * 0.1; ctx.fillRect(x, base - h, w * 0.025, h * 0.12); }
		ctx.fillRect(cx - w * 0.52, base - h * 0.92, w * 1.04, h * 0.03);
	},
	gazebo(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'white'), r = C(o, 'c2', 'roof');
		ctx.fillStyle = F(c, -6); ctx.fillRect(cx - w * 0.42, base - h * 0.08, w * 0.84, h * 0.08);
		for (let i = 0; i < 5; i++) ctx.fillRect(cx - w * 0.4 + i * w * 0.2 - w * 0.015, base - h * 0.62, w * 0.03, h * 0.55);
		ctx.fillRect(cx - w * 0.42, base - h * 0.3, w * 0.84, h * 0.025);
		for (let i = 0; i < 17; i++) ctx.fillRect(cx - w * 0.4 + i * w * 0.05, base - h * 0.3, w * 0.008, h * 0.22);
		ctx.fillStyle = grad(ctx, cx - w / 2, cx + w / 2, r, sun, 10);
		ctx.beginPath(); ctx.moveTo(cx - w * 0.52, base - h * 0.6); ctx.lineTo(cx, base - h * 0.95); ctx.lineTo(cx + w * 0.52, base - h * 0.6); ctx.fill();
		ctx.fillStyle = F(c, 0); ctx.fillRect(cx - w * 0.02, base - h, w * 0.04, h * 0.06);
	},
	shed(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'red'), t = C(o, 'c2', 'white');
		ctx.fillStyle = grad(ctx, cx - w / 2, cx + w / 2, c, sun, 8); ctx.fillRect(cx - w * 0.45, base - h * 0.65, w * 0.9, h * 0.65);
		ctx.strokeStyle = 'rgba(0,0,0,.12)'; for (let x = cx - w * 0.45; x < cx + w * 0.45; x += Math.max(3, w * 0.04)) { ctx.beginPath(); ctx.moveTo(x, base - h * 0.65); ctx.lineTo(x, base); ctx.stroke(); }
		ctx.fillStyle = F([210, 8, 28], 0); ctx.beginPath(); ctx.moveTo(cx - w * 0.52, base - h * 0.62); ctx.lineTo(cx, base - h); ctx.lineTo(cx + w * 0.52, base - h * 0.62); ctx.fill();
		ctx.fillStyle = F(t, 0); ctx.fillRect(cx - w * 0.16, base - h * 0.48, w * 0.32, h * 0.48);
		ctx.fillStyle = F(c, -4); ctx.fillRect(cx - w * 0.14, base - h * 0.46, w * 0.13, h * 0.46); ctx.fillRect(cx + w * 0.01, base - h * 0.46, w * 0.13, h * 0.46);
		ctx.strokeStyle = F(t, 0); ctx.lineWidth = Math.max(1, w * 0.012);
		ctx.beginPath(); ctx.moveTo(cx - w * 0.14, base - h * 0.46); ctx.lineTo(cx - w * 0.01, base); ctx.moveTo(cx + w * 0.01, base); ctx.lineTo(cx + w * 0.14, base - h * 0.46); ctx.stroke();
		ctx.fillStyle = '#9fc3d8'; ctx.fillRect(cx + w * 0.24, base - h * 0.5, w * 0.12, h * 0.14); ctx.fillRect(cx - w * 0.36, base - h * 0.5, w * 0.12, h * 0.14);
	},
	trellis(ctx, cx, base, w, h, R, sun, res, o) {
		ctx.strokeStyle = F(C(o, 'c', 'white'), 0); ctx.lineWidth = Math.max(1, w * 0.03);
		for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(cx + i * w * 0.02, base); ctx.lineTo(cx + i * w * 0.15, base - h); ctx.stroke(); }
		for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.arc(cx, base, h * k * 0.25, Math.PI * 1.28, Math.PI * 1.72); ctx.stroke(); }
	},
	obelisk(ctx, cx, base, w, h, R, sun, res, o) {
		ctx.strokeStyle = F(C(o, 'c', 'black'), 0); ctx.lineWidth = Math.max(1, w * 0.04);
		ctx.beginPath(); ctx.moveTo(cx - w / 2, base); ctx.lineTo(cx, base - h); ctx.lineTo(cx + w / 2, base); ctx.moveTo(cx - w * 0.15, base); ctx.lineTo(cx, base - h); ctx.lineTo(cx + w * 0.15, base); ctx.stroke();
		for (let k = 1; k < 5; k++) { const y = base - h * k * 0.2, hw = (w / 2) * (1 - k * 0.2); ctx.beginPath(); ctx.moveTo(cx - hw, y); ctx.lineTo(cx + hw, y); ctx.stroke(); }
		ctx.fillStyle = F(C(o, 'c', 'black'), 0); ctx.beginPath(); ctx.arc(cx, base - h, w * 0.06, 0, 7); ctx.fill();
	},
	greenhouse(ctx, cx, base, w, h, R, sun, res, o) {
		ctx.fillStyle = 'rgba(200,230,235,.55)';
		ctx.beginPath(); ctx.moveTo(cx - w * 0.45, base); ctx.lineTo(cx - w * 0.45, base - h * 0.6); ctx.lineTo(cx, base - h); ctx.lineTo(cx + w * 0.45, base - h * 0.6); ctx.lineTo(cx + w * 0.45, base); ctx.fill();
		ctx.strokeStyle = F(C(o, 'c', 'white'), 0); ctx.lineWidth = Math.max(1, w * 0.012); ctx.stroke();
		for (let i = 1; i < 6; i++) { const x = cx - w * 0.45 + i * w * 0.15; ctx.beginPath(); ctx.moveTo(x, base); ctx.lineTo(x, base - h * (0.6 + (1 - Math.abs(x - cx) / (w * 0.45)) * 0.4)); ctx.stroke(); }
		ctx.beginPath(); ctx.moveTo(cx - w * 0.45, base - h * 0.3); ctx.lineTo(cx + w * 0.45, base - h * 0.3); ctx.stroke();
		for (let i = 0; i < 14; i++) { ctx.fillStyle = F([110, 45, 30 + R() * 15], 0, 0.8); ctx.beginPath(); ctx.arc(cx + (R() - 0.5) * w * 0.8, base - h * (0.15 + R() * 0.25), w * 0.03, 0, 7); ctx.fill(); }
	},
	swingset(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'cedar');
		ctx.strokeStyle = F(c, -4); ctx.lineWidth = Math.max(1.5, w * 0.018);
		[-1, 1].forEach((s) => { ctx.beginPath(); ctx.moveTo(cx + s * w * 0.5, base); ctx.lineTo(cx + s * w * 0.42, base - h); ctx.moveTo(cx + s * w * 0.34, base); ctx.lineTo(cx + s * w * 0.42, base - h); ctx.stroke(); });
		ctx.fillStyle = F(c, 4); ctx.fillRect(cx - w * 0.45, base - h, w * 0.9, h * 0.04);
		ctx.strokeStyle = '#555'; ctx.lineWidth = 1;
		[-0.2, 0.15].forEach((t) => { ctx.beginPath(); ctx.moveTo(cx + t * w - w * 0.04, base - h * 0.97); ctx.lineTo(cx + t * w - w * 0.04, base - h * 0.25); ctx.moveTo(cx + t * w + w * 0.04, base - h * 0.97); ctx.lineTo(cx + t * w + w * 0.04, base - h * 0.25); ctx.stroke(); ctx.fillStyle = t < 0 ? '#2f7d4a' : '#2f5d9d'; ctx.fillRect(cx + t * w - w * 0.05, base - h * 0.26, w * 0.1, h * 0.03); });
	},
	playhouse(ctx, cx, base, w, h, R, sun, res, o) {
		SIDE.shed(ctx, cx, base, w, h, R, sun, res, { c: o.c || 'yellow', c2: o.c2 || 'white' });
		ctx.fillStyle = '#fff'; ctx.fillRect(cx - w * 0.45, base - h * 0.08, w * 0.9, h * 0.08);
	},
	coop(ctx, cx, base, w, h, R, sun, res, o) {
		SIDE.shed(ctx, cx - w * 0.2, base - h * 0.2, w * 0.55, h * 0.8, R, sun, res, o);
		ctx.strokeStyle = '#777'; ctx.lineWidth = 1;
		for (let x = cx + w * 0.08; x < cx + w * 0.5; x += Math.max(2, w * 0.03)) { ctx.beginPath(); ctx.moveTo(x, base); ctx.lineTo(x, base - h * 0.45); ctx.stroke(); }
		ctx.strokeRect(cx + w * 0.08, base - h * 0.45, w * 0.42, h * 0.45);
		ctx.fillStyle = F(C(o, 'c2', 'white'), 0); ctx.fillRect(cx - w * 0.47, base - h * 0.2, w * 0.03, h * 0.2); ctx.fillRect(cx + w * 0.05, base - h * 0.2, w * 0.03, h * 0.2);
		ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(cx + w * 0.3, base - h * 0.06, w * 0.05, h * 0.05, 0, 0, 7); ctx.fill();
	},
	gate(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'white');
		ctx.fillStyle = F(c, -6); [-0.5, 0.45].forEach((t) => ctx.fillRect(cx + t * w, base - h, w * 0.06, h));
		ctx.fillStyle = F(c, 0);
		ctx.fillRect(cx - w * 0.42, base - h * 0.75, w * 0.84, h * 0.05); ctx.fillRect(cx - w * 0.42, base - h * 0.3, w * 0.84, h * 0.05);
		for (let i = 0; i < 9; i++) { const x = cx - w * 0.4 + i * w * 0.1; const top = base - h * (0.8 + Math.sin((i / 8) * Math.PI) * 0.12); ctx.beginPath(); ctx.moveTo(x, base - h * 0.05); ctx.lineTo(x, top); ctx.lineTo(x + w * 0.03, top - h * 0.04); ctx.lineTo(x + w * 0.06, top); ctx.lineTo(x + w * 0.06, base - h * 0.05); ctx.fill(); }
	},
	mailbox(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'white'), b = C(o, 'c2', 'black');
		ctx.fillStyle = F(c, -4); ctx.fillRect(cx - w * 0.08, base - h * 0.8, w * 0.16, h * 0.8);
		ctx.fillRect(cx - w * 0.1, base - h * 0.78, w * 0.6, h * 0.06);
		ctx.fillStyle = grad(ctx, cx - w * 0.5, cx + w * 0.5, b, sun, 12);
		ctx.beginPath(); ctx.moveTo(cx - w * 0.5, base - h * 0.8); ctx.lineTo(cx - w * 0.5, base - h * 0.95); ctx.quadraticCurveTo(cx, base - h * 1.05, cx + w * 0.5, base - h * 0.95); ctx.lineTo(cx + w * 0.5, base - h * 0.8); ctx.fill();
		ctx.fillStyle = '#d43'; ctx.fillRect(cx + w * 0.35, base - h * 1.02, w * 0.04, h * 0.12);
	},
	bridge(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'cedar');
		ctx.fillStyle = grad(ctx, cx - w / 2, cx + w / 2, c, sun, 8);
		ctx.beginPath(); ctx.moveTo(cx - w / 2, base); ctx.quadraticCurveTo(cx, base - h * 0.75, cx + w / 2, base); ctx.lineTo(cx + w * 0.45, base); ctx.quadraticCurveTo(cx, base - h * 0.6, cx - w * 0.45, base); ctx.fill();
		ctx.strokeStyle = F(c, -6); ctx.lineWidth = Math.max(1, w * 0.012);
		ctx.beginPath(); ctx.moveTo(cx - w * 0.45, base - h * 0.35); ctx.quadraticCurveTo(cx, base - h * 1.1, cx + w * 0.45, base - h * 0.35); ctx.stroke();
		for (let i = 0; i <= 8; i++) { const t = i / 8, x = cx - w * 0.45 + t * w * 0.9; const yb = base - (1 - Math.pow(2 * t - 1, 2)) * h * 0.37; const yt = base - h * 0.35 - (1 - Math.pow(2 * t - 1, 2)) * h * 0.37; ctx.beginPath(); ctx.moveTo(x, yb); ctx.lineTo(x, yt); ctx.stroke(); }
	},
	doghouse(ctx, cx, base, w, h, R, sun, res, o) {
		SIDE.shed(ctx, cx, base, w, h, R, sun, res, o);
		ctx.fillStyle = '#1b1410'; ctx.beginPath(); ctx.moveTo(cx - w * 0.16, base); ctx.lineTo(cx - w * 0.16, base - h * 0.3); ctx.arc(cx, base - h * 0.3, w * 0.16, Math.PI, 0); ctx.lineTo(cx + w * 0.16, base); ctx.fill();
	},
	fence(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'white');
		const v = o.v || 'picket';
		if (v === 'splitrail') {
			ctx.fillStyle = F(c, -8); [-0.48, 0, 0.48].forEach((t) => ctx.fillRect(cx + t * w - w * 0.02, base - h, w * 0.04, h));
			ctx.fillStyle = F(c, 4); [0.35, 0.75].forEach((y) => { ctx.beginPath(); ctx.moveTo(cx - w * 0.5, base - h * y); ctx.lineTo(cx + w * 0.5, base - h * (y + 0.04)); ctx.lineTo(cx + w * 0.5, base - h * (y - 0.06)); ctx.lineTo(cx - w * 0.5, base - h * (y - 0.08)); ctx.fill(); });
			return;
		}
		if (v === 'aluminum') {
			ctx.fillStyle = F(c, 0);
			ctx.fillRect(cx - w * 0.5, base - h * 0.85, w, h * 0.03); ctx.fillRect(cx - w * 0.5, base - h * 0.15, w, h * 0.03);
			for (let i = 0; i <= 24; i++) { const x = cx - w * 0.5 + (i / 24) * w; ctx.fillRect(x - 0.5, base - h, Math.max(1, w * 0.006), h); ctx.beginPath(); ctx.moveTo(x - 2, base - h); ctx.lineTo(x, base - h - 4); ctx.lineTo(x + 2, base - h); ctx.fill(); }
			ctx.fillRect(cx - w * 0.5, base - h, w * 0.02, h); ctx.fillRect(cx + w * 0.48, base - h, w * 0.02, h);
			return;
		}
		if (v === 'lattice') {
			ctx.fillStyle = F(c, -2); ctx.fillRect(cx - w / 2, base - h, w * 0.04, h); ctx.fillRect(cx + w * 0.46, base - h, w * 0.04, h);
			ctx.strokeStyle = F(c, 0); ctx.lineWidth = Math.max(1, w * 0.01);
			ctx.save(); ctx.beginPath(); ctx.rect(cx - w / 2, base - h, w, h); ctx.clip();
			for (let k = -h; k < w + h; k += Math.max(4, w * 0.06)) { ctx.beginPath(); ctx.moveTo(cx - w / 2 + k, base); ctx.lineTo(cx - w / 2 + k - h, base - h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx - w / 2 + k, base); ctx.lineTo(cx - w / 2 + k + h, base - h); ctx.stroke(); }
			ctx.restore();
			ctx.fillStyle = F(c, 4); ctx.fillRect(cx - w / 2, base - h, w, h * 0.04);
			return;
		}
		if (v === 'privacy' || v === 'stockade') {
			const n = Math.max(8, Math.round(w / (h * 0.09)));
			for (let i = 0; i < n; i++) {
				const x = cx - w / 2 + (i / n) * w, bw = w / n;
				ctx.fillStyle = F(c, (i % 3) * 2 - 2 + (R() - 0.5) * 3);
				if (v === 'stockade') { ctx.beginPath(); ctx.moveTo(x, base); ctx.lineTo(x, base - h * 0.95); ctx.lineTo(x + bw / 2, base - h); ctx.lineTo(x + bw, base - h * 0.95); ctx.lineTo(x + bw, base); ctx.fill(); }
				else ctx.fillRect(x, base - h, bw - 0.6, h);
			}
			if (v === 'privacy') { ctx.fillStyle = F(c, -10); ctx.fillRect(cx - w / 2, base - h, w, h * 0.04); }
			return;
		}
		const n = Math.max(6, Math.round(w / (h * 0.16)));
		ctx.fillStyle = F(c, -8);
		ctx.fillRect(cx - w / 2, base - h * 0.72, w, h * 0.06); ctx.fillRect(cx - w / 2, base - h * 0.3, w, h * 0.06);
		for (let i = 0; i < n; i++) {
			const x = cx - w / 2 + (i + 0.5) * (w / n), pw = (w / n) * 0.55;
			ctx.fillStyle = F(c, i % 2 ? 0 : -3);
			ctx.beginPath(); ctx.moveTo(x - pw / 2, base); ctx.lineTo(x - pw / 2, base - h * 0.88); ctx.lineTo(x, base - h); ctx.lineTo(x + pw / 2, base - h * 0.88); ctx.lineTo(x + pw / 2, base); ctx.fill();
		}
	},
	wall(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'field');
		const v = o.v;
		ctx.fillStyle = grad(ctx, cx - w / 2, cx + w / 2, c, sun, 6); ctx.fillRect(cx - w / 2, base - h, w, h);
		ctx.save(); ctx.beginPath(); ctx.rect(cx - w / 2, base - h, w, h); ctx.clip();
		if (v === 'dry' || v === 'gabion') {
			const rows = Math.max(3, Math.round(h / (w * 0.06)));
			for (let r = 0; r < rows; r++) {
				let x = cx - w / 2 - R() * w * 0.05;
				const y = base - h + (r / rows) * h, rh = h / rows;
				while (x < cx + w / 2) {
					const sw = rh * (1.2 + R() * 1.8);
					ctx.fillStyle = F([c[0] + (R() - 0.5) * 14, c[1], c[2] + (R() - 0.5) * 18], 0);
					lumpyPoly(ctx, x + sw / 2, y + rh / 2, sw / 2 - 0.8, rh / 2 - 0.8, R, 7); ctx.fill();
					x += sw;
				}
			}
			if (v === 'gabion') { ctx.strokeStyle = 'rgba(80,80,80,.8)'; ctx.lineWidth = 1; const s = Math.max(4, h * 0.12); for (let x = cx - w / 2; x < cx + w / 2; x += s) { ctx.beginPath(); ctx.moveTo(x, base - h); ctx.lineTo(x, base); ctx.stroke(); } for (let y = base - h; y < base; y += s) { ctx.beginPath(); ctx.moveTo(cx - w / 2, y); ctx.lineTo(cx + w / 2, y); ctx.stroke(); } }
		} else {
			const rh = v === 'brick' ? Math.max(3, h / 12) : Math.max(4, h / 4);
			const bw = v === 'brick' ? rh * 2.6 : rh * 2.2;
			ctx.strokeStyle = v === 'brick' ? 'rgba(230,220,200,.85)' : 'rgba(0,0,0,.3)'; ctx.lineWidth = Math.max(0.6, rh * 0.1);
			for (let y = base - h, r = 0; y < base; y += rh, r++) {
				ctx.beginPath(); ctx.moveTo(cx - w / 2, y); ctx.lineTo(cx + w / 2, y); ctx.stroke();
				for (let x = cx - w / 2 - (r % 2) * bw / 2; x < cx + w / 2; x += bw) {
					ctx.fillStyle = `rgba(${R() < 0.5 ? '0,0,0' : '255,255,255'},${R() * 0.08})`; ctx.fillRect(x, y, bw, rh);
					ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + rh); ctx.stroke();
				}
			}
			ctx.fillStyle = F(c, 10); ctx.fillRect(cx - w / 2, base - h, w, rh * 0.35);
		}
		ctx.restore();
	},
	pillar(ctx, cx, base, w, h, R, sun, res, o) {
		SIDE.wall(ctx, cx, base, w * 0.8, h * 0.92, R, sun, res, { c: o.c, v: 'dry' });
		ctx.fillStyle = F(C(o, 'c', 'field'), 12); ctx.fillRect(cx - w / 2, base - h, w, h * 0.08);
	},
	gnome(ctx, cx, base, w, h, R, sun, res, o) {
		const hat = C(o, 'c', 'red');
		ctx.fillStyle = 'hsl(215 55% 40%)'; ctx.beginPath(); ctx.ellipse(cx, base - h * 0.25, w * 0.42, h * 0.26, 0, 0, 7); ctx.fill();
		ctx.fillStyle = 'hsl(28 40% 30%)'; ctx.fillRect(cx - w * 0.4, base - h * 0.06, w * 0.35, h * 0.06); ctx.fillRect(cx + w * 0.05, base - h * 0.06, w * 0.35, h * 0.06);
		ctx.fillStyle = 'hsl(25 60% 78%)'; ctx.beginPath(); ctx.arc(cx, base - h * 0.55, w * 0.22, 0, 7); ctx.fill();
		ctx.fillStyle = '#f5f2ea'; ctx.beginPath(); ctx.moveTo(cx - w * 0.28, base - h * 0.55); ctx.quadraticCurveTo(cx, base - h * 0.15, cx + w * 0.28, base - h * 0.55); ctx.fill();
		ctx.fillStyle = F(hat, 0); ctx.beginPath(); ctx.moveTo(cx - w * 0.3, base - h * 0.62); ctx.lineTo(cx + w * 0.08, base - h); ctx.lineTo(cx + w * 0.3, base - h * 0.62); ctx.fill();
		ctx.fillStyle = 'hsl(10 60% 62%)'; ctx.beginPath(); ctx.arc(cx, base - h * 0.52, w * 0.07, 0, 7); ctx.fill();
	},
	flamingo(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'pink');
		ctx.strokeStyle = '#333'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx - w * 0.05, base); ctx.lineTo(cx - w * 0.05, base - h * 0.45); ctx.moveTo(cx + w * 0.05, base); ctx.lineTo(cx + w * 0.05, base - h * 0.45); ctx.stroke();
		ctx.fillStyle = F(c, 0); ctx.beginPath(); ctx.ellipse(cx, base - h * 0.55, w * 0.45, h * 0.12, -0.2, 0, 7); ctx.fill();
		ctx.strokeStyle = F(c, 0); ctx.lineWidth = Math.max(1.5, w * 0.1); ctx.beginPath(); ctx.moveTo(cx + w * 0.3, base - h * 0.6); ctx.quadraticCurveTo(cx + w * 0.55, base - h * 0.85, cx + w * 0.25, base - h * 0.95); ctx.stroke();
		ctx.fillStyle = '#222'; ctx.beginPath(); ctx.moveTo(cx + w * 0.22, base - h * 0.95); ctx.lineTo(cx + w * 0.05, base - h * 0.88); ctx.lineTo(cx + w * 0.2, base - h * 0.92); ctx.fill();
	},
	gazingball(ctx, cx, base, w, h, R, sun, res, o) {
		ctx.fillStyle = 'hsl(30 10% 70%)'; ctx.beginPath(); ctx.moveTo(cx - w * 0.3, base); ctx.lineTo(cx - w * 0.12, base - h * 0.6); ctx.lineTo(cx + w * 0.12, base - h * 0.6); ctx.lineTo(cx + w * 0.3, base); ctx.fill();
		const g = ctx.createRadialGradient(cx - w * 0.15, base - h * 0.85, w * 0.05, cx, base - h * 0.78, w * 0.45);
		g.addColorStop(0, '#e8f6ff'); g.addColorStop(0.4, F(C(o, 'c', 'glazeblue'), 10)); g.addColorStop(1, F(C(o, 'c', 'glazeblue'), -15));
		ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, base - h * 0.78, w * 0.42, 0, 7); ctx.fill();
	},
	sundial(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'limestone');
		ctx.fillStyle = grad(ctx, cx - w / 2, cx + w / 2, c, sun);
		ctx.fillRect(cx - w * 0.35, base - h * 0.08, w * 0.7, h * 0.08);
		ctx.fillRect(cx - w * 0.15, base - h * 0.85, w * 0.3, h * 0.78);
		ctx.beginPath(); ctx.ellipse(cx, base - h * 0.88, w * 0.5, h * 0.06, 0, 0, 7); ctx.fill();
		ctx.fillStyle = '#7a5a2a'; ctx.beginPath(); ctx.moveTo(cx - w * 0.2, base - h * 0.9); ctx.lineTo(cx + w * 0.1, base - h); ctx.lineTo(cx + w * 0.1, base - h * 0.9); ctx.fill();
	},
	armillary(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'bronze');
		ctx.fillStyle = F(c, 0); ctx.fillRect(cx - w * 0.08, base - h * 0.6, w * 0.16, h * 0.6); ctx.fillRect(cx - w * 0.25, base - h * 0.05, w * 0.5, h * 0.05);
		ctx.strokeStyle = F(c, 10); ctx.lineWidth = Math.max(1, w * 0.04);
		ctx.beginPath(); ctx.arc(cx, base - h * 0.8, w * 0.45, 0, 7); ctx.stroke();
		ctx.beginPath(); ctx.ellipse(cx, base - h * 0.8, w * 0.45, w * 0.15, 0.4, 0, 7); ctx.stroke();
		ctx.beginPath(); ctx.ellipse(cx, base - h * 0.8, w * 0.15, w * 0.45, 0.4, 0, 7); ctx.stroke();
	},
	statue(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'limestone');
		ctx.fillStyle = grad(ctx, cx - w / 2, cx + w / 2, c, sun, 14);
		ctx.fillRect(cx - w * 0.4, base - h * 0.15, w * 0.8, h * 0.15);
		ctx.beginPath(); ctx.moveTo(cx - w * 0.25, base - h * 0.15); ctx.quadraticCurveTo(cx - w * 0.2, base - h * 0.55, cx - w * 0.12, base - h * 0.72); ctx.lineTo(cx + w * 0.12, base - h * 0.72); ctx.quadraticCurveTo(cx + w * 0.2, base - h * 0.55, cx + w * 0.25, base - h * 0.15); ctx.fill();
		ctx.beginPath(); ctx.arc(cx, base - h * 0.8, w * 0.12, 0, 7); ctx.fill();
		ctx.fillStyle = grad(ctx, cx - w / 2, cx + w / 2, c, sun, 10);
		[-1, 1].forEach((s) => { ctx.beginPath(); ctx.moveTo(cx + s * w * 0.1, base - h * 0.65); ctx.quadraticCurveTo(cx + s * w * 0.55, base - h * 0.9, cx + s * w * 0.45, base - h * 0.45); ctx.quadraticCurveTo(cx + s * w * 0.3, base - h * 0.55, cx + s * w * 0.12, base - h * 0.55); ctx.fill(); });
	},
	frog(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'bronze');
		const fill = () => grad(ctx, cx - w / 2, cx + w / 2, c, sun, 14);
		ctx.fillStyle = fill();
		// back legs
		[-1, 1].forEach((s) => { ctx.beginPath(); ctx.ellipse(cx + s * w * 0.36, base - h * 0.2, w * 0.16, h * 0.2, s * 0.5, 0, 7); ctx.fill(); });
		// body
		ctx.beginPath(); ctx.moveTo(cx - w * 0.42, base - h * 0.08); ctx.quadraticCurveTo(cx - w * 0.46, base - h * 0.62, cx, base - h * 0.7); ctx.quadraticCurveTo(cx + w * 0.46, base - h * 0.62, cx + w * 0.42, base - h * 0.08); ctx.closePath(); ctx.fill();
		// eyes
		[-1, 1].forEach((s) => { ctx.fillStyle = fill(); ctx.beginPath(); ctx.arc(cx + s * w * 0.2, base - h * 0.74, w * 0.12, 0, 7); ctx.fill(); ctx.fillStyle = '#151510'; ctx.beginPath(); ctx.arc(cx + s * w * 0.2, base - h * 0.76, w * 0.055, 0, 7); ctx.fill(); });
		// mouth, belly & front feet
		ctx.strokeStyle = F(c, -30); ctx.lineWidth = Math.max(0.6, w * 0.015);
		ctx.beginPath(); ctx.moveTo(cx - w * 0.22, base - h * 0.55); ctx.quadraticCurveTo(cx, base - h * 0.46, cx + w * 0.22, base - h * 0.55); ctx.stroke();
		ctx.fillStyle = F(c, 18); ctx.beginPath(); ctx.ellipse(cx, base - h * 0.25, w * 0.2, h * 0.2, 0, 0, 7); ctx.fill();
		ctx.fillStyle = F(c, -8); [-1, 1].forEach((s) => { ctx.beginPath(); ctx.ellipse(cx + s * w * 0.14, base - h * 0.04, w * 0.08, h * 0.05, 0, 0, 7); ctx.fill(); });
	},
	rabbit(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'limestone');
		ctx.fillStyle = grad(ctx, cx - w / 2, cx + w / 2, c, sun, 14);
		ctx.beginPath(); ctx.ellipse(cx, base - h * 0.28, w * 0.42, h * 0.28, 0, 0, 7); ctx.fill();
		ctx.beginPath(); ctx.arc(cx + w * 0.2, base - h * 0.62, w * 0.2, 0, 7); ctx.fill();
		[0.12, 0.28].forEach((t) => { ctx.beginPath(); ctx.ellipse(cx + w * t, base - h * 0.85, w * 0.06, h * 0.16, 0.2, 0, 7); ctx.fill(); });
	},
	stonelantern(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'granite');
		const g = grad(ctx, cx - w / 2, cx + w / 2, c, sun, 14);
		ctx.fillStyle = g;
		ctx.fillRect(cx - w * 0.3, base - h * 0.1, w * 0.6, h * 0.1);
		ctx.fillRect(cx - w * 0.12, base - h * 0.5, w * 0.24, h * 0.4);
		ctx.fillRect(cx - w * 0.35, base - h * 0.55, w * 0.7, h * 0.06);
		ctx.fillRect(cx - w * 0.25, base - h * 0.72, w * 0.5, h * 0.17);
		ctx.fillStyle = 'rgba(255,220,150,.9)'; ctx.fillRect(cx - w * 0.1, base - h * 0.69, w * 0.2, h * 0.11);
		ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(cx - w * 0.5, base - h * 0.72); ctx.quadraticCurveTo(cx, base - h * 0.95, cx + w * 0.5, base - h * 0.72); ctx.fill();
		ctx.beginPath(); ctx.arc(cx, base - h * 0.93, w * 0.07, 0, 7); ctx.fill();
		glow(res, cx, base - h * 0.64, h * 0.8, [255, 210, 140], 0.7);
	},
	feeder(ctx, cx, base, w, h, R, sun, res, o) {
		ctx.fillStyle = F(C(o, 'c', 'black'), 0); ctx.fillRect(cx - w * 0.03, base - h, w * 0.06, h);
		ctx.fillRect(cx - w * 0.3, base - h * 0.88, w * 0.6, h * 0.02);
		ctx.fillStyle = 'rgba(200,220,230,.6)'; ctx.fillRect(cx - w * 0.38, base - h * 0.85, w * 0.12, h * 0.18); ctx.fillRect(cx + w * 0.26, base - h * 0.85, w * 0.12, h * 0.18);
		ctx.fillStyle = '#c4a46a'; ctx.fillRect(cx - w * 0.37, base - h * 0.76, w * 0.1, h * 0.09); ctx.fillRect(cx + w * 0.27, base - h * 0.76, w * 0.1, h * 0.09);
		ctx.fillStyle = '#c33'; ctx.beginPath(); ctx.ellipse(cx + w * 0.42, base - h * 0.7, w * 0.06, h * 0.025, 0, 0, 7); ctx.fill();
	},
	birdhouse(ctx, cx, base, w, h, R, sun, res, o) {
		ctx.fillStyle = F(C(o, 'c', 'white'), -6); ctx.fillRect(cx - w * 0.06, base - h * 0.8, w * 0.12, h * 0.8);
		ctx.fillStyle = grad(ctx, cx - w * 0.35, cx + w * 0.35, C(o, 'c', 'white'), sun); ctx.fillRect(cx - w * 0.32, base - h * 0.95, w * 0.64, h * 0.17);
		ctx.fillStyle = F(C(o, 'c2', 'red'), 0); ctx.beginPath(); ctx.moveTo(cx - w * 0.45, base - h * 0.93); ctx.lineTo(cx, base - h); ctx.lineTo(cx + w * 0.45, base - h * 0.93); ctx.fill();
		ctx.fillStyle = '#1b1410'; ctx.beginPath(); ctx.arc(cx, base - h * 0.87, w * 0.08, 0, 7); ctx.fill();
	},
	spinner(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'copper');
		ctx.strokeStyle = F(c, -10); ctx.lineWidth = Math.max(1, w * 0.02); ctx.beginPath(); ctx.moveTo(cx, base); ctx.lineTo(cx, base - h * 0.75); ctx.stroke();
		for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; ctx.fillStyle = F(c, (i % 2) * 14); ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * w * 0.25, base - h * 0.75 + Math.sin(a) * w * 0.25, w * 0.25, w * 0.07, a, 0, 7); ctx.fill(); }
	},
	flagpole(ctx, cx, base, w, h, R, sun, res, o) {
		ctx.fillStyle = '#c9ccd1'; ctx.fillRect(cx - Math.max(1, w * 0.015), base - h, Math.max(2, w * 0.03), h);
		ctx.fillStyle = '#d4af37'; ctx.beginPath(); ctx.arc(cx, base - h, Math.max(1.5, w * 0.03), 0, 7); ctx.fill();
		const fx = cx + w * 0.02, fy = base - h * 0.97, fw = w * 0.9, fh = h * 0.18;
		for (let i = 0; i < 13; i++) { ctx.fillStyle = i % 2 ? '#fff' : '#b22234'; ctx.beginPath(); const y = fy + (i * fh) / 13; ctx.moveTo(fx, y); ctx.quadraticCurveTo(fx + fw / 2, y + fh * 0.06, fx + fw, y); ctx.lineTo(fx + fw, y + fh / 13 + 0.5); ctx.quadraticCurveTo(fx + fw / 2, y + fh / 13 + fh * 0.06, fx, y + fh / 13 + 0.5); ctx.fill(); }
		ctx.fillStyle = '#3c3b6e'; ctx.fillRect(fx, fy, fw * 0.4, fh * 0.54);
	},
	scarecrow(ctx, cx, base, w, h, R, sun, res, o) {
		ctx.fillStyle = '#7a5a36'; ctx.fillRect(cx - w * 0.03, base - h, w * 0.06, h); ctx.fillRect(cx - w * 0.5, base - h * 0.68, w, h * 0.04);
		ctx.fillStyle = 'hsl(0 60% 40%)'; ctx.fillRect(cx - w * 0.22, base - h * 0.7, w * 0.44, h * 0.32);
		ctx.strokeStyle = 'rgba(30,20,10,.5)'; for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(cx - w * 0.22, base - h * (0.7 - i * 0.08)); ctx.lineTo(cx + w * 0.22, base - h * (0.7 - i * 0.08)); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx - w * 0.22 + i * w * 0.11, base - h * 0.7); ctx.lineTo(cx - w * 0.22 + i * w * 0.11, base - h * 0.38); ctx.stroke(); }
		ctx.fillStyle = 'hsl(215 40% 35%)'; ctx.fillRect(cx - w * 0.18, base - h * 0.4, w * 0.36, h * 0.22);
		ctx.fillStyle = '#e8cf8a'; ctx.beginPath(); ctx.arc(cx, base - h * 0.8, w * 0.12, 0, 7); ctx.fill();
		ctx.fillStyle = '#c4a46a'; ctx.beginPath(); ctx.ellipse(cx, base - h * 0.88, w * 0.25, h * 0.03, 0, 0, 7); ctx.fill(); ctx.fillRect(cx - w * 0.1, base - h * 0.98, w * 0.2, h * 0.1);
	},
	beehotel(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'cedar');
		ctx.fillStyle = F(c, -8); ctx.fillRect(cx - w * 0.06, base - h * 0.6, w * 0.12, h * 0.6);
		ctx.fillStyle = grad(ctx, cx - w / 2, cx + w / 2, c, sun); ctx.fillRect(cx - w * 0.4, base - h * 0.92, w * 0.8, h * 0.34);
		for (let i = 0; i < 24; i++) { ctx.fillStyle = R() < 0.5 ? '#3a2a1a' : '#c9a36a'; ctx.beginPath(); ctx.arc(cx - w * 0.32 + (i % 6) * w * 0.128, base - h * (0.86 - Math.floor(i / 6) * 0.07), w * 0.045, 0, 7); ctx.fill(); }
		ctx.fillStyle = F(c, -14); ctx.beginPath(); ctx.moveTo(cx - w * 0.5, base - h * 0.9); ctx.lineTo(cx, base - h); ctx.lineTo(cx + w * 0.5, base - h * 0.9); ctx.fill();
	},
	sign(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'cedar');
		ctx.fillStyle = F(c, -10); ctx.fillRect(cx - w * 0.04, base - h, w * 0.08, h);
		ctx.fillStyle = grad(ctx, cx - w / 2, cx + w / 2, c, sun, 8); ctx.fillRect(cx - w / 2, base - h * 0.92, w, h * 0.35);
		ctx.fillStyle = '#f2ead8'; ctx.font = `700 ${Math.max(6, h * 0.12)}px Georgia, serif`; ctx.textAlign = 'center'; ctx.fillText('GARDEN', cx, base - h * 0.7);
	},
	pumpkins(ctx, cx, base, w, h, R, sun, res, o) {
		const pumpkin = (x, s, col) => {
			for (let k = -2; k <= 2; k++) { ctx.fillStyle = F(col, -Math.abs(k) * 4 + (sun * k > 0 ? 6 : 0)); ctx.beginPath(); ctx.ellipse(x + k * s * 0.22, base - s * 0.45, s * 0.3, s * 0.45, 0, 0, 7); ctx.fill(); }
			ctx.fillStyle = '#4a5a2a'; ctx.fillRect(x - s * 0.04, base - s * 1.0, s * 0.08, s * 0.15);
		};
		pumpkin(cx - w * 0.25, h * 0.75, [25, 85, 50]); pumpkin(cx + w * 0.28, h * 0.6, [35, 30, 88]); pumpkin(cx + w * 0.02, h, [24, 90, 52]);
		ctx.fillStyle = '#d8b25a'; for (let i = 0; i < 20; i++) { ctx.beginPath(); ctx.ellipse(cx + (R() - 0.5) * w, base - R() * h * 0.15, w * 0.04, h * 0.03, R() * 3, 0, 7); ctx.fill(); }
	},
	grill(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'steel');
		ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(cx - w * 0.3, base - h * 0.05, h * 0.05, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(cx + w * 0.3, base - h * 0.05, h * 0.05, 0, 7); ctx.fill();
		ctx.fillStyle = grad(ctx, cx - w / 2, cx + w / 2, c, sun, 14); ctx.fillRect(cx - w * 0.35, base - h * 0.55, w * 0.7, h * 0.48);
		ctx.fillRect(cx - w * 0.5, base - h * 0.58, w * 0.15, h * 0.04); ctx.fillRect(cx + w * 0.35, base - h * 0.58, w * 0.15, h * 0.04);
		ctx.beginPath(); ctx.moveTo(cx - w * 0.35, base - h * 0.6); ctx.quadraticCurveTo(cx, base - h * 1.05, cx + w * 0.35, base - h * 0.6); ctx.fill();
		ctx.fillStyle = '#1d1d1d'; ctx.fillRect(cx - w * 0.2, base - h * 0.78, w * 0.4, h * 0.03);
	},
	kettle(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'black');
		ctx.strokeStyle = '#555'; ctx.lineWidth = Math.max(1, w * 0.03);
		ctx.beginPath(); ctx.moveTo(cx - w * 0.35, base); ctx.lineTo(cx - w * 0.15, base - h * 0.5); ctx.moveTo(cx + w * 0.35, base); ctx.lineTo(cx + w * 0.15, base - h * 0.5); ctx.stroke();
		ctx.fillStyle = grad(ctx, cx - w / 2, cx + w / 2, c, sun, 18); ctx.beginPath(); ctx.arc(cx, base - h * 0.62, w * 0.45, 0, Math.PI); ctx.fill();
		ctx.beginPath(); ctx.arc(cx, base - h * 0.64, w * 0.43, Math.PI, 0); ctx.fill();
		ctx.fillStyle = '#333'; ctx.fillRect(cx - w * 0.06, base - h * 1.02, w * 0.12, h * 0.05);
	},
	umbrella(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'canvas');
		ctx.fillStyle = '#ddd'; ctx.fillRect(cx - w * 0.012, base - h, w * 0.024, h);
		ctx.fillStyle = '#555'; ctx.fillRect(cx - w * 0.08, base - h * 0.03, w * 0.16, h * 0.03);
		const g = ctx.createLinearGradient(0, base - h, 0, base - h * 0.75); g.addColorStop(0, F(c, 10)); g.addColorStop(1, F(c, -10));
		ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(cx - w / 2, base - h * 0.75);
		for (let i = 0; i <= 6; i++) { const x = cx - w / 2 + (i / 6) * w; ctx.quadraticCurveTo(x - w / 12, base - h * 0.71, x, base - h * 0.75); }
		ctx.lineTo(cx, base - h); ctx.closePath(); ctx.fill();
	},
	hottub(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'gray');
		ctx.fillStyle = grad(ctx, cx - w / 2, cx + w / 2, c, sun, 10); ctx.fillRect(cx - w / 2, base - h, w, h);
		ctx.strokeStyle = 'rgba(0,0,0,.18)'; for (let x = cx - w / 2; x < cx + w / 2; x += Math.max(3, w * 0.04)) { ctx.beginPath(); ctx.moveTo(x, base - h); ctx.lineTo(x, base); ctx.stroke(); }
		ctx.fillStyle = F(c, 10); ctx.fillRect(cx - w * 0.52, base - h * 1.04, w * 1.04, h * 0.08);
		water(ctx, cx, base - h * 1.06, w * 0.42, Math.max(1.5, h * 0.05));
		glow(res, cx, base - h * 1.05, w * 0.7, [120, 200, 255], 0.6);
	},
	kitchen(ctx, cx, base, w, h, R, sun, res, o) {
		SIDE.wall(ctx, cx, base, w, h * 0.92, R, sun, res, { c: o.c || 'field', v: 'dry' });
		ctx.fillStyle = F(C(o, 'c2', 'granite'), -10); ctx.fillRect(cx - w * 0.52, base - h, w * 1.04, h * 0.1);
		ctx.fillStyle = '#c9ccd1'; ctx.fillRect(cx - w * 0.15, base - h * 0.75, w * 0.3, h * 0.4); ctx.fillStyle = '#9aa0a6'; ctx.fillRect(cx - w * 0.13, base - h * 0.72, w * 0.26, h * 0.08);
	},
	cornhole(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'white'), b = C(o, 'c2', 'blue');
		[-1, 1].forEach((s) => { const x = cx + s * w * 0.3; ctx.fillStyle = F(b, 0); ctx.beginPath(); ctx.moveTo(x - w * 0.15, base); ctx.lineTo(x - w * 0.15, base - h * 0.2); ctx.lineTo(x + w * 0.15, base - h); ctx.lineTo(x + w * 0.15, base); ctx.fill(); ctx.fillStyle = F(c, 0); ctx.beginPath(); ctx.ellipse(x + w * 0.06, base - h * 0.7, w * 0.03, h * 0.08, 0, 0, 7); ctx.fill(); });
	},
	trampoline(ctx, cx, base, w, h, R, sun, res, o) {
		ctx.strokeStyle = '#222'; ctx.lineWidth = Math.max(1, w * 0.008);
		for (let i = 0; i < 6; i++) { const x = cx - w / 2 + (i / 5) * w; ctx.beginPath(); ctx.moveTo(x, base); ctx.lineTo(x, base - h * 0.35); ctx.stroke(); }
		ctx.fillStyle = '#1b1b1b'; ctx.beginPath(); ctx.ellipse(cx, base - h * 0.35, w / 2, h * 0.08, 0, 0, 7); ctx.fill();
		ctx.fillStyle = '#2f62b0'; ctx.beginPath(); ctx.ellipse(cx, base - h * 0.35, w / 2, h * 0.08, 0, 0, Math.PI); ctx.lineTo(cx - w / 2, base - h * 0.4); ctx.ellipse(cx, base - h * 0.4, w / 2, h * 0.06, 0, Math.PI, 0); ctx.fill();
		ctx.strokeStyle = 'rgba(30,30,30,.5)'; for (let i = 0; i < 9; i++) { const x = cx - w * 0.48 + (i / 8) * w * 0.96; ctx.beginPath(); ctx.moveTo(x, base - h * 0.4); ctx.lineTo(x, base - h); ctx.stroke(); }
		ctx.beginPath(); ctx.moveTo(cx - w * 0.48, base - h); ctx.lineTo(cx + w * 0.48, base - h); ctx.stroke();
	},
	hoop(ctx, cx, base, w, h, R, sun, res, o) {
		ctx.fillStyle = '#222'; ctx.fillRect(cx - w * 0.05, base - h * 0.85, w * 0.1, h * 0.85); ctx.fillRect(cx - w * 0.3, base - h * 0.05, w * 0.6, h * 0.05);
		ctx.fillStyle = 'rgba(240,245,250,.9)'; ctx.fillRect(cx - w * 0.5, base - h, w, h * 0.24);
		ctx.strokeStyle = '#d33'; ctx.lineWidth = 1.5; ctx.strokeRect(cx - w * 0.15, base - h * 0.92, w * 0.3, h * 0.12);
		ctx.strokeStyle = '#ff6a00'; ctx.beginPath(); ctx.ellipse(cx, base - h * 0.78, w * 0.16, h * 0.02, 0, 0, 7); ctx.stroke();
		ctx.strokeStyle = '#eee'; ctx.lineWidth = 1; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(cx + i * w * 0.07, base - h * 0.78); ctx.lineTo(cx + i * w * 0.045, base - h * 0.7); ctx.stroke(); }
	},
	compost(ctx, cx, base, w, h, R, sun, res, o) {
		ctx.fillStyle = grad(ctx, cx - w / 2, cx + w / 2, C(o, 'c', 'black'), sun, 10);
		ctx.beginPath(); ctx.moveTo(cx - w * 0.45, base); ctx.lineTo(cx - w * 0.38, base - h * 0.9); ctx.lineTo(cx + w * 0.38, base - h * 0.9); ctx.lineTo(cx + w * 0.45, base); ctx.fill();
		ctx.fillStyle = '#2a2a2a'; ctx.fillRect(cx - w * 0.42, base - h, w * 0.84, h * 0.12);
	},
	acunit(ctx, cx, base, w, h, R, sun, res, o) {
		ctx.fillStyle = grad(ctx, cx - w / 2, cx + w / 2, C(o, 'c', 'gray'), sun, 10); ctx.fillRect(cx - w / 2, base - h * 0.95, w, h * 0.95);
		ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1; for (let y = base - h * 0.85; y < base - h * 0.1; y += Math.max(2, h * 0.05)) { ctx.beginPath(); ctx.moveTo(cx - w * 0.45, y); ctx.lineTo(cx + w * 0.45, y); ctx.stroke(); }
		ctx.fillStyle = '#333'; ctx.fillRect(cx - w * 0.52, base - h, w * 1.04, h * 0.06);
	},
	trashscreen(ctx, cx, base, w, h, R, sun, res, o) { SIDE.fence(ctx, cx, base, w, h, R, sun, res, { c: o.c || 'cedar', v: 'privacy' }); },
	hosereel(ctx, cx, base, w, h, R, sun, res, o) {
		const c = C(o, 'c', 'green');
		ctx.fillStyle = '#333'; ctx.fillRect(cx - w * 0.35, base - h * 0.85, w * 0.06, h * 0.85); ctx.fillRect(cx + w * 0.29, base - h * 0.85, w * 0.06, h * 0.85);
		ctx.fillStyle = F(c, 0); ctx.beginPath(); ctx.arc(cx, base - h * 0.45, h * 0.38, 0, 7); ctx.fill();
		ctx.strokeStyle = F(c, -14); ctx.lineWidth = 1; for (let r = 0.1; r < 0.38; r += 0.05) { ctx.beginPath(); ctx.arc(cx, base - h * 0.45, h * r, 0, 7); ctx.stroke(); }
		ctx.strokeStyle = '#333'; ctx.lineWidth = Math.max(1, w * 0.04); ctx.beginPath(); ctx.moveTo(cx - w * 0.35, base - h * 0.85); ctx.lineTo(cx - w * 0.5, base - h); ctx.stroke();
	}
};

/* ------------------------------------------------------------------- top */

const ROUND = new Set(['birdbath', 'fountain', 'urnfountain', 'firepit', 'firebowl', 'chiminea', 'pot', 'planter', 'barrel', 'umbrella', 'trampoline', 'gazebo', 'gazingball', 'sundial', 'armillary', 'spinner', 'kettle', 'cairn', 'stonelantern', 'compost', 'hosereel', 'bubbler', 'basket', 'heater', 'torch', 'uplight', 'feeder', 'birdhouse', 'flagpole', 'hooklantern', 'lamppost', 'pathlight', 'gnome', 'frog', 'rabbit', 'statue', 'flamingo', 'scarecrow', 'beehotel', 'sign', 'mailbox', 'obelisk', 'pumpkins', 'pillar']);

export function topFeature(ctx, item, cx, cy, r, R, res) {
	const o = item.opts || {};
	const k = item.kind;
	const c = PAL[o.c] || PAL.white;
	const lit = /light:1/.test(item.raw || '') || item.light;
	if (k === 'boulder' || k === 'boulders' || k === 'stepping') {
		const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r); g.addColorStop(0, F(c, 12)); g.addColorStop(1, F(c, -14));
		ctx.fillStyle = g;
		if (k === 'boulders') { lumpyPoly(ctx, cx - r * 0.4, cy, r * 0.5, r * 0.4, R); ctx.fill(); lumpyPoly(ctx, cx + r * 0.45, cy + r * 0.1, r * 0.38, r * 0.3, R); ctx.fill(); }
		else { lumpyPoly(ctx, cx, cy, r * 0.9, r * (k === 'stepping' ? 0.75 : 0.8), R, 10); ctx.fill(); }
		speck(ctx, R, cx - r, cy - r, r * 2, r * 2, r * 2, 0.15, 0.1, r * 0.03);
		return;
	}
	if (k === 'pond') { ctx.fillStyle = F(PAL.field, 0); lumpyPoly(ctx, cx, cy, r, r * 0.75, R, 14); ctx.fill(); water(ctx, cx, cy, r * 0.85, r * 0.6); return; }
	if (k === 'fence' || k === 'wall' || k === 'trashscreen' || k === 'stringlights') {
		ctx.fillStyle = F(c, -4); ctx.fillRect(cx - r, cy - Math.max(1.5, r * 0.06), r * 2, Math.max(3, r * 0.12));
		if (k === 'stringlights') for (let i = 0; i < 10; i++) res.lights.push({ x: cx - r + (i / 9) * r * 2, y: cy, r: r * 0.25, col: [255, 215, 150], k: 0.5 });
		return;
	}
	if (ROUND.has(k)) {
		const rr = ['lamppost', 'pathlight', 'torch', 'uplight', 'feeder', 'birdhouse', 'flagpole', 'hooklantern', 'sign', 'mailbox', 'gnome', 'frog', 'rabbit', 'flamingo', 'scarecrow'].includes(k) ? r * 0.6 : r;
		const g = ctx.createRadialGradient(cx - rr * 0.3, cy - rr * 0.3, rr * 0.1, cx, cy, rr);
		g.addColorStop(0, F(c, 14)); g.addColorStop(1, F(c, -12));
		ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 7); ctx.fill();
		if (k === 'birdbath' || k === 'fountain' || k === 'urnfountain' || k === 'bubbler') water(ctx, cx, cy, rr * 0.8, rr * 0.8);
		if (k === 'firepit' || k === 'firebowl' || k === 'chiminea') { const fg = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr * 0.7); fg.addColorStop(0, '#ffd27a'); fg.addColorStop(0.5, '#ff7a1a'); fg.addColorStop(1, '#3a2418'); ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(cx, cy, rr * 0.7, 0, 7); ctx.fill(); }
		if (k === 'planter' || k === 'pot' || k === 'barrel' || k === 'basket') flowersOn(ctx, R, cx, cy, rr * 0.8, rr * 0.8, PAL[o.c2] || PAL.pink, 20, Math.max(1, rr * 0.12));
		if (k === 'umbrella' || k === 'gazebo') { ctx.strokeStyle = 'rgba(0,0,0,.2)'; for (let i = 0; i < 8; i++) { const a = (i / 8) * 7; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); ctx.stroke(); } }
		if (k === 'trampoline') { ctx.fillStyle = '#1b1b1b'; ctx.beginPath(); ctx.arc(cx, cy, rr * 0.85, 0, 7); ctx.fill(); }
		if (lit) res.lights.push({ x: cx, y: cy, r: r * (k === 'lamppost' ? 9 : k === 'pathlight' ? 5 : 3), col: /fire|chimin|heater|torch/.test(k) ? [255, 140, 50] : /fountain|bubbler|pond|hottub/.test(k) ? [150, 210, 255] : [255, 215, 150], k: 0.8 });
		return;
	}
	// rectangles: benches, beds, structures, tables…
	const hh = ['bench', 'stonebench', 'logbench', 'chaise', 'raisedbed', 'trough', 'windowbox', 'cornhole', 'steps', 'kitchen', 'bridge', 'wheelbarrow', 'hammock', 'aswing', 'swingset', 'firetable', 'hottub', 'grill', 'acunit'].includes(k) ? r * 0.4 : r * 0.75;
	const g = ctx.createLinearGradient(cx - r, cy - hh, cx + r, cy + hh); g.addColorStop(0, F(c, 10)); g.addColorStop(1, F(c, -10));
	ctx.fillStyle = g; ctx.fillRect(cx - r, cy - hh, r * 2, hh * 2);
	if (k === 'pergola' || k === 'arbor') { ctx.clearRect(cx - r + 3, cy - hh + 3, r * 2 - 6, hh * 2 - 6); ctx.fillStyle = F(c, 0); for (let x = cx - r; x < cx + r; x += Math.max(4, r * 0.18)) ctx.fillRect(x, cy - hh, Math.max(1.5, r * 0.05), hh * 2); }
	if (k === 'raisedbed') { ctx.fillStyle = 'hsl(25 35% 20%)'; ctx.fillRect(cx - r * 0.9, cy - hh * 0.7, r * 1.8, hh * 1.4); flowersOn(ctx, R, cx, cy, r * 0.8, hh * 0.6, [5, 80, 48], 16, Math.max(1, hh * 0.15)); }
	if (k === 'shed' || k === 'playhouse' || k === 'coop' || k === 'doghouse' || k === 'greenhouse') { ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.stroke(); }
	if (k === 'hottub') water(ctx, cx, cy, r * 0.8, hh * 0.8);
	if (k === 'dining') { ctx.fillStyle = F(PAL.canvas, 0); ctx.beginPath(); ctx.arc(cx, cy, r * 0.75, 0, 7); ctx.fill(); }
	if (lit) res.lights.push({ x: cx, y: cy, r: r * 2.5, col: k === 'hottub' ? [120, 200, 255] : [255, 140, 50], k: 0.7 });
}

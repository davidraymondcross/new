/* DreamScaper – canvas editor engine: scene rendering, perspective, tools, history. */
import { canvas, clamp, uid, smoothPath } from './util.js?v=2.5.0';
import { byId, sizeAt } from './library.js?v=2.5.0';
import { sprite } from './sprites.js?v=2.5.0';
import { fillGround } from './textures.js?v=2.5.0';
import { magicSelect, inpaint, dilate, maskBBox, maskCount } from './eraser.js?v=2.5.0';

const EDGING = {
	none: null,
	steel: { col: '#2b2622', ft: 0.12 },
	stone: { col: '#a8a39a', ft: 0.6, joints: '#6f6a62' },
	brick: { col: '#8e4a35', ft: 0.45, joints: '#d9c9ad' }
};

export class Editor {
	constructor(stage, hooks) {
		this.stage = stage;
		this.hooks = hooks;
		this.world = document.createElement('div');
		this.world.className = 'ds-world';
		this.display = canvas(10, 10);
		this.overlay = canvas(10, 10);
		this.display.className = 'ds-display';
		this.overlay.className = 'ds-overlay';
		this.world.append(this.display, this.overlay);
		stage.append(this.world);
		this.z = 1; this.ox = 0; this.oy = 0;
		this.tool = 'select';
		this.opts = {
			paint: { mat: 'mulch', size: 40, erase: false },
			bed: { mat: 'mulch', edging: 'steel' },
			eraser: { mode: 'region', tol: 30, grow: 3, brush: null, size: 30 },
			scale: { person: true }
		};
		this.sel = null;
		this.placeItem = null;
		this.undoStack = [];
		this.redoStack = [];
		this.pointers = new Map();
		this.hover = null;
		this.bedPts = [];
		this.selMask = null;
		this.personPos = null;
		this._raf = 0;
		this._bindEvents();
		this._ro = new ResizeObserver(() => this.fit());
		this._ro.observe(stage);
	}

	/* ------------------------------------------------------------- setup */

	open(project, view, baseImg) {
		this.project = project;
		this.view = view;
		const W = view.W, H = view.H;
		this.W = W; this.H = H;
		for (const c of [this.display, this.overlay]) { c.width = W; c.height = H; }
		this.world.style.width = W + 'px';
		this.world.style.height = H + 'px';
		this.base = canvas(W, H);
		this.bctx = this.base.getContext('2d', { willReadFrequently: true });
		this.bctx.drawImage(baseImg, 0, 0, W, H);
		this.ground = canvas(W, H);
		this.groundShaded = canvas(W, H);
		this._buildShade();
		this.undoStack = []; this.redoStack = [];
		this.sel = null; this.selMask = null; this.bedPts = [];
		if (view.kind !== 'aerial' && !view.cam) view.cam = { horizon: Math.round(H * 0.42), camH: 5, focal: Math.round(0.785 * Math.max(W, H)) };
		this.personPos = view.kind === 'aerial' ? { x: W * 0.5, y: H * 0.5 } : { x: W * 0.7, y: Math.round(view.cam.horizon + (H - view.cam.horizon) * 0.3) };
		this.rebuildGround();
		this.fit();
		this.render();
		this.hooks.onSelect && this.hooks.onSelect(null);
	}

	destroy() { this._ro.disconnect(); this.world.remove(); }

	get isTop() { return this.view.kind === 'aerial'; }

	geom() {
		const v = this.view;
		if (this.isTop) return { view: 'top', ppf: v.ppf };
		return { view: 'side', horizon: v.cam.horizon, camH: v.cam.camH, focal: v.cam.focal, vx: this.W / 2 };
	}

	/** Pixels per foot (horizontal) on the ground at image row y. */
	ppfAt(y) {
		if (this.isTop) return this.view.ppf;
		const d = Math.max(6, y - this.view.cam.horizon);
		return d / this.view.cam.camH;
	}

	/* --------------------------------------------------- shading & ground */

	_buildShade() {
		// Soft "shadow map" of the photo: each spot's brightness relative to its wider
		// neighborhood. New mulch/lawn/stone is multiplied by it, so it picks up the real
		// shadows of trees and the house without darkening open sunny ground.
		const W = this.W, H = this.H;
		const sw = Math.max(2, W >> 3), sh = Math.max(2, H >> 3);
		const small = canvas(sw, sh);
		const sx = small.getContext('2d', { willReadFrequently: true });
		sx.drawImage(this.base, 0, 0, sw, sh);
		const big = canvas(Math.max(2, W >> 6), Math.max(2, H >> 6));
		big.getContext('2d').drawImage(small, 0, 0, big.width, big.height);
		const wide = canvas(sw, sh);
		const wx = wide.getContext('2d', { willReadFrequently: true });
		wx.imageSmoothingQuality = 'high';
		wx.drawImage(big, 0, 0, sw, sh);
		const d = sx.getImageData(0, 0, sw, sh), n = wx.getImageData(0, 0, sw, sh);
		const L = (a, i) => 0.3 * a[i] + 0.59 * a[i + 1] + 0.11 * a[i + 2];
		for (let i = 0; i < d.data.length; i += 4) {
			const r = L(d.data, i) / Math.max(20, L(n.data, i));
			const v = clamp(Math.pow(r, 1.15) * 268, 70, 255);
			d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
		}
		sx.putImageData(d, 0, 0);
		this.shade = canvas(W, H);
		const c = this.shade.getContext('2d');
		c.imageSmoothingQuality = 'high';
		c.drawImage(small, 0, 0, W, H);
	}

	rebuildGround() {
		const g = this.ground.getContext('2d');
		g.clearRect(0, 0, this.W, this.H);
		for (const op of this.view.ops) this._applyOp(op);
		this._composeGround();
	}

	_opBox(op) {
		if (op.t === 'mask') { const b = op.box; return b ? { x0: b[0], y0: b[1], x1: b[2], y1: b[3] } : null; }
		let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
		for (const p of op.pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
		const m = (op.t === 'brush' ? op.size / 2 : 4) + 4 + (op.edging ? 30 : 0);
		x0 = Math.max(0, Math.floor(x0 - m)); y0 = Math.max(0, Math.floor(y0 - m));
		x1 = Math.min(this.W, Math.ceil(x1 + m)); y1 = Math.min(this.H, Math.ceil(y1 + m));
		return x1 > x0 && y1 > y0 ? { x0, y0, x1, y1 } : null;
	}

	_shapePath(ctx, op) {
		ctx.beginPath();
		if (op.t === 'poly') smoothPath(ctx, op.pts, true);
		else if (op.pts.length === 1) ctx.arc(op.pts[0][0], op.pts[0][1], op.size / 2, 0, 7);
		else smoothPath(ctx, op.pts, false);
	}

	_applyOp(op, pts) {
		const o = pts ? { ...op, pts } : op;
		const bb = this._opBox(o);
		if (!bb) return;
		const w = bb.x1 - bb.x0, h = bb.y1 - bb.y0;
		let mask;
		if (o.t === 'mask') mask = maskOpCanvas(o, bb, this.W, this.H);
		else {
			mask = canvas(w, h);
			const m = mask.getContext('2d');
			m.translate(-bb.x0, -bb.y0);
			m.fillStyle = m.strokeStyle = '#000';
			m.lineCap = m.lineJoin = 'round';
			if ('filter' in m) m.filter = 'blur(0.8px)';
			this._shapePath(m, o);
			if (o.t === 'poly' || o.pts.length === 1) m.fill();
			else { m.lineWidth = o.size; m.stroke(); }
		}
		const g = this.ground.getContext('2d');
		if (o.erase) {
			g.globalCompositeOperation = 'destination-out';
			g.drawImage(mask, bb.x0, bb.y0);
			g.globalCompositeOperation = 'source-over';
			return;
		}
		const tex = canvas(w, h);
		const t = tex.getContext('2d');
		t.translate(-bb.x0, -bb.y0);
		fillGround(t, o.mat, bb.x0, bb.y0, bb.x1, bb.y1, this.geom());
		t.setTransform(1, 0, 0, 1, 0, 0);
		t.globalCompositeOperation = 'destination-in';
		t.drawImage(mask, 0, 0);
		g.drawImage(tex, bb.x0, bb.y0);
		if (o.t === 'poly' && o.edging && EDGING[o.edging]) this._edging(g, o);
	}

	_edging(g, op) {
		const e = EDGING[op.edging];
		let ys = 0;
		for (const p of op.pts) ys += p[1];
		const ppf = this.ppfAt(ys / op.pts.length);
		const wpx = Math.max(1.2, e.ft * ppf);
		g.save();
		g.lineJoin = 'round';
		this._shapePath(g, op);
		g.strokeStyle = 'rgba(0,0,0,.35)';
		g.lineWidth = wpx + 2;
		g.stroke();
		g.strokeStyle = e.col;
		g.lineWidth = wpx;
		g.stroke();
		if (e.joints) {
			g.setLineDash([Math.max(1, wpx * 0.12), Math.max(3, wpx * 1.6)]);
			g.strokeStyle = e.joints;
			g.stroke();
			g.setLineDash([]);
			g.strokeStyle = 'rgba(255,255,255,.18)';
			g.lineWidth = Math.max(0.6, wpx * 0.25);
			g.stroke();
		}
		g.restore();
	}

	_composeGround() {
		const c = this.groundShaded.getContext('2d');
		c.globalCompositeOperation = 'copy';
		c.drawImage(this.ground, 0, 0);
		c.globalCompositeOperation = 'multiply';
		c.globalAlpha = 0.75;
		c.drawImage(this.shade, 0, 0);
		c.globalAlpha = 1;
		c.globalCompositeOperation = 'destination-in';
		c.drawImage(this.ground, 0, 0);
		c.globalCompositeOperation = 'source-over';
	}

	/* -------------------------------------------------------------- render */

	render() {
		if (this._raf) return;
		this._raf = requestAnimationFrame(() => { this._raf = 0; this._draw(this.display.getContext('2d'), true); this._drawOverlay(); });
	}

	scene() { return this.project; }

	_objSize(o) {
		const item = byId[o.item];
		const age = (o.age || 0) + (this.project.years || 0);
		const s = sizeAt(item, age);
		const ppf = this.ppfAt(o.y);
		const k = ppf * (o.scale || 1);
		return { item, s, w: s.w * k, h: s.h * k, ppf };
	}

	_draw(ctx, live) {
		const W = this.W, H = this.H, P = this.project;
		ctx.save();
		ctx.globalCompositeOperation = 'source-over';
		ctx.drawImage(this.base, 0, 0);
		ctx.drawImage(this.groundShaded, 0, 0);
		const sun = P.sun || -1;
		const objs = this.view.objects.slice().sort((a, b) => (this.isTop ? (byId[a.item].h - byId[b.item].h) : a.y - b.y) || (a.z || 0) - (b.z || 0));
		const lights = [];
		// ground shadows first so they sit under every object
		for (const o of objs) {
			const { w, h, item } = this._objSize(o);
			if (this.isTop) continue;
			const d = Math.max(6, o.y - (this.view.cam ? this.view.cam.horizon : 0));
			const rx = w * (item.cat === 'features' ? 0.55 : 0.5), ry = Math.max(2, rx * clamp(d / this.view.cam.focal, 0.08, 0.6));
			const g = ctx.createRadialGradient(o.x - sun * rx * 0.25, o.y, 0, o.x - sun * rx * 0.25, o.y, rx);
			g.addColorStop(0, 'rgba(0,0,0,.34)'); g.addColorStop(0.7, 'rgba(0,0,0,.18)'); g.addColorStop(1, 'rgba(0,0,0,0)');
			ctx.fillStyle = g;
			ctx.save(); ctx.translate(o.x - sun * rx * 0.25, o.y); ctx.scale(1, ry / rx); ctx.beginPath(); ctx.arc(0, 0, rx, 0, 7); ctx.restore();
			ctx.fill();
			void h;
		}
		for (const o of objs) {
			const { w, h, item } = this._objSize(o);
			const sp = sprite(item, { w: this.isTop ? Math.max(w, 4) : w, h, seed: o.seed, season: P.season || 'summer', view: this.isTop ? 'top' : 'side', sun: o.flip ? -sun : sun });
			const sc = this.isTop ? w / Math.max(4, Math.round(Math.max(w, 4) / 3) * 3) : h / Math.max(4, Math.round(h / 3) * 3);
			const dw = sp.c.width * sc, dh = sp.c.height * sc;
			const dx = o.x - sp.ax * sc, dy = o.y - sp.ay * sc;
			ctx.save();
			if (this.isTop) {
				ctx.shadowColor = 'rgba(0,0,0,.4)';
				ctx.shadowBlur = Math.max(2, w * 0.06);
				ctx.shadowOffsetX = -sun * w * 0.18;
				ctx.shadowOffsetY = w * 0.14;
			}
			if (o.flip) { ctx.translate(o.x, 0); ctx.scale(-1, 1); ctx.translate(-o.x, 0); }
			ctx.drawImage(sp.c, dx, dy, dw, dh);
			ctx.restore();
			o._bb = this.isTop
				? { x0: o.x - w / 2, y0: o.y - w / 2, x1: o.x + w / 2, y1: o.y + w / 2 }
				: { x0: o.x - w / 2 - 2, y0: o.y - h - 2, x1: o.x + w / 2 + 2, y1: o.y + 3 };
			for (const L of sp.lights) lights.push({ x: o.x + (L.x - sp.ax) * sc * (o.flip ? -1 : 1), y: o.y + (L.y - sp.ay) * sc, r: L.r * sc, col: L.col, k: L.k });
		}
		if (P.night) this._night(ctx, lights);
		ctx.restore();
		void W; void H; void live;
	}

	_night(ctx, lights) {
		const W = this.W, H = this.H;
		ctx.globalCompositeOperation = 'multiply';
		ctx.fillStyle = 'rgb(48,62,110)';
		ctx.fillRect(0, 0, W, H);
		ctx.globalCompositeOperation = 'source-over';
		const sky = ctx.createLinearGradient(0, 0, 0, H);
		sky.addColorStop(0, 'rgba(8,12,35,.55)'); sky.addColorStop(0.6, 'rgba(8,12,35,.25)'); sky.addColorStop(1, 'rgba(8,12,35,.35)');
		ctx.fillStyle = sky;
		ctx.fillRect(0, 0, W, H);
		ctx.globalCompositeOperation = 'lighter';
		for (const L of lights) {
			const g = ctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.r);
			const [r, gg, b] = L.col;
			g.addColorStop(0, `rgba(${r},${gg},${b},${0.55 * L.k})`);
			g.addColorStop(0.25, `rgba(${r},${gg},${b},${0.22 * L.k})`);
			g.addColorStop(1, 'rgba(0,0,0,0)');
			ctx.fillStyle = g;
			ctx.beginPath(); ctx.arc(L.x, L.y, L.r, 0, 7); ctx.fill();
			ctx.fillStyle = `rgba(255,245,220,${0.8 * L.k})`;
			ctx.beginPath(); ctx.arc(L.x, L.y, Math.max(1.5, L.r * 0.025), 0, 7); ctx.fill();
		}
		ctx.globalCompositeOperation = 'source-over';
	}

	/** Final picture for saving/sharing (no editing UI). */
	composite(maxW = 0) {
		const c = canvas(this.W, this.H);
		this._draw(c.getContext('2d'), false);
		if (!maxW || this.W <= maxW) return c;
		const s = maxW / this.W;
		const o = canvas(maxW, this.H * s);
		const x = o.getContext('2d');
		x.imageSmoothingQuality = 'high';
		x.drawImage(c, 0, 0, o.width, o.height);
		return o;
	}

	_drawOverlay() {
		const ctx = this.overlay.getContext('2d');
		ctx.clearRect(0, 0, this.W, this.H);
		const z = this.z, lw = 1.5 / z;
		const accent = '#7be0a0';
		// selection
		if (this.sel && this.view.objects.includes(this.sel) && this.sel._bb) {
			const b = this.sel._bb;
			ctx.save();
			ctx.strokeStyle = accent; ctx.lineWidth = lw * 1.4; ctx.setLineDash([6 / z, 4 / z]);
			ctx.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
			ctx.setLineDash([]);
			const hs = 9 / z;
			ctx.fillStyle = '#fff'; ctx.strokeStyle = accent; ctx.lineWidth = lw * 1.4;
			ctx.beginPath(); ctx.arc(b.x1, b.y0, hs, 0, 7); ctx.fill(); ctx.stroke();
			ctx.fillStyle = accent;
			ctx.beginPath(); ctx.moveTo(b.x1 - hs * 0.45, b.y0 + hs * 0.45); ctx.lineTo(b.x1 + hs * 0.45, b.y0 - hs * 0.45); ctx.lineWidth = lw * 1.6; ctx.strokeStyle = accent; ctx.stroke();
			ctx.beginPath(); ctx.arc(this.sel.x, this.sel.y, 3.5 / z, 0, 7); ctx.fill();
			ctx.restore();
		}
		// place ghost
		if (this.tool === 'place' && this.placeItem && this.hover) {
			const fake = { item: this.placeItem.id, x: this.hover.x, y: this.hover.y, age: this.placeItem.plant || 0, scale: 1, seed: 1 };
			const { w, h, item } = this._objSize(fake);
			const sp = sprite(item, { w: Math.max(w, 4), h, seed: 1, season: this.project.season || 'summer', view: this.isTop ? 'top' : 'side', sun: this.project.sun || -1 });
			const sc = this.isTop ? w / Math.max(4, Math.round(Math.max(w, 4) / 3) * 3) : h / Math.max(4, Math.round(h / 3) * 3);
			ctx.globalAlpha = 0.6;
			ctx.drawImage(sp.c, fake.x - sp.ax * sc, fake.y - sp.ay * sc, sp.c.width * sc, sp.c.height * sc);
			ctx.globalAlpha = 1;
		}
		// brush cursor
		if ((this.tool === 'paint' || (this.tool === 'eraser' && this.opts.eraser.brush)) && this.hover) {
			const r = (this.tool === 'paint' ? this.opts.paint.size : this.opts.eraser.size) / 2;
			ctx.strokeStyle = '#fff'; ctx.lineWidth = lw * 1.5;
			ctx.beginPath(); ctx.arc(this.hover.x, this.hover.y, r, 0, 7); ctx.stroke();
			ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = lw * 0.8;
			ctx.beginPath(); ctx.arc(this.hover.x, this.hover.y, r + lw * 1.4, 0, 7); ctx.stroke();
		}
		// bed outline in progress
		if (this.tool === 'bed' && this.bedPts.length) {
			const pts = this.hover ? [...this.bedPts, [this.hover.x, this.hover.y]] : this.bedPts;
			ctx.save();
			ctx.beginPath(); smoothPath(ctx, pts, pts.length > 2);
			ctx.fillStyle = 'rgba(123,224,160,.18)'; if (pts.length > 2) ctx.fill();
			ctx.strokeStyle = accent; ctx.lineWidth = lw * 2; ctx.setLineDash([8 / z, 5 / z]); ctx.stroke();
			ctx.setLineDash([]);
			this.bedPts.forEach((p, i) => {
				ctx.fillStyle = i === 0 ? accent : '#fff';
				ctx.beginPath(); ctx.arc(p[0], p[1], (i === 0 ? 7 : 4.5) / z, 0, 7); ctx.fill();
				ctx.strokeStyle = '#123'; ctx.lineWidth = lw; ctx.stroke();
			});
			ctx.restore();
		}
		// magic eraser selection
		if (this.tool === 'eraser' && this.selMaskCanvas) {
			ctx.drawImage(this.selMaskCanvas, 0, 0);
		}
		// scale tool: horizon + reference person
		if (this.tool === 'scale') {
			if (!this.isTop) {
				const y = this.view.cam.horizon;
				ctx.save();
				ctx.strokeStyle = '#5cc8ff'; ctx.lineWidth = lw * 2.2; ctx.setLineDash([12 / z, 7 / z]);
				ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.W, y); ctx.stroke();
				ctx.setLineDash([]);
				const tag = 'Horizon / eye level — drag me';
				ctx.font = `600 ${13 / z}px system-ui, sans-serif`;
				const tw = ctx.measureText(tag).width;
				ctx.fillStyle = '#5cc8ff';
				ctx.beginPath(); ctx.roundRect ? ctx.roundRect(16 / z, y - 26 / z, tw + 18 / z, 22 / z, 11 / z) : ctx.rect(16 / z, y - 26 / z, tw + 18 / z, 22 / z); ctx.fill();
				ctx.fillStyle = '#04263a'; ctx.fillText(tag, 25 / z, y - 10 / z);
				ctx.restore();
			}
			if (this.opts.scale.person) this._person(ctx);
			if (this.isTop) this._scaleBar(ctx);
		}
	}

	_person(ctx) {
		const p = this.personPos, ppf = this.ppfAt(p.y);
		const h = 6 * ppf;
		ctx.save();
		ctx.translate(p.x, p.y);
		ctx.fillStyle = 'rgba(255,214,102,.85)';
		ctx.strokeStyle = 'rgba(60,40,0,.9)';
		ctx.lineWidth = 1.2 / this.z;
		if (this.isTop) {
			ctx.beginPath(); ctx.ellipse(0, 0, ppf * 0.9, ppf * 0.6, 0, 0, 7); ctx.fill(); ctx.stroke();
			ctx.beginPath(); ctx.arc(0, 0, ppf * 0.38, 0, 7); ctx.fillStyle = 'rgba(120,80,0,.9)'; ctx.fill();
		} else {
			const u = h / 6;
			ctx.beginPath();
			ctx.arc(0, -h + u * 0.45, u * 0.42, 0, 7);
			ctx.moveTo(-u * 0.75, -h + u * 1.05);
			ctx.lineTo(u * 0.75, -h + u * 1.05); ctx.lineTo(u * 0.65, -h + u * 3.1); ctx.lineTo(u * 0.4, -h + u * 3.1);
			ctx.lineTo(u * 0.32, 0); ctx.lineTo(u * 0.05, 0); ctx.lineTo(0, -h + u * 3.4); ctx.lineTo(-u * 0.05, 0); ctx.lineTo(-u * 0.32, 0);
			ctx.lineTo(-u * 0.4, -h + u * 3.1); ctx.lineTo(-u * 0.65, -h + u * 3.1); ctx.closePath();
			ctx.fill(); ctx.stroke();
			ctx.font = `700 ${Math.max(10 / this.z, u * 0.5)}px system-ui, sans-serif`;
			ctx.fillStyle = '#ffd666'; ctx.textAlign = 'center';
			ctx.fillText('6 ft', 0, -h - u * 0.25);
		}
		ctx.restore();
	}

	_scaleBar(ctx) {
		const ppf = this.view.ppf, z = this.z;
		const ft = ppf * 20 > this.W * 0.3 ? 10 : 20;
		const x = 20 / z, y = this.H - 24 / z, w = ppf * ft;
		ctx.save();
		ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(x - 8 / z, y - 26 / z, w + 16 / z, 36 / z);
		ctx.fillStyle = '#fff'; ctx.fillRect(x, y, w, 4 / z);
		ctx.fillRect(x, y - 6 / z, 2 / z, 10 / z); ctx.fillRect(x + w - 2 / z, y - 6 / z, 2 / z, 10 / z);
		ctx.font = `600 ${12 / z}px system-ui, sans-serif`; ctx.fillText(`${ft} ft`, x, y - 10 / z);
		ctx.restore();
	}

	/* ---------------------------------------------------------- viewport */

	fit() {
		if (!this.W) return;
		const r = this.stage.getBoundingClientRect();
		if (!r.width || !r.height) return;
		const pad = 16;
		this.z = Math.min((r.width - pad * 2) / this.W, (r.height - pad * 2) / this.H);
		this.ox = (r.width - this.W * this.z) / 2;
		this.oy = (r.height - this.H * this.z) / 2;
		this._applyView();
	}
	zoomBy(f, cx, cy) {
		const r = this.stage.getBoundingClientRect();
		if (cx == null) { cx = r.width / 2; cy = r.height / 2; }
		const nz = clamp(this.z * f, 0.05, 8);
		this.ox = cx - (cx - this.ox) * (nz / this.z);
		this.oy = cy - (cy - this.oy) * (nz / this.z);
		this.z = nz;
		this._applyView();
	}
	_applyView() {
		this.world.style.transform = `translate(${this.ox}px, ${this.oy}px) scale(${this.z})`;
		this._drawOverlay();
	}
	toImage(e) {
		const r = this.stage.getBoundingClientRect();
		return { x: (e.clientX - r.left - this.ox) / this.z, y: (e.clientY - r.top - this.oy) / this.z };
	}

	/* -------------------------------------------------------------- tools */

	setTool(t) {
		if (this.tool === 'bed' && t !== 'bed') this.bedPts = [];
		if (t !== 'eraser') { this.selMask = null; this.selMaskCanvas = null; }
		if (t !== 'place') this.placeItem = null;
		this.tool = t;
		this.stage.dataset.tool = t;
		this._drawOverlay();
		this.hooks.onTool && this.hooks.onTool(t);
	}

	startPlacing(item) {
		this.placeItem = item;
		this.setTool('place');
		this.placeItem = item;
	}

	_hit(p) {
		const list = this.view.objects.slice().sort((a, b) => b.y - a.y);
		for (const o of list) {
			const b = o._bb;
			if (b && p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1) return o;
		}
		return null;
	}

	select(o) {
		this.sel = o;
		this.hooks.onSelect && this.hooks.onSelect(o);
		this._drawOverlay();
	}

	_bindEvents() {
		const st = this.stage;
		st.addEventListener('pointerdown', (e) => this._down(e));
		st.addEventListener('pointermove', (e) => this._move(e));
		st.addEventListener('pointerup', (e) => this._up(e));
		st.addEventListener('pointercancel', (e) => this._up(e));
		st.addEventListener('pointerleave', () => { this.hover = null; this._drawOverlay(); });
		st.addEventListener('dblclick', (e) => { if (this.tool === 'bed') { e.preventDefault(); this.finishBed(); } });
		st.addEventListener('contextmenu', (e) => e.preventDefault());
	}

	_down(e) {
		this.stage.setPointerCapture(e.pointerId);
		this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		if (this.pointers.size === 2) {
			// pinch / two-finger pan
			const [a, b] = [...this.pointers.values()];
			this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, z: this.z, ox: this.ox, oy: this.oy };
			this.drag = null;
			if (this.stroke) this._endStroke();
			return;
		}
		const p = this.toImage(e);
		const panning = this.tool === 'pan' || e.button === 1 || this.spaceDown;
		if (panning) { this.drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, ox: this.ox, oy: this.oy }; return; }
		if (e.button === 2) return;
		switch (this.tool) {
			case 'select': {
				if (this.sel && this.sel._bb) {
					const b = this.sel._bb, hs = 14 / this.z;
					if (Math.hypot(p.x - b.x1, p.y - b.y0) < hs) {
						this.drag = { kind: 'scale', o: this.sel, start: { ...p }, s0: this.sel.scale || 1, ref: Math.hypot(b.x1 - this.sel.x, b.y0 - this.sel.y) };
						return;
					}
				}
				const o = this._hit(p);
				this.select(o);
				if (o) this.drag = { kind: 'move', o, dx: p.x - o.x, dy: p.y - o.y, x0: o.x, y0: o.y };
				else this.drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, ox: this.ox, oy: this.oy };
				break;
			}
			case 'place': {
				if (!this.placeItem) return;
				const o = this.addObject(this.placeItem, p.x, p.y);
				if (!e.shiftKey) { this.setTool('select'); this.select(o); }
				break;
			}
			case 'paint':
				this.stroke = { id: uid(), t: 'brush', mat: this.opts.paint.mat, size: this.opts.paint.size, erase: this.opts.paint.erase, pts: [[p.x, p.y]] };
				this._applyOp(this.stroke);
				this._composeGround();
				this.render();
				break;
			case 'bed': {
				const first = this.bedPts[0];
				if (first && this.bedPts.length > 2 && Math.hypot(p.x - first[0], p.y - first[1]) < 14 / this.z) { this.finishBed(); return; }
				this.bedPts.push([p.x, p.y]);
				this._drawOverlay();
				this.hooks.onBed && this.hooks.onBed(this.bedPts.length);
				break;
			}
			case 'eraser': {
				const E = this.opts.eraser;
				if (E.brush) { this.drag = { kind: 'selbrush' }; this._selBrush(p, E.brush === 'add'); break; }
				this.magic(p, e.shiftKey);
				break;
			}
			case 'scale': {
				if (this.opts.scale.person) {
					const pp = this.personPos, h = 6 * this.ppfAt(pp.y);
					if (p.x > pp.x - h * 0.25 && p.x < pp.x + h * 0.25 && p.y > pp.y - h && p.y < pp.y + 6 / this.z) { this.drag = { kind: 'person', dx: p.x - pp.x, dy: p.y - pp.y }; return; }
				}
				if (!this.isTop) {
					this.drag = { kind: 'horizon', h0: this.view.cam.horizon };
					this.view.cam.horizon = Math.round(clamp(p.y, -this.H, this.H - 20));
					this.rebuildGround(); this.render(); this._drawOverlay();
				}
				break;
			}
		}
	}

	_move(e) {
		if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		if (this.pinch && this.pointers.size === 2) {
			const [a, b] = [...this.pointers.values()];
			const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
			const r = this.stage.getBoundingClientRect();
			const nz = clamp(this.pinch.z * (d / this.pinch.d), 0.05, 8);
			const cx = this.pinch.mx - r.left, cy = this.pinch.my - r.top;
			this.z = nz;
			this.ox = cx - (cx - this.pinch.ox) * (nz / this.pinch.z) + (mx - this.pinch.mx);
			this.oy = cy - (cy - this.pinch.oy) * (nz / this.pinch.z) + (my - this.pinch.my);
			this._applyView();
			return;
		}
		const p = this.toImage(e);
		this.hover = p;
		const d = this.drag;
		if (d) {
			if (d.kind === 'pan') { this.ox = d.ox + e.clientX - d.sx; this.oy = d.oy + e.clientY - d.sy; this._applyView(); return; }
			if (d.kind === 'move') { d.o.x = clamp(p.x - d.dx, 0, this.W); d.o.y = clamp(p.y - d.dy, 0, this.H); d.moved = true; this.render(); return; }
			if (d.kind === 'scale') {
				const dist = Math.hypot(p.x - d.o.x, p.y - d.o.y);
				d.o.scale = clamp(d.s0 * (dist / Math.max(1, d.ref)), 0.3, 3);
				d.moved = true; this.render(); this.hooks.onSelect && this.hooks.onSelect(d.o, true); return;
			}
			if (d.kind === 'horizon') { this.view.cam.horizon = Math.round(clamp(p.y, -this.H, this.H - 20)); this.render(); this._drawOverlay(); this._horizonDirty = true; return; }
			if (d.kind === 'person') { this.personPos = { x: p.x - d.dx, y: p.y - d.dy }; this._drawOverlay(); return; }
			if (d.kind === 'selbrush') { this._selBrush(p, this.opts.eraser.brush === 'add'); return; }
		}
		if (this.stroke) {
			const last = this.stroke.pts[this.stroke.pts.length - 1];
			const step = Math.max(2, this.stroke.size * 0.15);
			if (Math.hypot(p.x - last[0], p.y - last[1]) >= step) {
				this.stroke.pts.push([p.x, p.y]);
				this._applyOp(this.stroke, [last, [p.x, p.y]]);
				this._composeGroundSoon();
			}
		}
		this._drawOverlay();
	}

	_composeGroundSoon() {
		if (this._cg) return;
		this._cg = requestAnimationFrame(() => { this._cg = 0; this._composeGround(); this.render(); });
	}

	_up(e) {
		this.pointers.delete(e.pointerId);
		if (this.pointers.size < 2) this.pinch = null;
		if (this.stroke) this._endStroke();
		const d = this.drag;
		this.drag = null;
		if (!d) return;
		if ((d.kind === 'move' || d.kind === 'scale') && d.moved) {
			const o = d.o;
			const before = d.kind === 'move' ? { x: d.x0, y: d.y0 } : { scale: d.s0 };
			const after = d.kind === 'move' ? { x: o.x, y: o.y } : { scale: o.scale };
			this._push({ label: (d.kind === 'move' ? 'Moved ' : 'Resized ') + (byId[o.item] ? byId[o.item].name : 'item'), icon: d.kind === 'move' ? 'hand' : 'fit', undo: () => Object.assign(o, before), redo: () => Object.assign(o, after) }, false);
			this.changed();
		}
		if (d.kind === 'horizon' && this._horizonDirty) {
			const h0 = d.h0, h1 = this.view.cam.horizon;
			this._horizonDirty = false;
			this.rebuildGround();
			this._push({ label: 'Set the scale', icon: 'scale', undo: () => { this.view.cam.horizon = h0; this.rebuildGround(); }, redo: () => { this.view.cam.horizon = h1; this.rebuildGround(); } }, false);
			this.changed();
		}
		if (d.kind === 'selbrush') this._updateSelCanvas();
	}

	_endStroke() {
		const op = this.stroke;
		this.stroke = null;
		this.view.ops.push(op);
		this._composeGround();
		this._push({
			label: op.erase ? 'Erased paint' : 'Painted ' + (op.mat || 'ground'), icon: 'paint',
			undo: () => { this.view.ops.splice(this.view.ops.indexOf(op), 1); this.rebuildGround(); },
			redo: () => { this.view.ops.push(op); this.rebuildGround(); }
		}, false);
		this.changed();
	}

	finishBed() {
		if (this.bedPts.length < 3) { this.hooks.toast && this.hooks.toast('Tap at least 3 points around the bed.'); return; }
		const op = { id: uid(), t: 'poly', mat: this.opts.bed.mat, edging: this.opts.bed.edging, pts: this.bedPts.slice() };
		this.bedPts = [];
		this.addOp(op);
		this.hooks.onBed && this.hooks.onBed(0);
	}
	cancelBed() { this.bedPts = []; this._drawOverlay(); this.hooks.onBed && this.hooks.onBed(0); }

	addOp(op) {
		this.view.ops.push(op);
		this._applyOp(op);
		this._composeGround();
		this._push({
			label: op.label || (op.t === 'poly' ? 'Drew a bed' : op.t === 'mask' ? 'Filled the selection with ' + (op.mat || 'material') : 'Changed the ground'), icon: op.t === 'poly' ? 'bed' : 'paint',
			undo: () => { this.view.ops.splice(this.view.ops.indexOf(op), 1); this.rebuildGround(); },
			redo: () => { this.view.ops.push(op); this.rebuildGround(); }
		}, false);
		this.changed();
	}

	/* ------------------------------------------------------------ objects */

	addObject(item, x, y, extra = {}) {
		const o = { id: uid(), item: item.id, x, y, age: item.plant || 0, scale: 1, seed: Math.floor(Math.random() * 1e6), flip: Math.random() < 0.5, ...extra };
		this.view.objects.push(o);
		this._push({ label: 'Added ' + (byId[o.item] ? byId[o.item].name : 'item'), icon: 'plus', undo: () => this._remove(o), redo: () => this.view.objects.push(o) }, false);
		this.changed();
		return o;
	}
	_remove(o) {
		const i = this.view.objects.indexOf(o);
		if (i >= 0) this.view.objects.splice(i, 1);
		if (this.sel === o) this.select(null);
	}
	deleteSelected() {
		const o = this.sel;
		if (!o) return;
		this._remove(o);
		this._push({ label: 'Removed ' + (byId[o.item] ? byId[o.item].name : 'item'), icon: 'trash', undo: () => this.view.objects.push(o), redo: () => this._remove(o) }, false);
		this.changed();
	}
	duplicateSelected() {
		const o = this.sel;
		if (!o) return;
		const ppf = this.ppfAt(o.y);
		const n = this.addObject(byId[o.item], o.x + Math.max(20, byId[o.item].w * ppf * 0.8), o.y, { age: o.age, scale: o.scale, flip: !o.flip });
		this.select(n);
	}
	updateSelected(patch) {
		const o = this.sel;
		if (!o) return;
		const before = {};
		for (const k in patch) before[k] = o[k];
		Object.assign(o, patch);
		const after = { ...patch };
		const what = 'flip' in patch ? 'Flipped ' : 'z' in patch ? 'Reordered ' : 'age' in patch ? 'Changed the age of ' : 'rot' in patch ? 'Rotated ' : 'scale' in patch ? 'Resized ' : 'x' in patch || 'y' in patch ? 'Moved ' : 'Changed ';
		this._push({ label: what + (byId[o.item] ? byId[o.item].name : 'item'), icon: 'edit', key: o.id + Object.keys(patch).join(), undo: () => Object.assign(o, before), redo: () => Object.assign(o, after) }, true);
		this.changed();
	}
	frontSelected() {
		const o = this.sel;
		if (!o) return;
		const z0 = o.z || 0;
		this.updateSelected({ z: Math.max(0, ...this.view.objects.map((x) => x.z || 0)) + 1 });
		void z0;
	}

	/* -------------------------------------------------------- magic eraser */

	magic(p, add) {
		const E = this.opts.eraser;
		const img = this.bctx.getImageData(0, 0, this.W, this.H);
		let m = magicSelect(img, clamp(p.x, 0, this.W - 1), clamp(p.y, 0, this.H - 1), E.tol, E.mode);
		if (add && this.selMask) for (let k = 0; k < m.length; k++) m[k] = m[k] | this.selMask[k];
		this.selMask = m;
		this._updateSelCanvas();
	}

	_selBrush(p, add) {
		if (!this.selMask) this.selMask = new Uint8Array(this.W * this.H);
		const r = this.opts.eraser.size / 2, W = this.W, H = this.H;
		const x0 = Math.max(0, Math.floor(p.x - r)), x1 = Math.min(W - 1, Math.ceil(p.x + r));
		const y0 = Math.max(0, Math.floor(p.y - r)), y1 = Math.min(H - 1, Math.ceil(p.y + r));
		for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if ((x - p.x) ** 2 + (y - p.y) ** 2 <= r * r) this.selMask[y * W + x] = add ? 1 : 0;
		this._updateSelCanvasSoon();
	}
	_updateSelCanvasSoon() {
		if (this._sc) return;
		this._sc = requestAnimationFrame(() => { this._sc = 0; this._updateSelCanvas(); });
	}

	_updateSelCanvas() {
		const m = this.selMask, W = this.W, H = this.H;
		if (!m || !maskCount(m)) { this.selMaskCanvas = null; this._drawOverlay(); this.hooks.onMask && this.hooks.onMask(0); return; }
		const c = this.selMaskCanvas && this.selMaskCanvas.width === W ? this.selMaskCanvas : canvas(W, H);
		const x = c.getContext('2d');
		const d = x.createImageData(W, H);
		for (let k = 0, i = 0; k < m.length; k++, i += 4) {
			if (!m[k]) continue;
			const edge = (k % W > 0 && !m[k - 1]) || (k % W < W - 1 && !m[k + 1]) || (k >= W && !m[k - W]) || (k < W * (H - 1) && !m[k + W]);
			if (edge) { d.data[i] = 255; d.data[i + 1] = 255; d.data[i + 2] = 255; d.data[i + 3] = 255; }
			else { d.data[i] = 255; d.data[i + 1] = 70; d.data[i + 2] = 140; d.data[i + 3] = 110; }
		}
		x.putImageData(d, 0, 0);
		this.selMaskCanvas = c;
		this._drawOverlay();
		this.hooks.onMask && this.hooks.onMask(maskCount(m));
	}

	clearSelection() { this.selMask = null; this.selMaskCanvas = null; this._drawOverlay(); this.hooks.onMask && this.hooks.onMask(0); }

	eraseSelection() {
		if (!this.selMask) return false;
		const W = this.W, H = this.H;
		const m = dilate(this.selMask, W, H, this.opts.eraser.grow);
		const bb = maskBBox(m, W, H);
		if (!bb) return false;
		const img = this.bctx.getImageData(0, 0, W, H);
		const rect = inpaint(img, m);
		if (!rect) return false;
		const before = this.bctx.getImageData(rect.x, rect.y, rect.w, rect.h);
		this.bctx.putImageData(img, 0, 0, rect.x, rect.y, rect.w, rect.h);
		const after = this.bctx.getImageData(rect.x, rect.y, rect.w, rect.h);
		const apply = (data) => { this.bctx.putImageData(data, rect.x, rect.y); this._buildShade(); this._composeGround(); this.render(); this.changed('image'); };
		this._push({ label: 'Magic Eraser', icon: 'eraser', undo: () => apply(before), redo: () => apply(after) }, false);
		this._buildShade();
		this._composeGround();
		this.clearSelection();
		this.render();
		this.changed('image');
		return true;
	}

	/* ---------------------------------------------------- AI helpers */

	/** Replace the selection with a mask (Uint8Array W*H). */
	setSelectionMask(m) { this.selMask = m; this._updateSelCanvas(); }

	/** Paint the current selection with a ground material (undoable). */
	fillSelection(mat) {
		if (!this.selMask) return false;
		const bb = maskBBox(this.selMask, this.W, this.H);
		if (!bb) return false;
		const op = { id: uid(), t: 'mask', mat, rle: rleEncode(this.selMask), box: [bb.x0, bb.y0, bb.x1 + 1, bb.y1 + 1] };
		this.clearSelection();
		this.addOp(op);
		return true;
	}

	/** Replace the photo (e.g. with an AI-edited version), undoable. */
	applyImage(src, label = 'AI edit') {
		const W = this.W, H = this.H;
		const before = this.bctx.getImageData(0, 0, W, H);
		this.bctx.drawImage(src, 0, 0, W, H);
		const after = this.bctx.getImageData(0, 0, W, H);
		const apply = (data) => { this.bctx.putImageData(data, 0, 0); this._buildShade(); this._composeGround(); this.render(); this.changed('image'); };
		this._push({ label, icon: 'sparkle', undo: () => apply(before), redo: () => apply(after) }, false);
		this._buildShade();
		this._composeGround();
		this.clearSelection();
		this.render();
		this.changed('image');
	}

	/* -------------------------------------------------------------- history */

	_push(entry, merge) {
		const top = this.undoStack[this.undoStack.length - 1];
		if (merge && top && top.merge && top.key === entry.key && Date.now() - top.t < 900) {
			top.redo = entry.redo;
			top.t = Date.now();
		} else {
			entry.t = Date.now();
			entry.merge = merge;
			this.undoStack.push(entry);
			if (this.undoStack.length > 120) { this.undoStack.shift(); this.historyTrimmed = true; }
		}
		this.redoStack = [];
		this.hooks.onHistory && this.hooks.onHistory();
	}
	undo() {
		const e = this.undoStack.pop();
		if (!e) return;
		e.undo();
		this.redoStack.push(e);
		this._after();
	}
	redo() {
		const e = this.redoStack.pop();
		if (!e) return;
		e.redo();
		this.undoStack.push(e);
		this._after();
	}
	/** Jump to a step in the history: 0 = the start, n = after the n-th change (undoes/redoes in between). */
	goTo(n) {
		n = Math.max(0, Math.min(n, this.undoStack.length + this.redoStack.length));
		let guard = 400;
		while (this.undoStack.length > n && guard--) { const e = this.undoStack.pop(); e.undo(); this.redoStack.push(e); }
		while (this.undoStack.length < n && this.redoStack.length && guard--) { const e = this.redoStack.pop(); e.redo(); this.undoStack.push(e); }
		this._after();
	}
	/** History list for the History window: [{label, icon, t, done}] oldest → newest. */
	historyList() {
		return [...this.undoStack.map((e) => ({ label: e.label || 'Change', icon: e.icon || 'edit', t: e.t, done: true })),
			...[...this.redoStack].reverse().map((e) => ({ label: e.label || 'Change', icon: e.icon || 'edit', t: e.t, done: false }))];
	}
	_after() {
		if (this.sel && !this.view.objects.includes(this.sel)) this.select(null);
		else this.hooks.onSelect && this.hooks.onSelect(this.sel, true);
		this.render();
		this.hooks.onHistory && this.hooks.onHistory();
		this.changed();
	}

	changed(kind = 'data') {
		this.render();
		this.hooks.onChange && this.hooks.onChange(kind);
	}

	/** Current photo (with erasures) for saving. */
	baseCanvas() { return this.base; }
}



/* mask ops (AI Smart Select fills) — run-length encoded so designs stay small */
export function rleEncode(m) {
	const out = [];
	let cur = 0, n = 0;
	for (let k = 0; k < m.length; k++) {
		const v = m[k] ? 1 : 0;
		if (v === cur) n++;
		else { out.push(n.toString(36)); cur = v; n = 1; }
	}
	out.push(n.toString(36));
	return out.join(',');
}
export function rleDecode(s, N) {
	const m = new Uint8Array(N);
	let k = 0, v = 0;
	for (const part of s.split(',')) { const n = parseInt(part, 36); if (v) m.fill(1, k, k + n); k += n; v ^= 1; }
	return m;
}
const maskCache = new Map();
function maskOpCanvas(op, bb, W, H) {
	const key = op.id + ':' + W;
	if (maskCache.has(key)) return maskCache.get(key);
	const m = rleDecode(op.rle, W * H);
	const w = bb.x1 - bb.x0, h = bb.y1 - bb.y0;
	const c = canvas(w, h), x = c.getContext('2d');
	const d = x.createImageData(w, h);
	for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) if (m[(y + bb.y0) * W + xx + bb.x0]) d.data[(y * w + xx) * 4 + 3] = 255;
	x.putImageData(d, 0, 0);
	const soft = canvas(w, h), sx = soft.getContext('2d');
	sx.filter = 'blur(1px)';
	sx.drawImage(c, 0, 0);
	maskCache.set(key, soft);
	return soft;
}

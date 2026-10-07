/* DreamScaper – canvas editor engine: scene rendering, perspective, tools, history. */
import { canvas, clamp, uid, smoothPath } from './util.js?v=2.7.5';
import { byId, sizeAt } from './library.js?v=2.7.5';
import { sprite } from './sprites.js?v=2.7.5';
import { fillGround } from './textures.js?v=2.7.5';
import { magicSelect, inpaint, dilate, maskBBox, maskCount } from './eraser.js?v=2.7.5';
import { groundPoint, polyArea, fmtFtIn, sampleSmooth } from './takeoff.js?v=2.7.5';
import { applyAdjust, hasAdjust } from './photoedit.js?v=2.7.5';

const EDGING = {
	none: null,
	steel: { col: '#2b2622', ft: 0.12 },
	stone: { col: '#a8a39a', ft: 0.6, joints: '#6f6a62' },
	brick: { col: '#8e4a35', ft: 0.45, joints: '#d9c9ad' },
	plastic: { col: '#1c1c1c', ft: 0.08 }
};
export const ZONES = { plant: ['Planting zone', '#7be0a0'], hard: ['Hardscape zone', '#cfd8dc'], keep: ['Existing – keep', '#f4c95d'], remove: ['Existing – remove', '#ff8a7a'], area: ['Area', '#8ec5ff'] };
/** Per-object look: brightness, contrast, saturation, warmth (−1…1) → canvas filter. */
export function objFilter(fx) {
	if (!fx) return 'none';
	const b = fx.b || 0, c = fx.c || 0, s = fx.s || 0, w = fx.w || 0;
	if (!b && !c && !s && !w) return 'none';
	return `brightness(${(1 + b).toFixed(3)}) contrast(${(1 + c).toFixed(3)}) saturate(${(1 + s + Math.max(0, w) * 0.15).toFixed(3)})` + (w > 0 ? ` sepia(${(w * 0.28).toFixed(3)})` : w < 0 ? ` hue-rotate(${(w * 14).toFixed(1)}deg)` : '');
}

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
			paint: { mat: 'mulch', size: 40, erase: false, soft: 0, alpha: 1, restore: false },
			bed: { mat: 'mulch', edging: 'steel', shape: 'bed', curved: true, width: 4, height: 2, cap: true, rect: false, outline: true, fill: false, fillMat: 'mulch' },
			select: { many: false },
			measure: { mode: 'dist', zone: 'plant' },
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
		this.multi = { objs: new Set(), ops: new Set() }; // box-select / shift-click: many items at once
		this.marq = null;
		this.activeLayer = null;
		this.selMask = null;
		this.selOp = null;
		this.measPts = [];
		this.peek = null;
		this.orig = null;
		this.adjusted = null;
		this.personPos = null;
		this._raf = 0;
		this._bindEvents();
		// when the stage changes size (e.g. the guide hides or shows), refit only if the picture is still
		// fitted; if the user has zoomed or panned, keep the same spot in the middle instead
		this._fitted = true;
		this._size = null;
		this._ro = new ResizeObserver(() => {
			const r = stage.getBoundingClientRect(), old = this._size;
			this._size = { w: r.width, h: r.height, top: r.top, left: r.left };
			if (!old || !old.w || (this._fitted && Math.abs(r.width - old.w) > 1)) return this.fit();
			// only the stage's top edge moved (the guide hid or came back): keep the picture exactly
			// where it is on screen — even mid-drag or mid-pinch — so nothing jumps under the finger
			const dx = old.left - r.left, dy = old.top - r.top;
			this.ox += dx; this.oy += dy;
			if (this.drag && this.drag.kind === 'pan') { this.drag.ox += dx; this.drag.oy += dy; }
			if (this.pinch) { this.pinch.ox += dx; this.pinch.oy += dy; }
			this._applyView();
		});
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
		this.sel = null; this.selMask = null; this.bedPts = []; this.selOp = null; this.measPts = []; this.peek = null; this.orig = null;
		this.multi = { objs: new Set(), ops: new Set() }; this.marq = null;
		this.activeLayer = view.layers && view.layers.length ? view.layers[view.layers.length - 1].id : null;
		if (!view.meas) view.meas = [];
		this.adjusted = null;
		if (view.kind !== 'aerial' && !view.cam) view.cam = { horizon: Math.round(H * 0.42), camH: 5, focal: Math.round(0.785 * Math.max(W, H)) };
		this.personPos = view.kind === 'aerial' ? { x: W * 0.5, y: H * 0.5 } : { x: W * 0.7, y: Math.round(view.cam.horizon + (H - view.cam.horizon) * 0.3) };
		this.rebuildGround();
		this._invalidateAdj();
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
		for (const op of this.layerOrdered(this.view.ops)) if (!this.isHidden(op)) this._applyOp(op);
		this._composeGround();
	}

	/* -------------------------------------------------------------- layers */
	// view.layers = [{ id, name, hidden, lock }] bottom → top. Items carry `layer`; no `layer` = the base
	// layer ('base', or the first one). Designs without layers behave exactly as before (one layer).

	layers() { return this.view.layers && this.view.layers.length ? this.view.layers : [{ id: 'base', name: 'Layer 1' }]; }
	layerOf(item) {
		const L = this.view.layers;
		if (!L || !L.length) return null;
		return L.find((l) => l.id === (item.layer || 'base')) || L[0];
	}
	_layIdx(item) { const L = this.view.layers, l = this.layerOf(item); return l ? L.indexOf(l) : 0; }
	isHidden(item) { if (item.hidden) return true; const l = this.layerOf(item); return !!(l && l.hidden); }
	isLocked(item) { if (item.lock) return true; const l = this.layerOf(item); return !!(l && l.lock); }
	/** Ops in drawing order: lower layers first, original order within a layer. */
	layerOrdered(ops) {
		if (!this.view.layers || this.view.layers.length < 2) return ops;
		return ops.map((op, i) => [op, i]).sort((a, b) => this._layIdx(a[0]) - this._layIdx(b[0]) || a[1] - b[1]).map((x) => x[0]);
	}
	/** New items go on the active layer. */
	_stamp(item) {
		if (item.layer || !this.view.layers || !this.view.layers.length) return item;
		const L = this.view.layers;
		const a = L.find((l) => l.id === this.activeLayer) || L[L.length - 1];
		if (a.id !== 'base') item.layer = a.id;
		return item;
	}
	_layerSnap() {
		const v = this.view, as = {};
		for (const x of [...v.objects, ...v.ops]) if (x.layer) as[x.id] = x.layer;
		return { layers: v.layers ? JSON.parse(JSON.stringify(v.layers)) : null, as, active: this.activeLayer };
	}
	_layerRestore(s) {
		const v = this.view;
		if (s.layers) v.layers = JSON.parse(JSON.stringify(s.layers)); else delete v.layers;
		for (const x of [...v.objects, ...v.ops]) { if (s.as[x.id]) x.layer = s.as[x.id]; else delete x.layer; }
		this.activeLayer = s.active;
		this.rebuildGround(); this.render();
		this.hooks.onLayers && this.hooks.onLayers();
	}
	/** Any change to layers, as one undo step. */
	_layerChange(label, fn) {
		const before = this._layerSnap();
		fn();
		const after = this._layerSnap();
		this.rebuildGround(); this.render();
		this._push({ label, icon: 'layers', undo: () => this._layerRestore(before), redo: () => this._layerRestore(after) }, false);
		this.changed();
		this.hooks.onLayers && this.hooks.onLayers();
	}
	addLayer(name) {
		let id = null;
		this._layerChange('Added a layer', () => {
			const v = this.view;
			if (!v.layers || !v.layers.length) v.layers = [{ id: 'base', name: 'Layer 1' }];
			id = 'L' + uid();
			v.layers.push({ id, name: (name || 'Layer ' + (v.layers.length + 1)).slice(0, 40) });
			this.activeLayer = id;
		});
		return id;
	}
	setActiveLayer(id) { this.activeLayer = id; this.hooks.onLayers && this.hooks.onLayers(); }
	renameLayer(id, name) {
		this._layerChange('Renamed a layer', () => {
			if (!this.view.layers || !this.view.layers.length) this.view.layers = [{ id: 'base', name: 'Layer 1' }];
			const l = this.view.layers.find((x) => x.id === id);
			if (l) l.name = String(name).slice(0, 40);
		});
	}
	toggleLayer(id, key) {
		this._layerChange(key === 'hidden' ? 'Showed/hid a layer' : 'Locked/unlocked a layer', () => {
			if (!this.view.layers || !this.view.layers.length) this.view.layers = [{ id: 'base', name: 'Layer 1' }];
			const l = this.view.layers.find((x) => x.id === id);
			if (l) l[key] = !l[key];
			if (key === 'hidden' && l && l.hidden) { if (this.sel && this.layerOf(this.sel) === l) this.select(null); if (this.selOp && this.layerOf(this.selOp) === l) this.selectOp(null); this.clearMulti(); }
		});
	}
	moveLayer(id, d) {
		this._layerChange('Reordered layers', () => {
			const L = this.view.layers, i = L ? L.findIndex((x) => x.id === id) : -1, j = i + d;
			if (i < 0 || j < 0 || j >= L.length) return;
			L.splice(j, 0, L.splice(i, 1)[0]);
		});
	}
	/** Delete a layer: its items move to the layer below (or above) — nothing is ever deleted with it. */
	deleteLayer(id) {
		this._layerChange('Deleted a layer (its items were kept)', () => {
			const L = this.view.layers;
			if (!L || L.length < 2) return;
			const i = L.findIndex((x) => x.id === id);
			if (i < 0) return;
			const gone = L[i], to = L[i > 0 ? i - 1 : 1];
			for (const x of [...this.view.objects, ...this.view.ops]) if (this.layerOf(x) === gone) x.layer = to.id;
			L.splice(i, 1);
			if (this.activeLayer === id) this.activeLayer = to.id;
			if (L.length === 1) { for (const x of [...this.view.objects, ...this.view.ops]) delete x.layer; L[0].id = 'base'; this.activeLayer = 'base'; }
		});
	}
	/** Move items (objects and/or ground shapes) to a layer. */
	moveToLayer(items, id) { this._layerChange('Moved to another layer', () => { for (const x of items) { if (id === 'base') delete x.layer; else x.layer = id; } }); }

	/* ---------------------------------------------- ground geometry helpers */

	/** Image point → ground position in feet (null above the horizon). */
	toGround(p) {
		const x = Array.isArray(p) ? p[0] : p.x, y = Array.isArray(p) ? p[1] : p.y;
		if (this.isTop) return [x / this.view.ppf, y / this.view.ppf];
		return groundPoint(x, y, this.view.cam, this.W);
	}
	/** Ground position (feet) → image point. */
	fromGround(g) {
		if (this.isTop) return [g[0] * this.view.ppf, g[1] * this.view.ppf];
		const c = this.view.cam, f = c.focal || 0.785 * this.W, Z = Math.max(0.5, g[1]);
		return [this.W / 2 + (g[0] * f) / Z, c.horizon + ((c.camH || 5) * f) / Z];
	}
	/** Polygon (image px) for a walkway: centerline + width in feet, built on the ground so it narrows with distance. */
	_pathPoly(pts, widthFt, curved) {
		const line = curved && pts.length > 2 ? sampleSmooth(pts, false, 6) : pts;
		const gl = line.map((p) => this.toGround([p[0], this.isTop ? p[1] : Math.max(p[1], this.view.cam.horizon + 2)]));
		if (gl.some((g) => !g)) return line;
		const L = [], R = [], hw = widthFt / 2;
		for (let i = 0; i < gl.length; i++) {
			const a = gl[Math.max(0, i - 1)], b = gl[Math.min(gl.length - 1, i + 1)];
			let dx = b[0] - a[0], dz = b[1] - a[1];
			const n = Math.hypot(dx, dz) || 1;
			dx /= n; dz /= n;
			L.push(this.fromGround([gl[i][0] - dz * hw, gl[i][1] + dx * hw]));
			R.push(this.fromGround([gl[i][0] + dz * hw, gl[i][1] - dx * hw]));
		}
		return [...L, ...R.reverse()];
	}
	/** Retaining wall: bottom line + the same line raised by the wall height (a 1 ft band from above). */
	_wallPoly(pts, heightFt, curved) {
		if (this.isTop) return this._pathPoly(pts, 1, curved);
		const line = curved && pts.length > 2 ? sampleSmooth(pts, false, 6) : pts;
		const top = line.map((p) => [p[0], p[1] - heightFt * this.ppfAt(p[1])]);
		return { poly: [...line, ...top.slice().reverse()], top, line };
	}
	/** The outline that is actually filled for an op (polygon in image px). */
	opPoly(op) {
		if (op.t === 'path') return this._pathPoly(op.pts, op.width || 4, op.curved);
		if (op.t === 'wall') { const w = this._wallPoly(op.pts, op.height || 2, op.curved); return Array.isArray(w) ? w : w.poly; }
		if (op.t === 'poly') return op.straight ? op.pts : sampleSmooth(op.pts, true, 8);
		return null;
	}
	/** Real-world size of an op (≈ for photos). */
	opMeasure(op) {
		const g = (pts) => pts.map((p) => this.toGround(p)).filter(Boolean);
		if (op.t === 'poly') { const gp = g(this.opPoly(op)); return { area: gp.length > 2 ? polyArea(gp) : 0 }; }
		if (op.t === 'path' || op.t === 'edge' || op.t === 'wall') {
			const gp = g(op.curved && op.pts.length > 2 ? sampleSmooth(op.pts, false, 6) : op.pts);
			let L = 0;
			for (let i = 1; i < gp.length; i++) L += Math.hypot(gp[i][0] - gp[i - 1][0], gp[i][1] - gp[i - 1][1]);
			return { length: L, area: op.t === 'path' ? L * (op.width || 4) : 0, face: op.t === 'wall' ? L * (op.height || 2) : 0 };
		}
		return {};
	}

	_opBox(op) {
		if (op.t === 'mask') { const b = op.box; return b ? { x0: b[0], y0: b[1], x1: b[2], y1: b[3] } : null; }
		let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
		const pts = op.t === 'path' || op.t === 'wall' ? this.opPoly(op) : op.pts;
		for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
		const m = (op.t === 'brush' ? op.size / 2 : 4) + 4 + (op.edging || op.t === 'edge' || op.t === 'wall' ? 30 : 0) + (op.soft || 0) * 2;
		x0 = Math.max(0, Math.floor(x0 - m)); y0 = Math.max(0, Math.floor(y0 - m));
		x1 = Math.min(this.W, Math.ceil(x1 + m)); y1 = Math.min(this.H, Math.ceil(y1 + m));
		return x1 > x0 && y1 > y0 ? { x0, y0, x1, y1 } : null;
	}

	_shapePath(ctx, op) {
		ctx.beginPath();
		if (op.t === 'path' || op.t === 'wall' || (op.t === 'poly' && op.straight)) {
			const pp = this.opPoly(op);
			pp.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
			ctx.closePath();
		} else if (op.t === 'edge') smoothOrStraight(ctx, op.pts, false, op.curved);
		else if (op.t === 'poly') smoothPath(ctx, op.pts, true);
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
			if ('filter' in m) m.filter = `blur(${0.8 + (o.soft || 0)}px)`;
			this._shapePath(m, o);
			if (o.t === 'edge') { m.lineWidth = 2; m.stroke(); }
			else if (o.t === 'poly' || o.t === 'path' || o.t === 'wall' || o.pts.length === 1) m.fill();
			else { m.lineWidth = o.size; m.stroke(); }
		}
		const g = this.ground.getContext('2d');
		if (o.t === 'edge') { this._edging(g, { ...o, edging: EDGING[o.edging] ? o.edging : 'steel' }); return; }
		if (o.erase) {
			g.globalCompositeOperation = 'destination-out';
			g.globalAlpha = o.alpha == null ? 1 : o.alpha;
			g.drawImage(mask, bb.x0, bb.y0);
			g.globalAlpha = 1;
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
		if (o.t === 'wall') this._wallFace(t, o, bb);
		g.globalAlpha = o.alpha == null ? 1 : o.alpha;
		g.drawImage(tex, bb.x0, bb.y0);
		g.globalAlpha = 1;
		if ((o.t === 'poly' || o.t === 'path') && o.edging && EDGING[o.edging]) this._edging(g, o);
	}

	/** Block courses, shading and a cap so a wall reads as a vertical face. */
	_wallFace(t, o, bb) {
		if (this.isTop) return;
		const w = this._wallPoly(o.pts, o.height || 2, o.curved);
		t.save();
		t.translate(-bb.x0, -bb.y0);
		t.globalCompositeOperation = 'source-atop';
		t.fillStyle = 'rgba(0,0,0,.18)';
		t.fill(new Path2D(polyD(w.poly)));
		const courses = Math.max(1, Math.round((o.height || 2) * 2));
		t.strokeStyle = 'rgba(0,0,0,.28)';
		for (let k = 1; k < courses; k++) {
			const f = k / courses;
			t.lineWidth = Math.max(0.6, this.ppfAt(w.line[0][1]) * 0.03);
			t.beginPath();
			w.line.forEach((p, i) => { const q = w.top[i]; const x = p[0] + (q[0] - p[0]) * f, y = p[1] + (q[1] - p[1]) * f; if (i) t.lineTo(x, y); else t.moveTo(x, y); });
			t.stroke();
		}
		if (o.cap !== false) {
			t.globalCompositeOperation = 'source-over';
			t.lineJoin = 'round';
			t.strokeStyle = 'rgba(230,226,215,.95)';
			t.lineWidth = Math.max(2, this.ppfAt(w.line[0][1]) * 0.35);
			t.beginPath(); w.top.forEach((p, i) => (i ? t.lineTo(p[0], p[1]) : t.moveTo(p[0], p[1]))); t.stroke();
		}
		t.restore();
	}

	_edging(g, op) {
		const e = EDGING[op.edging];
		let ys = 0;
		for (const p of op.pts) ys += p[1];
		const ppf = this.ppfAt(ys / op.pts.length);
		const wpx = Math.max(1.2, e.ft * ppf);
		g.save();
		g.lineJoin = 'round';
		if (op.t === 'path') {
			const pp = this._pathPoly(op.pts, op.width || 4, op.curved), n = pp.length / 2;
			g.beginPath();
			pp.slice(0, n).forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
			pp.slice(n).forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
		} else if (op.t === 'edge') { g.beginPath(); smoothOrStraight(g, op.pts, false, op.curved); }
		else this._shapePath(g, op);
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
		if (this.peek && live) { ctx.drawImage(this.peek, 0, 0, W, H); ctx.restore(); return; }
		ctx.drawImage(this.adjusted || this.base, 0, 0);
		ctx.drawImage(this.groundShaded, 0, 0);
		const sun = P.sun || -1;
		const objs = this.sortedObjects();
		const lights = [];
		// ground shadows first so they sit under every object
		for (const o of objs) {
			if (this.isTop) continue;
			const { w, item } = this._objSize(o);
			const sh = o.sh || {};
			if (sh.off) continue;
			const k = sh.k == null ? 1 : sh.k, len = sh.len == null ? 1 : sh.len, soft = sh.soft == null ? 0.5 : sh.soft;
			const dir = sh.dir == null ? sun : sh.dir;
			const d = Math.max(6, o.y - (this.view.cam ? this.view.cam.horizon : 0));
			const rx = w * (item.cat === 'features' ? 0.55 : 0.5) * (0.6 + 0.4 * len), ry = Math.max(2, rx * clamp(d / this.view.cam.focal, 0.08, 0.6));
			const cx = o.x - dir * rx * 0.25 * (0.4 + 0.6 * len);
			const g = ctx.createRadialGradient(cx, o.y, 0, cx, o.y, rx);
			g.addColorStop(0, `rgba(0,0,0,${(0.34 * k).toFixed(3)})`); g.addColorStop(clamp(0.95 - soft * 0.5, 0.3, 0.95), `rgba(0,0,0,${(0.18 * k).toFixed(3)})`); g.addColorStop(1, 'rgba(0,0,0,0)');
			ctx.fillStyle = g;
			ctx.save(); ctx.translate(cx, o.y); ctx.scale(1, ry / rx); ctx.beginPath(); ctx.arc(0, 0, rx, 0, 7); ctx.restore();
			ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
			ctx.fill();
			ctx.globalAlpha = 1;
		}
		for (const o of objs) {
			const { w, h, item } = this._objSize(o);
			const sp = sprite(item, { w: this.isTop ? Math.max(w, 4) : w, h, seed: o.seed, season: P.season || 'summer', view: this.isTop ? 'top' : 'side', sun: o.flip ? -sun : sun });
			const sc = this.isTop ? w / Math.max(4, Math.round(Math.max(w, 4) / 3) * 3) : h / Math.max(4, Math.round(h / 3) * 3);
			const dw = sp.c.width * sc, dh = sp.c.height * sc;
			const dx = o.x - sp.ax * sc, dy = o.y - sp.ay * sc;
			ctx.save();
			const sh = o.sh || {};
			if (this.isTop && !sh.off) {
				const k = sh.k == null ? 1 : sh.k, len = sh.len == null ? 1 : sh.len;
				ctx.shadowColor = `rgba(0,0,0,${(0.4 * k).toFixed(3)})`;
				ctx.shadowBlur = Math.max(2, w * 0.06 * (0.5 + (sh.soft == null ? 0.5 : sh.soft) * 2));
				ctx.shadowOffsetX = -(sh.dir == null ? sun : sh.dir) * w * 0.18 * len;
				ctx.shadowOffsetY = w * 0.14 * len;
			}
			ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
			if ('filter' in ctx) ctx.filter = objFilter(o.fx);
			const rot = ((o.rot || 0) * Math.PI) / 180;
			if (rot) { ctx.translate(o.x, o.y); ctx.rotate(rot); ctx.translate(-o.x, -o.y); }
			if (o.flip) { ctx.translate(o.x, 0); ctx.scale(-1, 1); ctx.translate(-o.x, 0); }
			if (o.flipV) { const cy = dy + dh / 2; ctx.translate(0, cy); ctx.scale(1, -1); ctx.translate(0, -cy); }
			ctx.drawImage(sp.c, dx, dy, dw, dh);
			ctx.restore();
			const bb = this.isTop
				? { x0: o.x - w / 2, y0: o.y - w / 2, x1: o.x + w / 2, y1: o.y + w / 2 }
				: { x0: o.x - w / 2 - 2, y0: o.y - h - 2, x1: o.x + w / 2 + 2, y1: o.y + 3 };
			o._bb = rot ? rotBox(bb, o.x, o.y, rot) : bb;
			for (const L of sp.lights) lights.push({ x: o.x + (L.x - sp.ax) * sc * (o.flip ? -1 : 1), y: o.y + (L.y - sp.ay) * sc, r: L.r * sc, col: L.col, k: L.k });
		}
		if (P.night) this._night(ctx, lights);
		if (live || this.showMeasOnExport) this._drawMeas(ctx, live, 'saved');
		ctx.restore();
		void W; void H; void live;
	}

	/** Back-to-front drawing order: depth in the photo, then manual layer order (zd). */
	sortedObjects(all) {
		// upper layers always draw above lower ones; inside a layer, natural depth then manual order
		const key = (o) => this._layIdx(o) * 1e9 + (o.zd || 0) * 1e7 + (this.isTop ? (byId[o.item] ? byId[o.item].h : 0) * 1000 + (o.z || 0) : o.y + (o.z || 0) * 1e-3);
		return this.view.objects.filter((o) => byId[o.item] && (all || !this.isHidden(o))).sort((a, b) => key(a) - key(b));
	}

	/* ---------------------------------------------------------- measuring */
	measText(m) {
		const g = m.pts.map((p) => this.toGround(p));
		const approx = this.isTop ? '' : '≈ ';
		if (g.some((x) => !x)) return 'above the horizon — can’t measure';
		if (m.t === 'dist') return approx + fmtFtIn(Math.hypot(g[1][0] - g[0][0], g[1][1] - g[0][1]));
		const a = polyArea(g);
		let per = 0;
		for (let i = 0; i < g.length; i++) { const q = g[(i + 1) % g.length]; per += Math.hypot(q[0] - g[i][0], q[1] - g[i][1]); }
		return `${approx}${Math.round(a).toLocaleString()} sq ft · ${fmtFtIn(per)} around`;
	}
	_drawMeas(ctx, live, part) {
		const list = part === 'saved' ? (this.view.meas || []).filter((m) => !m.hidden) : [];
		const temp = part === 'temp' && live && this.tool === 'measure' && this.measPts.length;
		if (!temp && !(list.length && (this.showMeas || this.tool === 'measure' || !live))) return;
		const z = live ? this.z : 1;
		const draw = (m, dashed) => {
			const col = m.t === 'zone' ? (ZONES[m.kind] || ZONES.area)[1] : '#5cc8ff';
			ctx.save();
			ctx.lineWidth = 2.2 / z; ctx.strokeStyle = col; ctx.fillStyle = col;
			if (m.t !== 'dist' && m.pts.length > 2) { ctx.globalAlpha = 0.16; ctx.beginPath(); m.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1; }
			ctx.setLineDash(dashed ? [7 / z, 5 / z] : []);
			ctx.beginPath(); m.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); if (m.t !== 'dist' && m.pts.length > 2) ctx.closePath(); ctx.stroke();
			ctx.setLineDash([]);
			for (const p of m.pts) { ctx.beginPath(); ctx.arc(p[0], p[1], 4 / z, 0, 7); ctx.fill(); }
			if ((m.t === 'dist' && m.pts.length === 2) || (m.t !== 'dist' && m.pts.length > 2)) {
				const cx = m.pts.reduce((a, p) => a + p[0], 0) / m.pts.length, cy = m.pts.reduce((a, p) => a + p[1], 0) / m.pts.length;
				const txt = (m.t === 'zone' ? (m.label || (ZONES[m.kind] || ZONES.area)[0]) + ': ' : m.label ? m.label + ': ' : '') + this.measText(m);
				ctx.font = `700 ${13 / z}px system-ui, sans-serif`;
				const tw = ctx.measureText(txt).width;
				ctx.fillStyle = 'rgba(10,20,15,.82)';
				ctx.fillRect(cx - tw / 2 - 6 / z, cy - 11 / z, tw + 12 / z, 22 / z);
				ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
				ctx.fillText(txt, cx, cy);
			}
			ctx.restore();
		};
		if (this.showMeas || this.tool === 'measure' || !live) for (const m of list) draw(m, false);
		if (temp) {
			const pts = this.hover ? [...this.measPts, [this.hover.x, this.hover.y]] : this.measPts;
			draw({ t: this.opts.measure.mode, kind: this.opts.measure.zone, pts }, true);
		}
	}
	addMeasurePoint(p) {
		const mode = this.opts.measure.mode;
		const f = this.measPts[0];
		if (mode !== 'dist' && this.measPts.length > 2 && Math.hypot(p.x - f[0], p.y - f[1]) < 14 / this.z) return this.finishMeasure();
		this.measPts.push([p.x, p.y]);
		if (mode === 'dist' && this.measPts.length === 2) return this.finishMeasure();
		this.render();
		this.hooks.onMeasure && this.hooks.onMeasure(this.measPts.length);
	}
	finishMeasure() {
		const mode = this.opts.measure.mode;
		if ((mode === 'dist' && this.measPts.length < 2) || (mode !== 'dist' && this.measPts.length < 3)) return null;
		const m = { id: uid(), t: mode, kind: mode === 'zone' ? this.opts.measure.zone : '', pts: this.measPts.slice(), label: '' };
		this.measPts = [];
		const v = this.view;
		v.meas = v.meas || [];
		v.meas.push(m);
		this._push({ label: mode === 'dist' ? 'Measured a distance' : mode === 'zone' ? 'Marked a ' + (ZONES[m.kind] || ZONES.area)[0].toLowerCase() : 'Measured an area', icon: 'scale', undo: () => v.meas.splice(v.meas.indexOf(m), 1), redo: () => v.meas.push(m) }, false);
		this.changed();
		this.hooks.onMeasure && this.hooks.onMeasure(0, m);
		return m;
	}
	cancelMeasure() { this.measPts = []; this.render(); this.hooks.onMeasure && this.hooks.onMeasure(0); }
	removeMeasure(m) {
		const v = this.view, i = v.meas.indexOf(m);
		if (i < 0) return;
		v.meas.splice(i, 1);
		this._push({ label: 'Removed a measurement', icon: 'trash', undo: () => v.meas.splice(i, 0, m), redo: () => v.meas.splice(v.meas.indexOf(m), 1) }, false);
		this.changed();
	}

	/* ------------------------------------------------- photo adjustments */
	_invalidateAdj() { this.adjusted = null; if (this.view && hasAdjust(this.view.adj)) this._adjSoon(); }
	_adjSoon() {
		if (this._adjT) return;
		this._adjT = requestAnimationFrame(() => {
			this._adjT = 0;
			if (!this.view) return;
			this.adjusted = hasAdjust(this.view.adj) ? applyAdjust(this.base, this.view.adj, this.view.kind === 'aerial' ? null : this.view.cam) : null;
			this.render();
		});
	}
	/** Live preview while dragging a slider; commit=true records one history step. */
	setAdjust(adj, commit, before) {
		const v = this.view;
		v.adj = { ...adj };
		this._adjSoon();
		if (commit) {
			const a0 = { ...(before || {}) }, a1 = { ...v.adj };
			this._push({ label: 'Adjusted the photo', icon: 'sun', undo: () => { v.adj = a0; this._invalidateAdj(); this._adjSoon(); }, redo: () => { v.adj = a1; this._invalidateAdj(); this._adjSoon(); } }, false);
			this.changed();
		}
	}
	/** Show the untouched photo (no design) while held. */
	setPeek(img) { this.peek = img || null; this.render(); }
	setOriginal(img) { this.orig = img || null; }

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
		// selected ground shape: outline + corner handles
		if (this.selOp && this.view.ops.includes(this.selOp)) {
			const op = this.selOp;
			ctx.save();
			ctx.strokeStyle = accent; ctx.lineWidth = lw * 1.6; ctx.setLineDash([7 / z, 5 / z]);
			const pp = this.opPoly(op);
			ctx.beginPath();
			if (pp) { pp.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); }
			else op.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
			ctx.stroke();
			ctx.setLineDash([]);
			ctx.fillStyle = '#fff';
			for (const p of op.pts) { ctx.beginPath(); ctx.arc(p[0], p[1], 7 / z, 0, 7); ctx.fill(); ctx.stroke(); }
			ctx.restore();
		}
		// many selected: a dashed box or outline on each, plus the selection box being dragged
		if (this.multiCount()) {
			ctx.save();
			ctx.strokeStyle = accent; ctx.lineWidth = lw * 1.6; ctx.setLineDash([6 / z, 4 / z]);
			for (const o of this.multi.objs) if (o._bb) { const b = o._bb; ctx.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0); }
			for (const op of this.multi.ops) {
				const pp = this.opPoly(op);
				ctx.beginPath();
				(pp || op.pts).forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
				if (pp) ctx.closePath();
				ctx.stroke();
			}
			ctx.restore();
		}
		if (this.marq) {
			const r = this.marq;
			ctx.save();
			ctx.fillStyle = 'rgba(123,224,160,.12)'; ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
			ctx.strokeStyle = accent; ctx.lineWidth = lw * 1.4; ctx.setLineDash([5 / z, 4 / z]); ctx.strokeRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
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
		if (this.tool === 'bed' && this.rectDrag) {
			ctx.save(); ctx.strokeStyle = accent; ctx.lineWidth = lw * 2; ctx.fillStyle = 'rgba(123,224,160,.18)';
			ctx.beginPath(); this.rectDrag.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.fill(); ctx.stroke();
			const m = this.opMeasure({ t: 'poly', straight: true, pts: this.rectDrag.pts });
			ctx.font = `700 ${14 / z}px system-ui`; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
			const c0 = this.rectDrag.pts[2];
			ctx.fillText((this.isTop ? '' : '≈ ') + Math.round(m.area || 0) + ' sq ft', c0[0], c0[1] + 18 / z);
			ctx.restore();
		}
		// loops: dashed outline while unfilled, and a name label so "Bed 1" / "Bed 2" can be filled separately
		if (this.tool === 'bed' || this.tool === 'select') {
			ctx.save();
			for (const op of this.loops()) {
				if (this.isHidden(op)) continue;
				const unfilled = !op.mat;
				if (unfilled) {
					const pp = this.opPoly(op);
					ctx.beginPath(); pp.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath();
					ctx.fillStyle = 'rgba(123,224,160,.10)'; ctx.fill();
					ctx.strokeStyle = '#fff'; ctx.lineWidth = lw * 3; ctx.stroke();
					ctx.strokeStyle = accent; ctx.lineWidth = lw * 1.6; ctx.setLineDash([8 / z, 5 / z]); ctx.stroke(); ctx.setLineDash([]);
				}
				if (this.tool === 'bed' || unfilled) {
					const [cx, cy] = this.loopCenter(op), txt = (op.name || opName(op)) + (unfilled ? ' · no fill yet' : '');
					ctx.font = `700 ${13 / z}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
					const tw = ctx.measureText(txt).width + 14 / z, th = 22 / z;
					ctx.fillStyle = 'rgba(16,28,20,.82)';
					ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(cx - tw / 2, cy - th / 2, tw, th, th / 2); else ctx.rect(cx - tw / 2, cy - th / 2, tw, th); ctx.fill();
					ctx.fillStyle = '#fff'; ctx.fillText(txt, cx, cy + 0.5 / z);
				}
			}
			ctx.restore();
		}
		if (this.tool === 'bed' && this.bedPts.length) {
			const B = this.opts.bed, closed = this.bedCloses();
			const snap = this.hover && this.nearStart(this.hover);
			const pts = this.hover ? [...this.bedPts, snap ? this.bedPts[0] : [this.hover.x, this.hover.y]] : this.bedPts;
			ctx.save();
			if (!closed && pts.length > 1 && (B.shape === 'walkway' || B.shape === 'wall')) {
				const pp = B.shape === 'walkway' ? this._pathPoly(pts, B.width, B.curved) : (() => { const w = this._wallPoly(pts, B.height, B.curved); return Array.isArray(w) ? w : w.poly; })();
				ctx.beginPath(); pp.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
				ctx.fillStyle = 'rgba(123,224,160,.25)'; ctx.fill();
			}
			ctx.beginPath();
			if (B.curved) smoothPath(ctx, pts, closed && pts.length > 2);
			else { pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); if (closed && pts.length > 2) ctx.closePath(); }
			ctx.fillStyle = 'rgba(123,224,160,.18)'; if (pts.length > 2) ctx.fill();
			ctx.strokeStyle = accent; ctx.lineWidth = lw * 2; ctx.setLineDash([8 / z, 5 / z]); ctx.stroke();
			ctx.setLineDash([]);
			this.bedPts.forEach((p, i) => {
				if (!i) return;
				ctx.fillStyle = '#fff';
				ctx.beginPath(); ctx.arc(p[0], p[1], 5 / z, 0, 7); ctx.fill();
				ctx.strokeStyle = '#123'; ctx.lineWidth = lw; ctx.stroke();
			});
			// the start point: big, labelled, and it lights up when the next tap will close the loop
			const s0 = this.bedPts[0], canClose = closed && this.bedPts.length > 2, R = 16 / z;
			if (canClose && !snap && !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) {
				const t = (performance.now() % 1400) / 1400;
				ctx.strokeStyle = `rgba(123,224,160,${(1 - t).toFixed(2)})`; ctx.lineWidth = lw * 2;
				ctx.beginPath(); ctx.arc(s0[0], s0[1], R * (1 + t * 0.8), 0, 7); ctx.stroke();
				if (!this._pulse) this._pulse = requestAnimationFrame(() => { this._pulse = 0; if (this.tool === 'bed' && this.bedPts.length > 2) this._drawOverlay(); });
			}
			ctx.fillStyle = snap ? accent : 'rgba(16,28,20,.85)';
			ctx.beginPath(); ctx.arc(s0[0], s0[1], snap ? R * 1.15 : R, 0, 7); ctx.fill();
			ctx.strokeStyle = accent; ctx.lineWidth = lw * 2.5; ctx.stroke();
			ctx.fillStyle = snap ? '#0b2a18' : '#fff'; ctx.font = `800 ${12 / z}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
			ctx.fillText(snap ? '✓' : 'S', s0[0], s0[1] + 0.5 / z);
			const tip = snap ? 'Close loop' : canClose ? 'Start — tap here to close' : 'Start';
			ctx.font = `700 ${13 / z}px system-ui`;
			const tw = ctx.measureText(tip).width + 16 / z, th = 24 / z, ty = s0[1] - R - th - 6 / z;
			ctx.fillStyle = snap ? accent : 'rgba(16,28,20,.88)';
			ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(s0[0] - tw / 2, ty, tw, th, th / 2); else ctx.rect(s0[0] - tw / 2, ty, tw, th); ctx.fill();
			ctx.fillStyle = snap ? '#0b2a18' : '#fff'; ctx.fillText(tip, s0[0], ty + th / 2 + 0.5 / z);
			ctx.restore();
		}
		if (this.tool === 'measure') this._drawMeas(ctx, true, 'temp');
		// magic eraser selection
		if ((this.tool === 'eraser' || this.tool === 'ai') && this.selMaskCanvas) {
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
		this._fitted = true;
		this._applyView();
	}
	zoomBy(f, cx, cy) {
		const r = this.stage.getBoundingClientRect();
		if (cx == null) { cx = r.width / 2; cy = r.height / 2; }
		const nz = clamp(this.z * f, 0.05, 8);
		this.ox = cx - (cx - this.ox) * (nz / this.z);
		this.oy = cy - (cy - this.oy) * (nz / this.z);
		this.z = nz;
		this._fitted = false;
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
		if (t !== 'select') this.clearMulti(true);
		if (t !== 'measure') this.measPts = [];
		if (t !== 'select' && this.selOp) this.selectOp(null);
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
		const list = this.sortedObjects().reverse();
		for (const o of list) {
			if (this.isLocked(o)) continue;
			const b = o._bb;
			if (b && p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1) return o;
		}
		return null;
	}

	select(o) {
		if (o && this.selOp) this.selectOp(null);
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
		// mouse wheel / trackpad pinch zooms the drawing around the pointer — only while over the canvas
		st.addEventListener('wheel', (e) => {
			e.preventDefault();
			const r = this.stage.getBoundingClientRect();
			let dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * r.height : e.deltaY;
			dy = clamp(dy, -240, 240);
			this.zoomBy(Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.002)), e.clientX - r.left, e.clientY - r.top);
		}, { passive: false });
		st.addEventListener('contextmenu', (e) => e.preventDefault());
	}

	_down(e) {
		this.ptrType = e.pointerType || 'mouse';
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
				if (this.selOp) {
					const vi = this.selOp.pts.findIndex((q) => Math.hypot(q[0] - p.x, q[1] - p.y) < 14 / this.z);
					if (vi >= 0) { this.drag = { kind: 'opvert', op: this.selOp, i: vi, before: JSON.parse(JSON.stringify(this.selOp.pts)) }; return; }
				}
				const o = this._hit(p);
				const op = o ? null : this._hitOp(p);
				const hit = o || (op && op.t !== 'mask' ? op : null);
				// shift-click adds/removes items from a multi-selection
				if (e.shiftKey && hit) { this._toggleMulti(hit); return; }
				// pressing on one of several selected items moves them all together
				if (hit && this.multiCount() > 1 && this._inMulti(hit)) { this.drag = { kind: 'multimove', from: [p.x, p.y], before: this._multiSnap() }; return; }
				if (hit) this.clearMulti(true);
				if (o) { this.select(o); this.drag = { kind: 'move', o, dx: p.x - o.x, dy: p.y - o.y, x0: o.x, y0: o.y }; break; }
				if (op) { this.select(null); this.selectOp(op); this.drag = { kind: 'opmove', op, from: [p.x, p.y], before: JSON.parse(JSON.stringify(op.pts)) }; break; }
				this.select(null);
				this.selectOp(null);
				this.clearMulti(true);
				// empty canvas: mouse/pen drag draws a selection box; one finger pans unless "Select many" is on
				if (this.ptrType !== 'touch' || this.opts.select.many) { this.drag = { kind: 'marquee', a: [p.x, p.y] }; this.marq = null; break; }
				this.drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, ox: this.ox, oy: this.oy };
				break;
			}
			case 'place': {
				if (!this.placeItem) return;
				const o = this.addObject(this.placeItem, p.x, p.y);
				if (!e.shiftKey) { this.setTool('select'); this.select(o); }
				break;
			}
			case 'paint': {
				const P2 = this.opts.paint;
				if (P2.restore) {
					if (!this.orig) { if (this.hooks.toast) this.hooks.toast('This view has no photo changes to restore.'); return; }
					this.restoreStroke = { size: P2.size, soft: P2.soft || 0, before: this.bctx.getImageData(0, 0, this.W, this.H), last: [p.x, p.y] };
					this._restoreDab([p.x, p.y], [p.x, p.y]);
					break;
				}
				this.stroke = { id: uid(), t: 'brush', mat: P2.mat, size: P2.size, erase: P2.erase, soft: P2.soft || 0, alpha: P2.alpha == null ? 1 : P2.alpha, pts: [[p.x, p.y]] };
				this._applyOp(this.stroke);
				this._composeGround();
				this.render();
				break;
			}
			case 'measure':
				this.addMeasurePoint(p);
				break;
			case 'bed': {
				const B = this.opts.bed;
				if (B.rect && (B.shape === 'patio' || B.shape === 'bed' || B.shape === 'lawn') && !this.bedPts.length) { this.drag = { kind: 'rect', a: [p.x, p.y] }; return; }
				// Fill tool: tap a loop to fill it with the chosen material
				if (B.fill && !this.bedPts.length) {
					const hitL = this._hitOp(p);
					if (hitL && hitL.t === 'poly') this.fillLoops([hitL], B.fillMat);
					else if (this.hooks.toast) this.hooks.toast('Tap inside a closed shape to fill it.');
					return;
				}
				if (this.nearStart(p)) { this.finishBed(); return; }
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
			this._fitted = false;
			this.ox = cx - (cx - this.pinch.ox) * (nz / this.pinch.z) + (mx - this.pinch.mx);
			this.oy = cy - (cy - this.pinch.oy) * (nz / this.pinch.z) + (my - this.pinch.my);
			this._applyView();
			return;
		}
		const p = this.toImage(e);
		this.hover = p;
		const d = this.drag;
		if (d) {
			if (d.kind === 'pan') { this._fitted = false; this.ox = d.ox + e.clientX - d.sx; this.oy = d.oy + e.clientY - d.sy; this._applyView(); return; }
			if (d.kind === 'move') { d.o.x = clamp(p.x - d.dx, 0, this.W); d.o.y = clamp(p.y - d.dy, 0, this.H); d.moved = true; this.render(); return; }
			if (d.kind === 'scale') {
				const dist = Math.hypot(p.x - d.o.x, p.y - d.o.y);
				d.o.scale = clamp(d.s0 * (dist / Math.max(1, d.ref)), 0.3, 3);
				d.moved = true; this.render(); this.hooks.onSelect && this.hooks.onSelect(d.o, true); return;
			}
			if (d.kind === 'horizon') { this.view.cam.horizon = Math.round(clamp(p.y, -this.H, this.H - 20)); this.render(); this._drawOverlay(); this._horizonDirty = true; return; }
			if (d.kind === 'person') { this.personPos = { x: p.x - d.dx, y: p.y - d.dy }; this._drawOverlay(); return; }
			if (d.kind === 'selbrush') { this._selBrush(p, this.opts.eraser.brush === 'add'); return; }
			if (d.kind === 'opvert') { d.op.pts[d.i] = [p.x, p.y]; d.moved = true; this._rebuildSoon(); return; }
			if (d.kind === 'opmove') { const dx = p.x - d.from[0], dy = p.y - d.from[1]; d.op.pts = d.before.map((q) => [q[0] + dx, q[1] + dy]); d.moved = true; this._rebuildSoon(); return; }
			if (d.kind === 'rect') { this.rectDrag = { pts: this._groundRect(d.a, [p.x, p.y]) }; this._drawOverlay(); return; }
			if (d.kind === 'marquee') { this.marq = { x0: Math.min(d.a[0], p.x), y0: Math.min(d.a[1], p.y), x1: Math.max(d.a[0], p.x), y1: Math.max(d.a[1], p.y) }; this._drawOverlay(); return; }
			if (d.kind === 'multimove') { this._multiApply(d.before, p.x - d.from[0], p.y - d.from[1]); d.moved = true; return; }
		}
		if (this.restoreStroke) {
			const r = this.restoreStroke, st = Math.max(2, r.size * 0.15);
			if (Math.hypot(p.x - r.last[0], p.y - r.last[1]) >= st) { this._restoreDab(r.last, [p.x, p.y]); r.last = [p.x, p.y]; }
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

	_rebuildSoon() {
		if (this._rb) return;
		this._rb = requestAnimationFrame(() => { this._rb = 0; this.rebuildGround(); this.render(); });
	}
	/** Rectangle drawn on the ground (so it follows perspective in photos). */
	_groundRect(a, b) {
		const ga = this.toGround(a), gb = this.toGround(b);
		if (!ga || !gb) return [a, [b[0], a[1]], b, [a[0], b[1]]];
		return [ga, [gb[0], ga[1]], gb, [ga[0], gb[1]]].map((g) => this.fromGround(g));
	}
	/** "Restore original" brush: paint the untouched photo back over erasures and AI edits. */
	_restoreDab(a, b) {
		const r = this.restoreStroke;
		const m = canvas(this.W, this.H), mx = m.getContext('2d');
		mx.lineCap = 'round'; mx.lineWidth = r.size; mx.strokeStyle = '#000';
		if (r.soft && 'filter' in mx) mx.filter = `blur(${r.soft}px)`;
		mx.beginPath(); mx.moveTo(a[0], a[1]); mx.lineTo(b[0] + 0.01, b[1]); mx.stroke();
		if ('filter' in mx) mx.filter = 'none';
		mx.globalCompositeOperation = 'source-in';
		mx.drawImage(this.orig, 0, 0, this.W, this.H);
		this.bctx.drawImage(m, 0, 0);
		this.adjusted = null;
		this._adjSoon();
		this.render();
	}
	_endRestore() {
		const r = this.restoreStroke;
		this.restoreStroke = null;
		const before = r.before, after = this.bctx.getImageData(0, 0, this.W, this.H);
		const apply = (data) => { this.bctx.putImageData(data, 0, 0); this._buildShade(); this._composeGround(); this._invalidateAdj(); this.render(); this.changed('image'); };
		this._push({ label: 'Restored part of the original photo', icon: 'undo', undo: () => apply(before), redo: () => apply(after) }, false);
		this._buildShade(); this._composeGround(); this._invalidateAdj(); this.changed('image');
	}
	_hitOp(p) {
		for (let i = this.view.ops.length - 1; i >= 0; i--) {
			const op = this.view.ops[i];
			if (this.isHidden(op) || this.isLocked(op) || op.erase) continue;
			if (op.t === 'edge') {
				for (let k = 1; k < op.pts.length; k++) if (segDist([p.x, p.y], op.pts[k - 1], op.pts[k]) < 12 / this.z) return op;
				continue;
			}
			const pp = this.opPoly(op);
			if (pp && pointInPoly([p.x, p.y], pp)) return op;
		}
		return null;
	}
	selectOp(op) {
		if (this.selOp === op) return;
		this.selOp = op;
		if (op && this.sel) this.sel = null;
		if (this.hooks.onSelectOp) this.hooks.onSelectOp(op);
		this._drawOverlay();
	}
	/** Change a ground shape (material, edging, width, height, curved, hidden, alpha, …), undoable. */
	updateOp(op, patch, label) {
		const before = {};
		for (const k in patch) before[k] = op[k] === undefined ? undefined : JSON.parse(JSON.stringify(op[k]));
		Object.assign(op, patch);
		const after = JSON.parse(JSON.stringify(patch));
		this.rebuildGround();
		this._push({ label: label || 'Changed a ' + opName(op), icon: 'bed', key: 'op' + op.id + Object.keys(patch).join(), undo: () => { Object.assign(op, before); this.rebuildGround(); }, redo: () => { Object.assign(op, after); this.rebuildGround(); } }, true);
		this.changed();
	}
	scaleOp(op, k) {
		const cx = op.pts.reduce((a, q) => a + q[0], 0) / op.pts.length, cy = op.pts.reduce((a, q) => a + q[1], 0) / op.pts.length;
		this.updateOp(op, { pts: op.pts.map((q) => [cx + (q[0] - cx) * k, cy + (q[1] - cy) * k]) }, k > 1 ? 'Made a ' + opName(op) + ' bigger' : 'Made a ' + opName(op) + ' smaller');
	}
	deleteOp(op) {
		const v = this.view, i = v.ops.indexOf(op);
		if (i < 0) return;
		v.ops.splice(i, 1);
		if (this.selOp === op) this.selectOp(null);
		this.rebuildGround();
		this._push({ label: 'Removed a ' + opName(op), icon: 'trash', undo: () => { v.ops.splice(i, 0, op); this.rebuildGround(); }, redo: () => { v.ops.splice(v.ops.indexOf(op), 1); this.rebuildGround(); } }, false);
		this.changed();
	}
	duplicateOp(op) {
		if (op.t === 'mask') return null;
		const c = JSON.parse(JSON.stringify(op));
		c.id = uid();
		c.pts = c.pts.map((q) => [q[0] + 24, q[1] + 12]);
		c.label = 'Copied a ' + opName(op);
		this.addOp(c);
		this.selectOp(c);
		return c;
	}
	moveOp(op, d) {
		const v = this.view, i = v.ops.indexOf(op), j = clamp(i + d, 0, v.ops.length - 1);
		if (i < 0 || i === j) return;
		v.ops.splice(i, 1); v.ops.splice(j, 0, op);
		this.rebuildGround();
		this._push({ label: d > 0 ? 'Moved a shape up' : 'Moved a shape down', icon: 'layers', undo: () => { v.ops.splice(j, 1); v.ops.splice(i, 0, op); this.rebuildGround(); }, redo: () => { v.ops.splice(i, 1); v.ops.splice(j, 0, op); this.rebuildGround(); } }, false);
		this.changed();
	}

	_composeGroundSoon() {
		if (this._cg) return;
		this._cg = requestAnimationFrame(() => { this._cg = 0; this._composeGround(); this.render(); });
	}

	_up(e) {
		this.pointers.delete(e.pointerId);
		if (this.pointers.size < 2) this.pinch = null;
		if (this.stroke) this._endStroke();
		if (this.restoreStroke) this._endRestore();
		const d = this.drag;
		this.drag = null;
		if (!d) return;
		if ((d.kind === 'opvert' || d.kind === 'opmove') && d.moved) {
			const op = d.op, before = d.before, after = JSON.parse(JSON.stringify(op.pts));
			this.rebuildGround();
			this._push({ label: (d.kind === 'opvert' ? 'Reshaped a ' : 'Moved a ') + opName(op), icon: 'bed', undo: () => { op.pts = JSON.parse(JSON.stringify(before)); this.rebuildGround(); }, redo: () => { op.pts = JSON.parse(JSON.stringify(after)); this.rebuildGround(); } }, false);
			this.changed();
			if (this.hooks.onSelectOp) this.hooks.onSelectOp(op, true);
		}
		if (d.kind === 'marquee') {
			const r = this.marq;
			this.marq = null;
			if (r && (r.x1 - r.x0) * this.z > 4 && (r.y1 - r.y0) * this.z > 4) this._boxSelect(r);
			else this._drawOverlay();
		}
		if (d.kind === 'multimove' && d.moved) {
			const before = d.before, after = this._multiSnap();
			this._push({ label: `Moved ${this.multiCount()} items together`, icon: 'hand', undo: () => this._multiRestore(before), redo: () => this._multiRestore(after) }, false);
			this.changed();
		}
		if (d.kind === 'rect') {
			const r = this.rectDrag;
			this.rectDrag = null;
			if (r && Math.hypot(r.pts[2][0] - r.pts[0][0], r.pts[2][1] - r.pts[0][1]) > 10) { this.bedPts = r.pts; this.finishBed(true); }
			else this._drawOverlay();
		}
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
		const op = this._stamp(this.stroke);
		this.stroke = null;
		this.view.ops.push(op);
		if (this.view.layers && this.view.layers.length > 1) this.rebuildGround(); else this._composeGround();
		this._push({
			label: op.erase ? 'Erased paint' : 'Painted ' + (op.mat || 'ground'), icon: 'paint',
			undo: () => { this.view.ops.splice(this.view.ops.indexOf(op), 1); this.rebuildGround(); },
			redo: () => { this.view.ops.push(op); this.rebuildGround(); }
		}, false);
		this.changed();
	}

	finishBed(fromRect) {
		const B = this.opts.bed, line = B.shape === 'walkway' || B.shape === 'wall' || B.shape === 'edge';
		if (this.bedPts.length < (line ? 2 : 3)) { if (this.hooks.toast) this.hooks.toast(line ? 'Tap at least 2 points along it.' : 'Tap at least 3 points around the shape.'); return; }
		const pts = this.bedPts.slice();
		const label = { bed: 'Drew a bed', patio: 'Drew a patio', lawn: 'Drew a lawn area', walkway: 'Drew a walkway', wall: 'Built a retaining wall', edge: 'Added edging' }[B.shape] || 'Drew a bed';
		const ed = B.edging === 'none' ? null : B.edging;
		const op = B.shape === 'walkway' ? { id: uid(), t: 'path', mat: B.mat, edging: ed, width: B.width, curved: B.curved, pts, label }
			: B.shape === 'wall' ? { id: uid(), t: 'wall', mat: B.mat, height: B.height, cap: B.cap, curved: B.curved, pts, label }
				: B.shape === 'edge' ? { id: uid(), t: 'edge', edging: ed || 'steel', curved: B.curved, pts, label }
					: { id: uid(), t: 'poly', mat: B.outline ? '' : B.mat, edging: B.shape === 'lawn' ? null : ed, straight: !!fromRect || !B.curved, kind: B.shape, pts, label, name: this._nextLoopName(B.shape) };
		this.bedPts = [];
		this.addOp(op);
		this.hooks.onBed && this.hooks.onBed(0);
	}
	cancelBed() { this.bedPts = []; this._drawOverlay(); this.hooks.onBed && this.hooks.onBed(0); }
	/** Step back one point while drawing. */
	backPoint() { this.bedPts.pop(); this._drawOverlay(); this.hooks.onBed && this.hooks.onBed(this.bedPts.length); }
	/** Does this shape close into a loop (bed, patio, lawn) rather than run as a line? */
	bedCloses() { const s = this.opts.bed.shape; return s === 'bed' || s === 'patio' || s === 'lawn'; }
	/** Is p close enough to the start point to close the loop? Generous, and bigger for fingers. */
	nearStart(p) {
		const f = this.bedPts[0];
		if (!f || this.bedPts.length < 3 || !this.bedCloses()) return false;
		return Math.hypot(p.x - f[0], p.y - f[1]) < (this.ptrType === 'touch' ? 34 : 24) / this.z;
	}
	/** "Bed 3", "Patio 1", "Lawn 2" — the next free name for a new loop. */
	_nextLoopName(kind) {
		const base = { bed: 'Bed', patio: 'Patio', lawn: 'Lawn' }[kind] || 'Area';
		let n = 1;
		const used = new Set(this.view.ops.map((o) => o.name));
		while (used.has(base + ' ' + n)) n++;
		return base + ' ' + n;
	}
	/** Closed loops on this view (beds, patios, lawn areas), in drawing order. */
	loops() { return this.view.ops.filter((o) => o.t === 'poly' && !o.erase); }
	/** Fill one or many loops with a material — one undo step. */
	fillLoops(ops, mat) {
		ops = ops.filter((o) => o && !this.isLocked(o));
		if (!ops.length) return;
		const before = ops.map((o) => o.mat);
		for (const o of ops) o.mat = mat;
		this.rebuildGround();
		const name = ops.length === 1 ? (ops[0].name || opName(ops[0])) : ops.length + ' shapes';
		this._push({ label: 'Filled ' + name, icon: 'paint', undo: () => { ops.forEach((o, i) => { o.mat = before[i]; }); this.rebuildGround(); }, redo: () => { for (const o of ops) o.mat = mat; this.rebuildGround(); } }, false);
		this.changed();
		this.hooks.onBed && this.hooks.onBed(0);
	}
	/** Where to put a loop's label: the centre of its outline. */
	loopCenter(op) {
		const pp = this.opPoly(op) || op.pts;
		let a = 0, cx = 0, cy = 0;
		for (let i = 0, j = pp.length - 1; i < pp.length; j = i++) {
			const f = pp[j][0] * pp[i][1] - pp[i][0] * pp[j][1];
			a += f; cx += (pp[j][0] + pp[i][0]) * f; cy += (pp[j][1] + pp[i][1]) * f;
		}
		if (Math.abs(a) < 1e-6) return pp.reduce((m, q) => [m[0] + q[0] / pp.length, m[1] + q[1] / pp.length], [0, 0]);
		return [cx / (3 * a), cy / (3 * a)];
	}

	/* ------------------------------------------------- many at once */

	multiCount() { return this.multi.objs.size + this.multi.ops.size; }
	multiItems() { return [...this.multi.objs, ...this.multi.ops]; }
	_inMulti(x) { return this.multi.objs.has(x) || this.multi.ops.has(x); }
	clearMulti(quiet) {
		if (!this.multiCount()) return;
		this.multi = { objs: new Set(), ops: new Set() };
		this._drawOverlay();
		if (!quiet) this.hooks.onMulti && this.hooks.onMulti(0);
	}
	_setMulti(objs, ops) {
		this.multi = { objs: new Set(objs), ops: new Set(ops) };
		const n = this.multiCount();
		if (n === 1) { const one = this.multiItems()[0]; this.multi = { objs: new Set(), ops: new Set() }; if (this.view.objects.includes(one)) this.select(one); else { this.select(null); this.selectOp(one); } }
		else { this.sel = null; this.selOp = null; this.hooks.onSelect && this.hooks.onSelect(null); }
		this._drawOverlay();
		this.hooks.onMulti && this.hooks.onMulti(this.multiCount());
	}
	_toggleMulti(x) {
		const objs = new Set(this.multi.objs), ops = new Set(this.multi.ops);
		if (this.sel) objs.add(this.sel);
		if (this.selOp) ops.add(this.selOp);
		const isObj = this.view.objects.includes(x), set = isObj ? objs : ops;
		if (set.has(x)) set.delete(x); else set.add(x);
		this._setMulti(objs, ops);
	}
	/** Everything the box touches (visible, unlocked; not photo fills). */
	_boxSelect(r) {
		const hit = (b) => b && b.x1 >= r.x0 && b.x0 <= r.x1 && b.y1 >= r.y0 && b.y0 <= r.y1;
		const objs = this.sortedObjects().filter((o) => !this.isLocked(o) && hit(o._bb));
		const ops = this.view.ops.filter((op) => !op.erase && op.t !== 'mask' && op.t !== 'brush' && !this.isHidden(op) && !this.isLocked(op) && hit(this._opBox(op)));
		this._setMulti(objs, ops);
		if (!objs.length && !ops.length) { this.select(null); this.selectOp(null); }
	}
	_multiSnap() {
		return { objs: [...this.multi.objs].map((o) => [o, o.x, o.y]), ops: [...this.multi.ops].map((op) => [op, JSON.parse(JSON.stringify(op.pts))]) };
	}
	_multiApply(s, dx, dy) {
		for (const [o, x, y] of s.objs) { o.x = clamp(x + dx, 0, this.W); o.y = clamp(y + dy, 0, this.H); }
		for (const [op, pts] of s.ops) op.pts = pts.map((q) => [q[0] + dx, q[1] + dy]);
		if (s.ops.length) this._rebuildSoon(); else this.render();
	}
	_multiRestore(s) { this._multiApply(s, 0, 0); this.rebuildGround(); this.render(); }
	/** Nudge every selected item (arrow keys), merged into one undo step while tapping. */
	moveMulti(dx, dy) {
		const before = this._multiSnap();
		this._multiApply(before, dx, dy);
		const after = this._multiSnap();
		this._push({ label: `Moved ${this.multiCount()} items`, icon: 'hand', key: 'multinudge', undo: () => this._multiRestore(before), redo: () => this._multiRestore(after) }, true);
		this.changed();
	}
	deleteMulti() {
		const v = this.view, objs = [...this.multi.objs], ops = [...this.multi.ops];
		if (!objs.length && !ops.length) return;
		const oi = objs.map((o) => v.objects.indexOf(o)), pi = ops.map((op) => v.ops.indexOf(op));
		const del = () => { for (const o of objs) { const i = v.objects.indexOf(o); if (i >= 0) v.objects.splice(i, 1); } for (const op of ops) { const i = v.ops.indexOf(op); if (i >= 0) v.ops.splice(i, 1); } this.rebuildGround(); };
		const put = () => { objs.map((o, k) => [o, oi[k]]).sort((a, b) => a[1] - b[1]).forEach(([o, i]) => v.objects.splice(i, 0, o)); ops.map((op, k) => [op, pi[k]]).sort((a, b) => a[1] - b[1]).forEach(([op, i]) => v.ops.splice(i, 0, op)); this.rebuildGround(); };
		del();
		this.clearMulti(true);
		this._push({ label: `Removed ${objs.length + ops.length} items`, icon: 'trash', undo: put, redo: del }, false);
		this.changed();
		this.hooks.onMulti && this.hooks.onMulti(0);
	}
	duplicateMulti() {
		const v = this.view, d = 24;
		const objs = [...this.multi.objs].map((o) => ({ ...JSON.parse(JSON.stringify({ ...o, _bb: undefined })), id: uid(), x: o.x + d, y: o.y + d * 0.5 }));
		const ops = [...this.multi.ops].map((op) => ({ ...JSON.parse(JSON.stringify(op)), id: uid(), name: op.name ? op.name + ' copy' : op.name, pts: op.pts.map((q) => [q[0] + d, q[1] + d * 0.5]) }));
		const add = () => { v.objects.push(...objs); v.ops.push(...ops); this.rebuildGround(); };
		const rem = () => { for (const o of objs) v.objects.splice(v.objects.indexOf(o), 1); for (const op of ops) v.ops.splice(v.ops.indexOf(op), 1); this.rebuildGround(); };
		add();
		this._push({ label: `Copied ${objs.length + ops.length} items`, icon: 'copy', undo: rem, redo: add }, false);
		this._setMulti(objs, ops);
		this.changed();
	}

	addOp(op) {
		this._stamp(op);
		this.view.ops.push(op);
		if (this.view.layers && this.view.layers.length > 1) this.rebuildGround(); // keep layer order
		else { this._applyOp(op); this._composeGround(); }
		this._push({
			label: op.label || (op.t === 'poly' ? 'Drew a bed' : op.t === 'mask' ? 'Filled the selection with ' + (op.mat || 'material') : 'Changed the ground'), icon: op.t === 'mask' || op.t === 'brush' ? 'paint' : 'bed',
			undo: () => { this.view.ops.splice(this.view.ops.indexOf(op), 1); this.rebuildGround(); },
			redo: () => { this.view.ops.push(op); this.rebuildGround(); }
		}, false);
		this.changed();
	}

	/* ------------------------------------------------------------ objects */

	addObject(item, x, y, extra = {}) {
		const o = this._stamp({ id: uid(), item: item.id, x, y, age: item.plant || 0, scale: 1, seed: Math.floor(Math.random() * 1e6), flip: Math.random() < 0.5, ...extra });
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
	updateSelected(patch, target) {
		const o = target || this.sel;
		if (!o) return;
		const before = {};
		for (const k in patch) before[k] = o[k];
		Object.assign(o, patch);
		const after = { ...patch };
		const what = 'flip' in patch || 'flipV' in patch ? 'Flipped ' : 'z' in patch || 'zd' in patch ? 'Reordered ' : 'age' in patch ? 'Changed the age of ' : 'rot' in patch ? 'Rotated ' : 'scale' in patch ? 'Resized ' : 'x' in patch || 'y' in patch ? 'Moved ' : 'hidden' in patch ? (patch.hidden ? 'Hid ' : 'Showed ') : 'lock' in patch ? (patch.lock ? 'Locked ' : 'Unlocked ') : 'fx' in patch ? 'Blended ' : 'sh' in patch ? 'Changed the shadow of ' : 'alpha' in patch ? 'Changed the opacity of ' : 'name' in patch ? 'Renamed ' : 'Changed ';
		this._push({ label: what + (byId[o.item] ? byId[o.item].name : 'item'), icon: 'edit', key: o.id + Object.keys(patch).join(), undo: () => Object.assign(o, before), redo: () => Object.assign(o, after) }, true);
		this.changed();
	}
	frontSelected() { this.orderSelected('front'); }
	/** Layer order: 'forward' | 'backward' | 'front' | 'back'. */
	orderSelected(how, target) {
		const o = target || this.sel;
		if (!o) return;
		const zs = this.view.objects.filter((x) => x !== o).map((x) => x.zd || 0);
		const cur = o.zd || 0;
		const zd = how === 'front' ? Math.max(0, ...zs) + 1 : how === 'back' ? Math.min(0, ...zs) - 1 : how === 'forward' ? cur + 1 : cur - 1;
		this.updateSelected({ zd }, o);
	}
	/** Nudge on the ground in feet: dx = left/right, dz = farther (+) / closer (−). */
	nudgeSelected(dxFt, dzFt) {
		const o = this.sel;
		if (!o) return;
		const g = this.toGround([o.x, o.y]);
		if (!g) { const ppf = this.ppfAt(o.y); this.updateSelected({ x: clamp(o.x + dxFt * ppf, 0, this.W), y: clamp(o.y - dzFt * ppf, 0, this.H) }); return; }
		const q = this.fromGround([g[0] + dxFt, this.isTop ? g[1] - dzFt : Math.max(1, g[1] + dzFt)]);
		this.updateSelected({ x: clamp(q[0], 0, this.W), y: clamp(q[1], 0, this.H) });
	}
	/** Plant a group: n in a row or a staggered cluster, spaced on the ground in feet. */
	repeatSelected(n, spacingFt, layout = 'row') {
		const o = this.sel;
		if (!o || n < 2) return [];
		const g0 = this.toGround([o.x, o.y]);
		const made = [];
		for (let i = 1; i < n; i++) {
			let dx, dz;
			if (layout === 'row') { dx = Math.ceil(i / 2) * spacingFt * (i % 2 ? 1 : -1); dz = 0; }
			else { const per = Math.ceil(Math.sqrt(n)), r = Math.floor(i / per), c = i % per; dx = c * spacingFt + (r % 2 ? spacingFt / 2 : 0); dz = r * spacingFt * 0.87; }
			let x, y;
			if (g0) { const q = this.fromGround([g0[0] + dx, this.isTop ? g0[1] - dz : Math.max(1, g0[1] + dz)]); x = q[0]; y = q[1]; }
			else { const ppf = this.ppfAt(o.y); x = o.x + dx * ppf; y = o.y - dz * ppf; }
			if (!(x >= 0 && x <= this.W && y >= 0 && y <= this.H)) continue;
			const c = { ...JSON.parse(JSON.stringify(o, (k, v) => (k[0] === '_' ? undefined : v))), id: uid(), x, y, seed: Math.floor(Math.random() * 1e6), flip: Math.random() < 0.5 };
			this.view.objects.push(c);
			made.push(c);
		}
		if (made.length) {
			this._push({ label: `Planted a group of ${made.length + 1} ${byId[o.item] ? byId[o.item].name : 'items'}`, icon: 'copy', undo: () => { for (const c of made) this._remove(c); }, redo: () => { this.view.objects.push(...made); } }, false);
			this.changed();
		}
		return made;
	}
	/** Match a placed asset to the photo around it: brightness, contrast, saturation, warmth and its shadow. */
	autoBlend(target) {
		const o = target || this.sel;
		if (!o || !o._bb) return null;
		const b = o._bb, W = this.W, H = this.H;
		const pad = Math.max(8, (b.x1 - b.x0) * 0.6);
		const x0 = clamp(Math.floor(b.x0 - pad), 0, W - 1), y0 = clamp(Math.floor(b.y0 - pad), 0, H - 1), x1 = clamp(Math.ceil(b.x1 + pad), x0 + 1, W), y1 = clamp(Math.ceil(b.y1 + pad * 0.5), y0 + 1, H);
		const photo = this.bctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
		const bg = statsOf(photo);
		const c = canvas(W, H), cx = c.getContext('2d', { willReadFrequently: true });
		const keep = this.view.objects, night = this.project.night;
		this.view.objects = [{ ...o, fx: null, alpha: 1, sh: { off: true } }];
		this.project.night = false;
		this._draw(cx, false);
		this.view.objects = keep;
		this.project.night = night;
		const obj = statsOf(cx.getImageData(x0, y0, x1 - x0, y1 - y0).data, photo);
		if (!obj.n || !bg.n) return null;
		const fx = {
			b: clamp(((bg.L - obj.L) / 255) * 0.9, -0.45, 0.45),
			c: clamp(bg.sd / Math.max(8, obj.sd) - 1, -0.35, 0.35) * 0.7,
			s: clamp(bg.S / Math.max(0.05, obj.S) - 1, -0.5, 0.4) * 0.7,
			w: clamp((bg.warm - obj.warm) / 60, -0.6, 0.6)
		};
		for (const k in fx) fx[k] = Math.round(fx[k] * 100) / 100;
		const sh = { ...(o.sh || {}), off: false, k: Math.round(clamp(1 - (bg.L - 110) / 300, 0.6, 1.4) * 100) / 100, soft: 0.55 };
		this.updateSelected({ fx, sh }, o);
		return fx;
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

	invertSelection() {
		if (!this.selMask) this.selMask = new Uint8Array(this.W * this.H);
		for (let k = 0; k < this.selMask.length; k++) this.selMask[k] = this.selMask[k] ? 0 : 1;
		this._updateSelCanvas();
	}
	/** Expand (+px) or contract (−px) the selection. */
	growSelection(px) {
		if (!this.selMask) return;
		if (px > 0) this.selMask = dilate(this.selMask, this.W, this.H, px);
		else {
			const inv = new Uint8Array(this.selMask.length);
			for (let k = 0; k < inv.length; k++) inv[k] = this.selMask[k] ? 0 : 1;
			const g = dilate(inv, this.W, this.H, -px);
			for (let k = 0; k < g.length; k++) this.selMask[k] = g[k] ? 0 : 1;
		}
		this._updateSelCanvas();
	}
	clearSelection() { this.selMask = null; this.selMaskCanvas = null; this._aiPick = null; this._drawOverlay(); this.hooks.onMask && this.hooks.onMask(0); }

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
		const apply = (data) => { this.bctx.putImageData(data, rect.x, rect.y); this._buildShade(); this._composeGround(); this._invalidateAdj(); this.render(); this.changed('image'); };
		this._push({ label: 'Magic Eraser', icon: 'eraser', undo: () => apply(before), redo: () => apply(after) }, false);
		this._invalidateAdj();
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
	fillSelection(mat, soft) {
		if (!this.selMask) return false;
		const bb = maskBBox(this.selMask, this.W, this.H);
		if (!bb) return false;
		const op = { id: uid(), t: 'mask', mat, soft: soft || 0, rle: rleEncode(this.selMask), box: [bb.x0, bb.y0, bb.x1 + 1, bb.y1 + 1] };
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
		const apply = (data) => { this.bctx.putImageData(data, 0, 0); this._buildShade(); this._composeGround(); this._invalidateAdj(); this.render(); this.changed('image'); };
		this._push({ label, icon: 'sparkle', undo: () => apply(before), redo: () => apply(after) }, false);
		this._invalidateAdj();
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
		if (this.selOp && !this.view.ops.includes(this.selOp)) this.selectOp(null);
		else if (this.selOp && this.hooks.onSelectOp) this.hooks.onSelectOp(this.selOp, true);
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

/* ---------------------------------------------------------------- helpers */
function smoothOrStraight(ctx, pts, closed, curved) {
	if (curved !== false && pts.length > 2) { smoothPath(ctx, pts, closed); return; }
	pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
	if (closed) ctx.closePath();
}
function polyD(pts) { return pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ') + ' Z'; }
function rotBox(b, cx, cy, a) {
	const cs = Math.cos(a), sn = Math.sin(a);
	const pts = [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]].map(([x, y]) => [cx + (x - cx) * cs - (y - cy) * sn, cy + (x - cx) * sn + (y - cy) * cs]);
	return { x0: Math.min(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])), x1: Math.max(...pts.map((p) => p[0])), y1: Math.max(...pts.map((p) => p[1])) };
}
export function pointInPoly(p, poly) { let ins = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) ins = !ins; } return ins; }
function segDist(p, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy; const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); }
export function opName(op) { return { path: 'walkway', wall: 'wall', edge: 'edging', brush: 'painted area', mask: 'filled area' }[op.t] || op.kind || 'bed'; }
/** Mean luminance, saturation, contrast (std dev) and warmth (R−B); with `diff`, only pixels that differ from it (the object). */
function statsOf(d, diff) {
	let n = 0, L = 0, L2 = 0, S = 0, warm = 0;
	for (let i = 0; i < d.length; i += 16) {
		if (diff && Math.abs(d[i] - diff[i]) + Math.abs(d[i + 1] - diff[i + 1]) + Math.abs(d[i + 2] - diff[i + 2]) < 24) continue;
		const r = d[i], g = d[i + 1], b = d[i + 2];
		const l = 0.299 * r + 0.587 * g + 0.114 * b, mx = Math.max(r, g, b), mn = Math.min(r, g, b);
		n++; L += l; L2 += l * l; S += mx ? (mx - mn) / mx : 0; warm += r - b;
	}
	if (!n) return { n: 0 };
	L /= n;
	return { n, L, sd: Math.sqrt(Math.max(0, L2 / n - L * L)), S: S / n, warm: warm / n };
}

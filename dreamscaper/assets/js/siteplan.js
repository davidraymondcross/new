/* DreamScaper – 2D Landscape Plan: a dimensionally accurate site plan.
 *
 * Everything is stored in FEET. The aerial photo (CT ECO, known pixels-per-foot), a scanned
 * survey or a blank grid is only a backdrop; the geometry on top is what gets measured.
 * Type exact lengths (32' 6"), set rectangle sizes, snap to a grid and square corners.
 * AI Measure (SAM 3) can trace lawn, beds, patios… from the aerial; the traced outlines are
 * ordinary editable shapes measured with the same math.
 */
import { h, put, icon } from './util.js?v=2.7.3';
import { GEOM, KINDS, outline, measure, polyArea, pathLength, centroid, fmtFtIn, parseFtIn, fmtArea, sampleSmooth } from './takeoff.js?v=2.7.3';

const TOOLS = [
	['select', '👆', 'Select & edit'],
	['bed', '🪴', 'Planting bed'], ['lawn', '🌱', 'Lawn'], ['patio', '🧱', 'Patio'], ['walkway', '🚶', 'Walkway'], ['stone', '🪨', 'Stone area'],
	['wall', '▬', 'Retaining wall'], ['edging', '〰️', 'Edging'], ['fence', '🚧', 'Fence'], ['grade', '⛰️', 'Grading'],
	['plant', '🌿', 'Plant'], ['light', '💡', 'Light'], ['boulder', '⬤', 'Boulder'], ['feature', '⛲', 'Feature'], ['wire', '🔌', 'Light wire'],
	['house', '🏠', 'House'], ['structure', '🏚️', 'Structure'], ['driveway', '🚗', 'Driveway'], ['boundary', '📐', 'Property line'],
	['measure', '📏', 'Measure'], ['note', '📝', 'Note'], ['scale', '⚖️', 'Set scale']
];
const EXISTING_KINDS = new Set(['house', 'structure', 'driveway', 'boundary']);
const uid = () => 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const DEFAULT_PROPS = {
	bed: { cover: 'mulch', depth: 3, isNew: true, edging: 'steel', material: 'double-ground hardwood' },
	stone: { depth: 3, material: '3/4" crushed stone' },
	lawn: { method: 'sod' },
	patio: { material: 'Concrete pavers', border: 'none', steps: 0 },
	walkway: { width: 4, material: 'Concrete pavers' },
	wall: { height: 2, material: 'Segmental wall block', cap: true },
	edging: { type: 'steel' },
	fence: { type: 'vinyl', height: 6, gates: 0 },
	plant: { name: 'Shrub', cat: 'shrubs', count: 1 },
	light: { type: 'Path light', count: 1 },
	boulder: { size: '2–3 ft', count: 1 },
	feature: { name: 'Garden feature', count: 1, cost: 0 },
	note: { text: '' }
};

/**
 * Open the plan editor. Resolves the saved plan (or null if closed without saving).
 * opts: { root, plan, title, toast, aerial(): Promise<{bitmap,ppf}>, segment(img, text, W, H), pickPlant(): Promise<item>, pickImage(): Promise<{bitmap}>, photos: [{url, step}] }
 */
export function openPlan(opts) {
	return new Promise((resolve) => {
		const P = new Plan(opts, resolve);
		P.mount();
	});
}

class Plan {
	constructor(o, resolve) {
		this.o = o;
		this.resolve = resolve;
		const src = o.plan && o.plan.shapes ? JSON.parse(JSON.stringify(o.plan)) : { shapes: [] };
		this.plan = { shapes: src.shapes || [], bg: src.bg || null, notes: src.notes || '', estimated: !!src.estimated };
		this.tool = 'select';
		this.sel = null;
		this.draft = null;
		this.view = { s: 8, x: 40, y: 40 };
		this.undo = [];
		this.redo = [];
		this.snap = true;
		this.square = true;
		this.layers = { existing: true, proposed: true, notes: true, bg: true };
		this.img = null;
		this.dirty = false;
	}

	/* ------------------------------------------------------------ UI */
	mount() {
		const o = this.o;
		this.cv = h('canvas', { class: 'ds-sp-cv', tabindex: 0, 'aria-label': 'Site plan drawing area' });
		this.hint = h('div', { class: 'ds-sp-hint', role: 'status', 'aria-live': 'polite' });
		this.panel = h('aside', { class: 'ds-sp-panel' });
		this.sum = h('div', { class: 'ds-sp-sum' });
		this.toolbar = h('nav', { class: 'ds-sp-tools', 'aria-label': 'Drawing tools' }, ...TOOLS.map(([id, e, label]) => h('button', { class: 'ds-sp-tool', 'data-tool': id, title: label, 'aria-label': label, onclick: () => this.setTool(id) }, h('span', null, e), h('small', null, label))));
		const top = h('header', { class: 'ds-sp-top' },
			h('button', { class: 'ds-btn ds-ghost ds-sm', 'aria-label': 'Close', onclick: () => this.close(false) }, '✕', h('span', { class: 'ds-hide-sm' }, ' Close')),
			h('b', { class: 'ds-sp-title' }, o.title || '2D Landscape Plan'),
			h('div', { class: 'ds-spacer' }),
			h('button', { class: 'ds-icon-btn', title: 'Undo', 'aria-label': 'Undo', onclick: () => this.doUndo() }, icon('undo', 20)),
			h('button', { class: 'ds-icon-btn', title: 'Redo', 'aria-label': 'Redo', onclick: () => this.doRedo() }, icon('redo', 20)),
			h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => this.backdropMenu() }, icon('map', 18), h('span', { class: 'ds-hide-sm' }, ' Backdrop')),
			o.segment ? h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => this.aiMeasure() }, icon('sparkle', 18), h('span', { class: 'ds-hide-sm' }, ' AI Measure')) : null,
			h('button', { class: 'ds-btn ds-sm', onclick: () => this.close(true) }, icon('check', 18), ' Save', h('span', { class: 'ds-hide-sm' }, ' plan')));
		const opts = h('div', { class: 'ds-sp-opts' },
			h('label', null, h('input', { type: 'checkbox', checked: this.snap, onchange: (e) => { this.snap = e.target.checked; } }), ' Snap 6"'),
			h('label', null, h('input', { type: 'checkbox', checked: this.square, onchange: (e) => { this.square = e.target.checked; } }), ' Square corners'),
			...[['bg', 'Backdrop'], ['existing', 'Existing'], ['proposed', 'Proposed'], ['notes', 'Notes']].map(([k, l]) => h('label', null, h('input', { type: 'checkbox', checked: this.layers[k], onchange: (e) => { this.layers[k] = e.target.checked; this.draw(); } }), ' ' + l)),
			h('button', { class: 'ds-link', onclick: () => this.fit() }, 'Fit'));
		this.el = h('div', { class: 'ds-siteplan', role: 'dialog', 'aria-label': '2D Landscape Plan' }, top, h('div', { class: 'ds-sp-main' }, this.toolbar, h('div', { class: 'ds-sp-stage' }, this.cv, this.hint, opts, this.sum), this.panel));
		o.root.append(this.el);
		this.ctx = this.cv.getContext('2d');
		this.ro = new ResizeObserver(() => this.resize());
		this.ro.observe(this.cv);
		this.bindPointer();
		this.keys = (e) => this.onKey(e);
		this.el.addEventListener('keydown', this.keys);
		if (this.plan.bg && this.plan.bg.url) this.loadBg(this.plan.bg.url);
		this.setTool('select');
		this.renderPanel();
		requestAnimationFrame(() => { this.resize(); this.fit(); if (!this.plan.bg && !this.plan.shapes.length) this.backdropMenu(true); });
	}
	close(save) {
		if (!save && this.dirty && !confirm('Close without saving your plan changes?')) return;
		this.ro.disconnect();
		this.el.remove();
		this.resolve(save ? this.clean() : null);
	}
	clean() {
		const p = JSON.parse(JSON.stringify(this.plan));
		for (const s of p.shapes) s.pts = s.pts.map((q) => [Math.round(q[0] * 1000) / 1000, Math.round(q[1] * 1000) / 1000]);
		return p;
	}
	toast(m, ms) { if (this.o.toast) this.o.toast(m, ms); else this.say(m); }
	say(t) { this.hint.textContent = t || ''; this.hint.hidden = !t; }

	setTool(t) {
		this.finishDraft(false);
		this.tool = t;
		for (const b of this.toolbar.children) b.classList.toggle('on', b.dataset.tool === t);
		const g = GEOM[t];
		this.say(t === 'select' ? 'Tap a shape to edit it. Drag corners to reshape. Tap a dimension to type an exact length. Two fingers (or right-drag) to pan, pinch/scroll to zoom.'
			: t === 'scale' ? 'Draw a line over something you know the length of (a garage door is usually 16\' or 9\'), then type its real length.'
				: g === 'area' ? `Tap each corner of the ${KINDS[t].label.toLowerCase()}. Tap the first point (or “Done”) to close it. Hold and drag to draw a rectangle.`
					: g === 'line' ? `Tap along the ${KINDS[t].label.toLowerCase()}. Tap “Done” (or the last point again) to finish.`
						: `Tap where the ${KINDS[t].label.toLowerCase()} goes.`);
		if (t === 'plant' && this.o.pickPlant) this.pickPlantFirst();
	}
	async pickPlantFirst() {
		const it = await this.o.pickPlant();
		if (it) this.nextPlant = it;
		else this.setTool('select');
	}

	/* --------------------------------------------------------- backdrop */
	async backdropMenu(first) {
		const o = this.o;
		const close = () => m.remove();
		const opt = (e, t, sub, fn) => h('button', { class: 'ds-sp-bgopt', onclick: async () => { close(); await fn(); } }, h('span', null, e), h('b', null, t), h('small', null, sub));
		const m = h('div', { class: 'ds-backdrop' }, h('div', { class: 'ds-modal', role: 'dialog' },
			h('div', { class: 'ds-modal-head' }, h('h3', null, first ? 'Start your plan' : 'Backdrop'), h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: close }, icon('close'))),
			h('div', { class: 'ds-modal-body' },
				first ? h('p', { class: 'ds-hint' }, 'The backdrop is just a guide. Your plan is measured in real feet from the shapes you draw on it.') : null,
				h('div', { class: 'ds-sp-bgopts' },
					o.aerial ? opt('🛰️', 'Aerial photo (to scale)', 'Connecticut 3-inch imagery — already measured', async () => { const shot = await o.aerial(); if (shot && shot.bitmap && shot.ppf) this.setBg(shot.bitmap.toDataURL('image/jpeg', 0.9), shot.ppf, shot.bitmap.width, shot.bitmap.height, 'aerial'); }) : null,
					o.pickImage ? opt('📄', 'Survey / plot plan / photo', 'Upload a picture, then set the scale', async () => { const shot = await o.pickImage(); if (shot && shot.bitmap) { this.setBg(shot.bitmap.toDataURL('image/jpeg', 0.9), 0, shot.bitmap.width, shot.bitmap.height, 'image'); this.setTool('scale'); } }) : null,
					opt('▦', 'Blank grid', 'Draw from your own tape measurements', async () => { this.push(); this.plan.bg = null; this.img = null; this.draw(); }),
					this.plan.bg ? opt('🗑️', 'Remove backdrop', 'Keep the shapes', async () => { this.push(); this.plan.bg = null; this.img = null; this.draw(); }) : null))));
		o.root.append(m);
	}
	setBg(url, ppf, W, H, kind) {
		this.push();
		this.plan.bg = { url, ppf: ppf || 10, W, H, kind, scaled: !!ppf };
		this.loadBg(url);
		if (!ppf) this.toast('Now set the scale: draw a line over something you know the length of.', 6000);
	}
	loadBg(url) {
		const im = new Image();
		im.crossOrigin = 'anonymous';
		im.onload = () => { this.img = im; this.fit(); };
		im.src = url;
	}

	/* --------------------------------------------------------- history */
	push() { this.undo.push(JSON.stringify(this.plan)); if (this.undo.length > 80) this.undo.shift(); this.redo = []; this.dirty = true; }
	doUndo() { if (!this.undo.length) return; this.redo.push(JSON.stringify(this.plan)); this.restore(this.undo.pop()); }
	doRedo() { if (!this.redo.length) return; this.undo.push(JSON.stringify(this.plan)); this.restore(this.redo.pop()); }
	restore(json) {
		const bgUrl = this.plan.bg && this.plan.bg.url;
		this.plan = JSON.parse(json);
		if ((this.plan.bg && this.plan.bg.url) !== bgUrl) { this.img = null; if (this.plan.bg && this.plan.bg.url) this.loadBg(this.plan.bg.url); }
		this.sel = this.plan.shapes.find((s) => this.sel && s.id === this.sel.id) || null;
		this.renderPanel(); this.draw();
	}

	/* ----------------------------------------------------- coordinates */
	toScreen(p) { return [p[0] * this.view.s + this.view.x, p[1] * this.view.s + this.view.y]; }
	toWorld(x, y) { return [(x - this.view.x) / this.view.s, (y - this.view.y) / this.view.s]; }
	snapPt(p, from) {
		let q = p.slice();
		if (this.square && from) {
			const dx = q[0] - from[0], dy = q[1] - from[1], L = Math.hypot(dx, dy), a = Math.atan2(dy, dx), step = Math.PI / 4;
			const sa = Math.round(a / step) * step;
			if (Math.abs(sa - a) < 0.12) q = [from[0] + Math.cos(sa) * L, from[1] + Math.sin(sa) * L];
		}
		if (this.snap) q = [Math.round(q[0] * 2) / 2, Math.round(q[1] * 2) / 2];
		return q;
	}
	resize() {
		const r = this.cv.getBoundingClientRect(), d = window.devicePixelRatio || 1;
		this.W = r.width; this.H = r.height;
		this.cv.width = Math.max(1, r.width * d); this.cv.height = Math.max(1, r.height * d);
		this.ctx.setTransform(d, 0, 0, d, 0, 0);
		this.draw();
	}
	fit() {
		let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
		const add = (p) => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); };
		for (const s of this.plan.shapes) s.pts.forEach(add);
		if (this.plan.bg && this.plan.bg.ppf) { add([0, 0]); add([this.plan.bg.W / this.plan.bg.ppf, this.plan.bg.H / this.plan.bg.ppf]); }
		if (!Number.isFinite(x0)) { x0 = 0; y0 = 0; x1 = 80; y1 = 60; }
		const w = Math.max(10, x1 - x0), hh = Math.max(10, y1 - y0);
		const s = Math.min((this.W || 600) / (w * 1.1), (this.H || 400) / (hh * 1.1));
		this.view = { s, x: (this.W - w * s) / 2 - x0 * s, y: (this.H - hh * s) / 2 - y0 * s };
		this.draw();
	}

	/* ------------------------------------------------------------ draw */
	visible(s) {
		if (s.kind === 'note' || s.kind === 'measure') return this.layers.notes;
		return s.existing && !s.remove ? this.layers.existing : this.layers.proposed;
	}
	draw() {
		const c = this.ctx, W = this.W, H = this.H;
		if (!c || !W) return;
		c.clearRect(0, 0, W, H);
		c.fillStyle = '#eef3ef'; c.fillRect(0, 0, W, H);
		const bg = this.plan.bg;
		if (bg && this.img && this.layers.bg) {
			const [x, y] = this.toScreen([0, 0]);
			c.globalAlpha = 0.85;
			c.drawImage(this.img, x, y, (bg.W / bg.ppf) * this.view.s, (bg.H / bg.ppf) * this.view.s);
			c.globalAlpha = 1;
		}
		this.drawGrid();
		for (const s of this.plan.shapes) if (this.visible(s)) this.drawShape(s, s === this.sel);
		if (this.draft) this.drawDraft();
		this.drawScale();
		this.updateSum();
	}
	drawGrid() {
		const c = this.ctx, s = this.view.s;
		let step = 1;
		for (const st of [1, 5, 10, 25, 50, 100]) { step = st; if (st * s >= 22) break; }
		const [x0, y0] = this.toWorld(0, 0), [x1, y1] = this.toWorld(this.W, this.H);
		c.lineWidth = 1;
		c.strokeStyle = this.img && this.layers.bg ? 'rgba(255,255,255,.18)' : 'rgba(30,70,45,.12)';
		c.beginPath();
		for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) { const X = x * s + this.view.x; c.moveTo(X, 0); c.lineTo(X, this.H); }
		for (let y = Math.floor(y0 / step) * step; y <= y1; y += step) { const Y = y * s + this.view.y; c.moveTo(0, Y); c.lineTo(this.W, Y); }
		c.stroke();
	}
	drawScale() {
		const c = this.ctx, s = this.view.s;
		let ft = 5;
		for (const f of [5, 10, 20, 25, 50, 100]) { ft = f; if (f * s > 70) break; }
		const x = 14, y = this.W < 600 ? 70 : this.H - 18;
		c.fillStyle = 'rgba(255,255,255,.9)'; c.fillRect(x - 6, y - 18, ft * s + 52, 26);
		c.strokeStyle = '#1d2a22'; c.lineWidth = 2;
		c.beginPath(); c.moveTo(x, y); c.lineTo(x + ft * s, y); c.moveTo(x, y - 5); c.lineTo(x, y + 3); c.moveTo(x + ft * s, y - 5); c.lineTo(x + ft * s, y + 3); c.stroke();
		c.fillStyle = '#1d2a22'; c.font = '600 12px system-ui'; c.fillText(`${ft}'`, x + ft * s + 6, y + 4);
		c.fillText('N ↑', this.W - 36, 22);
		if (this.plan.bg && !this.plan.bg.scaled) { c.fillStyle = '#b3261e'; c.fillText('Scale not set — use ⚖️ Set scale', 14, 22); }
	}
	pathOf(s) {
		const pts = outline(s).map((p) => this.toScreen(p));
		const c = this.ctx;
		c.beginPath();
		pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
		if (s.closed) c.closePath();
		return pts;
	}
	drawShape(s, sel) {
		const c = this.ctx, k = KINDS[s.kind] || KINDS.zone, g = GEOM[s.kind];
		const col = k.color;
		c.save();
		if (s.remove) c.setLineDash([6, 4]);
		if (g === 'point') {
			const [x, y] = this.toScreen(s.pts[0]);
			const r = Math.max(7, ((s.props && s.props.w) || (s.kind === 'plant' ? 3 : s.kind === 'boulder' ? 2.5 : 1)) * this.view.s / 2);
			c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2);
			c.fillStyle = s.remove ? 'rgba(229,57,53,.25)' : s.existing ? 'rgba(120,130,125,.35)' : hexA(col, 0.45); c.fill();
			c.lineWidth = sel ? 3 : 1.5; c.strokeStyle = sel ? '#00b0ff' : s.remove ? '#e53935' : col; c.stroke();
			c.font = `${Math.max(12, Math.min(22, r))}px system-ui`; c.textAlign = 'center'; c.textBaseline = 'middle';
			c.fillText(s.kind === 'note' ? '📝' : k.icon, x, y);
			const n = s.props && s.props.count > 1 ? '×' + s.props.count : '';
			const label = s.kind === 'note' ? (s.props.text || '').slice(0, 30) : (s.props && (s.props.name || s.props.type)) || '';
			if (this.view.s > 4 && (label || n)) this.tag(x, y + r + 10, label + (n ? ' ' + n : ''), sel);
			c.restore();
			return;
		}
		const pts = this.pathOf(s);
		if (s.closed) {
			c.fillStyle = s.remove ? 'rgba(229,57,53,.18)' : s.existing ? 'rgba(96,125,139,.28)' : hexA(col, 0.38);
			if (s.kind !== 'boundary' && s.kind !== 'zone') c.fill();
		}
		const wft = s.kind === 'walkway' ? +(s.props && s.props.width) || 4 : s.kind === 'wall' ? 1 : 0;
		c.lineJoin = 'round'; c.lineCap = 'round';
		if (wft) { c.lineWidth = Math.max(3, wft * this.view.s); c.strokeStyle = s.existing ? 'rgba(96,125,139,.55)' : hexA(col, 0.75); c.stroke(); }
		c.lineWidth = sel ? 3 : s.kind === 'boundary' ? 2.5 : s.kind === 'edging' ? 3 : 2;
		c.strokeStyle = sel ? '#00b0ff' : s.remove ? '#e53935' : s.kind === 'boundary' ? '#e53935' : s.kind === 'measure' ? '#00b0ff' : col;
		if (s.kind === 'boundary') c.setLineDash([10, 6]);
		c.stroke();
		c.setLineDash([]);
		const m = measure(s);
		if (s.closed && this.view.s > 2.5) {
			const [cx, cy] = this.toScreen(centroid(outline(s)));
			this.tag(cx, cy, `${(s.props && s.props.label) || k.label}${s.existing ? ' (existing)' : ''}${s.remove ? ' – remove' : ''}\n${fmtArea(m.area)}`, sel);
		} else if (!s.closed && this.view.s > 2.5) {
			const mid = pts[Math.floor(pts.length / 2)] || pts[0];
			this.tag(mid[0], mid[1] - 14, `${k.label}: ${fmtFtIn(m.length)}${s.kind === 'wall' ? ` × ${fmtFtIn(+(s.props.height || 2))} high` : ''}`, sel);
		}
		if (sel) {
			this.dimHits = [];
			if (!s.smooth || !s.closed) {
				const n = s.pts.length, last = s.closed ? n : n - 1;
				for (let i = 0; i < last; i++) {
					const a = s.pts[i], b = s.pts[(i + 1) % n];
					const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
					const [x, y] = this.toScreen([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
					const r = this.tag(x, y, fmtFtIn(L), true, '#00b0ff');
					this.dimHits.push({ i, x, y, w: r.w, h: r.h });
				}
			}
			c.fillStyle = '#fff'; c.strokeStyle = '#00b0ff'; c.lineWidth = 2;
			for (const p of s.pts) { const [x, y] = this.toScreen(p); c.beginPath(); c.arc(x, y, 7, 0, Math.PI * 2); c.fill(); c.stroke(); }
		}
		c.restore();
	}
	tag(x, y, text, strong, color) {
		const c = this.ctx;
		const lines = String(text).split('\n');
		c.font = `${strong ? 700 : 600} 12px system-ui`;
		const w = Math.max(...lines.map((l) => c.measureText(l).width)) + 10, hh = lines.length * 15 + 4;
		c.fillStyle = color || 'rgba(255,255,255,.88)';
		roundRect(c, x - w / 2, y - hh / 2, w, hh, 6); c.fill();
		c.fillStyle = color ? '#fff' : '#1d2a22'; c.textAlign = 'center'; c.textBaseline = 'middle';
		lines.forEach((l, i) => c.fillText(l, x, y - hh / 2 + 9.5 + i * 15));
		return { w, h: hh };
	}
	drawDraft() {
		const d = this.draft, c = this.ctx;
		const pts = [...d.pts, ...(d.hover ? [d.hover] : [])].map((p) => this.toScreen(p));
		if (!pts.length) return;
		c.save();
		c.strokeStyle = '#00b0ff'; c.lineWidth = 2; c.setLineDash([6, 4]);
		c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
		if (GEOM[d.kind] === 'area' && pts.length > 2) c.closePath();
		c.stroke(); c.setLineDash([]);
		c.fillStyle = '#00b0ff';
		pts.forEach((p, i) => { c.beginPath(); c.arc(p[0], p[1], i === 0 ? 8 : 5, 0, Math.PI * 2); c.fill(); });
		if (d.hover && d.pts.length) {
			const a = d.pts[d.pts.length - 1], b = d.hover, L = Math.hypot(b[0] - a[0], b[1] - a[1]);
			const [x, y] = this.toScreen([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
			this.tag(x, y - 14, fmtFtIn(L), true, '#00b0ff');
		}
		if (GEOM[d.kind] === 'area' && d.pts.length > 2) {
			const [x, y] = this.toScreen(centroid(d.pts));
			this.tag(x, y, fmtArea(polyArea(d.pts)), true);
		}
		c.restore();
	}
	updateSum() {
		const by = {};
		for (const s of this.plan.shapes) {
			if (s.existing && !s.remove) continue;
			const m = measure(s), k = s.remove ? 'remove' : s.kind;
			by[k] = by[k] || { area: 0, len: 0, n: 0 };
			if (m.area) by[k].area += m.area;
			if (m.length) by[k].len += m.length;
			by[k].n += m.count || 1;
		}
		const parts = Object.entries(by).map(([k, v]) => `${k === 'remove' ? '🗑️ Removals' : (KINDS[k] || {}).icon + ' ' + (KINDS[k] || {}).label}: ${v.area ? fmtArea(v.area) : v.len ? fmtFtIn(v.len) : v.n}`);
		this.sum.textContent = parts.length ? parts.join('  ·  ') : 'Nothing drawn yet';
	}

	/* --------------------------------------------------------- pointer */
	bindPointer() {
		const cv = this.cv, pts = new Map();
		let drag = null, pinch = null, downAt = null, longT = 0;
		const pos = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
		cv.addEventListener('contextmenu', (e) => e.preventDefault());
		cv.addEventListener('wheel', (e) => { e.preventDefault(); const [x, y] = pos(e); this.zoomAt(x, y, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
		cv.addEventListener('pointerdown', (e) => {
			cv.setPointerCapture(e.pointerId);
			pts.set(e.pointerId, pos(e));
			if (pts.size === 2) { clearTimeout(longT); drag = null; const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] }; return; }
			const [x, y] = pos(e);
			downAt = [x, y];
			if (e.button === 2 || e.button === 1 || this.space) { drag = { pan: true, x, y }; return; }
			const w = this.toWorld(x, y);
			if (this.tool === 'select') {
				const hit = this.hitDim(x, y);
				if (hit) { this.editDim(hit.i); return; }
				const v = this.sel ? this.hitVertex(this.sel, x, y) : -1;
				if (v >= 0) { this.push(); drag = { vertex: v, shape: this.sel }; return; }
				const s = this.hitShape(w);
				this.select(s);
				if (s) { this.push(); drag = { move: true, shape: s, from: w, orig: JSON.parse(JSON.stringify(s.pts)) }; } else drag = { pan: true, x, y };
				return;
			}
			if (GEOM[this.tool] === 'area' && this.tool !== 'scale') {
				// press-and-drag = rectangle
				drag = { rect: true, from: this.snapPt(w), x, y };
				return;
			}
			drag = { tap: true };
		});
		cv.addEventListener('pointermove', (e) => {
			if (!pts.has(e.pointerId)) { if (this.draft) { this.draft.hover = this.snapPt(this.toWorld(...pos(e)), this.draft.pts[this.draft.pts.length - 1]); this.draw(); } return; }
			pts.set(e.pointerId, pos(e));
			if (pinch && pts.size === 2) {
				const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
				this.view.x += c[0] - pinch.c[0]; this.view.y += c[1] - pinch.c[1];
				this.zoomAt(c[0], c[1], d / pinch.d);
				pinch = { d, c };
				return;
			}
			const [x, y] = pos(e);
			if (!drag) return;
			if (drag.pan) { this.view.x += x - drag.x; this.view.y += y - drag.y; drag.x = x; drag.y = y; this.draw(); return; }
			const w = this.toWorld(x, y);
			if (drag.vertex != null) {
				const s = drag.shape, i = drag.vertex, prev = s.pts[i - 1] || (s.closed ? s.pts[s.pts.length - 1] : null);
				s.pts[i] = this.snapPt(w, prev && this.square ? prev : null);
				this.draw(); this.renderMeasures(); return;
			}
			if (drag.move) {
				let dx = w[0] - drag.from[0], dy = w[1] - drag.from[1];
				if (this.snap) { dx = Math.round(dx * 2) / 2; dy = Math.round(dy * 2) / 2; }
				drag.shape.pts = drag.orig.map((p) => [p[0] + dx, p[1] + dy]);
				this.draw(); return;
			}
			if (drag.rect && Math.hypot(x - drag.x, y - drag.y) > 12) {
				const b = this.snapPt(w);
				this.draft = { kind: this.tool, rect: true, pts: [drag.from, [b[0], drag.from[1]], b, [drag.from[0], b[1]]] };
				const L = Math.abs(b[0] - drag.from[0]), H = Math.abs(b[1] - drag.from[1]);
				this.say(`${fmtFtIn(L)} × ${fmtFtIn(H)} = ${fmtArea(L * H)} — let go to place it.`);
				this.draw();
			}
		});
		const up = (e) => {
			const had = pts.has(e.pointerId);
			pts.delete(e.pointerId);
			if (pinch) { if (pts.size < 2) pinch = null; return; }
			if (!had || !drag) return;
			const [x, y] = pos(e);
			const d = drag; drag = null;
			if (d.vertex != null || d.move) { this.renderPanel(); return; }
			if (d.rect && this.draft && this.draft.rect) { const pts2 = this.draft.pts; this.draft = null; this.addShape(this.tool, pts2, true); return; }
			if (d.pan) return;
			if (downAt && Math.hypot(x - downAt[0], y - downAt[1]) > 12 && !d.rect) return;
			this.tap(this.toWorld(x, y), x, y);
		};
		cv.addEventListener('pointerup', up);
		cv.addEventListener('pointercancel', up);
		cv.addEventListener('dblclick', () => this.finishDraft(true));
	}
	zoomAt(x, y, k) {
		const s = Math.min(200, Math.max(0.3, this.view.s * k));
		const w = this.toWorld(x, y);
		this.view.s = s; this.view.x = x - w[0] * s; this.view.y = y - w[1] * s;
		this.draw();
	}
	onKey(e) {
		if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
		if (e.key === 'Escape') { if (this.draft) { this.draft = null; this.draw(); } else this.select(null); }
		else if (e.key === 'Enter') this.finishDraft(true);
		else if ((e.key === 'Delete' || e.key === 'Backspace') && this.sel) { e.preventDefault(); this.deleteSel(); }
		else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? this.doRedo() : this.doUndo(); }
	}

	/* ------------------------------------------------------------ hits */
	hitDim(x, y) { if (!this.sel || !this.dimHits) return null; return this.dimHits.find((d) => Math.abs(x - d.x) <= d.w / 2 + 4 && Math.abs(y - d.y) <= d.h / 2 + 4) || null; }
	hitVertex(s, x, y) { for (let i = 0; i < s.pts.length; i++) { const [a, b] = this.toScreen(s.pts[i]); if (Math.hypot(a - x, b - y) < 14) return i; } return -1; }
	hitShape(w) {
		const tol = 10 / this.view.s;
		for (let i = this.plan.shapes.length - 1; i >= 0; i--) {
			const s = this.plan.shapes[i];
			if (!this.visible(s)) continue;
			const g = GEOM[s.kind];
			if (g === 'point') { const r = Math.max(tol, ((s.props && s.props.w) || 3) / 2); if (Math.hypot(w[0] - s.pts[0][0], w[1] - s.pts[0][1]) < r) return s; continue; }
			const o = outline(s);
			if (s.closed && pointIn(w, o) && s.kind !== 'boundary') return s;
			const half = s.kind === 'walkway' ? (+(s.props && s.props.width) || 4) / 2 : 0;
			for (let j = 1; j < o.length + (s.closed ? 1 : 0); j++) if (segDist(w, o[j - 1], o[j % o.length]) < tol + half) return s;
		}
		return null;
	}

	/* ------------------------------------------------------- drawing */
	tap(w, x, y) {
		const t = this.tool;
		if (t === 'select') return;
		const g = t === 'scale' ? 'line' : GEOM[t];
		if (g === 'point') {
			const props = { ...(DEFAULT_PROPS[t] || {}) };
			if (t === 'plant' && this.nextPlant) { const it = this.nextPlant; Object.assign(props, { id: it.id, name: it.name, sci: it.sci || '', cat: it.cat, w: Math.round((it.w || 3) * 10) / 10 }); }
			if (t === 'note') { const txt = prompt('Note'); if (!txt) return; props.text = txt.slice(0, 300); }
			this.addShape(t, [this.snapPt(w)]);
			const s = this.plan.shapes[this.plan.shapes.length - 1];
			s.props = props;
			this.renderPanel(); this.draw();
			return;
		}
		if (!this.draft) this.draft = { kind: t, pts: [] };
		const d = this.draft;
		const p = this.snapPt(w, d.pts[d.pts.length - 1]);
		if (d.pts.length >= 3 && g === 'area') { const [fx, fy] = this.toScreen(d.pts[0]); if (Math.hypot(fx - x, fy - y) < 16) return this.finishDraft(true); }
		if (d.pts.length >= 2) { const [lx, ly] = this.toScreen(d.pts[d.pts.length - 1]); if (Math.hypot(lx - x, ly - y) < 12) return this.finishDraft(true); }
		d.pts.push(p);
		if (t === 'scale' && d.pts.length === 2) return this.finishDraft(true);
		this.renderPanel();
		this.draw();
	}
	finishDraft(commit) {
		const d = this.draft;
		if (!d) return;
		this.draft = null;
		if (!commit) { this.draw(); return; }
		if (d.kind === 'scale') return this.applyScale(d.pts);
		const g = GEOM[d.kind];
		if ((g === 'area' && d.pts.length < 3) || (g === 'line' && d.pts.length < 2)) { this.draw(); return; }
		this.addShape(d.kind, d.pts, false);
	}
	addShape(kind, pts, rect) {
		this.push();
		const g = GEOM[kind];
		const s = { id: uid(), kind, pts: pts.map((p) => p.slice()), closed: g === 'area', smooth: kind === 'bed' && !rect, existing: EXISTING_KINDS.has(kind), remove: false, props: { ...(DEFAULT_PROPS[kind] || {}) } };
		this.plan.shapes.push(s);
		this.select(s);
		if (g !== 'point') this.setTool('select');
	}
	applyScale(p) {
		if (p.length < 2) return;
		const bg = this.plan.bg;
		const cur = Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1]);
		const ans = prompt(`How long is that line in real life? (e.g. 16' or 9' 6")\nIt measures ${fmtFtIn(cur)} on the plan now.`);
		const real = parseFtIn(ans);
		if (!(real > 0)) { this.draw(); return; }
		this.push();
		const k = real / cur;
		if (bg) { bg.ppf = bg.ppf / k; bg.scaled = true; }
		for (const s of this.plan.shapes) s.pts = s.pts.map((q) => [q[0] * k, q[1] * k]);
		this.view.s /= k;
		this.toast(`Scale set: that line is ${fmtFtIn(real)}. All measurements updated.`, 4000);
		this.setTool('select');
		this.draw();
	}
	editDim(i) {
		const s = this.sel, n = s.pts.length, a = s.pts[i], j = (i + 1) % n, b = s.pts[j];
		const cur = Math.hypot(b[0] - a[0], b[1] - a[1]);
		const ans = prompt(`Exact length of this side (e.g. 32' 6")`, fmtFtIn(cur));
		const L = parseFtIn(ans);
		if (!(L > 0) || !cur) return;
		this.push();
		const ux = (b[0] - a[0]) / cur, uy = (b[1] - a[1]) / cur, dx = a[0] + ux * L - b[0], dy = a[1] + uy * L - b[1];
		// rectangles keep their shape: move both points on the far side
		if (s.closed && n === 4 && isRect(s.pts)) { const k = (j + 1) % n; s.pts[j] = [b[0] + dx, b[1] + dy]; s.pts[k] = [s.pts[k][0] + dx, s.pts[k][1] + dy]; }
		else s.pts[j] = [b[0] + dx, b[1] + dy];
		this.renderPanel(); this.draw();
	}
	select(s) { this.sel = s; this.dimHits = null; this.renderPanel(); this.draw(); }
	deleteSel() { if (!this.sel) return; this.push(); this.plan.shapes = this.plan.shapes.filter((x) => x !== this.sel); this.select(null); }

	/* -------------------------------------------------------- panel */
	renderMeasures() { if (this.measBox && this.sel) this.measBox.replaceChildren(...measureRows(this.sel)); }
	renderPanel() {
		const pn = this.panel;
		pn.innerHTML = '';
		const s = this.sel;
		if (this.draft) {
			put(pn, h('h3', null, `Drawing: ${KINDS[this.draft.kind] ? KINDS[this.draft.kind].label : 'Scale line'}`),
				h('p', { class: 'ds-hint' }, `${this.draft.pts.length} point${this.draft.pts.length === 1 ? '' : 's'}`),
				h('div', { class: 'ds-row ds-wrap' }, h('button', { class: 'ds-btn ds-sm', onclick: () => this.finishDraft(true) }, 'Done'), h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => { if (this.draft.pts.length) this.draft.pts.pop(); this.renderPanel(); this.draw(); } }, 'Remove last point'), h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => this.finishDraft(false) }, 'Cancel')));
			return;
		}
		if (!s) {
			put(pn, h('h3', null, 'Plan'), h('p', { class: 'ds-hint' }, 'Pick a tool on the left and draw. Proposed work is priced automatically; anything marked existing is just for reference (tick “Remove it” to price a removal).'));
			if (this.o.photos && this.o.photos.length) put(pn, h('h4', null, 'Property photos'), h('div', { class: 'ds-sp-photos' }, ...this.o.photos.map((p) => h('a', { href: p.url, target: '_blank', rel: 'noopener', title: p.step }, h('img', { src: p.url, alt: p.step, loading: 'lazy' })))));
			put(pn, h('h4', null, 'Shapes'), h('div', { class: 'ds-sp-list' }, ...this.plan.shapes.map((x) => h('button', { class: 'ds-sp-li', onclick: () => this.select(x) }, `${(KINDS[x.kind] || {}).icon} ${(x.props && (x.props.label || x.props.name)) || KINDS[x.kind].label}${x.existing ? ' (existing)' : ''}`, h('small', null, short(x))))));
			put(pn, h('label', { class: 'ds-field' }, h('span', null, 'Plan notes'), h('textarea', { rows: 3, oninput: (e) => { this.plan.notes = e.target.value; this.dirty = true; } }, this.plan.notes || '')));
			return;
		}
		const k = KINDS[s.kind];
		const set = (key, v) => { this.push(); s.props[key] = v; this.draw(); this.renderMeasures(); };
		const field = (label, el) => h('label', { class: 'ds-field' }, h('span', null, label), el);
		const sel = (key, opts) => h('select', { onchange: (e) => set(key, e.target.value) }, ...opts.map(([v, l]) => h('option', { value: v, selected: String(s.props[key]) === String(v) }, l)));
		const numIn = (key, step = 1, min = 0) => h('input', { type: 'number', step, min, value: s.props[key] ?? '', onchange: (e) => set(key, parseFloat(e.target.value) || 0) });
		const txt = (key, ph = '') => h('input', { type: 'text', placeholder: ph, value: s.props[key] || '', onchange: (e) => set(key, e.target.value.slice(0, 120)) });
		const chk = (key, label) => h('label', { class: 'ds-check' }, h('input', { type: 'checkbox', checked: !!s.props[key], onchange: (e) => set(key, e.target.checked) }), ' ' + label);
		this.measBox = h('div', { class: 'ds-sp-meas' }, ...measureRows(s));
		put(pn, h('div', { class: 'ds-row ds-between' }, h('h3', null, `${k.icon} ${k.label}`), h('button', { class: 'ds-icon-btn', title: 'Deselect', 'aria-label': 'Deselect', onclick: () => this.select(null) }, icon('close', 18))), this.measBox);
		put(pn, h('div', { class: 'ds-row ds-wrap ds-sp-flags' },
			h('label', { class: 'ds-check' }, h('input', { type: 'checkbox', checked: !!s.existing, onchange: (e) => { this.push(); s.existing = e.target.checked; if (!s.existing) s.remove = false; this.renderPanel(); this.draw(); } }), ' Existing'),
			s.existing ? h('label', { class: 'ds-check' }, h('input', { type: 'checkbox', checked: !!s.remove, onchange: (e) => { this.push(); s.remove = e.target.checked; this.draw(); } }), ' Remove it') : null,
			s.closed ? h('label', { class: 'ds-check' }, h('input', { type: 'checkbox', checked: !!s.smooth, onchange: (e) => { this.push(); s.smooth = e.target.checked; this.draw(); this.renderPanel(); } }), ' Curved') : null));
		put(pn, field('Label', txt('label', 'e.g. Front foundation bed')));
		switch (s.kind) {
		case 'bed':
			put(pn, field('Cover', sel('cover', [['mulch', 'Mulch'], ['stone', 'Decorative stone'], ['none', 'Plants only']])),
				field('Material', txt('material', 'double-ground hardwood')), field('Depth (inches)', numIn('depth', 0.5, 1)),
				chk('isNew', 'New bed — remove turf & amend soil'),
				field('Edging', sel('edging', [['none', 'None'], ['steel', 'Steel'], ['aluminum', 'Aluminum'], ['plastic', 'Plastic'], ['stone', 'Stone/paver'], ['brick', 'Brick'], ['natural', 'Natural spade edge']])),
				field('Edging along (% of edge)', h('input', { type: 'number', min: 0, max: 100, step: 5, value: Math.round((s.props.edgeFrac ?? 1) * 100), onchange: (e) => set('edgeFrac', Math.max(0, Math.min(100, +e.target.value || 0)) / 100) })), this.sizeBox(s));
			break;
		case 'stone': put(pn, field('Material', txt('material')), field('Depth (inches)', numIn('depth', 0.5, 1)), this.sizeBox(s)); break;
		case 'lawn': put(pn, field('Method', sel('method', [['sod', 'New sod'], ['seed', 'Seed'], ['existing', 'Keep existing lawn']])), this.sizeBox(s)); break;
		case 'patio': put(pn, field('Material', sel('material', [['Concrete pavers', 'Concrete pavers'], ['Clay brick', 'Clay brick'], ['Bluestone (thermal)', 'Bluestone'], ['Natural flagstone', 'Natural flagstone'], ['Porcelain pavers', 'Porcelain pavers'], ['Tumbled stone', 'Tumbled stone']])), field('Border course', sel('border', [['none', 'None'], ['soldier', 'Soldier course'], ['contrast', 'Contrasting color']])), field('Steps', numIn('steps', 1, 0)), this.sizeBox(s)); break;
		case 'walkway': put(pn, field('Width (ft)', numIn('width', 0.5, 1)), field('Material', sel('material', [['Concrete pavers', 'Concrete pavers'], ['Bluestone (thermal)', 'Bluestone'], ['Natural flagstone', 'Flagstone'], ['Clay brick', 'Brick'], ['gravel', 'Gravel path']])), field('Steps', numIn('steps', 1, 0))); break;
		case 'wall': put(pn, field('Exposed height (ft)', numIn('height', 0.5, 0.5)), field('Material', txt('material')), chk('cap', 'Caps'), chk('planting', 'Planting area behind')); break;
		case 'edging': put(pn, field('Type', sel('type', [['steel', 'Steel'], ['aluminum', 'Aluminum'], ['plastic', 'Plastic'], ['stone', 'Stone/paver'], ['brick', 'Brick'], ['natural', 'Natural spade edge']]))); break;
		case 'fence': put(pn, field('Type', sel('type', [['vinyl', 'Vinyl'], ['wood', 'Wood'], ['aluminum', 'Aluminum'], ['splitrail', 'Split rail'], ['chainlink', 'Chain link']])), field('Height (ft)', numIn('height', 0.5, 3)), field('Gates', numIn('gates', 1, 0))); break;
		case 'plant':
			put(pn, field('Plant', h('div', { class: 'ds-row' }, h('b', null, s.props.name || 'Plant'), this.o.pickPlant ? h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: async () => { const it = await this.o.pickPlant(); if (it) { this.push(); Object.assign(s.props, { id: it.id, name: it.name, sci: it.sci || '', cat: it.cat, w: Math.round((it.w || 3) * 10) / 10 }); this.renderPanel(); this.draw(); } } }, 'Change') : null)),
				field('Type', sel('cat', [['trees', 'Tree'], ['evergreens', 'Evergreen tree'], ['shrubs', 'Shrub'], ['perennials', 'Perennial'], ['grasses', 'Ornamental grass'], ['annuals', 'Annual'], ['vines', 'Vine']])),
				field('Size', txt('size', 'e.g. #3 container')), field('How many here', numIn('count', 1, 1)), field('Spread on plan (ft)', numIn('w', 0.5, 0.5)), field('Your price each ($, optional)', numIn('cost', 1, 0)));
			break;
		case 'light': put(pn, field('Fixture', sel('type', [['Path light', 'Path light'], ['Spotlight', 'Spotlight / uplight'], ['Well light', 'Well light'], ['Wall light', 'Wall / step light'], ['Accent light', 'Accent light']])), field('How many', numIn('count', 1, 1))); break;
		case 'boulder': put(pn, field('Size', txt('size', '2–3 ft')), field('How many', numIn('count', 1, 1))); break;
		case 'feature': put(pn, field('What', txt('name', 'Fire pit, fountain…')), field('How many', numIn('count', 1, 1)), field('Your cost each ($)', numIn('cost', 1, 0)), field('Install hours each', numIn('hrs', 0.5, 0))); break;
		case 'note': put(pn, field('Note', h('textarea', { rows: 3, onchange: (e) => set('text', e.target.value.slice(0, 300)) }, s.props.text || ''))); break;
		default: if (s.closed) put(pn, this.sizeBox(s));
		}
		put(pn, h('div', { class: 'ds-row ds-wrap', style: { marginTop: '10px' } },
			h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => { this.push(); const c = JSON.parse(JSON.stringify(s)); c.id = uid(); c.pts = c.pts.map((p) => [p[0] + 3, p[1] + 3]); this.plan.shapes.push(c); this.select(c); } }, icon('copy', 16), ' Duplicate'),
			GEOM[s.kind] !== 'point' ? h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => this.addVertex(s) }, '+ Corner') : null,
			GEOM[s.kind] !== 'point' && s.pts.length > (s.closed ? 3 : 2) ? h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => { this.push(); s.pts.pop(); this.draw(); this.renderPanel(); } }, '− Corner') : null,
			h('button', { class: 'ds-btn ds-ghost ds-sm ds-danger', onclick: () => this.deleteSel() }, icon('trash', 16), ' Delete')));
		if (GEOM[s.kind] !== 'point' && (!s.smooth || !s.closed)) put(pn, h('p', { class: 'ds-hint' }, 'Tip: tap a blue dimension on the plan to type an exact length.'));
	}
	sizeBox(s) {
		if (!(s.closed && s.pts.length === 4 && isRect(s.pts))) return null;
		const a = s.pts[0], b = s.pts[1], d = s.pts[3];
		const W = Math.hypot(b[0] - a[0], b[1] - a[1]), H = Math.hypot(d[0] - a[0], d[1] - a[1]);
		const w = h('input', { type: 'text', value: fmtFtIn(W), 'aria-label': 'Width' }), hh = h('input', { type: 'text', value: fmtFtIn(H), 'aria-label': 'Depth' });
		return h('div', { class: 'ds-field' }, h('span', null, 'Size (width × depth)'), h('div', { class: 'ds-row' }, w, '×', hh, h('button', { class: 'ds-btn ds-sm', onclick: () => {
			const nw = parseFtIn(w.value), nh = parseFtIn(hh.value);
			if (!(nw > 0 && nh > 0)) return this.toast('Type sizes like 16\' or 12\' 6".');
			this.push();
			const ux = (b[0] - a[0]) / W, uy = (b[1] - a[1]) / W, vx = (d[0] - a[0]) / H, vy = (d[1] - a[1]) / H;
			s.pts = [a, [a[0] + ux * nw, a[1] + uy * nw], [a[0] + ux * nw + vx * nh, a[1] + uy * nw + vy * nh], [a[0] + vx * nh, a[1] + vy * nh]];
			this.renderPanel(); this.draw();
		} }, 'Set')));
	}
	addVertex(s) {
		this.push();
		// split the longest side
		let best = 0, bi = 0;
		const n = s.pts.length, last = s.closed ? n : n - 1;
		for (let i = 0; i < last; i++) { const a = s.pts[i], b = s.pts[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L > best) { best = L; bi = i; } }
		const a = s.pts[bi], b = s.pts[(bi + 1) % n];
		s.pts.splice(bi + 1, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
		this.draw(); this.renderPanel();
	}

	/* ------------------------------------------------------ AI measure */
	async aiMeasure() {
		const bg = this.plan.bg;
		if (!bg || !this.img || bg.kind !== 'aerial' && !bg.scaled) return this.toast('AI Measure needs a to-scale aerial backdrop. Tap Backdrop → Aerial photo first.', 5000);
		const close = () => m.remove();
		const targets = [['lawn', 'the lawn grass', 'lawn', true], ['bed', 'garden beds and mulched planting beds', 'bed', true], ['patio', 'patio pavers and terrace', 'patio', true], ['driveway', 'driveway pavement', 'driveway', true], ['walkway', 'walkway and sidewalk', 'patio', true], ['house', 'house roof', 'house', true], ['structure', 'shed or detached garage roof', 'structure', true]];
		const picks = new Set(['lawn', 'bed']);
		const m = h('div', { class: 'ds-backdrop' }, h('div', { class: 'ds-modal', role: 'dialog' },
			h('div', { class: 'ds-modal-head' }, h('h3', null, '✨ AI Measure'), h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: close }, icon('close'))),
			h('div', { class: 'ds-modal-body' },
				h('p', { class: 'ds-hint' }, 'AI finds these areas on the aerial photo and traces them. The outlines become normal shapes you can adjust — the measurements come from the traced shapes, so check the edges before quoting.'),
				h('div', { class: 'ds-chips' }, ...targets.map(([id, , kind]) => h('button', { class: 'ds-chip' + (picks.has(id) ? ' on' : ''), onclick: (e) => { picks.has(id) ? picks.delete(id) : picks.add(id); e.currentTarget.classList.toggle('on'); } }, `${KINDS[kind].icon} ${id === 'walkway' ? 'Walkways' : KINDS[id] ? KINDS[id].label : id}`))),
				h('button', { class: 'ds-btn ds-wide', onclick: async () => {
					close();
					let added = 0;
					for (const [id, text, kind] of targets.filter((t) => picks.has(t[0]))) {
						this.say(`AI is finding ${text}…`);
						try {
							const W = this.img.naturalWidth, H = this.img.naturalHeight;
							const mask = await this.o.segment(this.img, text, W, H);
							if (!mask) continue;
							const polys = traceMask(mask, W, H, Math.max(1, Math.round(1.5 * bg.ppf)) ** 2 * 8);
							this.push();
							for (const poly of polys) {
								const pts = poly.map((p) => [p[0] / bg.ppf, p[1] / bg.ppf]);
								if (polyArea(pts) < 12) continue;
								this.plan.shapes.push({ id: uid(), kind, pts, closed: true, smooth: false, existing: true, remove: false, props: { ...(DEFAULT_PROPS[kind] || {}), label: 'AI: ' + (id === 'walkway' ? 'walkway' : KINDS[kind].label.toLowerCase()), method: kind === 'lawn' ? 'existing' : undefined, isNew: false } });
								added++;
							}
						} catch (e) { this.toast(e.message || 'AI Measure didn’t work this time.'); }
					}
					this.say('');
					this.toast(added ? `AI traced ${added} area${added > 1 ? 's' : ''}. They’re marked “existing” — untick it on anything you’re replacing, and check the edges.` : 'AI didn’t find those areas. Try zooming the aerial closer.', 6000);
					this.renderPanel(); this.draw();
				} }, 'Measure with AI (free)'))));
		this.o.root.append(m);
	}
}

/* ---------------------------------------------------------------- helpers */

function measureRows(s) {
	const m = measure(s);
	const out = [];
	if (m.area) out.push(h('div', null, h('small', null, 'Area'), h('b', null, fmtArea(m.area))));
	if (m.perimeter && s.closed) out.push(h('div', null, h('small', null, 'Perimeter'), h('b', null, fmtFtIn(m.perimeter))));
	if (m.length) out.push(h('div', null, h('small', null, 'Length'), h('b', null, fmtFtIn(m.length))));
	if (s.kind === 'walkway' && m.area) out.push(h('div', null, h('small', null, 'Paved area'), h('b', null, fmtArea(m.area))));
	if (s.kind === 'wall') out.push(h('div', null, h('small', null, 'Wall face'), h('b', null, fmtArea(m.length * (+s.props.height || 2)))));
	if (s.kind === 'bed' && m.area && s.props.cover !== 'none') { const d = +s.props.depth || 3; out.push(h('div', null, h('small', null, `${s.props.cover === 'stone' ? 'Stone' : 'Mulch'} at ${d}"`), h('b', null, `${(Math.round(m.area * d / 12 / 27 * 10) / 10)} yd³`))); }
	if (m.count) out.push(h('div', null, h('small', null, 'Count'), h('b', null, String(m.count))));
	return out;
}
function short(s) { const m = measure(s); return m.area ? fmtArea(m.area) : m.length ? fmtFtIn(m.length) : m.count > 1 ? '×' + m.count : ''; }
function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
function roundRect(c, x, y, w, hh, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + hh, r); c.arcTo(x + w, y + hh, x, y + hh, r); c.arcTo(x, y + hh, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function pointIn(p, poly) { let ins = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) ins = !ins; } return ins; }
function segDist(p, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy; const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); }
function isRect(p) { if (p.length !== 4) return false; for (let i = 0; i < 4; i++) { const a = p[i], b = p[(i + 1) % 4], c = p[(i + 2) % 4]; const d = (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]); const L = Math.hypot(b[0] - a[0], b[1] - a[1]) * Math.hypot(c[0] - b[0], c[1] - b[1]); if (!L || Math.abs(d / L) > 0.02) return false; } return true; }

/**
 * Binary mask → outer outlines of its larger blobs (pixel coordinates), simplified.
 * Exported for tests. Uses connected components + Moore-neighbour tracing + Douglas–Peucker.
 */
export function traceMask(mask, W, H, minPx = 400) {
	const lab = new Int32Array(W * H);
	const polys = [];
	let id = 0;
	const q = new Int32Array(W * H);
	for (let s = 0; s < W * H; s++) {
		if (!mask[s] || lab[s]) continue;
		id++;
		let qh = 0, qt = 0, n = 0;
		q[qt++] = s; lab[s] = id;
		while (qh < qt) {
			const k = q[qh++]; n++;
			const x = k % W, y = (k / W) | 0;
			if (x > 0 && mask[k - 1] && !lab[k - 1]) { lab[k - 1] = id; q[qt++] = k - 1; }
			if (x < W - 1 && mask[k + 1] && !lab[k + 1]) { lab[k + 1] = id; q[qt++] = k + 1; }
			if (y > 0 && mask[k - W] && !lab[k - W]) { lab[k - W] = id; q[qt++] = k - W; }
			if (y < H - 1 && mask[k + W] && !lab[k + W]) { lab[k + W] = id; q[qt++] = k + W; }
		}
		if (n < minPx) continue;
		const ring = moore(lab, W, H, s, id);
		if (ring.length < 3) continue;
		// The ring runs through boundary pixel centres; grow it so its area equals the blob's pixel count.
		const simp = simplify(ring, 1.2), a = polyAreaPx(simp), c = centroid(simp), k = a > 0 ? Math.sqrt(n / a) : 1;
		polys.push(simp.map((p) => [c[0] + (p[0] - c[0]) * k, c[1] + (p[1] - c[1]) * k]));
		if (polys.length >= 12) break;
	}
	return polys.filter((p) => p.length >= 3);
}
function moore(lab, W, H, start, id) {
	const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H && lab[y * W + x] === id;
	const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
	let x = start % W, y = (start / W) | 0;
	const sx = x, sy = y, out = [[x + 0.5, y + 0.5]];
	let d = 6; // came from above (start is the top-left-most pixel of the blob)
	for (let guard = 0; guard < W * H * 2; guard++) {
		let found = false;
		for (let i = 0; i < 8; i++) {
			const nd = (d + 6 + i) % 8, nx = x + dirs[nd][0], ny = y + dirs[nd][1];
			if (inside(nx, ny)) { x = nx; y = ny; d = nd; found = true; break; }
		}
		if (!found || (x === sx && y === sy)) break;
		out.push([x + 0.5, y + 0.5]);
	}
	return out;
}
function polyAreaPx(p) { return polyArea(p); }
export function simplify(pts, eps) {
	if (pts.length < 4) return pts;
	const keep = new Uint8Array(pts.length);
	keep[0] = keep[pts.length - 1] = 1;
	const stack = [[0, pts.length - 1]];
	while (stack.length) {
		const [a, b] = stack.pop();
		let best = 0, bi = -1;
		for (let i = a + 1; i < b; i++) { const d = segDist(pts[i], pts[a], pts[b]); if (d > best) { best = d; bi = i; } }
		if (best > eps && bi > 0) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
	}
	return pts.filter((_, i) => keep[i]);
}
export { sampleSmooth, pathLength };

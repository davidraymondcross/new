/* DreamScaper – editor tool panels added in 2.6:
 *  object controls (move · resize · rotate · flip · duplicate & repeat · order · blend & shadow · layer options),
 *  ground-shape editor, Shapes tool (bed / patio / lawn / walkway / retaining wall / edging),
 *  Measure & zones, Adjust (light · color · detail) + Crop / rotate / straighten / perspective,
 *  Layers window, Design versions, Compare and Presentation mode.
 */
import { h, put, icon, canvas, canvasToBlob, blobToBitmap, uid } from './util.js?v=2.7.0';
import { modal } from './capture.js?v=2.7.0';
import { ZONES, opName } from './editor.js?v=2.7.0';
import { ADJUST, PRESETS, planTransform, renderTransform, mapView } from './photoedit.js?v=2.7.0';
import { fmtFtIn } from './takeoff.js?v=2.7.0';

const deg = (v) => `${Math.round(v)}°`;
const pct = (v) => `${Math.round(v)}%`;
const signed = (v) => (v > 0 ? '+' : '') + Math.round(v);

/* ======================================================== object controls */

/** Extra inspector sections for a selected plant / feature. */
export function objectControls(o, c) {
	const { ed, sect, slider, seg, toast } = c;
	const it = c.byId[o.item];
	const out = [];
	// Move
	const step = h('select', { 'aria-label': 'Nudge distance' }, ...[['0.5', '6"'], ['1', '1 ft'], ['3', '3 ft']].map(([v, l]) => h('option', { value: v, selected: v === '1' }, l)));
	const nb = (lab, ic, dx, dz) => h('button', { class: 'ds-btn ds-ghost ds-sm', 'aria-label': lab, title: lab, onclick: () => { ed.nudgeSelected(dx * +step.value, dz * +step.value); c.refresh(); } }, ic);
	out.push(sect('Move', h('div', { class: 'ds-movepad' },
		h('span'), nb('Move away (farther)', '▲', 0, 1), h('span'),
		nb('Move left', '◀', -1, 0), step, nb('Move right', '▶', 1, 0),
		h('span'), nb('Move closer', '▼', 0, -1), h('span')),
		h('p', { class: 'ds-hint' }, ed.isTop ? 'Arrows move it on the map. You can also drag it.' : 'Up/down move it farther away or closer on the ground — it shrinks or grows with the perspective. Or just drag it.'),
		h('div', { class: 'ds-row ds-wrap' },
			h('label', { class: 'ds-mini' }, 'X ', h('input', { type: 'number', value: Math.round(o.x), onchange: (e) => { ed.updateSelected({ x: +e.target.value || 0 }); c.refresh(); } })),
			h('label', { class: 'ds-mini' }, 'Y ', h('input', { type: 'number', value: Math.round(o.y), onchange: (e) => { ed.updateSelected({ y: +e.target.value || 0 }); c.refresh(); } })))));
	// Resize
	out.push(sect('Size',
		h('div', { class: 'ds-row ds-wrap' },
			h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => { ed.updateSelected({ scale: Math.max(0.3, (o.scale || 1) / 1.1) }); c.refresh(); } }, icon('minus', 16), ' Smaller'),
			h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => { ed.updateSelected({ scale: Math.min(3, (o.scale || 1) * 1.1) }); c.refresh(); } }, icon('plus', 16), ' Bigger'),
			h('button', { class: 'ds-btn ds-ghost ds-sm', title: 'Back to the true size from the plant data and the photo’s scale', onclick: () => { ed.updateSelected({ scale: 1 }); c.refresh(); toast('Back to its real size for its age.'); } }, icon('scale', 16), ' Real size')),
		h('label', { class: 'ds-mini' }, 'Exact size ', h('input', { type: 'number', min: 30, max: 300, step: 1, value: Math.round((o.scale || 1) * 100), onchange: (e) => { ed.updateSelected({ scale: Math.min(3, Math.max(0.3, (+e.target.value || 100) / 100)) }); c.refresh(); } }), ' %'),
		h('p', { class: 'ds-hint' }, 'Sizes always scale proportionally. “Real size” uses the plant’s actual growth at the age shown.')));
	// Rotate & flip
	out.push(sect('Rotate & flip',
		h('div', { class: 'ds-row ds-wrap' },
			h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => { ed.updateSelected({ rot: ((o.rot || 0) - 15 + 540) % 360 - 180 }); c.refresh(); } }, '⟲ Left'),
			h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => { ed.updateSelected({ rot: ((o.rot || 0) + 15 + 540) % 360 - 180 }); c.refresh(); } }, '⟳ Right'),
			h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => { ed.updateSelected({ flip: !o.flip }); c.refresh(); } }, icon('flip', 16), ' Flip ↔'),
			h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => { ed.updateSelected({ flipV: !o.flipV }); c.refresh(); } }, '↕ Flip')),
		slider('Angle', -180, 180, 1, Math.round(o.rot || 0), deg, (v) => ed.updateSelected({ rot: v })),
		h('label', { class: 'ds-mini' }, 'Set angle ', h('input', { type: 'number', min: -180, max: 180, value: Math.round(o.rot || 0), onchange: (e) => { ed.updateSelected({ rot: Math.max(-180, Math.min(180, +e.target.value || 0)) }); c.refresh(); } }), '°')));
	// Duplicate & repeat
	const n = h('input', { type: 'number', min: 2, max: 25, value: 3, 'aria-label': 'How many' });
	const sp = h('input', { type: 'number', min: 0.5, max: 50, step: 0.5, value: Math.max(1, Math.round((it.w || 3) * 2) / 2), 'aria-label': 'Spacing in feet' });
	let lay = 'row';
	out.push(sect('Duplicate',
		h('div', { class: 'ds-row ds-wrap' }, h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => ed.duplicateSelected() }, icon('copy', 16), ' Duplicate')),
		h('p', { class: 'ds-hint' }, `Plant a group of ${it.name.toLowerCase()} — spaced on the ground at its mature spread (${fmtFtIn(it.w || 3)}).`),
		h('div', { class: 'ds-row ds-wrap' }, h('label', { class: 'ds-mini' }, 'How many ', n), h('label', { class: 'ds-mini' }, 'Spacing ', sp, ' ft')),
		seg([['row', 'In a row'], ['cluster', 'Natural cluster']], lay, (k) => (lay = k)),
		h('button', { class: 'ds-btn ds-sm', onclick: () => { const made = ed.repeatSelected(Math.max(2, Math.min(25, +n.value || 3)), Math.max(0.5, +sp.value || 3), lay); toast(made.length ? `Planted ${made.length + 1} in a ${lay === 'row' ? 'row' : 'cluster'}.` : 'No room for more here — try a smaller spacing.'); } }, icon('plant', 16), ' Plant the group')));
	// Order
	out.push(sect('Arrange (in front / behind)', h('div', { class: 'ds-grid2' },
		h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => ed.orderSelected('front') }, '⤒ Bring to front'),
		h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => ed.orderSelected('forward') }, '↑ Bring forward'),
		h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => ed.orderSelected('backward') }, '↓ Send backward'),
		h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => ed.orderSelected('back') }, '⤓ Send to back'))));
	// Blend
	const fx = { b: 0, c: 0, s: 0, w: 0, ...(o.fx || {}) };
	const sh = { k: 1, len: 1, soft: 0.5, dir: null, off: false, ...(o.sh || {}) };
	const fxS = (label, key) => slider(label, -100, 100, 1, Math.round(fx[key] * 100), signed, (v) => { fx[key] = v / 100; ed.updateSelected({ fx: { ...fx } }); });
	const shS = (label, key, min, max, fmt) => slider(label, min, max, 1, Math.round((sh[key] == null ? 0 : sh[key]) * 100), fmt, (v) => { sh[key] = v / 100; ed.updateSelected({ sh: { ...sh } }); });
	out.push(sect('Blend into the photo',
		h('div', { class: 'ds-row ds-wrap' },
			h('button', { class: 'ds-btn ds-sm', onclick: () => { const r = ed.autoBlend(); toast(r ? 'Matched to the light and color around it.' : 'Couldn’t read the photo around it.'); c.refresh(); } }, icon('wand', 16), ' Auto blend'),
			h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => { ed.updateSelected({ fx: null, sh: null, alpha: 1 }); c.refresh(); } }, 'Reset')),
		h('p', { class: 'ds-hint' }, 'Auto blend matches brightness, contrast, color, warmth and the shadow to the photo right around it — like it was there when the picture was taken.'),
		h('details', null, h('summary', null, 'Light & color'), fxS('Brightness', 'b'), fxS('Contrast', 'c'), fxS('Saturation', 's'), fxS('Warmth', 'w')),
		h('details', null, h('summary', null, 'Shadow'),
			h('label', { class: 'ds-check' }, h('input', { type: 'checkbox', checked: !sh.off, onchange: (e) => { sh.off = !e.target.checked; ed.updateSelected({ sh: { ...sh } }); } }), ' Ground shadow'),
			shS('Opacity', 'k', 0, 200, pct), shS('Length', 'len', 0, 300, pct), shS('Softness', 'soft', 0, 100, pct),
			seg([['auto', 'Sun (scene)'], ['-1', 'From left'], ['1', 'From right']], sh.dir == null ? 'auto' : String(sh.dir), (k) => { sh.dir = k === 'auto' ? null : +k; ed.updateSelected({ sh: { ...sh } }); }),
			h('p', { class: 'ds-hint' }, 'Shadows make an object look attached to the ground. Match the direction to the real shadows in your photo.'))));
	// Layer options
	out.push(sect('Layer',
		h('label', { class: 'ds-mini ds-wide' }, 'Name ', h('input', { type: 'text', value: o.name || '', placeholder: it.name, onchange: (e) => ed.updateSelected({ name: e.target.value.slice(0, 40) }) })),
		slider('Opacity', 10, 100, 1, Math.round((o.alpha == null ? 1 : o.alpha) * 100), pct, (v) => ed.updateSelected({ alpha: v / 100 })),
		h('div', { class: 'ds-row ds-wrap' },
			h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => { ed.updateSelected({ lock: true }); ed.select(null); toast('Locked. Unlock it in Layers.'); } }, icon('lock', 16), ' Lock'),
			h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => { ed.updateSelected({ hidden: true }); ed.select(null); toast('Hidden. Show it again in Layers.'); } }, icon('eye', 16), ' Hide'))));
	return out;
}

/* ======================================================= ground shape editor */

export function opInspector(el, op, c) {
	const { ed, sect, slider, seg, swatches } = c;
	const m = ed.opMeasure(op), ap = ed.isTop ? '' : '≈ ';
	const name = op.name || (op.label ? op.label.replace(/^(Drew|Built|Added|Copied) an? /, '') : opName(op));
	const size = [m.area ? `${ap}${Math.round(m.area).toLocaleString()} sq ft` : '', m.length ? `${ap}${fmtFtIn(m.length)} long` : '', m.face ? `${ap}${Math.round(m.face)} sq ft wall face` : ''].filter(Boolean).join(' · ');
	put(el,
		sect(null, h('div', { class: 'ds-row ds-between' }, h('h4', null, '✏️ ' + name.charAt(0).toUpperCase() + name.slice(1)), h('button', { class: 'ds-icon-btn', 'aria-label': 'Done', onclick: () => ed.selectOp(null) }, icon('close', 18))),
			size ? h('p', { class: 'ds-meas-big' }, size) : null,
			h('p', { class: 'ds-hint' }, 'Drag the white dots to reshape it, or drag inside to move it.')),
		op.t === 'poly' ? sect('Shape', seg([['curved', 'Curved'], ['straight', 'Straight']], op.straight ? 'straight' : 'curved', (k) => ed.updateOp(op, { straight: k === 'straight' }, k === 'straight' ? 'Straightened the edges' : 'Smoothed the edges'))) : null,
		op.t === 'path' || op.t === 'wall' || op.t === 'edge' ? sect('Path', seg([['curved', 'Curved'], ['straight', 'Straight']], op.curved ? 'curved' : 'straight', (k) => ed.updateOp(op, { curved: k === 'curved' }))) : null,
		op.t === 'path' ? sect(null, slider('Width', 2, 12, 0.5, op.width || 4, (v) => fmtFtIn(v), (v) => ed.updateOp(op, { width: v }, 'Changed the walkway width'))) : null,
		op.t === 'wall' ? sect(null, slider('Height', 0.5, 6, 0.5, op.height || 2, (v) => fmtFtIn(v), (v) => ed.updateOp(op, { height: v }, 'Changed the wall height')),
			h('label', { class: 'ds-check' }, h('input', { type: 'checkbox', checked: op.cap !== false, onchange: (e) => ed.updateOp(op, { cap: e.target.checked }, e.target.checked ? 'Added a wall cap' : 'Removed the wall cap') }), ' Cap stones on top')) : null,
		op.t !== 'wall' && op.t !== 'brush' && op.t !== 'mask' ? sect(op.t === 'edge' ? 'Edging' : 'Border / edging', seg([...(op.t === 'edge' ? [] : [['none', 'None']]), ['steel', 'Metal'], ['plastic', 'Plastic'], ['stone', 'Stone'], ['brick', 'Brick']], op.edging || 'none', (k) => ed.updateOp(op, { edging: k === 'none' ? null : k }, 'Changed the edging'))) : null,
		op.t !== 'edge' ? sect('Material', swatches(op.mat, (id) => ed.updateOp(op, { mat: id }, 'Changed the material'))) : null,
		sect('Size & layer',
			h('div', { class: 'ds-row ds-wrap' },
				h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => ed.scaleOp(op, 1 / 1.1) }, icon('minus', 16), ' Smaller'),
				h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => ed.scaleOp(op, 1.1) }, icon('plus', 16), ' Bigger')),
			slider('Opacity', 10, 100, 1, Math.round((op.alpha == null ? 1 : op.alpha) * 100), pct, (v) => ed.updateOp(op, { alpha: v / 100 }, 'Changed the opacity')),
			op.t === 'brush' || op.t === 'mask' ? slider('Soft edge', 0, 20, 1, op.soft || 0, (v) => v + ' px', (v) => ed.updateOp(op, { soft: v }, 'Softened the edge')) : null,
			h('div', { class: 'ds-row ds-wrap' },
				h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => ed.duplicateOp(op) }, icon('copy', 16), ' Duplicate'),
				h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => ed.moveOp(op, 1) }, '↑ On top'),
				h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => ed.moveOp(op, -1) }, '↓ Below'),
				h('button', { class: 'ds-btn ds-danger ds-sm', onclick: () => ed.deleteOp(op) }, icon('trash', 16), ' Remove'))));
}

/* ============================================================ Shapes tool */

export const SHAPES = [
	['bed', '🪴', 'Planting bed'], ['patio', '🧱', 'Patio'], ['lawn', '🟩', 'Lawn'],
	['walkway', '🚶', 'Walkway'], ['wall', '🧱', 'Retaining wall'], ['edge', '〰️', 'Edging']
];
export function panelShapes(el, c) {
	const { ed, sect, slider, seg, swatches } = c;
	const B = ed.opts.bed, n = ed.bedPts.length;
	const line = B.shape === 'walkway' || B.shape === 'wall' || B.shape === 'edge';
	const area = !line;
	const how = {
		bed: 'Tap around the bed. Tap the first point (or Finish) to close it. Curved makes smooth, natural edges.',
		patio: 'Drag a rectangle on the ground — it follows the photo’s perspective — or switch off Rectangle and tap the corners of any shape.',
		lawn: 'Tap around the new lawn area, or drag a rectangle.',
		walkway: 'Tap along the middle of the walkway, from one end to the other. It keeps a true width and narrows into the distance.',
		wall: 'Tap along the bottom of the wall. Set its height — it rises straight up from that line.',
		edge: 'Tap along the edge line. Pick metal, plastic, stone or brick edging.'
	}[B.shape];
	put(el,
		sect('Landscape shapes', h('div', { class: 'ds-shape-pick' }, ...SHAPES.map(([id, e, l]) => h('button', { class: 'ds-shape' + (B.shape === id ? ' on' : ''), onclick: () => { B.shape = id; if (id === 'wall' && !/wall|block|stone/i.test(B.mat)) B.mat = c.defaultMat('wall'); if (id === 'patio' || id === 'walkway') { if (/mulch/i.test(B.mat)) B.mat = c.defaultMat('paver'); } if (id === 'lawn') B.mat = c.defaultMat('lawn'); ed.cancelBed(); c.renderPanel(); } }, h('span', null, e), h('small', null, l)))),
			h('p', { class: 'ds-muted' }, how)),
		n ? sect(null, h('div', { class: 'ds-row' },
			h('button', { class: 'ds-btn', disabled: n < (line ? 2 : 3), onclick: () => ed.finishBed() }, icon('check', 18), ' Finish'),
			h('button', { class: 'ds-btn ds-ghost', onclick: () => { ed.bedPts.pop(); ed._drawOverlay(); c.renderPanel(); } }, 'Undo point'),
			h('button', { class: 'ds-btn ds-ghost', onclick: () => ed.cancelBed() }, 'Cancel')), h('p', { class: 'ds-hint' }, `${n} point${n > 1 ? 's' : ''} placed`)) : null,
		sect('Edges', seg([['curved', 'Curved'], ['straight', 'Straight']], B.curved ? 'curved' : 'straight', (k) => { B.curved = k === 'curved'; ed._drawOverlay(); }),
			area ? h('label', { class: 'ds-check' }, h('input', { type: 'checkbox', checked: !!B.rect, onchange: (e) => { B.rect = e.target.checked; } }), ' Rectangle (drag to draw)') : null),
		B.shape === 'walkway' ? sect(null, slider('Width', 2, 12, 0.5, B.width, (v) => fmtFtIn(v), (v) => { B.width = v; ed._drawOverlay(); })) : null,
		B.shape === 'wall' ? sect(null, slider('Wall height', 0.5, 6, 0.5, B.height, (v) => fmtFtIn(v), (v) => { B.height = v; ed._drawOverlay(); }),
			h('label', { class: 'ds-check' }, h('input', { type: 'checkbox', checked: B.cap, onchange: (e) => { B.cap = e.target.checked; } }), ' Cap stones on top'),
			h('p', { class: 'ds-hint' }, 'Tip: draw a planting bed behind the wall for a raised planting area.')) : null,
		B.shape !== 'wall' && B.shape !== 'lawn' ? sect(B.shape === 'edge' ? 'Edging type' : 'Border / edging', seg([...(B.shape === 'edge' ? [] : [['none', 'None']]), ['steel', 'Metal'], ['plastic', 'Plastic'], ['stone', 'Stone'], ['brick', 'Brick']], B.edging, (k) => { B.edging = k; })) : null,
		B.shape !== 'edge' ? sect(B.shape === 'wall' ? 'Wall material' : B.shape === 'bed' ? 'Fill with (mulch, stone…)' : 'Material', swatches(B.mat, (id) => { B.mat = id; })) : null,
		sect(null, h('p', { class: 'ds-hint' }, 'Already drew one? Use Select and tap it to reshape, resize, change the material or edging.')));
}

/* ============================================================ Measure */

export function panelMeasure(el, c) {
	const { ed, sect, seg, toast } = c;
	const M = ed.opts.measure, n = ed.measPts.length, list = ed.view.meas || [];
	put(el,
		sect('Measure & plan', h('p', { class: 'ds-muted' }, ed.isTop ? 'Bird’s-eye views are to scale, so measurements are accurate.' : 'Measurements on photos are estimates (≈) from the perspective — set the scale first for best results. For exact numbers use a bird’s-eye view.')),
		sect(null, seg([['dist', '📏 Distance'], ['area', '⬛ Area'], ['zone', '🔷 Zone']], M.mode, (k) => { M.mode = k; ed.cancelMeasure(); c.renderPanel(); })),
		M.mode === 'zone' ? sect('Zone type', seg(Object.entries(ZONES).filter(([k]) => k !== 'area').map(([k, v]) => [k, v[0]]), M.zone, (k) => { M.zone = k; ed._drawOverlay(); })) : null,
		sect(null, h('p', { class: 'ds-hint' }, M.mode === 'dist' ? 'Tap two points on the ground — walkway length, a bed’s width, distance from the house.' : M.mode === 'area' ? 'Tap around an area (bed, patio, lawn). Tap the first point to finish.' : 'Mark where plantings and hardscape will go, and what exists to keep or remove.'),
			n ? h('div', { class: 'ds-row' }, h('button', { class: 'ds-btn ds-sm', disabled: n < 3, onclick: () => { ed.finishMeasure(); c.renderPanel(); } }, 'Finish'), h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => { ed.cancelMeasure(); c.renderPanel(); } }, 'Cancel')) : null),
		sect(`Saved (${list.length})`, list.length ? h('ul', { class: 'ds-meas-list' }, ...list.map((m) => h('li', null,
			h('span', null, m.t === 'zone' ? '🔷 ' + (m.label || ZONES[m.kind][0]) : m.t === 'area' ? '⬛ ' + (m.label || 'Area') : '📏 ' + (m.label || 'Distance')),
			h('b', null, ed.measText(m)),
			h('button', { class: 'ds-icon-btn', 'aria-label': 'Name it', title: 'Name it', onclick: () => { const t = prompt('Name', m.label || ''); if (t != null) { m.label = t.slice(0, 40); ed.changed(); c.renderPanel(); } } }, icon('edit', 16)),
			h('button', { class: 'ds-icon-btn', 'aria-label': 'Delete', onclick: () => { ed.removeMeasure(m); c.renderPanel(); } }, icon('trash', 16))))) : h('p', { class: 'ds-muted' }, 'Nothing measured yet.'),
		list.length ? h('label', { class: 'ds-check' }, h('input', { type: 'checkbox', checked: !!ed.showMeas, onchange: (e) => { ed.showMeas = e.target.checked; ed.render(); toast(e.target.checked ? 'Measurements stay visible with every tool.' : 'Measurements show only in this tool.'); } }), ' Keep showing them with other tools') : null));
}

/* ============================================================ Adjust */

export function panelAdjust(el, c) {
	const { ed, sect, slider } = c;
	const v = ed.view;
	let start = { ...(v.adj || {}) };
	const cur = { ...(v.adj || {}) };
	let t = 0;
	const commit = () => { clearTimeout(t); t = setTimeout(() => { ed.setAdjust(cur, true, start); start = { ...cur }; }, 500); };
	const groups = {};
	for (const [k, label, min, max, g] of ADJUST) {
		groups[g] = groups[g] || [];
		groups[g].push(slider(label, min, max, 1, cur[k] || 0, k === 'hue' ? deg : signed, (val) => { cur[k] = val; ed.setAdjust(cur, false); commit(); }));
	}
	const holdBtn = h('button', { class: 'ds-btn ds-ghost ds-sm' }, icon('eye', 16), ' Hold to see original');
	const peek = (on) => { if (on) { v._adjSave = v.adj; v.adj = {}; ed._invalidateAdj(); ed.adjusted = null; ed.render(); } else { v.adj = v._adjSave || cur; delete v._adjSave; ed._invalidateAdj(); } };
	holdBtn.addEventListener('pointerdown', () => peek(true));
	for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) holdBtn.addEventListener(ev, () => { if (v._adjSave !== undefined) peek(false); });
	put(el,
		sect('Adjust the photo', h('p', { class: 'ds-muted' }, 'Fix light and color, sharpen, or soften the background. Changes are never baked in — reset any time.'),
			h('div', { class: 'ds-row ds-wrap' }, holdBtn, h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => { ed.setAdjust({}, true, cur); c.renderPanel(); } }, 'Reset all')),
			h('div', { class: 'ds-chips ds-chips-sm' }, ...PRESETS.map(([name, a]) => h('button', { class: 'ds-chip', onclick: () => { ed.setAdjust(a, true, cur); c.renderPanel(); } }, name)))),
		...Object.entries(groups).map(([g, kids]) => h('details', { class: 'ds-sect ds-adj-group', open: g === 'Light' }, h('summary', null, g), ...kids,
			g === 'Detail' ? slider('Focus point (for blur)', 5, 95, 1, Math.round((cur.focus == null ? 0.6 : cur.focus) * 100), pct, (val) => { cur.focus = val / 100; ed.setAdjust(cur, false); commit(); }) : null)),
		sect('Crop, rotate & perspective', h('p', { class: 'ds-hint' }, 'Crop, turn, straighten a tilted photo, or fix leaning walls. Makes a new view, so this one stays as it is.'),
			h('button', { class: 'ds-btn ds-wide', onclick: () => transformDialog(c) }, icon('crop', 18), ' Crop & straighten…')));
}

/** Crop / rotate 90° / straighten / vertical & horizontal perspective → a new view. */
export function transformDialog(c) {
	const { ed, toast } = c;
	const src = ed.baseCanvas();
	const W = src.width, H = src.height;
	const p = { rot90: 0, angle: 0, vert: 0, horiz: 0, crop: { x: 0, y: 0, w: 1, h: 1 } };
	const prevC = canvas(10, 10);
	prevC.className = 'ds-tf-canvas';
	const small = canvas(Math.round(W * Math.min(1, 900 / W)), Math.round(H * Math.min(1, 900 / W)));
	small.getContext('2d').drawImage(src, 0, 0, small.width, small.height);
	let raf = 0;
	const draw = () => {
		cancelAnimationFrame(raf);
		raf = requestAnimationFrame(() => {
			const pl = planTransform(small.width, small.height, p);
			const out = renderTransform(small, pl);
			prevC.width = out.width; prevC.height = out.height;
			const x = prevC.getContext('2d');
			x.drawImage(out, 0, 0);
			x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 1;
			for (let i = 1; i < 3; i++) { x.beginPath(); x.moveTo((out.width * i) / 3, 0); x.lineTo((out.width * i) / 3, out.height); x.moveTo(0, (out.height * i) / 3); x.lineTo(out.width, (out.height * i) / 3); x.stroke(); }
			info.textContent = `${Math.round(pl.outW * W / small.width)} × ${Math.round(pl.outH * W / small.width)} px`;
		});
	};
	const info = h('small', { class: 'ds-muted' });
	const sl = (label, min, max, st, val, fmt, on) => c.slider(label, min, max, st, val, fmt, (v) => { on(v); draw(); });
	const ratios = [['free', 'Free'], ['1', '1:1'], ['4/3', '4:3'], ['3/2', '3:2'], ['16/9', '16:9'], ['4/5', '4:5']];
	let ratio = 'free';
	const applyRatio = () => {
		if (ratio === 'free') return;
		const [rn, rd] = ratio.split('/').map(Number);
		const r = rd ? rn / rd : rn;
		const ow = W * p.crop.w, oh = H * p.crop.h;
		if (ow / oh > r) p.crop.w = (oh * r) / W; else p.crop.h = ow / r / H;
		p.crop.x = Math.min(p.crop.x, 1 - p.crop.w); p.crop.y = Math.min(p.crop.y, 1 - p.crop.h);
	};
	const cropS = (label, key) => sl(label, 0, 100, 1, Math.round(p.crop[key] * 100), pct, (v) => { p.crop[key] = v / 100; if (key === 'w') p.crop.x = Math.min(p.crop.x, 1 - p.crop.w); if (key === 'h') p.crop.y = Math.min(p.crop.y, 1 - p.crop.h); if (key === 'x') p.crop.x = Math.min(p.crop.x, 1 - p.crop.w); if (key === 'y') p.crop.y = Math.min(p.crop.y, 1 - p.crop.h); applyRatio(); });
	const dims = h('div', { class: 'ds-row ds-wrap' },
		h('label', { class: 'ds-mini' }, 'Width ', h('input', { type: 'number', min: 64, max: W, placeholder: String(W), onchange: (e) => { const v = Math.min(W, Math.max(64, +e.target.value || W)); p.crop.w = v / W; p.crop.x = Math.min(p.crop.x, 1 - p.crop.w); draw(); } }), ' px'),
		h('label', { class: 'ds-mini' }, 'Height ', h('input', { type: 'number', min: 64, max: H, placeholder: String(H), onchange: (e) => { const v = Math.min(H, Math.max(64, +e.target.value || H)); p.crop.h = v / H; p.crop.y = Math.min(p.crop.y, 1 - p.crop.h); draw(); } }), ' px'));
	const ok = h('button', { class: 'ds-btn ds-wide' }, icon('check', 18), ' Make a new view');
	const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
	const m = modal(c.root, 'Crop, rotate & perspective', [
		h('div', { class: 'ds-tf' }, prevC, info),
		h('div', { class: 'ds-row ds-wrap' },
			h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => { p.rot90 = (p.rot90 + 3) % 4; draw(); } }, '⟲ 90°'),
			h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => { p.rot90 = (p.rot90 + 1) % 4; draw(); } }, '⟳ 90°'),
			h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => { Object.assign(p, { rot90: 0, angle: 0, vert: 0, horiz: 0, crop: { x: 0, y: 0, w: 1, h: 1 } }); m.querySelectorAll('input[type=range]').forEach((r) => { r.value = r.min < 0 ? 0 : r.max; r.dispatchEvent(new Event('input')); }); draw(); } }, 'Reset')),
		h('details', { open: true }, h('summary', null, 'Straighten & perspective'),
			sl('Straighten', -15, 15, 0.1, 0, (v) => v.toFixed(1) + '°', (v) => { p.angle = v; }),
			sl('Vertical perspective (leaning walls)', -100, 100, 1, 0, signed, (v) => { p.vert = v / 100; }),
			sl('Horizontal perspective', -100, 100, 1, 0, signed, (v) => { p.horiz = v / 100; }),
			h('p', { class: 'ds-hint' }, 'Line the grid up with the house corners and the ground. Building walls should be straight up and down.')),
		h('details', null, h('summary', null, 'Crop'),
			h('div', { class: 'ds-chips ds-chips-sm' }, ...ratios.map(([k, l]) => h('button', { class: 'ds-chip' + (k === ratio ? ' on' : ''), onclick: (e) => { ratio = k; e.currentTarget.parentNode.querySelectorAll('.ds-chip').forEach((b) => b.classList.remove('on')); e.currentTarget.classList.add('on'); applyRatio(); draw(); } }, l))),
			cropS('Width', 'w'), cropS('Height', 'h'), cropS('From the left', 'x'), cropS('From the top', 'y'), dims),
		ok], close, 'ds-modal-wide');
	draw();
	ok.onclick = async () => {
		ok.disabled = true;
		const pl = planTransform(W, H, p);
		const out = renderTransform(src, pl);
		const nv = mapView(ed.view, pl);
		m.remove();
		await c.addTransformedView(out, nv);
		toast('New view made. Your original view is still there in the tabs above.', 5000);
	};
}

/* ============================================================ Layers */

const CAT_LABEL = { trees: '🌳 Trees', evergreens: '🌲 Evergreens', shrubs: '🌿 Shrubs', perennials: '🌸 Perennials', grasses: '🌾 Grasses', annuals: '🌼 Annuals', vines: '🍃 Vines', features: '⛲ Features, lighting & furniture' };

export function layersPanel(c) {
	const { ed } = c;
	const body = h('div', { class: 'ds-layers' });
	const close = () => { el.remove(); c.onClose && c.onClose(); };
	const el = h('aside', { class: 'ds-hist ds-layers-win', role: 'dialog', 'aria-label': 'Layers' },
		h('div', { class: 'ds-hist-head' }, h('b', null, icon('layers', 18), ' Layers'), h('button', { class: 'ds-icon-btn', 'aria-label': 'Close layers', onclick: close }, icon('close', 18))),
		h('p', { class: 'ds-hint' }, 'Everything in this view. Show/hide, lock, rename, reorder or remove — tap a name to select it.'),
		body);
	const eye = (on, fn, label) => h('button', { class: 'ds-icon-btn ds-lay-eye' + (on ? '' : ' off'), 'aria-label': (on ? 'Hide ' : 'Show ') + label, title: on ? 'Hide' : 'Show', onclick: (e) => { e.stopPropagation(); fn(); refresh(); } }, icon('eye', 16));
	const refresh = () => {
		body.innerHTML = '';
		const v = ed.view;
		// photo
		const photo = h('div', { class: 'ds-lay-grp' }, h('div', { class: 'ds-lay-h' }, h('b', null, '📷 Photo')));
		const peekBtn = h('button', { class: 'ds-btn ds-ghost ds-sm' }, icon('eye', 16), ' Hold for original');
		peekBtn.addEventListener('pointerdown', () => c.peek(true));
		for (const evn of ['pointerup', 'pointerleave', 'pointercancel']) peekBtn.addEventListener(evn, () => c.peek(false));
		put(photo, h('div', { class: 'ds-lay-row' }, h('span', { class: 'ds-grow' }, 'Original photo'), peekBtn));
		if (v.adj && Object.keys(v.adj).length) put(photo, h('div', { class: 'ds-lay-row' }, h('span', { class: 'ds-grow' }, 'Light & color adjustments'), h('button', { class: 'ds-link', onclick: () => { ed.setAdjust({}, true, v.adj); refresh(); } }, 'Remove')));
		if (v.edited) put(photo, h('div', { class: 'ds-lay-row' }, h('span', { class: 'ds-grow' }, '✨ AI & eraser changes to the photo'), h('button', { class: 'ds-link', onclick: () => { c.setTool('paint'); ed.opts.paint.restore = true; c.renderPanel(); c.toast('Brush over anything to bring back the original photo there.'); } }, 'Restore brush')));
		body.append(photo);
		// ground
		const ops = v.ops.slice().reverse();
		const grnd = h('div', { class: 'ds-lay-grp' }, h('div', { class: 'ds-lay-h' }, h('b', null, `🟫 Ground shapes (${ops.length})`), ops.length ? eye(!ops.every((o) => o.hidden), () => { const hide = !ops.every((o) => o.hidden); for (const o of ops) o.hidden = hide; ed.rebuildGround(); ed.changed(); }, 'all ground shapes') : null));
		for (const op of ops) {
			const nm = op.name || (op.label ? op.label.replace(/^(Drew|Built|Added|Copied|Painted|Filled the selection with) an? ?/, '') : opName(op));
			put(grnd, h('div', { class: 'ds-lay-row' + (ed.selOp === op ? ' on' : '') + (op.hidden ? ' hid' : '') },
				eye(!op.hidden, () => ed.updateOp(op, { hidden: !op.hidden }, op.hidden ? 'Showed a shape' : 'Hid a shape'), nm),
				h('button', { class: 'ds-grow ds-lay-name', disabled: op.t === 'brush' || op.t === 'mask', onclick: () => { c.setTool('select'); ed.selectOp(op); refresh(); } }, nm.charAt(0).toUpperCase() + nm.slice(1)),
				h('button', { class: 'ds-icon-btn', title: op.lock ? 'Unlock' : 'Lock', 'aria-label': op.lock ? 'Unlock' : 'Lock', onclick: () => { ed.updateOp(op, { lock: !op.lock }, op.lock ? 'Unlocked a shape' : 'Locked a shape'); refresh(); } }, op.lock ? '🔒' : '🔓'),
				h('button', { class: 'ds-icon-btn', title: 'Rename', 'aria-label': 'Rename', onclick: () => { const t = prompt('Name this layer', nm); if (t) { ed.updateOp(op, { name: t.slice(0, 40) }, 'Renamed a shape'); refresh(); } } }, icon('edit', 14)),
				h('button', { class: 'ds-icon-btn', title: 'Move up', 'aria-label': 'Move up', onclick: () => { ed.moveOp(op, 1); refresh(); } }, '↑'),
				h('button', { class: 'ds-icon-btn', title: 'Move down', 'aria-label': 'Move down', onclick: () => { ed.moveOp(op, -1); refresh(); } }, '↓'),
				op.t !== 'mask' ? h('button', { class: 'ds-icon-btn', title: 'Duplicate', 'aria-label': 'Duplicate', onclick: () => { ed.duplicateOp(op); refresh(); } }, icon('copy', 14)) : null,
				h('button', { class: 'ds-icon-btn', title: 'Remove', 'aria-label': 'Remove', onclick: () => { ed.deleteOp(op); refresh(); } }, icon('trash', 14))));
		}
		if (!ops.length) put(grnd, h('p', { class: 'ds-muted ds-sm-text' }, 'No beds, patios or paint yet.'));
		body.append(grnd);
		// objects by category
		const objs = ed.sortedObjects(true).reverse();
		const cats = {};
		for (const o of objs) { const it = c.byId[o.item]; const k = it.cat || 'features'; (cats[k] = cats[k] || []).push(o); }
		for (const [k, list] of Object.entries(cats)) {
			const grp = h('div', { class: 'ds-lay-grp' }, h('div', { class: 'ds-lay-h' }, h('b', null, `${CAT_LABEL[k] || k} (${list.length})`), eye(!list.every((o) => o.hidden), () => { const hide = !list.every((o) => o.hidden); for (const o of list) o.hidden = hide; if (hide && list.includes(ed.sel)) ed.select(null); ed.changed(); }, 'group')));
			for (const o of list) {
				const it = c.byId[o.item];
				put(grp, h('div', { class: 'ds-lay-row' + (ed.sel === o ? ' on' : '') + (o.hidden ? ' hid' : '') },
					eye(!o.hidden, () => { ed.updateSelected({ hidden: !o.hidden }, o); if (o.hidden && ed.sel === o) ed.select(null); }, o.name || it.name),
					h('img', { class: 'ds-lay-th', src: c.thumbFor(it), alt: '' }),
					h('button', { class: 'ds-grow ds-lay-name', onclick: () => { if (o.hidden) ed.updateSelected({ hidden: false }, o); if (o.lock) ed.updateSelected({ lock: false }, o); c.setTool('select'); ed.select(o); refresh(); } }, o.name || it.name),
					h('button', { class: 'ds-icon-btn', title: o.lock ? 'Unlock' : 'Lock', 'aria-label': o.lock ? 'Unlock' : 'Lock', onclick: () => { ed.updateSelected({ lock: !o.lock }, o); if (ed.sel === o) ed.select(null); refresh(); } }, o.lock ? '🔒' : '🔓'),
					h('button', { class: 'ds-icon-btn', title: 'Bring forward', 'aria-label': 'Bring forward', onclick: () => { ed.orderSelected('forward', o); refresh(); } }, '↑'),
					h('button', { class: 'ds-icon-btn', title: 'Send backward', 'aria-label': 'Send backward', onclick: () => { ed.orderSelected('backward', o); refresh(); } }, '↓'),
					h('button', { class: 'ds-icon-btn', title: 'Remove', 'aria-label': 'Remove', onclick: () => { ed.select(o); ed.deleteSelected(); refresh(); } }, icon('trash', 14))));
			}
			body.append(grp);
		}
		// measurements
		const meas = v.meas || [];
		if (meas.length) {
			body.append(h('div', { class: 'ds-lay-grp' }, h('div', { class: 'ds-lay-h' }, h('b', null, `📏 Measurements & zones (${meas.length})`), eye(!!ed.showMeas, () => { ed.showMeas = !ed.showMeas; ed.render(); }, 'measurements')),
				...meas.map((m) => h('div', { class: 'ds-lay-row' }, h('span', { class: 'ds-grow' }, (m.label || (m.t === 'zone' ? ZONES[m.kind][0] : m.t === 'area' ? 'Area' : 'Distance')) + ': ' + ed.measText(m)), h('button', { class: 'ds-icon-btn', 'aria-label': 'Remove', onclick: () => { ed.removeMeasure(m); refresh(); } }, icon('trash', 14))))));
		}
	};
	refresh();
	return { el, refresh, close };
}

/* ============================================================ Versions */

/** Snapshot of the current view: design data + its own copy of the photo and a picture. */
async function snapshot(c, name) {
	const ed = c.ed, v = ed.view;
	const data = JSON.parse(JSON.stringify({ objects: v.objects, ops: v.ops, adj: v.adj || {}, meas: v.meas || [], cam: v.cam || null }, (k, val) => (k[0] === '_' ? undefined : val)));
	const photo = await c.store.putBlob(await canvasToBlob(ed.baseCanvas(), 'image/jpeg', 0.93));
	const pic = await c.store.putBlob(await canvasToBlob(ed.composite(1600), 'image/jpeg', 0.88));
	const p = c.project();
	return { id: uid(), name, at: Date.now(), viewId: v.id, viewLabel: v.label, season: p.season, years: p.years, night: !!p.night, data, photo, pic, thumb: ed.composite(320).toDataURL('image/jpeg', 0.7) };
}

export async function openVersions(c) {
	const p = c.project();
	p.versions = p.versions || [];
	const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
	const list = h('div', { class: 'ds-versions' });
	const notes = h('textarea', { rows: 3, placeholder: 'Notes about this Dreamscape — what you like, questions for the landscaper…' }, p.notes || '');
	notes.addEventListener('input', () => { p.notes = notes.value.slice(0, 4000); c.saveSoon(); });
	const draw = () => {
		list.innerHTML = '';
		if (!p.versions.length) list.append(h('p', { class: 'ds-muted' }, 'No saved versions yet. Save one now, try changes, and come back to it any time.'));
		for (const ver of p.versions.slice().reverse()) {
			list.append(h('div', { class: 'ds-ver-card' },
				h('img', { src: ver.thumb, alt: '' }),
				h('div', { class: 'ds-grow' }, h('b', null, ver.name), h('small', null, `${ver.viewLabel || 'View'} · ${new Date(ver.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`)),
				h('div', { class: 'ds-row ds-wrap' },
					h('button', { class: 'ds-btn ds-sm', onclick: async () => { m.remove(); await c.restoreVersion(ver); } }, 'Restore'),
					h('button', { class: 'ds-icon-btn', title: 'Rename', 'aria-label': 'Rename', onclick: () => { const t = prompt('Version name', ver.name); if (t) { ver.name = t.slice(0, 50); c.saveSoon(); draw(); } } }, icon('edit', 16)),
					h('button', { class: 'ds-icon-btn', title: 'Duplicate', 'aria-label': 'Duplicate', onclick: () => { p.versions.push({ ...JSON.parse(JSON.stringify(ver)), id: uid(), name: ver.name + ' (copy)', at: Date.now() }); c.saveSoon(); draw(); } }, icon('copy', 16)),
					h('button', { class: 'ds-icon-btn', title: 'Delete', 'aria-label': 'Delete', onclick: () => { if (!confirm(`Delete “${ver.name}”?`)) return; p.versions.splice(p.versions.indexOf(ver), 1); c.saveSoon(); draw(); } }, icon('trash', 16)))));
		}
	};
	const saveBtn = h('button', { class: 'ds-btn' }, icon('plus', 18), ' Save this as a version');
	saveBtn.onclick = async () => {
		const name = prompt('Name this version', `Version ${p.versions.length + 1}`);
		if (!name) return;
		saveBtn.disabled = true;
		p.versions.push(await snapshot(c, name.slice(0, 50)));
		c.saveSoon();
		saveBtn.disabled = false;
		draw();
		c.toast('Version saved.');
	};
	const m = modal(c.root, 'Design versions', [
		h('p', { class: 'ds-hint' }, 'Save versions of this design to compare ideas — “Version A: boxwoods”, “Version B: hydrangeas”. Restoring is undoable.'),
		h('div', { class: 'ds-row ds-wrap' }, saveBtn, h('button', { class: 'ds-btn ds-ghost', onclick: () => { m.remove(); compareDialog(c); } }, icon('compare', 18), ' Compare'), h('button', { class: 'ds-btn ds-ghost', onclick: () => { m.remove(); presentation(c); } }, icon('eye', 18), ' Present')),
		list, h('h4', null, 'Notes'), notes], close, 'ds-modal-wide');
	draw();
}

/** Restore a saved version into the current view (one undo step). */
export async function restoreVersionInto(c, ver) {
	const ed = c.ed, v = ed.view, p = c.project();
	const before = JSON.parse(JSON.stringify({ objects: v.objects, ops: v.ops, adj: v.adj || {}, meas: v.meas || [] }, (k, val) => (k[0] === '_' ? undefined : val)));
	const after = JSON.parse(JSON.stringify(ver.data));
	const s0 = { season: p.season, years: p.years, night: p.night }, s1 = { season: ver.season || p.season, years: ver.years || 0, night: !!ver.night };
	const set = (d, s) => { v.objects = JSON.parse(JSON.stringify(d.objects)); v.ops = JSON.parse(JSON.stringify(d.ops)); v.adj = { ...(d.adj || {}) }; v.meas = JSON.parse(JSON.stringify(d.meas || [])); Object.assign(p, s); ed.select(null); ed.selectOp(null); ed.rebuildGround(); ed._invalidateAdj(); c.sceneChanged(); };
	set(after, s1);
	ed._push({ label: `Restored “${ver.name}”`, icon: 'history', undo: () => set(before, s0), redo: () => set(after, s1) }, false);
	const b = ver.photo && await c.store.getBlob(ver.photo);
	if (b) ed.applyImage(await blobToBitmap(b), `Restored the photo of “${ver.name}”`);
	ed.changed();
	c.toast(`Restored “${ver.name}”. Press Undo to go back.`, 4500);
}

/** Pictures that can be compared: original, current design, every saved version, every other view. */
async function pictures(c) {
	const ed = c.ed, p = c.project();
	const out = [{ id: 'orig', name: 'Original photo', get: async () => c.originalPhoto() }, { id: 'cur', name: 'Current design', get: async () => ed.composite(1600) }];
	for (const ver of p.versions || []) out.push({ id: ver.id, name: ver.name, get: async () => { const b = await c.store.getBlob(ver.pic); return b ? blobToBitmap(b) : null; } });
	return out;
}

export async function compareDialog(c) {
	const pics = await pictures(c);
	let a = pics[0].id, b = pics[1].id, mode = 'slider';
	const stage = h('div', { class: 'ds-cmpdlg' });
	const pick = (val, on) => h('select', { onchange: (e) => { on(e.target.value); draw(); } }, ...pics.map((x) => h('option', { value: x.id, selected: x.id === val }, x.name)));
	const draw = async () => {
		stage.innerHTML = '';
		const A = await pics.find((x) => x.id === a).get(), B = await pics.find((x) => x.id === b).get();
		const src = (img) => (img ? (img.toDataURL ? img.toDataURL('image/jpeg', 0.9) : toUrl(img)) : '');
		if (mode === 'side') { stage.append(h('div', { class: 'ds-side' }, h('figure', null, h('img', { src: src(A), alt: '' }), h('figcaption', null, pics.find((x) => x.id === a).name)), h('figure', null, h('img', { src: src(B), alt: '' }), h('figcaption', null, pics.find((x) => x.id === b).name)))); return; }
		stage.append(beforeAfter(src(A), src(B), pics.find((x) => x.id === a).name, pics.find((x) => x.id === b).name));
	};
	const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
	const m = modal(c.root, 'Compare designs', [
		h('div', { class: 'ds-row ds-wrap' }, pick(a, (v) => (a = v)), h('b', null, 'vs'), pick(b, (v) => (b = v)),
			c.seg([['slider', 'Slider'], ['side', 'Side by side']], mode, (k) => { mode = k; draw(); })),
		stage], close, 'ds-modal-wide ds-modal-xl');
	draw();
}
function toUrl(img) { const cv = canvas(img.width, img.height); cv.getContext('2d').drawImage(img, 0, 0); return cv.toDataURL('image/jpeg', 0.9); }

/** Draggable before/after comparison. */
export function beforeAfter(beforeSrc, afterSrc, lb = 'Before', la = 'After') {
	const box = h('div', { class: 'ds-cmp' });
	const after = h('img', { src: afterSrc, alt: la, class: 'ds-cmp-after', draggable: false });
	const knob = h('div', { class: 'ds-cmp-knob', role: 'slider', tabindex: 0, 'aria-label': 'Compare', 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('span', null, icon('compare', 18)));
	box.append(h('img', { src: beforeSrc, alt: lb, draggable: false }), after, knob, h('span', { class: 'ds-cmp-tag l' }, lb), h('span', { class: 'ds-cmp-tag r' }, la));
	let f = 0.5, drag = false;
	const set = (v) => { f = Math.max(0, Math.min(1, v)); after.style.clipPath = `inset(0 0 0 ${f * 100}%)`; knob.style.left = f * 100 + '%'; knob.setAttribute('aria-valuenow', Math.round(f * 100)); };
	const mv = (e) => { const r = box.getBoundingClientRect(); set((e.clientX - r.left) / r.width); };
	box.addEventListener('pointerdown', (e) => { drag = true; box.setPointerCapture(e.pointerId); mv(e); });
	box.addEventListener('pointermove', (e) => { if (drag) mv(e); });
	box.addEventListener('pointerup', () => { drag = false; });
	knob.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') set(f - 0.05); if (e.key === 'ArrowRight') set(f + 0.05); });
	set(0.5);
	return box;
}

/* ============================================================ Presentation */

export async function presentation(c) {
	const p = c.project();
	const pics = await pictures(c);
	const slides = [{ name: 'Before & after', before: await c.originalPhoto(), after: c.ed.composite(0) }, ...(await Promise.all(pics.slice(2).map(async (x) => ({ name: x.name, after: await x.get() }))))];
	let i = 0;
	const url = (img) => (img ? (img.toDataURL ? img.toDataURL('image/jpeg', 0.92) : toUrl(img)) : '');
	const stage = h('div', { class: 'ds-pres-stage' });
	const cap = h('div', { class: 'ds-pres-cap' });
	const fav = h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => { p.fav = !p.fav; c.saveSoon(); fav.textContent = p.fav ? '★ Favorite' : '☆ Favorite'; } }, p.fav ? '★ Favorite' : '☆ Favorite');
	const draw = () => {
		const s = slides[i];
		stage.innerHTML = '';
		stage.append(s.before ? beforeAfter(url(s.before), url(s.after)) : h('img', { src: url(s.after), alt: s.name }));
		cap.innerHTML = '';
		put(cap, h('b', null, `${p.name}`), h('span', null, ` · ${s.name}`), slides.length > 1 ? h('small', null, `  ${i + 1} / ${slides.length}`) : null);
	};
	const el = h('div', { class: 'ds-pres', role: 'dialog', 'aria-label': 'Presentation' },
		stage,
		h('div', { class: 'ds-pres-bar' },
			slides.length > 1 ? h('button', { class: 'ds-icon-btn', 'aria-label': 'Previous', onclick: () => { i = (i - 1 + slides.length) % slides.length; draw(); } }, '‹') : null,
			cap,
			slides.length > 1 ? h('button', { class: 'ds-icon-btn', 'aria-label': 'Next', onclick: () => { i = (i + 1) % slides.length; draw(); } }, '›') : null,
			h('div', { class: 'ds-spacer' }),
			fav,
			c.download ? h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => c.download() }, icon('download', 16), ' Download') : null,
			c.share ? h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => c.share() }, icon('share', 16), ' Share') : null,
			h('button', { class: 'ds-btn ds-sm', onclick: () => exit() }, 'Exit')),
		p.notes ? h('div', { class: 'ds-pres-notes' }, p.notes) : null);
	const key = (e) => { if (e.key === 'Escape') exit(); if (e.key === 'ArrowRight') { i = (i + 1) % slides.length; draw(); } if (e.key === 'ArrowLeft') { i = (i - 1 + slides.length) % slides.length; draw(); } };
	const exit = () => { window.removeEventListener('keydown', key, true); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); el.remove(); };
	window.addEventListener('keydown', key, true);
	c.root.append(el);
	draw();
	if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
}

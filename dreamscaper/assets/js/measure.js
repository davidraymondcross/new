/* DreamScaper – Measure Property Features (Contractor Hub).
 *
 * A guided measuring tool on a real map: find the property (address search or a customer), then move
 * and zoom the aerial map freely — it keeps loading imagery as you go, so there's never blank space.
 * Tap around the edge of a lawn, roof, bed, driveway or the whole lot; tap the big "Start" dot to close
 * the shape; name it, then "Save & measure another area" or "Save & finish". Areas add up to a running
 * total. Roofs can take a pitch so you get the real roof surface and roofing squares.
 *
 * Finish gives four clear choices: create a new contact, attach to an existing contact (both keep a
 * one-page report picture — map, highlighted areas, sizes, total — on the customer page), save the
 * report to this device, or print it on one page.
 *
 * Imagery: to-scale aerial photos (Connecticut 3-inch state imagery; USGS NAIP elsewhere, or the
 * provider set in Settings) served as map tiles by this site — they may legally be traced and kept.
 * "Open in Google Maps" shows the same spot in Google for reference.
 */
import { h, put, icon, stateSelect } from './util.js?v=2.7.7';
import { api, apiBase } from './api.js?v=2.7.7';
import { modal } from './capture.js?v=2.7.7';
import { addressField, addressGroup, addressDetails, parseAddress } from './address.js?v=2.7.7';
import { fmtArea, fmtFtIn } from './takeoff.js?v=2.7.7';
import { sectionHead, tip } from './explain.js?v=2.7.7';
import { streetMap } from './map.js?v=2.7.7';
import { addressProblem } from './planwiz.js?v=2.7.7';

let M = null;
export function initMeasure(ctx) { M = { ctx }; }
const toast = (m, ms) => M && M.ctx.toast(m, ms);
const card = (title, ...kids) => h('section', { class: 'ds-hub-card' }, title ? h('h2', null, title) : null, ...kids);
// a <label> forwards clicks to its first control, so groups of buttons (chips) get a plain <div>
const field = (label, el, hint) => h(el && el.querySelector && el.querySelector('button') ? 'div' : 'label', { class: 'ds-field' }, h('span', null, label), el, hint ? h('small', { class: 'ds-hint' }, hint) : null);
export const KINDS = [['lawn', '🌱 Lawn / grass', '#51cf66'], ['roof', '🏠 Roof', '#ff922b'], ['bed', '🪴 Planting bed', '#c48a4f'], ['hardscape', '🧱 Patio / walkway', '#e8b07b'], ['driveway', '🚗 Driveway', '#adb5bd'], ['lot', '📐 Whole property', '#ff6b6b'], ['other', '✏️ Other', '#4dabf7']];
const kindOf = (k) => KINDS.find((x) => x[0] === k) || KINDS[KINDS.length - 1];
export const PITCHES = [[0, 'Flat / not a roof'], [3, '3/12 (low)'], [4, '4/12'], [5, '5/12'], [6, '6/12 (common)'], [7, '7/12'], [8, '8/12'], [9, '9/12'], [10, '10/12'], [12, '12/12 (steep)']];
/** Roof surface from its footprint (seen from above) and pitch (rise per 12 in. run). */
export const roofSurface = (footprint, pitch) => (pitch ? footprint * Math.sqrt(1 + (pitch / 12) ** 2) : footprint);
export const sizeOf = (s) => roofSurface(s.sqft, s.pitch || 0);
export const totalOf = (secs) => secs.reduce((t, s) => t + sizeOf(s), 0);

/* ---- geometry on lat/lng points: a local flat projection in feet (accurate over a property) ---- */
const FT_PER_DEG = 364000;
/** [lat, lng] points → [x, y] feet around the first point (x east, y south). */
export function toFeet(pts) {
	if (!pts.length) return [];
	const lat0 = pts[0][0], lng0 = pts[0][1], k = Math.cos((lat0 * Math.PI) / 180);
	return pts.map((p) => [(p[1] - lng0) * FT_PER_DEG * k, (lat0 - p[0]) * FT_PER_DEG]);
}
export function areaFt(pts) {
	const f = toFeet(pts);
	let a = 0;
	for (let i = 0; i < f.length; i++) { const p = f[i], q = f[(i + 1) % f.length]; a += p[0] * q[1] - q[0] * p[1]; }
	return Math.abs(a) / 2;
}
export function perimeterFt(pts) {
	const f = toFeet(pts);
	let t = 0;
	for (let i = 0; i < f.length; i++) { const p = f[i], q = f[(i + 1) % f.length]; t += Math.hypot(q[0] - p[0], q[1] - p[1]); }
	return t;
}
const centerOf = (pts) => [pts.reduce((t, p) => t + p[0], 0) / pts.length, pts.reduce((t, p) => t + p[1], 0) / pts.length];
const steps = ['Find the property', 'Measure', 'Save or print'];
const START_R = 16;

/**
 * Contractor Hub → Measure. view: { client_id, prop_id, visit_id, address } (any of them pre-fill the wizard).
 */
export async function viewMeasure(b, view, go) {
	M.go = go;
	const st = { step: 0, address: view.address || '', lat: 0, lng: 0, client: null, prop: null, visit_id: view.visit_id || 0, info: null, sections: [], draft: [], view: null, note: '', saved: null };
	const head = h('ol', { class: 'ds-wiz-steps' });
	const body = h('div', { class: 'ds-ms' });
	put(b, sectionHead('measure'), head, body);
	const drawHead = () => { head.innerHTML = ''; steps.forEach((t, i) => head.append(h('li', { class: i === st.step ? 'on' : i < st.step ? 'done' : '' }, h('b', null, i < st.step ? '✓' : String(i + 1)), h('span', null, t)))); };
	// coming from a customer or a calendar job: fill the customer and address in
	if (view.client_id) {
		try {
			const c = await api('crm/client', { query: { id: view.client_id } });
			st.client = c;
			st.prop = (c.properties || []).find((p) => p.id === view.prop_id) || (c.properties || [])[0] || null;
			if (st.prop) Object.assign(st, { address: st.prop.address, lat: +st.prop.lat || 0, lng: +st.prop.lng || 0 });
			else if (c.address) st.address = [c.address, c.town, c.state, c.zip].filter(Boolean).join(', ');
		} catch (e) { toast(e.message); }
	}
	const show = (i) => {
		if (st.cleanup) { st.cleanup(); st.cleanup = null; }
		st.step = i;
		drawHead();
		body.innerHTML = '';
		[stepFind, stepMeasure, stepSave][i](st, body, show);
		if (i) head.scrollIntoView({ block: 'nearest' });
	};
	show(st.address ? 1 : 0);
}

/* ------------------------------------------------------------ 1. find */

function stepFind(st, body, show) {
	const addr = h('input', { type: 'text', placeholder: '123 Main Street, Town, ST', autocomplete: 'street-address', value: st.address, 'aria-label': 'Property address' });
	let picked = st.lat ? st.address : '';
	const af = addressField(addr, { onPick: (it) => { addr.value = it.label; picked = it.label; st.lat = it.lat || 0; st.lng = it.lng || 0; } });
	const q = h('input', { type: 'search', placeholder: 'Search your customers', 'aria-label': 'Search customers' });
	const list = h('div', { class: 'ds-hub-list' });
	const go = h('button', { class: 'ds-btn ds-wide' }, 'Show the property →');
	put(body,
		tip('measure', 'Find the property, tap around the edge of each area on the map, then save it to a contact, to this device, or print it.'),
		card('Which property?',
			field('Property address', af, 'Start typing and pick the address from the list.'),
			st.client ? h('p', { class: 'ds-pw-okline' }, `✓ For ${st.client.name}`) : null, go),
		st.client ? null : card('…or pick one of your customers', q, list));
	addr.addEventListener('keydown', (e) => { if (e.key === 'Enter') go.click(); });
	go.onclick = () => {
		const v = addr.value.trim();
		const prob = addressProblem(v);
		if (prob) return toast(prob, 6000);
		if (v !== picked) { st.lat = 0; st.lng = 0; } // typed by hand: look the address up again
		st.address = v;
		show(1);
	};
	const search = async () => {
		try {
			const r = await api('crm/clients', { query: { q: q.value } });
			list.innerHTML = '';
			for (const c of r.items.slice(0, 6)) list.append(h('button', { class: 'ds-hub-row', onclick: async () => {
				try {
					const full = await api('crm/client', { query: { id: c.id } });
					st.client = full;
					st.prop = (full.properties || [])[0] || null;
					if (st.prop) Object.assign(st, { address: st.prop.address, lat: +st.prop.lat || 0, lng: +st.prop.lng || 0 });
					else if (full.address) Object.assign(st, { address: [full.address, full.town, full.state, full.zip].filter(Boolean).join(', '), lat: 0, lng: 0 });
					show(st.address ? 1 : 0);
				} catch (e) { toast(e.message); }
			} }, h('b', null, c.name), h('small', null, [c.address, c.town].filter(Boolean).join(', '))));
			if (!r.items.length) list.append(h('p', { class: 'ds-muted' }, q.value ? 'No match.' : 'No customers yet.'));
		} catch (e) { list.innerHTML = ''; }
	};
	let t = 0;
	q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(search, 250); });
	if (!st.client) search();
	if (!st.address) setTimeout(() => addr.focus(), 50);
}

/* ------------------------------------------------------------ 2. measure */

function stepMeasure(st, body, show) {
	const status = h('p', { class: 'ds-ms-status', 'aria-live': 'polite' }, 'Finding the property…');
	const mapBox = h('div', { class: 'ds-ms-map' });
	const live = h('p', { class: 'ds-ms-live', 'aria-live': 'polite' });
	const list = h('div', { class: 'ds-ms-list' });
	const jump = h('input', { type: 'text', placeholder: 'Go to another address', 'aria-label': 'Go to another address' });
	const gmaps = h('a', { class: 'ds-btn ds-ghost ds-sm', target: '_blank', rel: 'noopener', href: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(st.address) }, '🗺️ Google Maps');
	const jf = addressField(jump, { onPick: async (it) => {
		const d = it.lat ? it : await addressDetails(it.label, it);
		if (!d.lat || !map) return toast('Couldn’t find that address on the map.');
		map.setView([d.lat, d.lng], 19.5);
		st.address = it.label; st.lat = d.lat; st.lng = d.lng; st.rep = null;
		addrLine.textContent = it.label;
		gmaps.href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(it.label);
		jump.value = ''; jump.blur();
	} });
	const addrLine = h('b', null, st.address);
	const how = h('div', { class: 'ds-ms-how', hidden: !!st.sections.length },
		h('b', null, 'How to measure'),
		h('ol', null,
			h('li', null, 'Drag to move the map; pinch, scroll or ＋/－ to zoom.'),
			h('li', null, 'Tap each corner around the edge of the area.'),
			h('li', null, 'Tap the yellow “Start” dot to close it, then name it.')),
		h('button', { class: 'ds-btn ds-sm', onclick: () => { how.hidden = true; } }, 'Got it'));
	const helpB = h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => { how.hidden = !how.hidden; } }, '❓ How to');
	const undoB = h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => { st.draft.pop(); changed(); } }, '↶ Undo');
	const clearB = h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => { st.draft = []; changed(); } }, '✕ Clear shape');
	const closeB = h('button', { class: 'ds-btn ds-sm', hidden: true, onclick: () => closeShape() }, '⬤ Close shape');
	const finishB = h('button', { class: 'ds-btn ds-sm', onclick: () => finish() }, '✓ Finish');
	const bar = h('div', { class: 'ds-ms-bar' }, live, h('div', { class: 'ds-ms-btns' }, undoB, clearB, closeB, finishB));
	const wrap = h('div', { class: 'ds-ms-mapwrap' }, mapBox, how, bar);
	put(body,
		h('div', { class: 'ds-ms-top' }, h('p', { class: 'ds-ms-addr' }, '📍 ', addrLine, st.client ? h('span', { class: 'ds-muted' }, ` · ${st.client.name}`) : null), h('div', { class: 'ds-ms-jump' }, jf, gmaps, helpB)),
		status, wrap, list);
	let map = null;
	const draw = (x, mp) => {
		const P = (p) => mp.project(p[0], p[1]);
		x.lineJoin = 'round';
		for (const s of st.sections) {
			const col = kindOf(s.kind)[2];
			x.beginPath(); s.pts.forEach((p, i) => { const q = P(p); i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1]); }); x.closePath();
			x.fillStyle = col + '55'; x.fill(); x.strokeStyle = col; x.lineWidth = 3; x.stroke();
			const c = P(centerOf(s.pts));
			label(x, [s.name, fmtArea(sizeOf(s))], c[0], c[1], 14);
		}
		const d = st.draft;
		if (d.length) {
			x.beginPath(); d.forEach((p, i) => { const q = P(p); i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1]); });
			x.setLineDash([8, 6]); x.strokeStyle = '#ffd43b'; x.lineWidth = 3; x.stroke(); x.setLineDash([]);
			d.forEach((p, i) => { if (!i) return; const q = P(p); x.beginPath(); x.arc(q[0], q[1], 5, 0, 7); x.fillStyle = '#fff'; x.fill(); x.strokeStyle = '#111'; x.lineWidth = 1.5; x.stroke(); });
			const s0 = P(d[0]), ready = d.length >= 3;
			x.beginPath(); x.arc(s0[0], s0[1], START_R, 0, 7); x.fillStyle = ready ? '#ffd43b' : 'rgba(255,255,255,.9)'; x.fill(); x.strokeStyle = '#111'; x.lineWidth = 2; x.stroke();
			label(x, [ready ? 'Start — tap to close' : 'Start'], s0[0], s0[1] - START_R - 12, 13);
		}
	};
	const onTap = (lat, lng, sx, sy) => {
		how.hidden = true;
		const d = st.draft;
		if (d.length >= 3) {
			const s0 = map.project(d[0][0], d[0][1]);
			if (Math.hypot(s0[0] - sx, s0[1] - sy) <= START_R + 12) return closeShape();
		}
		d.push([lat, lng]);
		changed();
	};
	const changed = () => {
		const d = st.draft;
		live.textContent = !d.length
			? (st.sections.length ? `${st.sections.length} area${st.sections.length > 1 ? 's' : ''} · ${fmtArea(totalOf(st.sections))}. Tap the map to measure another, or Finish.` : 'Tap the first corner of the area you want to measure.')
			: d.length < 3 ? `${d.length} point${d.length > 1 ? 's' : ''} — keep tapping around the edge.` : `About ${fmtArea(areaFt(d))} — tap the yellow Start dot (or “Close shape”) when you’re back at the beginning.`;
		undoB.disabled = clearB.disabled = !d.length;
		closeB.hidden = d.length < 3;
		if (map) map.redraw();
	};
	const closeShape = () => {
		const pts = st.draft.slice();
		if (pts.length < 3) return;
		const sq = areaFt(pts);
		if (sq < 4) { toast('That shape is too small — try again.'); st.draft = []; changed(); return; }
		nameIt(pts, sq);
	};
	const nameIt = (pts, sq) => {
		let kind = st.sections.length ? st.sections[st.sections.length - 1].kind : 'lawn';
		const nm = h('input', { type: 'text', value: defaultName(kind, st.sections), maxlength: 60 });
		const pitch = h('select', { 'aria-label': 'Roof pitch' }, ...PITCHES.map(([v, l]) => h('option', { value: v, selected: v === 6 }, l)));
		const pitchRow = field('Roof pitch (rise per 12 in.)', pitch, 'From above a roof looks smaller than it is — the pitch gives the real roof surface.');
		const chips = h('div', { class: 'ds-chips' });
		const drawChips = () => { chips.innerHTML = ''; for (const [k, l] of KINDS) chips.append(h('button', { type: 'button', class: 'ds-chip' + (k === kind ? ' on' : ''), onclick: () => { const auto = nm.value === defaultName(kind, st.sections); kind = k; if (auto) nm.value = defaultName(k, st.sections); pitchRow.hidden = k !== 'roof'; drawChips(); } }, l)); };
		drawChips();
		pitchRow.hidden = kind !== 'roof';
		const keep = () => {
			const s = { name: nm.value.trim() || defaultName(kind, st.sections), kind, sqft: sq, perim: perimeterFt(pts), pitch: kind === 'roof' ? +pitch.value : 0, pts };
			st.sections.push(s);
			st.draft = [];
			m.remove();
			drawList(); changed();
			return s;
		};
		const more = h('button', { class: 'ds-btn ds-wide' }, '➕ Save & measure another area');
		const done = h('button', { class: 'ds-btn ds-ghost ds-wide' }, '✓ Save & finish');
		const drop = h('button', { class: 'ds-link', onclick: () => { m.remove(); st.draft = []; changed(); } }, 'Discard this shape');
		const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Back to the map', onclick: () => { m.remove(); changed(); } }, icon('close'));
		const m = modal(M.ctx.root, `This area: ${fmtArea(sq)}`, [
			h('p', { class: 'ds-hint' }, `Perimeter ${fmtFtIn(perimeterFt(pts))}. Name it, then measure another area or finish.`),
			field('What is it?', chips), field('Name', nm), pitchRow,
			h('div', { class: 'ds-ms-next' }, more, done), drop], close, 'ds-modal-ms');
		more.onclick = () => { const s = keep(); toast(`${s.name}: ${fmtArea(sizeOf(s))} saved. Tap the first corner of the next area.`, 5000); };
		done.onclick = () => { keep(); show(2); };
	};
	const drawList = () => {
		list.innerHTML = '';
		if (!st.sections.length) return;
		put(list, card('Measured areas',
			h('div', { class: 'ds-hub-list' }, ...st.sections.map((s, i) => h('div', { class: 'ds-hub-row ds-ms-row' },
				h('span', { class: 'ds-ms-sw', style: `--c:${kindOf(s.kind)[2]}` }),
				h('span', { class: 'ds-grow' }, h('b', null, s.name), h('small', null, sizeLine(s))),
				h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => { const n = prompt('Rename', s.name); if (n) { s.name = n.slice(0, 60); drawList(); map && map.redraw(); } } }, 'Rename'),
				h('button', { class: 'ds-icon-btn', 'aria-label': 'Remove ' + s.name, onclick: () => { if (confirm(`Remove “${s.name}”?`)) { st.sections.splice(i, 1); drawList(); changed(); } } }, icon('close', 14))))),
			h('p', { class: 'ds-ms-total' }, 'Total: ', h('b', null, fmtArea(totalOf(st.sections))), st.sections.length > 1 ? ` (${st.sections.length} areas)` : '')));
	};
	const finish = () => {
		if (st.draft.length >= 3) return closeShape();
		if (st.draft.length && !confirm('The shape you’re drawing isn’t closed. Finish without it?')) return;
		if (!st.sections.length) return toast('Measure at least one area first: tap around its edge and close it on the Start dot.', 6000);
		st.draft = [];
		show(2);
	};
	const start = async () => {
		try {
			const q = st.lat ? { lat: st.lat, lng: st.lng } : { address: st.address };
			const info = await api('aerial/info', { query: q });
			st.info = info; st.lat = info.lat; st.lng = info.lng;
			const tiles = info.ok ? { url: info.tiles, attr: info.source, max: info.max || 21 } : null;
			status.textContent = info.ok ? `${info.source}${info.res > 1 ? ` · about ${info.res} ft per pixel — fine for lawns, roofs and lots` : ' · sharp 3-inch detail'}.` : '⚠️ No aerial photos for this spot — showing a street map. Measurements still work but are less exact.';
			status.classList.toggle('warn', !info.ok);
			const v = st.view || { c: [st.lat, st.lng], z: 19.5 };
			map = streetMap(mapBox, { center: v.c, zoom: v.z, minZoom: 11, tiles: tiles || undefined, draw, onTap, noDblZoom: true });
			st.cleanup = () => { if (map) { st.view = { c: map.center, z: map.zoom }; map.destroy(); map = null; } };
			changed();
			requestAnimationFrame(() => wrap.scrollIntoView({ block: 'end' }));
		} catch (e) { status.textContent = e.message + ' Go back and check the address.'; status.classList.add('warn'); put(status, ' ', h('button', { class: 'ds-link', onclick: () => show(0) }, '← Change the address')); }
	};
	drawList();
	start();
}
function label(x, lines, cx, cy, size) {
	x.font = `600 ${size}px system-ui, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
	lines.forEach((t, i) => { const y = cy + (i - (lines.length - 1) / 2) * (size + 3); x.lineWidth = 4; x.strokeStyle = 'rgba(0,0,0,.8)'; x.strokeText(t, cx, y); x.fillStyle = '#fff'; x.fillText(t, cx, y); });
}
const sizeLine = (s) => (s.kind === 'roof' && s.pitch ? `${fmtArea(s.sqft)} footprint · ${s.pitch}/12 → ${fmtArea(sizeOf(s))} roof (${(sizeOf(s) / 100).toFixed(1)} squares)` : `${fmtArea(s.sqft)} · perimeter ${fmtFtIn(s.perim)}`);
function defaultName(kind, secs) {
	const base = { lawn: 'Lawn', roof: 'Roof', bed: 'Bed', hardscape: 'Patio', driveway: 'Driveway', lot: 'Whole property', other: 'Area' }[kind] || 'Area';
	const n = secs.filter((s) => s.kind === kind).length;
	return kind === 'lot' && !n ? base : `${base} ${n + 1}`;
}

/* ------------------------------------------------------------ 3. save or print */

function stepSave(st, body, show) {
	const total = totalOf(st.sections);
	const note = h('textarea', { rows: 2, placeholder: 'Notes (optional) — e.g. back lawn slopes; check the fence line on site' }, st.note);
	note.addEventListener('input', () => { st.note = note.value; st.rep = null; });
	const shot = h('div', { class: 'ds-ms-shotbox' }, h('p', { class: 'ds-muted' }, 'Making the report picture…'));
	const out = h('div', { class: 'ds-ms-out' });
	put(body,
		card(`📏 ${fmtArea(total)} measured`,
			h('p', { class: 'ds-ms-addr' }, st.address, st.client ? ` · ${st.client.name}` : ''),
			h('ul', { class: 'ds-ms-sum' }, ...st.sections.map((s) => h('li', null, h('span', { class: 'ds-ms-sw', style: `--c:${kindOf(s.kind)[2]}` }), h('b', null, s.name), ' ', h('span', null, fmtArea(sizeOf(s))), s.kind === 'roof' && s.pitch ? h('small', { class: 'ds-muted' }, ` (${(sizeOf(s) / 100).toFixed(1)} roofing squares)`) : null))),
			field('Notes for the report', note),
			h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => show(1) }, '← Back to the map')),
		out,
		card('Report preview', shot, h('p', { class: 'ds-hint' }, 'Measured from above: on slopes the real ground is a little larger, and trees can hide edges.')));
	const report = async () => { if (!st.rep) st.rep = await buildReport(st); return st.rep; };
	report().then((r) => { shot.innerHTML = ''; shot.append(h('img', { class: 'ds-ms-shot', src: r.url, alt: 'Report: the measured areas on the map with their sizes' })); }).catch(() => { shot.innerHTML = ''; });

	const choices = () => {
		out.innerHTML = '';
		const btn = (ic, t, sub, fn) => h('button', { type: 'button', class: 'ds-ms-choice', onclick: fn }, h('span', { class: 'ds-ms-ic', 'aria-hidden': 'true' }, ic), h('span', null, h('b', null, t), h('small', null, sub)));
		put(out, card('What would you like to do with it?',
			h('div', { class: 'ds-ms-choices' },
				btn('➕', 'Create a new contact', 'Add a new customer with this address and keep the measurements on their page.', newContact),
				btn('👤', 'Attach to existing contact', 'Pick one of your customers and keep the measurements on their page.', existing),
				btn('💾', 'Save to this device', 'Download the one-page report picture (map, areas and sizes).', saveLocal),
				btn('🖨️', 'Print', 'Print the map, every area and the total on one page.', printIt))));
	};
	const back = () => h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: choices }, '← Other choices');
	const saveLocal = async (e) => {
		const b = e && e.currentTarget; if (b) b.disabled = true;
		try { const r = await report(); download(r.url, fileName(st) + '.jpg'); toast('Saved the report to this device (Downloads).', 5000); }
		catch (er) { toast('Could not make the report: ' + er.message); }
		if (b) b.disabled = false;
	};
	const printIt = async (e) => {
		const b = e && e.currentTarget; if (b) b.disabled = true;
		try { await printReport(st, await report()); } catch (er) { toast(er.message, 6000); }
		if (b) b.disabled = false;
	};
	const newContact = async () => {
		out.innerHTML = '';
		const name = h('input', { type: 'text', autocomplete: 'name' }), phone = h('input', { type: 'tel', autocomplete: 'tel' }), email = h('input', { type: 'email', autocomplete: 'email' });
		const p = parseAddress(st.address);
		const street = h('input', { type: 'text', value: p.street }), town = h('input', { type: 'text', value: p.town }), zip = h('input', { type: 'text', inputmode: 'numeric', maxlength: 10, value: p.zip });
		const state = stateSelect(p.state, { 'aria-label': 'State' });
		const ag = addressGroup({ street, town, state, zip });
		const go = h('button', { class: 'ds-btn ds-wide' }, '✓ Create contact & attach measurements');
		put(out, card('➕ Create a new contact',
			h('ol', { class: 'ds-pw-todo' }, h('li', null, 'Type their name (phone or email help you reach them later).'), h('li', null, 'Check the address.'), h('li', null, 'Tap “Create contact & attach measurements”.')),
			field('Name', name), h('div', { class: 'ds-form-grid' }, field('Mobile', phone), field('Email', email)),
			field('Street address', ag), h('div', { class: 'ds-form-3' }, field('Town', town), field('State', state), field('ZIP', zip)),
			go, back()));
		setTimeout(() => name.focus(), 50);
		if (!p.zip || !p.state) addressDetails(st.address).then((d) => { if (!zip.value && d.zip) zip.value = d.zip; if (!state.value && d.state) state.value = d.state; if (!town.value && d.town) town.value = d.town; });
		go.onclick = () => {
			if (name.value.trim().length < 2) { toast('Type the contact’s name.'); name.focus(); return; }
			saveTo(go, { new_client: { name: name.value.trim(), phone: phone.value, email: email.value, street: street.value.trim(), town: town.value.trim(), state: state.value, zip: zip.value.trim() } }, name.value.trim());
		};
	};
	const existing = () => {
		out.innerHTML = '';
		const q = h('input', { type: 'search', placeholder: 'Type a name, phone, email or street', 'aria-label': 'Search customers' });
		const list = h('div', { class: 'ds-hub-list' });
		put(out, card('👤 Attach to existing contact', h('p', { class: 'ds-hint' }, 'Step 1 of 2 — choose the contact.'), q, list, back()));
		const search = async () => {
			try {
				const r = await api('crm/clients', { query: { q: q.value } });
				list.innerHTML = '';
				for (const c of r.items.slice(0, 10)) list.append(h('button', { class: 'ds-hub-row', onclick: () => confirmPick(c) }, h('b', null, c.name), h('small', null, [c.address, c.town].filter(Boolean).join(', ') || c.phone || c.email || '')));
				if (!r.items.length) list.append(h('div', { class: 'ds-muted' }, h('p', null, 'No match.'), h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: newContact }, '➕ Create a new contact instead')));
			} catch (e) { list.innerHTML = ''; toast(e.message); }
		};
		let t = 0;
		q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(search, 250); });
		search();
		setTimeout(() => q.focus(), 50);
	};
	const confirmPick = async (c) => {
		out.innerHTML = '';
		put(out, card(null, h('p', { class: 'ds-muted' }, 'Loading ' + c.name + '…')));
		let full = c;
		try { full = await api('crm/client', { query: { id: c.id } }); } catch (e) { /* use the summary */ }
		const props = full.properties || [];
		let prop = props.find((p) => sameAddr(p.address, st.address)) || null;
		const opts = h('div', { class: 'ds-ms-props' });
		const drawOpts = () => {
			opts.innerHTML = '';
			for (const p of props) opts.append(h('button', { type: 'button', class: 'ds-chip' + (prop && prop.id === p.id ? ' on' : ''), onclick: () => { prop = p; drawOpts(); } }, '🏠 ' + p.address));
			opts.append(h('button', { type: 'button', class: 'ds-chip' + (!prop ? ' on' : ''), onclick: () => { prop = null; drawOpts(); } }, '➕ New property: ' + st.address));
		};
		drawOpts();
		const go = h('button', { class: 'ds-btn ds-wide' }, `✓ Attach to ${full.name}`);
		out.innerHTML = '';
		put(out, card('👤 Attach to existing contact', h('p', { class: 'ds-hint' }, 'Step 2 of 2 — which of their properties is this?'),
			h('p', null, h('b', null, full.name), full.phone ? ` · ${full.phone}` : '', full.email ? ` · ${full.email}` : ''),
			field('Property', opts), go,
			h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: existing }, '← Choose a different contact')));
		go.onclick = () => saveTo(go, { client_id: full.id, prop_id: prop ? prop.id : 0 }, full.name);
	};
	const saveTo = async (btn, extra, name) => {
		btn.disabled = true;
		const old = btn.textContent;
		btn.textContent = 'Saving…';
		try {
			const r = await report();
			const res = await api('crm/measurement', { body: {
				...extra, address: st.address, lat: st.lat, lng: st.lng, visit_id: st.visit_id, image: r.url,
				source: st.info ? st.info.source : '', res: st.info ? st.info.res : 0, note: st.note, title: st.sections.map((s) => s.name).join(', '),
				sections: st.sections.map((s) => ({ name: s.name, kind: s.kind, sqft: s.sqft, perim: s.perim, pitch: s.pitch, pts: s.pts })) } });
			st.saved = res;
			toast('Measurement saved to ' + name + '.');
			doneCard(res, name);
		} catch (e) { toast(e.message, 6000); btn.disabled = false; btn.textContent = old; }
	};
	const doneCard = (r, name) => {
		out.innerHTML = '';
		put(out, card('✓ Saved to ' + name,
			h('p', null, 'The report picture, every area and the total are on their customer page under 📏 Measurements.'),
			h('div', { class: 'ds-ms-next' },
				h('button', { class: 'ds-btn', onclick: () => M.go({ v: 'customer', id: r.client_id, tab: 'measure' }) }, 'Open ' + name),
				h('button', { class: 'ds-btn ds-ghost', onclick: () => M.go({ v: 'quote', seed: { client_id: r.client_id, prop_id: r.prop_id } }) }, '🧾 Start a quote'),
				h('button', { class: 'ds-btn ds-ghost', onclick: printIt }, '🖨️ Print'),
				h('button', { class: 'ds-btn ds-ghost', onclick: () => M.go({ v: 'measure' }) }, '📏 Measure another property'))));
	};
	if (st.client && !st.saved) {
		// came from a customer (or a calendar job): it goes straight to them
		const b2 = h('button', { class: 'ds-btn ds-wide' }, `Save to ${st.client.name}`);
		put(out, card(null, b2, h('button', { class: 'ds-link', onclick: choices }, 'Other choices (new contact, save, print)')));
		b2.onclick = () => saveTo(b2, { client_id: st.client.id, prop_id: st.prop ? st.prop.id : 0 }, st.client.name);
		if (!st.autoSaved) { st.autoSaved = true; b2.click(); }
		return;
	}
	if (st.saved) return doneCard(st.saved, (st.client && st.client.name) || 'the contact');
	choices();
}
function sameAddr(a, b) {
	const n = (s) => String(s || '').toLowerCase().replace(/\bstreet\b/g, 'st').replace(/\bavenue\b/g, 'ave').replace(/\broad\b/g, 'rd').replace(/\bdrive\b/g, 'dr').replace(/\blane\b/g, 'ln').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').slice(0, 3).join(' ');
	return !!n(a) && n(a) === n(b);
}
const fileName = (st) => 'Measurements - ' + (st.address.split(',')[0] || 'property').replace(/[^\w\s-]/g, '').trim() + ' - ' + new Date().toISOString().slice(0, 10);
function download(url, name) {
	const a = document.createElement('a');
	a.href = url; a.download = name; a.rel = 'noopener';
	document.body.append(a); a.click(); a.remove();
}

/* ------------------------------------------------------------ the report picture */

const TS = 256;
const wpx = (lat, lng, z) => { const s = TS * 2 ** z, sin = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180); return [((lng + 180) / 360) * s, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s]; };
const loadImg = (src) => new Promise((ok) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ok(null); im.src = src; });

/**
 * The map around the measured areas (from the same tiles as the screen), each area filled, outlined
 * and labelled, with a scale bar and north arrow. Returns a canvas W×H.
 */
export async function mapImage(st, W, H) {
	const c = document.createElement('canvas');
	c.width = W; c.height = H;
	const x = c.getContext('2d');
	x.fillStyle = '#dfe6e0'; x.fillRect(0, 0, W, H);
	const pts = st.sections.flatMap((s) => s.pts);
	if (!pts.length) return c;
	const lats = pts.map((p) => p[0]), lngs = pts.map((p) => p[1]);
	const max = (st.info && st.info.ok && st.info.max) || 19;
	// the largest zoom where the measured areas (plus a margin) fit
	let z = max;
	for (; z > 12; z--) {
		const a = wpx(Math.max(...lats), Math.min(...lngs), z), b = wpx(Math.min(...lats), Math.max(...lngs), z);
		if ((b[0] - a[0]) * 1.35 <= W && (b[1] - a[1]) * 1.35 <= H) break;
	}
	const a = wpx(Math.max(...lats), Math.min(...lngs), z), b = wpx(Math.min(...lats), Math.max(...lngs), z);
	const left = (a[0] + b[0]) / 2 - W / 2, top = (a[1] + b[1]) / 2 - H / 2;
	const url = st.info && st.info.ok ? st.info.tiles : null;
	if (url) {
		const jobs = [];
		for (let ty = Math.floor(top / TS); ty <= Math.floor((top + H) / TS); ty++) {
			for (let tx = Math.floor(left / TS); tx <= Math.floor((left + W) / TS); tx++) {
				jobs.push(loadImg(url.replace('{z}', z).replace('{x}', tx).replace('{y}', ty)).then((im) => { if (im) x.drawImage(im, tx * TS - left, ty * TS - top, TS, TS); }));
			}
		}
		await Promise.race([Promise.all(jobs), new Promise((r) => setTimeout(r, 12000))]);
	}
	const P = (p) => { const q = wpx(p[0], p[1], z); return [q[0] - left, q[1] - top]; };
	x.lineJoin = 'round';
	for (const s of st.sections) {
		const col = kindOf(s.kind)[2];
		x.beginPath(); s.pts.forEach((p, i) => { const q = P(p); i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1]); }); x.closePath();
		x.fillStyle = col + '5e'; x.fill(); x.strokeStyle = col; x.lineWidth = 4; x.stroke();
	}
	for (const s of st.sections) { const q = P(centerOf(s.pts)); label(x, [s.name, fmtArea(sizeOf(s))], q[0], q[1], 20); }
	// scale bar + north
	const ftPerPx = (156543.03392 * Math.cos((lats[0] * Math.PI) / 180)) / 2 ** z * 3.28084 * (256 / TS);
	const ft = [10, 20, 25, 50, 100, 200, 500].find((f) => f / ftPerPx > 110) || 500, L = ft / ftPerPx, yb = H - 20;
	x.fillStyle = 'rgba(255,255,255,.92)'; x.fillRect(10, yb - 22, L + 76, 34);
	x.fillStyle = '#111'; x.fillRect(18, yb - 2, L, 6); x.font = '600 16px system-ui, sans-serif'; x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillText(ft + ' ft', 26 + L, yb + 1);
	x.fillStyle = 'rgba(255,255,255,.92)'; x.fillRect(W - 54, 10, 44, 52); x.fillStyle = '#111'; x.textAlign = 'center'; x.font = '700 18px system-ui, sans-serif'; x.fillText('N', W - 32, 26); x.fillText('↑', W - 32, 48);
	return c;
}

/**
 * The one-page report: header (address, customer, date, total), the map, a table of every area
 * (type, size, perimeter, roof pitch) with the total, notes and the imagery source. JPEG data URLs.
 */
export async function buildReport(st) {
	const W = 1400, MH = 900;
	const m = await mapImage(st, W - 60, MH);
	const rows = st.sections.length;
	const noteLines = wrap(st.note || '', 150).slice(0, 6);
	const H = 120 + MH + 40 + 46 + rows * 42 + 56 + (noteLines.length ? 30 + noteLines.length * 26 : 0) + 60;
	const c = document.createElement('canvas');
	c.width = W; c.height = H;
	const x = c.getContext('2d');
	x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
	x.fillStyle = '#1f5133'; x.fillRect(0, 0, W, 100);
	x.textBaseline = 'alphabetic'; x.textAlign = 'left';
	x.fillStyle = '#fff'; x.font = '700 34px system-ui, sans-serif'; x.fillText('Property measurements', 30, 46);
	x.font = '20px system-ui, sans-serif'; x.fillStyle = '#d6eadc';
	x.fillText(fit(x, [st.address, st.client && st.client.name, new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })].filter(Boolean).join('  ·  '), W - 420), 30, 80);
	x.textAlign = 'right'; x.fillStyle = '#fff'; x.font = '700 40px system-ui, sans-serif'; x.fillText(fmtArea(totalOf(st.sections)), W - 30, 54);
	x.font = '18px system-ui, sans-serif'; x.fillStyle = '#d6eadc'; x.fillText(`total · ${rows} area${rows > 1 ? 's' : ''}`, W - 30, 82);
	x.drawImage(m, 30, 120);
	x.strokeStyle = '#c9d3cc'; x.lineWidth = 1; x.strokeRect(30.5, 120.5, W - 61, MH - 1);
	// table
	let y = 120 + MH + 40;
	const cols = [[30, 'AREA'], [520, 'TYPE'], [790, 'SIZE'], [1030, 'PERIMETER'], [1220, 'ROOF']];
	x.textAlign = 'left'; x.fillStyle = '#5b6b61'; x.font = '700 16px system-ui, sans-serif';
	for (const [cx, t] of cols) x.fillText(t, cx + (cx === 30 ? 30 : 0), y);
	y += 14; x.fillStyle = '#1f5133'; x.fillRect(30, y, W - 60, 2); y += 32;
	x.font = '20px system-ui, sans-serif';
	st.sections.forEach((s, i) => {
		if (i % 2) { x.fillStyle = '#f2f6f3'; x.fillRect(30, y - 28, W - 60, 42); }
		x.fillStyle = kindOf(s.kind)[2]; x.fillRect(32, y - 18, 20, 20);
		x.fillStyle = '#16211b'; x.font = '600 20px system-ui, sans-serif'; x.fillText(fit(x, s.name, 440), 60, y);
		x.font = '20px system-ui, sans-serif'; x.fillText(kindOf(s.kind)[1].replace(/^\S+\s/, ''), 520, y);
		x.font = '600 20px system-ui, sans-serif'; x.fillText(fmtArea(sizeOf(s)), 790, y);
		x.font = '20px system-ui, sans-serif'; x.fillText(fmtFtIn(s.perim), 1030, y);
		x.fillText(s.kind === 'roof' && s.pitch ? `${s.pitch}/12 · ${(sizeOf(s) / 100).toFixed(1)} sq` : '—', 1220, y);
		y += 42;
	});
	x.fillStyle = '#1f5133'; x.fillRect(30, y - 26, W - 60, 2);
	x.font = '700 24px system-ui, sans-serif'; x.fillStyle = '#16211b'; x.fillText('Total', 60, y + 10); x.fillText(fmtArea(totalOf(st.sections)), 790, y + 10);
	y += 56;
	if (noteLines.length) {
		x.font = '700 16px system-ui, sans-serif'; x.fillStyle = '#5b6b61'; x.fillText('NOTES', 30, y); y += 28;
		x.font = '19px system-ui, sans-serif'; x.fillStyle = '#16211b';
		for (const l of noteLines) { x.fillText(l, 30, y); y += 26; }
	}
	x.font = '15px system-ui, sans-serif'; x.fillStyle = '#7a877f';
	x.fillText(fit(x, `Measured from aerial imagery${st.info && st.info.source ? ' (' + st.info.source + ')' : ''}. Sizes are from above: slopes are a little larger on the ground; trees can hide edges. Roof sizes include pitch.`, W - 60), 30, H - 26);
	return { url: c.toDataURL('image/jpeg', 0.85), map: m.toDataURL('image/jpeg', 0.85) };
}
function wrap(t, n) {
	const out = [];
	for (const para of String(t).split('\n')) { let l = ''; for (const w of para.split(/\s+/)) { if ((l + ' ' + w).trim().length > n) { out.push(l); l = w; } else l = (l + ' ' + w).trim(); } if (l) out.push(l); }
	return out;
}
function fit(x, t, w) { if (x.measureText(t).width <= w) return t; while (t.length > 1 && x.measureText(t + '…').width > w) t = t.slice(0, -1); return t + '…'; }
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Print on one letter page: the map picture, the table and notes (a blank popup that prints itself). */
export async function printReport(st, rep) {
	const win = window.open('', '_blank');
	if (!win) throw new Error('Allow pop-ups for this site to print, or use “Save to this device” and print the picture.');
	const rows = st.sections.map((s) => `<tr><td><i style="background:${kindOf(s.kind)[2]}"></i>${esc(s.name)}</td><td>${esc(kindOf(s.kind)[1].replace(/^\S+\s/, ''))}</td><td class="n">${esc(fmtArea(sizeOf(s)))}</td><td class="n">${esc(fmtFtIn(s.perim))}</td><td>${s.kind === 'roof' && s.pitch ? `${s.pitch}/12 · ${(sizeOf(s) / 100).toFixed(1)} squares` : ''}</td></tr>`).join('');
	const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(fileName(st))}</title><style>
@page{size:letter;margin:.4in}*{box-sizing:border-box}body{font:12px system-ui,sans-serif;color:#16211b;margin:0}
header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #1f5133;padding-bottom:6px;margin-bottom:8px}
h1{font-size:19px;margin:0}header p{margin:2px 0 0;color:#4a5a50}.tot{text-align:right}.tot b{font-size:22px;display:block}
img{width:100%;max-height:5.6in;object-fit:contain;border:1px solid #c9d3cc;display:block}
table{width:100%;border-collapse:collapse;margin-top:8px}th{text-align:left;font-size:10px;color:#5b6b61;border-bottom:2px solid #1f5133;padding:3px 4px}
td{padding:4px;border-bottom:1px solid #e3e9e5}td i{display:inline-block;width:11px;height:11px;border-radius:2px;margin-right:6px;vertical-align:-1px}.n{white-space:nowrap}
tfoot td{font-weight:700;font-size:14px;border-bottom:0}.note{margin:8px 0 0;white-space:pre-wrap}small{display:block;margin-top:8px;color:#7a877f}
tr{break-inside:avoid}@media screen{body{max-width:8in;margin:20px auto;padding:0 12px}}
</style></head><body><header><div><h1>Property measurements</h1><p>${esc([st.address, st.client && st.client.name, new Date().toLocaleDateString()].filter(Boolean).join(' · '))}</p></div><div class="tot"><b>${esc(fmtArea(totalOf(st.sections)))}</b>total · ${st.sections.length} area${st.sections.length > 1 ? 's' : ''}</div></header>
<img src="${rep.map}" alt="Measured areas">
<table><thead><tr><th>Area</th><th>Type</th><th>Size</th><th>Perimeter</th><th>Roof</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="2">Total</td><td class="n">${esc(fmtArea(totalOf(st.sections)))}</td><td colspan="2"></td></tr></tfoot></table>
${st.note ? `<p class="note"><b>Notes:</b> ${esc(st.note)}</p>` : ''}<small>Measured from aerial imagery${st.info && st.info.source ? ' (' + esc(st.info.source) + ')' : ''}. Sizes are from above; slopes are a little larger on the ground.</small>
<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>`;
	win.document.open(); win.document.write(html); win.document.close();
}

/** Customer page → 📏 Measurements. */
export function measurementsPane(pane, c, go, reload) {
	const all = (c.properties || []).flatMap((p) => ((p.data && p.data.measurements) || []).map((m) => ({ ...m, prop_id: p.id })));
	all.sort((a, b) => b.at - a.at);
	put(pane, h('div', { class: 'ds-row ds-wrap' }, h('button', { class: 'ds-btn', onclick: () => go({ v: 'measure', client_id: c.id }) }, '📏 Measure property')),
		all.length ? h('div', { class: 'ds-ms-cards' }, ...all.map((m) => card(null,
			m.image ? h('a', { href: m.image, target: '_blank', rel: 'noopener', title: 'Open the full report' }, h('img', { class: 'ds-ms-shot', src: m.image, alt: 'Measurement report', loading: 'lazy' })) : null,
			h('div', { class: 'ds-row ds-wrap' }, h('b', { class: 'ds-grow' }, `${fmtArea(m.total)} — ${m.title || 'Measurement'}`), h('small', { class: 'ds-muted' }, new Date(m.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }))),
			h('ul', null, ...(m.sections || []).map((s) => h('li', null, `${s.name}: ${fmtArea(s.surface || s.sqft)}${s.pitch ? ` (roof ${s.pitch}/12, ${((s.surface || s.sqft) / 100).toFixed(1)} squares)` : ''}`))),
			h('small', { class: 'ds-hint' }, [m.address, m.source].filter(Boolean).join(' · ')), m.note ? h('p', { class: 'ds-pre' }, m.note) : null,
			h('div', { class: 'ds-row ds-wrap' },
				m.image ? h('a', { class: 'ds-btn ds-ghost ds-sm', href: m.image, download: 'Measurements - ' + String(m.address || '').split(',')[0] + '.jpg' }, '💾 Download') : null,
				h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => { navigator.clipboard.writeText(`${m.address}\n${(m.sections || []).map((s) => `${s.name}: ${Math.round(s.surface || s.sqft)} sq ft`).join('\n')}\nTotal: ${Math.round(m.total)} sq ft`).then(() => toast('Copied.')); } }, '📋 Copy'),
				h('button', { class: 'ds-link', onclick: async () => { if (!confirm('Delete this measurement?')) return; try { await api('crm/measurement/delete', { body: { prop_id: m.prop_id, id: m.id } }); reload(); } catch (e) { toast(e.message); } } }, 'Delete'))))) : h('p', { class: 'ds-muted' }, 'No measurements yet. Tap “Measure property” to measure a lawn, roof, beds or the whole lot from above.'));
}

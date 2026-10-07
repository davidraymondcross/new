/* DreamScaper – Measure Property Features (Contractor Hub).
 *
 * A guided measuring tool: find the property from above (address search, a customer, or a calendar
 * job), tap around the edge of a lawn, roof, bed, driveway or the whole lot — the big "Start" point
 * closes the shape — name it, and keep going. Areas add up to a running total. Roofs can take a pitch
 * so you get the real roof surface and roofing squares. Finish saves a screenshot, every area and the
 * total to the customer (an existing one, a new one, or the one you came from) — it's on their
 * customer page under 📏 Measurements.
 *
 * Imagery: to-scale aerial photos (Connecticut 3-inch state imagery; USGS NAIP elsewhere, or the
 * provider set in Settings) that may legally be traced and kept. "Open in Google Maps" shows the same
 * spot in Google for reference.
 */
import { h, put, icon } from './util.js?v=2.7.5';
import { api } from './api.js?v=2.7.5';
import { modal } from './capture.js?v=2.7.5';
import { addressField } from './address.js?v=2.7.5';
import { fmtArea, fmtFtIn } from './takeoff.js?v=2.7.5';
import { sectionHead, tip } from './explain.js?v=2.7.5';
import { area as polyArea, centroid, dist } from './plangen.js?v=2.7.5';
import { tracer, addressProblem } from './planwiz.js?v=2.7.5';
import { analyze } from './photocheck.js?v=2.7.5';

let M = null;
export function initMeasure(ctx) { M = { ctx }; }
const toast = (m, ms) => M && M.ctx.toast(m, ms);
const card = (title, ...kids) => h('section', { class: 'ds-hub-card' }, title ? h('h2', null, title) : null, ...kids);
// a <label> forwards clicks to its first control, so groups of buttons (chips) get a plain <div>
const field = (label, el, hint) => h(el && el.querySelector && el.querySelector('button') ? 'div' : 'label', { class: 'ds-field' }, h('span', null, label), el, hint ? h('small', { class: 'ds-hint' }, hint) : null);
export const KINDS = [['lawn', '🌱 Lawn / grass', '#51cf66'], ['roof', '🏠 Roof', '#ff922b'], ['bed', '🪴 Planting bed', '#a9713f'], ['hardscape', '🧱 Patio / walkway', '#e8b07b'], ['driveway', '🚗 Driveway', '#adb5bd'], ['lot', '📐 Whole property', '#ff6b6b'], ['other', '✏️ Other', '#4dabf7']];
const kindOf = (k) => KINDS.find((x) => x[0] === k) || KINDS[KINDS.length - 1];
export const PITCHES = [[0, 'Flat / not a roof'], [3, '3/12 (low)'], [4, '4/12'], [5, '5/12'], [6, '6/12 (common)'], [7, '7/12'], [8, '8/12'], [9, '9/12'], [10, '10/12'], [12, '12/12 (steep)']];
/** Roof surface from its footprint (seen from above) and pitch (rise per 12 in. run). */
export const roofSurface = (footprint, pitch) => (pitch ? footprint * Math.sqrt(1 + (pitch / 12) ** 2) : footprint);
export const sizeOf = (s) => roofSurface(s.sqft, s.pitch || 0);
export const totalOf = (secs) => secs.reduce((t, s) => t + sizeOf(s), 0);
const steps = ['Find the property', 'Measure', 'Save'];

/**
 * Contractor Hub → Measure. view: { client_id, prop_id, visit_id, address } (any of them pre-fill the wizard).
 */
export async function viewMeasure(b, view, go) {
	M.go = go;
	const st = { step: 0, address: view.address || '', lat: 0, lng: 0, client: null, prop: null, visit_id: view.visit_id || 0, base: null, img: null, sections: [], t: { sections: [], cur: null }, saved: null };
	const head = h('ol', { class: 'ds-wiz-steps' });
	const body = h('div', { class: 'ds-ms' });
	put(b, sectionHead('measure'), tip('measure', 'Tap around the edge of what you want to measure, then tap the big “Start” dot to close it. Name it, measure more areas, then Finish — it’s saved to the customer.'), head, body);
	const drawHead = () => { head.innerHTML = ''; steps.forEach((t, i) => head.append(h('li', { class: i === st.step ? 'on' : i < st.step ? 'done' : '' }, h('b', null, i < st.step ? '✓' : String(i + 1)), h('span', null, t)))); };
	// coming from a customer or a calendar job: fill the customer and address in
	if (view.client_id) {
		try {
			const c = await api('crm/client', { query: { id: view.client_id } });
			st.client = c;
			st.prop = (c.properties || []).find((p) => p.id === view.prop_id) || (c.properties || [])[0] || null;
			if (st.prop) Object.assign(st, { address: st.prop.address, lat: st.prop.lat, lng: st.prop.lng });
			else if (c.address) st.address = [c.address, c.town, c.state, c.zip].filter(Boolean).join(', ');
		} catch (e) { toast(e.message); }
	}
	const show = (i) => {
		if (st.cleanup) { st.cleanup(); st.cleanup = null; }
		st.step = i;
		drawHead();
		body.innerHTML = '';
		[stepFind, stepMeasure, stepSave][i](st, body, show);
	};
	show(st.address && (st.lat || view.address) ? 1 : 0);
}

/* ------------------------------------------------------------ 1. find */

function stepFind(st, body, show) {
	const addr = h('input', { type: 'text', placeholder: '123 Main Street, Town, ST', autocomplete: 'street-address', value: st.address });
	let picked = st.lat ? st.address : '';
	const af = addressField(addr, { api: apiBase(), onPick: (it) => { addr.value = it.label; picked = it.label; st.lat = it.lat || 0; st.lng = it.lng || 0; } });
	const q = h('input', { type: 'search', placeholder: 'Or search your customers', 'aria-label': 'Search customers' });
	const list = h('div', { class: 'ds-hub-list' });
	const go = h('button', { class: 'ds-btn' }, 'Show the property →');
	put(body,
		h('ol', { class: 'ds-pw-todo' }, h('li', null, 'Type the address and pick it from the list — or pick a customer.'), h('li', null, 'Tap “Show the property”.')),
		card(null, field('Property address', af), st.client ? h('p', { class: 'ds-pw-okline' }, `✓ For ${st.client.name} — the measurement will be saved to them.`) : null, go),
		st.client ? null : card('Your customers', q, list));
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
				const full = await api('crm/client', { query: { id: c.id } });
				st.client = full;
				st.prop = (full.properties || [])[0] || null;
				if (st.prop) Object.assign(st, { address: st.prop.address, lat: st.prop.lat, lng: st.prop.lng });
				show(st.address ? 1 : 0);
			} }, h('b', null, c.name), h('small', null, [c.address, c.town].filter(Boolean).join(', '))));
		} catch (e) { list.innerHTML = ''; }
	};
	let t = 0;
	q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(search, 250); });
	if (!st.client) search();
}
const apiBase = () => (M.ctx.cfg && M.ctx.cfg.api) || '/wp-json/dreamscaper/v1/';

/* ------------------------------------------------------------ 2. measure */

function stepMeasure(st, body, show) {
	const status = h('p', { class: 'ds-hint', 'aria-live': 'polite' }, 'Loading the property from above…');
	const box = h('div', { class: 'ds-pw-tracer' });
	const live = h('div', { class: 'ds-ms-live', 'aria-live': 'polite' });
	const list = h('div', { class: 'ds-ms-list' });
	const pad = h('div', { class: 'ds-row ds-wrap' },
		h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => reload(0.75) }, '＋ Closer'),
		h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => reload(1 / 0.75) }, '－ Show more'),
		h('a', { class: 'ds-btn ds-ghost ds-sm', target: '_blank', rel: 'noopener', href: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(st.address) }, '🗺️ Open in Google Maps'));
	const tools = h('div', { class: 'ds-row ds-wrap ds-ms-tools' },
		h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => tr && tr.undo() }, '↶ Undo point'),
		h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => tr && tr.clearActive() }, 'Clear this shape'),
		h('span', { class: 'ds-grow' }),
		h('button', { class: 'ds-btn', onclick: () => finish() }, '✓ Finish'));
	put(body,
		h('ol', { class: 'ds-pw-todo ds-ms-todo' },
			h('li', null, 'Zoom in on the area (mouse wheel, pinch or ＋/－). Drag to move around.'),
			h('li', null, 'Tap each corner around its edge. Curves: tap every few feet.'),
			h('li', null, 'Close the shape by tapping the big yellow “Start” dot. Then name it.'),
			h('li', null, 'Measure another area (they add up), or tap Finish.')),
		h('p', { class: 'ds-hint' }, st.address, st.client ? ` · ${st.client.name}` : ''), pad, status, box, live, tools, list);
	let tr = null, span = 70;
	const load = async (body2) => {
		status.textContent = 'Loading the property from above…';
		try {
			const r = await fetch(apiBase() + 'aerial', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body2) });
			const j = await r.json();
			if (!r.ok) throw new Error(j.message || 'Could not load imagery.');
			const im = new Image();
			im.src = j.image;
			await im.decode();
			const m = analyze(im, im.naturalWidth, im.naturalHeight);
			if (m.sd < 4 && !body2.src) return load({ ...body2, src: 'national' });
			const ppf = j.ppf || im.naturalWidth / (j.span * 3.28084);
			// keep areas already measured when zooming in/out: same centre, new scale
			if (st.base) {
				const ox = st.base.W / st.base.ppf / 2, oy = st.base.H / st.base.ppf / 2, nx = im.naturalWidth / ppf / 2, ny = im.naturalHeight / ppf / 2;
				const mv = (p) => [p[0] - ox + nx, p[1] - oy + ny];
				for (const s of st.sections) s.pts = s.pts.map(mv);
				st.t.cur = null;
			}
			st.lat = j.lat; st.lng = j.lng; span = j.span;
			st.base = { W: im.naturalWidth, H: im.naturalHeight, ppf, res: j.res || 0.25, source: j.source || '', image: j.image, where: { lat: j.lat, lng: j.lng } };
			st.img = im;
			status.textContent = m.sd < 4 ? '⚠️ No imagery came back for this spot.' : `${j.source || 'Aerial imagery'} · ${j.res > 1 ? `about ${j.res} ft per pixel — fine for lawns, roofs and lots; trace small things carefully` : 'sharp 3-inch detail'}.`;
			if (tr) tr.destroy();
			syncSections();
			tr = tracer(box, { img: im, W: im.naturalWidth, H: im.naturalHeight, ppf, trace: st.t, active: { key: 'cur', type: 'poly' }, onChange: changed });
			st.cleanup = () => tr && tr.destroy();
			drawList();
			changed();
		} catch (e) { status.textContent = e.message + ' Check the address and try again.'; }
	};
	const reload = (k) => load({ lat: st.lat, lng: st.lng, span: Math.max(25, Math.min(400, span * k)) });
	const syncSections = () => { st.t.sections = st.sections.map((s) => ({ pts: s.pts, color: kindOf(s.kind)[2], label: `${s.name} · ${fmtArea(sizeOf(s))}` })); };
	const changed = () => {
		const d = tr ? tr.draft() : null;
		live.innerHTML = '';
		if (d && d.length) put(live, h('p', null, d.length < 3 ? `${d.length} point${d.length > 1 ? 's' : ''} — keep tapping around the edge.` : `About ${fmtArea(polyArea(d))} so far · tap the yellow Start dot to close.`));
		if (st.t.cur && st.t.cur.length >= 3) nameIt(st.t.cur);
	};
	const nameIt = (pts) => {
		st.t.cur = null;
		const sq = polyArea(pts);
		if (sq < 4) { toast('That shape is too small — try again.'); tr.redraw(); return; }
		let kind = guessKind(st.sections);
		const nm = h('input', { type: 'text', value: defaultName(kind, st.sections), maxlength: 60 });
		const pitch = h('select', { 'aria-label': 'Roof pitch' }, ...PITCHES.map(([v, l]) => h('option', { value: v, selected: v === 6 }, l)));
		const pitchRow = field('Roof pitch (rise per 12 in.)', pitch, 'Seen from above, a roof looks smaller than it is. The pitch gives the real roof surface and roofing squares.');
		const chips = h('div', { class: 'ds-chips' });
		const drawChips = () => { chips.innerHTML = ''; for (const [k, l] of KINDS) chips.append(h('button', { type: 'button', class: 'ds-chip' + (k === kind ? ' on' : ''), onclick: () => { const auto = nm.value === defaultName(kind, st.sections); kind = k; if (auto) nm.value = defaultName(k, st.sections); pitchRow.hidden = k !== 'roof'; drawChips(); } }, l)); };
		drawChips();
		pitchRow.hidden = kind !== 'roof';
		const save = h('button', { class: 'ds-btn ds-wide' }, 'Save this area');
		const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => { m.remove(); tr.redraw(); } }, icon('close'));
		const m = modal(M.ctx.root, `Name this area — ${fmtArea(sq)}`, [h('p', { class: 'ds-hint' }, `Perimeter ${fmtFtIn(perimeter(pts))}.`), field('What is it?', chips), field('Name', nm), pitchRow, save], close);
		save.onclick = () => {
			const name = nm.value.trim() || defaultName(kind, st.sections);
			st.sections.push({ name, kind, sqft: sq, perim: perimeter(pts), pitch: kind === 'roof' ? +pitch.value : 0, pts });
			m.remove();
			syncSections(); tr.redraw(); drawList();
			toast(`${name}: ${fmtArea(sizeOf(st.sections[st.sections.length - 1]))}. Measure another area, or tap Finish.`, 5000);
		};
		setTimeout(() => nm.select(), 50);
	};
	const drawList = () => {
		list.innerHTML = '';
		if (!st.sections.length) return put(list, h('p', { class: 'ds-muted' }, 'No areas yet.'));
		put(list, card('Measured areas',
			h('div', { class: 'ds-hub-list' }, ...st.sections.map((s, i) => h('div', { class: 'ds-hub-row' },
				h('span', { class: 'ds-ms-sw', style: `--c:${kindOf(s.kind)[2]}` }),
				h('span', { class: 'ds-grow' }, h('b', null, s.name), h('small', null, s.kind === 'roof' && s.pitch ? `${fmtArea(s.sqft)} footprint · ${s.pitch}/12 pitch → ${fmtArea(sizeOf(s))} roof (${(sizeOf(s) / 100).toFixed(1)} squares)` : `${fmtArea(s.sqft)} · perimeter ${fmtFtIn(s.perim)}`)),
				h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => { const n = prompt('Rename', s.name); if (n) { s.name = n.slice(0, 60); syncSections(); tr.redraw(); drawList(); } } }, 'Rename'),
				h('button', { class: 'ds-icon-btn', 'aria-label': 'Remove ' + s.name, onclick: () => { if (confirm(`Remove “${s.name}”?`)) { st.sections.splice(i, 1); syncSections(); tr.redraw(); drawList(); } } }, icon('close', 14))))),
			h('p', { class: 'ds-ms-total' }, 'Total: ', h('b', null, fmtArea(totalOf(st.sections))), st.sections.length > 1 ? ` (${st.sections.length} areas added together)` : '')));
	};
	const finish = () => {
		const d = tr && tr.draft();
		if (d && d.length >= 3 && !confirm('The shape you’re drawing isn’t closed yet. Finish without it?')) return;
		if (!st.sections.length) return toast('Measure at least one area first: tap around its edge and close it on the Start dot.', 6000);
		show(2);
	};
	const body2 = st.lat ? { lat: st.lat, lng: st.lng, span } : { address: st.address, span };
	load(body2);
	drawList();
}
const perimeter = (pts) => pts.reduce((t, p, i) => t + dist(p, pts[(i + 1) % pts.length]), 0);
function guessKind(secs) { return secs.length ? secs[secs.length - 1].kind : 'lawn'; }
function defaultName(kind, secs) {
	const base = { lawn: 'Lawn', roof: 'Roof', bed: 'Bed', hardscape: 'Patio', driveway: 'Driveway', lot: 'Whole property', other: 'Area' }[kind] || 'Area';
	const n = secs.filter((s) => s.kind === kind).length;
	return kind === 'lot' && !n ? base : `${base} ${n + 1}`;
}

/* ------------------------------------------------------------ 3. save */

function stepSave(st, body, show) {
	const total = totalOf(st.sections);
	const shot = screenshot(st);
	const note = h('textarea', { rows: 2, placeholder: 'Notes (optional) — e.g. back lawn slopes; measure the fence line on site' });
	const out = h('div');
	put(body,
		card('📏 ' + fmtArea(total), h('img', { class: 'ds-ms-shot', src: shot, alt: 'The measured areas on the property' }),
			h('ul', null, ...st.sections.map((s) => h('li', null, `${s.name}: ${fmtArea(sizeOf(s))}${s.kind === 'roof' && s.pitch ? ` (${(sizeOf(s) / 100).toFixed(1)} roofing squares)` : ''}`))),
			h('p', { class: 'ds-hint' }, `${st.address} · ${st.base ? st.base.source : ''}. Measured from above: on slopes the real surface is a little larger; trees can hide edges.`),
			field('Notes', note),
			h('div', { class: 'ds-row ds-wrap' }, h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => show(1) }, '← Measure more'), h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => copySummary(st) }, '📋 Copy summary'))),
		out);
	const payload = (extra) => ({ ...extra, address: st.address, lat: st.lat, lng: st.lng, visit_id: st.visit_id, image: shot, source: st.base ? st.base.source : '', res: st.base ? st.base.res : 0, note: note.value, title: st.sections.map((s) => s.name).join(', '),
		sections: st.sections.map((s) => ({ name: s.name, kind: s.kind, sqft: s.sqft, perim: s.perim, pitch: s.pitch, pts: s.pts })) });
	const done = (r, name) => {
		st.saved = r;
		out.innerHTML = '';
		put(out, card('✓ Saved to ' + name,
			h('p', null, 'The screenshot, every area and the total are on their customer page under 📏 Measurements.'),
			h('div', { class: 'ds-row ds-wrap' },
				h('button', { class: 'ds-btn', onclick: () => M.go({ v: 'customer', id: r.client_id, tab: 'measure' }) }, 'Open ' + name),
				h('button', { class: 'ds-btn ds-ghost', onclick: () => M.go({ v: 'quote', seed: { client_id: r.client_id, prop_id: r.prop_id } }) }, '🧾 Start a quote'),
				h('button', { class: 'ds-btn ds-ghost', onclick: () => M.go({ v: 'measure' }) }, 'Measure another property'))));
	};
	const save = async (btn, extra, name) => {
		btn.disabled = true;
		try { const r = await api('crm/measurement', { body: payload(extra) }); done(r, name); toast('Measurement saved.'); } catch (e) { toast(e.message, 6000); btn.disabled = false; }
	};
	if (st.client) {
		// came from a customer (or a calendar job): it goes straight to them
		const b2 = h('button', { class: 'ds-btn ds-wide' }, `Save to ${st.client.name}`);
		put(out, card(null, b2));
		b2.onclick = () => save(b2, { client_id: st.client.id, prop_id: st.prop ? st.prop.id : 0 }, st.client.name);
		if (st.autoSave !== false) { st.autoSave = false; b2.click(); }
		return;
	}
	const name = h('input', { type: 'text', autocomplete: 'name' }), phone = h('input', { type: 'tel' }), email = h('input', { type: 'email' });
	const q = h('input', { type: 'search', placeholder: 'Search your customers' });
	const list = h('div', { class: 'ds-hub-list' });
	const createBtn = h('button', { class: 'ds-btn' }, '+ Create contact & save');
	put(out, h('div', { class: 'ds-form-grid' },
		card('New contact', field('Name', name), field('Mobile', phone), field('Email', email), h('p', { class: 'ds-hint' }, 'Address: ' + st.address), createBtn),
		card('Add to an existing contact', q, list)));
	createBtn.onclick = () => {
		if (name.value.trim().length < 2) return toast('Type the contact’s name.');
		save(createBtn, { new_client: { name: name.value.trim(), phone: phone.value, email: email.value } }, name.value.trim());
	};
	const search = async () => {
		try {
			const r = await api('crm/clients', { query: { q: q.value } });
			list.innerHTML = '';
			for (const c of r.items.slice(0, 8)) {
				const b3 = h('button', { class: 'ds-hub-row' }, h('b', null, c.name), h('small', null, [c.address, c.town].filter(Boolean).join(', ') || c.email || ''));
				b3.onclick = () => save(b3, { client_id: c.id }, c.name);
				list.append(b3);
			}
			if (!r.items.length) list.append(h('p', { class: 'ds-muted' }, 'No match — create a new contact.'));
		} catch (e) { list.innerHTML = ''; }
	};
	let t = 0;
	q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(search, 250); });
	search();
}
function copySummary(st) {
	const txt = `${st.address}\n` + st.sections.map((s) => `${s.name}: ${Math.round(sizeOf(s)).toLocaleString()} sq ft`).join('\n') + `\nTotal: ${Math.round(totalOf(st.sections)).toLocaleString()} sq ft`;
	navigator.clipboard.writeText(txt).then(() => toast('Copied.'), () => toast(txt, 8000));
}

/**
 * The picture saved with the measurement: the aerial around the measured areas, each area outlined,
 * filled and labelled with its name and size, a header with the address and total, a scale bar and north.
 */
export function screenshot(st) {
	const pts = st.sections.flatMap((s) => s.pts);
	const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
	const pad = Math.max(25, (Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys)) * 0.15);
	const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;
	const outW = 1400, k = outW / (x1 - x0), head = 70;
	const c = document.createElement('canvas');
	c.width = outW; c.height = Math.round((y1 - y0) * k) + head;
	const x = c.getContext('2d');
	x.fillStyle = '#e9eee6'; x.fillRect(0, 0, c.width, c.height);
	const P = (p) => [(p[0] - x0) * k, (p[1] - y0) * k + head];
	if (st.img && st.base) x.drawImage(st.img, x0 * st.base.ppf, y0 * st.base.ppf, (x1 - x0) * st.base.ppf, (y1 - y0) * st.base.ppf, 0, head, outW, c.height - head);
	for (const s of st.sections) {
		const col = kindOf(s.kind)[2];
		x.beginPath(); s.pts.forEach((p, i) => { const q = P(p); i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1]); }); x.closePath();
		x.fillStyle = col + '55'; x.fill(); x.strokeStyle = col; x.lineWidth = 4; x.stroke();
	}
	x.font = 'bold 22px sans-serif'; x.textAlign = 'center';
	for (const s of st.sections) {
		const q = P(centroid(s.pts)), t1 = s.name, t2 = fmtArea(sizeOf(s));
		for (const [t, dy] of [[t1, -4], [t2, 22]]) { x.lineWidth = 5; x.strokeStyle = 'rgba(0,0,0,.8)'; x.strokeText(t, q[0], q[1] + dy); x.fillStyle = '#fff'; x.fillText(t, q[0], q[1] + dy); }
	}
	x.textAlign = 'left';
	x.fillStyle = '#12211a'; x.fillRect(0, 0, outW, head);
	x.fillStyle = '#fff'; x.font = 'bold 26px sans-serif'; x.fillText(`Total ${fmtArea(totalOf(st.sections))}`, 18, 32);
	x.font = '17px sans-serif'; x.fillStyle = '#cfe3d5'; x.fillText(`${st.address} · ${new Date().toLocaleDateString()} · ${st.sections.length} area${st.sections.length > 1 ? 's' : ''}`, 18, 58);
	// scale bar + north
	const ft = [10, 20, 50, 100, 200].find((f) => f * k > 120) || 200, L = ft * k, yb = c.height - 22;
	x.fillStyle = 'rgba(255,255,255,.9)'; x.fillRect(12, yb - 20, L + 70, 32);
	x.fillStyle = '#111'; x.fillRect(20, yb, L, 5); x.font = '15px sans-serif'; x.fillText(ft + ' ft', 28 + L, yb + 6);
	x.fillStyle = 'rgba(255,255,255,.9)'; x.fillRect(outW - 52, head + 10, 40, 44); x.fillStyle = '#111'; x.font = 'bold 18px sans-serif'; x.fillText('N', outW - 39, head + 32); x.fillText('↑', outW - 38, head + 50);
	return c.toDataURL('image/jpeg', 0.86);
}

/** Customer page → 📏 Measurements. */
export function measurementsPane(pane, c, go, reload) {
	const all = (c.properties || []).flatMap((p) => ((p.data && p.data.measurements) || []).map((m) => ({ ...m, prop_id: p.id })));
	all.sort((a, b) => b.at - a.at);
	put(pane, h('div', { class: 'ds-row ds-wrap' }, h('button', { class: 'ds-btn', onclick: () => go({ v: 'measure', client_id: c.id }) }, '📏 Measure property')),
		all.length ? h('div', { class: 'ds-ms-cards' }, ...all.map((m) => card(null,
			m.image ? h('a', { href: m.image, target: '_blank', rel: 'noopener' }, h('img', { class: 'ds-ms-shot', src: m.image, alt: 'Measured areas', loading: 'lazy' })) : null,
			h('div', { class: 'ds-row ds-wrap' }, h('b', { class: 'ds-grow' }, `${fmtArea(m.total)} — ${m.title || 'Measurement'}`), h('small', { class: 'ds-muted' }, new Date(m.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }))),
			h('ul', null, ...(m.sections || []).map((s) => h('li', null, `${s.name}: ${fmtArea(s.surface || s.sqft)}${s.pitch ? ` (roof ${s.pitch}/12, ${((s.surface || s.sqft) / 100).toFixed(1)} squares)` : ''}`))),
			h('small', { class: 'ds-hint' }, [m.address, m.source].filter(Boolean).join(' · ')), m.note ? h('p', { class: 'ds-pre' }, m.note) : null,
			h('div', { class: 'ds-row ds-wrap' },
				h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => { navigator.clipboard.writeText(`${m.address}\n${(m.sections || []).map((s) => `${s.name}: ${Math.round(s.surface || s.sqft)} sq ft`).join('\n')}\nTotal: ${Math.round(m.total)} sq ft`).then(() => toast('Copied.')); } }, '📋 Copy'),
				h('button', { class: 'ds-link', onclick: async () => { if (!confirm('Delete this measurement?')) return; try { await api('crm/measurement/delete', { body: { prop_id: m.prop_id, id: m.id } }); reload(); } catch (e) { toast(e.message); } } }, 'Delete'))))) : h('p', { class: 'ds-muted' }, 'No measurements yet. Tap “Measure property” to measure a lawn, roof, beds or the whole lot from above.'));
}

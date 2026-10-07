/* DreamScaper – door-to-door canvassing (Contractor Hub).
 *
 * Walk the street with the map open: tap a house → its address is looked up → tap what happened
 * (flyer left, talked, interested, wants a quote, call back, not interested, do not come back,
 * no soliciting…) → Save. Pins are coloured by result, so you never knock twice by accident and
 * can see at a glance who to follow up with. "Do not come back" and "No soliciting" houses show a
 * red warning if you tap them again. "Wants a quote" with a name and phone becomes a CRM lead.
 */
import { h, put, icon } from './util.js?v=2.7.6';
import { addressField } from './address.js?v=2.7.6';
import { api, session } from './api.js?v=2.7.6';
import { modal } from './capture.js?v=2.7.6';
import { streetMap } from './map.js?v=2.7.6';
import { sectionHead, tip } from './explain.js?v=2.7.6';

let C = null;
export function initCanvass(ctx) { C = { ctx }; }
const toast = (m, ms) => C && C.ctx.toast(m, ms);
const ymd = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const ago = (t) => { const d = Math.round((Date.now() - t) / 864e5); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 30 ? d + ' days ago' : new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); };
const CONTACT = new Set(['talked', 'interested', 'quote', 'callback', 'not_interested', 'customer', 'competitor']);
const FOLLOW = { interested: 3, callback: 2, quote: 1, flyer: 14, talked: 7 };

/** The Door-to-door page. view: { focus: id } opens a house. */
export async function viewCanvass(b, view, go) {
	const filter = new Set();
	let data = null, map = null, listMode = false;
	const counts = h('div', { class: 'ds-chips ds-cv-filter', role: 'group', 'aria-label': 'Show only' });
	const dueBtn = h('button', { class: 'ds-btn ds-ghost ds-sm' }, '🔔 Follow-ups due');
	const mapBox = h('div', { class: 'ds-cv-map' });
	const listBox = h('div', { class: 'ds-cv-list', hidden: true });
	const legend = h('div', { class: 'ds-cv-legend' });
	const base = (C.ctx.cfg && C.ctx.cfg.api) || '/wp-json/dreamscaper/v1/';
	put(b, sectionHead('canvass'),
		tip('canvass', 'Tap a house on the map, tap what happened at the door, then Save. Red pins mean “don’t knock” — you’ll be warned if you tap one.'),
		h('div', { class: 'ds-row ds-wrap ds-cv-bar' },
			h('button', { class: 'ds-btn ds-sm', onclick: (e) => locate(e.currentTarget) }, '📍 Where am I'),
			h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => toggleList() }, '📋 List'),
			dueBtn,
			h('a', { class: 'ds-btn ds-ghost ds-sm', href: base + 'crm/canvass/export?_wpnonce=' + encodeURIComponent(session.nonce), download: '' }, icon('download', 16), ' Export')),
		counts, mapBox, listBox, legend);

	try { data = await api('crm/canvass'); } catch (e) { b.append(h('p', { class: 'ds-err' }, e.message)); return; }
	const st = Object.fromEntries(data.statuses.map((s) => [s.key, s]));
	const start = data.center || (data.items[0] ? [data.items[0].lat, data.items[0].lng] : null);
	map = streetMap(mapBox, { center: start || [39.5, -98.35], zoom: start ? 17 : 4, tiles: data.tiles, onTap: (lat, lng) => tapAt(lat, lng), onPin: (p) => openHouse(p.item), onMove: () => {} });
	if (!start) toast('Tap “Where am I” or zoom into your neighborhood to start.', 5000);
	const pinsFor = (items) => items.filter((i) => !filter.size || filter.has(i.status)).map((i) => ({ lat: i.lat, lng: i.lng, color: (st[i.status] || {}).color, icon: (st[i.status] || {}).icon, ring: i.follow_up && i.follow_up <= ymd(Date.now() + 864e5), label: `${i.address || 'House'} — ${(st[i.status] || {}).label || i.status}`, item: i }));
	const draw = () => {
		map.setPins(pinsFor(data.items));
		counts.innerHTML = '';
		for (const s of data.statuses) {
			const n = data.counts[s.key] || 0;
			if (!n) continue;
			counts.append(h('button', { class: 'ds-chip' + (filter.has(s.key) ? ' on' : ''), style: { borderColor: s.color }, 'aria-pressed': String(filter.has(s.key)), onclick: () => { filter.has(s.key) ? filter.delete(s.key) : filter.add(s.key); draw(); } }, `${s.icon} ${s.label} · ${n}`));
		}
		dueBtn.textContent = `🔔 Follow-ups due${data.due ? ' · ' + data.due : ''}`;
		legend.innerHTML = '';
		legend.append(...data.statuses.map((s) => h('span', null, h('i', { style: { background: s.color } }), s.label)));
		if (listMode) drawList(data.items.filter((i) => !filter.size || filter.has(i.status)));
	};
	const reload = async () => { try { data = await api('crm/canvass'); draw(); } catch (e) { toast(e.message); } };
	dueBtn.onclick = async () => { try { const r = await api('crm/canvass', { query: { due: 1 } }); listMode = true; mapBox.hidden = true; listBox.hidden = false; drawList(r.items, 'Follow-ups due'); } catch (e) { toast(e.message); } };
	function toggleList() { listMode = !listMode; mapBox.hidden = listMode; listBox.hidden = !listMode; draw(); }
	function drawList(items, title) {
		listBox.innerHTML = '';
		if (!items.length) { listBox.append(h('p', { class: 'ds-muted' }, title ? 'Nothing to follow up right now. 🎉' : 'No houses marked yet — tap one on the map.')); return; }
		listBox.append(h('h3', null, title || `${items.length} house${items.length > 1 ? 's' : ''}`), h('div', { class: 'ds-hub-list' }, ...items.map((i) => h('button', { class: 'ds-hub-row', onclick: () => { listMode = false; mapBox.hidden = false; listBox.hidden = true; map.setView([i.lat, i.lng], 19); openHouse(i); } },
			h('span', { class: 'ds-cv-dot', style: { background: (st[i.status] || {}).color } }),
			h('span', { class: 'ds-grow' }, h('b', null, i.address || 'House'), h('small', null, [`${(st[i.status] || {}).icon || ''} ${(st[i.status] || {}).label || ''}`, i.name, i.follow_up ? '🔔 ' + i.follow_up : '', 'last ' + ago(i.last_at)].filter(Boolean).join(' · ')))))));
	}
	async function locate(btn) { btn.disabled = true; try { await map.locate(); } catch (e) { toast(e.message, 5000); } btn.disabled = false; }

	/** Tapped the map: an existing house nearby, or a new one at that address. */
	async function tapAt(lat, lng) {
		let r;
		try { r = await api('crm/canvass/where', { query: { lat, lng } }); } catch (e) { r = { address: '', lat, lng }; }
		if (r.existing) return openHouse(r.existing);
		openHouse({ id: 0, lat, lng, address: r.address || '', status: '', flags: [], name: '', phone: '', email: '', notes: '', follow_up: null, visits: 0 });
	}

	/** The house sheet: what happened at this door. */
	async function openHouse(i) {
		let full = i;
		if (i.id) { try { full = await api('crm/canvass/one', { query: { id: i.id } }); } catch (e) { /* use what we have */ } }
		let status = full.status || '';
		const flags = new Set(full.flags || []);
		const stop = full.id && st[full.status] && st[full.status].stop;
		const addr = h('input', { type: 'text', value: full.address || '', placeholder: 'Address (looked up from the map)', 'aria-label': 'Address' });
		const name = h('input', { type: 'text', value: full.name || '', placeholder: 'Name', autocomplete: 'off', 'aria-label': 'Name' });
		const phone = h('input', { type: 'tel', value: full.phone || '', placeholder: 'Phone', autocomplete: 'off', 'aria-label': 'Phone' });
		const email = h('input', { type: 'email', value: full.email || '', placeholder: 'Email', autocomplete: 'off', 'aria-label': 'Email' });
		const fu = h('input', { type: 'date', value: full.follow_up || '', 'aria-label': 'Follow up on' });
		const notes = h('textarea', { rows: 3, placeholder: 'What did they say? What does the yard need? Best time to come back?' }, full.notes || '');
		const contactBox = h('div', { class: 'ds-cv-contact' }, h('div', { class: 'ds-form-grid' }, name, phone, email), h('label', { class: 'ds-field' }, h('span', null, 'Follow up on'), fu));
		const grid = h('div', { class: 'ds-cv-status', role: 'radiogroup', 'aria-label': 'What happened at this door?' });
		const drawGrid = () => {
			grid.innerHTML = '';
			for (const s of data.statuses) grid.append(h('button', { type: 'button', role: 'radio', 'aria-checked': String(status === s.key), class: 'ds-cv-st' + (status === s.key ? ' on' : '') + (s.stop ? ' stop' : ''), style: `--c:${s.color}`, title: s.desc, onclick: () => {
				status = s.key;
				if (!fu.value && FOLLOW[s.key]) fu.value = ymd(Date.now() + FOLLOW[s.key] * 864e5);
				if (s.stop) fu.value = '';
				if (s.key === 'flyer') flags.add('flyer');
				contactBox.hidden = !CONTACT.has(s.key) && !(name.value || phone.value);
				drawGrid(); drawFlags();
			} }, h('span', { 'aria-hidden': 'true' }, s.icon), h('small', null, s.label)));
		};
		const flagBox = h('div', { class: 'ds-chips ds-chips-sm' });
		const drawFlags = () => { flagBox.innerHTML = ''; for (const [k, l] of Object.entries(data.flags)) flagBox.append(h('button', { type: 'button', class: 'ds-chip' + (flags.has(k) ? ' on' : ''), 'aria-pressed': String(flags.has(k)), onclick: () => { flags.has(k) ? flags.delete(k) : flags.add(k); drawFlags(); } }, l)); };
		drawGrid(); drawFlags();
		contactBox.hidden = !CONTACT.has(status) && !(full.name || full.phone);
		const msg = h('p', { class: 'ds-err' });
		const save = h('button', { class: 'ds-btn ds-wide ds-lg' }, full.id ? 'Save this visit' : 'Save');
		const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
		const hist = full.log && full.log.length ? h('details', null, h('summary', null, `History · ${full.visits} visit${full.visits === 1 ? '' : 's'}`), h('ul', { class: 'ds-plain' }, ...full.log.map((l) => h('li', null, `${new Date(l.at).toLocaleDateString()} — ${(st[l.status] || {}).icon || ''} ${(st[l.status] || {}).label || l.status}${l.note ? ': ' + l.note : ''}`)))) : null;
		const m = modal(C.ctx.root, full.id ? '🏠 ' + (full.address || 'This house') : '🏠 New house', [
			stop ? h('div', { class: 'ds-warn ds-cv-stop', role: 'alert' }, h('b', null, `${st[full.status].icon} Do not knock. `), `${st[full.status].label} — marked ${ago(full.last_at)}.`) : null,
			full.id && !stop ? h('p', { class: 'ds-hint' }, `Last visit ${ago(full.last_at)}: ${(st[full.status] || {}).icon || ''} ${(st[full.status] || {}).label || ''}${full.follow_up ? ' · follow up ' + full.follow_up : ''}`) : null,
			h('label', { class: 'ds-field' }, h('span', null, 'Address'), addressField(addr)),
			h('p', { class: 'ds-label' }, 'What happened?'), grid,
			h('p', { class: 'ds-label' }, 'Also'), flagBox,
			contactBox, h('label', { class: 'ds-field' }, h('span', null, 'Notes'), notes), msg, save,
			h('div', { class: 'ds-row ds-wrap' },
				full.address ? h('a', { class: 'ds-btn ds-ghost ds-sm', href: 'https://maps.google.com/?q=' + encodeURIComponent(full.address), target: '_blank', rel: 'noopener' }, icon('map', 16), ' Directions') : null,
				full.id && !full.client_id ? h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: async (e) => { e.currentTarget.disabled = true; try { const r = await api('crm/canvass/lead', { body: { id: full.id } }); m.remove(); toast('Added to your customers as a lead.'); if (go) go({ v: 'customer', id: r.client_id }); } catch (x) { msg.textContent = x.message; e.currentTarget.disabled = false; } } }, '➕ Make a lead') : null,
				full.client_id && go ? h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => { m.remove(); go({ v: 'customer', id: full.client_id }); } }, '👤 Open customer') : null,
				full.id ? h('button', { class: 'ds-btn ds-ghost ds-sm ds-danger', onclick: async () => { if (!confirm('Remove this house from the map?')) return; await api('crm/canvass/delete', { body: { id: full.id } }); m.remove(); reload(); } }, icon('trash', 16), ' Remove') : null),
			hist], close, 'ds-cv-sheet');
		save.onclick = async () => {
			if (!status) { msg.textContent = 'Tap what happened at the door first.'; return; }
			if (status === 'quote' && !full.client_id && !(name.value.trim() && (phone.value.trim() || /\S+@\S+/.test(email.value)))) { msg.textContent = 'Add their name and a phone or email so the quote request can become a lead.'; contactBox.hidden = false; return; }
			save.disabled = true; msg.textContent = '';
			try {
				const r = await api('crm/canvass', { body: { id: full.id || 0, lat: full.lat, lng: full.lng, address: addr.value, status, flags: [...flags], name: name.value, phone: phone.value, email: email.value, notes: notes.value, follow_up: fu.value || null, visit: true } });
				m.remove();
				toast(r.lead ? `Saved — ${r.name || 'they'} are now a lead in your Customers. 🎉` : `Saved: ${(st[status] || {}).icon} ${(st[status] || {}).label}.`, 3500);
				reload();
			} catch (x) { msg.textContent = x.message; save.disabled = false; }
		};
	}
	draw();
	if (view && view.focus) { const f = data.items.find((x) => x.id === view.focus); if (f) { map.setView([f.lat, f.lng], 19); openHouse(f); } }
}

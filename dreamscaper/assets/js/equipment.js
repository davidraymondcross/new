/* DreamScaper – Equipment maintenance (Contractor Hub).
 *
 * Add a mower, truck, trailer, skid steer… and its usual maintenance is filled in for you (oil, blades,
 * grease, filters, belts, tires, registration…), each "every N hours/miles and/or every N days".
 * Update the hour meter or odometer in one tap, mark tasks done (with a note and cost) and see what's
 * due now or soon. Everything is editable: rename tasks, change intervals, add your own tasks and your
 * own fields (fleet number, warranty end, assigned crew…). Reminders arrive by email, text or both.
 */
import { h, put, icon } from './util.js?v=2.7.6';
import { api } from './api.js?v=2.7.6';
import { modal } from './capture.js?v=2.7.6';
import { sectionHead, tip } from './explain.js?v=2.7.6';

let E = null;
export function initEquipment(ctx) { E = { ctx }; }
const toast = (m, ms) => E && E.ctx.toast(m, ms);
const field = (label, el, hint) => h(el && el.querySelector && el.querySelector('button') ? 'div' : 'label', { class: 'ds-field' }, h('span', null, label), el, hint ? h('small', { class: 'ds-hint' }, hint) : null);
const input = (v, a = {}) => h('input', { type: 'text', value: v == null ? '' : v, ...a });
const ymd = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const unitWord = (u) => (u === 'miles' ? 'miles' : u === 'hours' ? 'hours' : '');
const unitShort = (u) => (u === 'miles' ? 'mi' : 'hrs');
const STATE = { due: ['🔴', 'Due'], soon: ['🟡', 'Soon'], ok: ['🟢', 'OK'], off: ['⚪', 'Off'] };
const every = (t, u) => [t.meter ? `${t.meter.toLocaleString()} ${unitShort(u)}` : '', t.days ? (t.days % 365 === 0 ? `${t.days / 365} yr` : t.days % 30 === 0 ? `${t.days / 30} mo` : `${t.days} days`) : ''].filter(Boolean).join(' or ');

export async function viewEquipment(b, view) {
	let data;
	const list = h('div', { class: 'ds-eq-list' });
	const summary = h('div', { class: 'ds-chips' });
	let filter = view.filter || 'all';
	put(b, sectionHead('equipment', h('button', { class: 'ds-btn', onclick: () => editEquipment(null, data, reload) }, icon('plus', 18), ' Add equipment')),
		tip('equipment', 'Add each machine and vehicle — the usual maintenance is filled in automatically. Update hours or miles now and then, tap “Done” after a service, and you’ll be reminded before anything is due.'),
		summary, list, h('div', { class: 'ds-eq-settings' }));
	const reload = async () => {
		try { data = await api('crm/equipment'); } catch (e) { list.innerHTML = ''; return put(list, h('p', { class: 'ds-warn' }, e.message)); }
		draw();
	};
	const draw = () => {
		const items = data.items;
		const due = items.reduce((n, e) => n + e.due, 0), soon = items.reduce((n, e) => n + e.soon, 0);
		summary.innerHTML = '';
		for (const [k, l] of [['all', `All (${items.length})`], ['due', `🔴 Due now (${due})`], ['soon', `🟡 Due soon (${soon})`]]) summary.append(h('button', { class: 'ds-chip' + (filter === k ? ' on' : ''), onclick: () => { filter = k; draw(); } }, l));
		list.innerHTML = '';
		if (!items.length) return put(list, h('div', { class: 'ds-empty' }, h('p', null, 'No equipment yet.'), h('p', { class: 'ds-hint' }, 'Start with your mowers, trucks and trailers — pick the type and the maintenance schedule is filled in for you.'), h('button', { class: 'ds-btn', onclick: () => editEquipment(null, data, reload) }, 'Add your first machine')));
		const show = items.filter((e) => filter === 'all' || (filter === 'due' ? e.due : e.soon));
		show.sort((a, c) => c.due - a.due || c.soon - a.soon || a.name.localeCompare(c.name));
		for (const e of show) list.append(card(e, data, reload));
		if (!show.length) list.append(h('p', { class: 'ds-muted' }, filter === 'due' ? '✅ Nothing is due right now.' : '✅ Nothing coming up soon.'));
		settingsCard(b.querySelector('.ds-eq-settings'), data);
	};
	await reload();
}

function card(e, data, reload) {
	const meterIn = h('input', { type: 'number', min: 0, step: 'any', placeholder: 'New reading', 'aria-label': `New ${unitWord(e.meter_unit)} reading`, class: 'ds-eq-meterin' });
	const saveMeter = async (force = false) => {
		const v = parseFloat(meterIn.value);
		if (!(v >= 0)) return toast('Type the reading.');
		try { await api('crm/equipment/meter', { body: { id: e.id, value: v, force } }); toast('Reading saved.'); reload(); }
		catch (x) { if (x.status === 409 && confirm(x.message)) return saveMeter(true); toast(x.message); }
	};
	const tasks = e.tasks.filter((t) => t.on).sort((a, c) => (c.st.frac || 0) - (a.st.frac || 0));
	const top = tasks.filter((t) => t.st.state === 'due' || t.st.state === 'soon');
	const d = e.data || {};
	return h('section', { class: 'ds-hub-card ds-eq' + (e.due ? ' due' : e.soon ? ' soon' : '') },
		h('div', { class: 'ds-row ds-wrap' },
			h('span', { class: 'ds-eq-ic', 'aria-hidden': 'true' }, e.icon),
			h('div', { class: 'ds-grow' }, h('b', null, e.name), h('small', { class: 'ds-muted' }, [d.year, d.make, d.model].filter(Boolean).join(' ') || (data.catalog.find((c) => c.id === e.type) || {}).label || '')),
			e.due ? h('span', { class: 'ds-qs ds-eq-due' }, `🔴 ${e.due} due`) : e.soon ? h('span', { class: 'ds-qs ds-eq-soon' }, `🟡 ${e.soon} soon`) : h('span', { class: 'ds-qs' }, '🟢 All good'),
			h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => editEquipment(e, data, reload) }, icon('edit', 14), ' Edit')),
		e.meter_unit !== 'none' ? h('div', { class: 'ds-row ds-wrap ds-eq-meter' },
			h('span', null, `${e.meter_unit === 'miles' ? '🛣️ Odometer' : '⏱️ Hour meter'}: `, h('b', null, `${e.meter.toLocaleString()} ${unitShort(e.meter_unit)}`), h('small', { class: 'ds-muted' }, e.meter_at ? ` · updated ${new Date(e.meter_at).toLocaleDateString()}` : '')),
			meterIn, h('button', { class: 'ds-btn ds-sm', onclick: () => saveMeter() }, 'Update')) : null,
		top.length ? h('ul', { class: 'ds-eq-tasks' }, ...top.map((t) => taskRow(e, t, reload))) : h('p', { class: 'ds-hint' }, tasks.length ? `Next: ${tasks[0].name} (${tasks[0].st.left})` : 'No maintenance tasks — tap Edit to add some.'),
		h('details', null, h('summary', null, `All maintenance (${tasks.length}) & history`),
			h('ul', { class: 'ds-eq-tasks' }, ...tasks.map((t) => taskRow(e, t, reload))),
			h('div', { class: 'ds-row ds-wrap' }, h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => doneDialog(e, null, reload) }, '✅ Log a service (several tasks)')),
			e.log.length ? h('div', { class: 'ds-eq-log' }, h('h4', null, 'History'), ...e.log.slice(0, 20).map((l) => h('div', null, h('small', { class: 'ds-muted' }, new Date(l.at).toLocaleDateString()), ' ', l.kind === 'done' ? '✅ ' : '⏱️ ', l.text, l.meter != null && l.kind === 'done' ? ` @ ${Number(l.meter).toLocaleString()} ${unitShort(e.meter_unit)}` : '', l.cost ? ` · $${Number(l.cost).toFixed(2)}` : '', l.by ? ` · ${l.by}` : '', l.note ? h('div', { class: 'ds-hint' }, l.note) : null))) : null,
			(d.fields || []).length || d.serial || d.plate || d.notes ? h('div', { class: 'ds-kvs' }, d.serial ? kv('Serial / VIN', d.serial) : null, d.plate ? kv('Plate', d.plate) : null, d.purchased ? kv('Bought', d.purchased) : null, ...(d.fields || []).map((f) => kv(f.label, f.value)), d.notes ? kv('Notes', d.notes) : null) : null));
}
const kv = (k, v) => h('div', { class: 'ds-kv' }, h('small', null, k), h('span', null, v));
function taskRow(e, t, reload) {
	const [ic, label] = STATE[t.st.state] || STATE.ok;
	return h('li', { class: 'ds-eq-task st-' + t.st.state },
		h('span', { class: 'ds-grow' }, h('b', null, `${ic} ${t.name}`), h('small', null, ` · every ${every(t, e.meter_unit)} · ${label === 'OK' ? 'next ' : ''}${t.st.left}`), t.how ? h('div', { class: 'ds-hint' }, t.how) : null),
		h('button', { class: 'ds-btn ds-sm' + (t.st.state === 'due' ? '' : ' ds-ghost'), onclick: () => doneDialog(e, t, reload) }, '✅ Done'));
}

function doneDialog(e, t, reload) {
	const picks = new Set(t ? [t.id] : []);
	const chips = h('div', { class: 'ds-eq-picks' });
	const drawPicks = () => { chips.innerHTML = ''; for (const x of e.tasks.filter((y) => y.on)) chips.append(h('label', { class: 'ds-check' }, h('input', { type: 'checkbox', checked: picks.has(x.id), onchange: (ev) => { ev.target.checked ? picks.add(x.id) : picks.delete(x.id); } }), ' ' + x.name)); };
	drawPicks();
	const date = h('input', { type: 'date', value: ymd(Date.now()) });
	const meter = h('input', { type: 'number', min: 0, step: 'any', value: e.meter });
	const note = h('textarea', { rows: 2, placeholder: 'Parts, oil used, anything worth remembering' });
	const cost = h('input', { type: 'number', min: 0, step: 'any', placeholder: '0.00' });
	const by = input('', { placeholder: 'Who did it (optional)' });
	const save = h('button', { class: 'ds-btn ds-wide' }, 'Save');
	const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
	const m = modal(E.ctx.root, `Service done — ${e.name}`, [field('What was done', chips), h('div', { class: 'ds-form-grid' }, field('Date', date), e.meter_unit !== 'none' ? field(e.meter_unit === 'miles' ? 'Odometer' : 'Hour meter', meter) : null, field('Cost ($)', cost), field('Done by', by)), field('Notes', note), save], close);
	save.onclick = async () => {
		if (!picks.size) return toast('Tick what was done.');
		save.disabled = true;
		try { await api('crm/equipment/done', { body: { id: e.id, tasks: [...picks], date: date.value, meter: e.meter_unit === 'none' ? '' : meter.value, note: note.value, cost: cost.value, by: by.value } }); m.remove(); toast('Logged. The next one is scheduled.'); reload(); } catch (x) { toast(x.message); save.disabled = false; }
	};
}

function editEquipment(e, data, reload) {
	const isNew = !e;
	const it = e ? JSON.parse(JSON.stringify(e)) : { name: '', type: '', meter_unit: 'hours', meter: 0, data: { fields: [] }, tasks: [] };
	it.data = { make: '', model: '', year: '', serial: '', plate: '', purchased: '', notes: '', fields: [], ...(it.data || {}) };
	const typeSel = h('select', { 'aria-label': 'Type' }, h('option', { value: '' }, 'Choose the type…'), ...data.catalog.map((c) => h('option', { value: c.id, selected: c.id === it.type }, `${c.icon} ${c.label}`)));
	const name = input(it.name, { placeholder: 'e.g. Mower #2, White F-250' });
	const unit = h('select', null, ...[['hours', 'Engine hours'], ['miles', 'Miles'], ['none', 'No meter (by date only)']].map(([k, l]) => h('option', { value: k, selected: k === it.meter_unit }, l)));
	const meter = h('input', { type: 'number', min: 0, step: 'any', value: it.meter });
	const d = it.data;
	const dIn = (k, ph) => input(d[k], { placeholder: ph || '', oninput: (ev) => { d[k] = ev.target.value; } });
	const purchased = h('input', { type: 'date', value: d.purchased || '', onchange: (ev) => { d.purchased = ev.target.value; } });
	const fbox = h('div');
	const drawF = () => { fbox.innerHTML = ''; d.fields.forEach((f, k) => fbox.append(h('div', { class: 'ds-row ds-inv-f' }, input(f.label, { placeholder: 'Field (e.g. Fleet #, Warranty ends)', oninput: (ev) => { f.label = ev.target.value; } }), input(f.value, { placeholder: 'Value', oninput: (ev) => { f.value = ev.target.value; } }), h('button', { class: 'ds-icon-btn', 'aria-label': 'Remove field', onclick: () => { d.fields.splice(k, 1); drawF(); } }, icon('close', 14))))); fbox.append(h('button', { class: 'ds-link', onclick: () => { d.fields.push({ label: '', value: '' }); drawF(); } }, '+ Add your own field')); };
	drawF();
	const tbox = h('div', { class: 'ds-eq-edit-tasks' });
	const drawT = () => {
		tbox.innerHTML = '';
		const u = unit.value;
		it.tasks.forEach((t, k) => tbox.append(h('div', { class: 'ds-eq-et' + (t.on ? '' : ' off') },
			h('div', { class: 'ds-row' }, h('input', { type: 'checkbox', checked: t.on !== false, 'aria-label': 'On', onchange: (ev) => { t.on = ev.target.checked; drawT(); } }), input(t.name, { 'aria-label': 'Task', oninput: (ev) => { t.name = ev.target.value; } }), h('button', { class: 'ds-icon-btn', 'aria-label': 'Remove task', onclick: () => { it.tasks.splice(k, 1); drawT(); } }, icon('close', 14))),
			h('div', { class: 'ds-row ds-wrap ds-eq-every' }, h('span', null, 'Every'),
				u !== 'none' ? h('input', { type: 'number', min: 0, step: 'any', value: t.meter || '', placeholder: '–', 'aria-label': unitWord(u), oninput: (ev) => { t.meter = +ev.target.value || 0; } }) : null, u !== 'none' ? h('span', null, unitWord(u) + ' and/or') : null,
				h('input', { type: 'number', min: 0, value: t.days || '', placeholder: '–', 'aria-label': 'days', oninput: (ev) => { t.days = +ev.target.value || 0; } }), h('span', null, 'days'),
				h('span', { class: 'ds-muted' }, '· last done'), h('input', { type: 'date', value: t.last_date || '', 'aria-label': 'Last done', oninput: (ev) => { t.last_date = ev.target.value; } }),
				u !== 'none' ? h('input', { type: 'number', min: 0, step: 'any', value: t.last_meter == null ? '' : t.last_meter, placeholder: `at ${unitShort(u)}`, 'aria-label': `Last done at ${unitWord(u)}`, oninput: (ev) => { t.last_meter = ev.target.value === '' ? null : +ev.target.value; } }) : null),
			t.how ? h('small', { class: 'ds-hint' }, t.how) : null)));
		tbox.append(h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => { it.tasks.push({ name: '', meter: 0, days: 90, on: true, how: '' }); drawT(); } }, '+ Add a task'));
	};
	typeSel.onchange = () => {
		const c = data.catalog.find((x) => x.id === typeSel.value);
		if (!c) return;
		if (!name.value.trim() || data.catalog.some((x) => x.label === name.value)) name.value = c.label;
		unit.value = c.unit;
		if (isNew || !it.tasks.length || confirm(`Replace the maintenance list with the usual ${c.label.toLowerCase()} tasks?`)) it.tasks = JSON.parse(JSON.stringify(c.tasks));
		drawT();
	};
	unit.onchange = drawT;
	drawT();
	const save = h('button', { class: 'ds-btn ds-wide' }, isNew ? 'Add equipment' : 'Save');
	const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
	const m = modal(E.ctx.root, isNew ? 'Add equipment' : `Edit ${it.name}`, [
		h('div', { class: 'ds-form-grid' }, field('Type', typeSel, isNew ? 'Pick one and its usual maintenance is filled in.' : ''), field('Name', name)),
		h('div', { class: 'ds-form-3' }, field('Make', dIn('make', 'e.g. Scag')), field('Model', dIn('model', 'e.g. Turf Tiger II')), field('Year', dIn('year'))),
		h('div', { class: 'ds-form-3' }, field('Serial / VIN', dIn('serial')), field('Plate', dIn('plate')), field('Bought', purchased)),
		h('div', { class: 'ds-form-grid' }, field('Meter', unit), field('Current reading', meter, 'Hours on the hour meter, or miles on the odometer.')),
		h('h4', null, 'Your own fields'), fbox,
		field('Notes', h('textarea', { rows: 2, oninput: (ev) => { d.notes = ev.target.value; } }, d.notes || '')),
		h('h4', null, 'Maintenance'), h('p', { class: 'ds-hint' }, 'Whichever comes first — hours/miles or days. Set “last done” if you know it, so the first reminder is right.'), tbox,
		h('div', { class: 'ds-row ds-wrap' }, save, !isNew ? h('button', { class: 'ds-btn ds-ghost ds-danger', onclick: async () => { if (!confirm(`Delete ${it.name} and its history?`)) return; await api('crm/equipment/delete', { body: { id: it.id } }).catch((x) => toast(x.message)); m.remove(); reload(); } }, 'Delete') : null)], close, 'ds-modal-wide');
	save.onclick = async () => {
		if (!typeSel.value) return toast('Choose the type of equipment.');
		save.disabled = true;
		try { await api('crm/equipment', { body: { id: it.id || 0, type: typeSel.value, name: name.value, meter_unit: unit.value, meter: meter.value, data: d, tasks: it.tasks.filter((t) => (t.name || '').trim()) } }); m.remove(); toast(isNew ? 'Added — reminders are on.' : 'Saved.'); reload(); } catch (x) { toast(x.message); save.disabled = false; }
	};
}

function settingsCard(box, data) {
	if (!box) return;
	box.innerHTML = '';
	const s = { ...data.settings };
	const chips = h('div', { class: 'ds-chips' });
	const draw = () => { chips.innerHTML = ''; for (const [k, l] of [['email', '✉️ Email'], ['sms', '💬 Text'], ['both', 'Both']]) chips.append(h('button', { type: 'button', class: 'ds-chip' + (s.channel === k ? ' on' : ''), disabled: k !== 'email' && !data.sms, onclick: () => { s.channel = k; draw(); } }, l)); };
	draw();
	const btn = h('button', { class: 'ds-btn ds-sm' }, 'Save reminder settings');
	btn.onclick = async () => { btn.disabled = true; try { await api('crm/equipment/settings', { body: s }); toast('Saved.'); } catch (e) { toast(e.message); } btn.disabled = false; };
	put(box, h('details', { class: 'ds-hub-card' }, h('summary', null, h('b', null, '⏰ Reminder settings')),
		h('label', { class: 'ds-check' }, h('input', { type: 'checkbox', checked: !!s.remind, onchange: (e) => { s.remind = e.target.checked; } }), ' Remind me about maintenance (one message a day at most, in working hours)'),
		field('Send by', chips),
		h('div', { class: 'ds-form-grid' },
			field('Warn me when this close (%)', h('input', { type: 'number', min: 0, max: 50, value: s.soon, oninput: (e) => { s.soon = +e.target.value || 0; } }), 'e.g. 10% = a 100-hour oil change shows “soon” at 90 hours.'),
			field('Ask for new readings after (days)', h('input', { type: 'number', min: 0, max: 90, value: s.meter_nudge, oninput: (e) => { s.meter_nudge = +e.target.value || 0; } }), 'Checked on Mondays. 0 = never ask.')),
		btn));
}

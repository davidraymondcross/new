/* DreamScaper – month calendar for the Contractor Hub.
 *
 * A classic month grid (Mon–Sun). Each day shows its appointments as small coloured chips
 * (up to 3, then "+N more"). Tapping a day opens a menu of what you can do on that day —
 * new job day, new appointment, estimate visit, door-to-door session, block time off, or see
 * the day's schedule. Tapping a chip opens that appointment. Keyboard: arrow keys move between
 * days, Enter opens the day menu.
 */
import { h, icon } from './util.js?v=2.7.7';
import { modal } from './capture.js?v=2.7.7';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const ymd = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const hm = (t) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** First day of the month containing t (local time). */
export function monthStart(t) { const d = new Date(t); d.setDate(1); d.setHours(0, 0, 0, 0); return d.getTime(); }
/** The grid's first and last instants (whole weeks around the month). */
export function monthRange(m0) {
	const d = new Date(m0);
	const first = new Date(d); first.setDate(1 - ((d.getDay() + 6) % 7));
	const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
	last.setDate(last.getDate() + (7 - ((last.getDay() + 6) % 7)) - 1);
	last.setHours(23, 59, 59, 999);
	return { from: first.getTime(), to: last.getTime() };
}

/**
 * The month grid.
 * o: { month (ms, any time in the month), items: visits [{id,start,end,title,kind,status,client}], kindIcon,
 *      hours: { start: 7, end: 17 }, onDay(dayMs), onItem(visit) }
 */
export function monthGrid(o) {
	const m0 = monthStart(o.month), { from, to } = monthRange(m0);
	const month = new Date(m0).getMonth(), today = ymd(Date.now());
	const byDay = {};
	for (const v of o.items) (byDay[ymd(v.start)] = byDay[ymd(v.start)] || []).push(v);
	for (const k in byDay) byDay[k].sort((a, b) => a.start - b.start);
	const cells = [];
	for (let t = from; t <= to; t += 864e5) {
		const d = new Date(t); d.setHours(12); // DST-safe stepping
		const key = ymd(d), list = byDay[key] || [];
		const off = d.getMonth() !== month;
		const busyH = list.filter((v) => v.status !== 'cancelled').reduce((s, v) => s + (v.end - v.start) / 36e5, 0);
		const dayMs = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
		const cell = h('div', {
			class: 'ds-mc-day' + (off ? ' off' : '') + (key === today ? ' today' : '') + (busyH >= (o.hours.end - o.hours.start) ? ' full' : ''),
			role: 'gridcell', tabindex: key === today || (!cells.length && !off) ? 0 : -1, 'data-day': key,
			'aria-label': `${d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}: ${list.length ? list.length + ' appointment' + (list.length > 1 ? 's' : '') : 'nothing booked'}. Press Enter for options.`,
			onclick: (e) => { if (!e.target.closest('.ds-mc-item')) o.onDay(dayMs); },
			onkeydown: (e) => {
				const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
				if (step) { e.preventDefault(); const all = [...grid.querySelectorAll('.ds-mc-day')], i = all.indexOf(cell), nx = all[i + step]; if (nx) { cell.tabIndex = -1; nx.tabIndex = 0; nx.focus(); } }
				if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); o.onDay(dayMs); }
			}
		},
		h('div', { class: 'ds-mc-num' }, h('b', null, String(d.getDate())), busyH ? h('small', null, `${Math.round(busyH * 10) / 10}h`) : null),
		...list.slice(0, 3).map((v) => h('button', { class: 'ds-mc-item ds-mc-' + (v.kind || 'other') + (v.status === 'cancelled' ? ' x' : '') + (v.status === 'done' ? ' done' : ''), title: `${hm(v.start)} ${v.title}${v.client ? ' · ' + v.client : ''}`, onclick: () => o.onItem(v) },
			h('span', { 'aria-hidden': 'true' }, (o.kindIcon && o.kindIcon[v.kind]) || '📅'), ` ${hm(v.start).replace(':00', '')} ${v.title}`)),
		list.length > 3 ? h('button', { class: 'ds-mc-more', onclick: () => o.onDay(dayMs) }, `+${list.length - 3} more`) : null);
		cells.push(cell);
	}
	const grid = h('div', { class: 'ds-mc-grid', role: 'grid', 'aria-label': new Date(m0).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) },
		...DOW.map((d) => h('div', { class: 'ds-mc-dow', role: 'columnheader' }, d)), ...cells);
	return grid;
}

/**
 * What can I do on this day? A short menu of actions that make sense for the date.
 * actions: [{ id, icon, label, sub, run(dayMs) }]; items: that day's visits; onItem(visit).
 */
export function dayMenu(root, dayMs, actions, items, onItem, hours) {
	const d = new Date(dayMs);
	const past = dayMs + 864e5 < Date.now();
	const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
	const busy = items.filter((v) => v.status !== 'cancelled').reduce((s, v) => s + (v.end - v.start) / 36e5, 0);
	const free = Math.max(0, (hours.end - hours.start) - busy);
	const m = modal(root, d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }), [
		h('p', { class: 'ds-hint' }, items.length ? `${items.length} booked · about ${Math.round(free * 10) / 10} of your ${hours.end - hours.start} working hours free (${fmtH(hours.start)}–${fmtH(hours.end)}).` : `Nothing booked yet — your working day is ${fmtH(hours.start)}–${fmtH(hours.end)}.`),
		past ? h('p', { class: 'ds-warn' }, 'This day has passed — you can still log something that happened.') : null,
		h('div', { class: 'ds-daymenu' }, ...actions.map((a) => h('button', { class: 'ds-daymenu-btn', onclick: () => { m.remove(); a.run(dayMs); } },
			h('span', { class: 'ds-daymenu-ic', 'aria-hidden': 'true' }, a.icon), h('span', null, h('b', null, a.label), a.sub ? h('small', null, a.sub) : null)))),
		items.length ? h('div', null, h('h4', null, 'Booked this day'), h('div', { class: 'ds-hub-list' }, ...items.map((v) =>
			h('button', { class: 'ds-hub-row', onclick: () => { m.remove(); onItem(v); } }, h('b', null, `${hm(v.start)}–${hm(v.end)} ${v.title}`), h('small', null, [v.client, v.crew ? '👷 ' + v.crew : '', v.status === 'cancelled' ? 'cancelled' : ''].filter(Boolean).join(' · ')))))) : null
	], close);
	return m;
}
const fmtH = (x) => { const hh = Math.floor(x), mm = Math.round((x - hh) * 60); const d = new Date(); d.setHours(hh, mm, 0, 0); return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: mm ? '2-digit' : undefined }); };

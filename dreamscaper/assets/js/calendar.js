/* DreamScaper – shared calendar.
 *
 * Homeowners: My Calendar (inside My Projects) shows every appointment any contractor books with
 * them, automatically. Confirm, ask to reschedule, add one to your phone, or subscribe once so
 * they all appear in Google / Apple / Outlook.
 * Contractors: the reminder-schedule editor (how often and how customers are reminded) and the
 * calendar-sync link for their own schedule.
 */
import { h, put, icon } from './util.js?v=2.7.2';
import { api } from './api.js?v=2.7.2';
import { modal } from './capture.js?v=2.7.2';
import { sectionHead, tip, lockNote, has, loadCaps, planPrompt, usageBar } from './explain.js?v=2.7.2';

let K = null;
export function initCalendar(ctx) { K = { ctx }; }
const toast = (m, ms) => K && K.ctx.toast(m, ms);
const dayFmt = (t) => new Date(t).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
const tm = (t) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const KIND_IC = { consult: '💬', site_visit: '📏', estimate: '🧾', job: '🛠️', maintenance: '✂️', followup: '🔁', meeting: '🤝', other: '📅' };
const gcal = (v) => {
	const f = (t) => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
	return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent((v.pro ? v.pro.business + ' — ' : '') + v.title) + '&dates=' + f(v.start) + '/' + f(v.end) + '&location=' + encodeURIComponent(v.location || '') + '&details=' + encodeURIComponent(v.kind_label + (v.project ? ': ' + v.project : '') + (v.pro && v.pro.phone ? '\n' + v.pro.business + ' · ' + v.pro.phone : ''));
};

/** One appointment, as the homeowner sees it, with Confirm / Reschedule / Add to calendar. */
export function apptCard(v, onChange) {
	const past = v.end < Date.now();
	const st = v.status === 'cancelled' ? ['✖️', 'Cancelled'] : v.status === 'done' ? ['✔️', 'Done'] : v.cust_status === 'confirmed' ? ['✅', 'You confirmed'] : v.cust_status === 'reschedule' ? ['🔁', 'You asked for a new time'] : ['🕒', 'Please confirm'];
	return h('div', { class: 'ds-appt' + (past ? ' past' : '') + (v.cust_status === '' && !past && v.status !== 'cancelled' ? ' needs' : '') },
		h('div', { class: 'ds-appt-date' }, h('b', null, new Date(v.start).getDate()), h('small', null, new Date(v.start).toLocaleDateString(undefined, { month: 'short' }))),
		h('div', { class: 'ds-grow' },
			h('b', null, `${KIND_IC[v.kind] || '📅'} ${v.kind_label}${v.project ? ' — ' + v.project : ''}`),
			h('small', null, `${dayFmt(v.start)}, ${tm(v.start)}–${tm(v.end)}`),
			v.pro ? h('small', null, '🧰 ', v.pro.business, v.pro.phone ? ' · ' : '', v.pro.phone ? h('a', { href: 'tel:' + v.pro.phone.replace(/[^\d+]/g, '') }, v.pro.phone) : null) : null,
			v.location ? h('small', null, '📍 ', v.location) : null,
			h('small', { class: 'ds-appt-st' }, st[0] + ' ' + st[1]),
			!past && v.status !== 'cancelled' ? h('div', { class: 'ds-row ds-wrap' },
				v.cust_status !== 'confirmed' ? h('button', { class: 'ds-btn ds-sm', onclick: (e) => respond(v, 'confirmed', '', e.currentTarget, onChange) }, '✅ Confirm') : null,
				h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => reschedule(v, onChange) }, '🔁 Ask for another time'),
				h('details', { class: 'ds-menu' }, h('summary', { class: 'ds-btn ds-ghost ds-sm' }, '📅 Add to my calendar'),
					h('div', { class: 'ds-menu-pop' }, h('a', { href: gcal(v), target: '_blank', rel: 'noopener' }, 'Google Calendar'), h('a', { href: v.ics, download: 'appointment.ics' }, 'Apple / Outlook (.ics file)')))) : null));
}

async function respond(v, action, note, btn, onChange) {
	if (btn) btn.disabled = true;
	try { await api('cal/respond', { body: { id: v.id, action, note } }); toast(action === 'confirmed' ? 'Confirmed — the contractor has been told.' : 'Sent. The contractor will reply with a new time.'); onChange && onChange(); } catch (e) { toast(e.message); if (btn) btn.disabled = false; }
}
function reschedule(v, onChange) {
	const note = h('textarea', { rows: 3, placeholder: 'e.g. Any weekday after 3 pm works, or Saturday morning.' });
	const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
	const go = h('button', { class: 'ds-btn ds-wide' }, 'Send');
	const m = modal(K.ctx.root, 'Ask for another time', [h('p', { class: 'ds-hint' }, `${v.pro ? v.pro.business : 'The contractor'} gets your note right away and will offer a new time. Your appointment stays on the calendar until they change it.`), note, go], close);
	go.onclick = async () => { go.disabled = true; await respond(v, 'reschedule', note.value, null, onChange); m.remove(); };
}

/** Subscribe-once panel: the private calendar feed for Google / Apple / Outlook. */
export async function syncSheet(forPro) {
	let r;
	try { r = await api('cal/feed'); } catch (e) { if (!planPrompt(e, toast)) toast(e.message); return; }
	const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
	const url = h('input', { type: 'text', readonly: true, value: r.url, onfocus: (e) => e.target.select() });
	const m = modal(K.ctx.root, 'Sync to your phone’s calendar', [
		h('p', null, forPro ? 'Your whole DreamScaper schedule — and any change you make — shows up in your own calendar app automatically.' : 'Every appointment a contractor books with you — and any change — shows up in your own calendar app automatically.'),
		h('div', { class: 'ds-row ds-wrap' },
			h('a', { class: 'ds-btn', href: r.webcal }, '🍎 Apple Calendar / Outlook'),
			h('a', { class: 'ds-btn ds-ghost', href: r.google, target: '_blank', rel: 'noopener' }, 'Google Calendar')),
		h('label', { class: 'ds-field' }, h('span', null, 'Or copy this private link into any calendar app (“Subscribe” / “From URL”)'), url),
		h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: async () => { try { await navigator.clipboard.writeText(url.value); toast('Copied.'); } catch (e) { url.select(); } } }, icon('copy', 16), ' Copy link'),
		h('p', { class: 'ds-hint' }, '🔒 Anyone with this link can see your appointment times. If you shared it by mistake, make a new one — the old link stops working.'),
		h('button', { class: 'ds-link', onclick: async () => { if (!confirm('Make a new link? The old one stops working.')) return; const n = await api('cal/feed', { body: {} }); url.value = n.url; toast('New link made. Re-subscribe with it.'); } }, 'Make a new private link')], close);
}

/** Homeowner: My Calendar (used inside My Projects). */
export async function myCalendar(box) {
	put(box, sectionHead('calendar', h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => syncSheet(false) }, '🔄 Sync to my phone')), tip('mycal', 'When a contractor books a visit with you, it lands here by itself — and they’ll remind you before it, on the schedule they set.'));
	const list = h('div', { class: 'ds-appts' }, h('span', { class: 'ds-spin' }));
	box.append(list);
	const load = async () => {
		try {
			const r = await api('cal/mine');
			list.innerHTML = '';
			const up = r.items.filter((v) => v.end >= Date.now() && v.status !== 'cancelled');
			const past = r.items.filter((v) => v.end < Date.now() || v.status === 'cancelled').reverse();
			if (!up.length) list.append(h('p', { class: 'ds-muted' }, 'No upcoming appointments. When a contractor books a site visit or a job day with you, it shows up here automatically.'));
			let day = '';
			for (const v of up) {
				const d = dayFmt(v.start);
				if (d !== day) { day = d; list.append(h('h4', { class: 'ds-appt-day' }, d)); }
				list.append(apptCard(v, load));
			}
			if (past.length) list.append(h('details', null, h('summary', null, `Past appointments (${past.length})`), ...past.slice(0, 30).map((v) => apptCard(v, load))));
		} catch (e) { list.innerHTML = ''; list.append(h('p', { class: 'ds-err' }, e.message)); }
	};
	load();
}

/* ------------------------------------------------------ contractor: reminders */

const UNITS = [[1, 'minutes'], [60, 'hours'], [1440, 'days']];
const splitBefore = (min) => (min % 1440 === 0 ? [min / 1440, 1440] : min % 60 === 0 ? [min / 60, 60] : [min, 1]);
const describe = (r, kinds) => { const [n, u] = splitBefore(r.before); return `${n} ${UNITS.find((x) => x[0] === u)[1].replace(/s$/, n === 1 ? '' : 's')} before · ${r.channels.map((c) => ({ email: 'email', sms: 'text', inapp: 'in-app' }[c])).join(' + ')}${r.kinds && r.kinds.length ? ' · only ' + r.kinds.map((k) => kinds[k]).join(', ') : ''}`; };

/** Settings → Reminders. */
export async function remindersEditor(pane) {
	pane.append(h('span', { class: 'ds-spin' }));
	let r;
	try { r = await api('crm/reminders'); await loadCaps(true); } catch (e) { pane.innerHTML = ''; pane.append(h('p', { class: 'ds-err' }, e.message)); return; }
	pane.innerHTML = '';
	const rules = { customer: r.rules.customer.map((x) => ({ ...x })), pro: r.rules.pro.map((x) => ({ ...x })) };
	const notify = h('input', { type: 'checkbox', checked: !!r.rules.notify });
	const lim = r.limit.limit;
	const boxC = h('div'), boxP = h('div');
	const ruleRow = (list, x, i, draw, aud) => {
		const [n, u] = splitBefore(x.before);
		const num = h('input', { type: 'number', min: 1, value: n, class: 'ds-price-in', 'aria-label': 'How long before' });
		const unit = h('select', { 'aria-label': 'Unit' }, ...UNITS.map(([v, l]) => h('option', { value: v, selected: v === u }, l)));
		const upd = () => { x.before = Math.max(5, (parseFloat(num.value) || 1) * +unit.value); sum.textContent = describe(x, r.kinds); };
		num.oninput = upd; unit.onchange = upd;
		const ch = (c, l, dis) => h('label', { class: 'ds-check' + (dis ? ' ds-dim' : '') }, h('input', { type: 'checkbox', checked: x.channels.includes(c), disabled: dis, onchange: (e) => { x.channels = e.target.checked ? [...new Set([...x.channels, c])] : x.channels.filter((y) => y !== c); upd(); } }), ' ' + l);
		const kinds = h('details', { class: 'ds-rem-kinds' }, h('summary', null, x.kinds && x.kinds.length ? 'Only some appointment types' : 'All appointment types'),
			...Object.entries(r.kinds).map(([k, l]) => h('label', { class: 'ds-check' }, h('input', { type: 'checkbox', checked: !x.kinds || !x.kinds.length || x.kinds.includes(k), onchange: (e) => { const all = Object.keys(r.kinds); let cur = x.kinds && x.kinds.length ? x.kinds.slice() : all.slice(); cur = e.target.checked ? [...new Set([...cur, k])] : cur.filter((y) => y !== k); x.kinds = cur.length === all.length ? [] : cur; upd(); kinds.querySelector('summary').textContent = x.kinds.length ? 'Only some appointment types' : 'All appointment types'; } }), ' ' + l)));
		const sum = h('small', { class: 'ds-hint' }, describe(x, r.kinds));
		return h('div', { class: 'ds-rem' }, h('div', { class: 'ds-row ds-wrap' }, h('b', null, `⏰ Reminder ${i + 1}`), num, unit, h('span', null, 'before'), h('div', { class: 'ds-spacer' }), h('button', { class: 'ds-link', onclick: () => { list.splice(i, 1); draw(); } }, 'Remove')),
			h('div', { class: 'ds-row ds-wrap' }, ch('email', 'Email'), ch('sms', r.sms ? 'Text' : 'Text (not on your plan / not set up)', !r.sms && !x.channels.includes('sms')), ch('inapp', 'In-app')), aud === 'customer' ? kinds : null, sum);
	};
	const drawC = () => { boxC.innerHTML = ''; rules.customer.forEach((x, i) => boxC.append(ruleRow(rules.customer, x, i, drawC, 'customer'))); boxC.append(lim >= 0 && rules.customer.length >= lim ? h('p', { class: 'ds-hint' }, `Your plan includes ${lim} reminder${lim === 1 ? '' : 's'} per appointment.`) : h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => { rules.customer.push({ before: 1440, channels: ['email'], kinds: [] }); drawC(); } }, '+ Add a reminder')); };
	const drawP = () => { boxP.innerHTML = ''; rules.pro.forEach((x, i) => boxP.append(ruleRow(rules.pro, x, i, drawP, 'pro'))); boxP.append(h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => { rules.pro.push({ before: 60, channels: ['inapp'], kinds: [] }); drawP(); } }, '+ Add a reminder for me')); };
	drawC(); drawP();
	const save = h('button', { class: 'ds-btn' }, 'Save reminder schedule');
	save.onclick = async () => {
		save.disabled = true;
		try { const x = await api('crm/reminders', { body: { customer: rules.customer, pro: rules.pro, notify: notify.checked } }); toast(`Saved. ${x.scheduled} reminder${x.scheduled === 1 ? '' : 's'} planned for your upcoming appointments.`, 4500); } catch (e) { if (!planPrompt(e, toast)) toast(e.message); }
		save.disabled = false;
	};
	put(pane, sectionHead('reminders'), usageBar('reminder_rules'),
		h('section', { class: 'ds-hub-card' }, h('h2', null, 'Reminders to your customers'),
			h('p', { class: 'ds-hint' }, 'Sent before every appointment, on this schedule. Texts never go out between 9 pm and 8 am — a reminder that would land overnight is sent at 8 pm the evening before instead. You can change the schedule for a single appointment when you book it.'), boxC,
			h('p', { class: 'ds-hint' }, '✏️ The wording is in Messages & alerts → Appointment reminder.')),
		h('section', { class: 'ds-hub-card' }, h('h2', null, 'Reminders to you'), boxP),
		h('section', { class: 'ds-hub-card' }, h('h2', null, 'When you book, move or cancel'), h('label', { class: 'ds-check' }, notify, ' Tell the customer automatically (their calendar updates either way)'),
			h('p', { class: 'ds-hint' }, 'Uses your “Appointment booked / changed / cancelled” messages. You can switch it off for one appointment when you book it.')),
		save,
		h('section', { class: 'ds-hub-card' }, h('h2', null, 'Your schedule in your own calendar'), has('calendar_feed') ? h('button', { class: 'ds-btn ds-ghost', onclick: () => syncSheet(true) }, '🔄 Sync to Google / Apple / Outlook') : lockNote('calendar_feed')));
}

/** One-line summary of an appointment's reminders, for the visit editor. */
export function reminderSummary(v) {
	if (!v || !v.reminders || !v.reminders.length) return null;
	const up = v.reminders.filter((x) => x.status === 'scheduled');
	const sent = v.reminders.filter((x) => x.status === 'sent');
	return h('p', { class: 'ds-hint' }, '⏰ ', up.length ? `${up.length} reminder${up.length > 1 ? 's' : ''} planned: ` + up.map((x) => `${{ email: 'email', sms: 'text', inapp: 'in-app' }[x.channel]}${x.audience === 'pro' ? ' (you)' : ''} ${new Date(x.at).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`).join(', ') : 'No reminders left to send.', sent.length ? ` · ${sent.length} already sent` : '');
}

/* DreamScaper – invoices (Contractor Hub): the invoice editor and the invoice designer.
 *
 * Editor: customer search, type, invoice date, due date with quick terms, repeats (weekly … yearly, or a
 * custom "every N days/weeks/months/years"), line items with details / date / unit / taxable, discount,
 * tax, custom fields, notes, payment instructions, terms, and the reminder plan (default, custom for this
 * invoice, or none) — each reminder before / on / after the due date by email, text or both, with your own
 * wording. A live preview shows exactly what the customer will get. Save & send by email, text or both.
 *
 * Designer (Settings → Invoice design): logo (upload or your profile logo), position and size, brand
 * color, font, layout, heading, which sections show and in what order, line-item columns, which details
 * appear, default custom fields / notes / terms / payment instructions / thank-you / footer, default tax
 * and due terms, and the default reminder plan. The server renders both previews, so they match the real thing.
 */
import { h, put, icon } from './util.js?v=2.7.8';
import { api } from './api.js?v=2.7.8';
import { modal, pickFile } from './capture.js?v=2.7.8';

let C = null;
const toast = (m, ms) => C && C.toast(m, ms);
const field = (label, el, hint) => h(el && el.querySelector && el.querySelector('button') ? 'div' : 'label', { class: 'ds-field' }, h('span', null, label), el, hint ? h('small', { class: 'ds-hint' }, hint) : null);
const input = (v, a = {}) => h('input', { type: 'text', value: v == null ? '' : v, ...a });
const select = (v, opts, a = {}) => h('select', a, ...opts.map(([k, l]) => h('option', { value: k, selected: String(k) === String(v) }, l)));
const money = (v) => '$' + Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ymd = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const addDays = (s, n) => ymd(new Date(s + 'T12:00').getTime() + n * 864e5);
const CODES = [['{customer_first_name}', 'First name'], ['{customer_name}', 'Customer'], ['{invoice_number}', 'Invoice #'], ['{invoice_title}', 'Title'], ['{invoice_amount}', 'Amount'], ['{invoice_due_date}', 'Due date'], ['{days_late}', 'Days late'], ['{days_until_due}', 'Days until due'], ['{invoice_link}', 'Pay link'], ['{company_name}', 'Your company'], ['{contractor_name}', 'Your name']];
const REPEATS = [['', 'One time'], ['weekly', 'Every week'], ['biweekly', 'Every 2 weeks'], ['monthly', 'Every month'], ['quarterly', 'Every 3 months'], ['yearly', 'Every year'], ['custom', 'Custom…']];
let designCache = null;
async function getDesign(force) { if (!designCache || force) designCache = await api('crm/invoice/design'); return designCache; }

/** Totals the same way the server does. */
export function calc(items, o) {
	let sub = 0, tx = 0;
	for (const it of items) { const a = (+it.qty || 0) * (+it.rate || 0); sub += a; if (it.taxable !== false) tx += a; }
	const dv = Math.max(0, +(o.discount && o.discount.value) || 0);
	const disc = o.discount && o.discount.type === 'pct' ? (sub * Math.min(100, dv)) / 100 : Math.min(sub, dv);
	const base = sub > 0 ? tx * (1 - disc / sub) : 0;
	const tax = Math.round(base * (+o.taxPct || 0)) / 100;
	return { subtotal: sub, discount: disc, tax, total: Math.round((sub - disc + tax) * 100) / 100 };
}

/* ================================================================ editor */

/** ctx: { root, toast, me, onSaved() } */
export async function editInvoice(i = {}, ctx) {
	C = ctx;
	let D;
	try { D = await getDesign(); } catch (e) { return toast(e.message); }
	const des = D.design;
	const ro = i.status === 'paid' || i.status === 'void';
	const o = JSON.parse(JSON.stringify(i.opts && Object.keys(i.opts).length ? i.opts : { taxPct: des.taxPct, fields: des.fields.map((f) => ({ ...f })), remind: 'default', discount: { type: 'amt', value: 0 } }));
	if (!o.fields) o.fields = [];
	if (!o.discount) o.discount = { type: 'amt', value: 0 };
	if (!o.remind) o.remind = 'default';
	if (!o.reminders || !o.reminders.length) o.reminders = des.reminders.map((r) => ({ ...r }));
	const items = (i.items && i.items.length ? i.items : [{ name: '', desc: '', qty: 1, unit: '', rate: 0, taxable: true }]).map((x) => ({ taxable: true, ...x }));
	let client = i.client_id || 0;
	const st = { recur: i.recur || '', every: o.every || { n: 6, unit: 'week' } };

	// customer search
	const cust = input(i.client || '', { placeholder: 'Type a customer’s name', list: 'ds-inv-cust', disabled: ro || !!i.quote_id, 'aria-label': 'Customer' });
	const custDl = h('datalist', { id: 'ds-inv-cust' });
	const custMap = new Map();
	let ct = 0;
	cust.addEventListener('input', () => {
		const v = cust.value.trim();
		if (custMap.has(v)) { client = custMap.get(v); refresh(); return; }
		client = 0;
		clearTimeout(ct);
		ct = setTimeout(async () => { try { const r = await api('crm/clients', { query: { q: v } }); custDl.innerHTML = ''; for (const c of r.items.slice(0, 10)) { custMap.set(c.name, c.id); custDl.append(h('option', { value: c.name })); } } catch (e) { /* offline */ } }, 200);
	});

	const kind = select(i.kind || 'final', [['deposit', 'Deposit'], ['progress', 'Progress'], ['final', 'Final'], ['recurring', 'Recurring / maintenance'], ['other', 'Other']], { disabled: ro });
	const title = input(i.title || '', { placeholder: 'e.g. Spring clean-up – final payment', disabled: ro });
	const date = h('input', { type: 'date', value: o.date || ymd(Date.now()), disabled: ro });
	const due = h('input', { type: 'date', value: i.due || addDays(date.value, des.netDays), disabled: ro });
	const terms = h('div', { class: 'ds-chips' }, ...[[0, 'On receipt'], [7, 'Net 7'], [15, 'Net 15'], [30, 'Net 30']].map(([n, l]) => h('button', { type: 'button', class: 'ds-chip', disabled: ro, onclick: () => { due.value = addDays(date.value, n); refresh(); } }, l)));
	const recur = select(st.recur, REPEATS, { disabled: ro });
	const everyN = h('input', { type: 'number', min: 1, max: 365, value: st.every.n, class: 'ds-inv-n', disabled: ro });
	const everyU = select(st.every.unit, [['day', 'days'], ['week', 'weeks'], ['month', 'months'], ['year', 'years']], { disabled: ro });
	const everyBox = h('div', { class: 'ds-row', hidden: st.recur !== 'custom' }, h('span', null, 'Every'), everyN, everyU);
	recur.onchange = () => { everyBox.hidden = recur.value !== 'custom'; if (recur.value && kind.value === 'final') kind.value = 'recurring'; refresh(); };

	// lines
	const ibox = h('div', { class: 'ds-inv-lines' });
	const showDate = des.columns.date, showUnit = des.columns.unit;
	const drawI = () => {
		ibox.innerHTML = '';
		items.forEach((x, k) => {
			const row = h('div', { class: 'ds-inv-l' },
				h('div', { class: 'ds-inv-lmain' },
					input(x.name, { placeholder: 'Item or service', disabled: ro, 'aria-label': 'Description', oninput: (e) => { x.name = e.target.value; refresh(); } }),
					h('input', { type: 'number', step: 'any', value: x.qty, disabled: ro, 'aria-label': 'Quantity', class: 'ds-inv-q', oninput: (e) => { x.qty = parseFloat(e.target.value) || 0; refresh(); } }),
					showUnit ? input(x.unit || '', { placeholder: 'unit', disabled: ro, class: 'ds-inv-u', 'aria-label': 'Unit', oninput: (e) => { x.unit = e.target.value; refresh(); } }) : null,
					h('input', { type: 'number', step: 'any', value: x.rate, disabled: ro, 'aria-label': 'Rate', class: 'ds-inv-r', oninput: (e) => { x.rate = parseFloat(e.target.value) || 0; refresh(); } }),
					h('b', { class: 'ds-inv-amt' }, money((+x.qty || 0) * (+x.rate || 0))),
					ro ? null : h('span', { class: 'ds-inv-btns' },
						h('button', { class: 'ds-icon-btn', 'aria-label': 'Move up', disabled: k === 0, onclick: () => { [items[k - 1], items[k]] = [items[k], items[k - 1]]; drawI(); refresh(); } }, '↑'),
						h('button', { class: 'ds-icon-btn', 'aria-label': 'Remove line', onclick: () => { items.splice(k, 1); if (!items.length) items.push({ name: '', qty: 1, rate: 0, taxable: true }); drawI(); refresh(); } }, icon('close', 14)))),
				h('div', { class: 'ds-inv-lmore' },
					h('textarea', { rows: 1, placeholder: 'Details (optional) — shown under the line', disabled: ro, oninput: (e) => { x.desc = e.target.value; refresh(); } }, x.desc || ''),
					showDate ? h('input', { type: 'date', value: x.date || '', disabled: ro, 'aria-label': 'Service date', oninput: (e) => { x.date = e.target.value; refresh(); } }) : null,
					+o.taxPct ? h('label', { class: 'ds-check' }, h('input', { type: 'checkbox', checked: x.taxable !== false, disabled: ro, onchange: (e) => { x.taxable = e.target.checked; refresh(); } }), ' Taxable') : null));
			ibox.append(row);
		});
		if (!ro) ibox.append(h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => { items.push({ name: '', desc: '', qty: 1, unit: '', rate: 0, taxable: true }); drawI(); refresh(); } }, '+ Add line'));
	};
	const discV = h('input', { type: 'number', min: 0, step: 'any', value: o.discount.value || '', placeholder: '0', disabled: ro, oninput: (e) => { o.discount.value = +e.target.value || 0; refresh(); } });
	const discT = select(o.discount.type, [['amt', '$'], ['pct', '%']], { disabled: ro, onchange: (e) => { o.discount.type = e.target.value; refresh(); } });
	const discL = input(o.discount.label || '', { placeholder: 'Label (e.g. Loyal customer discount)', disabled: ro, oninput: (e) => { o.discount.label = e.target.value; refresh(); } });
	const tax = h('input', { type: 'number', min: 0, max: 30, step: 'any', value: o.taxPct || '', placeholder: '0', disabled: ro, oninput: (e) => { o.taxPct = +e.target.value || 0; drawI(); refresh(); } });
	const totals = h('div', { class: 'ds-inv-tot' });

	// custom fields
	const fbox = h('div');
	const drawF = () => {
		fbox.innerHTML = '';
		o.fields.forEach((f, k) => fbox.append(h('div', { class: 'ds-row ds-inv-f' }, input(f.label, { placeholder: 'Label (e.g. PO number)', disabled: ro, oninput: (e) => { f.label = e.target.value; refresh(); } }), input(f.value, { placeholder: 'Value', disabled: ro, oninput: (e) => { f.value = e.target.value; refresh(); } }), ro ? null : h('button', { class: 'ds-icon-btn', 'aria-label': 'Remove field', onclick: () => { o.fields.splice(k, 1); drawF(); refresh(); } }, icon('close', 14)))));
		if (!ro) fbox.append(h('button', { class: 'ds-link', onclick: () => { o.fields.push({ label: '', value: '' }); drawF(); } }, '+ Add a field (PO number, job site, work order…)'));
	};
	const txt = (k, ph) => h('textarea', { rows: 2, placeholder: des[k] ? `Default: ${des[k].slice(0, 80)}${des[k].length > 80 ? '…' : ''}` : ph, disabled: ro, oninput: (e) => { o[k] = e.target.value; refresh(); } }, o[k] || '');

	// reminders
	const rbox = h('div');
	const drawR = () => {
		rbox.innerHTML = '';
		put(rbox, field('Reminders', h('div', { class: 'ds-chips' }, ...[['default', 'My default plan'], ['custom', 'Custom for this invoice'], ['off', 'No reminders']].map(([k, l]) => h('button', { type: 'button', class: 'ds-chip' + (o.remind === k ? ' on' : ''), disabled: ro, onclick: () => { o.remind = k; drawR(); } }, l)))));
		if (o.remind === 'default') put(rbox, h('p', { class: 'ds-hint' }, planSummary(des.reminders) + ' — change your default plan in Settings → Invoice design.'));
		if (o.remind === 'custom') put(rbox, reminderEditor(o.reminders, D.sms, ro, () => {}));
		if (o.remind === 'off') put(rbox, h('p', { class: 'ds-hint' }, 'No automatic reminders for this invoice.'));
	};

	// preview
	const frame = h('iframe', { class: 'ds-inv-frame', title: 'Invoice preview', sandbox: 'allow-same-origin' });
	const payload = () => ({ id: i.id || 0, quote_id: i.quote_id || 0, client_id: client, kind: kind.value, title: title.value, items: items.filter((x) => x.name.trim()), due: due.value, recur: recur.value, opts: { ...o, date: date.value, every: recur.value === 'custom' ? { n: +everyN.value || 1, unit: everyU.value } : o.every } });
	let pt = 0, seq = 0;
	const refresh = () => {
		const t = calc(items, o);
		totals.innerHTML = '';
		put(totals, h('div', null, h('span', null, 'Subtotal'), h('b', null, money(t.subtotal))), t.discount ? h('div', null, h('span', null, 'Discount'), h('b', null, '−' + money(t.discount))) : null, t.tax ? h('div', null, h('span', null, `Tax ${o.taxPct}%`), h('b', null, money(t.tax))) : null, h('div', { class: 'gt' }, h('span', null, 'Total'), h('b', null, money(t.total))));
		clearTimeout(pt);
		pt = setTimeout(async () => {
			const my = ++seq;
			try { const r = await api('crm/invoice/preview', { body: { invoice: { ...payload(), number: i.number, status: i.status || 'sent' } } }); if (my === seq) frame.srcdoc = r.html; } catch (e) { /* preview is optional */ }
		}, 350);
	};

	const msg = h('p', { class: 'ds-err' });
	const save = h('button', { class: 'ds-btn ds-ghost', disabled: ro }, 'Save draft');
	const send = h('button', { class: 'ds-btn', disabled: ro }, icon('send', 16), i.status === 'sent' ? ' Save & send again' : ' Save & send');
	const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
	const showPrev = h('button', { class: 'ds-btn ds-ghost ds-sm ds-inv-prevbtn', onclick: () => m.querySelector('.ds-inv-grid').classList.toggle('prev') }, '👁️ Preview');
	const form = h('div', { class: 'ds-inv-form' },
		h('div', { class: 'ds-form-grid' }, field('Customer', h('div', null, cust, custDl)), field('Type', kind)),
		field('Title', title),
		h('div', { class: 'ds-form-3' }, field('Invoice date', date), field('Due', due), field('Repeats', h('div', null, recur, everyBox))), terms,
		h('h4', null, 'Lines'), ibox,
		h('div', { class: 'ds-form-3' }, field('Discount', h('div', { class: 'ds-row' }, discV, discT)), field('Discount label', discL), field('Sales tax %', tax)),
		totals,
		ctx.me && ctx.me.connect && !ctx.me.connect.ready ? h('p', { class: 'ds-hint' }, 'Tip: connect Stripe in Settings → Get paid online so customers can pay this invoice by card or bank.') : null,
		h('details', { class: 'ds-inv-more' }, h('summary', null, '➕ Custom fields, notes, payment instructions & terms'),
			h('h4', null, 'Custom fields'), fbox,
			field('Notes', txt('notes', 'Anything the customer should know')),
			field('How to pay', txt('payment', 'e.g. Checks payable to … · Venmo @…')),
			field('Terms', txt('terms', 'Payment terms')),
			field('Thank-you message', txt('thanks', 'Thank you for your business!'))),
		h('details', { class: 'ds-inv-more', open: o.remind === 'custom' }, h('summary', null, '⏰ Reminders & messages'), rbox),
		msg,
		h('div', { class: 'ds-row ds-wrap ds-inv-actions' }, save, send,
			i.link && i.status !== 'draft' ? h('button', { class: 'ds-btn ds-ghost', onclick: () => navigator.clipboard.writeText(i.link).then(() => toast('Link copied.')).catch(() => prompt('Copy', i.link)) }, icon('link', 16), ' Copy link') : null,
			i.link && i.status !== 'draft' ? h('a', { class: 'ds-btn ds-ghost', href: i.link + (i.link.includes('?') ? '&' : '?') + 'print=1', target: '_blank', rel: 'noopener' }, '🖨️ Print / PDF') : null,
			i.id && (i.status === 'sent' || i.status === 'processing') ? h('button', { class: 'ds-btn ds-ghost', onclick: async () => { const how = prompt('Paid how? (cash, check #, Venmo…)', 'check'); if (how == null) return; try { await api('crm/invoice', { body: { ...payload(), status: 'paid', method: how } }); m.remove(); ctx.onSaved && ctx.onSaved(); } catch (x) { toast(x.message); } } }, '💰 Mark paid') : null,
			i.id && i.status !== 'paid' && i.status !== 'void' ? h('button', { class: 'ds-btn ds-ghost ds-danger', onclick: async () => { if (!confirm('Void this invoice?')) return; try { await api('crm/invoice', { body: { ...payload(), status: 'void' } }); m.remove(); ctx.onSaved && ctx.onSaved(); } catch (x) { toast(x.message); } } }, 'Void') : null));
	const m = modal(ctx.root, i.number ? `Invoice ${i.number}` : 'New invoice', [showPrev, h('div', { class: 'ds-inv-grid' }, form, h('div', { class: 'ds-inv-prev' }, h('small', { class: 'ds-muted' }, 'Live preview — exactly what the customer sees'), frame))], close, 'ds-modal-wide ds-modal-inv');
	drawI(); drawF(); drawR(); refresh();
	const doSave = async (andSend) => {
		msg.textContent = '';
		if (!client) { msg.textContent = 'Choose the customer (type their name and pick it from the list).'; return; }
		if (recur.value === 'custom' && !(+everyN.value >= 1)) { msg.textContent = 'Set how often the custom repeat goes out.'; return; }
		let how = null;
		if (andSend) { how = await sendDialog(ctx, D.sms); if (!how) return; }
		try {
			const r = await api('crm/invoice', { body: payload() });
			if (andSend) await api('crm/invoice/send', { body: { id: r.id, channel: how.channel, message: how.message } });
			m.remove();
			toast(andSend ? 'Invoice sent.' : 'Invoice saved.');
			ctx.onSaved && ctx.onSaved();
		} catch (x) { msg.textContent = x.message; }
	};
	save.onclick = async () => { save.disabled = true; await doSave(false); save.disabled = false; };
	send.onclick = async () => { send.disabled = true; await doSave(true); send.disabled = false; };
}
function planSummary(list) {
	const on = (list || []).filter((r) => r.on);
	if (!on.length) return 'Your default plan sends no reminders';
	return 'Default plan: ' + on.map((r) => `${r.when === 'on' ? 'on the due date' : `${r.days} day${r.days === 1 ? '' : 's'} ${r.when}`} (${r.channel === 'both' ? 'email + text' : r.channel === 'sms' ? 'text' : 'email'})`).join(', ');
}
/** Ask how to send: email, text or both, with an optional personal note. Resolves { channel, message } or null. */
function sendDialog(ctx, sms) {
	return new Promise((resolve) => {
		let ch = 'email';
		const chips = h('div', { class: 'ds-chips' });
		const draw = () => { chips.innerHTML = ''; for (const [k, l] of [['email', '✉️ Email'], ['sms', '💬 Text'], ['both', '✉️ + 💬 Both']]) chips.append(h('button', { type: 'button', class: 'ds-chip' + (ch === k ? ' on' : ''), disabled: k !== 'email' && !sms, onclick: () => { ch = k; draw(); } }, l)); };
		draw();
		const note = h('textarea', { rows: 3, placeholder: 'Optional: your own message instead of the usual one. Merge tags like {customer_first_name} and {invoice_link} work.' });
		const go = h('button', { class: 'ds-btn ds-wide' }, 'Send');
		const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => { m.remove(); resolve(null); } }, icon('close'));
		const m = modal(ctx.root, 'Send the invoice', [h('div', { class: 'ds-field' }, h('span', null, 'Send by'), chips), sms ? null : h('p', { class: 'ds-hint' }, 'Texts need text messaging set up and a plan that includes it.'), field('Message (optional)', note), go], close);
		go.onclick = () => { m.remove(); const t = note.value.trim(); resolve({ channel: ch, message: t ? { email: t, sms: t } : null }); };
	});
}

/** Edit a list of reminders in place. */
export function reminderEditor(list, sms, ro, changed) {
	const box = h('div', { class: 'ds-rem-list' });
	const draw = () => {
		box.innerHTML = '';
		list.sort((a, b) => off(a) - off(b));
		list.forEach((r, k) => {
			const body = h('div', { class: 'ds-rem-body', hidden: true });
			const sub = input(r.subject, { disabled: ro, oninput: (e) => { r.subject = e.target.value; changed(); } });
			const em = h('textarea', { rows: 5, disabled: ro, oninput: (e) => { r.email = e.target.value; changed(); } }, r.email);
			const sm = h('textarea', { rows: 2, disabled: ro, maxlength: 600, oninput: (e) => { r.sms = e.target.value; changed(); } }, r.sms);
			let last = em;
			for (const el of [sub, em, sm]) el.addEventListener('focus', () => { last = el; });
			put(body,
				h('div', { class: 'ds-chips ds-rem-codes' }, ...CODES.map(([c, l]) => h('button', { type: 'button', class: 'ds-chip ds-sm', disabled: ro, onclick: () => { const p = last.selectionStart || last.value.length; last.value = last.value.slice(0, p) + c + last.value.slice(p); last.dispatchEvent(new Event('input')); last.focus(); } }, l))),
				r.channel !== 'sms' ? field('Email subject', sub) : null, r.channel !== 'sms' ? field('Email', em) : null,
				r.channel !== 'email' ? field('Text message', sm, `${(r.sms || '').length} characters · “Reply STOP to opt out” is added automatically · texts never go out overnight`) : null,
				ro ? null : h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: async (e) => { e.currentTarget.disabled = true; try { const x = await api('crm/invoice/test', { body: { reminder: r } }); toast(x.sent ? `Test sent to you by ${x.channels.join(' & ')}.` : 'Not sent: ' + (x.errors || []).join(', ')); } catch (er) { toast(er.message); } e.currentTarget.disabled = false; } }, 'Send me a test'));
			box.append(h('div', { class: 'ds-rem' + (r.on ? '' : ' off') },
				h('div', { class: 'ds-row ds-wrap' },
					h('label', { class: 'ds-check' }, h('input', { type: 'checkbox', checked: r.on, disabled: ro, onchange: (e) => { r.on = e.target.checked; changed(); draw(); } })),
					r.when === 'on' ? null : h('input', { type: 'number', min: 0, max: 365, value: r.days, class: 'ds-inv-n', disabled: ro, 'aria-label': 'Days', onchange: (e) => { r.days = Math.max(0, +e.target.value || 0); changed(); draw(); } }),
					r.when === 'on' ? null : h('span', null, 'days'),
					select(r.when, [['before', 'before due'], ['on', 'on the due date'], ['after', 'after due']], { disabled: ro, onchange: (e) => { r.when = e.target.value; if (r.when === 'on') r.days = 0; changed(); draw(); } }),
					h('span', null, 'by'),
					select(r.channel, [['email', 'email'], ['sms', 'text'], ['both', 'email + text']], { disabled: ro, onchange: (e) => { r.channel = e.target.value; if (r.channel !== 'email' && !sms) toast('Texts need text messaging set up and a plan that includes it — this one will only go by email until then.', 6000); changed(); draw(); } }),
					h('button', { class: 'ds-link', onclick: () => { body.hidden = !body.hidden; } }, 'Edit message'),
					ro ? null : h('button', { class: 'ds-icon-btn', 'aria-label': 'Remove reminder', onclick: () => { list.splice(k, 1); changed(); draw(); } }, icon('close', 14))),
				body));
		});
		if (!ro) box.append(h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => { list.push({ on: true, when: 'after', days: 10, channel: 'email', subject: 'Reminder: invoice {invoice_number}', email: 'Hi {customer_first_name|there},\n\nA reminder that invoice {invoice_number} ({invoice_amount}) was due {invoice_due_date}.\n\nView & pay: {invoice_link}\n\n{company_name}', sms: '{company_name}: invoice {invoice_number} ({invoice_amount}) is past due. {invoice_link}' }); changed(); draw(); } }, '+ Add a reminder'));
	};
	const off = (r) => (r.when === 'before' ? -r.days : r.when === 'after' ? r.days : 0);
	draw();
	return box;
}

/* ================================================================ designer */

/** Settings → Invoice design. */
export async function invoiceDesigner(pane, ctx) {
	C = ctx;
	pane.innerHTML = '';
	let D;
	try { D = await getDesign(true); } catch (e) { return put(pane, h('p', { class: 'ds-warn' }, e.message)); }
	const d = JSON.parse(JSON.stringify(D.design));
	let newLogo = null; // data URL until saved
	const frame = h('iframe', { class: 'ds-inv-frame', title: 'Invoice preview', sandbox: 'allow-same-origin' });
	let pt = 0, seq = 0;
	const prev = () => { clearTimeout(pt); pt = setTimeout(async () => { const my = ++seq; try { const r = await api('crm/invoice/preview', { body: { design: { ...d, logo: newLogo != null ? newLogo : d.logo } } }); if (my === seq) frame.srcdoc = r.html; } catch (e) { /* optional */ } }, 300); };
	const chip = (val, opts, set) => { const box = h('div', { class: 'ds-chips' }); const draw = () => { box.innerHTML = ''; for (const [k, l] of opts) box.append(h('button', { type: 'button', class: 'ds-chip' + (val() === k ? ' on' : ''), onclick: () => { set(k); draw(); prev(); } }, l)); }; draw(); return box; };
	const tgl = (grp, k, l) => h('label', { class: 'ds-check' }, h('input', { type: 'checkbox', checked: !!d[grp][k], onchange: (e) => { d[grp][k] = e.target.checked; prev(); } }), ' ' + l);
	const t = (k, rows, ph) => h('textarea', { rows, placeholder: ph || '', oninput: (e) => { d[k] = e.target.value; prev(); } }, d[k] || '');
	const logoImg = h('img', { class: 'ds-inv-logo', alt: '', hidden: !(d.logo || D.logo) });
	logoImg.src = d.logo || D.logo || '';
	const secs = h('div', { class: 'ds-inv-secs' });
	const drawSecs = () => {
		secs.innerHTML = '';
		d.sections.forEach((s, k) => secs.append(h('div', { class: 'ds-inv-sec' + (s.on ? '' : ' off') },
			h('label', { class: 'ds-check ds-grow' }, h('input', { type: 'checkbox', checked: s.on, onchange: (e) => { s.on = e.target.checked; drawSecs(); prev(); } }), ' ' + D.sections[s.id]),
			h('button', { class: 'ds-icon-btn', 'aria-label': 'Move up', disabled: k === 0, onclick: () => { [d.sections[k - 1], d.sections[k]] = [d.sections[k], d.sections[k - 1]]; drawSecs(); prev(); } }, '↑'),
			h('button', { class: 'ds-icon-btn', 'aria-label': 'Move down', disabled: k === d.sections.length - 1, onclick: () => { [d.sections[k + 1], d.sections[k]] = [d.sections[k], d.sections[k + 1]]; drawSecs(); prev(); } }, '↓'))));
	};
	drawSecs();
	const fbox = h('div');
	const drawF = () => { fbox.innerHTML = ''; d.fields.forEach((f, k) => fbox.append(h('div', { class: 'ds-row ds-inv-f' }, input(f.label, { placeholder: 'Label (e.g. PO number)', oninput: (e) => { f.label = e.target.value; prev(); } }), input(f.value, { placeholder: 'Default value (optional)', oninput: (e) => { f.value = e.target.value; prev(); } }), h('button', { class: 'ds-icon-btn', 'aria-label': 'Remove', onclick: () => { d.fields.splice(k, 1); drawF(); prev(); } }, icon('close', 14))))); fbox.append(h('button', { class: 'ds-link', onclick: () => { d.fields.push({ label: '', value: '' }); drawF(); } }, '+ Add a field to every invoice')); };
	drawF();
	const saveBtn = h('button', { class: 'ds-btn' }, 'Save invoice design');
	saveBtn.onclick = async () => {
		saveBtn.disabled = true;
		try { const r = await api('crm/invoice/design', { body: { design: { ...d, ...(newLogo != null ? { logo: newLogo } : {}) } } }); Object.assign(d, r.design); newLogo = null; designCache = null; toast('Invoice design saved.'); } catch (e) { toast(e.message); }
		saveBtn.disabled = false;
	};
	const form = h('div', { class: 'ds-inv-form' },
		h('div', { class: 'ds-hub-card' }, h('h2', null, '🎨 Look'),
			h('div', { class: 'ds-row ds-wrap' }, logoImg,
				h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: async () => { const s = await pickFile(); if (!s || !s.bitmap) return; const c = s.bitmap; const k = Math.min(1, 600 / Math.max(c.width, c.height)); const o = document.createElement('canvas'); o.width = Math.round(c.width * k); o.height = Math.round(c.height * k); o.getContext('2d').drawImage(c, 0, 0, o.width, o.height); newLogo = o.toDataURL('image/png'); logoImg.src = newLogo; logoImg.hidden = false; prev(); } }, '🖼️ Upload logo'),
				h('button', { class: 'ds-link', onclick: () => { newLogo = ''; logoImg.src = D.logo || ''; logoImg.hidden = !D.logo; prev(); } }, D.logo ? 'Use my profile logo' : 'Remove logo')),
			field('Logo position', chip(() => d.logoPos, [['left', 'Left'], ['center', 'Center'], ['right', 'Right']], (v) => { d.logoPos = v; })),
			field('Logo size', chip(() => d.logoSize, [['S', 'Small'], ['M', 'Medium'], ['L', 'Large']], (v) => { d.logoSize = v; })),
			field('Layout', chip(() => d.layout, [['classic', 'Classic'], ['modern', 'Modern'], ['compact', 'Compact'], ['bold', 'Bold']], (v) => { d.layout = v; })),
			h('div', { class: 'ds-form-3' },
				field('Brand color', h('input', { type: 'color', value: d.color, oninput: (e) => { d.color = e.target.value; prev(); } })),
				field('Font', select(d.font, Object.entries(D.fonts), { onchange: (e) => { d.font = e.target.value; prev(); } })),
				field('Heading', input(d.heading, { oninput: (e) => { d.heading = e.target.value; prev(); } }))),
			field('License / registration line', input(d.license, { placeholder: 'e.g. CT HIC #0654321 · Licensed & insured', oninput: (e) => { d.license = e.target.value; prev(); } }))),
		h('div', { class: 'ds-hub-card' }, h('h2', null, '📐 Sections & order'), h('p', { class: 'ds-hint' }, 'Tick what appears and use the arrows to move sections up or down the page.'), secs,
			h('h4', null, 'Line item columns'), h('div', { class: 'ds-row ds-wrap' }, tgl('columns', 'date', 'Date'), tgl('columns', 'qty', 'Qty'), tgl('columns', 'unit', 'Unit'), tgl('columns', 'rate', 'Rate'), tgl('columns', 'amount', 'Amount')),
			h('h4', null, 'Details to show'), h('div', { class: 'ds-row ds-wrap' }, tgl('show', 'address', 'Your address'), tgl('show', 'phone', 'Your phone'), tgl('show', 'email', 'Your email'), tgl('show', 'website', 'Your website'), tgl('show', 'license', 'License line'), tgl('show', 'cust_phone', 'Customer phone'), tgl('show', 'cust_email', 'Customer email'), tgl('show', 'service_address', 'Service address'), tgl('show', 'paid_stamp', '“PAID” stamp'))),
		h('div', { class: 'ds-hub-card' }, h('h2', null, '📝 Default content'),
			h('h4', null, 'Custom fields on every invoice'), fbox,
			field('Notes', t('notes', 2, 'e.g. Thanks for letting us care for your yard this season.')),
			field('How to pay', t('payment', 2, 'e.g. Pay online with the button, or checks payable to Green Acres LLC.')),
			field('Terms', t('terms', 3)), field('Thank-you message', t('thanks', 1)), field('Footer', t('footer', 1, 'e.g. Green Acres LLC · 1 Yard Rd · Licensed & insured')),
			h('div', { class: 'ds-form-grid' }, field('Default sales tax %', h('input', { type: 'number', min: 0, max: 30, step: 'any', value: d.taxPct, oninput: (e) => { d.taxPct = +e.target.value || 0; prev(); } })), field('Default due in (days)', h('input', { type: 'number', min: 0, max: 120, value: d.netDays, oninput: (e) => { d.netDays = +e.target.value || 0; prev(); } })))),
		h('div', { class: 'ds-hub-card' }, h('h2', null, '⏰ Default reminder plan'), h('p', { class: 'ds-hint' }, 'Sent automatically for every invoice that isn’t paid yet — unless you choose a custom plan or none on the invoice. Reminders stop the moment it’s paid.'), reminderEditor(d.reminders, D.sms, false, () => {})),
		saveBtn);
	put(pane, h('div', { class: 'ds-inv-grid' }, form, h('div', { class: 'ds-inv-prev ds-inv-prev-sticky' }, h('small', { class: 'ds-muted' }, 'Live preview (sample customer)'), frame)));
	prev();
}

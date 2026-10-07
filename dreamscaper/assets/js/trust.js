/* DreamScaper – "🔒 Contractor notes" on a customer page (contractors only).
 *
 * Factual records other contractors have made about this customer (a short summary, never who
 * made them), the records this contractor made (with confirm / withdraw), and a form to record a
 * new one — always tied to one of their own invoices, appointments or signed quotes. The first
 * time, the contractor reads and accepts the rules (confidential, factual only, disputes, Terms of
 * Service). Homeowners never see this; the server refuses it to anyone but approved contractors.
 */
import { h, put } from './util.js?v=2.7.3';
import { api, session } from './api.js?v=2.7.3';

const RULES = [
	'Only record what actually happened, tied to your own invoice, appointment or signed quote. No opinions, no names, no comments about the person.',
	'Records are confidential. Never show, screenshot or repeat them to a customer or anyone outside your business — misuse ends your contractor account.',
	'Other contractors see only a short summary (what and when), never who recorded it. You see the same about records others made.',
	'Customers can ask for their data and dispute a record. Disputed records are hidden while the site owner reviews them. Records expire after 24 months.',
	'Every time records are viewed it is logged.'
];

/** Fill `pane` with the contractor notes for customer `c`. ctx: { toast } */
export async function trustPane(pane, c, ctx = {}) {
	const toast = ctx.toast || ((m) => alert(m));
	pane.innerHTML = '';
	put(pane, h('span', { class: 'ds-spin' }));
	let d;
	try {
		d = await api('crm/flags', { query: { client_id: c.id } });
	} catch (e) {
		pane.innerHTML = '';
		if (e.data && e.data.code === 'dreamscaper_flag_terms') return put(pane, rulesCard(() => trustPane(pane, c, ctx), toast));
		return put(pane, h('p', { class: 'ds-warn' }, e.message));
	}
	pane.innerHTML = '';
	const reload = () => trustPane(pane, c, ctx);
	const others = d.summary.filter((s) => !s.mine);
	put(pane,
		h('p', { class: 'ds-tr-private' }, '🔒 Contractors only — the customer never sees this page. Keep it confidential.'),
		h('section', { class: 'ds-hub-card' }, h('h2', null, 'What other contractors recorded'),
			others.length
				? h('ul', { class: 'ds-tr-list' }, ...others.map((s) => h('li', null, h('b', null, s.label), h('small', { class: 'ds-muted' }, ' · ' + s.month))))
				: h('p', { class: 'ds-muted' }, '✅ Nothing recorded by other contractors in the last 24 months.'),
			h('p', { class: 'ds-hint' }, 'Records are facts, not ratings — use them to set clear terms (a deposit, payment on completion), not to judge the person.')),
		mineCard(d, reload, toast),
		addCard(c, d, reload, toast));
}

function rulesCard(done, toast) {
	const ok = h('input', { type: 'checkbox' });
	const go = h('button', { class: 'ds-btn', disabled: true }, 'Turn on contractor notes');
	ok.onchange = () => { go.disabled = !ok.checked; };
	go.onclick = async () => {
		go.disabled = true;
		try { await api('crm/flags/terms', { body: {} }); done(); } catch (e) { toast(e.message); go.disabled = false; }
	};
	const url = (session.terms && session.terms.url) || '#';
	return h('section', { class: 'ds-hub-card ds-tr-rules' },
		h('h2', null, '🔒 Contractor-only customer records'),
		h('p', null, 'Contractors can share short, factual records about customers — like an invoice that went unpaid for 60 days or a no-show — so everyone can set fair terms. The rules:'),
		h('ol', null, ...RULES.map((r) => h('li', null, r))),
		h('label', { class: 'ds-check ds-agree' }, ok, ' I’ve read these rules and the ', h('a', { href: url, target: '_blank', rel: 'noopener' }, 'Terms of Service'), ' and agree to follow them.'),
		go);
}

function mineCard(d, reload, toast) {
	const act = async (f, action, btn) => {
		if (action === 'withdraw' && !confirm('Withdraw this record? Other contractors will no longer see it.')) return;
		btn.disabled = true;
		try { await api('crm/flags', { body: { id: f.id, action } }); toast(action === 'confirm' ? 'Record confirmed.' : 'Record withdrawn.'); reload(); } catch (e) { toast(e.message); btn.disabled = false; }
	};
	const st = { active: '✔ Shared', suggested: '💡 Suggested — confirm?', disputed: '⚖️ Disputed — under review' };
	return h('section', { class: 'ds-hub-card' }, h('h2', null, 'Your records'),
		d.mine.length
			? h('div', { class: 'ds-hub-list' }, ...d.mine.map((f) => {
				const b1 = f.status === 'suggested' ? h('button', { class: 'ds-btn ds-sm', onclick: (e) => act(f, 'confirm', e.currentTarget) }, 'Confirm') : null;
				const b2 = h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: (e) => act(f, 'withdraw', e.currentTarget) }, f.status === 'suggested' ? 'Dismiss' : 'Withdraw');
				return h('div', { class: 'ds-hub-row' }, h('b', null, f.label), h('small', null, [f.occurred, f.amount ? '$' + f.amount.toFixed(2) : '', st[f.status] || f.status].filter(Boolean).join(' · ')), h('span', { class: 'ds-row' }, b1, b2));
			}))
			: h('p', { class: 'ds-muted' }, 'You haven’t recorded anything for this customer.'),
		h('p', { class: 'ds-hint' }, 'DreamScaper suggests a record when one of your invoices is 60+ days overdue or was paid 30+ days late, and removes it when it’s paid. Nothing is shared until you confirm.'));
}

function addCard(c, d, reload, toast) {
	const kind = h('select', null, h('option', { value: '' }, 'What happened?'), ...d.kinds.map((k) => h('option', { value: k.key }, k.label)));
	const ref = h('select', { disabled: true }, h('option', { value: '' }, 'Pick the record first'));
	const save = h('button', { class: 'ds-btn', disabled: true }, 'Record it');
	const need = { invoice: 'invoice', visit: 'appointment', quote: 'signed quote' };
	kind.onchange = () => {
		const k = d.kinds.find((x) => x.key === kind.value);
		ref.innerHTML = '';
		if (!k) { ref.disabled = true; ref.append(h('option', { value: '' }, 'Pick the record first')); save.disabled = true; return; }
		const list = d.refs[k.needs] || [];
		ref.disabled = !list.length;
		ref.append(h('option', { value: '' }, list.length ? `Which ${need[k.needs]}?` : `No ${need[k.needs]}s for this customer yet`), ...list.map((r) => h('option', { value: r.id }, r.label)));
		save.disabled = true;
	};
	ref.onchange = () => { save.disabled = !ref.value; };
	save.onclick = async () => {
		save.disabled = true;
		try { await api('crm/flags', { body: { client_id: c.id, kind: kind.value, ref_id: Number(ref.value) } }); toast('Recorded.'); reload(); } catch (e) { toast(e.message); save.disabled = false; }
	};
	return h('section', { class: 'ds-hub-card' }, h('h2', null, 'Record something that happened'),
		h('div', { class: 'ds-form-2' }, h('label', { class: 'ds-field' }, h('span', null, 'What happened'), kind), h('label', { class: 'ds-field' }, h('span', null, 'Which record shows it'), ref)),
		h('p', { class: 'ds-hint' }, 'DreamScaper checks the record (for example that the invoice really is 60+ days overdue) before it’s shared.'),
		save);
}

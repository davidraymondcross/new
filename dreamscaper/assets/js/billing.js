/* DreamScaper – Plan & billing (Contractor Hub).
 *
 * Start the free trial (verify email + phone, then a card that isn't charged until the trial ends),
 * choose or change a plan, see usage against every limit, update the card / see invoices / cancel
 * (Stripe's portal), and export everything — always, even when paused.
 */
import { h, put, icon } from './util.js?v=2.7.0';
import { api, session, refreshSession } from './api.js?v=2.7.0';
import { modal } from './capture.js?v=2.7.0';
import { sectionHead, loadCaps, usageBar } from './explain.js?v=2.7.0';

let B = null;
export function initBilling(ctx) { B = { ctx }; }
const toast = (m, ms) => B && B.ctx.toast(m, ms);
const money = (v) => '$' + Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 });
const date = (t) => new Date(t).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });

/** A light, stable device id (a weak signal for trial abuse; never used alone). */
function deviceId() {
	let id = '';
	try { id = localStorage.getItem('ds_dev') || ''; if (!id) { id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join(''); localStorage.setItem('ds_dev', id); } } catch (e) { /* storage off */ }
	const s = [id, navigator.userAgent, screen.width + 'x' + screen.height, Intl.DateTimeFormat().resolvedOptions().timeZone, navigator.language].join('|');
	let hsh = 0;
	for (let i = 0; i < s.length; i++) hsh = (Math.imul(31, hsh) + s.charCodeAt(i)) | 0;
	return (id || 'x') + (hsh >>> 0).toString(16);
}

/** Banner across the top of the hub: trial days left, past due, paused, not started. */
export function subBanner(onPlans) {
	const s = session.crm && session.crm.pro && session.crm.pro.sub;
	if (!s || !s.billing_on || s.status === 'comped' || s.status === 'active') return null;
	const msg = {
		none: ['🎁', 'Start your free 30-day trial to use the Contractor Hub.', 'Start free trial'],
		trialing: ['🎁', `Free trial — ${s.trial_days_left} day${s.trial_days_left === 1 ? '' : 's'} left on the ${s.plan} plan.`, 'Choose a plan'],
		past_due: ['⚠️', 'Your last payment didn’t go through. Everything still works — please update your card so your account isn’t paused.', 'Update card'],
		paused: ['⏸️', 'Your account is paused. You can view and export everything; nothing has been deleted. Update your card to switch everything back on.', 'Fix billing'],
		cancelled: ['🗂️', 'Your subscription has ended. Your records are safe — view and export them, or choose a plan to start working again.', 'Choose a plan']
	}[s.status];
	if (!msg) return null;
	return h('div', { class: 'ds-subbar ds-subbar-' + s.status + (s.status === 'trialing' && s.trial_days_left > 7 ? ' calm' : '') }, h('span', null, msg[0]), h('p', null, msg[1]), h('button', { class: 'ds-btn ds-sm', onclick: onPlans }, msg[2]));
}

/** After Stripe Checkout returns (?ds_sub=…): record it right away. */
export async function confirmReturn(sessionId) {
	try {
		const r = await api('sub/confirm', { method: 'POST', query: { session: sessionId } });
		await refreshSession();
		toast(r.status === 'trialing' ? `🎉 Your free trial has started — ${r.trial_days_left} days on the ${r.plan_name} plan.` : r.status === 'active' ? `🎉 You’re on the ${r.plan_name} plan. Thank you!` : r.status === 'none' ? 'That card has already been used for a free trial, so we cancelled it — you weren’t charged. You can choose a plan any time.' : 'Thanks! Your plan is being set up.', 8000);
	} catch (e) { toast(e.message, 6000); }
}

/** The Plan & billing tab. */
export async function billingView(b) {
	b.append(h('span', { class: 'ds-spin' }));
	let s;
	try { s = await api('sub/status'); await loadCaps(true); } catch (e) { b.innerHTML = ''; b.append(h('p', { class: 'ds-err' }, e.message)); return; }
	b.innerHTML = '';
	let billing = s.billing || 'month';
	const status = {
		comped: ['🎁', 'Free access', 'You have full access at no charge.'],
		none: ['🎁', 'Free trial available', `Try the ${planName(s, s.trial_plan)} plan free for ${s.trial_length} days. Add a card to start — it isn’t charged until the trial ends, and we remind you a week before and the day before.`],
		trialing: ['🎁', `Free trial · ${s.trial_days_left} day${s.trial_days_left === 1 ? '' : 's'} left`, s.has_card ? `Your ${planName(s, s.paid_plan)} plan starts on ${date(s.trial_ends)} on the card you added, unless you change or cancel it.` : `Your trial ends on ${date(s.trial_ends)}. Choose a plan before then to keep everything running without a break.`],
		active: ['✅', `${s.plan_name} plan`, s.cancel_at ? `Ends on ${date(s.cancel_at)}. You keep full access until then.` : s.period_end ? `Renews on ${date(s.period_end)}.` : ''],
		past_due: ['⚠️', 'Payment failed', `Your card was declined. Everything keeps working until ${s.pause_on ? date(s.pause_on) : 'the grace period ends'} — update your card to avoid a pause.`],
		paused: ['⏸️', 'Paused', 'A payment didn’t go through, so your account is read-only. Nothing has been deleted — update your card and everything switches back on instantly. Follow-ups that were due while paused will wait for you to review.'],
		cancelled: ['🗂️', 'Subscription ended', `Your records are kept for at least ${s.retention_months} months. View and export them any time; choose a plan to start working again.`]
	}[s.status] || ['', s.status, ''];
	const hero = h('section', { class: 'ds-hub-card ds-plan-hero ds-plan-' + s.status }, h('div', { class: 'ds-row' }, h('span', { class: 'ds-plan-ic' }, status[0]), h('div', { class: 'ds-grow' }, h('h2', null, status[1]), h('p', null, status[2]))),
		h('div', { class: 'ds-row ds-wrap' },
			s.has_card ? h('button', { class: 'ds-btn', onclick: (e) => portal(e.currentTarget) }, s.status === 'past_due' || s.status === 'paused' ? '💳 Update my card' : '💳 Card, invoices & receipts') : null,
			s.has_card && s.status !== 'comped' && !s.cancel_at && ['active', 'trialing', 'past_due'].includes(s.status) ? h('button', { class: 'ds-btn ds-ghost', onclick: () => cancelFlow(s) }, 'Cancel subscription') : null,
			s.cancel_at ? h('button', { class: 'ds-btn', onclick: async (e) => { e.currentTarget.disabled = true; try { await api('sub/cancel', { body: { undo: true } }); toast('Great — your subscription continues.'); refresh(b); } catch (x) { toast(x.message); } } }, 'Keep my subscription') : null));
	if (!s.billing_on) {
		put(b, sectionHead('plan'), h('section', { class: 'ds-hub-card' }, h('h2', null, '🎁 Everything is included'), h('p', null, 'Billing isn’t switched on on this website, so you have the full Contractor Hub at no charge.')), exportsCard());
		return;
	}
	const toggle = h('div', { class: 'ds-chips ds-billing-toggle' }, ...[['month', 'Monthly'], ['year', 'Yearly · 2 months free']].map(([k, l]) => h('button', { class: 'ds-chip' + (billing === k ? ' on' : ''), onclick: (e) => { billing = k; for (const c of toggle.children) c.classList.remove('on'); e.currentTarget.classList.add('on'); drawPlans(); } }, l)));
	const grid = h('div', { class: 'ds-plans' });
	const cat = s.features;
	const drawPlans = () => {
		grid.innerHTML = '';
		for (const p of s.plans) {
			const cur = (s.status === 'active' || s.status === 'past_due' || (s.status === 'trialing' && s.has_card)) && s.paid_plan === p.key && s.billing === billing;
			const price = billing === 'year' ? p.year : p.month;
			const lines = Object.values(cat).map((f) => {
				const v = p.f[f.key];
				if (f.type === 'limit') return h('li', { class: v === 0 ? 'no' : '' }, v < 0 ? `Unlimited ${f.label.toLowerCase()}` : `${v.toLocaleString()} ${f.label.toLowerCase()}`);
				return h('li', { class: v ? '' : 'no' }, (v ? '✓ ' : '— ') + f.label);
			});
			const action = cur ? h('span', { class: 'ds-qs' }, 'Your plan')
				: !p.buyable[billing] ? h('small', { class: 'ds-muted' }, 'Not available yet')
				: s.status === 'none' && s.trial && s.trial.ok && p.key === s.trial_plan ? h('button', { class: 'ds-btn ds-wide', onclick: () => startTrial(s, p, billing) }, `Start ${s.trial_length}-day free trial`)
				: s.has_card && ['active', 'trialing', 'past_due'].includes(s.status) ? h('button', { class: 'ds-btn ds-ghost ds-wide', onclick: (e) => change(e.currentTarget, p, billing, b) }, `Switch to ${p.name}`)
				: h('button', { class: 'ds-btn ds-wide', onclick: (e) => checkout(e.currentTarget, p, billing, false) }, `Choose ${p.name}`);
			grid.append(h('div', { class: 'ds-plan' + (cur ? ' cur' : '') + (p.key === 'pro' ? ' pop' : '') },
				p.key === 'pro' ? h('small', { class: 'ds-plan-pop' }, 'Most popular') : null,
				h('h3', null, p.name), h('p', { class: 'ds-muted' }, p.tag),
				h('p', { class: 'ds-plan-price' }, h('b', null, money(price)), h('small', null, billing === 'year' ? ' / year' : ' / month')),
				action, h('ul', { class: 'ds-plan-list' }, ...lines)));
		}
	};
	drawPlans();
	const usage = h('section', { class: 'ds-hub-card' }, h('h2', null, 'Your usage'), h('p', { class: 'ds-hint' }, 'Limits reset on the 1st of each month. Reaching one never deletes anything — it only stops you adding more until you upgrade or the month turns over.'),
		...Object.values(cat).filter((f) => f.type === 'limit').map((f) => usageBar(f.key)));
	const trialNote = s.status === 'none' && s.trial && !s.trial.ok ? h('p', { class: 'ds-warn' }, s.trial.reason) : null;
	const hist = s.events.length ? h('details', { class: 'ds-hub-card' }, h('summary', null, 'Billing history'), h('ul', { class: 'ds-plain' }, ...s.events.map((e) => h('li', null, `${new Date(e.at).toLocaleDateString()} — ${e.note || e.kind}${e.amount ? ' · $' + e.amount.toFixed(2) : ''}`)))) : null;
	put(b, sectionHead('plan'), hero, trialNote, s.held_followups ? h('p', { class: 'ds-warn' }, `${s.held_followups} follow-up${s.held_followups > 1 ? 's were' : ' was'} due while your account was paused. Review them on your Dashboard.`) : null,
		h('section', { class: 'ds-hub-card' }, h('div', { class: 'ds-row ds-wrap ds-between' }, h('h2', null, 'Plans'), toggle), grid,
			h('p', { class: 'ds-hint' }, 'Prices in US dollars. Cancel any time from this page — no phone call. If a payment fails you keep full access for ' + s.grace_days + ' days, then the account pauses; nothing is ever deleted.')),
		usage, exportsCard(), hist);
}
const planName = (s, k) => (s.plans.find((p) => p.key === k) || { name: k }).name;
const refresh = async (b) => { b.innerHTML = ''; await refreshSession(); billingView(b); };

function exportsCard() {
	const base = (B.ctx.cfg && B.ctx.cfg.api) || '/wp-json/dreamscaper/v1/';
	const link = (what, l) => h('a', { class: 'ds-btn ds-ghost ds-sm', href: base + 'crm/export?what=' + what + '&_wpnonce=' + encodeURIComponent(session.nonce), download: '' }, icon('download', 16), ' ' + l);
	return h('section', { class: 'ds-hub-card' }, h('h2', null, '📦 Export your records'), h('p', { class: 'ds-hint' }, 'Download everything as spreadsheets (CSV) — any time, on any plan, even if your account is paused or cancelled. Your data is yours.'),
		h('div', { class: 'ds-row ds-wrap' }, link('customers', 'Customers'), link('properties', 'Properties'), link('quotes', 'Quotes'), link('invoices', 'Invoices'), link('schedule', 'Schedule'), link('activity', 'Activity log')));
}

async function portal(btn) {
	btn.disabled = true;
	try { const r = await api('sub/portal', { body: {} }); location.href = r.url; } catch (e) { toast(e.message); btn.disabled = false; }
}
async function checkout(btn, p, billing, trial) {
	btn.disabled = true;
	const t = btn.textContent;
	btn.textContent = 'Opening secure checkout…';
	try { const r = await api('sub/checkout', { body: { plan: p.key, billing, trial, device: deviceId() } }); location.href = r.url; } catch (e) {
		btn.disabled = false; btn.textContent = t;
		const need = e.data && e.data.data && e.data.data.needs;
		if (need) return verifyFlow(need, () => checkout(btn, p, billing, trial));
		toast(e.message, 6000);
	}
}
async function change(btn, p, billing, b) {
	if (!confirm(`Switch to ${p.name} (${billing === 'year' ? 'yearly' : 'monthly'})? Stripe works out the difference for the rest of this period.`)) return;
	btn.disabled = true;
	try { await api('sub/change', { body: { plan: p.key, billing } }); toast(`You’re now on ${p.name}.`); refresh(b); } catch (e) { toast(e.message); btn.disabled = false; }
}

/** Before a trial: verify email (and phone, when texting is set up), then go to the card step. */
function startTrial(s, p, billing) {
	const needs = (s.trial && s.trial.needs) || [];
	const go = () => {
		const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
		const btn = h('button', { class: 'ds-btn ds-wide' }, 'Add card & start my free trial');
		const m = modal(B.ctx.root, `Start your ${s.trial_length}-day free trial`, [
			h('ul', { class: 'ds-can' }, h('li', null, `Full ${p.name} plan for ${s.trial_length} days.`), h('li', null, 'You add a card now — it is not charged today.'), h('li', null, `On day ${s.trial_length + 1} your ${p.name} plan starts at ${money(billing === 'year' ? p.year : p.month)}/${billing === 'year' ? 'year' : 'month'} unless you cancel.`), h('li', null, 'We email you a week before and the day before.'), h('li', null, 'Cancel any time from Plan & billing — one tap, no phone call.'), h('li', null, 'One free trial per business.')),
			btn], close);
		btn.onclick = () => checkout(btn, p, billing, true);
	};
	if (needs.length) verifyFlow(needs, go); else go();
}

/** Verify email and/or phone with a 6-digit code. */
function verifyFlow(needs, then) {
	const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
	const body = h('div');
	const m = modal(B.ctx.root, 'Verify your business', [body], close);
	const queue = needs.slice();
	const step = () => {
		body.innerHTML = '';
		const ch = queue[0];
		if (!ch) { m.remove(); then(); return; }
		const phone = ch === 'phone' ? h('input', { type: 'tel', autocomplete: 'tel', placeholder: 'Mobile number', value: (session.user && session.user.phone) || '' }) : null;
		const code = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6, placeholder: '6-digit code', class: 'ds-code-in' });
		const err = h('p', { class: 'ds-err' });
		const sendBtn = h('button', { class: 'ds-btn ds-ghost' }, ch === 'phone' ? 'Text me a code' : 'Email me a code');
		const okBtn = h('button', { class: 'ds-btn', disabled: true }, 'Verify');
		put(body, h('p', null, ch === 'phone' ? 'We’ll text a code to your mobile. It confirms you’re a real business — one free trial per phone number.' : 'We’ll email a code to your business email (from your Business profile).'),
			phone ? h('label', { class: 'ds-field' }, h('span', null, 'Mobile number'), phone) : null, h('div', { class: 'ds-row ds-wrap' }, sendBtn), code, err, okBtn);
		sendBtn.onclick = async () => {
			sendBtn.disabled = true; err.textContent = '';
			try { const r = await api('sub/verify/send', { body: { channel: ch, phone: phone ? phone.value : '' } }); toast('Code sent to ' + r.to); okBtn.disabled = false; code.focus(); sendBtn.textContent = 'Send again'; } catch (e) { err.textContent = e.message; }
			setTimeout(() => { sendBtn.disabled = false; }, 20000);
		};
		okBtn.onclick = async () => {
			okBtn.disabled = true; err.textContent = '';
			try { const r = await api('sub/verify/check', { body: { channel: ch, code: code.value } }); if (r.warning) toast(r.warning, 6000); queue.shift(); step(); } catch (e) { err.textContent = e.message; okBtn.disabled = false; }
		};
	};
	step();
}

function cancelFlow(s) {
	const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
	const go = h('button', { class: 'ds-btn ds-danger' }, 'Cancel at the end of this period');
	const m = modal(B.ctx.root, 'Cancel your subscription?', [
		h('ul', { class: 'ds-can' }, h('li', null, s.status === 'trialing' ? 'Your trial ends as planned and you won’t be charged.' : `You keep full access until ${s.period_end ? date(s.period_end) : 'the end of this period'}.`), h('li', null, `Afterwards your records stay safe for at least ${s.retention_months} months — view and export them any time.`), h('li', null, 'Come back whenever you like: everything will be where you left it.')),
		exportsCard(), h('div', { class: 'ds-row ds-wrap' }, go, h('button', { class: 'ds-btn ds-ghost', onclick: () => m.remove() }, 'Keep my subscription'))], close);
	go.onclick = async () => { go.disabled = true; try { await api('sub/cancel', { body: {} }); m.remove(); toast('Cancelled. You’ll get an email confirming the date.', 6000); const b = document.querySelector('.ds-hub-body'); B.ctx.reopen && B.ctx.reopen(); } catch (e) { toast(e.message); go.disabled = false; } };
}

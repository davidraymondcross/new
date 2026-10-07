/* DreamScaper – AI credits: see your balance and buy more (Stripe Checkout). */
import { h, icon } from './util.js?v=2.7.3';
import { session, api } from './api.js?v=2.7.3';
import { openAuth } from './account.js?v=2.7.3';
import { modal } from './capture.js?v=2.7.3';

let ROOT = null, TOAST = () => {};
export function initCredits(root, toast) { ROOT = root; TOAST = toast; }

const money = (n) => '$' + Number(n).toFixed(2);

/** Balance + store. reason: optional line on top ("You’ve used today’s free credits"). */
export async function openCredits(reason = '') {
	if (!session.user) { const ok = await openAuth({ reason: 'Sign in to use and buy AI credits.' }); if (!ok) return; }
	const ai = session.ai || {};
	const shop = ai.shop;
	const status = h('p', { class: 'ds-hint ds-err', role: 'alert' });
	const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
	const buy = async (body, btn) => {
		btn.disabled = true; status.textContent = 'Opening secure checkout…';
		try {
			const j = await api('credits/checkout', { body: { ...body, return: location.href.split('#')[0] } });
			location.href = j.url;
		} catch (e) { status.textContent = e.message; btn.disabled = false; }
	};
	const parts = [];
	if (reason) parts.push(h('p', { class: 'ds-auth-reason' }, icon('sparkle', 18), ' ', reason));
	parts.push(h('div', { class: 'ds-bal' },
		h('div', null, h('b', null, ai.unlimited ? '∞' : String(ai.free ?? 0)), h('small', null, `free left today (of ${ai.limit})`)),
		h('div', null, h('b', null, String(ai.bought || 0)), h('small', null, 'purchased credits')),
		h('div', null, h('b', null, ai.unlimited ? '∞' : String(ai.left || 0)), h('small', null, 'ready to use'))));
	parts.push(h('div', { class: 'ds-explain' },
		h('p', null, h('b', null, 'How credits work: '), `every Dreamscape AI design, tweak, and AI Erase / Make it real / Season edit uses 1 credit. You get ${ai.limit} free credits every day (they refill at midnight). Smart Select and Plant ID are always free.`),
		h('p', null, 'Purchased credits never expire and are only used after your free daily credits run out.')));
	if (!shop) {
		parts.push(h('p', { class: 'ds-muted' }, 'Buying extra credits isn’t available yet — your free credits refill every day.'));
	} else {
		const best = shop.packs.reduce((b, p) => (!b || p.price / p.credits < b.price / b.credits ? p : b), null);
		const grid = h('div', { class: 'ds-packs' });
		for (const p of shop.packs) {
			const btn = h('button', { class: 'ds-pack' + (p === best ? ' best' : '') },
				p === best ? h('span', { class: 'ds-pack-tag' }, 'Best value') : null,
				h('b', null, p.name),
				h('span', { class: 'ds-pack-n' }, String(p.credits), h('small', null, ' credits')),
				h('span', { class: 'ds-pack-price' }, money(p.price)),
				h('small', { class: 'ds-muted' }, `${money(p.price / p.credits)} each`));
			btn.onclick = () => buy({ pack: p.id }, btn);
			grid.append(btn);
		}
		parts.push(h('h4', null, 'Credit packs'), grid);
		if (shop.each > 0) {
			const n = h('input', { type: 'number', min: shop.min, max: shop.max, step: 1, value: Math.max(shop.min, 10), 'aria-label': 'Number of credits', inputmode: 'numeric' });
			const total = h('b', null);
			const upd = () => { const v = Math.max(shop.min, Math.min(shop.max, Math.round(+n.value || 0))); total.textContent = money(v * shop.each); };
			n.addEventListener('input', upd); upd();
			const step = (d) => { n.value = Math.max(shop.min, Math.min(shop.max, (+n.value || 0) + d)); upd(); };
			const go = h('button', { class: 'ds-btn' }, 'Buy');
			go.onclick = () => buy({ credits: Math.round(+n.value) }, go);
			parts.push(h('h4', null, 'Or choose exactly how many'),
				h('div', { class: 'ds-custom' },
					h('div', { class: 'ds-stepper' }, h('button', { class: 'ds-icon-btn', 'aria-label': 'Fewer', onclick: () => step(-5) }, icon('minus', 18)), n, h('button', { class: 'ds-icon-btn', 'aria-label': 'More', onclick: () => step(5) }, icon('plus', 18))),
					h('span', { class: 'ds-muted' }, `× ${money(shop.each)} =`), total, go));
		}
		parts.push(status, h('p', { class: 'ds-hint ds-center' }, icon('lock', 14), ' Secure checkout by Stripe · card, Apple Pay or Google Pay · we never see your card number.'));
	}
	const m = modal(ROOT, 'AI credits', parts, close, 'ds-modal-credits');
}

/** After returning from Stripe: add the credits (also done by webhook; counted once). */
export async function handleReturn() {
	const q = new URLSearchParams(location.search);
	const sid = q.get('ds_paid'), cancel = q.get('ds_cancel');
	if (!sid && !cancel) return;
	q.delete('ds_paid'); q.delete('ds_cancel');
	history.replaceState(history.state, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash);
	if (cancel) { TOAST('Purchase cancelled — you weren’t charged.'); return; }
	try {
		const j = await api('credits/confirm', { body: { session: sid } });
		const what = j.mb ? (j.mb >= 1024 ? +(j.mb / 1024).toFixed(1) + ' GB' : j.mb + ' MB') + ' of extra storage is' : `${j.credits} AI credits are`;
		if (j.paid) TOAST(`Thank you! ${what} now in your account.`, 6000);
		else TOAST(`Your payment is still processing — ${j.mb ? 'your storage' : 'your credits'} will appear shortly.`, 6000);
	} catch (e) { TOAST(e.message, 6000); }
}

/**
 * Before an AI action that uses a credit: explain it once, with "Don't ask me again".
 * Resolves true to go ahead. what = short description, e.g. "Remove tree".
 */
const NOASK = 'ds_ai_noask';
export function confirmCredit(what = 'This AI change') {
	let skip = false;
	try { skip = localStorage.getItem(NOASK) === '1'; } catch (e) { /* private mode */ }
	const ai = session.ai || {};
	if (skip || ai.unlimited) return Promise.resolve(true);
	return new Promise((resolve) => {
		const box = h('input', { type: 'checkbox' });
		const finish = (ok) => { if (ok && box.checked) { try { localStorage.setItem(NOASK, '1'); } catch (e) { /* ignore */ } } m.remove(); resolve(ok); };
		const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => finish(false) }, icon('close'));
		const m = modal(ROOT, 'This uses 1 AI credit', [
			h('p', null, h('b', null, what), ' will use ', h('b', null, '1 AI credit'), '. Every AI button does exactly one change, so you only pay for what you ask for — and you can undo any step for free.'),
			h('div', { class: 'ds-bal ds-bal-2' },
				h('div', null, h('b', null, String(ai.left ?? 0)), h('small', null, 'credits left')),
				h('div', null, h('b', null, String(ai.limit ?? 0)), h('small', null, 'free every day'))),
			h('label', { class: 'ds-check' }, box, h('span', null, 'Don’t ask me again')),
			h('div', { class: 'ds-row ds-end' },
				h('button', { class: 'ds-btn ds-ghost', onclick: () => finish(false) }, 'Cancel'),
				h('button', { class: 'ds-btn', onclick: () => finish(true) }, icon('sparkle', 16), ' Use 1 credit'))
		], close, 'ds-modal-auth');
	});
}
/** Turn the "This uses 1 AI credit" reminder back on (from How it works). */
export function resetCreditAsk() { try { localStorage.removeItem(NOASK); } catch (e) { /* ignore */ } }

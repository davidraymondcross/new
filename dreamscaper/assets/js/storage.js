/* DreamScaper – online storage: see what's used, what's left, and buy more (Stripe Checkout). */
import { h, put, icon } from './util.js?v=2.7.2';
import { session, api, setStorage } from './api.js?v=2.7.2';
import { openAuth } from './account.js?v=2.7.2';
import { modal } from './capture.js?v=2.7.2';

let ROOT = null;
export function initStorage(root) { ROOT = root; }

const money = (n) => '$' + Number(n).toFixed(2);

/** 1536000 → "1.5 MB"; 0.2 MB precision for small things. */
export function fmtBytes(b) {
	b = Math.max(0, b || 0);
	if (b >= 1024 ** 3) return (b / 1024 ** 3).toFixed(b >= 10 * 1024 ** 3 ? 0 : 1) + ' GB';
	if (b >= 1024 ** 2) return (b / 1024 ** 2).toFixed(b >= 100 * 1024 ** 2 ? 0 : 1) + ' MB';
	return Math.max(1, Math.round(b / 1024)) + ' KB';
}
const fmtMb = (mb) => (mb >= 1024 ? +(mb / 1024).toFixed(1) + ' GB' : mb + ' MB');

/** Free bytes left (Infinity when the site has no limit). */
export function storageLeft(st = session.storage) {
	if (!st || !st.quota) return Infinity;
	return Math.max(0, st.quota - st.used);
}

/** Bar: "45 MB used of 300 MB · 255 MB left". extra = bytes about to be added (shown striped). */
export function storageMeter(st = session.storage, extra = 0) {
	if (!st) return h('div');
	if (!st.quota) return h('p', { class: 'ds-hint' }, icon('cloud', 14), ` ${fmtBytes(st.used)} used · unlimited storage`);
	const pct = (v) => Math.min(100, (v / st.quota) * 100).toFixed(2) + '%';
	const after = st.used + extra;
	const full = after > st.quota;
	return h('div', { class: 'ds-meter' + (full ? ' full' : after / st.quota > 0.85 ? ' warn' : '') },
		h('div', { class: 'ds-meter-bar', role: 'img', 'aria-label': `${fmtBytes(st.used)} of ${fmtBytes(st.quota)} used` },
			h('span', { class: 'ds-meter-used', style: { width: pct(st.used) } }),
			extra ? h('span', { class: 'ds-meter-add', style: { left: pct(st.used), width: pct(Math.min(extra, Math.max(0, st.quota - st.used))) } }) : null),
		h('div', { class: 'ds-meter-txt' },
			h('span', null, h('b', null, fmtBytes(st.used)), ` used of ${fmtBytes(st.quota)}`),
			h('span', null, h('b', null, fmtBytes(Math.max(0, st.quota - st.used))), ' left')));
}

export async function refreshStorage() {
	if (!session.user) return null;
	try { const j = await api('storage'); setStorage(j); return j; } catch (e) { return session.storage; }
}

/** Storage page: usage, what uses it, and storage packs. */
export async function openStorage(reason = '') {
	if (!session.user) { const ok = await openAuth({ reason: 'Sign in to save your Dreamscapes and library online.' }); if (!ok) return; }
	const body = h('div', { class: 'ds-storage' }, h('p', { class: 'ds-muted' }, h('span', { class: 'ds-spin ds-spin-sm' }), ' Checking your storage…'));
	const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
	const m = modal(ROOT, 'My storage', [body], close, 'ds-modal-credits');
	const st = (await refreshStorage()) || session.storage || {};
	const status = h('p', { class: 'ds-hint ds-err', role: 'alert' });
	body.innerHTML = '';
	if (reason) put(body, h('p', { class: 'ds-auth-reason' }, icon('cloud', 18), ' ', reason));
	put(body, storageMeter(st));
	if (st.library != null) {
		put(body, h('div', { class: 'ds-bal ds-bal-2' },
			h('div', null, h('b', null, fmtBytes(st.designs)), h('small', null, `Dreamscapes (${st.designs_count}) — your yard photos & AI designs`)),
			h('div', null, h('b', null, fmtBytes(st.library)), h('small', null, `My Library (${st.library_count}) — plants from Plant ID & your own photos`))));
	}
	put(body, h('div', { class: 'ds-explain' },
		h('p', null, h('b', null, 'What is this? '), `Everything you save online — your Dreamscapes and the plants in My Library — lives in your account, so it opens on any phone, tablet or computer. You get ${fmtMb(st.free_mb || 0)} free${st.bought_mb ? `, plus ${fmtMb(st.bought_mb)} you added` : ''}.`),
		h('p', null, 'Typical sizes: a plant saved from Plant ID ≈ 0.2–0.5 MB · a Dreamscape ≈ 1–4 MB · an AI design ≈ 0.5 MB.'),
		h('p', null, 'Need room? Delete Dreamscapes you no longer need from My Dreamscapes, or add more space below.')));
	const shop = st.shop;
	if (!shop || !st.quota) {
		if (st.quota) put(body, h('p', { class: 'ds-muted' }, 'Adding storage isn’t available yet.'));
	} else {
		const best = shop.packs.reduce((b, p) => (!b || p.price / p.mb < b.price / b.mb ? p : b), null);
		const grid = h('div', { class: 'ds-packs' });
		for (const p of shop.packs) {
			const btn = h('button', { class: 'ds-pack' + (p === best && shop.packs.length > 1 ? ' best' : '') },
				p === best && shop.packs.length > 1 ? h('span', { class: 'ds-pack-tag' }, 'Best value') : null,
				h('b', null, p.name),
				h('span', { class: 'ds-pack-n' }, '+' + fmtMb(p.mb)),
				h('span', { class: 'ds-pack-price' }, money(p.price)),
				h('small', { class: 'ds-muted' }, `≈ ${Math.round(p.mb / 0.35).toLocaleString()} plants or ${Math.round(p.mb / 2.5).toLocaleString()} Dreamscapes`));
			btn.onclick = async () => {
				btn.disabled = true; status.textContent = 'Opening secure checkout…';
				try { const j = await api('credits/checkout', { body: { storage: p.id, return: location.href.split('#')[0] } }); location.href = j.url; } catch (e) { status.textContent = e.message; btn.disabled = false; }
			};
			put(grid, btn);
		}
		put(body, h('h4', null, 'Add more storage — one-time, never expires'), grid, status,
			h('p', { class: 'ds-hint ds-center' }, icon('lock', 14), ' Secure checkout by Stripe · your new space is added the moment payment is confirmed.'));
	}
}

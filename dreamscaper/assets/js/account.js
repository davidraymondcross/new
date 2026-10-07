/* DreamScaper – sign in / create account / profile, and the account chip. */
import { h, icon, stateSelect, US_STATES } from './util.js?v=2.7.8';
import { session, api, refreshSession, onSession, applySession } from './api.js?v=2.7.8';
import { modal } from './capture.js?v=2.7.8';
import { addressField, addressDetails } from './address.js?v=2.7.8';
import { openCredits } from './credits.js?v=2.7.8';
import { openStorage, fmtBytes } from './storage.js?v=2.7.8';

let CFG = {}, ROOT = null, TOAST = () => {};
export function initAccount(cfg, root, toast) { CFG = cfg; ROOT = root; TOAST = toast; }

const G_ICON = '<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 38.2 44 33 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
const F_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="#fff" d="M14 8h3V4h-3c-2.8 0-4.5 1.8-4.5 4.6V11H7v4h2.5v9h4v-9h3l.5-4h-3.5V8.8c0-.5.3-.8.5-.8z"/></svg>';

/** Opens Google/Facebook sign-in in a popup (falls back to a full redirect). */
function social(provider, done) {
	const ret = location.href.split('#')[0];
	const base = (CFG.oauth || '/') + (CFG.oauth && CFG.oauth.includes('?') ? '&' : '?') + new URLSearchParams({ dreamscaper_oauth: provider, start: 1, return: ret });
	const w = 520, hgt = 640;
	const pop = window.open(base + '&popup=1', 'dreamscaper_login', `width=${w},height=${hgt},left=${Math.max(0, (screen.width - w) / 2)},top=${Math.max(0, (screen.height - hgt) / 2)}`);
	if (!pop) { location.href = base; return; }
	const onMsg = async (e) => {
		if (!e.data || e.data.dreamscaper !== 'login') return;
		window.removeEventListener('message', onMsg);
		if (!e.data.ok) { TOAST(e.data.message || 'Sign-in didn’t finish.'); return; }
		await refreshSession();
		done && done();
	};
	window.addEventListener('message', onMsg);
}

/**
 * Sign in / create account. Resolves true when signed in.
 * reason: short line shown on top ("Sign in to use Dreamscape AI").
 */
export function openAuth({ reason = '', start = 'signup' } = {}) {
	return new Promise((resolve) => {
		let mode = start;
		const status = h('p', { class: 'ds-hint ds-err', role: 'alert' });
		const body = h('div', { class: 'ds-auth' });
		const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => finish(false) }, icon('close'));
		const m = modal(ROOT, 'Your DreamScaper account', [body], close, 'ds-modal-auth');
		const finish = async (ok) => {
			m.remove();
			if (ok && session.user && !session.user.complete) await completeProfile();
			resolve(!!(ok && session.user));
		};
		const input = (name, type, label, ac, extra = {}) => {
			const i = h('input', { name, type, autocomplete: ac, required: true, ...extra });
			return { i, row: h('label', null, label, i) };
		};
		const draw = () => {
			body.innerHTML = '';
			status.textContent = '';
			const perks = h('ul', { class: 'ds-perks' },
				h('li', null, icon('check', 16), ' Your Dreamscapes saved online — open them on any phone or computer'),
				h('li', null, icon('check', 16), ` Dreamscape AI, Plant ID and smart AI tools (${session.ai.limit || 10} free AI credits every day)`),
				h('li', null, icon('check', 16), ' Share your designs and print them anytime'));
			const socials = session.socials || [];
			const sbtns = h('div', { class: 'ds-social' },
				socials.includes('google') ? h('button', { class: 'ds-sbtn ds-g', type: 'button', onclick: () => social('google', () => finish(true)) }, h('span', { html: G_ICON }), 'Continue with Google') : null,
				socials.includes('facebook') ? h('button', { class: 'ds-sbtn ds-f', type: 'button', onclick: () => social('facebook', () => finish(true)) }, h('span', { html: F_ICON }), 'Continue with Facebook') : null);
			const tabs = h('div', { class: 'ds-seg ds-auth-tabs', role: 'tablist' },
				h('button', { class: mode === 'signup' ? 'on' : '', role: 'tab', onclick: () => { mode = 'signup'; draw(); } }, 'Create account'),
				h('button', { class: mode === 'signin' ? 'on' : '', role: 'tab', onclick: () => { mode = 'signin'; draw(); } }, 'Sign in'));
			body.append(reason ? h('p', { class: 'ds-auth-reason' }, icon('sparkle', 18), ' ', reason) : null, mode === 'signup' ? perks : null, socials.length ? sbtns : null, socials.length ? h('div', { class: 'ds-or' }, h('span', null, 'or use email')) : null, tabs);
			const form = h('form', { class: 'ds-form ds-form-1', novalidate: true });
			const email = input('email', 'email', 'Email', 'email');
			const pass = input('password', 'password', 'Password', mode === 'signup' ? 'new-password' : 'current-password', { minlength: 8 });
			let fields = {};
			if (mode === 'signup') {
				const name = input('name', 'text', 'Full name', 'name');
				const phone = input('phone', 'tel', 'Phone', 'tel');
				const addr = input('address', 'text', 'Street address of the yard', 'off', { placeholder: 'Start typing…' });
				const town = input('town', 'text', 'Town', 'address-level2');
				const zip = input('zip', 'text', 'ZIP', 'postal-code', { inputmode: 'numeric', maxlength: 10 });
				const st = stateSelect('');
				const addrRow = h('label', null, 'Street address of the yard', addressField(addr.i, { api: CFG.api, onPick: (it) => fillFull(it, addr.i, town.i, zip.i, st) }));
				const contact = h('input', { type: 'checkbox', checked: true });
				const hp = h('input', { type: 'text', class: 'ds-hp', tabindex: -1, autocomplete: 'off', 'aria-hidden': 'true' });
				const agree = h('input', { type: 'checkbox', required: true });
				fields = { name, email, phone, addr, town, zip, st, pass, contact, hp, agree };
				form.append(name.row, email.row, phone.row, addrRow, h('div', { class: 'ds-form-3' }, town.row, h('label', null, 'State', st), zip.row), pass.row,
					h('label', { class: 'ds-check' }, contact, ` It's OK for ${CFG.brand || 'us'} to contact me about my design`),
					h('label', { class: 'ds-check' }, agree, ' I agree to the ', h('a', { href: (session.terms && session.terms.url) || '#', target: '_blank', rel: 'noopener' }, 'Terms of Service'), '.'), hp);
			} else {
				fields = { email, pass };
				form.append(email.row, pass.row, h('button', { type: 'button', class: 'ds-link', onclick: () => lost(email.i.value) }, 'Forgot password?'));
			}
			const submit = h('button', { class: 'ds-btn ds-wide ds-lg', type: 'submit' }, mode === 'signup' ? 'Create my free account' : 'Sign in');
			form.append(status, submit);
			form.addEventListener('submit', async (e) => {
				e.preventDefault();
				status.textContent = '';
				const v = (f) => f.i.value.trim();
				if (mode === 'signup') {
					if (v(fields.name).length < 2) return (status.textContent = 'Please add your name.');
					if (!/\S+@\S+\.\S+/.test(v(fields.email))) return (status.textContent = 'Please add a valid email.');
					if (v(fields.phone).replace(/\D/g, '').length < 10) return (status.textContent = 'Please add a 10-digit phone number.');
					if (v(fields.addr).length < 4) return (status.textContent = 'Please add the address of the yard you’re designing.');
					if (fields.pass.i.value.length < 8) return (status.textContent = 'Choose a password with at least 8 characters.');
				}
				submit.disabled = true;
				try {
					if (mode === 'signup') {
						await api('auth/register', { body: { name: v(fields.name), email: v(fields.email), phone: v(fields.phone), address: v(fields.addr), town: v(fields.town), state: fields.st.value, zip: v(fields.zip), agree: fields.agree.checked, password: fields.pass.i.value, contact: fields.contact.checked, hp: fields.hp.value } });
						TOAST(`Welcome, ${session.user.name.split(' ')[0]}! Your Dreamscapes now save to your account.`, 4500);
					} else {
						await api('auth/login', { body: { email: v(fields.email), password: fields.pass.i.value } });
						TOAST(`Welcome back, ${session.user.name.split(' ')[0]}!`);
					}
					finish(true);
				} catch (err) { status.textContent = err.message; submit.disabled = false; }
			});
			body.append(form, h('p', { class: 'ds-hint ds-center' }, 'Free. No spam. You can delete your account anytime.'));
		};
		const lost = async (email) => {
			if (!/\S+@\S+\.\S+/.test(email)) { status.textContent = 'Type your email above, then tap “Forgot password?”.'; return; }
			try { const j = await api('auth/lost', { body: { email } }); status.textContent = j.message; } catch (e) { status.textContent = e.message; }
		};
		draw();
	});
}

/** Fill the form right away from the pick, then complete it (ZIP especially) from the address lookup. */
async function fillFull(it, addr, town, zip, st) {
	fillAddress(it.label, addr, town, zip, st);
	const d = await addressDetails(it.label, it);
	if (d.street) addr.value = d.street;
	if (d.town) town.value = d.town;
	if (d.zip) zip.value = d.zip;
	if (st && d.state) st.value = d.state;
}
function fillAddress(label, addr, town, zip, st) {
	const parts = label.split(',').map((s) => s.trim());
	addr.value = parts[0] || label;
	if (parts[1]) town.value = parts[1];
	const z = (parts[2] || '').match(/\d{5}/);
	if (z) zip.value = z[0];
	// "…, Farmington, CT 06032" or "…, Austin, Texas 78701"
	const sp = (parts[2] || '').replace(/\d{5}(-\d{4})?/, '').trim();
	const hit = US_STATES.find(([a, n]) => a === sp.toUpperCase() || n.toLowerCase() === sp.toLowerCase());
	if (st && hit) st.value = hit[0];
}

/** Ask for the details social sign-in doesn't give us (phone, address). */
export function completeProfile(force = false) {
	return new Promise((resolve) => {
		const u = session.user;
		if (!u) return resolve(false);
		const mk = (name, type, label, val, ac) => { const i = h('input', { name, type, value: val || '', autocomplete: ac }); return { i, row: h('label', null, label, i) }; };
		const name = mk('name', 'text', 'Full name', u.name, 'name');
		const email = mk('email', 'email', 'Email', /@users\.dreamscaper\.invalid$/.test(u.email) ? '' : u.email, 'email');
		const phone = mk('phone', 'tel', 'Phone', u.phone, 'tel');
		const addr = mk('address', 'text', 'Street address of the yard', u.address, 'off');
		const town = mk('town', 'text', 'Town', u.town, 'address-level2');
		const zip = mk('zip', 'text', 'ZIP', u.zip, 'postal-code');
		const st = stateSelect(u.state);
		const contact = h('input', { type: 'checkbox', checked: u.contact !== false });
		const status = h('p', { class: 'ds-hint ds-err', role: 'alert' });
		const save = h('button', { class: 'ds-btn ds-wide', type: 'submit' }, 'Save');
		const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => { m.remove(); resolve(false); } }, icon('close'));
		const form = h('form', { class: 'ds-form ds-form-1' },
			force ? null : h('p', { class: 'ds-muted' }, 'Almost done! Add where your yard is so we can tailor plant suggestions and follow up if you’d like a quote.'),
			name.row, email.row, phone.row,
			h('label', null, 'Street address of the yard', addressField(addr.i, { api: CFG.api, onPick: (it) => fillFull(it, addr.i, town.i, zip.i, st) })),
			h('div', { class: 'ds-form-3' }, town.row, h('label', null, 'State', st), zip.row),
			h('label', { class: 'ds-check' }, contact, ` It's OK for ${CFG.brand || 'us'} to contact me about my design`),
			status, save);
		const m = modal(ROOT, force ? 'My account' : 'A couple more details', [form], close);
		form.addEventListener('submit', async (e) => {
			e.preventDefault();
			if (!/\S+@\S+\.\S+/.test(email.i.value)) return (status.textContent = 'Please add a valid email.');
			if (phone.i.value.replace(/\D/g, '').length < 10) return (status.textContent = 'Please add a 10-digit phone number.');
			if (addr.i.value.trim().length < 4) return (status.textContent = 'Please add the yard’s street address.');
			save.disabled = true;
			try {
				await api('auth/profile', { body: { name: name.i.value, email: email.i.value, phone: phone.i.value, address: addr.i.value, town: town.i.value, state: st.value, zip: zip.i.value, contact: contact.checked } });
				m.remove();
				TOAST('Saved!');
				resolve(true);
			} catch (err) { status.textContent = err.message; save.disabled = false; }
		});
	});
}

/** Resolves true if signed in (asking the customer to sign in if needed). */
export async function requireSignIn(reason) {
	if (session.user) return true;
	return openAuth({ reason });
}

/** The account button for headers: “Sign in” or avatar + AI credits. */
export function accountChip({ onChange } = {}) {
	const el = h('div', { class: 'ds-acct' });
	const draw = () => {
		el.innerHTML = '';
		const u = session.user;
		if (!u) {
			el.append(h('button', { class: 'ds-btn ds-sm ds-ghost ds-signin', onclick: () => openAuth({ start: 'signin' }) }, icon('person', 18), ' Sign in'));
			return;
		}
		const ai = session.ai || {};
		const initials = (u.name || '?').split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase();
		const av = u.avatar && !/blank/.test(u.avatar) ? h('img', { src: u.avatar, alt: '', referrerpolicy: 'no-referrer' }) : h('span', null, initials);
		const menu = h('div', { class: 'ds-acct-menu', hidden: true },
			h('div', { class: 'ds-acct-head' }, h('b', null, u.name), h('small', null, u.email)),
			ai.enabled ? h('button', { class: 'ds-acct-ai', onclick: () => { menu.hidden = true; openCredits(); } }, icon('sparkle', 16), ai.unlimited ? ' Unlimited AI (admin)' : ` ${ai.left} AI credits · Get more`) : null,
			session.storage ? h('button', { class: 'ds-acct-ai', onclick: () => { menu.hidden = true; openStorage(); } }, icon('cloud', 16), session.storage.quota ? ` Storage: ${fmtBytes(Math.max(0, session.storage.quota - session.storage.used))} left · Get more` : ' My storage') : null,
			h('button', { onclick: () => { menu.hidden = true; completeProfile(true); } }, icon('edit', 16), ' My details'),
			h('button', { onclick: async () => { menu.hidden = true; await api('auth/logout', { body: {} }).catch(() => {}); await refreshSession(); TOAST('Signed out. Your designs stay saved in your account.'); onChange && onChange(); } }, icon('close', 16), ' Sign out'),
			h('button', { class: 'ds-danger', onclick: async () => {
				menu.hidden = true;
				if (!confirm('Delete your account and every Dreamscape saved online? This can’t be undone. (Designs saved on this device stay here.)')) return;
				try { const j = await api('auth/delete', { body: {} }); applySession(j); TOAST('Your account was deleted.'); onChange && onChange(); } catch (e) { TOAST(e.message); }
			} }, icon('trash', 16), ' Delete account'));
		const btn = h('button', { class: 'ds-acct-btn', 'aria-label': 'My account', 'aria-haspopup': 'true', onclick: (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; } }, h('span', { class: 'ds-avatar' }, av), h('span', { class: 'ds-hide-sm' }, u.name.split(' ')[0]));
		el.append(btn, menu);
		ROOT.addEventListener('pointerdown', (e) => { if (!el.contains(e.composedPath()[0])) menu.hidden = true; });
	};
	draw();
	const off = onSession(draw);
	el._off = off;
	return el;
}

/** Pill showing AI credits left — tap to see details or buy more. */
export function creditsPill() {
	const el = h('button', { class: 'ds-credits', type: 'button', title: 'AI credits' });
	const draw = () => {
		const ai = session.ai || {};
		el.hidden = !ai.enabled;
		el.innerHTML = '';
		el.append(icon('sparkle', 15));
		if (!session.user) { el.append(' Sign in for AI'); el.classList.add('off'); el.onclick = () => openAuth({ reason: 'Sign in to use Dreamscape AI and the AI tools.' }); return; }
		el.classList.toggle('off', !ai.unlimited && ai.left <= 0);
		el.append(ai.unlimited ? ' AI: unlimited' : ` ${ai.left} AI credit${ai.left === 1 ? '' : 's'}`);
		el.title = ai.unlimited ? 'Admins have unlimited AI' : `${ai.free} free today + ${ai.bought || 0} purchased — tap to add more`;
		el.onclick = () => openCredits();
	};
	draw();
	el._off = onSession(draw);
	return el;
}

/** "My Account" page: who you are, AI credits, storage, details, tours, sign out. */
export async function openAccount({ onChange, tours } = {}) {
	if (!session.user) {
		const ok = await openAuth({ reason: 'Create a free account to save your Dreamscapes online, use Dreamscape AI and Plant ID, and keep your library on every device.' });
		if (ok) { onChange && onChange(); openAccount({ onChange, tours }); }
		return;
	}
	const u = session.user, ai = session.ai || {}, st = session.storage;
	const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
	const go = (fn) => () => { m.remove(); fn(); };
	const initials = (u.name || '?').split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase();
	const left = st && st.quota ? Math.max(0, st.quota - st.used) : null;
	const m = modal(ROOT, 'My Account', [
		h('div', { class: 'ds-acc-head' }, h('span', { class: 'ds-avatar ds-avatar-lg' }, u.avatar && !/blank/.test(u.avatar) ? h('img', { src: u.avatar, alt: '', referrerpolicy: 'no-referrer' }) : initials),
			h('div', null, h('b', null, u.name), h('small', null, u.email))),
		h('div', { class: 'ds-acc-grid' },
			ai.enabled ? h('button', { class: 'ds-acc-tile', onclick: go(() => openCredits()) }, h('span', null, '✨'), h('b', null, ai.unlimited ? 'Unlimited AI' : `${ai.left} AI credits`), h('small', null, 'Get more')) : null,
			st ? h('button', { class: 'ds-acc-tile', onclick: go(() => openStorage()) }, h('span', null, '☁️'), h('b', null, left == null ? 'Unlimited storage' : `${fmtBytes(left)} left`), h('small', null, 'Storage · get more')) : null,
			h('button', { class: 'ds-acc-tile', onclick: go(() => completeProfile(true)) }, h('span', null, '📝'), h('b', null, 'My details'), h('small', null, 'Name, phone, address')),
			tours ? h('button', { class: 'ds-acc-tile', onclick: go(tours) }, h('span', null, '🧭'), h('b', null, 'Tours & tips'), h('small', null, 'Turn guided tours back on')) : null),
		h('div', { class: 'ds-row ds-wrap ds-acc-actions' },
			h('button', { class: 'ds-btn ds-ghost', onclick: async () => { m.remove(); await api('auth/logout', { body: {} }).catch(() => {}); await refreshSession(); TOAST('Signed out. Your designs stay saved in your account.'); onChange && onChange(); } }, icon('close', 16), ' Sign out'),
			h('button', { class: 'ds-btn ds-ghost ds-danger', onclick: async () => {
				if (!confirm('Delete your account and every Dreamscape saved online? This can’t be undone. (Designs saved on this device stay here.)')) return;
				try { const j = await api('auth/delete', { body: {} }); applySession(j); m.remove(); TOAST('Your account was deleted.'); onChange && onChange(); } catch (e) { TOAST(e.message); }
			} }, icon('trash', 16), ' Delete account'))
	], close, 'ds-modal-auth');
}

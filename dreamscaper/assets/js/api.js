/* DreamScaper – talking to the website: session (who's signed in), REST calls. */

export const session = { user: null, nonce: '', ai: { enabled: false, left: 0, limit: 0 }, socials: [], storage: null, community: { on: false }, ready: false };
const subs = new Set();
let CFG = {};

export function initApi(cfg) { CFG = cfg; }
export function onSession(fn) { subs.add(fn); return () => subs.delete(fn); }
function emit() { for (const f of subs) { try { f(session); } catch (e) { console.warn(e); } } }

export function applySession(j) {
	if (!j || typeof j !== 'object') return;
	if ('user' in j) session.user = j.user;
	if (j.nonce) session.nonce = j.nonce;
	if (j.ai) session.ai = j.ai;
	if (j.socials) session.socials = j.socials;
	if ('storage' in j) session.storage = j.storage;
	if (j.community) { session.community = j.community; if (j.community.rewards && j.community.rewards.length) rewardFn(j.community.rewards); }
	session.ready = true;
	emit();
}
export function setAi(ai) { if (ai) { session.ai = ai; emit(); } }
let rewardFn = () => {};
/** Points, badges and level-ups earned by an action (shown as a toast or a celebration). */
export function onRewards(fn) { rewardFn = fn; }
export function setCommunity(c) { if (c) { session.community = { ...(session.community || {}), ...c }; emit(); } }
export function setStorage(st) { if (st) { session.storage = { ...(session.storage || {}), ...st }; emit(); } }

/** Who is signed in (admin-ajax works on cached pages and hands us a fresh REST nonce). */
export async function refreshSession() {
	try {
		const r = await fetch(CFG.ajax + '?action=dreamscaper_me&_=' + Date.now(), { credentials: 'same-origin' });
		applySession(await r.json());
	} catch (e) { session.ready = true; emit(); }
	return session;
}

export class ApiError extends Error {
	constructor(msg, status, data) { super(msg); this.status = status; this.data = data; }
}

/** REST call: api('cloud/list', { query: {kind:'design'} }) or api('ai/edit', { body: {...} }) */
export async function api(path, { method, body, form, query } = {}) {
	let url = CFG.api + path;
	if (query) url += (url.includes('?') ? '&' : '?') + new URLSearchParams(query).toString();
	const headers = {};
	if (session.nonce) headers['X-WP-Nonce'] = session.nonce;
	let payload;
	if (form) payload = form;
	else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
	let r;
	try {
		r = await fetch(url, { method: method || (payload ? 'POST' : 'GET'), headers, body: payload, credentials: 'same-origin' });
	} catch (e) { throw new ApiError('No connection. Check your internet and try again.', 0); }
	let j = null;
	try { j = await r.json(); } catch (e) { /* not json */ }
	if (r.status === 403 && j && j.code === 'rest_cookie_invalid_nonce') {
		await refreshSession();
		return api(path, { method, body, form, query });
	}
	if (!r.ok) {
		if (j && j.data && j.data.ai) setAi(j.data.ai);
		if (r.status === 401 || (j && j.code === 'rest_forbidden')) { session.user = null; emit(); throw new ApiError('Please sign in first.', 401, j); }
		throw new ApiError((j && j.message) || 'Something went wrong. Please try again.', r.status, j);
	}
	if (j && j.rewards && j.rewards.length) { rewardFn(j.rewards); refreshCommunitySoon(); }
	if (j && j.ai) setAi(j.ai);
	if (j && j.storage && !('user' in j)) setStorage(j.storage);
	if (j && ('user' in j) && ('nonce' in j)) applySession(j);
	return j;
}

export const signedIn = () => !!session.user;

let rcs = 0;
function refreshCommunitySoon() {
	clearTimeout(rcs);
	rcs = setTimeout(async () => { try { const c = await api('c/status'); if (c) { delete c.rewards; setCommunity(c); } } catch (e) { /* offline */ } }, 400);
}

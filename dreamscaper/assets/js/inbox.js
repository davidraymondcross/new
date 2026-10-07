/* DreamScaper – Messages (Inbox).
 *
 * One place for every conversation: homeowner ↔ contractor about a project, and member ↔ member.
 * Project conversations show a context card (address, services, next appointment, quote, money
 * owed). Contractors get quick actions (start the estimate, book a visit, ask for what's missing),
 * saved quick replies and a "needs reply" view. The unread badge lives in the header everywhere.
 */
import { h, put, icon } from './util.js?v=2.7.8';
import { session, api, applySession, onSession } from './api.js?v=2.7.8';
import { modal, camera, pickFile } from './capture.js?v=2.7.8';
import { sectionHead, tip, planPrompt, has, lockNote, loadCaps } from './explain.js?v=2.7.8';

let I = null; // { ctx }
let pollT = 0;
const toast = (m, ms) => I && I.ctx.toast(m, ms);
const ago = (t) => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? 'now' : s < 3600 ? Math.round(s / 60) + 'm' : s < 86400 ? Math.round(s / 3600) + 'h' : s < 86400 * 7 ? Math.round(s / 86400) + 'd' : new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };
const waited = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 60 ? `${Math.max(1, m)} min` : m < 1440 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${Math.round(m / 1440)} days`; };
const when = (t) => new Date(t).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const STATES = { new: ['🆕', 'New — needs a reply'], waiting: ['⏳', 'Needs a reply'], replied: ['✔️', 'Waiting on customer'], done: ['🗂️', 'Closed'] };
const QS = { request: 'Request', draft: 'Estimate in progress', sent: 'Quote sent', viewed: 'Quote viewed', signed: 'Hired', declined: 'Declined', expired: 'Expired' };

/**
 * ctx: { root, toast, header, home, leave, requireSignIn,
 *        hub: { openQuote(id), bookVisit(seed), openCustomer(id) } (contractor actions, optional),
 *        openProjects() }
 */
export function initInbox(ctx) {
	I = { ctx };
	const tick = async () => {
		if (session.user && document.visibilityState === 'visible') {
			try { const r = await api('inbox/unread'); setUnread(r.unread); } catch (e) { /* offline */ }
		}
		clearTimeout(pollT);
		pollT = setTimeout(tick, document.visibilityState === 'visible' ? 45000 : 180000);
	};
	clearTimeout(pollT);
	pollT = setTimeout(tick, 15000);
}
function setUnread(u) {
	if (!u) return;
	const cur = session.inbox && session.inbox.unread ? session.inbox.unread.total : -1;
	if (cur === u.total) return;
	applySession({ inbox: { unread: u } });
}

/** Header button with the unread count; opens Messages. */
export function inboxButton() {
	const dot = h('span', { class: 'ds-dot-n', hidden: true });
	const draw = () => { const n = session.inbox && session.inbox.unread ? session.inbox.unread.total : 0; dot.hidden = !n || !session.user; dot.textContent = n > 99 ? '99+' : String(n); };
	draw();
	onSession(draw);
	return h('button', { class: 'ds-icon-btn ds-inbox-btn', 'aria-label': 'Messages', title: 'Messages', onclick: () => openInbox() }, icon('chat', 22), dot);
}
/** Just the count bubble (for tiles). */
export function inboxDot() {
	const dot = h('span', { class: 'ds-dot-n', hidden: true });
	const draw = () => { const n = session.inbox && session.inbox.unread ? session.inbox.unread.total : 0; dot.hidden = !n || !session.user; dot.textContent = n > 99 ? '99+' : String(n); };
	draw();
	onSession(draw);
	return dot;
}

/* -------------------------------------------------------------- page */

/** Open Messages as its own page. view: { filter, id, with, pro, quote } */
export async function openInbox(view = {}) {
	const { ctx } = I;
	if (!(await ctx.requireSignIn('Sign in to see your messages.'))) return;
	ctx.leave();
	const root = ctx.root;
	root.innerHTML = '';
	const body = h('div', { class: 'ds-cm-body' });
	const bar = h('div', { class: 'ds-cm-bar' },
		h('button', { class: 'ds-btn ds-ghost ds-sm ds-cm-back', onclick: () => (stack.length ? draw(stack.pop(), false) : ctx.home()), 'aria-label': 'Back' }, '←', h('span', null, ' Back')),
		h('h1', null, '💬 Messages'), h('div', { class: 'ds-spacer' }),
		h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => settingsSheet() }, '⚙️', h('span', { class: 'ds-hide-sm' }, ' Alerts')));
	root.append(ctx.header(), h('main', { class: 'ds-home ds-comm ds-inbox-page' }, bar, body));
	const stack = [];
	let cur = null;
	const draw = (v, push = true) => {
		if (push && cur) stack.push(cur);
		cur = v;
		body.innerHTML = '';
		const sc = body.closest('.ds-home');
		if (sc) sc.scrollTop = 0;
		inboxPane(body, v, { go: (nv) => draw(nv), pro: false });
	};
	draw(view.id || view.with || view.pro || view.quote ? { v: 'thread', ...view } : { v: 'list', filter: view.filter || 'all' }, false);
}

/**
 * Render the inbox (list or a thread) into a container. Used by the Messages page and by the
 * Contractor Hub's Inbox tab (opts.pro = true).
 */
export function inboxPane(box, view, opts) {
	if (view.v === 'thread') return threadView(box, view, opts);
	return listView(box, view, opts);
}

/* -------------------------------------------------------------- list */

async function listView(b, view, opts) {
	const filters = opts.pro
		? [['needs_reply', '⏳ Needs reply'], ['all', 'All'], ['unread', 'Unread'], ['archived', 'Archived']]
		: [['all', 'All'], ['unread', 'Unread'], ['pros', '🧰 Contractors'], ['community', '🌎 Members'], ['projects', '📋 Projects'], ['archived', 'Archived']];
	let filter = view.filter || (opts.pro ? 'needs_reply' : 'all');
	const help = { all: 'Every conversation, newest first.', unread: 'Conversations with messages you haven’t read.', pros: 'Conversations with contractors about your projects.', community: 'Messages with other DreamScaper members.', projects: 'Conversations tied to a specific project or quote.', archived: 'Conversations you archived. A new message brings one back.', needs_reply: 'Customers who wrote last and are waiting for you — oldest wait first.' };
	const q = h('input', { type: 'search', placeholder: 'Search messages', 'aria-label': 'Search messages' });
	const chips = h('div', { class: 'ds-chips' }, ...filters.map(([k, l]) => h('button', { class: 'ds-chip' + (k === filter ? ' on' : ''), onclick: (e) => { filter = k; for (const c of chips.children) c.classList.remove('on'); e.currentTarget.classList.add('on'); load(); } }, l)));
	const hint = h('p', { class: 'ds-hint' });
	const list = h('div', { class: 'ds-ib-list' });
	put(b, opts.pro ? null : sectionHead('inbox'), opts.pro ? null : tip('inbox', 'Project conversations show the address, next appointment and quote at the top, so you never have to ask “which job is this?”.'),
		opts.pro && !has('inbox_pro') ? h('p', { class: 'ds-hint' }, 'Needs-reply tracking and quick replies are in the Pro plan — you can still read and reply to everything.') : null,
		h('div', { class: 'ds-row ds-wrap ds-ib-tools' }, chips, q), hint, list);
	let t = 0;
	q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 350); });
	async function load() {
		hint.textContent = help[filter] || '';
		list.innerHTML = '';
		list.append(h('span', { class: 'ds-spin' }));
		try {
			const r = await api('inbox', { query: { filter, q: q.value, pro: opts.pro ? 1 : '' } });
			setUnread(r.unread);
			list.innerHTML = '';
			let items = r.items;
			if (filter === 'needs_reply') items = items.slice().sort((a, c) => a.at - c.at);
			if (!items.length) {
				list.append(h('div', { class: 'ds-soon' }, h('div', { class: 'ds-soon-ic' }, '💬'),
					h('h3', null, filter === 'needs_reply' ? 'All caught up' : filter === 'unread' ? 'Nothing unread' : 'No conversations yet'),
					h('p', null, opts.pro ? 'When a homeowner requests a quote from you, the conversation starts here with their full project brief — photos, measurements and answers.' : 'Request quotes from contractors (Find a Local Contractor), or tap Message on any member’s profile. Conversations show up here.'),
					!opts.pro && I.ctx.openFind ? h('button', { class: 'ds-btn', onclick: () => I.ctx.openFind() }, '🔎 Find a contractor') : null));
				return;
			}
			for (const x of items) list.append(row(x));
		} catch (e) { list.innerHTML = ''; list.append(h('p', { class: 'ds-err' }, e.message)); }
	}
	const row = (x) => {
		const st = x.as_pro && x.state ? STATES[x.state] : null;
		return h('button', { class: 'ds-ib-row' + (x.unread ? ' unread' : ''), onclick: () => opts.go({ v: 'thread', id: x.id }) },
			avatarOf(x.with),
			h('span', { class: 'ds-ib-main' },
				h('span', { class: 'ds-ib-top' }, h('b', null, x.with.name), x.with.role === 'pro' || x.with.business ? h('small', { class: 'ds-qs' }, '🧰 ' + (x.with.business && x.with.role !== 'pro' ? x.with.business : 'Contractor')) : null, x.with.role === 'customer' ? h('small', { class: 'ds-qs' }, 'Customer') : null),
				x.project ? h('small', { class: 'ds-ib-proj' }, `📋 ${x.project.title}${x.project.number ? ' · ' + x.project.number : ''} · ${QS[x.project.status] || x.project.status}`) : null,
				h('small', { class: 'ds-ib-last' }, (x.mine ? 'You: ' : '') + x.last),
				st && (x.state === 'new' || x.state === 'waiting') && x.since ? h('small', { class: 'ds-ib-wait' }, `${st[0]} ${st[1]} · waiting ${waited(x.since)}`) : st ? h('small', { class: 'ds-ib-st' }, `${st[0]} ${st[1]}`) : null),
			h('span', { class: 'ds-ib-side' }, h('small', null, ago(x.at)), x.unread ? h('span', { class: 'ds-dot-n ds-inline' }, String(x.unread)) : null, x.muted ? h('small', { title: 'Muted' }, '🔕') : null));
	};
	load();
}

function avatarOf(w, size = 44) {
	const name = (w && w.name) || '?';
	const init = name.split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase();
	return w && w.avatar ? h('img', { class: 'ds-ib-av', src: w.avatar, alt: '', style: { width: size + 'px', height: size + 'px' } }) : h('span', { class: 'ds-ib-av', style: { width: size + 'px', height: size + 'px' } }, init);
}

/* ------------------------------------------------------------- thread */

async function threadView(b, view, opts) {
	let id = view.id || 0;
	// a contractor's general thread is created on demand
	if (!id && view.pro) {
		try { id = (await api('inbox/start', { body: { pro: view.pro } })).id; } catch (e) { b.append(h('p', { class: 'ds-err' }, e.message)); return; }
	}
	if (!id && view.quote) {
		try { id = (await api('inbox/start', { body: { quote: view.quote } })).id; } catch (e) { b.append(h('p', { class: 'ds-err' }, e.message)); return; }
	}
	const head = h('div', { class: 'ds-ib-head' });
	const ctxBox = h('div');
	const list = h('div', { class: 'ds-cm-msgs ds-ib-msgs', 'aria-live': 'polite' });
	const ta = h('textarea', { rows: 1, maxlength: 4000, placeholder: 'Write a message…', 'aria-label': 'Message' });
	const send = h('button', { class: 'ds-btn', 'aria-label': 'Send' }, icon('send', 18));
	const files = [];
	const tray = h('div', { class: 'ds-ib-tray' });
	const attachBtn = h('button', { class: 'ds-icon-btn', 'aria-label': 'Add a photo', title: 'Add a photo', onclick: () => addPhoto() }, icon('camera', 20));
	const snipBtn = opts.pro ? h('button', { class: 'ds-icon-btn', 'aria-label': 'Quick replies', title: 'Quick replies', onclick: () => snippets() }, '⚡') : null;
	const compose = h('div', { class: 'ds-cm-mcompose ds-ib-compose' }, attachBtn, snipBtn, ta, send);
	put(b, head, ctxBox, list, tray, compose);
	let last = 0, timer = 0, data = null, firstLoad = true;
	const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(160, ta.scrollHeight) + 'px'; };
	ta.addEventListener('input', grow);
	ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) { e.preventDefault(); send.click(); } });

	const load = async (scroll = true) => {
		if (!list.isConnected) { clearTimeout(timer); return; }
		try {
			const r = await api('inbox/thread', { query: id ? { id } : { with: view.with } });
			data = r;
			setUnread(r.unread);
			if (r.id && !id) id = r.id;
			if (firstLoad) { drawHead(r); drawContext(r); firstLoad = false; }
			const lastId = r.items.length ? r.items[r.items.length - 1].id : 0;
			if (lastId !== last || scroll === 'force') {
				last = lastId;
				drawMessages(r);
				list.scrollTop = list.scrollHeight;
			} else markSeen(r);
			if (r.blocked) { ta.disabled = send.disabled = attachBtn.disabled = true; ta.placeholder = 'You can’t message this member.'; }
		} catch (e) { if (firstLoad) { b.innerHTML = ''; b.append(h('p', { class: 'ds-err' }, e.message)); } }
		clearTimeout(timer);
		timer = setTimeout(() => load(false), document.visibilityState === 'visible' ? 8000 : 60000);
	};

	const drawHead = (r) => {
		head.innerHTML = '';
		const w = r.with || {};
		const menu = h('details', { class: 'ds-menu' }, h('summary', { class: 'ds-icon-btn', 'aria-label': 'Conversation options' }, '⋯'),
			h('div', { class: 'ds-menu-pop' },
				h('button', { onclick: () => upd({ muted: !r.muted }, r.muted ? 'Alerts back on.' : 'Muted — you won’t get alerts for this conversation.') }, r.muted ? '🔔 Unmute' : '🔕 Mute alerts'),
				h('button', { onclick: () => upd({ archived: !r.archived }, r.archived ? 'Moved back to your inbox.' : 'Archived. A new message brings it back.') }, r.archived ? '📥 Unarchive' : '🗂️ Archive'),
				h('button', { onclick: () => upd({ unread: 1 }, 'Marked unread.') }, '● Mark unread'),
				r.context && r.context.is_pro ? h('button', { onclick: () => upd({ state: r.state === 'done' ? 'replied' : 'done' }, r.state === 'done' ? 'Reopened.' : 'Closed — it reopens if they write again.') }, r.state === 'done' ? '↩️ Reopen' : '✅ Mark handled') : null,
				w.role === 'member' && I.ctx.openMember ? h('button', { onclick: () => I.ctx.openMember(w.id) }, '👤 View profile') : null));
		put(head, avatarOf(w, 40), h('div', { class: 'ds-grow' }, h('b', null, w.name || 'Conversation'), h('small', { class: 'ds-muted' }, w.role === 'pro' ? '🧰 Contractor' : w.role === 'customer' ? 'Customer' : w.business ? '🧰 ' + w.business : 'Member')),
			w.phone && (w.role === 'pro' || w.role === 'customer') ? h('a', { class: 'ds-icon-btn', href: 'tel:' + w.phone.replace(/[^\d+]/g, ''), 'aria-label': 'Call' }, '📞') : null, menu);
	};
	const upd = async (patch, msg) => {
		try { await api('inbox/update', { body: { id, ...patch } }); toast(msg); firstLoad = true; load('force'); } catch (e) { toast(e.message); }
	};

	const drawContext = (r) => {
		ctxBox.innerHTML = '';
		const c = r.context;
		if (!c || !c.project) return;
		const p = c.project;
		const nx = c.next;
		const pro = c.is_pro;
		const card = h('div', { class: 'ds-ib-ctx' },
			p.after ? h('img', { src: p.after, alt: '' }) : null,
			h('div', { class: 'ds-grow' },
				h('b', null, `📋 ${p.title}`), h('small', null, [p.number, QS[p.status] || p.status, p.total ? '$' + Math.round(p.total).toLocaleString() : ''].filter(Boolean).join(' · ')),
				p.address ? h('small', null, '📍 ', p.address) : null,
				p.services && p.services.length ? h('small', null, '🛠️ ', p.services.join(', ')) : null,
				nx ? h('small', { class: 'ds-ib-next' }, `📅 ${nx.title}: ${when(nx.start)}${nx.cust_status === 'confirmed' ? ' · ✅ confirmed' : nx.cust_status === 'reschedule' ? ' · 🔁 asked to reschedule' : ''}`) : null,
				c.due ? h('small', null, `💵 $${c.due.toLocaleString(undefined, { minimumFractionDigits: 2 })} due`) : null,
				pro && p.score != null ? h('small', null, `Brief ${p.score}% complete${p.missing && p.missing.length ? ` — missing ${p.missing.length} item${p.missing.length > 1 ? 's' : ''}` : ''}`) : null),
			h('div', { class: 'ds-ib-ctx-act' },
				pro && I.ctx.hub ? h('button', { class: 'ds-btn ds-sm', onclick: () => I.ctx.hub.openQuote(p.id) }, p.status === 'request' ? '🧾 Start the estimate' : '🧾 Open quote') : null,
				pro && I.ctx.hub ? h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => I.ctx.hub.bookVisit({ quote_id: p.id, client_id: c.client ? c.client.id : 0, title: p.title, kind: p.status === 'signed' ? 'job' : 'site_visit' }) }, '📅 Book a visit') : null,
				pro && p.status === 'request' ? h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => askMissing(p, () => load('force')) }, '❓ Ask for missing details') : null,
				!pro && p.link ? h('a', { class: 'ds-btn ds-sm', href: p.link, target: '_blank', rel: 'noopener' }, p.status === 'signed' ? 'View proposal' : '✍️ View & sign') : null,
				!pro && I.ctx.openProjects ? h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => I.ctx.openProjects() }, 'My Projects') : null));
		ctxBox.append(card);
	};

	const markSeen = (r) => {
		const seen = list.querySelector('.ds-seen');
		if (seen) seen.remove();
		const mine = [...r.items].reverse().find((m) => m.mine);
		if (mine && r.other_read && r.other_read >= mine.at) {
			const el = list.querySelector(`[data-mid="${mine.id}"]`);
			if (el) el.append(h('small', { class: 'ds-seen' }, 'Seen'));
		}
	};

	const drawMessages = (r) => {
		list.innerHTML = '';
		if (!r.items.length) list.append(h('p', { class: 'ds-muted ds-center' }, r.kind === 'hire' ? 'Say hello — ask a question, share a photo or suggest a time.' : 'Say hi! Be friendly — messages follow the community rules.'));
		let day = '';
		for (const m of r.items) {
			const d = new Date(m.at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
			if (d !== day) { day = d; list.append(h('div', { class: 'ds-cm-day' }, d)); }
			const time = new Date(m.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
			const pics = m.attach && m.attach.length ? h('div', { class: 'ds-ib-pics' }, ...m.attach.map((a) => h('a', { href: a.url, target: '_blank', rel: 'noopener' }, h('img', { src: a.url, alt: a.name || 'Photo', loading: 'lazy' })))) : null;
			if (m.kind === 'system') { list.append(h('div', { class: 'ds-ib-sys', 'data-mid': m.id }, m.body, h('small', null, ' · ' + time))); continue; }
			if (m.kind === 'brief') {
				list.append(h('div', { class: 'ds-ib-brief' + (m.mine ? ' mine' : ''), 'data-mid': m.id }, pics, h('p', null, m.body), h('small', null, time)));
				continue;
			}
			list.append(h('div', { class: 'ds-cm-bubble' + (m.mine ? ' mine' : '') + (m.kind === 'auto' ? ' auto' : ''), 'data-mid': m.id },
				m.kind === 'auto' ? h('small', { class: 'ds-ib-auto' }, '🤖 Automatic message') : null, pics, m.body ? h('p', null, m.body) : null, h('small', null, time)));
		}
		markSeen(r);
	};

	const addPhoto = async () => {
		if (files.length >= 5) return toast('Up to 5 photos per message.');
		const pick = await new Promise((res) => {
			const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => { m.remove(); res(null); } }, icon('close'));
			const m = modal(I.ctx.root, 'Add a photo', [h('div', { class: 'ds-row ds-wrap' },
				h('button', { class: 'ds-btn', onclick: () => { m.remove(); res('camera'); } }, icon('camera', 18), ' Take a photo'),
				h('button', { class: 'ds-btn ds-ghost', onclick: () => { m.remove(); res('file'); } }, icon('upload', 18), ' Choose a photo'))], close);
		});
		if (!pick) return;
		const shot = pick === 'camera' ? await camera(I.ctx.root, 'Show what you mean — the spot, the problem or the idea.') : await pickFile();
		if (!shot || shot.error) { if (shot && shot.error) toast(shot.error); return; }
		const c = shot.bitmap, k = Math.min(1, 1600 / Math.max(c.width, c.height));
		const o = document.createElement('canvas'); o.width = c.width * k; o.height = c.height * k; o.getContext('2d').drawImage(c, 0, 0, o.width, o.height);
		const url = o.toDataURL('image/jpeg', 0.84);
		files.push({ url });
		drawTray();
	};
	const drawTray = () => { tray.innerHTML = ''; files.forEach((f, i) => tray.append(h('span', { class: 'ds-ph' }, h('img', { src: f.url, alt: '' }), h('button', { class: 'ds-icon-btn', 'aria-label': 'Remove photo', onclick: () => { files.splice(i, 1); drawTray(); } }, icon('close', 12))))); };

	const snippets = async () => {
		if (!has('inbox_pro') && !has('snippets')) { const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close')); const m = modal(I.ctx.root, 'Quick replies', [lockNote('snippets')], close); return; }
		let list2 = [];
		try { list2 = ((await api('crm/me')).settings || {}).snippets || []; } catch (e) { /* none */ }
		const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
		const first = data && data.with ? (data.with.name || '').split(' ')[0] : '';
		const m = modal(I.ctx.root, 'Quick replies', [
			list2.length ? h('div', { class: 'ds-hub-list' }, ...list2.map((s) => h('button', { class: 'ds-hub-row', onclick: () => { ta.value = (ta.value ? ta.value + ' ' : '') + s.replace(/\{\{?\s*customer_first_name(\|[^}]*)?\s*\}?\}/gi, first || 'there'); grow(); m.remove(); ta.focus(); } }, h('span', null, s)))) : h('p', { class: 'ds-hint' }, 'No quick replies yet. Save the answers you type over and over — like your availability or what to expect at a site visit — then insert them with one tap.'),
			I.ctx.hub && I.ctx.hub.openSettings ? h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => { m.remove(); I.ctx.hub.openSettings('snippets'); } }, '✏️ Edit quick replies') : null], close);
	};

	send.onclick = async () => {
		const body = ta.value.trim();
		if (!body && !files.length) return;
		send.disabled = true;
		try {
			const r = await api('inbox/send', { body: id ? { id, body, attach: files } : { with: view.with, body, attach: files } });
			if (!id) id = r.id;
			ta.value = ''; files.length = 0; drawTray(); grow();
			await load('force');
		} catch (e) { if (!planPrompt(e, toast)) toast(e.message, 5000); }
		send.disabled = false;
		ta.focus();
	};
	if (opts.pro) loadCaps();
	await load('force');
}

/** Contractor: ask the homeowner for exactly what's missing from their request. */
function askMissing(p, done) {
	const pick = new Set(p.missing || []);
	const note = h('textarea', { rows: 3, placeholder: 'Anything else you need? (e.g. “A photo of the gate, please.”)' });
	const err = h('p', { class: 'ds-err' });
	const go = h('button', { class: 'ds-btn ds-wide' }, icon('send', 16), ' Send request');
	const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
	const m = modal(I.ctx.root, 'Ask for missing details', [
		h('p', { class: 'ds-hint' }, 'The homeowner gets one short, specific message (your “Ask for missing details” message, in your words) with a link to add these to their project.'),
		(p.missing || []).length ? h('div', { class: 'ds-checks' }, ...p.missing.map((x) => h('label', { class: 'ds-check' }, h('input', { type: 'checkbox', checked: true, onchange: (e) => (e.target.checked ? pick.add(x) : pick.delete(x)) }), ' ' + x))) : h('p', { class: 'ds-muted' }, 'Their brief is complete — add a note for anything else.'),
		note, err, go], close);
	go.onclick = async () => {
		go.disabled = true;
		try { await api('req/missing', { body: { quote_id: p.id, items: [...pick], note: note.value } }); m.remove(); toast('Sent. You’ll see their answer here.'); done && done(); } catch (e) { err.textContent = e.message; go.disabled = false; }
	};
}

/** Homeowner alert settings (email for new messages). */
async function settingsSheet() {
	let prefs = { email_messages: 1 };
	try { const r = await api('c/me'); prefs = r.notify || prefs; } catch (e) { /* default */ }
	const cb = h('input', { type: 'checkbox', checked: !!prefs.email_messages });
	const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
	const save = h('button', { class: 'ds-btn' }, 'Save');
	const m = modal(I.ctx.root, 'Message alerts', [
		h('p', { class: 'ds-hint' }, 'New messages always show a red count on the 💬 button and in your notifications. You can also get an email — at most one per conversation every 15 minutes, so you’re never flooded.'),
		h('label', { class: 'ds-check' }, cb, ' Email me when someone sends me a message'),
		h('p', { class: 'ds-hint' }, 'To stop alerts from one conversation, open it and choose ⋯ → Mute alerts.'), save], close);
	save.onclick = async () => {
		save.disabled = true;
		try { await api('c/profile', { body: { notify: { ...prefs, email_messages: cb.checked ? 1 : 0 } } }); m.remove(); toast('Saved.'); } catch (e) { toast(e.message); save.disabled = false; }
	};
}

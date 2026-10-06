/* DreamScaper – Dreamscape Browser (community): discover and share designs, ask for ideas,
 * like / rate / comment, member profiles, follow & friends, messages, notifications,
 * points, levels, badges and rewards.
 */
import { h, put, icon, canvas, canvasToBlob } from './util.js?v=2.7.2';
import { session, api, onSession, setCommunity, setAi, setStorage } from './api.js?v=2.7.2';
import { openAuth } from './account.js?v=2.7.2';
import { modal } from './capture.js?v=2.7.2';
import { PRESET_TAGS } from './browser.js?v=2.7.2';

let C = null; // { ctx, body, stack, cur }
const COMMUNITY_TAGS = ['Front yard', 'Backyard', 'Bed designs', 'Paver designs', 'Patio', 'Walkway', 'Low maintenance', 'Native plants', 'Pollinator garden', 'Shade garden', 'Privacy', 'Curb appeal', 'Modern', 'Cottage', 'Before & after', 'AI design'];
const EMOJI = Object.fromEntries(PRESET_TAGS);

/* ------------------------------------------------------------------ bits */
const ago = (t) => {
	const s = Math.max(1, Math.round((Date.now() - t) / 1000));
	if (s < 60) return 'just now';
	if (s < 3600) return Math.round(s / 60) + 'm';
	if (s < 86400) return Math.round(s / 3600) + 'h';
	if (s < 86400 * 30) return Math.round(s / 86400) + 'd';
	return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};
const n = (x) => (x >= 1000 ? (x / 1000).toFixed(x >= 10000 ? 0 : 1) + 'k' : String(x || 0));

export function avatar(m, size = 40) {
	const initials = (m && m.name ? m.name : '?').split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase();
	const lvl = m && m.level ? m.level.n : 1;
	return h('span', { class: `ds-av ds-av-l${Math.min(7, lvl)}`, style: { width: size + 'px', height: size + 'px', fontSize: Math.round(size * 0.38) + 'px' } },
		m && m.avatar ? h('img', { src: m.avatar, alt: '', loading: 'lazy' }) : initials);
}
export function memberName(m, { title = false, click = true } = {}) {
	const el = h(click ? 'button' : 'span', { class: 'ds-mn' + (click ? ' ds-mn-link' : ''), onclick: click && m && m.id ? (e) => { e.stopPropagation(); go({ v: 'user', id: m.id }); } : null },
		h('span', { class: 'ds-ns-' + ((m && m.style) || 'plain') }, m ? m.name : ''),
		m && m.staff ? h('span', { class: 'ds-staff' }, 'Team') : null,
		title && m ? h('small', { class: 'ds-mtitle' }, m.title) : null);
	return el;
}
function stars(v, onRate, mine = 0) {
	const box = h('span', { class: 'ds-stars' + (onRate ? ' ds-stars-in' : ''), role: onRate ? 'radiogroup' : 'img', 'aria-label': onRate ? 'Rate this design' : `${v} out of 5 stars` });
	for (let i = 1; i <= 5; i++) {
		const on = onRate ? i <= mine : i <= Math.round(v);
		put(box, onRate ? h('button', { class: on ? 'on' : '', 'aria-label': `${i} star${i > 1 ? 's' : ''}`, onclick: () => onRate(i) }, '★') : h('span', { class: on ? 'on' : '' }, '★'));
	}
	return box;
}
function need(reason) {
	if (session.user) return Promise.resolve(true);
	return openAuth({ reason: reason || 'Sign in to join the DreamScaper community — it’s free.' });
}
const toast = (m, ms) => C && C.ctx.toast(m, ms);

/* ------------------------------------------------------------ rewards */

/** Points / badges / levels just earned. */
export function showRewards(list) {
	if (!C) return;
	let pts = 0;
	const why = [];
	for (const r of list) {
		if (r.points) { pts += r.points; if (r.why) why.push(r.why); }
		if (r.badge) celebrate('New badge!', r.badge.emoji, r.badge.name, 'Badges show on your profile. Collect them all!');
		if (r.level) celebrate('Level up!', r.level.emoji, `Level ${r.level.n}: ${r.level.name}`, r.level.n >= 3 ? 'You unlocked a new name style — pick it in My profile → Rewards.' : 'Keep designing, sharing and helping to reach the next level.');
	}
	if (pts) toast(`🌟 +${pts} points${why.length ? ' · ' + [...new Set(why)].join(', ') : ''}`, 3500);
}
function celebrate(head, emoji, name, sub) {
	const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
	const m = modal(C.ctx.root, head, [h('div', { class: 'ds-celebrate' }, h('div', { class: 'ds-cel-e' }, emoji), h('b', null, name), h('p', { class: 'ds-muted' }, sub),
		h('div', { class: 'ds-confetti', 'aria-hidden': 'true' }, ...Array.from({ length: 18 }, (_, i) => h('i', { style: { left: (i * 5.5 + 2) + '%', animationDelay: (i % 6) * 0.12 + 's', background: ['#7be0a0', '#f4c95d', '#ff8fb1', '#8ec5ff'][i % 4] } }))),
		h('button', { class: 'ds-btn', onclick: () => { m.remove(); go({ v: 'me' }); } }, 'See my rewards'))], close, 'ds-modal-auth');
}

/* -------------------------------------------------------------- polling */
let pollT = 0;
export function initCommunity(ctx) {
	C = { ctx, body: null, stack: [], cur: null };
	const tick = async () => {
		if (session.user && session.community && session.community.on && document.visibilityState === 'visible') {
			try { const c = await api('c/status'); if (c) { delete c.rewards; setCommunity(c); } } catch (e) { /* offline */ }
		}
		pollT = setTimeout(tick, 60000);
	};
	clearTimeout(pollT);
	pollT = setTimeout(tick, 60000);
}
export function stopCommunity() { clearTimeout(pollT); }

/** Red count bubble that keeps itself up to date. which: 'notes' | 'msgs' | 'all' */
export function unreadDot(which = 'all') {
	const el = h('span', { class: 'ds-dot-n', hidden: true });
	const draw = () => {
		const u = (session.community && session.community.unread) || {};
		const c = which === 'all' ? (u.notes || 0) + (u.msgs || 0) : u[which] || 0;
		el.hidden = !c || !session.user;
		el.textContent = c > 99 ? '99+' : String(c);
	};
	draw();
	el._off = onSession(draw);
	return el;
}

/* ------------------------------------------------------------- framing */

/** Open the Dreamscape Browser (community). view: { v: 'feed'|'post'|'user'|'me'|'notes'|'msgs'|'thread'|... } */
export function openCommunity(view = { v: 'feed', tab: 'discover' }) {
	const { ctx } = C;
	ctx.leave();
	const root = ctx.root;
	root.innerHTML = '';
	const body = h('div', { class: 'ds-cm-body' });
	const bar = h('div', { class: 'ds-cm-bar' },
		h('button', { class: 'ds-btn ds-ghost ds-sm ds-cm-back', onclick: back, 'aria-label': 'Back' }, '←', h('span', null, ' Back')),
		h('h1', null, '🌎 Dreamscape Browser'),
		h('div', { class: 'ds-spacer' }),
		h('button', { class: 'ds-icon-btn ds-cm-ic', 'aria-label': 'Notifications', title: 'Notifications', onclick: () => go({ v: 'notes' }) }, icon('bell', 22), unreadDot('notes')),
		h('button', { class: 'ds-icon-btn ds-cm-ic', 'aria-label': 'Messages', title: 'Messages', onclick: () => go({ v: 'msgs' }) }, icon('chat', 22), unreadDot('msgs')),
		h('button', { class: 'ds-cm-me', 'aria-label': 'My profile & rewards', title: 'My profile & rewards', onclick: () => go({ v: 'me' }) }, session.user && session.community.me ? avatar(session.community.me, 34) : icon('person', 22)),
		h('button', { class: 'ds-btn ds-sm ds-cm-postbtn', onclick: postMenu }, icon('plus', 18), h('span', null, ' Post')));
	root.append(ctx.header(), h('main', { class: 'ds-home ds-comm' }, bar, body));
	C.body = body;
	C.stack = [];
	C.cur = null;
	go(view);
}
function back() {
	if (C.stack.length) { const v = C.stack.pop(); render(v); } else C.ctx.home();
}
export function go(view, push = true) {
	if (!C.body || !C.body.isConnected) return openCommunity(view);
	if (push && C.cur) C.stack.push(C.cur);
	render(view);
}
function render(view) {
	C.cur = view;
	const b = C.body;
	b.innerHTML = '';
	b.scrollIntoView({ block: 'start' });
	const scroller = b.closest('.ds-home');
	if (scroller) scroller.scrollTop = 0;
	if (session.community && session.community.on === false) { put(b, h('div', { class: 'ds-soon' }, h('div', { class: 'ds-soon-ic' }, '🌎'), h('h2', null, 'The community is coming soon'))); return; }
	// 2.7: messages live in the Inbox (inbox.js)
	if (C.ctx.openInbox && (view.v === 'msgs' || view.v === 'thread')) { C.cur = null; return C.ctx.openInbox(view.v === 'thread' ? { with: view.with } : {}); }
	({ feed: viewFeed, post: viewPost, user: viewUser, me: viewMe, notes: viewNotes, msgs: viewMsgs, thread: viewThread, friends: viewFriends, leaders: viewLeaders, people: viewPeople, follows: viewFollows }[view.v] || viewFeed)(b, view);
}
const loading = () => h('p', { class: 'ds-muted ds-cm-loading' }, h('span', { class: 'ds-spin ds-spin-sm' }), ' Loading…');

/* ------------------------------------------------------------------ feed */

const TABS = [['discover', '✨ Discover'], ['following', '👥 Following'], ['ideas', '🙋 Ask for ideas'], ['leaders', '🏆 Leaders'], ['people', '🔍 People']];
const SORTS = [['trending', 'Trending'], ['new', 'Newest'], ['top', 'Top rated'], ['liked', 'Most liked'], ['discussed', 'Most discussed'], ['viewed', 'Most viewed']];
const RANGES = [['', 'All time'], ['week', 'This week'], ['month', 'This month'], ['year', 'This year']];

function tabs(cur) {
	return h('nav', { class: 'ds-cm-tabs', role: 'tablist' }, ...TABS.map(([id, label]) => h('button', { role: 'tab', 'aria-selected': String(cur === id), class: cur === id ? 'on' : '', onclick: () => go(id === 'leaders' ? { v: 'leaders' } : id === 'people' ? { v: 'people' } : { v: 'feed', tab: id }, false) }, label)));
}

function progressBanner() {
	const c = session.community;
	if (!session.user || !c || !c.level) {
		return h('div', { class: 'ds-cm-join' }, h('div', null, h('b', null, 'Join the community'), h('p', null, 'Share your designs, get ideas from neighbors, and earn points you can trade for AI credits and storage.')),
			h('button', { class: 'ds-btn', onclick: async () => { if (await need()) render(C.cur); } }, 'Sign in — it’s free'));
	}
	const L = c.level;
	const pct = L.next_at ? Math.min(100, ((c.total - L.from) / (L.next_at - L.from)) * 100) : 100;
	return h('button', { class: 'ds-cm-prog', onclick: () => go({ v: 'me' }) },
		avatar(c.me, 42),
		h('div', null,
			h('div', { class: 'ds-row ds-between' }, h('b', null, `${L.emoji} Level ${L.n} · ${L.name}`), h('span', { class: 'ds-pts' }, `🌟 ${n(c.points)} points`)),
			h('div', { class: 'ds-bar' }, h('i', { style: { width: pct + '%' } })),
			h('small', null, L.next ? `${n(L.next_at - c.total)} points to ${L.next} · tap for rewards & badges` : 'Top level reached — you’re a Garden Legend!')));
}

function viewFeed(b, v) {
	const tab = v.tab || 'discover';
	const st = { sort: v.sort || (tab === 'ideas' ? 'new' : 'trending'), q: v.q || '', tag: v.tag || '', range: v.range || '', min: v.min || '', page: 1 };
	const q = h('input', { type: 'search', placeholder: tab === 'ideas' ? 'Search questions…' : 'Search designs, plants, tags…', value: st.q, 'aria-label': 'Search' });
	const sel = (opts, val, label, on) => h('select', { 'aria-label': label, onchange: (e) => on(e.target.value) }, ...opts.map(([k, t]) => h('option', { value: k, selected: k === val }, t)));
	const tagRow = h('div', { class: 'ds-chips ds-cm-tagrow' });
	const grid = h('div', { class: 'ds-cm-grid' });
	const more = h('button', { class: 'ds-btn ds-ghost ds-wide', hidden: true }, 'Show more');
	const count = h('p', { class: 'ds-muted ds-sm-text' });
	put(b, progressBanner(), tabs(tab),
		tab === 'ideas' ? h('div', { class: 'ds-cm-ask' }, h('div', null, h('b', null, '🙋 Not sure what to do with a spot?'), h('p', null, 'Post a photo of any area of your property and ask the community for designs, plant ideas and advice. Members earn points for helping.')), h('button', { class: 'ds-btn', onclick: () => askIdeas() }, icon('camera', 18), ' Ask for ideas')) : null,
		h('div', { class: 'ds-cm-tools' },
			h('label', { class: 'ds-br-search' }, icon('search', 18), q),
			sel(SORTS, st.sort, 'Sort', (x) => { st.sort = x; load(true); }),
			sel(RANGES, st.range, 'When', (x) => { st.range = x; load(true); }),
			tab !== 'ideas' ? sel([['', 'Any rating'], ['4', '4★ and up'], ['4.5', '4.5★ and up']], st.min, 'Rating', (x) => { st.min = x; load(true); }) : null),
		tagRow, count, grid, more);
	const drawTags = (extra = []) => {
		tagRow.innerHTML = '';
		const all = [...new Set([...COMMUNITY_TAGS, ...extra])].slice(0, 28);
		put(tagRow, h('button', { class: 'ds-chip' + (!st.tag ? ' on' : ''), onclick: () => { st.tag = ''; drawTags(extra); load(true); } }, 'All'),
			...all.map((t) => h('button', { class: 'ds-chip' + (st.tag === t ? ' on' : ''), onclick: () => { st.tag = st.tag === t ? '' : t; drawTags(extra); load(true); } }, (EMOJI[t] ? EMOJI[t] + ' ' : '') + t)));
	};
	drawTags();
	api('c/tags').then((j) => drawTags(j.tags || [])).catch(() => {});
	let tq;
	q.addEventListener('input', () => { clearTimeout(tq); tq = setTimeout(() => { st.q = q.value.trim(); load(true); }, 300); });
	more.onclick = () => { st.page++; load(false); };
	async function load(reset) {
		if (reset) { st.page = 1; grid.innerHTML = ''; put(grid, loading()); }
		Object.assign(C.cur, { sort: st.sort, q: st.q, tag: st.tag, range: st.range, min: st.min });
		if (tab === 'following' && !session.user) { grid.innerHTML = ''; put(grid, emptyBox('👥', 'See designs from people you follow', 'Sign in, then tap Follow on any member’s profile.', 'Sign in', async () => { if (await need()) render(C.cur); })); return; }
		try {
			const j = await api('c/feed', { query: { kind: tab === 'ideas' ? 'help' : tab === 'discover' ? '' : '', sort: st.sort, q: st.q, tag: st.tag, range: st.range, min_rating: st.min, following: tab === 'following' ? 1 : '', page: st.page } });
			if (reset) grid.innerHTML = '';
			for (const p of j.items) put(grid, postCard(p));
			more.hidden = !j.more;
			if (reset && !j.items.length) {
				put(grid, tab === 'ideas' ? emptyBox('🙋', 'No questions yet', 'Be the first: post a photo of a spot and ask for ideas.', 'Ask for ideas', askIdeas)
					: tab === 'following' ? emptyBox('👥', 'Nothing from people you follow yet', 'Follow members whose designs you like and their new posts show up here.', 'Discover designs', () => go({ v: 'feed', tab: 'discover' }, false))
						: emptyBox('🌱', st.q || st.tag ? 'No designs match' : 'No designs shared yet', st.q || st.tag ? 'Try a different word or tag.' : 'Be the first to share a Dreamscape and earn the Show-off badge!', 'Share a design', postMenu));
			}
			count.textContent = '';
		} catch (e) { grid.innerHTML = ''; put(grid, h('p', { class: 'ds-err' }, e.message)); }
	}
	load(true);
}
function emptyBox(emoji, title, text, label, fn) {
	return h('div', { class: 'ds-empty ds-span' }, h('span', { class: 'ds-cm-emptye' }, emoji), h('b', null, title), h('p', { class: 'ds-muted' }, text), label ? h('button', { class: 'ds-btn', onclick: fn }, label) : null);
}

function postCard(p) {
	return h('button', { class: 'ds-cm-card', onclick: () => go({ v: 'post', id: p.id }) },
		h('div', { class: 'ds-cm-img' }, h('img', { src: p.thumb, alt: '', loading: 'lazy' }),
			p.kind === 'help' ? h('span', { class: 'ds-cm-kind' }, '🙋 Ask for ideas') : null,
			p.status !== 'live' ? h('span', { class: 'ds-cm-kind ds-cm-hidden' }, 'Hidden — under review') : null),
		h('div', { class: 'ds-cm-cbody' },
			h('b', null, p.title),
			h('div', { class: 'ds-cm-author' }, avatar(p.author, 22), memberName(p.author, { click: false }), h('small', null, ' · ' + ago(p.created))),
			h('div', { class: 'ds-cm-stats' },
				h('span', { class: p.liked ? 'on' : '' }, '👍 ', n(p.likes)),
				p.kind === 'design' ? h('span', null, p.ratings ? `★ ${p.rating}` : '★ –') : null,
				h('span', null, '💬 ', n(p.comments)),
				h('span', null, '👁 ', n(p.views)))));
}

/* ------------------------------------------------------------------ post */

async function viewPost(b, v) {
	put(b, loading());
	let p;
	try { p = await api('c/post', { query: { id: v.id } }); } catch (e) { b.innerHTML = ''; put(b, emptyBox('😕', 'This post isn’t available', e.message, 'Back to the Browser', () => go({ v: 'feed', tab: 'discover' }, false))); return; }
	b.innerHTML = '';
	const likeBtn = h('button', { class: 'ds-btn ds-ghost ds-like' + (p.liked ? ' on' : '') });
	const drawLike = () => { likeBtn.innerHTML = ''; put(likeBtn, '👍 ', p.liked ? 'Liked' : 'Like', h('b', null, ' ' + n(p.likes))); likeBtn.classList.toggle('on', !!p.liked); };
	drawLike();
	likeBtn.onclick = async () => {
		if (!(await need('Sign in to like designs.'))) return;
		try { const j = await api('c/like', { body: { id: p.id } }); p.liked = j.liked; p.likes = j.likes; drawLike(); } catch (e) { toast(e.message); }
	};
	const rateBox = h('div', { class: 'ds-cm-rate' });
	const drawRate = () => {
		rateBox.innerHTML = '';
		put(rateBox, h('span', null, stars(p.rating), ` ${p.ratings ? p.rating.toFixed(1) : '–'} (${p.ratings} rating${p.ratings === 1 ? '' : 's'})`),
			p.kind === 'design' && !p.mine ? h('span', { class: 'ds-cm-myrate' }, h('small', null, p.my_rating ? 'Your rating:' : 'Rate it:'), stars(0, async (s) => {
				if (!(await need('Sign in to rate designs.'))) return;
				try { const j = await api('c/rate', { body: { id: p.id, stars: s } }); p.rating = j.rating; p.ratings = j.ratings; p.my_rating = j.mine; drawRate(); toast('Thanks for rating!'); } catch (e) { toast(e.message); }
			}, p.my_rating || 0)) : null);
	};
	if (p.kind === 'design') drawRate();
	const follow = !p.mine ? followButton(p.author.id, p.following) : null;
	const media = p.before ? beforeAfter(p.before, p.image) : h('img', { class: 'ds-cm-main', src: p.image, alt: p.title });
	put(b,
		h('article', { class: 'ds-cm-post' },
			h('div', { class: 'ds-cm-media' }, media),
			h('div', { class: 'ds-cm-side' },
				p.kind === 'help' ? h('span', { class: 'ds-cm-kind ds-static' }, '🙋 Asking for ideas') : null,
				h('h2', null, p.title),
				h('div', { class: 'ds-cm-author ds-cm-author-lg' }, avatar(p.author, 44), h('div', null, memberName(p.author, { title: true }), h('small', null, ago(p.created) + ' · 👁 ' + n(p.views) + ' views')), follow),
				p.body ? h('p', { class: 'ds-cm-text' }, p.body) : null,
				p.tags.length ? h('div', { class: 'ds-chips' }, ...p.tags.map((t) => h('button', { class: 'ds-chip', onclick: () => go({ v: 'feed', tab: p.kind === 'help' ? 'ideas' : 'discover', tag: t }) }, '#' + t))) : null,
				p.kind === 'design' ? rateBox : null,
				h('div', { class: 'ds-row ds-wrap ds-cm-acts' }, likeBtn,
					h('button', { class: 'ds-btn ds-ghost', onclick: () => { const t = b.querySelector('.ds-cm-comments textarea'); t.scrollIntoView({ block: 'center' }); t.focus(); } }, '💬 ', p.kind === 'help' ? 'Give ideas' : 'Comment'),
					!p.mine ? h('button', { class: 'ds-btn ds-ghost', onclick: async () => { if (await need()) go({ v: 'thread', with: p.author.id }); } }, icon('chat', 16), ' Message') : null,
					h('button', { class: 'ds-btn ds-ghost', onclick: () => sharePost(p) }, icon('share', 16), ' Share'),
					p.mine ? h('button', { class: 'ds-btn ds-ghost ds-danger', onclick: async () => { if (!confirm('Delete this post?')) return; try { await api('c/post/delete', { body: { id: p.id } }); toast('Post deleted.'); back(); } catch (e) { toast(e.message); } } }, icon('trash', 16), ' Delete')
						: h('button', { class: 'ds-link ds-sm-text', onclick: () => report('post', p.id) }, 'Report')),
				p.kind === 'design' ? assetsList(p) : null)),
		commentsBox(p));
}

function beforeAfter(before, after) {
	const box = h('div', { class: 'ds-cmp ds-cm-cmp' });
	const a = h('img', { src: after, alt: 'After', class: 'ds-cmp-after', draggable: false });
	const knob = h('div', { class: 'ds-cmp-knob', role: 'slider', 'aria-label': 'Compare before and after', tabindex: 0 }, h('span', null, icon('compare', 18)));
	put(box, h('img', { src: before, alt: 'Before', draggable: false }), a, knob, h('span', { class: 'ds-cmp-tag l' }, 'Before'), h('span', { class: 'ds-cmp-tag r' }, 'After'));
	let x = 0.5, drag = false;
	const set = (f) => { x = Math.max(0, Math.min(1, f)); a.style.clipPath = `inset(0 0 0 ${x * 100}%)`; knob.style.left = x * 100 + '%'; };
	const mv = (e) => { const r = box.getBoundingClientRect(); set((e.clientX - r.left) / r.width); };
	set(0.08);
	box.addEventListener('pointerdown', (e) => { drag = true; box.setPointerCapture(e.pointerId); mv(e); });
	box.addEventListener('pointermove', (e) => { if (drag) mv(e); });
	box.addEventListener('pointerup', () => { drag = false; });
	knob.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') set(x - 0.05); if (e.key === 'ArrowRight') set(x + 0.05); });
	return box;
}

const SEASON_NAME = { spring: '🌸 Spring', summer: '☀️ Summer', fall: '🍂 Fall', winter: '❄️ Winter' };
function assetsList(p) {
	const m = p.meta || {};
	const assets = m.assets || [];
	const ground = m.ground || [];
	if (!assets.length && !ground.length && !m.ai) return null;
	const fmt = (ft) => (ft == null ? '' : ft < 1 ? Math.round(ft * 12) + ' in' : (ft < 10 ? ft.toFixed(1).replace(/\.0$/, '') : Math.round(ft)) + ' ft');
	return h('section', { class: 'ds-cm-assets' },
		h('h4', null, '🌿 What’s in this design'),
		h('p', { class: 'ds-hint' }, [m.season ? SEASON_NAME[m.season] || m.season : '', m.years ? `shown ${m.years} year${m.years > 1 ? 's' : ''} after planting` : 'shown at planting time', m.ai ? '✨ made with Dreamscape AI' : ''].filter(Boolean).join(' · ')),
		assets.length ? h('ul', { class: 'ds-cm-alist' }, ...assets.map((a) => h('li', null,
			h('button', { class: 'ds-cm-asset', onclick: () => C.ctx.plantFacts(a.id) },
				h('span', { class: 'ds-cm-acount' }, '×' + a.count),
				h('span', { class: 'ds-cm-aname' }, h('b', null, a.name), a.sci ? h('i', null, a.sci) : null),
				h('small', null, [a.age != null && a.cat !== 'features' ? `${a.age < 1 ? 'under 1' : Math.round(a.age)} yr${a.age >= 2 ? 's' : ''} old` : '', a.h ? `${fmt(a.h)} tall` : ''].filter(Boolean).join(' · ')))))) : null,
		ground.length ? h('p', { class: 'ds-hint' }, h('b', null, 'Ground: '), ground.join(', ')) : null,
		assets.length ? h('p', { class: 'ds-hint' }, 'Tap a plant for its full facts and growth chart.') : null);
}

function commentsBox(p) {
	const box = h('section', { class: 'ds-cm-comments' });
	const list = h('div', { class: 'ds-cm-clist' });
	let replyTo = null, image = null;
	const ta = h('textarea', { rows: 2, maxlength: 2000, placeholder: p.kind === 'help' ? 'Share your ideas — plants, layout, tips…' : 'Say something nice or ask a question…' });
	const replyNote = h('div', { class: 'ds-cm-replyto', hidden: true });
	const imgPrev = h('div', { class: 'ds-cm-imgprev' });
	const send = h('button', { class: 'ds-btn' }, icon('send', 16), ' Post');
	const attach = p.kind === 'help' ? h('button', { class: 'ds-btn ds-ghost', title: 'Reply with a design picture', onclick: async () => {
		const pick = await chooseImage();
		if (!pick) return;
		image = pick;
		imgPrev.innerHTML = '';
		put(imgPrev, h('img', { src: pick.main, alt: '' }), h('button', { class: 'ds-link', onclick: () => { image = null; imgPrev.innerHTML = ''; } }, 'Remove'));
	} }, icon('image', 16), ' Add a design') : null;
	send.onclick = async () => {
		if (!(await need('Sign in to join the conversation.'))) return;
		const body = ta.value.trim();
		if (!body && !image) return toast('Write something first.');
		send.disabled = true;
		try {
			await api('c/comment', { body: { post: p.id, body, parent: replyTo ? replyTo.id : 0, image: image ? image.main : '' } });
			ta.value = ''; image = null; imgPrev.innerHTML = ''; replyTo = null; replyNote.hidden = true;
			p.comments++;
			load();
		} catch (e) { toast(e.message); }
		send.disabled = false;
	};
	put(box, h('h3', null, p.kind === 'help' ? '💡 Ideas & advice' : '💬 Comments'), list,
		h('div', { class: 'ds-cm-compose' }, session.user && session.community.me ? avatar(session.community.me, 34) : null,
			h('div', null, replyNote, ta, imgPrev, h('div', { class: 'ds-row ds-wrap ds-end' }, attach, send))));
	async function load() {
		list.innerHTML = '';
		put(list, loading());
		try {
			const j = await api('c/comments', { query: { id: p.id } });
			list.innerHTML = '';
			const top = j.items.filter((c) => !c.parent);
			if (!top.length) put(list, h('p', { class: 'ds-muted' }, p.kind === 'help' ? 'No ideas yet — be the first to help (and earn points)!' : 'No comments yet. Be the first!'));
			for (const c of top) {
				put(list, comment(c, false));
				for (const r of j.items.filter((x) => x.parent === c.id)) put(list, comment(r, true));
			}
		} catch (e) { list.innerHTML = ''; put(list, h('p', { class: 'ds-err' }, e.message)); }
	}
	function comment(c, isReply) {
		const like = h('button', { class: 'ds-link ds-sm-text' + (c.liked ? ' on' : '') }, `👍 ${c.likes || ''}`);
		like.onclick = async () => { if (!(await need())) return; try { const j = await api('c/like', { body: { id: c.id, kind: 'comment' } }); c.liked = j.liked; c.likes = j.likes; like.textContent = `👍 ${c.likes || ''}`; like.classList.toggle('on', c.liked); } catch (e) { toast(e.message); } };
		return h('div', { class: 'ds-cm-c' + (isReply ? ' reply' : '') },
			avatar(c.author, isReply ? 28 : 34),
			h('div', { class: 'ds-cm-cb' },
				h('div', { class: 'ds-cm-ch' }, memberName(c.author), h('small', null, ago(c.created))),
				c.body ? h('p', null, c.body) : null,
				c.image ? h('img', { class: 'ds-cm-cimg', src: c.image, alt: 'Design idea', loading: 'lazy', onclick: () => window.open(c.image, '_blank', 'noopener') }) : null,
				h('div', { class: 'ds-row ds-cm-cacts' }, like,
					h('button', { class: 'ds-link ds-sm-text', onclick: () => { replyTo = c; replyNote.hidden = false; replyNote.innerHTML = ''; put(replyNote, `Replying to ${c.author.name} `, h('button', { class: 'ds-link', onclick: () => { replyTo = null; replyNote.hidden = true; } }, 'Cancel')); ta.focus(); } }, 'Reply'),
					c.mine ? h('button', { class: 'ds-link ds-sm-text', onclick: async () => { if (!confirm('Delete your comment?')) return; await api('c/comment/delete', { body: { id: c.id } }).catch((e) => toast(e.message)); load(); } }, 'Delete')
						: h('button', { class: 'ds-link ds-sm-text', onclick: () => report('comment', c.id) }, 'Report'))));
	}
	load();
	return box;
}

function followButton(id, following) {
	const btn = h('button', { class: 'ds-btn ds-sm' + (following ? ' ds-ghost' : '') });
	const draw = () => { btn.innerHTML = ''; put(btn, following ? '✓ Following' : '+ Follow'); btn.classList.toggle('ds-ghost', !!following); };
	draw();
	btn.onclick = async (e) => {
		e.stopPropagation();
		if (!(await need('Sign in to follow members.'))) return;
		try { const j = await api('c/follow', { body: { id } }); following = j.following; draw(); } catch (er) { toast(er.message); }
	};
	return btn;
}

function report(kind, id) {
	if (!session.user) return need('Sign in to report something.');
	const reasons = ['Not about landscaping', 'Rude or offensive', 'Spam or advertising', 'Shows private information', 'Inappropriate picture', 'Something else'];
	let pick = '';
	const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
	const go1 = h('button', { class: 'ds-btn', disabled: true }, 'Send report');
	go1.onclick = async () => { try { await api('c/report', { body: { kind, id, reason: pick } }); m.remove(); toast('Thanks — our team will take a look.'); } catch (e) { toast(e.message); } };
	const m = modal(C.ctx.root, 'Report this ' + (kind === 'user' ? 'member' : kind), [
		h('p', { class: 'ds-hint' }, 'Reports are private. Anything reported by several members is hidden until our team reviews it.'),
		h('div', { class: 'ds-chips' }, ...reasons.map((r) => h('button', { class: 'ds-chip', onclick: (e) => { pick = r; e.currentTarget.parentNode.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === e.currentTarget)); go1.disabled = false; } }, r))),
		h('div', { class: 'ds-row ds-end' }, go1)], close, 'ds-modal-auth');
}

async function sharePost(p) {
	const url = location.href.split('#')[0] + '#dreamscaper';
	const text = `${p.title} — a DreamScaper design by ${p.author.name}`;
	if (navigator.share) { try { await navigator.share({ title: p.title, text, url }); return; } catch (e) { /* cancelled */ } }
	try { await navigator.clipboard.writeText(`${text} ${url}`); toast('Link copied — paste it anywhere to share.'); } catch (e) { toast(url); }
}

/* --------------------------------------------------------------- members */

async function viewUser(b, v) {
	put(b, loading());
	let m;
	try { m = await api('c/user', { query: { id: v.id } }); } catch (e) { b.innerHTML = ''; put(b, emptyBox('😕', 'Member not found', e.message)); return; }
	b.innerHTML = '';
	const friendBtn = h('button', { class: 'ds-btn ds-ghost ds-sm' });
	const drawFriend = () => { friendBtn.textContent = { none: '🤝 Add friend', sent: '⏳ Request sent', received: '✓ Accept friend request', friends: '🤝 Friends' }[m.friend || 'none']; };
	drawFriend();
	friendBtn.onclick = async () => {
		if (!(await need())) return;
		const action = m.friend === 'none' ? 'request' : m.friend === 'received' ? 'accept' : m.friend === 'sent' ? 'cancel' : 'remove';
		if (action === 'remove' && !confirm(`Remove ${m.name} from your friends?`)) return;
		try { const j = await api('c/friend', { body: { id: m.id, action } }); m.friend = j.friend; drawFriend(); } catch (e) { toast(e.message); }
	};
	const joined = new Date(m.joined);
	const months = Math.max(0, Math.round((Date.now() - m.joined) / (30.4 * 86400000)));
	const tenure = months < 1 ? 'New member' : months < 12 ? `Member for ${months} month${months > 1 ? 's' : ''}` : `Member for ${Math.floor(months / 12)} year${months >= 24 ? 's' : ''}`;
	const L = m.level;
	put(b,
		h('section', { class: 'ds-cm-profile' },
			avatar(m, 96),
			h('div', { class: 'ds-cm-pinfo' },
				h('h2', null, memberName(m, { click: false })),
				h('p', { class: 'ds-mtitle-lg' }, m.title),
				h('p', { class: 'ds-muted ds-sm-text' }, `${L.emoji} Level ${L.n} ${L.name} · 🌟 ${n(m.points)} points · ${tenure} (since ${joined.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })})`),
				m.bio ? h('p', null, m.bio) : null,
				h('div', { class: 'ds-cm-pstats' },
					h('button', { onclick: () => go({ v: 'follows', id: m.id, dir: 'followers', name: m.name }) }, h('b', null, n(m.followers)), h('small', null, 'followers')),
					h('button', { onclick: () => go({ v: 'follows', id: m.id, dir: 'following', name: m.name }) }, h('b', null, n(m.following)), h('small', null, 'following')),
					h('div', null, h('b', null, n(m.posts)), h('small', null, 'posts')),
					h('div', null, h('b', null, n(m.friends)), h('small', null, 'friends'))),
				m.me ? h('div', { class: 'ds-row ds-wrap' }, h('button', { class: 'ds-btn ds-sm', onclick: () => go({ v: 'me' }) }, icon('edit', 16), ' Edit profile & rewards'), h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => go({ v: 'friends' }) }, '🤝 My friends'))
					: h('div', { class: 'ds-row ds-wrap' }, followButton(m.id, m.following), friendBtn,
						h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: async () => { if (await need()) go({ v: 'thread', with: m.id }); } }, icon('chat', 16), ' Message'),
						h('button', { class: 'ds-link ds-sm-text', onclick: () => moreUser(m) }, 'More…')))),
		m.badges.length ? h('section', { class: 'ds-cm-badges' }, h('h3', null, `🏅 Badges (${m.badges.length})`), h('div', { class: 'ds-cm-bgrid' }, ...m.badges.map((x) => h('div', { class: 'ds-cm-badge', title: x.how }, h('span', null, x.emoji), h('b', null, x.name))))) : null,
		h('h3', null, `${m.me ? 'My' : m.name.split(' ')[0] + '’s'} posts`));
	const grid = h('div', { class: 'ds-cm-grid' }, loading());
	put(b, grid);
	try {
		const j = await api('c/feed', { query: { user: m.id, sort: 'new' } });
		grid.innerHTML = '';
		if (!j.items.length) put(grid, emptyBox('🌱', 'No posts yet', m.me ? 'Share a Dreamscape to show it off here.' : '', m.me ? 'Share a design' : '', postMenu));
		for (const p of j.items) put(grid, postCard(p));
	} catch (e) { grid.innerHTML = ''; }
}
function moreUser(m) {
	const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => md.remove() }, icon('close'));
	const md = modal(C.ctx.root, m.name, [
		h('button', { class: 'ds-btn ds-ghost ds-wide', onclick: async () => { md.remove(); try { const j = await api('c/block', { body: { id: m.id } }); toast(j.blocked ? `${m.name} is blocked. They can’t message you or see you in their feed.` : `${m.name} is unblocked.`); render(C.cur); } catch (e) { toast(e.message); } } }, m.blocked ? 'Unblock' : '🚫 Block this member'),
		h('button', { class: 'ds-btn ds-ghost ds-wide', onclick: () => { md.remove(); report('user', m.id); } }, '⚑ Report this member')], close, 'ds-modal-auth');
}

async function viewFollows(b, v) {
	put(b, h('h2', null, `${v.name} · ${v.dir === 'following' ? 'Following' : 'Followers'}`), loading());
	try {
		const j = await api('c/follows', { query: { id: v.id, dir: v.dir } });
		b.querySelector('.ds-cm-loading').remove();
		put(b, memberList(j.items, 'Nobody yet.'));
	} catch (e) { toast(e.message); }
}
function memberList(items, empty) {
	if (!items.length) return h('p', { class: 'ds-muted' }, empty);
	return h('div', { class: 'ds-cm-mlist' }, ...items.map((m) => h('button', { class: 'ds-cm-mrow', onclick: () => go({ v: 'user', id: m.id }) }, avatar(m, 40), h('div', null, memberName(m, { title: true, click: false })), icon('select', 16))));
}

async function viewPeople(b) {
	const q = h('input', { type: 'search', placeholder: 'Search members by name…', 'aria-label': 'Search members' });
	const out = h('div');
	put(b, progressBanner(), tabs('people'), h('label', { class: 'ds-br-search' }, icon('search', 18), q), out);
	const showTop = async () => {
		out.innerHTML = '';
		put(out, h('h3', null, '🌟 Most active this month'), loading());
		try { const j = await api('c/leaderboard', { query: { range: 'month' } }); out.innerHTML = ''; put(out, h('h3', null, '🌟 Most active this month'), memberList(j.items.map((x) => x.member), 'No one yet — be the first!')); } catch (e) { out.innerHTML = ''; }
	};
	let t;
	q.addEventListener('input', () => {
		clearTimeout(t);
		t = setTimeout(async () => {
			const s = q.value.trim();
			if (s.length < 2) return showTop();
			out.innerHTML = '';
			put(out, loading());
			try { const j = await api('c/users', { query: { q: s } }); out.innerHTML = ''; put(out, memberList(j.items, 'No members found.')); } catch (e) { out.innerHTML = ''; }
		}, 300);
	});
	showTop();
}

async function viewLeaders(b, v) {
	const range = v.range || 'month';
	put(b, progressBanner(), tabs('leaders'),
		h('div', { class: 'ds-seg ds-cm-seg' }, ...[['month', 'This month'], ['all', 'All time']].map(([k, t]) => h('button', { class: range === k ? 'on' : '', onclick: () => go({ v: 'leaders', range: k }, false) }, t))),
		h('p', { class: 'ds-hint' }, 'Earn points by designing, sharing, helping others and visiting daily. The top 10 each month earn the 🏆 Top Designer badge and the Legend glow name style.'));
	const list = h('ol', { class: 'ds-cm-leaders' }, loading());
	put(b, list);
	try {
		const j = await api('c/leaderboard', { query: { range } });
		list.innerHTML = '';
		if (!j.items.length) put(list, h('li', { class: 'ds-muted' }, 'No points yet this month — you could be #1!'));
		for (const r of j.items) {
			put(list, h('li', null, h('button', { class: 'ds-cm-lrow' + (session.user && r.member.id === session.user.id ? ' me' : ''), onclick: () => go({ v: 'user', id: r.member.id }) },
				h('span', { class: 'ds-cm-rank' }, r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : '#' + r.rank),
				avatar(r.member, 40), h('div', null, memberName(r.member, { title: true, click: false })), h('b', { class: 'ds-pts' }, '🌟 ' + n(r.points)))));
		}
	} catch (e) { list.innerHTML = ''; put(list, h('li', { class: 'ds-err' }, e.message)); }
}

/* ------------------------------------------------- my profile & rewards */

async function viewMe(b) {
	if (!(await need('Sign in to see your profile, points and badges.'))) return back();
	put(b, loading());
	let me;
	try { me = await api('c/me'); } catch (e) { b.innerHTML = ''; put(b, h('p', { class: 'ds-err' }, e.message)); return; }
	b.innerHTML = '';
	const pr = me.profile, L = me.level;
	const pct = L.next_at ? Math.min(100, ((me.total - L.from) / (L.next_at - L.from)) * 100) : 100;
	// edit profile
	let avatarData = null;
	const av = h('div', { class: 'ds-cm-avedit' }, avatar(pr, 88));
	const handle = h('input', { type: 'text', maxlength: 30, value: me.handle || pr.name, 'aria-label': 'Display name' });
	const bio = h('textarea', { rows: 3, maxlength: 300, placeholder: 'A line about you and your yard (e.g. “Hydrangea lover in Glastonbury”)' });
	bio.value = pr.bio || '';
	const pickAv = async () => {
		const shot = await C.ctx.capture('upload');
		if (!shot || shot.error) return;
		const s = Math.min(shot.bitmap.width, shot.bitmap.height);
		const c = canvas(256, 256);
		c.getContext('2d').drawImage(shot.bitmap, (shot.bitmap.width - s) / 2, (shot.bitmap.height - s) / 2, s, s, 0, 0, 256, 256);
		avatarData = c.toDataURL('image/jpeg', 0.85);
		av.innerHTML = '';
		put(av, h('span', { class: 'ds-av', style: { width: '88px', height: '88px' } }, h('img', { src: avatarData, alt: '' })));
	};
	const styleSel = h('div', { class: 'ds-cm-styles' }, ...me.styles.map((s) => h('button', { class: 'ds-cm-style' + (pr.style === s.id ? ' on' : ''), disabled: !s.unlocked, onclick: (e) => { pr.style = s.id; e.currentTarget.parentNode.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === e.currentTarget)); } },
		h('span', { class: 'ds-ns-' + s.id }, pr.name), h('small', null, s.unlocked ? s.name : '🔒 ' + s.name))));
	const titleSel = h('select', { 'aria-label': 'Title under your name' }, h('option', { value: '' }, `${L.emoji} ${L.name} (your level)`), ...me.titles.map((t) => h('option', { value: t.id, selected: me.title_id === t.id }, t.name)));
	const notify = {};
	const chk = (k, label) => { const c = h('input', { type: 'checkbox', checked: !!me.notify[k] }); c.addEventListener('change', () => { notify[k] = c.checked; }); return h('label', { class: 'ds-check' }, c, h('span', null, label)); };
	const save = h('button', { class: 'ds-btn' }, icon('check', 16), ' Save profile');
	save.onclick = async () => {
		save.disabled = true;
		try {
			const j = await api('c/profile', { body: { handle: handle.value.trim(), bio: bio.value.trim(), avatar: avatarData || undefined, style: pr.style, title: titleSel.value, notify } });
			setCommunity({ me: j.me, points: j.points, total: j.total, level: j.level });
			toast('Profile saved.');
			render(C.cur);
		} catch (e) { toast(e.message); }
		save.disabled = false;
	};
	const R = me.redeem;
	const redeem = (what, unit, label) => h('div', { class: 'ds-cm-reward' },
		h('span', { class: 'ds-cm-re' }, what === 'credit' ? '✨' : '☁️'),
		h('div', null, h('b', null, label), h('small', null, `${n(unit)} points`)),
		h('button', { class: 'ds-btn ds-sm', disabled: me.points < unit, onclick: async (e) => {
			e.currentTarget.disabled = true;
			try {
				const j = await api('c/redeem', { body: { what, qty: 1 } });
				if (j.ai) setAi(j.ai);
				if (j.storage) setStorage(j.storage);
				setCommunity({ points: j.points });
				toast('🎁 ' + j.message, 4000);
				render(C.cur);
			} catch (er) { toast(er.message); }
		} }, me.points >= unit ? 'Trade' : '🔒'));
	put(b,
		h('section', { class: 'ds-cm-mehead' },
			avatar(pr, 72),
			h('div', null, h('h2', null, memberName(pr, { click: false })), h('p', { class: 'ds-mtitle-lg' }, pr.title),
				h('button', { class: 'ds-link', onclick: () => go({ v: 'user', id: pr.id }) }, 'View my public profile →'))),
		h('section', { class: 'ds-cm-card2' },
			h('h3', null, `${L.emoji} Level ${L.n}: ${L.name}`),
			h('div', { class: 'ds-bar ds-bar-lg' }, h('i', { style: { width: pct + '%' } })),
			h('p', { class: 'ds-hint' }, L.next ? `${n(me.total)} lifetime points · ${n(L.next_at - me.total)} more to reach ${L.next}` : `${n(me.total)} lifetime points · you’ve reached the top!`),
			h('div', { class: 'ds-cm-levels' }, ...me.levels.map((l, i) => h('span', { class: i + 1 <= L.n ? 'on' : '' }, h('b', null, l.emoji), h('small', null, l.name)))),
			h('div', { class: 'ds-bal ds-bal-2' },
				h('div', null, h('b', null, '🌟 ' + n(me.points)), h('small', null, 'points to spend')),
				h('div', null, h('b', null, '🔥 ' + me.streak), h('small', null, `day${me.streak === 1 ? '' : 's'} in a row`)))),
		h('section', { class: 'ds-cm-card2' },
			h('h3', null, '🎁 Trade points for rewards'),
			h('div', { class: 'ds-cm-rewards' },
				R.credit_pts ? redeem('credit', R.credit_pts, '1 AI credit') : null,
				R.storage_pts ? redeem('storage', R.storage_pts, `${R.storage_mb} MB of storage`) : null)),
		h('section', { class: 'ds-cm-card2' },
			h('h3', null, '🌟 Ways to earn points'),
			h('ul', { class: 'ds-cm-ways' }, ...me.ways.map((w) => h('li', null, h('span', null, w.why), h('b', null, `+${w.points}`), h('small', null, w.once ? 'once' : w.cap ? `up to ${w.cap}× a day` : ''))))),
		h('section', { class: 'ds-cm-card2' },
			h('h3', null, `🏅 Badges (${me.all_badges.filter((x) => x.have).length} of ${me.all_badges.length})`),
			h('div', { class: 'ds-cm-bgrid' }, ...me.all_badges.map((x) => h('div', { class: 'ds-cm-badge' + (x.have ? '' : ' locked'), title: x.how }, h('span', null, x.have ? x.emoji : '🔒'), h('b', null, x.name), h('small', null, x.how))))),
		h('section', { class: 'ds-cm-card2' },
			h('h3', null, '✏️ My public profile'),
			h('div', { class: 'ds-cm-editrow' }, av, h('div', { class: 'ds-col' }, h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: pickAv }, icon('camera', 16), ' Change photo'), h('small', { class: 'ds-muted' }, 'Only your display name, photo, bio, level and badges are public — never your email, phone or address.'))),
			h('label', { class: 'ds-label' }, 'Display name', handle),
			h('label', { class: 'ds-label' }, 'About me', bio),
			h('p', { class: 'ds-label' }, 'Name style ', h('small', { class: 'ds-muted' }, '(unlock more by leveling up)')), styleSel,
			h('label', { class: 'ds-label' }, 'Title under your name', titleSel),
			h('p', { class: 'ds-label' }, 'Email me when…'),
			chk('email_messages', 'someone sends me a message'), chk('email_comments', 'someone comments on or replies to my posts'), chk('email_social', 'someone follows me or sends a friend request'),
			h('div', { class: 'ds-row ds-end' }, save)),
		me.log.length ? h('section', { class: 'ds-cm-card2' }, h('h3', null, '🧾 Recent points'),
			h('ul', { class: 'ds-cm-log' }, ...me.log.map((l) => h('li', null, h('span', null, l.why), h('b', { class: l.points < 0 ? 'neg' : '' }, (l.points > 0 ? '+' : '') + l.points), h('small', null, ago(l.at)))))) : null,
		me.blocked.length ? h('section', { class: 'ds-cm-card2' }, h('h3', null, '🚫 Blocked members'), memberList(me.blocked, '')) : null);
}

/* ---------------------------------------------------------- notifications */

async function viewNotes(b) {
	if (!(await need('Sign in to see your notifications.'))) return back();
	put(b, h('h2', null, '🔔 Notifications'), loading());
	try {
		const j = await api('c/notes');
		b.querySelector('.ds-cm-loading').remove();
		const go2 = (x) => {
			if (x.type === 'message') return C.ctx.openInbox ? C.ctx.openInbox(x.target ? { id: x.target } : { with: x.actor.id }) : go({ v: 'thread', with: x.actor.id });
			if (x.type === 'follow' || x.type === 'friend' || x.type === 'friend_ok') return go({ v: x.type === 'friend' ? 'friends' : 'user', id: x.actor && x.actor.id });
			if (x.type === 'badge' || x.type === 'level' || x.type === 'bonus') return go({ v: 'me' });
			if (x.type === 'crm') return C.ctx.openHub && C.ctx.openHub();
			if (x.type === 'project') return C.ctx.openProjects && C.ctx.openProjects();
			if (x.target) return go({ v: 'post', id: x.target });
		};
		if (!j.items.length) put(b, emptyBox('🔔', 'No notifications yet', 'When someone likes, comments, follows or messages you, it shows up here.'));
		put(b, h('div', { class: 'ds-cm-notes' }, ...j.items.map((x) => h('button', { class: 'ds-cm-note' + (x.read ? '' : ' unread'), onclick: () => go2(x) },
			x.actor ? avatar(x.actor, 38) : h('span', { class: 'ds-cm-ne' }, x.type === 'badge' ? '🏅' : x.type === 'level' ? '⬆️' : x.type === 'crm' ? '🧰' : x.type === 'project' ? '📋' : '🎁'),
			h('span', null, x.text), h('small', null, ago(x.created))))));
		if (j.unread.notes) { const r = await api('c/notes/read', { body: {} }); setCommunity({ unread: r.unread }); }
	} catch (e) { toast(e.message); }
}

/* --------------------------------------------------------------- messages */

async function viewMsgs(b) {
	if (!(await need('Sign in to message other members.'))) return back();
	put(b, h('div', { class: 'ds-row ds-between' }, h('h2', null, '💬 Messages'), h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => go({ v: 'friends' }) }, '🤝 Friends')), loading());
	try {
		const j = await api('c/messages');
		b.querySelector('.ds-cm-loading').remove();
		setCommunity({ unread: j.unread });
		if (!j.items.length) put(b, emptyBox('💬', 'No messages yet', 'Open any member’s profile and tap Message to start a conversation.', 'Find people', () => go({ v: 'people' })));
		put(b, h('div', { class: 'ds-cm-notes' }, ...j.items.map((t) => h('button', { class: 'ds-cm-note' + (t.unread ? ' unread' : ''), onclick: () => go({ v: 'thread', with: t.with.id }) },
			avatar(t.with, 42), h('span', null, memberName(t.with, { click: false }), h('small', { class: 'ds-cm-last' }, (t.mine ? 'You: ' : '') + t.last)),
			h('small', null, ago(t.at), t.unread ? h('span', { class: 'ds-dot-n ds-inline' }, String(t.unread)) : null)))));
	} catch (e) { toast(e.message); }
}

async function viewThread(b, v) {
	if (!(await need('Sign in to message other members.'))) return back();
	const list = h('div', { class: 'ds-cm-msgs' });
	const ta = h('textarea', { rows: 1, maxlength: 2000, placeholder: 'Write a message…' });
	const send = h('button', { class: 'ds-btn', 'aria-label': 'Send' }, icon('send', 18));
	const head = h('div', { class: 'ds-cm-thead' });
	put(b, head, list, h('div', { class: 'ds-cm-mcompose' }, ta, send));
	let timer = 0, last = 0;
	const load = async (scroll) => {
		if (!list.isConnected) return clearInterval(timer);
		try {
			const j = await api('c/thread', { query: { with: v.with } });
			setCommunity({ unread: j.unread });
			if (!head.childNodes.length) put(head, h('button', { class: 'ds-cm-mrow', onclick: () => go({ v: 'user', id: j.with.id }) }, avatar(j.with, 40), h('div', null, memberName(j.with, { title: true, click: false }))));
			const lastId = j.items.length ? j.items[j.items.length - 1].id : 0;
			if (lastId === last) return;
			last = lastId;
			list.innerHTML = '';
			if (!j.items.length) put(list, h('p', { class: 'ds-muted ds-center' }, 'Say hi! Be friendly — messages follow the community rules.'));
			let day = '';
			for (const m of j.items) {
				const d = new Date(m.at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
				if (d !== day) { day = d; put(list, h('div', { class: 'ds-cm-day' }, d)); }
				put(list, h('div', { class: 'ds-cm-bubble' + (m.mine ? ' mine' : '') }, h('p', null, m.body), h('small', null, new Date(m.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) + (m.mine && m.read ? ' · Seen' : ''))));
			}
			if (scroll !== false) list.scrollTop = list.scrollHeight;
			if (j.blocked) { ta.disabled = send.disabled = true; ta.placeholder = 'You blocked this member.'; }
		} catch (e) { /* offline */ }
	};
	send.onclick = async () => {
		const body = ta.value.trim();
		if (!body) return;
		send.disabled = true;
		try { await api('c/send', { body: { to: v.with, body } }); ta.value = ''; await load(); } catch (e) { toast(e.message); }
		send.disabled = false;
		ta.focus();
	};
	ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send.click(); } });
	await load();
	timer = setInterval(load, 8000);
}

async function viewFriends(b) {
	if (!(await need())) return back();
	put(b, h('h2', null, '🤝 Friends'), loading());
	try {
		const j = await api('c/friends');
		b.querySelector('.ds-cm-loading').remove();
		if (j.received.length) {
			put(b, h('h3', null, 'Friend requests'), h('div', { class: 'ds-cm-mlist' }, ...j.received.map((m) => h('div', { class: 'ds-cm-mrow' }, avatar(m, 40), h('div', null, memberName(m, { title: true })),
				h('div', { class: 'ds-row' },
					h('button', { class: 'ds-btn ds-sm', onclick: async () => { await api('c/friend', { body: { id: m.id, action: 'accept' } }).catch((e) => toast(e.message)); render(C.cur); } }, 'Accept'),
					h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: async () => { await api('c/friend', { body: { id: m.id, action: 'decline' } }).catch((e) => toast(e.message)); render(C.cur); } }, 'Decline'))))));
		}
		put(b, h('h3', null, `My friends (${j.friends.length})`), memberList(j.friends, 'No friends yet — visit a member’s profile and tap Add friend.'));
		if (j.sent.length) put(b, h('h3', null, 'Waiting for an answer'), memberList(j.sent, ''));
	} catch (e) { toast(e.message); }
}

/* ------------------------------------------------------------- posting */

function postMenu() {
	need('Sign in to post in the Dreamscape Browser — it’s free.').then((ok) => {
		if (!ok) return;
		const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
		const m = modal(C.ctx.root, 'What would you like to post?', [
			h('button', { class: 'ds-tile ds-tile-row', onclick: () => { m.remove(); C.ctx.pickDesignToShare(); } }, h('span', { class: 'ds-tile-ic' }, '🏡'), h('span', null, h('b', null, 'Show off a design'), h('small', null, 'Share one of your Dreamscapes — the plants and features you used are listed automatically.'))),
			h('button', { class: 'ds-tile ds-tile-row', onclick: () => { m.remove(); askIdeas(); } }, h('span', { class: 'ds-tile-ic' }, '🙋'), h('span', null, h('b', null, 'Ask for ideas'), h('small', null, 'Post a photo of a spot in your yard and let the community suggest designs and plants.')))
		], close, 'ds-modal-auth');
	});
}

async function askIdeas() {
	if (!(await need('Sign in to ask the community for ideas.'))) return;
	const shot = await chooseImage();
	if (!shot) return;
	openComposer({ kind: 'help', main: shot.main, thumb: shot.thumb, title: '', tags: [] });
}

/** Pick a photo (camera / upload) → { main, thumb } JPEG data URIs. */
async function chooseImage() {
	const kind = await new Promise((resolve) => {
		const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => { m.remove(); resolve(null); } }, icon('close'));
		const m = modal(C.ctx.root, 'Add a photo', [h('div', { class: 'ds-grid2' },
			h('button', { class: 'ds-btn ds-lg', onclick: () => { m.remove(); resolve('camera'); } }, icon('camera', 20), ' Take a photo'),
			h('button', { class: 'ds-btn ds-ghost ds-lg', onclick: () => { m.remove(); resolve('upload'); } }, icon('upload', 20), ' Upload'))], close, 'ds-modal-auth');
	});
	if (!kind) return null;
	const shot = await C.ctx.capture(kind);
	if (!shot || shot.error) { if (shot && shot.error) toast(shot.error); return null; }
	return prepImages(shot.bitmap);
}
export function prepImages(src, before) {
	const fit = (img, max, q) => {
		const w = img.width || img.naturalWidth, hh = img.height || img.naturalHeight, k = Math.min(1, max / Math.max(w, hh));
		const c = canvas(w * k, hh * k);
		c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
		return c.toDataURL('image/jpeg', q);
	};
	return { main: fit(src, 1600, 0.85), thumb: fit(src, 560, 0.78), before: before ? fit(before, 1600, 0.85) : '', w: src.width, h: src.height };
}

/**
 * Post composer. opts: { kind:'design'|'help', main, thumb, before, title, body, tags,
 *   assets:[{id,name,sci,cat,count,age,h,w,mine}], ground:[], season, years, ai }
 */
export function openComposer(opts) {
	const help = opts.kind === 'help';
	const title = h('input', { type: 'text', maxlength: 100, value: opts.title || '', placeholder: help ? 'e.g. “What can I plant in this shady corner?”' : 'e.g. “Front walk makeover with hydrangeas”', 'aria-label': 'Title' });
	const body = h('textarea', { rows: 3, maxlength: 3000, placeholder: help ? 'Tell people about the spot: sun or shade, what you like, budget, what to avoid…' : 'Tell the story: what you changed, why you chose these plants…' });
	const tags = new Set(opts.tags || []);
	const tagBox = h('div', { class: 'ds-chips' });
	const custom = h('input', { type: 'text', maxlength: 30, placeholder: 'Add your own tag…' });
	const drawTags = () => {
		tagBox.innerHTML = '';
		put(tagBox, ...[...new Set([...COMMUNITY_TAGS, ...tags])].map((t) => h('button', { class: 'ds-chip' + (tags.has(t) ? ' on' : ''), onclick: () => { tags.has(t) ? tags.delete(t) : tags.size < 8 && tags.add(t); drawTags(); } }, (EMOJI[t] ? EMOJI[t] + ' ' : '') + t)));
	};
	drawTags();
	custom.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const t = custom.value.trim(); if (t && tags.size < 8) { tags.add(t); custom.value = ''; drawTags(); } } });
	const privacy = h('input', { type: 'checkbox' });
	const post = h('button', { class: 'ds-btn ds-wide ds-lg' }, icon('send', 18), help ? ' Ask the community' : ' Post to Dreamscape Browser');
	const status = h('p', { class: 'ds-hint ds-err', role: 'alert' });
	const counts = opts.assets && opts.assets.length ? opts.assets : null;
	post.onclick = async () => {
		if (title.value.trim().length < 3) { status.textContent = 'Add a title (at least 3 letters).'; title.focus(); return; }
		if (!privacy.checked) { status.textContent = 'Please confirm the privacy check first.'; return; }
		post.disabled = true; status.textContent = 'Posting…';
		try {
			const p = await api('c/post', { body: { kind: help ? 'help' : 'design', title: title.value.trim(), body: body.value.trim(), tags: [...tags], image: opts.main, thumb: opts.thumb, before: opts.before || '', assets: opts.assets || [], ground: opts.ground || [], season: opts.season || '', years: opts.years || 0, ai: !!opts.ai, w: opts.w, h: opts.h } });
			m.remove();
			toast(help ? 'Posted! You’ll be notified when people reply.' : '🎉 Your design is live in the Dreamscape Browser!', 4500);
			openCommunity({ v: 'post', id: p.id });
		} catch (e) { status.textContent = e.message; post.disabled = false; }
	};
	const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
	const m = modal(C.ctx.root, help ? '🙋 Ask for ideas' : '🌎 Share to Dreamscape Browser', [
		h('div', { class: 'ds-cm-cprev' }, opts.before ? h('img', { src: opts.before, alt: 'Before' }) : null, h('img', { src: opts.main, alt: 'Your picture' })),
		h('label', { class: 'ds-label' }, 'Title', title),
		h('label', { class: 'ds-label' }, help ? 'Your question' : 'Description (optional)', body),
		h('p', { class: 'ds-label' }, 'Tags ', h('small', { class: 'ds-muted' }, '(help people find it — up to 8)')), tagBox, custom,
		counts ? h('details', { class: 'ds-cm-autolist' }, h('summary', null, `🌿 ${counts.reduce((a, x) => a + x.count, 0)} plants & features will be listed automatically`),
			h('ul', null, ...counts.map((a) => h('li', null, `${a.count}× ${a.name}${a.age != null && a.cat !== 'features' ? ` · ${Math.round(a.age)} yr old` : ''}`)))) : null,
		h('label', { class: 'ds-check ds-cm-privacy' }, privacy, h('span', null, 'My picture doesn’t show my house number, license plates, people’s faces or anything private. I’m happy for it to be public.')),
		h('p', { class: 'ds-hint' }, help ? 'Members who help with ideas earn points — you’ll get a notification for every reply.' : `Sharing a design earns 🌟 points, and every like and great rating earns more.`),
		status, post], close, 'ds-modal-wide ds-modal-composer');
	setTimeout(() => title.focus(), 60);
}

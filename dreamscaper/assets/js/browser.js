/* DreamScaper – My Dreamscapes: every saved Dreamscape in one place. Search by name,
 * filter by tags (several at once), favorites, sort, multi-select, and open, rename,
 * duplicate, tag or delete — for designs on this device and designs saved in the account.
 */
import { h, put, icon } from './util.js?v=2.7.6';
import { session, api } from './api.js?v=2.7.6';
import { modal } from './capture.js?v=2.7.6';

/** Ready-made tags that fit most Dreamscapes. Customers can add their own. */
export const PRESET_TAGS = [
	['Yard designs', '🏡'], ['Bed designs', '🌷'], ['Paver designs', '🧱'], ['My Home designs', '🏠'],
	['Front yard', '🚪'], ['Backyard', '🌳'], ['Ideas to try', '💡']
];
const PRESET = new Set(PRESET_TAGS.map((t) => t[0]));
const EMOJI = Object.fromEntries(PRESET_TAGS);
export const HOME_LIMIT = 4;

const SORTS = [['updated', 'Recently edited'], ['created', 'Newest first'], ['oldest', 'Oldest first'], ['name', 'Name A–Z']];
const PREF = 'ds_browser_v1';
const loadPref = () => { try { return JSON.parse(localStorage.getItem(PREF)) || {}; } catch (e) { return {}; } };
const savePref = (p) => { try { localStorage.setItem(PREF, JSON.stringify(p)); } catch (e) { /* private mode */ } };
const fmtDate = (t) => (t ? new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '');

/* ------------------------------------------------------------------ data */

/**
 * Everything the customer has: this device + their account, merged by id.
 * ctx: { store, listRemote }
 */
export async function loadDreamscapes(ctx) {
	const map = new Map();
	let blocked = false;
	try {
		for (const p of await ctx.store.listProjects()) {
			map.set(p.id, { id: p.id, name: p.name, updated: p.updated || 0, created: p.created || p.updated || 0, thumb: p.thumb || null, views: (p.views || []).length || 1, tags: p.tags || [], fav: !!p.fav, local: p, remote: null });
		}
	} catch (e) { blocked = true; }
	let files = '';
	if (session.user) {
		try {
			const r = await ctx.listRemote('design');
			files = r.files;
			for (const it of r.items) {
				const x = map.get(it.cid);
				if (x) {
					x.remote = it;
					// tags/favorite/name changed on another device more recently → use those here too
					if ((it.metaAt || 0) > (x.local.metaAt || 0) && it.tags) {
						Object.assign(x, { tags: it.tags, fav: !!it.fav, name: it.name || x.name });
						Object.assign(x.local, { tags: x.tags, fav: x.fav, name: x.name, metaAt: it.metaAt });
						ctx.store.putProjectQuiet(x.local).catch(() => {});
					}
					continue;
				}
				map.set(it.cid, { id: it.cid, name: it.name, updated: it.updated || 0, created: it.created || it.updated || 0, thumb: it.thumb || null, views: it.views || 1, tags: it.tags || [], fav: !!it.fav, local: null, remote: it });
			}
		} catch (e) { /* offline */ }
	}
	const items = [...map.values()].sort((a, b) => b.updated - a.updated);
	return { items, files, blocked };
}

/** All tag names: presets, the customer's own saved tags, and any found on designs. */
async function loadTags(items) {
	let mine = [];
	if (session.user) { try { mine = (await api('tags')).tags || []; } catch (e) { /* offline */ } }
	else { try { mine = JSON.parse(localStorage.getItem('ds_tags')) || []; } catch (e) { /* private mode */ } }
	const custom = new Set(mine.filter((t) => !PRESET.has(t)));
	for (const it of items) for (const t of it.tags) if (!PRESET.has(t)) custom.add(t);
	return [...custom].sort((a, b) => a.localeCompare(b));
}
async function saveCustomTags(list) {
	if (session.user) { try { await api('tags', { body: { tags: list } }); } catch (e) { /* offline */ } }
	else { try { localStorage.setItem('ds_tags', JSON.stringify(list)); } catch (e) { /* private mode */ } }
}

/** Save tags / favorite / name for some designs (device and account). */
async function updateMeta(ctx, list, patch) {
	const remoteOnly = [];
	for (const it of list) {
		Object.assign(it, patch(it));
		const metaAt = Date.now();
		if (it.local) {
			Object.assign(it.local, { tags: it.tags, fav: it.fav, name: it.name, metaAt });
			await ctx.store.putProjectQuiet(it.local);
			ctx.pushSoon('design', it.local);
		} else if (it.remote) remoteOnly.push({ cid: it.id, tags: it.tags, fav: it.fav, name: it.name, metaAt });
	}
	if (remoteOnly.length) await api('cloud/meta', { body: { items: remoteOnly } });
}

/* ------------------------------------------------------------------ card */

/** Card used on the home page and in the browser. opts: { onChange, select, selected, onSelect } */
export function dreamscapeCard(it, ctx, opts = {}) {
	const img = it.thumb ? h('img', { src: it.thumb, alt: '', loading: 'lazy' }) : h('div', { class: 'ds-thumb-empty' }, icon(it.local ? 'leaf' : 'cloud', 30));
	const open = () => openItem(ctx, it);
	const menu = h('div', { class: 'ds-card-menu' },
		h('button', { onclick: (e) => { e.stopPropagation(); open(); } }, 'Open'),
		h('button', { onclick: (e) => { e.stopPropagation(); menu.classList.remove('on'); tagEditor(ctx, [it], opts.onChange); } }, 'Tags…'),
		h('button', { onclick: async (e) => {
			e.stopPropagation(); menu.classList.remove('on');
			const n = prompt('Rename this Dreamscape', it.name);
			if (n && n.trim()) { await updateMeta(ctx, [it], () => ({ name: n.trim().slice(0, 60) })).catch((er) => ctx.toast(er.message)); opts.onChange && opts.onChange(); }
		} }, 'Rename'),
		it.local ? h('button', { onclick: async (e) => { e.stopPropagation(); menu.classList.remove('on'); const c = await ctx.store.duplicate(it.local, it.name + ' (copy)'); delete c.files; ctx.pushSoon('design', c); opts.onChange && opts.onChange(); } }, 'Duplicate') : null,
		h('button', { class: 'ds-danger', onclick: async (e) => { e.stopPropagation(); menu.classList.remove('on'); if (await deleteItems(ctx, [it])) opts.onChange && opts.onChange(); } }, 'Delete'));
	const star = h('button', { class: 'ds-card-star' + (it.fav ? ' on' : ''), 'aria-label': it.fav ? 'Remove from favorites' : 'Add to favorites', 'aria-pressed': it.fav ? 'true' : 'false', title: it.fav ? 'Favorite' : 'Add to favorites',
		onclick: async (e) => { e.stopPropagation(); await updateMeta(ctx, [it], (x) => ({ fav: !x.fav })).catch((er) => ctx.toast(er.message)); star.classList.toggle('on', it.fav); star.setAttribute('aria-pressed', it.fav ? 'true' : 'false'); opts.onFav && opts.onFav(); } }, icon('star', 18));
	const check = opts.select ? h('span', { class: 'ds-card-check' + (opts.selected ? ' on' : ''), 'aria-hidden': 'true' }, icon('check', 16)) : null;
	const tags = it.tags.length ? h('div', { class: 'ds-card-tags' }, ...it.tags.slice(0, 3).map((t) => h('span', null, (EMOJI[t] ? EMOJI[t] + ' ' : '') + t)), it.tags.length > 3 ? h('span', null, '+' + (it.tags.length - 3)) : null) : null;
	const card = h('div', { class: 'ds-card' + (it.local ? '' : ' ds-card-cloud') + (opts.selected ? ' sel' : ''), tabindex: 0, role: opts.select ? 'checkbox' : 'button', 'aria-checked': opts.select ? String(!!opts.selected) : null, 'aria-label': (opts.select ? 'Select ' : 'Open ') + it.name,
		onclick: () => (opts.select ? opts.onSelect(it) : open()), onkeydown: (e) => { if (e.key === 'Enter' || (opts.select && e.key === ' ')) { e.preventDefault(); opts.select ? opts.onSelect(it) : open(); } } },
		h('div', { class: 'ds-card-img' }, img, !it.local ? h('span', { class: 'ds-card-badge' }, icon('cloud', 14), ' In your account') : null, check),
		star,
		h('div', { class: 'ds-card-body' }, h('b', null, it.name), h('small', null, `${it.views} view${it.views > 1 ? 's' : ''} · ${fmtDate(it.updated)}`), tags),
		opts.select ? null : h('button', { class: 'ds-icon-btn ds-card-more', 'aria-label': 'More', onclick: (e) => { e.stopPropagation(); menu.classList.toggle('on'); } }, icon('menu', 18)),
		opts.select ? null : menu);
	return card;
}

async function openItem(ctx, it) {
	if (it.local) return ctx.open(it.id);
	ctx.toast('Downloading your Dreamscape…');
	try { const p = await ctx.pull(it.id); ctx.open(p.id); } catch (e) { ctx.toast(e.message || 'Couldn’t download it.'); }
}

async function deleteItems(ctx, list) {
	const msg = list.length === 1 ? `Delete “${list[0].name}”? This can’t be undone.` : `Delete these ${list.length} Dreamscapes? This can’t be undone.`;
	if (!confirm(msg)) return false;
	for (const it of list) {
		try {
			if (it.local) { await ctx.store.deleteProject(it.local); await ctx.removeRemote('design', it.local); }
			else {
				const j = await api('cloud/get', { query: { kind: 'design', cid: it.id } }).catch(() => null);
				await ctx.removeRemote('design', (j && j.data) || { id: it.id });
			}
		} catch (e) { ctx.toast(e.message); }
	}
	ctx.toast(list.length === 1 ? 'Deleted.' : `Deleted ${list.length} Dreamscapes.`);
	return true;
}

/* ------------------------------------------------------------ tag editor */

/** Pick tags for one or more designs; create new tags right here. */
async function tagEditor(ctx, list, onDone) {
	const all = await loadTags(await loadDreamscapes(ctx).then((d) => d.items).catch(() => list));
	const custom = [...all];
	const state = new Map();
	const count = (t) => list.filter((it) => it.tags.includes(t)).length;
	const box = h('div', { class: 'ds-tag-edit' });
	const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
	const input = h('input', { type: 'text', maxlength: 40, placeholder: 'e.g. Pool area, Spring 2027, Mom’s house', 'aria-label': 'New tag name' });
	const add = () => {
		const t = input.value.trim().replace(/\s+/g, ' ');
		if (!t) return;
		if (!PRESET.has(t) && !custom.includes(t)) { custom.push(t); saveCustomTags(custom); }
		state.set(t, true); input.value = ''; draw();
	};
	input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
	const chip = (t) => {
		const n = count(t);
		const on = state.has(t) ? state.get(t) : n === list.length ? true : n === 0 ? false : null;
		return h('button', { class: 'ds-chip' + (on ? ' on' : on === null ? ' some' : ''), 'aria-pressed': on ? 'true' : on === null ? 'mixed' : 'false', onclick: () => { state.set(t, !on); draw(); } }, (EMOJI[t] ? EMOJI[t] + ' ' : '') + t);
	};
	const draw = () => {
		box.innerHTML = '';
		put(box, 
			h('p', { class: 'ds-hint' }, list.length === 1 ? `Tap tags to add them to “${list[0].name}”. A Dreamscape can have as many tags as you like.` : `Tags you turn on are added to all ${list.length} selected Dreamscapes; tags you turn off are removed. Half-filled tags are on some of them.`),
			h('p', { class: 'ds-label' }, 'Ready-made tags'),
			h('div', { class: 'ds-chips' }, ...PRESET_TAGS.map((t) => chip(t[0]))),
			h('p', { class: 'ds-label' }, 'My tags'),
			custom.length ? h('div', { class: 'ds-chips' }, ...custom.map(chip)) : h('p', { class: 'ds-muted ds-sm-text' }, 'None yet — make one below.'),
			h('div', { class: 'ds-row ds-tag-new' }, input, h('button', { class: 'ds-btn ds-ghost', onclick: add }, icon('plus', 16), ' Create tag')),
			h('div', { class: 'ds-row ds-end' }, h('button', { class: 'ds-btn ds-ghost', onclick: () => m.remove() }, 'Cancel'), h('button', { class: 'ds-btn', onclick: save }, icon('check', 16), ' Save tags')));
	};
	const save = async () => {
		try {
			await updateMeta(ctx, list, (it) => {
				const s = new Set(it.tags);
				for (const [t, on] of state) { if (on) s.add(t); else s.delete(t); }
				return { tags: [...s] };
			});
			m.remove();
			ctx.toast(list.length === 1 ? 'Tags saved.' : `Tags saved on ${list.length} Dreamscapes.`);
			onDone && onDone();
		} catch (e) { ctx.toast(e.message); }
	};
	const m = modal(ctx.root, list.length === 1 ? 'Tags' : `Tag ${list.length} Dreamscapes`, [box], close, 'ds-modal-tags');
	draw();
	setTimeout(() => input.focus(), 50);
}

/* --------------------------------------------------------------- browser */

/**
 * Full-screen My Dreamscapes page.
 * ctx: { root, store, toast, open(id), pull(cid), listRemote, pushSoon, removeRemote, header(), home(), newProject() }
 */
export async function openBrowser(ctx, start = {}) {
	const pref = loadPref();
	const st = { q: '', sort: pref.sort || 'updated', view: start.view || 'all', tags: new Set(start.tags || []), select: false, picked: new Set() };
	let data = { items: [], files: '' };
	let custom = [];
	const root = ctx.root;
	root.innerHTML = '';
	const search = h('input', { type: 'search', placeholder: 'Search by name or tag…', 'aria-label': 'Search Dreamscapes', autocomplete: 'off' });
	const sort = h('select', { 'aria-label': 'Sort' }, ...SORTS.map(([v, t]) => h('option', { value: v, selected: v === st.sort }, t)));
	const selBtn = h('button', { class: 'ds-btn ds-ghost ds-sm' }, icon('check', 16), ' Select');
	const side = h('aside', { class: 'ds-br-side', 'aria-label': 'Filters' });
	const grid = h('div', { class: 'ds-grid' });
	const summary = h('div', { class: 'ds-br-summary', 'aria-live': 'polite' });
	const bulk = h('div', { class: 'ds-br-bulk', hidden: true });
	put(root, ctx.header(),
		h('main', { class: 'ds-home ds-browser' },
			h('div', { class: 'ds-row ds-between ds-br-head' },
				h('div', null,
					h('button', { class: 'ds-link', onclick: () => ctx.home() }, '← Home'),
					h('h1', null, icon('folder', 26), ' My Dreamscapes'),
					h('p', { class: 'ds-muted' }, 'Find, organize and open all your saved Dreamscapes. Give each one as many tags as you like, then tap a tag to see only those Dreamscapes.')),
				h('button', { class: 'ds-btn', onclick: ctx.newProject }, icon('plus', 18), ' New Dreamscape')),
			h('div', { class: 'ds-br-tools' }, h('label', { class: 'ds-br-search' }, icon('search', 18), search), sort, selBtn),
			h('div', { class: 'ds-br-body' }, side, h('section', { class: 'ds-br-main' }, summary, grid)),
			bulk));

	const matches = (it) => {
		if (st.view === 'fav' && !it.fav) return false;
		if (st.view === 'untagged' && it.tags.length) return false;
		if (st.view === 'cloud' && it.local) return false;
		for (const t of st.tags) if (!it.tags.includes(t)) return false;
		const q = st.q.trim().toLowerCase();
		if (q && !q.split(/\s+/).every((w) => (it.name + ' ' + it.tags.join(' ')).toLowerCase().includes(w))) return false;
		return true;
	};
	const sorted = (list) => {
		const out = [...list];
		if (st.sort === 'name') out.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
		else if (st.sort === 'created') out.sort((a, b) => b.created - a.created);
		else if (st.sort === 'oldest') out.sort((a, b) => a.created - b.created);
		else out.sort((a, b) => b.updated - a.updated);
		return out;
	};

	const drawSide = () => {
		side.innerHTML = '';
		const n = (f) => data.items.filter(f).length;
		const viewBtn = (id, ic, label, count) => h('button', { class: 'ds-br-f' + (st.view === id ? ' on' : ''), 'aria-pressed': String(st.view === id), onclick: () => { st.view = id; refresh(); } }, h('span', null, ic), h('span', null, label), h('small', null, String(count)));
		const tagBtn = (t, ic) => h('button', { class: 'ds-br-f' + (st.tags.has(t) ? ' on' : ''), 'aria-pressed': String(st.tags.has(t)), onclick: () => { st.tags.has(t) ? st.tags.delete(t) : st.tags.add(t); refresh(); } }, h('span', null, ic), h('span', null, t), h('small', null, String(n((it) => it.tags.includes(t)))));
		put(side, 
			h('p', { class: 'ds-label' }, 'Show'),
			viewBtn('all', '🗂️', 'All Dreamscapes', data.items.length),
			viewBtn('fav', '⭐', 'Favorites', n((it) => it.fav)),
			viewBtn('untagged', '🏷️', 'Not tagged yet', n((it) => !it.tags.length)),
			session.user && data.items.some((it) => !it.local) ? viewBtn('cloud', '☁️', 'Only in my account', n((it) => !it.local)) : null,
			h('p', { class: 'ds-label' }, 'Tags'),
			...PRESET_TAGS.map(([t, e]) => tagBtn(t, e)),
			custom.length ? h('p', { class: 'ds-label' }, 'My tags') : null,
			...custom.map((t) => tagBtn(t, '🏷️')),
			h('button', { class: 'ds-br-f ds-br-add', onclick: newTag }, h('span', null, '＋'), h('span', null, 'New tag')),
			custom.length ? h('button', { class: 'ds-link ds-sm-text', onclick: manageTags }, 'Rename or delete my tags') : null);
	};

	const drawGrid = () => {
		const list = sorted(data.items.filter(matches));
		grid.innerHTML = '';
		summary.innerHTML = '';
		const bits = [];
		if (st.view === 'fav') bits.push('favorites');
		if (st.view === 'untagged') bits.push('not tagged yet');
		if (st.view === 'cloud') bits.push('only in your account');
		if (st.tags.size) bits.push('tagged ' + [...st.tags].map((t) => `“${t}”`).join(' and '));
		if (st.q.trim()) bits.push(`matching “${st.q.trim()}”`);
		put(summary, h('span', null, h('b', null, `${list.length} Dreamscape${list.length === 1 ? '' : 's'}`), bits.length ? ' · ' + bits.join(' · ') : ''),
			bits.length ? h('button', { class: 'ds-link', onclick: () => { st.view = 'all'; st.tags.clear(); st.q = ''; search.value = ''; refresh(); } }, 'Clear filters') : null);
		if (!data.items.length) {
			put(grid, h('div', { class: 'ds-empty ds-span' }, icon('leaf', 30), h('b', null, 'No Dreamscapes yet'), h('p', { class: 'ds-muted' }, 'Start your first one — it will show up here.'), h('button', { class: 'ds-btn', onclick: ctx.newProject }, icon('plus', 18), ' Start a new Dreamscape')));
			return;
		}
		if (!list.length) {
			put(grid, h('div', { class: 'ds-empty ds-span' }, icon('search', 30), h('b', null, 'Nothing matches'), h('p', { class: 'ds-muted' }, st.tags.size > 1 ? 'Only Dreamscapes with every selected tag are shown. Try turning one tag off.' : 'Try a different word or clear the filters.')));
			return;
		}
		for (const it of list) put(grid, dreamscapeCard(it, ctx, { onChange: reload, onFav: () => { drawSide(); if (st.view === 'fav') drawGrid(); }, select: st.select, selected: st.picked.has(it.id), onSelect: (x) => { st.picked.has(x.id) ? st.picked.delete(x.id) : st.picked.add(x.id); drawGrid(); drawBulk(); } }));
	};

	const drawBulk = () => {
		bulk.hidden = !st.select;
		selBtn.innerHTML = '';
		put(selBtn, icon(st.select ? 'close' : 'check', 16), st.select ? ' Done' : ' Select');
		bulk.innerHTML = '';
		if (!st.select) return;
		const picked = data.items.filter((it) => st.picked.has(it.id));
		const visible = data.items.filter(matches);
		const dis = !picked.length;
		put(bulk, 
			h('b', null, picked.length ? `${picked.length} selected` : 'Tap Dreamscapes to select them'),
			h('button', { class: 'ds-link', onclick: () => { const all = visible.every((it) => st.picked.has(it.id)); visible.forEach((it) => (all ? st.picked.delete(it.id) : st.picked.add(it.id))); drawGrid(); drawBulk(); } }, visible.length && visible.every((it) => st.picked.has(it.id)) ? 'Select none' : 'Select all'),
			h('span', { class: 'ds-spacer' }),
			h('button', { class: 'ds-btn ds-sm', disabled: dis, onclick: () => tagEditor(ctx, picked, reload) }, icon('tag', 16), ' Tag'),
			h('button', { class: 'ds-btn ds-ghost ds-sm', disabled: dis, onclick: async () => { const on = !picked.every((it) => it.fav); await updateMeta(ctx, picked, () => ({ fav: on })).catch((e) => ctx.toast(e.message)); reload(); } }, icon('star', 16), picked.length && picked.every((it) => it.fav) ? ' Unfavorite' : ' Favorite'),
			h('button', { class: 'ds-btn ds-ghost ds-sm ds-danger', disabled: dis, onclick: async () => { if (await deleteItems(ctx, picked)) { st.picked.clear(); reload(); } } }, icon('trash', 16), ' Delete'));
	};

	const refresh = () => { savePref({ sort: st.sort }); drawSide(); drawGrid(); drawBulk(); };
	async function reload() {
		data = await loadDreamscapes(ctx);
		custom = await loadTags(data.items);
		for (const id of [...st.picked]) if (!data.items.some((it) => it.id === id)) st.picked.delete(id);
		refresh();
	}
	async function newTag() {
		const t = (prompt('Name your new tag (e.g. Pool area, Spring 2027, Mom’s house):') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
		if (!t) return;
		if (!PRESET.has(t) && !custom.includes(t)) { custom.push(t); custom.sort((a, b) => a.localeCompare(b)); await saveCustomTags(custom); }
		ctx.toast(`Tag “${t}” created. Use Select → Tag, or a card’s ⋯ menu → Tags, to add it.`, 4500);
		drawSide();
	}
	function manageTags() {
		const body = h('div', { class: 'ds-tag-edit' });
		const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
		const m = modal(root, 'My tags', [body], close, 'ds-modal-tags');
		const draw = () => {
			body.innerHTML = '';
			put(body, h('p', { class: 'ds-hint' }, 'Renaming or deleting a tag changes it on every Dreamscape that has it. Your Dreamscapes themselves are never deleted here.'));
			for (const t of custom) {
				put(body, h('div', { class: 'ds-row ds-tag-row' }, h('span', null, '🏷️ ', t), h('span', { class: 'ds-spacer' }),
					h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: async () => {
						const n = (prompt('Rename tag', t) || '').trim().replace(/\s+/g, ' ').slice(0, 40);
						if (!n || n === t) return;
						const using = data.items.filter((it) => it.tags.includes(t));
						await updateMeta(ctx, using, (it) => ({ tags: [...new Set(it.tags.map((x) => (x === t ? n : x)))] })).catch((e) => ctx.toast(e.message));
						custom = custom.map((x) => (x === t ? n : x)); await saveCustomTags(custom);
						if (st.tags.delete(t)) st.tags.add(n);
						draw(); refresh();
					} }, 'Rename'),
					h('button', { class: 'ds-btn ds-ghost ds-sm ds-danger', onclick: async () => {
						const using = data.items.filter((it) => it.tags.includes(t));
						if (!confirm(`Delete the tag “${t}”?${using.length ? ` It will be removed from ${using.length} Dreamscape${using.length > 1 ? 's' : ''}.` : ''}`)) return;
						await updateMeta(ctx, using, (it) => ({ tags: it.tags.filter((x) => x !== t) })).catch((e) => ctx.toast(e.message));
						custom = custom.filter((x) => x !== t); await saveCustomTags(custom);
						st.tags.delete(t);
						draw(); refresh();
					} }, 'Delete')));
			}
			if (!custom.length) put(body, h('p', { class: 'ds-muted' }, 'You have no tags of your own.'));
		};
		draw();
	}

	let tq;
	search.addEventListener('input', () => { clearTimeout(tq); tq = setTimeout(() => { st.q = search.value; drawGrid(); }, 150); });
	sort.addEventListener('change', () => { st.sort = sort.value; refresh(); });
	selBtn.onclick = () => { st.select = !st.select; st.picked.clear(); drawGrid(); drawBulk(); };
	put(grid, h('p', { class: 'ds-muted' }, h('span', { class: 'ds-spin ds-spin-sm' }), ' Loading your Dreamscapes…'));
	await reload();
	if (data.blocked) ctx.toast('This browser is blocking storage, so designs can’t be saved here (private mode?).');
	setTimeout(() => search.focus({ preventScroll: true }), 50);
}

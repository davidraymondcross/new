/* DreamScaper – app shell: gallery, project flow, editor UI, autosave. */
import { h, icon, uid, debounce, canvasToBlob, blobToBitmap, canvas, clamp } from './util.js?v=2.7.0';
import { store } from './store.js?v=2.7.0';
import { CATEGORIES, ALL, byId, sizeAt, maxAge, fmtFt, growthLabel, bloomLabel, sunLabel, COLOR_SWATCH, matchesWords, searchScore, assetItem, addItem, removeItem } from './library.js?v=2.7.0';
import { openAssetMaker } from './assetmaker.js?v=2.7.0';
import { voiceButton } from './voice.js?v=2.7.0';
import { loadPhotoPack, onPhotoReady } from './photo.js?v=2.7.0';
import { thumb, sprite } from './sprites.js?v=2.7.0';
import { MATERIALS, MATERIAL_GROUPS, swatch, loadMaterialPack, onMaterialReady } from './textures.js?v=2.7.0';
import { Editor } from './editor.js?v=2.7.0';
import { camera, pickFile, aerial, explore3d, facing, modal } from './capture.js?v=2.7.0';
import { sampleYard } from './sample.js?v=2.7.0';
import { initApi, session, refreshSession, onSession, api } from './api.js?v=2.7.0';
import { initAccount, accountChip, creditsPill, openAuth, requireSignIn, openAccount as accountSheet } from './account.js?v=2.7.0';
import { pushSoon, pushAll, pullAssets, listRemote, pull, removeRemote, onCloudStatus } from './cloud.js?v=2.7.0';
import { openStudio } from './dsai.js?v=2.7.0';
import { panelAI } from './aitools.js?v=2.7.0';
import { shareSheet, printDesign } from './share.js?v=2.7.0';
import { openPlantId } from './plantid.js?v=2.7.0';
import { initCommunity, openCommunity, openComposer, showRewards, unreadDot, prepImages } from './community.js?v=2.7.0';
import { onRewards } from './api.js?v=2.7.0';
import { segment } from './aiclient.js?v=2.7.0';
import { historyPanel } from './history.js?v=2.7.0';
import { startTour, maybeTour, initTour, tourSettings as openTourSettings } from './tour.js?v=2.7.0';
import { logoArt, logoMark, wordmark } from './logo.js?v=2.7.0';
import { openBrowser, loadDreamscapes, dreamscapeCard, HOME_LIMIT } from './browser.js?v=2.7.0';
import { initStorage, openStorage } from './storage.js?v=2.7.0';
import { initHub, openHub, isPro, newQuote, resumeWithDesign, hubActions } from './crm.js?v=2.7.0';
import { initHire, openFind, openProjects } from './hire.js?v=2.7.0';
import { initInbox, openInbox, inboxButton, inboxDot } from './inbox.js?v=2.7.0';
import { initExplain } from './explain.js?v=2.7.0';
import { initBilling, confirmReturn } from './billing.js?v=2.7.0';
import { initMsgSettings } from './msgsettings.js?v=2.7.0';
import { dreamscapeToPlan } from './takeoff.js?v=2.7.0';
import { objectControls, opInspector, panelShapes, panelMeasure, panelAdjust, layersPanel, openVersions, restoreVersionInto, compareDialog, presentation } from './edtools.js?v=2.7.0';
import { initBoard, openBoard, addToBoard } from './board.js?v=2.7.0';
import { openGuide, guideBar } from './guide.js?v=2.7.0';
import { initCredits, openCredits, handleReturn } from './credits.js?v=2.7.0';

const CFG = (() => {
	try { return JSON.parse(document.getElementById('dreamscaper-config').textContent); } catch (e) { return {}; }
})();
CFG.brand = CFG.brand || "David's Landscaping";
CFG.site = CFG.site || '';

const SEASONS = [['spring', 'Spring'], ['summer', 'Summer'], ['fall', 'Fall'], ['winter', 'Winter']];
const TOOLS = [
	['select', 'select', 'Select & move', 'V'],
	['plants', 'plant', 'Plants & features', 'P'],
	['paint', 'paint', 'Paint ground cover', 'B'],
	['bed', 'shapes', 'Beds, patios, walks & walls', 'L'],
	['measure', 'ruler', 'Measure & zones', 'M'],
	['adjust', 'adjust', 'Adjust photo', 'J'],
	['eraser', 'wand', 'Magic eraser', 'E'],
	['ai', 'sparkle', 'AI tools', 'A'],
	['scale', 'scale', 'Scale & perspective', 'S'],
	['pan', 'hand', 'Pan', 'H']
];

let app = null;
let pendingRoute = null; // e.g. ?ds_hub=1 or ?ds_pro=12 from an email / a contractor's website

export function boot() {
	initApi(CFG);
	document.querySelectorAll('[data-dreamscaper-open]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); open(); }));
	if (location.hash === '#dreamscaper') open();
	window.DreamScaper = window.Dreamscaper = { open };
	const q = new URLSearchParams(location.search);
	const KEYS = ['ds_hub', 'ds_pro', 'ds_inbox', 'ds_projects', 'ds_sub', 'ds_review'];
	if (KEYS.some((k) => q.has(k))) {
		const hub = q.get('ds_hub'), pro = parseInt(q.get('ds_pro'), 10) || 0, inbox = q.get('ds_inbox'), projects = q.has('ds_projects') || q.has('ds_review'), sub = q.get('ds_sub');
		KEYS.forEach((k) => q.delete(k));
		history.replaceState(history.state, '', location.pathname + (q.toString() ? '?' + q : '') + '#dreamscaper');
		const HUB = ['plan', 'inbox', 'schedule', 'jobs', 'quotes', 'invoices', 'customers', 'settings'];
		pendingRoute = sub ? () => confirmReturn(sub).then(() => openHub({ v: 'plan' }))
			: pro ? () => openFind({ pro })
			: inbox != null ? () => openInbox(+inbox ? { id: +inbox } : {})
			: projects ? () => openProjects()
			: () => openHub(hub === 'pay' ? { v: 'settings', tab: 'pay' } : HUB.includes(hub) ? { v: hub } : { v: 'dash' });
		if (!app) open();
	}
	if (q.has('ds_login')) {
		const v = q.get('ds_login');
		q.delete('ds_login');
		history.replaceState(history.state, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash);
		if (v !== 'ok') setTimeout(() => toast(decodeURIComponent(v)), 1200);
		if (location.hash !== '#dreamscaper') open();
	}
}

/* ======================================================================= app */

function open() {
	if (app) return;
	const host = h('div', { class: 'dreamscaper-host' });
	document.body.append(host);
	const shadow = host.attachShadow({ mode: 'open' });
	const css = h('link', { rel: 'stylesheet', href: CFG.css });
	const root = h('div', { class: 'ds-app', role: 'application', 'aria-label': 'DreamScaper' });
	shadow.append(css, root);
	app = { host, shadow, root, project: null, editor: null };
	// Keys typed in our inputs must not reach the host page's own shortcuts
	// (some themes swallow the space bar, arrow keys, etc.).
	for (const t of ['keydown', 'keyup', 'keypress']) shadow.addEventListener(t, (e) => { const el = e.composedPath()[0]; if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) e.stopPropagation(); });
	initAccount(CFG, root, toast);
	initCredits(root, toast);
	initStorage(root);
	initTour(root);
	initExplain(root, () => openHub({ v: 'plan' }));
	initCommunity(communityCtx());
	initHub(hubCtx());
	initHire(hubCtx());
	initInbox({ ...hubCtx(), hub: hubActions, openProjects: () => openProjects(), openFind: () => openFind(), openMember: (id) => openCommunity({ v: 'user', id }) });
	initBilling(hubCtx());
	initMsgSettings({ ...hubCtx(), openSettings: (tab) => openHub({ v: 'settings', tab }) });
	initBoard({
		get root() { return app.root; }, toast, store, ALL, MATERIALS, swatch, thumbFor, requireSignIn, plantFacts,
		page: (title, sub, ...kids) => pageShell(title, sub, ...kids),
		materialPicker: (on) => swatches(null, on),
		capture: (k) => capture(k, { angles: [] }),
		startAI: (prefill) => { leaveEditor(); openStudioFor(null, null, { prefill }); }
	});
	onRewards(showRewards);
	root.addEventListener('pointerdown', pressFx);
	let wasIn = null;
	app.offSess = onSession((s) => {
		syncHireTiles();
		const now = !!s.user;
		if (wasIn === false && now) syncAfterSignIn();
		if (wasIn === true && !now && app && !app.project && !busyOverlay()) home();
		wasIn = now;
	});
	refreshSession().then(() => {
		if (session.user) { syncAfterSignIn(true); handleReturn(); }
		if (pendingRoute) { const r = pendingRoute; pendingRoute = null; setTimeout(r, 50); }
	});
	onCloudStatus((st, msg) => {
		if (st === 'full' && !onCloudStatus.warned) { onCloudStatus.warned = true; openStorage('Your online storage is full, so your latest changes are only saved on this device. Add storage or delete something you no longer need.'); }
		if (app && app.ui && app.ui.cloud) { app.ui.cloud.classList.toggle('busy', st === 'saving'); app.ui.cloud.title = st === 'saving' ? 'Saving to your account…' : st === 'offline' ? 'Couldn’t reach your account — saved on this device' : st === 'full' ? 'Storage full — saved on this device only' : 'Saved to your account'; }
	});
	app.assetsReady = loadAssets();
	loadPhotoPack(byId, CFG.photos);
	loadMaterialPack(CFG.materials).then((n) => { if (n && app && app.tool === 'paint') renderPanel(); });
	app.offMat = onMaterialReady(() => { if (app && app.editor) { app.editor.rebuildGround(); app.editor.render(); } });
	app.offPhoto = onPhotoReady(() => { for (const k of [...thumbCache.keys()]) if (byId[k] && byId[k].photo) thumbCache.delete(k); if (app && app.editor) app.editor.render(); });
	document.documentElement.classList.add('dreamscaper-open');
	history.pushState({ dreamscaper: 1 }, '', '#dreamscaper');
	window.addEventListener('popstate', onPop);
	window.addEventListener('keydown', onKey);
	root.append(h('div', { class: 'ds-loading' }, 'Loading DreamScaper…'));
	// draw Home when the styles arrive — unless a deep link (email, Stripe return) already opened something
	const first = () => { if (app && app.root.querySelector('.ds-loading')) home(); };
	css.addEventListener('load', first, { once: true });
	css.addEventListener('error', first, { once: true });
}

/** The contractor tiles depend on the session, which can arrive after the home screen is drawn. */
function syncHireTiles() {
	const nav = app && app.hireNav;
	if (!nav || !nav.isConnected) return;
	const c = session.crm || {};
	nav.hidden = !c.on;
	const set = (act, b, s) => { const t = nav.querySelector(`[data-act=${act}]`); if (t) { t.querySelector('b').textContent = b; t.querySelector('small').textContent = s; } };
	const q = c.portal && c.portal.quotes;
	set('projects', 'My Projects', q ? `${q} quote${q > 1 ? 's' : ''} to review` : 'Quotes, hires & schedule');
	const r = c.pro && c.pro.requests;
	if (isPro()) set('hub', 'Contractor Hub', r ? `${r} new quote request${r > 1 ? 's' : ''}` : 'Customers, quotes, jobs & invoices');
	else set('hub', 'For Contractors', c.pro && c.pro.status === 'pending' ? 'Application under review' : 'Quote, sign & get paid — apply free');
}

function close() {
	if (!app) return;
	flushSave();
	if (app.editor) app.editor.destroy();
	if (app.offPhoto) app.offPhoto();
	if (app.offMat) app.offMat();
	if (app.offSess) app.offSess();
	window.removeEventListener('popstate', onPop);
	window.removeEventListener('keydown', onKey);
	document.documentElement.classList.remove('dreamscaper-open');
	app.host.remove();
	app = null;
	if (location.hash === '#dreamscaper') history.replaceState(null, '', location.pathname + location.search);
}
function onPop() { close(); }
function requestClose() { if (history.state && history.state.dreamscaper) history.back(); else close(); }

/* ============================================================= home/gallery */

function homeHeader() {
	return h('header', { class: 'ds-home-top' },
		brand(),
		h('div', { class: 'ds-spacer' }),
		pidButton(),
		inboxButton(),
		helpButton('start'),
		creditsPill(),
		accountChip({ onChange: () => home() }),
		h('button', { class: 'ds-icon-btn', 'aria-label': 'Close DreamScaper', onclick: requestClose }, icon('close')));
}

function browserCtx() {
	return {
		root: app.root, store, toast, header: homeHeader, home, newProject,
		open: (id) => openProject(id), pull: (cid) => pull(cid), listRemote, pushSoon, removeRemote
	};
}
function leaveEditor() {
	if (app.editor) { flushSave(); app.editor.destroy(); app.editor = null; }
	app.project = null;
}
function openMyDreamscapes(start) { leaveEditor(); app.libPage = null; openBrowser(browserCtx(), start); }

async function home() {
	leaveEditor();
	app.libPage = null;
	const root = app.root;
	root.innerHTML = '';
	const grid = h('div', { class: 'ds-grid ds-recent' });
	const mineCount = h('small', null, 'Your saved designs');
	const signedIn = !!session.user;
	const tile = (act, emoji, label, sub, fn, extra = '') => h('button', { class: 'ds-tile' + extra, 'data-act': act, onclick: fn },
		h('span', { class: 'ds-tile-ic', 'aria-hidden': 'true' }, emoji), h('b', null, label), sub ? (typeof sub === 'string' ? h('small', null, sub) : sub) : null);
	const homeMain = h('main', { class: 'ds-home ds-home2' },
			h('button', { class: 'ds-icon-btn ds-home-x', 'aria-label': 'Close DreamScaper', onclick: requestClose }, icon('close')),
			h('header', { class: 'ds-hlogo' }, logoArt(), CFG.brand ? h('p', { class: 'ds-hby' }, 'by ' + CFG.brand) : null),
			h('button', { class: 'ds-start', 'data-act': 'start', onclick: newProject },
				h('span', { class: 'ds-start-ic' }, icon('plus', 30)),
				h('span', { class: 'ds-start-txt' }, h('b', null, 'Start a new Dreamscape'), h('small', null, 'Design your yard yourself or with AI — we’ll guide you'))),
			h('nav', { class: 'ds-tiles', 'aria-label': 'DreamScaper' },
				tile('plantid', '🌿', 'Identify Plant', 'Snap it, learn how it grows', plantId),
				tile('library', '📚', 'Asset Library', `${ALL.filter((x) => !x.mine).length}+ plants & features`, assetLibraryPage),
				tile('mine', '🗂️', 'My Dreamscapes', mineCount, () => openMyDreamscapes()),
				tile('community', '🌎', 'Dreamscape Browser', 'Community designs & ideas', () => communityPage()),
				tile('create', '📸', 'Create New Asset', 'Photograph something you love', () => assetMaker()),
				tile('extract', '✂️', 'Extract Asset', 'Pull an item out of a photo', () => assetMaker(null, true))),
			(app.hireNav = h('nav', { class: 'ds-tiles ds-tiles2', 'aria-label': 'Hire a contractor', hidden: true },
				tile('find', '🔎', 'Find a Local Contractor', 'Turn your Dreamscape into a real yard', () => openFind()),
				tile('projects', '📋', 'My Projects', 'Quotes, hires & schedule', () => openProjects()),
				tile('hub', '🧰', 'For Contractors', 'Quote, sign & get paid — apply free', () => openHub(), ' ds-tile-wide'))),
			h('nav', { class: 'ds-tiles', 'aria-label': 'Account' },
				tile('messages', '💬', 'Messages', 'Contractors & members', () => openInbox()),
				tile('account', '👤', 'My Account', signedIn ? `${session.user.name.split(' ')[0]} · credits & storage` : 'Sign in — it’s free', () => accountSheet({ onChange: () => home(), tours: () => tourSettings() }))),
			h('section', { class: 'ds-recent-sec' },
				h('div', { class: 'ds-row ds-between ds-wrap' },
					h('h2', null, 'My Dreamscapes'),
					h('button', { class: 'ds-btn ds-ghost', onclick: () => openMyDreamscapes() }, icon('folder', 18), ' See all')),
				signedIn ? h('p', { class: 'ds-muted ds-sm-text' }, icon('cloud', 16), ' Saved to your account — open them on any device')
					: h('button', { class: 'ds-link ds-big-link', onclick: () => openAuth({ reason: 'Sign in to keep your Dreamscapes on every device.' }) }, 'Saved on this device · Sign in to save them online'),
				grid),
			h('nav', { class: 'ds-home-links', 'aria-label': 'Help' },
				h('button', { class: 'ds-btn ds-ghost', onclick: () => guide('start') }, '📖 How it works'),
				h('button', { class: 'ds-btn ds-ghost', onclick: () => startTour('home', true) }, '🧭 Take the tour'),
				h('button', { class: 'ds-btn ds-ghost', onclick: () => openBoard() }, '💡 Inspiration Board'),
				h('button', { class: 'ds-btn ds-ghost', onclick: startSample }, '🏡 Try a sample yard')));
	root.append(homeMain);
	syncHireTiles();
	const ct = homeMain.querySelector('[data-act=community]'), ac = homeMain.querySelector('[data-act=account]');
	ct.append(unreadDot('notes'));
	homeMain.querySelector('[data-act=messages]').append(inboxDot());
	const cm = session.community;
	if (signedIn && cm && cm.level) ac.querySelector('small').textContent = `${cm.level.emoji} ${cm.level.name} · 🌟 ${cm.points} points · credits & storage`;
	const ctx = browserCtx();
	const data = await loadDreamscapes(ctx);
	if (!app || app.root !== root || !root.contains(grid)) return;
	mineCount.textContent = data.items.length ? `${data.items.length} saved design${data.items.length > 1 ? 's' : ''}` : 'Your saved designs';
	if (data.blocked) grid.append(h('p', { class: 'ds-muted ds-span' }, 'This browser is blocking storage, so designs can\'t be saved (private mode?).'));
	if (!data.items.length) grid.append(h('button', { class: 'ds-card ds-card-new ds-span', onclick: newProject }, h('span', null, icon('plus', 34)), h('b', null, 'Your first Dreamscape will show up here'), h('small', null, 'Tap to start one')));
	for (const it of data.items.slice(0, HOME_LIMIT)) grid.append(dreamscapeCard(it, ctx, { onChange: home }));
	if (data.items.length > HOME_LIMIT) {
		grid.append(h('button', { class: 'ds-btn ds-ghost ds-wide ds-span ds-seeall', onclick: () => openMyDreamscapes() },
			icon('folder', 20), ` See all ${data.items.length} Dreamscapes — search, tag & organize`));
	}
	maybeTour('home');
}

/* ---------------------------------------------------------- simple pages */
function pageShell(title, sub, ...body) {
	leaveEditor();
	const root = app.root;
	root.innerHTML = '';
	const main = h('main', { class: 'ds-home ds-page' },
		h('div', { class: 'ds-page-head' },
			h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => home() }, '← Home'),
			h('h1', null, title), sub ? h('p', { class: 'ds-muted' }, sub) : null),
		...body);
	root.append(homeHeader(), main);
	return main;
}

/** Asset Library outside the editor: browse every plant & feature and My Library. */
function assetLibraryPage() {
	const box = h('div', { class: 'ds-libpage' });
	pageShell('Asset Library', 'Every plant and garden feature you can use in a design — with real growth data. Tap a plant for its full facts; tap one of yours to edit it. Open a Dreamscape to place them.', box);
	app.libPage = () => { box.innerHTML = ''; panelLibrary(box); };
	app.libPage();
}

/** Dreamscape Browser (community). */
function communityPage(view) { openCommunity(view); }

/** Context shared by the Contractor Hub and the homeowner side (Find a contractor, My Projects). */
function hubCtx() {
	return {
		get root() { return app.root; }, toast, header: homeHeader, home: () => home(), cfg: CFG,
		leave: () => { leaveEditor(); app.libPage = null; },
		requireSignIn,
		pickDesign,
		message: (uid) => openInbox({ with: uid }),
		messagePro: (pid) => openInbox({ pro: pid }),
		openThread: (id) => openInbox({ id }),
		openInbox: (v) => openInbox(v || {})
	};
}

/**
 * Let the customer / contractor pick one of their Dreamscapes and the view to use.
 * The design opens in the editor with a bar: "Use this view" → onPick(payload), "Cancel" → onCancel().
 */
async function pickDesign(onPick, onCancel) {
	const list = await store.listProjects().catch(() => []);
	if (!list.length) { toast('You don’t have any Dreamscapes yet. Create one first — it only takes a few minutes.', 5000); if (onCancel) onCancel(); return; }
	const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => { m.remove(); if (onCancel) onCancel(); } }, icon('close'));
	const grid = h('div', { class: 'ds-grid ds-pick' }, ...list.map((p) => h('button', { class: 'ds-card', onclick: async () => {
		m.remove();
		await openProject(p.id);
		const bar = h('div', { class: 'ds-pickbar', role: 'status' },
			h('span', null, h('b', null, 'Pick the view to send'), h('small', null, ' Switch views, season or year first if you like.')),
			h('button', { class: 'ds-btn ds-sm', onclick: async (e) => { e.currentTarget.disabled = true; const payload = await designPayload(); bar.remove(); onPick(payload); } }, icon('check', 16), ' Use this view'),
			h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => { bar.remove(); if (onCancel) onCancel(); } }, 'Cancel'));
		app.ui.stageWrap.append(bar);
	} },
	h('div', { class: 'ds-card-img' }, p.thumb ? h('img', { src: p.thumb, alt: '' }) : icon('image', 30)),
	h('div', { class: 'ds-card-body' }, h('b', null, p.name), h('small', null, `${p.views.length} view${p.views.length > 1 ? 's' : ''}`)))));
	const m = modal(app.root, 'Which Dreamscape?', [h('p', { class: 'ds-hint' }, 'It opens so you can choose the view to send. Bird’s-eye (aerial) views are measured to scale; photo views give estimated sizes.'), grid], close, 'ds-modal-wide');
}

/** Everything a contractor needs from the open design: pictures, plant list and measured shapes. */
async function designPayload() {
	const ed = app.editor, v = ed.view;
	const jpeg = (c, max = 1600) => { const k = Math.min(1, max / Math.max(c.width, c.height)); const o = canvas(c.width * k, c.height * k); const x = o.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, o.width, o.height); x.drawImage(c, 0, 0, o.width, o.height); return o.toDataURL('image/jpeg', 0.86); };
	const bm = await originalPhoto();
	const changed = v.before || v.objects.length || v.ops.length || v.edited;
	const plan = dreamscapeToPlan(v, { mat: (id) => MATERIALS.find((m) => m.id === id) || null, item: (id) => byId[id] || null });
	const assets = designAssets().map((a) => ({ ...a, w: a.w || (byId[a.id] && byId[a.id].w) || 3 }));
	return {
		title: app.project.name, after: jpeg(ed.composite(1600)), before: changed && bm ? jpeg(bgFit(bm)) : '',
		assets, ground: [...new Set(v.ops.filter((o) => !o.erase).map((o) => (MATERIALS.find((m) => m.id === o.mat) || {}).name).filter(Boolean))],
		season: app.project.season || 'summer', years: app.project.years || 0, ai: /AI/i.test(v.label || '') || !!v.ai, plan
	};
}

/** Editor ⋯ → "Get a quote from a local contractor". */
async function quoteFromEditor() {
	if (!(await requireSignIn('Sign in (free) to send your design to local contractors for a quote.'))) return;
	if (!app.editor.view.objects.length && !app.editor.view.ops.length && !app.editor.view.edited) toast('Tip: add your plants and beds first so the quote matches what you want.', 4000);
	const design = await designPayload();
	openFind({ design });
}
/** Editor ⋯ → "Turn into a quote" (contractors). */
async function proQuoteFromEditor() {
	const design = await designPayload();
	newQuote({ design });
}
function communityCtx() {
	return {
		get root() { return app.root; }, toast, header: homeHeader, home: () => home(),
		leave: () => { leaveEditor(); app.libPage = null; },
		capture: (k) => capture(k, { angles: [] }),
		plantFacts: (id) => (byId[id] ? plantFacts(byId[id]) : toast('That item isn’t in your library.')),
		pickDesignToShare,
		openHub: () => openHub(),
		openProjects: () => openProjects(),
		openInbox: (v) => openInbox(v || {})
	};
}

/** Choose one of your Dreamscapes to post (opens it, then the composer). */
async function pickDesignToShare() {
	const list = await store.listProjects().catch(() => []);
	if (!list.length) { toast('Create a Dreamscape first — then share it here.', 4000); return newProject(); }
	const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
	const grid = h('div', { class: 'ds-grid ds-pick' }, ...list.map((p) => h('button', { class: 'ds-card', onclick: async () => { m.remove(); await openProject(p.id); postFromEditor(); } },
		h('div', { class: 'ds-card-img' }, p.thumb ? h('img', { src: p.thumb, alt: '' }) : icon('image', 30)),
		h('div', { class: 'ds-card-body' }, h('b', null, p.name), h('small', null, `${p.views.length} view${p.views.length > 1 ? 's' : ''}`)))));
	const m = modal(app.root, 'Which Dreamscape do you want to share?', [h('p', { class: 'ds-hint' }, 'It opens so you can pick the view, season and year to show — then tap Post.'), grid], close, 'ds-modal-wide');
}

/** Everything placed in this view, grouped, with ages at the year being shown. */
function designAssets() {
	const ed = app.editor, years = app.project.years || 0;
	const groups = new Map();
	for (const o of ed.view.objects) {
		const it = byId[o.item];
		if (!it) continue;
		const g = groups.get(it.id) || { id: it.mine && it.base ? it.base : it.id, name: it.name, sci: it.sci || '', cat: it.cat, count: 0, ages: [], mine: !!it.mine };
		g.count++;
		g.ages.push((o.age || 0) + years);
		groups.set(it.id, g);
	}
	return [...groups.values()].map((g) => {
		const age = g.ages.reduce((a, x) => a + x, 0) / g.ages.length;
		const it = byId[g.id] || null;
		const sz = it && it.cat !== 'features' ? sizeAt(it, age) : it ? { h: it.h, w: it.w } : null;
		return { id: g.id, name: g.name, sci: g.sci, cat: g.cat, count: g.count, age: Math.round(age * 10) / 10, h: sz ? Math.round(sz.h * 10) / 10 : null, w: sz ? Math.round(sz.w * 10) / 10 : null, mine: g.mine };
	}).sort((a, b) => b.count - a.count);
}

async function postFromEditor() {
	if (!app.editor) return;
	if (!(await requireSignIn('Sign in to share your design with the community — it’s free.'))) return;
	const ed = app.editor;
	if (!ed.view.objects.length && !ed.view.ops.length && !ed.view.edited) toast('Tip: add some plants first — empty designs don’t get many likes!', 4000);
	const pic = ed.composite(1600);
	const bm = await originalPhoto();
	const changed = ed.view.before || ed.view.objects.length || ed.view.ops.length || ed.view.edited;
	const imgs = prepImages(pic, changed && bm ? bgFit(bm) : null);
	const ground = [...new Set(ed.view.ops.filter((o) => !o.erase).map((o) => (MATERIALS.find((m) => m.id === o.mat) || {}).name).filter(Boolean))];
	openComposer({ kind: 'design', ...imgs, title: app.project.name, tags: app.project.tags || [], assets: designAssets(), ground, season: app.project.season || 'summer', years: app.project.years || 0, ai: /AI/i.test(ed.view.label || '') || !!ed.view.ai });
}

/** Pick one of the customer's Dreamscape pictures (for Extract Asset). Resolves a Blob or null. */
async function pickDesignPhoto() {
	const list = (await store.listProjects().catch(() => [])).filter((p) => (p.views || []).some((v) => v.base));
	return new Promise((resolve) => {
		const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => { m.remove(); resolve(null); } }, icon('close'));
		const grid = h('div', { class: 'ds-grid ds-pick' });
		if (!list.length) grid.append(h('p', { class: 'ds-muted ds-span' }, 'No Dreamscapes with photos on this device yet.'));
		for (const p of list) for (const v of p.views.filter((x) => x.base)) {
			grid.append(h('button', { class: 'ds-card', onclick: async () => { const b = await store.getBlob(v.edited || v.base); m.remove(); resolve(b); } },
				h('div', { class: 'ds-card-img' }, p.thumb ? h('img', { src: p.thumb, alt: '' }) : icon('image', 30)),
				h('div', { class: 'ds-card-body' }, h('b', null, p.name), h('small', null, v.name || 'View'))));
		}
		const m = modal(app.root, 'Choose a Dreamscape photo', [grid], close, 'ds-modal-wide');
	});
}

function brand() {
	return h('div', { class: 'ds-brand' }, logoMark(38), wordmark(), CFG.brand ? h('small', null, 'by ' + CFG.brand) : null);
}


/* ========================================================== new project flow */

function sourceButtons(onPick, withAI) {
	const opts = [
		['camera', 'camera', 'Take a photo', 'Use your phone camera with framing guides'],
		['upload', 'upload', 'Upload a photo', 'Pick a photo of your yard you already have'],
		['aerial', 'map', 'Bird\'s-eye view', 'Find your house on Connecticut aerial imagery'],
		['sample', 'leaf', 'Sample yard', 'Play with a ready-made front yard']
	];
	if (CFG.mapsKey) opts.splice(2, 0, ['3d', 'globe', 'Explore in 3D', 'Fly around your home in Google 3D, save your favorite angles, then snap a photo from that spot']);
	const box = h('div', { class: 'ds-sources' }, ...opts.map(([k, ic, t, d]) => h('button', { class: 'ds-source', onclick: () => onPick(k) }, h('span', { class: 'ds-source-ic' }, icon(ic, 26)), h('b', null, t), h('small', null, d))));
	if (withAI) { const aer = box.children[opts.findIndex((o) => o[0] === 'aerial')]; box.insertBefore(aiBox(withAI), aer ? aer.nextSibling : null); }
	return box;
}

async function capture(kind, project) {
	const root = app.root;
	if (kind === 'camera') return camera(root);
	if (kind === 'upload') return pickFile();
	if (kind === 'aerial') return aerial(root, CFG, toast);
	if (kind === 'sample') {
		const s = sampleYard();
		const blob = await canvasToBlob(s.c, 'image/jpeg', 0.92);
		return { blob, W: s.c.width, H: s.c.height, kind: 'photo', bitmap: s.c, cam: { horizon: s.horizon, camH: 5, focal: Math.round(0.785 * s.c.width) }, label: 'Front yard' };
	}
	if (kind === '3d') {
		const r = await explore3d(root, CFG, project, () => saveSoon());
		if (!r || !r.snap) return null;
		const a = r.snap;
		const shot = await camera(root, `Go to the spot that matches “${a.name}”: face ${facing(a.heading)}, about ${Math.round(a.range * 3.28 / 3) * 3} ft from the house. Phone sideways at eye level.`);
		if (shot && !shot.error) shot.label = a.name;
		return shot;
	}
	return null;
}

/** Guided start: 1) how to design (yourself or AI) 2) the photo. */
function newProject() {
	let mode = null;
	const name = h('input', { type: 'text', value: suggestName(), maxlength: 60, 'aria-label': 'Name your Dreamscape' });
	const body = h('div', { class: 'ds-wiz' });
	const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
	const m = modal(app.root, 'Start a new Dreamscape', [body], close, 'ds-modal-wiz');
	const stepper = (i) => h('ol', { class: 'ds-wiz-steps' }, ...['How to design', 'Your photo'].map((t, k) => h('li', { class: k === i ? 'on' : k < i ? 'done' : '' }, h('b', null, k < i ? '✓' : String(k + 1)), h('span', null, t))));
	const step1 = () => {
		body.innerHTML = '';
		const card = (id, ic, title, desc, extra) => h('button', { class: 'ds-source ds-choice' + (mode === id ? ' on' : ''), onclick: () => pick(id) },
			h('span', { class: 'ds-source-ic' }, ic), h('b', null, title, extra || null), h('small', null, desc));
		body.append(stepper(0),
			h('h4', { class: 'ds-wiz-q' }, 'How would you like to design your yard?'),
			h('div', { class: 'ds-sources ds-sources-2' },
				card('self', icon('pencil', 26), 'Design it myself', 'Place real Connecticut plants at true size, paint on mulch and stone, erase things you don’t want, and watch it grow year by year. Free — no account needed.'),
				card('ai', icon('sparkle', 26), 'Design it with AI', `Dreamscape AI repaints your photo with what you ask for — say it, tap ideas, or show it a photo you love. Takes about 20 seconds. You can still add plants yourself afterwards. ${session.ai.limit || 10} free AI credits a day.`,
					!session.user ? h('span', { class: 'ds-lock-tag' }, icon('lock', 12), ' Free sign-in') : null)),
			h('p', { class: 'ds-hint ds-center' }, 'Not sure? Start with “Design it myself” — you can send your design to the AI at any time with the ✨ button.'));
	};
	const pick = async (id) => {
		if (id === 'ai') {
			if (!session.ai.enabled) return toast('Dreamscape AI is being set up — try “Design it myself” for now.');
			if (!(await requireSignIn('Sign in to design with Dreamscape AI — it’s free.'))) return;
		}
		mode = id;
		step2();
	};
	const step2 = () => {
		body.innerHTML = '';
		body.append(stepper(1),
			h('h4', { class: 'ds-wiz-q' }, mode === 'ai' ? 'Which photo should the AI transform?' : 'Add a photo of your yard'),
			h('div', { class: 'ds-explain' }, h('p', null, '📸 ', h('b', null, 'Best results: '), 'stand back so the whole area (and some of the house) fits, hold your phone sideways at eye level, and keep it level.')),
			sourceButtons(async (k) => {
				const shot = await capture(k, { angles: [] });
				if (!shot) return;
				if (shot.error) return toast(shot.error);
				m.remove();
				const nm = name.value.trim() || 'My Dreamscape';
				if (mode === 'ai') await createAIProject(nm, shot);
				else await createProject(nm, shot, { id: uid(), angles: [] });
			}),
			h('details', { class: 'ds-start-from' }, h('summary', null, 'Or start from…'),
				h('div', { class: 'ds-row ds-wrap' },
					h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => { m.remove(); startFromDesign(mode, name.value.trim()); } }, icon('folder', 16), ' One of my Dreamscapes or saved views'),
					mode === 'ai' ? h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: async () => { m.remove(); const items = (await store.listBoard().catch(() => [])).filter((x) => x.blob).slice(0, 3); const refs = []; for (const it of items) { const b = await store.getBlob(it.blob); if (b) refs.push(await blobToBitmap(b)); } if (!refs.length) toast('Your Inspiration Board has no pictures yet — add some first.', 4500); openStudioFor(null, null, { prefill: { refs, words: '' } }); } }, '💡 My Inspiration Board') : null)),
			h('label', { class: 'ds-label ds-wiz-name' }, 'Name (optional)', name),
			h('button', { class: 'ds-link', onclick: step1 }, '← Back'));
	};
	step1();
}

/** AI path: the photo becomes a Dreamscape, then the AI studio opens on it. */
async function createAIProject(name, shot) {
	const v = await makeView(shot);
	if (v.label === 'View') v.label = 'View 1';
	const p = { id: uid(), name, created: Date.now(), updated: Date.now(), views: [v], active: 0, angles: [], season: 'summer', years: 0, night: false, sun: -1, thumb: null, aiRuns: [] };
	const saved = await store.putProject(p);
	pushSoon('design', saved);
	openStudioFor(p, null, { image: shot.bitmap, aerial: shot.kind === 'aerial', view: v.id, toEditor: true });
}

/** New Dreamscape from an existing one: copy the whole design, or start fresh from one of its views' photo. */
async function startFromDesign(mode, nm) {
	const list = await store.listProjects().catch(() => []);
	if (!list.length) { toast('No Dreamscapes yet — start with a photo.'); return newProject(); }
	const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
	const box = h('div', { class: 'ds-hub-list' });
	for (const p of list) {
		box.append(h('div', { class: 'ds-ver-card' }, p.thumb ? h('img', { src: p.thumb, alt: '' }) : h('span', { class: 'ds-qthumb' }, '🏡'),
			h('div', { class: 'ds-grow' }, h('b', null, p.name), h('small', null, `${p.views.length} view${p.views.length > 1 ? 's' : ''}`)),
			h('div', { class: 'ds-row ds-wrap' },
				mode !== 'ai' ? h('button', { class: 'ds-btn ds-sm', onclick: async () => { m.remove(); const c = await store.duplicate(p, nm || p.name + ' (copy)'); openProject(c.id); } }, 'Copy whole design') : null,
				...p.views.map((v) => h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: async () => {
					m.remove();
					const b = await store.getBlob(v.before || v.base);
					if (!b) return toast('That photo is missing.');
					const bm = await blobToBitmap(b);
					const shot = { blob: b, W: v.W, H: v.H, kind: v.kind, bitmap: bgFit(bm), ppf: v.ppf, where: v.where, cam: v.cam ? { ...v.cam } : undefined, label: v.label };
					if (mode === 'ai') await createAIProject(nm || 'AI ' + p.name, shot);
					else await createProject(nm || p.name + ' – new idea', shot, { id: uid(), angles: p.angles || [] });
				} }, `Fresh from “${v.label}”`)))));
	}
	const m = modal(app.root, 'Start from one of my Dreamscapes', [h('p', { class: 'ds-hint' }, 'Copy a whole design to try a new idea, or start fresh from the original photo of any saved view.'), box], close, 'ds-modal-wide');
}

async function startSample() {
	const shot = await capture('sample');
	await createProject('Sample Front Yard', shot, { id: uid(), angles: [] });
}

function suggestName() {
	const d = new Date();
	return `My Dream Yard – ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

async function makeView(shot) {
	const baseId = await store.putBlob(shot.blob);
	const v = { id: uid(), label: shot.label || (shot.kind === 'aerial' ? 'Bird\'s-eye' : 'View'), kind: shot.kind, base: baseId, edited: null, W: shot.W, H: shot.H, ops: [], objects: [], coached: false };
	if (shot.kind === 'aerial') { v.ppf = shot.ppf; v.where = shot.where; }
	if (shot.cam) v.cam = shot.cam;
	return v;
}

async function createProject(name, shot, draft) {
	const v = await makeView(shot);
	if (v.label === 'View') v.label = 'View 1';
	const p = { id: draft.id || uid(), name, created: Date.now(), updated: Date.now(), views: [v], active: 0, angles: draft.angles || [], season: 'summer', years: 0, night: false, sun: -1, thumb: null };
	await store.putProject(p);
	if (session.user) api('c/event', { body: { type: 'design', ref: p.id } }).catch(() => {});
	openProject(p.id, shot.bitmap);
}

/* ================================================================== editor */

async function openProject(id, bitmap) {
	await app.assetsReady;
	const p = await store.getProject(id);
	if (!p) return home();
	// drop anything whose asset was deleted
	for (const v of p.views) v.objects = (v.objects || []).filter((o) => byId[o.item]);
	app.project = p;
	p.active = clamp(p.active || 0, 0, p.views.length - 1);
	buildEditorUI();
	await loadView(p.active, bitmap);
	maybeTour('editor');
}

async function loadView(i, bitmap) {
	const p = app.project;
	flushSave();
	p.active = i;
	const v = p.views[i];
	let img = bitmap;
	if (!img) {
		const blob = await store.getBlob(v.edited || v.base);
		img = await blobToBitmap(blob);
	}
	app.editor.open(p, v, img);
	store.getBlob(v.before || v.base).then((b) => (b ? blobToBitmap(b) : null)).then((bm) => { if (app && app.editor && app.editor.view === v) app.editor.setOriginal(bm); }).catch(() => {});
	renderTabs();
	syncScenebar();
	if (!v.coached) {
		v.coached = true;
		if (v.kind === 'aerial') { setTool('plants'); toast('Bird\'s-eye view is to scale. Drop in plants from the library to see how much room they need.', 6000); }
		else { setTool('scale'); toast('Quick setup: drag the blue line to eye level (where the camera was). It makes every plant true-to-scale.', 7000); }
		saveSoon();
	} else setTool(app.tool || 'select');
}

function buildEditorUI() {
	const root = app.root;
	root.innerHTML = '';
	const ui = (app.ui = {});
	ui.name = h('input', { class: 'ds-name', value: app.project.name, maxlength: 60, 'aria-label': 'Dreamscape name', oninput: () => { app.project.name = ui.name.value; saveSoon(); } });
	ui.tabs = h('div', { class: 'ds-tabs', role: 'tablist' });
	ui.status = h('span', { class: 'ds-status' }, 'Saved');
	ui.undo = h('button', { class: 'ds-icon-btn', 'aria-label': 'Undo', title: 'Undo (Ctrl+Z)', onclick: () => app.editor.undo() }, icon('undo'));
	ui.redo = h('button', { class: 'ds-icon-btn', 'aria-label': 'Redo', title: 'Redo (Ctrl+Shift+Z)', onclick: () => app.editor.redo() }, icon('redo'));
	const top = h('header', { class: 'ds-top' },
		h('button', { class: 'ds-icon-btn', 'aria-label': 'My Dreamscapes', title: 'My Dreamscapes', onclick: home }, icon('home')),
		h('span', { class: 'ds-logo-sm' }, logoMark(30)),
		ui.name,
		ui.tabs,
		h('div', { class: 'ds-spacer' }),
		ui.status, ui.undo, ui.redo,
		(ui.histBtn = h('button', { class: 'ds-icon-btn', 'aria-label': 'History', title: 'History — see every change and go back to any step', onclick: () => toggleHistory() }, icon('history'))),
		(ui.layBtn = h('button', { class: 'ds-icon-btn', 'aria-label': 'Layers', title: 'Layers — show, hide, lock and arrange everything', onclick: () => toggleLayers() }, icon('layers'))),
		(ui.cloud = h('span', { class: 'ds-cloud', hidden: !session.user, title: 'Saved to your account' }, icon('cloud', 18))),
		pidButton(),
		h('button', { class: 'ds-btn ds-ai-btn ds-sm', onclick: sendToAI, title: 'Send this design to Dreamscape AI' }, icon('sparkle', 18), h('span', { class: 'ds-hide-sm' }, ' Dreamscape AI')),
		CFG.share ? h('button', { class: 'ds-btn ds-sm ds-send-btn', onclick: () => share() }, icon('send', 18), h('span', { class: 'ds-hide-sm' }, ' Send to ' + (CFG.shortBrand || 'us'))) : null,
		moreMenu([
			['versions', 'Design versions & notes', () => openVersions(edCtx())],
			['compare', 'Compare designs', () => compareDialog(edCtx())],
			['eye', 'Presentation mode', () => presentation(edCtx())],
			['board', 'Save to my Inspiration Board', () => saveDesignToBoard()],
			['chat', 'Request a consultation', () => contactUs('consult')],
			['leaf', 'Ask a question', () => contactUs('question')],
			['globe', 'Post to Dreamscape Browser', () => postFromEditor()],
			...(session.crm && session.crm.on ? [['send', 'Get a quote from a local contractor', () => quoteFromEditor()]] : []),
			...(isPro() ? [['edit', 'Turn into a quote (Contractor Hub)', () => proQuoteFromEditor()]] : []),
			['download', 'Save a picture', download],
			['share', 'Share on social media', shareDesign],
			['print', 'Print', printView],
			['history', 'History', () => toggleHistory()],
			['leaf', 'How it works', () => guide(null)],
			['play', 'Show me around (tour)', () => startTour('editor', true)]
		]),
		creditsPill(),
		accountChip({}),
		h('button', { class: 'ds-icon-btn', 'aria-label': 'Close DreamScaper', onclick: requestClose }, icon('close')));

	ui.tools = h('nav', { class: 'ds-tools', 'aria-label': 'Tools' }, ...TOOLS.map(([id, ic, label, key]) =>
		h('button', { class: 'ds-tool', 'data-tool': id, title: `${label} (${key})`, 'aria-label': label, onclick: () => setTool(id) }, icon(ic, 24), h('span', null, label.split(' ')[0]))));
	ui.stage = h('div', { class: 'ds-stage' });
	ui.toast = h('div', { class: 'ds-toast', role: 'status', 'aria-live': 'polite' });
	ui.scenebar = scenebar();
	ui.zoom = h('div', { class: 'ds-zoom' },
		h('button', { class: 'ds-icon-btn', 'aria-label': 'Zoom out', onclick: () => app.editor.zoomBy(1 / 1.25) }, icon('minus', 18)),
		h('button', { class: 'ds-icon-btn', 'aria-label': 'Fit to screen', onclick: () => app.editor.fit() }, icon('fit', 18)),
		h('button', { class: 'ds-icon-btn', 'aria-label': 'Zoom in', onclick: () => app.editor.zoomBy(1.25) }, icon('plus', 18)));
	ui.panel = h('aside', { class: 'ds-panel', 'aria-label': 'Options' });
	ui.panelToggle = h('button', { class: 'ds-panel-grip', 'aria-label': 'Show or hide options', onclick: () => ui.panel.classList.toggle('collapsed') }, h('i'));
	ui.guide = guideBar({ project: () => app.project, view: () => app.editor && app.editor.view, setTool, toast, changed: () => saveSoon(), onHelp: (k) => guide(k) });
	const stageWrap = (ui.stageWrap = h('div', { class: 'ds-stage-wrap' }, ui.guide, ui.stage, ui.scenebar, ui.zoom, ui.toast));
	root.append(top, h('div', { class: 'ds-main' }, ui.tools, stageWrap, h('div', { class: 'ds-panel-wrap' }, ui.panelToggle, ui.panel)));

	app.editor = new Editor(ui.stage, {
		onSelect: (o, soft) => { if (app.tool === 'select' || app.tool === 'plants') { if (soft && o && ui.inspector && ui.inspector.obj === o) updateInspector(); else renderPanel(); } },
		onChange: (kind) => { saveSoon(kind); },
		onHistory: () => { ui.undo.disabled = !app.editor.undoStack.length; ui.redo.disabled = !app.editor.redoStack.length; if (ui.hist) ui.hist.refresh(); if (ui.layers) ui.layers.refresh(); },
		onTool: (t) => { if (t === 'select' && app.tool !== 'select' && app.tool !== 'plants') { app.tool = 'select'; markTool(); renderPanel(); } },
		onBed: () => app.tool === 'bed' && renderPanel(),
		onSelectOp: (op, soft) => { if (app.tool === 'select' || app.tool === 'plants') { if (op && !soft && app.tool === 'plants') { app.tool = 'select'; markTool(); } renderPanel(); } if (ui.layers) ui.layers.refresh(); },
		onMeasure: () => { if (app.tool === 'measure') renderPanel(); },
		onMask: (n) => { if (app.tool === 'ai' && !!n !== !!app._aiSel) { app._aiSel = !!n; renderPanel(); } if (ui.eraseBtn) { ui.eraseBtn.disabled = !n; ui.eraseInfo.textContent = n ? `${n.toLocaleString()} pixels selected` : 'Nothing selected yet'; } },
		toast
	});
	ui.undo.disabled = ui.redo.disabled = true;
}

function renderTabs() {
	const p = app.project, ui = app.ui;
	ui.tabs.innerHTML = '';
	p.views.forEach((v, i) => {
		const tab = h('button', { class: 'ds-tab' + (i === p.active ? ' on' : ''), role: 'tab', 'aria-selected': i === p.active ? 'true' : 'false', title: 'Double-click to rename',
			onclick: () => { if (i !== p.active) loadView(i); },
			ondblclick: () => { const n = prompt('Name this view', v.label); if (n && n.trim()) { v.label = n.trim(); renderTabs(); saveSoon(); } } },
		v.kind === 'aerial' ? icon('map', 15) : icon('camera', 15), ' ', v.label);
		if (p.views.length > 1 && i === p.active) {
			tab.append(h('span', { class: 'ds-tab-x', role: 'button', 'aria-label': 'Delete view', onclick: async (e) => {
				e.stopPropagation();
				if (!confirm(`Delete the view “${v.label}”?`)) return;
				p.views.splice(i, 1);
				await store.deleteBlob(v.base); if (v.edited) await store.deleteBlob(v.edited);
				await store.putProject(p);
				loadView(Math.max(0, i - 1));
			} }, '×'));
		}
		ui.tabs.append(tab);
	});
	ui.tabs.append(h('button', { class: 'ds-tab ds-tab-add', title: 'Add another angle or view', onclick: addView }, icon('plus', 16), h('span', { class: 'ds-hide-sm' }, ' Add view')));
}

function addView() {
	const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
	const m = modal(app.root, 'Add another view', [
		h('p', { class: 'ds-muted' }, 'Capture your yard from another angle (backyard, side yard, from the street…). Every view is saved inside this Dreamscape.'),
		sourceButtons(async (k) => {
			m.remove();
			const shot = await capture(k, app.project);
			if (!shot) return;
			if (shot.error) return toast(shot.error);
			const v = await makeView(shot);
			if (v.label === 'View') v.label = `View ${app.project.views.length + 1}`;
			app.project.views.push(v);
			await store.putProject(cleanProject());
			loadView(app.project.views.length - 1, shot.bitmap);
		}, () => { m.remove(); sendToAI(); })
	], close);
}

/* ---------------------------------------------------------------- scenebar */

function scenebar() {
	const p = () => app.project;
	const ui = app.ui;
	ui.seasons = h('div', { class: 'ds-seg', role: 'radiogroup', 'aria-label': 'Season' }, ...SEASONS.map(([k, n]) =>
		h('button', { 'data-s': k, role: 'radio', onclick: () => { p().season = k; app.editor.render(); syncScenebar(); saveSoon(); if (app.ui.inspector) updateInspector(); } }, n)));
	ui.years = h('input', { type: 'range', min: 0, max: 30, step: 1, value: 0, 'aria-label': 'Years from now', oninput: () => { p().years = +ui.years.value; syncYears(); app.editor.render(); saveSoon(); if (app.ui.inspector) updateInspector(); } });
	ui.yearLabel = h('b', { class: 'ds-year' }, 'Today');
	ui.play = h('button', { class: 'ds-icon-btn', 'aria-label': 'Play growth', title: 'Watch it grow', onclick: playGrowth }, icon('play', 18));
	ui.night = h('button', { class: 'ds-icon-btn', title: 'Day / night', 'aria-label': 'Toggle night lighting', onclick: () => { p().night = !p().night; syncScenebar(); app.editor.render(); saveSoon(); } }, icon('moon', 18));
	ui.sunBtn = h('button', { class: 'ds-icon-btn ds-sun', title: 'Flip sunlight direction', 'aria-label': 'Flip sunlight direction', onclick: () => { p().sun = -(p().sun || -1); app.editor.render(); saveSoon(); } }, icon('sun', 18));
	ui.origBtn = h('button', { class: 'ds-icon-btn', title: 'Hold to see the original photo', 'aria-label': 'Hold to see the original photo' }, icon('eye', 18));
	ui.origBtn.addEventListener('pointerdown', () => peekOriginal(true));
	for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) ui.origBtn.addEventListener(ev, () => peekOriginal(false));
	return h('div', { class: 'ds-scenebar' },
		ui.seasons,
		h('div', { class: 'ds-timeline' }, ui.play, h('span', { class: 'ds-muted' }, 'Time'), ui.years, ui.yearLabel),
		h('div', { class: 'ds-row' }, ui.origBtn, ui.sunBtn, ui.night));
}

function syncScenebar() {
	const p = app.project, ui = app.ui;
	ui.seasons.querySelectorAll('button').forEach((b) => { const on = b.dataset.s === (p.season || 'summer'); b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
	ui.years.value = p.years || 0;
	ui.night.classList.toggle('on', !!p.night);
	ui.night.innerHTML = '';
	ui.night.append(icon(p.night ? 'sun' : 'moon', 18));
	syncYears();
}
function syncYears() {
	const y = app.project.years || 0;
	app.ui.yearLabel.textContent = y === 0 ? 'Today' : `+${y} yr${y > 1 ? 's' : ''}`;
	app.ui.years.style.setProperty('--fill', (y / 30) * 100 + '%');
}

function playGrowth() {
	const ui = app.ui, p = app.project;
	if (app.playing) { app.playing = false; return; }
	app.playing = true;
	ui.play.innerHTML = ''; ui.play.append(icon('pause', 18));
	const start = performance.now();
	const from = (p.years || 0) >= 29 ? 0 : p.years || 0;
	const tick = (t) => {
		if (!app || !app.playing) return done();
		const y = Math.min(30, from + ((t - start) / 1000) * 3);
		p.years = Math.round(y * 2) / 2;
		ui.years.value = p.years;
		syncYears();
		app.editor.render();
		if (y >= 30) return done();
		requestAnimationFrame(tick);
	};
	const done = () => { if (!app) return; app.playing = false; p.years = Math.round(p.years); syncScenebar(); ui.play.innerHTML = ''; ui.play.append(icon('play', 18)); saveSoon(); };
	requestAnimationFrame(tick);
}

/* ------------------------------------------------------------------- tools */

function setTool(t) {
	app.tool = t;
	const ed = app.editor;
	if (t === 'plants') ed.setTool(ed.placeItem ? 'place' : 'select');
	else if (t === 'ai') ed.setTool('eraser');
	else if (t === 'adjust') ed.setTool('pan');
	else ed.setTool(t);
	markTool();
	renderPanel();
}
function markTool() {
	app.ui.tools.querySelectorAll('.ds-tool').forEach((b) => b.classList.toggle('on', b.dataset.tool === app.tool));
}

function renderPanel() {
	const ui = app.ui, ed = app.editor;
	const keepScroll = app.tool === app._lastPanelTool && !ed.sel === !app._lastSel;
	const st = ui.panel.scrollTop;
	ui.panel.innerHTML = '';
	ui.inspector = null; ui.eraseBtn = null;
	app._lastPanelTool = app.tool; app._lastSel = !!ed.sel;
	requestAnimationFrame(() => { ui.panel.scrollTop = keepScroll ? st : 0; });
	const t = app.tool;
	if ((t === 'select' || t === 'plants') && ed.sel) return inspector(ed.sel);
	if (t === 'select' && ed.selOp) return opInspector(ui.panel, ed.selOp, edCtx());
	const P = {
		select: panelSelect, plants: panelLibrary, paint: panelPaint, bed: (el) => panelShapes(el, edCtx()), eraser: panelEraser, scale: panelScale, pan: panelPan,
		measure: (el) => panelMeasure(el, edCtx()), adjust: (el) => panelAdjust(el, edCtx()),
		ai: (el) => panelAI(el, toolCtx())
	}[t] || panelSelect;
	P(ui.panel);
}

function sect(title, ...kids) { return h('section', { class: 'ds-sect' }, title ? h('h4', null, title) : null, ...kids); }
function add(el, ...kids) { el.append(...kids.filter(Boolean)); }
function slider(label, min, max, step, val, fmt, on) {
	const out = h('output', null, fmt(val));
	const r = h('input', { type: 'range', min, max, step, value: val, 'aria-label': label, oninput: () => { out.textContent = fmt(+r.value); on(+r.value); } });
	return h('label', { class: 'ds-slider' }, h('span', null, label, out), r);
}
function seg(options, val, on) {
	const box = h('div', { class: 'ds-seg ds-seg-full' });
	options.forEach(([k, n]) => {
		const b = h('button', { class: k === val ? 'on' : '', 'aria-pressed': k === val ? 'true' : 'false' }, n);
		b.onclick = () => { box.querySelectorAll('button').forEach((x) => { x.classList.remove('on'); x.setAttribute('aria-pressed', 'false'); }); b.classList.add('on'); b.setAttribute('aria-pressed', 'true'); on(k); };
		box.append(b);
	});
	return box;
}

function panelSelect(el) {
	const v = app.editor.view;
	const n = v.objects.length;
	add(el,
		sect('Select & move', h('p', { class: 'ds-muted' }, n || v.ops.length ? 'Tap a plant or feature to move, resize, rotate, flip, duplicate, blend or arrange it. Tap a bed, patio, walkway or wall to reshape it.' : 'Nothing placed yet. Open the plant library to start designing.')),
		n ? null : sect(null, h('button', { class: 'ds-btn ds-wide', onclick: () => setTool('plants') }, icon('plant', 18), ' Open plant library')),
		sect('In this view', h('div', { class: 'ds-stats' },
			stat(n, 'plants & features'), stat(v.ops.length, 'ground areas'))),
		sect('Shortcuts', h('ul', { class: 'ds-keys' },
			...[['V P B L M J E S H', 'Switch tools'], ['Delete', 'Remove selected'], ['Ctrl D', 'Duplicate'], ['Arrows', 'Nudge selected'], ['[ / ]', 'Rotate selected'], ['Ctrl Z', 'Undo'], ['Space-drag', 'Pan'], ['+ / −', 'Zoom']].map(([k, d]) => h('li', null, h('kbd', null, k), d)))));
}
function stat(n, t) { return h('div', { class: 'ds-stat' }, h('b', null, String(n)), h('small', null, t)); }

/* -------------------------------------------------------------- My Library */

const assetUrls = new Map();
async function loadAssets() {
	try {
		const recs = await store.listAssets();
		for (const r of recs) await registerAsset(r);
	} catch (e) { console.warn('DreamScaper: assets unavailable', e); }
}
async function registerAsset(r) {
	if (r.thumb) {
		const b = await store.getBlob(r.thumb);
		if (b) { if (assetUrls.has(r.id)) URL.revokeObjectURL(assetUrls.get(r.id)); const u = URL.createObjectURL(b); assetUrls.set(r.id, u); r.thumbUrl = u; }
	}
	const it = assetItem(r, (id) => store.getBlob(id));
	it.rec = r;
	addItem(it);
	thumbCache.delete(r.id);
	return it;
}
function assetMaker(rec, extract = false) {
	openAssetMaker(app.root, {
		store, toast, rec, extract, owner: !!CFG.owner, getBlob: (id) => store.getBlob(id),
		pickDesign: extract ? pickDesignPhoto : null,
		smartSelect: extract ? async (img, text) => {
			if (!session.user) { if (!(await requireSignIn('Sign in to find things by name — it’s free.'))) return null; }
			if (!session.ai.segment) throw new Error('Finding by name isn’t switched on yet — drag a box instead.');
			return segment(img, text, img.width, img.height);
		} : null,
		onSaved: async (r, isNew) => {
			pushSoon('asset', r);
			const it = await registerAsset(r);
			if (app.editor) app.editor.render();
			const L = libState();
			L.cat = 'mine'; L.q = '';
			if (app.tool !== 'plants' && app.editor) setTool('plants'); else if (app.editor) renderPanel(); else if (app.libPage) app.libPage();
			if (isNew && app.editor) { app.editor.startPlacing(it); toast(`Tap the photo to place ${it.name}.`, 3500); }
		},
		onDeleted: (r) => {
			removeRemote('asset', r);
			removeItem(r.id);
			if (assetUrls.has(r.id)) { URL.revokeObjectURL(assetUrls.get(r.id)); assetUrls.delete(r.id); }
			if (app.editor) {
				const ed = app.editor;
				for (const v of app.project.views) v.objects = v.objects.filter((o) => o.item !== r.id);
				if (ed.placeItem && ed.placeItem.id === r.id) ed.placeItem = null;
				ed.select(null); ed.render(); saveSoon();
				renderPanel();
			}
			toast(`Deleted \u201c${r.name}\u201d.`);
		}
	});
}

/* ------------------------------------------------------- lazy thumbnails */

const thumbCache = new Map();
function thumbFor(item) {
	if (item.mine && item.photo && item.photo.thumb) return item.photo.thumb;
	if (!thumbCache.has(item.id)) thumbCache.set(item.id, thumb(item, 84).toDataURL());
	return thumbCache.get(item.id);
}
/* Thumbnails are drawn only when scrolled into view, a few per frame, so a
 * 600-item library opens instantly and scrolling stays smooth. */
const lazy = { q: [], busy: false, io: null, root: null };
function lazyObserver() {
	const root = app.ui && app.ui.panel && app.ui.panel.isConnected ? app.ui.panel : app.root.querySelector('.ds-home') || null;
	if (lazy.io && lazy.root === root) return lazy.io;
	lazy.root = root;
	lazy.io = new IntersectionObserver((ents) => {
		for (const e of ents) if (e.isIntersecting) { lazy.io.unobserve(e.target); lazy.q.push(e.target); }
		pump();
	}, { root, rootMargin: '300px 0px' });
	return lazy.io;
}
function lazyThumb(item) {
	const img = h('img', { alt: '', width: 84, height: 84, class: 'ds-ph' });
	if (item.mine && item.photo && item.photo.thumb) { img.src = item.photo.thumb; img.classList.remove('ds-ph'); return img; }
	if (thumbCache.has(item.id)) { img.src = thumbCache.get(item.id); img.classList.remove('ds-ph'); return img; }
	img._job = () => { img.src = thumbFor(item); img.classList.remove('ds-ph'); };
	lazyObserver().observe(img);
	return img;
}
function lazySwatch(id, size) {
	const key = 'sw|' + id + '|' + size;
	const c = canvas(size, size);
	if (thumbCache.has(key)) { c.getContext('2d').drawImage(thumbCache.get(key), 0, 0); return c; }
	c.className = 'ds-ph';
	c._job = () => { const sw = swatch(id, size); thumbCache.set(key, sw); c.getContext('2d').drawImage(sw, 0, 0); c.classList.remove('ds-ph'); };
	lazyObserver().observe(c);
	return c;
}
function pump() {
	if (lazy.busy) return;
	lazy.busy = true;
	const step = () => {
		const t0 = performance.now();
		while (lazy.q.length && performance.now() - t0 < 10) { const el = lazy.q.shift(); if (el.isConnected && el._job) { try { el._job(); } catch (e) { console.warn(e); } el._job = null; } }
		if (lazy.q.length) requestAnimationFrame(step); else lazy.busy = false;
	};
	requestAnimationFrame(step);
}

/* ---------------------------------------------------------- plant library */

const SIZES = { '': 'Any size', s: 'Under 3 ft', m: '3–15 ft', l: '15–40 ft', xl: 'Over 40 ft' };
const sizeOk = (it, k) => !k || (k === 's' ? it.h < 3 : k === 'm' ? it.h >= 3 && it.h <= 15 : k === 'l' ? it.h > 15 && it.h <= 40 : it.h > 40);
function libState() {
	if (!app.lib) app.lib = { cat: 'trees', q: '', native: false, deer: false, ev: false, sun: '', season: '', color: '', size: '', group: '', sort: 'name', more: false };
	return app.lib;
}
function libItems(L) {
	const words = L.q.toLowerCase().split(/\s+/).filter(Boolean);
	let items = ALL.filter((it) => {
		if (words.length) { if (!matchesWords(it, words)) return false; }
		else if (L.cat === 'mine' ? !it.mine : it.cat !== L.cat || it.mine) return false;
		if (L.cat === 'mine' && !words.length) return true;
		if (it.cat === 'features') return !L.group || it.group === L.group || words.length > 0;
		if (L.native && !it.native) return false;
		if (L.deer && !it.deer) return false;
		if (L.ev && !it.ev) return false;
		if (L.sun && !it.sun.includes(L.sun)) return false;
		if (L.season && !it.bloomSeasons.includes(L.season)) return false;
		if (L.color && !it.colorFamilies.has(L.color)) return false;
		if (!sizeOk(it, L.size)) return false;
		return true;
	});
	const by = { name: (a, b) => a.name.localeCompare(b.name), tall: (a, b) => b.h - a.h, short: (a, b) => a.h - b.h, fast: (a, b) => (b.inYr || b.h / (b.yrs || 1) * 12) - (a.inYr || a.h / (a.yrs || 1) * 12) }[L.sort];
	if (by && L.sort !== 'name') items = items.slice().sort(by);
	if (words.length && L.sort === 'name') items = items.map((it) => [it, searchScore(it, words)]).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
	if (L.cat === 'mine' && !words.length) items = items.slice().sort((a, b) => (b.created || 0) - (a.created || 0));
	return items;
}
function filterCount(L) { return [L.native, L.deer, L.ev, L.sun, L.season, L.color, L.size].filter(Boolean).length; }

function panelLibrary(el) {
	const L = libState(), ed = app.editor;
	const rerender = () => (ed ? renderPanel() : app.libPage && app.libPage());
	const search = h('input', { type: 'search', placeholder: `Search ${ALL.length} plants & features`, value: L.q, 'aria-label': 'Search library' });
	const mic = voiceButton(search, { onError: toast });
	const snap = h('button', { class: 'ds-btn ds-ghost ds-sm ds-snap', onclick: () => assetMaker() }, icon('camera', 16), ' Create new asset');
	const ident = h('button', { class: 'ds-btn ds-ghost ds-sm ds-snap', onclick: () => plantId() }, '🌿', ' Plant ID');
	const extract = h('button', { class: 'ds-btn ds-ghost ds-sm ds-snap', onclick: () => assetMaker(null, true) }, icon('crop', 16), ' Extract from a photo');
	const chips = h('div', { class: 'ds-chips ds-cats' }, ...CATEGORIES.map((c) => h('button', { class: c.id === L.cat && !L.q ? 'on' : '', 'data-cat': c.id, onclick: () => { L.cat = c.id; L.q = ''; L.group = ''; rerender(); } }, c.name)));
	const count = h('p', { class: 'ds-count', 'aria-live': 'polite' });
	const grid = h('div', { class: 'ds-lib' });
	const hint = h('div');
	const showHint = () => {
		hint.innerHTML = '';
		if (ed && ed.placeItem) hint.append(h('p', { class: 'ds-hint' }, `Placing: ${ed.placeItem.name} — tap the photo.`, h('button', { class: 'ds-link', onclick: () => { ed.setTool('select'); ed.placeItem = null; showHint(); markOn(); } }, 'Cancel')));
	};
	const markOn = () => grid.querySelectorAll('.ds-lib-item').forEach((b) => b.classList.toggle('on', !!(ed && ed.placeItem) && b.dataset.id === ed.placeItem.id));
	const toggles = h('div', { class: 'ds-chips ds-filters' });
	const extra = h('div', { class: 'ds-filter-more' });
	const isFeat = () => !L.q && L.cat === 'features';
	const isMine = () => !L.q && L.cat === 'mine';
	const buildFilters = () => {
		toggles.innerHTML = ''; extra.innerHTML = '';
		if (isMine()) return;
		if (isFeat()) {
			const groups = [...new Set(ALL.filter((i) => i.cat === 'features').map((i) => i.group))];
			toggles.append(...['', ...groups].map((g) => h('button', { class: L.group === g ? 'on' : '', onclick: () => { L.group = g; buildFilters(); fill(); } }, g || 'All')));
			return;
		}
		const tog = (k, label, tip) => h('button', { class: L[k] ? 'on' : '', title: tip, 'aria-pressed': L[k] ? 'true' : 'false', onclick: () => { L[k] = !L[k]; buildFilters(); fill(); } }, label);
		const n = filterCount(L);
		toggles.append(tog('native', 'Native', 'Native to the eastern U.S.'), tog('deer', 'Deer resistant', 'Rarely browsed by deer'), tog('ev', 'Evergreen', 'Keeps its leaves in winter'),
			h('button', { class: 'ds-more' + (L.more ? ' on' : ''), 'aria-expanded': L.more ? 'true' : 'false', onclick: () => { L.more = !L.more; buildFilters(); } }, L.more ? 'Fewer filters ▴' : `More filters${n > (L.native + L.deer + L.ev) ? ' •' : ''} ▾`));
		if (!L.more) return;
		const sel = (k, opts, label) => h('label', { class: 'ds-select' }, h('span', null, label), h('select', { 'aria-label': label, onchange: (e) => { L[k] = e.target.value; fill(); } }, ...Object.entries(opts).map(([v, t]) => h('option', { value: v, selected: L[k] === v }, t))));
		extra.append(
			h('div', { class: 'ds-sel-row' },
				sel('sun', { '': 'Any light', F: 'Full sun', P: 'Part shade', S: 'Shade' }, 'Light'),
				sel('season', { '': 'Any time', spring: 'Spring', summer: 'Summer', fall: 'Fall', winter: 'Winter' }, 'Blooms'),
				sel('size', SIZES, 'Mature height'),
				sel('sort', { name: 'A–Z', tall: 'Tallest', short: 'Shortest', fast: 'Fastest growing' }, 'Sort')),
			h('div', { class: 'ds-colors', role: 'group', 'aria-label': 'Flower color' }, h('span', null, 'Flower color'),
				...Object.entries(COLOR_SWATCH).map(([k, c]) => h('button', { class: 'ds-dot' + (L.color === k ? ' on' : ''), title: k, 'aria-label': k + ' flowers', style: `background:${c}`, onclick: () => { L.color = L.color === k ? '' : k; buildFilters(); fill(); } }))),
			n ? h('button', { class: 'ds-link', onclick: () => { Object.assign(L, { native: false, deer: false, ev: false, sun: '', season: '', color: '', size: '' }); buildFilters(); fill(); } }, 'Clear all filters') : null);
	};
	const card = (it) => {
		const sub = it.mine ? (it.base ? `Grows like ${byId[it.base] ? byId[it.base].name : 'its plant'}` : `${fmtFt(it.h)} tall · My photo`) : it.cat === 'features' ? `${fmtFt(it.h)} tall · ${it.group}` : `${fmtFt(it.h)} × ${fmtFt(it.w)}${it.inYr ? ` · ${it.inYr}″/yr` : ''}`;
		const b = h('button', { class: 'ds-lib-item', 'data-id': it.id, title: it.name, onclick: () => {
			if (!ed) { if (it.mine) assetMaker(it.rec); else if (it.cat !== 'features') plantFacts(it); else toast(`${it.name} — ${fmtFt(it.h)} tall. Open a Dreamscape to place it.`); return; }
			ed.startPlacing(it); showHint(); markOn();
			toast(`Tap the photo to place ${it.name}.${matchMedia('(pointer: fine)').matches ? ' Hold Shift to place several.' : ''}`, 3000);
		} },
			lazyThumb(it),
			h('b', null, it.name),
			it.sci ? h('i', null, it.sci) : null,
			h('small', null, sub),
			it.cat !== 'features' ? h('span', { class: 'ds-tags' }, it.native ? h('em', { class: 'ds-tag-n', title: 'Native' }, 'Native') : null, it.ev ? h('em', { title: 'Evergreen' }, 'Evergreen') : null, it.deer ? h('em', { title: 'Deer resistant' }, 'Deer-resistant') : null) : null);
		const info = h('span', { class: 'ds-info', role: 'button', tabindex: 0, 'aria-label': `About ${it.name}`, title: 'Plant facts', onclick: (e) => { e.stopPropagation(); plantFacts(it); }, onkeydown: (e) => { if (e.key === 'Enter') { e.stopPropagation(); e.preventDefault(); plantFacts(it); } } }, 'i');
		if (it.mine) {
			b.classList.add('ds-mine');
			b.append(h('span', { class: 'ds-info ds-edit', role: 'button', tabindex: 0, 'aria-label': `Edit ${it.name}`, title: 'Edit or delete', onclick: (e) => { e.stopPropagation(); assetMaker(it.rec); }, onkeydown: (e) => { if (e.key === 'Enter') { e.stopPropagation(); e.preventDefault(); assetMaker(it.rec); } } }, icon('edit', 12)));
		} else if (it.cat !== 'features') b.append(info);
		return b;
	};
	let shown = 0, items = [];
	const PAGE = 60;
	const more = h('button', { class: 'ds-btn ds-ghost ds-wide ds-showmore', onclick: () => page() });
	const page = () => {
		const frag = document.createDocumentFragment();
		for (const it of items.slice(shown, shown + PAGE)) frag.append(card(it));
		shown = Math.min(items.length, shown + PAGE);
		grid.append(frag);
		markOn();
		more.hidden = shown >= items.length;
		more.textContent = `Show ${Math.min(PAGE, items.length - shown)} more`;
	};
	const fill = () => {
		items = libItems(L);
		grid.innerHTML = ''; shown = 0;
		const what = L.q ? 'results' : CATEGORIES.find((c) => c.id === L.cat).name.toLowerCase();
		count.textContent = `${items.length} ${items.length === 1 ? 'match' : what}`;
		if (isMine() && !items.length) grid.append(h('div', { class: 'ds-empty ds-span' }, icon('camera', 30), h('b', null, 'Your own photo library'), h('p', { class: 'ds-muted' }, 'Spot a plant, planter or bench you love? Snap it and we\u2019ll cut it out so you can use it in any design.'), h('button', { class: 'ds-btn', onclick: () => assetMaker() }, icon('camera', 18), ' Add from a photo')));
		else if (!items.length) grid.append(h('p', { class: 'ds-muted ds-span' }, 'No matches. Try fewer filters or a different word, like “red”, “shade” or “native”.'));
		page();
	};
	const go = debounce(() => {
		chips.querySelectorAll('button').forEach((b) => b.classList.toggle('on', !L.q && b.dataset.cat === L.cat));
		buildFilters(); fill();
	}, 120);
	search.addEventListener('input', () => { L.q = search.value; go(); });
	showHint(); buildFilters();
	add(el, sect('Design library', h('div', { class: 'ds-search' }, search, mic), chips, toggles, extra, hint, h('div', { class: 'ds-snap-row' }, snap, extract, ident), h('small', { class: 'ds-muted ds-pad-x' }, 'Create an asset from a new photo, pull one out of a photo you have, or identify a plant')), h('div', { class: 'ds-pad-x' }, count), grid, h('div', { class: 'ds-pad-x' }, more));
	fill();
}

/* Full fact sheet for one plant, with a growth chart and season previews. */
function plantFacts(it) {
	const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
	const row = (k, v) => (v ? h('div', null, h('dt', null, k), h('dd', null, v)) : null);
	const seasons = h('div', { class: 'ds-facts-seasons' }, ...['spring', 'summer', 'fall', 'winter'].map((s) => h('figure', null, h('img', { src: thumb(it, 120, s).toDataURL(), alt: `${it.name} in ${s}` }), h('figcaption', null, s[0].toUpperCase() + s.slice(1)))));
	const chart = canvas(560, 200); chart.className = 'ds-chart';
	const mat = it.annual ? 'one season' : `about ${it.yrs} ${it.cat === 'trees' || it.cat === 'evergreens' || it.cat === 'shrubs' ? 'years' : it.yrs > 1 ? 'seasons' : 'season'}`;
	const m = modal(app.root, it.name, [
		h('p', { class: 'ds-facts-sci' }, h('i', null, it.sci), it.native ? h('em', { class: 'ds-tag-n' }, 'Native') : null),
		seasons,
		h('dl', { class: 'ds-facts' },
			row('Mature size', `${fmtFt(it.h)} tall × ${fmtFt(it.w)} wide`),
			row('Growth', growthLabel(it)),
			row('Time to mature size', mat),
			row('Flowers', bloomLabel(it)),
			row('Fall color', it.fallName ? it.fallName[0].toUpperCase() + it.fallName.slice(1) : ''),
			row('Berries / fruit', it.berryName ? it.berryName[0].toUpperCase() + it.berryName.slice(1) : ''),
			row('Light', sunLabel(it.sun)),
			row('Hardiness zones', it.zones ? 'USDA ' + it.zones : ''),
			row('Foliage', `${it.ev ? 'Evergreen' : it.annual ? 'Annual' : 'Deciduous / dies back'}${it.leafName && it.leafName !== 'green' ? ' · ' + it.leafName + ' leaves' : ''}`),
			row('Deer', it.deer ? 'Resistant' : 'May be browsed')),
		it.note ? h('p', { class: 'ds-facts-note' }, it.note) : null,
		h('h4', { class: 'ds-facts-h' }, 'Growth from planting'), chart,
		h('button', { class: 'ds-btn ds-wide', onclick: () => { m.remove(); if (app.tool !== 'plants') setTool('plants'); app.editor.startPlacing(it); renderPanel(); toast(`Tap the photo to place ${it.name}.`, 3000); } }, icon('plant', 18), ' Place in my yard')
	].filter(Boolean), close, 'ds-modal-facts');
	drawChart(chart, it, { age: it.plant || 0 }, 0);
}

function swatches(cur, on) {
	const L = app.matLib || (app.matLib = { q: '', group: '' });
	const search = h('input', { type: 'search', placeholder: `Search ${MATERIALS.length} materials`, value: L.q, 'aria-label': 'Search materials' });
	const mic = voiceButton(search, { onError: toast, label: 'Search materials by voice' });
	const chips = h('div', { class: 'ds-chips ds-filters' }, ...['', ...MATERIAL_GROUPS].map((g) => h('button', { class: L.group === g ? 'on' : '', onclick: (e) => { L.group = g; chips.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.currentTarget)); fill(); } }, g || 'All')));
	const grid = h('div', { class: 'ds-swatches' });
	const fill = () => {
		const words = L.q.toLowerCase().split(/\s+/).filter(Boolean);
		const list = MATERIALS.filter((m) => (!L.group || m.group === L.group) && matchesWords(m._s || (m._s = { search: (m.name + ' ' + m.group + ' ' + m.id.replace(/-/g, ' ') + ' ' + (m.tags || '') + (m.real ? ' real photo scan' : '')).toLowerCase() }), words));
		grid.innerHTML = '';
		if (!list.length) grid.append(h('p', { class: 'ds-muted ds-span' }, 'No materials match.'));
		for (const m of list) {
			const b = h('button', { class: 'ds-swatch' + (m.id === cur ? ' on' : ''), title: m.name, onclick: () => { grid.querySelectorAll('.ds-swatch').forEach((x) => x.classList.remove('on')); b.classList.add('on'); cur = m.id; on(m.id); } },
				m.photo ? h('img', { src: m.photo.src, alt: '', loading: 'lazy', width: 52, height: 52, class: 'ds-swatch-img', style: `background:rgb(${m.photo.avg.join(',')})` }) : lazySwatch(m.id, 52), h('small', null, m.name));
			grid.append(b);
		}
	};
	search.addEventListener('input', debounce(() => { L.q = search.value; fill(); }, 120));
	fill();
	return h('div', { class: 'ds-matlib' }, h('div', { class: 'ds-search' }, search, mic), chips, grid);
}

function panelPaint(el) {
	const o = app.editor.opts.paint;
	const mode = o.restore ? 'restore' : o.erase ? 'erase' : 'paint';
	el.append(
		sect('Brush', h('p', { class: 'ds-muted' }, 'Brush mulch, stone, lawn or pavers right onto the ground. Textures shrink into the distance and pick up real shadows from your photo.')),
		sect(null, seg([['paint', 'Paint'], ['erase', 'Erase paint'], ['restore', 'Restore photo']], mode, (k) => { o.erase = k === 'erase'; o.restore = k === 'restore'; renderPanel(); })),
		o.restore ? h('p', { class: 'ds-hint ds-pad-x' }, 'Brush over any spot to bring back the original photo there — undoes erasing and AI changes just in that spot.') : null,
		sect(null, slider('Brush size', 6, 260, 2, o.size, (v) => v + ' px', (v) => { o.size = v; }),
			h('div', { class: 'ds-row ds-wrap' }, h('button', { class: 'ds-btn ds-ghost ds-sm', 'aria-label': 'Smaller brush', onclick: () => { o.size = Math.max(6, Math.round(o.size / 1.25)); renderPanel(); } }, icon('minus', 16), ' Smaller'), h('button', { class: 'ds-btn ds-ghost ds-sm', 'aria-label': 'Bigger brush', onclick: () => { o.size = Math.min(260, Math.round(o.size * 1.25)); renderPanel(); } }, icon('plus', 16), ' Bigger')),
			seg([['0', 'Hard edge'], ['6', 'Soft edge']], (o.soft || 0) > 0 ? '6' : '0', (k) => { o.soft = +k; renderPanel(); }),
			o.soft ? slider('Softness', 1, 24, 1, o.soft, (v) => v + ' px', (v) => { o.soft = v; }) : null,
			o.restore ? null : slider('Opacity', 10, 100, 1, Math.round((o.alpha == null ? 1 : o.alpha) * 100), (v) => v + '%', (v) => { o.alpha = v / 100; })),
		o.restore ? null :
		sect('Material', swatches(o.mat, (id) => { o.mat = id; o.erase = false; o.restore = false; const bs = el.querySelectorAll('.ds-seg button'); bs.forEach((b, i) => { b.classList.toggle('on', i === 0); b.setAttribute('aria-pressed', i === 0 ? 'true' : 'false'); }); })));
}

function panelBed(el) {
	const o = app.editor.opts.bed, ed = app.editor;
	const n = ed.bedPts.length;
	add(el,
		sect('Draw a garden bed', h('p', { class: 'ds-muted' }, 'Tap around the shape of a new bed or patio. The outline curves smoothly. Tap the first point (or double-tap) to finish.')),
		n ? sect(null, h('div', { class: 'ds-row' },
			h('button', { class: 'ds-btn', disabled: n < 3, onclick: () => ed.finishBed() }, icon('check', 18), ' Finish bed'),
			h('button', { class: 'ds-btn ds-ghost', onclick: () => ed.cancelBed() }, 'Cancel')), h('p', { class: 'ds-hint' }, `${n} point${n > 1 ? 's' : ''} placed`)) : null,
		sect('Edging', seg([['none', 'None'], ['steel', 'Steel'], ['stone', 'Stone'], ['brick', 'Brick']], o.edging, (k) => { o.edging = k; })),
		sect('Fill with', swatches(o.mat, (id) => { o.mat = id; })));
}

function panelEraser(el) {
	const o = app.editor.opts.eraser, ed = app.editor, ui = app.ui;
	ui.eraseBtn = h('button', { class: 'ds-btn ds-wide', disabled: !ed.selMask, onclick: () => { const ok = ed.eraseSelection(); if (ok) toast('Erased! Not perfect? Undo, adjust the selection and try again.'); } }, icon('wand', 18), ' Erase selection');
	ui.eraseInfo = h('p', { class: 'ds-hint' }, ed.selMask ? 'Selection ready' : 'Nothing selected yet');
	el.append(
		sect('Magic eraser', h('p', { class: 'ds-muted' }, 'Tap something in the photo you want gone: an old shrub, a stump, weeds, a hose. Shift-tap to add more. Then press Erase.')),
		sect('Select by', seg([['region', 'This area'], ['similar', 'All similar']], o.mode, (k) => { o.mode = k; renderPanel(); })),
		h('p', { class: 'ds-hint ds-pad-x' }, o.mode === 'similar' ? '“All similar” finds every spot in the photo matching the color, shape and size of what you tap. Great for weeds and dandelions.' : '“This area” grows out from where you tap through similar colors.'),
		sect(null,
			slider('Color match', 4, 80, 1, o.tol, (v) => (v < 20 ? 'Strict ' : v < 45 ? 'Medium ' : 'Loose ') + v, (v) => { o.tol = v; }),
			slider('Expand edges', 0, 12, 1, o.grow, (v) => v + ' px', (v) => { o.grow = v; })),
		sect('Fine-tune with a brush', seg([['', 'Tap select'], ['add', 'Brush add'], ['sub', 'Brush remove']], o.brush || '', (k) => { o.brush = k || null; ed._drawOverlay(); }),
			slider('Brush size', 6, 160, 2, o.size, (v) => v + ' px', (v) => { o.size = v; })),
		sect(null, ui.eraseBtn, ui.eraseInfo, h('button', { class: 'ds-btn ds-ghost ds-wide', onclick: () => ed.clearSelection() }, 'Clear selection')),
		sect('Mask', h('p', { class: 'ds-hint' }, 'Shape the selection before you erase or fill it.'),
			h('div', { class: 'ds-grid2' },
				h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => ed.invertSelection() }, '⇄ Invert'),
				h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => ed.growSelection(4) }, '＋ Expand'),
				h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => ed.growSelection(-4) }, '－ Contract'),
				h('button', { class: 'ds-btn ds-ghost ds-sm', disabled: !(session.ai && session.ai.segment), title: 'Use AI Smart Select in the AI tools', onclick: () => setTool('ai') }, '✨ Auto (AI)'))),
		sect('Smart fill', h('p', { class: 'ds-hint' }, 'Fill the selection with a material — replace lawn, mulch, stone or pavement in one tap.'),
			slider('Feather edge', 0, 16, 1, o.feather || 2, (v) => v + ' px', (v) => { o.feather = v; }),
			swatches(null, (id) => { if (ed.fillSelection(id, o.feather == null ? 2 : o.feather)) toast('Filled! Undo anytime.'); else toast('Select an area first.'); })));
}

function panelScale(el) {
	const ed = app.editor, v = ed.view;
	if (v.kind === 'aerial') {
		el.append(sect('Map scale', h('p', { class: 'ds-muted' }, 'Bird\'s-eye views are already measured, so plants appear at their real spread. Adjust only if something looks off.'),
			slider('Pixels per foot', 1, 40, 0.1, +v.ppf.toFixed(1), (x) => x.toFixed(1), (x) => { v.ppf = x; ed.rebuildGround(); ed.render(); saveSoon(); })),
		sect(null, h('label', { class: 'ds-check' }, h('input', { type: 'checkbox', checked: ed.opts.scale.person, onchange: (e) => { ed.opts.scale.person = e.target.checked; ed._drawOverlay(); } }), ' Show a person for scale')));
		return;
	}
	el.append(
		sect('Scale & perspective', h('p', { class: 'ds-muted' }, 'Drag the blue line to eye level: the height of the camera when the photo was taken. Tip: it\'s where the house\'s horizontal lines stop slanting.'),
			h('p', { class: 'ds-muted' }, 'Then drag the yellow 6-ft person around. If they look right next to your door or fence, every plant is to scale.')),
		sect(null,
			slider('Camera height', 2, 20, 0.5, v.cam.camH, (x) => x + ' ft', (x) => { v.cam.camH = x; ed.rebuildGround(); ed.render(); ed._drawOverlay(); saveSoon(); }),
			h('label', { class: 'ds-check' }, h('input', { type: 'checkbox', checked: ed.opts.scale.person, onchange: (e) => { ed.opts.scale.person = e.target.checked; ed._drawOverlay(); } }), ' Show 6-ft person')),
		sect(null, h('button', { class: 'ds-btn ds-wide', onclick: () => { app.project.guide = app.project.guide || {}; app.project.guide.scaled = true; saveSoon(); setTool('plants'); } }, 'Looks good — add plants →')));
}

function panelPan(el) {
	el.append(sect('Pan & zoom', h('p', { class: 'ds-muted' }, 'Drag to move around. Use the + and − buttons or pinch to zoom. You can also hold Space while using any tool.')));
}

/* --------------------------------------------------------------- inspector */

function inspector(o) {
	const ui = app.ui, ed = app.editor;
	const item = byId[o.item];
	const isPlant = item.cat !== 'features';
	const info = h('div', { class: 'ds-sizes' });
	const chart = canvas(560, 200);
	chart.className = 'ds-chart';
	ui.inspector = { obj: o, info, chart };
	const head = h('div', { class: 'ds-insp-head' }, h('img', { src: thumbFor(item), alt: '' }), h('div', null, h('h4', null, item.name), item.sci ? h('i', { class: 'ds-insp-sci' }, item.sci) : null, h('small', null, CATEGORIES.find((c) => c.id === item.cat).name + (item.group ? ' · ' + item.group : ''))));
	const box = [sect(null, head, info)];
	if (isPlant) {
		box.push(sect('Growth over time', chart, h('p', { class: 'ds-hint' }, 'Use the Time slider below the picture to watch everything grow.')));
		box.push(sect(null, slider('Age when planted', 0, maxAge(item), 1, o.age || 0, (v) => (v === 0 ? 'Seedling' : v + (v === 1 ? ' yr' : ' yrs')), (v) => { ed.updateSelected({ age: v }); updateInspector(); })));
	}
	box.push(...objectControls(o, edCtx()));
	box.push(sect(null, h('div', { class: 'ds-actions' },
		h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => addToBoard({ kind: 'plant', ref: item.id, name: item.name, thumb: thumbFor(item) }).then(() => toast('Saved to your Inspiration Board.')) }, '♡ Save to board'),
		h('button', { class: 'ds-btn ds-danger ds-sm', onclick: () => ed.deleteSelected() }, icon('trash', 16), ' Remove'))));
	box.push(sect(null, h('button', { class: 'ds-link', onclick: () => { ed.select(null); } }, '← Done')));
	ui.panel.append(...box);
	updateInspector();
}

function updateInspector() {
	const I = app.ui.inspector;
	if (!I) return;
	const o = I.obj, item = byId[o.item], p = app.project;
	const yrs = p.years || 0;
	if (item.cat === 'features') {
		I.info.innerHTML = '';
		I.info.append(h('div', { class: 'ds-size-now' }, h('b', null, `${fmtFt(item.h * (o.scale || 1))} tall`), h('small', null, `${fmtFt(item.w * (o.scale || 1))} wide`)));
		return;
	}
	const now = sizeAt(item, (o.age || 0) + yrs);
	const sc = o.scale || 1;
	I.info.innerHTML = '';
	I.info.append(
		h('div', { class: 'ds-size-now' }, h('small', null, yrs ? `In ${yrs} year${yrs > 1 ? 's' : ''}` : 'Today'), h('b', null, `${fmtFt(now.h * sc)} tall × ${fmtFt(now.w * sc)} wide`)),
		h('div', { class: 'ds-size-mature' }, h('small', null, 'Fully grown'), h('b', null, `${fmtFt(item.h)} × ${fmtFt(item.w)}`), h('small', null, item.annual ? 'by midsummer' : `in about ${item.yrs} ${['trees', 'evergreens', 'shrubs'].includes(item.cat) ? 'years' : item.yrs > 1 ? 'seasons' : 'season'}`)),
		h('dl', { class: 'ds-facts ds-facts-mini ds-span2' },
			...[['Growth', growthLabel(item)], ['Flowers', bloomLabel(item)], ['Light', sunLabel(item.sun)], ['Zones', item.zones && 'USDA ' + item.zones], ['Good to know', [item.native && 'Native', item.ev && 'Evergreen', item.deer && 'Deer resistant'].filter(Boolean).join(' · ')]].filter((r) => r[1]).map(([k, v]) => h('div', null, h('dt', null, k), h('dd', null, v)))),
		h('button', { class: 'ds-link ds-span2', onclick: () => plantFacts(item) }, 'All plant facts →'));
	drawChart(I.chart, item, o, yrs);
}

function drawChart(c, item, o, yrs) {
	const x = c.getContext('2d'), W = c.width, H = c.height;
	const pad = { l: 60, r: 34, t: 18, b: 36 };
	const woody = ['trees', 'evergreens', 'shrubs'].includes(item.cat);
	const span = woody ? Math.max(10, Math.round((item.yrs * 1.4) / 5) * 5) : item.annual ? 1 : Math.max(5, Math.ceil(item.yrs * 2));
	const maxH = Math.max(item.h, item.w) * 1.08;
	const X = (a) => pad.l + (a / span) * (W - pad.l - pad.r);
	const Y = (v) => H - pad.b - (v / maxH) * (H - pad.t - pad.b);
	x.clearRect(0, 0, W, H);
	x.font = '600 18px system-ui, sans-serif';
	x.fillStyle = 'rgba(200,225,205,.7)';
	x.strokeStyle = 'rgba(255,255,255,.08)';
	x.lineWidth = 1;
	for (let i = 0; i <= 4; i++) {
		const v = (maxH / 4) * i;
		x.beginPath(); x.moveTo(pad.l, Y(v)); x.lineTo(W - pad.r, Y(v)); x.stroke();
		x.textAlign = 'right'; x.fillText(i ? fmtFt(v) : '0', pad.l - 8, Y(v) + 6);
	}
	x.textAlign = 'center';
	const unit = woody ? ' yr' : item.annual ? '' : ' ssn';
	for (let a = 0; a <= span + 1e-6; a += span / 5) x.fillText(a === 0 ? (woody ? 'Seed' : 'Plant') : item.annual ? ['', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'][Math.round(a * 5)] : (Number.isInteger(a) ? a : a.toFixed(1)) + unit, X(a), H - 10);
	// width (lighter) and height curves
	const curve = (key, col, lw) => {
		x.beginPath();
		for (let a = 0; a <= span; a += span / 80) { const s = sizeAt(item, a)[key]; a === 0 ? x.moveTo(X(a), Y(s)) : x.lineTo(X(a), Y(s)); }
		x.strokeStyle = col; x.lineWidth = lw; x.stroke();
	};
	curve('w', 'rgba(244,201,93,.65)', 3);
	curve('h', '#7be0a0', 4);
	// planting age → now
	const a0 = o.age || 0, a1 = a0 + yrs;
	x.fillStyle = 'rgba(123,224,160,.12)';
	x.fillRect(X(Math.min(a0, span)), pad.t, X(Math.min(a1, span)) - X(Math.min(a0, span)), H - pad.t - pad.b);
	const dot = (a, col, r) => { const s = sizeAt(item, a).h; x.fillStyle = col; x.beginPath(); x.arc(X(Math.min(a, span)), Y(s), r, 0, 7); x.fill(); };
	dot(a0, '#ffffff', 6);
	dot(a1, '#7be0a0', 9);
	x.fillStyle = '#e8f5ea'; x.textAlign = 'left';
	x.fillText('Height', pad.l + 8, pad.t + 14);
	x.fillStyle = 'rgba(244,201,93,.9)'; x.fillText('Width', pad.l + 86, pad.t + 14);
}

/* ------------------------------------------------------------- persistence */

function cleanProject() {
	return JSON.parse(JSON.stringify(app.project, (k, v) => (k[0] === '_' ? undefined : v)));
}

let imageDirty = false;
const saveNow = async () => {
	if (!app || !app.project) return;
	const p = app.project, ed = app.editor;
	try {
		if (imageDirty && ed && ed.view) {
			imageDirty = false;
			const blob = await canvasToBlob(ed.baseCanvas(), 'image/jpeg', 0.94);
			const v = ed.view;
			v.edited = await store.putBlob(blob, v.edited || undefined);
		}
		if (ed && ed.view && p.views.indexOf(ed.view) === p.active) {
			const t = ed.composite(420);
			p.thumb = t.toDataURL('image/jpeg', 0.72);
		}
		const saved = await store.putProject(cleanProject());
		pushSoon('design', saved);
		setStatus('Saved');
	} catch (e) {
		setStatus('Not saved');
		toast('Couldn\'t save on this device. Storage may be full or blocked.');
	}
};
const saveDebounced = debounce(saveNow, 900);
function saveSoon(kind) {
	if (app && app.ui && app.ui.guide) app.ui.guide.update();
	if (kind === 'image') imageDirty = true;
	setStatus('Saving…');
	saveDebounced();
}
function flushSave() { if (app && app.project) saveDebounced.flush(); }
function setStatus(t) {
	if (!app || !app.ui || !app.ui.status) return;
	app.ui.status.textContent = t;
	app.ui.status.classList.toggle('busy', t !== 'Saved');
}

/* ----------------------------------------------------------- export/share */

function finalImage(maxW = 0) {
	const ed = app.editor;
	const pic = ed.composite(maxW);
	const bar = Math.round(Math.max(34, pic.width * 0.035));
	const c = canvas(pic.width, pic.height + bar);
	const x = c.getContext('2d');
	x.drawImage(pic, 0, 0);
	x.fillStyle = '#12211a'; x.fillRect(0, pic.height, c.width, bar);
	x.font = `600 ${Math.round(bar * 0.42)}px system-ui, sans-serif`;
	x.fillStyle = '#e8f5ea'; x.textBaseline = 'middle';
	x.fillText(`${app.project.name} · ${ed.view.label}`, bar * 0.4, pic.height + bar / 2);
	x.textAlign = 'right'; x.fillStyle = '#7be0a0';
	x.fillText(`DreamScaper by ${CFG.brand}${CFG.site ? ' · ' + CFG.site : ''}`, c.width - bar * 0.4, pic.height + bar / 2);
	return c;
}

async function download() {
	const c = finalImage();
	const blob = await canvasToBlob(c, 'image/jpeg', 0.92);
	const a = h('a', { href: URL.createObjectURL(blob), download: `${app.project.name.replace(/[^\w\- ]+/g, '').trim() || 'dreamscape'} - ${app.editor.view.label}.jpg` });
	document.body.append(a); a.click(); a.remove();
	setTimeout(() => URL.revokeObjectURL(a.href), 4000);
	toast('Image saved to your downloads.');
}

function share(img0, before0) {
	const img = img0 || finalImage(1400);
	const f = (n, t, ac, req = true) => h('input', { name: n, type: t, autocomplete: ac, required: req, placeholder: '' });
	const name = f('name', 'text', 'name'), email = f('email', 'email', 'email'), phone = f('phone', 'tel', 'tel'), town = f('town', 'text', 'address-level2', false);
	const u = session.user;
	if (u) { name.value = u.name || ''; email.value = /invalid$/.test(u.email) ? '' : u.email; phone.value = u.phone || ''; town.value = u.town || ''; }
	const msg = h('textarea', { rows: 3, placeholder: 'Anything you\'d like us to know? (optional)' });
	const hp = h('input', { type: 'text', tabindex: -1, autocomplete: 'off', class: 'ds-hp', 'aria-hidden': 'true' });
	const status = h('p', { class: 'ds-hint' });
	const send = h('button', { class: 'ds-btn ds-wide' }, icon('send', 18), ' Send my design');
	const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
	const m = modal(app.root, `Send your design to ${CFG.brand}`, [
		h('img', { class: 'ds-share-preview', src: img.toDataURL('image/jpeg', 0.8), alt: 'Your design' }),
		h('p', { class: 'ds-muted' }, 'Love it? Send it over and we\'ll reach out with ideas and a quote to make it real. No obligation.'),
		h('div', { class: 'ds-form' },
			h('label', null, 'Name', name), h('label', null, 'Email', email), h('label', null, 'Phone', phone), h('label', null, 'Town', town)),
		msg, hp, send, status
	], close);
	send.onclick = async () => {
		if (!name.value.trim() || !/\S+@\S+\.\S+/.test(email.value) || phone.value.replace(/\D/g, '').length < 10) { status.textContent = 'Please add your name, email and a 10-digit phone number.'; return; }
		send.disabled = true; status.textContent = 'Sending…';
		try {
			const r = await fetch(CFG.api + 'share', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
				name: name.value, email: email.value, phone: phone.value, town: town.value, message: msg.value, hp: hp.value,
				project: app.project ? app.project.name : 'Dreamscape AI', view: app.editor ? app.editor.view.label : 'AI design', image: img.toDataURL('image/jpeg', 0.85),
				plants: app.project ? summarize() : ''
			}) });
			const j = await r.json();
			if (!r.ok) throw new Error(j.message || 'Could not send.');
			m.remove();
			toast('Sent! We\'ll be in touch soon.', 5000);
		} catch (e) { status.textContent = e.message; send.disabled = false; }
	};
}

function summarize() {
	const counts = {};
	for (const v of app.project.views) for (const o of v.objects) counts[o.item] = (counts[o.item] || 0) + 1;
	const mats = new Set();
	for (const v of app.project.views) for (const op of v.ops) if (!op.erase) mats.add(MATERIALS.find((m) => m.id === op.mat)?.name);
	return Object.entries(counts).map(([id, n]) => `${n} × ${byId[id].name}`).concat([...mats].filter(Boolean).map((m) => `Ground: ${m}`)).join('\n');
}


/* ============================================================ accounts/cloud */

let syncing = false;
const busyOverlay = () => !!(app && app.root.querySelector('.ds-studio, .ds-backdrop, .ds-am'));
async function syncAfterSignIn(quiet) {
	if (syncing || !session.user) return;
	syncing = true;
	try {
		const n = await pushAll();
		const added = await pullAssets();
		for (const r of added) await registerAsset(r);
		if (!quiet && n) toast(`Saving ${n} Dreamscape${n > 1 ? 's' : ''} from this device to your account…`);
		// refresh Home only if Home is what's showing (never pull someone out of the Hub, Messages, etc.)
		if (app && !app.project && !busyOverlay() && app.root.querySelector('.ds-home2')) home();
	} catch (e) { console.warn(e); }
	syncing = false;
}

/* ============================================================ Dreamscape AI */

/* ================================================== Plant ID & How it works */

function pidButton() {
	return h('button', { class: 'ds-pid-btn', onclick: plantId, title: 'Plant ID — identify any plant from a photo, any time' }, '🌿', h('span', null, ' Plant ID'));
}
function helpButton(topic) {
	return h('button', { class: 'ds-icon-btn ds-help', onclick: () => guide(topic || (app.tool === 'ai' ? 'tools' : app.tool === 'plants' ? 'plants' : app.tool === 'paint' || app.tool === 'bed' ? 'ground' : app.tool === 'eraser' ? 'erase' : app.tool === 'scale' ? 'scale' : 'flow')), title: 'How DreamScaper works', 'aria-label': 'How DreamScaper works' }, '?');
}
/** "⋯" menu for less-used actions (keeps the top bar usable on phones). items: [icon, label, fn] */
function moreMenu(items) {
	const wrap = h('div', { class: 'ds-more' });
	const menu = h('div', { class: 'ds-more-menu', hidden: true, role: 'menu' }, ...items.map(([ic, label, fn]) => h('button', { role: 'menuitem', onclick: () => { menu.hidden = true; fn(); } }, icon(ic, 18), ' ', label)));
	const btn = h('button', { class: 'ds-icon-btn', 'aria-label': 'More', 'aria-haspopup': 'true', title: 'More', onclick: (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; } }, icon('menu', 20));
	app.root.addEventListener('pointerdown', (e) => { if (!wrap.contains(e.composedPath()[0])) menu.hidden = true; });
	wrap.append(btn, menu);
	return wrap;
}

/** Tap feedback: a ripple + brief color flash on any button. */
function pressFx(e) {
	const b = e.composedPath().find((n) => n && n.tagName === 'BUTTON');
	if (!b || b.disabled) return;
	const r = b.getBoundingClientRect();
	const d = Math.max(r.width, r.height) * 2;
	const rip = h('span', { class: 'ds-ripple', style: { width: d + 'px', height: d + 'px', left: e.clientX - r.left - d / 2 + 'px', top: e.clientY - r.top - d / 2 + 'px' } });
	if (getComputedStyle(b).position === 'static') b.style.position = 'relative';
	b.classList.add('ds-pressed');
	b.append(rip);
	setTimeout(() => { rip.remove(); b.classList.remove('ds-pressed'); }, 520);
}

function toggleHistory() {
	const ui = app.ui;
	if (ui.hist) { ui.hist.close(); return; }
	const ed = app.editor;
	ui.hist = historyPanel({
		title: 'History', start: 'Original photo',
		steps: () => ed.historyList(),
		current: () => ed.undoStack.length,
		goTo: (n) => ed.goTo(n),
		note: 'Every change you make is listed here. Tap any step to jump back to it — nothing is lost: later steps stay (greyed) until you make a new change.',
		onClose: () => { ui.hist = null; ui.histBtn.classList.remove('on'); }
	});
	ui.histBtn.classList.add('on');
	ui.stageWrap.append(ui.hist.el);
}

function toggleLayers() {
	const ui = app.ui;
	if (ui.layers) { ui.layers.close(); return; }
	if (ui.hist) ui.hist.close();
	ui.layers = layersPanel({ ...edCtx(), onClose: () => { ui.layers = null; ui.layBtn.classList.remove('on'); } });
	ui.layBtn.classList.add('on');
	ui.stageWrap.append(ui.layers.el);
}

/** Context for the 2.6 editor tool panels. */
function edCtx() {
	return {
		ed: app.editor, root: app.root, toast, sect, slider, seg, swatches, byId, thumbFor, store,
		project: () => app.project, renderPanel, setTool, saveSoon: () => saveSoon(),
		refresh: () => renderPanel(),
		defaultMat: (kind) => {
			const g = kind === 'wall' ? ['Natural Stone', 'Pavers'] : kind === 'paver' ? ['Pavers', 'Natural Stone'] : ['Lawn & Groundcover'];
			const re = kind === 'wall' ? /wall|block|fieldstone|ledge/i : kind === 'lawn' ? /lawn|grass|turf/i : /paver|bluestone|brick/i;
			const list = MATERIALS.filter((m) => g.includes(m.group));
			return (list.find((m) => re.test(m.name)) || list[0] || MATERIALS[0]).id;
		},
		peek: peekOriginal,
		originalPhoto: async () => { const v = app.editor.view; const b = await store.getBlob(v.before || v.base); return b ? bgFit(await blobToBitmap(b)) : app.editor.baseCanvas(); },
		addTransformedView,
		restoreVersion: (ver) => restoreVersionInto(edCtx(), ver),
		sceneChanged: () => { syncScenebar(); renderPanel(); },
		download, share: shareDesign
	};
}

let peekImg = null;
async function peekOriginal(on) {
	const ed = app.editor;
	if (!ed) return;
	if (!on) { ed.setPeek(null); return; }
	if (!peekImg || peekImg._v !== ed.view.id) {
		const b = await store.getBlob(ed.view.before || ed.view.base);
		peekImg = b ? await blobToBitmap(b) : null;
		if (peekImg) peekImg._v = ed.view.id;
	}
	ed.setPeek(peekImg);
}

/** A cropped / straightened / perspective-corrected copy of the current view becomes a new view. */
async function addTransformedView(c, nv) {
	const p = app.project;
	const blob = await canvasToBlob(c, 'image/jpeg', 0.94);
	const base = await store.putBlob(blob);
	const v = { ...nv, id: uid(), label: (app.editor.view.label || 'View') + ' · straightened', base, edited: null, before: null, W: c.width, H: c.height, coached: true };
	p.views.push(v);
	await store.putProject(cleanProject());
	loadView(p.views.length - 1, c);
	renderTabs();
}

async function saveDesignToBoard() {
	const pic = app.editor.composite(900);
	await addToBoard({ kind: 'design', name: app.project.name, image: pic, ref: app.project.id });
	toast('Saved to your Inspiration Board.');
}

/** Request a consultation / ask a question — goes to the business with the design attached. */
async function contactUs(kind) {
	const u = session.user || {};
	const name = h('input', { type: 'text', value: u.name || '', autocomplete: 'name' });
	const email = h('input', { type: 'email', value: u.email || '', autocomplete: 'email' });
	const phone = h('input', { type: 'tel', value: u.phone || '', autocomplete: 'tel' });
	const when = h('select', null, ...['Any time', 'Weekday mornings', 'Weekday afternoons', 'Evenings', 'Weekends'].map((x) => h('option', null, x)));
	const how = h('select', null, ...['At my home', 'Phone call', 'Video call'].map((x) => h('option', null, x)));
	const msg = h('textarea', { rows: 4, placeholder: kind === 'consult' ? 'What would you like to talk about? (budget, timing, what matters most)' : 'Your question about this design…' });
	const err = h('p', { class: 'ds-err' });
	const send = h('button', { class: 'ds-btn ds-wide' }, icon('send', 18), kind === 'consult' ? ' Request my consultation' : ' Send my question');
	const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
	const m = modal(app.root, kind === 'consult' ? 'Request a design consultation' : 'Ask a question', [
		h('p', { class: 'ds-hint' }, `${CFG.brand} will see this design (${app.editor.view.label}), its plant list and your message.`),
		h('div', { class: 'ds-form-grid' }, h('label', { class: 'ds-field' }, h('span', null, 'Name'), name), h('label', { class: 'ds-field' }, h('span', null, 'Email'), email), h('label', { class: 'ds-field' }, h('span', null, 'Phone'), phone)),
		kind === 'consult' ? h('div', { class: 'ds-form-grid' }, h('label', { class: 'ds-field' }, h('span', null, 'Best time'), when), h('label', { class: 'ds-field' }, h('span', null, 'Where'), how)) : null,
		h('label', { class: 'ds-field' }, h('span', null, kind === 'consult' ? 'Message' : 'Question'), msg), err, send], close);
	send.onclick = async () => {
		err.textContent = '';
		if (kind === 'question' && msg.value.trim().length < 3) { err.textContent = 'Type your question first.'; return; }
		send.disabled = true;
		try {
			const r = await fetch(CFG.api + 'share', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(session.nonce ? { 'X-WP-Nonce': session.nonce } : {}) }, credentials: 'same-origin', body: JSON.stringify({ kind, name: name.value, email: email.value, phone: phone.value, town: u.town || '', project: app.project.name, view: app.editor.view.label, plants: summarize(), message: (kind === 'consult' ? `Preferred: ${when.value}, ${how.value}\n` : '') + msg.value, image: finalImage(1600).toDataURL('image/jpeg', 0.86) }) });
			const j = await r.json().catch(() => ({}));
			if (!r.ok) throw new Error(j.message || 'Couldn’t send. Please try again.');
			m.remove();
			toast(kind === 'consult' ? 'Request sent! We’ll call you to set a time.' : 'Question sent! We’ll get back to you soon.', 5000);
		} catch (e) { err.textContent = e.message; send.disabled = false; }
	};
}

function guide(topic) { openGuide(app.root, CFG.brand, topic || 'start', tourSettings); }
function tourSettings() {
	openTourSettings(async (k) => {
		if (k === 'home') { if (app.editor || !app.root.querySelector('.ds-home2')) await home(); startTour('home', true); }
		else if (k === 'editor') { if (!app.editor) await startSample(); setTimeout(() => startTour('editor', true), 600); }
		else toast('Open Dreamscape AI, then tap ? → “Show me around”.', 4500);
	});
}
function plantId() {
	openPlantId({
		root: app.root, toast, store,
		capture: (k) => capture(k, app.project || { angles: [] }),
		registerAsset: async (r) => { pushSoon('asset', r); const it = await registerAsset(r); if (app.editor && app.tool === 'plants') renderPanel(); return it; },
		place: app.editor ? (it) => { setTool('plants'); app.editor.startPlacing(it); toast(`Tap the photo to place ${it.name}.`, 3500); } : null,
		facts: (it) => plantFacts(it)
	});
}

function aiBox(onClick) {
	const locked = !session.user;
	return h('button', { class: 'ds-source', onclick: onClick },
		h('span', { class: 'ds-source-ic' }, icon('sparkle', 26)),
		h('b', null, 'Dreamscape AI', locked ? h('span', { class: 'ds-lock-tag' }, icon('lock', 12), ' Sign in') : null),
		h('small', null, 'Let AI redesign this view from your words, ideas or a photo you love'));
}

/** Studio from scratch (it asks for a photo). */
async function startAI() {
	if (!(await requireSignIn('Sign in to use Dreamscape AI — it’s free.'))) return;
	openStudioFor(null, null, {});
}

/** Send the current design (with everything placed) into Dreamscape AI. */
async function sendToAI() {
	if (!app.editor) return startAI();
	if (!(await requireSignIn('Sign in to send your design to Dreamscape AI.'))) return;
	flushSave();
	const p = app.project, ed = app.editor;
	const runs = (p.aiRuns || []).filter((r) => r.view === ed.view.id && r.versions.length);
	const go = (run) => openStudioFor(p, run, { image: run ? null : ed.composite(0), aerial: ed.view.kind === 'aerial', view: ed.view.id });
	if (!runs.length) return go(null);
	const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
	const m = modal(app.root, 'Dreamscape AI', [
		h('button', { class: 'ds-source ds-source-ai', onclick: () => { m.remove(); go(null); } }, h('span', { class: 'ds-source-ic' }, icon('sparkle', 26)), h('b', null, 'Start a new AI design from this view'), h('small', null, 'Uses everything you’ve placed so far')),
		h('p', { class: 'ds-label' }, 'Or continue one of your AI designs'),
		h('div', { class: 'ds-runs' }, ...runs.slice(-6).reverse().map((r) => h('button', { class: 'ds-run', onclick: () => { m.remove(); go(r); } }, h('span', null, icon('sparkle', 16)), h('b', null, `${r.versions.length} version${r.versions.length > 1 ? 's' : ''}`), h('small', null, new Date(r.created).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })))))
	], close);
}

function openStudioFor(project, run, o) {
	let proj = project;
	const ed = app.editor;
	const ctx = {
		root: app.root, toast, store, short: CFG.shortBrand,
		capture: (k) => capture(k, proj || { angles: [] }),
		pickLibrary,
		saveRun: async (r) => {
			if (!proj) {
				// started from the home screen: the photo becomes a new Dreamscape
				const blob = await store.getBlob(r.input);
				const copy = await store.putBlob(blob);
				const v = { id: uid(), label: r.aerial ? 'Bird\'s-eye' : 'View 1', kind: r.aerial ? 'aerial' : 'photo', base: copy, edited: null, W: r.W, H: r.H, ops: [], objects: [], coached: false };
				if (r.aerial) { v.ppf = r.W / (70 * 3.28084); }
				proj = { id: uid(), name: suggestName().replace('My Dream Yard', 'AI Dream Yard'), created: Date.now(), updated: Date.now(), views: [v], active: 0, angles: [], season: 'summer', years: 0, night: false, sun: -1, thumb: null, aiRuns: [] };
				r.view = v.id;
			}
			if (!r.view && o.view) r.view = o.view;
			proj.aiRuns = proj.aiRuns || [];
			const i = proj.aiRuns.findIndex((x) => x.id === r.id);
			if (i >= 0) proj.aiRuns[i] = r; else proj.aiRuns.push(r);
			if (r.versions.length && r.cur >= 0) {
				const b = await store.getBlob(r.versions[r.cur].blob);
				if (b) { const bm = await blobToBitmap(b); const c = canvas(420, 420 * bm.height / bm.width); c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height); proj.thumb = c.toDataURL('image/jpeg', 0.72); }
			}
			if (app.project && app.project.id === proj.id) { app.project.aiRuns = proj.aiRuns; app.project.thumb = proj.thumb || app.project.thumb; saveSoon(); }
			else { const saved = await store.putProject(JSON.parse(JSON.stringify(proj))); pushSoon('design', saved); }
		},
		markup: (blobId, W, H, label, aerial, input) => markupAI(proj, blobId, W, H, label, aerial, input),
		share: (img, before) => shareSheet({ root: app.root, toast, image: img, before, title: (proj && proj.name) || 'My Dreamscape', brand: CFG.brand, site: CFG.site }),
		post: async (img, before) => { if (!(await requireSignIn('Sign in to share with the community — it’s free.'))) return; openComposer({ kind: 'design', ...prepImages(img, before), title: (proj && proj.name) || 'My AI Dreamscape', tags: ['AI design'], ai: true }); },
		print: (img, before, title) => printDesign({ image: img, before, title: (proj && proj.name) || title, brand: CFG.brand, site: CFG.site, customer: session.user ? session.user.name : '' }),
		send: CFG.share ? (img) => share(img) : null,
		plantId, guide,
		onClose: () => { if (!app) return; if (o.toEditor && proj && !app.project) openProject(proj.id); else if (!app.project) home(); }
	};
	openStudio(ctx, { ...o, run, title: (proj && proj.name) || 'My Dreamscape' });
	void ed;
}

/** Put an AI result into the editor as a new view so every tool works on it. */
async function markupAI(proj, blobId, W, H, label, aerial, input) {
	const blob = await store.getBlob(blobId);
	const bm = await blobToBitmap(blob);
	const base = await store.putBlob(blob);
	const p = (app.project && proj && app.project.id === proj.id) ? app.project : await store.getProject(proj.id);
	const src = p.views.find((v) => v.id === (p.aiRuns || []).slice(-1)[0]?.view) || p.views[p.active] || p.views[0];
	const v = { id: uid(), label, kind: aerial ? 'aerial' : 'photo', base, before: input || null, edited: null, W: bm.width, H: bm.height, ops: [], objects: [], coached: true };
	if (src && src.cam && !aerial) v.cam = { ...src.cam, horizon: Math.round(src.cam.horizon * bm.height / src.H), focal: Math.round(src.cam.focal * bm.width / src.W) };
	if (aerial && src && src.ppf) v.ppf = src.ppf * bm.width / src.W;
	p.views.push(v);
	p.active = p.views.length - 1;
	const saved = await store.putProject(JSON.parse(JSON.stringify(p, (k, x) => (k[0] === '_' ? undefined : x))));
	pushSoon('design', saved);
	if (app.project && app.project.id === p.id) { app.project = p; await loadView(p.active, bm); renderTabs(); }
	else await openProject(p.id, bm);
	setTool('plants');
	toast('Your AI design is ready to mark up — add plants, paint, erase, anything!', 5000);
}

/** Choose an inspiration image from the library (incl. My Library). */
function pickLibrary() {
	return new Promise((resolve) => {
		const q = h('input', { type: 'search', placeholder: 'Search plants, features & My Library…', 'aria-label': 'Search library' });
		const mic = voiceButton(q, { onError: toast });
		const grid = h('div', { class: 'ds-lib ds-pick' });
		const fill = () => {
			grid.innerHTML = '';
			const words = q.value.toLowerCase().split(/\s+/).filter(Boolean);
			let items = words.length ? ALL.filter((it) => matchesWords(it, words)).sort((a, b) => searchScore(b, words) - searchScore(a, words)) : [...ALL.filter((x) => x.mine), ...ALL.filter((x) => x.photo && !x.mine)].concat(ALL.filter((x) => !x.photo).slice(0, 40));
			for (const it of items.slice(0, 90)) grid.append(h('button', { class: 'ds-lib-item', onclick: async () => { m.remove(); resolve(await refImage(it)); } }, lazyThumb(it), h('b', null, it.name), it.sci ? h('i', null, it.sci) : null, it.mine ? h('small', null, 'My Library') : null));
		};
		q.addEventListener('input', debounce(fill, 150));
		const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => { m.remove(); resolve(null); } }, icon('close'));
		const m = modal(app.root, 'Pick from the library', [h('div', { class: 'ds-search' }, q, mic), grid], close, 'ds-modal-wide');
		fill();
	});
}
async function refImage(it) {
	if (it.photo && it.photo.blob) { const b = await it.photo.blob(); if (b) return bgWhite(await blobToBitmap(b)); }
	if (it.photo && it.photo.src) { try { const r = await fetch(it.photo.src); return bgWhite(await blobToBitmap(await r.blob())); } catch (e) { /* fall back */ } }
	return bgWhite(thumb(it, 640, it.cat === 'features' ? 'summer' : undefined));
}
function bgWhite(img) {
	const w = img.width, hh = img.height, pad = Math.round(Math.max(w, hh) * 0.06);
	const c = canvas(w + pad * 2, hh + pad * 2), x = c.getContext('2d');
	x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
	x.drawImage(img, pad, pad);
	return c;
}

/* ================================================================ AI tools */

function toolCtx() {
	return {
		ed: app.editor, toast, sect, store, renderPanel, setTool, plantId, buyCredits: (r) => openCredits(r),
		swatches: (cur, on) => swatches(cur, on),
		capture: (k) => capture(k, app.project),
		registerAsset: async (r) => { pushSoon('asset', r); return registerAsset(r); },
		editAsset: (r) => assetMaker(r),
		addView: async (c, label) => {
			const ed = app.editor, src = ed.view;
			const base = await store.putBlob(await canvasToBlob(c, 'image/jpeg', 0.93));
			const v = { id: uid(), label, kind: src.kind, base, edited: null, W: c.width, H: c.height, ops: [], objects: [], coached: true };
			if (src.cam) v.cam = { ...src.cam };
			if (src.ppf) v.ppf = src.ppf;
			app.project.views.push(v);
			await store.putProject(cleanProject());
			await loadView(app.project.views.length - 1, c);
		}
	};
}

/* ============================================================ share / print */

async function originalPhoto() {
	const v = app.editor.view;
	const b = await store.getBlob(v.before || v.base);
	return b ? blobToBitmap(b) : null;
}
function markShared() { if (app.project) { app.project.guide = app.project.guide || {}; app.project.guide.shared = true; saveSoon(); } }
async function shareDesign() {
	markShared();
	const img = finalImage(2000);
	const bm = await originalPhoto();
	const changed = app.editor.view.before || app.editor.view.objects.length || app.editor.view.ops.length || app.editor.view.edited;
	shareSheet({ root: app.root, toast, image: img, before: changed && bm ? bgFit(bm) : null, title: app.project.name, brand: CFG.brand, site: CFG.site });
}
async function printView() {
	markShared();
	const bm = await originalPhoto();
	const changed = app.editor.view.before || app.editor.view.objects.length || app.editor.view.ops.length || app.editor.view.edited;
	printDesign({ image: app.editor.composite(0), before: changed && bm ? bgFit(bm) : null, title: `${app.project.name} · ${app.editor.view.label}`, brand: CFG.brand, site: CFG.site, plants: summarize(), customer: session.user ? `Prepared for ${session.user.name}` : '' });
}
function bgFit(bm) { const c = canvas(bm.width, bm.height); c.getContext('2d').drawImage(bm, 0, 0); return c; }

/* ------------------------------------------------------------- misc helpers */

let toastT = 0;
function toast(msg, ms = 3200) {
	if (!app) return;
	let t = app.ui && app.ui.toast;
	if (!t || !t.isConnected) {
		// Outside the editor (home, hub, community…): one floating toast for the whole app.
		t = app.pageToast;
		if (!t || !t.isConnected) { t = app.pageToast = h('div', { class: 'ds-toast ds-toast-page', role: 'status', 'aria-live': 'polite' }); app.root.append(t); }
	}
	t.textContent = msg;
	t.classList.add('on');
	clearTimeout(toastT);
	toastT = setTimeout(() => t.classList.remove('on'), ms);
}

function onKey(e) {
	if (!app || !app.editor || !app.project) return;
	const tag = (e.composedPath()[0] || {}).tagName;
	if (tag === 'INPUT' || tag === 'TEXTAREA') return;
	if (app.root.querySelector('.ds-backdrop')) return;
	const ed = app.editor, k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
	if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? ed.redo() : ed.undo(); return; }
	if (mod && k === 'y') { e.preventDefault(); ed.redo(); return; }
	if (mod && k === 'd') { e.preventDefault(); ed.duplicateSelected(); return; }
	if (mod) return;
	if (k === 'delete' || k === 'backspace') { if (ed.sel) { e.preventDefault(); ed.deleteSelected(); } else if (ed.selOp) { e.preventDefault(); ed.deleteOp(ed.selOp); } return; }
	if (k === 'escape') { if (ed.tool === 'bed') ed.cancelBed(); else if (ed.tool === 'measure') ed.cancelMeasure(); else if (ed.tool === 'place') { ed.setTool('select'); renderPanel(); } else { ed.select(null); ed.selectOp(null); } return; }
	if (k === 'enter' && ed.tool === 'bed') { ed.finishBed(); return; }
	if (k === 'enter' && ed.tool === 'measure') { ed.finishMeasure(); renderPanel(); return; }
	if (ed.sel && k.startsWith('arrow')) { e.preventDefault(); const st = e.shiftKey ? 3 : 0.5; ed.nudgeSelected(k === 'arrowleft' ? -st : k === 'arrowright' ? st : 0, k === 'arrowup' ? st : k === 'arrowdown' ? -st : 0); return; }
	if (ed.sel && (k === '[' || k === ']')) { ed.updateSelected({ rot: ((ed.sel.rot || 0) + (k === '[' ? -5 : 5) + 540) % 360 - 180 }); return; }
	if (k === ' ') { if (!ed.spaceDown) { ed.spaceDown = true; window.addEventListener('keyup', (u) => { if (u.key === ' ') ed.spaceDown = false; }, { once: true }); } e.preventDefault(); return; }
	if (k === '+' || k === '=') return ed.zoomBy(1.25);
	if (k === '-') return ed.zoomBy(0.8);
	if (k === '0') return ed.fit();
	if (k === 'n') { app.project.night = !app.project.night; syncScenebar(); ed.render(); saveSoon(); return; }
	const map = { v: 'select', p: 'plants', b: 'paint', l: 'bed', m: 'measure', j: 'adjust', e: 'eraser', s: 'scale', h: 'pan' };
	if (map[k]) setTool(map[k]);
}

boot();

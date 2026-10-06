/* DreamScaper – Plant ID. Snap any plant and find out what it is, how it grows, and whether
 * it's a weed. The result is linked to real growth data and — if the customer chooses —
 * saved to My Library so it can be placed in any Dreamscape and grown through the years.
 * Available from every screen.
 */
import { h, put, icon, uid, canvas, canvasToBlob } from './util.js?v=2.5.0';
import { session, api } from './api.js?v=2.5.0';
import { openAuth } from './account.js?v=2.5.0';
import { identify } from './aiclient.js?v=2.5.0';
import { ALL, plantFromProfile, sizeAt, fmtFt, growthLabel, sunLabel, bloomLabel } from './library.js?v=2.5.0';
import { prepareCutout, defaultBox, segment as cutSegment, renderCutout } from './cutout.js?v=2.5.0';
import { encodeCutout } from './photo.js?v=2.5.0';
import { modal } from './capture.js?v=2.5.0';
import { storageMeter, storageLeft, fmtBytes, refreshStorage, openStorage } from './storage.js?v=2.5.0';

const WEED_GENERA = /^(Taraxacum|Plantago|Digitaria|Oxalis|Glechoma|Ambrosia|Chenopodium|Portulaca|Stellaria|Cirsium|Rumex|Polygonum|Persicaria|Alliaria|Reynoutria|Fallopia|Celastrus|Toxicodendron|Cyperus|Poa annua|Trifolium repens|Galium aparine|Lamium|Veronica persica|Euphorbia maculata|Setaria|Echinochloa|Eleusine|Mollugo|Lepidium|Capsella|Cardamine|Medicago lupulina|Ranunculus repens|Rosa multiflora|Lonicera japonica|Ailanthus|Microstegium|Artemisia vulgaris|Ampelopsis|Hedera helix)/i;
const INVASIVE = /^(Berberis thunbergii|Euonymus alatus|Celastrus orbiculatus|Rosa multiflora|Alliaria petiolata|Reynoutria|Fallopia japonica|Ailanthus altissima|Lonicera (japonica|maackii|morrowii|tatarica)|Microstegium vimineum|Lythrum salicaria|Pyrus calleryana|Elaeagnus umbellata|Ampelopsis brevipedunculata)/i;
const TOXIC = /^(Toxicodendron)/i;

const PARTS = [['auto', '🌿 Whole plant'], ['leaf', '🍃 Leaf'], ['flower', '🌸 Flower'], ['fruit', '🍒 Fruit / berry'], ['bark', '🪵 Bark']];

/** What Plant ID gives you — shown on the first screen. */
const BENEFITS = [
	['🔎', 'Know exactly what it is', 'Common and botanical name, how sure we are, and look-alikes.'],
	['📈', 'Real growth data, linked automatically', 'Mature height and spread, how fast it grows, sun needs and bloom time — matched to our library of 480+ New England plants.'],
	['⏳', 'See it years from now', 'Add it to a Dreamscape and slide through time to see how big it will really be in 1, 3, 5 or 10 years — and how it looks every season.'],
	['📚', 'Keep it in My Library', 'If you choose, we cut the plant out of your photo and save it with all its details, ready to use in any project on any device.'],
	['⚠️', 'Weed & invasive alerts', 'We warn you about common weeds, Connecticut invasives and poison ivy.']
];

/**
 * ctx: { root, toast, store, capture(kind) → shot, registerAsset(rec) → item,
 *        place(item) (optional – only when a design is open), facts(item) (optional) }
 */
export function openPlantId(ctx) {
	const { root, toast } = ctx;
	let part = 'auto';
	const body = h('div', { class: 'ds-pid' });
	const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
	const m = modal(root, 'Plant ID', [body], close, 'ds-modal-pid');
	const show = (...kids) => { body.innerHTML = ''; put(body, ...kids.flat().filter(Boolean)); };

	const start = () => {
		show(
			h('div', { class: 'ds-pid-intro' }, h('span', { class: 'ds-pid-ic' }, '🌿'),
				h('div', null, h('b', null, 'What plant is this?'),
					h('p', { class: 'ds-muted' }, 'Snap a photo of any tree, shrub, flower, grass or weed. In a few seconds you’ll know what it is — and exactly how it will grow in your yard.'))),
			h('ul', { class: 'ds-pid-benefits' }, ...BENEFITS.map(([ic, t, d]) => h('li', null, h('span', null, ic), h('div', null, h('b', null, t), h('small', null, d))))),
			h('p', { class: 'ds-label' }, 'How to get a great match'),
			h('ol', { class: 'ds-steps-mini' },
				h('li', null, h('b', null, 'Choose the part you’ll photograph'), ' — a flower or a single leaf is usually easiest.'),
				h('li', null, h('b', null, 'Fill the frame'), ' with that part, in focus, in daylight.'),
				h('li', null, h('b', null, 'Get the answer'), ', then decide if you want to keep it in My Library.')),
			h('div', { class: 'ds-chips' }, ...PARTS.map(([id, label]) => h('button', { class: 'ds-chip' + (part === id ? ' on' : ''), onclick: (e) => { part = id; e.currentTarget.parentNode.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.currentTarget)); } }, label))),
			h('div', { class: 'ds-grid2 ds-pid-go' },
				h('button', { class: 'ds-btn ds-lg', onclick: () => go('camera') }, icon('camera', 20), ' Take a photo'),
				h('button', { class: 'ds-btn ds-ghost ds-lg', onclick: () => go('upload') }, icon('upload', 20), ' Upload a photo')),
			h('p', { class: 'ds-hint ds-center' }, 'Plant ID is for plants only. Identifying is always free.'),
			!session.user ? h('p', { class: 'ds-hint ds-center' }, icon('lock', 14), ' You’ll be asked to sign in (free) so your plants can be saved to your account.') : null,
			session.ai && !session.ai.identify ? h('p', { class: 'ds-hint ds-center' }, 'Plant ID is being set up and will be available soon.') : null);
	};

	const go = async (kind) => {
		if (!session.user && !(await openAuth({ reason: 'Sign in to use Plant ID — it’s free.' }))) return;
		if (!session.ai.identify) return toast('Plant ID isn’t switched on yet.');
		const shot = await ctx.capture(kind);
		if (!shot || shot.error) return;
		show(h('div', { class: 'ds-pid-busy' }, h('img', { src: thumbData(shot.bitmap, 360), alt: '' }), h('p', null, h('span', { class: 'ds-spin ds-spin-sm' }), ' Identifying your plant…')));
		try {
			const res = await identify(shot.bitmap, part);
			await result(res, shot.bitmap);
		} catch (e) {
			const notPlant = e.data && e.data.data && e.data.data.notPlant;
			show(h('p', { class: 'ds-err' }, e.message),
				h('p', { class: 'ds-hint' }, notPlant ? 'Tip: fill the frame with one leaf or flower of the plant.' : 'Tips: get closer to one leaf or flower, use daylight, and keep it in focus.'),
				h('button', { class: 'ds-btn', onclick: start }, icon('camera', 18), ' Try again'));
		}
	};

	const result = async (res, photo) => {
		const card = idCard(res, photo);
		const growBox = h('div', { class: 'ds-pid-grow' }, h('p', { class: 'ds-muted' }, h('span', { class: 'ds-spin ds-spin-sm' }), ' Looking up how it grows…'));
		const saveBox = h('div', { class: 'ds-pid-save' });
		const actions = h('div', { class: 'ds-row ds-wrap ds-pid-actions' });
		show(card.el, growBox, saveBox, actions);
		// 1) growth data: our library → related plant → horticulture estimate
		const link = await linkGrowth(res, card.lib);
		growBox.innerHTML = '';
		put(growBox, growthPanel(link, photo));
		// 2) prepare the cut-out so we can say exactly how much space it takes
		let pack = null;
		try { pack = await buildAsset(photo); } catch (e) { console.warn(e); }
		const addFacts = () => { if (ctx.facts && link.item) put(actions, h('button', { class: 'ds-btn ds-ghost', onclick: () => ctx.facts(link.item) }, '📈 Full plant facts')); };
		const again = () => put(actions, h('button', { class: 'ds-btn ds-ghost', onclick: start }, icon('camera', 18), ' Identify another'));
		if (!pack) { put(saveBox, h('p', { class: 'ds-hint' }, 'This photo can’t be saved as a library plant, but the details above are yours to keep.')); addFacts(); again(); return; }
		await refreshStorage();
		const drawSave = () => {
			saveBox.innerHTML = '';
			const left = storageLeft();
			const fits = pack.bytes <= left;
			put(saveBox, 
				h('h4', null, '📚 Add it to My Library?'),
				h('p', { class: 'ds-hint' }, `We’ll save the plant cut out of your photo with its ${link.item ? 'growth data' : 'details'}${card.weed ? ' (handy for showing what to remove)' : ''}. Then it’s in Plants → My Library in every Dreamscape, on any device${link.item ? ', and it grows like the real thing when you move the time slider' : ''}.`),
				h('div', { class: 'ds-pid-size' }, h('span', null, 'This plant uses ', h('b', null, fmtBytes(pack.bytes))), h('span', null, Number.isFinite(left) ? h('span', null, 'You have ', h('b', null, fmtBytes(left)), ' left') : 'Unlimited storage')),
				storageMeter(session.storage, pack.bytes),
				fits ? null : h('p', { class: 'ds-warn' }, 'Your storage is full. Add more storage or delete something you no longer need, then save.'),
				h('div', { class: 'ds-row ds-wrap' },
					fits ? h('button', { class: 'ds-btn', onclick: save }, icon('plus', 18), ' Add to My Library') : h('button', { class: 'ds-btn', onclick: () => openStorage('Get more room for your library.').then(() => drawSave()) }, icon('cloud', 18), ' Get more storage'),
					h('button', { class: 'ds-btn ds-ghost', onclick: skip }, 'No thanks')));
		};
		const skip = () => { saveBox.innerHTML = ''; put(saveBox, h('p', { class: 'ds-muted' }, 'Not saved. You can identify it again any time.')); actions.innerHTML = ''; addFacts(); again(); };
		const save = async (e) => {
			e.currentTarget.disabled = true;
			try {
				const rec = await commitAsset(ctx.store, pack, res, link, card.weed);
				const it = await ctx.registerAsset(rec);
				saveBox.innerHTML = '';
				put(saveBox, h('p', { class: 'ds-ok' }, icon('check', 16), ` Saved to My Library${link.lib ? ' — linked to “' + link.lib.name + '”' : ''}. Find it under Plants → My Library.`));
				actions.innerHTML = '';
				if (ctx.place) put(actions, h('button', { class: 'ds-btn', onclick: () => { m.remove(); ctx.place(it); } }, icon('plus', 18), ' Place it in my design'));
				else put(actions, h('p', { class: 'ds-hint' }, 'Open any Dreamscape and pick it from Plants → My Library to see it grow in your yard.'));
				addFacts(); again();
				setTimeout(refreshStorage, 4000);
			} catch (err) { toast(err.message || 'Couldn’t save it.'); drawSave(); }
		};
		drawSave();
		addFacts(); again();
	};
	start();
}

/** Result card: name, confidence, warnings, look-alikes. */
export function idCard(res, photo) {
	const sci = res.sci || '';
	const weed = !!res.weed || WEED_GENERA.test(sci);
	const invasive = INVASIVE.test(sci);
	const toxic = TOXIC.test(sci);
	const lib = matchLibrary(res);
	const conf = Math.round((res.score || 0) * 100);
	const sure = conf >= 60 ? 'Very likely' : conf >= 30 ? 'Probably' : 'Possibly';
	const alts = (res.alternatives || []).map((a) => a.common || a.sci).filter(Boolean).slice(0, 3);
	const el = h('div', { class: 'ds-id-card' },
		h('img', { src: thumbData(photo, 200), alt: '' }),
		h('div', null,
			h('small', null, `${sure} · ${conf}% match`),
			h('b', null, res.name),
			sci ? h('i', null, sci) : null,
			toxic ? h('p', { class: 'ds-warn' }, '⚠️ Poison ivy family — don’t touch it with bare skin.') : null,
			weed ? h('p', { class: 'ds-warn' }, '⚠️ This is a common weed. Pull it before it goes to seed — or use AI Erase to see your yard without it.') : null,
			invasive ? h('p', { class: 'ds-warn' }, '⚠️ Listed as invasive in Connecticut. We can help remove it.') : null,
			res.description ? h('p', { class: 'ds-hint' }, res.description) : null,
			alts.length ? h('p', { class: 'ds-hint' }, 'Could also be: ' + alts.join(', ')) : null));
	return { el, lib, weed };
}

/** Same species in our library, else none. */
export function matchLibrary(res) {
	const sci = (res.sci || '').toLowerCase();
	if (!sci) return null;
	const sp = sci.split(/\s+/).slice(0, 2).join(' ');
	const plants = ALL.filter((x) => x.cat !== 'features' && !x.mine && x.sci);
	return plants.find((x) => x.sci.toLowerCase() === sci) || plants.find((x) => x.sci.toLowerCase().startsWith(sp)) || null;
}
function matchGenus(res) {
	const g = (res.genus || (res.sci || '').split(/\s+/)[0] || '').toLowerCase();
	if (!g || g.length < 3) return null;
	return ALL.find((x) => x.cat !== 'features' && !x.mine && x.sci && x.sci.toLowerCase().split(/\s+/)[0] === g) || null;
}

/** Find growth data. Returns { item, lib, profile, how }. */
async function linkGrowth(res, lib) {
	if (lib) return { item: lib, lib, how: 'library' };
	let profile = null;
	try { profile = await api('ai/growth', { body: { sci: res.sci || '', name: res.name } }); } catch (e) { /* not available */ }
	if (profile && profile.h) {
		const item = plantFromProfile({ ...profile, name: res.name, sci: res.sci });
		item.zones = profile.zones || '';
		return { item, profile, how: 'estimate' };
	}
	const rel = matchGenus(res);
	if (rel) return { item: rel, lib: rel, how: 'related' };
	return { item: null, how: 'none' };
}

/** "How it grows" — key numbers plus a little picture of it now and in 3, 5 and 10 years. */
function growthPanel(link, photo) {
	const it = link.item;
	if (!it) return h('p', { class: 'ds-hint' }, 'We don’t have growth data for this plant yet. If you save it, it will be shown at a fixed size.');
	const src = link.how === 'library' ? `Linked to “${it.name}” in our plant library.`
		: link.how === 'related' ? `Growth based on a close relative in our library: “${it.name}”.`
		: 'Growth estimated from horticultural references for this species.';
	const rows = [
		['Mature size', `${fmtFt(it.h)} tall × ${fmtFt(it.w)} wide`],
		['Growth', growthLabel(it)],
		['Sun', it.sun ? sunLabel(it.sun) : ''],
		['Blooms', bloomLabel(it)],
		['Hardiness', it.zones ? 'Zones ' + String(it.zones).replace(/^z/, '') : ''],
		['Native', it.native ? 'Yes — native to the eastern US' : '']
	].filter((r) => r[1]);
	const start = it.plant || 0;
	const ages = it.annual ? [[0, 'Planted'], [0.5, 'Midsummer']] : [[start, 'Planted'], [start + 3, '3 years'], [start + 5, '5 years'], [start + 10, '10 years']];
	const sizes = ages.map(([a]) => sizeAt(it, a).h);
	const tallest = Math.max(...sizes, 0.1);
	const pic = thumbData(photo, 140);
	const strip = h('div', { class: 'ds-grow-strip', role: 'img', 'aria-label': 'How big it gets over time' },
		...ages.map(([, label], i) => h('figure', null,
			h('div', { class: 'ds-grow-box' }, h('img', { src: pic, alt: '', style: { height: Math.max(10, (sizes[i] / tallest) * 100) + '%' } })),
			h('figcaption', null, h('b', null, fmtFt(sizes[i])), h('small', null, label)))));
	return h('div', null,
		h('h4', null, '📈 How it grows'),
		h('p', { class: 'ds-hint' }, src),
		h('dl', { class: 'ds-grow-facts' }, ...rows.map(([k, v]) => h('div', null, h('dt', null, k), h('dd', null, v)))),
		strip,
		h('p', { class: 'ds-hint' }, 'In a Dreamscape, the time slider grows it exactly like this — so you can see if it will crowd a window or walkway before you plant.'));
}

function thumbData(img, max = 120) {
	const w = img.width, hh = img.height, k = max / Math.max(w, hh);
	const c = canvas(w * k, hh * k);
	c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
	return c.toDataURL('image/jpeg', 0.82);
}

/** Cut the plant out and make the files (not saved yet) so we know the exact size. */
async function buildAsset(photo) {
	const st = prepareCutout(photo);
	cutSegment(st, defaultBox(st));
	const cut = renderCutout(st, 640);
	if (!cut) throw new Error('no cutout');
	const blob = await encodeCutout(cut, 0.82);
	const k = 168 / Math.max(cut.width, cut.height);
	const th = canvas(cut.width * k, cut.height * k);
	th.getContext('2d').drawImage(cut, 0, 0, th.width, th.height);
	const thumb = await encodeCutout(th, 0.8);
	const ko = Math.min(1, 1280 / Math.max(photo.width, photo.height));
	const oc = canvas(photo.width * ko, photo.height * ko);
	oc.getContext('2d').drawImage(photo, 0, 0, oc.width, oc.height);
	const original = await canvasToBlob(oc, 'image/jpeg', 0.82);
	return { blob, thumb, original, aspect: cut.width / cut.height, bytes: blob.size + thumb.size + original.size };
}

async function commitAsset(store, pack, res, link, weed) {
	const lib = link.how === 'library' ? link.lib : null;
	const it = link.item;
	const cat = it ? it.cat : res.category && !['weeds', 'features'].includes(res.category) ? res.category : 'perennials';
	const rec = {
		id: 'my-' + uid(), created: Date.now(), updated: Date.now(),
		name: res.name, sci: res.sci || '', cat, base: lib ? lib.id : link.how === 'related' ? link.lib.id : null,
		growth: link.how === 'estimate' ? { ...link.profile } : null,
		h: it ? it.h : 2, fixed: false, bloom: false,
		group: weed ? 'Weeds' : 'Identified plants',
		blob: await store.putBlob(pack.blob), thumb: await store.putBlob(pack.thumb), original: await store.putBlob(pack.original),
		aspect: pack.aspect, bytes: pack.bytes, identified: { by: res.by, score: res.score, weed, link: link.how },
		tags: [res.name, res.sci, weed ? 'weed' : '', 'plant id', ...(res.tags || [])].filter(Boolean).join(' ')
	};
	await store.putAsset(rec);
	return rec;
}

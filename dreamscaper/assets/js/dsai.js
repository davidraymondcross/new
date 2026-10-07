/* Dreamscape AI – the AI design studio (FLUX.2 [klein] 4B).
 * Talk, tap ideas, add inspiration photos — any mix — and the prompt writes itself.
 * Every generation is kept; tweaks can always be undone back to the original.
 */
import { h, put, icon, uid, canvas, canvasToBlob, blobToBitmap } from './util.js?v=2.7.6';
import { session, onSession, api } from './api.js?v=2.7.6';
import { openAuth, creditsPill } from './account.js?v=2.7.6';
import { openCredits, confirmCredit } from './credits.js?v=2.7.6';
import { SELECT, REMOVE, ADD, removePrompt, replacePrompt, improvePrompt, addPrompt } from './aitoolkit.js?v=2.7.6';
import { historyPanel } from './history.js?v=2.7.6';
import { maybeTour } from './tour.js?v=2.7.6';
import { voiceButton, voiceSupported } from './voice.js?v=2.7.6';
import { IDEAS, IDEA_GROUPS, GOAL_GROUPS, REF_ROLES, TWEAKS, STYLES, buildPrompt, summarize, tweakPrompt, regionPrompt, stylePrompt, KEEP_TEXT } from './aiprompt.js?v=2.7.6';
import { runEdit, compositeMasked, loadImage, aiReady, segment, dilateMask, toJpeg } from './aiclient.js?v=2.7.6';

/** AI design assistant tools (left rail → "AI tools"). Thinking tools are free; making an image uses credits. */
const AI_TOOLS = [
	['ask', '💬', 'Ask DreamScaper'],
	['ideas', '💡', 'Give me ideas'],
	['analyze', '🔍', 'Analyze my landscape'],
	['style', '🎨', 'Change style'],
	['variations', '🎲', 'Variations'],
	['similar', '🧬', 'Generate similar'],
	['keep', '🔒', 'Keep / change'],
	['explain', '🧠', 'Explain this design']
];
const ASK_EXAMPLES = ['Make the front yard look better', 'Add more privacy', 'Create a low-maintenance landscape', 'Add a curved planting bed', 'Replace the lawn with a garden', 'Add a walkway to the front door', 'Make this backyard better for entertaining'];

/**
 * ctx: { root, toast, store, brand, capture(kind) → shot, pickLibrary() → canvas|null,
 *        saveRun(run), markup(blobId, W, H, label), share(canvas, before), print(canvas, before, title), send(canvas) }
 * opts: { image (drawable), run (existing session), aerial, title }
 */
export function openStudio(ctx, opts = {}) {
	const { root, toast, store } = ctx;
	const run = opts.run || { id: 'ai' + uid(), created: Date.now(), input: null, W: 0, H: 0, aerial: !!opts.aerial, picks: null, versions: [], cur: -1 };
	const S = run.picks ? revive(run.picks) : { words: '', ideas: {}, goals: { amount: 'moderate' }, refs: [], custom: '' };
	let photo = null;            // drawable of the input photo
	const refImgs = [];          // canvases for S.refs
	const verImgs = new Map();   // version index → image
	let mode = run.versions.length ? 'perfect' : 'build';
	let busy = false;

	/* ------------------------------------------------------------ layout */
	const wrap = h('div', { class: 'ds-studio', role: 'dialog', 'aria-label': 'Dreamscape AI' });
	const credits = creditsPill();
	const closeBtn = h('button', { class: 'ds-icon-btn', 'aria-label': 'Close Dreamscape AI', onclick: () => done() }, icon('close'));
	const histBtn = h('button', { class: 'ds-btn ds-ghost ds-sm ds-ai-hist-btn', title: 'History — every AI step, go back any time', onclick: () => toggleHist() }, icon('history', 18), h('span', { class: 'ds-hide-sm' }, ' History'));
	const head = h('header', { class: 'ds-studio-head' }, h('span', { class: 'ds-ai-badge' }, icon('sparkle', 18)), h('h3', null, 'Dreamscape AI'), h('div', { class: 'ds-spacer' }), histBtn,
		ctx.plantId ? h('button', { class: 'ds-pid-btn', onclick: () => ctx.plantId(), title: 'Identify any plant from a photo' }, '🌿', h('span', null, ' Plant ID')) : null,
		ctx.guide ? h('button', { class: 'ds-icon-btn ds-help', onclick: () => ctx.guide('ai'), title: 'How Dreamscape AI works', 'aria-label': 'Help' }, '?') : null,
		credits, closeBtn);
	const viewer = h('div', { class: 'ds-sv' });
	const versions = h('div', { class: 'ds-vers', 'aria-label': 'Versions' });
	const panel = h('div', { class: 'ds-sp' });
	const progress = h('div', { class: 'ds-sv-busy', hidden: true }, h('span', { class: 'ds-spin' }), h('b', null, 'Creating…'), h('small', null, 'About 10–30 seconds'));
	const rail = h('nav', { class: 'ds-ai-rail', 'aria-label': 'One-click AI tools' });
	const svCol = h('div', { class: 'ds-sv-col' }, viewer, progress, versions);
	wrap.append(head, h('div', { class: 'ds-studio-main ds-has-rail' }, rail, svCol, panel));
	root.append(wrap);
	const offSess = onSession(() => drawPanel());
	function done() { offSess(); credits._off && credits._off(); wrap.remove(); ctx.onClose && ctx.onClose(); }

	/* ----------------------------------------------------- photo & viewer */
	const setPhoto = async (img, aerial) => {
		photo = img;
		run.W = img.naturalWidth || img.width; run.H = img.naturalHeight || img.height;
		run.aerial = !!aerial;
		const blob = await canvasToBlob(toCanvas(img), 'image/jpeg', 0.92);
		run.input = await store.putBlob(blob);
		save();
		drawViewer();
		drawPanel();
	};
	const save = () => { run.picks = freeze(S); ctx.saveRun && ctx.saveRun(run); };

	let compareX = 0.5, region = null; // region: {mask canvas, painting}
	let sel = null;     // one-click selection { id, label, what, ideas, mask, W, H }
	let place = null;   // one-click Add in progress { id, label, def, ideas, detail }
	let railTab = 'select';
	let aiTool = null;      // AI assistant tool open in the panel
	let analysis = null, explained = null, asked = null, styleId = 'traditional', varN = 3, ideaCat = '';
	let hist = null;
	function drawViewer() {
		viewer.innerHTML = '';
		if (!photo) {
			viewer.append(h('div', { class: 'ds-sv-empty' }, icon('image', 48), h('p', null, 'Choose the photo you want to transform')));
			return;
		}
		const cur = run.cur >= 0 ? verImgs.get(run.cur) : null;
		const box = h('div', { class: 'ds-cmp' });
		const before = h('img', { src: srcOf(photo), alt: 'Before', draggable: false });
		box.append(before);
		if (cur) {
			const after = h('img', { src: srcOf(cur), alt: 'After', draggable: false, class: 'ds-cmp-after' });
			const knob = h('div', { class: 'ds-cmp-knob', role: 'slider', 'aria-label': 'Compare before and after', tabindex: 0, 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('span', null, icon('compare', 18)));
			const tagB = h('span', { class: 'ds-cmp-tag l' }, 'Before'), tagA = h('span', { class: 'ds-cmp-tag r' }, 'After');
			box.append(after, knob, tagB, tagA);
			const setX = (f) => { compareX = Math.max(0, Math.min(1, f)); after.style.clipPath = `inset(0 0 0 ${compareX * 100}%)`; knob.style.left = compareX * 100 + '%'; knob.setAttribute('aria-valuenow', Math.round(compareX * 100)); };
			setX(region || sel ? 0 : compareX);
			let drag = false;
			const mv = (e) => { const r = box.getBoundingClientRect(); setX((e.clientX - r.left) / r.width); };
			knob.addEventListener('pointerdown', (e) => { drag = true; knob.setPointerCapture(e.pointerId); });
			knob.addEventListener('pointermove', (e) => { if (drag) mv(e); });
			knob.addEventListener('pointerup', () => { drag = false; });
			knob.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') setX(compareX - 0.05); if (e.key === 'ArrowRight') setX(compareX + 0.05); });
			box.addEventListener('click', (e) => { if (!region && e.target !== knob && !knob.contains(e.target)) mv(e); });
		}
		if (region) box.append(regionLayer(box, cur || photo));
		if (sel && !region) box.append(selLayer());
		viewer.append(box);
		drawVersions();
	}

	/* paint-the-area layer for “Fix just this area” */
	function regionLayer(box, cur) {
		const W = cur.naturalWidth || cur.width, H = cur.naturalHeight || cur.height;
		if (!region.mask || region.mask.width !== W) { region.mask = canvas(W, H); }
		const c = region.mask;
		c.className = 'ds-region';
		const x = c.getContext('2d');
		let down = false;
		const pt = (e) => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H]; };
		const dot = (p) => { x.fillStyle = 'rgba(255,70,140,.55)'; x.beginPath(); x.arc(p[0], p[1], Math.max(W, H) * region.size, 0, 7); x.fill(); region.dirty = true; drawPanel(); };
		c.addEventListener('pointerdown', (e) => { down = true; c.setPointerCapture(e.pointerId); dot(pt(e)); });
		c.addEventListener('pointermove', (e) => { if (down) dot(pt(e)); });
		c.addEventListener('pointerup', () => { down = false; });
		return c;
	}

	/* pink highlight for a one-click selection */
	function selLayer() {
		const { mask, W, H } = sel;
		const c = canvas(W, H), x = c.getContext('2d');
		const d = x.createImageData(W, H);
		for (let k = 0, i = 0; k < mask.length; k++, i += 4) {
			if (!mask[k]) continue;
			const edge = (k % W > 0 && !mask[k - 1]) || (k % W < W - 1 && !mask[k + 1]) || (k >= W && !mask[k - W]) || (k < W * (H - 1) && !mask[k + W]);
			d.data[i] = 255; d.data[i + 1] = edge ? 255 : 47; d.data[i + 2] = edge ? 255 : 160; d.data[i + 3] = edge ? 255 : 120;
		}
		x.putImageData(d, 0, 0);
		c.className = 'ds-region ds-selhl';
		return c;
	}

	function drawVersions() {
		versions.innerHTML = '';
		if (!run.versions.length) return;
		const thumb = (img, label, i, on) => h('button', { class: 'ds-ver' + (on ? ' on' : ''), title: label, onclick: () => { if (i === -1) { run.cur = -1; } else run.cur = i; save(); ensureVer(run.cur).then(() => { drawViewer(); drawPanel(); }); } },
			img ? h('img', { src: srcOf(img), alt: '' }) : h('span', { class: 'ds-ver-ph' }, '…'), h('small', null, label));
		versions.append(thumb(photo, 'Before', -1, run.cur === -1));
		run.versions.forEach((v, i) => {
			const label = v.label ? (v.label.length > 20 ? v.label.slice(0, 19) + '…' : v.label) : i === 0 ? 'Original AI' : `#${i + 1}`;
			const el = thumb(verImgs.get(i), label, i, run.cur === i);
			versions.append(el);
			if (!verImgs.get(i)) ensureVer(i).then(() => drawVersions());
		});
	}
	async function ensureVer(i) {
		if (i < 0 || verImgs.get(i)) return;
		const b = await store.getBlob(run.versions[i].blob);
		if (b) verImgs.set(i, await loadImage(URL.createObjectURL(b)));
	}

	/* -------------------------------------------------------------- panel */
	function drawPanel() {
		const st = panel.scrollTop;
		panel.innerHTML = '';
		if (!session.user || !session.ai.enabled) panel.append(lockedNote());
		if (!photo) panel.append(stepPhoto());
		else if (aiTool) panel.append(aiToolUI());
		else if (place) panel.append(addUI());
		else if (sel) panel.append(selectionUI());
		else if (mode === 'build') panel.append(...buildUI());
		else panel.append(...perfectUI());
		panel.scrollTop = st;
		drawRail();
		if (hist) hist.refresh();
	}

	function lockedNote() {
		if (!session.ai.enabled) return h('div', { class: 'ds-note' }, icon('lock', 18), h('span', null, 'Dreamscape AI is being set up and will be available soon. You can still use every other DreamScaper tool.'));
		return h('div', { class: 'ds-note ds-note-cta' }, icon('lock', 18), h('span', null, h('b', null, 'Sign in to use Dreamscape AI. '), `It's free — ${session.ai.limit || 10} AI designs every day.`),
			h('button', { class: 'ds-btn ds-sm', onclick: () => openAuth({ reason: 'Sign in to use Dreamscape AI.' }) }, 'Sign in'));
	}

	function stepPhoto() {
		const srcs = [['camera', 'camera', 'Take a photo'], ['upload', 'upload', 'Upload a photo'], ['aerial', 'map', 'Bird’s-eye view'], ['sample', 'leaf', 'Sample yard']];
		return h('section', { class: 'ds-ss' },
			h('h4', null, h('span', { class: 'ds-num' }, '1'), ' Choose the photo of your yard'),
			h('p', { class: 'ds-muted' }, 'Start with a photo of the area you want to change. Stand back so the whole yard fits.'),
			h('div', { class: 'ds-ss-src' }, ...srcs.map(([k, ic, t]) => h('button', { class: 'ds-btn ds-ghost', onclick: async () => {
				const shot = await ctx.capture(k);
				if (!shot) return;
				if (shot.error) return toast(shot.error);
				await setPhoto(shot.bitmap, shot.kind === 'aerial');
			} }, icon(ic, 18), ' ', t))));
	}

	/* ---------- build mode: talk / tap / inspiration */
	function buildUI() {
		const out = [];
		out.push(h('div', { class: 'ds-ways' },
			h('b', null, 'How Dreamscape AI works'),
			h('p', null, 'The AI repaints the photo of your yard with the changes you ask for, keeping your house, driveway and camera angle the same. Tell it what you want in any of these ways — use one or mix them:'),
			h('span', null, '🎤 Say it'), h('span', null, '⌨️ Type it'), h('span', null, '👆 Tap ideas'), h('span', null, '📷 Show it a photo you love'),
			h('p', { class: 'ds-hint' }, 'Then press Create. Each design takes 10–30 seconds and uses 1 credit. You can fine-tune it, undo, and mark it up afterwards.')));
		out.push(h('section', { class: 'ds-ss ds-step-done' }, h('h4', null, h('span', { class: 'ds-num' }, '1'), ' Your photo ', icon('check', 16)),
			h('div', { class: 'ds-row' }, h('img', { class: 'ds-photo-mini', src: srcOf(photo), alt: '' }),
				h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => { photo = null; run.input = null; run.versions = []; run.cur = -1; verImgs.clear(); save(); drawViewer(); drawPanel(); } }, 'Use a different photo'))));

		// talk / type
		const ta = h('textarea', { rows: 3, placeholder: 'Describe your dream yard… e.g. “a curved bed by the porch with white hydrangeas and a bluestone path”', value: S.words });
		ta.addEventListener('input', () => { S.words = ta.value; refresh(); });
		const mic = voiceButton(ta, { raw: true, append: true, label: 'Tap and talk', listening: 'Listening… tell the AI what you’d like', cls: 'ds-mic-lg', onError: toast });
		out.push(h('section', { class: 'ds-ss' }, h('h4', null, h('span', { class: 'ds-num' }, '2'), ' Tell the AI what you want ', h('small', { class: 'ds-opt-tag' }, 'optional')),
			h('p', { class: 'ds-hint' }, 'Tap the microphone and talk, or type. Be specific about where and what: “a curved bed by the porch with white hydrangeas”.'),
			h('div', { class: 'ds-talk' }, mic ? h('div', { class: 'ds-talk-mic' }, mic, h('small', null, 'Tap & talk')) : null, ta),
			!voiceSupported ? h('p', { class: 'ds-hint' }, 'Tip: use the microphone on your keyboard to talk instead of typing.') : null));

		// ideas
		const ideas = h('section', { class: 'ds-ss' }, h('h4', null, h('span', { class: 'ds-num' }, '3'), ' Tap anything you would like ', h('small', { class: 'ds-opt-tag' }, 'optional')), h('p', { class: 'ds-hint' }, 'Each idea adds to the instructions. Tap again to remove. Some have choices — pick one.'));
		for (const [gid, gname] of IDEA_GROUPS) {
			const row = h('div', { class: 'ds-chips ds-ideas' });
			for (const it of IDEAS.filter((x) => x.g === gid)) {
				const on = !!S.ideas[it.id];
				const chip = h('button', { class: 'ds-chip' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false', onclick: () => { if (S.ideas[it.id]) delete S.ideas[it.id]; else S.ideas[it.id] = it.opts ? it.opts[0][0] : true; save(); drawPanel(); } }, h('span', { class: 'e' }, it.e), it.label);
				row.append(chip);
				if (on && it.opts) {
					row.append(h('div', { class: 'ds-opts' }, ...it.opts.map(([oid, ol]) => h('button', { class: 'ds-opt' + (S.ideas[it.id] === oid ? ' on' : ''), onclick: () => { S.ideas[it.id] = oid; save(); drawPanel(); } }, ol))));
				}
			}
			ideas.append(h('h5', null, gname), row);
		}
		out.push(ideas);

		// goals
		const goals = h('section', { class: 'ds-ss' }, h('h4', null, h('span', { class: 'ds-num' }, '4'), ' Style & goals ', h('small', { class: 'ds-opt-tag' }, 'optional')), h('p', { class: 'ds-hint' }, 'These shape how it looks — the look you love, how much care you want to give it, your sun and how big a change.'));
		for (const grp of GOAL_GROUPS) {
			const row = h('div', { class: 'ds-chips' });
			for (const [id, label] of grp.items) {
				const cur = S.goals[grp.id];
				const on = grp.single ? cur === id : !!(cur && cur.has && cur.has(id));
				row.append(h('button', { class: 'ds-chip ds-goal' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false', onclick: () => {
					if (grp.single) S.goals[grp.id] = on ? null : id;
					else { const set = S.goals[grp.id] instanceof Set ? S.goals[grp.id] : (S.goals[grp.id] = new Set()); on ? set.delete(id) : set.add(id); }
					save(); drawPanel();
				} }, label));
			}
			goals.append(h('h5', null, grp.label), row);
		}
		out.push(goals);

		// inspiration
		const refs = h('section', { class: 'ds-ss' }, h('h4', null, h('span', { class: 'ds-num' }, '5'), ' Seen something you love? ', h('small', { class: 'ds-opt-tag' }, 'optional')),
			h('p', { class: 'ds-muted' }, 'Snap a photo of a neighbor’s garden, a plant at the nursery, a patio online — anything — and the AI will work it into your yard. Up to 3 photos.'));
		const list = h('div', { class: 'ds-refs' });
		S.refs.forEach((r, i) => {
			const img = refImgs[i];
			const note = h('input', { type: 'text', value: r.note || '', placeholder: r.role === 'material' ? 'Where? e.g. the walkway' : 'Optional: where or how?' });
			note.addEventListener('input', () => { r.note = note.value; save(); refresh(); });
			const nmic = voiceButton(note, { raw: true, label: 'Say where or how', listening: 'Listening…', onError: toast });
			list.append(h('div', { class: 'ds-ref' },
				img ? h('img', { src: srcOf(img), alt: '' }) : h('span', { class: 'ds-ver-ph' }, '…'),
				h('div', { class: 'ds-ref-body' },
					h('div', { class: 'ds-chips ds-chips-sm' }, ...REF_ROLES.map(([rid, rl]) => h('button', { class: 'ds-chip' + (r.role === rid ? ' on' : ''), onclick: () => { r.role = rid; save(); drawPanel(); } }, rl))),
					h('div', { class: 'ds-row' }, note, nmic)),
				h('button', { class: 'ds-icon-btn', 'aria-label': 'Remove photo', onclick: () => { S.refs.splice(i, 1); refImgs.splice(i, 1); save(); drawPanel(); } }, icon('trash', 18))));
		});
		const addRef = async (img) => {
			if (!img) return;
			if (S.refs.length >= 3) return toast('Up to 3 inspiration photos.');
			refImgs.push(toCanvas(img, 1024));
			S.refs.push({ role: 'plant', note: '', blob: await store.putBlob(await canvasToBlob(refImgs[refImgs.length - 1], 'image/jpeg', 0.88)) });
			save(); drawPanel();
		};
		refs.append(list);
		if (S.refs.length < 3) refs.append(h('div', { class: 'ds-row ds-wrap' },
			h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: async () => { const s = await ctx.capture('camera'); if (s && !s.error) addRef(s.bitmap); } }, icon('camera', 16), ' Take a photo'),
			h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: async () => { const s = await ctx.capture('upload'); if (s && !s.error) addRef(s.bitmap); } }, icon('upload', 16), ' Upload'),
			h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: async () => addRef(await ctx.pickLibrary()) }, icon('leaf', 16), ' From the library / My Library')));
		out.push(refs);

		// prompt preview
		const auto = buildPrompt({ ...S, aerial: run.aerial });
		const pv = h('textarea', { rows: 6, class: 'ds-prompt' });
		pv.value = S.custom || auto;
		pv.addEventListener('input', () => { S.custom = pv.value === auto ? '' : pv.value; save(); });
		const det = h('details', { class: 'ds-ss ds-pv' }, h('summary', null, icon('eye', 16), ' See the instructions we’ll give the AI'),
			h('p', { class: 'ds-hint' }, 'This writes itself as you tap. You can edit it if you like.'), pv,
			S.custom ? h('button', { class: 'ds-link', onclick: () => { S.custom = ''; save(); drawPanel(); } }, 'Reset to automatic') : null);
		out.push(det);

		const nothing = !S.words.trim() && !Object.keys(S.ideas).length && !S.refs.length && !S.custom;
		const left = session.ai.unlimited ? '' : ` (uses 1 of ${session.ai.left} left today)`;
		const go = h('button', { class: 'ds-btn ds-lg ds-wide ds-go', disabled: busy || !photo }, icon('sparkle', 20), session.user ? ` Create my dream yard${left}` : ' Sign in to create');
		go.onclick = () => generate();
		out.push(h('h4', { class: 'ds-ss-h' }, h('span', { class: 'ds-num' }, '6'), ' Create it'));
		out.push(h('div', { class: 'ds-sticky' }, nothing ? h('p', { class: 'ds-hint ds-center' }, 'Say, type or tap at least one thing — or just press create for a professional refresh.') : null, go,
			run.versions.length ? h('button', { class: 'ds-link ds-center', onclick: () => { mode = 'perfect'; drawPanel(); drawViewer(); } }, 'Back to my AI designs →') : null));
		function refresh() { const a = buildPrompt({ ...S, aerial: run.aerial }); if (!S.custom) pv.value = a; }
		return out;
	}

	/* ---------- perfect mode: tweaks, area fixes, versions, actions */
	function perfectUI() {
		const out = [];
		const cur = run.cur >= 0 ? run.versions[run.cur] : null;
		out.push(h('section', { class: 'ds-ss' },
			h('div', { class: 'ds-row ds-between' }, h('h4', null, 'Perfect it'),
				h('div', { class: 'ds-row' },
					h('button', { class: 'ds-icon-btn', title: 'Undo — back one step', 'aria-label': 'Undo', disabled: run.cur < 0, onclick: () => step(-1) }, icon('undo', 18)),
					h('button', { class: 'ds-icon-btn', title: 'Redo', 'aria-label': 'Redo', disabled: !run.versions.some((v) => v.from === run.cur), onclick: () => step(1) }, icon('redo', 18)),
					h('button', { class: 'ds-icon-btn', title: 'History', 'aria-label': 'History', onclick: () => toggleHist() }, icon('history', 18)))),
			h('p', { class: 'ds-hint' }, 'Almost right? Make a small change. Every version is kept — tap one under the picture to go back to it.'),
			h('div', { class: 'ds-chips' }, ...TWEAKS.map(([id, label, text]) => h('button', { class: 'ds-chip', disabled: busy || !cur, onclick: () => tweak(text, label) }, label)))));
		const t = h('input', { type: 'text', placeholder: 'Or say/type a small change… e.g. “make the path wider”' });
		const tm = voiceButton(t, { raw: true, label: 'Say a change', listening: 'Listening…', onError: toast });
		const apply = h('button', { class: 'ds-btn', disabled: busy || !cur }, 'Apply');
		apply.onclick = () => { if (t.value.trim().length > 2) tweak(t.value.trim(), t.value.trim()); };
		t.addEventListener('keydown', (e) => { if (e.key === 'Enter') apply.click(); });
		out.push(h('section', { class: 'ds-ss' }, h('div', { class: 'ds-row ds-talkline' }, tm, t, apply)));

		// fix one area
		const areaSec = h('section', { class: 'ds-ss' }, h('h4', null, 'Fix just one area'));
		if (!region) {
			areaSec.append(h('p', { class: 'ds-hint' }, 'Paint over the part to change. Everything else stays exactly as it is.'),
				h('button', { class: 'ds-btn ds-ghost', disabled: busy || !cur, onclick: () => { region = { size: 0.025 }; drawViewer(); drawPanel(); } }, icon('brush', 18), ' Paint an area'));
		} else {
			const rt = h('input', { type: 'text', placeholder: 'What should change there? e.g. “replace with a Japanese maple”' });
			const rm = voiceButton(rt, { raw: true, label: 'Say what to change', listening: 'Listening…', onError: toast });
			const sz = h('input', { type: 'range', min: 0.008, max: 0.06, step: 0.002, value: region.size, oninput: () => { region.size = +sz.value; } });
			const goR = h('button', { class: 'ds-btn', disabled: busy || !region.dirty }, icon('sparkle', 16), ' Change it');
			goR.onclick = () => { if (rt.value.trim().length < 3) { toast('Say or type what should change in the painted area.'); return; } fixArea(rt.value.trim()); };
			areaSec.append(h('p', { class: 'ds-hint' }, 'Paint on the picture (pink). Then describe the change.'),
				h('label', { class: 'ds-slider' }, h('span', null, 'Brush size'), sz),
				h('div', { class: 'ds-row ds-talkline' }, rm, rt),
				h('div', { class: 'ds-row' }, goR,
					h('button', { class: 'ds-btn ds-ghost', onclick: () => { region.mask = null; region.dirty = false; drawViewer(); drawPanel(); } }, 'Clear'),
					h('button', { class: 'ds-btn ds-ghost', onclick: () => { region = null; drawViewer(); drawPanel(); } }, 'Done')));
		}
		out.push(areaSec);

		out.push(h('section', { class: 'ds-ss' }, h('h4', null, 'More options'),
			h('div', { class: 'ds-col' },
				h('button', { class: 'ds-btn ds-ghost', disabled: busy, onclick: () => generate(true) }, icon('sparkle', 18), ' Try a different version'),
				h('button', { class: 'ds-btn ds-ghost', onclick: () => { mode = 'build'; region = null; drawPanel(); drawViewer(); } }, icon('edit', 18), ' Change my picks & start a new design'))));

		const img = run.cur >= 0 ? verImgs.get(run.cur) : null;
		out.push(h('section', { class: 'ds-ss ds-love' }, h('h4', null, 'Love it?'),
			h('button', { class: 'ds-btn ds-wide', disabled: !img, onclick: () => ctx.markup(cur.blob, run.W, run.H, `AI design${run.cur > 0 ? ' #' + (run.cur + 1) : ''}`, run.aerial, run.input).then(() => done()) }, icon('pencil', 18), ' Mark it up — add plants & use all tools'),
			h('div', { class: 'ds-grid2' },
				h('button', { class: 'ds-btn ds-ghost', disabled: !img, onclick: () => ctx.share(toCanvas(img), toCanvas(photo)) }, icon('share', 18), ' Share'),
				h('button', { class: 'ds-btn ds-ghost', disabled: !img, onclick: () => ctx.print(toCanvas(img), toCanvas(photo), opts.title || 'My Dreamscape') }, icon('print', 18), ' Print'),
				h('button', { class: 'ds-btn ds-ghost', disabled: !img, onclick: () => download(img) }, icon('download', 18), ' Save image'),
				ctx.send ? h('button', { class: 'ds-btn ds-ghost', disabled: !img, onclick: () => ctx.send(toCanvas(img), toCanvas(photo)) }, icon('send', 18), ` Send to ${ctx.short || 'us'}`) : null),
			ctx.post ? h('button', { class: 'ds-btn ds-ghost ds-wide', disabled: !img, onclick: () => ctx.post(toCanvas(img), toCanvas(photo)) }, icon('globe', 18), ' Post to Dreamscape Browser') : null));
		return out;
	}

	function step(d) {
		if (d < 0) { const v = run.versions[run.cur]; run.cur = v && v.from != null ? Math.max(-1, v.from) : run.cur - 1; }
		else { let j = -1; run.versions.forEach((v, i) => { if (v.from === run.cur) j = i; }); if (j < 0) return; run.cur = j; }
		sel = null; place = null;
		save();
		ensureVer(run.cur).then(() => { drawViewer(); drawPanel(); });
	}


	/* ------------------------------------------------ one-click tools (left rail) */
	const curSrc = () => (run.cur >= 0 ? verImgs.get(run.cur) : photo);
	const dims = (img) => [img.naturalWidth || img.width, img.naturalHeight || img.height];
	function drawRail() {
		rail.innerHTML = '';
		const off = !photo || busy;
		const tabs = [['select', 'Select', 'select'], ['remove', 'Remove', 'trash'], ['add', 'Add', 'plus'], ['ai', 'AI tools', 'sparkle']];
		const lists = { select: SELECT, remove: REMOVE, add: ADD };
		const tabBar = h('div', { class: 'ds-rail-tabs', role: 'tablist' }, ...tabs.map(([id, label, ic]) => h('button', { role: 'tab', 'aria-selected': String(railTab === id), class: railTab === id ? 'on' : '', onclick: () => { railTab = id; drawRail(); } }, icon(ic, 16), ' ', label)));
		if (railTab === 'ai') {
			put(rail, h('div', { class: 'ds-rail-head' }, h('b', null, 'AI design assistant'), h('small', null, 'Ideas & advice are free · making a picture uses credits')), tabBar,
				h('div', { class: 'ds-rail-list' }, ...AI_TOOLS.map(([id, e, label]) => h('button', { class: 'ds-rail-btn' + (aiTool === id ? ' on' : ''), disabled: !photo, onclick: () => { aiTool = aiTool === id ? null : id; sel = null; place = null; drawPanel(); drawViewer(); } }, h('span', { class: 'ds-rail-e' }, e), h('span', null, label)))),
				!photo ? h('p', { class: 'ds-hint' }, 'Choose a photo first.') : null);
			return;
		}
		const note = railTab === 'select' ? 'Free · highlights it, then choose what to do' : '1 AI credit each · only that one thing changes';
		const list = h('div', { class: 'ds-rail-list' }, ...lists[railTab].map((t) => h('button', {
			class: 'ds-rail-btn' + ((sel && sel.id === t[0] && railTab === 'select') || (place && place.id === t[0] && railTab === 'add') ? ' on' : ''),
			disabled: off, title: `${railTab === 'select' ? 'Select' : railTab === 'remove' ? 'Remove' : 'Add'} ${t[1].toLowerCase()}`,
			onclick: () => (railTab === 'select' ? doSelect(t) : railTab === 'remove' ? doRemove(t) : startAdd(t))
		}, h('span', { class: 'ds-rail-e' }, t[2]), h('span', null, (railTab === 'select' ? 'Select ' : railTab === 'remove' ? 'Remove ' : 'Add ') + t[1].toLowerCase()))));
		put(rail, h('div', { class: 'ds-rail-head' }, h('b', null, 'One-click tools'), h('small', null, note)), tabBar, list,
			!photo ? h('p', { class: 'ds-hint' }, 'Choose a photo first.') : null);
	}

	async function needSegment() {
		if (!session.user) { await openAuth({ reason: 'Sign in to use the AI tools — selecting is free.' }); drawPanel(); return false; }
		if (!session.ai.segment) { toast('Smart selecting isn’t switched on yet.'); return false; }
		return true;
	}
	async function find(what, label) {
		const src = curSrc();
		const [W, H] = dims(src);
		setBusy(true, `Finding the ${label.toLowerCase()}…`);
		try { return { mask: await segment(src, what, W, H), W, H }; } finally { setBusy(false); }
	}

	async function doSelect(t) {
		if (!(await needSegment())) return;
		place = null; region = null;
		const [id, label, , what, ideas] = t;
		try {
			const r = await find(what, label);
			if (!r.mask) { sel = null; toast(`Couldn’t find a ${label.toLowerCase()} in this picture.`, 4000); }
			else { sel = { id, label, what: what.split(' ')[0] === 'lawn' ? 'lawn' : label.toLowerCase(), ideas, ...r }; compareX = 0; }
		} catch (e) { toast(e.message, 5000); }
		drawViewer(); drawPanel();
	}

	function selectionUI() {
		const custom = h('input', { type: 'text', placeholder: `Or type what the ${sel.label.toLowerCase()} should become…` });
		const go = (text) => { if (text && text.length > 2) replaceSel(text); };
		custom.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(custom.value.trim()); });
		return h('section', { class: 'ds-ss ds-ss-sel' },
			h('h4', null, '🎯 ', sel.label, ' selected'),
			h('p', { class: 'ds-hint' }, 'It’s highlighted in pink. What would you like to do with it? Each choice is one AI change (1 credit) — only the pink area changes.'),
			h('div', { class: 'ds-grid2' },
				h('button', { class: 'ds-btn', disabled: busy, onclick: () => removeSel() }, icon('trash', 16), ' Remove it'),
				h('button', { class: 'ds-btn ds-ghost', disabled: busy, onclick: () => improveSel() }, icon('sparkle', 16), ' Make it look better')),
			h('p', { class: 'ds-label' }, 'Replace it with…'),
			h('div', { class: 'ds-chips' }, ...sel.ideas.map((x) => h('button', { class: 'ds-chip', disabled: busy, onclick: () => replaceSel(x) }, x))),
			h('div', { class: 'ds-row ds-talkline' }, voiceButton(custom, { raw: true, label: 'Say what it should become', listening: 'Listening…', onError: toast }), custom, h('button', { class: 'ds-btn', disabled: busy, onclick: () => go(custom.value.trim()) }, 'Go')),
			h('button', { class: 'ds-link', onclick: () => { sel = null; drawViewer(); drawPanel(); } }, 'Clear selection'));
	}

	/** Pink outline just outside the area so the AI knows where; we paste back only inside it. */
	function outlined(src, m, W, H) {
		const r1 = Math.round(Math.max(W, H) * 0.006), r2 = Math.max(3, Math.round(Math.max(W, H) * 0.004));
		const inner = dilateMask(m, W, H, r1), outer = dilateMask(m, W, H, r1 + r2);
		const c = toCanvas(src, 0, W, H), x = c.getContext('2d');
		const d = x.getImageData(0, 0, W, H);
		for (let k = 0, i = 0; k < m.length; k++, i += 4) if (outer[k] && !inner[k]) { d.data[i] = 255; d.data[i + 1] = 47; d.data[i + 2] = 160; }
		x.putImageData(d, 0, 0);
		return { img: c, paste: inner };
	}

	async function oneEdit(label, what, run1) {
		if (!(await guard(what))) return;
		const src = curSrc();
		const [W, H] = dims(src);
		setBusy(true, label + '…');
		try {
			const out = await run1(src, W, H);
			if (!out) { setBusy(false); return; }
			await addVersion(await loadImage(out.toDataURL('image/jpeg', 0.93)), await canvasToBlob(out, 'image/jpeg', 0.93), what, what, run.cur);
			mode = 'perfect';
			sel = null; place = null; region = null;
			compareX = 0.5;
			toast(`${what} — done! Tap History or Undo to step back.`, 3500);
		} catch (e) { toast(e.message, 5000); }
		setBusy(false);
		drawViewer();
	}
	const pasteBack = (src, result, m, W, H, feather) => compositeMasked(toCanvas(src, 0, W, H), toCanvas(result, 0, W, H), m, feather);

	async function doRemove(t) {
		const [, label, , what, fill] = t;
		place = null; region = null; sel = null;
		let m = null;
		if (session.user && session.ai.segment) {
			try { m = (await find(what, label)).mask; } catch (e) { toast(e.message); return; }
			if (!m) { toast(`Couldn’t find a ${label.toLowerCase()} in this picture — no credit used. Try “Fix just one area” and paint it instead.`, 5000); drawPanel(); return; }
			const src = curSrc(); const [W, H] = dims(src);
			sel = { id: t[0], label, what: label.toLowerCase(), ideas: [], mask: m, W, H };
			drawViewer();
		}
		await oneEdit('Removing the ' + label.toLowerCase(), 'Removed ' + label.toLowerCase(), async (src, W, H) => {
			const r = await runEdit({ image: src, prompt: removePrompt(label.toLowerCase(), fill), mode: 'tool' });
			if (!m) return toCanvas(r.img, 0, W, H);
			const grow = Math.round(Math.max(W, H) * 0.012);
			return pasteBack(src, r.img, dilateMask(m, W, H, grow), W, H, Math.max(3, grow * 0.6));
		});
		sel = null; drawViewer(); drawPanel();
	}
	function removeSel() {
		const s0 = sel;
		return oneEdit('Removing the ' + s0.label.toLowerCase(), 'Removed ' + s0.label.toLowerCase(), async (src, W, H) => {
			const fill = (REMOVE.find((x) => x[0] === s0.id) || [])[4] || 'whatever would naturally be there';
			const r = await runEdit({ image: src, prompt: removePrompt(s0.label.toLowerCase(), fill), mode: 'tool' });
			const grow = Math.round(Math.max(W, H) * 0.012);
			return pasteBack(src, r.img, dilateMask(s0.mask, W, H, grow), W, H, Math.max(3, grow * 0.6));
		});
	}
	function replaceSel(withThis) {
		const s0 = sel;
		return oneEdit('Changing the ' + s0.label.toLowerCase(), `${s0.label} → ${withThis}`, async (src, W, H) => {
			const o = outlined(src, s0.mask, W, H);
			const r = await runEdit({ image: o.img, prompt: replacePrompt(s0.label.toLowerCase(), withThis), mode: 'tool' });
			return pasteBack(src, r.img, o.paste, W, H, Math.round(Math.max(W, H) * 0.003));
		});
	}
	function improveSel() {
		const s0 = sel;
		return oneEdit('Improving the ' + s0.label.toLowerCase(), 'Improved ' + s0.label.toLowerCase(), async (src, W, H) => {
			const o = outlined(src, s0.mask, W, H);
			const r = await runEdit({ image: o.img, prompt: improvePrompt(s0.label.toLowerCase()), mode: 'tool' });
			return pasteBack(src, r.img, o.paste, W, H, Math.round(Math.max(W, H) * 0.003));
		});
	}

	function startAdd(t) {
		const [id, label, , def, ideas] = t;
		sel = null;
		place = { id, label, def, ideas, detail: '' };
		region = { size: 0.03 };
		compareX = 0;
		drawViewer(); drawPanel();
	}
	function addUI() {
		const custom = h('input', { type: 'text', placeholder: `Describe the ${place.label.toLowerCase()} (optional)…`, value: place.detail && !place.ideas.includes(place.detail) ? place.detail : '' });
		custom.addEventListener('input', () => { place.detail = custom.value.trim(); });
		const sz = h('input', { type: 'range', min: 0.01, max: 0.08, step: 0.002, value: region ? region.size : 0.03, oninput: () => { if (region) region.size = +sz.value; } });
		const painted = !!(region && region.dirty);
		return h('section', { class: 'ds-ss ds-ss-sel' },
			h('h4', null, '➕ Add ', place.label.toLowerCase()),
			h('ol', { class: 'ds-steps-mini' },
				h('li', null, h('b', null, 'Paint where it should go'), ' on the picture (pink). Skip this and the AI picks a natural spot.'),
				h('li', null, h('b', null, 'Pick a type'), ' — or describe it.'),
				h('li', null, h('b', null, 'Tap Add it'), ' (1 AI credit). Only that spot changes.')),
			h('label', { class: 'ds-slider' }, h('span', null, 'Brush size'), sz),
			h('div', { class: 'ds-chips' }, ...place.ideas.map((x) => h('button', { class: 'ds-chip' + (place.detail === x ? ' on' : ''), onclick: () => { place.detail = place.detail === x ? '' : x; drawPanel(); } }, x))),
			h('div', { class: 'ds-row ds-talkline' }, voiceButton(custom, { raw: true, label: 'Describe it', listening: 'Listening…', onError: toast }), custom),
			h('div', { class: 'ds-row ds-wrap' },
				h('button', { class: 'ds-btn', disabled: busy, onclick: () => runAdd() }, icon('sparkle', 16), painted ? ' Add it here' : ' Add it'),
				painted ? h('button', { class: 'ds-btn ds-ghost', onclick: () => { region.mask = null; region.dirty = false; drawViewer(); drawPanel(); } }, 'Clear paint') : null,
				h('button', { class: 'ds-btn ds-ghost', onclick: () => { place = null; region = null; drawViewer(); drawPanel(); } }, 'Cancel')));
	}
	function runAdd() {
		const p0 = place, r0 = region;
		const detail = p0.detail ? (p0.ideas.includes(p0.detail) ? `${p0.detail} ${p0.label.toLowerCase().replace('ornamental ', '')}`.replace(/(\w+) \1$/, '$1') : p0.detail) : p0.def;
		const thing = /^(a|an|the|some)\b/i.test(detail) || /s$/.test(detail) ? detail : 'a ' + detail;
		return oneEdit('Adding ' + thing, 'Added ' + detail.replace(/^(a|an|some|the) /i, ''), async (src, W, H) => {
			let m = null;
			if (r0 && r0.dirty && r0.mask) {
				const mc = canvas(W, H); mc.getContext('2d').drawImage(r0.mask, 0, 0, W, H);
				const d = mc.getContext('2d').getImageData(0, 0, W, H).data;
				m = new Uint8Array(W * H);
				for (let k = 0, i = 3; k < m.length; k++, i += 4) m[k] = d[i] > 20 ? 1 : 0;
			}
			if (!m) { const r = await runEdit({ image: src, prompt: addPrompt(thing, false), mode: 'tool' }); return toCanvas(r.img, 0, W, H); }
			const o = outlined(src, m, W, H);
			const r = await runEdit({ image: o.img, prompt: addPrompt(thing, true), mode: 'tool' });
			// let the new thing (and its shadow) spill a little past the painted area
			const grow = Math.round(Math.max(W, H) * 0.02);
			return pasteBack(src, r.img, dilateMask(o.paste, W, H, grow), W, H, Math.round(grow * 0.5));
		});
	}

	/* ------------------------------------------------------------- history */
	function toggleHist() {
		if (hist) { hist.close(); return; }
		hist = historyPanel({
			title: 'AI history', start: 'Original photo',
			startThumb: () => (photo ? srcOf(photo) : null),
			steps: () => run.versions.map((v, i) => ({ label: v.label || (i === 0 ? 'Original AI' : 'Version ' + (i + 1)), icon: 'sparkle', t: v.at, thumb: verImgs.get(i) ? srcOf(verImgs.get(i)) : null })),
			current: () => run.cur + 1,
			goTo: (n) => { run.cur = n - 1; sel = null; place = null; region = null; save(); ensureVer(run.cur).then(() => { drawViewer(); drawPanel(); }); },
			note: 'Every AI change is kept as its own step. Tap a step to go back to it — your next change starts from the picture you’re looking at. Nothing is regenerated, and going back is free.',
			onClose: () => { hist = null; histBtn.classList.remove('on'); }
		});
		histBtn.classList.add('on');
		svCol.append(hist.el);
	}

	/* ------------------------------------------------------- generation */
	async function guard(what = 'This AI change') {
		if (busy) return false;
		if (!session.user) { await openAuth({ reason: 'Sign in to use Dreamscape AI.' }); drawPanel(); return false; }
		if (!session.ai.enabled) { toast('Dreamscape AI isn’t switched on yet.'); return false; }
		if (!session.ai.unlimited && session.ai.left <= 0) { openCredits(`You’ve used today’s ${session.ai.limit} free AI credits. They refill tomorrow — or add more now. Your designs are saved either way.`); return false; }
		return confirmCredit(what);
	}
	/* ----------------------------------------------------- AI design assistant */
	const keepList = () => { const k = S.goals.keep; return k instanceof Set ? [...k] : []; };
	async function thinking(btn, label, fn) {
		if (!session.user) { await openAuth({ reason: 'Sign in to use Dreamscape AI.' }); return; }
		btn.disabled = true;
		const t = btn.innerHTML;
		btn.innerHTML = '';
		btn.append(h('span', { class: 'ds-spin ds-spin-sm' }), ' ' + label);
		try { await fn(); } catch (e) { toast(e.message, 5000); }
		btn.disabled = false;
		btn.innerHTML = t;
	}
	/** Make one picture from an instruction: a small change edits the current version, a full design starts from the photo. */
	async function makeFrom(instruction, label, small) {
		if (small && run.cur >= 0) return tweak(instruction, label);
		if (!(await guard(label))) return;
		setBusy(true, 'Designing…');
		try {
			const r = await runEdit({ image: photo, prompt: instruction, mode: 'dream', summary: label, lead: true, onProgress: (t) => { progress.querySelector('b').textContent = t; } });
			await addVersion(r.img, r.blob, instruction, label.slice(0, 40), -1);
			mode = 'perfect';
			toast('Done! Drag the slider to compare.');
		} catch (e) { toast(e.message, 5000); }
		setBusy(false);
		drawViewer();
	}
	function aiToolUI() {
		const sec = h('section', { class: 'ds-ss ds-aitool' });
		const head = AI_TOOLS.find((x) => x[0] === aiTool);
		put(sec, h('div', { class: 'ds-row ds-between' }, h('h4', null, head[1] + ' ' + head[2]), h('button', { class: 'ds-icon-btn', 'aria-label': 'Close', onclick: () => { aiTool = null; drawPanel(); } }, icon('close', 18))));
		const cur = run.cur >= 0 ? verImgs.get(run.cur) : null;
		const left = session.ai.unlimited ? '' : ` · ${session.ai.left} left today`;
		if (aiTool === 'ask') {
			const ta = h('textarea', { rows: 3, placeholder: 'Ask in your own words… e.g. “Make this backyard better for entertaining”' }, asked ? asked.request : '');
			const mic = voiceButton(ta, { raw: true, append: true, label: 'Tap and talk', listening: 'Listening…', onError: toast });
			const go = h('button', { class: 'ds-btn' }, icon('sparkle', 16), ' Ask');
			go.onclick = () => thinking(go, 'Thinking…', async () => {
				const q = ta.value.trim();
				if (q.length < 4) { toast('Tell DreamScaper what you’d like.'); return; }
				const r = await api('ai/ask', { body: { request: q, image: toJpeg(cur || photo, 1024, 0.86), aerial: run.aerial, keep: keepList() } });
				asked = { request: q, ...r };
				drawPanel();
			});
			put(sec, h('p', { class: 'ds-hint' }, 'Describe what you want in plain words. DreamScaper turns it into exact design instructions for your photo — you see them before anything is made.'),
				h('div', { class: 'ds-chips ds-chips-sm' }, ...ASK_EXAMPLES.map((x) => h('button', { class: 'ds-chip', onclick: () => { ta.value = x; } }, x))),
				h('div', { class: 'ds-talk' }, mic ? h('div', { class: 'ds-talk-mic' }, mic) : null, ta), go);
			if (asked) {
				const ins = h('textarea', { rows: 4, class: 'ds-prompt' }, asked.instruction);
				put(sec, h('div', { class: 'ds-ai-answer' },
					h('p', null, asked.explain), asked.note ? h('p', { class: 'ds-hint' }, 'ℹ️ ' + asked.note) : null,
					h('details', null, h('summary', null, 'The exact instructions (you can edit them)'), ins),
					h('button', { class: 'ds-btn ds-wide', disabled: busy, onclick: () => makeFrom(ins.value.trim(), asked.request, asked.scope === 'small') }, icon('sparkle', 16), asked.scope === 'small' && cur ? ` Make this change (1 credit${left})` : ` Create this design (1 credit${left})`)));
			}
		} else if (aiTool === 'ideas' || aiTool === 'analyze') {
			const go = h('button', { class: 'ds-btn' }, icon('sparkle', 16), analysis ? ' Look again' : aiTool === 'ideas' ? ' Give me ideas (free)' : ' Analyze my landscape (free)');
			go.onclick = () => thinking(go, 'Looking at your yard…', async () => { analysis = await api('ai/analyze', { body: { image: toJpeg(photo, 1280, 0.86) } }); drawPanel(); });
			put(sec, h('p', { class: 'ds-hint' }, aiTool === 'ideas' ? 'AI looks at your photo and suggests the improvements that would make the biggest difference. Tap “Try it” to see one.' : 'A full check of your yard: curb appeal, privacy, planting, hardscape, lighting, drainage, erosion, underused areas and maintenance — only what it can actually see.'), go);
			if (analysis) {
				const cats = [...new Set(analysis.items.map((x) => x.cat))];
				const items = aiTool === 'ideas' ? analysis.items.slice(0, 5) : analysis.items.filter((x) => !ideaCat || x.cat === ideaCat);
				put(sec, h('p', null, analysis.summary),
					aiTool === 'analyze' ? h('div', { class: 'ds-chips ds-chips-sm' }, h('button', { class: 'ds-chip' + (!ideaCat ? ' on' : ''), onclick: () => { ideaCat = ''; drawPanel(); } }, 'All'), ...cats.map((cid) => h('button', { class: 'ds-chip' + (ideaCat === cid ? ' on' : ''), onclick: () => { ideaCat = cid; drawPanel(); } }, analysis.items.find((x) => x.cat === cid).label))) : null,
					...items.map((it) => h('div', { class: 'ds-idea' },
						h('div', { class: 'ds-row ds-between' }, h('b', null, it.title), h('small', { class: 'ds-qs' }, it.label + ' · ' + ['', 'Do first', 'Worth it', 'Nice to have'][it.priority])),
						it.seen ? h('small', { class: 'ds-muted' }, '👀 ' + it.seen) : null,
						h('p', null, it.why),
						h('button', { class: 'ds-btn ds-ghost ds-sm', disabled: busy, onclick: () => makeFrom(it.idea, it.title, !!cur) }, icon('sparkle', 14), cur ? ' Try it on this design (1 credit)' : ' Try it (1 credit)'))));
			}
		} else if (aiTool === 'style') {
			put(sec, h('p', { class: 'ds-hint' }, 'See your yard in a completely different style. Starts from your original photo; your house stays the same.'),
				h('div', { class: 'ds-chips' }, ...STYLES.map(([id, label]) => h('button', { class: 'ds-chip' + (styleId === id ? ' on' : ''), onclick: () => { styleId = id; drawPanel(); } }, label))),
				h('button', { class: 'ds-btn ds-wide', disabled: busy, onclick: () => makeFrom(stylePrompt(styleId, run.aerial), STYLES.find((x) => x[0] === styleId)[1] + ' style', false) }, icon('sparkle', 16), ` Show it in this style (1 credit${left})`));
		} else if (aiTool === 'variations') {
			const prompt = (run.versions[run.cur] && run.versions[run.cur].prompt) || S.custom || buildPrompt({ ...S, aerial: run.aerial });
			put(sec, h('p', { class: 'ds-hint' }, 'Same instructions, different results — pick the one you love. Each variation is its own version you can compare and keep.'),
				h('div', { class: 'ds-seg ds-seg-full' }, ...[2, 3, 4].map((n) => h('button', { class: varN === n ? 'on' : '', onclick: () => { varN = n; drawPanel(); } }, n + ' variations'))),
				h('button', { class: 'ds-btn ds-wide', disabled: busy, onclick: async () => {
					if (!session.ai.unlimited && session.ai.left < varN) { toast(`That needs ${varN} credits — you have ${session.ai.left} left today.`); return; }
					if (!(await guard(`${varN} variations`))) return;
					setBusy(true, `Creating ${varN} variations…`);
					for (let k = 1; k <= varN; k++) {
						try {
							progress.querySelector('b').textContent = `Variation ${k} of ${varN}…`;
							const r = await runEdit({ image: photo, refs: refImgs, prompt, mode: 'dream', summary: 'Variation', lead: k === 1, seed: Math.floor(Math.random() * 2 ** 31) });
							await addVersion(r.img, r.blob, prompt, `Variation ${k}`, -1);
						} catch (e) { toast(e.message, 5000); break; }
					}
					mode = 'perfect';
					setBusy(false);
					drawViewer();
				} }, icon('sparkle', 16), ` Create ${varN} variations (${varN} credits)`));
		} else if (aiTool === 'similar') {
			put(sec, h('p', { class: 'ds-hint' }, cur ? 'Love this one? Get another design with the same style, plants and colors — but a fresh layout.' : 'Make or pick a design first, then generate more like it.'),
				h('button', { class: 'ds-btn ds-wide', disabled: busy || !cur, onclick: async () => {
					if (!(await guard('A similar design'))) return;
					setBusy(true, 'Creating a similar design…');
					try {
						const prompt = `Redesign the landscaping in image 1 in the same landscape style, plant palette, materials and colors as the design in image 2, but with a fresh, different layout that suits image 1. ${KEEP_TEXT}. Realistic professional landscape photograph.`;
						const r = await runEdit({ image: photo, refs: [cur], prompt, mode: 'dream', summary: 'Similar design', lead: false });
						await addVersion(r.img, r.blob, prompt, 'Similar design', -1);
						toast('Here’s a similar design. Compare them with the thumbnails.');
					} catch (e) { toast(e.message, 5000); }
					setBusy(false);
					drawViewer();
				} }, icon('sparkle', 16), ` Generate similar (1 credit${left})`));
		} else if (aiTool === 'keep') {
			const grp = (gid) => { const g = GOAL_GROUPS.find((x) => x.id === gid); return h('div', { class: 'ds-chips' }, ...g.items.map(([id, label]) => { const set = S.goals[gid] instanceof Set ? S.goals[gid] : null; const on = !!(set && set.has(id)); return h('button', { class: 'ds-chip' + (on ? ' on' : ''), 'aria-pressed': String(on), onclick: () => { const st = S.goals[gid] instanceof Set ? S.goals[gid] : (S.goals[gid] = new Set()); on ? st.delete(id) : st.add(id); save(); drawPanel(); } }, label); })); };
			put(sec, h('p', { class: 'ds-hint' }, 'Tell the AI what it must leave alone and what it may redesign. The house, roof, driveway and camera angle are always kept. Used by every design you make from now on.'),
				h('h5', null, '🔒 Must keep'), grp('keep'), h('h5', null, '✏️ Free to change'), grp('change'));
		} else if (aiTool === 'explain') {
			const go = h('button', { class: 'ds-btn', disabled: !cur }, icon('sparkle', 16), explained ? ' Explain again' : ' Explain this design (free)');
			go.onclick = () => thinking(go, 'Studying the design…', async () => { explained = await api('ai/explain', { body: { before: toJpeg(photo, 1024, 0.85), after: toJpeg(cur, 1024, 0.85), instructions: (run.versions[run.cur] || {}).prompt || '' } }); drawPanel(); });
			put(sec, h('p', { class: 'ds-hint' }, cur ? 'A landscape designer’s explanation of what changed and why it works — handy before you talk to a contractor.' : 'Create or pick a design first.'), go);
			if (explained) put(sec, h('div', { class: 'ds-ai-answer' }, h('p', null, explained.summary),
				...explained.points.map((x) => h('div', { class: 'ds-idea' }, h('b', null, x.title), h('p', null, x.why))),
				explained.notes.length ? h('div', null, h('h5', null, 'Good to know'), h('ul', null, ...explained.notes.map((n) => h('li', null, n)))) : null));
		}
		return sec;
	}

	function setBusy(b, text) {
		busy = b;
		progress.hidden = !b;
		if (text) progress.querySelector('b').textContent = text;
		wrap.classList.toggle('busy', b);
		drawPanel();
	}
	async function addVersion(img, blob, prompt, label, from) {
		const id = await store.putBlob(blob);
		run.versions.push({ blob: id, prompt, label, from, at: Date.now() });
		run.cur = run.versions.length - 1;
		verImgs.set(run.cur, img);
		save();
	}

	async function generate(again = false) {
		if (!(await guard(again ? 'Another full design' : 'Creating your full AI design'))) return;
		if (!photo) return toast('Choose a photo first.');
		const prompt = S.custom || buildPrompt({ ...S, aerial: run.aerial });
		setBusy(true, again ? 'Creating another version…' : 'Creating your dream yard…');
		try {
			const r = await runEdit({ image: photo, refs: refImgs, prompt, mode: 'dream', summary: summarize(S), lead: true, onProgress: (t) => { progress.querySelector('b').textContent = t; } });
			await addVersion(r.img, r.blob, prompt, again ? 'Another version' : 'Original AI', -1);
			mode = 'perfect';
			compareX = 0.5;
			toast(run.versions.length === 1 ? 'Here’s your dream yard! Drag the slider to compare.' : 'New version added.');
		} catch (e) { toast(e.message, 5000); }
		setBusy(false);
		drawViewer();
	}

	async function tweak(text, label) {
		if (!(await guard('“' + label + '”'))) return;
		const src = verImgs.get(run.cur);
		if (!src) return;
		setBusy(true, 'Making that change…');
		try {
			const r = await runEdit({ image: src, prompt: tweakPrompt(text, run.aerial), mode: 'tweak' });
			// keep the exact framing of the version we started from
			const fitted = toCanvas(r.img, 0, src.naturalWidth || src.width, src.naturalHeight || src.height);
			await addVersion(await loadImage(fitted.toDataURL('image/jpeg', 0.93)), await canvasToBlob(fitted, 'image/jpeg', 0.93), text, label, run.cur);
			toast('Done! Not quite right? Tap Undo.');
		} catch (e) { toast(e.message, 5000); }
		setBusy(false);
		drawViewer();
	}

	async function fixArea(text) {
		if (!(await guard('Changing one area'))) return;
		const src = verImgs.get(run.cur);
		if (!src || !region || !region.mask) return;
		setBusy(true, 'Changing that area…');
		try {
			const r = await runEdit({ image: src, prompt: regionPrompt(text), mode: 'tweak' });
			const base = toCanvas(src);
			const W = base.width, H = base.height;
			const mc = canvas(W, H); mc.getContext('2d').drawImage(region.mask, 0, 0, W, H);
			const d = mc.getContext('2d').getImageData(0, 0, W, H).data;
			const m = new Uint8Array(W * H);
			for (let k = 0, i = 3; k < m.length; k++, i += 4) m[k] = d[i] > 20 ? 1 : 0;
			const out = compositeMasked(base, r.img, m, Math.round(Math.max(W, H) * 0.008));
			await addVersion(await loadImage(out.toDataURL('image/jpeg', 0.93)), await canvasToBlob(out, 'image/jpeg', 0.93), text, 'Area: ' + text, run.cur);
			region = null;
			toast('Changed just that area. Undo anytime.');
		} catch (e) { toast(e.message, 5000); }
		setBusy(false);
		drawViewer();
	}

	async function download(img) {
		const c = toCanvas(img);
		const blob = await canvasToBlob(c, 'image/jpeg', 0.92);
		const a = h('a', { href: URL.createObjectURL(blob), download: `${(opts.title || 'Dreamscape AI').replace(/[^\w\- ]+/g, '')}.jpg` });
		document.body.append(a); a.click(); a.remove();
		toast('Saved to your downloads.');
	}

	/* ------------------------------------------------------------- start */
	(async () => {
		if (run.input) {
			const b = await store.getBlob(run.input);
			if (b) photo = await blobToBitmap(b);
			for (const r of S.refs) { const rb = r.blob && await store.getBlob(r.blob); refImgs.push(rb ? toCanvas(await blobToBitmap(rb)) : canvas(8, 8)); }
			if (run.cur >= 0) await ensureVer(run.cur);
		} else if (opts.image) await setPhoto(opts.image, opts.aerial);
		if (opts.prefill) {
			if (opts.prefill.words) S.words = opts.prefill.words;
			for (const c of (opts.prefill.refs || []).slice(0, 3 - S.refs.length)) {
				const rc = toCanvas(c, 1024);
				refImgs.push(rc);
				S.refs.push({ role: 'style', note: '', blob: await store.putBlob(await canvasToBlob(rc, 'image/jpeg', 0.88)) });
			}
			save();
			if (opts.prefill.words || (opts.prefill.refs || []).length) toast('Your inspiration is loaded — choose your yard photo, then press Create.', 5000);
		}
		drawViewer();
		drawPanel();
		maybeTour('ai');
	})();
	return { close: done };
}

/* ------------------------------------------------------------- helpers */
const urlCache = new WeakMap();
function srcOf(img) {
	if (img.src) return img.src;
	if (urlCache.has(img)) return urlCache.get(img);
	const u = toCanvas(img, 1600).toDataURL('image/jpeg', 0.9);
	urlCache.set(img, u);
	return u;
}
export function toCanvas(img, max = 0, W = 0, H = 0) {
	const w = img.naturalWidth || img.width, hh = img.naturalHeight || img.height;
	let k = max ? Math.min(1, max / Math.max(w, hh)) : 1;
	const c = canvas(W || w * k, H || hh * k);
	const x = c.getContext('2d');
	x.imageSmoothingQuality = 'high';
	x.drawImage(img, 0, 0, c.width, c.height);
	return c;
}
function freeze(S) { return JSON.parse(JSON.stringify(S, (k, v) => (v instanceof Set ? { __set: [...v] } : v))); }
function revive(p) {
	const S = JSON.parse(JSON.stringify(p), (k, v) => (v && v.__set ? new Set(v.__set) : v));
	S.ideas = S.ideas || {}; S.goals = S.goals || {}; S.refs = S.refs || []; S.words = S.words || '';
	return S;
}

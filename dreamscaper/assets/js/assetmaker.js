/* DreamScaper – "Snap a feature": turn a photo of a plant or garden feature the
 * customer likes into their own reusable library asset.
 * 1) photo  2) automatic cut-out with keep/remove brushes, box and ground line
 * 3) we suggest what it is (no AI: colours + shape) and they confirm the name,
 *    size and category  4) saved as a small transparent WebP in "My Library".
 */
import { h, icon, canvas, clamp, uid, canvasToBlob, debounce } from './util.js?v=2.6.0';
import { ALL, byId, CATEGORIES, fmtFt, matchesWords, COLOR_SWATCH } from './library.js?v=2.6.0';
import { thumb } from './sprites.js?v=2.6.0';
import { prepareCutout, defaultBox, segment, paintHint, renderCutout, analyse, guessCategory } from './cutout.js?v=2.6.0';
import { encodeCutout } from './photo.js?v=2.6.0';
import { voiceButton, clean } from './voice.js?v=2.6.0';

const CAT_DEFAULT_H = { trees: 20, evergreens: 12, shrubs: 4, perennials: 2, grasses: 3, annuals: 1.2, vines: 8, features: 3 };
const FEATURE_GROUPS = ['Stone', 'Seating', 'Fire', 'Water', 'Lighting', 'Planters', 'Structures', 'Fences & Walls', 'Decor', 'Outdoor Living', 'My photos'];

/**
 * Open the asset maker. opts: { store, toast, onSaved(rec), rec (edit existing), getBlob }
 */
export function openAssetMaker(root, opts) {
	const { store, toast } = opts;
	const ui = {};
	const wrap = h('div', { class: 'ds-am', role: 'dialog', 'aria-label': 'Create a library asset from a photo' });
	const steps = ['Photo', 'Cut out', 'Details'];
	const stepper = h('ol', { class: 'ds-am-steps' }, ...steps.map((s, i) => h('li', { 'data-i': i }, h('b', null, String(i + 1)), h('span', null, s))));
	const close = h('button', { class: 'ds-icon-btn', 'aria-label': 'Close', onclick: () => done() }, icon('close'));
	const body = h('div', { class: 'ds-am-body' });
	wrap.append(h('header', { class: 'ds-am-head' }, h('h3', null, opts.rec ? 'Edit my asset' : opts.extract ? 'Extract an asset' : 'Create a new asset'), stepper, close), body);
	root.append(wrap);
	const onKey = (e) => { if (e.key === 'Escape') done(); };
	document.addEventListener('keydown', onKey);
	let st = null, img = null, original = null, cut = null, ana = null;
	function done() { document.removeEventListener('keydown', onKey); window.removeEventListener('resize', fitStage); wrap.remove(); }
	const setStep = (i) => stepper.querySelectorAll('li').forEach((li) => { li.classList.toggle('on', +li.dataset.i === i); li.classList.toggle('done', +li.dataset.i < i); });

	/* ------------------------------------------------------------ 1. photo */
	function stepPhoto() {
		setStep(0);
		body.innerHTML = '';
		const take = fileInput(true), choose = fileInput(false);
		if (opts.extract) {
			body.append(h('div', { class: 'ds-am-start' },
				h('div', { class: 'ds-am-hero' }, icon('crop', 40)),
				h('h4', null, 'Pull one thing out of a photo you already have'),
				h('p', { class: 'ds-muted' }, 'Pick a photo — your own yard, one of your Dreamscapes, or any garden picture — then box or name the plant, planter, bench or boulder you want. We cut just that out and save it to My Library, ready to drop into any design.'),
				h('div', { class: 'ds-am-btns' },
					h('button', { class: 'ds-btn ds-lg', onclick: () => choose.click() }, icon('image', 20), ' Choose a photo'),
					opts.pickDesign ? h('button', { class: 'ds-btn ds-ghost ds-lg', onclick: async () => { const b = await opts.pickDesign(); if (!b) return; try { await loadPhoto(b); stepCut(); } catch (e) { toast('That picture couldn’t be opened.'); } } }, icon('folder', 20), ' From my Dreamscapes') : null,
					h('button', { class: 'ds-btn ds-ghost ds-lg', onclick: () => take.click() }, icon('camera', 20), ' Take a photo')),
				h('ul', { class: 'ds-am-tips' },
					h('li', null, 'Works best when the thing you want isn’t hidden behind something else.'),
					h('li', null, 'After choosing, drag a box around it — or just type its name and we’ll find it.'),
					h('li', null, 'You can touch up the edges with Keep and Remove brushes.')),
				take, choose));
			return;
		}
		body.append(h('div', { class: 'ds-am-start' },
			h('div', { class: 'ds-am-hero' }, icon('camera', 40)),
			h('h4', null, 'Saw something you love?'),
			h('p', { class: 'ds-muted' }, 'Snap a plant, planter, bench, boulder or fountain anywhere — a nursery, a park, a neighbor’s yard. We’ll cut it out and add it to your library so you can drop it into any design.'),
			h('div', { class: 'ds-am-btns' },
				h('button', { class: 'ds-btn ds-lg', onclick: () => take.click() }, icon('camera', 20), ' Take a photo'),
				h('button', { class: 'ds-btn ds-ghost ds-lg', onclick: () => choose.click() }, icon('image', 20), ' Choose a photo')),
			h('ul', { class: 'ds-am-tips' },
				h('li', null, 'Step back so the whole thing fits, from the ground to the top.'),
				h('li', null, 'Shoot from the side at about waist height, not from above.'),
				h('li', null, 'A plain background (sky, lawn, a wall) gives the cleanest cut-out.'),
				h('li', null, 'Photograph plants in bloom if you can — we hide the flowers out of season.')),
			take, choose));
	}
	function fileInput(cam) {
		const inp = h('input', { type: 'file', accept: 'image/*', hidden: true });
		if (cam) inp.setAttribute('capture', 'environment');
		inp.addEventListener('change', async () => {
			const f = inp.files && inp.files[0];
			inp.value = '';
			if (!f) return;
			try { await loadPhoto(f); stepCut(); } catch (e) { toast('That photo couldn’t be opened. Try a JPG or PNG.'); }
		});
		return inp;
	}
	async function loadPhoto(blob) {
		const url = URL.createObjectURL(blob);
		const im = new Image();
		im.src = url;
		await im.decode();
		// keep a reasonably sized original (for re-cutting later)
		const k = Math.min(1, 1400 / Math.max(im.naturalWidth, im.naturalHeight));
		const c = canvas(Math.round(im.naturalWidth * k), Math.round(im.naturalHeight * k));
		c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
		URL.revokeObjectURL(url);
		img = c;
		original = null;
		st = prepareCutout(img);
	}

	/* --------------------------------------------------------- 2. cut out */
	let stage = null, view = null, tool = 'keep', brush = 14, box = null, groundY = null, history = [], showCut = false;
	function stepCut() {
		setStep(1);
		body.innerHTML = '';
		box = st.box || defaultBox(st);
		groundY = st.groundY ?? null;
		history = [];
		if (opts.extract && !st.box) tool = 'box';
		view = canvas(10, 10);
		view.className = 'ds-am-canvas';
		stage = h('div', { class: 'ds-am-stage' }, view);
		const toolBtns = [['keep', 'Keep', 'brush'], ['remove', 'Remove', 'eraser'], ['box', 'Box', 'crop'], ['ground', 'Ground', 'minus']];
		const seg = h('div', { class: 'ds-seg ds-seg-full ds-am-tools' }, ...toolBtns.map(([k, n, ic]) => h('button', { class: k === tool ? 'on' : '', 'data-t': k, onclick: (e) => { tool = k; seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.currentTarget)); hint.textContent = HINTS[k]; } }, icon(ic, 16), ' ', n)));
		const HINTS = {
			keep: 'Brush over parts that got cut off (branches, flowers, the pot).',
			remove: 'Brush over background that’s still showing (lawn, fence, sky).',
			box: 'Drag a box tightly around the thing you want.',
			ground: 'Drag to where it meets the ground. Everything below is removed.'
		};
		const hint = h('p', { class: 'ds-hint' }, HINTS[tool]);
		const size = h('input', { type: 'range', min: 4, max: 40, value: brush, 'aria-label': 'Brush size', oninput: (e) => { brush = +e.target.value; } });
		const prev = h('label', { class: 'ds-check' }, h('input', { type: 'checkbox', onchange: (e) => { showCut = e.target.checked; draw(); } }), ' Preview on checkerboard');
		let smart = null;
		if (opts.extract && opts.smartSelect) {
			const q = h('input', { type: 'text', placeholder: 'e.g. the Japanese maple, the stone bench', 'aria-label': 'What do you want to pull out?' });
			const go = h('button', { class: 'ds-btn ds-sm' }, icon('search', 16), ' Find it');
			go.onclick = async () => {
				const t = q.value.trim();
				if (t.length < 3) return toast('Type what you want to pull out.');
				go.disabled = true; go.textContent = 'Looking…';
				try {
					const m = await opts.smartSelect(img, t);
					if (!m) toast(`Couldn’t find “${t}”. Drag a box around it instead.`);
					else {
						push();
						const iw = img.width, ih = img.height;
						let x0 = st.W, y0 = st.H, x1 = 0, y1 = 0;
						for (let y = 0; y < st.H; y++) for (let x = 0; x < st.W; x++) {
							const on = m[Math.min(ih - 1, Math.round(y / st.k)) * iw + Math.min(iw - 1, Math.round(x / st.k))];
							st.hints[y * st.W + x] = on ? 1 : 2;
							if (on) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
						}
						if (x1 > x0) box = { x0: Math.max(0, x0 - 4), y0: Math.max(0, y0 - 4), x1: Math.min(st.W, x1 + 4), y1: Math.min(st.H, y1 + 4) };
						run();
						toast('Found it! Touch up the edges if needed, then continue.');
					}
				} catch (e) { toast(e.message); }
				go.disabled = false; go.textContent = '';
				go.append(icon('search', 16), ' Find it');
			};
			q.addEventListener('keydown', (e) => { if (e.key === 'Enter') go.click(); });
			smart = h('div', { class: 'ds-am-smart' }, h('b', null, 'Find it by name (free)'), h('div', { class: 'ds-row' }, q, go));
		}
		const side = h('div', { class: 'ds-am-side' },
			h('h4', null, opts.extract ? 'Pick what to pull out' : 'Clean up the cut-out'),
			h('p', { class: 'ds-muted' }, opts.extract ? 'Drag a box tightly around the thing you want (or find it by name). Then touch up with Keep / Remove.' : 'We found the subject automatically. Touch up anything that’s off, then continue.'),
			smart,
			seg, hint,
			h('label', { class: 'ds-slider' }, h('span', null, 'Brush size'), size),
			prev,
			h('div', { class: 'ds-row' },
				h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: undo }, icon('undo', 16), ' Undo'),
				h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => { push(); st.hints.fill(0); box = defaultBox(st); groundY = null; run(); } }, 'Start over'),
				h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: stepPhoto }, 'New photo')),
			h('div', { class: 'ds-am-next' }, h('button', { class: 'ds-btn ds-wide', onclick: () => { if (!st.mask || !st.mask.some((v) => v)) return toast('Nothing is selected yet — brush over the subject with Keep.'); stepDetails(); } }, 'Looks good →')));
		body.append(h('div', { class: 'ds-am-cut' }, stage, side));
		wireStage();
		requestAnimationFrame(() => { fitStage(); run(); });
		window.addEventListener('resize', fitStage);
	}
	function push() { history.push({ hints: st.hints.slice(), box: { ...box }, groundY }); if (history.length > 30) history.shift(); }
	function undo() { const s = history.pop(); if (!s) return; st.hints.set(s.hints); box = s.box; groundY = s.groundY; run(); }
	function run() { segment(st, box, groundY); draw(); }
	const runSoon = debounce(run, 60);
	let scale = 1;
	function fitStage() {
		if (!stage || !stage.isConnected) return;
		const r = stage.getBoundingClientRect();
		scale = Math.min(r.width / img.width, r.height / img.height);
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		view.width = Math.round(img.width * scale * dpr); view.height = Math.round(img.height * scale * dpr);
		view.style.width = Math.round(img.width * scale) + 'px'; view.style.height = Math.round(img.height * scale) + 'px';
		draw();
	}
	let overlay = null;
	function draw() {
		if (!view || !st) return;
		const x = view.getContext('2d'), Wv = view.width, Hv = view.height;
		x.clearRect(0, 0, Wv, Hv);
		const { W, H, mask, hints } = st;
		if (!overlay || overlay.width !== W) overlay = canvas(W, H);
		const o = overlay.getContext('2d'), d = o.createImageData(W, H), p = d.data;
		if (showCut) {
			checker(x, Wv, Hv);
			// subject only
			for (let i = 0; i < W * H; i++) p[i * 4 + 3] = mask && mask[i] ? 255 : 0;
			o.putImageData(d, 0, 0);
			const tmp = canvas(Wv, Hv), t = tmp.getContext('2d');
			t.drawImage(img, 0, 0, Wv, Hv);
			t.globalCompositeOperation = 'destination-in';
			t.imageSmoothingEnabled = true;
			t.drawImage(overlay, 0, 0, Wv, Hv);
			x.drawImage(tmp, 0, 0);
		} else {
			x.drawImage(img, 0, 0, Wv, Hv);
			for (let i = 0; i < W * H; i++) {
				const j = i * 4;
				if (hints[i] === 1) { p[j] = 60; p[j + 1] = 220; p[j + 2] = 120; p[j + 3] = 110; }
				else if (hints[i] === 2) { p[j] = 240; p[j + 1] = 70; p[j + 2] = 70; p[j + 3] = 120; }
				else if (!mask || !mask[i]) { p[j] = 6; p[j + 1] = 14; p[j + 2] = 10; p[j + 3] = 175; }
			}
			o.putImageData(d, 0, 0);
			x.imageSmoothingEnabled = true;
			x.drawImage(overlay, 0, 0, Wv, Hv);
		}
		const k = Wv / W;
		x.save();
		x.setLineDash([8, 6]); x.lineWidth = 2; x.strokeStyle = 'rgba(123,224,160,.95)';
		x.strokeRect(box.x0 * k, box.y0 * k, (box.x1 - box.x0) * k, (box.y1 - box.y0) * k);
		if (groundY != null) { x.setLineDash([]); x.strokeStyle = '#f4c95d'; x.lineWidth = 3; x.beginPath(); x.moveTo(0, groundY * k); x.lineTo(Wv, groundY * k); x.stroke(); x.fillStyle = '#f4c95d'; x.font = `600 ${Math.round(13 * (Wv / view.clientWidth || 1))}px system-ui`; x.fillText('Ground', 8, groundY * k - 6); }
		x.restore();
	}
	function checker(x, W, H) {
		const s = 14 * (W / (view.clientWidth || W));
		x.fillStyle = '#d9ded9'; x.fillRect(0, 0, W, H); x.fillStyle = '#f4f6f4';
		for (let yy = 0; yy < H; yy += s) for (let xx = ((yy / s) % 2) * s; xx < W; xx += s * 2) x.fillRect(xx, yy, s, s);
	}
	function wireStage() {
		let down = null;
		const toWork = (e) => { const r = view.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * st.W, y: ((e.clientY - r.top) / r.height) * st.H }; };
		view.addEventListener('pointerdown', (e) => {
			e.preventDefault(); view.setPointerCapture(e.pointerId);
			const p = toWork(e); push(); down = p;
			if (tool === 'keep' || tool === 'remove') { paintHint(st, p.x, p.y, brushW(), tool === 'keep' ? 1 : 2); draw(); }
			if (tool === 'ground') { groundY = clamp(p.y, 1, st.H - 1); draw(); }
		});
		view.addEventListener('pointermove', (e) => {
			if (!down) return;
			const p = toWork(e);
			if (tool === 'keep' || tool === 'remove') {
				const n = Math.max(1, Math.ceil(Math.hypot(p.x - down.x, p.y - down.y) / (brushW() * 0.5)));
				for (let i = 1; i <= n; i++) paintHint(st, down.x + ((p.x - down.x) * i) / n, down.y + ((p.y - down.y) * i) / n, brushW(), tool === 'keep' ? 1 : 2);
				down = p; draw();
			} else if (tool === 'box') {
				box = { x0: Math.min(down.x, p.x), y0: Math.min(down.y, p.y), x1: Math.max(down.x, p.x), y1: Math.max(down.y, p.y) }; draw();
			} else if (tool === 'ground') { groundY = clamp(p.y, 1, st.H - 1); draw(); }
		});
		const up = () => {
			if (!down) return;
			down = null;
			if (tool === 'box' && (box.x1 - box.x0 < 8 || box.y1 - box.y0 < 8)) { const s = history.pop(); if (s) box = s.box; }
			runSoon();
		};
		view.addEventListener('pointerup', up);
		view.addEventListener('pointercancel', up);
	}
	const brushW = () => (brush / (view.clientWidth || 1)) * st.W;

	/* ---------------------------------------------------------- 3. details */
	let rec = opts.rec ? { ...opts.rec } : null;
	async function stepDetails() {
		setStep(2);
		window.removeEventListener('resize', fitStage);
		if (st && st.mask) {
			cut = renderCutout(st, 640);
			ana = analyse(st);
		}
		const guess = rec ? rec.cat : guessCategory(ana);
		const state = rec ? { cat: rec.cat, base: rec.base || null, name: rec.name, sci: rec.sci || '', h: rec.h, fixed: !!rec.fixed, bloom: !!rec.bloom, group: rec.group || 'My photos' }
			: { cat: guess, base: null, name: '', sci: '', h: CAT_DEFAULT_H[guess], fixed: false, bloom: !!(ana && ana.bloom > 0.05), group: guessGroup(ana) };
		body.innerHTML = '';
		const prevBox = h('div', { class: 'ds-am-preview' });
		if (cut) prevBox.append(cut);
		const catChips = h('div', { class: 'ds-chips' }, ...CATEGORIES.filter((c) => c.id !== 'mine').map((c) => h('button', { class: c.id === state.cat ? 'on' : '', onclick: (e) => { state.cat = c.id; if (!state.base) state.h = CAT_DEFAULT_H[c.id]; catChips.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.currentTarget)); refresh(); } }, c.name)));
		const q = h('input', { type: 'search', placeholder: 'Search the library or type a name', 'aria-label': 'What is it?' });
		const mic = voiceButton(q, { onError: toast, label: 'Say what it is' });
		const sugg = h('div', { class: 'ds-am-sugg' });
		const linked = h('div', { class: 'ds-am-linked' });
		const nameIn = h('input', { type: 'text', maxlength: 60, value: state.name, placeholder: 'e.g. Mom’s blue hydrangea', 'aria-label': 'Name' });
		nameIn.addEventListener('input', () => { state.name = nameIn.value; });
		const sizeBox = h('div');
		const bloomCk = h('label', { class: 'ds-check' }, h('input', { type: 'checkbox', checked: state.bloom, onchange: (e) => { state.bloom = e.target.checked; } }), ' The photo shows flowers (we’ll hide them out of season)');
		const groupSel = h('label', { class: 'ds-select' }, h('span', null, 'Group'), h('select', { onchange: (e) => { state.group = e.target.value; } }, ...FEATURE_GROUPS.map((g) => h('option', { value: g, selected: g === state.group }, g))));
		const save = h('button', { class: 'ds-btn ds-wide ds-lg' }, icon('check', 18), opts.rec ? ' Save changes' : ' Save to My Library');
		const desc = ana ? describe(ana, state.cat) : '';
		const side = h('div', { class: 'ds-am-side ds-am-details' },
			desc ? h('p', { class: 'ds-am-desc' }, desc) : null,
			h('h4', null, 'What kind of thing is it?'), catChips,
			h('h4', null, 'What is it?'),
			h('div', { class: 'ds-search' }, q, mic),
			h('p', { class: 'ds-hint' }, 'Pick a match and your photo grows, blooms and changes color using that plant’s real data.'),
			sugg, linked,
			h('label', { class: 'ds-label' }, 'Name in your library', nameIn),
			sizeBox, bloomCk, groupSel,
			h('div', { class: 'ds-am-next' }, save,
				opts.rec ? h('div', { class: 'ds-row' },
					opts.rec.original ? h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: recut }, icon('crop', 16), ' Redo cut-out') : null,
					opts.owner ? h('button', { class: 'ds-btn ds-ghost ds-sm', title: 'Save this cut-out to upload in WordPress → Settings → DreamScaper → Library photos, so every visitor sees it', onclick: downloadForSite }, icon('download', 16), ' Download for website') : null,
					h('button', { class: 'ds-btn ds-danger ds-sm', onclick: remove }, icon('trash', 16), ' Delete')) : null));
		body.append(h('div', { class: 'ds-am-cut ds-am-det' }, prevBox, side));
		if (!cut && opts.rec) {
			opts.getBlob(opts.rec.blob).then(async (b) => { if (!b) return; const bm = await createImageBitmap(b); const c = canvas(bm.width, bm.height); c.getContext('2d').drawImage(bm, 0, 0); cut = c; prevBox.append(c); });
		}
		function refresh() {
			const b = state.base && byId[state.base];
			linked.innerHTML = '';
			if (b) {
				linked.append(h('div', { class: 'ds-am-link' }, h('img', { src: thumb(b, 56).toDataURL(), alt: '' }),
					h('div', null, h('b', null, b.name), h('i', null, b.sci), h('small', null, `Grows to ${fmtFt(b.h)} × ${fmtFt(b.w)}${b.inYr ? ` · ${b.inYr}″/yr` : ''}`)),
					h('button', { class: 'ds-link', onclick: () => { state.base = null; state.sci = ''; refresh(); } }, 'Unlink')));
			}
			groupSel.hidden = state.cat !== 'features' || !!b;
			bloomCk.hidden = state.cat === 'features' && !b;
			sizeBox.innerHTML = '';
			const growing = b && !state.fixed;
			if (b) sizeBox.append(h('label', { class: 'ds-check' }, h('input', { type: 'checkbox', checked: !state.fixed, onchange: (e) => { state.fixed = !e.target.checked; refresh(); } }), ` Grow it over time like a real ${b.name.split(/[ '(]/)[0].toLowerCase()}`));
			if (!growing) {
				const max = state.cat === 'trees' ? 90 : state.cat === 'evergreens' ? 80 : state.cat === 'features' ? 20 : 15;
				const v = clamp(state.h || CAT_DEFAULT_H[state.cat], 0.5, max);
				state.h = v;
				const out = h('output', null, fmtFt(v));
				sizeBox.append(h('label', { class: 'ds-slider' }, h('span', null, 'How tall is it?', out),
					h('input', { type: 'range', min: 0.5, max, step: 0.5, value: v, oninput: (e) => { state.h = +e.target.value; out.textContent = fmtFt(state.h); } })));
			}
			suggest();
		}
		function suggest() {
			const words = clean(q.value).split(/\s+/).filter(Boolean);
			let list;
			if (words.length) list = ALL.filter((it) => !it.mine && matchesWords(it, words)).slice(0, 12);
			else list = rank(ana, state.cat).slice(0, 8);
			sugg.innerHTML = '';
			if (!list.length) sugg.append(h('p', { class: 'ds-muted' }, words.length ? 'No library match — just type your own name below.' : ''));
			for (const it of list) {
				sugg.append(h('button', { class: 'ds-am-s' + (state.base === it.id ? ' on' : ''), onclick: () => {
					if (it.cat === 'features') { state.base = null; state.cat = 'features'; state.group = it.group; state.h = it.h; }
					else { state.base = it.id; state.cat = it.cat; state.sci = it.sci; }
					if (!nameIn.value || nameIn.dataset.auto) { nameIn.value = it.name; nameIn.dataset.auto = '1'; state.name = it.name; }
					catChips.querySelectorAll('button').forEach((bb, i) => bb.classList.toggle('on', CATEGORIES[i].id === state.cat));
					refresh();
				} }, h('img', { src: thumb(it, 56).toDataURL(), alt: '' }), h('span', null, h('b', null, it.name), it.sci ? h('i', null, it.sci) : null)));
			}
		}
		q.addEventListener('input', debounce(suggest, 150));
		nameIn.addEventListener('input', () => { delete nameIn.dataset.auto; });
		save.onclick = async () => {
			state.name = nameIn.value.trim() || (state.base && byId[state.base].name) || '';
			if (!state.name) { nameIn.focus(); return toast('Give it a name so you can find it later.'); }
			save.disabled = true;
			try {
				const r = await persist(state);
				toast(`Saved “${r.name}” to My Library.`);
				done();
				opts.onSaved && opts.onSaved(r, !opts.rec);
			} catch (e) { console.error(e); toast('Couldn’t save — your browser storage may be full.'); save.disabled = false; }
		};
		refresh();
	}

	async function persist(state) {
		const r = rec ? { ...rec } : { id: 'my-' + uid(), created: Date.now() };
		Object.assign(r, { name: state.name, sci: state.sci || (state.base && byId[state.base] ? byId[state.base].sci : ''), cat: state.cat, base: state.base || null, h: state.h, fixed: !!state.fixed, bloom: !!state.bloom, group: state.group, updated: Date.now() });
		if (cut && (!rec || st)) {
			const blob = await encodeCutout(cut, 0.82);
			const th = thumbCanvas(cut, 168);
			const tb = await encodeCutout(th, 0.8);
			const oldB = r.blob, oldT = r.thumb;
			r.blob = await store.putBlob(blob);
			r.thumb = await store.putBlob(tb);
			if (oldB) store.deleteBlob(oldB).catch(() => {});
			if (oldT) store.deleteBlob(oldT).catch(() => {});
			r.aspect = cut.width / cut.height;
			r.bytes = blob.size;
			if (img && !r.original) r.original = await store.putBlob(await canvasToBlob(img, 'image/jpeg', 0.85));
		}
		r.tags = [CATEGORIES.find((c) => c.id === r.cat)?.name, r.group, ana && ana.color].filter(Boolean).join(' ');
		await store.putAsset(r);
		return r;
	}
	async function downloadForSite() {
		const r = opts.rec;
		const id = r.base || r.id;
		if (!r.base) toast('Tip: link it to a library plant first so it replaces that plant for every visitor.', 4500);
		const b = await opts.getBlob(r.blob);
		if (!b) return;
		const ext = b.type === 'image/webp' ? 'webp' : 'png';
		const a = h('a', { href: URL.createObjectURL(b), download: `${id}.${ext}` });
		document.body.append(a); a.click(); a.remove();
		setTimeout(() => URL.revokeObjectURL(a.href), 4000);
		toast(`Saved ${id}.${ext} \u2014 upload it in WordPress \u2192 Settings \u2192 DreamScaper \u2192 Library photos.`, 5000);
	}
	async function recut() {
		const b = await opts.getBlob(opts.rec.original);
		if (!b) return toast('The original photo isn’t available.');
		await loadPhoto(b);
		stepCut();
	}
	async function remove() {
		if (!confirm(`Delete “${opts.rec.name}” from My Library? Any copies placed in your designs will be removed too.`)) return;
		await store.deleteAsset(opts.rec);
		done();
		opts.onDeleted && opts.onDeleted(opts.rec);
	}

	if (opts.rec) stepDetails(); else stepPhoto();
	return { close: done };
}

function thumbCanvas(src, size) {
	const c = canvas(size, size), x = c.getContext('2d');
	const k = Math.min((size - 8) / src.width, (size - 6) / src.height);
	x.imageSmoothingQuality = 'high';
	x.drawImage(src, (size - src.width * k) / 2, size - 3 - src.height * k, src.width * k, src.height * k);
	return c;
}

function guessGroup(a) {
	if (!a) return 'My photos';
	if (a.stone > 0.45 && a.fill > 0.55) return 'Stone';
	if (a.leaf > 0.25) return 'Planters';
	return 'Decor';
}

/** Plain-English description of what we see in the photo. */
function describe(a, cat) {
	const parts = [];
	const shape = a.aspect > 1.6 ? 'wide, low' : a.aspect < 0.6 ? 'tall, narrow' : a.top < a.bot * 0.6 ? 'cone-shaped' : 'rounded';
	if (cat === 'features') parts.push(`Looks like a ${shape} garden feature${a.stone > 0.4 ? ' made of stone or concrete' : a.wood > 0.4 ? ' with wood or metal' : ''}.`);
	else {
		const kind = { trees: 'tree', evergreens: 'evergreen', shrubs: 'shrub', perennials: 'flowering perennial', grasses: 'ornamental grass', annuals: 'annual', vines: 'vine' }[cat] || 'plant';
		parts.push(`Looks like a ${shape} ${kind}${a.color && a.bloom > 0.04 ? ` with ${a.color} flowers` : ''}${a.dark > 0.5 ? ' and dark green leaves' : ''}.`);
	}
	return parts.join(' ') + ' Is that right?';
}

/** Rank library items against what we measured in the photo. */
function rank(a, cat) {
	const cands = ALL.filter((it) => !it.mine && it.cat === cat);
	if (!a) return cands.slice(0, 8);
	const hw = 1 / a.aspect;
	return cands.map((it) => {
		let s = 0;
		const ihw = it.h / (it.w || 1);
		s += 2 * (1 - Math.min(1, Math.abs(Math.log(ihw / hw))));
		if (a.color && it.colorFamilies && it.colorFamilies.has(a.color)) s += 3;
		if (a.bloom > 0.05 && !it.blooms && cat !== 'features') s -= 1.5;
		if (a.bloom < 0.02 && it.blooms) s -= 0.3;
		if (cat === 'evergreens' && a.dark > 0.45 && it.leafName === 'dark') s += 0.6;
		if (a.leafL > 0.42 && /lime|gold|light/.test(it.leafName || '')) s += 1;
		if (a.dark > 0.5 && /purple|burgundy|dark/.test(it.leafName || '')) s += 0.5;
		if (cat === 'features') { s += (it.group === guessGroup(a) ? 2 : 0); }
		if (it.native) s += 0.15; // gentle nudge to natives on ties
		return { it, s };
	}).sort((x, y) => y.s - x.s).map((o) => o.it);
}
void COLOR_SWATCH;

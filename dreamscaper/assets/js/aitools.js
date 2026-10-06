/* DreamScaper – AI tools inside the regular editor (separate from Dreamscape AI).
 *  1. AI Erase        – say/type what to remove ("the trash cans"), or paint it
 *  2. Smart Select    – "select the lawn" → paint a material, erase or replace it
 *  3. Make it real    – blends placed plants/materials into the photo's light & shadows
 *  4. Season & light  – re-light the real photo: spring, fall, winter snow, dusk lights
 *  5. Plant ID        – what plant is this? (opens the shared Plant ID flow)
 */
import { h, icon, uid, canvas, canvasToBlob } from './util.js?v=2.7.1';
import { session } from './api.js?v=2.7.1';
import { openAuth, creditsPill } from './account.js?v=2.7.1';
import { confirmCredit } from './credits.js?v=2.7.1';
import { voiceButton } from './voice.js?v=2.7.1';
import { runEdit, segment, dilateMask, compositeMasked } from './aiclient.js?v=2.7.1';
import { inpaint, maskCount } from './eraser.js?v=2.7.1';

const QUICK_ERASE = ['trash cans', 'garden hose', 'weeds', 'dead shrubs', 'car', 'toys', 'tree stump', 'leaves and debris'];
const QUICK_SELECT = [['the lawn', 'Lawn'], ['planting beds', 'Beds'], ['driveway', 'Driveway'], ['walkway', 'Walkway'], ['shrubs', 'Shrubs'], ['trees', 'Trees'], ['house', 'House'], ['fence', 'Fence'], ['sky', 'Sky']];
const SEASONS = [
	['spring', '🌷 Spring bloom', 'Change the season in this photo to mid spring: fresh light-green leaves, flowering shrubs and trees in bloom, green lawn.'],
	['summer', '☀️ Lush summer', 'Change the season in this photo to lush midsummer: full deep-green foliage, thick green lawn, bright sunny day.'],
	['fall', '🍂 Fall color', 'Change the season in this photo to peak autumn in New England: trees and shrubs in orange, red and gold fall color, a few fallen leaves on the lawn.'],
	['winter', '❄️ Winter snow', 'Change the season in this photo to winter: a light layer of fresh snow on the lawn, beds and roof, deciduous trees bare, evergreens still green.'],
	['dusk', '🌆 Dusk + lights', 'Change the time in this photo to dusk with a deep blue sky; turn on warm landscape lighting: path lights along walkways, uplights on trees and the house, glowing windows.'],
	['night', '🌙 Night lights', 'Change the time in this photo to night; show warm landscape lighting glowing on plants, walkways and the house facade.']
];
const KEEP = 'Keep every plant, object, the house and the camera angle exactly the same. Realistic photograph.';

/**
 * Renders the AI tools panel. ctx: { ed, toast, sect, swatches, addView(canvas, label), renderPanel,
 *   capture(kind), registerAsset(rec), store, setTool }
 */
export function panelAI(el, ctx) {
	const { ed, toast, sect } = ctx;
	const locked = !session.user || !session.ai.enabled;
	el.append(sect(null,
		h('div', { class: 'ds-row ds-between' }, h('h4', { class: 'ds-ai-h' }, icon('sparkle', 18), ' AI tools'), creditsPill()),
		h('p', { class: 'ds-muted' }, 'Smarter versions of the regular tools. Erase, Make it real and Season use 1 AI credit; Smart Select and Plant ID are free.')));
	if (locked) {
		el.append(h('div', { class: 'ds-note ds-note-cta' }, icon('lock', 18),
			h('span', null, session.ai.enabled ? 'Sign in to use the AI tools — it’s free.' : 'AI tools are being set up and will be available soon.'),
			session.ai.enabled ? h('button', { class: 'ds-btn ds-sm', onclick: async () => { if (await openAuth({ reason: 'Sign in to use the AI tools.' })) ctx.renderPanel(); } }, 'Sign in') : null));
	}
	const dis = locked;
	const busyOn = (btn, text) => { btn.disabled = true; btn.dataset.label = btn.textContent; btn.textContent = text; el.classList.add('ds-ai-busy'); };
	const busyOff = (btn) => { btn.disabled = false; if (btn.dataset.label) btn.textContent = btn.dataset.label; el.classList.remove('ds-ai-busy'); };
	const credit = async (what) => {
		if (!session.ai.unlimited && session.ai.left <= 0) { if (ctx.buyCredits) ctx.buyCredits('You’ve used today’s free AI credits.'); else toast(`You’ve used today’s ${session.ai.limit} AI credits. They refill tomorrow.`); return false; }
		return confirmCredit(what);
	};

	/* 1. AI Erase */
	const what = h('input', { type: 'text', placeholder: 'What should disappear? e.g. the trash cans', disabled: dis });
	const wm = voiceButton(what, { raw: true, label: 'Say what to erase', listening: 'Listening… what should disappear?', onError: toast });
	const eraseBtn = h('button', { class: 'ds-btn ds-wide', disabled: dis }, icon('wand', 18), ' Erase it');
	eraseBtn.onclick = async () => {
		const text = what.value.trim();
		if (!text && !ed.selMask) return toast('Say or type what to remove — or tap/paint it on the photo first.');
		if (!(await credit('This AI tool'))) return;
		busyOn(eraseBtn, 'Erasing…');
		try { await aiErase(ctx, text); toast('Erased! Not perfect? Press Undo.'); what.value = ''; } catch (e) { toast(e.message, 5000); }
		busyOff(eraseBtn);
	};
	el.append(sect('🪄 AI Erase',
		h('p', { class: 'ds-hint' }, 'Tell it what to remove and it finds it for you. Or tap/paint something on the photo, then press Erase.'),
		h('div', { class: 'ds-chips ds-chips-sm' }, ...QUICK_ERASE.map((q) => h('button', { class: 'ds-chip', disabled: dis, onclick: () => { what.value = q; } }, q))),
		h('div', { class: 'ds-row ds-talkline' }, wm, what), eraseBtn));

	/* 2. Smart Select */
	const sq = h('input', { type: 'text', placeholder: 'Select… e.g. the lawn', disabled: dis || !session.ai.segment });
	const sm = voiceButton(sq, { raw: true, label: 'Say what to select', listening: 'Listening… what should I select?', onError: toast });
	const selBtn = h('button', { class: 'ds-btn ds-ghost', disabled: dis || !session.ai.segment }, icon('target', 18), ' Select');
	const doSelect = async (text) => {
		if (!text) return;
		busyOn(selBtn, 'Finding…');
		try {
			const m = await segment(ed.base, text, ed.W, ed.H);
			if (!m) toast(`Couldn’t find “${text}”. Try another word, or tap it on the photo.`);
			else { ed.setSelectionMask(m); toast(`Selected ${text}. Now fill it, erase it or replace it below.`); ctx.renderPanel(); }
		} catch (e) { toast(e.message); }
		busyOff(selBtn);
	};
	selBtn.onclick = () => doSelect(sq.value.trim());
	sq.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSelect(sq.value.trim()); });
	const has = !!(ed.selMask && maskCount(ed.selMask));
	const replaceIn = h('input', { type: 'text', placeholder: 'Replace with… e.g. a bluestone patio', disabled: dis });
	const rm = voiceButton(replaceIn, { raw: true, label: 'Say what to put there', listening: 'Listening…', onError: toast });
	const repBtn = h('button', { class: 'ds-btn', disabled: dis || !has }, icon('sparkle', 16), ' Replace');
	repBtn.onclick = async () => {
		const t = replaceIn.value.trim();
		if (t.length < 3) return toast('Say or type what should go there.');
		if (!(await credit('This AI tool'))) return;
		busyOn(repBtn, 'Working…');
		try { await aiReplace(ctx, t); toast('Done! Press Undo if you don’t like it.'); } catch (e) { toast(e.message, 5000); }
		busyOff(repBtn);
	};
	el.append(sect('🎯 Smart Select',
		h('p', { class: 'ds-hint' }, session.ai.segment ? 'Pick out an area by name — perfect edges, no tracing. You can also tap or brush on the photo to add to it.' : 'Smart Select is being set up.'),
		h('div', { class: 'ds-chips ds-chips-sm' }, ...QUICK_SELECT.map(([q, l]) => h('button', { class: 'ds-chip', disabled: dis || !session.ai.segment, onclick: () => { sq.value = q; doSelect(q); } }, l))),
		h('div', { class: 'ds-row ds-talkline' }, sm, sq, selBtn),
		has ? h('div', { class: 'ds-selbox' },
			h('b', null, 'With the selection:'),
			h('p', { class: 'ds-hint' }, 'Fill it with a material:'),
			ctx.swatches(null, (id) => { if (ed.fillSelection(id)) { toast('Painted! Undo anytime.'); ctx.renderPanel(); } }),
			h('div', { class: 'ds-row ds-talkline' }, rm, replaceIn, repBtn),
			h('div', { class: 'ds-row' },
				h('button', { class: 'ds-btn ds-ghost ds-sm', disabled: dis, onclick: () => eraseBtn.click() }, icon('wand', 16), ' Erase it'),
				h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => { ed.clearSelection(); ctx.renderPanel(); } }, 'Clear selection'))) : null));

	/* 3. Make it real */
	const realBtn = h('button', { class: 'ds-btn ds-wide', disabled: dis }, icon('sparkle', 18), ' Make my design look real');
	realBtn.onclick = async () => {
		if (!ed.view.objects.length && !ed.view.ops.length) return toast('Add some plants or paint some mulch first — then make it real.');
		if (!(await credit('This AI tool'))) return;
		busyOn(realBtn, 'Blending it in…');
		try {
			const src = ed.composite(0);
			const r = await runEdit({ image: src, mode: 'tool', prompt: `Make this landscape design photo look completely real: the added plants, flowers, mulch, stone and paving must look naturally photographed in this yard, with lighting, shadows, perspective, scale and color matching the rest of the photo, soft contact shadows where plants meet the ground and natural texture. Keep every plant and object in exactly the same position and size; do not add or remove anything. Keep the house and camera angle exactly the same. Realistic photograph.` });
			await ctx.addView(fit(r.img, ed.W, ed.H), ed.view.label + ' · realistic');
			toast('Added as a new view so your editable design stays safe.', 5000);
		} catch (e) { toast(e.message, 5000); }
		busyOff(realBtn);
	};
	el.append(sect('📷 Make it real', h('p', { class: 'ds-hint' }, 'Blends everything you placed into the photo’s real light and shadows. Saved as a new view — your editable design isn’t changed.'), realBtn));

	/* 4. Season & light */
	el.append(sect('🍂 Season & light', h('p', { class: 'ds-hint' }, 'See your real yard (and your design) in another season or at dusk with lights. Saved as a new view.'),
		h('div', { class: 'ds-chips' }, ...SEASONS.map(([id, label, p]) => {
			const b = h('button', { class: 'ds-chip', disabled: dis });
			b.textContent = label;
			b.onclick = async () => {
				if (!(await credit('This AI tool'))) return;
				busyOn(b, 'Working…');
				try {
					const r = await runEdit({ image: ed.composite(0), mode: 'tool', prompt: `${p} ${KEEP}` });
					await ctx.addView(fit(r.img, ed.W, ed.H), `${ed.view.label} · ${label.replace(/^\S+\s/, '')}`);
					toast('Added as a new view.');
				} catch (e) { toast(e.message, 5000); }
				busyOff(b);
			};
			return b;
		}))));

	/* 5. Plant ID */
	el.append(sect('🌿 Plant ID', h('p', { class: 'ds-hint' }, 'Not sure what a plant is? Snap it and get its name, weed warnings and real growth data — then add it to My Library if you want to place it in your design and watch it grow. (Plant ID is also in the top bar on every screen.)'),
		h('button', { class: 'ds-btn ds-ghost ds-wide', disabled: !session.ai.identify, onclick: () => ctx.plantId() }, icon('search', 18), ' Identify a plant or item')));
}

/* ---------------------------------------------------------------- actions */

function fit(img, W, H) {
	const c = canvas(W, H);
	const x = c.getContext('2d');
	x.imageSmoothingQuality = 'high';
	x.drawImage(img, 0, 0, W, H);
	return c;
}

async function aiErase(ctx, text) {
	const { ed } = ctx;
	const W = ed.W, H = ed.H;
	let m = ed.selMask && maskCount(ed.selMask) ? ed.selMask : null;
	if (!m && text) {
		if (session.ai.segment) m = await segment(ed.base, text, W, H);
		if (!m) throw new Error(`Couldn’t find “${text}”. Tap or paint it on the photo, then press Erase.`);
	}
	if (!m) throw new Error('Tap or paint what to remove first.');
	const grow = Math.round(Math.max(W, H) * 0.012);
	const mm = dilateMask(m, W, H, grow);
	let src = ed.base, prompt;
	if (text) prompt = `Remove the ${text.replace(/^(the|a|an)\s+/i, '')} from this photo and fill the space with what would naturally be there, matching the surrounding lawn, mulch, pavement, siding or plants. Keep everything else exactly the same. Realistic photograph.`;
	else {
		// rough fill first, then let the AI make the patch look real
		const c = canvas(W, H), x = c.getContext('2d', { willReadFrequently: true });
		x.drawImage(ed.base, 0, 0);
		const img = x.getImageData(0, 0, W, H);
		inpaint(img, mm);
		x.putImageData(img, 0, 0);
		src = c;
		prompt = 'Clean up this photo: make any smudged, blurry or repeated-looking patches look natural and realistic, matching the surrounding ground, plants and surfaces. Keep everything else exactly the same. Realistic photograph.';
	}
	const r = await runEdit({ image: src, prompt, mode: 'tool' });
	ed.applyImage(compositeMasked(ed.base, r.img, mm, Math.max(3, grow * 0.6)), text ? 'AI Erase: ' + text : 'AI Erase');
}

async function aiReplace(ctx, text) {
	const { ed } = ctx;
	const W = ed.W, H = ed.H;
	const mm = dilateMask(ed.selMask, W, H, Math.round(Math.max(W, H) * 0.006));
	// show the AI where: tint the area lightly so it knows which part to change
	const r = await runEdit({ image: ed.base, prompt: `In this photo, replace the area of ${guessArea(ed)} with ${text}, at a realistic size and perspective with natural light and shadows. Keep everything else exactly the same. Realistic photograph.`, mode: 'tool' });
	ed.applyImage(compositeMasked(ed.base, r.img, mm, Math.round(Math.max(W, H) * 0.004)), 'AI Replace: ' + text);
}
function guessArea(ed) {
	const bb = (() => { let y0 = ed.H, y1 = 0; for (let k = 0; k < ed.selMask.length; k += 7) if (ed.selMask[k]) { const y = (k / ed.W) | 0; if (y < y0) y0 = y; if (y > y1) y1 = y; } return { y0, y1 }; })();
	const mid = (bb.y0 + bb.y1) / 2 / ed.H;
	return mid > 0.66 ? 'the ground in the foreground' : mid > 0.4 ? 'the yard in the middle of the picture' : 'the upper part of the picture';
}


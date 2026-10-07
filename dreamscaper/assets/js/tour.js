/* DreamScaper – guided tours: a live spotlight that points at the real buttons on screen
 * and explains each one. Offered once per screen (home, editor, AI); customers can skip,
 * switch tours off for good, and turn them back on in How it works or My Account.
 */
import { h, put, icon } from './util.js?v=2.7.6';
import { modal } from './capture.js?v=2.7.6';
import { resetCreditAsk } from './credits.js?v=2.7.6';

let ROOT = null;
export function initTour(root) { ROOT = root; }

const OFF = 'ds_tour_off', DONE = 'ds_tour_done_';
const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const set = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private mode */ } };
export const toursOn = () => get(OFF) !== '1';

const TOURS = {
	home: {
		name: 'Welcome to DreamScaper',
		intro: 'Want a quick look around? It takes about a minute and shows what every button does.',
		steps: [
			['.ds-start', 'Start here', 'Tap “Start a new Dreamscape” to design a yard. We’ll ask two simple questions — design it yourself or with AI, and which photo — then guide you step by step.'],
			['[data-act=plantid]', 'Identify Plant', 'Point your camera at any plant to learn its name, whether it’s a weed, and exactly how big it will grow. You can save it to your library and use it in designs.'],
			['[data-act=library]', 'Asset Library', 'Browse hundreds of New England plants and garden features with real growth data — plus everything you’ve saved yourself.'],
			['[data-act=mine]', 'My Dreamscapes', 'All your saved designs. Search them, add tags like “Bed designs” or “Backyard”, and star your favorites.'],
			['[data-act=community]', 'Dreamscape Browser', 'Our community: get inspired by other people’s designs, share yours, ask for ideas, follow and message members — and earn points you can trade for AI credits and storage.'],
			['[data-act=create]', 'Create & extract assets', 'Snap a plant, planter or bench you love — or pull one out of a photo you already have — and it becomes something you can drop into any design.'],
			['[data-act=account]', 'My Account', 'Sign in (free) to save designs online, use Dreamscape AI and Plant ID, and see your AI credits and storage.']
		]
	},
	editor: {
		name: 'The design editor',
		intro: 'This is where you design. Want a quick tour of the tools?',
		steps: [
			['.ds-tools', 'Your tools', 'Everything you need, one tap away: Select, Plants, Paint, Draw beds, Magic eraser, AI tools, Scale and Pan.'],
			['[data-tool=scale]', '1 · Set the scale', 'Do this first: line up eye level so a 6-foot person looks right. Then every plant you add is true to size.'],
			['[data-tool=plants]', '2 · Add plants', 'Pick a plant or feature, then tap the photo to place it. Drag to move it; use the corner handle to resize.'],
			['.ds-stage', 'Your photo', 'Tap to select things, drag to move them, pinch or scroll to zoom.'],
			['.ds-scenebar', '3 · Seasons & time', 'Switch seasons and slide time forward to watch everything grow, year by year.'],
			['.ds-top [aria-label=History]', 'History', 'Every change is listed. Tap any step to go back to it — nothing is lost.'],
			['.ds-top .ds-pid-btn', 'Plant ID', 'Identify any plant, any time — it’s on every screen.'],
			['.ds-ai-btn', 'Dreamscape AI', 'Send this design to the AI to make it photo-real or try new ideas. Each AI change uses 1 credit.'],
			['.ds-send-btn', 'Send it to us', 'Love it? Send it to us for ideas and a free quote.']
		]
	},
	ai: {
		name: 'Dreamscape AI',
		intro: 'New to Dreamscape AI? Here’s a 30-second tour.',
		steps: [
			['.ds-ai-rail', 'One-click tools', 'Select, Remove or Add one thing at a time — like “Remove shrub” or “Add fire pit”. Everything else in the photo stays the same.'],
			['.ds-sv', 'Your picture', 'Drag the slider to compare before and after. Selections show up here in pink.'],
			['.ds-sp', 'Design it all at once', 'Or describe the whole yard you want — say it, type it, tap ideas or show a photo you love.'],
			['.ds-ai-hist-btn', 'History', 'Every AI step is kept. Tap History to go back one step at a time — no need to start over.'],
			['.ds-studio-head .ds-credits', 'AI credits', 'Each AI change uses 1 credit. You get free credits every day, and Select is always free.']
		]
	}
};

let active = null;

/** Offer the tour for this screen once (unless turned off). */
export function maybeTour(name) {
	if (!ROOT || active || !toursOn() || get(DONE + name)) return;
	setTimeout(() => { if (!active && toursOn() && !get(DONE + name) && onScreen(name) && !ROOT.querySelector('.ds-tour-offer')) offer(name); }, 700);
}

function offer(name) {
	const t = TOURS[name];
	if (!t) return;
	const never = h('input', { type: 'checkbox' });
	const card = h('div', { class: 'ds-tour-offer', role: 'dialog', 'aria-label': t.name },
		h('div', { class: 'ds-tour-offer-ic' }, '🧭'),
		h('b', null, t.name), h('p', null, t.intro),
		h('div', { class: 'ds-row ds-wrap ds-center-row' },
			h('button', { class: 'ds-btn', onclick: () => { card.remove(); startTour(name, true); } }, icon('play', 16), ' Show me'),
			h('button', { class: 'ds-btn ds-ghost', onclick: () => { card.remove(); set(DONE + name, '1'); if (never.checked) set(OFF, '1'); } }, 'Skip')),
		h('label', { class: 'ds-check' }, never, h('span', null, 'Don’t offer tours again')),
		h('small', { class: 'ds-muted' }, 'You can turn tours back on any time in How it works.'));
	ROOT.append(card);
	// The offer belongs to this screen: drop it if the person moves on without answering.
	const watch = setInterval(() => { if (!card.isConnected) return clearInterval(watch); if (!onScreen(name)) { card.remove(); clearInterval(watch); } }, 400);
}
/** Is the screen this tour explains still showing? */
function onScreen(name) {
	const t = TOURS[name];
	const el = t && t.steps.length ? ROOT.querySelector(t.steps[0][0]) : null;
	return !!(el && el.isConnected && visible(el));
}

/** Run a tour now. */
export function startTour(name, force = false) {
	const t = TOURS[name];
	if (!t || !ROOT || (!force && !toursOn())) return;
	stop();
	const steps = t.steps.filter(([sel]) => visible(ROOT.querySelector(sel)));
	if (!steps.length) return;
	let i = 0;
	const layer = h('div', { class: 'ds-tour', role: 'dialog', 'aria-live': 'polite' });
	const hole = h('div', { class: 'ds-tour-hole' });
	const bub = h('div', { class: 'ds-tour-bub' });
	layer.append(hole, bub);
	ROOT.append(layer);
	let raf = 0;
	const place = () => {
		const el = ROOT.querySelector(steps[i][0]);
		if (!visible(el)) return;
		const R = ROOT.getBoundingClientRect(), r = el.getBoundingClientRect();
		const pad = 6;
		const x = r.left - R.left - pad, y = r.top - R.top - pad, w = r.width + pad * 2, hh = r.height + pad * 2;
		Object.assign(hole.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: hh + 'px' });
		const bw = Math.min(360, R.width - 24);
		bub.style.width = bw + 'px';
		const bh = bub.offsetHeight || 160;
		let by = y + hh + 12;
		if (by + bh > R.height - 8) by = y - bh - 12;
		if (by < 8) by = Math.max(8, R.height - bh - 12);
		const bx = Math.max(12, Math.min(R.width - bw - 12, x + w / 2 - bw / 2));
		Object.assign(bub.style, { left: bx + 'px', top: by + 'px' });
	};
	const loop = () => { place(); raf = requestAnimationFrame(loop); };
	const draw = () => {
		const [sel, title, text] = steps[i];
		const el = ROOT.querySelector(sel);
		if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
		bub.innerHTML = '';
		put(bub,
			h('small', { class: 'ds-tour-n' }, `${t.name} · ${i + 1} of ${steps.length}`),
			h('b', null, title), h('p', null, text),
			h('div', { class: 'ds-row ds-between' },
				h('button', { class: 'ds-link', onclick: () => finish(true) }, 'Skip tour'),
				h('div', { class: 'ds-row' },
					i > 0 ? h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => { i--; draw(); } }, 'Back') : null,
					h('button', { class: 'ds-btn ds-sm', onclick: () => { if (i < steps.length - 1) { i++; draw(); } else finish(false); } }, i < steps.length - 1 ? 'Next' : 'Got it!'))));
		bub.querySelector('.ds-btn:last-child').focus({ preventScroll: true });
	};
	const finish = () => { set(DONE + name, '1'); stop(); };
	const onKey = (e) => { if (e.key === 'Escape') finish(); };
	ROOT.addEventListener('keydown', onKey);
	active = { stop: () => { cancelAnimationFrame(raf); layer.remove(); ROOT.removeEventListener('keydown', onKey); } };
	draw();
	loop();
}

export function stop() { if (active) { active.stop(); active = null; } }

function visible(el) {
	if (!el) return false;
	const r = el.getBoundingClientRect();
	return r.width > 4 && r.height > 4;
}

/** Tour settings (from How it works / My Account). */
export function tourSettings(onStart) {
	const on = h('input', { type: 'checkbox', checked: toursOn() });
	const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
	const m = modal(ROOT, 'Tours & tips', [
		h('label', { class: 'ds-check' }, on, h('span', null, 'Offer a guided tour the first time I open each screen')),
		h('button', { class: 'ds-btn ds-ghost', onclick: () => { for (const k of Object.keys(TOURS)) set(DONE + k, null); set(OFF, null); on.checked = true; resetCreditAsk(); m.remove(); } }, icon('undo', 16), ' Show all tours and tips again'),
		h('p', { class: 'ds-hint' }, 'This also brings back the “This uses 1 AI credit” reminder.'),
		h('p', { class: 'ds-label' }, 'Start a tour now'),
		h('div', { class: 'ds-row ds-wrap' }, ...[['home', 'Home screen'], ['editor', 'Design editor'], ['ai', 'Dreamscape AI']].map(([k, label]) =>
			h('button', { class: 'ds-btn ds-sm', onclick: () => { m.remove(); if (onStart) onStart(k); else startTour(k, true); } }, icon('play', 14), ' ', label))),
		h('p', { class: 'ds-hint' }, 'The editor and AI tours run when that screen is open.')
	], close, 'ds-modal-auth');
	on.addEventListener('change', () => set(OFF, on.checked ? null : '1'));
}

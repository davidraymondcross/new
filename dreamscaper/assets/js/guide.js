/* DreamScaper – How it works (tutorial) and the step-by-step guide in the editor. */
import { h, icon } from './util.js?v=2.7.5';
import { modal } from './capture.js?v=2.7.5';

const T = (title, ...body) => ({ title, body });
const P = (t) => h('p', null, t);
const UL = (...items) => h('ul', null, ...items.map((i) => h('li', null, i)));
const TIP = (t) => h('p', { class: 'ds-tip' }, '💡 ', t);

function topics(brand) {
	return {
		start: T('What is DreamScaper?',
			P(`DreamScaper lets you see what your yard could look like — on a photo of your own home — before anything is planted. It’s free, and it’s made by ${brand}, so every plant in it grows in Connecticut.`),
			P('There are two ways to design, and you can use both on the same project:'),
			UL(h('span', null, h('b', null, 'Design it yourself'), ' — place real trees, shrubs and flowers at true size, paint on mulch and stone, erase what you don’t want, and watch it all grow year by year. No account needed.'),
				h('span', null, h('b', null, 'Dreamscape AI'), ' — describe or tap what you want and the AI repaints your photo with it in seconds. Needs a free account.')),
			P('And from any screen, 🌿 Plant ID tells you what a plant is from a photo — and how big it will grow.')),
		flow: T('The 4 simple steps',
			h('ol', { class: 'ds-steps-big' },
				h('li', null, h('b', null, 'Start a new Dreamscape'), ' and choose how you want to design (yourself or with AI).'),
				h('li', null, h('b', null, 'Add a photo of your yard'), ' — take one, upload one, or find your house from above.'),
				h('li', null, h('b', null, 'Design'), ' — the guide at the top of the screen walks you through each tool, one step at a time.'),
				h('li', null, h('b', null, 'Save, share, print or send it'), ` to ${brand} for a quote.`)),
			TIP('Everything saves automatically. Signed in, your designs are also saved to your account so you can open them on any phone or computer.')),
		photo: T('Getting a great photo',
			UL('Stand back far enough to fit the whole area, house included.', 'Hold your phone sideways at chest/eye height and keep it level.', 'Shoot on a bright, overcast day or with the sun behind you.', 'Take a photo from each side you care about — every view is saved in the same Dreamscape.'),
			P('Bird’s-eye view shows your property from above using aerial photos (Connecticut’s are the sharpest) — perfect for planning bed sizes and spacing. Start typing your address and pick it from the list.')),
		scale: T('Scale & perspective (why it matters)',
			P('So a 6-foot shrub looks 6 feet tall in your photo, DreamScaper needs to know where eye level is.'),
			UL('Drag the blue line to the height of the camera — where the house’s horizontal lines stop slanting.', 'Drag the yellow 6-ft person next to your door or fence. If they look right, every plant is to scale.'),
			TIP('Bird’s-eye views are already measured, so you can skip this step for them.')),
		plants: T('Adding plants & features',
			UL('Open Plants, search (or tap the microphone and say it), then tap a plant and tap the photo to place it.', 'Drag to move, drag the corner handle to resize, and use the panel to pick its age when planted.', 'Filters: native, deer resistant, evergreen, light, bloom season, flower color and size.', 'Tap the “i” for full plant facts with a growth chart and all four seasons.', 'My Library holds your own photos — anything you photograph with “Add from a photo” or Plant ID.')),
		ground: T('Mulch, stone, lawn & beds',
			UL('Paint: brush mulch, stone, lawn or pavers right onto the ground. Textures shrink into the distance and pick up real shadows.', 'Draw: tap around the shape of a new bed or patio; tap the first point to finish. Add steel, stone or brick edging.', 'Smart Select (AI tools) can select “the lawn” or “the beds” for you so you can fill them perfectly.')),
		erase: T('Erasing things you don’t want',
			UL('Magic eraser: tap an old shrub, stump or hose, then press Erase. “All similar” grabs every weed or dandelion at once.', 'AI Erase (AI tools): just say “remove the trash cans” and it finds and removes them for you.'),
			TIP('Not perfect? Press Undo and try again with a slightly bigger selection.')),
		history: T('History & undo',
			P('Every change is saved as a step. Tap the 🕘 History button (top bar) to see the whole list: Original photo → Added hydrangeas → Painted mulch…'),
			UL('Tap any step to jump back to it.', 'Steps after it turn grey — tap one to bring it back.', 'Make a new change and the greyed steps are replaced.', 'Undo / Redo (or Ctrl+Z / Ctrl+Shift+Z) step one at a time.')),
		time: T('Seasons & the time machine',
			UL('Switch between spring, summer, fall and winter to see blooms, fall color and bare branches.', 'Slide the time bar (or press Play) to watch your plants grow year by year.', 'The moon button shows the yard at night with any landscape lights you placed.')),
		ai: T('Dreamscape AI',
			P('Dreamscape AI repaints your photo with the changes you ask for, keeping your house and camera angle the same.'),
			UL('Say it (microphone), type it, tap ideas, choose style & goals, and/or add a photo of something you love — mix any of them.', 'Press Create. In 10–30 seconds you get a before/after you can slide to compare.', 'Perfect it: quick tweaks, “Fix just one area” (paint the spot to change), or try another version. Every version is kept — Undo goes back to any of them.', 'Mark it up: open the AI design in the editor and add real plants, paint and erase on top of it.'),
			P(h('b', null, 'One-click tools (left side): '), 'change just one thing at a time. Select (free) highlights the lawn, a tree, the patio… then you choose Remove it, Replace it with…, or Make it look better. Remove takes something out in one tap. Add lets you paint where a tree, fire pit, walkway or patio should go. Only that spot changes — the rest of the photo stays exactly the same.'),
			P(h('b', null, 'History: '), 'every AI step is kept. Tap History to go back one step at a time (free) — no need to start over.'),
			P('Each AI change uses 1 credit — we remind you the first time (you can turn the reminder off). You get free credits every day; you can buy more anytime (tap the ✨ credits button). Purchased credits never expire.')),
		tools: T('AI tools in the editor',
			UL(h('span', null, h('b', null, 'AI Erase'), ' — say what to remove.'), h('span', null, h('b', null, 'Smart Select'), ' — select the lawn, beds, driveway… by name, then fill, erase or replace it.'), h('span', null, h('b', null, 'Make it real'), ' — blends everything you placed into the photo’s real light and shadows.'), h('span', null, h('b', null, 'Season & light'), ' — see your real photo in fall, winter snow, or at dusk with lights.'), h('span', null, h('b', null, 'Plant ID'), ' — what is this plant?')),
			P('Make it real and Season & light save as new views, so your editable design is never lost.')),
		plantid: T('Plant ID',
			P('Found a flower, shrub or weed and don’t know what it is? Tap 🌿 Plant ID — it’s at the top of every screen.'),
			UL('Choose the part you’re photographing (leaf, flower, fruit, bark or whole plant), then take or upload a clear, close photo.', 'See the name, how sure it is, look-alikes, and whether it’s a weed, invasive or poison ivy.', 'It’s linked automatically to real growth data — mature height and spread, growth rate, sun and bloom time — with a picture of how big it will be in 3, 5 and 10 years.', 'Then you choose: add it to My Library (we show how much storage it uses and how much you have left) or skip it.', 'Saved plants appear in Plants → My Library in every Dreamscape. Place one and move the time slider to watch it grow like the real plant.'),
			P('Plant ID is for plants only, and it’s always free.')),
		save: T('Saving, organizing, sharing & printing',
			UL('Everything saves automatically on your device. Sign in to also save to your account and open it anywhere.', 'The home page shows your 4 most recent Dreamscapes. Tap My Dreamscapes to see them all: search by name, tap tags (Bed designs, Paver designs, Front yard… or your own) to filter, star favorites, and select several at once to tag or delete them.', 'Your account has free online storage for Dreamscapes and My Library. See what’s used and left under your name → Storage, and add more any time (one-time purchase).', 'Share: post a before & after to Facebook, Pinterest, Nextdoor, Instagram and more.', 'Print: a clean one-page sheet with before/after and a plant list.', `Send to ${brand}: we’ll reach out with ideas and a quote — no obligation.`)),
		community: T('Dreamscape Browser & rewards',
			P('The Dreamscape Browser is the DreamScaper community. Browse designs by Trending, Newest, Top rated or Most liked; filter by tags; search by plant or member.'),
			UL('Share a design: open it, tap ⋯ → Post to Dreamscape Browser. The plants and features you used — with their ages, sizes and the season — are listed automatically.', 'Ask for ideas: post a photo of any spot and let members reply with ideas or a design picture.', 'Like 👍, rate ★, comment, follow members, add friends and send messages. You’re notified in the app (and by email if you want).', 'Earn 🌟 points for visiting daily, designing, identifying plants, sharing and helping. Trade them for AI credits or storage.', 'Level up from 🌱 Seedling to 👑 Garden Legend, collect badges, and unlock special name styles and titles.'),
			P('Keep it friendly: anyone can report a post, comment or member. Never post your house number or anything private.')),
		tips: T('Tips for the best results',
			UL('Use real photos of your own yard — the more of the area in the photo, the better.', 'Set the scale first; everything you add will then be true to size.', 'Plant at the age you’d actually buy, then slide time forward to check spacing at maturity.', 'With AI, be specific: what, where and what style (“a low boxwood hedge along the walkway”).', 'Make small AI tweaks one at a time — it’s easy to undo.'))
	};
}
const ORDER = ['start', 'flow', 'photo', 'scale', 'plants', 'ground', 'erase', 'history', 'time', 'ai', 'tools', 'plantid', 'save', 'community', 'tips'];

export function openGuide(root, brand, start = 'start', onTours = null) {
	const all = topics(brand);
	let cur = all[start] ? start : 'start';
	const nav = h('nav', { class: 'ds-guide-nav' });
	const pane = h('div', { class: 'ds-guide-pane' });
	const draw = () => {
		nav.innerHTML = '';
		ORDER.forEach((k, i) => nav.append(h('button', { class: k === cur ? 'on' : '', onclick: () => { cur = k; draw(); } }, `${i + 1}. ${all[k].title}`)));
		if (onTours) nav.append(h('button', { class: 'ds-guide-tours', onclick: () => { m.remove(); onTours(); } }, '🧭 Guided tours & tips'));
		pane.innerHTML = '';
		const i = ORDER.indexOf(cur);
		pane.append(h('h3', null, all[cur].title), ...all[cur].body,
			h('div', { class: 'ds-row ds-between ds-guide-foot' },
				i > 0 ? h('button', { class: 'ds-btn ds-ghost', onclick: () => { cur = ORDER[i - 1]; draw(); } }, '← Back') : h('span'),
				i < ORDER.length - 1 ? h('button', { class: 'ds-btn', onclick: () => { cur = ORDER[i + 1]; draw(); } }, `Next: ${all[ORDER[i + 1]].title} →`) : h('button', { class: 'ds-btn', onclick: () => m.remove() }, 'Got it — let’s design!')));
		pane.scrollTop = 0;
	};
	const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
	const m = modal(root, 'How DreamScaper works', [h('div', { class: 'ds-guide' }, nav, pane)], close, 'ds-modal-guide');
	draw();
}

/* ------------------------------------------- editor: step-by-step guide bar */
const STEPS = [
	{ id: 'scale', title: 'Set the scale', text: 'Drag the blue line to eye level and check the 6-ft person looks right. This makes every plant true to size.', tool: 'scale', done: (p, v, s) => v.kind === 'aerial' || s.scaled },
	{ id: 'plants', title: 'Add plants', text: 'Open Plants, tap a plant you like, then tap the photo where it should go. Drag to move it.', tool: 'plants', done: (p, v) => v.objects.length > 0 },
	{ id: 'ground', title: 'Add mulch, stone or a bed', text: 'Use Paint to brush on mulch or stone, or Draw to outline a new bed.', tool: 'paint', done: (p, v) => v.ops.length > 0 },
	{ id: 'time', title: 'Watch it grow', text: 'Try the seasons and slide the time bar (or press Play) to see your design mature.', tool: null, done: (p) => (p.years || 0) > 0 || (p.season && p.season !== 'summer') },
	{ id: 'finish', title: 'Save, share or send', text: 'Your design saves automatically. Share it, print it, or send it to us for a free quote. Want AI to take it further? Tap ✨ Dreamscape AI.', tool: null, done: (p, v, s) => s.shared }
];

/** ctx: { setTool, project(), view(), state (object persisted on project.guide) , onHelp } */
export function guideBar(ctx) {
	const el = h('div', { class: 'ds-guidebar', role: 'region', 'aria-label': 'Step-by-step guide' });
	let open = true;
	const update = () => {
		const p = ctx.project(), v = ctx.view();
		if (!p || !v) return;
		const st = p.guide || (p.guide = {});
		el.hidden = !!st.off;
		if (st.off) return;
		const states = STEPS.map((s) => !!s.done(p, v, st));
		let i = states.findIndex((d) => !d);
		el.innerHTML = '';
		if (i < 0) {
			el.append(h('span', { class: 'ds-gb-ok' }, icon('check', 18), ' You’ve tried every step — nice work!'),
				h('button', { class: 'ds-link', onclick: () => { st.off = true; ctx.changed(); update(); } }, 'Hide guide'));
			return;
		}
		const s = STEPS[i];
		const dots = h('span', { class: 'ds-gb-dots' }, ...STEPS.map((x, k) => h('i', { class: states[k] ? 'done' : k === i ? 'on' : '', title: x.title })));
		el.append(
			h('span', { class: 'ds-gb-step' }, `Step ${i + 1} of ${STEPS.length}`), dots,
			h('div', { class: 'ds-gb-txt' }, h('b', null, s.title), open ? h('span', null, ' — ' + s.text) : null),
			h('div', { class: 'ds-row' },
				s.tool ? h('button', { class: 'ds-btn ds-sm', onclick: () => ctx.setTool(s.tool) }, 'Show me') : null,
				h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => { if (s.id === 'scale') st.scaled = true; else if (s.id === 'finish') st.shared = true; else st['skip_' + s.id] = true; ctx.changed(); update(); } }, i === STEPS.length - 1 ? 'Done' : 'Next step'),
				h('button', { class: 'ds-icon-btn', title: 'How it works', 'aria-label': 'How it works', onclick: () => ctx.onHelp(s.id === 'ground' ? 'ground' : s.id === 'time' ? 'time' : s.id === 'finish' ? 'save' : s.id) }, '?'),
				h('button', { class: 'ds-icon-btn', title: 'Hide the guide', 'aria-label': 'Hide the guide', onclick: () => { st.off = true; ctx.changed(); update(); ctx.toast('Guide hidden. Bring it back anytime with the ? button.'); } }, icon('close', 16))));
	};
	// skipped steps count as done
	for (const s of STEPS) { if (s._w) continue; const d = s.done; s.done = (p, v, st) => d(p, v, st) || !!st['skip_' + s.id]; s._w = true; }
	el.update = update;
	/**
	 * Get out of the way while the picture is being worked on: hide on any touch, drag, pinch or wheel
	 * over the stage and come back after 10 seconds without one.
	 */
	el.watch = (stage, idleMs = 10000) => {
		let t = 0;
		const away = () => {
			el.classList.add('away');
			clearTimeout(t);
			t = setTimeout(() => el.classList.remove('away'), idleMs);
		};
		for (const ev of ['pointerdown', 'pointermove', 'wheel', 'touchstart', 'keydown']) stage.addEventListener(ev, (e) => { if (ev === 'pointermove' && !e.buttons && e.pointerType === 'mouse') return; away(); }, { passive: true });
		return () => clearTimeout(t);
	};
	el.show = () => { const p = ctx.project(); if (p) { p.guide = p.guide || {}; p.guide.off = false; ctx.changed(); update(); } };
	return el;
}

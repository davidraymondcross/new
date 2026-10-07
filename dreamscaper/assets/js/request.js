/* DreamScaper – Request quotes: one guided brief, sent to as many contractors as you choose.
 *
 * The basket: "Add to my request" on any contractor (Find list or profile); the bar at the bottom
 * shows how many are in it. The wizard asks one thing per screen, says why it asks, saves a draft
 * to your account as you go, and shows how complete the brief is (and what's still missing).
 */
import { h, put, icon, debounce } from './util.js?v=2.7.4';
import { session, api } from './api.js?v=2.7.4';
import { modal } from './capture.js?v=2.7.4';
import { voiceButton } from './voice.js?v=2.7.4';
import { HELP, openHelp } from './explain.js?v=2.7.4';

let R = null; // { ctx }
const toast = (m, ms) => R && R.ctx.toast(m, ms);

/* ---------------------------------------------------------------- basket */

const BASKET = new Map();
try { for (const p of JSON.parse(sessionStorage.getItem('ds_basket') || '[]')) BASKET.set(p.id, p); } catch (e) { /* storage off */ }
const subs = new Set();
const saveBasket = () => { try { sessionStorage.setItem('ds_basket', JSON.stringify([...BASKET.values()])); } catch (e) { /* storage off */ } subs.forEach((f) => f()); };
export const basketHas = (id) => BASKET.has(id);
export const basketList = () => [...BASKET.values()];
export function basketToggle(p) { if (BASKET.has(p.id)) BASKET.delete(p.id); else BASKET.set(p.id, { id: p.id, business: p.business, logo: p.logo || '', town: p.town || '' }); saveBasket(); return BASKET.has(p.id); }
export function basketAddAll(list) { for (const p of list) BASKET.set(p.id, { id: p.id, business: p.business, logo: p.logo || '', town: p.town || '' }); saveBasket(); }
export function basketClear() { BASKET.clear(); saveBasket(); }

/** "Add to my request" toggle button for one contractor. */
export function basketButton(p, sm = true) {
	const b = h('button', { class: 'ds-btn ds-ghost' + (sm ? ' ds-sm' : '') + ' ds-basket-btn', type: 'button' });
	const draw = () => { const on = BASKET.has(p.id); b.classList.toggle('on', on); b.textContent = on ? '✓ In my request' : '+ Add to my request'; b.setAttribute('aria-pressed', on ? 'true' : 'false'); };
	b.onclick = (e) => { e.stopPropagation(); basketToggle(p); draw(); };
	subs.add(draw);
	draw();
	return b;
}
/** Sticky bar: "3 contractors in your request · Request quotes →" */
export function basketBar(onOpen) {
	const bar = h('div', { class: 'ds-basket', role: 'status' });
	const draw = () => {
		const n = BASKET.size;
		bar.hidden = !n;
		bar.innerHTML = '';
		if (!n) return;
		put(bar, h('span', { class: 'ds-basket-logos' }, ...basketList().slice(0, 4).map((p) => p.logo ? h('img', { src: p.logo, alt: '' }) : h('span', null, '🧰'))),
			h('span', { class: 'ds-grow' }, h('b', null, `${n} contractor${n > 1 ? 's' : ''} in your request`), h('small', null, 'Add as many as you like — one form goes to all of them')),
			h('button', { class: 'ds-link', onclick: () => { basketClear(); } }, 'Clear'),
			h('button', { class: 'ds-btn', onclick: () => (onOpen ? onOpen() : openRequest()) }, 'Request quotes →'));
	};
	subs.add(draw);
	draw();
	return bar;
}

/* --------------------------------------------------------------- wizard */

/** ctx: { root, toast, requireSignIn, pickDesign(onPick, onCancel), propertyWizard(prop), openInbox(), openProjects(), openFind() } */
export function initRequest(ctx) { R = { ctx }; }

const SERVICES = ['Landscape design', 'Planting', 'Mulch & stone', 'Lawn installation', 'Patios & walkways', 'Retaining walls', 'Landscape lighting', 'Fencing', 'Drainage & grading', 'Tree work', 'Lawn care', 'Irrigation'];
const SVC_ICON = { 'Landscape design': '📐', Planting: '🌳', 'Mulch & stone': '🪵', 'Lawn installation': '🌱', 'Patios & walkways': '🧱', 'Retaining walls': '🪨', 'Landscape lighting': '💡', Fencing: '🚧', 'Drainage & grading': '💧', 'Tree work': '🪓', 'Lawn care': '✂️', Irrigation: '🚿' };
const BUDGETS = ['Under $2,500', '$2,500 – $5,000', '$5,000 – $10,000', '$10,000 – $25,000', '$25,000 – $50,000', '$50,000+', 'Not sure — tell me what’s realistic'];
const STARTS = ['As soon as possible', 'Within a month', 'This season', 'Next season', 'Just getting ideas'];
const PRIORITY_IDEAS = ['Stay within budget', 'Low maintenance', 'Deer resistant', 'Privacy', 'Color all season', 'Curb appeal', 'Fix drainage', 'Kid & pet friendly', 'Native plants', 'Finish by a date', 'Room to entertain'];
const CHANNELS = ['Text message', 'Phone call', 'Email', 'DreamScaper messages'];
const blank = () => ({ services: [], other: '', description: '', budget: '', financing: false, timing: { start: '', deadline: '', reason: '', flexible: '' }, site: {}, answers: {}, pro_answers: {}, priorities: { must: [], nice: [] }, contact: { channel: '', times: '', deciders: '', others: '' } });

/** Client-side mirror of the server's completeness score (includes/requests.php). */
export function scoreBrief(b, prop, hasDesign) {
	let score = 0;
	const missing = [];
	const add = (ok, pts, what, why, step) => { if (ok) score += pts; else missing.push({ what, why, step }); };
	add(b.services.length, 10, 'What you want done', 'So the right contractor sees your request.', 'services');
	add((b.description || '').trim().length >= 40, 10, 'A few sentences about the project', 'Your own words catch the details a form can’t.', 'describe');
	add(prop && prop.address, 10, 'Your address', 'Needed to check the service area and measure from above.', 'property');
	add(prop && prop.aerial, 8, 'The bird’s-eye view of your property', 'Lets contractors measure lawn, beds and patios to scale.', 'property');
	const steps = new Set(((prop && prop.photos) || []).map((x) => x.step));
	for (const [k, l] of [['front', 'front of the house'], ['left', 'left side'], ['right', 'right side'], ['back', 'backyard'], ['structures', 'structures near the work area'], ['existing', 'existing plants and problem spots']]) add(steps.has(k), 3, 'A photo of the ' + l, 'Without it, a contractor has to visit or guess before pricing.', 'property');
	add(hasDesign, 10, 'A Dreamscape design', 'Shows exactly what you want — plants, beds and materials.', 'design');
	add(b.budget, 8, 'Your budget range', 'Lets contractors suggest what fits, instead of a quote you’ll turn down.', 'money');
	add(b.timing.start, 8, 'When you want it done', 'Busy seasons book up — timing decides scheduling.', 'money');
	add(Object.values(b.site).filter((v) => v !== '' && v != null).length >= 6, 8, 'The site questions (access, slope, utilities…)', 'These are what change the price most after you’ve been quoted.', 'site');
	add(b.priorities.must.length, 5, 'What matters most to you', 'Helps contractors offer phases or options that fit your budget.', 'priorities');
	add(b.contact.channel, 5, 'How you’d like to be contacted', 'So nobody calls when you’d rather text.', 'contact');
	return { score: Math.min(100, score), missing };
}

/**
 * Open the wizard. opts: { pros: [{id,business,logo}], design, services: [] }
 * Contractors come from opts.pros or the basket.
 */
export async function openRequest(opts = {}) {
	const { ctx } = R;
	if (!(await ctx.requireSignIn('Sign in (free) so contractors can send your quotes to your account.'))) return;
	if (opts.pros) basketAddAll(opts.pros);
	const S = { b: blank(), design: opts.design || null, prop: null, q: null, step: 0, saved: 0 };
	if (opts.services && opts.services.length) S.b.services = opts.services.slice();
	try { const r = await api('crm/myproperty'); S.prop = r.items[0] || null; } catch (e) { /* none yet */ }
	// resume a saved draft?
	try {
		const d = (await api('req/draft')).draft;
		if (d && d.b && (d.b.services.length || d.b.description)) {
			const resume = await new Promise((res) => {
				const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => { m.remove(); res(false); } }, icon('close'));
				const m = modal(ctx.root, 'Pick up where you left off?', [h('p', null, `You started a request${d.b.services.length ? ' for ' + d.b.services.join(', ') : ''} on ${new Date(d.saved * 1000).toLocaleDateString()}. Your answers were saved.`),
					h('div', { class: 'ds-row ds-wrap' }, h('button', { class: 'ds-btn', onclick: () => { m.remove(); res(true); } }, 'Continue it'), h('button', { class: 'ds-btn ds-ghost', onclick: () => { m.remove(); res(false); } }, 'Start fresh'))], close);
			});
			if (resume) { S.b = { ...blank(), ...d.b, timing: { ...blank().timing, ...(d.b.timing || {}) }, priorities: { ...blank().priorities, ...(d.b.priorities || {}) }, contact: { ...blank().contact, ...(d.b.contact || {}) } }; S.step = Math.min(d.step || 0, 9); if (d.pros) basketAddAll(d.pros); }
			else api('req/draft', { body: { clear: true } }).catch(() => {});
		}
	} catch (e) { /* no draft */ }

	const body = h('div', { class: 'ds-rq' });
	const meter = h('div', { class: 'ds-rq-meter' });
	const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => { saveNow(); m.remove(); toast('Saved — open Request quotes any time to finish.', 4000); } }, icon('close'));
	const m = modal(ctx.root, 'Request quotes', [meter, body], close, 'ds-modal-wide ds-wizard ds-rq-modal');
	const saveNow = () => api('req/draft', { body: { draft: { b: S.b, step: S.step, pros: basketList() } } }).then((r) => { S.saved = r.saved; }).catch(() => {});
	const saveSoon = debounce(saveNow, 1500);
	const changed = () => { saveSoon(); drawMeter(); };

	const STEPS = [
		['who', '👥', 'Contractors'], ['services', '🛠️', 'What'], ['describe', '✍️', 'Describe'], ['property', '📸', 'Property'], ['design', '🎨', 'Design'],
		['money', '💵', 'Budget & timing'], ['site', '🏡', 'The site'], ['work', '❓', 'Details'], ['priorities', '⭐', 'Priorities'], ['contact', '📞', 'Contact'], ['review', '✅', 'Review']
	];
	const drawMeter = () => {
		const sc = scoreBrief(S.b, S.prop, !!(S.design && S.design.after));
		meter.innerHTML = '';
		put(meter,
			h('div', { class: 'ds-wiz-prog' }, ...STEPS.map(([k, e, l], i) => h('button', { class: 'ds-wiz-dot' + (i === S.step ? ' on' : '') + (i < S.step ? ' done' : ''), title: l, 'aria-label': `Step ${i + 1}: ${l}`, onclick: () => go(i) }, e))),
			h('div', { class: 'ds-rq-score', title: 'How complete your request is' }, h('i', null, h('em', { style: { width: sc.score + '%' } })), h('small', null, `Your request is ${sc.score}% complete${sc.score >= 85 ? ' — great, contractors can price this without calling' : sc.score >= 60 ? '' : ' — more detail means fewer follow-up calls'}`)));
	};
	const nav = (nextLabel = 'Next →', canNext = () => true) => h('div', { class: 'ds-row ds-wrap ds-wiz-nav' },
		S.step > 0 ? h('button', { class: 'ds-btn ds-ghost', onclick: () => go(S.step - 1) }, '← Back') : null,
		h('div', { class: 'ds-spacer' }),
		S.step < STEPS.length - 1 ? h('button', { class: 'ds-link', onclick: () => go(S.step + 1) }, 'Skip') : null,
		h('button', { class: 'ds-btn', onclick: () => { const why = canNext(); if (why !== true && why) { toast(why); return; } go(S.step + 1); } }, nextLabel));
	const head = (title, why) => [h('p', { class: 'ds-muted ds-sm-text' }, `Step ${S.step + 1} of ${STEPS.length}`), h('h3', null, title), why ? h('p', { class: 'ds-why' }, h('b', null, 'Why we ask: '), why) : null];
	const chipSet = (opts2, cur, multi, on) => {
		const box = h('div', { class: 'ds-chips ds-chips-l' });
		const draw = () => { box.innerHTML = ''; for (const o of opts2) { const sel = multi ? cur().includes(o) : cur() === o; box.append(h('button', { type: 'button', class: 'ds-chip' + (sel ? ' on' : ''), 'aria-pressed': sel ? 'true' : 'false', onclick: () => { on(o); draw(); changed(); } }, o)); } };
		draw();
		return box;
	};
	const go = (i) => { S.step = Math.max(0, Math.min(STEPS.length - 1, i)); saveSoon(); drawMeter(); draw(); const sc = body.closest('.ds-modal'); if (sc) sc.scrollTop = 0; };

	const questionsFor = async () => {
		const key = S.b.services.join('|') + '#' + basketList().map((p) => p.id).join(',');
		if (S.q && S.q.key === key) return S.q;
		const r = await api('req/questions', { query: { services: S.b.services.join('|'), pros: basketList().map((p) => p.id).join(',') } });
		S.q = { ...r, key };
		return S.q;
	};
	const qField = (q, get, set) => {
		const why = q.why ? h('small', { class: 'ds-hint' }, q.why) : null;
		if (q.type === 'choice' || q.type === 'yesno') return h('div', { class: 'ds-rq-q' }, h('b', null, q.q), chipSet(q.type === 'yesno' ? ['Yes', 'No', 'Not sure'] : q.options, () => get() || '', false, (o) => set(get() === o ? '' : o)), why);
		if (q.type === 'multi') return h('div', { class: 'ds-rq-q' }, h('b', null, q.q), chipSet(q.options, () => get() || [], true, (o) => { const a = (get() || []).slice(); const i = a.indexOf(o); if (i >= 0) a.splice(i, 1); else a.push(o); set(a); }), why);
		const inp = q.type === 'long' ? h('textarea', { rows: 3 }, get() || '') : h('input', { type: q.type === 'number' ? 'number' : q.type === 'date' ? 'date' : 'text', inputmode: q.type === 'number' ? 'decimal' : null, value: get() || '' });
		inp.addEventListener('input', () => { set(inp.value); changed(); });
		return h('label', { class: 'ds-field ds-rq-q' }, h('b', null, q.q), inp, why);
	};

	const draw = async () => {
		body.innerHTML = '';
		const k = STEPS[S.step][0];
		if (k === 'who') {
			const list = h('div', { class: 'ds-hub-list' });
			const drawList = () => { list.innerHTML = ''; const all = basketList(); if (!all.length) list.append(h('p', { class: 'ds-warn' }, 'No contractors chosen yet. You can fill this in now and add contractors before sending.')); for (const p of all) list.append(h('div', { class: 'ds-hub-row' }, p.logo ? h('img', { class: 'ds-pro-logo', src: p.logo, alt: '' }) : h('span', { class: 'ds-pro-logo' }, '🧰'), h('span', { class: 'ds-grow' }, h('b', null, p.business), p.town ? h('small', null, p.town) : null), h('button', { class: 'ds-link', onclick: () => { basketToggle(p); drawList(); } }, 'Remove'))); };
			drawList();
			put(body, ...head('Who should get your request?', 'You can ask as many contractors as you like. Each one gets the same brief and can message you, book a visit and send a quote.'),
				list, h('div', { class: 'ds-row ds-wrap' }, h('button', { class: 'ds-btn ds-ghost', onclick: () => { saveNow(); m.remove(); R.ctx.openFind(); toast('Tap “+ Add to my request” on each contractor, then “Request quotes →”.', 5000); } }, '🔎 Add more contractors')),
				h('p', { class: 'ds-hint' }, '💡 On Find a Contractor you can also tap “Add everyone who serves my area”.'), nav());
			return;
		}
		if (k === 'services') {
			const other = h('input', { type: 'text', placeholder: 'Something else? Describe it', value: S.b.other });
			other.addEventListener('input', () => { S.b.other = other.value; changed(); });
			const grid = h('div', { class: 'ds-rq-svc' });
			const drawG = () => { grid.innerHTML = ''; for (const s of SERVICES) { const on = S.b.services.includes(s); grid.append(h('button', { type: 'button', class: 'ds-rq-svc-b' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false', onclick: () => { const i = S.b.services.indexOf(s); if (i >= 0) S.b.services.splice(i, 1); else S.b.services.push(s); S.q = null; drawG(); changed(); } }, h('span', null, SVC_ICON[s] || '🛠️'), h('b', null, s))); } };
			drawG();
			put(body, ...head('What do you want done?', 'Pick everything that applies — each one adds a few quick questions so contractors can price it.'), grid, other, nav('Next →', () => (S.b.services.length || S.b.other.trim() ? true : 'Pick at least one service.')));
			return;
		}
		if (k === 'describe') {
			const ta = h('textarea', { rows: 7, placeholder: 'e.g. Our front beds are overgrown. We’d like them cleared, a few low shrubs that deer won’t eat, and dark mulch. The walkway floods after heavy rain.' }, S.b.description);
			ta.addEventListener('input', () => { S.b.description = ta.value; changed(); });
			const mic = voiceButton(ta, { raw: true, append: true, label: 'Talk instead of typing', listening: 'Listening… describe your project', onError: (e) => toast(e) });
			const tidy = session.crm && session.crm.tidy ? h('button', { class: 'ds-btn ds-ghost ds-sm', type: 'button', onclick: async (e) => {
				const btn = e.currentTarget; btn.disabled = true; btn.textContent = 'Tidying…';
				try {
					const r = await api('req/tidy', { body: { text: ta.value, services: S.b.services } });
					const cl = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => mm.remove() }, icon('close'));
					const mm = modal(R.ctx.root, 'Use this version?', [h('p', { class: 'ds-hint' }, 'Here’s your description, tidied up. Nothing changes unless you choose it.'), h('p', { class: 'ds-pre ds-hub-card' }, r.text),
						h('div', { class: 'ds-row ds-wrap' }, h('button', { class: 'ds-btn', onclick: () => { ta.value = S.b.description = r.text; changed(); mm.remove(); } }, 'Use this version'), h('button', { class: 'ds-btn ds-ghost', onclick: () => mm.remove() }, 'Keep mine'))], cl);
				} catch (x) { toast(x.message); }
				btn.disabled = false; btn.textContent = '✨ Tidy it up';
			} }, '✨ Tidy it up') : null;
			put(body, ...head('Tell us about it in your own words', 'Your own words catch what a form can’t: what bugs you about the yard now, what you picture, what must stay.'),
				ta, h('div', { class: 'ds-row ds-wrap' }, mic, mic ? h('small', { class: 'ds-hint' }, 'Tap the mic and just talk.') : null, h('div', { class: 'ds-spacer' }), tidy), nav());
			return;
		}
		if (k === 'property') {
			const p = S.prop;
			const shots = p ? (p.photos || []).length + (p.aerial ? 1 : 0) : 0;
			put(body, ...head('Your property', 'Photos and the aerial view let contractors measure and see access, slopes and utilities — the things that otherwise mean a visit before they can price anything.'),
				p ? h('div', { class: 'ds-hub-card' }, h('b', null, '📍 ' + (p.address || 'My property')), h('p', { class: 'ds-hint' }, `${shots} of 7 views captured.`), p.photos && p.photos.length ? h('div', { class: 'ds-prop-photos' }, ...p.photos.slice(0, 6).map((x) => h('span', { class: 'ds-ph' }, h('img', { src: x.url, alt: x.step })))) : null,
					h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: async () => { const np = await R.ctx.propertyWizard(S.prop); if (np) S.prop = np; drawMeter(); draw(); } }, shots ? '📸 Add or retake photos' : '📸 Take the property photos'))
					: h('div', null, h('p', null, 'We’ll walk you through each view and tell you exactly where to stand. About 5 minutes.'), h('button', { class: 'ds-btn', onclick: async () => { const np = await R.ctx.propertyWizard(null); if (np) S.prop = np; drawMeter(); draw(); } }, '📸 Start the guided photos')),
				nav());
			return;
		}
		if (k === 'design') {
			const d = S.design;
			put(body, ...head('Attach a Dreamscape design (optional)', 'A design shows exactly what you want — the plants, beds and materials — and its measurements go with it. It’s the single best way to get matching quotes.'),
				d ? h('div', { class: 'ds-hire-design' }, d.after ? h('img', { src: d.after, alt: '' }) : null, h('div', null, h('b', null, d.title), h('small', null, `${(d.assets || []).reduce((a, x) => a + (x.count || 0), 0)} plants & features`))) : null,
				h('div', { class: 'ds-row ds-wrap' },
					h('button', { class: 'ds-btn ds-ghost', onclick: () => { saveNow(); m.remove(); R.ctx.pickDesign((payload) => openRequest({ design: payload }), () => openRequest({ design: S.design })); } }, '🗂️ ' + (d ? 'Choose a different Dreamscape' : 'Choose one of my Dreamscapes')),
					d ? h('button', { class: 'ds-link', onclick: () => { S.design = null; drawMeter(); draw(); } }, 'Remove design') : null),
				h('p', { class: 'ds-hint' }, 'No design yet? Skip this — you can still send photos and a description.'), nav());
			return;
		}
		if (k === 'money') {
			const fin = h('input', { type: 'checkbox', checked: !!S.b.financing, onchange: (e) => { S.b.financing = e.target.checked; changed(); } });
			const dl = h('input', { type: 'date', value: S.b.timing.deadline, onchange: (e) => { S.b.timing.deadline = e.target.value; changed(); } });
			const why = h('input', { type: 'text', placeholder: 'e.g. graduation party, listing the house', value: S.b.timing.reason, oninput: (e) => { S.b.timing.reason = e.target.value; changed(); } });
			put(body, ...head('Budget and timing', 'A budget range lets contractors suggest what fits instead of a quote you’ll turn down. Timing matters because good contractors book up for the season.'),
				h('b', null, 'Budget'), chipSet(BUDGETS, () => S.b.budget, false, (o) => (S.b.budget = S.b.budget === o ? '' : o)),
				h('label', { class: 'ds-check' }, fin, ' I’d like to hear about financing'),
				h('b', null, 'When'), chipSet(STARTS, () => S.b.timing.start, false, (o) => (S.b.timing.start = S.b.timing.start === o ? '' : o)),
				h('div', { class: 'ds-form-grid' }, h('label', { class: 'ds-field' }, h('span', null, 'Must be done by (optional)'), dl), h('label', { class: 'ds-field' }, h('span', null, 'Why that date?'), why)),
				h('b', null, 'How flexible are you?'), chipSet(['Very flexible', 'Somewhat', 'Not flexible'], () => S.b.timing.flexible, false, (o) => (S.b.timing.flexible = S.b.timing.flexible === o ? '' : o)), nav());
			return;
		}
		if (k === 'site' || k === 'work') {
			body.append(h('span', { class: 'ds-spin' }));
			let q;
			try { q = await questionsFor(); } catch (e) { body.innerHTML = ''; body.append(h('p', { class: 'ds-err' }, e.message), nav()); return; }
			body.innerHTML = '';
			if (k === 'site') {
				put(body, ...head('About the site', 'These are the things that change a price most after someone has quoted it. Tap an answer — “Not sure” is fine.'),
					...q.site.map((x) => qField(x, () => S.b.site[x.id], (v) => { S.b.site[x.id] = v; })),
					h('p', { class: 'ds-hint' }, '☎️ Before any digging, contractors call 811 (Call Before You Dig) to have utility lines marked — free for you.'), nav());
				return;
			}
			const svcBlocks = Object.entries(q.services).map(([svc, list]) => h('section', { class: 'ds-rq-sec' }, h('h4', null, (SVC_ICON[svc] || '🛠️') + ' ' + svc), ...list.map((x) => qField(x, () => S.b.answers[x.id], (v) => { S.b.answers[x.id] = v; }))));
			const proBlocks = Object.entries(q.pros || {}).map(([pid, info]) => h('section', { class: 'ds-rq-sec ds-rq-pro' }, h('h4', null, `🧰 ${info.business} also asks`), ...info.questions.map((x) => qField(x, () => (S.b.pro_answers[pid] || {})[x.id], (v) => { S.b.pro_answers[pid] = { ...(S.b.pro_answers[pid] || {}), [x.id]: v }; }))));
			put(body, ...head('A few details about the work', 'Quick answers here save a phone call later.'),
				svcBlocks.length || proBlocks.length ? [...svcBlocks, ...proBlocks] : h('p', { class: 'ds-muted' }, 'No extra questions for what you picked.'), nav());
			return;
		}
		if (k === 'priorities') {
			const cyc = (o) => { const inM = S.b.priorities.must.indexOf(o), inN = S.b.priorities.nice.indexOf(o); if (inM >= 0) { S.b.priorities.must.splice(inM, 1); S.b.priorities.nice.push(o); } else if (inN >= 0) S.b.priorities.nice.splice(inN, 1); else S.b.priorities.must.push(o); };
			const box = h('div', { class: 'ds-chips ds-chips-l' });
			const drawP = () => { box.innerHTML = ''; for (const o of [...new Set([...PRIORITY_IDEAS, ...S.b.priorities.must, ...S.b.priorities.nice])]) { const st = S.b.priorities.must.includes(o) ? 'must' : S.b.priorities.nice.includes(o) ? 'nice' : ''; box.append(h('button', { type: 'button', class: 'ds-chip' + (st === 'must' ? ' on' : st === 'nice' ? ' some' : ''), onclick: () => { cyc(o); drawP(); changed(); } }, st === 'must' ? '⭐ ' : st === 'nice' ? '👍 ' : '', o)); } };
			drawP();
			const add = h('input', { type: 'text', placeholder: 'Add your own and press Enter' });
			add.addEventListener('keydown', (e) => { if (e.key === 'Enter' && add.value.trim()) { e.preventDefault(); S.b.priorities.must.push(add.value.trim().slice(0, 80)); add.value = ''; drawP(); changed(); } });
			put(body, ...head('What matters most?', 'Knowing your must-haves lets a contractor offer phases or options that fit your budget, instead of one all-or-nothing price.'),
				h('p', { class: 'ds-hint' }, 'Tap once for ⭐ must-have, twice for 👍 nice-to-have, three times to clear.'), box, add, nav());
			return;
		}
		if (k === 'contact') {
			const u = session.user || {};
			const phone = h('input', { type: 'tel', value: S.b.contact.phone || u.phone || '', autocomplete: 'tel', oninput: (e) => { S.b.contact.phone = e.target.value; changed(); } });
			const times = h('input', { type: 'text', placeholder: 'e.g. weekday evenings, Saturday mornings', value: S.b.contact.times, oninput: (e) => { S.b.contact.times = e.target.value; changed(); } });
			const dec = h('input', { type: 'text', placeholder: 'e.g. me and my spouse', value: S.b.contact.deciders, oninput: (e) => { S.b.contact.deciders = e.target.value; changed(); } });
			put(body, ...head('How should contractors reach you?', 'So nobody calls when you’d rather text — and so they know who needs to be there for a site visit.'),
				h('label', { class: 'ds-field' }, h('span', null, 'Mobile number *'), phone),
				h('b', null, 'Best way to reach you'), chipSet(CHANNELS, () => S.b.contact.channel, false, (o) => (S.b.contact.channel = o)),
				h('label', { class: 'ds-field' }, h('span', null, 'Best times'), times), h('label', { class: 'ds-field' }, h('span', null, 'Who makes the decision?'), dec),
				h('b', null, 'Are you getting other quotes?'), chipSet(['Just this one', 'Yes, a few', 'Not sure yet'], () => S.b.contact.others, false, (o) => (S.b.contact.others = o)),
				nav('Next →', () => (String(phone.value).replace(/\D/g, '').length >= 10 ? true : 'Add a phone number so contractors can reach you.')));
			return;
		}
		if (k === 'review') {
			const sc = scoreBrief(S.b, S.prop, !!(S.design && S.design.after));
			const pros = basketList();
			const consent = h('input', { type: 'checkbox' });
			const err = h('p', { class: 'ds-err', role: 'alert' });
			const send = h('button', { class: 'ds-btn ds-wide ds-btn-big' }, icon('send', 18), ` Send to ${pros.length} contractor${pros.length === 1 ? '' : 's'}`);
			const sum = (l, v, step) => v ? h('button', { class: 'ds-rq-sum', onclick: () => go(STEPS.findIndex((x) => x[0] === step)) }, h('small', null, l), h('span', null, v), h('em', null, 'Edit')) : null;
			put(body, ...head('Review and send'),
				sc.missing.length ? h('div', { class: 'ds-rq-missing' }, h('b', null, `Still missing (${sc.missing.length}) — optional, but each one saves a phone call:`), h('ul', null, ...sc.missing.slice(0, 8).map((x) => h('li', null, h('button', { class: 'ds-link', onclick: () => go(STEPS.findIndex((s) => s[0] === x.step)) }, x.what), h('small', null, ' — ' + x.why))))) : h('p', { class: 'ds-ok' }, '✅ Your request is complete. Contractors can price this without calling you.'),
				h('div', { class: 'ds-rq-sums' },
					sum('Going to', pros.map((p) => p.business).join(', ') || '— nobody yet —', 'who'), sum('Services', [...S.b.services, S.b.other].filter(Boolean).join(', '), 'services'),
					sum('Description', S.b.description.slice(0, 160) + (S.b.description.length > 160 ? '…' : ''), 'describe'), sum('Property', S.prop ? S.prop.address : '', 'property'),
					sum('Design', S.design ? S.design.title : '', 'design'), sum('Budget', S.b.budget + (S.b.financing ? ' · financing' : ''), 'money'), sum('Timing', [S.b.timing.start, S.b.timing.deadline ? 'by ' + S.b.timing.deadline : ''].filter(Boolean).join(', '), 'money'),
					sum('Must-haves', S.b.priorities.must.join(', '), 'priorities'), sum('Contact', [S.b.contact.channel, S.b.contact.times].filter(Boolean).join(', '), 'contact')),
				h('label', { class: 'ds-check ds-consent' }, consent, ` Share my name, phone, email, address, photos and this request with ${pros.length === 1 ? pros[0].business : 'the ' + pros.length + ' contractors above'}. They’ll use it only to quote this project.`),
				err, h('div', { class: 'ds-row ds-wrap ds-wiz-nav' }, h('button', { class: 'ds-btn ds-ghost', onclick: () => go(S.step - 1) }, '← Back'), h('div', { class: 'ds-spacer' }), send));
			send.onclick = async () => {
				err.textContent = '';
				if (!pros.length) { err.textContent = 'Add at least one contractor (step 1).'; return; }
				if (!consent.checked) { err.textContent = 'Tick the box to confirm the contractors may see your details.'; return; }
				send.disabled = true; send.textContent = 'Sending…';
				try {
					const r = await api('req/send', { body: { pros: pros.map((p) => p.id), brief: S.b, property: S.prop ? S.prop.id : 0, design: S.design || null, phone: S.b.contact.phone || (session.user && session.user.phone) || '', consent: true, title: S.design ? S.design.title : '' } });
					basketClear();
					done(r);
				} catch (e) { err.textContent = e.message; send.disabled = false; send.textContent = 'Try again'; }
			};
			return;
		}
	};
	const done = (r) => {
		meter.innerHTML = '';
		body.innerHTML = '';
		put(body, h('div', { class: 'ds-soon' }, h('div', { class: 'ds-soon-ic' }, r.sent.length ? '🎉' : '⚠️'),
			h('h3', null, r.sent.length ? `Sent to ${r.sent.length} contractor${r.sent.length > 1 ? 's' : ''}` : 'Nothing was sent'),
			r.sent.length ? h('p', null, 'Each one now has your full brief. They can message you, book a visit and send a quote — you’ll get an alert for each, and everything shows in Messages and My Projects.') : null),
			r.sent.length ? h('ul', { class: 'ds-can' }, ...r.sent.map((x) => h('li', null, '✅ ' + x.business))) : null,
			r.skipped.length ? h('div', { class: 'ds-hub-card' }, h('b', null, 'Not sent to:'), h('ul', null, ...r.skipped.map((x) => h('li', null, `${x.business || 'A contractor'} — ${x.reason}`)))) : null,
			h('div', { class: 'ds-row ds-wrap' }, h('button', { class: 'ds-btn', onclick: () => { m.remove(); R.ctx.openInbox(); } }, '💬 Go to Messages'), h('button', { class: 'ds-btn ds-ghost', onclick: () => { m.remove(); R.ctx.openProjects(); } }, '📋 My Projects')));
	};
	drawMeter();
	draw();
}

export const requestHelp = () => openHelp('request');
export { HELP };

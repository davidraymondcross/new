/* DreamScaper – homeowner side of the contractor network.
 *
 * Find a Local Contractor (ratings, reviews, Dream-to-Reality score, finished Dreamscapes),
 * Request a quote (design + guided property capture), and My Projects — the customer portal
 * inside the homeowner's own DreamScaper account: quotes to sign, who they hired, schedule,
 * invoices to pay, history of past hires and reviews.
 */
import { h, put, icon } from './util.js?v=2.7.8';
import { addressField } from './address.js?v=2.7.8';
import { session, api } from './api.js?v=2.7.8';
import { modal, camera, pickFile, aerial } from './capture.js?v=2.7.8';
import { money } from './takeoff.js?v=2.7.8';
import { initRequest, openRequest, basketButton, basketBar, basketAddAll, basketHas } from './request.js?v=2.7.8';
import { initCalendar, myCalendar, apptCard } from './calendar.js?v=2.7.8';
import { sectionHead, tip } from './explain.js?v=2.7.8';

let H = null; // { ctx, body, stack, cur }
const toast = (m, ms) => H && H.ctx.toast(m, ms);
const SERVICES = ['Landscape design', 'Planting', 'Mulch & stone', 'Lawn installation', 'Patios & walkways', 'Retaining walls', 'Landscape lighting', 'Fencing', 'Drainage & grading', 'Tree work', 'Lawn care'];
const day = (t) => new Date(t).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const when = (t) => new Date(t).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** The guided property capture. Each step says exactly what to shoot and WHY. */
export const CAPTURE_STEPS = [
	{ id: 'aerial', icon: '🛰️', title: 'Bird’s-eye view of your property', how: 'We’ll load the state’s 3-inch aerial photo for your address. Center your house and yard under the crosshair.', why: 'It’s to scale, so your contractor can measure lawn, beds, patios and walkways accurately from above — before they ever visit.', aerial: true },
	{ id: 'front', icon: '📸', title: 'Photograph the front of your house', how: 'Stand about 30–50 feet away (at the street or the end of the driveway) and capture the entire house from ground level. Hold the phone level at eye height.', why: 'This helps us understand the relationship between your house, foundation, existing beds and the proposed landscape.' },
	{ id: 'left', icon: '⬅️', title: 'Photograph the left side', how: 'Facing the house, walk to the left corner. Stand 20–30 feet back so the whole side yard, from front to back, is in the picture.', why: 'Side yards hide slopes, downspouts, utility meters and gates that affect access for equipment and how water drains.' },
	{ id: 'right', icon: '➡️', title: 'Photograph the right side', how: 'Now the right corner, the same way: 20–30 feet back, the whole side yard in view.', why: 'Same reason — access, drainage and utilities on this side, plus how the yard connects front to back.' },
	{ id: 'back', icon: '🏡', title: 'Photograph the backyard', how: 'Stand at a back corner of the house and capture as much of the yard as you can. Then turn around and take one looking back at the house.', why: 'Shows where patios, beds and lawn can go, slopes, shade from trees, and how you use the space.' },
	{ id: 'structures', icon: '🏚️', title: 'Important structures', how: 'Photograph anything near the work area: sheds, decks, fences, retaining walls, pools, A/C units, utility boxes, well heads, septic or propane covers.', why: 'Structures and utilities decide what can be built where — and what the crew has to protect.' },
	{ id: 'existing', icon: '🌳', title: 'Existing landscape', how: 'Get closer photos of beds, trees and shrubs you want to keep or remove, and any problem spots: bare patches, wet areas, erosion.', why: 'Tells the contractor what stays, what goes, and any drainage or soil problems to fix first.' }
];

export function initHire(ctx) {
	H = { ctx, body: null, stack: [], cur: null };
	const rctx = { get root() { return ctx.root; }, toast: (m, ms) => ctx.toast(m, ms), requireSignIn: ctx.requireSignIn, pickDesign: ctx.pickDesign, propertyWizard: (p) => propertyWizard(p), openInbox: () => ctx.openInbox && ctx.openInbox(), openProjects: () => openProjects(), openFind: () => openFind() };
	initRequest(rctx);
	initCalendar(rctx);
}

function shell(title, view) {
	const { ctx } = H;
	ctx.leave();
	const root = ctx.root;
	root.innerHTML = '';
	const body = h('div', { class: 'ds-cm-body' });
	root.append(ctx.header(), h('main', { class: 'ds-home ds-comm ds-hire' },
		h('div', { class: 'ds-cm-bar' }, h('button', { class: 'ds-btn ds-ghost ds-sm ds-cm-back', onclick: back, 'aria-label': 'Back' }, '←', h('span', null, ' Back')), h('h1', null, title), h('div', { class: 'ds-spacer' }),
			h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => go({ v: 'projects' }) }, '📋', h('span', { class: 'ds-hide-sm' }, ' My Projects')),
			h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => go({ v: 'calendar' }) }, '📅', h('span', { class: 'ds-hide-sm' }, ' Calendar')),
			h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => go({ v: 'find' }) }, '🔎', h('span', { class: 'ds-hide-sm' }, ' Find a contractor'))), body,
		basketBar(() => openRequest({ design: H.design }))));
	H.body = body;
	H.stack = [];
	H.cur = null;
	go(view);
}
function back() { if (H.stack.length) render(H.stack.pop()); else H.ctx.home(); }
function go(view, push = true) {
	if (!H.body || !H.body.isConnected) return shell(view.v === 'projects' ? '📋 My Projects' : view.v === 'calendar' ? '📅 My Calendar' : '🔎 Find a Local Contractor', view);
	if (push && H.cur) H.stack.push(H.cur);
	render(view);
}
function render(view) {
	H.cur = view;
	H.body.innerHTML = '';
	const sc = H.body.closest('.ds-home');
	if (sc) sc.scrollTop = 0;
	const t = H.body.closest('main').querySelector('h1');
	if (t) t.textContent = view.v === 'projects' ? '📋 My Projects' : view.v === 'calendar' ? '📅 My Calendar' : view.v === 'pro' ? '🔎 Contractor' : '🔎 Find a Local Contractor';
	if (session.crm && session.crm.on === false) { H.body.append(h('div', { class: 'ds-soon' }, h('div', { class: 'ds-soon-ic' }, '🧰'), h('h2', null, 'Coming soon'))); return; }
	({ find: viewFind, pro: viewPro, projects: viewProjects, calendar: viewCalendar }[view.v] || viewFind)(H.body, view);
}
async function viewCalendar(b) {
	if (!(await H.ctx.requireSignIn('Sign in to see your appointments.'))) return H.ctx.home();
	myCalendar(b);
}
export function openCalendar() { shell('📅 My Calendar', { v: 'calendar' }); }

export function openFind(opts = {}) { if (opts.design) H.design = opts.design; shell('🔎 Find a Local Contractor', opts.pro ? { v: 'pro', id: opts.pro } : { v: 'find' }); }
export function openProjects() { shell('📋 My Projects', { v: 'projects' }); }
export { openRequest };

/* ------------------------------------------------------------------ find */

const stars = (v) => { const r = Math.round(v * 2) / 2; return '★'.repeat(Math.floor(r)) + (r % 1 ? '⯪' : '') + '☆'.repeat(5 - Math.ceil(r)); };

const SOC_IC = { facebook: 'f', instagram: '◎', google: 'G', houzz: 'h', youtube: '▶', tiktok: '♪', x: '𝕏', linkedin: 'in', pinterest: 'P', nextdoor: 'n', yelp: 'y', angi: 'a', bbb: 'B' };
function socialRow(list, small) {
	if (!list || !list.length) return null;
	return h('div', { class: 'ds-socials' + (small ? ' sm' : '') }, ...list.map((x) => h('a', { class: 'ds-soc ds-soc-' + x.key, href: x.url, target: '_blank', rel: 'noopener noreferrer nofollow ugc', 'aria-label': x.label, title: x.label, onclick: (e) => e.stopPropagation() }, h('span', { 'aria-hidden': 'true' }, SOC_IC[x.key] || '↗'), small ? null : h('small', null, x.label))));
}
function proCard(p) {
	return h('div', { class: 'ds-pro-wrap' + (p.featured ? ' featured' : '') }, proCardMain(p), h('div', { class: 'ds-pro-foot' }, p.featured ? h('small', { class: 'ds-qs' }, '⭐ Featured') : null, socialRow((p.socials || []).slice(0, 3), true), h('div', { class: 'ds-spacer' }), basketButton(p)));
}
function proCardMain(p) {
	return h('button', { class: 'ds-pro-card', onclick: () => go({ v: 'pro', id: p.id }) },
		p.logo ? h('img', { class: 'ds-pro-logo', src: p.logo, alt: '', loading: 'lazy' }) : h('span', { class: 'ds-pro-logo' }, '🧰'),
		h('span', { class: 'ds-grow' },
			h('b', null, p.business),
			h('small', null, [p.town, p.miles != null ? `${p.miles} mi away` : '', p.serves === false ? 'may travel' : ''].filter(Boolean).join(' · ')),
			h('span', { class: 'ds-pro-stats' },
				p.reviews ? h('span', { class: 'ds-stars-s', title: `${p.rating} out of 5` }, stars(p.rating), ` ${p.rating} (${p.reviews})`) : h('span', { class: 'ds-muted' }, 'New on DreamScaper'),
				p.reality_n ? h('span', { class: 'ds-d2r', title: 'How well past customers say they turned the Dreamscape into reality' }, `🌱→🏡 ${p.reality}/5`) : null,
				p.jobs ? h('span', null, `${p.jobs} job${p.jobs > 1 ? 's' : ''} done`) : null),
			h('span', { class: 'ds-row ds-wrap' }, p.licensed ? h('small', { class: 'ds-qs' }, '✔ Licensed') : null, p.insured ? h('small', { class: 'ds-qs' }, '✔ Insured') : null, p.pay ? h('small', { class: 'ds-qs' }, '💳 Pay online') : null, ...p.services.slice(0, 3).map((s) => h('small', { class: 'ds-tagchip' }, s)))));
}

async function viewFind(b, view) {
	const near = h('input', { type: 'search', placeholder: 'Your town or ZIP', value: view.near || '', 'aria-label': 'Your town or ZIP', autocomplete: 'postal-code' });
	const q = h('input', { type: 'search', placeholder: 'Business name (optional)', value: view.q || '', 'aria-label': 'Business name' });
	let service = view.service || '', sort = view.sort || '';
	const chips = h('div', { class: 'ds-chips' }, ...['', ...SERVICES].map((s) => h('button', { class: 'ds-chip' + (s === service ? ' on' : ''), onclick: (e) => { service = s; for (const c of chips.children) c.classList.remove('on'); e.currentTarget.classList.add('on'); load(); } }, s || 'Everything')));
	const sortSel = h('select', { 'aria-label': 'Sort', onchange: (e) => { sort = e.target.value; load(); } }, ...[['', 'Nearest'], ['rating', 'Top rated'], ['reality', 'Best Dream-to-Reality']].map(([v, l]) => h('option', { value: v, selected: v === sort }, l)));
	const list = h('div', { class: 'ds-pro-list' });
	const status = h('p', { class: 'ds-hint' });
	const addAll = h('button', { class: 'ds-btn ds-ghost ds-sm', hidden: true }, '➕ Add everyone who serves my area');
	put(b, sectionHead('find'), tip('find', 'Tap “+ Add to my request” on as many contractors as you like — one guided form goes to all of them.'), H.design ? h('div', { class: 'ds-hire-design' }, H.design.after ? h('img', { src: H.design.after, alt: '' }) : null, h('div', null, h('b', null, `Getting quotes for “${H.design.title}”`), h('small', null, 'Pick a contractor, then tap Request a quote. Your design and its plant list go with it.'))) : null,
		h('p', { class: 'ds-hint' }, 'Local landscapers who work in DreamScaper. See real reviews — including how well they turned other people’s Dreamscapes into real yards — then send them your design for a quote.'),
		h('div', { class: 'ds-row ds-wrap ds-find-bar' }, near, q, sortSel, h('button', { class: 'ds-btn', onclick: () => load() }, icon('search', 18), ' Search')), chips, h('div', { class: 'ds-row ds-wrap' }, status, h('div', { class: 'ds-spacer' }), addAll), list);
	let t = 0;
	const load = async () => {
		Object.assign(H.cur, { near: near.value, q: q.value, service, sort });
		list.innerHTML = '';
		list.append(h('span', { class: 'ds-spin' }));
		try {
			const r = await api('crm/pros', { query: { near: near.value, q: q.value, service, sort } });
			list.innerHTML = '';
			status.textContent = r.located ? `Contractors that work near ${r.near || 'you'}` : 'Add your town or ZIP to see who works near you.';
			if (!r.items.length) list.append(h('div', { class: 'ds-soon' }, h('p', null, 'No contractors found yet in that area.'), h('p', { class: 'ds-hint' }, 'Know a great landscaper? Tell them about DreamScaper — any contractor can apply from My Account.')));
			r.items.forEach((p) => list.append(proCard(p)));
			const serving = r.items.filter((p) => p.serves !== false && p.accepting !== false);
			addAll.hidden = !serving.length;
			addAll.textContent = `➕ Add all ${serving.length} who serve${r.near ? ' ' + r.near : ' your area'}${service ? ' for ' + service : ''}`;
			addAll.onclick = () => { basketAddAll(serving); load(); toast(`${serving.length} contractors added to your request.`); };
		} catch (e) { list.innerHTML = ''; list.append(h('p', { class: 'ds-err' }, e.message)); }
	};
	near.addEventListener('keydown', (e) => { if (e.key === 'Enter') load(); });
	q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 400); });
	if (!near.value && session.user && session.user.town) near.value = session.user.town;
	load();
}

async function viewPro(b, view) {
	b.append(h('span', { class: 'ds-spin' }));
	let p;
	try { p = await api('crm/pro', { query: { id: view.id } }); } catch (e) { b.innerHTML = ''; b.append(h('p', { class: 'ds-err' }, e.message)); return; }
	b.innerHTML = '';
	const total = Object.values(p.stars || {}).reduce((a, n) => a + n, 0) || 1;
	put(b,
		h('div', { class: 'ds-pro-head' },
			p.logo ? h('img', { class: 'ds-pro-logo ds-pro-logo-l', src: p.logo, alt: '' }) : h('span', { class: 'ds-pro-logo ds-pro-logo-l' }, '🧰'),
			h('div', null, h('h2', null, p.business), h('p', { class: 'ds-muted' }, [p.town && p.town + (p.state ? ', ' + p.state : ''), p.years ? `${p.years} years in business` : '', p.since ? 'on DreamScaper since ' + new Date(p.since).getFullYear() : ''].filter(Boolean).join(' · ')),
				h('div', { class: 'ds-row ds-wrap' }, p.licensed ? h('span', { class: 'ds-qs' }, '✔ Licensed ' + (p.license || '')) : null, p.insured ? h('span', { class: 'ds-qs' }, '✔ Insured') : null, p.pay ? h('span', { class: 'ds-qs' }, '💳 Takes online payments') : null, p.hired ? h('span', { class: 'ds-qs' }, '🤝 You’ve hired them') : null))),
		h('div', { class: 'ds-row ds-wrap' },
			p.accepting === false ? h('span', { class: 'ds-qs' }, 'Not taking new requests right now') : h('button', { class: 'ds-btn', onclick: () => openRequest({ pros: [p], design: H.design }) }, '📝 Request a quote'),
			p.accepting === false ? null : basketButton(p, false),
			p.phone ? h('a', { class: 'ds-btn ds-ghost', href: 'tel:' + p.phone.replace(/[^\d+]/g, '') }, '📞 Call') : null,
			p.website ? h('a', { class: 'ds-btn ds-ghost', href: p.website, target: '_blank', rel: 'noopener' }, icon('globe', 16), ' Website') : null,
			H.ctx.messagePro ? h('button', { class: 'ds-btn ds-ghost', onclick: async () => { if (await H.ctx.requireSignIn('Sign in to message contractors.')) H.ctx.messagePro(p.id); } }, icon('chat', 16), ' Message') : null),
		socialRow(p.socials),
		h('div', { class: 'ds-pro-scores' },
			h('div', { class: 'ds-score' }, h('b', null, p.reviews ? p.rating.toFixed(1) : '—'), h('span', { class: 'ds-stars-s' }, stars(p.rating)), h('small', null, `${p.reviews} review${p.reviews === 1 ? '' : 's'}`)),
			h('div', { class: 'ds-score' }, h('b', null, p.reality_n ? p.reality.toFixed(1) : '—'), h('span', null, '🌱 → 🏡'), h('small', null, 'Dream-to-Reality', h('br'), 'how closely the finished yard matched the Dreamscape')),
			h('div', { class: 'ds-score' }, h('b', null, String(p.jobs)), h('span', null, '🛠️'), h('small', null, 'DreamScaper jobs done')),
			h('div', { class: 'ds-bars' }, ...[5, 4, 3, 2, 1].map((s) => h('div', { class: 'ds-bar' }, h('small', null, s + '★'), h('i', null, h('em', { style: { width: Math.round(((p.stars[s] || 0) / total) * 100) + '%' } })), h('small', null, String(p.stars[s] || 0)))))),
		p.gallery && p.gallery.length ? h('section', { class: 'ds-hub-card' }, h('h2', null, 'Our work'), h('div', { class: 'ds-gallery' }, ...p.gallery.map((g) => h('a', { href: g.url, target: '_blank', rel: 'noopener' }, h('img', { src: g.url, alt: g.caption || 'Finished project', loading: 'lazy' }))))) : null,
		p.bio ? h('section', { class: 'ds-hub-card' }, h('h2', null, 'About'), h('p', { class: 'ds-pre' }, p.bio), p.services.length ? h('div', { class: 'ds-chips' }, ...p.services.map((s) => h('span', { class: 'ds-tagchip' }, s))) : null) : null,
		h('section', { class: 'ds-hub-card' }, h('h2', null, `Dreamscapes they made real (${p.portfolio.length})`),
			p.portfolio.length ? h('div', { class: 'ds-portfolio' }, ...p.portfolio.map((x) => h('figure', { class: 'ds-pf' },
				h('div', { class: 'ds-pf-imgs' }, x.before ? h('img', { src: x.before, alt: 'Before', loading: 'lazy' }) : null, h('img', { src: x.design, alt: 'Dreamscape design', loading: 'lazy' }), x.finished ? h('img', { src: x.finished, alt: 'Finished yard', loading: 'lazy' }) : null),
				h('figcaption', null, h('b', null, x.title), h('small', null, [x.before ? 'Before' : '', 'Design', x.finished ? 'Finished' : ''].filter(Boolean).join(' → ')), x.stars ? h('small', null, `${stars(x.stars)}${x.reality ? ` · Dream-to-Reality ${x.reality}/5` : ''}`) : null)))) : h('p', { class: 'ds-muted' }, 'No finished DreamScaper projects shown yet.')),
		h('section', { class: 'ds-hub-card' }, h('h2', null, 'Reviews'),
			p.reviews_list.length ? h('div', null, ...p.reviews_list.map((r) => h('div', { class: 'ds-review' },
				h('div', { class: 'ds-row ds-wrap' }, h('b', { class: 'ds-stars-s' }, stars(r.stars)), r.reality ? h('span', { class: 'ds-d2r' }, `🌱→🏡 ${r.reality}/5`) : null, h('small', { class: 'ds-muted' }, `${r.by.name} · ${new Date(r.at).toLocaleDateString()}`)),
				r.project ? h('small', { class: 'ds-muted' }, r.project) : null, r.text ? h('p', null, r.text) : null,
				r.design || r.photo ? h('div', { class: 'ds-review-imgs' }, r.design ? h('figure', null, h('img', { src: r.design, alt: '', loading: 'lazy' }), h('figcaption', null, 'Their Dreamscape')) : null, r.photo ? h('figure', null, h('img', { src: r.photo, alt: '', loading: 'lazy' }), h('figcaption', null, 'The finished yard')) : null) : null,
				r.reply ? h('p', { class: 'ds-review-reply' }, h('b', null, p.business + ': '), r.reply) : null))) : h('p', { class: 'ds-muted' }, 'No reviews yet.')));
}

/* ----------------------------------------------------------- request a quote */

/**
 * Guided property capture: address → aerial → front → left → right → back → structures → existing.
 * Saves to the homeowner's account after every step. Resolves the property (or null).
 */
export function propertyWizard(prop) {
	return new Promise((resolve) => {
		let p = prop ? JSON.parse(JSON.stringify(prop)) : null;
		const photos = p ? (p.photos || []).slice() : [];
		const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => { m.remove(); resolve(p); } }, icon('close'));
		const body = h('div');
		const m = modal(H.ctx.root, 'Let’s build your property plan', [body], close, 'ds-modal-wide ds-wizard');
		const save = async (patch) => {
			const r = await api('crm/myproperty', { body: { id: p ? p.id : 0, ...patch } });
			p = r;
			photos.length = 0; photos.push(...(r.photos || []));
			return r;
		};
		const addr = () => {
			body.innerHTML = '';
			const u = session.user || {};
			const a = h('input', { type: 'text', autocomplete: 'street-address', placeholder: '123 Example Street, Farmington, CT', value: (p && p.address) || [u.address, u.town].filter(Boolean).join(', ') });
			const err = h('p', { class: 'ds-err' });
			const next = h('button', { class: 'ds-btn ds-wide' }, 'Create my property →');
			put(body, h('h3', null, 'Step 1 — Your address'), h('p', { class: 'ds-hint' }, 'We create a property record for this address. Everything you capture is saved to your DreamScaper account and only shared with contractors you choose.'), addressField(a), err, next);
			next.onclick = async () => { if (a.value.trim().length < 6) { err.textContent = 'Enter the street, town and state.'; return; } next.disabled = true; try { await save({ address: a.value.trim() }); stepAt(0); } catch (e) { err.textContent = e.message; next.disabled = false; } };
			setTimeout(() => a.focus(), 50);
		};
		const stepAt = (i) => {
			if (i >= CAPTURE_STEPS.length) return done();
			const s = CAPTURE_STEPS[i];
			const mine = s.aerial ? (p.aerial ? [{ url: p.aerial }] : []) : photos.filter((x) => x.step === s.id);
			body.innerHTML = '';
			const err = h('p', { class: 'ds-err' });
			const prog = h('div', { class: 'ds-wiz-prog', 'aria-label': `Step ${i + 1} of ${CAPTURE_STEPS.length}` }, ...CAPTURE_STEPS.map((x, k) => h('button', { class: 'ds-wiz-dot' + (k === i ? ' on' : '') + ((x.aerial ? p.aerial : photos.some((y) => y.step === x.id)) ? ' done' : ''), title: x.title, 'aria-label': x.title, onclick: () => stepAt(k) }, x.icon)));
			const add = async (getShot) => {
				err.textContent = '';
				const shot = await getShot();
				if (!shot) return;
				if (shot.error) { err.textContent = shot.error; return; }
				const c = shot.bitmap;
				const url = c.toDataURL('image/jpeg', 0.85);
				body.classList.add('ds-busy');
				try {
					if (s.aerial) await save({ aerial: url, ppf: shot.ppf || 0 });
					else await save({ photos: [...photos, { step: s.id, url }] });
					stepAt(i);
				} catch (e) { err.textContent = e.message; }
				body.classList.remove('ds-busy');
			};
			put(body, prog, h('p', { class: 'ds-muted ds-sm-text' }, `Step ${i + 2} of ${CAPTURE_STEPS.length + 1}`),
				h('h3', null, `${s.icon} ${s.title}`),
				h('p', null, s.how),
				h('p', { class: 'ds-why' }, h('b', null, 'Why? '), s.why),
				mine.length ? h('div', { class: 'ds-prop-photos' }, ...mine.map((x) => h('span', { class: 'ds-ph' }, h('img', { src: x.url, alt: s.title }), s.aerial ? null : h('button', { class: 'ds-icon-btn', 'aria-label': 'Remove photo', onclick: async () => { await save({ photos: photos.filter((y) => y !== x) }).catch((e2) => (err.textContent = e2.message)); stepAt(i); } }, icon('close', 12))))) : null,
				h('div', { class: 'ds-row ds-wrap' },
					s.aerial ? h('button', { class: 'ds-btn', onclick: () => add(() => aerial(H.ctx.root, H.ctx.cfg, toast)) }, '🛰️ ' + (mine.length ? 'Load it again' : 'Load my aerial view')) : h('button', { class: 'ds-btn', onclick: () => add(() => camera(H.ctx.root, s.how)) }, icon('camera', 18), mine.length ? ' Add another' : ' Take photo'),
					s.aerial ? null : h('button', { class: 'ds-btn ds-ghost', onclick: () => add(() => pickFile()) }, icon('upload', 18), ' Upload')),
				s.aerial ? h('p', { class: 'ds-hint' }, 'Aerial photos cover US addresses (sharpest in Connecticut). Can’t find yours? Skip this step — the contractor will measure on site.') : null,
				err,
				h('div', { class: 'ds-row ds-wrap ds-wiz-nav' }, i > 0 ? h('button', { class: 'ds-btn ds-ghost', onclick: () => stepAt(i - 1) }, '← Back') : h('button', { class: 'ds-btn ds-ghost', onclick: addr }, '← Address'), h('div', { class: 'ds-spacer' }), h('button', { class: 'ds-btn' + (mine.length ? '' : ' ds-ghost'), onclick: () => stepAt(i + 1) }, mine.length ? 'Next →' : 'Skip →')));
		};
		const done = () => {
			body.innerHTML = '';
			const n = photos.length + (p.aerial ? 1 : 0);
			put(body, h('div', { class: 'ds-soon' }, h('div', { class: 'ds-soon-ic' }, '✅'), h('h3', null, 'Your property is ready'), h('p', null, `${n} view${n === 1 ? '' : 's'} saved for ${p.address}. Contractors you request quotes from will see them — so their quote is accurate the first time.`)),
				h('button', { class: 'ds-btn ds-wide', onclick: () => { m.remove(); resolve(p); } }, 'Done'));
		};
		if (p && p.address) stepAt(0); else addr();
	});
}

/* ------------------------------------------------------------ My Projects */

async function viewProjects(b) {
	if (!(await H.ctx.requireSignIn('Sign in to see your projects and quotes.'))) return H.ctx.home();
	b.append(h('span', { class: 'ds-spin' }));
	let r;
	try { r = await api('crm/portal'); } catch (e) { b.innerHTML = ''; b.append(h('p', { class: 'ds-err' }, e.message)); return; }
	b.innerHTML = '';
	const waiting = r.items.filter((x) => x.status === 'sent' || x.status === 'viewed');
	const active = r.items.filter((x) => x.status === 'signed' && x.job_status !== 'done' && x.job_status !== 'cancelled');
	const done = r.items.filter((x) => x.status === 'signed' && x.job_status === 'done');
	const requests = r.items.filter((x) => x.status === 'request' || x.status === 'draft');
	const other = r.items.filter((x) => ['declined', 'expired'].includes(x.status));
	const dueInv = [...r.items.flatMap((x) => x.invoices), ...r.invoices].filter((i) => i.status === 'sent');
	const sec = (title, kids, empty) => h('section', { class: 'ds-hub-card' }, h('h2', null, title), ...(kids.length ? kids : [h('p', { class: 'ds-muted' }, empty)]));
	const upcoming = r.items.flatMap((x) => x.visits || []).filter((v) => v.end >= Date.now() && v.status !== 'cancelled').sort((a, c) => a.start - c.start);
	put(b, sectionHead('projects', h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => openRequest({ design: H.design }) }, '📝 Request quotes')),
		upcoming.length ? sec(`📅 Coming up (${upcoming.length})`, [...upcoming.slice(0, 3).map((v) => apptCard(v, () => render(H.cur))), upcoming.length > 3 ? h('button', { class: 'ds-link', onclick: () => go({ v: 'calendar' }) }, 'See all on My Calendar →') : null].filter(Boolean), '') : null,
		!r.items.length ? h('div', { class: 'ds-soon' }, h('div', { class: 'ds-soon-ic' }, '📋'), h('h2', null, 'No projects yet'), h('p', null, 'Design your yard, then find a local contractor to make it real. Their quotes, your signed agreements, schedule and invoices all show up here.'), h('button', { class: 'ds-btn', onclick: () => go({ v: 'find' }) }, '🔎 Find a Local Contractor')) : null,
		dueInv.length ? sec(`💵 Invoices to pay (${dueInv.length})`, dueInv.map((i) => h('a', { class: 'ds-hub-row', href: i.link, target: '_blank', rel: 'noopener' }, h('span', { class: 'ds-grow' }, h('b', null, `${i.number} · ${i.title}`), h('small', null, i.due ? 'Due ' + new Date(i.due + 'T12:00').toLocaleDateString() : '')), h('b', null, money(i.amount, true)))), '') : null,
		waiting.length ? sec(`✍️ Quotes waiting for you (${waiting.length})`, waiting.map((x) => projectCard(x, true)), '') : null,
		active.length ? sec('🛠️ Active jobs', active.map((x) => projectCard(x)), '') : null,
		requests.length ? sec('📨 Requests sent', requests.map((x) => projectCard(x)), '') : null,
		r.hired.length ? sec('🤝 Contractors you’ve hired', r.hired.map((hh) => h('div', { class: 'ds-hub-row' }, h('button', { class: 'ds-link', onclick: () => go({ v: 'pro', id: hh.pro.id }) }, h('b', null, hh.pro.business)), h('small', null, hh.jobs.map((j) => `${j.title} (${j.status.replace('_', ' ')}, ${money(j.total)})`).join(' · ')))), '') : null,
		done.length ? sec('✅ Finished', done.map((x) => projectCard(x)), '') : null,
		other.length ? h('details', { class: 'ds-hub-card' }, h('summary', null, `Older quotes (${other.length})`), ...other.map((x) => projectCard(x))) : null,
		h('section', { class: 'ds-hub-card' }, h('h2', null, '🏡 My property'), h('p', { class: 'ds-hint' }, 'Your address, aerial view and the guided property photos. Contractors you request quotes from see them.'), h('button', { class: 'ds-btn ds-ghost', onclick: async () => { const pr = await api('crm/myproperty').catch(() => ({ items: [] })); await propertyWizard(pr.items[0] || null); } }, '📸 Capture or update my property')));
}

function projectCard(x, sign) {
	const p = x.pro || { business: 'Contractor' };
	const steps = [['request', 'Requested'], ['sent', 'Quote'], ['signed', 'Hired'], ['scheduled', 'Scheduled'], ['done', 'Done']];
	const at = x.job_status === 'done' ? 4 : x.job_status === 'scheduled' || x.job_status === 'in_progress' ? 3 : x.status === 'signed' ? 2 : x.status === 'sent' || x.status === 'viewed' ? 1 : 0;
	return h('div', { class: 'ds-proj' },
		h('div', { class: 'ds-row' }, x.after ? h('img', { class: 'ds-qthumb', src: x.after, alt: '' }) : h('span', { class: 'ds-qthumb' }, '🏡'),
			h('div', { class: 'ds-grow' }, h('b', null, x.title), h('small', null, `${p.business}${x.number ? ' · ' + x.number : ''}${x.total ? ' · ' + money(x.total) : ''}`)),
			x.status === 'declined' || x.status === 'expired' ? h('span', { class: 'ds-qs' }, x.status) : null),
		x.status !== 'declined' && x.status !== 'expired' ? h('ol', { class: 'ds-track' }, ...steps.map(([, l], i) => h('li', { class: i < at ? 'done' : i === at ? 'on' : '' }, l))) : null,
		(x.visits || []).length ? h('div', { class: 'ds-hint' }, '📅 ', x.visits.map((v) => `${v.title}: ${when(v.start)}${v.status === 'done' ? ' ✔' : v.cust_status === 'confirmed' ? ' ✅' : ''}`).join(' · ')) : null,
		x.status === 'request' && x.brief && x.brief.missing && x.brief.missing.length ? h('p', { class: 'ds-hint' }, `Your request is ${x.brief.score}% complete. Adding ${x.brief.missing.slice(0, 2).join(' and ').toLowerCase()} helps contractors quote without calling.`) : null,
		x.status === 'signed' && x.sections.length ? h('details', null, h('summary', null, 'What they’re doing'), ...x.sections.filter((s) => !s.optional).map((s) => h('div', null, h('b', null, s.title), h('ul', null, ...s.scope.map((l) => h('li', null, String(l).replace(/^•\s*/, ''))))))) : null,
		h('div', { class: 'ds-row ds-wrap' },
			x.link ? h('a', { class: 'ds-btn' + (sign ? '' : ' ds-ghost ds-sm'), href: x.link, target: '_blank', rel: 'noopener' }, sign ? '✍️ View & sign' : 'View proposal') : null,
			x.pro && x.pro.phone ? h('a', { class: 'ds-btn ds-ghost ds-sm', href: 'tel:' + x.pro.phone.replace(/[^\d+]/g, '') }, '📞 Call') : null,
			x.thread && H.ctx.openThread ? h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => H.ctx.openThread(x.thread) }, icon('chat', 14), ' Messages') : null,
			x.pro ? h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => go({ v: 'pro', id: x.pro.id }) }, 'Contractor') : null,
			x.status === 'signed' && (x.job_status === 'done' || x.invoices.some((i) => i.status === 'paid')) ? h('button', { class: 'ds-btn ds-sm', onclick: () => reviewSheet(x) }, x.reviewed ? '⭐ Edit my review' : '⭐ Leave a review') : null));
}

function reviewSheet(x) {
	let s1 = 5, s2 = 5, photo = null;
	const starRow = (get, set) => { const box = h('div', { class: 'ds-stars ds-stars-in', role: 'radiogroup' }); const draw = () => { box.innerHTML = ''; for (let i = 1; i <= 5; i++) box.append(h('button', { class: i <= get() ? 'on' : '', 'aria-label': `${i} star${i > 1 ? 's' : ''}`, onclick: () => { set(i); draw(); } }, '★')); }; draw(); return box; };
	const txt = h('textarea', { rows: 4, placeholder: 'How was the work, the crew, communication and cleanup?' });
	const ph = h('div', { class: 'ds-cust-photo' }, x.after ? h('img', { src: x.after, alt: 'Your Dreamscape' }) : h('span', null, '📸'));
	const err = h('p', { class: 'ds-err' });
	const send = h('button', { class: 'ds-btn ds-wide' }, 'Post review');
	const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
	const m = modal(H.ctx.root, `Review ${x.pro ? x.pro.business : 'your contractor'}`, [
		h('p', null, h('b', null, 'Overall')), starRow(() => s1, (v) => (s1 = v)),
		h('p', null, h('b', null, 'Dream-to-Reality: '), 'how closely does your finished yard match your Dreamscape?'), starRow(() => s2, (v) => (s2 = v)),
		txt, h('p', { class: 'ds-hint' }, 'Add a photo of the finished yard — it appears next to your Dreamscape on their profile.'),
		h('div', { class: 'ds-row' }, ph, h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: async () => { const s = await camera(H.ctx.root, 'Stand where you took the “before” photo.'); if (s && s.bitmap) { photo = s.bitmap.toDataURL('image/jpeg', 0.85); ph.innerHTML = ''; ph.append(h('img', { src: photo, alt: '' })); } } }, icon('camera', 16), ' Finished photo')),
		err, send], close);
	send.onclick = async () => {
		send.disabled = true;
		try {
			const r = await api('crm/review', { body: { quote_id: x.id, stars: s1, reality: s2, text: txt.value, photo } });
			m.remove(); toast('Thanks! Your review is posted.'); render(H.cur);
			if (r && r.also) {
				const c2 = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m2.remove() }, icon('close'));
				const m2 = modal(H.ctx.root, 'Thank you!', [h('p', null, `Would you share it on ${r.also.label} too? It helps ${r.also.business} more than almost anything — it takes a minute.`),
					h('div', { class: 'ds-row ds-wrap' }, h('a', { class: 'ds-btn', href: r.also.url, target: '_blank', rel: 'noopener noreferrer nofollow ugc', onclick: () => m2.remove() }, `Review on ${r.also.label}`), h('button', { class: 'ds-btn ds-ghost', onclick: () => m2.remove() }, 'No thanks'))], c2);
			}
		} catch (e) { err.textContent = e.message; send.disabled = false; }
	};
}

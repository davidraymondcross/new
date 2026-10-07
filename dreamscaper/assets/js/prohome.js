/* DreamScaper – the contractor's home screen.
 *
 * Contractors and homeowners get very different apps. An approved contractor lands here: today's
 * schedule, what needs them (new requests, replies, unpaid invoices), and big buttons for every
 * part of running the business. The design studio is still one tap away (to design for a
 * customer), and "Use DreamScaper as a homeowner" switches to the homeowner home for their own
 * yard. Homeowners never see any of this — the contractor tools are only offered to them as a
 * small "Are you a contractor?" link, and the server refuses contractor actions from anyone else.
 */
import { h, put, icon } from './util.js?v=2.7.5';
import { api, session } from './api.js?v=2.7.5';

const hm = (t) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const money = (v) => '$' + Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });

/**
 * ctx: { root, header(), openHub(view), newQuote(), newProject(), myDreamscapes(), assetLibrary(), plantId(), inbox(), homeowner() }
 */
export function proHome(ctx) {
	const root = ctx.root;
	root.innerHTML = '';
	const pro = (session.crm && session.crm.pro) || {};
	const first = ((session.user && session.user.name) || '').split(' ')[0];
	const hr = new Date().getHours();
	const hello = `${hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening'}${first ? ', ' + first : ''}`;
	const today = h('section', { class: 'ds-ph-today' }, h('span', { class: 'ds-spin' }));
	const kpis = h('div', { class: 'ds-ph-kpis' });
	const tile = (emoji, label, sub, fn, extra = '') => h('button', { class: 'ds-tile' + extra, onclick: fn }, h('span', { class: 'ds-tile-ic', 'aria-hidden': 'true' }, emoji), h('b', null, label), sub ? h('small', null, sub) : null);
	const reqN = pro.requests || 0;
	const main = h('main', { class: 'ds-home ds-home2 ds-prohome' },
		h('header', { class: 'ds-ph-head' },
			h('div', null, h('p', { class: 'ds-ph-kicker' }, '🧰 Contractor Hub'), h('h1', null, hello), pro.business ? h('p', { class: 'ds-muted' }, pro.business) : null),
			h('button', { class: 'ds-btn', onclick: () => ctx.newQuote() }, icon('plus', 18), ' New quote')),
		kpis, today,
		h('nav', { class: 'ds-tiles ds-ph-tiles', 'aria-label': 'Run your business' },
			tile('📅', 'Calendar', 'Month view · tap a day to book', () => ctx.openHub({ v: 'schedule', mode: 'month' })),
			tile('🚪', 'Door-to-door', 'Map every house you knock', () => ctx.openHub({ v: 'canvass' })),
			tile('📐', 'Landscape plans', 'Step-by-step measured 2D plans', () => ctx.openHub({ v: 'plans' })),
			tile('📏', 'Measure property', 'Lawns, roofs, beds & lots from above', () => ctx.openHub({ v: 'measure' })),
			tile('🗺️', 'Route planner', 'Shortest day: stops, lunch & fuel', () => ctx.openHub({ v: 'routes' })),
			tile('👥', 'Customers', 'People, properties & history', () => ctx.openHub({ v: 'customers' })),
			tile('🧾', 'Quotes & requests', reqN ? `${reqN} new request${reqN > 1 ? 's' : ''}` : 'Estimates & proposals', () => ctx.openHub({ v: 'quotes' }), reqN ? ' ds-tile-hot' : ''),
			tile('🛠️', 'Jobs', 'Signed work & job costing', () => ctx.openHub({ v: 'jobs' })),
			tile('💵', 'Invoices & payments', 'Card, bank & instant payouts', () => ctx.openHub({ v: 'invoices' })),
			tile('💬', 'Messages', 'Customers & leads', () => ctx.openHub({ v: 'inbox' })),
			tile('📊', 'Dashboard', 'Pipeline & numbers', () => ctx.openHub({ v: 'dash' })),
			tile('⚙️', 'Settings', 'Business, crew & hours, messages', () => ctx.openHub({ v: 'settings' })),
			tile('💳', 'Plan & billing', pro.sub && pro.sub.plan ? pro.sub.plan + ' plan' : 'Your subscription', () => ctx.openHub({ v: 'plan' }))),
		h('section', { class: 'ds-ph-studio' },
			h('h2', null, '🎨 Design studio'),
			h('p', { class: 'ds-muted' }, 'Design a customer’s yard on a photo, then turn it into a quote with measured quantities.'),
			h('div', { class: 'ds-row ds-wrap' },
				h('button', { class: 'ds-btn', onclick: () => ctx.newProject() }, icon('plus', 18), ' New Dreamscape'),
				h('button', { class: 'ds-btn ds-ghost', onclick: () => ctx.myDreamscapes() }, '🗂️ My Dreamscapes'),
				h('button', { class: 'ds-btn ds-ghost', onclick: () => ctx.assetLibrary() }, '📚 Plants & materials'),
				h('button', { class: 'ds-btn ds-ghost', onclick: () => ctx.plantId() }, '🌿 Identify a plant'))),
		h('p', { class: 'ds-ph-switch' }, h('button', { class: 'ds-link', onclick: () => ctx.homeowner() }, '🏡 Use DreamScaper as a homeowner (for your own yard)')));
	root.append(ctx.header(), main);
	(async () => {
		try {
			const me = await api('crm/me');
			const now = new Date(), d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(), d1 = d0 + 864e5;
			const todays = (me.upcoming || []).filter((v) => v.start >= d0 && v.start < d1 && v.status !== 'cancelled');
			const next = (me.upcoming || []).filter((v) => v.start >= d1).slice(0, 3);
			const pipe = me.pipeline || {}, n = (k) => (pipe[k] ? pipe[k].n : 0);
			const kpi = (e, v, l, fn, hot) => h('button', { class: 'ds-kpi' + (hot ? ' hot' : ''), onclick: fn }, h('span', null, e), h('b', null, v), h('small', null, l));
			kpis.append(
				kpi('📥', String(n('request')), 'new requests', () => ctx.openHub({ v: 'quotes', status: 'request' }), n('request') > 0),
				kpi('💬', String(me.needs_reply || 0), 'waiting for a reply', () => ctx.openHub({ v: 'inbox', filter: 'needs_reply' }), me.needs_reply > 0),
				kpi('📅', String(todays.length), 'appointments today', () => ctx.openHub({ v: 'schedule', mode: 'month' })),
				kpi('💵', money(me.unpaid), 'unpaid invoices', () => ctx.openHub({ v: 'invoices' }), me.unpaid > 0));
			today.innerHTML = '';
			put(today, h('h2', null, 'Today'), todays.length
				? h('div', { class: 'ds-hub-list' }, ...todays.map((v) => h('button', { class: 'ds-hub-row', onclick: () => ctx.openHub({ v: 'schedule', mode: 'list' }) }, h('b', null, `${hm(v.start)} ${v.title}`), h('small', null, [v.client, v.crew ? '👷 ' + v.crew : ''].filter(Boolean).join(' · ')))))
				: h('p', { class: 'ds-muted' }, next.length ? 'Nothing booked today.' : 'Nothing booked yet — open the Calendar and tap a day to book work.'),
				next.length ? h('p', { class: 'ds-hint' }, 'Next: ' + next.map((v) => `${new Date(v.start).toLocaleDateString(undefined, { weekday: 'short' })} ${hm(v.start)} ${v.title}`).join(' · ')) : null);
		} catch (e) {
			today.innerHTML = '';
			today.append(h('p', { class: 'ds-warn' }, e.message));
		}
	})();
}

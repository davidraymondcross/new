/* DreamScaper – Contractor Hub (CRM).
 *
 * Dashboard · Customers (contacts, properties, history) · Quotes (Design → Plan → Takeoff →
 * two quotes: Job Cost + Customer Proposal) · Send / Send for signature · Follow-ups (email +
 * text, shortcodes) · Jobs & job costing · Schedule / dispatch · Invoices (Stripe Connect) ·
 * Settings (business, costs & markups, price book, terms, follow-up plan, crew, payments).
 */
import { h, put, icon } from './util.js?v=2.7.1';
import { session, api, refreshSession } from './api.js?v=2.7.1';
import { modal, aerial, pickFile } from './capture.js?v=2.7.1';
import { openPlan } from './siteplan.js?v=2.7.1';
import { segment } from './aiclient.js?v=2.7.1';
import { ALL, matchesWords, searchScore } from './library.js?v=2.7.1';
import {
	PRICEBOOK, DEFAULT_COSTS, DEFAULT_FOLLOWUPS, DEFAULT_TERMS, SHORTCODES, KINDS,
	mergeBook, mergeCosts, planToSections, priceEstimate, buildDocuments, scheduleFollowups, merge, missingCodes,
	money, fmtArea, fmtFtIn, measure, round2
} from './takeoff.js?v=2.7.1';
import { inboxPane, inboxDot } from './inbox.js?v=2.7.1';
import { remindersEditor, reminderSummary, syncSheet } from './calendar.js?v=2.7.1';
import { billingView, subBanner } from './billing.js?v=2.7.1';
import { messagesEditor, intakeEditor, socialEditor, snippetsEditor } from './msgsettings.js?v=2.7.1';
import { sectionHead, tip, planPrompt, loadCaps, setPlansRoute, capabilityMap, usageBar, lockNote, has } from './explain.js?v=2.7.1';

let X = null; // { ctx, body, stack, cur, me }
const STAGES = [['lead', 'Lead'], ['prospect', 'Prospect'], ['customer', 'Customer'], ['past', 'Past customer'], ['lost', 'Lost']];
const SOURCES = [['website', 'Website'], ['phone', 'Phone call'], ['text', 'Text message'], ['referral', 'Referral'], ['social', 'Social media'], ['contractor', 'Contractor referral'], ['dreamscaper', 'DreamScaper'], ['repeat', 'Repeat customer'], ['other', 'Other']];
const QSTATUS = { request: ['📥', 'Request'], draft: ['✏️', 'Draft'], sent: ['📨', 'Sent'], viewed: ['👀', 'Viewed'], signed: ['✅', 'Signed'], declined: ['✖️', 'Declined'], expired: ['⌛', 'Expired'] };
const KIND_LABEL = { material: 'Material', labor: 'Labor', equipment: 'Equipment', sub: 'Subcontractor', disposal: 'Disposal', delivery: 'Delivery', other: 'Other' };
const SERVICES = ['Landscape design', 'Planting', 'Mulch & stone', 'Lawn installation', 'Patios & walkways', 'Retaining walls', 'Landscape lighting', 'Fencing', 'Drainage & grading', 'Tree work', 'Lawn care', 'Irrigation', 'Snow removal', 'Outdoor kitchens', 'Water features'];

const toast = (m, ms) => X && X.ctx.toast(m, ms);
const day = (t) => new Date(t).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const when = (t) => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const ago = (t) => { const s = Math.round((Date.now() - t) / 1000); return s < 3600 ? Math.max(1, Math.round(s / 60)) + 'm ago' : s < 86400 ? Math.round(s / 3600) + 'h ago' : s < 86400 * 14 ? Math.round(s / 86400) + 'd ago' : new Date(t).toLocaleDateString(); };
const ymd = (d) => { const z = new Date(d); return `${z.getFullYear()}-${String(z.getMonth() + 1).padStart(2, '0')}-${String(z.getDate()).padStart(2, '0')}`; };
const hm = (d) => { const z = new Date(d); return `${String(z.getHours()).padStart(2, '0')}:${String(z.getMinutes()).padStart(2, '0')}`; };
const fromLocal = (date, time) => new Date(`${date}T${time || '09:00'}`).getTime();

function busy(btn, on, label) { if (!btn) return; if (on) { btn._t = btn.innerHTML; btn.disabled = true; btn.innerHTML = ''; btn.append(h('span', { class: 'ds-spin ds-spin-sm' }), ' ' + (label || 'Working…')); } else { btn.disabled = false; if (btn._t != null) btn.innerHTML = btn._t; } }
async function run(btn, fn, label) { busy(btn, true, label); try { return await fn(); } catch (e) { if (!planPrompt(e, toast)) toast(e.message || 'Something went wrong.', 5000); return null; } finally { busy(btn, false); } }

/* --------------------------------------------------------------- framing */

export function initHub(ctx) { X = { ctx, body: null, stack: [], cur: null, me: null, draft: null }; setPlansRoute(() => openHub({ v: 'plan' })); }
export const isPro = () => !!(session.crm && session.crm.pro && session.crm.pro.status === 'approved');

/** Open the Contractor Hub. view: { v: 'dash'|'inbox'|'customers'|'customer'|'quotes'|'quote'|'jobs'|'schedule'|'invoices'|'settings'|'plan'|'help'|'apply', ... } */
export async function openHub(view = { v: 'dash' }) {
	const { ctx } = X;
	ctx.leave();
	const root = ctx.root;
	root.innerHTML = '';
	const body = h('div', { class: 'ds-cm-body ds-hub-body' });
	const tab = (v, e, l) => h('button', { class: 'ds-hub-tab', 'data-v': v, onclick: () => go({ v }) }, h('span', null, e), h('small', null, l));
	const inboxTab = tab('inbox', '💬', 'Inbox');
	inboxTab.append(inboxDot());
	const nav = h('nav', { class: 'ds-hub-nav', 'aria-label': 'Contractor Hub' }, tab('dash', '📊', 'Dashboard'), inboxTab, tab('customers', '👥', 'Customers'), tab('quotes', '🧾', 'Quotes'), tab('jobs', '🛠️', 'Jobs'), tab('schedule', '📅', 'Schedule'), tab('invoices', '💵', 'Invoices'), tab('settings', '⚙️', 'Settings'), tab('plan', '💳', 'Plan'), tab('help', '❓', 'Help'));
	const bar = h('div', { class: 'ds-cm-bar' },
		h('button', { class: 'ds-btn ds-ghost ds-sm ds-cm-back', onclick: back, 'aria-label': 'Back' }, '←', h('span', null, ' Back')),
		h('h1', null, '🧰 Contractor Hub'),
		h('div', { class: 'ds-spacer' }),
		h('button', { class: 'ds-btn ds-sm', onclick: () => newQuote() }, icon('plus', 18), h('span', null, ' New quote')));
	const banner = h('div', { class: 'ds-subbar-slot' });
	root.append(ctx.header(), h('main', { class: 'ds-home ds-comm ds-hub' }, bar, banner, nav, body));
	X.body = body;
	X.banner = banner;
	X.nav = nav;
	X.stack = [];
	X.cur = null;
	if (!session.user) { const ok = await ctx.requireSignIn('Sign in to use the Contractor Hub.'); if (!ok) return ctx.home(); }
	if (!isPro()) view = { v: 'apply' };
	else loadCaps(true);
	go(view);
}
function drawBanner(view) {
	if (!X.banner) return;
	X.banner.innerHTML = '';
	if (view.v === 'apply' || view.v === 'plan') return;
	const b = subBanner(() => go({ v: 'plan' }));
	if (b) X.banner.append(b);
}
function back() { if (X.stack.length) render(X.stack.pop()); else X.ctx.home(); }
export function go(view, push = true) {
	if (!X.body || !X.body.isConnected) return openHub(view);
	if (push && X.cur) X.stack.push(X.cur);
	render(view);
}
function render(view) {
	X.cur = view;
	const b = X.body;
	b.innerHTML = '';
	const sc = b.closest('.ds-home');
	if (sc) sc.scrollTop = 0;
	for (const t of X.nav.children) t.classList.toggle('on', t.dataset.v === view.v || (view.v === 'customer' && t.dataset.v === 'customers') || (view.v === 'quote' && t.dataset.v === 'quotes'));
	X.nav.hidden = view.v === 'apply';
	drawBanner(view);
	({ dash: viewDash, inbox: viewInbox, plan: viewPlan, help: viewHelp, customers: viewCustomers, customer: viewCustomer, quotes: viewQuotes, quote: viewQuote, jobs: viewJobs, schedule: viewSchedule, invoices: viewInvoices, settings: viewSettings, apply: viewApply }[view.v] || viewDash)(b, view);
}
async function loadMe(force) {
	if (!X.me || force) X.me = await api('crm/me');
	return X.me;
}
const costs = () => mergeCosts(X.me && X.me.settings && X.me.settings.costs);
const book = () => mergeBook(X.me && X.me.settings && X.me.settings.book);
function loading(b) { b.innerHTML = ''; b.append(h('div', { class: 'ds-center ds-pad-l' }, h('span', { class: 'ds-spin' }))); }
function err(b, e) { b.innerHTML = ''; b.append(h('div', { class: 'ds-soon' }, h('p', null, e.message || 'Couldn’t load this.'), h('button', { class: 'ds-btn', onclick: () => render(X.cur) }, 'Try again'))); }
const card = (title, ...kids) => h('section', { class: 'ds-hub-card' }, title ? h('h2', null, title) : null, ...kids);
const field = (label, el, hint) => h('label', { class: 'ds-field' }, h('span', null, label), el, hint ? h('small', { class: 'ds-hint' }, hint) : null);
const input = (val, attrs = {}) => h('input', { type: 'text', value: val == null ? '' : val, ...attrs });
const select = (val, opts, attrs = {}) => h('select', attrs, ...opts.map(([v, l]) => h('option', { value: v, selected: String(v) === String(val) }, l)));
const statusChip = (s) => { const q = QSTATUS[s] || ['', s]; return h('span', { class: 'ds-qs ds-qs-' + s }, q[0] + ' ' + q[1]); };

/* -------------------------------------------------------------- dashboard */

async function viewDash(b) {
	loading(b);
	let me;
	try { me = await loadMe(true); } catch (e) { return err(b, e); }
	b.innerHTML = '';
	const pipe = me.pipeline || {};
	const pv = (k) => (pipe[k] ? pipe[k].v : 0), pn = (k) => (pipe[k] ? pipe[k].n : 0);
	const kpi = (e, label, val, sub, fn) => h('button', { class: 'ds-kpi', onclick: fn }, h('span', null, e), h('b', null, val), h('small', null, label), sub ? h('em', null, sub) : null);
	const s = me.settings || {};
	const steps = [
		[!!(me.pro.logo && me.pro.phone), 'Add your logo and phone', () => go({ v: 'settings', tab: 'business' })],
		[!!(s.costs && s.costs.laborRate), 'Set your labor rate & markups', () => go({ v: 'settings', tab: 'costs' })],
		[!!me.connect.ready || !me.connect.on, 'Get paid online (Stripe)', () => go({ v: 'settings', tab: 'pay' })],
		[me.clients > 0, 'Add your first customer', () => editCustomer()],
		[(pn('sent') + pn('viewed') + pn('signed')) > 0, 'Send your first quote', () => newQuote()]
	];
	steps.splice(3, 0, [!!(s.templates || s.reminders), 'Review your customer messages & reminders', () => go({ v: 'settings', tab: 'messages' })]);
	const todo = steps.filter((x) => !x[0]);
	put(b, sectionHead('dash'),
		me.held ? card(`⏸️ ${me.held} follow-up${me.held > 1 ? 's were' : ' was'} held while your payment was outstanding`, h('p', { class: 'ds-hint' }, 'They didn’t go out late. Choose what to do with them.'), h('button', { class: 'ds-btn ds-sm', onclick: () => heldSheet() }, 'Review held follow-ups')) : null,
		todo.length ? card('Get set up', h('p', { class: 'ds-hint' }, `${steps.length - todo.length} of ${steps.length} done`), h('div', { class: 'ds-hub-steps' }, ...steps.map(([ok, t, fn]) => h('button', { class: 'ds-hub-step' + (ok ? ' done' : ''), onclick: fn }, ok ? '✅ ' : '⬜ ', t)))) : null,
		h('div', { class: 'ds-kpis' },
			kpi('📥', 'New requests', String(pn('request')), pn('request') ? 'Turn them into quotes' : '', () => go({ v: 'quotes', status: 'request' })),
			kpi('💬', 'Waiting for your reply', String(me.needs_reply || 0), me.needs_reply ? 'Open your Inbox' : 'All caught up', () => go({ v: 'inbox', filter: 'needs_reply' })),
			kpi('📨', 'Open quotes', money(pv('sent') + pv('viewed')), `${pn('sent') + pn('viewed')} waiting`, () => go({ v: 'quotes', status: 'open' })),
			kpi('✅', 'Signed', money(pv('signed')), `${pn('signed')} jobs`, () => go({ v: 'jobs' })),
			kpi('🎯', 'Close rate (90 days)', me.close_rate == null ? '—' : me.close_rate + '%', '', () => go({ v: 'quotes' })),
			kpi('💵', 'Unpaid invoices', money(me.unpaid), '', () => go({ v: 'invoices' })),
			kpi('📈', 'Paid last 30 days', money(me.paid30), '', () => go({ v: 'invoices' }))),
		h('div', { class: 'ds-row ds-wrap ds-hub-quick' },
			h('button', { class: 'ds-btn', onclick: () => newQuote() }, icon('plus', 18), ' New quote'),
			h('button', { class: 'ds-btn ds-ghost', onclick: () => editCustomer() }, '👤 Add customer'),
			h('button', { class: 'ds-btn ds-ghost', onclick: () => editVisit() }, '📅 Schedule a visit'),
			h('button', { class: 'ds-btn ds-ghost', onclick: () => editInvoice() }, '💵 New invoice')),
		card('Coming up', me.upcoming.length ? h('div', { class: 'ds-hub-list' }, ...me.upcoming.map((v) => h('button', { class: 'ds-hub-row', onclick: () => editVisit(v) }, h('b', null, v.title), h('small', null, `${when(v.start)}${v.crew ? ' · ' + v.crew : ''}`)))) : h('p', { class: 'ds-muted' }, 'Nothing scheduled yet. Signed jobs show up under Jobs, ready to schedule.')),
		card('Recent activity', me.recent.length ? h('div', { class: 'ds-hub-list' }, ...me.recent.map((a) => h('button', { class: 'ds-hub-row', onclick: () => (a.quote_id ? go({ v: 'quote', id: a.quote_id }) : a.client_id ? go({ v: 'customer', id: a.client_id }) : null) }, h('span', null, actIcon(a.kind) + ' ' + a.text), h('small', null, ago(a.at))))) : h('p', { class: 'ds-muted' }, 'Your customers, quotes and payments will show up here.')),
		me.reviews.length ? card(`Reviews · ${me.pro.rating}★ (${me.pro.reviews})${me.pro.reality_n ? ` · Dream-to-Reality ${me.pro.reality}/5` : ''}`, ...me.reviews.slice(0, 5).map(reviewCard)) : null);
}
function actIcon(k) { return { lead: '📥', quote: '🧾', sent: '📨', viewed: '👀', signed: '✅', declined: '✖️', email: '✉️', sms: '💬', sms_in: '💬', call: '📞', note: '📝', meeting: '🤝', visit: '📅', job: '🛠️', invoice: '💵', payment: '💰', status: '🏷️' }[k] || '•'; }
function reviewCard(r) {
	const box = h('div', { class: 'ds-review' },
		h('div', { class: 'ds-row' }, h('b', null, '★'.repeat(r.stars) + '☆'.repeat(5 - r.stars)), r.reality ? h('span', { class: 'ds-qs' }, `Dream-to-Reality ${r.reality}/5`) : null, h('small', { class: 'ds-muted' }, ` ${r.by.name} · ${ago(r.at)}`)),
		r.project ? h('small', { class: 'ds-muted' }, r.project) : null, r.text ? h('p', null, r.text) : null,
		r.photo || r.design ? h('div', { class: 'ds-review-imgs' }, r.design ? h('figure', null, h('img', { src: r.design, alt: '' }), h('figcaption', null, 'The Dreamscape')) : null, r.photo ? h('figure', null, h('img', { src: r.photo, alt: '' }), h('figcaption', null, 'The finished yard')) : null) : null,
		r.reply ? h('p', { class: 'ds-review-reply' }, '↪ ', r.reply) : null);
	if (isPro() && X.cur && X.cur.v === 'dash') put(box, h('button', { class: 'ds-link', onclick: async () => { const t = prompt('Reply publicly to this review', r.reply || ''); if (t == null) return; await api('crm/review/reply', { body: { id: r.id, reply: t } }).catch((e) => toast(e.message)); toast('Reply saved.'); } }, r.reply ? 'Edit reply' : 'Reply'));
	return box;
}

/* --------------------------------------------------------------- customers */

async function viewCustomers(b, view) {
	const q = input(view.q || '', { type: 'search', placeholder: 'Search name, phone, email, address, tag…', 'aria-label': 'Search customers' });
	const list = h('div', { class: 'ds-hub-list' });
	let stage = view.stage || '';
	const chips = h('div', { class: 'ds-chips' }, ...[['', 'All'], ...STAGES].map(([v, l]) => h('button', { class: 'ds-chip' + (v === stage ? ' on' : ''), onclick: (e) => { stage = v; for (const c of chips.children) c.classList.remove('on'); e.currentTarget.classList.add('on'); load(); } }, l)));
	put(b, sectionHead('customers', h('button', { class: 'ds-btn', onclick: () => editCustomer() }, icon('plus', 18), ' Add customer')), usageBar('clients'), q, chips, list);
	let t = 0;
	const load = async () => {
		X.cur.q = q.value; X.cur.stage = stage;
		list.innerHTML = '';
		list.append(h('span', { class: 'ds-spin' }));
		try {
			const r = await api('crm/clients', { query: { q: q.value, stage } });
			list.innerHTML = '';
			if (!r.items.length) list.append(h('p', { class: 'ds-muted' }, q.value || stage ? 'No customers match.' : 'No customers yet. Add your first one — it takes a minute.'));
			for (const c of r.items) list.append(h('button', { class: 'ds-hub-row ds-cust-row', onclick: () => go({ v: 'customer', id: c.id }) },
				c.photo ? h('img', { class: 'ds-cust-ph', src: c.photo, alt: '', loading: 'lazy' }) : h('span', { class: 'ds-cust-ph' }, (c.name || '?')[0]),
				h('span', { class: 'ds-grow' }, h('b', null, c.name, c.linked ? h('small', { class: 'ds-qs', title: 'Has a DreamScaper account (customer portal)' }, ' 🏡 DreamScaper') : null), h('small', null, [c.address, c.town].filter(Boolean).join(', ') || c.email || c.phone)),
				h('span', { class: 'ds-qs ds-st-' + c.stage }, (STAGES.find((s) => s[0] === c.stage) || ['', c.stage])[1])));
		} catch (e) { list.innerHTML = ''; list.append(h('p', { class: 'ds-err' }, e.message)); }
	};
	q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 300); });
	load();
}

/** Add / edit a customer (everything a service business wants to know). */
export async function editCustomer(c = null, onSaved) {
	const d = (c && c.data) || {};
	const f = {
		name: input(c && c.name, { autocomplete: 'off', required: true }), company: input(c && c.company), email: input(c && c.email, { type: 'email' }), phone: input(c && c.phone, { type: 'tel' }), phone2: input(d.phone2, { type: 'tel' }),
		address: input(c && c.address), town: input(c && c.town), state: input((c && c.state) || 'CT', { maxlength: 2 }), zip: input(c && c.zip, { inputmode: 'numeric' }),
		stage: select((c && c.stage) || 'lead', STAGES), source: select((c && c.source) || 'phone', SOURCES), referred_by: input(d.referred_by),
		pref: select(d.pref || 'text', [['text', 'Text'], ['call', 'Phone call'], ['email', 'Email']]), best_time: input(d.best_time, { placeholder: 'e.g. weekdays after 5' }),
		property_type: select(d.property_type || 'residential', [['residential', 'Residential'], ['commercial', 'Commercial'], ['hoa', 'HOA / condo'], ['rental', 'Rental property']]),
		budget: input(d.budget, { placeholder: 'e.g. $5–10k' }), timeline: input(d.timeline, { placeholder: 'e.g. this spring' }), interests: input(d.interests, { placeholder: 'patio, plantings, lighting…' }),
		lot_size: input(d.lot_size, { placeholder: 'e.g. 0.5 acre' }), gate: input(d.gate, { placeholder: 'gate code / access' }), pets: input(d.pets, { placeholder: 'dog in yard?' }),
		irrigation: select(d.irrigation || '', [['', 'Unknown'], ['yes', 'Yes — has irrigation'], ['no', 'No irrigation']]), utilities: input(d.utilities, { placeholder: 'invisible fence, propane, septic…' }),
		hoa: input(d.hoa, { placeholder: 'HOA name / rules' }), billing_address: input(d.billing_address), tax_exempt: h('input', { type: 'checkbox', checked: !!d.tax_exempt }),
		maintenance: select(d.maintenance || '', [['', 'No maintenance plan'], ['weekly', 'Weekly maintenance'], ['biweekly', 'Every 2 weeks'], ['monthly', 'Monthly'], ['seasonal', 'Seasonal cleanups']]),
		tags: input(((c && c.tags) || []).join(', '), { placeholder: 'VIP, corner lot…' }), notes: h('textarea', { rows: 3 }, d.notes || '')
	};
	const contacts = (d.contacts || []).map((x) => ({ ...x }));
	const cbox = h('div');
	const drawContacts = () => {
		cbox.innerHTML = '';
		contacts.forEach((x, i) => cbox.append(h('div', { class: 'ds-contact' },
			input(x.name, { placeholder: 'Name', oninput: (e) => (x.name = e.target.value) }), input(x.role, { placeholder: 'Role (spouse, tenant, manager)', oninput: (e) => (x.role = e.target.value) }),
			input(x.email, { placeholder: 'Email', type: 'email', oninput: (e) => (x.email = e.target.value) }), input(x.phone, { placeholder: 'Phone', type: 'tel', oninput: (e) => (x.phone = e.target.value) }),
			h('button', { class: 'ds-icon-btn', 'aria-label': 'Remove contact', onclick: () => { contacts.splice(i, 1); drawContacts(); } }, icon('trash', 16)))));
		cbox.append(h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => { contacts.push({ name: '', role: '', email: '', phone: '' }); drawContacts(); } }, '+ Add another contact'));
	};
	drawContacts();
	let photo = null;
	const ph = h('div', { class: 'ds-cust-photo' }, c && c.photo ? h('img', { src: c.photo, alt: '' }) : h('span', null, '🏡'));
	const phBtn = h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: async () => { const s = await pickFile(); if (s && s.bitmap) { photo = s.bitmap.toDataURL('image/jpeg', 0.85); ph.innerHTML = ''; ph.append(h('img', { src: photo, alt: '' })); } } }, icon('camera', 16), ' Property photo');
	const msg = h('p', { class: 'ds-err', role: 'alert' });
	const save = h('button', { class: 'ds-btn ds-wide' }, c ? 'Save customer' : 'Add customer');
	const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
	const grid = (...k) => h('div', { class: 'ds-form-grid' }, ...k);
	const m = modal(X.ctx.root, c ? 'Edit customer' : 'Add a customer', [
		h('div', { class: 'ds-row' }, ph, phBtn),
		grid(field('Full name *', f.name), field('Company', f.company), field('Mobile phone', f.phone), field('Other phone', f.phone2), field('Email', f.email), field('Prefers', f.pref)),
		h('h4', null, 'Property address'), grid(field('Street', f.address), field('Town', f.town), field('State', f.state), field('ZIP', f.zip)),
		h('h4', null, 'Lead'), grid(field('Stage', f.stage), field('How they found you', f.source), field('Referred by', f.referred_by), field('Best time to reach', f.best_time)),
		h('h4', null, 'Project'), grid(field('Interested in', f.interests), field('Budget', f.budget), field('Timeline', f.timeline), field('Property type', f.property_type)),
		h('details', null, h('summary', null, 'More details (access, pets, utilities, billing)'),
			grid(field('Lot size', f.lot_size), field('Gate / access', f.gate), field('Pets', f.pets), field('Irrigation', f.irrigation), field('Hidden utilities', f.utilities), field('HOA', f.hoa), field('Billing address (if different)', f.billing_address), field('Maintenance', f.maintenance)),
			h('label', { class: 'ds-check' }, f.tax_exempt, ' Tax exempt')),
		h('h4', null, 'Other contacts'), cbox,
		grid(field('Tags', f.tags, 'Separate with commas')), field('Notes', f.notes), msg, save], close, 'ds-modal-wide');
	save.onclick = () => run(save, async () => {
		msg.textContent = '';
		const body = {
			id: c ? c.id : 0, name: f.name.value, company: f.company.value, email: f.email.value, phone: f.phone.value, address: f.address.value, town: f.town.value, state: f.state.value, zip: f.zip.value,
			stage: f.stage.value, source: f.source.value, tags: f.tags.value.split(',').map((x) => x.trim()).filter(Boolean),
			data: { contacts: contacts.filter((x) => x.name || x.email || x.phone), phone2: f.phone2.value, pref: f.pref.value, best_time: f.best_time.value, referred_by: f.referred_by.value, property_type: f.property_type.value, budget: f.budget.value, timeline: f.timeline.value, interests: f.interests.value, lot_size: f.lot_size.value, gate: f.gate.value, pets: f.pets.value, irrigation: f.irrigation.value, utilities: f.utilities.value, hoa: f.hoa.value, billing_address: f.billing_address.value, tax_exempt: f.tax_exempt.checked, maintenance: f.maintenance.value, notes: f.notes.value }
		};
		if (photo) body.photo = photo;
		try {
			const r = await api('crm/client', { body });
			m.remove();
			toast(c ? 'Saved.' : `${r.name} added.`);
			if (onSaved) onSaved(r); else go({ v: 'customer', id: r.id }, !c);
		} catch (e) { msg.textContent = e.message; }
	}, 'Saving…');
	setTimeout(() => f.name.focus(), 50);
}

async function viewCustomer(b, view) {
	loading(b);
	let c;
	try { c = await api('crm/client', { query: { id: view.id } }); } catch (e) { return err(b, e); }
	b.innerHTML = '';
	const d = c.data || {};
	const tabs = [['overview', 'Overview'], ['properties', `Properties (${c.properties.length})`], ['quotes', `Quotes & jobs (${c.quotes.length})`], ['invoices', `Invoices (${c.invoices.length})`], ['history', 'History']];
	let tab = view.tab || 'overview';
	const pane = h('div');
	const tb = h('div', { class: 'ds-chips ds-tabs' }, ...tabs.map(([v, l]) => h('button', { class: 'ds-chip' + (v === tab ? ' on' : ''), onclick: (e) => { tab = v; X.cur.tab = v; for (const x of tb.children) x.classList.remove('on'); e.currentTarget.classList.add('on'); draw(); } }, l)));
	const tel = (p) => (p ? h('a', { href: 'tel:' + p.replace(/[^\d+]/g, ''), class: 'ds-link' }, '📞 ' + p) : null);
	const sms = (p) => (p ? h('a', { href: 'sms:' + p.replace(/[^\d+]/g, ''), class: 'ds-link' }, '💬 Text') : null);
	const mail = (e) => (e ? h('a', { href: 'mailto:' + e, class: 'ds-link' }, '✉️ ' + e) : null);
	const addr = [c.address, c.town, c.state, c.zip].filter(Boolean).join(', ');
	put(b, h('div', { class: 'ds-cust-head' },
		c.photo ? h('img', { class: 'ds-cust-hero', src: c.photo, alt: 'Property' }) : null,
		h('div', null, h('h2', null, c.name, c.company ? h('small', { class: 'ds-muted' }, ' · ' + c.company) : null),
			h('div', { class: 'ds-row ds-wrap' }, h('span', { class: 'ds-qs ds-st-' + c.stage }, (STAGES.find((s) => s[0] === c.stage) || ['', c.stage])[1]), c.source ? h('small', { class: 'ds-muted' }, 'via ' + ((SOURCES.find((s) => s[0] === c.source) || ['', c.source])[1])) : null, c.linked ? h('small', { class: 'ds-qs' }, '🏡 Has a DreamScaper account') : null, ...c.tags.map((t) => h('small', { class: 'ds-tagchip' }, t))),
			h('div', { class: 'ds-row ds-wrap' }, tel(c.phone), sms(c.phone), mail(c.email), addr ? h('a', { class: 'ds-link', href: 'https://maps.google.com/?q=' + encodeURIComponent(addr), target: '_blank', rel: 'noopener' }, '📍 ' + addr) : null))),
	h('div', { class: 'ds-row ds-wrap' },
		h('button', { class: 'ds-btn', onclick: () => newQuote({ client_id: c.id, prop_id: c.properties[0] ? c.properties[0].id : 0 }) }, icon('plus', 18), ' New quote'),
		h('button', { class: 'ds-btn ds-ghost', onclick: () => editCustomer(c, () => render(X.cur)) }, icon('edit', 16), ' Edit'),
		h('button', { class: 'ds-btn ds-ghost', onclick: () => logNote(c, () => render(X.cur)) }, '📝 Log call / note'),
		h('button', { class: 'ds-btn ds-ghost', onclick: () => editVisit({ client_id: c.id, title: 'Site visit – ' + c.name }) }, '📅 Schedule visit')),
	tb, pane);
	const draw = () => {
		pane.innerHTML = '';
		if (tab === 'overview') {
			const row = (k, v) => (v ? h('div', { class: 'ds-kv' }, h('small', null, k), h('span', null, String(v))) : null);
			put(pane, card('Details', h('div', { class: 'ds-kvs' }, row('Prefers', d.pref), row('Best time', d.best_time), row('Other phone', d.phone2), row('Interested in', d.interests), row('Budget', d.budget), row('Timeline', d.timeline), row('Property type', d.property_type), row('Lot size', d.lot_size), row('Gate / access', d.gate), row('Pets', d.pets), row('Irrigation', d.irrigation), row('Hidden utilities', d.utilities), row('HOA', d.hoa), row('Billing address', d.billing_address), row('Maintenance', d.maintenance), row('Referred by', d.referred_by), d.tax_exempt ? row('Tax', 'Exempt') : null),
				d.notes ? h('p', { class: 'ds-pre' }, d.notes) : null),
			(d.contacts || []).length ? card('Contacts', ...d.contacts.map((x) => h('div', { class: 'ds-row ds-wrap' }, h('b', null, x.name || '—'), x.role ? h('small', { class: 'ds-muted' }, x.role) : null, tel(x.phone), mail(x.email)))) : null);
		} else if (tab === 'properties') {
			put(pane, ...c.properties.map((p) => propertyCard(c, p)), h('button', { class: 'ds-btn ds-ghost', onclick: async () => { const a = prompt('Property address'); if (!a) return; await api('crm/property', { body: { client_id: c.id, address: a } }).catch((e) => toast(e.message)); render(X.cur); } }, '+ Add property'));
		} else if (tab === 'quotes') {
			put(pane, c.quotes.length ? h('div', { class: 'ds-hub-list' }, ...c.quotes.map(quoteRow)) : h('p', { class: 'ds-muted' }, 'No quotes yet.'));
		} else if (tab === 'invoices') {
			put(pane, c.invoices.length ? h('div', { class: 'ds-hub-list' }, ...c.invoices.map(invoiceRow)) : h('p', { class: 'ds-muted' }, 'No invoices yet.'), h('button', { class: 'ds-btn ds-ghost', onclick: () => editInvoice({ client_id: c.id }) }, '+ New invoice'));
		} else {
			put(pane, h('div', { class: 'ds-hub-list' }, ...c.activity.map((a) => h('div', { class: 'ds-hub-row ds-act' }, h('span', null, actIcon(a.kind) + ' ', h('span', { class: 'ds-pre' }, a.text)), h('small', null, when(a.at))))), c.activity.length ? null : h('p', { class: 'ds-muted' }, 'No history yet.'));
		}
	};
	draw();
}
function logNote(c, done) {
	const kind = select('call', [['call', '📞 Phone call'], ['note', '📝 Note'], ['meeting', '🤝 Meeting / site visit'], ['email', '✉️ Email (sent outside DreamScaper)'], ['sms', '💬 Text (sent from my phone)']]);
	const t = h('textarea', { rows: 4, placeholder: 'What happened? Next step?' });
	const save = h('button', { class: 'ds-btn ds-wide' }, 'Save to history');
	const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
	const m = modal(X.ctx.root, 'Log activity – ' + c.name, [field('Type', kind), field('Details', t), save], close);
	save.onclick = () => run(save, async () => { await api('crm/note', { body: { client_id: c.id, kind: kind.value, text: t.value } }); m.remove(); toast('Saved to history.'); done && done(); });
}
function propertyCard(c, p) {
	const d = p.data || {};
	const plan = p.plan && p.plan.shapes ? p.plan : { shapes: [] };
	const shapes = plan.shapes.length;
	const photos = p.photos || [];
	const slope = d.slope ? `${d.slope.class} slope (${d.slope.slope}%, downhill to the ${d.slope.downhill})` : '';
	return card('📍 ' + (p.address || 'Property'),
		photos.length || p.aerial ? h('div', { class: 'ds-prop-photos' }, p.aerial ? h('a', { href: p.aerial, target: '_blank', rel: 'noopener' }, h('img', { src: p.aerial, alt: 'Aerial', loading: 'lazy' }), h('small', null, 'Aerial')) : null, ...photos.map((x) => h('a', { href: x.url, target: '_blank', rel: 'noopener' }, h('img', { src: x.url, alt: x.step, loading: 'lazy' }), h('small', null, x.step)))) : h('p', { class: 'ds-muted' }, 'No photos yet.'),
		h('p', { class: 'ds-hint' }, shapes ? `2D plan: ${shapes} shape${shapes > 1 ? 's' : ''}` : 'No 2D plan yet.', slope ? ' · ' + slope : '', d.notes ? ' · ' + d.notes : ''),
		h('div', { class: 'ds-row ds-wrap' },
			h('button', { class: 'ds-btn ds-sm', onclick: async () => { const np = await editPlan(plan, p, c.name); if (np) { await api('crm/property', { body: { id: p.id, client_id: c.id, plan: np } }).catch((e) => toast(e.message)); render(X.cur); } } }, '📐 ' + (shapes ? 'Open 2D plan' : 'Draw 2D plan')),
			h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: async () => { const s = await pickFile(); if (!s || !s.bitmap) return; const step = prompt('What is this photo of? (front, back, left side, right side, structure, existing landscape)', 'front') || 'other'; await api('crm/property', { body: { id: p.id, client_id: c.id, photos: [...photos, { step, url: s.bitmap.toDataURL('image/jpeg', 0.85) }] } }).catch((e) => toast(e.message)); render(X.cur); } }, icon('camera', 16), ' Add photo'),
			p.lat ? h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: (e) => run(e.currentTarget, async () => { const r = await api('crm/elevation', { body: { lat: p.lat, lng: p.lng } }); await api('crm/property', { body: { id: p.id, client_id: c.id, data: { ...d, slope: r } } }); toast(`Slope across the lot: about ${r.slope}% (${r.class}).`, 5000); render(X.cur); }, 'Checking…') }, '⛰️ Check slope') : null,
			h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: async () => { const n = prompt('Property notes (soil, sun, drainage, access…)', d.notes || ''); if (n == null) return; await api('crm/property', { body: { id: p.id, client_id: c.id, data: { ...d, notes: n } } }).catch((e) => toast(e.message)); render(X.cur); } }, '📝 Notes')));
}

/** Open the 2D plan editor for a property (aerial backdrop if we have one). */
async function editPlan(plan, prop, title) {
	const p = JSON.parse(JSON.stringify(plan || { shapes: [] }));
	if (!p.bg && prop && prop.aerial && prop.ppf) p.bg = { url: prop.aerial, ppf: prop.ppf, W: 1280, H: 1280, kind: 'aerial', scaled: true };
	return openPlan({
		root: X.ctx.root, plan: p, title: '📐 ' + (title || '2D Landscape Plan'), toast,
		aerial: () => aerial(X.ctx.root, X.ctx.cfg, toast),
		pickImage: () => pickFile(),
		segment: session.ai && session.ai.enabled ? segment : null,
		pickPlant, photos: prop && prop.photos ? prop.photos : []
	});
}

/** Simple plant picker over the DreamScaper library. */
export function pickPlant() {
	return new Promise((resolve) => {
		const q = input('', { type: 'search', placeholder: 'Search 2,600+ plants (name, color, native…)', 'aria-label': 'Search plants' });
		const list = h('div', { class: 'ds-hub-list ds-plantpick' });
		const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => { m.remove(); resolve(null); } }, icon('close'));
		const draw = () => {
			const words = q.value.toLowerCase().split(/\s+/).filter(Boolean);
			const items = ALL.filter((it) => it.cat !== 'features' && (!words.length || matchesWords(it, words))).sort((a, b) => searchScore(b, words) - searchScore(a, words)).slice(0, 40);
			list.innerHTML = '';
			for (const it of items) list.append(h('button', { class: 'ds-hub-row', onclick: () => { m.remove(); resolve(it); } }, h('span', null, h('b', null, it.name), it.sci ? h('i', { class: 'ds-muted' }, ' ' + it.sci) : null), h('small', null, `${it.cat} · ${fmtFtIn(it.h)} tall × ${fmtFtIn(it.w)} wide`)));
		};
		q.addEventListener('input', draw);
		const m = modal(X.ctx.root, 'Choose a plant', [q, list], close, 'ds-modal-wide');
		draw();
		setTimeout(() => q.focus(), 50);
	});
}

/* ------------------------------------------------------------------ quotes */

function quoteRow(q) {
	return h('button', { class: 'ds-hub-row ds-qrow', onclick: () => go({ v: 'quote', id: q.id }) },
		q.thumb ? h('img', { class: 'ds-qthumb', src: q.thumb, alt: '', loading: 'lazy' }) : h('span', { class: 'ds-qthumb' }, '🧾'),
		h('span', { class: 'ds-grow' }, h('b', null, q.title), h('small', null, `${q.number}${q.client ? ' · ' + q.client : ''} · ${ago(q.updated)}`)),
		h('span', { class: 'ds-col-r' }, statusChip(q.status), q.total ? h('b', null, money(q.total)) : null, q.job_status ? h('small', null, '🛠️ ' + q.job_status.replace('_', ' ')) : null));
}
async function viewQuotes(b, view) {
	let status = view.status || '';
	const list = h('div', { class: 'ds-hub-list' });
	const q = input('', { type: 'search', placeholder: 'Search title or number', 'aria-label': 'Search quotes' });
	const chips = h('div', { class: 'ds-chips' }, ...[['', 'All'], ['request', '📥 Requests'], ['draft', '✏️ Drafts'], ['open', '📨 Sent & viewed'], ['signed', '✅ Signed'], ['declined', '✖️ Declined'], ['expired', '⌛ Expired']].map(([v, l]) => h('button', { class: 'ds-chip' + (v === status ? ' on' : ''), onclick: (e) => { status = v; X.cur.status = v; for (const c of chips.children) c.classList.remove('on'); e.currentTarget.classList.add('on'); load(); } }, l)));
	put(b, sectionHead('quotes', h('button', { class: 'ds-btn', onclick: () => newQuote() }, icon('plus', 18), ' New quote')), usageBar('quotes_month'), usageBar('leads_month'), q, chips, list);
	const load = async () => {
		list.innerHTML = '';
		list.append(h('span', { class: 'ds-spin' }));
		try {
			const r = await api('crm/quotes', { query: { status: status === 'open' ? '' : status, q: q.value } });
			const items = status === 'open' ? r.items.filter((x) => x.status === 'sent' || x.status === 'viewed') : r.items;
			list.innerHTML = '';
			if (!items.length) list.append(h('p', { class: 'ds-muted' }, status === 'request' ? 'No new requests. Homeowners can request a quote from their Dreamscape under Find a Local Contractor.' : 'No quotes here yet.'));
			items.forEach((x) => list.append(quoteRow(x)));
		} catch (e) { list.innerHTML = ''; list.append(h('p', { class: 'ds-err' }, e.message)); }
	};
	let t = 0;
	q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 300); });
	load();
}
async function viewJobs(b) {
	put(b, sectionHead('jobs'), h('p', { class: 'ds-hint' }, 'Every signed quote is a job. Schedule it, track actual costs against the estimate, invoice it and mark it done — the customer is told automatically, and asked for a review on your timing.'));
	const list = h('div', { class: 'ds-hub-list' }, h('span', { class: 'ds-spin' }));
	b.append(list);
	try {
		const r = await api('crm/quotes', { query: { status: 'jobs' } });
		list.innerHTML = '';
		const groups = [['', 'Ready to schedule'], ['ready', 'Deposit paid – ready to schedule'], ['scheduled', 'Scheduled'], ['in_progress', 'In progress'], ['done', 'Done'], ['cancelled', 'Cancelled']];
		for (const [k, l] of groups) {
			const items = r.items.filter((x) => (x.job_status || '') === k);
			if (items.length) put(list, h('h3', null, `${l} (${items.length})`), ...items.map(quoteRow));
		}
		if (!r.items.length) list.append(h('p', { class: 'ds-muted' }, 'No signed jobs yet. When a customer signs a quote it shows up here.'));
	} catch (e) { list.innerHTML = ''; list.append(h('p', { class: 'ds-err' }, e.message)); }
}

/** Start a new quote (optionally for a customer / from a design payload). */
export async function newQuote(seed = {}) {
	X.draft = null;
	if (!X.body || !X.body.isConnected) await openHub({ v: 'dash' });
	if (!isPro()) return;
	go({ v: 'quote', id: 0, seed });
}

/** Called by the app after the contractor picked a Dreamscape view for this quote. */
export function resumeWithDesign(payload) {
	const v = (X.draft && X.draft.view) || { v: 'quote', id: 0 };
	if (X.draft) X.draft.design = payload || null;
	else X.draft = { q: null, design: payload || null };
	openHub({ ...v, resume: true });
}

async function viewQuote(b, view) {
	loading(b);
	try { await loadMe(); } catch (e) { return err(b, e); }
	let q;
	if (view.resume && X.draft && X.draft.q) q = X.draft.q;
	else if (view.id) { try { q = await api('crm/quote', { query: { id: view.id } }); } catch (e) { return err(b, e); } }
	else q = { id: 0, title: '', status: 'draft', client_id: (view.seed && view.seed.client_id) || 0, prop_id: (view.seed && view.seed.prop_id) || 0, design: {}, estimate: {}, docs: {}, job: {}, sign: {}, followups: [], visits: [], invoices: [], contacts: [] };
	const pendingDesign = view.resume && X.draft ? X.draft.design : view.seed && view.seed.design;
	X.draft = { q, view: { v: 'quote', id: q.id }, design: null };
	if (pendingDesign) applyDesign(q, pendingDesign);
	b.innerHTML = '';
	const Q = new QuoteBuilder(b, q, view);
	await Q.init();
}

function applyDesign(q, d) {
	q.design = { ...(q.design || {}), title: d.title, before: d.before, after: d.after, assets: d.assets || [], ground: d.ground || [], season: d.season, ai: d.ai, source: 'dreamscape', plan: d.plan || null };
	if (!q.title) q.title = d.title || 'Landscape project';
	q._dirtyDesign = true;
	q._dirty = true;
}

class QuoteBuilder {
	constructor(b, q, view) { this.b = b; this.q = q; this.view = view; this.clients = []; this.client = null; this.prop = null; this.tab = 'proposal'; }
	get locked() { return this.q.status === 'signed'; }
	async init() {
		const q = this.q;
		if (q.client_id) { try { this.client = await api('crm/client', { query: { id: q.client_id } }); } catch (e) { /* removed */ } }
		if (this.client) this.prop = this.client.properties.find((p) => p.id === q.prop_id) || this.client.properties[0] || null;
		if (!q.estimate || !q.estimate.sections) q.estimate = { sections: [], discount: 0 };
		if (!q.docs) q.docs = {};
		if (!q.docs.terms) q.docs.terms = (X.me.settings && X.me.settings.terms) || DEFAULT_TERMS;
		if (!q.docs.payments) q.docs.payments = (X.me.settings && X.me.settings.payments) || [{ label: 'Deposit to schedule', pct: costs().depositPct, when: 'when you sign' }, { label: 'Balance', pct: 100 - costs().depositPct, when: 'on completion' }];
		this.draw();
	}
	draw() {
		const b = this.b, q = this.q;
		b.innerHTML = '';
		this.saveBtn = h('button', { class: 'ds-btn', disabled: this.locked, onclick: (e) => this.save(e.currentTarget) }, icon('check', 18), ' Save');
		put(b, h('div', { class: 'ds-qhead' },
			h('div', { class: 'ds-grow' }, h('input', { class: 'ds-qtitle', value: q.title || '', placeholder: 'Project name, e.g. Front Yard Renovation', disabled: this.locked, 'aria-label': 'Project name', oninput: (e) => { q.title = e.target.value; q._dirty = true; } }),
				h('div', { class: 'ds-row ds-wrap' }, q.number ? h('small', { class: 'ds-muted' }, q.number) : h('small', { class: 'ds-muted' }, 'New quote'), statusChip(q.status), q.sent ? h('small', { class: 'ds-muted' }, 'sent ' + ago(q.sent)) : null, q.viewed ? h('small', { class: 'ds-muted' }, '· viewed ' + ago(q.viewed)) : null, q.signed ? h('small', { class: 'ds-muted' }, '· signed ' + ago(q.signed)) : null)),
			h('div', { class: 'ds-row ds-wrap' }, this.saveBtn, q.id ? this.moreMenu() : null)));
		if (q.status === 'request') put(b, this.requestCard());
		if (this.locked) put(b, this.jobCard());
		put(b, this.customerCard(), this.designCard(), this.planCard(), this.estimateCard());
		if (q.id && !this.locked) put(b, card('Send', h('p', { class: 'ds-hint' }, 'Email or text the proposal to the customer and anyone else on the project. They open it on their phone, pick any add-ons, sign with a finger and pay the deposit.'),
			h('div', { class: 'ds-row ds-wrap' }, h('button', { class: 'ds-btn', onclick: () => this.sendSheet(true) }, '✍️ Send for signature'), h('button', { class: 'ds-btn ds-ghost', onclick: () => this.sendSheet(false) }, icon('send', 16), ' Send / follow up'), h('button', { class: 'ds-btn ds-ghost', onclick: () => this.preview() }, icon('eye', 16), ' Preview')),
			q.followups && q.followups.length ? this.followupList() : null));
		if (q.id && this.locked) put(b, this.followupList());
	}
	moreMenu() {
		const q = this.q;
		const sel = select('', [['', '⋯ More'], ['copy', q.status === 'signed' ? 'Copy as change order' : 'Duplicate'], ['link', 'Copy customer link'], ...(q.status === 'sent' || q.status === 'viewed' ? [['declined', 'Mark as declined'], ['draft', 'Withdraw (back to draft)']] : []), ...(q.status !== 'signed' ? [['delete', 'Delete quote']] : [])], { class: 'ds-sel-btn', 'aria-label': 'More actions' });
		sel.onchange = async () => {
			const a = sel.value; sel.value = '';
			try {
				if (a === 'copy') { const r = await api('crm/quote/copy', { body: { id: q.id } }); toast('Copied.'); go({ v: 'quote', id: r.id }); }
				if (a === 'link') { await navigator.clipboard.writeText(q.link).catch(() => prompt('Copy this link', q.link)); toast('Link copied. It only works after the quote is sent.'); }
				if (a === 'declined' || a === 'draft') { await api('crm/quote/status', { body: { id: q.id, status: a, reason: a === 'declined' ? prompt('Why did they decline? (for your records)') || '' : '' } }); render(X.cur); }
				if (a === 'delete' && confirm('Delete this quote?')) { await api('crm/quote/delete', { body: { id: q.id } }); toast('Deleted.'); back(); }
			} catch (e) { toast(e.message); }
		};
		return sel;
	}
	requestCard() {
		const d = this.q.design || {};
		if (d.brief) return this.briefCard(d);
		return card('📥 Customer request',
			h('p', null, `${this.client ? this.client.name : 'A homeowner'} asked for a quote on their Dreamscape “${d.title || this.q.title}”.`),
			d.message ? h('blockquote', { class: 'ds-quote' }, d.message) : null,
			h('div', { class: 'ds-kvs' }, d.timing ? h('div', { class: 'ds-kv' }, h('small', null, 'Timing'), h('span', null, d.timing)) : null, d.budget ? h('div', { class: 'ds-kv' }, h('small', null, 'Budget'), h('span', null, d.budget)) : null, d.season ? h('div', { class: 'ds-kv' }, h('small', null, 'Season shown'), h('span', null, d.season)) : null, d.ai ? h('div', { class: 'ds-kv' }, h('small', null, 'Made with'), h('span', null, 'Dreamscape AI')) : null),
			(d.assets || []).length ? h('details', { open: true }, h('summary', null, `Plants & features in their design (${d.assets.length})`), h('ul', null, ...d.assets.map((a) => h('li', null, `${a.count} × ${a.name}${a.sci ? ` (${a.sci})` : ''}${a.h ? ` – about ${fmtFtIn(a.h)} tall at the year shown` : ''}`)))) : null,
			h('p', { class: 'ds-hint' }, 'Next: check the 2D plan below (their design was converted to measured shapes), then tap “Build estimate from plan”.'));
	}
	briefCard(d) {
		const br = d.brief, q = this.q;
		const val = (v) => (Array.isArray(v) ? v.join(', ') : String(v));
		const kv = (l, v) => (v ? h('div', { class: 'ds-kv' }, h('small', null, l), h('span', null, v)) : null);
		return card(`📥 Request brief · ${br.score != null ? br.score + '% complete' : ''}`,
			h('div', { class: 'ds-rq-score' }, h('i', null, h('em', { style: { width: (br.score || 0) + '%' } }))),
			h('div', { class: 'ds-kvs' }, kv('Services', (br.services || []).join(', ')), kv('Budget', br.budget + (br.financing ? ' · wants financing info' : '')), kv('Timing', [br.timing && br.timing.start, br.timing && br.timing.deadline ? 'by ' + br.timing.deadline : '', br.timing && br.timing.reason].filter(Boolean).join(' · ')), kv('Flexible', br.timing && br.timing.flexible), kv('Contact', br.contact && [br.contact.channel, br.contact.times].filter(Boolean).join(', ')), kv('Decides', br.contact && br.contact.deciders), kv('Other quotes', br.contact && br.contact.others)),
			br.description ? h('blockquote', { class: 'ds-quote' }, br.description) : null,
			br.priorities && br.priorities.must && br.priorities.must.length ? h('p', null, h('b', null, '⭐ Must have: '), br.priorities.must.join(', '), br.priorities.nice && br.priorities.nice.length ? h('span', null, h('br'), h('b', null, '👍 Nice to have: '), br.priorities.nice.join(', ')) : null) : null,
			Object.keys(br.answers || {}).length || Object.keys(br.site || {}).length || (br.pro_answers && Object.keys(br.pro_answers).length) ? this.answersBox(br) : null,
			(d.assets || []).length ? h('details', null, h('summary', null, `Plants & features in their design (${d.assets.length})`), h('ul', null, ...d.assets.map((a) => h('li', null, `${a.count} × ${a.name}${a.sci ? ` (${a.sci})` : ''}`)))) : null,
			br.missing && br.missing.length ? h('p', { class: 'ds-hint' }, '❓ Missing: ' + br.missing.join(' · ')) : null,
			h('div', { class: 'ds-row ds-wrap' },
				h('button', { class: 'ds-btn ds-sm', onclick: () => go({ v: 'inbox', quote: q.id }) }, '💬 Message them'),
				h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => editVisit({ quote_id: q.id, client_id: q.client_id, title: q.title + ' – site visit', kind: 'site_visit' }) }, '📅 Book a site visit'),
				br.missing && br.missing.length ? h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => go({ v: 'inbox', quote: q.id }) }, '❓ Ask for missing details') : null),
			h('p', { class: 'ds-hint' }, 'Next: check the 2D plan below, then tap “Build estimate from plan”. Their photos are on the property.'));
	}
	/** The homeowner's answers, with the questions written out (fetched once). */
	answersBox(br) {
		const val = (v) => (Array.isArray(v) ? v.join(', ') : String(v));
		const ul = h('ul', { class: 'ds-plain' });
		const draw = (qs) => {
			const text = {};
			for (const x of (qs && qs.site) || []) text[x.id] = x.q;
			for (const list of Object.values((qs && qs.services) || {})) for (const x of list) text[x.id] = x.q;
			for (const p of Object.values((qs && qs.pros) || {})) for (const x of p.questions) text[x.id] = x.q;
			ul.innerHTML = '';
			const row = (k2, v, mine) => h('li', null, h('small', { class: 'ds-muted' }, (text[k2] || k2.replace(/^[a-z]{2}_/, '').replace(/_/g, ' ')) + (mine ? ' (your question)' : '') + ' '), h('b', null, val(v)));
			for (const [k2, v] of Object.entries(br.answers || {})) ul.append(row(k2, v));
			for (const o of Object.values(br.pro_answers || {})) for (const [k2, v] of Object.entries(o)) ul.append(row(k2, v, true));
			for (const [k2, v] of Object.entries(br.site || {})) ul.append(row(k2, v));
		};
		draw(null);
		api('req/questions', { query: { services: (br.services || []).join('|'), pros: X.me && X.me.pro ? X.me.pro.id : '' } }).then(draw).catch(() => {});
		return h('details', { open: true }, h('summary', null, 'Their answers'), ul);
	}
	customerCard() {
		const q = this.q, c = this.client;
		const pick = h('button', { class: 'ds-btn ' + (c ? 'ds-ghost ds-sm' : ''), disabled: this.locked, onclick: () => this.pickCustomer() }, c ? 'Change' : '👤 Choose customer');
		return card('1. Customer & property',
			c ? h('div', { class: 'ds-row ds-wrap' }, h('b', null, c.name), h('small', { class: 'ds-muted' }, [c.phone, c.email].filter(Boolean).join(' · ')), pick, h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => go({ v: 'customer', id: c.id }) }, 'Open')) : h('div', { class: 'ds-row ds-wrap' }, pick, h('button', { class: 'ds-btn ds-ghost', disabled: this.locked, onclick: () => editCustomer(null, (r) => { this.setClient(r); }) }, '+ New customer')),
			c && c.properties.length > 1 ? field('Property', select(q.prop_id, c.properties.map((p) => [p.id, p.address || 'Property ' + p.id]), { disabled: this.locked, onchange: (e) => { q.prop_id = +e.target.value; this.prop = c.properties.find((p) => p.id === q.prop_id); q._dirty = true; this.draw(); } })) : null,
			this.prop ? h('p', { class: 'ds-hint' }, '📍 ' + (this.prop.address || 'No address'), (this.prop.photos || []).length ? ` · ${this.prop.photos.length} photo(s)` : '', this.prop.data && this.prop.data.slope ? ` · ${this.prop.data.slope.class} slope` : '') : null,
			this.prop && (this.prop.photos || []).length ? h('div', { class: 'ds-prop-photos' }, ...this.prop.photos.slice(0, 8).map((x) => h('a', { href: x.url, target: '_blank', rel: 'noopener' }, h('img', { src: x.url, alt: x.step, loading: 'lazy' }), h('small', null, x.step)))) : null);
	}
	async pickCustomer() {
		const q = input('', { type: 'search', placeholder: 'Search customers', 'aria-label': 'Search customers' });
		const list = h('div', { class: 'ds-hub-list' });
		const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
		const m = modal(X.ctx.root, 'Choose a customer', [q, list, h('button', { class: 'ds-btn ds-ghost ds-wide', onclick: () => { m.remove(); editCustomer(null, (r) => this.setClient(r)); } }, '+ New customer')], close, 'ds-modal-wide');
		const load = async () => { const r = await api('crm/clients', { query: { q: q.value } }).catch(() => ({ items: [] })); list.innerHTML = ''; for (const c of r.items.slice(0, 50)) list.append(h('button', { class: 'ds-hub-row', onclick: async () => { m.remove(); this.setClient(await api('crm/client', { query: { id: c.id } })); } }, h('b', null, c.name), h('small', null, [c.address, c.town].filter(Boolean).join(', ')))); };
		let t = 0;
		q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 250); });
		load();
	}
	async setClient(c) {
		if (c && !c.properties) c = await api('crm/client', { query: { id: c.id } });
		this.client = c;
		this.q.client_id = c.id;
		this.prop = c.properties[0] || null;
		this.q.prop_id = this.prop ? this.prop.id : 0;
		this.q._dirty = true;
		this.draw();
	}
	designCard() {
		const d = this.q.design || {};
		const img = (src, label) => h('figure', { class: 'ds-ba-fig' }, src ? h('img', { src, alt: label }) : h('div', { class: 'ds-ba-empty' }, '—'), h('figcaption', null, label));
		const up = (k) => async () => { const s = await pickFile(); if (s && s.bitmap) { this.q.design = { ...d, [k]: s.bitmap.toDataURL('image/jpeg', 0.88) }; this.q._dirty = true; this.q._dirtyDesign = true; this.draw(); } };
		return card('2. The design (before & after)',
			h('div', { class: 'ds-ba' }, img(d.before, 'Before'), img(d.after, 'Design')),
			this.locked ? null : h('div', { class: 'ds-row ds-wrap' },
				h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => this.useDreamscape() }, '🗂️ Use one of my Dreamscapes'),
				h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: up('before') }, icon('upload', 16), ' Before photo'),
				h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: up('after') }, icon('upload', 16), ' Design picture')),
			h('p', { class: 'ds-hint' }, 'Tip: design it in DreamScaper first (it’s the same app) — then the plants, beds and bird’s-eye measurements come in automatically.'));
	}
	useDreamscape() {
		X.draft.q = this.q;
		X.draft.view = { v: 'quote', id: this.q.id };
		X.ctx.pickDesign((payload) => resumeWithDesign(payload), () => resumeWithDesign(null));
	}
	planCard() {
		const q = this.q, prop = this.prop;
		const plan = prop && prop.plan && prop.plan.shapes ? prop.plan : { shapes: [] };
		const dplan = q.design && q.design.plan && q.design.plan.shapes && q.design.plan.shapes.length ? q.design.plan : null;
		const rows = summarizePlan(plan);
		return card('3. 2D plan & measurements',
			!prop ? h('p', { class: 'ds-muted' }, 'Choose a customer with a property address first.') : null,
			rows.length ? h('ul', { class: 'ds-plan-sum' }, ...rows.map((r) => h('li', null, r))) : prop ? h('p', { class: 'ds-muted' }, 'No plan yet. Draw beds, patios, walls and plants on the aerial (Connecticut) or from your tape measurements.') : null,
			plan.estimated ? h('p', { class: 'ds-warn' }, '⚠️ Some shapes came from a ground-level photo, so sizes are estimates. Check them on site or on the aerial.') : null,
			prop && !this.locked ? h('div', { class: 'ds-row ds-wrap' },
				h('button', { class: 'ds-btn ds-sm', onclick: () => this.openPlan() }, '📐 ' + (plan.shapes.length ? 'Edit 2D plan' : 'Draw 2D plan')),
				dplan ? h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => this.importDesignPlan(dplan) }, `⤵️ Add ${dplan.shapes.length} shapes from the design`) : null,
				q.design && (q.design.assets || []).length && !plan.shapes.some((s) => s.kind === 'plant') ? h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => this.importAssets() }, `🌿 Add the design’s ${q.design.assets.reduce((a, x) => a + (x.cat === 'features' ? 0 : x.count), 0)} plants`) : null) : null);
	}
	async savePlan(plan) {
		const r = await api('crm/property', { body: { id: this.prop.id, client_id: this.client.id, plan } });
		this.prop = r;
		const i = this.client.properties.findIndex((p) => p.id === r.id);
		if (i >= 0) this.client.properties[i] = r;
	}
	async openPlan() {
		const np = await editPlan(this.prop.plan, this.prop, this.q.title || this.client.name);
		if (!np) return;
		try { await this.savePlan(np); toast('Plan saved. Tap “Build estimate from plan” to update the numbers.', 4500); } catch (e) { toast(e.message); }
		this.draw();
	}
	async importDesignPlan(dp) {
		const plan = this.prop.plan && this.prop.plan.shapes ? JSON.parse(JSON.stringify(this.prop.plan)) : { shapes: [] };
		const off = plan.shapes.length ? 0 : 0;
		for (const s of dp.shapes) plan.shapes.push({ ...JSON.parse(JSON.stringify(s)), id: 'i' + Math.random().toString(36).slice(2, 8), pts: s.pts.map((p) => [p[0] + off, p[1]]) });
		if (dp.estimated) plan.estimated = true;
		try { await this.savePlan(plan); toast('Added. Open the plan to check positions and sizes.'); } catch (e) { toast(e.message); }
		this.draw();
	}
	async importAssets() {
		const plan = this.prop.plan && this.prop.plan.shapes ? JSON.parse(JSON.stringify(this.prop.plan)) : { shapes: [] };
		let x = 2;
		for (const a of this.q.design.assets) {
			if (a.cat === 'features') { plan.shapes.push({ id: 'a' + Math.random().toString(36).slice(2, 8), kind: 'feature', pts: [[x, -6]], props: { name: a.name, count: a.count, cost: 0 } }); }
			else plan.shapes.push({ id: 'a' + Math.random().toString(36).slice(2, 8), kind: 'plant', pts: [[x, -3]], props: { id: a.id, name: a.name, sci: a.sci || '', cat: a.cat, count: a.count, w: a.w || 3 } });
			x += 4;
		}
		try { await this.savePlan(plan); toast('Plants added above the plan. Drag them into place if you want a planting layout.', 5000); } catch (e) { toast(e.message); }
		this.draw();
	}

	/* -------------------------------------------------- estimate (2 quotes) */
	estimateCard() {
		const q = this.q, est = q.estimate;
		const t = priceEstimate(est, costs());
		this.totals = t;
		const tabs = h('div', { class: 'ds-chips ds-tabs' },
			h('button', { class: 'ds-chip' + (this.tab === 'proposal' ? ' on' : ''), onclick: () => { this.tab = 'proposal'; this.draw(); } }, '🏡 Customer proposal'),
			h('button', { class: 'ds-chip' + (this.tab === 'cost' ? ' on' : ''), onclick: () => { this.tab = 'cost'; this.draw(); } }, '🔒 Job cost (internal)'));
		const totals = h('div', { class: 'ds-qtot' },
			h('div', null, h('small', null, 'Your cost'), h('b', null, money(t.cost))),
			h('div', null, h('small', null, 'Price'), h('b', null, money(t.price))),
			h('div', null, h('small', null, 'Gross profit'), h('b', { class: t.margin < 25 ? 'ds-bad' : '' }, `${money(t.gp)} · ${t.margin}%`)),
			h('div', null, h('small', null, `Tax ${costs().taxPct}%`), h('b', null, money(t.tax))),
			h('div', null, h('small', null, 'Customer total'), h('b', null, money(t.total))),
			h('div', null, h('small', null, `Deposit ${costs().depositPct}%`), h('b', null, money(t.deposit))),
			h('div', null, h('small', null, 'Crew hours'), h('b', null, String(t.hours))));
		const body = this.tab === 'cost' ? this.costTable(t) : this.proposalEditor(t);
		return card('4. Estimate → two quotes',
			this.locked ? null : h('div', { class: 'ds-row ds-wrap' },
				h('button', { class: 'ds-btn ds-sm', disabled: !this.prop, onclick: () => this.buildFromPlan() }, '⚡ Build estimate from plan'),
				h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => this.addSection() }, '+ Add section'),
				h('button', { class: 'ds-btn ds-ghost ds-sm', disabled: !est.sections.length, onclick: (e) => this.aiWording(e.currentTarget) }, '✨ Polish wording with AI')),
			!est.sections.length ? h('p', { class: 'ds-muted' }, 'No sections yet. Build from the plan, or add sections by hand.') : null,
			est.sections.length ? tabs : null, est.sections.length ? body : null, est.sections.length ? totals : null,
			t.minBump ? h('p', { class: 'ds-hint' }, `Your minimum job charge (${money(costs().minJob)}) added ${money(t.minBump)}.`) : null);
	}
	async buildFromPlan() {
		const plan = this.prop && this.prop.plan && this.prop.plan.shapes ? this.prop.plan : { shapes: [] };
		if (!plan.shapes.length) return toast('Draw the plan first (or add the design’s shapes).');
		if (this.q.estimate.sections.length && !confirm('Rebuild the estimate from the plan? Changes you made to quantities and wording will be replaced.')) return;
		const secs = planToSections(plan, book());
		if (!secs.length) return toast('Nothing to price yet. Shapes marked “existing” are reference only — untick “Existing” or tick “Remove it”.', 6000);
		this.q.estimate = { sections: secs, discount: this.q.estimate.discount || 0 };
		this.q._dirty = true;
		this.tab = 'cost';
		const needs = secs.flatMap((s) => s.comps.filter((c) => c.needsPrice).map((c) => c.name));
		toast(needs.length ? `Built ${secs.length} sections. Add your price for: ${needs.slice(0, 3).join(', ')}${needs.length > 3 ? '…' : ''}` : `Built ${secs.length} sections from the plan. Check the job cost, then the customer proposal.`, 6000);
		this.draw();
	}
	addSection() {
		this.q.estimate.sections.push({ id: 'sec_m' + Date.now().toString(36), title: 'New section', comps: [{ kind: 'material', name: 'Item', qty: 1, unit: 'ea', unitCost: 0 }, { kind: 'labor', name: 'Labor', qty: 1, unit: 'hr', unitCost: 0, rate: true }], scope: ['Describe exactly what you will do'] });
		this.q._dirty = true;
		this.tab = 'cost';
		this.draw();
	}
	costTable(t) {
		const est = this.q.estimate, c = costs(), lk = this.locked;
		const by = new Map(t.sections.map((s) => [s.id, s]));
		const redraw = () => { this.q._dirty = true; this.draw(); };
		const num = (v, on, step = 'any') => h('input', { type: 'number', step, value: v, disabled: lk, inputmode: 'decimal', onchange: (e) => on(parseFloat(e.target.value) || 0) });
		return h('div', { class: 'ds-cost' }, ...est.sections.map((s, si) => {
			const st = by.get(s.id) || {};
			return h('div', { class: 'ds-cost-sec' + (s.optional ? ' opt' : '') + (s.included === false ? ' off' : '') },
				h('div', { class: 'ds-row ds-wrap' },
					h('input', { class: 'ds-cost-title', value: s.title, disabled: lk, 'aria-label': 'Section title', onchange: (e) => { s.title = e.target.value; this.q._dirty = true; } }),
					h('label', { class: 'ds-check' }, h('input', { type: 'checkbox', checked: !!s.optional, disabled: lk, onchange: (e) => { s.optional = e.target.checked; redraw(); } }), ' Optional add-on'),
					h('label', { class: 'ds-check' }, h('input', { type: 'checkbox', checked: s.included !== false, disabled: lk, onchange: (e) => { s.included = e.target.checked; redraw(); } }), ' Include'),
					lk ? null : h('button', { class: 'ds-icon-btn', title: 'Move up', 'aria-label': 'Move up', disabled: !si, onclick: () => { est.sections.splice(si - 1, 0, est.sections.splice(si, 1)[0]); redraw(); } }, '↑'),
					lk ? null : h('button', { class: 'ds-icon-btn', title: 'Delete section', 'aria-label': 'Delete section', onclick: () => { if (confirm('Delete this section?')) { est.sections.splice(si, 1); redraw(); } } }, icon('trash', 16))),
				h('div', { class: 'ds-cost-rows' },
					h('div', { class: 'ds-cost-row ds-cost-hd' }, h('span', null, 'Type'), h('span', null, 'Item'), h('span', null, 'Qty'), h('span', null, 'Unit'), h('span', null, 'Unit cost'), h('span', null, 'Cost'), h('span')),
					...s.comps.map((cp, ci) => h('div', { class: 'ds-cost-row' + (cp.needsPrice && !cp.unitCost ? ' need' : '') },
						select(cp.kind, Object.entries(KIND_LABEL), { disabled: lk, 'aria-label': 'Type', onchange: (e) => { cp.kind = e.target.value; cp.rate = cp.kind === 'labor' && !cp.unitCost; redraw(); } }),
						h('input', { value: cp.name, disabled: lk, 'aria-label': 'Item', onchange: (e) => { cp.name = e.target.value; this.q._dirty = true; } }),
						num(cp.qty, (v) => { cp.qty = v; redraw(); }),
						h('input', { value: cp.unit, disabled: lk, 'aria-label': 'Unit', class: 'ds-unit', onchange: (e) => { cp.unit = e.target.value; this.q._dirty = true; } }),
						cp.kind === 'labor' && cp.rate ? h('button', { class: 'ds-link', disabled: lk, title: 'Uses your crew rate. Tap to set a different rate for this line.', onclick: () => { const v = parseFloat(prompt('Cost per hour for this line ($)', c.laborRate)); if (v >= 0) { cp.rate = false; cp.unitCost = v; redraw(); } } }, money(c.laborRate, true) + '/hr') : num(cp.unitCost, (v) => { cp.unitCost = v; cp.needsPrice = false; redraw(); }),
						h('b', null, money((cp.kind === 'labor' && cp.rate ? c.laborRate : cp.unitCost) * cp.qty, true)),
						lk ? h('span') : h('button', { class: 'ds-icon-btn', 'aria-label': 'Remove line', onclick: () => { s.comps.splice(ci, 1); redraw(); } }, icon('close', 14)))),
					lk ? null : h('button', { class: 'ds-link', onclick: () => { s.comps.push({ kind: 'material', name: '', qty: 1, unit: 'ea', unitCost: 0 }); redraw(); } }, '+ Add line')),
				h('div', { class: 'ds-row ds-wrap ds-cost-foot' },
					h('small', null, `Direct ${money(st.direct)} · with overhead ${money(st.cost)} · ${st.hours || 0} hrs`),
					h('div', { class: 'ds-spacer' }),
					h('label', { class: 'ds-row' }, h('small', null, 'Price '), h('input', { type: 'number', class: 'ds-price-in', disabled: lk, value: Number.isFinite(s.priceOverride) ? s.priceOverride : st.price, title: `Calculated: ${money(st.computed)}. Change it to set your own price.`, onchange: (e) => { const v = parseFloat(e.target.value); s.priceOverride = Number.isFinite(v) && Math.abs(v - st.computed) > 0.5 ? v : undefined; redraw(); } }),
						Number.isFinite(s.priceOverride) && !lk ? h('button', { class: 'ds-link', onclick: () => { delete s.priceOverride; redraw(); } }, 'reset') : null)));
		}),
		h('div', { class: 'ds-row ds-wrap' }, h('label', { class: 'ds-row' }, h('small', null, 'Discount $ '), h('input', { type: 'number', value: est.discount || 0, disabled: lk, class: 'ds-price-in', onchange: (e) => { est.discount = Math.max(0, parseFloat(e.target.value) || 0); this.q._dirty = true; this.draw(); } })),
			h('small', { class: 'ds-muted' }, `Pricing: ${c.mode === 'margin' ? `target ${c.marginPct}% gross margin` : `markups — materials ${c.markup.material}%, labor ${c.markup.labor}%, equipment ${c.markup.equipment}%`} · overhead ${c.overheadPct}% · labor ${money(c.laborRate)}/hr. `, h('button', { class: 'ds-link', onclick: () => go({ v: 'settings', tab: 'costs' }) }, 'Change'))));
	}
	proposalEditor(t) {
		const q = this.q, d = q.docs, lk = this.locked;
		const by = new Map(t.sections.map((s) => [s.id, s]));
		return h('div', { class: 'ds-prop' },
			field('Introduction (what the finished yard will look like)', h('textarea', { rows: 3, disabled: lk, placeholder: 'e.g. Your front yard gets a clean, curved foundation bed with year-round color…', oninput: (e) => { d.intro = e.target.value; q._dirty = true; } }, d.intro || '')),
			...q.estimate.sections.filter((s) => s.included !== false).map((s) => h('div', { class: 'ds-prop-sec' + (s.optional ? ' opt' : '') },
				h('div', { class: 'ds-row' }, h('b', null, (s.optional ? 'Optional: ' : '') + s.title), h('div', { class: 'ds-spacer' }), h('b', null, money((by.get(s.id) || {}).price))),
				h('textarea', { rows: Math.min(10, Math.max(3, s.scope.length + 1)), disabled: lk, 'aria-label': 'Scope of work for ' + s.title, oninput: (e) => { s.scope = e.target.value.split('\n').map((x) => x.trim()).filter(Boolean); q._dirty = true; } }, s.scope.join('\n')),
				h('small', { class: 'ds-hint' }, 'One line per item. This is the contractor’s responsibility on the job — be specific.'))),
			field('Show prices', select(d.showPrices || costs().showPrices, [['section', 'Price for each section'], ['total', 'Total only']], { disabled: lk, onchange: (e) => { d.showPrices = e.target.value; q._dirty = true; } })),
			h('div', { class: 'ds-field' }, h('span', null, 'Payment schedule'), ...q.docs.payments.map((p, i) => h('div', { class: 'ds-row' }, input(p.label, { disabled: lk, 'aria-label': 'Payment', onchange: (e) => { p.label = e.target.value; q._dirty = true; } }), h('input', { type: 'number', value: p.pct, disabled: lk, class: 'ds-price-in', 'aria-label': 'Percent', onchange: (e) => { p.pct = parseFloat(e.target.value) || 0; q._dirty = true; } }), '%', input(p.when, { disabled: lk, 'aria-label': 'When', onchange: (e) => { p.when = e.target.value; q._dirty = true; } }), lk ? null : h('button', { class: 'ds-icon-btn', 'aria-label': 'Remove', onclick: () => { q.docs.payments.splice(i, 1); q._dirty = true; this.draw(); } }, icon('close', 14)))),
				lk ? null : h('button', { class: 'ds-link', onclick: () => { q.docs.payments.push({ label: 'Progress payment', pct: 0, when: 'when the hardscape is complete' }); this.draw(); } }, '+ Add payment')),
			field('Terms', h('textarea', { rows: 6, disabled: lk, oninput: (e) => { d.terms = e.target.value; q._dirty = true; } }, d.terms || '')),
			field('Price good until', h('input', { type: 'date', disabled: lk, value: q.valid_until || ymd(Date.now() + costs().validDays * 864e5), onchange: (e) => { q.valid_until = e.target.value; q._dirty = true; } })));
	}
	async aiWording(btn) {
		await run(btn, async () => {
			const r = await api('crm/ai/scope', { body: { sections: this.q.estimate.sections.filter((s) => s.included !== false).map((s) => ({ id: s.id, title: s.title, scope: s.scope })), before: /^https?:/.test(this.q.design.before || '') ? this.q.design.before : '', after: /^https?:/.test(this.q.design.after || '') ? this.q.design.after : '' } });
			for (const s of r.sections) { const t = this.q.estimate.sections.find((x) => x.id === s.id); if (t) { t.title = s.title; t.scope = s.scope; } }
			if (r.intro && !this.q.docs.intro) this.q.docs.intro = r.intro;
			this.q._dirty = true;
			this.tab = 'proposal';
			this.draw();
			toast(r.kept ? `Wording polished. ${r.kept} section(s) kept as-is because the AI changed a number.` : 'Wording polished. Quantities and prices weren’t touched.', 5000);
		}, 'Writing…');
	}
	docsOut() {
		const q = this.q, c = costs();
		const docs = buildDocuments(q.estimate, { ...c, showPrices: q.docs.showPrices || c.showPrices });
		docs.totals = { ...docs.totals, taxPct: c.taxPct, taxOn: c.taxOn, depositPct: c.depositPct };
		return { ...docs, intro: q.docs.intro || '', terms: q.docs.terms || '', payments: q.docs.payments || [], showPrices: q.docs.showPrices || c.showPrices };
	}
	async save(btn) {
		const q = this.q;
		if (!q.client_id) return toast('Choose a customer first.');
		const body = { id: q.id, title: q.title || 'Landscape project', client_id: q.client_id, prop_id: q.prop_id, estimate: q.estimate, docs: this.docsOut(), valid_until: q.valid_until };
		if (q._dirtyDesign || !q.id) body.design = q.design || {};
		return run(btn, async () => {
			const r = await api('crm/quote', { body });
			Object.assign(this.q, r, { _dirty: false, _dirtyDesign: false });
			if (!q.id || q.id !== r.id) X.cur.id = r.id;
			X.draft = { q: this.q, view: { v: 'quote', id: r.id } };
			toast('Saved.');
			this.draw();
			return r;
		}, 'Saving…');
	}
	preview() {
		const docs = this.docsOut(), q = this.q;
		const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
		const m = modal(X.ctx.root, 'Customer proposal preview', [
			h('div', { class: 'ds-pv' }, h('h2', null, q.title), docs.intro ? h('p', null, docs.intro) : null,
				q.design && q.design.after ? h('div', { class: 'ds-ba' }, q.design.before ? h('img', { src: q.design.before, alt: 'Before' }) : null, h('img', { src: q.design.after, alt: 'Design' })) : null,
				...docs.proposal.sections.map((s) => h('div', { class: 'ds-prop-sec' + (s.optional ? ' opt' : '') }, h('div', { class: 'ds-row' }, h('b', null, (s.optional ? 'Optional: ' : '') + s.title), h('div', { class: 'ds-spacer' }), docs.showPrices === 'section' || s.optional ? h('b', null, money(s.price)) : null), h('ul', null, ...s.scope.map((l) => h('li', null, l.replace(/^•\s*/, '')))))),
				h('p', null, h('b', null, `Total ${money(docs.totals.total)}`), ` (incl. ${money(docs.totals.tax)} tax) · deposit ${money(docs.totals.deposit)}`),
				h('pre', { class: 'ds-pre ds-muted' }, docs.terms))], close, 'ds-modal-wide');
	}

	/* ------------------------------------------------------------ sending */
	async sendSheet(forSign) {
		if (this.q._dirty || !this.q.id) { const r = await this.save(this.saveBtn); if (!r) return; }
		const q = this.q, me = X.me;
		if (!q.estimate.sections.length) return toast('Build the estimate first.');
		const contacts = (q.contacts || []).map((c, i) => ({ ...c, on: i === 0 }));
		const cbox = h('div', { class: 'ds-hub-list' });
		const drawC = () => { cbox.innerHTML = ''; for (const c of contacts) cbox.append(h('label', { class: 'ds-hub-row ds-check' }, h('input', { type: 'checkbox', checked: c.on, onchange: (e) => (c.on = e.target.checked) }), h('span', { class: 'ds-grow' }, h('b', null, c.name || '(no name)'), h('small', null, [c.role, c.email, c.phone].filter(Boolean).join(' · '))))); };
		drawC();
		const addC = h('button', { class: 'ds-link', onclick: async () => {
			const term = prompt('Search your customers by name');
			if (!term) return;
			const r = await api('crm/clients', { query: { q: term } }).catch(() => ({ items: [] }));
			if (!r.items.length) return toast('No customer found. Use “Someone new” instead.');
			const c = r.items[0];
			contacts.push({ name: c.name, email: c.email, phone: c.phone, role: 'Contact', on: true });
			drawC();
		} }, '+ Add a contact from Customers');
		const addNew = h('button', { class: 'ds-link', onclick: () => { const v = prompt('Email or mobile number'); if (!v) return; const isMail = /@/.test(v); contacts.push({ name: prompt('Their name') || '', email: isMail ? v.trim() : '', phone: isMail ? '' : v.trim(), role: 'Contact', on: true }); drawC(); } }, '+ Someone new');
		const smsOk = !!me.sms;
		const ch = select(forSign ? 'email' : 'email', [['email', 'Email'], ['sms', smsOk ? 'Text message' : 'Text message (not set up)'], ['both', smsOk ? 'Email + text' : 'Email + text (not set up)']]);
		const s0 = (me.settings && me.settings.emailIntro) || {};
		const subj = input(s0.subject || (forSign ? 'Please review & sign: {project_name}' : 'Your {project_name} proposal from {company_name}'));
		const bodyT = h('textarea', { rows: 6 }, s0.body || (forSign
			? 'Hi {customer_first_name},\n\nYour proposal for {project_name} is ready. It shows the design, exactly what we’ll do and the total of {quote_total}. You can pick any optional add-ons, sign on your phone and pay the {deposit_amount} deposit to get on the schedule:\n{quote_link}\n\nAny questions, just reply or call me at {contractor_phone}.\n\n{contractor_name}\n{company_name}'
			: 'Hi {customer_first_name},\n\nHere is your proposal for {project_name}: {quote_link}\n\nLet me know if you have any questions.\n\n{contractor_name}\n{company_name} · {contractor_phone}'));
		const inc = { image: h('input', { type: 'checkbox', checked: true }), total: h('input', { type: 'checkbox', checked: true }), scope: h('input', { type: 'checkbox', checked: true }) };
		let lastBox = bodyT;
		bodyT.addEventListener('focus', () => (lastBox = bodyT));
		subj.addEventListener('focus', () => (lastBox = subj));
		const codes = shortcodeHelp(() => lastBox, this.codes());
		const fuOn = h('input', { type: 'checkbox', checked: true });
		const plan = scheduleFollowups(Date.now(), (me.settings && me.settings.followups && me.settings.followups.length ? me.settings.followups : DEFAULT_FOLLOWUPS));
		const fuBox = h('div');
		const fu = followupEditor(fuBox, plan, contacts, smsOk, this.codes(), (x) => (lastBox = x));
		const msg = h('p', { class: 'ds-err', role: 'alert' });
		const warn = h('p', { class: 'ds-warn' });
		const go2 = h('button', { class: 'ds-btn ds-wide' }, forSign ? '✍️ Send for signature' : icon('send', 18), forSign ? '' : ' Send now');
		const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
		const m = modal(X.ctx.root, forSign ? 'Send for signature' : 'Send the proposal', [
			h('h4', null, 'Send to'), cbox, h('div', { class: 'ds-row ds-wrap' }, addC, addNew),
			h('div', { class: 'ds-form-grid' }, field('Send by', ch)), smsOk ? null : h('p', { class: 'ds-hint' }, 'Texting needs Twilio. The site owner turns it on in Settings → DreamScaper → Text messages.'),
			field('Subject (email)', subj), field('Message', bodyT), codes,
			h('div', { class: 'ds-row ds-wrap' }, h('small', null, 'Also include:'), h('label', { class: 'ds-check' }, inc.image, ' Before/after picture'), h('label', { class: 'ds-check' }, inc.total, ' Total'), h('label', { class: 'ds-check' }, inc.scope, ' What’s included')),
			h('p', { class: 'ds-hint' }, 'The proposal link is always included.' + (forSign ? ' The customer signs online; you’re notified the moment they open and sign it.' : '')),
			h('h4', null, h('label', { class: 'ds-check' }, fuOn, ' Follow up automatically if they don’t sign')),
			h('p', { class: 'ds-hint' }, 'A proven 6-touch plan is filled in. Follow-ups stop automatically when the customer signs or declines. Change any date, time, channel, message or what’s attached.'),
			fuBox, warn, msg, go2], close, 'ds-modal-wide ds-sendsheet');
		fuOn.onchange = () => (fuBox.hidden = !fuOn.checked);
		const checkCodes = () => { const miss = missingCodes(subj.value + ' ' + bodyT.value, this.codes()); warn.textContent = miss.length ? `These codes have no value yet and will be sent as-is: ${miss.join(', ')}` : ''; };
		bodyT.addEventListener('input', checkCodes); subj.addEventListener('input', checkCodes); checkCodes();
		go2.onclick = () => run(go2, async () => {
			msg.textContent = '';
			const rec = contacts.filter((c) => c.on);
			if (!rec.length) { msg.textContent = 'Choose at least one contact.'; return; }
			if ((ch.value !== 'email') && !smsOk) { msg.textContent = 'Texting isn’t set up yet — choose Email.'; return; }
			try {
				const r = await api('crm/quote/send', { body: { id: q.id, signature: forSign, recipients: rec, channel: ch.value, subject: subj.value, body: bodyT.value, include: { image: inc.image.checked, total: inc.total.checked, scope: inc.scope.checked }, followups: fuOn.checked ? fu.items() : [] } });
				m.remove();
				Object.assign(this.q, r.quote);
				toast(`Sent to ${r.sent} contact${r.sent > 1 ? 's' : ''}.${r.errors.length ? ' Some didn’t go: ' + r.errors.join(' ') : ''}${fuOn.checked ? ' Follow-ups scheduled.' : ''}`, 6000);
				this.draw();
			} catch (e) { msg.textContent = e.message; }
		}, 'Sending…');
	}
	codes() {
		const q = this.q, c = this.client, me = X.me, t = this.totals || priceEstimate(q.estimate, costs());
		const name = c ? c.name : '';
		return {
			customer_name: name, customer_first_name: name.split(/\s+/)[0] || '', customer_address: this.prop ? this.prop.address : c ? [c.address, c.town].filter(Boolean).join(', ') : '', customer_town: c ? c.town : '',
			project_name: q.title, quote_number: q.number || '', quote_total: money(t.total), deposit_amount: money(t.deposit), quote_link: q.link || '(link)',
			valid_until: q.valid_until ? new Date(q.valid_until + 'T12:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric' }) : '',
			company_name: me.pro.business, contractor_name: me.pro.contact || me.pro.business, contractor_phone: me.pro.phone, contractor_email: me.pro.email,
			month: new Date().toLocaleDateString(undefined, { month: 'long' }), today: new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric' })
		};
	}
	followupList() {
		const q = this.q;
		if (!q.followups || !q.followups.length) return null;
		return h('details', { class: 'ds-fu-list' }, h('summary', null, `Follow-ups (${q.followups.filter((f) => f.status === 'scheduled').length} scheduled)`),
			...q.followups.map((f) => h('div', { class: 'ds-hub-row' }, h('span', null, `${f.channel === 'sms' ? '💬' : f.channel === 'both' ? '✉️💬' : '✉️'} ${when(f.at)} — ${(f.subject || f.body).slice(0, 70)}`), h('small', { class: 'ds-fu-' + f.status }, f.status + (f.error ? ': ' + f.error : '')))),
			this.locked ? null : h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => this.editFollowups() }, 'Edit follow-ups'));
	}
	editFollowups() {
		const q = this.q;
		const box = h('div');
		const items = q.followups.filter((f) => f.status === 'scheduled').map((f) => ({ ...f, time: hm(f.at) }));
		const contacts = (q.contacts || []).map((c) => ({ ...c, on: true }));
		const fu = followupEditor(box, items.length ? items : scheduleFollowups(Date.now(), (X.me.settings && X.me.settings.followups) || DEFAULT_FOLLOWUPS), contacts, !!X.me.sms, this.codes());
		const save = h('button', { class: 'ds-btn ds-wide' }, 'Save follow-ups');
		const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
		const m = modal(X.ctx.root, 'Follow-ups', [box, save], close, 'ds-modal-wide');
		save.onclick = () => run(save, async () => { const r = await api('crm/followups', { body: { quote_id: q.id, items: fu.items() } }); Object.assign(this.q, r.quote); m.remove(); toast(`${r.scheduled} follow-up(s) scheduled.`); this.draw(); });
	}

	/* ------------------------------------------------------------- job */
	jobCard() {
		const q = this.q, job = q.job || {}, est = priceEstimate(q.estimate, costs());
		const a = { material: 0, labor_hours: 0, equipment: 0, sub: 0, disposal: 0, other: 0, ...(job.actuals || {}) };
		const c = costs();
		const actualCost = () => (a.material + a.labor_hours * c.laborRate + a.equipment + a.sub + a.disposal + a.other) * (1 + c.overheadPct / 100);
		const out = h('div', { class: 'ds-qtot' });
		const drawOut = () => {
			const ac = actualCost(), gp = q.price - ac;
			out.replaceChildren(
				h('div', null, h('small', null, 'Estimated cost'), h('b', null, money(est.cost))),
				h('div', null, h('small', null, 'Actual cost so far'), h('b', null, money(ac))),
				h('div', null, h('small', null, 'Variance'), h('b', { class: ac > est.cost ? 'ds-bad' : '' }, money(ac - est.cost))),
				h('div', null, h('small', null, 'Actual gross profit'), h('b', { class: q.price && gp / q.price < 0.25 ? 'ds-bad' : '' }, `${money(gp)} · ${q.price ? Math.round((gp / q.price) * 1000) / 10 : 0}%`)),
				h('div', null, h('small', null, 'Hours: est / actual'), h('b', null, `${est.hours} / ${a.labor_hours}`)));
		};
		drawOut();
		const nIn = (k, label, est2) => field(label, h('input', { type: 'number', step: 'any', value: a[k], inputmode: 'decimal', onchange: (e) => { a[k] = parseFloat(e.target.value) || 0; drawOut(); } }), est2 != null ? 'Estimate: ' + est2 : null);
		const st = select(q.job_status || '', [['', 'Signed – not scheduled'], ['ready', 'Deposit paid'], ['scheduled', 'Scheduled'], ['in_progress', 'In progress'], ['done', 'Done'], ['cancelled', 'Cancelled']]);
		const show = h('input', { type: 'checkbox', checked: !!job.showcase });
		let photos = (job.photos || []).slice();
		const phBox = h('div', { class: 'ds-prop-photos' });
		const drawPh = () => { phBox.replaceChildren(...photos.map((u, i) => h('span', { class: 'ds-ph' }, h('img', { src: u, alt: 'Finished' }), h('button', { class: 'ds-icon-btn', 'aria-label': 'Remove photo', onclick: () => { photos.splice(i, 1); drawPh(); } }, icon('close', 12))))); };
		drawPh();
		const save = h('button', { class: 'ds-btn' }, 'Save job');
		save.onclick = () => run(save, async () => { const r = await api('crm/job', { body: { id: q.id, job_status: st.value, actuals: a, photos, showcase: show.checked } }); Object.assign(this.q, r); toast(st.value === 'done' ? 'Job done! The customer was asked for a review.' : 'Job saved.'); this.draw(); });
		const byKind = est.byKind;
		const inv = q.invoices || [];
		const signedTotal = q.total;
		return card('🛠️ Job',
			h('p', { class: 'ds-hint' }, `Signed by ${q.sign && q.sign.name ? q.sign.name : 'the customer'}${q.signed ? ' on ' + day(q.signed) : ''}. Signed total ${money(signedTotal)}.`, q.sign && q.sign.addons && q.sign.addons.length ? ` Includes ${q.sign.addons.length} add-on(s).` : ''),
			h('div', { class: 'ds-form-grid' }, field('Status', st)),
			h('h4', null, 'Visits'), h('div', { class: 'ds-hub-list' }, ...(q.visits || []).map((v) => h('button', { class: 'ds-hub-row', onclick: () => editVisit(v) }, h('b', null, v.title), h('small', null, `${when(v.start)} · ${v.status}`)))),
			h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => editVisit({ quote_id: q.id, client_id: q.client_id, title: q.title }) }, '📅 Schedule a visit'),
			h('h4', null, 'Job costing — actual costs'),
			h('div', { class: 'ds-form-grid' }, nIn('material', 'Materials $', money(byKind.material.cost)), nIn('labor_hours', 'Crew hours', est.hours), nIn('equipment', 'Equipment $', money(byKind.equipment.cost)), nIn('sub', 'Subcontractors $', money(byKind.sub.cost)), nIn('disposal', 'Disposal & delivery $', money(byKind.disposal.cost + byKind.delivery.cost)), nIn('other', 'Other $', null)),
			out,
			h('h4', null, 'Finished photos'), phBox,
			h('div', { class: 'ds-row ds-wrap' }, h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: async () => { const s = await pickFile(); if (s && s.bitmap) { photos.push(s.bitmap.toDataURL('image/jpeg', 0.85)); drawPh(); } } }, icon('camera', 16), ' Add photo'), h('label', { class: 'ds-check' }, show, ' Show this job (design + finished photo) on my public profile')),
			h('div', { class: 'ds-row ds-wrap' }, save),
			h('h4', null, 'Invoices'), h('div', { class: 'ds-hub-list' }, ...inv.map(invoiceRow)),
			h('div', { class: 'ds-row ds-wrap' },
				h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => editInvoice({ quote_id: q.id, client_id: q.client_id, kind: 'progress', items: [{ name: 'Progress payment – ' + q.title, qty: 1, rate: round2(signedTotal * 0.4) }] }) }, '+ Progress invoice'),
				h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => { const paid = inv.filter((i) => i.status !== 'void').reduce((s, i) => s + i.amount, 0); editInvoice({ quote_id: q.id, client_id: q.client_id, kind: 'final', items: [{ name: 'Final payment – ' + q.title, qty: 1, rate: round2(Math.max(0, signedTotal - paid)) }] }); } }, '+ Final invoice')));
	}
}

/** Shortcode helper: tap a code to insert it where you were typing. */
function shortcodeHelp(target, values) {
	return h('details', { class: 'ds-codes' }, h('summary', null, '🔖 Shortcodes — tap one to insert it'),
		h('p', { class: 'ds-hint' }, 'Write the message once; DreamScaper fills in the details for each customer. Type a code in curly braces, e.g. “Hi {customer_first_name}, your {project_name} quote is ready.” becomes “Hi Jane, your Front Yard Renovation quote is ready.” Codes are not case-sensitive. A code with no value is sent as-is, so you’ll see a warning first.'),
		h('div', { class: 'ds-codes-grid' }, ...SHORTCODES.map(([code, label, ex]) => h('button', { class: 'ds-code', type: 'button', onclick: () => { const el = target(); if (!el) return; const s = el.selectionStart ?? el.value.length; el.value = el.value.slice(0, s) + code + el.value.slice(el.selectionEnd ?? s); el.dispatchEvent(new Event('input')); el.focus(); el.selectionStart = el.selectionEnd = s + code.length; } }, h('code', null, code), h('small', null, label + ' → ' + (values[code.slice(1, -1)] || ex))))));
}

/** Editable follow-up rows (date, time, channel, who, message, what to attach). */
function followupEditor(box, plan, contacts, smsOk, values, onFocus) {
	const rows = plan.map((p, i) => ({ ...p, off: false, n: i + 1, who: 'all' }));
	const draw = () => {
		box.innerHTML = '';
		rows.forEach((r) => {
			const date = h('input', { type: 'date', value: ymd(r.at), 'aria-label': 'Date', onchange: (e) => { r.at = fromLocal(e.target.value, hm(r.at)); } });
			const time = h('input', { type: 'time', value: hm(r.at), 'aria-label': 'Time', onchange: (e) => { r.at = fromLocal(ymd(r.at), e.target.value); } });
			const ch = select(r.channel, [['email', '✉️ Email'], ['sms', smsOk ? '💬 Text' : '💬 Text (not set up)'], ['both', smsOk ? '✉️💬 Both' : 'Both (not set up)']], { 'aria-label': 'Channel', onchange: (e) => (r.channel = e.target.value) });
			const who = select(r.who, [['all', 'Everyone I send it to'], ...contacts.map((c, i) => [String(i), c.name || c.email || c.phone])], { 'aria-label': 'Who', onchange: (e) => (r.who = e.target.value) });
			const subj = input(r.subject, { placeholder: 'Email subject', oninput: (e) => (r.subject = e.target.value) });
			const body = h('textarea', { rows: 4, oninput: (e) => (r.body = e.target.value) }, r.body);
			if (onFocus) { subj.addEventListener('focus', () => onFocus(subj)); body.addEventListener('focus', () => onFocus(body)); }
			const inc = (k, l) => h('label', { class: 'ds-check' }, h('input', { type: 'checkbox', checked: !!(r.include && r.include[k]), onchange: (e) => { r.include = { ...(r.include || {}), [k]: e.target.checked }; } }), ' ' + l);
			box.append(h('div', { class: 'ds-fu' + (r.off ? ' off' : '') },
				h('div', { class: 'ds-row ds-wrap' }, h('label', { class: 'ds-check' }, h('input', { type: 'checkbox', checked: !r.off, onchange: (e) => { r.off = !e.target.checked; draw(); } }), h('b', null, ` Follow-up ${r.n}`)), h('small', { class: 'ds-muted' }, r.day ? `day ${r.day}` : ''), h('div', { class: 'ds-spacer' }), h('button', { class: 'ds-link', type: 'button', onclick: () => { rows.splice(rows.indexOf(r), 1); draw(); } }, 'Remove')),
				r.off ? null : h('div', { class: 'ds-fu-grid' }, field('Date', date), field('Time', time), field('Send by', ch), field('To', who)),
				r.off ? null : field('Subject', subj), r.off ? null : field('Message', body),
				r.off ? null : h('div', { class: 'ds-row ds-wrap' }, h('small', null, 'Attach:'), inc('link', 'Proposal link'), inc('image', 'Before/after picture'), inc('total', 'Total'), inc('scope', 'What’s included')),
				r.off ? null : h('small', { class: 'ds-hint' }, 'Preview: ', merge(r.body, values).slice(0, 160) + (r.body.length > 160 ? '…' : ''))));
		});
		box.append(h('button', { class: 'ds-btn ds-ghost ds-sm', type: 'button', onclick: () => { const last = rows[rows.length - 1]; rows.push({ day: 0, at: (last ? last.at : Date.now()) + 7 * 864e5, time: '10:00', channel: 'email', subject: 'Checking in about {project_name}', body: 'Hi {customer_first_name}, just checking in about {project_name}. {quote_link}', include: { link: true }, n: rows.length + 1, who: 'all' }); draw(); } }, '+ Add follow-up'));
		box.append(shortcodeHelp(() => box.querySelector('textarea:focus') || box.querySelector('textarea'), values));
	};
	draw();
	return { items: () => rows.filter((r) => !r.off).map((r) => ({ at: r.at, channel: r.channel, subject: r.subject, body: r.body, include: r.include || {}, recipients: r.who === 'all' ? contacts.filter((c) => c.on !== false).map(({ name, email, phone }) => ({ name, email, phone })) : [contacts[+r.who]].filter(Boolean).map(({ name, email, phone }) => ({ name, email, phone })) })) };
}

/** Everything drawn on a plan, as readable lines. */
function summarizePlan(plan) {
	const out = [];
	const by = {};
	for (const s of plan.shapes || []) {
		const m = measure(s), key = (s.remove ? 'Remove ' : s.existing ? 'Existing ' : '') + (KINDS[s.kind] ? KINDS[s.kind].label.toLowerCase() : s.kind);
		by[key] = by[key] || { area: 0, len: 0, n: 0, icon: (KINDS[s.kind] || {}).icon || '' };
		by[key].area += m.area || 0;
		by[key].len += m.length || 0;
		by[key].n += m.count || 1;
	}
	for (const [k, v] of Object.entries(by)) out.push(`${v.icon} ${k}: ${v.area ? fmtArea(v.area) : v.len ? fmtFtIn(v.len) : v.n}`);
	return out;
}

/* --------------------------------------------------------------- schedule */

async function viewSchedule(b, view) {
	const start = view.start || startOfWeek(Date.now());
	const end = start + 28 * 864e5;
	put(b, sectionHead('schedule'), tip('sched', 'Booking an appointment puts it on the customer’s DreamScaper calendar automatically and plans their reminders on your schedule (Settings → Reminders).'), h('div', { class: 'ds-row ds-wrap' }, h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => syncSheet(true) }, '🔄 Sync calendar'), h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => go({ v: 'settings', tab: 'reminders' }) }, '⏰ Reminders'), h('div', { class: 'ds-spacer' }),
		h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => go({ v: 'schedule', start: start - 28 * 864e5 }, false) }, '← Earlier'),
		h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => go({ v: 'schedule', start: startOfWeek(Date.now()) }, false) }, 'Today'),
		h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => go({ v: 'schedule', start: start + 28 * 864e5 }, false) }, 'Later →'),
		h('button', { class: 'ds-btn', onclick: () => editVisit() }, icon('plus', 18), ' Visit')));
	const box = h('div', null, h('span', { class: 'ds-spin' }));
	b.append(box);
	try {
		const r = await api('crm/schedule', { query: { from: start, to: end } });
		box.innerHTML = '';
		const unscheduled = r.jobs.filter((j) => !j.job_status || j.job_status === 'ready');
		if (unscheduled.length) put(box, card(`Signed jobs to schedule (${unscheduled.length})`, h('div', { class: 'ds-hub-list' }, ...unscheduled.map((j) => h('button', { class: 'ds-hub-row', onclick: () => editVisit({ quote_id: j.id, client_id: j.client_id, title: j.title }) }, h('b', null, j.title), h('small', null, `${j.client} · ${money(j.total)} · tap to schedule`))))));
		for (let d = 0; d < 28; d++) {
			const t0 = start + d * 864e5, t1 = t0 + 864e5;
			const items = r.items.filter((v) => v.start >= t0 && v.start < t1);
			const isToday = ymd(t0) === ymd(Date.now());
			if (!items.length && !isToday && new Date(t0).getDay() !== 1) continue;
			put(box, h('div', { class: 'ds-day' + (isToday ? ' today' : '') }, h('h4', null, day(t0) + (isToday ? ' · Today' : '')),
				items.length ? h('div', { class: 'ds-hub-list' }, ...items.map((v) => h('div', { class: 'ds-visit ds-vs-' + v.status },
					h('button', { class: 'ds-grow ds-visit-main', onclick: () => editVisit(v) }, h('b', null, `${hm(v.start)}–${hm(v.end)} ${KIND_IC[v.kind] || ''} ${v.title}`), h('small', null, [v.client, v.location || v.address, v.crew ? '👷 ' + v.crew : ''].filter(Boolean).join(' · ')), v.cust_status === 'confirmed' ? h('small', { class: 'ds-ok' }, '✅ Customer confirmed') : v.cust_status === 'reschedule' ? h('small', { class: 'ds-warn' }, '🔁 Asked to reschedule' + (v.cust_note ? ': ' + v.cust_note : '')) : v.linked && v.start > Date.now() ? h('small', { class: 'ds-muted' }, '🕒 Waiting for the customer to confirm') : null),
					v.address ? h('a', { class: 'ds-icon-btn', href: 'https://maps.google.com/?q=' + encodeURIComponent(v.address), target: '_blank', rel: 'noopener', 'aria-label': 'Directions' }, icon('map', 18)) : null,
					v.phone ? h('a', { class: 'ds-icon-btn', href: 'tel:' + v.phone.replace(/[^\d+]/g, ''), 'aria-label': 'Call customer' }, '📞') : null))) : h('small', { class: 'ds-muted' }, 'Nothing scheduled')));
		}
		X.crew = r.crew || [];
	} catch (e) { box.innerHTML = ''; box.append(h('p', { class: 'ds-err' }, e.message)); }
}
function startOfWeek(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); }

/** Create / edit a visit, then dispatch (crew sheet, customer notice). */
async function editVisit(v = {}) {
	await loadMe().catch(() => null);
	const crewList = (X.me && X.me.settings && X.me.settings.crew) || [];
	const s = v.start || (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0); return d.getTime(); })();
	const e = v.end || s + 4 * 3600e3;
	const title = input(v.title || '', { placeholder: 'e.g. Patio install – day 1' });
	const kind = select(v.kind || 'site_visit', Object.entries(KINDS_V), { 'aria-label': 'Type of appointment' });
	const loc = input(v.location || '', { placeholder: 'Leave blank to use the property address' });
	const tell = h('input', { type: 'checkbox', checked: true });
	const date = h('input', { type: 'date', value: ymd(s) });
	const t1 = h('input', { type: 'time', value: hm(s) });
	const dur = select(String(Math.round((e - s) / 3600e3 * 2) / 2), [['1', '1 hour'], ['2', '2 hours'], ['3', '3 hours'], ['4', '4 hours'], ['6', '6 hours'], ['8', 'Full day (8 h)'], ['10', '10 hours']]);
	const crew = input(v.crew || '', { placeholder: crewList.length ? crewList.map((c) => c.name).join(', ') : 'Crew names', list: 'ds-crew-dl' });
	const status = select(v.status || 'scheduled', [['scheduled', 'Scheduled'], ['confirmed', 'Confirmed with customer'], ['in_progress', 'In progress'], ['done', 'Done'], ['cancelled', 'Cancelled']]);
	const notes = h('textarea', { rows: 3, placeholder: 'Materials to load, gate code, where to park…' }, v.notes || '');
	const msg = h('p', { class: 'ds-err' });
	const save = h('button', { class: 'ds-btn' }, 'Save visit');
	const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
	const dispatch = v.id ? h('div', { class: 'ds-row ds-wrap' },
		h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: (ev) => run(ev.currentTarget, async () => { await api('crm/visit/notify', { body: { id: v.id, customer: true, sms: !!X.me.sms } }); toast('Customer notified.'); }, 'Sending…') }, '📣 Tell the customer'),
		h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: (ev) => { const to = crewList.map((c) => c.contact).filter(Boolean); const list = prompt('Send the crew sheet to (emails or mobile numbers, comma separated)', to.join(', ')); if (!list) return; run(ev.currentTarget, async () => { await api('crm/visit/notify', { body: { id: v.id, crew: list.split(',').map((x) => x.trim()).filter(Boolean) } }); toast('Crew sheet sent.'); }, 'Sending…'); } }, '👷 Send crew sheet'),
		h('button', { class: 'ds-btn ds-ghost ds-sm ds-danger', onclick: async () => { if (!confirm(v.start > Date.now() ? 'Delete this visit? The customer will be told it’s cancelled (if “Tell the customer” is ticked).' : 'Delete this visit?')) return; await api('crm/visit/delete', { body: { id: v.id }, query: { notify: tell.checked ? 1 : 0 } }).catch((x) => toast(x.message)); m.remove(); render(X.cur); } }, icon('trash', 16), ' Delete')) : null;
	const m = modal(X.ctx.root, v.id ? 'Visit' : 'Schedule a visit', [
		h('datalist', { id: 'ds-crew-dl' }, ...crewList.map((c) => h('option', { value: c.name }))),
		v.cust_status === 'reschedule' ? h('p', { class: 'ds-warn' }, '🔁 The customer asked for another time', v.cust_note ? ': “' + v.cust_note + '”' : '.', ' Change the date below — they’ll be told and asked to confirm.') : v.cust_status === 'confirmed' ? h('p', { class: 'ds-ok' }, '✅ The customer confirmed this time.') : null,
		h('div', { class: 'ds-form-grid' }, field('Type', kind), field('What', title)), h('div', { class: 'ds-form-grid' }, field('Date', date), field('Start', t1), field('Length', dur), field('Status', status)), field('Where', loc), field('Crew', crew), field('Notes for the crew (not shown to the customer)', notes),
		h('label', { class: 'ds-check' }, tell, v.id ? ' Tell the customer if the time changes or it’s cancelled' : ' Tell the customer now (it’s added to their calendar either way)'),
		reminderSummary(v) || h('p', { class: 'ds-hint' }, '⏰ Reminders are planned automatically on your schedule (Settings → Reminders).'), msg,
		h('div', { class: 'ds-row ds-wrap' }, save, v.id && v.client_id && v.start > Date.now() - 864e5 ? h('button', { class: 'ds-btn ds-ghost', onclick: (ev) => run(ev.currentTarget, async () => { const r = await api('crm/visit/onway', { method: 'POST', query: { id: v.id } }); toast('Sent: “On our way” (' + r.channels.join(', ') + ').'); }, 'Sending…') }, '🚚 On our way') : null), dispatch], close);
	save.onclick = () => run(save, async () => {
		const st = fromLocal(date.value, t1.value);
		try {
			const r = await api('crm/visit', { body: { id: v.id || 0, quote_id: v.quote_id || 0, client_id: v.client_id || 0, title: title.value, kind: kind.value, location: loc.value, start: st, end: st + parseFloat(dur.value) * 3600e3, crew: crew.value, status: status.value, notes: notes.value, notify: tell.checked } });
			m.remove();
			toast(r.told && r.told.length ? 'Saved and the customer was told (' + r.told.join(', ') + '). It’s on their calendar.' : r.linked ? 'Saved. It’s on the customer’s DreamScaper calendar.' : 'Saved.', 4500);
			render(X.cur);
		} catch (x) { msg.textContent = x.message; }
	});
}

/* --------------------------------------------------------------- invoices */

function invoiceRow(i) {
	return h('button', { class: 'ds-hub-row', onclick: () => editInvoice(i) },
		h('span', { class: 'ds-grow' }, h('b', null, `${i.number} · ${i.title}`), h('small', null, `${i.client ? i.client + ' · ' : ''}${i.kind}${i.due ? ' · due ' + i.due : ''}${i.recur ? ' · repeats ' + i.recur : ''}`)),
		h('span', { class: 'ds-col-r' }, h('span', { class: 'ds-qs ds-inv-' + i.status }, i.status === 'paid' ? '✅ Paid' : i.status === 'sent' ? '📨 Sent' : i.status === 'void' ? 'Void' : '✏️ Draft'), h('b', null, money(i.amount, true))));
}
async function viewInvoices(b) {
	put(b, sectionHead('invoices', h('button', { class: 'ds-btn', onclick: () => editInvoice() }, icon('plus', 18), ' New invoice')),
		h('p', { class: 'ds-hint' }, 'Deposits are created automatically when a customer signs. Add progress, final or recurring (maintenance) invoices here.'));
	const list = h('div', { class: 'ds-hub-list' }, h('span', { class: 'ds-spin' }));
	b.append(list);
	try {
		const r = await api('crm/invoices');
		list.innerHTML = '';
		if (!r.items.length) list.append(h('p', { class: 'ds-muted' }, 'No invoices yet.'));
		r.items.forEach((i) => list.append(invoiceRow(i)));
	} catch (e) { list.innerHTML = ''; list.append(h('p', { class: 'ds-err' }, e.message)); }
}
async function editInvoice(i = {}) {
	await loadMe().catch(() => null);
	const ro = i.status === 'paid' || i.status === 'void';
	let client = i.client_id || 0;
	const clientBtn = h('button', { class: 'ds-btn ds-ghost ds-sm', disabled: ro || !!i.quote_id, onclick: async () => { const name = prompt('Customer name to search'); if (!name) return; const r = await api('crm/clients', { query: { q: name } }); if (!r.items.length) return toast('No customer found.'); client = r.items[0].id; clientBtn.textContent = r.items[0].name; } }, i.client || (client ? 'Customer #' + client : 'Choose customer'));
	const kind = select(i.kind || 'final', [['deposit', 'Deposit'], ['progress', 'Progress'], ['final', 'Final'], ['recurring', 'Recurring / maintenance'], ['other', 'Other']], { disabled: ro });
	const title = input(i.title || '', { placeholder: 'e.g. Front yard – final payment', disabled: ro });
	const items = (i.items && i.items.length ? i.items : [{ name: '', qty: 1, rate: 0 }]).map((x) => ({ ...x }));
	const ibox = h('div');
	const total = h('b');
	const drawI = () => {
		ibox.innerHTML = '';
		items.forEach((x, k) => ibox.append(h('div', { class: 'ds-inv-line' }, input(x.name, { placeholder: 'Description', disabled: ro, oninput: (e) => (x.name = e.target.value) }), h('input', { type: 'number', step: 'any', value: x.qty, disabled: ro, 'aria-label': 'Qty', oninput: (e) => { x.qty = parseFloat(e.target.value) || 0; sum(); } }), h('input', { type: 'number', step: 'any', value: x.rate, disabled: ro, 'aria-label': 'Rate', oninput: (e) => { x.rate = parseFloat(e.target.value) || 0; sum(); } }), ro ? null : h('button', { class: 'ds-icon-btn', 'aria-label': 'Remove', onclick: () => { items.splice(k, 1); drawI(); } }, icon('close', 14)))));
		if (!ro) ibox.append(h('button', { class: 'ds-link', onclick: () => { items.push({ name: '', qty: 1, rate: 0 }); drawI(); } }, '+ Add line'));
		sum();
	};
	const sum = () => (total.textContent = 'Total ' + money(items.reduce((s, x) => s + x.qty * x.rate, 0), true));
	drawI();
	const due = h('input', { type: 'date', value: i.due || ymd(Date.now() + 14 * 864e5), disabled: ro });
	const recur = select(i.recur || '', [['', 'One time'], ['weekly', 'Every week'], ['monthly', 'Every month'], ['yearly', 'Every year']], { disabled: ro });
	const msg = h('p', { class: 'ds-err' });
	const save = h('button', { class: 'ds-btn', disabled: ro }, 'Save draft');
	const send = h('button', { class: 'ds-btn', disabled: ro }, icon('send', 16), ' Save & send');
	const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
	const m = modal(X.ctx.root, i.number ? 'Invoice ' + i.number : 'New invoice', [
		h('div', { class: 'ds-row ds-wrap' }, h('span', null, 'Customer: '), clientBtn),
		h('div', { class: 'ds-form-grid' }, field('Type', kind), field('Due', due), field('Repeats', recur)), field('Title', title),
		h('h4', null, 'Lines (description · qty · rate)'), ibox, total,
		X.me && !X.me.connect.ready ? h('p', { class: 'ds-hint' }, 'Tip: connect Stripe in Settings → Get paid online so customers can pay this invoice by card.') : null,
		msg, h('div', { class: 'ds-row ds-wrap' }, save, send,
			i.link && i.status !== 'draft' ? h('button', { class: 'ds-btn ds-ghost', onclick: () => navigator.clipboard.writeText(i.link).then(() => toast('Link copied.')).catch(() => prompt('Copy', i.link)) }, icon('link', 16), ' Copy link') : null,
			i.id && i.status === 'sent' ? h('button', { class: 'ds-btn ds-ghost', onclick: async () => { const how = prompt('Paid how? (cash, check #, Venmo…)', 'check'); if (how == null) return; await api('crm/invoice', { body: { ...payload(), status: 'paid', method: how } }).catch((x) => toast(x.message)); m.remove(); render(X.cur); } }, '💰 Mark paid') : null,
			i.id && i.status !== 'paid' && i.status !== 'void' ? h('button', { class: 'ds-btn ds-ghost ds-danger', onclick: async () => { if (!confirm('Void this invoice?')) return; await api('crm/invoice', { body: { ...payload(), status: 'void' } }).catch((x) => toast(x.message)); m.remove(); render(X.cur); } }, 'Void') : null)], close, 'ds-modal-wide');
	const payload = () => ({ id: i.id || 0, quote_id: i.quote_id || 0, client_id: client, kind: kind.value, title: title.value, items, due: due.value, recur: recur.value });
	const doSave = async (andSend) => {
		msg.textContent = '';
		try {
			const r = await api('crm/invoice', { body: payload() });
			if (andSend) await api('crm/invoice/send', { body: { id: r.id } });
			m.remove();
			toast(andSend ? 'Invoice sent.' : 'Invoice saved.');
			render(X.cur);
		} catch (x) { msg.textContent = x.message; }
	};
	save.onclick = () => run(save, () => doSave(false));
	send.onclick = () => run(send, () => doSave(true), 'Sending…');
}

/* --------------------------------------------------------------- settings */

async function viewSettings(b, view) {
	loading(b);
	let me;
	try { me = await loadMe(true); } catch (e) { return err(b, e); }
	b.innerHTML = '';
	const tabs = [['business', 'Business profile'], ['messages', '✉️ Messages & alerts'], ['reminders', '⏰ Reminders'], ['intake', '❓ Intake questions'], ['social', '🔗 Social & gallery'], ['snippets', '⚡ Quick replies'], ['costs', 'Costs & markups'], ['book', 'Price book'], ['terms', 'Terms & payments'], ['followups', 'Follow-up plan'], ['crew', 'Crew'], ['pay', 'Get paid online']];
	let tab = view.tab || 'business';
	const pane = h('div');
	const tb = h('div', { class: 'ds-chips ds-tabs' }, ...tabs.map(([v, l]) => h('button', { class: 'ds-chip' + (v === tab ? ' on' : ''), onclick: (e) => { tab = v; X.cur.tab = v; for (const x of tb.children) x.classList.remove('on'); e.currentTarget.classList.add('on'); draw(); } }, l)));
	put(b, sectionHead('settings'), tb, pane);
	const saveSettings = async (btn, patch) => run(btn, async () => { const r = await api('crm/settings', { body: patch }); X.me.settings = r.settings; toast('Saved.'); }, 'Saving…');
	const draw = () => {
		pane.innerHTML = '';
		const s = me.settings || {};
		if (tab === 'business') { pane.append(applyForm(me.pro, () => loadMe(true))); return; }
		if (tab === 'messages') return messagesEditor(pane);
		if (tab === 'reminders') return remindersEditor(pane);
		if (tab === 'intake') return intakeEditor(pane);
		if (tab === 'social') return socialEditor(pane);
		if (tab === 'snippets') return snippetsEditor(pane, me, saveSettings);
		if (tab === 'costs') {
			const c = mergeCosts(s.costs);
			const nf = (k, label, hint, step = 'any') => field(label, h('input', { type: 'number', step, value: c[k], inputmode: 'decimal', onchange: (e) => (c[k] = parseFloat(e.target.value) || 0) }), hint);
			const mk = (k, label) => field(label + ' markup %', h('input', { type: 'number', step: 'any', value: c.markup[k], onchange: (e) => (c.markup[k] = parseFloat(e.target.value) || 0) }));
			const mode = select(c.mode, [['markup', 'Markup by category'], ['margin', 'Target gross margin']], { onchange: (e) => { c.mode = e.target.value; } });
			const taxOn = select(c.taxOn, [['all', 'Whole job (CT landscaping is taxable)'], ['materials', 'Materials only'], ['none', 'No sales tax']], { onchange: (e) => (c.taxOn = e.target.value) });
			const show = select(c.showPrices, [['section', 'Price for each section'], ['total', 'Total only']], { onchange: (e) => (c.showPrices = e.target.value) });
			const btn = h('button', { class: 'ds-btn' }, 'Save costs & markups');
			btn.onclick = () => saveSettings(btn, { costs: c });
			put(pane, card('Your costs',
				h('p', { class: 'ds-hint' }, 'These turn quantities into your true cost. Burdened labor = wage + payroll taxes + workers’ comp + insurance, per crew-member hour.'),
				h('div', { class: 'ds-form-grid' }, nf('laborRate', 'Labor cost per hour ($)', 'burdened'), nf('overheadPct', 'Overhead (%)', 'trucks, office, insurance'), nf('minJob', 'Minimum job ($)'), nf('mobilization', 'Mobilization per job ($)'))),
			card('Your price to the customer',
				h('p', { class: 'ds-hint' }, 'Markup is added on top of each cost type. Margin mode prices everything so your gross profit is the target % of the price. (A 50% markup = 33% margin.)'),
				field('Pricing method', mode),
				h('div', { class: 'ds-form-grid' }, mk('material', 'Materials'), mk('labor', 'Labor'), mk('equipment', 'Equipment'), mk('sub', 'Subcontractors'), mk('disposal', 'Disposal'), mk('delivery', 'Delivery'), mk('other', 'Other'), nf('marginPct', 'Target gross margin (%)', 'margin mode only')),
				h('div', { class: 'ds-form-grid' }, nf('taxPct', 'Sales tax (%)', 'CT: 6.35%'), field('Tax applies to', taxOn), nf('depositPct', 'Deposit when signed (%)'), nf('roundTo', 'Round section prices up to ($)'), nf('validDays', 'Quotes are good for (days)'), field('On proposals show', show)), btn));
			return;
		}
		if (tab === 'book') {
			const bk = mergeBook(s.book);
			const over = JSON.parse(JSON.stringify(s.book || {}));
			const btn = h('button', { class: 'ds-btn' }, 'Save price book');
			btn.onclick = () => saveSettings(btn, { book: over });
			const labels = { cost: 'Cost per unit ($)', waste: 'Waste / overage (%)', hrsPerUnit: 'Hours per unit', prepPer100: 'Prep hours per 100 sq ft', sfCost: 'Cost per sq ft ($)', hrsPerSf: 'Hours per sq ft', blockCost: 'Cost per block ($)', capCost: 'Cost per cap ($)', hrsPerFaceSf: 'Hours per face sq ft', fixture: 'Fixture cost ($)', transformer: 'Transformer cost ($)' };
			put(pane, h('p', { class: 'ds-hint' }, 'Your supplier prices and production rates. Every number here feeds the automatic estimate. Pairs like “steel: 3.25, 0.06” are cost per foot and hours per foot.'),
				...Object.entries(bk).map(([k, item]) => h('details', { class: 'ds-book' }, h('summary', null, item.name || k),
					h('div', { class: 'ds-form-grid' }, ...Object.entries(item).filter(([kk, v]) => kk !== 'name' && (typeof v === 'number' || (Array.isArray(v) && v.every((n) => typeof n === 'number')))).map(([kk, v]) => field(labels[kk] || kk.replace(/([A-Z])/g, ' $1').replace(/^./, (x) => x.toUpperCase()), input(Array.isArray(v) ? v.join(', ') : v, { inputmode: 'decimal', onchange: (e) => { const val = Array.isArray(v) ? e.target.value.split(',').map((n) => parseFloat(n) || 0) : parseFloat(e.target.value) || 0; over[k] = { ...(over[k] || {}), [kk]: val }; } })))))),
				h('div', { class: 'ds-row ds-wrap' }, btn, h('button', { class: 'ds-btn ds-ghost', onclick: (e) => { if (confirm('Reset the whole price book to DreamScaper defaults?')) saveSettings(e.currentTarget, { book: {} }).then(() => draw()); } }, 'Reset to defaults')));
			return;
		}
		if (tab === 'terms') {
			const t = h('textarea', { rows: 12 }, s.terms || DEFAULT_TERMS);
			const pays = (s.payments && s.payments.length ? s.payments : [{ label: 'Deposit to schedule', pct: mergeCosts(s.costs).depositPct, when: 'when you sign' }, { label: 'Balance', pct: 100 - mergeCosts(s.costs).depositPct, when: 'on completion' }]).map((x) => ({ ...x }));
			const pbox = h('div');
			const drawP = () => { pbox.innerHTML = ''; pays.forEach((p, i) => pbox.append(h('div', { class: 'ds-row' }, input(p.label, { oninput: (e) => (p.label = e.target.value) }), h('input', { type: 'number', value: p.pct, class: 'ds-price-in', oninput: (e) => (p.pct = parseFloat(e.target.value) || 0) }), '%', input(p.when, { oninput: (e) => (p.when = e.target.value) }), h('button', { class: 'ds-icon-btn', 'aria-label': 'Remove', onclick: () => { pays.splice(i, 1); drawP(); } }, icon('close', 14))))); pbox.append(h('button', { class: 'ds-link', onclick: () => { pays.push({ label: 'Progress payment', pct: 0, when: '' }); drawP(); } }, '+ Add payment')); };
			drawP();
			const btn = h('button', { class: 'ds-btn' }, 'Save');
			btn.onclick = () => saveSettings(btn, { terms: t.value, payments: pays });
			put(pane, card('Proposal terms', h('p', { class: 'ds-hint' }, 'Shown on every proposal above the signature. You can still change them per quote.'), t), card('Default payment schedule', pbox), btn);
			return;
		}
		if (tab === 'followups') {
			const base = scheduleFollowups(startOfDay(Date.now()), s.followups && s.followups.length ? s.followups : DEFAULT_FOLLOWUPS);
			const box = h('div');
			const ed = followupEditor(box, base, [], !!me.sms, { customer_first_name: 'Jane', customer_name: 'Jane Smith', project_name: 'Front Yard Renovation', quote_total: '$8,450', quote_link: 'https://…', company_name: me.pro.business, contractor_name: me.pro.contact || me.pro.business, contractor_phone: me.pro.phone, valid_until: 'June 30', month: 'May', customer_address: '123 Example St', deposit_amount: '$2,535' });
			const btn = h('button', { class: 'ds-btn' }, 'Save as my default plan');
			btn.onclick = () => saveSettings(btn, { followups: ed.items().map((it) => ({ day: Math.max(0, Math.round((startOfDay(it.at) - startOfDay(Date.now())) / 864e5)), time: hm(it.at), channel: it.channel, subject: it.subject, body: it.body, include: it.include })) });
			put(pane, h('p', { class: 'ds-hint' }, 'Your default follow-up plan, used every time you send a quote (dates are counted from the day you send it). It’s filled in with a best-practice plan: a thank-you the next day, a quick text on day 3, the before-and-after on day 7, a scheduling nudge on day 14, an offer to adjust on day 21, and a polite close-the-loop on day 30.'),
				box, h('div', { class: 'ds-row ds-wrap' }, btn, h('button', { class: 'ds-btn ds-ghost', onclick: (e) => saveSettings(e.currentTarget, { followups: [] }).then(() => draw()) }, 'Reset to the recommended plan')));
			return;
		}
		if (tab === 'crew') {
			const crew = (s.crew || []).map((x) => ({ ...x }));
			const box = h('div');
			const drawC = () => { box.innerHTML = ''; crew.forEach((c, i) => box.append(h('div', { class: 'ds-row' }, input(c.name, { placeholder: 'Name', oninput: (e) => (c.name = e.target.value) }), input(c.contact, { placeholder: 'Email or mobile (for crew sheets)', oninput: (e) => (c.contact = e.target.value) }), input(c.team || '', { placeholder: 'Crew (e.g. Crew A)', 'aria-label': 'Which crew', list: 'ds-team-dl', oninput: (e) => (c.team = e.target.value) }), h('button', { class: 'ds-icon-btn', 'aria-label': 'Remove', onclick: () => { crew.splice(i, 1); drawC(); } }, icon('close', 14))))); box.append(h('button', { class: 'ds-link', onclick: () => { crew.push({ name: '', contact: '' }); drawC(); } }, '+ Add crew member')); };
			drawC();
			const btn = h('button', { class: 'ds-btn' }, 'Save crew');
			btn.onclick = () => saveSettings(btn, { crew: crew.filter((c) => c.name) });
			const teams = [...new Set(crew.map((c) => (c.team || '').trim()).filter(Boolean))];
			put(pane, h('p', { class: 'ds-hint' }, 'Your field employees. They show up when you schedule visits, and crew sheets (address, map link, scope, notes) can be emailed or texted to them. Put people who work together in the same crew. You, the owner, don’t count toward your plan.'), usageBar('employees'), usageBar('crews'),
				h('datalist', { id: 'ds-team-dl' }, ...teams.map((t) => h('option', { value: t }))), box, btn);
			return;
		}
		if (tab === 'pay') {
			const st = h('div');
			put(pane, card('Get paid online (Stripe)',
				me.connect.on ? h('p', { class: 'ds-hint' }, `Customers pay deposits and invoices by card, Apple Pay or Google Pay. Money goes straight to your own Stripe account (Stripe’s fee is 2.9% + 30¢${me.connect.fee ? `; this site keeps ${me.connect.fee}%` : ''}). Payouts reach your bank in about 2 business days.`) : h('p', { class: 'ds-warn' }, 'Online payments aren’t set up on this website yet.'),
				st,
				me.connect.on ? h('div', { class: 'ds-row ds-wrap' },
					h('button', { class: 'ds-btn', onclick: (e) => run(e.currentTarget, async () => { const r = await api('crm/connect', { body: {} }); location.href = r.url; }, 'Opening Stripe…') }, me.connect.started ? (me.connect.ready ? 'Update my Stripe details' : 'Finish Stripe setup') : 'Connect with Stripe'),
					me.connect.started ? h('button', { class: 'ds-btn ds-ghost', onclick: (e) => run(e.currentTarget, async () => { const r = await api('crm/connect/status'); st.textContent = r.ready ? '✅ Ready to take payments.' : '⏳ Stripe still needs some details.'; if (r.dashboard) window.open(r.dashboard, '_blank', 'noopener'); }, 'Checking…') }, me.connect.ready ? 'Open my Stripe dashboard' : 'Check status') : null) : null),
			card('Text messages', h('p', { class: me.sms ? 'ds-hint' : 'ds-warn' }, me.sms ? '✅ Texting is on. Follow-ups and visit reminders can go by text; customer replies are logged and emailed to you.' : 'Texting isn’t set up on this website yet (the site owner adds Twilio in Settings → DreamScaper). Email works now.')));
			if (me.connect.ready) st.textContent = '✅ Ready to take payments.';
		}
	};
	draw();
}
const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

/* ------------------------------------------------------- inbox, plan, help */

const KIND_IC = { consult: '💬', site_visit: '📏', estimate: '🧾', job: '🛠️', maintenance: '✂️', followup: '🔁', meeting: '🤝', other: '📅' };
const KINDS_V = { site_visit: 'Site visit', consult: 'Consultation', estimate: 'Estimate walk-through', job: 'Job day', maintenance: 'Maintenance visit', followup: 'Follow-up visit', meeting: 'Meeting', other: 'Other' };

function viewInbox(b, view) {
	const nav2 = (v) => {
		X.cur = { v: 'inbox', ...v };
		b.innerHTML = '';
		const box = h('div', { class: v.v === 'thread' ? 'ds-ib-in-hub' : '' });
		if (v.v === 'thread') b.append(h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => nav2({ v: 'list', filter: v.backFilter || 'needs_reply' }) }, '← All conversations'));
		else put(b, sectionHead('hubinbox'), tip('hubinbox', 'Requests from homeowners land here with their full brief. “Needs reply” shows who’s waiting, oldest first.'));
		b.append(box);
		inboxPane(box, v, { pro: true, go: (nv) => nav2({ ...nv, backFilter: v.filter }) });
	};
	nav2(view.id || view.quote ? { v: 'thread', id: view.id, quote: view.quote } : { v: 'list', filter: view.filter || 'needs_reply' });
}
function viewPlan(b) { billingView(b); }
async function viewHelp(b) {
	await loadCaps(true);
	put(b, h('h2', null, 'What’s in DreamScaper'), h('p', { class: 'ds-hint' }, 'Every area, in one line. Tap any of them for what you can do there.'), capabilityMap(true));
}

/** Follow-ups that came due while paused: send now or discard. */
async function heldSheet() {
	let r;
	try { r = await api('crm/held'); } catch (e) { toast(e.message); return; }
	const pick = new Set(r.items.map((x) => x.id));
	const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
	const act = (a) => run(null, async () => { await api('crm/held', { body: { action: a, ids: [...pick] } }); m.remove(); toast(a === 'send' ? 'Sending now.' : 'Discarded.'); render(X.cur); });
	const m = modal(X.ctx.root, 'Follow-ups held while your payment was outstanding', [
		h('p', { class: 'ds-hint' }, 'These came due while your payment was outstanding, so nothing went out late. Tick the ones that still make sense to send.'),
		h('div', { class: 'ds-checks' }, ...r.items.map((x) => h('label', { class: 'ds-check' }, h('input', { type: 'checkbox', checked: true, onchange: (e) => (e.target.checked ? pick.add(x.id) : pick.delete(x.id)) }), ` ${x.number || ''} ${x.title || ''} — “${x.subject || x.channel}” (was due ${new Date(x.was_due).toLocaleDateString()})`))),
		h('div', { class: 'ds-row ds-wrap' }, h('button', { class: 'ds-btn', onclick: () => act('send') }, 'Send the ticked ones now'), h('button', { class: 'ds-btn ds-ghost', onclick: () => act('discard') }, 'Discard the ticked ones'))], close);
}

/** For the Inbox: contractor actions from a conversation. */
export const hubActions = {
	openQuote: (id) => openHub({ v: 'quote', id }),
	bookVisit: (seed) => editVisit(seed),
	openSettings: (tab) => openHub({ v: 'settings', tab })
};

/* ------------------------------------------------------------------ apply */

async function viewApply(b) {
	loading(b);
	let r;
	try { r = await api('crm/application'); } catch (e) { return err(b, e); }
	b.innerHTML = '';
	const p = r.pro;
	if (p && p.status === 'pending') {
		put(b, h('div', { class: 'ds-soon' }, h('div', { class: 'ds-soon-ic' }, '⏳'), h('h2', null, 'Your application is being reviewed'), h('p', null, `Thanks, ${p.contact || p.business}! We’ll email you at ${p.email} when ${p.business} is approved. Usually within a business day.`)), card('Your business profile', applyForm(p)));
		return;
	}
	if (p && p.status !== 'approved') {
		put(b, h('div', { class: 'ds-soon' }, h('div', { class: 'ds-soon-ic' }, '⚠️'), h('h2', null, 'Your contractor account isn’t active'), h('p', null, 'Please contact us if you think this is a mistake.')));
		return;
	}
	put(b, h('div', { class: 'ds-hub-hero' }, h('h2', null, 'Grow your landscaping business with DreamScaper'),
		h('ul', null, h('li', null, '📥 Homeowners nearby find you and send their Dreamscape designs for a quote'), h('li', null, '⚡ Turn any before & after into a measured plan, an itemized job cost and a polished proposal in minutes'), h('li', null, '✍️ Customers sign on their phone and pay the deposit online'), h('li', null, '📨 Automatic email & text follow-ups, scheduling, job costing and invoices')),
		h('p', { class: 'ds-hint' }, 'Any landscaping or hardscape contractor can apply. We check your license and insurance before approving.')), card('Apply', applyForm(p)));
}

/** Business profile / application form (also used in Settings → Business profile). */
function applyForm(p, onSaved) {
	p = p || {};
	const u = session.user || {};
	const f = {
		business: input(p.business, { autocomplete: 'organization' }), contact: input(p.contact || u.name), phone: input(p.phone || u.phone, { type: 'tel' }), email: input(p.email || u.email, { type: 'email' }), website: input(p.website, { type: 'url', placeholder: 'https://' }),
		license: input(p.license, { placeholder: 'e.g. CT Home Improvement HIC.0123456' }), insured: h('input', { type: 'checkbox', checked: !!p.insured }), years: h('input', { type: 'number', min: 0, value: p.years || '' }),
		address: input(p.address), town: input(p.town), state: input(p.state || 'CT', { maxlength: 2 }), zip: input(p.zip), radius: h('input', { type: 'number', min: 5, max: 200, value: p.radius || 25 }),
		bio: h('textarea', { rows: 4, placeholder: 'What you do best, how long you’ve been doing it, what customers love about you.' }, p.bio || '')
	};
	const svc = new Set(p.services || []);
	const chips = h('div', { class: 'ds-chips' }, ...SERVICES.map((s) => h('button', { type: 'button', class: 'ds-chip' + (svc.has(s) ? ' on' : ''), onclick: (e) => { svc.has(s) ? svc.delete(s) : svc.add(s); e.currentTarget.classList.toggle('on'); } }, s)));
	let logo = null;
	const lg = h('div', { class: 'ds-cust-photo' }, p.logo ? h('img', { src: p.logo, alt: 'Logo' }) : h('span', null, '🏷️'));
	const msg = h('p', { class: 'ds-err', role: 'alert' });
	const btn = h('button', { class: 'ds-btn ds-wide' }, p.business ? 'Save business profile' : 'Apply to be a DreamScaper contractor');
	btn.onclick = () => run(btn, async () => {
		msg.textContent = '';
		try {
			await api('crm/apply', { body: { business: f.business.value, contact: f.contact.value, phone: f.phone.value, email: f.email.value, website: f.website.value, license: f.license.value, insured: f.insured.checked, years: f.years.value, address: f.address.value, town: f.town.value, state: f.state.value, zip: f.zip.value, radius: f.radius.value, services: [...svc], bio: f.bio.value, logo } });
			await refreshSession();
			toast(p.business ? 'Saved.' : 'Application sent! We’ll email you when you’re approved.', 5000);
			if (onSaved) onSaved(); else render(X.cur);
		} catch (e) { msg.textContent = e.message; }
	}, 'Saving…');
	return h('div', null,
		h('div', { class: 'ds-row' }, lg, h('button', { class: 'ds-btn ds-ghost ds-sm', type: 'button', onclick: async () => { const s = await pickFile(); if (s && s.bitmap) { const c = document.createElement('canvas'); const k = Math.min(1, 600 / Math.max(s.bitmap.width, s.bitmap.height)); c.width = s.bitmap.width * k; c.height = s.bitmap.height * k; c.getContext('2d').drawImage(s.bitmap, 0, 0, c.width, c.height); logo = c.toDataURL('image/png'); lg.innerHTML = ''; lg.append(h('img', { src: logo, alt: 'Logo' })); } } }, icon('upload', 16), ' Logo')),
		h('div', { class: 'ds-form-grid' }, field('Business name *', f.business), field('Your name', f.contact), field('Business phone *', f.phone), field('Business email *', f.email), field('Website', f.website), field('Years in business', f.years)),
		h('div', { class: 'ds-form-grid' }, field('License # (CT HIC or other)', f.license), h('label', { class: 'ds-check' }, f.insured, ' We carry general liability insurance')),
		h('h4', null, 'Where you work'), h('div', { class: 'ds-form-grid' }, field('Street', f.address), field('Town *', f.town), field('State', f.state), field('ZIP', f.zip), field('Service radius (miles)', f.radius)),
		h('h4', null, 'Services'), chips, field('About your business', f.bio), msg, btn);
}

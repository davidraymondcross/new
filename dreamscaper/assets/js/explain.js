/* DreamScaper – every area explains itself.
 *
 * sectionHead(key)   heading + one plain sentence about what this area is for + a "?" button
 * openHelp(key)      "What can I do here?": what it does, what you can do, what it connects to,
 *                    and — if your plan doesn't include it — which plan does
 * lockNote(feature)  a locked feature, shown greyed with what it does and the plan it needs
 * tip(key, text)     a one-time tip the first time someone opens an area (remembered per device)
 * capabilityMap()    the whole product on one page: every area, one line each, and whether you have it
 */
import { h, put, icon } from './util.js?v=2.7.3';
import { api, session } from './api.js?v=2.7.3';
import { modal } from './capture.js?v=2.7.3';

let ROOT = null, GO_PLANS = null;
export function initExplain(root, goPlans) { ROOT = root; GO_PLANS = goPlans || null; }
export function setPlansRoute(fn) { GO_PLANS = fn; }

/** key → { t: title, p: purpose (one sentence), can: [things you can do], links: what it connects to, f: plan feature } */
export const HELP = {
	/* ---------------------------------------------------------------- homeowners */
	find: { t: 'Find a Local Contractor', p: 'Landscapers who work near you, with real reviews and how well they turned other people’s designs into real yards.',
		can: ['Search by town or ZIP, service, rating or Dream-to-Reality score', 'Open a contractor’s page: reviews, finished projects, licenses, social links', 'Tap “Add to my request” on as many contractors as you like', 'Send one guided request to all of them at once', 'Message a contractor directly'],
		links: 'Your request opens a conversation with each contractor in Messages, and their quotes arrive in My Projects.' },
	request: { t: 'Request quotes', p: 'One guided request that gives contractors everything they need to price your project — so they don’t have to call you with questions.',
		can: ['Pick the services you want and describe the project (or talk instead of typing)', 'Add your property photos and aerial view, step by step', 'Attach a Dreamscape design', 'Answer quick tap questions about access, slope, utilities and more', 'Send it to as many contractors as you choose', 'Save and finish later — your answers are kept'],
		links: 'Each contractor gets the full brief in Messages, and you’ll see their replies, visits and quotes in My Projects.' },
	projects: { t: 'My Projects', p: 'Everything about the work you’re having done: requests, quotes to sign, appointments, invoices and reviews.',
		can: ['See where each project stands, from request to finished', 'View and sign proposals', 'Confirm or reschedule appointments', 'Pay invoices online', 'Message the contractor about that project', 'Leave a review when the work is done'],
		links: 'Appointments here are also on My Calendar; conversations are in Messages.' },
	calendar: { t: 'My Calendar', p: 'Every appointment a contractor books with you — automatically, the moment they book it.',
		can: ['See upcoming site visits, consultations and job days', 'Confirm, or ask for a different time', 'Add one appointment to your phone’s calendar', 'Subscribe so every appointment shows up in Google, Apple or Outlook calendar on its own'],
		links: 'Your contractor sets how often you’re reminded before each appointment.' },
	inbox: { t: 'Messages', p: 'All your conversations in one place — with contractors about your projects, and with other members.',
		can: ['Read and reply to contractors and members', 'Send photos', 'See which project a conversation is about, with its next appointment and quote', 'Mute or archive conversations', 'Get an alert (in the app and by email) when someone writes'],
		links: 'Project conversations link straight to the quote, the schedule and the invoices.' },
	/* ---------------------------------------------------------------- contractors */
	dash: { t: 'Dashboard', p: 'What needs your attention today, at a glance.',
		can: ['New requests and messages waiting for a reply', 'Quotes out, signed work and money owed', 'Today’s and upcoming appointments', 'Follow-ups that were held while your account was paused', 'Your setup checklist'],
		links: 'Every number opens the area it comes from.' },
	hubinbox: { t: 'Inbox', p: 'Every customer conversation, attached to the right project, with what still needs a reply on top.',
		can: ['Reply to homeowners about their requests and jobs', 'See the project, address, next appointment and quote beside the conversation', 'Book a site visit, start the estimate or ask for missing details in one tap', 'Track who still needs a reply and how long they’ve waited', 'Use saved quick replies'],
		links: 'Requests from Find a Contractor arrive here with the full brief, and your automatic messages are posted here too.', f: 'inbox_pro' },
	customers: { t: 'Customers', p: 'Your customers and their properties — contact details, property photos, plans and the full history.',
		can: ['Add and edit customers and properties', 'Open a property’s aerial view, photos and 2D plan', 'See every quote, job, appointment, invoice and note for a customer', 'Log calls and notes'],
		links: 'A customer’s address becomes the property, the job location and the appointment address automatically.', f: 'clients' },
	quotes: { t: 'Quotes', p: 'Turn requests and designs into measured estimates and proposals your customers sign online.',
		can: ['Start from a homeowner’s request, a Dreamscape or a blank quote', 'Measure on the 2D site plan and get automatic quantities and pricing', 'Send for e-signature by email or text', 'Schedule automatic follow-ups'],
		links: 'Signed quotes become jobs; deposits become invoices automatically.', f: 'quotes_month' },
	jobs: { t: 'Jobs', p: 'Signed work, from scheduling to done, with actual costs so you know what you made.',
		can: ['See signed jobs and their status', 'Record actual materials, labor and other costs', 'Add finished photos and show them on your profile', 'Mark jobs done (the customer is told, and asked for a review on your timing)'],
		links: 'Job days come from your Schedule; money comes from Invoices.' },
	schedule: { t: 'Calendar', p: 'Your month at a glance: job days, appointments, estimate visits, door-to-door sessions and time off — shared automatically with each customer’s calendar.',
		can: ['Tap any day to book a job day, an appointment, an estimate visit, a door-to-door session or time off', 'Switch between the month grid and a day-by-day list', 'Set your working hours (default 7 AM–5 PM) in Settings → Crew & hours', 'Book appointments of any type', 'Move or cancel them (the customer’s calendar and reminders update themselves)', 'See who confirmed and who asked to reschedule', 'Send crew sheets and “On our way” texts', 'Sync your schedule to Google, Apple or Outlook'],
		links: 'Reminders go out on your schedule — set it in Settings → Reminders.' },
	invoices: { t: 'Invoices', p: 'Bill customers and get paid online by card, Apple Pay or Google Pay.',
		can: ['Create deposit, progress, final and recurring invoices', 'Send them by email', 'See what’s paid and what’s owed', 'Overdue reminders on your own timing'],
		links: 'Payments go straight to your Stripe account; the customer gets a receipt automatically.' },
	settings: { t: 'Settings', p: 'Make DreamScaper work the way your business works.',
		can: ['Business profile, logo, services and social links', 'Costs, markups and your price book', 'Every automatic message, in your own words', 'Your reminder schedule', 'Your own questions in the homeowner’s request form', 'Crew, terms and online payments'],
		links: 'Everything here feeds your estimates, proposals and messages.' },
	plan: { t: 'Plan & billing', p: 'Your plan, what it includes, how much you’ve used, and your billing.',
		can: ['Start your free trial or choose a plan', 'Compare what each plan includes', 'See how much of each limit you’ve used', 'Update your card, see invoices, change or cancel your plan', 'Export all your records at any time'],
		links: 'If a payment fails you keep full access while it’s retried; after a week AI and other extras pause, then the account becomes read-only and finally suspended — nothing is ever deleted, and paying restores everything instantly.' },
	messages: { t: 'Messages & alerts', p: 'Every automatic message your customers get, and every alert you get — in your own words.',
		can: ['Turn each message on or off', 'Choose email, text and in-app for each one', 'Rewrite the subject, email and text', 'Insert details like the customer’s name or the appointment time with one tap', 'Preview it with real-looking details and send yourself a test'],
		links: 'Appointment reminder timing is under Reminders; invoice-overdue and review timing are right beside those messages.' },
	reminders: { t: 'Reminders', p: 'How often, and how, customers are reminded before each appointment.',
		can: ['Add as many reminders as your plan allows: minutes, hours or days before', 'Choose email, text or in-app for each', 'Use different reminders for different appointment types', 'Get your own reminders too'],
		links: 'The words of the reminder are in Messages & alerts → Appointment reminder.', f: 'reminder_rules' },
	intake: { t: 'Intake questions', p: 'Your own questions in the homeowner’s request form, so you never have to call back to ask them.',
		can: ['Add questions for each service you offer', 'Use short answers, choices, yes/no, numbers or dates', 'Say why you ask (homeowners answer more when they know why)', 'Start from DreamScaper’s questions'],
		links: 'Answers appear in the request brief in your Inbox.', f: 'intake' },
	social: { t: 'Social links & gallery', p: 'Show homeowners you’re real: your social pages and your best work on your contractor page.',
		can: ['Add your Google Business Profile, Facebook, Instagram, Houzz, YouTube, Nextdoor, TikTok and LinkedIn', 'Paste a link or just your @name', 'Switch each link on or off — it changes everywhere at once', 'Test each link before homeowners see it', 'Curate a gallery of finished work'],
		links: 'Switched-on links appear on your contractor page, your Find a Contractor card (top 3), and your proposals and invoices. Every plan includes every network.', f: 'gallery' },
	canvass: { t: 'Door-to-door', p: 'A map for knocking on doors: mark every house you visit, so you follow up with the interested ones and never knock twice on a door that said no.',
		can: ['Tap a house to record what happened: flyer left, talked, interested, wants a quote, call back, not interested, do not come back, no soliciting…', 'Add their name, phone, notes and a follow-up date', 'See every house coloured by result; filter by result', 'Get a list of follow-ups that are due', 'Turn an interested homeowner into a lead in one tap', 'Use “Where am I” to follow your position as you walk', 'Export everything to a spreadsheet'],
		links: 'Leads you create here appear in Customers. Door-to-door sessions can be booked on your Calendar. Only you can see these houses.' },
	snippets: { t: 'Quick replies', p: 'Answers you send often, ready to drop into any conversation in one tap.',
		can: ['Save replies like “I can come Thursday between 9 and 11 — does that work?”', 'Use merge details like the customer’s first name'], f: 'snippets' }
};

/* ----------------------------------------------------------------- caps */

let CAPS = null, capsAt = 0;
/** The contractor's plan, features and limits (null for non-contractors). */
export async function loadCaps(force) {
	if (!force && CAPS && Date.now() - capsAt < 60000) return CAPS;
	try { CAPS = await api('crm/capabilities'); capsAt = Date.now(); } catch (e) { CAPS = null; }
	return CAPS;
}
export const caps = () => CAPS;
export const has = (f) => !CAPS || !CAPS.features || !CAPS.features[f] || CAPS.features[f].on;
export function needPlan(f) {
	if (!CAPS || !CAPS.plans) return '';
	const cur = CAPS.features[f];
	for (const p of CAPS.plans) {
		const v = p.f[f];
		if (cur && cur.type === 'limit' ? (v < 0 || v > (cur.limit < 0 ? Infinity : cur.limit)) : v === 1) return p.name;
	}
	return '';
}

/* ------------------------------------------------------------- headings */

/** Heading for an area: title, one-sentence purpose, and the "What can I do here?" button. */
export function sectionHead(key, ...right) {
	const x = HELP[key] || { t: key, p: '' };
	return h('div', { class: 'ds-sechead' },
		h('div', { class: 'ds-sechead-t' },
			h('h2', null, x.t, h('button', { class: 'ds-help-q', type: 'button', 'aria-label': `What can I do in ${x.t}?`, title: 'What can I do here?', onclick: () => openHelp(key) }, '?')),
			x.p ? h('p', { class: 'ds-purpose' }, x.p) : null),
		right.length ? h('div', { class: 'ds-row ds-wrap ds-sechead-r' }, ...right) : null);
}

/** "What can I do here?" panel. */
export function openHelp(key) {
	const x = HELP[key];
	if (!x || !ROOT) return;
	const locked = x.f && CAPS && CAPS.features && CAPS.features[x.f] && !CAPS.features[x.f].on;
	const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
	const m = modal(ROOT, x.t, [
		h('p', { class: 'ds-purpose ds-purpose-l' }, x.p),
		h('h4', null, 'What you can do here'),
		h('ul', { class: 'ds-can' }, ...x.can.map((c) => h('li', null, c))),
		x.links ? h('p', { class: 'ds-hint' }, '🔗 ', x.links) : null,
		locked ? h('div', { class: 'ds-lock' }, h('b', null, '🔒 Not in your current plan'), h('p', null, `${CAPS.features[x.f].label} is included in the ${needPlan(x.f) || 'higher'} plan.`), GO_PLANS ? h('button', { class: 'ds-btn ds-sm', onclick: () => { m.remove(); GO_PLANS(); } }, 'See plans') : null) : null
	], close);
}

/** A locked feature: what it does and which plan has it (never a dead end). */
export function lockNote(f, label) {
	const feat = CAPS && CAPS.features ? CAPS.features[f] : null;
	const need = needPlan(f);
	return h('div', { class: 'ds-lock' },
		h('b', null, '🔒 ', label || (feat ? feat.label : 'This feature')),
		feat ? h('p', null, feat.desc) : null,
		h('p', { class: 'ds-hint' }, need ? `Included in the ${need} plan.` : 'Not included in your plan.'),
		GO_PLANS ? h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => GO_PLANS() }, 'See plans') : null);
}

/** Usage bar for a limit, e.g. "18 of 25 quotes this month". */
export function usageBar(f, showUnlimited) {
	const x = CAPS && CAPS.features ? CAPS.features[f] : null;
	if (!x || x.type !== 'limit') return null;
	const n = (v) => Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
	const resets = x.resets ? ` · resets ${new Date(x.resets).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : '';
	if (x.limit < 0 && !showUnlimited) return null; // unlimited: nothing to watch
	if (x.limit < 0) return h('div', { class: 'ds-usage' }, h('small', null, `${x.label}: ${n(x.used)} · unlimited`));
	if (x.limit === 0) return h('div', { class: 'ds-usage full' }, h('small', null, `${x.label}: not in your plan`));
	const pct = Math.min(100, Math.round((x.used / x.limit) * 100));
	return h('div', { class: 'ds-usage' + (pct >= 100 ? ' full' : pct >= 80 ? ' near' : '') },
		h('small', null, `${x.label}: ${n(x.used)} of ${n(x.limit)}${pct >= 100 ? ' — limit reached' : pct >= 80 ? ' — almost at your limit' : ''}${resets}`),
		h('i', null, h('em', { style: { width: pct + '%' } })));
}

/* --------------------------------------------------------------- tips */

const seen = (k) => { try { return localStorage.getItem('ds_tip_' + k) === '1'; } catch (e) { return true; } };
const mark = (k) => { try { localStorage.setItem('ds_tip_' + k, '1'); } catch (e) { /* storage off */ } };
/** One-time tip shown the first time someone opens an area. */
export function tip(key, text) {
	if (seen(key)) return null;
	const el = h('div', { class: 'ds-tipbar', role: 'note' }, h('span', null, '💡'), h('p', null, text),
		h('button', { class: 'ds-link', onclick: () => { mark(key); el.remove(); } }, 'Got it'));
	return el;
}

/* --------------------------------------------------- 402 → plan prompt */

/** Turn a "not in your plan" / "paused" error into a helpful prompt. Returns true if handled. */
export function planPrompt(e, toast) {
	if (!e || e.status !== 402) return false;
	const d = (e.data && e.data.data) || {};
	if (!ROOT) { toast && toast(e.message, 6000); return true; }
	const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
	const stage = d.stage || d.paused;
	const title = !d.paused ? 'Not in your plan' : d.paused === 'none' ? 'Start your free trial' : d.paused === 'cancelled' ? 'Your subscription has ended'
		: stage === 'restricted' ? 'Paused while your payment is outstanding' : stage === 'readonly' ? 'Your account is read-only' : 'Suspended — Payment Required';
	const m = modal(ROOT, title, [
		h('p', null, e.message),
		d.paused && d.paused !== 'none' ? h('p', { class: 'ds-hint' }, 'You can still open and export everything. Nothing has been deleted.') : null,
		h('div', { class: 'ds-row ds-wrap' }, GO_PLANS ? h('button', { class: 'ds-btn', onclick: () => { m.remove(); GO_PLANS(); } }, d.paused === 'none' ? 'Start my free trial' : d.paused === 'cancelled' ? 'Choose a plan' : d.paused ? 'Update payment method' : 'See plans') : null, h('button', { class: 'ds-btn ds-ghost', onclick: () => m.remove() }, 'Not now'))
	], close);
	return true;
}

/* ----------------------------------------------------- capability map */

/** Every area, one line each, and whether this account has it. */
export function capabilityMap(isPro) {
	const homeowner = ['find', 'request', 'projects', 'calendar', 'inbox'];
	const pro = ['dash', 'hubinbox', 'customers', 'quotes', 'jobs', 'schedule', 'canvass', 'invoices', 'messages', 'reminders', 'intake', 'social', 'snippets', 'plan'];
	const row = (k) => {
		const x = HELP[k];
		const feat = x.f && CAPS && CAPS.features ? CAPS.features[x.f] : null;
		const locked = isPro && CAPS && (!CAPS.writable || (feat && !feat.on));
		return h('button', { class: 'ds-capmap-row' + (locked ? ' locked' : ''), onclick: () => openHelp(k) },
			h('b', null, x.t), h('small', null, x.p),
			isPro ? h('span', { class: 'ds-capmap-st' }, locked ? (CAPS && !CAPS.writable ? '🔒 Read-only' : '🔒 ' + (needPlan(x.f) || 'Upgrade')) : '✅') : null);
	};
	return h('div', { class: 'ds-capmap' },
		h('h3', null, 'For homeowners'), ...homeowner.map(row),
		isPro ? h('h3', null, 'Your Contractor Hub') : null, ...(isPro ? pro.map(row) : []));
}

export const isSignedIn = () => !!session.user;

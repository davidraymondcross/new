/* DreamScaper – Landscape Plans (Contractor Hub): the step-by-step 2D landscape plan wizard.
 *
 *  1 Customer & property   2 What to plan       3 Bird's-eye base map   4 Trace the property
 *  5 Check the scale       6 Site photos        7 Site details          8 Style
 *  9 Designs (Dreamscapes) 10 Generate & review
 *
 * Every step says exactly what to do, checks what was given (and says what's wrong and how to fix
 * it), and is saved as you go — on this device and on the property — so a plan started in the
 * office can be finished on site. Measurements come from to-scale aerial imagery (Connecticut 3-inch,
 * USGS elsewhere) or a survey, corrected by one tape measurement; photos record what can't be seen
 * from above. The geometry and the plan generator live in plangen.js; photo checks in photocheck.js.
 */
import { h, put, icon, stateSelect } from './util.js?v=2.7.5';
import { api, session } from './api.js?v=2.7.5';
import { modal } from './capture.js?v=2.7.5';
import { addressField } from './address.js?v=2.7.5';
import { segment, toJpeg, aiReady } from './aiclient.js?v=2.7.5';
import { traceMask } from './siteplan.js?v=2.7.5';
import { PLANTS } from './library.js?v=2.7.5';
import { parseFtIn, fmtFtIn, fmtArea } from './takeoff.js?v=2.7.5';
import { sectionHead, tip } from './explain.js?v=2.7.5';
import { frame, validateTrace, checkScale, shotPlan, STYLES, styleById, pickPlants, generatePlan, checkDesign, accuracy, area as polyArea, dist, centroid, inside } from './plangen.js?v=2.7.5';
import { readExif, analyze, checkPhoto, worst, compass } from './photocheck.js?v=2.7.5';

let W = null;
/** ctx: the hub context; tools: { editPlan(plan, prop, title) → Promise<plan|null> } */
export function initPlanWizard(ctx, tools) { W = { ctx, tools, s: null, go: null }; }
const toast = (m, ms) => W && W.ctx.toast(m, ms);
const AREAS = [['front', '🏡 Front yard'], ['back', '🌳 Back yard'], ['left', '⬅️ Left side yard'], ['right', '➡️ Right side yard']];
const AREA_NAME = Object.fromEntries(AREAS.map(([k, l]) => [k, l.replace(/^\S+\s/, '')]));
const ZONES = ['3a', '3b', '4a', '4b', '5a', '5b', '6a', '6b', '7a', '7b', '8a', '8b', '9a', '9b', '10a', '10b', '11a'];
const STEPS = [
	['who', 'Customer & property'], ['scope', 'What to plan'], ['base', 'Bird’s-eye base map'], ['trace', 'Trace the property'], ['scale', 'Check the scale'],
	['photos', 'Site photos'], ['site', 'Site details'], ['style', 'Style'], ['designs', 'Designs'], ['generate', 'Generate & review']
];
const card = (title, ...kids) => h('section', { class: 'ds-hub-card' }, title ? h('h2', null, title) : null, ...kids);
// a <label> forwards clicks to its first control, so groups of buttons (chips) get a plain <div>
const field = (label, el, hint) => h(el && el.querySelector && el.querySelector('button') ? 'div' : 'label', { class: 'ds-field' }, h('span', null, label), el, hint ? h('small', { class: 'ds-hint' }, hint) : null);
const todo = (...items) => h('ol', { class: 'ds-pw-todo' }, ...items.filter(Boolean).map((x) => h('li', null, x)));
const issueList = (list) => (list.length ? h('ul', { class: 'ds-pw-issues' }, ...list.map((x) => h('li', { class: 'ds-pw-' + x.level }, h('b', null, { bad: '✖ ', warn: '⚠️ ', ok: '✓ ', info: 'ℹ️ ' }[x.level] || '', x.text), x.fix ? h('small', null, ' ' + x.fix) : null))) : null);
const chipSet = (opts, val, onPick, multi = false) => {
	const box = h('div', { class: 'ds-chips', role: multi ? 'group' : 'radiogroup' });
	const draw = () => { box.innerHTML = ''; for (const [k, l] of opts) { const on = multi ? val().includes(k) : val() === k; box.append(h('button', { type: 'button', class: 'ds-chip' + (on ? ' on' : ''), 'aria-pressed': String(on), onclick: () => { onPick(k); draw(); } }, l)); } };
	draw();
	return box;
};

/* ================================================================ the list */

/** Contractor Hub → Landscape plans. */
export async function viewPlans(b, view, go) {
	W.go = go;
	if (view.wizard) return viewWizard(b, view, go);
	const q = h('input', { type: 'search', placeholder: 'Search customer or address', 'aria-label': 'Search plans' });
	const list = h('div', { class: 'ds-hub-list' }, h('span', { class: 'ds-spin' }));
	put(b, sectionHead('plans', h('button', { class: 'ds-btn', onclick: () => go({ v: 'plans', wizard: true }) }, icon('plus', 18), ' New landscape plan')),
		tip('plans', 'Start in the office (customer, bird’s-eye view, tracing), then finish on site (tape check and photos) — the wizard saves every step and tells you exactly what to do next.'),
		h('div', { class: 'ds-row' }, q), list);
	const load = async () => {
		try {
			const r = await api('crm/plans', { query: { q: q.value } });
			list.innerHTML = '';
			if (!r.items.length) return put(list, h('div', { class: 'ds-empty' }, h('p', null, q.value ? 'No match.' : 'No landscape plans yet.'), h('p', { class: 'ds-hint' }, 'A plan takes about 15 minutes in the office and 10 on site. You’ll get a measured 2D plan with plants, beds and hardscape — ready to quote.'), h('button', { class: 'ds-btn', onclick: () => go({ v: 'plans', wizard: true }) }, 'Start your first plan')));
			for (const p of r.items) {
				const local = loadLocal(p.id);
				const wz = p.wizard || (local ? { step: local.step, done: local.done } : null);
				const status = p.shapes && p.meta ? `✓ ${styleById(p.meta.style).name} plan${p.meta.accuracy ? ' · ±' + p.meta.accuracy + ' ft' : ''}` : p.shapes ? `✓ Plan (${p.shapes} shapes, drawn by hand)` : wz ? `In progress — step ${wz.step + 1} of ${STEPS.length}: ${STEPS[Math.min(wz.step, STEPS.length - 1)][1]}` : 'No plan yet';
				list.append(h('div', { class: 'ds-hub-row ds-pw-row' },
					h('span', { class: 'ds-grow' }, h('b', null, p.client || 'Customer'), h('small', null, `${p.address || 'No address'} · ${status}`)),
					h('span', { class: 'ds-row ds-wrap' },
						h('button', { class: 'ds-btn ds-sm' + (p.shapes ? ' ds-ghost' : ''), onclick: () => go({ v: 'plans', wizard: true, prop_id: p.id, client_id: p.client_id }) }, wz && !wz.done ? 'Resume' : p.shapes ? 'Re-run wizard' : 'Start'),
						p.shapes ? h('button', { class: 'ds-btn ds-sm', onclick: () => openEditor(p.id, p.client_id) }, '📐 Open plan') : null,
						p.shapes ? h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => go({ v: 'quote', seed: { client_id: p.client_id, prop_id: p.id } }) }, '🧾 Quote') : null)));
			}
		} catch (e) { list.innerHTML = ''; list.append(h('p', { class: 'ds-warn' }, e.message)); }
	};
	let t = 0;
	q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 250); });
	load();
}

async function openEditor(propId, clientId) {
	try {
		const c = await api('crm/client', { query: { id: clientId } });
		const prop = c.properties.find((x) => x.id === propId);
		if (!prop) return toast('That property is gone.');
		const np = await W.tools.editPlan(prop.plan, prop, c.name);
		if (np) { await api('crm/property', { body: { id: prop.id, client_id: c.id, plan: np } }); toast('Plan saved.'); }
	} catch (e) { toast(e.message); }
}

/* ================================================================ state */

const key = (id) => 'ds_planwiz_' + (id || 'new');
function loadLocal(id) { try { return JSON.parse(localStorage.getItem(key(id)) || 'null'); } catch (e) { return null; } }
function fresh() {
	return { v: 1, step: 0, done: false, prop_id: 0, client_id: 0, client: '', address: '', lat: 0, lng: 0, zip: '', state: '',
		areas: ['front', 'back'], purpose: 'renovate', hardscape: true, privacy: false,
		base: null, trace: { street: null, door: null, boundary: null, house: null, driveway: null, noDriveway: false, structures: [], trees: [] }, boundaryKnown: 'visible',
		check: null, photos: {}, extras: [], site: { zone: '', sun: {}, sill: 3, deer: false, native: false, drainage: 'none', irrigation: 'none', util811: false, maint: 'low', budget: '', hoa: '', keep: '', remove: '', wishes: '' },
		style: '', designs: {}, report: null, saved: 0 };
}
let saveT = 0;
function save(now = false) {
	const s = W.s;
	if (!s) return;
	s.saved = Date.now();
	try { localStorage.setItem(key(s.prop_id), JSON.stringify(s)); } catch (e) { /* full: server copy still saves */ }
	clearTimeout(saveT);
	const send = async () => {
		if (!s.prop_id || !s.client_id) return;
		try {
			const c = await api('crm/client', { query: { id: s.client_id } });
			const prop = c.properties.find((x) => x.id === s.prop_id);
			if (!prop) return;
			const light = { ...s, designs: Object.fromEntries(Object.entries(s.designs).map(([k, d]) => [k, d ? { title: d.title, kind: d.kind, n: (d.shapes || []).length } : null])) };
			await api('crm/property', { body: { id: s.prop_id, client_id: s.client_id, data: { ...(prop.data || {}), planwiz: light } } });
		} catch (e) { /* saved on this device; the next save retries */ }
	};
	if (now) return send();
	saveT = setTimeout(send, 4000);
}

/* ================================================================ wizard shell */

async function viewWizard(b, view, go) {
	// resume: the same plan in memory (coming back from the designer), on this device, or on the server
	let s = W.s && (!view.prop_id || W.s.prop_id === view.prop_id) && view.resume ? W.s : null;
	if (!s && view.prop_id) {
		s = loadLocal(view.prop_id);
		if (!s) {
			try {
				const c = await api('crm/client', { query: { id: view.client_id } });
				const prop = c.properties.find((x) => x.id === view.prop_id);
				const sv = prop && prop.data && prop.data.planwiz;
				s = sv && sv.v ? { ...fresh(), ...sv, designs: {} } : { ...fresh(), prop_id: view.prop_id, client_id: c.id, client: c.name, address: prop ? prop.address : '', lat: prop ? prop.lat : 0, lng: prop ? prop.lng : 0 };
			} catch (e) { s = null; }
		}
	}
	if (!s && !view.prop_id) s = { ...fresh(), ...(view.seed || {}) };
	if (!s) s = fresh();
	if (!view.resume) s.fromQuote = view.fromQuote || null;
	if (view.quoteDesign && !s.quoteDesign) s.quoteDesign = view.quoteDesign;
	W.s = s;
	const side = h('ol', { class: 'ds-pw-steps', 'aria-label': 'Steps' });
	const main = h('div', { class: 'ds-pw-main' });
	const bar = h('div', { class: 'ds-pw-bar' });
	put(b, h('div', { class: 'ds-row ds-wrap ds-pw-top' }, h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => { save(true); go({ v: 'plans' }); } }, '← All plans'), h('h2', { class: 'ds-grow' }, '📐 Landscape Plan wizard', s.client ? h('small', { class: 'ds-muted' }, ' · ' + s.client) : null), h('small', { class: 'ds-muted', 'aria-live': 'polite' }, 'Saved as you go')),
		h('div', { class: 'ds-pw' }, side, h('div', { class: 'ds-pw-col' }, main, bar)));
	// the floating Next bar steps aside while the picture is being traced, back after 10 s idle
	let idleT = 0;
	b.addEventListener('ds-busy', () => {
		bar.classList.add('away'); // only the bar that floats over the picture — nothing above it moves
		clearTimeout(idleT);
		idleT = setTimeout(() => { for (const el of b.querySelectorAll('.away')) el.classList.remove('away'); }, 10000);
	});
	const ctx = { s, main, bar, rerender: () => show(s.step), next: () => show(s.step + 1), back: () => show(s.step - 1), go };
	function show(i) {
		i = Math.max(0, Math.min(STEPS.length - 1, i));
		if (W.cleanup) { W.cleanup(); W.cleanup = null; }
		s.step = i;
		save();
		side.innerHTML = '';
		STEPS.forEach(([, label], k) => side.append(h('li', { class: k === i ? 'on' : k < i ? 'done' : '' }, h('button', { type: 'button', disabled: k > maxReach(s), onclick: () => show(k) }, h('b', null, k < i ? '✓' : String(k + 1)), h('span', null, label)))));
		main.innerHTML = '';
		bar.innerHTML = '';
		main.append(h('p', { class: 'ds-pw-of' }, `Step ${i + 1} of ${STEPS.length}`));
		STEP_FN[STEPS[i][0]](ctx);
		main.scrollIntoView({ block: 'start', behavior: 'smooth' });
	}
	ctx.show = show;
	show(view.step != null ? view.step : s.step || 0);
}
/** How far the side list lets you jump: up to the first step that isn't finished. */
function maxReach(s) {
	if (!s.prop_id) return 0;
	if (!s.areas.length) return 1;
	if (!s.base) return 2;
	if (s.base.kind !== 'grid' && validateTrace(s.trace, s.base).some((x) => x.level === 'bad')) return 3;
	return STEPS.length - 1;
}
/** Footer: Back, and Next (blocked with the reason while something must be fixed). */
function footer(ctx, problems = [], nextLabel = 'Next', onNext = null) {
	const blocking = problems.filter((p) => p.level === 'bad');
	const warns = problems.filter((p) => p.level === 'warn');
	const next = h('button', { class: 'ds-btn', disabled: blocking.length > 0, onclick: async () => {
		if (warns.length && !blocking.length && !confirm(`Before you go on:\n\n${warns.map((w) => '• ' + w.text).join('\n')}\n\nContinue anyway?`)) return;
		if (onNext) { next.disabled = true; const ok = await onNext(); next.disabled = false; if (ok === false) return; }
		ctx.next();
	} }, nextLabel + ' →');
	ctx.bar.innerHTML = '';
	put(ctx.bar, ctx.s.step > 0 ? h('button', { class: 'ds-btn ds-ghost', onclick: ctx.back }, '← Back') : h('span'),
		blocking.length ? h('small', { class: 'ds-pw-block' }, '✖ ' + blocking[0].text) : warns.length ? h('small', { class: 'ds-pw-warnline' }, `⚠️ ${warns.length} thing${warns.length > 1 ? 's' : ''} to check`) : h('small', { class: 'ds-pw-okline' }, '✓ Ready'),
		next);
}

/* ================================================================ 1. customer & property */

function stepWho(ctx) {
	const s = ctx.s;
	const q = h('input', { type: 'search', placeholder: 'Search your customers', 'aria-label': 'Search customers' });
	const results = h('div', { class: 'ds-hub-list ds-pw-pick' });
	const chosen = h('div');
	put(ctx.main, h('h3', null, 'Who is the plan for?'),
		todo('Pick the customer (or add a new one).', 'Pick the property address. It must be the full street address with the house number, town and state — the wizard uses it to find the property from above.'),
		card(null, h('div', { class: 'ds-row' }, q, h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => newCustomer(ctx) }, '+ New customer')), results), chosen);
	const drawChosen = async () => {
		chosen.innerHTML = '';
		if (!s.client_id) return footer(ctx, [{ level: 'bad', text: 'Choose a customer.' }]);
		let c;
		try { c = await api('crm/client', { query: { id: s.client_id } }); } catch (e) { return put(chosen, h('p', { class: 'ds-warn' }, e.message)); }
		const props = c.properties || [];
		const addr = h('input', { type: 'text', placeholder: '123 Main Street, Town, ST 12345', autocomplete: 'street-address' });
		const af = addressField(addr, { api: (W.ctx.cfg && W.ctx.cfg.api) || '/wp-json/dreamscaper/v1/', onPick: (it) => { addr.value = it.label; } });
		put(chosen, card('🏠 ' + c.name,
			props.length ? h('div', { class: 'ds-hub-list' }, ...props.map((p) => h('button', { class: 'ds-hub-row' + (p.id === s.prop_id ? ' on' : ''), onclick: () => pickProp(c, p) }, h('b', null, (p.id === s.prop_id ? '✓ ' : '') + (p.address || 'Property')), h('small', null, p.lat ? (p.plan && p.plan.shapes && p.plan.shapes.length ? 'Has a plan — the wizard will make a new one' : 'Found on the map') : '⚠️ Not found on the map yet')))) : h('p', { class: 'ds-muted' }, 'No property yet.'),
			h('details', { open: !props.length }, h('summary', null, '+ Add another property'), h('div', { class: 'ds-row' }, af, h('button', { class: 'ds-btn ds-sm', onclick: async (e) => {
				const problem = addressProblem(addr.value);
				if (problem) return toast(problem, 6000);
				e.currentTarget.disabled = true;
				try { const p = await api('crm/property', { body: { client_id: c.id, address: addr.value.trim() } }); pickProp(c, p); } catch (er) { toast(er.message); }
				e.currentTarget.disabled = false;
			} }, 'Add')))));
		const probs = [];
		if (!s.prop_id) probs.push({ level: 'bad', text: 'Choose the property.' });
		else {
			const p = props.find((x) => x.id === s.prop_id);
			const ap = p ? addressProblem(p.address) : 'Property missing.';
			if (ap) probs.push({ level: 'bad', text: ap });
			else if (p && !p.lat) probs.push({ level: 'bad', text: 'This address couldn’t be found on the map. Check the spelling, the house number and the town, then add it again.' });
		}
		put(chosen, issueList(probs));
		footer(ctx, probs);
	};
	const pickProp = (c, p) => {
		const same = s.prop_id === p.id;
		if (!same) {
			const prev = loadLocal(p.id);
			if (prev && prev.v && !prev.done && confirm('There’s a plan in progress for this property. Continue it? (Cancel starts over.)')) { Object.assign(s, prev); }
			else Object.assign(s, { ...fresh(), step: 0 });
		}
		Object.assign(s, { client_id: c.id, client: c.name, prop_id: p.id, address: p.address, lat: p.lat, lng: p.lng, zip: (/\b(\d{5})(?:-\d{4})?\b(?!.*\b\d{5}\b)/.exec(p.address) || [])[1] || c.zip || '', state: (/\b([A-Z]{2})\b\s*\d{5}/.exec(p.address) || [])[1] || c.state || '' });
		save();
		drawChosen();
	};
	const search = async () => {
		try {
			const r = await api('crm/clients', { query: { q: q.value } });
			results.innerHTML = '';
			for (const c of r.items.slice(0, 8)) results.append(h('button', { class: 'ds-hub-row' + (c.id === s.client_id ? ' on' : ''), onclick: () => { if (c.id !== s.client_id) { s.client_id = c.id; s.client = c.name; s.prop_id = 0; } save(); drawChosen(); search(); } }, h('b', null, c.name), h('small', null, [c.address, c.town].filter(Boolean).join(', ') || c.email || '')));
			if (!r.items.length) results.append(h('p', { class: 'ds-muted' }, 'No customers found — add a new one.'));
		} catch (e) { results.innerHTML = ''; results.append(h('p', { class: 'ds-warn' }, e.message)); }
	};
	let t = 0;
	q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(search, 250); });
	search();
	drawChosen();
}
/** Why an address can't be used, or '' if it looks complete. */
export function addressProblem(a) {
	const v = String(a || '').trim();
	if (!v) return 'Type the property address.';
	if (!/^\d+[a-z]?\s+\S+/i.test(v)) return 'The address needs the house number first (e.g. “123 Main Street”) — the wizard finds the property by its exact address.';
	if (v.split(',').length < 2 && !/\b\d{5}\b/.test(v)) return 'Add the town and state (e.g. “123 Main Street, Farmington, CT”).';
	return '';
}
function newCustomer(ctx) {
	const s = ctx.s;
	const name = h('input', { type: 'text', autocomplete: 'name' }), phone = h('input', { type: 'tel' }), email = h('input', { type: 'email' });
	const addr = h('input', { type: 'text', autocomplete: 'street-address', placeholder: '123 Main Street' }), town = h('input', { type: 'text' }), zip = h('input', { type: 'text', inputmode: 'numeric', maxlength: 10 });
	const st = stateSelect((session.region && session.region.state) || '', { 'aria-label': 'State' });
	const af = addressField(addr, { api: (W.ctx.cfg && W.ctx.cfg.api) || '/wp-json/dreamscaper/v1/', onPick: (it) => { const parts = it.label.split(',').map((x) => x.trim()); addr.value = parts[0] || it.label; if (parts[1]) town.value = parts[1]; const m = /([A-Z]{2})\s*(\d{5})?/.exec(parts[2] || ''); if (m) { st.value = m[1]; if (m[2]) zip.value = m[2]; } } });
	const save1 = h('button', { class: 'ds-btn ds-wide' }, 'Add customer');
	const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
	const m = modal(W.ctx.root, 'New customer', [field('Name', name), h('div', { class: 'ds-form-grid' }, field('Mobile', phone), field('Email', email)), field('Street address', af), h('div', { class: 'ds-form-3' }, field('Town', town), field('State', st), field('ZIP', zip)), save1], close);
	save1.onclick = async () => {
		if (name.value.trim().length < 2) return toast('Add the customer’s name.');
		const full = `${addr.value}, ${town.value}`;
		const problem = addressProblem(full);
		if (problem || !town.value.trim() || !st.value) return toast(problem || 'Add the town and state.', 6000);
		save1.disabled = true;
		try {
			const c = await api('crm/client', { body: { name: name.value, phone: phone.value, email: email.value, address: addr.value, town: town.value, state: st.value, zip: zip.value, stage: 'lead', source: 'other' } });
			m.remove();
			Object.assign(s, { client_id: c.id, client: c.name, prop_id: 0 });
			const p = (c.properties || [])[0];
			if (p) Object.assign(s, { prop_id: p.id, address: p.address, lat: p.lat, lng: p.lng, zip: zip.value, state: st.value });
			save();
			ctx.rerender();
		} catch (e) { toast(e.message); save1.disabled = false; }
	};
}

/* ================================================================ 2. scope */

function stepScope(ctx) {
	const s = ctx.s;
	const probs = () => (s.areas.length ? [] : [{ level: 'bad', text: 'Pick at least one area.' }]);
	const draw = () => {
		ctx.main.querySelector('.ds-pw-scope')?.remove();
		const box = h('div', { class: 'ds-pw-scope' },
			card('Which parts of the property?', chipSet(AREAS, () => s.areas, (k) => { s.areas = s.areas.includes(k) ? s.areas.filter((x) => x !== k) : [...s.areas, k]; save(); footer(ctx, probs()); }, true),
				h('p', { class: 'ds-hint' }, 'The whole property is always measured; these are the areas the plan designs. Each area gets its own guided photos.')),
			card('What kind of job?', chipSet([['new', '🌱 New landscape'], ['renovate', '🔁 Renovation'], ['refresh', '✨ Refresh (plants & mulch)']], () => s.purpose, (k) => { s.purpose = k; if (k === 'refresh') s.hardscape = false; save(); draw(); })),
			card('Include', chipSet([['hardscape', '🧱 Walkway & patio'], ['privacy', '🌲 Privacy screen at the back']], () => [s.hardscape ? 'hardscape' : '', s.privacy ? 'privacy' : ''], (k) => { s[k] = !s[k]; save(); }, true),
				h('p', { class: 'ds-hint' }, 'Planting beds and plants are always included.')));
		ctx.main.append(box);
		footer(ctx, probs());
	};
	put(ctx.main, h('h3', null, 'What should the plan cover?'), todo('Tap every area the customer wants designed.', 'Choose the kind of job and what to include.'));
	draw();
}

/* ================================================================ 3. bird's-eye base map */

function stepBase(ctx) {
	const s = ctx.s;
	const cfg = W.ctx.cfg || {};
	const st = { lat: s.base && s.base.where ? s.base.where.lat : s.lat, lng: s.base && s.base.where ? s.base.where.lng : s.lng, span: (s.base && s.base.span) || 90, j: null, src: '' };
	const img = h('img', { alt: 'Bird’s-eye view of the property', class: 'ds-pw-aerial' });
	const status = h('p', { class: 'ds-hint', 'aria-live': 'polite' });
	const view = h('div', { class: 'ds-aerial-view ds-pw-aerialbox' }, img, h('span', { class: 'ds-cross' }));
	const pad = h('div', { class: 'ds-pad' }, ...[['n', '▲', 'Move north'], ['w', '◀', 'Move west'], ['e', '▶', 'Move east'], ['s', '▼', 'Move south'], ['in', '＋', 'Closer'], ['out', '－', 'Show more']].map(([m, t, l]) => h('button', { type: 'button', 'aria-label': l, title: l, onclick: () => move(m) }, t)));
	const scaleNote = h('p', { class: 'ds-hint' });
	const res = h('div');
	put(ctx.main, h('h3', null, 'Get the property from above'),
		todo('The bird’s-eye view loads at the address. Check the crosshair is on the right house.', 'Use ＋ / － and the arrows until the WHOLE property fits inside the picture with a little space around it (you’ll trace the property line next).', 'Tap “Use this view”.'),
		card(null, view, h('div', { class: 'ds-row ds-wrap' }, pad, scaleNote), status,
			h('div', { class: 'ds-row ds-wrap' }, h('button', { class: 'ds-btn', onclick: (e) => useIt(e.currentTarget) }, '✓ Use this view'))),
		card('No bird’s-eye view? Other ways to measure',
			h('div', { class: 'ds-row ds-wrap' },
				h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => survey() }, '📄 Upload a survey / plot plan'),
				h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => { s.base = { kind: 'grid' }; save(); ctx.next(); } }, '📏 I’ll measure everything with a tape')),
			h('p', { class: 'ds-hint' }, 'A survey (from the homeowner’s closing papers or the town hall) gives the most accurate property lines. With a tape only, you’ll type the lot and house sizes.')), res);
	view.hidden = true;
	const load = async (body) => {
		status.textContent = 'Loading the bird’s-eye view…';
		try {
			const r = await fetch((cfg.api || '/wp-json/dreamscaper/v1/') + 'aerial', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
			const j = await r.json();
			if (!r.ok) throw new Error(j.message || 'Could not load imagery.');
			img.src = j.image;
			await img.decode();
			// a blank picture means no imagery here (e.g. just over the Connecticut line): try the nationwide service
			const m = analyze(img, img.naturalWidth, img.naturalHeight);
			if (m.sd < 4 && !body.src) return load({ ...body, src: 'national' });
			Object.assign(st, { lat: j.lat, lng: j.lng, span: j.span, j, src: body.src || '' });
			view.hidden = false;
			const ppf = j.ppf || img.naturalWidth / (j.span * 3.28084);
			scaleNote.textContent = `Showing about ${Math.round(j.span * 3.28084)} ft across · ${j.source || ''}`;
			status.textContent = m.sd < 4 ? '⚠️ This picture looks empty — there may be no imagery here. Use a survey or tape instead.' : (j.res > 1 ? `Imagery detail: about ${j.res} ft per pixel — fine for the property, house and driveway. You’ll confirm the scale with a tape, and small things are drawn in the editor.` : 'Sharp 3-inch imagery — edges can be traced to within about a foot.');
			st.ppf = ppf;
		} catch (e) { status.textContent = e.message; }
	};
	const move = (k) => {
		if (!st.j) return;
		const d = st.span * 0.3;
		let { lat, lng, span } = st;
		if (k === 'n') lat += d / 111320;
		if (k === 's') lat -= d / 111320;
		if (k === 'e') lng += d / (111320 * Math.cos((lat * Math.PI) / 180));
		if (k === 'w') lng -= d / (111320 * Math.cos((lat * Math.PI) / 180));
		if (k === 'in') span = Math.max(30, span * 0.75);
		if (k === 'out') span = Math.min(400, span / 0.75);
		load({ lat, lng, span, src: st.src });
	};
	const useIt = async (btn) => {
		if (!st.j) return toast('Wait for the bird’s-eye view to load.');
		btn.disabled = true;
		try {
			const p = await api('crm/property', { body: { id: s.prop_id, client_id: s.client_id, aerial: st.j.image, ppf: st.ppf } });
			const changed = !s.base || s.base.url !== p.aerial;
			s.base = { kind: 'aerial', url: p.aerial, W: img.naturalWidth, H: img.naturalHeight, ppf: st.ppf, span: st.span, res: st.j.res || 0.25, source: st.j.source || '', where: { lat: st.lat, lng: st.lng } };
			if (changed && s.trace.boundary) { s.trace = fresh().trace; s.check = null; toast('New view — trace the property again on it.'); }
			W.img = img;
			save(true);
			ctx.next();
		} catch (e) { toast(e.message); }
		btn.disabled = false;
	};
	const survey = async () => {
		const f = await pickPhotoFile(false);
		if (!f) return;
		const im = await fileImage(f.file);
		const url = toJpeg(im, 2400, 0.9);
		try {
			const p = await api('crm/property', { body: { id: s.prop_id, client_id: s.client_id, aerial: url, ppf: 0 } });
			const kk = Math.min(1, 2400 / Math.max(im.naturalWidth, im.naturalHeight));
			s.base = { kind: 'survey', url: p.aerial, W: Math.round(im.naturalWidth * kk), H: Math.round(im.naturalHeight * kk), ppf: 0, res: 0.5, source: 'Survey / plot plan' };
			s.trace = fresh().trace;
			s.boundaryKnown = 'survey';
			save(true);
			surveyScale(ctx);
		} catch (e) { toast(e.message); }
	};
	if (s.base && s.base.kind === 'aerial') put(res, h('p', { class: 'ds-pw-okline' }, '✓ A bird’s-eye view is already chosen. Load a new one only if the property doesn’t fit.'), h('button', { class: 'ds-btn ds-sm', onclick: () => ctx.next() }, 'Keep it and continue →'));
	if (s.base && s.base.kind === 'survey') put(res, h('p', { class: 'ds-pw-okline' }, `✓ Survey uploaded${s.base.ppf ? ' and scaled' : ' — set its scale'}.`), h('button', { class: 'ds-btn ds-sm', onclick: () => (s.base.ppf ? ctx.next() : surveyScale(ctx)) }, s.base.ppf ? 'Continue →' : 'Set the scale →'));
	if (st.lat) load({ lat: st.lat, lng: st.lng, span: st.span });
	else if (s.address) load({ address: s.address, span: st.span });
	footer(ctx, s.base && (s.base.kind !== 'survey' || s.base.ppf) ? [] : [{ level: 'bad', text: 'Choose the bird’s-eye view (or a survey / tape).' }]);
}
/** Survey: draw along a dimensioned line and type its length — that sets the scale. */
async function surveyScale(ctx) {
	const s = ctx.s;
	const im = await loadImg(s.base.url);
	const box = h('div', { class: 'ds-pw-tracer' });
	const len = h('input', { type: 'text', placeholder: 'e.g. 100.00 or 85\' 6"', inputmode: 'decimal' });
	const msg = h('p', { class: 'ds-hint' });
	const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
	const ok = h('button', { class: 'ds-btn ds-wide' }, 'Set the scale');
	const m = modal(W.ctx.root, 'Set the survey’s scale', [todo('Find a property line with its length written on the survey (e.g. “100.00′”).', 'Tap one end of that line, then the other end.', 'Type the length written on the survey.'), box, field('Length on the survey (feet)', len), msg, ok], close, 'ds-modal-wide');
	const line = [];
	const tr = tracer(box, { img: im, W: im.naturalWidth, H: im.naturalHeight, ppf: 1, trace: { line }, active: { key: 'line', type: 'line' }, onChange: () => { msg.textContent = line.length === 2 ? `Line drawn (${Math.round(dist(line[0], line[1]))} px). Now type its length.` : 'Tap both ends of the line.'; } });
	ok.onclick = () => {
		const ft = parseFtIn(len.value);
		if (line.length < 2) return toast('Tap both ends of the line first.');
		if (!(ft > 5)) return toast('Type the length in feet, as written on the survey.');
		const px = dist(line[0], line[1]) * (s.base.W / im.naturalWidth);
		if (px < 60) return toast('That line is too short on the picture — choose a longer line for an accurate scale.', 6000);
		s.base.ppf = px / ft;
		s.check = { level: 'ok', text: `Scaled from the survey (${ft} ft line).`, k: 1, survey: true };
		save(true);
		tr.destroy();
		m.remove();
		ctx.show(3);
	};
}

/* ================================================================ 4. trace */

const TRACE_PARTS = [
	{ key: 'street', type: 'point', title: 'Tap the street', how: 'Tap the street (or sidewalk) right in front of the house. This tells the wizard which side is the front.', need: true },
	{ key: 'boundary', type: 'poly', title: 'Trace the property line', how: 'Tap each corner of the property in order, all the way around, then tap the first corner again to close it.', need: true, ai: false },
	{ key: 'house', type: 'poly', title: 'Trace the house', how: 'Tap each corner of the house ROOF in order and close the shape. Include attached garages and porches with roofs.', need: true, ai: 'house roof' },
	{ key: 'door', type: 'point', title: 'Tap the front door', how: 'Tap where the front door or front steps meet the house. The front walk will start here.', need: false },
	{ key: 'driveway', type: 'poly', title: 'Trace the driveway', how: 'Tap the corners of the paved driveway, out to the street, and close it.', need: false, ai: 'driveway pavement' },
	{ key: 'structures', type: 'poly', multi: true, title: 'Other structures (optional)', how: 'Trace sheds, detached garages, pools and decks — one at a time. Skip if there are none.', need: false, ai: 'shed or detached garage roof' },
	{ key: 'trees', type: 'points', title: 'Trees to keep (optional)', how: 'Tap the trunk of every tree that stays. New plants are kept clear of them.', need: false }
];
async function stepTrace(ctx) {
	const s = ctx.s;
	if (!s.base) return ctx.show(2);
	if (s.base.kind === 'grid') return gridTrace(ctx);
	const t = s.trace;
	let part = Math.max(0, TRACE_PARTS.findIndex((p) => p.need && !(p.type === 'poly' ? t[p.key] && t[p.key].length >= 3 : t[p.key])));
	if (part < 0) part = 0;
	const im = W.img && W.img.src && s.base.url && W.img.dataset.url === s.base.url ? W.img : await loadImg(s.base.url).catch(() => null);
	if (!im) { put(ctx.main, h('p', { class: 'ds-warn' }, 'The bird’s-eye picture couldn’t be loaded. Go back one step and choose it again.')); return footer(ctx, [{ level: 'bad', text: 'Picture missing.' }]); }
	W.img = im; im.dataset.url = s.base.url;
	const box = h('div', { class: 'ds-pw-tracer' });
	const head = h('div', { class: 'ds-pw-part' });
	const parts = h('div', { class: 'ds-chips ds-pw-parts' });
	const issuesBox = h('div');
	put(ctx.main, h('h3', null, 'Trace the property'),
		todo('Follow the highlighted step below — each one says exactly what to tap.', 'Zoom with the mouse wheel, pinch, or ＋/－. Drag to move. Drag a corner dot to fix it. “Undo” removes the last tap.'),
		parts, head, box, issuesBox);
	const tr = tracer(box, { img: im, W: s.base.W, H: s.base.H, ppf: s.base.ppf, trace: t, active: TRACE_PARTS[part], onChange: () => { save(); refresh(); } });
	W.cleanup = () => tr.destroy();
	const refresh = () => {
		parts.innerHTML = '';
		TRACE_PARTS.forEach((p, i) => {
			const done = p.type === 'poly' ? (p.multi ? t[p.key].length > 0 : t[p.key] && t[p.key].length >= 3) : p.type === 'points' ? t[p.key].length > 0 : !!t[p.key];
			const skipped = p.key === 'driveway' && t.noDriveway;
			parts.append(h('button', { type: 'button', class: 'ds-chip' + (i === part ? ' on' : ''), onclick: () => { part = i; tr.setActive(TRACE_PARTS[i]); refresh(); } }, (done || skipped ? '✓ ' : p.need ? '• ' : '') + p.title.replace(' (optional)', '')));
		});
		const P = TRACE_PARTS[part];
		head.innerHTML = '';
		put(head, h('div', { class: 'ds-pw-parthead' }, h('b', null, `${part + 1}. ${P.title}`), h('p', null, P.how),
			P.key === 'boundary' ? h('div', null, h('p', { class: 'ds-hint' }, 'Where do the property lines come from?'), chipSet([['survey', '📄 Survey / town GIS map'], ['visible', '🧱 Fences, hedges, curbs'], ['approx', '🤷 My best guess']], () => s.boundaryKnown, (k) => { s.boundaryKnown = k; save(); }),
				h('p', { class: 'ds-hint' }, 'Most towns have a free online parcel map: ', h('a', { href: 'https://www.google.com/search?q=' + encodeURIComponent(townOf(s.address) + ' GIS parcel map'), target: '_blank', rel: 'noopener' }, 'search for it'), ' and copy the corners. Fences are often not on the line.')) : null,
			P.key === 'house' ? h('p', { class: 'ds-hint' }, 'From above you see the roof, which overhangs the walls by about 1–2 ft. That’s fine — the wizard keeps beds outside the roof edge, where rain falls.') : null),
			h('div', { class: 'ds-row ds-wrap' },
				h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => tr.undo() }, '↶ Undo'),
				h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => { if (confirm('Clear this part and trace it again?')) { tr.clearActive(); } } }, 'Clear'),
				P.ai && aiReady() ? h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: (e) => aiFind(e.currentTarget, P) }, icon('sparkle', 16), ' Find it with AI') : null,
				P.key === 'driveway' ? h('label', { class: 'ds-check' }, h('input', { type: 'checkbox', checked: !!t.noDriveway, onchange: (e) => { t.noDriveway = e.target.checked; if (t.noDriveway) t.driveway = null; save(); tr.redraw(); refresh(); } }), ' No driveway') : null,
				part < TRACE_PARTS.length - 1 ? h('button', { class: 'ds-btn ds-sm', onclick: () => { part++; tr.setActive(TRACE_PARTS[part]); refresh(); } }, 'Next part →') : null));
		const probs = validateTrace(t, s.base);
		if (!t.door) probs.push({ level: 'warn', text: 'The front door isn’t marked.', fix: 'Without it the wizard can’t draw a front walk.' });
		if (!t.driveway && !t.noDriveway) probs.push({ level: 'warn', text: 'The driveway isn’t traced.', fix: 'Trace it, or tick “No driveway”, so no beds are drawn on it.' });
		issuesBox.innerHTML = '';
		const lotA = t.boundary && t.boundary.length >= 3 ? polyArea(t.boundary) : 0, houseA = t.house && t.house.length >= 3 ? polyArea(t.house) : 0;
		put(issuesBox, lotA || houseA ? h('p', { class: 'ds-hint' }, [lotA ? `Property ≈ ${fmtArea(lotA)} (${(lotA / 43560).toFixed(2)} acres)` : '', houseA ? `house roof ≈ ${fmtArea(houseA)}` : ''].filter(Boolean).join(' · ')) : null, issueList(probs));
		footer(ctx, probs);
	};
	const aiFind = async (btn, P) => {
		btn.disabled = true;
		const old = btn.textContent;
		btn.textContent = ' Looking…';
		try {
			const Wd = im.naturalWidth, Hd = im.naturalHeight;
			const mask = await segment(im, P.ai, Wd, Hd);
			const polys = mask ? traceMask(mask, Wd, Hd, Math.max(1, Math.round(1.5 * s.base.ppf * Wd / s.base.W)) ** 2 * 20) : [];
			const k = s.base.W / Wd / s.base.ppf; // image px → feet
			const cand = polys.map((p) => p.map((q) => [q[0] * k, q[1] * k])).filter((p) => polyArea(p) > 80);
			if (!cand.length) throw new Error('AI couldn’t find it — trace it by tapping the corners.');
			const center = P.key === 'house' ? [s.base.W / s.base.ppf / 2, s.base.H / s.base.ppf / 2] : t.house ? centroid(t.house) : [s.base.W / s.base.ppf / 2, s.base.H / s.base.ppf / 2];
			cand.sort((a, b) => (inside(center, b) ? 1 : 0) - (inside(center, a) ? 1 : 0) || dist(centroid(a), center) - dist(centroid(b), center));
			const best = simplify(cand[0], 1.2);
			if (P.multi) t[P.key].push(best); else t[P.key] = best;
			save(); tr.redraw(); refresh();
			toast('Found it. Check the corners — drag any dot that’s off.', 5000);
		} catch (e) { toast(e.message || 'AI didn’t work this time.', 5000); }
		btn.disabled = false;
		btn.textContent = old;
	};
	refresh();
}
const townOf = (a) => (String(a).split(',')[1] || '').trim() + ' ' + ((/\b([A-Z]{2})\b/.exec(a) || [])[1] || '');
/** Douglas–Peucker in feet. */
function simplify(pts, tol) {
	if (pts.length < 5) return pts;
	const keep = new Array(pts.length).fill(false);
	keep[0] = keep[pts.length - 1] = true;
	const seg = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy; const tt = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0; return Math.hypot(p[0] - a[0] - tt * dx, p[1] - a[1] - tt * dy); };
	const rec = (i, j) => { let md = 0, mi = -1; for (let k = i + 1; k < j; k++) { const d = seg(pts[k], pts[i], pts[j]); if (d > md) { md = d; mi = k; } } if (md > tol) { keep[mi] = true; rec(i, mi); rec(mi, j); } };
	rec(0, pts.length - 1);
	return pts.filter((_, i) => keep[i]);
}
/** No imagery: type the lot and house sizes; the wizard draws the rectangles (street at the bottom). */
function gridTrace(ctx) {
	const s = ctx.s, g = s.grid || (s.grid = { lotW: '', lotD: '', houseW: '', houseD: '', setback: '', left: '', drive: 'right', driveW: '12' });
	const inp = (k, ph) => h('input', { type: 'text', inputmode: 'decimal', placeholder: ph, value: g[k], oninput: (e) => { g[k] = e.target.value; build(); } });
	const issues = h('div');
	put(ctx.main, h('h3', null, 'Type the property’s measurements'),
		todo('Measure the front of the lot (property line along the street) and how deep it is.', 'Measure the house: width across the front and depth front-to-back.', 'Measure from the front property line to the front of the house, and from the left property line to the house.'),
		card(null, h('div', { class: 'ds-form-grid' }, field('Lot width (along the street)', inp('lotW', 'e.g. 100')), field('Lot depth', inp('lotD', 'e.g. 150')), field('House width', inp('houseW', 'e.g. 48')), field('House depth', inp('houseD', 'e.g. 30')), field('Front of lot → house', inp('setback', 'e.g. 40')), field('Left line → house', inp('left', 'e.g. 25'))),
			field('Driveway side', chipSet([['left', 'Left'], ['right', 'Right'], ['none', 'None']], () => g.drive, (k) => { g.drive = k; build(); })), field('Driveway width', inp('driveW', '12')),
			h('p', { class: 'ds-hint' }, 'Feet, or feet and inches like 32\' 6". Square lots and houses only — for anything else, use a survey or the bird’s-eye view.')), issues);
	const build = () => {
		const n = Object.fromEntries(Object.entries(g).map(([k, v]) => [k, parseFtIn(String(v))]));
		const probs = [];
		for (const [k, l] of [['lotW', 'lot width'], ['lotD', 'lot depth'], ['houseW', 'house width'], ['houseD', 'house depth'], ['setback', 'front distance'], ['left', 'left distance']]) if (!(n[k] > 0)) probs.push({ level: 'bad', text: `Type the ${l}.` });
		if (!probs.length) {
			if (n.left + n.houseW > n.lotW) probs.push({ level: 'bad', text: 'The house doesn’t fit across the lot (left distance + house width is more than the lot width).', fix: 'Check the measurements.' });
			if (n.setback + n.houseD > n.lotD) probs.push({ level: 'bad', text: 'The house doesn’t fit in the lot’s depth.', fix: 'Check the lot depth and front distance.' });
		}
		if (!probs.length) {
			const P = 20; // margin; street at the bottom (south)
			const y0 = P, y1 = P + n.lotD, x0 = P, x1 = P + n.lotW;
			const hx = x0 + n.left, hy = y1 - n.setback - n.houseD;
			s.trace = { ...s.trace, boundary: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], house: [[hx, hy], [hx + n.houseW, hy], [hx + n.houseW, hy + n.houseD], [hx, hy + n.houseD]], street: [(x0 + x1) / 2, y1 + 10], door: [hx + n.houseW / 2, hy + n.houseD] };
			const dw = n.driveW > 0 ? n.driveW : 12;
			if (g.drive === 'right' && x1 - (hx + n.houseW) > dw) s.trace.driveway = [[hx + n.houseW + 1, hy + n.houseD * 0.4], [hx + n.houseW + 1 + dw, hy + n.houseD * 0.4], [hx + n.houseW + 1 + dw, y1], [hx + n.houseW + 1, y1]];
			else if (g.drive === 'left' && hx - x0 > dw) s.trace.driveway = [[hx - 1 - dw, hy + n.houseD * 0.4], [hx - 1, hy + n.houseD * 0.4], [hx - 1, y1], [hx - 1 - dw, y1]];
			else { s.trace.driveway = null; s.trace.noDriveway = g.drive === 'none'; }
			s.base = { kind: 'grid', W: (n.lotW + 2 * P) * 4, H: (n.lotD + 2 * P + 20) * 4, ppf: 4, res: 0.5, source: 'Tape measurements' };
			s.check = { level: 'ok', text: 'Measured with a tape.', k: 1, tape: true };
			s.boundaryKnown = s.boundaryKnown || 'approx';
		}
		save();
		issues.innerHTML = '';
		put(issues, issueList(probs));
		footer(ctx, probs, 'Next', () => { ctx.show(5); return false; });
	};
	build();
}

/* ================================================================ 5. scale check */

const REFS = [['drive_w', 'Driveway width (at the street)'], ['walk_w', 'Front walk / sidewalk width'], ['patio', 'An edge of a patio or deck'], ['fence', 'A straight fence run'], ['drive_l', 'Driveway length'], ['other', 'Something else flat on the ground']];
async function stepScale(ctx) {
	const s = ctx.s;
	if (!s.base) return ctx.show(2);
	if (s.base.kind === 'grid') return ctx.show(5);
	if (!s.check || !s.check.line) s.check = { ...(s.check || {}), what: (s.check && s.check.what) || 'drive_w', line: [], tape: '' };
	const c = s.check;
	const im = await loadImg(s.base.url).catch(() => null);
	const box = h('div', { class: 'ds-pw-tracer' });
	const tape = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'e.g. 11\' 8" or 11.7', value: c.tape || '' });
	const out = h('div', { 'aria-live': 'polite' });
	put(ctx.main, h('h3', null, 'Check the scale with one tape measurement'),
		todo('Pick something FLAT on the ground you can measure on site — the driveway width at the street is ideal.', 'On the picture, tap one edge of it, then the other edge.', 'Measure the same thing with a tape (or measuring wheel) and type it in.'),
		h('div', { class: 'ds-explain' }, h('p', null, '📏 ', h('b', null, 'Why: '), 'aerial pictures are very close to scale, but one real measurement proves it and corrects the whole plan. Don’t use the house — its roof overhangs, so it looks bigger from above.')),
		card(null, field('What did you measure?', chipSet(REFS, () => c.what, (k) => { c.what = k; save(); })), box, field('Tape measurement', tape, s.check && s.check.survey ? 'Survey plans: measure the house width on site and draw along the house wall.' : 'At least 8 ft. Feet and inches are fine.')), out,
		h('button', { class: 'ds-link', onclick: () => { if (confirm('Skip the tape check? The plan will use the picture’s scale only and be marked less accurate.')) { s.check = { ...c, skipped: true, level: 'warn', text: 'Scale not checked with a tape.' }; save(); ctx.next(); } } }, 'I can’t measure on site right now — skip (less accurate)'));
	const tr = im ? tracer(box, { img: im, W: s.base.W, H: s.base.H, ppf: s.base.ppf, trace: { ...s.trace, line: c.line }, active: { key: 'line', type: 'line' }, onChange: () => { c.line = tr.data().line; evaluate(); } }) : null;
	W.cleanup = () => tr && tr.destroy();
	const evaluate = () => {
		c.tape = tape.value;
		const planFt = c.line && c.line.length === 2 ? dist(c.line[0], c.line[1]) : 0;
		const tapeFt = parseFtIn(tape.value);
		const r = planFt && tapeFt ? checkScale(planFt, tapeFt, s.base.res) : null;
		out.innerHTML = '';
		if (r) { Object.assign(c, { planFt, tapeFt, k: r.level === 'bad' ? 1 : r.k, level: r.level, text: r.text, skipped: false }); put(out, issueList([{ level: r.level, text: `Picture: ${fmtFtIn(planFt)} · Tape: ${fmtFtIn(tapeFt)}. ${r.text}`, fix: r.level === 'bad' ? 'Check that both measure the same thing, edge to edge. Re-draw the line, or measure again.' : '' }])); }
		else put(out, h('p', { class: 'ds-hint' }, planFt ? `On the picture: ${fmtFtIn(planFt)}. Now type the tape measurement.` : 'Tap both ends on the picture.'));
		save();
		if (!r && c.survey) return footer(ctx, [{ level: 'warn', text: 'Optional for surveys: check one length (like the house width) with a tape.' }]);
		footer(ctx, r ? (r.level === 'bad' ? [{ level: 'bad', text: 'The tape and the picture don’t agree.' }] : []) : [{ level: 'bad', text: planFt ? 'Type the tape measurement.' : 'Draw the line on the picture.' }]);
	};
	tape.addEventListener('input', evaluate);
	evaluate();
}

/* ================================================================ 6. photos */

const TIPS = ['Hold the phone sideways, at chest height, and level (not tilted up or down).', 'Use the normal 1× lens — not 0.5× ultra-wide.', 'Daylight; keep the sun behind you or to the side.', 'Move cars, bins and people out of the shot if you can.', 'Turn off Portrait mode and filters.'];
function stepPhotos(ctx) {
	const s = ctx.s;
	if (!s.trace.house || !s.trace.street || !s.trace.boundary) return ctx.show(3);
	const shots = shotPlan(s.trace, s.areas);
	const list = h('div', { class: 'ds-pw-shots' });
	put(ctx.main, h('h3', null, 'Take the site photos'),
		todo(`${shots.length} photos, one per spot. Each card shows where to stand (📷) and which way to face (arrow).`, 'Tap “Take photo” and follow the card. The photo is checked right away — retake it if the wizard says so.', 'Can’t reach a spot (fence, dog, neighbor’s yard)? Tap “Can’t get this one” and say why.'),
		h('div', { class: 'ds-explain' }, h('p', null, '📸 ', h('b', null, 'Why photos: '), 'the measurements come from above; photos show what can’t be seen from above — windows, steps, spigots, downspouts, utilities, slopes and what’s growing now. They’re also the start of a Dreamscape for the customer.'), h('ul', null, ...TIPS.map((x) => h('li', null, x)))),
		list,
		card('Close-ups (optional)', h('p', { class: 'ds-hint' }, 'Problem spots: wet areas, slopes, erosion, meters and utilities, trees, anything the plan should note.'), h('div', { class: 'ds-pw-extras' }, ...(s.extras || []).map((x) => h('figure', null, h('img', { src: x.url, alt: x.note || 'Close-up' }), h('figcaption', null, x.note || '')))),
			h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => addExtra(ctx) }, icon('camera', 16), ' Add a close-up')));
	const render = () => {
		list.innerHTML = '';
		for (const sh of shots) list.append(shotCard(ctx, sh, shots, render));
		const missing = shots.filter((sh) => !s.photos[sh.id] || (!s.photos[sh.id].url && !s.photos[sh.id].skipped));
		const forced = shots.filter((sh) => s.photos[sh.id] && s.photos[sh.id].forced);
		const probs = [];
		if (missing.length) probs.push({ level: 'bad', text: `${missing.length} photo${missing.length > 1 ? 's' : ''} to go: ${missing.map((m) => m.label).join(', ')}.` });
		if (forced.length) probs.push({ level: 'warn', text: `${forced.length} photo${forced.length > 1 ? 's were' : ' was'} kept despite a problem.` });
		const skipped = shots.filter((sh) => s.photos[sh.id] && s.photos[sh.id].skipped);
		if (skipped.length) probs.push({ level: 'warn', text: `${skipped.length} angle${skipped.length > 1 ? 's' : ''} skipped — the plan will note it.` });
		footer(ctx, probs);
	};
	render();
}
function shotCard(ctx, sh, shots, rerender) {
	const s = ctx.s, rec = s.photos[sh.id];
	const results = rec && rec.results ? rec.results : [];
	const lvl = rec ? (rec.skipped ? 'warn' : rec.forced ? 'warn' : worst(results)) : '';
	const diagram = shotDiagram(s, sh);
	const take = async (cam) => {
		const f = await pickPhotoFile(cam);
		if (!f) return;
		await acceptPhoto(ctx, sh, f.file, shots);
		rerender();
	};
	return h('section', { class: 'ds-hub-card ds-pw-shot' + (lvl ? ' ' + lvl : '') },
		h('div', { class: 'ds-pw-shot-head' }, h('b', null, (rec && rec.url && lvl === 'ok' ? '✓ ' : rec && rec.skipped ? '⏭️ ' : '') + sh.label), h('small', { class: 'ds-muted' }, `face ${compass(sh.heading)}`)),
		h('div', { class: 'ds-pw-shot-body' }, diagram, rec && rec.url ? h('img', { class: 'ds-pw-thumb', src: rec.url, alt: sh.label }) : null),
		h('p', null, sh.how),
		rec && rec.skipped ? h('p', { class: 'ds-hint' }, `Skipped: ${rec.reason}`) : null,
		issueList(results.filter((r) => r.level !== 'ok')),
		rec && rec.ai ? h('p', { class: 'ds-hint' }, '🤖 ' + rec.ai) : null,
		h('div', { class: 'ds-row ds-wrap' },
			h('button', { class: 'ds-btn ds-sm', onclick: () => take(true) }, icon('camera', 16), rec && rec.url ? ' Retake' : ' Take photo'),
			h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => take(false) }, icon('upload', 16), ' Choose a photo'),
			!rec || !rec.url ? h('button', { class: 'ds-link', onclick: () => {
				const why = prompt('Why can’t you take this one? (e.g. locked gate, dog, neighbor’s yard, not safe)');
				if (!why) return;
				s.photos[sh.id] = { skipped: true, reason: why.slice(0, 120) };
				save(); rerender();
			} }, 'Can’t get this one') : null));
}
/** A small map: the traced lot and house, where to stand and which way to face. */
function shotDiagram(s, sh) {
	const c = h('canvas', { class: 'ds-pw-diagram', width: 220, height: 160, role: 'img', 'aria-label': `Stand at the camera, face ${compass(sh.heading)}` });
	const pts = [...s.trace.boundary, sh.pos];
	const x0 = Math.min(...pts.map((p) => p[0])) - 8, x1 = Math.max(...pts.map((p) => p[0])) + 8, y0 = Math.min(...pts.map((p) => p[1])) - 8, y1 = Math.max(...pts.map((p) => p[1])) + 8;
	const k = Math.min(220 / (x1 - x0), 160 / (y1 - y0)), ox = (220 - (x1 - x0) * k) / 2, oy = (160 - (y1 - y0) * k) / 2;
	const P = (p) => [ox + (p[0] - x0) * k, oy + (p[1] - y0) * k];
	const x = c.getContext('2d');
	x.fillStyle = '#f3f6f1'; x.fillRect(0, 0, 220, 160);
	const poly = (ps, fill, stroke, dash) => { x.beginPath(); ps.forEach((p, i) => { const q = P(p); i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1]); }); x.closePath(); if (fill) { x.fillStyle = fill; x.fill(); } x.setLineDash(dash || []); x.strokeStyle = stroke; x.lineWidth = 1.5; x.stroke(); x.setLineDash([]); };
	poly(s.trace.boundary, '#dfeedd', '#d33', [5, 3]);
	if (s.trace.driveway) poly(s.trace.driveway, '#cfcfcf', '#999');
	poly(s.trace.house, '#7d8f9b', '#4a5a64');
	const st = P(s.trace.street); x.fillStyle = '#555'; x.font = '10px sans-serif'; x.fillText('street', Math.min(190, Math.max(2, st[0] - 14)), Math.min(156, Math.max(10, st[1])));
	const p = P(sh.pos), d = sh.dir, L = 34;
	x.strokeStyle = '#e8590c'; x.fillStyle = '#e8590c'; x.lineWidth = 3;
	x.beginPath(); x.moveTo(p[0], p[1]); x.lineTo(p[0] + d[0] * L, p[1] + d[1] * L); x.stroke();
	const a = Math.atan2(d[1], d[0]), tip = [p[0] + d[0] * L, p[1] + d[1] * L];
	x.beginPath(); x.moveTo(tip[0], tip[1]); x.lineTo(tip[0] - 9 * Math.cos(a - 0.5), tip[1] - 9 * Math.sin(a - 0.5)); x.lineTo(tip[0] - 9 * Math.cos(a + 0.5), tip[1] - 9 * Math.sin(a + 0.5)); x.closePath(); x.fill();
	// field of view of a 1× lens (about 65°)
	x.globalAlpha = 0.18; x.beginPath(); x.moveTo(p[0], p[1]); x.arc(p[0], p[1], 70, a - 0.57, a + 0.57); x.closePath(); x.fill(); x.globalAlpha = 1;
	x.font = '16px sans-serif'; x.fillText('📷', p[0] - 9, p[1] + 6);
	x.fillStyle = '#333'; x.font = 'bold 10px sans-serif'; x.fillText('N ↑', 196, 12);
	return c;
}
async function acceptPhoto(ctx, sh, file, shots) {
	const s = ctx.s;
	const buf = await file.arrayBuffer();
	const exif = readExif(buf);
	let im;
	try { im = await fileImage(file); } catch (e) { return toast('That photo can’t be opened here. Use a JPG (on iPhone: Settings → Camera → Formats → Most Compatible).', 7000); }
	const m = analyze(im, im.naturalWidth, im.naturalHeight);
	const others = shots.filter((x) => x.id !== sh.id && s.photos[x.id] && s.photos[x.id].hash).map((x) => ({ label: x.label, hash: s.photos[x.id].hash }));
	const results = checkPhoto(m, exif, { label: sh.label, kind: 'wide', heading: sh.heading, property: s.lat ? { lat: s.lat, lng: s.lng } : null, others, now: Date.now() });
	let level = worst(results);
	let aiNote = '';
	const small = toJpeg(im, 1600, 0.86);
	if (aiReady() && level !== 'bad') {
		try {
			const a = await api('ai/photocheck', { body: { image: toJpeg(im, 1024, 0.8), view: sh.id } });
			if (!a.outdoor_yard) results.push({ level: 'bad', text: 'This doesn’t look like an outdoor photo of the property.', fix: 'Take the photo outside, of the yard and house.' });
			else if (!a.matches) results.push({ level: 'bad', text: `This doesn’t look like the ${sh.label.toLowerCase()}.`, fix: sh.how });
			if (a.whole_area === false) results.push({ level: 'warn', text: 'Part of the area is cut off.', fix: 'Step back (or use the corner spot) so the whole area and the house corners fit.' });
			if (a.obstructions && a.obstructions.length) results.push({ level: 'warn', text: 'In the way: ' + a.obstructions.join(', ') + '.', fix: (a.tips || [])[0] || '' });
			aiNote = a.seen || '';
			level = worst(results);
		} catch (e) { /* AI check is optional */ }
	}
	if (level === 'bad' && confirm(`This photo has a problem:\n\n${results.filter((r) => r.level === 'bad').map((r) => '• ' + r.text + ' ' + (r.fix || '')).join('\n')}\n\nOK = retake it (recommended). Cancel = keep it anyway.`)) {
		s.photos[sh.id] = { ...(s.photos[sh.id] || {}), results, hash: '', url: (s.photos[sh.id] || {}).url || '' };
		save();
		return;
	}
	// upload it to the property (replacing this angle's earlier photo)
	try {
		const c = await api('crm/client', { query: { id: s.client_id } });
		const prop = c.properties.find((x) => x.id === s.prop_id);
		const step = 'wiz_' + sh.id;
		const photos = (prop.photos || []).filter((p) => p.step !== step).concat([{ step, url: small, note: sh.label }]);
		const p = await api('crm/property', { body: { id: s.prop_id, client_id: s.client_id, photos } });
		const saved = (p.photos || []).find((x) => x.step === step);
		const focal = exif.f35 ? Math.round((exif.f35 / 36) * Math.max(im.naturalWidth, im.naturalHeight)) : 0;
		const Wp = Math.round(im.naturalWidth * Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight))), Hp = Math.round(im.naturalHeight * Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight)));
		s.photos[sh.id] = { url: saved ? saved.url : small, W: Wp, H: Hp, hash: m.hash, results, level, forced: level === 'bad', ai: aiNote, exif: { lat: exif.lat, lng: exif.lng, dir: exif.dir, f35: exif.f35 },
			cam: { horizon: Math.round(Hp / 2), camH: 5, focal: focal ? Math.round(focal * Wp / Math.max(im.naturalWidth, im.naturalHeight)) : Math.round(0.785 * Wp) } };
		save();
		toast(level === 'ok' ? `✓ ${sh.label} — looks good.` : level === 'warn' ? `${sh.label} saved — see the notes on its card.` : `${sh.label} kept despite the problem.`, 4000);
	} catch (e) { toast(e.message); }
}
async function addExtra(ctx) {
	const s = ctx.s;
	const f = await pickPhotoFile(true);
	if (!f) return;
	const im = await fileImage(f.file).catch(() => null);
	if (!im) return toast('That photo can’t be opened here.');
	const m = analyze(im, im.naturalWidth, im.naturalHeight);
	const r = checkPhoto(m, {}, { label: 'Close-up', kind: 'detail' });
	if (worst(r) === 'bad' && !confirm(r.filter((x) => x.level === 'bad').map((x) => x.text + ' ' + (x.fix || '')).join('\n') + '\n\nKeep it anyway?')) return;
	const note = prompt('What does this show? (e.g. water pools here after rain; gas meter; slope toward the house)') || '';
	try {
		const c = await api('crm/client', { query: { id: s.client_id } });
		const prop = c.properties.find((x) => x.id === s.prop_id);
		const step = 'wiz_detail_' + Date.now().toString(36);
		const p = await api('crm/property', { body: { id: s.prop_id, client_id: s.client_id, photos: (prop.photos || []).concat([{ step, url: toJpeg(im, 1600, 0.86), note }]) } });
		const saved = (p.photos || []).find((x) => x.step === step);
		s.extras = (s.extras || []).concat([{ url: saved ? saved.url : '', note }]);
		save();
		ctx.rerender();
	} catch (e) { toast(e.message); }
}

/* ================================================================ 7. site details */

function stepSite(ctx) {
	const s = ctx.s, site = s.site;
	const zoneSel = h('select', { 'aria-label': 'USDA zone', onchange: (e) => { site.zone = e.target.value; site.zoneAuto = false; save(); check(); } }, h('option', { value: '' }, 'Choose…'), ...ZONES.map((z) => h('option', { value: z, selected: z === site.zone }, 'Zone ' + z)));
	const zoneNote = h('small', { class: 'ds-hint' });
	const num = (k, ph) => h('input', { type: 'text', inputmode: 'decimal', placeholder: ph, value: site[k] == null ? '' : String(site[k]), oninput: (e) => { site[k] = parseFtIn(e.target.value) || e.target.value; save(); check(); } });
	const txt = (k, ph) => h('textarea', { rows: 2, placeholder: ph, oninput: (e) => { site[k] = e.target.value; save(); } }, site[k] || '');
	const slopeOut = h('small', { class: 'ds-hint' }, site.slope ? `${site.slope.class} slope, about ${site.slope.slope}% (downhill to the ${site.slope.downhill}).` : '');
	const issues = h('div');
	put(ctx.main, h('h3', null, 'Site conditions'),
		todo('Set the sun for each area (watch it on site, or ask the customer).', 'Measure from the ground to the bottom of the lowest front window — foundation plants are kept below it.', 'Answer the rest — each one changes the plant choices or the notes on the plan.'),
		card('🌡️ Climate', field('USDA hardiness zone', zoneSel), zoneNote),
		card('☀️ Sun', ...s.areas.map((a) => field(AREA_NAME[a], chipSet([['F', '☀️ Full sun (6+ hrs)'], ['P', '⛅ Part (3–6 hrs)'], ['S', '🌥️ Shade (under 3)']], () => site.sun[a] || '', (k) => { site.sun[a] = k; save(); check(); })))),
		card('🏠 House & site',
			field('Lowest front window sill height (ft)', num('sill', 'e.g. 3'), 'Ground to the bottom of the lowest window behind the front beds.'),
			h('label', { class: 'ds-check' }, h('input', { type: 'checkbox', checked: !!site.deer, onchange: (e) => { site.deer = e.target.checked; save(); } }), ' Deer visit this property (use deer-resistant plants)'),
			h('label', { class: 'ds-check' }, h('input', { type: 'checkbox', checked: !!site.native, onchange: (e) => { site.native = e.target.checked; save(); } }), ' Prefer native plants'),
			field('Drainage', chipSet([['none', 'No problems'], ['wet', 'Wet / soggy spots'], ['toward', 'Water runs toward the house'], ['erosion', 'Erosion / washouts']], () => site.drainage, (k) => { site.drainage = k; save(); check(); })),
			h('div', { class: 'ds-row ds-wrap' }, s.lat ? h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: async (e) => { e.currentTarget.disabled = true; try { site.slope = await api('crm/elevation', { body: { lat: s.lat, lng: s.lng } }); slopeOut.textContent = `${site.slope.class} slope, about ${site.slope.slope}% (downhill to the ${site.slope.downhill}).`; save(); } catch (er) { toast(er.message); } e.currentTarget.disabled = false; } }, '⛰️ Check the slope') : null, slopeOut),
			field('Irrigation', chipSet([['none', 'None'], ['existing', 'Has a system'], ['wanted', 'Customer wants one']], () => site.irrigation, (k) => { site.irrigation = k; save(); })),
			h('label', { class: 'ds-check' }, h('input', { type: 'checkbox', checked: !!site.util811, onchange: (e) => { site.util811 = e.target.checked; save(); check(); } }), ' I’ll call 811 to mark underground utilities before digging (required by law in every state)')),
		card('👤 Customer',
			field('Maintenance they want', chipSet([['low', 'Low'], ['medium', 'Some'], ['high', 'Loves gardening']], () => site.maint, (k) => { site.maint = k; save(); })),
			field('Budget (optional)', h('input', { type: 'text', placeholder: 'e.g. $8–12k', value: site.budget || '', oninput: (e) => { site.budget = e.target.value; save(); } })),
			field('Keep', txt('keep', 'Plants, beds or features to keep')), field('Remove', txt('remove', 'What comes out')), field('Wishes', txt('wishes', 'Colors, favorite plants, things to avoid, how they use the yard')),
			field('HOA or town rules (optional)', h('input', { type: 'text', value: site.hoa || '', oninput: (e) => { site.hoa = e.target.value; save(); } }))),
		issues);
	const check = () => {
		const probs = [];
		if (!site.zone) probs.push({ level: 'bad', text: 'Choose the USDA zone.' });
		for (const a of s.areas) if (!site.sun[a]) probs.push({ level: 'bad', text: `Set the sun for the ${AREA_NAME[a].toLowerCase()}.` });
		const sill = +site.sill;
		if (!(sill > 0)) probs.push({ level: 'bad', text: 'Type the window sill height.' });
		else if (sill < 1 || sill > 12) probs.push({ level: 'warn', text: `A ${sill} ft window sill is unusual.`, fix: 'Measure from the ground to the bottom of the window glass frame.' });
		if (site.drainage === 'toward') probs.push({ level: 'warn', text: 'Water runs toward the house — the plan will add a note to grade away from the foundation (6 in. drop in the first 10 ft).' });
		if (!site.util811) probs.push({ level: 'warn', text: 'Remember 811 before any digging.' });
		issues.innerHTML = '';
		put(issues, issueList(probs));
		footer(ctx, probs);
	};
	if (!site.zone && s.zip) api('crm/plan/zone', { query: { zip: s.zip } }).then((r) => { if (r.zone && !site.zone) { site.zone = r.zone; site.zoneAuto = true; zoneSel.value = r.zone; zoneNote.textContent = `Zone ${r.zone} for ZIP ${s.zip} (USDA 2023 map). Change it if you know better.`; save(); check(); } else zoneNote.textContent = 'Look it up at planthardiness.ars.usda.gov if you’re not sure.'; }).catch(() => {});
	else if (site.zoneAuto) zoneNote.textContent = `From ZIP ${s.zip}.`;
	check();
}

/* ================================================================ 8. style */

function stepStyle(ctx) {
	const s = ctx.s, site = s.site;
	const rec = recommendStyle(s);
	const grid = h('div', { class: 'ds-pw-styles' });
	put(ctx.main, h('h3', null, 'Choose the style of the plan'),
		todo('Pick the style the customer likes. Each card shows how many library plants fit THIS site (zone, sun, deer).', 'Not sure? The ⭐ suggestion fits the site and the maintenance they want.'), grid);
	const draw = () => {
		grid.innerHTML = '';
		for (const st of STYLES) {
			const fits = s.areas.map((a) => { const sun = site.sun[a] || 'F'; const b = pickPlants(PLANTS, st, 'back', sun, site, {}, 40), f = pickPlants(PLANTS, st, 'front', sun, site, {}, 40); return { a, n: b.items.length + f.items.length, relaxed: b.relaxed || f.relaxed }; });
			const low = fits.filter((x) => x.n < 4 || x.relaxed);
			const sunBad = st.needsSun && s.areas.some((a) => site.sun[a] === 'S');
			grid.append(h('button', { type: 'button', class: 'ds-pw-style' + (s.style === st.id ? ' on' : ''), 'aria-pressed': String(s.style === st.id), onclick: () => { s.style = st.id; save(); draw(); } },
				h('span', { class: 'ds-pw-style-ic' }, st.ic), h('b', null, st.name, st.id === rec ? h('small', { class: 'ds-pw-rec' }, ' ⭐ Suggested') : null), h('small', null, st.desc),
				h('small', { class: low.length || sunBad ? 'ds-pw-warnline' : 'ds-pw-okline' }, sunBad ? '⚠️ Needs sun — part of this site is shady' : low.length ? `⚠️ Few ${st.name.toLowerCase()} plants fit the ${low.map((x) => AREA_NAME[x.a].toLowerCase()).join(', ')}` : `✓ ${Math.min(...fits.map((x) => x.n))}+ plants fit every area`)));
		}
		const probs = s.style ? [] : [{ level: 'bad', text: 'Pick a style.' }];
		const chosen = STYLES.find((x) => x.id === s.style);
		if (chosen && chosen.needsSun && s.areas.some((a) => site.sun[a] === 'S')) probs.push({ level: 'warn', text: `${chosen.name} needs sun, but part of this site is shady.` });
		footer(ctx, probs);
	};
	draw();
}
export function recommendStyle(s) {
	const suns = s.areas.map((a) => s.site.sun[a]);
	if (suns.filter((x) => x === 'S').length >= Math.ceil(suns.length / 2)) return 'woodland';
	if (s.site.native) return 'native';
	if (s.site.maint === 'low') return 'lowmaint';
	if (s.site.maint === 'high') return 'cottage';
	return 'traditional';
}

/* ================================================================ 9. designs */

function stepDesigns(ctx) {
	const s = ctx.s;
	const shots = shotPlan(s.trace, s.areas);
	const box = h('div');
	put(ctx.main, h('h3', null, 'Designs for each area (optional)'),
		todo(`Leave an area on “Generate in ${styleById(s.style).name} style” and the wizard designs it for you.`, 'Or use a Dreamscape for any area — load one you already made, or start one now on the bird’s-eye view (exact sizes) or on that area’s photo (realistic look). You come straight back here when you tap “Use this design in the plan”.', 'You can use a different Dreamscape for every area.'),
		box);
	const draw = () => {
		box.innerHTML = '';
		const probs = [];
		for (const a of s.areas) {
			const d = s.designs[a];
			const issues = d ? checkDesign(d, s.base) : [];
			if (d && issues.some((x) => x.level === 'bad')) probs.push({ level: 'bad', text: `${AREA_NAME[a]}: ${issues[0].text}` });
			const photo = s.photos[a] && s.photos[a].url ? s.photos[a] : null;
			box.append(card(AREA_NAME[a],
				d ? h('p', null, h('b', null, `🗂️ ${d.title || 'Dreamscape'}`), ` — ${(d.shapes || []).length} beds and plants, ${d.kind === 'aerial' ? 'bird’s-eye (to scale)' : 'photo (estimated sizes)'}`) : h('p', { class: 'ds-muted' }, `✨ Generate in ${styleById(s.style).name} style`),
				issueList(issues),
				h('div', { class: 'ds-row ds-wrap' },
					h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => loadDesign(ctx, a) }, '🗂️ Load one of my Dreamscapes'),
					s.base && s.base.kind === 'aerial' ? h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => designNew(ctx, a, 'aerial') }, '✏️ Design on the bird’s-eye view') : null,
					photo ? h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => designNew(ctx, a, 'photo') }, '📷 Design on the photo') : null,
					s.quoteDesign && s.quoteDesign.plan ? h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => { setDesign(s, a, s.quoteDesign); draw(); } }, '🧾 Use the quote’s design') : null,
					d ? h('button', { class: 'ds-link', onclick: () => { s.designs[a] = null; save(); draw(); } }, 'Use the style instead') : null)));
		}
		footer(ctx, probs);
	};
	draw();
}
function setDesign(s, area, payload) {
	const p = payload.plan || {};
	s.designs[area] = { title: payload.title || 'Dreamscape', kind: (payload.geo && payload.geo.kind) || (p.source === 'aerial' ? 'aerial' : 'photo'), shapes: p.shapes || [], geo: payload.geo || {}, estimated: !!p.estimated };
	save();
	const issues = checkDesign(s.designs[area], s.base);
	if (issues.some((x) => x.level === 'bad')) toast(issues[0].text + ' ' + (issues[0].fix || ''), 8000);
}
function backToWizard(area) {
	return (payload) => {
		if (payload && W.s) setDesign(W.s, area, payload);
		W.go({ v: 'plans', wizard: true, prop_id: W.s && W.s.prop_id, client_id: W.s && W.s.client_id, resume: true, step: 8 });
	};
}
function loadDesign(ctx, area) {
	save(true);
	W.ctx.pickDesign(backToWizard(area), () => backToWizard(area)(null));
}
async function designNew(ctx, area, kind) {
	const s = ctx.s;
	save(true);
	try {
		let shot;
		if (kind === 'aerial') {
			const im = await loadImg(s.base.url);
			const c = document.createElement('canvas');
			c.width = im.naturalWidth; c.height = im.naturalHeight;
			c.getContext('2d').drawImage(im, 0, 0);
			const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.92));
			shot = { blob, W: c.width, H: c.height, kind: 'aerial', bitmap: c, ppf: s.base.ppf * (c.width / s.base.W), where: s.base.where, label: 'Bird\'s-eye' };
		} else {
			const ph = s.photos[area];
			const im = await loadImg(ph.url);
			const c = document.createElement('canvas');
			c.width = im.naturalWidth; c.height = im.naturalHeight;
			c.getContext('2d').drawImage(im, 0, 0);
			const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.92));
			const k = c.width / (ph.W || c.width);
			shot = { blob, W: c.width, H: c.height, kind: 'photo', bitmap: c, cam: { horizon: Math.round(ph.cam.horizon * k), camH: 5, focal: Math.round(ph.cam.focal * k) }, label: AREA_NAME[area] };
		}
		await W.ctx.designFor(`${s.client || 'Plan'} – ${AREA_NAME[area].toLowerCase()}`, shot, backToWizard(area), () => backToWizard(area)(null));
	} catch (e) { toast(e.message || 'Couldn’t open the designer.'); }
}

/* ================================================================ 10. generate & review */

function stepGenerate(ctx) {
	const s = ctx.s;
	const acc = accuracy({ base: s.base, check: s.check, boundaryKnown: s.boundaryKnown });
	const shots = shotPlan(s.trace, s.areas);
	const probs = [];
	for (const x of validateTrace(s.trace, s.base)) if (x.level === 'bad') probs.push({ ...x, step: 3 });
	if (!s.check || (s.check.level === 'bad')) probs.push({ level: 'bad', text: 'The scale check isn’t finished.', step: 4 });
	else if (s.check.skipped) probs.push({ level: 'warn', text: 'The scale wasn’t checked with a tape (less accurate).', step: 4 });
	const missing = shots.filter((sh) => !s.photos[sh.id] || (!s.photos[sh.id].url && !s.photos[sh.id].skipped));
	if (missing.length) probs.push({ level: 'bad', text: `${missing.length} site photo${missing.length > 1 ? 's' : ''} missing.`, step: 5 });
	if (!s.site.zone || s.areas.some((a) => !s.site.sun[a])) probs.push({ level: 'bad', text: 'Site details aren’t finished (zone or sun).', step: 6 });
	if (!s.style) probs.push({ level: 'bad', text: 'No style chosen.', step: 7 });
	for (const [a, d] of Object.entries(s.designs)) if (d && checkDesign(d, s.base).some((x) => x.level === 'bad')) probs.push({ level: 'bad', text: `The ${AREA_NAME[a].toLowerCase()} Dreamscape can’t be used.`, step: 8 });
	const sum = (k, v) => h('div', { class: 'ds-kv' }, h('small', null, k), h('span', null, v));
	const rep = h('div');
	put(ctx.main, h('h3', null, 'Generate the plan'),
		todo('Check the summary. Anything marked ✖ must be fixed first — tap it to go there.', 'Tap “Generate my plan”. It opens in the 2D editor so you can adjust anything, then it’s saved on the property.', 'Build the quote straight from the plan.'),
		card('Summary', h('div', { class: 'ds-kvs' },
			sum('Customer', `${s.client} — ${s.address}`), sum('Areas', s.areas.map((a) => AREA_NAME[a]).join(', ')),
			sum('Measured from', s.base ? (s.base.kind === 'aerial' ? s.base.source || 'Bird’s-eye imagery' : s.base.kind === 'survey' ? 'Survey / plot plan' : 'Tape measurements') : '—'),
			sum('Scale check', s.check ? (s.check.skipped ? 'Skipped' : s.check.text || '') : '—'),
			sum('Photos', `${shots.filter((sh) => s.photos[sh.id] && s.photos[sh.id].url).length} of ${shots.length}${(s.extras || []).length ? ` + ${s.extras.length} close-ups` : ''}`),
			sum('Zone / sun', `${s.site.zone || '?'} · ${s.areas.map((a) => `${AREA_NAME[a].split(' ')[0]} ${{ F: 'sun', P: 'part', S: 'shade' }[s.site.sun[a]] || '?'}`).join(', ')}`),
			sum('Style', s.style ? styleById(s.style).name : '—'),
			sum('Designs', s.areas.map((a) => `${AREA_NAME[a].split(' ')[0]}: ${s.designs[a] ? 'Dreamscape' : 'generated'}`).join(', ')),
			sum('Accuracy', acc.text))),
		probs.length ? card('Before generating', h('ul', { class: 'ds-pw-issues' }, ...probs.map((p) => h('li', { class: 'ds-pw-' + p.level }, h('button', { class: 'ds-link', onclick: () => ctx.show(p.step) }, (p.level === 'bad' ? '✖ ' : '⚠️ ') + p.text + ' — fix'))))) : null,
		rep);
	if (s.report) showReport(rep, s);
	footer(ctx, probs, s.report ? 'Generate again' : '✨ Generate my plan', async () => { await generate(ctx, rep, acc); return false; });
}
async function generate(ctx, rep, acc) {
	const s = ctx.s;
	if (s.report && !confirm('Generate again? Changes you made to this plan in the editor will be replaced.')) return;
	const shots = shotPlan(s.trace, s.areas);
	const out = generatePlan({ trace: s.trace, k: s.check && !s.check.skipped && s.check.k ? s.check.k : 1, base: s.base, areas: s.areas, style: s.style,
		site: { ...s.site, hardscape: s.hardscape, privacy: s.privacy, boundaryKnown: s.boundaryKnown }, lib: PLANTS, designs: s.designs, shots });
	const notes = [...out.report.notes];
	if (s.site.drainage === 'toward') notes.push('Drainage: regrade so the soil falls away from the foundation — at least 6 in. over the first 10 ft — and extend downspouts.');
	if (s.site.drainage === 'wet') notes.push('Wet spots: use plants that tolerate wet soil there, or add a dry creek / French drain.');
	if (s.site.drainage === 'erosion') notes.push('Erosion: stabilize bare slopes with groundcover and erosion-control fabric under the mulch.');
	if (s.site.irrigation === 'wanted') notes.push('Irrigation: plan drip lines in beds and spray zones in lawn.');
	notes.push('Call 811 before digging.');
	for (const sh of shots) if (s.photos[sh.id] && s.photos[sh.id].skipped) notes.push(`No photo of the ${sh.label.toLowerCase()} (${s.photos[sh.id].reason}) — check that area on site.`);
	const plan = {
		shapes: out.shapes,
		bg: s.base && s.base.url ? { url: s.base.url, ppf: out.bgPpf || s.base.ppf, W: s.base.W, H: s.base.H, kind: s.base.kind === 'survey' ? 'survey' : 'aerial', scaled: true } : null,
		notes: [s.site.wishes ? 'Customer wishes: ' + s.site.wishes : '', s.site.keep ? 'Keep: ' + s.site.keep : '', s.site.remove ? 'Remove: ' + s.site.remove : '', ...notes].filter(Boolean).join('\n'),
		estimated: Object.values(s.designs).some((d) => d && d.kind === 'photo'),
		meta: { wizard: true, style: s.style, accuracy: acc.pm, level: acc.level, generated: Date.now(), areas: s.areas, zone: s.site.zone, source: s.base ? s.base.source : '' }
	};
	try {
		await api('crm/property', { body: { id: s.prop_id, client_id: s.client_id, plan } });
	} catch (e) { return toast(e.message, 8000); }
	s.report = { notes, warn: out.report.warn, counts: out.report.counts, at: Date.now() };
	s.done = true;
	save(true);
	showReport(rep, s);
	toast('Plan generated. Review it in the editor — drag anything to adjust.', 5000);
	openEditor(s.prop_id, s.client_id);
}
function showReport(rep, s) {
	rep.innerHTML = '';
	const c = s.report.counts || {};
	put(rep, card('✓ Your plan',
		h('p', null, [c.bed ? `${c.bed} beds` : '', c.plant ? `${c.plant} plants` : '', c.walkway ? 'front walk' : '', c.patio ? 'patio' : '', c.stone ? 'stone strip' : ''].filter(Boolean).join(' · ')),
		s.report.warn.length ? issueList(s.report.warn.map((w) => ({ level: 'warn', text: w }))) : null,
		h('ul', null, ...s.report.notes.map((n) => h('li', null, n))),
		h('div', { class: 'ds-row ds-wrap' },
			h('button', { class: 'ds-btn', onclick: () => openEditor(s.prop_id, s.client_id) }, '📐 Open the plan'),
			h('button', { class: 'ds-btn', onclick: () => (s.fromQuote ? W.go({ v: 'quote', id: s.fromQuote === 'new' ? 0 : s.fromQuote, resume: true }) : W.go({ v: 'quote', seed: { client_id: s.client_id, prop_id: s.prop_id } })) }, s.fromQuote ? '🧾 Back to the quote' : '🧾 Build a quote from it'),
			h('button', { class: 'ds-btn ds-ghost', onclick: () => W.go({ v: 'plans' }) }, 'All plans'))));
}

const STEP_FN = { who: stepWho, scope: stepScope, base: stepBase, trace: stepTrace, scale: stepScale, photos: stepPhotos, site: stepSite, style: stepStyle, designs: stepDesigns, generate: stepGenerate };

/* ================================================================ helpers */

function loadImg(url) {
	return new Promise((ok, bad) => {
		if (!url) return bad(new Error('No picture.'));
		const im = new Image();
		if (!/^data:/.test(url)) im.crossOrigin = 'anonymous';
		im.onload = () => ok(im);
		im.onerror = () => bad(new Error('The picture couldn’t be loaded.'));
		im.src = url;
	});
}
function fileImage(file) {
	return new Promise((ok, bad) => {
		const url = URL.createObjectURL(file);
		const im = new Image();
		im.onload = () => ok(im);
		im.onerror = () => { URL.revokeObjectURL(url); bad(new Error('bad image')); };
		im.src = url;
	});
}
/** A file from the camera (cam=true) or the photo library. */
function pickPhotoFile(cam) {
	return new Promise((resolve) => {
		const inp = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
		if (cam) inp.setAttribute('capture', 'environment');
		document.body.append(inp);
		inp.addEventListener('change', () => { const f = inp.files && inp.files[0]; inp.remove(); resolve(f ? { file: f } : null); }, { once: true });
		inp.addEventListener('cancel', () => { inp.remove(); resolve(null); }, { once: true });
		inp.click();
	});
}

/* ================================================================ the tracer */

const START_R = 15; // the first point is big and easy to tap again to close the shape
const COLORS = { boundary: '#e53935', house: '#546e7a', driveway: '#9e9e9e', structures: '#8d6e63', street: '#1e88e5', door: '#fb8c00', trees: '#2e7d32', line: '#00b0ff' };
/**
 * Tap-to-trace on an image. Data is in FEET (image px / ppf); W, H = the image size the ppf belongs to.
 * active: { key, type: 'point'|'points'|'poly'|'line', multi }
 */
export function tracer(el, o) {
	const cv = h('canvas', { class: 'ds-pw-cv', tabindex: 0, 'aria-label': 'Tracing area. Tap to add a point, drag to move, scroll or pinch to zoom.' });
	const zoom = h('div', { class: 'ds-map-zoom' }, h('button', { type: 'button', 'aria-label': 'Zoom in', onclick: () => zoomAt(1.4) }, '+'), h('button', { type: 'button', 'aria-label': 'Zoom out', onclick: () => zoomAt(1 / 1.4) }, '−'), h('button', { type: 'button', 'aria-label': 'Fit', onclick: () => fit() }, '⤢'));
	const wrap = h('div', { class: 'ds-pw-cvwrap' }, cv, zoom);
	el.append(wrap);
	const t = o.trace;
	let act = o.active, draft = null, view = { s: 1, x: 0, y: 0 }, dpr = window.devicePixelRatio || 1;
	const imgK = o.img ? o.img.naturalWidth / o.W : 1; // image px per "W" px
	const ftToScr = (p) => [view.x + p[0] * o.ppf * view.s, view.y + p[1] * o.ppf * view.s];
	const scrToFt = (x, y) => [(x - view.x) / view.s / o.ppf, (y - view.y) / view.s / o.ppf];
	const size = () => { const r = wrap.getBoundingClientRect(); cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px'; };
	const fit = () => { size(); const w = cv.width / dpr, hh = cv.height / dpr; view.s = Math.min(w / o.W, hh / o.H); view.x = (w - o.W * view.s) / 2; view.y = (hh - o.H * view.s) / 2; draw(); };
	const zoomAt = (k, sx, sy) => { const w = cv.width / dpr, hh = cv.height / dpr; sx = sx == null ? w / 2 : sx; sy = sy == null ? hh / 2 : sy; const ns = Math.max(0.05, Math.min(40, view.s * k)); view.x = sx - ((sx - view.x) * ns) / view.s; view.y = sy - ((sy - view.y) * ns) / view.s; view.s = ns; draw(); };
	function draw() {
		const x = cv.getContext('2d');
		x.setTransform(dpr, 0, 0, dpr, 0, 0);
		x.clearRect(0, 0, cv.width, cv.height);
		x.fillStyle = '#eef2ec'; x.fillRect(0, 0, cv.width, cv.height);
		if (o.img) x.drawImage(o.img, view.x, view.y, o.W * view.s, o.H * view.s);
		const poly = (pts, color, closed, fill, activeNow) => {
			if (!pts || !pts.length) return;
			x.beginPath();
			pts.forEach((p, i) => { const q = ftToScr(p); i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1]); });
			if (closed) x.closePath();
			if (fill && closed) { x.fillStyle = color + '40'; x.fill(); }
			x.strokeStyle = color; x.lineWidth = activeNow ? 3 : 2; x.setLineDash(color === COLORS.boundary ? [8, 5] : []); x.stroke(); x.setLineDash([]);
			if (activeNow) pts.forEach((p, i) => {
				const q = ftToScr(p), start = i === 0 && !closed;
				x.beginPath(); x.arc(q[0], q[1], start ? START_R : 6, 0, 7);
				x.fillStyle = start ? (pts.length >= 3 ? '#ffd43b' : '#fff') : color; x.fill();
				x.strokeStyle = start ? color : '#fff'; x.lineWidth = start ? 4 : 2; x.stroke();
				if (start) { label(pts.length >= 3 ? 'Start — tap to close' : 'Start', q[0] + START_R + 4, q[1] + 4); }
			});
		};
		const label = (txt, lx, ly) => { x.font = 'bold 13px sans-serif'; x.lineWidth = 4; x.strokeStyle = 'rgba(0,0,0,.75)'; x.strokeText(txt, lx, ly); x.fillStyle = '#fff'; x.fillText(txt, lx, ly); };
		const pin = (p, color, label) => { if (!p) return; const q = ftToScr(p); x.beginPath(); x.arc(q[0], q[1], 8, 0, 7); x.fillStyle = color; x.fill(); x.strokeStyle = '#fff'; x.lineWidth = 2; x.stroke(); if (label) { x.font = 'bold 12px sans-serif'; x.fillStyle = '#fff'; x.strokeStyle = 'rgba(0,0,0,.6)'; x.lineWidth = 3; x.strokeText(label, q[0] + 11, q[1] + 4); x.fillText(label, q[0] + 11, q[1] + 4); } };
		// measured areas (Measure Property Features): filled, with their name and size
		(t.sections || []).forEach((sc) => { poly(sc.pts, sc.color || '#ffd43b', true, true, false); const cc = centroid(sc.pts), q = ftToScr(cc); if (sc.label) { label(sc.label, q[0] - x.measureText(sc.label).width / 2, q[1] + 4); } });
		poly(t.boundary, COLORS.boundary, true, false, act.key === 'boundary' && !draft);
		poly(t.house, COLORS.house, true, true, act.key === 'house' && !draft);
		poly(t.driveway, COLORS.driveway, true, true, act.key === 'driveway' && !draft);
		(t.structures || []).forEach((s) => poly(s, COLORS.structures, true, true, false));
		(t.trees || []).forEach((tr) => { const q = ftToScr(tr.pt); x.beginPath(); x.arc(q[0], q[1], Math.max(6, (tr.w || 20) / 2 * o.ppf * view.s), 0, 7); x.strokeStyle = COLORS.trees; x.lineWidth = 2; x.stroke(); pin(tr.pt, COLORS.trees); });
		pin(t.street, COLORS.street, 'Street');
		pin(t.door, COLORS.door, 'Door');
		if (t.line && t.line.length) { poly(t.line, COLORS.line, false, false, true); if (t.line.length === 2) { const m = ftToScr([(t.line[0][0] + t.line[1][0]) / 2, (t.line[0][1] + t.line[1][1]) / 2]); x.font = 'bold 13px sans-serif'; x.fillStyle = '#fff'; x.strokeStyle = 'rgba(0,0,0,.7)'; x.lineWidth = 3; const L = fmtFtIn(dist(t.line[0], t.line[1])); x.strokeText(L, m[0] + 8, m[1] - 8); x.fillText(L, m[0] + 8, m[1] - 8); } }
		if (draft) poly(draft, COLORS[act.key] || '#00b0ff', false, false, true);
		// scale bar
		const ft = [5, 10, 20, 50, 100, 200].find((f) => f * o.ppf * view.s > 60) || 200;
		const L = ft * o.ppf * view.s, y0 = cv.height / dpr - 14;
		x.fillStyle = 'rgba(255,255,255,.85)'; x.fillRect(8, y0 - 14, L + 40, 20);
		x.fillStyle = '#222'; x.fillRect(12, y0 - 2, L, 3); x.font = '11px sans-serif'; x.fillText(ft + ' ft', 16 + L, y0 + 2);
	}
	// pointer
	const ptrs = new Map();
	let press = null, pinch = null, dragV = null;
	const busy = () => cv.dispatchEvent(new CustomEvent('ds-busy', { bubbles: true, composed: true }));
	for (const ev of ['pointerdown', 'wheel']) cv.addEventListener(ev, busy, { passive: true });
	const local = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
	const activePts = () => (draft ? draft : act.type === 'poly' && !act.multi ? t[act.key] : act.type === 'line' ? t.line : null);
	cv.addEventListener('pointerdown', (e) => {
		cv.setPointerCapture(e.pointerId);
		const p = local(e);
		ptrs.set(e.pointerId, p);
		if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), s: view.s, c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] }; press = null; return; }
		const pts = activePts();
		dragV = null;
		if (pts) pts.forEach((q, i) => { const s = ftToScr(q); if (Math.hypot(s[0] - p[0], s[1] - p[1]) < 14 && !(draft && i === 0 && draft.length >= 2)) dragV = { pts, i }; });
		press = { p, vx: view.x, vy: view.y, moved: false };
	});
	cv.addEventListener('pointermove', (e) => {
		if (!ptrs.has(e.pointerId)) return;
		const p = local(e);
		ptrs.set(e.pointerId, p);
		if (pinch && ptrs.size === 2) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); zoomAt((pinch.s * d / pinch.d) / view.s, pinch.c[0], pinch.c[1]); return; }
		if (!press) return;
		if (Math.hypot(p[0] - press.p[0], p[1] - press.p[1]) > 5) press.moved = true;
		if (!press.moved) return;
		if (dragV) { dragV.pts[dragV.i] = scrToFt(p[0], p[1]); draw(); return; }
		view.x = press.vx + p[0] - press.p[0]; view.y = press.vy + p[1] - press.p[1]; draw();
	});
	const up = (e) => {
		ptrs.delete(e.pointerId);
		if (ptrs.size < 2) pinch = null;
		if (!press) return;
		if (dragV && press.moved) { dragV = null; press = null; o.onChange && o.onChange(); return; }
		if (!press.moved && e.type === 'pointerup') tap(press.p);
		press = null; dragV = null;
	};
	cv.addEventListener('pointerup', up);
	cv.addEventListener('pointercancel', up);
	cv.addEventListener('wheel', (e) => { e.preventDefault(); const p = local(e); zoomAt(Math.exp(-Math.max(-240, Math.min(240, e.deltaY)) * 0.0025), p[0], p[1]); }, { passive: false });
	cv.addEventListener('keydown', (e) => { if (e.key === 'Backspace' || (e.key === 'z' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); api.undo(); } });
	function tap(p) {
		const ft = scrToFt(p[0], p[1]);
		if (act.type === 'point') t[act.key] = ft;
		else if (act.type === 'points') t[act.key].push({ pt: ft, w: 20 });
		else if (act.type === 'line') { t.line = t.line && t.line.length === 1 ? [t.line[0], ft] : [ft]; }
		else if (act.type === 'poly') {
			if (!draft) draft = [];
			if (draft.length >= 3) { const f = ftToScr(draft[0]); if (Math.hypot(f[0] - p[0], f[1] - p[1]) < START_R + 10) { close(); return; } }
			draft.push(ft);
		}
		draw();
		o.onChange && o.onChange();
	}
	function close() {
		if (!draft || draft.length < 3) return;
		if (act.multi) t[act.key].push(draft); else t[act.key] = draft;
		draft = null;
		draw();
		o.onChange && o.onChange();
	}
	const ro = new ResizeObserver(() => { const had = cv.width; size(); if (!had) fit(); else draw(); });
	ro.observe(wrap);
	const api = {
		setActive(a) { if (draft && draft.length >= 3) close(); draft = null; act = a; draw(); },
		undo() {
			if (draft && draft.length) draft.pop();
			else if (act.type === 'points' && t[act.key].length) t[act.key].pop();
			else if (act.type === 'line' && t.line && t.line.length) t.line.pop();
			else if (act.type === 'poly' && act.multi && t[act.key].length) t[act.key].pop();
			else if (act.type === 'poly' && t[act.key] && t[act.key].length) { draft = t[act.key].slice(0, -1); t[act.key] = null; }
			else if (act.type === 'point') t[act.key] = null;
			draw(); o.onChange && o.onChange();
		},
		clearActive() { draft = null; if (act.type === 'points' || act.multi) t[act.key] = []; else if (act.type === 'line') t.line = []; else t[act.key] = null; draw(); o.onChange && o.onChange(); },
		redraw: draw, fit, data: () => t, draft: () => draft, view: () => ({ ...view }),
		destroy() { ro.disconnect(); wrap.remove(); }
	};
	void imgK;
	requestAnimationFrame(fit);
	return api;
}

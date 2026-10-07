/* DreamScaper – Route planner (Contractor Hub).
 *
 * One crew's day in the fewest miles: stops pulled from the calendar (with how long each job takes) or
 * typed in, optional vehicle / fuel / crew cost / lunch questions, "Be close to restaurants at lunch",
 * "Be near X at T", the best order, every leg, and — if the tank will run low — the 3 gas stations with
 * the lowest TOTAL cost (fuel + extra driving + paid crew time), each with the reason it was picked.
 * The maths is in routeopt.js; the server looks up addresses, driving distances and nearby places.
 */
import { h, put, icon } from './util.js?v=2.7.7';
import { api } from './api.js?v=2.7.7';
import { modal } from './capture.js?v=2.7.7';
import { addressField } from './address.js?v=2.7.7';
import { sectionHead, tip } from './explain.js?v=2.7.7';
import { streetMap } from './map.js?v=2.7.7';
import { estimateMatrix, optimize, fuelPlan, rankStations, haversine, ROAD_FACTOR, LEVELS } from './routeopt.js?v=2.7.7';

let RT = null;
export function initRoutes(ctx, tools) { RT = { ctx, tools }; }
const toast = (m, ms) => RT && RT.ctx.toast(m, ms);
const card = (title, ...kids) => h('section', { class: 'ds-hub-card' }, title ? h('h2', null, title) : null, ...kids);
// a <label> forwards clicks to its first control, so groups of buttons (chips) get a plain <div>
const field = (label, el, hint) => h(el && el.querySelector && el.querySelector('button') ? 'div' : 'label', { class: 'ds-field' }, h('span', null, label), el, hint ? h('small', { class: 'ds-hint' }, hint) : null);
const apiBase = () => (RT.ctx.cfg && RT.ctx.cfg.api) || '/wp-json/dreamscaper/v1/';
const hhmm = (min) => { const d = new Date(2000, 0, 1, Math.floor(min / 60), Math.round(min % 60)); return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); };
const toMin = (v) => { const [a, b] = String(v || '0:0').split(':').map(Number); return a * 60 + (b || 0); };
const fromMin = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;
const dayStart = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
const ymd = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const PRICE_GUESS = { gas: 3.3, diesel: 3.8 }; // used for planning until real prices are found
let uid = 0;
const PREFS = 'ds_route_prefs';
const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(PREFS) || '{}'); } catch (e) { return {}; } };
const savePrefs = (p) => { try { localStorage.setItem(PREFS, JSON.stringify(p)); } catch (e) { /* private mode */ } };

export async function viewRoutes(b, view, go) {
	RT.go = go;
	const prefs = loadPrefs();
	const wh = RT.tools.workHours();
	let me = null, veh = { items: [], google: false };
	try { [me, veh] = await Promise.all([api('crm/me'), api('crm/route/vehicles')]); } catch (e) { put(b, h('p', { class: 'ds-warn' }, e.message)); return; }
	const pro = me.pro || {};
	const S = {
		date: dayStart(view.date || Date.now()), crew: view.crew || '', start: prefs.start || [pro.address, pro.zip].filter(Boolean).join(', '), startTime: wh.start * 60, endSame: true, end: '',
		stops: [], vehicle: prefs.vehicle || '', mpg: prefs.mpg || 0, tank: prefs.tank || 0, fuel: prefs.fuel || 'gas', trailer: !!prefs.trailer, level: 0,
		crewSize: prefs.crewSize || '', wage: prefs.wage || '', lunchAt: prefs.lunchAt || 12 * 60, lunchLen: prefs.lunchLen || 30, nearFood: !!prefs.nearFood, meet: { on: false, address: '', at: 14 * 60, stay: 15 }
	};
	const teams = [...new Set(((me.settings && me.settings.crew) || []).map((c) => (c.team || '').trim()).filter(Boolean))];
	const stopsBox = h('div', { class: 'ds-rt-stops' });
	const result = h('div', { class: 'ds-rt-result' });
	const vehNote = h('small', { class: 'ds-hint' });

	// 1. the day
	const date = h('input', { type: 'date', value: ymd(S.date), onchange: (e) => { S.date = new Date(e.target.value + 'T00:00').getTime(); } });
	const crewSel = h('select', { onchange: (e) => { S.crew = e.target.value; } }, h('option', { value: '' }, teams.length ? 'Choose a crew' : 'All jobs'), ...teams.map((t) => h('option', { value: t, selected: t === S.crew }, t)));
	const startIn = h('input', { type: 'text', value: S.start, placeholder: 'Yard / shop address', autocomplete: 'street-address', oninput: (e) => { S.start = e.target.value; } });
	const endIn = h('input', { type: 'text', placeholder: 'Where the day ends', hidden: true, oninput: (e) => { S.end = e.target.value; } });
	const startTime = h('input', { type: 'time', value: fromMin(S.startTime), onchange: (e) => { S.startTime = toMin(e.target.value); } });

	// 3. optional questions
	const vehSel = h('select', { onchange: (e) => pickVehicle(e.target.value) }, h('option', { value: '' }, 'Choose your vehicle (optional)'), ...veh.items.map((v) => h('option', { value: v.id, selected: v.id === S.vehicle }, `${v.label} — ${v.mpg} mpg`)), h('option', { value: 'custom', selected: S.vehicle === 'custom' }, 'Other — I’ll type its MPG and tank size'));
	const mpgIn = h('input', { type: 'number', min: 3, max: 60, step: 0.5, value: S.mpg || '', oninput: (e) => { S.mpg = +e.target.value; showVeh(); } });
	const tankIn = h('input', { type: 'number', min: 5, max: 100, step: 0.5, value: S.tank || '', oninput: (e) => { S.tank = +e.target.value; showVeh(); } });
	const custom = h('div', { class: 'ds-form-grid', hidden: S.vehicle !== 'custom' }, field('Miles per gallon', mpgIn), field('Tank size (gallons)', tankIn));
	const pickVehicle = (id) => {
		S.vehicle = id;
		const v = veh.items.find((x) => x.id === id);
		if (v) { S.mpg = v.mpg; S.tank = v.tank; S.fuel = v.fuel; mpgIn.value = v.mpg; tankIn.value = v.tank; }
		custom.hidden = id !== 'custom';
		showVeh();
	};
	const showVeh = () => { vehNote.textContent = S.vehicle && S.mpg ? `${S.mpg} mpg${S.trailer ? ` → about ${(S.mpg * 0.75).toFixed(1)} mpg pulling a trailer` : ''} · ${S.tank} gal tank · ${S.fuel}${S.vehicle !== 'custom' ? ' (typical figures — pick “Other” to type your own)' : ''}` : ''; };
	const levelChips = h('div', { class: 'ds-chips', role: 'radiogroup', 'aria-label': 'Fuel in the tank' });
	const drawLevels = () => { levelChips.innerHTML = ''; for (const [v, l] of LEVELS) levelChips.append(h('button', { type: 'button', class: 'ds-chip' + (S.level === v ? ' on' : ''), 'aria-pressed': String(S.level === v), onclick: () => { S.level = S.level === v ? 0 : v; drawLevels(); } }, l)); };
	drawLevels();
	const meetAddr = h('input', { type: 'text', placeholder: 'Address (supplier, other crew…)', oninput: (e) => { S.meet.address = e.target.value; } });
	const meetBox = h('div', { class: 'ds-form-3', hidden: true }, field('Address', addressField(meetAddr, { api: apiBase(), onPick: (it) => { meetAddr.value = it.label; S.meet.address = it.label; } })), field('Be there by', h('input', { type: 'time', value: fromMin(S.meet.at), onchange: (e) => { S.meet.at = toMin(e.target.value); } })), field('Minutes there', h('input', { type: 'number', min: 0, max: 240, value: S.meet.stay, oninput: (e) => { S.meet.stay = +e.target.value || 0; } })));
	showVeh();

	put(b, sectionHead('routes'),
		tip('routes', 'Pick the day and crew, pull the jobs from your calendar (or type addresses), answer the optional questions you care about, then tap “Plan my route”.'),
		card('1. The day',
			h('div', { class: 'ds-form-3' }, field('Day', date), field('Crew', crewSel, 'Each crew’s route is planned on its own.'), field('Leave at', startTime)),
			field('Start from', addressField(startIn, { api: apiBase(), onPick: (it) => { startIn.value = it.label; S.start = it.label; } }), 'Your yard or shop — saved for next time.'),
			h('label', { class: 'ds-check' }, h('input', { type: 'checkbox', checked: true, onchange: (e) => { S.endSame = e.target.checked; endIn.hidden = S.endSame; } }), ' Come back here at the end of the day'), endIn),
		card('2. Stops',
			h('div', { class: 'ds-row ds-wrap' },
				h('button', { class: 'ds-btn ds-sm', onclick: (e) => pull(e.currentTarget) }, '📅 Pull from my calendar'),
				h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => { S.stops.push({ id: ++uid, title: '', address: '', min: 60 }); drawStops(); } }, '+ Add an address')),
			stopsBox),
		h('details', { class: 'ds-hub-card ds-rt-opts', open: !!(S.vehicle || S.wage) },
			h('summary', null, h('b', null, '3. Make it smarter (optional)'), h('small', { class: 'ds-muted' }, ' — fuel, crew cost, lunch, a fixed stop')),
			h('h4', null, '⛽ Vehicle & fuel'), field('What are you driving?', vehSel, 'Its miles per gallon and tank size are used to predict when you’ll need gas.'), custom, vehNote,
			h('label', { class: 'ds-check' }, h('input', { type: 'checkbox', checked: S.trailer, onchange: (e) => { S.trailer = e.target.checked; showVeh(); } }), ' Pulling a trailer (about 25% fewer miles per gallon)'),
			field('Fuel in the tank right now', levelChips),
			h('h4', null, '👷 Crew'), h('div', { class: 'ds-form-grid' }, field('Crew size', h('input', { type: 'number', min: 1, max: 30, value: S.crewSize, oninput: (e) => { S.crewSize = e.target.value; } })), field('Total hourly wage of the whole crew ($)', h('input', { type: 'number', min: 0, step: 0.5, value: S.wage, placeholder: 'e.g. 75', oninput: (e) => { S.wage = e.target.value; } }), 'Everyone added together — paid driving time is part of the cost.')),
			h('h4', null, '🍔 Lunch'), h('div', { class: 'ds-form-grid' }, field('About what time?', h('input', { type: 'time', value: fromMin(S.lunchAt), onchange: (e) => { S.lunchAt = toMin(e.target.value); } })), field('How long?', h('select', { onchange: (e) => { S.lunchLen = +e.target.value; } }, ...[[0, 'No lunch break'], [20, '20 min'], [30, '30 min'], [45, '45 min'], [60, '1 hour']].map(([v, l]) => h('option', { value: v, selected: v === S.lunchLen }, l))))),
			h('label', { class: 'ds-check' }, h('input', { type: 'checkbox', checked: S.nearFood, onchange: (e) => { S.nearFood = e.target.checked; } }), ' Be close to restaurants at lunch'),
			h('h4', null, '📍 A fixed stop'),
			h('label', { class: 'ds-check' }, h('input', { type: 'checkbox', onchange: (e) => { S.meet.on = e.target.checked; meetBox.hidden = !S.meet.on; } }), ' Be near … at … (meet another crew, pick up a part)'), meetBox),
		h('button', { class: 'ds-btn ds-wide ds-rt-go', onclick: (e) => plan(e.currentTarget) }, '🗺️ Plan my route'),
		result);

	function drawStops() {
		stopsBox.innerHTML = '';
		if (!S.stops.length) return put(stopsBox, h('p', { class: 'ds-muted' }, 'No stops yet — pull them from your calendar or add addresses.'));
		S.stops.forEach((s, i) => {
			const a = h('input', { type: 'text', value: s.address, placeholder: '123 Main St, Town, ST', 'aria-label': 'Address', oninput: (e) => { s.address = e.target.value; s.pt = null; } });
			stopsBox.append(h('div', { class: 'ds-rt-stop' + (s.err ? ' bad' : '') },
				h('b', { class: 'ds-rt-n' }, String(i + 1)),
				h('div', { class: 'ds-grow' },
					s.visit ? h('small', null, `📅 ${s.title}${s.visit.start ? ' · booked ' + new Date(s.visit.start).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : ''}`) : h('input', { type: 'text', value: s.title, placeholder: 'Name (optional)', 'aria-label': 'Stop name', oninput: (e) => { s.title = e.target.value; } }),
					addressField(a, { api: apiBase(), onPick: (it) => { a.value = it.label; s.address = it.label; s.pt = it.lat ? { lat: it.lat, lng: it.lng } : null; } }),
					s.err ? h('small', { class: 'ds-pw-block' }, s.err) : null),
				h('label', { class: 'ds-rt-min' }, h('input', { type: 'number', min: 0, max: 720, step: 5, value: s.min, 'aria-label': 'Minutes on site', oninput: (e) => { s.min = +e.target.value || 0; } }), h('small', null, 'min')),
				h('button', { class: 'ds-icon-btn', 'aria-label': 'Remove stop', onclick: () => { S.stops.splice(i, 1); drawStops(); } }, icon('close', 14))));
		});
	}
	async function pull(btn) {
		btn.disabled = true;
		try {
			const r = await api('crm/schedule', { query: { from: S.date, to: S.date + 864e5 - 1 } });
			const crew = ((me.settings && me.settings.crew) || []).filter((c) => (c.team || '').trim() === S.crew).map((c) => c.name);
			const mine = r.items.filter((v) => v.status !== 'cancelled' && v.kind !== 'timeoff' && v.start >= S.date && v.start < S.date + 864e5 && (!S.crew || (v.crew || '').includes(S.crew) || crew.some((n) => (v.crew || '').includes(n))));
			mine.sort((a, c) => a.start - c.start);
			const have = new Set(S.stops.filter((s) => s.visit).map((s) => s.visit.id));
			let added = 0, noAddr = 0;
			for (const v of mine) {
				if (have.has(v.id)) continue;
				const address = v.location || v.address || '';
				if (!address) noAddr++;
				S.stops.push({ id: ++uid, title: v.title + (v.client ? ' – ' + v.client : ''), address, min: Math.max(5, Math.round((v.end - v.start) / 60000)), visit: v, err: address ? '' : 'No address on this job — type it in.' });
				added++;
			}
			toast(added ? `Added ${added} job${added > 1 ? 's' : ''} from ${new Date(S.date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}${S.crew ? ' for ' + S.crew : ''}.${noAddr ? ` ${noAddr} need an address.` : ''}` : 'No (new) jobs on the calendar that day' + (S.crew ? ' for ' + S.crew : '') + '.', 5000);
			drawStops();
		} catch (e) { toast(e.message); }
		btn.disabled = false;
	}

	async function plan(btn) {
		result.innerHTML = '';
		const problems = [];
		if (!S.start.trim()) problems.push('Type where the day starts (your yard or shop).');
		if (!S.endSame && !S.end.trim()) problems.push('Type where the day ends, or tick “Come back here”.');
		const stops = S.stops.filter((s) => s.address.trim());
		if (!stops.length) problems.push('Add at least one stop with an address.');
		if (S.stops.some((s) => !s.address.trim())) problems.push('Some stops have no address — type it in or remove them.');
		if (S.meet.on && !S.meet.address.trim()) problems.push('Type the address for “Be near … at …”.');
		if ((S.level && !S.vehicle) || (S.vehicle && S.vehicle !== '' && !S.mpg)) problems.push('Choose the vehicle (and its MPG) to plan fuel stops.');
		if (problems.length) return put(result, card(null, h('ul', { class: 'ds-pw-issues' }, ...problems.map((p) => h('li', { class: 'ds-pw-bad' }, '✖ ' + p)))));
		savePrefs({ start: S.start, vehicle: S.vehicle, mpg: S.mpg, tank: S.tank, fuel: S.fuel, trailer: S.trailer, crewSize: S.crewSize, wage: S.wage, lunchAt: S.lunchAt, lunchLen: S.lunchLen, nearFood: S.nearFood });
		btn.disabled = true;
		const say = (t) => { btn.textContent = t; };
		try {
			// 1. where everything is
			say('Finding the addresses…');
			const addrs = [S.start, ...stops.map((s) => s.address), ...(S.meet.on ? [S.meet.address] : []), S.endSame ? S.start : S.end].map((a) => a.trim());
			const need = [...new Set(addrs.filter((a, i) => !(i > 0 && i <= stops.length && stops[i - 1].pt)))];
			const g = need.length ? (await api('crm/route/geocode', { body: { addresses: need } })).items : [];
			const where = Object.fromEntries(g.map((x) => [x.address, x.ok ? { lat: x.lat, lng: x.lng } : null]));
			for (const s of S.stops) s.err = '';
			const pts = addrs.map((a, i) => (i > 0 && i <= stops.length && stops[i - 1].pt) || where[a] || null);
			const bad = [];
			pts.forEach((p, i) => { if (!p) { if (i > 0 && i <= stops.length) stops[i - 1].err = 'Couldn’t find this address — check the number, street and town.'; bad.push(addrs[i]); } });
			if (bad.length) { drawStops(); throw new Error(`Couldn’t find ${bad.length} address${bad.length > 1 ? 'es' : ''}: ${bad.join('; ')}.`); }
			// 2. driving distances
			say('Working out driving distances…');
			const n = pts.length - 2; // stops incl. the fixed stop
			let mx = null;
			try { mx = await api('crm/route/matrix', { body: { points: pts.map((p) => [p.lat, p.lng]) } }); } catch (e) { mx = null; }
			const est = estimateMatrix(pts);
			const miles = est.miles.map((row, i) => row.map((m, j) => (mx && mx.miles && mx.miles[i] && mx.miles[i][j] != null ? mx.miles[i][j] : m)));
			const minutes = est.minutes.map((row, i) => row.map((m, j) => (mx && mx.minutes && mx.minutes[i] && mx.minutes[i][j] != null ? mx.minutes[i][j] : m)));
			const source = mx && mx.source && mx.source !== 'estimate' ? (mx.source === 'google' ? 'Google driving distances' : 'OSRM driving distances') : 'estimated road miles (straight line × 1.3)';
			// 3. restaurants near each stop (only if asked)
			let rest = null, restNear = [];
			if (S.nearFood && S.lunchLen) {
				say('Looking for restaurants near your stops…');
				const res = await Promise.all(pts.slice(1, n + 1).map((p) => api('crm/route/places', { body: { lat: p.lat, lng: p.lng, kind: 'food', radius: 4000 } }).catch(() => ({ items: [] }))));
				restNear = res.map((r, i) => { const p = pts[i + 1]; let best = null, bd = Infinity; for (const x of r.items || []) { const d = haversine(p, x) * ROAD_FACTOR; if (d < bd) { bd = d; best = x; } } return best ? { ...best, miles: bd } : null; });
				rest = [0, ...restNear.map((x) => (x ? x.miles : 4)), 0];
			}
			// 4. the best order
			say('Finding the best order…');
			const mpg = S.mpg ? S.mpg * (S.trailer ? 0.75 : 1) : 0;
			const perMile = mpg ? PRICE_GUESS[S.fuel || 'gas'] / mpg : 0;
			const perMin = +S.wage > 0 ? +S.wage / 60 : 0;
			const service = [0, ...stops.map((s) => s.min || 0), ...(S.meet.on ? [S.meet.stay || 0] : []), 0];
			const P = { n, miles, minutes, service, start: S.startTime, perMile, perMin,
				meet: S.meet.on ? { node: n, at: S.meet.at, stay: S.meet.stay } : null,
				lunch: S.lunchLen ? { at: S.lunchAt, len: S.lunchLen, near: !!rest, restMiles: rest } : null };
			const given = stops.map((_, i) => i + 1).concat(S.meet.on ? [n] : []);
			const { best, baseline } = optimize(P, given);
			// 5. fuel
			let fuel = null;
			if (mpg && S.tank && S.level) {
				const fp = fuelPlan(best, { mpg, tank: S.tank, level: S.level });
				fuel = { plan: fp };
				if (fp.need) {
					say('Comparing gas stations…');
					const A = pts[fp.from], B = pts[fp.to];
					const near = await api('crm/route/places', { body: { lat: A.lat, lng: A.lng, kind: 'fuel', radius: 6000 } }).catch(() => ({ items: [] }));
					const key = S.fuel === 'diesel' ? 'diesel' : 'regular';
					const list = (near.items || []).map((x) => ({ ...x, price: x[key] || 0 }));
					fuel.stations = list.length ? rankStations(list, A, B, { mpg, tank: S.tank, gallonsAtA: fp.gallonsBefore, perMin, fuelLabel: key }) : [];
					fuel.prices = !!near.prices;
				}
			}
			showResult({ best, baseline, pts, stops, source, restNear, fuel, P, mpg, perMin });
		} catch (e) { put(result, card(null, h('p', { class: 'ds-pw-block' }, '✖ ' + e.message))); }
		btn.disabled = false;
		btn.textContent = '🗺️ Plan my route';
	}

	function showResult(R) {
		const { best, baseline, pts, stops, source, restNear, fuel, P, mpg, perMin } = R;
		const n = P.n;
		const nameOf = (node) => (node === 0 ? '🏠 Start' : node === n + 1 ? (S.endSame ? '🏠 Back to start' : '🏁 End') : S.meet.on && node === n ? `📍 ${S.meet.address}` : `${stops[node - 1].title || stops[node - 1].address}`);
		const addrOf = (node) => (node === 0 ? S.start : node === n + 1 ? (S.endSame ? S.start : S.end) : S.meet.on && node === n ? S.meet.address : stops[node - 1].address);
		const saved = baseline.miles - best.miles;
		const fuelCost = mpg ? (best.miles / mpg) * PRICE_GUESS[S.fuel || 'gas'] : 0;
		const lines = [];
		let stopNo = 0;
		const fuelLeg = fuel && fuel.plan.need ? fuel.plan.leg : -1;
		let driveIdx = 0;
		for (const e of best.events) {
			if (e.type === 'drive') {
				if (driveIdx === fuelLeg && fuel.stations && fuel.stations[0]) lines.push(h('li', { class: 'ds-rt-fuel' }, h('b', null, `⛽ Fuel stop — ${fuel.stations[0].name}`), h('small', null, `before heading to ${nameOf(e.to)} · see the 3 best options below`)));
				else if (driveIdx === fuelLeg) lines.push(h('li', { class: 'ds-rt-fuel' }, h('b', null, '⛽ Get fuel before this drive'), h('small', null, 'No stations were found nearby — fill up before you leave.')));
				lines.push(h('li', { class: 'ds-rt-drive' }, `🚗 ${e.miles.toFixed(1)} mi · ${Math.round(e.min)} min`));
				driveIdx++;
			} else if (e.type === 'stop') {
				stopNo++;
				lines.push(h('li', { class: 'ds-rt-at' }, h('b', null, `${hhmm(e.at)}${e.min ? '–' + hhmm(e.at + e.min) : ''}  ${stopNo}. ${nameOf(e.node)}`), h('small', null, addrOf(e.node))));
			} else if (e.type === 'wait') lines.push(h('li', { class: 'ds-rt-wait' }, `⏳ ${Math.round(e.min)} min early — wait or take a short break`));
			else if (e.type === 'lunch') {
				const r = restNear && restNear[e.node - 1];
				lines.push(h('li', { class: 'ds-rt-lunch' }, h('b', null, `🍔 Lunch ${hhmm(e.at)}–${hhmm(e.at + e.len + (e.extraMin || 0))}`), h('small', null, r && e.restMiles ? `${r.name} is ${r.miles.toFixed(1)} mi from ${nameOf(e.node)}` : 'At the job site')));
			}
		}
		lines.push(h('li', { class: 'ds-rt-at' }, h('b', null, `${hhmm(best.end)}  ${nameOf(n + 1)}`), h('small', null, addrOf(n + 1))));
		const meetMiss = S.meet.on && best.late > 0;
		const mapBox = h('div', { class: 'ds-rt-map' });
		result.innerHTML = '';
		put(result,
			card('✓ Your route',
				h('div', { class: 'ds-kpis ds-rt-kpis' },
					kpi('🚗', `${best.miles.toFixed(1)} mi`, 'driving'), kpi('⏱️', `${Math.round(best.driveMin)} min`, 'behind the wheel'), kpi('🏁', hhmm(best.end), 'back / done'),
					saved > 0.2 ? kpi('💡', `${saved.toFixed(1)} mi`, 'saved vs the calendar order') : kpi('✓', 'Already', 'in the best order'),
					fuelCost ? kpi('⛽', `≈ $${fuelCost.toFixed(0)}`, 'fuel for the day') : null,
					perMin ? kpi('👷', `≈ $${(best.driveMin * perMin).toFixed(0)}`, 'paid driving time') : null),
				meetMiss ? h('p', { class: 'ds-pw-block' }, `✖ Even the best order reaches ${S.meet.address} ${Math.round(best.late)} min late. Start earlier, move a job to another day, or shorten one.`) : S.meet.on ? h('p', { class: 'ds-pw-okline' }, `✓ At ${S.meet.address} by ${hhmm(S.meet.at)}.`) : null,
				h('ol', { class: 'ds-rt-timeline' }, ...lines),
				h('p', { class: 'ds-hint' }, `Distances: ${source}. Job times from ${stops.some((s) => s.visit) ? 'your calendar' : 'what you typed'}. Traffic isn’t included.`),
				h('div', { class: 'ds-row ds-wrap' },
					h('button', { class: 'ds-btn ds-sm', onclick: () => printSheet(R, nameOf, addrOf, false) }, '🖨️ Print route sheet'),
					h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => printSheet(R, nameOf, addrOf, true) }, '📄 Open as a page (save as PDF / share)'),
					...gmapsLinks(best, pts, n), stops.some((s) => s.visit) ? h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => applyToCalendar(best, stops, n) }, '📅 Update the calendar times') : null)),
			mapBox,
			fuel ? fuelCard(fuel, mpg) : null);
		const map = streetMap(mapBox, { center: [pts[0].lat, pts[0].lng], zoom: 12 });
		const order = [0, ...best.order, n + 1];
		map.setPins(order.map((node, i) => ({ lat: pts[node].lat, lng: pts[node].lng, color: node === 0 || node === n + 1 ? '#1e88e5' : S.meet.on && node === n ? '#e8590c' : '#2fbf71', icon: node === 0 ? '🏠' : node === n + 1 ? '🏁' : String(i), label: nameOf(node) })));
		const lat = pts.map((p) => p.lat), lng = pts.map((p) => p.lng);
		const span = Math.max(Math.max(...lat) - Math.min(...lat), (Math.max(...lng) - Math.min(...lng)) * Math.cos((lat[0] * Math.PI) / 180));
		map.setView([(Math.max(...lat) + Math.min(...lat)) / 2, (Math.max(...lng) + Math.min(...lng)) / 2], Math.max(8, Math.min(16, Math.log2(360 / Math.max(span, 0.005)) - 1.2)));
		result.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}
	function fuelCard(fuel, mpg) {
		const fp = fuel.plan;
		if (!fp.need) return card('⛽ Fuel', h('p', null, `No fuel stop needed. You’ll use about ${fp.usedGallons.toFixed(1)} gal and finish with about ${fp.endGallons.toFixed(1)} gal (${Math.round((fp.endGallons / S.tank) * 8)}/8 of a tank).`), h('p', { class: 'ds-hint' }, `At ${mpg.toFixed(1)} mpg, keeping at least 15% of the tank in reserve.`));
		const st = fuel.stations || [];
		return card('⛽ Best places to get fuel',
			h('p', null, `Your tank drops below the 15% reserve partway through the day (about ${fp.gallonsBefore.toFixed(1)} gal left before that drive). These are the 3 stops with the lowest total cost:`),
			st.length ? h('ol', { class: 'ds-rt-stations' }, ...st.map((s) => h('li', null, h('b', null, s.name), s.address ? h('small', null, ' · ' + s.address) : null, h('div', null, s.line), h('small', { class: 'ds-hint' }, s.why), h('a', { class: 'ds-link', target: '_blank', rel: 'noopener', href: `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}` }, 'Directions')))) : h('p', { class: 'ds-warn' }, 'No gas stations were found near that part of the route — fill up before you leave.'),
			h('p', { class: 'ds-explain' }, '🎯 ', h('b', null, 'How these were chosen: '), 'the goal is the lowest overall cost, not just the lowest price. For each station we add up the fuel you’d buy, the extra fuel to drive there and back to your route, and the crew’s paid time for that detour (from the wage you entered). A cheaper station farther away only wins if it still saves money after all of that.'),
			fuel.prices ? h('small', { class: 'ds-hint' }, 'Gas prices from Google; they can be a few hours old.') : h('small', { class: 'ds-hint' }, 'Live gas prices weren’t available, so stations are ranked by how little extra driving they need. (Prices need a Google Maps key with Places API.)'));
	}
	/**
	 * A one-page route sheet a crew can follow: numbered stops with arrive/leave times, address, phone,
	 * job notes, time on site and the drive to the next stop, lunch / fuel / fixed stop rows, a tick box
	 * per stop, a simple route diagram and space for notes. Print it, or open it as a page to save as PDF.
	 */
	function printSheet(R, nameOf, addrOf, asPage) {
		const { best, pts, stops, fuel, P } = R;
		const n = P.n, esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
		const day = new Date(S.date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
		const rows = [];
		let no = 0, nextDrive = null, driveIdx = 0;
		const fuelLeg = fuel && fuel.plan.need ? fuel.plan.leg : -1;
		const evs = best.events;
		for (let i = 0; i < evs.length; i++) {
			const e = evs[i];
			if (e.type === 'drive') {
				if (driveIdx === fuelLeg) {
					const st = fuel.stations && fuel.stations[0];
					rows.push(`<tr class="x fuel"><td>⛽</td><td></td><td colspan="5"><b>Get fuel${st ? ': ' + esc(st.name) : ''}</b>${st ? ' — ' + esc(st.address || '') + ' · ' + esc(st.line) : ' before this drive'}</td><td class="box">☐</td></tr>`);
				}
				driveIdx++;
				continue;
			}
			// the drive that follows this event (to show "next: x mi")
			nextDrive = evs.slice(i + 1).find((x) => x.type === 'drive');
			const drive = nextDrive ? `${nextDrive.miles.toFixed(1)} mi · ${Math.round(nextDrive.min)} min` : '';
			if (e.type === 'stop') {
				no++;
				const s = e.node <= stops.length ? stops[e.node - 1] : null;
				const v = s && s.visit;
				const meet = S.meet.on && e.node === n;
				rows.push(`<tr${meet ? ' class="x meet"' : ''}><td class="no">${no}</td><td class="t">${hhmm(e.at)}<br><small>to ${hhmm(e.at + e.min)}</small></td><td><b>${esc(meet ? 'Be here by ' + hhmm(S.meet.at) : nameOf(e.node))}</b>${v && v.client ? '<br><small>' + esc(v.client) + '</small>' : ''}</td><td>${esc(addrOf(e.node))}${v && v.phone ? '<br><small>📞 ' + esc(v.phone) + '</small>' : ''}</td><td class="c">${e.min ? Math.round(e.min) + ' min' : ''}</td><td><small>${esc(v ? [v.notes, v.crew ? 'Crew: ' + v.crew : ''].filter(Boolean).join(' · ') : '')}</small></td><td class="c"><small>${drive ? 'Next: ' + drive : ''}</small></td><td class="box">☐</td></tr>`);
			} else if (e.type === 'lunch') {
				const r = R.restNear && R.restNear[e.node - 1];
				rows.push(`<tr class="x lunch"><td>🍔</td><td class="t">${hhmm(e.at)}</td><td colspan="5"><b>Lunch, ${e.len} min</b>${r && e.restMiles ? ' — ' + esc(r.name) + (r.address ? ', ' + esc(r.address) : '') + ` (${r.miles.toFixed(1)} mi away)` : ' — at the job site'}</td><td class="box">☐</td></tr>`);
			} else if (e.type === 'wait') rows.push(`<tr class="x"><td>⏳</td><td class="t">${hhmm(e.at)}</td><td colspan="6">${Math.round(e.min)} min early — wait</td></tr>`);
		}
		// a simple diagram of the route (not to scale with roads — just the order)
		const order = [0, ...best.order, n + 1];
		const la = pts.map((p) => p.lat), lo = pts.map((p) => p.lng), k = Math.cos((la[0] * Math.PI) / 180);
		const x0 = Math.min(...lo), x1 = Math.max(...lo), y0 = Math.min(...la), y1 = Math.max(...la);
		const W = 520, H = 300, sc = Math.min((W - 60) / Math.max(1e-6, (x1 - x0) * k), (H - 60) / Math.max(1e-6, y1 - y0));
		const P2 = (p) => [30 + (p.lng - x0) * k * sc + ((W - 60) - (x1 - x0) * k * sc) / 2, H - 30 - (p.lat - y0) * sc - ((H - 60) - (y1 - y0) * sc) / 2];
		const line = order.map((i) => P2(pts[i]).map((v) => v.toFixed(1)).join(',')).join(' ');
		const dots = order.map((node, i) => { const [x, y] = P2(pts[node]); const lbl = node === 0 ? 'S' : node === n + 1 ? (S.endSame ? '' : 'E') : String(i); return lbl ? `<g><circle cx="${x}" cy="${y}" r="11" fill="${node === 0 || node === n + 1 ? '#1e88e5' : '#1f7a46'}"/><text x="${x}" y="${y + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">${lbl}</text></g>` : ''; }).join('');
		const svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px;border:1px solid #ccc;border-radius:8px"><polyline points="${line}" fill="none" stroke="#1f7a46" stroke-width="2.5" stroke-dasharray="6 4"/>${dots}<text x="${W - 22}" y="20" font-size="12" font-weight="700">N↑</text></svg>`;
		const gm = gmapsLinks(best, pts, n).map((a) => a.href);
		const totals = `${no} stop${no === 1 ? '' : 's'} · ${best.miles.toFixed(1)} mi · ${Math.round(best.driveMin)} min driving · back by ${hhmm(best.end)}`;
		const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Route – ${esc(day)}</title><style>
			body{font:14px/1.4 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111;margin:24px;background:#fff}
			h1{font-size:22px;margin:0}h2{font-size:15px;margin:16px 0 6px}.sub{color:#444;margin:2px 0 10px}
			table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border-bottom:1px solid #bbb;padding:7px 6px;text-align:left;vertical-align:top}
			th{font-size:12px;text-transform:uppercase;letter-spacing:.04em;background:#f1f4f1}td.no{font-size:20px;font-weight:800;text-align:center;width:34px}
			td.t{white-space:nowrap;font-weight:700}td.c{white-space:nowrap}td.box{font-size:22px;text-align:center;width:30px}tr{page-break-inside:avoid}
			tr.x td{background:#fafafa}tr.lunch td{background:#fff8e1}tr.fuel td{background:#fff1e6}tr.meet td{background:#e8f4ff}small{color:#555}
			.top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}.notes{border:1px solid #bbb;border-radius:8px;height:90px;margin-top:6px}
			.links{font-size:11px;word-break:break-all;color:#333}.np{margin:12px 0}.np button{font:inherit;padding:10px 18px;border-radius:999px;border:0;background:#1f7a46;color:#fff;font-weight:700;cursor:pointer}
			@media print{.np{display:none}body{margin:10mm}}
		</style></head><body>
		<p class="np"><button onclick="print()">🖨️ Print</button></p>
		<div class="top"><div><h1>${esc(pro.business || 'Route sheet')}</h1><p class="sub"><b>${esc(day)}</b>${S.crew ? ' · ' + esc(S.crew) : ''} · Leave ${hhmm(P.start)} from ${esc(S.start)}</p><p class="sub">${totals}</p></div>${svg}</div>
		<table><thead><tr><th>#</th><th>Time</th><th>Job</th><th>Address</th><th>On site</th><th>Notes</th><th>Then drive</th><th>Done</th></tr></thead><tbody>
		<tr class="x"><td>🏠</td><td class="t">${hhmm(P.start)}</td><td colspan="5"><b>Leave</b> — ${esc(S.start)}</td><td class="box">☐</td></tr>
		${rows.join('')}
		<tr class="x"><td>🏁</td><td class="t">${hhmm(best.end)}</td><td colspan="5"><b>${S.endSame ? 'Back at the yard' : 'End'}</b> — ${esc(S.endSame ? S.start : S.end)}</td><td class="box">☐</td></tr>
		</tbody></table>
		<h2>Notes</h2><div class="notes"></div>
		<p class="links">Directions: ${gm.map(esc).join('<br>')}</p>
		</body></html>`;
		const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
		if (asPage) { const w = window.open(url, '_blank'); if (!w) location.href = url; return; }
		const fr = document.createElement('iframe');
		fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
		fr.src = url;
		fr.onload = () => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { window.open(url, '_blank'); } setTimeout(() => { fr.remove(); }, 60000); };
		document.body.append(fr);
	}
	const kpi = (e, v, l) => h('div', { class: 'ds-kpi' }, h('span', null, e), h('b', null, v), h('small', null, l));
	function gmapsLinks(best, pts, n) {
		const seq = [0, ...best.order, n + 1].map((i) => `${pts[i].lat},${pts[i].lng}`);
		const links = [];
		// Google Maps links take up to 9 stops in between, so long days are split into parts
		for (let i = 0, part = 1; i < seq.length - 1; i += 10, part++) {
			const chunk = seq.slice(i, Math.min(seq.length, i + 11));
			const url = `https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=${chunk[0]}&destination=${chunk[chunk.length - 1]}${chunk.length > 2 ? '&waypoints=' + encodeURIComponent(chunk.slice(1, -1).join('|')) : ''}`;
			links.push(h('a', { class: 'ds-btn ds-sm', target: '_blank', rel: 'noopener', href: url }, seq.length > 11 ? `🧭 Google Maps (part ${part})` : '🧭 Open in Google Maps'));
		}
		return links;
	}
	function applyToCalendar(best, stops, n) {
		const tell = h('input', { type: 'checkbox' });
		const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
		const go2 = h('button', { class: 'ds-btn ds-wide' }, 'Update the times');
		const changes = best.events.filter((e) => e.type === 'stop' && e.node <= stops.length && stops[e.node - 1].visit).map((e) => ({ v: stops[e.node - 1].visit, start: S.date + e.at * 60000, min: stops[e.node - 1].min }));
		const m = modal(RT.ctx.root, 'Update the calendar', [h('ul', null, ...changes.map((c) => h('li', null, `${c.v.title}: ${new Date(c.v.start).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} → ${new Date(c.start).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`))), h('label', { class: 'ds-check' }, tell, ' Tell the customers about their new times'), go2], close);
		go2.onclick = async () => {
			go2.disabled = true;
			let ok = 0;
			for (const c of changes) {
				const v = c.v;
				try { await api('crm/visit', { body: { id: v.id, quote_id: v.quote_id || 0, client_id: v.client_id || 0, title: v.title, kind: v.kind, location: v.location || '', start: c.start, end: c.start + c.min * 60000, crew: v.crew || '', status: v.status, notes: v.notes || '', notify: tell.checked } }); ok++; } catch (e) { toast(e.message); }
			}
			m.remove();
			toast(`Updated ${ok} appointment${ok === 1 ? '' : 's'}.`);
		};
	}
	drawStops();
	if (view.date) pull(h('button'));
}

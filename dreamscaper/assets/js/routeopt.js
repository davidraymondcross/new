/* DreamScaper – Route planner maths (pure functions, no DOM; unit-tested).
 *
 * Nodes: 0 = start, 1..n = stops, n+1 = end. miles[i][j] / minutes[i][j] = driving between nodes.
 *  estimateMatrix()  straight-line × 1.3 road factor when no routing service is available
 *  simulate()        one order → timeline: drive, work, lunch (optionally near restaurants), the
 *                    "be near X at T" stop (wait if early, penalty if late), totals and cost
 *  optimize()        best order: exhaustive up to 8 stops, otherwise nearest-neighbour + 2-opt + relocate
 *  fuelPlan()        where the tank drops below the reserve (default 15%)
 *  rankStations()    best 3 gas stations by TOTAL cost: fuel bought + fuel for the detour + paid crew time
 */

export const ROAD_FACTOR = 1.3; // typical ratio of road distance to straight-line distance in towns
export function haversine(a, b) {
	const R = 3958.8, rad = Math.PI / 180;
	const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
	const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
	return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}
/** Minutes to drive m road miles: slower on short hops (stop signs, lights), faster on longer runs. */
export const driveMinutes = (m) => (m <= 0 ? 0 : 2 + (m / (m < 3 ? 22 : m < 10 ? 30 : 42)) * 60);
export function estimateMatrix(pts) {
	const n = pts.length, miles = [], minutes = [];
	for (let i = 0; i < n; i++) {
		miles.push([]); minutes.push([]);
		for (let j = 0; j < n; j++) {
			const m = i === j ? 0 : haversine(pts[i], pts[j]) * ROAD_FACTOR;
			miles[i].push(m); minutes[i].push(i === j ? 0 : driveMinutes(m));
		}
	}
	return { miles, minutes };
}

/**
 * P: { n, miles, minutes, service[node] (minutes on site), start (minute of day),
 *      meet: { node, at, stay } | null, lunch: { at, len, near, restMiles[node] } | null,
 *      perMile ($ fuel per mile, optional), perMin ($ crew per minute, optional) }
 * order: the stop nodes in visiting order (1..n).
 */
export function simulate(order, P) {
	const end = P.n + 1;
	let t = P.start, pos = 0, miles = 0, driveMin = 0, waitMin = 0, late = 0, lunchDone = !P.lunch, lunchNode = -1, lunchExtra = 0;
	const events = [];
	const eat = (node) => {
		const lm = P.lunch.near && P.lunch.restMiles && Number.isFinite(P.lunch.restMiles[node]) ? P.lunch.restMiles[node] : 0;
		const extraMi = 2 * lm, extraMin = lm ? 2 * driveMinutes(lm) : 0;
		miles += extraMi; driveMin += extraMin; lunchExtra = extraMi;
		events.push({ type: 'lunch', node, at: t, len: P.lunch.len, extraMi, extraMin, restMiles: lm });
		t += extraMin + P.lunch.len;
		lunchDone = true; lunchNode = node;
	};
	for (const node of [...order, end]) {
		const m = P.miles[pos][node], d = P.minutes[pos][node];
		miles += m; driveMin += d;
		events.push({ type: 'drive', from: pos, to: node, at: t, miles: m, min: d });
		t += d;
		if (node === end) break;
		if (P.meet && node === P.meet.node) {
			if (t < P.meet.at) { events.push({ type: 'wait', node, at: t, min: P.meet.at - t }); waitMin += P.meet.at - t; t = P.meet.at; }
			else if (t > P.meet.at) late += t - P.meet.at;
		}
		events.push({ type: 'stop', node, at: t, min: P.service[node] || 0 });
		t += P.service[node] || 0;
		// lunch after the job that finishes around lunch time (from 15 min early)
		if (!lunchDone && t >= P.lunch.at - 15) eat(node);
		pos = node;
	}
	const day = t - P.start;
	const money = (P.perMile || 0) > 0 || (P.perMin || 0) > 0;
	const cost = money
		? miles * (P.perMile || 0) + day * (P.perMin || 0) + late * 50 + miles * 0.001
		: miles + day * 0.02 + late * 10;
	return { order: [...order], events, miles, driveMin, waitMin, late, end: t, day, cost, lunchNode, lunchExtra };
}

function* permutations(a) {
	if (a.length <= 1) { yield a.slice(); return; }
	for (let i = 0; i < a.length; i++) {
		const rest = a.slice(0, i).concat(a.slice(i + 1));
		for (const p of permutations(rest)) yield [a[i], ...p];
	}
}
/** The best visiting order. Returns { best, baseline } (baseline = the order given, e.g. the calendar's). */
export function optimize(P, given) {
	const stops = given && given.length === P.n ? given.slice() : Array.from({ length: P.n }, (_, i) => i + 1);
	const baseline = simulate(stops, P);
	if (P.n <= 1) return { best: baseline, baseline };
	let best = baseline;
	if (P.n <= 8) {
		for (const o of permutations(stops)) { const s = simulate(o, P); if (s.cost < best.cost - 1e-9) best = s; }
		return { best, baseline };
	}
	// nearest neighbour start
	const left = new Set(stops), nn = [];
	let pos = 0;
	while (left.size) { let b = null, bd = Infinity; for (const x of left) if (P.miles[pos][x] < bd) { bd = P.miles[pos][x]; b = x; } nn.push(b); left.delete(b); pos = b; }
	let cur = simulate(nn, P);
	if (cur.cost < best.cost) best = cur;
	cur = best;
	let improved = true, guard = 0;
	while (improved && guard++ < 200) {
		improved = false;
		const o = cur.order;
		for (let i = 0; i < o.length - 1 && !improved; i++) for (let j = i + 1; j < o.length && !improved; j++) {
			const two = o.slice(0, i).concat(o.slice(i, j + 1).reverse(), o.slice(j + 1));
			const s = simulate(two, P);
			if (s.cost < cur.cost - 1e-9) { cur = s; improved = true; }
		}
		for (let i = 0; i < o.length && !improved; i++) for (let j = 0; j < o.length && !improved; j++) {
			if (i === j) continue;
			const r = o.slice(); const [x] = r.splice(i, 1); r.splice(j, 0, x);
			const s = simulate(r, P);
			if (s.cost < cur.cost - 1e-9) { cur = s; improved = true; }
		}
	}
	return { best: cur.cost < best.cost ? cur : best, baseline };
}

export const LEVELS = [[0.125, '⅛'], [0.25, '¼'], [0.5, '½'], [0.75, '¾'], [1, 'Full']];
/**
 * Walk the day's driving and find where fuel drops below the reserve.
 * v: { mpg, tank, level (0–1) }. Returns { need, leg (index into drive events), from, to, gallonsBefore, endGallons, usedGallons }.
 */
export function fuelPlan(sim, v, reserve = 0.15) {
	let gal = v.level * v.tank;
	const res = reserve * v.tank, drives = sim.events.filter((e) => e.type === 'drive');
	let need = null, used = 0;
	drives.forEach((e, i) => {
		const g = e.miles / v.mpg + (sim.lunchNode === e.from ? sim.lunchExtra / v.mpg : 0);
		if (!need && gal - g < res) { need = { leg: i, from: e.from, to: e.to, gallonsBefore: gal }; gal = v.tank; }
		gal -= g; used += g;
	});
	return { need: !!need, ...(need || {}), endGallons: Math.max(0, gal), usedGallons: used };
}

/**
 * Rank gas stations for a fuel stop between points A and B by total cost.
 * s: [{ name, lat, lng, price }] (price may be missing). o: { mpg, tank, gallonsAtA, perMin, fuelLabel }
 * Returns the best 3 with the numbers and a plain-English reason each.
 */
export function rankStations(list, A, B, o) {
	const direct = haversine(A, B) * ROAD_FACTOR;
	const priced = list.filter((s) => s.price > 0);
	const avg = priced.length ? priced.reduce((t, s) => t + s.price, 0) / priced.length : 0;
	const rows = list.map((s) => {
		const toS = haversine(A, s) * ROAD_FACTOR, sToB = haversine(s, B) * ROAD_FACTOR;
		const detour = Math.max(0, toS + sToB - direct);
		const detourMin = driveMinutes(toS) + driveMinutes(sToB) - driveMinutes(direct);
		const price = s.price > 0 ? s.price : avg;
		// every station is compared on the same purchase (a fill-up from where the tank is at A); the
		// detour's extra fuel and the crew's paid minutes are what farther stations add on top
		const gallons = Math.max(0, Math.min(o.tank, o.tank - o.gallonsAtA));
		const fuel = gallons * price, detourFuel = (detour / o.mpg) * price, crew = Math.max(0, detourMin) * (o.perMin || 0);
		return { ...s, detour, detourMin: Math.max(0, detourMin), gallons, fuel, detourFuel, crew, total: fuel + detourFuel + crew, known: s.price > 0 };
	});
	// with prices: lowest total; without any prices: least extra driving
	rows.sort((a, b) => (priced.length ? a.total - b.total : a.detour - b.detour) || a.detour - b.detour);
	const nearest = rows.slice().sort((a, b) => a.detour - b.detour)[0];
	return rows.slice(0, 3).map((r, i) => {
		const bits = [];
		if (r.known) bits.push(`$${r.price.toFixed(2)}/gal ${o.fuelLabel || ''}`.trim());
		bits.push(r.detour < 0.15 ? 'right on your route' : `${r.detour.toFixed(1)} mi off your route (+${Math.round(r.detourMin)} min)`);
		if (r.known) bits.push(`fill ${r.gallons.toFixed(1)} gal ≈ $${r.fuel.toFixed(2)}`);
		let why;
		if (!priced.length) why = i === 0 ? 'Least extra driving — gas prices weren’t available, so the closest stop to your route costs the least.' : 'A little more driving than the first choice.';
		else if (r === nearest || nearest.total - r.total < 0.5) why = i === 0 ? 'Lowest total cost — and the least extra driving.' : `Close to your route; about $${(r.total - rows[0].total).toFixed(2)} more in total than the first choice.`;
		else if (r.total < nearest.total) why = `Saves about $${(nearest.total - r.total).toFixed(2)} compared with the nearest station (${nearest.name}), even after ${r.detour.toFixed(1)} extra miles and $${(r.crew).toFixed(2)} of paid crew time.`;
		else why = `About $${(r.total - rows[0].total).toFixed(2)} more than the first choice in total.`;
		return { ...r, rank: i + 1, line: bits.join(' · '), why };
	});
}

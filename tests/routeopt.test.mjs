// Run from the repo root: node tests/routeopt.test.mjs dreamscaper
const root = 'file://' + (await import('node:path')).resolve(process.argv[2] || 'dreamscaper');
const R = await import(root + '/assets/js/routeopt.js');
let fail = 0; const t = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
// stops on a line east of the yard: 1 mi apart (≈0.0193° lng at 41.7°N)
const yard = { lat: 41.7, lng: -72.8 };
const at = (mi) => ({ lat: 41.7, lng: -72.8 + mi / (69.17 * Math.cos(41.7 * Math.PI / 180)) });
t(Math.abs(R.haversine(yard, at(5)) - 5) < 0.02, 'haversine ≈ 5 mi');
// calendar order is zig-zag: 4, 1, 3, 2
const pts = [yard, at(4), at(1), at(3), at(2), yard];
const M = R.estimateMatrix(pts);
const base = { n: 4, miles: M.miles, minutes: M.minutes, service: [0, 60, 60, 60, 60, 0], start: 7 * 60, meet: null, lunch: null };
const o = R.optimize(base, [1, 2, 3, 4]);
t(['2,4,3,1', '1,3,4,2'].includes(o.best.order.join()), 'optimal order goes out in a line, either direction (got ' + o.best.order.join() + ')');
t(o.best.miles < o.baseline.miles - 3, `saves miles: ${o.baseline.miles.toFixed(1)} → ${o.best.miles.toFixed(1)}`);
t(Math.abs(o.best.miles - 8 * R.ROAD_FACTOR) < 0.1, 'out and back = 8 mi × road factor');
// meet point: be at node 1 (4 mi out) by 8:00 → must go there first
const meet = R.optimize({ ...base, meet: { node: 1, at: 8 * 60 }, service: [0, 15, 60, 60, 60, 0] }, [1, 2, 3, 4]);
const arrive = meet.best.events.find((e) => e.type === 'stop' && e.node === 1).at;
t(arrive <= 8 * 60 && meet.best.late === 0, 'arrives at the meet point by 8:00 (' + Math.floor(arrive / 60) + ':' + String(Math.round(arrive % 60)).padStart(2, '0') + ')');
// lunch near restaurants: only node 3 has a restaurant close by; lunch should land after node 3
const lunchP = { ...base, service: [0, 90, 90, 90, 90, 0], lunch: { at: 12 * 60, len: 30, near: true, restMiles: [0, 3, 3, 0.2, 3, 0] } };
const L = R.optimize(lunchP, [1, 2, 3, 4]);
t(L.best.lunchNode === 3, 'lunch lands at the stop next to restaurants (node ' + L.best.lunchNode + ')');
const noNear = R.simulate(L.best.order, { ...lunchP, lunch: { ...lunchP.lunch, near: false } });
t(noNear.events.some((e) => e.type === 'lunch' && e.extraMi === 0), 'without the restaurant option lunch is on site');
// fuel: 15 mpg, 25 gal, 1/8 tank = 3.125 gal; reserve 15% = 3.75 → needs fuel before the first leg
const sim = o.best;
const f1 = R.fuelPlan(sim, { mpg: 15, tank: 25, level: 0.125 });
t(f1.need && f1.leg === 0, 'low tank → fuel stop before the first leg');
const f2 = R.fuelPlan(sim, { mpg: 15, tank: 25, level: 1 });
t(!f2.need && Math.abs(f2.endGallons - (25 - sim.miles / 15)) < 1e-6, 'full tank → no stop, ends with ' + f2.endGallons.toFixed(1) + ' gal');
// stations between A and B (2 mi apart): one on route at $3.59, one 1 mi off route at $3.09, one 6 mi off at $2.79
const A = at(0), B = at(2);
const off = (mi, side) => ({ lat: 41.7 + side / 69, lng: at(mi).lng });
const st = [{ name: 'OnRoute', ...at(1), price: 3.59 }, { name: 'Cheap', ...off(1, 0.5), price: 3.09 }, { name: 'FarCheap', ...off(1, 3), price: 2.79 }];
const r = R.rankStations(st, A, B, { mpg: 15, tank: 25, gallonsAtA: 4, perMin: 2, fuelLabel: 'regular' });
t(r.length === 3 && r[0].name === 'Cheap', 'best = cheaper station a little off route (got ' + r.map((x) => x.name + ' $' + x.total.toFixed(2)).join(', ') + ')');
t(/Saves about/.test(r[0].why), 'reason explains the saving: ' + r[0].why);
t(r.find((x) => x.name === 'FarCheap').total > r.find((x) => x.name === 'Cheap').total, 'a far cheaper station loses once driving and crew time count');
const r2 = R.rankStations(st.map((s) => ({ ...s, price: 0 })), A, B, { mpg: 15, tank: 25, gallonsAtA: 4, perMin: 2 });
t(r2[0].name === 'OnRoute' && /prices weren’t available/.test(r2[0].why), 'no prices → least extra driving');
// bigger day: 12 random stops, heuristic beats the given order and stays sane
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const many = [yard, ...Array.from({ length: 12 }, () => ({ lat: 41.6 + rnd() * 0.2, lng: -72.9 + rnd() * 0.2 })), yard];
const MM = R.estimateMatrix(many);
const big = R.optimize({ n: 12, miles: MM.miles, minutes: MM.minutes, service: new Array(14).fill(30), start: 420 }, Array.from({ length: 12 }, (_, i) => i + 1));
t(big.best.miles <= big.baseline.miles && new Set(big.best.order).size === 12, `12 stops: ${big.baseline.miles.toFixed(1)} → ${big.best.miles.toFixed(1)} mi, every stop once`);
console.log(fail ? '\n' + fail + ' FAILED' : '\nALL PASSED');
process.exit(fail ? 1 : 0);

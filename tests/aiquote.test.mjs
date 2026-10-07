// Run from the repo root: node tests/aiquote.test.mjs dreamscaper
const root = 'file://' + (await import('node:path')).resolve(process.argv[2] || 'dreamscaper');
const T = await import(root + '/assets/js/takeoff.js');
let fail = 0;
const items = [{ kind: 'bed', label: 'Front bed', sqft: 300, perimeter_ft: 80, new: true, cover: 'mulch', depth_in: 3, edging: 'steel' }, { kind: 'lawn', sqft: 2000, method: 'sod' }, { kind: 'patio', sqft: 240, perimeter_ft: 64, material: 'Concrete pavers' }, { kind: 'walkway', length_ft: 30, width_ft: 4, material: 'pavers' }, { kind: 'plant', name: 'Boxwood', cat: 'shrubs', count: 6 }, { kind: 'remove', what: 'tree', count: 1 }, { kind: 'wall', length_ft: 20, height_ft: 2 }, { kind: 'light', count: 4, type: 'path light' }];
const plan = T.aiItemsToPlan(items);
const secs = T.planToSections(plan, T.PRICEBOOK);
const bed = plan.shapes[0], m = T.measure(bed);
const ok = (c, s) => { console.log((c ? 'PASS ' : 'FAIL ') + s); if (!c) fail++; };
ok(Math.abs(m.area - 300) < 0.5 && Math.abs(m.perimeter - 80) < 0.5, 'bed rectangle keeps area 300 and perimeter 80: ' + m.area.toFixed(1) + ' / ' + m.perimeter.toFixed(1));
ok(secs.some(s => /New planting bed/.test(s.title)) && secs.some(s => /Mulch/.test(s.title)) && secs.some(s => /Steel edging/.test(s.title)), 'bed → new bed + mulch + edging');
ok(secs.some(s => /sod/.test(s.title)) && secs.some(s => /^Patio/.test(s.title)) && secs.some(s => /^Walkway/.test(s.title)) && secs.some(s => /Retaining wall/.test(s.title)), 'lawn, patio, walkway, wall priced');
ok(secs.some(s => s.title === 'Planting' && s.scope.some(x => /6 × Boxwood/.test(x))), 'plants grouped into Planting');
ok(secs[0].title === 'Removals & site prep' && secs[0].scope.some(x => /tree/.test(x)), 'tree removal first');
ok(secs.some(s => s.title === 'Landscape lighting'), 'lighting');
const pr = T.priceEstimate({ sections: secs }, T.DEFAULT_COSTS);
ok(pr && pr.total > 1000, 'priced from the price book: $' + Math.round(pr.total));
console.log(fail ? '\n' + fail + ' FAILED' : '\nALL PASSED');
process.exit(fail ? 1 : 0);

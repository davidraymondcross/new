// Run from the repo root: node tests/plangen.test.mjs dreamscaper
const root = 'file://' + (await import('node:path')).resolve(process.argv[2] || 'dreamscaper');
const G = await import(root + '/assets/js/plangen.js');
const P = await import(root + '/assets/js/photocheck.js');
let fail = 0; const t = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
// 100 x 150 ft lot, street to the south (y larger). House 50 x 30 in the middle. Driveway on the right.
const trace = {
  street: [50, 160], door: [45, 85],
  boundary: [[0, 0], [100, 0], [100, 150], [0, 150]],
  house: [[25, 55], [75, 55], [75, 85], [25, 85]],
  driveway: [[78, 70], [90, 70], [90, 150], [78, 150]],
  structures: [], trees: [{ pt: [15, 20], w: 25 }]
};
const F = G.frame(trace);
t(Math.abs(F.f[0]) < 1e-9 && F.f[1] > 0.99, 'front axis points to the street (south)');
t(F.r[0] > 0.99, 'right as seen from the street = east when facing north');
t(G.validateTrace(trace, { W: 1280, H: 1280, ppf: 1280 / 300 }).filter(x => x.level === 'bad').length === 0, 'good trace has no blocking issues');
const bad = G.validateTrace({ ...trace, house: [[25, 55], [75, 85], [75, 55], [25, 85]] });
t(bad.some(x => x.part === 'house' && x.level === 'bad'), 'bow-tie house outline is caught');
t(G.validateTrace({ ...trace, street: [50, 70] }).some(x => x.part === 'street' && x.level === 'bad'), 'street point on the house is caught');
t(G.validateTrace({ ...trace, house: [[200, 200], [250, 200], [250, 230]] }).some(x => x.part === 'house' && x.level === 'bad'), 'house outside the lot is caught');
t(G.validateTrace({ ...trace, boundary: [[0, 0], [20, 0], [20, 20]] }).some(x => x.part === 'boundary' && x.level === 'bad'), 'tiny lot is caught');
t(G.validateTrace(trace, { W: 400, H: 400, ppf: 4 }).some(x => x.part === 'boundary' && /edge/.test(x.text)), 'lot touching image edge is caught');
// scale check
t(G.checkScale(20, 20.4).level === 'ok', '2% → ok');
t(G.checkScale(20, 21.6).level === 'warn', '8% → warn, corrected');
t(G.checkScale(20, 30).level === 'bad', '50% → bad');
t(G.checkScale(5, 5).level === 'bad', 'too short reference → bad');
// shots
const shots = G.shotPlan(trace, ['front', 'back']);
t(shots.length === 6, 'front+back = 6 guided photos');
const fr = shots.find(s => s.id === 'front');
t(Math.round(fr.heading) === 0, 'front photo faces north toward the house (' + Math.round(fr.heading) + ')');
t(fr.pos[1] > 150, 'front photo taken from beyond the front line');
t(Math.round(shots.find(s => s.id === 'back').heading) === 180, 'back photo faces south');
// fake library
const mk = (name, cat, w, h, o = {}) => ({ id: name.toLowerCase().replace(/\W+/g, '-'), name, sci: o.sci || name + ' sp', cat, w, h, sun: o.sun || 'FP', zones: o.zones || 'z4-9', ev: !!o.ev, native: !!o.native, deer: !!o.deer, blooms: o.blooms || null, rate: 'medium', upright: !!o.upright });
const lib = [mk('Boxwood', 'evergreens', 3, 3, { ev: true, sci: 'Buxus x' }), mk('Inkberry', 'shrubs', 4, 4, { ev: true, native: true, sci: 'Ilex glabra' }), mk('Spirea', 'shrubs', 3, 3, { blooms: ['pink'], sci: 'Spiraea j' }),
  mk('Catmint', 'perennials', 2, 1.5, { blooms: ['blue'], sci: 'Nepeta x' }), mk('Fountain grass', 'grasses', 2.5, 2.5, { sci: 'Pennisetum a' }), mk('Coneflower', 'perennials', 1.5, 3, { native: true, blooms: ['pink'], sci: 'Echinacea p' }),
  mk('Redbud', 'trees', 20, 22, { native: true, sci: 'Cercis c' }), mk('Arborvitae', 'evergreens', 4, 15, { ev: true, upright: true, sci: 'Thuja o' }), mk('Tropical', 'shrubs', 3, 3, { zones: 'z10-11', sci: 'Hibiscus r' })];
const out = G.generatePlan({ trace, k: 1, base: { W: 1280, H: 1280, ppf: 1280 / 300, where: { lat: 41.7, lng: -72.8 } }, areas: ['front', 'back', 'left', 'right'], style: 'traditional',
  site: { zone: '6b', sill: 3, sun: { front: 'F', back: 'P', left: 'P', right: 'F' }, privacy: true }, lib, shots });
const kinds = out.shapes.reduce((m, s) => (m[s.kind] = (m[s.kind] || 0) + 1, m), {});
console.log('  shapes:', JSON.stringify(kinds));
t(kinds.boundary === 1 && kinds.house === 1 && kinds.driveway === 1, 'base map kept');
t(kinds.bed >= 2, 'foundation beds made');
t(kinds.walkway === 1, 'front walk from door to driveway');
t(kinds.patio === 1, 'back patio');
const plants = out.shapes.filter(s => s.kind === 'plant' && !s.existing);
t(plants.length >= 8, 'plants placed (' + plants.length + ')');
const isIn = (p, poly) => G.inside(p, poly);
t(plants.every(s => isIn(s.pts[0], trace.boundary)), 'every plant inside the property');
t(plants.every(s => !isIn(s.pts[0], trace.house) && !isIn(s.pts[0], trace.driveway)), 'no plant on the house or driveway');
t(!plants.some(s => s.props.name === 'Tropical'), 'zone filter: no zone-10 plant in zone 6');
const front = plants.filter(s => s.props.area === 'front' && s.props.role !== 'accent');
t(front.every(s => s.props.h <= 3), 'front foundation plants stay below the 3 ft window sills');
t(plants.filter(s => s.props.role === 'back').every(s => G.segDist(s.pts[0], [25, 85], [75, 85]) >= s.props.w / 2 + 0.99 || s.props.area !== 'front'), 'shrubs at least half their width + 1 ft from the front wall');
const beds = out.shapes.filter(s => s.kind === 'bed');
t(beds.every(b => b.pts.every(p => isIn(p, trace.boundary) && !isIn(p, trace.driveway))), 'beds stay off the driveway and inside the lot');
const walk = out.shapes.find(s => s.kind === 'walkway');
t(!beds.some(b => b.props.area === 'front' && G.inside(walk.pts[walk.pts.length - 1], b.pts)), 'walk end not inside a bed');
t(plants.some(s => s.props.role === 'screen'), 'privacy screen planted at the back');
t(plants.some(s => s.props.role === 'accent'), 'focal tree in front');
// overlap check: plant centres not closer than 0.9*(r1+r2)
const crowd = []; let overl = 0; for (let i = 0; i < plants.length; i++) for (let j = i + 1; j < plants.length; j++) { const a = plants[i], b = plants[j]; if (!(a.props.role === 'screen' && b.props.role === 'screen') && Math.hypot(a.pts[0][0] - b.pts[0][0], a.pts[0][1] - b.pts[0][1]) < 0.85 * (a.props.w + b.props.w) / 2) { overl++; crowd.push(a.props.role + '/' + b.props.role); } }
console.log('  crowd:', [...new Set(crowd)].join(' '));
t(overl === 0, 'no plants crowd each other (' + overl + ')');
const scr = plants.filter(s => s.props.role === 'screen').sort((a, b) => a.pts[0][0] - b.pts[0][0]);
t(scr.length > 2 && Math.abs(Math.hypot(scr[1].pts[0][0] - scr[0].pts[0][0], scr[1].pts[0][1] - scr[0].pts[0][1]) - 0.8 * scr[0].props.w) < 0.01, 'screen spaced at 80% of mature width');
// scale correction
const out2 = G.generatePlan({ trace, k: 1.05, base: { W: 1280, H: 1280, ppf: 10 }, areas: ['front'], style: 'modern', site: { zone: 6, sun: { front: 'F' } }, lib, shots });
const h2 = out2.shapes.find(s => s.kind === 'house');
t(Math.abs(h2.pts[1][0] - 75 * 1.05) < 1e-9 && Math.abs(out2.bgPpf - 10 / 1.05) < 1e-9, 'tape correction scales shapes and the backdrop together');
t(out2.shapes.filter(s => s.kind === 'bed').every(b => !b.smooth), 'modern = straight beds');
// designs: aerial placement
const d = { kind: 'aerial', title: 'Back idea', shapes: [{ kind: 'bed', pts: [[60, 60], [70, 60], [70, 70]], closed: true, props: {} }], geo: { where: { lat: 41.7, lng: -72.8 }, ppf: 1280 / 300, W: 1280, H: 1280 } };
const pl = G.placeDesign(d, { W: 1280, H: 1280, ppf: 1280 / 300, where: { lat: 41.7, lng: -72.8 } });
t(Math.abs(pl.shapes[0].pts[0][0] - 60) < 1e-6, 'same-centre bird’s-eye Dreamscape lands exactly');
t(G.checkDesign({ ...d, geo: { ...d.geo, where: { lat: 41.8, lng: -72.8 } } }, { where: { lat: 41.7, lng: -72.8 } })[0].level === 'bad', 'Dreamscape of another address is rejected');
t(G.checkDesign({ kind: 'photo', shapes: [] })[0].level === 'bad', 'empty Dreamscape is rejected');
const ph = G.placeDesign({ kind: 'photo', shapes: [{ kind: 'plant', pts: [[0, 20]], props: {} }], geo: { cam: {} } }, null, fr);
t(Math.abs(ph.shapes[0].pts[0][1] - (fr.pos[1] - 20)) < 1e-6, 'photo Dreamscape placed 20 ft in front of the front photo spot');
const withD = G.generatePlan({ trace, base: { W: 1280, H: 1280, ppf: 1280 / 300, where: { lat: 41.7, lng: -72.8 } }, areas: ['front', 'back'], style: 'cottage', site: { zone: 6, sun: {} }, lib, shots, designs: { back: d } });
t(!withD.shapes.some(s => s.kind === 'patio') && withD.shapes.some(s => s.props && s.props.from === 'Back idea'), 'a loaded Dreamscape replaces the generated back yard');
// photo checks
t(P.angleDiff(350, 10) === 20 && P.angleDiff(90, 270) === 180, 'angle difference wraps');
t(P.hamming('ffffffffffffffff', 'fffffffffffffffe') === 1, 'hamming');
const m = { W: 4032, H: 3024, mean: 120, sd: 50, dark: 0.01, bright: 0.01, sharp: 200, hash: 'aaaaaaaaaaaaaaaa' };
t(P.worst(P.checkPhoto(m, {}, { label: 'Front', kind: 'wide' })) === 'ok', 'good photo passes');
t(P.worst(P.checkPhoto({ ...m, sharp: 8 }, {}, { kind: 'wide' })) === 'bad', 'blurry photo fails');
t(P.worst(P.checkPhoto({ ...m, mean: 30, dark: 0.6 }, {}, { kind: 'wide' })) === 'bad', 'dark photo fails');
t(P.checkPhoto({ ...m, W: 3024, H: 4032 }, {}, { kind: 'wide' }).some(x => /portrait/.test(x.text)), 'upright photo warned');
t(P.worst(P.checkPhoto(m, {}, { kind: 'wide', label: 'Back', others: [{ label: 'Front', hash: 'aaaaaaaaaaaaaaab' }] })) === 'bad', 'duplicate of another shot fails');
t(P.worst(P.checkPhoto(m, { lat: 41.9, lng: -72.8 }, { kind: 'wide', property: { lat: 41.7, lng: -72.8 } })) === 'bad', 'photo taken miles away fails');
t(P.checkPhoto(m, { dir: 180 }, { kind: 'wide', heading: 0 }).some(x => /facing south/.test(x.text)), 'wrong compass direction warned');
t(P.checkPhoto(m, { f35: 13 }, { kind: 'wide' }).some(x => /ultra-wide/.test(x.text)), 'ultra-wide lens warned');
// EXIF parser on a hand-built JPEG
const exifJpeg = (() => {
  const le = []; const w16 = (v) => le.push(v & 255, v >> 8); const w32 = (v) => le.push(v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255);
  // TIFF header
  le.push(0x49, 0x49); w16(42); w32(8);
  // IFD0 at 8: 2 entries
  w16(2); w16(0x0112); w16(3); w32(1); w16(6); w16(0); w16(0x8825); w16(4); w32(1); w32(38); w32(0);
  // GPS IFD at 38: 5 entries (lat ref, lat, lng ref, lng, dir) → 2+5*12+4 = 66 → data at 104
  w16(5);
  w16(1); w16(2); w32(2); le.push(78, 0, 0, 0);
  w16(2); w16(5); w32(3); w32(104);
  w16(3); w16(2); w32(2); le.push(87, 0, 0, 0);
  w16(4); w16(5); w32(3); w32(128);
  w16(0x11); w16(5); w32(1); w32(152);
  w32(0);
  // lat 41°42'0" at 104
  w32(41); w32(1); w32(42); w32(1); w32(0); w32(1);
  // lng 72°48'0" at 128
  w32(72); w32(1); w32(48); w32(1); w32(0); w32(1);
  // dir 135 at 152
  w32(135); w32(1);
  const tiff = Uint8Array.from(le);
  const app1 = [0xff, 0xe1, 0, 0, 0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const L = app1.length - 2; app1[2] = L >> 8; app1[3] = L & 255;
  return Uint8Array.from([0xff, 0xd8, ...app1, 0xff, 0xd9]).buffer;
})();
const ex = P.readExif(exifJpeg);
t(Math.abs(ex.lat - 41.7) < 1e-9 && Math.abs(ex.lng + 72.8) < 1e-9 && ex.dir === 135 && ex.orientation === 6, 'EXIF GPS, compass and orientation read (' + JSON.stringify(ex) + ')');
t(Object.keys(P.readExif(new Uint8Array([1, 2, 3, 4]).buffer)).length === 0, 'non-JPEG → no EXIF, no crash');
console.log(fail ? '\n' + fail + ' FAILED' : '\nALL PASSED');
process.exit(fail ? 1 : 0);

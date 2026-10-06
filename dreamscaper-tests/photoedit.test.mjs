import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../dreamscaper/assets/js/photoedit.js';

const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) <= e, `${a} vs ${b}`);
const px = (r, g, b) => new Uint8ClampedArray([r, g, b, 255]);

test('no adjustment leaves pixels unchanged', () => {
	const d = px(10, 120, 240);
	P.adjustPixels(d, {});
	assert.deepEqual([...d], [10, 120, 240, 255]);
	assert.equal(P.hasAdjust({ exposure: 0, focus: 0.5 }), false);
	assert.equal(P.hasAdjust({ contrast: 5 }), true);
});
test('exposure +1 EV (50) doubles; brightness lifts', () => {
	const d = px(50, 60, 70); P.adjustPixels(d, { exposure: 50 });
	assert.deepEqual([...d].slice(0, 3), [100, 120, 140]);
	const e = px(100, 100, 100); P.adjustPixels(e, { brightness: 100 });
	assert.ok(e[0] > 180);
});
test('warm temperature adds red, removes blue; saturation −100 is gray', () => {
	const d = px(128, 128, 128); P.adjustPixels(d, { temp: 100 });
	assert.ok(d[0] > 128 && d[2] < 128);
	const g = px(200, 50, 50); P.adjustPixels(g, { saturation: -100 });
	assert.ok(Math.abs(g[0] - g[1]) <= 1 && Math.abs(g[1] - g[2]) <= 1);
});
test('shadows lift dark more than light; greens boosts green pixels only', () => {
	const dark = px(30, 30, 30), light = px(220, 220, 220);
	P.adjustPixels(dark, { shadows: 100 }); P.adjustPixels(light, { shadows: 100 });
	assert.ok(dark[0] - 30 > light[0] - 220);
	const leaf = px(60, 140, 50), brick = px(150, 70, 60);
	P.adjustPixels(leaf, { greens: 100 }); P.adjustPixels(brick, { greens: 100 });
	assert.ok(leaf[1] > 140);
	assert.deepEqual([...brick].slice(0, 3), [150, 70, 60]);
});
test('hue 360 ≈ identity', () => {
	const d = px(200, 100, 50); P.adjustPixels(d, { hue: 360 });
	assert.ok(Math.abs(d[0] - 200) <= 1 && Math.abs(d[1] - 100) <= 1 && Math.abs(d[2] - 50) <= 1);
});
test('homography maps the 4 corners and inverts', () => {
	const src = [[0, 0], [100, 0], [100, 50], [0, 50]], dst = [[10, 5], [90, 0], [110, 60], [0, 55]];
	const H = P.homography(src, dst);
	src.forEach((p, i) => { const q = P.applyH(H, p); near(q[0], dst[i][0], 1e-6); near(q[1], dst[i][1], 1e-6); });
	const I = P.invert3(H), r = P.applyH(I, P.applyH(H, [37, 21]));
	near(r[0], 37, 1e-6); near(r[1], 21, 1e-6);
});
test('crop to the right half maps points and keeps scale 1', () => {
	const pl = P.planTransform(800, 600, { crop: { x: 0.5, y: 0, w: 0.5, h: 1 } });
	assert.equal(pl.outW, 400); assert.equal(pl.outH, 600);
	const q = pl.map([600, 300]);
	near(q[0], 200, 1e-6); near(q[1], 300, 1e-6);
	near(pl.scale, 1, 1e-6);
});
test('rotate 90° clockwise moves top-left to top-right', () => {
	const pl = P.planTransform(800, 600, { rot90: 1 });
	assert.equal(pl.outW, 600); assert.equal(pl.outH, 800);
	const q = pl.map([0, 0]);
	near(q[0], 600, 1e-6); near(q[1], 0, 1e-6);
});
test('straighten keeps the center fixed and zooms in to hide corners', () => {
	const pl = P.planTransform(800, 600, { angle: 5 });
	const c = pl.map([400, 300]);
	near(c[0], 400, 1e-6); near(c[1], 300, 1e-6);
	assert.ok(pl.scale > 1);
});
test('mapView carries objects, shapes and horizon', () => {
	const view = { kind: 'photo', W: 800, H: 600, cam: { horizon: 250, camH: 5, focal: 628 }, objects: [{ item: 'x', x: 600, y: 400 }], ops: [{ t: 'poly', pts: [[500, 400], [700, 400], [700, 500]] }, { t: 'mask', box: [0, 0, 1, 1] }], meas: [] };
	const pl = P.planTransform(800, 600, { crop: { x: 0.5, y: 0, w: 0.5, h: 1 } });
	const v = P.mapView(view, pl);
	assert.equal(v.objects[0].x, 200);
	assert.deepEqual(v.ops[0].pts[0], [100, 400]);
	assert.equal(v.ops[1].hidden, true);
	assert.equal(v.cam.horizon, 250);
	assert.equal(v.W, 400);
});

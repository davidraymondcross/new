import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as tk from '../dreamscaper/assets/js/takeoff.js';

// siteplan.js imports DOM helpers, so load just its pure geometry helpers.
const src = fs.readFileSync(new URL('../dreamscaper/assets/js/siteplan.js', import.meta.url), 'utf8');
const body = src.slice(src.indexOf('function pointIn')).replace(/^export \{.*$/m, '').replace(/export /g, '');
const { traceMask } = new Function('polyArea', 'centroid', body + '\nreturn { traceMask };')(tk.polyArea, tk.centroid);

const W = 200, H = 200;
const run = (fill) => { const m = new Uint8Array(W * H); let n = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (fill(x, y)) { m[y * W + x] = 1; n++; } return { n, polys: traceMask(m, W, H, 50) }; };
const area = (p) => p.reduce((s, q) => s + tk.polyArea(q), 0);

test('AI Measure tracing keeps the true area of each blob', () => {
	for (const fill of [(x, y) => x >= 20 && x < 80 && y >= 30 && y < 90, (x, y) => (x - 100) ** 2 + (y - 100) ** 2 < 2500, (x, y) => (x >= 10 && x < 60 && y >= 10 && y < 150) || (x >= 10 && x < 150 && y >= 110 && y < 150)]) {
		const { n, polys } = run(fill);
		assert.equal(polys.length, 1);
		assert.ok(Math.abs(area(polys) - n) / n < 0.01);
	}
});
test('separate blobs become separate shapes; specks are ignored', () => {
	const { polys } = run((x, y) => (x >= 5 && x < 40 && y >= 5 && y < 40) || (x >= 100 && x < 190 && y >= 120 && y < 190) || (x === 150 && y === 20));
	assert.equal(polys.length, 2);
});

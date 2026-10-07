/* DreamScaper – a painted sample yard so anyone can start playing instantly. */
import { canvas, rng, hsl } from './util.js?v=2.7.6';
import { fillGround } from './textures.js?v=2.7.6';
import { sprite } from './sprites.js?v=2.7.6';
import { byId } from './library.js?v=2.7.6';

export function sampleYard(W = 1440, H = 960) {
	const c = canvas(W, H);
	const x = c.getContext('2d');
	const R = rng(42);
	const horizon = Math.round(H * 0.44);
	// sky
	const sky = x.createLinearGradient(0, 0, 0, horizon);
	sky.addColorStop(0, '#6fa6d8'); sky.addColorStop(1, '#cfe3f1');
	x.fillStyle = sky; x.fillRect(0, 0, W, horizon + 40);
	for (let i = 0; i < 7; i++) {
		const cx = R() * W, cy = 40 + R() * horizon * 0.45, s = 40 + R() * 70;
		for (let k = 0; k < 7; k++) { x.fillStyle = `rgba(255,255,255,${0.35 + R() * 0.3})`; x.beginPath(); x.ellipse(cx + (R() - 0.5) * s * 2, cy + (R() - 0.5) * s * 0.4, s * (0.5 + R() * 0.6), s * 0.3, 0, 0, 7); x.fill(); }
	}
	// distant tree line
	for (let i = 0; i < 26; i++) {
		const it = byId[R() < 0.3 ? 'white-pine' : R() < 0.5 ? 'sugar-maple' : 'red-maple'];
		const hh = 90 + R() * 80;
		const sp = sprite(it, { w: hh * (it.w / it.h), h: hh, seed: i + 100, season: 'summer', view: 'side', sun: -1 });
		x.globalAlpha = 0.85;
		x.drawImage(sp.c, (i / 26) * W * 1.1 - 60 - sp.ax, horizon + 26 - sp.ay);
	}
	x.globalAlpha = 1;
	const haze = x.createLinearGradient(0, horizon - 160, 0, horizon + 30);
	haze.addColorStop(0, 'rgba(207,227,241,0)'); haze.addColorStop(1, 'rgba(207,227,241,.45)');
	x.fillStyle = haze; x.fillRect(0, horizon - 160, W, 190);
	// lawn with perspective
	const g = { view: 'side', horizon, camH: 5, focal: 0.785 * W, vx: W / 2 };
	fillGround(x, 'lawn', 0, horizon + 18, W, H, g);
	x.fillStyle = 'rgba(90,120,40,.18)'; x.fillRect(0, horizon + 18, W, H);
	// house
	const hx = W * 0.3, hw = W * 0.46, hb = horizon + 64, hh = 200;
	const siding = [45, 18, 88];
	x.fillStyle = hsl(siding, 0); x.fillRect(hx, hb - hh, hw, hh);
	for (let y = hb - hh; y < hb; y += 9) { x.fillStyle = 'rgba(0,0,0,.06)'; x.fillRect(hx, y, hw, 1.5); }
	// roof
	x.fillStyle = '#4b4f55';
	x.beginPath(); x.moveTo(hx - 20, hb - hh); x.lineTo(hx + hw * 0.2, hb - hh - 90); x.lineTo(hx + hw * 0.8, hb - hh - 90); x.lineTo(hx + hw + 20, hb - hh); x.fill();
	for (let y = hb - hh - 86; y < hb - hh; y += 8) { x.fillStyle = 'rgba(255,255,255,.05)'; x.fillRect(hx - 20, y, hw + 40, 2); }
	x.fillStyle = '#7d8a96'; x.fillRect(hx + hw * 0.66, hb - hh - 120, 26, 54);
	// windows & door
	const win = (wx, wy, ww, wh) => {
		x.fillStyle = '#f7f5ef'; x.fillRect(wx - 6, wy - 6, ww + 12, wh + 12);
		const gl = x.createLinearGradient(wx, wy, wx + ww, wy + wh); gl.addColorStop(0, '#5b7a96'); gl.addColorStop(1, '#2d3f52');
		x.fillStyle = gl; x.fillRect(wx, wy, ww, wh);
		x.fillStyle = '#f7f5ef'; x.fillRect(wx + ww / 2 - 2, wy, 4, wh); x.fillRect(wx, wy + wh / 2 - 2, ww, 4);
		x.fillStyle = '#26404f'; x.fillRect(wx - 26, wy - 6, 18, wh + 12); x.fillRect(wx + ww + 8, wy - 6, 18, wh + 12);
	};
	win(hx + hw * 0.1, hb - hh + 30, 54, 66); win(hx + hw * 0.72, hb - hh + 30, 54, 66);
	win(hx + hw * 0.32, hb - hh + 30, 48, 60); win(hx + hw * 0.1, hb - 88, 54, 62); win(hx + hw * 0.72, hb - 88, 54, 62); win(hx + hw * 0.32, hb - 88, 48, 62);
	x.fillStyle = '#7a2e2a'; x.fillRect(hx + hw * 0.52, hb - 92, 40, 92);
	x.fillStyle = '#f7f5ef'; x.fillRect(hx + hw * 0.52 - 6, hb - 98, 52, 6);
	x.fillStyle = '#d8b25a'; x.beginPath(); x.arc(hx + hw * 0.52 + 32, hb - 46, 3, 0, 7); x.fill();
	// foundation, steps, walk
	x.fillStyle = '#8f8a82'; x.fillRect(hx, hb - 16, hw, 16);
	x.fillStyle = '#b9b3a8'; x.fillRect(hx + hw * 0.52 - 14, hb - 6, 68, 10);
	x.fillStyle = '#c9c2b5';
	x.beginPath(); x.moveTo(hx + hw * 0.52 - 4, hb + 4); x.lineTo(hx + hw * 0.52 + 44, hb + 4); x.lineTo(W * 0.62 + 120, H); x.lineTo(W * 0.62 - 120, H); x.fill();
	// driveway
	x.fillStyle = '#6d6c69';
	x.beginPath(); x.moveTo(hx + hw + 30, hb - 6); x.lineTo(hx + hw + 210, hb - 6); x.lineTo(W + 200, H); x.lineTo(W * 0.86, H); x.fill();
	// tired foundation shrubs to remove or replace
	for (let i = 0; i < 4; i++) {
		const it = byId.yew;
		const sp = sprite(it, { w: 66, h: 40, seed: 300 + i, season: 'summer', view: 'side', sun: -1 });
		x.drawImage(sp.c, hx + 40 + i * (i > 1 ? 90 : 70) + (i > 1 ? 120 : 0) - sp.ax, hb + 10 - sp.ay);
	}
	// a few dandelions & bare patches for the magic eraser
	for (let i = 0; i < 9; i++) {
		const px = W * 0.1 + R() * W * 0.45, py = horizon + 260 + R() * (H - horizon - 300), r = 3 + (py - horizon) * 0.014;
		x.fillStyle = '#f2cf24'; x.beginPath(); x.arc(px, py, r, 0, 7); x.fill();
		x.fillStyle = 'rgba(0,0,0,.15)'; x.beginPath(); x.arc(px + r * 0.3, py + r * 0.3, r * 0.5, 0, 7); x.fill();
	}
	x.fillStyle = 'rgba(150,120,70,.55)';
	x.beginPath(); x.ellipse(W * 0.2, H * 0.84, 110, 26, 0.1, 0, 7); x.fill();
	return { c, horizon };
}

/* DreamScaper – a small street map with no outside libraries.
 *
 * Raster tiles in Web Mercator (OpenStreetMap by default, any {z}/{x}/{y} provider the site owner
 * sets), smooth zoom with the mouse wheel / pinch / buttons, drag to pan, pins, "where am I", and a
 * tap callback with the latitude/longitude tapped. Used by the door-to-door canvassing map.
 *
 *   const map = streetMap(el, { center: [lat, lng], zoom: 17, tiles: { url, attr, max }, onTap, onMove })
 *   map.setPins([{ id, lat, lng, color, icon, label, ring }]); map.setView([lat, lng], zoom); map.bounds();
 */
import { h, put } from './util.js?v=2.7.8';

const TS = 256;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** lat/lng → world pixels at zoom z. */
function project(lat, lng, z) {
	const s = TS * Math.pow(2, z), sin = Math.sin((clamp(lat, -85.05, 85.05) * Math.PI) / 180);
	return [((lng + 180) / 360) * s, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s];
}
/** world pixels at zoom z → lat/lng. */
function unproject(x, y, z) {
	const s = TS * Math.pow(2, z), n = Math.PI - (2 * Math.PI * y) / s;
	return [(180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))), (x / s) * 360 - 180];
}

export { project as worldPx, unproject as worldLatLng, TS as TILE_SIZE };
/** Ground feet per screen pixel at zoom z and latitude lat (Web Mercator). */
export const ftPerPx = (lat, z) => (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (TS * Math.pow(2, z)) * 3.28084;

/**
 * One picture of the map between two corners, built from the same tiles (same site → not tainted).
 * Picks the sharpest zoom ≤ max where the picture stays under maxPx on its longest side.
 * Returns { canvas, W, H, z, ox, oy, ppf } — (ox, oy) is the picture's top-left in world pixels at z.
 */
export async function captureArea(url, max, north, west, south, east, maxPx = 3600, timeout = 20000) {
	let z = max;
	for (; z > 10; z--) {
		const a = project(north, west, z), b = project(south, east, z);
		if (b[0] - a[0] <= maxPx && b[1] - a[1] <= maxPx) break;
	}
	const a = project(north, west, z), b = project(south, east, z);
	const ox = Math.floor(a[0]), oy = Math.floor(a[1]), W = Math.ceil(b[0] - ox), H = Math.ceil(b[1] - oy);
	const c = document.createElement('canvas');
	c.width = W; c.height = H;
	const x = c.getContext('2d');
	x.fillStyle = '#c9d2c9'; x.fillRect(0, 0, W, H);
	const jobs = [];
	for (let ty = Math.floor(oy / TS); ty <= Math.floor((oy + H) / TS); ty++) {
		for (let tx = Math.floor(ox / TS); tx <= Math.floor((ox + W) / TS); tx++) {
			jobs.push(new Promise((ok) => {
				const im = new Image();
				im.onload = () => { x.drawImage(im, tx * TS - ox, ty * TS - oy, TS, TS); ok(true); };
				im.onerror = () => ok(false);
				im.src = url.replace('{z}', z).replace('{x}', tx).replace('{y}', ty);
			}));
		}
	}
	const got = await Promise.race([Promise.all(jobs), new Promise((r) => setTimeout(() => r(null), timeout))]);
	const lat = (north + south) / 2;
	return { canvas: c, W, H, z, ox, oy, ppf: 1 / ftPerPx(lat, z), loaded: got ? got.filter(Boolean).length : 0, total: jobs.length };
}

export function streetMap(el, o) {
	const tiles = o.tiles || { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attr: '© OpenStreetMap contributors', max: 19 };
	const maxZ = tiles.max || 19, minZ = o.minZoom || 3;
	let center = o.center || [39.5, -98.35], zoom = clamp(o.zoom || 4, minZ, maxZ + 1);
	const tileLayer = h('div', { class: 'ds-map-tiles' });
	const pinLayer = h('div', { class: 'ds-map-pins' });
	// optional drawing layer (o.draw(ctx2d, api) runs after every move / zoom / redraw)
	const cv = o.draw ? h('canvas', { class: 'ds-map-draw' }) : null;
	const me = h('div', { class: 'ds-map-me', hidden: true, 'aria-hidden': 'true' });
	const box = h('div', { class: 'ds-map', tabindex: 0, role: 'application', 'aria-label': 'Map. Drag to move, scroll or pinch to zoom, tap a house to mark it. Arrow keys move, plus and minus zoom.' },
		tileLayer, cv, pinLayer, me,
		h('div', { class: 'ds-map-zoom' },
			h('button', { type: 'button', 'aria-label': 'Zoom in', onclick: () => zoomAt(zoom + 1) }, '+'),
			h('button', { type: 'button', 'aria-label': 'Zoom out', onclick: () => zoomAt(zoom - 1) }, '−')),
		h('div', { class: 'ds-map-attr' }, tiles.attr || ''));
	el.append(box);
	const imgs = new Map();
	let pins = [], W = 0, H = 0, raf = 0;

	const size = () => { const r = box.getBoundingClientRect(); W = r.width; H = r.height; };
	const centerPx = (z) => project(center[0], center[1], z);
	function draw() {
		raf = 0;
		size();
		if (!W || !H) return;
		const tz = clamp(Math.round(zoom), minZ, maxZ), k = Math.pow(2, zoom - tz);
		const [cx, cy] = centerPx(tz);
		const left = cx - W / 2 / k, top = cy - H / 2 / k, n = Math.pow(2, tz);
		const x0 = Math.floor(left / TS), y0 = Math.floor(top / TS), x1 = Math.floor((left + W / k) / TS), y1 = Math.floor((top + H / k) / TS);
		const want = new Set();
		for (let ty = Math.max(0, y0); ty <= Math.min(n - 1, y1); ty++) {
			for (let tx = x0; tx <= x1; tx++) {
				const wx = ((tx % n) + n) % n, key = `${tz}/${wx}/${ty}`;
				want.add(key + ':' + tx);
				let im = imgs.get(key + ':' + tx);
				if (!im) {
					im = h('img', { alt: '', draggable: 'false', decoding: 'async' });
					im.src = tiles.url.replace('{z}', tz).replace('{x}', wx).replace('{y}', ty).replace('{s}', 'abc'[(wx + ty) % 3]);
					im.onerror = () => { im.style.visibility = 'hidden'; };
					imgs.set(key + ':' + tx, im);
					tileLayer.append(im);
				}
				im.style.transform = `translate(${(tx * TS - left) * k}px, ${(ty * TS - top) * k}px) scale(${k})`;
			}
		}
		for (const [key, im] of imgs) if (!want.has(key)) { im.remove(); imgs.delete(key); }
		drawPins();
		if (cv) {
			const dpr = window.devicePixelRatio || 1;
			if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px'; }
			const x = cv.getContext('2d');
			x.setTransform(dpr, 0, 0, dpr, 0, 0);
			x.clearRect(0, 0, W, H);
			o.draw(x, api);
		}
	}
	const redraw = () => { if (!raf) raf = requestAnimationFrame(draw); };
	/** Screen position (px inside the map) of a lat/lng. */
	function toScreen(lat, lng) {
		const [px, py] = project(lat, lng, zoom), [cx, cy] = centerPx(zoom);
		return [px - cx + W / 2, py - cy + H / 2];
	}
	function toLatLng(sx, sy) {
		const [cx, cy] = centerPx(zoom);
		return unproject(cx + sx - W / 2, cy + sy - H / 2, zoom);
	}
	function drawPins() {
		pinLayer.innerHTML = '';
		const small = zoom < 15.5;
		for (const p of pins) {
			const [x, y] = toScreen(p.lat, p.lng);
			if (x < -30 || y < -30 || x > W + 30 || y > H + 30) continue;
			const b = h('button', { type: 'button', class: 'ds-pin' + (small ? ' sm' : '') + (p.ring ? ' ring' : ''), style: { left: x + 'px', top: y + 'px', background: p.color || '#2fbf71' }, title: p.label || '', 'aria-label': p.label || 'Marked house', onclick: (e) => { e.stopPropagation(); if (o.onPin) o.onPin(p); } },
				small ? null : h('span', { 'aria-hidden': 'true' }, p.icon || ''));
			pinLayer.append(b);
		}
		if (myPos) { const [x, y] = toScreen(myPos[0], myPos[1]); me.hidden = false; me.style.left = x + 'px'; me.style.top = y + 'px'; }
	}
	let moveT = 0;
	const moved = () => { redraw(); clearTimeout(moveT); moveT = setTimeout(() => o.onMove && o.onMove(api.bounds()), 250); };
	/** Zoom to z keeping the screen point (sx, sy) fixed. */
	function zoomAt(z, sx = W / 2, sy = H / 2) {
		z = clamp(z, minZ, maxZ + 1);
		const at = toLatLng(sx, sy);
		zoom = z;
		const [ax, ay] = project(at[0], at[1], zoom);
		center = unproject(ax - (sx - W / 2), ay - (sy - H / 2), zoom);
		moved();
	}

	// pointer: drag to pan, two fingers to pinch, a short tap = onTap(lat, lng)
	const ptr = new Map();
	let drag = null, pinch = null;
	box.addEventListener('pointerdown', (e) => {
		if (e.target.closest('button')) return;
		box.setPointerCapture(e.pointerId);
		ptr.set(e.pointerId, [e.clientX, e.clientY]);
		if (ptr.size === 2) {
			const [a, b] = [...ptr.values()];
			pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: zoom };
			drag = null;
		} else drag = { x: e.clientX, y: e.clientY, c: centerPx(zoom), moved: false };
	});
	box.addEventListener('pointermove', (e) => {
		if (!ptr.has(e.pointerId)) return;
		ptr.set(e.pointerId, [e.clientX, e.clientY]);
		if (pinch && ptr.size === 2) {
			const [a, b] = [...ptr.values()], r = box.getBoundingClientRect();
			zoomAt(pinch.z + Math.log2(Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d), (a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top);
			return;
		}
		if (!drag) return;
		const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
		if (Math.hypot(dx, dy) > 6) drag.moved = true;
		if (drag.moved) { center = unproject(drag.c[0] - dx, drag.c[1] - dy, zoom); moved(); }
	});
	const up = (e) => {
		ptr.delete(e.pointerId);
		if (ptr.size < 2) pinch = null;
		if (drag && !drag.moved && e.type === 'pointerup' && o.onTap) {
			const r = box.getBoundingClientRect();
			const [lat, lng] = toLatLng(e.clientX - r.left, e.clientY - r.top);
			o.onTap(lat, lng, e.clientX - r.left, e.clientY - r.top);
		}
		drag = null;
	};
	box.addEventListener('pointerup', up);
	box.addEventListener('pointercancel', up);
	box.addEventListener('wheel', (e) => {
		e.preventDefault();
		const r = box.getBoundingClientRect();
		const dy = clamp(e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY, -240, 240);
		zoomAt(zoom - dy * (e.ctrlKey ? 0.01 : 0.003), e.clientX - r.left, e.clientY - r.top);
	}, { passive: false });
	if (!o.noDblZoom) box.addEventListener('dblclick', (e) => { const r = box.getBoundingClientRect(); zoomAt(zoom + 1, e.clientX - r.left, e.clientY - r.top); });
	box.addEventListener('keydown', (e) => {
		const step = 80, c = centerPx(zoom);
		const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
		if (mv) { e.preventDefault(); center = unproject(c[0] + mv[0], c[1] + mv[1], zoom); moved(); }
		if (e.key === '+' || e.key === '=') zoomAt(zoom + 1);
		if (e.key === '-') zoomAt(zoom - 1);
	});
	const ro = new ResizeObserver(() => redraw());
	ro.observe(box);

	let myPos = null, watch = null;
	const api = {
		el: box,
		setView(c, z) { center = c; if (z != null) zoom = clamp(z, minZ, maxZ + 1); moved(); },
		setPins(list) { pins = list || []; drawPins(); },
		/** Screen position (px inside the map) of a point, and back. */
		project: (lat, lng) => toScreen(lat, lng),
		unproject: (x, y) => toLatLng(x, y),
		redraw,
		get size() { return [W, H]; },
		bounds() { const [n, w] = toLatLng(0, 0), [s, e] = toLatLng(W, H); return { south: s, west: w, north: n, east: e }; },
		get zoom() { return zoom; },
		get center() { return center; },
		/** Follow the phone's location (asks permission). Resolves with the first fix. */
		locate() {
			return new Promise((ok, bad) => {
				if (!navigator.geolocation) return bad(new Error('Location isn’t available on this device.'));
				let first = true;
				if (watch != null) navigator.geolocation.clearWatch(watch);
				watch = navigator.geolocation.watchPosition((p) => {
					myPos = [p.coords.latitude, p.coords.longitude];
					if (first) { first = false; api.setView(myPos, Math.max(zoom, 18)); ok(myPos); } else drawPins();
				}, (err) => { if (first) bad(new Error(err.code === 1 ? 'Allow location access to see where you are.' : 'Couldn’t find your location.')); }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 });
			});
		},
		destroy() { ro.disconnect(); if (watch != null) navigator.geolocation.clearWatch(watch); box.remove(); }
	};
	redraw();
	return api;
}

/**
 * Instructions that float on top of a map: a numbered list with a title, which folds into a small
 * "📋 Show steps" pill (and fades while the map is being dragged) so it never blocks the work.
 */
export function floatGuide(title, steps, onToggle, extra) {
	const list = h('ol', null, ...steps.map((t) => h('li', null, t)));
	const body = h('div', { class: 'ds-fg-body' }, list, extra || null);
	const box = h('div', { class: 'ds-fg' });
	const head = h('button', { type: 'button', class: 'ds-fg-head', 'aria-expanded': 'true', onclick: () => { box.classList.toggle('min'); head.setAttribute('aria-expanded', box.classList.contains('min') ? 'false' : 'true'); onToggle && onToggle(); } }, h('b', null, '📋 ', title), h('span', { class: 'ds-fg-tog' }));
	put(box, head, body);
	// small screens: fold away once the map is being used (the bar at the bottom keeps the next step in view)
	const arm = () => {
		const host = box.parentElement;
		if (!host) return requestAnimationFrame(arm);
		host.addEventListener('pointerdown', (e) => { if (!box.folded && !box.contains(e.target) && host.offsetWidth < 600) { box.folded = true; box.classList.add('min'); } }, true);
	};
	requestAnimationFrame(arm);
	box.setSteps = (t2, s2, ex) => { head.querySelector('b').textContent = '📋 ' + t2; list.innerHTML = ''; s2.forEach((x) => list.append(h('li', null, x))); if (ex !== undefined) { body.innerHTML = ''; put(body, list, ex); } };
	return box;
}

/* DreamScaper – small shared helpers */

/** Deterministic PRNG so every plant keeps its own look across redraws. */
export function rng(seed) {
	let a = seed >>> 0;
	const f = () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	f.range = (lo, hi) => lo + f() * (hi - lo);
	f.int = (lo, hi) => Math.floor(lo + f() * (hi - lo + 1));
	f.pick = (arr) => arr[Math.floor(f() * arr.length)];
	f.jit = (v, amt) => v + (f() * 2 - 1) * amt;
	return f;
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** HSL helpers. Colors are [h, s, l] arrays. */
export function hsl(c, dl = 0, a = 1, ds = 0, dh = 0) {
	const h = (c[0] + dh + 360) % 360;
	const s = clamp(c[1] + ds, 0, 100);
	const l = clamp(c[2] + dl, 0, 100);
	return a >= 1 ? `hsl(${h.toFixed(1)} ${s.toFixed(1)}% ${l.toFixed(1)}%)` : `hsl(${h.toFixed(1)} ${s.toFixed(1)}% ${l.toFixed(1)}% / ${a})`;
}
export function mix(c1, c2, t) {
	let dh = c2[0] - c1[0];
	if (dh > 180) dh -= 360;
	if (dh < -180) dh += 360;
	return [(c1[0] + dh * t + 360) % 360, lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

export function canvas(w, h) {
	const c = document.createElement('canvas');
	c.width = Math.max(1, Math.round(w));
	c.height = Math.max(1, Math.round(h));
	return c;
}

/** Tiny DOM builder: h('button', {class:'x', onclick}, 'Label') */
export function h(tag, props, ...kids) {
	const el = document.createElement(tag);
	if (props) {
		for (const k in props) {
			const v = props[k];
			if (v == null || v === false) continue;
			if (k === 'class') el.className = v;
			else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
			else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
			else if (k === 'html') el.innerHTML = v;
			else if (v === true) el.setAttribute(k, '');
			else el.setAttribute(k, v);
		}
	}
	for (const kid of kids.flat()) {
		if (kid == null || kid === false) continue;
		el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
	}
	return el;
}

/** el.append() that skips null/false (native append would print "null"). */
export function put(el, ...kids) { el.append(...kids.flat().filter((k) => k != null && k !== false)); return el; }

export function debounce(fn, ms) {
	let t;
	const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
	d.flush = (...a) => { clearTimeout(t); fn(...a); };
	return d;
}

export function canvasToBlob(c, type = 'image/jpeg', q = 0.92) {
	return new Promise((res) => c.toBlob(res, type, q));
}

export async function blobToBitmap(blob) {
	if ('createImageBitmap' in window) return createImageBitmap(blob);
	const url = URL.createObjectURL(blob);
	const img = new Image();
	await new Promise((ok, bad) => { img.onload = ok; img.onerror = bad; img.src = url; });
	URL.revokeObjectURL(url);
	return img;
}

/** Smooth closed/open path through points (Catmull-Rom → Bezier). */
export function smoothPath(ctx, pts, closed) {
	const n = pts.length;
	if (n < 2) return;
	ctx.moveTo(pts[0][0], pts[0][1]);
	if (n === 2) { ctx.lineTo(pts[1][0], pts[1][1]); return; }
	const get = (i) => closed ? pts[(i + n) % n] : pts[clamp(i, 0, n - 1)];
	const last = closed ? n : n - 1;
	for (let i = 0; i < last; i++) {
		const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
		ctx.bezierCurveTo(
			p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
			p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6,
			p2[0], p2[1]
		);
	}
	if (closed) ctx.closePath();
}

export const ICONS = {
	bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
	chat: '<path d="M4 5h16v11H9l-5 4z"/>',
	history: '<path d="M4 12a8 8 0 1 0 2.3-5.6L4 8.7"/><path d="M4 4v4.7h4.7M12 8v4.5l3 2"/>',
	star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
	tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
	folder: '<path d="M3 6h6l2 2h10v11H3z"/>',
	select: '<path d="M5 3l14 8-6 2-2 6z"/>',
	plant: '<path d="M12 21v-8M12 13c0-4 3-7 7-7 0 4-3 7-7 7zM12 15c0-3-2.5-5.5-6-5.5 0 3 2.5 5.5 6 5.5z"/>',
	paint: '<path d="M4 20c2 0 4-1 4-4l9-9-3-3-9 9c-3 0-4 2-4 4zM14 4l3 3"/>',
	bed: '<path d="M4 15c0-5 5-9 9-8s7 4 6 8-6 5-9 4-6 1-6-4z"/><circle cx="4" cy="15" r="1.5"/><circle cx="13" cy="7" r="1.5"/><circle cx="19" cy="15" r="1.5"/>',
	eraser: '<path d="M8 20h12M5 15l9-9 5 5-9 9H8z"/><path d="M12 8l5 5"/><path d="M3 5l1 1M6 2l.5 1.5M2 8.5l1.5.5" />',
	scale: '<path d="M4 18h16M7 18V9M7 9l-2 2M7 9l2 2"/><circle cx="16" cy="7" r="2"/><path d="M16 9v5M14 18l2-4 2 4"/>',
	hand: '<path d="M8 13V6a1.5 1.5 0 013 0v5M11 11V4.5a1.5 1.5 0 013 0V11M14 11V6a1.5 1.5 0 013 0v7c0 4-3 7-6.5 7S6 18 5 16l-2-4a1.5 1.5 0 012.5-1.5L8 13"/>',
	undo: '<path d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-2"/>',
	redo: '<path d="M15 14l5-5-5-5M20 9H10a6 6 0 000 12h2"/>',
	moon: '<path d="M20 15A8 8 0 019 4a8 8 0 1011 11z"/>',
	sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',
	play: '<path d="M7 4l13 8-13 8z"/>',
	pause: '<path d="M7 4v16M17 4v16"/>',
	close: '<path d="M6 6l12 12M18 6L6 18"/>',
	plus: '<path d="M12 5v14M5 12h14"/>',
	minus: '<path d="M5 12h14"/>',
	fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
	download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
	send: '<path d="M4 12l16-8-6 16-3-6z"/>',
	trash: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
	copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>',
	flip: '<path d="M12 3v18M8 7L3 12l5 5V7zM16 7l5 5-5 5V7z"/>',
	front: '<rect x="4" y="4" width="10" height="10" rx="1"/><rect x="10" y="10" width="10" height="10" rx="1" fill="currentColor"/>',
	camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="4"/>',
	upload: '<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>',
	globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
	map: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
	pencil: '<path d="M4 20l1-5L16 4l4 4L9 19z"/>',
	home: '<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/>',
	wand: '<path d="M4 20L15 9M17 3v3M20 6h-3M14 4l1.5 1.5M20 10l-1.5-1.5"/><path d="M13 11l2-2"/>',
	brush: '<path d="M14 4l6 6-8 8-6-6z"/><path d="M6 12l-3 8 8-3"/>',
	check: '<path d="M5 12l5 5 9-10"/>',
	mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3M8 21h8"/>',
	crop: '<path d="M6 2v14a2 2 0 002 2h14M2 6h14a2 2 0 012 2v14"/>',
	image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
	edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
	leaf: '<path d="M5 19C5 10 11 5 20 4c-1 9-6 15-15 15zM5 19l8-8"/>',
	person: '<circle cx="12" cy="5" r="2.2"/><path d="M12 8v7M8 11h8M10 21l2-6 2 6"/>',
	sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
	share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/>',
	print: '<path d="M7 9V3h10v6M7 17H4v-7h16v7h-3"/><rect x="7" y="14" width="10" height="7"/>',
	cloud: '<path d="M7 18h10a4 4 0 00.5-8A6 6 0 006 9.5 4.3 4.3 0 007 18z"/>',
	target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
	search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
	layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
	eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
	lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
	link: '<path d="M10 14a4 4 0 006 0l3-3a4 4 0 00-6-6l-1 1M14 10a4 4 0 00-6 0l-3 3a4 4 0 006 6l1-1"/>',
	compare: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 2v20M8 10l-2 2 2 2M16 10l2 2-2 2"/>',
	menu: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
	ruler: '<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>',
	adjust: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
	shapes: '<path d="M4 15c0-5 5-9 9-8s7 4 6 8-6 5-9 4-6 1-6-4z"/>',
	board: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="10" width="8" height="11" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/>',
	versions: '<rect x="7" y="3" width="13" height="13" rx="2"/><path d="M4 7v12a1 1 0 001 1h12"/>'
};

export function icon(name, size = 22) {
	const span = document.createElement('span');
	span.className = 'ic';
	span.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
	return span;
}

/** US states and territories [abbreviation, name] — DreamScaper works anywhere in the US. */
export const US_STATES = [['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'], ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'], ['DC', 'District of Columbia'], ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'], ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'], ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'], ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'], ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'], ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'], ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'], ['PR', 'Puerto Rico']];
export const stateName = (ab) => (US_STATES.find((x) => x[0] === String(ab || '').toUpperCase()) || [])[1] || '';
/** A <select> of US states (value = 2-letter code). */
export function stateSelect(value, attrs = {}) {
	return h('select', { 'aria-label': 'State', autocomplete: 'address-level1', ...attrs }, h('option', { value: '' }, 'State…'), ...US_STATES.map(([a, n]) => h('option', { value: a, selected: a === String(value || '').toUpperCase() }, n)));
}

/* DreamScaper – checks a site photo before the Landscape Plan wizard accepts it.
 *
 * Everything here runs in the browser in a few milliseconds, with no AI and no upload:
 *  - EXIF: where (GPS), which way the phone faced (compass), when, and which lens (35 mm focal length)
 *  - size, sideways vs upright, sharpness (variance of the Laplacian), too dark / too bright
 *  - duplicates (a 64-bit difference hash compared with the other photos)
 * checkPhoto() turns the numbers into plain-English results: ok / warn / bad, each with how to fix it.
 * Pure functions (except analyze(), which needs a canvas) so they can be unit-tested.
 */

/* ------------------------------------------------------------------ EXIF */

/** Read the few EXIF fields we use from a JPEG. Returns {} for anything else (PNG, HEIC converted, stripped). */
export function readExif(buf) {
	const out = {};
	try {
		const v = new DataView(buf);
		if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return out;
		let o = 2;
		while (o + 4 < v.byteLength) {
			const marker = v.getUint16(o);
			const len = v.getUint16(o + 2);
			if (marker === 0xffe1 && v.getUint32(o + 4) === 0x45786966) return parseTiff(v, o + 10, out); // "Exif"
			if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) break;
			o += 2 + len;
		}
	} catch (e) { /* damaged EXIF: ignore */ }
	return out;
}
function parseTiff(v, t, out) {
	const le = v.getUint16(t) === 0x4949;
	const u16 = (p) => v.getUint16(p, le), u32 = (p) => v.getUint32(p, le);
	const rat = (p) => { const d = u32(p + 4); return d ? u32(p) / d : 0; };
	const ascii = (p, n) => { let s = ''; for (let i = 0; i < n; i++) { const c = v.getUint8(p + i); if (!c) break; s += String.fromCharCode(c); } return s; };
	const ifd = (start, fn) => {
		const n = u16(start);
		for (let i = 0; i < n; i++) {
			const e = start + 2 + i * 12;
			const tag = u16(e), type = u16(e + 2), cnt = u32(e + 4);
			const size = ({ 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 }[type] || 1) * cnt;
			const at = size > 4 ? t + u32(e + 8) : e + 8;
			fn(tag, type, cnt, at);
		}
	};
	let gps = 0, exif = 0;
	ifd(t + u32(t + 4), (tag, type, cnt, at) => {
		if (tag === 0x0112) out.orientation = u16(at);
		if (tag === 0x010f) out.make = ascii(at, cnt);
		if (tag === 0x8825) gps = u32(at);
		if (tag === 0x8769) exif = u32(at);
	});
	if (exif) ifd(t + exif, (tag, type, cnt, at) => {
		if (tag === 0x9003) out.date = ascii(at, cnt); // "2026:05:14 10:21:07"
		if (tag === 0xa405) out.f35 = u16(at);
	});
	if (gps) {
		const g = {};
		ifd(t + gps, (tag, type, cnt, at) => {
			if (tag === 1) g.latRef = ascii(at, 2);
			if (tag === 2) g.lat = rat(at) + rat(at + 8) / 60 + rat(at + 16) / 3600;
			if (tag === 3) g.lngRef = ascii(at, 2);
			if (tag === 4) g.lng = rat(at) + rat(at + 8) / 60 + rat(at + 16) / 3600;
			if (tag === 0x11) g.dir = rat(at);
		});
		if (g.lat && g.lng) { out.lat = g.latRef === 'S' ? -g.lat : g.lat; out.lng = g.lngRef === 'W' ? -g.lng : g.lng; }
		if (g.dir != null && Number.isFinite(g.dir)) out.dir = g.dir;
	}
	return out;
}

/* ------------------------------------------------------------- geometry */

/** Distance in feet between two lat/lng points (good enough within a few miles). */
export function feetBetween(a, b) {
	const k = Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
	return Math.hypot((a.lat - b.lat) * 364000, (a.lng - b.lng) * 364000 * k);
}
/** Compass bearing (0 = north, 90 = east) of a plan direction (x east, y south). */
export const bearingOf = (dx, dy) => ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
/** Smallest difference between two compass bearings, 0–180. */
export const angleDiff = (a, b) => { const d = Math.abs((((a - b) % 360) + 360) % 360); return d > 180 ? 360 - d : d; };
const DIRS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
export const compass = (deg) => DIRS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

/* --------------------------------------------------------------- pixels */

/**
 * Measure a picture: size, brightness, clipping, sharpness and a difference hash.
 * src: anything drawImage accepts, with its width / height.
 */
export function analyze(src, W, H) {
	const k = Math.min(1, 512 / Math.max(W, H));
	const w = Math.max(16, Math.round(W * k)), hh = Math.max(16, Math.round(H * k));
	const c = document.createElement('canvas');
	c.width = w; c.height = hh;
	const x = c.getContext('2d', { willReadFrequently: true });
	x.drawImage(src, 0, 0, w, hh);
	const d = x.getImageData(0, 0, w, hh).data;
	const g = new Float32Array(w * hh);
	for (let i = 0; i < w * hh; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
	const st = stats(g, w, hh);
	// difference hash: 9×8 average grid, compare neighbours
	const hc = document.createElement('canvas');
	hc.width = 9; hc.height = 8;
	const hx = hc.getContext('2d', { willReadFrequently: true });
	hx.drawImage(src, 0, 0, 9, 8);
	const hd = hx.getImageData(0, 0, 9, 8).data;
	return { W, H, ...st, hash: dhash(hd) };
}
/** Brightness, clipping and sharpness of a grayscale image (exported for tests). */
export function stats(g, w, h) {
	let sum = 0, lo = 0, hi = 0;
	for (let i = 0; i < g.length; i++) { const v = g[i]; sum += v; if (v < 12) lo++; if (v > 248) hi++; }
	const mean = sum / g.length;
	let sd = 0;
	for (let i = 0; i < g.length; i++) sd += (g[i] - mean) ** 2;
	sd = Math.sqrt(sd / g.length);
	let ls = 0, ls2 = 0, n = 0;
	for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
		const i = y * w + x;
		const lap = g[i - 1] + g[i + 1] + g[i - w] + g[i + w] - 4 * g[i];
		ls += lap; ls2 += lap * lap; n++;
	}
	const sharp = n ? ls2 / n - (ls / n) ** 2 : 0;
	return { mean, sd, dark: lo / g.length, bright: hi / g.length, sharp };
}
/** 64-bit difference hash as a 16-char hex string, from RGBA pixels of a 9×8 image. */
export function dhash(rgba) {
	let bits = '';
	for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
		const a = (y * 9 + x) * 4, b = (y * 9 + x + 1) * 4;
		const ga = rgba[a] * 0.299 + rgba[a + 1] * 0.587 + rgba[a + 2] * 0.114;
		const gb = rgba[b] * 0.299 + rgba[b + 1] * 0.587 + rgba[b + 2] * 0.114;
		bits += ga > gb ? '1' : '0';
	}
	let hex = '';
	for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
	return hex;
}
export function hamming(a, b) {
	if (!a || !b || a.length !== b.length) return 64;
	let n = 0;
	for (let i = 0; i < a.length; i++) { let x = parseInt(a[i], 16) ^ parseInt(b[i], 16); while (x) { n += x & 1; x >>= 1; } }
	return n;
}

/* ------------------------------------------------------------- verdicts */

/**
 * Turn measurements into results the contractor can act on.
 * m: analyze() result. exif: readExif() result.
 * want: { label, kind: 'wide'|'detail', heading (compass, optional), property: {lat, lng}, others: [{label, hash}], now }
 * Returns [{ level: 'ok'|'warn'|'bad', text, fix }]. Any 'bad' means "retake" (it can still be accepted on purpose).
 */
export function checkPhoto(m, exif, want) {
	const r = [];
	const ok = (text) => r.push({ level: 'ok', text });
	const warn = (text, fix) => r.push({ level: 'warn', text, fix });
	const bad = (text, fix) => r.push({ level: 'bad', text, fix });
	const long = Math.max(m.W, m.H);
	if (long < 800) bad(`Too small (${m.W}×${m.H}).`, 'Take it with the phone’s camera instead of saving a screenshot or a picture from a message.');
	else if (long < 1600) warn(`Small (${m.W}×${m.H}) — details will be soft.`, 'Use the camera’s full-size photos (not “small” or a screenshot).');
	else ok(`Good size (${m.W}×${m.H}).`);
	if (want.kind !== 'detail') {
		if (m.H > m.W * 1.05) warn('Taken upright (portrait).', 'Turn the phone sideways — a wide photo fits the whole yard and both house corners.');
		else ok('Sideways (landscape) — good.');
	}
	if (m.sd < 6) bad('The picture is almost one flat color.', 'Make sure nothing covers the lens and the camera is pointed at the yard.');
	else if (m.sharp < 15) bad('Blurry.', 'Hold still, tap the screen on the yard to focus, and wipe the lens.');
	else if (m.sharp < 40) warn('A little soft.', 'Hold the phone with both hands and tap to focus before taking it.');
	else ok('Sharp.');
	if (m.mean < 55 || m.dark > 0.35) bad('Too dark.', 'Take it in daylight. Overcast or mid-morning light is best; avoid dusk.');
	else if (m.mean > 205 || m.bright > 0.25) warn('Too bright / washed out.', 'Don’t face the sun — stand so the sun is behind you or to the side.');
	else ok('Good light.');
	for (const o of want.others || []) {
		if (o.hash && m.hash && hamming(o.hash, m.hash) <= 6) { bad(`This looks like the same photo as “${o.label}”.`, `Walk to the spot shown on the diagram for “${want.label}” and take a new photo.`); break; }
	}
	if (exif.f35 && exif.f35 < 20 && want.kind !== 'detail') warn('Taken with the ultra-wide (0.5×) lens — it bends straight lines and distorts distances.', 'Switch to the normal 1× lens and step back instead.');
	if (exif.lat && want.property && want.property.lat) {
		const d = feetBetween(exif, want.property);
		if (d > 800) bad(`Taken about ${d > 5280 ? (d / 5280).toFixed(1) + ' miles' : Math.round(d) + ' ft'} from this property.`, 'Check you chose the right customer, or take the photo at the property.');
		else ok('Taken at this property (GPS).');
	} else if (want.property && want.property.lat) r.push({ level: 'info', text: 'No location in the photo, so we couldn’t confirm it was taken here.' });
	if (exif.dir != null && want.heading != null && want.kind !== 'detail') {
		const diff = angleDiff(exif.dir, want.heading);
		if (diff > 75) warn(`The phone was facing ${compass(exif.dir)}, but this view should face ${compass(want.heading)}.`, 'Stand where the diagram shows and point the phone the way the arrow points.');
		else ok(`Facing ${compass(exif.dir)} — the right way.`);
	}
	if (exif.date && want.now) {
		const t = Date.parse(exif.date.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3'));
		if (t && want.now - t > 365 * 864e5) warn(`This photo is from ${new Date(t).getFullYear()} — the yard may have changed.`, 'Take a new photo today if you can.');
	}
	return r;
}
export const worst = (res) => (res.some((x) => x.level === 'bad') ? 'bad' : res.some((x) => x.level === 'warn') ? 'warn' : 'ok');

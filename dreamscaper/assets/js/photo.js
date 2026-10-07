/* DreamScaper – photo assets.
 * Real photo cutouts (transparent WebP) for library items and the customer's own
 * "My Library". A photo keeps the plant's real growth data: it is scaled to the
 * plant's size at any age, and re-coloured for the season (fall colour, winter
 * dormancy, flowers only in bloom months), so it still grows and changes over time.
 */
import { canvas, clamp, rng } from './util.js?v=2.7.6';
import { SEASON_MONTHS } from './library.js?v=2.7.6';

const listeners = new Set();
/** Called whenever a photo finishes loading, so views can redraw. */
export function onPhotoReady(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function ready() { for (const fn of listeners) { try { fn(); } catch (e) { console.warn(e); } } }

/* ----------------------------------------------------------- loading */

const loading = new Map();
/** Ensure item.photo.img is loading; returns the image if it is ready now. */
export function photoImage(item, season) {
	const p = item.photo;
	if (!p) return null;
	const key = (p.seasons && p.seasons[season]) ? season : 'main';
	const have = key === 'main' ? p.img : p.imgs && p.imgs[key];
	if (have) return { img: have, own: key !== 'main' };
	const src = key === 'main' ? p.src : p.seasons[key];
	const lk = item.id + '|' + key;
	if (!loading.has(lk) && (src || p.blob)) {
		loading.set(lk, (async () => {
			try {
				const blob = key === 'main' && p.blob ? (typeof p.blob === 'function' ? await p.blob() : p.blob) : await (await fetch(src)).blob();
				const bmp = await decode(blob);
				if (key === 'main') p.img = bmp; else (p.imgs || (p.imgs = {}))[key] = bmp;
				invalidate(item.id);
				ready();
			} catch (e) { console.warn('DreamScaper photo failed', item.id, e); p.failed = true; }
		})());
	}
	return null;
}
async function decode(blob) {
	if (window.createImageBitmap) { try { return await createImageBitmap(blob); } catch (e) { /* fall through */ } }
	const url = URL.createObjectURL(blob);
	try {
		const img = new Image();
		img.src = url;
		await img.decode();
		return img;
	} finally { setTimeout(() => URL.revokeObjectURL(url), 2000); }
}

/**
 * Photo packs: manifest.json → { "<item id>": { src, aspect, bloom?, seasons:{fall:"x.webp"} } }.
 * Loads the pack bundled with the plugin (assets/photos/) and the site owner's
 * uploaded pack (WordPress → Settings → DreamScaper → Library photos); the
 * owner's photos win.
 */
export async function loadPhotoPack(byId, extraUrl) {
	const urls = [new URL('../photos/manifest.json', import.meta.url).href];
	if (extraUrl) urls.push(extraUrl);
	let n = 0;
	for (const url of urls) {
		try {
			const r = await fetch(url, { cache: 'no-cache' });
			if (!r.ok) continue;
			const m = await r.json();
			for (const id in m) {
				const it = byId[id];
				if (!it || it.mine) continue;
				const e = m[id];
				if (!e || !e.src) continue;
				const seasons = {};
				for (const s in e.seasons || {}) seasons[s] = new URL(e.seasons[s], url).href;
				const bloom = e.bloom != null ? !!e.bloom : !!(it.blooms && !/purple|burgundy|red|copper|gold|lime/.test(it.leafName || ''));
				it.photo = { src: new URL(e.src, url).href, aspect: e.aspect || it.w / it.h, bloom, seasons, credit: e.credit || '' };
				n++;
			}
		} catch (e) { /* no pack there */ }
	}
	if (n) ready();
	return n;
}

/* ------------------------------------------------- seasonal processing */

const cache = new Map();
function invalidate(id) { for (const k of [...cache.keys()]) if (k.startsWith(id + '|')) cache.delete(k); }

/** Width (ft) a photo item should occupy for a given height, keeping the photo's proportions. */
export function photoWidth(item, h, wData) {
	const a = item.photo && item.photo.aspect;
	if (!a) return wData;
	return h * a * 0.7 + wData * 0.3;
}

function inBloom(item, season) {
	return !!(item.months && item.months.length && SEASON_MONTHS[season].some((m) => item.months.includes(m)));
}

/** RGB → HSL helpers (0..1). */
function rgb2hsl(r, g, b) {
	const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
	if (mx === mn) return [0, 0, l];
	const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
	let hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
	return [hh / 6, s, l];
}
function hsl2rgb(hh, s, l) {
	if (!s) return [l, l, l];
	const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
	const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
	return [f(hh + 1 / 3), f(hh), f(hh - 1 / 3)];
}
const isLeaf = (hh, s, l) => hh > 0.14 && hh < 0.47 && s > 0.12 && l > 0.06;
const isBloom = (hh, s, l) => s > 0.32 && l > 0.25 && !(hh > 0.14 && hh < 0.47) && !(hh > 0.03 && hh < 0.13 && l < 0.45);

/**
 * Return a canvas of the item's photo for the season, or null if the photo
 * should not be used (e.g. not loaded yet, or a perennial that is dormant).
 * mode: 'full' = use as is; 'bare' = only wood left (draw procedural branches under it).
 */
export function seasonalPhoto(item, season) {
	const got = photoImage(item, season);
	if (!got) return null;
	const { img, own } = got;
	const key = item.id + '|' + season;
	if (cache.has(key)) return cache.get(key);
	const W = img.width, H = img.height;
	const c = canvas(W, H);
	const x = c.getContext('2d', { willReadFrequently: true });
	x.drawImage(img, 0, 0);
	let mode = 'full';
	const plant = item.cat !== 'features';
	if (plant && !own) {
		const herb = item.cat === 'perennials' || item.cat === 'grasses' || item.cat === 'annuals';
		const winter = season === 'winter', fall = season === 'fall', spring = season === 'spring';
		const decid = !item.ev;
		const bloomNow = inBloom(item, season);
		if (winter && decid && herb && item.cat !== 'grasses') { cache.set(key, null); return null; }
		const fallCol = item.fall ? [item.fall[0] / 360, item.fall[1] / 100, item.fall[2] / 100] : null;
		const d = x.getImageData(0, 0, W, H), px = d.data;
		const R = rng(item.id.length * 977 + W);
		// low-frequency noise so fall colour turns in patches like a real tree
		const nz = new Float32Array(64);
		for (let i = 0; i < 64; i++) nz[i] = R();
		const noise = (i) => { const xx = (i % W) / W * 7, yy = Math.floor(i / W) / H * 7; const a = nz[(Math.floor(xx) + Math.floor(yy) * 8) & 63]; return a; };
		const stripBloom = item.photo.bloom && !bloomNow;
		const leafH = item.leaf ? item.leaf[0] / 360 : 0.3;
		for (let i = 0; i < px.length; i += 4) {
			if (px[i + 3] < 8) continue;
			let r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255;
			let [hh, s, l] = rgb2hsl(r, g, b);
			const leaf = isLeaf(hh, s, l);
			if (winter && decid && item.cat !== 'grasses') {
				// leaves gone: keep only trunk & branches
				const woody = (hh > 0.02 && hh < 0.14 && s < 0.65 && l < 0.6) || (s < 0.1 && l < 0.7);
				if (!woody || leaf) { px[i + 3] = 0; continue; }
				continue;
			} else if (stripBloom && isBloom(hh, s, l)) {
				// flowers out of season → foliage
				hh = leafH; s = Math.min(s, 0.42); l = clamp(l * 0.55, 0.08, 0.38);
				[r, g, b] = hsl2rgb(hh, s, l);
			} else if (winter && item.cat === 'grasses' && decid) {
				[r, g, b] = hsl2rgb(0.1, 0.32, clamp(l * 1.15, 0.25, 0.75));
			} else if (winter && item.ev && leaf) {
				[r, g, b] = hsl2rgb(hh - 0.01, s * 0.82, l * 0.9);
			} else if (fall && decid && leaf) {
				const n = noise(i / 4);
				const target = fallCol || [0.12, 0.6, 0.45];
				const t = clamp(0.55 + n * 0.5, 0, 1);
				const th = target[0] + (n - 0.5) * 0.04;
				hh = hh + (th - hh) * t; s = s + (target[1] - s) * t; l = l + (Math.min(target[2] * 1.1, 0.7) * (l / 0.32) * 0.5 + target[2] * 0.5 - l) * t * 0.6;
				[r, g, b] = hsl2rgb((hh + 1) % 1, clamp(s, 0, 1), clamp(l, 0.04, 0.85));
			} else if (spring && decid && leaf && !bloomNow) {
				[r, g, b] = hsl2rgb(hh - 0.015, clamp(s * 1.08, 0, 1), clamp(l * 1.08, 0, 0.8));
			} else continue;
			px[i] = r * 255; px[i + 1] = g * 255; px[i + 2] = b * 255;
		}
		x.putImageData(d, 0, 0);
		if (winter && decid && item.cat !== 'grasses' && !herb) mode = 'bare';
	}
	const out = { c, mode };
	cache.set(key, out);
	if (cache.size > 120) cache.delete(cache.keys().next().value);
	return out;
}

/**
 * Draw an item's photo into ctx with its base at (cx, base) and size w × h px.
 * Adds a soft contact shadow and light matching. Returns false if no photo yet.
 */
export function drawPhotoSprite(ctx, item, season, cx, base, w, h, sun) {
	const sp = seasonalPhoto(item, season);
	if (!sp) return false;
	const { c } = sp;
	// contact darkening where the plant meets the ground
	const g = ctx.createRadialGradient(cx, base, 0, cx, base, w * 0.5);
	g.addColorStop(0, 'rgba(0,0,0,.28)'); g.addColorStop(1, 'rgba(0,0,0,0)');
	ctx.save(); ctx.translate(cx, base); ctx.scale(1, 0.18); ctx.translate(-cx, -base);
	ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, base, w * 0.5, 0, 7); ctx.fill(); ctx.restore();
	ctx.save();
	if (sun < 0) { ctx.translate(cx, 0); ctx.scale(-1, 1); ctx.translate(-cx, 0); }
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(c, cx - w / 2, base - h, w, h);
	ctx.restore();
	return sp.mode;
}

/* ------------------------------------------------------------ encoding */

let webpOK = null;
/** Smallest good format this browser can write with transparency: WebP, else PNG. */
export async function encodeCutout(c, q = 0.82) {
	const tryType = (t) => new Promise((ok) => c.toBlob((b) => ok(b), t, q));
	if (webpOK !== false) {
		const b = await tryType('image/webp');
		if (b && b.type === 'image/webp') { webpOK = true; return b; }
		webpOK = false;
	}
	return tryType('image/png');
}

/* DreamScaper – browser side of the AI calls (the server holds the keys). */
import { canvas } from './util.js?v=2.7.2';
import { api, session } from './api.js?v=2.7.2';
import { aiSize } from './aiprompt.js?v=2.7.2';

/** Any drawable → JPEG data URI, longest side ≤ max. */
export function toJpeg(src, max = 1536, q = 0.9) {
	const w = src.naturalWidth || src.videoWidth || src.width, h = src.naturalHeight || src.videoHeight || src.height;
	const k = Math.min(1, max / Math.max(w, h));
	const c = canvas(w * k, h * k);
	const x = c.getContext('2d');
	x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
	x.imageSmoothingQuality = 'high';
	x.drawImage(src, 0, 0, c.width, c.height);
	return c.toDataURL('image/jpeg', q);
}

export function loadImage(url) {
	return new Promise((ok, bad) => {
		const im = new Image();
		im.crossOrigin = 'anonymous';
		im.onload = () => ok(im);
		im.onerror = () => bad(new Error('Couldn’t load the AI picture.'));
		im.src = url;
	});
}

export const aiReady = () => !!(session.user && session.ai && session.ai.enabled);

/**
 * Run one FLUX.2 [klein] edit. Resolves { img, url, blob }.
 * opts: { image, refs[], prompt, mode, summary, lead, seed, onProgress(text) }
 */
export async function runEdit({ image, refs = [], prompt, mode = 'dream', summary = '', lead = false, seed, onProgress = () => {} }) {
	const w = image.naturalWidth || image.width, h = image.naturalHeight || image.height;
	const size = aiSize(w, h);
	onProgress('Sending your photo…');
	const start = await api('ai/edit', { body: {
		image: toJpeg(image, 1536, 0.9),
		refs: refs.slice(0, 3).map((r) => toJpeg(r, 1024, 0.88)),
		prompt, mode, summary, lead, seed: seed == null ? Math.floor(Math.random() * 2 ** 31) : seed,
		width: size.width, height: size.height
	} });
	const t0 = Date.now();
	const msgs = ['Planning the design…', 'Placing plants…', 'Adding the details…', 'Matching the light…', 'Almost there…'];
	for (;;) {
		await new Promise((r) => setTimeout(r, Date.now() - t0 < 8000 ? 1200 : 2200));
		onProgress(msgs[Math.min(msgs.length - 1, Math.floor((Date.now() - t0) / 4000))]);
		const j = await api('ai/job', { query: { id: start.job } });
		if (j.status === 'ready') {
			const r = await fetch(j.url, { credentials: 'same-origin' });
			const blob = await r.blob();
			const img = await loadImage(URL.createObjectURL(blob));
			return { img, url: j.url, blob };
		}
		if (j.status === 'failed') throw new Error(j.message || 'That one didn’t work. Please try again.');
		if (Date.now() - t0 > 240000) throw new Error('The AI is taking too long. Please try again.');
	}
}

/** Text-prompted selection (SAM 3). Returns a Uint8Array mask W*H (1 = selected) or null. */
export async function segment(src, text, W, H) {
	const j = await api('ai/segment', { body: { image: toJpeg(src, 1280, 0.88), prompt: text } });
	if (!j.masks || !j.masks.length) return null;
	const c = canvas(W, H), x = c.getContext('2d', { willReadFrequently: true });
	const out = new Uint8Array(W * H);
	for (const m of j.masks) {
		const im = await loadImage(m);
		x.clearRect(0, 0, W, H);
		x.drawImage(im, 0, 0, W, H);
		const d = x.getImageData(0, 0, W, H).data;
		for (let i = 0, k = 0; k < out.length; i += 4, k++) if (d[i] > 127 || d[i + 3] > 127 && d[i] + d[i + 1] + d[i + 2] > 380) out[k] = 1;
	}
	let n = 0;
	for (let k = 0; k < out.length; k++) n += out[k];
	return n > 30 ? out : null;
}

export function identify(src, organ = 'auto') {
	return api('ai/identify', { body: { image: toJpeg(src, 1280, 0.9), organ } });
}

/** Grow a mask by r pixels (box dilate, separable). */
export function dilateMask(m, W, H, r) {
	if (r <= 0) return m;
	const tmp = new Uint8Array(W * H), out = new Uint8Array(W * H);
	for (let y = 0; y < H; y++) {
		let run = -1e9;
		for (let x = 0; x < W; x++) { if (m[y * W + x]) run = x; tmp[y * W + x] = x - run <= r ? 1 : 0; }
		run = 1e9;
		for (let x = W - 1; x >= 0; x--) { if (m[y * W + x]) run = x; if (run - x <= r) tmp[y * W + x] = 1; }
	}
	for (let x = 0; x < W; x++) {
		let run = -1e9;
		for (let y = 0; y < H; y++) { if (tmp[y * W + x]) run = y; out[y * W + x] = y - run <= r ? 1 : 0; }
		run = 1e9;
		for (let y = H - 1; y >= 0; y--) { if (tmp[y * W + x]) run = y; if (run - y <= r) out[y * W + x] = 1; }
	}
	return out;
}

/** Mask → soft alpha canvas (feathered). */
export function maskCanvas(m, W, H, feather = 6) {
	const c = canvas(W, H), x = c.getContext('2d');
	const d = x.createImageData(W, H);
	for (let k = 0, i = 3; k < m.length; k++, i += 4) d.data[i] = m[k] ? 255 : 0;
	x.putImageData(d, 0, 0);
	if (!feather) return c;
	const o = canvas(W, H), ox = o.getContext('2d');
	ox.filter = `blur(${feather}px)`;
	ox.drawImage(c, 0, 0);
	return o;
}

/** base + result shown only inside mask (feathered). Returns a new canvas. */
export function compositeMasked(base, result, m, feather = 6) {
	const W = base.width, H = base.height;
	const out = canvas(W, H), x = out.getContext('2d');
	x.drawImage(base, 0, 0);
	const layer = canvas(W, H), lx = layer.getContext('2d');
	lx.drawImage(result, 0, 0, W, H);
	lx.globalCompositeOperation = 'destination-in';
	lx.drawImage(maskCanvas(m, W, H, feather), 0, 0);
	x.drawImage(layer, 0, 0);
	return out;
}

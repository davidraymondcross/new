/* DreamScaper – share to social media and print. */
import { h, icon, canvas } from './util.js?v=2.7.1';
import { session, api } from './api.js?v=2.7.1';
import { openAuth } from './account.js?v=2.7.1';
import { modal } from './capture.js?v=2.7.1';

function jpeg(c, max = 1600, q = 0.88) {
	const k = Math.min(1, max / Math.max(c.width, c.height));
	if (k === 1) return c.toDataURL('image/jpeg', q);
	const o = canvas(c.width * k, c.height * k);
	o.getContext('2d').drawImage(c, 0, 0, o.width, o.height);
	return o.toDataURL('image/jpeg', q);
}
const dataToBlob = async (d) => (await fetch(d)).blob();

/** Before | After side-by-side (for posts that should show the transformation). */
export function beforeAfter(before, after, brand) {
	const H = 900, wb = Math.round(before.width * (H / before.height)), wa = Math.round(after.width * (H / after.height));
	const gap = 12, bar = 64;
	const c = canvas(wb + wa + gap, H + bar);
	const x = c.getContext('2d');
	x.fillStyle = '#12211a'; x.fillRect(0, 0, c.width, c.height);
	x.drawImage(before, 0, 0, wb, H);
	x.drawImage(after, wb + gap, 0, wa, H);
	const tag = (t, px) => { x.font = '700 30px system-ui, sans-serif'; const w = x.measureText(t).width + 30; x.fillStyle = 'rgba(0,0,0,.55)'; x.fillRect(px + 16, 16, w, 46); x.fillStyle = '#fff'; x.textBaseline = 'middle'; x.fillText(t, px + 31, 40); };
	tag('BEFORE', 0); tag('AFTER', wb + gap);
	x.font = '600 26px system-ui, sans-serif'; x.fillStyle = '#7be0a0'; x.textAlign = 'center'; x.textBaseline = 'middle';
	x.fillText(`Designed with DreamScaper by ${brand}`, c.width / 2, H + bar / 2);
	return c;
}

/**
 * Share sheet. opts: { root, toast, image (canvas), before (canvas|null), title, brand, site }
 */
export function shareSheet(opts) {
	const { root, toast, brand } = opts;
	let useBA = !!opts.before;
	let link = null, linkFor = null, linkImg = '';
	const pic = () => (useBA && opts.before ? beforeAfter(opts.before, opts.image, brand) : opts.image);
	const status = h('p', { class: 'ds-hint' });
	const preview = h('img', { class: 'ds-share-preview', alt: 'Your design' });
	const drawPreview = () => { preview.src = jpeg(pic(), 1000, 0.8); };
	drawPreview();
	const text = `My dream yard, designed with DreamScaper by ${brand}! 🌿`;

	const getLink = async () => {
		const key = useBA ? 'ba' : 'one';
		if (link && linkFor === key) return link;
		if (!session.user) { const ok = await openAuth({ reason: 'Sign in to get a link you can share anywhere.' }); if (!ok) return null; }
		status.textContent = 'Making your share link…';
		try {
			const j = await api('publish', { body: { image: jpeg(pic(), 1800, 0.86), before: !useBA && opts.before ? jpeg(opts.before, 1400, 0.8) : '', title: opts.title || 'My Dreamscape' } });
			link = j.url; linkImg = j.image || ''; linkFor = key; status.textContent = '';
			return link;
		} catch (e) { status.textContent = e.message; return null; }
	};
	const openNet = (fn) => async () => {
		// open the window synchronously (pop-up blockers), then point it at the network
		const w = window.open('about:blank', '_blank', 'width=640,height=640');
		const u = await getLink();
		if (!u) { if (w) w.close(); return; }
		const url = fn(encodeURIComponent(u), encodeURIComponent(text));
		if (w) w.location.href = url; else location.href = url;
	};
	const nets = [
		['Facebook', '#1877F2', 'f', (u) => `https://www.facebook.com/sharer/sharer.php?u=${u}`],
		['Pinterest', '#E60023', 'P', (u, t) => `https://pinterest.com/pin/create/button/?url=${u}&description=${t}&media=${encodeURIComponent(linkImg)}`],
		['X', '#000', '𝕏', (u, t) => `https://twitter.com/intent/tweet?url=${u}&text=${t}`],
		['WhatsApp', '#25D366', 'W', (u, t) => `https://wa.me/?text=${t}%20${u}`],
		['Nextdoor', '#8ED500', 'N', (u, t) => `https://nextdoor.com/sharekit/?source=${encodeURIComponent(location.hostname)}&body=${t}%20${u}`],
		['LinkedIn', '#0A66C2', 'in', (u) => `https://www.linkedin.com/sharing/share-offsite/?url=${u}`],
		['Reddit', '#FF4500', 'r', (u, t) => `https://www.reddit.com/submit?url=${u}&title=${t}`],
		['Email', '#5b6b62', '✉', (u, t) => `mailto:?subject=${encodeURIComponent('My dream yard')}&body=${t}%0A%0A${u}`]
	];
	const native = navigator.canShare && navigator.share;
	const shareFile = async () => {
		try {
			const blob = await dataToBlob(jpeg(pic(), 2000, 0.9));
			const file = new File([blob], 'my-dreamscape.jpg', { type: 'image/jpeg' });
			if (navigator.canShare({ files: [file] })) await navigator.share({ files: [file], text });
			else { const u = await getLink(); if (u) await navigator.share({ url: u, text }); }
		} catch (e) { if (e.name !== 'AbortError') toast('Sharing was cancelled.'); }
	};
	const save = async () => {
		const blob = await dataToBlob(jpeg(pic(), 2400, 0.92));
		const a = h('a', { href: URL.createObjectURL(blob), download: 'my-dreamscape.jpg' });
		document.body.append(a); a.click(); a.remove();
		toast('Saved! Open Instagram or TikTok and pick it from your photos.', 5000);
	};
	const copy = async () => {
		const u = await getLink();
		if (!u) return;
		try { await navigator.clipboard.writeText(u); toast('Link copied!'); } catch (e) { prompt('Copy this link:', u); }
	};
	const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
	const m = modal(root, 'Share your design', [
		preview,
		opts.before ? h('div', { class: 'ds-seg', role: 'radiogroup' },
			h('button', { class: useBA ? 'on' : '', onclick: (e) => { useBA = true; mark(e); } }, 'Before & after'),
			h('button', { class: useBA ? '' : 'on', onclick: (e) => { useBA = false; mark(e); } }, 'Just the design')) : null,
		native ? h('button', { class: 'ds-btn ds-wide ds-lg', onclick: shareFile }, icon('share', 20), ' Share… (Instagram, Messages, Facebook & more)') : null,
		h('div', { class: 'ds-nets' }, ...nets.map(([n, col, g, fn]) => h('button', { class: 'ds-net', onclick: openNet(fn), title: 'Share on ' + n }, h('span', { style: { background: col } }, g), h('small', null, n)))),
		h('div', { class: 'ds-row ds-wrap' },
			h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: copy }, icon('link', 16), ' Copy link'),
			h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: save }, icon('download', 16), ' Save for Instagram / TikTok')),
		status,
		h('p', { class: 'ds-hint' }, 'Links show your picture (not your address or name) and invite friends to design their own yard.')
	], close);
	function mark(e) { e.currentTarget.parentNode.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.currentTarget)); drawPreview(); }
}

/** Print a clean one-page sheet. opts: { image, before, title, brand, site, plants (text), customer } */
export function printDesign(opts) {
	const img = jpeg(opts.image, 2200, 0.92);
	const bef = opts.before ? jpeg(opts.before, 1400, 0.85) : '';
	const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
	const date = new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
	const plants = (opts.plants || '').split('\n').filter(Boolean);
	const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(opts.title)}</title><style>
@page{size:letter;margin:12mm}*{box-sizing:border-box}body{font:12pt/1.45 system-ui,-apple-system,Segoe UI,sans-serif;color:#13261b;margin:0}
header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #2f7d4f;padding-bottom:6px;margin-bottom:10px}
h1{font-size:20pt;margin:0}small{color:#557}img{width:100%;border-radius:6px;display:block}.main{margin-bottom:8px}
.row{display:flex;gap:10px}.row>div{flex:1}.lbl{font-weight:700;font-size:10pt;color:#2f7d4f;text-transform:uppercase;letter-spacing:.06em;margin:4px 0}
ul{columns:2;margin:4px 0 0;padding-left:18px;font-size:10.5pt}footer{margin-top:10px;border-top:1px solid #ccd;padding-top:6px;font-size:10pt;color:#456;display:flex;justify-content:space-between}
</style></head><body>
<header><div><h1>${esc(opts.title)}</h1><small>${esc(date)}${opts.customer ? ' · ' + esc(opts.customer) : ''}</small></div><div><b>${esc(opts.brand)}</b><br><small>${esc(opts.site || '')}</small></div></header>
${bef ? `<div class="row"><div><div class="lbl">Before</div><img src="${bef}"></div><div><div class="lbl">After</div><img src="${img}"></div></div>` : `<div class="main"><img src="${img}"></div>`}
${plants.length ? `<div class="lbl" style="margin-top:10px">In this design</div><ul>${plants.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
<footer><span>Designed with DreamScaper</span><span>Ready to make it real? Contact ${esc(opts.brand)}${opts.site ? ' · ' + esc(opts.site) : ''}</span></footer>
</body></html>`;
	const f = document.createElement('iframe');
	f.setAttribute('aria-hidden', 'true');
	Object.assign(f.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
	document.body.append(f);
	const d = f.contentWindow.document;
	d.open(); d.write(html); d.close();
	const go = () => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { /* ignore */ } setTimeout(() => f.remove(), 60000); };
	const imgs = [...d.images];
	Promise.all(imgs.map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; })))).then(() => setTimeout(go, 100));
}

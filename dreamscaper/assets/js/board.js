/* DreamScaper – Inspiration Board: save pictures, plants, materials, styles and designs you love.
 * AI Style Analysis finds what your saved pictures have in common; "Apply to my yard" opens
 * Dreamscape AI with that style and up to 3 of the pictures as references.
 * Saved on this device (IndexedDB) like My Dreamscapes.
 */
import { h, put, icon, uid, canvas, canvasToBlob, blobToBitmap } from './util.js?v=2.7.8';
import { modal } from './capture.js?v=2.7.8';
import { session, api } from './api.js?v=2.7.8';

let B = null; // ctx
export const STYLES = ['Traditional', 'Modern', 'Contemporary', 'Natural', 'Cottage', 'Formal', 'Rustic', 'Low-maintenance', 'Native', 'Pollinator', 'Luxury', 'Woodland', 'Coastal', 'Japanese'];

/** ctx: { root, toast, page(title, sub, ...kids) → main, store, ALL, MATERIALS, swatch(id, size), materialPicker(onPick), thumbFor(item), capture(kind), startAI({ words, refs }), plantFacts(item), requireSignIn(reason) } */
export function initBoard(ctx) { B = ctx; }

function thumbOf(c, max = 360) {
	const k = Math.min(1, max / Math.max(c.width, c.height));
	const t = canvas(c.width * k, c.height * k);
	t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
	return t.toDataURL('image/jpeg', 0.78);
}
function toCanvas(img, max = 1280) {
	const w = img.naturalWidth || img.width, hh = img.naturalHeight || img.height, k = Math.min(1, max / Math.max(w, hh));
	const c = canvas(w * k, hh * k);
	c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
	return c;
}

/** Save something to the board. it: { kind, name, image?: canvas, thumb?, ref?, note? } */
export async function addToBoard(it) {
	const rec = { id: uid(), kind: it.kind, name: it.name || '', note: it.note || '', ref: it.ref || '', created: Date.now(), thumb: it.thumb || '' };
	if (it.image) {
		const c = toCanvas(it.image);
		rec.blob = await B.store.putBlob(await canvasToBlob(c, 'image/jpeg', 0.88));
		rec.thumb = thumbOf(c);
	}
	await B.store.putBoard(rec);
	return rec;
}

export async function openBoard() {
	const grid = h('div', { class: 'ds-board' });
	const result = h('div');
	const main = B.page('💡 Inspiration Board', 'Save pictures, plants, materials, styles and designs you love. Then let AI find your style and apply it to your yard.',
		h('div', { class: 'ds-row ds-wrap ds-board-add' },
			h('button', { class: 'ds-btn', onclick: async () => { const s = await B.capture('camera'); if (s && s.bitmap) { await addToBoard({ kind: 'image', image: s.bitmap, name: '' }); draw(); } } }, icon('camera', 18), ' Take a photo'),
			h('button', { class: 'ds-btn ds-ghost', onclick: async () => { const s = await B.capture('upload'); if (s && s.bitmap) { await addToBoard({ kind: 'image', image: s.bitmap, name: '' }); draw(); } } }, icon('upload', 18), ' Upload'),
			h('button', { class: 'ds-btn ds-ghost', onclick: () => pickPlant(draw) }, '🌿 Plant'),
			h('button', { class: 'ds-btn ds-ghost', onclick: () => pickMaterial(draw) }, '🪨 Material'),
			h('button', { class: 'ds-btn ds-ghost', onclick: () => pickStyle(draw) }, '🎨 Style')),
		h('section', { class: 'ds-hub-card' }, h('h2', null, '✨ AI Style Analysis'),
			h('p', { class: 'ds-hint' }, 'AI looks at the pictures, plants, materials and styles you saved and tells you what they have in common — then you can apply that look to your own yard with Dreamscape AI.'),
			h('div', { class: 'ds-row ds-wrap' }, h('button', { class: 'ds-btn', onclick: (e) => analyze(e.currentTarget, result) }, icon('sparkle', 18), ' Find my style')), result),
		grid);
	const draw = async () => {
		const items = await B.store.listBoard().catch(() => []);
		grid.innerHTML = '';
		if (!items.length) grid.append(h('p', { class: 'ds-muted ds-span' }, 'Nothing saved yet. Snap a neighbor’s garden, a plant at the nursery, a patio you saw online — or tap ♡ Save on any plant in the editor.'));
		for (const it of items) {
			const lbl = { image: 'Picture', plant: 'Plant', material: 'Material', design: 'My design', style: 'Style', analysis: 'My style' }[it.kind] || it.kind;
			grid.append(h('div', { class: 'ds-board-card ds-board-' + it.kind },
				it.thumb ? h('img', { src: it.thumb, alt: it.name || lbl, loading: 'lazy' }) : h('div', { class: 'ds-board-big' }, it.kind === 'style' ? '🎨' : '💡'),
				h('div', { class: 'ds-board-body' },
					h('small', null, lbl), h('b', null, it.name || (it.kind === 'image' ? 'Inspiration' : '')),
					it.note ? h('p', { class: 'ds-hint' }, it.note) : null,
					h('div', { class: 'ds-row' },
						it.kind === 'plant' && B.ALL ? h('button', { class: 'ds-link', onclick: () => { const p = B.ALL.find((x) => x.id === it.ref); if (p) B.plantFacts(p); } }, 'Facts') : null,
						h('button', { class: 'ds-icon-btn', 'aria-label': 'Add a note', title: 'Add a note', onclick: async () => { const t = prompt('Note (what you like about it)', it.note || ''); if (t != null) { it.note = t.slice(0, 300); await B.store.putBoard(it); draw(); } } }, icon('edit', 16)),
						h('button', { class: 'ds-icon-btn', 'aria-label': 'Remove', title: 'Remove', onclick: async () => { if (!confirm('Remove it from your board?')) return; await B.store.deleteBoard(it); draw(); } }, icon('trash', 16))))));
		}
	};
	draw();
	return main;
}

function pickPlant(done) {
	const q = h('input', { type: 'search', placeholder: 'Search plants', 'aria-label': 'Search plants' });
	const list = h('div', { class: 'ds-hub-list ds-plantpick' });
	const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
	const fill = () => {
		const w = q.value.toLowerCase().split(/\s+/).filter(Boolean);
		list.innerHTML = '';
		for (const it of B.ALL.filter((x) => x.cat !== 'features' && w.every((t) => x.search.includes(t))).slice(0, 40)) list.append(h('button', { class: 'ds-hub-row', onclick: async () => { m.remove(); await addToBoard({ kind: 'plant', ref: it.id, name: it.name, thumb: B.thumbFor(it) }); done(); } }, h('img', { class: 'ds-lay-th', src: B.thumbFor(it), alt: '' }), h('b', null, it.name), h('small', null, it.sci || '')));
	};
	q.addEventListener('input', fill);
	const m = modal(B.root, 'Save a plant', [q, list], close, 'ds-modal-wide');
	fill();
}
function pickMaterial(done) {
	const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
	const picker = B.materialPicker(async (id) => {
		m.remove();
		const mt = B.MATERIALS.find((x) => x.id === id);
		let thumb = '';
		try { thumb = mt.photo ? mt.photo.src : B.swatch(id, 120).toDataURL('image/jpeg', 0.8); } catch (e) { /* no preview */ }
		await addToBoard({ kind: 'material', ref: id, name: mt ? mt.name : id, thumb });
		done();
	});
	const m = modal(B.root, 'Save a material', [picker], close, 'ds-modal-wide');
}
function pickStyle(done) {
	const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
	const m = modal(B.root, 'Save a style', [h('div', { class: 'ds-chips' }, ...STYLES.map((s) => h('button', { class: 'ds-chip', onclick: async () => { m.remove(); await addToBoard({ kind: 'style', name: s }); done(); } }, s)))], close);
}

async function analyze(btn, out) {
	if (!(await B.requireSignIn('Sign in (free) to use AI Style Analysis.'))) return;
	const items = await B.store.listBoard();
	const pics = items.filter((x) => x.blob && (x.kind === 'image' || x.kind === 'design')).slice(0, 6);
	if (pics.length < 2 && items.filter((x) => x.kind !== 'analysis').length < 3) { B.toast('Save at least 2 pictures (or a few plants, materials and styles) first.', 4500); return; }
	btn.disabled = true;
	out.innerHTML = '';
	out.append(h('p', { class: 'ds-hint' }, h('span', { class: 'ds-spin ds-spin-sm' }), ' Looking at your board…'));
	try {
		const images = [];
		const canv = [];
		for (const p of pics) { const b = await B.store.getBlob(p.blob); if (b) { const c = toCanvas(await blobToBitmap(b), 768); canv.push(c); images.push(c.toDataURL('image/jpeg', 0.82)); } }
		const r = await api('ai/style', { body: { images, notes: pics.map((p) => p.note || '').filter(Boolean), plants: items.filter((x) => x.kind === 'plant').map((x) => x.name), materials: items.filter((x) => x.kind === 'material').map((x) => x.name), styles: items.filter((x) => x.kind === 'style').map((x) => x.name) } });
		out.innerHTML = '';
		put(out, h('div', { class: 'ds-style-result' },
			h('h3', null, '🎨 ' + r.style),
			h('p', null, r.summary),
			r.characteristics && r.characteristics.length ? h('ul', null, ...r.characteristics.map((x) => h('li', null, x))) : null,
			h('div', { class: 'ds-kvs' },
				r.plants && r.plants.length ? h('div', { class: 'ds-kv' }, h('small', null, 'Plants'), h('span', null, r.plants.join(', '))) : null,
				r.materials && r.materials.length ? h('div', { class: 'ds-kv' }, h('small', null, 'Materials'), h('span', null, r.materials.join(', '))) : null,
				r.colors && r.colors.length ? h('div', { class: 'ds-kv' }, h('small', null, 'Colors'), h('span', null, r.colors.join(', '))) : null),
			h('div', { class: 'ds-row ds-wrap' },
				h('button', { class: 'ds-btn', onclick: () => B.startAI({ words: r.prompt, refs: canv.slice(0, 3) }) }, icon('sparkle', 18), ' Apply this style to my yard'),
				h('button', { class: 'ds-btn ds-ghost', onclick: async () => { await addToBoard({ kind: 'analysis', name: r.style, note: r.summary }); B.toast('Saved to your board.'); } }, '♡ Save my style'))));
	} catch (e) { out.innerHTML = ''; out.append(h('p', { class: 'ds-err' }, e.message)); }
	btn.disabled = false;
}

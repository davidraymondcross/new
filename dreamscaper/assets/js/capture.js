/* DreamScaper – getting a picture of the yard: guided camera, upload, nationwide
 * aerial imagery, and a Google 3D explorer for scouting & saving viewing angles.
 */
import { h, icon, canvas, canvasToBlob, clamp } from './util.js?v=2.7.4';
import { addressField } from './address.js?v=2.7.4';

const MAX_SIDE = 1600;

/** Resize/crop a drawable into an editor-ready canvas. */
export function prepare(src, sw, sh, max = MAX_SIDE) {
	let cx = 0, cy = 0, cw = sw, ch = sh;
	if (sw / sh > 2.2) { cw = Math.round(sh * 2.2); cx = Math.round((sw - cw) / 2); }
	if (sh / sw > 2.2) { ch = Math.round(sw * 2.2); cy = Math.round((sh - ch) / 2); }
	const s = Math.min(1, max / Math.max(cw, ch));
	const w = Math.round(cw * s), hh = Math.round(ch * s);
	let cur = src, curW = cw, curH = ch, sx = cx, sy = cy;
	while (curW / 2 > w && curH / 2 > hh) {
		const t = canvas(Math.round(curW / 2), Math.round(curH / 2));
		const tc = t.getContext('2d'); tc.imageSmoothingQuality = 'high';
		tc.drawImage(cur, sx, sy, curW, curH, 0, 0, t.width, t.height);
		cur = t; curW = t.width; curH = t.height; sx = 0; sy = 0;
	}
	const c = canvas(w, hh);
	const x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
	x.drawImage(cur, sx, sy, curW, curH, 0, 0, w, hh);
	return c;
}

async function finish(c, kind, extra = {}) {
	const blob = await canvasToBlob(c, 'image/jpeg', 0.93);
	return { blob, W: c.width, H: c.height, kind, bitmap: c, ...extra };
}

/* ------------------------------------------------------------------ upload */

export function pickFile() {
	return new Promise((resolve) => {
		const inp = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
		document.body.append(inp);
		inp.addEventListener('change', () => {
			const f = inp.files && inp.files[0];
			inp.remove();
			if (!f) return resolve(null);
			const url = URL.createObjectURL(f);
			const img = new Image();
			img.onload = () => { URL.revokeObjectURL(url); resolve(finish(prepare(img, img.naturalWidth, img.naturalHeight), 'photo')); };
			img.onerror = () => { URL.revokeObjectURL(url); resolve({ error: 'That photo format can\'t be opened in this browser. Try a JPG or PNG.' }); };
			img.src = url;
		}, { once: true });
		inp.click();
	});
}

/* ------------------------------------------------------------------ camera */

export function camera(root, hint) {
	return new Promise((resolve) => {
		if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return resolve(pickFile());
		const video = h('video', { playsinline: true, muted: true, autoplay: true });
		const vf = h('div', { class: 'ds-vf' }, video, h('div', { class: 'ds-vf-grid' }, h('i'), h('i'), h('i'), h('i'), h('span', { class: 'ds-vf-horizon' }, h('b', null, 'Eye level'))));
		const tip = h('p', { class: 'ds-cam-tip' }, hint || 'Hold your phone sideways at eye level. Fit the whole area in the frame.');
		const shutter = h('button', { class: 'ds-shutter', 'aria-label': 'Take photo' });
		const cancel = h('button', { class: 'ds-cam-x' }, 'Cancel');
		const wrap = h('div', { class: 'ds-camera' }, vf, tip, h('div', { class: 'ds-cam-bar' }, cancel, shutter, h('span')));
		root.append(wrap);
		let stream = null;
		const stop = () => { if (stream) stream.getTracks().forEach((t) => t.stop()); wrap.remove(); window.removeEventListener('resize', fit); };
		const fit = () => {
			if (!video.videoWidth) return;
			const ar = video.videoWidth / video.videoHeight;
			const w = Math.min(window.innerWidth, (window.innerHeight - 170) * ar);
			vf.style.width = Math.floor(w) + 'px';
			vf.style.height = Math.floor(w / ar) + 'px';
			wrap.classList.toggle('portrait', ar < 1);
		};
		window.addEventListener('resize', fit);
		cancel.onclick = () => { stop(); resolve(null); };
		shutter.onclick = () => {
			if (!video.videoWidth) return;
			const c = prepare(video, video.videoWidth, video.videoHeight);
			stop();
			resolve(finish(c, 'photo'));
		};
		navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1440 } } })
			.then((s) => { stream = s; video.srcObject = s; video.onloadedmetadata = fit; video.onresize = fit; return video.play(); })
			.catch(() => { stop(); resolve(pickFile()); });
	});
}

/* ------------------------------------------- aerials (CT 3-inch, USGS elsewhere) */

export function aerial(root, cfg, toast) {
	return new Promise((resolve) => {
		const st = { lat: 0, lng: 0, span: 70, img: null };
		const addr = h('input', { type: 'text', placeholder: 'Street address, town, state', autocomplete: 'street-address' });
		const go = h('button', { class: 'ds-btn' }, 'Find');
		const img = h('img', { alt: 'Aerial view of the property' });
		const status = h('p', { class: 'ds-muted' }, 'Any US address · Connecticut has 3-inch state imagery; elsewhere USGS imagery (about 2 ft per pixel)');
		const pad = h('div', { class: 'ds-pad' },
			...[['n', '▲', 'North'], ['w', '◀', 'West'], ['e', '▶', 'East'], ['s', '▼', 'South'], ['in', '＋', 'Zoom in'], ['out', '－', 'Zoom out']].map(([m, t, l]) => h('button', { 'aria-label': l, onclick: () => move(m) }, t)));
		const use = h('button', { class: 'ds-btn ds-wide', disabled: true }, 'Use this view');
		const view = h('div', { class: 'ds-aerial-view' }, img, h('span', { class: 'ds-cross' }));
		const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => { m.remove(); resolve(null); } }, icon('close'));
		const field = addressField(addr, { api: cfg.api, onPick: (it) => { if (it.lat) load({ lat: it.lat, lng: it.lng }); else load({ address: it.label }); } });
		const m = modal(root, 'Bird\'s-eye view', [h('div', { class: 'ds-row' }, field, go), status, view, pad, use], close);
		view.hidden = true; pad.hidden = true;
		const load = async (body) => {
			status.textContent = 'Loading aerial view…';
			go.disabled = true;
			try {
				const r = await fetch(cfg.api + 'aerial', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
				const j = await r.json();
				if (!r.ok) throw new Error(j.message || 'Could not load imagery.');
				Object.assign(st, { lat: j.lat, lng: j.lng, span: j.span, source: j.source || '' });
				img.src = j.image;
				await img.decode();
				view.hidden = false; pad.hidden = false; use.disabled = false;
				status.textContent = 'Center your yard under the crosshair, then tap “Use this view”.' + (st.source ? ' · ' + st.source : '');
			} catch (e) {
				status.textContent = e.message;
			}
			go.disabled = false;
		};
		const move = (k) => {
			if (!st.lat) return;
			const d = st.span * 0.35;
			let { lat, lng, span } = st;
			if (k === 'n') lat += d / 111320;
			if (k === 's') lat -= d / 111320;
			if (k === 'e') lng += d / (111320 * Math.cos((lat * Math.PI) / 180));
			if (k === 'w') lng -= d / (111320 * Math.cos((lat * Math.PI) / 180));
			if (k === 'in') span = Math.max(25, span * 0.7);
			if (k === 'out') span = Math.min(250, span / 0.7);
			load({ lat, lng, span });
		};
		go.onclick = () => { if (addr.value.trim().length > 5) load({ address: addr.value.trim() }); };
		addr.addEventListener('keydown', (e) => { if (e.key === 'Enter') go.click(); });
		use.onclick = async () => {
			const c = canvas(img.naturalWidth, img.naturalHeight);
			c.getContext('2d').drawImage(img, 0, 0);
			m.remove();
			const ppf = c.width / (st.span * 3.28084);
			resolve(finish(c, 'aerial', { ppf, where: { lat: st.lat, lng: st.lng } }));
		};
		setTimeout(() => addr.focus(), 50);
		void toast; void clamp;
	});
}

/* ------------------------------------------------------- Google 3D explorer */

let mapsLoading = null;
function loadMaps(key) {
	if (window.google && window.google.maps && window.google.maps.importLibrary) return Promise.resolve();
	if (mapsLoading) return mapsLoading;
	mapsLoading = new Promise((ok, bad) => {
		window.__dsMapsReady = () => ok();
		const s = document.createElement('script');
		s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=beta&loading=async&callback=__dsMapsReady`;
		s.async = true;
		s.onerror = () => bad(new Error('Google Maps could not load.'));
		document.head.append(s);
	});
	return mapsLoading;
}

const DIRS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
export const facing = (heading) => DIRS[Math.round((((heading % 360) + 360) % 360) / 45) % 8];

/**
 * Explore the property in Google's photorealistic 3D and bookmark viewing angles.
 * Angles are camera positions only (no imagery is captured or stored).
 * Resolves with { snap: angle } when the user wants to photograph from an angle.
 */
export function explore3d(root, cfg, project, save) {
	return new Promise((resolve) => {
		const addr = h('input', { type: 'text', placeholder: 'Street address, town, state', autocomplete: 'street-address' });
		const go = h('button', { class: 'ds-btn' }, 'Go');
		const holder = h('div', { class: 'ds-map3d' }, h('p', { class: 'ds-muted', style: { padding: '24px' } }, 'Search your address to fly there in 3D.'));
		const list = h('div', { class: 'ds-angles' });
		const saveBtn = h('button', { class: 'ds-btn', disabled: true }, icon('plus', 18), ' Save this angle');
		const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => { m.remove(); resolve(null); } }, icon('close'));
		const field = addressField(addr, { api: cfg.api, onPick: (it) => { if (it.lat) build(it.lat, it.lng); else go.click(); } });
		const m = modal(root, 'Explore in 3D', [
			h('div', { class: 'ds-row' }, field, go),
			holder,
			h('div', { class: 'ds-row ds-between' }, h('p', { class: 'ds-muted' }, 'Drag to orbit · scroll or pinch to zoom · right-drag to tilt'), saveBtn),
			h('h4', null, 'Saved angles'),
			list
		], close, 'ds-modal-wide');
		let map = null;
		project.angles = project.angles || [];

		const draw = () => {
			list.innerHTML = '';
			if (!project.angles.length) list.append(h('p', { class: 'ds-muted' }, 'No angles yet. Find a great view of your yard and tap “Save this angle”.'));
			project.angles.forEach((a, i) => {
				list.append(h('div', { class: 'ds-angle' },
					h('div', null, h('b', null, a.name), h('small', null, `Facing ${facing(a.heading)} · ${Math.round(a.range)} m away`)),
					h('div', { class: 'ds-row' },
						h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => fly(a) }, 'View'),
						h('button', { class: 'ds-btn ds-sm', onclick: () => { m.remove(); resolve({ snap: a }); } }, icon('camera', 16), ' Snap from here'),
						h('button', { class: 'ds-icon-btn', 'aria-label': 'Delete angle', onclick: () => { project.angles.splice(i, 1); save(); draw(); } }, icon('trash', 18)))));
			});
		};
		const fly = (a) => {
			if (!map) return;
			const cam = { center: { lat: a.lat, lng: a.lng, altitude: a.alt || 0 }, tilt: a.tilt, heading: a.heading, range: a.range };
			if (map.flyCameraTo) map.flyCameraTo({ endCamera: cam, durationMillis: 1600 });
			else Object.assign(map, cam);
		};
		const build = async (lat, lng) => {
			try {
				await loadMaps(cfg.mapsKey);
				const { Map3DElement } = await google.maps.importLibrary('maps3d');
				if (!map) {
					const opts = { center: { lat, lng, altitude: 0 }, range: 180, tilt: 62, heading: 0 };
					try { map = new Map3DElement({ ...opts, mode: 'SATELLITE' }); } catch (e) { map = new Map3DElement(opts); }
					holder.innerHTML = '';
					holder.append(map);
				} else fly({ lat, lng, alt: 0, tilt: 62, heading: 0, range: 180 });
				saveBtn.disabled = false;
			} catch (e) {
				holder.innerHTML = '';
				holder.append(h('p', { class: 'ds-muted', style: { padding: '24px' } }, '3D view is unavailable right now. You can still take or upload a photo.'));
			}
		};
		go.onclick = async () => {
			const q = addr.value.trim();
			if (q.length < 5) return;
			go.disabled = true;
			try {
				const r = await fetch(cfg.api + 'geocode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address: q }) });
				const j = await r.json();
				if (!r.ok) throw new Error(j.message);
				await build(j.lat, j.lng);
			} catch (e) {
				holder.innerHTML = '';
				holder.append(h('p', { class: 'ds-muted', style: { padding: '24px' } }, e.message || 'Address not found.'));
			}
			go.disabled = false;
		};
		addr.addEventListener('keydown', (e) => { if (e.key === 'Enter') go.click(); });
		saveBtn.onclick = () => {
			if (!map) return;
			const c = map.center || {};
			const a = {
				name: `Angle ${project.angles.length + 1}`,
				lat: typeof c.lat === 'function' ? c.lat() : c.lat,
				lng: typeof c.lng === 'function' ? c.lng() : c.lng,
				alt: c.altitude || 0,
				heading: map.heading || 0, tilt: map.tilt || 0, range: map.range || 150
			};
			const nm = window.prompt('Name this angle', a.name);
			if (nm === null) return;
			a.name = nm.trim() || a.name;
			project.angles.push(a);
			save();
			draw();
		};
		draw();
		if (project.angles.length && cfg.mapsKey) {
			const a = project.angles[0];
			build(a.lat, a.lng).then(() => fly(a));
		}
	});
}

/* -------------------------------------------------------------- modal util */

export function modal(root, title, body, closeBtn, cls = '') {
	const box = h('div', { class: 'ds-modal ' + cls, role: 'dialog', 'aria-label': title },
		h('div', { class: 'ds-modal-head' }, h('h3', null, title), closeBtn || null),
		h('div', { class: 'ds-modal-body' }, ...body));
	const m = h('div', { class: 'ds-backdrop' }, box);
	root.append(m);
	return m;
}

/* DreamScaper – online saves for signed-in customers.
 * The device (IndexedDB) stays the working copy so everything is instant and works
 * offline; when signed in, every save is mirrored to the customer's account.
 */
import { store } from './store.js?v=2.7.8';
import { api, session } from './api.js?v=2.7.8';

const BLOB_KEYS = new Set(['base', 'edited', 'blob', 'thumb', 'original', 'input', 'img', 'before']);

/** Every IndexedDB blob id a design or asset record points at. */
export function blobRefs(obj) {
	const out = new Set();
	const walk = (o, key) => {
		if (!o) return;
		if (typeof o === 'string') { if (BLOB_KEYS.has(key) && /^[a-z0-9]{6,40}$/.test(o)) out.add(o); return; }
		if (Array.isArray(o)) { for (const x of o) walk(x, key === 'refs' ? 'img' : key); return; }
		if (typeof o === 'object') for (const k in o) if (k !== 'files' && k !== 'thumbUrl') walk(o[k], k);
	};
	walk(obj, '');
	return [...out];
}

const queue = new Map();
let running = false;

/** Mirror a design (or asset) to the account. Debounced & serialized. */
export function pushSoon(kind, rec) {
	if (!session.user || !rec || !rec.id) return;
	queue.set(kind + ':' + rec.id, { kind, id: rec.id });
	clearTimeout(pushSoon.t);
	pushSoon.t = setTimeout(run, 1500);
}

async function run() {
	if (running) return;
	running = true;
	try {
		while (queue.size && session.user) {
			const [k, job] = queue.entries().next().value;
			queue.delete(k);
			const rec = job.kind === 'asset' ? (await store.listAssets()).find((a) => a.id === job.id) : await store.getProject(job.id);
			if (rec) await push(job.kind, rec);
		}
	} catch (e) {
		console.warn('DreamScaper cloud save failed', e);
		onStatus(e.status === 413 && e.data && e.data.data && e.data.data.needStorage ? 'full' : 'offline', e.message);
	}
	running = false;
}

let statusFn = () => {};
export function onCloudStatus(fn) { statusFn = fn; }
function onStatus(s, msg) { statusFn(s, msg); }

async function push(kind, rec) {
	onStatus('saving');
	const ids = blobRefs(rec);
	rec.files = rec.files || {};
	const missing = ids.filter((id) => !rec.files[id]);
	if (missing.length) {
		const have = (await api('cloud/has', { body: { ids: missing } })).have || {};
		for (const id of missing) {
			if (have[id]) { rec.files[id] = have[id]; continue; }
			const blob = await store.getBlob(id);
			if (!blob) continue;
			const fd = new FormData();
			fd.append('id', id);
			fd.append('file', blob, id + (blob.type === 'image/png' ? '.png' : blob.type === 'image/webp' ? '.webp' : '.jpg'));
			const r = await api('cloud/file', { form: fd });
			rec.files[id] = r.name;
		}
		for (const k in rec.files) if (!ids.includes(k)) delete rec.files[k];
		// remember the uploaded files locally so we don't re-upload
		if (kind === 'asset') await store.putAsset(rec); else await store.putProjectQuiet(rec);
	}
	const data = JSON.parse(JSON.stringify(rec, (k, v) => (k === 'thumbUrl' ? undefined : v)));
	await api('cloud/put', { body: { kind, data } });
	onStatus('saved');
}

/** Upload everything on this device (after signing in). */
export async function pushAll() {
	if (!session.user) return 0;
	const local = await store.listProjects();
	const remote = await listRemote('design').catch(() => ({ items: [] }));
	const map = new Map(remote.items.map((r) => [r.cid, r]));
	let n = 0;
	for (const p of local) {
		const r = map.get(p.id);
		if (!r || (p.updated || 0) > (r.updated || 0) + 1000) { queue.set('design:' + p.id, { kind: 'design', id: p.id }); n++; }
	}
	for (const a of await store.listAssets()) queue.set('asset:' + a.id, { kind: 'asset', id: a.id });
	run();
	return n;
}

export function listRemote(kind = 'design') { return api('cloud/list', { query: { kind } }); }

/** Download a design from the account onto this device. */
export async function pull(cid, filesUrl) {
	const j = await api('cloud/get', { query: { kind: 'design', cid } });
	const p = j.data;
	await fetchFiles(p, j.files || filesUrl);
	await store.putProjectQuiet(p);
	return p;
}

async function fetchFiles(rec, base) {
	const files = rec.files || {};
	for (const id of blobRefs(rec)) {
		if (await store.getBlob(id)) continue;
		const name = files[id];
		if (!name) continue;
		const r = await fetch(base + name, { credentials: 'same-origin' });
		if (r.ok) await store.putBlob(await r.blob(), id);
	}
}

/** Bring the account's My Library onto this device. Returns records added. */
export async function pullAssets() {
	if (!session.user) return [];
	const j = await listRemote('asset');
	const local = new Set((await store.listAssets()).map((a) => a.id));
	const added = [];
	for (const it of j.items) {
		const rec = it.data;
		if (!rec || local.has(rec.id)) continue;
		await fetchFiles(rec, j.files);
		await store.putAsset(rec);
		added.push(rec);
	}
	return added;
}

export async function removeRemote(kind, rec) {
	if (!session.user) return;
	await api('cloud/delete', { body: { kind, cid: rec.id || rec.cid, files: Object.keys(rec.files || {}) } }).catch(() => {});
}

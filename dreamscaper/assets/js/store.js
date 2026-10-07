/* DreamScaper – local storage (IndexedDB). Everything stays on the customer's device. */
import { uid } from './util.js?v=2.7.7';

const DB = 'dreamscaper';
const VER = 3;
let dbp = null;

function open() {
	if (dbp) return dbp;
	dbp = new Promise((resolve, reject) => {
		if (!('indexedDB' in window)) return reject(new Error('This browser can\'t save designs.'));
		const req = indexedDB.open(DB, VER);
		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
			if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs', { keyPath: 'id' });
			if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets', { keyPath: 'id' });
			if (!db.objectStoreNames.contains('board')) db.createObjectStore('board', { keyPath: 'id' });
		};
		req.onsuccess = () => { const db = req.result; db.onversionchange = () => db.close(); resolve(db); };
		req.onerror = () => reject(req.error);
	});
	// Ask the browser not to evict saved designs when space runs low.
	if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
	return dbp;
}

function tx(store, mode, fn) {
	return open().then((db) => new Promise((resolve, reject) => {
		const t = db.transaction(store, mode);
		const s = t.objectStore(store);
		let out;
		Promise.resolve(fn(s)).then((v) => { out = v; });
		t.oncomplete = () => resolve(out);
		t.onerror = () => reject(t.error);
		t.onabort = () => reject(t.error);
	}));
}
const req2p = (r) => new Promise((ok, bad) => { r.onsuccess = () => ok(r.result); r.onerror = () => bad(r.error); });

export const store = {
	async listProjects() {
		const all = await tx('projects', 'readonly', (s) => req2p(s.getAll()));
		return (all || []).sort((a, b) => b.updated - a.updated);
	},
	getProject: (id) => tx('projects', 'readonly', (s) => req2p(s.get(id))),
	putProject(p) {
		p.updated = Date.now();
		return tx('projects', 'readwrite', (s) => { s.put(p); return p; });
	},
	putProjectQuiet: (p) => tx('projects', 'readwrite', (s) => { s.put(p); return p; }),
	async deleteProject(p) {
		const ids = blobIds(p);
		await tx('blobs', 'readwrite', (s) => ids.forEach((id) => s.delete(id)));
		return tx('projects', 'readwrite', (s) => { s.delete(p.id); });
	},
	async putBlob(blob, id = uid()) {
		await tx('blobs', 'readwrite', (s) => { s.put({ id, blob }); });
		return id;
	},
	async getBlob(id) {
		const r = await tx('blobs', 'readonly', (s) => req2p(s.get(id)));
		return r ? r.blob : null;
	},
	deleteBlob: (id) => tx('blobs', 'readwrite', (s) => { s.delete(id); }),
	async listAssets() {
		const all = await tx('assets', 'readonly', (s) => req2p(s.getAll()));
		return (all || []).sort((a, b) => b.created - a.created);
	},
	putAsset: (a) => tx('assets', 'readwrite', (s) => { s.put(a); return a; }),
	/* Inspiration Board */
	async listBoard() {
		const all = await tx('board', 'readonly', (s) => req2p(s.getAll()));
		return (all || []).sort((a, b) => b.created - a.created);
	},
	putBoard: (it) => tx('board', 'readwrite', (s) => { s.put(it); return it; }),
	async deleteBoard(it) {
		if (it.blob) await tx('blobs', 'readwrite', (s) => { s.delete(it.blob); });
		return tx('board', 'readwrite', (s) => { s.delete(it.id); });
	},
	async deleteAsset(a) {
		await tx('blobs', 'readwrite', (s) => { [a.blob, a.thumb, a.original].filter(Boolean).forEach((id) => s.delete(id)); });
		return tx('assets', 'readwrite', (s) => { s.delete(a.id); });
	},
	async duplicate(p, name) {
		const copy = JSON.parse(JSON.stringify(p));
		copy.id = uid();
		copy.name = name;
		copy.created = Date.now();
		const map = {};
		for (const id of blobIds(p)) {
			const b = await this.getBlob(id);
			if (b) map[id] = await this.putBlob(b);
		}
		copy.thumb = p.thumb;
		for (const v of copy.views) {
			v.base = map[v.base] || v.base;
			v.edited = v.edited ? map[v.edited] || v.edited : null;
		}
		return this.putProject(copy);
	}
};

function blobIds(p) {
	const out = [];
	for (const v of p.views || []) {
		if (v.base) out.push(v.base);
		if (v.edited) out.push(v.edited);
	}
	return out;
}

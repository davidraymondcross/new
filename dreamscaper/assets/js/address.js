/* DreamScaper – address autocomplete (keyboard + touch friendly). */
import { h, debounce, US_STATES } from './util.js?v=2.7.8';
import { apiBase } from './api.js?v=2.7.8';

/**
 * Wraps an <input> with a suggestion list. Returns the wrapper element to insert
 * in place of the input. opts: { api, ct (limit to Connecticut), onPick(item) }
 */
export function addressField(input, { api, ct = false, onPick } = {}) {
	api = api || apiBase();
	const list = h('ul', { class: 'ds-ac', role: 'listbox', hidden: true });
	const wrap = h('div', { class: 'ds-ac-wrap' }, input, list);
	input.setAttribute('autocomplete', 'off');
	input.setAttribute('role', 'combobox');
	input.setAttribute('aria-autocomplete', 'list');
	input.setAttribute('aria-expanded', 'false');
	let items = [], active = -1, seq = 0, picked = '';
	const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; };
	const paint = () => {
		list.innerHTML = '';
		items.forEach((it, i) => {
			const li = h('li', { role: 'option', class: i === active ? 'on' : '', 'aria-selected': i === active ? 'true' : 'false' }, it.label);
			li.addEventListener('pointerdown', (e) => { e.preventDefault(); choose(i); });
			list.append(li);
		});
		list.hidden = !items.length;
		input.setAttribute('aria-expanded', items.length ? 'true' : 'false');
	};
	const choose = (i) => {
		const it = items[i];
		if (!it) return;
		input.value = picked = it.label;
		close();
		onPick && onPick(it);
	};
	const fetchSoon = debounce(async () => {
		const q = input.value.trim();
		if (q.length < 3 || q === picked) { items = []; paint(); return; }
		const my = ++seq;
		try {
			const r = await fetch(api + 'suggest' + (api.includes('?') ? '&' : '?') + new URLSearchParams({ q, ct: ct ? 1 : 0 }));
			const j = await r.json();
			if (my !== seq) return;
			items = (j && j.items) || [];
			active = -1;
			paint();
		} catch (e) { /* offline: just no suggestions */ }
	}, 220);
	input.addEventListener('input', fetchSoon);
	input.addEventListener('keydown', (e) => {
		if (list.hidden) return;
		if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % items.length; paint(); }
		else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + items.length) % items.length; paint(); }
		else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); e.stopImmediatePropagation(); choose(active); }
		else if (e.key === 'Escape') close();
	});
	input.addEventListener('blur', () => setTimeout(close, 150));
	return wrap;
}

/** Split "12 Oak St, Hartford, CT 06103" (or "…, Austin, Texas 78701") into parts. */
export function parseAddress(label) {
	const parts = String(label || '').split(',').map((x) => x.trim()).filter((x) => x && x !== 'USA' && x !== 'United States');
	const out = { street: parts[0] || '', town: parts[1] || '', state: '', zip: '' };
	const rest = parts.slice(2).join(' ');
	const z = rest.match(/\b(\d{5})(?:-\d{4})?\b/);
	if (z) out.zip = z[1];
	const sp = rest.replace(/\d{5}(-\d{4})?/, '').trim();
	const hit = US_STATES.find(([a, n]) => a === sp.toUpperCase() || n.toLowerCase() === sp.toLowerCase());
	if (hit) out.state = hit[0];
	return out;
}
/** The full parts of an address (with ZIP) from the server; falls back to parsing the text. */
export async function addressDetails(label, item = {}) {
	const local = { ...parseAddress(label), ...(item.street ? { street: item.street, town: item.town || '', state: item.state || '', zip: item.zip || '' } : {}) };
	if (local.street && local.town && local.state && local.zip) return { ...local, lat: item.lat || 0, lng: item.lng || 0 };
	try {
		const r = await fetch(apiBase() + 'address/details?' + new URLSearchParams({ q: label }));
		const j = await r.json();
		if (j && j.ok) return { street: local.street || j.street, town: j.town || local.town, state: j.state || local.state, zip: j.zip || local.zip, lat: j.lat, lng: j.lng };
	} catch (e) { /* offline: keep what we parsed */ }
	return { ...local, lat: item.lat || 0, lng: item.lng || 0 };
}
/**
 * Autocomplete on a street input that also fills the town, state and ZIP fields.
 * f: { street, town, state, zip } (inputs or selects; any can be missing), onPick(parts) optional.
 * Returns the wrapper to put in place of the street input.
 */
export function addressGroup(f, onPick) {
	return addressField(f.street, { onPick: async (it) => {
		const quick = parseAddress(it.label);
		const set = (el, v) => { if (el && v) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } };
		set(f.street, it.street || quick.street); set(f.town, it.town || quick.town); set(f.state, it.state || quick.state); set(f.zip, it.zip || quick.zip);
		const d = await addressDetails(it.label, it);
		set(f.street, d.street); set(f.town, d.town); set(f.state, d.state); set(f.zip, d.zip);
		if (onPick) onPick(d);
	} });
}

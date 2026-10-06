/* DreamScaper – address autocomplete (keyboard + touch friendly). */
import { h, debounce } from './util.js?v=2.7.1';

/**
 * Wraps an <input> with a suggestion list. Returns the wrapper element to insert
 * in place of the input. opts: { api, ct (limit to Connecticut), onPick(item) }
 */
export function addressField(input, { api, ct = false, onPick } = {}) {
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

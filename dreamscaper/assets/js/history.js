/* DreamScaper – History window: every change in order. Tap a step to go back to it
 * (later steps stay listed, greyed, so you can tap them to go forward again).
 */
import { h, put, icon } from './util.js?v=2.7.3';

const ago = (t) => {
	if (!t) return '';
	const s = Math.round((Date.now() - t) / 1000);
	if (s < 45) return 'just now';
	if (s < 3600) return Math.round(s / 60) + ' min ago';
	return new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

/**
 * opts: { title, start: 'Original photo', steps: () => [{label, icon, t, done, thumb?}], current: () => n,
 *         goTo(n), note, onClose }
 * n = number of steps applied (0 = start). Returns { el, refresh, close }.
 */
export function historyPanel(opts) {
	const list = h('ol', { class: 'ds-hist-list' });
	const close = () => { el.remove(); opts.onClose && opts.onClose(); };
	const el = h('aside', { class: 'ds-hist', role: 'dialog', 'aria-label': opts.title || 'History' },
		h('div', { class: 'ds-hist-head' }, h('b', null, icon('layers', 18), ' ', opts.title || 'History'),
			h('button', { class: 'ds-icon-btn', 'aria-label': 'Close history', onclick: close }, icon('close', 18))),
		h('p', { class: 'ds-hint' }, opts.note || 'Tap any step to go back to it. Steps after it turn grey — tap one to bring it back.'),
		list);
	const refresh = () => {
		const steps = opts.steps();
		const cur = opts.current();
		list.innerHTML = '';
		const row = (i, label, ic, t, thumb, state) => h('li', null, h('button', { class: 'ds-hist-step ' + state, 'aria-current': state === 'now' ? 'step' : null, onclick: () => { opts.goTo(i); refresh(); } },
			thumb ? h('img', { src: thumb, alt: '' }) : h('span', { class: 'ds-hist-ic' }, icon(ic, 16)),
			h('span', { class: 'ds-hist-txt' }, h('b', null, label), h('small', null, state === 'later' ? 'Undone — tap to redo' : state === 'now' ? 'You are here' + (t ? ' · ' + ago(t) : '') : ago(t)))));
		put(list, row(0, opts.start || 'Start', 'image', 0, opts.startThumb ? opts.startThumb() : null, cur === 0 ? 'now' : 'past'));
		steps.forEach((s, k) => put(list, row(k + 1, s.label, s.icon || 'edit', s.t, s.thumb, k + 1 === cur ? 'now' : k + 1 < cur ? 'past' : 'later')));
		const now = list.querySelector('.now');
		if (now) now.scrollIntoView({ block: 'nearest' });
	};
	refresh();
	return { el, refresh, close };
}

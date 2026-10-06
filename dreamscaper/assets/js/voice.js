/* DreamScaper – one-button voice search (Web Speech API, runs in the browser).
 * Chrome, Edge and Safari support it; on browsers without it the button is hidden.
 */
import { h, icon } from './util.js?v=2.6.0';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const voiceSupported = !!SR;
let active = null;

/**
 * A mic button that fills `input` with what the customer says and fires an
 * `input` event so the search runs. Returns null when voice isn't available.
 */
export function voiceButton(input, { onError, label = 'Search by voice', raw = false, append = false, listening = 'Listening… say a plant, color or feature', cls = '' } = {}) {
	if (!SR) return null;
	const btn = h('button', { type: 'button', class: 'ds-mic ' + cls, 'aria-label': label, title: label }, icon('mic', 18));
	btn.addEventListener('click', () => {
		if (active) { active.stop(); return; }
		let rec;
		try { rec = new SR(); } catch (e) { onError && onError('Voice search isn’t available in this browser.'); return; }
		rec.lang = navigator.language || 'en-US';
		rec.interimResults = true;
		rec.continuous = !!raw;
		rec.maxAlternatives = 1;
		const before = input.value;
		let finalText = '';
		active = rec;
		btn.classList.add('on');
		btn.setAttribute('aria-pressed', 'true');
		input.placeholder = listening;
		rec.onresult = (e) => {
			let txt = '';
			for (let i = 0; i < e.results.length; i++) {
				txt += e.results[i][0].transcript;
				if (e.results[i].isFinal) finalText = txt;
			}
			input.value = raw ? (append && before ? before.replace(/\s*$/, ' ') : '') + txt.trim() : clean(txt);
			input.dispatchEvent(new Event('input', { bubbles: true }));
		};
		rec.onerror = (e) => {
			const msg = e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Allow microphone access to search by voice.'
				: e.error === 'no-speech' ? 'Didn’t catch that — tap the mic and try again.'
					: e.error === 'network' ? 'Voice search needs an internet connection.' : '';
			if (msg && onError) onError(msg);
		};
		rec.onend = () => {
			active = null;
			btn.classList.remove('on');
			btn.removeAttribute('aria-pressed');
			input.placeholder = input.dataset.ph || input.placeholder;
			if (!finalText && !input.value) { input.value = before; input.dispatchEvent(new Event('input', { bubbles: true })); }
		};
		if (!input.dataset.ph) input.dataset.ph = input.placeholder;
		try { rec.start(); } catch (e) { active = null; btn.classList.remove('on'); }
	});
	return btn;
}

const FILLER = /\b(show me|find me|find|search for|search|look for|i want|i need|i'd like|id like|can you|please|some|any|a|an|the|with|that has|that have|that|which|for|of|in|my|me|plants?|kinds?|types?|ones?)\b/g;
/** Turn a spoken request ("show me purple flowers for shade") into search words. */
export function clean(t) {
	return t.toLowerCase().replace(/[.,!?]/g, ' ').replace(FILLER, ' ').replace(/\bflowers?\b/g, '').replace(/\s+/g, ' ').trim();
}

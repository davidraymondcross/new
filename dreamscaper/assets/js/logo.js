/* DreamScaper – the logo: a head in profile with a dream of plants growing out of it
 * (like the "idea" lightbulb, but leaves and a curling vine). Pure SVG, no files.
 */
import { h } from './util.js?v=2.7.3';

let n = 0;
const leaf = (x, y, rot, s, fill, vein = true) =>
	`<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})"><path d="M0 0C9-6 12-20 0-34C-12-20-9-6 0 0Z" fill="${fill}"/>${vein ? '<path d="M0-2V-29" stroke="rgba(6,36,20,.45)" stroke-width="1.6" fill="none" stroke-linecap="round"/>' : ''}</g>`;

/** The mark (head + growing thoughts) as an SVG string. */
export function logoSvg(size = 40, { glow = true, simple = false } = {}) {
	const id = 'dsl' + ++n;
	return `<svg viewBox="0 0 200 200" width="${size}" height="${size}" role="img" aria-label="DreamScaper logo" xmlns="http://www.w3.org/2000/svg">
<defs>
 <linearGradient id="${id}h" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8ef0b4"/><stop offset=".55" stop-color="#3fb877"/><stop offset="1" stop-color="#1d7a4b"/></linearGradient>
 <linearGradient id="${id}l" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#5fd38f"/><stop offset="1" stop-color="#c9f27a"/></linearGradient>
 <radialGradient id="${id}g" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#f4e27a" stop-opacity=".95"/><stop offset=".55" stop-color="#f4c95d" stop-opacity=".35"/><stop offset="1" stop-color="#f4c95d" stop-opacity="0"/></radialGradient>
</defs>
${glow ? `<circle cx="104" cy="52" r="52" fill="url(#${id}g)" opacity=".55"/>` : ''}
<path d="M58 196C59 178 52 166 45 152C32 128 33 92 56 69C76 49 108 43 133 55C152 64 162 82 160 102L172 122C174 126 172 129 166 129L164 135C168 137 167 141 163 142C166 146 164 151 158 152C157 160 151 164 141 163C133 162 129 170 130 196Z" fill="url(#${id}h)"/>
<path d="M58 196C59 178 52 166 45 152C32 128 33 92 56 69" fill="none" stroke="#0b2a18" stroke-opacity=".18" stroke-width="5" stroke-linecap="round"/>
<circle cx="98" cy="104" r="31" fill="#0d1f16" opacity=".9"/>
<path d="M98 132C98 118 98 108 98 96" stroke="#9be6b5" stroke-width="4.5" fill="none" stroke-linecap="round"/>
${leaf(98, 112, -52, 0.78, `url(#${id}l)`)}
${leaf(98, 104, 48, 0.68, `url(#${id}l)`)}
${leaf(98, 96, 0, 0.5, '#c9f27a', false)}
${simple ? `<path d="M98 73C98 58 99 48 99 40" stroke="#7be0a0" stroke-width="6" fill="none" stroke-linecap="round"/>
${leaf(99, 50, -58, 0.95, `url(#${id}l)`)}
${leaf(99, 44, 52, 0.85, `url(#${id}l)`)}` : `<path d="M98 73C98 58 92 48 100 37C109 25 128 30 126 43C124 54 110 52 112 44" stroke="#7be0a0" stroke-width="4" fill="none" stroke-linecap="round"/>
<path d="M97 66C94 54 80 54 75 43C70 32 78 22 87 27C92 30 90 37 85 36" stroke="#7be0a0" stroke-width="3.6" fill="none" stroke-linecap="round"/>
${leaf(94, 58, -70, 0.62, `url(#${id}l)`)}
${leaf(101, 36, -25, 0.62, `url(#${id}l)`)}
${leaf(127, 38, 40, 0.6, `url(#${id}l)`)}
${leaf(77, 47, -105, 0.55, `url(#${id}l)`)}
${leaf(80, 26, -45, 0.5, `url(#${id}l)`)}
${leaf(116, 52, 75, 0.45, '#9be6b5', false)}
<g fill="#f4c95d">
 <circle cx="58" cy="52" r="4"/><circle cx="150" cy="18" r="3.2"/><circle cx="150" cy="62" r="3.6"/>
 <path d="M66 14l2.2 5 5 2.2-5 2.2-2.2 5-2.2-5-5-2.2 5-2.2z"/><path d="M140 36l1.6 3.6 3.6 1.6-3.6 1.6-1.6 3.6-1.6-3.6-3.6-1.6 3.6-1.6z"/>
</g>
${leaf(54, 34, -40, 0.32, '#9be6b5', false)}
${leaf(160, 44, 60, 0.3, '#9be6b5', false)}`}
</svg>`;
}

/** Small mark for headers. */
export function logoMark(size = 34) {
	return h('span', { class: 'ds-logo-mark', html: logoSvg(size, { glow: false, simple: true }) });
}

/** "DreamScaper" wordmark (capital S, one word). */
export function wordmark() {
	return h('span', { class: 'ds-wordmark' }, h('span', null, 'Dream'), h('span', null, 'Scaper'));
}

/** Big logo for the home page. */
export function logoArt() {
	return h('div', { class: 'ds-logo-hero' },
		h('div', { class: 'ds-logo-big', html: logoSvg(240) }),
		h('div', { class: 'ds-logo-type' }, wordmark(), h('small', null, 'Dream it. See it grow.')));
}

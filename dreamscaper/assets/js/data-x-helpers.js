/* DreamScaper – compact builders for the expanded library.
 * fam(common, sci, form, growth, traits, note, cultivars) turns a species plus a
 * list of real named cultivars into library rows:
 *   [name, botanical, form, height ft, width ft, growth, traits, note]
 * Each cultivar: [cultivar name, height ft, width ft, extra traits?, note?, form?]
 * Extra traits override the species traits with the same key (e.g. 'bl:white').
 * Sizes are typical landscape sizes at maturity on the East Coast (zones 5–7),
 * taken from grower and extension references; individual plants vary.
 */
function merge(base, extra) {
	if (!extra) return base;
	const out = new Map();
	for (const t of base.split(/\s+/).filter(Boolean)) out.set(t.includes(':') ? t.slice(0, t.indexOf(':')) : t, t);
	for (const t of extra.split(/\s+/).filter(Boolean)) {
		if (t.startsWith('-')) { out.delete(t.slice(1)); continue; }
		out.set(t.includes(':') ? t.slice(0, t.indexOf(':')) : t, t);
	}
	return [...out.values()].join(' ');
}
export function fam(common, sci, form, growth, traits, note, cultivars) {
	return cultivars.map(([cv, h, w, extra, n, f, g]) => [
		cv ? `${common} '${cv}'` : common,
		sci, f || form, h, w, g ?? growth, merge(traits, extra), n || note
	]);
}
/** Species rows written out in full: [name, sci, form, h, w, growth, traits, note]. */
export const sp = (...rows) => rows;

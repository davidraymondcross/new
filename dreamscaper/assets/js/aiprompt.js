/* DreamScaper AI – tap-to-build prompts for FLUX.2 [klein] 4B.
 *
 * FLUX.2 [klein] follows short, concrete, ordered prompts best:
 *   what to change (subject) → where/environment → style → photo/technical terms,
 * nouns over adjectives, under ~120 words, references named "image 2/3/4", and an
 * explicit list of what must stay the same so the house and camera angle survive.
 */
import { stateName } from './util.js?v=2.7.8';
import { session } from './api.js?v=2.7.8';

/** Where the plants have to grow: the person's state, else the site's home region, else the US. */
const region = () => stateName(session.user && session.user.state) || session.region || 'the United States';


/* ------------------------------------------------------------------ ideas
 * id, emoji, label, group, phrase (opt => text), options [[id,label,text]], hint */
export const IDEA_GROUPS = [
	['plants', 'Plants & beds'],
	['ground', 'Ground & lawn'],
	['hard', 'Patios, paths & features'],
	['clean', 'Clean up']
];

export const IDEAS = [
	// Plants & beds
	{ id: 'beds', e: '🌿', label: 'Planting beds', g: 'plants', opts: [
		['house', 'Along the house', 'a deep curved planting bed along the front of the house'],
		['walk', 'Along the walkway', 'planting beds lining both sides of the walkway'],
		['island', 'Island bed in the lawn', 'a curved island planting bed in the lawn'],
		['edge', 'Along the property line', 'a long curving planting bed along the property line']],
	text: (o) => 'add ' + o },
	{ id: 'shrubs', e: '🌳', label: 'Shrubs', g: 'plants', opts: [
		['mix', 'Mixed', 'a natural mix of evergreen and flowering shrubs'],
		['flower', 'Flowering', 'flowering shrubs such as hydrangeas, azaleas and roses'],
		['ever', 'Evergreen', 'evergreen shrubs such as boxwood, holly and dwarf conifers'],
		['native', 'Native', 'native shrubs such as inkberry, summersweet and viburnum']],
	text: (o) => 'plant ' + o + ' in the beds, spaced at mature size' },
	{ id: 'flowers', e: '🌸', label: 'Flowers', g: 'plants', opts: [
		['mix', 'Mixed colors', 'colorful flowering perennials in mixed colors'],
		['pinkpurple', 'Pink & purple', 'pink and purple flowering perennials such as coneflower, salvia and catmint'],
		['whiteblue', 'White & blue', 'white and blue flowering perennials such as hydrangea, nepeta and shasta daisy'],
		['warm', 'Yellow & orange', 'yellow and orange flowering perennials such as black-eyed Susan, coreopsis and daylily'],
		['red', 'Red', 'red flowering plants such as red salvia, bee balm and roses']],
	text: (o) => 'add ' + o + ' in bloom along the front of the beds' },
	{ id: 'tree', e: '🌲', label: 'Accent tree', g: 'plants', opts: [
		['jmaple', 'Japanese maple', 'one red Japanese maple as a focal point'],
		['flowering', 'Flowering tree', 'one flowering dogwood or cherry tree as a focal point'],
		['shade', 'Shade tree', 'one young shade tree such as a red maple in the lawn'],
		['evergreen', 'Evergreen tree', 'one natural-looking evergreen tree such as a spruce or pine']],
	text: (o) => 'plant ' + o },
	{ id: 'privacy', e: '🛡️', label: 'Privacy screen', g: 'plants', opts: [
		['hedge', 'Evergreen hedge', 'a row of tall evergreen arborvitae as a privacy screen along the property line'],
		['mixed', 'Mixed screen', 'a layered privacy screen of evergreens and tall shrubs along the property line'],
		['grasses', 'Tall grasses', 'a band of tall ornamental grasses for privacy']],
	text: (o) => 'add ' + o },
	{ id: 'grasses', e: '🌾', label: 'Ornamental grasses', g: 'plants', text: () => 'add clumps of ornamental grasses with feathery plumes' },
	{ id: 'groundcover', e: '🍀', label: 'Groundcover', g: 'plants', text: () => 'fill gaps with low spreading groundcover plants' },
	{ id: 'pots', e: '🪴', label: 'Planters by the door', g: 'plants', text: () => 'place two large planters with flowers beside the front door' },
	// Ground & lawn
	{ id: 'mulch', e: '🟤', label: 'Fresh mulch', g: 'ground', opts: [
		['brown', 'Dark brown', 'fresh dark brown hardwood mulch'],
		['black', 'Black', 'fresh black mulch'],
		['red', 'Red', 'fresh red mulch'],
		['natural', 'Natural cedar', 'fresh natural cedar mulch']],
	text: (o) => 'cover the beds with ' + o },
	{ id: 'stone', e: '🪨', label: 'Decorative stone', g: 'ground', opts: [
		['river', 'River rock', 'smooth gray river rock'],
		['pea', 'Pea gravel', 'tan pea gravel'],
		['white', 'White stone', 'white marble chips'],
		['beach', 'Beach pebbles', 'dark Mexican beach pebbles']],
	text: (o) => 'use ' + o + ' as the bed ground cover instead of mulch' },
	{ id: 'lawn', e: '🌱', label: 'Lush lawn', g: 'ground', text: () => 'make the lawn thick, even and green with no bare spots' },
	{ id: 'edging', e: '〰️', label: 'Crisp bed edges', g: 'ground', opts: [
		['spade', 'Natural edge', 'a crisp hand-cut natural edge'],
		['steel', 'Steel edging', 'thin black steel edging'],
		['stone', 'Stone edging', 'a low row of natural stone edging'],
		['brick', 'Brick edging', 'a brick soldier-course edging']],
	text: (o) => 'give the beds smooth curved lines with ' + o },
	{ id: 'boulders', e: '🗿', label: 'Accent boulders', g: 'ground', text: () => 'set two or three natural accent boulders into the beds' },
	// Hardscape
	{ id: 'walk', e: '🚶', label: 'Walkway', g: 'hard', opts: [
		['bluestone', 'Bluestone', 'a bluestone walkway'],
		['pavers', 'Pavers', 'a concrete paver walkway'],
		['flagstone', 'Flagstone', 'a natural flagstone walkway'],
		['brick', 'Brick', 'a brick walkway'],
		['steppers', 'Stepping stones', 'large stepping stones set in the lawn']],
	text: (o) => 'build ' + o + ' leading to the front door' },
	{ id: 'patio', e: '🪑', label: 'Patio', g: 'hard', opts: [
		['pavers', 'Pavers', 'a paver patio'],
		['bluestone', 'Bluestone', 'a bluestone patio'],
		['flagstone', 'Flagstone', 'a natural flagstone patio'],
		['concrete', 'Stamped concrete', 'a stamped concrete patio']],
	text: (o) => 'add ' + o + ' with outdoor furniture' },
	{ id: 'wall', e: '🧱', label: 'Stone wall', g: 'hard', opts: [
		['retain', 'Retaining wall', 'a low natural stone retaining wall'],
		['seat', 'Seating wall', 'a curved stone seating wall'],
		['dry', 'Fieldstone wall', 'a dry-stacked New England fieldstone wall']],
	text: (o) => 'add ' + o },
	{ id: 'steps', e: '🪜', label: 'Stone steps', g: 'hard', text: () => 'add natural stone steps where the ground slopes' },
	{ id: 'firepit', e: '🔥', label: 'Fire pit', g: 'hard', text: () => 'add a round stone fire pit with seating around it' },
	{ id: 'pergola', e: '⛩️', label: 'Pergola or arbor', g: 'hard', text: () => 'add a wooden pergola' },
	{ id: 'fence', e: '🪵', label: 'Fence', g: 'hard', opts: [
		['cedar', 'Cedar privacy', 'a 6-foot cedar privacy fence'],
		['vinyl', 'White vinyl', 'a white vinyl fence'],
		['alum', 'Black aluminum', 'a black aluminum fence'],
		['rail', 'Split rail', 'a rustic split-rail fence']],
	text: (o) => 'add ' + o + ' along the property line' },
	{ id: 'water', e: '⛲', label: 'Water feature', g: 'hard', text: () => 'add a small natural-stone bubbling water feature in a bed' },
	{ id: 'lights', e: '💡', label: 'Landscape lighting', g: 'hard', text: () => 'add warm low-voltage path lights and uplights on the trees and house' },
	// Clean up
	{ id: 'weeds', e: '🌼', label: 'Remove weeds', g: 'clean', text: () => 'remove all weeds from the beds and lawn' },
	{ id: 'overgrown', e: '✂️', label: 'Remove plants', g: 'clean', opts: [
		['overgrown', 'Only overgrown ones', 'remove the overgrown and dead shrubs'],
		['all', 'All existing plants', 'remove all existing shrubs and plants from the beds (keep the trees)']],
	text: (o) => o },
	{ id: 'trim', e: '🌿', label: 'Trim shrubs', g: 'clean', text: () => 'neatly trim and shape the existing shrubs' },
	{ id: 'clutter', e: '🧹', label: 'Hide clutter', g: 'clean', text: () => 'remove clutter such as hoses, trash cans, toys and stray debris' }
];

/* -------------------------------------------------------- style & goals
 * single: only one from that group. These shape HOW it looks (constraints). */
export const GOAL_GROUPS = [
	{ id: 'look', label: 'Style', single: true, items: [
		['classic', '🏡 Classic New England', 'classic New England landscape style'],
		['modern', '◻️ Modern & clean', 'modern, clean landscape style with simple shapes and repeated plants'],
		['cottage', '🌼 Cottage & natural', 'relaxed cottage-garden style with soft, natural layers'],
		['formal', '🏛️ Formal & tidy', 'formal, symmetrical landscape with clipped shapes'],
		['woodland', '🌲 Woodland', 'natural woodland garden style'],
		['contemporary', '🔷 Contemporary', 'contemporary landscape style with clean lines, ornamental grasses and architectural plants'],
		['natural', '🍃 Natural', 'naturalistic landscape with drifts of plants and soft edges'],
		['rustic', '🪵 Rustic', 'rustic landscape with fieldstone, split rail and informal plantings'],
		['luxury', '💎 Luxury', 'high-end luxury landscape with specimen trees, bluestone and layered plantings']] },
	{ id: 'care', label: 'Practical', single: false, items: [
		['nicer', '✨ Curb appeal', 'designed for maximum curb appeal'],
		['lowmaint', '🌿 Low maintenance', 'low-maintenance plants with plenty of mulch and no fussy plants'],
		['native', '🐝 Native & pollinator', 'native, pollinator-friendly plants'],
		['deer', '🦌 Deer resistant', 'deer-resistant plants'],
		['budget', '💲 Budget friendly', 'a simple, budget-friendly design'],
		['family', '🐕 Kid & pet friendly', 'durable, kid- and pet-friendly plants with open lawn'],
		['dry', '☀️ Drought tolerant', 'drought-tolerant plants']] },
	{ id: 'sun', label: 'Light', single: true, items: [
		['full', '🌞 Full sun', 'plants that thrive in full sun'],
		['part', '⛅ Part shade', 'plants suited to part shade'],
		['shade', '🌥️ Shade', 'shade-loving plants such as hostas, ferns and astilbe']] },
	{ id: 'color', label: 'Colors', single: true, items: [
		['bold', '🎨 Bold & colorful', 'bold, colorful flowers and foliage'],
		['soft', '🤍 Soft & white', 'a soft palette of white, cream and silver'],
		['green', '💚 Mostly green', 'a calm, mostly green palette with texture']] },
	{ id: 'keep', label: 'Keep', single: false, items: [
		['trees', '🌳 Keep my trees', 'keep all existing trees'],
		['shrubs', '🌲 Keep my shrubs', 'keep the existing shrubs'],
		['lawn', '🌱 Keep my lawn', 'keep the existing lawn area the same size'],
		['walk', '🚶 Keep my walkway', 'keep the walkway exactly where and as it is'],
		['patio', '🧱 Keep my patio', 'keep the patio exactly as it is'],
		['fence', '🚧 Keep my fence', 'keep the fence exactly as it is'],
		['beds', '🪴 Keep bed shapes', 'keep the existing bed outlines']] },
	{ id: 'change', label: 'Free to change', single: false, items: [
		['lawn', '🟩 Lawn', 'reshape or replace the lawn'],
		['beds', '🪴 Beds', 'redesign the planting beds'],
		['walk', '🚶 Walkway', 'change the walkway'],
		['patio', '🧱 Patio', 'add or change a patio'],
		['plants', '🌿 Plants', 'replace the existing shrubs and plants'],
		['fence', '🚧 Fence', 'change the fence']] },
	{ id: 'amount', label: 'How big a change', single: true, items: [
		['subtle', '🙂 Subtle refresh', 'subtle'],
		['moderate', '🌿 Noticeable', 'moderate'],
		['makeover', '🚀 Total makeover', 'makeover']] },
	{ id: 'when', label: 'Show it in', single: true, items: [
		['spring', '🌷 Spring', 'in spring with fresh growth and spring blooms'],
		['summer', '☀️ Summer', 'in early summer'],
		['fall', '🍂 Fall', 'in autumn with fall foliage color'],
		['winter', '❄️ Winter', 'in winter with a light dusting of snow'],
		['dusk', '🌆 Dusk + lights', 'at dusk with warm landscape lights glowing']] }
];

/* ------------------------------------------------ inspiration image roles */
export const REF_ROLES = [
	['plant', 'Use this plant', (n, note) => `plant more of the plant shown in image ${n}${note ? ' ' + note : ' in the beds'}`],
	['material', 'Use this material', (n, note) => `use the stone or paving material shown in image ${n}${note ? ' for ' + note : ' for the walkway, patio or bed cover'}`],
	['item', 'Add this item', (n, note) => `add the object shown in image ${n}${note ? ' ' + note : ' in a natural spot'}, at a realistic size`],
	['style', 'Copy this look', (n, note) => `match the overall landscape design, plant choices and style of image ${n}${note ? ' (' + note + ')' : ''}`]
];

const KEEP = 'Keep the house, roof, windows, doors, siding colors, driveway, camera angle, perspective and framing exactly the same';

/**
 * Build the FLUX.2 [klein] edit prompt.
 * s = { words (free text / voice), ideas: {id: optId|true}, goals: {groupId: id | Set}, refs: [{role, note}], aerial }
 */
export function buildPrompt(s) {
	const changes = [];
	if (s.words && s.words.trim()) changes.push(s.words.trim().replace(/[.\s]+$/, ''));
	for (const it of IDEAS) {
		const v = s.ideas[it.id];
		if (!v) continue;
		const opt = it.opts ? (it.opts.find((o) => o[0] === v) || it.opts[0])[2] : '';
		changes.push(it.text(opt));
	}
	(s.refs || []).forEach((r, i) => {
		const role = REF_ROLES.find((x) => x[0] === r.role) || REF_ROLES[0];
		changes.push(role[2](i + 2, (r.note || '').trim()));
	});
	const g = s.goals || {};
	const pick = (gid) => {
		const grp = GOAL_GROUPS.find((x) => x.id === gid);
		const v = g[gid];
		if (!grp || !v) return [];
		const ids = v instanceof Set ? [...v] : [v];
		return grp.items.filter((x) => ids.includes(x[0])).map((x) => x[2]);
	};
	const amount = pick('amount')[0];
	const style = [...pick('look'), ...pick('care'), ...pick('sun'), ...pick('color')];
	const keep = pick('keep');
	const free = pick('change');
	const when = pick('when')[0];

	const subject = s.aerial ? 'this top-down aerial photo of a home and yard' : 'this photo of a home and its yard';
	let lead = `Edit ${subject}`;
	if (amount === 'subtle') lead += ' with a light, realistic refresh';
	if (amount === 'makeover') lead += ' into a complete professional landscape makeover';
	if (!changes.length) changes.push(amount === 'subtle' ? 'tidy and refresh the existing landscaping' : 'design an attractive, professionally installed landscape');

	const parts = [];
	parts.push(`${lead}: ${changes.join('; ')}.`);
	if (style.length) parts.push(`Style: ${style.join(', ')}; plants that grow in ${region()}.`);
	else parts.push(`Use plants that grow in ${region()}.`);
	if (when) parts.push(`Show it ${when}.`);
	if (free.length) parts.push(`You may ${free.join(', ')}.`);
	parts.push(`${KEEP}${keep.length ? '; ' + keep.join('; ') : ''}${amount === 'subtle' ? '; change as little as possible' : ''}.`);
	parts.push(s.aerial
		? 'Realistic high-resolution aerial photograph, true-to-scale plants seen from directly above.'
		: 'Realistic professional landscape photograph, natural daylight, sharp detail, true-to-scale plants that look freshly installed.');
	return parts.join(' ');
}

/** One-line human summary of the picks (for the lead email). */
export function summarize(s) {
	const out = [];
	if (s.words) out.push('Said/typed: ' + s.words);
	for (const it of IDEAS) {
		const v = s.ideas[it.id];
		if (!v) continue;
		const o = it.opts ? (it.opts.find((x) => x[0] === v) || it.opts[0])[1] : '';
		out.push(it.label + (o ? ` (${o})` : ''));
	}
	for (const grp of GOAL_GROUPS) {
		const v = (s.goals || {})[grp.id];
		if (!v) continue;
		const ids = v instanceof Set ? [...v] : [v];
		const names = grp.items.filter((x) => ids.includes(x[0])).map((x) => x[1].replace(/^\S+\s/, ''));
		if (names.length) out.push(grp.label + ': ' + names.join(', '));
	}
	(s.refs || []).forEach((r, i) => out.push(`Inspiration photo ${i + 1}: ${(REF_ROLES.find((x) => x[0] === r.role) || REF_ROLES[0])[1]}${r.note ? ' – ' + r.note : ''}`));
	return out.join('\n');
}

/* --------------------------------------------- after-generation tweaks */
export const TWEAKS = [
	['moreflowers', '🌸 More flowers', 'add more flowers in bloom to the existing beds'],
	['fewer', '➖ Fewer plants', 'remove some plants so the beds look less crowded and more spacious'],
	['bigger', '⬆️ Bigger plants', 'make the new plants larger and more mature'],
	['smaller', '⬇️ Smaller plants', 'make the new plants smaller, like newly planted'],
	['greener', '🌱 Greener lawn', 'make the lawn greener and thicker'],
	['darker', '🟫 Darker mulch', 'make the mulch darker brown'],
	['sunnier', '☀️ Sunnier', 'make the light brighter and sunnier'],
	['realer', '📷 More realistic', 'make everything look more like a real, unedited photograph with natural textures']
];

export function tweakPrompt(text, aerial) {
	return `Edit ${aerial ? 'this aerial photo' : 'this photo'}: ${text.trim().replace(/[.\s]+$/, '')}. Keep everything else exactly the same — the same house, plants, layout, camera angle, lighting and colors. Realistic photograph.`;
}

export function regionPrompt(text) {
	return `Edit this photo: ${text.trim().replace(/[.\s]+$/, '')}. Change only that part; keep everything else exactly the same. Realistic photograph with matching light and perspective.`;
}

/** Good FLUX output size for an input (about 1 megapixel, multiples of 16). */
export function aiSize(w, h, mp = 1.0) {
	const ar = w / h;
	let W = Math.sqrt(mp * 1e6 * ar), H = W / ar;
	W = Math.round(W / 16) * 16; H = Math.round(H / 16) * 16;
	return { width: Math.max(256, Math.min(2048, W)), height: Math.max(256, Math.min(2048, H)) };
}

/** Change Style: one restyle instruction (keeps the house, driveway and camera). */
export const STYLES = [
	['traditional', 'Traditional', 'classic New England traditional landscape: neat foundation shrubs like boxwood and hydrangea, curved mulched beds, a flowering ornamental tree'],
	['modern', 'Modern', 'modern landscape: crisp straight-edged beds, massed grasses and boxwood in repeated rows, dark mulch or gray gravel, large-format pavers'],
	['contemporary', 'Contemporary', 'contemporary landscape: clean curves, ornamental grasses, architectural plants like yucca and Japanese forest grass, mixed stone and steel edging'],
	['natural', 'Natural', 'naturalistic landscape: soft drifts of native perennials and grasses, boulders, informal shapes'],
	['cottage', 'Cottage', 'cottage garden: abundant layered flowers (roses, catmint, coneflowers, hollyhocks), soft edges, a charming path'],
	['formal', 'Formal', 'formal landscape: symmetry, clipped boxwood hedges and spheres, straight paths, matching planters'],
	['rustic', 'Rustic', 'rustic landscape: fieldstone walls and steps, split-rail fence, informal native shrubs and perennials'],
	['lowmaint', 'Low-maintenance', 'low-maintenance landscape: few tough shrubs and grasses, generous mulch or stone, clean edges, no fussy annuals'],
	['native', 'Native', 'native plants of the local region (for example in the Northeast: switchgrass, little bluestem, coneflower, black-eyed Susan, bayberry, winterberry, serviceberry)'],
	['pollinator', 'Pollinator', 'pollinator garden: bee balm, milkweed, coneflower, asters, mountain mint and catmint in colorful layered drifts'],
	['luxury', 'Luxury', 'luxury estate landscape: specimen Japanese maples, layered evergreens, bluestone walkways, landscape lighting, lush perennial borders']
];
export function stylePrompt(id, aerial) {
	const st = STYLES.find((x) => x[0] === id) || STYLES[0];
	return `Redesign the landscaping in this ${aerial ? 'top-down aerial photo' : 'photo'} of a home in a ${st[1].toLowerCase()} style — ${st[2]} — using plants that grow in ${region()}. ${KEEP}. Realistic professional landscape photograph, natural daylight, true-to-scale plants.`;
}
export const KEEP_TEXT = KEEP;

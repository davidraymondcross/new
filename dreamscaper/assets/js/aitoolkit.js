/* DreamScaper – Dreamscape AI one-click tools: Select, Remove and Add one thing at a time.
 * Each Remove/Add is a single FLUX.2 [klein] edit. We find the area first (free, SAM 3) or let
 * the customer paint it, then paste the AI result back ONLY inside that area, so the rest of
 * the photo stays pixel-for-pixel unchanged.
 */

/** [id, label, emoji, what SAM should look for, replacement ideas] — selecting is free. */
export const SELECT = [
	['lawn', 'Lawn', '🟩', 'lawn grass', ['a mulched planting bed with shrubs', 'a bluestone patio', 'lush, thick green lawn', 'a native meadow garden']],
	['bed', 'Planting bed', '🪴', 'planting bed with mulch and plants', ['fresh dark brown mulch', 'river rock', 'a colorful perennial garden', 'neat boxwoods and hydrangeas']],
	['tree', 'Tree', '🌳', 'tree', ['a Japanese maple', 'a flowering dogwood', 'a river birch', 'a tall evergreen']],
	['shrub', 'Shrub', '🌿', 'shrub bush', ['round boxwoods', 'blue hydrangeas', 'arborvitae', 'flowering azaleas']],
	['patio', 'Patio', '🧱', 'patio', ['bluestone pavers', 'tan concrete pavers', 'brick pavers', 'a wood deck']],
	['walkway', 'Walkway', '🚶', 'walkway path sidewalk', ['a bluestone walkway', 'a brick path', 'stepping stones set in gravel', 'concrete pavers']],
	['driveway', 'Driveway', '🚗', 'driveway', ['a paver driveway', 'fresh blacktop', 'stamped concrete', 'crushed stone']],
	['house', 'House', '🏠', 'house', ['fresh white siding', 'dark gray siding with white trim', 'a new black front door and shutters', 'stone veneer on the lower walls']],
	['fence', 'Fence', '🚧', 'fence', ['a white vinyl privacy fence', 'a black aluminum fence', 'a cedar privacy fence', 'a split-rail fence']],
	['mulch', 'Mulch', '🟫', 'mulch', ['black mulch', 'red cedar mulch', 'river rock', 'pea gravel']],
	['stone', 'Stone / gravel', '🪨', 'gravel stones rocks', ['dark brown mulch', 'river rock', 'pea gravel', 'a planting bed']],
	['hedge', 'Hedge', '🌲', 'hedge', ['a neatly trimmed boxwood hedge', 'tall arborvitae screen', 'flowering hydrangea hedge']],
	['wall', 'Retaining wall', '🧱', 'retaining wall', ['a tan block retaining wall', 'a natural fieldstone wall', 'a gray stone wall with a cap']],
	['steps', 'Steps', '🪜', 'steps stairs', ['bluestone steps', 'brick steps', 'stone slab steps']],
	['deck', 'Deck', '🪵', 'deck', ['a gray composite deck', 'a stained cedar deck', 'a bluestone patio']],
	['flowers', 'Flowers', '🌸', 'flowers', ['red and white flowers', 'purple and pink perennials', 'yellow black-eyed Susans']],
	['weeds', 'Weeds', '🥀', 'weeds', ['clean dark mulch', 'healthy green lawn']]
];

/** [id, label, emoji, what to find, what fills the space] */
export const REMOVE = [
	['tree', 'Tree', '🌳', 'tree', 'lawn, sky, plants or whatever would naturally be behind it'],
	['shrub', 'Shrub', '🌿', 'shrub bush', 'the mulch, lawn or wall that would be behind it'],
	['plant', 'Plant', '🪴', 'plant', 'the mulch or soil around it'],
	['lawn', 'Lawn', '🟩', 'lawn grass', 'bare, freshly raked brown soil'],
	['mulch', 'Mulch', '🟫', 'mulch', 'bare brown soil'],
	['stone', 'Stone', '🪨', 'gravel stones rocks', 'bare soil'],
	['patio', 'Patio', '🧱', 'patio', 'green lawn'],
	['walkway', 'Walkway', '🚶', 'walkway path', 'green lawn'],
	['fence', 'Fence', '🚧', 'fence', 'the yard and plants behind it'],
	['shed', 'Shed', '🛖', 'shed', 'green lawn and the background behind it'],
	['vehicle', 'Vehicle', '🚙', 'car vehicle truck', 'the empty driveway or street'],
	['trash', 'Trash cans', '🗑️', 'trash cans garbage bins', 'the ground and wall behind them'],
	['weeds', 'Weeds', '🥀', 'weeds', 'clean mulch or healthy lawn to match the area'],
	['dead', 'Dead plants', '🍂', 'dead brown plant', 'clean mulch'],
	['stump', 'Tree stump', '🪵', 'tree stump', 'lawn or mulch to match the area'],
	['clutter', 'Toys & clutter', '🧸', 'toys clutter hose', 'the ground behind them'],
	['playset', 'Swing set', '🛝', 'swing set playground', 'green lawn'],
	['hoop', 'Basketball hoop', '🏀', 'basketball hoop', 'the driveway and background behind it'],
	['pool', 'Above-ground pool', '🏊', 'above ground pool', 'green lawn'],
	['decor', 'Lawn ornaments', '🦩', 'lawn ornament decoration statue', 'the lawn or mulch behind it']
];

/** [id, label, emoji, default thing, ideas] — the customer paints where (or lets the AI pick). */
export const ADD = [
	['plant', 'Plant', '🪴', 'a healthy flowering plant', ['hydrangea', 'hosta', 'coneflowers', 'daylilies', 'lavender']],
	['tree', 'Tree', '🌳', 'a young ornamental tree', ['Japanese maple', 'flowering dogwood', 'eastern redbud', 'river birch', 'blue spruce']],
	['shrub', 'Shrub', '🌿', 'a full, healthy shrub', ['boxwood', 'hydrangea', 'azalea', 'arborvitae', 'rhododendron']],
	['perennial', 'Perennial', '🌸', 'a group of flowering perennials', ['coneflowers', 'black-eyed Susans', 'catmint', 'peonies', 'daylilies']],
	['grass', 'Ornamental grass', '🌾', 'ornamental grasses', ['feather reed grass', 'little bluestem', 'fountain grass', 'switchgrass']],
	['flowerbed', 'Flower bed', '🌷', 'a colorful flower bed edged with mulch', ['red and white', 'pastel pinks and purples', 'bright yellows and oranges', 'all white']],
	['hedge', 'Hedge', '🌲', 'a neat evergreen hedge', ['boxwood', 'arborvitae privacy screen', 'holly', 'privet']],
	['mulch', 'Mulch', '🟫', 'fresh dark brown mulch', ['black mulch', 'dark brown mulch', 'red cedar mulch', 'natural pine mulch']],
	['stone', 'Stone', '🪨', 'decorative stone', ['river rock', 'pea gravel', 'crushed bluestone', 'white marble chips']],
	['boulders', 'Boulders', '🪨', 'a few natural boulders', ['fieldstone boulders', 'granite boulders', 'moss rock']],
	['pavers', 'Pavers', '🧱', 'concrete pavers', ['tan concrete pavers', 'gray concrete pavers', 'red brick pavers', 'bluestone', 'porcelain pavers']],
	['walkway', 'Walkway', '🚶', 'a paver walkway', ['bluestone', 'brick', 'stepping stones in gravel', 'tan pavers']],
	['patio', 'Patio', '🪑', 'a paver patio', ['bluestone', 'tan pavers', 'brick', 'stamped concrete']],
	['wall', 'Retaining wall', '🧱', 'a block retaining wall with a cap', ['tan block', 'gray block', 'natural fieldstone', 'with a planting bed on top']],
	['edging', 'Bed edging', '〰️', 'clean, curved bed edging', ['black metal edging', 'stone edging', 'brick soldier edging', 'natural spade-cut edge']],
	['steps', 'Steps', '🪜', 'stone steps', ['bluestone', 'stone slab', 'paver']],
	['lighting', 'Landscape lighting', '💡', 'warm landscape lighting at dusk', ['path lights', 'uplights on trees', 'step lights', 'string lights']],
	['fence', 'Fence', '🚧', 'a fence', ['white vinyl privacy', 'black aluminum', 'cedar privacy', 'split-rail']],
	['furniture', 'Outdoor furniture', '🪑', 'outdoor patio furniture', ['dining table and chairs', 'lounge chairs', 'a sectional sofa', 'Adirondack chairs']],
	['firepit', 'Fire pit', '🔥', 'a round stone fire pit', ['round stone', 'square paver', 'gas fire table']],
	['pergola', 'Pergola', '⛩️', 'a wood pergola', ['white vinyl', 'cedar', 'black aluminum']],
	['water', 'Water feature', '⛲', 'a small water feature', ['bubbling rock fountain', 'small pond', 'tiered fountain']],
	['feature', 'Garden feature', '🦋', 'a garden feature', ['bird bath', 'garden bench', 'arbor', 'large planter pots', 'garden statue']],
	['raised', 'Raised garden', '🥕', 'cedar raised vegetable beds', ['two cedar beds', 'stone raised bed', 'metal raised beds']]
];

const KEEP = 'Keep everything else in the photo exactly the same — same house, plants, camera angle, light and colors. Photorealistic.';

export function removePrompt(what, fill) {
	return `Remove the ${what} from this photo completely. Fill the space with ${fill}, matching the surroundings and lighting so it looks like it was never there. ${KEEP}`;
}
export function replacePrompt(what, withThis) {
	return `In this photo, change the ${what} inside the area outlined in pink to ${withThis}, at a realistic size and perspective with natural light and shadows. Remove the pink outline. ${KEEP}`;
}
export function improvePrompt(what) {
	return `In this photo, make the ${what} inside the area outlined in pink look healthier, fuller, cleaner and freshly maintained. Remove the pink outline. ${KEEP}`;
}
export function addPrompt(thing, painted) {
	return painted
		? `Add ${thing} inside the area outlined in pink, at a realistic size and perspective for this photo, with natural light and shadows. Remove the pink outline. ${KEEP}`
		: `Add ${thing} where it looks most natural in this yard, at a realistic size and perspective, with natural light and shadows. Change nothing else. ${KEEP}`;
}

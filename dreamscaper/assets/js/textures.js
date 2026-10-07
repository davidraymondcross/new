/* DreamScaper – ground materials: 120 seamless, procedurally painted tiles laid onto
 * the photo with true ground-plane perspective. Materials are generated lazily the
 * first time they're shown or used.
 */
import { rng, canvas, hsl } from './util.js?v=2.7.3';

const S = 256; // tile size in texels

/* --------------------------------------------------------- material list */
// [id, name, group, tile size ft, generator, params]
const M = [
	// Mulch
	['mulch', 'Hardwood Mulch', 'Mulch', 2.5, 'mulch', { base: [24, 45, 22], h: [16, 32], s: [32, 55], l: [12, 36] }],
	['mulch-dkbrown', 'Dark Brown Mulch', 'Mulch', 2.5, 'mulch', { base: [22, 40, 14], h: [18, 28], s: [30, 45], l: [8, 24] }],
	['mulch-black', 'Black Mulch', 'Mulch', 2.5, 'mulch', { base: [25, 12, 8], h: [18, 30], s: [6, 18], l: [5, 21] }],
	['mulch-red', 'Red Mulch', 'Mulch', 2.5, 'mulch', { base: [8, 50, 20], h: [4, 14], s: [42, 60], l: [16, 34] }],
	['mulch-cedar', 'Natural Cedar Mulch', 'Mulch', 2.5, 'mulch', { base: [26, 35, 32], h: [22, 34], s: [28, 48], l: [30, 56] }],
	['mulch-redcedar', 'Shredded Red Cedar', 'Mulch', 2.5, 'mulch', { base: [14, 45, 24], h: [10, 22], s: [42, 60], l: [24, 46], len: [12, 28], wid: [1, 2.2] }],
	['mulch-cypress', 'Cypress Mulch (Gold)', 'Mulch', 2.5, 'mulch', { base: [36, 40, 36], h: [32, 42], s: [38, 55], l: [34, 60] }],
	['mulch-hemlock', 'Hemlock Mulch', 'Mulch', 2.5, 'mulch', { base: [16, 50, 18], h: [12, 24], s: [45, 60], l: [16, 34] }],
	['nuggets', 'Pine Bark Nuggets', 'Mulch', 3, 'nuggets', { base: [20, 35, 12], h: [16, 28], s: [35, 55], l: [18, 36], r: [7, 14], n: 200 }],
	['nuggets-mini', 'Mini Pine Bark Nuggets', 'Mulch', 2.5, 'nuggets', { base: [20, 35, 12], h: [16, 28], s: [35, 55], l: [18, 36], r: [3.5, 7], n: 700 }],
	['playchips', 'Playground Wood Chips', 'Mulch', 3, 'mulch', { base: [36, 30, 40], h: [32, 44], s: [26, 42], l: [48, 74], len: [6, 16], wid: [2, 5] }],
	['leafmulch', 'Leaf Compost Mulch', 'Mulch', 2, 'grains', { base: [24, 35, 14], pal: [[22, 40, 10], [28, 35, 20], [32, 30, 28], [40, 25, 34]], r: [0.8, 3.5], n: 3200, bits: 1 }],
	['cocoa', 'Cocoa Hulls', 'Mulch', 2, 'nuggets', { base: [15, 40, 10], h: [10, 22], s: [35, 50], l: [12, 26], r: [2.2, 4.2], n: 1400 }],
	['rubber-black', 'Rubber Mulch (Black)', 'Mulch', 2.5, 'nuggets', { base: [0, 0, 8], h: [0, 10], s: [0, 6], l: [8, 22], r: [3, 6], n: 900, angular: 1 }],
	['rubber-red', 'Rubber Mulch (Red)', 'Mulch', 2.5, 'nuggets', { base: [2, 40, 18], h: [0, 8], s: [45, 60], l: [24, 40], r: [3, 6], n: 900, angular: 1 }],
	['pine', 'Pine Straw', 'Mulch', 3, 'straw', { base: [28, 40, 20], h: [24, 36], s: [50, 65], l: [28, 58] }],
	['pine-dark', 'Pine Straw (Weathered)', 'Mulch', 3, 'straw', { base: [24, 30, 14], h: [20, 30], s: [30, 45], l: [20, 40] }],
	// Stone & gravel
	['pea', 'Pea Gravel', 'Stone & Gravel', 1.5, 'pebbles', { base: [35, 12, 32], pal: [[35, 22, 62], [30, 12, 52], [40, 10, 78], [20, 30, 50], [0, 0, 60], [45, 25, 70]], r: [2, 4.4], n: 2300 }],
	['pea-tan', 'Pea Gravel (Tan)', 'Stone & Gravel', 1.5, 'pebbles', { base: [32, 20, 34], pal: [[35, 28, 62], [30, 25, 55], [40, 22, 70], [28, 30, 48]], r: [2, 4.4], n: 2300 }],
	['pea-gray', 'Pea Gravel (Gray)', 'Stone & Gravel', 1.5, 'pebbles', { base: [210, 5, 30], pal: [[210, 5, 55], [200, 6, 65], [30, 5, 48], [0, 0, 72]], r: [2, 4.4], n: 2300 }],
	['jersey', 'Jersey Shore Gravel', 'Stone & Gravel', 1.5, 'pebbles', { base: [40, 30, 35], pal: [[42, 55, 62], [38, 45, 55], [30, 40, 50], [45, 30, 72], [0, 0, 80]], r: [2, 4], n: 2400 }],
	['delaware', 'Delaware River Stone', 'Stone & Gravel', 2.5, 'pebbles', { base: [30, 12, 24], pal: [[30, 20, 55], [20, 30, 45], [210, 6, 52], [35, 28, 62], [12, 35, 40]], r: [5, 10], n: 520 }],
	['river', 'River Rock (2–3 in.)', 'Stone & Gravel', 3, 'pebbles', { base: [30, 10, 22], pal: [[30, 12, 55], [25, 18, 45], [210, 6, 50], [35, 20, 65], [15, 22, 40], [0, 0, 70]], r: [6, 14], n: 340 }],
	['river-lg', 'River Rock (3–5 in.)', 'Stone & Gravel', 4, 'pebbles', { base: [30, 10, 20], pal: [[30, 12, 55], [25, 18, 45], [210, 6, 50], [35, 20, 65]], r: [9, 19], n: 190 }],
	['beach-black', 'Mexican Beach Pebbles', 'Stone & Gravel', 2.5, 'pebbles', { base: [0, 0, 8], pal: [[210, 5, 22], [0, 0, 16], [30, 5, 28], [210, 8, 34]], r: [6, 12], n: 420, gloss: 1 }],
	['marble', 'White Marble Chips', 'Stone & Gravel', 1.5, 'crushed', { base: [40, 8, 70], pal: [[40, 10, 92], [40, 8, 85], [200, 5, 88], [35, 10, 80]], r: [2.4, 5], n: 2400 }],
	['crushed', 'Crushed Stone (3/4 in.)', 'Stone & Gravel', 1.5, 'crushed', { base: [210, 4, 35], pal: [[210, 5, 45], [210, 4, 60], [30, 4, 52], [210, 6, 70]], r: [1.8, 4.6], n: 2600 }],
	['traprock', 'Connecticut Trap Rock', 'Stone & Gravel', 1.5, 'crushed', { base: [215, 8, 26], pal: [[215, 10, 34], [220, 8, 42], [210, 6, 28], [25, 10, 36]], r: [1.8, 4.6], n: 2600 }],
	['crusherrun', 'Crusher Run (Processed Gravel)', 'Stone & Gravel', 1.5, 'crushed', { base: [30, 8, 45], pal: [[30, 6, 52], [210, 5, 58], [35, 8, 62]], r: [0.8, 3.5], n: 3400, fines: 1 }],
	['stonedust', 'Stone Dust', 'Stone & Gravel', 1, 'grains', { base: [210, 4, 58], pal: [[210, 5, 62], [210, 4, 52], [30, 4, 66]], r: [0.4, 1.4], n: 5000 }],
	['lava-red', 'Red Lava Rock', 'Stone & Gravel', 2, 'crushed', { base: [8, 50, 18], pal: [[8, 55, 32], [10, 50, 26], [5, 45, 22], [15, 40, 38]], r: [4, 9], n: 700, porous: 1 }],
	['lava-black', 'Black Lava Rock', 'Stone & Gravel', 2, 'crushed', { base: [0, 0, 8], pal: [[0, 0, 18], [20, 6, 22], [0, 0, 28]], r: [4, 9], n: 700, porous: 1 }],
	['slate-gray', 'Slate Chips (Gray)', 'Stone & Gravel', 2, 'chips', { base: [210, 6, 22], pal: [[210, 8, 34], [205, 6, 40], [215, 10, 28]], r: [4, 9], n: 900 }],
	['slate-plum', 'Slate Chips (Plum)', 'Stone & Gravel', 2, 'chips', { base: [330, 10, 18], pal: [[330, 14, 30], [320, 10, 36], [210, 6, 32]], r: [4, 9], n: 900 }],
	['granite-pink', 'Pink Granite Chips', 'Stone & Gravel', 1.5, 'crushed', { base: [10, 15, 40], pal: [[10, 30, 62], [15, 20, 70], [0, 0, 30], [20, 15, 80]], r: [2, 4.6], n: 2400 }],
	['quartz', 'White Quartz Stone', 'Stone & Gravel', 2, 'crushed', { base: [40, 6, 60], pal: [[40, 8, 94], [40, 6, 86], [35, 12, 78]], r: [4, 8], n: 900, gloss: 1 }],
	['eggrock', 'Egg Rock (Gray)', 'Stone & Gravel', 4, 'pebbles', { base: [210, 5, 22], pal: [[210, 6, 55], [210, 5, 62], [30, 6, 50], [210, 8, 45]], r: [10, 20], n: 170 }],
	['autumnblend', 'Autumn Blend Stone', 'Stone & Gravel', 1.8, 'crushed', { base: [25, 20, 30], pal: [[25, 35, 48], [30, 25, 58], [15, 30, 42], [35, 15, 68]], r: [2.5, 5.5], n: 1800 }],
	['bluestone-gravel', 'Bluestone Gravel', 'Stone & Gravel', 1.5, 'crushed', { base: [210, 10, 30], pal: [[210, 14, 46], [205, 10, 54], [215, 12, 40]], r: [2, 4.4], n: 2400 }],
	['drycreek', 'Dry Creek Bed Stone', 'Stone & Gravel', 5, 'pebbles', { base: [30, 8, 24], pal: [[30, 10, 55], [210, 6, 52], [35, 15, 62], [25, 15, 45]], r: [7, 22], n: 230 }],
	['rainbow', 'Rainbow Rock', 'Stone & Gravel', 2.5, 'pebbles', { base: [25, 15, 25], pal: [[15, 45, 50], [35, 40, 60], [0, 30, 45], [45, 30, 70], [210, 8, 55]], r: [5, 10], n: 520 }],
	['cobble-loose', 'Loose Cobblestones', 'Stone & Gravel', 4, 'pebbles', { base: [30, 8, 20], pal: [[30, 10, 48], [210, 6, 45], [35, 12, 55]], r: [14, 24], n: 110 }],
	// Soil & sand
	['soil', 'Garden Soil', 'Soil & Sand', 2.5, 'grains', { base: [25, 35, 15], pal: [[22, 30, 10], [28, 30, 18], [25, 25, 24]], r: [0.6, 3], n: 2800 }],
	['topsoil', 'Screened Topsoil', 'Soil & Sand', 2, 'grains', { base: [25, 30, 22], pal: [[25, 28, 18], [28, 26, 28], [22, 30, 14]], r: [0.4, 1.8], n: 3600 }],
	['compost', 'Dark Compost', 'Soil & Sand', 2, 'grains', { base: [22, 30, 9], pal: [[22, 30, 6], [28, 25, 14], [35, 25, 22]], r: [0.6, 3], n: 3200, bits: 1 }],
	['clay', 'Red Clay', 'Soil & Sand', 2, 'grains', { base: [14, 45, 36], pal: [[14, 48, 32], [18, 42, 42], [10, 40, 28]], r: [0.6, 2.4], n: 2400, cracks: 1 }],
	['sand', 'Play Sand', 'Soil & Sand', 1.5, 'grains', { base: [40, 40, 70], pal: [[40, 42, 74], [38, 35, 66], [42, 30, 80], [35, 30, 60]], r: [0.4, 1.2], n: 6000 }],
	['beachsand', 'Beach Sand', 'Soil & Sand', 2, 'grains', { base: [38, 30, 66], pal: [[38, 30, 70], [35, 25, 62], [40, 20, 78], [30, 15, 50]], r: [0.4, 1.4], n: 5500, ripples: 1 }],
	['dg-tan', 'Decomposed Granite (Tan)', 'Soil & Sand', 1.5, 'grains', { base: [34, 35, 52], pal: [[34, 38, 56], [30, 35, 46], [38, 30, 64], [25, 30, 38]], r: [0.5, 2.2], n: 4200 }],
	['dg-gray', 'Decomposed Granite (Gray)', 'Soil & Sand', 1.5, 'grains', { base: [30, 6, 52], pal: [[30, 6, 56], [210, 5, 48], [30, 8, 64], [0, 0, 38]], r: [0.5, 2.2], n: 4200 }],
	['shell', 'Crushed Shell', 'Soil & Sand', 1.5, 'chips', { base: [40, 20, 70], pal: [[40, 25, 88], [30, 20, 80], [35, 15, 92], [20, 15, 70]], r: [2, 4.5], n: 1800 }],
	['dirt', 'Bare Dirt', 'Soil & Sand', 3, 'grains', { base: [28, 30, 30], pal: [[28, 28, 26], [30, 25, 36], [25, 30, 20]], r: [0.6, 3], n: 2200, cracks: 1 }],
	// Lawn & groundcover
	['lawn', 'Fresh Lawn', 'Lawn & Groundcover', 1.6, 'lawn', { base: [98, 45, 26], h: [85, 113], s: [40, 62], l: [22, 48] }],
	['lawn-kbg', 'Kentucky Bluegrass', 'Lawn & Groundcover', 1.6, 'lawn', { base: [120, 40, 22], h: [110, 130], s: [35, 50], l: [20, 40] }],
	['lawn-fescue', 'Tall Fescue', 'Lawn & Groundcover', 1.8, 'lawn', { base: [100, 40, 24], h: [90, 112], s: [35, 52], l: [22, 44], len: [6, 12], wid: [1.2, 2.2] }],
	['lawn-fine', 'Fine Fescue (Shade)', 'Lawn & Groundcover', 1.4, 'lawn', { base: [105, 35, 26], h: [95, 115], s: [28, 45], l: [24, 44], len: [3, 7], wid: [0.7, 1.1], n: 11000 }],
	['lawn-rye', 'Perennial Ryegrass', 'Lawn & Groundcover', 1.6, 'lawn', { base: [95, 55, 28], h: [85, 105], s: [48, 66], l: [26, 50] }],
	['lawn-stripes', 'Striped Mowed Lawn', 'Lawn & Groundcover', 6, 'lawn', { base: [98, 45, 26], h: [85, 113], s: [40, 62], l: [22, 48], stripes: 1 }],
	['sod', 'Fresh Sod', 'Lawn & Groundcover', 4, 'lawn', { base: [110, 50, 25], h: [95, 120], s: [45, 62], l: [22, 46], seams: 1 }],
	['lawn-dormant', 'Dormant Lawn', 'Lawn & Groundcover', 1.6, 'lawn', { base: [42, 30, 42], h: [38, 55], s: [20, 40], l: [40, 62] }],
	['seed-straw', 'New Seed with Straw', 'Lawn & Groundcover', 2, 'straw', { base: [28, 30, 22], h: [42, 50], s: [45, 60], l: [60, 78], sparse: 1 }],
	['clover', 'Clover Lawn', 'Lawn & Groundcover', 1.4, 'leaves', { base: [105, 45, 24], pal: [[105, 45, 34], [110, 40, 40], [100, 50, 30]], leaf: 'clover', size: [3, 5], n: 900, fl: [50, 15, 95], fn: 30 }],
	['microclover', 'Microclover Mix', 'Lawn & Groundcover', 1.4, 'lawn', { base: [102, 45, 26], h: [88, 112], s: [40, 60], l: [22, 46], clover: 1 }],
	['moss', 'Moss', 'Lawn & Groundcover', 1, 'grains', { base: [85, 50, 22], pal: [[85, 55, 28], [80, 50, 36], [90, 45, 20], [75, 55, 42]], r: [0.6, 2], n: 6000, soft: 1 }],
	['turf', 'Artificial Turf', 'Lawn & Groundcover', 1.6, 'lawn', { base: [110, 60, 28], h: [100, 118], s: [55, 70], l: [30, 48], uniform: 1 }],
	['spurge', 'Allegheny Spurge Carpet', 'Lawn & Groundcover', 2, 'leaves', { base: [130, 30, 14], pal: [[130, 25, 32], [125, 28, 38], [135, 22, 28]], leaf: 'whorl', size: [5, 9], n: 260 }],
	['phlox-carpet', 'Creeping Phlox Carpet', 'Lawn & Groundcover', 1.5, 'leaves', { base: [110, 35, 18], pal: [[110, 35, 28], [115, 30, 34]], leaf: 'needle', size: [2, 4], n: 1500, fl: [310, 60, 72], fn: 600 }],
	['thyme', 'Creeping Thyme Carpet', 'Lawn & Groundcover', 1.2, 'leaves', { base: [100, 30, 18], pal: [[100, 30, 30], [95, 25, 36]], leaf: 'oval', size: [1.2, 2.2], n: 2600, fl: [280, 40, 70], fn: 700 }],
	['sedum-carpet', 'Sedum Carpet', 'Lawn & Groundcover', 1.2, 'leaves', { base: [80, 40, 30], pal: [[60, 70, 55], [90, 45, 45], [20, 50, 42]], leaf: 'round', size: [1.6, 3], n: 2600 }],
	['ginger', 'Wild Ginger Carpet', 'Lawn & Groundcover', 2, 'leaves', { base: [120, 35, 12], pal: [[115, 40, 28], [120, 35, 34], [110, 40, 24]], leaf: 'heart', size: [8, 13], n: 160 }],
	['mondo', 'Mondo Grass Carpet', 'Lawn & Groundcover', 1.6, 'lawn', { base: [140, 30, 12], h: [130, 150], s: [25, 40], l: [14, 30], len: [8, 16], wid: [1.4, 2.4], curly: 1 }],
	['leaves', 'Fallen Autumn Leaves', 'Lawn & Groundcover', 2.5, 'leaves', { base: [30, 30, 18], pal: [[25, 85, 50], [40, 85, 55], [5, 70, 42], [30, 50, 35], [48, 80, 52]], leaf: 'maple', size: [6, 11], n: 420 }],
	['snow', 'Fresh Snow', 'Lawn & Groundcover', 3, 'snow', {}],
	// Pavers
	['pavers', 'Brick Pavers (Running Bond)', 'Pavers', 4, 'pavers', { pat: 'running', pal: [[8, 45, 32], [12, 45, 38], [6, 50, 28], [15, 40, 42]], joint: [38, 22, 58] }],
	['pavers-tumbled', 'Tumbled Clay Brick', 'Pavers', 4, 'pavers', { pat: 'running', pal: [[10, 40, 36], [20, 35, 44], [5, 35, 30], [25, 30, 50]], joint: [35, 15, 50], round: 1 }],
	['herringbone-red', 'Brick Herringbone (Red)', 'Pavers', 4, 'pavers', { pat: 'herring', pal: [[8, 45, 32], [12, 45, 38], [6, 50, 28]], joint: [38, 22, 58] }],
	['herringbone-gray', 'Herringbone (Charcoal)', 'Pavers', 4, 'pavers', { pat: 'herring', pal: [[210, 5, 28], [210, 4, 36], [30, 4, 32]], joint: [210, 5, 55] }],
	['basketweave', 'Brick Basketweave', 'Pavers', 4, 'pavers', { pat: 'basket', pal: [[8, 45, 32], [12, 42, 38], [15, 40, 44]], joint: [38, 22, 58] }],
	['holland-gray', 'Holland Stone (Gray)', 'Pavers', 4, 'pavers', { pat: 'running', pal: [[210, 4, 52], [210, 5, 58], [30, 4, 48]], joint: [210, 4, 35] }],
	['holland-tan', 'Holland Stone Herringbone (Tan)', 'Pavers', 4, 'pavers', { pat: 'herring', pal: [[35, 25, 58], [30, 28, 50], [40, 20, 66]], joint: [30, 10, 38] }],
	['cobble-pavers', 'Antique Cobble Pavers', 'Pavers', 4, 'pavers', { pat: 'cobble', pal: [[30, 15, 45], [25, 20, 40], [210, 5, 48], [35, 15, 55]], joint: [30, 10, 28], round: 1 }],
	['belgian', 'Belgian Block (Granite)', 'Pavers', 4, 'pavers', { pat: 'cobble', pal: [[210, 4, 50], [210, 5, 58], [30, 5, 45], [0, 0, 62]], joint: [30, 6, 30], round: 1 }],
	['hex-gray', 'Hexagon Pavers (Gray)', 'Pavers', 4, 'hex', { pal: [[210, 4, 55], [210, 4, 60], [30, 4, 50]], joint: [210, 5, 35] }],
	['hex-charcoal', 'Hexagon Pavers (Charcoal)', 'Pavers', 4, 'hex', { pal: [[210, 4, 25], [210, 4, 32], [30, 4, 28]], joint: [210, 5, 50] }],
	['ashlar-tan', 'Ashlar Pavers (Tan Blend)', 'Pavers', 6, 'ashlar', { pal: [[35, 25, 62], [30, 28, 54], [40, 20, 70], [25, 25, 48]], joint: [30, 10, 40] }],
	['ashlar-gray', 'Ashlar Pavers (Gray Blend)', 'Pavers', 6, 'ashlar', { pal: [[210, 5, 56], [30, 4, 50], [210, 4, 64], [210, 6, 44]], joint: [210, 5, 36] }],
	['slab-gray', 'Large Slab Pavers (2×2 ft)', 'Pavers', 4, 'pavers', { pat: 'stack', u: 2, pal: [[210, 3, 66], [210, 4, 62], [30, 3, 68]], joint: [210, 5, 45] }],
	['slab-charcoal', 'Large Format Pavers (Charcoal)', 'Pavers', 8, 'pavers', { pat: 'running', u: 4, ratio: 2, pal: [[210, 4, 28], [210, 4, 33], [30, 4, 30]], joint: [210, 5, 50] }],
	['plank', 'Modern Plank Pavers', 'Pavers', 6, 'pavers', { pat: 'running', u: 8, ratio: 4, pal: [[30, 4, 70], [210, 3, 66], [30, 5, 74]], joint: [210, 5, 50], rand: 1 }],
	['permeable', 'Permeable Pavers', 'Pavers', 4, 'pavers', { pat: 'running', pal: [[210, 4, 52], [30, 6, 48], [210, 5, 58]], joint: [30, 10, 40], gap: 1 }],
	['stack-sand', 'Square Pavers (Sand)', 'Pavers', 4, 'pavers', { pat: 'stack', u: 4, pal: [[38, 30, 66], [35, 30, 60], [40, 25, 72]], joint: [30, 15, 45] }],
	['colonial', 'Colonial Concrete Pavers', 'Pavers', 4, 'pavers', { pat: 'running', pal: [[8, 30, 38], [210, 5, 46], [15, 25, 42], [30, 10, 52]], joint: [30, 10, 38] }],
	['travertine', 'Travertine Pavers (Ivory)', 'Pavers', 6, 'ashlar', { pal: [[40, 30, 82], [38, 28, 76], [42, 25, 86], [35, 30, 72]], joint: [40, 15, 70], pits: 1 }],
	// Natural stone
	['bluestone', 'Bluestone Patio (Full Color)', 'Natural Stone', 6, 'ashlar', { pal: [[210, 14, 44], [215, 12, 48], [30, 18, 46], [20, 22, 42], [200, 10, 52]], joint: [210, 6, 30] }],
	['bluestone-select', 'Bluestone (Blue Select)', 'Natural Stone', 4, 'pavers', { pat: 'stack', u: 2, pal: [[210, 15, 44], [212, 14, 48], [208, 16, 40]], joint: [210, 6, 30] }],
	['bluestone-irregular', 'Irregular Bluestone', 'Natural Stone', 6, 'voronoi', { n: 18, pal: [[210, 14, 44], [215, 12, 48], [30, 15, 46], [200, 10, 52]], joint: [210, 6, 26], jw: 3.2 }],
	['flagstone', 'Pennsylvania Flagstone', 'Natural Stone', 6, 'voronoi', { n: 26, pal: [[20, 25, 48], [30, 30, 52], [280, 10, 46], [35, 20, 58]], joint: [30, 8, 30], jw: 3.2 }],
	['fieldstone', 'Fieldstone Patio', 'Natural Stone', 6, 'voronoi', { n: 22, pal: [[30, 15, 50], [210, 6, 52], [35, 20, 58], [25, 12, 42]], joint: [100, 30, 26], jw: 5, round: 1 }],
	['slate', 'Slate Patio (Gray)', 'Natural Stone', 5, 'ashlar', { pal: [[210, 8, 30], [215, 10, 34], [205, 6, 26]], joint: [210, 5, 45], cleft: 1 }],
	['slate-multi', 'Multicolor Slate', 'Natural Stone', 5, 'ashlar', { pal: [[210, 8, 32], [20, 30, 36], [330, 12, 32], [100, 12, 30], [30, 30, 44]], joint: [210, 5, 45], cleft: 1 }],
	['sandstone', 'Sandstone (Buff)', 'Natural Stone', 6, 'ashlar', { pal: [[38, 35, 64], [32, 35, 58], [40, 30, 70], [28, 30, 52]], joint: [35, 15, 45] }],
	['limestone', 'Limestone (Indiana Buff)', 'Natural Stone', 6, 'pavers', { pat: 'running', u: 4, ratio: 2, pal: [[40, 25, 76], [38, 22, 72], [42, 20, 80]], joint: [40, 10, 60] }],
	['granite-pavers', 'Granite Pavers (Gray)', 'Natural Stone', 4, 'pavers', { pat: 'stack', u: 2, pal: [[210, 4, 56], [210, 4, 62], [30, 4, 52]], joint: [210, 5, 40], speck: 1 }],
	['stepping-lawn', 'Stepping Stones in Lawn', 'Natural Stone', 6, 'voronoi', { n: 10, pal: [[210, 12, 46], [30, 15, 50], [215, 10, 52]], joint: [100, 45, 28], jw: 14, lawnJoint: 1 }],
	['stepping-gravel', 'Stepping Stones in Gravel', 'Natural Stone', 6, 'voronoi', { n: 10, pal: [[210, 12, 46], [30, 15, 50], [215, 10, 52]], joint: [30, 8, 58], jw: 14, gravelJoint: 1 }],
	['cobblestone', 'Cobblestone (Rounded)', 'Natural Stone', 4, 'voronoi', { n: 70, pal: [[30, 10, 46], [210, 6, 44], [35, 12, 52], [25, 10, 38]], joint: [30, 8, 22], jw: 3.5, round: 1 }],
	['marble-patio', 'Marble Patio (White)', 'Natural Stone', 6, 'pavers', { pat: 'stack', u: 2, pal: [[40, 8, 90], [210, 5, 88], [40, 6, 84]], joint: [210, 5, 70], veins: 1 }],
	// Decking & surfaces
	['deck-cedar', 'Cedar Deck', 'Decking & Surfaces', 4, 'boards', { pal: [[22, 45, 48], [26, 45, 52], [20, 50, 42], [28, 40, 56]], n: 8 }],
	['deck-gray', 'Gray Composite Deck', 'Decking & Surfaces', 4, 'boards', { pal: [[30, 4, 50], [30, 5, 54], [30, 4, 46]], n: 8, uniform: 1 }],
	['deck-brown', 'Brown Composite Deck', 'Decking & Surfaces', 4, 'boards', { pal: [[24, 30, 32], [26, 28, 36], [22, 32, 28]], n: 8, uniform: 1 }],
	['deck-mahogany', 'Mahogany Deck', 'Decking & Surfaces', 4, 'boards', { pal: [[10, 50, 30], [14, 45, 34], [8, 55, 26]], n: 8 }],
	['deck-weathered', 'Weathered Wood Deck', 'Decking & Surfaces', 4, 'boards', { pal: [[35, 8, 55], [30, 6, 50], [35, 10, 60]], n: 8 }],
	['concrete', 'Broom-Finish Concrete', 'Decking & Surfaces', 5, 'concrete', { base: [35, 5, 66], broom: 1 }],
	['concrete-smooth', 'Smooth Concrete', 'Decking & Surfaces', 5, 'concrete', { base: [30, 4, 62] }],
	['aggregate', 'Exposed Aggregate', 'Decking & Surfaces', 3, 'concrete', { base: [30, 8, 52], agg: 1 }],
	['stamped-slate', 'Stamped Concrete (Slate)', 'Decking & Surfaces', 6, 'ashlar', { pal: [[25, 20, 48], [28, 18, 44], [20, 22, 40]], joint: [25, 15, 30], cleft: 1, thin: 1 }],
	['stamped-cobble', 'Stamped Concrete (Cobble)', 'Decking & Surfaces', 4, 'pavers', { pat: 'cobble', pal: [[30, 15, 52], [28, 18, 48], [32, 14, 56]], joint: [30, 15, 36], round: 1, thin: 1 }],
	['asphalt', 'Asphalt Driveway', 'Decking & Surfaces', 3, 'concrete', { base: [210, 4, 26], asphalt: 1 }],
	['asphalt-sealed', 'Sealed Asphalt', 'Decking & Surfaces', 3, 'concrete', { base: [210, 4, 14], asphalt: 1 }],
	['rubber-tiles', 'Rubber Play Tiles', 'Decking & Surfaces', 4, 'pavers', { pat: 'stack', u: 2, pal: [[2, 45, 32], [5, 40, 30]], joint: [0, 0, 15], speck: 1 }],
	['water', 'Pool Water', 'Decking & Surfaces', 3, 'water', {}]
];

export const MATERIAL_GROUPS = ['Mulch', 'Stone & Gravel', 'Soil & Sand', 'Lawn & Groundcover', 'Pavers', 'Natural Stone', 'Decking & Surfaces'];
export const MATERIALS = M.map(([id, name, group, ft, gen, p]) => ({ id, name, group, ft, gen, p }));
export const matById = Object.fromEntries(MATERIALS.map((m) => [m.id, m]));

const tileCache = new Map();

/* ------------------------------------------------ photo materials (CC0 scans) */

const matListeners = new Set();
/** Called when a photo material finishes loading so the ground can be redrawn. */
export function onMaterialReady(fn) { matListeners.add(fn); return () => matListeners.delete(fn); }
const matLoading = new Map();
function loadPhotoTile(m) {
	if (matLoading.has(m.id)) return;
	matLoading.set(m.id, (async () => {
		try {
			const blob = await (await fetch(m.photo.src)).blob();
			const bm = await createImageBitmap(blob);
			m.photo.img = bm;
			tileCache.delete(m.id);
			for (const k of [...patCache.keys()]) if (k.startsWith(m.id + '|')) patCache.delete(k);
			for (const fn of matListeners) { try { fn(m.id); } catch (e) { console.warn(e); } }
		} catch (e) { m.photo.failed = true; }
	})());
}
/**
 * Photo material pack: assets/materials/materials.json →
 * { "<id>": { name, group, ft, avg:[r,g,b], src, credit, tags } }
 */
export async function loadMaterialPack(extraUrl) {
	const urls = [new URL('../materials/materials.json', import.meta.url).href];
	if (extraUrl) urls.push(extraUrl);
	let n = 0;
	for (const url of urls) {
		try {
			const r = await fetch(url, { cache: 'no-cache' });
			if (!r.ok) continue;
			const db = await r.json();
			for (const id in db) {
				const e = db[id];
				if (matById[id]) continue;
				const m = { id, name: e.name, group: MATERIAL_GROUPS.includes(e.group) ? e.group : 'Decking & Surfaces', ft: e.ft || 6, photo: { src: new URL(e.src, url).href, avg: e.avg || [120, 110, 95] }, credit: e.credit || '', tags: e.tags || '', real: true };
				MATERIALS.push(m);
				matById[id] = m;
				n++;
			}
		} catch (e) { /* no pack */ }
	}
	return n;
}

/** Mip-mapped tiles for a material: level 0 = 256px, then 128, 64, 32, 16. */
export function tiles(id) {
	let t = tileCache.get(id);
	if (t) return t;
	const m = matById[id] || matById.mulch;
	let c0;
	if (m.photo) {
		if (!m.photo.img) {
			// placeholder in the material's average colour until the scan arrives
			if (!m.photo.failed) loadPhotoTile(m);
			const c = canvas(16, 16), x = c.getContext('2d');
			x.fillStyle = `rgb(${m.photo.avg.join(',')})`; x.fillRect(0, 0, 16, 16);
			return [c];
		}
		const T = Math.min(512, m.photo.img.width);
		c0 = canvas(T, T);
		const x = c0.getContext('2d');
		x.imageSmoothingQuality = 'high';
		x.drawImage(m.photo.img, 0, 0, T, T);
	} else {
		c0 = canvas(S, S);
		const ctx = c0.getContext('2d', { willReadFrequently: true });
		let seed = 7;
		for (const ch of m.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
		GEN[m.gen](ctx, rng(seed), m.p);
	}
	t = [c0];
	let prev = c0;
	for (let s = c0.width / 2; s >= 16; s /= 2) {
		const big = canvas(s * 3, s * 3);
		const bx = big.getContext('2d');
		bx.imageSmoothingQuality = 'high';
		for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) bx.drawImage(prev, i * s, j * s, s, s);
		const c = canvas(s, s);
		c.getContext('2d').drawImage(big, s, s, s, s, 0, 0, s, s);
		t.push(c);
		prev = c;
	}
	tileCache.set(id, t);
	return t;
}

export function swatch(id, size = 44) {
	const c = canvas(size, size);
	const t0 = tiles(id)[0], k = t0.width / S;
	c.getContext('2d').drawImage(t0, 0, 0, 128 * k, 128 * k, 0, 0, size, size);
	return c;
}

const patCache = new Map();
function pattern(ctx, id, level) {
	const key = id + '|' + level;
	let p = patCache.get(key);
	if (!p) { p = ctx.createPattern(tiles(id)[level], 'repeat'); patCache.set(key, p); }
	return p;
}

/**
 * Fill a rectangle of ctx with a material laid on the ground.
 * g = { view: 'side'|'top', horizon, camH (ft), focal (px), vx (vanishing x), ppf (top view px/ft) }
 */
export function fillGround(ctx, id, x0, y0, x1, y1, g) {
	const m = matById[id];
	if (!m) return;
	const tl = tiles(id), levels = tl.length, TS = tl[0].width;
	if (g.view === 'top') {
		const s = (g.ppf * m.ft) / TS;
		let L = 0;
		while (L < levels - 1 && s * Math.pow(2, L + 1) <= 1.4) L++;
		const sl = s * Math.pow(2, L);
		const p = pattern(ctx, id, L);
		p.setTransform(new DOMMatrix([sl, 0, 0, sl, 0, 0]));
		ctx.fillStyle = p;
		ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
		return;
	}
	const band = 3;
	for (let y = Math.floor(y0); y < y1; y += band) {
		const yy = y + band / 2;
		const d = Math.max(3, yy - g.horizon);
		const ppf = d / g.camH;
		const s = (ppf * m.ft) / TS;
		const sq = Math.min(1, d / g.focal);
		let L = 0;
		while (L < levels - 1 && s * sq * Math.pow(2, L + 1) <= 1.2) L++;
		const k = Math.pow(2, L);
		const sl = s * k;
		const Z = (g.focal * g.camH) / d;
		const v = (Z * (TS / k)) / m.ft;
		const dd = -sl * sq;
		const p = pattern(ctx, id, L);
		p.setTransform(new DOMMatrix([sl, 0, 0, dd, g.vx, yy - dd * v]));
		ctx.fillStyle = p;
		ctx.fillRect(x0, y, x1 - x0, Math.min(band, y1 - y));
	}
}

/* --------------------------------------------------------------- helpers */

const rr = (R, a) => a[0] + R() * (a[1] - a[0]);
function each(n, fn) { for (let i = 0; i < n; i++) fn(i); }
function wrap(x, y, e, fn) {
	const xs = [x], ys = [y];
	if (x < e) xs.push(x + S); else if (x > S - e) xs.push(x - S);
	if (y < e) ys.push(y + S); else if (y > S - e) ys.push(y - S);
	for (const a of xs) for (const b of ys) fn(a, b);
}
function noise(ctx, R, amt, mono = true) {
	const d = ctx.getImageData(0, 0, S, S);
	const p = d.data;
	for (let i = 0; i < p.length; i += 4) {
		if (mono) { const n = (R() - 0.5) * amt; p[i] += n; p[i + 1] += n; p[i + 2] += n; }
		else { p[i] += (R() - 0.5) * amt; p[i + 1] += (R() - 0.5) * amt; p[i + 2] += (R() - 0.5) * amt; }
	}
	ctx.putImageData(d, 0, 0);
}
function fill(ctx, c) { ctx.fillStyle = hsl(c, 0); ctx.fillRect(0, 0, S, S); }
const jit = (R, c, dl = 10, dh = 6) => [c[0] + (R() - 0.5) * dh, c[1], c[2] + (R() - 0.5) * dl];
function hash(a, b, c = 0) { let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2147483647)) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

/* ------------------------------------------------------------ generators */

const GEN = {
	mulch(ctx, R, p) {
		fill(ctx, p.base);
		each(600, () => { const x = R() * S, y = R() * S, r = 1 + R() * 3; wrap(x, y, 6, (a, b) => { ctx.fillStyle = hsl(p.base, -8, 0.8); ctx.beginPath(); ctx.arc(a, b, r, 0, 7); ctx.fill(); }); });
		const len = p.len || [5, 17], wid = p.wid || [1.2, 4.2];
		each(p.n || 2600, () => {
			const x = R() * S, y = R() * S, L = rr(R, len), W = rr(R, wid), ang = R() * Math.PI;
			const c = [rr(R, p.h), rr(R, p.s), rr(R, p.l)];
			wrap(x, y, L, (a, b) => {
				ctx.save(); ctx.translate(a, b); ctx.rotate(ang);
				ctx.fillStyle = hsl(c, 0);
				ctx.beginPath(); ctx.moveTo(-L / 2, 0); ctx.lineTo(-L * 0.2, -W / 2); ctx.lineTo(L / 2, -W * 0.2); ctx.lineTo(L * 0.3, W / 2); ctx.closePath(); ctx.fill();
				ctx.fillStyle = 'rgba(255,240,220,.08)'; ctx.fillRect(-L * 0.3, -W * 0.4, L * 0.6, W * 0.25);
				ctx.restore();
			});
		});
		noise(ctx, R, 18);
	},
	nuggets(ctx, R, p) {
		fill(ctx, p.base);
		each(p.n, () => {
			const x = R() * S, y = R() * S, r = rr(R, p.r), c = [rr(R, p.h), rr(R, p.s), rr(R, p.l)];
			const pts = [];
			const n = p.angular ? 5 + Math.floor(R() * 3) : 7;
			for (let k = 0; k < n; k++) { const a = (k / n) * 7 + R() * 0.4; pts.push([Math.cos(a) * r * (0.6 + R() * 0.5), Math.sin(a) * r * (0.5 + R() * 0.4)]); }
			const rot = R() * 3;
			wrap(x, y, r * 1.4, (a, b) => {
				ctx.save(); ctx.translate(a, b); ctx.rotate(rot);
				ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q[0] + r * 0.15, q[1] + r * 0.2) : ctx.moveTo(q[0] + r * 0.15, q[1] + r * 0.2))); ctx.fill();
				const g = ctx.createLinearGradient(-r, -r, r, r); g.addColorStop(0, hsl(c, 10)); g.addColorStop(1, hsl(c, -8));
				ctx.fillStyle = g; ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.fill();
				if (!p.angular) { ctx.strokeStyle = hsl(c, -10, 0.6); ctx.lineWidth = 0.6; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(-r * 0.6, (k - 1) * r * 0.25); ctx.lineTo(r * 0.6, (k - 1) * r * 0.25 + (R() - 0.5) * 2); ctx.stroke(); } }
				ctx.restore();
			});
		});
		noise(ctx, R, 14);
	},
	straw(ctx, R, p) {
		fill(ctx, p.base);
		if (p.sparse) GEN.lawn(ctx, R, { base: [100, 30, 22], h: [90, 110], s: [30, 45], l: [22, 40], n: 3000, len: [2, 5], wid: [0.6, 1], keep: 1 });
		each(p.sparse ? 380 : 900, () => {
			const x = R() * S, y = R() * S, len = 14 + R() * 28, ang = R() * Math.PI, bend = (R() - 0.5) * 6;
			const c = [rr(R, p.h), rr(R, p.s), rr(R, p.l)];
			wrap(x, y, 30, (a, b) => {
				ctx.strokeStyle = hsl(c, 0); ctx.lineWidth = 1 + R() * 0.8; ctx.lineCap = 'round';
				const dx = (Math.cos(ang) * len) / 2, dy = (Math.sin(ang) * len) / 2;
				ctx.beginPath(); ctx.moveTo(a - dx, b - dy); ctx.quadraticCurveTo(a + bend, b - bend, a + dx, b + dy); ctx.stroke();
			});
		});
		noise(ctx, R, 14);
	},
	grains(ctx, R, p) {
		fill(ctx, p.base);
		each(p.n, () => {
			const x = R() * S, y = R() * S, r = rr(R, p.r), c = R.pick(p.pal);
			wrap(x, y, r + 1, (a, b) => { ctx.fillStyle = hsl(jit(R, c, 12), 0, p.soft ? 0.7 : 1); ctx.beginPath(); ctx.arc(a, b, r, 0, 7); ctx.fill(); });
		});
		if (p.bits) each(220, () => { const x = R() * S, y = R() * S, L = 4 + R() * 9, ang = R() * 3; wrap(x, y, L, (a, b) => { ctx.strokeStyle = hsl([30, 35, 30 + R() * 15], 0); ctx.lineWidth = 1 + R(); ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(a + Math.cos(ang) * L, b + Math.sin(ang) * L); ctx.stroke(); }); });
		if (p.cracks) { ctx.strokeStyle = hsl(p.base, -14, 0.6); ctx.lineWidth = 1; each(14, () => { let x = R() * S, y = R() * S; ctx.beginPath(); ctx.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (R() - 0.5) * 30; y += (R() - 0.5) * 30; ctx.lineTo(x, y); } ctx.stroke(); }); }
		if (p.ripples) { ctx.strokeStyle = 'rgba(0,0,0,.06)'; ctx.lineWidth = 3; for (let y = 0; y < S; y += 16) { ctx.beginPath(); for (let x = 0; x <= S; x += 8) ctx.lineTo(x, y + Math.sin((x / S) * Math.PI * 4) * 4); ctx.stroke(); } }
		noise(ctx, R, p.soft ? 10 : 20);
	},
	lawn(ctx, R, p) {
		if (!p.keep) fill(ctx, p.base);
		const len = p.len || [4, 11], wid = p.wid || [0.9, 1.7];
		each(p.n || 7500, () => {
			const x = R() * S, y = R() * S, L = rr(R, len), ang = -Math.PI / 2 + (R() - 0.5) * (p.curly ? 2.2 : 0.9);
			const c = [rr(R, p.h), rr(R, p.s), rr(R, p.l)];
			wrap(x, y, L + 1, (a, b) => {
				ctx.strokeStyle = hsl(c, 0); ctx.lineWidth = rr(R, wid); ctx.lineCap = 'round';
				ctx.beginPath(); ctx.moveTo(a, b);
				if (p.curly) ctx.quadraticCurveTo(a + Math.cos(ang) * L * 0.5 + 3, b + Math.sin(ang) * L * 0.5, a + Math.cos(ang) * L, b + Math.sin(ang) * L);
				else ctx.lineTo(a + Math.cos(ang) * L, b + Math.sin(ang) * L);
				ctx.stroke();
			});
		});
		if (p.clover) each(260, () => { const x = R() * S, y = R() * S; wrap(x, y, 5, (a, b) => { ctx.fillStyle = hsl([105, 40, 36 + R() * 8], 0); for (let k = 0; k < 3; k++) { const an = (k / 3) * 7; ctx.beginPath(); ctx.arc(a + Math.cos(an) * 1.6, b + Math.sin(an) * 1.6, 1.6, 0, 7); ctx.fill(); } }); });
		if (p.keep) return;
		if (p.stripes) { const half = S / 2; ctx.fillStyle = 'rgba(255,255,230,.09)'; ctx.fillRect(0, 0, half, S); ctx.fillStyle = 'rgba(0,30,0,.08)'; ctx.fillRect(half, 0, half, S); }
		if (p.seams) { ctx.strokeStyle = 'rgba(40,30,10,.35)'; ctx.lineWidth = 1.5; for (let y = 0; y < S; y += S / 4) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y); ctx.stroke(); } for (let r = 0; r < 4; r++) { const x = (r % 2 ? S / 4 : 0) + 0.5; ctx.beginPath(); ctx.moveTo(x, (r * S) / 4); ctx.lineTo(x, ((r + 1) * S) / 4); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x + S / 2, (r * S) / 4); ctx.lineTo(x + S / 2, ((r + 1) * S) / 4); ctx.stroke(); } }
		noise(ctx, R, p.uniform ? 6 : 10, false);
	},
	leaves(ctx, R, p) {
		fill(ctx, p.base);
		const leaf = (a, b, s, ang, c) => {
			ctx.save(); ctx.translate(a, b); ctx.rotate(ang); ctx.fillStyle = hsl(c, 0);
			switch (p.leaf) {
				case 'clover': for (let k = 0; k < 3; k++) { const an = (k / 3) * 7; ctx.beginPath(); ctx.arc(Math.cos(an) * s * 0.5, Math.sin(an) * s * 0.5, s * 0.5, 0, 7); ctx.fill(); } ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.beginPath(); ctx.arc(0, 0, s * 0.3, 0, 7); ctx.fill(); break;
				case 'whorl': for (let k = 0; k < 6; k++) { ctx.rotate(1.05); ctx.beginPath(); ctx.ellipse(s * 0.55, 0, s * 0.55, s * 0.25, 0, 0, 7); ctx.fill(); } break;
				case 'needle': ctx.fillRect(-s / 2, -0.5, s, 1.2); break;
				case 'round': ctx.beginPath(); ctx.arc(0, 0, s * 0.5, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.arc(-s * 0.15, -s * 0.15, s * 0.2, 0, 7); ctx.fill(); break;
				case 'heart': ctx.beginPath(); ctx.moveTo(0, s * 0.5); ctx.bezierCurveTo(-s * 0.7, 0, -s * 0.4, -s * 0.6, 0, -s * 0.3); ctx.bezierCurveTo(s * 0.4, -s * 0.6, s * 0.7, 0, 0, s * 0.5); ctx.fill(); ctx.strokeStyle = hsl(c, -10); ctx.lineWidth = 0.6; ctx.stroke(); break;
				case 'maple': ctx.beginPath(); for (let k = 0; k < 10; k++) { const an = (k / 10) * 7, rr2 = k % 2 ? s * 0.25 : s * 0.55; ctx.lineTo(Math.cos(an) * rr2, Math.sin(an) * rr2); } ctx.fill(); ctx.strokeStyle = hsl(c, -15); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, s * 0.6); ctx.stroke(); break;
				default: ctx.beginPath(); ctx.ellipse(0, 0, s * 0.5, s * 0.28, 0, 0, 7); ctx.fill();
			}
			ctx.restore();
		};
		each(p.n, () => { const x = R() * S, y = R() * S, s = rr(R, p.size), ang = R() * 7, c = jit(R, R.pick(p.pal), 12); wrap(x, y, s + 2, (a, b) => leaf(a, b, s, ang, c)); });
		if (p.fl) each(p.fn, () => { const x = R() * S, y = R() * S, s = 1.2 + R() * 1.6; wrap(x, y, 4, (a, b) => { ctx.fillStyle = hsl(jit(R, p.fl, 8), 0); ctx.beginPath(); ctx.arc(a, b, s, 0, 7); ctx.fill(); }); });
		noise(ctx, R, 12);
	},
	pebbles(ctx, R, p) {
		fill(ctx, p.base);
		each(p.n, () => {
			const r = rr(R, p.r), c = jit(R, R.pick(p.pal), 12), x = R() * S, y = R() * S, ry = r * (0.65 + R() * 0.3), rot = R() * 3;
			wrap(x, y, r + 3, (a, b) => {
				ctx.save(); ctx.translate(a, b); ctx.rotate(rot);
				ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(r * 0.2, ry * 0.3, r, ry, 0, 0, 7); ctx.fill();
				const g = ctx.createRadialGradient(-r * 0.35, -ry * 0.4, r * 0.1, 0, 0, r);
				g.addColorStop(0, hsl(c, p.gloss ? 26 : 16)); g.addColorStop(1, hsl(c, -12));
				ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, r, ry, 0, 0, 7); ctx.fill();
				ctx.restore();
			});
		});
		noise(ctx, R, 8);
	},
	crushed(ctx, R, p) {
		fill(ctx, p.base);
		if (p.fines) GEN.grains(ctx, R, { base: p.base, pal: p.pal, r: [0.4, 1.2], n: 3000 });
		each(p.n, () => {
			const x = R() * S, y = R() * S, r = rr(R, p.r), c = jit(R, R.pick(p.pal), 14);
			const n = 5 + Math.floor(R() * 2);
			const pts = []; for (let k = 0; k < n; k++) { const a = (k / n) * 7 + R(); pts.push([Math.cos(a) * r * (0.6 + R() * 0.6), Math.sin(a) * r * (0.6 + R() * 0.6)]); }
			wrap(x, y, r * 1.3, (a, b) => {
				ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(a + q[0] + 1, b + q[1] + 1.4) : ctx.moveTo(a + q[0] + 1, b + q[1] + 1.4))); ctx.fill();
				const g = ctx.createLinearGradient(a - r, b - r, a + r, b + r); g.addColorStop(0, hsl(c, p.gloss ? 18 : 10)); g.addColorStop(1, hsl(c, -10));
				ctx.fillStyle = g; ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(a + q[0], b + q[1]) : ctx.moveTo(a + q[0], b + q[1]))); ctx.fill();
				if (p.porous) for (let k = 0; k < 3; k++) { ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.arc(a + (R() - 0.5) * r, b + (R() - 0.5) * r, r * 0.12, 0, 7); ctx.fill(); }
			});
		});
		noise(ctx, R, 14);
	},
	chips(ctx, R, p) {
		fill(ctx, p.base);
		each(p.n, () => {
			const x = R() * S, y = R() * S, r = rr(R, p.r), c = jit(R, R.pick(p.pal), 12), ang = R() * 3;
			wrap(x, y, r * 1.3, (a, b) => {
				ctx.save(); ctx.translate(a, b); ctx.rotate(ang);
				ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(-r + 1, -r * 0.45 + 1.5, r * 2, r * 0.9);
				ctx.fillStyle = hsl(c, 0); ctx.beginPath(); ctx.moveTo(-r, -r * 0.4); ctx.lineTo(r * 0.8, -r * 0.5); ctx.lineTo(r, r * 0.35); ctx.lineTo(-r * 0.7, r * 0.45); ctx.closePath(); ctx.fill();
				ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(-r * 0.8, -r * 0.4, r * 1.5, r * 0.2);
				ctx.restore();
			});
		});
		noise(ctx, R, 12);
	},
	snow(ctx, R) {
		fill(ctx, [210, 30, 94]);
		each(1400, () => { const x = R() * S, y = R() * S, r = 2 + R() * 10; wrap(x, y, r, (a, b) => { ctx.fillStyle = `rgba(${R() < 0.5 ? '170,190,215' : '255,255,255'},${0.1 + R() * 0.15})`; ctx.beginPath(); ctx.arc(a, b, r, 0, 7); ctx.fill(); }); });
		each(300, () => { const x = R() * S, y = R() * S; ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillRect(x, y, 1, 1); });
		noise(ctx, R, 4);
	},
	water(ctx, R) {
		fill(ctx, [200, 55, 45]);
		each(500, () => { const x = R() * S, y = R() * S, w = 10 + R() * 30; wrap(x, y, w, (a, b) => { ctx.strokeStyle = `rgba(${R() < 0.5 ? '190,235,255' : '20,80,120'},${0.15 + R() * 0.2})`; ctx.lineWidth = 1 + R() * 1.5; ctx.beginPath(); ctx.moveTo(a - w / 2, b); ctx.quadraticCurveTo(a, b - 3, a + w / 2, b); ctx.stroke(); }); });
		noise(ctx, R, 6, false);
	},
	concrete(ctx, R, p) {
		fill(ctx, p.base);
		if (p.agg) GEN.pebbles(ctx, R, { base: p.base, pal: [[30, 15, 55], [25, 20, 45], [210, 6, 60], [35, 20, 68], [10, 25, 40]], r: [1.6, 3.6], n: 2600 });
		if (p.asphalt) each(5000, () => { ctx.fillStyle = `rgba(${R() < 0.5 ? '0,0,0' : '200,200,200'},${R() * 0.25})`; ctx.fillRect(R() * S, R() * S, 1 + R() * 1.5, 1 + R() * 1.5); });
		noise(ctx, R, p.asphalt ? 26 : 12);
		if (p.broom) { ctx.strokeStyle = 'rgba(0,0,0,.05)'; for (let y = 0; y < S; y += 2) { ctx.lineWidth = R(); ctx.beginPath(); ctx.moveTo(0, y + R()); ctx.lineTo(S, y + R()); ctx.stroke(); } }
		if (!p.asphalt && !p.agg) { ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(0, 0, S, 1.6); ctx.fillRect(0, 0, 1.6, S); }
	},
	boards(ctx, R, p) {
		const n = p.n, bh = S / n;
		for (let i = 0; i < n; i++) {
			let x = -R() * S * 0.5;
			while (x < S) {
				const L = S * (0.5 + R() * 0.5), c = jit(R, R.pick(p.pal), p.uniform ? 4 : 10);
				const draw = (ox) => {
					const g = ctx.createLinearGradient(0, i * bh, 0, (i + 1) * bh); g.addColorStop(0, hsl(c, 5)); g.addColorStop(1, hsl(c, -6));
					ctx.fillStyle = g; ctx.fillRect(ox, i * bh + 1, L - 1.5, bh - 2.5);
					if (!p.uniform) { ctx.strokeStyle = hsl(c, -10, 0.5); ctx.lineWidth = 0.7; for (let k = 0; k < 4; k++) { const yy = i * bh + 3 + R() * (bh - 6); ctx.beginPath(); ctx.moveTo(ox, yy); ctx.bezierCurveTo(ox + L * 0.3, yy + (R() - 0.5) * 4, ox + L * 0.6, yy + (R() - 0.5) * 4, ox + L, yy); ctx.stroke(); } }
				};
				draw(x); if (x + L > S) draw(x - S); if (x < 0) draw(x + S);
				x += L;
			}
		}
		ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = '#2a211b'; ctx.fillRect(0, 0, S, S); ctx.globalCompositeOperation = 'source-over';
		noise(ctx, R, 8);
	},
	pavers(ctx, R, p) {
		fill(ctx, p.joint);
		const jw = p.gap ? 4 : p.thin ? 1.2 : 1.8;
		const brick = (x, y, w, h, key) => {
			const c = jit(R, p.pal[Math.floor(hash(key, 7) * p.pal.length)], 10);
			const k = hash(key, 3);
			const g = ctx.createLinearGradient(x, y, x, y + h);
			g.addColorStop(0, hsl(c, 5 + k * 3)); g.addColorStop(1, hsl(c, -6));
			ctx.fillStyle = g;
			if (p.round) { ctx.beginPath(); (ctx.roundRect || ((a, b, cc, d) => ctx.rect(a, b, cc, d))).call(ctx, x + jw / 2, y + jw / 2, w - jw, h - jw, Math.min(w, h) * 0.18); ctx.fill(); }
			else ctx.fillRect(x + jw / 2, y + jw / 2, w - jw, h - jw);
			if (p.speck) for (let i = 0; i < w * h * 0.03; i++) { ctx.fillStyle = `rgba(${R() < 0.5 ? '0,0,0' : '255,255,255'},${R() * 0.25})`; ctx.fillRect(x + R() * w, y + R() * h, 1, 1); }
			if (p.veins) { ctx.strokeStyle = 'rgba(120,120,130,.35)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(x + R() * w, y); ctx.bezierCurveTo(x + R() * w, y + h * 0.3, x + R() * w, y + h * 0.7, x + R() * w, y + h); ctx.stroke(); }
		};
		const pat = p.pat;
		if (pat === 'running' || pat === 'cobble') {
			const nr = pat === 'cobble' ? 16 : p.u ? Math.max(2, Math.round(16 / p.u)) : 12;
			const bh = S / nr;
			const ratio = pat === 'cobble' ? 1.5 : p.ratio || 2;
			const bw = Math.max(bh, S / Math.max(1, Math.round(S / (bh * ratio))));
			for (let r = 0; r < nr; r++) {
				const off = p.rand ? hash(r, 11) * bw : r % 2 ? bw / 2 : 0;
				for (let x = -bw + off; x < S + bw; x += bw) {
					const key = Math.round(((x % S) + S) % S) * 131 + r;
					brick(x, r * bh, bw, bh, key);
				}
			}
		} else if (pat === 'stack') {
			const n = Math.max(1, Math.round(8 / (p.u || 4)) * 2);
			const b = S / n;
			for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) brick(i * b, j * b, b, b, i * 31 + j);
		} else if (pat === 'basket') {
			const b = S / 8; // block = 2 units = b*... each block holds two bricks of b × b/2
			for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
				if ((i + j) % 2) { brick(i * b, j * b, b, b / 2, i * 97 + j * 2); brick(i * b, j * b + b / 2, b, b / 2, i * 97 + j * 2 + 1); }
				else { brick(i * b, j * b, b / 2, b, i * 97 + j * 2); brick(i * b + b / 2, j * b, b / 2, b, i * 97 + j * 2 + 1); }
			}
		} else if (pat === 'herring') {
			const U = 16, n = S / U; // unit = 16px, period 16 units (multiple of 4)
			for (let t = -2; t < n / 4 + 2; t++) {
				for (let k = -4; k < n + 4; k++) {
					const hx = (k + 4 * t) * U, hy = k * U;
					const vx = (k + 4 * t) * U, vy = (k + 1) * U;
					const key = (a, b2) => (((a % S) + S) % S) * 7 + (((b2 % S) + S) % S) * 13;
					for (const dx of [0, -S, S]) for (const dy of [0, -S, S]) {
						if (hx + dx < S + U && hx + dx > -2 * U && hy + dy < S + U && hy + dy > -U) brick(hx + dx, hy + dy, 2 * U, U, key(hx, hy) + 1);
						if (vx + dx < S + U && vx + dx > -U && vy + dy < S + U && vy + dy > -2 * U) brick(vx + dx, vy + dy, U, 2 * U, key(vx, vy) + 2);
					}
				}
			}
		}
		noise(ctx, R, 12);
	},
	hex(ctx, R, p) {
		fill(ctx, p.joint);
		const cols = 5, rows = 6, hx = S / cols, vy = S / rows, r = hx / Math.sqrt(3);
		for (let j = -1; j <= rows; j++) for (let i = -1; i <= cols; i++) {
			const cx = i * hx + (j % 2 ? hx / 2 : 0), cy = j * vy;
			const key = ((i % cols) + cols) % cols * 17 + ((j % rows) + rows) % rows;
			const c = jit(R, p.pal[Math.floor(hash(key, 5) * p.pal.length)], 8);
			ctx.fillStyle = hsl(c, 0);
			ctx.beginPath();
			for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + (k * Math.PI) / 3; ctx.lineTo(cx + Math.cos(a) * (r - 1.2), cy + Math.sin(a) * (vy / 1.5 - 1.2) * 1.0); }
			ctx.closePath(); ctx.fill();
		}
		noise(ctx, R, 12);
	},
	ashlar(ctx, R, p) {
		fill(ctx, p.joint);
		const u = S / 6;
		const rows = [2, 1, 2, 1];
		let y = 0;
		const jw = p.thin ? 1.2 : 1.8;
		for (const rh of rows) {
			let x = -R.int(0, 2) * u;
			const start = x;
			while (x < S + start) {
				const cw = R.pick([1, 2, 2, 3]) * u;
				const c = jit(R, R.pick(p.pal), 8);
				const draw = (ox) => {
					const g = ctx.createLinearGradient(ox, y, ox + cw, y + rh * u);
					g.addColorStop(0, hsl(c, 4)); g.addColorStop(1, hsl(c, -5));
					ctx.fillStyle = g; ctx.fillRect(ox + jw, y + jw, cw - jw * 2, rh * u - jw * 2);
					if (p.cleft) { ctx.strokeStyle = 'rgba(255,255,255,.08)'; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(ox + R() * cw, y + 2); ctx.lineTo(ox + R() * cw, y + rh * u - 2); ctx.stroke(); } }
					if (p.pits) for (let k = 0; k < cw * 0.3; k++) { ctx.fillStyle = 'rgba(80,60,40,.25)'; ctx.beginPath(); ctx.ellipse(ox + R() * cw, y + R() * rh * u, 1 + R() * 2, 0.6 + R(), 0, 0, 7); ctx.fill(); }
				};
				draw(x); if (x + cw > S) draw(x - S); if (x < 0) draw(x + S);
				x += cw;
			}
			y += rh * u;
		}
		noise(ctx, R, 16);
	},
	voronoi(ctx, R, p) {
		const n = p.n, pts = [];
		for (let i = 0; i < n; i++) pts.push([R() * S, R() * S, jit(R, R.pick(p.pal), 14)]);
		const img = ctx.createImageData(S, S);
		const d = img.data;
		let joint = null;
		if (p.lawnJoint || p.gravelJoint) {
			const t = canvas(S, S); const tc = t.getContext('2d', { willReadFrequently: true });
			if (p.lawnJoint) GEN.lawn(tc, R, { base: [98, 45, 26], h: [85, 113], s: [40, 62], l: [22, 48], n: 6000 });
			else GEN.pebbles(tc, R, { base: [30, 8, 40], pal: [[35, 15, 62], [30, 10, 52], [210, 5, 60]], r: [1.6, 3.4], n: 2600 });
			joint = tc.getImageData(0, 0, S, S).data;
		}
		const jr = hslToRgb(...p.joint);
		for (let y = 0; y < S; y++) {
			for (let x = 0; x < S; x++) {
				let d1 = 1e9, d2 = 1e9, best = 0;
				for (let i = 0; i < n; i++) {
					let dx = Math.abs(x - pts[i][0]), dy = Math.abs(y - pts[i][1]);
					if (dx > S / 2) dx = S - dx;
					if (dy > S / 2) dy = S - dy;
					const dd = dx * dx + dy * dy;
					if (dd < d1) { d2 = d1; d1 = dd; best = i; } else if (dd < d2) d2 = dd;
				}
				const edge = Math.sqrt(d2) - Math.sqrt(d1);
				const k = (y * S + x) * 4;
				if (edge < p.jw) {
					if (joint) { d[k] = joint[k]; d[k + 1] = joint[k + 1]; d[k + 2] = joint[k + 2]; }
					else { d[k] = jr[0]; d[k + 1] = jr[1]; d[k + 2] = jr[2]; }
				} else {
					const c = pts[best][2];
					const shade = p.round ? Math.min(8, (edge - p.jw) * 0.8) - 6 : Math.min(6, edge * 0.4) - 3;
					const rgb = hslToRgb(c[0], c[1], c[2] + shade);
					d[k] = rgb[0]; d[k + 1] = rgb[1]; d[k + 2] = rgb[2];
				}
				d[k + 3] = 255;
			}
		}
		ctx.putImageData(img, 0, 0);
		noise(ctx, R, 18);
	}
};

function hslToRgb(h, s, l) {
	s /= 100; l /= 100;
	const k = (n) => (n + h / 30) % 12;
	const a = s * Math.min(l, 1 - l);
	const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
	return [f(0) * 255, f(8) * 255, f(4) * 255];
}

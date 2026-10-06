/* Expanded garden feature library. Each row: [name, art kind, h ft, w ft, options, group, photo description].
 * The art kind is the drawn fallback shown until the real photo for the item loads.
 */
const R = [];
const add = (group, kind, items) => { for (const [name, h, w, opts, desc] of items) R.push([name, kind, h, w, opts || '', group, desc || name]); };
const each = (names, fn) => names.flatMap(fn);

// Stone
add('Stone', 'boulder', each(['Granite', 'Fieldstone', 'Moss-covered', 'Weathered Limestone', 'Bluestone', 'Quartzite', 'River', 'Red Sandstone', 'Lichen-covered Ledge', 'Basalt'], (s) => [
	[`${s} Boulder (Small)`, 1.5, 2, `c:${{ Granite: 'granite', Fieldstone: 'field', 'Moss-covered': 'moss', 'Weathered Limestone': 'limestone', Bluestone: 'bluestone', Quartzite: 'quartz', River: 'gray', 'Red Sandstone': 'rust', 'Lichen-covered Ledge': 'ledge', Basalt: 'black' }[s]}`, `a small natural ${s.toLowerCase()} landscape boulder`],
	[`${s} Boulder (Medium)`, 2.5, 3.5, `c:${{ Granite: 'granite', Fieldstone: 'field', 'Moss-covered': 'moss', 'Weathered Limestone': 'limestone', Bluestone: 'bluestone', Quartzite: 'quartz', River: 'gray', 'Red Sandstone': 'rust', 'Lichen-covered Ledge': 'ledge', Basalt: 'black' }[s]}`, `a medium natural ${s.toLowerCase()} landscape boulder`],
	[`${s} Boulder (Large)`, 4, 5.5, `c:${{ Granite: 'granite', Fieldstone: 'field', 'Moss-covered': 'moss', 'Weathered Limestone': 'limestone', Bluestone: 'bluestone', Quartzite: 'quartz', River: 'gray', 'Red Sandstone': 'rust', 'Lichen-covered Ledge': 'ledge', Basalt: 'black' }[s]}`, `a large natural ${s.toLowerCase()} landscape boulder`],
]));
add('Stone', 'boulders', [['Three-Boulder Grouping', 3, 7, 'c:granite', 'a natural grouping of three granite boulders'], ['Boulder Outcrop with Moss', 2.5, 8, 'c:moss', 'a low mossy fieldstone outcrop'], ['Dry Creek Bed Stones', 1, 8, 'c:gray', 'a dry creek bed of rounded river rocks']]);
add('Stone', 'cairn', [['Balanced River Stone Cairn', 2, 1, 'c:gray'], ['Slate Stack Cairn', 3, 1.2, 'c:bluestone', 'a stacked slate stone cairn'], ['Granite Pillar Stone', 4, 1.2, 'c:granite', 'an upright granite standing stone']]);
add('Stone', 'steps', each(['Bluestone', 'Granite', 'Fieldstone', 'Limestone', 'Concrete Block', 'Timber'], (m) => [[`${m} Garden Steps (3)`, 1.6, 4, `c:${{ Bluestone: 'bluestone', Granite: 'granite', Fieldstone: 'field', Limestone: 'limestone', 'Concrete Block': 'block', Timber: 'cedar' }[m]}`, `three outdoor ${m.toLowerCase()} landscape steps`]]));
add('Stone', 'stepping', each(['Bluestone Square', 'Irregular Flagstone', 'Round Concrete', 'Granite Slab', 'Slate', 'Wood Round'], (m) => [[`${m} Stepping Stone`, 0.2, 2, 'c:bluestone', `a single ${m.toLowerCase()} stepping stone lying flat`]]));

// Seating
const benchMats = [['Teak', 'teak'], ['Cedar', 'cedar'], ['Black Cast Iron', 'black'], ['White Painted Wood', 'white'], ['Green Metal', 'green'], ['Weathered Gray Wood', 'gray'], ['Recycled Poly (Navy)', 'blue'], ['Curved Stone', 'limestone'], ['Concrete', 'concrete'], ['Red Painted', 'red']];
add('Seating', 'bench', each(benchMats, ([m, c]) => [[`${m} Garden Bench`, 3, 5, `c:${c} c2:${c}`, `a ${m.toLowerCase()} outdoor garden bench`], [`${m} Backless Bench`, 1.6, 4.5, `c:${c} c2:${c}`, `a backless ${m.toLowerCase()} garden bench`]]));
add('Seating', 'adirondack', each([['White', 'white'], ['Black', 'black'], ['Teak', 'teak'], ['Navy', 'blue'], ['Sage Green', 'green'], ['Red', 'red'], ['Yellow', 'yellow'], ['Gray', 'gray'], ['Orange', 'orange'], ['Turquoise', 'glazeblue']], ([n, c]) => [[`Adirondack Chair (${n})`, 3.2, 2.6, `c:${c}`, `a ${n.toLowerCase()} Adirondack chair`], [`Adirondack Loveseat (${n})`, 3.2, 4.5, `c:${c}`, `a ${n.toLowerCase()} two-seat Adirondack loveseat`]]));
add('Seating', 'rocker', each([['White', 'white'], ['Black', 'black'], ['Natural Wood', 'teak']], ([n, c]) => [[`Porch Rocking Chair (${n})`, 3.5, 2.2, `c:${c}`, `a ${n.toLowerCase()} rocking chair`]]));
add('Seating', 'bistro', each([['Black Iron', 'black'], ['White Metal', 'white'], ['Green French', 'green'], ['Teak', 'teak'], ['Blue', 'blue']], ([n, c]) => [[`${n} Bistro Set`, 3, 4, `c:${c}`, `a ${n.toLowerCase()} two-chair outdoor bistro set`]]));
add('Seating', 'dining', each([['Teak', 'teak'], ['Black Aluminum', 'black'], ['White Wicker', 'white'], ['Gray Wicker', 'gray'], ['Concrete Top', 'concrete']], ([n, c]) => [[`${n} Patio Dining Set`, 3, 7, `c:${c}`, `a ${n.toLowerCase()} six-seat patio dining set`], [`${n} Dining Set with Umbrella`, 8, 7, `c:${c}`, `a ${n.toLowerCase()} patio dining set with a market umbrella`]]));
add('Seating', 'chaise', each([['Teak', 'teak'], ['White', 'white'], ['Gray Wicker', 'gray'], ['Black', 'black']], ([n, c]) => [[`${n} Chaise Lounge`, 2.5, 6.5, `c:${c}`, `a ${n.toLowerCase()} outdoor chaise lounge`]]));
add('Seating', 'aswing', [['Cedar A-Frame Swing', 7, 8, 'c:cedar'], ['White Porch Swing Frame', 7, 8, 'c:white'], ['Pergola Swing', 8, 7, 'c:teak', 'a wooden pergola with a hanging swing bench']]);
add('Seating', 'hammock', [['Rope Hammock with Stand', 4, 13, 'c:canvas'], ['Striped Hammock with Stand', 4, 13, 'c:stripe'], ['Hammock Chair Stand', 6, 4, 'c:canvas', 'a hanging hammock chair on a stand']]);
add('Seating', 'stonebench', [['Granite Slab Bench', 1.6, 5, 'c:granite'], ['Bluestone Slab Bench', 1.6, 5, 'c:bluestone'], ['Cast Stone Scroll Bench', 2, 5, 'c:limestone', 'an ornate cast stone garden bench']]);
add('Seating', 'logbench', [['Rustic Log Bench', 1.6, 6, 'c:bark'], ['Split Log Bench with Back', 3, 5, 'c:bark', 'a rustic split log bench with a backrest']]);

// Fire
add('Fire', 'firepit', each([['Natural Stone', 'field'], ['Granite Block', 'granite'], ['Brick', 'brick'], ['Belgian Block', 'block'], ['Bluestone', 'bluestone']], ([n, c]) => [[`${n} Fire Pit (Round)`, 1.3, 4.5, `c:${c}`, `a round ${n.toLowerCase()} fire pit with a fire burning`], [`${n} Fire Pit (Square)`, 1.3, 4.5, `c:${c} v:square`, `a square ${n.toLowerCase()} fire pit with a fire burning`]]));
add('Fire', 'firebowl', [['Cor-Ten Steel Fire Bowl', 1.8, 3, 'c:rust'], ['Cast Iron Fire Bowl', 1.6, 3, 'c:black'], ['Copper Fire Bowl', 1.6, 3, 'c:copper'], ['Concrete Fire Bowl', 1.6, 3.5, 'c:concrete']]);
add('Fire', 'firetable', [['Gas Fire Table (Gray)', 2, 4, 'c:concrete'], ['Gas Fire Table (Teak Base)', 2, 4.5, 'c:teak'], ['Linear Gas Fire Table', 2, 6, 'c:black']]);
add('Fire', 'chiminea', [['Clay Chiminea', 4, 1.8, 'c:terracotta'], ['Cast Iron Chiminea', 5, 2, 'c:black']]);
add('Fire', 'fireplace', [['Fieldstone Outdoor Fireplace', 9, 6, 'c:field'], ['Brick Outdoor Fireplace', 9, 6, 'c:brick'], ['Stucco Outdoor Fireplace', 9, 6, 'c:limestone']]);
add('Fire', 'heater', [['Stainless Patio Heater', 7.5, 2.5, 'c:steel'], ['Pyramid Glass-Tube Heater', 7, 2, 'c:black']]);

// Water
add('Water', 'birdbath', each([['Concrete', 'concrete'], ['Copper', 'copper'], ['Glazed Blue', 'glazeblue'], ['Cast Iron', 'black'], ['Granite', 'granite'], ['Terracotta', 'terracotta'], ['Glass Mosaic', 'blue'], ['Pedestal Stone', 'limestone']], ([n, c]) => [[`${n} Birdbath`, 2.6, 2, `c:${c}`, `a ${n.toLowerCase()} pedestal birdbath`]]));
add('Water', 'fountain', [['Two-Tier Cast Stone Fountain', 5, 4, 'c:limestone'], ['Three-Tier Fountain', 6, 4, 'c:concrete'], ['Lion Head Tiered Fountain', 5, 4, 'c:limestone'], ['Bronze Tiered Fountain', 5, 3.5, 'c:bronze']]);
add('Water', 'urnfountain', [['Glazed Urn Fountain (Blue)', 3, 1.8, 'c:glazeblue'], ['Glazed Urn Fountain (Green)', 3, 1.8, 'c:glazegreen'], ['Glazed Urn Fountain (Black)', 3, 1.8, 'c:black'], ['Copper Urn Fountain', 3, 1.8, 'c:copper']]);
add('Water', 'bubbler', [['Basalt Column Bubbler', 3, 1.2, 'c:black'], ['Drilled Boulder Bubbler', 2, 2.5, 'c:granite'], ['Millstone Fountain', 0.8, 3, 'c:granite']]);
add('Water', 'wallfountain', [['Lion Head Wall Fountain', 4, 3, 'c:limestone'], ['Copper Wall Scupper', 3, 2, 'c:copper']]);
add('Water', 'pond', [['Kidney Pond with Stone Edge', 0.5, 10, 'c:field'], ['Formal Rectangular Pool', 0.5, 8, 'c:bluestone'], ['Small Preformed Pond', 0.5, 6, 'c:gray']]);
add('Water', 'waterfall', [['Natural Stone Waterfall', 3, 6, 'c:field'], ['Pondless Waterfall', 3, 5, 'c:granite']]);
add('Water', 'rainbarrel', [['Oak Rain Barrel', 3, 2, 'c:oak'], ['Gray Rain Barrel', 3.5, 2, 'c:gray'], ['Terracotta-style Rain Barrel', 3.5, 2, 'c:terracotta']]);

// Lighting
add('Lighting', 'lamppost', each([['Black Victorian', 'black'], ['Bronze Craftsman', 'bronze'], ['White Colonial', 'white'], ['Copper', 'copper'], ['Modern Black', 'black'], ['Double-Head Black', 'black']], ([n, c]) => [[`${n} Lamp Post`, 7.5, 1.5, `c:${c} light:1`, `a ${n.toLowerCase()} outdoor lamp post`]]));
add('Lighting', 'pathlight', each([['Bronze Mushroom', 'bronze'], ['Black Lantern', 'black'], ['Copper Tulip', 'copper'], ['Brass Bollard', 'copper'], ['Modern Square', 'black'], ['Solar Glass', 'steel']], ([n, c]) => [[`${n} Path Light`, 1.8, 0.6, `c:${c} light:1`, `a ${n.toLowerCase()} landscape path light`]]));
add('Lighting', 'torch', [['Bamboo Tiki Torch', 5, 0.5, 'c:bamboo light:1'], ['Metal Garden Torch', 5, 0.5, 'c:black light:1']]);
add('Lighting', 'uplight', [['Bronze Spot Uplight', 0.7, 0.4, 'c:bronze light:1'], ['Brass Well Light', 0.2, 0.5, 'c:copper light:1']]);
add('Lighting', 'stringlights', [['Bistro String Lights on Poles', 9, 14, 'c:black light:1'], ['Café Lights on Cedar Posts', 9, 14, 'c:cedar light:1']]);
add('Lighting', 'hooklantern', [['Lantern on Shepherd Hook (Black)', 6, 1.5, 'c:black light:1'], ['Solar Lantern on Hook', 6, 1.5, 'c:bronze light:1']]);

// Planters
const potColors = [['Terracotta', 'terracotta'], ['Glazed Cobalt', 'glazeblue'], ['Glazed Emerald', 'glazegreen'], ['Black Fiberglass', 'black'], ['White Fiberglass', 'white'], ['Gray Concrete', 'concrete'], ['Copper', 'copper'], ['Galvanized', 'galv'], ['Cor-Ten Steel', 'rust'], ['Cream Stone', 'limestone']];
add('Planters', 'pot', each(potColors, ([n, c]) => [[`${n} Pot (Small)`, 1.2, 1.2, `c:${c}`, `a small ${n.toLowerCase()} garden pot planted with flowers`], [`${n} Pot (Large)`, 2.2, 2, `c:${c}`, `a large ${n.toLowerCase()} garden pot planted with flowers`]]));
add('Planters', 'planter', each([['Cast Stone Urn', 'limestone'], ['Black Iron Urn', 'black'], ['Concrete Urn', 'concrete'], ['Bronze Urn', 'bronze']], ([n, c]) => [[`${n} Planter`, 3, 2, `c:${c}`, `a classic ${n.toLowerCase()} planter overflowing with flowers`]]));
add('Planters', 'trough', [['Tall Modern Planter (Charcoal)', 3, 1.5, 'c:black'], ['Tall Modern Planter (White)', 3, 1.5, 'c:white'], ['Rectangular Cedar Planter', 2, 4, 'c:cedar'], ['Hypertufa Trough', 1, 2.5, 'c:concrete']]);
add('Planters', 'raisedbed', [['Cedar Raised Bed 4×8', 1, 8, 'c:cedar'], ['Galvanized Raised Bed', 1.5, 6, 'c:galv'], ['Stone Raised Bed', 1.5, 8, 'c:field'], ['Corten Raised Bed', 1.5, 8, 'c:rust'], ['Tall Cedar Elevated Bed', 3, 6, 'c:cedar']]);
add('Planters', 'barrel', [['Half Whiskey Barrel with Flowers', 1.8, 2.5, 'c:oak'], ['Barrel Planter with Herbs', 1.8, 2.5, 'c:oak']]);
add('Planters', 'windowbox', [['Window Box (White)', 0.8, 3, 'c:white'], ['Window Box (Black Iron)', 0.8, 3, 'c:black']]);
add('Planters', 'basket', [['Hanging Basket on Hook', 6, 1.5, 'c:black'], ['Coco Hanging Basket', 6, 1.5, 'c:bark']]);
add('Planters', 'wheelbarrow', [['Vintage Wheelbarrow Planter', 2, 5, 'c:red'], ['Wooden Cart Planter', 2.5, 5, 'c:cedar']]);

// Structures
add('Structures', 'arbor', each([['White Vinyl', 'white'], ['Cedar', 'cedar'], ['Black Metal', 'black'], ['Arched Cedar with Bench', 'teak'], ['Rustic Branch', 'bark'], ['Copper', 'copper']], ([n, c]) => [[`${n} Garden Arbor`, 8, 5, `c:${c}`, `a ${n.toLowerCase()} garden arbor`]]));
add('Structures', 'pergola', each([['Cedar', 'cedar'], ['White Vinyl', 'white'], ['Black Aluminum', 'black'], ['Stained Pine', 'teak']], ([n, c]) => [[`${n} Pergola 12×12`, 9, 12, `c:${c}`, `a ${n.toLowerCase()} 12 by 12 foot pergola`], [`${n} Pergola 10×16`, 9, 16, `c:${c}`, `a ${n.toLowerCase()} 10 by 16 foot pergola`]]));
add('Structures', 'gazebo', [['Octagon Wood Gazebo', 11, 12, 'c:white'], ['Metal Hardtop Gazebo', 10, 12, 'c:black'], ['Cedar Gazebo', 11, 12, 'c:cedar']]);
add('Structures', 'shed', each([['Red Barn', 'red'], ['Gray Saltbox', 'gray'], ['White Cottage', 'white'], ['Sage Green', 'green'], ['Navy', 'blue'], ['Natural Cedar', 'cedar']], ([n, c]) => [[`${n} Garden Shed`, 10, 10, `c:${c}`, `a ${n.toLowerCase()} backyard storage shed`]]));
add('Structures', 'trellis', [['Fan Trellis (White)', 6, 3, 'c:white'], ['Cedar Lattice Trellis', 6, 4, 'c:cedar'], ['Black Metal Trellis', 6, 2, 'c:black']]);
add('Structures', 'obelisk', [['Black Iron Obelisk', 6, 1.5, 'c:black'], ['Cedar Obelisk', 6, 1.5, 'c:cedar'], ['Copper Obelisk', 6, 1.5, 'c:copper']]);
add('Structures', 'greenhouse', [['Glass Greenhouse 8×10', 8, 10, 'c:white'], ['Polycarbonate Greenhouse', 7, 8, 'c:green']]);
add('Structures', 'playhouse', [['Cedar Playhouse', 7, 6, 'c:cedar'], ['Yellow Cottage Playhouse', 7, 6, 'c:yellow']]);
add('Structures', 'swingset', [['Cedar Swing Set', 10, 14, 'c:cedar'], ['Swing Set with Slide', 10, 18, 'c:cedar']]);
add('Structures', 'coop', [['Backyard Chicken Coop', 6, 8, 'c:red'], ['White Chicken Coop', 6, 8, 'c:white']]);
add('Structures', 'bridge', [['Arched Cedar Garden Bridge', 2.5, 8, 'c:cedar'], ['Red Japanese Bridge', 3, 8, 'c:red']]);
add('Structures', 'gate', [['White Picket Garden Gate', 4, 4, 'c:white'], ['Arched Cedar Gate', 6, 4, 'c:cedar'], ['Black Iron Gate', 5, 4, 'c:black']]);
add('Structures', 'mailbox', [['Black Mailbox on Post', 4.5, 1.5, 'c:black'], ['White Colonial Mailbox Post', 4.5, 1.5, 'c:white'], ['Stone Mailbox Column', 5, 2, 'c:field']]);
add('Structures', 'doghouse', [['Cedar Doghouse', 3.5, 4, 'c:cedar']]);

// Fences & walls
add('Fences & Walls', 'fence', each([['White Picket', 'white', 'picket'], ['Natural Cedar Picket', 'cedar', 'picket'], ['Split Rail (2-rail)', 'cedar', 'splitrail'], ['Split Rail (3-rail)', 'cedar', 'splitrail'], ['Black Aluminum', 'black', 'aluminum'], ['White Vinyl Privacy', 'white', 'privacy'], ['Cedar Privacy', 'cedar', 'privacy'], ['Horizontal Slat Cedar', 'teak', 'privacy'], ['Stockade', 'cedar', 'stockade'], ['Cedar Lattice-top Privacy', 'cedar', 'lattice'], ['Gray Composite Privacy', 'gray', 'privacy'], ['Bamboo Screen', 'bamboo', 'privacy']], ([n, c, v]) => [[`${n} Fence (8 ft section)`, v === 'privacy' || v === 'stockade' || v === 'lattice' ? 6 : 4, 8, `c:${c} v:${v}`, `an 8 foot section of ${n.toLowerCase()} fence`]]));
add('Fences & Walls', 'wall', each([['Dry-Laid Fieldstone', 'field', 'dry'], ['Mortared Fieldstone', 'field', 'dry'], ['Bluestone', 'bluestone', 'dry'], ['Gray Segmental Block', 'block', 'block'], ['Tan Segmental Block', 'limestone', 'block'], ['Red Brick', 'brick', 'brick'], ['Stone Gabion', 'gabion', 'gabion'], ['Timber', 'cedar', 'block']], ([n, c, v]) => [[`${n} Retaining Wall (10 ft)`, 2.5, 10, `c:${c} v:${v}`, `a 10 foot ${n.toLowerCase()} garden retaining wall`]]));
add('Fences & Walls', 'pillar', [['Fieldstone Pillar', 4, 2, 'c:field'], ['Brick Pillar with Cap', 4, 2, 'c:brick'], ['Stucco Pillar with Light', 5, 2, 'c:limestone light:1']]);

// Decor
add('Decor', 'statue', [['Classic Angel Statue', 3, 1.5, 'c:limestone'], ['Buddha Garden Statue', 2.5, 2, 'c:concrete'], ['St. Francis Statue', 3, 1.2, 'c:limestone'], ['Bronze Heron Sculpture', 4, 1.5, 'c:bronze'], ['Abstract Steel Sculpture', 5, 2, 'c:rust']]);
add('Decor', 'gazingball', [['Gazing Ball (Cobalt)', 3, 1.2, 'c:blue'], ['Gazing Ball (Silver)', 3, 1.2, 'c:steel'], ['Gazing Ball (Copper)', 3, 1.2, 'c:copper']]);
add('Decor', 'sundial', [['Brass Sundial on Pedestal', 3, 1.2, 'c:limestone'], ['Armillary Sphere', 5, 1.5, 'c:bronze']]);
add('Decor', 'stonelantern', [['Japanese Kasuga Stone Lantern', 4, 1.5, 'c:granite'], ['Japanese Yukimi Snow Lantern', 2.5, 2.5, 'c:granite']]);
add('Decor', 'feeder', [['Pole Bird Feeder Station', 7, 2, 'c:black'], ['Cedar Hopper Feeder on Post', 6, 1.5, 'c:cedar']]);
add('Decor', 'birdhouse', [['Cedar Birdhouse on Post', 7, 1, 'c:cedar'], ['Purple Martin House', 12, 2, 'c:white'], ['Bluebird Box on Post', 5, 1, 'c:cedar']]);
add('Decor', 'gnome', [['Garden Gnome (Classic)', 1.2, 0.6, 'c:red'], ['Garden Gnome (Fishing)', 1.2, 0.8, 'c:blue']]);
add('Decor', 'frog', [['Bronze Frog Statue', 1, 1.2, 'c:bronze'], ['Stone Frog', 0.8, 1, 'c:concrete']]);
add('Decor', 'rabbit', [['Stone Rabbit', 1.5, 1, 'c:limestone'], ['Bronze Rabbit', 1.5, 1, 'c:bronze']]);
add('Decor', 'spinner', [['Copper Wind Spinner', 6, 1.5, 'c:copper'], ['Kinetic Steel Wind Sculpture', 8, 2, 'c:steel']]);
add('Decor', 'flagpole', [['Residential Flagpole with Flag', 20, 3, 'c:steel']]);
add('Decor', 'pumpkins', [['Fall Pumpkin & Mum Display', 2.5, 4, 'c:orange'], ['Hay Bale with Pumpkins', 3, 4, 'c:yellow']]);
add('Decor', 'beehotel', [['Native Bee Hotel', 4, 1, 'c:cedar']]);
add('Decor', 'sign', [['Rustic Welcome Sign', 3, 2, 'c:cedar'], ['House Number Post', 3, 1, 'c:black']]);

// Outdoor living
add('Outdoor Living', 'grill', [['Stainless Gas Grill', 4, 5, 'c:steel'], ['Black Gas Grill', 4, 5, 'c:black'], ['Pellet Smoker', 4, 4.5, 'c:black']]);
add('Outdoor Living', 'kettle', [['Kettle Charcoal Grill', 3.5, 2.3, 'c:black'], ['Kamado Grill (Green)', 4, 2.5, 'c:green'], ['Kamado Grill (Red)', 4, 2.5, 'c:red']]);
add('Outdoor Living', 'umbrella', [['Market Umbrella (Tan)', 8, 9, 'c:canvas'], ['Market Umbrella (Navy)', 8, 9, 'c:blue'], ['Cantilever Umbrella (Gray)', 9, 10, 'c:gray'], ['Market Umbrella (Red)', 8, 9, 'c:red']]);
add('Outdoor Living', 'hottub', [['Hot Tub (Gray)', 3, 7, 'c:gray'], ['Hot Tub (Cedar)', 3, 7, 'c:cedar']]);
add('Outdoor Living', 'kitchen', [['Stone Outdoor Kitchen Island', 3, 8, 'c:field'], ['Stucco Outdoor Kitchen', 3, 10, 'c:limestone'], ['L-Shaped Outdoor Kitchen', 3, 10, 'c:granite']]);
add('Outdoor Living', 'cornhole', [['Cornhole Boards', 1, 6, 'c:blue']]);
add('Outdoor Living', 'trampoline', [['Round Trampoline with Net', 8, 12, 'c:black']]);
add('Outdoor Living', 'hoop', [['Basketball Hoop', 13, 4, 'c:black']]);
add('Outdoor Living', 'compost', [['Compost Bin', 3, 3, 'c:black'], ['Cedar Compost Bin', 3, 3, 'c:cedar'], ['Compost Tumbler', 4, 3, 'c:black']]);
add('Outdoor Living', 'acunit', [['A/C Unit with Lattice Screen', 3, 3, 'c:cedar']]);
add('Outdoor Living', 'trashscreen', [['Cedar Trash Can Screen', 4.5, 6, 'c:cedar'], ['White Vinyl Trash Screen', 4.5, 6, 'c:white']]);
add('Outdoor Living', 'hosereel', [['Hose Reel Cart', 3, 2, 'c:green'], ['Copper Hose Pot', 1.5, 1.5, 'c:copper']]);

export const FEATURES_X = R;

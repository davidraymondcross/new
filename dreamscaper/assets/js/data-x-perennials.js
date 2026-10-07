/* Expanded perennial library, part 1. 6th value = seasons to reach full size. */
import { fam, sp } from './data-x-helpers.js?v=2.7.7';

export const PERENNIALS_X = [
	...fam('Hosta', 'Hosta', 'hosta', 3, 'z3-9 s:PS bl:lavender w:Jul-Aug', 'Shade-loving foliage perennial (deer browse it).', [
		['Sum and Substance', 3, 5, 'lf:gold big'], ['Empress Wu', 4, 6, 'lf:dark big', 'Largest hosta.'], ['Blue Mouse Ears', 0.7, 1, 'lf:blue', 'Miniature.'], ['Mouse Ears', 0.7, 1, 'lf:blue'],
		['Halcyon', 1.5, 3, 'lf:blue'], ['Guacamole', 2, 4, 'lf:lime bl:white', 'Fragrant.'], ['Patriot Select', 1.5, 3, 'lf:variegated'], ['Frances Williams Select', 2, 4, 'lf:variegated big'],
		['Fire and Ice', 1.5, 2, 'lf:variegated'], ['Liberty', 2, 4, 'lf:variegated'], ['Minuteman', 1.5, 3, 'lf:variegated'], ['Golden Tiara', 1, 2, 'lf:variegated'],
		['Wide Brim', 1.5, 3, 'lf:variegated'], ['June Select', 1.5, 3, 'lf:variegated'], ['Krossa Regal', 3, 4, 'lf:blue', 'Vase-shaped blue.'], ['Elegans', 2, 4, 'lf:blue big'],
		['Royal Standard', 2, 4, 'lf:green bl:white', 'Fragrant white; tolerates sun.'], ['August Moon', 2, 3, 'lf:gold'], ['Stained Glass', 1.5, 3, 'lf:variegated'], ['Sun Power', 2, 4, 'lf:gold'],
		['Blue Angel Select', 3, 5, 'lf:blue big'], ['Rainforest Sunrise', 1, 2, 'lf:variegated'], ['Praying Hands', 1.5, 1.5, 'lf:variegated'], ['Curly Fries', 0.7, 1.5, 'lf:gold'],
		['Pandora’s Box', 0.5, 0.7, 'lf:variegated'], ['Abiqua Drinking Gourd', 1.5, 3, 'lf:blue'], ['Big Daddy', 2, 4, 'lf:blue big'], ['Montana Aureomarginata', 2.5, 4, 'lf:variegated big'],
		['Francee Select', 2, 3, 'lf:variegated'], ['Undulata Albomarginata', 1.5, 2, 'lf:variegated'], ['Albo-picta', 1.5, 2, 'lf:variegated'], ['Night Before Christmas', 1.5, 3, 'lf:variegated'],
		['Shadowland Autumn Frost', 1.5, 3, 'lf:variegated'], ['Shadowland Coast to Coast', 2, 4, 'lf:gold'], ['Dancing Queen', 1.5, 3, 'lf:gold'], ['Brother Stefan', 2, 3, 'lf:variegated'],
		['Hadspen Blue', 1, 2, 'lf:blue'], ['Lakeside Paisley Print', 1.5, 3, 'lf:variegated'], ['T Rex', 2.5, 5, 'lf:green big'], ['Plantain Lily (H. plantaginea)', 2, 3, 'lf:light bl:white', 'Fragrant August lily.'],
	]),
	...fam('Daylily', 'Hemerocallis', 'daylily', 2, 'z3-9 s:FP bl:orange w:Jun-Aug fk:lily', 'Tough summer-long lily flowers.', [
		['Stella de Oro Select', 1, 1.5, 'bl:gold'], ['Happy Returns Select', 1.5, 1.5, 'bl:lemon'], ['Pardon Me', 1.5, 1.5, 'bl:red'], ['Little Grapette', 1, 1.5, 'bl:purple'],
		['Rosy Returns Select', 1.5, 1.5, 'bl:pink'], ['Purple de Oro', 1, 1.5, 'bl:purple'], ['Big Time Happy', 1.5, 1.5, 'bl:gold'], ['Going Bananas', 1.5, 2, 'bl:lemon'],
		['Hyperion', 3, 2, 'bl:lemon', 'Fragrant heirloom.'], ['Strawberry Candy', 2, 2, 'bl:pink'], ['Siloam Double Classic', 1.5, 2, 'bl:pink'], ['Frans Hals', 2, 2, 'bl:orange'],
		['Chicago Apache Select', 2.5, 2, 'bl:red'], ['Catherine Woodbery', 2.5, 2, 'bl:lavender'], ['Pandora’s Box', 1.5, 1.5, 'bl:cream'], ['Joan Senior', 2, 2, 'bl:cream'],
		['Ruby Spider', 3, 2, 'bl:red'], ['Bela Lugosi', 3, 2, 'bl:purple'], ['Fooled Me', 2, 2, 'bl:gold'], ['Primal Scream', 3, 2, 'bl:orange'],
		['Night Embers', 2.5, 2, 'bl:crimson'], ['Mary Todd', 2, 2, 'bl:gold'], ['Barbara Mitchell', 2, 2, 'bl:pink'], ['Lady Lucille', 2, 2, 'bl:orange'],
		['Black-eyed Stella', 1, 1.5, 'bl:gold'], ['Plum Perfect', 1.5, 1.5, 'bl:purple'], ['Rainbow Rhythm Ruby Spider', 3, 2, 'bl:red'], ['South Seas', 3, 2, 'bl:coral'],
		['Moonlit Masquerade', 2.5, 2, 'bl:cream'], ['Mighty Chestnut', 3, 2, 'bl:orange'], ['Orange Daylily (Ditch Lily)', 3, 3, 'bl:orange', 'Spreading old-fashioned orange.'], ['Prairie Blue Eyes', 2.5, 2, 'bl:lavender'],
	]),
	...fam('Coneflower', 'Echinacea', 'daisy', 2, 'n z3-8 s:F bl:pink w:Jul-Sep fk:star d', 'Drought-tough pollinator magnet.', [
		['Magnus', 3, 2, 'bl:magenta'], ['White Swan', 2.5, 2, 'bl:white'], ['PowWow Wild Berry', 2, 2, 'bl:hotpink'], ['PowWow White', 2, 2, 'bl:white'],
		['Cheyenne Spirit', 2.5, 2, 'bl:orange', 'Mixed sunset colors.'], ['Sombrero Salsa Red', 2, 2, 'bl:red'], ['Sombrero Lemon Yellow', 2, 2, 'bl:lemon'], ['Sombrero Hot Coral', 2, 2, 'bl:coral'],
		['Sombrero Sandy Yellow', 2, 2, 'bl:gold'], ['Kim’s Knee High', 2, 1.5, 'bl:pink'], ['Green Jewel', 2, 2, 'bl:lime'], ['Green Twister', 3, 2, 'bl:lime'],
		['Hot Papaya', 3, 2, 'bl:orange'], ['Tomato Soup', 3, 2, 'bl:red'], ['Double Scoop Cranberry', 2, 2, 'bl:crimson'], ['Double Scoop Orangeberry', 2, 2, 'bl:orange'],
		['Butterfly Kisses', 1.5, 1.5, 'bl:pink'], ['Pixie Meadowbrite', 2, 1.5, 'bl:pink'], ['Sunrise', 2.5, 2, 'bl:lemon'], ['Fragrant Angel', 3, 2, 'bl:white'],
		['Pale Purple Coneflower', 3, 1.5, 'bl:lavender', 'Native with drooping pale petals.'], ['Tennessee Coneflower', 2, 1.5, 'bl:lavender', 'Rare native, upturned petals.'], ['Yellow Coneflower (E. paradoxa)', 3, 1.5, 'bl:gold'],
		['Ruby Star', 3, 2, 'bl:magenta'], ['Primadonna Deep Rose', 3, 2, 'bl:rose'],
	]),
	...fam('Black-eyed Susan', 'Rudbeckia', 'daisy', 2, 'n z3-9 s:F bl:gold w:Jul-Oct fk:star d', 'Golden late-summer daisies.', [
		['Goldsturm Select', 2, 2, ''], ['Little Goldstar', 1.5, 1.5, ''], ['American Gold Rush', 2, 2.5, '', 'Leaf-spot resistant.'], ['Viette’s Little Suzy', 1, 1.5, ''],
		['Henry Eilers', 4, 2, '', 'Quilled petals.'], ['Cutleaf (R. laciniata)', 6, 3, ''], ['Autumn Sun (Herbstsonne)', 6, 3, ''], ['Brown-eyed Susan (R. triloba)', 3, 2, ''],
		['Sweet Coneflower', 5, 2, ''], ['Prairie Sun', 2.5, 1.5, 'annual'], ['Cherry Brandy', 2, 1.5, 'bl:crimson annual'], ['Denver Daisy', 2, 1.5, 'annual'],
	]),
	...fam('Coral Bells', 'Heuchera', 'hosta', 2, 'n z4-9 s:PS lf:burgundy bl:white w:May-Jul fk:spike', 'Colorful foliage for shade edges.', [
		['Palace Purple Select', 1.5, 1.5, 'lf:burgundy'], ['Obsidian Select', 1, 1.5, 'lf:purple'], ['Caramel Select', 1, 1.5, 'lf:copper'], ['Lime Marmalade Select', 1, 1.5, 'lf:lime'],
		['Berry Smoothie', 1, 2, 'lf:purple'], ['Georgia Peach', 1, 2, 'lf:copper'], ['Plum Pudding', 1, 1.5, 'lf:purple'], ['Fire Chief', 1, 1.5, 'lf:red'],
		['Forever Red', 1, 1.5, 'lf:red'], ['Silver Scrolls', 1, 1.5, 'lf:silver'], ['Dolce Key Lime Pie', 1, 1.5, 'lf:lime'], ['Electric Lime', 1, 1.5, 'lf:lime'],
		['Marmalade', 1, 1.5, 'lf:copper'], ['Midnight Rose', 1, 1.5, 'lf:purple'], ['Southern Comfort', 1, 2, 'lf:copper'], ['Grape Expectations', 1, 1.5, 'lf:purple'],
		['Paris', 1, 1.5, 'lf:silver bl:hotpink'], ['Northern Fire', 1, 1.5, 'lf:silver bl:red'], ['Coral Forest', 1, 1.5, 'lf:silver bl:coral'], ['Green Spice', 1, 1.5, 'lf:silver'],
		['Autumn Bride', 1.5, 2, 'lf:green', 'Native shade heuchera with fall flowers.'], ['Dale’s Strain', 1, 1.5, 'lf:silver', 'Native American alumroot.'],
		['Foamy Bells ‘Sweet Tea’', 1, 2, 'lf:copper', 'Heucherella.'], ['Foamy Bells ‘Stoplight’', 1, 1.5, 'lf:lime', 'Heucherella with red veins.'], ['Foamy Bells ‘Solar Power’', 1, 1.5, 'lf:gold'],
	]),
	...fam('Salvia', 'Salvia', 'spike', 1, 'z4-8 s:F bl:violet w:Jun-Sep fk:spike d', 'Long-blooming spikes for pollinators.', [
		['May Night', 1.5, 1.5, ''], ['Caradonna', 2, 1.5, ''], ['East Friesland', 1.5, 1.5, ''], ['Blue Hill', 1.5, 1.5, 'bl:blue'], ['Snow Hill', 1.5, 1.5, 'bl:white'],
		['Rose Marvel', 1.5, 1.5, 'bl:rose'], ['Bumbleberry', 1, 1.5, ''], ['Pink Profusion', 1.5, 1.5, 'bl:pink'], ['Merleau Blue', 1, 1.5, 'bl:blue'], ['Violet Profusion', 1.5, 1.5, ''],
		['Lyrical Blues', 1.5, 1.5, 'bl:blue'], ['Sensation Rose', 1, 1, 'bl:rose'], ['Fashionista Midnight Model', 1.5, 1.5, ''], ['Lyreleaf Sage', 1.5, 1, 'n bl:lavender', 'Native sage.'],
	]),
	...fam('Catmint', 'Nepeta', 'mound', 1, 'z3-8 s:F bl:lavender w:May-Sep d', 'Billowy lavender-blue edging.', [
		['Walker’s Low Select', 2.5, 3, ''], ['Cat’s Pajamas', 1, 1.5, 'bl:violet'], ['Kit Kat', 1.5, 1.5, ''], ['Purrsian Blue', 1.5, 2, 'bl:blue'], ['Six Hills Giant', 3, 3, ''], ['Junior Walker', 1.5, 2.5, ''], ['Little Trudy', 1, 1.5, ''],
	]),
	...fam('Lavender', 'Lavandula', 'mound', 2, 'z5-9 s:F lf:silver bl:lavender w:Jun-Jul d', 'Fragrant silver-leaved herb.', [
		['Hidcote', 1.5, 2, 'bl:violet'], ['Phenomenal', 2, 2.5, ''], ['Grosso', 2.5, 3, ''], ['Provence', 2.5, 3, ''], ['Ellagance Purple', 1, 1, 'bl:violet'], ['Thumbelina Leigh', 1, 1, ''],
		['Super Blue', 1, 1, 'bl:blue'], ['Big Time Blue', 1.5, 2, 'bl:blue'], ['Sweet Romance', 1.5, 1.5, 'bl:purple'], ['Spanish Lavender', 2, 2, 'bl:purple'],
	]),
	...fam('Peony', 'Paeonia', 'peony', 3, 'z3-8 s:F bl:pink w:May-Jun fk:cup d', 'Long-lived perennial with huge fragrant flowers.', [
		['Bowl of Beauty', 3, 3, 'bl:pink'], ['Coral Charm', 3, 3, 'bl:coral'], ['Coral Sunset', 3, 3, 'bl:coral'], ['Duchesse de Nemours', 3, 3, 'bl:white'],
		['Dinner Plate', 3, 3, 'bl:pink'], ['Shirley Temple', 3, 3, 'bl:cream'], ['Red Charm', 3, 3, 'bl:red'], ['Kansas', 3, 3, 'bl:crimson'], ['Monsieur Jules Elie', 3, 3, 'bl:pink'],
		['Pink Hawaiian Coral', 3, 3, 'bl:coral'], ['Paul M. Wild', 3, 3, 'bl:crimson'], ['Raspberry Sundae', 3, 3, 'bl:pink'], ['Moon over Barrington', 3, 3, 'bl:white'],
		['Itoh ‘Cora Louise’', 2.5, 3, 'bl:white'], ['Itoh ‘Julia Rose’', 2.5, 3, 'bl:peach'], ['Itoh ‘Scarlet Heaven’', 2.5, 3, 'bl:red'], ['Itoh ‘Hillary’', 2.5, 3, 'bl:coral'],
		['Fernleaf Peony', 2, 2, 'bl:red fine', 'Ferny foliage, early red.'], ['Tree Peony ‘Shimadaijin’', 4, 4, 'bl:magenta', 'Woody tree peony.', 'mound'], ['Tree Peony ‘High Noon’', 4, 4, 'bl:lemon', '', 'mound'],
	]),
	...fam('Astilbe', 'Astilbe', 'plume', 2, 'z4-8 s:PS bl:pink w:Jun-Jul fk:panicle d', 'Feathery plumes for moist shade.', [
		['Fanal Select', 2, 1.5, 'bl:red'], ['Bridal Veil Select', 2, 1.5, 'bl:white'], ['Visions in Pink', 1.5, 1.5, 'bl:pink'], ['Visions in Red', 1.5, 1.5, 'bl:red'], ['Visions in White', 1.5, 1.5, 'bl:white'],
		['Purple Candles', 3, 2, 'bl:purple'], ['Deutschland', 2, 1.5, 'bl:white'], ['Rheinland', 2, 1.5, 'bl:pink'], ['Sprite', 1, 1.5, 'bl:pink'], ['Delft Lace', 2, 2, 'bl:pink'],
		['Pumila (dwarf Chinese)', 1, 1.5, 'bl:lavender'], ['Amethyst', 3, 2, 'bl:lavender'], ['Chocolate Shogun', 2, 1.5, 'lf:burgundy bl:pink'], ['Montgomery', 2, 1.5, 'bl:crimson'],
	]),
	...fam('Garden Phlox', 'Phlox paniculata', 'upright', 2, 'n z4-8 s:FP bl:pink w:Jul-Sep fk:umbel', 'Fragrant summer phlox (choose mildew-resistant).', [
		['David Select', 4, 2, 'bl:white'], ['Jeana Select', 4, 2, 'bl:lavender'], ['Bright Eyes', 3, 2, 'bl:pink'], ['Laura', 3, 2, 'bl:purple'], ['Nicky', 3, 2, 'bl:magenta'],
		['Blue Paradise', 3, 2, 'bl:blue'], ['Peppermint Twist', 1.5, 1.5, 'bl:pink'], ['Flame Pink', 1.5, 1.5, 'bl:pink'], ['Flame Purple', 1.5, 1.5, 'bl:purple'], ['Starfire', 3, 2, 'bl:red'],
		['Volcano Red', 3, 2, 'bl:red'], ['Sherbet Cocktail', 3, 2, 'bl:lime'], ['Opening Act Blush', 2.5, 2, 'bl:pink'], ['Glamour Girl', 3, 2, 'bl:coral'],
	]),
	...fam('Creeping Phlox', 'Phlox subulata', 'mat', 1, 'n ev z3-9 s:F bl:pink w:Apr-May d', 'Spring carpet of flowers.', [
		['Emerald Blue Select', 0.5, 2, 'bl:lavender'], ['Scarlet Flame Select', 0.5, 2, 'bl:hotpink'], ['Candy Stripe', 0.5, 2, 'bl:pink'], ['Snowflake', 0.5, 2, 'bl:white'], ['Purple Beauty', 0.5, 2, 'bl:purple'], ['Fort Hill', 0.5, 2, 'bl:pink'],
	]),
	...sp(
		['Woodland Phlox', 'Phlox divaricata', 'mat', 1, 1.5, 1, 'n z3-8 s:PS bl:lavender w:Apr-May', 'Native spring phlox for shade.'],
		['Woodland Phlox ‘May Breeze’', 'Phlox divaricata', 'mat', 1, 1.5, 1, 'n z3-8 s:PS bl:white w:Apr-May', 'White native phlox.'],
		['Creeping Woodland Phlox ‘Sherwood Purple’', 'Phlox stolonifera', 'mat', 0.5, 2, 1, 'n z4-8 s:PS bl:purple w:Apr-May', 'Shade groundcover phlox.'],
		['Smooth Phlox ‘Minnie Pearl’', 'Phlox glaberrima', 'upright', 2, 1.5, 2, 'n z4-8 s:FP bl:white w:May-Jun', 'Early, mildew-free.'],
	),
	...fam('Sedum', 'Hylotelephium', 'mound', 1, 'z3-9 s:F bl:pink w:Aug-Oct fk:umbel d', 'Succulent late-season stonecrop.', [
		['Autumn Joy', 2, 2, 'bl:rose'], ['Autumn Fire', 2, 2, 'bl:rose'], ['Matrona', 2, 2, 'bl:pink lf:bluegreen'], ['Purple Emperor', 1.5, 1.5, 'lf:purple'], ['Neon', 1.5, 1.5, 'bl:hotpink'],
		['Brilliant', 1.5, 1.5, 'bl:pink'], ['Thunderhead', 2, 2, 'bl:rose'], ['Rock N Grow Superstar', 1, 1.5, 'lf:purple'], ['Rock N Grow Back in Black', 1, 1.5, 'lf:purple'], ['Rock N Grow Lemonjade', 1, 1.5, 'bl:lime'],
		['Frosty Morn', 1.5, 1.5, 'lf:variegated bl:white'], ['Mr. Goodbud', 1.5, 1.5, 'bl:purple'], ['Dazzleberry', 0.5, 1.5, 'lf:purple', '', 'mat'], ['Firecracker', 0.5, 1.5, 'lf:burgundy', '', 'mat'], ['Lime Zinger', 0.5, 1.5, 'lf:lime', '', 'mat'],
	]),
	...fam('Groundcover Sedum', 'Sedum', 'mat', 1, 'ev z4-9 s:F bl:gold w:Jun d', 'Low succulent carpet for hot dry spots.', [
		['Blue Spruce', 0.5, 1.5, 'lf:blue'], ['Cape Blanco', 0.3, 1, 'lf:silver'], ['Tricolor', 0.3, 1.5, 'lf:variegated bl:pink'], ['Fuldaglut', 0.3, 1.5, 'lf:burgundy bl:red'], ['Coral Carpet', 0.3, 1.5, 'lf:copper bl:white'], ['Gold Moss', 0.2, 1.5, 'lf:gold'],
	]),
	...fam('Tickseed', 'Coreopsis', 'mound', 1, 'n z4-9 s:F bl:gold w:Jun-Sep fk:star d', 'Cheery long-blooming daisies.', [
		['Moonbeam', 1.5, 1.5, 'bl:lemon fine'], ['Zagreb', 1.5, 1.5, 'fine'], ['Full Moon', 2, 2, 'bl:lemon'], ['Early Sunrise', 1.5, 1.5, ''], ['Jethro Tull', 1.5, 1.5, ''], ['Route 66', 2, 2, 'bl:gold'],
		['Red Satin', 1.5, 1.5, 'bl:crimson'], ['Mercury Rising', 1.5, 1.5, 'bl:burgundy'], ['Pink Sapphire (Rosea)', 1.5, 1.5, 'bl:pink fine'], ['Lanceleaf (native)', 2, 1.5, ''],
	]),
	...fam('Shasta Daisy', 'Leucanthemum × superbum', 'daisy', 1, 'z5-9 s:F bl:white w:Jun-Aug fk:star d', 'Classic white summer daisy.', [
		['Becky', 3, 2, ''], ['Snowcap', 1.5, 1.5, ''], ['Alaska', 2.5, 2, ''], ['Crazy Daisy', 2.5, 2, ''], ['Amazing Daisies Daisy May', 1.5, 2, ''], ['Real Glory', 2, 2, ''], ['Banana Cream', 1.5, 1.5, 'bl:lemon'],
	]),
	...fam('Yarrow', 'Achillea', 'umbel', 1, 'z3-9 s:F bl:gold w:Jun-Aug fk:umbel fine d', 'Flat flower heads; drought tough.', [
		['Moonshine', 2, 2, 'lf:silver bl:lemon'], ['Coronation Gold', 3, 2, ''], ['Paprika', 2, 2, 'bl:red'], ['Terracotta', 2.5, 2, 'bl:orange'], ['Pomegranate', 2, 2, 'bl:crimson'],
		['Little Moonshine', 1, 1.5, 'bl:lemon'], ['Strawberry Seduction', 1.5, 1.5, 'bl:red'], ['Saucy Seduction', 1.5, 1.5, 'bl:pink'], ['Common White (native)', 2, 2, 'n bl:white'], ['Summer Berries', 2, 2, 'bl:pink'],
	]),
	...fam('Hardy Geranium', 'Geranium', 'mound', 1, 'z4-8 s:FP bl:violet w:May-Sep fk:cup d', 'Long-blooming cranesbill.', [
		['Rozanne', 1.5, 2.5, ''], ['Azure Rush', 1, 2, 'bl:skyblue'], ['Johnson’s Blue', 1.5, 2, 'bl:blue'], ['Biokovo', 0.7, 2, 'bl:white'], ['Max Frei', 0.7, 1.5, 'bl:magenta'],
		['Elke', 0.7, 1.5, 'bl:pink'], ['Karmina', 1, 2, 'bl:pink'], ['Brookside', 2, 2, 'bl:blue'], ['Wild Geranium (native)', 1.5, 1.5, 'n bl:lavender w:Apr-May'], ['Espresso (native)', 1.5, 1.5, 'n lf:burgundy bl:lavender w:May'],
		['Bloody Cranesbill', 1, 2, 'bl:magenta'], ['Big Root (Bevan’s Variety)', 1, 2, 'bl:magenta w:May-Jun'],
	]),
	...fam('Bearded Iris', 'Iris germanica', 'iris', 2, 'z3-9 s:F bl:purple w:May-Jun fk:lily d', 'Ruffled iris flowers in late spring.', [
		['Immortality', 2.5, 1.5, 'bl:white w:May-Jun', 'Reblooming white.'], ['Beverly Sills', 3, 1.5, 'bl:coral'], ['Victoria Falls', 3, 1.5, 'bl:blue'], ['Superstition', 3, 1.5, 'bl:burgundy'],
		['Batik', 2.5, 1.5, 'bl:purple'], ['Edith Wolford', 3, 1.5, 'bl:lemon'], ['Rock Star', 3, 1.5, 'bl:lemon'], ['Titan’s Glory', 3, 1.5, 'bl:violet'], ['Harvest of Memories', 3, 1.5, 'bl:gold'],
		['Orange Harvest', 3, 1.5, 'bl:orange'], ['Dwarf Bearded ‘Cherry Garden’', 1, 1, 'bl:crimson'],
	]),
	...fam('Siberian Iris', 'Iris sibirica', 'iris', 2, 'z3-9 s:FP bl:blue w:Jun fk:lily d', 'Grassy clumps with elegant flowers.', [
		['Caesar’s Brother Select', 3, 2, 'bl:violet'], ['Butter and Sugar', 2.5, 2, 'bl:cream'], ['Snow Queen', 2.5, 2, 'bl:white'], ['Silver Edge', 2.5, 2, 'bl:blue'], ['Pink Haze', 2.5, 2, 'bl:pink'], ['Sugar Rush', 2, 2, 'bl:purple'],
	]),
	...sp(
		['Japanese Iris ‘Variegata’', 'Iris ensata', 'iris', 3, 2, 2, 'z4-9 s:F lf:variegated bl:purple w:Jun-Jul fk:lily', 'Striped leaves, purple flowers.'],
		['Japanese Iris ‘Lion King’', 'Iris ensata', 'iris', 3, 2, 2, 'z4-9 s:F bl:violet w:Jun-Jul fk:lily', 'Huge flat flowers.'],
		['Yellow Flag Iris (sterile)', 'Iris pseudacorus', 'iris', 3, 2, 2, 'z4-9 s:F bl:gold w:May-Jun fk:lily', 'Pond-edge iris.'],
		['Dwarf Crested Iris', 'Iris cristata', 'mat', 0.5, 1.5, 1, 'n z3-9 s:PS bl:lavender w:Apr-May fk:lily', 'Native miniature iris.'],
		['Netted Iris', 'Iris reticulata', 'bulb', 0.5, 0.3, 1, 'z5-9 s:F bl:blue w:Mar ephem', 'Tiny late-winter iris.'],
	),
	...fam('Bee Balm', 'Monarda', 'upright', 1, 'n z4-9 s:FP bl:red w:Jul-Aug fk:star d', 'Native mint with hummingbird flowers.', [
		['Jacob Cline Select', 4, 3, 'bl:red'], ['Raspberry Wine Select', 3, 3, 'bl:magenta'], ['Grand Parade', 1, 1.5, 'bl:purple'], ['Pardon My Pink', 1, 1.5, 'bl:pink'],
		['Balmy Lilac', 1, 1.5, 'bl:lavender'], ['Fireball', 1.5, 1.5, 'bl:red'], ['Blue Stocking', 3, 2, 'bl:violet'], ['Wild Bergamot (M. fistulosa)', 3, 2, 'bl:lavender'], ['Spotted Bee Balm', 2, 1.5, 'bl:pink'],
	]),
	...fam('Hyssop', 'Agastache', 'spike', 1, 'z5-9 s:F bl:lavender w:Jul-Sep fk:spike d', 'Fragrant spikes for bees and hummingbirds.', [
		['Blue Fortune Select', 3, 2, ''], ['Black Adder', 3, 2, 'bl:violet'], ['Blue Boa', 2, 1.5, 'bl:violet'], ['Kudos Mandarin', 1.5, 1, 'bl:orange'], ['Kudos Coral', 1.5, 1, 'bl:coral'],
		['Rosie Posie', 2, 1.5, 'bl:hotpink'], ['Golden Jubilee', 2, 1.5, 'lf:gold'], ['Little Adder', 1.5, 1, 'bl:violet'], ['Arcado Pink', 2.5, 1.5, 'bl:pink'],
	]),
	...fam('Speedwell', 'Veronica', 'spike', 1, 'z3-8 s:F bl:violet w:Jun-Aug fk:spike d', 'Neat spikes for front borders.', [
		['Royal Candles', 1.5, 1.5, ''], ['Purpleicious', 1.5, 1.5, 'bl:purple'], ['Red Fox', 1, 1, 'bl:hotpink'], ['Icicle', 1.5, 1, 'bl:white'], ['First Love', 1, 1, 'bl:pink'],
		['Moody Blues Dark Blue', 1, 1, 'bl:blue'], ['Georgia Blue', 0.5, 1.5, 'bl:blue w:Apr-May', 'Spring groundcover speedwell.', 'mat'], ['Culver’s Root ‘Fascination’', 5, 2, 'n bl:lavender'],
	]),
	...fam('False Indigo', 'Baptisia', 'mound', 3, 'n z3-9 s:F bl:blue w:May-Jun fk:spike d', 'Long-lived native with lupine-like spikes.', [
		['Purple Smoke', 4, 4, 'bl:lavender'], ['Decadence Lemon Meringue', 3, 3, 'bl:lemon'], ['Decadence Vanilla Cream', 2.5, 2.5, 'bl:cream'], ['Decadence Dutch Chocolate', 3, 3, 'bl:burgundy'],
		['Decadence Cherries Jubilee', 3, 3, 'bl:coral'], ['Decadence Blueberry Sundae', 3, 3, 'bl:blue'], ['Carolina Moonlight', 4, 4, 'bl:lemon'], ['White Wild Indigo', 4, 3, 'bl:white'], ['Twilite Prairieblues', 5, 4, 'bl:purple'],
	]),
	...fam('Bluestar', 'Amsonia', 'mound', 2, 'n z4-9 s:FP bl:skyblue w:May fk:star fc:gold d fine', 'Native with blue spring stars and golden fall color.', [
		['Hubricht’s (Arkansas)', 3, 3, ''], ['Blue Ice', 1.5, 2, 'bl:blue'], ['Storm Cloud', 3, 3, 'bl:blue'], ['Eastern Bluestar', 3, 3, '-fine'],
	]),
	...fam('Milkweed', 'Asclepias', 'umbel', 2, 'n z3-9 s:F bl:orange w:Jun-Aug d', 'Monarch butterfly host plant.', [
		['Butterfly Weed', 2, 1.5, ''], ['Hello Yellow', 2, 1.5, 'bl:gold'], ['Common Milkweed', 4, 2, 'bl:pink'], ['Swamp ‘Ice Ballet’', 4, 2, 'bl:white'], ['Swamp ‘Cinderella’', 4, 2, 'bl:pink'],
	]),
	...fam('Blazing Star', 'Liatris', 'spike', 1, 'n z3-9 s:F bl:magenta w:Jul-Aug fk:spike d', 'Native purple bottlebrush spikes.', [
		['Kobold', 2, 1, ''], ['Floristan White', 3, 1, 'bl:white'], ['Prairie (L. pycnostachya)', 4, 1.5, ''], ['Rough (L. aspera)', 3, 1, ''], ['Meadow (L. ligulistylis)', 3, 1, ''],
	]),
	...fam('Beardtongue', 'Penstemon', 'spike', 1, 'n z3-8 s:F bl:white w:May-Jun fk:trumpet d', 'Native with tubular flowers.', [
		['Husker Red', 3, 1.5, 'lf:burgundy'], ['Dark Towers', 3, 1.5, 'lf:purple bl:pink'], ['Midnight Masquerade', 3, 1.5, 'lf:purple bl:lavender'], ['Pocahontas', 2.5, 1.5, 'lf:purple bl:pink'], ['Rock Candy Ruby', 1, 1, 'bl:red'], ['Hairy (P. hirsutus)', 1.5, 1, 'bl:lavender'],
	]),
	...fam('Russian Sage', 'Salvia yangii', 'upright', 2, 'z4-9 s:F lf:silver bl:lavender w:Jul-Sep d fine', 'Airy silver-and-lavender haze.', [
		['Denim ’n Lace', 3, 3, ''], ['Blue Jean Baby', 3, 3, 'bl:blue'], ['Lacey Blue', 1.5, 2, ''], ['Crazy Blue', 2, 2, 'bl:violet'], ['Little Spire Select', 2, 1.5, ''],
	]),
	...fam('Blanket Flower', 'Gaillardia', 'daisy', 1, 'n z3-9 s:F bl:red w:Jun-Sep fk:star d', 'Hot-colored daisies for dry sun.', [
		['Arizona Sun', 1, 1, ''], ['Arizona Apricot', 1, 1, 'bl:apricot'], ['Mesa Yellow', 1.5, 1.5, 'bl:gold'], ['Fanfare', 1.5, 1.5, 'bl:red'], ['Burgundy', 2, 1.5, 'bl:burgundy'], ['Goblin', 1, 1, ''],
	]),
	...fam('Sneezeweed', 'Helenium autumnale', 'daisy', 2, 'n z3-8 s:F bl:gold w:Aug-Oct fk:star d', 'Late summer daisies in fire colors.', [
		['Mardi Gras', 3, 2, 'bl:orange'], ['Moerheim Beauty', 3, 2, 'bl:red'], ['Short ’n’ Sassy', 2, 2, ''], ['Ruby Tuesday', 2, 2, 'bl:crimson'], ['Mariachi Salsa', 1.5, 1.5, 'bl:red'],
	]),
	...fam('Perennial Sunflower', 'Helianthus', 'upright', 2, 'n z4-9 s:F bl:gold w:Aug-Oct fk:star', 'Tall native sunflowers.', [
		['Lemon Queen', 6, 3, 'bl:lemon'], ['First Light', 3, 3, ''], ['Low Down', 1, 2, ''], ['Willowleaf', 6, 3, 'fine'],
	]),
	...fam('False Sunflower', 'Heliopsis helianthoides', 'upright', 2, 'n z3-9 s:F bl:gold w:Jul-Sep fk:star d', 'Long-blooming native sunflower.', [
		['Summer Sun', 3, 2, ''], ['Tuscan Sun', 2, 2, ''], ['Burning Hearts', 3, 2, 'lf:purple bl:orange'], ['Bleeding Hearts', 3, 2, 'lf:burgundy bl:orange'],
	]),
	...fam('Aster', 'Symphyotrichum', 'mound', 2, 'n z3-8 s:F bl:purple w:Sep-Oct fk:star d', 'Native fall daisies for late pollinators.', [
		['Purple Dome', 1.5, 2.5, ''], ['Woods Blue', 1, 1.5, 'bl:blue'], ['Woods Pink', 1, 1.5, 'bl:pink'], ['Alma Potschke', 3, 2, 'bl:hotpink'], ['October Skies', 1.5, 2, 'bl:blue'],
		['Raydon’s Favorite', 2, 2, 'bl:lavender'], ['Bluebird', 3, 2, 'bl:blue'], ['Snow Flurry (Heath)', 0.5, 2, 'bl:white', '', 'mat'], ['Lady in Black (Calico)', 3, 2, 'bl:white lf:burgundy'],
		['New England Aster', 4, 2, ''], ['White Wood Aster', 2, 2, 'bl:white s:PS'], ['Smooth Blue Aster', 3, 2, 'bl:blue'], ['Aromatic Aster', 2, 2, 'bl:lavender'], ['Kickin Lilac', 1.5, 2, 'bl:lavender'],
	]),
];

=== DreamScaper ===
Contributors: davidslandscaping
Tags: landscape design, garden planner, yard design, visualizer
Requires at least: 6.0
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 2.4.0
License: GPLv2 or later

A fun, full-screen yard design studio for your website visitors.

== Description ==

Customers start from a photo of their own yard (camera with framing guides or upload), a
Connecticut bird's-eye view (CT ECO 2023 statewide 3-inch aerials), or a ready-made sample yard.
Then they:

* Choose from 2,656 East Coast plants (644 trees, 299 evergreens, 645 shrubs, 708 perennials, 131 grasses, 155 annuals, 74 vines) and 488 garden features, each with common and scientific names,, drawn at true scale using the photo's perspective
* Every plant carries real growth data: inches per year, mature height and width, years to maturity, bloom months and color, fall color, light, USDA zones, native and deer-resistant flags
* Search and filter by native, deer resistant, evergreen, light, bloom season, flower color and mature height; tap the i for a full fact sheet with four-season previews and a growth chart
* Add from a photo: snap any plant, planter, bench or boulder; DreamScaper cuts it out on the device (no AI, nothing uploaded), suggests what it is, and saves it to My Assets as a small transparent WebP. Link it to a library plant and the photo grows, blooms and changes with the seasons using that plant's data
* One-button voice search (Chrome, Edge, Safari) over common and scientific names, colors, light and more, with typo-tolerant matching
* Real photo library: install Library packs (Settings → DreamScaper → Library packs) to show photo-real plants, features and 3D-rendered assets with real seasonal photos, or upload your own cut-outs
* Paint with 121 drawn ground materials plus 839 photo-scanned materials from the Materials pack: mulches, gravels, lawns, groundcovers, pavers, natural stone and decking
* Pick each plant's age at planting and slide the Time machine to watch it grow year by year (or press Play)
* Switch seasons (spring blooms, fall color, bare winter branches) and day/night lighting
* Paint mulch, stone, lawn, pavers and more onto the ground, with perspective and real shadows
* Draw smooth garden beds and patios with steel, stone or brick edging
* Magic-erase unwanted things: tap an area, or "All similar" to grab every match in color, shape and size
* Save multiple views (angles) per design, name their Dreamscapes, and come back anytime.
  Everything autosaves privately on their own device (browser storage). Nothing is uploaded.
* Save a picture, or (optional) send the design to you with their contact info

Optional: add a Google Maps API key to turn on "Explore in 3D". Customers can fly around their home
in Google's photorealistic 3D, bookmark favorite viewing angles, and get directions for snapping a
photo from that spot. Saved angles store camera positions only; no Google imagery is captured,
stored or edited (as Google's terms require).

== Installation ==

1. Plugins → Add New → Upload Plugin → choose dreamscaper.zip → Install → Activate.
2. Settings → DreamScaper: confirm your business name, the email designs are sent to, and
   (optionally) a Google Maps API key restricted to your domain with the Maps JavaScript API enabled.
3. Add the shortcode [dreamscaper] to any page. Optional attributes:
   [dreamscaper title="DreamScaper" button="Start designing" text="Your description"]
4. Any link to #dreamscaper, or any element with data-dreamscaper-open, also opens the studio
   (on a page that contains the shortcode).

If you use a caching/minify plugin, exclude assets/js/*.js in this plugin from JavaScript
combining/minification (they are ES modules) and exclude /wp-json/dreamscaper/* from page caching.

== Frequently Asked Questions ==

= Where are designs saved? =
In the visitor's own browser (IndexedDB) on that device. Clearing browser data deletes them.

= Does the camera work on every phone? =
The live camera needs the page to load over https. If the camera isn't available, it falls back
to the phone's photo picker.

== Changelog ==

= 2.4.0 =
* New: Dreamscape Browser — the DreamScaper community. Members post finished designs (with a before/after slider) and "Ask for ideas" photos of spots in their yard.
* Every shared design automatically lists the plants and features used, how many, their age and size at the year shown, the season, the ground materials, and whether AI was used. Tap a plant for its facts.
* Like 👍, 5-star ratings, comments with one level of replies, and "reply with a design" pictures on Ask-for-ideas posts.
* Browse by Trending, Newest, Top rated, Most liked, Most discussed or Most viewed; filter by time, rating and tags; search posts, plants and members; Following feed; monthly and all-time leaderboard.
* Member profiles: photo, display name, bio, level, badges, member-since, followers/following, posts. Follow, add friends, block, report.
* Private messages between members, in-app notifications with unread badges, and optional emails (members choose which).
* Points for daily visits, designing, Plant ID, AI designs, sharing, comments, helping, likes, ratings and followers (daily caps stop abuse). 7 levels from Seedling to Garden Legend, 16 badges, day streaks, unlockable name styles (leaf green, gold, blooming gradient, legend glow) and titles. Trade points for AI credits or storage. All values editable in Settings.
* Safety: posts go live right away; reported items hide after 3 reports until reviewed in Settings → DreamScaper Community (also: remove, ban, give bonus points). Optional AI image check, a word filter, a privacy confirmation before posting, and public profiles never show email, phone or address.

= 2.3.0 =
* New home screen built for phones: DreamScaper logo on top, a full-width "Start a new Dreamscape" button, then large tiles — Identify Plant, Asset Library, My Dreamscapes, Dreamscape Browser, Create New Asset, Extract Asset and My Account — and your 4 latest Dreamscapes. Every button gives a ripple and color flash when tapped.
* New: Asset Library page (browse every plant and feature outside the editor), Extract Asset (pull one item out of a photo or one of your Dreamscapes by box or by name), and a My Account page (credits, storage, details, tours, sign out).
* Changed: the private design organizer is now "My Dreamscapes"; "Dreamscape Browser" is the community (preview page; opens in the next update).
* New: History window in the editor — every change is listed by name; tap any step to go back or forward.
* New: Dreamscape AI one-click tools on the left — Select (17 things, free), Remove (20 things) and Add (24 things). Each is one AI change and only that area of the photo changes. Selections offer Remove, Replace with… and Make it look better.
* New: Dreamscape AI history — go back one step at a time without regenerating.
* New: "This uses 1 AI credit" reminder before the first AI action, with "Don't ask me again".
* New: guided tours that point at the real buttons on the home screen, editor and AI studio, with Skip and "Don't offer tours again"; turn them back on in How it works or My Account.
* Mobile: bigger tap targets (44px+), bottom-sheet dialogs, two-column tiles and cards, a "⋯" menu for less-used editor actions, and the editor top bar no longer cuts off buttons.

= 2.2.0 =
* New: DreamScaper logo — a head with a dream of leaves and vines growing out of it — on the home page, in every header and on the website launcher. The name is now written DreamScaper everywhere.
* New: Dreamscape Browser. The home page shows the 8 most recent Dreamscapes plus "See all"; the browser has search, sort, favorites, ready-made tags (Yard, Bed, Paver, My Home designs, Front yard, Backyard, Ideas to try), customers' own tags (create, rename, delete), multi-tag filtering, and multi-select to tag, favorite or delete. Tags sync across devices.
* New: Plant ID is plants only and explains what it gives you: name, weed/invasive alerts, real growth data linked automatically (our library, a close relative, or a horticulture estimate), and a picture of its size now and in 3, 5 and 10 years. Saving to My Library is now the customer's choice, showing how much space it uses and how much is left.
* New: online storage per customer — see used/left under the account menu, and buy more (one-time packs via Stripe, editable in Settings). The server enforces each customer's total (free + bought).
* Changed: "My Assets" is now called "My Library".
* Fix: Plant ID showed "null null" at the bottom.

= 2.1.0 =
* New: one "Start a new Dreamscape" button. A guided 2-step window lets the customer pick "Design it myself" or "Design it with AI" (same size and style; AI just shows a "Free sign-in" tag) and explains what each does.
* New: buy extra AI credits — packs (Starter 15 / $2.99, Popular 40 / $6.99, Pro 100 / $14.99) or an exact number at $0.25 each (min 5). Secure Stripe Checkout; credits are added by webhook and on return, counted once. Free daily credits are used first; bought credits never expire. Prices editable in Settings.
* New: Plant ID on every screen (home, editor, Dreamscape AI). Snap a plant, weed or garden item; get the name, weed/invasive/poison-ivy warnings, and it saves to My Assets ready to place.
* New: "How it works" tutorial (13 topics) and an in-editor step guide (scale → plants → ground → time → finish) with "Show me" buttons.
* New: Dreamscape AI studio shows numbered steps with optional tags and a short explanation of each part.
* Fix: customers could appear signed out after returning from Google/Facebook sign-in or checkout.

= 2.0.0 =
* New: customer accounts — email/password, Google and Facebook sign-in. Collects name, email, phone and yard address. Designs and My Assets save online and open on any device (still work offline on the device). Customers can delete their account.
* New: Dreamscape AI (Black Forest Labs FLUX.2 [klein] 4B): tap ideas (with options), style & goals, talk or type, add up to 3 inspiration photos (camera, upload, or the library incl. My Assets). The prompt writes itself. Before/after slider, quick tweaks, “fix just one area”, every version kept with undo/redo, “Mark it up” sends the result into the editor. 10 AI generations per customer per day (setting), signed-in only; count always visible.
* New AI tools in the editor: AI Erase (say what to remove), Smart Select (Meta SAM 3 – select the lawn, beds, driveway… then paint, erase or replace), Make it real, Season & light, and What is this? (Pl@ntNet + vision) which auto-labels and saves to My Assets.
* New: share to Facebook, Pinterest, X, WhatsApp, Nextdoor, LinkedIn, Reddit, email or the phone's share sheet (Instagram/TikTok) via a public share page with before/after; Print button.
* Fixed: bird's-eye address autocomplete (Google Places when a key is set, otherwise OpenStreetMap/Connecticut address points) and the space bar not typing on some themes.

= 1.3.0 =
* Library expanded to 2,656 plants and 488 features.
* New: Library packs (zip installer). Photos pack 1 adds photo-real seasonal cut-outs and 43 new 3D-rendered plants and stone groups with real top views. Materials pack adds 839 seamless photo textures (Poly Haven and ambientCG, CC0, plus new mulch, stone, lawn and groundcover textures).
* Photo materials now ship as a pack to keep the plugin small.

= 1.2.0 =
* New: Add from a photo (on-device cut-out with keep/remove brushes, box and ground line; category and plant suggestions; My Assets library).
* New: one-button voice search and typo-tolerant search over common and scientific names.
* New: photo-asset engine. Real photos grow with the plant's data and change by season (fall color, bare winter branches, flowers only in bloom months).
* New: Library photos uploader in Settings so the site owner can replace drawn plants with real photos.
* Drawn plants get a more natural, photo-style finish.

= 1.1.0 =
* Library expanded about 10x: 483 plants, 140 features, 121 materials, all with real growth and bloom data.
* New search, filters, fact sheets, lazy-loading thumbnails, new fern, grass, conifer and feature models.
* Fixed paver textures failing to draw on some tiles.

= 1.0.0 =
* First release.

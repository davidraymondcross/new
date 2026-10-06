=== DreamScaper ===
Contributors: davidslandscaping
Tags: landscape design, garden planner, yard design, visualizer
Requires at least: 6.0
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 2.7.1
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

= Contractor CRM (optional) =
5. Settings → DreamScaper → Contractors: leave “Turn on the Contractor Hub…” ticked. Approve contractors under Settings → DreamScaper Contractors.
6. Text messages: add your Twilio Account SID, Auth Token and number (or Messaging Service), register for A2P 10DLC, and point the number's incoming-message webhook at the URL shown on the settings page.
7. Payments: in Stripe turn on Connect (Express) and add checkout.session.completed and account.updated to your webhook. Contractors connect their own account from Contractor Hub → Settings → Get paid online.
8. WP-Cron sends follow-ups every 5 minutes. On low-traffic sites, set up a real cron job that calls wp-cron.php so follow-ups go out on time.

== Frequently Asked Questions ==

= Where are designs saved? =
In the visitor's own browser (IndexedDB) on that device. Clearing browser data deletes them.

= Does the camera work on every phone? =
The live camera needs the page to load over https. If the camera isn't available, it falls back
to the phone's photo picker.

== Changelog ==

= 2.7.1 =
* Four contractor plans: Starter ($59/mo), Professional ($129/mo, Most Popular), Business ($249/mo) and Pro+ ($499/mo); yearly = 10× monthly. Each plan has field employees (1 / 5 / 15 / 50), crews (1 / 2 / 5 / unlimited), monthly AI credits (50 / 200 / 750 / 2,500), storage (5 / 25 / 100 / 500 GB) and landscape plans per month (none / 3 / 15 / unlimited, fair use). The AI Quoter and Landscape Plan Generator start at Professional; work gallery at Business; featured placement at Pro+. Every name, price, allowance, feature and "what's included" line is editable in Settings → DreamScaper Plans.
* Monthly AI credits for contractors: free daily credits are used first, then the plan's monthly credits, then bought credit packs. Storage covers saved designs and Contractor Hub uploads; storage packs add on top.
* A gentler non-payment policy, counted from the first failed payment (every day editable): days 0–3 full access with a quiet banner ("Payment issue — no action required yet"); days 4–7 full access with a stronger reminder and the suspension date; days 8–10 everything still works except new AI work, new landscape plans, buying credits or storage, large uploads and automatic texts; days 11–13 read-only with the suspension date front and centre, hidden from new homeowners; day 14 "Suspended — Payment Required", never deleted. One email per stage (and a text for contractors who opt in to billing texts, never overnight), reminders after 7, 30 and 60 days, and a flag (not a deletion) after 90 days. Paying at any stage restores everything automatically; follow-ups that came due meanwhile wait for review instead of firing late.
* Homeowners can't start new requests or messages with a contractor whose account is read-only or suspended; proposals and invoices already sent keep working.
* Social links: Google Business Profile, Facebook, Instagram, Houzz, YouTube, Nextdoor, TikTok and LinkedIn, in that order, on every plan. Each link has its own on/off switch that applies everywhere at once — contractor page, Find a Contractor card (first three), proposals and invoices (now with a social footer). Tracking parameters are stripped, a link pasted in the wrong row says which row it belongs in, and there's a live preview and a Test button.
* Happy reviewers (4–5 stars) are offered a one-tap review on the contractor's Google Business Profile (or Facebook / Houzz). Unhappy ratings are never asked.
* Crew members can be grouped into crews; the crew screen shows employees and crews against the plan.

= 2.7.0 =
* Messages: one inbox for every conversation — homeowner ↔ contractor (attached to the project, with address, next appointment, quote and money owed beside it) and member ↔ member. Photos, read receipts, mute/archive, unread badge everywhere, email alerts (at most one per conversation every 15 minutes). Existing direct messages move over automatically.
* Request quotes: a guided, save-as-you-go brief (services, description with voice, property photos, design, budget, timing, site facts, priorities, contact) sent to as many contractors as the homeowner chooses, with a completeness score and a plain list of what's missing. Contractors add their own intake questions per service and can ask for missing details in one tap.
* Shared calendar: appointments appear on the contractor's Schedule and the homeowner's My Calendar at once; confirm / ask to reschedule; add-to-calendar files and private Google/Apple/Outlook feeds. Reminders follow the contractor's own schedule (any number, minutes/hours/days before, per channel, per appointment type); texts never go out overnight.
* Messages & alerts: every automatic customer message and every contractor alert is editable — on/off, channels, subject, email and text — with tap-to-insert details ({customer_first_name}, {job_name}, {appointment_date}…, fallbacks like {customer_first_name|there}), live preview and test send. Overdue-invoice nudges and review requests on the contractor's timing.
* Contractor social links and work gallery on the contractor page.
* Contractor plans: three tiers with limits and features set in Settings → DreamScaper Plans, Stripe Billing, one 30-day trial per business (verified email/phone, card on file, hashed trial ledger), past-due grace period, then pause — never delete. Read-only + export while paused; everything returns instantly on payment. Off until you switch it on.
* Every area explains itself: purpose line, "What can I do here?" panels, one-time tips, locked features that say which plan has them, and a Help page mapping the whole product.
* Fixes: email "Open your Contractor Hub" links no longer land on Home; the welcome tour no longer appears twice.

== Upgrade Notice ==

= 2.7.1 =
New four-tier pricing and a staged non-payment policy. If you saved plan settings in 2.7.0, open Settings → DreamScaper Plans, check the new prices and allowances, save, and click "Create these plans in Stripe" (or paste new price IDs) — the 2.7.0 plan settings are not carried over. In Stripe → Billing → Revenue recovery, set Smart Retries to 2 weeks, "mark the subscription as unpaid" when retries fail, and turn off Stripe's own failed-payment emails.

= 2.7.0 =
Back up first. New tables are created and existing direct messages are moved into the new inbox automatically. Contractor billing stays OFF until you turn it on in Settings → DreamScaper Plans — until then every approved contractor keeps full access.

= 2.6.0 =
* New: Object controls in the editor — move with the on-screen pad, arrow keys or by dragging (up/down moves farther away or closer on the ground), resize, rotate (buttons, slider, exact angle, [ and ] keys), flip either way, bring forward/send back, hide, lock, rename, opacity, brightness/contrast/saturation/warmth and shadow length, softness and direction.
* Duplicate and plant groups: a row or a natural cluster of any plant, spaced on the ground at its mature spread (or any spacing you choose).
* Auto blend matches a placed plant or feature to the photo around it — brightness, contrast, color, warmth and a ground shadow.
* Landscape shapes: planting beds, patios, lawn, walkways (with width), retaining walls (with height, block courses and cap) and edging (metal, plastic, stone, brick). Curved or straight edges, or drag a rectangle that follows the photo's perspective. Tap any shape to select it, drag it or its corners, resize it, change its material, edging, width or height, duplicate or delete it — with its size shown (≈ sq ft and length).
* Measure tool: distances, areas and heights on the photo, using the scale you set.
* Paint: soft or hard brush with opacity, eraser, and Restore photo to paint the original back. Mask tools: invert, expand, contract, feather, auto select and Smart fill with any material.
* Adjust photo: exposure, brightness, contrast, highlights, shadows, warmth, tint, saturation, vibrance, hue, greens (lawn & leaves), sharpen, reduce noise and blur, plus presets (Bright & fresh, Golden hour, Lush green, Overcast fix, Soft & airy) — non-destructive. Crop, rotate, straighten and perspective-correct a photo into a new view; everything you placed moves with it.
* Hold the eye button to peek at the original photo at any time.
* Layers: show/hide, lock, rename, duplicate, delete, reorder and opacity for every plant, feature and shape.
* Design versions: save, rename, duplicate, restore and delete versions of a design; compare any two side-by-side or with a before/after slider.
* Presentation mode: fullscreen before & after slideshow of your views, with Favorite, your project notes, download and share.
* Dreamscape AI tools: Ask DreamScaper (answers about your own yard), Give me ideas, Landscape analysis (what works, what to fix, sun and soil notes), Change style (Traditional, Modern, Contemporary, Natural, Cottage, Formal, Rustic, Low-maintenance, Native, Pollinator, Luxury), Variations, Generate similar, Keep / change (keep your trees, walkway, patio, fence or beds), and Explain this design.
* Inspiration Board: save pictures, plants, materials, styles and designs you love. AI Style Analysis finds what they have in common and Apply this style to my yard sends it to Dreamscape AI with your pictures as references.
* Request a consultation or ask a question from any design; it reaches the contractor's CRM as a lead with the design attached.
* Start a new Dreamscape from an original photo, a saved view, an existing design, your Inspiration Board or a new photo.
* Fix: the 2D Landscape Plan's styles covered the Dreamscape AI side panel (2.5.0). The plan now uses its own class.

= 2.5.0 =
* New: Contractor Hub — a CRM for landscapers built around the DESIGN → QUOTE engine. Any contractor can apply (My Account / home screen → For Contractors); you approve them under Settings → DreamScaper Contractors. You are always approved as your own business.
* Design → Plan → Takeoff → Estimate: turn any before & after Dreamscape into a measured 2D plan, an automatic quantity takeoff, and TWO quotes — an internal Job Cost sheet (materials, labor hours, equipment, subcontractors, disposal, delivery, overhead, gross profit and margin) and a customer Proposal with an exact scope of work that defines the contractor's responsibilities. Both are fully editable: every quantity, unit cost, line, section, price, wording, add-on, payment schedule and term.
* Quantities come from geometry, never from AI. Example: a 400 sq ft bed at 3" = 3.7 yd³ measured → 4 yd³ ordered, plus delivery, bed prep and 80 lf of edging. Rules for mulch, stone, new beds (turf removal, compost, disposal), edging, sod, seed, paver patios & walkways (excavation, base, sand, restraint, polymeric sand, compactor, saw), gravel paths, retaining walls (block, caps, base, drainage stone, pipe, fabric, geogrid), fences, grading, boulders, plants by size, landscape lighting and removals.
* Contractors set their own burdened labor rate, overhead, markups by cost type (or a target gross margin), sales tax (CT 6.35% on the whole job by default), deposit %, minimum job, rounding and how long quotes are good for — plus a full editable price book of supplier costs and production rates.
* 2D Landscape Plan: draw beds (curved or straight), lawn, patios, walkways with width, walls with height, edging, fences, plants, lights, boulders, features, house/structures/driveway/property line and notes on a to-scale Connecticut aerial, an uploaded survey (set the scale with one known length) or a blank grid. Type exact lengths (32' 6"), set rectangle sizes, snap to 6" and square corners. Mark anything existing, or existing + remove to price the removal. Dreamscapes import automatically — bird's-eye views to scale, photo views estimated with the camera model.
* AI Measure (Meta SAM 3): traces lawn, beds, patios, driveways, walkways, roofs and sheds on the aerial; the outlines become normal editable shapes measured with the same math. Slope check from USGS 3D Elevation data.
* AI wording: "Polish wording with AI" rewrites the scope in plain English. The model is told never to add work or change numbers, and the server rejects any section where a number changed.
* Send / Send for signature to any of the customer's contacts (spouse, tenant, property manager) by email or text, with the before & after picture, total and what's included. Customers open a mobile proposal page, tick optional add-ons, type their name, sign with a finger and agree to sign electronically; the signature, time, IP address, browser and a fingerprint of exactly what they signed are kept. Decline with a reason. You're told the moment they open it and when they sign.
* Follow-ups: a best-practice 6-touch plan is filled in for every quote (day 1 email, day 3 text, day 7 before & after, day 14 scheduling nudge, day 21 "want to adjust?", day 30 close-the-loop). Change the date, time, channel, who it goes to, the message and what's attached; add or remove steps; save your own default plan. Shortcodes like {customer_first_name}, {project_name}, {customer_address}, {quote_total}, {quote_link}, {valid_until} — tap to insert, with a warning for any code that has no value. Follow-ups stop automatically when the customer signs or declines.
* Customers: everything a service business tracks — contacts, stage (lead → prospect → customer → past/lost), lead source (website, phone, text, referral, social, contractor referral, DreamScaper), preferences, budget, timeline, access/gate code, pets, irrigation, hidden utilities, HOA, billing, tax exempt, maintenance plan, tags, notes and a property photo. Full communication history (emails, texts, calls, notes, views, signatures, payments).
* Property profiles: address, aerial imagery, measurements/plan, photos from the guided capture, slope, structures and notes.
* Lead intake: the [dreamscaper_quote] website form, homeowner quote requests from DreamScaper, inbound texts to your Twilio number (unknown numbers become leads), and leads you add from phone calls, referrals and social media.
* Jobs: signed quotes become jobs. Schedule visits, notify the customer, send crew sheets (address, map link, scope, notes) by email or text, and track job costing — actual materials, crew hours, equipment, subs and disposal against the estimate with variance and actual margin. Add finished photos and show the job on your public profile.
* Invoices: automatic deposit invoice on signing, progress and final invoices, and recurring (weekly / monthly / yearly) maintenance billing. Customers pay by card, Apple Pay or Google Pay through Stripe Connect — the money goes to the contractor's own Stripe account (optional platform fee in Settings). Mark cash/check payments paid.
* Homeowners: new "Find a Local Contractor" — search by town or ZIP and service, sort by distance, rating or Dream-to-Reality score; contractor profiles show license/insurance, ratings, reviews, and Dreamscapes they turned into real yards (before → design → finished). Request a quote with one of your Dreamscapes (plant list and measured beds go with it).
* Guided property capture: address → bird's-eye view → front → left side → right side → backyard → important structures → existing landscape. Every step says exactly where to stand and WHY the photo is needed.
* My Projects is the customer portal inside the homeowner's own account: quotes to review and sign, who they hired and their history of past hires, what the job includes, the schedule, invoices to pay, and reviews (overall stars + "how closely does the finished yard match your Dreamscape?" with a finished photo).
* Editor ⋯ menu: "Get a quote from a local contractor" and, for contractors, "Turn into a quote".
* Fix: messages outside the editor showed as browser pop-up alerts; they're now on-screen notices. Fix: the home-screen tour invitation could stay on top after you moved to another screen.

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

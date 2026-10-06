# MASTER BUILD PROMPT — DreamScaper 2.8

## Designer upgrades, flexible billing, service tags, the Route Planner, Property Measure, Contractor Verification, the Jobs Board, and contractor-only trust signals

---

# 0. WHO YOU ARE AND WHAT YOU ARE DOING

You are a senior WordPress plugin engineer, canvas/graphics engineer, routing and logistics engineer, payments engineer, identity-verification integrator, UX designer and privacy-compliance-minded product architect.

You are extending **DreamScaper 2.7.1** (David's Landscaping, getmylandscaped.com) — a working, production WordPress plugin. You are not starting over. Everything in the 2.7 master prompt (`docs/dreamscaper-2.7-master-prompt.md`) still applies: its engineering rules, its tier gating, its "every area explains itself" requirement, and its non-payment policy.

When you are finished, four things must be true:

1. **The designer feels like a real design tool**: shapes snap closed, loops are labelled and filled the way a contractor thinks, there are layers, the mouse wheel zooms, and many things can be moved at once.
2. **A contractor can run a route-based service business**: bill however their customers pay (per visit, monthly, annual plan paid monthly), plan the day's route around real constraints, and measure a property from the office.
3. **Homeowners and job-seekers can trust who they're dealing with**: verified contractors are clearly marked and filterable, and job listings come from real businesses.
4. **Contractors can protect each other — lawfully.** Shared signals are factual, tied to real jobs, and built to comply with Connecticut law (see Part H and Part I: these are not optional design choices).

---

# 1. THE CODEBASE — WHAT EXISTS IN 2.7.1 THAT YOU BUILD ON

Single WordPress plugin, no build step, plain PHP + native ES modules (`?v=X.Y.Z` on every import). Read the 2.7 master prompt §1 for the full file map and conventions. The parts this release touches:

| Area | Where it lives today | What's there |
|---|---|---|
| Designer tools rail | `assets/js/app.js` → `TOOLS`, `setTool()`, `renderPanel()` | 10 tools; labels shown as `label.split(' ')[0]` (this is what produces **"Beds,"**) |
| Designer engine | `assets/js/editor.js` (`Editor` class) | ground shapes (`view.ops`: `poly`, `path`, `wall`, `edge`, `brush`, `mask`), objects (`view.objects`), `bedPts` drawing, `finishBed()`, `_hitOp()`, `updateOp()`, `zoomBy(f, cx, cy)`, pinch zoom, undo stack (`_push`) |
| Shape / measure / adjust / layers panels | `assets/js/edtools.js` → `panelShapes`, `panelMeasure`, `panelAdjust`, `transformDialog`, `layersPanel` | crop & rotate is a section at the bottom of Adjust |
| AI tools in the regular designer | `assets/js/aitools.js` → `panelAI` | AI Erase, Smart Select, Make it real, Season & light, Plant ID |
| One-click AI tools (AI studio) | `assets/js/aitoolkit.js` (`SELECT`, `REMOVE`, `ADD`, prompt builders) used by `assets/js/dsai.js` | 17 Select, 20 Remove, 24 Add one-click tools |
| Invoices | `dscp_invoices` (`kind`, `recur` = weekly/monthly/yearly, `next_at`), `includes/crm-api.php`, cron in `includes/crm.php` | recurring copies on a schedule; Stripe Connect payouts in `crm-pay.php` |
| Services | `pros.services` (comma-wrapped string), `SERVICES` arrays in `crm.js` and `hire.js` (duplicated) | free-text match in Find a Contractor |
| Schedule | `dscp_visits` + `includes/calendar.php` (shared calendar, reminders, ICS) | start, end, crew, client, quote |
| Properties | `dscp_props` (`lat`, `lng`, `aerial`, `ppf`, `photos`, `plan`) + `assets/js/siteplan.js`, `takeoff.js` | to-scale CT aerial, measured 2D plans |
| Plans & gating | `includes/subs.php` (`dreamscaper_pro_gate`, `dreamscaper_pro_can`, `dreamscaper_pro_limit`, `dreamscaper_pro_costly_err`) | 4 tiers, staged non-payment policy |
| Maps | `dreamscaper_opt('maps_key')` (Google; Places API (New) autocomplete), OpenStreetMap fallback | |
| Stripe | `dreamscaper_stripe()` / `dreamscaper_stripe_x()`, webhook → `dreamscaper_stripe_event` | Checkout, Billing, Connect |

**Before writing any code, read the files above.** Reuse the helpers; never duplicate them.

---

# 2. NON-NEGOTIABLE RULES (in addition to the 2.7 rules)

1. **Additive and backwards compatible.** Every existing design, view, op, object, invoice and visit must open and behave exactly as before. New fields get defaults; old data without them means "the old behaviour".
2. **The server is the authority** for every permission, tier limit, verification badge, hiring visibility and trust flag. JavaScript locks are decoration.
3. **Privacy by design.** Driver's licences, selfies, EINs, résumés and trust flags are sensitive. Store the minimum, encrypt at rest where stored, never expose in public endpoints, log every access to trust data.
4. **Third parties behind an integration layer** (2.7 §C43): routing, gas prices, vehicle data, business registries and identity verification each sit behind one PHP adapter with a provider setting, so a provider can be swapped without touching features.
5. **Cost control.** Every paid API call (Google Routes / Route Optimization / Places, Stripe Identity) is cached where the terms allow, rate-limited with `dreamscaper_limit()`, counted against the plan, and blocked from the `restricted` non-payment stage onward via `dreamscaper_pro_costly_err()`.
6. **Explain itself** (2.7 §A4): every new area gets a purpose line, a "What can I do here?" panel, a teaching empty state and first-visit tips.
7. **Mobile first, gloves on.** Tap targets ≥ 44 px. The route planner and the measure wizard must work one-handed on a phone in a truck.
8. **Scrolling:** the page must never hijack the wheel. **The one exception is the design canvas and the map canvases**, where the wheel zooms the drawing — and only while the pointer is over the canvas.
9. **Version:** ship the designer upgrades as **2.7.2**, then **2.8.0** for the rest, bumping every `?v=` string each time.

---

# PART A — DESIGNER UPGRADES (ship as 2.7.2)

## A1. Tool labels

- The tools rail shows a short label under each icon. Today it is the first word of the long label, which renders **"Beds,"**. Give every tool an explicit short label (`Select`, `Plants`, `Paint`, `Beds`, `Measure`, `Adjust`, `Crop`, `Erase`, `AI`, `Scale`, `Pan`) and keep the long label for the tooltip and `aria-label`. No label may end in punctuation.

## A2. AI tools in the regular designer

- Tapping **AI** in the regular (non-AI) designer opens the AI panel with the **same one-click tools as the AI studio** at the top: **Select · Remove · Add** tabs driven by the shared `SELECT`, `REMOVE`, `ADD` lists in `aitoolkit.js` (single source of truth — never copy the lists).
  - **Select X** (free): Smart Select finds it (SAM 3) and makes it the current selection; the selection box then offers that item's replacement ideas as chips, a material fill, Erase and Replace.
  - **Remove X** (1 credit): finds it, removes it with the shared `removePrompt`, pastes back only inside the found area, undoable.
  - **Add X** (1 credit): if an area is selected/painted, adds it there (outlined approach, pasted back only inside); otherwise lets the AI place it naturally. Idea chips per item.
- The existing tools (AI Erase, Smart Select by words, Make it real, Season & light, Plant ID) stay below, collapsed under clear headings.
- Credits, sign-in and the 2.7.1 restricted-stage rules apply exactly as in the studio.

## A3. Beds: closed loops, labels and a Fill tool

Drawing beds, patios and lawn areas must work the way every polygon tool in good design software works (Figma pen tool, Google Maps "measure area", Go iLawn):

1. **A big, labelled start point.** The first tap places a large start marker (≥ 32 px on screen at any zoom) labelled **"Start — tap here to close"**. It pulses gently (respecting `prefers-reduced-motion`).
2. **Magnetic closing.** When the pointer comes within a generous radius (≈ 24 screen px; larger on touch) of the start point after 3+ points, the preview line snaps to it, the marker turns solid and shows **"Close loop"**. Tapping it closes the shape. Double-click / double-tap and the **Close loop** button still work.
3. **Step back and clear.** While drawing: **Back 1 point** (also `Backspace`), **Clear** (discards the shape in progress), and a live point count. Undo after closing removes the whole loop.
4. **Every closed loop gets a label** — "Bed 1", "Bed 2", "Patio 1", "Lawn 1" — drawn on the canvas at the shape's visual centre in a readable pill, renameable, and listed in the panel with its area (≈ sq ft on photos, exact on bird's-eye views).
5. **Draw now, fill later.** Loops can be drawn as **outline only** ("Draw outlines first, choose materials later" switch, on by default for beds) or filled immediately with the chosen material (today's behaviour).
6. **Fill tool.** A **Fill** mode in the Beds panel (paint-bucket cursor):
   - **Fill all** loops on this view with one material in one tap, or
   - pick a material and **tap any loop** to fill just that loop, or
   - use the per-loop material picker in the loop list (Bed 1 → black mulch, Bed 2 → river rock).
   Every fill is one undo step. Filling never moves or reshapes the loop.
7. Lines (walkways, walls, edging) keep their current open-path behaviour; the start marker shows "Start" but no close affordance.

## A4. Layers

- The Layers window gains real, user-created layers ("Existing plants", "Phase 1", "Lighting", "Option B"…):
  - **+ Add a layer**, rename, delete (its items move to the layer below — nothing is ever silently deleted), reorder, show/hide, lock.
  - One **active layer**: new plants, shapes and paint go into it (shown in the top bar: "Drawing on: Phase 1").
  - Items can be moved to another layer from the inspector or the Layers window.
  - Upper layers draw above lower layers (ground shapes and objects); within a layer, plants keep their natural depth order.
  - Hidden layers are excluded from rendering, hit-testing, exports and takeoffs; locked layers can't be selected or changed.
- Storage: `view.layers = [{ id, name, hidden, lock }]`; items carry `layer` (missing = the base layer). Old designs open with one layer, "Layer 1".

## A5. Mouse-wheel zoom

- Over the design canvas, the wheel zooms **around the pointer** (smooth, exponential, clamped to the existing zoom range). `Ctrl/⌘ + wheel` and trackpad pinch zoom the same way. The page itself never scrolls while the pointer is over the canvas; everywhere else the wheel behaves normally.

## A6. Select many: drag a box

- With the **Select** tool, a mouse/pen drag that starts on empty canvas draws a **selection box**. Everything it touches (plants, features, beds, patios, walks, walls, edging; not locked or hidden) is selected. `Shift`-click adds/removes items. Touch: one-finger drag on empty canvas still pans; a **"Select many"** toggle in the Select panel switches one-finger drag to box-select.
- With 2+ items selected: drag any of them to **move them all together** (one undo step), arrow keys nudge them all, `Delete` removes them all (one undo step), **Duplicate** copies them all, and the panel shows "N items selected" with Move to layer, Duplicate, Delete and Clear selection.

## A7. Crop & rotate is its own tool

- Remove the "Crop, rotate & perspective" section from the bottom of Adjust. Add **Crop** as a main tool directly **below Adjust** in the tools rail (shortcut `C`). Selecting it shows a short panel (what it does: "makes a new view, your original stays") and opens the existing crop/rotate/straighten/perspective dialog.

---

# PART B — FLEXIBLE BILLING AND RECURRING SERVICES

Contractors get paid in many ways. Build one **Billing Plan** concept that covers them all, on top of the existing `dscp_invoices` chain (extend it, don't fork it).

## B1. Ways to bill

| Method | Example | How it's generated |
|---|---|---|
| One-off invoice | Patio install | today's flow |
| Deposit → progress → final | Large projects | today's flow, auto from proposal payment schedule |
| **Per visit** | Weekly mowing billed after each cut | an invoice line is added when a visit is marked **Done**; invoiced immediately or batched (weekly / monthly statement) |
| **Fixed recurring** | $180/month maintenance | invoice on a schedule (weekly, every 2 weeks, monthly, quarterly, yearly, custom day of month) |
| **Annual plan paid in instalments** | $1,800/year lawn programme billed $150 × 12 | contract total, number of instalments, start date; each instalment is an invoice; the contract shows paid/remaining |
| **Seasonal** | Snow plowing Nov–Mar, per push or per season | active months; outside them nothing is billed |
| **Prepaid / pay in advance** | Pay the season up front with a discount | one invoice, then visits draw it down |
| **Usage-based** | Per-push snow, per-yard mulch | quantity from the visit record × rate |

## B2. Billing Plans

- New table **`dscp_billplans`**: `id, pro_id, client_id, prop_id, quote_id, name, method, amount, currency, interval, interval_n, day_of_month, instalments, instalments_paid, contract_total, season_start, season_end, per_visit_rate, batch (none|weekly|monthly), autopay (0/1), stripe_customer, stripe_pm, status (active|paused|ended), next_at, ends_at, created, updated`. Index `(pro_id, status, next_at)`.
- Created from: a signed proposal ("Make this a recurring service"), the customer page, or a recurring visit series on the calendar (A3b in 2.7). Recurring visits and their Billing Plan stay linked: skip a visit → no per-visit charge; cancel the series → the plan asks whether to end too.
- **Autopay (opt-in by the customer).** The customer saves a card or bank account (Stripe Connect, `SetupIntent` on the connected account) from the invoice page or portal; each invoice is charged automatically on its date, with a receipt. The customer can turn autopay off in My Projects at any time. Failed autopay → the invoice stays open, the customer is told kindly, the contractor is alerted.
- **Customer-facing clarity:** the portal shows each plan — what it covers, how much, how often, next charge date, payments so far, and how to cancel or contact the contractor. Every amount the customer is charged was shown to them first.
- Cron (`dreamscaper_crm_tick`) generates due invoices, batches per-visit charges, runs autopay, and respects the 2.7 non-payment stages (a contractor's own suspension pauses generation; nothing fires backdated on restore).
- Templates (2.7 §A3c) get: *upcoming charge*, *autopay receipt*, *autopay failed*, *plan ending soon*.
- Reporting: monthly recurring revenue, plans ending in 30 days (renewal prompts for the retention engine), unpaid per-visit balances.

---

# PART C — SERVICE CATEGORIES AND TAGS

- **One master catalogue** of service categories (PHP, filterable, editable by the site owner in Settings): Landscape design, Planting, Mulch & stone, Lawn installation, Lawn care & mowing, Fertilisation & weed control, Patios & walkways, Retaining walls, Landscape lighting, Fencing, Drainage & grading, Irrigation, Tree work, Snow removal, Spring/fall clean-ups, Hardscape repair, Masonry, Other. Remove the duplicated `SERVICES` arrays in `crm.js` and `hire.js`; both read the catalogue from the session.
- **Sign-up:** the contractor application asks "What services do you offer?" (multi-select chips, at least one) — required.
- **Backend:** Hub → Settings → Business profile → Services: add/remove any time; changes are live immediately.
- **Storage:** new table `dscp_pro_services (pro_id, service, created)` with an index on `service`, kept in sync with the legacy `pros.services` string for backwards compatibility. Searching by service is an indexed join, not a `LIKE`.
- **Where tags are used:** Find a Contractor filter and search; contractor cards and profile; the Project Request wizard ("contractors who offer every service you picked"); the Jobs Board (Part G) — job-seekers filter employers by service type; the Capability Map.

---

# PART D — ADVANCED ROUTE PLANNER

A day planner that answers: *what order should we go in, when do we stop for lunch and fuel, and what will today cost?* It is a decision aid: the contractor always sees **why** and can override anything.

## D1. Inputs

**Stops** (required):
- **Pull from my calendar** for a chosen date and crew: every visit with an address, its expected duration (visit `end − start`), and time windows. Missing durations are flagged for input.
- **Or add manually:** address (autocomplete — Google Places (New) when a key is set, OpenStreetMap otherwise), expected duration, optional time window ("must be there 9–11"), and priority.
- Start and end location (default: the business address; "end at home" option).

**Optional questions** (a short guided step, every one skippable, remembered as defaults):
1. **Vehicle and fuel.** Vehicle picker: Year → Make → Model → Option from the free **FuelEconomy.gov web services** (US DOE/EPA; `/ws/rest/vehicle/menu/year|make|model|options`, then `/ws/rest/vehicle/{id}` for city/highway/combined MPG). Store the contractor's vehicles (`dscp_vehicles: id, pro_id, name, year, make, model, epa_id, mpg_city, mpg_hwy, mpg_comb, tank_gal, fuel_type, towing_factor`) so they're picked once. Allow manual MPG and tank size (work trucks, diesel, trailers — a **towing/load factor** reduces MPG, default −20% when "towing a trailer" is ticked). **Fuel in tank:** ⅛ · ¼ · ½ · ¾ · Full.
2. **Crew.** Crew size and the **total hourly wage of the whole crew** (or pick crew members and use their saved rates).
3. **Lunch.** Approximate lunch time and length (e.g. 12:00, 30 min).
4. ☐ **Be close to restaurants at lunch** — places the lunch break where the route is nearest a cluster of quick-service restaurants (Places Nearby Search: `fast_food_restaurant`, `sandwich_shop`, `restaurant`, open at that time), so the crew doesn't detour.
5. ☐ **Be near ___ at ___** — one or more "must be at this address at this time" anchors (meet another crew, pick up a part). The anchor becomes a timed stop with a short dwell.

## D2. Optimisation

- **Objective: minimise total cost of the day** = driving cost (miles × fuel price ÷ MPG) + crew time on the clock (minutes × crew wage) — subject to time windows, anchors, lunch and the day's working hours. Distance alone is reported too.
- **Engine (behind the adapter):**
  - Default: **Google Route Optimization API** (`optimizeTours`) — supports time windows, visit durations, break rules (lunch) and cost per hour / per km per vehicle, which maps directly onto the objective above.
  - Fallback for small days or no key: build a time/distance matrix (Google Routes `computeRouteMatrix`, or OSRM if the owner hosts one) and solve in PHP (nearest-neighbour + 2-opt with time-window checks; exact for ≤ 8 stops).
  - The adapter returns ordered stops, ETAs, leg miles/minutes, and an explanation.
- **Lunch:** modelled as a break in a window around the requested time; with the restaurants option, the break is placed at the stop nearest a restaurant cluster within ±45 min of the requested time.

## D3. Fuel stops

1. Starting fuel = tank size × fraction selected. Each leg consumes miles ÷ effective MPG.
2. If fuel would fall below a safety reserve (default 15% of tank, editable) at any point, a fuel stop is needed before that leg.
3. Candidate stations: Places (New) search for `gas_station` along/near the route segment where fuel is needed; read **`fuelOptions.fuelPrices`** (last known price per fuel type). Where no price is available, use the regional average (FuelEconomy.gov / EIA weekly) and label it "estimated".
4. For each candidate compute **total stop cost** = (gallons to fill × price) + (detour miles × fuel cost per mile) + (detour + fuelling minutes × crew wage per minute).
5. Show the **3 best options**, each with: price per gallon, detour (miles and minutes), total stop cost, and a plain-English reason — e.g. *"Mobil on Main St is 6¢ more per gallon than the Sunoco, but it's on your route; the Sunoco's 4-mile detour costs $9.80 in crew time, so Mobil saves $7.40 overall."*
6. Always say what the recommendation is for: **"These options minimise your total cost for the day — fuel price, extra miles, and your crew's paid time."**

## D4. Output

- Map with numbered stops, lunch and fuel markers; an ordered timeline ("8:00 Farmington → 9:30 Avon → 11:00 West Hartford → 12:00 Lunch (near 4 restaurants) → 1:30 Fuel: Mobil → 2:00 Farmington").
- Totals: miles, drive time, fuel used and cost, crew cost, **savings vs. the calendar order**.
- Actions: **Apply to calendar** (re-times and reorders the visits, re-sends reminders through the 2.7 reminder engine), **Send to crew** (text/email with Google/Apple Maps links per stop), **Start navigation**, **Re-plan from here** (mid-day changes).
- Every number marked as an estimate. Never promise a customer an arrival time without the contractor's rules (2.7 §C24).
- **Tier:** Route Optimizer is Professional+ (advanced options — fuel optimisation, anchors, multi-crew — Business+), per 2.7.1 Plans; API calls count as costly actions.

---

# PART E — PROPERTY MEASURE WIZARD

A guided tool for measuring lawn, beds, roof, driveway or any area from aerial imagery — the job Go iLawn, RealGreen Measurement Assistant and LawnPro's AI measure do — inside DreamScaper and wired to the customer record.

## E1. Entry points

- **Hub → Measure a property** (address with autocomplete).
- **Calendar:** "📐 Measure property" on any future visit (address and customer pre-filled).
- **Customer page:** "📐 Measure property" on the customer and on each of their properties.

## E2. The wizard

1. **Find the property** — address autocomplete; confirm the pin.
2. **Aerial view** — the best available top-down imagery: Google Maps satellite (Maps JavaScript API, when a key is set) or the existing to-scale CT aerial used by `siteplan.js`. Show a scale bar. Imagery date shown when known.
3. **Outline an area** — tap around the edge. The **first point is large and labelled "Start"**; tapping it again closes the loop (same component as A3 — build it once, use it in both). Back 1 point · Clear · Close loop.
4. **Name it** — preset names (Front lawn, Back lawn, Beds, Driveway, Roof, Patio) or custom. Area shown immediately (sq ft, plus acres when large; perimeter in linear ft for edging).
5. **More areas or finish** — "Measure another area" keeps a running list and **total square footage** (per category and overall: e.g. lawn total 9,850 sq ft); subtract areas ("exclude the pool") supported.
6. **Save to a customer** —
   - came from a customer or visit → pre-filled, one tap to save;
   - otherwise → **Add to existing customer** (search) or **Create a new customer** (address and measurements pre-filled).
7. **Saved record** — a `measurements` entry on the property (`dscp_props.data.measurements[]`): name, category, polygon (lat/lng), area, perimeter, imagery source and date, who measured, when — plus a **screenshot** of the outlined map stored with `dreamscaper_crm_store_image()`. Shown on the customer page under **Measurements**, reusable in estimates (a lawn-care estimate can price per 1,000 sq ft directly from it) and in the site plan.

## E3. Accuracy

- Areas are computed on the ellipsoid (geodesic polygon area) from lat/lng — not from screen pixels — so they're correct at any zoom.
- Label every number **AI/aerial estimate — not a survey** (2.7 §C39) unless the contractor marks it **Contractor-verified** after a site visit.
- Optional later: AI-assisted outlining of lawn/roof/driveway (SAM 3 on the aerial, as AI Measure already does in the site plan), always editable.

---

# PART F — CONTRACTOR VERIFICATION

Verification is **optional to use DreamScaper** and **required to appear in the Verified list**. It earns a ✓ **Verified** badge that homeowners can filter on (and they can also filter to *Unverified* — the filter is neutral).

## F1. What "Verified" means — say it precisely

The badge means: **the business is registered and active with the State of Connecticut, its trade credential (where one applies) is active, and the person who verified is who they say they are and is connected to the business.** The badge's info panel lists exactly which checks passed and when. Never imply insurance or quality unless separately checked.

## F2. Step 1 — business details

Collect: legal business name, DBA, business type (LLC, corporation, sole proprietor…), owner's name, EIN (optional for sole proprietors who don’t have one), business address, phone, website, email, CT credential numbers (e.g. **HIC** home improvement contractor registration, pesticide applicator licence, arborist licence) and Google Business Profile link (from 2.7.1 socials).

## F3. Step 2 — automated business checks

Run behind a `dreamscaper_verify_*` adapter, results stored with evidence links:

1. **Business registration (CT Secretary of the State).** Query the official **Connecticut Open Data portal (data.ct.gov, Socrata API)** business registry dataset for the name / registration number: status must be **Active**; address and principals compared. (The `service.ct.gov/business/s/onlinebusinesssearch` page is the human-facing version of the same records — link to it as evidence; do not scrape it.)
2. **Trade credentials (CT Department of Consumer Protection).** Query the DCP licences and credentials dataset on data.ct.gov for the HIC (and other) credential numbers: status **Active**, not expired, name matches.
3. **Online presence.** Google Places (New) text search for the business name + town: a matching Google Business Profile (name, address/phone match) adds confidence; links to the 2.7.1 social GBP link are cross-checked.
4. **EIN.** There is no public API to confirm an EIN belongs to a business. Collect it (encrypted), match the business name format, and treat it as **self-attested**; optionally the site owner can enable IRS TIN Matching (requires the owner's IRS e-Services enrolment) later. Do not claim an EIN was "verified" unless TIN Matching actually ran.
5. Any mismatch → **Needs review** (site-owner queue), never an automatic rejection.

## F4. Step 3 — identity (Stripe Identity)

- Use **Stripe Identity** (`VerificationSession` with `type: document`, `require_matching_selfie: true`, `require_live_capture: true`): front and back of a driver's licence or other government ID, then a guided live selfie that Stripe compares to the ID photo (liveness + face match). About **$1.50 per verification** (first 50 free) — the site owner chooses whether the platform or the contractor pays.
- DreamScaper stores **only** the session id, status, verified name, date of birth year (optional), document type and expiry — **never** the ID images or face data (Stripe holds them under its retention settings). Webhook: `identity.verification_session.verified` / `requires_input`.
- The verified ID name must match the owner/principal on the CT business record (fuzzy match; mismatch → Needs review).
- Explicit consent screen before capture: what's collected, why, who processes it (Stripe), how long it's kept, how to delete it — Connecticut's Data Privacy Act treats biometric data as sensitive data requiring consent.

## F5. Badge lifecycle

- **Verified** when F3 business checks and F4 identity pass. Shown on the contractor card, profile, proposals and Jobs Board listings with "Verified on {date}".
- **Re-checks:** business and credential status re-queried monthly (cron); credential expiry dates tracked; if something lapses, the badge is removed and the contractor is told what to fix (no public shaming — the badge simply disappears).
- Tables: `dscp_verifications (id, pro_id, step, status, provider, evidence (JSON), checked_at, expires_at, reviewer, note)`.
- Find a Contractor filters: **Verified only** · **Unverified only** · **All**.

---

# PART G — JOBS BOARD (HIRING)

## G1. Contractors

- Hub → **Hiring**: toggle **"We're hiring"** (adds a "Hiring" tag and lists the business on the Jobs Board while it has open postings).
- **Job postings:** title, service category (Part C), employment type (full-time, part-time, seasonal, year-round, temporary), pay (hourly or salary, range), location/towns, start date, hours, requirements (driver's licence, CDL, pesticide licence, lift 50 lb), description, how many openings, application questions (reuse the 2.7 intake-question editor). Status: draft / open / paused / filled.
- **Applicant tracking:** per posting — new, reviewing, interview, offered, hired, not selected; notes; message the applicant through the 2.7 inbox (a `job` thread kind); schedule an interview on the calendar.
- Hiring is gated by plan employee seats (2.7.1): hiring someone into the crew list respects the seat limit.

## G2. Job-seekers

- Must **sign up** (DreamScaper member account with a job-seeker profile: name, contact, towns, availability, experience, certifications).
- **Résumé upload** (PDF/DOCX, ≤ 5 MB, stored privately — not in a public uploads path; served through an authenticated endpoint). A résumé is visible **only** to the people at businesses the applicant applied to, and only for that application; the applicant can withdraw an application (the business loses access) or delete the résumé.
- **Browse & search:** keyword search on job title; filters for employment type (full-time, part-time, seasonal, year-round), pay range, service category, distance from a town/ZIP, verified employer only, posted date.
- **My applications** (Account → Jobs): every job applied to, its status, messages, and withdraw.
- Fair-chance: application forms must not ask about criminal history (Connecticut's "ban the box" law applies to all employers); questions about age, disability, religion etc. are blocked by the question editor. Show the contractor a short notice about this.

---

# PART H — CONTRACTOR-ONLY CUSTOMER FLAGS (decided: factual flags)

**Decision recorded:** shared, contractor-only, **factual** flags tied to real jobs — not opinions, scores or free-text notes. This keeps the feature useful while staying on the right side of Connecticut's Data Privacy Act (consumers' right to access their personal data) and defamation law.

## H1. What can be flagged

Only verifiable events tied to a real job/invoice in DreamScaper, each with its date:

| Flag | Evidence required |
|---|---|
| Invoice unpaid > 60 days | a DreamScaper invoice in `sent` status past due |
| Paid late (> 30 days past due) | invoice `paid_at` vs `due` |
| Cancelled within 24 h of a booked visit | visit record with cancellation time |
| No-show / no access at a booked visit | visit record marked "no access" with a photo or note |
| Payment reversed / chargeback | Stripe dispute event |
| Signed proposal then cancelled after materials ordered | signed quote + cancellation |

Many flags are created **automatically** from these records (with the contractor's confirmation); the contractor can add one manually only by selecting the job/invoice it relates to. No free-text opinions are shared; the contractor's own private notes stay private to their account.

## H2. Who sees what

- **Only approved, verified contractors** see flags, and only for a customer they are actually dealing with (an incoming request, a lead or a client in their CRM) — never a browsable list. Shown as a compact panel on the request/customer: "2 flags in the last 24 months: 1 unpaid invoice (Mar 2026), 1 late cancellation (Jun 2026)".
- Flags expire after **24 months**. A paid-up invoice clears its "unpaid" flag automatically.
- **Points:** contractors earn points for confirming accurate flags and for closing them out (marking an invoice paid, etc.) — never for volume.
- Every view of a flag is logged (who, when, which customer).

## H3. Discretion, honesty and the law

- The feature is **not advertised to customers**, and contractors are told it's confidential. Before first use a contractor must accept terms: share nothing from this panel with customers or the public; use it only to decide how to approach a job (deposits, prepayment), never to harass; **misuse, false flags or disclosure is grounds for suspension or termination** of the contractor account.
- **It is not secret from the law:** the privacy policy discloses that contractors may record factual payment and scheduling events about their customers and share them with other contractors on the platform; a customer who requests their data (CTDPA access request) receives their flags, and can **dispute** one — a disputed flag is hidden while the site owner reviews it.
- Never shown in any public endpoint, never exported, never used to rank homeowners publicly.
- **Get a Connecticut attorney to review the terms, the privacy-policy wording and the dispute process before launch.**

---

# PART I — EMPLOYEE NOTES AND CONSENTED REFERENCES (decided: both)

**Why it's built this way:** Connecticut General Statutes **§ 31-51** makes it a crime to blacklist an employee or publish their name to prevent them getting work, and restricts employers from keeping or subscribing to services that hold information about a person's character or actions that could affect their employment — with an exception for a **truthful statement of facts**. A secret shared employee score would also likely be a "consumer report" under the federal **FCRA**. So:

## I1. Private employee notes (each contractor only)

- On every applicant and employee record: private ratings (reliability, punctuality, quality, safety, teamwork — 1–5) and private notes. **Never visible to any other contractor**, never in any public endpoint, exportable only by that contractor.
- Prompted, not secret: after an employee's first day and at the end of a season the contractor is reminded to record a short private review — it improves *their own* rehire decisions.

## I2. Consented references (shared, with the worker's knowledge)

- When a job-seeker applies, they can **choose** to share their DreamScaper work history as a reference. Clear consent screen; they can withdraw it any time.
- A reference contains **only facts** recorded by previous DreamScaper employers: employer, dates worked, role, **eligible for rehire (yes / no / not stated)**, and optionally a short factual statement the employer confirms is truthful. No scores, no opinions about character, **no criminal-record or health information**.
- The worker can **see** every reference about them (Account → Jobs → My references) and **dispute** one; a disputed reference is hidden while the site owner reviews it.
- Only verified contractors who received that worker's application can read the reference, and only for that application.
- **Get a Connecticut employment attorney to review this before launch** (FCRA disclosure/consent wording, adverse-action process, § 31-51 truthful-statement scope).

---

# PART J — HOW TO BUILD IT

## J1. Phases

| Phase | Ships | Contains |
|---|---|---|
| 1 | **2.7.2** | Part A designer upgrades |
| 2 | 2.8.0-beta1 | Part C service tags (needed by G and filters); Part B billing plans + autopay |
| 3 | 2.8.0-beta2 | Part E Property Measure wizard (shared loop component from A3) |
| 4 | 2.8.0-beta3 | Part D Route Planner (adapters: routing, places/fuel, vehicles) |
| 5 | 2.8.0-beta4 | Part F verification (data.ct.gov adapters, Stripe Identity) |
| 6 | 2.8.0-rc | Part G Jobs Board; Part I notes + consented references; Part H factual flags — **after legal review** |

## J2. Acceptance tests (state the expected result for each)

**Designer**
1. The tools rail shows "Beds" (no comma) and every label is punctuation-free.
2. Tapping AI shows Select / Remove / Add one-click tools; Remove "trash cans" removes only the cans and is one undo step.
3. Drawing a bed: the start marker is large and labelled; moving near it snaps; tapping it closes; the loop is labelled "Bed 1"; Back 1 point and Clear work; Fill all fills every loop; filling Bed 1 and Bed 2 with different materials works; each fill is one undo.
4. Add a layer, draw on it, hide it (it disappears from canvas, export and takeoff), lock it (can't select), delete it (items move down, nothing lost). A 2.7.1 design opens with one layer and looks identical.
5. Wheel over the canvas zooms around the cursor; wheel elsewhere scrolls the page.
6. Box-select three plants and a bed, drag one, all four move; one undo restores all; Delete removes all; one undo restores all.
7. Crop is a tool below Adjust; Adjust no longer contains crop.

**Billing** — 8. A per-visit plan bills after each visit marked Done; a 12-instalment annual plan generates 12 invoices and stops; autopay charges, emails a receipt, and a failed charge leaves the invoice open with a kind notice.

**Services** — 9. Services chosen at sign-up appear on the profile; removing one removes it from search results immediately; search by service uses the index.

**Route planner** — 10. Pulling a day from the calendar keeps durations and windows; the optimised order respects windows and anchors; lunch lands within the window; with ¼ tank and a 9-mile-per-gallon truck a fuel stop is inserted before fuel drops under the reserve; three station options are shown with reasons and total-cost maths that adds up; Apply to calendar re-times visits and reminders.

**Measure** — 11. Measuring two lawn areas totals correctly (geodesic); saving from a calendar visit attaches screenshot, name, areas and total to that customer's property; starting from scratch can create a new customer.

**Verification** — 12. An active CT business + active HIC + passed Stripe Identity → Verified badge; an inactive registration → Needs review, no badge; filters Verified / Unverified work; no ID image is stored by DreamScaper.

**Jobs** — 13. A résumé is downloadable only by the businesses applied to; withdrawing removes access; filters work; criminal-history questions can't be added.

**Trust** — 14. Flags only appear for customers the contractor is dealing with; every view is logged; a customer data request includes their flags; a disputed flag is hidden. 15. Employee notes are never visible to another contractor; a reference is visible to the worker and disputable, and only shared with consent.

## J3. Deliver with the code

Complete files, a changed-files list, migrations, new settings and where they appear, the provider setup steps (Google Maps Platform APIs to enable: Maps JavaScript, Places (New), Routes, Route Optimization; Stripe Identity activation and webhook events; data.ct.gov dataset ids), `readme.txt` notes, and a plain-English summary for the sales page.

## J4. Open questions (ask before building those phases)

1. Who pays for Stripe Identity checks — the platform or the contractor?
2. Should verification require a CT credential (HIC etc.) or only an active business registration for trades that don't need one?
3. Billing plans: should autopay support bank (ACH) as well as card?
4. Route planner: business hours default, and whether to allow multi-crew optimisation in one run (Business+).
5. Flags and references: attorney review completed? (Phase 6 does not ship until yes.)
6. Jobs board: is it open to all job-seekers statewide, and should postings be free on every plan or limited per tier?

---

**References used for this spec:** [FuelEconomy.gov web services](https://fueleconomy.gov/feg/ws) · [Google Route Optimization API reference](https://developers.google.com/maps/documentation/route-optimization/reference/rpc/google.maps.routeoptimization.v1) · [Google Places FuelOptions](https://googleapis.dev/dotnet/Google.Maps.Places.V1/latest/api/Google.Maps.Places.V1.FuelOptions.html) · [Stripe Identity](https://www.stripe.com/identity) · [CT Gen. Stat. § 31-51 (FindLaw)](https://codes.findlaw.com/ct/title-31-labor/ct-gen-st-sect-31-51/) · [Nolo: state blacklisting laws](https://nolo.com/legal-encyclopedia/free-books/employee-rights-book/chapter10-9.html) · [Jobber route optimization](https://www.getjobber.com/features/route-optimization/) · [RealGreen Measurement Assistant](https://www.realgreen.com/measurement_assistant.html) · [Go iLawn](https://www.landscapemanagement.net/go-ilawn/)

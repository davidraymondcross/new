# MASTER BUILD PROMPT — DreamScaper 2.7

## Social Layer, Guided Contractor Outreach, Paid Contractor Tiers, and the Contractor Business Operating System

---

# 0. WHO YOU ARE AND WHAT YOU ARE DOING

You are a senior product architect, WordPress plugin engineer, SaaS/billing engineer, UX designer, accounting-system architect, workflow automation specialist, CRM strategist, field-service software expert, and AI systems architect.

You are extending an existing, working, production WordPress plugin called **DreamScaper** (currently version **2.6.0**, by David's Landscaping, getmylandscaped.com). You are NOT starting a new project and you are NOT rewriting what already works.

Your job is to take DreamScaper from "a yard design studio with a contractor CRM bolted on" to:

> **A social design community where homeowners dream, a marketplace where they hire, and a complete business operating system that the contractor pays a monthly subscription to run their entire company on.**

Three things must be true when you are finished:

1. **Homeowners** can design a yard, share it, talk to other members, find a contractor, and hire one through a guided conversation that asks everything up front — so the contractor almost never has to come back with follow-up questions.
2. **Contractors** can run their whole business inside DreamScaper — leads, properties, designs, estimates, proposals, scheduling, crews, jobs, invoices, payments, accounting, tax data, marketing and reporting — and they pay monthly for it on one of four tiers (Starter $59 · Professional $129 · Business $249 · Pro+ $499), after a 30-day trial that cannot be abused — and a missed payment steps down gently instead of locking them out.
3. **Every area of the app explains itself.** A user who has never seen the screen before knows, within five seconds, what this section is for, what they can do here, and what happens next.

---

# 1. THE EXISTING CODEBASE — READ THIS BEFORE YOU WRITE ANYTHING

DreamScaper 2.6.0 is a single WordPress plugin. No build step. No bundler. No framework. Plain PHP on the server, native ES modules in the browser.

## 1.1 File map

```
dreamscaper/
  dreamscaper.php            main plugin file, settings, shortcodes, core REST
  readme.txt
  includes/
    accounts.php             customer accounts (email, Google, Facebook), REST routes
    cloud.php                cloud storage of designs, storage quota
    ai.php                   Dreamscape AI (FLUX.2 klein via BFL / fal), credits
    ai-tools.php             AI Erase, Smart Select, Make it real, Season & light
    billing.php              Stripe one-time Checkout: AI credit packs, storage packs
    community.php            community DB schema + helpers (posts, likes, follows,
                             friends, messages, notes, points, reports)
    community-api.php        community REST API, routes under /c/
    community-admin.php      community moderation screens
    crm.php                  CRM schema + shared helpers, SMS, mail, cron tick
    crm-api.php              contractor-side REST API, routes under /crm/
    crm-portal.php           homeowner side: find a pro, request a quote, My Projects
    crm-public.php           tokenised public proposal + invoice pages, Twilio inbound
    crm-pay.php              Stripe Connect for contractor payouts
    crm-admin.php            admin: approve contractor applications
  assets/
    css/dreamscaper.css      all styling, one file
    js/*.js                  ~60 ES modules, imported with ?v=2.6.0 cache-busting
    img/, materials/, photos/
```

Key JS modules you will touch: `app.js` (shell/router), `api.js` (session + fetch), `community.js` (feed, profiles, messages UI), `hire.js` (find a contractor, request a quote, My Projects), `crm.js` (contractor hub), `account.js`, `util.js` (h/put/icon helpers), `capture.js` (camera, modal, aerial), `guide.js` and `tour.js` (onboarding help).

## 1.2 Database — what already exists

All tables are prefixed `{$wpdb->prefix}dscp_` and created by `dreamscaper_t( $name )` + `dbDelta`. Two schema version constants gate migrations: `DREAMSCAPER_DB` (community, in `community.php`) and `DREAMSCAPER_CRM_DB` (CRM, in `crm.php`).

**Community tables** (`community.php`):

| Table | Purpose |
|---|---|
| `posts` | community posts: kind, title, body, tags, image, thumb, before_img, meta, status, likes, rating_sum, rating_n, comments, views, reports |
| `comments` | threaded comments on posts (parent_id) |
| `likes` | user_id + kind + target |
| `ratings` | stars per user per post |
| `follows` | follower / followee |
| `friends` | a / b / status (pending, accepted) |
| `messages` | **id, from_id, to_id, body, created, read_at** — 1:1 DM only, no threads, no attachments, no context |
| `notes` | in-app notifications: user_id, type, actor, target, text, created, read_at |
| `points` | gamification ledger |
| `reports` | abuse reports |

**CRM tables** (`crm.php`):

| Table | Purpose |
|---|---|
| `pros` | contractor record keyed by `user_id`. **status** (pending/approved), business, contact, phone, email, website, license, insured, years, address, town, state, zip, lat, lng, radius, services, bio, logo, **settings (longtext JSON)**, stripe_acct, stripe_ready, rating_sum/n, reality_sum/n, jobs_done, created |
| `clients` | pro_id, user_id, stage (lead…), source, name, company, email, phone, address, town, state, zip, photo, tags, data (JSON) |
| `props` | properties: pro_id, client_id, user_id, address, lat, lng, aerial, ppf (pixels per foot), photos (JSON), plan (JSON site plan), data |
| `quotes` | pro_id, client_id, prop_id, user_id, number, title, **status** (draft/request/sent/viewed/signed/declined), job_status, token, design, estimate, docs, job, sign, price, cost, total, valid_until, sent_at, viewed_at, signed_at |
| `visits` | scheduling: pro_id, quote_id, client_id, title, start, end, crew, status, notes |
| `invoices` | pro_id, quote_id, client_id, user_id, number, kind, title, items, amount, status, token, due, recur, next_at, stripe_session, paid_at, sent_at |
| `followups` | scheduled email/SMS follow-ups: channel, send_at, subject, body, include, recipients, status |
| `activity` | audit/activity log: pro_id, client_id, quote_id, kind, text, by_user, created |
| `reviews` | pro_id, user_id, quote_id, stars, reality, text, photo, reply, status |

## 1.3 REST API — what already exists

Namespace `dreamscaper/v1`.

- **Community:** `/c/feed`, `/c/post`, `/c/like`, `/c/rate`, `/c/comments`, `/c/comment`, `/c/report`, `/c/user`, `/c/users`, `/c/tags`, `/c/leaderboard`, `/c/follow`, `/c/follows`, `/c/friend`, `/c/friends`, `/c/block`, `/c/profile`, `/c/me`, `/c/redeem`, `/c/notes`, `/c/notes/read`, **`/c/messages`, `/c/thread`, `/c/send`**, `/c/event`, `/c/status`
- **Contractor:** `/crm/apply`, `/crm/application`, `/crm/me`, `/crm/settings`, `/crm/clients`, `/crm/client`, `/crm/property`, `/crm/note`, `/crm/quotes`, `/crm/quote`, `/crm/quote/send|status|copy|delete`, `/crm/followups`, `/crm/ai/scope`, `/crm/elevation`, `/crm/schedule`, `/crm/visit`, `/crm/job`, `/crm/invoices`, `/crm/invoice`, `/crm/invoice/send`, `/crm/review/reply`
- **Homeowner:** `/crm/pros`, `/crm/pro`, `/crm/lead`, `/crm/portal`, `/crm/request`, `/crm/review`, `/crm/myproperty`
- **Public/token:** `/crm/sign`, `/crm/decline`, `/crm/twilio`, `/crm/pay`, `/crm/connect`
- **Billing:** `/credits/checkout`, `/credits/confirm`, `/stripe` (webhook, signature-verified)

## 1.4 Conventions you must follow

- `dreamscaper_t( 'name' )` for table names. `dreamscaper_opt( 'key' )` for settings, defaults in `dreamscaper_defaults()`.
- Helpers that already exist and must be reused, not duplicated: `dreamscaper_crm_pro()` (current approved contractor or WP_Error), `dreamscaper_pro_row()`, `dreamscaper_pro_settings()`, `dreamscaper_pro_public()`, `dreamscaper_crm_log()` (activity), `dreamscaper_crm_tell_pro()` / `dreamscaper_crm_tell_user()` (in-app + email), `dreamscaper_crm_mail()`, `dreamscaper_sms()` (Twilio, honours STOP), `dreamscaper_e164()`, `dreamscaper_limit()` (rate limiting), `dreamscaper_token()`, `dreamscaper_json()`, `dreamscaper_ms()`, `dreamscaper_now()`, `dreamscaper_miles()`, `dreamscaper_next_number()`, `dreamscaper_crm_store_image()`, `dreamscaper_stripe()` (raw Stripe API call), `dreamscaper_member()`, `dreamscaper_unread()`, `dreamscaper_is_blocked()`, `dreamscaper_c_can()`.
- The `dreamscaper_stripe_event` action hook fires for every verified Stripe webhook event — subscribe to it, don't build a second webhook.
- Cron: `dreamscaper_crm_tick` runs on a custom schedule and already processes follow-ups and recurring invoices. Add new periodic work there or to a sibling hook — do not add a third cron system.
- Every JS import carries `?v=X.Y.Z`. When you bump the version you bump it everywhere.
- The site owner (`manage_options`) is auto-provisioned as an approved contractor by `dreamscaper_ensure_owner_pro()` and must never be locked out, trialled, billed, restricted or suspended.

---

# 2. NON-NEGOTIABLE ENGINEERING RULES

1. **Backwards compatible. Nothing existing breaks.** Every current design, account, client, quote, invoice, review and message must survive the upgrade and keep working. Write migrations, never destructive rewrites.
2. **Additive schema only.** New tables, or new columns via `dbDelta` with sensible defaults. Bump `DREAMSCAPER_DB` / `DREAMSCAPER_CRM_DB` and write the upgrade path. Never drop or rename an existing column.
3. **The server is the only authority.** Every subscription check, tier limit, trial check and permission check is enforced in the PHP REST `permission_callback` or at the top of the callback. The JavaScript lock icons are decoration. If someone opens dev tools and calls the endpoint directly, it must fail with 402/403.
4. **Security.** Sanitize every input (`sanitize_text_field`, `sanitize_email`, `esc_url_raw`, `wp_kses`). `$wpdb->prepare` on every query, no exceptions. Escape every output (`esc_html`, `esc_attr`, `esc_url`). Nonces/cookie auth for logged-in REST. Rate-limit every write endpoint with `dreamscaper_limit()`. Never trust an id from the client without verifying ownership.
5. **Privacy.** Phone numbers, addresses, gate codes and access notes are sensitive. Gate codes and access information must be stored in a field that is only ever returned to the owning contractor and the owning homeowner, never in a public endpoint, never in `dreamscaper_pro_public()`.
6. **Performance.** Index every new foreign key and every column used in a WHERE or ORDER BY. No N+1 queries in list endpoints — batch with `IN (...)`. Unread counts must be a single indexed query, not a loop.
7. **Scrolling.** No `scroll-behavior: smooth`, no scroll-jacking, no wheel-event interception anywhere. The mouse wheel must never feel slow or captured. This applies to every new screen.
8. **Mobile first.** Everything must work one-handed on a phone, in sunlight, with gloves, on a bad connection. Tap targets ≥ 44px. Crew-facing screens must be usable by someone who has never used office software.
9. **Accessibility.** Real buttons, labels on inputs, `aria-label` on icon buttons, visible focus rings, colour never the only signal, prefers-reduced-motion respected.
10. **File hygiene.** Match the existing style: tight, commented, no dependencies. Keep any single PHP or JS file under about 1,200 lines — when a file grows past that, split it into a new sibling file and `require_once` / `import` it. New concerns get new files (e.g. `includes/subs.php`, `includes/inbox.php`, `assets/js/inbox.js`), they do not get bolted onto `crm.php`.
11. **No new third-party libraries, SDKs or build tooling.** Stripe is called over REST with `wp_remote_request` through the existing `dreamscaper_stripe()` helper. No npm. No Composer.
12. **Version.** Ship as **2.7.0**. Update the plugin header, `DREAMSCAPER_VERSION`, every `?v=` import string, and `readme.txt` with an upgrade notice.
13. **Deliverable format.** Give complete, final files — whole-file contents ready to paste, not diffs or fragments, with the full file path as a heading above each one. Group them so they can be dropped into the plugin folder in order. Include an explicit list of which existing files changed and what changed in them.

---

# PART A — THE SOCIAL LAYER

## A1. The Messages area

Today `dscp_messages` is a bare 1:1 DM table and `/c/messages` groups it by the other user. That is not enough. A homeowner must be able to talk to other members *and* to contractors, about a *specific project*, and a contractor must be able to run every customer conversation from one inbox.

### A1.1 Data model

Create a proper threaded model while keeping the old rows readable.

**New table `dscp_threads`:**
- `id`, `kind` (`member` | `hire` | `job` | `support` | `system`), `subject`, `pro_id`, `client_id`, `quote_id`, `prop_id`, `invoice_id`, `status` (`open` | `archived` | `closed`), `created`, `last_at`, `last_user`, `msgs` (count)
- Index `(kind, last_at)`, `(pro_id, last_at)`, `(quote_id)`

**New table `dscp_thread_users`:**
- `thread_id`, `user_id`, `role` (`owner` | `member` | `pro` | `customer` | `crew`), `last_read_at`, `unread` (int), `muted` (0/1), `archived` (0/1), `left_at`
- Primary key `(thread_id, user_id)`, index `(user_id, archived, unread)`

**Extend `dscp_messages`** (additive, with defaults so old rows still work):
- `thread_id` (default 0), `kind` (`text` | `system` | `quote` | `invoice` | `design` | `visit` | `file`), `attach` (longtext JSON: images via `dreamscaper_crm_store_image`, max 5 per message, server-side type + size checks), `ref_type` / `ref_id` (link a message to a quote, invoice, visit, design or post), `edited_at`, `deleted_at`, `deleted_by`, `system` (0/1)
- **Migration:** on upgrade, walk the existing `messages` rows, create one `member` thread per unique participant pair, backfill `thread_id`, and populate `dscp_thread_users` with correct `last_read_at` derived from the existing `read_at` values. Run it in batches on a one-time cron job so a large site does not time out.

### A1.2 What the Messages area does

One inbox, reachable from the main header on every screen, with a live unread badge.

**Filters across the top:** All · Unread · Contractors · Community · Projects · Archived. Each filter has a one-line explanation under the heading the first time it is opened.

**Thread list:** avatar, name (and business name + "Contractor" badge when the other party is a pro), the project or quote this thread is attached to, last message preview, relative time, unread pill, muted/archived state.

**Thread view:**
- Message bubbles, read receipts, typing-free (no websockets — poll on a sensible interval and back off when the tab is hidden).
- **A context card pinned at the top of any `hire` or `job` thread:** the property address, the service requested, the quote number and status, the next scheduled visit, and buttons straight to the proposal, invoice or schedule. This is what stops the "which job are we talking about?" problem.
- Attachments: photos, a design from the user's DreamScaper library, a PDF proposal, a site plan.
- Quick actions for contractors inside a thread: *Send proposal · Book a site visit · Send invoice · Request photos · Add to CRM as a client · Snooze · Mark handled*. Each of these creates the real record and drops a `system` message into the thread recording that it happened.
- Quick replies / saved snippets for contractors ("Thanks — I can be out Thursday between 9 and 11, does that work?"), stored in `pros.settings`.
- Report, block and mute, reusing `/c/block` and `dscp_reports`.

**Contractor inbox:** the same component, but inside the Contractor Hub, showing every customer conversation with assignment (which employee owns this thread), status (new / replied / waiting on customer / closed), SLA timer ("first reply in 1h 12m"), and a *Needs reply* filter.

### A1.3 Alerts — the user must never miss a message

A new message triggers, in this order:

1. **In-app:** unread badge on the header icon, badge on the Messages filter, a `dscp_notes` row (reuse the existing notifications table and `/c/notes`), and a toast if the user is live in the app.
2. **Email:** immediate for the first unread in a thread, then a digest so nobody gets ten emails in ten minutes. Respect the existing `community_email` option. Template branded with the business name. "Reply" in the email deep-links back into the thread.
3. **SMS (contractors only, optional, tier-gated):** a new lead or a customer reply can text the contractor, via the existing `dreamscaper_sms()` helper, honouring STOP/START and quiet hours.
4. **Web push (optional, progressive enhancement):** only if the browser grants it; never block the UI on it.

**Per-user notification preferences** in Account → Notifications: what (new message, new lead, quote viewed, quote signed, invoice paid, visit reminder, community activity, **billing alerts** — billing SMS is a separate explicit opt-in, see B4.2), when (immediately / hourly digest / daily digest / off), how (in-app / email / SMS / push), plus quiet hours and a global "pause all". Default to sensible, not noisy.

**Anti-spam:** rate limits on sending, a cap on how many contractors one homeowner can message per day, no messaging a user who has blocked you, new-account message throttling, link-stripping for brand-new accounts, and the existing AI content check (`community_ai_check`) applied to first messages between strangers.

## A2. Guided contractor outreach — the Project Request

This is the most commercially important screen in the whole product. A homeowner should be able to go from "I want a new front yard" to a contractor holding a complete, quotable brief, **without the contractor having to ask a single follow-up question.**

Build a **Project Request wizard**: one question per screen, big tap targets, a progress bar, back/next, save-and-resume (persist a draft server-side so a phone dying doesn't lose it), and an explicit "Why we ask" line on every step — the pattern already used by `CAPTURE_STEPS` in `hire.js`, which you must reuse for the photo steps rather than reinventing.

### A2.1 The steps

1. **What do you want done?** Multi-select from the existing `SERVICES` list (Landscape design, Planting, Mulch & stone, Lawn installation, Patios & walkways, Retaining walls, Landscape lighting, Fencing, Drainage & grading, Tree work, Lawn care) plus "Something else". Each selection branches into its own short follow-up set.
2. **Tell us about it in your own words.** Free text, voice-to-text supported (`voice.js` exists), with an AI tidy-up pass that rewrites rambling input into a clean scope summary — **always shown to the homeowner for approval before it is sent.**
3. **Which property?** Pulls from their saved properties (`/crm/myproperty`); otherwise address entry with geocoding, which immediately becomes the customer record, property record, map location, job location and service-area check — entered once, used everywhere.
4. **Guided property capture.** Reuse `CAPTURE_STEPS` verbatim: aerial, front, left, right, back, structures, existing landscape. Let them skip, but show a live **Brief completeness meter** that visibly drops when they do, with a plain explanation of what a contractor cannot quote without it.
5. **Attach a design.** Any DreamScaper design they've made, or "Design it now" which drops them into the studio and returns them to this step. Attaching a design is the single biggest conversion lever — make it prominent.
6. **Measurements.** If a design or site plan exists, run the existing takeoff and show the quantities ("about 1,450 sq ft of lawn, 38 cu yd of mulch, 240 linear ft of edging") clearly labelled **AI ESTIMATE — not a surveyed measurement**.
7. **Budget.** A range, with honest context for their area and the services chosen ("most front-yard planting projects in your area land between $X and $Y"), plus "I'm not sure — tell me what's realistic", and a financing-interest checkbox.
8. **Timing.** Ideal start window, hard deadline and why (party, closing, listing the house), flexibility, and seasonal reality ("sod installs best in spring and early fall here").
9. **Site facts that change the price.** Gate width and access for equipment, slope, drainage or wet areas, septic/well/propane, irrigation present, utilities marked, HOA approval needed, permits likely, pets, children, parking for a truck and trailer, where a dumpster or material pile can go. Mostly tap-to-answer with icons, not typing.
10. **Must-have vs nice-to-have.** Drag to rank, or simple tiers. This is what lets a contractor quote phases instead of losing the job on price.
11. **Decision and contact.** Who decides, best times to reach you, preferred channel (message / call / text / email), and whether other contractors are also quoting — honest, and it changes how a contractor responds.
12. **Who should see this?** **A homeowner may request quotes from as many contractors as they want.** They pick contractors one by one from Find a Contractor (an "Add to my request" basket), or tap "Send to every contractor who serves my address for these services". Show a clear explanation of what each contractor will receive and get explicit consent to share their name, address and photos with them. The only limits are anti-spam safeguards (rate limiting and duplicate detection), never a cap on how many contractors they can choose.
13. **Review and send.** A clean summary of the whole brief, editable inline, with the completeness score and a short list of "what's still missing and why it matters".

### A2.2 Contractor-defined questions — the real fix for follow-ups

Every contractor gets an **Intake Questions** editor in their hub: per service, add their own questions (short text, long text, single choice, multi choice, number, yes/no, photo, date). Those questions are injected into the wizard automatically when a homeowner selects that service for that contractor. Ship a strong default set per service so it works out of the box, and let David's own operating procedures seed the landscaping defaults.

This is the mechanism that gets follow-up questions to near zero: the contractor who keeps asking "is there a gate?" adds the gate question once and never asks again.

### A2.3 What happens on send

- A `quotes` row is created with `status = 'request'` (the existing mechanism — the contractor hub already counts these), the `clients` row, the `props` row with photos and plan, and all answers stored as structured JSON, not prose.
- A `hire` thread is opened between the homeowner and the contractor, pre-loaded with the brief summary and the photos, so the conversation starts with full context.
- The contractor is alerted in-app, by email and, if enabled, by SMS, with a **first-reply timer** running.
- The homeowner gets a confirmation that says exactly what happens next and by when.
- The contractor's hub shows the request as a **Request Brief card**: completeness score, the answers grouped and scannable, the photos in a strip, the takeoff quantities, and three buttons — *Message · Book a site visit · Start the estimate* (which pre-fills the estimate from the brief and the takeoff, no re-keying).
- If anything important is missing, the contractor taps **Ask for what's missing** and the system sends the homeowner a short, specific, pre-written request for exactly those items — not a blank "can you tell me more".

## A3. Contractor socials on the contractor page

Contractors need to show they are real, and homeowners trust what they can check. Social links are a trust signal that helps the whole marketplace convert, so **every tier gets every supported network** — the tier only gates the extras (curated gallery, featured placement).

### A3.1 Supported networks — in this display order

The order is fixed by value to a landscaping business, so the most useful link is always first wherever space is tight:

| Order | Network | Why it matters | Accepted hosts |
|---|---|---|---|
| 1 | **Google Business Profile** | High-intent local search, reviews | `g.page`, `maps.app.goo.gl`, `google.com/maps`, `business.google.com`, `share.google` |
| 2 | **Facebook** | Local homeowners and community groups | `facebook.com`, `fb.com`, `m.facebook.com` |
| 3 | **Instagram** | Portfolio and visual marketing | `instagram.com` |
| 4 | **Houzz** | Landscape and design leads | `houzz.com` (and country domains, e.g. `houzz.co.uk`) |
| 5 | **YouTube** | Search plus project education | `youtube.com`, `youtu.be` |
| 6 | **Nextdoor** | Neighbourhood referrals | `nextdoor.com` |
| 7 | **TikTok** | Discovery and reach | `tiktok.com` |
| 8 | **LinkedIn** | Commercial / B2B credibility | `linkedin.com` |

The network list is a filterable PHP array (`dreamscaper_social_networks`), not hard-coded in JS, so the site owner or a later version can add a network without touching the UI.

### A3.2 Storage

- A `socials` object inside `pros.settings`, keyed by network: `{ "gbp": { "url": "...", "on": true, "verified": 0, "checked": "..." }, "facebook": { ... }, ... }`.
- **`on` is the contractor's per-link switch.** A link can be saved but switched off — it is kept, just not shown anywhere public.
- No new columns unless an index is genuinely needed.

### A3.3 Entry — the contractor backend (Hub → Profile → Social links)

A guided card, one row per network in the order above, each with: the network icon and name, one input, a toggle (**Show on my pages**), and a status line.

- **Paste anything.** Full URL, handle (`@davidslandscaping`) or bare username. Normalise to a canonical `https://` URL; validate the host against the table above and reject anything else with a friendly message ("That looks like a Facebook link — paste it in the Facebook row").
- `esc_url_raw` on save, `esc_url` on output. Strip tracking parameters (`utm_*`, `fbclid`, `igshid`, `si`) on save.
- **Test link** button opens the canonical URL in a new tab so the contractor can confirm it is theirs.
- **Live preview** beside the editor showing exactly how the icon row will look on the profile, the directory card and a proposal footer, updating as they toggle.
- Toggling a link on or off takes effect **everywhere at once** (A3.4) — no per-page settings to keep in sync. Saving is one REST call (`/crm/settings`, gated by `dreamscaper_pro_gate( 'profile' )`).
- Explains itself (A4): *"Homeowners check these before they call. Add your Google Business Profile first — it's where most local customers look for reviews."*

### A3.4 Where enabled links appear — automatically

One server helper, `dreamscaper_pro_socials( $pro_id, $context )`, returns only the enabled links in display order, and every surface uses it:

| Surface | Shows |
|---|---|
| Contractor profile page | all enabled links, full icon row with labels on wide screens |
| Find a Contractor card | top 3 enabled links by display order, icon only |
| Proposal footer (screen + print/PDF) | all enabled links, small icons + short URL text so it works on paper |
| Invoice footer (screen + print/PDF) | same as proposal |
| Customer portal (My Projects) contractor panel | all enabled links |
| Contractor's community profile | all enabled links |
| Branded emails sent on the contractor's behalf | enabled links in the footer (merge tag `{company_socials}`, see A3c) |

`dreamscaper_pro_public()` includes only enabled links. Disabled links never leave the contractor's own settings endpoint.

### A3.5 Display rules

- Inline SVG icons, no third-party scripts, no tracking pixels, no embedded feeds or SDKs.
- Each link `target="_blank" rel="noopener noreferrer nofollow ugc"` with an accessible label ("David's Landscaping on Instagram").
- While a contractor is **suspended** (B4), their public profile still shows their socials under "not currently accepting new work" — never punish them by making them look fake.

### A3.6 Automation that pays for itself

- **Setup nudge.** If a contractor has no Google Business Profile link, the onboarding checklist and the daily command centre (C9) suggest adding it, once, dismissible.
- **Review routing.** If a Google Business Profile link is on, the post-job review request (C26/C30) offers *happy* customers (4–5 stars in DreamScaper's own rating) a one-tap "Also review us on Google" button pointing at the contractor's GBP. Unhappy ratings never see it (C26). The contractor can choose which network the button points to (GBP default, Facebook or Houzz as alternatives) or switch it off.
- **Broken-link check.** A weekly cron pass on `dreamscaper_crm_tick` HEAD-requests each enabled link (rate-limited, polite user agent). A link that has returned 404/410 for two consecutive checks is flagged to the contractor ("Your Houzz link isn't working any more — fix or hide it"); it is **never** auto-hidden without their say-so.

### A3.7 Verification (optional)

A "verified" tick only when ownership has actually been checked: either the contractor places their DreamScaper profile URL on that social profile and the system fetches and confirms it, or the site owner verifies it in admin. Never claim verification that hasn't happened.

### A3.8 Tier extras (see B2)

- **All tiers:** all 8 networks, per-link on/off, all surfaces above, review routing.
- **Business and Pro+:** curated work gallery on the profile, drawn from their own finished-job photos and community posts.
- **Pro+:** featured placement in Find a Contractor, always visibly labelled **Featured**.

## A3b. Shared calendar and automatic reminders

Every appointment — consultation, site visit, estimate walk-through, job day, follow-up meeting — lives on **one shared record** that appears automatically on **both** the contractor's calendar and the homeowner's calendar the moment it is booked. Nobody re-enters it.

- **Both calendars:** the contractor sees it in Schedule; the homeowner sees it in **My Calendar** (inside My Projects) and in the context card of the project's message thread.
- **External calendars:** each user gets a private, revocable calendar-subscription link (.ics feed) that works with Google Calendar, Apple Calendar and Outlook, plus a one-tap "Add to my calendar" for a single appointment. Changes and cancellations flow through automatically.
- **Homeowner actions:** Confirm, or Ask to reschedule (with preferred times and a note). Either one alerts the contractor and posts to the project thread.
- **Reminders on the contractor's schedule:** the contractor decides **how often and when** customers are reminded — any number of reminders, each set as "N minutes / hours / days before", each with its own channel (email, text, in-app), and optionally limited to certain appointment types (e.g. consultations get a 1-day and 2-hour reminder; job days get a 3-day, 1-day and morning-of reminder). Defaults ship sensibly; every appointment can override them. Reminders are rebuilt automatically when an appointment moves and cancelled when it is cancelled. Reminders never fire in the past and never fire twice.
- **Contractor reminders too:** the contractor (and crew) can get their own reminders on the same rules.

## A3c. Every alert and automatic message is fully customisable

Every message the system sends on the contractor's behalf — request received, appointment booked / changed / cancelled, appointment reminders, on-the-way, job complete, invoice sent, invoice overdue, payment received, review request, new-message alerts — and every alert the contractor receives, is a **template the contractor can rewrite completely**, in an editor that is easy for a non-technical person:

- On/off per message, channels per message (email, text, in-app), email subject + email body + a separate short text-message body (with a live character / text-segment counter).
- **Merge tags inserted by tapping a chip**, never by memorising syntax: `{customer_name}`, `{customer_first_name}`, `{job_name}`, `{property_address}`, `{appointment_date}`, `{appointment_time}`, `{appointment_type}`, `{crew_names}`, `{quote_total}`, `{invoice_amount}`, `{invoice_due_date}`, `{company_name}`, `{contractor_phone}`, links to the proposal / invoice / portal / calendar, and more. Both `{tag}` and `{{tag}}` work, case doesn't matter, and `{customer_first_name|there}` supplies a fallback when a value is empty.
- A live preview filled with realistic sample data, a "Send me a test" button, a warning for any tag that would come out empty, and "Reset to default" per message.
- Timing settings next to the message they control (reminder schedule, invoice-overdue nudge timing, review-request delay).

## A4. Every area must explain itself

This is a requirement, not a polish item. Apply it uniformly across the entire app — community, studio, hire flow, portal, contractor hub, settings, and everything added in Part C.

Implement one reusable pattern and use it everywhere:

- **Section header:** the name, plus one plain-English sentence under it saying what this area is for. Written for a homeowner or a crew member, not for a developer. No jargon.
- **"What can I do here?" button** on every section — a small `?` that opens a panel listing: what this area does, what you can do here (3–7 bullets, each an actual action), what it connects to ("estimates created here become jobs on your schedule"), and what tier it needs if it is locked.
- **Teaching empty states.** An empty screen never says "No items." It says what would be here, why it's useful, and gives the button that creates the first one. ("No proposals yet. A proposal is the document your customer signs. Build one from any estimate — it takes about two minutes. [Create a proposal]")
- **First-visit coach marks** on each major area, once, dismissible, remembered per user. Extend the existing `tour.js` / `guide.js` rather than building a second system.
- **Inline field help** on anything a non-expert would hesitate over — markup %, tax on materials vs all, deposit terms, "Dream-to-Reality score".
- **Locked features are explained, never hidden.** A feature above the user's tier shows greyed with a lock, a one-line description of what it does, the tier it needs, and a single *See plans* link. Users must be able to see what they're missing — that is how they upgrade — but never be tricked into a dead end.
- **A Capability Map** in Settings/Help: one page listing every area of the platform, one line each on what it does, and whether the current account has it. The whole product, legible on one screen.
- **A REST endpoint `/crm/capabilities`** returning, for the current user: their plan, status, trial days remaining, every feature flag, every usage limit and current usage. The UI renders locks from this. It is also the single source of truth the server enforces against.

---

# PART B — CONTRACTOR SUBSCRIPTIONS: 4 PAID TIERS, A 30-DAY TRIAL, AND A STAGED NON-PAYMENT POLICY

## B1. The principle

A contractor's data is their business. The subscription controls **what they can do**, never **what they keep**. A failed payment never deletes anything and never cuts off a long-time customer overnight. Access steps down gradually, cutting **our** costs (AI, storage, SMS) first and **their** operations last. The moment payment succeeds, everything comes back automatically.

## B2. The four tiers

Ship with four tiers plus the trial. The names, prices, limits and feature flags below are the **defaults**. **Every one of them must be editable by the site owner in Settings → DreamScaper → Plans**, along with the Stripe price IDs. Nothing about tiers may be hard-coded in JavaScript.

### B2.1 Plan summary

| | 🌱 **Starter** | ⭐ **Professional** | 🚜 **Business** | 🏢 **Pro+** |
|---|---|---|---|---|
| **Built for** | Owner + one crew leader | A growing company | Multi-crew operation | Large or multi-location company |
| **Monthly** | **$59** | **$129** | **$249** | **$499** |
| **Annual** (default = 10× monthly, 2 months free) | $590 | $1,290 | $2,490 | $4,990 |
| **Badge** | — | **Most Popular** | — | — |
| Employees (owner not counted) | 1 | 5 | 15 | 50 |
| Crews | 1 | 2 | 5 | unlimited |
| AI credits / month | 50 | 200 | 750 | 2,500 |
| Storage | 5 GB | 25 GB | 100 GB | 500 GB |
| Landscape plans / month | — | 3 | 15 | unlimited* |

\* **Unlimited means fair use.** Ship a site-owner-editable soft ceiling (default 100 plans/month). Past it, generation keeps working and the site owner is alerted to review the account. Generation is never silently blocked, and the pricing page says "unlimited, subject to fair use". This protects against scripted abuse without breaking the promise.

Each tier includes everything in the tier to its left.

### B2.2 Full feature matrix

✓ = included · — = not included (shown locked, never hidden — A4) · *adv* = the advanced version

| Area | Flag | Starter | Professional | Business | Pro+ |
|---|---|---|---|---|---|
| CRM, customers, leads, properties | `ds_feat_crm` | ✓ | ✓ | ✓ | ✓ |
| Calendar & scheduling | `ds_feat_schedule` | ✓ basic | ✓ advanced calendar, multi-crew | ✓ | ✓ |
| Employee manager | `ds_feat_employees` | ✓ basic | ✓ employee management | ✓ *adv* | ✓ *adv* + advanced permissions |
| Day-to-day task manager | `ds_feat_tasks` | ✓ | ✓ | ✓ *adv* | ✓ *adv* + custom workflows |
| Estimates & proposals | `ds_feat_estimates` | ✓ | ✓ | ✓ | ✓ |
| Invoicing & online payments | `ds_feat_invoices` | ✓ | ✓ | ✓ | ✓ |
| Customer portal | `ds_feat_portal` | ✓ | ✓ | ✓ enhanced | ✓ white-label |
| AI assistant | `ds_feat_ai_assistant` | ✓ basic | ✓ | ✓ | ✓ |
| AI Quoter | `ds_feat_ai_quoter` | — | ✓ | ✓ *adv* | ✓ *adv* |
| Route Optimizer | `ds_feat_routes` | — | ✓ | ✓ *adv* | ✓ *adv* |
| Landscape Plan Generator | `ds_feat_plans` | — | ✓ (3/mo) | ✓ (15/mo) + advanced design tools | ✓ unlimited* + advanced planning |
| Manual follow-ups (existing 2.6 feature) | `ds_feat_followups` | ✓ | ✓ | ✓ | ✓ |
| **Automated** customer follow-ups | `ds_feat_auto_followups` | — | ✓ | ✓ | ✓ |
| Automation engine (C7) | `ds_lim_automations` | — | ✓ AI automations (25 rules) | ✓ *adv* (100 rules) | ✓ *adv* AI automation (unlimited) |
| Appointment reminders (A3b) | `ds_feat_reminders` | ✓ default schedule | ✓ fully custom rules | ✓ | ✓ |
| Message templates (A3c) | `ds_feat_templates` | ✓ edit text | ✓ + per-type timing | ✓ | ✓ |
| Messaging inbox (A1) | `ds_feat_inbox` | ✓ | ✓ + assignment, SLA, snippets | ✓ + shared team inbox | ✓ + routing rules |
| SMS (Twilio) | `ds_feat_sms` | — | ✓ | ✓ | ✓ |
| Job photos (crew before/after) | `ds_feat_job_photos` | — | ✓ | ✓ | ✓ |
| Job costing | `ds_feat_job_costing` | — | — | ✓ | ✓ |
| Profitability tracking | `ds_feat_profit` | — | — | ✓ | ✓ advanced analytics |
| Material / labour calculations | `ds_feat_calcs` | — | — | ✓ | ✓ |
| Material takeoffs → priced estimate lines | `ds_feat_takeoff` | — | — | ✓ | ✓ advanced |
| Reporting | `ds_feat_reports` | ✓ core | ✓ standard | ✓ advanced | ✓ advanced + custom dashboards |
| Accounting & transactions (C3/C5) | `ds_feat_accounting` | ✓ basic | ✓ full | ✓ full | ✓ full + multi-location |
| Tax data exports (C4) | `ds_feat_tax_export` | CSV | CSV, Excel, PDF | + 1099 data | + scheduled exports |
| Mass email marketing (C13) | `ds_lim_email_sends` | 500/mo | 5,000/mo | 20,000/mo | unlimited* |
| Advertising ROI (C14) | `ds_feat_ads` | — | ✓ | ✓ | ✓ |
| Inventory & vendors (C20/C21) | `ds_feat_inventory` | — | — | ✓ | ✓ |
| Multi-location | `ds_feat_multi_location` | — | — | — | ✓ |
| API & webhooks | `ds_feat_api` | — | — | — | ✓ |
| Advanced permissions / custom roles | `ds_feat_roles` | — | — | — | ✓ |
| Custom workflows / statuses | `ds_feat_workflows` | — | — | — | ✓ |
| Social links (A3) | `ds_feat_socials` | ✓ all 8 | ✓ all 8 | ✓ + curated gallery | ✓ + featured placement |
| Audit trail retention | `ds_lim_audit_days` | 90 days | 1 year | 2 years | unlimited |
| Data export | `ds_feat_export` | ✓ **always** | ✓ **always** | ✓ **always** | ✓ **always** |
| Support | — | email | priority email | priority email | priority + onboarding call |

The prices and the feature split come from the owner. Rows they didn't specify (SMS, accounting, marketing sends, inventory, audit, automation rule counts, the trial credit allowance) have recommended defaults here and stay editable.

### B2.3 How the limits behave

- **Employees** are counted as active employee logins, not counting the owner. At the cap, *Invite employee* is blocked with an upgrade prompt. Nobody already active is removed.
- **Crews** are named groups of employees used by scheduling and routing. At the cap, *New crew* is blocked.
- **AI credits** are one shared monthly allowance for every AI action. A separate meter per feature is confusing. The allowance resets on the billing anniversary and does not roll over by default (an owner setting can allow rollover, with a cap). The **costs per action live in an owner-editable table** with sensible defaults, for example: AI assistant question 1, Dreamscape render 1, AI Erase / Smart Select 1, receipt/document scan 1, AI scope write-up 2, AI Quoter run 5. When credits run out, the UI offers the existing **credit packs** (`billing.php`) as a top-up. It never fails silently.
- **Landscape plans** are counted separately from credits, because they're the headline feature and the easiest number to understand. A generation that fails or that the user cancels doesn't count.
- **Storage** reuses the existing quota in `cloud.php`, extended so a contractor's quota covers designs, job photos, documents and receipts. The existing storage packs remain available as add-ons.
- **Usage meters** show the exact numbers ("142 of 200 credits used, resets Nov 3"). They warn softly at 80%, firmly at 100%, and email the owner once at each threshold.
- **Hitting a limit only ever blocks creating more.** Nothing is deleted or hidden.
- **Downgrading over a limit** keeps everything. Extra employees are moved to read-only (the contractor chooses which ones stay active), extra crews are archived (kept, not deleted), and storage over quota blocks new uploads only. The downgrade screen previews exactly what will change before it's confirmed.
- **Proration:** upgrades take effect immediately, prorated by Stripe. Downgrades take effect at the end of the paid period. Both are explained in one sentence on the confirm screen.
- **The site owner's own account** (`dreamscaper_ensure_owner_pro()`) is permanently `comped` at the top tier, with no limits.

### B2.4 Existing 2.6.0 contractors

Every contractor approved before the upgrade is migrated to the **Professional trial** described in B3. They skip the card requirement at migration time, and their trial clock starts when they first sign in after the upgrade. They get the same reminder emails as everyone else. Their trial ledger entry is written (B3.2) so the trial can't be reused later. Nothing they already use is taken away on day one.

## B3. The 30-day trial — and making it genuinely un-gameable

Any approved contractor may start **one** 30-day free trial of the **Professional** tier. One. Ever. Per business, per person, per device, per payment instrument.

**Trial cost protection:** during the trial the AI credit allowance defaults to **100** (owner-editable), not the full 200, and landscape plans default to **2**. Their trial still shows every Professional feature. The trial screen says plainly that the allowance goes up when the paid plan starts.

### B3.1 Start conditions

To start a trial the contractor must:

1. Have an approved `pros` record (the existing application + admin approval flow stays).
2. **Verify a mobile phone number by SMS one-time code** (reuse `dreamscaper_sms()` / `dreamscaper_e164()`). One trial per verified phone number, ever.
3. **Verify their email address.** It can't be on the disposable-domain blocklist, which is maintained and refreshed. Normalise addresses before comparing them: lowercase, strip `+tags`, and strip dots for Gmail-class domains.
4. **Put a valid card on file** via a Stripe SetupIntent / Checkout in `setup` mode. The card isn't charged during the trial. This is the most effective anti-abuse measure there is, and it means the trial converts automatically on day 31 unless cancelled. Say so plainly on the screen: *"We'll hold your card and won't charge it today. On day 31 your Professional plan starts at $129/month unless you cancel — we'll email you on day 23 and day 29 to remind you."* The price shown is the live value from Plans, never a hard-coded string.
5. Agree to trial terms that disclose the auto-conversion, the price, and how to cancel.
6. **Choose the plan they'll convert to** (Professional by default; any tier can be chosen). This is the plan that starts on day 31.

### B3.2 The trial ledger

**New table `dscp_trials`** — an append-only ledger of every identity that has ever consumed a trial:

- `id`, `user_id`, `pro_id`, `started`, `ends`, `outcome` (`active` | `converted` | `expired` | `cancelled` | `blocked`), `created`
- Hashed fingerprint columns, each `sha256( value + wp_salt() )`, each indexed:
  - `h_email`, `h_phone`
  - `h_card` (Stripe payment-method fingerprint), `h_stripe_customer`
  - `h_business` (business name normalised: lowercase, strip punctuation, strip LLC/Inc/Co)
  - `h_address` (geocoded + normalised street + zip)
  - `h_license`, `h_ein`
  - `h_ip`, `h_device` (a stable browser fingerprint hash — disclosed in the privacy policy as fraud prevention)
  - `h_domain` (email domain + website domain)

**On any trial request, check every hash against every row.**
- A hit on phone, card, Stripe customer, licence, EIN, or business+address means **no trial**. They can subscribe immediately, and the message is honest and non-accusatory: *"It looks like this business has already used its free trial. You can start on any plan today — and you can cancel any time."*
- A hit on IP or device alone is weak evidence (shared offices, families, phone networks). Flag it for admin review rather than hard-blocking.

### B3.3 Closing the obvious holes

- **Trial state lives server-side only.** `trial_ends` is a datetime in the database, compared against server time. It is never read from, written by, or trusted from the client. No cookie, no localStorage, no JS date.
- **Reinstalling or deactivating the plugin does not reset anything.**
  - Keep `dscp_trials` and `dscp_subs` out of any deactivation cleanup.
  - Uninstall only purges them if the site owner explicitly ticks "delete all data".
  - Even then, mirror the ledger into a protected option and into Stripe customer metadata, so a reinstall can restore it.
- **Deleting and recreating the WordPress user does not reset it.** The ledger keys are the business identity, not the user id.
- **A new email address does not reset it.** Phone, card and business identity still collide.
- **No multiple concurrent trials** per user, per `pros` row, or per business identity.
- **Clock changes are irrelevant.** Comparisons use `gmdate()` and UTC on the server only.
- **No stacking.** Downgrading, cancelling or re-applying can't earn another trial. Only the site owner can grant an exceptional second trial, from the admin screen, and that action is logged with a reason in the audit trail.
- **Day 31 is firm.** If the first charge succeeds, carry on seamlessly as `active`. If it fails, the account enters the **non-payment policy (B4) at Day 0**, the same as any other failed payment. It is never silently extended.

### B3.4 During the trial

Full Professional features, within the trial allowances above. A persistent, friendly banner shows days remaining and a *Choose your plan* button. It becomes more prominent in the last week.

Emails go out on day 1 (welcome + a three-step "what to try first" checklist: add your Google Business Profile link, send your first proposal, book your first visit), and on days 7, 14, 23, 29 and 30.

Nothing is dark-patterned: cancelling is one click from Billing and is confirmed by email.

## B4. The non-payment policy — staged, automatic, and never destructive

### B4.1 The stages

Everything is driven by **days since the first failed payment of the current unpaid invoice** (`first_failure` on `dscp_subs`). Elapsed days are computed server-side in UTC. Every date shown to the contractor is rendered in the contractor's own timezone. Every day boundary below is an owner-editable setting with these defaults:

| Stage | Days | Status key | Access | What we protect |
|---|---|---|---|---|
| **Notice** | 0–3 | `past_due` / stage `notice` | **100%** | Their goodwill — most failures are expired cards or temporary declines |
| **Reminder** | 4–7 | `past_due` / stage `reminder` | **100%** | — |
| **Restricted** | 8–10 | `past_due` / stage `restricted` | Full **except new costly actions** | Our AI, storage and SMS costs |
| **Final warning** | 11–13 | `past_due` / stage `readonly` | **Read-only** + billing + export | Everything except our goodwill |
| **Suspended** | 14+ | `suspended` | Log in, view, export, pay | All data, intact |
| **Retention review** | 90+ | `suspended` (+ `deletion_eligible` flag) | Same as suspended | Data deleted only after advance warnings and an explicit action (B4.6) |

**Successful payment at any stage restores everything instantly and automatically** (B4.5). No support ticket, no manual step.

### B4.2 What the contractor sees and receives at each stage

All banner and email copy is held in the **A3c template system** (as platform-owned templates that only the site owner can edit, not contractor templates), so the wording can be changed without code. `{suspend_date}` is the computed suspension date.

**Day 0 — payment fails.** Nothing is switched off.
- Mark the account `past_due`, stage `notice`. Record `first_failure` and log it to `dscp_sub_events`.
- Show an **unobtrusive but persistent** banner (dismissible per session, back on the next login):
  > ⚠️ **Payment issue — no action required yet.** We couldn't process your latest payment. Your account remains fully active while we retry the payment. **[Update payment method]**
- Send an email immediately. Send an SMS **only** if the contractor has opted into billing texts (a separate opt-in from customer SMS, set in Account → Notifications).
- **Update payment method** opens the Stripe Customer Portal in one click.
- Let **Stripe Smart Retries** and Stripe's own failed-payment emails handle the retries. Our emails complement Stripe's rather than duplicating them: the owner chooses in Settings whether DreamScaper or Stripe sends the dunning emails, and the default is DreamScaper with Stripe's turned off, so the contractor gets one consistent voice.

**Days 1–3 — full access.** The banner stays the same. Nothing else changes and no further messages go out. Expired cards, temporary declines, insufficient funds, fraud holds, replacement cards, company card issues and bank authentication problems usually fix themselves or get fixed here.

**Day 4 — stage `reminder`.** Still 100% access. The banner becomes more prominent (stronger colour, not dismissible):
> **Your subscription payment is still outstanding.** We haven't been able to process your payment. Please update your payment method by **{suspend_date}** to avoid interruption to your account. **[Update payment method]**

Send a second email, and an SMS if they've opted in.

**Day 8 — stage `restricted`.** This is where we start protecting our costs. Send an email explaining exactly what is paused and why.

The contractor **can still:**
- log in
- view customers, jobs, the calendar, employees, existing estimates and existing landscape plans
- **create and edit** ordinary records (customers, estimates, visits, invoices)
- **send** proposals and invoices — this is how they earn the money to pay us
- download their data
- update billing and pay their invoice

**Temporarily paused** (each flag is owner-editable):
- new AI Quoter runs
- new AI-heavy operations (every action that costs AI credits)
- new landscape-plan generations
- buying additional AI credits or storage packs
- uploads larger than the owner-set threshold (default 10 MB; ordinary job photos still work)
- **AI-powered and marketing automation runs**: mass email, campaigns and AI automations pause. They are **queued, not lost**.

**Customer-protecting automations keep running**: appointment reminders for already-booked visits, payment receipts, and invoice delivery. The contractor's customers should never notice the contractor's card problem.

Each paused action shows an inline explanation instead of a dead button: *"Paused while your payment is outstanding. [Update payment method] and it's back instantly."*

**Day 11 — stage `readonly` (final warning).** The banner is now full-width and unmissable, and the deadline is explicit:
> **Your account will be suspended on {suspend_date}.** We haven't received payment for your subscription. Update your payment method before {suspend_date} to maintain access to your account and all of your saved business data. **[Update payment method]**

Send an email on day 11 and a final one on day 13 ("tomorrow"). Send SMS too if opted in.

**Allowed:** login, billing, viewing all data, data export, payment-method update, payment.
**Disabled:** most operational functionality — creating or editing records, sending, scheduling changes, automations, AI, uploads. Every write route returns **402** with the stage and the reason.

Already-sent customer links keep working (B4.4).

**Day 14 — `suspended`.** The account is suspended, not deleted. The contractor can log in and sees one calm, clear screen:
> **Suspended — Payment Required.** Your account is currently suspended because your subscription payment is past due. All of your customers, jobs, estimates, proposals, invoices, calendar, routes, landscape plans, photos, documents, settings and AI history are safe and intact.
> **[Update Payment Method & Restore Account]** · [Download my data]

Email the suspension notice on the day. Then send reminders on day 21 ("everything is waiting for you — restoring takes one click"), day 44 and day 74.

### B4.3 What is kept — always

While `past_due` or `suspended`, **nothing is deleted or hidden from the contractor**:
- customers, contacts and properties
- employees and crews
- jobs, estimates, proposals and invoices
- calendar, visits and routes
- landscape plans and designs
- photos and documents
- settings, templates and automations
- AI history, messages, reviews and the activity log

Scheduled follow-ups, recurring invoices and automations are **suspended, not cancelled**.

### B4.4 What homeowners experience — the policy carried over from 2.7's original rules

Homeowners can't start new interactions with a contractor whose functionality is shut down. They are never stranded mid-transaction, and they never see anything embarrassing about the contractor.

**From `readonly` (day 11) onward:**
- The contractor is **hidden from Find a Contractor** and from "send to every contractor who serves my address".
- Their profile page stays up, with "not currently accepting new work". Never a 404.
- **New** project requests and **new** message threads to that contractor are blocked server-side. The homeowner gets a polite message steering them to other contractors.
- **Existing** threads become read-only for the homeowner, with a short note: *"This contractor isn't replying through DreamScaper right now."* No billing detail is ever shown to the homeowner.

**At every stage:**
- **Already-sent links keep working.** A homeowner can still view and sign a sent proposal, and view and pay a sent invoice. Payments are recorded normally and paid out via Stripe Connect as usual.
- Never punish the contractor's customers for the contractor's card expiring.

**Restricted stage (days 8–10):** the contractor is still fully visible, can receive new requests, and can reply normally. Only our costly features are paused.

Pending marketplace requests that arrive in the 48 hours before suspension stay open and are visible to the contractor after restoration. The homeowner is told after 72 hours without a reply, so they can choose other contractors.

### B4.5 Automatic restoration

Restoration is triggered by `invoice.paid` (or a new subscription starting) on the `dreamscaper_stripe_event` hook, **and** by the daily reconciliation pass in case the webhook was missed. On restoration:

- Set status back to `active`, clear `first_failure` and the stage, and log to `dscp_sub_events`.
- Re-list the contractor in the directory and re-open their threads.
- **Resume automations, follow-ups and recurring invoices.** Anything whose send date passed while suspended goes into a **"Catch-up review" queue** for the contractor to send, reschedule or skip. Months of backdated email are never fired at their customers.
- Restore the monthly AI credit and plan allowances for the current period.
- Show an in-app confirmation (*"You're all set — everything is back exactly as you left it"*) and send a confirmation email.

### B4.6 90+ days — retention and deletion

- At **90 days suspended**, the account is marked `deletion_eligible`. **Nothing is deleted automatically.**
- Deletion follows the published retention policy (owner setting, default **12 months** after suspension or cancellation). Warning emails go out **30 days** and **7 days** before any deletion.
- Deletion only happens through an **explicit site-owner action** from the admin screen, logged with a reason, or the contractor's own confirmed request.
- Before any deletion, a full export is generated and emailed as a download link, valid for 30 days.
- The trial ledger and billing audit trail (`dscp_trials`, `dscp_sub_events`) are kept even after account deletion. They hold hashes and billing events, not customer data.

### B4.7 Voluntary cancellation

- Access continues to the end of the paid period, then the status becomes `cancelled`, which behaves exactly like `suspended` (minus the payment-failure messaging).
- Offer a one-click full export at cancellation.
- Retention and deletion work exactly as in B4.6.
- Resubscribing at any time restores everything instantly.

### B4.8 Data model

**`dscp_subs`:**
- `pro_id` (PK)
- `plan` (`starter` | `professional` | `business` | `proplus`)
- `status` (`trialing` | `active` | `past_due` | `suspended` | `cancelled` | `comped`)
- `stage` (`''` | `notice` | `reminder` | `restricted` | `readonly`)
- `interval` (`month` | `year`)
- `seats`, `crews`
- `stripe_customer`, `stripe_sub`, `stripe_price`
- `trial_ends`, `current_period_end`, `cancel_at`
- `first_failure`, `suspended_at`, `deletion_eligible_at`
- `last_payment`, `last_failure`, `failures`
- `credits_used`, `credits_period_start`, `plans_used`
- `billing_sms` (0/1)
- `notes`, `created`, `updated`

Index `(status, stage)` and `(first_failure)`.

**`dscp_sub_events`:** an append-only log of every status or stage change, Stripe event id, amount, reason and actor. This is the billing audit trail and it is never edited.

**Stage advancement** runs on the existing `dreamscaper_crm_tick` cron (an hourly check is enough). It recomputes the stage from `first_failure` and is idempotent: running it twice never sends a message twice, because each stage email is recorded in `dscp_sub_events` and checked before sending. A stage is never skipped backwards and never advances past what the elapsed days justify.

**Daily reconciliation** re-reads every non-`active` subscription and every `active` subscription with a period ending in the next 48 hours from Stripe. It corrects drift in both directions. A missed webhook can never leave an account wrongly open or wrongly suspended.

## B5. Enforcement architecture

Build this once, use it everywhere:

```
dreamscaper_sub( $pro_id )             → row from dscp_subs (creating a default if missing)
dreamscaper_plan( $pro_id )            → resolved plan definition: flags + limits
dreamscaper_sub_stage( $pro_id )       → '' | notice | reminder | restricted | readonly | suspended
dreamscaper_pro_can( $pro_id, $feat )  → bool, respecting plan AND stage
dreamscaper_pro_limit( $pro_id, $key ) → [ 'used' => n, 'limit' => n, 'left' => n, 'resets' => date ]
dreamscaper_pro_spend( $pro_id, $action, $n = 1 ) → atomically deducts AI credits / plan count,
                                         or returns WP_Error 402 (uses a single UPDATE … WHERE left >= n)
dreamscaper_pro_gate( $feat, $kind = 'write' ) → WP_Error 402/403 or the $pro row — first line of
                                         every protected REST callback
```

The `$kind` argument maps each action to a stage rule:

| `$kind` | Blocked at |
|---|---|
| `read`, `export`, `billing` | never |
| `costly` (AI, plan generation, credit/storage purchase, large upload, AI/marketing automation) | `restricted` and later |
| `write` (create/edit records, ordinary uploads) and `send` (email, SMS, proposals, invoices) | `readonly` and later |

The default stage rules match B4.2. The table is owner-editable in Settings → Plans → Non-payment policy.

- Every existing `/crm/*` route gets `dreamscaper_pro_gate()` with the right `$kind`. Read routes stay open at every stage.
- `402 Payment Required` covers both "your plan doesn't include this" and "your account is restricted/suspended". The response body names the feature, the tier needed or the stage, and the restoration link, so the UI can show the right message.
- The site owner (`manage_options`) bypasses all of it. `comped` accounts bypass billing stages but still respect their plan's limits, unless comped at the top tier.
- Cache the resolved plan and stage once per request. Never query them inside a loop.
- Homeowner-facing endpoints (`/crm/pros`, `/crm/lead`, `/crm/request`, `/c/send` to a pro) check `dreamscaper_pro_listed( $pro_id )`, which is false from `readonly` onward. Token endpoints (`/crm/sign`, `/crm/pay`) **never** check subscription state.

## B6. Admin and contractor billing screens

**Contractor → Billing**, built as a guided page, not a settings dump:
- the current plan and status, in one sentence ("You're on Professional — everything is running normally")
- the current stage, if any, with what it means and the single fix button
- usage meters for employees, crews, AI credits, landscape plans, storage and email sends
- the next invoice date and amount
- the payment method (via the Stripe Customer Portal)
- invoice history with PDFs
- a billing-SMS opt-in
- upgrade/downgrade, with a preview of exactly what changes and a one-line proration explanation
- cancel, with export offered
- a plain-English comparison of all four tiers, with Professional marked **Most Popular**

**Upgrade nudges that help rather than nag:**
- At 80% of any limit, suggest the cheapest tier that removes it ("You've used 4 of 5 employees. Business allows 15 — $120/month more.").
- When a contractor taps a locked feature, show what it does and what it would have done with their own data where possible ("AI Quoter would have priced these 6 requests automatically").
- Show each nudge once per limit per period.

**Admin → DreamScaper → Contractors:**
- the existing approval queue
- for each contractor: plan, status, stage and day count, trial state, MRR, last payment and failures
- owner actions, each logged with a reason: change plan, comp, extend trial, extend grace (push the stage clock back), suspend manually, restore, grant an exceptional second trial, mark for deletion
- a summary: subscribers by tier, MRR/ARR, trials running, trial conversion rate, accounts at each non-payment stage, recovered revenue (payments that succeeded after a failure), suspended accounts and churn

**Admin → DreamScaper → Plans:**
- tier names, badges, prices (monthly and annual), Stripe price IDs
- every limit and every feature flag
- the AI credit cost table and the fair-use ceilings
- trial allowances
- the non-payment stage days, the stage rules and the large-upload threshold
- the retention period and the reminder schedule

Changes apply to new subscriptions immediately and to existing ones at renewal, never retroactively mid-period. Policy timing changes apply to failures that start after the change.

## B7. Compliance, honesty and the things that get a business in trouble

- Disclose auto-renewal, price, billing date and cancellation method before the card is taken, on the same screen as the button, in plain language.
- Email a receipt for every charge, and a reminder **7 days before every annual renewal**.
- Cancellation must be as easy as signing up: in-app, no phone call, no retention maze.
- Billing SMS goes only to contractors who opted in, honours STOP/START via `dreamscaper_sms()`, and respects quiet hours.
- Keep sales tax handling configurable (Stripe Tax if enabled), and never make tax determinations on the contractor's behalf.
- Never store raw card data. Stripe only. Store the customer id, subscription id and payment-method fingerprint, nothing else.
- Publish the non-payment policy (the B4.1 table in plain English), the fair-use definition and the data retention and deletion policy in-app, where contractors will actually see them, and link them from the pricing page.
- Disclose device fingerprinting for fraud prevention in the privacy policy.

---

# PART C — THE CONTRACTOR BUSINESS OPERATING SYSTEM

Everything below is the specification for what the contractor is paying for. Build it **into** DreamScaper's existing data model, not beside it. Every feature must respect Part B's tier gating. Every area must obey Part A4 and explain itself.

## C0. The core design principle

The entire system revolves around one lifecycle:

**LEAD → CUSTOMER → PROPERTY → PROJECT → DESIGN → ESTIMATE → PROPOSAL → APPROVAL → SCHEDULE → JOB → EMPLOYEES → MATERIALS → COMPLETION → INVOICE → PAYMENT → ACCOUNTING → TAX DATA → REVIEW → REPEAT BUSINESS**

**No information is ever entered twice.** A customer types their address once and it becomes the customer record, the property record, the service location, the map pin, the tax/service location, the job location, the scheduling location, the crew's navigation destination, the project history and a marketing segmentation attribute. An approved estimate becomes a job without anyone recreating it. DreamScaper's existing `clients` / `props` / `quotes` / `visits` / `invoices` chain already does the first half of this — extend it, don't fork it.

## C1. Property-centred CRM

Design around **CUSTOMER + PROPERTY + PROJECT HISTORY**, not customer alone. Every property record holds: customer(s), address, GPS/map location, measurements, aerial imagery, photos, uploaded documents, previous jobs, current jobs, recurring services, designs, estimates, proposals, invoices, payments, communications, notes, warranties, equipment and access information, gates and access codes (securely stored, never public), irrigation details, landscape features, service preferences, crew notes, and profitability history.

One customer may own multiple properties. One property may have multiple contacts (spouses, property managers, tenants, HOAs).

## C2. Universal search

One global search box that searches customer name, address, phone, email, invoice number, estimate number, proposal number, job number, transaction, payment, employee, project, service, date, amount, material, vendor, note, keyword, tag, property and status. It must be fast — indexed, debounced, server-side, paginated.

Support natural-language queries routed through the AI assistant:
- *"Show me all unpaid invoices over $1,000 from customers in Farmington."*
- *"Find the customer who had a patio installed last summer."*
- *"Show me all jobs completed last September that lost money."*
- *"Show me customers who haven't used us in 12 months."*
- *"Find all customers who spent more than $5,000 last year."*

Include filters, saved searches, advanced search, sorting, bulk actions, export, customisable columns and saved views.

## C3. Accounting

Track **income**: invoices, deposits, progress payments, final payments, recurring payments, other income.
Track **expenses**: materials, equipment, fuel, repairs, maintenance, payroll, subcontractors, advertising, insurance, software, rent, utilities, office, vehicle, miscellaneous.

**Job-level accounting:** every transaction optionally links to customer, property, project, job, service, employee, material and vendor — so the contractor sees **revenue, direct costs, labour, materials, overhead allocation, gross profit, gross margin %, net profit** for a single job and for the whole company.

## C4. Tax data extraction

Organise, don't advise. **Do not pretend to replace a CPA.** Automatically categorise income, expenses, vendor payments, subcontractor payments, equipment purchases, vehicle expenses, advertising, insurance, software, utilities, rent, payroll, interest and other deductible categories. Produce tax-period reports filterable by tax year, quarter, category, vendor, project, customer and payment method. Accountant-ready exports in CSV, Excel, PDF and accounting-system-compatible formats, including transaction, income, expense, contractor/subcontractor and 1099-organisation reports. Flag questionable or uncategorised transactions for human review. **Never make a legal or tax determination that requires professional judgement.**

## C5. Transaction centre

A unified ledger. Every transaction carries date, amount, type, customer, property, project, job, category, vendor, payment method, status, attachments, notes, receipt, accounting category and tax category. Users can search, filter, sort, edit, categorise, attach receipts, split transactions, export, reconcile and bulk-categorise.

## C6. Receipt and document AI

Photograph or upload receipts, invoices, bills, vendor statements, purchase orders and contracts. AI extracts vendor, date, amount, tax, line items, payment method, category, project, customer and probable tax category — then **presents the result for confirmation before anything financial is committed.** Usage counts against the tier's monthly allowance.

## C7. Automation engine

A visual, no-code **WHEN → IF → THEN** builder, with advanced mode for power users.

- **New lead arrives** → create customer, lead, property; send confirmation; notify contractor; create follow-up task; assign salesperson.
- **Estimate created** → send proposal.
- **Proposal unviewed for 2 days** → send reminder.
- **Proposal approved** → create job; request deposit; schedule; notify contractor and crew; confirm with customer.
- **Job completed** → request customer approval; generate invoice; request payment; request review; update history.
- **Mowing season begins** → generate the recurring schedule.

Rule count is tier-limited. AI-powered and marketing automations are queued (never deleted) from the `restricted` non-payment stage, and all automations stop from `readonly`; customer-protecting automations (appointment reminders, receipts) keep running until `readonly` (B4.2). On restoration, anything overdue goes to the Catch-up review queue.

## C8. AI business assistant

An assistant that understands the company's own data and answers: *"What's scheduled tomorrow?" · "Which jobs are most profitable?" · "Who owes me money?" · "Which customers haven't booked this year?" · "What should I follow up on today?" · "Which estimates haven't been approved?" · "How much did we spend on mulch last month?" · "Which employees consistently take longer than estimated?" · "What are my top 20 customers?" · "Where am I losing money?" · "What should I advertise this month?"*

It recommends; it does not execute financially consequential actions without authorisation (see C36).

## C9. Daily command centre

On login: today's appointments, jobs, crew schedules, weather alerts, overdue tasks, unanswered leads, proposals awaiting approval, unpaid invoices, customer messages, material deliveries, equipment issues and urgent notifications.

Plus one button: **"What should I do next?"** — intelligently prioritised by urgency, profitability, customer importance, deadlines, crew availability, weather, route efficiency and revenue opportunity.

## C10. Scheduling

Jobs, estimates, site visits, consultations, crew schedules, equipment reservations, material deliveries, recurring services, vacations, meetings and admin tasks. Drag-and-drop; day/week/month; per-employee and per-crew calendars; route view; recurring jobs; dependencies; travel time; buffer time; automatic rescheduling. Build on the existing `visits` table.

## C11. Automatic customer communication

Booking confirmation · running late · weather delay · job reminder · crew en route · job completed · invoice ready · payment received · review request. Every message fully customisable. Email, SMS, push and portal notification. Every communication tracked against customer, property and job.

## C12. Communication centre

A unified inbox combining email, SMS, website messages, portal messages, internal notes and phone-call records where integrations allow. Every communication auto-associated with the right customer, property and job. This is the same inbox built in Part A1 — one system, not two.

## C13. Mass email marketing

Build lists by location, service, previous purchase, spending, last service date, customer type, tags, property type, inactive status, lead status and completed projects. Campaign examples: spring (used fall cleanup, no spring booked), mulch (last mulched 10–14 months ago), lawn care (mowing-only customers), reactivation (nothing in 12 months).

Templates, drag-and-drop editor, HTML, personalisation, images, scheduling, automated campaigns, unsubscribe management (mandatory, honoured instantly) and campaign analytics: delivered, opened, clicked, replied, converted, **revenue generated**. Send volume is tier-limited.

## C14. Advertising management

Track campaigns from Google, Facebook/Instagram, local advertising, direct mail, email, referral programmes, website, yard signs and door hangers. Track the whole chain — **advertising cost → leads → estimates → sales → revenue → profit** — not just leads. ($1,000 spend → 100 leads → 20 estimates → 8 customers → $24,000 revenue → $12,000 gross profit.) This is how the contractor learns which marketing actually makes money.

## C15. Templates

Everything important is template-driven: estimates, proposals, invoices, contracts, emails, SMS, job instructions, crew checklists, inspection forms, change orders, receipts, reports, campaigns and customer notifications. Drag-and-drop fields, logo, colours, fonts, images, signatures, custom fields, conditional sections, pricing tables and custom language. Dynamic variables: `{{customer_name}}`, `{{property_address}}`, `{{project_total}}`, `{{scheduled_date}}`, `{{employee_name}}` — reuse the existing `dreamscaper_merge()` / `dreamscaper_crm_codes()` mechanism.

## C16. Complete business customisation

No hard-coded assumptions. A **Business Settings / Configuration Centre** where the contractor configures services, pricing, labour rates, markup, tax rates, payment terms, deposits, employees, roles, permissions, workflow stages, job statuses, customer statuses, lead sources, tags, fields, templates, notifications, automations, scheduling rules, business hours, service areas, seasons, cancellation policies, contracts, proposal language and invoice language — without a developer.

## C17. Employees and roles

Individual accounts with role-based permissions: owner, administrator, office manager, estimator, salesperson, crew leader, technician, labourer, subcontractor.

- **Crew member** sees today's jobs, property information, job instructions, photos, schedule, navigation and required tasks. Never company financials, payroll or other customers' financial data.
- **Crew leader** additionally clocks crew in/out, completes checklists, uploads photos, reports materials used and problems, and marks completion.
- **Owner** sees everything.

Seats are tier-limited.

## C18. Employee mobile experience

Today's schedule, navigation, clock in/out, job instructions, designs, before/after photo upload, checklists, material recording, damage reports, requests for additional work, messaging the office, delay reporting and marking jobs complete. **Extremely simple** — a crew member should need no training. Offline-tolerant where practical: queue actions and sync when signal returns.

## C19. Employee performance and profitability

Track estimated vs actual labour, productivity, jobs completed, callbacks, complaints, compliments, attendance, overtime, revenue generated and profitability. **Frame it as improvement, not surveillance:** surface training opportunities, inefficient processes, equipment problems, unrealistic estimates and exceptional employees.

## C20. Inventory and materials

Track mulch, stone, plants, pavers, fertiliser, seed, equipment and consumables, with quantity, cost, vendor, location and reorder point. Jobs reserve materials. Warn: *"Three upcoming jobs need 18 yards of mulch; you have 10."*

## C21. Vendors

Vendor records with contact, pricing, invoices, payment history, products, purchase history and lead times. Compare vendor pricing.

## C22. Profitability intelligence

A financial scorecard on every job: quoted revenue, actual revenue, estimated labour, actual labour, estimated materials, actual materials, equipment cost, subcontractor cost, gross profit, gross margin. Compare by service, employee, customer, neighbourhood, season, lead source and project type, and surface the conclusions: *"Your average mulch installation runs a 47% gross margin."* / *"Your average small retaining wall runs 18%."*

## C23. Estimate learning engine

On completion, compare **estimate vs actual** and use the data to improve future estimates (estimated 10 hours, actual 13.5 → similar projects likely need more). **Changes to pricing rules always require the contractor's approval.**

## C24. Weather intelligence

Integrate weather into scheduling: rain delays, extreme heat, snow, freezing conditions; suggest schedule changes; notify customers; reorganise routes. **Never promise a customer anything without contractor-configured rules.**

## C25. Route optimisation

Optimise by geographic proximity, crew availability, equipment, job duration, travel time and customer time windows, and show the day as a readable route (8:00 Farmington → 9:30 Avon → 11:00 West Hartford → 1:30 Farmington). Always allow manual override.

## C26. Customer satisfaction

After jobs: request a rating, request a review, ask for feedback, identify problems. A poor rating creates an **URGENT CUSTOMER RECOVERY TASK**. **Never automatically ask an unhappy customer for a public review.**

## C27. Retention engine

Surface future revenue: *"This customer hasn't scheduled fall cleanup." · "This property hasn't had mulch in 13 months." · "Weekly mowing last year, not renewed." · "$8,200 last year, no current project."* Each with a suggested action and a one-tap way to act on it.

## C28. Customer lifetime value

Total revenue, gross profit, number of jobs, services purchased, years as a customer, average annual spend and referral value. Identify high-value customers.

## C29. Referrals

Automated referral campaigns tracking referring customer, referred customer, reward, completed job and revenue, with configurable rewards.

## C30. Review management

Request reviews automatically after successful jobs. Track requested, received, rating, platform and feedback. Integrate with review platforms where APIs permit. Build on the existing `reviews` table and the Dream-to-Reality score.

## C31. Documents

A document repository on every customer, property and project: contracts, proposals, designs, invoices, receipts, photos, warranties, permits, insurance documents, employee documents and vendor documents. Permissions and secure storage; unguessable file names (the existing `dreamscaper_crm_store_image()` pattern); never world-readable directory listings.

## C32. Dashboards

Customisable per role. **Owner:** revenue, profit, cash flow, pipeline, outstanding invoices, jobs, employees, marketing ROI. **Office manager:** leads, scheduling, communications, invoices, overdue tasks. **Crew leader:** today's jobs, assignments, materials, instructions. **Salesperson:** leads, estimates, proposals, conversion rate. Every user can customise their own.

## C33. Notifications centre

One unified system — email, SMS, push, in-app — where each user chooses **what**, **when** and **how** they are notified. Avoid notification overload by default. This is the same system as Part A1.3.

## C34. Mobile-first

Excellent on desktop, tablet and phone. Usable with gloves, in sunlight, on poor connectivity, by someone with limited technical knowledge. Offline support where practical.

## C35. Security and audit trail

Role-based access, permissions, authentication, secure financial data, audit logs, encryption of sensitive fields, backups, session management and activity history. Record **who changed what, when, from what value to what value** — especially for prices, estimates, invoices, payments, customer information, employee permissions, accounting categories, schedules and subscription status. Build on the existing `activity` table.

## C36. AI confirmation levels

- **Low risk — execute automatically:** create reminders, organise notes, categorise non-finalised data, suggest schedules, draft emails, summarise jobs.
- **Medium risk — ask for confirmation:** send customer communication, change a schedule, modify an estimate, reorder materials.
- **High risk — require explicit approval:** charge a customer, refund a payment, delete financial records, change accounting records, submit tax information, make legally binding commitments, permanently delete data.

## C37. AI administrative assistant

Every morning: *"Good morning. You have 7 priority items today."* — e.g. follow up on 3 unapproved estimates; reschedule 2 jobs for rain; invoice 4 completed jobs; order mulch for Thursday; reply to 2 customer messages; renew 3 recurring mowing customers; follow up a $12,000 proposal. Each item offers **Do it · Review first · Ignore**, always respecting permissions and C36.

## C38. Profit protection

Detect and alert on underpriced estimates, excessive labour, material price increases, unpaid invoices, excessive travel time, repeated callbacks, low-margin services, excessive discounts, unbilled change orders, overtime and material waste. *"⚠️ This job has used 87% of its estimated labour budget but is only 60% complete."*

## C39. AI design and estimating

Integrate the existing DreamScaper studio as the design engine: aerial imagery, multiple ground-level photographs, drone imagery where available, property measurements, boundaries, house footprint, existing landscape, AI-assisted design, dimensionally accurate 2D plans, plant and material libraries, quantity takeoffs, automatic estimates and 3D visualisation.

Workflow: **PROPERTY CAPTURE → SITE PLAN → DESIGN → MEASUREMENTS → QUANTITIES → ESTIMATE → PROPOSAL.**

**Never present an AI visualisation as a surveyed plan.** Label everything either **AI ESTIMATE** or **CONTRACTOR-VERIFIED MEASUREMENT**, visibly, on screen and on every printed document.

## C40. Automatic quantity takeoff

From a design, calculate square footage, linear footage, cubic yards, plants, trees, shrubs, pavers, wall blocks, edging, topsoil, seed, sod, mulch, stone, drainage pipe and other materials — connected to the pricing database. The existing `takeoff.js` is the starting point.

## C41. Change orders

Contractor taps **Add Work**, selects the service or material, the system prices it, the customer receives an approval request, the customer approves — and the job, the schedule and the invoice all update automatically. A permanent record is kept of what changed, when, and who approved it.

## C42. Customer portal

Customers can view their property, view and approve designs, view estimates, approve proposals, sign contracts, pay deposits, view the schedule, receive updates, message the contractor, view photos, approve change orders, view and pay invoices, request service and leave reviews. This is the existing **My Projects** area — extend it.

## C43. Integrations

Architect for accounting software, payment processors, banks, email providers, SMS providers, calendars, mapping, weather, advertising platforms, review platforms, cloud storage, payroll, tax software, CRM imports and website forms. **Use an integration layer. Never couple the application tightly to one provider.**

## C44. Import / export

Import existing data — CSV and Excel: customer lists, contacts, properties, transactions, services, pricing, employees — with column mapping, a preview, duplicate detection and a dry run. Export everything, always, on every tier, in every status. **No contractor is ever trapped in the platform.**

## C45. User experience principle

**Minimise clicks.** Whenever the system has enough information to do something, it does it. Never make a contractor walk create customer → create property → create lead → create estimate → create job → create schedule. Creating one thing creates the connected records intelligently.

## C46. The question the product answers

At any moment the contractor opens DreamScaper and immediately knows: **What needs my attention? · What's happening today? · Where is my money? · Which jobs are profitable? · Who owes me money? · Which customers need attention? · What should I sell next? · What should my crew be doing? · What should I do to increase profit? · What can the system do for me automatically?**

## C47. Architecture requirement

Do not build isolated features. Build a unified data model where every major object connects: Business, User, Employee, Role, Customer, Contact, Property, Lead, Opportunity, Service, Product, Material, Vendor, Design, Estimate, Proposal, Contract, Project, Job, Schedule, Task, Time Entry, Expense, Transaction, Invoice, Payment, Change Order, Communication, Campaign, Automation, Document, Asset, Vehicle, Equipment, Review, Referral, **Subscription, Plan, Thread, Message, Notification**.

Map each one to DreamScaper's existing tables first and only create a new table when nothing fits. Define the relationships before implementing features.

Prioritise, in order: **data integrity, ease of use, automation, profitability, customer experience, employee usability, customisation, security, scalability, maintainability.**

Before implementing any major feature, answer: What problem does it solve? What data does it need? What does it connect to? What can be automated? What needs human approval? How does it affect revenue, profitability, customer satisfaction and administrative workload?

Continuously look for chances to eliminate duplicate entry, automate repetition, prevent missed revenue, prevent scheduling mistakes, improve communication, increase retention and improve job profitability.

**Powerful underneath. Extremely simple on the surface.** The finished system should feel less like business software and more like a **digital operations manager for a contractor.**

## C48. Extensibility

Design so future modules drop in without a rebuild: financing, equipment management, fleet management, inventory, payroll, insurance, licensing, contractor marketplace, subcontractor management, AI phone receptionist, AI sales agent, AI estimating, advanced landscape design, drone analysis, property intelligence, customer acquisition marketplace.

---

# PART D — HOW TO BUILD IT

## D1. Phases — ship working software at the end of each one

| Phase | Ships | Contains |
|---|---|---|
| **1** | 2.7.0-alpha | Schema + migrations (threads, thread_users, messages columns, subs, sub_events, trials, socials). Gating framework (`dreamscaper_pro_can` / `_gate` / `/crm/capabilities`). Nothing user-visible breaks. |
| **2** | 2.7.0-beta1 | Messages area: threads, inbox UI, contractor inbox, context cards, attachments, alerts, notification preferences, and the A3c template editor (alerts depend on it). |
| **3** | 2.7.0-beta2 | Project Request wizard, contractor-defined intake questions, Request Brief card, estimate pre-fill, and the A3b shared calendar + reminders (site visits booked from the brief land on both calendars). |
| **4** | 2.7.0-beta3 | Subscriptions: Stripe Billing, four tiers, AI-credit / plan / storage / seat / crew metering, trial + ledger + anti-abuse, the staged non-payment policy (notice → reminder → restricted → read-only → suspended), automatic restoration, Catch-up review queue, billing screens, admin screens. |
| **5** | 2.7.0-rc | Contractor socials (8 networks, per-link on/off, every surface, review routing, broken-link check), the self-explaining UI pattern applied app-wide, Capability Map, teaching empty states, upgrade nudges. |
| **6+** | 2.8, 2.9, 3.0 | Part C in priority order: accounting & transactions → employees & crew app → automation engine → profitability intelligence → marketing & advertising → AI assistant → inventory & vendors → integrations. |

For each phase give: the complete files, the migration, the settings added, the admin screens, and the test plan.

## D2. Acceptance tests — state the expected result for each

**Messaging**
1. Homeowner messages a contractor; contractor sees it in-app, by email, and by SMS if enabled, within the configured window.
2. Thread context card links correctly to the right quote, property and visit.
3. Unread counts are correct after reading on a second device.
4. Blocked user cannot send. Rate limit trips at the configured threshold.
5. Old 2.6.0 DM history is intact and readable after migration.

**Project Request**
6. A full request creates exactly one client, one property, one `request`-status quote and one thread — no duplicates on double-submit.
7. Starting the estimate pre-fills from the brief and takeoff with no re-keying.
8. A contractor's custom intake question appears for the right service and its answer is stored and displayed.
9. A dropped connection mid-wizard resumes with answers intact.

**Trial and billing**
10. A contractor starts a trial. A second account with a new email but the same phone is refused. Same card, refused. Same business name + address, refused.
11. Deactivating and reactivating the plugin does not restore a consumed trial.
12. Deleting the WP user and re-registering does not restore a consumed trial.
13. Editing `trial_ends` client-side has no effect; API calls past expiry return 402.
14. Day-31 conversion charges the chosen plan correctly and status becomes `active`. A failed day-31 charge enters the non-payment policy at Day 0 — no silent extension.
15. Day 0: a failed payment sets `past_due`/`notice`, shows the unobtrusive banner, sends one email (and one SMS only if billing SMS is opted in), and every feature still works.
16. Day 4: banner escalates with the correct `{suspend_date}` in the contractor's timezone; second email sent; access unchanged.
17. Day 8 (`restricted`): AI Quoter, AI actions, plan generation, credit/storage purchases, uploads over the threshold and AI/marketing automations return 402 with a restoration link; creating estimates, sending proposals and invoices, appointment reminders and exports still work.
18. Day 11 (`readonly`): every write and send returns 402; reads, export, billing and payment work; the contractor disappears from Find a Contractor; new requests and new threads to them are refused server-side with a friendly message to the homeowner.
19. Day 14 (`suspended`): the Suspended — Payment Required screen shows; all data is intact and exportable; a previously sent proposal is still signable and a previously sent invoice still payable, with the payment recorded and paid out.
20. Running the stage cron twice in the same hour sends no duplicate messages; stages never skip or regress incorrectly.
21. Paying at any stage restores full access within one webhook (or the next reconciliation pass), re-lists the contractor, resumes automations, and puts overdue sends in the Catch-up review queue instead of firing them.
22. A missed webhook is corrected by the daily reconciliation pass, in both directions.
23. At 90 days suspended the account is flagged `deletion_eligible` and nothing is deleted; deletion only happens via an explicit, logged action after the 30- and 7-day warnings and an export.
24. Downgrading over a limit retains all data, moves extra employees to read-only and archives extra crews, and deletes nothing.
25. AI credits deduct atomically: two simultaneous AI calls with 1 credit left succeed exactly once. A failed generation refunds its credit/plan count.
26. Each tier's employee, crew, credit, plan and storage limits block creation at the cap and warn at 80%; Pro+ landscape plans alert the site owner at the fair-use ceiling without blocking.
27. Social links: a pasted handle, a full URL and a URL with tracking parameters all normalise to the same canonical link; a wrong-network URL is rejected; toggling a link off removes it from the profile, directory card, proposal, invoice, portal, community profile and email footer at once, and from `dreamscaper_pro_public()`.

**Tiers and UI**
28. Every tier-gated endpoint rejects direct API calls from an under-tier account.
29. Every section shows its purpose line and its "What can I do here?" panel.
30. Locked features show what they do and the tier needed.
31. No screen interferes with mouse-wheel scrolling.
32. Every new screen works one-handed at 390px wide.

## D3. What to deliver with the code

- Complete files, full paths, ready to paste.
- A changed-files list with a one-line note each.
- The migration plan and what happens to a 2.6.0 site on upgrade.
- New settings and where they appear in the admin.
- The Stripe setup steps the site owner must perform: four products (Starter, Professional, Business, Pro+) each with a monthly and an annual price; Smart Retries on with a retry window that ends before the Day-14 suspension; Stripe's own failed-payment customer emails off (DreamScaper sends them — B4.2) unless the owner chooses otherwise; the Customer Portal enabled for card updates, plan changes and cancellation; and the existing webhook endpoint subscribed to `invoice.paid`, `invoice.payment_failed`, `invoice.payment_action_required`, `invoice.upcoming`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.trial_will_end`, `setup_intent.succeeded` and `checkout.session.completed`.
- `readme.txt` upgrade notice.
- A plain-English summary of what the contractor now gets for their money, written for the sales page.

## D4. Decisions — settled and still open

**Settled by the owner (build to these):**
1. ~~Tiers~~ — **Starter $59 · Professional $129 (Most Popular) · Business $249 · Pro+ $499**, with the employee, crew, AI-credit, storage and landscape-plan allowances and feature split in B2. All editable in Plans.
2. ~~Non-payment policy~~ — **the staged policy in B4**: full access days 0–7, cost-protecting restrictions days 8–10, read-only days 11–13, suspension day 14, deletion eligibility only from 90 days with warnings, instant automatic restoration on payment.
3. ~~Homeowners and unpaid contractors~~ — **homeowners cannot start new interactions with a contractor once that contractor's functionality is shut down** (from `readonly`, B4.4); already-sent proposals and invoices keep working.
4. ~~Social networks~~ — **Google Business Profile, Facebook, Instagram, Houzz, YouTube, Nextdoor, TikTok, LinkedIn**, in that order, each switchable on/off by the contractor and reflected on every surface (A3).
5. ~~Request cap~~ — **homeowners may request quotes from unlimited contractors.**

**Recommended defaults applied — confirm or change:**
6. Annual price = 10× monthly (two months free).
7. Trial = 30 days of Professional, card required up front, trial allowance 100 AI credits and 2 landscape plans.
8. Pro+ "unlimited" landscape plans = fair use, owner alert at 100/month, never a silent block.
9. Feature rows the owner did not specify (SMS from Professional, accounting depth, email-send allowances, inventory from Business, audit retention, automation rule counts) as set in B2.2.
10. Existing 2.6.0 contractors migrate onto the Professional trial with no card required at migration.
11. Retention after suspension or cancellation = 12 months, deletion only by explicit action.

**Still open — ask before building:**
12. Whether marketplace leads are included in every tier or charged per lead, and whether the existing `connect_fee_pct` should apply.
13. David's own operating procedures for each service, to seed the default intake questions — ask him service by service rather than inventing them.

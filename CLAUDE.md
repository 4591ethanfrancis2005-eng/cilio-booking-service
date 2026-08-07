# Cilio — Context for Claude Code

This file exists because Claude Code doesn't share memory with claude.ai chat sessions.
Everything below was established across a long planning/build conversation there — read
this fully before making changes, since a lot of it is "don't redo this" or "don't build
this yet" rather than just background colour.

**This file lives identically in both `cilio-app` and `cilio-booking-service`** (kept in
sync by hand). It has been silently overwritten once already by concurrent edits from two
processes saving at once — see "Hard-won lessons" below. If you're editing this file
while a parallel session might also be touching it, re-read it immediately before you
save, not just at the start of your session.

---

## What Cilio is

B2B SaaS: an AI chat assistant ("Aria") for independent UK dental practices. Core pitch:
fewer missed calls, 24/7 patient responses, out-of-hours enquiry capture. Sells outcomes
(patient capture, missed-call recovery), never the technology — see language rule below.

**Founders:** Ethan Francis (technical co-founder, all dev/infra access) and Shaurya "Shaz"
Tomar (outreach and relationship management only — no dev/infra access, by design, since
Supabase holds real patient data and least-privilege is the deliberate policy).

**Language rule, strict:** never use "chatbot," "AI," or "bot" in client-facing copy —
always "chat assistant," "virtual assistant," or "online assistant."

**Tagline:** "smart enquiries. less noise."

**Brand tokens:** navy `#0c2340`, blue `#2D9CDB`, cream `#f8f6f1`. Fonts in shipped code:
Georgia (headings), Inter/system-ui (body) — used consistently across the landing page,
demo pages, the staff availability screen, and the practice dashboard.

**Pricing (founding-five, locked — do not adjust regardless of build-difficulty
reasoning):** Starter £49/mo, Pro £79/mo per site, multi-site from £39/mo per location
(2+ sites). Setup fees waived for first five clients.

---

## Current business status (as of this handoff)

- **First confirmed pilot client: Dr Swati Maan, Dental Care London, Richmond** (Shaz's
  aunt's practice). This is real, not hypothetical — real patient enquiry data flows from
  day one of the pilot.
- Swati has told Ethan directly that she sees the real value in **scheduling/booking**,
  not just chat. She's meeting **Dentally** next week and may switch to them as her PMS —
  she currently runs **no PMS at all**.
- **T&Cs:** free pilot is **30 days** (not the original 7), starts on signature alone —
  **no Order Form required to begin the pilot**. An Order Form (recording plan and fees)
  is only created if/when she chooses to continue into a paid subscription — Ethan
  deliberately didn't want to pressure her into a commitment up front.
- **T&Cs must be signed before the pilot starts**, not before paying starts — because real
  patient data is processed from day one of the free pilot, not just once she's paying.
- **Still open/unresolved in the T&Cs:** business address placeholder still blank; entity
  structure (partnership vs. Ltd) not yet finalized — currently drafted as an unincorporated
  partnership between Ethan and Shaz, which was flagged as a real liability exposure given
  real patient data is involved. Recommendation given: incorporate as Ltd before this goes
  live for real. Solicitor review still pending on the whole document.
- Swati/Dental Care London go-live is happening in **two deliberate phases**, not
  one: (1) the plain chat assistant (lead capture only, `booking_enabled = false`)
  goes live first; (2) booking is switched on separately, later. **UPDATE: the
  access-control gate this was waiting on is now built and tested** (per-practice
  passcode + session isolation on the dashboard, plus a shared service key locking down
  `cilio-booking-service` itself — see "What's actually built" below) — **but it is only
  on the `dashboard-development` branch, not merged to `main`, and not deployed.**
  The condition is therefore now: do not enable `booking_enabled` for Dental Care London
  until (a) that work is merged and actually deployed to production, AND (b) Ethan has
  explicitly said to proceed. Both still outstanding — this is still a deliberate
  sequencing decision, not an oversight to "fix" by turning it on early.
- **ICO registration** (£40/yr) not yet completed — should be registered under whichever
  entity type is finalized (partnership vs. Ltd), not registered twice.
- Tidio/Lyro references have been fully removed from the T&Cs (Schedule 3) and from
  internal docs — see tech stack section below for why.

---

## Tech stack — current, correct (do not reintroduce Tidio)

- **`cilio-app`** — Next.js on Vercel, the live chat product. Custom-built widget calling
  the Claude SDK **directly** from API routes (`route.js`, `page.js`, `widget.js`). This
  fully replaced an earlier Tidio/Lyro-based pilot stack, which is retired — if you see any
  reference to Tidio anywhere, it's stale and should be removed/corrected.
- **Supabase** — Frankfurt (EU), one project ("cilio 1") shared across `cilio-app` and
  `cilio-booking-service`. Confirmed and fixed this session — see "Hard-won lessons."
- **Firecrawl** — one-time scraping of a client's website at onboarding, not continuous.
- **Verified facts always override scraped content.** Facts live in a plain, schema-free
  `Label: value` text file per client. This is the core trust mechanism of the whole
  product — never let scraped/inferred content override something a client has explicitly
  confirmed. One label is special-cased: `Auto-bookable reasons: check-up, consultation`
  also syncs `clients.auto_bookable_reasons` (see booking whitelist below) — everything
  else in the facts file stays schema-free free text.
- **Domains/infra:** `cilio.co.uk` (Netlify, landing page, repo `cilio-site`),
  `app.cilio.co.uk` (Vercel, repo `cilio-app`), `admin@cilio.co.uk` (Google Workspace),
  Resend (transactional email), UptimeRobot (monitoring), Calendly (free tier, sufficient).
- **New required environment variables** (both apps, local `.env`/`.env.local` only so
  far — **not yet set in either production hosting environment**, needed before deploy):
  - `CILIO_INTERNAL_API_KEY` — shared secret, both apps, must match exactly. Every request
    cilio-app makes to cilio-booking-service must carry it or gets rejected (503 if the
    service itself has no key configured — fails closed, not open).
  - `DASHBOARD_SESSION_SECRET` — cilio-app only. Signs dashboard login sessions. Rotating
    it invalidates every dashboard session instantly — the "log everyone out now" lever.
  - `NEXT_PUBLIC_BOOKING_API_URL` — cilio-app only, pre-existing. Where to reach
    cilio-booking-service.
- **Outstanding infra blockers before any client goes live for real:** Supabase Pro
  upgrade (free tier auto-pauses after ~7 days idle — would silently kill a live client's
  widget), Vercel Pro upgrade, and now also: setting the two secrets above in production,
  and deciding where `cilio-booking-service` itself is actually hosted (not yet deployed
  anywhere — local dev only).

### Repo locations

All repos live inside OneDrive, per Ethan's explicit choice (aware this contradicts an
earlier stated rule about keeping git repos outside OneDrive to avoid sync-corruption —
he chose to proceed inside OneDrive anyway for the newer repos; worth being extra careful
about not editing the same file from two processes at once given that known risk — this
bit CLAUDE.md itself this session, see below):

```
C:\Users\Ethan\OneDrive\cilio-app              — the live chat product + dashboard
C:\Users\Ethan\OneDrive\cilio-booking-service  — shared booking engine (NOT a git repo — see below)
C:\Users\Ethan\OneDrive\cilio-voice            — Stage 3, dormant, do not build into yet
C:\Users\Ethan\OneDrive\cilio-site             — landing page
```

**`cilio-booking-service` has no git history at all.** Confirmed this session — `git
status` there returns "not a git repository." Every change to that repo this session
exists only on disk, with no commits, no branches, no way to diff or revert. Worth
fixing before it grows much further.

---

## Staging plan

- **Stage 1** — existing chat product. Live.
- **Stage 2** — booking engine, PMS integrations, WhatsApp, dashboard, chat-assistant
  booking. **Booking engine, chat-assistant booking, and the dashboard are now built and
  tested** (see below) — **on feature branches, not merged to `main`, not deployed.**
  PMS integrations and WhatsApp remain blocked on external access (see "not built yet").
- **Stage 3** — voice (Twilio + Retell telephony). Deliberately deferred. `cilio-voice`
  repo exists but is empty/dormant — do not start building here without an explicit
  instruction that Stage 3 has actually been reopened.

**5-client gate:** the original plan was not to start Stage 2 build work until Cilio had
5 paying clients. That gate was consciously crossed early, on the reasoning that Swati's
explicit demand for scheduling is a real signal, not speculative building — and that the
native adapter (see below) has no wasted-effort risk even if she leaves for Dentally,
since it benefits any future client with no PMS. Worth knowing this was a deliberate,
reasoned exception, not a default to repeat casually for other features.

---

## Architecture

```
cilio-app (chat + dashboard)                 cilio-voice (Stage 3, not started)
        │  book_appointment tool call                 │
        │  x-cilio-service-key on every request        │
        ▼                                             ▼
              cilio-booking-service (shared booking engine)
              requires x-cilio-service-key on every route (middleware.js) —
              fails closed (503) if its own key isn't configured
              ┌─────────────────────────────┐
              │ checkAvailability()          │
              │ book()                       │
              │ reschedule()                 │
              │ cancel()                     │
              │ listAppointments()  ← new, powers the dashboard              │
              ├─────────────────────────────┤
              │ CilioNativeAdapter  ← built & tested, no external dependency
              │ DentallyAdapter     ← not built, gated on partner access
              │ SOEAdapter          ← not built, gated on partner access
              │ R4Adapter           ← not built, gated on partner access
              └─────────────────────────────┘
                        │
              Supabase (same project "cilio 1", EU/Frankfurt)
```

**Why this shape:** chat, WhatsApp, and eventually voice must never have two different
pictures of calendar availability — one booking engine, multiple thin clients. `cilio-app`
itself should only ever need ONE new tool call added (`book_appointment`) — don't refactor
anything else in it for this work. **This principle now also covers the dashboard**: it
reads bookings through `listAppointments()` via the adapter layer, never a raw Supabase
query, so it stays correct once a PMS-backed client exists.

**Access control layering (new this session):** three independent layers, deliberately
redundant —
1. `cilio-app`'s dashboard pages sit behind a per-practice passcode session (server
   component gate, `dashboard/[slug]/layout.js`).
2. Every `/api/dashboard/*` route in `cilio-app` independently re-derives which practice
   it's serving from the signed session cookie — never from a client id in the request.
3. `cilio-booking-service` itself now requires the shared `x-cilio-service-key` on every
   request, so even bypassing cilio-app entirely doesn't reach patient data.

---

## What's actually built and tested

All of this has been run against the real shared Supabase project ("cilio 1", not a
separate throwaway one — see "Hard-won lessons"), including deliberate adversarial
testing (double-booking races, cross-practice access attempts, token forgery).

### Native booking adapter (foundational, pre-dates this session's later work)
- `sql/schema.sql` — `practitioners`, `availability_rules`, `bookings`,
  `booking_audit_log` tables, plus `pms_type` on `clients` (`native`/`dentally`/`soe`/`r4`,
  defaults `native`).
- **Double-booking prevention is a real Postgres exclusion constraint**
  (`EXCLUDE USING gist`, requires `btree_gist`), not application-level locking. If you
  ever touch the `bookings` table schema, re-verify this constraint still exists and
  still works before trusting anything built on top of it.
- `lib/adapters/CilioNativeAdapter.js` — `checkAvailability`, `book`, `reschedule`,
  `cancel`, and now `listAppointments` (date-range + optional practitioner filter, powers
  the dashboard). Cancel sets `status = 'cancelled'`, never hard-deletes.
- `lib/bookingService.js` — single entry point, resolves `pms_type` and delegates. Only
  `native` registered so far.
- API routes under `cilio-booking-service`: `GET /api/booking/availability`,
  `POST /api/booking/appointments`, `GET /api/booking/appointments` (new — date range +
  optional practitioner, for the dashboard), `PATCH /api/booking/appointments/{id}`,
  `GET`/`POST /api/booking/practitioners`, `PATCH /api/booking/practitioners/{id}`,
  `GET`/`PUT /api/booking/availability-rules`, `GET /api/booking/client-lookup`.
- **`client-lookup` decision (resolved, lost once to concurrent edit, restating here):**
  keep it as its own route — do NOT replace with cilio-app's own slug→client lookups.
  cilio-app has three of those (`w/[slug]/page.js`, `api/widget-config`, `api/chat` GET),
  all tuned for chat/widget display fields, not booking's needs. Consolidating would gain
  nothing. This route is now itself mostly superseded for dashboard purposes by the new
  session-authenticated `/api/dashboard/client` — but is still used directly by anything
  that isn't behind the dashboard's session.
- Staff availability screen — `cilio-app/src/app/dashboard/[slug]/availability/page.js`.

### Chat-assistant booking (`book_appointment` tool)
- **Wired into `/api/chat`** — Aria can check real availability and create a confirmed
  booking mid-conversation, not just capture a lead. Gated behind
  `clients.booking_enabled` (default `false`) AND the client having ≥1 practitioner set
  up — a client with neither pays **zero** extra latency or behaviour change, verified
  explicitly (booking_enabled=false clients: no fetch to booking-service fires at all,
  not even a skipped/caught one).
- **Auto-bookable reasons whitelist** — `clients.auto_bookable_reasons` (text array,
  empty = no restriction). Fuzzy word-overlap matching, no external library. Set via a
  special-cased facts-file label (see Tech Stack above). Reason not on the list → Aria
  falls back to `capture_lead` with a note the practice will call to arrange it —
  enforced server-side, not just prompted.
- **New-patient vs existing-patient flows are genuinely separate, not merged:**
  - New patients: practitioner auto-selected, **name never revealed** — not in the offer,
    not in the confirmation.
  - Existing patients: reason asked as tappable buttons (when a whitelist exists),
    then "preferred dentist or anyone fine?" — "anyone" reuses the hidden new-patient
    flow exactly; a named choice reveals that name in the confirmation and, if busy,
    gets TWO kinds of real alternatives (that dentist's next slots over ~2 weeks, AND
    any other dentist free at the exact original time).
- **Patient confirmation email** — separate from the practice-notification email,
  non-blocking (a failed send never fails the booking — verified with a deliberately
  invalid address).
- `cilio-app/src/lib/booking.js` — HTTP client to the booking service. Includes
  DST-aware London-time conversion (`londonWallTimeToUTCISO`) and pre-formatted,
  ready-to-copy date/time strings handed to the model (`formatLondonTimeShort`,
  `formatLondonDateOrdinal`) — the model is never asked to do timezone math itself,
  in either direction. See "Hard-won lessons" for why this matters.

### Practice dashboard (`cilio-app/src/app/dashboard/[slug]/`)
- **Day overview** — 7-day rolling bookings/leads counts (plain counts, no £ — see
  below), a day-navigable appointments table (dentist as a colour-coded pill, status as
  green/amber), recent leads list.
- **Per-dentist weekly calendar** — Mon–Sat grid, hourly rows, three distinct cell
  states (not working that day / working but outside hours that day, shown as diagonal
  stripe / genuinely free), booked slots shown with real patient names (correct here —
  this is staff's own view, unlike the patient-facing hidden-identity flow above).
- New `GET /api/booking/appointments` on `cilio-booking-service`, added through the
  adapter layer (`listAppointments`), not a raw table query — see Architecture.
- All dashboard-related dates/times use Europe/London extraction (`Intl.DateTimeFormat`),
  never raw `getUTCHours()` — see "Hard-won lessons," this was a real bug caught before
  shipping.

### Access control (per-practice passcode + session isolation)
- `clients.dashboard_passcode` — scrypt hash only (`node:crypto`, no bcrypt dependency
  added), never plaintext, unique salt per hash.
- Signed, httpOnly, `SameSite=Lax` session cookie (HMAC-SHA256, `node:crypto`), 7-day
  expiry enforced server-side (not just tamper-proofed — a *correctly signed but
  expired* token was forged and confirmed rejected).
- **The isolation guarantee — a session for practice A can never reach practice B's
  data — is enforced by binding the practice slug inside the signed token** and
  re-checking it on every request; API routes accept no client id from the request at
  all, only from the session. Two routes additionally verify a requested
  `practitionerId` actually belongs to the signed-in practice (closes an IDOR that would
  otherwise let A read or **overwrite** B's working hours).
- Verified with 48 automated adversarial checks (cross-practice page access, id
  injection on every route, IDOR read+write, token forgery, genuine expiry enforcement,
  logout) plus a full manual browser run — all passing. Full detail is in this session's
  conversation transcript if it's ever needed again; not duplicated here.
- `npm run passcode -- --slug <slug> --generate` (or `--passcode "..."` / `--clear`) is
  the entire admin surface — no self-service reset flow for practices yet, deliberately
  (proportionate to a handful of clients).
- Emergency "log everyone out" lever: rotate `DASHBOARD_SESSION_SECRET`. Known accepted
  limitation: logout clears the cookie but doesn't revoke the token server-side (no
  session table) — a captured token would still work until its 7-day expiry. Standard
  trade-off for stateless sessions.

### Service-to-service auth (`cilio-booking-service`)
- `middleware.js`, `matcher: '/api/:path*'` — every route requires `x-cilio-service-key`
  matching `CILIO_INTERNAL_API_KEY`, or gets 401. **Fails closed**: if the service's own
  copy of the key is unset, it 503s everything, including requests bearing what would
  otherwise be the correct key — verified by actually removing the key and confirming
  this, not just reading the code.
- This exists because the dashboard's passcode gate only protects cilio-app's pages —
  before this, `cilio-booking-service` itself had zero auth and was fully readable/
  writable by anyone who could reach the host directly with a guessed client id.
- CORS headers were also added to all 7 routes in this service earlier in the session
  (a genuine pre-existing gap — the browser was calling this service directly and every
  route lacked `Access-Control-Allow-Origin`, meaning the staff availability screen had
  likely never actually worked in a real browser before, only in API-level testing).
  **That CORS code is now dead** — once the dashboard started proxying through cilio-app
  instead of the browser calling this service directly, CORS became irrelevant (a
  browser can't carry the service key anyway). Left in place, harmless, not deleted.

## What's deliberately NOT built yet

- **Dentally/SOE/R4 adapters** — blocked on partner API access. A partner application was
  submitted to Dentally (developer.dentally.co has fully public API docs, no login
  needed — the endpoints `GET /v1/appointments/availability`, `POST /v1/appointments`,
  `PATCH /v1/appointments/{id}` map directly onto the four generic adapter functions).
  Dentally explicitly only contacts applicants who are "a strong fit" — silence is normal,
  not a rejection signal, and can take weeks to months.
- **WhatsApp** — blocked on a Twilio account and Meta Business verification (the longest
  lead-time item in this whole stage — start it early). Scope is deliberately narrow when
  built: confirmations, reminders, reschedule, missed-contact follow-up only — explicitly
  **not** a second general Q&A surface, since that's redundant with chat.
- **Reschedule/cancel via chat** — not built. Existing patients are still told to call the
  practice directly for changes; the booking-service API supports it (`PATCH
  /api/booking/appointments/{id}`), chat just never calls that path.
- **Self-service dashboard passcode reset for practices** — `npm run passcode` (Ethan-run)
  is the whole admin surface.
- **Individual staff logins** — one shared passcode per practice, not per-user accounts.
- **Calendar drag-and-drop** — dashboard is view-only.
- **£-recovered metric — decided against, not just deferred.** The dashboard shows a
  plain leads-captured count, never a pound value. Converting leads to £ would require
  assumptions about appointment value, the same credibility risk as the Invisalign price
  mismatch flagged earlier. Don't reintroduce a £-recovered figure without this being a
  deliberate, re-discussed decision.
- **Voice (Stage 3)** — entirely out of scope until explicitly reopened.

---

## Current git state (read before assuming anything is live)

- `cilio-app`: everything above is split across **`booking-development`** (chat-assistant
  booking, round 2 features) and **`dashboard-development`** (dashboard, access control,
  service-to-service auth), both branched from `main`, **neither merged**. `main` is
  still exactly production-live-today: plain chat, no booking, no dashboard.
- **Known merge conflict waiting to happen:** both branches modify
  `cilio-app/src/lib/booking.js` in different, non-overlapping ways (round 2's booking
  functions vs. the service-key header). Whichever merges to `main` second will conflict
  there — a clean, easy resolve, but not automatic.
- `cilio-booking-service` has no git repo at all (see Repo locations above) — its
  changes this session exist only on disk.
- Nothing merges to `main` without Ethan explicitly saying so.

---

## Hard-won lessons from this build (read before repeating any of these)

- **Two processes editing this exact file concurrently caused a silent data loss.** An
  earlier resolution (the `client-lookup` decision) was overwritten by a later save from
  a parallel session and had to be reconstructed from conversation history. If you're
  updating this file, re-read it immediately before saving — don't trust that your
  in-memory copy is still current.
- **`cilio-booking-service` and `cilio-app` were pointed at two DIFFERENT Supabase
  projects for most of this build**, discovered only when a column that should have
  existed didn't. `NEXT_PUBLIC_BOOKING_API_URL`/`SUPABASE_URL` mismatches between the two
  repos' env files are easy to introduce silently — verify both point at the same
  project ("cilio 1") if anything booking-related behaves as if tables don't exist.
- **Anthropic's tool `input_schema` does not support `anyOf`/`oneOf`/`allOf` at the top
  level.** A "require phone OR email" schema built with `anyOf` makes every request to
  that tool fail outright (400 from the API). Enforce "at least one of X or Y" in your
  own server-side code instead, not the schema.
- **The Resend SDK does not throw on API-level failures** (bad recipient format, bad API
  key, etc.) — it resolves normally with `{ data: null, error: {...} }`. A plain
  try/catch around `resend.emails.send()` silently swallows real failures with zero log
  trace. Always check the `.error` field explicitly.
- **Never bin or format a stored UTC timestamp using `getUTCHours()`/raw UTC getters
  when the audience is a UK user.** During BST (roughly late March–late October,
  currently in effect) this is off by exactly one hour — caught in the dashboard's
  weekly grid (appointments landing in the wrong row) and in a time-display helper,
  both before shipping. Always extract via `Intl.DateTimeFormat` with
  `timeZone: 'Europe/London'`, matching the pattern already in `src/lib/hours.js`.
- **A Windows/OneDrive file lock (`EBUSY` on `.next/server/next-font-manifest.json`) can
  crash the Next dev server on first load** after a bunch of file changes, especially
  right after switching git branches. Not a code bug — `rm -rf .next` and restart.
- **Every route in a Next.js service called cross-origin from a browser needs explicit
  CORS headers, or the browser silently blocks it** — API-level (curl) testing won't
  catch this; only a real browser session will. `cilio-booking-service` had this gap
  across all 7 routes for the whole time the availability screen existed.
- **Multi-statement SQL scripts in Supabase's SQL editor can silently stop executing
  partway through** without a visible top-level error. Always verify each
  table/column/constraint actually exists individually after running a multi-statement
  script — don't trust that "no error shown" means "everything ran."
- **PowerShell treats square brackets in paths as wildcards, not literal text.** Any path
  containing `[slug]` needs `-LiteralPath` with `Get-ChildItem`, `Move-Item`, etc.
- **Windows "Extract All" on a zip can nest folders unexpectedly** — always verify actual
  file locations after extracting, don't assume.
- **Environment variables set via `$env:` in PowerShell only persist for that one
  terminal window.** Use `.env.local` for anything that needs to survive across sessions.
- **Two Next.js apps can't both default to port 3000 locally.** Run one with `PORT=3001`
  — and note that stopping a background dev server task doesn't always kill the
  underlying `node` process on Windows; check `netstat`/`taskkill` if a restart claims
  the port's still in use.
- **Always log the real error server-side, not just a generic client-facing message.**

---

## Working style notes

- Ethan wants direct pushback, not agreement, when something looks like a bad idea —
  don't soften technical or business concerns.
- Whenever giving a code snippet or file, always state the exact file path it belongs in.
- Test against a throwaway test client (not necessarily a throwaway Supabase project —
  the real project is shared and confirmed correct now, see "Hard-won lessons") before
  anything touches real client data — this has already caught multiple real bugs that
  would have been much worse to find in production. Always delete test data afterward.
- When a change is security- or access-control-related, go slower, and verify with
  adversarial testing (actively try to break the isolation/auth), not just the happy
  path — this is what caught the IDOR and confirmed the fail-closed behaviour above.

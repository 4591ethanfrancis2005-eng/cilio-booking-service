# cilio-booking-service

Shared booking engine for Cilio's chat, WhatsApp, and (Stage 3) voice products.

## What's built in this pass

- **Database schema** (`sql/schema.sql`) — practitioners, availability_rules, bookings,
  booking_audit_log, plus a `pms_type` column added to the existing `clients` table.
  The double-booking prevention is a real Postgres exclusion constraint, not
  application-level locking — two simultaneous booking attempts for the same slot
  cannot both succeed, full stop.
- **`CilioNativeAdapter`** (`lib/adapters/CilioNativeAdapter.js`) — fully working,
  no external PMS dependency. Implements checkAvailability, book, reschedule, cancel.
- **`bookingService`** (`lib/bookingService.js`) — the single entry point every
  caller uses. Looks up a client's `pms_type` and delegates to the right adapter.
  Only `native` exists right now; Dentally/SOE/R4 get added here later without
  touching anything else.
- **Three API routes** — `GET /api/booking/availability`,
  `POST /api/booking/appointments`, `PATCH /api/booking/appointments/{id}`
  (handles both reschedule and cancel, matching the pattern Dentally's own
  API uses: cancel is a status change, never a hard delete).

## What's deliberately NOT in this pass

- Dentally/SOE/R4 adapters — blocked on partner access, per the master plan
- WhatsApp channel — blocked on Twilio + Meta Business verification
- Voice (Stage 3) — out of scope entirely for now
- The staff-facing availability management screen (a `cilio-app` frontend piece,
  not part of this repo) — practitioners and availability_rules can be inserted
  directly in Supabase for now until that screen exists

## Setup

1. Run `sql/schema.sql` in the Supabase SQL editor for the existing Cilio project
   (same project `cilio-app` already uses — this only adds new tables/columns,
   nothing existing is touched)
2. Set environment variables: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
3. `npm install`
4. For a client to use native booking: insert rows into `practitioners` and
   `availability_rules` for them, and confirm their `clients.pms_type = 'native'`
   (this is already the column default, so any client without a PMS gets this
   automatically)

## Testing before this touches a real client

Nothing in here has been run against a live database yet. Before this goes near
Swati's real booking data: run the schema in a test Supabase project first, insert
a fake practitioner and a week of availability_rules, and manually exercise all
four endpoints — including deliberately firing two overlapping booking requests
at once to confirm the exclusion constraint actually rejects the second one.

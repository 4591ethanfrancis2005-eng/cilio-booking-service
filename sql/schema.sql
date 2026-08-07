-- Cilio Booking Service — initial schema
-- Run this in the Supabase SQL editor for the existing Cilio project
-- (same project as cilio-app — this is additive, does not touch existing tables)

-- Required for the exclusion constraint below (range types + gist index on non-range columns)
create extension if not exists btree_gist;

-- Practitioners belong to a client (a practice). One row per dentist/hygienist.
create table if not exists practitioners (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Recurring weekly availability template, e.g. "Dr Maan, Mon 09:00-13:00"
create table if not exists availability_rules (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  practitioner_id uuid not null references practitioners(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6), -- 0 = Sunday
  start_time time not null,
  finish_time time not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (finish_time > start_time)
);

-- Actual bookings. This is the table the exclusion constraint protects.
create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  practitioner_id uuid not null references practitioners(id) on delete cascade,
  patient_name text not null,
  patient_contact text, -- phone or email, whatever was captured
  start_time timestamptz not null,
  finish_time timestamptz not null,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  reason text, -- free-text, e.g. "Check-up", "Emergency"
  created_via text not null check (created_via in ('chat', 'whatsapp', 'voice', 'staff')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (finish_time > start_time)
);

-- THE ACTUAL DOUBLE-BOOKING PREVENTION.
-- No two non-cancelled bookings for the same practitioner can have overlapping time ranges.
-- This is enforced by Postgres itself at insert/update time — not by application code,
-- not by a "check first, then write" race-prone pattern. If two requests (one from chat,
-- one from WhatsApp) try to book the same slot at the same instant, the database itself
-- rejects the second one. This is what "atomic slot-locking" means in practice.
alter table bookings
  add constraint no_double_booking
  exclude using gist (
    practitioner_id with =,
    tstzrange(start_time, finish_time) with &&
  )
  where (status = 'confirmed');

-- Audit trail — every booking action, who/what triggered it, for support and dispute resolution
create table if not exists booking_audit_log (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id) on delete set null,
  action text not null check (action in ('created', 'rescheduled', 'cancelled')),
  actor text not null, -- 'chat', 'whatsapp', 'voice', 'staff', or a staff user identifier
  details jsonb,
  created_at timestamptz not null default now()
);

-- Which booking adapter a client uses. 'native' = no PMS, uses the tables above directly.
-- Future values: 'dentally', 'soe', 'r4' — added when those adapters are built.
alter table clients add column if not exists pms_type text not null default 'native'
  check (pms_type in ('native', 'dentally', 'soe', 'r4'));

create index if not exists idx_bookings_practitioner_time on bookings (practitioner_id, start_time);
create index if not exists idx_availability_rules_practitioner on availability_rules (practitioner_id, day_of_week);

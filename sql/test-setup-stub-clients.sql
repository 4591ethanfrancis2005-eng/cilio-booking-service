-- Run this FIRST, in a fresh/throwaway Supabase project only — never in production.
-- It creates a minimal stand-in for the real `clients` table that cilio-app owns,
-- just enough for the booking schema's foreign keys to work in isolation.
--
-- After this, run sql/schema.sql as normal.

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null
);

insert into clients (name) values ('Test Practice') returning id;
-- Copy the returned id — you'll need it for every test call below.

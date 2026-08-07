-- Booking round 2 — patient_email on bookings
-- Run this in the Supabase SQL editor for the "cilio 1" project.
-- Additive only — does not touch the existing patient_contact column, the
-- exclusion constraint, or anything else already tested against this table.

alter table bookings add column if not exists patient_email text;

-- Verify individually after running:
-- select patient_email from bookings limit 1;

// CilioNativeAdapter
//
// Implements the shared adapter interface (checkAvailability, book, reschedule, cancel)
// against Cilio's own Supabase tables. No external PMS dependency — this is the adapter
// every client gets by default, and the one that lets a client with no PMS at all still
// get live booking from day one.
//
// Response shapes are deliberately modelled on Dentally's public API
// (developer.dentally.co) so that swapping a client from 'native' to 'dentally' later
// doesn't require changing anything upstream of the adapter layer.

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // server-side only, never exposed to the client
);

/**
 * Returns open time slots for a practitioner within a window, derived from their
 * recurring availability_rules minus any existing confirmed bookings.
 *
 * @param {object} params
 * @param {string} params.clientId
 * @param {string} params.practitionerId
 * @param {string} params.startTime - ISO datetime, must be in the future
 * @param {string} params.finishTime - ISO datetime, must be after startTime
 * @param {number} [params.durationMinutes] - minimum slot duration required
 * @returns {Promise<{availability: Array<{start_time: string, finish_time: string, available_duration: number}>}>}
 */
export async function checkAvailability({ clientId, practitionerId, startTime, finishTime, durationMinutes = 5 }) {
  const start = new Date(startTime);
  const finish = new Date(finishTime);

  if (isNaN(start) || isNaN(finish) || finish <= start) {
    throw new Error('Invalid time range: finishTime must be after startTime');
  }

  const { data: rules, error: rulesError } = await supabase
    .from('availability_rules')
    .select('day_of_week, start_time, finish_time')
    .eq('client_id', clientId)
    .eq('practitioner_id', practitionerId)
    .eq('active', true);

  if (rulesError) throw rulesError;
  if (!rules || rules.length === 0) return { availability: [] };

  const { data: existingBookings, error: bookingsError } = await supabase
    .from('bookings')
    .select('start_time, finish_time')
    .eq('practitioner_id', practitionerId)
    .eq('status', 'confirmed')
    .lt('start_time', finish.toISOString())
    .gt('finish_time', start.toISOString());

  if (bookingsError) throw bookingsError;

  const openWindows = [];

  // Walk day by day through the requested range, applying the recurring rule for
  // that weekday, then subtracting any bookings that overlap it.
  for (let d = new Date(start); d < finish; d.setDate(d.getDate() + 1)) {
    const dayOfWeek = d.getDay();
    const dayRules = rules.filter((r) => r.day_of_week === dayOfWeek);

    for (const rule of dayRules) {
      const ruleStart = combineDateAndTime(d, rule.start_time);
      const ruleFinish = combineDateAndTime(d, rule.finish_time);

      const windowStart = ruleStart < start ? start : ruleStart;
      const windowFinish = ruleFinish > finish ? finish : ruleFinish;
      if (windowStart >= windowFinish) continue;

      const dayBookings = existingBookings
        .filter((b) => new Date(b.start_time) < windowFinish && new Date(b.finish_time) > windowStart)
        .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

      let cursor = windowStart;
      for (const booking of dayBookings) {
        const bookingStart = new Date(booking.start_time);
        const bookingFinish = new Date(booking.finish_time);
        if (bookingStart > cursor) {
          pushIfLongEnough(openWindows, cursor, bookingStart, durationMinutes);
        }
        if (bookingFinish > cursor) cursor = bookingFinish;
      }
      if (cursor < windowFinish) {
        pushIfLongEnough(openWindows, cursor, windowFinish, durationMinutes);
      }
    }
  }

  return { availability: openWindows };
}

/**
 * Creates a new booking. Relies on the database's exclusion constraint
 * (see sql/schema.sql) to guarantee no double-booking — this function does NOT
 * do a "check then write" race-prone pattern; it just attempts the insert and
 * surfaces a clear error if the database rejects it as a conflict.
 */
export async function book({ clientId, practitionerId, patientName, patientContact, patientEmail, startTime, finishTime, reason, createdVia }) {
  const { data, error } = await supabase
    .from('bookings')
    .insert({
      client_id: clientId,
      practitioner_id: practitionerId,
      patient_name: patientName,
      patient_contact: patientContact,
      patient_email: patientEmail || null,
      start_time: startTime,
      finish_time: finishTime,
      reason,
      created_via: createdVia,
      status: 'confirmed',
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23P01') {
      // Postgres exclusion_violation — the exact double-booking case
      throw new BookingConflictError('That slot was just taken. Please choose another time.');
    }
    throw error;
  }

  await logAudit(data.id, 'created', createdVia, { startTime, finishTime });
  return data;
}

/** Moves an existing booking to a new time. Same conflict protection as book(). */
export async function reschedule({ bookingId, newStartTime, newFinishTime, actor }) {
  const { data, error } = await supabase
    .from('bookings')
    .update({ start_time: newStartTime, finish_time: newFinishTime, updated_at: new Date().toISOString() })
    .eq('id', bookingId)
    .eq('status', 'confirmed')
    .select()
    .single();

  if (error) {
    if (error.code === '23P01') {
      throw new BookingConflictError('That new slot was just taken. Please choose another time.');
    }
    throw error;
  }
  if (!data) throw new Error('Booking not found or already cancelled');

  await logAudit(bookingId, 'rescheduled', actor, { newStartTime, newFinishTime });
  return data;
}

/**
 * Cancels a booking by setting status to 'cancelled' — never hard-deletes.
 * This matches the same pattern Dentally's own API recommends (state -> Cancelled,
 * not DELETE), which also means the exclusion constraint automatically frees the
 * slot since it only applies where status = 'confirmed'.
 */
export async function cancel({ bookingId, actor, reason }) {
  const { data, error } = await supabase
    .from('bookings')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', bookingId)
    .select()
    .single();

  if (error) throw error;
  if (!data) throw new Error('Booking not found');

  await logAudit(bookingId, 'cancelled', actor, { reason });
  return data;
}

/**
 * Lists bookings for a client within a date range, optionally filtered to
 * one practitioner — powers the dashboard (day-list and per-dentist weekly
 * calendar views). Goes through this adapter layer like everything else
 * here, not a raw query from cilio-app, so a future Dentally/SOE/R4
 * client's real appointments (which won't live in this table) work the
 * same way from the dashboard's point of view once those adapters exist.
 *
 * startDate/endDate are plain YYYY-MM-DD, both inclusive, treated as UTC
 * day boundaries — this is a staff-facing listing grouped by calendar day,
 * not a patient-facing booking write, so the ~1hr fuzziness at the
 * Europe/London/UTC boundary (unlike londonWallTimeToUTCISO elsewhere)
 * isn't worth the extra complexity here.
 */
export async function listAppointments({ clientId, startDate, endDate, practitionerId }) {
  let query = supabase
    .from('bookings')
    .select('id, practitioner_id, practitioners(name), patient_name, patient_contact, patient_email, start_time, finish_time, status, reason, created_via')
    .eq('client_id', clientId)
    .gte('start_time', `${startDate}T00:00:00.000Z`)
    .lt('start_time', `${endDate}T23:59:59.999Z`)
    .order('start_time');

  if (practitionerId) query = query.eq('practitioner_id', practitionerId);

  const { data, error } = await query;
  if (error) throw error;
  return data.map(({ practitioners, ...b }) => ({ ...b, practitioner_name: practitioners?.name || null }));
}

// --- helpers ---

export class BookingConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BookingConflictError';
    this.httpStatus = 409;
  }
}

function combineDateAndTime(date, timeString) {
  const [h, m, s] = timeString.split(':').map(Number);
  const combined = new Date(date);
  combined.setHours(h, m, s || 0, 0);
  return combined;
}

function pushIfLongEnough(list, start, finish, minMinutes) {
  const minutes = (finish - start) / 60000;
  if (minutes >= minMinutes) {
    list.push({
      start_time: start.toISOString(),
      finish_time: finish.toISOString(),
      available_duration: Math.floor(minutes),
    });
  }
}

async function logAudit(bookingId, action, actor, details) {
  const { error } = await supabase
    .from('booking_audit_log')
    .insert({ booking_id: bookingId, action, actor: actor || 'unknown', details });
  if (error) console.error('Failed to write booking_audit_log:', error);
}

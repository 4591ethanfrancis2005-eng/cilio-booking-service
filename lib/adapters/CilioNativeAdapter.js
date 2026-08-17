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
  //
  // EVERY date/time decision here is made in Europe/London, never in the
  // server's own timezone. availability_rules store a weekday plus a wall
  // time ("Tue 09:00") which are meaningless without a zone, and the practice
  // means London. The previous version used d.getDay() and setHours(), both
  // of which resolve against whatever TZ the host happens to run in — correct
  // on a UK dev machine, an hour out (and a whole DAY out at the boundaries)
  // on a UTC production host.
  //
  // That is not theoretical: chat asks for a day as London-midnight, which is
  // 23:00 the PREVIOUS day in UTC. On a UTC host that resolved to the previous
  // weekday's rules and collapsed the window to nothing, so the slot picker
  // received zero slots for every day and silently never appeared — while the
  // identical query worked locally.
  for (
    let dateStr = londonDateStr(start);
    dateStr <= londonDateStr(new Date(finish.getTime() - 1));
    dateStr = nextLondonDate(dateStr)
  ) {
    const dayOfWeek = londonDayOfWeek(dateStr);
    const dayRules = rules.filter((r) => r.day_of_week === dayOfWeek);

    for (const rule of dayRules) {
      const ruleStart = londonWallTimeToUTC(dateStr, rule.start_time);
      const ruleFinish = londonWallTimeToUTC(dateStr, rule.finish_time);

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

/**
 * Counts bookings CREATED within a window (created_at >= sinceISO),
 * regardless of the appointment's own start_time. This is a booking-
 * ACTIVITY metric — the dashboard's "Bookings, last 7 days" tile, meant to
 * mirror "Leads captured, last 7 days" (which already counts by created_at).
 *
 * Deliberately separate from listAppointments(), which filters by
 * start_time and powers the calendar/day-list views: a booking made today
 * for an appointment three weeks out is activity that happened in the last
 * 7 days, but would never appear in a start_time-bounded window looking
 * backward from today. Using listAppointments()'s own window for an
 * "activity" tile was the bug — a receptionist booking someone in for next
 * week (the normal case) would never move the counter.
 *
 * No status filter, same as listAppointments — a booking that was later
 * cancelled still counts as activity that happened.
 */
export async function countBookingsCreatedSince({ clientId, sinceISO }) {
  const { count, error } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .gte('created_at', sinceISO);

  if (error) throw error;
  return count || 0;
}

// --- helpers ---

export class BookingConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BookingConflictError';
    this.httpStatus = 409;
  }
}

// ── Europe/London date helpers ─────────────────────────────────────────
// availability_rules hold a weekday + wall-clock time with no zone attached;
// the practice always means London. These resolve that explicitly so the
// result never depends on the host's own TZ (UK laptop vs UTC serverless).
// combineDateAndTime(), which used setHours() and therefore server-local
// time, was replaced by these — see the note in checkAvailability.

/** London calendar date (YYYY-MM-DD) for an instant. */
function londonDateStr(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Next calendar day. Pure string arithmetic — these are labels, not instants. */
function nextLondonDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Weekday for a London calendar date, 0=Sun..6=Sat to match
 * availability_rules.day_of_week. Read at midday so it can never be nudged
 * across a day boundary by a DST shift.
 */
function londonDayOfWeek(dateStr) {
  return new Date(`${dateStr}T12:00:00Z`).getUTCDay();
}

/**
 * A London wall-clock time on a London calendar date -> the real UTC instant,
 * DST-aware. Same two-step approach as londonWallTimeToUTCISO in cilio-app:
 * guess the instant as if the wall time were UTC, ask what that instant looks
 * like in London, and subtract the difference. Accepts "09:00" or "09:00:00".
 */
function londonWallTimeToUTC(dateStr, timeString) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, mi] = timeString.split(':').map(Number);

  const utcGuess = Date.UTC(y, mo - 1, d, h, mi);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(utcGuess));
  const get = (t) => Number(parts.find((p) => p.type === t).value);

  const zoneReadingAsUTC = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return new Date(utcGuess - (zoneReadingAsUTC - utcGuess));
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

import { NextResponse } from 'next/server';
import { countBookingsCreatedSince } from '../../../../../lib/bookingService.js';
import { CORS, corsPreflight } from '../../../../../lib/cors.js';

export async function OPTIONS() {
  return corsPreflight();
}

// GET /api/booking/appointments/created-count?clientId=&sinceISO=
//
// sinceISO is a full UTC instant (not a plain date) — the caller is
// responsible for converting whatever "since" means to them into the
// correct instant, same division of responsibility as everywhere else this
// adapter layer takes explicit ISO timestamps rather than doing its own
// timezone math.
//
// Separate route from GET /api/booking/appointments on purpose: that one
// filters by start_time (appointment date) and powers the calendar/day-list
// views; this one filters by created_at (when the booking was made) and
// powers the dashboard's "Bookings, last N days" activity tile. Conflating
// the two into one endpoint with mode-switching params was considered and
// rejected — the two queries answer genuinely different questions.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('clientId');
  const sinceISO = searchParams.get('sinceISO');

  if (!clientId || !sinceISO) {
    return NextResponse.json({ error: 'clientId and sinceISO are both required' }, { status: 400, headers: CORS });
  }

  try {
    const count = await countBookingsCreatedSince({ clientId, sinceISO });
    return NextResponse.json({ count }, { headers: CORS });
  } catch (err) {
    console.error('GET /api/booking/appointments/created-count failed:', err);
    return NextResponse.json({ error: 'Failed to count bookings' }, { status: 500, headers: CORS });
  }
}

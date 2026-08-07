import { NextResponse } from 'next/server';
import { bookAppointment, listAppointments } from '../../../../lib/bookingService.js';
import { BookingConflictError } from '../../../../lib/adapters/CilioNativeAdapter.js';
import { CORS, corsPreflight } from '../../../../lib/cors.js';

export async function OPTIONS() {
  return corsPreflight();
}

// GET /api/booking/appointments?clientId=&startDate=&endDate=&practitionerId=
// startDate/endDate: YYYY-MM-DD, both inclusive. practitionerId is optional —
// omit for the dashboard's combined day-list view (all practitioners),
// include to filter to one (the per-dentist weekly calendar view). Powers
// the dashboard — never queried directly from cilio-app's own Supabase
// client, same rule as everywhere else in this architecture.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('clientId');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const practitionerId = searchParams.get('practitionerId') || undefined;

  if (!clientId || !startDate || !endDate) {
    return NextResponse.json({ error: 'clientId, startDate and endDate are all required' }, { status: 400, headers: CORS });
  }

  try {
    const bookings = await listAppointments({ clientId, startDate, endDate, practitionerId });
    return NextResponse.json({ bookings }, { headers: CORS });
  } catch (err) {
    console.error('GET /api/booking/appointments failed:', err);
    return NextResponse.json({ error: 'Failed to fetch appointments' }, { status: 500, headers: CORS });
  }
}

// POST /api/booking/appointments
// Body: { clientId, practitionerId, patientName, patientContact, patientEmail, startTime, finishTime, reason, createdVia }
// patientEmail is optional and passed straight through to the adapter (the
// whole body is forwarded to bookAppointment/book() below) — no extra
// wiring needed here, same as any other optional field on this route.
export async function POST(request) {
  const body = await request.json();
  const { clientId, practitionerId, patientName, startTime, finishTime, createdVia } = body;

  if (!clientId || !practitionerId || !patientName || !startTime || !finishTime || !createdVia) {
    return NextResponse.json(
      { error: 'clientId, practitionerId, patientName, startTime, finishTime and createdVia are all required' },
      { status: 400, headers: CORS }
    );
  }
  if (!['chat', 'whatsapp', 'voice', 'staff'].includes(createdVia)) {
    return NextResponse.json({ error: 'createdVia must be one of chat, whatsapp, voice, staff' }, { status: 400, headers: CORS });
  }

  try {
    const booking = await bookAppointment(body);
    return NextResponse.json({ booking }, { status: 201, headers: CORS });
  } catch (err) {
    if (err instanceof BookingConflictError) {
      return NextResponse.json({ error: err.message }, { status: err.httpStatus, headers: CORS });
    }
    console.error('POST /api/booking/appointments failed:', err);
    return NextResponse.json({ error: 'Failed to create booking' }, { status: 500, headers: CORS });
  }
}

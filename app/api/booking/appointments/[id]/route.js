import { NextResponse } from 'next/server';
import { rescheduleAppointment, cancelAppointment } from '../../../../../lib/bookingService.js';
import { BookingConflictError } from '../../../../../lib/adapters/CilioNativeAdapter.js';
import { CORS, corsPreflight } from '../../../../../lib/cors.js';

export async function OPTIONS() {
  return corsPreflight();
}

// PATCH /api/booking/appointments/{id}
// Body for reschedule: { clientId, newStartTime, newFinishTime, actor }
// Body for cancel:     { clientId, status: "cancelled", actor, reason }
export async function PATCH(request, { params }) {
  const bookingId = params.id;
  const body = await request.json();
  const { clientId, actor } = body;

  if (!clientId) {
    return NextResponse.json({ error: 'clientId is required' }, { status: 400, headers: CORS });
  }

  try {
    if (body.status === 'cancelled') {
      const booking = await cancelAppointment({ clientId, bookingId, actor, reason: body.reason });
      return NextResponse.json({ booking }, { headers: CORS });
    }

    if (body.newStartTime && body.newFinishTime) {
      const booking = await rescheduleAppointment({
        clientId,
        bookingId,
        newStartTime: body.newStartTime,
        newFinishTime: body.newFinishTime,
        actor,
      });
      return NextResponse.json({ booking }, { headers: CORS });
    }

    return NextResponse.json(
      { error: 'Provide either status: "cancelled", or newStartTime and newFinishTime to reschedule' },
      { status: 400, headers: CORS }
    );
  } catch (err) {
    if (err instanceof BookingConflictError) {
      return NextResponse.json({ error: err.message }, { status: err.httpStatus, headers: CORS });
    }
    console.error(`PATCH /api/booking/appointments/${bookingId} failed:`, err);
    return NextResponse.json({ error: 'Failed to update booking' }, { status: 500, headers: CORS });
  }
}

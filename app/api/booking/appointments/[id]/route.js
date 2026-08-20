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
// Body for staff edit: the reschedule shape, plus any of newPractitionerId /
//                      patientName / patientContact / patientEmail / reason.
//
// A staff edit is deliberately NOT a separate operation. Moving a booking
// between diaries has to go through the same single atomic UPDATE that the
// exclusion constraint protects (see CilioNativeAdapter.reschedule), so
// giving edits their own write path would be giving them a way around the
// one thing preventing double bookings. A details-only edit routes here for
// the same reason: one write path, one set of guarantees.
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

    const editableFields = ['newPractitionerId', 'patientName', 'patientContact', 'patientEmail', 'reason'];
    const hasEdit = editableFields.some((f) => body[f] !== undefined);

    if ((body.newStartTime && body.newFinishTime) || hasEdit) {
      const booking = await rescheduleAppointment({
        clientId,
        bookingId,
        newStartTime: body.newStartTime,
        newFinishTime: body.newFinishTime,
        newPractitionerId: body.newPractitionerId,
        patientName: body.patientName,
        patientContact: body.patientContact,
        patientEmail: body.patientEmail,
        reason: body.reason,
        actor,
      });
      return NextResponse.json({ booking }, { headers: CORS });
    }

    return NextResponse.json(
      { error: 'Provide status: "cancelled", newStartTime + newFinishTime, or at least one editable field' },
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

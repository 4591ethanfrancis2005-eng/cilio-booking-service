import { NextResponse } from 'next/server';
import { checkAvailability } from '../../../../lib/bookingService.js';
import { CORS, corsPreflight } from '../../../../lib/cors.js';

export async function OPTIONS() {
  return corsPreflight();
}

// GET /api/booking/availability?clientId=...&practitionerId=...&startTime=...&finishTime=...&durationMinutes=15
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('clientId');
  const practitionerId = searchParams.get('practitionerId');
  const startTime = searchParams.get('startTime');
  const finishTime = searchParams.get('finishTime');
  const durationMinutes = Number(searchParams.get('durationMinutes')) || undefined;

  if (!clientId || !practitionerId || !startTime || !finishTime) {
    return NextResponse.json(
      { error: 'clientId, practitionerId, startTime and finishTime are all required' },
      { status: 400, headers: CORS }
    );
  }

  try {
    const result = await checkAvailability({ clientId, practitionerId, startTime, finishTime, durationMinutes });
    return NextResponse.json(result, { headers: CORS });
  } catch (err) {
    console.error('GET /api/booking/availability failed:', err);
    return NextResponse.json({ error: 'Failed to fetch availability' }, { status: 500, headers: CORS });
  }
}

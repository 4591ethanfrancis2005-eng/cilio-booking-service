import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { CORS, corsPreflight } from '../../../../lib/cors.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export async function OPTIONS() {
  return corsPreflight();
}

// GET /api/booking/availability-rules?practitionerId=...
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const practitionerId = searchParams.get('practitionerId');
  if (!practitionerId) {
    return NextResponse.json({ error: 'practitionerId is required' }, { status: 400, headers: CORS });
  }

  const { data, error } = await supabase
    .from('availability_rules')
    .select('id, day_of_week, start_time, finish_time')
    .eq('practitioner_id', practitionerId)
    .eq('active', true)
    .order('day_of_week');

  if (error) {
    console.error('GET /api/booking/availability-rules failed:', error);
    return NextResponse.json({ error: 'Failed to fetch availability rules' }, { status: 500, headers: CORS });
  }
  return NextResponse.json({ rules: data }, { headers: CORS });
}

// PUT /api/booking/availability-rules
// Body: { clientId, practitionerId, rules: [{ dayOfWeek, startTime, finishTime }, ...] }
//
// Replaces the practitioner's ENTIRE weekly schedule in one go — this is deliberate.
// Staff think in terms of "here's my week," not individual rule edits, so this
// matches that mental model rather than exposing granular CRUD. Existing rules for
// this practitioner are deleted and replaced atomically inside a transaction-like
// sequence (delete then insert) — if the insert fails, the delete is not rolled
// back automatically by Supabase's JS client, so errors here are reported clearly
// rather than silently leaving a practitioner with no hours set.
export async function PUT(request) {
  const { clientId, practitionerId, rules } = await request.json();

  if (!clientId || !practitionerId || !Array.isArray(rules)) {
    return NextResponse.json(
      { error: 'clientId, practitionerId, and rules (array) are required' },
      { status: 400, headers: CORS }
    );
  }

  for (const rule of rules) {
    if (
      typeof rule.dayOfWeek !== 'number' ||
      rule.dayOfWeek < 0 ||
      rule.dayOfWeek > 6 ||
      !rule.startTime ||
      !rule.finishTime
    ) {
      return NextResponse.json(
        { error: 'Each rule needs dayOfWeek (0-6), startTime, and finishTime' },
        { status: 400, headers: CORS }
      );
    }
    if (rule.finishTime <= rule.startTime) {
      return NextResponse.json(
        { error: `finishTime must be after startTime for day ${rule.dayOfWeek}` },
        { status: 400, headers: CORS }
      );
    }
  }

  const { error: deleteError } = await supabase
    .from('availability_rules')
    .delete()
    .eq('practitioner_id', practitionerId);

  if (deleteError) {
    console.error('PUT /api/booking/availability-rules (clear step) failed:', deleteError);
    return NextResponse.json({ error: 'Failed to update availability' }, { status: 500, headers: CORS });
  }

  if (rules.length === 0) {
    // Practitioner has no open days — valid state (e.g. fully booked out, on leave)
    return NextResponse.json({ rules: [] }, { headers: CORS });
  }

  const { data, error: insertError } = await supabase
    .from('availability_rules')
    .insert(
      rules.map((r) => ({
        client_id: clientId,
        practitioner_id: practitionerId,
        day_of_week: r.dayOfWeek,
        start_time: r.startTime,
        finish_time: r.finishTime,
      }))
    )
    .select();

  if (insertError) {
    console.error('PUT /api/booking/availability-rules (insert step) failed:', insertError);
    return NextResponse.json(
      { error: 'Availability was cleared but the new schedule failed to save. Please try again.' },
      { status: 500, headers: CORS }
    );
  }

  return NextResponse.json({ rules: data }, { headers: CORS });
}

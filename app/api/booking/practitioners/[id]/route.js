import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { CORS, corsPreflight } from '../../../../../lib/cors.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export async function OPTIONS() {
  return corsPreflight();
}

// PATCH /api/booking/practitioners/{id}
// Body: { active: false }  -- soft delete, never hard-delete (preserves booking history)
export async function PATCH(request, { params }) {
  const { active } = await request.json();
  if (typeof active !== 'boolean') {
    return NextResponse.json({ error: 'active (boolean) is required' }, { status: 400, headers: CORS });
  }

  const { data, error } = await supabase
    .from('practitioners')
    .update({ active })
    .eq('id', params.id)
    .select()
    .single();

  if (error) {
    console.error(`PATCH /api/booking/practitioners/${params.id} failed:`, error);
    return NextResponse.json({ error: 'Failed to update practitioner' }, { status: 500, headers: CORS });
  }
  return NextResponse.json({ practitioner: data }, { headers: CORS });
}

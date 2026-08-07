import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { CORS, corsPreflight } from '../../../../lib/cors.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export async function OPTIONS() {
  return corsPreflight();
}

// GET /api/booking/practitioners?clientId=...
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('clientId');
  if (!clientId) {
    return NextResponse.json({ error: 'clientId is required' }, { status: 400, headers: CORS });
  }

  const { data, error } = await supabase
    .from('practitioners')
    .select('id, name, active')
    .eq('client_id', clientId)
    .eq('active', true)
    .order('name');

  if (error) {
    console.error('GET /api/booking/practitioners failed:', error);
    return NextResponse.json({ error: 'Failed to fetch practitioners' }, { status: 500, headers: CORS });
  }
  return NextResponse.json({ practitioners: data }, { headers: CORS });
}

// POST /api/booking/practitioners
// Body: { clientId, name }
export async function POST(request) {
  const { clientId, name } = await request.json();
  if (!clientId || !name || !name.trim()) {
    return NextResponse.json({ error: 'clientId and name are required' }, { status: 400, headers: CORS });
  }

  const { data, error } = await supabase
    .from('practitioners')
    .insert({ client_id: clientId, name: name.trim() })
    .select()
    .single();

  if (error) {
    console.error('POST /api/booking/practitioners failed:', error);
    return NextResponse.json({ error: 'Failed to create practitioner' }, { status: 500, headers: CORS });
  }
  return NextResponse.json({ practitioner: data }, { status: 201, headers: CORS });
}

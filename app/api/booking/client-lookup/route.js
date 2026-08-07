import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { CORS, corsPreflight } from '../../../../lib/cors.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export async function OPTIONS() {
  return corsPreflight();
}

// GET /api/booking/client-lookup?slug=...
//
// NOTE: if cilio-app already has an existing slug->client lookup (it almost
// certainly does, since the chat widget itself resolves slugs), prefer using that
// instead of this route and delete this file. This exists only so the staff
// availability page below can work standalone without assuming what that
// existing mechanism looks like.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get('slug');
  if (!slug) {
    return NextResponse.json({ error: 'slug is required' }, { status: 400, headers: CORS });
  }

  const { data, error } = await supabase
    .from('clients')
    .select('id, name, pms_type')
    .eq('slug', slug) // ASSUMPTION: clients table has a `slug` column — adjust if named differently
    .single();

  if (error || !data) {
    console.error('GET /api/booking/client-lookup failed:', error);
    return NextResponse.json({ error: 'Client not found' }, { status: 404, headers: CORS });
  }
  return NextResponse.json({ client: data }, { headers: CORS });
}

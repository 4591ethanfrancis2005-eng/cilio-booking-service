// bookingService.js
//
// The single entry point every caller (chat, WhatsApp, and later voice) uses.
// Looks up which adapter a client is on and delegates to it. Callers never touch
// an adapter directly — this is what lets Dentally/SOE/R4 adapters get added later
// without any change to cilio-app or the future voice service.

import { createClient } from '@supabase/supabase-js';
import * as CilioNativeAdapter from './adapters/CilioNativeAdapter.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Only 'native' is implemented so far. Dentally/SOE/R4 get added here once their
// sandbox credentials exist — nothing else in this file changes when they do.
const ADAPTERS = {
  native: CilioNativeAdapter,
  // dentally: DentallyAdapter,   // not built yet — needs sandbox credentials from Phase 1
  // soe: SOEAdapter,             // not built yet
  // r4: R4Adapter,               // not built yet
};

async function getAdapterForClient(clientId) {
  const { data: client, error } = await supabase
    .from('clients')
    .select('id, pms_type')
    .eq('id', clientId)
    .single();

  if (error) throw error;
  if (!client) throw new Error(`Client ${clientId} not found`);

  const adapter = ADAPTERS[client.pms_type];
  if (!adapter) {
    throw new Error(
      `Client ${clientId} is set to pms_type "${client.pms_type}", which has no adapter built yet.`
    );
  }
  return adapter;
}

export async function checkAvailability(params) {
  const adapter = await getAdapterForClient(params.clientId);
  return adapter.checkAvailability(params);
}

export async function bookAppointment(params) {
  const adapter = await getAdapterForClient(params.clientId);
  return adapter.book(params);
}

export async function rescheduleAppointment(params) {
  const adapter = await getAdapterForClient(params.clientId);
  return adapter.reschedule(params);
}

export async function cancelAppointment(params) {
  const adapter = await getAdapterForClient(params.clientId);
  return adapter.cancel(params);
}

export async function listAppointments(params) {
  const adapter = await getAdapterForClient(params.clientId);
  return adapter.listAppointments(params);
}

export async function countBookingsCreatedSince(params) {
  const adapter = await getAdapterForClient(params.clientId);
  return adapter.countBookingsCreatedSince(params);
}

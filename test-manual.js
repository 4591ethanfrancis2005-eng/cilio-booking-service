// test-manual.js
//
// Run against a TEST Supabase project only. Never point this at production.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... CLIENT_ID=<id-from-stub-sql> node test-manual.js
//
// This calls the adapter functions directly (not over HTTP) so you don't need
// the Next.js dev server running — fastest way to verify the database behaviour
// itself, which is the part that actually matters here.

import { createClient } from '@supabase/supabase-js';
import * as adapter from './lib/adapters/CilioNativeAdapter.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const clientId = process.env.CLIENT_ID;

if (!clientId) {
  console.error('Set CLIENT_ID to the id returned by test-setup-stub-clients.sql');
  process.exit(1);
}

async function main() {
  console.log('--- 1. Creating a test practitioner and availability rule ---');
  const { data: practitioner, error: pErr } = await supabase
    .from('practitioners')
    .insert({ client_id: clientId, name: 'Test Dentist' })
    .select()
    .single();
  if (pErr) throw pErr;
  console.log('Practitioner created:', practitioner.id);

  // Monday 09:00-17:00 (day_of_week: 1 = Monday)
  const { error: rErr } = await supabase.from('availability_rules').insert({
    client_id: clientId,
    practitioner_id: practitioner.id,
    day_of_week: 1,
    start_time: '09:00',
    finish_time: '17:00',
  });
  if (rErr) throw rErr;
  console.log('Availability rule created: Monday 09:00-17:00');

  const nextMonday = getNextMonday();
  const windowStart = new Date(nextMonday);
  windowStart.setHours(0, 0, 0, 0);
  const windowEnd = new Date(nextMonday);
  windowEnd.setHours(23, 59, 59, 0);

  console.log('\n--- 2. Checking availability (should show 09:00-17:00 open) ---');
  const availability = await adapter.checkAvailability({
    clientId,
    practitionerId: practitioner.id,
    startTime: windowStart.toISOString(),
    finishTime: windowEnd.toISOString(),
  });
  console.log(JSON.stringify(availability, null, 2));

  console.log('\n--- 3. Booking a slot at 10:00-10:30 ---');
  const slotStart = new Date(nextMonday);
  slotStart.setHours(10, 0, 0, 0);
  const slotFinish = new Date(nextMonday);
  slotFinish.setHours(10, 30, 0, 0);

  const booking = await adapter.book({
    clientId,
    practitionerId: practitioner.id,
    patientName: 'Test Patient',
    patientContact: 'test@example.com',
    startTime: slotStart.toISOString(),
    finishTime: slotFinish.toISOString(),
    reason: 'Check-up',
    createdVia: 'staff',
  });
  console.log('Booked:', booking.id);

  console.log('\n--- 4. THE IMPORTANT TEST: firing two overlapping bookings simultaneously ---');
  console.log('Both requests are for the SAME slot (11:00-11:30), fired at the same instant.');
  console.log('Expected: exactly one succeeds, one fails with a conflict error.\n');

  const conflictStart = new Date(nextMonday);
  conflictStart.setHours(11, 0, 0, 0);
  const conflictFinish = new Date(nextMonday);
  conflictFinish.setHours(11, 30, 0, 0);

  const attempt = (label) =>
    adapter
      .book({
        clientId,
        practitionerId: practitioner.id,
        patientName: `Race Test ${label}`,
        startTime: conflictStart.toISOString(),
        finishTime: conflictFinish.toISOString(),
        reason: 'Race condition test',
        createdVia: 'staff',
      })
      .then((b) => ({ label, result: 'SUCCESS', id: b.id }))
      .catch((e) => ({ label, result: 'REJECTED', message: e.message }));

  const [resultA, resultB] = await Promise.all([attempt('A'), attempt('B')]);
  console.log(resultA);
  console.log(resultB);

  const successes = [resultA, resultB].filter((r) => r.result === 'SUCCESS').length;
  if (successes === 1) {
    console.log('\n✅ PASS — exactly one booking succeeded, the other was correctly rejected.');
  } else {
    console.log(`\n❌ FAIL — ${successes} bookings succeeded for the same slot. This must be fixed before going near a real client.`);
  }

  console.log('\n--- 5. Rescheduling the original booking to 14:00-14:30 ---');
  const newStart = new Date(nextMonday);
  newStart.setHours(14, 0, 0, 0);
  const newFinish = new Date(nextMonday);
  newFinish.setHours(14, 30, 0, 0);
  const rescheduled = await adapter.reschedule({
    bookingId: booking.id,
    newStartTime: newStart.toISOString(),
    newFinishTime: newFinish.toISOString(),
    actor: 'staff',
  });
  console.log('Rescheduled:', rescheduled.start_time, '->', rescheduled.finish_time);

  console.log('\n--- 6. Cancelling the booking ---');
  const cancelled = await adapter.cancel({ bookingId: booking.id, actor: 'staff', reason: 'test complete' });
  console.log('Status is now:', cancelled.status);

  console.log('\nAll steps complete. Check the ✅/❌ result above — that\'s the one that actually matters.');
}

function getNextMonday() {
  const d = new Date();
  const day = d.getDay();
  const diff = (8 - day) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return d;
}

main().catch((err) => {
  console.error('Test script failed:', err);
  process.exit(1);
});

// ═══════════════════════════════════════════════════════════════════════
// SERVICE AUTHENTICATION — every /api/booking/* request must present the
// shared internal key.
//
// WHY THIS EXISTS: this service holds real patient data (names, phone
// numbers, email addresses, appointment times) and had no authentication
// at all. Anyone who could reach the host and knew or guessed a clientId
// could read a practice's whole diary, or write to it. The dashboard's
// passcode gate does not help here — that protects cilio-app's pages, not
// this service's HTTP surface.
//
// Implemented as middleware rather than a per-route check so it covers
// every route including any added later, and cannot be forgotten on one.
//
// Callers are all server-side and under our control:
//   cilio-app  src/lib/booking.js            (chat's book_appointment)
//   cilio-app  src/app/api/dashboard/_guard.js (dashboard + availability)
// and, later, the WhatsApp and voice services. A browser must NEVER call
// this service directly — doing so would mean shipping this key to the
// client, which would defeat the entire point.
// ═══════════════════════════════════════════════════════════════════════
import { NextResponse } from 'next/server';

export const config = {
  matcher: '/api/:path*',
};

const HEADER = 'x-cilio-service-key';

/**
 * Constant-time string comparison. Node's crypto.timingSafeEqual is not
 * available in the Edge runtime that middleware runs in, so this does the
 * same job: always walk the full length and accumulate differences with
 * XOR, so how long the comparison takes doesn't reveal how many leading
 * characters were correct.
 */
function timingSafeStringEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false; // length is not the secret
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function middleware(request) {
  // CORS preflights carry no credentials by design, so they cannot be
  // authenticated and are let through. The real request that follows is
  // still checked, so nothing is exposed by this.
  if (request.method === 'OPTIONS') return NextResponse.next();

  const expected = process.env.CILIO_INTERNAL_API_KEY;

  // FAILS CLOSED. If the key isn't configured, every request is rejected
  // rather than waved through — a misconfigured deploy should break
  // loudly, not silently serve patient data to anyone who asks.
  if (!expected) {
    console.error(
      'CILIO_INTERNAL_API_KEY is not set — rejecting all requests. Set it in this service\'s environment (and match it in cilio-app).'
    );
    return NextResponse.json({ error: 'Service not configured' }, { status: 503 });
  }

  if (!timingSafeStringEqual(request.headers.get(HEADER) || '', expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.next();
}

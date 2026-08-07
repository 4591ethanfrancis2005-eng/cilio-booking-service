// Every route in this service is called cross-origin from cilio-app (a
// different port/domain) — the dashboard and staff availability screen
// both fetch this service directly from the browser. Permissive '*' is
// fine for now since there's no session/cookie auth yet (the dashboard's
// Part One has zero access control by design — that's Part Two). Once
// Part Two adds a passcode session cookie, '*' + credentialed requests
// won't work together — CORS will need scoping to a specific known origin
// at that point, not before.
export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function corsPreflight() {
  return new Response(null, { status: 204, headers: CORS });
}

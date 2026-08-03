/**
 * Shared ICE Air charter callsign filter — extracted from
 * functions/api/ice-flights.js so the pattern and the two-stage
 * text-scan-then-JSON.parse logic live in exactly one place instead of
 * drifting. Imported by that route and by workers/flight-sightings-cron/,
 * the new cron Worker that persists ground-arrival/departure transitions to
 * D1 (see migrations/0001_flight_sightings.sql).
 *
 * scripts/dev-tools/live-flights-check.mjs keeps its own verbatim copy on
 * purpose — see that file's header — since it is a standalone diagnostic
 * that must run with zero build step and zero dependency on anything under
 * functions/.
 *
 * ICE_CHARTER_CALLSIGN_PATTERN is reproduced verbatim from Otter Goose's own
 * filtercallsign value (ottergoose.net/ice-flights-msp/map/), not
 * re-derived, since matching it exactly is the only way to make the same
 * claim it does.
 */

export const ICE_CHARTER_CALLSIGN_PATTERN = /^(TYS|GXA6...|BBQ82..|AWI7...|EAL8...|OAE4...|LYM300|LYM400|LYM500)/;

/**
 * The fixed, non-wildcard portion of each ICE_CHARTER_CALLSIGN_PATTERN
 * alternative — e.g. "GXA6" out of "GXA6...". Used to cheaply find
 * candidate aircraft directly in the raw response text (a plain literal
 * alternation, no backtracking) before the authoritative check confirms a
 * real match on the trimmed value. Derived from the pattern itself, not
 * hand-duplicated, so the two can never drift apart.
 */
const CANDIDATE_PREFIXES = ICE_CHARTER_CALLSIGN_PATTERN.source
  .replace(/^\^\(/, '')
  .replace(/\)$/, '')
  .split('|')
  .map((alt) => alt.replace(/\.+$/, ''));

/**
 * Two-stage text scan over a raw adsb.lol JSON response body: cheaply find
 * every `"flight"` field starting with one of the known literal prefixes,
 * then re-check the actual trimmed value against the real (wildcard)
 * pattern so a padded callsign that only coincidentally shares a prefix gets
 * correctly rejected. Only records that survive both stages ever get
 * JSON.parse'd, and only their own small slice of the response — safe
 * because adsb.lol's aircraft records are flat (no nested objects), so the
 * nearest "{" before and "}" after a match are always that record's own.
 *
 * See functions/api/ice-flights.js's original header comment for the full
 * rationale (CPU-limit reasons: full JSON.parse + filter costs ~400ms on a
 * ~6.4MB worldwide response, an order of magnitude past what a Cloudflare
 * Function/Worker gets per request; this text-scan approach does the same
 * job in ~3-6ms).
 *
 * @param {string} rawBody
 * @returns {object[]} matched aircraft records, parsed
 */
export function filterIceCharterFlights(rawBody) {
  const candidateRe = new RegExp(`"flight":"(${CANDIDATE_PREFIXES.join('|')})`, 'g');
  const matched = [];
  let m;
  while ((m = candidateRe.exec(rawBody))) {
    const valueStart = m.index + 10; // length of `"flight":"`
    const closeQuote = rawBody.indexOf('"', valueStart);
    if (closeQuote === -1) continue;
    const callsign = rawBody.slice(valueStart, closeQuote).trim().toUpperCase();
    if (!ICE_CHARTER_CALLSIGN_PATTERN.test(callsign)) continue;
    const start = rawBody.lastIndexOf('{', m.index);
    const end = rawBody.indexOf('}', m.index);
    if (start === -1 || end === -1) continue;
    try {
      matched.push(JSON.parse(rawBody.slice(start, end + 1)));
    } catch {
      // Shouldn't happen for this API's known shape — skip this one record
      // rather than fail the whole response over it.
    }
  }
  return matched;
}

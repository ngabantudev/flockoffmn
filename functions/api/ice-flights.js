/**
 * Global ICE Air charter callsign filter — this project's only live-flight
 * route, and the native version of Otter Goose's MSP ICE Air Flight Tracker
 * (ottergoose.net/ice-flights-msp/map/), which embeds adsb.lol's own map
 * with a `filtercallsign` URL flag to show only aircraft broadcasting one
 * of a handful of known ICE Air charter callsign patterns, wherever in the
 * world they currently are.
 *
 * Worldwide, not Minnesota-scoped, because these charters spend most of
 * their time far from Minnesota — removal flights routinely run to the
 * Gulf Coast, the border, or out of the country entirely. A big-enough
 * radius from any point returns adsb.lol's whole current feed — confirmed
 * by hand, radius 10000 from (0,0) tops out at the same ~11,000-aircraft
 * count as radius 20000+ does, so the network has nothing left to add past
 * that point. That response runs several megabytes, so it's filtered down
 * to the small number of matches here, server-side, before anything
 * reaches a browser.
 *
 * ICE_CHARTER_CALLSIGN_PATTERN is reproduced verbatim from Otter Goose's own
 * filtercallsign value, not re-derived, since matching it exactly is the
 * only way to make the same claim it does. This is the only copy of it —
 * src/lib/liveFlights.ts just renders whatever this route already filtered,
 * with no client-side re-matching of its own.
 *
 * The cache/cooldown pair below is wider than a small-radius ADS-B query
 * would need, on purpose: confirmed by hand during development that this
 * much heavier fetch draws a 429 from adsb.lol after only a handful of
 * manual requests in a couple of minutes. There's no cheaper way to ask for
 * this, either — adsb.lol's /v2/callsign/ route (checked by hand) only does
 * exact matches, not prefixes, and the pattern below needs to catch
 * whatever suffix a charter's callsign carries on a given flight.
 *
 * Deliberately does NOT `JSON.parse` the response and `.filter()` the
 * array — confirmed by hand (replaying a real ~6.4MB/11,700-aircraft
 * response through both approaches) that doing so costs ~400ms of CPU, an
 * order of magnitude past what a Cloudflare Function gets per request
 * before the platform kills it — which is exactly the bare "error code:
 * 502" this route was producing in production before this fix, with no
 * error ever reaching this file's own try/catch to explain why. Scanning
 * the raw text for the handful of matching "flight" fields and parsing only
 * those small slices does the same job in ~3-6ms on the same payload.
 */

const ADSB_GLOBAL_URL = 'https://api.adsb.lol/v2/point/0/0/10000';
const ICE_CHARTER_CALLSIGN_PATTERN = /^(TYS|GXA6...|BBQ82..|AWI7...|EAL8...|OAE4...|LYM300|LYM400|LYM500)/;

/**
 * The fixed, non-wildcard portion of each ICE_CHARTER_CALLSIGN_PATTERN
 * alternative — e.g. "GXA6" out of "GXA6...". Used to cheaply find
 * candidate aircraft directly in the raw response text (a plain literal
 * alternation, no backtracking) before the authoritative check below
 * confirms a real match on the trimmed value. Derived from the pattern
 * itself, not hand-duplicated, so the two can never drift apart: a "." in
 * this JSON text can match a padding space in a callsign shorter than the
 * pattern expects (adsb.lol pads every callsign to a fixed width), which
 * is exactly the false-positive this two-stage check exists to catch —
 * confirmed by hand: matching the wildcard pattern directly against the
 * raw padded text, unlike matching it against the same value trimmed
 * first, turned "GXA620  " (not a real match) into one.
 */
const CANDIDATE_PREFIXES = ICE_CHARTER_CALLSIGN_PATTERN.source
  .replace(/^\^\(/, '')
  .replace(/\)$/, '')
  .split('|')
  .map((alt) => alt.replace(/\.+$/, ''));

const CACHE_SECONDS = 45;
const ERROR_COOLDOWN_SECONDS = 120;

function cachedJson(cache, context, body, status, ttlSeconds) {
  const response = new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${ttlSeconds}`,
    },
  });
  context.waitUntil(cache.put(context.request, response.clone()));
  return response;
}

export async function onRequestGet(context) {
  const cache = caches.default;
  const cached = await cache.match(context.request);
  if (cached) return cached;

  let upstream;
  try {
    upstream = await fetch(ADSB_GLOBAL_URL, {
      signal: AbortSignal.timeout(15000),
      headers: {
        'User-Agent': 'flockoffmn/live-flights (civic transparency project; github.com/ngabantudev/flockoffmn)',
      },
    });
  } catch (err) {
    return cachedJson(
      cache,
      context,
      { error: `adsb.lol unreachable: ${err.message || err}` },
      502,
      ERROR_COOLDOWN_SECONDS,
    );
  }

  if (!upstream.ok) {
    return cachedJson(cache, context, { error: `adsb.lol HTTP ${upstream.status}` }, 502, ERROR_COOLDOWN_SECONDS);
  }

  let text;
  try {
    text = await upstream.text();
  } catch (err) {
    return cachedJson(cache, context, { error: `adsb.lol response failed to read: ${err.message || err}` }, 502, ERROR_COOLDOWN_SECONDS);
  }

  // The filtering this route exists for, done as a text scan rather than
  // JSON.parse(text).ac.filter(...) — see the header comment for why. Stage
  // one (candidateRe) cheaply finds every "flight" field starting with one
  // of the known literal prefixes; stage two re-checks the actual trimmed
  // value against the real (wildcard) pattern, so a padded callsign that
  // only coincidentally shares a prefix — "GXA620  " next to a real
  // "GXA6152 " — gets correctly rejected exactly like the full-parse
  // approach would. Only aircraft that survive both stages ever get
  // JSON.parse'd, and only their own small slice of the response, found by
  // taking the nearest enclosing braces — safe here specifically because
  // adsb.lol's aircraft records are flat (no nested objects), so the
  // nearest "{" before and "}" after a match are always that record's own.
  //
  // A fresh RegExp per request rather than a shared module-level one: a
  // global regex's `lastIndex` is mutable state, and while this loop always
  // runs to exhaustion (which resets it) so reuse would in practice be
  // fine, a fresh instance costs nothing and removes the need to reason
  // about that at all.
  const candidateRe = new RegExp(`"flight":"(${CANDIDATE_PREFIXES.join('|')})`, 'g');
  const matched = [];
  let m;
  while ((m = candidateRe.exec(text))) {
    const valueStart = m.index + 10; // length of `"flight":"`
    const closeQuote = text.indexOf('"', valueStart);
    if (closeQuote === -1) continue;
    const callsign = text.slice(valueStart, closeQuote).trim().toUpperCase();
    if (!ICE_CHARTER_CALLSIGN_PATTERN.test(callsign)) continue;
    const start = text.lastIndexOf('{', m.index);
    const end = text.indexOf('}', m.index);
    if (start === -1 || end === -1) continue;
    try {
      matched.push(JSON.parse(text.slice(start, end + 1)));
    } catch {
      // Shouldn't happen for this API's known shape — skip this one record
      // rather than fail the whole response over it.
    }
  }

  const response = new Response(JSON.stringify({ ac: matched }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
    },
  });

  context.waitUntil(cache.put(context.request, response.clone()));
  return response;
}

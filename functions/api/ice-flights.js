/**
 * Global ICE Air charter callsign filter — a server-side counterpart to
 * api/aircraft.js, and the native version of Otter Goose's MSP ICE Air
 * Flight Tracker (ottergoose.net/ice-flights-msp/map/), which embeds
 * adsb.lol's own map with a `filtercallsign` URL flag to show only aircraft
 * broadcasting one of a handful of known ICE Air charter callsign patterns,
 * wherever in the world they currently are.
 *
 * api/aircraft.js deliberately queries a 250nm radius around Minnesota —
 * fine for "ambient air traffic over the state", useless for this, since
 * these charters spend most of their time nowhere near Minnesota (removal
 * flights routinely run to the Gulf Coast, the border, or out of the
 * country entirely). Matching Otter Goose's approach means querying
 * worldwide instead: a big-enough radius from any point returns adsb.lol's
 * whole current feed — confirmed by hand, radius 10000 from (0,0) tops out
 * at the same ~11,000-aircraft count as radius 20000+ does, so the network
 * has nothing left to add past that point. That response runs several
 * megabytes, so it is filtered down to the small number of matches here,
 * server-side, before anything reaches a browser — the point of this route
 * existing separately from api/aircraft.js rather than adding a "global"
 * mode to it.
 *
 * ICE_CHARTER_CALLSIGN_PATTERN is reproduced verbatim from Otter Goose's own
 * filtercallsign value, not re-derived, since matching it exactly is the
 * only way to make the same claim it does — see src/lib/liveFlights.ts's
 * copy of the same constant, which this must be kept identical to.
 *
 * A longer cache than api/aircraft.js's (below) on purpose: this fetch is
 * roughly 13x the payload for a feature nobody has switched on by default
 * (it's a second, nested toggle — see MapView.astro), so it should hit
 * adsb.lol less often per visitor-second than the ambient feed does.
 */

const ADSB_GLOBAL_URL = 'https://api.adsb.lol/v2/point/0/0/10000';
const ICE_CHARTER_CALLSIGN_PATTERN = /^(TYS|GXA6...|BBQ82..|AWI7...|EAL8...|OAE4...|LYM300|LYM400|LYM500)/;
const CACHE_SECONDS = 15;
const ERROR_COOLDOWN_SECONDS = 45;

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

  let body;
  try {
    body = await upstream.json();
  } catch (err) {
    return cachedJson(cache, context, { error: `adsb.lol returned unparseable JSON: ${err.message || err}` }, 502, ERROR_COOLDOWN_SECONDS);
  }

  // The filtering this route exists for: same pattern, same field, as
  // ICE_CHARTER_CALLSIGN_PATTERN in src/lib/liveFlights.ts. Applied here so
  // the ~11,000-aircraft response never leaves the edge.
  const matched = (body.ac ?? []).filter((ac) =>
    ICE_CHARTER_CALLSIGN_PATTERN.test((ac.flight ?? '').trim().toUpperCase()),
  );

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

/**
 * Full historical trace proxy — the second half of the live-flights exception.
 *
 * adsb.lol (the same tar1090/readsb lineage as adsbexchange's globe, which is
 * where "?icao=" trace lookups come from) publishes each aircraft's retained
 * position history at a predictable, undocumented-but-public URL. Same CORS
 * problem as the live point/radius feed (confirmed: a plain fetch gets a 200
 * back with no Access-Control-Allow-Origin), same fix: this route fetches it
 * server-side and re-serves it same-origin.
 *
 * Deliberately fetched on demand, one aircraft at a time, only when a visitor
 * actually selects a plane on the map — never for every aircraft in view.
 * Each trace file runs several hundred KB; fetching it ambiently for the 50+
 * aircraft the live overlay might be tracking at once would multiply load on
 * adsb.lol far beyond what the live position feed already costs.
 *
 * A rate-limit or outage response is cached for longer than a normal miss —
 * see api/aircraft.js's header for why: this route earned adsb.lol's own 429
 * during development from nothing more than repeated manual testing, and
 * without backing off harder on failure a burst of clicks during exactly
 * that window would have kept retrying the upstream instead of cooling down.
 */

const CACHE_SECONDS = 30;
const ERROR_COOLDOWN_SECONDS = 60;
const HEX_PATTERN = /^[0-9a-f]{6}$/;

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
  const hex = String(context.params.hex ?? '').toLowerCase();
  if (!HEX_PATTERN.test(hex)) {
    return Response.json({ error: 'invalid hex' }, { status: 400 });
  }

  const cache = caches.default;
  const cached = await cache.match(context.request);
  if (cached) return cached;

  const lastTwo = hex.slice(-2);
  const upstreamUrl = `https://adsb.lol/data/traces/${lastTwo}/trace_full_${hex}.json`;

  let upstream;
  try {
    upstream = await fetch(upstreamUrl, {
      signal: AbortSignal.timeout(10000),
      headers: {
        'User-Agent': 'flockoffmn/live-flights (civic transparency project; github.com/ngabantudev/flockoffmn)',
        'Accept-Encoding': 'gzip',
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

  if (upstream.status === 404) {
    // A legitimately common, non-distress answer — most aircraft simply have
    // no retained trace — so it gets the ordinary TTL, not the cooldown.
    return cachedJson(cache, context, { error: 'no trace on file for this aircraft' }, 404, CACHE_SECONDS);
  }
  if (!upstream.ok) {
    return cachedJson(cache, context, { error: `adsb.lol HTTP ${upstream.status}` }, 502, ERROR_COOLDOWN_SECONDS);
  }

  const body = await upstream.text();
  const response = new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
    },
  });

  context.waitUntil(cache.put(context.request, response.clone()));
  return response;
}

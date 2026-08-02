/**
 * Live aircraft proxy — the one server-side route this project runs.
 *
 * adsb.lol sends no Access-Control-Allow-Origin header, so a browser can
 * never read its response directly (confirmed by hand: a fetch from a page
 * gets a 200 back and then has it withheld by the browser itself). This
 * route exists solely to sit between the two: Cloudflare's edge makes the
 * actual request — edge code isn't a browser, so CORS doesn't apply to it —
 * and hands the visitor's browser a same-origin JSON response instead.
 *
 * This is a deliberate, narrow exception to this project's "no backend, easy
 * to mirror, hard to take down" static-site posture (see docs/DEPLOYMENT.md
 * and the comments in wrangler.jsonc and astro.config.mjs). It carries no
 * state of its own: no binding, no KV, no D1, nothing written anywhere. If
 * this one route were ever pulled, every other page — the actual civic
 * datasets this project exists for — keeps working exactly as a plain static
 * mirror.
 *
 * The shared edge cache (below) is what keeps this from turning site traffic
 * into proportional load on adsb.lol's volunteer-run infrastructure: every
 * visitor hitting this route within the same ~8s window at the same
 * Cloudflare location gets one shared upstream fetch, not one each.
 *
 * A failed upstream call is cached too, for longer than a success — found
 * out why the hard way during development, when enough direct manual testing
 * against adsb.lol in a short window got this route a genuine 429. Without
 * negative caching, a burst of traffic landing during a rate-limit or an
 * outage would retry the upstream on every single request and keep the
 * problem going; with it, the whole route backs off together and heals on
 * its own once the cooldown passes.
 */

const ADSB_URL = 'https://api.adsb.lol/v2/point/46.3/-94.2/250';
const CACHE_SECONDS = 8;
const ERROR_COOLDOWN_SECONDS = 30;

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
    upstream = await fetch(ADSB_URL, {
      signal: AbortSignal.timeout(8000),
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

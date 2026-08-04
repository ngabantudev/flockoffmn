/**
 * Full bulk export of the flight_sightings table — the third read-only
 * flight-log route, alongside [hex].js and index.js. Exists to satisfy
 * ODbL §4.6's "offer-back" obligation now that LICENSE-DATA.md's "The
 * flight sighting log" section treats this persisted, queryable history as
 * a Derivative Database rather than merely a Produced Work: recipients must
 * be able to obtain a free, machine-readable copy of the whole table, not
 * just one-hex-at-a-time lookups. Independently useful to legal teams doing
 * bulk analysis rather than one-record citations.
 *
 * GET /api/flight-log/export?format=csv|json&after_id=
 *
 * No filters (full table, unlike [hex].js/index.js), ordered by id ASC,
 * paginated via a real after_id cursor rather than a hard cap — the ODbL
 * obligation this exists to satisfy requires the whole table be obtainable
 * eventually, not just the first page forever.
 *
 * A literal file at this path (functions/api/flight-log/export.js) takes
 * routing precedence over the dynamic [hex].js segment at the same depth,
 * so there's no collision between /api/flight-log/export and
 * /api/flight-log/{hex}.
 *
 * No per-IP throttling or auth here, deliberately: see docs/DEPLOYMENT.md's
 * "Flight sighting log (the second exception)" section — this project's
 * "no query logging, full stop" stance rules out tracking visitor
 * identifiers, which is what any application-level rate limit would
 * require. The Cache API TTL below is the only cost-control lever, by
 * design.
 */

import { CAVEATS, toExport, toCsv, CSV_COLUMNS, SECURITY_HEADERS } from '../../lib/flight-log-shared.mjs';

const PAGE_SIZE = 50_000;
const QUERY_LIMIT = PAGE_SIZE + 1; // one sentinel row to detect truncation without a second query
const CACHE_SECONDS = 300; // heavier query than the filtered endpoints — see functions/api/trace/[hex].js's precedent for caching longer on a heavier fetch

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const format = url.searchParams.get('format') ?? 'json';
  if (format !== 'json' && format !== 'csv') {
    return Response.json({ error: 'invalid format' }, { status: 400 });
  }

  const rawAfterId = url.searchParams.get('after_id');
  let afterId = null;
  if (rawAfterId !== null) {
    if (!/^\d+$/.test(rawAfterId)) {
      return Response.json({ error: 'invalid after_id' }, { status: 400 });
    }
    afterId = Number.parseInt(rawAfterId, 10);
  }

  const cache = caches.default;
  const cached = await cache.match(context.request);
  if (cached) return cached;

  let query = 'SELECT * FROM flight_sightings';
  const binds = [];
  if (afterId !== null) {
    query += ' WHERE id > ?';
    binds.push(afterId);
  }
  query += ' ORDER BY id ASC LIMIT ?';
  binds.push(QUERY_LIMIT);

  let result;
  try {
    result = await context.env.FLIGHT_SIGHTINGS_DB.prepare(query)
      .bind(...binds)
      .all();
  } catch (err) {
    return Response.json({ error: `database error: ${err.message || err}` }, { status: 500 });
  }

  const rows = result.results ?? [];
  const truncated = rows.length > PAGE_SIZE;
  const page = truncated ? rows.slice(0, PAGE_SIZE) : rows;
  const sightings = page.map(toExport);
  const nextAfterId = truncated ? sightings[sightings.length - 1].id : null;

  const date = new Date().toISOString().slice(0, 10);
  const afterSuffix = afterId !== null ? `-after-${afterId}` : '';

  const headers = {
    'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
    'X-Export-Truncated': truncated ? 'true' : 'false',
    ...SECURITY_HEADERS,
  };
  if (truncated) {
    headers['X-Export-Next-After-Id'] = String(nextAfterId);
  }

  let response;
  if (format === 'csv') {
    response = new Response(toCsv(sightings, CSV_COLUMNS), {
      status: 200,
      headers: {
        ...headers,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="flight-sightings-full-export-${date}${afterSuffix}.csv"`,
      },
    });
  } else {
    response = new Response(
      JSON.stringify({
        sightings,
        caveats: CAVEATS,
        count: sightings.length,
        truncated,
        nextAfterId,
      }),
      {
        status: 200,
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="flight-sightings-full-export-${date}${afterSuffix}.json"`,
        },
      },
    );
  }

  context.waitUntil(cache.put(context.request, response.clone()));
  return response;
}

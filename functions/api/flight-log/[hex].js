/**
 * Read-only flight-sighting history for one aircraft hex — the first half
 * of the citable flight-log API. Backs src/lib/flightLog.ts's
 * `FlightSightingExport` shape on the client/explainer side.
 *
 * GET-only. Reads migrations/0001_flight_sightings.sql's `flight_sightings`
 * table via the FLIGHT_SIGHTINGS_DB binding declared in the top-level
 * wrangler.jsonc — SELECT only, never INSERT/UPDATE from this file. The
 * only writer in the whole project is the separate
 * workers/flight-sightings-cron/ Cron Worker.
 *
 * No logging of query params anywhere — no console.log of request data, no
 * new logging middleware. See docs/DEPLOYMENT.md's "Flight sighting log
 * (the second exception)" section: this project does not build a durable,
 * queryable IP-to-tail-number log, full stop.
 */

import { CAVEATS, toExport, toCsv, CSV_COLUMNS, SECURITY_HEADERS } from '../../lib/flight-log-shared.mjs';

const HEX_PATTERN = /^[0-9a-f]{6}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/;
const CACHE_SECONDS = 60;

export async function onRequestGet(context) {
  const hex = String(context.params.hex ?? '').toLowerCase();
  if (!HEX_PATTERN.test(hex)) {
    return Response.json({ error: 'invalid hex' }, { status: 400 });
  }

  const url = new URL(context.request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const format = url.searchParams.get('format') ?? 'json';
  if (format !== 'json' && format !== 'csv') {
    return Response.json({ error: 'invalid format' }, { status: 400 });
  }
  if (from && !ISO_DATE_PATTERN.test(from)) {
    return Response.json({ error: 'invalid from date' }, { status: 400 });
  }
  if (to && !ISO_DATE_PATTERN.test(to)) {
    return Response.json({ error: 'invalid to date' }, { status: 400 });
  }

  let query = 'SELECT * FROM flight_sightings WHERE hex = ?';
  const binds = [hex];
  if (from) {
    query += ' AND event_at_utc >= ?';
    binds.push(from);
  }
  if (to) {
    query += ' AND event_at_utc <= ?';
    binds.push(to);
  }
  query += ' ORDER BY event_at_utc DESC LIMIT 500';

  let result;
  try {
    result = await context.env.FLIGHT_SIGHTINGS_DB.prepare(query)
      .bind(...binds)
      .all();
  } catch (err) {
    return Response.json({ error: `database error: ${err.message || err}` }, { status: 500 });
  }

  const sightings = (result.results ?? []).map(toExport);

  if (format === 'csv') {
    const date = new Date().toISOString().slice(0, 10);
    return new Response(toCsv(sightings, CSV_COLUMNS), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="flight-sightings-${hex}-${date}.csv"`,
        'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
        ...SECURITY_HEADERS,
      },
    });
  }

  return new Response(
    JSON.stringify({
      hex,
      sightings,
      caveats: CAVEATS,
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
        ...SECURITY_HEADERS,
      },
    },
  );
}

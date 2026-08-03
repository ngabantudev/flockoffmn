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

const HEX_PATTERN = /^[0-9a-f]{6}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/;
const CACHE_SECONDS = 60;

const CAVEATS = {
  pollingGranularity:
    'Ground-arrival and ground-departure timestamps are only as precise as the cron poll that observed them: this log is checked once per minute, not continuously.',
  airportLabeling:
    'Nearest-airport labeling is best-effort and Minnesota-only. Sightings elsewhere in the world will have a null airport field even when the aircraft is plainly on the ground somewhere.',
  callsignMatch:
    'A matching callsign is not registry confirmation of an ICE Air charter flight or its passengers — it means an aircraft broadcast a callsign matching a known charter pattern at the time of the sighting.',
};

function toExport(row) {
  return {
    id: row.id,
    hex: row.hex,
    callsign: row.callsign,
    aircraftType: row.aircraft_type,
    airportIcao: row.airport_icao,
    event: row.event,
    eventAtUtc: row.event_at_utc,
    lat: row.lat,
    lon: row.lon,
    groundDurationS: row.ground_duration_s,
    source: row.source,
  };
}

export async function onRequestGet(context) {
  const hex = String(context.params.hex ?? '').toLowerCase();
  if (!HEX_PATTERN.test(hex)) {
    return Response.json({ error: 'invalid hex' }, { status: 400 });
  }

  const url = new URL(context.request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
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

  return new Response(
    JSON.stringify({
      hex,
      sightings: (result.results ?? []).map(toExport),
      caveats: CAVEATS,
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
      },
    },
  );
}

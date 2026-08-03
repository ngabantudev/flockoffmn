/**
 * Read-only flight-sighting search — the second half of the citable
 * flight-log API, alongside functions/api/flight-log/[hex].js. Supports
 * `?callsign=`, `?from=`, `?to=`, `?limit=` (server-capped at 500
 * regardless of what's requested).
 *
 * GET-only, SELECT only — see [hex].js's header for the fuller rationale
 * (D1 binding, no query-param logging, single-writer-Worker architecture).
 */

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/;
const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 100;
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
  const url = new URL(context.request.url);
  const callsign = url.searchParams.get('callsign');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const rawLimit = url.searchParams.get('limit');

  if (from && !ISO_DATE_PATTERN.test(from)) {
    return Response.json({ error: 'invalid from date' }, { status: 400 });
  }
  if (to && !ISO_DATE_PATTERN.test(to)) {
    return Response.json({ error: 'invalid to date' }, { status: 400 });
  }

  let limit = DEFAULT_LIMIT;
  if (rawLimit !== null) {
    const parsed = Number.parseInt(rawLimit, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return Response.json({ error: 'invalid limit' }, { status: 400 });
    }
    limit = Math.min(parsed, MAX_LIMIT);
  }

  let query = 'SELECT * FROM flight_sightings WHERE 1=1';
  const binds = [];
  if (callsign) {
    query += ' AND callsign = ?';
    binds.push(callsign.trim().toUpperCase());
  }
  if (from) {
    query += ' AND event_at_utc >= ?';
    binds.push(from);
  }
  if (to) {
    query += ' AND event_at_utc <= ?';
    binds.push(to);
  }
  query += ' ORDER BY event_at_utc DESC LIMIT ?';
  binds.push(limit);

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

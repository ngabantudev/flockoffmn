/**
 * Shared flight-log helpers — extracted from functions/api/flight-log/[hex].js
 * and index.js (which used to each carry their own copy of `CAVEATS` and
 * `toExport`), and now also backing the new CSV export routes and the
 * per-record citation permalink/PDF routes
 * (functions/flight-log/record/[id].js and [id]/pdf.js).
 *
 * XSS threat model (traced through workers/flight-sightings-cron/index.mjs):
 * `callsign` and `aircraft_type` are copied directly from the raw upstream
 * ADS-B broadcast (`ac.flight`, `ac.t`) — an attacker who controls what an
 * aircraft broadcasts controls these fields, so anywhere they're rendered
 * into HTML they MUST go through escapeHtml() first. `airport_icao` is
 * computed server-side by the cron worker against this project's own static
 * mn-airports.geojson reference, so it can only ever be one of a small,
 * project-controlled set of ICAO codes — not attacker-influenceable, but
 * escaped anyway below for defense in depth / consistency rather than out of
 * real necessity.
 */

export const CAVEATS = {
  pollingGranularity:
    'Ground-arrival and ground-departure timestamps are only as precise as the cron poll that observed them: this log is checked once per minute, not continuously.',
  airportLabeling:
    'Nearest-airport labeling is best-effort and Minnesota-only. Sightings elsewhere in the world will have a null airport field even when the aircraft is plainly on the ground somewhere.',
  callsignMatch:
    'A matching callsign is not registry confirmation of an ICE Air charter flight or its passengers — it means an aircraft broadcast a callsign matching a known charter pattern at the time of the sighting.',
};

/**
 * Arrival/departure pairing is inferred by matching aircraft hex and
 * chronology, not a stored link — a gap in polling coverage or a
 * reassigned hex could rarely produce an incorrect or missing pairing.
 */
export const PAIRING_CAVEAT =
  'Arrival/departure pairing is inferred by matching aircraft hex and chronology, not a stored link — a gap in polling coverage or a reassigned hex could rarely produce an incorrect or missing pairing.';

export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
};

/**
 * A hand-set CSP for functions/flight-log/record/[id].js — the first
 * Function in this project that renders untrusted DB text into a
 * browser-executed HTML document. public/_headers only applies to static
 * assets, not Pages Functions responses, so this page needs its own CSP
 * rather than inheriting one that doesn't apply to it.
 */
export const RECORD_PAGE_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'";

export const CSV_COLUMNS = [
  'id',
  'hex',
  'callsign',
  'aircraftType',
  'airportIcao',
  'event',
  'eventAtUtc',
  'lat',
  'lon',
  'groundDurationS',
  'source',
];

export function toExport(row) {
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

/**
 * HTML-escapes &<>"' and normalizes null/undefined to ''. Every DB-sourced
 * string interpolated into functions/flight-log/record/[id].js's HTML output
 * MUST go through this first — see this file's header for why.
 */
export function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** RFC4180 field quoting: wrap in quotes and double any embedded quote if the field contains a comma, quote, or newline. */
function csvField(value) {
  if (value == null) return '';
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replaceAll('"', '""')}"`;
  }
  return str;
}

/** Renders rows (already in `toExport` shape) as an RFC4180 CSV body — header row + data rows, CRLF line endings. */
export function toCsv(rows, columns = CSV_COLUMNS) {
  const lines = [columns.map(csvField).join(',')];
  for (const row of rows) {
    lines.push(columns.map((col) => csvField(row[col])).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

/**
 * Server-side twin of FlightLog.astro's client-side formatDuration — an
 * intentional duplicate across the .ts/.mjs build boundary, the same
 * pattern this project already accepts for CAVEATS, needed here since
 * functions/flight-log/record/[id].js and [id]/pdf.js render outside
 * Astro's build entirely.
 */
export function formatDuration(seconds) {
  if (seconds == null || seconds < 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/**
 * Small styled HTML error page for functions/flight-log/record/[id].js —
 * shared so the 400/404/500 cases render a consistent look instead of a
 * bare Cloudflare error page. functions/flight-log/record/[id]/pdf.js
 * deliberately does NOT use this: its error responses are plain text, per
 * the plan (not worth a generated "not found" PDF for an error case nobody
 * cites).
 */
export function errorPage(status, title, message) {
  const body = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} — flockoffmn</title>
<style>
  :root { color-scheme: dark; }
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0a0c10;
    color: #e7ecf3;
    font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  }
  .card {
    max-width: 32rem;
    margin: 1.5rem;
    padding: 1.5rem 1.75rem;
    border: 1px solid #2a3140;
    border-radius: 0.75rem;
    background: #11141b;
  }
  h1 { margin: 0 0 0.5rem; font-size: 1.125rem; color: #e7ecf3; }
  p { margin: 0; color: #a3adbd; font-size: 0.9375rem; line-height: 1.5; }
  a { color: #f5a524; }
</style>
</head>
<body>
  <div class="card">
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
    <p style="margin-top: 0.75rem;"><a href="/flight-log">&larr; Back to flight log search</a></p>
  </div>
</body>
</html>`;
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      ...SECURITY_HEADERS,
    },
  });
}

/**
 * Fetches one flight_sightings row by id, plus its inferred paired
 * opposite-event row (nearest ground_arrival before a ground_departure, or
 * nearest ground_departure after a ground_arrival, on the same hex). Returns
 * null if the row itself doesn't exist. `paired` may legitimately be null
 * even when `row` exists (e.g. an aircraft that hasn't departed yet) — see
 * PAIRING_CAVEAT.
 *
 * @param {D1Database} db
 * @param {number|string} id
 * @returns {Promise<{row: object, paired: object|null}|null>}
 */
export async function getSightingWithPairing(db, id) {
  const row = await db.prepare('SELECT * FROM flight_sightings WHERE id = ?').bind(id).first();
  if (!row) return null;

  let paired = null;
  if (row.event === 'ground_departure') {
    paired = await db
      .prepare(
        'SELECT * FROM flight_sightings WHERE hex = ? AND event = ? AND event_at_utc <= ? ORDER BY event_at_utc DESC LIMIT 1',
      )
      .bind(row.hex, 'ground_arrival', row.event_at_utc)
      .first();
  } else if (row.event === 'ground_arrival') {
    paired = await db
      .prepare(
        'SELECT * FROM flight_sightings WHERE hex = ? AND event = ? AND event_at_utc >= ? ORDER BY event_at_utc ASC LIMIT 1',
      )
      .bind(row.hex, 'ground_departure', row.event_at_utc)
      .first();
  }

  return { row, paired: paired ?? null };
}

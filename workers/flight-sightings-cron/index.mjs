/**
 * flight-sightings-cron — the ONLY place in this project with a D1 write
 * binding.
 *
 * Everything else in flockoffmn is either a static build output or a
 * read-only Cloudflare Pages Function (functions/api/*). This is neither:
 * it's a separate deployable Cloudflare Worker with its own `wrangler.jsonc`,
 * because only a Worker can carry a Cron Trigger — Pages Functions only run
 * on an inbound HTTP request, so a ground-status transition that happens
 * while nobody's browser tab is open would otherwise go unrecorded, which
 * defeats the point of a durable log for exactly the off-hours transfer
 * flights this feature exists to document.
 *
 * See docs/DEPLOYMENT.md's "Flight sighting log (the second exception)"
 * section for the full rationale, and migrations/0001_flight_sightings.sql
 * for the schema this writes to.
 *
 * What it does, once a minute:
 *   1. Fetch adsb.lol's worldwide feed (same point/radius query as
 *      functions/api/ice-flights.js) and filter it down to known ICE Air
 *      charter callsigns using the shared ../../functions/lib/ice-charter-filter.mjs
 *      module — no drift between what the live map shows and what gets
 *      persisted here.
 *   2. For each matched aircraft, diff `alt_baro === 'ground'` against
 *      aircraft_state.last_status for that hex:
 *        - airborne -> ground: INSERT a ground_arrival row, upsert
 *          aircraft_state (last_status='ground', status_since_utc=now,
 *          arrival_row_id = the new row's id).
 *        - ground -> airborne: INSERT a ground_departure row (computing
 *          ground_duration_s from the remembered arrival row's
 *          event_at_utc), upsert aircraft_state (last_status='airborne',
 *          arrival_row_id=NULL).
 *        - no transition: no write at all. This is the core requirement —
 *          the table grows one row per state change, never one row per poll.
 *   3. Best-effort nearest-airport lookup against the Minnesota-only
 *      mn-airports.geojson reference. Most sightings will have
 *      airport_icao = null, since the feed is worldwide and the reference
 *      is not — that's an expected, documented gap, not a bug.
 *
 * No visitor data of any kind ever touches this file. It never receives a
 * request from a browser — it is invoked only by Cloudflare's Cron Trigger
 * scheduler.
 */

import { filterIceCharterFlights } from '../../functions/lib/ice-charter-filter.mjs';
import { haversineMeters } from '../../src/lib/geo.mjs';

const ADSB_GLOBAL_URL = 'https://api.adsb.lol/v2/point/0/0/10000';

/**
 * Fetched from the live site rather than bundled: this Worker has no build
 * step of its own (plain `wrangler deploy`, no Astro/Vite pass), and
 * fetching the same static file the site already publishes means the two
 * can never drift out of sync with each other. Cached in module scope for
 * the isolate's lifetime — Cloudflare may keep an isolate warm across many
 * scheduled invocations, and a Minnesota airport list changes on nobody's
 * one-minute clock.
 */
const AIRPORTS_URL = 'https://flockoffmn.org/data/reference/mn-airports.geojson';
const AIRPORT_CACHE_MS = 60 * 60 * 1000; // 1 hour
let airportCache = { fetchedAtMs: 0, airports: [] };

async function loadAirports() {
  if (airportCache.airports.length && Date.now() - airportCache.fetchedAtMs < AIRPORT_CACHE_MS) {
    return airportCache.airports;
  }
  try {
    const res = await fetch(AIRPORTS_URL, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return airportCache.airports;
    const geojson = await res.json();
    const airports = (geojson.features ?? [])
      .filter((f) => f.properties?.icao)
      .map((f) => ({
        icao: f.properties.icao,
        point: representativePointOf(f.geometry),
      }));
    airportCache = { fetchedAtMs: Date.now(), airports };
    return airports;
  } catch {
    // Best-effort — a failed fetch just means this poll's airport_icao
    // lookups fall back to whatever was previously cached (possibly empty).
    return airportCache.airports;
  }
}

/** Centroid of a Polygon/MultiPolygon's bounding box — good enough to pick "nearest airport". */
function representativePointOf(geometry) {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  const visit = (coords) => {
    if (typeof coords[0] === 'number') {
      const [lng, lat] = coords;
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
      return;
    }
    for (const c of coords) visit(c);
  };
  visit(geometry.coordinates);
  return [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
}

/** Nearest MN airport ICAO to a point, or null if too far / no reference loaded. */
const NEAREST_AIRPORT_MAX_METERS = 15_000; // ~9.3 miles — a landed aircraft's own airport, not a distant one
function nearestAirportIcao(airports, lon, lat) {
  if (typeof lon !== 'number' || typeof lat !== 'number' || !airports.length) return null;
  let best = null;
  let bestDist = Infinity;
  for (const a of airports) {
    const d = haversineMeters([lon, lat], a.point);
    if (d < bestDist) {
      bestDist = d;
      best = a.icao;
    }
  }
  return bestDist <= NEAREST_AIRPORT_MAX_METERS ? best : null;
}

function nowIso() {
  return new Date().toISOString(); // ISO 8601 with ms, matches Provenance.sourceDate convention
}

/**
 * One poll cycle: fetch, filter, diff against aircraft_state, write only on
 * a transition. Exported separately from the `scheduled` handler so
 * scripts/dev-tools/flight-sightings-check.mjs can drive it against a fixture
 * DB and fixture aircraft list without going anywhere near live adsb.lol.
 *
 * @param {D1Database} db
 * @param {object[]} aircraft - already-filtered ICE charter aircraft records
 * @param {{icao: string, point: [number, number]}[]} airports
 */
export async function processPoll(db, aircraft, airports) {
  const eventAt = nowIso();

  for (const ac of aircraft) {
    const hex = String(ac.hex ?? '').toLowerCase();
    if (!hex) continue;

    const isGround = ac.alt_baro === 'ground' || ac.alt === 'ground';
    const lat = typeof ac.lat === 'number' ? ac.lat : null;
    const lon = typeof ac.lon === 'number' ? ac.lon : null;
    const callsign = (ac.flight || '').trim() || null;
    const aircraftType = ac.t || null;
    const airportIcao = nearestAirportIcao(airports, lon, lat);

    const state = await db
      .prepare('SELECT hex, last_status, status_since_utc, arrival_row_id FROM aircraft_state WHERE hex = ?')
      .bind(hex)
      .first();

    const currentStatus = isGround ? 'ground' : 'airborne';

    if (!state) {
      // First time we've ever seen this hex — record the cursor in whatever
      // state it's already in, with no sighting row, since we didn't
      // observe the transition into this state (only its current state).
      await db
        .prepare(
          'INSERT INTO aircraft_state (hex, last_status, status_since_utc, last_seen_utc, arrival_row_id) VALUES (?, ?, ?, ?, NULL)',
        )
        .bind(hex, currentStatus, eventAt, eventAt)
        .run();
      continue;
    }

    const previousStatus = state.last_status;

    if (previousStatus === currentStatus) {
      // No transition — just refresh last_seen_utc, no new row.
      await db
        .prepare('UPDATE aircraft_state SET last_seen_utc = ? WHERE hex = ?')
        .bind(eventAt, hex)
        .run();
      continue;
    }

    if (currentStatus === 'ground') {
      // airborne -> ground: insert ground_arrival, upsert cursor.
      const insert = await db
        .prepare(
          `INSERT INTO flight_sightings
             (hex, callsign, aircraft_type, airport_icao, event, event_at_utc, lat, lon, ground_duration_s, source)
           VALUES (?, ?, ?, ?, 'ground_arrival', ?, ?, ?, NULL, 'adsb.lol')`,
        )
        .bind(hex, callsign, aircraftType, airportIcao, eventAt, lat, lon)
        .run();
      const arrivalRowId = insert.meta.last_row_id;

      await db
        .prepare(
          `INSERT INTO aircraft_state (hex, last_status, status_since_utc, last_seen_utc, arrival_row_id)
           VALUES (?, 'ground', ?, ?, ?)
           ON CONFLICT(hex) DO UPDATE SET
             last_status = 'ground',
             status_since_utc = excluded.status_since_utc,
             last_seen_utc = excluded.last_seen_utc,
             arrival_row_id = excluded.arrival_row_id`,
        )
        .bind(hex, eventAt, eventAt, arrivalRowId)
        .run();
    } else {
      // ground -> airborne: insert ground_departure, compute duration, clear cursor.
      let groundDurationS = null;
      if (state?.arrival_row_id) {
        const arrivalRow = await db
          .prepare('SELECT event_at_utc FROM flight_sightings WHERE id = ?')
          .bind(state.arrival_row_id)
          .first();
        if (arrivalRow?.event_at_utc) {
          const arrivalMs = Date.parse(arrivalRow.event_at_utc);
          const departureMs = Date.parse(eventAt);
          if (Number.isFinite(arrivalMs) && Number.isFinite(departureMs)) {
            groundDurationS = Math.max(0, Math.round((departureMs - arrivalMs) / 1000));
          }
        }
      }

      await db
        .prepare(
          `INSERT INTO flight_sightings
             (hex, callsign, aircraft_type, airport_icao, event, event_at_utc, lat, lon, ground_duration_s, source)
           VALUES (?, ?, ?, ?, 'ground_departure', ?, ?, ?, ?, 'adsb.lol')`,
        )
        .bind(hex, callsign, aircraftType, airportIcao, eventAt, lat, lon, groundDurationS)
        .run();

      await db
        .prepare(
          `INSERT INTO aircraft_state (hex, last_status, status_since_utc, last_seen_utc, arrival_row_id)
           VALUES (?, 'airborne', ?, ?, NULL)
           ON CONFLICT(hex) DO UPDATE SET
             last_status = 'airborne',
             status_since_utc = excluded.status_since_utc,
             last_seen_utc = excluded.last_seen_utc,
             arrival_row_id = NULL`,
        )
        .bind(hex, eventAt, eventAt)
        .run();
    }
  }
}

async function fetchAndFilter() {
  const upstream = await fetch(ADSB_GLOBAL_URL, {
    signal: AbortSignal.timeout(15000),
    headers: {
      'User-Agent': 'flockoffmn/flight-sightings-cron (civic transparency project; github.com/ngabantudev/flockoffmn)',
    },
  });
  if (!upstream.ok) throw new Error(`adsb.lol HTTP ${upstream.status}`);
  const text = await upstream.text();
  return filterIceCharterFlights(text);
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        let matched;
        try {
          matched = await fetchAndFilter();
        } catch (err) {
          console.error(`[flight-sightings-cron] adsb.lol fetch failed: ${err.message || err}`);
          return;
        }
        const airports = await loadAirports();
        try {
          await processPoll(env.FLIGHT_SIGHTINGS_DB, matched, airports);
        } catch (err) {
          console.error(`[flight-sightings-cron] D1 write failed: ${err.message || err}`);
        }
      })(),
    );
  },
};

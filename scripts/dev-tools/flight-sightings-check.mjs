#!/usr/bin/env node
/**
 * Flight-sighting cron logic check — a manual, local-only diagnostic.
 *
 * Unlike scripts/dev-tools/live-flights-check.mjs, THIS SCRIPT DOES WRITE:
 * it applies migrations/0001_flight_sightings.sql and runs several
 * simulated poll cycles against a local `wrangler d1 --local` SQLite
 * instance (under workers/flight-sightings-cron/.wrangler/state — never
 * touches any real/remote D1 database). Don't copy this script's behavior
 * into anything that runs against production data without meaning to.
 *
 * It does NOT talk to live adsb.lol. It drives
 * workers/flight-sightings-cron/index.mjs's exported `processPoll(db,
 * aircraft, airports)` directly against a hand-written fixture: one
 * aircraft that goes airborne -> ground -> (stays on ground for a couple of
 * polls) -> airborne again. The point is asserting the core requirement of
 * the whole feature — exactly one `ground_arrival` row and one
 * `ground_departure` row get written per simulated ground stop, never one
 * row per poll — since a bug here would silently turn a once-a-minute cron
 * into a table that grows forever for every aircraft in view.
 *
 * Usage:
 *   node scripts/dev-tools/flight-sightings-check.mjs
 *   (or: npm run dev:flight-sightings-check)
 *
 * Requires `wrangler` (already a devDependency) and a local D1 instance,
 * which this script creates/migrates itself under
 * workers/flight-sightings-cron/.wrangler/state/v3/d1 — safe to delete that
 * directory between runs if you want a clean slate.
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { processPoll } from '../../workers/flight-sightings-cron/index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WORKER_DIR = path.join(ROOT, 'workers/flight-sightings-cron');
const DB_NAME = 'flockoffmn-flight-sightings';

/**
 * A minimal D1Database-shaped adapter over `wrangler d1 execute --local`.
 * Not fast (each call shells out to a fresh wrangler process), which is
 * fine for a handful of simulated polls in a diagnostic — not something
 * this project would ever do per-request.
 *
 * Binds are inlined into the SQL text (escaped) rather than passed as real
 * parameters, since the CLI's --command has no parameter-binding of its
 * own. Safe here because every value going through this script comes from
 * the fixture below, never from anything external.
 */
function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

function runSql(sql) {
  const out = execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', DB_NAME, '--local', '--json', '--command', sql],
    { cwd: WORKER_DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  );
  const parsed = JSON.parse(out);
  // wrangler returns an array, one entry per statement in the batch.
  return parsed[0] ?? { results: [], meta: {} };
}

function localD1() {
  return {
    prepare(sql) {
      return {
        bind(...args) {
          let i = 0;
          const filled = sql.replace(/\?/g, () => sqlLiteral(args[i++]));
          return {
            async first() {
              const { results } = runSql(filled);
              return results?.[0] ?? null;
            },
            async run() {
              const { meta } = runSql(filled);
              return { meta: meta ?? {} };
            },
            async all() {
              const { results } = runSql(filled);
              return { results: results ?? [] };
            },
          };
        },
      };
    },
  };
}

function applyMigration() {
  console.log('[flight-sightings-check] applying migrations/0001_flight_sightings.sql to local D1...');
  execFileSync(
    'npx',
    [
      'wrangler',
      'd1',
      'execute',
      DB_NAME,
      '--local',
      '--file',
      path.join(ROOT, 'migrations/0001_flight_sightings.sql'),
    ],
    { cwd: WORKER_DIR, stdio: 'inherit' },
  );
}

function resetFixtureHex(hex) {
  // Idempotent re-runs: clear any prior state for this fixture hex.
  runSql(`DELETE FROM flight_sightings WHERE hex = ${sqlLiteral(hex)}`);
  runSql(`DELETE FROM aircraft_state WHERE hex = ${sqlLiteral(hex)}`);
}

const FIXTURE_HEX = 'test01';
const FIXTURE_CALLSIGN = 'LYM300 ';

/** Four simulated polls: airborne, ground, ground (no transition), airborne. */
const POLLS = [
  { alt_baro: 5000, note: 'airborne — establishes baseline, no sighting row expected yet' },
  { alt_baro: 'ground', note: 'lands — expect exactly one ground_arrival row' },
  { alt_baro: 'ground', note: 'still on ground — expect NO new row' },
  { alt_baro: 5000, note: 'departs — expect exactly one ground_departure row' },
];

async function main() {
  applyMigration();
  const db = localD1();
  resetFixtureHex(FIXTURE_HEX);

  for (const poll of POLLS) {
    console.log(`[flight-sightings-check] poll: ${poll.note}`);
    const aircraft = [
      {
        hex: FIXTURE_HEX,
        flight: FIXTURE_CALLSIGN,
        t: 'B737',
        alt_baro: poll.alt_baro,
        lat: 44.88,
        lon: -93.22,
      },
    ];
    await processPoll(db, aircraft, []); // empty airports list — airport_icao isn't under test here
  }

  const { results } = runSql(
    `SELECT event FROM flight_sightings WHERE hex = ${sqlLiteral(FIXTURE_HEX)} ORDER BY id ASC`,
  );
  const arrivals = results.filter((r) => r.event === 'ground_arrival').length;
  const departures = results.filter((r) => r.event === 'ground_departure').length;

  console.log(`[flight-sightings-check] rows written: ${results.length} (arrivals=${arrivals}, departures=${departures})`);

  const pass = results.length === 2 && arrivals === 1 && departures === 1;
  if (pass) {
    console.log('[flight-sightings-check] PASS — exactly one ground_arrival + one ground_departure, no per-poll duplication.');
  } else {
    console.error('[flight-sightings-check] FAIL — expected exactly 2 rows (1 arrival, 1 departure).');
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('[flight-sightings-check] error:', err);
  process.exitCode = 1;
});

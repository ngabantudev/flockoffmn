import type { Confidence, Provenance } from '../layers/types';

/**
 * Types for the persisted flight-sighting log — parallel to liveFlights.ts,
 * but deliberately NOT under src/layers/: this data isn't fixed in
 * Minnesota (FeatureProperties.state is always 'MN' in that contract, see
 * src/layers/types.ts), so it isn't registered as a LayerId and never
 * touches src/layers/registry.ts.
 *
 * Backs functions/api/flight-log/[hex].js and functions/api/flight-log/index.js,
 * which read (never write) migrations/0001_flight_sightings.sql's
 * `flight_sightings` table. The actual writer is the separate
 * workers/flight-sightings-cron/ Cron Worker — see that file's header.
 */

export type FlightSightingEvent = 'ground_arrival' | 'ground_departure';

/** One row of migrations/0001_flight_sightings.sql, as returned by the read endpoints. */
export interface FlightSightingExport {
  id: number;
  hex: string;
  callsign: string | null;
  aircraftType: string | null;
  /** Best-effort nearest-MN-airport ICAO code. Null for most worldwide sightings — see caveats. */
  airportIcao: string | null;
  event: FlightSightingEvent;
  eventAtUtc: string;
  lat: number | null;
  lon: number | null;
  /** Set only on ground_departure rows. */
  groundDurationS: number | null;
  source: string;
}

/**
 * Fixed, plain-English caveats returned inline on every flight-log API
 * response, so a citation of the raw JSON is self-documenting even without
 * this repo's docs alongside it. Paraphrases the spirit of `liveFlightsCaveat`
 * in src/i18n/en.ts without importing it — this is a JSON API payload, not
 * UI copy.
 */
export interface FlightLogCaveats {
  pollingGranularity: string;
  airportLabeling: string;
  callsignMatch: string;
}

export const FLIGHT_LOG_CAVEATS: FlightLogCaveats = {
  pollingGranularity:
    'Ground-arrival and ground-departure timestamps are only as precise as the cron poll that observed them: this log is checked once per minute, not continuously.',
  airportLabeling:
    'Nearest-airport labeling is best-effort and Minnesota-only. Sightings elsewhere in the world will have a null airport field even when the aircraft is plainly on the ground somewhere.',
  callsignMatch:
    'A matching callsign is not registry confirmation of an ICE Air charter flight or its passengers — it means an aircraft broadcast a callsign matching a known charter pattern at the time of the sighting.',
};

/** Provenance block for the flight-sighting log, shaped like every other layer's citation. */
export const FLIGHT_LOG_PROVENANCE: Provenance = {
  source: 'adsb.lol via flockoffmn flight-sightings-cron',
  sourceUrl: 'https://adsb.lol/',
  license: 'adsb.lol terms — NOT YET VETTED for persisted/redistributed derived data (see LICENSE-DATA.md)',
  licenseUrl: null,
  attribution: 'ADS-B data via adsb.lol; ICE Air charter callsign pattern via Otter Goose (ottergoose.net)',
  sourceDate: null,
  lastUpdated: null,
  refresh: 'frequent',
};

/** Always 'reported', never 'confirmed' — matches the live overlay's own hedge in src/lib/liveFlights.ts. */
export const FLIGHT_LOG_CONFIDENCE: Confidence = 'reported';

-- Flight sighting log — see workers/flight-sightings-cron/index.mjs for the
-- only place that writes to this schema, and docs/DEPLOYMENT.md's "Flight
-- sighting log (the second exception)" section for why it exists.
--
-- flight_sightings holds one row per ground-status TRANSITION, not one row
-- per poll: the cron worker diffs each aircraft's current status against
-- aircraft_state and only writes on an actual airborne<->ground change.
--
-- aircraft_state is a cursor the cron diffs against, not a log itself — it
-- always holds exactly the latest known status per aircraft hex.
CREATE TABLE flight_sightings (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  hex               TEXT NOT NULL,
  callsign          TEXT,
  aircraft_type     TEXT,
  airport_icao      TEXT,
  event             TEXT NOT NULL CHECK (event IN ('ground_arrival','ground_departure')),
  event_at_utc      TEXT NOT NULL,
  lat               REAL,
  lon               REAL,
  ground_duration_s INTEGER,
  source            TEXT NOT NULL DEFAULT 'adsb.lol',
  created_at_utc    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_sightings_hex_time ON flight_sightings (hex, event_at_utc);
CREATE INDEX idx_sightings_callsign_time ON flight_sightings (callsign, event_at_utc);
CREATE INDEX idx_sightings_airport_time ON flight_sightings (airport_icao, event_at_utc);

CREATE TABLE aircraft_state (
  hex              TEXT PRIMARY KEY,
  last_status      TEXT CHECK (last_status IN ('airborne','ground')),
  status_since_utc TEXT,
  last_seen_utc    TEXT,
  arrival_row_id   INTEGER
);

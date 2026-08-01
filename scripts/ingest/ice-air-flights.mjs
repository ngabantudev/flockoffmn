#!/usr/bin/env node
/**
 * Observed ICE Air flights — a discrete log, not a live position.
 *
 * Every other layer in this repo is a scraped snapshot of a stable upstream
 * URL. This one can't be: no agency publishes ICE Air departure manifests,
 * and the best available source — Minnesota 50501's volunteer observation
 * log, compiled by Nick Benson — is a session-authenticated Airtable share
 * view with no stable public API to script against (its own "download CSV"
 * button calls an internal endpoint keyed to a per-page-load token, not a
 * fetchable URL). So this follows the precedent already set by
 * data-centers.mjs: a hand-maintained, PR-reviewed JSON file
 * (data/community/ice-air-flights.json) that a human transcribes new
 * entries into, and this script only validates and republishes.
 *
 * confidence is 'reported' on every record, unconditionally — this is
 * eyewitness observation, never government-confirmed, and the registry
 * entry says so plainly.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { writeLayer, log, slugId, ROOT } from './lib/util.mjs';

// Minneapolis-St. Paul International Airport (KMSP) reference point. Every
// flight is pinned here — the observation location — never at a drawn route
// to the reported destination; see the curated file's own rules for why.
const MSP = { lng: -93.22167, lat: 44.88194 };

async function main() {
  const p = path.join(ROOT, 'data/community/ice-air-flights.json');
  const doc = JSON.parse(await readFile(p, 'utf8'));

  const features = [];
  for (const flight of doc.flights ?? []) {
    const sourceKeys = Object.keys(flight.asserts ?? {});
    if (!sourceKeys.length) {
      throw new Error(`flight on ${flight.date} (${flight.tailNumber}) asserts nothing; every record needs a source`);
    }
    for (const key of sourceKeys) {
      if (!doc.sources[key]) throw new Error(`unknown source key "${key}" on flight ${flight.date} (${flight.tailNumber})`);
    }
    if (!flight.date || !flight.tailNumber) {
      throw new Error(`flight record missing a date or tailNumber: ${JSON.stringify(flight)}`);
    }

    const citedSources = sourceKeys.map((key) => doc.sources[key]);

    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [MSP.lng, MSP.lat] },
      properties: {
        id: slugId('ice-air-flight', flight.date, flight.tailNumber),
        layer: 'observed_ice_flight',
        name: `${flight.tailNumber} — ${flight.date}`,
        county: 'Hennepin',
        state: 'MN',
        countyFips: '27053',
        confidence: 'reported',
        sourceDate: flight.date,
        attributes: {
          airport: flight.airport ?? 'MSP',
          tailNumber: flight.tailNumber,
          reportedPassengerCount: flight.reportedPassengerCount ?? null,
          reportedDestinations: (flight.reportedDestinations ?? []).join('; ') || null,
          reportedBy: citedSources.map((s) => s.name).join('; '),
          sourceNote: sourceKeys.map((key) => flight.asserts[key]?.note).filter(Boolean).join('; ') || null,
        },
      },
    });
  }

  log('ice-air-flights', `${features.length} observed flight(s) loaded from data/community/ice-air-flights.json`);

  const primary = doc.sources[Object.keys(doc.sources)[0]];

  await writeLayer('observed-ice-flights', {
    layer: 'observed_ice_flight',
    provenance: {
      source: primary?.name ?? 'Community-observed ICE Air flights',
      sourceUrl: primary?.url ?? null,
      license: primary?.license ?? 'No formal license stated',
      licenseUrl: null,
      // Name and org only, never the compiler's email — that lives in the
      // curated source file for our own correction/verification reference,
      // not baked into a machine-readable dataset anyone can scrape in bulk.
      attribution: primary?.compilerCredit ?? 'Volunteer observers',
      sourceDate: null,
      refresh: 'periodic',
      secondarySources: Object.entries(doc.sources)
        .slice(1)
        .map(([key, s]) => ({
          key,
          name: s.name,
          url: s.url,
          license: s.license ?? 'No formal license stated',
          licenseUrl: null,
          contributes: {
            en: 'Additional observed ICE Air flights.',
            es: 'Vuelos adicionales de ICE Air observados.',
          },
        })),
    },
    knownGaps: [
      'This is a volunteer observation log, not a government record. No agency publishes ICE Air departure manifests or passenger counts for these flights.',
      'Passenger counts and destinations are as reported by observers at the time, not verified against any official manifest.',
      'A flight not appearing here does not mean it did not happen — only that no observer logged it. The compiler states best effort to log within 24 hours of a flight and believes the log is complete back to 2025-10-01, but neither is guaranteed.',
      'Every record is pinned to MSP airport itself, not a drawn flight path — the reported destination is text, not a verified route.',
      'This file is updated by hand from the cited source, which has no stable public API; expect a lag between a flight happening and its appearance here.',
    ],
    features,
  });
}

main().catch((err) => {
  console.error(`[ice-air-flights] FAILED: ${err.message}`);
  process.exit(1);
});

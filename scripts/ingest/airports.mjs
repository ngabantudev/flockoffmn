#!/usr/bin/env node
/**
 * Minnesota airport boundaries — reference data, not a registry layer.
 *
 * Exists to give the live-flights overlay something to anchor a plane's
 * trail to: an aircraft's "expected path" or full historical trace means a
 * lot more with the airport it came from actually drawn on the map. Not a
 * civic-transparency finding in its own right, so it lives beside
 * mn-jurisdictions.geojson under public/data/reference/ rather than in the
 * layer registry — same reasoning jurisdictions.mjs gives for its own file.
 *
 * Pulls `aeroway=aerodrome` ways tagged in OpenStreetMap within Minnesota's
 * administrative boundary. Only way geometry is handled — a handful of the
 * largest airports are mapped as multipolygon relations instead of a single
 * way, and reconstructing a relation's outer/inner rings correctly is real
 * work this script doesn't do; those are logged and skipped rather than
 * drawn wrong. Kept only if OSM records an actual identifier (ICAO, IATA, or
 * FAA LID) — that excludes unnamed private strips without dropping any real
 * public-use airport, which practically all carry at least one.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { log, queryOverpass, PUBLIC_DATA } from './lib/util.mjs';

const STATE_ISO = process.env.STATE_ISO ?? 'US-MN';

const QUERY = `
[out:json][timeout:180];
area["ISO3166-2"="${STATE_ISO}"]["admin_level"="4"]->.scope;
(
  way["aeroway"="aerodrome"](area.scope);
  relation["aeroway"="aerodrome"](area.scope);
);
out geom;
`.trim();

function closedRing(geometry) {
  const ring = geometry.map((pt) => [pt.lon, pt.lat]);
  const [firstLng, firstLat] = ring[0];
  const [lastLng, lastLat] = ring[ring.length - 1];
  if (firstLng !== lastLng || firstLat !== lastLat) ring.push([firstLng, firstLat]);
  return ring;
}

async function main() {
  const data = await queryOverpass('airports', QUERY);
  const elements = data.elements ?? [];

  const ways = elements.filter((el) => el.type === 'way');
  const relations = elements.filter((el) => el.type === 'relation');
  log('airports', `Overpass returned ${ways.length} way(s), ${relations.length} relation(s)`);
  if (relations.length) {
    log(
      'airports',
      `skipping ${relations.length} relation(s) (multipolygon reconstruction not implemented): ` +
        relations.map((r) => r.tags?.name ?? r.id).join(', '),
    );
  }

  const features = [];
  for (const way of ways) {
    const tags = way.tags ?? {};
    const identifier = tags.icao ?? tags.iata ?? tags.faa ?? null;
    if (!tags.name || !identifier) continue;
    if (!way.geometry || way.geometry.length < 3) continue;

    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [closedRing(way.geometry)] },
      properties: {
        name: tags.name,
        icao: tags.icao ?? null,
        iata: tags.iata ?? null,
        faa: tags.faa ?? null,
        label: tags.iata ?? tags.icao ?? tags.faa,
      },
    });
  }
  log('airports', `kept ${features.length} identified, named airport(s)`);
  if (!features.length) {
    throw new Error('Overpass returned no identifiable airports; refusing to overwrite the file');
  }

  const dir = path.join(PUBLIC_DATA, 'reference');
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, 'mn-airports.geojson'),
    JSON.stringify({
      type: 'FeatureCollection',
      metadata: {
        source: 'OpenStreetMap via Overpass API',
        sourceUrl: 'https://www.openstreetmap.org/',
        license: 'ODbL 1.0',
        licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
        attribution: '© OpenStreetMap contributors',
        fetchedAt: new Date().toISOString(),
        note:
          'Way-geometry aerodromes only, tagged with an ICAO, IATA, or FAA identifier. ' +
          'Airports mapped as multipolygon relations are not included.',
      },
      features,
    }),
  );
  log('airports', `wrote ${features.length} airport(s) -> public/data/reference/mn-airports.geojson`);
}

main().catch((err) => {
  console.error(`[airports] FAILED: ${err.message}`);
  process.exit(1);
});

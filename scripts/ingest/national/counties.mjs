#!/usr/bin/env node
/**
 * Builds the county reference index: simplified boundaries + interior points
 * for every county in the target state.
 *
 * This is the backbone of two things:
 *
 *  1. Geocoding the 287(g) layer. ICE publishes agency agreements with no
 *     coordinates, only a county name (spec §6 L2). We resolve that name to a
 *     Census GEOID and place the agency at the county's interior point. Because
 *     the lookup keys on Census identifiers rather than anything Minnesota-
 *     specific, the same code extends nationally by changing STATE_FIPS —
 *     which settles the open question in spec §14.
 *
 *  2. The "near me" panel (F4). Working out which county an address falls in
 *     has to happen in the browser, so the boundaries must be small enough to
 *     ship. Census full-resolution MN counties are ~7.7 MB; requesting
 *     simplified geometry brings that under 100 KB with no visible loss at the
 *     zoom levels this map uses.
 *
 * Sources are both US federal public-domain works, no API key required.
 */

import { fetchWithRetry, unzip, log, writeReferenceJson } from '../lib/util.mjs';

const STATE_FIPS = process.env.STATE_FIPS ?? '27'; // Minnesota
const STATE_USPS = process.env.STATE_USPS ?? 'MN';

// Degrees of simplification. 0.002° ≈ 200 m, invisible at county zoom.
const SIMPLIFY = 0.002;

const TIGERWEB =
  'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1/query';
const GAZETTEER =
  'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2023_Gazetteer/2023_Gaz_counties_national.zip';
const PLACE_GAZETTEER =
  'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2023_Gazetteer/2023_Gaz_place_national.zip';

async function fetchBoundaries() {
  const params = new URLSearchParams({
    where: `STATE='${STATE_FIPS}'`,
    outFields: 'GEOID,NAME,BASENAME',
    returnGeometry: 'true',
    maxAllowableOffset: String(SIMPLIFY),
    f: 'geojson',
  });
  const res = await fetchWithRetry(`${TIGERWEB}?${params}`, { timeoutMs: 90_000 });
  const json = await res.json();
  if (!json.features?.length) throw new Error('TIGERweb returned no counties');
  log('counties', `fetched ${json.features.length} simplified boundaries from Census TIGERweb`);
  return json.features;
}

async function fetchCentroids() {
  const res = await fetchWithRetry(GAZETTEER, { timeoutMs: 90_000 });
  const zip = unzip(Buffer.from(await res.arrayBuffer()));
  const entry = [...zip.keys()].find((n) => n.endsWith('.txt'));
  if (!entry) throw new Error('gazetteer archive contained no .txt member');

  // The gazetteer is tab-separated latin-1 with padded column names.
  const lines = zip.get(entry).toString('latin1').split(/\r?\n/);
  const header = lines[0].split('\t').map((h) => h.trim());
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));

  const out = new Map();
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cells = line.split('\t').map((c) => c.trim());
    if (cells[idx.USPS] !== STATE_USPS) continue;
    out.set(cells[idx.GEOID], {
      name: cells[idx.NAME],
      lat: Number(cells[idx.INTPTLAT]),
      lng: Number(cells[idx.INTPTLONG]),
      landSqMi: Number(cells[idx.ALAND_SQMI]),
    });
  }
  log('counties', `fetched ${out.size} interior points from Census gazetteer`);
  return out;
}

/**
 * Every incorporated place in the state, as a flat name/lat/lng list.
 *
 * This is what makes the "near me" lookup work without a geocoder. Sending a
 * typed address to Nominatim or a commercial geocoder would hand a third party
 * the one piece of information this project promises not to collect (spec §8),
 * so instead we ship the place list and resolve the lookup entirely in the
 * browser. Precision is town-level rather than street-level — an honest
 * trade, and stated plainly in the UI.
 */
async function fetchPlaces() {
  const res = await fetchWithRetry(PLACE_GAZETTEER, { timeoutMs: 90_000 });
  const zip = unzip(Buffer.from(await res.arrayBuffer()));
  const entry = [...zip.keys()].find((n) => n.endsWith('.txt'));
  const lines = zip.get(entry).toString('latin1').split(/\r?\n/);
  const header = lines[0].split('\t').map((h) => h.trim());
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));

  const places = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const c = line.split('\t').map((x) => x.trim());
    if (c[idx.USPS] !== STATE_USPS) continue;
    places.push({
      name: c[idx.NAME].replace(/\s+(city|town|village|borough|CDP)$/i, ''),
      lat: Number(c[idx.INTPTLAT]),
      lng: Number(c[idx.INTPTLONG]),
    });
  }
  places.sort((a, b) => a.name.localeCompare(b.name));
  log('counties', `indexed ${places.length} places for offline location search`);
  return places;
}

async function main() {
  const [boundaries, centroids, places] = await Promise.all([
    fetchBoundaries(),
    fetchCentroids(),
    fetchPlaces(),
  ]);

  const features = boundaries.map((f) => {
    const geoid = f.properties.GEOID;
    const c = centroids.get(geoid);
    // BASENAME is the bare name ("Lac qui Parle"); NAME includes the suffix.
    const name = f.properties.NAME ?? `${f.properties.BASENAME} County`;
    if (!c) log('counties', `warning: no gazetteer centroid for ${name} (${geoid})`);
    return {
      type: 'Feature',
      geometry: f.geometry,
      properties: {
        geoid,
        name,
        basename: f.properties.BASENAME,
        state: STATE_USPS,
        // Interior point, guaranteed to fall inside the polygon — unlike a
        // bounding-box centre, which lands in the lake for some MN counties.
        lat: c?.lat ?? null,
        lng: c?.lng ?? null,
        landSqMi: c?.landSqMi ?? null,
      },
    };
  });

  const missing = features.filter((f) => f.properties.lat === null);
  if (missing.length) {
    throw new Error(`${missing.length} counties have no centroid; refusing to write a partial index`);
  }

  await writeReferenceJson('mn-counties.geojson', {
    type: 'FeatureCollection',
    metadata: {
      source: 'US Census Bureau — TIGERweb (boundaries) and 2023 Gazetteer (interior points)',
      sourceUrl: 'https://www.census.gov/geographies/reference-files.html',
      license: 'Public domain (US federal government work)',
      attribution: 'U.S. Census Bureau',
      simplifiedDegrees: SIMPLIFY,
      lastUpdated: new Date().toISOString(),
    },
    features,
  });
  log('counties', `wrote ${features.length} counties -> public/data/reference/mn-counties.geojson`);

  await writeReferenceJson('mn-places.json', {
    metadata: {
      source: 'US Census Bureau — 2023 Gazetteer (places)',
      license: 'Public domain (US federal government work)',
      attribution: 'U.S. Census Bureau',
      note: 'Shipped so location lookup can run entirely in the browser, with no geocoding request to any third party.',
      lastUpdated: new Date().toISOString(),
    },
    places,
  });
  log('counties', `wrote ${places.length} places -> public/data/reference/mn-places.json`);
}

main().catch((err) => {
  console.error(`[counties] FAILED: ${err.message}`);
  process.exit(1);
});

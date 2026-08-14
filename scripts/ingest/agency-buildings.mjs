#!/usr/bin/env node
/**
 * L? — Law enforcement building locations.
 *
 * The University of Minnesota's U-Spatial group maintains a statewide
 * inventory of active law enforcement facility locations, built through a
 * critical-infrastructure inventory process with local officials and kept
 * current on a rolling basis. One point per building — not one per agency:
 * a department that runs several stations (Minneapolis's five numbered
 * precincts, Saint Paul's substations) appears once per building, which is
 * also what makes this dataset resolve the very subdivision the jurisdiction
 * layer folds into one polygon (see agency-jurisdictions.mjs).
 *
 * Runs after agency-jurisdictions.mjs so it can join each building to that
 * layer's own agency name — the two datasets format the same department
 * differently often enough (case, "Department of Public Safety" vs the MESB
 * routing name) that joining against our own canonical name, rather than
 * re-deriving one, is what keeps the two layers pointing at each other
 * reliably.
 */

import {
  fetchWithRetry,
  loadCounties,
  writeLayer,
  log,
  slugId,
  normaliseAgency,
  agencyType,
  loadPublicJson,
} from './lib/util.mjs';
import { findContaining } from '../../src/lib/geo.mjs';

const SERVICE =
  'https://services.arcgis.com/8df8p0NlLFEShl0r/arcgis/rest/services/ci_all_gdb_2_view/FeatureServer/0/query';
const DATASET_PAGE = 'https://gisdata.mn.gov/dataset/struc-law-enforce-mn';

/**
 * Keyed by this dataset's normalised NAME_STD, valued by our own normalised
 * jurisdiction name. Only the departments whose two names stay different
 * *after* util.mjs's normaliseAgency has folded "Department", "Office" and
 * "Public Safety" — an earlier version of this table carried four more
 * entries that the shared normaliser already resolves, which is what a
 * hand-maintained list costs when it compensates for a weaker key.
 *
 * Checked one at a time against the source data, not fuzzy-matched, so a name
 * that isn't here just has no building on record rather than a guessed one.
 */
const NAME_ALIASES = {
  'dakota county law enforcement': 'dakota county sheriff',
  // "New Brighton Department of Public Safety - Police" folds to a doubled
  // word, because normaliseAgency rewrites "public safety" to "police" and
  // this name carries both.
  'new brighton police police': 'new brighton police',
  'minneapolis st paul international airport police': 'metropolitan airports commission police',
};

async function loadJurisdictions() {
  return loadPublicJson('agency-jurisdictions.geojson', {
    runFirst: 'node scripts/ingest/agency-jurisdictions.mjs',
  });
}

async function main() {
  const params = new URLSearchParams({
    where: "STATE='MN'",
    outFields: 'NAME_STD,NAME_2,ADDRESS,CITY,COUNTY',
    outSR: '4326',
    returnGeometry: 'true',
    f: 'geojson',
  });
  const res = await fetchWithRetry(`${SERVICE}?${params}`, { timeoutMs: 120_000 });
  const raw = await res.json();
  if (!raw.features?.length) throw new Error('U-Spatial service returned no buildings');
  log('agency-buildings', `fetched ${raw.features.length} Minnesota law-enforcement buildings`);

  const [jurisdictions, counties] = await Promise.all([loadJurisdictions(), loadCounties()]);
  const byNormName = new Map(
    jurisdictions.features.map((f) => [normaliseAgency(f.properties.name), f]),
  );

  const features = [];
  const unmatchedNames = new Set();
  for (const f of raw.features) {
    const rawName = f.properties.NAME_STD ?? '';
    const key = normaliseAgency(rawName);
    const jurisdiction = byNormName.get(key) ?? byNormName.get(NAME_ALIASES[key]);

    // ArcGIS will happily return an attribute row with no shape. Skip it
    // rather than destructuring null and failing the whole ingest over one
    // unmapped building.
    if (f.geometry?.type !== 'Point' || !Array.isArray(f.geometry.coordinates)) continue;
    const [lng, lat] = f.geometry.coordinates;
    const county = findContaining([lng, lat], counties.features);
    const subStation = (f.properties.NAME_2 ?? '').trim() || null;

    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: {
        id: slugId('agency-building', rawName, subStation ?? '', f.properties.ADDRESS ?? ''),
        layer: 'agency_building',
        name: subStation ? `${jurisdiction?.properties.name ?? rawName} — ${subStation}` : (jurisdiction?.properties.name ?? rawName),
        county: county?.properties.name ?? null,
        state: 'MN',
        countyFips: county?.properties.geoid ?? null,
        confidence: 'confirmed',
        sourceDate: null,
        attributes: {
          agencyType: agencyType(jurisdiction?.properties.name ?? rawName),
          address: (f.properties.ADDRESS ?? '').trim() || null,
          city: (f.properties.CITY ?? '').trim() || null,
          subStation,
          // The jurisdiction record this building belongs to, by its own id —
          // null for a building outside the 10-county MESB coverage or one
          // this ingest could not confidently match. A record with a null
          // jurisdictionId is still a real building; it just has no polygon
          // counterpart to highlight it from.
          jurisdictionId: jurisdiction?.properties.id ?? null,
          jurisdictionName: jurisdiction?.properties.name ?? null,
        },
      },
    });

    if (!jurisdiction) unmatchedNames.add(rawName);
  }

  const matched = features.filter((f) => f.properties.attributes.jurisdictionId).length;
  log(
    'agency-buildings',
    `${matched} of ${features.length} buildings matched to a jurisdiction polygon`,
  );

  await writeLayer('agency-buildings', {
    layer: 'agency_building',
    provenance: {
      source: 'Minnesota Law Enforcement Locations — U-Spatial, University of Minnesota',
      sourceUrl: DATASET_PAGE,
      datasetUrl: SERVICE,
      license:
        'No formal licence published; U-Spatial/USGS disclaim warranty, acknowledgement appreciated',
      licenseUrl: null,
      attribution: 'U-Spatial, University of Minnesota; U.S. Geological Survey',
      sourceDate: null,
      refresh: 'periodic',
    },
    knownGaps: [
      'Covers all of Minnesota, but only buildings whose agency also appears in the 10-county metro jurisdiction layer can be highlighted from a selected jurisdiction; the rest are shown without that link.',
      'A handful of jurisdictions — chiefly federal or military installations (Air National Guard, U.S. Air Force, Veterans Affairs Police) and Fort Snelling’s dispatcher-determined area — have no building on record in this dataset at all.',
      'This is a continually-edited reference inventory maintained by local officials, not a survey with a fixed vintage; a building recently opened, closed, or renamed may lag here.',
      unmatchedNames.size
        ? `${unmatchedNames.size} building names outside the metro jurisdiction layer were not matched against it (expected — most of Minnesota's law enforcement agencies are outside the 10-county MESB region).`
        : null,
    ].filter(Boolean),
    features,
  });
}

main().catch((err) => {
  console.error(`[agency-buildings] FAILED: ${err.message}`);
  process.exit(1);
});

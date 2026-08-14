#!/usr/bin/env node
/**
 * L? — Law enforcement agency jurisdictions (Twin Cities metro).
 *
 * The Metropolitan Emergency Services Board (MESB) publishes each agency's
 * full response-area polygon for the 10-county Twin Cities region, derived
 * from the Master Street Address Guide (MSAG) used to route 911 calls to the
 * right dispatcher. A polygon here is not an internal subdivision the way
 * Minneapolis's own five numbered police precincts are — it is the whole
 * ground one agency answers for, which is the boundary a records request or
 * a council question actually has to be addressed to. Minneapolis therefore
 * appears as a single polygon, its five precincts folded inside it.
 *
 * Minnesota DPS/ECN's NG911 GIS program is building a single statewide
 * version of this same boundary type, county submissions stitched to one
 * standard; as of this ingest it is not yet published. Re-check
 * https://ng911gis-minnesota.hub.arcgis.com and widen scope past the metro
 * once it ships — see the layer's knownGaps below.
 *
 * The service carries no field beyond an agency name — no staffing, no
 * commander, no contact. § 1b is not implicated: this is a jurisdiction, not
 * a person.
 */

import { writeLayer, loadCounties, log, slugId, fetchWithRetry } from './lib/util.mjs';
import { findContaining, representativePoint } from '../../src/lib/geo.mjs';

// Cataloged on the Minnesota Geospatial Commons; this is the service its own
// dataset page links to.
const ITEM_ID = '935a958babea40bdaf582860e4080d87';
const SERVICE =
  'https://enterprise.gisdata.mn.gov/aghost/rest/services/org_mn_mesb/bdry_law/FeatureServer/0/query';
const DATASET_PAGE = 'https://gisdata.mn.gov/dataset/org-mn-mesb-bdry-law';

/** MESB's own MSAG routing name for each agency, whitespace-normalised. */
function cleanName(raw) {
  return (raw ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Coarse type read off the plain-English tail of MESB's own name string.
 * Not an assertion about the agency beyond what its own listed name says.
 */
function agencyType(name) {
  if (/national guard|air force/i.test(name)) return 'Military';
  if (/sheriff/i.test(name)) return 'Sheriff';
  if (/police|public safety/i.test(name)) return 'Police';
  return 'Other';
}

/** Resolve the upstream item's last-modified date from its AGOL record. */
async function fetchLastModified() {
  try {
    const res = await fetchWithRetry(
      `https://www.arcgis.com/sharing/rest/content/items/${ITEM_ID}?f=json`,
      { timeoutMs: 30_000 },
    );
    const item = await res.json();
    return typeof item.modified === 'number'
      ? new Date(item.modified).toISOString().slice(0, 10)
      : null;
  } catch (err) {
    log('agency-jurisdictions', `could not resolve upstream modified date: ${err.message}`);
    return null;
  }
}

async function main() {
  const params = new URLSearchParams({
    where: '1=1',
    outFields: '*',
    returnGeometry: 'true',
    f: 'geojson',
  });
  const res = await fetchWithRetry(`${SERVICE}?${params}`, { timeoutMs: 120_000 });
  const raw = await res.json();
  if (!raw.features?.length) throw new Error('MESB service returned no jurisdiction polygons');
  log('agency-jurisdictions', `fetched ${raw.features.length} agency polygons from MESB`);

  const counties = await loadCounties();
  const sourceDate = await fetchLastModified();

  const features = raw.features.map((f) => {
    const name = cleanName(f.properties.law_gis ?? f.properties.Law_GIS);
    // A representative interior point, not the polygon itself, decides the
    // county tag — same rule redlining.mjs uses for its zones.
    const county = findContaining(representativePoint(f.geometry), counties.features);

    return {
      type: 'Feature',
      geometry: f.geometry,
      properties: {
        id: slugId('agency-jurisdiction', name),
        layer: 'agency_jurisdiction',
        name,
        county: county?.properties.name ?? null,
        state: 'MN',
        countyFips: county?.properties.geoid ?? null,
        confidence: 'confirmed',
        sourceDate,
        attributes: {
          agencyType: agencyType(name),
        },
      },
    };
  });

  const byType = features.reduce((acc, f) => {
    const t = f.properties.attributes.agencyType;
    acc[t] = (acc[t] ?? 0) + 1;
    return acc;
  }, {});
  log(
    'agency-jurisdictions',
    `types: ${Object.entries(byType).map(([k, v]) => `${k}=${v}`).join(', ')}`,
  );

  await writeLayer('agency-jurisdictions', {
    layer: 'agency_jurisdiction',
    provenance: {
      source: 'Metropolitan Emergency Services Board — Law Enforcement Agency areas',
      sourceUrl: DATASET_PAGE,
      datasetUrl: SERVICE,
      license: 'Public government data — no formal reuse licence published (MESB disclaims warranty)',
      licenseUrl: null,
      attribution:
        'Metropolitan Emergency Services Board, MESB Region PSAPs and Emergency Response Agencies',
      sourceDate,
      refresh: 'periodic',
    },
    knownGaps: [
      "Covers the 10-county Twin Cities metro region only — MESB's own service area. Minnesota DPS/ECN is building a statewide version under the NG911 GIS program; it is not yet public. See https://ng911gis-minnesota.hub.arcgis.com.",
      "Polygons are each agency's full jurisdiction, derived from the 911 call-routing table (MSAG) — not an internal subdivision. Minneapolis's own five numbered police precincts, for example, are not broken out here; the city appears as one polygon.",
      'A polygon marks where an agency answers calls, not where its officers actually patrol day to day.',
    ],
    features,
  });
}

main().catch((err) => {
  console.error(`[agency-jurisdictions] FAILED: ${err.message}`);
  process.exit(1);
});

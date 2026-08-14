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

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { writeLayer, loadCounties, log, slugId, fetchWithRetry, PUBLIC_DATA } from './lib/util.mjs';
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

/**
 * Fold "St." vs "Saint", "Department", "Office" and "Public Safety" so
 * MESB's routing name and the BCA's legal-name style land on the same key.
 * Same purpose as util.mjs's normaliseCounty, for a different vocabulary.
 */
function normaliseAgency(name) {
  return (name ?? '')
    .toLowerCase()
    .replace(/'s\b/g, '')
    .replace(/\bdepartment\b/g, '')
    .replace(/\boffice\b/g, '')
    .replace(/\bof\b/g, '')
    .replace(/\bpublic safety\b/g, 'police')
    .replace(/\bsaint\b/g, 'st')
    .replace(/\bst\.?\b/g, 'st')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * BCA's published list of agencies that reported LPR use under Minn. Stat.
 * § 13.824, subd. 8 — see agencies-lpr-bca.mjs for how it's built and why
 * this stays a reference file rather than a layer of its own. Missing (the
 * BCA ingest hasn't run) is not fatal: every jurisdiction just reads as
 * not-yet-checked rather than failing the whole build over an unrelated
 * script's output.
 */
async function loadBcaAgencies() {
  const p = path.join(PUBLIC_DATA, 'reference/bca-alpr-agencies.json');
  try {
    const parsed = JSON.parse(await readFile(p, 'utf8'));
    const byName = new Map(parsed.agencies.map((a) => [normaliseAgency(a.name), a]));
    log('agency-jurisdictions', `loaded ${byName.size} BCA-reported agencies for cross-reference`);
    return { byName, sourceUrl: parsed.metadata.sourceUrl };
  } catch {
    log('agency-jurisdictions', 'no BCA reference file found — run agencies-lpr-bca.mjs first for ALPR cross-reference');
    return { byName: new Map(), sourceUrl: null };
  }
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
  const bca = await loadBcaAgencies();

  const features = raw.features.map((f) => {
    const name = cleanName(f.properties.law_gis ?? f.properties.Law_GIS);
    // A representative interior point, not the polygon itself, decides the
    // county tag — same rule redlining.mjs uses for its zones.
    const county = findContaining(representativePoint(f.geometry), counties.features);

    const bcaMatch = bca.byName.get(normaliseAgency(name));
    // Two independent Tier 1 documents, placed side by side rather than
    // fused into one claim (spec §1c): MESB draws the boundary, the BCA
    // separately says whether this agency reported LPR use under statute.
    // false means "not found on the BCA list", not "confirmed not to use
    // one" — the attribute name and the detail panel copy both say so.
    const attributes = {
      agencyType: agencyType(name),
      // The gate the map reads (see the registry's relatedBuildings.pathsTo)
      // — a bare boolean because it drives behaviour, not copy.
      alprReportedToBca: Boolean(bcaMatch),
      // What a reader sees. Deliberately not "Yes"/"No": the BCA list is a
      // record of who filed a report, so its absence is an absence of a
      // filing under this name, never a finding that an agency operates no
      // ALPR. Saying "No" would assert exactly the thing this project
      // cannot back (spec §1c).
      alprReportStatus: bcaMatch
        ? 'Reported ALPR use to the BCA under Minn. Stat. § 13.824'
        : 'No ALPR report found under this agency name — not a finding that it operates none',
      alprDeviceLocations: bcaMatch?.deviceLocations?.length
        ? bcaMatch.deviceLocations.join('; ')
        : null,
      alprBcaSourceUrl: bcaMatch ? bca.sourceUrl : null,
    };

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
        attributes,
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
      secondarySources: bca.sourceUrl
        ? [
            {
              key: 'bca',
              name: 'Minnesota Bureau of Criminal Apprehension',
              url: bca.sourceUrl,
              license: 'Public government data (Minn. Stat. ch. 13)',
              licenseUrl: null,
              contributes: {
                en: 'Whether the agency reported LPR use to the state under Minn. Stat. § 13.824, subd. 8, and any device locations it listed.',
                es: 'Si la agencia informó el uso de lectores de placas al estado bajo Minn. Stat. § 13.824, subd. 8, y las ubicaciones de dispositivos que declaró.',
              },
            },
          ]
        : [],
    },
    knownGaps: [
      "Covers the 10-county Twin Cities metro region only — MESB's own service area. Minnesota DPS/ECN is building a statewide version under the NG911 GIS program; it is not yet public. See https://ng911gis-minnesota.hub.arcgis.com.",
      "Polygons are each agency's full jurisdiction, derived from the 911 call-routing table (MSAG) — not an internal subdivision. Minneapolis's own five numbered police precincts, for example, are not broken out here; the city appears as one polygon.",
      'A polygon marks where an agency answers calls, not where its officers actually patrol day to day.',
      'ALPR reporting status is cross-referenced against the BCA’s published list by agency name. A jurisdiction marked as not reported may simply format its name differently than the BCA does — see agencies-lpr-bca.mjs — rather than confirming it has no ALPR devices.',
    ],
    features,
  });
}

main().catch((err) => {
  console.error(`[agency-jurisdictions] FAILED: ${err.message}`);
  process.exit(1);
});

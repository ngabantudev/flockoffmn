#!/usr/bin/env node
/**
 * L4 — Data centres.
 *
 * FracTracker Alliance compiles data-centre locations from permit records
 * obtained by FOIA. Their master file is published as an ArcGIS feature
 * service, which we query directly rather than scraping the map viewer.
 *
 * The upstream record describes the facility. It does not record whether a
 * community has organised in response — which is the field an organizer most
 * needs (spec §6 L4). We do not invent it: those fields come from
 * data/community/data-center-campaigns.json, a reviewable file anyone can add
 * to by pull request, and stay null until a human cites a source.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fetchWithRetry, writeLayer, loadCounties, log, slugId, ROOT } from './lib/util.mjs';
import { findContaining } from '../../src/lib/geo.mjs';

const SERVICE =
  'https://services.arcgis.com/jDGuO8tYggdCCnUJ/arcgis/rest/services/MasterFileFOIAs/FeatureServer/0';
const LANDING = 'https://www.fractracker.org/data-centers/';
const STATE_USPS = process.env.STATE_USPS ?? 'MN';
const NATIONAL = process.env.SCOPE === 'national';

async function queryService(where) {
  const params = new URLSearchParams({
    where,
    outFields: 'Name,Street,City,State,Zip,PermitInfo,Other_info,Other_info2,PropertyUse',
    returnGeometry: 'true',
    outSR: '4326',
    f: 'geojson',
  });
  const res = await fetchWithRetry(`${SERVICE}/query?${params}`, { timeoutMs: 90_000 });
  return res.json();
}

async function nationalCount() {
  const params = new URLSearchParams({ where: '1=1', returnCountOnly: 'true', f: 'json' });
  const res = await fetchWithRetry(`${SERVICE}/query?${params}`, { timeoutMs: 45_000 });
  return (await res.json()).count ?? null;
}

function clean(v) {
  const s = (v ?? '').toString().trim();
  return s === '' || s.toLowerCase() === 'null' ? null : s;
}

async function loadCampaigns() {
  const p = path.join(ROOT, 'data/community/data-center-campaigns.json');
  try {
    const doc = JSON.parse(await readFile(p, 'utf8'));
    const index = new Map();
    for (const c of doc.campaigns ?? []) {
      const key = `${(c.name ?? '').toLowerCase().trim()}|${(c.city ?? '').toLowerCase().trim()}`;
      index.set(key, c);
      if (c.facilityId) index.set(c.facilityId, c);
    }
    log('data-centers', `${index.size ? doc.campaigns.length : 0} community campaign entries loaded`);
    return index;
  } catch {
    log('data-centers', 'no community campaign overlay found; organizer fields will be null');
    return new Map();
  }
}

async function main() {
  const [total, geo, counties, campaigns] = await Promise.all([
    nationalCount(),
    queryService(NATIONAL ? '1=1' : `State='${STATE_USPS}'`),
    loadCounties(),
    loadCampaigns(),
  ]);

  const raw = (geo.features ?? []).filter((f) => f.geometry?.coordinates?.length === 2);
  log('data-centers', `${total} facilities nationally; ${raw.length} in scope (${NATIONAL ? 'national' : STATE_USPS})`);
  if (!raw.length) throw new Error(`no data centres found for ${STATE_USPS}`);

  const features = raw.map((f) => {
    const p = f.properties ?? {};
    const coords = f.geometry.coordinates.map(Number);
    const county = findContaining(coords, counties.features);
    const name = clean(p.Name) ?? 'Unnamed facility';
    const city = clean(p.City);
    const id = slugId('dc', p.State ?? STATE_USPS, name, city ?? '');

    const campaign =
      campaigns.get(id) ??
      campaigns.get(`${name.toLowerCase()}|${(city ?? '').toLowerCase()}`) ??
      null;

    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: coords },
      properties: {
        id,
        layer: 'data_center',
        name,
        county: county?.properties.name ?? null,
        state: clean(p.State) ?? STATE_USPS,
        countyFips: county?.properties.geoid ?? null,
        // Derived from permit filings obtained by FOIA — documentary, but the
        // permit may predate construction or the facility may have changed hands.
        confidence: 'reported',
        sourceDate: null,
        attributes: {
          // The permit holder is the best available proxy for the operator;
          // ownership frequently changes after a permit is filed.
          operator: name,
          city,
          street: clean(p.Street),
          zip: clean(p.Zip),
          propertyUse: clean(p.PropertyUse),
          permitInfo: clean(p.PermitInfo),
          notes: clean(p.Other_info) ?? clean(p.Other_info2),
          // Not in the upstream record. Populated only by community submission.
          status: null,
          powerSource: null,
          resistanceStatus: campaign?.resistanceStatus ?? null,
          campaignUrl: campaign?.campaignUrl ?? null,
          petitionUrl: campaign?.petitionUrl ?? null,
          groupName: campaign?.groupName ?? null,
          campaignSource: campaign?.sourceUrl ?? null,
        },
      },
    };
  });

  const withCampaign = features.filter((f) => f.properties.attributes.resistanceStatus).length;
  log('data-centers', `${withCampaign} facilities have a community campaign recorded`);

  await writeLayer('data-centers', {
    layer: 'data_center',
    provenance: {
      source: 'FracTracker Alliance — data centres identified via FOIA permit requests',
      sourceUrl: LANDING,
      datasetUrl: SERVICE,
      license: 'FracTracker Alliance terms — attribution required, non-commercial use',
      licenseUrl: 'https://www.fractracker.org/terms-of-use/',
      attribution: 'FracTracker Alliance',
      sourceDate: null,
      refresh: 'periodic',
      nationalFacilityCount: total,
    },
    knownGaps: [
      'Compiled from permit filings obtained by FOIA. A permit is not proof a facility was built, and a built facility may have changed hands since.',
      'Power source and operating status are not in the upstream record and are left null rather than guessed.',
      'Community-response fields come from data/community/data-center-campaigns.json and are populated only where a contributor has cited a public source.',
      'Includes enterprise server rooms alongside hyperscale campuses; the upstream file does not distinguish them by size.',
    ],
    features,
  });
}

main().catch((err) => {
  console.error(`[data-centers] FAILED: ${err.message}`);
  process.exit(1);
});

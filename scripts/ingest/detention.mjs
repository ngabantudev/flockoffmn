#!/usr/bin/env node
/**
 * L3 — ICE-contract detention facilities.
 *
 * Source is ICE's "Authorized Over 72-Hour Facility List", the agency's own
 * roster of active adult facilities contracted to hold people for longer than
 * three days. The sheet is laid out for human readers — an area-of-
 * responsibility banner, then a repeated header row, then facilities — so the
 * parser skips banners and header repeats rather than assuming fixed offsets.
 *
 * SCOPE BOUNDARY (spec §4): this layer records buildings and contracts. The
 * upstream file contains no individual records and we would drop them if it
 * did. Nothing here describes, counts, or identifies a detained person.
 *
 * ICE publishes no coordinates, so facilities are geocoded to their city's
 * Census interior point, falling back to the county named in the facility
 * itself. Precision is recorded on every record.
 *
 * MANUAL_ADDITIONS below covers the gap between a contract taking effect and
 * ICE re-publishing this spreadsheet to match — see the comment there for
 * what belongs in that list and what does not.
 */

import {
  readXlsx, fetchWithRetry, unzip, loadCounties, normaliseCounty, writeLayer, log, slugId,
} from './lib/util.mjs';
import { findContaining } from '../../src/lib/geo.mjs';

const LANDING = 'https://www.ice.gov/detain/detention-management';
const FACILITY_LIST = 'https://www.ice.gov/doclib/detention/Over72HourFacilities.xlsx';
const PLACE_GAZETTEER =
  'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2023_Gazetteer/2023_Gaz_place_national.zip';

const STATE_USPS = process.env.STATE_USPS ?? 'MN';
const NATIONAL = process.env.SCOPE === 'national';

/** "CHASKA" -> "chaska"; gazetteer "Chaska city" -> "chaska". */
function normalisePlace(name) {
  return (name ?? '')
    .toLowerCase()
    .replace(/\b(city|town|village|borough|cdp|municipality)\b/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function loadPlaces() {
  const res = await fetchWithRetry(PLACE_GAZETTEER, { timeoutMs: 90_000 });
  const zip = unzip(Buffer.from(await res.arrayBuffer()));
  const entry = [...zip.keys()].find((n) => n.endsWith('.txt'));
  const lines = zip.get(entry).toString('latin1').split(/\r?\n/);
  const header = lines[0].split('\t').map((h) => h.trim());
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));

  const byState = new Map();
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const c = line.split('\t').map((x) => x.trim());
    const usps = c[idx.USPS];
    if (!NATIONAL && usps !== STATE_USPS) continue;
    if (!byState.has(usps)) byState.set(usps, new Map());
    const key = normalisePlace(c[idx.NAME]);
    // Keep the first match; gazetteer lists the incorporated place before CDPs.
    if (!byState.get(usps).has(key)) {
      byState.get(usps).set(key, { lat: Number(c[idx.INTPTLAT]), lng: Number(c[idx.INTPTLONG]) });
    }
  }
  log('detention', `indexed places for ${byState.size} state(s)`);
  return byState;
}

/** "CARVER COUNTY JAIL" -> "carver" so we can fall back to a county centroid. */
function countyFromName(facilityName) {
  const m = /^(.*?)\s+county\b/i.exec(facilityName ?? '');
  return m ? normaliseCounty(m[1]) : null;
}

/**
 * Facilities confirmed under contract by a Tier 1/2 primary record but not
 * yet on ICE's own Over 72-Hour Facility List — the list ICE re-publishes on
 * no fixed schedule, typically once a facility is actually receiving people.
 *
 * Keep this list short and remove an entry the moment either becomes true:
 *   (a) the ICE spreadsheet itself lists the facility (the dedupe check below
 *       drops the manual entry automatically once that happens, so a stale
 *       entry here is a no-op, not a duplicate pin — but delete it anyway so
 *       the next reader isn't left wondering why it's still here), or
 *   (b) the contract is reported cancelled or the facility never activates.
 *
 * Every entry needs its own citation independent of this layer's blanket ICE
 * provenance, because by definition ICE has not documented it yet.
 *
 * — Prairie Correctional Facility, Appleton (Swift County), added 2026-08-05.
 *   DHS/ICE posted a sole-source special notice naming CoreCivic as "the sole
 *   owner and operator of the Prairie detention facility" for a 1,600-bed,
 *   5-year contract serving the ICE ERO Saint Paul Field Office:
 *   solicitation 70CDCR26R00000011, posted 2026-06-04, DHS/ICE Detention
 *   Compliance and Removals — https://sam.gov/opp/09e7882089b3475788b19242cc98c21a/view
 *   (Tier 1: federal procurement record, names the facility directly).
 *   CoreCivic's own 2026-08-04 investor release confirms the contract was
 *   actually signed, effective 2026-08-11 — https://ir.corecivic.com/news-releases/news-release-details/corecivic-announces-new-contract-award-prairie-correctional
 *   (Tier 3, corroborating that the sole-source intent became an award).
 *   Coordinates are the facility's public infobox location, not a certified
 *   address — more precise than a city centroid, but flagged as such via
 *   `locatedBy` rather than presented as ICE-grade precision.
 */
const MANUAL_ADDITIONS = [
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-96.025, 45.19] },
    properties: {
      id: 'detention-mn-prairie-correctional-facility',
      layer: 'detention_facility',
      name: 'Prairie Correctional Facility',
      county: 'Swift County',
      state: 'MN',
      countyFips: '27151',
      confidence: 'confirmed',
      sourceDate: '2026-08-04',
      attributes: {
        city: 'Appleton',
        contractType: 'Direct federal contract with facility owner (sole-source)',
        facilityType: 'Dedicated immigration facility',
        operator: 'CoreCivic, Inc.',
        locatedBy: 'address-estimate',
        inspectionUrl: 'https://www.ice.gov/detain/detention-facilities',
        contractNoticeNumber: '70CDCR26R00000011',
        contractNoticeUrl: 'https://sam.gov/opp/09e7882089b3475788b19242cc98c21a/view',
      },
    },
  },
];

async function main() {
  const res = await fetchWithRetry(FACILITY_LIST, { timeoutMs: 90_000 });
  const { rows } = readXlsx(Buffer.from(await res.arrayBuffer()));

  // A facility row has all four cells and is not the repeated header.
  const facilities = rows.filter(
    (r) => r.A && r.B && r.C && r.D && r.A !== 'Facility Name' && /^[A-Z]{2}$/.test(r.C),
  );
  log('detention', `${facilities.length} facilities nationally`);

  const scoped = NATIONAL ? facilities : facilities.filter((r) => r.C === STATE_USPS);
  log('detention', `${scoped.length} in scope (${NATIONAL ? 'national' : STATE_USPS})`);
  if (!scoped.length) throw new Error(`no facilities matched state ${STATE_USPS}`);

  const [places, counties] = await Promise.all([loadPlaces(), loadCounties()]);
  const countyIndex = new Map(
    counties.features.map((f) => [normaliseCounty(f.properties.name), f.properties]),
  );

  const features = [];
  for (const row of scoped) {
    const name = row.A.trim();
    const city = row.B.trim();
    const state = row.C.trim();
    const contractType = row.D.trim();

    let coords = places.get(state)?.get(normalisePlace(city)) ?? null;
    let precision = coords ? 'city' : null;

    if (!coords) {
      const fallback = countyIndex.get(countyFromName(name) ?? '');
      if (fallback) {
        coords = { lat: fallback.lat, lng: fallback.lng };
        precision = 'county';
      }
    }
    if (!coords) {
      log('detention', `warning: could not locate "${name}" (${city}, ${state}) — omitted`);
      continue;
    }

    const point = [coords.lng, coords.lat];
    const county = findContaining(point, counties.features);

    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: point },
      properties: {
        id: slugId('detention', state, name),
        layer: 'detention_facility',
        name: name.replace(/\b\w+/g, (w) => w[0] + w.slice(1).toLowerCase()),
        county: county?.properties.name ?? null,
        state,
        countyFips: county?.properties.geoid ?? null,
        // The contract is documented by ICE; only the position is inferred.
        confidence: 'confirmed',
        sourceDate: null,
        attributes: {
          city: city.replace(/\b\w+/g, (w) => w[0] + w.slice(1).toLowerCase()),
          contractType,
          facilityType: /jail|detention center|adult detention/i.test(name)
            ? 'Local jail under ICE contract'
            : 'Dedicated immigration facility',
          operator: /county/i.test(name) ? 'County government' : 'See ICE contract record',
          locatedBy: precision === 'city' ? 'city-centroid' : 'county-centroid',
          inspectionUrl: 'https://www.ice.gov/detain/detention-facilities',
        },
      },
    });
  }

  // Fold in manually-sourced facilities ICE hasn't listed yet — but if ICE's
  // own feed has already caught up for one, its automated entry wins and the
  // manual one is dropped rather than duplicated.
  const additions = MANUAL_ADDITIONS.filter(
    (m) => !features.some(
      (f) => f.properties.state === m.properties.state
        && normalisePlace(f.properties.name) === normalisePlace(m.properties.name),
    ),
  );
  for (const extra of additions) {
    log('detention', `manual addition: ${extra.properties.name} (${extra.properties.attributes.city}) — not yet on ICE's list`);
  }
  features.push(...additions);

  await writeLayer('detention', {
    layer: 'detention_facility',
    provenance: {
      source: 'ICE — Authorized Over 72-Hour Facility List',
      sourceUrl: LANDING,
      datasetUrl: FACILITY_LIST,
      license: 'Public domain (US federal government work)',
      licenseUrl: 'https://www.usa.gov/government-works',
      attribution: 'U.S. Immigration and Customs Enforcement',
      sourceDate: null,
      refresh: 'periodic',
      nationalFacilityCount: facilities.length,
      secondarySources: additions.length
        ? [
          {
            key: 'sam-gov',
            name: 'SAM.gov — Contract Opportunities',
            url: 'https://sam.gov/opp/09e7882089b3475788b19242cc98c21a/view',
            license: 'Public domain (US federal government work)',
            licenseUrl: 'https://www.usa.gov/government-works',
            contributes: {
              en: 'Prairie Correctional Facility (Appleton): a DHS/ICE sole-source procurement notice, ahead of its appearance on ICE’s own facility list.',
              es: 'Prairie Correctional Facility (Appleton): un aviso de contratación de fuente única de DHS/ICE, antes de su aparición en la lista oficial de instalaciones de ICE.',
            },
          },
        ]
        : undefined,
    },
    knownGaps: [
      'Facility-level only. This layer contains no information about any detained person, by design.',
      'ICE publishes no coordinates; positions are city or county interior points, not building addresses.',
      'Covers only adult facilities authorised to hold people over 72 hours — not juvenile or family facilities, and not short-term holding rooms.',
      'Contracts change without announcement; a listed facility may not currently hold anyone for ICE.',
      additions.length
        ? 'Prairie Correctional Facility (Appleton) is plotted from a DHS/ICE sole-source '
          + 'contract notice and CoreCivic’s confirmation of the signed award, not yet from '
          + 'ICE’s own facility list — see the contract notice link on its detail panel. Its '
          + 'position is a public building-location estimate, not a facility address of record.'
        : null,
    ].filter(Boolean),
    features,
  });
}

main().catch((err) => {
  console.error(`[detention] FAILED: ${err.message}`);
  process.exit(1);
});

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
 *
 * Nor does it record the build-out. The permit file is mostly enterprise server
 * rooms — an insurer's machine room, a mill's IT closet — and carries neither
 * status nor capacity. The 308 MW campus at Rosemount is not in it at all. Four
 * public trackers cover that, and they contradict each other: Cleanview calls
 * Rosemount operating while More Than Just Parks calls it under construction,
 * and Becker is Microsoft to one tracker and a cancelled Amazon site to another.
 *
 * So the second overlay, data/community/data-center-projects.json, keys every
 * fact to the tracker that asserts it and this script resolves the conflicts in
 * the open: most conservative claim wins, the disagreement is recorded on the
 * feature, and the detail panel prints what each source said. A field nobody
 * asserts stays null. That is the whole discipline — the layer is contextual,
 * and it should be legible where it is uncertain rather than smooth.
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

/**
 * Where a curated project sits, without a geocoder.
 *
 * The trackers give a place name, and several give the wrong county alongside
 * it — More Than Just Parks files UnitedHealth's Minnetonka site under
 * Sherburne and Stream's Minneapolis campus under Carver. Rather than trust
 * that column or type coordinates by hand, resolve the place against the Census
 * jurisdiction index the jurisdictions layer already builds, and take both the
 * point and the county from the federal record.
 */
async function loadPlaces() {
  const p = path.join(ROOT, 'public/data/reference/mn-jurisdictions.json');
  const doc = JSON.parse(await readFile(p, 'utf8'));
  const cities = new Map();
  const counties = new Map();
  for (const j of doc.jurisdictions ?? []) {
    // "Rosemount city", "Waterford township" — the suffix is how the Census
    // distinguishes a city from the township of the same name, and a tracker
    // never writes it.
    const bare = j.name.replace(/\s+(city|township)$/i, '').toLowerCase();
    if (j.kind === 'city' && !cities.has(bare)) cities.set(bare, j);
    if (!counties.has(j.county?.toLowerCase())) {
      counties.set(j.county?.toLowerCase(), j);
    }
  }
  return { cities, counties };
}

/** Mean of a county's jurisdiction interior points — good enough for a county pin. */
function countyPoint(countyName, doc) {
  const members = doc.filter((j) => j.county?.toLowerCase() === countyName.toLowerCase());
  if (!members.length) return null;
  const lng = members.reduce((a, j) => a + j.lng, 0) / members.length;
  const lat = members.reduce((a, j) => a + j.lat, 0) / members.length;
  return { lng, lat, county: members[0].county, countyFips: members[0].countyFips };
}

const STATUS_RANK = { proposed: 0, 'under-construction': 1, operating: 2 };

/**
 * One value out of several sources, and whether they agreed.
 *
 * Conservative on purpose. Where two trackers disagree about whether a campus
 * is running or still being poured, the map says the lesser thing — a dot that
 * claims "operating" on a building that is not yet finished is the failure that
 * matters here, and the reverse is merely cautious.
 */
function reconcileStatus(claims) {
  const values = [...new Set(claims.map((c) => c.value))];
  if (values.length <= 1) return { value: values[0] ?? null, disputed: false };
  // Terminal states are not on the ranked scale: a source saying "cancelled"
  // is making a different kind of claim from one saying "proposed", and the
  // ranking cannot order them. Prefer the live reading and mark the dispute,
  // so a cancelled-per-one-tracker project is still findable under its status.
  const ranked = values.filter((v) => v in STATUS_RANK);
  const value = ranked.length
    ? ranked.sort((a, b) => STATUS_RANK[a] - STATUS_RANK[b])[0]
    : values[0];
  return { value, disputed: true };
}

/** Numeric field agreed across sources, or the lowest claim if they differ. */
function reconcileNumber(claims) {
  const values = [...new Set(claims.map((c) => Number(c.value)))].filter((n) => Number.isFinite(n));
  if (!values.length) return { value: null, disputed: false };
  return { value: Math.min(...values), disputed: values.length > 1 };
}

/** Most-asserted string, ties broken by the first source listed. */
function reconcileText(claims) {
  if (!claims.length) return { value: null, disputed: false };
  const counts = new Map();
  for (const c of claims) counts.set(c.value, (counts.get(c.value) ?? 0) + 1);
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return { value: best, disputed: counts.size > 1 };
}

async function loadCuratedProjects() {
  const p = path.join(ROOT, 'data/community/data-center-projects.json');
  const doc = JSON.parse(await readFile(p, 'utf8'));
  const jurisdictionsDoc = JSON.parse(
    await readFile(path.join(ROOT, 'public/data/reference/mn-jurisdictions.json'), 'utf8'),
  ).jurisdictions;
  const { cities } = await loadPlaces();

  const out = [];
  for (const proj of doc.projects ?? []) {
    const sourceKeys = Object.keys(proj.asserts ?? {});
    if (!sourceKeys.length) {
      throw new Error(`curated project "${proj.name}" asserts nothing; every fact needs a source`);
    }
    for (const key of sourceKeys) {
      if (!doc.sources[key]) throw new Error(`unknown source key "${key}" on "${proj.name}"`);
    }

    // Claims, grouped by field, each still carrying who said it.
    const byField = new Map();
    for (const [key, block] of Object.entries(proj.asserts)) {
      for (const [field, value] of Object.entries(block)) {
        if (value === null || value === undefined) continue;
        if (!byField.has(field)) byField.set(field, []);
        byField.get(field).push({ source: key, value });
      }
    }

    const status = reconcileStatus(byField.get('status') ?? []);
    const capacity = reconcileNumber(byField.get('capacityMw') ?? []);
    const operator = reconcileText(byField.get('operator') ?? []);

    let point = null;
    let precision = null;
    if (Array.isArray(proj.coordinates)) {
      point = { lng: proj.coordinates[0], lat: proj.coordinates[1] };
      precision = 'site';
    } else if (proj.city) {
      const hit = cities.get(proj.city.toLowerCase());
      if (!hit) throw new Error(`curated project "${proj.name}": unknown city "${proj.city}"`);
      point = { lng: hit.lng, lat: hit.lat, county: hit.county, countyFips: hit.countyFips };
      precision = 'city';
    } else if (proj.county) {
      const hit = countyPoint(proj.county, jurisdictionsDoc);
      if (!hit) throw new Error(`curated project "${proj.name}": unknown county "${proj.county}"`);
      point = hit;
      precision = 'county';
    } else {
      throw new Error(`curated project "${proj.name}" has no city, county or coordinates`);
    }

    // What each source said, verbatim, for the reader who wants to check.
    const disputedNote = status.disputed
      ? (byField.get('status') ?? [])
          .map((c) => `${doc.sources[c.source].name}: ${c.value}`)
          .join('; ')
      : null;

    out.push({
      name: proj.name,
      point,
      precision,
      // The municipality as the tracker wrote it, or the county where it gave
      // no municipality. Shown as-is; it is also what the permit match keys on.
      cityName: proj.city ?? null,
      countyName: proj.county ?? point.county ?? null,
      operator: operator.value,
      status: status.value,
      statusDisputed: status.disputed,
      capacityMw: capacity.value,
      capacityDisputed: capacity.disputed,
      disputedNote,
      note: proj.note ?? null,
      sourceKeys,
      sourceUrls: sourceKeys.map((k) => doc.sources[k].url).join(' | '),
    });
  }

  log('data-centers', `${out.length} curated projects loaded from ${Object.keys(doc.sources).length} trackers`);
  return { projects: out, sources: doc.sources };
}

async function main() {
  const [total, geo, counties, campaigns, curated] = await Promise.all([
    nationalCount(),
    queryService(NATIONAL ? '1=1' : `State='${STATE_USPS}'`),
    loadCounties(),
    loadCampaigns(),
    loadCuratedProjects(),
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
          // Not in the permit record. Filled from the curated tracker overlay
          // below where one names this facility, and left null where none does.
          status: null,
          powerSource: null,
          capacityMw: null,
          statusDisputed: null,
          disputedNote: null,
          // A permit carries a street address, so the point is the parcel.
          locationPrecision: 'site',
          origin: 'permit',
          sourceUrls: null,
          resistanceStatus: campaign?.resistanceStatus ?? null,
          campaignUrl: campaign?.campaignUrl ?? null,
          petitionUrl: campaign?.petitionUrl ?? null,
          groupName: campaign?.groupName ?? null,
          campaignSource: campaign?.sourceUrl ?? null,
        },
      },
    };
  });

  /*
   * Fold the trackers into the permit records.
   *
   * A curated project that names a facility already in the permit file is the
   * same building described twice, so it fills that feature's empty fields
   * rather than adding a second dot beside it — DataBank's Brooklyn Park site
   * is in both files and should be one point on the map. Anything unmatched is
   * new, and carries the tracker's place-name geometry rather than a parcel.
   */
  const norm = (s) => (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  // Snapshot the permit records before the loop starts appending to `features`.
  // Matching against the live array let a curated project match one that an
  // earlier iteration had just pushed: "Amazon Becker Data Center" contains
  // "Becker Data Center", so Amazon's cancelled proposal was folded into
  // Microsoft's live one and vanished from the map. Two trackers naming two
  // different companies at Becker is exactly the disagreement this layer exists
  // to show, and the substring match was quietly deleting it.
  const permitFeatures = [...features];
  const permitByName = new Map(permitFeatures.map((f) => [norm(f.properties.name), f]));
  const claimed = new Set();

  let enriched = 0;
  for (const proj of curated.projects) {
    const match =
      permitByName.get(norm(proj.name)) ??
      permitFeatures.find((f) => {
        const a = norm(f.properties.name);
        const b = norm(proj.name);
        // One name containing the other, in the same city, is the same site:
        // "Databank MSP3" against "DataBank MSP3 Brooklyn Park".
        return (
          !claimed.has(f) &&
          proj.cityName &&
          norm(f.properties.attributes.city) === norm(proj.cityName) &&
          (a.includes(b) || b.includes(a))
        );
      });

    // A permit record stands for one building. If two curated projects both
    // reach for it, the second is a different project that merely reads alike,
    // and it gets its own point rather than overwriting the first.
    if (match && !claimed.has(match)) {
      claimed.add(match);
      const at = match.properties.attributes;
      at.status ??= proj.status;
      at.capacityMw ??= proj.capacityMw;
      at.statusDisputed = proj.statusDisputed;
      at.disputedNote = proj.disputedNote;
      at.origin = 'permit+tracker';
      at.sourceUrls = proj.sourceUrls;
      if (proj.note) at.notes = at.notes ? `${at.notes} — ${proj.note}` : proj.note;
      enriched += 1;
      continue;
    }

    const coords = [proj.point.lng, proj.point.lat];
    const county = findContaining(coords, counties.features);
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: coords },
      properties: {
        id: slugId('dc', STATE_USPS, proj.name),
        layer: 'data_center',
        name: proj.name,
        county: county?.properties.name ?? proj.point.county ?? null,
        state: STATE_USPS,
        countyFips: county?.properties.geoid ?? proj.point.countyFips ?? null,
        // Transcribed from trackers that compile public records and say so
        // themselves — documentary at one remove, never confirmed by us.
        confidence: 'reported',
        sourceDate: null,
        attributes: {
          operator: proj.operator,
          city: proj.cityName,
          street: null,
          zip: null,
          propertyUse: null,
          permitInfo: null,
          notes: proj.note,
          status: proj.status,
          powerSource: null,
          capacityMw: proj.capacityMw,
          statusDisputed: proj.statusDisputed,
          disputedNote: proj.disputedNote,
          locationPrecision: proj.precision,
          origin: 'tracker',
          sourceUrls: proj.sourceUrls,
          resistanceStatus: null,
          campaignUrl: null,
          petitionUrl: null,
          groupName: null,
          campaignSource: null,
        },
      },
    });
  }

  log(
    'data-centers',
    `${enriched} permit records enriched from trackers; ` +
      `${curated.projects.length - enriched} tracker-only projects added; ` +
      `${features.length} features total`,
  );

  const disputed = features.filter((f) => f.properties.attributes.statusDisputed).length;
  log('data-centers', `${disputed} projects have sources that disagree about status`);

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
      'This is a contextual layer, not a facility register. Data centres appear here because they are the physical substrate the surveillance systems on this map run on, and because they impose local costs — power, water, land, tax abatements — that a resident can raise at a council meeting. Do not cite it as an authoritative inventory.',
      'The permit records are compiled from FOIA filings. A permit is not proof a facility was built, and a built facility may have changed hands since.',
      'Status, capacity and operator for the larger projects are transcribed from four public trackers, none of which publishes an open licence or an API, and all of which describe themselves as incomplete or provisional.',
      'The trackers contradict each other. Where they disagree about a project’s status, the record is marked disputed, shows the most conservative claim, and prints what each source said rather than resolving it.',
      'Where a tracker gives only a place name, the point is the Census interior point for that city or county, not the parcel. Each record states which.',
      'Coverage is not a census. Baxtel says it tracks 75 Minnesota facilities but gates most behind payment, and More Than Just Parks summarises more than it names. This layer covers the projects the sources name explicitly.',
      'Power source is not carried by any of the five sources and is left null rather than guessed.',
      'Community-response fields come from data/community/data-center-campaigns.json and are populated only where a contributor has cited a public source.',
      'Includes enterprise server rooms alongside hyperscale campuses; neither the permit file nor the trackers distinguish them consistently by size.',
    ],
    features,
  });
}

main().catch((err) => {
  console.error(`[data-centers] FAILED: ${err.message}`);
  process.exit(1);
});

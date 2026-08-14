#!/usr/bin/env node
/**
 * L? — ALPR reader locations, as the operating agency reported them.
 *
 * Every other camera record on this map is crowd-sourced: OpenStreetMap
 * volunteers tagging hardware they saw on a pole, with an `operator` field
 * that is free text and most often blank (see alpr.mjs's own header). Useful,
 * and honestly labelled, but it cannot say who runs a reader.
 *
 * This layer can, because the agency said so itself. Minn. Stat. § 13.824,
 * subd. 8 requires every Minnesota law enforcement agency operating an
 * automated licence plate reader to report it to the state, including the
 * location of fixed devices, and requires the BCA to publish what they file.
 * agencies-lpr-bca.mjs collects those filings; this script turns the
 * locations in them into points.
 *
 * So a record here is a documented claim by a named public agency about its
 * own equipment — the strongest provenance any camera on this map has. What
 * it is *not* is a survey: an agency that filed nothing, filed late, or
 * described a location too vaguely to resolve simply is not here, and the
 * layer's knownGaps say so rather than letting absence read as absence of
 * cameras.
 *
 * Geocoding runs against OpenStreetMap road geometry, which is why it is
 * done here at build time and never in the browser (spec §4: no cloud
 * geocoder, and "near me" never transmits a location). An intersection is
 * resolved only where both named roads are found and actually meet; where
 * the filing carries a typo, names a mall rather than a corner, or gives a
 * street address this cannot place, the record is counted as unresolved and
 * left off the map instead of being approximated.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { queryOverpass, writeLayer, log, slugId, PUBLIC_DATA, ROOT } from './lib/util.mjs';
import { bboxOf, haversineMeters } from '../../src/lib/geo.mjs';

/** Metres within which two roads count as meeting. */
const JUNCTION_METERS = 30;
/** Padding around an agency's search area, in degrees (~1.1 km). */
const BBOX_PAD = 0.01;
/** Half-width of the search box for an agency located only by a building. */
const BUILDING_BOX = 0.12;
/** Politeness gap between Overpass queries, on top of util's own backoff. */
const QUERY_GAP_MS = 1500;

const LIMIT = Number(process.env.LIMIT ?? 0);

/* ------------------------------------------------------------------ *
 * Name normalisation
 *
 * The BCA prints what each agency typed; OSM prints what a mapper typed.
 * Neither is a controlled vocabulary, so both sides are folded to the same
 * shape before comparison. Everything here expands an abbreviation or drops
 * punctuation — nothing rewrites one road as another.
 * ------------------------------------------------------------------ */

const ABBREVIATIONS = [
  [/\bhwy\.?\b/g, 'highway'],
  [/\bu\.?\s?s\.?\b/g, 'us'],
  [/\binterstate\b/g, 'i'],
  [/\bave\.?\b/g, 'avenue'],
  [/\bblvd\.?\b/g, 'boulevard'],
  [/\brd\.?\b/g, 'road'],
  [/\bdr\.?\b/g, 'drive'],
  [/\bln\.?\b/g, 'lane'],
  [/\bct\.?\b/g, 'court'],
  [/\bpkwy\.?\b/g, 'parkway'],
  [/\bcir\.?\b/g, 'circle'],
  [/\btrl\.?\b/g, 'trail'],
  [/\bpl\.?\b/g, 'place'],
  [/\bter\.?\b/g, 'terrace'],
  [/\bcsah\b/g, 'county state aid highway'],
  [/\bcounty state-aid highway\b/g, 'county state aid highway'],
  [/\bcounty (?:road|rd\.?)\b/g, 'county state aid highway'],
  [/\bnw\b/g, 'northwest'],
  [/\bne\b/g, 'northeast'],
  [/\bsw\b/g, 'southwest'],
  [/\bse\b/g, 'southeast'],
];

/**
 * Agencies write "Third Avenue"; OSM writes "3rd Avenue". Both are the same
 * street, and this is by far the largest single cause of a filing failing to
 * resolve. Folded to the numeral form because that is what OSM uses.
 */
const ORDINAL_WORDS = [
  'zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh',
  'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth',
  'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth', 'twentieth',
];

/** 1 -> "1st", 2 -> "2nd", 13 -> "13th". */
function ordinalNumeral(n) {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

function normaliseStreet(raw) {
  let t = (raw ?? '').toLowerCase().replace(/[.,]/g, ' ');
  // "State Highway 7" and "Minnesota 7" are the same road signed two ways.
  t = t.replace(/\b(state|minnesota|mn)\s+(?=highway|trunk)/g, '');
  for (const [re, to] of ABBREVIATIONS) t = t.replace(re, to);
  for (const [i, word] of ORDINAL_WORDS.entries()) {
    if (i === 0) continue;
    t = t.replace(new RegExp(`\\b${word}\\b`, 'g'), ordinalNumeral(i));
  }
  // Single-letter directionals last, so "Ave. W" is already "avenue w".
  t = t.replace(/\bn\b/g, 'north').replace(/\bs\b/g, 'south');
  t = t.replace(/\be\b/g, 'east').replace(/\bw\b/g, 'west');
  return t.replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Split a reported location into its two road names, or null if the filing
 * isn't an intersection at all (a street address, a mall, a landmark).
 */
function splitIntersection(text) {
  let t = text.trim();
  t = t.replace(/\s+in\s+[A-Z][\w .'-]*$/, '');
  t = t.replace(/\s+(?:east|west|north|south)bound\b/gi, '');
  t = t.replace(/\s*\(.*?\)\s*/g, ' ');
  // A leading house number means an address, not a corner.
  if (/^\d+\s+\S/.test(t)) return null;
  const parts = t.split(/\s+(?:and|at|&|\/)\s+/i);
  if (parts.length !== 2) return null;
  const [a, b] = parts.map((p) => p.trim());
  if (!a || !b) return null;
  return [a, b];
}

/* ------------------------------------------------------------------ *
 * Geometry
 * ------------------------------------------------------------------ */

/** Every coordinate of a set of OSM ways, as [lng, lat]. */
function coordsOf(ways) {
  const out = [];
  for (const w of ways) for (const g of w.geometry ?? []) out.push([g.lon, g.lat]);
  return out;
}

/**
 * Where two sets of roads meet, as a single representative point.
 *
 * Exact shared nodes first — how OSM records a junction — then a proximity
 * pass for the cases where two ways cross without one. Returns null when
 * they never come within JUNCTION_METERS, which is the answer for a filing
 * naming two roads that do not actually intersect.
 */
function junctionOf(aWays, bWays) {
  const a = coordsOf(aWays);
  const b = coordsOf(bWays);
  if (!a.length || !b.length) return null;

  const exact = new Set(a.map(([lng, lat]) => `${lat.toFixed(6)},${lng.toFixed(6)}`));
  const hits = [];
  for (const [lng, lat] of b) {
    if (exact.has(`${lat.toFixed(6)},${lng.toFixed(6)}`)) hits.push([lng, lat]);
  }
  if (!hits.length) {
    for (const pb of b) {
      for (const pa of a) {
        if (haversineMeters(pa, pb) <= JUNCTION_METERS) {
          hits.push(pb);
          break;
        }
      }
    }
  }
  if (!hits.length) return null;

  // A junction is several nodes (each approach lane); one road crossing
  // another twice is two clusters and genuinely ambiguous. Keep the largest
  // cluster and report how many there were.
  const clusters = [];
  for (const p of hits) {
    const near = clusters.find((c) => haversineMeters(c[0], p) <= 120);
    if (near) near.push(p);
    else clusters.push([p]);
  }
  clusters.sort((x, y) => y.length - x.length);
  const best = clusters[0];
  const lng = best.reduce((s, p) => s + p[0], 0) / best.length;
  const lat = best.reduce((s, p) => s + p[1], 0) / best.length;
  return { point: [lng, lat], clusters: clusters.length };
}

/* ------------------------------------------------------------------ *
 * Sources
 * ------------------------------------------------------------------ */

/**
 * Agencies that sign their BCA filing differently from how MESB or the
 * building inventory names them. Hand-checked one at a time; an agency not
 * listed here simply goes unanchored and its filings are recorded as
 * unresolved rather than attached to a guess.
 */
const BCA_NAME_ALIASES = {
  // Keys and values are already normalised — norm() drops "of", so these
  // read a little oddly next to the names as printed.
  'msp airport police': 'metropolitan airports commission police',
  'university minnesota police twin cities': 'university minnesota police',
};

const norm = (s) =>
  (s ?? '')
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

async function loadJson(rel) {
  const p = path.join(PUBLIC_DATA, rel);
  if (!existsSync(p)) throw new Error(`${rel} missing — run its ingest first`);
  return JSON.parse(await readFile(p, 'utf8'));
}

/** Cache Overpass results per agency so a re-run doesn't re-ask for them. */
async function cachedRoads(agencyKey, bbox) {
  const dir = path.join(ROOT, 'data/raw/alpr-reported');
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${agencyKey}.json`);
  if (existsSync(file)) return JSON.parse(await readFile(file, 'utf8'));

  const query = `[out:json][timeout:180];way["highway"]["name"](${bbox});out geom;`;
  const data = await queryOverpass('alpr-reported', query, { retries: 1, timeoutMs: 190_000 });
  await writeFile(file, JSON.stringify(data));
  await new Promise((r) => setTimeout(r, QUERY_GAP_MS));
  return data;
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

async function main() {
  const bcaPath = path.join(PUBLIC_DATA, 'reference/bca-alpr-agencies.json');
  if (!existsSync(bcaPath)) {
    throw new Error('BCA reference missing — run `npm run data:agencies-lpr-bca` first');
  }
  const bca = JSON.parse(await readFile(bcaPath, 'utf8'));
  const jurisdictions = await loadJson('agency-jurisdictions.geojson');
  const buildings = await loadJson('agency-buildings.geojson');

  const jurisByName = new Map(jurisdictions.features.map((f) => [norm(f.properties.name), f]));
  const buildingByName = new Map();
  for (const f of buildings.features) {
    const key = norm(f.properties.attributes.jurisdictionName ?? f.properties.name);
    if (!buildingByName.has(key)) buildingByName.set(key, f);
  }

  const reporting = bca.agencies.filter((a) => a.deviceLocations.length);
  const scoped = LIMIT ? reporting.slice(0, LIMIT) : reporting;
  log('alpr-reported', `${reporting.length} agencies reported fixed device locations${LIMIT ? ` (limited to ${LIMIT})` : ''}`);

  const features = [];
  const unresolved = [];
  const seenIds = new Set();
  let notAnIntersection = 0;
  let duplicateFilings = 0;

  for (const [i, agency] of scoped.entries()) {
    const rawKey = norm(agency.name);
    const key = BCA_NAME_ALIASES[rawKey] ?? rawKey;
    const jurisdiction = jurisByName.get(key);
    const building = buildingByName.get(key);

    let bbox;
    if (jurisdiction) {
      const [w, s, e, n] = bboxOf(jurisdiction.geometry);
      bbox = `${(s - BBOX_PAD).toFixed(5)},${(w - BBOX_PAD).toFixed(5)},${(n + BBOX_PAD).toFixed(5)},${(e + BBOX_PAD).toFixed(5)}`;
    } else if (building) {
      const [lng, lat] = building.geometry.coordinates;
      bbox = `${(lat - BUILDING_BOX).toFixed(5)},${(lng - BUILDING_BOX).toFixed(5)},${(lat + BUILDING_BOX).toFixed(5)},${(lng + BUILDING_BOX).toFixed(5)}`;
    } else {
      unresolved.push(...agency.deviceLocations.map((l) => `${agency.name}: ${l} (no anchor)`));
      continue;
    }

    let roads;
    try {
      roads = await cachedRoads(slugId(agency.name), bbox);
    } catch (err) {
      log('alpr-reported', `  ${agency.name}: road fetch failed (${err.message}); skipping`);
      unresolved.push(...agency.deviceLocations.map((l) => `${agency.name}: ${l} (road data unavailable)`));
      continue;
    }

    const byName = new Map();
    for (const el of roads.elements ?? []) {
      const nk = normaliseStreet(el.tags?.name);
      if (!nk) continue;
      if (!byName.has(nk)) byName.set(nk, []);
      byName.get(nk).push(el);
    }

    const waysFor = (name) => {
      const nk = normaliseStreet(name);
      if (byName.has(nk)) return byName.get(nk);
      // Token-subset fallback: a filing's "Highway 7" should reach OSM's
      // "State Highway 7". Requires every token of the filing to appear, so
      // it widens the match without inventing one.
      const tokens = nk.split(' ').filter(Boolean);
      if (tokens.length < 2) return [];
      const hits = [];
      for (const [k, v] of byName) {
        const kt = k.split(' ');
        if (tokens.every((t) => kt.includes(t))) hits.push(...v);
      }
      return hits;
    };

    let ok = 0;
    for (const reported of agency.deviceLocations) {
      const parts = splitIntersection(reported);
      if (!parts) {
        notAnIntersection++;
        unresolved.push(`${agency.name}: ${reported} (not an intersection)`);
        continue;
      }
      const junction = junctionOf(waysFor(parts[0]), waysFor(parts[1]));
      if (!junction) {
        unresolved.push(`${agency.name}: ${reported} (roads not found or do not meet)`);
        continue;
      }

      // The BCA's published list repeats a handful of corners verbatim under
      // the same agency. Two features with one id is a duplicate record, not
      // a second reader: it double-counts the layer, prints the corner twice
      // in the agency's own hover card, and — because the map source promotes
      // `id` to the feature id — makes MapLibre's feature-state ambiguous.
      // The filing is still the filing; it is one location, reported once.
      const id = slugId('alpr-reported', agency.name, reported);
      if (seenIds.has(id)) {
        duplicateFilings++;
        continue;
      }
      seenIds.add(id);

      ok++;
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: junction.point },
        properties: {
          id,
          layer: 'alpr_reported',
          name: `Reported ALPR — ${reported}`,
          county: jurisdiction?.properties.county ?? building?.properties.county ?? null,
          state: 'MN',
          countyFips:
            jurisdiction?.properties.countyFips ?? building?.properties.countyFips ?? null,
          confidence: 'confirmed',
          sourceDate: null,
          attributes: {
            agencyName: agency.name,
            reportedLocation: reported,
            jurisdictionId: jurisdiction?.properties.id ?? null,
            // The filing is the record; the coordinate is our resolution of
            // the words in it. Never let one read as the other.
            locatedBy: 'osm-intersection',
            ambiguousJunction: junction.clusters > 1,
            statute: 'Minn. Stat. § 13.824, subd. 8',
            sourceUrl: bca.metadata.sourceUrl,
          },
        },
      });
    }
    log(
      'alpr-reported',
      `  [${i + 1}/${scoped.length}] ${agency.name}: ${ok}/${agency.deviceLocations.length} placed`,
    );
  }

  const totalReported = scoped.reduce((n, a) => n + a.deviceLocations.length, 0);
  log(
    'alpr-reported',
    `placed ${features.length} of ${totalReported} reported locations (${unresolved.length} unresolved, ${notAnIntersection} not intersections, ${duplicateFilings} repeated verbatim in the source)`,
  );

  await writeLayer('alpr-reported', {
    layer: 'alpr_reported',
    provenance: {
      source: 'Minnesota Bureau of Criminal Apprehension — agencies reporting LPR use',
      sourceUrl: bca.metadata.sourceUrl,
      license: 'Public government data (Minn. Stat. ch. 13)',
      licenseUrl: null,
      attribution:
        'Minnesota Bureau of Criminal Apprehension; positions resolved against © OpenStreetMap contributors (ODbL)',
      sourceDate: null,
      refresh: 'periodic',
      secondarySources: [
        {
          key: 'osm',
          name: 'OpenStreetMap contributors',
          url: 'https://www.openstreetmap.org/copyright',
          license: 'ODbL 1.0',
          licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
          contributes: {
            en: 'Road geometry used to resolve each reported intersection to a coordinate.',
            es: 'Geometría vial usada para resolver cada intersección reportada a una coordenada.',
          },
        },
      ],
    },
    knownGaps: [
      'Only agencies that filed a report with the BCA appear. An agency missing here may not have filed, or may operate only vehicle-mounted readers, which are not fixed locations — it is not evidence the agency operates none.',
      'Positions are resolved from the words in each filing against OpenStreetMap road geometry. The filing is the record; the coordinate is this project’s reading of it, and is marked `locatedBy: osm-intersection` on every feature.',
      `${unresolved.length} of ${totalReported} reported locations could not be placed and are deliberately omitted rather than approximated: street addresses and landmark names this method cannot resolve, filings naming roads that do not exist or do not meet — including outright typos in the published list — and a few agencies whose filed name matches neither the jurisdiction nor the building inventory, leaving nowhere to search. Every one of them is listed in reference/alpr-reported-unresolved.json.`,
      'A reported location is where the agency says a reader is, not a guarantee it is still there or was ever installed.',
    ],
    features,
  });

  const dir = path.join(PUBLIC_DATA, 'reference');
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, 'alpr-reported-unresolved.json'),
    JSON.stringify(
      {
        metadata: {
          note: 'Reported device locations that could not be placed. Published so the gap is inspectable rather than invisible.',
          source: bca.metadata.sourceUrl,
          count: unresolved.length,
        },
        unresolved,
      },
      null,
      2,
    ),
  );
  log('alpr-reported', `wrote ${unresolved.length} unresolved -> public/data/reference/alpr-reported-unresolved.json`);
}

main().catch((err) => {
  console.error(`[alpr-reported] FAILED: ${err.message}`);
  process.exit(1);
});

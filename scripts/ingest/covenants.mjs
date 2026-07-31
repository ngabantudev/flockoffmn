#!/usr/bin/env node
/**
 * L6 — Historical policy: racial covenants, as an aggregate layer.
 *
 * A racial covenant is a clause written into a property deed forbidding sale
 * or occupancy to anyone not white. They ran from 1910 to 1955 in Minnesota,
 * were made unenforceable by Shelley v. Kraemer in 1948 and void by state law
 * afterwards, and still sit in the chain of title on tens of thousands of Twin
 * Cities homes.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS LAYER IS CLASSIFIED DIFFERENTLY FROM EVERY OTHER ONE
 * ---------------------------------------------------------------------------
 *
 * Every other layer here starts from a source that already describes an
 * institution: an agency that signed a contract, a facility ICE pays, a camera
 * on a pole, a building drawing power, a district a federal appraiser graded.
 * The upstream file contains no private individuals, so the ingest has nothing
 * to remove and each record maps one-to-one onto a published row.
 *
 * This source is not like that, in two distinct ways.
 *
 * 1. The upstream record is a private transaction between named people.
 *    `seller` and `buyer` are populated on all 24,118 Hennepin rows, and the
 *    GeoJSON also carries `geocd_addr` — the present-day street address of a
 *    house someone lives in today. CLAUDE.md's instruction for this exact
 *    situation is to take the systemic part and drop the rest. The systemic
 *    part is real and is the whole point: a covenant is a legal instrument
 *    attached to land, drafted from a template, recorded by a county and
 *    enforced by an industry. Across Sherburne County's 358 covenants there
 *    are 37 distinct wordings — this is boilerplate, not personal expression.
 *    Who signed it is the private part.
 *
 * 2. The upstream geometry is the parcel itself. Every other layer marks a
 *    facility, a device, or a district. This one would outline 34,741
 *    individual homes at survey precision — 52 MB of polygons, each tracing
 *    the property line of a house with people in it now.
 *
 * So this layer is published the way CLAUDE.md allows systemic data about
 * people-adjacent records to be published: as a clearly-labelled aggregate,
 * counts only, never a row per property. Covenants are binned into a fixed
 * ground grid and each cell reports how many were recorded inside it. That
 * keeps what matters — the blanket coverage across whole neighbourhoods, which
 * is the finding — and discards what does not belong to us, which is the
 * ability to point at one family's house.
 *
 * The per-parcel data is public and excellent, and anyone wanting it should
 * get it from Mapping Prejudice directly rather than from a copy here.
 *
 * `assertAggregateOnly` runs over the finished output and throws rather than
 * write a file that leaked a name, an address, or a parcel outline, because a
 * rule enforced only by good intentions is not enforced.
 */

import { fetchWithRetry, writeLayer, loadCounties, log, slugId } from './lib/util.mjs';
import { findContaining, representativePoint } from '../../src/lib/geo.mjs';

/**
 * Mapping Prejudice publish one repository directory per county. The GeoJSON
 * is stored in Git LFS, so it comes from the media host — raw.githubusercontent
 * returns the 133-byte pointer file instead.
 */
const SOURCE_BASE =
  'https://media.githubusercontent.com/media/UMNLibraries/mp-us-racial-covenants/main';

const REPO_URL = 'https://github.com/UMNLibraries/mp-us-racial-covenants';

/** Every Minnesota county the project has published so far. */
const COUNTIES = [
  'anoka',
  'dakota',
  'hennepin',
  'olmsted',
  'ramsey',
  'sherburne',
  'stearns',
  'washington',
];

/**
 * Grid resolution, in metres.
 *
 * Chosen to sit near a Twin Cities block: fine enough that a covenanted
 * subdivision still reads as a distinct shape rather than a blur, coarse
 * enough that a cell never resolves to one property. A cell containing a
 * single covenant reports "1" over an area of several houses, which is the
 * point — it says a restriction was recorded on this block, not which door.
 */
const CELL_METRES = 250;

// Degrees per metre at Minnesota's latitude. Constant per axis rather than
// recomputed per row: a fixed grid is reproducible between builds, and a cell
// that changes shape with latitude would make counts incomparable.
const MEAN_LATITUDE = 45.3;
const LAT_STEP = CELL_METRES / 111_320;
const LNG_STEP = CELL_METRES / (111_320 * Math.cos((MEAN_LATITUDE * Math.PI) / 180));

/**
 * Fields read from the upstream record. An allow-list rather than a
 * block-list: a block-list silently passes through whatever the upstream adds
 * later, and the failure mode of getting that wrong is publishing a name.
 */
const KEEP = new Set(['deed_year', 'city', 'cov_text']);

/** Fields known to name or locate a person, listed so the assertion can name them. */
const PERSONAL_FIELDS = ['seller', 'buyer', 'street_add', 'geocd_addr', 'zip_code', 'cnty_pin', 'doc_num'];

/**
 * Refuse to write a layer that carries anything but aggregates.
 *
 * Runs on every build. A false positive costs a developer five minutes; a
 * false negative publishes a private individual.
 */
function assertAggregateOnly(features) {
  const streetish =
    /\b\d{1,6}\s+\w+.*\b(avenue|ave|street|st|road|rd|drive|dr|lane|ln|boulevard|blvd|place|pl|court|ct|way|terrace)\b/i;

  for (const f of features) {
    const attrs = f.properties.attributes;

    for (const key of Object.keys(attrs)) {
      const lower = key.toLowerCase().replace(/_/g, '');
      for (const banned of PERSONAL_FIELDS) {
        if (lower === banned.replace(/_/g, '')) {
          throw new Error(`personal field "${key}" survived into the output on ${f.properties.id}`);
        }
      }
    }

    for (const [key, value] of Object.entries(attrs)) {
      if (typeof value === 'string' && streetish.test(value)) {
        throw new Error(`"${key}" looks like a street address on ${f.properties.id}`);
      }
    }

    // Every published record must be a grid cell holding a count, never a
    // parcel. Five coordinates is a closed rectangle.
    const ring = f.geometry?.coordinates?.[0];
    if (f.geometry?.type !== 'Polygon' || !Array.isArray(ring) || ring.length !== 5) {
      throw new Error(`record ${f.properties.id} is not a grid cell — parcel geometry must not ship`);
    }
    if (!Number.isFinite(attrs.covenantCount) || attrs.covenantCount < 1) {
      throw new Error(`record ${f.properties.id} has no count`);
    }
  }
}

function cleanText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed || null;
}

async function fetchCounty(slug) {
  const url = `${SOURCE_BASE}/mn-${slug}-county/covenants-mn-${slug}-county.geojson`;
  const res = await fetchWithRetry(url, { timeoutMs: 300_000 });
  const collection = await res.json();
  if (!collection?.features?.length) throw new Error(`no covenants returned for ${slug}`);
  return collection.features;
}

async function main() {
  const counties = await loadCounties();
  /** @type {Map<string, {count: number, lngIndex: number, latIndex: number, years: number[], cities: Map<string, number>, wordings: Map<string, number>}>} */
  const cells = new Map();
  const perCounty = {};
  let mapped = 0;
  let skipped = 0;

  for (const slug of COUNTIES) {
    const raw = await fetchCounty(slug);
    let kept = 0;

    for (const f of raw) {
      // A covenant with no mapped parcel cannot be placed, and guessing a
      // location for a restriction on land would be worse than a gap.
      if (!f.geometry) {
        skipped++;
        continue;
      }
      const [lng, lat] = representativePoint(f.geometry) ?? [];
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        skipped++;
        continue;
      }

      const p = f.properties ?? {};
      const picked = {};
      for (const key of Object.keys(p)) if (KEEP.has(key)) picked[key] = p[key];

      const lngIndex = Math.floor(lng / LNG_STEP);
      const latIndex = Math.floor(lat / LAT_STEP);
      const key = `${lngIndex}:${latIndex}`;

      let cell = cells.get(key);
      if (!cell) {
        cell = { count: 0, lngIndex, latIndex, years: [], cities: new Map(), wordings: new Map() };
        cells.set(key, cell);
      }
      cell.count++;

      const year = Number(picked.deed_year);
      if (Number.isFinite(year) && year > 1800) cell.years.push(year);

      const city = cleanText(picked.city);
      if (city) cell.cities.set(city, (cell.cities.get(city) ?? 0) + 1);

      const wording = cleanText(picked.cov_text);
      if (wording) cell.wordings.set(wording, (cell.wordings.get(wording) ?? 0) + 1);

      kept++;
      mapped++;
    }

    perCounty[slug] = kept;
    log('covenants', `${slug}: ${kept} covenants mapped (of ${raw.length} records)`);
  }

  if (!cells.size) throw new Error('no covenants ingested');

  const commonest = (counts) =>
    [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;

  const features = [...cells.values()].map((cell) => {
    const west = cell.lngIndex * LNG_STEP;
    const south = cell.latIndex * LAT_STEP;
    const east = west + LNG_STEP;
    const north = south + LAT_STEP;
    const centre = [west + LNG_STEP / 2, south + LAT_STEP / 2];
    const county = findContaining(centre, counties.features);
    const city = commonest(cell.cities);
    const years = cell.years;

    return {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [west, south],
            [east, south],
            [east, north],
            [west, north],
            [west, south],
          ],
        ],
      },
      properties: {
        id: slugId('covenants', String(cell.lngIndex), String(cell.latIndex)),
        layer: 'racial_covenant',
        // Named by what was recorded here and where — never by a property.
        name: `${cell.count} racial covenant${cell.count === 1 ? '' : 's'}${city ? ` — ${city}` : ''}`,
        county: county?.properties.name ?? null,
        state: 'MN',
        countyFips: county?.properties.geoid ?? null,
        confidence: 'confirmed',
        sourceDate: years.length ? String(Math.min(...years)) : null,
        attributes: {
          covenantCount: cell.count,
          city,
          earliestDeed: years.length ? Math.min(...years) : null,
          latestDeed: years.length ? Math.max(...years) : null,
          // One wording recorded in this cell, verbatim. The clause is the
          // evidence and paraphrasing it would soften language written to be
          // unambiguous. It is a template, not anyone's words about anyone.
          exampleWording: commonest(cell.wordings),
        },
      },
    };
  });

  assertAggregateOnly(features);
  log('covenants', `aggregate assertion passed over ${features.length} cells`);

  const allYears = features
    .flatMap((f) => [f.properties.attributes.earliestDeed, f.properties.attributes.latestDeed])
    .filter((y) => Number.isFinite(y));
  const span = allYears.length ? `${Math.min(...allYears)}–${Math.max(...allYears)}` : 'unknown';
  const densest = Math.max(...features.map((f) => f.properties.attributes.covenantCount));
  log(
    'covenants',
    `${mapped} covenants into ${features.length} cells of ${CELL_METRES}m, ${span}, densest cell ${densest}`,
  );
  if (skipped) log('covenants', `${skipped} records had no mapped parcel and were dropped`);

  await writeLayer('covenants', {
    layer: 'racial_covenant',
    provenance: {
      source: 'Mapping Prejudice, University of Minnesota Libraries',
      sourceUrl: 'https://mappingprejudice.umn.edu',
      datasetUrl: REPO_URL,
      license: 'CC0 1.0 Universal',
      licenseUrl: 'https://creativecommons.org/public-domain/cc0/',
      attribution:
        'Ehrman-Solberg, Kevin; Petersen, Penny; Mills, Marguerite; Delegard, Kirsten; Mattke, Ryan; crowdsourcing community mapmakers — U.S. Racial Covenants Series, hosted by Mapping Prejudice',
      sourceDate: '1910-1972',
      refresh: 'rare',
      covenantsMapped: mapped,
      cellMetres: CELL_METRES,
      countiesCovered: perCounty,
    },
    knownGaps: [
      `This layer is an aggregate and deliberately not a record per property. Covenants are counted into fixed ${CELL_METRES}-metre cells; a cell showing "1" means one covenant was recorded somewhere in an area of several houses, not which house.`,
      'The upstream deeds name the seller and the buyer, and the upstream file also carries the present-day street address and the parcel outline of a house someone lives in now. None of that is ingested, and the build fails rather than write a file containing it. For the per-parcel data, go to Mapping Prejudice directly.',
      'A covenant describes land, not the people on it. Present-day residents of a covenanted property have no connection to the clause and are not the subject of this record.',
      'Only the eight Minnesota counties Mapping Prejudice has published are here. A county with no cells has not been searched, which is not the same as a county with no covenants.',
      'Covenants are found by reading digitised deeds, so coverage depends on which deed books have been processed. Every count is a floor on the true number, never a ceiling.',
      'Cells are placed from a representative point of the parcel matched to each deed, so a covenant near a cell edge may fall in either neighbouring cell.',
      'Racial covenants were made unenforceable in 1948 and are void today, but the text remains in the chain of title until a homeowner files to discharge it.',
      'Mapping Prejudice describe the period as 1910 to 1955, but 58 cells carry a deed year after that, running to 1972. Those are shown as recorded rather than corrected or dropped: they may be late recordings of older instruments, or transcription artefacts, and we have not established which.',
    ],
    features,
  });
}

main().catch((err) => {
  console.error(`[covenants] FAILED: ${err.message}`);
  process.exit(1);
});

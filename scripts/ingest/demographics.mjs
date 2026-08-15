#!/usr/bin/env node
/**
 * Present-day demographics by census tract: Census Bureau ACS 5-year
 * estimates for Black and Latinx population share and the poverty rate.
 *
 * This is systemic data about a place, never about a person (CLAUDE.md §1d):
 * a 2020 census tract averages a few thousand residents, and nothing here
 * resolves finer than that. It exists to sit beside the enforcement layers —
 * ALPR readers, agency jurisdictions, 287(g) agreements — so a reader can ask
 * whether the infrastructure is concentrated in Black, Latinx or low-income
 * neighborhoods, the same question the CI-MAP environmental-justice layer
 * (ej-cumulative.mjs) already lets a reader ask about pollution burden.
 *
 * Per §1c, this layer states the numbers and nothing else. It computes no
 * score, index or correlation against any other layer; a reader who wants to
 * ask "where do the ALPR readers and the highest-poverty tracts coincide"
 * does that by looking at two toggled layers, not by reading a number this
 * script invented for them.
 *
 * ---------------------------------------------------------------------------
 * GEOMETRY: BORROWED, NOT REFETCHED
 * ---------------------------------------------------------------------------
 *
 * ej-cumulative.mjs already ships all 1,505 Minnesota 2020 census tracts,
 * generalised and keyed by GEOID. Refetching tract boundaries from TIGERweb
 * here would be a second, independent copy of the same shapes with every
 * chance to drift from the first. So this script reads that file and adds
 * the ACS attributes to it, the same "read the sibling layer" pattern
 * holc-detail.mjs already uses for the same tract set. It runs after
 * ej-cumulative in build-all.mjs for that reason.
 *
 * ---------------------------------------------------------------------------
 * THE ONE KEY THIS PIPELINE NEEDS
 * ---------------------------------------------------------------------------
 *
 * The Census Data API required no key through July 2026; it now requires a
 * free one for every request (register at
 * https://api.census.gov/data/key_signup.html — an email address is all it
 * takes). That is one exception to this project's "no keys" ETL promise
 * (CLAUDE.md Part 2), and it is confined to this script alone — every other
 * ingest still runs key-free. Set CENSUS_API_KEY in .env (see .env.example);
 * `npm run data` loads it automatically via --env-file-if-exists. Missing it
 * fails loudly with the signup link rather than silently skipping the layer.
 *
 * ---------------------------------------------------------------------------
 * MARGIN OF ERROR
 * ---------------------------------------------------------------------------
 *
 * Every ACS estimate carries a margin of error, and a small-population
 * subgroup in a small tract can carry an MOE larger than the estimate itself.
 * Publishing a percentage with no uncertainty attached overstates precision
 * the underlying data does not have, so every rate here ships its MOE beside
 * it, and the ratio percentages (Black share, Latinx share, each a subset of
 * total population) get their MOE properly propagated through the division
 * using the Census Bureau's own published ratio formula (ACS General
 * Handbook, Appendix A) rather than reusing the numerator count's MOE as a
 * stand-in. A coefficient of variation past 40% — the Bureau's own published
 * reliability cutoff — is flagged `highUncertainty` rather than hidden.
 */

import { loadPublicJson, writeLayer, log } from './lib/util.mjs';

const STATE_FIPS = process.env.STATE_FIPS ?? '27'; // Minnesota

const API_KEY = process.env.CENSUS_API_KEY;
if (!API_KEY) {
  throw new Error(
    'CENSUS_API_KEY is not set. Register a free key at ' +
      'https://api.census.gov/data/key_signup.html and add it to .env ' +
      '(see .env.example) — this is the one ingest script in the pipeline ' +
      'that needs one.',
  );
}

// Tried newest first. The Bureau adds a new 5-year vintage every December; a
// year that 404s here means it has not been published yet, not that
// something is broken, so the walk falls back rather than failing outright.
const CANDIDATE_YEARS = [2024, 2023, 2022];

// B03002: Hispanic or Latino Origin by Race. Cross-tabulated against race so
// a Black Hispanic resident is not counted twice (B02001 RACE alone would
// double-count). _004E is "Black or African American alone, not Hispanic or
// Latino"; _012E is "Hispanic or Latino" of any race.
const RACE_VARS = ['B03002_001E', 'B03002_001M', 'B03002_004E', 'B03002_004M', 'B03002_012E', 'B03002_012M'];

// S1701: Poverty Status in the Past 12 Months (subject table) — the rate is
// pre-computed upstream, so no ratio-MOE propagation is needed for it.
const POVERTY_VARS = ['S1701_C03_001E', 'S1701_C03_001M'];

async function fetchAcsYear(table, vars, year) {
  const base =
    table === 'subject'
      ? `https://api.census.gov/data/${year}/acs/acs5/subject`
      : `https://api.census.gov/data/${year}/acs/acs5`;
  const url = `${base}?get=NAME,${vars.join(',')}&for=tract:*&in=state:${STATE_FIPS}&key=${API_KEY}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'flockoff-ingest/0.1' } });
  if (!res.ok) return null;
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length < 2) return null;
  const [header, ...data] = rows;
  return { header, data };
}

/** Walk CANDIDATE_YEARS for one table, returning the first year that answers. */
async function fetchAcsLatest(table, vars, label) {
  for (const year of CANDIDATE_YEARS) {
    log('demographics', `${label}: trying ${year} ACS 5-year...`);
    const result = await fetchAcsYear(table, vars, year);
    if (result) {
      log('demographics', `${label}: using ${year} ACS 5-year (${result.data.length} tracts)`);
      return { year, ...result };
    }
  }
  throw new Error(`${label}: none of ${CANDIDATE_YEARS.join(', ')} answered — check table/variable names`);
}

/** header + data rows -> Map(GEOID -> {var: value, ...}) */
function toGeoidMap(header, data) {
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const stateIdx = idx.state;
  const countyIdx = idx.county;
  const tractIdx = idx.tract;
  const map = new Map();
  for (const row of data) {
    const geoid = `${row[stateIdx]}${row[countyIdx]}${row[tractIdx]}`;
    const values = {};
    for (const [name, i] of Object.entries(idx)) values[name] = row[i];
    map.set(geoid, values);
  }
  return map;
}

function num(v) {
  const n = Number(v);
  // ACS uses negative sentinels (e.g. -555555555) for "not computable" cells.
  return Number.isFinite(n) && n > -1_000_000_000 ? n : null;
}

/**
 * Margin of error of a proportion p = numerator/denominator, where the
 * numerator is a subset of the denominator (e.g. Black population within
 * total population) — the Census Bureau's own approximation, ACS General
 * Handbook Appendix A, formula for a derived ratio.
 *
 * Returns { percent, moePercent, cv, highUncertainty } or all-null fields if
 * either input is missing or the denominator is zero.
 */
function proportionWithMoe(numEst, numMoe, denEst, denMoe) {
  if (numEst == null || numMoe == null || denEst == null || denMoe == null || denEst <= 0) {
    return { percent: null, moePercent: null, cv: null, highUncertainty: null };
  }
  const p = numEst / denEst;
  const radicand = numMoe ** 2 - p ** 2 * denMoe ** 2;
  // The subtraction form is the Bureau's preferred formula; where it goes
  // negative (small numerator relative to its own MOE) the Bureau's own
  // guidance says use the addition form instead, which is always defined.
  const se = radicand >= 0 ? Math.sqrt(radicand) / denEst / 1.645 : Math.sqrt(numMoe ** 2 + p ** 2 * denMoe ** 2) / denEst / 1.645;
  const moe = se * 1.645;
  const percent = Math.round(p * 1000) / 10;
  const moePercent = Math.round(moe * 1000) / 10;
  // Coefficient of variation on the estimate itself (not the percentage),
  // the Bureau's own reliability measure: SE/estimate, in percent.
  const cv = numEst > 0 ? Math.round(((numMoe / 1.645) / numEst) * 1000) / 10 : null;
  return { percent, moePercent, cv, highUncertainty: cv === null ? true : cv > 40 };
}

/** Same reliability read for a rate the Bureau already computed (S1701). */
function rateWithMoe(estimate, moe) {
  if (estimate == null || moe == null) return { percent: null, moePercent: null, cv: null, highUncertainty: null };
  const cv = estimate > 0 ? Math.round(((moe / 1.645) / estimate) * 1000) / 10 : null;
  return { percent: estimate, moePercent: moe, cv, highUncertainty: cv === null ? true : cv > 40 };
}

/** Detail-panel-friendly text for a tri-state reliability flag, matching the
 * 'Yes'/'No' convention ej-cumulative.mjs already uses for MPCA's own finding
 * rather than a bare boolean a reader has to interpret. */
function yesNo(v) {
  if (v === null) return null;
  return v ? 'Yes' : 'No';
}

/**
 * Fixed absolute thresholds, not data-driven quantiles, so the band a tract
 * falls in — and what it means on the legend — stays the same from one
 * ingest to the next. A quantile scheme would silently redraw the meaning of
 * "high" every time the statewide distribution shifted a fraction of a point.
 */
function band(percent, stops) {
  if (percent == null) return null;
  for (const [max, label] of stops) if (percent < max) return label;
  return stops.at(-1)[1];
}

const SHARE_STOPS = [
  [5, '0–5%'],
  [15, '5–15%'],
  [30, '15–30%'],
  [50, '30–50%'],
  [Infinity, '50%+'],
];

const POVERTY_STOPS = [
  [10, '0–10%'],
  [20, '10–20%'],
  [30, '20–30%'],
  [40, '30–40%'],
  [Infinity, '40%+'],
];

async function main() {
  const tracts = await loadPublicJson('ej-cumulative.geojson', {
    runFirst: 'npm run data:ej-cumulative (or npm run data)',
  });
  const tractFeatures = tracts.features;
  log('demographics', `${tractFeatures.length} tracts from ej-cumulative.geojson`);

  const race = await fetchAcsLatest('detail', RACE_VARS, 'race/ethnicity (B03002)');
  const povertyResp = await fetchAcsYear('subject', POVERTY_VARS, race.year);
  if (!povertyResp) {
    throw new Error(
      `poverty (S1701) did not answer for ${race.year}, the year race/ethnicity used — ` +
        'refusing to mix ACS vintages, since tract boundaries can shift between them',
    );
  }
  log('demographics', `poverty (S1701): using ${race.year} ACS 5-year (${povertyResp.data.length} tracts)`);

  const raceByGeoid = toGeoidMap(race.header, race.data);
  const povertyByGeoid = toGeoidMap(povertyResp.header, povertyResp.data);

  let unmatched = 0;
  const features = tractFeatures.map((f) => {
    const geoid = f.properties.attributes.geoid;
    const r = raceByGeoid.get(geoid);
    const p = povertyByGeoid.get(geoid);
    if (!r || !p) unmatched++;

    const totalPop = r ? num(r.B03002_001E) : null;
    const totalPopMoe = r ? num(r.B03002_001M) : null;
    const blackPop = r ? num(r.B03002_004E) : null;
    const blackPopMoe = r ? num(r.B03002_004M) : null;
    const latinxPop = r ? num(r.B03002_012E) : null;
    const latinxPopMoe = r ? num(r.B03002_012M) : null;

    const black = proportionWithMoe(blackPop, blackPopMoe, totalPop, totalPopMoe);
    const latinx = proportionWithMoe(latinxPop, latinxPopMoe, totalPop, totalPopMoe);
    const poverty = p
      ? rateWithMoe(num(p.S1701_C03_001E), num(p.S1701_C03_001M))
      : { percent: null, moePercent: null, cv: null, highUncertainty: null };

    return {
      type: 'Feature',
      geometry: f.geometry,
      properties: {
        id: `demo-${geoid}`,
        layer: 'demographics_acs',
        name: f.properties.name,
        county: f.properties.county,
        state: 'MN',
        countyFips: f.properties.countyFips,
        confidence: r && p ? 'confirmed' : 'reported',
        sourceDate: String(race.year - 4) + '–' + String(race.year),
        attributes: {
          geoid,
          totalPopulation: totalPop,
          blackPercent: black.percent,
          blackPercentMoe: black.moePercent,
          blackHighUncertainty: yesNo(black.highUncertainty),
          blackBand: band(black.percent, SHARE_STOPS),
          latinxPercent: latinx.percent,
          latinxPercentMoe: latinx.moePercent,
          latinxHighUncertainty: yesNo(latinx.highUncertainty),
          latinxBand: band(latinx.percent, SHARE_STOPS),
          povertyPercent: poverty.percent,
          povertyPercentMoe: poverty.moePercent,
          povertyHighUncertainty: yesNo(poverty.highUncertainty),
          povertyBand: band(poverty.percent, POVERTY_STOPS),
        },
      },
    };
  });

  if (unmatched) log('demographics', `${unmatched} tracts had no matching ACS row — left null`);
  if (unmatched > tractFeatures.length * 0.05) {
    throw new Error(
      `${unmatched} of ${tractFeatures.length} tracts unmatched to ACS data — ` +
        'that is more than a rounding gap, the GEOID join has probably broken',
    );
  }

  await writeLayer('demographics', {
    layer: 'demographics_acs',
    provenance: {
      source: `U.S. Census Bureau, American Community Survey, ${race.year - 4}–${race.year} 5-Year Estimates, tables B03002 and S1701`,
      sourceUrl: 'https://www.census.gov/data/developers/data-sets/acs-5year.html',
      datasetUrl: `https://api.census.gov/data/${race.year}/acs/acs5?get=NAME,${RACE_VARS.join(',')}&for=tract:*&in=state:${STATE_FIPS}`,
      license: 'Public domain (U.S. federal statistical work)',
      licenseUrl: null,
      attribution: `U.S. Census Bureau, American Community Survey, ${race.year - 4}–${race.year} 5-Year Estimates`,
      sourceDate: `${race.year - 4}-${race.year}`,
      refresh: 'periodic',
      acsVintage: race.year,
      tractCount: features.length,
      unmatchedTracts: unmatched,
    },
    knownGaps: [
      'ACS 5-year estimates are a rolling average across five years, not a count taken on any single date — a tract shown here did not necessarily look like this on any given day within the range.',
      'Margins of error can exceed the estimate itself for a small subgroup in a small tract. Every rate here carries its own MOE; tracts where the estimate\'s coefficient of variation exceeds 40% (the Census Bureau\'s own reliability cutoff) are flagged highUncertainty rather than presented as precise.',
      'Black share and Latinx share are drawn from table B03002 (Hispanic origin by race), which counts "Black or African American alone, not Hispanic or Latino" and "Hispanic or Latino" (any race) separately so a Black Hispanic resident is not counted in both. A different table choice (B02001, race alone regardless of Hispanic origin) would report a different Black percentage.',
      'Geometry is borrowed from ej-cumulative.geojson (MPCA CI-MAP, 2020 tract boundaries) rather than refetched, so any generalisation or gap in that file\'s geometry carries over here — see that layer\'s own knownGaps.',
      'This describes a census tract in aggregate, typically a few thousand residents. It records no household and no person, and it never will.',
    ],
    features,
  });
}

main().catch((err) => {
  console.error(`[demographics] FAILED: ${err.message}`);
  process.exit(1);
});

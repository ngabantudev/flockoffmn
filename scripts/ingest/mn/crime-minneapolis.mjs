#!/usr/bin/env node
/**
 * Reported crime by Minneapolis neighborhood: annual counts of the FBI's
 * eight Part I offence categories, 2018 onward, as the City publishes them.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS SOURCE AND NOT THE INCIDENT FEEDS
 * ---------------------------------------------------------------------------
 *
 * Minneapolis publishes two kinds of crime data. The one most people find
 * first is incident-level: a row per report, carrying a case number, an
 * offence, a block-level address and a datetime. That is a record about people
 * subject to enforcement, and CLAUDE.md §1b puts it out of scope permanently —
 * not "out of scope unless aggregated", out of scope. Aggregating it ourselves
 * would still mean running those records through this pipeline.
 *
 * This script reads a different dataset: NEIGHBORHOOD_CRIME_STATS, which the
 * City aggregates *before* publication. Its entire schema is neighbourhood,
 * offence category, count, month, year. There is no case number, no address,
 * no date of custody, no charge attached to anyone, and nothing that resolves
 * to an individual. That is what makes this layer publishable at all.
 *
 * DO NOT switch this script to the incident feeds — not for finer geography,
 * not for offence subtypes, not for arrest or clearance data. That is a §1b
 * decision, not a data-engineering one.
 *
 * ---------------------------------------------------------------------------
 * THE GRANULARITY FLOOR
 * ---------------------------------------------------------------------------
 *
 * §1d requires a documented suppression threshold. Here it is on granularity
 * rather than on value:
 *
 *   The finest cell this layer publishes is one neighbourhood, one offence
 *   category, one full calendar year. Nothing finer is published, computed or
 *   shipped in the download.
 *
 * No value floor is applied, deliberately. The City already publishes these
 * counts at neighbourhood-*month* grain under CC0, so our annual cell is
 * twelve times coarser than what is already public; suppressing a
 * neighbourhood-year with one homicide would remove nothing from circulation
 * while making our own map silently wrong, which §3's coverage honesty
 * forbids.
 *
 * If any future change introduces a cell finer than neighbourhood-year —
 * monthly values, sub-neighbourhood units, offence subtypes, or any
 * cross-tabulation against another layer — it does not ship without a value
 * suppression floor of n < 5 and a fresh §1b review.
 *
 * ---------------------------------------------------------------------------
 * FOUR THINGS THE UPSTREAM DATA DOES THAT WILL BITE YOU
 * ---------------------------------------------------------------------------
 *
 * 1. 177 spellings, 87 neighbourhoods. Every neighbourhood switched from
 *    UPPERCASE to Title Case partway through 2018, and four were genuinely
 *    renamed mid-series (ECCO -> East Bde Maka Ska, West Calhoun -> West Maka
 *    Ska, CARAG -> South Uptown, and STEVENS SQUARE gaining an apostrophe).
 *    Folding case alone leaves those four split into two half-length series
 *    each, which renders as a hole in the map for the mapped year. Hence
 *    NAME_ALIASES below. The handoff months are disjoint — the old spelling
 *    stops the month the new one starts — so summing after normalisation does
 *    not double-count.
 *
 * 2. `number` is null in ~4% of rows, all of them between September 2017 and
 *    May 2018, and null means zero. Verified against the data: in that window
 *    the share of null cells per offence tracks the share of explicit zero
 *    cells in the clean period almost exactly (arson 93% vs 92%, homicide 97%
 *    vs 94%, rape 71% vs 74%), and null and zero essentially never co-occur
 *    for the same offence. The City wrote blanks instead of zeros before June
 *    2018. Treating them as unknown would silently deflate 2018.
 *
 * 3. The series does not begin in January 2017 — 2017 holds August through
 *    December only. A leading partial year is as misleading as a trailing one,
 *    so 2017 is excluded from the series entirely rather than shown as a year
 *    that looks like half a city's crime vanished.
 *
 * 4. Two "not assigned" buckets exist (`** NOT ASSIGNED **` and, after the
 *    rename, `Z_** NOT ASSIGNED **`) holding well under 1% of incidents. They
 *    have no geometry to join to, so they are dropped from the map and
 *    disclosed in knownGaps rather than silently discarded.
 *
 * ---------------------------------------------------------------------------
 * GEOMETRY RIDES ALONG
 * ---------------------------------------------------------------------------
 *
 * Neighbourhood polygons are fetched here and written into this layer's own
 * file rather than getting a registry entry of their own. A bare "Minneapolis
 * neighbourhoods" toggle would show administrative outlines and say nothing —
 * it is not a subject of this site. Both datasets are CC0 from the same
 * publisher, so there is no per-column licence split to manage.
 *
 * A future layer needing these polygons should borrow them from
 * crime-minneapolis.geojson via loadPublicJson, the same way demographics.mjs
 * borrows tract geometry from ej-cumulative.geojson, rather than refetching
 * and risking two copies of the same shapes drifting apart.
 */

import {
  arcgisCount,
  arcgisQueryAll,
  log,
  slugId,
  thinGeometry,
  writeLayer,
} from '../lib/util.mjs';
import { OFFENCES, TOTAL_STOPS, bandFor, bandLabels } from '../../../src/lib/crimeBands.mjs';

const SCOPE = 'crime-minneapolis';

const STATS_SERVICE =
  'https://services.arcgis.com/afSMGVsC7QlRK1kZ/arcgis/rest/services/NEIGHBORHOOD_CRIME_STATS/FeatureServer/0';
const BOUNDARY_SERVICE =
  'https://services.arcgis.com/afSMGVsC7QlRK1kZ/arcgis/rest/services/Minneapolis_Neighborhoods/FeatureServer/0';

const PORTAL_URL =
  'https://opendata.minneapolismn.gov/datasets/97ce8f1a93084479929be2750b25187f_0/about';

/**
 * Renames the City made mid-series, keyed by normalised name. Case and
 * punctuation are already folded by normalise(), so this table carries only
 * the genuine renames — the ones no amount of case-folding will reconcile.
 */
const NAME_ALIASES = {
  ECCO: 'EAST BDE MAKA SKA',
  'EAST CALHOUN': 'EAST BDE MAKA SKA',
  'WEST CALHOUN': 'WEST MAKA SKA',
  CARAG: 'SOUTH UPTOWN',
};

/** ucrDescription -> the offence entry, for the row fold below. */
const BY_UCR = new Map(OFFENCES.map((o) => [o.ucr, o]));

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function normalise(name) {
  const n = (name ?? '')
    .toUpperCase()
    .replace(/[’']/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
  return NAME_ALIASES[n] ?? n;
}

async function main() {
  // ---- the counts -------------------------------------------------------
  const expected = await arcgisCount(STATS_SERVICE);
  log(SCOPE, `NEIGHBORHOOD_CRIME_STATS reports ${expected.toLocaleString()} rows`);

  const statRows = await arcgisQueryAll(SCOPE, STATS_SERVICE, {
    params: {
      f: 'json',
      outFields: 'neighborhood,ucrDescription,number,reportMonth,reportYear',
      returnGeometry: 'false',
      orderByFields: 'neighborhoodCrimeStatisticsID',
    },
    pageSize: 2000,
    expected,
  });

  // ---- which years are complete ----------------------------------------
  // A year counts as full only when all twelve months are present. This is
  // what excludes both partial ends: 2017 (August onward) at the head and the
  // current year at the tail.
  const monthsSeen = new Map();
  for (const { attributes: a } of statRows) {
    if (!monthsSeen.has(a.reportYear)) monthsSeen.set(a.reportYear, new Set());
    monthsSeen.get(a.reportYear).add(a.reportMonth);
  }
  const fullYears = [...monthsSeen.entries()]
    .filter(([, months]) => months.size === 12)
    .map(([year]) => year)
    .sort((a, b) => a - b);
  if (!fullYears.length) throw new Error('no complete calendar year in the upstream data');

  const firstFullYear = fullYears[0];
  const lastFullYear = fullYears.at(-1);
  const statYear = lastFullYear;

  const partialYears = [...monthsSeen.keys()].filter((y) => !fullYears.includes(y)).sort();
  const trailingYear = partialYears.find((y) => y > lastFullYear) ?? null;

  let partialYearLabel = null;
  if (trailingYear !== null) {
    const months = [...monthsSeen.get(trailingYear)].sort((a, b) => a - b);
    const span =
      months.length === 1
        ? MONTH_NAMES[months[0] - 1]
        : `${MONTH_NAMES[months[0] - 1]}–${MONTH_NAMES[months.at(-1) - 1]}`;
    partialYearLabel = `${trailingYear} (${span}, incomplete)`;
  }

  log(
    SCOPE,
    `full years ${firstFullYear}–${lastFullYear}; ` +
      `excluded partials ${partialYears.join(', ') || 'none'}`,
  );

  // ---- fold the rows ----------------------------------------------------
  // totals: normalised name -> year -> { offenceKey -> count, total }
  const totals = new Map();
  let unassignedIncidents = 0;
  let nullCells = 0;
  const rawNames = new Set();

  for (const { attributes: a } of statRows) {
    const offence = BY_UCR.get(a.ucrDescription);
    if (!offence) {
      throw new Error(
        `unrecognised ucrDescription "${a.ucrDescription}" — the City has added an ` +
          'offence category. Add it to OFFENCES with its violent/property group ' +
          'rather than letting it drop silently out of the totals.',
      );
    }

    // null means zero here; see note 2 in the header.
    if (a.number === null || a.number === undefined) nullCells += 1;
    const count = a.number ?? 0;

    if (/NOT ASSIGNED/i.test(a.neighborhood ?? '')) {
      unassignedIncidents += count;
      continue;
    }
    rawNames.add(a.neighborhood);

    const name = normalise(a.neighborhood);
    if (!totals.has(name)) totals.set(name, new Map());
    const byYear = totals.get(name);
    if (!byYear.has(a.reportYear)) byYear.set(a.reportYear, { total: 0 });
    const bucket = byYear.get(a.reportYear);
    bucket[offence.key] = (bucket[offence.key] ?? 0) + count;
    bucket.total += count;
  }

  log(
    SCOPE,
    `${rawNames.size} raw name spellings folded to ${totals.size} neighbourhoods; ` +
      `${nullCells.toLocaleString()} null cells read as zero; ` +
      `${unassignedIncidents.toLocaleString()} incidents not assigned to a neighbourhood`,
  );

  // ---- the boundaries ---------------------------------------------------
  const boundaryFeatures = await arcgisQueryAll(SCOPE, BOUNDARY_SERVICE, {
    params: { outFields: 'BDNAME', outSR: '4326' },
    pageSize: 500,
  });
  log(SCOPE, `${boundaryFeatures.length} neighbourhood polygons`);

  // ---- join -------------------------------------------------------------
  // A name-format change upstream breaks this join, and a half-populated map
  // is worse than a failed build, so more than three misses throws.
  const boundaryKeys = new Set(boundaryFeatures.map((f) => normalise(f.properties.BDNAME)));
  const unmatchedStats = [...totals.keys()].filter((k) => !boundaryKeys.has(k));
  const unmatchedBoundaries = boundaryFeatures
    .map((f) => f.properties.BDNAME)
    .filter((n) => !totals.has(normalise(n)));

  if (unmatchedStats.length > 3 || unmatchedBoundaries.length > 3) {
    throw new Error(
      `neighbourhood join broke: ${unmatchedStats.length} stat names with no polygon ` +
        `(${unmatchedStats.join(', ')}) and ${unmatchedBoundaries.length} polygons with ` +
        `no stats (${unmatchedBoundaries.join(', ')}). Upstream names have probably ` +
        'changed — check NAME_ALIASES before publishing.',
    );
  }
  if (unmatchedStats.length || unmatchedBoundaries.length) {
    log(SCOPE, `WARNING unmatched: stats ${unmatchedStats} boundaries ${unmatchedBoundaries}`);
  }

  // ---- features ---------------------------------------------------------
  const features = boundaryFeatures
    .map((f) => {
      const displayName = f.properties.BDNAME;
      const byYear = totals.get(normalise(displayName));
      const current = byYear?.get(statYear);

      const attributes = {
        neighborhood: displayName,
        statYear,
        firstFullYear,
        lastFullYear,
      };

      // Every offence carries both its count and its own band, because each
      // one is separately mappable and they do not share a scale — see
      // src/lib/crimeBands.mjs on why homicide and larceny cannot.
      for (const { key, stops } of OFFENCES) {
        const count = current?.[key] ?? null;
        attributes[key] = count;
        attributes[`${key}Band`] = current ? bandFor(stops, count ?? 0) : null;
      }

      const groupTotal = (group) => {
        if (!current) return null;
        return OFFENCES.filter((o) => o.group === group).reduce(
          (sum, o) => sum + (current[o.key] ?? 0),
          0,
        );
      };
      attributes.violentTotal = groupTotal('violent');
      attributes.propertyTotal = groupTotal('property');
      attributes.reportedTotal = current?.total ?? null;
      attributes.reportedTotalBand = current ? bandFor(TOTAL_STOPS, current.total) : null;

      for (const year of fullYears) {
        attributes[`total${year}`] = byYear?.get(year)?.total ?? null;
      }

      const firstTotal = byYear?.get(firstFullYear)?.total;
      const lastTotal = byYear?.get(lastFullYear)?.total;
      attributes.changeSinceFirstFullYear =
        firstTotal === undefined || lastTotal === undefined ? null : lastTotal - firstTotal;

      attributes.partialYearLabel = partialYearLabel;
      attributes.partialYearTotal =
        trailingYear === null ? null : (byYear?.get(trailingYear)?.total ?? null);

      return {
        type: 'Feature',
        geometry: thinGeometry(f.geometry),
        properties: {
          id: slugId('crime-mpls', displayName),
          layer: 'crime_minneapolis',
          name: displayName,
          county: 'Hennepin',
          state: 'MN',
          countyFips: '27053',
          attributes,
          confidence: 'confirmed',
          sourceDate: String(statYear),
        },
      };
    })
    .sort((a, b) => a.properties.name.localeCompare(b.properties.name));

  await writeLayer('crime-minneapolis', {
    layer: 'crime_minneapolis',
    provenance: {
      source: 'City of Minneapolis Open Data, NEIGHBORHOOD CRIME STATS and Minneapolis Neighborhoods',
      sourceUrl: PORTAL_URL,
      datasetUrl: `${STATS_SERVICE}/query`,
      boundaryUrl: `${BOUNDARY_SERVICE}/query`,
      license: 'CC0 1.0 Universal (public domain dedication)',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      attribution: 'City of Minneapolis Open Data',
      sourceDate: String(statYear),
      refresh: 'periodic',
      statYear,
      firstFullYear,
      lastFullYear,
      excludedPartialYears: partialYears,
      neighborhoodCount: features.length,
      unmatchedNeighborhoods: [...unmatchedStats, ...unmatchedBoundaries],
      bandScales: Object.fromEntries([
        ['reportedTotal', bandLabels(TOTAL_STOPS)],
        ...OFFENCES.map((o) => [o.key, bandLabels(o.stops)]),
      ]),
      nullCellsReadAsZero: nullCells,
      incidentsNotAssignedToNeighborhood: unassignedIncidents,
    },
    knownGaps: [
      'Minneapolis only. No statewide Minnesota equivalent exists at this granularity. ' +
        "The BCA's Minnesota Crime Data Explorer (cde.state.mn.us) covers agencies statewide " +
        'but begins in 2021, offers no sub-city geography, and publishes no bulk export or API — ' +
        "only an interactive portal, which this project's good-citizen fetcher rules bar it from " +
        'automating. Statewide figures before 2021 exist only inside annual Uniform Crime Report ' +
        'PDFs, and the 2021 boundary is the state’s transition from summary UCR to NIBRS ' +
        "reporting, so a series across it would not be comparable in any case. The FBI's Crime " +
        'Data Explorer offers statewide agency-level history but requires an api.data.gov key, ' +
        'which this pipeline does not use.',
      'St. Paul is not included. The City of St. Paul publishes crime data at the incident level ' +
        'rather than as a pre-aggregated neighborhood rollup, so including it would require this ' +
        'project to aggregate records that carry case numbers and block-level addresses. That is ' +
        'out of scope permanently under this project’s privacy floor, not a task left undone.',
      'The finest cell published here is one neighborhood, one offense category, one full calendar ' +
        'year. The City itself publishes these counts monthly; this layer deliberately does not, ' +
        'and nothing finer than a neighborhood-year is computed or shipped.',
      `The published series begins in ${firstFullYear}. The upstream dataset's first year, 2017, ` +
        'holds August through December only, and is excluded rather than shown as a full year ' +
        'that would read as a collapse in reported crime that did not happen.',
      `The current calendar year is incomplete${partialYearLabel ? ` (${partialYearLabel})` : ''} ` +
        'and is excluded from the mapped value, the year-by-year series, and the change figure. ' +
        'It is carried only as a separately labeled partial-year total.',
      'Counts are null in about four per cent of upstream rows, all of them between September 2017 ' +
        'and May 2018, where the City recorded a blank instead of a zero. They are read as zero ' +
        'here; the pattern of blanks matches the pattern of explicit zeros in later years almost ' +
        'exactly, offense by offense.',
      `${unassignedIncidents.toLocaleString()} reported offenses across the whole series carry no ` +
        'neighborhood assignment upstream and appear in no neighborhood on this map.',
      'Eight FBI Part I offense categories only. Offenses outside that list do not appear.',
      'These are counts of offenses reported to and recorded by police, not a count of events.',
    ],
    features,
  });
}

await main();

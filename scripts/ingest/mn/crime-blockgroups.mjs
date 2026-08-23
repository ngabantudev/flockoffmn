#!/usr/bin/env node
/**
 * Reported crime at census block group: annual counts of FBI Part I offences
 * inside each small area of Minneapolis, aggregated by this script from the
 * City's incident feed.
 *
 * ---------------------------------------------------------------------------
 * READ THIS BEFORE CHANGING ANYTHING HERE
 * ---------------------------------------------------------------------------
 *
 * This is the one ingest in the project that reads a person-level upstream
 * source. Everything about how it does that is deliberate, and the rules below
 * are the reason it is allowed to exist at all.
 *
 * The sibling layer (crime-minneapolis.mjs) reads a table the City aggregated
 * before publishing, so nothing person-level ever entered the pipeline. That
 * table's finest geography is the neighbourhood — 87 areas for a city of
 * 430,000 — which is too coarse to show where anything actually concentrates.
 * The only finer source is `Police Incidents`, one row per report, carrying a
 * case number, a street address, a date, a time and a charge.
 *
 * §1d permits this narrow case: "If an upstream source mixes individual
 * records into systemic data, ingest the systemic attributes and drop the
 * rest." The systemic attribute here is *where*, and nothing else. So:
 *
 *   1. THIS SCRIPT NEVER REQUESTS THE PERSON-LEVEL FIELDS. The query asks for
 *      geometry and a row id for stable paging. `caseNumber`, `publicaddress`,
 *      `reportedDate`, `reportedTime`, `offense` and `description` are never
 *      in a response, never in memory, and never on disk. Dropping them after
 *      download would be weaker than not downloading them, and there is no
 *      reason to accept the weaker version.
 *
 *   2. NOTHING FINER THAN A BLOCK GROUP-YEAR IS COMPUTED OR PUBLISHED. Not a
 *      point, not a month, not a block. The published cell is one small area,
 *      one full calendar year, one number.
 *
 *   3. NO OFFENCE BREAKDOWN AT THIS GRAIN, EVER. This is the control that
 *      matters most and it is not a stylistic choice. Re-identification risk
 *      here comes from crossing a small area with a rare offence: "one rape,
 *      this block group, this year" can identify a person to anyone who lives
 *      there, where "one Part I offence somewhere in this area this year"
 *      cannot. The offence breakdown lives at neighbourhood scale, in the
 *      sibling layer, and the two are deliberately never crossed. A future
 *      request to "just add a homicide layer at block group" is the request
 *      this paragraph exists to refuse.
 *
 *   4. CELLS UNDER 5 ARE SUPPRESSED, as §1d requires ("suppress cells below a
 *      documented threshold"). They are published as `null` and labelled
 *      withheld, never as zero — §3: the fact that something was withheld is
 *      itself publishable, and rendering a suppressed cell as 0 would be a
 *      quiet lie about a place.
 *
 *      Note the sibling layer documents its threshold as sitting on
 *      granularity rather than value, on the grounds that the City already
 *      publishes those counts at a finer grain than we do. That argument does
 *      not transfer here: this grain is one we compute and nobody publishes,
 *      so the value floor applies properly.
 *
 * If any of 1–4 is being relaxed, that is a §1b/§1d decision and not a
 * data-engineering one. §0.10 applies.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS STILL CANNOT SEE
 * ---------------------------------------------------------------------------
 *
 * An incident is placed where the report was filed against an address, which
 * is not always where anything happened — a report taken at a police building,
 * a hospital, or a shelter lands there. Points the City could not geocode are
 * dropped and counted in knownGaps. Both are disclosed rather than smoothed.
 */

import {
  arcgisCount,
  arcgisQueryAll,
  loadPublicJson,
  log,
  slugId,
  thinGeometry,
  writeLayer,
} from '../lib/util.mjs';
import { bboxOf, pointInGeometry, representativePoint } from '../../../src/lib/geo.mjs';

const SCOPE = 'crime-blockgroups';

const MPLS = 'https://services.arcgis.com/afSMGVsC7QlRK1kZ/arcgis/rest/services';
/** 2020 census block groups. Layer 11 of TIGERweb's Tracts_Blocks service. */
const TIGERWEB =
  'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Tracts_Blocks/MapServer/11';

const STATE_FIPS = '27';
const COUNTY_FIPS = '053'; // Hennepin

/**
 * One entry per complete calendar year, matching the sibling layer's series.
 *
 * 2018 takes two services because the City changed police records systems
 * partway through it: the older PIMS extract covers the start of the year and
 * the current one covers the rest. Reading only one of them would publish a
 * 2018 that is roughly a third of the real figure.
 */
const YEAR_SERVICES = {
  2018: ['Police_Incidents_2018_PIMS', 'Police_Incidents_2018'],
  2019: ['Police_Incidents_2019'],
  2020: ['Police_Incidents_2020'],
  2021: ['Police_Incidents_2021'],
  2022: ['Police_Incidents_2022'],
  2023: ['Police_Incidents_2023'],
  2024: ['Police_Incidents_2024'],
  2025: ['Police_Incidents_2025'],
};

/** §1d. Cells below this are withheld, not zeroed. See rule 4 above. */
const SUPPRESS_BELOW = 5;

/**
 * Fixed absolute stops on the annual block group total, cut from the real
 * 2018–2025 distribution. Absolute rather than quantile for the same reason
 * the sibling layer's are: a quantile scheme redraws what "high" means every
 * run, so an area could change colour in a year its own count never moved.
 */
const STOPS = [25, 45, 75, 115];

function bandLabels(stops) {
  const edges = [0, ...stops];
  return edges.map((lo, i) => (i === edges.length - 1 ? `${lo}+` : `${lo}–${edges[i + 1] - 1}`));
}
const BAND_LABELS = bandLabels(STOPS);
function bandFor(value) {
  if (value === null || value === undefined) return null;
  return BAND_LABELS[STOPS.filter((s) => value >= s).length];
}

/**
 * A uniform grid over the block groups, so assigning ~190,000 points is a
 * handful of polygon tests each rather than a scan of all 1,098.
 *
 * geo.mjs's findContaining is the right tool at the scale it was written for
 * (87 counties, once per keystroke); here it would be 200 million bbox checks.
 * The containment test itself is still geo.mjs's `pointInGeometry`, so a point
 * lands in the same polygon here as it would anywhere else in the project —
 * only the candidate search is different.
 */
function buildIndex(features, cell = 0.01) {
  const grid = new Map();
  const keyOf = (lng, lat) => `${Math.floor(lng / cell)}:${Math.floor(lat / cell)}`;
  for (const f of features) {
    const [minLng, minLat, maxLng, maxLat] = bboxOf(f.geometry);
    for (let x = Math.floor(minLng / cell); x <= Math.floor(maxLng / cell); x += 1) {
      for (let y = Math.floor(minLat / cell); y <= Math.floor(maxLat / cell); y += 1) {
        const k = `${x}:${y}`;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(f);
      }
    }
  }
  return (lng, lat) => {
    for (const f of grid.get(keyOf(lng, lat)) ?? []) {
      if (pointInGeometry([lng, lat], f.geometry)) return f;
    }
    return null;
  };
}

async function main() {
  // ---- block groups -----------------------------------------------------
  const blockGroups = await arcgisQueryAll(SCOPE, TIGERWEB, {
    params: {
      where: `STATE='${STATE_FIPS}' AND COUNTY='${COUNTY_FIPS}'`,
      outFields: 'GEOID,TRACT,BLKGRP',
      outSR: '4326',
    },
    pageSize: 500,
  });
  log(SCOPE, `${blockGroups.length} block groups in Hennepin County`);

  /*
   * Clip to Minneapolis.
   *
   * TIGERweb has no "in Minneapolis" flag, so the query above is county-wide
   * and most of what comes back is suburb. Keeping all of it and letting the
   * incident counts decide looked fine until it was drawn: a handful of
   * suburban block groups catch a stray geocode, fall under the suppression
   * floor, and render in the grey no-data colour — a ring of grey around the
   * city that reads as part of the map and is not.
   *
   * The city outline is already on disk, as the neighbourhood polygons the
   * sibling layer ships, so it is borrowed rather than refetched — the same
   * "read the sibling layer" rule demographics.mjs follows for tract geometry.
   */
  const neighbourhoods = (await loadPublicJson('crime-minneapolis.geojson', {
    runFirst: 'npm run data:crime-minneapolis',
  })).features;
  const inCity = buildIndex(neighbourhoods);
  const cityBlockGroups = blockGroups.filter((bg) => {
    const [lng, lat] = representativePoint(bg.geometry);
    return inCity(lng, lat) !== null;
  });
  log(
    SCOPE,
    `${cityBlockGroups.length} of them fall inside Minneapolis; ` +
      `${blockGroups.length - cityBlockGroups.length} suburban block groups dropped`,
  );
  const locate = buildIndex(cityBlockGroups);

  // ---- incidents: geometry only ------------------------------------------
  // counts: GEOID -> year -> n
  const counts = new Map();
  let placed = 0;
  let ungeocoded = 0;
  let outsideCity = 0;

  for (const [year, services] of Object.entries(YEAR_SERVICES)) {
    for (const service of services) {
      const url = `${MPLS}/${service}/FeatureServer/0`;
      const expected = await arcgisCount(url);
      const rows = await arcgisQueryAll(SCOPE, url, {
        // Geometry and a row id for stable paging. Nothing else — see rule 1.
        params: { outFields: 'OBJECTID', orderByFields: 'OBJECTID', outSR: '4326' },
        pageSize: 2000,
        expected,
      });

      for (const r of rows) {
        const c = r.geometry?.coordinates;
        // The City emits (0, 0) and nulls for reports it could not place.
        if (!c || !Number.isFinite(c[0]) || !Number.isFinite(c[1]) || (c[0] === 0 && c[1] === 0)) {
          ungeocoded += 1;
          continue;
        }
        const bg = locate(c[0], c[1]);
        if (!bg) {
          // Reported by Minneapolis police but geocoded outside the city
          // outline — a report filed against an address just over the line.
          outsideCity += 1;
          continue;
        }
        const geoid = bg.properties.GEOID;
        if (!counts.has(geoid)) counts.set(geoid, new Map());
        const byYear = counts.get(geoid);
        byYear.set(Number(year), (byYear.get(Number(year)) ?? 0) + 1);
        placed += 1;
      }
      log(SCOPE, `  ${service}: ${rows.length} rows read`);
    }
  }

  const years = Object.keys(YEAR_SERVICES).map(Number).sort((a, b) => a - b);
  const statYear = years.at(-1);
  log(
    SCOPE,
    `${placed.toLocaleString()} incidents placed; ${ungeocoded.toLocaleString()} not geocoded upstream; ` +
      `${outsideCity.toLocaleString()} outside the city outline`,
  );

  // ---- suppress, then build features -------------------------------------
  let suppressedCells = 0;
  let suppressedIncidents = 0;

  const features = cityBlockGroups
    .filter((bg) => counts.has(bg.properties.GEOID))
    .map((bg) => {
      const geoid = bg.properties.GEOID;
      const byYear = counts.get(geoid);

      const attributes = {
        geoid,
        tract: bg.properties.TRACT,
        blockGroup: bg.properties.BLKGRP,
        statYear,
        firstYear: years[0],
        lastYear: statYear,
      };

      for (const y of years) {
        const raw = byYear.get(y) ?? 0;
        // Withheld, never zeroed — see rule 4.
        const published = raw < SUPPRESS_BELOW ? null : raw;
        if (published === null) {
          suppressedCells += 1;
          suppressedIncidents += raw;
        }
        attributes[`total${y}`] = published;
      }

      const current = attributes[`total${statYear}`];
      attributes.reportedTotal = current;
      attributes.reportedTotalBand = bandFor(current);
      attributes.suppressed = current === null;

      return {
        type: 'Feature',
        geometry: thinGeometry(bg.geometry),
        properties: {
          id: slugId('crime-bg', geoid),
          layer: 'crime_block_group',
          name: `Block group ${bg.properties.BLKGRP}, tract ${bg.properties.TRACT}`,
          county: 'Hennepin',
          state: 'MN',
          countyFips: '27053',
          attributes,
          confidence: 'confirmed',
          sourceDate: String(statYear),
        },
      };
    })
    .sort((a, b) => a.properties.attributes.geoid.localeCompare(b.properties.attributes.geoid));

  // A distribution readout, so the STOPS above can be checked against reality
  // on any run rather than being taken on trust.
  const shown = features.map((f) => f.properties.attributes.reportedTotal).filter((v) => v !== null).sort((a, b) => a - b);
  if (shown.length) {
    const at = (p) => shown[Math.min(shown.length - 1, Math.floor(shown.length * p))];
    log(
      SCOPE,
      `${statYear} published cells: min ${shown[0]}, p25 ${at(0.25)}, median ${at(0.5)}, ` +
        `p75 ${at(0.75)}, p90 ${at(0.9)}, max ${shown.at(-1)}`,
    );
    const occupancy = BAND_LABELS.map(
      (label) => `${label}=${shown.filter((v) => bandFor(v) === label).length}`,
    );
    log(SCOPE, `  band occupancy: ${occupancy.join('  ')}`);
  }
  log(
    SCOPE,
    `${suppressedCells.toLocaleString()} cells suppressed under ${SUPPRESS_BELOW} ` +
      `(${suppressedIncidents.toLocaleString()} incidents withheld)`,
  );

  await writeLayer('crime-blockgroups', {
    layer: 'crime_block_group',
    provenance: {
      source:
        'City of Minneapolis Open Data, Police Incidents (aggregated by this project); U.S. Census Bureau TIGERweb 2020 block groups',
      sourceUrl: 'https://opendata.minneapolismn.gov/search?groupIds=79606f50581f4a33b14a19e61c4891f7&q=incidents',
      boundaryUrl: `${TIGERWEB}/query`,
      license: 'CC0 1.0 Universal (public domain dedication); block group boundaries public domain (U.S. federal work)',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      attribution: 'City of Minneapolis Open Data; U.S. Census Bureau',
      sourceDate: String(statYear),
      refresh: 'periodic',
      statYear,
      years,
      suppressBelow: SUPPRESS_BELOW,
      bandLabels: BAND_LABELS,
      blockGroupsPublished: features.length,
      incidentsPlaced: placed,
      incidentsNotGeocoded: ungeocoded,
      incidentsOutsideCity: outsideCity,
      cellsSuppressed: suppressedCells,
      incidentsSuppressed: suppressedIncidents,
    },
    knownGaps: [
      `Counts only. This layer publishes no breakdown by offense type at this scale, and will not: the re-identification risk in small-area crime data comes from crossing a small area with a rare offense, and a single rape or homicide located to one block group in one year can identify a person. The offense breakdown is published at neighborhood scale instead, in the Reported crime layers, and the two are never crossed.`,
      `Cells below ${SUPPRESS_BELOW} reported offenses in a year are withheld rather than published, per this project's suppression threshold. ${suppressedCells.toLocaleString()} cells across the series are withheld on that basis, covering ${suppressedIncidents.toLocaleString()} reported offenses. A withheld cell is shown as withheld, never as zero.`,
      'Nothing finer than one block group in one full calendar year is computed or published — no points, no months, no blocks.',
      `${ungeocoded.toLocaleString()} reported offenses across the series carry no usable coordinates upstream and appear nowhere on this map.`,
      'An incident is placed at the address the report was filed against, which is not always where anything happened. Reports taken at a police building, a hospital or a shelter are located there, which can make such a block group look busier than the neighborhood around it.',
      'A block group is a census reporting area of roughly 600 to 3,000 residents, drawn for statistical convenience. It is not a neighborhood and has no name anyone uses.',
      'Minneapolis only, and only what Minneapolis police recorded. This is one city of more than 850 in Minnesota.',
      'The City changed police records systems in February 2019; 2018 is assembled from the two extracts that straddle that change, and its figures are not strictly comparable to later years.',
      'These are counts of offenses reported to and recorded by police, not a count of events.',
    ],
    features,
  });
}

await main();

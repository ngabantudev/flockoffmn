#!/usr/bin/env node
/**
 * Modern environmental justice: MPCA cumulative impacts by census tract.
 *
 * The 2023 cumulative impacts law (Minn. Stat. § 116.065) requires MPCA to
 * consider the stressor burden a community already carries before permitting
 * new sources in environmental justice areas. CI-MAP is the agency's
 * implementation: 26 environmental, health and social indicators per 2020
 * census tract, each compared against county and state medians, plus the
 * agency's own yes/no determination of adverse cumulative stressors.
 *
 * This layer publishes the summary, not the person: a tract aggregates
 * thousands of people and carries no individual record. Laid beside the
 * redlining and covenant layers it shows where the 1930s lines and
 * present-day burdens coincide — which is the point of ingesting it.
 *
 * The service is a public draft (first published December 2025) on MPCA's
 * own ArcGIS server, outside the Geospatial Commons, so it has no DCAT
 * record and no formal licence statement. Both facts are recorded in
 * knownGaps rather than papered over. The Commons "MPCA Environmental
 * Justice" item is the stable, formally-licensed companion for the
 * demographic flags this dataset embeds.
 */

import { fetchWithRetry, writeLayer, log, slugId } from '../lib/util.mjs';

// `maxAllowableOffset` generalises the tract outlines to ~10 m and
// `geometryPrecision` trims coordinates to five decimals (~1 m). A tract is a
// statistical area, not a survey boundary, so the simplification costs the map
// nothing and cuts the file roughly in half.
const SOURCE =
  'https://pca-gis02.pca.state.mn.us/arcgis/rest/services/maps/ci_map_indicators/MapServer/0/query?where=1%3D1&outFields=*&f=geojson&maxAllowableOffset=0.0001&geometryPrecision=5';

// All 1,505 Minnesota 2020 tracts arrive in one response (maxRecordCount is
// 2000). If the draft service changes shape, fail loudly rather than publish
// a partial state.
const EXPECTED_TRACTS = 1505;

/**
 * Fields read from the service, verified against the live schema. Left name
 * is ours, right is MPCA's. An allow-list, same reasoning as covenants.mjs:
 * whatever the draft adds later does not ship until someone reads it.
 */
const FIELDS = {
  geoid: 'geoid',
  countyName: 'county_name',
  stressorCount: 'stressor_count_value',
  countyMedian: 'stressor_count_county_median',
  stateMedian: 'stressor_count_state_median',
  mpcaAdverse: 'adverse_cumulative_stressors',
  indicatorCount: 'indicator_count',
  percentAdverse: 'percent_adverse_stressors',
  adverseList: 'adverse_stressor_string',
  tribalIntersect: 'indian_country_intersect_flag',
  tribeNames: 'tribe_names',
  ejPoverty: 'status200x',
  ejPeopleOfColor: 'statuspoc',
  ejLimitedEnglish: 'statuslep',
};

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function text(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/**
 * The Census Bureau's own display form of a tract number — the same
 * formatting data.census.gov itself uses — read out of the GEOID rather than
 * shown raw. A GEOID is state(2) + county(3) + tract(6); the tract's 6 digits
 * are a 4-digit base number and a 2-digit hundredths suffix ("770100" is
 * tract 7701, suffix .00; "000203" is tract 2, suffix .03). The suffix is
 * dropped when it's ".00" — most Minnesota tracts have never been split — and
 * kept otherwise, so a tract that *was* split still reads as the specific
 * piece CI-MAP means, not its unsplit parent.
 *
 * A tract has no name beyond this number: the source carries no neighborhood
 * field, and this project does not invent one from a boundary this dataset
 * never drew (CLAUDE.md §0.3 — no inference where a document doesn't say).
 */
function tractLabel(geoid) {
  if (typeof geoid !== 'string' || geoid.length !== 11) return null;
  const code = geoid.slice(5);
  const base = String(Number(code.slice(0, 4)));
  const suffix = code.slice(4);
  return suffix === '00' ? base : `${base}.${suffix}`;
}

// CI-MAP's own fixed denominator (see this file's header comment): 26
// indicators scored per tract. Computed once here into a display string
// rather than left to be reassembled with a hardcoded "26" wherever
// stressorCount is shown, so a future methodology change only means editing
// this one constant.
const TOTAL_STRESSORS = 26;

/**
 * Four bands relative to the county median. This is our presentation, not
 * MPCA's determination — the agency's own yes/no finding ships unmodified in
 * `mpcaAdverse`, and the layer's limitations say which is which.
 */
function band(count, countyMedian, stateMedian) {
  const median = countyMedian ?? stateMedian;
  if (count == null || median == null || median <= 0) return null;
  if (count <= median * 0.5) return 'Fewer stressors';
  if (count <= median) return 'Near county median';
  if (count <= median * 1.5) return 'Elevated';
  return 'Most burdened';
}

async function main() {
  const res = await fetchWithRetry(SOURCE, { timeoutMs: 300_000 });
  const collection = await res.json();
  const raw = collection?.features;
  if (!Array.isArray(raw) || !raw.length) throw new Error('CI-MAP query returned no features');
  if (Math.abs(raw.length - EXPECTED_TRACTS) > 50) {
    throw new Error(
      `expected ~${EXPECTED_TRACTS} tracts, got ${raw.length} — the draft service changed shape`,
    );
  }
  log('ej', `${raw.length} tracts from CI-MAP`);

  const missing = Object.values(FIELDS).filter((k) => !(k in (raw[0].properties ?? {})));
  if (missing.length) {
    throw new Error(`CI-MAP fields missing: ${missing.join(', ')} — re-check the service schema`);
  }

  const features = raw.map((f) => {
    const p = f.properties ?? {};
    const geoid = String(p[FIELDS.geoid]);
    const countyName = text(p[FIELDS.countyName]);
    const stressorCount = num(p[FIELDS.stressorCount]);
    const countyMedian = num(p[FIELDS.countyMedian]);
    const stateMedian = num(p[FIELDS.stateMedian]);
    const tractNumber = tractLabel(geoid);

    return {
      type: 'Feature',
      geometry: f.geometry,
      properties: {
        id: slugId('ej', geoid),
        layer: 'ej_cumulative',
        name: `Census Tract ${tractNumber ?? geoid}${countyName ? `, ${countyName} County` : ''}`,
        county: countyName,
        state: 'MN',
        // A tract GEOID is state+county+tract; the county is its prefix.
        countyFips: geoid.length >= 5 ? geoid.slice(0, 5) : null,
        confidence: 'confirmed',
        sourceDate: '2025',
        attributes: {
          // The 2020 tract GEOID, published as an attribute rather than left
          // buried in the record id: it is the key the HOLC crosswalk layer
          // joins on, and a join key that only exists as a substring of
          // something else is a join waiting to be parsed wrong.
          geoid,
          // The Census Bureau's own short form of the same tract, for anyone
          // cross-referencing a data.census.gov profile page — those are
          // indexed by this number, not the 11-digit GEOID.
          tractNumber,
          burdenBand: band(stressorCount, countyMedian, stateMedian),
          stressorCount,
          stressorSummary: stressorCount == null ? null : `${stressorCount} / ${TOTAL_STRESSORS}`,
          countyMedian,
          stateMedian,
          indicatorCount: num(p[FIELDS.indicatorCount]),
          percentAdverse: num(p[FIELDS.percentAdverse]),
          // MPCA's own determination, verbatim ("Yes"/"No").
          mpcaAdverse: text(p[FIELDS.mpcaAdverse]),
          adverseList: text(p[FIELDS.adverseList]),
          tribalIntersect: text(p[FIELDS.tribalIntersect]),
          tribeNames: text(p[FIELDS.tribeNames]),
          ejPoverty: text(p[FIELDS.ejPoverty]),
          ejPeopleOfColor: text(p[FIELDS.ejPeopleOfColor]),
          ejLimitedEnglish: text(p[FIELDS.ejLimitedEnglish]),
        },
      },
    };
  });

  const bands = features.reduce((acc, f) => {
    const b = f.properties.attributes.burdenBand ?? 'unbanded';
    acc[b] = (acc[b] ?? 0) + 1;
    return acc;
  }, {});
  log('ej', `bands: ${Object.entries(bands).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  const adverse = features.filter((f) => f.properties.attributes.mpcaAdverse === 'Yes').length;
  log('ej', `MPCA adverse-cumulative-stressors determination: ${adverse} of ${features.length} tracts`);

  await writeLayer('ej-cumulative', {
    layer: 'ej_cumulative',
    provenance: {
      source:
        'Minnesota Pollution Control Agency, Cumulative Impacts Mapping and Analysis Platform (CI-MAP)',
      sourceUrl: 'https://pca-gis02.pca.state.mn.us/ci-map/',
      datasetUrl: SOURCE,
      statute: 'Minn. Stat. § 116.065',
      license: null,
      licenseUrl: null,
      licenseNote:
        'No formal licence statement is published for the CI-MAP service. Minnesota government data is presumptively public under the Minnesota Government Data Practices Act, Minn. Stat. ch. 13. No source found for explicit reuse terms.',
      attribution: 'Minnesota Pollution Control Agency, CI-MAP (draft)',
      sourceDate: '2025-12',
      refresh: 'occasional',
      tractCount: features.length,
      companionDataset:
        'https://gis.data.mn.gov/ (item b27b9c736d74425e8e44f0e360c22567, "MPCA Environmental Justice")',
    },
    knownGaps: [
      'CI-MAP is a public draft, first published December 2025 while rulemaking under Minn. Stat. § 116.065 is ongoing. Scores and schema may change without notice; this ingest fails loudly if the tract count or field names shift.',
      'The service publishes no formal licence or DCAT record. No source found for explicit reuse terms; the layer is treated as public government data under Minn. Stat. ch. 13 and attributed to MPCA.',
      'A tract is an average over roughly four thousand people. The band compares a tract to its county median: it describes relative burden between places, not the exposure of any household.',
      "The four burden bands (half the county median, the median, one and a half times it) are this project's presentation choice, not MPCA's. The agency's own adverse-cumulative-stressors determination ships unmodified in the attributes.",
      'EJ demographic flags in this layer are MPCA determinations from 2018–2022 ACS estimates, embedded in CI-MAP; the standalone Geospatial Commons dataset is the formally licensed companion record for them.',
    ],
    features,
  });
}

main().catch((err) => {
  console.error(`[ej] FAILED: ${err.message}`);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Historical policy: the HOLC appraisal map at block scale, as the Metropolitan
 * Council redrew it.
 *
 * ---------------------------------------------------------------------------
 * WHY A SECOND HOLC LAYER EXISTS
 * ---------------------------------------------------------------------------
 *
 * `redlining.mjs` publishes Mapping Inequality's digitisation: 168 graded
 * neighbourhood areas across eight Minnesota cities, each carrying the
 * identifier HOLC printed on it and, where the sheet survives, the appraiser's
 * own prose. That prose is the evidentiary core of the layer and this file
 * cannot reproduce it — the Met Council's version carries no area identifier,
 * so there is nothing for a survey sheet to attach to.
 *
 * What it carries instead is resolution. Mapping Inequality drew the *areas*
 * the appraisers outlined; the Met Council traced the *colour on the sheet*,
 * which was applied block by block. The result is 11,561 polygons for two
 * cities where Mapping Inequality has 108, and — the part that changes what a
 * reader sees — it excludes the lakes, parks and undeveloped land that a
 * neighbourhood outline necessarily swallows. Roughly an eighth of the mapped
 * extent turns out to be water or parkland that was never graded at all.
 *
 * Neither layer supersedes the other. This one says where the colour stopped;
 * that one says what the appraiser wrote and covers six more cities.
 *
 * ---------------------------------------------------------------------------
 * THE PUBLISHER'S DATE IS WRONG, AND THE LAYER SAYS SO
 * ---------------------------------------------------------------------------
 *
 * The Met Council record stamps a temporal extent of 1934-01-01 and its
 * description discusses "neighborhoods classified as Type C and Type D in
 * [1]934". HOLC's City Survey Program did not begin until late 1935, so no
 * residential security map can date from 1934; 1934 is the year the FHA
 * underwriting scheme these grades implement was created, which the
 * description conflates with the date of the sheet. Mapping Inequality's own
 * city register dates the Minneapolis map to 1937 and records St. Paul's year
 * as unknown.
 *
 * We do not republish 1934 as a fact, and we do not silently substitute 1937
 * for a two-city sheet where only one city's year is documented. The layer is
 * dated to the programme window and `knownGaps` states the conflict in full.
 *
 * ---------------------------------------------------------------------------
 * WHAT EACH SOURCE IS ASKED
 * ---------------------------------------------------------------------------
 *
 * The two tracings are not rivals answering one question badly. They answer
 * different questions, and each block's record is assembled from whichever
 * source is competent to answer:
 *
 *   Met Council  -> what colour is this block? (class, and so the grade)
 *   Mapping Ineq -> which area is this, and what did the appraiser write?
 *
 * So a park inside area D3 reads "Park / Open Space, in HOLC area D3", and
 * nothing is overruled: the block-level tracing is more specific about the
 * ground, the neighbourhood tracing supplies the identity that carries the
 * prose. `miArea` is the label drawn on the map and the route back to the
 * survey sheet in the redlining layer.
 *
 * ---------------------------------------------------------------------------
 * VERIFICATION IS COMPUTED, NOT ASSERTED
 * ---------------------------------------------------------------------------
 *
 * The Met Council's own lineage statement is candid: "This data was digitized
 * from a non-georeferenced, photgraphic [sic] image of the original map. The
 * accuracy is unknown." A layer built on an admittedly unknown georeference
 * needs a check somebody can see, so this ingest performs one every run: each
 * polygon's representative point is tested against the Mapping Inequality
 * areas already on disk, and the rate at which the two independent tracings
 * put the same ground in the same class is measured and written into the
 * layer's provenance and its known gaps.
 *
 * The measurement stays at layer level rather than being stamped onto every
 * polygon. Per-block it was two more fields in the panel restating a
 * distinction the design above already resolves — and most of the 3.8% that
 * "disagree" are precisely the parks, water and industrial blocks this layer
 * exists to show, where the finer tracing is not contradicting the coarser one
 * so much as saying more than it could.
 *
 * ---------------------------------------------------------------------------
 * THE SEAM TO THE PRESENT
 * ---------------------------------------------------------------------------
 *
 * A block is small enough to sit inside exactly one 2020 census tract, so each
 * one resolves its own `tractGeoid` directly against the tract boundaries the
 * cumulative-stressor layer already ships. That is a clean one-to-one join and
 * it is what lets the map put a 1930s grade beside a present-day tract record
 * at block precision — adjacent, dated, sourced, with nothing computed between
 * them (§1c). Graded areas, which span several tracts each, get the same link
 * as a list with coverage shares; see redlining.mjs.
 */

import {
  fetchWithRetry,
  writeLayer,
  loadCounties,
  loadPublicJson,
  thinGeometry,
  log,
  slugId,
} from './lib/util.mjs';
import { findContaining, representativePoint } from '../../src/lib/geo.mjs';

const SERVICE =
  'https://arcgis.metc.state.mn.us/data1/rest/services/planning/Other_Plan_Areas_Public/FeatureServer/0';

/** The Geospatial Commons landing record, which is what a citation should point at. */
const ITEM =
  'https://gis.data.mn.gov/datasets/d801b130d3f640c4832d3af7abee5b2c_0/explore';

/** File geodatabase the publisher offers alongside the service. */
const FGDB = 'https://gisdata.metc.state.mn.us/gisdata/Planning/historic_holc_appraisal.zip';

/** The service caps a page at 1000 and reports nothing about how many remain. */
const PAGE = 1000;

/**
 * Sanity bound on the published record count.
 *
 * 11,561 polygons at the time of writing. A run that finds wildly fewer has
 * almost certainly hit a partially-served query rather than a republished
 * dataset, and a partial HOLC map is worse than none: the gap would read as
 * ungraded ground.
 */
const MIN_EXPECTED = 10_000;

/**
 * The publisher's single attribute, decoded to a HOLC grade letter.
 *
 * The four residential classes get the letter HOLC printed. The other five are
 * the sheet's non-residential shading and get none, because HOLC did not grade
 * them — recording an absent grade as "E" would flatten a distinction the
 * source actually makes. The keys are Mapping Inequality's own category
 * vocabulary, which is what makes the two digitisations comparable below
 * without a second translation table in the middle.
 *
 * What each class *meant* is not repeated onto every polygon. Nine strings
 * across 11,561 records is most of two megabytes to say one of nine things,
 * and the registry already has the mechanism for exactly this: the layer's
 * `className` filter carries a `valueDescriptions` entry per class, written
 * once and shipped once.
 */
const GRADE_OF_CLASS = {
  Best: 'A',
  'Still Desirable': 'B',
  'Definitely Declining': 'C',
  Hazardous: 'D',
  'Business and Industrial': null,
  'Park / Open Space': null,
  'Open Water': null,
  Undeveloped: null,
  Uncertain: null,
};

/**
 * Drop the keys with nothing in them.
 *
 * Same reasoning as aadt.mjs's helper of the same name: a null attribute still
 * costs its key and six bytes of `":null,"` in a file this many records long,
 * and every consumer here treats a missing key and a null one identically.
 * Five of the nine classes carry no grade, so this is thousands of records.
 */
function without(attributes) {
  return Object.fromEntries(Object.entries(attributes).filter(([, v]) => v !== null));
}

async function fetchPage(offset) {
  const params = new URLSearchParams({
    where: '1=1',
    outFields: 'OBJECTID,HSG_SCALE',
    returnGeometry: 'true',
    outSR: '4326',
    // Five decimals is ~1.1 m. These are city blocks, not survey parcels, and
    // the publisher warns the georeference itself is of unknown accuracy, so
    // shipping seventeen decimals would be precision theatre paid for in bytes.
    geometryPrecision: '5',
    resultRecordCount: String(PAGE),
    resultOffset: String(offset),
    f: 'geojson',
  });
  const res = await fetchWithRetry(`${SERVICE}/query?${params}`, { timeoutMs: 120_000 });
  return res.json();
}

async function fetchAll() {
  const out = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await fetchPage(offset);
    const got = page?.features ?? [];
    out.push(...got);
    log('holc-detail', `  fetched ${out.length} polygons`);
    if (got.length < PAGE) break;
  }
  return out;
}

async function main() {
  const [raw, counties, jurisdictions, redlining, tracts] = await Promise.all([
    fetchAll(),
    loadCounties(),
    loadPublicJson('reference/mn-jurisdictions.geojson', {
      runFirst: 'npm run data:jurisdictions',
    }),
    loadPublicJson('redlining.geojson', { runFirst: 'npm run data:redlining' }),
    // 2020 census tract boundaries, borrowed from the layer that already
    // publishes them rather than downloaded twice. Optional: a missing file
    // costs the tract link, not the layer.
    loadPublicJson('ej-cumulative.geojson', { optional: true }),
  ]);
  if (!tracts) {
    log('holc-detail', 'no tract boundaries on disk — run `npm run data:ej` to add tract links');
  }

  if (raw.length < MIN_EXPECTED) {
    throw new Error(
      `only ${raw.length} polygons returned, expected at least ${MIN_EXPECTED} — refusing to publish a partial map`,
    );
  }
  log('holc-detail', `${raw.length} polygons published by the Metropolitan Council`);

  const unknownClasses = [
    ...new Set(
      raw.map((f) => f.properties?.HSG_SCALE).filter((c) => c && !(c in GRADE_OF_CLASS)),
    ),
  ];
  if (unknownClasses.length) {
    throw new Error(
      `unrecognised HSG_SCALE value(s): ${unknownClasses.join(', ')} — read the sheet before publishing them`,
    );
  }

  const tally = { same: 0, differs: 0, outside: 0 };

  const features = raw.map((f) => {
    const className = f.properties?.HSG_SCALE ?? null;
    const grade = className ? (GRADE_OF_CLASS[className] ?? null) : null;
    const point = representativePoint(f.geometry);

    const county = findContaining(point, counties.features);
    const jurisdiction = findContaining(point, jurisdictions.features);
    const miArea = findContaining(point, redlining.features);
    const miCategory = miArea?.properties.attributes.category ?? null;
    const tract = tracts ? findContaining(point, tracts.features) : null;

    const verdict = !miArea ? 'outside' : miCategory === className ? 'same' : 'differs';
    tally[verdict]++;

    return {
      type: 'Feature',
      geometry: thinGeometry(f.geometry),
      properties: {
        id: slugId('holc-detail', String(f.properties?.OBJECTID)),
        layer: 'holc_appraisal_detail',
        name: `${jurisdiction?.properties.basename ?? 'Twin Cities'} — ${className ?? 'unclassified'}`,
        county: county?.properties.name ?? null,
        state: 'MN',
        countyFips: county?.properties.geoid ?? null,
        confidence: 'confirmed',
        // The sheet itself, not the year the publisher stamped on the file.
        // See the header: 1934 predates the survey programme that produced it.
        sourceDate: '1930s',
        attributes: without({
          className,
          grade,
          city: jurisdiction?.properties.basename ?? null,
          // The identifier HOLC printed on the area this block sits in —
          // drawn on the map as its label, and the route back to what the
          // appraiser wrote, which lives in the redlining layer and is
          // deliberately not copied here.
          miArea: miArea?.properties.attributes.holcId ?? null,
          // The 2020 tract this block sits in. One block, one tract; the join
          // key every present-day tract dataset here shares.
          tractGeoid: tract?.properties.attributes.geoid ?? null,
        }),
      },
    };
  });

  const byClass = features.reduce((acc, f) => {
    const c = f.properties.attributes.className ?? 'unclassified';
    acc[c] = (acc[c] ?? 0) + 1;
    return acc;
  }, {});
  log(
    'holc-detail',
    `classes: ${Object.entries(byClass)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}=${v}`)
      .join(', ')}`,
  );

  const cities = [
    ...new Set(features.map((f) => f.properties.attributes.city).filter(Boolean)),
  ].sort();
  log('holc-detail', `${cities.length} municipalities touched: ${cities.join(', ')}`);

  const labelled = features.filter((f) => f.properties.attributes.miArea).length;
  const withTract = features.filter((f) => f.properties.attributes.tractGeoid).length;
  log('holc-detail', `${labelled}/${features.length} blocks carry a HOLC area label`);
  log('holc-detail', `${withTract}/${features.length} blocks resolve a 2020 census tract`);

  /*
   * The agreement rate, measured this run rather than remembered from a note.
   *
   * Denominator is the polygons that fall inside a Mapping Inequality area at
   * all — see AGREEMENT above for why the ones outside are excluded rather
   * than counted against. The figure goes into provenance and into the
   * knownGaps text from the same variables, so the prose and the number cannot
   * drift apart the way a hand-written percentage would.
   */
  const compared = tally.same + tally.differs;
  const agreementPct = compared ? Math.round((tally.same / compared) * 1000) / 10 : null;
  log(
    'holc-detail',
    `agreement with Mapping Inequality: ${tally.same}/${compared} = ${agreementPct}% ` +
      `(${tally.outside} polygons fall outside every graded area)`,
  );
  if (agreementPct !== null && agreementPct < 80) {
    throw new Error(
      `only ${agreementPct}% of polygons agree with Mapping Inequality — the two maps have diverged far enough that publishing this as the same survey needs a human to look first`,
    );
  }

  await writeLayer('holc-detail', {
    layer: 'holc_appraisal_detail',
    provenance: {
      source: 'Historic HOLC Neighborhood Appraisal, Metropolitan Council',
      sourceUrl: ITEM,
      datasetUrl: `${SERVICE}/query`,
      fileGeodatabaseUrl: FGDB,
      license: 'Public domain (Minn. Stat. ch. 13)',
      licenseUrl: 'https://www.revisor.mn.gov/statutes/cite/13',
      attribution:
        'Metropolitan Council, "Historic Home Owners\' Loan Corporation Neighborhood Appraisal Map"',
      // The HOLC City Survey Program window, not the publisher's 1934 stamp.
      // knownGaps carries the full account of the disagreement.
      sourceDate: '1935-1940',
      publisherStatedDate: '1934',
      refresh: 'rare',
      publisherLineage:
        'This data was digitized from a non-georeferenced, photgraphic image of the original map. Categorization and descriptions are composites from multiple sources.',
      publisherAccuracyStatement:
        'This data was digitized from a non-georeferenced, photgraphic image of the original map. The accuracy is unknown.',
      // Measured every run against redlining.geojson; see the header.
      crossCheckedAgainst: 'Mapping Inequality (public/data/redlining.geojson)',
      crossCheckAgreementPercent: agreementPct,
      crossCheckComparedPolygons: compared,
      crossCheckOutsideAnyGradedArea: tally.outside,
      blocksWithAreaLabel: labelled,
      blocksWithTract: withTract,
      tractVintage: '2020 census tracts, via public/data/ej-cumulative.geojson',
      // Two publishers appear on every labelled block: the geometry and class
      // are the Metropolitan Council's, the area identifier is Mapping
      // Inequality's. Credited separately rather than folded into one line.
      secondarySources: [
        {
          key: 'mapping-inequality',
          name: 'Mapping Inequality, Digital Scholarship Lab, University of Richmond',
          url: 'https://dsl.richmond.edu/panorama/redlining/',
          license: 'CC BY-NC 2.5',
          licenseUrl: 'https://creativecommons.org/licenses/by-nc/2.5/',
          contributes: {
            en: 'The HOLC area identifier drawn on each block, and the independently georeferenced areas this layer is checked against.',
            es: 'El identificador del área HOLC dibujado en cada manzana, y las áreas georreferenciadas de forma independiente con las que se contrasta esta capa.',
          },
        },
      ],
    },
    knownGaps: [
      'Minneapolis and St. Paul only. The Metropolitan Council digitised the Twin Cities sheet; the six other Minnesota cities HOLC surveyed appear in the redlining layer instead, and neither layer covers a city that was never surveyed.',
      'The publisher dates this file to 1934 and its description discusses grades assigned "in 1934". HOLC\'s City Survey Program did not begin until late 1935, so no residential security map can date from 1934 — 1934 is the year the FHA underwriting scheme these grades implement was created. Mapping Inequality dates the Minneapolis map to 1937 and records no year at all for St. Paul. This layer is dated to the programme window rather than repeating either claim as fact.',
      'The Metropolitan Council states plainly that the file "was digitized from a non-georeferenced, photgraphic image of the original map" and that "the accuracy is unknown". Boundaries here are a tracing of a photograph of a hand-drawn sheet, not a survey.',
      `Every polygon is tested against the independently georeferenced Mapping Inequality areas at build time: ${tally.same} of ${compared} comparable polygons carry the same class, or ${agreementPct}%. A further ${tally.outside} fall outside every graded area, which is expected — Mapping Inequality drew only the graded neighbourhoods, and this sheet was traced to its edges. Most of the remainder are the parks, water and industrial blocks this layer exists to distinguish, where the finer tracing says more than the neighbourhood outline could rather than contradicting it.`,
      `The Metropolitan Council file carries one attribute, the class, and no area identifier — so nothing in it can join to HOLC's survey sheets. The area label on each block (${labelled} of ${features.length} have one) is Mapping Inequality's, resolved by which of their graded areas the block's centre falls inside, and it is the route back to what the appraiser wrote. Blocks outside every graded area carry no label.`,
      `${withTract} of ${features.length} blocks resolve a 2020 census tract, matched by containment against the tract boundaries this project already ships with the cumulative-stressor layer. The tract is a join key for laying present-day data beside the grade. It is not a claim that anything about the tract today follows from the grade.`,
      'Park, open water and undeveloped shading is reproduced as the sheet drew it. That is a claim about the 1930s map, not about present-day land cover — parks have been built and lakes have been filled since.',
      '"Uncertain" is the publisher\'s own value for ground whose colour could not be read off the photograph. It is carried through unresolved rather than assigned a grade.',
    ],
    features,
  });
}

main().catch((err) => {
  console.error(`[holc-detail] FAILED: ${err.message}`);
  process.exit(1);
});

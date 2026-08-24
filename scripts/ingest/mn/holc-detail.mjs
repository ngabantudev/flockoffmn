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

import { writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  arcgisCount,
  arcgisQueryAll,
  writeLayer,
  loadCounties,
  loadPublicJson,
  thinGeometry,
  without,
  log,
  slugId,
  PUBLIC_DATA,
} from '../lib/util.mjs';
import { findContaining, representativePoint } from '../../../src/lib/geo.mjs';

/**
 * ---------------------------------------------------------------------------
 * THE SIMPLIFIED RENDERING COMPANION
 * ---------------------------------------------------------------------------
 *
 * 11,561 full-resolution block polygons is the right file to export and to
 * draw once a reader is zoomed in far enough to actually see the difference
 * from the coarser `redlining.geojson` areas — but it is the wrong file to
 * hand a phone the instant the layer is switched on at a metro-wide zoom,
 * where every one of those vertices is spent rendering something indistinguishable
 * from the coarser layer already on screen. `holc-detail-simplified.geojson`
 * below is a second, geometry-only file with the same features, attributes
 * and ids as the canonical export, just fewer vertices per polygon — the map
 * loads it below `fullDetailFromZoom` (see registry.ts's `levelOfDetail` on
 * `holc_appraisal_detail`) and swaps to the file above once the reader has
 * zoomed in past it. It is never registered as its own layer, never offered
 * as a download, and never a claim about the data beyond the one the
 * full-resolution file already makes — see writeLayer's call below for that
 * one, which stays the canonical, exported, citable file.
 *
 * The reduction itself is Douglas–Peucker, implemented locally rather than
 * pulled in as a dependency (see CLAUDE.md's "Dependency-Free ETL" rule) —
 * it is a well-known, easily checked algorithm, not one worth a package for
 * the few dozen lines it takes.
 */

/** Perpendicular distance from `point` to the line through `lineStart`/`lineEnd`, in degrees. */
function perpendicularDistance(point, lineStart, lineEnd) {
  const [x, y] = point;
  const [x1, y1] = lineStart;
  const [x2, y2] = lineEnd;
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(x - x1, y - y1);
  const t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy);
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(x - projX, y - projY);
}

/**
 * Classic recursive Douglas–Peucker over an open polyline: keeps a point only
 * if it sits farther than `epsilon` from the straight line its neighbours
 * would otherwise draw. `points` here is never long enough (block outlines
 * run to a few dozen vertices, not thousands) for the recursion depth to be a
 * concern.
 */
function douglasPeucker(points, epsilon) {
  if (points.length < 3) return points;
  let maxDist = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], points[0], points[points.length - 1]);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }
  if (maxDist > epsilon) {
    const left = douglasPeucker(points.slice(0, index + 1), epsilon);
    const right = douglasPeucker(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[points.length - 1]];
}

/**
 * Douglas–Peucker adapted to a closed GeoJSON ring (first coordinate ===
 * last). A straight run of the open algorithm from first-to-last degenerates
 * on a closed ring — start and end are the same point, so there is no line to
 * measure distance from. Splitting first at the vertex farthest from the
 * start, the standard fix for a closed curve, gives the open algorithm two
 * honest arcs to work on instead. Falls back to the original ring untouched
 * if simplification would leave fewer than four coordinates — the minimum a
 * closed polygon ring can have — rather than publish a degenerate shape.
 */
function simplifyRing(ring, epsilon) {
  if (ring.length <= 4) return ring;
  const first = ring[0];
  let maxDist = 0;
  let splitIndex = 1;
  for (let i = 1; i < ring.length - 1; i++) {
    const d = Math.hypot(ring[i][0] - first[0], ring[i][1] - first[1]);
    if (d > maxDist) {
      maxDist = d;
      splitIndex = i;
    }
  }
  const arc1 = douglasPeucker(ring.slice(0, splitIndex + 1), epsilon);
  const arc2 = douglasPeucker(ring.slice(splitIndex), epsilon);
  const simplified = arc1.slice(0, -1).concat(arc2);
  if (simplified.length < 4) return ring;
  const last = simplified[simplified.length - 1];
  if (last[0] !== simplified[0][0] || last[1] !== simplified[0][1]) simplified.push(simplified[0]);
  return simplified;
}

/** simplifyRing applied through a Polygon's or MultiPolygon's ring nesting. Other geometry types pass through untouched — this layer is polygons only. */
function simplifyGeometry(geometry, epsilon) {
  if (!geometry) return geometry;
  const { type, coordinates } = geometry;
  if (type === 'Polygon') {
    return { ...geometry, coordinates: coordinates.map((ring) => simplifyRing(ring, epsilon)) };
  }
  if (type === 'MultiPolygon') {
    return {
      ...geometry,
      coordinates: coordinates.map((poly) => poly.map((ring) => simplifyRing(ring, epsilon))),
    };
  }
  return geometry;
}

/**
 * ~30 m at the Twin Cities' latitude — a modest fraction of a city block
 * (typically 100–200 m a side), enough to shed most of a block outline's
 * vertices at the zoomed-out scale this file is drawn at without a shape a
 * reader would notice had moved. (0.00015°, ~13 m, was tried first and left
 * most vertices in place — these blocks were already digitised close to
 * rectangular, so the tolerance needs to clear a bend's actual size, not
 * just the ~1 m rounding noise thinGeometry already removes.)
 */
const SIMPLIFY_EPSILON_DEG = 0.0003;

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
 * HOLC's City Survey Program window, and this layer's honest date.
 *
 * Mapping Inequality records 1937 for Minneapolis and no year at all for
 * St. Paul, and this is one sheet covering both, so neither city's answer can
 * stand for the whole. Declared once and used for both the per-feature date
 * and the layer provenance, so the two cannot drift.
 */
const PROGRAM_WINDOW = '1935-1940';

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
 * A HOLC area identifier, or null.
 *
 * Mapping Inequality's `label` field is the identifier printed on the sheet for
 * the graded areas — "A2", "D3", and occasionally a lettered subdivision like
 * "C18a". For the one polygon per city that collects all the commercial and
 * industrial ground it is not an identifier at all: the label is the words
 * "Business and Industrial", because HOLC printed no number there.
 *
 * Passing that straight through put a category word into a field the panel
 * renders as "HOLC area this block sits in" and the map draws as a label, on
 * 1,128 of 11,561 blocks — and made LICENSE-DATA.md's description of what this
 * file borrows from Mapping Inequality wrong for a ninth of it. A block on
 * ground HOLC never numbered gets no identifier, which is what the sheet says.
 */
function areaIdentifier(label) {
  return typeof label === 'string' && /^[A-E]\d+[a-z]?$/.test(label.trim())
    ? label.trim()
    : null;
}

/** Query params beyond paging; see arcgisQueryAll in lib/util.mjs. */
const QUERY = {
  outFields: 'OBJECTID,HSG_SCALE',
  returnGeometry: 'true',
  outSR: '4326',
  // Five decimals is ~1.1 m. These are city blocks, not survey parcels, and
  // the publisher warns the georeference itself is of unknown accuracy, so
  // shipping seventeen decimals would be precision theatre paid for in bytes.
  geometryPrecision: '5',
};

async function main() {
  const total = await arcgisCount(SERVICE);
  const [raw, counties, jurisdictions, redlining, tracts] = await Promise.all([
    arcgisQueryAll('holc-detail', SERVICE, { params: QUERY, pageSize: PAGE, expected: total }),
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

  // Two counters, not three buckets: everything else the cross-check reports
  // is derivable from these and the feature count.
  let inside = 0;
  let agree = 0;
  /*
   * Mapping Inequality categories the cross-check actually met.
   *
   * The comparison below is a bare string equality against the Metropolitan
   * Council's class, with no translation table in between (see
   * GRADE_OF_CLASS) — deliberate, but it leaves the contract guarded on one
   * side only. If Mapping Inequality renamed its vocabulary, agreement would
   * collapse and the run would die reporting that "the two maps have
   * diverged": true, and pointing at entirely the wrong cause.
   *
   * Collected during the join rather than swept from the whole redlining layer
   * up front, because that layer is statewide and the four Minnesota cities
   * HOLC mapped outside its City Survey Program legitimately use their own
   * words — "Good", "Poor", "Outlying - Sparcely Settled". Those are not a
   * vocabulary drift and this sheet never meets them; only the categories that
   * land under a Twin Cities block are this check's business.
   */
  const seenCategories = new Set();

  const features = raw.map((f) => {
    const className = f.properties?.HSG_SCALE ?? null;
    const grade = GRADE_OF_CLASS[className] ?? null;
    const point = representativePoint(f.geometry);

    const county = findContaining(point, counties.features);
    const jurisdiction = findContaining(point, jurisdictions.features);
    const miArea = findContaining(point, redlining.features);
    const tract = tracts ? findContaining(point, tracts.features) : null;

    if (miArea) {
      const category = miArea.properties.attributes.category;
      inside++;
      if (category) seenCategories.add(category);
      if (category === className) agree++;
    }

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
        // The survey programme's window, matching this layer's provenance
        // rather than rounding to a decade. See the header: the publisher's
        // 1934 predates the programme that produced the sheet.
        sourceDate: PROGRAM_WINDOW,
        attributes: without({
          className,
          grade,
          city: jurisdiction?.properties.basename ?? null,
          // The identifier HOLC printed on the area this block sits in —
          // drawn on the map as its label, and the route back to what the
          // appraiser wrote, which lives in the redlining layer and is
          // deliberately not copied here.
          miArea: areaIdentifier(miArea?.properties.attributes.holcId),
          // The 2020 tract this block sits in. One block, one tract; the join
          // key every present-day tract dataset here shares.
          tractGeoid: tract?.properties.attributes.geoid ?? null,
          /*
           * MPCA's present-day burden band for that same tract, carried here
           * rather than joined in the browser.
           *
           * The map used to fetch the whole cumulative-stressor layer — 3.6 MB,
           * 683 KB gzipped, 1,505 tract polygons — the moment a reader switched
           * this layer on, purely to render one of four words on a hover card.
           * That doubled the cost of turning the layer on to show an enum, and
           * §0.7 is about old phones on bad connections. Stamped at ingest it
           * costs about four kilobytes gzipped.
           *
           * Two dated, sourced facts about the same ground on one record. The
           * grade is from the 1930s and the band is MPCA's draft reading of
           * today; nothing here computes a relationship between them, and
           * nothing may (§1c).
           */
          tractBurdenBand: tract?.properties.attributes.burdenBand ?? null,
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
   * The two cross-layer joins are the only things in this script that could
   * fail quietly.
   *
   * Everything else refuses to publish on a shape change — the record count,
   * MIN_EXPECTED, the class vocabulary on both sides, the agreement floor. But
   * a rename of Mapping Inequality's `label` or MPCA's `geoid` would simply
   * resolve nothing: the layer would publish 11,561 blocks with the field
   * absent, its own knownGaps would read "0 of 11561 blocks resolve a 2020
   * census tract", and the registry would keep advertising a detail field that
   * is never populated. Structurally valid, self-describing, and wrong.
   */
  if (!labelled) {
    throw new Error(
      `no block resolved a HOLC area label against ${redlining.features.length} graded areas — Mapping Inequality's label field has probably changed`,
    );
  }
  if (tracts && !withTract) {
    throw new Error(
      `no block resolved a census tract against ${tracts.features.length} tracts — MPCA's geoid field has probably changed`,
    );
  }

  // See seenCategories: a word this sheet's ground actually carries, that the
  // class table has never heard of, is a vocabulary change rather than a
  // disagreement between the two maps — and should say so.
  const unknownCategories = [...seenCategories].filter((c) => !(c in GRADE_OF_CLASS));
  if (unknownCategories.length) {
    throw new Error(
      `Mapping Inequality categories this layer cannot compare against: ${unknownCategories.join(', ')} — their vocabulary has probably changed`,
    );
  }

  /*
   * The agreement rate, measured this run rather than remembered from a note.
   *
   * Denominator is the polygons that fall inside a Mapping Inequality area at
   * all. Blocks outside every graded area are excluded rather than counted
   * against: Mapping Inequality drew only the graded neighbourhoods, so a
   * block on ungraded fringe land correctly falls outside all of them, and
   * folding that into a failure rate would understate what is being measured.
   * The figure reaches provenance and the knownGaps text from these same
   * variables, so the prose and the number cannot drift.
   */
  const outside = features.length - inside;
  const agreementPct = inside ? Math.round((agree / inside) * 1000) / 10 : null;
  log(
    'holc-detail',
    `agreement with Mapping Inequality: ${agree}/${inside} = ${agreementPct}% ` +
      `(${outside} polygons fall outside every graded area)`,
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
      sourceDate: PROGRAM_WINDOW,
      publisherStatedDate: '1934',
      refresh: 'rare',
      publisherLineage:
        'This data was digitized from a non-georeferenced, photgraphic image of the original map. Categorization and descriptions are composites from multiple sources.',
      publisherAccuracyStatement:
        'This data was digitized from a non-georeferenced, photgraphic image of the original map. The accuracy is unknown.',
      // Measured every run against redlining.geojson; see the header.
      crossCheckedAgainst: 'Mapping Inequality (public/data/redlining.geojson)',
      crossCheckAgreementPercent: agreementPct,
      crossCheckComparedPolygons: inside,
      crossCheckOutsideAnyGradedArea: outside,
      blocksWithAreaLabel: labelled,
      blocksWithTract: withTract,
      tractVintage: '2020 census tracts, via public/data/ej-cumulative.geojson',
      // Two publishers appear on every labelled block: the geometry and class
      // are the Metropolitan Council's, the area identifier is Mapping
      // Inequality's. Credited separately rather than folded into one line.
      secondarySources: [
        {
          key: 'mpca-cimap',
          name: 'Minnesota Pollution Control Agency, CI-MAP (draft)',
          url: 'https://pca-gis02.pca.state.mn.us/ci-map/',
          license: 'Public government data (Minn. Stat. ch. 13) — no formal licence published',
          licenseUrl: null,
          contributes: {
            en: 'The 2020 census tract boundaries each block is matched against, and that tract’s present-day cumulative-stressor burden band.',
            es: 'Los límites de las secciones censales de 2020 con los que se empareja cada manzana, y la banda de carga acumulativa actual de esa sección.',
          },
        },
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
      `Every polygon is tested against the independently georeferenced Mapping Inequality areas at build time: ${agree} of ${inside} comparable polygons carry the same class, or ${agreementPct}%. A further ${outside} fall outside every graded area, which is expected — Mapping Inequality drew only the graded neighbourhoods, and this sheet was traced to its edges. Most of the remainder are the parks, water and industrial blocks this layer exists to distinguish, where the finer tracing says more than the neighbourhood outline could rather than contradicting it.`,
      `The Metropolitan Council file carries one attribute, the class, and no area identifier — so nothing in it can join to HOLC's survey sheets. The area label on each block (${labelled} of ${features.length} have one) is Mapping Inequality's, resolved by which of their graded areas the block's centre falls inside, and it is the route back to what the appraiser wrote. A block carries no label if it falls outside every graded area, or on the commercial and industrial ground HOLC numbered nothing on — the appraisers printed no identifier there, and this does not invent one.`,
      `${withTract} of ${features.length} blocks resolve a 2020 census tract, matched by containment against the tract boundaries this project already ships with the cumulative-stressor layer. The tract is a join key for laying present-day data beside the grade. It is not a claim that anything about the tract today follows from the grade.`,
      "Each block also carries the burden band MPCA's draft cumulative-impacts map gives that tract today. It is a second dated fact about the same ground, roughly eighty years later, from a draft that may change; the band is MPCA's tract-level reading and describes neither this block nor any household on it. Nothing here computes a relationship between the 1930s grade and the present-day band, and nothing should.",
      'Park, open water and undeveloped shading is reproduced as the sheet drew it. That is a claim about the 1930s map, not about present-day land cover — parks have been built and lakes have been filled since.',
      '"Uncertain" is the publisher\'s own value for ground whose colour could not be read off the photograph. It is carried through unresolved rather than assigned a grade.',
    ],
    features,
  });

  // The simplified rendering companion — see the header comment above
  // SIMPLIFY_EPSILON_DEG for what this file is and, as importantly, what it
  // is not. Same features, attributes and ids as the file writeLayer just
  // wrote; only the vertex count per polygon changes.
  const simplifiedFeatures = features.map((f) => ({
    ...f,
    geometry: simplifyGeometry(f.geometry, SIMPLIFY_EPSILON_DEG),
  }));
  const simplifiedPath = path.join(PUBLIC_DATA, 'holc-detail-simplified.geojson');
  const simplifiedBody = JSON.stringify({ type: 'FeatureCollection', features: simplifiedFeatures });
  // Same "leave the file alone if nothing moved" reasoning as writeLayer's
  // own unchanged-file guard (see its comment there) — this file carries no
  // timestamp to strip first, so a plain byte comparison already does the
  // job of keeping a no-op run's git diff quiet.
  let previousSimplifiedBody = null;
  try {
    previousSimplifiedBody = await readFile(simplifiedPath, 'utf8');
  } catch {
    // No previous file. Write a fresh one.
  }
  if (previousSimplifiedBody === simplifiedBody) {
    log('holc-detail', 'simplified geometry unchanged');
  } else {
    await writeFile(simplifiedPath, simplifiedBody);
    log(
      'holc-detail',
      `wrote ${simplifiedFeatures.length} simplified features -> public/data/holc-detail-simplified.geojson`,
    );
  }
}

main().catch((err) => {
  console.error(`[holc-detail] FAILED: ${err.message}`);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Relation: HOLC graded areas <-> 2020 census tracts.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A LAYER AND NOT A JOIN IN A COMPONENT
 * ---------------------------------------------------------------------------
 *
 * The redlining layer is drawn on 1930s boundaries. Every present-day dataset
 * worth laying beside it — the cumulative-stressor tracts, anything from the
 * census — is drawn on 2020 tract boundaries. The two do not line up, and the
 * gap between them is where a project like this quietly starts making things
 * up: it is very easy to write "this tract was redlined", ship it, and never
 * record that a tract can be four per cent covered by a D grade and ninety-six
 * per cent covered by nothing at all.
 *
 * So the overlap is published as its own record with its own provenance, per
 * CLAUDE.md §0.1 and §2. Each feature here is one intersection — one HOLC area
 * crossed with one tract — carrying the share of that tract the area covers.
 * A reader can see the sliver and judge it. Nothing downstream has to guess.
 *
 * ---------------------------------------------------------------------------
 * THE EDGE IS THE UPSTREAM'S, NOT OURS
 * ---------------------------------------------------------------------------
 *
 * The intersection is computed and published by the Digital Scholarship Lab —
 * the same lab that georeferenced the HOLC polygons — against NHGIS tract
 * boundaries, with the method written out step by step in their repository.
 * We take their file, subset it to Minnesota and rename the fields. We do not
 * compute a spatial join of our own, because a documented edge from the people
 * who drew both sides of it is worth more than an undocumented one we derived
 * in an afternoon.
 *
 * What this layer states is geometric and nothing more: this much of this
 * tract sits on ground that carried this grade. It says nothing about who
 * lives in the tract now, and it must never be read as saying that a present-
 * day condition follows from a 1930s line. Where those facts are laid beside
 * each other — this tract's overlap, that tract's stressor count — they are
 * laid beside each other, dated and sourced, and the reader does the
 * arithmetic (§1c).
 */

import { fetchWithRetry, writeLayer, loadCounties, thinGeometry, log, slugId } from './lib/util.mjs';
import { findContaining, representativePoint } from '../../src/lib/geo.mjs';

const SOURCE =
  'https://raw.githubusercontent.com/americanpanorama/mapping-inequality-census-crosswalk/main/MIv3Areas_2020TractCrosswalk.geojson';

const REPO = 'https://github.com/americanpanorama/mapping-inequality-census-crosswalk';

const STATE_USPS = process.env.STATE_USPS ?? 'MN';

/**
 * ~72 MB nationally, with no per-state file published, so the whole thing is
 * fetched and filtered here. It is the one heavy download in the pipeline and
 * it runs against a source that changes about once a year.
 */
const FETCH_TIMEOUT_MS = 600_000;

/** HOLC's four residential grades, in the appraisers' own words. */
const GRADE_MEANING = {
  A: 'Graded "Best" — in practice, restricted to white residents.',
  B: 'Graded "Still Desirable" — expected to hold value.',
  C: 'Graded "Definitely Declining" — marked down for the arrival of Black, Jewish and immigrant residents.',
  D: 'Graded "Hazardous" — outlined in red, with lending withheld on explicitly racial grounds.',
};

const UNGRADED = 'Recorded on the map without a residential grade — commercial, industrial or unclassified land.';

/**
 * Percent of the tract this area covers, as a rounded percentage or null.
 *
 * The upstream field is a fraction and is occasionally absent. An absent
 * share is published as null rather than zero: "we do not know how much of
 * this tract it covers" and "it covers none of it" are different claims, and
 * only one of them is true here.
 */
function sharePercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 1000) / 10;
}

/**
 * Coarse bands over that share, so the layer can be filtered without a reader
 * having to reason about decimals. The thresholds are a presentation choice
 * and the limitations say so; the underlying percentage ships unmodified
 * alongside them.
 */
function shareBand(percent) {
  if (percent === null) return null;
  if (percent < 5) return 'Under 5% of the tract';
  if (percent < 25) return '5–25% of the tract';
  if (percent < 50) return '25–50% of the tract';
  return 'Over half the tract';
}

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function main() {
  log('holc-tracts', 'fetching the national crosswalk (~72 MB, no per-state file published)');
  const res = await fetchWithRetry(SOURCE, { timeoutMs: FETCH_TIMEOUT_MS });
  const all = await res.json();
  if (!Array.isArray(all?.features) || !all.features.length) {
    throw new Error('crosswalk returned no features');
  }
  log('holc-tracts', `${all.features.length} intersections nationally`);

  const scoped = all.features.filter((f) => f.properties?.state === STATE_USPS);
  if (!scoped.length) throw new Error(`no crosswalk rows found for ${STATE_USPS}`);

  const counties = await loadCounties();

  const features = scoped.map((f) => {
    const p = f.properties ?? {};
    const geoid = text(p.GEOID);
    const grade = text(p.grade);
    const areaId = p.area_id ?? null;
    const holcId = text(p.label);
    const percent = sharePercent(p.pct_tract);
    const county = findContaining(representativePoint(f.geometry), counties.features);

    return {
      type: 'Feature',
      geometry: thinGeometry(f.geometry),
      properties: {
        // One HOLC area can cross several tracts and one tract several areas,
        // so neither identifier alone is unique — the pair is.
        id: slugId('holc-tract', STATE_USPS, String(areaId), geoid ?? 'no-tract'),
        layer: 'holc_tract_overlap',
        name: `${p.city} — HOLC area ${holcId ?? areaId}${grade ? ` (grade ${grade})` : ''} × tract ${geoid ?? 'unmatched'}`,
        county: county?.properties.name ?? null,
        state: STATE_USPS,
        countyFips: county?.properties.geoid ?? null,
        confidence: 'confirmed',
        // The overlap is between a 1930s map and 2020 tract boundaries; the
        // tract vintage is the one a reader needs to check a present-day join.
        sourceDate: '2020',
        attributes: {
          // --- the 1930s side ---
          grade,
          gradeMeaning: grade ? (GRADE_MEANING[grade] ?? UNGRADED) : UNGRADED,
          category: text(p.cat),
          city: text(p.city),
          holcId,
          // The key back into the redlining layer's own records, and through
          // it to the appraiser's survey sheet.
          areaId,

          // --- the present-day side ---
          // 2020 census tract GEOID: the join key every modern tract dataset
          // in this repo shares, including the cumulative-stressor layer.
          tractGeoid: geoid,
          tractSharePercent: percent,
          tractShareBand: shareBand(percent),
          overlapSqMeters:
            Number.isFinite(Number(p.calc_area)) ? Math.round(Number(p.calc_area)) : null,
        },
      },
    };
  });

  const areas = new Set(features.map((f) => f.properties.attributes.areaId));
  const tracts = new Set(
    features.map((f) => f.properties.attributes.tractGeoid).filter(Boolean),
  );
  const cities = [...new Set(features.map((f) => f.properties.attributes.city))].sort();
  const untracted = features.filter((f) => !f.properties.attributes.tractGeoid).length;
  /*
   * Minnesota HOLC areas that cross into another state's tracts.
   *
   * Duluth's map runs to the harbour and the tracts on the far side of it are
   * Wisconsin's. The rows are scoped by the *area's* state, so they belong
   * here; what they will not do is join to a Minnesota-only present-day
   * dataset, and a silently unjoinable row is exactly the kind of gap this
   * layer exists to make visible.
   */
  const outOfState = features.filter((f) => {
    const g = f.properties.attributes.tractGeoid;
    return g && g.slice(0, 2) !== '27';
  }).length;
  const unshared = features.filter((f) => f.properties.attributes.tractSharePercent === null).length;

  log(
    'holc-tracts',
    `${features.length} overlaps: ${areas.size} HOLC areas × ${tracts.size} tracts across ${cities.length} cities`,
  );
  const byGrade = features.reduce((acc, f) => {
    const g = f.properties.attributes.grade ?? 'ungraded';
    acc[g] = (acc[g] ?? 0) + 1;
    return acc;
  }, {});
  log('holc-tracts', `by grade: ${Object.entries(byGrade).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  if (untracted) log('holc-tracts', `${untracted} rows carry no tract GEOID upstream`);
  if (outOfState) log('holc-tracts', `${outOfState} rows overlap a tract outside Minnesota`);

  await writeLayer('holc-tracts', {
    layer: 'holc_tract_overlap',
    provenance: {
      source:
        'Mapping Inequality census crosswalk, Digital Scholarship Lab, University of Richmond',
      sourceUrl: REPO,
      datasetUrl: SOURCE,
      // The repository README states "This data is licensed under a CC-BY-NC
      // license" and names no version; the repository carries no LICENSE file.
      // The parent project's own terms page states CC BY-NC 2.5, so that is
      // the version recorded here — flagged, not silently assumed.
      license: 'CC BY-NC (version unstated upstream; parent project states 2.5)',
      licenseUrl: 'https://creativecommons.org/licenses/by-nc/2.5/',
      attribution:
        'Robert K. Nelson, LaDale Winling, et al., "Mapping Inequality: Redlining in New Deal America", crosswalked against NHGIS 2020 census tracts by the Digital Scholarship Lab',
      sourceDate: '2020',
      refresh: 'rare',
      tractVintage: '2020 census tracts (NHGIS)',
      relates: 'redlining -> ej_cumulative, and any other dataset keyed on a 2020 tract GEOID',
      holcAreaCount: areas.size,
      tractCount: tracts.size,
      nationalRowCount: all.features.length,
    },
    knownGaps: [
      'Each record is a geometric overlap and nothing more: this share of this 2020 census tract sits on ground a 1937-era HOLC map graded this way. It is not a statement that anything about the tract today follows from the grade.',
      'A tract can appear several times, once per HOLC area crossing it, and an area can appear several times, once per tract. Summing shares across records without deduplicating by tract will double-count.',
      `${untracted} of ${features.length} rows carry no tract GEOID in the upstream file and cannot be joined to present-day tract data. They are published rather than dropped, because a gap in the crosswalk is itself worth seeing.`,
      `${unshared} rows carry no percent-of-tract figure upstream. That is published as null, not as zero.`,
      `${outOfState} rows cross the state line — a Minnesota HOLC area overlapping a census tract in a neighbouring state. They are kept, because the ground was graded, but they will not join to a Minnesota-only present-day dataset such as the cumulative-stressor layer.`,
      'Tract boundaries are 2020 vintage. A join against a dataset built on 2010 tracts, or on block groups, is not valid without a further crosswalk; the Digital Scholarship Lab publishes a 2010 file for that case.',
      'The percentage bands (under 5%, 5–25%, 25–50%, over half) are this project\'s presentation, not the upstream\'s. The raw percentage ships beside them unmodified.',
      'The crosswalk covers only ground HOLC graded. A tract with no record here was not necessarily spared housing discrimination — it may simply sit outside every surveyed city, or outside the surveyed part of one.',
      'The overlap is computed and published upstream against NHGIS boundaries; this project subsets it to Minnesota and renames fields, and does not recompute the intersection.',
      'The upstream repository has no LICENSE file; its README states only "CC-BY-NC" with no version. No source found for a versioned statement, so the parent Mapping Inequality project\'s CC BY-NC 2.5 terms are applied. Either way it is non-commercial and cannot be redistributed under this project\'s own CC BY 4.0 data terms.',
    ],
    features,
  });
}

main().catch((err) => {
  console.error(`[holc-tracts] FAILED: ${err.message}`);
  process.exit(1);
});

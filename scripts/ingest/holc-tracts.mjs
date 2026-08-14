#!/usr/bin/env node
/**
 * Reference, not a layer: HOLC graded areas <-> 2020 census tracts.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS AT ALL
 * ---------------------------------------------------------------------------
 *
 * The HOLC layers are drawn on 1930s boundaries. Every present-day dataset
 * worth laying beside them — the cumulative-stressor tracts, anything from the
 * census — is drawn on 2020 tract boundaries. The two do not line up, and the
 * gap between them is where a project like this quietly starts making things
 * up: it is very easy to write "this tract was redlined", ship it, and never
 * record that a tract can be four per cent covered by a D grade and ninety-six
 * per cent covered by nothing at all.
 *
 * So the overlap is ingested with its own provenance, per CLAUDE.md §0.1 and
 * §2 — the edge is a documented object, not a join improvised in a component.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS NOT A THIRD MAP TOGGLE
 * ---------------------------------------------------------------------------
 *
 * It shipped briefly as one, and drawn on a map it is very close to useless:
 * 922 slivers whose shapes are just the redlining areas chopped along tract
 * lines, saying visually nothing the redlining layer does not already say. Its
 * value was never the geometry. It is the join key and the coverage share.
 *
 * So the geometry is discarded and what survives is the table: for each HOLC
 * area, which 2020 tracts it touches and how much of each one it covers.
 * `redlining.mjs` reads it to put that list on each graded area, where the
 * "81% of this tract" qualifier sits next to the thing it qualifies rather
 * than on a separate layer a reader has to think to switch on.
 *
 * The blocks in `holc-detail.mjs` do not need this file: a block is small
 * enough to sit inside exactly one tract, so that layer resolves its own tract
 * directly and gets a clean one-to-one join for free.
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
 * What this states is geometric and nothing more: this much of this tract sits
 * on ground that carried this grade. It must never be read as saying that a
 * present-day condition follows from a 1930s line (§1c).
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { fetchWithRetry, PUBLIC_DATA, log } from './lib/util.mjs';

const SOURCE =
  'https://raw.githubusercontent.com/americanpanorama/mapping-inequality-census-crosswalk/main/MIv3Areas_2020TractCrosswalk.geojson';

const REPO = 'https://github.com/americanpanorama/mapping-inequality-census-crosswalk';

const OUT = 'reference/holc-tract-crosswalk.json';

const STATE_USPS = process.env.STATE_USPS ?? 'MN';

/**
 * ~72 MB nationally, with no per-state file published, so the whole thing is
 * fetched and filtered here. It is the one heavy download in the pipeline and
 * it runs against a source that changes about once a year.
 */
const FETCH_TIMEOUT_MS = 600_000;

/**
 * Percent of the tract this area covers, or null.
 *
 * The upstream field is a fraction and is occasionally absent. An absent share
 * is recorded as null rather than zero: "we do not know how much of this tract
 * it covers" and "it covers none of it" are different claims, and only one of
 * them is true here.
 *
 * Two decimal places rather than one, because at one place the genuine slivers
 * round to `0` — and a row that exists at all is a row where the areas *do*
 * overlap, so writing 0 there states the opposite of what the record means.
 * 0.04% reads as the sliver it is.
 */
function sharePercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10_000) / 100;
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

  /*
   * area_id -> the tracts it touches, largest share first.
   *
   * Keyed on the area rather than the tract because that is the direction the
   * redlining layer reads it: it has an area in hand and wants to say which of
   * today's tracts sit on it. The reverse lookup is a one-line invert for any
   * consumer that wants it, and storing both would be two things to keep in
   * agreement.
   */
  const byArea = {};
  let untracted = 0;
  let outOfState = 0;
  const tracts = new Set();

  for (const f of scoped) {
    const p = f.properties ?? {};
    const geoid = text(p.GEOID);
    if (!geoid) {
      untracted++;
      continue;
    }
    // Duluth's map runs to the harbour and the tracts across it are
    // Wisconsin's. Kept, because the ground was graded — but flagged, because
    // they will not join to a Minnesota-only present-day dataset, and a
    // silently unjoinable row is the kind of gap this file exists to expose.
    if (geoid.slice(0, 2) !== '27') outOfState++;
    tracts.add(geoid);

    const key = String(p.area_id);
    (byArea[key] ??= []).push({
      geoid,
      percentOfTract: sharePercent(p.pct_tract),
      overlapSqMeters: Number.isFinite(Number(p.calc_area)) ? Math.round(Number(p.calc_area)) : null,
    });
  }

  for (const rows of Object.values(byArea)) {
    rows.sort((a, b) => (b.percentOfTract ?? 0) - (a.percentOfTract ?? 0));
  }

  const areaCount = Object.keys(byArea).length;
  log(
    'holc-tracts',
    `${scoped.length} overlaps: ${areaCount} HOLC areas × ${tracts.size} tracts`,
  );
  if (untracted) log('holc-tracts', `${untracted} rows carry no tract GEOID upstream — dropped`);
  if (outOfState) log('holc-tracts', `${outOfState} rows overlap a tract outside Minnesota`);

  const dir = path.join(PUBLIC_DATA, 'reference');
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, 'holc-tract-crosswalk.json'),
    JSON.stringify({
      metadata: {
        source:
          'Mapping Inequality census crosswalk, Digital Scholarship Lab, University of Richmond',
        sourceUrl: REPO,
        datasetUrl: SOURCE,
        // The repository README states "This data is licensed under a CC-BY-NC
        // license" and names no version; the repository carries no LICENSE
        // file. The parent project's own terms page states CC BY-NC 2.5, so
        // that is what is recorded — flagged, not silently assumed.
        license: 'CC BY-NC (version unstated upstream; parent project states 2.5)',
        licenseUrl: 'https://creativecommons.org/licenses/by-nc/2.5/',
        attribution:
          'Robert K. Nelson, LaDale Winling, et al., "Mapping Inequality: Redlining in New Deal America", crosswalked against NHGIS 2020 census tracts by the Digital Scholarship Lab',
        tractVintage: '2020 census tracts (NHGIS)',
        state: STATE_USPS,
        areaCount,
        tractCount: tracts.size,
        rowsWithoutTract: untracted,
        rowsOutsideMinnesota: outOfState,
        nationalRowCount: all.features.length,
        note: 'Geometric overlap only: this share of this 2020 tract sits on ground a 1930s HOLC map graded this way. Not a claim that anything about the tract today follows from the grade. Shares must not be summed across areas without deduplicating by tract.',
        lastUpdated: new Date().toISOString(),
      },
      byArea,
    }),
  );
  log('holc-tracts', `wrote ${areaCount} areas -> public/data/${OUT}`);
}

main().catch((err) => {
  console.error(`[holc-tracts] FAILED: ${err.message}`);
  process.exit(1);
});

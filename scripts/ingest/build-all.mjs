#!/usr/bin/env node
/**
 * Runs the whole ingest pipeline in dependency order.
 *
 * The county reference must exist before anything else: every other layer
 * uses it to resolve a county, either to geocode a record that has no
 * coordinates or to tag one that does.
 *
 * A failing layer does not abort the run. Upstream sources here are
 * volunteer-run Overpass mirrors and federal web servers that go down without
 * notice; when one is unavailable we keep the previous file on disk and report
 * the failure rather than replacing good data with nothing.
 *
 * Scripts live in two folders — see PORTING.md for the full explanation:
 *
 *  - national/  Works for any US state via STATE_FIPS/STATE_USPS/STATE_ISO
 *               env vars (see .env.example). Start here on a fork.
 * Press coverage (mn/news.mjs) is deliberately NOT here. It is a Tier 4 lead
 * list rather than a layer (see src/lib/news.ts), it depends on nothing, and it
 * moves daily where these move on their publishers' schedules — so it has its
 * own `npm run data:news` and its own workflow. Folding it in meant `npm run
 * data`, run to refresh one layer locally, silently re-fetched Google and
 * rewrote the news archive; it also forced refresh-data.yml to carry a copy of
 * the §1b headline-review checklist that refresh-news.yml owns.
 *
 *  - mn/        Built against a Minnesota-specific statute, agency, or
 *               dataset (MESB, the BCA's § 13.824 filings, MnDOT, MPCA's
 *               CI-MAP, Mapping Prejudice's MN county coverage, and the
 *               hand-curated public-records vendor-contracts file). A fork
 *               either adapts these to its own state's equivalent — if one
 *               exists — or drops them; nothing in national/ depends on them.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const STEPS = [
  { name: 'counties', script: 'national/counties.mjs', required: true },
  // Needs the county reference to name each subdivision's county, so it
  // follows counties and precedes nothing — no layer depends on it. It is the
  // index that turns a point into the government that has to answer for it.
  { name: 'jurisdictions', script: 'national/jurisdictions.mjs' },
  { name: '287g', script: 'national/agencies-287g.mjs' },
  // Reference only, not a layer — writes the BCA cross-reference
  // agency-jurisdictions.mjs reads next. See that script's own comment.
  // Minnesota-specific — see mn/README.md.
  { name: 'agencies-lpr-bca', script: 'mn/agencies-lpr-bca.mjs' },
  // Needs the county reference to tag each polygon's county, and the BCA
  // reference just above to cross-reference reported ALPR use.
  { name: 'agency-jurisdictions', script: 'mn/agency-jurisdictions.mjs' },
  // Needs agency-jurisdictions.geojson to join each building to its agency's
  // canonical name — see that script's own comment on why it runs after.
  { name: 'agency-buildings', script: 'mn/agency-buildings.mjs' },
  // Needs agency-buildings.geojson to resolve each documented contract's
  // location and jurisdiction; reads its own mirrored PDFs/CSVs under
  // public/data/docs, not the network, so it has nothing else to wait on.
  { name: 'vendor-contracts', script: 'mn/vendor-contracts.mjs' },
  // Needs the BCA reference for the filings, the jurisdictions and buildings
  // to anchor each agency's road search, so it follows all three.
  { name: 'alpr-reported', script: 'mn/alpr-reported.mjs' },
  { name: 'alpr', script: 'national/alpr.mjs' },
  // Needs both alpr.geojson and alpr-reported.geojson finished — it reads
  // them back off disk and re-stamps both with the "cross-listed corner"
  // proximity match. See its own header for what that match does and does
  // not claim. Lives in mn/ rather than national/ because it is only ever
  // meaningful alongside mn/alpr-reported.mjs's BCA filings.
  { name: 'alpr-cross-source', script: 'mn/alpr-cross-source.mjs' },
  { name: 'detention', script: 'national/detention.mjs' },
  { name: 'data-centers', script: 'national/data-centers.mjs' },
  // Independent of every other layer: MnDOT names the county on each segment,
  // so this needs the county reference only to resolve a GEOID from that name.
  { name: 'aadt', script: 'mn/aadt.mjs' },
  // Reference only, not a layer — the edge between the 1930s graded areas and
  // 2020 census tracts, which redlining.mjs reads next to put each area's
  // tracts and coverage shares on it. See that script's own header for why it
  // stopped being a drawn layer.
  { name: 'holc-tracts', script: 'national/holc-tracts.mjs' },
  { name: 'redlining', script: 'national/redlining.mjs' },
  { name: 'covenants', script: 'mn/covenants.mjs' },
  { name: 'ej-cumulative', script: 'mn/ej-cumulative.mjs' },
  // Reads ej-cumulative.geojson for its 2020 tract geometry and GEOIDs rather
  // than refetching tract boundaries a second time — see demographics.mjs's
  // own header. That makes this "national" script depend, as shipped, on a
  // Minnesota-specific reference file; a fork without an ej-cumulative
  // equivalent needs to point demographics.mjs at TIGERweb directly instead.
  { name: 'demographics', script: 'national/demographics.mjs' },
  // Last of the historical layers, because it reads two of the others:
  // redlining.geojson for the area label drawn on each block and for the
  // agreement check it measures every run, and ej-cumulative.geojson for the
  // 2020 tract boundaries each block resolves against. See its own header.
  { name: 'holc-detail', script: 'mn/holc-detail.mjs' },
  // Self-contained: fetches both the City's aggregated crime table and the
  // neighbourhood polygons it joins to, so it has no ordering dependency on
  // any other layer. The polygons ride inside its own output rather than
  // getting a layer of their own — see its header.
  { name: 'crime-minneapolis', script: 'mn/crime-minneapolis.mjs' },
];

function run(script) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(HERE, script)], {
      stdio: 'inherit',
      env: process.env,
    });
    child.on('close', (code) => resolve(code === 0));
  });
}

const failed = [];
for (const step of STEPS) {
  console.log(`\n──── ${step.name} ────`);
  const ok = await run(step.script);
  if (!ok) {
    failed.push(step.name);
    if (step.required) {
      console.error(`\n[build-all] ${step.name} is required by every other layer; stopping.`);
      process.exit(1);
    }
    console.error(`[build-all] ${step.name} failed — keeping the existing file on disk.`);
  }
}

console.log('\n────────────────');
if (failed.length) {
  console.log(`[build-all] finished with ${failed.length} failed layer(s): ${failed.join(', ')}`);
  process.exit(1);
}
console.log('[build-all] all layers refreshed.');

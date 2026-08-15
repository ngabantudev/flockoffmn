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
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const STEPS = [
  { name: 'counties', script: 'counties.mjs', required: true },
  // Needs the county reference to name each subdivision's county, so it
  // follows counties and precedes nothing — no layer depends on it. It is the
  // index that turns a point into the government that has to answer for it.
  { name: 'jurisdictions', script: 'jurisdictions.mjs' },
  { name: '287g', script: 'agencies-287g.mjs' },
  // Reference only, not a layer — writes the BCA cross-reference
  // agency-jurisdictions.mjs reads next. See that script's own comment.
  { name: 'agencies-lpr-bca', script: 'agencies-lpr-bca.mjs' },
  // Needs the county reference to tag each polygon's county, and the BCA
  // reference just above to cross-reference reported ALPR use.
  { name: 'agency-jurisdictions', script: 'agency-jurisdictions.mjs' },
  // Needs agency-jurisdictions.geojson to join each building to its agency's
  // canonical name — see that script's own comment on why it runs after.
  { name: 'agency-buildings', script: 'agency-buildings.mjs' },
  // Needs agency-buildings.geojson to resolve each documented contract's
  // location and jurisdiction; reads its own mirrored PDFs/CSVs under
  // public/data/docs, not the network, so it has nothing else to wait on.
  { name: 'vendor-contracts', script: 'vendor-contracts.mjs' },
  // Needs agency-buildings.geojson for the same reason vendor-contracts.mjs
  // does — it only resolves a feature's location, so it has nothing to wait
  // on beyond that. Independent of vendor-contracts.mjs itself.
  { name: 'vendor-contract-terminations', script: 'vendor-contract-terminations.mjs' },
  // Needs the BCA reference for the filings, the jurisdictions and buildings
  // to anchor each agency's road search, so it follows all three.
  { name: 'alpr-reported', script: 'alpr-reported.mjs' },
  { name: 'alpr', script: 'alpr.mjs' },
  { name: 'detention', script: 'detention.mjs' },
  { name: 'data-centers', script: 'data-centers.mjs' },
  // Independent of every other layer: MnDOT names the county on each segment,
  // so this needs the county reference only to resolve a GEOID from that name.
  { name: 'aadt', script: 'aadt.mjs' },
  // Reference only, not a layer — the edge between the 1930s graded areas and
  // 2020 census tracts, which redlining.mjs reads next to put each area's
  // tracts and coverage shares on it. See that script's own header for why it
  // stopped being a drawn layer.
  { name: 'holc-tracts', script: 'holc-tracts.mjs' },
  { name: 'redlining', script: 'redlining.mjs' },
  { name: 'covenants', script: 'covenants.mjs' },
  { name: 'ej-cumulative', script: 'ej-cumulative.mjs' },
  // Last of the historical layers, because it reads two of the others:
  // redlining.geojson for the area label drawn on each block and for the
  // agreement check it measures every run, and ej-cumulative.geojson for the
  // 2020 tract boundaries each block resolves against. See its own header.
  { name: 'holc-detail', script: 'holc-detail.mjs' },
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

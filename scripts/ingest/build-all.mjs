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
  { name: '287g', script: 'agencies-287g.mjs' },
  { name: 'alpr', script: 'alpr.mjs' },
  // Derived from the file alpr.mjs just wrote, so it has to follow it. If the
  // camera step failed, this reads whatever alpr.geojson already holds and
  // inherits that file's source date, which is what dates the corridors too.
  { name: 'corridors', script: 'corridors.mjs' },
  { name: 'detention', script: 'detention.mjs' },
  { name: 'data-centers', script: 'data-centers.mjs' },
  { name: 'redlining', script: 'redlining.mjs' },
  { name: 'covenants', script: 'covenants.mjs' },
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

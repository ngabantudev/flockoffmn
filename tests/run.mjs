/**
 * Runs every *.test.mjs in this directory, in series, against the built site.
 *
 * Series rather than parallel: each suite drives a real browser over the same
 * `dist/`, and running them concurrently made timing-sensitive checks — the
 * panel collapse animation especially — fail under load in a way that reads as
 * a regression and is not one.
 *
 * Requires `npm run build` first. Exits non-zero if any suite fails, so this is
 * usable as a CI gate.
 */
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const suites = readdirSync(here).filter((f) => f.endsWith('.test.mjs')).sort();

/**
 * One retry, and it is reported rather than hidden.
 *
 * Each suite launches its own Chromium, so ten cold launches in series can
 * starve one of them: a suite that passes alone in 7s was observed taking 191s
 * and failing mid-run under that load. A silent retry would turn real
 * regressions into intermittent green, so a suite that only passes on the
 * second attempt is printed as FLAKY and the run still reports it.
 */
const runOnce = (suite) => {
  const started = Date.now();
  const run = spawnSync(process.execPath, [new URL(suite, import.meta.url).pathname], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
  return { ok: run.status === 0, ms: Date.now() - started, out: (run.stdout ?? '') + (run.stderr ?? '') };
};

let failed = 0;
let flaky = 0;
for (const suite of suites) {
  let r = runOnce(suite);
  let retried = false;
  if (!r.ok) {
    retried = true;
    r = runOnce(suite);
  }
  if (!r.ok) failed += 1;
  else if (retried) flaky += 1;
  const label = r.ok ? (retried ? 'FLAKY' : 'PASS ') : 'FAIL ';
  console.log(`${label} ${suite.padEnd(24)} ${(r.ms / 1000).toFixed(1)}s${retried ? '  (retried)' : ''}`);
  if (!r.ok) console.log(r.out.split('\n').filter((l) => /FAIL/.test(l)).join('\n'));
}

console.log(`\n${suites.length - failed}/${suites.length} suites passed${flaky ? `, ${flaky} only on retry` : ''}`);
process.exit(failed ? 1 : 0);

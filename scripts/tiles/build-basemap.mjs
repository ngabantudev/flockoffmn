#!/usr/bin/env node
/**
 * Builds the self-hosted basemap archive: a single Minnesota-only PMTiles
 * vector tile file (`minnesota.pmtiles`), and uploads it to the
 * `flockoffmn-tiles` R2 bucket that src/lib/mapStyle.ts reads at runtime.
 *
 * This is deliberately NOT in scripts/ingest/ — that directory has a hard
 * dependency-free-Node rule (see scripts/ingest/lib/util.mjs's header) and a
 * build-all.mjs orchestrator that a contributor expects to run with nothing
 * but `npm run data`. Building the basemap needs a real external tool
 * (planetiler, a Java program — see below) and downloads gigabytes of
 * upstream data, so it stays a separate, explicitly-invoked step, not part
 * of that pipeline.
 *
 * What this script does NOT do: scrape live tiles from OSM's tile servers.
 * OSM's tile usage policy explicitly asks apps not to bulk-download from
 * tile.openstreetmap.org, and this repo's own "Good-Citizen Fetcher" rule
 * (CLAUDE.md § Architecture) rules that out regardless. Instead it downloads
 * a Minnesota-only *data* extract from Geofabrik — a mirror explicitly
 * intended for bulk regional download — and renders tiles from that data
 * itself, locally, with planetiler.
 *
 * Requires:
 *   - Java 17+ on PATH (planetiler is a Java program; on macOS,
 *     `brew install openjdk` and put it on PATH — see planetiler's own
 *     README if `java -version` doesn't find it afterward).
 *   - `npx wrangler` authenticated against the Cloudflare account that owns
 *     the `flockoffmn-tiles` R2 bucket (only needed for --upload).
 *
 * Usage:
 *   node scripts/tiles/build-basemap.mjs            # build only
 *   node scripts/tiles/build-basemap.mjs --upload    # build, then upload to R2
 *
 * Rebuild cadence: manual, ad hoc — there is no cron for this. Minnesota's
 * road network doesn't change fast enough to need a schedule, and an
 * automated write path into a production bucket is a cost (another
 * unattended thing that can silently fail or silently overwrite something)
 * this project doesn't need to take on for that benefit. Re-run this by hand
 * when the map visibly drifts from reality, or roughly annually.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, existsSync, statSync, writeFileSync, createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { log, fetchWithRetry } from '../ingest/lib/util.mjs';

const SCOPE = 'build-basemap';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BUILD_DIR = path.join(ROOT, '.tiles-build');
const PLANETILER_JAR = path.join(BUILD_DIR, 'planetiler.jar');
const OUTPUT = path.join(BUILD_DIR, 'minnesota.pmtiles');
const PLANETILER_VERSION_URL =
  'https://github.com/onthegomap/planetiler/releases/latest/download/planetiler.jar';

// Real data maxzoom. MapLibre overzooms past this by scaling vector
// geometry rather than blurring pixels the way raster does, so the camera's
// own maxZoom (18, see mapController.ts) stays higher than this without
// looking broken — z14 gets soft at true building-identification zoom, but
// covers ordinary neighborhood-level reading everywhere in the state at a
// build size (~150-350MB) that stays comfortably inside R2's free tier.
const MAXZOOM = 14;

const BUCKET = 'flockoffmn-tiles';
const UPLOAD = process.argv.includes('--upload');

function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

async function main() {
  mkdirSync(BUILD_DIR, { recursive: true });

  try {
    execFileSync('java', ['-version'], { stdio: 'ignore' });
  } catch {
    console.error(
      `[${SCOPE}] Java not found on PATH. planetiler is a Java program — ` +
        'install a JDK (e.g. `brew install openjdk` on macOS) and ensure `java -version` works.',
    );
    process.exit(1);
  }

  if (!existsSync(PLANETILER_JAR)) {
    log(SCOPE, 'Downloading planetiler...');
    // fetchWithRetry, not a bare fetch: GitHub Releases is generally solid but
    // this is a one-time-per-machine ~90MB download with no resume, so a
    // transient failure shouldn't hard-fail the whole build on attempt one —
    // same reasoning scripts/ingest/*.mjs already applies to every upstream
    // fetch (see that module's header on the Good-Citizen Fetcher rule).
    const res = await fetchWithRetry(PLANETILER_VERSION_URL, { redirect: 'follow' });
    writeFileSync(PLANETILER_JAR, Buffer.from(await res.arrayBuffer()));
  }

  log(SCOPE, `Building ${OUTPUT} (maxzoom=${MAXZOOM})...`);
  const result = spawnSync(
    'java',
    [
      '-Xmx4g',
      '-jar',
      PLANETILER_JAR,
      '--download',
      '--area=minnesota',
      `--maxzoom=${MAXZOOM}`,
      `--output=${OUTPUT}`,
      '--force',
    ],
    { cwd: BUILD_DIR, stdio: 'inherit' },
  );
  if (result.status !== 0) throw new Error(`planetiler exited with status ${result.status}`);

  const size = statSync(OUTPUT).size;
  const hash = await sha256(OUTPUT);
  const provenance = {
    builtAt: new Date().toISOString(),
    source: 'https://download.geofabrik.de/north-america/us/minnesota-latest.osm.pbf',
    tool: 'planetiler',
    maxzoom: MAXZOOM,
    sizeBytes: size,
    sha256: hash,
  };
  writeFileSync(path.join(BUILD_DIR, 'minnesota.pmtiles.provenance.json'), JSON.stringify(provenance, null, 2));
  log(SCOPE, `Built ${(size / 1024 / 1024).toFixed(0)}MB, sha256 ${hash.slice(0, 12)}...`);

  // --content-type/--cache-control are not cosmetic: R2 sets neither by
  // default, and without a Cache-Control header nothing downstream (a zone
  // Cache Rule included — see docs/DEPLOYMENT.md § Base map tiles) has
  // anything to key an edge-cache decision on. Confirmed live: the first
  // upload of this archive omitted both and served with no cache headers
  // at all until re-uploaded with these flags.
  const UPLOAD_ARGS = [
    'wrangler',
    'r2',
    'object',
    'put',
    `${BUCKET}/minnesota.pmtiles`,
    `--file=${OUTPUT}`,
    '--content-type=application/octet-stream',
    '--cache-control=public, max-age=3600, stale-while-revalidate=86400',
    '--remote',
  ];

  if (UPLOAD) {
    log(SCOPE, `Uploading to R2 bucket '${BUCKET}'...`);
    execFileSync('npx', UPLOAD_ARGS, { cwd: ROOT, stdio: 'inherit' });
    log(SCOPE, 'Uploaded. The live site picks this up immediately — R2 is the source of truth, nothing to redeploy.');
  } else {
    log(SCOPE, 'Built without uploading. Re-run with --upload to publish to R2, or upload manually:');
    log(SCOPE, `  npx ${UPLOAD_ARGS.join(' ')}`);
  }
}

main().catch((err) => {
  console.error(`[${SCOPE}] Failed:`, err);
  process.exit(1);
});

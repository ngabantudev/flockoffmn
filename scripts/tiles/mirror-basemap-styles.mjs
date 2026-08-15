#!/usr/bin/env node
/**
 * Mirrors the 4 wealldobettermn.org-matching basemap styles (fiord, liberty,
 * positron, dark) from OpenFreeMap's public style/sprite/glyph endpoints,
 * rewritten to be fully self-hosted, so the live site never makes a runtime
 * request to any third party for them — see CLAUDE.md §0.7/§0.8/§4 and
 * src/lib/theme.ts's own comment on why this matters more here than on most
 * sites (a visitor's pan/zoom is what part of Minnesota they're looking at).
 *
 * OpenFreeMap (MIT-licensed, tiles.openfreemap.org) explicitly invites this:
 * "no limits on the number of map views or requests" on their public
 * instance, but they also publish self-hosting as the first-class
 * alternative (weekly full-planet PMTiles/MBTiles downloads). This script
 * takes the lighter version of that same invitation — only the style
 * (colors/layers, their own creative work, small and static) and the
 * sprite and glyph assets (icons and fonts, also static, shared across all 4
 * styles) come from them. The actual vector tile data stays re-pointed at
 * this project's own already-self-hosted Minnesota archive
 * (scripts/tiles/build-basemap.mjs) — both use the same unmodified
 * OpenMapTiles schema (confirmed at openfreemap.org), so a style built for
 * one renders correctly against the other with no layer/paint changes.
 *
 * Every rewritten asset lands as a plain file in this repo — public/sprites/
 * and public/fonts/ (fonts/ already exists; this only adds the two font
 * weights liberty/positron use beyond the Regular this repo already
 * vendors) — served from the site's own origin, exactly like the existing
 * public/fonts/README.md's own vendoring convention. No R2, no wrangler, no
 * Cloudflare credentials needed to run this: the only external request this
 * script makes is the one-time mirror fetch, same shape as any
 * scripts/ingest/*.mjs run.
 *
 * What this drops, deliberately: the `ne2_shaded` Natural Earth hillshade
 * source `liberty` alone references (a raster-opacity effect visible only
 * below zoom 7). Mirroring a global raster tileset for an effect that only
 * shows when a Minnesota-focused map is zoomed out to a continental view
 * isn't worth several hundred extra files; `liberty` renders correctly
 * without it, just without that subtle relief shading at very low zoom.
 *
 * Usage:
 *   node scripts/tiles/mirror-basemap-styles.mjs
 *
 * Rebuild cadence: manual, ad hoc, same reasoning as build-basemap.mjs —
 * OpenFreeMap's styles don't change often enough to need a schedule.
 */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { log, fetchWithRetry } from '../ingest/lib/util.mjs';

const SCOPE = 'mirror-basemap-styles';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const STYLES_OUT_DIR = path.join(ROOT, 'src/lib/basemapStyles');
const SPRITES_OUT_DIR = path.join(ROOT, 'public/sprites');
const FONTS_OUT_DIR = path.join(ROOT, 'public/fonts');

// Same PMTiles archive scripts/tiles/build-basemap.mjs builds and
// src/lib/mapStyle.ts already reads at runtime — one basemap dataset, four
// styles drawn from it, not four separate tile sources.
const TILES_URL = 'https://tiles.flockoffmn.org/minnesota.pmtiles';

// Kept identical to src/lib/mapStyle.ts's own TILE_ATTRIBUTION (that file's
// comment has the full ODbL/OpenMapTiles/Geofabrik reasoning) — duplicated
// here rather than imported because scripts/ Node scripts don't run through
// a TS/bundler step. OpenFreeMap's own style JSON doesn't declare this on
// its `openmaptiles` source at all (their attribution presumably lives
// elsewhere in their own UI), so it has to be added, not just carried over.
const TILE_ATTRIBUTION =
  '© <a href="https://openmaptiles.org/">OpenMapTiles</a> ' +
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, ' +
  '<a href="https://www.geofabrik.de/">Geofabrik</a> extract';

const STYLE_IDS = ['fiord', 'liberty', 'positron', 'dark'];
const SPRITE_BASE = 'https://tiles.openfreemap.org/sprites/ofm_f384/ofm';
const SPRITE_FILES = ['.json', '@2x.json', '.png', '@2x.png'];

// Regular is already vendored (public/fonts/README.md) — this adds the two
// weights liberty/positron also use. Same two ranges as the existing
// vendoring: Basic Latin + Latin-1 Supplement, and Latin Extended-A (the
// Dakota/Ojibwe place-name macrons that README explains). Minimal on
// purpose, matching that file's own philosophy: add a range when a label
// actually needs it, not speculatively.
const FONT_STACKS_TO_ADD = ['Noto Sans Bold', 'Noto Sans Italic'];
const GLYPH_RANGES = ['0-255', '256-511'];

async function mirrorStyle(id) {
  log(SCOPE, `Fetching style '${id}'...`);
  const res = await fetchWithRetry(`https://tiles.openfreemap.org/styles/${id}`);
  const style = await res.json();

  // Drop ne2_shaded (only `liberty` references it) — see header comment.
  delete style.sources.ne2_shaded;
  style.layers = style.layers.filter((l) => l.source !== 'ne2_shaded');

  // Vector data: this project's own self-hosted archive, not OpenFreeMap's
  // planet tileset. Source id stays 'openmaptiles' (every layer's `source`
  // field already points at it) so the only change is the URL underneath.
  style.sources.openmaptiles.url = `pmtiles://${TILES_URL}`;
  style.sources.openmaptiles.attribution = TILE_ATTRIBUTION;

  // Sprite/glyphs: this site's own origin, not tiles.openfreemap.org.
  style.sprite = '/sprites/ofm';
  style.glyphs = '/fonts/{fontstack}/{range}.pbf';

  const outPath = path.join(STYLES_OUT_DIR, `${id}.json`);
  writeFileSync(outPath, JSON.stringify(style, null, 2) + '\n');
  log(SCOPE, `Wrote ${path.relative(ROOT, outPath)} (${style.layers.length} layers).`);
}

async function mirrorSprite() {
  log(SCOPE, 'Mirroring shared sprite set (used by all 4 styles)...');
  for (const suffix of SPRITE_FILES) {
    const res = await fetchWithRetry(`${SPRITE_BASE}${suffix}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const outPath = path.join(SPRITES_OUT_DIR, `ofm${suffix}`);
    writeFileSync(outPath, buf);
    log(SCOPE, `Wrote ${path.relative(ROOT, outPath)} (${buf.length} bytes).`);
  }
}

async function mirrorGlyphs() {
  for (const stack of FONT_STACKS_TO_ADD) {
    const dir = path.join(FONTS_OUT_DIR, stack);
    mkdirSync(dir, { recursive: true });
    for (const range of GLYPH_RANGES) {
      const url = `https://tiles.openfreemap.org/fonts/${encodeURIComponent(stack)}/${range}.pbf`;
      log(SCOPE, `Fetching glyphs '${stack}' ${range}...`);
      const res = await fetchWithRetry(url);
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(path.join(dir, `${range}.pbf`), buf);
    }
  }
  log(SCOPE, `Wrote glyph ranges for ${FONT_STACKS_TO_ADD.join(', ')}.`);
}

async function main() {
  mkdirSync(STYLES_OUT_DIR, { recursive: true });
  mkdirSync(SPRITES_OUT_DIR, { recursive: true });
  if (!existsSync(FONTS_OUT_DIR)) throw new Error(`Expected ${FONTS_OUT_DIR} to already exist (see its README.md).`);

  for (const id of STYLE_IDS) await mirrorStyle(id);
  await mirrorSprite();
  await mirrorGlyphs();

  log(SCOPE, 'Done. Review the diff, then update src/lib/mapStyle.ts and src/lib/theme.ts to use the 4 styles.');
}

main().catch((err) => {
  console.error(`[${SCOPE}] Failed:`, err);
  process.exit(1);
});

import type { StyleSpecification } from 'maplibre-gl';
import type { MapStyleId } from './theme';
import fiordStyle from './basemapStyles/fiord.json';
import libertyStyle from './basemapStyles/liberty.json';
import positronStyle from './basemapStyles/positron.json';
import darkStyle from './basemapStyles/dark.json';

/**
 * Base map: a single self-hosted vector tile archive covering Minnesota,
 * built once from OpenStreetMap data and served as a static file — no tile
 * provider, no API key, no third party that can revoke access, rate-limit
 * this site, or see visitors' pan/zoom traffic (spec §8, resilience; §0.7,
 * §0.8). This replaced a MapTiler raster basemap that hit MapTiler's free
 * request/session ceiling within a normal month of traffic, because every
 * visitor's browser was calling MapTiler directly with nothing caching in
 * front of it. See docs/DEPLOYMENT.md § Base map tiles for the full history
 * and the rebuild runbook.
 *
 * The archive is a PMTiles file (github.com/protomaps/PMTiles): a single
 * static file the browser reads with plain HTTP range requests, served from
 * a custom domain on the R2 bucket (tiles.flockoffmn.org), not the bucket's
 * r2.dev default URL — Cloudflare's own docs are explicit that r2.dev is
 * rate-limited and "intended for non-production traffic," and gets none of
 * the caching/WAF features a custom domain does. A custom domain also needs
 * a zone-level Cache Rule ("Cache Everything" for `tiles.flockoffmn.org/*`,
 * since `.pmtiles` isn't one of the extensions Cloudflare caches by default)
 * before responses actually get served from the edge instead of hitting R2
 * on every request — in place and confirmed live (verified by
 * `cf-cache-status: HIT` on a repeat range request, including that distinct
 * byte ranges cache and serve independently rather than colliding under the
 * same URL). See docs/DEPLOYMENT.md § Base map tiles for the setup steps —
 * the Cache Rule itself has to be added from the dashboard, not `wrangler`,
 * since creating one needs a zone-write API scope the deploy token doesn't
 * carry. No tile server or Worker either way — it's a static file R2 serves
 * directly by byte range.
 *
 * Four *styles* now draw from this one archive — see basemapStyles/ below —
 * but there is still only ever this one vector dataset. Style-switching
 * repaints the same tiles differently; it never re-fetches different data.
 *
 * `||` rather than `??` on purpose: an unset env var arrives as undefined,
 * but one declared-and-empty (as in a .env copied from .env.example)
 * arrives as "". `??` would keep that empty string and hand MapLibre a
 * blank archive URL, producing a map with no basemap and no error. A fork
 * only needs to set PUBLIC_TILES_URL if it wants to point at its own bucket
 * (see README.md / docs/DEPLOYMENT.md) — this default is enough on its own
 * to render a working map.
 *
 * Not baked into the four mirrored basemapStyles/*.json files themselves —
 * scripts/tiles/mirror-basemap-styles.mjs writes those once, at mirror
 * time, with no knowledge of any later fork's env var — so each style's
 * `sources.openmaptiles.url` still needs rewriting here at read time, not
 * just once at mirror time. See rewriteTilesUrl() below.
 */
const TILES_URL = import.meta.env.PUBLIC_TILES_URL || 'https://tiles.flockoffmn.org/minnesota.pmtiles';
const MIRRORED_TILES_URL = 'https://tiles.flockoffmn.org/minnesota.pmtiles';

/**
 * ODbL requires attribution on any Produced Work rendered from OSM data —
 * this basemap is one (see LICENSE-DATA.md's basemap entry for the
 * Produced-Work-vs-Derivative-Database reasoning). The tile *schema* is the
 * OpenMapTiles schema, CC-BY licensed, which requires a visible
 * "© OpenMapTiles © OpenStreetMap contributors" credit — a second, separate
 * obligation from OSM's own ODbL credit, not a restatement of it. Geofabrik
 * is credited too as the extract's provenance, though only the two above
 * are strictly required. Baked directly into each basemapStyles/*.json's
 * `sources.openmaptiles.attribution` by
 * scripts/tiles/mirror-basemap-styles.mjs (which keeps its own copy of this
 * exact string — Node scripts here don't run through a TS/bundler step, so
 * it can't just import this one), which is what MapLibre's AttributionControl
 * actually reads — this export exists for anything else that wants the same
 * text without a StyleSpecification to dig it out of.
 */
export const TILE_ATTRIBUTION =
  '© <a href="https://openmaptiles.org/">OpenMapTiles</a> ' +
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, ' +
  '<a href="https://www.geofabrik.de/">Geofabrik</a> extract';

/** Minnesota, with enough padding to show neighbouring context. */
export const MN_BOUNDS: [[number, number], [number, number]] = [
  [-97.6, 43.3],
  [-89.2, 49.5],
];

export const MN_CENTER: [number, number] = [-94.2, 46.3];

/**
 * The Twin Cities metro: both downtowns and the suburban ring, from Anoka
 * down past Lakeville, Lake Minnetonka across to Woodbury. The frame a
 * filter zooms to by default, so successive filters land on a steady view
 * that always holds Minneapolis and St. Paul together.
 */
export const METRO_BOUNDS: [[number, number], [number, number]] = [
  [-93.75, 44.64],
  [-92.74, 45.31],
];

/**
 * Midpoint of METRO_BOUNDS. Most of what this site tracks — ALPR cameras,
 * task force MOAs, county contracts — clusters in the metro, so the map
 * opens here rather than on a statewide view that renders a fistful of dots
 * lost in the state's outline. Paired with a zoom (see mapController.ts's
 * constructor) chosen to roughly match METRO_BOUNDS at a typical viewport;
 * the 'load' handler's fitBounds(METRO_BOUNDS) then squares that against the
 * visitor's actual container size, same two-step pattern MN_CENTER/MN_BOUNDS
 * already used for the statewide view this replaced as the default.
 */
export const METRO_CENTER: [number, number] = [-93.245, 44.975];

/**
 * The four basemap styles, mirrored from OpenFreeMap (MIT-licensed,
 * matching wealldobettermn.org's own catalog exactly — same ids, same
 * light/dark flags, see theme.ts's MAP_STYLES) rather than hand-built the
 * way this file's two-flavor predecessor was. See
 * scripts/tiles/mirror-basemap-styles.mjs's header for the full reasoning:
 * every style's vector source is repointed at this project's own
 * self-hosted PMTiles archive (TILES_URL above) and its sprite/glyphs at
 * this site's own origin, so none of the four make a live request to
 * OpenFreeMap or anywhere else third-party.
 *
 * Each style keeps its own, structurally different set of layer ids (48 to
 * 110 of them, depending on the style) — unlike the old two-flavor system,
 * switching between these is NOT a same-layers-different-color repaint, so
 * MapController.setBasemap() (mapController.ts) uses a real map.setStyle()
 * call rather than setPaintProperty() loops. ALL_BASEMAP_LAYER_IDS and
 * BASEMAP_SOURCE_ID below exist for that function to know exactly what to
 * strip from the *previous* style before adding the new one, so every
 * registry/data layer this app has added on top survives the swap.
 */
const STYLES: Record<MapStyleId, StyleSpecification> = {
  fiord: fiordStyle as StyleSpecification,
  liberty: libertyStyle as StyleSpecification,
  positron: positronStyle as StyleSpecification,
  dark: darkStyle as StyleSpecification,
};

/**
 * Every source id any of the 4 styles could be using — a single constant
 * because scripts/tiles/mirror-basemap-styles.mjs deliberately keeps the
 * source id 'openmaptiles' identical across all four (renaming it would
 * mean rewriting every layer's `source` field on every mirror run for no
 * benefit). Exported as a set of one for symmetry with
 * ALL_BASEMAP_LAYER_IDS and so MapController.setBasemap() never has to
 * hardcode the literal string itself.
 */
export const BASEMAP_SOURCE_IDS: ReadonlySet<string> = new Set(
  Object.values(STYLES).flatMap((s) => Object.keys(s.sources)),
);

/**
 * Every layer id any of the 4 styles could be using, computed once here by
 * actually reading all four — not maintained by hand, and not assumed to be
 * the same list across styles (fiord has 48 layers, liberty has 110; a
 * layer id in one is not guaranteed to exist, or mean the same thing, in
 * another). See setBasemap()'s comment in mapController.ts for how this is
 * used to strip a previous style's layers before adding a new one's.
 */
export const ALL_BASEMAP_LAYER_IDS: ReadonlySet<string> = new Set(
  Object.values(STYLES).flatMap((s) => s.layers.map((l) => l.id)),
);

/**
 * A style's own background colour — the single source
 * `MapController.basemapColor` (mapController.ts) resolves and caches, so
 * casings/halos/strokes drawn "in the background" can never read a value
 * that drifts from what the style's own `background`-type layer paints.
 */
export function basemapBackgroundColor(id: MapStyleId): string {
  const bg = STYLES[id].layers.find((l) => l.type === 'background');
  const paint = bg?.paint as Record<string, unknown> | undefined;
  return (paint?.['background-color'] as string | undefined) ?? '#0a0c10';
}

/**
 * A style's full StyleSpecification — cloned, not the shared module-level
 * object, since both the map constructor (once, at startup) and
 * MapController.setBasemap() (mapController.ts, on every flavor switch)
 * hand this straight to MapLibre, which treats the style object it's given
 * as its own to mutate.
 *
 * Also where PUBLIC_TILES_URL actually takes effect for these four styles:
 * each basemapStyles/*.json hardcodes MIRRORED_TILES_URL (the URL it had at
 * mirror time — see TILES_URL's comment above), so a fork running its own
 * bucket needs that string swapped for its own TILES_URL on every read,
 * not just once at mirror time.
 */
export function baseStyle(id: MapStyleId): StyleSpecification {
  const style = structuredClone(STYLES[id]);
  const source = style.sources.openmaptiles as { url?: string };
  if (source?.url) source.url = source.url.replace(MIRRORED_TILES_URL, TILES_URL);
  return style;
}

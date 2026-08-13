import type { StyleSpecification } from 'maplibre-gl';
import { MAP_STYLES, type MapStyleId } from './theme';

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
 * static file the browser reads with plain HTTP range requests, so
 * Cloudflare's own edge CDN caches it like any other static asset — no tile
 * server, no Worker, nothing that could hit a request-count ceiling of its
 * own. It's built by scripts/tiles/build-basemap.mjs from Geofabrik's
 * Minnesota extract (never scraped live from OSM's own tile servers — see
 * that script's header) and hosted on a public Cloudflare R2 bucket.
 *
 * `||` rather than `??` on purpose, matching the pre-existing convention
 * here: an unset env var arrives as undefined, but one declared-and-empty
 * (as in a .env copied from .env.example) arrives as "". `??` would keep
 * that empty string and hand MapLibre a blank archive URL, producing a map
 * with no basemap and no error.
 */
const TILES_URL =
  import.meta.env.PUBLIC_TILES_URL ||
  'https://pub-8949b0e4d4a6454a927063c08b77e719.r2.dev/minnesota.pmtiles';

/**
 * ODbL requires attribution on any Produced Work rendered from OSM data —
 * this basemap is one (see LICENSE-DATA.md's basemap entry for the
 * Produced-Work-vs-Derivative-Database reasoning). The tile *schema*
 * planetiler emits (layer names like 'water'/'transportation'/'place' —
 * see BASEMAP_LAYERS below) is itself the OpenMapTiles schema, CC-BY
 * licensed, which planetiler's own build output states requires a visible
 * "© OpenMapTiles © OpenStreetMap contributors" credit — that's a second,
 * separate obligation from OSM's own ODbL credit, not a restatement of it.
 * Geofabrik is credited too as the extract's provenance, though only the
 * two above are strictly required. Unlike the old MapTiler setup this is no
 * longer configurable per deployment — there's no vendor left to swap out,
 * only the data's own licence terms, which don't change.
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
 * One basemap layer's paint, as a function of flavor (dark/light — see
 * lib/theme.ts's MAP_STYLES). Every colour-valued paint key lives here as a
 * function rather than as two static objects picked between, because
 * `MapController.setBasemap()` (mapController.ts) must never call
 * map.setStyle() — that would drop every registry layer, flight layer, and
 * density thread it has added imperatively. Flavor switching instead calls
 * setPaintProperty() for every key this function returns, every time,
 * across every layer in BASEMAP_LAYERS — one source of truth for "what does
 * this flavor look like", used identically at first paint and on repaint.
 * That structurally rules out the class of bug the raster version had to
 * guard against by hand (see the old raster-brightness-max reset, now
 * gone): a key MapLibre doesn't revert just because a later call omits it.
 */
export type BasemapPaint = Record<string, unknown>;

/** One layer of the basemap. `paint` is flavor-variant; everything else is not. */
export interface BasemapLayerDef {
  /** Always prefixed 'base-' so ownership against registry/flight/density layers is unambiguous at a glance. */
  id: string;
  type: 'background' | 'fill' | 'line' | 'symbol';
  /** Vector source-layer name from the OpenMapTiles schema planetiler emits — absent only for the 'background' layer. */
  sourceLayer?: string;
  minzoom?: number;
  maxzoom?: number;
  filter?: unknown[];
  layout?: Record<string, unknown>;
  paint: (dark: boolean) => BasemapPaint;
}

/**
 * Two flavors only (dark/light), not the four the old MapTiler catalog
 * offered — regenerating tiles per style was the reason to multiply
 * presets, and that cost is gone now that one archive serves every flavor.
 * Hand-maintained vector paint code is the new cost, and it has to stay
 * legible under every present and future data layer (police departments,
 * historical layers, …), so it stays to exactly the two flavors the site
 * theme actually needs. See lib/theme.ts's MAP_STYLES for where these are named.
 */
export const BASEMAP_LAYERS: readonly BasemapLayerDef[] = [
  {
    id: 'base-background',
    type: 'background',
    paint: (dark) => ({ 'background-color': dark ? '#0a0c10' : '#ffffff' }),
  },
  {
    id: 'base-landcover-wood',
    type: 'fill',
    sourceLayer: 'landcover',
    filter: ['==', ['get', 'class'], 'wood'],
    paint: (dark) => ({ 'fill-color': dark ? '#0f141a' : '#e3ecdf', 'fill-opacity': dark ? 0.6 : 0.8 }),
  },
  {
    id: 'base-landcover-grass',
    type: 'fill',
    sourceLayer: 'landcover',
    filter: ['match', ['get', 'class'], ['grass', 'wetland', 'crop'], true, false],
    paint: (dark) => ({ 'fill-color': dark ? '#111620' : '#e9f0e3', 'fill-opacity': dark ? 0.5 : 0.7 }),
  },
  {
    id: 'base-landuse-residential',
    type: 'fill',
    sourceLayer: 'landuse',
    minzoom: 8,
    filter: ['==', ['get', 'class'], 'residential'],
    paint: (dark) => ({ 'fill-color': dark ? '#12161c' : '#f2f0ea', 'fill-opacity': dark ? 0.5 : 0.6 }),
  },
  {
    id: 'base-park',
    type: 'fill',
    sourceLayer: 'park',
    paint: (dark) => ({ 'fill-color': dark ? '#131a1f' : '#dcebd8', 'fill-opacity': 0.7 }),
  },
  {
    id: 'base-water',
    type: 'fill',
    sourceLayer: 'water',
    paint: (dark) => ({ 'fill-color': dark ? '#0d1520' : '#cfe3f0' }),
  },
  {
    id: 'base-waterway',
    type: 'line',
    sourceLayer: 'waterway',
    minzoom: 9,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: (dark) => ({
      'line-color': dark ? '#16233a' : '#a9c9de',
      'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.5, 16, 2.5],
    }),
  },
  {
    id: 'base-boundary-county',
    type: 'line',
    sourceLayer: 'boundary',
    minzoom: 7,
    // 'coalesce' before the comparison, not a bare ['get', 'admin_level']:
    // some boundary features carry no admin_level at all, and comparing
    // null against a number logs "Expected value to be of type number, but
    // found null instead" once per such feature — harmless (the filter
    // still evaluates to false) but needless console noise on every tile.
    filter: ['==', ['coalesce', ['get', 'admin_level'], -1], 6],
    layout: { 'line-join': 'round' },
    paint: (dark) => ({
      'line-color': dark ? '#232a35' : '#cdd3da',
      'line-width': 0.75,
      'line-dasharray': [2, 2],
    }),
  },
  {
    id: 'base-boundary-state',
    type: 'line',
    sourceLayer: 'boundary',
    filter: ['<=', ['coalesce', ['get', 'admin_level'], 99], 4],
    layout: { 'line-join': 'round' },
    paint: (dark) => ({
      'line-color': dark ? '#3a4557' : '#b7bfc9',
      'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.75, 10, 1.75],
    }),
  },
  {
    id: 'base-building',
    type: 'fill',
    sourceLayer: 'building',
    minzoom: 13,
    paint: (dark) => ({
      'fill-color': dark ? '#171d26' : '#e4e1d9',
      'fill-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 15, 1],
    }),
  },
  {
    id: 'base-road-minor-casing',
    type: 'line',
    sourceLayer: 'transportation',
    minzoom: 12,
    filter: ['match', ['get', 'class'], ['minor', 'service', 'track'], true, false],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: (dark) => ({
      'line-color': dark ? '#181c22' : '#ffffff',
      'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1.5, 18, 8],
    }),
  },
  {
    id: 'base-road-minor',
    type: 'line',
    sourceLayer: 'transportation',
    minzoom: 12,
    filter: ['match', ['get', 'class'], ['minor', 'service', 'track'], true, false],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: (dark) => ({
      'line-color': dark ? '#232830' : '#e8ebee',
      'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.75, 18, 6],
    }),
  },
  {
    id: 'base-road-medium-casing',
    type: 'line',
    sourceLayer: 'transportation',
    minzoom: 9,
    filter: ['match', ['get', 'class'], ['secondary', 'tertiary'], true, false],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: (dark) => ({
      'line-color': dark ? '#1a1e25' : '#ffffff',
      'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1, 18, 10],
    }),
  },
  {
    id: 'base-road-medium',
    type: 'line',
    sourceLayer: 'transportation',
    minzoom: 9,
    filter: ['match', ['get', 'class'], ['secondary', 'tertiary'], true, false],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: (dark) => ({
      'line-color': dark ? '#2b323d' : '#dfe4e8',
      'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.75, 18, 7.5],
    }),
  },
  {
    id: 'base-road-major-casing',
    type: 'line',
    sourceLayer: 'transportation',
    minzoom: 5,
    filter: ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], true, false],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: (dark) => ({
      'line-color': dark ? '#1d222a' : '#ffffff',
      'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1, 18, 14],
    }),
  },
  {
    id: 'base-road-major',
    type: 'line',
    sourceLayer: 'transportation',
    minzoom: 5,
    filter: ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], true, false],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: (dark) => ({
      'line-color': dark ? '#3a4250' : '#d7dde3',
      'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.75, 18, 11],
    }),
  },
  {
    id: 'base-transportation-name',
    type: 'symbol',
    sourceLayer: 'transportation_name',
    minzoom: 12,
    layout: {
      'symbol-placement': 'line',
      'text-field': ['get', 'name'],
      'text-font': ['Noto Sans Regular'],
      'text-size': 11,
      'text-letter-spacing': 0.02,
    },
    paint: (dark) => ({
      'text-color': dark ? '#8b93a3' : '#5b6472',
      'text-halo-color': dark ? '#0a0c10' : '#ffffff',
      'text-halo-width': 1.2,
    }),
  },
  {
    id: 'base-place-label',
    type: 'symbol',
    sourceLayer: 'place',
    filter: ['match', ['get', 'class'], ['city', 'town', 'village', 'state'], true, false],
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Noto Sans Regular'],
      // 'zoom' may only appear as the direct input to a top-level
      // 'step'/'interpolate' expression — MapLibre rejects it nested inside
      // 'case' as invalid, and rejects the *entire style* on that error, not
      // just this layer (confirmed the hard way: this one line took down
      // every layer, basemap and data both, with no console error visible
      // outside a real MapLibre instance's own 'error' event — see
      // mapController.ts's onError wiring). So 'interpolate' has to be the
      // outermost expression, with 'case' only inside it, at each stop.
      'text-size': [
        'interpolate',
        ['linear'],
        ['zoom'],
        4,
        ['case', ['==', ['get', 'class'], 'state'], 13, ['==', ['get', 'class'], 'city'], 10, 11],
        12,
        ['case', ['==', ['get', 'class'], 'state'], 13, ['==', ['get', 'class'], 'city'], 15, 11],
      ],
      'text-transform': ['case', ['==', ['get', 'class'], 'state'], 'uppercase', 'none'],
      'text-letter-spacing': ['case', ['==', ['get', 'class'], 'state'], 0.08, 0],
    },
    paint: (dark) => ({
      'text-color': dark ? '#c7ccd6' : '#2b323d',
      'text-halo-color': dark ? '#0a0c10' : '#ffffff',
      'text-halo-width': 1.4,
    }),
  },
];

export function baseStyle(initialStyle: MapStyleId): StyleSpecification {
  const dark = MAP_STYLES[initialStyle].dark;
  return {
    version: 8,
    // Glyphs are served from our own origin. MapLibre's demo glyph server is
    // the usual default, but pointing at it would make every visitor's browser
    // announce itself to a third party just to render labels — exactly the
    // "no third-party fonts" rule this project states on /about. Place and
    // road-name labels need both Basic Latin and Latin Extended-A (the
    // macrons in Dakota/Ojibwe place names, e.g. Bdóte, Mní Sóta), so both
    // ranges are vendored — see public/fonts/README.md.
    glyphs: '/fonts/{fontstack}/{range}.pbf',
    sources: {
      basemap: {
        type: 'vector',
        url: `pmtiles://${TILES_URL}`,
        attribution: TILE_ATTRIBUTION,
      },
    },
    layers: BASEMAP_LAYERS.map((l) => ({
      id: l.id,
      type: l.type,
      ...(l.sourceLayer ? { source: 'basemap', 'source-layer': l.sourceLayer } : {}),
      ...(l.minzoom !== undefined ? { minzoom: l.minzoom } : {}),
      ...(l.maxzoom !== undefined ? { maxzoom: l.maxzoom } : {}),
      ...(l.filter ? { filter: l.filter } : {}),
      ...(l.layout ? { layout: l.layout } : {}),
      paint: l.paint(dark),
    })) as StyleSpecification['layers'],
  };
}

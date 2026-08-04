import type { StyleSpecification } from 'maplibre-gl';
import { MAP_STYLES, DEFAULT_DARK_STYLE, DEFAULT_LIGHT_STYLE, type MapStyleId } from './theme';

/**
 * Base map style.
 *
 * Raster OSM tiles by default: no API key, no vendor account, and no third
 * party that could revoke access to the base map as a way of pressuring the
 * project (spec §8, resilience).
 *
 * OSM's tile usage policy asks that heavy-traffic sites not lean on the
 * volunteer-run standard tile servers. Set PUBLIC_TILE_URL (and optionally
 * PUBLIC_TILE_ATTRIBUTION) to point at your own raster tiles or a provider
 * before this sees real traffic — see docs/DEPLOYMENT.md.
 */
// `||` rather than `??` on purpose: an unset variable arrives as undefined,
// but one declared-and-empty (as in a .env copied from .env.example) arrives
// as "". `??` would keep that empty string and hand MapLibre a blank tile
// URL, producing a map with no basemap and no error.
const TILE_URL_DARK =
  import.meta.env.PUBLIC_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
// No separate OSM-hosted light fallback exists (OSM's standard tiles are the
// dark default's fallback already) — an unset light URL just reuses the dark
// one, which is a legitimate dev-mode basemap even if it isn't visually
// "light"; see the PROD-only warning below for why this only matters live.
const TILE_URL_LIGHT = import.meta.env.PUBLIC_TILE_URL_LIGHT || TILE_URL_DARK;
const TILE_KEY = import.meta.env.PUBLIC_TILE_KEY || '';

// A silent fallback here is how this shipped to production once already:
// OSM's standard tile servers rate-limit or block traffic that violates their
// usage policy, so the map just breaks with no error in the UI. Surface it
// loudly in the one place a maintainer would look — see docs/DEPLOYMENT.md
// "Base map tiles" for how to set PUBLIC_TILE_URL.
if (import.meta.env.PROD && !import.meta.env.PUBLIC_TILE_URL) {
  console.warn(
    '[mapStyle] PUBLIC_TILE_URL is unset in a production build — falling back to ' +
      "tile.openstreetmap.org, which OSM's usage policy prohibits for production traffic " +
      'and will rate-limit or block. See docs/DEPLOYMENT.md § Base map tiles.',
  );
}
if (import.meta.env.PROD && !import.meta.env.PUBLIC_TILE_URL_LIGHT) {
  console.warn(
    '[mapStyle] PUBLIC_TILE_URL_LIGHT is unset in a production build — light-theme visitors ' +
      'get the dark basemap URL instead. See docs/DEPLOYMENT.md § Base map tiles.',
  );
}
if (import.meta.env.PROD && !import.meta.env.PUBLIC_TILE_KEY) {
  console.warn(
    '[mapStyle] PUBLIC_TILE_KEY is unset in a production build — the in-map "Map theme" ' +
      'control can only offer the two default styles (whatever PUBLIC_TILE_URL/' +
      '_LIGHT point at), not the rest of the MAP_STYLES catalog in lib/theme.ts. ' +
      'See docs/DEPLOYMENT.md § Base map tiles.',
  );
}

// Same class of gap as the TILE_URL fallback above, but a licence risk rather
// than a network one: the generic OSM text is correct when TILE_URL is also
// unset (falling back to OSM's own tiles), but wrong the moment someone
// configures a real vendor (MapTiler, Stadia, self-hosted...) and forgets to
// also set the attribution — most vendors require crediting them by name as
// a licence condition, and a silently-missing credit is the kind of thing
// that gets a key revoked without warning.
if (import.meta.env.PROD && import.meta.env.PUBLIC_TILE_URL && !import.meta.env.PUBLIC_TILE_ATTRIBUTION) {
  console.warn(
    '[mapStyle] PUBLIC_TILE_URL is set but PUBLIC_TILE_ATTRIBUTION is not — the map is ' +
      "showing generic OpenStreetMap attribution, which likely doesn't satisfy your tile " +
      'provider\'s licence terms. See docs/DEPLOYMENT.md § Base map tiles.',
  );
}

const TILE_ATTRIBUTION =
  import.meta.env.PUBLIC_TILE_ATTRIBUTION ||
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/**
 * Resolves a catalog entry to an actual tile URL. The two defaults reuse the
 * pre-built full URLs above rather than constructing
 * `.../maps/${maptilerId}/...?key=${TILE_KEY}` like every other entry does,
 * so the basemap a visitor sees on first paint never depends on
 * PUBLIC_TILE_KEY being set — only the *other* styles in the "Map theme"
 * picker do.
 */
export function tileUrlForStyle(id: MapStyleId): string {
  if (id === DEFAULT_DARK_STYLE) return TILE_URL_DARK;
  if (id === DEFAULT_LIGHT_STYLE) return TILE_URL_LIGHT;
  if (!TILE_KEY) return TILE_URL_DARK;
  return `https://api.maptiler.com/maps/${MAP_STYLES[id].maptilerId}/256/{z}/{x}/{y}.png?key=${TILE_KEY}`;
}

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
 * `raster-brightness-max` is a light touch only, and only for dark styles:
 * production's dark default (MapTiler streets-v4-dark — see
 * docs/DEPLOYMENT.md § Base map tiles) is already a dark style, so this just
 * caps peak brightness rather than crushing color out of it. This used to
 * desaturate hard (-0.75) unconditionally, to force OSM's light default
 * style dark; that combination made the map look flat and washed out once
 * the tile source itself was already dark — two dimming passes stacked. A
 * light-catalog style needs no such cap, or it greys into mud (learned the
 * hard way picking streets-v4-pastel over dataviz-v4-light for the site
 * light-theme default). The unconfigured dev fallback
 * (tile.openstreetmap.org, a light style) still renders as if it were the
 * dark default, since PUBLIC_TILE_URL's absence resolves to a "dark" style
 * either way — a fine tradeoff since dev explicitly doesn't need to look
 * production-polished.
 */
export function basemapPaint(dark: boolean): { 'background-color': string; osmPaint: Record<string, number> } {
  return {
    'background-color': dark ? '#0a0c10' : '#ffffff',
    osmPaint: dark ? { 'raster-brightness-max': 0.85 } : {},
  };
}

export function baseStyle(initialStyle: MapStyleId): StyleSpecification {
  const { 'background-color': backgroundColor, osmPaint } = basemapPaint(MAP_STYLES[initialStyle].dark);
  return {
    version: 8,
    // Glyphs are served from our own origin. MapLibre's demo glyph server is
    // the usual default, but pointing at it would make every visitor's browser
    // announce itself to a third party just to render cluster labels — exactly
    // the "no third-party fonts" rule this project states on /about. The only
    // text on the map is cluster counts, so the first Unicode range is enough;
    // see public/fonts/ (Noto Sans, SIL Open Font License).
    glyphs: '/fonts/{fontstack}/{range}.pbf',
    sources: {
      osm: {
        type: 'raster',
        tiles: [tileUrlForStyle(initialStyle)],
        tileSize: 256,
        maxzoom: 19,
        attribution: TILE_ATTRIBUTION,
      },
    },
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': backgroundColor },
      },
      {
        id: 'osm',
        type: 'raster',
        source: 'osm',
        paint: osmPaint,
      },
    ],
  };
}

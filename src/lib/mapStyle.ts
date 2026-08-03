import type { StyleSpecification } from 'maplibre-gl';

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
// but one declared-and-empty (as in wrangler.jsonc, or a .env copied from
// .env.example) arrives as "". `??` would keep that empty string and hand
// MapLibre a blank tile URL, producing a map with no basemap and no error.
const TILE_URL =
  import.meta.env.PUBLIC_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

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

const TILE_ATTRIBUTION =
  import.meta.env.PUBLIC_TILE_ATTRIBUTION ||
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

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

export function baseStyle(): StyleSpecification {
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
        tiles: [TILE_URL],
        tileSize: 256,
        maxzoom: 19,
        attribution: TILE_ATTRIBUTION,
      },
    },
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': '#0a0c10' },
      },
      {
        id: 'osm',
        type: 'raster',
        source: 'osm',
        paint: {
          // The OSM standard style is a light theme. Desaturating and dimming
          // it keeps the data layers legible without shipping a second basemap.
          'raster-saturation': -0.75,
          'raster-brightness-min': 0.05,
          'raster-brightness-max': 0.62,
          'raster-contrast': 0.12,
          'raster-opacity': 0.95,
        },
      },
    ],
  };
}

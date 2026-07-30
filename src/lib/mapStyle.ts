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

const DEFAULT_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const DEFAULT_TILE_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/**
 * Read a build-time override, falling back when it is missing *or blank*.
 *
 * `??` is wrong here. A hosting dashboard that lists an environment variable
 * without a value — which is exactly what Cloudflare Pages hands a build for a
 * declared-but-empty variable — yields `''`, not `undefined`, so `??` keeps the
 * empty string. An empty tile URL resolves against the page, so every tile
 * request fetches the site's own HTML, fails to decode as an image, and the
 * basemap silently never draws: a blank map with no failed request to point at.
 * An empty attribution string quietly drops the credit the OSM tile licence
 * requires. Blank is never a meaningful value for either, so treat it as unset.
 */
function envOrDefault(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

const TILE_URL = envOrDefault(import.meta.env.PUBLIC_TILE_URL, DEFAULT_TILE_URL);

const TILE_ATTRIBUTION = envOrDefault(
  import.meta.env.PUBLIC_TILE_ATTRIBUTION,
  DEFAULT_TILE_ATTRIBUTION,
);

/** Minnesota, with enough padding to show neighbouring context. */
export const MN_BOUNDS: [[number, number], [number, number]] = [
  [-97.6, 43.3],
  [-89.2, 49.5],
];

export const MN_CENTER: [number, number] = [-94.2, 46.3];

export function baseStyle(): StyleSpecification {
  return {
    version: 8,
    // Required by MapLibre for text rendering; served from our own origin.
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
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

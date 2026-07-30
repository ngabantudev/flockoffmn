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
const TILE_URL =
  import.meta.env.PUBLIC_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

const TILE_ATTRIBUTION =
  import.meta.env.PUBLIC_TILE_ATTRIBUTION ??
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

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

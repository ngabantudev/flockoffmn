/**
 * The density ramp, defined once.
 *
 * Shared by the map and the legend swatch beside the layer toggle, for the same
 * reason `geo.mjs` is shared by the ingest and the browser: a legend that
 * drifts from the surface it explains is worse than no legend, because it is
 * still believed. Both are generated from this list, so they cannot disagree.
 *
 * The ramp runs from nothing, through a dark spore purple, to a pale
 * bioluminescent core — thin coverage reads as barely-there haze, heavy
 * coverage as something with mass. It is deliberately soft-edged. This data is
 * `probabilistic`, and a blurred surface is an honest visual register for it in
 * a way a crisp choropleth edge would not be.
 */
export const DENSITY_STOPS: Array<[number, string]> = [
  [0, 'rgba(10,12,16,0)'],
  [0.12, 'rgba(49,20,84,0.30)'],
  [0.3, 'rgba(88,28,135,0.50)'],
  [0.5, 'rgba(129,140,248,0.62)'],
  [0.72, 'rgba(134,239,172,0.74)'],
  [0.9, 'rgba(209,250,229,0.86)'],
  [1, 'rgba(240,253,250,0.94)'],
];

/** The ramp as a MapLibre `heatmap-color` interpolation. */
export function densityColorExpression(): unknown[] {
  return ['interpolate', ['linear'], ['heatmap-density'], ...DENSITY_STOPS.flat()];
}

/**
 * The ramp as a CSS gradient for the legend.
 *
 * The swatch sits on the panel background rather than the map, so the
 * transparent low end would read as "no colour defined" instead of "no
 * cameras". Compositing over the map's own background colour keeps the swatch
 * showing what the reader actually sees on the map.
 */
export function densityGradientCss(over = '#0a0c10'): string {
  const stops = DENSITY_STOPS.map(([at, color]) => `${color} ${Math.round(at * 100)}%`).join(', ');
  return `linear-gradient(to right, ${stops}), ${over}`;
}

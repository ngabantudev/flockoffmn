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
 * The part of the palette a line can be drawn in.
 *
 * The surface's ramp starts transparent over `#0a0c10`, which is right for a
 * surface — nothing should read as nothing. It is wrong for a line. Its first
 * stop is literally the background colour, and the next two clear only 1.8:1
 * and 2.3:1 against it, so a small network came out drawn in ink you cannot
 * see. That is how a map with 25 corridors on it looked like it had none.
 *
 * The cut is at the alpha where the palette's own colours clear 3:1 against the
 * background — the contrast floor for a graphical object you are expected to
 * find. Threads keep the top of the surface's palette, so the two still read as
 * one system; they just never reach for the end of it that is meant to vanish.
 */
export const THREAD_STOPS = DENSITY_STOPS.filter(
  ([, color]) => Number(color.match(/,\s*([\d.]+)\)$/)?.[1] ?? 1) >= 0.6,
).map(([at, color]) => [at, color.replace(/rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)/, 'rgb($1,$2,$3)')] as [number, string]);

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

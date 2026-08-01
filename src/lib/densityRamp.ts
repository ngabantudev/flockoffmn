/**
 * The density ramp, defined once.
 *
 * Shared by the map and the legend swatch beside the layer toggle, for the same
 * reason `geo.mjs` is shared by the ingest and the browser: a legend that
 * drifts from the surface it explains is worse than no legend, because it is
 * still believed. Both are generated from this list, so they cannot disagree.
 *
 * The hues are the sixteen classes of Duncan Smith's World Population Density
 * map (luminocity3d.org/WorldPopDen, CASA/UCL, GHSL 2020), in its order: pale
 * mint at the fringe, through cyan, blue, indigo, purple and magenta, into
 * crimson, red, orange and gold at the core. Two changes were needed to carry a
 * classed choropleth onto a kernel surface, and both are visible above:
 *
 * 1. The bottom stop is the first class at zero alpha. Luminocity paints its
 *    lowest class as near-white because it only draws cells that have people in
 *    them — absence is simply not drawn. A heatmap has no such edge; it fades to
 *    its first colour everywhere, so an opaque low stop would wash the whole
 *    state in mint and turn "no cameras" into a reading. Alpha climbs with the
 *    ramp instead, so nothing still looks like nothing.
 * 2. The stops interpolate rather than step. The classes are hard-edged on
 *    luminocity because a cell count is a measurement; here the surface is an
 *    estimate, and banding it would draw sixteen crisp rings around every
 *    camera and claim a precision the data does not have.
 */
export const DENSITY_STOPS: Array<[number, string]> = [
  [0, 'rgba(244,251,242,0)'],
  [0.06, 'rgba(244,251,242,0.30)'],
  [0.12, 'rgba(217,242,229,0.42)'],
  [0.19, 'rgba(168,227,229,0.52)'],
  [0.25, 'rgba(113,199,215,0.60)'],
  [0.31, 'rgba(66,138,203,0.66)'],
  [0.37, 'rgba(45,107,179,0.71)'],
  [0.44, 'rgba(12,76,159,0.75)'],
  [0.5, 'rgba(0,48,159,0.79)'],
  [0.56, 'rgba(82,31,139,0.82)'],
  [0.62, 'rgba(112,0,128,0.85)'],
  [0.69, 'rgba(153,0,73,0.88)'],
  [0.75, 'rgba(204,0,61,0.90)'],
  [0.81, 'rgba(255,0,0,0.93)'],
  [0.87, 'rgba(255,98,0,0.95)'],
  [0.94, 'rgba(255,158,0,0.97)'],
  [1, 'rgba(255,195,0,1)'],
];

/** The ramp as a MapLibre `heatmap-color` interpolation. */
export function densityColorExpression(): unknown[] {
  return ['interpolate', ['linear'], ['heatmap-density'], ...DENSITY_STOPS.flat()];
}

/** The map background the ramp is read against, from `mapStyle.ts`. */
const BACKGROUND = '#0a0c10';

/** WCAG relative luminance of an `rgb(...)`/`rgba(...)`/`#rrggbb` colour. */
function luminance(color: string): number {
  const [r, g, b] = color.startsWith('#')
    ? [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16))
    : (color.match(/[\d.]+/g) ?? ['0', '0', '0']).slice(0, 3).map(Number);
  const [lr, lg, lb] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/** Contrast ratio between a ramp colour and the map background. */
function contrast(color: string): number {
  const [hi, lo] = [luminance(color), luminance(BACKGROUND)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The part of the palette a line can be drawn in.
 *
 * The surface's ramp is built to be looked *through*: its low end is deliberately
 * near-invisible, and its middle — the deep blues and purples that carry
 * luminocity's densest inner-city classes — clears only 1.8:1 to 2.4:1 against
 * this map's background. That is fine for a filled surface, where a whole region
 * of it is on screen at once. It is wrong for a thread a few pixels wide, and it
 * is how a map with 25 corridors on it once came to look like it had none.
 *
 * So threads take the ramp's hot end: the contiguous run, measured rather than
 * assumed, that reaches the 3:1 floor for a graphical object you are expected to
 * find. Contiguous is the load-bearing word. Simply dropping every failing stop
 * would leave the interpolator to span the gap itself, and a straight line from
 * the blues to the crimsons passes through exactly the muddy purple the floor
 * exists to exclude — the ramp would still fail, just at colours no longer
 * written down anywhere. Taking an unbroken run from the top means every colour a
 * thread can be, including the ones interpolated between stops, has been checked.
 *
 * It leaves the two reading as one system — a thread is coloured out of the same
 * palette as the surface it crosses, and heat still means more — while the ramp's
 * darkest reaches stay where they work, on the surface.
 */
function hotEnd(): number {
  let start = DENSITY_STOPS.length - 1;
  while (start > 0 && contrast(DENSITY_STOPS[start - 1][1]) >= 3) start--;
  return start;
}

export const THREAD_STOPS = DENSITY_STOPS.slice(hotEnd()).map(
  ([at, color]) =>
    [at, color.replace(/rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)/, 'rgb($1,$2,$3)')] as [number, string],
);

/**
 * The colour of a cord — the heavy thread that fuses one body of mesh to the
 * next.
 *
 * Off the thread ramp on purpose, because a cord answers a different question
 * than the ramp encodes, and out of the same palette anyway so the map still
 * reads as one system. It is the ramp's own first class, opaque: luminocity's
 * pale mint fringe, the colour of the sparsest ground there is. That is the
 * right end of the palette for a strand whose whole job is to cross country
 * with nothing in it, and against a hot mesh of crimson and gold it cannot be
 * mistaken for one. Near-white also clears the background by a wide margin,
 * which the ramp's cool middle does not — see `hotEnd` below.
 */
export const CORD_STROKE = DENSITY_STOPS[0][1].replace(
  /rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)/,
  'rgb($1,$2,$3)',
);

/**
 * The ramp as a CSS gradient for the legend.
 *
 * The swatch sits on the panel background rather than the map, so the
 * transparent low end would read as "no colour defined" instead of "no
 * cameras". Compositing over the map's own background colour keeps the swatch
 * showing what the reader actually sees on the map.
 */
export function densityGradientCss(over = BACKGROUND): string {
  const stops = DENSITY_STOPS.map(([at, color]) => `${color} ${Math.round(at * 100)}%`).join(', ');
  return `linear-gradient(to right, ${stops}), ${over}`;
}

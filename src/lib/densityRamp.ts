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

/**
 * The two basemap backgrounds the ramp is ever read against — see
 * `mapStyle.ts`'s `basemapPaint()`. Every consumer below (`THREAD_STOPS_*`,
 * `GLOW_STOPS`, `CORD_STROKE_*`) is a *stroke* colour stripped of its own
 * alpha via `opaque()`, painted with its own separate `line-opacity`, so
 * "legible" always means "legible once fully opaque" — never the ramp's own
 * built-in alpha blended in, which is a different question entirely (see
 * `densityColorExpression`'s doc comment for where that alpha matters).
 */
const DARK_BACKGROUND = '#0a0c10';
const LIGHT_BACKGROUND = '#ffffff';

/** WCAG relative luminance of an opaque `rgb(...)`/`rgba(...)`/`#rrggbb` colour — alpha is ignored on purpose, per the comment above. */
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

/** Contrast ratio between a ramp colour, rendered opaque, and a given background. */
function contrast(color: string, background: string): number {
  const [hi, lo] = [luminance(color), luminance(background)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The part of the palette a line can be drawn in, against a given background.
 *
 * The surface's ramp is built to be looked *through*: its low end is deliberately
 * near-invisible, and its middle — the deep blues and purples that carry
 * luminocity's densest inner-city classes — clears only 1.8:1 to 2.4:1 against
 * the dark basemap. That is fine for a filled surface, where a whole region
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
 * "The top" is a preference, not an assumption, which matters once there is a
 * second background to check: gold and near-white are both *light* colours, so
 * against a light basemap neither ramp extreme clears the floor at all — the
 * ramp's legible middle (the same blues, indigos and reds the dark case's floor
 * excluded) has to carry it instead. This walks from the hot end first, exactly
 * as it always has, and only falls back to scanning the whole ramp for its
 * longest legible run when the hot end fails outright — which is precisely the
 * light-background case, and never the dark one (verified: for `#0a0c10` this
 * still returns the same run it always has).
 */
function legibleRun(background: string): [start: number, end: number] {
  const clears = (i: number) => contrast(DENSITY_STOPS[i][1], background) >= 3;
  const last = DENSITY_STOPS.length - 1;

  if (clears(last)) {
    let start = last;
    while (start > 0 && clears(start - 1)) start--;
    return [start, last];
  }

  // The hot end doesn't work against this background at all — find the
  // longest contiguous legible run anywhere in the ramp instead.
  let bestStart = -1;
  let bestLen = 0;
  let curStart = -1;
  for (let i = 0; i <= last; i++) {
    if (clears(i)) {
      if (curStart === -1) curStart = i;
      if (i - curStart + 1 > bestLen) {
        bestLen = i - curStart + 1;
        bestStart = curStart;
      }
    } else {
      curStart = -1;
    }
  }
  if (bestLen === 0) {
    throw new Error(`densityRamp: no stop in DENSITY_STOPS clears 3:1 against ${background}`);
  }
  return [bestStart, bestStart + bestLen - 1];
}

/** Strip a ramp colour's alpha, so a stroke can carry its own opacity via paint properties instead. */
function opaque(color: string): string {
  return color.replace(/rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)/, 'rgb($1,$2,$3)');
}

function threadStopsFor(background: string): Array<[number, string]> {
  const [start, end] = legibleRun(background);
  return DENSITY_STOPS.slice(start, end + 1).map(([at, color]) => [at, opaque(color)] as [number, string]);
}

export const THREAD_STOPS_DARK = threadStopsFor(DARK_BACKGROUND);
export const THREAD_STOPS_LIGHT = threadStopsFor(LIGHT_BACKGROUND);

/**
 * The full ramp, opaque, for a stroke that wants the surface's whole gradient
 * rather than just the legible run `THREAD_STOPS_DARK`/`THREAD_STOPS_LIGHT` keep.
 *
 * Built for the corridor glow: a wide, heavily blurred halo, where reading
 * each individual stop against the background is not the ask the way it is
 * of a thin core line — a wash reads as "a soft light" against either
 * basemap using the same hues, so unlike the thread stops this one genuinely
 * doesn't need a light/dark split. Taking the ramp's own alpha along with the
 * hue would be wrong here regardless — that alpha exists so an *empty* patch
 * of the heatmap fades to nothing, and the anchor below already puts every
 * corridor's smallest possible network on this ramp's first stop. Keep that
 * stop's built-in alpha of zero and every corridor with a small network —
 * most of them — goes invisible, which is what happens if this is built from
 * `DENSITY_STOPS` directly instead of through `opaque()`.
 */
export const GLOW_STOPS: Array<[number, string]> = DENSITY_STOPS.map(([at, color]) => [at, opaque(color)]);

/**
 * The colour of a cord — the heavy thread that fuses one body of mesh to the
 * next.
 *
 * Off the thread ramp on purpose, because a cord answers a different question
 * than the ramp encodes, and out of the same palette anyway so the map still
 * reads as one system.
 *
 * On dark it is the ramp's own first class, opaque: luminocity's pale mint
 * fringe, the colour of the sparsest ground there is. That is the right end
 * of the palette for a strand whose whole job is to cross country with
 * nothing in it, and against a hot mesh of crimson and gold it cannot be
 * mistaken for one — near-white clears a dark background by a wide margin,
 * which the ramp's cool middle does not (see `legibleRun`).
 *
 * Light has no equivalent free stop. `THREAD_STOPS_LIGHT`'s legible run
 * already spans nearly the whole ramp (gold and near-white are both *light*
 * colours, so neither extreme clears a white background — see
 * `legibleRun`'s comment) — there is no "outside the mesh run" position left
 * that also clears 3:1 against white. This uses that run's own coolest edge,
 * the same colour a corridor with the smallest possible network would get
 * for its mesh — a real overlap, not a rounding error. Accepted rather than
 * fixed: a cord is rendered far more blurred and at lower opacity than the
 * mesh at every zoom (see the `-line-casing`/`-line` paint below), so in
 * practice a wide soft trunk and a thin sharp thread read as different marks
 * even sharing a hue.
 */
export const CORD_STROKE_DARK = opaque(DENSITY_STOPS[0][1]);
export const CORD_STROKE_LIGHT = THREAD_STOPS_LIGHT[0][1];

/**
 * The ramp as a CSS gradient for the legend.
 *
 * The swatch sits on the panel background rather than the map, so the
 * transparent low end would read as "no colour defined" instead of "no
 * cameras". Compositing over the map's own background colour keeps the swatch
 * showing what the reader actually sees on the map.
 */
export function densityGradientCss(over = DARK_BACKGROUND): string {
  const stops = DENSITY_STOPS.map(([at, color]) => `${color} ${Math.round(at * 100)}%`).join(', ');
  return `linear-gradient(to right, ${stops}), ${over}`;
}

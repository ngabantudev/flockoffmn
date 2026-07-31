import { haversineMeters } from './geo.mjs';
import type { FeatureProperties } from '~/layers/types';

/**
 * Re-deriving the network in the browser at a reader-chosen linking radius.
 *
 * The shipped file is not a list of corridors. It is a list of road stretches
 * and single readers, each carrying where its reader locations sit and where
 * the surveyed road around them sits on the same scale. What counts as a
 * corridor is what you get when you pick a radius, and picking it is the
 * reader's job.
 *
 * The unit is the body, not the road. A cluster of reader locations within the
 * radius of one another is one body, whatever roads they stand on; the roads
 * are what it has grown along. That way round matters, and having it backwards
 * is what made the first version of this miss things: while a road needed four
 * readers of its own before anything was drawn, a downtown with ten readers
 * spread across five streets — plainly a network — drew nothing at all, because
 * no single street cleared the bar.
 *
 * The geometry cannot be recomputed here. Clipping a road to a run of readers
 * needs the road network, which lives in OpenStreetMap and reaches this project
 * through two Overpass queries at build time. So the ingest surveys once, at
 * the widest radius the control offers, and the browser only ever narrows.
 * Every metre drawn at any slider position was clipped from real road geometry
 * by the ingest. Nothing is invented here, and nothing can be — there is no
 * road data in this file to invent it from.
 */

export interface LinkRadiusConfig {
  offsetsKey: string;
  countsKey: string;
  lngsKey: string;
  latsKey: string;
  pieceSpansKey: string;
  /** Reader locations a body needs before any of it is drawn. */
  minBodySites: number;
  /** Reader locations on one road before it is drawn as a run rather than stubs. */
  minRunSites: number;
  /** Attribute distinguishing a run of readers from a lone one. */
  kindKey: string;
  /** Value of `kindKey` marking a lone reader. */
  branchKind: string;
}

export interface Run {
  /** Index of the source feature this was cut from. */
  source: number;
  /** A lone reader rather than a run along a road. */
  branch: boolean;
  /** Indices into the source feature's site list. */
  from: number;
  to: number;
  startMiles: number;
  endMiles: number;
  sites: number;
  readers: number;
  points: Array<[number, number]>;
  offsets: number[];
  counts: number[];
  /** The road actually drawn for this element. Set before bodies are formed. */
  pieces: number[][][];
  /** Points along that road, at which this element can link to another. */
  reach: Array<[number, number]>;
  /** Filled in by formBodies. */
  colony: number;
  colonySites: number;
}

/**
 * Points along a drawn road, spaced no further apart than `spacingM`.
 *
 * Linking runs along the streets, so the streets have to be reduced to
 * something a proximity test can chew through — a corridor is a few thousand
 * vertices and there are hundreds of them. Sampling by distance rather than by
 * every nth vertex keeps the spacing honest whatever the survey's vertex
 * density, and because the caller scales the spacing to the radius, the sample
 * count falls as the radius grows and the work stays flat across the control.
 *
 * This makes linking approximate at the margin: two streets are found to touch
 * when sampled points on them fall inside the radius, so a pair passing within
 * a hair of it can be missed by up to half the spacing. The caller keeps that
 * well inside the radius it is testing.
 */
function sampleAlong(
  pieces: number[][][],
  spacingM: number,
  always: Array<[number, number]>,
): Array<[number, number]> {
  const out: Array<[number, number]> = [...always];
  // One running distance across every piece, not one per piece. A corridor is
  // clipped into dozens of fragments, so keeping the first and last vertex of
  // each — as an earlier version did — pinned the sample count to the number of
  // fragments and made the spacing decorative: the widest radius sampled more
  // heavily than the narrowest and took over a second to link.
  let carried = spacingM;
  for (const piece of pieces) {
    for (let i = 0; i < piece.length; i++) {
      if (i > 0) carried += haversineMeters(piece[i - 1] as [number, number], piece[i] as [number, number]);
      if (carried >= spacingM) {
        out.push(piece[i] as [number, number]);
        carried = 0;
      }
    }
  }
  return out;
}

/** Parse a ';'-separated numeric series, dropping anything unreadable. */
export function parseSeries(raw: unknown): number[] {
  if (raw === null || raw === undefined) return [];
  return String(raw)
    .split(';')
    .map((part) => Number(part))
    .filter((n) => Number.isFinite(n));
}

/** Parse the ';'-separated list of `start,end` pairs describing drawn pieces. */
export function parseSpans(raw: unknown): Array<[number, number]> {
  if (raw === null || raw === undefined) return [];
  const out: Array<[number, number]> = [];
  for (const part of String(raw).split(';')) {
    const [lo, hi] = part.split(',').map(Number);
    if (Number.isFinite(lo) && Number.isFinite(hi)) out.push([lo, hi]);
  }
  return out;
}

/**
 * Cut one road stretch into the runs a given linking radius implies.
 *
 * Two reader locations belong to the same run when the gap between them is no
 * wider than the radius, so narrowing the control breaks a long sparse stretch
 * into shorter pieces. Whether any of them is drawn is not decided here — that
 * is the body's job. A road carrying two readers inside a busy cluster is a
 * root of something; the same road alone in open country is not.
 */
export function runsFor(
  properties: FeatureProperties,
  config: LinkRadiusConfig,
  radiusMiles: number,
  sourceIndex: number,
): Run[] {
  const attrs = properties.attributes as Record<string, unknown>;
  const offsets = parseSeries(attrs[config.offsetsKey]);
  const counts = parseSeries(attrs[config.countsKey]);
  const lngs = parseSeries(attrs[config.lngsKey]);
  const lats = parseSeries(attrs[config.latsKey]);
  if (offsets.length < 2 || lngs.length !== offsets.length || lats.length !== offsets.length) {
    return [];
  }

  const runs: Run[] = [];
  let start = 0;
  for (let i = 1; i <= offsets.length; i++) {
    const broken = i === offsets.length || offsets[i] - offsets[i - 1] > radiusMiles;
    if (!broken) continue;
    const from = start;
    const to = i - 1;
    start = i;

    const sites = to - from + 1;
    if (sites < config.minRunSites) continue;

    runs.push({
      source: sourceIndex,
      branch: false,
      from,
      to,
      startMiles: offsets[from],
      endMiles: offsets[to],
      sites,
      readers: counts.slice(from, to + 1).reduce((a, b) => a + (b || 0), 0),
      points: offsets.slice(from, to + 1).map((_, k) => [lngs[from + k], lats[from + k]]),
      // Re-based so the spacing diagram starts at zero for the run actually shown.
      offsets: offsets.slice(from, to + 1).map((o) => Number((o - offsets[from]).toFixed(2))),
      counts: counts.slice(from, to + 1),
      pieces: [],
      reach: [],
      colony: -1,
      colonySites: 0,
    });
  }
  return runs;
}

/**
 * Attach the drawn road to an element and the points it can link from.
 *
 * Spacing is a quarter of the radius being tested, so the approximation in
 * `sampleAlong` costs at most an eighth of it — far inside the precision this
 * data has any claim to.
 */
export function setReach(element: Run, pieces: number[][][], radiusMiles: number): void {
  element.pieces = pieces;
  element.reach = sampleAlong(pieces, (radiusMiles * 1609.344) / 4, element.points);
}

/** A lone reader as a one-site element, so bodies can form over both kinds. */
export function branchRun(
  properties: FeatureProperties,
  config: LinkRadiusConfig,
  sourceIndex: number,
): Run | null {
  const attrs = properties.attributes as Record<string, unknown>;
  const lng = Number(attrs[config.lngsKey]);
  const lat = Number(attrs[config.latsKey]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  const readers = Number(attrs[config.countsKey]) || 1;
  return {
    source: sourceIndex,
    branch: true,
    from: 0,
    to: 0,
    startMiles: 0,
    endMiles: 0,
    sites: 1,
    readers,
    points: [[lng, lat]],
    offsets: [0],
    counts: [readers],
    pieces: [],
    reach: [],
    colony: -1,
    colonySites: 0,
  };
}

/**
 * Group everything into bodies, and keep the bodies worth drawing.
 *
 * A body is a set of elements linked by reader locations within the radius of
 * one another — runs and lone readers alike, across any number of streets. Its
 * size is the reader locations it holds, and that is what has to clear the bar,
 * not any single road. A dense downtown is a body whether or not its readers
 * happen to share a street name.
 *
 * Nothing is drawn across the ground between the elements of one body, because
 * there is frequently no road there to draw. Membership is carried by colour:
 * everything in a body is shaded by how large that body is.
 *
 * Dropping the bodies under the threshold is the whole of the filtering. A lone
 * reader in open country is not a network and is not drawn here; it is still on
 * the camera layer, where it is a camera and claims nothing more than that.
 */
export function formBodies(elements: Run[], radiusMiles: number, minBodySites: number): Run[] {
  if (!elements.length) return [];

  const radiusM = radiusMiles * 1609.344;
  const parent = elements.map((_, i) => i);
  const find = (a: number): number => (parent[a] === a ? a : (parent[a] = find(parent[a])));
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  // Bucket every linking point so the pairwise test only looks at neighbours.
  // Without it this is millions of haversines on every drag of the slider.
  const cell = Math.max(radiusM, 1);
  const mPerLng = 111_320 * Math.cos((46 * Math.PI) / 180);
  const grid = new Map<string, Array<{ element: number; point: [number, number] }>>();
  elements.forEach((element, i) => {
    for (const point of element.reach.length ? element.reach : element.points) {
      const gx = Math.floor((point[0] * mPerLng) / cell);
      const gy = Math.floor((point[1] * 110_574) / cell);
      const key = `${gx}|${gy}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key)!.push({ element: i, point });
    }
  });

  for (const [key, entries] of grid) {
    const [gx, gy] = key.split('|').map(Number);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const neighbours = grid.get(`${gx + dx}|${gy + dy}`);
        if (!neighbours) continue;
        for (const other of neighbours) {
          for (const entry of entries) {
            if (entry.element === other.element) continue;
            if (find(entry.element) === find(other.element)) continue;
            if (haversineMeters(entry.point, other.point) <= radiusM) {
              union(entry.element, other.element);
            }
          }
        }
      }
    }
  }

  const size = new Map<number, number>();
  elements.forEach((element, i) => {
    const root = find(i);
    size.set(root, (size.get(root) ?? 0) + element.sites);
  });

  const kept: Run[] = [];
  elements.forEach((element, i) => {
    const root = find(i);
    const total = size.get(root) ?? element.sites;
    if (total < minBodySites) return;
    element.colony = root;
    element.colonySites = total;
    kept.push(element);
  });
  return kept;
}

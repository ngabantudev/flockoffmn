import { haversineMeters } from './geo.mjs';
import type { FeatureProperties } from '~/layers/types';

/**
 * Growing the network out of the cameras, at a reader-chosen radius.
 *
 * The shipped file is not a list of corridors. It is a list of links: one per
 * pair of reader locations that are each other's nearest, each carrying the
 * road route between them exactly as OpenStreetMap records it. What the map
 * draws at a given radius is a piece of those routes — as far as the radius
 * reaches out from each camera, and no further.
 *
 * So the drawing answers a question a static map cannot: at half a mile of
 * reach, how much of this is joined up? About half of it — the other half is
 * still reaching. At two miles, seven strands in eight have met. At ten, all of
 * them have. All three are true, and picking one of them for the reader would
 * publish an editorial judgement as though it were a finding. The control hands
 * the judgement back.
 *
 * What widening the radius does *not* do is fuse everything into one network,
 * and it is worth being clear about that here because the cluster model this
 * replaced really did. Each reader location reaches only for its single nearest
 * neighbour, so the links form a nearest-neighbour graph, and those come apart
 * into many small components by construction. Over the whole of Minnesota, at
 * the widest radius the control offers, there are 354 connected networks and
 * the largest holds nine reader locations. The colour ramp is scaled to that
 * range rather than to the hundreds the old model produced.
 *
 * Nothing here is invented and nothing here can be: there is no road network in
 * the browser to invent from. Every metre drawn at every slider position was
 * routed over real road geometry at build time and is only ever cut shorter.
 */

export interface LinkRadiusConfig {
  /** Attribute holding the link's two end longitudes, ';'-separated. */
  lngsKey: string;
  /** Attribute holding the link's two end latitudes, ';'-separated. */
  latsKey: string;
  /** Attribute holding the length of the routed road between them, in miles. */
  lengthKey: string;
  /** Attribute the map styles on, and the value marking a link not yet joined. */
  kindKey: string;
  reachingKind: string;
}

export interface GrownLink {
  /** Index of the source feature this was cut from. */
  source: number;
  /** The radius covers the whole route, so the two readers are connected. */
  complete: boolean;
  /** How much of the route the radius draws, across both ends. */
  drawnMiles: number;
  /** The pieces actually drawn: one when complete, one per end while growing. */
  pieces: number[][][];
  /** Reader locations in the network this link belongs to. */
  network: number;
}

/**
 * Distance along a line, in metres, at each of its vertices.
 *
 * Cached against the coordinate array itself. The whole set is re-cut on every
 * frame of a slider drag, and re-walking 800 routes of a few hundred vertices
 * each time is the difference between a control that tracks the finger and one
 * that lags behind it.
 */
const offsetCache = new WeakMap<number[][], number[]>();

function offsetsOf(coords: number[][]): number[] {
  const cached = offsetCache.get(coords);
  if (cached) return cached;
  const offsets = [0];
  for (let i = 1; i < coords.length; i++) {
    offsets.push(
      offsets[i - 1] + haversineMeters(coords[i - 1] as [number, number], coords[i] as [number, number]),
    );
  }
  offsetCache.set(coords, offsets);
  return offsets;
}

/** The point a fraction of the way along a segment. */
const lerp = (a: number[], b: number[], t: number) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];

/**
 * The piece of a line between two distances along it, in metres.
 *
 * The ends are interpolated rather than snapped to the nearest vertex, so a
 * strand grows smoothly as the slider moves instead of jumping from vertex to
 * vertex — on a rural road, where vertices can be hundreds of metres apart,
 * snapping made the control feel broken.
 */
function slice(coords: number[][], offsets: number[], fromM: number, toM: number): number[][] {
  const total = offsets[offsets.length - 1];
  const start = Math.max(0, Math.min(fromM, total));
  const end = Math.max(start, Math.min(toM, total));
  if (end - start <= 0) return [];

  const out: number[][] = [];
  for (let i = 1; i < coords.length; i++) {
    const a = offsets[i - 1];
    const b = offsets[i];
    if (b < start || a > end) continue;
    const span = b - a;
    const enter = span === 0 ? 0 : Math.max(0, (start - a) / span);
    const leave = span === 0 ? 1 : Math.min(1, (end - a) / span);
    const head = enter === 0 ? coords[i - 1] : lerp(coords[i - 1], coords[i], enter);
    const tail = leave === 1 ? coords[i] : lerp(coords[i - 1], coords[i], leave);
    if (!out.length) out.push(head);
    out.push(tail);
  }
  return out.length > 1 ? out : [];
}

/** The two ends of a link, as the keys two links share when they meet. */
function endsOf(properties: FeatureProperties, config: LinkRadiusConfig): [string, string] | null {
  const attrs = properties.attributes as Record<string, unknown>;
  const lngs = String(attrs[config.lngsKey] ?? '').split(';');
  const lats = String(attrs[config.latsKey] ?? '').split(';');
  if (lngs.length !== 2 || lats.length !== 2) return null;
  return [`${lngs[0]},${lats[0]}`, `${lngs[1]},${lats[1]}`];
}

/**
 * Cut every link to the radius, and work out what the surviving links connect.
 *
 * A link is drawn growing out of both of its readers at once, each end reaching
 * half the radius, so the two halves meet exactly when the radius covers the
 * route between them. That is the whole of the rule: at a radius of one mile,
 * every reader whose neighbour is within a mile of road is joined to it, and
 * every reader whose neighbour is further away has a half-mile of its own
 * street growing towards one.
 *
 * Splitting the radius between the ends rather than giving each end the full
 * radius is what keeps the two statements the same statement. Reaching a full
 * radius from each end would join a two-mile link at a one-mile setting, and
 * the control would be claiming a connection the number on it denies.
 */
export function growLinks(
  // Structural rather than the GeoJSON `Feature`, so the controller can hand
  // its own loaded records straight in. `coordinates` is optional because a
  // GeometryCollection has none; anything that is not a LineString is skipped.
  features: Array<{ geometry: { type: string; coordinates?: unknown }; properties: FeatureProperties }>,
  config: LinkRadiusConfig,
  radiusMiles: number,
): GrownLink[] {
  const MILE = 1609.344;
  const links: Array<GrownLink & { ends: [string, string] }> = [];

  features.forEach((feature, index) => {
    if (feature.geometry.type !== 'LineString') return;
    const coords = feature.geometry.coordinates as number[][];
    if (!Array.isArray(coords) || coords.length < 2) return;
    const ends = endsOf(feature.properties, config);
    if (!ends) return;

    const offsets = offsetsOf(coords);
    const total = offsets[offsets.length - 1];
    const attrs = feature.properties.attributes as Record<string, unknown>;
    const declared = Number(attrs[config.lengthKey]);
    // The routed length as shipped, falling back to the drawn geometry's own
    // length. They agree to within a rounding of a hundredth of a mile; the
    // fallback exists so a link never silently fails to grow.
    const lengthMiles = Number.isFinite(declared) && declared > 0 ? declared : total / MILE;

    const complete = radiusMiles >= lengthMiles;
    const reachM = (Math.min(radiusMiles, lengthMiles) / 2) * MILE;
    const pieces = complete
      ? [coords]
      : [slice(coords, offsets, 0, reachM), slice(coords, offsets, total - reachM, total)].filter(
          (piece) => piece.length > 1,
        );
    if (!pieces.length) return;

    links.push({
      source: index,
      complete,
      drawnMiles: Number((complete ? lengthMiles : (reachM * 2) / MILE).toFixed(2)),
      pieces,
      network: 0,
      ends,
    });
  });

  /*
   * Networks.
   *
   * Two reader locations are in the same network when a chain of completed
   * links runs between them, so widening the radius fuses pockets into
   * districts and narrowing it breaks them apart again. Growing strands join
   * nothing: a strand that has not reached its neighbour is a reader on a road,
   * which is all the source says it is.
   */
  const parent = new Map<string, string>();
  const find = (a: string): string => {
    let root = a;
    while (parent.get(root) !== root) root = parent.get(root)!;
    while (parent.get(a) !== root) {
      const next = parent.get(a)!;
      parent.set(a, root);
      a = next;
    }
    return root;
  };
  const add = (a: string) => {
    if (!parent.has(a)) parent.set(a, a);
  };

  for (const link of links) {
    add(link.ends[0]);
    add(link.ends[1]);
  }
  for (const link of links) {
    if (!link.complete) continue;
    const ra = find(link.ends[0]);
    const rb = find(link.ends[1]);
    if (ra !== rb) parent.set(ra, rb);
  }

  const size = new Map<string, number>();
  for (const key of parent.keys()) {
    const root = find(key);
    size.set(root, (size.get(root) ?? 0) + 1);
  }

  for (const link of links) {
    // A growing strand is shaded by the larger of the two networks it is
    // reaching between, because that is the thing it is about to join. Which
    // one it is cannot be read off the line, and saying so in the legend is
    // more honest than picking an end and shading by it.
    link.network = Math.max(size.get(find(link.ends[0])) ?? 1, size.get(find(link.ends[1])) ?? 1);
  }

  return links;
}

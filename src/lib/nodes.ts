/**
 * Cameras that stand together, gathered into one body.
 *
 * Two readers on opposite corners of the same junction are not two facts about
 * the map, they are one: a place where every vehicle through that junction is
 * photographed, whichever way it turns. Drawn as two dots that is invisible
 * until you are close enough to count them, and at any distance further out it
 * looks the same as two cameras a mile apart.
 *
 * So the group is the unit. A node is every reader location within
 * `NODE_RADIUS_M` of another, linked transitively — an intersection, a
 * frontage road, a short block — carrying how many cameras stand in it. The map
 * draws it as a brighter patch of the same density surface rather than as a
 * counted bubble: it is the same estimate everywhere, just heavier where the
 * hardware is heavier, so there is no scale at which the reader has to switch
 * between two ways of seeing.
 *
 * This is a rendering aggregate and nothing more. Nodes are not records: they
 * are not clickable, not searchable, and not in the accessible record list,
 * because the thing a reader can act on is a camera at an address and this is a
 * shape drawn over several of them.
 */

/** One reader location, with however many cameras were recorded standing on it. */
export interface NodeSite {
  lng: number;
  lat: number;
  /** Cameras at this location — a pole tagged "321;109" carries two. */
  cameras: number;
}

/** A group of two or more sites, drawn as one body. */
export interface CameraNode {
  lng: number;
  lat: number;
  /** Reader locations in the group. */
  sites: number;
  /** Cameras across those locations, which is what the brightness scales on. */
  cameras: number;
}

/**
 * How close two reader locations have to be to belong to the same node.
 *
 * Seventy metres is roughly the diagonal of a signalled intersection with turn
 * lanes, which is the thing being described. It is a judgement, not a finding:
 * widen it and a node becomes a block, narrow it and cameras facing each other
 * across a junction come apart into separate bodies.
 */
export const NODE_RADIUS_M = 70;

const M_PER_DEG_LAT = 111_320;

/**
 * Longitude metres per degree, at the middle of the state.
 *
 * Used only to size the lookup grid, never to decide whether two cameras are
 * within the radius — that test uses each pair's own latitude. Minnesota spans
 * about 43.5°N to 49.2°N, where this constant is off by at most four per cent,
 * and a grid cell four per cent wrong changes nothing: the neighbour scan reads
 * the surrounding cells either way.
 */
const M_PER_DEG_LNG = M_PER_DEG_LAT * Math.cos((46.4 * Math.PI) / 180);

/**
 * Group sites into nodes by single-link clustering at `NODE_RADIUS_M`.
 *
 * Single-link, so a row of cameras each within the radius of the next is one
 * body however long the row gets. That is deliberate: a frontage road covered
 * end to end is one piece of infrastructure, and cutting it into fixed-size
 * groups would draw a boundary the ground does not have.
 *
 * Sites are bucketed into a grid of one radius per cell so each one is only
 * compared against its nine surrounding cells, rather than against all several
 * thousand of the others — the whole set is regrouped every time a filter
 * changes, so this runs on the reader's machine while they drag a checkbox.
 */
export function groupNodes(sites: NodeSite[], radiusM = NODE_RADIUS_M): CameraNode[] {
  const cellLat = radiusM / M_PER_DEG_LAT;
  const cellLng = radiusM / M_PER_DEG_LNG;

  const parent = sites.map((_, i) => i);
  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root];
    // Path compression, so a long chain of linked cameras does not make every
    // later lookup walk it again.
    while (parent[i] !== root) {
      const next = parent[i];
      parent[i] = root;
      i = next;
    }
    return root;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  const cells = new Map<string, number[]>();
  const cellKey = (site: NodeSite) =>
    `${Math.floor(site.lng / cellLng)}:${Math.floor(site.lat / cellLat)}`;
  sites.forEach((site, i) => {
    const key = cellKey(site);
    const bucket = cells.get(key);
    if (bucket) bucket.push(i);
    else cells.set(key, [i]);
  });

  const withinRadius = (a: NodeSite, b: NodeSite) => {
    const midLat = ((a.lat + b.lat) / 2) * (Math.PI / 180);
    const dx = (a.lng - b.lng) * M_PER_DEG_LAT * Math.cos(midLat);
    const dy = (a.lat - b.lat) * M_PER_DEG_LAT;
    return dx * dx + dy * dy <= radiusM * radiusM;
  };

  sites.forEach((site, i) => {
    const cx = Math.floor(site.lng / cellLng);
    const cy = Math.floor(site.lat / cellLat);
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        for (const j of cells.get(`${cx + ox}:${cy + oy}`) ?? []) {
          if (j <= i) continue;
          if (withinRadius(site, sites[j])) union(i, j);
        }
      }
    }
  });

  const groups = new Map<number, { lng: number; lat: number; sites: number; cameras: number }>();
  sites.forEach((site, i) => {
    const root = find(i);
    const group = groups.get(root);
    if (group) {
      group.lng += site.lng;
      group.lat += site.lat;
      group.sites += 1;
      group.cameras += site.cameras;
    } else {
      groups.set(root, { lng: site.lng, lat: site.lat, sites: 1, cameras: site.cameras });
    }
  });

  const nodes: CameraNode[] = [];
  for (const group of groups.values()) {
    // A lone reader is already drawn by the surface underneath and by its own
    // dot. A node is what more than one of them together makes.
    if (group.sites < 2) continue;
    nodes.push({
      lng: group.lng / group.sites,
      lat: group.lat / group.sites,
      sites: group.sites,
      cameras: group.cameras,
    });
  }
  return nodes;
}

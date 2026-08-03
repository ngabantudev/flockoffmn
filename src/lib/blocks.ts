/**
 * Parcels gathered into a grid cell, for wide-zoom legibility.
 *
 * A covenant is a real parcel outline, drawn at survey precision — but tens
 * of thousands of them across a state, seen from a city or metro scale, are
 * sub-pixel slivers stacked into a meaningless smear. Between two named zooms
 * a plain grid stands in: each occupied cell reports how many parcels fall
 * inside it and which category (deed decade, say) is commonest there, so the
 * shape of the coverage still reads while the lots themselves cannot yet be
 * told apart.
 *
 * This is a rendering aggregate and nothing more, the polygon counterpart to
 * `groupNodes` in `src/lib/nodes.ts`. Blocks are not records: not clickable,
 * not searchable, and not in the accessible record list, because the thing a
 * reader can act on is a parcel and this is a shape drawn over several of
 * them.
 */

/** One parcel centroid, with the categorical value it should count toward. */
export interface BlockSite {
  lng: number;
  lat: number;
  /** The parcel's value of the layer's `categoryColors` key, if it has one. */
  category: string | null;
}

/** A grid cell holding one or more parcels, drawn as one square. */
export interface Block {
  west: number;
  south: number;
  east: number;
  north: number;
  /** Parcels whose centroid fell in this cell. */
  count: number;
  /** The commonest category among this cell's parcels, for the fill colour. */
  category: string | null;
}

const M_PER_DEG_LAT = 111_320;

/** Longitude metres per degree, at the middle of the state — see groupNodes's own comment on the same constant. */
const M_PER_DEG_LNG = M_PER_DEG_LAT * Math.cos((46.4 * Math.PI) / 180);

/**
 * Bucket parcel centroids into a fixed grid of `cellMeters` squares.
 *
 * A plain grid, not single-link clustering like `groupNodes`: a block is a
 * fixed place on the ground, not a body that grows by chaining neighbours
 * together, so there is no radius test between sites — only which cell each
 * one's centroid falls in. Recomputed from whichever parcels survive the
 * active filters, so a block never claims a parcel that the filter has hidden.
 */
export function groupBlocks(sites: BlockSite[], cellMeters: number): Block[] {
  const cellLat = cellMeters / M_PER_DEG_LAT;
  const cellLng = cellMeters / M_PER_DEG_LNG;

  const cells = new Map<string, { lngIndex: number; latIndex: number; count: number; categories: Map<string, number> }>();

  for (const site of sites) {
    const lngIndex = Math.floor(site.lng / cellLng);
    const latIndex = Math.floor(site.lat / cellLat);
    const key = `${lngIndex}:${latIndex}`;
    let cell = cells.get(key);
    if (!cell) {
      cell = { lngIndex, latIndex, count: 0, categories: new Map() };
      cells.set(key, cell);
    }
    cell.count++;
    if (site.category) cell.categories.set(site.category, (cell.categories.get(site.category) ?? 0) + 1);
  }

  const commonest = (counts: Map<string, number>): string | null =>
    [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;

  return [...cells.values()].map((cell) => ({
    west: cell.lngIndex * cellLng,
    south: cell.latIndex * cellLat,
    east: (cell.lngIndex + 1) * cellLng,
    north: (cell.latIndex + 1) * cellLat,
    count: cell.count,
    category: commonest(cell.categories),
  }));
}

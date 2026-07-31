#!/usr/bin/env node
/**
 * L1b — ALPR links.
 *
 * A derived layer. It reads the camera layer this repo already publishes and
 * asks one question of it: from each reader, which way is the next one, and
 * what road would you drive to reach it?
 *
 * The point is what a map of dots cannot show. A cluster of cameras in a
 * downtown reads as "the city centre is watched". The roads between those
 * cameras are a different claim: that the ordinary trip — the school run, the
 * commute, the drive to a clinic — is logged repeatedly by the same network,
 * and that the people logged are overwhelmingly not suspects. Drawing the
 * street a driver would actually take from one reader to the next is what makes
 * that legible.
 *
 * Every link is a route along real OpenStreetMap road geometry between two
 * mapped reader locations. No line is ever invented between two cameras: a
 * straight connector would assert a relationship no source records, and this
 * project does not fabricate records. Where no road route can be found the link
 * is dropped and counted, never drawn.
 *
 * Each reader location is linked to its single nearest neighbour, so a lone
 * rural reader has one strand and a dense downtown block ends up with several —
 * every reader that chose it adds one. That asymmetry is the finding: density
 * is what the drawing shows, without a threshold deciding for the reader what
 * counts as a corridor.
 *
 * One keyless Overpass pass: the drivable ways in the tiles the linked pairs
 * occupy, which is both the network routed over and the geometry drawn.
 *
 * One is worth remarking on. The earlier corridor build needed a pass to learn
 * which road each camera stood on and another to fetch that road in full; a
 * router needs neither, because the road between two readers is found by
 * walking the network rather than by matching a road name.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import {
  writeLayer,
  log,
  loadCounties,
  slugId,
  queryOverpass,
  OVERPASS_MIRRORS,
  PUBLIC_DATA,
  RAW_DIR,
} from './lib/util.mjs';
import { findContaining, haversineMeters, locateOnLine, metersToMiles } from '../../src/lib/geo.mjs';

// No state filter here, unlike the other ingests: the network is fetched by
// tile around the cameras themselves, so where the cameras are is what decides
// where the roads come from.
const STATE_USPS = process.env.STATE_USPS ?? 'MN';

const MILE = 1609.344;

/**
 * Ways a car can drive on. Deliberately excludes footway, cycleway, path and
 * service: an ALPR is mounted on a pole at the kerb, so its nearest way is
 * very often the pavement beside it rather than the road it is aimed at.
 * Snapping without this filter puts a third of the metro's cameras on
 * footpaths, and routing over it sends a link down an alley.
 */
const DRIVABLE = '^(motorway|trunk|primary|secondary|tertiary|unclassified|residential)(_link)?$';

/** How far from a road a camera may stand and still be placed on it. */
const SNAP_M = 60;

/**
 * Two cameras closer than this are one location — a single gantry or pole pair
 * covering both directions of travel. Kept distinct from the reader count
 * because "16 readers" and "8 places you drive past" are different facts and
 * conflating them would overstate how often a given trip is seen.
 */
const SITE_M = 75;

/**
 * The furthest a neighbour may be and still be linked, measured along the road.
 *
 * This is the ceiling of the control in the browser, which can only ever narrow
 * what was surveyed here: at ten miles every link in the file is drawn whole,
 * and below it each one is drawn only as far as the radius reaches from its two
 * ends. Moving it means moving `linkRadius.maxMiles` in the registry to match,
 * or the top of the slider silently stops completing links.
 *
 * Ten miles is well past the point of usefulness for most of the state — half
 * of all links here are under 0.4 miles — and exists for the rural reader whose
 * nearest neighbour is the next town over. That link is a true fact about a
 * sparse network and dropping it would make the map look denser than it is.
 */
const LINK_M = 10 * MILE;

/**
 * How much longer than the straight line a route may be before it is refused.
 *
 * A river, a rail yard or a freeway with no crossing can put two readers a mile
 * apart and twelve miles of driving from each other. That is a real fact, but
 * the drawn line stops being about the pair and becomes about the detour, and
 * at that point the honest thing is to draw nothing. The floor keeps very short
 * links — where a one-block dogleg is a large ratio of a small number — from
 * being thrown away by the same rule.
 */
const DETOUR_RATIO = 3;
const DETOUR_FLOOR_M = 0.5 * MILE;

/**
 * Tiles the road network is fetched in.
 *
 * Roughly 2.2 km north to south and 2.3 km east to west at this latitude. The
 * pairs are turned into a set of tiles rather than a list of bounding boxes
 * because the metro's pairs overlap almost completely: 803 padded pair boxes
 * cover about 16,000 km² counted separately and well under half of that once
 * deduplicated. Fetching the union once is both faster and considerably kinder
 * to a volunteer-run mirror.
 *
 * Tile size is a trade, and both ends of it cost. Large tiles pull in whole
 * neighbourhoods nobody asked about — at 4.4 km this covered 26,000 km² of
 * Minnesota to route 803 pairs. Small ones hug the pairs, but Overpass returns
 * a way in full whenever any part of it is in the box, so a highway comes back
 * once per tile it crosses. This size sits between the two at about 6,400 km².
 */
const TILE_LAT = 0.02;
const TILE_LNG = 0.03;

/**
 * Tiles per Overpass request.
 *
 * Ten, and measured rather than guessed: thirty tiles of residential streets is
 * a heavy enough question that the public mirrors time out on it more often
 * than they answer, and a query that has to be retried three times is slower
 * and ruder than three queries that succeed. Batches are also handed over in
 * row order, so the tiles in one request sit beside each other on the ground
 * and the server is asked about one neighbourhood rather than five.
 */
const TILE_BATCH = 10;

/**
 * How far either side of the straight line between two readers their road
 * network is fetched.
 *
 * A route that leaves this strip cannot be found and the pair is dropped, which
 * is the conservative failure: a link that is not drawn understates the network
 * and a link routed through country nobody fetched would not exist at all. A
 * kilometre is generous for the detour a real street makes around a lake or a
 * rail yard, and a route that needs more than that is usually past the detour
 * limit below anyway.
 */
const STRIP_M = 1_000;

/**
 * Mirrors, largest first.
 *
 * This build is the heaviest thing in the repo by a wide margin — a hundred and
 * twenty-five questions about residential street networks, back to back — and
 * the main Overpass instance answers them with 504s, which is the correct
 * behaviour from a volunteer service being asked more than it advertises.
 * Kumi's instance is provisioned for bulk work, so it is asked first and the
 * others are the fallback rather than the front line.
 */
const MIRRORS = [
  ...OVERPASS_MIRRORS.filter((m) => m.includes('kumi')),
  ...OVERPASS_MIRRORS.filter((m) => !m.includes('kumi')),
];

/**
 * How long to wait between road-tile requests.
 *
 * Deliberate, and it makes the build faster rather than slower. Asked back to
 * back, the mirrors start answering with 502s and 504s about one time in three,
 * and each one costs a retry that doubles its wait — so a run that paused for
 * nothing spent longer being turned away than it would have spent waiting. It
 * is also the right way to treat a service that gives this away for free.
 */
const POLITE_MS = 4_000;

/** Where fetched road tiles are kept, so a re-run does not re-ask for them. */
const CACHE_DIR = path.join(RAW_DIR, 'corridors');

const round = (m, dp = 2) => Number(metersToMiles(m).toFixed(dp));

/**
 * The identity of a road: its route number where it has one, its name
 * otherwise. `ref` can carry several values ("US 12;MN 7"); the first is the
 * one the road is signed as.
 */
function identityOf(tags) {
  const ref = (tags.ref ?? '').split(';')[0].trim();
  if (ref) return ref;
  const name = (tags.name ?? '').trim();
  return name || null;
}

// Compiled once: this runs over every element of every tile batch, which is
// several hundred thousand calls across a build.
const DRIVABLE_RE = new RegExp(DRIVABLE);

const isDrivable = (element) =>
  element.type === 'way' &&
  Array.isArray(element.geometry) &&
  element.geometry.length > 1 &&
  DRIVABLE_RE.test(element.tags?.highway ?? '');

const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;

/* ------------------------------------------------------------------ *
 * Reader locations
 * ------------------------------------------------------------------ */

async function loadCameras() {
  const file = path.join(PUBLIC_DATA, 'alpr.geojson');
  const raw = await readFile(file, 'utf8').catch(() => null);
  if (!raw) throw new Error('public/data/alpr.geojson missing — run `npm run data:alpr` first');
  const collection = JSON.parse(raw);
  const cameras = (collection.features ?? [])
    .filter((f) => f.geometry?.type === 'Point')
    .map((f) => ({
      point: f.geometry.coordinates,
      osmId: f.properties?.attributes?.osmId ?? null,
      operator: f.properties?.attributes?.operator ?? null,
    }));
  if (!cameras.length) throw new Error('camera layer holds no points');
  return { cameras, metadata: collection.metadata ?? {} };
}

/**
 * Cameras within SITE_M of one another, linked transitively, are one location.
 *
 * Single-link on purpose: a row of poles each within 75 m of the next is one
 * gantry however long the row gets, and cutting it into fixed-size groups would
 * draw a boundary the ground does not have.
 */
function toSites(cameras) {
  const parent = cameras.map((_, i) => i);
  const find = (a) => (parent[a] === a ? a : (parent[a] = find(parent[a])));

  const mLng = 111_320 * Math.cos((46 * Math.PI) / 180);
  const key = (p) => `${Math.floor((p[0] * mLng) / SITE_M)}|${Math.floor((p[1] * 110_574) / SITE_M)}`;
  const grid = new Map();
  cameras.forEach((camera, i) => {
    const k = key(camera.point);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  });

  cameras.forEach((camera, i) => {
    const gx = Math.floor((camera.point[0] * mLng) / SITE_M);
    const gy = Math.floor((camera.point[1] * 110_574) / SITE_M);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const j of grid.get(`${gx + dx}|${gy + dy}`) ?? []) {
          if (j <= i) continue;
          if (haversineMeters(camera.point, cameras[j].point) <= SITE_M) {
            const a = find(i);
            const b = find(j);
            if (a !== b) parent[a] = b;
          }
        }
      }
    }
  });

  const groups = new Map();
  cameras.forEach((camera, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(camera);
  });

  return [...groups.values()].map((group) => ({
    point: [mean(group.map((c) => c.point[0])), mean(group.map((c) => c.point[1]))],
    readers: group.length,
    operators: [...new Set(group.map((c) => c.operator).filter(Boolean))].sort(),
    unattributed: group.filter((c) => !c.operator).length,
  }));
}

/**
 * Each location's nearest neighbour, as a set of undirected pairs.
 *
 * Undirected because a link is a piece of road and a piece of road is not
 * owned by either end of it: where A's nearest is B and B's nearest is A, that
 * is one strand, not two drawn on top of each other. Where B's nearest is some
 * third location, B keeps its own strand as well — which is exactly why a dense
 * block ends up with several and a lone reader with one.
 */
function nearestPairs(sites) {
  const mLng = 111_320 * Math.cos((46 * Math.PI) / 180);
  const cell = LINK_M;
  const grid = new Map();
  const cellOf = (p) => [Math.floor((p[0] * mLng) / cell), Math.floor((p[1] * 110_574) / cell)];
  sites.forEach((site, i) => {
    const [gx, gy] = cellOf(site.point);
    const k = `${gx}|${gy}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  });

  const pairs = new Map();
  let alone = 0;
  sites.forEach((site, i) => {
    const [gx, gy] = cellOf(site.point);
    let best = null;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const j of grid.get(`${gx + dx}|${gy + dy}`) ?? []) {
          if (j === i) continue;
          const d = haversineMeters(site.point, sites[j].point);
          if (d <= LINK_M && (!best || d < best.d)) best = { d, j };
        }
      }
    }
    if (!best) {
      alone++;
      return;
    }
    const [a, b] = i < best.j ? [i, best.j] : [best.j, i];
    pairs.set(`${a}|${b}`, { a, b, straightM: best.d });
  });

  return { pairs: [...pairs.values()], alone };
}

/* ------------------------------------------------------------------ *
 * The road network
 * ------------------------------------------------------------------ */

/**
 * Every tile within the strip around a pair's straight line.
 *
 * The strip, rather than the bounding box: two readers seven miles apart on a
 * diagonal have a box of fifty square miles and a strip of nine, and the forty
 * they do not share is somebody else's town.
 *
 * Padding is what leaves the router somewhere to go. A route between two
 * readers on the same street can still swing a block wide to get round a
 * one-way pair or a closed median, and a network clipped tight to the pair has
 * no such block in it.
 */
function tilesFor(pairs, sites) {
  const tiles = new Set();
  // Half the diagonal of a tile: a tile whose centre is further than this from
  // the strip cannot have a corner inside it.
  const halfTile =
    Math.hypot(TILE_LNG * 111_320 * Math.cos((46 * Math.PI) / 180), TILE_LAT * 110_574) / 2;

  for (const pair of pairs) {
    const a = sites[pair.a].point;
    const b = sites[pair.b].point;
    const padM = Math.min(STRIP_M, Math.max(300, pair.straightM * 0.35));
    const padLat = padM / 110_574;
    const padLng = padM / (111_320 * Math.cos((a[1] * Math.PI) / 180));
    const minLat = Math.min(a[1], b[1]) - padLat;
    const maxLat = Math.max(a[1], b[1]) + padLat;
    const minLng = Math.min(a[0], b[0]) - padLng;
    const maxLng = Math.max(a[0], b[0]) + padLng;
    for (let y = Math.floor(minLat / TILE_LAT); y <= Math.floor(maxLat / TILE_LAT); y++) {
      for (let x = Math.floor(minLng / TILE_LNG); x <= Math.floor(maxLng / TILE_LNG); x++) {
        const centre = [(x + 0.5) * TILE_LNG, (y + 0.5) * TILE_LAT];
        if (locateOnLine(centre, [a, b]).distance <= padM + halfTile) tiles.add(`${x}|${y}`);
      }
    }
  }
  // Row order, so a batch is a strip of ground rather than a scatter of it.
  return [...tiles].sort((a, b) => {
    const [ax, ay] = a.split('|').map(Number);
    const [bx, by] = b.split('|').map(Number);
    return ay - by || ax - bx;
  });
}

/**
 * Fetch the drivable ways in a batch of tiles, through a cache on disk.
 *
 * Cached because these are volunteer-run mirrors and a run that dies on batch
 * 40 of 55 should not ask the first 39 again. The key is the query itself, so
 * changing the tile size, the batch size or the road filter invalidates
 * everything it should and nothing it should not.
 */
async function fetchTileBatch(scope, batch) {
  const boxes = batch
    .map((tile) => {
      const [x, y] = tile.split('|').map(Number);
      const s = (y * TILE_LAT).toFixed(4);
      const w = (x * TILE_LNG).toFixed(4);
      const n = ((y + 1) * TILE_LAT).toFixed(4);
      const e = ((x + 1) * TILE_LNG).toFixed(4);
      return `  way(${s},${w},${n},${e})["highway"~"${DRIVABLE}"];`;
    })
    .join('\n');
  const query = `[out:json][timeout:300];\n(\n${boxes}\n);\nout tags geom;`;

  const hash = createHash('sha1').update(query).digest('hex').slice(0, 16);
  const cached = path.join(CACHE_DIR, `${hash}.json`);
  if (existsSync(cached)) {
    return JSON.parse(await readFile(cached, 'utf8'));
  }
  const data = await queryOverpass(scope, query, { timeoutMs: 310_000, mirrors: MIRRORS });
  // Cached before the pause, not after: the whole point of the cache is to
  // survive a run that dies mid-build, and a Ctrl-C during the wait would
  // otherwise throw away an answer a mirror had already done the work for.
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(cached, JSON.stringify(data));
  await new Promise((resolve) => setTimeout(resolve, POLITE_MS));
  return data;
}

/**
 * The routing graph.
 *
 * Vertices are OpenStreetMap nodes, keyed by their coordinates: `out geom`
 * gives every way the exact position of each node it passes through, so two
 * ways meeting at a junction produce the identical pair of numbers and the
 * junction joins itself. Edges are the segments between consecutive vertices,
 * undirected — this draws streets rather than routing traffic, so one-way
 * restrictions are ignored and a link may follow a road the wrong way. Said
 * plainly in the known gaps rather than half-corrected here.
 */
function buildGraph(ways) {
  const index = new Map();
  const coords = [];
  const adjacency = [];

  const nodeAt = (lng, lat) => {
    const key = `${lng.toFixed(7)}|${lat.toFixed(7)}`;
    let id = index.get(key);
    if (id === undefined) {
      id = coords.length;
      index.set(key, id);
      coords.push([lng, lat]);
      adjacency.push([]);
    }
    return id;
  };

  const segments = [];
  ways.forEach((way, wayIndex) => {
    let previous = nodeAt(way.geometry[0].lon, way.geometry[0].lat);
    for (let i = 1; i < way.geometry.length; i++) {
      const current = nodeAt(way.geometry[i].lon, way.geometry[i].lat);
      if (current === previous) continue;
      const weight = haversineMeters(coords[previous], coords[current]);
      adjacency[previous].push({ to: current, weight, way: wayIndex });
      adjacency[current].push({ to: previous, weight, way: wayIndex });
      segments.push({ a: previous, b: current, way: wayIndex });
      previous = current;
    }
  });

  return { coords, adjacency, segments, ways };
}

/**
 * A lookup grid over segments, so snapping a camera to the network scans a
 * handful of them rather than several million.
 */
function segmentGrid(graph, cellM = 120) {
  const mLng = 111_320 * Math.cos((46 * Math.PI) / 180);
  const grid = new Map();
  const put = (x, y, i) => {
    const k = `${x}|${y}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  };
  graph.segments.forEach((segment, i) => {
    const a = graph.coords[segment.a];
    const b = graph.coords[segment.b];
    const x1 = Math.floor((Math.min(a[0], b[0]) * mLng) / cellM);
    const x2 = Math.floor((Math.max(a[0], b[0]) * mLng) / cellM);
    const y1 = Math.floor((Math.min(a[1], b[1]) * 110_574) / cellM);
    const y2 = Math.floor((Math.max(a[1], b[1]) * 110_574) / cellM);
    // Long rural segments span many cells; registering every cell of the
    // bounding box keeps the scan below correct rather than nearly correct.
    for (let x = x1; x <= x2; x++) for (let y = y1; y <= y2; y++) put(x, y, i);
  });
  return {
    cellM,
    mLng,
    near(point) {
      const gx = Math.floor((point[0] * mLng) / cellM);
      const gy = Math.floor((point[1] * 110_574) / cellM);
      const out = [];
      for (let dx = -2; dx <= 2; dx++) {
        for (let dy = -2; dy <= 2; dy++) out.push(...(grid.get(`${gx + dx}|${gy + dy}`) ?? []));
      }
      return out;
    },
  };
}

/** The point on segment a–b nearest `point`, and how far away it is. */
function projectOnSegment(point, a, b) {
  const mx = 111_320 * Math.cos((point[1] * Math.PI) / 180);
  const my = 110_574;
  const ax = a[0] * mx;
  const ay = a[1] * my;
  const vx = b[0] * mx - ax;
  const vy = b[1] * my - ay;
  const lenSq = vx * vx + vy * vy;
  const t =
    lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((point[0] * mx - ax) * vx + (point[1] * my - ay) * vy) / lenSq));
  const at = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  return { at, t, distance: haversineMeters(point, at) };
}

/**
 * Put a reader location onto the network.
 *
 * The camera almost never sits on an OpenStreetMap node — it sits beside the
 * road, somewhere along a segment — so the nearest point on the nearest segment
 * becomes a vertex of its own, joined to the two ends of that segment. Snapping
 * to the nearest existing node instead would drag a route up to a junction that
 * can be several hundred metres away on a straight rural road, and the drawn
 * link would start somewhere the camera is not.
 */
function attach(graph, grid, point) {
  let best = null;
  for (const i of grid.near(point)) {
    const segment = graph.segments[i];
    const hit = projectOnSegment(point, graph.coords[segment.a], graph.coords[segment.b]);
    if (!best || hit.distance < best.distance) best = { ...hit, segment };
  }
  if (!best || best.distance > SNAP_M) return null;

  const id = graph.coords.length;
  graph.coords.push(best.at);
  graph.adjacency.push([]);
  for (const end of [best.segment.a, best.segment.b]) {
    const weight = haversineMeters(best.at, graph.coords[end]);
    graph.adjacency[id].push({ to: end, weight, way: best.segment.way });
    graph.adjacency[end].push({ to: id, weight, way: best.segment.way });
  }
  return { id, snapM: best.distance };
}

/* ------------------------------------------------------------------ *
 * Routing
 * ------------------------------------------------------------------ */

/** A binary min-heap of [distance, node]. */
class Heap {
  constructor() {
    this.items = [];
  }
  push(distance, node) {
    const items = this.items;
    items.push([distance, node]);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent][0] <= items[i][0]) break;
      [items[parent], items[i]] = [items[i], items[parent]];
      i = parent;
    }
  }
  pop() {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (items.length) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let smallest = i;
        if (left < items.length && items[left][0] < items[smallest][0]) smallest = left;
        if (right < items.length && items[right][0] < items[smallest][0]) smallest = right;
        if (smallest === i) break;
        [items[smallest], items[i]] = [items[i], items[smallest]];
        i = smallest;
      }
    }
    return top;
  }
  get size() {
    return this.items.length;
  }
}

/**
 * Shortest road route between two vertices, or null if there is none inside
 * `capM`.
 *
 * Plain Dijkstra with a distance ceiling, which for the distances here — half
 * of all links are under half a mile — settles faster than the bookkeeping of
 * anything cleverer. The state arrays are allocated once by the caller and
 * reused across all 800 routes, stamped with a run number rather than cleared,
 * because zeroing a million-element array per pair costs more than the search.
 */
function route(graph, state, from, to, capM) {
  const { dist, prev, prevWay, stamp } = state;
  const run = ++state.run;
  const heap = new Heap();
  dist[from] = 0;
  prev[from] = -1;
  stamp[from] = run;
  heap.push(0, from);

  while (heap.size) {
    const [d, node] = heap.pop();
    if (d > dist[node] && stamp[node] === run) continue;
    if (node === to) break;
    if (d > capM) return null;
    for (const edge of graph.adjacency[node]) {
      const next = d + edge.weight;
      if (next > capM) continue;
      if (stamp[edge.to] === run && dist[edge.to] <= next) continue;
      stamp[edge.to] = run;
      dist[edge.to] = next;
      prev[edge.to] = node;
      prevWay[edge.to] = edge.way;
      heap.push(next, edge.to);
    }
  }

  if (stamp[to] !== run || !Number.isFinite(dist[to])) return null;

  const nodes = [];
  const ways = [];
  for (let node = to; node !== -1; node = prev[node]) {
    nodes.push(node);
    if (node !== from) ways.push(prevWay[node]);
    if (node === from) break;
  }
  nodes.reverse();
  ways.reverse();
  if (nodes[0] !== from) return null;
  return { nodes, ways, meters: dist[to] };
}

/* ------------------------------------------------------------------ *
 * Build
 * ------------------------------------------------------------------ */

async function main() {
  const { cameras, metadata } = await loadCameras();
  const sites = toSites(cameras);
  log('corridors', `read ${cameras.length} cameras standing at ${sites.length} locations`);

  const { pairs, alone } = nearestPairs(sites);
  log(
    'corridors',
    `${pairs.length} nearest-neighbour pairs to route; ` +
      `${alone} locations have no other reader within ${metersToMiles(LINK_M)} miles`,
  );
  if (!pairs.length) throw new Error('no camera location has a neighbour to link to');

  const tiles = tilesFor(pairs, sites);
  log('corridors', `road network covers ${tiles.length} tiles (~${Math.round(tiles.length * 5.1)} km²)`);

  const ways = [];
  for (let i = 0; i < tiles.length; i += TILE_BATCH) {
    const batch = tiles.slice(i, i + TILE_BATCH);
    log('corridors', `tiles ${i + 1}–${i + batch.length} of ${tiles.length}`);
    const data = await fetchTileBatch('corridors', batch);
    for (const element of (data.elements ?? []).filter(isDrivable)) ways.push(element);
  }

  // Tiles overlap at their edges and a way crossing a boundary comes back from
  // both, so the same way arrives more than once. Keeping both copies would
  // double the graph without changing a single route.
  const unique = new Map();
  for (const way of ways) unique.set(way.id, way);
  const roads = [...unique.values()];
  log('corridors', `${roads.length} drivable ways in the network`);
  if (!roads.length) {
    throw new Error('Overpass returned no drivable roads; refusing to overwrite the layer');
  }

  const graph = buildGraph(roads);
  log('corridors', `graph holds ${graph.coords.length} vertices and ${graph.segments.length} segments`);
  const grid = segmentGrid(graph);

  // Attach every location that a pair uses, before the state arrays are sized:
  // attaching adds vertices to the graph.
  const attached = new Map();
  let unsnapped = 0;
  for (const pair of pairs) {
    for (const index of [pair.a, pair.b]) {
      if (attached.has(index)) continue;
      const hit = attach(graph, grid, sites[index].point);
      if (!hit) {
        unsnapped++;
        attached.set(index, null);
        continue;
      }
      attached.set(index, hit);
    }
  }
  log(
    'corridors',
    `${[...attached.values()].filter(Boolean).length} locations sit within ${SNAP_M} m of a drivable road; ` +
      `${unsnapped} do not`,
  );

  const size = graph.coords.length;
  const state = {
    dist: new Float64Array(size),
    prev: new Int32Array(size),
    prevWay: new Int32Array(size),
    stamp: new Int32Array(size),
    run: 0,
  };

  const counties = await loadCounties();
  const features = [];
  let noRoute = 0;
  let tooCrooked = 0;
  const lengths = [];

  for (const pair of pairs) {
    const from = attached.get(pair.a);
    const to = attached.get(pair.b);
    if (!from || !to) continue;

    const capM = Math.min(LINK_M, Math.max(pair.straightM * DETOUR_RATIO, DETOUR_FLOOR_M));
    const found = route(graph, state, from.id, to.id, capM);
    if (!found) {
      // Which limit it hit is worth telling apart, so the known gaps can say
      // which: a pair with no road between them at all is a hole in the mapped
      // network, and a pair whose only road is three times the straight line is
      // a river. Re-running at the ceiling is the only way to know — `route`
      // never returns anything longer than the cap it was given, so a failure
      // at `capM` cannot say on its own why it failed.
      if (route(graph, state, from.id, to.id, LINK_M)) tooCrooked++;
      else noRoute++;
      continue;
    }

    const line = found.nodes.map((n) => graph.coords[n]);
    lengths.push(found.meters);

    // Which roads the link runs along, longest first. Weighted by how much of
    // the route each carries, so a street the link merely crosses at a junction
    // does not get named alongside the one it follows for a mile.
    const byIdentity = new Map();
    for (let i = 0; i < found.ways.length; i++) {
      const identity = identityOf(graph.ways[found.ways[i]]?.tags ?? {});
      if (!identity) continue;
      const metres = haversineMeters(line[i], line[i + 1]);
      byIdentity.set(identity, (byIdentity.get(identity) ?? 0) + metres);
    }
    const along = [...byIdentity.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
    const primaryWay = graph.ways[found.ways[Math.floor(found.ways.length / 2)]];
    const roadClass = primaryWay?.tags?.highway ?? null;

    const a = sites[pair.a];
    const b = sites[pair.b];
    const midpoint = line[Math.floor(line.length / 2)];
    const county = findContaining(midpoint, counties.features);
    const operators = [...new Set([...a.operators, ...b.operators])].sort();

    const name = along.length
      ? along.slice(0, 2).join(' → ')
      : `Unnamed road near ${county?.properties.name ?? STATE_USPS}`;

    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: line },
      properties: {
        id: slugId('alpr-link', String(pair.a), String(pair.b)),
        layer: 'alpr_corridor',
        name,
        county: county?.properties.name ?? null,
        state: STATE_USPS,
        countyFips: county?.properties.geoid ?? null,
        // Inherited from the cameras: a link is exactly as trustworthy as the
        // crowd-sourced records at its two ends.
        confidence: 'probabilistic',
        sourceDate: null,
        attributes: {
          kind: 'link',
          roadsAlong: along.length ? along.join('; ') : null,
          roadClass,
          readerCount: a.readers + b.readers,
          // The two numbers the browser needs to draw this growing: how long
          // the drive is, and how far apart the readers actually stand.
          linkMiles: round(found.meters, 2),
          straightMiles: round(pair.straightM, 2),
          // Reader locations along the link, in miles from its start — the same
          // series the spacing diagram in the detail panel reads.
          siteOffsets: `0.00;${round(found.meters, 2).toFixed(2)}`,
          siteReaders: `${a.readers};${b.readers}`,
          // The link's two ends, so the browser can join links that share one
          // into a network. Six decimals is about 11 cm, far finer than
          // anything this layer claims.
          siteLngs: `${line[0][0].toFixed(6)};${line.at(-1)[0].toFixed(6)}`,
          siteLats: `${line[0][1].toFixed(6)};${line.at(-1)[1].toFixed(6)}`,
          operatorCount: operators.length,
          operators: operators.length ? operators.join('; ') : null,
          unattributedReaders: a.unattributed + b.unattributed,
        },
      },
    });
  }

  if (!features.length) throw new Error('no link could be routed; not writing a layer');

  // Longest first, so the record list opens on the strands that cross open
  // country rather than on a thousand city blocks.
  features.sort((a, b) => b.properties.attributes.linkMiles - a.properties.attributes.linkMiles);

  const sorted = [...lengths].sort((x, y) => x - y);
  const median = sorted[Math.floor(sorted.length / 2)];
  const totalReaders = features.reduce((s, f) => s + f.properties.attributes.readerCount, 0);
  const unattributedTotal = features.reduce(
    (s, f) => s + f.properties.attributes.unattributedReaders,
    0,
  );
  log(
    'corridors',
    `${features.length} links drawn; median ${round(median).toFixed(2)} mi, ` +
      `longest ${round(sorted.at(-1)).toFixed(2)} mi`,
  );
  log(
    'corridors',
    `${noRoute} pairs had no route within ${metersToMiles(LINK_M)} miles in the fetched network, ` +
      `${tooCrooked} were more than ${DETOUR_RATIO}× their straight-line distance to drive`,
  );

  /*
   * Refuse to overwrite a fuller layer with a thinner one.
   *
   * Overpass mirrors do not only fail loudly. A run of the corridor build came
   * back HTTP 200 with 4,407 ways where the previous run saw 5,170, which
   * snapped 182 fewer cameras and quietly shipped a smaller network — no error,
   * no warning, just less of Minnesota. A partial answer that looks like a
   * whole one is the failure mode worth guarding, because it is the one nobody
   * notices.
   *
   * The bar is the file already on disk. Growth is always fine; a material
   * shrink means the query, not the state, changed.
   */
  const previous = await readFile(path.join(PUBLIC_DATA, 'alpr-corridors.geojson'), 'utf8')
    .then((raw) => JSON.parse(raw))
    .catch(() => null);
  if (previous?.metadata?.linkModel === 'nearest-neighbour') {
    const before = previous.features?.length ?? 0;
    if (before > 0 && features.length < before * 0.9) {
      throw new Error(
        `refusing to overwrite: ${features.length} links now against ${before} in the file on disk ` +
          `(${Math.round((1 - features.length / before) * 100)}% fewer). Upstream returned a partial ` +
          `answer; re-run rather than shipping a thinner network.`,
      );
    }
  }

  await writeLayer('alpr-corridors', {
    layer: 'alpr_corridor',
    provenance: {
      source: 'Derived from the ALPR layer and OpenStreetMap road geometry (Overpass API)',
      sourceUrl: 'https://deflock.me',
      license: 'ODbL 1.0',
      licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
      attribution: '© OpenStreetMap contributors, ODbL — mapped by DeFlock volunteers',
      sourceDate: metadata.sourceDate ?? null,
      refresh: 'frequent',
      // Read by the guard above, so a file written by the older corridor build
      // is never compared against a file written by this one.
      linkModel: 'nearest-neighbour',
    },
    knownGaps: [
      'Derived, not surveyed. Every limit of the crowd-sourced camera layer applies here and compounds: a link is only as real as the two readers it joins, and a reader nobody has mapped moves every strand around it.',
      `Each reader location is linked to its nearest neighbour and to nothing else. A strand is therefore evidence that these two readers are each other's nearest — or that one chose the other — and never a claim that a driver's route between them is the only watched way, or that no reader stands between them unmapped.`,
      `The line drawn is the shortest route along OpenStreetMap roads between the two readers, so it is a road somebody could drive, not the road a driver would choose. It ignores one-way restrictions, turn bans, traffic and closures, and it may run the wrong way up a street.`,
      `The browser draws each link growing out from both of its readers, as far as the radius reaches, and joins the two only once the radius covers the whole route. Nothing is added there — the geometry at every slider position is a piece of the route surveyed here, cut shorter.`,
      `${alone} reader locations have no other reader within ${metersToMiles(LINK_M)} miles and appear in no link. They remain on the camera layer.`,
      `${unsnapped} reader locations stand more than ${SNAP_M} m from any drivable road OpenStreetMap records, so no route could start from them.`,
      `${noRoute} pairs could not be routed within ${metersToMiles(LINK_M)} miles: either OpenStreetMap holds no connected road between them, or the only road that connects them leaves the ${STRIP_M} m strip around their straight line that this build fetches. ${tooCrooked} more were refused because driving between them takes more than ${DETOUR_RATIO} times their straight-line distance, which is usually a river, a rail yard or a freeway with no crossing. Refusing is deliberate: at that point the line stops describing the pair and starts describing the detour.`,
      `A reader location is one or more cameras within ${SITE_M} m of each other; ${totalReaders} readers stand at the ends of these links. Which way each camera faces is on the camera layer, and this layer does not claim that a trip along a link is read at both of its ends.`,
      `Operator is recorded for only ${totalReaders - unattributedTotal} of those ${totalReaders} readers, so the agencies named on a link are a floor and never the full list. Naming an operator says who is recorded as running a reader, not who can search what it collects — a separate question this layer holds no data on.`,
      'A camera is placed on the drivable road nearest to it, and at a crossroads that margin can be a couple of metres. A reader aimed along one street can be attached to the one it crosses, which moves the first few metres of its strand.',
      'Distances are measured along the routed road, not along the reader’s own street: a link of one mile is a mile of driving between two cameras, which is longer than the mile between them on the map.',
    ],
    features,
  });
}

main().catch((err) => {
  console.error(`[corridors] FAILED: ${err.message}`);
  process.exit(1);
});

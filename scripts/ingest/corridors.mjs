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
 * Two reader locations are linked when no third reader stands between them —
 * formally, when no other location falls inside the circle drawn with the two
 * of them at its ends. That is the Gabriel graph, and it is chosen because it
 * needs no parameter to be argued over: the data decides which readers are
 * neighbours, not a radius somebody picked. It also cannot draw the line that
 * would be a lie — a strand from A to C past a reader at B, asserting a
 * directness the ground does not have.
 *
 * This replaces linking each reader to its single nearest neighbour, which drew
 * a line from A to B and none from B to A's other side, and so left two readers
 * three blocks apart unjoined whenever each had something marginally closer.
 * Every link the older model drew survives here: nearest-neighbour is a subset
 * of the Gabriel graph, so this fills gaps in and removes nothing.
 *
 * The routing is asked of a public OSRM instance rather than done here, and
 * that is a deliberate reversal. This build used to pull the drivable network
 * for every tile the pairs occupied — about 6,400 km² of Minnesota — and run
 * its own Dijkstra over it. It fetched the whole haystack to find 803 needles:
 * the median link is half a mile, and 125 back-to-back Overpass queries for
 * residential street networks is more than a volunteer-run mirror advertises.
 * It answered with 502s and 504s, and reached tile 360 of 1,245 in 80 minutes.
 *
 * Asking a router for a route instead takes about thirteen minutes, needs no
 * key, and is a better answer as well as a faster one: OSRM's car profile
 * honours one-way streets and turn restrictions, which the graph built here
 * never did. What it does not return is the OpenStreetMap `highway` class of
 * the roads it used, so this layer no longer carries one — see `roadsAlong`.
 *
 * The layer is drawn whole and never grown. It used to ship every route in full
 * and let a slider in the browser cut each one back to a reach, which meant
 * re-uploading the entire layer on every frame of a drag and shipping road
 * geometry that, at the slider's opening position, over half the links never
 * showed. Both are gone: a link is here only if it is short enough to draw, and
 * what is written is exactly what is drawn. See `STATIC_MILES`.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { writeLayer, log, loadCounties, slugId, PUBLIC_DATA, RAW_DIR } from './lib/util.mjs';
import { findContaining, haversineMeters, metersToMiles } from '../../src/lib/geo.mjs';

// No state filter here, unlike the other ingests: the pairs are found from the
// cameras themselves and each route is asked for by coordinate, so where the
// cameras are is the whole of what decides where this layer is.
const STATE_USPS = process.env.STATE_USPS ?? 'MN';

const MILE = 1609.344;

/**
 * Two cameras closer than this are one location — a single gantry or pole pair
 * covering both directions of travel. Kept distinct from the reader count
 * because "16 readers" and "8 places you drive past" are different facts and
 * conflating them would overstate how often a given trip is seen.
 */
const SITE_M = 75;

/**
 * How far from a road a camera may stand and still be placed on it.
 *
 * OSRM snaps each end of a route to the nearest drivable way and reports how
 * far it moved. Beyond this the route would start somewhere the camera is not,
 * so the pair is dropped and counted rather than drawn from the wrong place.
 */
const SNAP_M = 60;

/**
 * The furthest a neighbour may be and still be linked, measured along the road.
 *
 * A mile and a half is a claim a reader can hold in their head — roughly five
 * minutes of city driving — and every strand on the map now means the same
 * thing, which is what the slider it replaces could never say. There is no
 * second number: what is written here is what is drawn.
 *
 * It is a real editorial choice and it does cut things off. A rural reader
 * whose nearest neighbour is the next town over now appears in no link at all,
 * where the old ceiling of ten miles would draw a strand across open country.
 * That link was true, but at ten miles the line stopped describing a trip and
 * started describing a distance, and the count of unlinked readers below says
 * plainly how many the choice drops.
 */
const STATIC_MILES = 1.5;
const LINK_M = STATIC_MILES * MILE;

/**
 * How far the drawn line may sit from the route the router actually returned.
 *
 * OSRM answers with every OpenStreetMap node along the way, which is a level of
 * curve detail no zoom on this map resolves: five metres of tolerance removes
 * about four vertices in five and cannot be seen. The file is what the browser
 * parses on load, so this is the difference between a layer that costs a moment
 * and one that costs a wait.
 */
const SIMPLIFY_M = 5;

/**
 * How many phase bands the pulse animation is cut into.
 *
 * Links are banded by how far they sit from the middle of their own network, so
 * the pulse leaves the centre of a cluster and travels outwards. Six is enough
 * for the movement to read as travelling rather than blinking, and few enough
 * that the browser animates the whole state with six paint updates a frame.
 */
const PHASE_BANDS = 6;

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
 * Public OSRM instances, in the order they are tried.
 *
 * The first is the OpenStreetMap Foundation's own, run by FOSSGIS; the second
 * is the OSRM project's demo server. Both are free, keyless and ODbL, and both
 * are somebody else's electricity — hence the pause below and the cache beside
 * it. A run that has already asked a question never asks it twice.
 */
const OSRM_HOSTS = [
  'https://routing.openstreetmap.de/routed-car',
  'https://router.project-osrm.org',
];

/**
 * How long to wait between routes.
 *
 * A route is a cheap question — about 200 ms — so this is not about pacing
 * ourselves to the server's capacity the way the old Overpass build had to be.
 * It is about not arriving as a flood: 803 requests spread over four minutes
 * looks like a person using a website, and it costs the build nothing that
 * matters.
 */
const POLITE_MS = 120;

/** Where routes are kept, so a second run costs nobody anything. */
const CACHE_FILE = path.join(RAW_DIR, 'corridor-routes.json');

const round = (m, dp = 2) => Number(metersToMiles(m).toFixed(dp));

/**
 * The identity of a road: its route number where it has one, its name
 * otherwise. `ref` can carry several values ("US 12;MN 7"); the first is the
 * one the road is signed as.
 */
function identityOf(step) {
  const ref = (step.ref ?? '').split(';')[0].trim();
  if (ref) return ref;
  const name = (step.name ?? '').trim();
  return name || null;
}

const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  const grid = new Map();
  cameras.forEach((camera, i) => {
    const k = `${Math.floor((camera.point[0] * mLng) / SITE_M)}|${Math.floor((camera.point[1] * 110_574) / SITE_M)}`;
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
 * How many near locations each site is tested against.
 *
 * The Gabriel test below asks whether any third reader stands between a pair,
 * and a reader far from both cannot be between them. Twenty-four neighbours is
 * comfortably more than the handful that can ever block a pair — no Gabriel
 * edge in this data survives past the eighth — so the window costs nothing in
 * accuracy and turns an all-pairs sweep into a local one.
 */
const CANDIDATES = 24;

/**
 * Pairs of reader locations with no third reader standing between them.
 *
 * This is the Gabriel graph: A and B are linked when no other location falls
 * inside the circle that has A and B at opposite ends of its diameter. Read on
 * the ground it is the sentence "these two are each other's neighbours and
 * there is nothing in between", which is what a strand on this map should mean
 * and what a nearest-neighbour link could not say.
 *
 * It needs no threshold, which is the point — nothing here decides for the
 * reader what counts as close. The one number that does apply, `LINK_M`, is not
 * part of the test: it drops pairs already too far apart to draw, after the
 * geometry has spoken. Straight-line distance is a floor on the driven
 * distance, so a pair refused here could never have come back under the limit
 * by road, and nothing true is lost by refusing it before routing it.
 */
function gabrielPairs(sites) {
  const mLng = 111_320 * Math.cos((46 * Math.PI) / 180);
  // Flat metres. Over the longest span this layer draws, the error against the
  // haversine below is centimetres, and it is only ever used to rank and to
  // decide what is inside a circle.
  const flat = sites.map((s) => [s.point[0] * mLng, s.point[1] * 110_574]);
  const d2 = (i, j) => (flat[i][0] - flat[j][0]) ** 2 + (flat[i][1] - flat[j][1]) ** 2;

  const cell = 2_000;
  const grid = new Map();
  const cellOf = (i) => `${Math.floor(flat[i][0] / cell)}|${Math.floor(flat[i][1] / cell)}`;
  sites.forEach((_, i) => {
    const k = cellOf(i);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  });

  // Widen the ring until enough neighbours are in hand, so a downtown reads one
  // cell and a reader alone in a county reads as many as it has to.
  const near = sites.map((_, i) => {
    const gx = Math.floor(flat[i][0] / cell);
    const gy = Math.floor(flat[i][1] / cell);
    for (let r = 1; r <= 16; r++) {
      const found = [];
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          for (const j of grid.get(`${gx + dx}|${gy + dy}`) ?? []) if (j !== i) found.push(j);
        }
      }
      if (found.length >= CANDIDATES || r === 16) {
        return found.sort((a, b) => d2(i, a) - d2(i, b)).slice(0, CANDIDATES);
      }
    }
    return [];
  });

  const pairs = new Map();
  const linked = new Set();
  sites.forEach((site, i) => {
    for (const j of near[i]) {
      const key = i < j ? `${i}|${j}` : `${j}|${i}`;
      if (pairs.has(key)) continue;
      const straightM = haversineMeters(site.point, sites[j].point);
      if (straightM > LINK_M) continue;

      // Anything that could stand between them is a near neighbour of one end
      // or the other, so the two candidate windows together are the whole of
      // the question.
      const mx = (flat[i][0] + flat[j][0]) / 2;
      const my = (flat[i][1] + flat[j][1]) / 2;
      const r2 = d2(i, j) / 4;
      let between = false;
      for (const c of new Set([...near[i], ...near[j]])) {
        if (c === i || c === j) continue;
        if ((flat[c][0] - mx) ** 2 + (flat[c][1] - my) ** 2 < r2) {
          between = true;
          break;
        }
      }
      if (between) continue;

      pairs.set(key, { a: Math.min(i, j), b: Math.max(i, j), straightM });
      linked.add(i).add(j);
    }
  });

  return { pairs: [...pairs.values()], alone: sites.length - linked.size };
}

/**
 * Drop the vertices a reader could not see, by Douglas–Peucker.
 *
 * Iterative rather than recursive: a route can carry a couple of thousand
 * points and a stack is cheaper than trusting the interpreter's.
 */
function simplify(coords, toleranceM) {
  if (coords.length < 3) return coords;
  const mLng = 111_320 * Math.cos((46 * Math.PI) / 180);
  const flat = coords.map(([lng, lat]) => [lng * mLng, lat * 110_574]);
  const perp = (p, a, b) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = dx * dx + dy * dy;
    if (!len) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  };

  const keep = new Set([0, coords.length - 1]);
  const stack = [[0, coords.length - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop();
    let worst = toleranceM;
    let at = -1;
    for (let k = lo + 1; k < hi; k++) {
      const e = perp(flat[k], flat[lo], flat[hi]);
      if (e > worst) {
        worst = e;
        at = k;
      }
    }
    if (at > 0) {
      keep.add(at);
      stack.push([lo, at], [at, hi]);
    }
  }

  // Five decimal places is about a metre, finer than the tolerance above and
  // finer than anything a crowd-sourced camera position claims.
  return [...keep]
    .sort((x, y) => x - y)
    .map((k) => [Number(coords[k][0].toFixed(5)), Number(coords[k][1].toFixed(5))]);
}

/* ------------------------------------------------------------------ *
 * Routing
 * ------------------------------------------------------------------ */

/**
 * The road between two points, as a public OSRM instance drives it.
 *
 * Returns the route geometry, its length, the steps it is made of and how far
 * each end had to move to reach a drivable way. A refusal — no road between
 * them, or nothing to snap to — comes back as a code rather than an exception,
 * because a pair that cannot be routed is data about the network and not a
 * failure of the build.
 */
async function fetchRoute(a, b) {
  const query =
    `/route/v1/driving/${a[0]},${a[1]};${b[0]},${b[1]}` +
    `?overview=full&geometries=geojson&steps=true`;

  let lastError = null;
  for (const host of OSRM_HOSTS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(host + query, { signal: AbortSignal.timeout(30_000) });
        // A 4xx is the router telling us something about this pair and will say
        // the same thing however many times it is asked; a 5xx is the service
        // having a moment and is worth another go.
        if (response.status >= 500) throw new Error(`HTTP ${response.status}`);
        const body = await response.json();
        if (body.code && body.code !== 'Ok') return { code: body.code };
        const route = body.routes?.[0];
        if (!route) return { code: 'NoRoute' };
        return {
          code: 'Ok',
          meters: route.distance,
          coordinates: route.geometry.coordinates,
          steps: route.legs?.flatMap((leg) => leg.steps ?? []) ?? [],
          snapM: (body.waypoints ?? []).map((w) => w.distance ?? 0),
        };
      } catch (err) {
        lastError = err;
        await sleep(1_000 * 2 ** attempt);
      }
    }
    log('corridors', `  ${new URL(host).host} unreachable (${lastError?.message}); trying the next`);
  }
  throw new Error(`no OSRM instance answered: ${lastError?.message}`);
}

/** Routes already fetched, keyed by the two coordinates asked about. */
async function loadCache() {
  return readFile(CACHE_FILE, 'utf8')
    .then((raw) => new Map(Object.entries(JSON.parse(raw))))
    .catch(() => new Map());
}

async function saveCache(cache) {
  await mkdir(RAW_DIR, { recursive: true });
  await writeFile(CACHE_FILE, JSON.stringify(Object.fromEntries(cache)));
}

/* ------------------------------------------------------------------ *
 * Build
 * ------------------------------------------------------------------ */

async function main() {
  const { cameras, metadata } = await loadCameras();
  const sites = toSites(cameras);
  log('corridors', `read ${cameras.length} cameras standing at ${sites.length} locations`);

  const { pairs, alone } = gabrielPairs(sites);
  log(
    'corridors',
    `${pairs.length} Gabriel pairs within ${STATIC_MILES} miles to route; ` +
      `${alone} locations have no neighbour that close`,
  );
  if (!pairs.length) throw new Error('no camera location has a neighbour to link to');

  const cache = await loadCache();
  const cachedAtStart = cache.size;

  const counties = await loadCounties();
  const features = [];
  /** The two site indices behind each feature, for the network pass below. */
  const endsOf = [];
  let noRoute = 0;
  let tooCrooked = 0;
  let tooFar = 0;
  let unsnapped = 0;
  let vertexCount = 0;
  let keptVertices = 0;
  const lengths = [];

  for (const [index, pair] of pairs.entries()) {
    const a = sites[pair.a];
    const b = sites[pair.b];
    const key = `${a.point[0].toFixed(6)},${a.point[1].toFixed(6)};${b.point[0].toFixed(6)},${b.point[1].toFixed(6)}`;

    let result = cache.get(key);
    if (!result) {
      result = await fetchRoute(a.point, b.point);
      cache.set(key, result);
      await sleep(POLITE_MS);
      if (index % 50 === 0) await saveCache(cache);
      if (index % 100 === 0) {
        log('corridors', `routed ${index + 1} of ${pairs.length}`);
      }
    }

    if (result.code !== 'Ok') {
      noRoute++;
      continue;
    }
    // Both ends have to be on a road the router recognises. OSRM will happily
    // snap a camera half a kilometre across a field to the nearest highway and
    // report a perfectly good route from there, which would draw a link
    // starting somewhere no camera stands.
    if (result.snapM.some((d) => d > SNAP_M)) {
      unsnapped++;
      continue;
    }
    if (result.meters > LINK_M) {
      tooFar++;
      continue;
    }
    if (result.meters > Math.max(pair.straightM * DETOUR_RATIO, DETOUR_FLOOR_M)) {
      tooCrooked++;
      continue;
    }

    const line = simplify(result.coordinates, SIMPLIFY_M);
    if (!Array.isArray(line) || line.length < 2) {
      noRoute++;
      continue;
    }
    lengths.push(result.meters);
    vertexCount += result.coordinates.length;
    keptVertices += line.length;

    // Which roads the link runs along, longest first. Weighted by how much of
    // the route each carries, so a street the link merely crosses at a junction
    // does not get named alongside the one it follows for a mile.
    const byIdentity = new Map();
    for (const step of result.steps) {
      const identity = identityOf(step);
      if (!identity) continue;
      byIdentity.set(identity, (byIdentity.get(identity) ?? 0) + (step.distance ?? 0));
    }
    const along = [...byIdentity.entries()].sort((x, y) => y[1] - x[1]).map(([id]) => id);

    const midpoint = line[Math.floor(line.length / 2)];
    const county = findContaining(midpoint, counties.features);
    const operators = [...new Set([...a.operators, ...b.operators])].sort();

    const name = along.length
      ? along.slice(0, 2).join(' → ')
      : `Unnamed road near ${county?.properties.name ?? STATE_USPS}`;

    endsOf.push([pair.a, pair.b]);
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
          // Named from the router's own driving instructions. There is no
          // road *class* here: OSRM reports the roads it used but not their
          // OpenStreetMap `highway` tag, and guessing a class from a road's
          // name would be inventing a field, which this project does not do.
          roadsAlong: along.length ? along.join('; ') : null,
          readerCount: a.readers + b.readers,
          // How long the drive is, and how far apart the readers actually
          // stand. The gap between the two is the shape of the street grid.
          linkMiles: round(result.meters, 2),
          straightMiles: round(pair.straightM, 2),
          // Reader locations along the link, in miles from its start — the same
          // series the spacing diagram in the detail panel reads.
          siteOffsets: `0.00;${round(result.meters, 2).toFixed(2)}`,
          siteReaders: `${a.readers};${b.readers}`,
          // Filled in by the pass below, once every surviving link is known:
          // how many reader locations this link's network joins, and which of
          // the pulse's phase bands it belongs to.
          connectedSites: 0,
          phase: 0,
          operatorCount: operators.length,
          operators: operators.length ? operators.join('; ') : null,
          unattributedReaders: a.unattributed + b.unattributed,
        },
      },
    });
  }

  await saveCache(cache);
  log('corridors', `${cache.size - cachedAtStart} routes fetched, ${cachedAtStart} read from cache`);

  if (!features.length) throw new Error('no link could be routed; not writing a layer');

  /*
   * Networks, and the order the pulse travels in.
   *
   * Two reader locations are in the same network when a chain of links runs
   * between them. The browser used to work this out on every frame of a slider
   * drag, because which links existed changed as the radius moved; nothing
   * moves now, so it is settled once, here.
   *
   * The phase band is what makes the animation read as a ripple rather than a
   * blink. Each link is ranked by how far it sits from the middle of its own
   * network and cut into `PHASE_BANDS` bands, so the pulse leaves the centre of
   * a cluster and travels out to its edges. It is a drawing order and nothing
   * more — no claim is made that a network has a centre, or that anything
   * travels between these readers in this direction or at all.
   */
  const parent = new Map();
  const find = (x) => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root);
    while (parent.get(x) !== root) {
      const next = parent.get(x);
      parent.set(x, root);
      x = next;
    }
    return root;
  };
  for (const [a, b] of endsOf) {
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  const members = new Map();
  for (const key of parent.keys()) {
    const root = find(key);
    if (!members.has(root)) members.set(root, []);
    members.get(root).push(key);
  }
  const centre = new Map();
  for (const [root, group] of members) {
    centre.set(root, [
      mean(group.map((i) => sites[i].point[0])),
      mean(group.map((i) => sites[i].point[1])),
    ]);
  }

  // Rank within each network, so a two-link pocket bands as fully as the metro
  // does and the pulse crosses both in the same time.
  const byNetwork = new Map();
  endsOf.forEach(([a, b], i) => {
    const root = find(a);
    const from = haversineMeters(centre.get(root), [
      (sites[a].point[0] + sites[b].point[0]) / 2,
      (sites[a].point[1] + sites[b].point[1]) / 2,
    ]);
    if (!byNetwork.has(root)) byNetwork.set(root, []);
    byNetwork.get(root).push({ i, from });
  });
  for (const [root, group] of byNetwork) {
    group.sort((x, y) => x.from - y.from);
    group.forEach(({ i }, rank) => {
      features[i].properties.attributes.connectedSites = members.get(root).length;
      features[i].properties.attributes.phase = Math.min(
        PHASE_BANDS - 1,
        Math.floor((rank / group.length) * PHASE_BANDS),
      );
    });
  }

  const networkSizes = [...members.values()].map((g) => g.length).sort((x, y) => y - x);
  log(
    'corridors',
    `${members.size} networks; largest joins ${networkSizes[0]} reader locations, ` +
      `${networkSizes.filter((n) => n === 2).length} are a single pair`,
  );
  log(
    'corridors',
    `geometry simplified at ${SIMPLIFY_M} m: ${vertexCount} vertices to ${keptVertices} ` +
      `(${Math.round((1 - keptVertices / vertexCount) * 100)}% fewer)`,
  );

  // Longest first, so the record list opens on the strands that cross open
  // country rather than on a thousand city blocks.
  features.sort((x, y) => y.properties.attributes.linkMiles - x.properties.attributes.linkMiles);

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
    `${noRoute} pairs had no road route, ${unsnapped} stood too far from a drivable road, ` +
      `${tooFar} were over ${metersToMiles(LINK_M)} miles by road, ` +
      `${tooCrooked} were more than ${DETOUR_RATIO}× their straight-line distance to drive`,
  );

  /*
   * Refuse to overwrite a fuller layer with a thinner one.
   *
   * Upstream does not only fail loudly. A run of the old corridor build came
   * back HTTP 200 with 4,407 ways where the previous run saw 5,170, which
   * snapped 182 fewer cameras and quietly shipped a smaller network — no error,
   * no warning, just less of Minnesota. A partial answer that looks like a
   * whole one is the failure mode worth guarding, because it is the one nobody
   * notices, and a router can do the same thing by declining a run of pairs.
   *
   * The bar is the file already on disk. Growth is always fine; a material
   * shrink means the answers, not the state, changed.
   */
  const previous = await readFile(path.join(PUBLIC_DATA, 'alpr-corridors.geojson'), 'utf8')
    .then((raw) => JSON.parse(raw))
    .catch(() => null);
  if (previous?.metadata?.linkModel === 'gabriel-static') {
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
      source:
        'Derived from the ALPR layer; roads routed by OSRM over OpenStreetMap (FOSSGIS/OSRM public instances)',
      sourceUrl: 'https://deflock.me',
      license: 'ODbL 1.0',
      licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
      attribution: '© OpenStreetMap contributors, ODbL — mapped by DeFlock volunteers, routed with OSRM',
      sourceDate: metadata.sourceDate ?? null,
      refresh: 'frequent',
      // Read by the guard above, so a file written by an older corridor build
      // is never compared against a file written by this one.
      linkModel: 'gabriel-static',
    },
    knownGaps: [
      'Derived, not surveyed. Every limit of the crowd-sourced camera layer applies here and compounds: a link is only as real as the two readers it joins, and a reader nobody has mapped moves every strand around it.',
      `Two reader locations are linked when no third mapped reader stands between them — no other location falls inside the circle drawn with the two of them at its ends. A strand says that and only that. It is never a claim that a driver's route between them is the only watched way, and "nothing in between" means nothing *mapped* in between: an unmapped reader moves every strand around it.`,
      `Only pairs within ${STATIC_MILES} miles by road are drawn. Readers whose nearest neighbour is further away appear on the camera layer and in no link, so the network thins towards rural Minnesota partly because the readers do and partly because this limit says so. Earlier versions of this layer drew links up to ten miles long; those strands described a distance more than a trip, and they are gone.`,
      `The line is the route a car would drive between the two readers, as OSRM reads OpenStreetMap: it honours one-way streets and turn restrictions, but knows nothing of traffic, closures or roadworks, and it is the shortest such route rather than the one a local would pick.`,
      `Nearest neighbour is decided by distance across the map and the line is then measured along the road, so the two can disagree — a reader across a river is near on the map and far to drive. Where driving takes more than ${DETOUR_RATIO} times the straight-line distance the pair is refused, because at that point the line stops describing the pair and starts describing the detour.`,
      `The line drawn is the route simplified to ${SIMPLIFY_M} m, so it departs from the road by up to that much where the road curves. Nothing is added and no corner is cut that a reader could see at any zoom this map offers; the length quoted for a link is the router's own figure for the full route, not the length of the simplified line.`,
      `The map animates a pulse travelling along the links, outward from the middle of each network. That is a drawing order chosen to make the strands legible and nothing else: it does not say that a network has a centre, that traffic moves this way, or that anything at all travels between these readers. The animation stops for anyone whose system asks for reduced motion, and the map is complete without it.`,
      `This layer records which roads a link follows, from the router's own driving instructions, but not what class of road they are. The router does not report the OpenStreetMap \`highway\` tag, and a road's class is not something to infer from its name, so the field is absent rather than guessed.`,
      `${alone} reader locations have no other reader within ${metersToMiles(LINK_M)} miles and appear in no link. They remain on the camera layer.`,
      `${unsnapped} pairs had an end more than ${SNAP_M} m from any drivable road OpenStreetMap records, so the route would have started somewhere no camera stands. ${noRoute} more could not be routed at all, and ${tooFar} were over ${metersToMiles(LINK_M)} miles by road despite being within that distance across the map.`,
      `A reader location is one or more cameras within ${SITE_M} m of each other; ${totalReaders} readers stand at the ends of these links. Which way each camera faces is on the camera layer, and this layer does not claim that a trip along a link is read at both of its ends.`,
      `Operator is recorded for only ${totalReaders - unattributedTotal} of those ${totalReaders} readers, so the agencies named on a link are a floor and never the full list. Naming an operator says who is recorded as running a reader, not who can search what it collects — a separate question this layer holds no data on.`,
      'Each end of a link is snapped to the drivable road nearest to it, and at a crossroads that margin can be a couple of metres. A reader aimed along one street can be attached to the one it crosses, which moves the first few metres of its strand.',
      'Distances are measured along the routed road, not along the reader’s own street: a link of one mile is a mile of driving between two cameras, which is longer than the mile between them on the map.',
    ],
    features,
  });
}

main().catch((err) => {
  console.error(`[corridors] FAILED: ${err.message}`);
  process.exit(1);
});

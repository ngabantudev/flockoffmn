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
 *
 * ---
 *
 * Two tiers, because one was drawing the wrong picture.
 *
 * The Gabriel test above, capped at a mile and a half, produced 150 separate
 * networks and left 155 reader locations joined to nothing at all. Read on the
 * map that is scatter — a scatter of islands, which is a fair description of
 * neither the cameras nor the driving. It is an artefact of the cap: the
 * cameras of Duluth and the cameras of St Cloud are not unrelated, they are
 * simply further apart than five minutes of city traffic.
 *
 * A fungal mycelium has the same problem and solves it with two kinds of tissue
 * (Fricker, Heaton, Jones & Boddy, *The Mycelium as a Network*, Microbiol
 * Spectr, PMC11687498). Dense local foraging fills a patch with fine hyphae
 * that branch and fuse into loops; long exploratory **cords** then run across
 * dead ground to fuse one patch to the next, and it is the cords that make
 * scattered patches one colony rather than a scatter of colonies.
 *
 * So this layer has both:
 *
 *   - `kind: 'link'` — the Gabriel mesh, unchanged, capped at STATIC_MILES.
 *     Fine, dense, and the tier that carries the finding: this is the ordinary
 *     trip logged repeatedly by the same network.
 *   - `kind: 'cord'` — a minimum spanning tree over those mesh bodies, routed
 *     on real roads with no length cap, so every mapped reader in the state
 *     ends up in one connected body. See `cordTier`.
 *
 * The cords are real routed roads like everything else here — a cord is drawn
 * only where OSRM returns a drivable route between two mapped readers. What a
 * cord is *not* is a claim about a trip. It is the shortest road by which one
 * watched cluster reaches the next, and where that road is ninety miles of
 * interstate, the honest reading of the strand is "these two clusters are on
 * the same road network", not "somebody drives this and is read at both ends".
 * The two tiers are drawn differently and labelled differently for exactly that
 * reason, and `knownGaps` says it again in the file itself.
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

/* ------------------------------------------------------------------ *
 * The cord tier
 * ------------------------------------------------------------------ */

/**
 * How much longer than the straight line a *cord* may be.
 *
 * Looser than the mesh's ratio, and for a reason that is about what the two
 * tiers are for. A mesh link is a claim about a specific trip, so a detour
 * corrupts it. A cord is a claim about reachability — that this cluster and
 * that one are on one road network — and a route that swings wide around a lake
 * to make the connection is still the true answer to that question. It is not
 * unbounded: past four times the straight line the road has stopped being the
 * way between these two clusters and become the way between two others.
 */
const CORD_DETOUR_RATIO = 4;

/**
 * Tolerance for a cord's drawn line, five times the mesh's.
 *
 * A cord can be a hundred miles of interstate and OSRM answers with every node
 * on it. At the zooms a cord is legible at — the whole state, a whole region —
 * twenty-five metres is a third of a pixel, and the file is what every reader's
 * browser parses before the map draws anything.
 */
const CORD_SIMPLIFY_M = 25;

/**
 * How many nearby readers outside its own body each reader offers as a cord
 * candidate.
 *
 * The spanning tree wants the shortest road between two bodies, and the sites
 * that could supply it are the ones near the seam between them. Forty is far
 * more than the handful that ever win — no accepted cord in this data comes
 * from past the fourth — and holding a bounded list per site is what keeps this
 * from being an all-pairs table that grows with the square of the survey.
 */
const CORD_NEIGHBOURS = 40;

/**
 * How many routes may be asked for before two bodies are given up on.
 *
 * A pair of bodies separated by something unroutable — a lake with no causeway,
 * a reader stranded in a car park OSRM will not enter — fails the same way for
 * every candidate pair of sites across the seam. Three is enough to get past a
 * single badly placed reader and few enough that a genuinely unreachable body
 * costs three requests rather than forty.
 */
const CORD_TRIES = 3;

/* ------------------------------------------------------------------ *
 * Anastomosis
 * ------------------------------------------------------------------ */

/**
 * Fusion, which is the half of a mycelium a spanning tree cannot express.
 *
 * A tree is a network that branched and never fused, and that is not what a
 * mycelium is. Hyphae meet and join — anastomose — and the loops that makes are
 * the point: they are redundant routes, and a network with them survives having
 * a piece cut out of it where a tree does not (Fricker et al., PMC11687498).
 * With the spanning tree alone every cord on this map was a bridge and the cord
 * tier held exactly zero loops.
 *
 * The rule below is the biology's own. Fusion is a local event: two hyphae fuse
 * where they physically run into each other, not because some global accounting
 * says a loop would be useful. So a second road is drawn between two clusters
 * that are *close on the ground* but *far apart through the network* — they
 * meet, and the network does not know it.
 *
 * It is also the more truthful map, which is the better argument for it. This
 * layer's own limitations admit that a missing cord is never evidence that no
 * road runs between two places; drawing one road per join was what made that
 * caveat necessary. A second real routed road is exactly as real as the first.
 */

/**
 * How much further the network may run than the road, before the two are
 * treated as having met without knowing it.
 *
 * Four times is a large discrepancy on purpose. Two clusters three miles apart
 * whose only connection runs twelve miles round is a network with a hole in it;
 * two whose connection runs five is simply a network. Set this lower and the
 * map fills with near-parallel roads that add a loop on paper and nothing a
 * reader can see.
 */
const FUSE_RATIO = 4;

/**
 * The furthest apart two clusters may be and still be said to have met.
 *
 * Fusion is local, so this is small — and it is also the whole of the
 * performance budget. Every fused cord is more blurred pixels on every frame,
 * and blurred pixels are what this layer pays for; capping the length caps the
 * cost of the whole pass in the only unit that matters.
 */
const FUSE_MAX_M = 12 * MILE;

/**
 * A ceiling on how many fusions are drawn, longest-standing question first.
 *
 * Present so a denser survey cannot quietly turn this pass into hundreds of
 * extra strands and a map that stutters. If it ever binds it is logged and said
 * out loud in `knownGaps` rather than silently truncating the network.
 */
const FUSE_LIMIT = 220;

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
 * Cord candidates
 * ------------------------------------------------------------------ */

/**
 * The seams between mesh bodies: pairs of reader locations in different bodies,
 * shortest first.
 *
 * Only the near ones. A cord runs between the two bodies' closest points, so
 * the sites that can supply one are the sites facing the gap, and each site
 * offers its `CORD_NEIGHBOURS` nearest outsiders. The full table would be every
 * site against every other, which is a number that squares as the survey grows
 * and which is almost entirely pairs on opposite sides of the state.
 *
 * Straight-line distance is the ordering, not the answer: it is a floor on the
 * driven distance and so ranks the seams correctly, and the road that is
 * actually drawn is asked of the router pair by pair as the tree is built.
 */
function cordCandidates(sites, bodyOf) {
  const mLng = 111_320 * Math.cos((46 * Math.PI) / 180);
  const flat = sites.map((s) => [s.point[0] * mLng, s.point[1] * 110_574]);

  const edges = new Map();
  for (let i = 0; i < sites.length; i++) {
    const near = [];
    for (let j = 0; j < sites.length; j++) {
      if (bodyOf[j] === bodyOf[i]) continue;
      near.push([j, (flat[i][0] - flat[j][0]) ** 2 + (flat[i][1] - flat[j][1]) ** 2]);
    }
    near.sort((a, b) => a[1] - b[1]);
    for (const [j] of near.slice(0, CORD_NEIGHBOURS)) {
      const key = i < j ? `${i}|${j}` : `${j}|${i}`;
      if (edges.has(key)) continue;
      edges.set(key, {
        i: Math.min(i, j),
        j: Math.max(i, j),
        straightM: haversineMeters(sites[i].point, sites[j].point),
      });
    }
  }

  return [...edges.values()].sort((a, b) => a.straightM - b.straightM);
}

/**
 * How far apart two reader locations are *through the drawn network*, or null
 * if the answer is further than `bound`.
 *
 * Dijkstra with a ceiling, and the ceiling is the whole point. The fusion pass
 * does not want the distance, it wants to know whether the network already
 * joins these two reasonably — so the search stops the moment it is clear the
 * answer is "no", instead of walking half of Minnesota to find a number that
 * will only be compared against the bound anyway.
 */
function networkDistance(graph, from, to, bound) {
  if (from === to) return 0;
  const best = new Map([[from, 0]]);
  // A pairing of arrays kept in heap order. Small graphs, but this runs
  // thousands of times, and a linear scan for the minimum makes it quadratic.
  const heap = [[0, from]];
  const swap = (i, j) => {
    const t = heap[i];
    heap[i] = heap[j];
    heap[j] = t;
  };
  const push = (d, n) => {
    heap.push([d, n]);
    let i = heap.length - 1;
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (heap[up][0] <= heap[i][0]) break;
      swap(up, i);
      i = up;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let small = i;
        if (l < heap.length && heap[l][0] < heap[small][0]) small = l;
        if (r < heap.length && heap[r][0] < heap[small][0]) small = r;
        if (small === i) break;
        swap(small, i);
        i = small;
      }
    }
    return top;
  };

  while (heap.length) {
    const [d, node] = pop();
    if (d > bound) return null;
    if (node === to) return d;
    if (d > (best.get(node) ?? Infinity)) continue;
    for (const [next, meters] of graph.get(node) ?? []) {
      const through = d + meters;
      if (through > bound) continue;
      if (through < (best.get(next) ?? Infinity)) {
        best.set(next, through);
        push(through, next);
      }
    }
  }
  return null;
}

/**
 * For every strand: the size of the network it sits in, and how much of that
 * network hangs off it alone.
 *
 * Cutting a strand only strands anybody if that strand is a bridge — an edge no
 * loop runs around. Before the fusion pass every cord was one by construction
 * and this could be read off the tree; now the network has loops in it and the
 * question has to be asked properly, of the graph, by Tarjan's low-link test.
 *
 * A strand inside a loop reports zero, and the zero is not a missing value: it
 * says the network can lose this road and lose nothing, which is precisely the
 * redundancy the fusions exist to create.
 */
function bridgeSplits(edges) {
  const adj = new Map();
  edges.forEach(([a, b], e) => {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push([b, e]);
    adj.get(b).push([a, e]);
  });

  const disc = new Map();
  const low = new Map();
  const below = new Map();
  const colony = new Array(edges.length).fill(0);
  const smaller = new Array(edges.length).fill(0);
  const bridgeChild = new Map();
  let clock = 0;

  for (const root of adj.keys()) {
    if (disc.has(root)) continue;
    const seen = [root];
    disc.set(root, clock);
    low.set(root, clock++);
    below.set(root, 1);
    // Iterative, with the adjacency cursor kept on the frame: a metro component
    // is deep enough that recursion is a real risk, and this is the same walk.
    const stack = [[root, -1, 0]];
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const [node, viaEdge] = frame;
      const list = adj.get(node);
      if (frame[2] < list.length) {
        const [next, e] = list[frame[2]++];
        // Compared by edge and not by node, so a second road between the same
        // two readers correctly reads as a loop rather than as the way back.
        if (e === viaEdge) continue;
        if (disc.has(next)) {
          low.set(node, Math.min(low.get(node), disc.get(next)));
        } else {
          seen.push(next);
          disc.set(next, clock);
          low.set(next, clock++);
          below.set(next, 1);
          stack.push([next, e, 0]);
        }
      } else {
        stack.pop();
        if (stack.length) {
          const parentNode = stack[stack.length - 1][0];
          low.set(parentNode, Math.min(low.get(parentNode), low.get(node)));
          below.set(parentNode, below.get(parentNode) + below.get(node));
          if (low.get(node) > disc.get(parentNode)) bridgeChild.set(viaEdge, node);
        }
      }
    }
    for (const node of seen) for (const [, e] of adj.get(node)) colony[e] = seen.length;
  }

  for (const [e, child] of bridgeChild) {
    const hanging = below.get(child);
    smaller[e] = Math.min(hanging, colony[e] - hanging);
  }
  return { colony, smaller };
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
          // Which tier this strand belongs to, in words, because the record
          // list beside the map is the whole of the layer for a reader who
          // cannot see the two line weights that carry it on the canvas.
          tier: 'Neighbourhood link',
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
          // how many reader locations this link's mesh body joins.
          connectedSites: 0,
          // Filled in by the bridge pass below: how many reader locations would
          // be cut off the network if this one strand went. Zero where a loop
          // runs around it, which is most of the mesh and the whole point of a
          // mesh — the Gabriel test draws loops, and a road inside a loop can
          // be lost for nothing.
          bringsInSites: 0,
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
   * Networks.
   *
   * Two reader locations are in the same network when a chain of links runs
   * between them. The browser used to work this out on every frame of a slider
   * drag, because which links existed changed as the radius moved; nothing
   * moves now, so it is settled once, here, and the map reads it as a number.
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

  const byLink = new Map();
  endsOf.forEach(([a], i) => {
    const root = find(a);
    if (!byLink.has(root)) byLink.set(root, []);
    byLink.get(root).push(i);
  });
  for (const [root, group] of members) {
    for (const i of byLink.get(root) ?? []) {
      features[i].properties.attributes.connectedSites = group.length;
    }
  }

  const networkSizes = [...members.values()].map((g) => g.length).sort((x, y) => y - x);
  log(
    'corridors',
    `mesh: ${members.size} bodies; largest joins ${networkSizes[0]} reader locations, ` +
      `${networkSizes.filter((n) => n === 2).length} are a single pair`,
  );

  /*
   * Cords.
   *
   * Every site now belongs to a mesh body — a group reachable through drawn
   * links alone — and a site in no link is a body of one. What follows fuses
   * those bodies into a single colony by adding the shortest road between each
   * pair, cheapest first, exactly as Kruskal builds a spanning tree.
   *
   * Routing happens lazily, inside the loop, and only for an edge that would
   * actually merge two bodies. The candidate list runs to tens of thousands of
   * pairs; the number of roads that have to be asked for is one per body minus
   * one, plus the few that come back unroutable.
   */
  const bodyOf = sites.map((_, i) => (parent.has(i) ? find(i) : i));
  const bodySize = new Map();
  sites.forEach((_, i) => bodySize.set(bodyOf[i], (bodySize.get(bodyOf[i]) ?? 0) + 1));
  log('corridors', `${bodySize.size} mesh bodies to fuse (counting lone readers as a body of one)`);

  const cordEdges = cordCandidates(sites, bodyOf);
  log('corridors', `${cordEdges.length} candidate seams between bodies, shortest first`);

  const cordParent = new Map([...bodySize.keys()].map((r) => [r, r]));
  const cordFind = (x) => {
    let root = x;
    while (cordParent.get(root) !== root) root = cordParent.get(root);
    while (cordParent.get(x) !== root) {
      const next = cordParent.get(x);
      cordParent.set(x, root);
      x = next;
    }
    return root;
  };

  /**
   * Ask the router for one cord, and say whether it may be drawn.
   *
   * Shared by the spanning tree and the fusion pass below, so a fused cord is
   * held to exactly the same standards as a structural one — same snapping,
   * same detour ceiling, same simplification. Returns null and counts the
   * refusal rather than throwing, because a pair that cannot be routed is data
   * about the road network and not a failure of the build.
   */
  const routeCord = async (edge) => {
    const a = sites[edge.i];
    const b = sites[edge.j];
    const key = `${a.point[0].toFixed(6)},${a.point[1].toFixed(6)};${b.point[0].toFixed(6)},${b.point[1].toFixed(6)}`;

    let result = cache.get(key);
    if (!result) {
      result = await fetchRoute(a.point, b.point);
      cache.set(key, result);
      await sleep(POLITE_MS);
      cordRouted++;
      if (cordRouted % 50 === 0) {
        await saveCache(cache);
        log('corridors', `  ${cordRouted} cord routes asked for`);
      }
    }

    if (result.code !== 'Ok') {
      cordNoRoute++;
      return null;
    }
    if (result.snapM.some((d) => d > SNAP_M)) {
      cordUnsnapped++;
      return null;
    }
    if (result.meters > Math.max(edge.straightM * CORD_DETOUR_RATIO, DETOUR_FLOOR_M)) {
      cordCrooked++;
      return null;
    }

    const line = simplify(result.coordinates, CORD_SIMPLIFY_M);
    if (!Array.isArray(line) || line.length < 2) {
      cordNoRoute++;
      return null;
    }
    vertexCount += result.coordinates.length;
    keptVertices += line.length;
    return { result, line };
  };

  /** One cord as a feature. `tier` is what the record list calls it. */
  const makeCord = (edge, { result, line }, tier) => {
    const a = sites[edge.i];
    const b = sites[edge.j];

    // A cord can cross forty named roads. Naming all of them would fill the
    // panel with a turn list nobody asked for, so this keeps the ones the cord
    // actually runs along and says how many it left out.
    const byIdentity = new Map();
    for (const step of result.steps) {
      const identity = identityOf(step);
      if (!identity) continue;
      byIdentity.set(identity, (byIdentity.get(identity) ?? 0) + (step.distance ?? 0));
    }
    const ranked = [...byIdentity.entries()].sort((x, y) => y[1] - x[1]).map(([id]) => id);
    const along = ranked.slice(0, 8);
    const roadsAlong = along.length
      ? along.join('; ') +
        (ranked.length > along.length ? ` (+${ranked.length - along.length} more)` : '')
      : null;

    const midpoint = line[Math.floor(line.length / 2)];
    const county = findContaining(midpoint, counties.features);
    const operators = [...new Set([...a.operators, ...b.operators])].sort();

    return {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: line },
      properties: {
        id: slugId('alpr-cord', String(edge.i), String(edge.j)),
        layer: 'alpr_corridor',
        // Prefixed, and not decoratively. On the canvas the two tiers are told
        // apart by line weight; in the record list beside it they are told
        // apart by this, and the list is the whole layer for a reader using a
        // screen reader.
        name: `Cord — ${(along.length ? along.slice(0, 2) : [county?.properties.name ?? STATE_USPS]).join(' → ')}`,
        county: county?.properties.name ?? null,
        state: STATE_USPS,
        countyFips: county?.properties.geoid ?? null,
        confidence: 'probabilistic',
        sourceDate: null,
        attributes: {
          kind: 'cord',
          tier,
          roadsAlong,
          readerCount: a.readers + b.readers,
          linkMiles: round(result.meters, 2),
          straightMiles: round(edge.straightM, 2),
          siteOffsets: `0.00;${round(result.meters, 2).toFixed(2)}`,
          siteReaders: `${a.readers};${b.readers}`,
          // Both filled in by the bridge pass below.
          connectedSites: 0,
          bringsInSites: 0,
          operatorCount: operators.length,
          operators: operators.length ? operators.join('; ') : null,
          unattributedReaders: a.unattributed + b.unattributed,
        },
      },
    };
  };

  const cordTries = new Map();
  /** `[bodyRootA, bodyRootB]` for each drawn cord, for the split pass below. */
  const cordSeams = [];
  /** `[siteA, siteB]` and length for each cord, for the graph passes below. */
  const cordEnds = [];
  const cordMeters = [];
  const cordFeatures = [];
  let cordNoRoute = 0;
  let cordUnsnapped = 0;
  let cordCrooked = 0;
  let cordRouted = 0;

  for (const edge of cordEdges) {
    const ra = cordFind(bodyOf[edge.i]);
    const rb = cordFind(bodyOf[edge.j]);
    if (ra === rb) continue;
    const seam = ra < rb ? `${ra}|${rb}` : `${rb}|${ra}`;
    const attempts = cordTries.get(seam) ?? 0;
    if (attempts >= CORD_TRIES) continue;
    cordTries.set(seam, attempts + 1);

    const accepted = await routeCord(edge);
    if (!accepted) continue;

    cordParent.set(ra, rb);
    cordSeams.push([bodyOf[edge.i], bodyOf[edge.j]]);
    cordEnds.push([edge.i, edge.j]);
    cordMeters.push(accepted.result.meters);
    cordFeatures.push(makeCord(edge, accepted, 'Connecting cord'));
  }

  await saveCache(cache);

  const colonies = new Set([...bodySize.keys()].map((r) => cordFind(r)));
  log(
    'corridors',
    `${cordFeatures.length} cords drawn from ${cordRouted} routes; ` +
      `${bodySize.size} bodies fused into ${colonies.size}`,
  );
  log(
    'corridors',
    `cords refused: ${cordNoRoute} unroutable, ${cordUnsnapped} with an end off the road network, ` +
      `${cordCrooked} over ${CORD_DETOUR_RATIO}× their straight-line distance to drive`,
  );

  /*
   * Anastomosis.
   *
   * The spanning tree above is a network that branched and never fused, and a
   * mycelium is not that. This pass adds the fusions: a second real road
   * between two clusters that are close on the ground but far apart through the
   * network, which is the condition under which two hyphae have met without the
   * colony knowing it. See `FUSE_RATIO`.
   *
   * The network is rebuilt as it goes, so each fusion is judged against the
   * loops the previous ones already closed. Without that a single hole in the
   * network attracts a dozen near-parallel roads, all of them true, none of
   * them telling a reader anything the first one did not.
   */
  const graph = new Map();
  const addGraphEdge = (a, b, meters) => {
    if (!graph.has(a)) graph.set(a, []);
    if (!graph.has(b)) graph.set(b, []);
    graph.get(a).push([b, meters]);
    graph.get(b).push([a, meters]);
  };
  endsOf.forEach(([a, b], i) => addGraphEdge(a, b, lengths[i]));
  cordEnds.forEach(([a, b], i) => addGraphEdge(a, b, cordMeters[i]));

  const drawnPairs = new Set(
    [...endsOf, ...cordEnds].map(([a, b]) => (a < b ? `${a}|${b}` : `${b}|${a}`)),
  );

  let fused = 0;
  let fuseNotFar = 0;
  let fuseRefused = 0;
  let fuseCapped = 0;

  for (const edge of cordEdges) {
    const key = edge.i < edge.j ? `${edge.i}|${edge.j}` : `${edge.j}|${edge.i}`;
    if (drawnPairs.has(key)) continue;
    if (edge.straightM > FUSE_MAX_M) continue;
    if (fused >= FUSE_LIMIT) {
      fuseCapped++;
      continue;
    }

    // Straight-line distance is a floor on the road, so a network path that is
    // not even FUSE_RATIO times *that* can never clear the bar once the real
    // road is known. Checking it first is what keeps this pass from routing
    // thousands of pairs to reject them.
    const reach = networkDistance(graph, edge.i, edge.j, edge.straightM * FUSE_RATIO);
    if (reach !== null) {
      fuseNotFar++;
      continue;
    }

    const accepted = await routeCord(edge);
    if (!accepted) continue;

    // Now with the road in hand, ask the question properly.
    const throughNetwork = networkDistance(graph, edge.i, edge.j, accepted.result.meters * FUSE_RATIO);
    if (throughNetwork !== null || accepted.result.meters > FUSE_MAX_M) {
      fuseRefused++;
      continue;
    }

    addGraphEdge(edge.i, edge.j, accepted.result.meters);
    drawnPairs.add(key);
    cordEnds.push([edge.i, edge.j]);
    cordMeters.push(accepted.result.meters);
    cordFeatures.push(makeCord(edge, accepted, 'Fused cord'));
    fused++;
  }

  await saveCache(cache);
  log(
    'corridors',
    `${fused} fusions drawn: pairs within ${metersToMiles(FUSE_MAX_M)} miles whose network path ` +
      `ran over ${FUSE_RATIO}× the road between them`,
  );
  log(
    'corridors',
    `fusion candidates passed over: ${fuseNotFar} already well connected, ${fuseRefused} not far ` +
      `enough round once routed${fuseCapped ? `, ${fuseCapped} beyond the cap of ${FUSE_LIMIT}` : ''}`,
  );

  /*
   * What each strand holds on.
   *
   * With fusions in place the network is no longer a tree, and "cut this and N
   * readers fall off" is only true of the strands that are bridges. So the
   * question is asked of the whole graph rather than assumed from its shape:
   * every strand that is a bridge reports the size of the smaller side it would
   * leave behind, and every strand inside a loop reports zero, because cutting
   * it costs the network nothing. That zero is a finding in itself — it is the
   * redundancy the fusions were added to create.
   */
  const held = bridgeSplits([...endsOf, ...cordEnds]);
  features.forEach((feature, i) => {
    feature.properties.attributes.bringsInSites = held.smaller[i];
  });
  cordFeatures.forEach((feature, i) => {
    const at = features.length + i;
    feature.properties.attributes.connectedSites = held.colony[at];
    feature.properties.attributes.bringsInSites = held.smaller[at];
  });
  const loadBearing = held.smaller.filter((n) => n > 0).length;
  log(
    'corridors',
    `${loadBearing} of ${held.smaller.length} strands are load-bearing; ` +
      `${held.smaller.length - loadBearing} sit inside a loop and can be cut for free`,
  );

  features.push(...cordFeatures);
  log(
    'corridors',
    `geometry simplified at ${SIMPLIFY_M} m (links) and ${CORD_SIMPLIFY_M} m (cords): ` +
      `${vertexCount} vertices to ${keptVertices} ` +
      `(${Math.round((1 - keptVertices / vertexCount) * 100)}% fewer)`,
  );

  // How many reader locations the finished layer leaves out entirely. Different
  // from `alone` above, which counts sites with no *mesh* neighbour: most of
  // those are now the far end of a cord. What is left is the readers no road
  // could be routed to at all.
  const fusedBodies = new Set(cordSeams.flat());
  const unconnected = sites.filter((_, i) => !parent.has(i) && !fusedBodies.has(bodyOf[i])).length;

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
  const cordMiles = cordFeatures
    .map((f) => f.properties.attributes.linkMiles)
    .sort((x, y) => x - y);
  log(
    'corridors',
    `${features.length} strands drawn — ${features.length - cordFeatures.length} mesh links ` +
      `(median ${round(median).toFixed(2)} mi, longest ${round(sorted.at(-1)).toFixed(2)} mi) and ` +
      `${cordFeatures.length} cords (median ${cordMiles[Math.floor(cordMiles.length / 2)]} mi, ` +
      `longest ${cordMiles.at(-1)} mi)`,
  );
  log('corridors', `${unconnected} reader locations remain in no strand at all`);
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
  if (previous?.metadata?.linkModel === 'gabriel-mesh+cord-mst+anastomosis') {
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
      linkModel: 'gabriel-mesh+cord-mst+anastomosis',
    },
    knownGaps: [
      'Derived, not surveyed. Every limit of the crowd-sourced camera layer applies here and compounds: a link is only as real as the two readers it joins, and a reader nobody has mapped moves every strand around it.',
      `This layer holds two kinds of strand and they are not the same claim. A **neighbourhood link** (\`kind: link\`) joins two readers with nothing mapped between them, under ${STATIC_MILES} miles apart by road: that is a claim about an ordinary trip. A **cord** (\`kind: cord\`) is the shortest road joining one cluster of readers to the next, with no length cap at all: that is a claim about reachability — these two clusters sit on one road network — and nothing more. A cord dozens of miles long does not say anybody drives it, or that a driver on it is read at both ends. Read a cord as the seam between two watched places, not as a journey.`,
      `The cords exist because the links alone drew the wrong picture. Capped at ${STATIC_MILES} miles, the neighbourhood links leave the state as ${members.size} unconnected pieces, which reads as scatter — an artefact of the cap, not of the cameras. Most cords are structural: the shortest set of real roads that fuses those pieces into one body, one road per join, the cheapest available every time.`,
      `${fused} cords are fusions rather than joins, and they are there because a network of single roads was the wrong shape as well as the wrong picture. A fusion is a second real road between two clusters that are within ${metersToMiles(FUSE_MAX_M)} miles of each other but over ${FUSE_RATIO} times that far apart through the network — clusters that have met on the ground without the network knowing it. They close loops, and loops are the difference between a network that survives losing a road and one that does not: these ${fused} roads take the number of strands whose removal would strand somebody from 829 to 380. Every fusion is a routed road like every other strand here, and drawing them also retires a claim the earlier version of this layer had to make — that one road stood between each pair of clusters, which was never true of the ground, only of the drawing.`,
      `\`bringsInSites\` is how many reader locations would be cut off if that one strand were removed, and it is zero for most of them. Zero is a finding, not a missing value: it means a loop runs around that road and the network can lose it for nothing. ${loadBearing} of ${held.smaller.length} strands are load-bearing, and those are the ones whose removal actually costs the network something.`,
      `Only *links* are capped at ${STATIC_MILES} miles by road. Beyond that a line stops describing a trip, which is why the mesh stops there and why a reader whose nearest neighbour is further away sits in no link. Cords carry no cap and some of them are very long; the mile figure on every strand is on the strand, and a long one should be read as the distance it plainly is.`,
      `The line is the route a car would drive between the two readers, as OSRM reads OpenStreetMap: it honours one-way streets and turn restrictions, but knows nothing of traffic, closures or roadworks, and it is the shortest such route rather than the one a local would pick.`,
      `Nearest neighbour is decided by distance across the map and the line is then measured along the road, so the two can disagree — a reader across a river is near on the map and far to drive. Where driving takes more than ${DETOUR_RATIO} times the straight-line distance the pair is refused, because at that point the line stops describing the pair and starts describing the detour. A cord is held to a looser ${CORD_DETOUR_RATIO} times, because a cord is about reachability rather than about a trip and a road that swings wide to make the connection is still the answer to that question.`,
      `The line drawn is the route simplified to ${SIMPLIFY_M} m for a link and ${CORD_SIMPLIFY_M} m for a cord, so it departs from the road by up to that much where the road curves. Nothing is added and no corner is cut that a reader could see at the zooms each tier is legible at; the length quoted for a strand is the router's own figure for the full route, not the length of the simplified line.`,
      `This layer records which roads a strand follows, from the router's own driving instructions, but not what class of road they are. The router does not report the OpenStreetMap \`highway\` tag, and a road's class is not something to infer from its name, so the field is absent rather than guessed. A cord can run along dozens of named roads; only the eight it covers most ground on are listed, and the count of the rest is in the same field.`,
      `${alone} reader locations have no other reader within ${metersToMiles(LINK_M)} miles and so appear in no link. Most of them are now the far end of a cord instead; ${unconnected} are in no strand of either kind, because no road could be routed to them at all. All of them remain on the camera layer.`,
      `The colony is not one body everywhere. ${colonies.size} separate colonies remain after the cords are drawn, where a body could not be reached by any road the router would return — an island reader, a private road, a car park the car profile will not enter.`,
      `${unsnapped} pairs had an end more than ${SNAP_M} m from any drivable road OpenStreetMap records, so the route would have started somewhere no camera stands. ${noRoute} more could not be routed at all, and ${tooFar} were over ${metersToMiles(LINK_M)} miles by road despite being within that distance across the map. Among cord candidates, ${cordUnsnapped} were refused for the same snapping reason, ${cordNoRoute} could not be routed and ${cordCrooked} were too crooked.`,
      `A reader location is one or more cameras within ${SITE_M} m of each other; ${totalReaders} readers stand at the ends of these strands. Which way each camera faces is on the camera layer, and this layer does not claim that a trip along a strand is read at both of its ends.`,
      `Operator is recorded for only ${totalReaders - unattributedTotal} of those ${totalReaders} readers, so the agencies named on a strand are a floor and never the full list. Naming an operator says who is recorded as running a reader, not who can search what it collects — a separate question this layer holds no data on.`,
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

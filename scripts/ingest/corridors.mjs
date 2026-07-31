#!/usr/bin/env node
/**
 * L1b — ALPR corridors.
 *
 * A derived layer. It reads the camera layer this repo already publishes and
 * asks one question of it: which readers stand along the same stretch of the
 * same road?
 *
 * The point is what a map of dots cannot show. A cluster of cameras in a
 * downtown reads as "the city centre is watched". A line of readers spaced
 * every mile and a half along a county road is a different claim: that the
 * ordinary trip — the school run, the commute, the drive to a clinic — is
 * logged repeatedly by the same network, and that the people logged are
 * overwhelmingly not suspects. This layer exists to make that legible.
 *
 * What is drawn is real road geometry from OpenStreetMap, clipped to the
 * stretch the readers occupy. No line is ever invented between two cameras:
 * a drawn connector would assert a relationship no source records, and this
 * project does not fabricate records. The connector here is the road, because
 * the road is the thing that is actually shared.
 *
 * Two Overpass passes, both keyless:
 *   A. the drivable ways beside each camera, to learn which road it stands on
 *   B. the full geometry of the roads that turned out to matter
 *
 * Pass A alone is not enough: it returns only ways near a camera, so the road
 * between two readers a mile apart is missing and a corridor cannot be traced.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  writeLayer,
  log,
  loadCounties,
  slugId,
  queryOverpass,
  PUBLIC_DATA,
} from './lib/util.mjs';
import {
  findContaining,
  haversineMeters,
  lineLengthMeters,
  locateOnLine,
  metersToMiles,
} from '../../src/lib/geo.mjs';

const STATE_ISO = process.env.STATE_ISO ?? 'US-MN';
const STATE_USPS = process.env.STATE_USPS ?? 'MN';

const MILE = 1609.344;

/**
 * Ways a car can drive on. Deliberately excludes footway, cycleway, path and
 * service: an ALPR is mounted on a pole at the kerb, so its nearest way is
 * very often the pavement beside it rather than the road it is aimed at.
 * Snapping without this filter puts a third of the metro's cameras on
 * footpaths.
 */
const DRIVABLE = '^(motorway|trunk|primary|secondary|tertiary|unclassified|residential)(_link)?$';

/** How far from a road a camera may stand and still be counted as on it. */
const SNAP_M = 60;

/**
 * Two cameras closer than this are one location — a single gantry or pole pair
 * covering both directions of travel. Kept distinct from the reader count
 * because "16 readers" and "8 places you drive past" are different facts and
 * conflating them would overstate how often a given trip is seen.
 */
const SITE_M = 75;

/**
 * The widest linking distance this file supports.
 *
 * Not a claim that five miles of separation is one corridor — it is the ceiling
 * of the control in the browser, which can only ever narrow what was surveyed
 * here. Moving it means moving `linkRadius.maxMiles` in the registry to match,
 * or the top of the slider silently stops doing anything.
 */
const LINK_M = 5 * MILE;

/**
 * A corridor has to have enough stops, and be long enough not to be a junction.
 *
 * The span floor is doing one job only: excluding four readers around a single
 * intersection. An intersection is 50–100 m across, so a quarter-mile floor
 * clears it comfortably while keeping the dense city-street case, which is the
 * one a mile-long floor was silently throwing away — East Franklin Avenue in
 * Minneapolis carries eight readers at six locations in 0.84 miles, a reader
 * every 740 feet, and failed the old floor for being *too short* despite being
 * four times denser than the average corridor that passed.
 *
 * Note that a density test would be redundant here: at four or more locations
 * inside a mile, sites-per-mile is necessarily above four already. The floor
 * and the site count together say everything a separate density rule would.
 */
const MIN_SITES = 4;
const MIN_SPAN_M = 0.25 * MILE;

/**
 * How far off the line of readers a piece of road may sit and still be drawn.
 * Wide enough to follow a curve or a divided carriageway, tight enough to
 * reject a different stretch of a road that happens to share a number.
 */
const CLIP_M = 300;

/**
 * How much of a side street to draw around a reader that is not on a corridor.
 *
 * These are the branches. A camera on a side road is not a corridor and this
 * layer must not call it one, but it is a real reader on a real road, and
 * hiding it makes a corridor look like the whole of the network when it is the
 * trunk of it. Drawing a short piece of the road it actually stands on says
 * exactly what is known: a reader here, on this street, pointing somewhere.
 *
 * Kept short on purpose. The stub is evidence of a reader, not a claim about
 * how far up that street the surveillance runs.
 */
const BRANCH_M = 160;

/**
 * The shortest branch worth drawing.
 *
 * A handful of readers snap to a tiny OpenStreetMap connector way — a five-metre
 * fragment at a junction rather than the street itself — and the stub around
 * them comes out too short to be a mark of anything. Drawing a nought-length
 * line is not more honest than leaving it out, so they are dropped and counted.
 */
const MIN_STUB_M = 20;

/**
 * Miles, for prose. Rounding to whole numbers would print the quarter-mile span
 * floor as "0 mile", so sub-mile distances keep two decimals.
 */
function milesText(m) {
  const mi = metersToMiles(m);
  return mi < 1 ? mi.toFixed(2) : String(Math.round(mi));
}

/** Overpass QL is POSIX ERE; road names contain brackets and full stops. */
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

const wayOf = (element) => ({
  id: element.id,
  tags: element.tags ?? {},
  coords: element.geometry.map((n) => [n.lon, n.lat]),
});

const isDrivable = (element) =>
  element.type === 'way' &&
  Array.isArray(element.geometry) &&
  element.geometry.length > 1 &&
  new RegExp(DRIVABLE).test(element.tags?.highway ?? '');

/** Single-linkage clustering: join anything within `radius` of the group. */
function cluster(points, radius, coordOf = (p) => p) {
  const groups = [];
  const remaining = [...points];
  while (remaining.length) {
    const group = [remaining.shift()];
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = remaining.length - 1; i >= 0; i--) {
        const candidate = coordOf(remaining[i]);
        if (group.some((g) => haversineMeters(coordOf(g), candidate) <= radius)) {
          group.push(remaining.splice(i, 1)[0]);
          grew = true;
        }
      }
    }
    groups.push(group);
  }
  return groups;
}

const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;

/** The most common value in a list, for picking one name off many way tags. */
function commonest(values) {
  const counts = new Map();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = null;
  for (const [value, n] of counts) if (!best || n > best[1]) best = [value, n];
  return best?.[0] ?? null;
}

/**
 * Order sites along the corridor.
 *
 * Projects onto the principal axis of the sites themselves rather than onto
 * the road, which avoids having to assemble hundreds of OSM way fragments into
 * a single traversable path. Over the few miles a corridor spans a road is
 * near enough straight for the ordering to be the one a driver would meet.
 */
function orderAlongAxis(sites) {
  const mx = 111_320 * Math.cos((sites[0].point[1] * Math.PI) / 180);
  const my = 110_574;
  const cx = mean(sites.map((s) => s.point[0] * mx));
  const cy = mean(sites.map((s) => s.point[1] * my));

  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const s of sites) {
    const dx = s.point[0] * mx - cx;
    const dy = s.point[1] * my - cy;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const ax = Math.cos(theta);
  const ay = Math.sin(theta);

  return sites
    .map((s) => ({ ...s, t: (s.point[0] * mx - cx) * ax + (s.point[1] * my - cy) * ay }))
    .sort((a, b) => a.t - b.t);
}

/**
 * The corridor's own road, clipped to the run of readers.
 *
 * Keeps every vertex of every way carrying this road's identity that lies
 * within CLIP_M of the chain through the readers, and breaks the line wherever
 * vertices are dropped. The result is real surveyed geometry with real gaps in
 * it — never a straight line drawn across ground we have no road for.
 */
function clipToCorridor(ways, chain) {
  const pieces = [];
  for (const way of ways) {
    let run = [];
    for (const vertex of way.coords) {
      if (locateOnLine(vertex, chain).distance <= CLIP_M) {
        run.push(vertex);
      } else {
        if (run.length > 1) pieces.push(run);
        run = [];
      }
    }
    if (run.length > 1) pieces.push(run);
  }
  return pieces;
}

/** The point a fraction of the way along a segment. */
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/**
 * The stretch of a way within `radius` metres of a point, measured along the
 * road rather than across it.
 *
 * A branch stub has to be bounded by construction, not by which vertices happen
 * to fall near the camera. Keeping whole OpenStreetMap segments let a single
 * reader on a rural road draw two kilometres of line, which asserts a run of
 * surveillance where the source records one camera. Walking outward from the
 * camera's own position and interpolating the last vertex gives the same length
 * either side of every reader, whatever the survey's vertex spacing.
 */
function stubAround(point, coords, radius) {
  if (!coords || coords.length < 2) return null;

  let best = null;
  for (let i = 0; i < coords.length - 1; i++) {
    const { distance, fraction } = locateOnLine(point, [coords[i], coords[i + 1]]);
    if (!best || distance < best.distance) best = { distance, index: i, fraction };
  }
  if (!best) return null;

  const anchor = lerp(coords[best.index], coords[best.index + 1], best.fraction);

  const walk = (step, stop) => {
    const out = [];
    let travelled = 0;
    let from = anchor;
    for (let i = best.index + step; stop(i); i += step) {
      const leg = haversineMeters(from, coords[i]);
      if (travelled + leg >= radius) {
        if (leg > 0) out.push(lerp(from, coords[i], (radius - travelled) / leg));
        break;
      }
      travelled += leg;
      out.push(coords[i]);
      from = coords[i];
    }
    return out;
  };

  const back = walk(-1, (i) => i >= 0);
  const forward = walk(1, (i) => i < coords.length);
  // `walk(1, ...)` starts at index+1, which is the far end of the anchor's own
  // segment, so both directions begin adjacent to the anchor.
  const line = [...back.reverse(), anchor, ...forward];
  return line.length > 1 ? line : null;
}

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
    }))
    .filter((c) => c.osmId != null);
  if (!cameras.length) throw new Error('camera layer holds no OSM-identified points');
  return { cameras, metadata: collection.metadata ?? {} };
}

/** Pass A — which drivable ways stand beside a camera. */
async function fetchRoadsBesideCameras(cameras) {
  const ids = cameras.map((c) => c.osmId).join(',');
  const query = `
[out:json][timeout:300];
node(id:${ids})->.cams;
way(around.cams:${SNAP_M})["highway"~"${DRIVABLE}"];
out tags geom;
`.trim();
  const data = await queryOverpass('corridors', query, { timeoutMs: 310_000 });
  return (data.elements ?? []).filter(isDrivable).map(wayOf);
}

/**
 * Pass B — the full length of the roads that matter, in batches.
 *
 * Batched rather than sent as one regex over every identity because these are
 * volunteer-run mirrors: several modest queries are likelier to complete, and
 * kinder, than one that walks the whole state's road network at once.
 */
async function fetchFullRoads(identities) {
  const BATCH = 25;
  const ways = new Map();
  for (let i = 0; i < identities.length; i += BATCH) {
    const batch = identities.slice(i, i + BATCH);
    const alternation = batch.map(escapeRe).join('|');
    const query = `
[out:json][timeout:300];
area["ISO3166-2"="${STATE_ISO}"]["admin_level"="4"]->.scope;
(
  way(area.scope)["highway"~"${DRIVABLE}"]["ref"~"^(${alternation})$"];
  way(area.scope)["highway"~"${DRIVABLE}"]["name"~"^(${alternation})$"];
);
out tags geom;
`.trim();
    log('corridors', `pass B batch ${i / BATCH + 1}: ${batch.length} road identities`);
    const data = await queryOverpass('corridors', query, { timeoutMs: 310_000 });
    for (const element of (data.elements ?? []).filter(isDrivable)) {
      ways.set(element.id, wayOf(element));
    }
  }
  return [...ways.values()];
}

/** Nearest drivable way to a camera, or null if none is close enough. */
function snap(point, ways) {
  let best = null;
  for (const way of ways) {
    const { distance } = locateOnLine(point, way.coords);
    if (!best || distance < best.distance) best = { distance, way };
  }
  return best && best.distance <= SNAP_M ? best : null;
}

async function main() {
  const { cameras, metadata } = await loadCameras();
  log('corridors', `read ${cameras.length} cameras from the ALPR layer`);

  const nearbyWays = await fetchRoadsBesideCameras(cameras);
  log('corridors', `pass A returned ${nearbyWays.length} drivable ways beside cameras`);
  if (!nearbyWays.length) {
    throw new Error('Overpass returned no roads beside any camera; refusing to overwrite the layer');
  }

  // Assign every camera to the road it stands on.
  const byIdentity = new Map();
  let unsnapped = 0;
  for (const camera of cameras) {
    const hit = snap(camera.point, nearbyWays);
    if (!hit) {
      unsnapped++;
      continue;
    }
    const identity = identityOf(hit.way.tags);
    if (!identity) {
      unsnapped++;
      continue;
    }
    if (!byIdentity.has(identity)) byIdentity.set(identity, []);
    byIdentity.get(identity).push({ ...camera, way: hit.way });
  }
  log(
    'corridors',
    `${cameras.length - unsnapped} cameras sit on a named or numbered road; ${unsnapped} do not`,
  );

  // Only roads that could possibly clear the bar are worth fetching in full.
  const candidates = [...byIdentity.entries()]
    .filter(([, list]) => cluster(list, SITE_M, (c) => c.point).length >= MIN_SITES)
    .map(([identity]) => identity);
  log('corridors', `${candidates.length} road identities could hold a corridor`);
  if (!candidates.length) throw new Error('no candidate corridors; refusing to write an empty layer');

  const fullWays = await fetchFullRoads(candidates);
  log('corridors', `pass B returned ${fullWays.length} ways of full geometry`);

  const waysByIdentity = new Map();
  for (const way of fullWays) {
    const identity = identityOf(way.tags);
    if (!identity) continue;
    if (!waysByIdentity.has(identity)) waysByIdentity.set(identity, []);
    waysByIdentity.get(identity).push(way);
  }

  const counties = await loadCounties();
  const features = [];
  const inCorridor = new Set();
  let tooShort = 0;
  let tooFew = 0;

  for (const [identity, list] of byIdentity) {
    // Same road number, different county — Minnesota reuses county route
    // numbers, so "CR 3" is several unrelated roads. Distance separates them.
    for (const stretch of cluster(list, LINK_M, (c) => c.point)) {
      const sites = cluster(stretch, SITE_M, (c) => c.point).map((group) => ({
        point: [mean(group.map((g) => g.point[0])), mean(group.map((g) => g.point[1]))],
        readers: group.length,
      }));
      if (sites.length < MIN_SITES) {
        tooFew++;
        continue;
      }

      const ordered = orderAlongAxis(sites);
      const chain = ordered.map((s) => s.point);

      const offsets = [0];
      for (let i = 1; i < chain.length; i++) {
        offsets.push(offsets[i - 1] + haversineMeters(chain[i - 1], chain[i]));
      }
      const spanM = offsets[offsets.length - 1];
      if (spanM < MIN_SPAN_M) {
        tooShort++;
        continue;
      }

      const gaps = [];
      for (let i = 1; i < offsets.length; i++) gaps.push(offsets[i] - offsets[i - 1]);
      const sortedGaps = [...gaps].sort((a, b) => a - b);
      const median = sortedGaps[Math.floor(sortedGaps.length / 2)];

      const pieces = clipToCorridor(waysByIdentity.get(identity) ?? [], chain);
      if (!pieces.length) continue;

      /*
       * Where each piece of road sits along the corridor, in miles from its
       * start.
       *
       * The browser narrows a corridor as the linking radius comes down, and it
       * cannot redo the clipping to do it — there is no road network in the
       * page and there is never going to be one. Projecting each piece onto the
       * same chain here turns that job into a numeric comparison later: a run
       * covering miles 2 to 5 draws the pieces whose span overlaps 2 to 5, and
       * the geometry it draws is the geometry this script surveyed.
       */
      const pieceSpans = pieces.map((piece) => {
        let lo = Infinity;
        let hi = -Infinity;
        for (const vertex of piece) {
          const at = locateOnLine(vertex, chain).fraction * spanM;
          if (at < lo) lo = at;
          if (at > hi) hi = at;
        }
        return [lo, hi];
      });

      for (const camera of stretch) inCorridor.add(camera.osmId);

      const readers = sites.reduce((sum, s) => sum + s.readers, 0);
      const midpoint = chain[Math.floor(chain.length / 2)];
      const county = findContaining(midpoint, counties.features);
      const spannedCounties = new Set(
        chain.map((p) => findContaining(p, counties.features)?.properties.name).filter(Boolean),
      );

      const tags = stretch.map((c) => c.way.tags);
      const roadName = commonest(tags.map((t) => (t.name ?? '').trim()));
      const roadClass = commonest(tags.map((t) => t.highway));
      const round = (m, dp = 2) => Number(metersToMiles(m).toFixed(dp));

      // Who owns the readers along this road.
      //
      // The count is the point. A corridor is not a procurement: it is what
      // several police departments, a county sheriff and a supermarket chain
      // add up to when each buys cameras for its own reasons and nobody looks
      // at the result end to end. `unattributedReaders` is published beside it
      // because most OSM records carry no operator at all, and a corridor that
      // names three agencies may well be owned by six.
      const operators = [...new Set(stretch.map((c) => c.operator).filter(Boolean))].sort();
      const unattributed = stretch.filter((c) => !c.operator).length;

      features.push({
        type: 'Feature',
        geometry: { type: 'MultiLineString', coordinates: pieces },
        properties: {
          id: slugId('alpr-corridor', identity, String(features.length)),
          layer: 'alpr_corridor',
          name:
            roadName && roadName !== identity ? `${identity} — ${roadName}` : (roadName ?? identity),
          county: county?.properties.name ?? null,
          state: STATE_USPS,
          countyFips: county?.properties.geoid ?? null,
          // Inherited from the cameras: a corridor is exactly as trustworthy
          // as the crowd-sourced records it is built from.
          confidence: 'probabilistic',
          sourceDate: null,
          attributes: {
            kind: 'corridor',
            road: identity,
            roadName: roadName && roadName !== identity ? roadName : null,
            roadClass,
            readerCount: readers,
            siteCount: sites.length,
            corridorMiles: round(spanM, 1),
            averageGapMiles: round(spanM / (sites.length - 1)),
            medianGapMiles: round(median),
            longestGapMiles: round(Math.max(...gaps)),
            countiesSpanned: spannedCounties.size,
            operatorCount: operators.length,
            operators: operators.length ? operators.join('; ') : null,
            unattributedReaders: unattributed,
            // Positions of each reader location along the corridor, in miles
            // from its start. Semicolon-separated because a layer attribute is
            // a scalar; the map parses it to draw the corridor strip.
            siteOffsets: offsets.map((m) => round(m).toFixed(2)).join(';'),
            siteReaders: ordered.map((s) => s.readers).join(';'),
            // Site coordinates, so the browser can ask which corridors are
            // linked to which at a given radius. Six decimals is about 11 cm,
            // far finer than anything this layer claims.
            siteLngs: chain.map((p) => p[0].toFixed(6)).join(';'),
            siteLats: chain.map((p) => p[1].toFixed(6)).join(';'),
            // Start,end offset of each drawn piece, in the same miles as
            // siteOffsets. Pairs are comma-separated, pieces semicolon-separated.
            pieceSpans: pieceSpans.map(([lo, hi]) => `${round(lo)},${round(hi)}`).join(';'),
          },
        },
      });
    }
  }

  if (!features.length) throw new Error('no corridors survived the thresholds; not writing a layer');

  /* ------------------------------------------------------------------ *
   * Branches
   *
   * Every reader that snapped to a road but did not end up in a corridor,
   * drawn as a short stub of the street it actually stands on.
   *
   * This is what makes the map stop lying by omission. A corridor layer alone
   * says "here are the roads with runs of readers on them" and leaves a reader
   * to assume the blank between two corridors is blank. It is not: most mapped
   * cameras in this state are on roads that hold no run at all. Drawing the
   * stub asserts only what the source records — a reader, on this street.
   *
   * The stub is real surveyed geometry, clipped from the same OpenStreetMap way
   * the camera snapped to, exactly as a corridor is. Nothing here is a
   * connector: whether a branch belongs to a corridor's network is decided in
   * the browser by distance, and shown by colour, never by a drawn line.
   * ------------------------------------------------------------------ */
  const loose = [];
  for (const list of byIdentity.values()) {
    for (const camera of list) if (!inCorridor.has(camera.osmId)) loose.push(camera);
  }

  let branches = 0;
  let stubTooShort = 0;
  for (const group of cluster(loose, SITE_M, (c) => c.point)) {
    const point = [mean(group.map((g) => g.point[0])), mean(group.map((g) => g.point[1]))];
    // The stub: BRANCH_M of the camera's own road either side of it.
    const stub = stubAround(point, group[0].way.coords, BRANCH_M);
    if (!stub || lineLengthMeters(stub) < MIN_STUB_M) {
      stubTooShort++;
      continue;
    }
    const pieces = [stub];

    const county = findContaining(point, counties.features);
    const tags = group.map((g) => g.way.tags);
    const roadName = commonest(tags.map((t) => (t.name ?? '').trim()));
    const identity = identityOf(group[0].way.tags) ?? roadName ?? 'Unnamed road';
    const operators = [...new Set(group.map((g) => g.operator).filter(Boolean))].sort();

    branches++;
    features.push({
      type: 'Feature',
      geometry: { type: 'MultiLineString', coordinates: pieces },
      properties: {
        id: slugId('alpr-branch', identity, String(branches)),
        layer: 'alpr_corridor',
        name: roadName && roadName !== identity ? `${identity} — ${roadName}` : identity,
        county: county?.properties.name ?? null,
        state: STATE_USPS,
        countyFips: county?.properties.geoid ?? null,
        confidence: 'probabilistic',
        sourceDate: null,
        attributes: {
          kind: 'branch',
          road: identity,
          roadName: roadName && roadName !== identity ? roadName : null,
          roadClass: commonest(tags.map((t) => t.highway)),
          readerCount: group.length,
          siteCount: 1,
          operatorCount: operators.length,
          operators: operators.length ? operators.join('; ') : null,
          unattributedReaders: group.filter((g) => !g.operator).length,
          siteLngs: point[0].toFixed(6),
          siteLats: point[1].toFixed(6),
          siteReaders: String(group.length),
        },
      },
    });
  }
  log('corridors', `${branches} branch readers on roads that hold no corridor`);

  // Corridors first and longest-first within them, so the record list opens on
  // the runs rather than on a thousand single readers.
  const isCorridor = (f) => f.properties.attributes.kind === 'corridor';
  features.sort((a, b) => {
    if (isCorridor(a) !== isCorridor(b)) return isCorridor(a) ? -1 : 1;
    return b.properties.attributes.readerCount - a.properties.attributes.readerCount;
  });

  const corridors = features.filter(isCorridor);
  const totalReaders = corridors.reduce((s, f) => s + f.properties.attributes.readerCount, 0);
  const paired = corridors.reduce(
    (s, f) => s + f.properties.attributes.readerCount - f.properties.attributes.siteCount,
    0,
  );
  const unattributedTotal = features.reduce(
    (s, f) => s + f.properties.attributes.unattributedReaders,
    0,
  );
  const branchReaders = features
    .filter((f) => !isCorridor(f))
    .reduce((s, f) => s + f.properties.attributes.readerCount, 0);
  const attributed = totalReaders + branchReaders - unattributedTotal;
  const multiOperator = corridors.filter((f) => f.properties.attributes.operatorCount > 1).length;
  log(
    'corridors',
    `${attributed} of ${totalReaders + branchReaders} readers name an operator; ` +
      `${multiOperator} corridors are shared by more than one`,
  );
  log(
    'corridors',
    `${corridors.length} corridors holding ${totalReaders} readers at ` +
      `${totalReaders - paired} locations, plus ${branchReaders} readers on branches`,
  );
  for (const f of corridors.slice(0, 10)) {
    const a = f.properties.attributes;
    log(
      'corridors',
      `  ${f.properties.name}: ${a.readerCount} readers, ${a.siteCount} locations, ` +
        `${a.corridorMiles} mi, one every ${a.averageGapMiles} mi`,
    );
  }

  /*
   * Refuse to overwrite a fuller layer with a thinner one.
   *
   * Overpass mirrors do not only fail loudly. A run of this script came back
   * HTTP 200 with 4,407 ways where the previous run saw 5,170, which snapped
   * 182 fewer cameras and quietly shipped a smaller network — no error, no
   * warning, just less of Minnesota. A partial answer that looks like a whole
   * one is the failure mode worth guarding, because it is the one nobody
   * notices.
   *
   * The bar is the file already on disk. Growth is always fine; a material
   * shrink means the query, not the state, changed.
   */
  const previous = await readFile(path.join(PUBLIC_DATA, 'alpr-corridors.geojson'), 'utf8')
    .then((raw) => JSON.parse(raw))
    .catch(() => null);
  if (previous) {
    const readersIn = (collection) =>
      (collection.features ?? []).reduce(
        (sum, f) => sum + (Number(f.properties?.attributes?.readerCount) || 0),
        0,
      );
    const before = readersIn(previous);
    const now = totalReaders + branchReaders;
    if (before > 0 && now < before * 0.9) {
      throw new Error(
        `refusing to overwrite: ${now} readers now against ${before} in the file on disk ` +
          `(${Math.round((1 - now / before) * 100)}% fewer). Upstream returned a partial answer; ` +
          `re-run rather than shipping a thinner network.`,
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
    },
    knownGaps: [
      'Derived, not surveyed. Every limit of the crowd-sourced camera layer applies here and compounds: a corridor is only as complete as the readers someone happened to map along it.',
      `This file does not decide what a corridor is; the map does, from the linking radius its reader sets. What is shipped here is the raw material: a road becomes a run when at least ${MIN_SITES} reader locations sit on it no more than ${milesText(LINK_M)} miles apart across at least ${milesText(MIN_SPAN_M)} of a mile, and every other reader is shipped on its own. Those thresholds decide only what the map has available to draw, and ${milesText(LINK_M)} miles is the widest the control can reach.`,
      `${tooFew} stretches held fewer than ${MIN_SITES} reader locations and ${tooShort} spanned under ${milesText(MIN_SPAN_M)} of a mile, so no run was shipped for them. Their readers are not lost: each is shipped on its own, and the map draws it wherever it belongs to a cluster large enough to qualify.`,
      'A camera standing in an intersection is assigned to whichever road its centre line is nearer, and at a crossroads that margin can be a couple of metres. Along East Franklin Avenue in Minneapolis, several readers on the Franklin line are filed under the avenue they cross rather than under Franklin. The recorded direction does not resolve it — it disagrees with the assignment about as often as it confirms it — so no corridor here should be read as a complete count of the readers a trip along it passes.',
      `${unsnapped} of ${cameras.length} cameras stand on no road that OpenStreetMap names or numbers, and appear in no corridor.`,
      'Distances are measured in straight lines between consecutive reader locations, not along the curve of the road, so a winding corridor is slightly longer to drive than the figure given.',
      'The line drawn is OpenStreetMap road geometry clipped to the run of readers. Gaps in it are roads we hold no geometry for, not stretches known to be unwatched.',
      'A reader location is one or more cameras within 75 m. Which direction each faces is on the camera layer; this layer does not claim that a single trip is read by every camera it passes.',
      `Operator is recorded for only ${attributed} of the ${attributed + unattributedTotal} readers in these corridors, so the agencies named on a corridor are a floor and never the full list. A corridor showing one operator may well be shared by several.`,
      'Naming an operator says who is recorded as running a reader. It says nothing about who can search what it collects, which is a separate question this layer holds no data on.',
      `Alongside the ${corridors.length} runs, ${branches} single reader locations are shipped, each as a short stub of the street it stands beside. A stub is not a corridor and is not evidence of one. They are here because most mapped cameras in this state are on no run at all, and leaving them out made a run look like the whole network when it was only its longest root.`,
      `A branch stub is ${BRANCH_M} m of road either side of the reader, the same everywhere. That length is a drawing convention, not a measurement: nothing in the source says how far along that street the surveillance extends.`,
      `${stubTooShort} further reader locations are not drawn at all: each snapped to an OpenStreetMap way fragment shorter than ${MIN_STUB_M} m — a connector at a junction rather than a street — leaving nothing to draw a stub along. They remain on the camera layer.`,
    ],
    features,
  });
}

main().catch((err) => {
  console.error(`[corridors] FAILED: ${err.message}`);
  process.exit(1);
});

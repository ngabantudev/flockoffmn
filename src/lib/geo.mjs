/**
 * Geometry helpers shared by the ingest scripts (Node) and the map UI
 * (browser). Kept as one dependency-free ESM module so the county assignment
 * done at build time and the "near me" lookup done in the browser can never
 * drift apart.
 */

const EARTH_RADIUS_M = 6_371_008.8;

const toRad = (deg) => (deg * Math.PI) / 180;

/** Great-circle distance in metres between two [lng, lat] pairs. */
export function haversineMeters([lng1, lat1], [lng2, lat2]) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

export function metersToMiles(m) {
  return m / 1609.344;
}

/**
 * Distance display text — `< 0.1`, one decimal under 10 miles, none above.
 * `/near-me` and the homepage map's near-me list each used to spell this
 * out independently; a shared formatter means a future rounding-rule tweak
 * (e.g. showing two decimals under a mile) lands on both surfaces at once
 * instead of only whichever file someone remembers to edit.
 */
export function formatMiles(m) {
  const mi = metersToMiles(m);
  return mi < 0.1 ? '< 0.1' : mi.toFixed(mi < 10 ? 1 : 0);
}

/**
 * Below this many miles of GPS accuracy, `/near-me` and the homepage map's
 * near-me mode both stop calling a fix meaningful and show a low-accuracy
 * warning. Shared so the two surfaces can't warn at different thresholds
 * for the same underlying fix — distinct from mapController.ts's own
 * `accuracyZoomCap`, which keys off a different, zoom-clamping number for
 * the same accuracy input, not a warning threshold.
 */
export const LOW_ACCURACY_MILES = 2;

/**
 * Initial great-circle bearing in degrees [0, 360) from one [lng, lat] point
 * toward another — 0 is north, 90 is east, matching destinationPoint below
 * and every compass convention already in this file (see compassLabel).
 * Undefined at the poles and when the two points coincide, same as any
 * bearing formula; nothing in this codebase calls it with either.
 */
export function bearingDeg([lng1, lat1], [lng2, lat2]) {
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLng);
  const theta = Math.atan2(y, x);
  return ((theta * 180) / Math.PI + 360) % 360;
}

/**
 * The point `distanceM` metres from `origin` along `bearingDeg`, on the same
 * spherical-earth model haversineMeters already uses (EARTH_RADIUS_M) — a
 * near-me sweep or radius circle computed here has to agree with the
 * distances that decided which records it should pass through, not a
 * second, slightly different sphere.
 */
export function destinationPoint([lng, lat], bearing, distanceM) {
  const delta = distanceM / EARTH_RADIUS_M;
  const theta = toRad(bearing);
  const phi1 = toRad(lat);
  const lambda1 = toRad(lng);
  const phi2 = Math.asin(
    Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta),
  );
  const lambda2 =
    lambda1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
      Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2),
    );
  return [(((lambda2 * 180) / Math.PI + 540) % 360) - 180, (phi2 * 180) / Math.PI];
}

/**
 * Ray-casting point-in-polygon over a single linear ring.
 * @param {[number, number]} point [lng, lat]
 * @param {number[][]} ring
 */
function inRing(point, ring) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    // Does the edge straddle the horizontal ray, and is the crossing to the right?
    const straddles = yi > y !== yj > y;
    if (straddles && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Point-in-polygon honouring holes: a point inside the outer ring but inside
 * any inner ring is outside the polygon.
 */
function inPolygon(point, rings) {
  if (!rings.length || !inRing(point, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) {
    if (inRing(point, rings[i])) return false;
  }
  return true;
}

/** Test a point against a GeoJSON Polygon or MultiPolygon geometry. */
export function pointInGeometry(point, geometry) {
  if (!geometry) return false;
  if (geometry.type === 'Polygon') return inPolygon(point, geometry.coordinates);
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some((rings) => inPolygon(point, rings));
  }
  return false;
}

/** Bounding box [minLng, minLat, maxLng, maxLat] of any geometry. */
export function bboxOf(geometry) {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  const visit = (coords) => {
    if (typeof coords[0] === 'number') {
      const [lng, lat] = coords;
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
      return;
    }
    for (const c of coords) visit(c);
  };
  visit(geometry.coordinates);
  return [minLng, minLat, maxLng, maxLat];
}

/**
 * Find the county feature containing a point.
 * Cheap bbox rejection first — 87 polygons is small, but this also runs on
 * every keystroke of the location search on a phone.
 */
export function findContaining(point, features) {
  for (const f of features) {
    const bbox = f.__bbox ?? (f.__bbox = bboxOf(f.geometry));
    if (point[0] < bbox[0] || point[0] > bbox[2] || point[1] < bbox[1] || point[1] > bbox[3]) {
      continue;
    }
    if (pointInGeometry(point, f.geometry)) return f;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Distance to a line
 *
 * Used at build time to decide which road a camera stands beside, and in the
 * browser to answer "how far is that road from here". Both go through the
 * same code for the same reason county assignment does: a line feature the
 * ingest built by snapping at 60 m must not be measured by a different rule
 * when a reader asks how close it is.
 * ------------------------------------------------------------------ */

/**
 * Metres per degree of longitude and latitude at a given latitude.
 *
 * An equirectangular approximation, which is what makes the segment maths
 * below plain Euclidean geometry. Good to well under a metre over the tens of
 * miles a road segment spans, and every use here is local.
 */
function metresPerDegree(lat) {
  return [111_320 * Math.cos(toRad(lat)), 110_574];
}

/**
 * Where a point falls relative to a line.
 *
 * @returns {{distance: number, fraction: number}} perpendicular distance in
 * metres to the nearest point on the line, and how far along the line that
 * nearest point sits, as a fraction of total length. The fraction is returned
 * rather than a distance so a caller can scale it by a length measured with
 * haversine, and never mixes the two ways of measuring.
 */
export function locateOnLine(point, coords) {
  if (!coords || coords.length === 0) return { distance: Infinity, fraction: 0 };
  if (coords.length === 1) return { distance: haversineMeters(point, coords[0]), fraction: 0 };

  const [mx, my] = metresPerDegree(point[1]);
  const px = point[0] * mx;
  const py = point[1] * my;

  let best = { distance: Infinity, along: 0 };
  let travelled = 0;

  for (let i = 0; i < coords.length - 1; i++) {
    const ax = coords[i][0] * mx, ay = coords[i][1] * my;
    const bx = coords[i + 1][0] * mx, by = coords[i + 1][1] * my;
    const vx = bx - ax, vy = by - ay;
    const lenSq = vx * vx + vy * vy;
    // Clamp to the segment: the nearest point on an endpoint-bounded segment,
    // not on the infinite line through it.
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / lenSq));
    const distance = Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
    if (distance < best.distance) best = { distance, along: travelled + t * Math.sqrt(lenSq) };
    travelled += Math.sqrt(lenSq);
  }

  return { distance: best.distance, fraction: travelled === 0 ? 0 : best.along / travelled };
}

/** Total length of a coordinate list in metres. */
export function lineLengthMeters(coords) {
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) total += haversineMeters(coords[i], coords[i + 1]);
  return total;
}

/**
 * Distance in metres from a point to any geometry. A point inside a polygon is
 * zero away from it, not the distance to its edge.
 */
export function distanceToGeometryMeters(point, geometry) {
  if (!geometry) return Infinity;
  switch (geometry.type) {
    case 'Point':
      return haversineMeters(point, geometry.coordinates);
    case 'LineString':
      return locateOnLine(point, geometry.coordinates).distance;
    case 'MultiLineString':
      return Math.min(
        Infinity,
        ...geometry.coordinates.map((line) => locateOnLine(point, line).distance),
      );
    case 'Polygon':
    case 'MultiPolygon': {
      if (pointInGeometry(point, geometry)) return 0;
      const rings =
        geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat();
      return Math.min(Infinity, ...rings.map((ring) => locateOnLine(point, ring).distance));
    }
    default:
      return Infinity;
  }
}

/** Representative point of a geometry, for placing a marker on a zone. */
export function representativePoint(geometry) {
  if (geometry.type === 'Point') return geometry.coordinates;
  const [minLng, minLat, maxLng, maxLat] = bboxOf(geometry);
  return [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** Compass label for a bearing in degrees, e.g. 340 -> "NW". */
export function compassLabel(degrees) {
  const n = Number(degrees);
  if (!Number.isFinite(n)) return null;
  return COMPASS[Math.round(((n % 360) + 360) % 360 / 45) % 8];
}

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

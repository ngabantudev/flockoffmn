/**
 * Minnesota civic context for a flight-sighting record — connects a
 * sighting's lat/lon to this project's own systemic layers (county,
 * detention facilities, 287(g) agreements, accountable offices), so a
 * sighting landing inside Minnesota is shown alongside infrastructure this
 * site already maps.
 *
 * Only viable path from a Cloudflare Pages Function per the plan: there's no
 * Astro build here, so this can't use src/layers/data.ts's build-time file
 * reads. Instead it fetches the already-published public/data/*.geojson
 * files at request time, same-origin, cached via the Cache API — same
 * pattern as functions/api/ice-flights.js.
 *
 * src/lib/geo.mjs and src/lib/authority.mjs are both plain dependency-free
 * ESM already proven importable from a Worker
 * (workers/flight-sightings-cron/index.mjs imports geo.mjs the same way).
 */

import { haversineMeters, metersToMiles, representativePoint, findContaining } from '../../src/lib/geo.mjs';
import { resolveAuthorities } from '../../src/lib/authority.mjs';

const CACHE_TTL_SECONDS = 3600;

/**
 * Same-origin fetch of a static GeoJSON file with edge caching via the
 * Cache API. These layers only change on a data-refresh cadence
 * (`npm run data`), not per-request, so a ~1hr TTL is appropriate.
 */
async function fetchGeojson(origin, path) {
  const url = new URL(path, origin).toString();
  const cache = caches.default;
  const cacheKey = new Request(url);

  const cached = await cache.match(cacheKey);
  if (cached) return cached.json();

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${path}: HTTP ${response.status}`);
  }

  const body = await response.text();
  const cacheable = new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
    },
  });
  await cache.put(cacheKey, cacheable);

  return JSON.parse(body);
}

/**
 * Minnesota civic context for a point: containing county, nearest detention
 * facility on file, any 287(g) agreements in that county, and the chain of
 * offices accountable for enforcement there.
 *
 * Returns null if lat/lon are missing, or if the point isn't inside any
 * Minnesota county (true for most sightings — the worldwide feed's whole
 * point) — the permalink page simply omits the section in that case.
 *
 * @param {number|null} lat
 * @param {number|null} lon
 * @param {string} requestUrl Used to derive the same-origin fetch base —
 *   works correctly on preview/branch deployments, not just production.
 * @returns {Promise<{countyName: string, nearestDetention: object|null, agreements287g: object[], authorities: object[]}|null>}
 */
export async function getMnCivicContext(lat, lon, requestUrl) {
  if (lat == null || lon == null) return null;

  const origin = new URL(requestUrl).origin;
  const point = [lon, lat];

  const [counties, detention, agreements] = await Promise.all([
    fetchGeojson(origin, '/data/reference/mn-counties.geojson'),
    fetchGeojson(origin, '/data/detention.geojson'),
    fetchGeojson(origin, '/data/287g.geojson'),
  ]);

  const countyFeature = findContaining(point, counties.features);
  if (!countyFeature) return null;

  const countyName = countyFeature.properties.name;

  let nearestDetention = null;
  let nearestMeters = Infinity;
  for (const f of detention.features) {
    const meters = haversineMeters(point, representativePoint(f.geometry));
    if (meters < nearestMeters) {
      nearestMeters = meters;
      nearestDetention = {
        name: f.properties.name,
        miles: metersToMiles(meters),
        contractType: f.properties.attributes?.contractType ?? null,
        operator: f.properties.attributes?.operator ?? null,
        facilityType: f.properties.attributes?.facilityType ?? null,
      };
    }
  }

  const agreements287g = agreements.features
    .filter((f) => f.properties.county === countyName)
    .map((f) => ({
      name: f.properties.name,
      supportType: f.properties.attributes?.supportType ?? null,
      signed: f.properties.attributes?.signed ?? null,
    }));

  const authorities = resolveAuthorities(null, countyName);

  return { countyName, nearestDetention, agreements287g, authorities };
}

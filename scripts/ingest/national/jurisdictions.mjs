#!/usr/bin/env node
/**
 * Builds the jurisdiction reference: every city, township, and unorganized
 * territory in the state, with the boundary needed to answer "which one am I
 * standing in".
 *
 * Why this exists as its own reference rather than as a layer: it is not a
 * finding. Nothing here is surveillance infrastructure, and putting 2,760
 * polygons on the map would bury what is. It is the index that turns a point
 * on the map into the name of a body that has to answer a letter — which is
 * the step the site was missing. A reader could see a camera two miles from
 * their house and still have no idea which of the four governments layered
 * over that spot bought it, and no way to find out.
 *
 * The gap was concrete. `mn-places.json` is the Census *incorporated place*
 * gazetteer: 914 cities. Minnesota is also divided into 1,796 townships, where
 * roughly a fifth of the state's population lives, and none of them were
 * searchable here. A resident of a township could not find themselves on this
 * site at all.
 *
 * Two files come out of this, deliberately split:
 *
 *  1. `mn-jurisdictions.json` — a flat name/kind/county index, ~200 KB. Enough
 *     to search, and enough to answer the question for a place a reader picks
 *     by name. Loaded eagerly.
 *  2. `mn-jurisdictions.geojson` — the boundaries, ~1.5 MB. Only needed to
 *     resolve raw coordinates from the device's GPS into a jurisdiction, so
 *     it is fetched only when someone actually presses "use my location".
 *
 * Source is US Census TIGERweb, a federal public-domain work, no key required
 * — the same service `counties.mjs` uses, at the county-subdivision level.
 */

import { fetchWithRetry, log, loadCounties, writeReferenceJson } from '../lib/util.mjs';

const STATE_FIPS = process.env.STATE_FIPS ?? '27'; // Minnesota
const STATE_USPS = process.env.STATE_USPS ?? 'MN';

/**
 * Degrees of simplification, matching `counties.mjs`. 0.002° is roughly 200 m.
 *
 * This is the one number here with a real cost attached, and it is a trade
 * rather than a free win. Coarser geometry ships faster and is wrong more
 * often near a boundary; a reader who lives within about 200 m of a township
 * line may be told they are in the neighbouring one. That is stated in the UI
 * rather than hidden, because for a township the line is often a section road
 * with houses on both sides of it.
 */
const SIMPLIFY = 0.002;

const TIGERWEB =
  'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/' +
  'Places_CouSub_ConCity_SubMCD/MapServer/1/query';

/**
 * How the Census classifies a county subdivision, and what that means for who
 * governs the ground.
 *
 * This mapping is the load-bearing part of the file, because it decides which
 * office a reader is told to write to. `COUSUBCC` is the subdivision class
 * code and `FUNCSTAT` says whether the unit is a functioning government:
 *
 *  - `C5` — the subdivision is coextensive with an incorporated place. The
 *    city is the government. Census marks the *subdivision* record fictitious
 *    (`FUNCSTAT` "F") because the city record carries the real entity; that F
 *    is a statistical artefact and does not mean the city is not a government.
 *  - `T1` with `FUNCSTAT` "A" — an organised town with an elected board and a
 *    clerk. This is the ordinary Minnesota township.
 *  - `Z1`, `Z3` — unorganised territory and non-functioning townships. There
 *    is no town board and no clerk. The county is the local government, and a
 *    letter sent to "the township" has nobody to open it.
 *  - `Z9` — "County subdivisions not defined", which in Minnesota is open
 *    water. Dropped below; there is no ground to stand on and no government.
 *
 * The distinction matters more than it looks. 82 of the state's subdivisions
 * have no local government at all, and telling someone who lives in one to
 * petition their town board would send them to an office that does not exist.
 */
const CLASS_CODES = {
  C5: { kind: 'city', governed: true },
  T1: { kind: 'township', governed: true },
  Z1: { kind: 'township', governed: false },
  Z3: { kind: 'unorganized', governed: false },
  Z9: null, // water; no ground, no government
};

async function fetchSubdivisions() {
  const params = new URLSearchParams({
    where: `STATE='${STATE_FIPS}'`,
    outFields: [
      'GEOID',
      'NAME',
      'BASENAME',
      'COUNTY',
      'COUSUBCC',
      'FUNCSTAT',
      'INTPTLAT',
      'INTPTLON',
      'AREALAND',
    ].join(','),
    returnGeometry: 'true',
    maxAllowableOffset: String(SIMPLIFY),
    f: 'geojson',
  });

  const res = await fetchWithRetry(`${TIGERWEB}?${params}`, { timeoutMs: 180_000 });
  const json = await res.json();
  if (!json.features?.length) throw new Error('TIGERweb returned no county subdivisions');

  // The service silently caps a response that exceeds its transfer limit. A
  // truncated index would look perfectly healthy and quietly lose whole
  // counties, so refuse it rather than write a partial file over a good one.
  if (json.exceededTransferLimit) {
    throw new Error(
      'TIGERweb capped the response; the index would be incomplete. ' +
        'Page the request by county before writing.',
    );
  }

  log('jurisdictions', `fetched ${json.features.length} county subdivisions from Census TIGERweb`);
  return json.features;
}

async function main() {
  const [raw, counties] = await Promise.all([fetchSubdivisions(), loadCounties()]);

  // County FIPS -> county name, so a subdivision can name its county without
  // a second lookup in the browser.
  const countyByFips = new Map(
    counties.features.map((f) => [f.properties.geoid, f.properties.name]),
  );

  const features = [];
  const dropped = [];

  for (const f of raw) {
    const p = f.properties;
    const cls = CLASS_CODES[p.COUSUBCC];

    if (cls === null) {
      dropped.push(p.NAME);
      continue;
    }
    if (!cls) {
      // An unrecognised class code is a change upstream, not a record to guess
      // at. Which office answers depends entirely on this field.
      throw new Error(
        `unknown county subdivision class "${p.COUSUBCC}" on ${p.NAME} (${p.GEOID}); ` +
          'classify it in CLASS_CODES before publishing',
      );
    }

    const countyFips = `${STATE_FIPS}${p.COUNTY}`;
    const county = countyByFips.get(countyFips) ?? null;
    if (!county) {
      throw new Error(`no county reference for FIPS ${countyFips} (${p.NAME})`);
    }

    const lat = Number(p.INTPTLAT);
    const lng = Number(p.INTPTLON);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new Error(`${p.NAME} (${p.GEOID}) has no interior point`);
    }

    features.push({
      type: 'Feature',
      geometry: f.geometry,
      properties: {
        geoid: p.GEOID,
        // "Waterford township", "Northfield city" — the suffix is how a reader
        // tells two governments with the same name apart, and Minnesota has
        // plenty of those. Kept rather than stripped.
        name: p.NAME,
        basename: p.BASENAME,
        kind: cls.kind,
        /**
         * Whether this unit has a government of its own. False means the
         * county governs here, and every question a reader might take to a
         * town board goes to the county board instead.
         */
        governed: cls.governed,
        county,
        countyFips,
        state: STATE_USPS,
        // Interior point: guaranteed to fall inside the polygon, unlike the
        // centre of a bounding box.
        lat,
        lng,
        landSqMi: Number(p.AREALAND) / 2_589_988.11,
      },
    });
  }

  if (dropped.length) {
    log('jurisdictions', `dropped ${dropped.length} water-only subdivisions with no government`);
  }

  const byKind = features.reduce((acc, f) => {
    acc[f.properties.kind] = (acc[f.properties.kind] ?? 0) + 1;
    return acc;
  }, {});
  const ungoverned = features.filter((f) => !f.properties.governed).length;

  const provenance = {
    source: 'US Census Bureau — TIGERweb county subdivisions',
    sourceUrl:
      'https://tigerweb.geo.census.gov/tigerwebmain/TIGERweb_apps.html',
    license: 'Public domain (US federal government work)',
    attribution: 'U.S. Census Bureau',
    simplifiedDegrees: SIMPLIFY,
    lastUpdated: new Date().toISOString(),
  };

  const notes = [
    `Boundaries are simplified to ${SIMPLIFY}° (roughly 200 m). Within about that ` +
      'distance of a boundary the containing jurisdiction may be reported wrongly.',
    'Census county subdivisions are a statistical geography. They track Minnesota ' +
      'cities and townships closely, but annexations and detachments reach this ' +
      'source on the Census update cycle, not on the day they take effect.',
    `${ungoverned} subdivisions have no local government of their own; the county ` +
      'is the local government there.',
    'A jurisdiction boundary says which government you live under. It does not say ' +
      'who operates any particular camera — a county, a neighbouring city, a state ' +
      'agency, or a private operator may all run equipment inside these lines.',
  ];

  await writeReferenceJson('mn-jurisdictions.geojson', {
    type: 'FeatureCollection',
    metadata: { ...provenance, notes },
    features,
  });
  log(
    'jurisdictions',
    `wrote ${features.length} boundaries -> public/data/reference/mn-jurisdictions.geojson`,
  );

  /**
   * The search index: what the lookup needs and nothing else.
   *
   * Shipped on every page that offers the lookup, so the shape is chosen for
   * size. Carrying the full property bag cost 615 KB, most of it land area
   * nobody reads and interior points at seven decimal places — centimetres,
   * for a number used to centre a card. Trimmed and rounded to five decimals
   * (about a metre) it is a third of that.
   */
  const index = features
    .map((f) => {
      const p = f.properties;
      return {
        geoid: p.geoid,
        name: p.name,
        kind: p.kind,
        governed: p.governed,
        county: p.county,
        countyFips: p.countyFips,
        lat: Number(p.lat.toFixed(5)),
        lng: Number(p.lng.toFixed(5)),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  await writeReferenceJson('mn-jurisdictions.json', {
    metadata: {
      ...provenance,
      note:
        'Shipped so the lookup runs entirely in the browser, with no geocoding ' +
        'request to any third party.',
      notes,
    },
    jurisdictions: index,
  });
  log('jurisdictions', `wrote ${index.length} entries -> public/data/reference/mn-jurisdictions.json`);
  log(
    'jurisdictions',
    `${byKind.city ?? 0} cities, ${byKind.township ?? 0} townships, ` +
      `${byKind.unorganized ?? 0} unorganized territories (${ungoverned} without a local government)`,
  );
}

main().catch((err) => {
  console.error(`[jurisdictions] FAILED: ${err.message}`);
  process.exit(1);
});

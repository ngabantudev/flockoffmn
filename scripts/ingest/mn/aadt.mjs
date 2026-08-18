#!/usr/bin/env node
/**
 * Roadway traffic volume — MnDOT Annual Average Daily Traffic.
 *
 * The substrate layer's missing half. Data centers are where the computing
 * sits; this is the ground the recording actually happens on — how much
 * traffic each stretch of Minnesota road carries in an average day, counted by
 * the agency that owns the roads.
 *
 * It belongs beside the camera layers rather than inside them, and the
 * distinction is the whole point of putting it under infrastructure: a plate
 * reader records the vehicles that pass it, and this records how many vehicles
 * pass. One is surveillance and the other is the capacity surveillance is
 * mounted on. A high-volume segment with no mapped reader is not a watched
 * road, and a reader on an empty county road is not made busy by being there.
 *
 * MnDOT publishes this as an open ArcGIS feature service with no key and no
 * licence restriction, so we query it directly rather than scraping a viewer.
 */

import {
  fetchWithRetry,
  writeLayer,
  loadCounties,
  normaliseCounty,
  thinRing,
  log,
} from '../lib/util.mjs';

const SERVICE =
  'https://webgis.dot.state.mn.us/65agsf1/rest/services/sdw_incdt/AADT_SEGMENT_CURRENT/FeatureServer/0';
const LANDING = 'https://www.dot.state.mn.us/traffic/data/';
const ITEM = 'https://www.arcgis.com/home/item.html?id=42923bcddafe4909b4eed0a03dea893a';

/** The server caps a page at 4000 and reports whether more remain. */
const PAGE = 4000;

/**
 * How far the server may move a vertex when it generalises, in degrees.
 *
 * Un-generalised, the statewide extract is roughly 50 MB of coordinates at
 * seventeen decimal places — more than Cloudflare Pages will serve as a single
 * file, and an unreasonable thing to hand a phone. 0.00005° is about six
 * metres at this latitude, which is under the width of the roads being drawn:
 * it removes vertices no one could see without changing which road a line is.
 *
 * This is a drawing convention and the layer's limitations say so. It is not a
 * claim about where the centreline runs to the metre.
 */
const OFFSET = 0.00005;

/** Metres of vertex movement, for the limitation text, so the two cannot drift. */
const OFFSET_M = Math.round(OFFSET * 111_320);

/**
 * Route prefixes, decoded exactly as MnDOT's own metadata decodes them.
 *
 * Quoted from the ROUTE_LABEL attribute definition: "where I=Interstate
 * Highway, US=US Highway, MN=MN State Highway, CSAH=County State Aid Highway,
 * CR=County Road, MSAS=Municipal State Aid Street."
 *
 * Published here because it is documented — and only these six, because
 * these six are documented. Guessing a road class from a street name is
 * refused rather than attempted for anything outside this list.
 */
const ROUTE_CLASSES = [
  ['I', 'Interstate highway'],
  ['US', 'US highway'],
  ['MN', 'State highway'],
  ['CSAH', 'County state-aid highway'],
  ['CR', 'County road'],
  ['MSAS', 'Municipal state-aid street'],
];

/**
 * Drop the keys with nothing in them.
 *
 * A null attribute still costs its key and six bytes of `":null,"` in the
 * file, and every consumer here — the filter builder, the detail panel, the
 * map's own expressions — already treats a missing key and a null one the
 * same way. On a layer with 40,344 records that is most of a megabyte to say
 * nothing, which the browser then has to parse before it can draw a road.
 */
function without(attributes) {
  return Object.fromEntries(Object.entries(attributes).filter(([, v]) => v !== null));
}

function clean(v) {
  const s = (v ?? '').toString().trim();
  // MnDOT writes a bare hyphen where a community does not apply.
  return s === '' || s === '-' || s.toLowerCase() === 'null' ? null : s;
}

/** Decode the documented prefix of a route label; never infer one. */
function roadClass(routeLabel) {
  const label = clean(routeLabel);
  if (!label) return 'Not on a numbered route';
  const prefix = label.split(/\s+/)[0].toUpperCase();
  const hit = ROUTE_CLASSES.find(([code]) => code === prefix);
  return hit ? hit[1] : 'Other or unclassified route';
}

/**
 * Normalise to MultiLineString-or-LineString with thinned coordinates.
 *
 * Named apart from util.mjs's thinGeometry, which it shares thinRing with but
 * not its contract: this one also drops degenerate lines and collapses a
 * one-part MultiLineString, both specific to road segments.
 */
function thinLineGeometry(geometry) {
  if (!geometry) return null;
  if (geometry.type === 'LineString') {
    const line = thinRing(geometry.coordinates);
    return line.length >= 2 ? { type: 'LineString', coordinates: line } : null;
  }
  if (geometry.type === 'MultiLineString') {
    const parts = geometry.coordinates.map(thinRing).filter((l) => l.length >= 2);
    if (!parts.length) return null;
    return parts.length === 1
      ? { type: 'LineString', coordinates: parts[0] }
      : { type: 'MultiLineString', coordinates: parts };
  }
  return null;
}

async function fetchPage(offset) {
  const params = new URLSearchParams({
    where: '1=1',
    outFields: [
      'LOCATION_ID',
      'CURRENT_VOLUME',
      'CURRENT_YEAR',
      'ROUTE_LABEL',
      'STREET_NAME',
      'LOCATION_DESCRIPTION',
      'COUNTY',
      'COMMUNITY',
      'JURISDICTION',
      'DATA_TYPE',
      'COLLECTION_CYCLE',
    ].join(','),
    returnGeometry: 'true',
    outSR: '4326',
    maxAllowableOffset: String(OFFSET),
    resultRecordCount: String(PAGE),
    resultOffset: String(offset),
    f: 'geojson',
  });
  const res = await fetchWithRetry(`${SERVICE}/query?${params}`, { timeoutMs: 120_000 });
  return res.json();
}

async function totalCount() {
  const params = new URLSearchParams({ where: '1=1', returnCountOnly: 'true', f: 'json' });
  const res = await fetchWithRetry(`${SERVICE}/query?${params}`, { timeoutMs: 45_000 });
  return (await res.json()).count ?? null;
}

async function main() {
  const [total, counties] = await Promise.all([totalCount(), loadCounties()]);
  log('aadt', `${total} segments published by MnDOT`);

  // County name -> the reference county, so 40k segments cost one lookup each
  // instead of a point-in-polygon test against every county in the state.
  // MnDOT names the county on every record; we only need its GEOID.
  const byCounty = new Map(
    counties.features.map((c) => [normaliseCounty(c.properties.name), c.properties]),
  );

  const raw = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await fetchPage(offset);
    const got = page.features ?? [];
    raw.push(...got);
    log('aadt', `  fetched ${raw.length}/${total}`);
    if (!page.properties?.exceededTransferLimit && got.length < PAGE) break;
    if (!got.length) break;
  }
  if (!raw.length) throw new Error('MnDOT returned no AADT segments');

  let droppedGeometry = 0;
  let missingVolume = 0;
  let unmatchedCounty = 0;

  const features = [];
  for (const f of raw) {
    const p = f.properties ?? {};
    const geometry = thinLineGeometry(f.geometry);
    if (!geometry) {
      droppedGeometry++;
      continue;
    }

    const countyName = clean(p.COUNTY);
    const county = byCounty.get(normaliseCounty(countyName ?? ''));
    if (countyName && !county) unmatchedCounty++;

    const volume = Number.isFinite(p.CURRENT_VOLUME) ? Math.round(p.CURRENT_VOLUME) : null;
    if (volume === null) missingVolume++;

    const route = clean(p.ROUTE_LABEL);
    const street = clean(p.STREET_NAME);
    const where = clean(p.LOCATION_DESCRIPTION);
    const name = [route ?? street ?? 'Unnamed road segment', where].filter(Boolean).join(' — ');

    features.push({
      type: 'Feature',
      geometry,
      properties: {
        id: `aadt-${p.LOCATION_ID}`,
        layer: 'aadt',
        name,
        county: county?.name ?? countyName,
        state: 'MN',
        countyFips: county?.geoid ?? null,
        // The segment and its owner are recorded fact; the volume on it is an
        // estimate from a count taken in CURRENT_YEAR and carried forward
        // un-adjusted. That is a reported figure, not a measured one for today.
        confidence: 'reported',
        // A year, not a date. This once carried `${year}-01-01`, which put a
        // January the first on 40,344 records that MnDOT dates only to the
        // year — a fabricated precision the detail panel then displayed as
        // though it were the day of the count. The year is in `countYear`,
        // where it is labelled as what it is.
        sourceDate: null,
        attributes: without({
          aadt: volume,
          countYear: p.CURRENT_YEAR ?? null,
          roadClass: roadClass(route),
          // Only where there is no route label, because there it is the
          // segment's only identity. Everywhere else the route and the
          // location are already in `name`, and at 40,344 records a
          // duplicated string is megabytes.
          streetName: route ? null : street,
          community: clean(p.COMMUNITY),
          jurisdiction: clean(p.JURISDICTION),
          // Carried as the raw code. MnDOT's metadata defines the field as
          // "Category of traffic data based on how it was derived, sourced, or
          // calculated" but publishes no lookup for the codes themselves, so
          // spelling them out here would be inventing the meaning.
          dataType: clean(p.DATA_TYPE),
          collectionCycle: clean(p.COLLECTION_CYCLE),
        }),
      },
    });
  }

  const withVolume = features.filter((f) => f.properties.attributes.aadt !== null);
  const years = withVolume.map((f) => f.properties.attributes.countYear).filter(Boolean);
  const busiest = withVolume.reduce(
    (a, b) => (b.properties.attributes.aadt > (a?.properties.attributes.aadt ?? -1) ? b : a),
    null,
  );
  log('aadt', `${features.length} segments kept; busiest ${busiest?.properties.attributes.aadt} on ${busiest?.properties.name}`);
  log('aadt', `count years ${Math.min(...years)}–${Math.max(...years)}`);

  await writeLayer('aadt', {
    layer: 'aadt',
    provenance: {
      source: 'MnDOT — Annual Average Daily Traffic Segments, Current',
      sourceUrl: LANDING,
      datasetUrl: ITEM,
      serviceUrl: SERVICE,
      // Quoted verbatim from the dataset's own licence field.
      license:
        'No licence restriction stated. MnDOT: "None. Please check sources, scale, accuracy, currentness and other available information. Please confirm that you are using the most recent copy of both data and metadata. Acknowledgement of the publisher would be appreciated."',
      licenseUrl: ITEM,
      attribution: 'Minnesota Department of Transportation',
      sourceDate: years.length ? `${Math.max(...years)}-01-01` : null,
      refresh: 'periodic',
      publishedSegmentCount: total,
      earliestCountYear: years.length ? Math.min(...years) : null,
      latestCountYear: years.length ? Math.max(...years) : null,
    },
    knownGaps: [
      'AADT is an average, not a measurement of any day. It is the estimated number of vehicles crossing a point on a typical day across a whole year, so it flattens rush hour, holidays, closures and seasonal traffic into one number.',
      'Counts are taken on a rotating cycle of two to twelve years, not annually. Each segment carries the year its own count was taken, and MnDOT states the value is "not growth factored" — an older segment is that year\'s figure carried forward unchanged, not an estimate of traffic today.',
      'Only sampled roads appear. A road with no segment here was not counted, which is not the same as a road with no traffic. Coverage is thinnest on local streets that no state-aid programme requires a count for.',
      `Geometry is generalised by the publisher's server to about ${OFFSET_M} metres and coordinates are rounded to five decimal places, because the full-precision statewide extract is around 50 MB. This shifts vertices by less than the width of a road and is a drawing convention, not a survey.`,
      'DATA_TYPE is carried as the raw code MnDOT publishes. Their metadata defines the field as a category of how the value was derived but publishes no lookup for the codes, so this layer shows the letter rather than a meaning invented for it.',
      'Road class is decoded only from the route-label prefixes MnDOT documents. Anything else is filed as unclassified rather than guessed from a street name.',
      "MnDOT records a per-segment note on how each figure was produced (AADT_COMMENTS, e.g. \"24 See Hist, 10 Avg Curr\"). It is not carried here: it is unique on roughly half the segments and cost several megabytes of a file that has a hard size ceiling. It is in the source service, which is linked, and no other field was dropped to save space.",
      'This describes roads and the vehicles on them in aggregate. It records no vehicle, no trip and no person, and a busy segment is not evidence that anything on it is watched.',
    ],
    features,
  });

  if (droppedGeometry) log('aadt', `${droppedGeometry} segments had no usable geometry and were dropped`);
  if (missingVolume) log('aadt', `${missingVolume} segments carry no volume figure`);
  if (unmatchedCounty) log('aadt', `${unmatchedCounty} segments named a county absent from the reference`);
}

main().catch((err) => {
  console.error(`[aadt] FAILED: ${err.message}`);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * L1 — ALPR / Flock cameras.
 *
 * Pulls ALPR camera nodes tagged in OpenStreetMap by DeFlock volunteers,
 * scoped to Minnesota via its OSM administrative boundary. ODbL data, no API
 * key.
 *
 * We deliberately do not filter on `manufacturer=Flock Safety`: most
 * contributors omit the tag, and the surveillance question is about the
 * capability, not the vendor. Manufacturer is carried through as an attribute
 * so it can still be filtered in the UI.
 *
 * Every record is marked `probabilistic`. The map must never imply that this
 * layer is complete or current — see the layer's limitations in the registry.
 */

import { writeLayer, log, loadCounties, slugId, queryOverpass } from './lib/util.mjs';
import { findContaining } from '../../src/lib/geo.mjs';

const STATE_ISO = process.env.STATE_ISO ?? 'US-MN';
const STATE_USPS = process.env.STATE_USPS ?? 'MN';

const QUERY = `
[out:json][timeout:180];
area["ISO3166-2"="${STATE_ISO}"]["admin_level"="4"]->.scope;
(
  node["surveillance:type"="ALPR"](area.scope);
  node["man_made"="surveillance"]["manufacturer"="Flock Safety"](area.scope);
);
out body;
`.trim();

function cleanTag(v) {
  const s = (v ?? '').toString().trim();
  return s === '' ? null : s;
}

/**
 * Who runs a reader, sorted into kinds.
 *
 * `operator` is free text a volunteer typed, so this is keyword-matching a
 * human's phrasing and nothing more. It records what a word in that field
 * suggests, never a verified fact about a contract — "Eagan" is a city and
 * "Paul Bunyan Drug Task Force" is several agencies at once, and both come out
 * of one string with no schema behind it.
 *
 * The commonest answer by a wide margin is that nobody wrote anything down.
 * That is the point of having the field: a reader who filters this layer
 * discovers immediately that most of the network will not say whose it is.
 */
const OPERATOR_KINDS = [
  [/sheriff/i, 'County sheriff'],
  [/state patrol|minnesota state|mn ?dot|department of transportation/i, 'State agency'],
  [/task ?force/i, 'Multi-agency task force'],
  // `pd\b` without a leading boundary, so "SLMPD" lands with the police rather
  // than in the bin for everything the patterns miss.
  [/police|pd\b|public safety/i, 'Police department'],
  [/school|isd\b|university|college|campus/i, 'School or campus'],
  [/flock/i, 'Vendor-operated (Flock)'],
  [/\bhoa\b|homeowner|association|neighborhood|neighbourhood/i, 'Neighbourhood association'],
];

function operatorKind(operator) {
  if (!operator) return 'Not recorded';
  for (const [pattern, label] of OPERATOR_KINDS) {
    if (pattern.test(operator)) return label;
  }
  // Municipalities named without a suffix ("Eagan"), shops and congregations
  // all land here. Calling it "private" would be wrong for half of them.
  return 'Other or unclassified';
}

async function main() {
  const data = await queryOverpass('alpr', QUERY);
  const nodes = (data.elements ?? []).filter((e) => e.type === 'node' && e.lat != null);
  log('alpr', `Overpass returned ${nodes.length} camera nodes`);
  if (!nodes.length) throw new Error('Overpass returned no cameras; refusing to overwrite the layer');

  const counties = await loadCounties();

  let unassigned = 0;
  const features = nodes.map((node) => {
    const t = node.tags ?? {};
    const point = [node.lon, node.lat];
    const county = findContaining(point, counties.features);
    if (!county) unassigned++;

    // `operator` is the agency running the camera — an institution, which is
    // exactly the kind of thing this project exists to surface.
    const operator = cleanTag(t.operator);
    const manufacturer = cleanTag(t.manufacturer);

    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [node.lon, node.lat] },
      properties: {
        id: slugId('alpr', 'osm', String(node.id)),
        layer: 'alpr',
        // These devices have no public name; label by operator when known.
        name: operator ? `ALPR camera — ${operator}` : 'ALPR camera',
        county: county?.properties.name ?? null,
        state: STATE_USPS,
        countyFips: county?.properties.geoid ?? null,
        // Crowd-sourced: presence, position and aim are all best-effort.
        confidence: 'probabilistic',
        sourceDate: null,
        attributes: {
          operator,
          operatorType: operatorKind(operator),
          manufacturer,
          cameraType: cleanTag(t['camera:type']),
          direction: cleanTag(t.direction),
          zone: cleanTag(t['surveillance:zone']),
          surveillance: cleanTag(t.surveillance),
          osmId: node.id,
          osmUrl: `https://www.openstreetmap.org/node/${node.id}`,
        },
      },
    };
  });

  if (unassigned) {
    log('alpr', `warning: ${unassigned} cameras fell outside every county polygon (likely border/simplification)`);
  }

  const withManufacturer = features.filter((f) => f.properties.attributes.manufacturer).length;
  const withDirection = features.filter((f) => f.properties.attributes.direction).length;
  log('alpr', `${withManufacturer} have a manufacturer tag; ${withDirection} record a direction`);

  await writeLayer('alpr', {
    layer: 'alpr',
    provenance: {
      source: 'OpenStreetMap via Overpass API (DeFlock tagging convention)',
      sourceUrl: 'https://deflock.me',
      license: 'ODbL 1.0',
      licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
      attribution: '© OpenStreetMap contributors, ODbL — mapped by DeFlock volunteers',
      sourceDate: null,
      refresh: 'frequent',
    },
    knownGaps: [
      'Crowd-sourced and incomplete: the absence of a camera here is not evidence that none exists.',
      'Historical, not real-time. Devices are removed, moved and re-aimed without notice.',
      `Only ${withManufacturer} of ${features.length} records identify a manufacturer, so this is an ALPR layer rather than a Flock-only layer.`,
      unassigned ? `${unassigned} cameras could not be matched to a county polygon.` : null,
    ].filter(Boolean),
    features,
  });
}

main().catch((err) => {
  console.error(`[alpr] FAILED: ${err.message}`);
  process.exit(1);
});

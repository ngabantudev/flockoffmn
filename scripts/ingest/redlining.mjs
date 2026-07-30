#!/usr/bin/env node
/**
 * L5 — Historical policy: HOLC redlining zones.
 *
 * Mapping Inequality (University of Richmond) publishes the digitised 1930s
 * Home Owners' Loan Corporation security maps as one national GeoJSON. We
 * take the state subset and normalise it into the common feature schema.
 *
 * Per spec §11 we overlay and attribute rather than rebuild: the georeference
 * work is theirs, and the layer links back to their city-level scans.
 *
 * Racial covenants are a separate and finer-grained record held by Mapping
 * Prejudice (University of Minnesota) under terms that ask for direct
 * engagement rather than blind redistribution, so this project links to their
 * maps instead of copying them. See the /sources page.
 */

import { fetchWithRetry, writeLayer, loadCounties, log, slugId } from './lib/util.mjs';
import { findContaining, representativePoint } from '../../src/lib/geo.mjs';

const SOURCE =
  'https://dsl.richmond.edu/panorama/redlining/static/mappinginequality.json';
const STATE_USPS = process.env.STATE_USPS ?? 'MN';

/**
 * What HOLC's grades actually meant. The appraisal language is quoted because
 * paraphrasing it tends to sand off how explicit the racial criteria were.
 */
const GRADE_MEANING = {
  A: 'Graded "Best" — new, homogeneous, and in HOLC\'s words "in demand as residential locations in good times and bad". In practice, restricted to white residents.',
  B: 'Graded "Still Desirable" — expected to hold value, but nearing the end of its most desirable period.',
  C: 'Graded "Definitely Declining" — described as an area of "infiltration of a lower grade population", language HOLC applied to the arrival of Black, Jewish and immigrant residents.',
  D: 'Graded "Hazardous" — outlined in red. Lending was withheld here for decades. Grades turned explicitly on the race, ethnicity and immigration status of residents.',
  E: 'Recorded in some surveys for commercial or industrial land rather than a residential grade.',
};

const CATEGORY_FALLBACK = 'No grade recorded on the original survey sheet.';

async function main() {
  const res = await fetchWithRetry(SOURCE, { timeoutMs: 120_000 });
  const all = await res.json();
  log('redlining', `source contains ${all.features.length} graded areas nationally`);

  const scoped = all.features.filter((f) => f.properties?.state === STATE_USPS);
  if (!scoped.length) throw new Error(`no HOLC areas found for ${STATE_USPS}`);

  const cities = [...new Set(scoped.map((f) => f.properties.city))].sort();
  log('redlining', `${scoped.length} areas across ${cities.length} cities: ${cities.join(', ')}`);

  const counties = await loadCounties();

  const features = scoped.map((f) => {
    const p = f.properties;
    const grade = p.grade || null;
    // Assign a county by the zone's representative point so the "near me"
    // panel and the county filter behave the same as for point layers.
    const county = findContaining(representativePoint(f.geometry), counties.features);

    return {
      type: 'Feature',
      geometry: f.geometry,
      properties: {
        id: slugId('redlining', STATE_USPS, p.city, String(p.area_id)),
        layer: 'redlining',
        name: `${p.city} — HOLC area ${p.label ?? p.area_id}${grade ? ` (grade ${grade})` : ''}`,
        county: county?.properties.name ?? null,
        state: STATE_USPS,
        countyFips: county?.properties.geoid ?? null,
        confidence: 'confirmed',
        // The HOLC surveys were carried out in the late 1930s.
        sourceDate: '1930s',
        attributes: {
          grade,
          gradeMeaning: grade ? (GRADE_MEANING[grade] ?? CATEGORY_FALLBACK) : CATEGORY_FALLBACK,
          category: p.category ?? null,
          city: p.city,
          holcId: p.label ?? null,
          areaId: p.area_id,
          residential: p.residential ?? null,
          // Colour HOLC itself used on the original map sheet.
          holcFill: p.fill ?? null,
          cityScan: `https://dsl.richmond.edu/panorama/redlining/map/${STATE_USPS}/${encodeURIComponent(
            (p.city ?? '').replace(/\s+/g, ''),
          )}`,
        },
      },
    };
  });

  const byGrade = features.reduce((acc, f) => {
    const g = f.properties.attributes.grade ?? 'ungraded';
    acc[g] = (acc[g] ?? 0) + 1;
    return acc;
  }, {});
  log('redlining', `grades: ${Object.entries(byGrade).map(([k, v]) => `${k}=${v}`).join(', ')}`);

  await writeLayer('redlining', {
    layer: 'redlining',
    provenance: {
      source: 'Mapping Inequality, Digital Scholarship Lab, University of Richmond',
      sourceUrl: 'https://dsl.richmond.edu/panorama/redlining/',
      datasetUrl: SOURCE,
      // Note: NOT relicensable as CC BY 4.0 alongside our own compiled data.
      license: 'CC BY-NC-SA 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
      attribution:
        'Robert K. Nelson, LaDale Winling, et al., "Mapping Inequality: Redlining in New Deal America", American Panorama, ed. Robert K. Nelson and Edward L. Ayers',
      sourceDate: '1935-1940',
      refresh: 'rare',
      nationalAreaCount: all.features.length,
    },
    knownGaps: [
      `Only the ${cities.length} Minnesota cities HOLC surveyed appear: ${cities.join(', ')}. A neighbourhood with no polygon was not necessarily spared housing discrimination — it may simply never have been graded.`,
      'Boundaries are georeferenced from hand-drawn 1930s map sheets and are approximate.',
      'Racial covenants are a separate record, mapped by Mapping Prejudice at the University of Minnesota, and are linked rather than duplicated here.',
      'This layer is CC BY-NC-SA 4.0 and cannot be redistributed under this project\'s own CC BY 4.0 data terms.',
    ],
    features,
  });
}

main().catch((err) => {
  console.error(`[redlining] FAILED: ${err.message}`);
  process.exit(1);
});

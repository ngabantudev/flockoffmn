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
 *
 * The polygon file carries no demographic content at all — only a grade and a
 * label. What the appraisers actually wrote about who lived in each area is a
 * second dataset, the transcribed "area description" survey sheets, joined
 * here on `area_id`. That text is the whole evidentiary point of the layer:
 * the grade tells you a neighbourhood was redlined, the description tells you
 * the appraiser said it was because Black, Mexican, Chinese or Jewish people
 * lived there.
 */

import {
  fetchWithRetry,
  writeLayer,
  loadCounties,
  loadPublicJson,
  log,
  slugId,
} from '../lib/util.mjs';
import { findContaining, representativePoint } from '../../../src/lib/geo.mjs';

const SOURCE =
  'https://dsl.richmond.edu/panorama/redlining/static/mappinginequality.json';

// ~37 MB, and there is no per-state subset published, so we filter after the
// fetch. Same project as the polygons, maintained by the same lab.
const DESCRIPTIONS_SOURCE =
  'https://raw.githubusercontent.com/americanpanorama/HOLC_Area_Description_Data/master/ad_data.json';

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

/**
 * HOLC used several survey forms over the years. Two shapes matter here:
 *
 *   form 1 — a free-text narrative and nothing else. This is the form used
 *            for every Minnesota city, so for this state's default scope
 *            there are no structured demographic fields to read at all.
 *   later  — a printed form with its own boxes for the share of Black
 *            residents, the share and nationality of foreign-born residents,
 *            and a box HOLC titled "Infiltration of".
 *
 * We keep whichever exists and record which form it came from, because
 * "no percentage recorded" and "a percentage of zero" are different claims.
 */
const NARRATIVE_FORM_ID = 1;

/**
 * The year of each city's map sheet, as Mapping Inequality's own city register
 * records it.
 *
 * The polygon file carries no year at all, and neither does the area
 * description file, so a layer built from them alone can only say "the 1930s".
 * The project does publish the year per city — its map viewer routes on it —
 * and for two Minnesota cities it is known. For the other six the register's
 * value is literally "19XX": Mapping Inequality does not know either.
 *
 * That distinction is worth carrying. "1937" and "sometime in the HOLC City
 * Survey period" are different statements, and a reader comparing this layer
 * against a covenant recorded in 1934 or a Metropolitan Council file stamped
 * 1934 needs to know which one they have. An unknown year is published as
 * unknown rather than rounded to a decade that reads like a finding.
 *
 * Checked against the register on 2026-08-14. Cities absent from this map get
 * no year, which is the same thing the register says about them.
 */
const CITY_SURVEY_YEAR = {
  Duluth: '1936',
  Minneapolis: '1937',
};

/** What HOLC's City Survey Program window was, for cities with no recorded year. */
const PROGRAM_WINDOW = '1935–1940';

/**
 * Groups the appraisers named, matched against their own vocabulary.
 *
 * This is a keyword match over the survey text, not a demographic measurement
 * — it records that an appraiser wrote a word, and nothing more. The dated and
 * slur-adjacent terms on the right are HOLC's; the labels on the left are ours.
 * `knownGaps` says plainly that this field is derived.
 */
const GROUP_PATTERNS = [
  ['Black', /\bnegro|\bnegre|colou?red\b/i],
  ['Mexican', /\bmexican|spanish[- ]american/i],
  ['Chinese', /\bchinese\b/i],
  ['Japanese', /\bjapanese\b|\bnisei\b/i],
  ['Filipino', /\bfilipino|philipin/i],
  ['Asian (unspecified)', /\boriental|\basiatic/i],
  ['Jewish', /\bjew(s|ish)?\b|\bhebrew\b/i],
];

/** Fields that describe residents rather than terrain, buildings or prices. */
function residentText(ad) {
  return [
    ad.description,
    ad.clarifying_remarks,
    ad.infiltration_of,
    ad.foreign_born_nationality,
    ad.negro_yes_or_no,
    ad.detrimental_influences,
    ad.favorable_influences,
    ad.occupation_or_type,
  ]
    .filter((v) => typeof v === 'string' && v.trim())
    .join(' — ');
}

/** Semicolon-joined list of groups the appraiser named, or null. */
function groupsNamed(ad) {
  const text = residentText(ad);
  if (!text) return null;
  const hits = GROUP_PATTERNS.filter(([, re]) => re.test(text)).map(([label]) => label);
  return hits.length ? hits.join('; ') : null;
}

/**
 * How well this city's map is dated, as a stable code.
 *
 * The three cases are kept apart on purpose: a documented year, a city
 * surveyed under the City Survey Program whose year nobody recorded, and a
 * city mapped outside that programme with no date either. Only the first is a
 * date, and a reader comparing this against a covenant recorded in 1934 needs
 * to know which they have.
 *
 * A code rather than a sentence, because the sentence has to exist in both
 * languages and an attribute is a flat string: the registry's
 * `valueDescriptions` carries the bilingual explanation, which is the same
 * mechanism the grade letters already use.
 */
const DATING = {
  recorded: 'Year recorded upstream',
  window: 'Survey-programme window only',
  none: 'No year recorded',
};

/**
 * What we can honestly say about when a city's map was drawn, and how firmly.
 *
 * One conditional rather than two: the date and the confidence in it are the
 * same decision, and splitting them across two functions called on the same
 * arguments meant two branch orders to keep in step.
 */
function survey(city, citySurvey) {
  if (CITY_SURVEY_YEAR[city]) return { date: CITY_SURVEY_YEAR[city], dating: DATING.recorded };
  if (citySurvey) return { date: PROGRAM_WINDOW, dating: DATING.window };
  return { date: null, dating: DATING.none };
}

/**
 * Which of today's census tracts sit on this graded area, and how much of each.
 *
 * The share is the point, not the list. "This tract was redlined" reads the
 * same whether a D grade covers four per cent of it or ninety, and the second
 * is a finding while the first is close to noise — so the percentage travels
 * with the identifier and a reader can see which one they have. Rendered as
 * text rather than a nested object because the feature schema's attributes are
 * flat scalars by design (src/layers/types.ts) and a join key that has to be
 * parsed out of a blob is a join waiting to go wrong; the machine-readable
 * form is the reference file this is read from.
 *
 * Capped, because an area crossing eleven tracts would otherwise write a
 * paragraph into a detail panel. The count of what was trimmed is kept so the
 * line never implies the list is complete when it is not.
 */
const MAX_TRACTS_LISTED = 6;

function tractList(rows) {
  if (!rows?.length) return null;
  const shown = rows.slice(0, MAX_TRACTS_LISTED).map((r) => {
    if (r.percentOfTract === null) return r.geoid;
    // A row exists only where the two shapes overlap, so a share that rounds
    // away must not be printed as "0%" — that says the opposite of what the
    // record means. Anything under a tenth of a per cent is reported as the
    // sliver it is, zero included: a rounded-to-zero share is still an
    // overlap. Above that, one decimal is as fine as anyone needs to read.
    const share =
      r.percentOfTract < 0.1 ? '<0.1%' : `${Math.round(r.percentOfTract * 10) / 10}%`;
    return `${r.geoid} (${share})`;
  });
  const hidden = rows.length - shown.length;
  // "+3" rather than "+3 more": this value renders under a Spanish label for a
  // Spanish reader, and an attribute is a flat string with no locale of its
  // own, so the overflow marker has to be one that needs no translating.
  return hidden > 0 ? `${shown.join('; ')}; +${hidden}` : shown.join('; ');
}

/** Trim a free-text survey value to a clean string, or null. Never invents one. */
function textOrNull(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  // The transcribers used several spellings of "this box was left empty".
  if (!trimmed || /^(n\/?a|-+|none|nil)$/i.test(trimmed)) return null;
  return trimmed;
}

/**
 * The narrative body of the sheet: form 1 puts it in `description`, the later
 * printed forms put it in the remarks box.
 */
function surveyText(ad) {
  return textOrNull(ad.description) ?? textOrNull(ad.clarifying_remarks);
}

async function fetchDescriptions() {
  const res = await fetchWithRetry(DESCRIPTIONS_SOURCE, { timeoutMs: 180_000 });
  const all = await res.json();
  if (!Array.isArray(all) || !all.length) {
    throw new Error('area description dataset was empty or not an array');
  }
  log('redlining', `area descriptions: ${all.length} transcribed sheets nationally`);

  const byAreaId = new Map();
  for (const ad of all) {
    if (ad.state === STATE_USPS && ad.area_id != null) byAreaId.set(String(ad.area_id), ad);
  }
  return byAreaId;
}

async function main() {
  const res = await fetchWithRetry(SOURCE, { timeoutMs: 120_000 });
  const all = await res.json();
  log('redlining', `source contains ${all.features.length} graded areas nationally`);

  const scoped = all.features.filter((f) => f.properties?.state === STATE_USPS);
  if (!scoped.length) throw new Error(`no HOLC areas found for ${STATE_USPS}`);

  const cities = [...new Set(scoped.map((f) => f.properties.city))].sort();
  log('redlining', `${scoped.length} areas across ${cities.length} cities: ${cities.join(', ')}`);

  const counties = await loadCounties();
  const descriptions = await fetchDescriptions();
  // Optional: the crosswalk is a nice-to-have on a layer whose subject is the
  // 1930s grade, so a missing reference file costs one attribute rather than
  // failing the whole layer. build-all runs holc-tracts first.
  const crosswalk = await loadPublicJson('reference/holc-tract-crosswalk.json', {
    optional: true,
  });
  if (!crosswalk) {
    log('redlining', 'no tract crosswalk on disk — run `npm run data:holc-tracts` to add tract links');
  }

  const features = scoped.map((f) => {
    const p = f.properties;
    const grade = p.grade || null;
    const ad = descriptions.get(String(p.area_id)) ?? null;
    // Assign a county by the zone's representative point so the "near me"
    // panel and the county filter behave the same as for point layers.
    const county = findContaining(representativePoint(f.geometry), counties.features);
    const dating = survey(p.city, p.city_survey);

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
        // The city's own year where one is recorded, the programme window
        // where it is not, and null where even that does not apply. Never a
        // decade standing in for a date nobody has. See CITY_SURVEY_YEAR.
        // The panel already renders this as the record's source date, so it is
        // deliberately not repeated as an attribute — only how firm it is.
        sourceDate: dating.date,
        attributes: {
          grade,
          gradeMeaning: grade ? (GRADE_MEANING[grade] ?? CATEGORY_FALLBACK) : CATEGORY_FALLBACK,
          category: p.category ?? null,
          city: p.city,
          holcId: p.label ?? null,
          areaId: p.area_id,
          residential: p.residential ?? null,
          // Today's tracts sitting on this 1930s area, with the share of each
          // one it covers. Two dated facts about the same ground, adjacent —
          // and nothing computed between them (§1c).
          tracts: tractList(crosswalk?.byArea?.[String(p.area_id)]),
          // How firmly the date beside it is known. The bilingual explanation
          // of each value is in the registry's `valueDescriptions`.
          dating: dating.dating,

          // --- transcribed survey sheet, when one exists for this area ---
          // Absent fields stay null: a box the appraiser left blank is not a
          // zero, and a city with no surviving sheet is not a city with
          // nothing to report.
          surveyText: ad ? surveyText(ad) : null,
          groupsNamed: ad ? groupsNamed(ad) : null,
          // HOLC's own box titles, kept verbatim so the numbers are not
          // mistaken for a census. Values are free text: real ones in this
          // dataset include "trace", "1/5%" and "about 5% of area's population".
          blackResidentsPercent: ad ? textOrNull(ad.negro_percent) : null,
          foreignBornPercent: ad ? textOrNull(ad.foreign_born_percent) : null,
          foreignBornNationality: ad ? textOrNull(ad.foreign_born_nationality) : null,
          infiltrationOf: ad ? textOrNull(ad.infiltration_of) : null,
          surveyForm: ad
            ? ad.form_id === NARRATIVE_FORM_ID
              ? 'Narrative form — no structured demographic boxes'
              : 'Printed form with structured demographic boxes'
            : null,
          hasSurvey: Boolean(ad),

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

  const withSurvey = features.filter((f) => f.properties.attributes.hasSurvey);
  const surveyCities = [
    ...new Set(withSurvey.map((f) => f.properties.attributes.city)),
  ].sort();
  const missingCities = cities.filter((c) => !surveyCities.includes(c));
  log('redlining', `${withSurvey.length}/${features.length} areas have a transcribed survey sheet`);

  const datedCities = cities.filter((c) => CITY_SURVEY_YEAR[c]);
  const undatedCities = cities.filter((c) => !CITY_SURVEY_YEAR[c]);
  // Read off the source rather than off the features we just built from it.
  const nonProgramCities = [
    ...new Set(scoped.filter((f) => !f.properties.city_survey).map((f) => f.properties.city)),
  ].sort();
  log(
    'redlining',
    `years recorded upstream: ${
      datedCities.map((c) => `${c}=${CITY_SURVEY_YEAR[c]}`).join(', ') || 'none'
    }; no year for ${undatedCities.join(', ')}`,
  );

  const withTracts = features.filter((f) => f.properties.attributes.tracts).length;
  log('redlining', `${withTracts}/${features.length} areas carry a 2020 census tract list`);

  const namedTally = {};
  for (const f of withSurvey) {
    const named = f.properties.attributes.groupsNamed;
    if (!named) continue;
    for (const g of named.split('; ')) namedTally[g] = (namedTally[g] ?? 0) + 1;
  }
  log(
    'redlining',
    `groups named in survey text: ${
      Object.entries(namedTally)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k}=${v}`)
        .join(', ') || 'none'
    }`,
  );

  await writeLayer('redlining', {
    layer: 'redlining',
    provenance: {
      source: 'Mapping Inequality, Digital Scholarship Lab, University of Richmond',
      sourceUrl: 'https://dsl.richmond.edu/panorama/redlining/',
      datasetUrl: SOURCE,
      descriptionsUrl: DESCRIPTIONS_SOURCE,
      // Note: NOT relicensable as CC BY 4.0 alongside our own compiled data.
      // The project moved from CC BY-NC-SA 4.0 to CC BY-NC 2.5 with its 2023
      // relaunch; the site's terms page states the current licence.
      license: 'CC BY-NC 2.5',
      licenseUrl: 'https://creativecommons.org/licenses/by-nc/2.5/',
      attribution:
        'Robert K. Nelson, LaDale Winling, et al., "Mapping Inequality: Redlining in New Deal America", American Panorama, ed. Robert K. Nelson and Edward L. Ayers',
      sourceDate: '1935-1940',
      refresh: 'rare',
      nationalAreaCount: all.features.length,
      areasWithSurvey: withSurvey.length,
      // Per-city years as the upstream register records them, so a reader can
      // see which cities are actually dated and which are not.
      citySurveyYears: CITY_SURVEY_YEAR,
      citiesWithNoRecordedYear: undatedCities,
      // Where the years came from, so the claim is checkable rather than
      // resting on a note in the script. The register is embedded in Mapping
      // Inequality's own map application; it is not published as a file, which
      // is why the table is transcribed rather than fetched.
      citySurveyYearSource: 'https://dsl.richmond.edu/panorama/redlining/data',
      areasWithTractLink: withTracts,
      // The tract shares are a second publisher's work joined onto this one's
      // areas, so they are credited as such rather than folded into the
      // primary citation.
      secondarySources: [
        {
          key: 'mi-crosswalk',
          name: 'Mapping Inequality census crosswalk, Digital Scholarship Lab',
          url: 'https://github.com/americanpanorama/mapping-inequality-census-crosswalk',
          license: 'CC BY-NC (version unstated upstream; parent project states 2.5)',
          licenseUrl: 'https://creativecommons.org/licenses/by-nc/2.5/',
          contributes: {
            en: 'Which 2020 census tracts each graded area overlaps, and how much of each tract it covers.',
            es: 'Qué secciones censales de 2020 se superponen a cada área calificada, y qué parte de cada sección cubre.',
          },
        },
      ],
    },
    knownGaps: [
      `Only the ${cities.length} Minnesota cities HOLC surveyed appear: ${cities.join(', ')}. A neighbourhood with no polygon was not necessarily spared housing discrimination — it may simply never have been graded.`,
      'Boundaries are georeferenced from hand-drawn 1930s map sheets and are approximate.',
      `Only ${datedCities.length} of the ${cities.length} Minnesota maps carry a year upstream — ${
        datedCities.map((c) => `${c} ${CITY_SURVEY_YEAR[c]}`).join(', ')
      }. For ${undatedCities.join(', ')} Mapping Inequality records no year at all, so those areas are dated only to HOLC's City Survey Program window (${PROGRAM_WINDOW}) or, where the map was made outside that programme, not dated at all. Any other date attached to these maps elsewhere — including the 1934 stamped on the Metropolitan Council's Twin Cities file — is not supported by the upstream record.`,
      `${nonProgramCities.length} of the ${cities.length} cities — ${nonProgramCities.join(', ')} — were mapped outside HOLC's City Survey Program and use their own category words ("Good", "Fair", "Poor", "Outlying") rather than the A–D grades. They are shown with whatever grade letter the upstream file assigns, which for these cities is frequently none.`,
      `${withSurvey.length} of ${features.length} areas have a transcribed survey sheet${
        missingCities.length ? `; none survives for ${missingCities.join(', ')}` : ''
      }. An area with no sheet is a gap in the record, not evidence that nothing was written.`,
      'Every Minnesota sheet uses HOLC\'s narrative form, which had no boxes for the share of Black or foreign-born residents. The structured percentage fields are therefore empty for this state; the prose is all there is.',
      'Percentages are transcribed verbatim from a hand-filled form and are the appraiser\'s estimate, not a census. Values such as "trace" and "1/5%" appear as written and are deliberately not parsed into numbers.',
      '"Groups named" is derived by keyword-matching the survey prose against the appraisers\' own vocabulary. It records that a word was written about an area — not who actually lived there, and not how many.',
      'The survey text quotes 1930s appraisers directly, including racist language and slurs. It is reproduced unaltered because paraphrasing it conceals how explicit the racial criteria were.',
      'The transcribed descriptions carry no separate licence statement of their own; they are treated here under the Mapping Inequality project\'s CC BY-NC 2.5 terms.',
      'The 2020 census tracts listed on each area are a geometric overlap and nothing more: this share of that tract sits on ground graded this way. It is not a statement that anything about the tract today follows from the grade. The percentage is what makes the difference readable — an area covering four per cent of a tract and one covering ninety are not the same claim.',
      'Tract shares come from the Digital Scholarship Lab\'s own published crosswalk against NHGIS 2020 boundaries, not from an intersection computed here. Areas crossing more than six tracts have the list trimmed, with the number withheld shown; the full table is in public/data/reference/holc-tract-crosswalk.json.',
      'Racial covenants are a separate record, mapped by Mapping Prejudice at the University of Minnesota, and are linked rather than duplicated here.',
      'This layer is CC BY-NC 2.5 and cannot be redistributed under this project\'s own CC BY 4.0 data terms.',
    ],
    features,
  });
}

main().catch((err) => {
  console.error(`[redlining] FAILED: ${err.message}`);
  process.exit(1);
});

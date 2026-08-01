#!/usr/bin/env node
/**
 * L6 — Historical policy: racial covenants, as parcel-level records.
 *
 * A racial covenant is a clause written into a property deed forbidding sale
 * or occupancy to anyone not white. They ran from 1910 to 1955 in Minnesota,
 * were made unenforceable by Shelley v. Kraemer in 1948 and void by state law
 * afterwards, and still sit in the chain of title on tens of thousands of Twin
 * Cities homes.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS LAYER PUBLISHES, AND WHAT IT NEVER WILL
 * ---------------------------------------------------------------------------
 *
 * This layer shipped for a time as a 250-metre aggregate — counts per grid
 * cell, no parcel geometry — out of caution about pointing at individual
 * homes. In August 2026 the project owner revisited that decision: Mapping
 * Prejudice themselves publish these parcel outlines on their own public map,
 * the data is dedicated CC0, and the covenant is a fact about the land
 * recorded in a public county index. So the layer now shows what the source
 * shows: the lot the restriction was written onto.
 *
 * The line that did not move is personal data. The upstream record carries
 * the seller and buyer named in the deed, the present-day street address, the
 * county parcel PIN, and the deed document number. None of that is ingested,
 * ever. What ships per parcel is the lot shape, the deed year, the city, the
 * county, and the covenant clause itself — the restriction, not the people.
 * `assertNoPersonalData` runs over the finished output and throws rather than
 * write a file that leaked a name, an address, or a parcel identifier,
 * because a rule enforced only by good intentions is not enforced.
 *
 * A parcel outline says "a covenant was recorded on this lot". It says
 * nothing about who lives there now, and the layer's limitations text says
 * so in both languages.
 */

import { fetchWithRetry, writeLayer, log, slugId } from './lib/util.mjs';

/**
 * Mapping Prejudice publish one repository directory per county. The GeoJSON
 * is stored in Git LFS, so it comes from the media host — raw.githubusercontent
 * returns the 133-byte pointer file instead.
 */
const SOURCE_BASE =
  'https://media.githubusercontent.com/media/UMNLibraries/mp-us-racial-covenants/main';

const REPO_URL = 'https://github.com/UMNLibraries/mp-us-racial-covenants';

/** Every Minnesota county the project has published so far. */
const COUNTIES = [
  'anoka',
  'dakota',
  'hennepin',
  'olmsted',
  'ramsey',
  'sherburne',
  'stearns',
  'washington',
];

/**
 * Fields read from the upstream record. An allow-list rather than a
 * block-list: a block-list silently passes through whatever the upstream adds
 * later, and the failure mode of getting that wrong is publishing a name.
 *
 * `db_id` is Mapping Prejudice's own database row number — an identifier of
 * the record, not of a person or a parcel — kept only to give each feature a
 * stable id between builds.
 */
const KEEP = new Set(['db_id', 'deed_year', 'city', 'cov_text', 'cnty_name', 'cnty_fips']);

/** Fields known to name or locate a person, listed so the assertion can name them. */
const PERSONAL_FIELDS = [
  'seller',
  'buyer',
  'street_add',
  'geocd_addr',
  'zip_code',
  'cnty_pin',
  'doc_num',
];

const streetish =
  /\b\d{1,6}\s+\w+.*\b(avenue|ave|street|st|road|rd|drive|dr|lane|ln|boulevard|blvd|place|pl|court|ct|way|terrace)\b/i;

/**
 * Refuse to write a layer that carries a name, an address, or a parcel
 * identifier. Geometry is allowed now; the people never are.
 *
 * Runs on every build. A false positive costs a developer five minutes; a
 * false negative publishes a private individual.
 */
function assertNoPersonalData(features) {
  for (const f of features) {
    const attrs = f.properties.attributes;
    for (const key of Object.keys(attrs)) {
      const lower = key.toLowerCase().replace(/_/g, '');
      for (const banned of PERSONAL_FIELDS) {
        if (lower === banned.replace(/_/g, '')) {
          throw new Error(`personal field "${key}" survived into the output on ${f.properties.id}`);
        }
      }
    }
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'covenantText') continue; // handled by scrubText before this runs
      if (typeof value === 'string' && streetish.test(value)) {
        throw new Error(`"${key}" looks like a street address on ${f.properties.id}`);
      }
    }
  }
}

function cleanText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed || null;
}

/**
 * The covenant clause, dropped entirely if it embeds a street address.
 *
 * The clause is template boilerplate and the evidentiary point of the layer,
 * but a minority of deeds fold the legal description — sometimes with an
 * address — into the restrictive sentence. A parcel whose text is dropped
 * still ships as a parcel; the map loses one quotation, not the record.
 */
function scrubText(value) {
  const clean = cleanText(value);
  if (!clean) return null;
  if (streetish.test(clean)) return null;
  // Some clauses cite the deed's registrar document number — the same
  // identifier the field allow-list bans as `doc_num`, so it does not ride in
  // through the prose either. The citation stays; the number goes.
  return clean.replace(/\b(doc(?:ument)?s?\.?\s*(?:no|number)s?\.?\s*)[\d,\s-]+/gi, '$1[number withheld] ');
}

/** Round coordinates to six decimals (~0.1 m) — survey precision the file does not need. */
function roundGeometry(geometry) {
  const round = (n) => Math.round(n * 1e6) / 1e6;
  const walk = (coords) =>
    typeof coords[0] === 'number' ? coords.map(round) : coords.map(walk);
  return { type: geometry.type, coordinates: walk(geometry.coordinates) };
}

async function fetchCounty(slug) {
  const url = `${SOURCE_BASE}/mn-${slug}-county/covenants-mn-${slug}-county.geojson`;
  const res = await fetchWithRetry(url, { timeoutMs: 300_000 });
  const collection = await res.json();
  if (!collection?.features?.length) throw new Error(`no covenants returned for ${slug}`);
  return collection.features;
}

/** County FIPS arrives as a bare county code in some files; a GEOID needs the state prefix. */
function countyGeoid(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length === 5) return digits;
  if (digits.length === 3) return `27${digits}`;
  return null;
}

async function main() {
  const features = [];
  const perCounty = {};
  let skipped = 0;
  let textDropped = 0;
  const decadeTally = new Map();

  for (const slug of COUNTIES) {
    const raw = await fetchCounty(slug);
    let kept = 0;

    for (const [i, f] of raw.entries()) {
      // A covenant with no mapped parcel cannot be placed, and guessing a
      // location for a restriction on land would be worse than a gap.
      if (!f.geometry?.coordinates?.length) {
        skipped++;
        continue;
      }

      const p = f.properties ?? {};
      const picked = {};
      for (const key of Object.keys(p)) if (KEEP.has(key)) picked[key] = p[key];

      const year = Number(picked.deed_year);
      const deedYear = Number.isFinite(year) && year > 1800 ? year : null;
      const deedDecade = deedYear ? `${Math.floor(deedYear / 10) * 10}s` : null;
      if (deedDecade) decadeTally.set(deedDecade, (decadeTally.get(deedDecade) ?? 0) + 1);

      const city = cleanText(picked.city);
      const covenantText = scrubText(picked.cov_text);
      if (picked.cov_text && !covenantText) textDropped++;

      features.push({
        type: 'Feature',
        geometry: roundGeometry(f.geometry),
        properties: {
          id: slugId('covenants', slug, String(picked.db_id ?? i)),
          layer: 'racial_covenant',
          // Named by what was recorded and where — never by whose deed it was.
          name: `Racial covenant${city ? ` — ${city}` : ''}${deedYear ? ` (${deedYear})` : ''}`,
          county: cleanText(picked.cnty_name),
          state: 'MN',
          countyFips: countyGeoid(picked.cnty_fips),
          confidence: 'confirmed',
          sourceDate: deedYear ? String(deedYear) : null,
          attributes: {
            deedYear,
            deedDecade,
            city,
            // The clause verbatim: it is a template, not anyone's words about
            // anyone, and paraphrasing it would soften language written to be
            // unambiguous.
            covenantText,
          },
        },
      });
      kept++;
    }

    perCounty[slug] = kept;
    log('covenants', `${slug}: ${kept} covenants mapped (of ${raw.length} records)`);
  }

  if (!features.length) throw new Error('no covenants ingested');

  assertNoPersonalData(features);
  log('covenants', `personal-data assertion passed over ${features.length} parcels`);

  const years = features.map((f) => f.properties.attributes.deedYear).filter((y) => y != null);
  const span = years.length ? `${Math.min(...years)}–${Math.max(...years)}` : 'unknown';
  const sortedDecades = [...decadeTally.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  log('covenants', `deeds by decade: ${sortedDecades.map(([k, v]) => `${k}=${v}`).join(', ')}`);
  log('covenants', `${features.length} covenanted parcels, ${span}`);
  if (skipped) log('covenants', `${skipped} records had no mapped parcel and were dropped`);
  if (textDropped) {
    log('covenants', `${textDropped} clause texts embedded a street address and were dropped (parcels kept)`);
  }

  await writeLayer('covenants', {
    layer: 'racial_covenant',
    provenance: {
      source: 'Mapping Prejudice, University of Minnesota Libraries',
      sourceUrl: 'https://mappingprejudice.umn.edu',
      datasetUrl: REPO_URL,
      license: 'CC0 1.0 Universal',
      licenseUrl: 'https://creativecommons.org/public-domain/cc0/',
      attribution:
        'Ehrman-Solberg, Kevin; Petersen, Penny; Mills, Marguerite; Delegard, Kirsten; Mattke, Ryan; crowdsourcing community mapmakers — U.S. Racial Covenants Series, hosted by Mapping Prejudice',
      sourceDate: '1910-1972',
      refresh: 'rare',
      covenantsMapped: features.length,
      countiesCovered: perCounty,
    },
    knownGaps: [
      'One record per covenanted parcel, showing the lot outline the source publishes. The buyer and seller named in the deed, the present-day street address, the county parcel PIN and the deed document number are deliberately not ingested, and the build fails rather than write a file containing them.',
      'A covenant describes land, not the people on it. Present-day residents of a covenanted property have no connection to the clause and are not the subject of this record.',
      'Only the eight Minnesota counties Mapping Prejudice has published are here. A county with no parcels has not been searched, which is not the same as a county with no covenants.',
      'Covenants are found by reading digitised deeds, so coverage depends on which deed books have been processed. Every count is a floor on the true number, never a ceiling.',
      'A minority of clause texts fold the deed\'s legal description into the restrictive sentence; where that text looks like a street address it is dropped and the parcel ships without its quotation.',
      'Racial covenants were made unenforceable in 1948 and are void today, but the text remains in the chain of title until a homeowner files to discharge it.',
      'Mapping Prejudice describe the period as 1910 to 1955, but some deed years run later, to 1972. Those are shown as recorded rather than corrected or dropped: they may be late recordings of older instruments, or transcription artefacts, and we have not established which.',
      'Parcel outlines are the modern parcels the deeds were matched to, generalised to roughly 0.1-metre precision; a covenant matched to a parcel that has since been split or merged may not align exactly with today\'s lot lines.',
    ],
    features,
  });
}

main().catch((err) => {
  console.error(`[covenants] FAILED: ${err.message}`);
  process.exit(1);
});

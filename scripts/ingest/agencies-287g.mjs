#!/usr/bin/env node
/**
 * L2 — 287(g) agency agreements.
 *
 * ICE publishes the list of participating agencies as a spreadsheet linked
 * from its 287(g) page. The file name carries a date stamp that changes with
 * every revision, so we scrape the page for the current link rather than
 * hard-coding a URL that would silently rot.
 *
 * The source has no coordinates — only a county name — so each agreement is
 * placed at its county's Census interior point (see counties.mjs). A dot
 * therefore marks a jurisdiction, not a building, and the layer says so.
 *
 * Set SCOPE=national to emit every state; requires a national county index.
 */

import { readXlsx, fetchWithRetry, excelDate, loadCounties, normaliseCounty, writeLayer, log, slugId }
  from './lib/util.mjs';

const LANDING = 'https://www.ice.gov/identify-and-arrest/287g';
const STATE_NAME = (process.env.STATE_NAME ?? 'MINNESOTA').toUpperCase();
const STATE_USPS = process.env.STATE_USPS ?? 'MN';
const NATIONAL = process.env.SCOPE === 'national';

/** Find the current participating-agencies spreadsheet on the ICE page. */
async function findSpreadsheetUrl() {
  const res = await fetchWithRetry(LANDING, { timeoutMs: 45_000 });
  const html = await res.text();
  const candidates = [...html.matchAll(/href="([^"]*\.xlsx?)"/gi)].map((m) => m[1]);
  const hit =
    candidates.find((u) => /participatingagenc/i.test(u)) ?? candidates[0];
  if (!hit) throw new Error('no spreadsheet link found on the ICE 287(g) page');
  const url = new URL(hit, LANDING).href;
  log('287g', `resolved current dataset: ${url}`);
  return url;
}

/**
 * Two agencies in the same county would otherwise render as one dot exactly on
 * top of another. Nudge duplicates onto a small deterministic spiral so every
 * agreement stays clickable. Flagged in the record so the displacement is
 * never mistaken for a real address.
 */
function spread(index, total, lat, lng) {
  if (total === 1) return { lat, lng, displaced: false };
  const radius = 0.045; // ~5 km — well inside any Minnesota county
  const angle = (2 * Math.PI * index) / total;
  return {
    lat: lat + radius * Math.sin(angle),
    // Longitude degrees shrink with latitude; keep the visual spacing even.
    lng: lng + (radius * Math.cos(angle)) / Math.cos((lat * Math.PI) / 180),
    displaced: true,
  };
}

async function main() {
  const url = await findSpreadsheetUrl();
  const res = await fetchWithRetry(url, { timeoutMs: 90_000 });
  const { header, rows, links } = readXlsx(Buffer.from(await res.arrayBuffer()));

  // Map header labels to column letters so a column re-order does not corrupt
  // the output — ICE has re-ordered this sheet before.
  const col = {};
  for (const [letter, label] of Object.entries(header)) {
    const key = String(label).trim().toUpperCase();
    if (key) col[key] = letter;
  }
  for (const required of ['STATE', 'LAW ENFORCEMENT AGENCY', 'COUNTY', 'SUPPORT TYPE', 'SIGNED']) {
    if (!col[required]) throw new Error(`ICE sheet is missing the "${required}" column`);
  }

  const all = rows.filter((r) => (r[col.STATE] ?? '').trim());
  const scoped = NATIONAL
    ? all
    : all.filter((r) => r[col.STATE].trim().toUpperCase() === STATE_NAME);

  log('287g', `${all.length} agreements nationally; ${scoped.length} in scope (${NATIONAL ? 'national' : STATE_USPS})`);
  if (!scoped.length) throw new Error(`no agreements matched state "${STATE_NAME}"`);

  const counties = await loadCounties();
  const countyIndex = new Map(
    counties.features.map((f) => [normaliseCounty(f.properties.name), f.properties]),
  );

  // Group by county first so we know how many share each interior point.
  const byCounty = new Map();
  for (const row of scoped) {
    const key = normaliseCounty(row[col.COUNTY]);
    if (!byCounty.has(key)) byCounty.set(key, []);
    byCounty.get(key).push(row);
  }

  const features = [];
  const unmatched = [];

  for (const [countyKey, group] of byCounty) {
    const county = countyIndex.get(countyKey);
    if (!county) {
      unmatched.push(group[0][col.COUNTY]);
      continue;
    }
    group.forEach((row, i) => {
      const agency = (row[col['LAW ENFORCEMENT AGENCY']] ?? '').trim();
      const supportType = (row[col['SUPPORT TYPE']] ?? '').trim() || 'Not stated';
      const signed = excelDate(row[col.SIGNED]) ?? null;
      const pos = spread(i, group.length, county.lat, county.lng);
      const moaRef = col.MOA ? `${col.MOA}${row.__row}` : null;

      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [pos.lng, pos.lat] },
        properties: {
          id: slugId('287g', county.geoid, agency, supportType, signed ?? ''),
          layer: 'agency_287g',
          name: agency,
          county: county.name,
          state: NATIONAL ? (row[col.STATE] ?? '').trim() : STATE_USPS,
          countyFips: county.geoid,
          confidence: 'confirmed',
          sourceDate: signed,
          attributes: {
            supportType,
            agencyType: (row[col.TYPE] ?? '').trim() || null,
            signed,
            moa: moaRef ? (links.get(moaRef) ?? null) : null,
            // The position is a county interior point, not the agency address.
            locatedBy: 'county-centroid',
            displacedForDisplay: pos.displaced,
          },
        },
      });
    });
  }

  if (unmatched.length) {
    log('287g', `warning: ${unmatched.length} counties unmatched: ${[...new Set(unmatched)].join(', ')}`);
  }

  const models = features.reduce((acc, f) => {
    acc[f.properties.attributes.supportType] = (acc[f.properties.attributes.supportType] ?? 0) + 1;
    return acc;
  }, {});
  log('287g', `models: ${Object.entries(models).map(([k, v]) => `${k}=${v}`).join(', ')}`);

  await writeLayer('287g', {
    layer: 'agency_287g',
    provenance: {
      source: 'ICE — Participating agencies (287(g))',
      sourceUrl: LANDING,
      datasetUrl: url,
      license: 'Public domain (US federal government work)',
      licenseUrl: 'https://www.usa.gov/government-works',
      attribution: 'U.S. Immigration and Customs Enforcement',
      sourceDate: /(\d{2})(\d{2})(\d{4})\.xlsx?$/i.exec(url)
        ? (() => {
            const [, mm, dd, yyyy] = /(\d{2})(\d{2})(\d{4})\.xlsx?$/i.exec(url);
            return `${yyyy}-${mm}-${dd}`;
          })()
        : null,
      refresh: 'periodic',
      nationalAgreementCount: all.length,
    },
    knownGaps: [
      'Positions are county interior points, not agency addresses.',
      'Where several agencies share a county, dots are spread on a small deterministic circle so each stays selectable.',
      'A signed agreement does not indicate how actively it is used.',
      unmatched.length ? `Unmatched counties: ${[...new Set(unmatched)].join(', ')}` : null,
    ].filter(Boolean),
    features,
  });
}

main().catch((err) => {
  console.error(`[287g] FAILED: ${err.message}`);
  process.exit(1);
});

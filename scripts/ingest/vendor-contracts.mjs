#!/usr/bin/env node
/**
 * L? — Documented vendor contracts, and how each one ends.
 *
 * Every other surveillance layer on this map has had to answer "where's the
 * contract?" with an honest "not published in this data" (see the note on
 * agency_building's hoverCard). This layer exists to hold the answer once a
 * records request actually produces one — and, per CLAUDE.md §0.5, to keep
 * holding it once that contract is terminated, paused, or lapses unrenewed.
 * A contract's end is a status on the same record, not a second layer: the
 * `status` field below is `'active'` unless a source says otherwise, and the
 * registry colours and glyphs the point accordingly (gold FileText / red
 * FileX — see src/layers/registry.ts).
 *
 * It is not a live feed — nobody publishes a public index of law enforcement
 * vendor contracts, so there is nothing to scrape. A vendor contract enters
 * this layer only when a records request has produced one, the document has
 * been mirrored under public/data/docs/ per CLAUDE.md §3, and its terms have
 * been hand-transcribed here with a citation into the mirrored PDF. That is
 * the "manual workflow" §2's Good-Citizen Fetcher clause calls for when a
 * source cannot be politely fetched — this file is where each request's
 * verified findings live, so a later maintainer can extend the list without
 * re-reading anyone's PDF from scratch.
 *
 * A termination or non-renewal is held to the same bar, via the same
 * SOURCES array — `status`/`statusDate`/`reason`/`decidedBy` on an entry
 * that already has a document, or a new entry backed by a termination
 * notice or meeting minutes on its own. What does NOT qualify: a single news
 * report, however directly an official is quoted. CLAUDE.md §3 is explicit
 * that Tier 4 journalism is "lead lists only, never the sole basis of a
 * published feature." Those go in LEADS below instead, and surface only in
 * this layer's knownGaps as text — never as a point on the map — until a
 * document turns up or a second independent source corroborates it.
 *
 * Aggregate figures (query volume, partner-agency count, reason mix) are
 * computed here from the mirrored "Network-Audit" CSVs at build time rather
 * than hand-typed, so a corrected or extended mirror produces a corrected
 * layer automatically. Nothing here reads the two "Audit_Redacted" files —
 * those never had their names removed by the agency (see
 * public/data/docs/umpd-flock-2026/README.md) and are not shipped as source
 * data at all; the one number this layer takes from them (in-house query
 * count) is transcribed by hand from the same review that wrote the README.
 *
 * First entry: University of Minnesota Police Department's Flock Safety
 * contract, released 2026-07-09 via MuckRock request #26-978 (MGDPA).
 * First lead: Sherburne County Sheriff's Office ending its Flock Safety
 * trial, reported by KNSI Radio, 2026-08-13 — see LEADS below.
 */

import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { writeLayer, log, loadPublicJson, without, PUBLIC_DATA } from './lib/util.mjs';

/**
 * Parse a CSV that may carry a quoted field with an embedded newline (the
 * "Time Frame" column here always does). Good enough for the shape Flock's
 * export actually produces — not a general CSV parser, and not meant to be.
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      field = '';
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...data] = rows;
  return { header: header.map((h) => h.trim()), rows: data };
}

/** Count queries and distinct querying orgs in a mirrored Network-Audit CSV. */
async function auditStats(relDocPath) {
  const text = await readFile(path.join(PUBLIC_DATA, 'docs', relDocPath), 'utf8');
  const { header, rows } = parseCsv(text);
  const orgIdx = header.indexOf('Org Name');
  const reasonIdx = header.indexOf('Reason');
  if (orgIdx === -1 || reasonIdx === -1) {
    throw new Error(`${relDocPath}: expected "Org Name" and "Reason" columns`);
  }
  const orgs = new Set();
  const reasons = new Map();
  let total = 0;
  let ownAgencyQueries = 0;
  for (const r of rows) {
    const org = (r[orgIdx] ?? '').trim();
    if (!org) continue;
    total++;
    orgs.add(org);
    if (org === 'University of Minnesota MN PD (Twin Cities)') ownAgencyQueries++;
    const reason = (r[reasonIdx] ?? '').split(' - ')[0].trim();
    if (reason) reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }
  const topReason = [...reasons.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { total, partnerAgencies: orgs.size, ownAgencyQueries, topReason };
}

/**
 * One entry per documented contract. Extend this array as more records
 * requests produce agreements — the join to agency_building below resolves
 * location, county and jurisdiction from `jurisdictionId` alone.
 */
const SOURCES = [
  {
    id: 'vendor-contract-university-of-minnesota-police-flock-2023',
    name: 'University of Minnesota Police — Flock Safety contract',
    jurisdictionId: 'agency-jurisdiction-university-of-minnesota-police',
    vendor: 'Flock Group Inc. (Flock Safety)',
    product: 'Flock Safety LPR (Falcon) automated licence plate readers',
    confidence: 'confirmed',
    status: 'active',
    executedDate: '2023-01-25',
    initialTermMonths: 24,
    renewalType: 'Renews only by mutual written agreement (2023 base contract)',
    cameraCountInitial: 10,
    cameraCountCurrent: 15,
    annualCost: 25000,
    totalContractYear1: 53500,
    footageRetentionDays: 30,
    expansion: {
      date: '2025-12-02',
      camerasAdded: 5,
      annualCost: 15000,
      totalContractYear1: 18250,
      renewalType: 'Auto-renews annually unless either party gives 30 days’ notice of non-renewal',
      signedBy: 'Capt. Randy Mahlen (UMPD); Dan Haley, Legal Officer/Chief (Flock Group Inc.)',
    },
    signedBy: 'Elaine Kelash, Category Manager/Contracts Specialist (Univ. of Minnesota); Mark Smith, General Counsel (Flock Group Inc.)',
    contractDocPath: '/data/docs/umpd-flock-2026/flock-services-agreement-2023-01-25.pdf',
    expansionDocPath: '/data/docs/umpd-flock-2026/flock-order-expansion-2025-12-02.pdf',
    networkAuditDocs: [
      'umpd-flock-2026/network-audit-2026-05-02_2026-06-01.csv',
      'umpd-flock-2026/network-audit-2026-06-02_2026-07-02.csv',
    ],
    // Hand-transcribed from the (unmirrored, see README) in-house search logs
    // — total count only, per CLAUDE.md §1b. Do not add per-officer or
    // per-case figures here even if a future response makes them available.
    inHouseQueriesByMonth: [
      { period: '2026-05-01 – 2026-06-01', count: 286 },
      { period: '2026-06-02 – 2026-07-02', count: 393 },
    ],
    requestId: 'MuckRock #26-978',
    requestUrl:
      'https://www.muckrock.com/foi/minneapolis-1607/flock-safety-contract-information-communication-records-and-access-logs-university-of-minnesota-police-department-212163/',
    releasedDate: '2026-07-09',
  },
];

/**
 * Tier 4 leads on a contract ending: credible reporting on a single source,
 * not yet documented or corroborated per CLAUDE.md §3. Never rendered as a
 * map feature — see the file header. Each entry carries enough for a later
 * maintainer to file the records request that would promote it into
 * SOURCES, without re-reading the original article.
 */
const LEADS = [
  {
    agencyName: "Sherburne County Sheriff's Office",
    jurisdictionId: 'agency-jurisdiction-sherburne-county-sheriff',
    vendor: 'Flock Group Inc. (Flock Safety)',
    reportedStatus: 'terminated',
    reportedDate: '2026-08-13',
    reportedBy:
      'Commander Ben Zawacki, Sherburne County Sheriff’s Office, quoted by name in an official capacity announcing the agency’s own decision',
    reportedReason:
      'Cited wanting to avoid eroding community trust, concern about how other agencies have used data collected by the cameras, and that the program had run on grant money during a trial period — continuing past that trial would require taxpayer funding.',
    priorCameraCount: 9,
    priorCameraNote:
      'Reported as nine ALPRs operated by the sheriff’s office, including two in south St. Cloud. Not yet cross-checked against this agency’s BCA § 13.824 filing (see the alpr_reported layer).',
    sourceName: 'KNSI Radio',
    sourceUrl: 'https://knsiradio.com/2026/08/13/847294/',
    sourceDate: '2026-08-13',
    whatWouldConfirmIt:
      'A termination or non-renewal notice, county board/committee minutes referencing the ALPR program’s end, or a written statement obtained directly from the Sheriff’s Office via an MGDPA request — or a second independent outlet’s reporting, which would move this to ‘corroborated’ without a document in hand. Note this agency has no base contract documented here either — even the original signed agreement is not yet on file, only reported.',
  },
];

async function main() {
  await mkdir(PUBLIC_DATA, { recursive: true });

  const buildings = await loadPublicJson('agency-buildings.geojson', {
    runFirst: 'npm run data:agency-buildings',
  });

  const features = [];
  for (const src of SOURCES) {
    const building = buildings.features.find(
      (f) => f.properties.attributes.jurisdictionId === src.jurisdictionId,
    );
    if (!building) {
      log('vendor-contracts', `WARN: no agency_building found for ${src.jurisdictionId}, skipping ${src.id}`);
      continue;
    }

    const auditStatsByMonth = [];
    for (const doc of src.networkAuditDocs) {
      auditStatsByMonth.push(await auditStats(doc));
    }
    const latestAudit = auditStatsByMonth.at(-1) ?? null;
    const partnerAgenciesLatestMonth = latestAudit?.partnerAgencies ?? null;
    const networkQueriesLatestMonth = latestAudit?.total ?? null;
    const outsideAgencySharePct =
      latestAudit && latestAudit.total
        ? Math.round((100 * (latestAudit.total - latestAudit.ownAgencyQueries)) / latestAudit.total)
        : null;

    const status = src.status ?? 'active';
    features.push({
      type: 'Feature',
      geometry: building.geometry,
      properties: {
        id: src.id,
        layer: 'vendor_contract',
        name: status === 'active' ? src.name : `${src.name} — contract ${status}`,
        county: building.properties.county,
        state: building.properties.state,
        countyFips: building.properties.countyFips,
        confidence: src.confidence ?? 'confirmed',
        sourceDate: src.statusDate ?? src.executedDate,
        attributes: without({
          jurisdictionId: src.jurisdictionId,
          jurisdictionName: building.properties.attributes.jurisdictionName,
          vendor: src.vendor,
          product: src.product,
          status,
          statusDate: src.statusDate ?? null,
          reason: src.reason ?? null,
          decidedBy: src.decidedBy ?? null,
          executedDate: src.executedDate,
          initialTermMonths: src.initialTermMonths,
          renewalType: src.renewalType,
          expansionRenewalType: src.expansion?.renewalType ?? null,
          cameraCountInitial: src.cameraCountInitial,
          cameraCountCurrent: src.cameraCountCurrent,
          annualCost: src.annualCost,
          totalContractYear1: src.totalContractYear1,
          expansionDate: src.expansion?.date ?? null,
          expansionCamerasAdded: src.expansion?.camerasAdded ?? null,
          expansionAnnualCost: src.expansion?.annualCost ?? null,
          footageRetentionDays: src.footageRetentionDays,
          signedBy: src.signedBy,
          expansionSignedBy: src.expansion?.signedBy ?? null,
          networkQueriesLatestMonth,
          partnerAgenciesLatestMonth,
          outsideAgencySharePct,
          networkQueryTopReason: latestAudit?.topReason ?? null,
          inHouseQueriesMostRecentMonth: src.inHouseQueriesByMonth.at(-1)?.count ?? null,
          inHouseQueriesPeriod: src.inHouseQueriesByMonth.at(-1)?.period ?? null,
          contractDocUrl: src.contractDocPath,
          expansionDocUrl: src.expansionDocPath,
          requestId: src.requestId,
          requestUrl: src.requestUrl,
          releasedDate: src.releasedDate,
        }),
      },
    });

    log(
      'vendor-contracts',
      `${src.id}: ${networkQueriesLatestMonth} network queries, ${partnerAgenciesLatestMonth} partner agencies, ${outsideAgencySharePct}% from outside agencies (latest mirrored month)`,
    );
  }

  await writeLayer('vendor-contracts', {
    layer: 'vendor_contract',
    provenance: {
      source: 'University of Minnesota Police Department, released via MuckRock public records requests',
      sourceUrl: 'https://www.muckrock.com/foi/minneapolis-1607/flock-safety-contract-information-communication-records-and-access-logs-university-of-minnesota-police-department-212163/',
      license: 'Public government data (Minnesota Government Data Practices Act, Minn. Stat. ch. 13)',
      licenseUrl: 'https://www.revisor.mn.gov/statutes/cite/13',
      attribution: 'University of Minnesota Police Department; released via MuckRock',
      sourceDate: '2026-07-09',
      lastUpdated: null,
      refresh: 'rare',
    },
    knownGaps: [
      'A hand-curated set, not a scrape: a vendor contract appears here only once a records request has produced one. Absence is not evidence an agency has no vendor contract — it is evidence nobody has yet requested and mirrored it.',
      'The same is true of a contract ending: a termination, pause, or non-renewal appears as a mapped feature only once a document (a termination or non-renewal notice, board or council minutes ending the program) or two independent sources corroborate it. A single news report, however directly an official is quoted, is a tracked lead below, not a pin — see CLAUDE.md §3.',
      ...LEADS.map(
        (l) =>
          `LEAD, unresolved (not mapped): ${l.agencyName} reportedly ${l.reportedStatus} its ${l.vendor} contract around ${l.reportedDate}, per ${l.sourceName} (${l.sourceUrl}, ${l.sourceDate}). Reported reason: ${l.reportedReason} To confirm: ${l.whatWouldConfirmIt}`,
      ),
      'The two "Audit_Redacted" files UMPD released alongside the contracts were not actually redacted by the agency — they carried named individual staff and case numbers in the clear. This project does not publish or mirror those files; only a single monthly total of in-house queries is transcribed here by hand. See public/data/docs/umpd-flock-2026/README.md.',
      'Network-query aggregates (partner-agency count, query volume, top reason) cover only the two months UMPD’s response happened to include, not the full life of the contract.',
      'UMPD’s BCA self-report (see the alpr_reported layer) lists 10 devices with locations withheld; this contract’s 2025 expansion brings the total to 15, so that filing may now undercount by 5 — it has not been amended as of this ingest.',
    ],
    features,
  });

  log(
    'vendor-contracts',
    `${features.length} documented contract(s), ${LEADS.length} unresolved ending-lead(s) tracked in knownGaps`,
  );
}

main();

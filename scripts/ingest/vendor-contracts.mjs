#!/usr/bin/env node
/**
 * L? — Documented vendor contracts.
 *
 * Every other surveillance layer on this map has had to answer "where's the
 * contract?" with an honest "not published in this data" (see the note on
 * agency_building's hoverCard). This layer exists to hold the answer once a
 * records request actually produces one.
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
 *
 * `status`/`statusDate`/`statusSourceUrl` were added August 2026, when
 * Minnesota cities began ending Flock Safety contracts within weeks of one
 * another — Columbia Heights (terminated by council vote), West St. Paul
 * (city manager suspension), Duluth (non-renewal), and others, reported by
 * KARE 11, MPR News and other outlets. Per CLAUDE.md §3, journalism alone
 * (Tier 4) does not confirm a record — it earns `status: 'Reported ended'`
 * and `confidence: 'reported'` instead of `confirmed`, which is a real,
 * rendered map state (see ContractStatus's own comment in layers/types.ts),
 * not a placeholder for a later upgrade. Two entries below clear the
 * `confirmed` bar on a government primary source: Columbia Heights (the
 * city's own page) and Winona (the city's own newsflash post). The rest
 * are `reported`, cited to the strongest outlet this ingest could confirm
 * actually states the claim — not the first search result.
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
    jurisdictionName: null,
    confidence: 'confirmed',
    // No ending event has been transcribed onto this record — see
    // ContractStatus's own comment in layers/types.ts for why 'Active' is
    // the honest default rather than an assumption. statusDate/statusSourceUrl
    // stay null because there is no dated status event to cite, only the
    // continued absence of one.
    status: 'Active',
    statusDate: null,
    statusSourceUrl: null,
    vendor: 'Flock Group Inc. (Flock Safety)',
    product: 'Flock Safety LPR (Falcon) automated licence plate readers',
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
  {
    id: 'vendor-contract-columbia-heights-police-flock-2026',
    name: 'Columbia Heights Police — Flock Safety contract',
    jurisdictionId: 'agency-jurisdiction-columbia-heights-police',
    jurisdictionName: null,
    confidence: 'confirmed',
    // Only the termination is Tier 1-sourced (the city's own page); the
    // contract's own terms — when it was signed, its cost, its camera count
    // — have not been produced by a records request and are left null rather
    // than guessed at, per CLAUDE.md §3's "never fabricate or infer data".
    // This is a real gap in what this record can show, not a design choice:
    // see knownGaps below.
    vendor: 'Flock Group Inc. (Flock Safety)',
    product: null,
    executedDate: null,
    initialTermMonths: null,
    renewalType: null,
    cameraCountInitial: null,
    cameraCountCurrent: null,
    annualCost: null,
    totalContractYear1: null,
    footageRetentionDays: null,
    signedBy: null,
    contractDocPath: null,
    expansionDocPath: null,
    networkAuditDocs: [],
    inHouseQueriesByMonth: [],
    requestId: null,
    requestUrl: null,
    releasedDate: null,
    // The council terminated the contract, removed all camera equipment, and
    // said the department no longer has access to the Flock database — this
    // is a Tier 1 city-government statement, not journalism, so it clears
    // this layer's `confirmed` bar even though the contract's own terms do
    // not (see above).
    status: 'Terminated',
    statusDate: '2026-06-08',
    statusSourceUrl: 'https://www.columbiaheightsmn.gov/police/flock.php',
  },

  /**
   * "Reported ended" entries below: multiple Minnesota agencies were
   * reported, in the same August 2026 news cycle as Columbia Heights, to
   * have suspended, ended, or declined to renew Flock Safety contracts —
   * but each rests on journalism (Tier 4) and, in two cases, an agency's own
   * social-media statement (Tier 3), not yet a council resolution, board
   * minutes, or an agency memo this project has been able to obtain and
   * mirror. `confidence: 'reported'` and `status: 'Reported ended'` say so
   * on every one of these records — see ContractStatus's own comment in
   * layers/types.ts. As with Columbia Heights, only the ending itself is
   * recorded; contract terms nobody has produced (execution date, cost,
   * camera count) stay null rather than guessed at.
   */
  {
    id: 'vendor-contract-west-saint-paul-police-flock-2026',
    name: 'West St. Paul Police — Flock Safety contract',
    jurisdictionId: 'agency-jurisdiction-west-saint-paul-police',
    jurisdictionName: null,
    confidence: 'reported',
    vendor: 'Flock Group Inc. (Flock Safety)',
    product: null,
    executedDate: null,
    initialTermMonths: null,
    renewalType: null,
    cameraCountInitial: null,
    cameraCountCurrent: null,
    annualCost: null,
    totalContractYear1: null,
    footageRetentionDays: null,
    signedBy: null,
    contractDocPath: null,
    expansionDocPath: null,
    networkAuditDocs: [],
    inHouseQueriesByMonth: [],
    requestId: null,
    requestUrl: null,
    releasedDate: null,
    // City Manager Nate Burkett suspended use and began removing the city's
    // ~10 cameras, reported as reversible pending a City Council vote — not
    // a council action itself, and this project has not obtained the
    // manager's own written statement, only KARE 11's reporting on it.
    status: 'Reported ended',
    statusDate: '2026-08-11',
    statusSourceUrl:
      'https://www.kare11.com/article/news/local/west-st-paul-suspends-contract-flock-safety/89-5f230761-b0ca-44fc-b829-9d5bedcc9eea',
  },
  {
    id: 'vendor-contract-isanti-county-sheriff-flock-2026',
    name: 'Isanti County Sheriff — Flock Safety contract',
    buildingId: 'agency-building-isanti-county-sheriff-administrative-offices-2440-s-main-street',
    jurisdictionId: null,
    jurisdictionName: null,
    confidence: 'reported',
    vendor: 'Flock Group Inc. (Flock Safety)',
    product: null,
    executedDate: null,
    initialTermMonths: null,
    renewalType: null,
    cameraCountInitial: null,
    cameraCountCurrent: null,
    annualCost: null,
    totalContractYear1: null,
    footageRetentionDays: null,
    signedBy: null,
    contractDocPath: null,
    expansionDocPath: null,
    networkAuditDocs: [],
    inHouseQueriesByMonth: [],
    requestId: null,
    requestUrl: null,
    releasedDate: null,
    // Sheriff Wayne Seiberlich ended the county's Flock pilot (in place
    // since roughly April 2026), citing alert volume and budget rather than
    // a policy objection. Cited to the Sheriff's Office's own Facebook
    // statement — a Tier 3 first-party source, one step above journalism
    // alone, but not itself a Tier 1 record (no board minutes or agency
    // memo obtained).
    status: 'Reported ended',
    statusDate: '2026-08-11',
    statusSourceUrl:
      'https://www.facebook.com/IsantiMNsheriff/posts/pfbid021XXD1UjKSLF7MJXNeEP8b7L2ktU6MkL8ZyBvuZsXDUZVf45RkhYyUui8JtSqzJrYl',
  },
  {
    id: 'vendor-contract-duluth-police-flock-2026',
    name: 'Duluth Police — Flock Safety contract',
    // Outside the 10-county metro jurisdiction layer — see main()'s comment
    // on buildingId lookups.
    buildingId: 'agency-building-duluth-police-2030-n-arlington-ave',
    jurisdictionId: null,
    jurisdictionName: 'Duluth Police',
    confidence: 'reported',
    vendor: 'Flock Group Inc. (Flock Safety)',
    product: null,
    executedDate: null,
    initialTermMonths: null,
    renewalType: null,
    cameraCountInitial: null,
    cameraCountCurrent: null,
    annualCost: null,
    totalContractYear1: null,
    footageRetentionDays: null,
    signedBy: null,
    contractDocPath: null,
    expansionDocPath: null,
    networkAuditDocs: [],
    inHouseQueriesByMonth: [],
    requestId: null,
    requestUrl: null,
    releasedDate: null,
    // Duluth PD notified Flock in writing it would not renew its (grant-
    // funded, 12-month) contract; framed as a non-renewal driven by
    // vandalism/theft of 6 of 9 cameras and no ongoing funding source, not
    // an objection to ALPR itself. statusDate is the notification date the
    // reporting gives; the contract's own reported end date, Sept. 7, 2026,
    // is not yet reached as of this ingest.
    status: 'Reported ended',
    statusDate: '2026-08-03',
    statusSourceUrl: 'https://www.duluthnewstribune.com/news/local/duluth-police-explain-decision-to-end-flock-contract',
  },
  {
    id: 'vendor-contract-sherburne-county-sheriff-flock-2026',
    name: 'Sherburne County Sheriff — Flock Safety contract',
    jurisdictionId: 'agency-jurisdiction-sherburne-county-sheriff',
    jurisdictionName: null,
    confidence: 'reported',
    vendor: 'Flock Group Inc. (Flock Safety)',
    product: null,
    executedDate: null,
    initialTermMonths: null,
    renewalType: null,
    cameraCountInitial: null,
    cameraCountCurrent: null,
    annualCost: null,
    totalContractYear1: null,
    footageRetentionDays: null,
    signedBy: null,
    contractDocPath: null,
    expansionDocPath: null,
    networkAuditDocs: [],
    inHouseQueriesByMonth: [],
    requestId: null,
    requestUrl: null,
    releasedDate: null,
    // Sheriff's office ended its grant-funded pilot; cameras removed the
    // morning of Aug. 12, 2026, cited to cost (continuing would require
    // taxpayer funding) and public trust. The county board's own
    // agendas/minutes page exists but no specific entry documenting this
    // was located — see knownGaps.
    status: 'Reported ended',
    statusDate: '2026-08-12',
    statusSourceUrl: 'https://www.wctrib.com/news/local/sherburne-county-ends-use-of-flock-cameras',
  },
  {
    id: 'vendor-contract-north-branch-police-flock-2026',
    name: 'North Branch Police — Flock Safety contract',
    jurisdictionId: 'agency-jurisdiction-north-branch-police',
    jurisdictionName: null,
    confidence: 'reported',
    vendor: 'Flock Group Inc. (Flock Safety)',
    product: null,
    executedDate: null,
    initialTermMonths: null,
    renewalType: null,
    cameraCountInitial: null,
    cameraCountCurrent: null,
    annualCost: null,
    totalContractYear1: null,
    footageRetentionDays: null,
    signedBy: null,
    contractDocPath: null,
    expansionDocPath: null,
    networkAuditDocs: [],
    inHouseQueriesByMonth: [],
    requestId: null,
    requestUrl: null,
    releasedDate: null,
    // The most unsettled of this batch: council approved 7 cameras 3–2 on
    // May 13, 2026; after backlash at an Aug. 5 work session (~50 residents;
    // 3 of 7 cameras already installed, none yet recording), the mayor
    // recommended an indefinite pause, with a formal council vote scheduled
    // for Aug. 12. This project could not confirm that vote's outcome as of
    // this ingest — statusDate is the work session where the pause was
    // recommended, not a vote result. The city's own Flock-partnership page
    // exists but predates the pause and does not corroborate it — see
    // knownGaps.
    status: 'Reported ended',
    statusDate: '2026-08-05',
    statusSourceUrl:
      'https://www.isanti-chisagocountystar.com/news/north-branch-pauses-flock-camera-installation/article_446102b0-3c16-415e-8f13-75d84811c6eb.html',
  },
  {
    id: 'vendor-contract-brooklyn-park-police-flock-2024',
    name: 'Brooklyn Park Police — Flock Safety contract',
    jurisdictionId: 'agency-jurisdiction-brooklyn-park-police',
    jurisdictionName: null,
    confidence: 'reported',
    vendor: 'Flock Group Inc. (Flock Safety)',
    product: null,
    executedDate: null,
    initialTermMonths: null,
    renewalType: null,
    cameraCountInitial: null,
    cameraCountCurrent: null,
    annualCost: null,
    totalContractYear1: null,
    footageRetentionDays: null,
    signedBy: null,
    contractDocPath: null,
    expansionDocPath: null,
    networkAuditDocs: [],
    inHouseQueriesByMonth: [],
    requestId: null,
    requestUrl: null,
    releasedDate: null,
    // The oldest of this batch, and the only one not part of the August
    // 2026 news cycle: the department let its ~$24,000 contract (signed
    // fall 2024, one-year term) lapse rather than renewing it, citing
    // vendor customer-service complaints and concern that partner agencies
    // were not following state data-sharing statute; the city says it still
    // wants ALPR and is shopping for a different vendor. "End of December"
    // is the reporting's own phrase — the year is inferred from the
    // reported signing date and term length, not stated verbatim alongside
    // it, so statusDate below is the last day of that month rather than a
    // precise reported date.
    status: 'Reported ended',
    statusDate: '2025-12-31',
    statusSourceUrl:
      'https://kstp.com/kstp-news/top-news/roadside-cameras-going-dark-another-department-makes-changes-to-program-over-accountability-concerns/',
  },
  {
    id: 'vendor-contract-winona-police-flock-2026',
    name: 'Winona Police — Flock Safety contract',
    // Outside the 10-county metro jurisdiction layer — see main()'s comment
    // on buildingId lookups.
    buildingId: 'agency-building-winona-city-police-201-west-3rd-street',
    jurisdictionId: null,
    jurisdictionName: 'Winona Police',
    // The one record in this batch with a genuine Tier 1 source: the City
    // of Winona's own newsflash page states directly that "Winona PD has
    // decided not to reinstall any Flock cameras in the City of Winona,"
    // dated Aug. 12, 2026 — a government primary record, not journalism,
    // even though the precipitating event (theft/vandalism of all 8
    // cameras between Jul. 29–Aug. 1) is itself only reported. Confidence
    // and status both reflect that: this is the only entry in this batch
    // set to 'confirmed' rather than 'reported'.
    confidence: 'confirmed',
    vendor: 'Flock Group Inc. (Flock Safety)',
    product: null,
    executedDate: null,
    initialTermMonths: null,
    renewalType: null,
    cameraCountInitial: null,
    cameraCountCurrent: null,
    annualCost: null,
    totalContractYear1: null,
    footageRetentionDays: null,
    signedBy: null,
    contractDocPath: null,
    expansionDocPath: null,
    networkAuditDocs: [],
    inHouseQueriesByMonth: [],
    requestId: null,
    requestUrl: null,
    releasedDate: null,
    status: 'Not renewed',
    statusDate: '2026-08-12',
    statusSourceUrl: 'https://www.winonamn.gov/m/newsflash/Home/Detail/395',
  },
];

async function main() {
  await mkdir(PUBLIC_DATA, { recursive: true });

  const buildings = await loadPublicJson('agency-buildings.geojson', {
    runFirst: 'npm run data:agency-buildings',
  });

  const features = [];
  for (const src of SOURCES) {
    // Most sources join on jurisdictionId, which resolves county/state and
    // (via agency_jurisdiction) the polygon a jurisdiction-level tint reads.
    // A few agencies outside the 10-county metro — Duluth, Winona — have no
    // jurisdiction polygon and so no jurisdictionId on their own building
    // record; those sources name the building directly by id instead. Both
    // are honest: the second group simply gets no jurisdiction-tint effect,
    // same as any other agency outside that layer's coverage.
    const building = src.buildingId
      ? buildings.features.find((f) => f.properties.id === src.buildingId)
      : buildings.features.find((f) => f.properties.attributes.jurisdictionId === src.jurisdictionId);
    if (!building) {
      log(
        'vendor-contracts',
        `WARN: no agency_building found for ${src.buildingId ?? src.jurisdictionId}, skipping ${src.id}`,
      );
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

    features.push({
      type: 'Feature',
      geometry: building.geometry,
      properties: {
        id: src.id,
        layer: 'vendor_contract',
        name: src.name,
        county: building.properties.county,
        state: building.properties.state,
        countyFips: building.properties.countyFips,
        confidence: src.confidence,
        // Falls back to statusDate for a record like Columbia Heights whose
        // execution date was never produced by a records request but whose
        // most recent dated fact — its termination — is Tier 1 sourced. A
        // record with neither is genuinely undated, not an ingest bug.
        sourceDate: src.executedDate ?? src.statusDate ?? null,
        attributes: without({
          // The building's own jurisdictionId is authoritative — it is
          // present for every metro agency regardless of which key `src`
          // joined on, and absent (honestly) for the few, like Duluth and
          // Winona, this layer only reaches by buildingId.
          jurisdictionId: building.properties.attributes.jurisdictionId ?? src.jurisdictionId ?? null,
          jurisdictionName:
            building.properties.attributes.jurisdictionName ?? src.jurisdictionName ?? null,
          vendor: src.vendor,
          product: src.product,
          status: src.status,
          statusDate: src.statusDate,
          statusSourceUrl: src.statusSourceUrl,
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
      // Every other record's status fact comes from its own city, county, or
      // outlet, not from UMPD's records response, so each is credited here
      // as a secondary source rather than folded into the spine citation
      // above. Two (Columbia Heights, Winona) are government primary
      // sources in their own right; the rest are journalism, cited as such.
      secondarySources: [
        {
          key: 'columbia-heights-flock-status',
          name: 'City of Columbia Heights',
          url: 'https://www.columbiaheightsmn.gov/police/flock.php',
          license: 'Public government data (Minnesota Government Data Practices Act, Minn. Stat. ch. 13)',
          licenseUrl: 'https://www.revisor.mn.gov/statutes/cite/13',
          contributes: {
            en: 'Termination date and statement for the Columbia Heights Police Department Flock Safety contract',
            es: 'Fecha y declaración de terminación del contrato de Flock Safety del Departamento de Policía de Columbia Heights',
          },
        },
        {
          key: 'west-saint-paul-flock-status',
          name: 'KARE 11',
          url: 'https://www.kare11.com/article/news/local/west-st-paul-suspends-contract-flock-safety/89-5f230761-b0ca-44fc-b829-9d5bedcc9eea',
          license: 'All rights reserved (news reporting, cited under fair use for a single factual claim and date)',
          licenseUrl: null,
          contributes: {
            en: 'Reported suspension date and statement for West St. Paul Police’s Flock Safety contract',
            es: 'Fecha y declaración reportadas de la suspensión del contrato de Flock Safety de la Policía de West St. Paul',
          },
        },
        {
          key: 'isanti-county-flock-status',
          name: 'Isanti County Sheriff’s Office (Facebook)',
          url: 'https://www.facebook.com/IsantiMNsheriff/posts/pfbid021XXD1UjKSLF7MJXNeEP8b7L2ktU6MkL8ZyBvuZsXDUZVf45RkhYyUui8JtSqzJrYl',
          license: 'All rights reserved (agency social-media statement, cited under fair use for a single factual claim)',
          licenseUrl: null,
          contributes: {
            en: 'Reported end date and statement for the Isanti County Sheriff’s Office Flock Safety pilot',
            es: 'Fecha y declaración reportadas de la finalización del piloto de Flock Safety de la Oficina del Alguacil del Condado de Isanti',
          },
        },
        {
          key: 'duluth-flock-status',
          name: 'Duluth News Tribune',
          url: 'https://www.duluthnewstribune.com/news/local/duluth-police-explain-decision-to-end-flock-contract',
          license: 'All rights reserved (news reporting, cited under fair use for a single factual claim and date)',
          licenseUrl: null,
          contributes: {
            en: 'Reported non-renewal date and statement for Duluth Police’s Flock Safety contract',
            es: 'Fecha y declaración reportadas de la no renovación del contrato de Flock Safety de la Policía de Duluth',
          },
        },
        {
          key: 'sherburne-county-flock-status',
          name: 'West Central Tribune (Forum Communications)',
          url: 'https://www.wctrib.com/news/local/sherburne-county-ends-use-of-flock-cameras',
          license: 'All rights reserved (news reporting, cited under fair use for a single factual claim and date)',
          licenseUrl: null,
          contributes: {
            en: 'Reported end date and statement for the Sherburne County Sheriff’s Office Flock Safety pilot',
            es: 'Fecha y declaración reportadas de la finalización del piloto de Flock Safety de la Oficina del Alguacil del Condado de Sherburne',
          },
        },
        {
          key: 'north-branch-flock-status',
          name: 'Isanti County News / Chisago County Star',
          url: 'https://www.isanti-chisagocountystar.com/news/north-branch-pauses-flock-camera-installation/article_446102b0-3c16-415e-8f13-75d84811c6eb.html',
          license: 'All rights reserved (news reporting, cited under fair use for a single factual claim and date)',
          licenseUrl: null,
          contributes: {
            en: 'Reported pause date and statement for North Branch Police’s Flock Safety camera installation',
            es: 'Fecha y declaración reportadas de la pausa en la instalación de cámaras Flock Safety de la Policía de North Branch',
          },
        },
        {
          key: 'brooklyn-park-flock-status',
          name: 'KSTP-TV (5 Eyewitness News)',
          url: 'https://kstp.com/kstp-news/top-news/roadside-cameras-going-dark-another-department-makes-changes-to-program-over-accountability-concerns/',
          license: 'All rights reserved (news reporting, cited under fair use for a single factual claim and date)',
          licenseUrl: null,
          contributes: {
            en: 'Reported lapse date and statement for Brooklyn Park Police’s Flock Safety contract',
            es: 'Fecha y declaración reportadas del vencimiento del contrato de Flock Safety de la Policía de Brooklyn Park',
          },
        },
        {
          key: 'winona-flock-status',
          name: 'City of Winona',
          url: 'https://www.winonamn.gov/m/newsflash/Home/Detail/395',
          license: 'Public government data (Minnesota Government Data Practices Act, Minn. Stat. ch. 13)',
          licenseUrl: 'https://www.revisor.mn.gov/statutes/cite/13',
          contributes: {
            en: 'Non-reinstallation date and statement for Winona Police’s Flock Safety cameras',
            es: 'Fecha y declaración de la decisión de no reinstalar las cámaras Flock Safety de la Policía de Winona',
          },
        },
      ],
    },
    knownGaps: [
      'A hand-curated set, not a scrape: a vendor contract appears here only once a records request has produced one, or (for the August 2026 status entries below) a government statement or news report documents an ending. Absence is not evidence an agency has no vendor contract, or that one it has is still active — it is evidence nobody has yet requested, reported, or mirrored the fact.',
      'The two "Audit_Redacted" files UMPD released alongside the contracts were not actually redacted by the agency — they carried named individual staff and case numbers in the clear. This project does not publish or mirror those files; only a single monthly total of in-house queries is transcribed here by hand. See public/data/docs/umpd-flock-2026/README.md.',
      'Network-query aggregates (partner-agency count, query volume, top reason) cover only the two months UMPD’s response happened to include, not the full life of the contract.',
      'UMPD’s BCA self-report (see the alpr_reported layer) lists 10 devices with locations withheld; this contract’s 2025 expansion brings the total to 15, so that filing may now undercount by 5 — it has not been amended as of this ingest.',
      'Columbia Heights and Winona Police’s contract terms (execution date, cost, camera count, vendor documents) have not been produced by a records request and are recorded here as null, not guessed at. Only their existence and ending — both Tier 1-sourced — are documented.',
      'As of this ingest (August 2026), seven agencies’ contract endings rest on `status: "Reported ended"` — journalism, and in Isanti County’s case an agency Facebook statement, but no council resolution, board minutes, or agency memo this project has obtained: West St. Paul, Isanti County, Duluth, Sherburne County, North Branch, Brooklyn Park, and Winona (Winona’s ending itself is separately confirmed by the city’s own newsflash page; only the precipitating camera theft/vandalism is reported-only). North Branch is the most unsettled of these — a formal council vote on the pause was scheduled for Aug. 12, 2026, and this project could not confirm its outcome. A jurisdiction that shows neither a confirmed nor a reported ending should not be read as its contract continuing — only as no report having reached this layer yet.',
    ],
    features,
  });
}

main();

#!/usr/bin/env node
/**
 * L? — Vendor contract terminations, pauses, and non-renewals.
 *
 * The other half of vendor-contracts.mjs's story (see §0.5 — "show the water
 * heating"): an agency signing a Flock Safety contract is one kind of event
 * on the device → vendor → contract → agency chain; an agency ending one is
 * another, and just as much a first-class fact per §0.1. This layer is where
 * that second event lives, kept separate from vendor-contracts.mjs because
 * the two have different evidentiary bars — a *signed* contract is meaningless
 * without its terms, but an *ended* one is a single fact (did it end, when,
 * why) that a records request or a council vote can confirm well before the
 * full underlying contract is in hand.
 *
 * CLAUDE.md §3's Source Tiering is the reason this file has both a SOURCES
 * array and a LEADS array, and why the second is much easier to add to than
 * the first:
 *
 *   - SOURCES becomes a map feature. Every entry needs either a Tier 1/2
 *     document (a termination or non-renewal letter, board/council minutes
 *     ending the program, a written notice to the vendor or partner
 *     agencies) mirrored under public/data/docs/, or two independent Tier
 *     3/4 sources that corroborate each other — confidence is 'confirmed'
 *     or 'corroborated' respectively.
 *   - LEADS never becomes a map feature by itself. A single newspaper or
 *     radio story — Tier 4, however credible, however directly quoted — is
 *     exactly the case CLAUDE.md §3 describes: "lead lists only, never the
 *     sole basis of a published feature. Unresolved Tier 4 leads are
 *     knownGaps entries, not map pins." So a LEADS entry is folded into the
 *     layer's knownGaps, visible and dated, rather than drawn as a dot with
 *     a confidence badge quietly doing the work of admitting it isn't
 *     confirmed. Promote it to SOURCES by adding a second independent
 *     source or a records-request document — nothing else about this file
 *     changes shape when that happens.
 *
 * This mirrors CLAUDE.md §1a: an agency's own commanding officer announcing
 * the agency's own official action, on the record, in an official capacity,
 * is squarely in scope to name and quote — the sourcing question here is
 * never "should we name Zawacki," it is "do we have enough to draw a pin."
 *
 * First lead: Sherburne County Sheriff's Office ending its Flock Safety
 * trial, reported by KNSI Radio, 2026-08-13.
 */

import { mkdir } from 'node:fs/promises';
import { writeLayer, log, loadPublicJson, without, slugId, PUBLIC_DATA } from './lib/util.mjs';

/**
 * Documented (Tier 1/2) or corroborated (two independent Tier 3/4 sources)
 * contract-ending events. Empty until the first one clears that bar — see
 * the file header. Shape mirrors vendor-contracts.mjs's SOURCES where the
 * fields overlap.
 */
const SOURCES = [];

/**
 * Tier 4 leads: credible reporting on a single source, not yet documented or
 * corroborated. Never rendered as a feature — see the file header. Each
 * entry should carry enough for a later maintainer to file the records
 * request that would promote it, without re-reading the original article.
 */
const LEADS = [
  {
    agencyName: "Sherburne County Sheriff's Office",
    jurisdictionId: 'agency-jurisdiction-sherburne-county-sheriff',
    vendor: 'Flock Group Inc. (Flock Safety)',
    reportedStatus: 'terminated',
    reportedDate: '2026-08-13',
    reportedBy: 'Commander Ben Zawacki, Sherburne County Sheriff’s Office, quoted by name in an official capacity announcing the agency’s own decision',
    reportedReason:
      'Cited wanting to avoid eroding community trust, concern about how other agencies have used data collected by the cameras, and that the program had run on grant money during a trial period — continuing past that trial would require taxpayer funding.',
    priorCameraCount: 9,
    priorCameraNote: 'Reported as nine ALPRs operated by the sheriff’s office, including two in south St. Cloud. Not yet cross-checked against this agency’s BCA § 13.824 filing (see the alpr_reported layer).',
    sourceName: 'KNSI Radio',
    sourceUrl: 'https://knsiradio.com/2026/08/13/847294/',
    sourceDate: '2026-08-13',
    whatWouldConfirmIt:
      'A termination or non-renewal notice, county board/committee minutes referencing the ALPR program’s end, or a written statement obtained directly from the Sheriff’s Office via an MGDPA request — or a second independent outlet’s reporting, which would move this to ‘corroborated’ without a document in hand.',
  },
];

async function main() {
  await mkdir(PUBLIC_DATA, { recursive: true });

  const features = [];

  if (SOURCES.length) {
    const buildings = await loadPublicJson('agency-buildings.geojson', {
      runFirst: 'npm run data:agency-buildings',
    });

    for (const src of SOURCES) {
      const building = buildings.features.find(
        (f) => f.properties.attributes.jurisdictionId === src.jurisdictionId,
      );
      if (!building) {
        log('vendor-contract-terminations', `WARN: no agency_building found for ${src.jurisdictionId}, skipping ${src.id}`);
        continue;
      }

      features.push({
        type: 'Feature',
        geometry: building.geometry,
        properties: {
          id: src.id ?? slugId('vendor-contract-termination', src.jurisdictionId, src.statusDate),
          layer: 'vendor_contract_termination',
          name: `${building.properties.attributes.jurisdictionName} — ${src.vendor} contract ${src.status}`,
          county: building.properties.county,
          state: building.properties.state,
          countyFips: building.properties.countyFips,
          confidence: src.confidence,
          sourceDate: src.statusDate,
          attributes: without({
            jurisdictionId: src.jurisdictionId,
            jurisdictionName: building.properties.attributes.jurisdictionName,
            vendor: src.vendor,
            product: src.product ?? null,
            status: src.status,
            statusDate: src.statusDate,
            reason: src.reason ?? null,
            decidedBy: src.decidedBy ?? null,
            priorCameraCount: src.priorCameraCount ?? null,
            relatedVendorContractId: src.relatedVendorContractId ?? null,
            sourceName: src.sourceName,
            sourceUrl: src.sourceUrl,
            sourceDate: src.sourceDate,
            documentUrl: src.documentUrl ?? null,
          }),
        },
      });
    }
  }

  await writeLayer('vendor-contract-terminations', {
    layer: 'vendor_contract_termination',
    provenance: {
      source: 'Agency terminations and non-renewals of ALPR vendor contracts, documented or corroborated per CLAUDE.md §3',
      sourceUrl: 'https://www.revisor.mn.gov/statutes/cite/13',
      license: 'Public government data (Minnesota Government Data Practices Act, Minn. Stat. ch. 13), where the confirming document is a public record',
      licenseUrl: 'https://www.revisor.mn.gov/statutes/cite/13',
      attribution: 'Varies per record — see each feature’s own source fields',
      sourceDate: null,
      lastUpdated: null,
      refresh: 'periodic',
    },
    knownGaps: [
      'No feature is published on a single news report alone, however directly an official is quoted — CLAUDE.md §3 treats journalism as Tier 4, a lead, not a sole basis for a map pin. A tracked, unresolved lead appears below as text rather than as a dot; it is promoted to a mapped feature once a records request produces a document or a second independent source corroborates it.',
      ...LEADS.map(
        (l) =>
          `LEAD, unresolved (not mapped): ${l.agencyName} reportedly ${l.reportedStatus} its ${l.vendor} contract around ${l.reportedDate}, per ${l.sourceName} (${l.sourceUrl}, ${l.sourceDate}). Reported reason: ${l.reportedReason} To confirm: ${l.whatWouldConfirmIt}`,
      ),
      'A hand-curated set, not a live feed: nobody publishes an index of ended law-enforcement vendor contracts, so an agency absent here has not been shown to still hold an active Flock contract — only that no ending has yet been documented or corroborated for it.',
      'This layer records the fact and stated reason for a contract’s end, not an assessment of whether the reason given is the true or complete one — CLAUDE.md §1c: record the statement, do not infer a motive.',
    ],
    features,
  });

  log(
    'vendor-contract-terminations',
    `${features.length} confirmed/corroborated feature(s), ${LEADS.length} unresolved lead(s) tracked in knownGaps`,
  );
}

main();

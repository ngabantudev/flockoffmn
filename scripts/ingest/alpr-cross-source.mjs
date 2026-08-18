#!/usr/bin/env node
/**
 * Cross-source ALPR match — "cross-listed corner".
 *
 * Two ALPR layers exist, built by two unrelated methods: alpr.mjs turns
 * OpenStreetMap/DeFlock volunteer tags into points, and alpr-reported.mjs
 * turns a BCA filing (Minn. Stat. § 13.824, subd. 8) into a point by
 * resolving the intersection it names against OSM road geometry. Neither
 * script knows about the other while it runs.
 *
 * This script runs after both and asks one narrow question: do a BCA filing
 * and an independently-mapped OSM point land within 50 metres of each other?
 * If so, it stamps both records so the map and the detail panel can say two
 * independent paper trails point at the same corner.
 *
 * That is the entire claim. It is emphatically NOT a claim that either
 * record's camera is the one the other names, that a camera is there today,
 * or that "confirmed"/"verified"/"corroborated" describes anything here —
 * both original records already carry their own honest `confidence` value
 * ('probabilistic' for alpr, 'confirmed' for alpr_reported) and this script
 * never touches either. Two already-approximate coordinates landing near
 * each other is a proximity coincidence this project computed, not a
 * document connecting the two records — see CLAUDE.md §1c: no inferred
 * connection stands in for a cited one.
 *
 * The BCA record is the anchor for grouping (not because it's more "true",
 * but because it's the Tier 1 document naming a site — the OSM point has no
 * comparable paper behind it to anchor the other direction).
 */

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { loadPublicJson, writeLayer, log, PUBLIC_DATA } from './lib/util.mjs';
import { haversineMeters } from '../../src/lib/geo.mjs';

const THRESHOLD_M = 50;

async function main() {
  const [osm, bca] = await Promise.all([
    loadPublicJson('alpr.geojson', { runFirst: 'node scripts/ingest/alpr.mjs' }),
    loadPublicJson('alpr-reported.geojson', { runFirst: 'node scripts/ingest/alpr-reported.mjs' }),
  ]);

  if (!osm?.features?.length) throw new Error('alpr.geojson missing or empty — run alpr.mjs first');
  if (!bca?.features?.length) {
    throw new Error('alpr-reported.geojson missing or empty — run alpr-reported.mjs first');
  }

  /*
   * Pass 1 — for every OSM point, find every BCA anchor within THRESHOLD_M.
   *
   * Multi-match is normal on both sides (several poles at one intersection;
   * one OSM point near two agencies' filings), so this records every
   * candidate before anything is decided, rather than stopping at the first
   * hit found.
   */
  const candidatesByOsm = new Map(); // osmId -> [{ bcaFeature, meters }]
  for (const osmF of osm.features) {
    const hits = [];
    for (const bcaF of bca.features) {
      const meters = haversineMeters(osmF.geometry.coordinates, bcaF.geometry.coordinates);
      if (meters <= THRESHOLD_M) hits.push({ bcaF, meters });
    }
    if (hits.length) candidatesByOsm.set(osmF.properties.id, hits);
  }

  /*
   * Pass 2 — decide, per OSM point, which BCA anchor it belongs to.
   *
   * Assignment is always to the nearest anchor, whether the runners-up are
   * the same agency (a routine double-hit, discarded silently onto the
   * record) or a different one (contested — nobody here picks a winner
   * between two agencies' filings, so both groups are flagged and both
   * pairings are kept in the reference file instead of one being erased).
   */
  const groupOsmIds = new Map(); // bcaId -> Set(osmId)
  const groupOsmMeters = new Map(); // bcaId -> Map(osmId -> meters)
  const contestedBcaIds = new Set();
  const contestedOsmIds = new Set();
  const discardedSameAgency = []; // { osmId, keptBcaId, discardedBcaId, meters }
  const contestedPairs = []; // { osmId, bcaIds: [assigned, other], agencies: [a, b] }
  const osmAssignedAnchor = new Map(); // osmId -> bcaId (nearest)
  const osmAssignedMeters = new Map(); // osmId -> meters

  for (const [osmId, hits] of candidatesByOsm) {
    const sorted = [...hits].sort((a, b) => a.meters - b.meters);
    const nearest = sorted[0];
    const nearestId = nearest.bcaF.properties.id;
    const nearestAgency = nearest.bcaF.properties.attributes.agencyName;

    osmAssignedAnchor.set(osmId, nearestId);
    osmAssignedMeters.set(osmId, nearest.meters);
    if (!groupOsmIds.has(nearestId)) groupOsmIds.set(nearestId, new Set());
    groupOsmIds.get(nearestId).add(osmId);
    if (!groupOsmMeters.has(nearestId)) groupOsmMeters.set(nearestId, new Map());
    groupOsmMeters.get(nearestId).set(osmId, nearest.meters);

    for (const other of sorted.slice(1)) {
      const otherId = other.bcaF.properties.id;
      const otherAgency = other.bcaF.properties.attributes.agencyName;
      if (otherAgency === nearestAgency) {
        discardedSameAgency.push({
          osmId,
          keptBcaId: nearestId,
          discardedBcaId: otherId,
          meters: Math.round(other.meters),
        });
      } else {
        contestedBcaIds.add(nearestId);
        contestedBcaIds.add(otherId);
        contestedOsmIds.add(osmId);
        contestedPairs.push({
          osmId,
          bcaIds: [nearestId, otherId],
          agencies: [nearestAgency, otherAgency],
          meters: [Math.round(nearest.meters), Math.round(other.meters)],
        });
      }
    }
  }

  /*
   * Pass 3 — stamp every feature in both layers. Every feature gets every
   * attribute (matched or not) so the CSV twins keep a stable column set —
   * see writeLayer's attrKeys derivation.
   */
  let bcaMatchedCount = 0;
  const siteEntries = [];

  const bcaFeatures = bca.features.map((f) => {
    const id = f.properties.id;
    const osmIds = [...(groupOsmIds.get(id) ?? [])];
    const matched = osmIds.length > 0;
    if (matched) bcaMatchedCount++;

    const meters = matched
      ? Math.min(...osmIds.map((oid) => groupOsmMeters.get(id).get(oid)))
      : null;

    const ambiguousAnchor = matched && Boolean(f.properties.attributes.ambiguousJunction);

    if (matched) {
      siteEntries.push({
        crossSourceSiteId: `cross-${id}`,
        bcaRecordId: id,
        agencyName: f.properties.attributes.agencyName,
        matchedOsmIds: osmIds,
        distancesMeters: osmIds.map((oid) => Math.round(groupOsmMeters.get(id).get(oid))),
        contested: contestedBcaIds.has(id),
        anchorAmbiguous: ambiguousAnchor,
      });
    }

    return {
      ...f,
      properties: {
        ...f.properties,
        attributes: {
          ...f.properties.attributes,
          crossSourceSiteId: matched ? `cross-${id}` : null,
          crossSourceCount: osmIds.length,
          crossSourceMeters: meters === null ? null : Math.round(meters),
          crossSourceThresholdM: THRESHOLD_M,
          crossSourceContested: contestedBcaIds.has(id),
          crossSourceAnchorAmbiguous: ambiguousAnchor,
        },
      },
    };
  });

  let osmMatchedCount = 0;
  const osmFeatures = osm.features.map((f) => {
    const id = f.properties.id;
    const anchorId = osmAssignedAnchor.get(id) ?? null;
    const matched = anchorId != null;
    if (matched) osmMatchedCount++;

    const anchorFeature = matched ? bca.features.find((b) => b.properties.id === anchorId) : null;
    const anchorAmbiguous = matched && Boolean(anchorFeature.properties.attributes.ambiguousJunction);

    return {
      ...f,
      properties: {
        ...f.properties,
        attributes: {
          ...f.properties.attributes,
          crossSourceSiteId: matched ? `cross-${anchorId}` : null,
          // The "other layer" for an OSM record is the BCA layer, and an OSM
          // record is assigned to exactly one anchor (see the assignment
          // rule above) — so this is 1 when matched, never higher. Kept as a
          // count rather than a boolean for symmetry with the BCA side's
          // field, where multi-match is the normal case.
          crossSourceCount: matched ? 1 : 0,
          crossSourceMeters: matched ? Math.round(osmAssignedMeters.get(id)) : null,
          crossSourceThresholdM: THRESHOLD_M,
          crossSourceContested: contestedOsmIds.has(id),
          crossSourceAnchorAmbiguous: anchorAmbiguous,
          // Not one of the six core attributes, but needed to write the
          // "{Agency} reported a fixed reader..." detail-panel copy without
          // a client-side join back into the other layer's whole file. Null
          // when unmatched.
          crossSourceAgencyName: matched ? anchorFeature.properties.attributes.agencyName : null,
        },
      },
    };
  });

  if (bcaMatchedCount === 0 || osmMatchedCount === 0) {
    log('alpr-cross-source', `warning: ${bcaMatchedCount} BCA matches, ${osmMatchedCount} OSM matches`);
  }

  // Symmetry assertion: every OSM id named in a BCA group must itself carry
  // that same site id, and vice versa — writing an asymmetric result would
  // let one side's detail panel claim a match the other side's cannot see.
  const osmById = new Map(osmFeatures.map((f) => [f.properties.id, f]));
  for (const entry of siteEntries) {
    for (const oid of entry.matchedOsmIds) {
      const osmF = osmById.get(oid);
      if (!osmF || osmF.properties.attributes.crossSourceSiteId !== entry.crossSourceSiteId) {
        console.error(
          `[alpr-cross-source] FAILED: asymmetric match — ${oid} does not carry ${entry.crossSourceSiteId}`,
        );
        process.exit(1);
      }
    }
  }

  log(
    'alpr-cross-source',
    `${bcaMatchedCount}/${bca.features.length} BCA records matched, ${osmMatchedCount}/${osm.features.length} OSM records matched, ${contestedPairs.length} contested pairing(s), ${discardedSameAgency.length} same-agency double-hit(s) discarded`,
  );

  await writeLayer('alpr', {
    layer: 'alpr',
    provenance: osm.metadata,
    knownGaps: osm.metadata.knownGaps,
    features: osmFeatures.map((f) => ({
      ...f,
      properties: { ...f.properties, attributes: f.properties.attributes },
    })),
  });

  await writeLayer('alpr-reported', {
    layer: 'alpr_reported',
    provenance: bca.metadata,
    knownGaps: bca.metadata.knownGaps,
    features: bcaFeatures.map((f) => ({
      ...f,
      properties: { ...f.properties, attributes: f.properties.attributes },
    })),
  });

  await mkdir(path.join(PUBLIC_DATA, 'reference'), { recursive: true });
  await writeFile(
    path.join(PUBLIC_DATA, 'reference', 'alpr-cross-source.json'),
    JSON.stringify(
      {
        metadata: {
          note: 'Proximity match this project computed between two independent ALPR records — not a document connecting them. See CLAUDE.md §1c.',
          thresholdMeters: THRESHOLD_M,
          osmLastUpdated: osm.metadata.lastUpdated,
          bcaLastUpdated: bca.metadata.lastUpdated,
          runAt: new Date().toISOString(),
          bcaMatchedCount,
          osmMatchedCount,
          bcaTotal: bca.features.length,
          osmTotal: osm.features.length,
        },
        sites: siteEntries,
        discardedSameAgencyPairings: discardedSameAgency,
        contestedPairings: contestedPairs,
      },
      null,
      2,
    ),
  );
  log('alpr-cross-source', 'wrote public/data/reference/alpr-cross-source.json');
}

main().catch((err) => {
  console.error(`[alpr-cross-source] FAILED: ${err.message}`);
  process.exit(1);
});

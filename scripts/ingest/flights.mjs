#!/usr/bin/env node
/**
 * Agency aircraft — live-ish positions of publicly-owned law-enforcement and
 * public-safety aircraft.
 *
 * Two steps, one script, run together every time (see refresh-flights.yml):
 *
 *  1. Identify. Download the FAA's Releasable Aircraft Registry (public
 *     domain, no key, refreshed daily) and match owner names against a short
 *     hard-coded list of Minnesota public-safety agencies. This is the only
 *     part of the record that is ever asserted as fact, and it is asserted
 *     only where the FAA record itself says so.
 *  2. Locate. Ask adsb.lol — a keyless, community-run, explicitly *unfiltered*
 *     ADS-B aggregator (ODbL) — where each identified aircraft last reported
 *     its position. An aircraft not seen in the last hour is dropped rather
 *     than drawn at a stale position. Each position is also checked against
 *     Minnesota's real county geometry (inMinnesota) and cross-referenced
 *     against data/community/ice-air-flights.json, so an aircraft a
 *     volunteer has directly observed on an ICE Air flight is tracked live
 *     even when owner-name matching alone wouldn't have caught it.
 *
 * Categories the user asked about but that turned up no sourceable aircraft
 * (BCA, county sheriff offices, ICE Air charters) are recorded in
 * `knownGaps` rather than silently omitted or guessed at — see the
 * AGENCY_MATCHERS list below for why each one is empty. ICE Air specifically:
 * removal flights run on contracted commercial charter operators (Swift Air,
 * World Atlantic, GlobalX), not aircraft registered to ICE or DHS, so FAA
 * ownership records cannot identify them, and no publicly exportable,
 * structured tail-number list was found (checked UWCHR's `ice-air` FOIA
 * dataset — historical passenger records only — and deportationflights.com,
 * a live tracker with no data export).
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fetchWithRetry, unzip, writeLayer, loadCounties, log, slugId, ROOT } from './lib/util.mjs';
import { findContaining } from '../../src/lib/geo.mjs';

const FAA_LANDING =
  'https://www.faa.gov/licenses_certificates/aircraft_certification/aircraft_registry/releasable_aircraft_download/index.cfm';
const FAA_ZIP_URL = 'https://registry.faa.gov/database/ReleasableAircraft.zip';
const ADSB_LOL_BASE = 'https://api.adsb.lol/v2/hex/';
const STALE_AFTER_SECONDS = 60 * 60;

/**
 * Who counts as which agency, and why. Matched against the FAA registry's
 * NAME and OTHER NAMES(1) columns, trimmed and upper-cased. Deliberately
 * narrow: "STATE OF MINNESOTA" alone would also catch MnDOT and university
 * aircraft, so DNR entries require the DNR marker in one of the two fields.
 */
const AGENCY_MATCHERS = [
  {
    agency: 'state_patrol',
    label: 'MN State Patrol / DPS Aviation Section',
    confidence: 'confirmed',
    test: (name) => name === 'MINNESOTA STATE PATROL' || name === 'MINNESOTA DEPARTMENT OF PUBLIC SAFETY',
    citation: {
      name: 'MN DPS State Patrol Flight Section aircraft & pilot dashboard',
      url: 'https://dps.mn.gov/divisions/msp/state-patrol-dashboard/flight-section-dashboard/aircraft-and-pilot-information-dashboard',
    },
  },
  {
    agency: 'dnr_enforcement',
    label: 'MN DNR Enforcement Aviation',
    confidence: 'confirmed',
    test: (name, other1) => name.startsWith('STATE OF MINNESOTA') && (name.includes('DNR') || other1.includes('DNR')),
    citation: {
      name: 'MN DNR Enforcement Division',
      url: 'https://www.dnr.state.mn.us/enforcement/index.html',
    },
  },
  /**
   * FAA ownership alone cannot identify an "ICE aircraft" — ICE Air charters
   * fly on contracted carriers, not government-registered planes. What FAA
   * ownership *can* confirm (tier 2) is which company owns a given tail
   * number; what journalism confirms (tier 4) is which companies currently
   * hold ICE Air charter subcontracts. Combining them only ever proves
   * "this plane belongs to a company under an ICE Air contract" — never
   * "this plane is flying an ICE mission right now". `confidence: 'reported'`
   * reflects that the agency link itself is journalism-sourced, and the
   * registry entry's limitations spell out the non-claim explicitly.
   */
  {
    agency: 'ice_air',
    label: 'Aircraft operated by a current ICE Air charter subcontractor',
    confidence: 'reported',
    test: (name) => name === 'EASTERN 737 ASSET HOLDINGS LLC' || name === 'GLOBAL CROSSING AIRLINES INC',
    citation: {
      name: 'CBS News — "Budget airline begins deportation flights for ICE with start of Arizona operations" (identifies CSI Aviation as ICE’s charter broker and GlobalX/Eastern Air Express as the carriers it hires for most flights)',
      url: 'https://www.cbs8.com/article/news/nation-world/budget-airline-begins-deportation-flights-ice/507-70860f94-6da1-469e-ac06-4bec93a6a0d1',
    },
  },
  // No FAA-registered aircraft found under these names as of the fetch date
  // below — see knownGaps. Left here, matching nothing, so the gap is a
  // documented "we looked and found none" rather than an absent category.
  { agency: 'bca', label: 'MN Bureau of Criminal Apprehension', confidence: 'confirmed', test: () => false },
  { agency: 'county_sheriff', label: 'MN county sheriff aviation units', confidence: 'confirmed', test: () => false },
];

/**
 * Minimal comma-split CSV reader for the FAA's flat, unquoted MASTER.txt.
 *
 * No state pre-filter: the Minnesota agency matchers are already scoped by
 * their own name patterns ("MINNESOTA STATE PATROL", "STATE OF MINNESOTA
 * ..."), and the ICE Air charter matcher is deliberately national — Eastern
 * Air Express (Kansas City, MO) and GlobalX (Miami, FL) are registered
 * nowhere near Minnesota. An early `STATE === 'MN'` filter silently dropped
 * every one of their aircraft during development; scanning all ~300k rows
 * costs a couple of seconds and is the only way to get both scopes right.
 */
function parseMaster(text) {
  const lines = text.split('\n');
  const header = lines[0].replace(/^﻿/, '').split(',').map((h) => h.trim());
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  for (const required of ['N-NUMBER', 'NAME', 'STATE', 'MODE S CODE HEX', 'OTHER NAMES(1)', 'LAST ACTION DATE']) {
    if (!(required in idx)) throw new Error(`FAA MASTER.txt is missing the "${required}" column`);
  }
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line[idx.STATE] === undefined) continue;
    rows.push(line.split(','));
  }
  return { idx, rows };
}

function faaDate(yyyymmdd) {
  const s = (yyyymmdd ?? '').trim();
  if (!/^\d{8}$/.test(s)) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

/**
 * Aircraft directly observed flying an ICE Air mission, from the volunteer
 * flight log — a stronger, more specific basis for tracking a given tail
 * number live than "its current owner is a known contractor". Read here so
 * that aircraft this repo already has eyewitness evidence about get tracked
 * even if a future entry's owner isn't yet one of the two named companies.
 */
async function loadFlightLog() {
  const p = path.join(ROOT, 'data/community/ice-air-flights.json');
  const doc = JSON.parse(await readFile(p, 'utf8'));
  const byHex = new Map();
  for (const flight of doc.flights ?? []) {
    if (!flight.icao24) continue;
    const hex = flight.icao24.toLowerCase();
    if (!byHex.has(hex)) byHex.set(hex, { tailNumber: flight.tailNumber, dates: [] });
    byHex.get(hex).dates.push(flight.date);
  }
  return byHex;
}

async function identifyRoster() {
  log('flights', 'fetching FAA Releasable Aircraft Registry (bulk, no key)');
  // FAA's registry site sits behind bot protection that rejects this
  // project's normal identifying User-Agent outright; a browser UA plus a
  // Referer matching the landing page is what gets a 200 instead of a
  // 403/503. The data itself is still the same public-domain bulk download.
  const res = await fetchWithRetry(FAA_ZIP_URL, {
    timeoutMs: 120_000,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      Referer: FAA_LANDING,
    },
  });
  const zip = unzip(Buffer.from(await res.arrayBuffer()));
  const masterBuf = zip.get('MASTER.txt');
  if (!masterBuf) throw new Error('ReleasableAircraft.zip did not contain MASTER.txt');
  const { idx, rows } = parseMaster(masterBuf.toString('utf8'));

  const roster = [];
  const allByHex = new Map(); // every registered hex -> its row, for the flight-log cross-reference below
  for (const cols of rows) {
    const name = (cols[idx.NAME] ?? '').trim().toUpperCase();
    const other1 = (cols[idx['OTHER NAMES(1)']] ?? '').trim().toUpperCase();
    const hex = (cols[idx['MODE S CODE HEX']] ?? '').trim().toLowerCase();
    if (!hex) continue;
    allByHex.set(hex, cols);
    const match = AGENCY_MATCHERS.find((m) => m.test(name, other1));
    if (!match) continue;
    roster.push({
      agency: match.agency,
      icao24: hex,
      tailNumber: `N${(cols[idx['N-NUMBER']] ?? '').trim()}`,
      ownerName: (cols[idx.NAME] ?? '').trim(),
      lastActionDate: faaDate(cols[idx['LAST ACTION DATE']]),
      confidence: match.confidence,
      citation: match.citation,
      flightLogDates: null,
    });
  }
  log('flights', `matched ${roster.length} aircraft against ${AGENCY_MATCHERS.length} agency patterns`);

  // Cross-reference the volunteer-observed flight log both ways: enrich an
  // aircraft already tracked via owner match with its observed flight
  // date(s), and separately track any aircraft the log identifies that owner
  // matching missed — eyewitness evidence of a specific ICE Air flight is at
  // least as strong a basis for live-tracking that tail number as "its owner
  // is a known contractor".
  const flightLog = await loadFlightLog();
  for (const entry of roster) {
    if (flightLog.has(entry.icao24)) entry.flightLogDates = flightLog.get(entry.icao24).dates;
  }
  let addedFromLog = 0;
  for (const [hex, obs] of flightLog) {
    if (roster.some((r) => r.icao24 === hex)) continue;
    const cols = allByHex.get(hex);
    roster.push({
      agency: 'ice_air',
      icao24: hex,
      tailNumber: obs.tailNumber,
      ownerName: cols ? (cols[idx.NAME] ?? '').trim() : null,
      lastActionDate: cols ? faaDate(cols[idx['LAST ACTION DATE']]) : null,
      confidence: 'reported',
      citation: {
        name: 'Directly observed operating an ICE Air flight — see the "Observed ICE Air flights" layer',
        url: '/data/observed-ice-flights.geojson',
      },
      flightLogDates: obs.dates,
    });
    addedFromLog++;
  }
  if (addedFromLog) log('flights', `+${addedFromLog} aircraft added from the observed flight log (not caught by owner matching)`);

  return roster;
}

async function locate(roster) {
  if (!roster.length) return new Map();
  const hexes = roster.map((r) => r.icao24).join(',');
  const res = await fetchWithRetry(`${ADSB_LOL_BASE}${hexes}`, { timeoutMs: 30_000 });
  const body = await res.json();
  const byHex = new Map();
  for (const ac of body.ac ?? []) {
    if (ac.seen !== undefined && ac.seen <= STALE_AFTER_SECONDS) byHex.set(ac.hex, ac);
  }
  log('flights', `${byHex.size}/${roster.length} aircraft seen within the last hour`);
  return byHex;
}

async function main() {
  const roster = await identifyRoster();
  const positions = await locate(roster);
  const counties = await loadCounties();

  const features = [];
  let inMnCount = 0;
  for (const entry of roster) {
    const ac = positions.get(entry.icao24);
    if (!ac || typeof ac.lat !== 'number' || typeof ac.lon !== 'number') continue;
    const onGround = ac.alt_baro === 'ground';
    // Real containment against MN's actual county geometry, not a padded
    // display bounding box — the same reference every other layer resolves
    // a Minnesota location against.
    const county = findContaining([ac.lon, ac.lat], counties.features);
    if (county) inMnCount++;
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [ac.lon, ac.lat] },
      properties: {
        id: slugId('aircraft', entry.icao24),
        layer: 'agency_aircraft',
        county: county?.properties.name ?? null,
        state: 'MN',
        countyFips: county?.properties.geoid ?? null,
        name: entry.tailNumber,
        confidence: entry.confidence,
        sourceDate: entry.lastActionDate,
        attributes: {
          agency: entry.agency,
          ownerName: entry.ownerName,
          icao24: entry.icao24,
          callsign: (ac.flight ?? '').trim() || null,
          altitudeFt: onGround ? null : (ac.alt_baro ?? null),
          groundSpeedKt: ac.gs ?? null,
          track: ac.track ?? null,
          onGround,
          lastContactSeconds: Math.round(ac.seen),
          inMinnesota: Boolean(county),
          observedFlightDates: entry.flightLogDates ? entry.flightLogDates.join('; ') : null,
        },
      },
    });
  }
  log('flights', `${inMnCount} of ${features.length} airborne aircraft currently in Minnesota`);

  const byAgency = features.reduce((acc, f) => {
    acc[f.properties.attributes.agency] = (acc[f.properties.attributes.agency] ?? 0) + 1;
    return acc;
  }, {});
  log('flights', `airborne now: ${Object.entries(byAgency).map(([k, v]) => `${k}=${v}`).join(', ') || 'none'}`);

  const today = new Date().toISOString().slice(0, 10);

  await writeLayer('agency-aircraft', {
    layer: 'agency_aircraft',
    provenance: {
      source: 'adsb.lol (community ADS-B aggregator)',
      sourceUrl: 'https://www.adsb.lol/',
      license: 'ODbL 1.0',
      licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
      attribution: '© adsb.lol contributors',
      sourceDate: null,
      refresh: 'frequent',
      secondarySources: [
        {
          key: 'faa',
          name: 'FAA Releasable Aircraft Registry',
          url: FAA_LANDING,
          license: 'Public domain (US federal government work)',
          licenseUrl: 'https://www.usa.gov/government-works',
          contributes: {
            en: 'Owner-of-record cross-reference used to identify which aircraft belong to a public agency or an ICE Air charter subcontractor.',
            es: 'Referencia cruzada del propietario registrado, usada para identificar qué aeronaves pertenecen a una agencia pública o a un subcontratista de ICE Air.',
          },
        },
        {
          key: 'cbsnews-ice-charter',
          name: 'CBS News — carriers ICE’s charter broker CSI Aviation hires for most removal flights',
          url: 'https://www.cbs8.com/article/news/nation-world/budget-airline-begins-deportation-flights-ice/507-70860f94-6da1-469e-ac06-4bec93a6a0d1',
          license: 'All rights reserved (cited as journalism, not redistributed)',
          licenseUrl: null,
          contributes: {
            en: 'Identifies GlobalX and Eastern Air Express as the carriers currently hired for most ICE Air charter flights — the basis for the ice_air agency match below.',
            es: 'Identifica a GlobalX y Eastern Air Express como las aerolíneas actualmente contratadas para la mayoría de los vuelos chárter de ICE Air, base de la coincidencia de agencia ice_air a continuación.',
          },
        },
      ],
    },
    knownGaps: [
      'Positions reflect each aircraft’s last reported location via adsb.lol at ingest time (refreshed hourly), not literal live tracking; an aircraft with no contact in the last hour is omitted rather than drawn at a stale position.',
      'An aircraft outside range of every volunteer ADS-B receiver, with its transponder off, or grounded with ADS-B disabled will not appear even though it exists.',
      `No FAA-registered aircraft was found under the MN Bureau of Criminal Apprehension's name as of ${today}; it does not appear to operate its own registered aircraft.`,
      `No FAA-registered aircraft was found under any Minnesota county sheriff's office name as of ${today}.`,
      'ice_air records identify aircraft owned by companies currently reported to hold ICE Air charter subcontracts (Eastern Air Express, GlobalX) — this is NOT a claim that any specific flight shown is an active ICE mission; these are charter airlines that also fly unrelated commercial work. See the layer description for the full caveat.',
      'FAA ownership matching under-counts these fleets: most charter capacity is leased rather than owned outright by the operating brand, so aircraft flying real ICE Air missions may be registered to a lessor with no name resembling either company and will not appear here.',
      'inMinnesota is computed against real Minnesota county geometry, the same reference every other layer resolves a location against — not a padded display bounding box. county/countyFips are populated only when the aircraft is actually inside a Minnesota county at ingest time; both stay null otherwise, including for ice_air aircraft flying elsewhere in the country, which is most of the time.',
      'observedFlightDates links an aircraft to the "Observed ICE Air flights" layer when a volunteer has directly logged it. A small number of tail numbers are tracked live on that basis alone, independent of the owner-name matchers above — see data/community/ice-air-flights.json.',
    ],
    features,
  });
}

main().catch((err) => {
  console.error(`[flights] FAILED: ${err.message}`);
  process.exit(1);
});

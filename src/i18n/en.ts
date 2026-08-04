/**
 * English is the reference dictionary. Values are typed as plain strings
 * rather than literals so translations can differ from them.
 */
export const en: Record<string, string> = {
  siteName: 'FlockOff',
  tagline: 'Making the systems of surveillance, enforcement, and housing policy visible in Minnesota.',

  // Navigation
  navMap: 'Map',
  navNearMe: 'Near me',
  navSources: 'Sources & methodology',
  navExplainer: 'How this connects',
  navFlightLog: 'Flight log',
  navAct: 'Take action',
  navData: 'Open data',
  navContribute: 'Contribute',
  navAbout: 'What this is',
  skipToContent: 'Skip to main content',

  // Live flights — always on in the main map's sidebar (no checkbox to
  // disable it), deliberately not a registry layer (see
  // src/lib/liveFlights.ts). Worldwide, filtered
  // server-side (functions/api/ice-flights.js) to aircraft broadcasting a
  // callsign matching known ICE Air charter operators — the same
  // underlying idea as Otter Goose's MSP ICE Air Flight Tracker
  // (ottergoose.net), done natively instead of embedding a third party.
  // {count}, {seconds} substituted client-side as the feed updates.
  liveFlightsToggleLabel: 'Live ICE Air charter flights',
  liveFlightsAboutToggle: 'About this data',
  liveFlightsIntro:
    'Aircraft anywhere in the world currently broadcasting a callsign matching known ICE Air charter operators, from adsb.lol — the same approach Otter Goose\'s MSP ICE Air Flight Tracker (ottergoose.net) uses. These charters spend most of their time far outside Minnesota, so this is a worldwide feed, not one scoped to the state like every other layer here.',
  liveFlightsCaveat:
    'A callsign match is not registry confirmation: it can be reused for an unrelated flight, reassigned, or simply not broadcast, and this filter cannot tell the difference. Positions between updates are estimated by interpolating between two real fixes — not a new GPS reading every frame. The colored trail behind each aircraft is its actual recent reported track; clicking a plane loads its full real history back to wherever it last left the ground. The dashed gray line ahead is a straight-line projection from current heading and speed for the next 10 minutes, not a real flight plan — this feed provides neither. Filtering happens server-side before anything reaches your browser, and this refreshes less often than a typical live feed since the underlying worldwide query is large.',
  liveFlightsLegendTitle: 'Colored by altitude',
  liveFlightsAltGround: 'On the ground',
  liveFlightsAltLow: 'Below 10,000 ft',
  liveFlightsAltMid: '10,000–25,000 ft',
  liveFlightsAltHigh: '25,000–35,000 ft',
  liveFlightsAltVeryHigh: 'Above 35,000 ft',
  liveFlightsCount: '{count} aircraft tracked',
  liveFlightsUpdated: 'updated {seconds}s ago',
  liveFlightsUnavailable: 'adsb.lol is not responding right now.',

  // Map chrome
  layers: 'Layers',
  filters: 'Filters',
  layersOn: 'layers switched on',
  clearFilters: 'Clear filters',
  filtersCleared: 'Filters cleared',
  ofTotal: 'of',
  loading: 'Loading map data…',
  mapLabel: 'Interactive map of surveillance, enforcement and housing-policy records',
  resetView: 'Reset to Minnesota',
  closePanel: 'Close panel',
  noResults: 'No records match the current filters.',

  // Search / near me
  searchPlaceholder: 'Search a city, township, county, or agency',
  searchLabel: 'Search cities, townships, counties and agencies',
  nearMeTitle: 'What is around this place',
  nearMeIntro:
    'Pick a place in Minnesota to see every layer around it in one view. Nothing you enter is sent anywhere or stored.',
  useMyLocation: 'Use my location',
  locating: 'Locating…',
  locationDenied: 'Location permission was declined. You can search for a place instead.',
  locationUnavailable: 'Your device could not provide a location. You can search for a place instead.',
  chooseAPlace: 'Choose a place',
  // Card headings, empty states and caveats live on each layer in the registry
  // now, so a new layer arrives carrying its own text. What is left here is the
  // generic frame the page puts around them. {braces} are substituted.
  nearMePrivacy:
    'This lookup runs entirely in your browser. The list of Minnesota places is downloaded with the page, so nothing you type is sent to a geocoder, to us, or to anyone else — there is no server here to log it.',
  aroundYourLocation: 'Around your location',
  aroundPlace: 'Around {place}',
  stateName: 'Minnesota',
  mappedWithin: 'mapped within {miles} mi',
  alsoWithin: '{count} within {miles} mi',
  nearestIs: 'Nearest is {distance} mi away',
  distanceAway: '{distance} mi away',
  foundInCounty: '{count} in this county:',
  crossLayerNote:
    'These are not separate maps. Cameras feed searches, searches feed enforcement, enforcement feeds detention, and all of it sits on ground shaped by decades of housing policy.',
  readHowThisConnects: 'Read how this connects',

  // Who answers here
  //
  // The site could always show a reader a camera and never tell them whose it
  // was or who had to answer for it. These strings are that answer. The
  // offices are the statutory defaults of Minn. Stat. § 13.02, subd. 16(b);
  // the citations live next to the rule in src/lib/authority.mjs.
  whoAnswersTitle: 'Who answers to you here',
  whoAnswersIntro:
    'Every point in Minnesota sits under several governments at once. These are the offices that have to answer a request about this ground, closest first.',
  whoAnswersEmpty:
    'This point falls outside the jurisdiction boundaries we hold. Try a place name instead.',
  youAreIn: 'You are in',
  jurisdictionCity: 'City',
  jurisdictionTownship: 'Township',
  jurisdictionUnorganized: 'Unorganized territory',
  jurisdictionCounty: 'County',
  inCounty: 'in {county}',

  // One line per office: what it is, and what to bring it.
  officeTownClerk: 'Town clerk',
  officeTownClerkRole:
    'The town board designates who answers data requests. Until it does, Minnesota law makes it the clerk, who already holds the town’s records, books and papers.',
  officeCityClerk: 'City clerk',
  officeCityClerkRole:
    'The city council designates who answers data requests. Until it does, Minnesota law makes it the elected or appointed city clerk.',
  officeCountyAdministrator: 'County coordinator or administrator',
  officeCountyAdministratorRole:
    'The county board designates who answers data requests. Until it does, Minnesota law makes it the county coordinator or administrator — or the county auditor, where the county employs neither.',
  officeLawEnforcement: 'Sheriff’s office',
  officeLawEnforcementRole:
    'Where licence plate reader data actually sits. Minnesota’s ALPR statute requires a public log, an audit trail of every access, and an independent audit every two years.',
  officeCommissioner: 'Commissioner of Administration',
  officeCommissionerRole:
    'If a request is refused, the commissioner will say in writing whether the refusal was lawful, within 50 days. The opinion does not bind the entity, but a court must give it deference.',

  // The finding this page exists to surface.
  noLocalGovernment:
    'This ground has no local government of its own. There is no town board and no clerk here — the county is the local government, and everything a town board would handle starts with the county.',
  operatorMismatch:
    'The cameras mapped near here are operated by {operators} — not by {jurisdiction}. A body you elect locally does not control equipment another government installed, even inside your own borders.',
  operatorUnattributed:
    '{count} of the cameras mapped near here have no operator recorded. Who runs them is a question, not a finding — and it is one a records request can answer.',
  writeToThisOffice: 'Write to this office',
  underStatute: 'Under {cite}',

  // The way out of the map's detail panel. A record is the end of somebody
  // else's paperwork; these say what the next piece would be.
  actionAddressed: 'The letter will be addressed to {body}, as recorded on this record.',
  actionUnknownOperator:
    'Nobody has recorded who operates this one. The letter will be addressed to {body} — the agency for this ground — and asking who runs it is itself a fair question to put to them.',
  actionPickBody: 'You will choose which body to address on the next page.',

  // Locator on the Take Action page
  locateTitle: 'Start from where you live',
  locateIntro:
    'Pick your city or township and this page will name the offices that have to answer you, and address the letter below to the one you choose.',
  locateLabel: 'Your city or township',
  locatePlaceholder: 'e.g. Waterford Township, or Northfield',
  locateHint:
    'All 2,757 Minnesota cities, townships and unorganized territories are listed — not only the incorporated cities.',
  useThisBody: 'Address the letter to this office',
  addressedTo: 'The letter below is now addressed to {entity}.',

  // Detail panel
  whatThisMeans: 'What this means',
  source: 'Source',
  sourceDate: 'Source date',
  lastUpdated: 'Last updated',
  license: 'Licence',
  confidence: 'Confidence',
  limitations: 'Limitations',
  county: 'County',
  viewRecord: 'View the original record',

  // Spacing diagram in the detail panel. The summary is the diagram's
  // accessible equivalent, so it carries the same offsets the drawing does.
  positionsScale: 'Drawn to scale over {total} miles. A larger dot means more in one place.',
  positionsSummary: '{count} marks along {total} miles, at {offsets} miles from the start.',
  densityScale: 'sparse → dense',
  // The legend has to say what a brighter patch is, or the reader is left to
  // guess whether it means more cameras or a different kind of camera.
  densityNodes: 'Brighter patches are nodes: two or more cameras standing together.',
  categoryFromZoom: 'Colours apply once cameras are drawn one by one, from zoom {zoom}.',

  confidenceConfirmed: 'Confirmed — documented in an official public record.',
  confidenceReported: 'Reported — from permit filings or secondary records that may be out of date.',
  confidenceProbabilistic: 'Probabilistic — crowd-sourced, may have moved or been removed.',

  // Honest-limits banner
  limitsTitle: 'What this is, and what it is not',

  // Flight log — persisted ground-arrival/departure history for aircraft
  // matching the live overlay's ICE Air charter filter, plus a habeas-corpus
  // legal explainer. Data is always confidence: 'reported', never
  // 'confirmed' (see src/lib/flightLog.ts). The legal-context copy below is
  // an attorney-review draft — see flightLogDraftNotice.
  flightLogTitle: 'Flight log',
  flightLogIntro:
    "A searchable history of ground arrivals and departures for aircraft that have matched this site's ICE Air charter filter, plus a short explainer on why that timing data matters to habeas corpus practice. Unlike the live map overlay, records here persist past the current poll, so a lawyer can cite a specific ground time after the fact.",
  flightLogSearchLabel: 'Tail number, hex code, or callsign',
  flightLogKnownGaps:
    "Known gaps: sightings are captured by polling once per minute, so a timestamp can be off by up to that much. Airport identification is best-effort and Minnesota-only — sightings elsewhere are recorded with a null airport rather than a guess. A callsign match is not registry confirmation: callsigns can be reused, reassigned, or simply not broadcast, and this filter cannot tell the difference.",
  flightLogLegalContextTitle: 'Why flight timing data matters in habeas corpus cases',
  flightLogLegalContext:
    "In habeas corpus practice, courts often default to treating a petitioner's immediate custodian — whoever holds the power to produce them — as the proper respondent, and to hearing the case where that custodian is located. This is the rule the Supreme Court applied in Rumsfeld v. Padilla, 542 U.S. 426 (2004), for challenges to a person's present physical confinement. It is a default, not an absolute: courts have recognized exceptions, and which custodian and which court are proper can turn on the specific facts of a transfer. A documented ground-arrival or ground-departure time is one input into that fact-specific question, nothing more.\n\nHabeas jurisdiction under 28 U.S.C. § 2241 reaches broadly: in Munaf v. Geren, 553 U.S. 674 (2008), the Supreme Court held it extends to anyone in actual custody of the United States, regardless of the formal authority holding them. The same decision cuts the other way too — it also held that courts may not use habeas to enjoin the transfer of a person in U.S. custody to a foreign sovereign to face that sovereign's own prosecution for crimes committed in its territory. Both halves are part of the holding. Separately, Federal Rule of Appellate Procedure 23(a) is a real, narrow procedural safeguard: while a habeas petition is pending review, it bars a custodian from transferring the petitioner out of the court's jurisdiction without that court's authorization. It says nothing on its own about what any particular timestamp can establish.\n\nTwo recent cases show how courts have actually handled the timing of removal flights — cited here as documented history, not as settled precedent for future disputes. In J.G.G. v. Trump (D.D.C. No. 1:25-cv-00766, filed March 15, 2025), the court, during an emergency hearing, ordered that flights then in the air be returned; one flight that had already departed landed at its destination afterward, and the court later found probable cause for criminal contempt. In A.A.R.P./W.M.M. v. Trump (Supreme Court No. 24A1007, 605 U.S. ___ (2025)), the Court issued a middle-of-the-night emergency order barring removal of a class of people facing removal, pending further review, and later vacated the lower appellate judgment and remanded for the district and circuit courts to address preliminary-injunction and due-process-notice requirements. Neither case establishes a rule that this project's data proves anything under.\n\nJust Security's Immigration Habeas Tracker (justsecurity.org/133928) has documented instances in which courts found that the government removed or transferred petitioners in violation of court orders — we cite it only for that specific proposition. Some advocates, including Lexington Alarm, whose Habeas Flight Watch inspired this page, argue further that habeas jurisdiction 'does not end at takeoff' and continues until an aircraft lands. We could not verify that framing against any judicial holding, so it appears here only as an attributed argument made by others, not as a claim this project makes about the law.\n\nWe have not found any court decision that specifically admitted ADS-B flight-tracking timestamp data like this as evidence, and we make no claim that this project's data has been used in any specific case. We also have not found, and do not offer, any legal framework describing the risk involved in publishing tracking data of this kind — if that matters to your situation, that is a question for an attorney, not something this page can answer.",
  flightLogNotLegalAdvice:
    'This is not legal advice. If you are involved in a habeas corpus matter, consult an attorney — this page is a starting point for research, not a substitute for counsel.',
  flightLogDraftNotice:
    'Draft — pending attorney review. This section has not yet been reviewed by a lawyer and should not be relied upon until it has been.',

  // Footer
  openSource: 'Open source',
  noTrackers: 'No trackers, no analytics, no accounts.',
  attribution: 'Attribution',
};

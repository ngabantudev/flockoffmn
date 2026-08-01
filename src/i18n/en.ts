/**
 * English is the reference dictionary. Values are typed as plain strings
 * rather than literals so translations can differ from them.
 */
export const en: Record<string, string> = {
  siteName: 'get-flocked',
  tagline: 'Making the systems of surveillance, enforcement, and housing policy visible in Minnesota.',

  // Navigation
  navMap: 'Map',
  navNearMe: 'Near me',
  navSources: 'Sources & methodology',
  navExplainer: 'How this connects',
  navAct: 'Take action',
  navData: 'Open data',
  navContribute: 'Contribute',
  navAbout: 'What this is',
  skipToContent: 'Skip to main content',

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

  // Footer
  openSource: 'Open source',
  noTrackers: 'No trackers, no analytics, no accounts.',
  attribution: 'Attribution',
};

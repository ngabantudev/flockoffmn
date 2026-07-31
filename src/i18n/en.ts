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
  skipToMap: 'Skip to map',

  // Map chrome
  layers: 'Layers',
  legend: 'Legend',
  filters: 'Filters',
  toggleLayer: 'Toggle layer',
  showLayer: 'Show',
  hideLayer: 'Hide',
  clearFilters: 'Clear filters',
  featuresShown: 'shown',
  ofTotal: 'of',
  loading: 'Loading map data…',
  mapLabel: 'Interactive map of surveillance, enforcement and housing-policy records',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  resetView: 'Reset to Minnesota',
  closePanel: 'Close panel',
  noResults: 'No records match the current filters.',

  // Search / near me
  searchPlaceholder: 'Search a city, county, or agency',
  searchLabel: 'Search places, counties and agencies',
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
  downloadLayer: 'Download this layer',

  // Spacing diagram in the detail panel. The summary is the diagram's
  // accessible equivalent, so it carries the same offsets the drawing does.
  positionsScale: 'Drawn to scale over {total} miles. A larger dot means more in one place.',
  positionsSummary: '{count} marks along {total} miles, at {offsets} miles from the start.',

  confidenceConfirmed: 'Confirmed — documented in an official public record.',
  confidenceReported: 'Reported — from permit filings or secondary records that may be out of date.',
  confidenceProbabilistic: 'Probabilistic — crowd-sourced, may have moved or been removed.',

  // Honest-limits banner
  limitsTitle: 'What this is, and what it is not',
  limitsNotLive: 'Not a live tracker. This shows where infrastructure has been recorded, never where any person is.',
  limitsNotPeople: 'Never about people. Every record describes an institution, a building, a contract, or a policy.',
  limitsNotLegal: 'Not legal advice. The action tools are informational.',
  limitsIncomplete: 'Incomplete by nature. Every layer is dated, partial, or approximate — each one says how.',
  dismiss: 'Dismiss',

  // Footer
  openSource: 'Open source',
  noTrackers: 'No trackers, no analytics, no accounts.',
  attribution: 'Attribution',
};

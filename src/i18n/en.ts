/**
 * English is the reference dictionary. Values are typed as plain strings
 * rather than literals so translations can differ from them.
 */
export const en: Record<string, string> = {
  siteName: 'FlockOff: MN',
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
  // Short forms for the bottom icon bar below `lg` — one word each, close
  // enough in length that seven of them read as one evenly-spaced row
  // instead of some truncating and others sitting in a lot of empty space.
  navMapShort: 'Map',
  navNearMeShort: 'Nearby',
  navSourcesShort: 'Sources',
  navExplainerShort: 'Network',
  navActShort: 'Act',
  navDataShort: 'Data',
  navAboutShort: 'About',
  skipToContent: 'Skip to main content',

  // Compare slider
  // Title Case here — compareTitle is a visible <h1>, comparePovertySide/
  // compareBlackSide are legend headers, compareOpenButton/compareShowAlpr
  // are button/control labels. compareIntro, compareAccessibleNote and
  // compareVintage are body prose and stay sentence case on purpose.
  compareTitle: 'Poverty Rate And Black Population Share, Side By Side',
  compareIntro:
    'Drag the slider to compare two census-tract layers on the same map: poverty rate on the left, Black population share on the right. Both come from the same U.S. Census Bureau American Community Survey estimates as the toggleable layers on the main map — this view puts them side by side rather than one at a time.',
  compareSliderLabel: 'Move the divider between poverty rate and Black population share',
  comparePovertySide: 'Poverty Rate',
  compareBlackSide: 'Black Population Share',
  compareSourceLabel: 'Source:',
  compareVintage: 'Census Bureau’s American Community Survey, 5-year estimates,',
  compareShowAlpr: 'Show ALPR Cameras',
  compareAccessibleNote:
    'This split view is a visual comparison tool and has no non-visual equivalent — a screen reader cannot describe which shade sits under a moving divider. For the same data in an accessible form, close this view and switch on the Poverty rate and Black population share layers one at a time, or download the underlying table from Open data.',
  compareAccessibleLink: 'Open data downloads',
  compareOpenButton: 'Compare Poverty & Black Population',
  compareClose: 'Close comparison view',

  // Map chrome
  layers: 'Layers',
  filters: 'Filters',
  layersOn: 'layers switched on',
  // Relabelled from "Clear filters" — the button also switches off every
  // layer toggle and clears the search box and jurisdiction boundary, so
  // "filters" alone undersold what one click actually does.
  clearFilters: 'Reset all layers & filters',
  filtersCleared: 'All layers and filters cleared',
  ofTotal: 'of',
  // Category bulk switch (level 1) — `{n} of {m} shown` sentence read by a
  // screen reader beside the visual "(n/m)" badge. See MapView.astro's
  // category-count markup.
  categoryLayersShown: '{n} of {m} layers shown',
  // "None"/"All" text flanking the category bulk switch. aria-hidden — the
  // switch itself carries the real accessible name.
  filterNone: 'None',
  filterAll: 'All',
  // aria-label for the category bulk switch and the per-layer toggle switch.
  filterCategoryToggleLabel: 'Show all {category} layers',
  filterLayerToggleLabel: 'Show {layer}',
  // Value-level (level 3) filter group controls.
  filterResetToDefault: 'Reset to default',
  filterSearchValuesLabel: 'Search {filter} values',
  filterSearchValuesPlaceholder: 'Search values',
  filterSearchValuesEmpty: 'No values named "{query}" in {filter}. This list covers every value this layer records for that field.',
  // Search-within-layer-names (level 2), same mechanism as the value search.
  filterSearchLayersLabel: 'Search {category} layers',
  filterSearchLayersPlaceholder: 'Search layers',
  filterSearchLayersEmpty: 'No layers named "{query}" in {category}.',
  // dateRange filter control (e.g. 287(g) agreement signed date).
  filterDateFrom: 'From',
  filterDateTo: 'To',
  loading: 'Loading map data…',
  // Replaces a layer row's summary line while its checkbox is checked but its
  // data failed to load (see MapView.astro's onError wiring) — {message} is
  // the caught error's own text (an HTTP status, a network failure), not
  // translated itself, the same way status()'s existing onError toast already
  // shows it raw.
  layerLoadError: "Couldn't load — {message}",
  mapLabel: 'Interactive map of surveillance, enforcement and housing-policy records',
  resetView: 'Reset to Minnesota',
  mapNearMe: 'ALPRs Near Me',
  mapNearMeFound: '{count} nearby, {shown} shown.',
  mapNearMeNone: 'Nothing mapped within range of this location.',
  // Announced via #map-status (aria-live) whenever a record is selected —
  // from a map tap, a search result, or /near-me alike — independent of
  // whatever layer-visibility side effect a selection happens to trigger.
  // See #131.
  recordSelected: '{layer}: {name} selected',
  // Label and value format for the search-radius slider that appears once a
  // "near me" location is found (NearMeRadiusControl) — drag it to widen or
  // narrow which cameras/readers are drawn.
  mapNearMeRadiusLabel: 'Search radius',
  mapNearMeRadiusValue: '{mi} mi',
  // The homepage map's own DOM record list for "near me" — reuses
  // mapNearMe/mapNearMeFound/mapNearMeNone/locationDenied/etc. above for the
  // sheet's title and status text; these are the pieces those don't cover.
  mapNearMeListSummary: '{found} found, {shown} shown within {radius} mi',
  mapNearMeBack: 'Back to list',
  mapNearMeCrossListed: 'Cross-listed',
  mapNearMeLoading: 'Looking for nearby cameras…',
  mapNearMeLayerError: 'Could not load {layer} — results for it may be incomplete.',
  // Appended to #detail-tab's sr-only name while the sheet shows the list
  // rather than one record — see MapView.astro's [data-detail-tab-name].
  mapNearMeListTabSuffix: ', {count} nearby',
  closePanel: 'Close panel',
  noResults: 'No records match the current filters.',
  // Label for the pull tab that collapses/expands the detail panel — see
  // #detail-tab in MapView.astro. Not reused from `whatThisMeans` or any
  // existing detail-panel string: this one names the panel itself, not its
  // content.
  recordPanel: 'Record',

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
  locationTimedOut: 'Your device took too long to respond. You can search for a place instead.',
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
  entityUnattributed: 'No operator recorded',
  showOnMap: 'Show on map',
  showMore: 'Show {count} more',
  outsideMinnesotaTitle: 'This location is outside Minnesota',
  outsideMinnesota:
    'flockoffmn tracks Minnesota only. This point falls outside the state, so there is nothing mapped to show here.',
  lowAccuracy:
    'Your device reported this location to within about {accuracy} mi — results may be off by that much.',
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
  crossListedCorner: 'Cross-listed corner',
  crossListedNearMissLegend:
    'Near miss — a filing had a volunteer-mapped device nearby, but it counted as a match on a closer filing by the same agency instead.',
  crossSourceJumpToMatch: 'Jump to the filing that counted the match',

  confidenceConfirmed: 'Confirmed — documented in an official public record.',
  confidenceReported: 'Reported — from permit filings or secondary records that may be out of date.',
  confidenceProbabilistic: 'Probabilistic — crowd-sourced, may have moved or been removed.',

  // Honest-limits banner
  limitsTitle: 'What this is, and what it is not',

  // Footer
  openSource: 'Open source',
  noTrackers: 'No trackers, no analytics, no accounts.',
  attribution: 'Attribution',

  // News feed — press coverage, Tier 4. See src/lib/news.ts for why this is
  // deliberately not a map layer.
  navNews: 'Coverage',
  navNewsShort: 'News',
  newsTitle: 'Coverage',
  newsIntro:
    'Minnesota news stories about surveillance equipment, enforcement agreements, and detention contracts — collected automatically from Google News and refreshed daily. It is a reading list, not a record.',
  newsTierTitle: 'This page is press coverage, not records.',
  newsTierWarning:
    'Everything below is a headline written by a news outlet. Headlines are leads: they point you at something worth checking, and they are sometimes wrong, incomplete, or corrected later. Nothing here is a source for a claim on its own.',
  newsTierPointer: 'For records with document numbers and citations behind them, use the',
  newsTierPointerAnd: 'and',
  newsEmpty:
    'The coverage archive has not been built yet. Run "npm run data:news" to fetch it.',
  newsCoverageTitle: 'What this page cannot see',
  newsScreenedPrefix: 'On the most recent run,',
  newsScreenedSuffix:
    'stories were dropped before anything was saved because they were about individual people — arrests, court cases, named officers, or people caught by a camera. This site records the systems, never the people they are aimed at, and those headlines are counted here but never stored.',
  newsTopicAlpr: 'Plate readers',
  newsTopicSurveillance: 'Surveillance tech',
  newsTopicImmigration: 'Immigration enforcement',
  newsTopicDetention: 'Detention',
  newsTopicOther: 'Other',

  // News rail + archive controls.
  newsRailTitle: 'Related MN coverage',
  newsRange24h: '24H',
  newsRange7d: '7D',
  newsRange30d: '30D',
  newsRange1y: '1Y',
  newsRangeAll: 'All',
  newsRangeLabel: 'Date range',
  newsTopicLabel: 'Topic',
  newsTopicAll: 'All topics',
  newsNoneInRange: 'No stories in this range.',
  newsOpenArchive: 'Open the full archive',
  newsCurveCaption: 'Stories published per month —',
  newsCurveAlt: 'Stories published per month:',
  newsShownSuffix: 'shown',
  newsNoneRecent: 'No coverage in this window. The archive has the full record.',
  newsRailFallback: 'Recent headlines load in your browser.',
};

/**
 * The unified feature schema (product spec §9).
 *
 * Every layer — cameras, agency agreements, facilities, buildings, historical
 * policy zones — is normalised into the same shape so that cross-layer views
 * (the "near me" panel, F4) can treat them uniformly.
 *
 * Hard boundary (spec §4): a Feature describes an institution, a piece of
 * infrastructure, or a historical policy. It never describes a person. There
 * is deliberately no field on this type that could carry a personal name, a
 * case number, or an identifier for a private individual.
 */

export type LayerId =
  | 'alpr'
  | 'agency_287g'
  | 'detention_facility'
  // Every agency's own jurisdiction, not an internal subdivision like
  // Minneapolis's numbered precincts — the boundary a records request or a
  // council question actually has to be addressed to. See
  // scripts/ingest/agency-jurisdictions.mjs for the metro-only scope and why.
  | 'agency_jurisdiction'
  // One point per building, not per agency — resolves the very subdivision
  // agency_jurisdiction folds into one polygon (Minneapolis's five numbered
  // precincts are five separate points here). See
  // scripts/ingest/agency-buildings.mjs.
  | 'agency_building'
  // Readers the operating agency itself reported to the state under Minn.
  // Stat. § 13.824 — the only camera records on this map whose operator is
  // documented rather than guessed. See scripts/ingest/alpr-reported.mjs.
  | 'alpr_reported'
  | 'data_center'
  // How much traffic each stretch of road carries on an average day. The
  // substrate the cameras are bolted to, and deliberately not a surveillance
  // record: it counts vehicles passing a point, never which ones.
  | 'aadt'
  | 'redlining'
  // The same HOLC sheet as `redlining`, redrawn block by block by the
  // Metropolitan Council — two cities instead of eight, no area identifier and
  // so no appraiser's prose, but roughly seventy times the resolution and the
  // lakes and parks excluded rather than swallowed. Neither layer supersedes
  // the other; see scripts/ingest/holc-detail.mjs.
  | 'holc_appraisal_detail'
  // The only layer whose upstream source is a transaction between named
  // private individuals. It is published parcel by parcel — the lot shape,
  // the deed year and the clause — with every name, address and parcel
  // identifier stripped, and its ingest strips and then asserts. See
  // scripts/ingest/covenants.mjs for the full reasoning and its history.
  | 'racial_covenant'
  // Present-day counterpart to the historical layers: MPCA's cumulative
  // impacts draft under Minn. Stat. § 116.065, one record per census tract.
  // A tract is an aggregate of thousands of people, never a household.
  | 'ej_cumulative'
  // Three views of one Census ACS dataset (scripts/ingest/demographics.mjs),
  // sharing a dataPath — Black population share, Latinx population share, and
  // poverty rate, each toggled independently so a reader compares them the
  // same way the HOLC and covenant layers are compared: two colours on the
  // same map, not a computed overlap. Same tract-is-an-aggregate boundary as
  // ej_cumulative.
  | 'demographic_black_share'
  | 'demographic_latinx_share'
  | 'demographic_poverty_rate'
  // The vendor contract itself — the record every other surveillance layer's
  // hoverCard has, until now, had to say was absent. Not a live feed: a
  // vendor contract only exists when a records request produces one, so this
  // is a small hand-curated set of documented agreements, each one mirrored
  // in full under public/data/docs/, starting with the first: University of
  // Minnesota PD's Flock Safety contract, released via a MuckRock MGDPA
  // request. See scripts/ingest/vendor-contracts.mjs.
  | 'vendor_contract';

export type Locale = 'en' | 'es';

/** A short string translated into every supported locale. */
export type I18nString = Record<Locale, string>;

/**
 * How much to trust a given record's position and existence.
 *
 * `probabilistic` exists chiefly for the ALPR layer, which is crowd-sourced:
 * a camera may have been removed, moved, or mis-tagged since it was mapped.
 * The UI must surface this rather than implying precision we do not have.
 */
export type Confidence = 'confirmed' | 'reported' | 'probabilistic';

/**
 * Whether a documented vendor contract is currently in force.
 *
 * A contract entering `vendor_contract` used to mean only one thing:
 * confirmed, ongoing, no expiry modelled at all. Summer 2026 broke that
 * assumption — Minnesota cities began terminating, suspending, and declining
 * to renew Flock Safety contracts within weeks of each other, so the schema
 * now has to be able to say a documented agreement has ended without
 * deleting the record of it having existed (§0.5: the fact of cancellation
 * is itself part of the curve). `active` is the default for every record
 * that has not had an ending event transcribed onto it.
 *
 * `suspended` is deliberately distinct from `terminated`: a suspension (a
 * manager pausing use pending a council vote, say) is stated by the agency
 * itself to be reversible, where a termination or non-renewal is not framed
 * that way in the source. Collapsing the two would assert a permanence the
 * record does not support.
 *
 * `Reported ended` is deliberately its own value rather than a confidence
 * qualifier bolted onto `Suspended`/`Terminated`/etc.: those four describe
 * what a Tier 1/2 document says happened, and several of August 2026's
 * cancellations have no such document yet, only converging Tier 4 (and one
 * Tier 3 social-media) reporting — see CLAUDE.md §3. Using it says two
 * things a reader needs at once: this is not confirmed the way Columbia
 * Heights’s termination is, and it is not settled either, which is
 * generally true of these — several are announcements pending a council
 * vote, or a manager’s action a council could still reverse. `confidence`
 * on the record is set to `'reported'` alongside it, never `'confirmed'`.
 *
 * Not a closed TS union enforced by an exhaustive switch — ingest scripts
 * are plain `.mjs`, outside the type checker — but closed in spirit: the
 * registry's `status` filter and `categoryColors`/`markerIcon.byValue`
 * entries for `vendor_contract` are the enforcement, and a value transcribed
 * here that isn't named in all three renders as an unglossed fallback.
 */
export type ContractStatus = 'Active' | 'Suspended' | 'Terminated' | 'Not renewed' | 'Expired' | 'Reported ended';

/** How often the upstream source is expected to change. */
export type RefreshCadence = 'frequent' | 'periodic' | 'rare';

/**
 * A source that contributed to a layer without being its spine.
 *
 * Most layers have one upstream file and one citation. Some are assembled: a
 * base dataset plus facts transcribed from several trackers, each of which
 * asserts something the others do not. Crediting only the base would name the
 * wrong publisher for half the fields on screen.
 */
export interface SourceRef {
  /** Short key used in the data files to tag which source asserts a fact. */
  key: string;
  /** Publisher or project name, as they style it. */
  name: string;
  url: string;
  /**
   * The terms as they actually are, not as we would like them to be. Several
   * useful trackers are all-rights-reserved; saying so is part of the citation.
   */
  license: string;
  licenseUrl: string | null;
  /** What this source contributed, so a reader can weigh it. */
  contributes: I18nString;
}

/** Provenance travels with the layer, and is shown anywhere the data is. */
export interface Provenance {
  /** Human-readable dataset name, e.g. "ICE participating agencies". */
  source: string;
  /** Canonical URL of the upstream dataset or its landing page. */
  sourceUrl: string;
  /** Upstream licence, e.g. "ODbL 1.0", "Public domain (US federal)". */
  license: string;
  licenseUrl: string | null;
  /** Attribution string we are obliged to display. */
  attribution: string;
  /** Date the upstream data itself was published/effective (ISO 8601). */
  sourceDate: string | null;
  /**
   * When this layer's data last actually changed (ISO 8601).
   *
   * Not when the ingest last ran. A weekly re-pull that finds the publisher
   * has issued nothing leaves the file untouched, timestamp included — so this
   * answers "how old is what I am looking at", which is the question a reader
   * has, rather than "when did a cron job last succeed", which is ours.
   */
  lastUpdated: string | null;
  refresh: RefreshCadence;
  /**
   * Additional publishers whose facts appear in this layer. Empty for the
   * common single-source case; the sources page renders each one it finds.
   */
  secondarySources?: SourceRef[];
}

/** One record in a layer. Mirrors the GeoJSON `properties` object on disk. */
export interface FeatureProperties {
  id: string;
  layer: LayerId;
  name: string;
  county: string | null;
  /**
   * Two-letter USPS code, or null. Every layer describes something
   * physically fixed in Minnesota, so this is always 'MN'.
   */
  state: string | null;
  /** Census GEOID of the containing county, when known. Enables joins. */
  countyFips: string | null;
  /** Layer-specific fields. Rendered via the layer's `detailFields`. */
  attributes: Record<string, string | number | boolean | null>;
  confidence: Confidence;
  sourceDate: string | null;
}

/** A filter the UI can offer for a layer (spec F3). */
export interface FilterDefinition {
  /** Key inside `attributes`, or a top-level property name. */
  key: string;
  label: I18nString;
  /**
   * `enum` renders as a checkbox group of observed values.
   * `dateRange` renders as a signed-before/after control.
   */
  kind: 'enum' | 'dateRange';
  /**
   * A short meaning shown beside an enum value's checkbox.
   *
   * For filters whose values are codes — a HOLC grade, a status abbreviation —
   * the letter alone makes the reader leave the panel to find out what they
   * are toggling. One line each, and where the code encoded something about
   * people, the line says so plainly rather than leaving the euphemism to
   * stand: that is the cultural record the filter is switching.
   */
  valueDescriptions?: Record<string, I18nString>;
  /**
   * `enum` only: values present in the data but unticked on first load.
   *
   * For records that are real and worth finding but would mislead if drawn by
   * default — a data-center proposal that was withdrawn is exactly the record
   * an organizer wants, and exactly the dot that should not read as a building.
   * The value still appears in the filter, so nothing is hidden, only unticked.
   */
  defaultExcluded?: string[];
}

/**
 * How to render one attribute, wherever it is shown.
 *
 * A closed union so it cannot be extended on one surface only: both the detail
 * panel and the map's hover card read the same `detailFields` entry, and
 * src/lib/detailFields.ts switches over this exhaustively, so adding a member
 * here fails the build until every surface handles it.
 */
export type DetailFieldFormat = 'text' | 'date' | 'link' | 'degrees' | 'currency' | 'pills';

/** How to render one attribute in the detail panel (spec F5). */
export interface DetailField {
  key: string;
  label: I18nString;
  /**
   * `date` formats ISO strings; `link` renders an anchor; `currency` prints a
   * plain USD number ($ sign, thousands separators, no cents — every dollar
   * figure ingested here is already a whole-dollar contract line); `pills`
   * splits a `"; "`-joined source string into a wrapped row of labelled
   * capsules, one per code — see `pillLabels`; `text` is default.
   */
  format?: DetailFieldFormat;
  /**
   * `pills` only: code → human label, the same shape and reasoning as
   * `FilterDefinition.valueDescriptions` — a source field ships codes, a
   * reader needs the plain-language meaning of each one. A code with no entry
   * here still renders, Title Cased with underscores turned to spaces, rather
   * than being silently dropped — an unmapped code is a gap in the label map,
   * not a reason to hide a stressor the source document actually names.
   */
  pillLabels?: Record<string, I18nString>;
}

/**
 * How a layer is summarised on the "near me" page (spec F4).
 *
 * The page reads this instead of knowing layers by id. That mattered: while
 * the summary lived in the component, a layer could be added to the registry,
 * drawn on the map, downloaded on every "near me" load — and still never
 * appear there, because nobody remembered to add a sixth branch. A layer with
 * no `nearMe` is not summarised and, importantly, is not fetched either.
 */
export type NearMeMode =
  /** Count records inside each radius. Point layers only. */
  | 'radius'
  /** The single closest record, and how far away it is. */
  | 'nearest'
  /** The polygon the point falls inside, if any. */
  | 'contains'
  /** Records whose `county` matches the county containing the point. */
  | 'countyMatch';

export interface NearMeSummary {
  mode: NearMeMode;
  /** Card heading. */
  title: I18nString;
  /** Shown when this layer has nothing to report for this point. */
  empty: I18nString;
  /**
   * Radii in miles, ascending. `radius` mode only: the first is the headline
   * figure, the rest are reported on a follow-up line.
   */
  radii?: number[];
  /**
   * Attribute keys to show beneath the record. Labels are reused from
   * `detailFields`, so anything named here must also appear there.
   */
  detail?: string[];
  /** Attribute holding an off-site URL, offered as a link when present. */
  linkKey?: string;
  /**
   * The layer's honest limit in one line. The full `limitations` are on the
   * map and the sources page, but a reader who sees only this card still needs
   * the warning, so it is not optional in spirit even where it is in the type.
   */
  caveat?: I18nString;
  /** Card spans both columns of the results grid. */
  wide?: boolean;
}

/**
 * The shelf a layer sits on in the control panel.
 *
 * Seven layers in one flat list is a list nobody reads to the bottom of, and
 * the reader is left to work out for themselves that a 1930s mortgage grade
 * and a deed clause are both answers to "how did this map get drawn this way".
 * Grouping states that relationship in the panel instead of leaving it
 * implied.
 *
 * A category is a claim about the data, not a folder: it lives on the layer
 * definition beside `order`, so the grouping travels with the registry rather
 * than being re-invented by whichever component happens to render a list.
 *
 * The four are listed here in the order the panel shows them — ground first,
 * then what was built on it, then what records, then who acts — but only as a
 * courtesy to anyone reading the type. Nothing derives the panel order from
 * this union; `LAYER_CATEGORIES` in the registry is what the panel iterates,
 * so reordering these names changes documentation and nothing else.
 */
export type LayerCategoryId =
  | 'historical'
  | 'environment'
  | 'infrastructure'
  | 'surveillance'
  | 'enforcement';

export interface LayerCategory {
  id: LayerCategoryId;
  label: I18nString;
  /** One line under the heading, saying what the section is for. */
  summary: I18nString;
}

export interface LayerDefinition {
  id: LayerId;
  /** URL-safe identifier used in query strings and file names. */
  slug: string;
  /** Which section of the layer panel this belongs under. */
  category: LayerCategoryId;
  /**
   * Draw this layer on first load, without the reader ticking anything.
   *
   * The map used to switch on whatever sat in the `surveillance` category,
   * which read as a rule but was really a coincidence — it broke the moment
   * a layer outside that category needed to be on, and a layer added inside
   * it appeared on the map by default whether or not anyone meant it to. So
   * it is stated per layer instead.
   *
   * A layer earns this by being *context for the others* rather than a
   * finding of its own: which agency answers for this ground, and where it
   * answers from, are the frame a reader needs before any camera on the map
   * means anything. Anything a reader would go looking for deliberately
   * stays off — every default-on layer is bytes downloaded and ground
   * covered for someone who never asked for it.
   */
  defaultOn?: boolean;
  label: I18nString;
  /** One line, plain language — shown in the layer toggle list. */
  summary: I18nString;
  /** A paragraph explaining what the reader is looking at (spec F5). */
  whatThisMeans: I18nString;
  /**
   * One line, shown right under a selected feature's name, saying what kind
   * of ground the shape actually is — a census tract, a HOLC-graded area, a
   * parcel — when the feature's own name (a tract number, a HOLC ID) doesn't
   * say so on its own (CLAUDE.md §0.9, translate the jargon). `whatThisMeans`
   * already covers this in a paragraph read once for the whole layer; this is
   * the same fact restated in one line, next to the specific record it
   * applies to, for a reader who opened a feature without reading the layer
   * description first. Omit for a layer whose name is already self-evident
   * (an agency, a building, a contract).
   */
  geometryNote?: I18nString;
  /** Honest limitations, shown with the layer and on the sources page (F8). */
  limitations: I18nString[];
  /**
   * Concrete, documented stakes, shown inside "What this means" rather than
   * asserted in the explanation paragraph itself.
   *
   * `whatThisMeans` says what the reader is looking at; this says why it is
   * not academic — each entry is anchored to a case, a study, or an audit,
   * never a bare claim. Colour is a way to tell entries apart at a glance, not
   * a finding of its own. Omit it and the layer carries no such section,
   * which is right for most of them: a 1930s mortgage grade needs no case law
   * to explain why it still matters.
   */
  impactSpheres?: Array<{
    /**
     * Name of a lucide icon export, e.g. "Route", "Fingerprint" — never an
     * emoji. Resolved to an actual icon by the panel; see the ICONS map in
     * MapView.astro's client script.
     */
    icon: string;
    title: I18nString;
    /** Hex colour distinguishing this card from the others. */
    color: string;
    body: I18nString;
    /** Case name, study citation, or audit — not localised: a proper noun. */
    citation: string;
    citationUrl: string;
    /** A second citation, where one claim rests on two sources. */
    citation2?: string;
    citation2Url?: string;
  }>;
  geometry: 'point' | 'polygon' | 'line';
  /** Hex colour used for the map symbol and the legend swatch. */
  color: string;
  /**
   * `color`'s counterpart for a light site theme / light basemap, where one
   * is needed. Optional because not every colour needs it: `color` itself
   * already clears WCAG 3:1 against white for some layers, and duplicating
   * an identical value here would just be another place for the two to
   * drift apart. Omit it and callers fall back to `color` for both themes.
   * Where it's set, it's the same hue at a Tailwind ~600/700-ish step
   * darker — same identity, legible on white instead of only on `#0a0c10`.
   */
  colorLight?: string;
  /**
   * Override the ring drawn around each point, in both themes.
   *
   * Left unset, a point's ring is drawn in the basemap's own background
   * colour (see MapController's `basemapColor`) so it reads as a casing the
   * dot sits on rather than a colour of its own — the default for every
   * point layer. Set this when a layer wants a ring that doesn't change
   * with the basemap; ALPR uses a fixed white so each dot stays legible
   * against both the light and dark basemap without becoming a near-invisible
   * black ring on the dark one.
   */
  pointStrokeColor?: string;
  /**
   * Attribute holding a compass bearing in degrees, if the layer has one.
   *
   * Set it and the map draws a small arrow at each record showing which way
   * the thing faces, once the view is close enough to draw records
   * individually. Left undefined, records render as plain dots. This is a
   * property of the data, not of one layer's rendering: any layer that records
   * which way its subject points gets the same treatment by naming the field.
   */
  bearingKey?: string;
  /**
   * Colour records by a category once they are drawn individually.
   *
   * Only at the closest scale, and deliberately: while the records are still
   * fading in, a per-record colour is a distinction the reader cannot yet
   * resolve, and most of it would be the "nobody wrote it down"
   * grey. Close in, it is the difference between "a camera" and "a camera
   * someone's homeowners association put there".
   *
   * The order here is the order of the key beside the map, so put the kinds a
   * reader is looking for above the ones they are not. A value with no colour
   * falls back, and the key says so rather than leaving it unexplained.
   */
  categoryColors?: {
    /** Attribute holding the category. */
    key: string;
    label: I18nString;
    /** Hex colour per observed value, in the order the key should list them. */
    colors: Array<{ value: string; color: string }>;
    /** Colour for any value not named above. */
    fallback: string;
    /**
     * Draw the glanceable colour bar over the map for this layer.
     *
     * Defaults to true. The bar is `aria-hidden` decoration — the accessible
     * record is this same table rendered as a filter fieldset in the layer
     * panel (MapView.astro's `filters`, keyed to this `key`) — so setting
     * this false loses no information, only the on-map duplicate. Set it
     * false where the bar can't earn its space: a category count too high
     * for the bar to label more than its two ends, or a classification
     * whose own `limitations` entry says it's a rough guess rather than a
     * verified value.
     */
    showOnMapKey?: boolean;
  };
  /**
   * Write an attribute's value on each polygon, the way the source document
   * did.
   *
   * For layers whose areas carry their own printed identifiers — a HOLC sheet
   * labels its zones "A1", "D4" — drawing the identifier on the ground is
   * part of reading the map as the document it reproduces. The text takes the
   * feature's category colour where the layer declares one, so the label and
   * the fill agree about what the area is. Features whose attribute is null
   * simply go unlabelled; MapLibre hides colliding labels at distant zooms
   * rather than stacking them.
   */
  labelBy?: {
    /** Attribute holding the text to draw. */
    key: string;
    /**
     * Zoom below which labels are not placed at all. Omit to label at every
     * zoom the layer draws at, which is right where records are few.
     *
     * This exists because collision placement is not free: MapLibre shapes
     * glyphs for every candidate in view before deciding which fit, so a layer
     * labelling one identifier per *block* rather than per area offers
     * thousands of candidates across a metro to draw a few dozen. That work is
     * discarded every frame, on a project that targets old phones (§0.7).
     * Setting this to the zoom where a label first becomes readable costs
     * nothing visible — below it the labels were being suppressed anyway.
     */
    minzoom?: number;
  };
  /**
   * How a click on this polygon layer behaves.
   *
   * Every polygon layer's click flies the camera to the record and opens its
   * detail (see MapController.focusFeature) — the right feel for "here is a
   * finding" surfaced from a search or a filter, and `'highlight'` keeps that.
   * What it changes is the ground the reader sees it against: polygons render
   * in one neutral, uncoloured fill by default rather than a category colour,
   * hovering previews one in the layer's own colour, and a tap commits that —
   * fill, thicker outline, and the fit — until a second tap on the same
   * polygon, or a tap on empty ground, releases it. Ward-map browsing: the
   * one polygon under the pointer or selected is the only one that ever reads
   * as data.
   *
   * Omit for a plain polygon layer, which just draws every record in its
   * category or source colour with no hover/selection state of its own. Only
   * `geometry: 'polygon'` layers read this field.
   */
  polygonClick?: 'highlight';
  /**
   * How loudly a selected polygon reads. `full` (the default) is a plain
   * highlight layer, where the polygon *is* the finding. `subtle` is for a
   * polygon that is context for something else — the jurisdiction settles back
   * so the building and the thrown paths it answers with are what the eye goes
   * to. Only `polygonClick: 'highlight'` layers read this.
   */
  selectedEmphasis?: 'full' | 'subtle';
  /**
   * Draw this point layer's records as a glyph rather than a plain dot.
   *
   * For a layer whose records are a *kind of place* rather than a
   * measurement — a station house, not a reading — a dot says only "something
   * is here" and leaves the reader to consult the legend for what. A glyph
   * says it on the ground.
   *
   * Names a lucide icon export, resolved through MARKER_ICONS in
   * src/lib/icons.ts — never an emoji, and never a bitmap shipped as an asset,
   * for the same reasons impactSpheres' own `icon` field gives. `byValue`
   * varies the glyph by an attribute where the distinction is real and
   * documented (a sheriff's star and a police shield are the two offices'
   * own insignia, not a decorative flourish); `icon` is the fallback for
   * every record whose value isn't listed.
   *
   * Note the one qualification this puts on the two-file rule (CLAUDE.md
   * Part 1 §2): the allow-list is closed on purpose, so every glyph in it
   * ships to every visitor (§0.7). Naming a glyph it does not already carry
   * means editing src/lib/icons.ts as well — a third file, and a deliberate
   * one. Naming a glyph that is not there draws the fallback rather than
   * pulling an arbitrary module into the bundle.
   *
   * Point layers only. Omit and records draw as the standard dot.
   */
  markerIcon?: {
    icon: string;
    byValue?: {
      key: string;
      icons: Record<string, string>;
      /**
       * Override the glyph's ring and stroke colour per value — every value
       * absent here draws in the layer's own `color`/`colorLight`, same as
       * before this existed. For most `byValue` layers (a sheriff's star vs.
       * a police shield) the shape alone is the real distinction and colour
       * would be decoration, so this stays unset. `vendor_contract` is the
       * exception: a contract's status is a fact worth reading in the same
       * colour language as the jurisdiction wash it drives (see
       * tintWhenRelated's `color`/`secondaryWhen` fields), so its glyph and
       * that wash share a palette rather than the glyph carrying an
       * unrelated colour of its own.
       */
      colors?: Record<string, { color: string; colorLight: string }>;
    };
  };
  /**
   * A card shown on hover, summarising a record without selecting it.
   *
   * Strictly a shortcut to what the detail panel already says — a reader
   * skimming a street of stations should not have to click each one to learn
   * which of them reported surveillance equipment. It is `aria-hidden` for
   * that reason: the DOM record list beside the map is the accessible
   * interface (spec §4), and a hover-only surface that screen readers
   * announced would be a second, worse copy of it rather than an addition.
   *
   * `related` is the point of the thing: it counts records of another layer
   * that join to this one, so the card can answer "and what did this agency
   * report?" from the same document the other layer is built from. It never
   * infers the link — see relatedBuildings.pathsTo's comment for why that
   * distinction matters here specifically.
   */
  hoverCard?: {
    /** Attribute keys to list. Labels are reused from `detailFields`. */
    fields: string[];
    related?: {
      layerId: LayerId;
      /** Attribute on THIS layer holding the joining value. */
      fromKey: string;
      /** Attribute on the other layer holding the same value. */
      joinKey: string;
      /** Attribute on the other layer to list. */
      labelKey: string;
      /** Attribute on the other layer holding a citation URL, if it has one. */
      linkKey?: string;
      /**
       * The citation link's text. Declared per entry rather than fixed in the
       * controller because it is a claim about what the other layer's document
       * *is* — a § 13.824 filing here, but a contract, a roll call or a permit
       * for the next relation — and because a string baked into the map code
       * never reaches the Spanish locale.
       */
      linkLabel: I18nString;
      /** Overflow line for records past `max`. `{n}` is replaced with the count. */
      moreLabel: I18nString;
      title: I18nString;
      /**
       * Shown when nothing joins. Says what an absence does and does not
       * mean, because on this subject a blank card is itself a claim.
       */
      empty: I18nString;
      /** Cap the list; the rest are summarised as a count. */
      max?: number;
    };
    /**
     * A closing line, for a fact about the record that is an absence rather
     * than a value — the sort of thing a field list cannot express.
     */
    note?: I18nString;
  };
  /**
   * Selecting a `polygonClick: 'highlight'` polygon also highlights the
   * matching records of a point layer — the building(s) this jurisdiction
   * answers from, not the ground it covers — and, optionally, draws paths to
   * a third layer's records that join back to the selected polygon.
   *
   * Those paths are never an assertion that the building operates the
   * device — see `pathsTo.joinKey`'s own comment for why, and
   * scripts/ingest/agency-buildings.mjs / agencies-lpr-bca.mjs for where the
   * two facts they actually rest on come from. The join is what makes a path
   * publishable at all: a line is only worth asking a reader to look at once
   * a cited document connects the two ends, never because one happens to
   * fall inside the other.
   */
  relatedBuildings?: {
    /** The point layer to search and highlight. */
    layerId: LayerId;
    /**
     * Attribute on THIS layer holding the joining value. Omit and the
     * record's own `id` is used, which is the common case.
     *
     * Present for the same reason hoverCard.related has it: alpr_reported
     * joins on `agencyName` rather than `jurisdictionId`, because the id only
     * exists for the 10-county metro while that layer is statewide. A relation
     * that needs a different near-side key must be able to say so here rather
     * than in mapController.
     */
    fromKey?: string;
    /** Attribute on that point layer holding the same value. */
    joinKey: string;
    /**
     * Attribute on that point layer marking a record as *subordinate*, used to
     * pick which of the matched records the paths throw from: the first record
     * that does NOT carry it wins, falling back to the first match.
     *
     * Every matched record lights up either way; only the line origin is at
     * stake. Declared here rather than decided in mapController because it is
     * this relation's vocabulary — `subStation` distinguishes a precinct from
     * its headquarters, and the next relation to want a hub (a county board and
     * its facilities, a district and its contract sites) will name something
     * else entirely. Omit it and the paths throw from the first match.
     */
    hubKey?: string;
    pathsTo?: {
      /** The point layer whose matching records get a path drawn to them. */
      layerId: LayerId;
      /** Attribute on THIS layer holding the joining value; defaults to `id`. */
      fromKey?: string;
      /**
       * Attribute on THAT point layer holding the joining value.
       *
       * A join, deliberately, and not a spatial test. An earlier version of
       * this drew a path to every camera that merely fell *inside* the
       * selected boundary, which is a claim the data cannot support: a
       * reader within a city's limits may belong to an HOA, a business, the
       * state, or a neighbouring task force, and our crowd-sourced camera
       * layer records an operator for almost none of them. A drawn line
       * between two things says they are connected, so it may only be drawn
       * where a document connects them — here, a filing in which the agency
       * itself told the state it operates a reader at that location.
       */
      joinKey: string;
    };
  };
  /**
   * Tint a `polygonClick: 'highlight'` polygon's unselected fill while at
   * least one record in another layer joins to it — for a jurisdiction, "a
   * records request has produced something here" made visible without a
   * click.
   *
   * A coverage cue, not a score (§1c): the tint says a document exists, and
   * its absence says only that no request has produced one *yet*, never
   * that an agency has nothing to find — the same distinction every
   * `related.empty` string on this map already has to hold, just read off a
   * fill colour instead of a hover card. It is computed at render time from
   * data both layers already load (the same "no record of its own" rule
   * `blockAggregate` documents) and never becomes a field of its own: not in
   * `detailFields`, not in a download, not part of the accessible record
   * list — a visual-only cue layered on top of a relation that is
   * independently inspectable through the layer it points at.
   */
  tintWhenRelated?: {
    /** The layer whose presence lights this polygon up. */
    layerId: LayerId;
    /** Attribute on THIS layer holding the joining value; defaults to `id`. */
    fromKey?: string;
    /** Attribute on that layer holding the same value. */
    joinKey: string;
    /**
     * A joined record whose named attribute holds one of these values does
     * not count toward "at least one match" — the tint's whole claim (§1c:
     * "a records request has produced something here") stops being true the
     * day that something is transcribed as ended, and a jurisdiction whose
     * only contract was terminated in June has no more business glowing
     * green in August than one with no contract on record at all. The
     * ended record itself stays fully on the map — this only governs the
     * jurisdiction wash, never whether the joined layer draws or is
     * clickable. Omit for a join with no notion of an ended state, which is
     * every joined layer except `vendor_contract` today.
     */
    excludeWhen?: { key: string; values: string[] };
    /** Fill/outline colour applied while at least one match exists (dark basemap). */
    color: string;
    /**
     * `color`'s counterpart for a light basemap — the same pairing every
     * layer's own `color`/`colorLight` already makes, and required rather
     * than optional here: this colour has to clear WCAG non-text contrast
     * (~3:1) against both the light basemap *and* the neutral grey every
     * other unselected polygon already draws in, and one hex rarely clears
     * both a near-black and a near-white background at once. Omitting it
     * would silently reuse `color`, which is exactly the failure mode that
     * made this field required in the first place.
     */
    colorLight: string;
    /**
     * A second, weaker wash for a jurisdiction whose only joined match is
     * unconfirmed rather than absent — a contract several news outlets
     * report as ended but that no Tier 1/2 document has yet settled (see
     * `ContractStatus`'s `'Reported ended'` value). Only applied when no
     * match clears `color`'s bar (a jurisdiction with one active and one
     * reported-ended contract reads as fully documented, not contested) and
     * no match clears `cancelledWhen`'s bar either — the three tiers rank
     * confirmed-active above confirmed-cancelled above merely-reported, so a
     * jurisdiction with both a confirmed cancellation and an unrelated
     * reported one shows the confirmed fact. `secondaryWhen`'s own values
     * are not also excluded above — the fields are independent tests, not a
     * fallback chain, so declaring a value here without also naming it in
     * `excludeWhen` would let a merely-reported record count as a confirmed
     * one. Omit for a join with nothing worth flagging as contested rather
     * than simply present or absent.
     */
    secondaryWhen?: { key: string; values: string[]; color: string; colorLight: string };
    /**
     * A third wash, ranked above `secondaryWhen` and below `color`, for a
     * jurisdiction whose only joined match is a *confirmed* ending rather
     * than merely absent or merely reported — `ContractStatus`'s
     * `'Suspended'`/`'Terminated'`/`'Not renewed'`/`'Expired'` values. Unlike
     * those statuses' effect on the point itself (see the `vendor_contract`
     * registry entry's `markerIcon.byValue.colors` — the pin turns the same
     * red), this is a genuine exception to `color`'s own "a document exists"
     * claim: the jurisdiction is being told apart from one with *no* record
     * at all, on purpose, because a reader scanning for what changed
     * shouldn't have to click through to learn a contract there was
     * cancelled. Same independent-test relationship to `excludeWhen` as
     * `secondaryWhen`. Omit for a join with nothing worth flagging as
     * cancelled rather than simply present or absent.
     */
    cancelledWhen?: { key: string; values: string[]; color: string; colorLight: string };
  };
  /**
   * The zooms across which this layer's records emerge.
   *
   * A point layer answers a different question at every scale. Across a
   * country or state the question is where the infrastructure is at all;
   * across a street it is which pole, facing which way — and only there is a
   * pin the right shape for the answer. Records fade up between these zooms
   * rather than switching on at a single cut, so what a reader is looking at
   * at zoom 12 is what they were looking at at zoom 9, with more of it
   * resolved.
   *
   * All the numbers live here rather than beside the thing each one governs,
   * because they are points on the same fade and have to agree.
   */
  scale?: {
    /**
     * Zoom at which a faint, uniform, uncoloured speck starts to appear —
     * visible from the whole state or country. Optional, and rare: most
     * point layers are dense enough, or few enough, to stay solid
     * throughout (see mapController.ts's scaleOf), and only need
     * `emergeFrom`/`pointsFrom` below. Set this when a reader should be able
     * to see records exist before they're anywhere near close enough to read
     * one.
     */
    speckleFrom?: number;
    /** Zoom at which records start to take on their own identity — cones, individual colour. */
    emergeFrom: number;
    /** Zoom by which records are solid, coloured by category, and annotated. */
    pointsFrom: number;
  };
  /**
   * Coarsen a polygon layer into fixed grid cells at distance, resolving into
   * its true parcels up close — the polygon equivalent of `scale` above.
   *
   * A parcel is drawn at survey precision because that is what the record is,
   * but tens of thousands of them across a state read as noise, not shape,
   * until the view is close enough to resolve one lot from the next. Between
   * the two zooms named here a plain grid cell — coloured and counted from
   * the parcels inside it, nothing more — stands in for the detail the view
   * cannot yet show, and fades as the real parcels fade in under it. It is
   * computed in the browser from the same records already on the map, and is
   * not a record of its own for that reason: not clickable, not
   * searchable, not in the accessible list. The parcels themselves are never
   * removed by zoom, only faded, so that list stays exactly what it always
   * was regardless of how close the view is.
   */
  blockAggregate?: {
    /** Grid cell size, in metres, used to bucket parcel centroids into blocks. */
    cellMeters: number;
    /** Zoom at/below which the grid is fully opaque and parcels are hidden. */
    blocksUntil: number;
    /** Zoom at/above which parcels are fully opaque and the grid is gone. */
    detailFrom: number;
  };
  /**
   * How strongly a line layer is painted, 0–1. Omit for the standard weight.
   *
   * A layer that is context rather than subject has to be legible without
   * competing, and one that covers the whole state has a particular problem:
   * 40,000 road segments at full strength stop being roads and become a
   * coloured field, which is worst at the zoom where the most of them overlap.
   * So this is applied on a ramp — quietest across the state, where density
   * does the shouting on its own, and up to the declared value close in, where
   * a segment is a single line and has to be followable.
   *
   * Setting it does not change what the layer claims. It changes whether the
   * layers drawn on top of it can still be read, which for a substrate layer is
   * most of the job.
   */
  opacity?: number;
  /**
   * Draw a line layer's width from a magnitude in its own data.
   *
   * Some line layers carry a quantity that *is* the finding. A road network
   * drawn at one weight says every road is alike, which for traffic volume is
   * the one thing the data most clearly refutes: the busiest segment in
   * Minnesota carries around two hundred thousand vehicles a day and the
   * quietest carries a few dozen, and a map that draws those the same has
   * thrown the layer away.
   *
   * The curve is declared here rather than computed in the controller because
   * it is an editorial choice about a specific dataset, not a rendering
   * detail. Traffic volume is heavily skewed — most segments are small, a few
   * are enormous — so a linear ramp would leave almost everything at hairline
   * width. The stops below bend that curve, and bending it is exactly the kind
   * of decision that belongs next to the data it describes, where a reader
   * looking at the registry can see what was done.
   *
   * Omit it and a line layer draws at a constant width, which is right for any
   * layer whose lines are not carrying a magnitude.
   */
  weightBy?: {
    /** Attribute holding the magnitude. Missing or null reads as zero. */
    key: string;
    /** Accessible name for the encoding, e.g. "Vehicles per day". */
    label: I18nString;
    /**
     * `[value, width multiplier]`, ascending by value. Values between stops
     * interpolate; values past the last stop clamp to it, so one freakishly
     * busy segment cannot blow the scale out for everything else.
     */
    stops: Array<[number, number]>;
  };
  /**
   * The request a reader can file about one of these records.
   *
   * A record on this map is the end of somebody else's paperwork, and until
   * now the panel showing it was a dead end: it told a reader what was there,
   * how confident we were, and where it came from, and then stopped. The one
   * question it did not answer is the only one that leads anywhere — *so what
   * do I do about it*. This field closes that, and lives on the layer rather
   * than in the panel so a new layer arrives carrying its own next step
   * instead of needing a branch added to a component.
   *
   * Omit it and the record simply has no obvious request behind it, which is
   * honest for the historical layers: nobody files a data practices request
   * about a 1935 redlining grade.
   */
  action?: {
    /** Key of a template in the Take Action generator. */
    requestType: string;
    /** Button text, e.g. "Ask who runs this camera". */
    label: I18nString;
    /**
     * Attribute naming the body to address — the camera's operator, say.
     * Frequently null in the data, which is why `fallbackBody` exists.
     */
    bodyKey?: string;
    /**
     * Who to address when `bodyKey` is missing or empty.
     *
     * - `countySheriff` builds "<County> Sheriff's Office". Outside a city
     *   with its own force that is the law enforcement agency for the ground,
     *   so it is the right default for surveillance equipment.
     * - `county` is the county government itself, for records a sheriff never
     *   holds — permits, abatements, and anything else that lives with
     *   planning, zoning or finance.
     * - `name` uses the record's own name, right for a layer whose records
     *   *are* the body: a 287(g) agency, an ICE-contract jail.
     */
    fallbackBody?: 'countySheriff' | 'county' | 'name';
  };
  /** Path under /public — also the download URL (spec F9). */
  dataPath: string;
  csvPath: string | null;
  provenance: Provenance;
  filters: FilterDefinition[];
  detailFields: DetailField[];
  /**
   * How the "near me" page summarises this layer. Omit and the layer is
   * neither summarised there nor downloaded by that page.
   */
  nearMe?: NearMeSummary;
}

/** Shape of every file in /public/data. */
export interface LayerCollection {
  type: 'FeatureCollection';
  /** Non-standard but harmless: provenance travels with the download. */
  metadata: Provenance & {
    layer: LayerId;
    featureCount: number;
    schema: string;
    knownGaps: string[];
  };
  features: Array<{
    type: 'Feature';
    geometry:
      | { type: 'Point'; coordinates: [number, number] }
      | { type: 'LineString'; coordinates: number[][] }
      // Some line layers' source geometry is naturally disjoint — multiple
      // separate stretches of road under one record — rather than one
      // continuous line.
      | { type: 'MultiLineString'; coordinates: number[][][] }
      | { type: 'Polygon'; coordinates: number[][][] }
      | { type: 'MultiPolygon'; coordinates: number[][][][] };
    properties: FeatureProperties;
  }>;
}

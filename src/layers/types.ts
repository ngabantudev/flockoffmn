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
  // Derived from `alpr`, not ingested: the stretches of road where readers
  // stand in a line rather than a cluster. A dot map answers "is there a camera
  // here"; this answers "how many times does one ordinary trip get logged".
  | 'alpr_corridor'
  | 'agency_287g'
  | 'detention_facility'
  | 'data_center'
  | 'redlining'
  // The only layer whose upstream source is a transaction between named
  // private individuals. It is published as a clearly-labelled aggregate —
  // counts per grid cell, never a record per property — and its ingest strips
  // and then asserts. See scripts/ingest/covenants.mjs for the full reasoning.
  | 'racial_covenant';

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

/** How often the upstream source is expected to change. */
export type RefreshCadence = 'frequent' | 'periodic' | 'rare';

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
  /** When our ingest last ran (ISO 8601). */
  lastUpdated: string | null;
  refresh: RefreshCadence;
}

/** One record in a layer. Mirrors the GeoJSON `properties` object on disk. */
export interface FeatureProperties {
  id: string;
  layer: LayerId;
  name: string;
  county: string | null;
  /** Two-letter USPS code. */
  state: string;
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
}

/** How to render one attribute in the detail panel (spec F5). */
export interface DetailField {
  key: string;
  label: I18nString;
  /** `date` formats ISO strings; `link` renders an anchor; `text` is default. */
  format?: 'text' | 'date' | 'link' | 'degrees';
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
 * the reader is left to work out for themselves that the cameras and the
 * corridors are the same subject seen twice, or that a 1930s mortgage grade
 * and a deed clause are both answers to "how did this map get drawn this way".
 * Grouping states that relationship in the panel instead of leaving it
 * implied.
 *
 * A category is a claim about the data, not a folder: it lives on the layer
 * definition beside `order`, so the grouping travels with the registry rather
 * than being re-invented by whichever component happens to render a list.
 */
export type LayerCategoryId = 'surveillance' | 'enforcement' | 'infrastructure' | 'historical';

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
  label: I18nString;
  /** One line, plain language — shown in the layer toggle list. */
  summary: I18nString;
  /** A paragraph explaining what the reader is looking at (spec F5). */
  whatThisMeans: I18nString;
  /** Honest limitations, shown with the layer and on the sources page (F8). */
  limitations: I18nString[];
  geometry: 'point' | 'polygon' | 'line';
  /** Hex colour used for the map symbol and the legend swatch. */
  color: string;
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
   * Where a record's parts sit along its own length, if it has a length.
   *
   * A corridor is eleven miles of road with nineteen readers on it, and the
   * fact that matters is not the total but the spacing — bunched at one
   * junction is a different claim from one every mile and a half the whole way.
   * A record that carries those offsets names them here and the detail panel
   * draws them to scale, with the same text in the record's own summary line so
   * the drawing is never the only way to get the information.
   *
   * Like `bearingKey`, this describes the data rather than one layer's
   * rendering: any layer whose records have things positioned along them gets
   * the same treatment by naming the fields.
   */
  positions?: {
    /** Attribute holding offsets in miles from the record's start, ';'-separated. */
    offsetsKey: string;
    /** Attribute holding how many things sit at each offset, ';'-separated, same length. */
    countsKey: string;
    /** Accessible name for the drawing, e.g. "Readers along this corridor". */
    label: I18nString;
  };
  /**
   * Draw this layer's points as a density surface underneath the records.
   *
   * Cameras do not spread evenly. They thicken around a few metro corridors and
   * thin to nothing across most of the state, and a field of identical dots
   * flattens that — a hundred dots in Hennepin County and a hundred spread over
   * the Iron Range look alike until you count them. The surface shows the shape
   * of the concentration at a glance, and it keeps showing it: the surface is
   * drawn at every zoom and dims as the records rise out of it, rather than
   * being switched off and replaced by another way of drawing the same data.
   *
   * Where two or more of the layer's points stand together — an intersection, a
   * frontage road — the surface is drawn heavier over them, scaled by how many
   * cameras are in the group. That is a node, and it is still the surface: no
   * bubble, no count, nothing extra to click. See `src/lib/nodes.ts`.
   *
   * It is an estimate, and the layer's `limitations` must say so: a density
   * surface smooths over a radius, so it paints colour on ground that has no
   * camera on it. It shows where mapped cameras gather. It is not a map of
   * what any camera can see. Because it now runs under the dots as well, the
   * limitations have to say that too — the reader is looking at an estimate and
   * a mapped position in the same pixel, and only the text says which is which.
   */
  density?: {
    /** Attribute weighting each point, where some points count for more. */
    weightKey?: string;
    label: I18nString;
  };
  /**
   * Colour records by a category once they are drawn individually.
   *
   * Only at the closest scale, and deliberately: while the records are still
   * emerging from the surface, a per-record colour is a distinction the reader
   * cannot yet resolve, and most of it would be the "nobody wrote it down"
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
  };
  /**
   * The two zooms across which this layer's records emerge from its surface.
   *
   * A point layer answers a different question at every scale. Across a state
   * the question is where the infrastructure is concentrated, and a thousand
   * overlapping pins answer it worse than a surface does. Across a street it is
   * which pole, facing which way — and only there is a pin the right shape for
   * the answer.
   *
   * There used to be a third state between them, a count in a bubble, and two
   * hard cuts to get through it: the map stopped being one thing and became
   * another, twice, on the way in. It is one drawing now. The surface is
   * continuous, the gatherings in it are nodes, and between these two zooms the
   * dots fade up from nothing to solid on top of it — so what a reader is
   * looking at at zoom 12 is what they were looking at at zoom 9, with more of
   * it resolved.
   *
   * Both numbers live here rather than beside the thing each one governs,
   * because they are ends of the same fade and have to agree.
   */
  scale?: {
    /** Zoom at which records start to appear, still faint over the surface. */
    emergeFrom: number;
    /** Zoom by which records are solid, coloured by category, and annotated. */
    pointsFrom: number;
  };
  /**
   * Draw a line layer as a living filament: a blurred glow beneath a bright
   * core, with the dash pattern creeping along its length.
   *
   * Not decoration for its own sake. A corridor is not a route anyone drew — it
   * is what independent purchases add up to, and it accumulates the way a root
   * system does, opportunistically and with no plan behind it. A flat drawn
   * line implies an author. A filament does not, which is the more truthful
   * picture of how this infrastructure actually arrived.
   *
   * The creep stops dead under `prefers-reduced-motion`; the glow and core
   * carry the look without it.
   */
  filament?: boolean;
  /**
   * Send a pulse of light travelling along a line layer.
   *
   * This replaces a slider that grew each link out of its two ends as the
   * reader dragged it. The slider's motion was doing two jobs: it made the
   * network legible, and it let the reader pick the radius. The second was
   * never really a question the reader wanted — the ingest can name one honest
   * distance and stand behind it — and paying for it cost a re-upload of the
   * entire layer on every frame of a drag. The pulse keeps the movement and
   * drops the cost: the geometry never changes, and a frame is a handful of
   * paint updates that never touch the data.
   *
   * The animation is decoration in the strict sense — remove it and no fact
   * leaves the map. That is the test it has to pass, because motion that
   * carries information is motion that is lost under `prefers-reduced-motion`,
   * where this stops dead.
   */
  pulse?: {
    /**
     * Attribute holding which band of the animation a record belongs to, as an
     * integer from zero to `bands - 1`. The ingest assigns it; the map draws
     * one style layer per band and offsets each band's phase, which is the only
     * way a per-record phase can be had from a paint property that is one ramp
     * for the whole layer.
     */
    phaseKey: string;
    /** How many bands the ingest cut the records into. */
    bands: number;
    /** How long one pulse takes to run the length of a record. */
    periodMs: number;
    /**
     * Attribute holding how many records the feature's connected network joins,
     * which is what the line is coloured by.
     */
    networkKey: string;
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
  /** Roadmap position (spec §12), used to order the layer list. */
  order: number;
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
      // Corridors are drawn from real OSM road geometry clipped to the run of
      // readers, so a single corridor is many disjoint pieces of surveyed road
      // rather than one continuous line. The gaps are roads we hold no geometry
      // for, and joining them would assert a road we cannot show.
      | { type: 'MultiLineString'; coordinates: number[][][] }
      | { type: 'Polygon'; coordinates: number[][][] }
      | { type: 'MultiPolygon'; coordinates: number[][][][] };
    properties: FeatureProperties;
  }>;
}

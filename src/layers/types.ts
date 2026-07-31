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

export interface LayerDefinition {
  id: LayerId;
  /** URL-safe identifier used in query strings and file names. */
  slug: string;
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
  /** Whether dense point data should cluster at low zoom (spec F1, §8). */
  cluster: boolean;
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
   * of the concentration at a glance and then gets out of the way, fading off
   * as the view closes in and individual records become readable.
   *
   * It is an estimate, and the layer's `limitations` must say so: a density
   * surface smooths over a radius, so it paints colour on ground that has no
   * camera on it. It shows where mapped cameras cluster. It is not a map of
   * what any camera can see.
   */
  density?: {
    /** Attribute weighting each point, where some points count for more. */
    weightKey?: string;
    /** Zoom at which the surface has fully faded and records take over. */
    fadeOutZoom: number;
    label: I18nString;
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
   * Let the reader choose the radius at which this layer's records are linked.
   *
   * Some questions do not have one answer, and "which cameras form a corridor"
   * is one of them. At a quarter-mile the state holds dozens of short dense
   * runs; at two miles more than half of every mapped camera in Minnesota is
   * one connected network. Both are true, and picking a single number for the
   * reader would publish an editorial judgement as though it were a finding.
   * The control hands the judgement back.
   *
   * Requires `positions`, whose offsets and counts it reuses. The file must
   * ship the widest radius the control offers, because the browser can only
   * ever narrow what the ingest surveyed — see `lib/linkRuns.ts`.
   */
  linkRadius?: {
    /** Attribute holding each site's longitude, ';'-separated. */
    lngsKey: string;
    /** Attribute holding each site's latitude, ';'-separated. */
    latsKey: string;
    /** Attribute holding each drawn piece's `start,end` offset. */
    pieceSpansKey: string;
    minMiles: number;
    /** Must equal the linking distance the ingest shipped. */
    maxMiles: number;
    stepMiles: number;
    defaultMiles: number;
    /** A run needs this many sites, and this much span, to be drawn at all. */
    minSites: number;
    minSpanMiles: number;
    label: I18nString;
    /** One line under the control saying what moving it does. */
    help: I18nString;
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

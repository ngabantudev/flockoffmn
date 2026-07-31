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
  geometry: 'point' | 'polygon';
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
  /** Path under /public — also the download URL (spec F9). */
  dataPath: string;
  csvPath: string | null;
  provenance: Provenance;
  filters: FilterDefinition[];
  detailFields: DetailField[];
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
      | { type: 'Polygon'; coordinates: number[][][] }
      | { type: 'MultiPolygon'; coordinates: number[][][][] };
    properties: FeatureProperties;
  }>;
}

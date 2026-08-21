import maplibregl, { type Map as MLMap, type GeoJSONSource } from 'maplibre-gl';
import { Protocol as PMTilesProtocol } from 'pmtiles';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import {
  baseStyle,
  basemapBackgroundColor,
  ALL_BASEMAP_LAYER_IDS,
  BASEMAP_SOURCE_IDS,
  METRO_BOUNDS,
  METRO_CENTER,
} from './mapStyle';
import { bboxOf, representativePoint, haversineMeters } from './geo.mjs';
import { createElement } from 'lucide';
import { MARKER_ICONS } from './icons';
import { formatValue } from './detailFields';
import type { DetailFieldFormat } from '../layers/types';
import { groupBlocks } from './blocks';
import { MAP_STYLES, initialMapStyle, onMapStyleChange, type MapStyleId } from './theme';
import { ThemeControl } from './themeControl';
import { ResetViewControl } from './resetViewControl';
import { NearMeControl } from './nearMeControl';
import { NearMeRadiusControl } from './nearMeRadiusControl';
import type { FeatureProperties, LayerId } from '~/layers/types';

/** The subset of a LayerDefinition the browser needs, serialised by Astro. */
export interface ClientLayer {
  id: LayerId;
  /** See LayerDefinition's own comment in layers/types.ts. */
  defaultOn?: boolean;
  label: string;
  summary: string;
  whatThisMeans: string;
  /** See LayerDefinition's own comment in layers/types.ts. */
  geometryNote?: string;
  limitations: string[];
  /** Concrete, cited stakes shown inside "What this means", if the layer names any. */
  impactSpheres?: {
    icon: string;
    title: string;
    color: string;
    body: string;
    citation: string;
    citationUrl: string;
    citation2?: string;
    citation2Url?: string;
  }[];
  color: string;
  /** See LayerDefinition's own comment in layers/types.ts. */
  colorLight?: string;
  /** See LayerDefinition's own comment in layers/types.ts. */
  pointStrokeColor?: string;
  geometry: 'point' | 'polygon' | 'line';
  /**
   * Where this layer's category sits in the draw order, low to high.
   *
   * Taken from the position of the category in `LAYER_CATEGORIES` rather than
   * restated here, so the map stacks in the order the panel lists — and one
   * list stays the source of both.
   */
  stackRank: number;
  /** Attribute holding a compass bearing, if the layer records one. */
  bearingKey?: string;
  /**
   * The radius, in miles, this layer's `nearMe.list` config already searches
   * on /near-me — reused here rather than restated, so the homepage map's
   * own "what's near me" control (NearMeControl) searches the same layers at
   * the same distance the near-me page promises, instead of a second literal
   * silently drifting from the first the way registry.ts's own gapRadius
   * comment describes already happened once for this exact pair of numbers.
   * Present only for layers with a `nearMe.list` block — see MapView.astro's
   * `clientLayers` mapping.
   */
  nearMeRadiusMi?: number;
  /** The zooms across which this layer's records emerge. */
  scale?: { speckleFrom?: number; emergeFrom: number; pointsFrom: number };
  /** The zooms across which a polygon layer coarsens into grid cells at distance. */
  blockAggregate?: { cellMeters: number; blocksUntil: number; detailFrom: number };
  /** Colour records by a category once they are drawn individually. */
  categoryColors?: {
    key: string;
    label: string;
    colors: Array<{ value: string; color: string }>;
    fallback: string;
    /** See LayerDefinition's own comment in layers/types.ts. */
    showOnMapKey?: boolean;
  };
  /** Write an attribute's value on each polygon, the way the source document did. */
  labelBy?: { key: string; minzoom?: number };
  /** See LayerDefinition's own comment in layers/types.ts. */
  polygonClick?: 'highlight';
  /** See LayerDefinition's own comment in layers/types.ts. */
  markerIcon?: {
    icon: string;
    byValue?: {
      key: string;
      icons: Record<string, string>;
      colors?: Record<string, { color: string; colorLight: string }>;
    };
  };
  /** See LayerDefinition's own comment in layers/types.ts. Strings already localised. */
  hoverCard?: {
    fields: string[];
    related?: {
      layerId: LayerId;
      fromKey: string;
      joinKey: string;
      labelKey: string;
      linkKey?: string;
      linkLabel: string;
      moreLabel: string;
      title: string;
      empty: string;
      max?: number;
    };
    note?: string;
  };
  /** See LayerDefinition's own comment in layers/types.ts. */
  /** See LayerDefinition's own comment in layers/types.ts. */
  selectedEmphasis?: 'full' | 'subtle';
  relatedBuildings?: {
    layerId: LayerId;
    fromKey?: string;
    joinKey: string;
    hubKey?: string;
    pathsTo?: { layerId: LayerId; fromKey?: string; joinKey: string };
  };
  /** See LayerDefinition's own comment in layers/types.ts. */
  tintWhenRelated?: {
    layerId: LayerId;
    fromKey?: string;
    joinKey: string;
    excludeWhen?: { key: string; values: string[] };
    color: string;
    colorLight: string;
    secondaryWhen?: { key: string; values: string[]; color: string; colorLight: string };
    cancelledWhen?: { key: string; values: string[]; color: string; colorLight: string };
  };
  /** Scale this line layer's width by a magnitude in its own data. */
  weightBy?: { key: string; label: string; stops: Array<[number, number]> };
  /** How strongly to paint this line layer, 0–1. Omit for the standard weight. */
  opacity?: number;
  /** The request a reader can file about one of these records, if any. */
  action?: {
    requestType: string;
    label: string;
    bodyKey?: string;
    fallbackBody?: 'countySheriff' | 'county' | 'name';
  };
  /** See LayerDefinition's own comment in layers/types.ts. Strings already localised. */
  crossSource?: {
    legend: string;
    hoverNote: string;
    matched: string;
    unmatched: string;
    /** See LayerDefinition.crossSource.nearMiss's own comment. */
    nearMiss?: string;
    contested: string;
    ambiguousAnchor: string;
    glossary: string;
    searchSuffix: string;
    /** See LayerDefinition.crossSource.nearMissSearchSuffix's own comment. */
    nearMissSearchSuffix?: string;
  };
  dataPath: string;
  filters: {
    key: string;
    label: string;
    kind: 'enum' | 'dateRange';
    values: string[];
    /** Observed values this layer opens with unticked. See FilterDefinition. */
    defaultExcluded?: string[];
  }[];
  /**
   * `format` is the registry's closed union, not `string`: this interface is
   * hand-mirrored from LayerDefinition, and widening it here is what let the
   * shared formatter silently drop a member.
   */
  detailFields: {
    key: string;
    label: string;
    format?: DetailFieldFormat;
    pillLabels?: Record<string, string>;
  }[];
  source: string;
  sourceUrl: string;
  license: string;
}

export interface LoadedFeature {
  type: 'Feature';
  geometry: Geometry;
  properties: FeatureProperties;
}

type FilterState = Map<string, Set<string>>;

export interface ControllerEvents {
  onSelect?: (feature: LoadedFeature | null, layer?: ClientLayer) => void;
  onCounts?: (counts: Record<string, { shown: number; total: number }>) => void;
  onLayerReady?: (layerId: string, features: LoadedFeature[]) => void;
  onError?: (layerId: string, message: string) => void;
  /** Localized label for the corner "reset view" control — see ResetViewControl. */
  resetViewLabel?: string;
  /** Localized label for the corner "what's near me" control — see NearMeControl. */
  nearMeLabel?: string;
  /** Localized message shown when the browser has no geolocation API at all. */
  locationUnavailableLabel?: string;
  /** Localized message shown when the reader declines the location permission prompt. */
  locationDeniedLabel?: string;
  /** Localized message shown when the browser's own lookup didn't answer within its timeout — distinct from a decline, since nothing was denied. */
  locationTimedOutLabel?: string;
  /** A geolocation lookup for the "what's near me" control failed — see the labels above. */
  onNearMeError?: (message: string) => void;
  /** A "what's near me" lookup succeeded — total records found within radius, and how many were drawn (see NEARME_MAX_LINES). The only accessible-DOM feedback this canvas-only overlay has. */
  onNearMeResult?: (totalFound: number, shown: number) => void;
  /** Localized label for the search-radius slider (NearMeRadiusControl) — read by screen readers via aria-label. */
  nearMeRadiusLabel?: string;
  /** Localized "N mi" formatter for the slider's live value — both the visible number beside it and its aria-valuetext. */
  formatNearMeRadiusValue?: (miles: number) => string;
  /**
   * "What's near me" mode is turning on or off — fired the instant the
   * reader clicks the control (before the geolocation permission prompt is
   * even answered) and again on clearNearMe or a failed lookup, so a
   * denied/timed-out/unavailable fix rolls the same state back rather than
   * leaving the reader stuck in a mode that never actually started. Lets
   * MapView.astro force every layer except the radius-mode ones (the ones
   * "near me" itself searches — see ClientLayer's own `nearMeRadiusMi`) off
   * for the duration, and restore whatever was on before once it ends.
   */
  onNearMeModeChange?: (active: boolean) => void;
}

// Exported so MapView.astro's own panel-collapse toggle (setPanelCollapsed)
// can skip animating under reduced motion using this exact detection rather
// than re-querying matchMedia ad hoc in a second place.
export const REDUCED_MOTION =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const EMPTY_FC: FeatureCollection = { type: 'FeatureCollection', features: [] };

/**
 * Below this map width, a fit uses the narrow margin instead of the roomy one.
 * 64px a side is a comfortable frame on a laptop and two thirds of the picture
 * on a phone.
 */
const NARROW_MAP_PX = 640;

/** The margin a fit falls back to on a map narrower than NARROW_MAP_PX. */
const NARROW_FIT_PADDING = 40;

/** No fit may spend more than this share of an axis on padding. */
const MAX_PADDING_SHARE = 0.6;

/**
 * Fit padding for one axis, clamped so it cannot swallow the frame it pads.
 *
 * `fitBounds` derives its zoom from whatever room is left after padding, so
 * padding that approaches the canvas's own size drives that room towards zero
 * and the zoom towards the minimum. Unclamped, a phone-sized map reserving
 * space for the detail sheet framed a single city at zoom 9 and a county at
 * zoom 7 — a fit so wide the record it was fitting was a speck. Scales the
 * pair down together so a reserved sheet stays reserved in proportion.
 */
function fitAxisPadding(start: number, end: number, extent: number): [number, number] {
  const budget = extent * MAX_PADDING_SHARE;
  const total = start + end;
  if (total <= budget) return [start, end];
  const scale = budget / total;
  return [Math.floor(start * scale), Math.floor(end * scale)];
}

/**
 * Where a layer's records emerge, from the zooms it names.
 *
 * Records fade in across these rather than switching on at a single cut, so a
 * reader zooming in never crosses a line where the map stops meaning one
 * thing and starts meaning another. Everything downstream reads these rather
 * than a constant of its own, so the cones cannot arrive before the records
 * they annotate.
 *
 * `speckleFrom` is the earliest of the three and optional: a layer that omits
 * it (every point layer today except ALPR) fades in starting at `emergeFrom`
 * exactly as before. ALPR sets it to the map's own minimum zoom, so a faint,
 * uncoloured speck is on screen the instant the view is that far out — the
 * statewide or nationwide look, not a switch that stays off until `emergeFrom`.
 */
function scaleOf(layer: ClientLayer) {
  const emergeFrom = layer.scale?.emergeFrom ?? 0;
  const pointsFrom = layer.scale?.pointsFrom ?? emergeFrom + 1;
  const speckleFrom = layer.scale?.speckleFrom ?? emergeFrom;
  return {
    /** A faint, uniform speck is visible from here — see the function comment. */
    speckleFrom,
    /** Dots begin to fade toward solid here. */
    emergeFrom,
    /** Records are fully drawn from here, and so are their indicators. */
    pointsFrom,
  };
}

/**
 * Width of the cone drawn when the source records a heading but no arc.
 *
 * This is a drawing convention, not a measurement — nothing upstream says how
 * wide any given camera sees. Where the surveyor *did* record an arc, that arc
 * is used instead and this constant is ignored. The layer's limitations say
 * which is which, because a cone looks like evidence whether or not it is.
 */
const DEFAULT_CONE_ARC = 50;

/** Written onto the cone features by us; not an upstream field. */
const BEARING_PROP = '__bearing';
const CONE_PROP = '__cone';

/**
 * Fill for a `polygonClick: 'highlight'` layer's un-tapped polygons — a
 * ward map before anyone has picked a ward. Legible against either basemap
 * but deliberately duller than any layer's own accent colour, so the one
 * polygon a reader has actually selected is the only one that reads as data.
 */
const NEUTRAL_POLYGON_DARK = '#64748b';
const NEUTRAL_POLYGON_LIGHT = '#94a3b8';

/**
 * The hover/select *outline* colour for a `polygonClick: 'highlight'`
 * layer — the wealldobettermn.org effect this borrows (its own
 * OUTLINE_COLOR, WardMap.tsx): a selected ward's fill stays whatever colour
 * it already has, but its outline pops to a fixed near-white (dark
 * basemap) or near-black (light basemap) and thickens, so which one is
 * highlighted reads instantly regardless of the polygon's own colour.
 * Deliberately a *different* constant from NEUTRAL_POLYGON_DARK/LIGHT
 * above (which colour the *fill* when nothing is selected) — this is what
 * lets polygonOutlineColor() diverge from polygonFillColor() for exactly
 * this one state. Matches global.css's --color-ink-100 (this site's own
 * primary-text ink) rather than inventing a new colour for the occasion.
 */
const POLYGON_HIGHLIGHT_OUTLINE_DARK = '#e7ecf3';
const POLYGON_HIGHLIGHT_OUTLINE_LIGHT = '#131a24';

/** Written onto derived grid blocks by us; not an upstream field. */
const BLOCK_COUNT_PROP = '__blockCount';

const normaliseDegrees = (d: number) => ((d % 360) + 360) % 360;

/**
 * Every sector a `direction` value describes, as a centre bearing plus an arc.
 *
 * OSM's `direction` is free text carrying four different things, and all four
 * appear in this dataset:
 *
 *   "180"       a heading, no arc          -> arc null, caller supplies one
 *   "108-153"   a real sector, 45° wide    -> arc 45, drawn as recorded
 *   "321;109"   several cameras on a pole  -> one sector each
 *   "0-360"     covers everything          -> arc 360
 *
 * `arc: null` means "the surveyor gave a heading and nothing more", kept
 * distinct from a recorded arc so the caller can decide what to draw and the
 * limitations can be honest about which cones are measured.
 */
function parseSectors(raw: unknown): { bearing: number; arc: number | null }[] {
  if (raw === null || raw === undefined) return [];
  const text = String(raw).trim();
  if (!text) return [];

  const sectors: { bearing: number; arc: number | null }[] = [];
  for (const part of text.split(';')) {
    const piece = part.trim();
    if (!piece) continue;

    const range = /^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/.exec(piece);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      // "0-360" is the surveyor saying the camera covers every direction.
      if (from === 0 && to === 360) {
        sectors.push({ bearing: 0, arc: 360 });
        continue;
      }
      const arc = normaliseDegrees(to - from);
      // "180-180" collapses to nothing; read it as a bare heading.
      if (arc === 0) {
        sectors.push({ bearing: normaliseDegrees(from), arc: null });
        continue;
      }
      sectors.push({ bearing: normaliseDegrees(from + arc / 2), arc });
      continue;
    }

    const degrees = Number(piece);
    if (Number.isFinite(degrees)) sectors.push({ bearing: normaliseDegrees(degrees), arc: null });
  }
  return sectors;
}

/**
 * The searched-for jurisdiction outline. One source and one layer, reused —
 * there is never more than one boundary on the map at a time.
 */
const JURISDICTION_SOURCE = 'src-jurisdiction';
const JURISDICTION_LAYER = 'jurisdiction-outline';
/** Neutral against every layer colour: this is a frame, not a finding. */
const JURISDICTION_COLOR = '#94a3b8';

/**
 * The building(s) a selected `relatedBuildings` polygon answers from, and
 * the paths to whatever a `pathsTo` relation draws — see that field's own
 * comment in types.ts. One source and one layer of each, reused and
 * `setData()`-ed on every selection change, the same way JURISDICTION_SOURCE
 * above is: there is only ever one polygon selected at a time, so there is
 * only ever one set of buildings and paths to show for it.
 */
const RELATED_BUILDINGS_SOURCE = 'src-related-buildings';
const RELATED_BUILDINGS_GLOW_LAYER = 'related-buildings-glow';
const RELATED_BUILDINGS_LAYER = 'related-buildings';
const RELATED_PATHS_SOURCE = 'src-related-paths';
const RELATED_PATHS_LAYER = 'related-paths';
const RELATED_IMPACT_SOURCE = 'src-related-impacts';
const RELATED_IMPACT_LAYER = 'related-impacts';

/**
 * The selection overlays, bottom to top. restack() pins these above every
 * registry layer in this order — the thrown lines under the marks they
 * connect, the answer to the reader's question on top of everything.
 */
const OVERLAY_STACK = [
  RELATED_PATHS_LAYER,
  RELATED_IMPACT_LAYER,
  RELATED_BUILDINGS_GLOW_LAYER,
  RELATED_BUILDINGS_LAYER,
];

/**
 * The "what's near me" overlay — NearMeControl's mirror of the jurisdiction
 * throw above, rooted at the reader instead of a law-enforcement building.
 * Kept on its own sources/layers rather than reusing RELATED_* : that overlay
 * is owned by whichever *registry layer* is selected (`relatedOverlayOwner`)
 * and destroyed/rebuilt when the owner changes (see ensureRelatedLayers's own
 * comment) — a person's location isn't a layer and has no owner to change,
 * so it needs a lifecycle the relation overlay's doesn't have: created once,
 * cleared and redrawn freely, independent of whatever a reader has selected
 * elsewhere on the map.
 */
const NEARME_ORIGIN_SOURCE = 'src-nearme-origin';
const NEARME_ORIGIN_GLOW_LAYER = 'nearme-origin-glow';
const NEARME_ORIGIN_LAYER = 'nearme-origin';
const NEARME_PATHS_SOURCE = 'src-nearme-paths';
const NEARME_PATHS_LAYER = 'nearme-paths';
const NEARME_IMPACT_SOURCE = 'src-nearme-impacts';
const NEARME_IMPACT_LAYER = 'nearme-impacts';
const NEARME_STACK = [NEARME_PATHS_LAYER, NEARME_IMPACT_LAYER, NEARME_ORIGIN_GLOW_LAYER, NEARME_ORIGIN_LAYER];
/**
 * Nearest-first cap so a metro-wide "near me" throw stays legible and the
 * animation stays cheap — see throwPaths's own cost comment. Raised from
 * an original 20: with the radius slider (and the autozoom that now
 * follows it), a cap that low saturates well inside the slider's own
 * range in a dense area — downtown Minneapolis already has >20 candidates
 * within 5mi of its own 25mi max — so widening past that point stopped
 * visibly connecting the reader to anything further, silently defeating
 * the slider's own purpose. 50 pushes the saturation point out further
 * without reintroducing the legibility/cost problem this cap exists for.
 */
const NEARME_MAX_LINES = 50;

/**
 * Bounds and default for the "what's near me" search-radius slider
 * (NearMeRadiusControl). The reader drags a radius; how many
 * cameras/readers that connects them to is exactly NEARME_MAX_LINES-capped
 * `nearMeCandidates` within it (applyNearMeRadius) — wider radius, more
 * connected; narrower, fewer. The camera then autozooms to fit whatever
 * that set turns out to be (refitNearMeCamera), so the map's zoom is
 * itself a function of how many cameras are currently connected, not a
 * separately-tuned number.
 *
 * Default and max both match the fixed 5mi both radius-mode `nearMe`
 * layers already promise on /near-me (registry.ts's own `radii: [5]`), so
 * a first-time "near me" result here shows exactly what the near-me page
 * would report, and the slider opens already at that same full search —
 * its only job is narrowing down from there, not searching wider than the
 * page's own promise. (An earlier version let this run out to 25mi; that
 * min/max split is intentionally gone now, not left in as dead range.)
 * Max is a UI ceiling on the search itself, separate from accuracyZoomCap
 * below, which ceilings how far *in* the resulting fit is allowed to go.
 */
const NEARME_RADIUS_MIN_MI = 1;
const NEARME_RADIUS_MAX_MI = 5;
const NEARME_RADIUS_DEFAULT_MI = 5;

/**
 * The zoom refitNearMeCamera eases to when there's nothing to fit around —
 * zero results, or a fit that failed — floor-style, same Math.max(current,
 * N) shape focusFeature uses for a single point. Matches alpr's own
 * `pointsFrom: 14` (see registry.ts): below this zoom the camera dots a
 * near-me throw lands on are still specks, not resolved records.
 *
 * Not a floor on the fit-over-targets path: showing every connected camera
 * on screen is the point of that path, and a widely spread set of them can
 * legitimately need a zoom below this to all fit — a reader in a sparse
 * county sees two real, distant cameras rather than one cropped to a
 * resolved-looking frame. Clamped down by accuracyZoomCap below either
 * way, when the fix itself can't support the chosen zoom.
 */
const NEARME_ZOOM = 14;

/**
 * The accuracy circle is allowed to span this share of the map's shorter
 * side at accuracyZoomCap's returned zoom — big enough that the true fix is
 * still very likely on screen even with the origin dot drawn a little off,
 * small enough that the frame reads as "your area," not "the whole state."
 */
const ACCURACY_CIRCLE_SHARE = 0.6;

/**
 * How far "locate me" is allowed to zoom in, honestly.
 *
 * A desktop wifi fix is routinely accurate to only 1–5km — `enableHighAccuracy`
 * is deliberately off here (see toggleNearMe) to avoid a GPS prompt for what's
 * usually a metro-scale lookup. Zooming to street level on a fix that could be
 * three kilometres off both misrepresents the data (§0.2) and, on a shared or
 * screenshotted screen, implies a precision about the reader's own location
 * that isn't real (§0.7). This finds the zoom at which a circle of
 * `accuracyM` radius still spans ACCURACY_CIRCLE_SHARE of the map's shorter
 * side, so the true fix is very likely still on screen even if the dot
 * itself is centred a little wrong.
 *
 * MapLibre (like Mapbox GL, unlike classic 256px raster tiles) sizes the
 * world at 512 * 2^zoom CSS pixels — half the constant the more common
 * 156543.03392 web-Mercator formula assumes. Using that constant here would
 * return a zoom one full level too tight, which is exactly the
 * false-precision failure this clamp exists to prevent.
 */
function accuracyZoomCap(accuracyM: number, lat: number, minDimensionPx: number): number {
  const metersPerPixel = (2 * accuracyM) / (ACCURACY_CIRCLE_SHARE * minDimensionPx);
  const worldWidthAtZoom0 = 40_075_016.686 / 512;
  return Math.log2((worldWidthAtZoom0 * Math.cos((lat * Math.PI) / 180)) / metersPerPixel);
}

/**
 * The line-throw on selecting a jurisdiction, in milliseconds.
 *
 * Each line is thrown from the agency's own building to one reader that
 * agency reported operating, and lands with a ring at both ends. Staggered
 * rather than simultaneous so a reader can count them — the number of
 * readers one department reported is the finding, and fifteen lines arriving
 * at once is a single event where fifteen arriving in sequence is fifteen.
 *
 * Strictly bounded: every line has landed by THROW_MS + the largest stagger,
 * the rings fade over IMPACT_MS, and the loop then stops itself. Nothing here
 * animates at rest, which is the rule this map holds to — a permanently
 * running animation costs battery on every device showing the page for as long
 * as it is open, and says "urgent" about records whose whole argument is that
 * they are routine (§0.4).
 *
 * The total time every line takes to *start* (the stagger span, not
 * THROW_MS/IMPACT_MS below) is capped at THROW_SPREAD_MS — see runThrow's
 * own stagger calculation. THROW_STAGGER_MS is a ceiling on the per-line
 * gap, not the actual gap: a jurisdiction throw or a near-me search rarely
 * has more than a handful of targets, so most throws still space lines
 * THROW_STAGGER_MS apart exactly as before. Only once a batch is large
 * enough that spacing every line that far apart would itself exceed
 * THROW_SPREAD_MS does the per-line gap shrink, so a near-me throw at a
 * wide radius in a dense area (up to NEARME_MAX_LINES lines) finishes in
 * the same total time as one with a handful of results, not several
 * seconds longer — "found more" should not read as "got slower."
 */
const THROW_MS = 420;
const THROW_STAGGER_MS = 70;
const THROW_SPREAD_MS = 400;
const IMPACT_MS = 520;
/**
 * Frame budget for runThrow's setData work: ~30Hz rather than every rAF
 * (~60-144Hz depending on the display). setData is a worker round trip —
 * it posts the collection, then re-parses and re-indexes on completion —
 * not a cheap buffer write, so most of a per-frame call's allocation and
 * serialization is thrown away before the next one lands anyway (#77).
 * The geometry is a straight ease-out interpolation, so the frames this
 * skips aren't visually distinguishable at THROW_MS/IMPACT_MS durations.
 * rAF is still requested every tick — only the setData work is gated — so
 * the loop's own timing stays smooth and self-correcting.
 */
const THROW_FRAME_BUDGET_MS = 1000 / 30;

/** Every style-layer suffix a tap can select a record on. */
const SELECTABLE_SUFFIXES = ['-fill', '-line-hit', '-points'];

// Registers the pmtiles:// URL scheme with MapLibre so baseStyle()'s vector
// source can reference the self-hosted archive directly (see mapStyle.ts's
// header comment). Module-level, not per-instance: addProtocol is global
// registry state on the maplibregl import, and every MapController in a
// page shares one. Safe to call more than once (a later call just
// overwrites the handler with an equivalent one) but there's no reason to.
maplibregl.addProtocol('pmtiles', new PMTilesProtocol().tile);

/**
 * Owns the MapLibre instance and all layer state.
 *
 * Filtering re-sets the source data rather than using MapLibre layer filters,
 * because clustered sources compute clusters before layer filters run — so a
 * filtered clustered layer would otherwise keep showing counts for features it
 * is no longer drawing. Re-setting data keeps the cluster totals, the visible
 * dots, the accessible record list and the counter in agreement.
 */
export class MapController {
  readonly map: MLMap;
  private layers: ClientLayer[];
  private events: ControllerEvents;

  /**
   * As loaded from disk, so the record list, the counter, search, the detail
   * panel and the map are all reading the same records the reader is
   * looking at.
   */
  private data = new Map<string, LoadedFeature[]>();
  private visible = new Set<string>();
  private filters = new Map<string, FilterState>();
  private loading = new Set<string>();
  /**
   * In-flight fetches, keyed by layer. The `data` map only answers "is it here
   * yet", which is false for the whole duration of the request — so two ward
   * clicks inside that window, or a checkbox ticked while a cross-layer lookup
   * is already downloading the same file, each issued their own GET and their
   * own parse of the same quarter-megabyte. Callers share the promise instead.
   */
  private inFlight = new Map<string, Promise<LoadedFeature[]>>();
  /**
   * Per-layer lookup by record id, built in one pass when the features land.
   *
   * Read through featureById, which focusFeature — the funnel every map tap,
   * record-list row and search result passes through — and the hover card both
   * use. The layers this resolves against run to 1,430 records (alpr), 34,741
   * (covenants) and 40,344 (aadt), so the scan it replaces was not academic.
   */
  private byId = new Map<string, Map<string, LoadedFeature>>();
  /**
   * Per-layer lookup by an attribute value, for the registry-declared joins
   * (`hoverCard.related`, `relatedPoints`). Keyed `layerId::attributeKey` and
   * built on first use, because which key a layer is joined on is a registry
   * decision this class shouldn't have to know in advance.
   */
  private joinIndexes = new Map<string, Map<string, LoadedFeature[]>>();
  private popup: maplibregl.Popup | null = null;
  /** Set once the map's `load` event has fired. See ready(). */
  private hasLoaded = false;
  /**
   * Whether the *current basemap* is dark, not the site theme — they're
   * independent (lib/theme.ts). Drives every basemap-dependent paint
   * property — a layer's own colour/colorLight, casings drawn in the
   * basemap's own background — both at initial layer creation and on repaint
   * when the map style changes; see repaintThemedLayers().
   */
  private basemapDark = MAP_STYLES[initialMapStyle()].dark;
  /** See the `basemapColor` getter's comment — kept in sync by setBasemap(), the only place `basemapDark` changes. */
  private cachedBasemapColor = basemapBackgroundColor(initialMapStyle());
  /** Where the reader was before a tapped record moved the camera to it. */
  private preSelectCamera: { center: [number, number]; zoom: number } | null = null;
  /**
   * The one feature-state-highlighted polygon, if any. Singular by design, not
   * by accident: markPolygonSelected releases whatever held the highlight
   * before taking it, so a second highlight layer would still only ever light
   * one polygon at a time — and the overlays hung off the selection
   * (relatedPoints, thrown paths) are single-source for the same reason.
   */
  private selectedPolygon: { layerId: string; featureId: string } | null = null;
  /**
   * Resolved `markerIcon` expression per layer, filled in by loadLayer
   * before it draws. Cached because building it decodes an SVG per icon, and
   * because addLayer — which needs it — is synchronous.
   */
  private markerExpressions = new Map<string, maplibregl.ExpressionSpecification | string>();
  /** rAF handle for the path-throw animation, so a new selection can cancel the last. */
  private throwFrame: number | null = null;
  /** rAF handle for the "near me" throw — separate from throwFrame so a jurisdiction pick and a near-me lookup never cancel each other's animation. */
  private nearMeThrowFrame: number | null = null;
  /** Set once the near-me sources/layers exist, so a second lookup only calls setData rather than re-adding them (see ensureRelatedLayers's own reasoning). */
  private nearMeLayersReady = false;
  /** The point a "near me" lookup currently has lines thrown from, or null if none is active — also NearMeControl's toggle state. */
  private nearMeOrigin: [number, number] | null = null;
  /** True between requesting a location and the browser answering — see toggleNearMe's own comment for the double-click race this closes. */
  private nearMeLocating = false;
  /** Bumped on every showNearMe/clearNearMe so an in-flight lookup's async data-load can tell it's been superseded and skip drawing. */
  private nearMeToken = 0;
  /** Every candidate within NEARME_RADIUS_MAX_MI of the current nearMeOrigin, nearest-first — computed once per lookup; applyNearMeRadius re-slices this on every slider move instead of re-scanning the layers. */
  private nearMeCandidates: Array<{ point: [number, number]; distance: number }> = [];
  /** rAF handle coalescing NearMeRadiusControl's drag ticks — see dragNearMeRadius's own comment for why a redraw per tick is too many. */
  private nearMeDragFrame: number | null = null;
  /** The most recent radius a drag tick asked for, applied by nearMeDragFrame's queued callback — only the latest value in a frame ever gets drawn. */
  private pendingNearMeRadiusMi: number | null = null;
  /** The geolocation fix's own accuracy radius, in meters — accuracyZoomCap's input, kept here so every later refit (not just the first) can honor it, not just the one at lookup time. */
  private nearMeAccuracyM = 0;
  /**
   * Which layer's selection the overlays currently belong to — their colour
   * and glyph are that layer's. Tracked rather than re-derived with
   * `layers.find((l) => l.relatedPoints)`, which answers "which layer declares
   * the field" and not "whose overlay is on the map": the same answer only
   * while exactly one layer declares it, and a silently wrong one after that.
   */
  private relatedOverlayOwner: string | null = null;
  /**
   * Bumped on every selection and every release. showRelatedBuildings awaits
   * network fetches, so it compares this against the value it started with
   * before touching the map — a slow request for a ward the reader has since
   * left must not paint over the one they are actually looking at.
   */
  private selectionEpoch = 0;
  /** Separate from `popup`, which is the "near me" marker and must survive a hover. */
  private hoverPopup: maplibregl.Popup | null = null;
  /** Which record `hoverPopup` is currently describing. See bindHoverCard. */
  private hoverCardId: string | null = null;
  /**
   * The one hover-previewed polygon, if any — singular, matching
   * selectedPolygon, because a pointer is in one place.
   *
   * Tracked here rather than as a closure inside bindHighlightSelect so
   * clearSelection can release it too — a fitBounds/easeTo the reader
   * triggered by clicking moves the ground out from under a still pointer,
   * and nothing fires another 'mousemove' to notice until the reader's own
   * cursor moves again, which would otherwise leave the just-deselected
   * polygon visibly hovered under a pointer that never left it.
   */
  private hoveredPolygon: { layerId: string; featureId: string } | null = null;
  /** Page chrome that can float over the map. See setOverlay. */
  private overlay: HTMLElement | null = null;
  private overlaySize: ResizeObserver | null = null;
  private overlayShown: MutationObserver | null = null;
  /**
   * #map-corner-controls' four occupants — hand-mounted (see the
   * constructor), so map.remove() won't tear them down on its own; each
   * needs an explicit onRemove() in destroy(). ScaleControl isn't here: it
   * still goes through map.addControl(), which does clean it up.
   */
  private themeControl: ThemeControl | null = null;
  private resetViewControl: ResetViewControl | null = null;
  private nearMeControl: NearMeControl | null = null;
  private nearMeRadiusControl: NearMeRadiusControl | null = null;
  private navControl: maplibregl.NavigationControl | null = null;
  private attribControl: maplibregl.AttributionControl | null = null;
  private attribObserver: MutationObserver | null = null;
  /**
   * Keeps MapLibre's canvas in sync with the container's real size whenever
   * something *other* than this class resizes it — the collapsible side
   * panels (#controls, #detail-panel in MapView.astro) push-resize the
   * map's box by animating a CSS `width`, and nothing else here calls
   * map.resize() for that. See resizeIfNeeded() and the constructor.
   *
   * One disposer, not a separate nullable field per watch mechanism
   * (ResizeObserver vs. the window-resize fallback) — the constructor picks
   * exactly one of the two and stores how to tear down *that* one; destroy()
   * doesn't need to know which.
   */
  private disposeContainerWatch: (() => void) | null = null;
  /**
   * Debounce timer, not an rAF handle. A CSS `width` transition (e.g. a
   * collapsing sidebar) fires a ResizeObserver notification on essentially
   * every animation frame while the box is still changing size — an rAF
   * coalesces those down to one call per *frame*, which is still ~12 calls
   * over a 200ms transition, and each map.resize() call reallocates and
   * clears the WebGL drawing buffer, forcing a full repaint. That's a
   * visible flash/blink on every collapse and expand. Debouncing instead —
   * resetting the timer on every notification and only actually resizing
   * once the container's size has been quiet for a beat — collapses that
   * burst into the single resize the container's *settled* size actually
   * needs, regardless of what caused the burst (an animated sidebar, a
   * window drag, a devtools reflow). That's also why this lives here
   * rather than as a `transitionend` hook tied to the sidebars' specific
   * CSS class names: this class stays agnostic to what's animating it.
   */
  private resizeSettleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(container: HTMLElement, layers: ClientLayer[], events: ControllerEvents = {}) {
    this.layers = layers;
    this.events = events;

    this.map = new maplibregl.Map({
      container,
      style: baseStyle(initialMapStyle()),
      // Twin Cities metro, not the statewide view — see METRO_CENTER's
      // comment in mapStyle.ts. This is only the placeholder shown before
      // 'load' fires below and corrects it against the real container size;
      // it matters on slow connections (§0.7) where that gap is longest.
      center: METRO_CENTER,
      zoom: 9,
      minZoom: 3,
      maxZoom: 18,
      // false, not the usual `{ compact: true }` — built and mounted by
      // hand below instead, alongside the zoom buttons and the theme
      // toggle, into #map-corner-controls (see that div's own comment in
      // MapView.astro). Handing it to this option (or to
      // map.addControl()) would put it in MapLibre's own separately-
      // positioned bottom-right corner container, which this app no
      // longer uses — matching wealldobettermn.org's WardMap.tsx exactly.
      attributionControl: false,
      // The canvas is not usable by a screen reader; the record list beside it
      // is the accessible equivalent, so keep the canvas out of the tab order.
      // Keyboard panning still works once the map is focused deliberately.
      dragRotate: false,
      pitchWithRotate: false,
    });

    // Mounted by hand (control.onAdd(map) → append the returned element
    // ourselves) rather than map.addControl(), so the theme toggle, reset
    // button, zoom buttons, and attribution badge all live as ordinary
    // flex children of one div this markup owns (#map-corner-controls, in
    // MapView.astro) instead of being split across MapLibre's own
    // per-corner containers. onRemove() is called explicitly in destroy()
    // for the same reason: map.remove() only tears down controls it thinks
    // it owns via its own _controls list, and these are deliberately kept
    // out of it. Order here is the stacking order top-to-bottom.
    const cornerControls = container.parentElement?.querySelector<HTMLElement>('#map-corner-controls');
    this.themeControl = new ThemeControl();
    this.resetViewControl = new ResetViewControl(events.resetViewLabel ?? 'Reset view', () => this.resetView());
    this.nearMeControl = new NearMeControl(events.nearMeLabel ?? 'What’s near me', () => this.toggleNearMe());
    const formatRadius = events.formatNearMeRadiusValue ?? ((mi) => `${mi} mi`);
    this.nearMeRadiusControl = new NearMeRadiusControl(
      events.nearMeRadiusLabel ?? 'Search radius',
      NEARME_RADIUS_MIN_MI,
      NEARME_RADIUS_MAX_MI,
      NEARME_RADIUS_DEFAULT_MI,
      formatRadius,
      (mi) => this.dragNearMeRadius(mi),
      (mi) => this.commitNearMeRadius(mi),
    );
    this.navControl = new maplibregl.NavigationControl({ showCompass: false });
    this.attribControl = new maplibregl.AttributionControl({ compact: true });
    if (cornerControls) {
      cornerControls.appendChild(this.themeControl.onAdd(this.map));
      cornerControls.appendChild(this.resetViewControl.onAdd(this.map));
      cornerControls.appendChild(this.nearMeControl.onAdd(this.map));
      cornerControls.appendChild(this.nearMeRadiusControl.onAdd(this.map));
      cornerControls.appendChild(this.navControl.onAdd(this.map));
      const attribEl = this.attribControl.onAdd(this.map);
      cornerControls.appendChild(attribEl);

      // MapLibre's AttributionControl starts *expanded* the first time
      // attributions populate, even with `compact: true` set — its own
      // _updateCompact() adds `maplibregl-compact-show` unconditionally on
      // first run and only collapses it later, in response to a `drag`
      // event. Left alone, that means the attribution badge briefly
      // renders as a full text bar rather than the small "i" badge a
      // reader expects. A MutationObserver, not a fixed timeout, catches
      // the class the instant MapLibre adds it regardless of how long the
      // style/sources take to load, and only fires once — after that, a
      // reader's own click on the badge toggles it normally.
      const collapseAttribOnce = () => {
        if (!attribEl.classList.contains('maplibregl-compact-show')) return;
        attribEl.classList.remove('maplibregl-compact-show');
        attribEl.removeAttribute('open');
        this.attribObserver?.disconnect();
      };
      this.attribObserver = new MutationObserver(collapseAttribOnce);
      this.attribObserver.observe(attribEl, { attributes: true, attributeFilter: ['class'] });
      collapseAttribOnce();
    }

    // Queued on 'load' if a visitor toggles before the map has finished its
    // first style load — setBasemap() reads the live style via
    // map.getStyle() to preserve registry layers (see its own comment), and
    // that read isn't meaningful yet before 'load' fires.
    onMapStyleChange((styleId) => {
      if (this.hasLoaded) this.setBasemap(styleId);
      else this.map.once('load', () => this.setBasemap(styleId));
    });

    // The old raster setup shipped to production twice with a silently blank
    // map (see mapStyle.ts's history note) because nothing surfaced a failed
    // tile fetch anywhere a visitor could see. This is the vector
    // equivalent's one required difference: a failure to reach the archive
    // — wrong URL, bucket unreachable, CORS misconfigured — degrades to a
    // visible status message rather than a silent blank canvas. Everything
    // else (pins, the record list, search) works with no basemap at all, by
    // construction — the record list is the accessible primary interface
    // and never depended on tiles.
    this.map.on('error', (e) => {
      const err = e as unknown as { sourceId?: string; error?: Error };
      if (err.sourceId === 'basemap') {
        this.events.onError?.('basemap', 'Base map unavailable — layers and search still work.');
      } else if (import.meta.env.DEV) {
        // Every other 'error' here is MapLibre refusing something silently —
        // most often a bad paint expression, which drops the whole layer
        // with no exception and no other signal (see pointStrokeWidthExpr's
        // own comment for the one that cost real debugging time before this
        // line existed). Dev-only: a build has no console to read anyway.
        console.error('[mapController] map error:', err.error?.message ?? err);
      }
    });

    this.map.on('load', () => {
      this.hasLoaded = true;
      // Metro on load, not the statewide MN_BOUNDS — see METRO_CENTER's
      // comment in mapStyle.ts. resetView() (below) fits this same
      // METRO_BOUNDS, so the reset button returns a reader who has panned
      // or filtered elsewhere to exactly what they saw on first load.
      this.map.fitBounds(METRO_BOUNDS, { padding: 24, animate: false });
    });

    // A tap that lands on nothing of ours is the reader stepping back out of
    // a record, the way closing it would be — so it gets the same undo: the
    // camera returns to where a pin's tap first moved it from, and the detail
    // panel closes. Queried directly rather than inferred from whether a
    // per-layer click handler also fired, so this owes nothing to listener
    // registration order against handlers bound as layers arrive.
    this.map.on('click', (e) => {
      const ids = this.styleLayerIds(SELECTABLE_SUFFIXES);
      if (!ids.length) return;
      if (this.map.queryRenderedFeatures(e.point, { layers: ids }).length) return;
      this.clearSelection();
    });

    // See resizeSettleTimer's comment above — debounced, not rAF-coalesced,
    // so a burst of notifications during an animated collapse settles into
    // one resize instead of one per animation frame.
    const handleContainerResize = () => {
      if (this.resizeSettleTimer != null) clearTimeout(this.resizeSettleTimer);
      this.resizeSettleTimer = setTimeout(() => {
        this.resizeSettleTimer = null;
        this.resizeIfNeeded();
      }, 100);
    };
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(handleContainerResize);
      observer.observe(container);
      this.disposeContainerWatch = () => observer.disconnect();
    } else {
      // Fallback only where ResizeObserver itself is unsupported — a plain
      // window resize already produces a ResizeObserver notification for
      // this container in every browser that has one, so registering both
      // unconditionally would fire the same handler twice per resize.
      window.addEventListener('resize', handleContainerResize);
      this.disposeContainerWatch = () => window.removeEventListener('resize', handleContainerResize);
    }
  }

  /**
   * Swaps to a different basemap style via a real map.setStyle() call — the
   * thing this method used to avoid entirely (see git history: a prior
   * version re-keyed ~20 same-shaped layers' paint properties in place,
   * because every "flavor" back then was the same layer set in different
   * colors). These four styles (mapStyle.ts's basemapStyles/*.json) aren't
   * that: fiord has 48 layers, liberty has 110, with different ids — a
   * color-only repaint can't express switching between structurally
   * different style documents, so an actual style swap is required.
   *
   * The risk map.setStyle() normally carries — dropping every source/layer
   * this class has added on top for registry layers, flight/density
   * threads, and everything else — is handled by hand instead of avoided:
   * map.getStyle() returns the *live* current style (the current basemap's
   * layers plus every layer added since), so subtracting
   * ALL_BASEMAP_LAYER_IDS / BASEMAP_SOURCE_IDS (mapStyle.ts — the union
   * across all four styles, not just whichever is currently active, since
   * the *previous* style's own layer ids need stripping regardless of which
   * one that was) leaves exactly the non-basemap sources/layers, spliced
   * onto the new style's own basemap sources/layers before the single
   * setStyle() call. Data layers keep their live paint state — any
   * setPaintProperty() already applied to them survives, since getStyle()
   * reflects that, not the original addLayer() call — and never actually
   * leave the map.
   */
  setBasemap(styleId: MapStyleId): void {
    const dark = MAP_STYLES[styleId].dark;
    const newBasemap = baseStyle(styleId);
    const current = this.map.getStyle();

    const keptSources = Object.fromEntries(
      Object.entries(current?.sources ?? {}).filter(([id]) => !BASEMAP_SOURCE_IDS.has(id)),
    );
    const keptLayers = (current?.layers ?? []).filter((l) => !ALL_BASEMAP_LAYER_IDS.has(l.id));

    this.map.setStyle({
      ...newBasemap,
      sources: { ...newBasemap.sources, ...keptSources },
      layers: [...newBasemap.layers, ...keptLayers],
    });

    if (dark !== this.basemapDark) {
      this.basemapDark = dark;
      this.cachedBasemapColor = basemapBackgroundColor(styleId);
      this.repaintThemedLayers();
    }
  }

  /**
   * The basemap's own background colour — casings/halos/strokes are drawn in
   * this so a coloured mark reads against the map instead of floating on it.
   * A cached field, not a live lookup: `repaintThemedLayers()` reads this
   * once per registry layer (dozens, potentially), and re-deriving it every
   * time meant a fresh lookup into the current style's own background layer
   * on every single read of a value that's constant for the entire loop and
   * only ever changes when `basemapDark` flips — see `setBasemap()`, the
   * only place that invalidates it.
   */
  private get basemapColor(): string {
    return this.cachedBasemapColor;
  }

  /** A layer's identity colour for the current basemap. See LayerDefinition.colorLight's comment in layers/types.ts for why this can fall back to `color`. */
  private layerColor(layer: ClientLayer): string {
    return this.basemapDark ? layer.color : (layer.colorLight ?? layer.color);
  }

  /**
   * The brass ring drawn around a "cross-listed corner" match, for the
   * current basemap. See `--color-cross-source-ring` in global.css for the
   * same pairing drawn as a static swatch in the layer panel's legend row —
   * that one keys off the *site* theme, this one off the *basemap*, same
   * split every other themed paint property in this file already makes.
   */
  private get crossSourceRingColor(): string {
    return this.basemapDark ? '#b98f3f' : '#6b5414';
  }

  /**
   * The "near me" overlay's colour, for the current basemap. Reuses the
   * same near-white/near-black pair polygonOutlineColor draws a selection
   * highlight in, rather than a fixed hex: a flat white line (the first
   * version of this) is legible on a dark basemap and nearly invisible on
   * the light one — this marks a person, not a dataset, so unlike
   * layerColor it has no registry-declared colour to fall back to and has
   * to earn its own contrast the same way the polygon highlight does.
   */
  private get nearMeColor(): string {
    return this.basemapDark ? POLYGON_HIGHLIGHT_OUTLINE_DARK : POLYGON_HIGHLIGHT_OUTLINE_LIGHT;
  }

  /**
   * The `circle-stroke-*` `case` branch shared by the three `pointStroke*Expr`
   * methods below, for a "cross-listed corner" match (crossSourceSiteId !=
   * null — see alpr-cross-source.mjs) and its weaker "near miss" sibling
   * (crossSourceNearMiss — see that same file's own comment).
   *
   * Gated by every caller on `layer.crossSource` being declared in the
   * registry (see LayerDefinition.crossSource in layers/types.ts), not on
   * the attribute names alone — see #103. Today only `alpr`/`alpr_reported`
   * name a `crossSource` block, so this `case` is the only place either
   * attribute is probed at all; every other point layer's stroke paint never
   * evaluates it and falls straight through to its plain base value. The
   * generic per-layer pipeline that builds `circle-stroke-*` stays generic —
   * this expression, and the decision to use it, live only here.
   */
  private crossSourceRingCaseExpr<T>(matched: T, nearMiss: T, base: T): maplibregl.ExpressionSpecification {
    return [
      'case',
      ['!=', ['get', 'crossSourceSiteId'], null],
      matched,
      ['==', ['get', 'crossSourceNearMiss'], true],
      nearMiss,
      base,
    ] as unknown as maplibregl.ExpressionSpecification;
  }

  /**
   * A point layer's `circle-stroke-color`. Only a layer whose registry entry
   * names `crossSource` gets the ring `case` branch (see
   * crossSourceRingCaseExpr's own comment); every other point layer gets its
   * plain base colour straight back, with no GL expression to evaluate.
   *
   * A "near miss" shares this exact colour rather than getting a hue of its
   * own: it's the same corroboration idea at lower confidence, not a
   * different kind of fact, so `pointStrokeWidthExpr` and
   * `pointStrokeOpacityExpr` are the only two places a near miss reads as
   * visually weaker than a match.
   */
  private pointStrokeColorExpr(layer: ClientLayer): maplibregl.ExpressionSpecification | string {
    const base = layer.pointStrokeColor ?? this.basemapColor;
    if (!layer.crossSource) return base;
    return this.crossSourceRingCaseExpr(this.crossSourceRingColor, this.crossSourceRingColor, base);
  }

  /**
   * A point layer's `circle-stroke-width`, doubled (roughly) for a matched
   * record and stepped up more modestly for a near miss, on the same
   * emergeFrom→pointsFrom fade every stroke already uses — neither ring may
   * ever appear before `pointsFrom` any more than the base stroke does. Only
   * a `crossSource`-declaring layer (see crossSourceRingCaseExpr's own
   * comment) gets the `case`; every other layer gets the plain base width.
   *
   * The `case` has to sit *inside* the `interpolate` as the value at the
   * `pointsFrom` stop, not the other way around: the style spec allows only
   * one zoom-based interpolate/step per expression, so three separate
   * `interpolate(zoom, …)` branches under one outer `case` — which is what
   * this looked like before — fails validation and silently drops the whole
   * layer (MapLibre logs "Only one zoom-based … subexpression may be used"
   * and emits an `error` event instead of adding it; nothing in the console
   * says "layer not added"). One interpolate, data-driven at its stop.
   */
  private pointStrokeWidthExpr(
    layer: ClientLayer,
    tier: { emergeFrom: number; pointsFrom: number },
  ): maplibregl.ExpressionSpecification {
    return [
      'interpolate',
      ['linear'],
      ['zoom'],
      tier.emergeFrom,
      0,
      tier.pointsFrom,
      layer.crossSource ? this.crossSourceRingCaseExpr(2.2, 1.6, 1.2) : 1.2,
    ] as unknown as maplibregl.ExpressionSpecification;
  }

  /**
   * A point layer's `circle-stroke-opacity`. Every layer's base stroke stays
   * fully opaque (MapLibre's own default) — this exists purely to fade a
   * near-miss ring down against a matched one, since colour and width alone
   * (see the two expressions above) still read close enough at a glance to
   * blur the distinction this attribute exists to keep clear. Only a
   * `crossSource`-declaring layer (see crossSourceRingCaseExpr's own
   * comment) is ever less than fully opaque.
   */
  private pointStrokeOpacityExpr(layer: ClientLayer): maplibregl.ExpressionSpecification | number {
    if (!layer.crossSource) return 1;
    return this.crossSourceRingCaseExpr(1, 0.55, 1);
  }

  /**
   * A point layer's `circle-color` expression — category colour at every
   * zoom if the layer names one, else the plain identity colour. The single
   * source of truth for this expression: used at layer creation, in the
   * theme repaint, and by the glow layer, so the three can never drift apart
   * the way the theme repaint once did (it kept its own copy of the old,
   * zoom-stepped version after the always-on-colour change landed here).
   */
  private pointCircleColor(layer: ClientLayer): maplibregl.ExpressionSpecification | string {
    return layer.categoryColors
      ? ([
          'match',
          ['get', layer.categoryColors.key],
          ...layer.categoryColors.colors.flatMap(({ value, color }) => [value, color]),
          layer.categoryColors.fallback,
        ] as unknown as maplibregl.ExpressionSpecification)
      : this.layerColor(layer);
  }

  /**
   * A polygon layer's colour expression, for both its fill and its outline.
   *
   * Extracted for exactly the reason pointCircleColor above is: this is built
   * once at layer creation and again in the theme repaint, and keeping two
   * copies is what let them drift. A `polygonClick: 'highlight'` layer's
   * expression reads feature-state, so a repaint that rebuilt only the
   * historical-document branch replaced it with a flat colour — every ward
   * painted as if selected, and no way to tell which one actually was, from
   * the first basemap toggle onward.
   */
  private polygonFillColor(layer: ClientLayer): maplibregl.ExpressionSpecification {
    if (layer.polygonClick === 'highlight') {
      // The tint is one layer (vendor_contract) painted onto another
      // (agency_jurisdiction) — Documented vendor contracts and the green
      // wash over jurisdictions with a contract are one feature to the
      // reader, so unticking the source layer has to take the wash with it,
      // not just leave it floating on feature-state that was set once and
      // never revisited.
      const unselected = layer.tintWhenRelated && this.visible.has(layer.tintWhenRelated.layerId)
        ? // Read from feature-state (applyRelatedTint sets it once the
          // target layer's data is in), not a literal id list baked into
          // the expression — the join can finish loading well after this
          // paint property is first set, and feature-state repaints on its
          // own the moment it changes.
          ([
            'case',
            ['boolean', ['feature-state', 'related'], false],
            this.basemapDark ? layer.tintWhenRelated.color : layer.tintWhenRelated.colorLight,
            // The cancelled and contested washes only ever show for a
            // jurisdiction the `related` case above didn't already claim,
            // and applyRelatedTint never sets both of their flags on the
            // same feature — so at most one of the next two branches can
            // ever fire for a given polygon.
            ...(layer.tintWhenRelated.cancelledWhen
              ? [
                  ['boolean', ['feature-state', 'relatedCancelled'], false],
                  this.basemapDark
                    ? layer.tintWhenRelated.cancelledWhen.color
                    : layer.tintWhenRelated.cancelledWhen.colorLight,
                ]
              : []),
            ...(layer.tintWhenRelated.secondaryWhen
              ? [
                  ['boolean', ['feature-state', 'relatedSecondary'], false],
                  this.basemapDark
                    ? layer.tintWhenRelated.secondaryWhen.color
                    : layer.tintWhenRelated.secondaryWhen.colorLight,
                ]
              : []),
            this.basemapDark ? NEUTRAL_POLYGON_DARK : NEUTRAL_POLYGON_LIGHT,
          ] as unknown as maplibregl.ExpressionSpecification)
        : (this.basemapDark ? NEUTRAL_POLYGON_DARK : NEUTRAL_POLYGON_LIGHT);
      return [
        'case',
        [
          'any',
          ['boolean', ['feature-state', 'selected'], false],
          ['boolean', ['feature-state', 'hover'], false],
        ],
        this.layerColor(layer),
        unselected,
      ] as unknown as maplibregl.ExpressionSpecification;
    }
    if (layer.categoryColors) {
      return [
        'match',
        ['get', layer.categoryColors.key],
        ...layer.categoryColors.colors.flatMap(({ value, color }) => [value, color]),
        layer.categoryColors.fallback,
      ] as unknown as maplibregl.ExpressionSpecification;
    }
    return ['coalesce', ['get', 'holcFill'], this.layerColor(layer)] as unknown as maplibregl.ExpressionSpecification;
  }

  /**
   * A `polygonClick: 'highlight'` layer's *outline* colour — deliberately
   * separate from polygonFillColor() above. The fill keeps sharing that
   * expression (the polygon's own identity colour when selected/hovered,
   * NEUTRAL_POLYGON_DARK/LIGHT otherwise); the outline instead pops to
   * POLYGON_HIGHLIGHT_OUTLINE_DARK/LIGHT — see that constant's own comment
   * for why a fixed near-white/near-black reads more clearly than "the same
   * colour, just thicker" once a reader is looking for which one they
   * selected, not what category it belongs to. Only called for
   * `polygonClick: 'highlight'` layers (see addLayer below); every other
   * polygon kind keeps outline === fill, unchanged. Takes no layer argument
   * — unlike polygonFillColor(), only the basemap flavor decides this
   * colour, never the layer's own identity colour.
   */
  private polygonOutlineColor(): maplibregl.ExpressionSpecification {
    return [
      'case',
      [
        'any',
        ['boolean', ['feature-state', 'selected'], false],
        ['boolean', ['feature-state', 'hover'], false],
      ],
      this.basemapDark ? POLYGON_HIGHLIGHT_OUTLINE_DARK : POLYGON_HIGHLIGHT_OUTLINE_LIGHT,
      this.basemapDark ? NEUTRAL_POLYGON_DARK : NEUTRAL_POLYGON_LIGHT,
    ] as unknown as maplibregl.ExpressionSpecification;
  }

  /**
   * A related ward's fill/outline don't just recolour, they sit a step
   * bolder than a plain unselected wash (see the inline comment where this
   * used to live, in addLayer). That bump reads feature-state exactly like
   * the colour does, so it has the same bug the colour had: gate it on the
   * target layer's visibility too, or unticking `vendor_contract` leaves a
   * jurisdiction that's merely gone back to its neutral colour still a
   * hair more opaque/thicker than every other unrelated ward beside it —
   * the hue would disappear but a faint outline of it would not.
   */
  private polygonFillOpacity(
    layer: ClientLayer,
    highlightMode: boolean,
    subtle: boolean,
  ): maplibregl.ExpressionSpecification | number {
    if (highlightMode) {
      const tintActive = layer.tintWhenRelated && this.visible.has(layer.tintWhenRelated.layerId);
      return [
        'case',
        ['boolean', ['feature-state', 'selected'], false],
        subtle ? 0.24 : 0.42,
        ['boolean', ['feature-state', 'hover'], false],
        0.28,
        ...(tintActive ? [['boolean', ['feature-state', 'related'], false], 0.34] : []),
        // A cancellation is as settled a fact as an active contract, so it
        // reads at the same strength as `related` — only the colour tells
        // the two apart.
        ...(tintActive && layer.tintWhenRelated?.cancelledWhen
          ? [['boolean', ['feature-state', 'relatedCancelled'], false], 0.34]
          : []),
        // A smaller bump than the other two — legible as "something's here"
        // at a glance without reading as equally settled a fact as either.
        ...(tintActive && layer.tintWhenRelated?.secondaryWhen
          ? [['boolean', ['feature-state', 'relatedSecondary'], false], 0.26]
          : []),
        0.16,
      ] as unknown as maplibregl.ExpressionSpecification;
    }
    if (layer.blockAggregate) {
      return [
        'interpolate',
        ['linear'],
        ['zoom'],
        layer.blockAggregate.blocksUntil,
        0,
        layer.blockAggregate.detailFrom,
        0.42,
      ] as unknown as maplibregl.ExpressionSpecification;
    }
    return 0.42;
  }

  /** Outline counterpart to polygonFillOpacity — see its comment. */
  private polygonLineWidth(
    layer: ClientLayer,
    highlightMode: boolean,
    subtle: boolean,
  ): maplibregl.ExpressionSpecification | number {
    if (!highlightMode) return 1.1;
    const tintActive = layer.tintWhenRelated && this.visible.has(layer.tintWhenRelated.layerId);
    return [
      'case',
      ['boolean', ['feature-state', 'selected'], false],
      subtle ? 1.6 : 2.5,
      ['boolean', ['feature-state', 'hover'], false],
      1.8,
      ...(tintActive ? [['boolean', ['feature-state', 'related'], false], 2.2] : []),
      ...(tintActive && layer.tintWhenRelated?.cancelledWhen
        ? [['boolean', ['feature-state', 'relatedCancelled'], false], 2.2]
        : []),
      ...(tintActive && layer.tintWhenRelated?.secondaryWhen
        ? [['boolean', ['feature-state', 'relatedSecondary'], false], 1.9]
        : []),
      1.1,
    ] as unknown as maplibregl.ExpressionSpecification;
  }

  /**
   * Re-keys every basemap-dependent paint property after `basemapDark`
   * changes: a colour chosen while dark was current — a layer's own
   * identity colour, or a casing drawn in the basemap's own background —
   * doesn't update itself just because the basemap did. Only colour
   * properties are re-set; width/opacity/blur are zoom- or data-driven, not
   * background-driven, and were already correct.
   *
   * Cone sprites are handled differently: they're cached bitmap images
   * (ensureConeSprite), not a paint property, so there's nothing here to
   * call setPaintProperty on. refresh() regenerates them by re-deriving
   * that layer's cone source data, which calls ensureConeSprite again with
   * the (now current) basemap colour baked into a freshly-generated sprite.
   */
  private repaintThemedLayers(): void {
    for (const layer of this.layers) {
      if (this.map.getLayer(`${layer.id}-fill`)) {
        if (!layer.categoryColors) {
          const fill = this.polygonFillColor(layer);
          this.map.setPaintProperty(`${layer.id}-fill`, 'fill-color', fill);
          // The outline shares the fill's expression for every polygon kind
          // except `polygonClick: 'highlight'` (see addLayer's own comment
          // and polygonOutlineColor) — that one pops to a fixed near-white/
          // near-black instead, which is itself basemap-dependent and needs
          // the same re-key here, just from a different source.
          if (this.map.getLayer(`${layer.id}-outline`)) {
            const outline = layer.polygonClick === 'highlight' ? this.polygonOutlineColor() : fill;
            this.map.setPaintProperty(`${layer.id}-outline`, 'line-color', outline);
          }
        }
        if (this.map.getLayer(`${layer.id}-labels`)) {
          this.map.setPaintProperty(`${layer.id}-labels`, 'text-halo-color', this.basemapColor);
        }
      }

      // Type-checked, not just existence-checked: a `markerIcon` layer draws
      // its records as a symbol layer under the same `-points` id, and asking
      // MapLibre for a circle paint property on a symbol layer throws out of
      // setPaintProperty — which would abort this loop and leave every layer
      // after it painted for the previous basemap. Glyphs are re-themed by
      // refreshMarkerIcons() below instead, since their colour is baked into
      // a bitmap rather than held in a paint property.
      if (this.map.getLayer(`${layer.id}-points`)?.type === 'circle') {
        const circleColor = this.pointCircleColor(layer);
        this.map.setPaintProperty(`${layer.id}-points`, 'circle-color', circleColor);
        this.map.setPaintProperty(
          `${layer.id}-points`,
          'circle-stroke-color',
          this.pointStrokeColorExpr(layer),
        );
        // The glow shares the dot's exact colour (see pointCircleColor) —
        // only ever the categoryColors match branch, since the glow layer
        // only exists when a layer names categoryColors, so this is a no-op
        // in practice today. Kept in step anyway so a future layer that
        // pairs categoryColors with the plain layerColor() fallback branch
        // doesn't go stale on a theme toggle the way `-points` itself just did.
        if (this.map.getLayer(`${layer.id}-points-glow`)) {
          this.map.setPaintProperty(`${layer.id}-points-glow`, 'circle-color', circleColor);
        }
      }

      if (this.map.getLayer(`${layer.id}-line`)) {
        this.map.setPaintProperty(`${layer.id}-line`, 'line-color', this.layerColor(layer));
        if (this.map.getLayer(`${layer.id}-line-casing`)) {
          this.map.setPaintProperty(`${layer.id}-line-casing`, 'line-color', this.basemapColor);
        }
      }

      if (layer.bearingKey && this.map.getSource(this.coneSourceId(layer.id))) {
        this.refresh(layer.id);
      }
    }

    // The transient selection overlays bake a colour at creation the same way
    // a layer does, and they outlive a basemap toggle because the toggle
    // doesn't clear the reader's selection.
    const owner = this.layers.find((l) => l.id === this.relatedOverlayOwner);
    if (owner) {
      const color = this.layerColor(owner);
      if (this.map.getLayer(RELATED_BUILDINGS_GLOW_LAYER)) {
        this.map.setPaintProperty(RELATED_BUILDINGS_GLOW_LAYER, 'circle-color', color);
      }
      if (this.map.getLayer(RELATED_BUILDINGS_LAYER)?.type === 'circle') {
        this.map.setPaintProperty(RELATED_BUILDINGS_LAYER, 'circle-color', color);
        this.map.setPaintProperty(RELATED_BUILDINGS_LAYER, 'circle-stroke-color', this.basemapColor);
      }
      if (this.map.getLayer(RELATED_PATHS_LAYER)) {
        this.map.setPaintProperty(RELATED_PATHS_LAYER, 'line-color', color);
      }
      if (this.map.getLayer(RELATED_IMPACT_LAYER)) {
        this.map.setPaintProperty(RELATED_IMPACT_LAYER, 'circle-stroke-color', color);
      }
    }

    // The near-me overlay's own colour isn't in the loop above — it has no
    // owning `layer` to iterate from, ensureNearMeLayers creates it lazily
    // and independent of any registry layer. Same re-key, done once here.
    if (this.map.getLayer(NEARME_PATHS_LAYER)) {
      const nearMeColor = this.nearMeColor;
      this.map.setPaintProperty(NEARME_PATHS_LAYER, 'line-color', nearMeColor);
      this.map.setPaintProperty(NEARME_IMPACT_LAYER, 'circle-stroke-color', nearMeColor);
      this.map.setPaintProperty(NEARME_ORIGIN_GLOW_LAYER, 'circle-color', nearMeColor);
      this.map.setPaintProperty(NEARME_ORIGIN_LAYER, 'circle-color', nearMeColor);
      this.map.setPaintProperty(NEARME_ORIGIN_LAYER, 'circle-stroke-color', this.basemapColor);
    }

    void this.refreshMarkerIcons();
  }

  /**
   * Re-bake every `markerIcon` glyph for the current basemap.
   *
   * Same problem ensureConeSprite has, and the same shape of answer: the
   * glyph is a bitmap with the layer colour and the basemap's own background
   * disc painted into it, so a repaint cannot fix it — a new image under a
   * new theme-suffixed id has to be generated and pointed at. The cached
   * expression is dropped first because it names the *old* theme's image ids.
   */
  private async refreshMarkerIcons(): Promise<void> {
    // Whose glyph the overlay is currently drawing — read off the live owner,
    // not off whichever layer declares the field first.
    const relatedGlyphOwner = this.layers.find((l) => l.id === this.relatedOverlayOwner)
      ?.relatedBuildings?.layerId;
    const iconLayers = this.layers.filter((l) => l.markerIcon);
    // Each glyph is an independent decode-and-raster; nothing here depends on
    // the previous one's result, and this runs on every basemap toggle.
    await Promise.all(
      iconLayers.map((layer) => {
        this.markerExpressions.delete(layer.id);
        return this.cacheMarkerExpression(layer);
      }),
    );
    for (const layer of iconLayers) {
      const expression = this.markerExpressions.get(layer.id);
      if (!expression) continue;
      if (this.map.getLayer(`${layer.id}-points`)?.type === 'symbol') {
        this.map.setLayoutProperty(`${layer.id}-points`, 'icon-image', expression as never);
      }
      if (
        relatedGlyphOwner === layer.id &&
        this.map.getLayer(RELATED_BUILDINGS_LAYER)?.type === 'symbol'
      ) {
        this.map.setLayoutProperty(RELATED_BUILDINGS_LAYER, 'icon-image', expression as never);
      }
    }
  }

  /**
   * The style layers a set of registry layers currently has on the map, for
   * the given id suffixes. `-points` alone is the dot/glyph layers, which sit
   * above every polygon (see bindHighlightSelect); the full set is everything
   * a tap can select a record on (see bindInteractions).
   */
  private styleLayerIds(suffixes: string[], from: ClientLayer[] = this.layers): string[] {
    return from
      .flatMap((l) => suffixes.map((s) => `${l.id}${s}`))
      .filter((id) => this.map.getLayer(id));
  }

  /**
   * Undo a tap-to-select: back to the pre-tap camera, detail panel closed,
   * and any `polygonClick: 'highlight'` ward released. This is the one
   * shared "undo" both a tap on empty ground and a second tap on an
   * already-selected ward route through, so a highlighted polygon can never
   * outlive its own selection — including when the deselecting tap landed
   * somewhere this layer's own click handler never sees.
   */
  private clearSelection() {
    if (this.preSelectCamera) {
      this.easeToCamera(this.preSelectCamera, REDUCED_MOTION ? 0 : 500);
      this.preSelectCamera = null;
    }
    this.releaseHighlight();
    this.releaseHover();
    this.events.onSelect?.(null);
  }

  /**
   * Resolve once the map is ready to accept sources and layers.
   *
   * This tracks the one-shot `load` event with a flag rather than asking
   * `isStyleLoaded()`. That method reports false whenever *any* source is
   * still loading — including a source we ourselves just added — so a second
   * layer arriving moments after the first would see false, wait on
   * `once('load')` for an event that had already fired, and hang forever.
   * The larger the layer, the more reliably it lost that race, which is why
   * the camera layer was the one that never appeared.
   */
  private ready(): Promise<void> {
    if (this.hasLoaded) return Promise.resolve();
    return new Promise((resolve) => this.map.once('load', () => resolve()));
  }

  private sourceId = (layerId: string) => `src-${layerId}`;

  /**
   * Attributes live in a nested object so the schema stays readable, but
   * MapLibre expressions and the filter UI both want flat keys. Flatten a copy
   * for the map; the panel still reads the structured original.
   */
  private flatten(features: LoadedFeature[]): FeatureCollection {
    return {
      type: 'FeatureCollection',
      features: features.map((f) => ({
        type: 'Feature',
        geometry: f.geometry,
        properties: { ...f.properties.attributes, ...f.properties, attributes: undefined },
      })) as Feature[],
    };
  }

  /**
   * Coverage cones, one feature per sector.
   *
   * Kept in their own source rather than alongside the dots because the dot
   * source clusters: a camera whose `direction` names three headings needs
   * three cones, and exploding it in the clustered source would inflate every
   * cluster count and the record list with records that do not exist.
   */
  private coneFeatures(layer: ClientLayer, features: LoadedFeature[]): FeatureCollection {
    if (!layer.bearingKey) return { type: 'FeatureCollection', features: [] };
    const cones: Feature[] = [];
    for (const f of features) {
      if (f.geometry.type !== 'Point') continue;
      for (const sector of parseSectors(f.properties.attributes[layer.bearingKey])) {
        const sprite = this.ensureConeSprite(layer, sector.arc ?? DEFAULT_CONE_ARC);
        if (!sprite) continue;
        cones.push({
          type: 'Feature',
          geometry: f.geometry,
          properties: {
            id: f.properties.id,
            [BEARING_PROP]: sector.bearing,
            [CONE_PROP]: sprite,
          },
        } as Feature);
      }
    }
    return { type: 'FeatureCollection', features: cones };
  }

  /**
   * Cone sprite for one arc width, generated once and reused.
   *
   * Generated rather than shipped as an asset: it carries the layer's own
   * colour, and the project loads images from nowhere but itself. One sprite
   * per distinct arc, so a recorded 45° sector and a default 50° cone are
   * genuinely different shapes rather than the same picture relabelled.
   *
   * The apex sits at the sprite's centre so `icon-rotate` pivots on the
   * camera's own coordinate instead of swinging the cone around it.
   */
  /**
   * Shared scaffold behind every generated, theme-baked sprite: cache lookup
   * by id, canvas sizing at a fixed pixel ratio, and the `addImage` call.
   * Callers supply the cache id (theme suffix included) and the drawing
   * itself — see ensureConeSprite and ensureMarkerIcon below for why these
   * sprites are generated and cached this way in the first place.
   */
  private ensureSprite(
    id: string,
    px: number,
    draw: (ctx: CanvasRenderingContext2D, px: number) => void,
  ): string | null {
    if (this.map.hasImage(id)) return id;

    const pixelRatio = 2;
    const canvas = document.createElement('canvas');
    canvas.width = px;
    canvas.height = px;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    draw(ctx, px);

    this.map.addImage(id, ctx.getImageData(0, 0, px, px), { pixelRatio });
    return id;
  }

  private ensureConeSprite(layer: ClientLayer, arc: number): string | null {
    const rounded = Math.round(arc);
    // Theme suffix, not just layer+arc: the sprite is a baked bitmap, colour
    // included, so a basemap change needs a genuinely different cached image
    // rather than a repaint — see repaintThemedLayers(), which calls
    // refresh() for any layer with bearingKey specifically so this runs
    // again with the new basemapDark and produces a freshly-coloured sprite
    // under a new id instead of reusing the stale one.
    const id = `${layer.id}-cone-${rounded}-${this.basemapDark ? 'dark' : 'light'}`;
    return this.ensureSprite(id, 52 * 2, (ctx, px) => {
      const centre = px / 2;
      const radius = px * 0.46;
      const up = -Math.PI / 2;
      ctx.beginPath();
      if (rounded >= 360) {
        // Recorded as covering every direction, so there is no cone to point.
        ctx.arc(centre, centre, radius, 0, Math.PI * 2);
      } else {
        const half = ((rounded / 2) * Math.PI) / 180;
        ctx.moveTo(centre, centre);
        ctx.arc(centre, centre, radius, up - half, up + half);
        ctx.closePath();
      }
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = this.layerColor(layer);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = this.layerColor(layer);
      ctx.lineWidth = px * 0.03;
      ctx.stroke();
    });
  }

  private coneSourceId = (layerId: string) => `src-${layerId}-cones`;

  /**
   * A lucide glyph, rasterised into a map image in the layer's own colour.
   *
   * Same reasoning as ensureConeSprite above — generated rather than shipped,
   * cached under a theme-suffixed id because the bitmap bakes its colour in,
   * and drawn on a disc so a line-art glyph stays legible over an arbitrary
   * basemap instead of dissolving into whatever is under it.
   *
   * Async where the cone is not: an SVG has to decode through an Image
   * before a canvas will draw it. Callers await this before adding the
   * symbol layer that references the id, so MapLibre never renders a frame
   * against a missing image.
   */
  private async ensureMarkerIcon(
    layer: ClientLayer,
    iconName: string,
    colorOverride?: { color: string; colorLight: string },
  ): Promise<string | null> {
    const node = MARKER_ICONS[iconName];
    if (!node) return null;
    const color = colorOverride
      ? this.basemapDark
        ? colorOverride.color
        : colorOverride.colorLight
      : this.layerColor(layer);
    // A colour-overridden glyph needs its own cached bitmap even when it
    // shares an icon name with a plain one — Suspended and Terminated both
    // draw FileX, in the same grey, and share a bake; Active's FileText
    // would otherwise collide with this same layer's plain, uncoloured
    // FileText bake and lose its colour on whichever finished baking last.
    const colorSuffix = colorOverride ? `-${color.replace('#', '')}` : '';
    const id = `${layer.id}-icon-${iconName}${colorSuffix}-${this.basemapDark ? 'dark' : 'light'}`;
    if (this.map.hasImage(id)) return id;

    const px = 30 * 2;
    const inner = px * 0.62;

    // Built by lucide's own createElement, which supplies xmlns, viewBox, fill
    // and the stroke-lin* defaults, and recurses into nested children — a
    // hand-rolled `[tag, attrs] -> markup` pass silently dropped those. The
    // element is detached; serialising it never attaches a node to the
    // document, which is the property this needs.
    const el = createElement(node, {
      width: String(inner),
      height: String(inner),
      stroke: color,
      'stroke-width': '2.25',
    });
    const svg = new XMLSerializer().serializeToString(el);

    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    try {
      await img.decode();
    } catch {
      return null;
    }

    return this.ensureSprite(id, px, (ctx, px) => {
      // The disc the glyph sits on: the basemap's own background, ringed in
      // the layer colour — the same casing logic a point layer's dots already
      // use (see pointStrokeColor), so a glyph and a dot read as the same
      // family of mark rather than two unrelated styles.
      const centre = px / 2;
      ctx.beginPath();
      ctx.arc(centre, centre, px * 0.46, 0, Math.PI * 2);
      ctx.fillStyle = this.basemapColor;
      ctx.fill();
      ctx.lineWidth = px * 0.06;
      ctx.strokeStyle = color;
      ctx.stroke();
      ctx.drawImage(img, centre - inner / 2, centre - inner / 2, inner, inner);
    });
  }

  /** Resolve this layer's glyph expression once, into markerExpressions. */
  private async cacheMarkerExpression(layer: ClientLayer) {
    if (!layer.markerIcon || this.markerExpressions.has(layer.id)) return;
    const expression = await this.markerIconExpression(layer);
    if (expression) this.markerExpressions.set(layer.id, expression);
  }

  /**
   * Load every glyph a `markerIcon` layer can draw, and return the MapLibre
   * expression that picks one per record. Null if the layer declares none,
   * or if not one of its named icons resolved — in which case the caller
   * falls back to plain dots rather than drawing a layer of blanks.
   */
  private async markerIconExpression(
    layer: ClientLayer,
  ): Promise<maplibregl.ExpressionSpecification | string | null> {
    const spec = layer.markerIcon;
    if (!spec) return null;

    const fallbackId = await this.ensureMarkerIcon(layer, spec.icon);
    if (!spec.byValue) return fallbackId;

    const pairs: string[] = [];
    for (const [value, iconName] of Object.entries(spec.byValue.icons)) {
      const id = await this.ensureMarkerIcon(layer, iconName, spec.byValue.colors?.[value]);
      if (id) pairs.push(value, id);
    }
    if (!pairs.length) return fallbackId;
    if (!fallbackId) return null;
    return [
      'match',
      ['get', spec.byValue.key],
      ...pairs,
      fallbackId,
    ] as unknown as maplibregl.ExpressionSpecification;
  }

  /**
   * The lowest of our own dot layers currently on the map, if any.
   *
   * An arrival point, not the final order. A line layer added over the
   * cameras would draw across the dots standing along it, and its click
   * target — deliberately 20px wide so a line can be tapped — would swallow
   * every click meant for a camera, so areas and lines land beneath the dots
   * already present rather than on top of them.
   *
   * What this cannot do is reason about layers that are not on the map yet,
   * which is every layer a reader has not ticked. `restack()` settles the
   * order properly once the layer is complete; this just keeps the moment
   * before that from looking wrong.
   */
  private beneathDots(): string | undefined {
    const marks = ['-points', '-cones'];
    return this.firstStyleLayer((id) => marks.some((suffix) => id.endsWith(suffix)));
  }

  /**
   * Style layer ids, bottom to top.
   *
   * `getLayersOrder()` and not `getStyle().layers`: getStyle() runs
   * Style.serialize(), which serialises every layer and then deep-clones every
   * spec — and the serialisation cache is dropped by any setPaintProperty or
   * setLayoutProperty, so consecutive calls never hit it. Every caller here
   * reads nothing but the id, and this one returns a copy of the id array.
   */
  private styleOrder(): string[] {
    return this.map.getLayersOrder();
  }

  private firstStyleLayer(match: (id: string) => boolean): string | undefined {
    return this.styleOrder().find(match);
  }

  /**
   * Put every style layer we own back into a fixed order, bottom to top.
   *
   * The insertion points above get a layer close to the right place as it
   * arrives, but they can only ever reason about what is already on the map.
   * Layers arrive as a reader ticks them, so on their own they produce a
   * stacking that depends on the order the boxes were ticked in — the same two
   * layers land in one order or the other depending on which was switched on
   * first, which is not a thing a reader should have to know.
   *
   * So after every addition the whole stack is sorted. The order is:
   *
   *   1. By category, in the order the layer panel lists them: what drew
   *      the lines, what was built on them, what records, who acts. The map
   *      and the panel then say the same thing in two ways, and the layers a
   *      reader came for sit on top of the context they need to be read
   *      against rather than under it.
   *   2. Then by shape within a category: areas, then lines, then dots. A dot
   *      is one exact position and the smallest target on the map, so nothing
   *      from its own category is allowed over it.
   *
   * `sort` is stable, so each layer's own internal sequence — casing, core,
   * hit target, cones, dots — survives untouched inside its band.
   */
  private restack() {
    /** Areas first, then lines, then the dots that must stay clickable. */
    const byShape = { polygon: 0, line: 1, point: 2 };

    const owned = this.styleOrder()
      .map((styleId) => {
        const layer = this.layers.find((l) => styleId.startsWith(`${l.id}-`));
        if (!layer) return null;
        return { styleId, layer };
      })
      .filter((o) => o !== null);

    owned.sort(
      (a, b) => a.layer.stackRank - b.layer.stackRank || byShape[a.layer.geometry] - byShape[b.layer.geometry],
    );

    // Bottom to top, each moved to the top in turn: the last one moved ends up
    // highest, so walking the desired order forwards produces it exactly.
    for (const { styleId } of owned) this.map.moveLayer(styleId);

    // The selection overlays belong to no registry layer, so the sort above
    // never sees them and every restack() — one fires whenever a layer is
    // switched on — would otherwise leave a highlighted building buried under
    // the jurisdiction fill that was just moved over it.
    this.pinOverlays();
  }

  /**
   * Lift the selection overlays above every registry layer, in OVERLAY_STACK
   * then NEARME_STACK order — the only place either order is applied, as
   * both constants are the only place their order is stated. Called from
   * restack(), ensureRelatedLayers(), and ensureNearMeLayers().
   */
  private pinOverlays() {
    for (const styleId of [...OVERLAY_STACK, ...NEARME_STACK]) {
      if (this.map.getLayer(styleId)) this.map.moveLayer(styleId);
    }
  }

  private blockSourceId = (layerId: string) => `src-${layerId}-blocks`;

  /**
   * Parcels gathered into a grid cell, as squares carrying a count and the
   * commonest category inside them.
   *
   * Derived in the browser, from whichever parcels the active filters leave
   * standing: a decade filter that hides most of a cell's covenants has to
   * shrink or empty that cell, not leave a block claiming parcels the map no
   * longer shows underneath it.
   */
  private blockFeatures(layer: ClientLayer, features: LoadedFeature[]): FeatureCollection {
    if (!layer.blockAggregate) return EMPTY_FC;
    const categoryKey = layer.categoryColors?.key;
    const sites = features
      .filter((f) => f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')
      .map((f) => {
        const [lng, lat] = representativePoint(f.geometry);
        const category = categoryKey ? (f.properties.attributes[categoryKey] as string | null) : null;
        return { lng, lat, category: category ?? null };
      });
    return {
      type: 'FeatureCollection',
      features: groupBlocks(sites, layer.blockAggregate.cellMeters).map((block) => ({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [block.west, block.south],
              [block.east, block.south],
              [block.east, block.north],
              [block.west, block.north],
              [block.west, block.south],
            ],
          ],
        },
        properties: {
          [BLOCK_COUNT_PROP]: block.count,
          ...(categoryKey ? { [categoryKey]: block.category } : {}),
        },
      })) as Feature[],
    };
  }

  /**
   * Fetch a layer's records into `this.data` without drawing it as a map
   * layer or touching `this.visible` — for a cross-layer lookup
   * (relatedBuildings) that needs a record from a layer the reader may never
   * have switched on. A building the reader can't otherwise see is still the
   * right thing to highlight from a jurisdiction they did select; a whole
   * second point layer silently appearing on the map because of that
   * selection would not be.
   */
  private async ensureDataLoaded(layerId: LayerId): Promise<LoadedFeature[]> {
    const layer = this.layers.find((l) => l.id === layerId);
    if (!layer) return [];
    try {
      return await this.fetchFeatures(layer);
    } catch {
      return [];
    }
  }

  /**
   * The single fetch-and-store path. Both entry points — ensureDataLoaded for
   * a cross-layer lookup and loadLayer for drawing — go through here, so a
   * layer is downloaded and parsed at most once no matter how many callers
   * want it or how closely together they ask.
   */
  private fetchFeatures(layer: ClientLayer): Promise<LoadedFeature[]> {
    const held = this.data.get(layer.id);
    if (held) return Promise.resolve(held);
    const pending = this.inFlight.get(layer.id);
    if (pending) return pending;

    const load = (async () => {
      const res = await fetch(layer.dataPath);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const collection = await res.json();
      const features = (collection.features ?? []) as LoadedFeature[];
      this.data.set(layer.id, features);
      const ids = new Map<string, LoadedFeature>();
      for (const f of features) ids.set(f.properties.id, f);
      this.byId.set(layer.id, ids);
      return features;
    })().finally(() => this.inFlight.delete(layer.id));

    this.inFlight.set(layer.id, load);
    return load;
  }

  /**
   * The value a relation joins on from *this* record — the record's own `id`
   * unless the registry names an attribute instead. Null when the named
   * attribute is absent, which callers must treat as "no join to test" rather
   * than "nothing joined": the difference is an untested absence versus a
   * tested one, and §1c turns on it.
   */
  private joinValueOf(feature: LoadedFeature, fromKey?: string): string | null {
    if (!fromKey) return feature.properties.id;
    const value = feature.properties.attributes[fromKey];
    return value == null ? null : String(value);
  }

  /** One record by id, O(1) against the index fetchFeatures built. */
  private featureById(layerId: string, id: string): LoadedFeature | undefined {
    return this.byId.get(layerId)?.get(id);
  }

  /**
   * Every record of `layerId` grouped by one attribute value — the join a
   * registry entry declares. Built once per layer/key pair and reused, so a
   * card that lists a department's readers stops re-filtering the whole layer
   * on every pointer move.
   */
  private joinIndex(layerId: string, key: string): Map<string, LoadedFeature[]> {
    const cacheKey = `${layerId}::${key}`;
    const cached = this.joinIndexes.get(cacheKey);
    if (cached) return cached;
    const index = new Map<string, LoadedFeature[]>();
    for (const f of this.data.get(layerId) ?? []) {
      const value = f.properties.attributes[key];
      if (value == null) continue;
      const bucket = index.get(String(value));
      if (bucket) bucket.push(f);
      else index.set(String(value), [f]);
    }
    this.joinIndexes.set(cacheKey, index);
    return index;
  }

  /**
   * Marks every polygon of `layer` that has at least one match in
   * `layer.tintWhenRelated`'s target with a `related` feature-state flag,
   * which polygonFillColor reads (alongside the target layer's on/off
   * state — see repaintTintDependents). Loads the target layer's data first
   * if it isn't already in `this.data` — ensureDataLoaded's own cross-layer
   * path, so the join is ready the moment a reader does switch that layer
   * on, rather than racing a fetch at toggle time — and only then builds
   * the join index, so a call that runs before the fetch completes can't
   * poison joinIndex's cache with an empty result.
   */
  private async applyRelatedTint(layer: ClientLayer): Promise<void> {
    const rel = layer.tintWhenRelated;
    if (!rel) return;
    await this.ensureDataLoaded(rel.layerId);
    const index = this.joinIndex(rel.layerId, rel.joinKey);
    const src = this.sourceId(layer.id);
    for (const feature of this.data.get(layer.id) ?? []) {
      const value = this.joinValueOf(feature, rel.fromKey);
      const matches = value != null ? index.get(value) : undefined;
      // `some`, not `has`/length: a jurisdiction with one terminated and one
      // still-active contract on record should keep glowing for the one that
      // is — excludeWhen drops individual matches from counting, not the
      // whole bucket the moment any of them has ended.
      const related = matches?.some(
        (m) =>
          !rel.excludeWhen ||
          !rel.excludeWhen.values.includes(String(m.properties.attributes[rel.excludeWhen.key])),
      );
      // Ranked below `related`, above `relatedSecondary`: a confirmed
      // cancellation outranks a merely-reported one when a jurisdiction
      // somehow has both and nothing active.
      const relatedCancelled =
        !related &&
        rel.cancelledWhen &&
        matches?.some((m) => rel.cancelledWhen!.values.includes(String(m.properties.attributes[rel.cancelledWhen!.key])));
      // Independent of the checks above, not a fallback from them: either
      // one already outranks the contested wash (see polygonFillColor), so
      // this only ever ends up mattering for a jurisdiction where neither
      // does.
      const relatedSecondary =
        !related &&
        !relatedCancelled &&
        rel.secondaryWhen &&
        matches?.some((m) => rel.secondaryWhen!.values.includes(String(m.properties.attributes[rel.secondaryWhen!.key])));
      if (related || relatedCancelled || relatedSecondary) {
        this.map.setFeatureState(
          { source: src, id: feature.properties.id },
          { related: !!related, relatedCancelled: !!relatedCancelled, relatedSecondary: !!relatedSecondary },
        );
      }
    }
  }

  /** Fetch a layer's GeoJSON the first time it is switched on (spec §8, lazy load). */
  async loadLayer(layer: ClientLayer): Promise<void> {
    if (this.loading.has(layer.id)) return;
    // Having the records is not the same as having drawn them:
    // ensureDataLoaded() fetches a layer for a cross-layer lookup without
    // adding a source, so a layer can sit in `this.data` having never been
    // drawn. Keying the early return on the data alone meant a reader who
    // selected a jurisdiction first — which preloads the buildings — then
    // ticked the buildings layer on got nothing at all: no source, no dots,
    // no onLayerReady, and a checkbox that appeared to do nothing.
    if (this.data.has(layer.id) && this.map.getSource(this.sourceId(layer.id))) return;
    this.loading.add(layer.id);
    try {
      const features = await this.fetchFeatures(layer);
      await this.ready();
      // Glyphs before the layer that references them: MapLibre would warn and
      // draw nothing for an icon-image whose image is still decoding.
      await this.cacheMarkerExpression(layer);
      // A hover card that counts another layer's records has to have them, or
      // it would report "none reported" for a layer that simply hasn't
      // downloaded — a false absence, on the one subject where an absence is
      // itself read as a finding. Not awaited: the card guards on this too,
      // and a hover is many seconds away from a layer switching on.
      if (layer.hoverCard?.related) void this.ensureDataLoaded(layer.hoverCard.related.layerId);
      // Whatever the filters already say, not the whole layer. The controls are
      // on the page before the data is, so a reader can tick a value under a
      // layer that is still switched off — and if the first paint ignored that
      // tick, the map would draw every record while the counter beside it said
      // four, and clearing the filter would appear to do nothing because
      // nothing had ever been filtered.
      this.addLayer(layer, this.filteredFeatures(layer.id));
      // Every geometry returns from its own branch of addLayer, so the sort
      // goes here — the one place all of them come back to — rather than at
      // three separate exits where the next new geometry would forget it.
      this.restack();
      this.events.onLayerReady?.(layer.id, features);
    } catch (err) {
      this.events.onError?.(layer.id, err instanceof Error ? err.message : String(err));
    } finally {
      this.loading.delete(layer.id);
    }
  }


  private addLayer(layer: ClientLayer, features: LoadedFeature[]) {
    const src = this.sourceId(layer.id);
    if (this.map.getSource(src)) return;
    const tier = scaleOf(layer);

    // Never clustered. The source holds one feature per record at every zoom,
    // which is what lets the record list, the counter and the dots agree
    // without the special-casing a clustered source used to need.
    //
    // promoteId lets MapLibre's feature-state track a record by the same
    // stable id the rest of the app already uses, rather than an internal
    // index that would drift if the source ever reloads in a different
    // order. Only polygonClick: 'highlight' layers read feature-state today,
    // but every source carries a unique id already, so setting this once
    // here costs nothing for the layers that don't.
    this.map.addSource(src, { type: 'geojson', data: this.flatten(features), promoteId: 'id' });

    if (layer.geometry === 'polygon') {
      const under = this.beneathDots();
      const highlightMode = layer.polygonClick === 'highlight';
      // How loudly a selected polygon reads. Declared by the layer rather than
      // inferred from whether it happens to carry a `relatedBuildings` — that
      // test got the right answer for the one layer that has both, but it is
      // an editorial judgement about emphasis reading a data-relation field,
      // and the next layer to declare one would inherit a look it never asked
      // for.
      const subtle = layer.selectedEmphasis === 'subtle';
      // Fill and outline share one expression — see polygonFillColor for
      // which of the three it picks and why. The exception is a
      // `polygonClick: 'highlight'` layer's *outline*: see
      // polygonOutlineColor's own comment for why that one pops to a fixed
      // near-white/near-black instead of sharing polygonColor.
      const polygonColor = this.polygonFillColor(layer);
      const outlineColor = highlightMode ? this.polygonOutlineColor() : polygonColor;

      // The grid stands under the parcels and fades out exactly as they fade
      // in, so the two are never both at full strength over the same ground.
      // Added first: each later addLayer(..., under) inserts closer to the
      // dots than the one before it, so the grid ends up bottom-most of the
      // pair and the parcels draw over it.
      if (layer.blockAggregate) {
        const { blocksUntil, detailFrom } = layer.blockAggregate;
        const blockSrc = this.blockSourceId(layer.id);
        this.map.addSource(blockSrc, { type: 'geojson', data: this.blockFeatures(layer, features) });
        this.map.addLayer(
          {
            id: `${layer.id}-blocks-fill`,
            type: 'fill',
            source: blockSrc,
            // Never drawn once parcels are fully resolved — a real perf
            // saving, not just a faded-out one, unlike the parcels below.
            maxzoom: detailFrom,
            paint: {
              'fill-color': polygonColor,
              // A zoom-and-property function: the outer interpolate's stop
              // outputs are themselves an interpolate on the count, rather
              // than multiplying two independent zoom/property expressions —
              // MapLibre only allows `["zoom"]` as the direct input to a
              // top-level `step`/`interpolate`, never composed inside another
              // expression. A cell with one covenant is a thinner claim than
              // a cell with forty; held well under full strength either way.
              'fill-opacity': [
                'interpolate',
                ['linear'],
                ['zoom'],
                blocksUntil,
                ['interpolate', ['linear'], ['get', BLOCK_COUNT_PROP], 1, 0.3, 10, 0.48, 50, 0.62],
                detailFrom,
                0,
              ] as unknown as maplibregl.ExpressionSpecification,
            },
          },
          under,
        );
        this.map.addLayer(
          {
            id: `${layer.id}-blocks-outline`,
            type: 'line',
            source: blockSrc,
            maxzoom: detailFrom,
            paint: {
              'line-color': polygonColor,
              'line-width': 1,
              'line-opacity': [
                'interpolate',
                ['linear'],
                ['zoom'],
                blocksUntil,
                0.75,
                detailFrom,
                0,
              ] as unknown as maplibregl.ExpressionSpecification,
            },
          },
          under,
        );
        // Not bound to click or search: see groupBlocks's own comment. The
        // parcel below is the record; this is a shape drawn over several.
      }

      this.map.addLayer(
        {
          id: `${layer.id}-fill`,
          type: 'fill',
          source: src,
          paint: {
            'fill-color': polygonColor,
            // Never removed by zoom, only faded — same reason the ALPR dots
            // are never cut by a minzoom either (see scaleOf's own comment):
            // the accessible record list reads every parcel at every zoom, so
            // the parcel itself has to still be there to fade back in, not
            // be swapped out for the grid and reinstated later.
            'fill-opacity': this.polygonFillOpacity(layer, highlightMode, subtle),
          },
        },
        under,
      );
      this.map.addLayer(
        {
          id: `${layer.id}-outline`,
          type: 'line',
          source: src,
          paint: {
            'line-color': outlineColor,
            // A hovered ward's border thickens a little, a tapped one thickens
            // further, so the state reads at a glance even for a reader who
            // can't tell the fill colours apart.
            'line-width': this.polygonLineWidth(layer, highlightMode, subtle),
            'line-opacity': layer.blockAggregate
              ? ([
                  'interpolate',
                  ['linear'],
                  ['zoom'],
                  layer.blockAggregate.blocksUntil,
                  0,
                  layer.blockAggregate.detailFrom,
                  0.85,
                ] as unknown as maplibregl.ExpressionSpecification)
              : 0.85,
          },
        },
        under,
      );
      if (layer.tintWhenRelated) void this.applyRelatedTint(layer);
      if (layer.labelBy) {
        // The identifier the source printed on the area, in the area's own
        // colour over a basemap-dark halo. Null attributes draw nothing, and
        // colliding labels hide rather than stack as the view pulls back.
        this.map.addLayer({
          id: `${layer.id}-labels`,
          type: 'symbol',
          source: src,
          // Declared per layer because it is a property of how many records
          // the layer labels, not of labelling: 168 areas can be placed at any
          // zoom, 8,844 blocks cannot. See labelBy.minzoom in types.ts.
          ...(layer.labelBy.minzoom === undefined ? {} : { minzoom: layer.labelBy.minzoom }),
          layout: {
            'text-field': ['to-string', ['coalesce', ['get', layer.labelBy.key], '']],
            'text-size': ['interpolate', ['linear'], ['zoom'], 9, 10, 14, 18],
            // The one glyph stack shipped locally — no third-party assets.
            'text-font': ['Noto Sans Regular'],
          },
          paint: {
            'text-color': polygonColor,
            'text-halo-color': this.basemapColor,
            'text-halo-width': 1.4,
          },
        });
      }
      this.bindInteractions(layer, `${layer.id}-fill`);
      return;
    }

    if (layer.geometry === 'line') {
      const under = this.beneathDots();
      // Three layers for one line. The casing is what makes a thin coloured
      // line legible over a dark basemap without drawing it fat enough to
      // imply a width the data does not have.
      /*
       * Width from the data, where the layer says a magnitude drives it.
       *
       * `['zoom']` may only appear at the top of an expression, so the zoom
       * ramp stays outermost and each of its stops multiplies that zoom's
       * base width by the data ramp. Without a `weightBy` this collapses to
       * the plain numbers every other line layer has always had.
       *
       * A missing or null magnitude reads as zero rather than breaking the
       * layer: `interpolate` demands a number, and one unrecorded value
       * taking the whole layer down with it is not a trade worth making.
       */
      const weight = layer.weightBy;
      const at = (base: number) =>
        (weight
          ? [
              '*',
              base,
              [
                'interpolate',
                ['linear'],
                ['to-number', ['coalesce', ['get', weight.key], 0]],
                ...weight.stops.flat(),
              ],
            ]
          : base) as unknown as maplibregl.ExpressionSpecification;

      /*
       * Opacity, ramped by zoom where the layer asks to be quieter.
       *
       * A statewide layer is densest at the zoom where its lines are
       * thinnest, so the view that shows the most of it is the view where it
       * drowns everything else. The ramp spends the low end well under the
       * declared value and only reaches it close in, where a segment is one
       * line against open ground and has to be followable.
       *
       * A layer that declares nothing keeps the exact constant every plain
       * line layer has always had, ramp included — which is to say none.
       */
      const fade = (fixed: number, declared: number | undefined) =>
        (declared === undefined
          ? fixed
          : [
              'interpolate',
              ['linear'],
              ['zoom'],
              6,
              declared * 0.5,
              11,
              declared * 0.78,
              14,
              declared,
            ]) as unknown as maplibregl.ExpressionSpecification;

      this.map.addLayer(
        {
          id: `${layer.id}-line-casing`,
          type: 'line',
          source: src,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': this.basemapColor,
            // The casing tracks the core rather than staying put: a dark halo
            // at full strength under a half-strength line reads as a shadow
            // with nothing casting it.
            'line-opacity': fade(0.85, layer.opacity && layer.opacity * 0.94),
            'line-width': ['interpolate', ['linear'], ['zoom'], 6, at(3.5), 11, at(6), 16, at(11)],
          },
        },
        under,
      );
      this.map.addLayer(
        {
          id: `${layer.id}-line`,
          type: 'line',
          source: src,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': this.layerColor(layer),
            'line-opacity': fade(0.9, layer.opacity),
            'line-width': ['interpolate', ['linear'], ['zoom'], 6, at(1.6), 11, at(3), 16, at(6)],
          },
        },
        under,
      );
      // A line is a hard thing to hit with a finger. This one is invisible and
      // exists only to widen the target; a zero-opacity layer is still
      // queryable, so click and hover behave as they do on every other layer.
      // Colour is irrelevant at opacity 0, left as the plain layer colour
      // rather than threaded through layerColor() for a property nothing
      // ever sees.
      this.map.addLayer(
        {
          id: `${layer.id}-line-hit`,
          type: 'line',
          source: src,
          paint: { 'line-color': layer.color, 'line-opacity': 0, 'line-width': 20 },
        },
        under,
      );
      this.bindInteractions(layer, `${layer.id}-line-hit`);
      return;
    }

    // Cones go under the dots: the dot is the record's exact position and the
    // thing you click, so it should never be covered by the indicator.
    if (layer.bearingKey) {
      const coneSrc = this.coneSourceId(layer.id);
      this.map.addSource(coneSrc, {
        type: 'geojson',
        data: this.coneFeatures(layer, features),
      });
      this.map.addLayer({
        id: `${layer.id}-cones`,
        type: 'symbol',
        source: coneSrc,
        // A cone annotates a record, so it cannot arrive before the reader can
        // already tell one dot from the next. Cones used to start at
        // emergeFrom, fading in alongside the dot itself — but at metro scale
        // that means one cone per camera, all overlapping, on top of a dot
        // that isn't even coloured by operator yet: clutter standing in for
        // detail nobody asked to see yet. They now wait for pointsFrom, the
        // same zoom the dot goes solid and category-coloured, and fade in
        // over the two zooms past it.
        minzoom: tier.pointsFrom,
        layout: {
          'icon-image': ['get', CONE_PROP],
          'icon-rotate': ['get', BEARING_PROP],
          // Bearings are compass headings, so the cone turns with the map
          // rather than staying fixed on the screen.
          'icon-rotation-alignment': 'map',
          // Cameras can sit tightly clustered along a road; hiding the ones
          // that collide would misrepresent how many are there.
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-size': [
            'interpolate',
            ['linear'],
            ['zoom'],
            tier.pointsFrom, 0.75,
            tier.pointsFrom + 2, 1.05,
            18, 1.3,
          ],
        },
        paint: {
          'icon-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            tier.pointsFrom, 0.4,
            tier.pointsFrom + 2, 0.95,
          ] as unknown as maplibregl.ExpressionSpecification,
        },
      });
    }

    // See pointCircleColor's own comment: category colour at every zoom, not
    // just once records are individually resolved — the physical limit left
    // is a dot too small to show a legible colour, not an editorial one.
    // Shared with the glow layer just below so a dot and its halo are never
    // out of sync with each other.
    const circleColor = this.pointCircleColor(layer);

    // A soft per-dot halo in the dot's own colour, drawn under it. Radius and
    // opacity stay at zero below `emergeFrom` on purpose: this layer had a
    // density-style glow before (see the registry's own `scale` comment) and
    // it was removed because overlapping halos across many close-together
    // cameras read as a density surface the data can't back at that
    // distance. A halo confined to the zoom range where dots are already
    // individually resolved carries no information the dot's own colour
    // doesn't already carry — it just makes that colour easier to read.
    if (layer.categoryColors) {
      this.map.addLayer({
        id: `${layer.id}-points-glow`,
        type: 'circle',
        source: src,
        paint: {
          'circle-color': circleColor,
          'circle-blur': 0.9,
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            tier.emergeFrom, 0,
            tier.emergeFrom + 1, 6,
            15, 16,
          ] as unknown as maplibregl.ExpressionSpecification,
          'circle-opacity': [
            'interpolate', ['linear'], ['zoom'],
            tier.emergeFrom, 0,
            tier.pointsFrom, 0.4,
            15, 0.5,
          ] as unknown as maplibregl.ExpressionSpecification,
        },
      });
    }

    // A glyph layer stands in for the dots entirely where the registry names
    // one — not alongside them, which would ring every icon with a coloured
    // disc it already has. Still `${layer.id}-points`, because that id is
    // what applyVisibility, restack and bindInteractions all address.
    const markerExpression = this.markerExpressions.get(layer.id);
    if (markerExpression) {
      this.map.addLayer({
        id: `${layer.id}-points`,
        type: 'symbol',
        source: src,
        layout: {
          'icon-image': markerExpression as never,
          // Held well under 1 so a street of stations doesn't become a wall
          // of overlapping badges; grows a little into close zooms where a
          // reader is looking at one building rather than a district.
          'icon-size': [
            'interpolate', ['linear'], ['zoom'],
            tier.emergeFrom, 0.45,
            tier.pointsFrom, 0.7,
            15, 0.85,
          ] as unknown as maplibregl.ExpressionSpecification,
          // A building is at an address whether or not a neighbouring label
          // wants the space, and the accessible record list reads all of
          // them regardless — so never drop one for collision.
          'icon-allow-overlap': true,
        },
      });
      this.bindInteractions(layer, `${layer.id}-points`);
      return;
    }

    this.map.addLayer({
      id: `${layer.id}-points`,
      type: 'circle',
      source: src,
      paint: {
        'circle-color': circleColor,
        /*
         * Below `emergeFrom`, radius follows the same 5/10/15 curve every
         * point layer has always used. A layer that also names `speckleFrom`
         * (ALPR, so far — see scaleOf's comment) gets earlier anchors
         * instead: a true speck — sub-pixel at the map's own minimum zoom —
         * climbing to a small, clean dot at metro scale rather than the
         * bigger close-up size. Cut down from the original curve specifically
         * to match deflock.org's own metro-zoom rendering, which is small
         * and uncluttered even packed as tight as the Twin Cities get.
         * Layers that don't name `speckleFrom` see it equal `emergeFrom` and
         * take the unchanged branch below.
         */
        'circle-radius': (tier.speckleFrom < tier.emergeFrom
          ? [
              'interpolate', ['linear'], ['zoom'],
              tier.speckleFrom, 0.5,
              7, 1.2,
              tier.emergeFrom, 2.8,
              15, 8,
            ]
          : ['interpolate', ['linear'], ['zoom'], 5, 3.4, 10, 5.5, 15, 8]
        ) as unknown as maplibregl.ExpressionSpecification,
        'circle-stroke-color': this.pointStrokeColorExpr(layer),
        /*
         * Dots fade in rather than switching on at a single zoom.
         *
         * Every record is in this layer at every zoom; what changes is how much
         * of it you can see. Between the two zooms the layer names, a dot goes
         * from nothing to solid, so there is no scale at which the map replaces
         * one drawing with another. A layer that names no scale is solid
         * throughout, which is every layer whose records are readable as dots
         * from the whole state.
         *
         * A "cross-listed corner" match (see pointStrokeColorExpr's own
         * comment) doubles the final width on the same curve — still 0 before
         * `emergeFrom`, still solid by `pointsFrom`, just a thicker ring once
         * it's there. `pointStrokeWidthExpr` is the one place this ratio is
         * declared, shared with the theme-independent zoom curve here so the
         * two can never disagree about when the ring is allowed to appear.
         */
        'circle-stroke-width': this.pointStrokeWidthExpr(layer, tier),
        'circle-stroke-opacity': this.pointStrokeOpacityExpr(layer),
        /*
         * Opacity follows the same two-branch shape as radius, just above.
         * ALPR's `speckleFrom` branch never touches zero: a faint, uncoloured
         * dot is already visible at the map's own minimum zoom, and it climbs
         * to solid across `emergeFrom` → `pointsFrom` same as before. Nothing
         * here is a density estimate — it is the same records, just visible
         * further out, at a size and opacity that don't claim more precision
         * than a speck can carry.
         */
        'circle-opacity': (tier.speckleFrom < tier.emergeFrom
          ? [
              'interpolate',
              ['linear'],
              ['zoom'],
              tier.speckleFrom, 0.55,
              tier.emergeFrom, 0.65,
              tier.pointsFrom, 0.95,
            ]
          : ['interpolate', ['linear'], ['zoom'], tier.emergeFrom, 0, tier.pointsFrom, 0.95]
        ) as unknown as maplibregl.ExpressionSpecification,
      },
    });

    this.bindInteractions(layer, `${layer.id}-points`);
  }

  private cursorOn(layerId: string) {
    this.map.on('mouseenter', layerId, () => {
      this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', layerId, () => {
      this.map.getCanvas().style.cursor = '';
    });
  }

  /**
   * Show a layer's `hoverCard` while the pointer is over one of its records.
   *
   * Rebuilt only when the record under the pointer actually changes, not on
   * every mousemove — a pointer crossing a dense street of stations fires
   * hundreds of events, and the card's contents depend on the record, not
   * the pixel. Content is assembled as DOM nodes with `textContent` rather
   * than an HTML string, so a value out of a data file can never be markup.
   */
  private bindHoverCard(layer: ClientLayer, mapLayerId: string) {
    if (!layer.hoverCard) return;

    // `hoverCardId` is controller state, not a per-binding closure, because
    // the popup it describes is: two card-bearing layers whose records
    // overlap (a crowd-sourced camera sitting on an agency-reported one) each
    // bind their own handlers, and one layer's mouseleave tearing down the
    // shared popup while the other still believed it was showing left the
    // card stuck hidden until the pointer left that record entirely.
    //
    // Which is why hiding is conditional on still owning it: the pointer
    // sliding off a crowd-sourced camera onto the agency-reported reader
    // underneath fires this layer's `mouseleave` while the card on screen is
    // already the other layer's, and an unconditional teardown there took the
    // wrong card down and left the reader hovering a record with nothing shown
    // until they moved again.
    const hide = () => {
      if (this.hoverCardId && !this.hoverCardId.startsWith(`${layer.id}:`)) return;
      this.hoverCardId = null;
      this.hoverPopup?.remove();
      this.hoverPopup = null;
    };

    this.map.on('mousemove', mapLayerId, (e) => {
      const hit = e.features?.[0];
      const id = (hit?.properties as Record<string, unknown> | undefined)?.id as
        | string
        | undefined;
      if (!id) return hide();
      // A selected record already has the full panel open beside the map;
      // a card repeating it would just cover the ground the reader is
      // looking at.
      if (this.selectedPolygon?.layerId === layer.id && this.selectedPolygon.featureId === id) {
        return hide();
      }
      // Keyed by layer as well as record: two layers can hold records with
      // the same id, and a bare id match would suppress a real card change.
      const key = `${layer.id}:${id}`;
      // Already showing this exact record, so this layer demonstrably owns the
      // card — nothing to arbitrate, and this is the common case while the
      // pointer rests on a dot several pixels wide. Checked before
      // hoverCardOwner deliberately: that test costs a render query, and
      // running it above this guard spent one on every pointer move rather
      // than one per record change.
      if (key === this.hoverCardId && this.hoverPopup) {
        this.hoverPopup.setLngLat(e.lngLat);
        return;
      }
      // Where two card-bearing layers overlap — and half the agency-reported
      // readers have a crowd-sourced camera within 50 m — MapLibre dispatches
      // both layers' handlers for the same pointer move. Whichever draws on
      // top owns the card; without this the two handlers alternate, each
      // seeing the other's record in the shared state, so neither ever settles.
      if (!this.hoverCardOwner(layer, e.point)) return;
      const feature = this.featureById(layer.id, id);
      if (!feature) return hide();

      this.hoverCardId = key;
      const card = this.buildHoverCard(layer, feature);
      if (!this.hoverPopup) {
        // No `className`: the card's own elements carry the `hover-card-*`
        // classes global.css defines, and a wrapper class nothing selects on
        // is a hook that reads as styling but isn't.
        this.hoverPopup = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 14,
          maxWidth: '20rem',
        });
      }
      this.hoverPopup.setLngLat(e.lngLat).setDOMContent(card);
      // addTo() begins by removing an already-added popup — tearing the node
      // out of the DOM, dropping its map listeners and re-registering them —
      // so re-adding on a content change costs far more than the content
      // change itself.
      if (!this.hoverPopup.isOpen()) this.hoverPopup.addTo(this.map);
    });

    this.map.on('mouseleave', mapLayerId, hide);
  }

  /**
   * Whether `layer` is the card-bearing layer drawn topmost at this point —
   * i.e. the one whose record the reader is actually pointing at.
   *
   * Cheap in the ordinary case: with fewer than two card-bearing layers
   * visible there is nothing to arbitrate and no render query is made. The
   * query only runs where cards genuinely overlap.
   */
  private hoverCardOwner(layer: ClientLayer, point: maplibregl.Point): boolean {
    const contenders = this.layers.filter((l) => l.hoverCard && this.visible.has(l.id));
    if (contenders.length < 2) return true;
    const top = this.map.queryRenderedFeatures(point, {
      layers: this.styleLayerIds(SELECTABLE_SUFFIXES, contenders),
    })[0];
    // `${id}-` with the hyphen, the same prefix test restack() and
    // applyVisibility() use — layer ids are snake_case, so no id is a
    // hyphen-prefixed extension of another (`alpr` vs `alpr_reported`).
    return !top || top.layer.id.startsWith(`${layer.id}-`);
  }

  /** Assemble one hover card. See bindHoverCard for why this is DOM, not HTML. */
  private buildHoverCard(layer: ClientLayer, feature: LoadedFeature): HTMLElement {
    const spec = layer.hoverCard!;
    const attrs = feature.properties.attributes as Record<string, unknown>;
    const root = document.createElement('div');
    // The record list beside the map is the accessible interface (spec §4);
    // this is a pointer-only shortcut to it, so it is not announced twice.
    root.setAttribute('aria-hidden', 'true');
    root.className = 'hover-card-body';

    const title = document.createElement('p');
    title.className = 'hover-card-title';
    title.textContent = feature.properties.name;
    root.append(title);

    // The card and the detail panel read the same `detailFields` table, so
    // they render it the same way — same labels, same formatter. A `format`
    // written once against a field cannot mean two things depending on which
    // surface shows it.
    for (const key of spec.fields) {
      const field = layer.detailFields.find((f) => f.key === key);
      const value = formatValue(attrs[key], field?.format);
      if (value === null) continue;
      const row = document.createElement('p');
      const label = document.createElement('span');
      label.className = 'hover-card-label';
      label.textContent = `${field?.label ?? key}: `;
      // `link` is the one format whose rendering is a different element, not a
      // different string. Handled here rather than left to fall through as
      // text, because the panel renders these as anchors and one registry
      // entry must not produce a bare URL on one surface and a link on the
      // other.
      if (field?.format === 'link') {
        const href = document.createElement('a');
        href.href = value;
        href.target = '_blank';
        href.rel = 'noopener noreferrer';
        href.className = 'hover-card-cite';
        href.textContent = value;
        row.append(label, href);
      } else {
        row.append(label);
        // Same swatch the detail panel draws beside a row whose key is the
        // one driving the map's own fill color — see renderDetail's
        // swatchColor logic in MapView.astro for the sibling case.
        if (layer.categoryColors?.key === key) {
          const swatch = document.createElement('span');
          swatch.className = 'hover-card-swatch';
          swatch.style.background =
            layer.categoryColors.colors.find((c) => c.value === attrs[key])?.color ??
            layer.categoryColors.fallback;
          row.append(swatch);
        }
        row.append(document.createTextNode(value));
      }
      root.append(row);
    }

    const rel = spec.related;
    const joinValue = rel ? attrs[rel.fromKey] : null;
    // A record with no joining value cannot be searched for at all, so the
    // block is omitted entirely rather than rendered empty. Three quarters of
    // the buildings in this dataset sit outside the metro and carry no
    // jurisdiction id; showing them "no ALPR filing found for this
    // department" would assert an absence the join never actually tested —
    // exactly the claim §1c says not to make.
    if (rel && joinValue != null) {
      const heading = document.createElement('p');
      heading.className = 'hover-card-heading';
      const loaded = this.data.has(rel.layerId);
      const matches = loaded
        ? (this.joinIndex(rel.layerId, rel.joinKey).get(String(joinValue)) ?? [])
        : [];
      const max = rel.max ?? 4;

      if (!loaded) {
        // Say nothing rather than the wrong thing: until the other layer is
        // in hand, "none reported" would be a claim we cannot make yet.
        heading.textContent = rel.title;
        const pending = document.createElement('p');
        pending.className = 'hover-card-muted';
        pending.textContent = '…';
        root.append(heading, pending);
      } else if (!matches.length) {
        heading.textContent = rel.title;
        const empty = document.createElement('p');
        empty.className = 'hover-card-muted';
        empty.textContent = rel.empty;
        root.append(heading, empty);
      } else {
        heading.textContent = `${rel.title} (${matches.length})`;
        root.append(heading);
        const list = document.createElement('ul');
        list.className = 'hover-card-list';
        for (const m of matches.slice(0, max)) {
          const li = document.createElement('li');
          li.textContent = String(m.properties.attributes[rel.labelKey] ?? '');
          list.append(li);
        }
        root.append(list);
        const hidden = matches.length - max;
        if (hidden > 0) {
          const more = document.createElement('p');
          more.className = 'hover-card-more';
          more.textContent = rel.moreLabel.replace('{n}', String(hidden));
          root.append(more);
        }
        const href = rel.linkKey
          ? (matches[0].properties.attributes[rel.linkKey] as string | null)
          : null;
        if (href) {
          const cite = document.createElement('a');
          cite.href = href;
          cite.target = '_blank';
          cite.rel = 'noopener noreferrer';
          cite.className = 'hover-card-cite';
          cite.textContent = rel.linkLabel;
          root.append(cite);
        }
      }
    }

    if (spec.note) {
      const note = document.createElement('p');
      note.className = 'hover-card-note';
      note.textContent = spec.note;
      root.append(note);
    }

    // "Cross-listed corner" — only ever added when this record actually
    // matched (see alpr-cross-source.mjs), never for the unmatched majority,
    // because an unmatched record needs the full explanation in the detail
    // panel (§1c: absence is not a finding), not a clipped hover line that
    // could read as one. The full copy — what the match does and does not
    // claim — lives only in the detail panel; this is a pointer to it.
    if (layer.crossSource && attrs.crossSourceSiteId != null) {
      const note = document.createElement('p');
      note.className = 'hover-card-note';
      note.textContent = layer.crossSource.hoverNote
        .replace('{d}', String(attrs.crossSourceMeters ?? ''))
        .replace('{agency}', String(attrs.crossSourceAgencyName ?? ''));
      root.append(note);
    }
    return root;
  }

  /**
   * Whether a dot or glyph is drawn over this point, for a polygon layer whose
   * tap would otherwise answer for it.
   *
   * MapLibre runs every layer's click listener independently, and restack()
   * puts points above polygons for every layer — so a jurisdiction fill
   * covering the whole metro also answers for taps on the cameras standing on
   * it, and which one ends up in the panel comes down to whichever finished
   * loading last. That is true of every polygon layer, not only the one with
   * `polygonClick: 'highlight'`, which is why the test lives here rather than
   * inside bindHighlightSelect.
   */
  private coveredByPoint(layer: ClientLayer, point: maplibregl.Point): boolean {
    if (layer.geometry !== 'polygon') return false;
    const above = this.styleLayerIds(['-points']);
    return above.length > 0 && this.map.queryRenderedFeatures(point, { layers: above }).length > 0;
  }

  private bindInteractions(layer: ClientLayer, mapLayerId: string) {
    this.cursorOn(mapLayerId);
    this.bindHoverCard(layer, mapLayerId);
    if (layer.polygonClick === 'highlight') {
      this.bindHighlightSelect(layer, mapLayerId);
      return;
    }
    this.map.on('click', mapLayerId, (e) => {
      const hit = e.features?.[0];
      if (!hit) return;
      if (this.coveredByPoint(layer, e.point)) return;
      const id = (hit.properties as Record<string, unknown>)?.id as string;
      // Same move the search results already give a record: centre and zoom
      // in on it, not just open its detail. A tapped dot is a reader saying
      // "this one" — the camera should go to it, the way it already does
      // when the same record is picked from search. Saved once, the first
      // tap of a run, so tapping a second pin without ever tapping away
      // still returns to where the reader actually started.
      if (!this.preSelectCamera) {
        this.preSelectCamera = this.currentCamera();
      }
      this.focusFeature(layer.id, id);
    });
  }

  /**
   * Ward-map tap for a `polygonClick: 'highlight'` layer: flips one
   * polygon's feature-state, opens its detail panel, and fits the camera to
   * it — the same move every other layer's tap already makes (focusFeature),
   * layered under an exclusive per-polygon highlight so the selected ward
   * itself reads at a glance too, not only the detail panel beside it. A
   * second tap on the already-selected polygon clears it and returns the
   * camera the way the panel's own close button does (clearSelection).
   */
  private bindHighlightSelect(layer: ClientLayer, mapLayerId: string) {
    const src = this.sourceId(layer.id);

    // Preview, not selection: moving the pointer off the polygon (or off the
    // map entirely, via mouseleave) clears it with no lasting effect. Only a
    // click writes state that survives the pointer moving away. Tracked on
    // `this.hoveredPolygon` rather than a local variable so clearSelection
    // can release a stale hover left behind by a camera move the pointer
    // itself never caused — see that field's own comment.
    this.map.on('mousemove', mapLayerId, (e) => {
      const hit = e.features?.[0];
      const id = (hit?.properties as Record<string, unknown> | undefined)?.id as
        | string
        | undefined;
      if (this.hoveredPolygon?.layerId === layer.id && this.hoveredPolygon.featureId === id) {
        return;
      }
      this.releaseHover();
      if (id) {
        this.map.setFeatureState({ source: src, id }, { hover: true });
        this.hoveredPolygon = { layerId: layer.id, featureId: id };
      }
    });
    this.map.on('mouseleave', mapLayerId, () => {
      if (this.hoveredPolygon?.layerId === layer.id) this.releaseHover();
    });

    this.map.on('click', mapLayerId, (e) => {
      const hit = e.features?.[0];
      if (!hit) return;
      const id = (hit.properties as Record<string, unknown>)?.id as string;
      if (!id) return;

      if (this.coveredByPoint(layer, e.point)) return;

      // A tap on the ward already showing is the reader putting it back —
      // the one thing focusFeature can't infer, since it has no notion of a
      // second visit. Everything else about selecting (the highlight, the
      // panel, the fit, the thrown lines) belongs to focusFeature, which
      // search and the record list reach too.
      if (this.selectedPolygon?.layerId === layer.id && this.selectedPolygon.featureId === id) {
        this.clearSelection();
        return;
      }
      // Same "remember where I was" move a tapped dot already gets — see
      // bindInteractions' own comment — so the panel's close button can
      // still return here even though a ward tap fits bounds, not eases to
      // a fixed zoom.
      if (!this.preSelectCamera) {
        this.preSelectCamera = this.currentCamera();
      }
      this.focusFeature(layer.id, id);
    });
  }

  setLayerVisible(layer: ClientLayer, visible: boolean) {
    if (visible) {
      this.visible.add(layer.id);
      void this.loadLayer(layer).then(() => {
        this.applyVisibility(layer);
        // The controls are on the page before the data is: a filter ticked
        // while this layer was still downloading (or still switched off) has
        // been waiting for this moment. The first paint already drew the
        // filtered subset; the zoom the tick promised happens now.
        if ((this.filters.get(layer.id)?.size ?? 0) > 0) this.zoomAfterFilterChange(layer.id);
      });
    } else {
      this.visible.delete(layer.id);
      // A selection outlives its own layer otherwise. The highlight is
      // feature-state on a style layer that is about to be hidden, but the
      // overlays hung off it — the related buildings, their glow, the thrown
      // paths — belong to no registry layer, so applyVisibility never reaches
      // them and restack() goes on pinning them above everything on the next
      // toggle. Unticking "police & sheriff jurisdictions" left the ward's
      // buildings and lines drawn over a map that no longer contained the
      // ward.
      if (this.selectedPolygon?.layerId === layer.id || this.relatedOverlayOwner === layer.id) {
        this.releaseHighlight();
      }
      if (this.hoveredPolygon?.layerId === layer.id) this.releaseHover();
      this.applyVisibility(layer);
    }
  }

  /**
   * Show or hide every style layer this registry layer owns.
   *
   * Derived from the style rather than from a hardcoded suffix list, because
   * the list is the bug: it has to name every id addLayer can create, and it
   * silently omitted `-blocks-fill`/`-blocks-outline` — so unticking racial
   * covenants hid the parcels and left the coarse grid they stand under drawn
   * at every zoom below `detailFrom`, which is every zoom the map opens at,
   * with the count beside it reading 0. Nothing failed; the list had simply
   * drifted from addLayer, and would have drifted again on the next geometry.
   *
   * `${id}-` with the hyphen is what makes the prefix test safe between
   * neighbours like `alpr` and `alpr_reported` — the same test restack() uses,
   * for the same reason.
   */
  private applyVisibility(layer: ClientLayer) {
    const visibility = this.visible.has(layer.id) ? 'visible' : 'none';
    for (const styleId of this.styleOrder()) {
      if (!styleId.startsWith(`${layer.id}-`)) continue;
      this.map.setLayoutProperty(styleId, 'visibility', visibility);
    }
    this.repaintTintDependents(layer.id);
    this.emitCounts();
  }

  /**
   * `tintWhenRelated` paints one layer's colour onto another (the green wash
   * `agency_jurisdiction` takes on wherever `vendor_contract` has a
   * documented contract). polygonFillColor already keys that wash on the
   * source layer's visibility, but a MapLibre paint expression only
   * re-evaluates when its inputs change — `this.visible` is plain JS state,
   * invisible to the style until something re-sets the paint property. So
   * every toggle of a layer other layers tint against has to explicitly
   * rebuild and re-set those dependents' fill/outline, the same way
   * repaintThemedLayers does for a basemap change.
   */
  private repaintTintDependents(targetLayerId: LayerId) {
    for (const dependent of this.layers) {
      if (dependent.tintWhenRelated?.layerId !== targetLayerId) continue;
      if (!this.map.getLayer(`${dependent.id}-fill`)) continue;
      const highlightMode = dependent.polygonClick === 'highlight';
      const subtle = dependent.selectedEmphasis === 'subtle';
      const fill = this.polygonFillColor(dependent);
      this.map.setPaintProperty(`${dependent.id}-fill`, 'fill-color', fill);
      this.map.setPaintProperty(`${dependent.id}-fill`, 'fill-opacity', this.polygonFillOpacity(dependent, highlightMode, subtle));
      if (this.map.getLayer(`${dependent.id}-outline`)) {
        this.map.setPaintProperty(`${dependent.id}-outline`, 'line-color', fill);
        this.map.setPaintProperty(`${dependent.id}-outline`, 'line-width', this.polygonLineWidth(dependent, highlightMode, subtle));
      }
    }
  }

  /** Where the reader was before a filter first moved the camera. */
  private preFilterCamera: { center: [number, number]; zoom: number } | null = null;

  /**
   * Name the one piece of page chrome that is allowed to float over the map.
   *
   * Below `lg` the detail panel is a sheet drawn on top of the map's own box
   * rather than a flex sibling beside it (see #detail-panel in MapView.astro),
   * so the map is a full-height container whose bottom third the reader cannot
   * see. `map.resize()` is no help — the container never changed size — and
   * MapLibre has no notion of an obstruction, so every fit would centre its
   * record behind the sheet. Handing the element over rather than a pixel
   * constant means the reservation is measured from the sheet actually on
   * screen: it follows the panel's content, the reader's font size and a
   * rotation, and it collapses to nothing on desktop by construction, where
   * the same element is a sibling the map's box already excludes.
   */
  setOverlay(el: HTMLElement | null) {
    this.overlaySize?.disconnect();
    this.overlayShown?.disconnect();
    this.overlay = el;
    this.publishObstruction();
    if (!el) return;
    // Observed rather than measured once: the sheet's height moves with its
    // content, the reader's font size, a rotation, and the `hidden` attribute
    // that opens and closes it. Two observers because neither sees the other's
    // half — ResizeObserver is not required to report an element that has gone
    // `display: none`, which is precisely the moment the reservation has to
    // return to zero.
    this.overlaySize = new ResizeObserver(() => this.publishObstruction());
    this.overlaySize.observe(el);
    this.overlayShown = new MutationObserver(() => this.publishObstruction());
    this.overlayShown.observe(el, { attributes: true, attributeFilter: ['hidden', 'class'] });
  }

  /**
   * Republish the obstruction as `--map-sheet-h` on the document root, for the
   * page's own bottom-anchored furniture: the scale bar, the reset button, the
   * colour keys, and the OpenStreetMap attribution whose visibility is a
   * licence term rather than a nicety. All of it would otherwise sit under the
   * sheet. Deliberately the same measurement fitPadding reserves, so the
   * pixels CSS moves chrome by and the pixels the camera holds back cannot
   * drift apart. The root is the right scope because the consumers straddle
   * the map container — some are MapLibre's, inside it; some are the page's,
   * beside it.
   */
  private publishObstruction() {
    document.documentElement.style.setProperty(
      '--map-sheet-h',
      `${this.bottomObstruction()}px`,
    );
  }

  /**
   * How many pixels at the bottom of the map are covered by `overlay`, in the
   * map's own coordinates. Zero when there is no overlay, when it is hidden,
   * and — the desktop case — when it sits beside the map rather than over it.
   */
  private bottomObstruction(): number {
    const el = this.overlay;
    if (!el || el.hidden || el.offsetParent === null) return 0;
    const map = this.map.getContainer().getBoundingClientRect();
    const panel = el.getBoundingClientRect();
    const overlaps =
      panel.left < map.right &&
      panel.right > map.left &&
      panel.top < map.bottom &&
      panel.bottom > map.top;
    if (!overlaps) return 0;
    return Math.max(0, Math.min(map.bottom - panel.top, map.height));
  }

  /**
   * Padding for a fit, in the map's own pixels: an even margin on every side,
   * plus whatever the detail sheet is covering along the bottom.
   *
   * Every fit in this class goes through here so the framing of a record, a
   * searched-for boundary and the reset view are decided in one place rather
   * than by four literals that drift apart.
   */
  private fitPadding(base = 64): maplibregl.PaddingOptions {
    const canvas = this.map.getCanvas();
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const pad = width < NARROW_MAP_PX ? Math.min(base, NARROW_FIT_PADDING) : base;
    const [left, right] = fitAxisPadding(pad, pad, width);
    const [top, bottom] = fitAxisPadding(pad, pad + this.bottomObstruction(), height);
    return { top, right, bottom, left };
  }

  /** A plain, serialisable snapshot of the camera. */
  private currentCamera(): { center: [number, number]; zoom: number } {
    const c = this.map.getCenter();
    return { center: [c.lng, c.lat], zoom: this.map.getZoom() };
  }

  /**
   * Ease to a saved camera, then land exactly on it.
   *
   * MapLibre's own `easeTo` doesn't reliably converge on the requested
   * centre when the eased zoom delta is large — measured here at a couple of
   * miles off on a two-level zoom-out, confirmed against a straight `jumpTo`
   * to the same numbers, which lands exactly. Invisible on the whole-state
   * frame the filter round trip usually returns to; not invisible on the
   * street-level one a tapped record returns to. The `jumpTo` on `moveend`
   * corrects it after the motion the reader sees, rather than cutting the
   * motion short.
   */
  private easeToCamera(camera: { center: [number, number]; zoom: number }, duration: number) {
    this.map.easeTo({ ...camera, duration });
    if (duration > 0) this.map.once('moveend', () => this.map.jumpTo(camera));
  }

  private anyActiveFilters(): boolean {
    for (const state of this.filters.values()) if (state.size > 0) return true;
    return false;
  }

  setFilter(layerId: string, key: string, values: Set<string>) {
    if (!this.filters.has(layerId)) this.filters.set(layerId, new Map());
    const state = this.filters.get(layerId)!;
    const activeBefore = this.anyActiveFilters();
    if (values.size === 0) state.delete(key);
    else state.set(key, values);
    this.refresh(layerId);
    // Filtering is a round trip. The moment the first filter comes on, the
    // camera's position is saved and the view goes to the metro frame; every
    // further filter change re-frames the same way; and when the last filter
    // comes off, the reader is put back exactly where they were standing
    // before the trip began.
    if (this.anyActiveFilters()) {
      this.zoomAfterFilterChange(layerId);
    } else if (activeBefore && this.preFilterCamera) {
      this.easeToCamera(this.preFilterCamera, REDUCED_MOTION ? 0 : 600);
      this.preFilterCamera = null;
    }
  }

  /**
   * The outbound half of the filter round trip, shared by the two moments a
   * zoom can become due: a filter change on a loaded layer, and a layer
   * finishing its load with a filter already waiting. Saves the camera once,
   * the first time filtering moves it.
   */
  private zoomAfterFilterChange(layerId: string) {
    if (!this.preFilterCamera) {
      this.preFilterCamera = this.currentCamera();
    }
    this.zoomToFiltered(layerId);
  }

  /**
   * Carry the view to what a filter just narrowed the layer to.
   *
   * Picking "Duluth" and then panning around Minneapolis looking for the
   * records is the reader doing work the map already knows how to do. Runs
   * whenever a filter change leaves the layer actively narrowed, visible and
   * with matches; `setFilter` owns the round trip — saving the camera before
   * the first filter and restoring it after the last.
   */
  private zoomToFiltered(layerId: string) {
    const state = this.filters.get(layerId);
    if (!state || state.size === 0) return;
    if (!this.visible.has(layerId)) return;
    const matches = this.filteredFeatures(layerId);
    if (!matches.length) return;
    let minLng = Infinity;
    let minLat = Infinity;
    let maxLng = -Infinity;
    let maxLat = -Infinity;
    for (const f of matches) {
      const [w, s, e, n] = bboxOf(f.geometry);
      if (w < minLng) minLng = w;
      if (s < minLat) minLat = s;
      if (e > maxLng) maxLng = e;
      if (n > maxLat) maxLat = n;
    }
    if (!Number.isFinite(minLng)) return;
    // The default destination is the metro, not the matches' own bbox: both
    // downtowns and the suburban ring, framed the same way every time, so
    // successive filters compare against a steady ground. Only when nothing
    // that matched is inside that frame does the view chase the records
    // instead — a reader filtering to Rochester should not be shown an empty
    // metro.
    const inMetro =
      minLng <= METRO_BOUNDS[1][0] &&
      maxLng >= METRO_BOUNDS[0][0] &&
      minLat <= METRO_BOUNDS[1][1] &&
      maxLat >= METRO_BOUNDS[0][1];
    this.map.fitBounds(
      inMetro
        ? METRO_BOUNDS
        : [
            [minLng, minLat],
            [maxLng, maxLat],
          ],
      // maxZoom stays here, unlike the fits in focusFeature and
      // showJurisdiction: those always have a real extent to fill, while a
      // filter can narrow a layer to one point, whose bbox has no width at
      // all. An unclamped fit on that is a street-level view of a single dot.
      { padding: this.fitPadding(48), maxZoom: 13, duration: REDUCED_MOTION ? 0 : 600 },
    );
  }

  clearFilters(layerId?: string) {
    if (layerId) this.filters.delete(layerId);
    else this.filters.clear();
    for (const id of layerId ? [layerId] : this.data.keys()) this.refresh(id);
    // The same round trip as setFilter: clearing the last active filter puts
    // the reader back where they were before filtering moved them.
    if (!this.anyActiveFilters() && this.preFilterCamera) {
      this.easeToCamera(this.preFilterCamera, REDUCED_MOTION ? 0 : 600);
      this.preFilterCamera = null;
    }
  }

  /** Features of a layer that pass its current filters. */
  filteredFeatures(layerId: string): LoadedFeature[] {
    const all = this.data.get(layerId) ?? [];
    const state = this.filters.get(layerId);
    if (!state || state.size === 0) return all;
    return all.filter((f) =>
      [...state.entries()].every(([key, values]) => {
        const raw = (f.properties.attributes as Record<string, unknown>)[key];
        return raw != null && values.has(String(raw));
      }),
    );
  }

  private refresh(layerId: string) {
    const source = this.map.getSource(this.sourceId(layerId)) as GeoJSONSource | undefined;
    const layer = this.layers.find((l) => l.id === layerId);
    if (!source || !layer) return;
    const visible = this.filteredFeatures(layerId);
    source.setData(this.flatten(visible));
    // Cones live in a second source, so a filter that hides a camera has to
    // hide its cone too or the map keeps drawing coverage for records the
    // record list no longer shows.
    const cones = this.map.getSource(this.coneSourceId(layerId)) as GeoJSONSource | undefined;
    cones?.setData(this.coneFeatures(layer, visible));
    // The grid regroups from the surviving parcels rather than dimming: a
    // filtered-down cell is a smaller claim, not a claim over parcels the map
    // no longer shows.
    const blocks = this.map.getSource(this.blockSourceId(layerId)) as GeoJSONSource | undefined;
    blocks?.setData(this.blockFeatures(layer, visible));
    this.emitCounts();
  }

  private emitCounts() {
    const counts: Record<string, { shown: number; total: number }> = {};
    for (const layer of this.layers) {
      const total = this.data.get(layer.id)?.length ?? 0;
      counts[layer.id] = {
        shown: this.visible.has(layer.id) ? this.filteredFeatures(layer.id).length : 0,
        total,
      };
    }
    this.events.onCounts?.(counts);
  }

  /**
   * `map.resize()` with a no-op fast path: MapLibre's own resize() has none
   * — it forces a synchronous layout, reassigns canvas.width (which
   * reallocates and clears the WebGL drawing buffer, forcing a full repaint
   * of every layer), and fires a movestart/move/moveend cascade regardless
   * of whether the container's size actually changed. Shared by
   * focusFeature (called on every selection — the overwhelmingly common
   * case is an already-open panel whose size didn't just change) and the
   * containerResize/window-resize handler set up in the constructor, which
   * fires on every collapsible-panel toggle whether or not it changed the
   * map's own box.
   */
  private resizeIfNeeded() {
    const canvas = this.map.getCanvas();
    const container = this.map.getContainer();
    if (
      canvas.clientWidth !== container.clientWidth ||
      canvas.clientHeight !== container.clientHeight
    ) {
      this.map.resize();
    }
  }

  /** Centre on a feature and open its detail. Used by the record list and search. */
  focusFeature(layerId: string, featureId: string) {
    const feature = this.featureById(layerId, featureId);
    const layer = this.layers.find((l) => l.id === layerId);
    if (!feature || !layer) return;

    // onSelect first, camera move second — deliberately, not the more obvious
    // order. onSelect is what opens the detail panel, and the panel is a
    // sibling flex item that steals width from the map's own container, not
    // an overlay drawn on top of it (see #detail-panel in MapView.astro).
    // Computing a fit against the container's width before that reflow
    // happens fits the *pre-panel*, wider viewport; MapLibre has no way to
    // retroactively correct an in-flight animation for a container that
    // resizes out from under it, so the record could land off-centre, or for
    // a wide polygon, land partly hidden behind the panel that just opened
    // over it. Reading `map.resize()` after onSelect forces the browser to
    // resolve the panel's layout change synchronously, so the fit below is
    // computed against the container's real, final size.
    // …but only when the panel's width actually changed. MapLibre's resize()
    // has no unchanged-dimensions fast path: it forces a synchronous layout,
    // reassigns canvas.width — which reallocates and clears the WebGL drawing
    // buffer, forcing a full repaint of every layer — and fires a
    // movestart/move/moveend cascade. Every tap after the first hits the
    // already-open panel, which is the overwhelmingly common case.
    //
    // Both axes are tested, not just the width the desktop panel takes: the
    // container can lose height too — a rotation, a phone's address bar
    // collapsing, a `dvh` unit resolving to something new — and a fit computed
    // against a canvas taller than its own container lands the record below
    // the frame. On mobile the detail sheet itself no longer changes either
    // dimension (it floats over the map; see setOverlay), so this correctly
    // does nothing there and fitPadding does the work instead.
    this.events.onSelect?.(feature, layer);
    this.resizeIfNeeded();

    const duration = REDUCED_MOTION ? 0 : 500;
    if (feature.geometry.type === 'Point') {
      // A point has no extent to fit, so it is centred — but centred in the
      // part of the map the reader can see, which is the frame less whatever
      // the detail sheet covers. Half the obstruction, because the offset
      // moves the target away from the container's centre and the visible
      // strip's centre sits exactly that far above it.
      this.map.easeTo({
        center: representativePoint(feature.geometry) as [number, number],
        zoom: Math.max(this.map.getZoom(), 13),
        offset: [0, -this.bottomObstruction() / 2],
        duration,
      });
    } else {
      // A line record can be miles long. Centring it at a fixed zoom shows a
      // piece of it and hides the length, which is the one thing the record
      // exists to convey, so fit the whole extent instead. Polygons get the
      // same treatment for the same reason.
      //
      // No maxZoom: a fit's whole job is to fill the frame with the record,
      // and a ceiling stops it short of that for exactly the records that need
      // it most. Veterans Affairs Police, the smallest jurisdiction on the
      // map, clamped at zoom 14 and drew as a box across a quarter of the
      // width, indistinguishable at a glance from a fit that had failed.
      const [minLng, minLat, maxLng, maxLat] = bboxOf(feature.geometry);
      this.map.fitBounds(
        [
          [minLng, minLat],
          [maxLng, maxLat],
        ],
        { padding: this.fitPadding(), duration },
      );
    }

    // Selection behaviour lives here rather than in the map's own click
    // handler because this is the one funnel every route to a record passes
    // through — a tap on the map, a search result, a row in the accessible
    // record list. Putting it on the click alone meant a jurisdiction picked
    // from search opened its panel but never highlighted its ward or threw
    // its lines, which is the same selection reached a different way.
    if (layer.polygonClick === 'highlight') {
      this.markPolygonSelected(layer, featureId);
    } else {
      // Selecting a camera is still a new selection: the ward that was lit,
      // and the lines it threw, describe a record the panel no longer shows.
      // Without this a jurisdiction stayed highlighted under an unrelated
      // record for the rest of the session.
      this.releaseHighlight();
    }
    if (layer.relatedBuildings) void this.showRelatedBuildings(feature, layer);
  }

  /**
   * Jump to the record a "near miss" lost its tie to. `siteId` is the
   * *other* record's own `crossSourceSiteId`, not a feature id, so this
   * resolves it through the same attribute index the hover card's
   * `related` block already builds (joinIndex) rather than adding a second
   * lookup structure just for this one case. Always the same layer as the
   * near-miss record itself — see LayerDefinition.crossSource.nearMiss's
   * own comment on why an OSM point is never the target. Does nothing if
   * the site can't be found (data not loaded yet, or a stale id), same as
   * focusFeature.
   */
  focusCrossSourceSite(layerId: string, siteId: string) {
    const feature = this.joinIndex(layerId, 'crossSourceSiteId').get(siteId)?.[0];
    if (feature) this.focusFeature(layerId, feature.properties.id);
  }

  /**
   * Drop every `polygonClick: 'highlight'` selection and the overlays hung
   * off it, without touching the camera or the detail panel. The half of
   * clearSelection that a *different* record being selected also needs.
   */
  private releaseHighlight() {
    this.selectionEpoch++;
    const held = this.selectedPolygon;
    if (held) {
      this.map.setFeatureState(
        { source: this.sourceId(held.layerId), id: held.featureId },
        { selected: false },
      );
      this.selectedPolygon = null;
    }
    this.clearRelatedBuildings();
  }

  /** Drop the hover preview, wherever it is. Safe to call when there is none. */
  private releaseHover() {
    const held = this.hoveredPolygon;
    if (!held) return;
    this.map.setFeatureState(
      { source: this.sourceId(held.layerId), id: held.featureId },
      { hover: false },
    );
    this.hoveredPolygon = null;
  }

  /** Move the highlight to one feature, releasing whatever held it. */
  private markPolygonSelected(layer: ClientLayer, featureId: string) {
    const held = this.selectedPolygon;
    if (held?.layerId === layer.id && held.featureId === featureId) return;
    if (held) {
      this.map.setFeatureState(
        { source: this.sourceId(held.layerId), id: held.featureId },
        { selected: false },
      );
    }
    this.map.setFeatureState(
      { source: this.sourceId(layer.id), id: featureId },
      { selected: true },
    );
    this.selectedPolygon = { layerId: layer.id, featureId };
  }

  flyTo(center: [number, number], zoom = 12) {
    this.map.easeTo({ center, zoom, duration: REDUCED_MOTION ? 0 : 600 });
  }

  /**
   * Outline one unit of government and fit the view to it.
   *
   * Deliberately not a layer in the registry. A layer is a finding — something
   * the project went and gathered. A township boundary is the frame a reader
   * brought with them, and 2,757 of them drawn at once would bury every dot on
   * the map. Exactly one is ever shown: the one somebody searched for.
   *
   * It draws as an outline with no fill, because a filled polygon over camera
   * dots reads as data about the area rather than as the edge of it.
   */
  showJurisdiction(feature: {
    geometry: GeoJSON.Geometry;
    properties: Record<string, unknown>;
  }) {
    const data = { type: 'Feature' as const, ...feature };

    const existing = this.map.getSource(JURISDICTION_SOURCE) as GeoJSONSource | undefined;
    if (existing) {
      existing.setData(data as never);
    } else {
      this.map.addSource(JURISDICTION_SOURCE, { type: 'geojson', data: data as never });
      this.map.addLayer(
        {
          id: JURISDICTION_LAYER,
          type: 'line',
          source: JURISDICTION_SOURCE,
          paint: {
            'line-color': JURISDICTION_COLOR,
            'line-width': ['interpolate', ['linear'], ['zoom'], 6, 1.2, 12, 2.5],
            'line-opacity': 0.9,
            'line-dasharray': [3, 2],
          },
        },
        // Under the records, so a boundary never sits on top of a camera.
        this.beneathDots(),
      );
    }

    // Same framing a tapped record gets, for the same reason — see
    // focusFeature on why no maxZoom, and fitPadding on the sheet reservation.
    const [minLng, minLat, maxLng, maxLat] = bboxOf(feature.geometry);
    this.map.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      { padding: this.fitPadding(48), duration: REDUCED_MOTION ? 0 : 600 },
    );
  }

  /** Remove the outline. The reader searched for something else. */
  clearJurisdiction() {
    if (this.map.getLayer(JURISDICTION_LAYER)) this.map.removeLayer(JURISDICTION_LAYER);
    if (this.map.getSource(JURISDICTION_SOURCE)) this.map.removeSource(JURISDICTION_SOURCE);
  }

  /**
   * What a selected `relatedBuildings` polygon actually highlights — see
   * that field's own comment in types.ts. Building(s) draw regardless of
   * whether the reader has that point layer switched on (a selection is a
   * more specific, deliberate request than a layer toggle); paths draw only
   * to records the reader can already see, so a path never points at a dot
   * that isn't there.
   */
  private async showRelatedBuildings(jurisdiction: LoadedFeature, layer: ClientLayer) {
    const rel = layer.relatedBuildings;
    if (!rel) return;

    // Every await below is a fetch that can outlive the selection that
    // started it: a reader who taps one ward and immediately taps another (or
    // taps out entirely) would otherwise get the slower, older request
    // painting its buildings and throwing its lines over the newer selection.
    const token = ++this.selectionEpoch;
    const stale = () => token !== this.selectionEpoch;

    // Two independent downloads — neither's URL or filter depends on the
    // other's result — so they go out together. Awaited in series this was two
    // full round trips before a single line could be thrown, on the first
    // selection over the worst connection.
    await Promise.all([
      this.ensureDataLoaded(rel.layerId),
      rel.pathsTo ? this.ensureDataLoaded(rel.pathsTo.layerId) : Promise.resolve([]),
    ]);
    if (stale()) return;

    // Which value on THIS record the join runs against — `id` unless the
    // registry names another attribute. hoverCard.related has carried a
    // `fromKey` from the start for a reason the registry already documents:
    // alpr_reported joins on agencyName, because jurisdictionId only exists
    // for the 10-county metro while that layer is statewide. A relation here
    // needing the same could not say so while the near side was hardcoded.
    const nearValue = this.joinValueOf(jurisdiction, rel.fromKey);
    const matched =
      nearValue === null ? [] : (this.joinIndex(rel.layerId, rel.joinKey).get(nearValue) ?? []);

    await this.ensureRelatedLayers(layer, rel);
    if (stale()) return;
    (this.map.getSource(RELATED_BUILDINGS_SOURCE) as GeoJSONSource | undefined)?.setData(
      this.flatten(matched) as never,
    );

    // Joined, not contained — see pathsTo's own comment. Every reader here
    // is one this agency itself told the state it operates, so the line
    // between them carries a document rather than a coincidence of
    // geography. Loaded on demand: the reader may never have ticked this
    // layer, and a selection is a more specific request than a toggle.
    const pathsFrom = rel.pathsTo ? this.joinValueOf(jurisdiction, rel.pathsTo.fromKey) : null;
    const readers =
      rel.pathsTo && pathsFrom !== null
        ? (this.joinIndex(rel.pathsTo.layerId, rel.pathsTo.joinKey).get(pathsFrom) ?? []).filter(
            (f) => f.geometry.type === 'Point',
          )
        : [];

    // One hub, not one spoke per building: every matched building lights up
    // above, but the lines throw from a single representative address, because
    // the filing is the department's, not any one station's. Which record is
    // the hub is the registry's call (`hubKey`), not this class's — the next
    // relation to declare one will join a different vocabulary entirely.
    const hubKey = rel.hubKey;
    const hub =
      (hubKey ? matched.find((f) => !f.properties.attributes[hubKey]) : undefined) ?? matched[0];
    // A department with nothing to throw has to *erase* the last one's lines,
    // not simply decline to draw its own — most jurisdictions reported no
    // reader, so returning early here left the previously selected agency's
    // paths hanging off a building the panel no longer describes.
    if (!hub || !readers.length) {
      this.clearThrownPaths();
      return;
    }

    const origin = representativePoint(hub.geometry) as [number, number];
    const targets = readers.map((r) => representativePoint(r.geometry) as [number, number]);
    this.throwPaths(origin, targets);
  }

  /**
   * Throw a line from the agency's building to each reader it reported, and
   * ring both ends as each lands.
   *
   * Written for cost, because it is the only thing on this map that moves.
   * The whole animation is two small GeoJSON sources — at most a few dozen
   * two-point lines and the same number of rings — updated from a single
   * requestAnimationFrame loop that stops itself the moment the last ring
   * has faded. Nothing is added or removed per frame, no layer is
   * re-created, and the ring's growth and fade are expressions over one
   * property so MapLibre interpolates them on the GPU rather than this loop
   * recomputing paint state. At rest the cost is zero.
   *
   * Under `prefers-reduced-motion` there is no loop at all: the finished
   * lines are drawn once and no rings are shown.
   */
  private throwPaths(
    origin: [number, number],
    targets: Array<[number, number]>,
  ) {
    this.cancelThrow();
    this.runThrow(origin, targets, RELATED_PATHS_SOURCE, RELATED_IMPACT_SOURCE, (id) => {
      this.throwFrame = id;
    });
  }

  /**
   * The animation itself, shared by throwPaths and throwNearMeLines (see the
   * latter's own comment for why the two still keep independent rAF handles
   * and sources rather than sharing a call site entirely — a jurisdiction
   * throw and a near-me throw can be on screen at once). Only the tuned
   * stagger/ease/impact math and the setData calls belong here; which frame
   * field to write to is threaded in as `setFrame` so each caller's own
   * cancel/clear stays in charge of its own handle.
   */
  private runThrow(
    origin: [number, number],
    targets: Array<[number, number]>,
    pathsSourceId: string,
    impactSourceId: string,
    setFrame: (id: number | null) => void,
  ) {
    const paths = this.map.getSource(pathsSourceId) as GeoJSONSource | undefined;
    const impacts = this.map.getSource(impactSourceId) as GeoJSONSource | undefined;
    if (!paths) return;

    const line = (to: [number, number]) => ({
      type: 'Feature' as const,
      geometry: { type: 'LineString' as const, coordinates: [origin, to] },
      properties: {},
    });

    if (REDUCED_MOTION) {
      paths.setData({ type: 'FeatureCollection', features: targets.map(line) } as never);
      impacts?.setData(EMPTY_FC as never);
      return;
    }

    // THROW_MS's own comment on why this shrinks for a large batch instead
    // of always using THROW_STAGGER_MS. (targets.length - 1) is the number
    // of gaps between shots (a 2-target throw has 1 gap, not 2), so this
    // stays at THROW_STAGGER_MS for any small batch — THROW_SPREAD_MS
    // divided across few gaps is always the larger of the two — and only
    // shrinks once there are enough targets that THROW_STAGGER_MS apart
    // would spread the batch past THROW_SPREAD_MS.
    const stagger =
      targets.length > 1 ? Math.min(THROW_STAGGER_MS, THROW_SPREAD_MS / (targets.length - 1)) : 0;
    // Deterministic per-target stagger rather than Math.random(): the order
    // is arbitrary either way, and this keeps a re-selection of the same
    // jurisdiction looking the same as the first time.
    const shots = targets.map((target, i) => ({
      target,
      delay: i * stagger,
      landedAt: null as number | null,
    }));
    const lastStart = shots.length ? shots[shots.length - 1].delay : 0;
    const totalMs = lastStart + THROW_MS + IMPACT_MS;
    const start = performance.now();
    // Ease-out: fast off the mark, settling as it lands.
    const ease = (p: number) => 1 - (1 - p) ** 3;

    // setData is a worker round trip with a re-parse and re-index, not a cheap
    // buffer write. The rings are empty for the frames before the first line
    // lands and again after the last has faded, and writing an empty
    // collection over an already-empty one is pure cost.
    let ringsWereEmpty = true;
    // Last elapsed time the setData work below actually ran, gating it to
    // THROW_FRAME_BUDGET_MS (see that constant's comment). -Infinity so the
    // first frame always does the work.
    let lastStepElapsed = -Infinity;

    const step = () => {
      const elapsed = performance.now() - start;
      const finished = elapsed >= totalMs;

      // Still request the next rAF every tick regardless of the budget below
      // — that's what keeps the loop's own timing smooth — but skip the
      // setData work itself on ticks that land inside the same budget
      // window as the last one that ran. The final frame always runs so the
      // animation settles exactly at rest rather than on a stale mid-throw
      // frame.
      if (!finished && elapsed - lastStepElapsed < THROW_FRAME_BUDGET_MS) {
        setFrame(requestAnimationFrame(step));
        return;
      }
      lastStepElapsed = elapsed;

      const lineFeatures = [];
      const ringFeatures = [];
      for (const shot of shots) {
        const p = Math.min(1, Math.max(0, (elapsed - shot.delay) / THROW_MS));
        if (p <= 0) continue;
        const k = ease(p);
        lineFeatures.push(
          line([
            origin[0] + (shot.target[0] - origin[0]) * k,
            origin[1] + (shot.target[1] - origin[1]) * k,
          ]),
        );
        if (p >= 1) {
          if (shot.landedAt === null) shot.landedAt = elapsed;
          const t = Math.min(1, (elapsed - shot.landedAt) / IMPACT_MS);
          if (t < 1) {
            // Both ends react: one ring where the line struck, one back at
            // the building that threw it.
            ringFeatures.push(
              { type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: shot.target }, properties: { t } },
              { type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: origin }, properties: { t } },
            );
          }
        }
      }

      paths.setData({ type: 'FeatureCollection', features: lineFeatures } as never);
      if (ringFeatures.length || !ringsWereEmpty) {
        impacts?.setData({ type: 'FeatureCollection', features: ringFeatures } as never);
        ringsWereEmpty = ringFeatures.length === 0;
      }

      if (!finished) {
        setFrame(requestAnimationFrame(step));
      } else {
        // Settle on the finished state and stop. Nothing animates at rest.
        paths.setData({ type: 'FeatureCollection', features: targets.map(line) } as never);
        impacts?.setData(EMPTY_FC as never);
        setFrame(null);
      }
    };
    setFrame(requestAnimationFrame(step));
  }

  /**
   * Create the three selection-overlay sources and their four layers once,
   * empty, for the layer that owns the selection.
   *
   * One lifecycle, not two: everything downstream — the theme repaint, the
   * glyph refresh, the frame loop — can then assume the sources exist and only
   * ever `setData()` them. The earlier arrangement created on first selection
   * but *destroyed* on every deselect, so every one of those consumers had to
   * handle both states, and whether the building mark was a symbol or a circle
   * depended on which selection happened to create it.
   *
   * Rebuilt only if a different layer takes the selection, because the
   * overlay's colour and glyph are that layer's.
   */
  private async ensureRelatedLayers(
    layer: ClientLayer,
    rel: NonNullable<ClientLayer['relatedBuildings']>,
  ) {
    if (this.relatedOverlayOwner === layer.id) return;
    if (this.relatedOverlayOwner) this.destroyRelatedLayers();

    const color = this.layerColor(layer);

    // The same glyph the related layer itself draws, so the highlighted
    // building and the one a reader may already have on screen from that layer
    // are recognisably the same mark rather than two conventions for one
    // place. Falls back to a plain disc if the layer names no icon or the
    // glyph didn't resolve.
    const pointLayer = this.layers.find((l) => l.id === rel.layerId);
    if (pointLayer) await this.cacheMarkerExpression(pointLayer);
    const glyph = pointLayer ? this.markerExpressions.get(pointLayer.id) : undefined;

    this.map.addSource(RELATED_BUILDINGS_SOURCE, { type: 'geojson', data: EMPTY_FC as never });
    this.map.addLayer({
      id: RELATED_BUILDINGS_GLOW_LAYER,
      type: 'circle',
      source: RELATED_BUILDINGS_SOURCE,
      paint: {
        'circle-color': color,
        'circle-blur': 0.85,
        'circle-radius': 20,
        'circle-opacity': 0.45,
      },
    });
    this.map.addLayer(
      glyph
        ? {
            id: RELATED_BUILDINGS_LAYER,
            type: 'symbol',
            source: RELATED_BUILDINGS_SOURCE,
            layout: {
              'icon-image': glyph as never,
              // Deliberately larger than the same glyph in its own layer:
              // this one is the answer to a question the reader just asked.
              'icon-size': 1.05,
              'icon-allow-overlap': true,
            },
          }
        : {
            id: RELATED_BUILDINGS_LAYER,
            type: 'circle',
            source: RELATED_BUILDINGS_SOURCE,
            paint: {
              'circle-color': color,
              'circle-radius': 7,
              'circle-stroke-color': this.basemapColor,
              'circle-stroke-width': 2,
            },
          },
    );

    this.map.addSource(RELATED_PATHS_SOURCE, { type: 'geojson', data: EMPTY_FC as never });
    this.map.addLayer({
      id: RELATED_PATHS_LAYER,
      type: 'line',
      source: RELATED_PATHS_SOURCE,
      paint: {
        'line-color': color,
        'line-width': 1.4,
        'line-opacity': 0.75,
        // Still dashed, but now the dashes are the only thing left of the old
        // hedge: this line joins an agency to a reader it told the state was
        // its own, so it is a link and may look like one.
        'line-dasharray': [2, 1.5],
      },
    });

    this.map.addSource(RELATED_IMPACT_SOURCE, { type: 'geojson', data: EMPTY_FC as never });
    this.map.addLayer({
      id: RELATED_IMPACT_LAYER,
      type: 'circle',
      source: RELATED_IMPACT_SOURCE,
      paint: {
        // Growth and fade are expressions over the one `t` the loop writes, so
        // the frame loop never touches paint state.
        'circle-radius': ['interpolate', ['linear'], ['get', 't'], 0, 3, 1, 22] as never,
        'circle-color': 'rgba(0,0,0,0)',
        'circle-stroke-color': color,
        'circle-stroke-width': ['interpolate', ['linear'], ['get', 't'], 0, 3, 1, 0.5] as never,
        'circle-stroke-opacity': ['interpolate', ['linear'], ['get', 't'], 0, 0.9, 1, 0] as never,
      },
    });

    this.relatedOverlayOwner = layer.id;
    this.pinOverlays();
  }

  /** Tear the overlays down entirely. Only for an owner change, and destroy(). */
  private destroyRelatedLayers() {
    for (const id of OVERLAY_STACK) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    for (const id of [RELATED_BUILDINGS_SOURCE, RELATED_PATHS_SOURCE, RELATED_IMPACT_SOURCE]) {
      if (this.map.getSource(id)) this.map.removeSource(id);
    }
    this.relatedOverlayOwner = null;
  }

  private cancelThrow() {
    if (this.throwFrame !== null) {
      cancelAnimationFrame(this.throwFrame);
      this.throwFrame = null;
    }
  }

  /** Stop the throw and empty its two sources, leaving the layers in place. */
  private clearThrownPaths() {
    this.cancelThrow();
    const paths = this.map.getSource(RELATED_PATHS_SOURCE) as GeoJSONSource | undefined;
    const impacts = this.map.getSource(RELATED_IMPACT_SOURCE) as GeoJSONSource | undefined;
    paths?.setData(EMPTY_FC as never);
    impacts?.setData(EMPTY_FC as never);
  }

  /** NearMeControl's click handler: locate on the first press, clear on the second. */
  private toggleNearMe() {
    if (this.nearMeOrigin) {
      this.clearNearMe();
      return;
    }
    // Guards the window between a click and the permission prompt being
    // answered: without it, a second click while the browser's own dialog is
    // still open re-entered here (nearMeOrigin is only set once the first
    // lookup succeeds) and fired a second concurrent getCurrentPosition call.
    if (this.nearMeLocating) return;
    if (!navigator.geolocation) {
      this.events.onNearMeError?.(this.events.locationUnavailableLabel ?? 'Your device could not provide a location.');
      return;
    }
    this.nearMeLocating = true;
    this.nearMeControl?.setActive(true);
    this.events.onNearMeModeChange?.(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.nearMeLocating = false;
        void this.showNearMe([pos.coords.longitude, pos.coords.latitude], pos.coords.accuracy);
      },
      (err) => {
        this.nearMeLocating = false;
        this.nearMeControl?.setActive(false);
        // The mode never actually started — roll the layer-forcing back
        // rather than leaving the reader in it with no location to show.
        this.events.onNearMeModeChange?.(false);
        // Three distinct codes, three distinct reasons — collapsing any pair
        // of them tells the reader something false. A timeout isn't a
        // decline (nobody answered a prompt, the browser just gave up
        // waiting) and POSITION_UNAVAILABLE isn't one either (no fix could
        // be produced — no signal, radio off, indoors — nothing was asked).
        // Matches NearMe.astro's own three-way split on this same API.
        const message =
          err.code === err.PERMISSION_DENIED
            ? this.events.locationDeniedLabel ?? 'Location permission was declined.'
            : err.code === err.TIMEOUT
              ? this.events.locationTimedOutLabel ?? 'Your device took too long to respond.'
              : this.events.locationUnavailableLabel ?? 'Your device could not provide a location.';
        this.events.onNearMeError?.(message);
      },
      { enableHighAccuracy: false, timeout: 10_000 },
    );
  }

  /**
   * Create the "near me" overlay's sources and layers once, empty.
   *
   * Deliberately not folded into ensureRelatedLayers: that method's whole
   * shape is "tear down and rebuild when the *owner* changes" — there is no
   * owner here, just a reader's own point, so this only ever needs to run
   * once per page load and then get setData() calls, same reasoning as
   * ensureRelatedLayers's own comment, one lifecycle simpler because there's
   * nothing here to hand off.
   */
  private ensureNearMeLayers() {
    if (this.nearMeLayersReady) return;

    this.map.addSource(NEARME_PATHS_SOURCE, { type: 'geojson', data: EMPTY_FC as never });
    this.map.addLayer({
      id: NEARME_PATHS_LAYER,
      type: 'line',
      source: NEARME_PATHS_SOURCE,
      paint: {
        'line-color': this.nearMeColor,
        'line-width': 1.4,
        'line-opacity': 0.75,
        'line-dasharray': [2, 1.5],
      },
    });

    this.map.addSource(NEARME_IMPACT_SOURCE, { type: 'geojson', data: EMPTY_FC as never });
    this.map.addLayer({
      id: NEARME_IMPACT_LAYER,
      type: 'circle',
      source: NEARME_IMPACT_SOURCE,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 't'], 0, 3, 1, 22] as never,
        'circle-color': 'rgba(0,0,0,0)',
        'circle-stroke-color': this.nearMeColor,
        'circle-stroke-width': ['interpolate', ['linear'], ['get', 't'], 0, 3, 1, 0.5] as never,
        'circle-stroke-opacity': ['interpolate', ['linear'], ['get', 't'], 0, 0.9, 1, 0] as never,
      },
    });

    // The origin itself — a small glow plus a solid dot, the same two-layer
    // treatment RELATED_BUILDINGS uses for the building a throw comes from,
    // so "here's where this throw starts" reads the same way in both places.
    this.map.addSource(NEARME_ORIGIN_SOURCE, { type: 'geojson', data: EMPTY_FC as never });
    this.map.addLayer({
      id: NEARME_ORIGIN_GLOW_LAYER,
      type: 'circle',
      source: NEARME_ORIGIN_SOURCE,
      paint: {
        'circle-color': this.nearMeColor,
        'circle-blur': 0.85,
        'circle-radius': 20,
        'circle-opacity': 0.45,
      },
    });
    this.map.addLayer({
      id: NEARME_ORIGIN_LAYER,
      type: 'circle',
      source: NEARME_ORIGIN_SOURCE,
      paint: {
        'circle-color': this.nearMeColor,
        'circle-radius': 7,
        'circle-stroke-color': this.basemapColor,
        'circle-stroke-width': 2,
      },
    });

    this.nearMeLayersReady = true;
    this.pinOverlays();
  }

  /**
   * Draw the reader's own location and throw lines to whatever's nearby.
   *
   * `origin` lives only in this call's arguments and the `nearMeOrigin`
   * field below — never in a URL, `localStorage`, or a network request (see
   * NearMe.astro's own "never transmitted" comment; this is the homepage
   * map's equivalent of that same promise).
   *
   * Awaits two things a synchronous version silently got wrong: `ready()`,
   * so a fast GPS fix arriving before the map's own 'load' event can't call
   * addSource/addLayer on a style that isn't done loading (see ready()'s own
   * comment on `hasLoaded` vs `isStyleLoaded()` for why that race is real);
   * and `ensureDataLoaded` per eligible layer, so a layer the reader hasn't
   * switched on in the legend still contributes — `this.data.get(id)` alone
   * is only populated once a layer is toggled visible (loadLayer's own
   * comment), which would otherwise make "what's near me" under-report
   * exactly the layers nobody happened to have on.
   *
   * Candidates are gathered once here, out to NEARME_RADIUS_MAX_MI, and
   * handed to applyNearMeRadius to draw the reader's own starting radius;
   * every further radius change re-slices the same candidate list rather
   * than re-scanning the layers. The camera then autozooms to fit whatever
   * that starting set turns out to be — see refitNearMeCamera.
   */
  private async showNearMe(origin: [number, number], accuracyM: number) {
    await this.ready();
    // A later click while this one is still awaiting data wins — bail if
    // the origin has moved on since this call started.
    const token = (this.nearMeToken += 1);

    const eligible = this.layers.filter((l) => l.nearMeRadiusMi);
    const perLayer = await Promise.all(eligible.map((l) => this.ensureDataLoaded(l.id)));
    if (token !== this.nearMeToken) return;

    this.ensureNearMeLayers();
    this.nearMeOrigin = origin;
    this.nearMeAccuracyM = accuracyM;
    this.nearMeControl?.setActive(true);

    const maxRadiusM = NEARME_RADIUS_MAX_MI * 1609.344;
    const candidates: Array<{ point: [number, number]; distance: number }> = [];
    eligible.forEach((_layer, i) => {
      for (const feature of perLayer[i]) {
        if (feature.geometry.type !== 'Point') continue;
        const point = feature.geometry.coordinates as [number, number];
        const distance = haversineMeters(origin, point);
        if (distance <= maxRadiusM) candidates.push({ point, distance });
      }
    });
    candidates.sort((a, b) => a.distance - b.distance);
    this.nearMeCandidates = candidates;

    (this.map.getSource(NEARME_ORIGIN_SOURCE) as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: origin }, properties: {} }],
    } as never);

    this.nearMeRadiusControl?.reset();
    this.nearMeRadiusControl?.setVisible(true);
    const targets = this.applyNearMeRadius(NEARME_RADIUS_DEFAULT_MI);
    this.refitNearMeCamera(targets);
  }

  /**
   * Re-slice `nearMeCandidates` to `radiusMi` and redraw the throw lines —
   * the only thing that changes as the reader drags NearMeRadiusControl, or
   * on the first draw after a fresh showNearMe. `nearMeOrigin` is the
   * single source of truth for where the throw originates, so origin's own
   * source is untouched here. Returns the drawn targets so callers that
   * also want a camera refit (showNearMe, commitNearMeRadius — not
   * dragNearMeRadius, see its own comment) can hand them to
   * refitNearMeCamera without re-deriving them.
   *
   * `nearMeCandidates` is sorted nearest-first (showNearMe), so this walks
   * from the front and stops the moment a candidate is past `radiusMi` or
   * NEARME_MAX_LINES targets are already collected — O(targets found), not
   * a full-array filter/slice repeated on every drag tick.
   *
   * `announce` skips the aria-live update (onNearMeResult) — set false by
   * dragNearMeRadius's live callback so a screen reader isn't read every
   * intermediate mile of a slider drag, and true on both the initial draw
   * and the slider's commit.
   */
  private applyNearMeRadius(radiusMi: number, announce = true): Array<[number, number]> {
    if (!this.nearMeOrigin) return [];
    const radiusM = radiusMi * 1609.344;
    const targets: Array<[number, number]> = [];
    let totalWithin = 0;
    for (const candidate of this.nearMeCandidates) {
      if (candidate.distance > radiusM) break;
      totalWithin += 1;
      if (targets.length < NEARME_MAX_LINES) targets.push(candidate.point);
    }

    this.throwNearMeLines(this.nearMeOrigin, targets);
    if (announce) {
      // The only accessible-DOM equivalent this control has today: an
      // aria-live count, since the throw itself is canvas-only. Not full
      // parity with /near-me's own record list (see NearMeSummary.list) — a
      // screen-reader user learns how many and how far, not each one by
      // name — but it's the difference between silence and something.
      this.events.onNearMeResult?.(totalWithin, targets.length);
    }
    return targets;
  }

  /**
   * Move the camera to frame `nearMeOrigin` and every camera a line was
   * just thrown at — "Nearest" only helps a reader if the nearest ones are
   * actually visible, on a phone as much as a desktop, so the map's zoom
   * is itself a function of how many cameras the current radius connects:
   * a wide radius with many results zooms out to fit them all; a narrow
   * radius with few (or none) zooms in, down to NEARME_ZOOM's floor. See
   * NEARME_ZOOM's own comment for why that floor doesn't apply when there
   * are targets to fit.
   *
   * cameraForBounds only *computes* the camera; easeToCamera does the
   * actual move, with its moveend/jumpTo landing correction — a bare
   * fitBounds routes through flyTo with no such correction, which here
   * would risk quietly defeating the accuracy clamp on a big jump (see
   * easeToCamera's own comment on the same convergence gap).
   *
   * bearing is passed through explicitly: cameraForBounds otherwise
   * assumes north-up (bearing 0) regardless of the map's actual bearing,
   * sizing the box for a viewport the reader isn't looking at. Nothing
   * here changes bearing itself — easeToCamera only ever sets
   * center/zoom — so passing the live bearing back in just keeps the fit
   * honest about the frame it's actually being fit into.
   *
   * The zoom ceiling — accuracyZoomCap's honesty clamp (§0.2, §0.7), and
   * for the no-target case the NEARME_ZOOM floor as well — is computed
   * once and handed to cameraForBounds as its own `maxZoom`, rather than
   * left to override the result afterwards: overriding zoom post hoc
   * without recomputing center leaves the two disagreeing about which
   * zoom the sheet-padding offset was computed for, silently shrinking
   * that offset. Passed only when finite: accuracy of exactly 0 (no fix
   * recorded yet, or a mocked one — real fixes are never exactly 0) makes
   * accuracyZoomCap return +Infinity, and a container with zero real width
   * or height (a hidden ancestor mid-layout) makes it -Infinity — either
   * one reaching MapLibre as `maxZoom` produces a NaN camera, so neither
   * is ever passed; cameraForBounds is left to its own default instead.
   */
  private refitNearMeCamera(targets: Array<[number, number]>) {
    if (!this.nearMeOrigin) return;
    const container = this.map.getContainer();
    const minDimensionPx = Math.min(container.clientWidth, container.clientHeight);
    const cap = accuracyZoomCap(this.nearMeAccuracyM, this.nearMeOrigin[1], minDimensionPx);
    const floor = Math.max(this.map.getZoom(), NEARME_ZOOM);
    const intendedZoom = targets.length > 0 ? cap : Number.isFinite(cap) ? Math.min(floor, cap) : floor;
    const bounds = bboxOf({ type: 'MultiPoint', coordinates: [this.nearMeOrigin, ...targets] });
    const fit = this.map.cameraForBounds(
      [
        [bounds[0], bounds[1]],
        [bounds[2], bounds[3]],
      ],
      {
        padding: this.fitPadding(),
        bearing: this.map.getBearing(),
        ...(Number.isFinite(intendedZoom) ? { maxZoom: intendedZoom } : {}),
      },
    );
    const fitCenter = fit?.center != null ? maplibregl.LngLat.convert(fit.center) : null;
    const fitZoom = fit?.zoom != null && Number.isFinite(fit.zoom) ? fit.zoom : null;
    const camera =
      fitCenter && fitZoom != null
        ? { center: [fitCenter.lng, fitCenter.lat] as [number, number], zoom: fitZoom }
        : { center: this.nearMeOrigin, zoom: floor };
    this.easeToCamera(camera, REDUCED_MOTION ? 0 : 600);
  }

  /**
   * NearMeRadiusControl's `input` handler — fires on every integer step a
   * drag crosses, up to ~24 times across the slider's full range in well
   * under a second. Redrawing/refitting on every one of those would cancel
   * and restart throwNearMeLines' rAF animation (and its underlying
   * `setData` — "a worker round trip with a re-parse and re-index, not a
   * cheap buffer write," per runThrow's own comment), and kick off a fresh
   * easeToCamera, that often — so ticks are coalesced to at most one
   * redraw+refit per animation frame: a tick just records the latest
   * requested radius, and only the first tick in a frame schedules the
   * rAF callback that actually applies it.
   *
   * No aria-live announcement here either way (see applyNearMeRadius's own
   * comment) — a screen-reader user gets the count once, on commit, not
   * once per mile the drag happens to cross.
   */
  private dragNearMeRadius(radiusMi: number) {
    this.pendingNearMeRadiusMi = radiusMi;
    if (this.nearMeDragFrame !== null) return;
    this.nearMeDragFrame = requestAnimationFrame(() => {
      this.nearMeDragFrame = null;
      if (this.pendingNearMeRadiusMi === null) return;
      const targets = this.applyNearMeRadius(this.pendingNearMeRadiusMi, false);
      // Newly-connected cameras a wider drag just pulled in are otherwise
      // drawn off-screen until the reader lets go — the camera has to
      // follow live, not just redraw the lines, or a farther-out camera is
      // invisible the whole time it's actually "connected." Each tick's
      // easeToCamera restarts from wherever the last one left off, which
      // reads as the view tracking the drag rather than N separate jumps —
      // same restart-in-place behavior any of this class's other
      // easeToCamera call sites already rely on for a fast second call.
      this.refitNearMeCamera(targets);
    });
  }

  /** NearMeRadiusControl's `change` handler — fires once on release; commits the value, announces the result, and refits the camera to the newly-connected set. */
  private commitNearMeRadius(radiusMi: number) {
    // A commit right after the last coalesced drag frame already queued
    // itself would otherwise redraw twice for the same value — cancel
    // whatever's pending so this call is the one that actually lands.
    if (this.nearMeDragFrame !== null) {
      cancelAnimationFrame(this.nearMeDragFrame);
      this.nearMeDragFrame = null;
    }
    this.pendingNearMeRadiusMi = null;
    const targets = this.applyNearMeRadius(radiusMi, true);
    this.refitNearMeCamera(targets);
  }

  /**
   * throwPaths's near-me twin. Shares runThrow's animation math (see its own
   * comment) but keeps its own rAF handle (nearMeThrowFrame) and its own
   * pair of sources, so a jurisdiction throw and a near-me throw can be on
   * screen — and animating — at the same time without cancelling each other.
   */
  private throwNearMeLines(origin: [number, number], targets: Array<[number, number]>) {
    this.cancelNearMeThrow();
    this.runThrow(origin, targets, NEARME_PATHS_SOURCE, NEARME_IMPACT_SOURCE, (id) => {
      this.nearMeThrowFrame = id;
    });
  }

  private cancelNearMeThrow() {
    if (this.nearMeThrowFrame !== null) {
      cancelAnimationFrame(this.nearMeThrowFrame);
      this.nearMeThrowFrame = null;
    }
  }

  /** Undo showNearMe — clears the marker and lines, and the control's pressed state. */
  private clearNearMe() {
    this.cancelNearMeThrow();
    if (this.nearMeDragFrame !== null) {
      cancelAnimationFrame(this.nearMeDragFrame);
      this.nearMeDragFrame = null;
    }
    this.pendingNearMeRadiusMi = null;
    // Supersedes any showNearMe still awaiting ensureDataLoaded, so a slow
    // fetch that resolves after a clear can't resurrect the overlay.
    this.nearMeToken += 1;
    this.nearMeOrigin = null;
    this.nearMeCandidates = [];
    this.nearMeControl?.setActive(false);
    this.nearMeRadiusControl?.setVisible(false);
    this.events.onNearMeModeChange?.(false);
    (this.map.getSource(NEARME_ORIGIN_SOURCE) as GeoJSONSource | undefined)?.setData(EMPTY_FC as never);
    (this.map.getSource(NEARME_PATHS_SOURCE) as GeoJSONSource | undefined)?.setData(EMPTY_FC as never);
    (this.map.getSource(NEARME_IMPACT_SOURCE) as GeoJSONSource | undefined)?.setData(EMPTY_FC as never);
  }

  /**
   * Undo showRelatedBuildings. Called wherever a selection itself clears.
   *
   * Empties the overlays rather than destroying them — see ensureRelatedLayers
   * for why there is only one lifecycle now. An empty source draws nothing and
   * costs nothing.
   */
  private clearRelatedBuildings() {
    this.clearThrownPaths();
    (this.map.getSource(RELATED_BUILDINGS_SOURCE) as GeoJSONSource | undefined)?.setData(
      EMPTY_FC as never,
    );
  }

  /**
   * Return to exactly the view a reader who just opened the page sees —
   * METRO_BOUNDS, the same fitBounds call 'load' above runs — not the
   * statewide MN_BOUNDS. A reset that lands somewhere the reader never
   * actually started from is not a reset.
   */
  resetView() {
    this.map.fitBounds(METRO_BOUNDS, {
      padding: this.fitPadding(24),
      duration: REDUCED_MOTION ? 0 : 500,
    });
  }

  /** A transient marker showing the point a "near me" lookup was run from. */
  markPoint(center: [number, number], label: string) {
    this.popup?.remove();
    this.popup = new maplibregl.Popup({ closeOnClick: false, offset: 10 })
      .setLngLat(center)
      .setText(label)
      .addTo(this.map);
  }

  getFeatures(layerId: string): LoadedFeature[] {
    return this.data.get(layerId) ?? [];
  }

  destroy() {
    this.setOverlay(null);
    this.cancelThrow();
    this.cancelNearMeThrow();
    this.popup?.remove();
    this.hoverPopup?.remove();
    this.disposeContainerWatch?.();
    if (this.resizeSettleTimer != null) clearTimeout(this.resizeSettleTimer);
    // Explicit onRemove() for all four — map.remove() only tears down
    // controls added via map.addControl(), and these were deliberately
    // kept out of that list (see the constructor).
    this.attribObserver?.disconnect();
    this.themeControl?.onRemove();
    this.resetViewControl?.onRemove();
    this.nearMeControl?.onRemove();
    this.nearMeRadiusControl?.onRemove();
    this.navControl?.onRemove();
    this.attribControl?.onRemove();
    this.map.remove();
  }
}

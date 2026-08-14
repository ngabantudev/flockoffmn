import maplibregl, { type Map as MLMap, type GeoJSONSource } from 'maplibre-gl';
import { Protocol as PMTilesProtocol } from 'pmtiles';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import {
  baseStyle,
  basemapBackgroundColor,
  BASEMAP_LAYERS,
  FLAVOR_VARIANT_PAINT_KEYS,
  METRO_BOUNDS,
  METRO_CENTER,
  MN_BOUNDS,
} from './mapStyle';
import { bboxOf, representativePoint } from './geo.mjs';
import { Shield, Star, Landmark, Building2, type IconNode } from 'lucide';
import { groupBlocks } from './blocks';
import { MAP_STYLES, initialMapStyle, onMapStyleChange, type MapStyleId } from './theme';
import { ThemeControl } from './themeControl';
import type { FeatureProperties, LayerId } from '~/layers/types';

/** The subset of a LayerDefinition the browser needs, serialised by Astro. */
export interface ClientLayer {
  id: LayerId;
  /** See LayerDefinition's own comment in layers/types.ts. */
  defaultOn?: boolean;
  label: string;
  summary: string;
  whatThisMeans: string;
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
  };
  /** Write an attribute's value on each polygon, the way the source document did. */
  labelBy?: { key: string };
  /** See LayerDefinition's own comment in layers/types.ts. */
  polygonClick?: 'highlight';
  /** See LayerDefinition's own comment in layers/types.ts. */
  markerIcon?: { icon: string; byValue?: { key: string; icons: Record<string, string> } };
  /** See LayerDefinition's own comment in layers/types.ts. Strings already localised. */
  hoverCard?: {
    fields: string[];
    related?: {
      layerId: LayerId;
      fromKey: string;
      joinKey: string;
      labelKey: string;
      linkKey?: string;
      title: string;
      empty: string;
      max?: number;
    };
    note?: string;
  };
  /** See LayerDefinition's own comment in layers/types.ts. */
  relatedBuildings?: {
    layerId: LayerId;
    joinKey: string;
    pathsTo?: { layerId: LayerId; joinKey: string };
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
  dataPath: string;
  filters: {
    key: string;
    label: string;
    kind: 'enum' | 'dateRange';
    values: string[];
    /** Observed values this layer opens with unticked. See FilterDefinition. */
    defaultExcluded?: string[];
  }[];
  detailFields: { key: string; label: string; format?: string }[];
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
}

const REDUCED_MOTION =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const EMPTY_FC: FeatureCollection = { type: 'FeatureCollection', features: [] };

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
 * The line-throw on selecting a jurisdiction, in milliseconds.
 *
 * Each line is thrown from the agency's own building to one reader that
 * agency reported operating, and lands with a ring at both ends. Staggered
 * rather than simultaneous so a reader can count them — the number of
 * readers one department reported is the finding, and fifteen lines arriving
 * at once is a single event where fifteen arriving in sequence is fifteen.
 *
 * Strictly bounded: every line has landed by THROW_MS + the largest stagger,
 * the rings fade over IMPACT_MS, and the loop then stops itself. Nothing
 * here animates at rest — see the `pulse` field's own comment in
 * layers/types.ts for the earlier, unbounded animation this deliberately
 * does not repeat.
 */
const THROW_MS = 420;
const THROW_STAGGER_MS = 70;
const IMPACT_MS = 520;

/**
 * Every icon a `markerIcon` entry can name, by the string the registry
 * writes — the same closed-set-by-name arrangement IMPACT_SPHERE_ICONS uses
 * in MapView, and for the same reason: the registry stays a data file, and a
 * name it makes up resolves to nothing rather than to an arbitrary import.
 */
const MARKER_ICONS: Record<string, IconNode> = { Shield, Star, Landmark, Building2 };

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
  private rawData = new Map<string, LoadedFeature[]>();
  private data = new Map<string, LoadedFeature[]>();
  private visible = new Set<string>();
  private filters = new Map<string, FilterState>();
  private loading = new Set<string>();
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
  private cachedBasemapColor = basemapBackgroundColor(this.basemapDark);
  /** Where the reader was before a tapped record moved the camera to it. */
  private preSelectCamera: { center: [number, number]; zoom: number } | null = null;
  /** The one feature-state-highlighted polygon per `polygonClick: 'highlight'` layer, if any. */
  private selectedPolygon = new Map<string, string>();
  /**
   * Resolved `markerIcon` expression per layer, filled in by loadLayer
   * before it draws. Cached because building it decodes an SVG per icon, and
   * because addLayer — which needs it — is synchronous.
   */
  private markerExpressions = new Map<string, maplibregl.ExpressionSpecification | string>();
  /** rAF handle for the path-throw animation, so a new selection can cancel the last. */
  private throwFrame: number | null = null;
  /** Separate from `popup`, which is the "near me" marker and must survive a hover. */
  private hoverPopup: maplibregl.Popup | null = null;
  /**
   * The one hover-previewed polygon per `polygonClick: 'highlight'` layer.
   * Tracked here rather than as a closure inside bindHighlightSelect so
   * clearSelection can release it too — a fitBounds/easeTo the reader
   * triggered by clicking moves the ground out from under a still pointer,
   * and nothing fires another 'mousemove' to notice until the reader's own
   * cursor moves again, which would otherwise leave the just-deselected
   * polygon visibly hovered under a pointer that never left it.
   */
  private hoveredPolygon = new Map<string, string>();

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
      attributionControl: { compact: true },
      // The canvas is not usable by a screen reader; the record list beside it
      // is the accessible equivalent, so keep the canvas out of the tab order.
      // Keyboard panning still works once the map is focused deliberately.
      dragRotate: false,
      pitchWithRotate: false,
    });

    // Added before NavigationControl so it stacks above the zoom buttons —
    // MapLibre stacks same-position controls in the order they're added, and
    // "map theme / site theme" reads as a settings entry point, which belongs
    // above the more frequently-used zoom controls, not buried below them.
    this.map.addControl(new ThemeControl(), 'top-right');
    this.map.addControl(
      new maplibregl.NavigationControl({ showCompass: false, visualizePitch: false }),
      'top-right',
    );
    this.map.addControl(new maplibregl.ScaleControl({ unit: 'imperial' }), 'bottom-left');

    // The basemap is independent of every other layer here — swapping it is
    // just re-setting BASEMAP_LAYERS' paint properties, never map.setStyle()
    // (which would drop every registry layer this class has added). Queued
    // on 'load' if a visitor toggles before the map has finished its first
    // style load, since setPaintProperty on a layer that doesn't exist yet
    // throws.
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
      const err = e as unknown as { sourceId?: string };
      if (err.sourceId === 'basemap') {
        this.events.onError?.('basemap', 'Base map unavailable — layers and search still work.');
      }
    });

    this.map.on('load', () => {
      this.hasLoaded = true;
      // Metro on load, not the statewide MN_BOUNDS — see METRO_CENTER's
      // comment in mapStyle.ts. MN_BOUNDS is still where the "Reset to
      // Minnesota" button (resetView(), below) sends a reader who has
      // panned or filtered elsewhere and wants the whole state back.
      this.map.fitBounds(METRO_BOUNDS, { padding: 24, animate: false });
    });

    // A tap that lands on nothing of ours is the reader stepping back out of
    // a record, the way closing it would be — so it gets the same undo: the
    // camera returns to where a pin's tap first moved it from, and the detail
    // panel closes. Queried directly rather than inferred from whether a
    // per-layer click handler also fired, so this owes nothing to listener
    // registration order against handlers bound as layers arrive.
    this.map.on('click', (e) => {
      const ids = this.interactiveStyleLayerIds();
      if (!ids.length) return;
      if (this.map.queryRenderedFeatures(e.point, { layers: ids }).length) return;
      this.clearSelection();
    });
  }

  /**
   * Re-keys the basemap without map.setStyle() — that would drop every
   * source/layer this class has added for the registry layers and density
   * threads. The vector basemap has one source and ~20 layers
   * (BASEMAP_LAYERS in mapStyle.ts) instead of the old raster setup's one
   * source and two paint properties, but the principle is the same: every
   * paint key that *can* differ between flavors gets re-set here, every
   * time, for every layer — never left to whatever a previous flavor
   * happened to set. That's what makes a bug like the old
   * raster-brightness-max reset (a paint key MapLibre won't revert on its
   * own just because a later call omits it) structurally impossible instead
   * of something to remember by hand. "Can differ" is FLAVOR_VARIANT_PAINT_KEYS
   * (mapStyle.ts) — precomputed by literally comparing both flavors' paint
   * output, not a hand-picked subset — so a key that's provably identical
   * either way (most `line-width` curves, for instance) is skipped rather
   * than redundantly reapplied to every one of ~20 layers on every toggle.
   */
  setBasemap(styleId: MapStyleId): void {
    const dark = MAP_STYLES[styleId].dark;
    for (const layer of BASEMAP_LAYERS) {
      if (!this.map.getLayer(layer.id)) continue;
      const paint = layer.paint(dark);
      for (const key of FLAVOR_VARIANT_PAINT_KEYS.get(layer.id) ?? []) {
        this.map.setPaintProperty(layer.id, key, paint[key]);
      }
    }

    if (dark !== this.basemapDark) {
      this.basemapDark = dark;
      this.cachedBasemapColor = basemapBackgroundColor(dark);
      this.repaintThemedLayers();
    }
  }

  /**
   * The basemap's own background colour — casings/halos/strokes are drawn in
   * this so a coloured mark reads against the map instead of floating on it.
   * A cached field, not a live lookup: `repaintThemedLayers()` reads this
   * once per registry layer (dozens, potentially), and re-deriving it every
   * time meant a linear scan over BASEMAP_LAYERS plus a fresh paint-object
   * allocation on every single read of a value that's constant for the
   * entire loop and only ever changes when `basemapDark` flips — see
   * `setBasemap()`, the only place that invalidates it.
   */
  private get basemapColor(): string {
    return this.cachedBasemapColor;
  }

  /** A layer's identity colour for the current basemap. See LayerDefinition.colorLight's comment in layers/types.ts for why this can fall back to `color`. */
  private layerColor(layer: ClientLayer): string {
    return this.basemapDark ? layer.color : (layer.colorLight ?? layer.color);
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
          this.map.setPaintProperty(`${layer.id}-fill`, 'fill-color', [
            'coalesce',
            ['get', 'holcFill'],
            this.layerColor(layer),
          ] as unknown as maplibregl.ExpressionSpecification);
        }
        if (this.map.getLayer(`${layer.id}-labels`)) {
          this.map.setPaintProperty(`${layer.id}-labels`, 'text-halo-color', this.basemapColor);
        }
      }

      if (this.map.getLayer(`${layer.id}-points`)) {
        const circleColor = this.pointCircleColor(layer);
        this.map.setPaintProperty(`${layer.id}-points`, 'circle-color', circleColor);
        this.map.setPaintProperty(
          `${layer.id}-points`,
          'circle-stroke-color',
          layer.pointStrokeColor ?? this.basemapColor,
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
  }

  /** Style layers a tap can select a record on. See bindInteractions. */
  private interactiveStyleLayerIds(): string[] {
    return this.layers
      .flatMap((l) => [`${l.id}-fill`, `${l.id}-line-hit`, `${l.id}-points`])
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
    for (const [layerId, featureId] of this.selectedPolygon) {
      this.map.setFeatureState(
        { source: this.sourceId(layerId), id: featureId },
        { selected: false },
      );
    }
    this.selectedPolygon.clear();
    for (const [layerId, featureId] of this.hoveredPolygon) {
      this.map.setFeatureState({ source: this.sourceId(layerId), id: featureId }, { hover: false });
    }
    this.hoveredPolygon.clear();
    this.clearRelatedBuildings();
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
  private ensureConeSprite(layer: ClientLayer, arc: number): string | null {
    const rounded = Math.round(arc);
    // Theme suffix, not just layer+arc: the sprite is a baked bitmap, colour
    // included, so a basemap change needs a genuinely different cached image
    // rather than a repaint — see repaintThemedLayers(), which calls
    // refresh() for any layer with bearingKey specifically so this runs
    // again with the new basemapDark and produces a freshly-coloured sprite
    // under a new id instead of reusing the stale one.
    const id = `${layer.id}-cone-${rounded}-${this.basemapDark ? 'dark' : 'light'}`;
    if (this.map.hasImage(id)) return id;

    const pixelRatio = 2;
    const px = 52 * pixelRatio;
    const canvas = document.createElement('canvas');
    canvas.width = px;
    canvas.height = px;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

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

    this.map.addImage(id, ctx.getImageData(0, 0, px, px), { pixelRatio });
    return id;
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
  private async ensureMarkerIcon(layer: ClientLayer, iconName: string): Promise<string | null> {
    const node = MARKER_ICONS[iconName];
    if (!node) return null;
    const id = `${layer.id}-icon-${iconName}-${this.basemapDark ? 'dark' : 'light'}`;
    if (this.map.hasImage(id)) return id;

    const pixelRatio = 2;
    const px = 30 * pixelRatio;
    const color = this.layerColor(layer);
    const inner = px * 0.62;

    // lucide ships each icon as [tag, attrs][]; rebuild it as standalone SVG
    // markup rather than through createElement so this stays a string the
    // canvas can decode without ever attaching a node to the document.
    const body = node
      .map(
        ([tag, attrs]) =>
          `<${tag} ${Object.entries(attrs)
            .map(([k, v]) => `${k}="${String(v)}"`)
            .join(' ')}/>`,
      )
      .join('');
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${inner}" height="${inner}" viewBox="0 0 24 24"` +
      ` fill="none" stroke="${color}" stroke-width="2.25" stroke-linecap="round"` +
      ` stroke-linejoin="round">${body}</svg>`;

    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    try {
      await img.decode();
    } catch {
      return null;
    }

    const canvas = document.createElement('canvas');
    canvas.width = px;
    canvas.height = px;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

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

    this.map.addImage(id, ctx.getImageData(0, 0, px, px), { pixelRatio });
    return id;
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
      const id = await this.ensureMarkerIcon(layer, iconName);
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

  private firstStyleLayer(match: (id: string) => boolean): string | undefined {
    for (const styleLayer of this.map.getStyle().layers ?? []) {
      if (match(styleLayer.id)) return styleLayer.id;
    }
    return undefined;
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

    const owned = (this.map.getStyle().layers ?? [])
      .map((styleLayer) => {
        const layer = this.layers.find((l) => styleLayer.id.startsWith(`${l.id}-`));
        if (!layer) return null;
        return { styleId: styleLayer.id, layer };
      })
      .filter((o) => o !== null);

    owned.sort(
      (a, b) => a.layer.stackRank - b.layer.stackRank || byShape[a.layer.geometry] - byShape[b.layer.geometry],
    );

    // Bottom to top, each moved to the top in turn: the last one moved ends up
    // highest, so walking the desired order forwards produces it exactly.
    for (const { styleId } of owned) this.map.moveLayer(styleId);
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
    if (this.data.has(layerId)) return this.data.get(layerId) ?? [];
    const layer = this.layers.find((l) => l.id === layerId);
    if (!layer) return [];
    try {
      const res = await fetch(layer.dataPath);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const collection = await res.json();
      const features: LoadedFeature[] = collection.features ?? [];
      this.rawData.set(layerId, features);
      this.data.set(layerId, features);
      return features;
    } catch {
      return [];
    }
  }

  /** Fetch a layer's GeoJSON the first time it is switched on (spec §8, lazy load). */
  async loadLayer(layer: ClientLayer): Promise<void> {
    if (this.data.has(layer.id) || this.loading.has(layer.id)) return;
    this.loading.add(layer.id);
    try {
      const res = await fetch(layer.dataPath);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const collection = await res.json();
      const features: LoadedFeature[] = collection.features ?? [];
      this.rawData.set(layer.id, features);
      this.data.set(layer.id, features);
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
      // Polygons colour by declared category where the registry names one, so
      // the legend swatches and the ground read from the same table. A
      // highlight-mode layer instead stays one neutral tone until a tap sets
      // its feature-state, at which point it alone switches to the layer's
      // own colour — see NEUTRAL_POLYGON_DARK/LIGHT's comment. Otherwise keep
      // the historical-document behaviour: the colour the source printed on
      // the original sheet where we have it, then the layer's own.
      const polygonColor = (
        highlightMode
          ? [
              'case',
              [
                'any',
                ['boolean', ['feature-state', 'selected'], false],
                ['boolean', ['feature-state', 'hover'], false],
              ],
              this.layerColor(layer),
              this.basemapDark ? NEUTRAL_POLYGON_DARK : NEUTRAL_POLYGON_LIGHT,
            ]
          : layer.categoryColors
            ? [
                'match',
                ['get', layer.categoryColors.key],
                ...layer.categoryColors.colors.flatMap(({ value, color }) => [value, color]),
                layer.categoryColors.fallback,
              ]
            : ['coalesce', ['get', 'holcFill'], this.layerColor(layer)]
      ) as unknown as maplibregl.ExpressionSpecification;

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
            'fill-opacity': highlightMode
              ? // A blank ward stays a light wash. Hover and selected sit
                // close together on purpose — for a `relatedBuildings` layer
                // the polygon is context, not the finding; the thing that
                // actually lights up on selection is the building itself
                // (see showRelatedBuildings), so the polygon settles rather
                // than blazing full-strength the way a plain highlight layer
                // still would (see the outline width below for that case).
                ([
                  'case',
                  ['boolean', ['feature-state', 'selected'], false],
                  layer.relatedBuildings ? 0.24 : 0.42,
                  ['boolean', ['feature-state', 'hover'], false],
                  0.28,
                  0.16,
                ] as unknown as maplibregl.ExpressionSpecification)
              : layer.blockAggregate
                ? ([
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    layer.blockAggregate.blocksUntil,
                    0,
                    layer.blockAggregate.detailFrom,
                    0.42,
                  ] as unknown as maplibregl.ExpressionSpecification)
                : 0.42,
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
            'line-color': polygonColor,
            // A hovered ward's border thickens a little, a tapped one thickens
            // further, so the state reads at a glance even for a reader who
            // can't tell the fill colours apart.
            'line-width': highlightMode
              ? ([
                  'case',
                  ['boolean', ['feature-state', 'selected'], false],
                  layer.relatedBuildings ? 1.6 : 2.5,
                  ['boolean', ['feature-state', 'hover'], false],
                  1.8,
                  1.1,
                ] as unknown as maplibregl.ExpressionSpecification)
              : 1.1,
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
      if (layer.labelBy) {
        // The identifier the source printed on the area, in the area's own
        // colour over a basemap-dark halo. Null attributes draw nothing, and
        // colliding labels hide rather than stack as the view pulls back.
        this.map.addLayer({
          id: `${layer.id}-labels`,
          type: 'symbol',
          source: src,
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
        'circle-stroke-color': layer.pointStrokeColor ?? this.basemapColor,
        /*
         * Dots fade in rather than switching on at a single zoom.
         *
         * Every record is in this layer at every zoom; what changes is how much
         * of it you can see. Between the two zooms the layer names, a dot goes
         * from nothing to solid, so there is no scale at which the map replaces
         * one drawing with another. A layer that names no scale is solid
         * throughout, which is every layer whose records are readable as dots
         * from the whole state.
         */
        'circle-stroke-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          tier.emergeFrom, 0,
          tier.pointsFrom, 1.2,
        ] as unknown as maplibregl.ExpressionSpecification,
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
    let shownId: string | null = null;

    const hide = () => {
      shownId = null;
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
      if (this.selectedPolygon.get(layer.id) === id) return hide();
      if (id === shownId) {
        this.hoverPopup?.setLngLat(e.lngLat);
        return;
      }
      const feature = this.data.get(layer.id)?.find((f) => f.properties.id === id);
      if (!feature) return hide();

      shownId = id;
      const card = this.buildHoverCard(layer, feature);
      if (!this.hoverPopup) {
        this.hoverPopup = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 14,
          maxWidth: '20rem',
          className: 'hover-card',
        });
      }
      this.hoverPopup.setLngLat(e.lngLat).setDOMContent(card).addTo(this.map);
    });

    this.map.on('mouseleave', mapLayerId, hide);
  }

  /** Assemble one hover card. See bindHoverCard for why this is DOM, not HTML. */
  private buildHoverCard(layer: ClientLayer, feature: LoadedFeature): HTMLElement {
    const spec = layer.hoverCard!;
    const attrs = feature.properties.attributes as Record<string, unknown>;
    const root = document.createElement('div');
    // The record list beside the map is the accessible interface (spec §4);
    // this is a pointer-only shortcut to it, so it is not announced twice.
    root.setAttribute('aria-hidden', 'true');
    root.className = 'space-y-1.5 text-[12px] leading-snug';

    const title = document.createElement('p');
    title.className = 'font-semibold text-[13px]';
    title.textContent = feature.properties.name;
    root.append(title);

    const labelFor = (key: string) =>
      layer.detailFields.find((f) => f.key === key)?.label ?? key;

    for (const key of spec.fields) {
      const value = attrs[key];
      if (value === null || value === undefined || value === '') continue;
      const row = document.createElement('p');
      const label = document.createElement('span');
      label.className = 'opacity-60';
      label.textContent = `${labelFor(key)}: `;
      row.append(label, document.createTextNode(String(value)));
      root.append(row);
    }

    const rel = spec.related;
    if (rel) {
      const heading = document.createElement('p');
      heading.className = 'pt-1 font-semibold';
      const joinValue = attrs[rel.fromKey];
      // Records are only counted where this record actually carries the
      // joining value; a building with no jurisdiction has no filing to
      // show, which is different from a department that filed nothing.
      const loaded = this.data.has(rel.layerId);
      const matches =
        joinValue == null || !loaded
          ? []
          : (this.data.get(rel.layerId) ?? []).filter(
              (f) => f.properties.attributes[rel.joinKey] === joinValue,
            );

      if (!loaded) {
        // Say nothing rather than the wrong thing: until the other layer is
        // in hand, "none reported" would be a claim we cannot make yet.
        heading.textContent = rel.title;
        const pending = document.createElement('p');
        pending.className = 'opacity-70';
        pending.textContent = '…';
        root.append(heading, pending);
      } else if (!matches.length) {
        heading.textContent = rel.title;
        const empty = document.createElement('p');
        empty.className = 'opacity-70';
        empty.textContent = rel.empty;
        root.append(heading, empty);
      } else {
        heading.textContent = `${rel.title} (${matches.length})`;
        root.append(heading);
        const list = document.createElement('ul');
        list.className = 'list-disc space-y-0.5 pl-4 opacity-80';
        for (const m of matches.slice(0, rel.max ?? 4)) {
          const li = document.createElement('li');
          li.textContent = String(m.properties.attributes[rel.labelKey] ?? '');
          list.append(li);
        }
        root.append(list);
        const hidden = matches.length - (rel.max ?? 4);
        if (hidden > 0) {
          const more = document.createElement('p');
          more.className = 'opacity-60';
          more.textContent = `+${hidden} more`;
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
          cite.className = 'underline';
          cite.textContent = 'The filing these come from';
          root.append(cite);
        }
      }
    }

    if (spec.note) {
      const note = document.createElement('p');
      note.className = 'pt-1 opacity-60';
      note.textContent = spec.note;
      root.append(note);
    }
    return root;
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
      const hoveredId = this.hoveredPolygon.get(layer.id);
      if (id === hoveredId) return;
      if (hoveredId) this.map.setFeatureState({ source: src, id: hoveredId }, { hover: false });
      if (id) {
        this.map.setFeatureState({ source: src, id }, { hover: true });
        this.hoveredPolygon.set(layer.id, id);
      } else {
        this.hoveredPolygon.delete(layer.id);
      }
    });
    this.map.on('mouseleave', mapLayerId, () => {
      const hoveredId = this.hoveredPolygon.get(layer.id);
      if (hoveredId) this.map.setFeatureState({ source: src, id: hoveredId }, { hover: false });
      this.hoveredPolygon.delete(layer.id);
    });

    this.map.on('click', mapLayerId, (e) => {
      const hit = e.features?.[0];
      if (!hit) return;
      const id = (hit.properties as Record<string, unknown>)?.id as string;
      if (!id) return;

      // A tap on the ward already showing is the reader putting it back —
      // the one thing focusFeature can't infer, since it has no notion of a
      // second visit. Everything else about selecting (the highlight, the
      // panel, the fit, the thrown lines) belongs to focusFeature, which
      // search and the record list reach too.
      if (this.selectedPolygon.get(layer.id) === id) {
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
      this.applyVisibility(layer);
    }
  }

  private applyVisibility(layer: ClientLayer) {
    const on = this.visible.has(layer.id);
    for (const suffix of [
      '-fill',
      '-outline',
      '-line-casing',
      '-line',
      '-line-hit',
      '-points-glow',
      '-points',
      '-cones',
      '-labels',
    ]) {
      const id = `${layer.id}${suffix}`;
      if (this.map.getLayer(id)) {
        this.map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
      }
    }
    this.emitCounts();
  }

  /** Where the reader was before a filter first moved the camera. */
  private preFilterCamera: { center: [number, number]; zoom: number } | null = null;

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
      { padding: 48, maxZoom: 13, duration: REDUCED_MOTION ? 0 : 600 },
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

  /** Centre on a feature and open its detail. Used by the record list and search. */
  focusFeature(layerId: string, featureId: string) {
    const feature = this.data.get(layerId)?.find((f) => f.properties.id === featureId);
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
    this.events.onSelect?.(feature, layer);
    this.map.resize();

    const duration = REDUCED_MOTION ? 0 : 500;
    if (feature.geometry.type === 'Point') {
      this.map.easeTo({
        center: representativePoint(feature.geometry) as [number, number],
        zoom: Math.max(this.map.getZoom(), 13),
        duration,
      });
    } else {
      // A line record can be miles long. Centring it at a fixed zoom shows a
      // piece of it and hides the length, which is the one thing the record
      // exists to convey, so fit the whole extent instead. Polygons get the
      // same treatment for the same reason.
      const [minLng, minLat, maxLng, maxLat] = bboxOf(feature.geometry);
      this.map.fitBounds(
        [
          [minLng, minLat],
          [maxLng, maxLat],
        ],
        { padding: 64, maxZoom: 14, duration },
      );
    }

    // Selection behaviour lives here rather than in the map's own click
    // handler because this is the one funnel every route to a record passes
    // through — a tap on the map, a search result, a row in the accessible
    // record list. Putting it on the click alone meant a jurisdiction picked
    // from search opened its panel but never highlighted its ward or threw
    // its lines, which is the same selection reached a different way.
    if (layer.polygonClick === 'highlight') this.markPolygonSelected(layer, featureId);
    if (layer.relatedBuildings) void this.showRelatedBuildings(feature, layer);
  }

  /** Move a highlight layer's exclusive selection to one feature. */
  private markPolygonSelected(layer: ClientLayer, featureId: string) {
    const src = this.sourceId(layer.id);
    const current = this.selectedPolygon.get(layer.id);
    if (current === featureId) return;
    if (current) this.map.setFeatureState({ source: src, id: current }, { selected: false });
    this.map.setFeatureState({ source: src, id: featureId }, { selected: true });
    this.selectedPolygon.set(layer.id, featureId);
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

    const [minLng, minLat, maxLng, maxLat] = bboxOf(feature.geometry);
    this.map.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      { padding: 48, maxZoom: 13, duration: REDUCED_MOTION ? 0 : 600 },
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

    const buildings = await this.ensureDataLoaded(rel.layerId);
    const matched = buildings.filter(
      (f) => f.properties.attributes[rel.joinKey] === jurisdiction.properties.id,
    );

    const buildingsSrc = this.map.getSource(RELATED_BUILDINGS_SOURCE) as GeoJSONSource | undefined;
    const buildingsFC = this.flatten(matched);
    if (buildingsSrc) {
      buildingsSrc.setData(buildingsFC as never);
    } else if (matched.length) {
      this.map.addSource(RELATED_BUILDINGS_SOURCE, { type: 'geojson', data: buildingsFC as never });
      const buildingColor = this.layerColor(layer);
      this.map.addLayer({
        id: RELATED_BUILDINGS_GLOW_LAYER,
        type: 'circle',
        source: RELATED_BUILDINGS_SOURCE,
        paint: {
          'circle-color': buildingColor,
          'circle-blur': 0.85,
          'circle-radius': 20,
          'circle-opacity': 0.45,
        },
      });

      // The same glyph the buildings layer itself draws, so the highlighted
      // building and the one a reader may already have on screen from that
      // layer are recognisably the same mark rather than two conventions for
      // one place. Falls back to a plain disc if the layer names no icon or
      // the glyph didn't resolve.
      const buildingLayer = this.layers.find((l) => l.id === rel.layerId);
      if (buildingLayer) await this.cacheMarkerExpression(buildingLayer);
      const glyph = buildingLayer ? this.markerExpressions.get(buildingLayer.id) : undefined;

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
                'circle-color': buildingColor,
                'circle-radius': 7,
                'circle-stroke-color': this.basemapColor,
                'circle-stroke-width': 2,
              },
            },
      );
    }

    // Joined, not contained — see pathsTo's own comment. Every reader here
    // is one this agency itself told the state it operates, so the line
    // between them carries a document rather than a coincidence of
    // geography. Loaded on demand: the reader may never have ticked this
    // layer, and a selection is a more specific request than a toggle.
    let readers: LoadedFeature[] = [];
    if (rel.pathsTo) {
      const all = await this.ensureDataLoaded(rel.pathsTo.layerId);
      readers = all.filter(
        (f) =>
          f.geometry.type === 'Point' &&
          f.properties.attributes[rel.pathsTo!.joinKey] === jurisdiction.properties.id,
      );
    }

    // One hub, not one spoke per building: every matched building lights up
    // above, but the lines throw from a single representative address (the
    // headquarters, where the data distinguishes one — see subStation's own
    // comment in agency-buildings.mjs), because the filing is the
    // department's, not any one station's.
    const hub = matched.find((f) => !f.properties.attributes.subStation) ?? matched[0];
    if (!hub || !readers.length) return;

    const origin = representativePoint(hub.geometry) as [number, number];
    const targets = readers.map((r) => representativePoint(r.geometry) as [number, number]);
    this.throwPaths(origin, targets, layer);
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
    layer: ClientLayer,
  ) {
    this.cancelThrow();
    this.ensureThrowLayers(layer);

    const paths = this.map.getSource(RELATED_PATHS_SOURCE) as GeoJSONSource | undefined;
    const impacts = this.map.getSource(RELATED_IMPACT_SOURCE) as GeoJSONSource | undefined;
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

    // Deterministic per-target stagger rather than Math.random(): the order
    // is arbitrary either way, and this keeps a re-selection of the same
    // jurisdiction looking the same as the first time.
    const shots = targets.map((target, i) => ({
      target,
      delay: i * THROW_STAGGER_MS,
      landedAt: null as number | null,
    }));
    const lastStart = shots.length ? shots[shots.length - 1].delay : 0;
    const totalMs = lastStart + THROW_MS + IMPACT_MS;
    const start = performance.now();
    // Ease-out: fast off the mark, settling as it lands.
    const ease = (p: number) => 1 - (1 - p) ** 3;

    const step = () => {
      const elapsed = performance.now() - start;

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
      impacts?.setData({ type: 'FeatureCollection', features: ringFeatures } as never);

      if (elapsed < totalMs) {
        this.throwFrame = requestAnimationFrame(step);
      } else {
        // Settle on the finished state and stop. Nothing animates at rest.
        paths.setData({ type: 'FeatureCollection', features: targets.map(line) } as never);
        impacts?.setData(EMPTY_FC as never);
        this.throwFrame = null;
      }
    };
    this.throwFrame = requestAnimationFrame(step);
  }

  /** Create the throw's two sources and layers once, empty. */
  private ensureThrowLayers(layer: ClientLayer) {
    const color = this.layerColor(layer);
    if (!this.map.getSource(RELATED_PATHS_SOURCE)) {
      this.map.addSource(RELATED_PATHS_SOURCE, { type: 'geojson', data: EMPTY_FC as never });
      this.map.addLayer(
        {
          id: RELATED_PATHS_LAYER,
          type: 'line',
          source: RELATED_PATHS_SOURCE,
          paint: {
            'line-color': color,
            'line-width': 1.4,
            'line-opacity': 0.75,
            // Still dashed, but now the dashes are the only thing left of
            // the old hedge: this line joins an agency to a reader it told
            // the state was its own, so it is a link and may look like one.
            'line-dasharray': [2, 1.5],
          },
        },
        this.beneathDots(),
      );
    }
    if (!this.map.getSource(RELATED_IMPACT_SOURCE)) {
      this.map.addSource(RELATED_IMPACT_SOURCE, { type: 'geojson', data: EMPTY_FC as never });
      this.map.addLayer({
        id: RELATED_IMPACT_LAYER,
        type: 'circle',
        source: RELATED_IMPACT_SOURCE,
        paint: {
          // Growth and fade are expressions over the one `t` the loop
          // writes, so the frame loop never touches paint state.
          'circle-radius': ['interpolate', ['linear'], ['get', 't'], 0, 3, 1, 22] as never,
          'circle-color': 'rgba(0,0,0,0)',
          'circle-stroke-color': color,
          'circle-stroke-width': ['interpolate', ['linear'], ['get', 't'], 0, 3, 1, 0.5] as never,
          'circle-stroke-opacity': ['interpolate', ['linear'], ['get', 't'], 0, 0.9, 1, 0] as never,
        },
      });
    }
  }

  private cancelThrow() {
    if (this.throwFrame !== null) {
      cancelAnimationFrame(this.throwFrame);
      this.throwFrame = null;
    }
  }

  /** Undo showRelatedBuildings. Called wherever a selection itself clears. */
  private clearRelatedBuildings() {
    this.cancelThrow();
    for (const id of [
      RELATED_BUILDINGS_GLOW_LAYER,
      RELATED_BUILDINGS_LAYER,
      RELATED_PATHS_LAYER,
      RELATED_IMPACT_LAYER,
    ]) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    for (const id of [RELATED_BUILDINGS_SOURCE, RELATED_PATHS_SOURCE, RELATED_IMPACT_SOURCE]) {
      if (this.map.getSource(id)) this.map.removeSource(id);
    }
  }

  resetView() {
    this.map.fitBounds(MN_BOUNDS, { padding: 24, duration: REDUCED_MOTION ? 0 : 500 });
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
    this.cancelThrow();
    this.popup?.remove();
    this.hoverPopup?.remove();
    this.map.remove();
  }
}

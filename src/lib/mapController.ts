import maplibregl, { type Map as MLMap, type GeoJSONSource } from 'maplibre-gl';
import type { Feature, FeatureCollection, Geometry, Point } from 'geojson';
import { baseStyle, MN_BOUNDS, MN_CENTER } from './mapStyle';
import { bboxOf, representativePoint } from './geo.mjs';
import { THREAD_STOPS, densityColorExpression } from './densityRamp';
import {
  branchRun,
  formBodies,
  parseSpans,
  runsFor,
  setReach,
  type LinkRadiusConfig,
  type Run,
} from './linkRuns';
import type { FeatureProperties, LayerId } from '~/layers/types';

/** The subset of a LayerDefinition the browser needs, serialised by Astro. */
export interface ClientLayer {
  id: LayerId;
  slug: string;
  label: string;
  summary: string;
  whatThisMeans: string;
  limitations: string[];
  color: string;
  geometry: 'point' | 'polygon' | 'line';
  cluster: boolean;
  /** Attribute holding a compass bearing, if the layer records one. */
  bearingKey?: string;
  /** Offsets of a record's parts along its own length, if it has a length. */
  positions?: { offsetsKey: string; countsKey: string; label: string };
  /** Draw this layer's points as a density surface beneath the records. */
  density?: { weightKey?: string; label: string };
  /** The zooms at which this layer changes how it draws itself. */
  scale?: { clusterFrom: number; pointsFrom: number };
  /** Colour records by a category once they are drawn individually. */
  categoryColors?: {
    key: string;
    label: string;
    colors: Array<{ value: string; color: string }>;
    fallback: string;
  };
  /** Draw this line layer as a glowing, creeping filament. */
  filament?: boolean;
  /** Reader-chosen radius at which this layer's records are linked. */
  linkRadius?: LinkRadiusConfig & {
    minMiles: number;
    maxMiles: number;
    stepMiles: number;
    defaultMiles: number;
    label: string;
    help: string;
  };
  dataPath: string;
  csvPath: string | null;
  filters: { key: string; label: string; kind: 'enum' | 'dateRange'; values: string[] }[];
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
  onSelect?: (feature: LoadedFeature | null, layer: ClientLayer) => void;
  onCounts?: (counts: Record<string, { shown: number; total: number }>) => void;
  onLayerReady?: (layerId: string, features: LoadedFeature[]) => void;
  onError?: (layerId: string, message: string) => void;
}

const REDUCED_MOTION =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Clustering is for reading the state at a glance, not for reading a street.
 *
 * Points cluster at or below this zoom and are drawn individually above it, so
 * by the time the view holds a single city every camera is its own dot rather
 * than a number in a bubble. Clustering past that hides exactly what someone
 * looking up their own neighbourhood came to see.
 */
const CLUSTER_RADIUS = 40;

/**
 * Where a layer draws its three states, from the two boundaries it declares.
 *
 * Everything downstream reads these rather than a constant of its own, so the
 * surface cannot outlive the clusters and the cones cannot arrive before the
 * records they annotate. A layer that declares no `scale` keeps the old
 * behaviour: cluster from the first zoom, records once clustering stops.
 */
function scaleOf(layer: ClientLayer) {
  const clusterFrom = layer.scale?.clusterFrom ?? 0;
  const pointsFrom = layer.scale?.pointsFrom ?? clusterFrom + 1;
  return {
    /** Clusters and records both start here; below it, only the surface. */
    clusterFrom,
    /** Records draw individually from here, and so do their indicators. */
    pointsFrom,
    /** Last zoom at which the source groups points into clusters. */
    clusterMaxZoom: pointsFrom - 1,
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

/** The density ramp lives in densityRamp.ts so the legend cannot drift from it. */
const DENSITY_COLOR = densityColorExpression() as unknown as maplibregl.ExpressionSpecification;

/**
 * Dash phases for the creeping filament.
 *
 * Each frame lengthens the drawn part and shortens the gap ahead of it, so the
 * pattern reads as something extending along the road rather than as traffic
 * moving down it. Stepping through fixed phases is the only way to animate a
 * dash in MapLibre — `line-dasharray` takes no expression, so it cannot be
 * driven by a zoom or time expression and has to be set frame by frame.
 */
const FILAMENT_DASHES: number[][] = [
  [0, 4, 3],
  [0.5, 4, 2.5],
  [1, 4, 2],
  [1.5, 4, 1.5],
  [2, 4, 1],
  [2.5, 4, 0.5],
  [3, 4, 0],
  [0, 0.5, 3, 3.5],
  [0, 1, 3, 3],
  [0, 1.5, 3, 2.5],
  [0, 2, 3, 2],
  [0, 2.5, 3, 1.5],
  [0, 3, 3, 1],
  [0, 3.5, 3, 0.5],
];

/** Slow enough to read as growth rather than as a marquee border. */
const FILAMENT_FRAME_MS = 110;

/** Written onto derived runs by us; not upstream fields. */
const COLONY_SITES_PROP = '__colonySites';

/**
 * How brightly a run burns, by the size of the connected network it belongs to.
 *
 * Colour is doing the work a drawn connector would otherwise do. Two streets
 * with no road between them cannot be joined by a line without inventing one,
 * so instead they light up together: a stretch that is on its own stays dim,
 * and one that belongs to a hundred linked reader locations glows near-white.
 * Dragging the radius up turns the metro from scattered embers into one body.
 */
const COLONY_COLOR = [
  'interpolate',
  ['linear'],
  ['get', COLONY_SITES_PROP],
  ...THREAD_STOPS.flatMap(([at, color], i) => [
    // Spread across the network sizes worth telling apart, anchored so a
    // network of one lands on the first legible colour rather than on the
    // background. At a narrow radius almost every network is small, so the
    // bottom of this ramp is what the reader sees most of.
    i === 0 ? 1 : Math.round(((at - THREAD_STOPS[0][0]) / (1 - THREAD_STOPS[0][0])) * 149) + 1,
    color,
  ]),
] as unknown as maplibregl.ExpressionSpecification;

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
export function parseSectors(raw: unknown): { bearing: number; arc: number | null }[] {
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
   * As loaded from disk. `data` holds what the current linking radius derives
   * from it, so the record list, the counter, search, the detail panel and the
   * map are all reading the same corridors the reader is looking at.
   */
  private rawData = new Map<string, LoadedFeature[]>();
  private linkRadius = new Map<string, number>();
  private data = new Map<string, LoadedFeature[]>();
  private visible = new Set<string>();
  private filters = new Map<string, FilterState>();
  private loading = new Set<string>();
  private popup: maplibregl.Popup | null = null;
  /** Set once the map's `load` event has fired. See ready(). */
  private hasLoaded = false;
  /** Line layers drawn as filaments, and the frame loop that creeps them. */
  private filamentLayers = new Set<string>();
  private filamentFrame: number | null = null;

  constructor(container: HTMLElement, layers: ClientLayer[], events: ControllerEvents = {}) {
    this.layers = layers;
    this.events = events;

    this.map = new maplibregl.Map({
      container,
      style: baseStyle(),
      center: MN_CENTER,
      zoom: 5.6,
      minZoom: 3,
      maxZoom: 18,
      attributionControl: { compact: true },
      // The canvas is not usable by a screen reader; the record list beside it
      // is the accessible equivalent, so keep the canvas out of the tab order.
      // Keyboard panning still works once the map is focused deliberately.
      dragRotate: false,
      pitchWithRotate: false,
    });

    this.map.addControl(
      new maplibregl.NavigationControl({ showCompass: false, visualizePitch: false }),
      'top-right',
    );
    this.map.addControl(new maplibregl.ScaleControl({ unit: 'imperial' }), 'bottom-left');

    this.map.on('load', () => {
      this.hasLoaded = true;
      this.map.fitBounds(MN_BOUNDS, { padding: 24, animate: false });
    });
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
    const id = `${layer.id}-cone-${rounded}`;
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
    ctx.fillStyle = layer.color;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = layer.color;
    ctx.lineWidth = px * 0.03;
    ctx.stroke();

    this.map.addImage(id, ctx.getImageData(0, 0, px, px), { pixelRatio });
    return id;
  }

  private coneSourceId = (layerId: string) => `src-${layerId}-cones`;

  /**
   * The lowest of our own dot layers currently on the map, if any.
   *
   * Layers are added as a reader switches them on, so stacking follows the
   * order the checkboxes were ticked in. A corridor turned on after the
   * cameras would otherwise draw over the dots that stand along it — and its
   * click target, deliberately 20px wide so a line can be tapped, would
   * swallow every click meant for a camera. Areas and lines therefore insert
   * beneath the first dot layer already present, and dots stay on top however
   * a reader gets there.
   */
  private beneathDots(): string | undefined {
    const marks = ['-points', '-clusters', '-cluster-count', '-cones'];
    return this.firstStyleLayer((id) => marks.some((suffix) => id.endsWith(suffix)));
  }

  /**
   * The bottom-most style layer belonging to any registry layer.
   *
   * The density surface has to sit under everything of ours — including other
   * layers' areas and lines — or a corridor switched on first would be washed
   * out by a surface added afterwards.
   */
  private beneathEverything(): string | undefined {
    return this.firstStyleLayer((id) => this.layers.some((l) => id.startsWith(`${l.id}-`)));
  }

  private firstStyleLayer(match: (id: string) => boolean): string | undefined {
    for (const styleLayer of this.map.getStyle().layers ?? []) {
      if (match(styleLayer.id)) return styleLayer.id;
    }
    return undefined;
  }

  private densitySourceId = (layerId: string) => `src-${layerId}-density`;

  /**
   * Points for the density surface, in their own unclustered source.
   *
   * The record source clusters, and a heatmap over clustered data measures the
   * cluster centroids rather than the cameras — so the surface would change
   * shape at every zoom step as clusters merged, which is an artefact of the
   * rendering and not a fact about where cameras are.
   */
  private densityFeatures(features: LoadedFeature[]): FeatureCollection {
    return {
      type: 'FeatureCollection',
      features: features
        .filter((f) => f.geometry.type === 'Point')
        .map((f) => ({
          type: 'Feature',
          geometry: f.geometry,
          properties: { ...f.properties.attributes },
        })) as Feature[],
    };
  }

  /** Fetch a layer's GeoJSON the first time it is switched on (spec §8, lazy load). */
  async loadLayer(layer: ClientLayer): Promise<void> {
    if (this.data.has(layer.id) || this.loading.has(layer.id)) return;
    this.loading.add(layer.id);
    try {
      const res = await fetch(layer.dataPath);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const collection = await res.json();
      const raw: LoadedFeature[] = collection.features ?? [];
      this.rawData.set(layer.id, raw);
      if (layer.linkRadius && !this.linkRadius.has(layer.id)) {
        this.linkRadius.set(layer.id, layer.linkRadius.defaultMiles);
      }
      const features = this.applyLinkRadius(layer, raw);
      this.data.set(layer.id, features);
      await this.ready();
      this.addLayer(layer, features);
      this.events.onLayerReady?.(layer.id, features);
    } catch (err) {
      this.events.onError?.(layer.id, err instanceof Error ? err.message : String(err));
    } finally {
      this.loading.delete(layer.id);
    }
  }

  /**
   * Cut the shipped road stretches into the corridors a given radius implies.
   *
   * A layer without `linkRadius` passes straight through: this is the one place
   * that behaviour differs, so every other part of the controller can go on
   * treating `data` as simply "the layer's records".
   */
  private applyLinkRadius(layer: ClientLayer, raw: LoadedFeature[]): LoadedFeature[] {
    const config = layer.linkRadius;
    if (!config) return raw;
    const radius = this.linkRadius.get(layer.id) ?? config.defaultMiles;

    // Everything the radius implies, runs and lone readers alike, then the
    // bodies they form. Which of them survives is decided by the body it
    // belongs to and never by the road it stands on — see formBodies.
    const elements: Run[] = [];
    raw.forEach((feature, index) => {
      const kind = (feature.properties.attributes as Record<string, unknown>)[config.kindKey];
      if (kind === config.branchKind) {
        const branch = branchRun(feature.properties, config, index);
        if (branch) elements.push(branch);
        return;
      }
      elements.push(...runsFor(feature.properties, config, radius, index));
    });

    // Work out the road each element draws before forming bodies, because
    // linking runs along those roads. A street is how one cluster reaches
    // another — an eleven-mile run touches everything along its length, not
    // only what happens to be near one of its readers.
    for (const element of elements) {
      const source = raw[element.source];
      const attrs = source.properties.attributes as Record<string, unknown>;
      const spans = parseSpans(attrs[config.pieceSpansKey]);
      const allPieces =
        source.geometry.type === 'MultiLineString'
          ? (source.geometry.coordinates as number[][][])
          : [];

      // Draw the surveyed pieces this element covers. Where a piece has no
      // recorded span it is kept rather than dropped: losing real road is the
      // worse failure, and it can only ever make a run look longer than itself,
      // never shorter than the ground.
      setReach(
        element,
        element.branch
          ? allPieces
          : allPieces.filter((_, i) => {
              const span = spans[i];
              if (!span) return true;
              return span[1] >= element.startMiles && span[0] <= element.endMiles;
            }),
        radius,
      );
    }

    const all = formBodies(elements, radius, config.minBodySites);

    return all.map((run) => {
      const source = raw[run.source];
      const pieces = run.pieces;

      const totalMiles = Number((run.endMiles - run.startMiles).toFixed(2));
      const gaps = run.offsets.slice(1).map((o, i) => o - run.offsets[i]);
      const sortedGaps = [...gaps].sort((a, b) => a - b);
      const round = (n: number) => Number(n.toFixed(2));

      // A branch has no length of its own to report, so it keeps the ingest's
      // own attributes and gains only its network size. Recomputing spacing for
      // a single reader would print a row of confident zeroes.
      if (run.branch) {
        return {
          type: 'Feature',
          geometry: { type: 'MultiLineString', coordinates: pieces },
          properties: {
            ...source.properties,
            attributes: {
              ...source.properties.attributes,
              connectedSites: run.colonySites,
              [COLONY_SITES_PROP]: run.colonySites,
            },
          },
        } as LoadedFeature;
      }

      return {
        type: 'Feature',
        geometry: { type: 'MultiLineString', coordinates: pieces },
        properties: {
          ...source.properties,
          // Stable across radii for one stretch, distinct between runs cut from
          // the same stretch, so focus and selection survive a slider drag.
          id: run.branch ? source.properties.id : `${source.properties.id}-r${run.from}`,
          attributes: {
            ...source.properties.attributes,
            readerCount: run.readers,
            siteCount: run.sites,
            corridorMiles: totalMiles,
            averageGapMiles: run.sites > 1 ? round(totalMiles / (run.sites - 1)) : 0,
            medianGapMiles: sortedGaps.length ? round(sortedGaps[Math.floor(sortedGaps.length / 2)]) : 0,
            longestGapMiles: gaps.length ? round(Math.max(...gaps)) : 0,
            siteOffsets: run.offsets.map((o) => o.toFixed(2)).join(';'),
            siteReaders: run.counts.join(';'),
            connectedSites: run.colonySites,
            [COLONY_SITES_PROP]: run.colonySites,
          },
        },
      } as LoadedFeature;
    });
  }

  /** Current linking radius in miles, for the control that sets it. */
  linkRadiusOf(layerId: string): number | null {
    return this.linkRadius.get(layerId) ?? null;
  }

  /**
   * Re-cut a layer at a new linking radius.
   *
   * Everything downstream reads `data`, so re-deriving it and re-setting the
   * source is the whole update — the record list, the counter and the map
   * cannot disagree about what a corridor is at the radius on screen.
   */
  setLinkRadius(layerId: string, miles: number) {
    const layer = this.layers.find((l) => l.id === layerId);
    const raw = this.rawData.get(layerId);
    if (!layer?.linkRadius || !raw) return;
    this.linkRadius.set(layerId, miles);
    this.data.set(layerId, this.applyLinkRadius(layer, raw));
    this.refresh(layerId);
  }

  private addLayer(layer: ClientLayer, features: LoadedFeature[]) {
    const src = this.sourceId(layer.id);
    if (this.map.getSource(src)) return;
    const tier = scaleOf(layer);

    // The density surface goes down first and stays at the bottom of our stack.
    if (layer.density) {
      const densitySrc = this.densitySourceId(layer.id);
      this.map.addSource(densitySrc, { type: 'geojson', data: this.densityFeatures(features) });
      this.map.addLayer(
        {
          id: `${layer.id}-density`,
          type: 'heatmap',
          source: densitySrc,
          // Clamped to where records start drawing individually. The layer's
          // limitations promise an estimate and a mapped position are never
          // read off the same pixel; enforcing it here means changing the
          // clustering zoom cannot quietly make that promise false.
          // The surface owns everything below the first clustered zoom, and
          // stops exactly where counts take over.
          maxzoom: tier.clusterFrom,
          paint: {
            'heatmap-weight': layer.density.weightKey
              ? ['coalesce', ['to-number', ['get', layer.density.weightKey]], 1]
              : 1,
            // Rising with zoom so the surface stays legible as points spread
            // apart on screen instead of thinning into nothing.
            'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 4, 0.55, 9, 1.2, 13, 2.4],
            'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 4, 8, 9, 24, 13, 46],
            'heatmap-color': DENSITY_COLOR,
            // Gone by the time records are drawn individually, so nobody reads
            // a smoothed estimate and a mapped camera off the same pixel.
            'heatmap-opacity': [
              'interpolate',
              ['linear'],
              ['zoom'],
              tier.clusterFrom - 2,
              // Held well under full strength. The surface and the corridor
              // threads share a palette, so a surface at full opacity swallows
              // the corridors sitting on top of it — which is precisely how a
              // map with 25 corridors drawn on it came to look like it had none.
              0.55,
              tier.clusterFrom,
              0,
            ],
          },
        },
        this.beneathEverything(),
      );
    }

    this.map.addSource(src, {
      type: 'geojson',
      data: this.flatten(features),
      ...(layer.cluster
        ? { cluster: true, clusterRadius: CLUSTER_RADIUS, clusterMaxZoom: tier.clusterMaxZoom }
        : {}),
    });

    if (layer.geometry === 'polygon') {
      const under = this.beneathDots();
      this.map.addLayer(
        {
          id: `${layer.id}-fill`,
          type: 'fill',
          source: src,
          paint: {
            // Use the grade colour HOLC printed on the original sheet where we
            // have it, so the map reads like the historical document it is.
            'fill-color': ['coalesce', ['get', 'holcFill'], layer.color],
            'fill-opacity': 0.42,
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
            'line-color': ['coalesce', ['get', 'holcFill'], layer.color],
            'line-width': 1.1,
            'line-opacity': 0.85,
          },
        },
        under,
      );
      this.bindInteractions(layer, `${layer.id}-fill`);
      return;
    }

    if (layer.geometry === 'line') {
      const under = this.beneathDots();
      // Three layers for one line. The casing is what makes a thin coloured
      // line legible over a dark basemap without drawing it fat enough to
      // imply a width the data does not have — a corridor is a stretch of
      // road, not a band of ground.
      // Colour carries the connection where a line cannot be drawn.
      const thread = layer.linkRadius
        ? COLONY_COLOR
        : (layer.color as unknown as maplibregl.ExpressionSpecification);

      /*
       * Branches are drawn quieter than the runs they hang off.
       *
       * A branch is one reader on a side street; a corridor is a run of them
       * along a road. Drawing both at the same weight would let 960 stubs shout
       * down 25 corridors and read as though the whole city were a corridor.
       * Thin, dim and undashed, they behave like the density surface does —
       * present everywhere there is something, insistent nowhere.
       */
      const isBranch = layer.linkRadius
        ? (['==', ['get', layer.linkRadius.kindKey], layer.linkRadius.branchKind] as unknown)
        : (false as unknown);
      const byKind = (branch: unknown, run: unknown) =>
        (layer.linkRadius
          ? ['case', isBranch, branch, run]
          : run) as unknown as maplibregl.ExpressionSpecification;

      /**
       * Zoom interpolation whose stops differ by kind.
       *
       * Built this way round because MapLibre allows only one zoom-based
       * interpolation per expression — nesting a zoom curve inside each branch
       * of a `case` is rejected by the style spec at runtime and takes the
       * whole layer down with it. One curve, kind-dependent stop values.
       */
      const widthByKind = (stops: Array<[number, number, number]>) =>
        [
          'interpolate',
          ['linear'],
          ['zoom'],
          ...stops.flatMap(([zoom, branch, run]) => [zoom, byKind(branch, run)]),
        ] as unknown as maplibregl.ExpressionSpecification;
      if (layer.filament) {
        // A soft halo, wide and heavily blurred, so the thread looks like it is
        // lit from inside rather than drawn on top of the map.
        this.map.addLayer(
          {
            id: `${layer.id}-line-casing`,
            type: 'line',
            source: src,
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': thread,
              'line-opacity': byKind(0.16, 0.3),
              'line-blur': ['interpolate', ['linear'], ['zoom'], 5, 3, 11, 9, 16, 18],
              // The map opens on the whole state, where the median corridor is
              // under three pixels long. A thread that is also thin there is a
              // thread nobody can find, so the glow starts wide and the line
              // grows into it rather than out of nothing.
              'line-width': widthByKind([
                [5, 3, 9],
                [11, 6, 14],
                [16, 12, 26],
              ]),
            },
          },
          under,
        );
        // The core, thin and bright. Drawn solid beneath the creeping dash so
        // the corridor never disappears between phases — the growth reads as
        // something travelling along a thread that is always there.
        this.map.addLayer(
          {
            id: `${layer.id}-line`,
            type: 'line',
            source: src,
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': thread,
              'line-opacity': byKind(0.4, 0.55),
              'line-width': widthByKind([
                [5, 1, 2.6],
                [11, 1.4, 3.2],
                [16, 2.4, 5],
              ]),
            },
          },
          under,
        );
        this.map.addLayer(
          {
            id: `${layer.id}-line-growth`,
            type: 'line',
            source: src,
            // Growth creeps along runs only. A 320 m stub is too short to read
            // as travelling anywhere, and 960 of them flickering at once is
            // noise rather than motion.
            ...(layer.linkRadius
              ? {
                  filter: ['!=', ['get', layer.linkRadius.kindKey], layer.linkRadius.branchKind] as
                    unknown as maplibregl.FilterSpecification,
                }
              : {}),
            layout: { 'line-cap': 'butt', 'line-join': 'round' },
            paint: {
              'line-color': '#f0fdfa',
              'line-opacity': 0.9,
              'line-width': ['interpolate', ['linear'], ['zoom'], 6, 1.4, 11, 2.6, 16, 5],
              'line-dasharray': FILAMENT_DASHES[0],
            },
          },
          under,
        );
        this.filamentLayers.add(`${layer.id}-line-growth`);
        this.startFilament();
      } else {
        this.map.addLayer(
          {
            id: `${layer.id}-line-casing`,
            type: 'line',
            source: src,
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': '#0a0c10',
              'line-opacity': 0.85,
              'line-width': ['interpolate', ['linear'], ['zoom'], 6, 3.5, 11, 6, 16, 11],
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
              'line-color': layer.color,
              'line-opacity': 0.9,
              'line-width': ['interpolate', ['linear'], ['zoom'], 6, 1.6, 11, 3, 16, 6],
            },
          },
          under,
        );
      }
      // A line is a hard thing to hit with a finger. This one is invisible and
      // exists only to widen the target; a zero-opacity layer is still
      // queryable, so click and hover behave as they do on every other layer.
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

    if (layer.cluster) {
      this.map.addLayer({
        id: `${layer.id}-clusters`,
        type: 'circle',
        source: src,
        // Counts belong to the middle scale only. Below it the surface answers
        // the question better; above it there is nothing left to count.
        minzoom: tier.clusterFrom,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': layer.color,
          'circle-opacity': 0.28,
          'circle-stroke-color': layer.color,
          'circle-stroke-width': 1.5,
          'circle-radius': ['step', ['get', 'point_count'], 14, 20, 20, 100, 28],
        },
      });
      this.map.addLayer({
        id: `${layer.id}-cluster-count`,
        type: 'symbol',
        source: src,
        minzoom: tier.clusterFrom,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 12,
        },
        paint: { 'text-color': '#e7ecf3' },
      });
      this.map.on('click', `${layer.id}-clusters`, async (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const source = this.map.getSource(this.sourceId(layer.id)) as GeoJSONSource;
        const zoom = await source.getClusterExpansionZoom(f.properties!.cluster_id as number);
        this.map.easeTo({
          center: (f.geometry as Point).coordinates as [number, number],
          zoom,
          duration: REDUCED_MOTION ? 0 : 400,
        });
      });
      this.cursorOn(`${layer.id}-clusters`);
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
        // A cone annotates a record, so it cannot arrive before one.
        minzoom: tier.pointsFrom,
        layout: {
          'icon-image': ['get', CONE_PROP],
          'icon-rotate': ['get', BEARING_PROP],
          // Bearings are compass headings, so the cone turns with the map
          // rather than staying fixed on the screen.
          'icon-rotation-alignment': 'map',
          // Cameras sit tightly along a corridor; hiding the ones that collide
          // would misrepresent how many are there.
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-size': ['interpolate', ['linear'], ['zoom'], tier.pointsFrom, 0.78, 18, 1.3],
        },
      });
    }

    this.map.addLayer({
      id: `${layer.id}-points`,
      type: 'circle',
      source: src,
      // A record on its own — either genuinely isolated at the middle scale, or
      // everything once clustering stops. Held above the surface's zooms so a
      // lone rural camera does not sit on top of the estimate that already
      // accounts for it.
      ...(layer.cluster ? { minzoom: tier.clusterFrom } : {}),
      ...(layer.cluster ? { filter: ['!', ['has', 'point_count']] } : {}),
      paint: {
        /*
         * One colour until the records are individual, then the category.
         *
         * A `step` on zoom rather than two layers, so there is one dot per
         * camera at every scale and nothing to keep in sync. Below the closest
         * tier the dot is the layer's own colour: at that distance a coloured
         * dot claims to distinguish things the reader cannot yet resolve, and
         * most of them would be the "nobody wrote it down" grey anyway.
         */
        'circle-color': layer.categoryColors
          ? ([
              'step',
              ['zoom'],
              layer.color,
              tier.pointsFrom,
              [
                'match',
                ['get', layer.categoryColors.key],
                ...layer.categoryColors.colors.flatMap(({ value, color }) => [value, color]),
                layer.categoryColors.fallback,
              ],
            ] as unknown as maplibregl.ExpressionSpecification)
          : layer.color,
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 3.4, 10, 5.5, 15, 8],
        'circle-stroke-color': '#0a0c10',
        'circle-stroke-width': 1.2,
        'circle-opacity': 0.95,
      },
    });

    this.bindInteractions(layer, `${layer.id}-points`);
  }

  /**
   * Creep the filament dash forward, one phase at a time.
   *
   * Runs on `requestAnimationFrame` but advances on a fixed interval, so the
   * growth moves at the same speed on a 120 Hz display as on a 60 Hz one. The
   * loop parks itself whenever no filament layer is switched on, so a reader
   * who never turns corridors on pays nothing for this.
   */
  private startFilament() {
    if (REDUCED_MOTION || this.filamentFrame !== null || !this.filamentLayers.size) return;
    let step = 0;
    let last = 0;
    const tick = (now: number) => {
      const live = [...this.filamentLayers].filter(
        (id) => this.map.getLayer(id) && this.visible.has(id.replace(/-line-growth$/, '')),
      );
      if (!live.length) {
        this.filamentFrame = null;
        return;
      }
      this.filamentFrame = requestAnimationFrame(tick);
      if (now - last < FILAMENT_FRAME_MS) return;
      last = now;
      step = (step + 1) % FILAMENT_DASHES.length;
      for (const id of live) {
        this.map.setPaintProperty(id, 'line-dasharray', FILAMENT_DASHES[step]);
      }
    };
    this.filamentFrame = requestAnimationFrame(tick);
  }

  private cursorOn(layerId: string) {
    this.map.on('mouseenter', layerId, () => {
      this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', layerId, () => {
      this.map.getCanvas().style.cursor = '';
    });
  }

  private bindInteractions(layer: ClientLayer, mapLayerId: string) {
    this.cursorOn(mapLayerId);
    this.map.on('click', mapLayerId, (e) => {
      const hit = e.features?.[0];
      if (!hit) return;
      const id = (hit.properties as Record<string, unknown>)?.id as string;
      const match = this.data.get(layer.id)?.find((f) => f.properties.id === id) ?? null;
      this.events.onSelect?.(match, layer);
    });
  }

  setLayerVisible(layer: ClientLayer, visible: boolean) {
    if (visible) {
      this.visible.add(layer.id);
      void this.loadLayer(layer).then(() => this.applyVisibility(layer));
    } else {
      this.visible.delete(layer.id);
      this.applyVisibility(layer);
    }
  }

  private applyVisibility(layer: ClientLayer) {
    const on = this.visible.has(layer.id);
    for (const suffix of [
      '-density',
      '-fill',
      '-outline',
      '-line-casing',
      '-line',
      '-line-growth',
      '-line-hit',
      '-points',
      '-cones',
      '-clusters',
      '-cluster-count',
    ]) {
      const id = `${layer.id}${suffix}`;
      if (this.map.getLayer(id)) {
        this.map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
      }
    }
    // The creep loop parks itself when nothing is on; switching a filament
    // layer back on has to wake it.
    if (on) this.startFilament();
    this.emitCounts();
  }

  isVisible(layerId: string) {
    return this.visible.has(layerId);
  }

  setFilter(layerId: string, key: string, values: Set<string>) {
    if (!this.filters.has(layerId)) this.filters.set(layerId, new Map());
    const state = this.filters.get(layerId)!;
    if (values.size === 0) state.delete(key);
    else state.set(key, values);
    this.refresh(layerId);
  }

  clearFilters(layerId?: string) {
    if (layerId) this.filters.delete(layerId);
    else this.filters.clear();
    for (const id of layerId ? [layerId] : this.data.keys()) this.refresh(id);
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
    // The density surface is a third source and drifts the same way: a filter
    // that hides half the cameras must not leave the glow claiming they are
    // still there.
    const density = this.map.getSource(this.densitySourceId(layerId)) as GeoJSONSource | undefined;
    density?.setData(this.densityFeatures(visible));
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
    const duration = REDUCED_MOTION ? 0 : 500;
    if (feature.geometry.type === 'Point') {
      this.map.easeTo({
        center: representativePoint(feature.geometry) as [number, number],
        zoom: Math.max(this.map.getZoom(), 13),
        duration,
      });
    } else {
      // A corridor can be eleven miles long. Centring it at a fixed zoom shows
      // a piece of it and hides the length, which is the one thing the record
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
    this.events.onSelect?.(feature, layer);
  }

  flyTo(center: [number, number], zoom = 12) {
    this.map.easeTo({ center, zoom, duration: REDUCED_MOTION ? 0 : 600 });
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
    if (this.filamentFrame !== null) cancelAnimationFrame(this.filamentFrame);
    this.filamentFrame = null;
    this.popup?.remove();
    this.map.remove();
  }
}

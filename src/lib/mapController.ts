import maplibregl, { type Map as MLMap, type GeoJSONSource } from 'maplibre-gl';
import type { Feature, FeatureCollection, Geometry, Point } from 'geojson';
import { baseStyle, MN_BOUNDS, MN_CENTER } from './mapStyle';
import { bboxOf, representativePoint } from './geo.mjs';
import { THREAD_STOPS, densityColorExpression } from './densityRamp';
import { groupNodes } from './nodes';
import type { FeatureProperties, LayerId } from '~/layers/types';

/** The subset of a LayerDefinition the browser needs, serialised by Astro. */
export interface ClientLayer {
  id: LayerId;
  label: string;
  summary: string;
  whatThisMeans: string;
  limitations: string[];
  color: string;
  geometry: 'point' | 'polygon' | 'line';
  /** Attribute holding a compass bearing, if the layer records one. */
  bearingKey?: string;
  /** Offsets of a record's parts along its own length, if it has a length. */
  positions?: { offsetsKey: string; countsKey: string; label: string };
  /** Draw this layer's points as a density surface beneath the records. */
  density?: { weightKey?: string; label: string };
  /** The zooms across which this layer's records emerge from its surface. */
  scale?: { emergeFrom: number; pointsFrom: number };
  /** Colour records by a category once they are drawn individually. */
  categoryColors?: {
    key: string;
    label: string;
    colors: Array<{ value: string; color: string }>;
    fallback: string;
  };
  /** Draw this line layer as a glowing filament. */
  filament?: boolean;
  /** Send a pulse of light travelling along this layer's records. */
  pulse?: {
    phaseKey: string;
    bands: number;
    periodMs: number;
    networkKey: string;
  };
  /** The request a reader can file about one of these records, if any. */
  action?: {
    requestType: string;
    label: string;
    bodyKey?: string;
    fallbackBody?: 'countySheriff' | 'county' | 'name';
  };
  dataPath: string;
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
 * Where a layer's records emerge from its surface, from the two zooms it names.
 *
 * There is one picture at every scale now, not three. The density surface is
 * drawn at every zoom, the nodes are the heavier parts of it, and the dots fade
 * up out of it between these two numbers — so a reader zooming in never crosses
 * a line where the map stops meaning one thing and starts meaning another.
 * Everything downstream reads these rather than a constant of its own, so the
 * cones cannot arrive before the records they annotate.
 */
function scaleOf(layer: ClientLayer) {
  const emergeFrom = layer.scale?.emergeFrom ?? 0;
  const pointsFrom = layer.scale?.pointsFrom ?? emergeFrom + 1;
  return {
    /** Dots begin to appear here, faint, over a surface still at full strength. */
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

/** The density ramp lives in densityRamp.ts so the legend cannot drift from it. */
const DENSITY_COLOR = densityColorExpression() as unknown as maplibregl.ExpressionSpecification;

/** Written onto derived nodes by us; not an upstream field. */
const NODE_CAMERAS_PROP = '__nodeCameras';

/**
 * How heavily a node burns, by the number of cameras standing in it.
 *
 * The node is drawn in the surface's own ramp and reads as a denser patch of
 * it, which is the whole point: a junction with eight readers on it is not a
 * different kind of thing from a junction with two, it is more of the same
 * thing, and a number in a bubble said the opposite by making it a separate
 * object you had to click. Two cameras sit just above the surface around them;
 * the largest bodies in the metro reach the pale end of the ramp.
 *
 * The stops are cut to the range the data actually holds. In the current
 * Minnesota extract, 1,430 mapped reader locations form 157 nodes; half of them
 * are two cameras, nine in ten are five or fewer, and the largest is ten. A
 * linear ramp to some round number would leave nearly every node sitting on the
 * same dim purple. The curve keeps climbing past ten so a denser extract, or
 * another state, does not flatten out at the top.
 */
const NODE_WEIGHT = [
  'interpolate',
  ['linear'],
  ['get', NODE_CAMERAS_PROP],
  2, 0.3,
  3, 0.42,
  5, 0.6,
  8, 0.8,
  12, 0.92,
  20, 1,
] as unknown as maplibregl.ExpressionSpecification;


/**
 * The pulse: a bright head with a tail fading out behind it.
 *
 * Written as `line-gradient` stops against `line-progress`, which is why the
 * source below needs `lineMetrics`. Every stop is a fraction of the way along a
 * line, so one ramp fits every record whatever its length, and moving the pulse
 * is a single paint property away — no geometry is touched, no tile relaid, and
 * the cost of a frame does not grow with the number of records on screen.
 */
const PULSE_TAIL = 0.28;
const PULSE_HEAD = '#f0fdfa';

/**
 * How often the pulse is allowed to move, and where it is worth moving at all.
 *
 * The animation is not free the way a uniform is. MapLibre draws a
 * `line-gradient` by rendering the ramp to a small canvas and uploading it as a
 * texture, once per tile the layer covers — so replacing the ramp costs bands ×
 * tiles canvas renders, and doing that on every animation frame is what made
 * the first version of this heavy.
 *
 * Two limits, each cutting the same product. Thirty-odd frames a second is
 * indistinguishable from sixty for a glow travelling this slowly and halves the
 * work outright. The zoom floor removes the rest of it: below `PULSE_FROM_ZOOM`
 * the median link is around a pixel long, so the pulse is animating something
 * nobody can resolve — and that is exactly the view the map opens on, which is
 * the worst possible place to spend a frame budget.
 */
const PULSE_FRAME_MS = 32;
const PULSE_FROM_ZOOM = 9;

/**
 * One frame of the pulse, as a colour ramp along the line.
 *
 * `at` runs from 0 to 1 and wraps, so the pulse leaves one end of a link as it
 * arrives at the other. Stops must climb, and MapLibre rejects the whole layer
 * if they do not, so a pulse crossing the seam is drawn as the two pieces it
 * actually is rather than by letting the numbers run past the end.
 */
function pulseRamp(at: number): maplibregl.ExpressionSpecification {
  const stops: Array<[number, string]> = [[0, 'rgba(240,253,250,0)']];
  const clear = 'rgba(240,253,250,0)';
  // Walk the tail back from the head, drawing whatever part of it falls inside
  // the line, plus the part that has wrapped around to the far end.
  for (const head of [at, at + 1]) {
    const tail = head - PULSE_TAIL;
    for (const [pos, color] of [
      [tail, clear],
      [head - PULSE_TAIL * 0.35, 'rgba(153,246,228,0.55)'],
      [head, PULSE_HEAD],
      [head + 0.004, clear],
    ] as Array<[number, string]>) {
      if (pos > 0 && pos < 1) stops.push([pos, color]);
    }
  }
  stops.push([1, clear]);
  stops.sort((a, b) => a[0] - b[0]);

  // Equal stops are rejected too, and two can collide when the head sits almost
  // exactly on the seam.
  const out: Array<[number, string]> = [];
  for (const stop of stops) {
    if (out.length && stop[0] <= out[out.length - 1][0]) continue;
    out.push(stop);
  }
  return [
    'interpolate',
    ['linear'],
    ['line-progress'],
    ...out.flat(),
  ] as unknown as maplibregl.ExpressionSpecification;
}

/**
 * How brightly a link burns, by the size of the connected network it belongs to.
 *
 * Colour is doing work a line cannot. Two links that meet at a shared reader
 * are one network and two that do not are two, and no drawn line can say which
 * — so instead they light up together, and the brighter a strand is the more
 * reader locations its network holds.
 *
 * The stops are cut to the range the data actually holds, as the node ramp
 * above is, and that range is a finding in its own right. Under the old
 * nearest-neighbour model the largest network in Minnesota was nine reader
 * locations and there were 354 of them: linking each reader to exactly one
 * neighbour cannot help but shatter a map into pieces, and the pieces were an
 * artefact of the question. Linking readers that have nothing between them
 * instead, the same cameras form 150 networks and the largest is 101 reader
 * locations — the Twin Cities are one connected body, which the earlier map
 * could not have shown however it was coloured.
 *
 * The spread is wide now: half of all strands sit in a network of 19 or more,
 * a fifth in the 101. The curve keeps climbing past the largest so a denser
 * extract, or another state, does not flatten out at the top.
 */
const NETWORK_MAX_SITES = 120;

const networkColor = (key: string) =>
  [
    'interpolate',
    ['linear'],
    ['get', key],
    ...THREAD_STOPS.flatMap(([at, color], i) => [
      // Anchored so the smallest network lands on the first legible colour
      // rather than on the background. Most networks are small, so the bottom
      // of this ramp is what the reader sees most of and it has to work alone.
      i === 0
        ? 2
        : Math.round(((at - THREAD_STOPS[0][0]) / (1 - THREAD_STOPS[0][0])) * (NETWORK_MAX_SITES - 2)) + 2,
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
  private data = new Map<string, LoadedFeature[]>();
  private visible = new Set<string>();
  private filters = new Map<string, FilterState>();
  private loading = new Set<string>();
  private popup: maplibregl.Popup | null = null;
  /** Set once the map's `load` event has fired. See ready(). */
  private hasLoaded = false;
  /** Pulse layers, and the frame loop that moves the light along them. */
  private pulseLayers = new Set<string>();
  private pulseFrame: number | null = null;

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
    const marks = ['-points', '-cones'];
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
  private nodeSourceId = (layerId: string) => `src-${layerId}-nodes`;

  /**
   * Reader locations gathered into nodes, as points carrying a camera count.
   *
   * Derived in the browser rather than at ingest because it has to answer to
   * the filters: switch to sheriff-run readers only and the node at a junction
   * where a city and a county both put cameras up is a smaller body, not the
   * same body with some of its cameras hidden underneath it.
   */
  private nodeFeatures(layer: ClientLayer, features: LoadedFeature[]): FeatureCollection {
    const sites = features
      .filter((f) => f.geometry.type === 'Point')
      .map((f) => {
        const [lng, lat] = (f.geometry as Point).coordinates as [number, number];
        // A pole tagged with several headings carries several cameras, and the
        // cones already say so. The node counts what is standing there, so it
        // has to agree with them.
        const cameras = layer.bearingKey
          ? Math.max(1, parseSectors(f.properties.attributes[layer.bearingKey]).length)
          : 1;
        return { lng, lat, cameras };
      });
    return {
      type: 'FeatureCollection',
      features: groupNodes(sites).map((node) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [node.lng, node.lat] },
        properties: { [NODE_CAMERAS_PROP]: node.cameras },
      })) as Feature[],
    };
  }

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
      const features: LoadedFeature[] = collection.features ?? [];
      this.rawData.set(layer.id, features);
      this.data.set(layer.id, features);
      await this.ready();
      // Whatever the filters already say, not the whole layer. The controls are
      // on the page before the data is, so a reader can tick a value under a
      // layer that is still switched off — and if the first paint ignored that
      // tick, the map would draw every record while the counter beside it said
      // four, and clearing the filter would appear to do nothing because
      // nothing had ever been filtered.
      this.addLayer(layer, this.filteredFeatures(layer.id));
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

    // The density surface goes down first and stays at the bottom of our stack.
    // Both it and the nodes above it insert before whatever was bottom-most
    // when we started, so the pair lands in the order written here — a node
    // inserted "beneath everything" a moment after the surface would go under
    // the surface it is meant to brighten.
    if (layer.density) {
      const belowAll = this.beneathEverything();
      const densitySrc = this.densitySourceId(layer.id);
      this.map.addSource(densitySrc, { type: 'geojson', data: this.densityFeatures(features) });
      this.map.addLayer(
        {
          id: `${layer.id}-density`,
          type: 'heatmap',
          source: densitySrc,
          // No maxzoom, and that is the change. The surface used to be switched
          // off before records drew, on the promise that an estimate and a
          // mapped position were never read off the same pixel — kept by
          // handing the middle scale to counted bubbles, which turned zooming
          // in into two hard cuts between three different maps. The surface now
          // runs the whole way and the dots rise out of it, so the promise is
          // made in the drawing instead: the estimate is dim wherever a dot is
          // bright, and the limitations say plainly that the two overlap.
          paint: {
            'heatmap-weight': layer.density.weightKey
              ? ['coalesce', ['to-number', ['get', layer.density.weightKey]], 1]
              : 1,
            // Rising with zoom so the surface stays legible as points spread
            // apart on screen instead of thinning into nothing, then held flat
            // once the dots are carrying the detail.
            'heatmap-intensity': [
              'interpolate',
              ['linear'],
              ['zoom'],
              4, 0.55,
              9, 1.2,
              13, 2.4,
              16, 2.4,
            ],
            // Kept growing past the old top stop so the glow stays tied to the
            // ground rather than shrinking into a pinprick under each dot.
            'heatmap-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              4, 8,
              9, 24,
              13, 46,
              16, 72,
              18, 96,
            ],
            'heatmap-color': DENSITY_COLOR,
            'heatmap-opacity': [
              'interpolate',
              ['linear'],
              ['zoom'],
              // Held well under full strength. The surface and the corridor
              // threads share a palette, so a surface at full opacity swallows
              // the corridors sitting on top of it — which is precisely how a
              // map with 25 corridors drawn on it came to look like it had none.
              tier.emergeFrom - 2, 0.55,
              // Down, not out, as the dots take over: enough to still read as
              // the ground the cameras stand on, faint enough that nobody
              // mistakes the haze under a dot for the dot's own footprint.
              tier.pointsFrom, 0.34,
            ],
          },
        },
        belowAll,
      );

      /*
       * Nodes: where two or more readers stand together.
       *
       * Same source ramp, same kind of mark, drawn over the surface rather than
       * instead of it — a node is a denser patch of the same estimate, and the
       * brightness is the count. Nothing here is clickable and nothing here is
       * labelled: the record is still the camera, and a node that could be
       * selected would be a second kind of object competing with it.
       */
      const nodeSrc = this.nodeSourceId(layer.id);
      this.map.addSource(nodeSrc, {
        type: 'geojson',
        data: this.nodeFeatures(layer, features),
      });
      this.map.addLayer(
        {
          id: `${layer.id}-nodes`,
          type: 'heatmap',
          source: nodeSrc,
          paint: {
            'heatmap-weight': NODE_WEIGHT,
            // Flat with zoom, unlike the surface underneath. What a node is
            // does not change with the scale you look at it from, so its
            // brightness should not either — only the camera count moves it.
            'heatmap-intensity': 0.9,
            // A node is an intersection, so its glow grows with the view the
            // way the junction itself does, instead of staying a fixed blob.
            'heatmap-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              5, 9,
              9, 16,
              13, 30,
              16, 54,
              18, 78,
            ],
            'heatmap-color': DENSITY_COLOR,
            // "Slightly brighter", literally: low enough that a two-camera node
            // is a thickening of the surface rather than a new mark on it.
            'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.5, 13, 0.58, 18, 0.44],
          },
        },
        belowAll,
      );
    }

    // Never clustered. The source holds one feature per record at every zoom,
    // which is what lets the record list, the counter and the dots agree
    // without the special-casing a clustered source used to need.
    this.map.addSource(src, {
      type: 'geojson',
      data: this.flatten(features),
      // `line-gradient` is measured against how far along a line a point sits,
      // and MapLibre only computes that when asked. Without it the pulse layers
      // below are rejected by the style spec at runtime.
      ...(layer.pulse ? { lineMetrics: true } : {}),
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
      const thread = layer.pulse
        ? networkColor(layer.pulse.networkKey)
        : (layer.color as unknown as maplibregl.ExpressionSpecification);

      const widthByZoom = (stops: Array<[number, number]>) =>
        [
          'interpolate',
          ['linear'],
          ['zoom'],
          ...stops.flat(),
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
              'line-opacity': 0.3,
              /*
               * Blur is paid per pixel covered, and this layer now covers a
               * great deal more of them: every link is drawn whole where half
               * of them used to be short stubs, so the same glow costs roughly
               * twice what it did. Halved here and narrowed, which on a dense
               * metro block is the difference between a haze and a legible
               * thread anyway — the old figures were tuned when there were
               * fewer lines to pile on top of each other.
               */
              'line-blur': ['interpolate', ['linear'], ['zoom'], 5, 2, 11, 5, 16, 9],
              // The map opens on the whole state, where the median corridor is
              // under three pixels long. A thread that is also thin there is a
              // thread nobody can find, so the glow starts wide and the line
              // grows into it rather than out of nothing.
              'line-width': widthByZoom([
                [5, 6],
                [11, 9],
                [16, 16],
              ]),
            },
          },
          under,
        );
        // The core, thin and bright. Drawn solid beneath the pulse so the
        // corridor never disappears between passes — the movement reads as
        // something travelling along a thread that is always there.
        this.map.addLayer(
          {
            id: `${layer.id}-line`,
            type: 'line',
            source: src,
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': thread,
              'line-opacity': 0.55,
              'line-width': widthByZoom([
                [5, 2.6],
                [11, 3.2],
                [16, 5],
              ]),
            },
          },
          under,
        );
        /*
         * One layer per phase band.
         *
         * `line-gradient` is a single ramp for a whole layer — it cannot be
         * driven from a feature's own properties the way a colour or a width
         * can. So the per-record phase that makes this a ripple rather than a
         * blink has to come from somewhere else, and the cheapest somewhere is
         * a handful of layers over the same source, each filtered to one band
         * and each offset a fraction of a period from the last.
         *
         * The cost of that choice is a fixed number of style layers, paid once.
         * What it buys is a frame that costs `bands` paint updates no matter how
         * many records are drawn — the reason this can carry a network several
         * times denser than the one the slider could.
         */
        for (let band = 0; band < (layer.pulse?.bands ?? 1); band++) {
          this.map.addLayer(
            {
              id: `${layer.id}-line-pulse-${band}`,
              type: 'line',
              source: src,
              // Not drawn at all where it could not be seen. Below this the
              // median link is about a pixel, so these layers were costing a
              // gradient texture per tile and a pass of overdraw to render
              // movement at a scale that cannot hold it — on the very view the
              // map opens with. The casing and core still draw the network
              // there; it is the animation that stops.
              minzoom: PULSE_FROM_ZOOM,
              filter: ['==', ['get', layer.pulse!.phaseKey], band] as unknown as
                maplibregl.FilterSpecification,
              layout: { 'line-cap': 'butt', 'line-join': 'round' },
              paint: {
                'line-opacity': 0.9,
                'line-width': ['interpolate', ['linear'], ['zoom'], 6, 1.4, 11, 2.6, 16, 5],
                // Under reduced motion this ramp is never replaced, so what a
                // reader who asked for stillness gets is one soft pass of light
                // frozen along each strand rather than a flat line.
                'line-gradient': pulseRamp(band / (layer.pulse?.bands ?? 1)),
              },
            },
            under,
          );
          this.pulseLayers.add(`${layer.id}-line-pulse-${band}`);
        }
        this.startPulse();
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
        /*
         * Dots rise out of the surface rather than switching on over it.
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
        'circle-opacity': [
          'interpolate',
          ['linear'],
          ['zoom'],
          tier.emergeFrom, 0,
          tier.pointsFrom, 0.95,
        ] as unknown as maplibregl.ExpressionSpecification,
      },
    });

    this.bindInteractions(layer, `${layer.id}-points`);
  }

  /**
   * Run the pulse along every visible band.
   *
   * Driven by the clock rather than by a frame counter, so the light travels at
   * the same speed on a 120 Hz display as on a 60 Hz one and at the same speed
   * again on a machine dropping frames. The loop parks itself whenever no pulse
   * layer is switched on, so a reader who never turns corridors on pays nothing
   * for this.
   *
   * A frame is one `setPaintProperty` per band, and nothing else: no geometry,
   * no tile relaid, nothing sent to the worker. That is what lets the layer
   * underneath be static and several times denser than the slider could carry.
   * It is still not free — see `PULSE_FRAME_MS` — so the loop does as little as
   * it can get away with and skips entirely when the movement would not be
   * seen.
   */
  private startPulse() {
    if (REDUCED_MOTION || this.pulseFrame !== null || !this.pulseLayers.size) return;
    const start = performance.now();
    let last = 0;

    // Resolved once rather than per band per frame: this used to run a linear
    // search over every layer on the map sixty times a second to answer a
    // question whose answer never changes.
    const bandsOf = new Map<string, { band: number; bands: number; period: number }>();
    for (const id of this.pulseLayers) {
      const match = id.match(/^(.*)-line-pulse-(\d+)$/);
      const owner = this.layers.find((l) => l.id === match?.[1]);
      if (!match || !owner?.pulse) continue;
      bandsOf.set(id, {
        band: Number(match[2]),
        bands: owner.pulse.bands,
        period: owner.pulse.periodMs,
      });
    }

    const tick = (now: number) => {
      const live = [...this.pulseLayers].filter(
        (id) => this.map.getLayer(id) && this.visible.has(id.replace(/-line-pulse-\d+$/, '')),
      );
      if (!live.length) {
        this.pulseFrame = null;
        return;
      }
      this.pulseFrame = requestAnimationFrame(tick);
      if (now - last < PULSE_FRAME_MS) return;

      /*
       * Yield the frame to the reader.
       *
       * A pan or a zoom is the one moment the map is already spending
       * everything it has, and it is also the moment nobody is watching a glow
       * travel: they are watching where they are going. Standing down until the
       * camera settles costs the animation nothing anyone notices and hands the
       * whole budget back to the interaction.
       */
      if (this.map.getZoom() < PULSE_FROM_ZOOM || this.map.isMoving() || this.map.isZooming()) {
        return;
      }
      last = now;

      for (const id of live) {
        const spec = bandsOf.get(id);
        if (!spec) continue;
        // Bands are staggered a fraction of a period apart, and because the
        // ingest ordered them from the middle of each network outwards, the
        // stagger is what turns a row of independent pulses into one wave
        // leaving the centre of a cluster.
        const at = ((now - start) / spec.period + spec.band / spec.bands) % 1;
        this.map.setPaintProperty(id, 'line-gradient', pulseRamp(at));
      }
    };
    this.pulseFrame = requestAnimationFrame(tick);
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
      '-nodes',
      '-fill',
      '-outline',
      '-line-casing',
      '-line',
      '-line-hit',
      '-points',
      '-cones',
      // One per phase band, so switching the layer off stops the pulse dead
      // rather than leaving a row of lit strands over a hidden layer.
      ...Array.from({ length: layer.pulse?.bands ?? 0 }, (_, band) => `-line-pulse-${band}`),
    ]) {
      const id = `${layer.id}${suffix}`;
      if (this.map.getLayer(id)) {
        this.map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
      }
    }
    // The pulse loop parks itself when nothing is on; switching a filament
    // layer back on has to wake it.
    if (on) this.startPulse();
    this.emitCounts();
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
    // Nodes are regrouped from the surviving cameras rather than dimmed, so a
    // filtered node is a smaller body and not a body with a hidden interior.
    const nodes = this.map.getSource(this.nodeSourceId(layerId)) as GeoJSONSource | undefined;
    nodes?.setData(this.nodeFeatures(layer, visible));
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
    if (this.pulseFrame !== null) cancelAnimationFrame(this.pulseFrame);
    this.pulseFrame = null;
    this.popup?.remove();
    this.map.remove();
  }
}

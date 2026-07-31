import maplibregl, { type Map as MLMap, type GeoJSONSource, type MapGeoJSONFeature } from 'maplibre-gl';
import type { Feature, FeatureCollection, Geometry, Point, Polygon } from 'geojson';
import { baseStyle, MN_BOUNDS, MN_CENTER } from './mapStyle';
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
  geometry: 'point' | 'polygon';
  cluster: boolean;
  /** Attribute holding a compass bearing, if the layer records one. */
  bearingKey?: string;
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
const CLUSTER_MAX_ZOOM = 11;
const CLUSTER_RADIUS = 40;

/**
 * Coverage cones appear as soon as records stop clustering, so "where is it"
 * and "which way does it face" arrive together rather than a few zoom levels
 * apart.
 */
const CONE_MIN_ZOOM = CLUSTER_MAX_ZOOM + 1;

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

  private data = new Map<string, LoadedFeature[]>();
  private visible = new Set<string>();
  private filters = new Map<string, FilterState>();
  private loading = new Set<string>();
  private popup: maplibregl.Popup | null = null;
  /** Set once the map's `load` event has fired. See ready(). */
  private hasLoaded = false;

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

  /** Fetch a layer's GeoJSON the first time it is switched on (spec §8, lazy load). */
  async loadLayer(layer: ClientLayer): Promise<void> {
    if (this.data.has(layer.id) || this.loading.has(layer.id)) return;
    this.loading.add(layer.id);
    try {
      const res = await fetch(layer.dataPath);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const collection = await res.json();
      const features: LoadedFeature[] = collection.features ?? [];
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

  private addLayer(layer: ClientLayer, features: LoadedFeature[]) {
    const src = this.sourceId(layer.id);
    if (this.map.getSource(src)) return;

    this.map.addSource(src, {
      type: 'geojson',
      data: this.flatten(features),
      ...(layer.cluster
        ? { cluster: true, clusterRadius: CLUSTER_RADIUS, clusterMaxZoom: CLUSTER_MAX_ZOOM }
        : {}),
    });

    if (layer.geometry === 'polygon') {
      this.map.addLayer({
        id: `${layer.id}-fill`,
        type: 'fill',
        source: src,
        paint: {
          // Use the grade colour HOLC printed on the original sheet where we
          // have it, so the map reads like the historical document it is.
          'fill-color': ['coalesce', ['get', 'holcFill'], layer.color],
          'fill-opacity': 0.42,
        },
      });
      this.map.addLayer({
        id: `${layer.id}-outline`,
        type: 'line',
        source: src,
        paint: {
          'line-color': ['coalesce', ['get', 'holcFill'], layer.color],
          'line-width': 1.1,
          'line-opacity': 0.85,
        },
      });
      this.bindInteractions(layer, `${layer.id}-fill`);
      return;
    }

    if (layer.cluster) {
      this.map.addLayer({
        id: `${layer.id}-clusters`,
        type: 'circle',
        source: src,
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
        minzoom: CONE_MIN_ZOOM,
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
          'icon-size': ['interpolate', ['linear'], ['zoom'], CONE_MIN_ZOOM, 0.78, 16, 1.3],
        },
      });
    }

    this.map.addLayer({
      id: `${layer.id}-points`,
      type: 'circle',
      source: src,
      ...(layer.cluster ? { filter: ['!', ['has', 'point_count']] } : {}),
      paint: {
        'circle-color': layer.color,
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 3.4, 10, 5.5, 15, 8],
        'circle-stroke-color': '#0a0c10',
        'circle-stroke-width': 1.2,
        'circle-opacity': 0.95,
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
      '-fill',
      '-outline',
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
    const point = centroidOf(feature.geometry);
    this.map.easeTo({
      center: point,
      zoom: Math.max(this.map.getZoom(), feature.geometry.type === 'Point' ? 13 : 11),
      duration: REDUCED_MOTION ? 0 : 500,
    });
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
    this.popup?.remove();
    this.map.remove();
  }
}

/** Representative point for any geometry, used for focusing and distances. */
export function centroidOf(geometry: Geometry): [number, number] {
  if (geometry.type === 'Point') return geometry.coordinates as [number, number];
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  const visit = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === 'number') {
      const [lng, lat] = c as number[];
      minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
      return;
    }
    if (Array.isArray(c)) c.forEach(visit);
  };
  visit((geometry as Polygon).coordinates);
  return [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
}

export type { MapGeoJSONFeature };

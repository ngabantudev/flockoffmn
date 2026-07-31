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
 * Bearing arrows appear as soon as records stop clustering, so "where is it"
 * and "which way does it face" arrive together rather than a few zoom levels
 * apart.
 */
const BEARING_MIN_ZOOM = CLUSTER_MAX_ZOOM + 1;

/**
 * Numeric bearing written onto the flattened copy for the map to rotate by.
 * Prefixed because it is ours, not a field any upstream source published.
 */
const BEARING_PROP = '__bearing';

/**
 * A single compass bearing in degrees, or null when the source does not give
 * one unambiguously.
 *
 * OSM's `direction` is free text and carries three different things:
 *
 *   "180"      one camera, one heading — the only case we can draw
 *   "108-153"  a sector. Drawing its midpoint would state a heading the
 *              surveyor did not record.
 *   "321;109"  several cameras sharing a pole, each facing a different way.
 *              One arrow cannot say that.
 *
 * The last two keep their verbatim value in the detail panel and render as
 * plain dots. Turning them into a number would put a confident arrow on the
 * map pointing somewhere nobody observed — and `Number("321;109")` is NaN,
 * which MapLibre would happily rotate to due north.
 */
export function parseBearing(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const value = String(raw).trim();
  if (!value || value.includes(';') || value.includes(',')) return null;
  // A range such as "108-153". Guarded before Number() because Number("8-53")
  // is NaN anyway, but the intent should be legible rather than incidental.
  if (/^-?\d+(\.\d+)?\s*-\s*\d+(\.\d+)?$/.test(value)) return null;
  const degrees = Number(value);
  if (!Number.isFinite(degrees)) return null;
  return ((degrees % 360) + 360) % 360;
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
  private flatten(layer: ClientLayer, features: LoadedFeature[]): FeatureCollection {
    return {
      type: 'FeatureCollection',
      features: features.map((f) => {
        const properties: Record<string, unknown> = {
          ...f.properties.attributes,
          ...f.properties,
          attributes: undefined,
        };
        // Only set when a single bearing was actually recorded, so the arrow
        // layer can filter on the property's presence rather than trying to
        // distinguish "due north" from "unparseable" after the fact.
        if (layer.bearingKey) {
          const bearing = parseBearing(f.properties.attributes[layer.bearingKey]);
          if (bearing !== null) properties[BEARING_PROP] = bearing;
        }
        return { type: 'Feature', geometry: f.geometry, properties };
      }) as Feature[],
    };
  }

  /**
   * Arrow sprite for a layer's bearing indicator, drawn once per layer.
   *
   * Generated rather than shipped as an asset: it has to carry the layer's own
   * colour, and the project does not load images from anywhere but itself. The
   * apex sits at the centre of the sprite so `icon-rotate` pivots on the
   * record's own coordinate instead of swinging the arrow around it.
   */
  private ensureBearingIcon(layer: ClientLayer): string | null {
    const id = `${layer.id}-bearing`;
    if (this.map.hasImage(id)) return id;

    const pixelRatio = 2;
    const px = 44 * pixelRatio;
    const canvas = document.createElement('canvas');
    canvas.width = px;
    canvas.height = px;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // The arrow starts clear of the dot rather than at the centre. The dot is
    // ~7px across at the zoom where these first appear, so an arrow drawn from
    // the middle is simply hidden underneath it — which is how the first
    // version of this failed: the icons were rendering, just invisibly.
    const centre = px / 2;
    const base = centre - px * 0.3;
    const tip = centre - px * 0.48;
    ctx.beginPath();
    ctx.moveTo(centre, tip);
    ctx.lineTo(centre + px * 0.13, base);
    ctx.lineTo(centre - px * 0.13, base);
    ctx.closePath();
    ctx.fillStyle = layer.color;
    ctx.fill();
    // Dark keyline so the arrow survives the pale basemap under it.
    ctx.strokeStyle = '#0a0c10';
    ctx.lineWidth = px * 0.03;
    ctx.stroke();

    this.map.addImage(id, ctx.getImageData(0, 0, px, px), { pixelRatio });
    return id;
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
      data: this.flatten(layer, features),
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

    // Arrows go under the dots: the dot is the record's exact position and the
    // thing you click, so it should never be covered by the indicator.
    const bearingIcon = layer.bearingKey ? this.ensureBearingIcon(layer) : null;
    if (bearingIcon) {
      this.map.addLayer({
        id: `${layer.id}-bearing`,
        type: 'symbol',
        source: src,
        minzoom: BEARING_MIN_ZOOM,
        filter: ['all', ['!', ['has', 'point_count']], ['has', BEARING_PROP]],
        layout: {
          'icon-image': bearingIcon,
          'icon-rotate': ['get', BEARING_PROP],
          // Bearings are compass headings, so the arrow turns with the map
          // rather than staying fixed on the screen.
          'icon-rotation-alignment': 'map',
          // Cameras cluster tightly along a corridor; hiding the ones that
          // collide would misrepresent how many are there.
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-size': ['interpolate', ['linear'], ['zoom'], BEARING_MIN_ZOOM, 0.68, 16, 1],
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
      '-bearing',
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
    source.setData(this.flatten(layer, this.filteredFeatures(layerId)));
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

import maplibregl from 'maplibre-gl';
import { representativePoint } from './geo.mjs';

/**
 * A live ADS-B overlay for the main map — deliberately not a registry layer.
 *
 * Every other layer on the map is a static file fetched once, with a fixed
 * feature count and source date baked in at build time (see
 * src/layers/data.ts). This is a continuously-polled third-party pass-through
 * with none of that: no stable count, no filters, no citation the way a
 * civic dataset has one. Folding it into MapController's layer model would
 * mean teaching that shared class about live data for the sake of the one
 * layer that isn't; keeping it separate keeps every other layer's contract
 * exactly as simple as it already is.
 *
 * Lazy by design: nothing here runs until start() is called, matching the
 * "nothing draws until the reader switches it on" rule the rest of the map
 * already follows — so leaving the box unchecked costs nothing, no
 * background polling of a third party on a visitor's behalf.
 */

const POLL_MS = 10_000;
/** How far ahead the dashed projection line reaches, at current speed and heading. */
const PROJECTION_MINUTES = 10;
/** Real fixes kept per aircraft for the ambient trail — ~3 minutes at the poll rate above. */
const TRAIL_LENGTH = 18;
const AIRPORTS_URL = '/data/reference/mn-airports.geojson';

// Lucide's "plane" icon path, verbatim. Its nose sits at (21,3) in the 24x24
// box — a bearing of 45° (NE) from the icon's own centre — so every rotation
// below subtracts 45 from the reported track before handing MapLibre a
// bearing to turn the sprite to.
const PLANE_PATH =
  'M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z';
const NOSE_OFFSET_DEG = 45;

/** Low-to-high order — drives icon colour, the sidebar dot and the legend from one list. */
export const ALT_BANDS: { id: string; color: string }[] = [
  { id: 'ground', color: '#94a3b8' },
  { id: 'low', color: '#f59e0b' },
  { id: 'mid', color: '#34d399' },
  { id: 'high', color: '#38bdf8' },
  { id: 'veryhigh', color: '#a78bfa' },
];

/** The rainbow used for both trail layers — cool/faint at the oldest end, warm/solid at the newest. */
const TRAIL_GRADIENT = [
  'interpolate',
  ['linear'],
  ['line-progress'],
  0, 'rgba(99,102,241,0.15)',
  0.2, '#6366f1',
  0.4, '#38bdf8',
  0.6, '#34d399',
  0.8, '#facc15',
  1, '#f43f5e',
] as unknown as maplibregl.ExpressionSpecification;

function altBandOf(alt: number | 'ground' | null): string {
  if (alt === 'ground') return 'ground';
  if (typeof alt !== 'number') return 'ground';
  if (alt < 10_000) return 'low';
  if (alt < 25_000) return 'mid';
  if (alt < 35_000) return 'high';
  return 'veryhigh';
}

function buildPlaneSprite(color: string): ImageData {
  const px = 64;
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext('2d')!;
  ctx.translate(px / 2, px / 2);
  ctx.scale((px / 24) * 0.82, (px / 24) * 0.82);
  ctx.translate(-12, -12);
  const p = new Path2D(PLANE_PATH);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.fillStyle = color;
  ctx.fill(p);
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = '#0a0c10';
  ctx.stroke(p);
  return ctx.getImageData(0, 0, px, px);
}

/** Great-circle destination point — the honest amount of math a straight-line "expected path" deserves. */
function destinationPoint(lat: number, lng: number, bearingDeg: number, distanceNm: number) {
  const R_NM = 3440.065;
  const delta = distanceNm / R_NM;
  const theta = (bearingDeg * Math.PI) / 180;
  const phi1 = (lat * Math.PI) / 180;
  const lambda1 = (lng * Math.PI) / 180;
  const phi2 = Math.asin(
    Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta),
  );
  const lambda2 =
    lambda1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
      Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2),
    );
  return { lat: (phi2 * 180) / Math.PI, lng: (((lambda2 * 180) / Math.PI + 540) % 360) - 180 };
}

/**
 * The current flight leg out of a full multi-day trace: scan backward from
 * "now" for the most recent run of "on ground" fixes, and start the trail
 * there — at the airport the aircraft most recently left — rather than
 * drawing the entire multi-day, multi-flight history the raw file retains.
 */
function currentLegCoords(trace: unknown[]): [number, number][] {
  let cutIndex = 0;
  for (let i = trace.length - 1; i >= 0; i--) {
    const point = trace[i] as unknown[];
    if (point[3] === 'ground') {
      let j = i;
      while (j >= 0 && (trace[j] as unknown[])[3] === 'ground') j--;
      cutIndex = j + 1;
      break;
    }
  }
  return trace
    .slice(cutIndex)
    .map((p) => p as unknown[])
    .filter((p) => typeof p[1] === 'number' && typeof p[2] === 'number')
    .map((p) => [p[2] as number, p[1] as number]);
}

type LatLng = { lat: number; lng: number };

type Ac = {
  hex: string;
  flight: string | null;
  type: string | null;
  alt: number | 'ground' | null;
  gs: number | null;
  track: number;
  seen: number;
};

type Tracked = {
  from: LatLng;
  to: LatLng;
  fetchedAtMs: number;
  /** Real fixes only, oldest first — never the interpolated/estimated position. */
  history: LatLng[];
} & Ac;

export interface LiveFlightsStatus {
  count: number;
  ageSeconds: number | null;
  error: string | null;
}

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
const PLANE_LAYER_IDS = ['live-trails-line', 'live-projected-line', 'live-selected-trace-line', 'live-aircraft-points'];
const AIRPORT_LAYER_IDS = ['live-airports-fill', 'live-airports-outline', 'live-airports-labels'];

export class LiveFlightsOverlay {
  private map: maplibregl.Map;
  private onStatus: (status: LiveFlightsStatus) => void;
  private tracked = new Map<string, Tracked>();
  private lastPollAt = 0;
  private lastError: string | null = null;
  private popup: maplibregl.Popup | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private statusTimer: ReturnType<typeof setInterval> | null = null;
  private rafId: number | null = null;
  private layersAdded = false;
  private active = false;
  private reducedMotion: boolean;

  private airportsLoaded = false;
  private selectedHex: string | null = null;
  private selectedTraceCache = new Map<string, [number, number][]>();

  constructor(map: maplibregl.Map, onStatus: (status: LiveFlightsStatus) => void) {
    this.map = map;
    this.onStatus = onStatus;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  start() {
    if (this.active) return;
    this.active = true;
    this.ensureReady(() => {
      this.ensureLayers();
      this.setVisible(true);
      void this.loadAirportsOnce();
      void this.poll();
      this.pollTimer = setInterval(() => void this.poll(), POLL_MS);
      this.statusTimer = setInterval(() => this.emitStatus(), 1000);
      this.loop();
    });
  }

  stop() {
    this.active = false;
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.statusTimer) clearInterval(this.statusTimer);
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.pollTimer = null;
    this.statusTimer = null;
    this.rafId = null;
    this.tracked.clear();
    this.selectedHex = null;
    this.popup?.remove();
    this.popup = null;
    this.setVisible(false);
    this.setSelectedTraceCoords([]);
    this.onStatus({ count: 0, ageSeconds: null, error: null });
  }

  private ensureReady(cb: () => void) {
    if (this.map.loaded()) cb();
    else this.map.once('load', cb);
  }

  private ensureLayers() {
    if (this.layersAdded) return;
    this.layersAdded = true;

    for (const band of ALT_BANDS) {
      this.map.addImage(`live-plane-${band.id}`, buildPlaneSprite(band.color), { pixelRatio: 2 });
    }

    // Airports first, so they sit under every plane and trail. Fill + outline
    // for the true boundary (a small patch of colour even zoomed out), plus
    // a label at each airport's representative point so its own identifier
    // reads clearly at any zoom the fill has shrunk to a sliver at.
    this.map.addSource('live-airports', { type: 'geojson', data: EMPTY_FC });
    this.map.addLayer({
      id: 'live-airports-fill',
      type: 'fill',
      source: 'live-airports',
      paint: { 'fill-color': '#facc15', 'fill-opacity': 0.28 },
    });
    this.map.addLayer({
      id: 'live-airports-outline',
      type: 'line',
      source: 'live-airports',
      paint: { 'line-color': '#facc15', 'line-width': 2, 'line-opacity': 0.9 },
    });
    this.map.addSource('live-airport-labels', { type: 'geojson', data: EMPTY_FC });
    this.map.addLayer({
      id: 'live-airports-labels',
      type: 'symbol',
      source: 'live-airport-labels',
      layout: {
        'text-field': ['get', 'label'],
        'text-font': ['Noto Sans Regular'],
        'text-size': 12,
        'text-allow-overlap': false,
        'text-optional': true,
      },
      paint: {
        'text-color': '#facc15',
        'text-halo-color': '#0a0c10',
        'text-halo-width': 1.4,
      },
    });

    // Ambient trails, the selected aircraft's full trace, the projected path,
    // then the planes — draw order is stacking order, and a plane should
    // never sit under its own history.
    this.map.addSource('live-trails', { type: 'geojson', lineMetrics: true, data: EMPTY_FC });
    this.map.addLayer({
      id: 'live-trails-line',
      type: 'line',
      source: 'live-trails',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-gradient': TRAIL_GRADIENT,
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1.5, 8, 2.5, 12, 4],
        'line-opacity': 0.85,
      },
    });

    // The selected aircraft's real history, from wherever it last left the
    // ground — not just the last few minutes since this tab started polling.
    // Bolder than the ambient trail so "this is the one you picked" reads
    // unambiguously even where the two overlap near the plane's current
    // position.
    this.map.addSource('live-selected-trace', { type: 'geojson', lineMetrics: true, data: EMPTY_FC });
    this.map.addLayer({
      id: 'live-selected-trace-line',
      type: 'line',
      source: 'live-selected-trace',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-gradient': TRAIL_GRADIENT,
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 2.5, 8, 4, 12, 6],
        'line-opacity': 0.95,
      },
    });

    this.map.addSource('live-projected', { type: 'geojson', data: EMPTY_FC });
    this.map.addLayer({
      id: 'live-projected-line',
      type: 'line',
      source: 'live-projected',
      layout: { 'line-cap': 'round' },
      paint: {
        'line-color': '#64748b',
        'line-width': 1.5,
        'line-dasharray': [1, 1.6],
        'line-opacity': 0.55,
      },
    });

    this.map.addSource('live-aircraft', { type: 'geojson', data: EMPTY_FC });
    this.map.addLayer({
      id: 'live-aircraft-points',
      type: 'symbol',
      source: 'live-aircraft',
      layout: {
        'icon-image': ['get', 'iconId'],
        'icon-rotate': ['get', 'rotate'],
        'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-size': ['interpolate', ['linear'], ['zoom'], 4, 0.45, 8, 0.85, 12, 1.2],
        // The callsign, and nothing else, by default — altitude, speed and
        // the rest stay one click away in the popup.
        'text-field': ['get', 'flight'],
        'text-font': ['Noto Sans Regular'],
        'text-size': 10,
        'text-offset': [0, 1.2],
        'text-anchor': 'top',
        // Icons never hide — a plane does not stop existing because its
        // label collided with a neighbour's. Labels thin out first instead.
        'text-allow-overlap': false,
        'text-optional': true,
      },
      paint: {
        'text-color': '#e2e8f0',
        'text-halo-color': '#0a0c10',
        'text-halo-width': 1.2,
      },
    });

    this.map.on('click', 'live-aircraft-points', (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const p = f.properties as Record<string, unknown>;
      this.popup?.remove();
      this.popup = new maplibregl.Popup({ offset: 10 })
        .setLngLat(e.lngLat)
        .setText(
          `${p.flight || '—'} · ${p.type || 'unknown type'} · ${p.alt ?? '?'} ft · ${p.gs ?? '?'} kt · ${p.seen}s ago`,
        )
        .addTo(this.map);
      const hex = (f.properties as { hex?: string }).hex;
      if (hex) void this.selectAircraft(hex);
    });
    this.map.on('mouseenter', 'live-aircraft-points', () => {
      this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', 'live-aircraft-points', () => {
      this.map.getCanvas().style.cursor = '';
    });
  }

  /**
   * Fetched once per page load and cached on the instance — airports don't
   * move, so re-fetching on every start() (toggle off, toggle back on) would
   * just ask the same static file for the same answer.
   */
  private async loadAirportsOnce() {
    if (this.airportsLoaded) return;
    this.airportsLoaded = true;
    try {
      const res = await fetch(AIRPORTS_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const doc = await res.json();
      const features = doc.features ?? [];
      (this.map.getSource('live-airports') as maplibregl.GeoJSONSource | undefined)?.setData(doc);
      const labelPoints: GeoJSON.Feature[] = features.map((f: GeoJSON.Feature) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: representativePoint(f.geometry as never) },
        properties: f.properties,
      }));
      (this.map.getSource('live-airport-labels') as maplibregl.GeoJSONSource | undefined)?.setData({
        type: 'FeatureCollection',
        features: labelPoints,
      });
    } catch {
      // Fails quietly: airports are decoration for the live overlay, not a
      // claim this feature depends on. The planes still work without them.
      this.airportsLoaded = false;
    }
  }

  private async selectAircraft(hex: string) {
    this.selectedHex = hex;
    let coords = this.selectedTraceCache.get(hex);
    if (!coords) {
      try {
        const res = await fetch(`/api/trace/${hex}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const doc = await res.json();
        coords = currentLegCoords(doc.trace ?? []);
        this.selectedTraceCache.set(hex, coords);
      } catch {
        coords = [];
      }
    }
    // Guards against a second click landing while the first fetch is still
    // in flight — only the most recently selected aircraft's trace is drawn.
    if (this.selectedHex === hex) this.setSelectedTraceCoords(coords);
  }

  private setSelectedTraceCoords(coords: [number, number][]) {
    const src = this.map.getSource('live-selected-trace') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    const features: GeoJSON.Feature[] =
      coords.length >= 2
        ? [{ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} }]
        : [];
    src.setData({ type: 'FeatureCollection', features });
  }

  private setVisible(visible: boolean) {
    for (const id of [...AIRPORT_LAYER_IDS, ...PLANE_LAYER_IDS]) {
      if (this.map.getLayer(id)) this.map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    }
  }

  private bringToFront() {
    for (const id of [...AIRPORT_LAYER_IDS, ...PLANE_LAYER_IDS]) {
      if (this.map.getLayer(id)) this.map.moveLayer(id);
    }
  }

  private currentInterpolated(entry: Tracked): LatLng {
    const t = Math.min(1, (performance.now() - entry.fetchedAtMs) / POLL_MS);
    return {
      lat: entry.from.lat + (entry.to.lat - entry.from.lat) * t,
      lng: entry.from.lng + (entry.to.lng - entry.from.lng) * t,
    };
  }

  private async poll() {
    const startedAt = performance.now();
    try {
      const res = await fetch('/api/aircraft', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      this.lastError = null;
      this.lastPollAt = Date.now();
      const seenHex = new Set<string>();
      for (const ac of body.ac ?? []) {
        if (typeof ac.lat !== 'number' || typeof ac.lon !== 'number') continue;
        seenHex.add(ac.hex);
        const prev = this.tracked.get(ac.hex);
        const fix = { lat: ac.lat, lng: ac.lon };
        this.tracked.set(ac.hex, {
          hex: ac.hex,
          from: prev ? this.currentInterpolated(prev) : fix,
          to: fix,
          fetchedAtMs: startedAt,
          history: [...(prev?.history ?? []), fix].slice(-TRAIL_LENGTH),
          track: ac.track ?? 0,
          gs: ac.gs ?? null,
          flight: (ac.flight || '').trim() || null,
          type: ac.t || null,
          alt: ac.alt_baro === 'ground' ? 'ground' : (ac.alt_baro ?? null),
          seen: ac.seen ?? 0,
        });
      }
      for (const hex of [...this.tracked.keys()]) if (!seenHex.has(hex)) this.tracked.delete(hex);
      if (this.selectedHex && !seenHex.has(this.selectedHex)) {
        this.selectedHex = null;
        this.setSelectedTraceCoords([]);
      }
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
    }
    this.emitStatus();
  }

  private emitStatus() {
    if (!this.active) return;
    const ageSeconds = this.lastPollAt ? Math.round((Date.now() - this.lastPollAt) / 1000) : null;
    this.onStatus({ count: this.tracked.size, ageSeconds, error: this.lastError });
  }

  private loop = () => {
    if (!this.active) return;
    // Re-asserted every tick, not just every poll: MapController moves every
    // registry layer to the top of the style the first time each one loads
    // (see mapController.ts's restack()), which has no idea this overlay
    // exists and will happily land a newly-toggled layer above it. Running
    // this here — cheap, a pure reorder of an in-memory array, no re-fetch —
    // means that window is one frame wide instead of up to one poll interval.
    this.bringToFront();
    this.renderFrame();
    if (!this.reducedMotion) this.rafId = requestAnimationFrame(this.loop);
    else this.rafId = window.setTimeout(this.loop, POLL_MS) as unknown as number;
  };

  private renderFrame() {
    const points: GeoJSON.Feature[] = [];
    const trails: GeoJSON.Feature[] = [];
    const projections: GeoJSON.Feature[] = [];

    for (const [hex, e] of this.tracked) {
      const pos = this.currentInterpolated(e);
      const band = altBandOf(e.alt);

      points.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [pos.lng, pos.lat] },
        properties: {
          hex,
          iconId: `live-plane-${band}`,
          rotate: (((e.track - NOSE_OFFSET_DEG) % 360) + 360) % 360,
          flight: e.flight,
          type: e.type,
          alt: e.alt,
          gs: e.gs,
          track: e.track,
          seen: Math.round(e.seen),
        },
      });

      // The ambient trail always reaches forward to the plane's current
      // animated position, not just its last confirmed fix — otherwise a
      // visible gap opens between the trail's end and the icon between
      // polls.
      const trailCoords = [...e.history, pos].map((p) => [p.lng, p.lat]);
      if (trailCoords.length >= 2) {
        trails.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: trailCoords }, properties: {} });
      }

      // Only drawn for aircraft actually going somewhere — a projected path
      // for a parked or taxiing aircraft would be a straight line to nowhere.
      if (e.alt !== 'ground' && typeof e.gs === 'number' && e.gs > 20) {
        const distanceNm = (e.gs * PROJECTION_MINUTES) / 60;
        const dest = destinationPoint(pos.lat, pos.lng, e.track, distanceNm);
        projections.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [pos.lng, pos.lat],
              [dest.lng, dest.lat],
            ],
          },
          properties: {},
        });
      }
    }

    (this.map.getSource('live-trails') as maplibregl.GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: trails,
    });
    (this.map.getSource('live-projected') as maplibregl.GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: projections,
    });
    (this.map.getSource('live-aircraft') as maplibregl.GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: points,
    });
  }
}

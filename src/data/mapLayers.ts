// src/data/mapLayers.ts
//
// Layer sources are PMTiles archives hosted in a public Cloudflare R2
// bucket, fetched client-side via HTTP range requests (see the pmtiles
// protocol registration in MapParent.astro) — no server route needed.
// Camera locations go through this same tiled path rather than a plain
// JS array (as mn-data-center-watch does for its much smaller data-center
// list) because a future national rollout of Flock camera locations would
// be too large to ship as static JSON.

export type PmtilesLayerType = 'fill' | 'circle';

export interface PmtilesLayerConfig {
  id: string;
  fileName: string;
  fallbackLayerName: string;
  type: PmtilesLayerType;
  // Paint for individual (non-clustered) features.
  paint: Record<string, unknown>;
  // When true, the source was built with tippecanoe --cluster-distance, so
  // features carry `clustered` (boolean), `point_count` (number), and
  // `point_count_abbreviated` (string) — rendered as a separate bubble +
  // count-label layer instead of one-dot-per-feature. Needed once a metro
  // area has enough cameras that individual dots would overlap into an
  // unreadable smear at anything but street-level zoom.
  cluster?: boolean;
  clusterPaint?: Record<string, unknown>;
  clusterTextPaint?: Record<string, unknown>;
  // Extra `line` layer stacked on top of an area layer — `fill-outline-color`
  // alone can't control width, and area boundaries need a crisper border
  // than MapLibre's default hairline.
  outlinePaint?: Record<string, unknown>;
  // Property to render as an always-on text label (e.g. a ward number),
  // optionally prefixed (e.g. "Ward " + "7" -> "Ward 7").
  labelField?: string;
  labelPrefix?: string;
  labelPaint?: Record<string, unknown>;
}

// Distinct pastel fill per ward, cycling through this palette by ward
// number so any two consecutively-numbered wards — which in practice are
// usually the ones sharing a border — always land on different colors.
// Modeled on St. Paul's public "Council Wards & District Council Lookup"
// map (stpaul.maps.arcgis.com): soft pastel fills, a dark crisp outline,
// and a centered "Ward N" label per polygon.
const WARD_PASTEL_PALETTE = [
  '#F6C6C7', '#C9C6E4', '#B7DDF2', '#D6E8B5', '#F5D6A8', '#EFC3E0',
  '#F3E39C', '#B8E4D0', '#E5C9A8', '#C3CCEB', '#F0BFC8', '#C7E8E0',
  '#DDD2F0', '#F8E0B0',
];
const WARD_OUTLINE_COLOR = '#44403c';

// Cycles the palette via ward-number modulo, falling back to a neutral
// grey for any feature missing a usable ward number.
const WARD_FILL_COLOR_EXPRESSION = [
  'match',
  ['%', ['to-number', ['coalesce', ['get', 'ward'], 0]], WARD_PASTEL_PALETTE.length],
  ...WARD_PASTEL_PALETTE.flatMap((color, i) => [i, color]),
  '#e5e7eb',
];

// Set PUBLIC_PMTILES_BASE_URL once the R2 bucket for this project exists
// (e.g. https://pub-xxxxxxxx.r2.dev). Left blank until then — layers with
// no base URL are skipped rather than erroring.
export function getPmtilesBaseUrl(): string {
  return import.meta.env.PUBLIC_PMTILES_BASE_URL ?? '';
}

export const PMTILES_LAYERS: PmtilesLayerConfig[] = [
  {
    id: 'city-wards',
    // Matches scripts/build-pmtiles.sh's output filename.
    fileName: 'city-wards.pmtiles',
    fallbackLayerName: 'mn_city_wards',
    type: 'fill',
    paint: {
      'fill-color': WARD_FILL_COLOR_EXPRESSION,
      'fill-opacity': 0.55,
      'fill-outline-color': WARD_OUTLINE_COLOR,
    },
    outlinePaint: {
      'line-color': WARD_OUTLINE_COLOR,
      'line-width': 1.5,
    },
    labelField: 'ward',
    labelPrefix: 'Ward ',
    labelPaint: {
      'text-color': '#1f2937',
      'text-halo-color': '#ffffff',
      'text-halo-width': 1.4,
    },
  },
  {
    id: 'flock-cameras',
    // Matches scripts/build-pmtiles.sh's output filename.
    fileName: 'flock-cameras.pmtiles',
    fallbackLayerName: 'mn_flock_cameras',
    type: 'circle',
    cluster: true,
    paint: {
      'circle-color': '#dc2626',
      'circle-radius': 6,
      'circle-stroke-width': 1.5,
      'circle-stroke-color': '#ffffff',
    },
    // Color/size steps keyed on tippecanoe's point_count. Thresholds are
    // sized for a single-state camera count today (MN tops out in the low
    // hundreds per cluster); revisit these once this covers more states.
    clusterPaint: {
      'circle-color': [
        'step',
        ['get', 'point_count'],
        '#65a30d', // < 10 cameras
        10,
        '#f59e0b', // 10-49
        50,
        '#ea580c', // 50-199
        200,
        '#dc2626', // 200+
      ],
      'circle-radius': [
        'step',
        ['get', 'point_count'],
        16,
        10,
        20,
        50,
        26,
        200,
        32,
      ],
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff',
    },
    clusterTextPaint: {
      'text-color': '#ffffff',
      'text-halo-color': 'rgba(0, 0, 0, 0.25)',
      'text-halo-width': 1,
    },
  },
];

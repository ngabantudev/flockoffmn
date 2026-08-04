/**
 * Site theme (light/dark) constants and helpers, shared between Nav.astro's
 * toggle control and the map's theme-aware basemap/paint logic (mapStyle.ts,
 * mapController.ts). Deliberately a real module — not inlined into a
 * `<script>` block — because a script with no imports gets inlined directly
 * into the HTML by Astro's bundler instead of extracted to an external
 * `/_astro/*.js` file, and this site's CSP (`script-src 'self'`, no
 * `unsafe-inline`) silently blocks inline script *content* regardless of
 * `is:inline`/module/defer. An external file with a real `src` is required
 * for this to execute at all; importing from a real module is what forces
 * Astro to treat it that way.
 */

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'flockoff:theme';
export const THEME_CHANGE_EVENT = 'flockoff:theme-change';

/**
 * Reads the theme actually in effect, not just an explicit override:
 * `dataset.theme` is only set once a visitor has clicked a theme control (see
 * theme-init.js and setTheme() below) — before that, the page is following
 * `prefers-color-scheme` live via CSS alone, with no attribute to read. A
 * version of this that just checked `=== 'light'` and defaulted everything
 * else to 'dark' shipped once; it made the theme control itself show "Dark"
 * as active for an OS-light visitor who'd never touched it, and (via
 * initialMapStyle() below) picked a dark basemap for them on first paint.
 */
export function currentTheme(): Theme {
  const explicit = document.documentElement.dataset.theme;
  if (explicit === 'light' || explicit === 'dark') return explicit;
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage can throw (e.g. Safari private browsing) — the dataset.theme
    // change above still takes effect for this page view.
  }
  document.dispatchEvent(new CustomEvent<{ theme: Theme }>(THEME_CHANGE_EVENT, { detail: { theme } }));
}

/**
 * Returns an unsubscribe function rather than void: the actual listener
 * `document.addEventListener` sees is the wrapper closure below, not
 * `handler` itself, so a caller that later tried
 * `removeEventListener(EVENT, handler)` on its own would silently remove
 * nothing — this is the only reference that actually matches.
 */
export function onThemeChange(handler: (theme: Theme) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<{ theme: Theme }>).detail.theme);
  document.addEventListener(THEME_CHANGE_EVENT, listener);
  return () => document.removeEventListener(THEME_CHANGE_EVENT, listener);
}

/**
 * Map basemap styles. Independent of the site theme by design — see the
 * in-map "Map theme" control (mapController.ts's ThemeControl) — but a
 * visitor who has never touched that control gets whichever of these two
 * defaults matches their site theme (initialMapStyle() below), rather than
 * an arbitrary fixed style. `maptilerId` is the MapTiler style path segment
 * (`.../maps/<maptilerId>/256/...`), not a full URL — mapStyle.ts's
 * `tileUrlForStyle()` builds the two defaults from the pre-committed full
 * PUBLIC_TILE_URL/PUBLIC_TILE_URL_LIGHT and everything else from
 * PUBLIC_TILE_KEY, so first paint never depends on string-building from a
 * bare key before any app code has run.
 */
export type MapStyleId = 'streets-dark' | 'muted-dark' | 'streets-light' | 'minimal-light';

export const MAP_STYLES: Record<MapStyleId, { label: string; maptilerId: string; dark: boolean }> = {
  'streets-dark': { label: 'Streets (Dark)', maptilerId: 'streets-v4-dark', dark: true },
  'muted-dark': { label: 'Muted (Dark)', maptilerId: 'basic-v2-dark', dark: true },
  'streets-light': { label: 'Streets (Light)', maptilerId: 'streets-v4-pastel', dark: false },
  'minimal-light': { label: 'Minimal (Light)', maptilerId: 'dataviz-v4-light', dark: false },
};

export const DEFAULT_DARK_STYLE: MapStyleId = 'streets-dark';
export const DEFAULT_LIGHT_STYLE: MapStyleId = 'streets-light';

export const MAP_STYLE_STORAGE_KEY = 'flockoff:map-style';
export const MAP_STYLE_CHANGE_EVENT = 'flockoff:map-style-change';

function isMapStyleId(v: string | null): v is MapStyleId {
  return v !== null && Object.hasOwn(MAP_STYLES, v);
}

/** The visitor's explicit choice, if they've ever made one — not a default. */
export function storedMapStyle(): MapStyleId | null {
  try {
    const v = window.localStorage.getItem(MAP_STYLE_STORAGE_KEY);
    return isMapStyleId(v) ? v : null;
  } catch {
    return null;
  }
}

/** What the map should actually show right now: the explicit choice, or the default that matches the current site theme. */
export function initialMapStyle(): MapStyleId {
  return storedMapStyle() ?? (currentTheme() === 'light' ? DEFAULT_LIGHT_STYLE : DEFAULT_DARK_STYLE);
}

export function setMapStyle(id: MapStyleId): void {
  try {
    window.localStorage.setItem(MAP_STYLE_STORAGE_KEY, id);
  } catch {
    // Storage can throw (e.g. Safari private browsing) — the event below
    // still repaints the map for this page view, it just won't persist.
  }
  document.dispatchEvent(new CustomEvent<{ style: MapStyleId }>(MAP_STYLE_CHANGE_EVENT, { detail: { style: id } }));
}

/** See onThemeChange's comment on why this returns an unsubscribe function. */
export function onMapStyleChange(handler: (style: MapStyleId) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<{ style: MapStyleId }>).detail.style);
  document.addEventListener(MAP_STYLE_CHANGE_EVENT, listener);
  return () => document.removeEventListener(MAP_STYLE_CHANGE_EVENT, listener);
}

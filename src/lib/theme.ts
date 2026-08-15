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
  // Site theme and map theme are paired, not independent — matching
  // wealldobettermn.org's THEME_BASEMAP pairing (src/lib/mapStyles.ts):
  // picking Light always switches the basemap to Light too, overriding
  // whatever basemap was picked before. `theme` itself is the paired
  // MapStyleId here (their literal values are the same two strings), so no
  // separate lookup table is needed the way the reference's four-basemap
  // catalog requires one. A visitor can still hand-pick a basemap
  // afterwards via the in-map "Map theme" control — that choice sticks
  // until the next site-theme switch, same as the reference.
  setMapStyle(theme);
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
 * Map basemap flavors. Paired with the site theme (see setTheme above) —
 * switching Light/Dark always switches the basemap to match, though a
 * visitor can hand-pick a basemap afterwards via the in-map "Map theme"
 * control (mapController.ts's ThemeControl); that choice sticks until the
 * next site-theme switch.
 *
 * Only two flavors, where wealldobettermn.org's OpenFreeMap-backed catalog
 * has four (fiord, liberty, positron, dark): this site's basemap is a
 * single self-hosted PMTiles archive (see mapStyle.ts's TILES_URL comment
 * for why — no tile-provider vendor, no rate ceiling, no third party that
 * sees a visitor's pan/zoom traffic) rendered through hand-maintained
 * paint code (BASEMAP_LAYERS) that has to stay legible under every data
 * layer this site carries. Multiplying that to four flavors is a real
 * option — either four more self-hosted palettes reusing the same archive
 * and paint pipeline, or adopting an external vendor like the reference
 * does — but it's an architecture decision, not a styling tweak, and isn't
 * done here; flagged rather than silently matched or silently skipped.
 */
export type MapStyleId = 'dark' | 'light';

export const MAP_STYLES: Record<MapStyleId, { label: string; dark: boolean }> = {
  dark: { label: 'Dark', dark: true },
  light: { label: 'Light', dark: false },
};

export const DEFAULT_DARK_STYLE: MapStyleId = 'dark';
export const DEFAULT_LIGHT_STYLE: MapStyleId = 'light';

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

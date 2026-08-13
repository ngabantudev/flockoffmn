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
 * Map basemap flavors. Independent of the site theme by design — see the
 * in-map "Map theme" control (mapController.ts's ThemeControl) — but a
 * visitor who has never touched that control gets whichever of these two
 * defaults matches their site theme (initialMapStyle() below), rather than
 * an arbitrary fixed style.
 *
 * Only two flavors, where the old MapTiler-backed catalog had four
 * (streets-dark, muted-dark, streets-light, minimal-light): regenerating
 * tiles per style used to be the reason to multiply presets, and that cost
 * is gone now that one self-hosted vector archive serves every flavor (see
 * mapStyle.ts's BASEMAP_LAYERS). The cost that remains is hand-maintained
 * paint code, which has to stay legible under every data layer this site
 * carries — so it stays to exactly the two the site theme needs, not the
 * four a swappable vendor made cheap to offer.
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

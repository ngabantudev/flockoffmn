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

export type Theme = 'light' | 'dark' | 'halloween';

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
  if (explicit === 'light' || explicit === 'dark' || explicit === 'halloween') return explicit;
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
  // wealldobettermn.org's THEME_BASEMAP pairing exactly (see below): picking
  // Light always switches the basemap to its partner too, overriding
  // whatever basemap was picked before. A visitor can still hand-pick a
  // different basemap afterwards via the in-map "Map theme" control — that
  // choice sticks until the next site-theme switch, same as the reference.
  setMapStyle(THEME_BASEMAP[theme]);
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
 * Map basemap flavors — the same four wealldobettermn.org offers (fiord,
 * liberty, positron, dark), same ids, same labels, same light/dark flags
 * (see its src/lib/mapStyles.ts). Unlike the reference, none of these are
 * fetched live from OpenFreeMap at runtime: they're mirrored into this repo
 * (src/lib/basemapStyles/*.json, scripts/tiles/mirror-basemap-styles.mjs)
 * with their vector source repointed at this site's own self-hosted
 * PMTiles archive and their sprite/glyphs repointed at this site's own
 * origin — see that script's header for the full reasoning (in short:
 * §0.7/§0.8/§4 rule out a live third-party request on every visitor's pan
 * and zoom, the same way this repo already avoids that for fonts — see
 * public/fonts/README.md, which predates this and made the same call).
 *
 * Paired with the site theme (see setTheme above and THEME_BASEMAP below):
 * switching Light/Dark always switches the basemap to its partner, though a
 * visitor can hand-pick a different basemap afterwards via the in-map "Map
 * theme" control (mapController.ts's ThemeControl); that choice sticks
 * until the next site-theme switch.
 */
export type MapStyleId = 'fiord' | 'liberty' | 'positron' | 'dark';

export const MAP_STYLES: Record<MapStyleId, { label: string; dark: boolean }> = {
  fiord: { label: 'Fiord (Muted)', dark: true },
  liberty: { label: 'Liberty', dark: false },
  positron: { label: 'Light Minimal', dark: false },
  dark: { label: 'Dark Mode', dark: true },
};

/**
 * Which basemap each site theme pairs with — matching wealldobettermn.org's
 * own THEME_BASEMAP exactly for 'light'/'dark'. `dark` happens to share a
 * name with the MapStyleId it maps to; that's the same coincidence the
 * reference has (its own 'dark' style id), not a rule this depends on —
 * 'light' maps to 'positron', not to a same-named style, because there
 * isn't one.
 *
 * 'halloween' has no reference to match and gets no basemap style of its
 * own — §0.7/§0.8 rule out adding a fifth self-hosted style (with its own
 * mirrored PMTiles/sprite/glyph set) just to darken the map for a seasonal
 * palette swap that's otherwise pure CSS. It reuses the 'dark' basemap,
 * same as the 'dark' site theme does.
 */
export const THEME_BASEMAP: Record<Theme, MapStyleId> = {
  light: 'positron',
  dark: 'dark',
  halloween: 'dark',
};

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
  return storedMapStyle() ?? THEME_BASEMAP[currentTheme()];
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

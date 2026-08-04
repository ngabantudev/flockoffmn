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

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
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

export function onThemeChange(handler: (theme: Theme) => void): void {
  document.addEventListener(THEME_CHANGE_EVENT, (e) => {
    handler((e as CustomEvent<{ theme: Theme }>).detail.theme);
  });
}

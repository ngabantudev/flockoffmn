/**
 * Anti-FOUC theme init. Loaded synchronously and as early as possible in
 * <head> via a plain `is:inline` <script src> tag — the site's CSP
 * (`script-src 'self'`, no `'unsafe-inline'`) means an inline <script> block
 * would silently fail to run, so this has to be its own file.
 *
 * Reads the user's stored theme choice (if any) and applies it before first
 * paint, so a reader who chose "light" never sees a flash of the dark
 * default. No stored value means no override: the page just follows
 * prefers-color-scheme live via CSS.
 */
(function () {
  try {
    var stored = window.localStorage.getItem('flockoff:theme');
    if (stored === 'light' || stored === 'dark') {
      document.documentElement.dataset.theme = stored;
    }
  } catch (err) {
    // Storage can throw (e.g. Safari private browsing) — fall back to the
    // OS-level prefers-color-scheme media query, no theme override.
  }
  document.documentElement.classList.add('js');
})();

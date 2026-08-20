/**
 * Anti-FOUC theme init. Loaded synchronously and as early as possible in
 * <head> via a plain `is:inline` <script src> tag — the site's CSP
 * (`script-src 'self'`, no `'unsafe-inline'`) means an inline <script> block
 * would silently fail to run, so this has to be its own file.
 *
 * Reads the user's stored theme choice (if any) and applies it before first
 * paint, so a reader who chose "light" never sees a flash of the dark
 * default. No stored value means no forced override — except during the
 * October-night Halloween auto-window (11pm–midnight, the visitor's own
 * device clock, see isHalloweenAutoWindow() in src/lib/theme.ts, duplicated
 * here by hand since this plain script can't import that module) — outside
 * that window with no stored choice, the page just follows
 * prefers-color-scheme live via CSS.
 */
(function () {
  var stored = null;
  try {
    stored = window.localStorage.getItem('flockoff:theme');
  } catch (err) {
    // Storage can throw (e.g. Safari private browsing) — fall through to
    // the auto-window check below as if there were no stored choice.
  }
  if (stored === 'light' || stored === 'dark' || stored === 'halloween') {
    document.documentElement.dataset.theme = stored;
    return;
  }
  var now = new Date();
  if (now.getMonth() === 9 && now.getHours() === 23) {
    // Not persisted to localStorage on purpose: this is a nightly default,
    // not a choice, so it reverts on its own once the window passes rather
    // than sticking the way an explicit pick does.
    document.documentElement.dataset.theme = 'halloween';
  }
})();

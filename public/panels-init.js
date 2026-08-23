/**
 * Anti-flash init for #controls' persisted collapsed state. Same mechanism
 * as theme-init.js (see its own header comment): loaded as an external file
 * via a plain `is:inline <script src>` because this site's CSP
 * (`script-src 'self'`, no `'unsafe-inline'`) silently blocks an inline
 * <script> block's actual content, and run synchronously so it executes
 * before the browser gets a chance to paint the panel expanded and then
 * flip it collapsed a frame later.
 *
 * Placed as the first child inside each panel it stamps in MapView.astro
 * (see that file's comment) rather than as a preceding sibling, so the
 * element it stamps already exists in the DOM by the time this runs — a
 * script before the <aside> tag would execute before the parser has even
 * created it.
 *
 * INCLUDED TWICE, and it has to be. #controls is parsed near the top of the
 * map shell and #news-dock near the bottom, so one copy cannot see both: run
 * only from #controls and the dock does not exist yet; run only from the dock
 * and #controls has already painted expanded. Each call stamps whichever
 * elements exist at that moment and skips the rest, which makes running it
 * twice idempotent rather than merely tolerable — setting an attribute that is
 * already set is a no-op, and the browser caches the file after the first
 * request.
 *
 * #controls and #news-dock persist a collapsed state. #detail-panel does not: it is
 * hidden-until-selected, and every explicit selection force-expands it (see
 * MapView.astro's renderDetail), so a persisted flag for it could never be
 * observed by anyone — see the PERSISTENCE note in that file.
 */
(function () {
  try {
    if (window.localStorage.getItem('mapLayersCollapsed') === '1') {
      var el = document.getElementById('controls');
      if (el) el.setAttribute('data-collapsed', '');
    }
    // #news-dock persists too, for the same reason #controls does: it is a
    // standing preference about how much chrome you want beside the map, not
    // a per-selection state like #detail-panel's. Stamped here rather than in
    // MapView's module script so a restored collapsed dock never paints open
    // for a frame first.
    if (window.localStorage.getItem('mapNewsCollapsed') === '1') {
      var news = document.getElementById('news-dock');
      if (news) news.setAttribute('data-collapsed', '');
    }
  } catch (err) {
    // Storage can throw (e.g. Safari private browsing) — the panel just
    // stays expanded for this page view.
  }
})();

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
 * INCLUDED MULTIPLE TIMES, and it has to be. #controls is parsed near the
 * top of the map shell, #news-dock near the bottom, and the per-category
 * `[data-layer-group]` elements sit even further down inside #controls than
 * its own opening tag — so no single copy can see all three. Run only from
 * #controls' own top and the category groups and the dock don't exist yet;
 * run only from the dock and #controls/the groups have already painted
 * expanded. Each call stamps whichever elements exist at that moment and
 * skips the rest, which makes running it more than once idempotent rather
 * than merely tolerable — setting an attribute that is already set is a
 * no-op, and the browser caches the file after the first request.
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
    // Per-category open/closed state in the layer panel. Every category
    // ships closed in the markup (see MapView.astro's own comment on why),
    // so only the categories a reader previously opened need stamping —
    // stored as a JSON object of `{ [categoryId]: true }`, written by
    // MapView's own module script on every `toggle` event a `<details
    // data-layer-group>` fires. Only categories actually present in the DOM
    // at this call are touched, per the multi-inclusion note above.
    var openGroupsRaw = window.localStorage.getItem('mapLayerGroupsOpen');
    if (openGroupsRaw) {
      var openGroups = JSON.parse(openGroupsRaw);
      var groupEls = document.querySelectorAll('[data-layer-group]');
      for (var i = 0; i < groupEls.length; i++) {
        var groupEl = groupEls[i];
        var groupId = groupEl.getAttribute('data-layer-group');
        if (groupId && openGroups[groupId]) groupEl.setAttribute('open', '');
      }
    }
  } catch (err) {
    // Storage can throw (e.g. Safari private browsing), or hold malformed
    // JSON from a future/older version of this script — the groups just
    // stay closed for this page view.
  }
})();

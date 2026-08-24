/**
 * Plain-substring search matching, shared between the layer panel's
 * search-within-layer-names (level 2) and search-within-values (level 3)
 * controls.
 *
 * Dependency-free per CLAUDE.md's shared-lib pattern (see geo.mjs and
 * authority.mjs) — plain Node, no framework, importable from both an Astro
 * component's client script and a plain `node` test run.
 *
 * Deliberately *not* fuzzy and *not* punctuation-folding: a search that
 * silently reinterprets "287(g)" as "287g" is a search a reader can no
 * longer predict the results of. Substring, case-insensitive, nothing more.
 */

/**
 * Below this many candidates, a search box is a control with nothing to
 * control — every item already fits on screen. Matches
 * wealldobettermn.org's own FILTER_INPUT_THRESHOLD.
 */
export const FILTER_INPUT_THRESHOLD = 12;

/** Case-insensitive substring test. An empty/whitespace-only query matches everything. */
export function matchesQuery(text, query) {
  const q = (query ?? '').trim().toLowerCase();
  if (!q) return true;
  return (text ?? '').toLowerCase().includes(q);
}

/**
 * Filter a list of items to those whose text (via `getText`) contains
 * `query`. Returns `items` unchanged (same reference) when the query is
 * empty, so callers can cheaply tell "unfiltered" apart from "filtered to
 * zero".
 */
export function filterByQuery(items, query, getText) {
  const q = (query ?? '').trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => (getText(item) ?? '').toLowerCase().includes(q));
}

/** Whether a list of candidate strings has any query match at all. */
export function anyMatch(texts, query) {
  const q = (query ?? '').trim().toLowerCase();
  if (!q) return true;
  return texts.some((t) => (t ?? '').toLowerCase().includes(q));
}

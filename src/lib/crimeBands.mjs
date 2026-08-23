/**
 * The offence list and band thresholds for the Minneapolis reported-crime
 * layers, shared between the ingest that writes the band attributes
 * (scripts/ingest/mn/crime-minneapolis.mjs) and the registry that colours by
 * them (src/layers/registry.ts).
 *
 * Shared rather than written twice for the reason CLAUDE.md §2 gives for
 * geo.mjs and authority.mjs: a band label is a string that has to match
 * exactly on both sides, and a silent drift between them does not throw — it
 * renders every neighbourhood in the grey "no data" fallback, which looks
 * identical to having no data at all. One table, imported by both, cannot
 * drift.
 *
 * ---------------------------------------------------------------------------
 * WHY EACH OFFENCE HAS ITS OWN STOPS
 * ---------------------------------------------------------------------------
 *
 * These counts span two orders of magnitude. A neighbourhood-year runs 0–9
 * for homicide and 0–1,966 for larceny, so one shared set of thresholds would
 * paint every neighbourhood in the lowest band on the homicide map and tell
 * the reader nothing. Each offence's stops are cut from its own 2018–2025
 * distribution, at roughly the 30th/55th/75th/92nd percentiles rounded to
 * readable numbers.
 *
 * They are fixed absolute values, not quantiles recomputed per ingest: a
 * quantile scheme silently redraws what "high" means every run, so a
 * neighbourhood could change colour in a year its own count never moved.
 * If a distribution shifts far enough that these stop discriminating, change
 * them deliberately, once, and leave them fixed again.
 *
 * For the rare offences the first stop is pinned at 1 so that "none reported"
 * is its own band rather than being blended with "a few". Most neighbourhoods
 * report no homicides in a year — 68% of neighbourhood-years — and a map that
 * says so plainly is more honest than one that hides zero inside a range.
 */

/** Fixed stops for the all-offences total. See the note above on why absolute. */
export const TOTAL_STOPS = [40, 100, 200, 450];

/**
 * The City's eight published categories, in the FBI's own Part I order:
 * violent first, then property. `ucr` is the exact `ucrDescription` string
 * upstream — an unrecognised one throws in the ingest rather than being
 * dropped, so a ninth category is noticed rather than silently excluded.
 */
export const OFFENCES = [
  { key: 'homicide', ucr: 'Homicide', group: 'violent', stops: [1, 2, 3, 4] },
  { key: 'rape', ucr: 'Rape', group: 'violent', stops: [1, 3, 6, 13] },
  { key: 'robbery', ucr: 'Robbery', group: 'violent', stops: [4, 9, 25, 50] },
  { key: 'aggravatedAssault', ucr: 'Aggravated Assault', group: 'violent', stops: [5, 13, 35, 90] },
  { key: 'burglary', ucr: 'Burglary', group: 'property', stops: [16, 30, 45, 75] },
  { key: 'larceny', ucr: 'Larceny', group: 'property', stops: [60, 100, 150, 300] },
  { key: 'autoTheft', ucr: 'Auto Theft', group: 'property', stops: [20, 40, 80, 125] },
  { key: 'arson', ucr: 'Arson', group: 'property', stops: [1, 2, 3, 4] },
];

/**
 * The five band labels for a set of four stops, as both the ingest and the
 * registry render them. A band covering a single value is labelled with that
 * value alone — "0" and "1", not "0–0" and "1–1", which is what the rare
 * offences would otherwise read as.
 *
 * @param {number[]} stops four ascending thresholds
 * @returns {string[]} five labels, lowest band first
 */
export function bandLabels(stops) {
  const edges = [0, ...stops];
  return edges.map((lo, i) => {
    if (i === edges.length - 1) return `${lo}+`;
    const hi = edges[i + 1] - 1;
    // En dash, matching every other range on the site.
    return lo === hi ? `${lo}` : `${lo}–${hi}`;
  });
}

/**
 * Which band a count falls in, as its label. Null for a null count, so a
 * neighbourhood with no figure renders in the fallback colour rather than
 * being silently counted as zero.
 *
 * @param {number[]} stops
 * @param {number|null|undefined} value
 */
export function bandFor(stops, value) {
  if (value === null || value === undefined) return null;
  return bandLabels(stops)[stops.filter((s) => value >= s).length];
}

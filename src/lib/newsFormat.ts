/**
 * Date and coverage-curve formatting shared between NewsFeed.astro's
 * frontmatter (build time, both densities) and its client hydration script
 * (rail only, run in the reader's browser).
 *
 * Kept out of ~/lib/news.ts on purpose: that module imports
 * `node:fs/promises` to read the archive off disk. A *value* import of it
 * from the client `<script>` would pull that into the browser bundle — the
 * script already gets away with `import type { NewsItem } from '~/lib/news'`
 * only because `import type` is erased before the bundle is built. This
 * module touches no Node built-ins, so both sides can import it directly, the
 * same way MapView's script already imports `~/lib/detailFields` and
 * `~/lib/mapController` as values.
 *
 * Formatter *construction* stays at each call site rather than moving in
 * here: building an `Intl.DateTimeFormat` and formatting with a reused one
 * measured at ~125x apart (see NewsFeed.astro), so the frontmatter and the
 * script each build their own formatters once and pass them in. What lives
 * here is the options every formatter must agree on, and the pure arithmetic
 * around them, so the two sides cannot drift on either.
 */

/** `month: 'short', day: 'numeric'` — the row date with no year. */
export const ROW_DATE_OPTS: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
};

/** `ROW_DATE_OPTS` plus a year — for a row the reader has no other way to date. */
export const ROW_DATE_WITH_YEAR_OPTS: Intl.DateTimeFormatOptions = {
  ...ROW_DATE_OPTS,
  year: 'numeric',
};

/** `month: 'long', year: 'numeric'` — an archive month heading or curve caption. */
export const MONTH_LABEL_OPTS: Intl.DateTimeFormatOptions = {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
};

/** Format a `"YYYY-MM"` key with an already-built month formatter. */
export function monthLabel(formatter: Intl.DateTimeFormat, key: string): string {
  const [year, month] = key.split('-').map(Number);
  return formatter.format(new Date(Date.UTC(year, month - 1, 1)));
}

export interface CurvePoint {
  key: string;
  count: number;
}

export interface CurveYearMark {
  index: number;
  year: string;
  pct: number;
}

export interface Curve {
  series: CurvePoint[];
  peak: number;
  sparkW: number;
  sparkH: number;
  barGap: number;
  barW: number;
  barHeight: (count: number) => number;
  yearMarks: CurveYearMark[];
}

const SPARK_W = 100;
const SPARK_H = 24;
const BAR_GAP = 1;

/**
 * Every calendar month between two `"YYYY-MM"` keys, inclusive.
 *
 * Used to zero-fill the coverage curve: `groupByMonth` only emits months that
 * contain something, and the bars are evenly spaced, so an omitted month is
 * not a gap in the curve — it is invisible, and the months either side of it
 * become neighbours. §0.5 puts the curve on the page to show change over
 * time, and §1c forbids implying what the documents do not say; a month
 * where the feed found nothing is a real observation and belongs on the axis
 * at zero.
 */
export function monthsBetween(firstKey: string, lastKey: string): string[] {
  const [fy, fm] = firstKey.split('-').map(Number);
  const [ly, lm] = lastKey.split('-').map(Number);
  const keys: string[] = [];
  for (let y = fy, m = fm; y < ly || (y === ly && m <= lm); ) {
    keys.push(`${y}-${String(m).padStart(2, '0')}`);
    if (m === 12) {
      y += 1;
      m = 1;
    } else m += 1;
  }
  return keys;
}

/**
 * The stories-per-month curve: a zero-filled series, its bar geometry, and
 * year-boundary tick marks — everything `<figure>` needs to draw it.
 *
 * `byMonth` must be newest-first (as `groupByMonth` returns it); the series
 * this produces reads oldest-to-newest, left to right.
 */
export function buildCurve(byMonth: { key: string; items: unknown[] }[]): Curve {
  const counts = new Map(byMonth.map((group) => [group.key, group.items.length]));
  const oldestKey = byMonth[byMonth.length - 1]?.key;
  const newestKey = byMonth[0]?.key;
  const series =
    oldestKey && newestKey
      ? monthsBetween(oldestKey, newestKey).map((key) => ({ key, count: counts.get(key) ?? 0 }))
      : [];
  const peak = Math.max(1, ...series.map((s) => s.count));

  // A zero month draws nothing. The 0.5 floor exists so a one-story month
  // stays visible against a busy peak; applying it to zero would render
  // "none" as "a little", which is the misreading the zero-filling above is
  // here to prevent.
  const barHeight = (count: number) => (count === 0 ? 0 : Math.max(0.5, (count / peak) * SPARK_H));
  const barW = series.length > 0 ? Math.max(1, SPARK_W / series.length - BAR_GAP) : 0;

  // Positioned as a percentage rather than drawn in the SVG because that SVG
  // is `preserveAspectRatio="none"` — it stretches to whatever width it is
  // given, so any text inside it stretches with it. HTML underneath stays
  // the size it says it is. A mark in the last eighth of the width gets
  // right-anchored by the caller instead, so a series that happens to start
  // a new year in its final months prints inside the panel rather than off it.
  const yearMarks = series
    .map((point, index) => ({ index, year: point.key.slice(0, 4) }))
    .filter((mark, i, all) => i === 0 || mark.year !== all[i - 1].year)
    .map((mark) => ({ ...mark, pct: (mark.index / series.length) * 100 }));

  return { series, peak, sparkW: SPARK_W, sparkH: SPARK_H, barGap: BAR_GAP, barW, barHeight, yearMarks };
}

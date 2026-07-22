// src/lib/ingestMisuseReports.ts
//
// Persists the misuse-report RSS feed into D1 so history survives past
// whatever window Google's feed currently exposes. Called from the
// scheduled() handler in src/worker.ts, and reuses fetchMisuseReports
// (src/lib/misuseReports.ts) as-is for the actual fetch/filter/geocode work
// — this module only adds the "figure out how far back to look, then write
// rows" part.

import { fetchMisuseReports, fetchMisuseReportsSince } from "~/lib/misuseReports";

// Flock Safety was founded in 2017 — a from-empty run queries all the way
// back to then (the widest possible backfill Google's feed could ever
// cover for this topic) rather than the previous 365-day cap, so the
// initial seed is as thorough as a single query can be. Once the table has
// rows, later runs only need to cover the gap since the last run — 2 days
// comfortably overlaps a 6h cron cadence without re-scanning all of history
// every time.
const FLOCK_FOUNDING_DATE = "2017-01-01";
const ROLLING_WINDOW_DAYS = 2;

function toIsoDate(rfc822: string): string {
  const parsed = new Date(rfc822);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

export async function ingestMisuseReports(
  db: D1Database,
): Promise<{ fetched: number; inserted: number; errorMessage: string | null }> {
  const countRow = await db.prepare("SELECT COUNT(*) as count FROM misuse_reports").first<{ count: number }>();
  const isFirstRun = !countRow || countRow.count === 0;

  const { newsItems, errorMessage } = isFirstRun
    ? await fetchMisuseReportsSince(FLOCK_FOUNDING_DATE)
    : await fetchMisuseReports(ROLLING_WINDOW_DAYS);
  if (errorMessage || newsItems.length === 0) {
    return { fetched: 0, inserted: 0, errorMessage };
  }

  const insertStmt = db.prepare(
    `INSERT OR IGNORE INTO misuse_reports (url, title, source, published_at, city, state, lat, lon, department)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const batch = newsItems.map((item) =>
    insertStmt.bind(
      item.url,
      item.title,
      item.source,
      toIsoDate(item.published),
      item.location?.city ?? null,
      item.location?.state ?? null,
      item.location?.lat ?? null,
      item.location?.lon ?? null,
      item.location?.department ?? null,
    ),
  );

  const results = await db.batch(batch);
  const inserted = results.reduce((sum, r) => sum + (r.meta?.changes ?? 0), 0);

  return { fetched: newsItems.length, inserted, errorMessage: null };
}

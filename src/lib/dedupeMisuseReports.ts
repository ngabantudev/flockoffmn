// src/lib/dedupeMisuseReports.ts
//
// Groups articles from different outlets covering the same real-world
// incident into one cluster, so src/pages/api/misuse-reports.ts can surface
// a single canonical dot per incident instead of one per article. Called
// from src/lib/ingestMisuseReports.ts after each ingestion batch — no
// separate Cron Trigger needed, since this always compares a new row
// against the *entire* table (not just the current batch), so duplicates
// arriving in a different 6h run still get caught against what's already
// stored.
//
// A row's cluster_id is self-referencing: cluster_id = id means canonical
// (the row the map/API show); cluster_id pointing at a different id means
// "duplicate of that row." New inserts leave cluster_id NULL until this
// runs, so "needs clustering" is just `WHERE cluster_id IS NULL`.

interface UnclusteredRow {
  id: number;
  title: string;
  city: string | null;
  state: string | null;
  published_at: string;
}

interface ClusterCandidateRow {
  id: number;
  title: string;
  published_at: string;
  cluster_id: number;
}

const MATCH_WINDOW_DAYS = 14;
const TITLE_SIMILARITY_THRESHOLD = 0.4;
const WINDOW_MS = MATCH_WINDOW_DAYS * 24 * 60 * 60 * 1000;

const STOPWORDS = new Set([
  "a", "an", "the", "of", "in", "on", "for", "to", "and", "or", "is", "was",
  "are", "were", "with", "at", "by", "from", "as", "after", "over", "into",
  "about", "its", "it", "this", "that", "says", "say", "said", "new",
]);

// Light stemming so tense/plural differences between outlets ("misused" vs
// "misusing", "cameras" vs "camera") don't count as different tokens —
// without this, genuinely-the-same-story headlines from different outlets
// often score just under the similarity threshold on wording alone.
function stem(word: string): string {
  if (word.length > 6 && word.endsWith("ing")) return word.slice(0, -3);
  if (word.length > 5 && word.endsWith("ed")) return word.slice(0, -2);
  if (word.length > 4 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function titleTokens(title: string): Set<string> {
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .map(stem);
  return new Set(words);
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export async function clusterNewReports(db: D1Database): Promise<{ clustered: number }> {
  const { results: unclustered } = await db
    .prepare(
      `SELECT id, title, city, state, published_at FROM misuse_reports
       WHERE cluster_id IS NULL ORDER BY published_at ASC`,
    )
    .all<UnclusteredRow>();

  if (unclustered.length === 0) return { clustered: 0 };

  const updates: { sql: string; params: unknown[] }[] = [];
  // Rows processed earlier in *this same run* haven't been written to the DB
  // yet (the batch commits once, at the end) — so two duplicates ingested in
  // the same cron cycle need this in-memory pool to find each other, on top
  // of whatever's already persisted from earlier runs.
  const processedThisRun: (UnclusteredRow & { clusterId: number })[] = [];

  for (const row of unclustered) {
    if (!row.city || !row.state) {
      // No confident location to match against — safer to leave it as its
      // own singleton than risk merging unrelated incidents.
      updates.push({ sql: `UPDATE misuse_reports SET cluster_id = ? WHERE id = ?`, params: [row.id, row.id] });
      processedThisRun.push({ ...row, clusterId: row.id });
      continue;
    }

    const rowTime = new Date(row.published_at).getTime();
    const rowTokens = titleTokens(row.title);

    const { results: dbCandidates } = await db
      .prepare(
        `SELECT id, title, published_at, cluster_id FROM misuse_reports
         WHERE cluster_id IS NOT NULL AND id != ?
           AND city = ? COLLATE NOCASE AND state = ? COLLATE NOCASE
           AND published_at >= ? AND published_at <= ?`,
      )
      .bind(
        row.id,
        row.city,
        row.state,
        new Date(rowTime - WINDOW_MS).toISOString(),
        new Date(rowTime + WINDOW_MS).toISOString(),
      )
      .all<ClusterCandidateRow>();

    const memCandidates: ClusterCandidateRow[] = processedThisRun
      .filter(
        (p) =>
          p.id !== row.id &&
          p.city?.toLowerCase() === row.city!.toLowerCase() &&
          p.state?.toLowerCase() === row.state!.toLowerCase() &&
          Math.abs(new Date(p.published_at).getTime() - rowTime) <= WINDOW_MS,
      )
      .map((p) => ({ id: p.id, title: p.title, published_at: p.published_at, cluster_id: p.clusterId }));

    const candidates = [...dbCandidates, ...memCandidates];

    // Earliest published_at seen so far for each candidate cluster — used
    // below to decide whether this row should become the new canonical.
    const earliestByCluster = new Map<number, string>();
    for (const c of candidates) {
      const current = earliestByCluster.get(c.cluster_id);
      if (!current || c.published_at < current) earliestByCluster.set(c.cluster_id, c.published_at);
    }

    let bestMatch: ClusterCandidateRow | null = null;
    let bestScore = 0;
    for (const candidate of candidates) {
      const score = jaccardSimilarity(rowTokens, titleTokens(candidate.title));
      if (score > bestScore) {
        bestScore = score;
        bestMatch = candidate;
      }
    }

    if (bestMatch && bestScore >= TITLE_SIMILARITY_THRESHOLD) {
      const clusterId = bestMatch.cluster_id;
      const clusterEarliest = earliestByCluster.get(clusterId) ?? bestMatch.published_at;

      if (row.published_at < clusterEarliest) {
        // This row turns out to be earlier than everything else in the
        // cluster — re-point the whole cluster at it so "canonical =
        // earliest" stays true.
        updates.push({ sql: `UPDATE misuse_reports SET cluster_id = ? WHERE cluster_id = ?`, params: [row.id, clusterId] });
        updates.push({ sql: `UPDATE misuse_reports SET cluster_id = ? WHERE id = ?`, params: [row.id, row.id] });
        for (const p of processedThisRun) if (p.clusterId === clusterId) p.clusterId = row.id;
        processedThisRun.push({ ...row, clusterId: row.id });
      } else {
        updates.push({ sql: `UPDATE misuse_reports SET cluster_id = ? WHERE id = ?`, params: [clusterId, row.id] });
        processedThisRun.push({ ...row, clusterId });
      }
    } else {
      updates.push({ sql: `UPDATE misuse_reports SET cluster_id = ? WHERE id = ?`, params: [row.id, row.id] });
      processedThisRun.push({ ...row, clusterId: row.id });
    }
  }

  await db.batch(updates.map((u) => db.prepare(u.sql).bind(...u.params)));

  return { clustered: unclustered.length };
}

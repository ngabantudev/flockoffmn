import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Build-time access to the news archive written by `scripts/ingest/mn/news.mjs`.
 *
 * It lives here rather than in `src/layers/` because it is not a layer. §3
 * makes journalism a Tier 4 source — lead lists only, never the sole basis of a
 * published feature — so this feed gets no registry entry, no legend row, no
 * pin, and no filter; giving it one would put press coverage on the same
 * footing as a signed contract, which is the exact conflation §0.2 and §1c
 * exist to prevent.
 *
 * That distinction used to be a paragraph at the top of a file sitting in
 * `src/layers/` anyway. It is a directory now: membership of `src/layers/`
 * answers "is this a registry layer?" on its own, so §2's two-file invariant
 * stays checkable by listing that directory rather than by reading every
 * header comment in it.
 *
 * Read at build time and baked into the page, which is what keeps §4 true: no
 * reader's browser ever contacts Google. See the ingest script's own header for
 * why that matters more here than it did in the project this was ported from.
 */

const PUBLIC_DIR = path.resolve(process.cwd(), 'public');
const NEWS_PATH = 'data/news.json';

/**
 * The topics the UI can label, in the order newsFilter classifies them.
 *
 * Deliberately hand-written rather than derived from newsFilter's TOPIC_IDS.
 * Deriving it was tried and is worse than it looks: TOPIC_IDS comes from a
 * `.mjs` module — the ingest runs it under plain Node, so it cannot be
 * TypeScript and cannot say `as const` — which means it infers as `string[]`
 * and `(typeof TOPIC_IDS)[number]` collapses to `string`. That silently
 * widened this union until `Record<NewsTopic, string>` accepted anything,
 * removing the compile-time check on TOPIC_LABELS that already existed.
 * Verified by adding an unlabelled topic: `npm run check` stayed at 0 errors.
 *
 * So the list is stated twice, and `assertKnownTopics` below is what keeps the
 * two honest, at build time, out loud.
 */
export type NewsTopic =
  | 'alpr'
  | 'surveillance'
  | 'immigration-enforcement'
  | 'detention'
  | 'other';

const KNOWN_TOPICS: readonly NewsTopic[] = [
  'alpr',
  'surveillance',
  'immigration-enforcement',
  'detention',
  'other',
];

/**
 * Warn at build time about a topic this UI cannot label.
 *
 * Warn, not throw. §0.8 assumes no maintainer: the news cron opens a PR on its
 * own, and a build that refuses a story carrying an unrecognised topic would
 * stop the site updating at all rather than render one chip in English. The
 * browser renderer degrades to the raw id, which is ugly and visible — which is
 * the point — while this line puts the same fact in the build log where the
 * person who added the topic will see it.
 */
function assertKnownTopics(topics: Iterable<string>): void {
  const unknown = [...new Set(topics)].filter((t) => !KNOWN_TOPICS.includes(t as NewsTopic));
  if (unknown.length === 0) return;
  console.warn(
    `[news] ${unknown.length} topic(s) with no label or translation: ${unknown.join(', ')}. ` +
      `Add them to NewsTopic and TOPIC_LABELS in src/lib/news.ts and NewsFeed.astro, ` +
      `and to newsTopic* in src/i18n/{en,es}.ts. Rendering the raw id meanwhile.`,
  );
}

export interface NewsItem {
  title: string;
  url: string;
  /** ISO 8601. */
  published: string;
  source: string;
  topic: NewsTopic;
  /** Always 4. Stamped per item so a copy of this record carries its tier. */
  tier: 4;
}

export interface NewsArchive {
  metadata: {
    title: string;
    tier: 4;
    confidence: string;
    sourceName: string;
    sourceUrl: string;
    license: string;
    windowDays: number;
    retentionDays: number;
    queriesRun: number;
    queriesFailed: number;
    addedThisRun: number;
    addedBeforeDuplicateCollapse: number;
    screened: {
      /** Per-rule counts from the §1b person screen, and nothing else. */
      person: Record<string, number>;
      /**
       * Items already in the archive that a newer §1b rule caught on the most
       * recent run. Keyed by rule name, empty when nothing was retro-removed.
       */
      personRemovedFromArchive: Record<string, number>;
      /** Tag pages and stream spam. Not people — kept out of `person` so the
       *  published "dropped because they were about people" figure is true. */
      nonArticle: number;
      offTopic: number;
      outOfState: number;
    };
    truncated: boolean;
    lastUpdated: string;
  };
  coverage: string[];
  knownGaps: string[];
  topicCounts: Partial<Record<NewsTopic, number>>;
  items: NewsItem[];
}

let cache: NewsArchive | null | undefined;

/**
 * Returns null when the ingest has never been run, which is a legitimate state
 * on a fresh clone. Callers render an explanatory empty state rather than
 * failing the build — the same contract `loadLayer` offers for a missing layer.
 */
export async function loadNews(): Promise<NewsArchive | null> {
  if (cache !== undefined) return cache;
  try {
    const raw = await readFile(path.join(PUBLIC_DIR, NEWS_PATH), 'utf8');
    cache = JSON.parse(raw) as NewsArchive;
  } catch {
    cache = null;
  }
  // Outside the try, and defensive about `items`: inside it, a file that parsed
  // but carried no `items` array threw here, was swallowed as a read failure,
  // and the whole archive was reported as "the ingest has never been run".
  // Cached, so this runs once per build rather than once per page.
  if (cache) assertKnownTopics((cache.items ?? []).map((i) => i.topic));
  return cache;
}

/**
 * Group the archive by calendar month, newest first.
 *
 * Months rather than a flat list because the archive is cumulative and grows
 * without bound within its retention window — §0.5's point is that the shape
 * over time is the story, and an undifferentiated scroll of 700 headlines hides
 * exactly that. The month heading is also the cheapest possible time axis.
 */
export function groupByMonth(items: NewsItem[]): { key: string; items: NewsItem[] }[] {
  const groups = new Map<string, NewsItem[]>();
  for (const item of items) {
    const key = item.published.slice(0, 7); // YYYY-MM
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }
  return [...groups.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, groupItems]) => ({ key, items: groupItems }));
}

/**
 * Total person-level items screened out, for the coverage note.
 *
 * §1b permits aggregate counts and forbids enumeration, so this is the only
 * form in which the screen's work can be shown at all. It is worth showing:
 * "we dropped 31 stories about individuals" is a statement about the project's
 * own discipline that a reader cannot otherwise verify.
 */
export function screenedTotal(archive: NewsArchive): number {
  return Object.values(archive.metadata.screened.person).reduce((a, b) => a + b, 0);
}

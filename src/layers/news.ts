import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Build-time access to the news archive written by `scripts/ingest/mn/news.mjs`.
 *
 * Separate from `./data.ts` on purpose. That module reads map layers out of the
 * registry, and this feed is deliberately not one: §3 makes journalism a Tier 4
 * source — lead lists only, never the sole basis of a published feature — so it
 * gets no registry entry, no legend row, no pin, and no filter. Giving it one
 * would put press coverage on the same footing as a signed contract, which is
 * the exact conflation §0.2 and §1c exist to prevent.
 *
 * Read at build time and baked into the page, which is what keeps §4 true: no
 * reader's browser ever contacts Google. See the ingest script's own header for
 * why that matters more here than it did in the project this was ported from.
 */

const PUBLIC_DIR = path.resolve(process.cwd(), 'public');
const NEWS_PATH = 'data/news.json';

export type NewsTopic =
  | 'alpr'
  | 'surveillance'
  | 'immigration-enforcement'
  | 'detention'
  | 'other';

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
      person: Record<string, number>;
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

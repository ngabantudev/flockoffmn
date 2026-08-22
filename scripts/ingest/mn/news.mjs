#!/usr/bin/env node
/**
 * Minnesota surveillance and enforcement coverage, from Google News RSS.
 *
 * Ported from ngabantudev/mndatacenter, and deliberately not a copy. That
 * project is Astro SSR on a Cloudflare Worker with a KV cache, and it fetches
 * headlines per request. Three things make that architecture wrong here:
 *
 *   1. THIS SITE HAS NO BACKEND. `astro.config.mjs` is `output: 'static'` and
 *      `wrangler.jsonc` is a Pages project with no `main` entrypoint, on
 *      purpose — see that file's own comment. There is nowhere for a live
 *      fetch to run.
 *
 *   2. A CLIENT-SIDE FETCH WOULD LEAK READERS TO GOOGLE. With no backend to
 *      proxy through, "live" on a static site means the reader's own browser
 *      requesting news.google.com — which hands Google the IP address of
 *      everyone who opens a page about ICE facilities and ALPR contracts.
 *      §0.7 assumes some visitors have reason to fear being logged, and §4
 *      forbids third-party assets outright. This is the whole reason the feed
 *      is baked at build time rather than fetched at read time.
 *
 *   3. GOOGLE REFUSES CLOUDFLARE EGRESS ANYWAY. mndatacenter measured it —
 *      same URL, same headers, same minute: residential 200, GitHub Actions
 *      runner 200, Cloudflare Worker 503 — and built a KV mirror written by CI
 *      to route around it. Fetching from CI is the part worth keeping. The KV
 *      mirror is the part that becomes unnecessary once the output is a static
 *      file the build already reads.
 *
 * So this is an ordinary ingest script, and the scheduled workflow that runs it
 * opens a pull request like every other layer does. The refresh interval lives
 * in `.github/workflows/refresh-news.yml`.
 *
 * THE ARCHIVE IS APPEND-ONLY, which is the other departure and the one §0.5
 * asks for. Each run fetches a 30-day window and merges it into whatever is
 * already committed, so history accumulates in git rather than being refetched.
 * That is why there is no year-long window and no date segmenting here:
 * mndatacenter needs those because its KV mirror holds only what the last fetch
 * returned, and a file under version control does not.
 *
 * §1b: every item passes `screenForPeople` before it is written. Rejects are
 * counted by rule and the counts are published; the rejected headline itself is
 * never written to disk, because `public/data/` is committed to a public
 * repository and a commit is forever.
 *
 * §3: this is a Tier 4 source — journalism, lead lists only, never the sole
 * basis of a published feature. Nothing here is a map layer and nothing here
 * belongs in `src/layers/registry.ts`. Every item is stamped `tier: 4` and the
 * page that renders it says so in plain language.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  PUBLIC_DATA,
  log,
  fetchWithRetry,
  decodeXml,
  writeReference,
} from '../lib/util.mjs';
import {
  TOPIC_QUERIES,
  GEOGRAPHY_QUERIES,
  buildHaystack,
  hasSubject,
  hasMinnesota,
  isNonArticle,
  screenForPeople,
  classifyTopic,
  collapseDuplicates,
  byPublishedDesc,
  PERSON_RULE_NAMES,
} from '../../../src/lib/newsFilter.mjs';

const SCOPE = 'news';
const OUT = 'news.json';

/**
 * How far back each run asks.
 *
 * Thirty days rather than the year mndatacenter fetches, because the archive
 * below is cumulative: a daily run only has to cover the gap since the last
 * one, and thirty days is a month of slack for a workflow that skipped. It also
 * keeps the whole run inside Google's documented `when:Nd` form, which avoids
 * the `after:/before:` date segmenting — and therefore avoids multiplying four
 * topics by two geographies by four segments into 32 requests from one runner
 * IP, which is the traffic shape that gets an IP blocked.
 */
const WINDOW_DAYS = 30;

/**
 * How long an item stays in the published archive.
 *
 * Two years. The file is committed, so nothing is destroyed by aging out of it
 * — the history stays in git — but an unbounded JSON file served to every
 * visitor is a §0.7 problem on an old phone long before it is a storage one.
 */
const RETENTION_DAYS = 730;

/** Timeout for a single upstream attempt. `fetchWithRetry` applies it per try. */
const QUERY_TIMEOUT_MS = 15_000;

/**
 * Pause between upstream requests.
 *
 * Sequential with a gap, not `Promise.all`. Eight parallel requests to Google
 * from one runner IP is the shape that gets refused, and §2's good-citizen rule
 * asks for politeness towards a source we neither pay for nor have permission
 * to hammer. Eight requests spaced a second apart costs eight seconds.
 */
const REQUEST_GAP_MS = 1_200;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Google News RSS caps a response at ~100 items whatever is asked — measured by
 * mndatacenter across several query shapes. A search returning exactly this
 * many has almost certainly been cut off rather than exhausted, which is a fact
 * about coverage the reader is entitled to (§3).
 */
const GOOGLE_RESULT_CEILING = 100;

/** Pull one field out of an <item> block. */
function field(itemXml, re) {
  const m = itemXml.match(re);
  return m ? decodeXml(m[1]) : '';
}

/**
 * Fetch and parse one query. Returns null when the request failed — distinct
 * from an empty array, which means Google answered and matched nothing.
 */
async function fetchQuery(query) {
  const url =
    `https://news.google.com/rss/search?q=${encodeURIComponent(query)}` +
    `&hl=en-US&gl=US&ceid=US:en`;

  let xml;
  try {
    // fetchWithRetry sends this project's own User-Agent (see lib/util.mjs).
    // mndatacenter sends a spoofed Chrome string; §2 forbids that here, and it
    // measured the UA as making no difference to whether Google answers anyway
    // — only the source IP does.
    const res = await fetchWithRetry(url, { retries: 1, timeoutMs: QUERY_TIMEOUT_MS });
    xml = await res.text();
  } catch (err) {
    log(SCOPE, `query failed: ${err.message}`);
    return null;
  }

  const blocks = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
  const items = blocks.map((block) => {
    const source = field(block, /<source[^>]*>([\s\S]*?)<\/source>/) || 'Unknown outlet';
    let title = field(block, /<title>([\s\S]*?)<\/title>/) || '';
    // Google appends " - Outlet" to every headline.
    if (source && title.includes(` - ${source}`)) title = title.split(` - ${source}`)[0];

    return {
      title,
      url: field(block, /<link>([\s\S]*?)<\/link>/),
      published: field(block, /<pubDate>([\s\S]*?)<\/pubDate>/),
      source,
      description: field(block, /<description>([\s\S]*?)<\/description>/),
    };
  });

  return { items, truncated: blocks.length >= GOOGLE_RESULT_CEILING };
}

/** Load the committed archive, or an empty one on first run. */
async function loadArchive() {
  try {
    const raw = await readFile(path.join(PUBLIC_DATA, OUT), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

async function main() {
  const queries = TOPIC_QUERIES.flatMap((topic) =>
    GEOGRAPHY_QUERIES.map((geo) => `${topic} ${geo} when:${WINDOW_DAYS}d`),
  );

  const fetched = [];
  let failures = 0;
  let truncated = false;

  for (const query of queries) {
    const result = await fetchQuery(query);
    if (!result) {
      failures += 1;
    } else {
      fetched.push(...result.items);
      truncated = truncated || result.truncated;
    }
    await sleep(REQUEST_GAP_MS);
  }

  // Every query failing means Google is refusing this runner. Keeping the
  // existing archive and failing loudly is right; overwriting it with an
  // outage's emptiness is not.
  if (failures === queries.length) {
    throw new Error(`all ${queries.length} queries failed — Google is refusing this runner`);
  }

  // Person-rule counts only. Non-articles are counted separately: they are tag
  // pages and stream spam, not stories about people, and folding them in here
  // made the published "dropped because they were about individual people"
  // figure report 30 on a run where the person screen fired 12 times.
  const rejected = Object.fromEntries(PERSON_RULE_NAMES.map((r) => [r, 0]));
  let droppedNonArticle = 0;
  let droppedOffTopic = 0;
  let droppedOutOfState = 0;

  const accepted = [];
  for (const item of fetched) {
    if (!item.url || !item.title) continue;

    const haystack = buildHaystack(item.title, item.description);

    if (isNonArticle(item.title)) {
      droppedNonArticle += 1;
      continue;
    }
    if (!hasSubject(haystack)) {
      droppedOffTopic += 1;
      continue;
    }
    if (!hasMinnesota(haystack, item.source)) {
      droppedOutOfState += 1;
      continue;
    }

    // §1b. Nothing below this line may retain the item's text if it fails.
    const screen = screenForPeople(haystack);
    if (!screen.ok) {
      rejected[screen.rule] += 1;
      continue;
    }

    const published = new Date(item.published);
    accepted.push({
      title: item.title,
      url: item.url,
      published: Number.isFinite(published.getTime())
        ? published.toISOString()
        : new Date().toISOString(),
      source: item.source,
      topic: classifyTopic(haystack),
      // §3. Stamped per item rather than only on the file, so an item that is
      // ever copied out of here carries its own tier with it.
      tier: 4,
    });
  }

  // Merge into the committed archive. Identity is the article URL, which Google
  // keeps stable per item; the existing entry wins so a story's first-seen
  // classification does not churn the diff on every run.
  const archive = await loadArchive();
  const byUrl = new Map(archive.map((i) => [i.url, i]));
  const knownUrls = new Set(byUrl.keys());
  let added = 0;
  for (const item of accepted) {
    if (byUrl.has(item.url)) continue;
    byUrl.set(item.url, item);
    added += 1;
  }

  const cutoff = Date.now() - RETENTION_DAYS * 86_400_000;
  const merged = collapseDuplicates(
    [...byUrl.values()]
      .filter((i) => new Date(i.published).getTime() >= cutoff)
      .sort(byPublishedDesc),
  );

  // Reported after the collapse, not before. Counting accepted-and-unseen items
  // said "+94 new" on a run that grew the archive by 74, because the duplicate
  // collapse runs afterwards and removes wire-copy repeats of the same story.
  //
  // Counted as "URLs in the published file that were not in the archive we
  // read", not as `merged.length - archive.length`: that difference is net
  // growth, and it silently reports 0 on any run where as many items aged past
  // RETENTION_DAYS as were added. The number a reviewer needs is how many new
  // headlines this run is asking them to look at.
  const addedNet = merged.filter((i) => !knownUrls.has(i.url)).length;

  const perTopic = {};
  for (const item of merged) perTopic[item.topic] = (perTopic[item.topic] ?? 0) + 1;

  await writeReference(OUT, {
    metadata: {
      title: 'Minnesota surveillance and enforcement coverage',
      // §3 source tiering, stated in the file rather than only in the UI, so a
      // downstream reuse of this JSON cannot lose it.
      tier: 4,
      confidence: 'reported',
      sourceName: 'Google News RSS',
      sourceUrl: 'https://news.google.com/rss',
      license:
        'Headlines, outlet names and links only. No article text is copied, mirrored or stored. Each link resolves to the publisher, who holds the copyright.',
      windowDays: WINDOW_DAYS,
      retentionDays: RETENTION_DAYS,
      queriesRun: queries.length,
      queriesFailed: failures,
      addedThisRun: addedNet,
      addedBeforeDuplicateCollapse: added,
      // §3 coverage honesty, and §1b aggregates-only. These are counts of
      // things NOT published. The headlines behind them are never written.
      screened: {
        person: rejected,
        nonArticle: droppedNonArticle,
        offTopic: droppedOffTopic,
        outOfState: droppedOutOfState,
      },
      truncated,
    },
    coverage: [
      'This is press coverage, not a record of what happened. A contract signed with no reporter in the room does not appear here.',
      'Google News decides what its index returns and caps each search at about 100 results, so a busy month is a sample rather than a complete list.',
      'Stories about individual people are removed before anything is saved — including stories about arrests, court cases, and named officers. Only coverage of the systems themselves is kept.',
      'Coverage skews toward outlets Google indexes well. Small-market radio and weekly papers are under-represented relative to how much of this reporting they actually do.',
    ],
    knownGaps: [
      failures > 0
        ? `${failures} of ${queries.length} searches failed on the most recent run; that stretch of coverage may be thin.`
        : null,
      truncated
        ? 'At least one search returned Google\'s maximum result count, so the most recent window is a sample of the period rather than a record of it.'
        : null,
      // Measured on 2026-08-22 rather than assumed, because the obvious fix —
      // adding the outlet names to MINNESOTA_SOURCE_TERMS — does nothing.
      // Querying Google News for each by name returned no items filed under
      // that outlet as a source: Hmong Times, Hmong Today, La Prensa de
      // Minnesota, Vida y Sabor and Latino Communications Network are not in
      // its source index, so there is nothing for a term to match. Minnesota
      // Spokesman-Recorder and The Circle News did file under their own names
      // and have been added. This is a limit of the upstream, not of the
      // filter, and it is the kind of gap §3 says to publish rather than paper
      // over.
      'Hmong-language and Spanish-language Minnesota outlets are not indexed as sources by Google News, so this feed structurally cannot see their reporting — the communities carrying most of this enforcement are covered here only when an English-language outlet also files the story. Adding those outlets to the source list would not fix it; the upstream has no items to return.',
    ].filter(Boolean),
    topicCounts: perTopic,
    items: merged,
  });

  const personTotal = Object.values(rejected).reduce((a, b) => a + b, 0);
  log(SCOPE, `${merged.length} items in archive (+${addedNet} new this run, ${added} before duplicate collapse)`);
  log(
    SCOPE,
    `screened out: ${personTotal} person-level, ${droppedNonArticle} non-article, ` +
      `${droppedOffTopic} off-topic, ${droppedOutOfState} out-of-state`,
  );
  if (failures > 0) log(SCOPE, `${failures} of ${queries.length} searches failed`);
}

await main();

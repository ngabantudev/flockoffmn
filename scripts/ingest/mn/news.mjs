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
  classifyTopic,
  collapseDuplicates,
  byPublishedDesc,
} from '../../../src/lib/newsFilter.mjs';
import { screenForPeople, PERSON_RULE_NAMES } from '../../../src/lib/personScreen.mjs';

/**
 * Agency names that establish Minnesota, from the BCA's own § 13.824 filings.
 *
 * Read here rather than inside newsFilter.mjs so that module stays
 * dependency-free and browser-importable. Lower-cased once, because the
 * haystack the filter matches against is lower-cased.
 *
 * Optional on purpose: on a fresh clone this reference may not have been built
 * yet, and a missing agency list should cost recall, not fail the run.
 */
async function loadAgencyTerms() {
  try {
    const raw = await readFile(
      path.join(PUBLIC_DATA, 'reference/bca-alpr-agencies.json'),
      'utf8',
    );
    const parsed = JSON.parse(raw);
    return (parsed.agencies ?? [])
      .map((a) => (typeof a === 'string' ? a : a?.name))
      .filter(Boolean)
      .map((n) => n.toLowerCase());
  } catch {
    log(SCOPE, 'bca-alpr-agencies.json not readable — agency names will not count as a Minnesota signal');
    return [];
  }
}

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

/**
 * Load the committed archive, or an empty one on first run.
 *
 * A missing file and an unreadable one are the same to the merge below — both
 * yield an empty archive — but they are not the same event, and collapsing them
 * hid the dangerous one. A corrupt news.json silently restarts the archive from
 * a single 30-day window, discarding however many months of history had
 * accumulated, and the run reports a cheerful "+75 new this run" while doing it.
 * The pull request would show the deletion, but only to someone reading a diff
 * of several hundred lines of JSON for a subtraction.
 *
 * Absent is normal and silent. Present-but-unparseable is loud, and the caller
 * turns it into a knownGaps entry so it survives into the published file rather
 * than living only in a CI log nobody opens.
 */
async function loadArchive() {
  let raw;
  try {
    raw = await readFile(path.join(PUBLIC_DATA, OUT), 'utf8');
  } catch {
    return { items: [], corrupt: false };
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.items)) throw new Error('no items array');
    return { items: parsed.items, corrupt: false };
  } catch (err) {
    log(SCOPE, `WARNING: public/data/${OUT} exists but could not be read (${err.message}).`);
    log(SCOPE, 'The archive is being rebuilt from this run alone — previous history will be dropped.');
    log(SCOPE, 'Restore it from git rather than merging that deletion.');
    return { items: [], corrupt: true };
  }
}

async function main() {
  const agencyTerms = await loadAgencyTerms();

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
  // Keyed by the name they are published under, so adding a relevance filter is
  // one line here and one increment below rather than four edits that can drift
  // apart (declaration, increment, metadata literal, log line).
  const dropped = { nonArticle: 0, offTopic: 0, outOfState: 0 };

  const accepted = [];
  for (const item of fetched) {
    if (!item.url || !item.title) continue;

    const haystack = buildHaystack(item.title, item.description);

    if (isNonArticle(item.title)) {
      dropped.nonArticle += 1;
      continue;
    }
    if (!hasSubject(haystack)) {
      dropped.offTopic += 1;
      continue;
    }
    if (!hasMinnesota(haystack, item.source, agencyTerms)) {
      dropped.outOfState += 1;
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
  const { items: archive, corrupt: archiveCorrupt } = await loadArchive();
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
  /*
   * §1b is re-checked over the WHOLE archive, not just this run's arrivals.
   *
   * The screen used to run only over `accepted`, which made it a property of
   * how an item arrived rather than of what the published file contains. That
   * is the wrong invariant: the merge below makes the existing entry win, so
   * anything the rules missed on the day it landed stayed permanently, and
   * strengthening PERSON_RULES had no retroactive effect at all. The rules have
   * now been strengthened twice after measurement caught leaks — both times,
   * only future runs benefited.
   *
   * Re-screening here means the rule reads "nothing in public/data/news.json
   * matches a §1b pattern", which is what §1b actually asks for, and it means a
   * tightened pattern cleans up its own history on the next run instead of
   * waiting for a human to remember. §0.10 says the floor must not depend on
   * whoever is at the keyboard; this is what stops it depending on that.
   *
   * The archive keeps no description — only the headline — so this pass sees
   * less text than the intake screen did. It is a backstop for rules added
   * later, not a replacement for screening at intake.
   */
  /*
   * Re-classify anything still sitting in `other`, for the same reason the §1b
   * screen re-runs below: the merge makes the existing entry win, so a widened
   * TOPIC_RULES never reaches history. Measured — adding the Flock phrasings
   * recovered 34 stories and every one of them stayed labelled `other` on the
   * next run, because they were already in the archive.
   *
   * Only `other` is revisited, and only ever upgraded. An item classified from
   * its description on the day it arrived keeps that label: the archive stores
   * no description, so re-deriving from the title alone could only ever be a
   * worse answer than the one already recorded.
   */
  let reclassified = 0;
  for (const item of merged) {
    if (item.topic !== 'other') continue;
    const topic = classifyTopic(buildHaystack(item.title, ''));
    if (topic !== 'other') {
      item.topic = topic;
      reclassified += 1;
    }
  }
  if (reclassified > 0) {
    log(SCOPE, `re-classified ${reclassified} archived item(s) a widened topic rule now recognises`);
  }

  const retroRemoved = {};
  const screened = merged.filter((item) => {
    const verdict = screenForPeople(buildHaystack(item.title, ''));
    if (verdict.ok) return true;
    retroRemoved[verdict.rule] = (retroRemoved[verdict.rule] ?? 0) + 1;
    return false;
  });
  const retroTotal = Object.values(retroRemoved).reduce((a, b) => a + b, 0);
  if (retroTotal > 0) {
    log(SCOPE, `removed ${retroTotal} archived item(s) that a newer §1b rule now catches`);
  }

  const addedNet = screened.filter((i) => !knownUrls.has(i.url)).length;

  const perTopic = {};
  for (const item of screened) perTopic[item.topic] = (perTopic[item.topic] ?? 0) + 1;

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
        // Items already in the archive that a newer §1b rule now catches. A
        // non-zero value here is the rules improving retroactively, which is
        // the whole point of re-screening the merged file.
        personRemovedFromArchive: retroRemoved,
        ...dropped,
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
      archiveCorrupt
        ? 'The previous archive file could not be read on the most recent run, so this file was rebuilt from that run alone and earlier history is missing. Restore it from version control rather than accepting this as the record.'
        : null,
      'One filed agency — the Wyoming, Minnesota police department — is not recognised by name, because Wyoming is also a state and the guard that keeps other states out cannot tell the two apart from a headline. Stories about it are still found when they carry another Minnesota signal, such as the county or the outlet.',
      'Hmong-language and Spanish-language Minnesota outlets are not indexed as sources by Google News, so this feed structurally cannot see their reporting — the communities carrying most of this enforcement are covered here only when an English-language outlet also files the story. Adding those outlets to the source list would not fix it; the upstream has no items to return.',
    ].filter(Boolean),
    topicCounts: perTopic,
    items: screened,
  });

  const personTotal = Object.values(rejected).reduce((a, b) => a + b, 0);
  log(SCOPE, `${screened.length} items in archive (+${addedNet} new this run, ${added} before duplicate collapse)`);
  log(
    SCOPE,
    `screened out: ${personTotal} person-level, ${dropped.nonArticle} non-article, ` +
      `${dropped.offTopic} off-topic, ${dropped.outOfState} out-of-state`,
  );
  if (failures > 0) log(SCOPE, `${failures} of ${queries.length} searches failed`);
}

await main();

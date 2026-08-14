#!/usr/bin/env node
/**
 * Reference — Minnesota BCA's published list of agencies reporting LPR use.
 *
 * Minn. Stat. § 13.824, subd. 8 requires every Minnesota law enforcement
 * agency that operates an automated licence plate reader to report that use
 * to the state, and requires the BCA to publish the list. This script reads
 * that publication.
 *
 * The page is a Next.js app, but every agency's name and self-reported device
 * locations are already present in the initial HTML response as the
 * server-rendered `__NEXT_DATA__` JSON payload — no client script has to run
 * to see them, so this is a plain fetch, not a scrape of a private or
 * internal API (spec §2's "good-citizen fetcher" rule).
 *
 * This is deliberately NOT a public map layer. A reported "yes" here is a
 * fact about a report an agency filed with the state, not a location and not
 * a device count — turning it into a pin would overstate what one line item
 * on a state list actually says. Instead this writes a small, dated
 * reference file that scripts/ingest/agency-jurisdictions.mjs joins by
 * agency name, so the fact ends up as a clearly cited attribute on the
 * jurisdiction record it belongs to, adjacent to a different Tier 1
 * document (MESB's own boundary), rather than a claim of its own.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fetchWithRetry, log, PUBLIC_DATA } from './lib/util.mjs';

const LANDING = 'https://dps.mn.gov/divisions/bca/data-and-reports/agencies-use-lprs-lpr';

/** Strip HTML tags and decode the handful of entities this page actually uses. */
function stripTags(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/​/g, '') // zero-width space the page's own CMS inserts mid-word
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Pull the "Location of fixed or stationary devices" list out of an agency's
 * rich-text body, if the agency reported any. Vehicle-mounted-only agencies
 * report "N/A" here, which is a real answer, not a missing one — callers get
 * an empty array either way and the boolean elsewhere says which happened.
 */
function deviceLocations(bodyHtml) {
  const section = /Location of[\s​]*fixed or stationary devices[^<]*<\/h2>\s*(<ul>[\s\S]*?<\/ul>|<p>[\s\S]*?<\/p>)/i.exec(
    bodyHtml,
  );
  if (!section) return [];
  return [...section[1].matchAll(/<li>([\s\S]*?)<\/li>/g)]
    .map((m) => stripTags(m[1]))
    .filter((s) => s && !/^n\/?a$/i.test(s));
}

async function main() {
  const res = await fetchWithRetry(LANDING, { timeoutMs: 45_000 });
  const html = await res.text();

  const match = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(
    html,
  );
  if (!match) throw new Error('BCA page did not contain the expected __NEXT_DATA__ payload');
  const data = JSON.parse(match[1]);

  // The agency accordion is one of the page's rich-text content blocks; find
  // it by shape (a list of {title, id, body}) rather than a fixed index, so a
  // future unrelated content edit above it on the page does not silently
  // start reading the wrong block.
  const content = data?.props?.pageProps?.nodeResource?.content;
  if (!Array.isArray(content)) throw new Error('unexpected page structure: no content array');
  const block = content.find(
    (c) => Array.isArray(c?.textItems) && c.textItems.length > 20 && c.textItems[0]?.title,
  );
  if (!block) throw new Error('could not find the agency list block on the BCA page');

  const agencies = block.textItems.map((item) => ({
    name: stripTags(item.title ?? ''),
    deviceLocations: deviceLocations(item.body?.processed ?? ''),
  }));
  if (!agencies.length) throw new Error('parsed zero agencies from the BCA page');

  log('agencies-lpr-bca', `parsed ${agencies.length} agencies from the BCA LPR-use page`);

  const dir = path.join(PUBLIC_DATA, 'reference');
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, 'bca-alpr-agencies.json'),
    JSON.stringify({
      metadata: {
        source: 'Minnesota Bureau of Criminal Apprehension — agencies reporting LPR use',
        sourceUrl: LANDING,
        statute: 'Minn. Stat. § 13.824, subd. 8',
        license: 'Public government data (Minn. Stat. ch. 13)',
        attribution: 'Minnesota Bureau of Criminal Apprehension',
        note:
          'A listed agency self-reported LPR use to the BCA; the device-location text, where present, is the agency\'s own report and is not independently verified by this project.',
        lastUpdated: new Date().toISOString(),
      },
      agencies,
    }),
  );
  log('agencies-lpr-bca', `wrote ${agencies.length} agencies -> public/data/reference/bca-alpr-agencies.json`);
}

main().catch((err) => {
  console.error(`[agencies-lpr-bca] FAILED: ${err.message}`);
  process.exit(1);
});

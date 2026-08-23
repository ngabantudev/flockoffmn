import { readFileSync } from 'node:fs';
import { chromium, serveDist } from './lib/harness.mjs';
const { base: BASE, close: closeServer } = await serveDist();

const browser = await chromium.launch();
let failures = 0;
const check = (name, ok, detail='') => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

// ---------------- archive page: chips actually filter ----------------
{
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(`${BASE}/news/`, { waitUntil: 'networkidle' });

  const controlsVisible = await page.locator('[data-news-controls]').isVisible();
  check('archive: controls revealed by script', controlsVisible);

  const total = await page.locator('[data-news-item]').count();
  const visAll = await page.locator('[data-news-item]:visible').count();
  check('archive: default "All" shows every item', visAll === total, `${visAll}/${total}`);

  await page.locator('[data-news-range][data-days="7"]').click();
  await page.waitForTimeout(120);
  const vis7 = await page.locator('[data-news-item]:visible').count();
  check('archive: 7D narrows the list', vis7 < visAll, `${vis7} of ${visAll}`);

  const status = (await page.locator('[data-news-status]').textContent()).trim();
  check('archive: live region announces a labelled count', /^\d+\s+\S/.test(status), JSON.stringify(status));
  check('archive: status count matches visible rows', status.startsWith(String(vis7)), `${status} vs ${vis7}`);

  const emptyMonths = await page.locator('[data-news-month]:visible').evaluateAll(
    secs => secs.filter(s => ![...s.querySelectorAll('[data-news-item]')].some(i => i.offsetParent !== null)).length
  );
  check('archive: no month heading left over an empty list', emptyMonths === 0, `${emptyMonths} orphaned`);

  const edges = await page.evaluate(() => {
    const vis = [...document.querySelectorAll('[data-news-item]')].filter(i => i.offsetParent !== null);
    if (!vis.length) return { first: null, last: null };
    return { first: vis[0].classList.contains('pt-0'),
             last: vis[vis.length - 1].classList.contains('border-b-0') };
  });
  check('archive: first visible row loses top padding', edges.first === true);
  check('archive: last visible row loses bottom rule', edges.last === true);

  await page.locator('[data-news-range][data-days="0"]').click();
  await page.waitForTimeout(120);
  const back = await page.locator('[data-news-item]:visible').count();
  check('archive: returning to All restores every row', back === total, `${back}/${total}`);

  // topic facet
  const topicBtn = page.locator('[data-news-topic][data-topic="alpr"]');
  if (await topicBtn.count()) {
    await topicBtn.click();
    await page.waitForTimeout(120);
    const wrong = await page.locator('[data-news-item]:visible').evaluateAll(
      els => els.filter(e => e.dataset.topic !== 'alpr').length
    );
    check('archive: topic facet excludes other topics', wrong === 0, `${wrong} leaked`);
  }
  await page.close();
}

// ---------------- map rail (hydrated) ----------------
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  let newsFetches = 0;
  page.on('request', (r) => { if (r.url().includes('/data/news.json')) newsFetches++; });
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  check('rail: visible at 1440px', await page.locator('#news-dock').isVisible());

  // The rail's rows arrive from /data/news.json at idle, so everything below
  // has to wait for them rather than read the document. Polled, not slept —
  // a fixed timeout here is how this suite got flaky before.
  await page.waitForFunction(
    () => document.querySelectorAll('#news-dock [data-news-item]').length > 0,
    { timeout: 10_000 },
  ).catch(() => {});

  const railWindow = Number(
    /const RAIL_WINDOW_DAYS = (\d+);/.exec(
      readFileSync(new URL('../src/components/news/NewsFeed.astro', import.meta.url), 'utf8'),
    )[1],
  );
  const archive = JSON.parse(
    readFileSync(new URL('../public/data/news.json', import.meta.url), 'utf8'),
  );
  const expected = archive.items.filter(
    (i) => Date.now() - new Date(i.published).getTime() <= railWindow * 86400000,
  ).length;

  const info = await page.evaluate(() => {
    const d = document.getElementById('news-dock');
    const rows = [...d.querySelectorAll('[data-news-item]')];
    const pubs = rows.map((x) => new Date(x.dataset.published).getTime());
    return {
      days: [...d.querySelectorAll('[data-news-range]')].map((x) => Number(x.dataset.days)),
      count: rows.length,
      spanDays: pubs.length ? Math.floor((Date.now() - Math.min(...pubs)) / 86400000) : 0,
      fallback: !!d.querySelector('[data-news-fallback]'),
      // Every row must be a real link. The tempting 12 KB saving was to drop
      // the href and resolve on click; this is the assertion that rejects it.
      hrefs: rows.filter((x) => (x.querySelector('[data-news-link]')?.getAttribute('href') || '').startsWith('http')).length,
      labelled: rows.filter((x) => (x.querySelector('[data-news-topic-label]')?.textContent || '').trim()).length,
      dated: rows.filter((x) => (x.querySelector('[data-news-date]')?.textContent || '').trim()).length,
    };
  });
  const widest = Math.max(...info.days);

  check('rail: hydrates every story in the window',
        info.count === expected, `${info.count} rendered vs ${expected} in ${railWindow}d`);
  check('rail: fetches the shared dataset exactly once',
        newsFetches === 1, `${newsFetches} requests`);
  check('rail: fallback is removed once rows arrive', !info.fallback);
  check('rail: every row is a real href',
        info.hrefs === info.count, `${info.hrefs}/${info.count}`);
  check('rail: every row carries a topic label and a date',
        info.labelled === info.count && info.dated === info.count,
        `${info.labelled} labelled, ${info.dated} dated, of ${info.count}`);

  // NOT "every chip <= the data span". That invariant is wrong: a 7D chip over
  // a week that happened to produce stories on only five days is not
  // overclaiming, it is reporting a quiet couple of days. The real invariants
  // are that no rendered story falls outside the widest chip, and that the
  // widest chip is the window itself — which is what silently stopped being
  // true when a payload ceiling of 60 met a 61-story month.
  check('rail: widest chip is the full window',
        widest === railWindow, `widest chip ${widest}d, window ${railWindow}d`);
  check('rail: no rendered story sits outside the widest chip',
        info.spanDays <= widest + 1,
        `${info.count} stories spanning ${info.spanDays}d, widest chip ${widest}d`);
  await page.close();
}

// ---------------- rail hydration edge cases ----------------
{
  // Three states the rail can only reach at runtime, because its chrome is
  // built from the build-time slice and its rows are fetched fresh. All three
  // were broken when the fetch first landed.
  const stub = (items) => (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items }) });
  const now = () => new Date().toISOString();
  const story = (topic, n) => ({
    title: `Story ${n}`, url: `https://example.test/${n}`,
    source: 'Test Outlet', published: now(), topic,
  });

  const read = async (items) => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/data/news.json', stub(items));
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForFunction(
      () => !document.querySelector('#news-dock [data-news-fallback]'),
      { timeout: 10_000 },
    ).catch(() => {});
    const out = await page.evaluate(() => {
      const d = document.getElementById('news-dock');
      const shown = (el) => !!el && !el.hidden && getComputedStyle(el).display !== 'none';
      return {
        rows: d.querySelectorAll('[data-news-item]').length,
        topics: [...d.querySelectorAll('[data-news-topic]')].map((x) => x.dataset.topic),
        controlsHidden: d.querySelector('[data-news-controls]')?.hidden,
        emptyState:
          shown(d.querySelector('[data-news-none-recent]')) ||
          shown(d.querySelector('[data-news-none]')),
      };
    });
    return { page, errors, ...out };
  };

  // An empty window is a real state, not a failure. It used to remove the
  // "loads in your browser" fallback, leave the controls hidden, and say
  // nothing at all — a masthead and a curve over blank space.
  {
    const r = await read([]);
    check('rail/empty: says so rather than going blank', r.emptyState);
    check('rail/empty: renders no rows', r.rows === 0, `${r.rows}`);
    check('rail/empty: no dead controls', r.controlsHidden === true);
    check('rail/empty: no page errors', r.errors.length === 0, r.errors.join('; '));
    await r.page.close();
  }

  // A topic the build did not know about — the ingest can grow one between a
  // cron run and a rebuild. Pruning alone left its rows on screen with no chip
  // able to isolate them.
  {
    const r = await read([story('sheriff', 1), story('alpr', 2)]);
    check('rail/unknown topic: renders both rows', r.rows === 2, `${r.rows}`);
    check('rail/unknown topic: gains a chip for it',
          r.topics.includes('sheriff'), r.topics.join(','));
    await r.page.locator('#news-dock [data-news-topic][data-topic="sheriff"]').click();
    const visible = await r.page.evaluate(
      () => [...document.querySelectorAll('#news-dock [data-news-item]')].filter((x) => !x.hidden).length,
    );
    check('rail/unknown topic: the added chip actually filters',
          visible === 1, `${visible} visible`);
    check('rail/unknown topic: no page errors', r.errors.length === 0, r.errors.join('; '));
    await r.page.close();
  }

  // One topic is a facet with nothing to contrast against.
  {
    const r = await read([story('alpr', 1)]);
    check('rail/one topic: drops the facet entirely',
          r.topics.length === 0, r.topics.join(','));
    check('rail/one topic: still renders the row', r.rows === 1, `${r.rows}`);
    await r.page.close();
  }
}

// ---------------- the rail costs a phone nothing ----------------
{
  // The entire point of Option B. A viewport that cannot display the rail must
  // not download its stories — not in the document, and not over the wire.
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
  let newsFetches = 0;
  page.on('request', (r) => { if (r.url().includes('/data/news.json')) newsFetches++; });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  check('phone: never requests the news dataset', newsFetches === 0, `${newsFetches} requests`);
  check('phone: no story rows in the document',
        (await page.locator('#news-dock [data-news-item]').count()) === 0);
  check('phone: the archive link stands in for them',
        (await page.locator('#news-dock [data-news-fallback] a').count()) === 1);
  await page.close();
}

// ---------------- rail hidden below xl ----------------
{
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  check('rail: hidden below xl (1100px)', !(await page.locator('#news-dock').isVisible()));
  await page.close();
}

// ---------------- nav at narrow widths: real truncation test ----------------
for (const width of [320, 360, 390, 414, 768]) {
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  await page.goto(`${BASE}/about/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(200);
  const r = await page.evaluate(() => {
    const bar = [...document.querySelectorAll('nav[aria-label="Primary"]')].find(n => n.querySelector('svg'));
    if (!bar) return null;
    const spans = [...bar.querySelectorAll('a span')];
    const clipped = spans.filter(s => s.scrollWidth > s.clientWidth + 1).map(s => s.textContent.trim());
    return { clipped, rows: new Set(spans.map(s => Math.round(s.getBoundingClientRect().top))).size };
  });
  check(`nav @${width}px: no label clipped`, r && r.clipped.length === 0,
        r ? `clipped=[${r.clipped.join(', ')}] rows=${r.rows}` : 'bar not found');
  await page.close();
}

// ---------------- no network to third parties ----------------
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const external = [];
  page.on('request', req => { const u = new URL(req.url()); if (u.hostname !== 'localhost') external.push(u.hostname); });
  await page.goto(`${BASE}/news/`, { waitUntil: 'networkidle' });
  await page.locator('[data-news-range][data-days="7"]').click();
  await page.waitForTimeout(400);
  check('news page makes zero third-party requests', external.length === 0, [...new Set(external)].join(', '));
  await page.close();
}

await browser.close();
closeServer();
console.log(failures ? `\n  ${failures} FAILURE(S)` : '\n  all checks passed');
process.exit(failures ? 1 : 0);

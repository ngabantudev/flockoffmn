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

// ---------------- map rail ----------------
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  const railVisible = await page.locator('#news-dock').isVisible();
  check('rail: visible at 1440px', railVisible);
  // Derived, not hardcoded: the contract is that every chip can be backed by
  // the rendered slice, and that the widest chip is actually reachable. A fixed
  // list broke the moment RAIL_WINDOW_DAYS changed, which is a stale test
  // rather than a regression.
  const chipInfo = await page.evaluate(() => {
    const d = document.getElementById('news-dock');
    const days = [...d.querySelectorAll('[data-news-range]')].map(x => Number(x.dataset.days));
    const pubs = [...d.querySelectorAll('[data-news-item]')].map(x => new Date(x.dataset.published).getTime());
    const spanDays = pubs.length ? Math.floor((Date.now() - Math.min(...pubs)) / 86400000) : 0;
    return { days, spanDays, count: pubs.length };
  });
  const widest = Math.max(...chipInfo.days);
  // NOT "every chip <= the data span". That invariant is wrong: a 7D chip over
  // a week that happened to produce stories on only five days is not
  // overclaiming, it is reporting a quiet couple of days. The real invariants
  // are that no rendered story falls outside the widest chip, and that no chip
  // claims more than the window the rail actually slices.
  check('rail: no chip claims more than the 30-day window',
        widest <= 30, `widest ${widest}d`);
  check('rail: at least one chip is offered', chipInfo.days.length >= 1);
  // The invariant the 30D disappearance slipped through. `widest <= 30` alone
  // is satisfied by a rail that has silently fallen back to 7 days because the
  // payload guard bit — which is what happened when the 30-day window grew to
  // 61 stories against a RAIL_LIMIT of 60.
  //
  // Phrased as "only check this when the guard has headroom" it would skip
  // itself in exactly the broken state, so it is phrased the other way: the
  // guard is a runaway ceiling and is required to stay above working volume.
  // If this feed ever genuinely outgrows it, the correct response is to raise
  // the constant deliberately — not to let the rail quietly drop three weeks of
  // coverage to save one row.
  const src = readFileSync(new URL('../src/components/news/NewsFeed.astro', import.meta.url), 'utf8');
  const railLimit = Number(/const RAIL_LIMIT = (\d+);/.exec(src)[1]);
  const railWindow = Number(/const RAIL_WINDOW_DAYS = (\d+);/.exec(src)[1]);
  const archive = JSON.parse(readFileSync(new URL('../public/data/news.json', import.meta.url), 'utf8'));
  const inWindow = archive.items.filter(
    (i) => Date.now() - new Date(i.published).getTime() <= railWindow * 86400000,
  ).length;
  check('rail: payload guard sits above working volume',
        inWindow * 1.5 <= railLimit,
        `${inWindow} stories in ${railWindow}d against a ${railLimit} guard`);
  check('rail: widest chip is the full window',
        widest === railWindow,
        `widest chip ${widest}d, window ${railWindow}d`);
  check('rail: no rendered story sits outside the widest chip',
        chipInfo.spanDays <= widest + 1,
        `${chipInfo.count} stories spanning ${chipInfo.spanDays}d, widest chip ${widest}d`);
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

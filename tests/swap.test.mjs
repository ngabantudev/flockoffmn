import { chromium, serveDist, reporter } from './lib/harness.mjs';
const { base: BASE, close: closeServer } = await serveDist();
const b=await chromium.launch(); const { check: ck, report } = reporter('panel swap checks');

for (const width of [1440, 1280, 1279, 1100]) {
  const page=await b.newPage({viewport:{width,height:900}});
  await page.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(350);
  const xl = width >= 1280;

  const railBefore = await page.locator('#news-dock').isVisible();
  ck(`@${width}: rail visible with no record selected`, railBefore === xl, `visible=${railBefore} expected=${xl}`);

  // Open the detail panel the way the app does: clear its `hidden` attribute.
  await page.evaluate(() => document.getElementById('detail-panel')?.removeAttribute('hidden'));
  await page.waitForTimeout(250);
  const railAfter = await page.locator('#news-dock').isVisible();
  ck(`@${width}: rail yields the column to a selected record`, railAfter === false, `visible=${railAfter}`);

  // And comes back.
  await page.evaluate(() => document.getElementById('detail-panel')?.setAttribute('hidden',''));
  await page.waitForTimeout(250);
  const railBack = await page.locator('#news-dock').isVisible();
  ck(`@${width}: rail returns when the record closes`, railBack === xl, `visible=${railBack}`);

  // The point of the swap: the map keeps usable width.
  const mapW = await page.evaluate(() => document.getElementById('map')?.getBoundingClientRect().width ?? 0);
  ck(`@${width}: map keeps >=480px`, mapW >= 480, `map=${Math.round(mapW)}px`);
  await page.close();
}
await b.close(); closeServer();
process.exit(report());

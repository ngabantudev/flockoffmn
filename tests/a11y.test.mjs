import { chromium, serveDist, reporter } from './lib/harness.mjs';
const { base: BASE, close: closeServer } = await serveDist();
const b=await chromium.launch(); const { check: ck, report } = reporter('accessibility checks');

// ---- Spanish locale ----
{
  const page=await b.newPage({viewport:{width:1400,height:900}});
  await page.goto(`${BASE}/es/news/`,{waitUntil:'networkidle'});
  ck('es: controls revealed', await page.locator('[data-news-controls]').isVisible());
  const total=await page.locator('[data-news-item]').count();
  await page.locator('[data-news-range][data-days="7"]').click();
  await page.waitForTimeout(120);
  const vis=await page.locator('[data-news-item]:visible').count();
  ck('es: 7D filters', vis>0 && vis<total, `${vis}/${total}`);
  const status=(await page.locator('[data-news-status]').textContent()).trim();
  ck('es: status uses the Spanish suffix', /mostradas$/.test(status), JSON.stringify(status));
  const h2=await page.locator('[data-news-month]:visible h2').first().textContent();
  ck('es: month heading localised', /de 20\d\d/.test(h2), h2.trim());
  ck('es: lang attribute', (await page.getAttribute('html','lang'))==='es');
  await page.close();
}

// ---- keyboard operation ----
{
  const page=await b.newPage({viewport:{width:1400,height:900}});
  await page.goto(`${BASE}/news/`,{waitUntil:'networkidle'});
  const chip=page.locator('[data-news-range][data-days="7"]');
  await chip.focus();
  ck('kbd: chip is focusable', await chip.evaluate(el=>el===document.activeElement));
  const before=await page.locator('[data-news-item]:visible').count();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(120);
  const after=await page.locator('[data-news-item]:visible').count();
  ck('kbd: Enter activates the chip', after<before, `${before} -> ${after}`);
  await page.locator('[data-news-range][data-days="0"]').focus();
  await page.keyboard.press('Space');
  await page.waitForTimeout(120);
  ck('kbd: Space activates the chip', (await page.locator('[data-news-item]:visible').count())===before);
  const pressed=await page.locator('[data-news-range][aria-pressed="true"]').count();
  ck('kbd: exactly one range chip pressed', pressed===1, `${pressed} pressed`);
  await page.close();
}

// ---- combined range + topic ----
{
  const page=await b.newPage({viewport:{width:1400,height:900}});
  await page.goto(`${BASE}/news/`,{waitUntil:'networkidle'});
  const topic=page.locator('[data-news-topic][data-topic="alpr"]');
  if (await topic.count()) {
    await page.locator('[data-news-range][data-days="365"]').click();
    await topic.click();
    await page.waitForTimeout(150);
    const bad=await page.locator('[data-news-item]:visible').evaluateAll(els=>{
      const cut=Date.now()-365*86400000;
      return els.filter(e=>e.dataset.topic!=='alpr'||new Date(e.dataset.published).getTime()<cut).length;
    });
    ck('combined: every visible row satisfies BOTH filters', bad===0, `${bad} violations`);
    const shown=await page.locator('[data-news-item]:visible').count();
    const status=(await page.locator('[data-news-status]').textContent()).trim();
    ck('combined: status matches combined result', status.startsWith(String(shown)), `${status} vs ${shown}`);
    const orphan=await page.locator('[data-news-month]:visible').evaluateAll(
      s=>s.filter(x=>![...x.querySelectorAll('[data-news-item]')].some(i=>i.offsetParent!==null)).length);
    ck('combined: no orphaned month heading', orphan===0, `${orphan}`);
  }
  await page.close();
}
await b.close(); closeServer();
process.exit(report());

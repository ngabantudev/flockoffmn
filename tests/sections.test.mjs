import { chromium, serveDist, reporter, railReady } from './lib/harness.mjs';
const { base: BASE, close: closeServer } = await serveDist();
const b=await chromium.launch(); const { check: ck, report } = reporter('section checks');

for (const scheme of ['light','dark']) {
  const page=await b.newPage({viewport:{width:1440,height:900},colorScheme:scheme});
  await page.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
  const railState = await railReady(page);
  if (railState === 'empty') {
    // An empty rail is a terminal state, not a slow one: nothing fell inside
    // the 30-day window. There are no chips to measure, so the assertions
    // below are vacuous rather than failing. Noted out loud so a stale
    // archive shows up as skipped coverage instead of silently passing.
    console.log(`  SKIP  ${scheme}: news archive is stale, no control groups to measure`);
    await page.close();
    continue;
  }
  const r=await page.evaluate(()=>{
    const d=document.getElementById('news-dock');
    const groups=[...d.querySelectorAll('[data-news-controls] [role="group"]')];
    const info=groups.map(g=>{
      const cs=getComputedStyle(g), bb=g.getBoundingClientRect();
      const active=g.querySelector('[aria-pressed="true"]');
      return {label:g.getAttribute('aria-label'), bg:cs.backgroundColor,
              top:Math.round(bb.top), h:Math.round(bb.height),
              activeColor: active?getComputedStyle(active).color:null,
              chips:[...g.querySelectorAll('button')].map(x=>x.textContent.trim())};
    });
    return info;
  });
  console.log(`\n  --- ${scheme} ---`);
  for(const g of r) console.log(`    ${String(g.label).padEnd(12)} bg=${g.bg}  top=${g.top} h=${g.h}  active=${g.activeColor}\n                 chips: ${g.chips.join(' | ')}`);
  ck(`${scheme}: two separate groups`, r.length===2, `${r.length}`);
  ck(`${scheme}: surfaces differ`, r.length===2 && r[0].bg!==r[1].bg, r.map(g=>g.bg).join(' vs '));
  ck(`${scheme}: topic group sits below range group`, r.length===2 && r[1].top>=r[0].top+r[0].h-1);
  await page.close();
}
await b.close(); closeServer();
process.exit(report());

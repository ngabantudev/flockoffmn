import { chromium, serveDist } from './lib/harness.mjs';
const { base: BASE, close: closeServer } = await serveDist();
const b=await chromium.launch(); let fail=0;
const ck=(n,ok,d='')=>{if(!ok)fail++;console.log(`  ${ok?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`)};

for (const scheme of ['light','dark']) {
  const page=await b.newPage({viewport:{width:1440,height:900},colorScheme:scheme});
  await page.goto(`${BASE}/`,{waitUntil:'domcontentloaded'}); await page.waitForTimeout(500);
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
console.log(fail?`\n  ${fail} FAILURE(S)`:'\n  section checks passed');
process.exit(fail?1:0);

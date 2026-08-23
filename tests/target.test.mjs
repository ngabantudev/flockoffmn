import { chromium, serveDist } from './lib/harness.mjs';
const { base: BASE, close: closeServer } = await serveDist();
const b=await chromium.launch(); let fail=0;
const ck=(n,ok,d='')=>{if(!ok)fail++;console.log(`  ${ok?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`)};

for (const [label,url,sel] of [['rail',`${BASE}/`,'#news-dock'],
                               ['archive',`${BASE}/news/`,'#news-archive']]) {
  const page=await b.newPage({viewport:{width:1440,height:900},colorScheme:'light'});
  await page.goto(url,{waitUntil:'domcontentloaded'}); await page.waitForTimeout(500);
  const r=await page.evaluate((sel)=>{
    const root=document.querySelector(sel);
    const box=(el)=>{const b=el.getBoundingClientRect();return {w:+b.width.toFixed(1),h:+b.height.toFixed(1),top:b.top,bottom:b.bottom,left:b.left,right:b.right}};
    const buttons=[...root.querySelectorAll('button')].map(el=>({t:el.textContent.trim().slice(0,26),...box(el)}));
    const links=[...root.querySelectorAll('li[data-news-item] a')].map(el=>({t:el.textContent.trim().slice(0,26),...box(el)}));
    // WCAG 2.5.8 "Spacing" exception: a 24px circle centred on the target must
    // not intersect the circle of any other undersized target.
    const gaps=[];
    for(let i=1;i<links.length;i++) gaps.push(+(links[i].top-links[i-1].bottom).toFixed(1));
    return {buttons, links, gaps};
  }, sel);
  console.log(`\n  --- ${label} ---`);
  const smallBtn=r.buttons.filter(x=>x.w<24||x.h<24);
  for(const x of r.buttons) console.log(`     button ${x.w}x${x.h}  "${x.t}"`);
  ck(`${label}: 2.5.8 all buttons >= 24x24`, smallBtn.length===0, smallBtn.map(x=>`${x.t} ${x.h}`).join(', '));
  const shortLinks=r.links.filter(x=>x.h<24);
  console.log(`     link heights: ${[...new Set(r.links.map(x=>x.h))].join(', ')}  (${shortLinks.length} under 24px)`);
  console.log(`     vertical gaps between adjacent links: ${[...new Set(r.gaps)].join(', ')}`);
  // Exception holds when centre-to-centre spacing >= 24px, i.e. gap + heights leave 24px clearance
  const minCentre = Math.min(...r.gaps.map((g,i)=>g + r.links[i].h/2 + r.links[i+1].h/2));
  console.log(`     min centre-to-centre distance: ${minCentre.toFixed(1)}px`);
  ck(`${label}: 2.5.8 Spacing exception covers text links`, minCentre>=24, `${minCentre.toFixed(1)}px`);
  await page.close();
}
await b.close(); closeServer();
console.log(fail?`\n  ${fail} FAILURE(S)`:'\n  target-size checks passed');
process.exit(fail?1:0);

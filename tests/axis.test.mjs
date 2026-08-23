import { chromium, serveDist, reporter, railReady } from './lib/harness.mjs';
const { base: BASE, close: closeServer } = await serveDist();
const b=await chromium.launch(); const { check: ck, report } = reporter('axis checks');

for (const [label,url,sel] of [['rail',`${BASE}/`,'#news-dock'],
                               ['archive',`${BASE}/news/`,'#news-archive']]) {
  const page=await b.newPage({viewport:{width:1440,height:900},colorScheme:'light'});
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await railReady(page);
  const r=await page.evaluate((sel)=>{
    const root=document.querySelector(sel);
    const fig=root.querySelector('figure'); if(!fig) return null;
    const svg=fig.querySelector('svg');
    const svgBox=svg.getBoundingClientRect();
    const rects=[...svg.querySelectorAll('rect')];
    const vbW=parseFloat(svg.getAttribute('viewBox').split(' ')[2]);
    const marks=[...fig.querySelectorAll('[aria-hidden="true"] span')].map(s=>{
      const bb=s.getBoundingClientRect();
      return {year:s.textContent.trim(), left:bb.left, right:bb.right, w:bb.width};
    });
    // where each bar actually is on screen
    const barLeft = (i)=> svgBox.left + (parseFloat(rects[i].getAttribute('x'))/vbW)*svgBox.width;
    return {
      svgLeft:svgBox.left, svgRight:svgBox.right, svgW:svgBox.width,
      marks,
      barLefts: rects.map((_,i)=>barLeft(i)),
      figRight: fig.getBoundingClientRect().right,
      figLeft: fig.getBoundingClientRect().left,
      overlaps: marks.some((m,i)=> i>0 && m.left < marks[i-1].right + 2),
    };
  }, sel);
  if(!r){ console.log(`  ${label}: no figure`); continue; }
  console.log(`\n  --- ${label} (svg ${Math.round(r.svgW)}px) ---`);
  for (const m of r.marks) {
    const nearest = r.barLefts.reduce((best,x,i)=>Math.abs(x-m.left)<Math.abs(r.barLefts[best]-m.left)?i:best,0);
    const delta = Math.abs(r.barLefts[nearest]-m.left);
    console.log(`    ${m.year}: label@${m.left.toFixed(1)}  nearest bar@${r.barLefts[nearest].toFixed(1)}  Δ${delta.toFixed(1)}px`);
  }
  ck(`${label}: labels align to a bar within 1px`,
     r.marks.every(m=>Math.min(...r.barLefts.map(x=>Math.abs(x-m.left)))<=1));
  ck(`${label}: no label overflows the figure`,
     r.marks.every(m=>m.left>=r.figLeft-0.5 && m.right<=r.figRight+0.5),
     `fig ${r.figLeft.toFixed(0)}..${r.figRight.toFixed(0)}`);
  ck(`${label}: labels do not collide`, !r.overlaps);
  await page.close();
}
await b.close(); closeServer();
process.exit(report());

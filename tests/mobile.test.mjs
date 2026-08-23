import { chromium, serveDist, reporter } from './lib/harness.mjs';
const { base: BASE, close: closeServer } = await serveDist();
const b=await chromium.launch(); const { check: ck, report } = reporter('mobile responsiveness checks');

const WIDTHS=[320,360,390,414,768,1024,1279,1280];
for (const w of WIDTHS) {
  const page=await b.newPage({viewport:{width:w,height:800},colorScheme:'light',
    isMobile:w<768, hasTouch:w<768, deviceScaleFactor:2});
  // --- archive page ---
  await page.goto(`${BASE}/news/`,{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(400);
  const a=await page.evaluate(()=>{
    const de=document.documentElement;
    const btns=[...document.querySelectorAll('#news-archive button')].map(el=>{const r=el.getBoundingClientRect();return{t:el.textContent.trim(),h:+r.height.toFixed(1),w:+r.width.toFixed(1)}});
    const marks=[...document.querySelectorAll('#news-archive figure [aria-hidden="true"] span')].map(s=>{const r=s.getBoundingClientRect();return{y:s.textContent.trim(),l:r.left,rt:r.right}});
    const overflow=[...document.querySelectorAll('#news-archive *')].filter(el=>el.getBoundingClientRect().right > de.clientWidth+1).length;
    return {hScroll:de.scrollWidth>de.clientWidth+1, sw:de.scrollWidth, cw:de.clientWidth,
            smallBtns:btns.filter(x=>x.h<24||x.w<24), nBtns:btns.length,
            markCollide: marks.some((m,i)=>i>0 && m.l < marks[i-1].rt+2), nMarks:marks.length,
            overflow};
  });
  ck(`archive @${w}: no horizontal scroll`, !a.hScroll, `${a.sw} vs ${a.cw}`);
  ck(`archive @${w}: no element overflows the viewport`, a.overflow===0, `${a.overflow} elements`);
  ck(`archive @${w}: all ${a.nBtns} controls >= 24px`, a.smallBtns.length===0, a.smallBtns.map(x=>`${x.t} ${x.h}x${x.w}`).join(', '));
  ck(`archive @${w}: ${a.nMarks} year labels do not collide`, !a.markCollide);

  // --- map page ---
  await page.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(600);
  const m=await page.evaluate(()=>{
    const de=document.documentElement;
    const d=document.getElementById('news-dock'), t=document.getElementById('news-tab');
    return {hScroll:de.scrollWidth>de.clientWidth+1,
            dock: d?getComputedStyle(d).display:'absent',
            tab: t?(t.hidden?'hidden-attr':getComputedStyle(t).display):'absent',
            dockInert: d?d.inert:null};
  });
  const shouldDock = w>=1280;
  ck(`map @${w}: dock ${shouldDock?'shown':'hidden'}`, (m.dock!=='none')===shouldDock, m.dock);
  ck(`map @${w}: tab ${shouldDock?'shown':'hidden'}`, (m.tab!=='none' && m.tab!=='hidden-attr')===shouldDock, m.tab);
  ck(`map @${w}: no horizontal scroll`, !m.hScroll);
  ck(`map @${w}: dock not left inert below xl`, shouldDock || m.dockInert===false, `inert=${m.dockInert}`);
  await page.close();
}
await b.close(); closeServer();
process.exit(report());

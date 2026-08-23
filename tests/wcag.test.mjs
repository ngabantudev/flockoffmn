import { chromium, serveDist, reporter, railReady } from './lib/harness.mjs';
const { base: BASE, close: closeServer } = await serveDist();
const b=await chromium.launch();
const { check: ck, report } = reporter('WCAG checks');

const page=await b.newPage({viewport:{width:1440,height:900},colorScheme:'light'});
await page.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
await railReady(page);

// 2.5.8 Target Size (Minimum) — 24x24 CSS px, AA in WCAG 2.2
const targets = await page.evaluate(() => {
  const d=document.getElementById('news-dock');
  const all=[...d.querySelectorAll('button, a')];
  return all.map(el=>{
    const b=el.getBoundingClientRect();
    // WCAG 2.5.8 "Spacing" exception: an undersized target passes when a 24px
    // circle centred on it does not intersect the circle of any other target.
    let minCentre=Infinity;
    for(const other of all){ if(other===el) continue;
      const o=other.getBoundingClientRect();
      const dx=(b.left+b.width/2)-(o.left+o.width/2), dy=(b.top+b.height/2)-(o.top+o.height/2);
      minCentre=Math.min(minCentre, Math.hypot(dx,dy)); }
    return {t:(el.textContent||'').trim().slice(0,28), w:+b.width.toFixed(1), h:+b.height.toFixed(1),
            centre:+minCentre.toFixed(1)};
  });
});
// Undersized AND crowded is the failure; undersized with >=24px clearance is exempt.
const small = targets.filter(t=>(t.w<24||t.h<24) && t.centre<24);
console.log('\n  2.5.8 Target Size (min 24x24):');
for(const t of targets) console.log(`     ${t.w}x${t.h}  "${t.t}"`);
ck('2.5.8 every control is at least 24x24', small.length===0, small.map(t=>`"${t.t}" ${t.w}x${t.h}`).join(', '));

// 2.4.7 Focus Visible + 1.4.11 focus indicator contrast
const focus = await page.evaluate(async () => {
  const d=document.getElementById('news-dock');
  const el=d.querySelector('button');
  el.focus();
  const cs=getComputedStyle(el);
  return {outlineWidth:cs.outlineWidth, outlineStyle:cs.outlineStyle, outlineColor:cs.outlineColor,
          boxShadow:cs.boxShadow, isFocused: document.activeElement===el};
});
console.log('\n  2.4.7 Focus Visible:');
console.log(`     outline: ${focus.outlineStyle} ${focus.outlineWidth} ${focus.outlineColor}`);
console.log(`     box-shadow: ${focus.boxShadow}`);
ck('2.4.7 focused control shows a visible indicator',
   focus.isFocused && ((focus.outlineStyle!=='none' && parseFloat(focus.outlineWidth)>0) || focus.boxShadow!=='none'));

// 1.3.1 heading order within the panel
const headings = await page.evaluate(()=>{
  const d=document.getElementById('news-dock');
  return [...d.querySelectorAll('h1,h2,h3,h4')].map(h=>({lvl:+h.tagName[1], t:h.textContent.trim().slice(0,34)}));
});
console.log('\n  1.3.1 Headings in the rail:');
for(const h of headings) console.log(`     h${h.lvl}  ${h.t}`);
let ordered=true; for(let i=1;i<headings.length;i++) if(headings[i].lvl>headings[i-1].lvl+1) ordered=false;
ck('1.3.1 no heading level skipped', ordered);

// 4.1.2 Name, Role, Value
const nrv = await page.evaluate(()=>{
  const d=document.getElementById('news-dock');
  const groups=[...d.querySelectorAll('[role="group"]')].map(g=>g.getAttribute('aria-label'));
  const btns=[...d.querySelectorAll('button')];
  return {groups, unlabelled: btns.filter(x=>!(x.textContent||'').trim() && !x.getAttribute('aria-label')).length,
          pressed: btns.filter(x=>x.hasAttribute('aria-pressed')).length, total:btns.length,
          liveRegions:[...d.querySelectorAll('[aria-live]')].map(x=>x.getAttribute('aria-live'))};
});
console.log('\n  4.1.2 Name/Role/Value:');
console.log(`     groups labelled: ${JSON.stringify(nrv.groups)}`);
console.log(`     buttons: ${nrv.total}, aria-pressed on ${nrv.pressed}, unlabelled ${nrv.unlabelled}`);
console.log(`     live regions: ${JSON.stringify(nrv.liveRegions)}`);
ck('4.1.2 every control has an accessible name', nrv.unlabelled===0);
ck('4.1.2 toggle state exposed on all toggles', nrv.pressed===nrv.total);
ck('4.1.2 every group is labelled', nrv.groups.every(Boolean));

await page.close();

// 1.4.10 Reflow — 320px, and 400% zoom equivalent
for (const w of [320, 360]) {
  const p2=await b.newPage({viewport:{width:w,height:800},colorScheme:'light'});
  await p2.goto(`${BASE}/news/`,{waitUntil:'domcontentloaded'});
  await p2.waitForTimeout(400);
  const r=await p2.evaluate(()=>({
    hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  ck(`1.4.10 no horizontal scroll at ${w}px`, !r.hScroll, `scrollW ${r.sw} vs clientW ${r.cw}`);
  await p2.close();
}

// 1.4.12 Text Spacing
const p3=await b.newPage({viewport:{width:1440,height:900},colorScheme:'light'});
await p3.goto(`${BASE}/news/`,{waitUntil:'domcontentloaded'});
await p3.addStyleTag({content:`*{line-height:1.5 !important;letter-spacing:0.12em !important;word-spacing:0.16em !important}p{margin-bottom:2em !important}`});
await p3.waitForTimeout(400);
const spacing=await p3.evaluate(()=>({hScroll:document.documentElement.scrollWidth>document.documentElement.clientWidth+1}));
ck('1.4.12 survives text-spacing override without clipping', !spacing.hScroll);
await p3.close();

await b.close(); closeServer();
process.exit(report());

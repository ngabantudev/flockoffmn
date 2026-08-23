import { chromium, serveDist } from './lib/harness.mjs';
const { base: BASE, close: closeServer } = await serveDist();
const b=await chromium.launch(); let fail=0;
const ck=(n,ok,d='')=>{if(!ok)fail++;console.log(`  ${ok?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`)};
const ctx=await b.newContext({viewport:{width:1440,height:900}});
const page=await ctx.newPage();
await page.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
await page.waitForTimeout(700);

// Wait for the width animation to actually finish instead of guessing at a
// duration. A fixed sleep passes alone and fails when suites run back to back,
// which reads as a regression and is not one.
const settle = (pg) => pg.evaluate(() => new Promise(res => {
  const d = document.getElementById('news-dock');
  let last = -1, still = 0;
  const tick = () => {
    const w = Math.round(d.getBoundingClientRect().width);
    still = (w === last) ? still + 1 : 0; last = w;
    if (still >= 5) return res(w);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}));
const state=()=> page.evaluate(()=>{
  const d=document.getElementById('news-dock'), t=document.getElementById('news-tab');
  const cs=d?getComputedStyle(d):null;
  return {collapsed:d?.hasAttribute('data-collapsed'), width:cs?Math.round(d.getBoundingClientRect().width):null,
          inert:d?.inert, expanded:t?.getAttribute('aria-expanded'), tabVisible:t?!t.hidden&&getComputedStyle(t).display!=='none':false,
          ready:d?.hasAttribute('data-ready'), ls:localStorage.getItem('mapNewsCollapsed')};
});

let s0=await state();
console.log('  initial:', JSON.stringify(s0));
ck('tab is revealed', s0.tabVisible);
ck('starts expanded', s0.collapsed===false && s0.width>300, `w=${s0.width}`);
ck('aria-expanded true', s0.expanded==='true');
ck('data-ready set (transitions on)', s0.ready);

await page.click('#news-tab'); await settle(page);
let s1=await state();
console.log('  after click:', JSON.stringify(s1));
ck('collapses to zero width', s1.collapsed===true && s1.width===0, `w=${s1.width}`);
ck('aria-expanded false', s1.expanded==='false');
ck('inert while collapsed', s1.inert===true);
ck('tab still reachable to reopen', s1.tabVisible);
ck('persisted to localStorage', s1.ls==='1', String(s1.ls));

// reload: must come back collapsed with no flash
const page2=await ctx.newPage();
await page2.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
await page2.waitForTimeout(600);
const s2=await page2.evaluate(()=>{
  const d=document.getElementById('news-dock');
  return {collapsed:d?.hasAttribute('data-collapsed'), width:Math.round(d.getBoundingClientRect().width)};
});
ck('persists across reload', s2.collapsed===true && s2.width===0, JSON.stringify(s2));
await page2.close();

await page.click('#news-tab'); await settle(page);
const s3=await state();
ck('reopens', s3.collapsed===false && s3.width>300 && s3.inert===false, `w=${s3.width}`);
ck('cleared in storage', s3.ls==='0', String(s3.ls));

// tab exclusivity with the detail panel
await page.evaluate(()=>document.getElementById('detail-panel')?.removeAttribute('hidden'));
await page.waitForTimeout(300);
const s4=await page.evaluate(()=>{
  const t=document.getElementById('news-tab'), d=document.getElementById('news-dock');
  return {newsTab:getComputedStyle(t).display, dock:getComputedStyle(d).display};
});
ck('news tab hides while a record is open', s4.newsTab==='none', s4.newsTab);
ck('dock hides while a record is open', s4.dock==='none', s4.dock);
await page.evaluate(()=>document.getElementById('detail-panel')?.setAttribute('hidden',''));
await page.waitForTimeout(300);
const s5=await page.evaluate(()=>getComputedStyle(document.getElementById('news-tab')).display);
ck('news tab returns when the record closes', s5!=='none', s5);

// map regains the width when collapsed
await page.click('#news-tab'); await settle(page);
const mapW=await page.evaluate(()=>Math.round(document.getElementById('map').getBoundingClientRect().width));
ck('map reclaims the column when collapsed', mapW>900, `${mapW}px`);

await ctx.close(); await b.close(); closeServer();
console.log(fail?`\n  ${fail} FAILURE(S)`:'\n  collapse checks passed');
process.exit(fail?1:0);

import { chromium, serveDist, COLOR_HELPERS } from './lib/harness.mjs';
const { base: BASE, close: closeServer } = await serveDist();
const b=await chromium.launch();

const AUDIT = (rootSel) => {
  // solid/lum/ratio/bgOf come from COLOR_HELPERS, injected below.
  const root=document.querySelector(rootSel); if(!root) return [];
  const out=[];
  for(const el of root.querySelectorAll('h1,h2,h3,p,span,a,button,time,figcaption,strong,li')){
    const hasText=Array.from(el.childNodes).some(n=>n.nodeType===3&&n.textContent.trim());
    if(!hasText)continue;
    const cs=getComputedStyle(el);
    if(cs.display==='none'||cs.visibility==='hidden'||parseFloat(cs.opacity)===0)continue;
    const bg=bgOf(el.parentElement||el), fg=solid(cs.color,bg);
    const size=parseFloat(cs.fontSize), bold=parseInt(cs.fontWeight)>=700;
    const need=(size>=24||(size>=18.66&&bold))?3:4.5;
    out.push({txt:(el.textContent||'').trim().slice(0,50),size,fg:`rgb(${fg.join(', ')})`,bg:`rgb(${bg.join(', ')})`,r:+ratio(fg,bg).toFixed(2),need});
  }
  return out;
};

let fails=0;
for (const [label,url,sel] of [['map rail',`${BASE}/`,'#news-dock'],
                               ['archive',`${BASE}/news/`,'#news-archive'],
                               ['archive es',`${BASE}/es/news/`,'#news-archive']]) {
  for (const scheme of ['light','dark']) {
    const page=await b.newPage({viewport:{width:1440,height:900},colorScheme:scheme});
    // The colour maths runs in the page because only the browser can resolve
    // oklab() and alpha — see COLOR_HELPERS. Injected before navigation so it
    // is defined by the time AUDIT runs.
    await page.addInitScript({ content: COLOR_HELPERS });
    await page.goto(url,{waitUntil:'domcontentloaded'}); await page.waitForTimeout(500);
    const rows=await page.evaluate(AUDIT, sel);
    const seen=new Set(); const bad=[];
    for(const r of rows){const k=r.txt+r.fg;if(seen.has(k))continue;seen.add(k);if(r.r<r.need)bad.push(r)}
    console.log(`  ${label} / ${scheme}: ${seen.size} unique text nodes, ${bad.length} failing`);
    for(const f of bad.sort((a,b)=>a.r-b.r)) { fails++;
      console.log(`     FAIL ${String(f.r).padStart(5)}:1 (need ${f.need}) ${f.size}px ${f.fg} on ${f.bg}  "${f.txt}"`); }
    await page.close();
  }
}
await b.close(); closeServer();
console.log(fails?`\n  ${fails} contrast failure(s)`:'\n  no contrast failures anywhere');
process.exit(fails?1:0);

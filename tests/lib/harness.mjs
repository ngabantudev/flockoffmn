/**
 * Shared harness for the browser suites in this directory.
 *
 * Every suite used to carry its own copy of the static file server, its own
 * `chromium.launch()`, its own pass/fail counter and its own hardcoded port —
 * ten copies of about thirty lines, which is how they drifted: one suite's
 * server handled `.pmtiles` and the rest 404'd it, and each picked a port by
 * hand. All of that lives here now.
 *
 * These drive the built site in `dist/`, so `npm run build` has to have run.
 * They are deliberately not unit tests: the defects this project kept shipping
 * were things a unit test cannot see — a chip that outran its data, a contrast
 * ratio, a nav label clipped at 320px, a panel left `inert` with no visible
 * control to undo it.
 */
import { createServer } from 'node:http';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { extname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require_ = createRequire(import.meta.url);
export const { chromium } = require_('playwright');

export const DIST = fileURLToPath(new URL('../../dist/', import.meta.url));

const TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.pmtiles': 'application/octet-stream',
};

/**
 * Serve `dist/` on an ephemeral port.
 *
 * Port 0 rather than a number picked per suite: the suites are run one after
 * another by `run.mjs`, and a hardcoded port fails intermittently when the
 * previous listener has not finished closing.
 */
export async function serveDist() {
  const server = createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]);
    let file = join(DIST, rel);
    try {
      if (statSync(file).isDirectory()) file = join(file, 'index.html');
    } catch {
      if (existsSync(`${file}/index.html`)) file = `${file}/index.html`;
      else if (existsSync(`${file}.html`)) file = `${file}.html`;
    }
    try {
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
      res.end(readFileSync(file));
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
  await new Promise((r) => server.listen(0, r));
  const { port } = server.address();
  return { base: `http://localhost:${port}`, close: () => server.close() };
}

/** Pass/fail reporter. `report()` exits non-zero if anything failed. */
export function reporter(label) {
  let failed = 0;
  return {
    check(name, ok, detail = '') {
      if (!ok) failed += 1;
      console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
    },
    note: (msg) => console.log(`  ${msg}`),
    report() {
      console.log(failed ? `\n  ${label}: ${failed} FAILURE(S)` : `\n  ${label}: passed`);
      return failed;
    },
  };
}

/**
 * Composite a CSS colour over its ancestors and return sRGB.
 *
 * Runs in the page because only the browser can resolve `oklab()` and alpha.
 * Parsing `getComputedStyle().color` as a string returned nonsense for
 * Tailwind v4's oklab output — a notice measured at a fictional 18.73:1 while
 * being invisible on screen.
 */
export const COLOR_HELPERS = `
  const __cv = document.createElement('canvas'); __cv.width = __cv.height = 1;
  const __ctx = __cv.getContext('2d', { willReadFrequently: true });
  const solid = (color, over) => {
    __ctx.clearRect(0, 0, 1, 1);
    __ctx.fillStyle = 'rgb(' + over.join(',') + ')'; __ctx.fillRect(0, 0, 1, 1);
    __ctx.fillStyle = color; __ctx.fillRect(0, 0, 1, 1);
    const d = __ctx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]];
  };
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (fg, bg) => { const a = lum(fg), c = lum(bg);
    const [hi, lo] = a > c ? [a, c] : [c, a]; return (hi + 0.05) / (lo + 0.05); };
  const bgOf = (el) => { const stack = []; let n = el;
    while (n && n !== document.documentElement) { stack.push(getComputedStyle(n).backgroundColor); n = n.parentElement; }
    let acc = [255, 255, 255]; for (const c of stack.reverse()) acc = solid(c, acc); return acc; };
`;

/** Wait for an element's width to stop changing, rather than guessing a duration. */
export const settle = (page, selector) =>
  page.evaluate((sel) => new Promise((res) => {
    const el = document.querySelector(sel);
    let last = -1, still = 0;
    const tick = () => {
      const w = Math.round(el.getBoundingClientRect().width);
      still = w === last ? still + 1 : 0; last = w;
      if (still >= 5) return res(w);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), selector);

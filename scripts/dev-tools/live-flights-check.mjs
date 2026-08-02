#!/usr/bin/env node
/**
 * Live flight liveness check — a manual, local-only diagnostic.
 *
 * Not part of the site. Not wired into `npm run data` or the build, not in
 * the layer registry, never deployed. It exists to answer one question by
 * eye: "is adsb.lol actually returning live, moving aircraft right now, or
 * is something in the pipeline stuck?" — independent of the agency_aircraft
 * layer's narrow 5-category roster, which can legitimately show zero
 * aircraft for hours at a time and so can't answer that question on its own.
 *
 * adsb.lol sends no CORS headers (checked directly: a browser fetch to
 * api.adsb.lol gets a 200 with no Access-Control-Allow-Origin, which the
 * browser then refuses to hand to script). This project is also a static
 * site with no backend by design (see astro.config.mjs). So this run this
 * yourself, locally: a plain Node process makes the actual request — Node
 * has no CORS to enforce — and hands the browser tab a same-origin JSON
 * endpoint and, since the browser also can't be pointed at a third-party map
 * tile or script host either without a network round trip of its own, a
 * locally-served copy of the maplibre-gl bundle already sitting in
 * node_modules.
 *
 * Usage:
 *   node scripts/dev-tools/live-flights-check.mjs
 *   (or: npm run dev:live-flights-check)
 * then open http://127.0.0.1:8799 and watch. Ctrl+C to stop; nothing here
 * persists anything to disk.
 */

import http from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MAPLIBRE_DIR = path.join(ROOT, 'node_modules/maplibre-gl/dist');

const PORT = Number(process.env.PORT) || 8799;

/**
 * Centred on Minnesota, radius 250nm (adsb.lol's max) — comfortably covers
 * the whole state from one query, plus enough of the neighbours that a
 * near-border flight doesn't wink in and out as it drifts a few miles.
 */
const ADSB_URL = 'https://api.adsb.lol/v2/point/46.3/-94.2/250';

async function fetchAircraft() {
  const res = await fetch(ADSB_URL, {
    signal: AbortSignal.timeout(10_000),
    headers: { 'User-Agent': 'flockoff-live-flights-check/manual-diagnostic' },
  });
  if (!res.ok) throw new Error(`adsb.lol HTTP ${res.status}`);
  return res.json();
}

const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>Live flight check (internal diagnostic)</title>
<link rel="stylesheet" href="/maplibre-gl.css" />
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; background: #0a0c10; color: #e2e8f0; font: 13px/1.4 system-ui, sans-serif; }
  #banner { padding: 8px 14px; background: #451a03; color: #fde68a; border-bottom: 1px solid #78350f; font-size: 12px; }
  #banner strong { color: #fef3c7; }
  #layout { display: flex; height: calc(100% - 37px); }
  #map { flex: 1; min-width: 0; }
  #side { width: 340px; flex-shrink: 0; border-left: 1px solid #1e293b; display: flex; flex-direction: column; }
  #status { padding: 8px 10px; border-bottom: 1px solid #1e293b; font-size: 12px; }
  #status .count { font-size: 20px; font-weight: 700; color: #38bdf8; }
  #status .err { color: #f87171; }
  #list { flex: 1; overflow-y: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { text-align: left; padding: 3px 6px; border-bottom: 1px solid #1e293b; white-space: nowrap; }
  th { position: sticky; top: 0; background: #0f172a; color: #94a3b8; font-weight: 600; }
  tr:hover td { background: #111827; }
  .stale { color: #64748b; }
  .maplibregl-popup-content { background: #0f172a; color: #e2e8f0; font: 12px/1.4 system-ui, sans-serif; }
</style>
</head>
<body>
  <div id="banner"><strong>Internal diagnostic — not part of the public site.</strong> Polls adsb.lol directly, every 10s, for any transponder-equipped aircraft over Minnesota. Proves whether the live feed itself is working, independent of the agency roster.</div>
  <div id="layout">
    <div id="map"></div>
    <div id="side">
      <div id="status">Loading…</div>
      <div id="list"><table><thead><tr><th>Call</th><th>Type</th><th>Alt</th><th>GS</th><th>Trk</th><th>Age</th></tr></thead><tbody id="rows"></tbody></table></div>
    </div>
  </div>
<script src="/maplibre-gl.js"></script>
<script>
  const POLL_MS = 10000;

  // Lucide's "plane" icon path, verbatim — a single closed outline, so it
  // reads fine filled solid at map-marker size even though the source draws
  // it as a 2px stroke. Its nose sits at (21,3) in the 24x24 box: a bearing
  // of 45° (NE) from the icon's own centre, which is why every render below
  // subtracts 45 from the reported track before handing MapLibre a rotation.
  const PLANE_PATH = 'M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z';
  const NOSE_OFFSET_DEG = 45;

  function buildPlaneSprite(color) {
    const px = 64;
    const canvas = document.createElement('canvas');
    canvas.width = px;
    canvas.height = px;
    const ctx = canvas.getContext('2d');
    ctx.translate(px / 2, px / 2);
    ctx.scale((px / 24) * 0.82, (px / 24) * 0.82);
    ctx.translate(-12, -12);
    const p = new Path2D(PLANE_PATH);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.fillStyle = color;
    ctx.fill(p);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = '#0a0c10';
    ctx.stroke(p);
    return ctx.getImageData(0, 0, px, px);
  }

  const map = new maplibregl.Map({
    container: 'map',
    style: {
      version: 8,
      sources: {
        osm: {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          maxzoom: 19,
          attribution: '© OpenStreetMap contributors',
        },
      },
      layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
    },
    center: [-94.2, 46.3],
    zoom: 6,
    attributionControl: { compact: true },
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

  let popup = null;

  map.on('load', () => {
    map.addImage('plane', buildPlaneSprite('#38bdf8'), { pixelRatio: 2 });
    map.addSource('aircraft', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'aircraft-points',
      type: 'symbol',
      source: 'aircraft',
      layout: {
        'icon-image': 'plane',
        'icon-rotate': ['get', 'rotate'],
        'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-size': ['interpolate', ['linear'], ['zoom'], 4, 0.45, 8, 0.85, 12, 1.2],
      },
    });
    map.on('click', 'aircraft-points', (e) => {
      const f = e.features?.[0];
      if (!f) return;
      popup?.remove();
      const p = f.properties;
      popup = new maplibregl.Popup({ offset: 10 })
        .setLngLat(e.lngLat)
        .setHTML(
          \`<strong>\${p.flight || p.hex}</strong><br>\${p.type || 'unknown type'}<br>\${p.alt ?? '?'} ft · \${p.gs ?? '?'} kt · track \${p.track ?? '?'}°<br>seen \${p.seen}s ago\`,
        )
        .addTo(map);
    });
    map.on('mouseenter', 'aircraft-points', () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', 'aircraft-points', () => (map.getCanvas().style.cursor = ''));

    startPolling();
  });

  /**
   * hex -> { from: {lat,lon}, to: {lat,lon}, track, gs, flight, type, alt,
   *          seenAt (fetch timestamp), fetchedAtMs (performance.now at the
   *          poll that produced the "to" position) }
   *
   * Positions are linearly interpolated between the last two real fixes over
   * the polling interval — plain smoothing over a 10s hop, not a claim about
   * anything the aircraft did in between. Dropped entirely (not frozen at a
   * last position) the moment a poll no longer reports it, same principle as
   * the production layer's own "omit rather than draw stale" rule.
   */
  const tracked = new Map();
  const statusEl = document.getElementById('status');
  const rowsEl = document.getElementById('rows');
  let lastPollAt = 0;
  let lastError = null;

  async function poll() {
    const startedAt = performance.now();
    try {
      const res = await fetch('/api/aircraft', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const body = await res.json();
      lastError = null;
      lastPollAt = Date.now();
      const seenHex = new Set();
      for (const ac of body.ac ?? []) {
        if (typeof ac.lat !== 'number' || typeof ac.lon !== 'number') continue;
        seenHex.add(ac.hex);
        const prev = tracked.get(ac.hex);
        tracked.set(ac.hex, {
          from: prev ? currentInterpolated(prev) : { lat: ac.lat, lon: ac.lon },
          to: { lat: ac.lat, lon: ac.lon },
          fetchedAtMs: startedAt,
          track: ac.track ?? 0,
          gs: ac.gs ?? null,
          flight: (ac.flight || '').trim() || null,
          type: ac.t || null,
          alt: ac.alt_baro === 'ground' ? 'ground' : (ac.alt_baro ?? null),
          seen: ac.seen ?? 0,
        });
      }
      for (const hex of [...tracked.keys()]) if (!seenHex.has(hex)) tracked.delete(hex);
    } catch (err) {
      lastError = err.message || String(err);
    }
    renderStatus();
  }

  function currentInterpolated(entry) {
    const t = Math.min(1, (performance.now() - entry.fetchedAtMs) / POLL_MS);
    return {
      lat: entry.from.lat + (entry.to.lat - entry.from.lat) * t,
      lon: entry.from.lon + (entry.to.lon - entry.from.lon) * t,
    };
  }

  function renderStatus() {
    const ageS = lastPollAt ? Math.round((Date.now() - lastPollAt) / 1000) : null;
    statusEl.innerHTML = lastError
      ? \`<span class="err">adsb.lol unreachable: \${lastError}</span>\`
      : \`<span class="count">\${tracked.size}</span> aircraft over Minnesota · updated \${ageS}s ago\`;
  }

  function renderFrame() {
    const features = [];
    const rows = [];
    for (const [hex, e] of tracked) {
      const pos = currentInterpolated(e);
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [pos.lon, pos.lat] },
        properties: {
          hex,
          flight: e.flight,
          type: e.type,
          alt: e.alt,
          gs: e.gs,
          track: e.track,
          seen: e.seen,
          rotate: ((e.track - NOSE_OFFSET_DEG) % 360 + 360) % 360,
        },
      });
      rows.push(e);
    }
    const src = map.getSource('aircraft');
    if (src) src.setData({ type: 'FeatureCollection', features });

    rows.sort((a, b) => (a.flight || '').localeCompare(b.flight || ''));
    rowsEl.innerHTML = rows
      .map(
        (r) => \`<tr class="\${r.seen > 30 ? 'stale' : ''}"><td>\${r.flight || '—'}</td><td>\${r.type || '—'}</td><td>\${r.alt ?? '—'}</td><td>\${r.gs ?? '—'}</td><td>\${Math.round(r.track)}°</td><td>\${Math.round(r.seen)}s</td></tr>\`,
      )
      .join('');
  }

  function startPolling() {
    poll();
    setInterval(poll, POLL_MS);
    setInterval(renderStatus, 1000);
    (function loop() {
      renderFrame();
      requestAnimationFrame(loop);
    })();
  }
</script>
</body>
</html>`;

function serveFile(res, filePath, contentType) {
  if (!existsSync(filePath)) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': contentType });
  createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML);
    return;
  }

  if (url.pathname === '/maplibre-gl.js') {
    serveFile(res, path.join(MAPLIBRE_DIR, 'maplibre-gl.js'), 'application/javascript');
    return;
  }

  if (url.pathname === '/maplibre-gl.css') {
    serveFile(res, path.join(MAPLIBRE_DIR, 'maplibre-gl.css'), 'text/css');
    return;
  }

  if (url.pathname === '/api/aircraft') {
    try {
      const data = await fetchAircraft();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message || String(err) }));
    }
    return;
  }

  res.writeHead(404).end('not found');
});

if (!existsSync(MAPLIBRE_DIR)) {
  console.error(`[live-flights-check] maplibre-gl not found at ${MAPLIBRE_DIR} — run npm install first.`);
  process.exit(1);
}

// Bound to loopback only: this proxies live third-party data on demand and
// has no reason to be reachable from anywhere but the machine running it.
server.listen(PORT, '127.0.0.1', () => {
  console.log(`[live-flights-check] http://127.0.0.1:${PORT}  (Ctrl+C to stop)`);
  console.log('[live-flights-check] manual diagnostic only — not part of the site, nothing is written to disk.');
});

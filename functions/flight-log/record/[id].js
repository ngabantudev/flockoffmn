/**
 * Citation permalink for a single flight sighting — HTML for humans/legal
 * citations, NOT under functions/api/ since it renders a browser document
 * rather than JSON. Companion to [id]/pdf.js (a downloadable PDF of the
 * same record) and functions/api/flight-log/[hex].js's raw JSON.
 *
 * Pages Functions sit outside Astro/Tailwind entirely, so this hand-builds
 * a self-contained HTML document with its own inline <style>, hardcoding
 * the site's dark-theme palette from src/styles/global.css's @theme block
 * (ink-950/900/850/800/700/400/300/100, accent, warn) rather than trying to
 * reach into the Astro build from a Function.
 *
 * XSS: every DB-sourced string interpolated below goes through escapeHtml()
 * first — see functions/lib/flight-log-shared.mjs's header for the threat
 * model (callsign/aircraft_type are upstream-controlled ADS-B broadcast
 * data, airport_icao is project-controlled but escaped anyway).
 */

import {
  getSightingWithPairing,
  toExport,
  escapeHtml,
  formatDuration,
  errorPage,
  CAVEATS,
  PAIRING_CAVEAT,
  SECURITY_HEADERS,
  RECORD_PAGE_CSP,
} from '../../lib/flight-log-shared.mjs';

const ID_PATTERN = /^[1-9]\d*$/;

function eventLabel(event) {
  return event === 'ground_arrival' ? 'Ground arrival' : 'Ground departure';
}

function renderRecord(sighting, paired, requestUrl, generatedAtIso) {
  const badge = escapeHtml(eventLabel(sighting.event));
  const pairedLine =
    paired == null
      ? 'No paired arrival/departure on file.'
      : `Paired with <a href="/flight-log/record/${paired.id}">${escapeHtml(eventLabel(paired.event))} #${paired.id}</a> at ${escapeHtml(paired.eventAtUtc)}.`;

  const caveats = [CAVEATS.pollingGranularity, CAVEATS.airportLabeling, CAVEATS.callsignMatch, PAIRING_CAVEAT]
    .map((c) => `<p>${escapeHtml(c)}</p>`)
    .join('\n      ');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="index, follow">
<title>Flight sighting #${sighting.id} — flockoffmn</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 2rem 1.25rem 3rem;
    background: #0a0c10;
    color: #e7ecf3;
    font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
    line-height: 1.5;
  }
  main { max-width: 40rem; margin: 0 auto; }
  header { margin-bottom: 1.5rem; }
  h1 { font-size: 1.375rem; margin: 0 0 0.5rem; }
  .badge {
    display: inline-block;
    padding: 0.15rem 0.6rem;
    border-radius: 999px;
    border: 1px solid #2a3140;
    background: #161a23;
    color: #f5a524;
    font-size: 0.8rem;
    font-weight: 600;
  }
  dl { display: grid; grid-template-columns: 10rem 1fr; gap: 0.5rem 1rem; margin: 1.5rem 0; }
  dt { color: #7c8798; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.03em; }
  dd { margin: 0; color: #e7ecf3; }
  .paired {
    margin: 1.25rem 0;
    padding: 0.75rem 1rem;
    border: 1px solid #2a3140;
    border-radius: 0.5rem;
    background: #11141b;
    font-size: 0.9rem;
  }
  .confidence {
    margin: 1.5rem 0 0.5rem;
    color: #fbbf24;
    font-weight: 600;
    font-size: 0.9rem;
  }
  .caveats p {
    color: #a3adbd;
    font-size: 0.825rem;
    margin: 0.4rem 0;
  }
  footer {
    margin-top: 2rem;
    padding: 1rem 1.25rem;
    border: 1px solid #2a3140;
    border-radius: 0.5rem;
    background: #161a23;
    font-size: 0.825rem;
    color: #a3adbd;
  }
  footer p { margin: 0.35rem 0; }
  .not-legal-advice { font-weight: 600; color: #e7ecf3; }
  .custody { margin-top: 1rem; font-size: 0.75rem; color: #7c8798; }
  .links { margin-top: 1.5rem; display: flex; gap: 1rem; flex-wrap: wrap; font-size: 0.9rem; }
  a { color: #f5a524; }
  a:focus-visible, a:hover { text-decoration: underline; }
</style>
</head>
<body>
<main>
  <header>
    <h1>Flight sighting #${sighting.id}</h1>
    <span class="badge">${badge}</span>
  </header>

  <dl>
    <dt>Event</dt><dd>${badge}</dd>
    <dt>When (UTC)</dt><dd>${escapeHtml(sighting.eventAtUtc)}</dd>
    <dt>Callsign</dt><dd>${sighting.callsign ? escapeHtml(sighting.callsign) : '—'}</dd>
    <dt>Hex</dt><dd>${escapeHtml(sighting.hex)}</dd>
    <dt>Aircraft type</dt><dd>${sighting.aircraftType ? escapeHtml(sighting.aircraftType) : '—'}</dd>
    <dt>Airport</dt><dd>${sighting.airportIcao ? escapeHtml(sighting.airportIcao) : 'Unknown (best-effort, MN-only)'}</dd>
    <dt>Lat/Lon</dt><dd>${sighting.lat != null && sighting.lon != null ? `${escapeHtml(String(sighting.lat))}, ${escapeHtml(String(sighting.lon))}` : '—'}</dd>
    <dt>Ground duration</dt><dd>${escapeHtml(formatDuration(sighting.groundDurationS))}</dd>
  </dl>

  <div class="paired">${pairedLine}</div>

  <p class="confidence">Confidence: reported</p>
  <div class="caveats">
      ${caveats}
  </div>

  <footer>
    <p>Source: <a href="https://adsb.lol/">adsb.lol</a></p>
    <p>License: ODbL 1.0 — attribution required</p>
    <p>Contains information from adsb.lol, which is made available here under the Open Database License (ODbL).</p>
    <p class="not-legal-advice">This is not legal advice.</p>
    <p class="custody">Generated ${escapeHtml(generatedAtIso)} &middot; Canonical URL: ${escapeHtml(requestUrl)}</p>
  </footer>

  <div class="links">
    <a href="/flight-log/record/${sighting.id}/pdf">Download as PDF</a>
    <a href="/flight-log">&larr; Back to flight log search</a>
    <a href="/api/flight-log/${sighting.hex}">View as JSON</a>
  </div>
</main>
</body>
</html>`;
}

export async function onRequestGet(context) {
  const rawId = String(context.params.id ?? '');
  if (!ID_PATTERN.test(rawId)) {
    return errorPage(400, 'Invalid sighting id', 'The sighting id in this URL is not a valid positive integer.');
  }

  let result;
  try {
    result = await getSightingWithPairing(context.env.FLIGHT_SIGHTINGS_DB, rawId);
  } catch (err) {
    return errorPage(500, 'Something went wrong', 'This record could not be loaded right now. Please try again shortly.');
  }

  if (!result) {
    return errorPage(404, 'Sighting not found', `No flight sighting record exists with id ${rawId}.`);
  }

  const sighting = toExport(result.row);
  const paired = result.paired ? toExport(result.paired) : null;
  const generatedAtIso = new Date().toISOString();
  const html = renderRecord(sighting, paired, context.request.url, generatedAtIso);

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=60',
      'Content-Security-Policy': RECORD_PAGE_CSP,
      ...SECURITY_HEADERS,
    },
  });
}

/**
 * PDF version of the same citation record as ../[id].js — chosen over
 * browser print-to-PDF for output consistent regardless of the reader's
 * browser (per the plan). This is the project's first Function-side npm
 * import: every other Function import is relative-path-only. pdf-lib and
 * its transitive deps (pako, tslib, @pdf-lib/standard-fonts,
 * @pdf-lib/upng) were confirmed to use no Node built-ins, so this does NOT
 * require `nodejs_compat` in wrangler.jsonc — do not add that flag
 * preemptively.
 *
 * Error responses (400/404/500) are plain text, not a generated PDF — not
 * worth the extra pdf-lib code path for an error case nobody cites.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  getSightingWithPairing,
  toExport,
  formatDuration,
  CAVEATS,
  PAIRING_CAVEAT,
  SECURITY_HEADERS,
} from '../../../lib/flight-log-shared.mjs';

const ID_PATTERN = /^[1-9]\d*$/;
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 54;

function plainText(status, message) {
  return new Response(message, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS },
  });
}

function eventLabel(event) {
  return event === 'ground_arrival' ? 'Ground arrival' : 'Ground departure';
}

/** pdf-lib doesn't auto-wrap text — measure and break lines to fit maxWidth. */
function wrapText(font, text, size, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

async function buildPdf(sighting, paired, requestUrl, generatedAtIso) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const ink = rgb(0.06, 0.08, 0.1);
  const gray = rgb(0.4, 0.43, 0.48);
  const amber = rgb(0.75, 0.5, 0.05);

  let y = PAGE_HEIGHT - MARGIN;

  page.drawText(`Flight sighting record #${sighting.id}`, { x: MARGIN, y, size: 18, font: bold, color: ink });
  y -= 22;
  page.drawText('flockoffmn.org — civic flight-sighting log', { x: MARGIN, y, size: 10, font, color: gray });
  y -= 14;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 1,
    color: gray,
  });
  y -= 24;

  const fields = [
    ['Event', eventLabel(sighting.event)],
    ['When (UTC)', sighting.eventAtUtc],
    ['Callsign', sighting.callsign ?? '—'],
    ['Hex', sighting.hex],
    ['Aircraft type', sighting.aircraftType ?? '—'],
    ['Airport', sighting.airportIcao ?? 'Unknown (best-effort, MN-only)'],
    ['Lat/Lon', sighting.lat != null && sighting.lon != null ? `${sighting.lat}, ${sighting.lon}` : '—'],
    ['Ground duration', formatDuration(sighting.groundDurationS)],
  ];

  const labelSize = 9;
  const valueSize = 11;
  const lineHeight = 18;
  const labelX = MARGIN;
  const valueX = MARGIN + 130;

  for (const [label, value] of fields) {
    page.drawText(label.toUpperCase(), { x: labelX, y, size: labelSize, font: bold, color: gray });
    page.drawText(String(value), { x: valueX, y, size: valueSize, font, color: ink });
    y -= lineHeight;
  }

  y -= 8;
  const pairedLine =
    paired == null
      ? 'No paired arrival/departure on file.'
      : `Paired with ${eventLabel(paired.event)} #${paired.id} at ${paired.eventAtUtc}.`;
  page.drawText(pairedLine, { x: MARGIN, y, size: 10, font, color: ink });
  y -= 20;

  page.drawText('Confidence: reported', { x: MARGIN, y, size: 11, font: bold, color: amber });
  y -= 20;

  const caveats = [CAVEATS.pollingGranularity, CAVEATS.airportLabeling, CAVEATS.callsignMatch, PAIRING_CAVEAT];
  const maxWidth = PAGE_WIDTH - MARGIN * 2;
  for (const caveat of caveats) {
    const lines = wrapText(font, caveat, 8.5, maxWidth);
    for (const line of lines) {
      page.drawText(line, { x: MARGIN, y, size: 8.5, font, color: gray });
      y -= 11;
    }
    y -= 5;
  }

  y -= 6;
  const boxHeight = 22;
  page.drawRectangle({
    x: MARGIN,
    y: y - boxHeight + 8,
    width: maxWidth,
    height: boxHeight,
    borderColor: gray,
    borderWidth: 1,
  });
  page.drawText('This is not legal advice.', { x: MARGIN + 8, y: y - 8, size: 10, font: bold, color: ink });
  y -= boxHeight + 16;

  page.drawText(`Generated ${generatedAtIso}`, { x: MARGIN, y, size: 8, font, color: gray });
  y -= 11;
  page.drawText(`Canonical URL: ${requestUrl}`, { x: MARGIN, y, size: 8, font, color: gray });

  return doc.save();
}

export async function onRequestGet(context) {
  const rawId = String(context.params.id ?? '');
  if (!ID_PATTERN.test(rawId)) {
    return plainText(400, 'Invalid sighting id: must be a positive integer.');
  }

  let result;
  try {
    result = await getSightingWithPairing(context.env.FLIGHT_SIGHTINGS_DB, rawId);
  } catch (err) {
    return plainText(500, 'This record could not be loaded right now. Please try again shortly.');
  }

  if (!result) {
    return plainText(404, `No flight sighting record exists with id ${rawId}.`);
  }

  const sighting = toExport(result.row);
  const paired = result.paired ? toExport(result.paired) : null;
  const generatedAtIso = new Date().toISOString();

  let pdfBytes;
  try {
    pdfBytes = await buildPdf(sighting, paired, context.request.url, generatedAtIso);
  } catch (err) {
    return plainText(500, 'This record could not be rendered as a PDF right now. Please try again shortly.');
  }

  return new Response(pdfBytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="flight-sighting-${sighting.id}.pdf"`,
      ...SECURITY_HEADERS,
    },
  });
}

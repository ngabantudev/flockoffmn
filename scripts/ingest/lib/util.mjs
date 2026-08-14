// Shared helpers for the ingest pipeline.
//
// Deliberately dependency-free. Everything here runs against public data with
// no API keys, so a fork can reproduce every dataset in the repo with nothing
// but Node and a network connection.

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const PUBLIC_DATA = path.join(ROOT, 'public/data');

export const USER_AGENT =
  'flockoff-ingest/0.1 (open-source civic transparency project; contact via repository issues)';

export function log(scope, msg) {
  console.log(`[${scope}] ${msg}`);
}

/** Fetch with retries and a timeout. Returns a Response. */
export async function fetchWithRetry(url, { retries = 3, timeoutMs = 60_000, ...init } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT, ...(init.headers ?? {}) },
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (attempt < retries) {
        const wait = 2 ** attempt * 1000;
        log('http', `${url} failed (${err.message}); retrying in ${wait}ms`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  throw new Error(`fetch failed after ${retries + 1} attempts: ${url} — ${lastError?.message}`);
}

/* ------------------------------------------------------------------ *
 * Overpass
 *
 * Public Overpass instances are volunteer-run and routinely 504 under load, so
 * every query walks a list of mirrors rather than failing on the first one.
 * ------------------------------------------------------------------ */

const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.osm.jp/api/interpreter',
];

/**
 * How long to wait after a failed attempt, doubling per attempt across the
 * whole mirror walk rather than resetting per mirror.
 *
 * Without this, a rate-limited run retried four mirrors twice each in under a
 * minute of actual waiting and reported "all Overpass mirrors failed" — which
 * reads like every mirror is down when the real answer is that we asked too
 * fast. Backing off is also the polite behaviour towards volunteer-run
 * infrastructure this project depends on and does not pay for.
 */
const OVERPASS_BACKOFF_MS = 5_000;
const OVERPASS_MAX_BACKOFF_MS = 60_000;

/** POST an Overpass QL query, trying each mirror in turn. Returns parsed JSON. */
export async function queryOverpass(scope, query, { retries = 1, timeoutMs = 190_000 } = {}) {
  let lastError;
  let failures = 0;
  for (const mirror of OVERPASS_MIRRORS) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        log(scope, `querying ${new URL(mirror).host} (attempt ${attempt + 1}/${retries + 1})`);
        const res = await fetch(mirror, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': USER_AGENT,
          },
          body: `data=${encodeURIComponent(query)}`,
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch (err) {
        clearTimeout(timer);
        lastError = err;
        log(scope, `  ${new URL(mirror).host} failed: ${err.message}`);
        failures++;
        const isLast = mirror === OVERPASS_MIRRORS.at(-1) && attempt === retries;
        if (!isLast) {
          const wait = Math.min(OVERPASS_BACKOFF_MS * 2 ** (failures - 1), OVERPASS_MAX_BACKOFF_MS);
          log(scope, `  waiting ${Math.round(wait / 1000)}s before the next attempt`);
          await new Promise((r) => setTimeout(r, wait));
        }
      }
    }
  }
  throw new Error(
    `all Overpass mirrors failed after ${failures} attempts — last error: ${lastError?.message}`,
  );
}

/* ------------------------------------------------------------------ *
 * ArcGIS feature services
 *
 * Half the layers here come from an ArcGIS REST endpoint, and every one of
 * them needs the same two things: how many records the service holds, and all
 * of them in pages. That was three private copies before this existed
 * (aadt.mjs, data-centers.mjs, holc-detail.mjs), and the copies had already
 * drifted — one guards the reported count, one interpolates a bare `null` into
 * its progress log, and only one refuses to publish when the pages do not add
 * up to the total. A partial layer is the worst failure this pipeline has:
 * missing ground reads as absence of the thing, not as a broken download.
 * ------------------------------------------------------------------ */

/** How many records a service reports. Throws rather than return a soft null. */
export async function arcgisCount(service, { timeoutMs = 45_000 } = {}) {
  const params = new URLSearchParams({ where: '1=1', returnCountOnly: 'true', f: 'json' });
  const res = await fetchWithRetry(`${service}/query?${params}`, { timeoutMs });
  const { count } = await res.json();
  if (!Number.isFinite(count)) throw new Error(`${service} did not report a record count`);
  return count;
}

/**
 * Page through a service and return the features.
 *
 * A short page is not proof of the end: if the server's own `maxRecordCount`
 * is below `pageSize` then every page is short, and a run that stopped at the
 * first one would publish a fraction of the layer. So `exceededTransferLimit`
 * is honoured where the service sends it, and callers that pass `expected`
 * get the total verified before anything is written.
 *
 * @param {string} scope       log prefix
 * @param {string} service     feature service layer URL, without `/query`
 * @param {object} opts
 * @param {Record<string,string>} opts.params  query params beyond paging
 * @param {number} opts.pageSize
 * @param {number|null} opts.expected  record count to verify against, if known
 */
export async function arcgisQueryAll(
  scope,
  service,
  { params = {}, pageSize = 1000, expected = null, timeoutMs = 120_000 } = {},
) {
  const out = [];
  for (let offset = 0; ; offset += pageSize) {
    const query = new URLSearchParams({
      where: '1=1',
      f: 'geojson',
      ...params,
      resultRecordCount: String(pageSize),
      resultOffset: String(offset),
    });
    const res = await fetchWithRetry(`${service}/query?${query}`, { timeoutMs });
    const page = await res.json();
    const got = page?.features ?? [];
    out.push(...got);
    log(scope, `  fetched ${out.length}${expected === null ? '' : `/${expected}`}`);
    if (!got.length) break;
    if (!page?.properties?.exceededTransferLimit && got.length < pageSize) break;
  }
  if (expected !== null && out.length !== expected) {
    throw new Error(
      `fetched ${out.length} records but ${service} reports ${expected} — refusing to publish a partial layer`,
    );
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Minimal ZIP reader
 *
 * Census and ICE both ship data as .zip/.xlsx. Rather than take on a
 * spreadsheet dependency (large surface area, historically CVE-prone) we
 * read the archive directly: locate the central directory, then inflate
 * the one member we want. Handles stored (0) and deflated (8) entries,
 * which is all either producer emits.
 * ------------------------------------------------------------------ */

/** @returns {Map<string, Buffer>} member name -> uncompressed bytes */
export function unzip(buffer) {
  const eocdSig = 0x06054b50;
  let eocd = -1;
  // The EOCD sits at the end, after an optional comment of up to 64 KiB.
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65_557); i--) {
    if (buffer.readUInt32LE(i) === eocdSig) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error('not a zip archive: no end-of-central-directory record');

  const entryCount = buffer.readUInt16LE(eocd + 10);
  let ptr = buffer.readUInt32LE(eocd + 16);
  const out = new Map();

  for (let i = 0; i < entryCount; i++) {
    if (buffer.readUInt32LE(ptr) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(ptr + 10);
    const compressedSize = buffer.readUInt32LE(ptr + 20);
    const nameLen = buffer.readUInt16LE(ptr + 28);
    const extraLen = buffer.readUInt16LE(ptr + 30);
    const commentLen = buffer.readUInt16LE(ptr + 32);
    const localOffset = buffer.readUInt32LE(ptr + 42);
    const name = buffer.toString('utf8', ptr + 46, ptr + 46 + nameLen);

    // Re-read the lengths from the local header: the central directory's copy
    // of the extra field can differ in size from the local one.
    const localNameLen = buffer.readUInt16LE(localOffset + 26);
    const localExtraLen = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const raw = buffer.subarray(dataStart, dataStart + compressedSize);

    out.set(name, method === 0 ? Buffer.from(raw) : zlib.inflateRawSync(raw));
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Minimal XLSX reader
 * ------------------------------------------------------------------ */

const XML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
/**
 * Decode XML/HTML entities, named and numeric alike. Exported because the
 * scrapers need it too: a CMS that writes `&#x27;` in one field and `&#39;` in
 * another is writing the same character, and an agency name that keeps its
 * entity undecoded silently fails the name join three layers hang on.
 */
export function decodeXml(s) {
  return s.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (_, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return String.fromCodePoint(code);
    }
    return XML_ENTITIES[e];
  });
}

/** Concatenate the text of every <t> element inside a chunk of XML. */
function textOf(xml) {
  const parts = [];
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t\s*\/>/g;
  let m;
  while ((m = re.exec(xml))) parts.push(decodeXml(m[1] ?? ''));
  return parts.join('');
}

function columnOf(ref) {
  const m = /^([A-Z]+)/.exec(ref);
  return m ? m[1] : '';
}

/**
 * Read the first worksheet of an xlsx into an array of row objects keyed by
 * column letter, plus the header row.
 *
 * Hyperlinks are returned separately: ICE stores the MOA column as a link
 * whose display text is the word "link", so the URL only exists in the
 * worksheet relationships and would otherwise be lost.
 *
 * @returns {{header: Record<string,string>, rows: Record<string,string>[],
 *            links: Map<string,string>}}
 */
export function readXlsx(buffer) {
  const files = unzip(buffer);
  const sharedXml = files.get('xl/sharedStrings.xml');
  const shared = [];
  if (sharedXml) {
    const xml = sharedXml.toString('utf8');
    const re = /<si>([\s\S]*?)<\/si>/g;
    let m;
    while ((m = re.exec(xml))) shared.push(textOf(m[1]));
  }

  const sheetName =
    [...files.keys()].find((n) => /^xl\/worksheets\/sheet1\.xml$/.test(n)) ??
    [...files.keys()].find((n) => /^xl\/worksheets\/.*\.xml$/.test(n));
  if (!sheetName) throw new Error('xlsx contains no worksheet');
  const sheet = files.get(sheetName).toString('utf8');

  // Resolve <hyperlink ref="G2" r:id="rId3"/> against the worksheet rels.
  const links = new Map();
  const relsName = sheetName.replace(/worksheets\/(.+)$/, 'worksheets/_rels/$1.rels');
  const relsBuf = files.get(relsName);
  if (relsBuf) {
    const relsXml = relsBuf.toString('utf8');
    const rels = new Map();
    const relRe = /<Relationship\s([^>]*)\/>/g;
    let relMatch;
    while ((relMatch = relRe.exec(relsXml))) {
      const id = /(?:^|\s)Id="([^"]+)"/.exec(relMatch[1])?.[1];
      const target = /(?:^|\s)Target="([^"]+)"/.exec(relMatch[1])?.[1];
      if (id && target) rels.set(id, decodeXml(target));
    }
    const hlRe = /<hyperlink\s([^>]*?)\/?>/g;
    let hlMatch;
    while ((hlMatch = hlRe.exec(sheet))) {
      // Anchor on start-or-space so `ref=` does not also match `xr:uid=`-style
      // prefixed attributes, and still matches the first attribute in the tag.
      const ref = /(?:^|\s)ref="([^"]+)"/.exec(hlMatch[1])?.[1];
      const rid = /(?:^|\s)r:id="([^"]+)"/.exec(hlMatch[1])?.[1];
      if (ref && rid && rels.has(rid)) links.set(ref, rels.get(rid));
    }
  }

  const rows = [];
  const rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch;
  while ((rowMatch = rowRe.exec(sheet))) {
    const cells = {};
    const cellRe = /<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cellMatch;
    while ((cellMatch = cellRe.exec(rowMatch[1]))) {
      const attrs = cellMatch[1];
      const body = cellMatch[2] ?? '';
      const refMatch = /r="([A-Z]+\d+)"/.exec(attrs);
      if (!refMatch) continue;
      const type = /t="([^"]+)"/.exec(attrs)?.[1];
      let value;
      if (type === 'inlineStr') {
        value = textOf(body);
      } else {
        const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
        if (v == null) continue;
        value = type === 's' ? (shared[Number(v)] ?? '') : decodeXml(v);
      }
      cells[columnOf(refMatch[1])] = value.trim();
      // Keep the sheet row number so callers can resolve hyperlinks by cell ref.
      cells.__row ??= /(\d+)$/.exec(refMatch[1])?.[1];
    }
    rows.push(cells);
  }

  const [header, ...data] = rows;
  return { header: header ?? {}, rows: data, links };
}

/** Excel serial date -> ISO yyyy-mm-dd. Excel's epoch is 1899-12-30. */
export function excelDate(serial) {
  const n = Number(serial);
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = Date.UTC(1899, 11, 30) + n * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ *
 * Output
 * ------------------------------------------------------------------ */

/**
 * Write a LayerCollection (see src/layers/types.ts) plus a flat CSV twin.
 * Provenance is embedded in the file itself so a download stays attributable
 * once it is detached from the site (spec F9).
 */
export async function writeLayer(slug, { layer, provenance, knownGaps = [], features }) {
  await mkdir(PUBLIC_DATA, { recursive: true });

  const collection = {
    type: 'FeatureCollection',
    metadata: {
      layer,
      schema: 'https://github.com/ngabantudev/flockoffmn/blob/main/src/layers/types.ts',
      featureCount: features.length,
      knownGaps,
      ...provenance,
      lastUpdated: new Date().toISOString(),
    },
    features,
  };

  const geojsonPath = path.join(PUBLIC_DATA, `${slug}.geojson`);

  /*
   * Leave the file alone when only the clock moved.
   *
   * `lastUpdated` is stamped on every run, so re-running the ingest always
   * produced a different file even when the publisher had issued nothing —
   * and the weekly refresh workflow decides whether to open a pull request by
   * asking `git diff --quiet -- public/data`, which could therefore never be
   * quiet. Every week committed a fresh copy of every layer to say that
   * nothing had changed. That was affordable while the largest file was under
   * two megabytes; a 20 MB road layer makes it hundreds of megabytes of
   * history a year, and git history does not get smaller later.
   *
   * So the comparison ignores the timestamp. If everything else is byte-for-
   * byte identical the file is left exactly as it is, `lastUpdated` keeps the
   * date the data itself last moved, and the workflow's diff stays quiet
   * because there is genuinely nothing to report.
   */
  const withoutClock = (doc) => {
    const { lastUpdated: _ignored, ...rest } = doc.metadata;
    return JSON.stringify({ ...doc, metadata: rest });
  };
  let unchanged = false;
  try {
    const previous = JSON.parse(await readFile(geojsonPath, 'utf8'));
    unchanged = withoutClock(previous) === withoutClock(collection);
    if (unchanged) collection.metadata.lastUpdated = previous.metadata.lastUpdated;
  } catch {
    // No previous file, or one we cannot parse. Write a fresh one.
  }

  if (unchanged) {
    log(slug, `${features.length} features, unchanged since ${collection.metadata.lastUpdated}`);
    return collection;
  }

  await writeFile(geojsonPath, JSON.stringify(collection));
  log(slug, `wrote ${features.length} features -> public/data/${slug}.geojson`);

  // CSV twin for points only; polygons do not flatten usefully.
  if (features.length && features[0].geometry.type === 'Point') {
    const attrKeys = [...new Set(features.flatMap((f) => Object.keys(f.properties.attributes)))];
    const cols = ['id', 'name', 'county', 'state', 'countyFips', 'lat', 'lng', 'confidence', 'sourceDate', ...attrKeys];
    const esc = (v) => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [cols.join(',')];
    for (const f of features) {
      const p = f.properties;
      const [lng, lat] = f.geometry.coordinates;
      lines.push(
        [
          p.id, p.name, p.county, p.state, p.countyFips, lat, lng, p.confidence, p.sourceDate,
          ...attrKeys.map((k) => p.attributes[k]),
        ].map(esc).join(','),
      );
    }
    await writeFile(path.join(PUBLIC_DATA, `${slug}.csv`), lines.join('\n'));
    log(slug, `wrote public/data/${slug}.csv`);
  }

  return collection;
}

/**
 * Trim a value to a non-empty string, or null.
 *
 * The plainest of the trim-to-null helpers, and the one most scripts want. It
 * treats only whitespace as empty — the variants that also read "-", "n/a" or
 * "none" as empty encode a specific publisher's habits and stay local to the
 * script that met that publisher.
 */
export function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Drop the keys with nothing in them.
 *
 * A null attribute still costs its key and six bytes of `":null,"` in the
 * file, and every consumer here — the filter builder, the detail panel, the
 * map's own expressions — already treats a missing key and a null one the
 * same way. On a layer with tens of thousands of records that is most of a
 * megabyte to say nothing, which the browser then parses before it can draw.
 */
export function without(attributes) {
  return Object.fromEntries(Object.entries(attributes).filter(([, v]) => v !== null));
}

/**
 * Write a reference file: an index other ingests read, not a map layer.
 *
 * Shares writeLayer's rule about the clock, and for the same reason — the
 * weekly refresh workflow decides whether to open a pull request by asking
 * `git diff --quiet -- public/data`, so a file that restamps `lastUpdated` on
 * every run makes that diff permanently noisy and commits a fresh copy each
 * week to report that nothing changed.
 */
export async function writeReference(relPath, { metadata, ...payload }) {
  const target = path.join(PUBLIC_DATA, relPath);
  await mkdir(path.dirname(target), { recursive: true });

  const doc = { metadata: { ...metadata, lastUpdated: new Date().toISOString() }, ...payload };
  const withoutClock = ({ metadata: { lastUpdated: _ignored, ...meta }, ...rest }) =>
    JSON.stringify({ metadata: meta, ...rest });

  try {
    const previous = JSON.parse(await readFile(target, 'utf8'));
    if (withoutClock(previous) === withoutClock(doc)) {
      log(relPath, `unchanged since ${previous.metadata.lastUpdated}`);
      return previous;
    }
  } catch {
    // No previous file, or one we cannot parse. Write a fresh one.
  }

  await writeFile(target, JSON.stringify(doc));
  log(relPath, `wrote public/data/${relPath}`);
  return doc;
}

/** Load the county reference index built by counties.mjs. */
export async function loadCounties() {
  return loadPublicJson('reference/mn-counties.geojson', { runFirst: 'npm run data:counties' });
}

/** Normalise "St. Louis County" / "ST LOUIS CO." / "Saint Louis" -> "st louis". */
export function normaliseCounty(name) {
  return (name ?? '')
    .toLowerCase()
    .replace(/\bcounty\b|\bco\.?\b|\bparish\b|\bborough\b/g, '')
    // "Saint" and "St." are the same county spelled two ways, and publishers
    // disagree: the Census writes "St. Louis", MnDOT writes "Saint Louis". Fold
    // the long form first or the abbreviation rule below never sees it — that
    // gap silently cost 2,194 road segments their county on first ingest.
    .replace(/\bsaint\b/g, 'st')
    .replace(/\bst\.?\b/g, 'st')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fold "St." vs "Saint", "Department", "Office" and "Public Safety" so MESB's
 * 911-routing name, the BCA's legal-name style, and the U-Spatial building
 * inventory's name all land on the same key.
 *
 * Same shape as normaliseCounty above, different vocabulary — and NOT
 * interchangeable with it: normaliseCounty strips `\bcounty\b`, which would
 * destroy "Dakota County Sheriff". The jurisdiction ↔ building ↔ BCA-filing
 * join that every agency layer hangs on is computed here, once, because three
 * scripts performing the same join with three private copies is how the copies
 * drift apart without anyone noticing.
 */
export function normaliseAgency(name) {
  return (name ?? '')
    .toLowerCase()
    .replace(/'s\b/g, '')
    .replace(/\bdepartment\b/g, '')
    .replace(/\boffice\b/g, '')
    .replace(/\bof\b/g, '')
    .replace(/\bpublic safety\b/g, 'police')
    .replace(/\bsaint\b/g, 'st')
    .replace(/\bst\.?\b/g, 'st')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Coarse office type read off the plain-English tail of the agency's own
 * published name. Not an assertion about the agency beyond what its name says.
 *
 * Shared so a polygon and the buildings inside it cannot disagree about what
 * kind of agency they describe — an invariant a second copy cannot hold, and
 * did not: the two private copies of this function had already drifted on
 * `army|military` before they were merged here. The value drives a user-facing
 * filter and the registry's markerIcon.byValue glyph choice, so a divergence
 * is visible on the map.
 */
export function agencyType(name) {
  if (/national guard|air force|army|military/i.test(name)) return 'Military';
  if (/sheriff/i.test(name)) return 'Sheriff';
  if (/police|public safety/i.test(name)) return 'Police';
  return 'Other';
}

/**
 * Read a JSON file out of public/data/, with an error that names the ingest to
 * run instead of a bare ENOENT. `optional` returns null for a missing file —
 * for a cross-reference whose absence should degrade one field rather than
 * fail the whole build over an unrelated script's output.
 */
export async function loadPublicJson(relPath, { optional = false, runFirst } = {}) {
  const p = path.join(PUBLIC_DATA, relPath);
  if (!existsSync(p)) {
    if (optional) return null;
    throw new Error(`${relPath} missing — run \`${runFirst ?? 'npm run data'}\` first`);
  }
  try {
    return JSON.parse(await readFile(p, 'utf8'));
  } catch (err) {
    if (optional) return null;
    throw err;
  }
}

/**
 * Round a coordinate ring to ~1 m and drop vertices the rounding made
 * identical. Upstream services publish full IEEE-754 precision — 15
 * significant digits, roughly a nanometre — on boundaries that were never
 * authored anywhere near that finely, and every one of those digits is bytes
 * a visitor on a phone pays for. 5 decimal places is ~1.1 m.
 */
export function thinRing(ring) {
  const out = [];
  for (const [lng, lat] of ring) {
    const p = [Math.round(lng * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5];
    const last = out.at(-1);
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  return out;
}

/**
 * thinRing applied through whatever nesting a GeoJSON geometry uses. Points
 * are returned untouched — a single coordinate pair is not where the bytes
 * are, and rounding it would move a mapped location for no gain.
 */
export function thinGeometry(geometry) {
  if (!geometry) return geometry;
  const { type, coordinates } = geometry;
  if (type === 'LineString' || type === 'MultiPoint') {
    return { ...geometry, coordinates: thinRing(coordinates) };
  }
  if (type === 'Polygon' || type === 'MultiLineString') {
    return { ...geometry, coordinates: coordinates.map(thinRing) };
  }
  if (type === 'MultiPolygon') {
    return { ...geometry, coordinates: coordinates.map((poly) => poly.map(thinRing)) };
  }
  return geometry;
}

export function slugId(...parts) {
  return parts
    .filter(Boolean)
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

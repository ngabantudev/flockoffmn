#!/usr/bin/env node
// scripts/fetch-flock-cameras.mjs
//
// Pulls ALPR (Flock-style) camera nodes tagged in OpenStreetMap by DeFlock
// volunteers, scoped to Minnesota via its OSM administrative boundary.
// ODbL-licensed data, no API key. The public Overpass instances are
// volunteer-run and routinely return 504s under load, so this tries a
// short list of mirrors in order rather than failing on the first one.
//
// Output: data/raw/flock-cameras.geojson (Point FeatureCollection)

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, "../data/raw/flock-cameras.geojson");

const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
];

const USER_AGENT =
  "get-flocked-etl/0.1 (+https://github.com/NgabantuDev; one-off data pull)";

// Matches DeFlock's documented OSM tagging convention: man_made=surveillance,
// surveillance:type=ALPR, manufacturer=Flock Safety (manufacturer omitted
// from the filter since not every contributor sets it).
const QUERY = `
[out:json][timeout:120];
area["ISO3166-2"="US-MN"]["admin_level"="4"]->.mn;
(
  node["surveillance:type"="ALPR"](area.mn);
);
out body;
`.trim();

async function queryOverpass(query, { retries = 2, timeoutMs = 130_000 } = {}) {
  let lastError;
  for (const mirror of OVERPASS_MIRRORS) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        console.log(
          `[overpass] querying ${mirror} (attempt ${attempt + 1}/${retries + 1})...`,
        );
        const res = await fetch(mirror, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": USER_AGENT,
          },
          body: `data=${encodeURIComponent(query)}`,
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (!res.ok) {
          throw new Error(`HTTP ${res.status} ${res.statusText}`);
        }
        const json = await res.json();
        return json;
      } catch (err) {
        clearTimeout(timer);
        lastError = err;
        console.warn(`[overpass] ${mirror} failed: ${err.message ?? err}`);
        if (attempt < retries) {
          const backoffMs = 3000 * (attempt + 1);
          await new Promise((r) => setTimeout(r, backoffMs));
        }
      }
    }
  }
  throw new Error(
    `All Overpass mirrors failed. Last error: ${lastError?.message ?? lastError}`,
  );
}

function nodesToGeoJson(elements) {
  const features = elements
    .filter((el) => el.type === "node" && typeof el.lon === "number")
    .map((el) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [el.lon, el.lat] },
      properties: {
        osm_id: el.id,
        ...el.tags,
      },
    }));

  return { type: "FeatureCollection", features };
}

async function main() {
  const result = await queryOverpass(QUERY);
  const elements = result.elements ?? [];
  console.log(`[overpass] received ${elements.length} node(s)`);

  const geojson = nodesToGeoJson(elements);

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(geojson));
  console.log(
    `[done] wrote ${geojson.features.length} camera feature(s) to ${OUTPUT_PATH}`,
  );
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});

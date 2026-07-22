#!/usr/bin/env node
// scripts/fetch-city-wards.mjs
//
// Pulls city council ward boundaries from each city's own open-data
// portal and normalizes them into one FeatureCollection. Only Minneapolis
// (the only MN city we've sourced a direct export for so far) is wired up
// — most MN cities don't have a ward system at all, and the ones that do
// each publish through their own ArcGIS/Socrata instance, so add sources
// here one at a time as they're found rather than assuming a statewide
// dataset exists.
//
// Output: data/raw/city-wards.geojson (Polygon FeatureCollection)

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, "../data/raw/city-wards.geojson");

const WARD_SOURCES = [
  {
    city: "Minneapolis",
    // ArcGIS Hub's dataset-slug download alias; resolves to a versioned
    // /api/download/v1/items/{itemId}/geojson redirect under the hood.
    url: "https://hub.arcgis.com/datasets/cityoflakes::city-council-wards.geojson",
    // Source field holding the ward number (varies feed formats say
    // "Ward" or "WARD_NUM" — this dataset uses BDNUM).
    wardField: "BDNUM",
  },
];

async function fetchWards(source) {
  console.log(`[wards] fetching ${source.city} from ${source.url}`);
  const res = await fetch(source.url, {
    headers: { "User-Agent": "get-flocked-etl/0.1" },
  });
  if (!res.ok) {
    throw new Error(`${source.city}: HTTP ${res.status} ${res.statusText}`);
  }
  const geojson = await res.json();
  const features = (geojson.features ?? []).map((feature) => ({
    ...feature,
    properties: {
      city: source.city,
      ward: feature.properties?.[source.wardField] ?? null,
    },
  }));
  console.log(`[wards] ${source.city}: ${features.length} ward(s)`);
  return features;
}

async function main() {
  const allFeatures = [];
  for (const source of WARD_SOURCES) {
    const features = await fetchWards(source);
    allFeatures.push(...features);
  }

  const geojson = { type: "FeatureCollection", features: allFeatures };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(geojson));
  console.log(
    `[done] wrote ${allFeatures.length} ward feature(s) to ${OUTPUT_PATH}`,
  );
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});

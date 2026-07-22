#!/usr/bin/env -S npx tsx
// scripts/backfill-dedup-and-precision.ts
//
// One-time production backfill for two changes that shipped after rows
// already existed in D1:
//   1. Broadened geocoding (src/lib/geocodeArticle.ts) — every article now
//      gets *some* location (city/state/unknown fallback), but rows
//      ingested before this change still have NULL lat/lon.
//   2. Cross-outlet dedup clustering (src/lib/dedupeMisuseReports.ts) — the
//      cluster_id column is brand new, so every existing row starts NULL.
//
// Only the article *title* is re-geocoded, not the original RSS
// description — misuse_reports never persisted the description column, so
// it isn't available to re-run against for old rows.
//
// This script is READ-ONLY against production: it pulls all rows, does the
// geocoding + clustering entirely in a local scratch SQLite file (reusing
// the real, tested locateArticle/clusterNewReports — not a reimplementation),
// diffs against the original snapshot, and writes an .sql file of UPDATEs.
// It does NOT apply anything to --remote itself — review the generated file,
// then apply it yourself:
//   npx wrangler d1 execute get-flocked-misuse-reports --remote --file=<path>
//
// Run with: npx tsx scripts/backfill-dedup-and-precision.ts

import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { locateArticle } from "../src/lib/geocodeArticle.ts";
import { clusterNewReports } from "../src/lib/dedupeMisuseReports.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_NAME = "get-flocked-misuse-reports";

interface Row {
  id: number;
  url: string;
  title: string;
  source: string;
  published_at: string;
  city: string | null;
  state: string | null;
  lat: number | null;
  lon: number | null;
  department: string | null;
  location_precision: string;
  cluster_id: number | null;
}

function fetchProductionRows(): Row[] {
  console.log(`Fetching all rows from ${DB_NAME} (--remote)...`);
  const output = execFileSync(
    "npx",
    ["wrangler", "d1", "execute", DB_NAME, "--remote", "--json", "--command", "SELECT * FROM misuse_reports"],
    { cwd: path.join(__dirname, ".."), encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 },
  );
  const parsed = JSON.parse(output);
  return parsed[0].results as Row[];
}

function makeD1Shim(sqlite: InstanceType<typeof DatabaseSync>) {
  return {
    prepare(sql: string) {
      const stmt = sqlite.prepare(sql);
      const withArgs = (args: unknown[]) => ({
        bind: (...moreArgs: unknown[]) => withArgs(moreArgs),
        all: async () => ({ results: stmt.all(...(args as any)) }),
        run: async () => stmt.run(...(args as any)),
        first: async () => stmt.get(...(args as any)),
      });
      return withArgs([]);
    },
    async batch(stmts: any[]) {
      for (const s of stmts) await s.run();
      return [];
    },
  };
}

function sqlLiteral(value: string | number | null): string {
  if (value === null) return "NULL";
  if (typeof value === "number") return String(value);
  return `'${value.replace(/'/g, "''")}'`;
}

async function main() {
  const rows = fetchProductionRows();
  console.log(`Fetched ${rows.length} rows.`);

  const scratchDir = mkdtempSync(path.join(tmpdir(), "flocked-backfill-"));
  const sqlite = new DatabaseSync(path.join(scratchDir, "scratch.sqlite"));
  sqlite.exec(`
    CREATE TABLE misuse_reports (
      id INTEGER PRIMARY KEY, url TEXT, title TEXT, source TEXT, published_at TEXT,
      city TEXT, state TEXT, lat REAL, lon REAL, department TEXT,
      location_precision TEXT, cluster_id INTEGER
    );
  `);

  const insert = sqlite.prepare(
    `INSERT INTO misuse_reports (id, url, title, source, published_at, city, state, lat, lon, department, location_precision, cluster_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
  );
  for (const r of rows) {
    // location_precision/cluster_id don't exist on production yet if
    // migration 0002 hasn't been applied there — default the same way the
    // migration itself would (location_precision defaults to 'city').
    insert.run(r.id, r.url, r.title, r.source, r.published_at, r.city, r.state, r.lat, r.lon, r.department, r.location_precision ?? "city");
  }

  const needsGeocode = rows.filter((r) => r.lat === null);
  console.log(`Re-geocoding ${needsGeocode.length} rows with no location (title only)...`);
  const updateGeo = sqlite.prepare(
    `UPDATE misuse_reports SET city = ?, state = ?, lat = ?, lon = ?, department = ?, location_precision = ? WHERE id = ?`,
  );
  for (const r of needsGeocode) {
    const loc = locateArticle(r.title);
    updateGeo.run(loc.city, loc.state, loc.lat, loc.lon, loc.department, loc.precision, r.id);
  }

  console.log("Clustering cross-outlet duplicates...");
  const db = makeD1Shim(sqlite);
  const { clustered } = await clusterNewReports(db as any);
  console.log(`Clustered ${clustered} rows.`);

  const finalRows = sqlite.prepare(`SELECT * FROM misuse_reports`).all() as unknown as Row[];
  const originalById = new Map(rows.map((r) => [r.id, r]));

  const updates: string[] = [];
  for (const r of finalRows) {
    const original = originalById.get(r.id)!;
    const changed =
      r.city !== original.city ||
      r.state !== original.state ||
      r.lat !== original.lat ||
      r.lon !== original.lon ||
      r.department !== original.department ||
      r.location_precision !== original.location_precision ||
      r.cluster_id !== original.cluster_id;
    if (!changed) continue;
    updates.push(
      `UPDATE misuse_reports SET city = ${sqlLiteral(r.city)}, state = ${sqlLiteral(r.state)}, ` +
        `lat = ${sqlLiteral(r.lat)}, lon = ${sqlLiteral(r.lon)}, department = ${sqlLiteral(r.department)}, ` +
        `location_precision = ${sqlLiteral(r.location_precision)}, cluster_id = ${sqlLiteral(r.cluster_id)} WHERE id = ${r.id};`,
    );
  }

  const outPath = path.join(__dirname, "..", "backfill-dedup-and-precision.sql");
  writeFileSync(outPath, updates.join("\n") + "\n");

  const clusterSizes = new Map<number, number>();
  for (const r of finalRows) clusterSizes.set(r.cluster_id!, (clusterSizes.get(r.cluster_id!) ?? 0) + 1);
  const duplicateClusters = [...clusterSizes.values()].filter((n) => n > 1).length;
  const stillUnresolved = finalRows.filter((r) => r.location_precision === "unknown").length;

  console.log(`\nWrote ${updates.length} UPDATE statements to ${outPath}`);
  console.log(`  - ${needsGeocode.length} rows re-geocoded (${stillUnresolved} landed on the "unknown" fallback tier)`);
  console.log(`  - ${duplicateClusters} duplicate clusters found (multiple outlets, same incident)`);
  console.log(`\nThis did NOT touch production. Review the file, then apply it yourself:`);
  console.log(`  npx wrangler d1 execute ${DB_NAME} --remote --file=${path.relative(process.cwd(), outPath)}`);
}

main();

// src/pages/api/misuse-reports.ts
//
// Runs on-demand (per request) rather than being built as a static file.
// Reads from D1 (populated on a schedule by src/lib/ingestMisuseReports.ts
// via the scheduled() handler in src/worker.ts) instead of hitting Google
// News RSS live — this is what makes the history persistent instead of
// capped at whatever window Google's feed currently exposes.

import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import type { MisuseReportItem } from "~/lib/misuseReports";

export const prerender = false;

const ALLOWED_WINDOWS = [1, 7, 30, 365]; // days

interface MisuseReportRow {
  id: number;
  title: string;
  url: string;
  source: string;
  published_at: string;
  city: string | null;
  state: string | null;
  lat: number;
  lon: number;
  department: string | null;
  location_precision: "city" | "state" | "unknown";
  cluster_size: number;
}

interface SiblingRow {
  cluster_id: number;
  title: string;
  url: string;
  source: string;
  published_at: string;
}

export const GET: APIRoute = async ({ url }) => {
  const requested = Number(url.searchParams.get("days"));
  const windowDays = ALLOWED_WINDOWS.includes(requested) ? requested : 7;
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  try {
    // Only canonical rows (one per real-world incident, see
    // src/lib/dedupeMisuseReports.ts) — cluster_size flags which ones have
    // other outlets' coverage attached below.
    const { results } = await env.DB.prepare(
      `SELECT m.id, m.title, m.url, m.source, m.published_at, m.city, m.state, m.lat, m.lon,
              m.department, m.location_precision,
              (SELECT COUNT(*) FROM misuse_reports WHERE cluster_id = m.cluster_id) as cluster_size
       FROM misuse_reports m
       WHERE m.id = m.cluster_id AND m.published_at >= ?
       ORDER BY m.published_at DESC
       LIMIT 500`,
    )
      .bind(cutoff)
      .all<MisuseReportRow>();

    const clusteredIds = results.filter((row) => row.cluster_size > 1).map((row) => row.id);
    const siblingsByCluster = new Map<number, SiblingRow[]>();
    if (clusteredIds.length > 0) {
      const placeholders = clusteredIds.map(() => "?").join(",");
      const { results: siblings } = await env.DB.prepare(
        `SELECT cluster_id, title, url, source, published_at
         FROM misuse_reports
         WHERE cluster_id IN (${placeholders}) AND id != cluster_id`,
      )
        .bind(...clusteredIds)
        .all<SiblingRow>();
      for (const sibling of siblings) {
        const bucket = siblingsByCluster.get(sibling.cluster_id);
        if (bucket) bucket.push(sibling);
        else siblingsByCluster.set(sibling.cluster_id, [sibling]);
      }
    }

    const newsItems: MisuseReportItem[] = results.map((row) => {
      const siblings = siblingsByCluster.get(row.id);
      return {
        title: row.title,
        url: row.url,
        source: row.source,
        published: row.published_at,
        location: {
          city: row.city,
          state: row.state,
          lat: row.lat,
          lon: row.lon,
          department: row.department,
          precision: row.location_precision,
        },
        relatedSources: siblings?.map((s) => ({
          title: s.title,
          url: s.url,
          source: s.source,
          published: s.published_at,
        })),
      };
    });

    // Longer windows change less often day-to-day, so give them a longer
    // cache; short windows stay near-live.
    const maxAge = windowDays >= 365 ? 3600 : 120;
    const sMaxAge = windowDays >= 365 ? 21600 : 300;

    return new Response(JSON.stringify({ newsItems, errorMessage: null }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${maxAge}, s-maxage=${sMaxAge}`,
      },
    });
  } catch (error) {
    console.error("[api/misuse-reports] D1 query failed", error);
    return new Response(
      JSON.stringify({ newsItems: [], errorMessage: "Reports temporarily unavailable." }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
};

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
  title: string;
  url: string;
  source: string;
  published_at: string;
  city: string | null;
  state: string | null;
  lat: number | null;
  lon: number | null;
  department: string | null;
}

export const GET: APIRoute = async ({ url }) => {
  const requested = Number(url.searchParams.get("days"));
  const windowDays = ALLOWED_WINDOWS.includes(requested) ? requested : 7;
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { results } = await env.DB.prepare(
      `SELECT title, url, source, published_at, city, state, lat, lon, department
       FROM misuse_reports
       WHERE published_at >= ?
       ORDER BY published_at DESC
       LIMIT 500`,
    )
      .bind(cutoff)
      .all<MisuseReportRow>();

    const newsItems: MisuseReportItem[] = results.map((row) => ({
      title: row.title,
      url: row.url,
      source: row.source,
      published: row.published_at,
      location:
        row.lat != null && row.lon != null && row.city != null && row.state != null
          ? { city: row.city, state: row.state, lat: row.lat, lon: row.lon, department: row.department }
          : null,
    }));

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

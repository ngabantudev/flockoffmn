// src/worker.ts
//
// Custom Worker entrypoint (wrangler.jsonc "main") so a scheduled() cron
// handler can live alongside the Astro SSR fetch handler in the same
// deployment. `handle` is @astrojs/cloudflare's exported request handler —
// using it here is equivalent to the adapter's own default entrypoint
// (@astrojs/cloudflare/entrypoints/server), just wrapped so we can add
// `scheduled`.

import { handle } from "@astrojs/cloudflare/handler";
import { ingestMisuseReports } from "./lib/ingestMisuseReports";

export default {
  async fetch(request, env, ctx) {
    return handle(request, env, ctx);
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      ingestMisuseReports(env.DB).then((result) => {
        console.log("[ingestMisuseReports]", result);
      }),
    );
  },
} satisfies ExportedHandler<Env>;

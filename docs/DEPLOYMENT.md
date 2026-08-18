# Deployment

The site builds to static files. `npm run build` produces `dist/`, which can be
served by anything — object storage, a CDN, a static host, or a plain web
server. There is no database and no server-side state, and no server-side
routes at all.

Nothing here is Cloudflare-specific. Pages is what this project uses, but the
output is plain files and the project should stay portable — that is the point
of the static architecture, not a side effect of it. A host that cannot run
Cloudflare Pages Functions can still serve the entire static site.

## Cloudflare Pages

`wrangler.jsonc` configures the Pages project. It has `pages_build_output_dir`
and deliberately **no `main` entrypoint**: this is a static site, not a Worker.

### Set it up once (Git integration — recommended)

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git**, and pick this repository.
2. Build settings:
   - Framework preset: **Astro**
   - Build command: `npm run build`
   - Build output directory: `dist`
3. Environment variables → set `NODE_VERSION` to `22`. The ingest scripts and
   the build both expect it (see `engines` in `package.json`). **Caveat, not
   yet independently confirmed:** once a repo's `wrangler.jsonc` exists (this
   one already does), Cloudflare appears to treat it as the source of truth
   for the project and disables this same dashboard editor for plain-text
   `vars` — see "Base map tiles" below, confirmed the hard way when this
   project still used MapTiler. If `NODE_VERSION` turns out to be similarly
   locked, it isn't currently expressible in `wrangler.jsonc` either; check
   Cloudflare's current docs rather than assuming this step still works.
4. Nothing else to set for the basemap — see "Base map tiles" below. Unlike
   the old MapTiler setup there's no key a fork needs to obtain; the code
   defaults to this project's own public R2 bucket, and a fork only needs to
   set `PUBLIC_TILES_URL` if it wants to point at its own.

Git integration is worth choosing over a deploy workflow for one specific
reason: **Pages builds a preview URL for every pull request.** For a project
that asks for community contributions, that means someone submitting a data
correction or a translation gets a working link a reviewer can click, instead
of being asked to install Node first.

### Manual deploys

Useful for a mirror, or if you would rather not connect the repo:

```bash
npm run pages:preview         # builds, deploys to a preview URL
npm run pages:publish         # builds, deploys to the LIVE domain
npm run pages:dev             # serve dist/ locally through the Pages runtime
```

**The branch is what decides whether a deploy is public.** `main` is the
project's production branch, so `wrangler pages deploy` without `--branch` — or
with `--branch=main` — publishes to flockoffmn.org. Any other branch name
produces a preview URL and touches nothing live.

That distinction used to live in a single `pages:deploy` script that read as
though it were harmless, which is why there are now two scripts named after what
they actually do. If you add another, put the branch in it explicitly rather
than letting wrangler infer one from the checkout.

`npm run pages:dev` is the only way to test `_headers` locally — `astro dev`
and `astro preview` ignore that file.

### Headers

`public/_headers` ships the CSP and security headers, and Astro copies it into
`dist/` at build time. Two things to know:

- **`script-src 'self'`** is the directive that matters, and it is strict. No
  inline scripts, no CDNs, no third-party JS.
- **`img-src` and `connect-src` allow any HTTPS origin**, on purpose, so that
  swapping the basemap archive's host (currently a public R2 bucket) does not
  silently break the map. Images and tile fetches cannot execute; the
  executable surface stays locked down. If you want
  to tighten these to your specific tile host, do it — just remember to update
  the file whenever `PUBLIC_TILES_URL` changes.

### No bindings

The Pages project carries no bindings: no KV, no R2, no D1, no queues. That
is the privacy posture, not an omission: with no server-side store, there is
nowhere for a visitor's address lookup to be recorded, which is what makes
the claim on `/about` truthful. Adding a binding means adding somewhere data
could accumulate — if you ever need one, revisit those claims first, and any
new server-side route should be able to make the case for itself (a concrete
reason the data can't be static or client-fetched, state kept no broader than
the feature needs, and — if it writes anything — a write path that's
isolated, reviewed, and narrow) before it's added.

## Base map tiles

**History, so this isn't relitigated:** this project used MapTiler (a hosted
raster tile vendor) through August 2026. Every visitor's browser called
MapTiler directly, with nothing caching in front of it, and MapTiler's free
tier hit its request/session ceiling within a normal month of traffic — the
whole point of "caching" was never actually built. That, plus MapTiler being
a vendor who could revoke access at will (the exact risk §0.8 of `CLAUDE.md`
asks this project to design against), is why it's gone.

**What's here now:** a single self-hosted vector tile archive
(`minnesota.pmtiles`) covering Minnesota, built once from OpenStreetMap data
and served as a static file from a public Cloudflare R2 bucket
(`flockoffmn-tiles`). No API key, no vendor account, no request-count
ceiling of its own — R2 has zero egress fees and the archive fits
comfortably inside its free storage tier. `src/lib/mapStyle.ts` already
defaults to this project's own bucket, so **a plain checkout needs zero
config** to see a working map, in both `npm run dev` and a production build.

### How it works

- **Format:** [PMTiles](https://github.com/protomaps/PMTiles) — a single
  file the browser reads with plain HTTP byte-range requests via the
  `pmtiles` npm package (registered as a MapLibre protocol in
  `mapController.ts`). No tile server, no Worker; served from a custom
  domain (`tiles.flockoffmn.org`) on the R2 bucket with a zone Cache Rule so
  Cloudflare's edge actually caches the ranges — see "Setting up your own
  bucket" below for why that Cache Rule is a required, non-optional step
  (the R2 default, `.r2.dev`, is explicitly rate-limited and uncached).
- **Data:** [Geofabrik's Minnesota extract](https://download.geofabrik.de/north-america/us/minnesota-latest.osm.pbf)
  — never OSM's live tile servers. Geofabrik explicitly publishes these
  extracts for bulk download; scraping tile.openstreetmap.org at any volume
  would violate OSM's usage policy and this project's own "Good-Citizen
  Fetcher" rule (`CLAUDE.md`).
- **Render:** [planetiler](https://github.com/onthegomap/planetiler), a
  Java program, via `scripts/tiles/build-basemap.mjs`. It emits the
  [OpenMapTiles schema](https://github.com/openmaptiles/openmaptiles) at
  zoom 0-14 (MapLibre overzooms past that by scaling vector geometry rather
  than blurring pixels the way raster tiles do — see the maxzoom comment in
  that script).
- **Style:** four styles — fiord, liberty, positron, dark — mirrored from
  OpenFreeMap (MIT-licensed) into `src/lib/basemapStyles/*.json` by
  `scripts/tiles/mirror-basemap-styles.mjs`, matching
  wealldobettermn.org's own catalog exactly. Each style's vector source is
  rewritten to point at this bucket instead of OpenFreeMap's, and its
  sprite/glyphs at this site's own origin (`public/sprites/`,
  `public/fonts/`) instead of OpenFreeMap's — no visitor's browser ever
  talks to OpenFreeMap directly. `src/lib/mapStyle.ts` reads these four
  JSON files at build time (plain imports, not a runtime fetch); it no
  longer hand-generates basemap paint rules the way the old two-flavor
  system did.
- **Attribution:** two separate credits are legally required, not one —
  OpenStreetMap (the data, ODbL) and OpenMapTiles (the tile schema, CC BY).
  Both are baked into each `basemapStyles/*.json`'s
  `sources.openmaptiles.attribution` by the mirror script (and exported as
  `TILE_ATTRIBUTION` from `mapStyle.ts` for anything else that wants the
  same text) and render in MapLibre's attribution control automatically.
  See `LICENSE-DATA.md`'s basemap section for the full
  Produced-Work-vs-Derivative-Database reasoning behind why this can ship
  without ODbL's share-alike clause attaching.

### Refreshing the four basemap styles

Needed if OpenFreeMap changes fiord/liberty/positron/dark's colors or
layers upstream and the live site should follow — no automatic schedule,
same reasoning as the archive rebuild below.

```bash
node scripts/tiles/mirror-basemap-styles.mjs
```

Re-fetches all four styles plus the shared sprite set and the two font
weights (Bold, Italic) this adds beyond the Regular `public/fonts/` already
vendored, rewriting each style's vector source/sprite/glyphs to this
project's own self-hosted URLs. Review the diff in
`src/lib/basemapStyles/*.json` before committing — this is a real content
change to how the map looks, not a mechanical regeneration.

### Rebuilding the archive

Needed if Minnesota's roads have visibly drifted from what the map shows —
there's no automatic schedule (see `scripts/tiles/build-basemap.mjs`'s header
for why an unattended write path into a production bucket isn't worth taking
on for this). Roughly annually is a reasonable cadence.

```bash
# Requires a JDK on PATH — planetiler is a Java program.
#   macOS: brew install openjdk
#   then confirm: java -version

npm run tiles:build      # downloads the extract, builds .tiles-build/minnesota.pmtiles
npm run tiles:publish    # same, then uploads to the flockoffmn-tiles R2 bucket
```

`tiles:publish` needs `wrangler` authenticated against the Cloudflare account
that owns the bucket (`npx wrangler whoami` to check). The upload takes
effect immediately — R2 is the source of truth for what the live site
serves, so there's nothing to redeploy afterward.

### Setting up your own bucket (forks)

1. `npx wrangler r2 bucket create your-bucket-name`
2. **Use a custom domain on your own zone, not the `.r2.dev` dev URL.**
   Cloudflare's own docs are explicit that `r2.dev` is rate-limited and
   "intended for non-production traffic," and gets none of the edge caching
   a custom domain does — using it in production just swaps one
   rate-limited endpoint for another. `npx wrangler r2 bucket domain add
   your-bucket-name --domain=tiles.your-domain.example --zone-id=<your zone
   ID>` (find the zone ID in the dashboard, or `GET
   /zones?name=your-domain.example` against the Cloudflare API). The
   `dev-url enable` / `.r2.dev` path still exists and is fine for a quick
   local check, just not for anything a real visitor hits.
3. **Add a Cache Rule for the new hostname.** This is the one step that
   can't be done from `wrangler` — it needs the dashboard (**Caching →
   Cache Rules**, or the legacy **Rules → Page Rules**) because it requires
   a zone-write API scope a deploy token doesn't carry. Without it,
   `.pmtiles` isn't one of the extensions Cloudflare caches by default, so
   every request hits R2 directly (`cf-cache-status: DYNAMIC` on every
   response, verifiable with `curl -I`) instead of being served from the
   edge. Rule: match hostname equals `tiles.your-domain.example`, action
   "Cache Eligibility → Eligible for cache" (or the older "Cache Everything"
   Page Rule action). Confirm afterward with `curl -sI -H "Range:
   bytes=0-1023" https://tiles.your-domain.example/minnesota.pmtiles` twice
   in a row — second response should show `cf-cache-status: HIT`.
4. `npx wrangler r2 bucket cors set your-bucket-name --file=cors.json` with a
   rule permitting `GET`/`HEAD` and the `Range` header from your site's
   origin(s) — PMTiles' range requests need this to succeed cross-origin.
5. `npm run tiles:build`, then `npx wrangler r2 object put
   your-bucket-name/minnesota.pmtiles --file=.tiles-build/minnesota.pmtiles
   --content-type=application/octet-stream --cache-control="public,
   max-age=3600, stale-while-revalidate=86400" --remote` — the
   `--cache-control` flag matters: without it, R2 serves the object with no
   `Cache-Control` header at all, which undercuts step 3 even after the
   Cache Rule is in place.
6. Set `PUBLIC_TILES_URL` to your custom domain + `/minnesota.pmtiles` — in
   `.env` for local dev, and in `wrangler.jsonc`'s `env.production`/
   `env.preview` `vars` for a deployed fork (see the "No bindings" comment
   in that file for why `vars` has to be repeated per-environment, not just
   set once at the top level).

No API key, no origin-restriction dance, no build-time-vars-vs-Pages-secrets
trap the way the old MapTiler setup needed (that whole class of problem came
from a vendor's key needing to be both build-time-visible and
origin-restricted at once — a self-hosted public file has neither
constraint). Step 3 is the new equivalent "easy to get wrong" step — the
symptom if you skip it isn't a broken map, it's a *working but
un-cached* one that reads R2 on every single visitor request instead of
almost none of them.

## Headers

The site sets no cookies and loads no third-party resources, so a strict policy
costs nothing:

```
Content-Security-Policy: default-src 'self'; img-src 'self' data: blob: https://your-tiles.example; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' https://your-tiles.example; frame-ancestors 'none'; base-uri 'none'
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
Permissions-Policy: geolocation=(self), camera=(), microphone=(), interest-cohort=()
```

`geolocation=(self)` is required for the "near me" button. Everything else is
off because nothing here needs it.

MapLibre needs `worker-src blob:` on some hosts; add it if the map fails to
initialise with a worker error.

## Caching

- `/_astro/*` — content-hashed, cache immutably for a year.
- `/data/*.geojson`, `/data/*.csv` — regenerate on a schedule; a few hours is
  sensible. These are the largest assets, so make sure they are compressed.
  The camera layer is ~700 KB raw and compresses to well under 200 KB; if your
  host does not gzip/brotli JSON by default, turn it on.
- HTML — short cache, or revalidate.

## Do not add

This is worth stating explicitly, because it is easy to undo by habit:

- **No analytics.** Not Google Analytics, not Plausible, not "privacy-friendly"
  anything. The project's credibility rests on not surveilling the people who
  come here to learn about surveillance.
- **No third-party fonts, scripts, or embeds.** They leak visitor IPs and
  referrers to parties the user never chose.
- **No error-reporting SDK** that transmits URLs or user context.
- **No server-side logging of requests to `/near-me`.** Ideally, no access logs
  retained at all beyond what your host requires; if you must keep them, strip
  IPs and set a short retention.

If you need to know whether the site is working, monitor it from outside rather
than instrumenting the people using it.

## Resilience

Grassroots mapping of ALPR networks has drawn legal threats before — DeFlock
received a cease-and-desist and refused it with EFF backing on First Amendment
grounds. The posture that follows from that:

- **Keep provenance clean.** Every record links to the public source it came
  from, and every ingest script is readable. Being able to show exactly where a
  fact came from is the strongest position to argue from.
- **Publish only public data.** Nothing here is obtained by access that was not
  already open to anyone.
- **Stay easy to mirror.** Static output means a fork plus `npm run build`
  reproduces the whole site. Encourage mirrors; they are the practical answer
  to a takedown.
- **Keep the data reproducible.** Because `npm run data` rebuilds every layer
  from upstream with no credentials, the datasets survive the loss of this
  repository.

## Extending nationally, or to another state

See [PORTING.md](../PORTING.md) for the full breakdown — which ingest scripts
work unmodified via env vars, which are Minnesota-specific templates to
adapt, and what a fork needs to do about the basemap archive and the
records-request generator. The short version:

```bash
STATE_FIPS=06 STATE_USPS=CA STATE_ISO=US-CA npm run data:counties
SCOPE=national npm run data:287g
```

If you're running `SCOPE=national` for every state at once rather than
porting to a single one, expect `counties.mjs`'s boundary payload to grow well
beyond the ~100 KB Minnesota subset, at which point the "near me" county
lookup should move to tiles or a spatial index rather than shipping every
polygon to the browser.

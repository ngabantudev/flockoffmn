# Deployment

The site builds to static files. `npm run build` produces `dist/`, which can be
served by anything — object storage, a CDN, a static host, or a plain web
server. There is no database and no server-side state. There is exactly one
small server-side route — see "Live flight proxy" below — and every other page
on the site works identically without it.

Nothing here is Cloudflare-specific. Pages is what this project uses, but the
output is plain files and the project should stay portable — that is the point
of the static architecture, not a side effect of it. A host that cannot run
Cloudflare Pages Functions can still serve the entire static site; only
`/live-flights` degrades.

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
  the file whenever `PUBLIC_TILE_URL` changes.

### One binding, narrowly scoped

The Pages project carries exactly one binding: `FLIGHT_SIGHTINGS_DB`, a
Cloudflare D1 database, read-only in application code. It backs only
`functions/api/flight-log/[hex].js` and `functions/api/flight-log/index.js`
— both `SELECT`-only, never `INSERT`/`UPDATE` — and holds aircraft-level
facts (hex, callsign, ground-arrival/departure timestamps), never anything
about a visitor. See "Flight sighting log (the second exception)" below.

Beyond that: no KV, no R2, no queues. That is still the privacy posture, not
an omission: with no other server-side store, there is nowhere for a
visitor's address lookup to be recorded, which is what makes the claim on
`/about` truthful. Adding another binding means adding somewhere data could
accumulate — if you ever need one, revisit those claims first.

### Live flight proxy (the one exception)

`functions/api/ice-flights.js` and `functions/api/trace/[hex].js` are
Cloudflare Pages Functions — the only server-side code in this project. They
back the "Live ICE Air charter flights" toggle on the main map, on by
default, which shows aircraft anywhere in the world currently broadcasting a
callsign matching known ICE Air charter operators. The toggle is deliberately
not a registry layer itself — see the header of `src/lib/liveFlights.ts` for
why.

They exist for one reason: adsb.lol, the ADS-B network this project reads,
sends no `Access-Control-Allow-Origin` header, so a browser can never read its
response directly. Something has to sit between the two and re-serve the data
same-origin. That is all these routes do:

- `api/ice-flights` queries adsb.lol's entire worldwide feed (a big-enough
  point/radius query returns everything the network has, confirmed by hand)
  and filters it down, server-side, to aircraft whose callsign matches a
  known ICE Air charter operator pattern — the same callsigns Otter Goose's
  MSP ICE Air Flight Tracker (ottergoose.net) filters for, reproduced
  verbatim rather than re-derived. Only that small filtered result ever
  reaches a browser; the multi-megabyte worldwide response never leaves the
  edge. Cached for ~45 seconds — longer than a small-radius query would
  need, because this fetch is far larger and drew a 429 from adsb.lol after
  only a handful of manual requests during development.
- `api/trace/[hex]` proxies one aircraft's full retained position history,
  fetched only when a visitor clicks that specific plane on the map — never
  ambiently for every aircraft in view. Each trace file runs several hundred
  KB; fetching it for every tracked aircraft at once would multiply load on
  adsb.lol far beyond what the live position feed already costs. Cached at
  the edge for ~30 seconds.
- Both routes cache a failed upstream call too, for longer than a success
  (120s / 60s). This is what stops a burst of traffic from turning a
  temporary adsb.lol rate-limit or outage into a worse one: instead of every
  request retrying the upstream, the whole route serves the same cached
  failure and backs off together until the cooldown passes. Found the need
  for this by triggering adsb.lol's own 429 during development — from manual
  testing, not real traffic — so it went in before this shipped rather than
  after.
- No binding, no KV, no D1, no state of any kind. Nothing either route
  handles is ever written anywhere.
- No access logging beyond whatever Cloudflare retains by default for the
  whole zone; these routes add nothing on top of that.
- If either is ever removed, disabled, or fails, every other page — and the
  rest of the main map — keeps working exactly as a plain static mirror; only
  the live toggle degrades.

This is a deliberate, narrow exception to the "no backend" posture above, made
because there was no other way to show a live third-party feed at all. It was
not, on its own, a precedent for adding a general-purpose API.

### Flight sighting log (the second exception)

The live overlay above is real-time only: nothing about a ground arrival or
departure survives past the current poll, so there was no durable record a
lawyer could cite after the fact. `functions/api/flight-log/[hex].js` and
`functions/api/flight-log/index.js` close that gap by reading a persisted
history from Cloudflare D1 (`FLIGHT_SIGHTINGS_DB` — see
`migrations/0001_flight_sightings.sql` for the schema).

The concrete reason this can't be static or client-fetched, the same case the
live-flight-proxy section above demands of any new server-side route:
**durability past the live feed's in-memory window.** A visitor's browser tab
holds the live overlay's state only as long as it's open; a habeas filing
needs a ground/departure timestamp that still exists days or weeks later,
independent of whether anyone was watching the map at the time.

What's different about this exception, and worth stating plainly:

- **There is a real write path, but it does not live in this Pages
  project.** Cloudflare Pages Functions only run on an inbound HTTP request
  — there's no background invocation — so writes can't live in a route a
  visitor's browser happens to trigger. The actual writer is
  `workers/flight-sightings-cron/`, a separate, standalone Cloudflare Worker
  deployable with its own `wrangler.jsonc` and its own D1 write binding, on a
  Cron Trigger, currently every 10 minutes, and is the ONLY place in the
  whole project a D1 write binding exists. It does NOT query adsb.lol
  directly — it fetches `functions/api/ice-flights.js`'s own already-filtered,
  edge-cached result, so it rides the same 45s cache real visitors already
  use instead of adding a second independent load against adsb.lol's rate
  limit (the two were briefly uncoordinated when this Worker first shipped,
  which is exactly what started producing 429s). The 10-minute cadence is
  deliberate, not just a rate-limit concession: this log only cares about
  discrete ground-arrival/ground-departure events, not a continuous position
  feed, and ICE Air charter ground stops (loading, refueling, crew changes)
  run well past 10 minutes in practice — a real trade-off (a stop shorter
  than the poll interval could be missed, and a captured timestamp is only
  precise to within it), stated explicitly wherever a sighting is shown. See
  `index.mjs`'s header for the full mechanics (diffing ground status per
  aircraft, one row per state transition, never one row per poll).
- **`functions/api/flight-log/*` is read-only**, `SELECT` only, enforced by
  review rather than a platform-level read-only D1 binding mode (D1 has no
  such mode today).
- **Retention is indefinite for `flight_sightings`.** This is citable
  evidentiary aircraft data — hex, callsign, timestamp, best-effort airport —
  the same category as every other layer this project already keeps with no
  retention clock. That is a deliberate, different rule from the one right
  below it.
- **No query logging, full stop.** This is NOT the same thing as the
  indefinite retention above — it's a stricter, separate rule about visitor
  metadata. Nobody's IP, User-Agent, or request identifier is logged against
  which tail number or date range they looked up. No new logging middleware
  was added for these routes; they add nothing on top of whatever Cloudflare
  retains by default for the whole zone.
- **Rate limiting is dashboard config, not app code.** A Cloudflare
  dashboard-level Rate Limiting Rule on `/api/flight-log/*` (roughly 30
  req/min/IP, Managed Challenge) is a manual one-time step: Workers & Pages →
  your project → Security → WAF → Rate limiting rules. This is deliberately
  NOT an app-level limiter, because any app-level limiter needs its own
  per-IP counting state — exactly the kind of visitor-tied store this
  project's whole architecture avoids building. Pushing the limit to the
  dashboard keeps that state out of the codebase entirely.
- **adsb.lol's terms have not yet been vetted** for persisting or
  redistributing derived data — see `LICENSE-DATA.md`. That review is a real
  prerequisite before this data should be relied on publicly, not a
  formality.

There are now two narrow, deliberate exceptions to the "no backend" posture:
the live flight proxy above, and this persisted log. Neither is a precedent
for a general-purpose API on its own — any new server-side route should be
able to make the same case both of these do (a concrete reason the data
can't be static or client-fetched, state kept no broader than the feature
needs, and — if it writes anything — a write path that's isolated,
reviewed, and narrow) before it's added.

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
  `mapController.ts`). No tile server, no Worker; Cloudflare's own edge CDN
  caches the ranges like any other static asset.
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
- **Style:** hand-written vector paint rules in `src/lib/mapStyle.ts`'s
  `BASEMAP_LAYERS`, two flavors (dark/light) matching the site theme. Not
  four, the way the old MapTiler catalog offered — see that file's header
  comment for why.
- **Attribution:** two separate credits are legally required, not one —
  OpenStreetMap (the data, ODbL) and OpenMapTiles (the tile schema, CC BY).
  Both are baked into `TILE_ATTRIBUTION` in `mapStyle.ts` and render in
  MapLibre's attribution control automatically. See `LICENSE-DATA.md`'s
  basemap section for the full Produced-Work-vs-Derivative-Database
  reasoning behind why this can ship without ODbL's share-alike clause
  attaching.

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
2. `npx wrangler r2 bucket dev-url enable your-bucket-name` — gives you a
   public `pub-<hash>.r2.dev` URL with no DNS/custom-domain setup required.
   (A custom domain on the bucket works too, if you'd rather not use the
   `.r2.dev` URL in production — see the R2 dashboard.)
3. `npx wrangler r2 bucket cors set your-bucket-name --file=cors.json` with a
   rule permitting `GET`/`HEAD` and the `Range` header from your site's
   origin(s) — PMTiles' range requests need this to succeed cross-origin.
4. `npm run tiles:build`, then `npx wrangler r2 object put
   your-bucket-name/minnesota.pmtiles --file=.tiles-build/minnesota.pmtiles --remote`
5. Set `PUBLIC_TILES_URL` to your bucket's public URL + `/minnesota.pmtiles`
   — in `.env` for local dev, and in `wrangler.jsonc`'s `env.production`/
   `env.preview` `vars` for a deployed fork (see the d1_databases comment in
   that file for why `vars` has to be repeated per-environment, not just set
   once at the top level).

No API key, no origin-restriction dance, no build-time-vars-vs-Pages-secrets
trap the way the old MapTiler setup needed (that whole class of problem came
from a vendor's key needing to be both build-time-visible and
origin-restricted at once — a self-hosted public file has neither
constraint).

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

## Extending nationally

The geocoding already keys on Census GEOIDs, so the state scope is a parameter,
not an assumption:

```bash
STATE_FIPS=06 STATE_USPS=CA STATE_ISO=US-CA npm run data:counties
SCOPE=national npm run data:287g
```

The main work is a national county reference — `counties.mjs` currently
requests one state from TIGERweb and would need to page through all of them, or
consume the national Gazetteer plus a national boundary file. Expect the
boundary payload to grow well beyond the ~100 KB Minnesota subset, at which
point the "near me" county lookup should move to tiles or a spatial index
rather than shipping every polygon to the browser.

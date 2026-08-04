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
   `vars` — see "Base map tiles" below, confirmed the hard way for
   `PUBLIC_TILE_URL`. If `NODE_VERSION` turns out to be similarly locked,
   it isn't currently expressible in `wrangler.jsonc` either; check
   Cloudflare's current docs rather than assuming this step still works.
4. `PUBLIC_TILE_URL` and `PUBLIC_TILE_ATTRIBUTION` are already committed in
   `wrangler.jsonc` for this repo (see "Base map tiles" below) — nothing to
   set here for production. A fork needs its own key; see that section.

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
  swapping the tile provider does not silently break the map. Images and tile
  fetches cannot execute; the executable surface stays locked down. If you want
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

**Do not point production traffic at OpenStreetMap's standard tile servers.**
They are volunteer-funded infrastructure, and their
[usage policy](https://operations.osmfoundation.org/policies/tiles/) asks that
apps not rely on them at scale. The default is set for local development only.

Configure your own before launch:

```bash
PUBLIC_TILE_URL="https://your-tiles.example/{z}/{x}/{y}.png"
PUBLIC_TILE_ATTRIBUTION="© OpenStreetMap contributors"
```

Options, roughly in order of independence:

1. **Self-host raster tiles.** Most control, no third party who can cut you off.
2. **A tile provider** (Protomaps, MapTiler, Stadia…). Simple, but introduces a
   vendor who sees your users' tile requests and can revoke access. Note
   Protomaps' hosted API is vector-only (MVT) — it does not fit this project's
   raster-only `mapStyle.ts` without also rewriting the style and self-hosting
   glyphs for label layers (the CSP's `font-src 'self'` blocks their glyph
   server on purpose). MapTiler and Stadia both serve raster PNG tiles
   directly, so they're the simpler drop-in fits for `PUBLIC_TILE_URL` today.
3. **Bundle vector tiles as PMTiles** on your own origin. Single-file, range-
   requested, no tile server needed. Good middle ground if bandwidth allows.

### MapTiler quick start

1. Create an account at [maptiler.com](https://www.maptiler.com/) and create
   a **new** key — MapTiler's auto-generated "Default key" cannot be
   restricted (there's no Allowed HTTP origins field on it), which is why
   the key committed here is a separate one named `flockoffmn-production`.
   In its **Allowed HTTP origins** field, add:
   ```
   flockoffmn.org
   *.flockoffmn.pages.dev
   ```
   Leave **Allowed user-agent header** blank — that field is for non-browser
   clients (mobile apps, desktop GIS software); a public website is hit by
   every browser's own user-agent string, so restricting by it would block
   real visitors.

   Verified directly against MapTiler with curl: a request with a matching
   `Origin` returns `200`, a foreign `Origin` returns `403`, and the same
   for `Referer` when no `Origin` is present. A request with *neither*
   header also returns `403`, which raised a real concern given this site's
   `Referrer-Policy: no-referrer` (`public/_headers`) — if MapLibre's tile
   requests didn't carry a CORS `Origin` header either, real visitors would
   hit that same `403`. Checked with an actual headless browser against a
   preview build, not just curl: MapLibre's tile `<img>` requests do send
   `Origin: https://<deploy>.flockoffmn.pages.dev` (empty `Referer`, as
   expected — `Origin` isn't governed by `Referrer-Policy`, only `Referer`
   is). All 30 tile requests on that run returned `200` and the map
   rendered correctly with MapTiler attribution visible. If a future
   MapLibre upgrade changes how it loads tile images, re-check this the
   same way; the `?` placeholder in Allowed HTTP origins is the stopgap if
   it ever regresses (permits no-origin requests, at the cost of also
   letting other headerless requests through).
2. Put the key straight into `wrangler.jsonc`, under **both**
   `env.production` and `env.preview` — each needs its own `vars` *and* its
   own `d1_databases` (see step below on non-inheritance):

   ```jsonc
   "env": {
     "preview": {
       "d1_databases": [ /* repeat the top-level d1_databases entry here too */ ],
       "vars": {
         "PUBLIC_TILE_URL": "https://api.maptiler.com/maps/streets-v4-dark/256/{z}/{x}/{y}.png?key=YOUR_MAPTILER_KEY",
         "PUBLIC_TILE_ATTRIBUTION": "© <a href=\"https://www.maptiler.com/copyright/\">MapTiler</a> © <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors"
       }
     },
     "production": {
       "d1_databases": [ /* repeat the top-level d1_databases entry here too */ ],
       "vars": {
         "PUBLIC_TILE_URL": "https://api.maptiler.com/maps/streets-v4-dark/256/{z}/{x}/{y}.png?key=YOUR_MAPTILER_KEY",
         "PUBLIC_TILE_ATTRIBUTION": "© <a href=\"https://www.maptiler.com/copyright/\">MapTiler</a> © <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors"
       }
     }
   }
   ```

   This is not the obvious choice, and it took a live outage (twice) to find
   the right one — record of why, so it isn't relitigated:
   - `PUBLIC_TILE_URL` is inlined into the client bundle by Vite at **build**
     time (`import.meta.env` in `mapStyle.ts`), not read at request time.
   - Once a project has a `wrangler.jsonc`/`.toml`, Cloudflare treats it as
     the **source of truth** and disables the dashboard's plain-text
     "Environment variables" editor for it — the dashboard is left able to
     manage only Secrets from then on. Pages secrets (dashboard or
     `wrangler pages secret put`) are visible to Pages *Functions* at
     request time only — never to Cloudflare's own Git-integration build
     step. A value that only exists as a secret is invisible to the build
     and it silently re-inlines the `tile.openstreetmap.org` fallback —
     this shipped to production **twice** before that combination was
     understood, including once from a manual `wrangler pages deploy` that
     looked correct right up until the next unrelated PR merged and
     triggered a real rebuild.
   - So the value has to be a real, committed `vars` entry — there is no
     dashboard-only or secret-only path that survives a Git-triggered build
     for this project. It also doesn't reach a *local* `wrangler pages
     deploy` build — Vite only reads `.env`/shell env locally, never
     `wrangler.jsonc`'s `vars` — so a manual deploy still needs
     `PUBLIC_TILE_URL` set in your local `.env`.
   - `vars` (and every binding, including `d1_databases`) is **non-inheritable**
     in Wrangler config: declaring an `env.*` section at all means
     Cloudflare stops inheriting the top-level `d1_databases` for that
     environment, so it must be repeated inside **both** `env.production`
     *and* `env.preview` or the flight-log D1 binding silently disappears —
     confirmed live for preview: `/api/flight-log/` on a preview build that
     first omitted this returned a 500 (`Cannot read properties of
     undefined (reading 'prepare')`), where the same route on prior PR
     previews (before this file had an `env` block) returned 200.
   - The key ending up in git is a knowing tradeoff, not an oversight: it's
     already fully exposed in the public JS bundle to every visitor
     (view-source finds it in seconds), so keeping it out of git bought no
     real secrecy, only slightly less convenient scraping. The real control
     is step 1's origin restriction — apply it, don't just plan to.
3. `streets-v4-dark` — a raster PNG export of MapTiler's `streets-v4` style,
   not the full vector `style.json` MapTiler's dashboard links to by
   default. The vector version would need `mapStyle.ts` rewritten to load
   an external style (rather than one raster layer) and, by default, pulls
   fonts/sprites from MapTiler's own servers — that conflicts with this
   repo's self-hosted-glyphs CSP (`font-src 'self'`, see the `glyphs`
   comment in `mapStyle.ts`), so raster is the fit here, not a fallback.
   Any `-dark` MapTiler raster style works the same way; a light one (this
   project first tried `basic-v2`, then `basic-v2-dark`) needs
   `mapStyle.ts`'s raster paint properties to do more correction, which
   previously double-dimmed it into looking flat and washed out. The light
   `tile.openstreetmap.org` dev fallback is the one place still relying on
   that lighter paint filter to look reasonable — an accepted tradeoff for
   a path that's "fine for development," not production.
4. MapTiler's free tier is metered (100k tile loads/month as of this
   writing) — watch usage after a traffic spike like the one that broke the
   OSM fallback.

Whatever you pick, keep the attribution string accurate — it is a licence
condition for OSM-derived tiles, not a courtesy.

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

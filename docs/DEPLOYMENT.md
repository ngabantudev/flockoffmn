# Deployment

The site builds to static files. `npm run build` produces `dist/`, which can be
served by anything — object storage, a CDN, a static host, or a plain web
server. There is no runtime, no database, and no server-side state.

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
   vendor who sees your users' tile requests and can revoke access.
3. **Bundle vector tiles as PMTiles** on your own origin. Single-file, range-
   requested, no tile server needed. Good middle ground if bandwidth allows.

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

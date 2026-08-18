# Porting FlockOff to another state (or country)

This project was built for Minnesota, but most of it isn't *about* Minnesota
— the map engine, the schema, the privacy rules, and about half the ingest
scripts are generic. This document is the honest version of "plug and play":
what genuinely is that easy, what's a template you adapt, and what's simply
per-place labor no codebase can do for you.

Read this alongside [AGENTS.md](AGENTS.md) and [DURABILITY.md](DURABILITY.md)
first. Those two files are this project's constitution — the privacy
boundaries (§1b), the sourcing discipline (§3), the "systems, not people"
scope rule — and a fork should inherit them as-is unless it has a documented
reason not to. Nothing in this guide overrides them.

## Before you start: is this a state, or a country?

Everything below assumes a **US state**. The geocoding backbone
(`counties.mjs`, `jurisdictions.mjs`) resolves places against **US Census
TIGERweb and Census GEOIDs** — FIPS codes, tract IDs, the whole reference
geography. A US state swap is changing which state's slice of that system you
pull. A different country has no FIPS codes, no TIGERweb, no ACS — porting
there means replacing the entire geocoding backbone with that country's own
administrative-boundary and statistics service, which is a much bigger project
than anything else in this document. If that's your goal, expect to treat
`counties.mjs`/`jurisdictions.mjs` as a design reference, not a starting
point, and budget for it as new work.

The rest of this guide is written for the state case.

## The two-folder split

```
scripts/ingest/national/   Works for any US state — set env vars and go
scripts/ingest/mn/         Built against a Minnesota-specific statute, agency, or dataset
```

`scripts/ingest/national/` scripts key everything off Census identifiers, so
the same code runs for any state once you point it at that state. They're
where to start.

`scripts/ingest/mn/` scripts exist because a *specific* Minnesota law,
agency, or research partnership publishes that data — Minn. Stat. § 13.824,
the Metropolitan Emergency Services Board, MnDOT, MPCA's CI-MAP, Mapping
Prejudice's county-by-county covenant digitization. Nothing about the *code*
is Minnesota-specific; the upstream source is. For each one, your state
either has its own equivalent (adapt the script) or doesn't (drop the layer —
its absence doesn't break anything else).

## Step 1 — Set your state

Copy `.env.example` to `.env` and set:

| Variable | Example (California) | Used by |
|---|---|---|
| `STATE_FIPS` | `06` | `counties.mjs`, `jurisdictions.mjs`, `demographics.mjs` |
| `STATE_USPS` | `CA` | almost every script, for labeling and filtering |
| `STATE_ISO` | `US-CA` | `alpr.mjs` (OpenStreetMap admin boundary query) |
| `STATE_NAME` | `CALIFORNIA` | `agencies-287g.mjs`, `detention.mjs` |

Then:

```bash
npm run data:counties      # must run first — everything else resolves against it
npm run data:jurisdictions
npm run data:287g
npm run data:alpr
npm run data:detention
```

Each of those five is a `scripts/ingest/national/` script and, per the table
below, should run against your state with no code changes.

`SCOPE=national` also works on `agencies-287g.mjs`, `detention.mjs`, and
`data-centers.mjs` — it ingests every state at once instead of filtering to
one, which is useful if you're standing up a multi-state instance rather than
a single-state fork.

## Step 2 — Layer by layer

| Script | Folder | Porting effort |
|---|---|---|
| `counties.mjs` | national | **None.** Set the env vars above. |
| `jurisdictions.mjs` | national | **None.** Same env vars. |
| `alpr.mjs` (ALPR cameras, OSM) | national | **None.** OpenStreetMap is global; set `STATE_ISO`. Coverage depends on whether DeFlock volunteers have mapped your state — check first. |
| `agencies-287g.mjs` | national | **None.** ICE's list is already national; set `STATE_NAME`/`STATE_USPS` or `SCOPE=national`. |
| `detention.mjs` | national | **None.** Same ICE list, same pattern. |
| `data-centers.mjs` | national | **None.** FracTracker's tracker is national; set `STATE_USPS` or `SCOPE=national`. The community-campaign overlay (`data/community/data-center-campaigns.json`) starts empty for a new fork — that's expected, not a bug. |
| `redlining.mjs` | national | **Check coverage, then none.** Mapping Inequality (Univ. of Richmond) digitized HOLC maps for many but not all US cities. Set `STATE_USPS`; if your state has zero surveyed cities, this layer has nothing to ingest and that's a real, documentable gap — not a bug to fix. |
| `holc-tracts.mjs` | national | **None**, but only relevant if `redlining.mjs` found something to ingest. |
| `demographics.mjs` | national | **Mostly none, one coupling to know about.** Uses the Census ACS API (needs a free `CENSUS_API_KEY`, see `.env.example`) and `STATE_FIPS` — genuinely national. *But* it currently reads its tract **geometry** from `ej-cumulative.geojson` rather than fetching its own from TIGERweb (see that script's header). Since `ej-cumulative.mjs` is Minnesota-only (MPCA's CI-MAP), a fork without an equivalent tract-level environmental dataset needs to either build one or change `demographics.mjs` to fetch tract boundaries from TIGERweb directly instead of borrowing them. |
| `agencies-lpr-bca.mjs` | mn | **Find your state's equivalent, or drop.** Exists because Minn. Stat. § 13.824 requires Minnesota agencies to report ALPR use to the BCA. Most states have no comparable mandatory-reporting law. If yours does, this is the template for reading it; if not, drop this script and `alpr-reported.mjs`, which depends on it. |
| `agency-jurisdictions.mjs` | mn | **Find your state's equivalent, or drop.** Built on the Metropolitan Emergency Services Board's Twin-Cities-metro 911 response-area boundaries. Look for your state's own 911/PSAP GIS layer (many states publish one) as the substitute source; the script's structure — one polygon per agency's full response area — is the pattern to follow. |
| `agency-buildings.mjs` | mn | **Find your state's equivalent, or drop.** Built on the University of Minnesota's U-Spatial statewide law-enforcement facility inventory. Depends on `agency-jurisdictions.mjs` for the join. |
| `alpr-reported.mjs` | mn | **Depends on `agencies-lpr-bca.mjs`.** Only portable if that one is. |
| `holc-detail.mjs` | mn | **Almost certainly drop.** Built on a Metropolitan Council retrace of the Twin Cities HOLC sheet at building scale — a one-off research product specific to those two cities, unlikely to have an equivalent anywhere else. `redlining.mjs` (national) is the layer to rely on instead. |
| `covenants.mjs` | mn | **Check for a local equivalent, or drop.** Built on Mapping Prejudice's (Univ. of Minnesota) parcel-level covenant transcription, currently covering 8 Minnesota counties. A few other US cities have similar racial-covenant research projects (Mapping Prejudice's own methodology has been adopted elsewhere) — if yours does, this script's personal-data-stripping discipline (see its header) is the pattern to copy exactly, not just the fetch logic. |
| `ej-cumulative.mjs` | mn | **Find your state's equivalent, or drop.** Built on MPCA's CI-MAP, which exists because of a 2023 Minnesota law (Minn. Stat. § 116.065). Some states have comparable environmental-justice screening tools (e.g. CalEnviroScreen in California); check before assuming there's nothing. Remember `demographics.mjs`'s coupling above if you drop this. |
| `aadt.mjs` | mn | **Find your state DOT's equivalent.** Every state DOT publishes traffic-volume data in some form, and many use ArcGIS feature services like MnDOT's — this script is a solid template even though the specific endpoint is Minnesota's. |
| `vendor-contracts.mjs` | mn | **This one is never a code port.** It's a hand-transcribed record of an actual public-records request (MGDPA, MuckRock). Your state's version requires *you* to file your own state's public-records request and transcribe what comes back — this script is the format to transcribe it into, not something to run against a different state. |

## Step 3 — The basemap

The self-hosted map tiles (`minnesota.pmtiles`, served from
`tiles.flockoffmn.org`) cover Minnesota only. Your fork needs its own archive:

```bash
npm run tiles:build      # builds a PMTiles archive from OpenStreetMap for a bounding box
npm run tiles:publish    # uploads it to your own R2 (or equivalent) bucket
```

See `scripts/tiles/build-basemap.mjs`'s header for the bounding-box
configuration, and set `PUBLIC_TILES_URL` in your `.env` (or `wrangler.jsonc`,
if you're also deploying to Cloudflare Pages) to point at your own archive
instead of the Minnesota one. Until you do this, `npm run dev` will render a
Minnesota basemap under whatever data you've ingested — obviously wrong for a
different state, but not a broken build, so it's an easy step to forget.

## Step 4 — The records-request generator (`src/lib/authority.mjs`)

This is the piece with no shortcut. `authority.mjs` names, for every one of
Minnesota's 2,757 jurisdictions, which office is legally the data-practices
"responsible authority" under Minn. Stat. § 13.02, subd. 16(b), cited in
place — because §1d of AGENTS.md requires every official act attributed to a
statute, not asserted. Porting this means doing the equivalent legal research
for your state's public-records law: which office is the default responsible
party, what the statute actually says, and citing it the same way. There's no
national database of this — it's the same kind of one-state-at-a-time work
`vendor-contracts.mjs` represents, just legal research instead of a records
request. Budget real time for it; it's arguably the single most
labor-intensive piece of a full port, and also the one that makes the "who do
I write to" feature (§0.6) actually trustworthy rather than decorative.

## Step 5 — Rebrand

Search for `flockoffmn` and `Minnesota`/`MN` across the repo — the obvious
spots:

- `wrangler.jsonc` — `name` (the Cloudflare Pages project) and the
  `PUBLIC_TILES_URL` values under `vars`/`env`
- `package.json` — `name`, `description`
- `README.md` — title, tagline, the "starting in Minnesota" framing
- `src/i18n/en.ts` / `es.ts` — UI copy that names Minnesota or its statutes
  directly (distinct from `authority.mjs`'s statute citations, which you're
  already replacing in Step 4)
- Domain references (`flockoffmn.org`, `tiles.flockoffmn.org`) once you have
  your own

## What doesn't change

Everything in [AGENTS.md](AGENTS.md) Part 0 and Part 1 — the privacy
boundaries, the "connection is the product" data model, the assertion
discipline, the source tiering — applies regardless of which state you're
mapping. Fork the rules along with the code. If your state's political
reality genuinely requires a documented exception, record it the way
[DURABILITY.md](DURABILITY.md)'s own Part 3 records this repo's exceptions —
written down, in your own `AGENTS.md`, not silently dropped.

## Checklist

- [ ] Read AGENTS.md and DURABILITY.md
- [ ] Set `STATE_FIPS`/`STATE_USPS`/`STATE_ISO`/`STATE_NAME` in `.env`
- [ ] Run the `national/` scripts (Step 1) and confirm they produce sane output for your state
- [ ] Go through the Step 2 table and decide, per `mn/` script: adapt, or drop
- [ ] If you dropped `ej-cumulative.mjs`, fix `demographics.mjs`'s tract-geometry coupling
- [ ] Remove any layer registry entries in `src/layers/registry.ts` for scripts you dropped
- [ ] Build and host your own basemap archive (Step 3)
- [ ] Do the public-records legal research for `authority.mjs` (Step 4) — or ship without the records-request feature and say so, rather than leaving Minnesota's statutes live for a different state
- [ ] Rebrand (Step 5)
- [ ] File your own state's public-records requests for anything like `vendor-contracts.mjs` — this one's on you, always

Stuck, or found a layer that ported more easily (or less) than this document
says? Open a discussion or an issue — this file should get more accurate over
time, not just longer.

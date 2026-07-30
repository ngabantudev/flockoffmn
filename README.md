# get-flocked

A free, open-source, community-driven map that makes the systems of
surveillance, enforcement, and historical public policy visible — starting in
Minnesota.

**Transparency for systems. Privacy for people.** Every layer describes an
institution, a piece of infrastructure, or a historical policy. No layer
describes, names, or tracks a private individual. That is a hard product
boundary, enforced in the schema, not a preference.

---

## What is on the map

| Layer | Records (MN) | Source | Licence |
|---|---|---|---|
| 287(g) agency agreements | 10 | ICE published list | Public domain |
| ALPR / Flock cameras | ~1,400 | OpenStreetMap via Overpass (DeFlock convention) | ODbL 1.0 |
| Redlining zones (HOLC) | 168 | Mapping Inequality, Univ. of Richmond | CC BY-NC-SA 4.0 |
| ICE-contract detention facilities | 5 | ICE Over-72-Hour Facility List | Public domain |
| Data centres | 20 | FracTracker Alliance (FOIA permits) | FracTracker terms |

Counts are as of the last ingest; the `/sources` page always shows what
actually shipped.

## Quick start

```bash
npm install
npm run data      # build every layer from upstream public sources
npm run dev
```

`npm run data` needs a network connection and **no API keys or credentials**.
Every dataset in this repository is reproducible from scratch by anyone.

## How it is built

Static Astro + TypeScript + Tailwind. No backend, no database, no accounts, no
analytics, no third-party scripts. The output is plain files, which keeps it
cheap to host, trivial to mirror, and hard to take down.

```
scripts/ingest/     Node ETL — one script per layer, dependency-free
  lib/util.mjs      shared helpers incl. a small ZIP/XLSX reader
  counties.mjs      Census county boundaries + interior points (run first)
  agencies-287g.mjs detention.mjs  data-centers.mjs  redlining.mjs  alpr.mjs
src/layers/         the schema (types.ts) and the layer registry (registry.ts)
src/lib/            map controller, i18n, shared geometry
src/components/     map UI and page content
public/data/        generated GeoJSON + CSV — the published open datasets
data/community/     community-maintained overlay (data-centre campaigns)
```

**Adding a layer** means writing one ingest script that emits the shared schema
and adding one entry to `src/layers/registry.ts`. The map, legend, filters,
detail panels, sources page, downloads and "near me" view are all generated
from that registry — nothing else needs to change.

## Design decisions worth knowing

**Geocoding without a geocoder.** ICE publishes 287(g) agreements with only a
county name and detention facilities with only a city. Both are resolved
against US Census reference geography — county interior points from the
Gazetteer, boundaries from TIGERweb. Because the join key is a Census GEOID
rather than anything Minnesota-specific, extending nationally is mostly a
matter of building a national county reference.

A 287(g) dot therefore marks a **jurisdiction, not a building**. Where several
agencies share a county, dots are spread on a small deterministic circle so
each stays selectable; every affected record is flagged.

**Location lookup that phones nobody.** The "near me" feature ships a static
list of Minnesota places from the Census Gazetteer and resolves the lookup
entirely in the browser. Sending a typed address to a geocoding service would
hand a third party exactly the data this project promises not to collect. The
trade is precision — results are town-level, not street-level — and the UI says
so.

**Honest confidence.** Every record carries a `confidence` value.
`probabilistic` on the camera layer is not decoration: the layer is
crowd-sourced, incomplete, and historical, and the absence of a dot is not
evidence that no camera exists.

**No spreadsheet dependency.** ICE and Census both ship `.xlsx`/`.zip`.
`scripts/ingest/lib/util.mjs` reads them with a ~120-line ZIP + worksheet
reader built on Node's `zlib`, rather than taking on a large, historically
CVE-prone parser for a project with this threat model.

## Refreshing the data

```bash
npm run data            # everything, in dependency order
npm run data:287g       # or one layer
SCOPE=national npm run data:287g   # ingest all states, not just MN
```

A failing layer does not abort the run: upstream sources here are
volunteer-run Overpass mirrors and federal web servers that go down without
notice, and keeping yesterday's good file beats replacing it with nothing.

`.github/workflows/refresh-data.yml` runs the pipeline on a schedule and opens
a pull request when the data changes, so every refresh is reviewable rather
than silently applied.

## Deployment

Static output — deploy `dist/` anywhere. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
for tile-server configuration (do not point production traffic at OpenStreetMap's
volunteer tile servers) and mirroring guidance.

## Licence

Code is **MIT**. Data we compile is **CC BY 4.0**. Upstream layers keep their
own terms and some are non-commercial or share-alike — read
[LICENSE-DATA.md](LICENSE-DATA.md) before redistributing.

## Contributing

The highest-leverage contribution is mapping a camera in OpenStreetMap, which
improves this map and every other project built on the same data. See the
`/contribute` page.

Contributions describe devices, buildings, agencies and policies — **never
people**. Anything identifying a private individual, an officer, or an agent
will be rejected.

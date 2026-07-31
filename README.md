<div align="center">

# get-flocked

**A free, open-source map of the systems watching your neighbourhood — built by the community, for the community. Starting in Minnesota.**

[![Code: MIT](https://img.shields.io/badge/code-MIT-blue.svg)](LICENSE)
[![Data: CC BY 4.0](https://img.shields.io/badge/data-CC%20BY%204.0-green.svg)](LICENSE-DATA.md)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#contributing--we-need-you)

</div>

---

## What is this?

Licence-plate cameras are going up on ordinary poles. Sheriffs are quietly
signing agreements with ICE. County jails are renting beds to federal
immigration authorities. Data centres are breaking ground next door. And the
lines drawn around neighbourhoods in the 1930s still shape who lives where.

**Every one of those facts is public record.** They're also scattered across
agency spreadsheets, permit filings, and university archives — which makes them
public in theory and invisible in practice.

get-flocked stitches them onto one map, so a resident can stand at their own
address and see the whole system around them. Not a stack of separate stories.
One connected system.

> **Transparency for systems. Privacy for people.**
>
> Every layer here describes an institution, a building, a contract, or a
> policy. **No layer describes, names, or tracks a private individual** — not
> detainees, not officers, not agents, not residents. That's a hard boundary
> enforced in the code, not a promise in a footer: the data schema has no field
> that could hold a personal identifier, and it never will.

## Free, and staying that way

This is a public good, not a product.

- **No paywall. No account. No login.** Look at anything, download everything.
- **No trackers, no analytics, no ads.** Zero third-party scripts. We do not
  become the thing we map.
- **No server that could log you.** The site is static files. When you look up
  your address, the search runs *in your browser* against a place list shipped
  with the page — nothing you type is sent anywhere, because there's nowhere
  for it to go.
- **Open code (MIT), open data (CC BY 4.0),** and every dataset rebuildable
  from scratch with no API keys. If you don't trust our numbers, regenerate
  them yourself in one command.

## What's on the map

| Layer | MN records | Where it comes from |
|---|---:|---|
| **287(g) agency agreements** | 10 | ICE's own published list (2,179 nationally) |
| **ALPR / Flock cameras** | ~1,400 | OpenStreetMap, mapped by volunteers |
| **ALPR corridors** | 744 | Derived: the road from each reader to its nearest neighbour, routed over OSM |
| **Redlining zones (HOLC)** | 168 | Mapping Inequality, Univ. of Richmond |
| **ICE-contract detention facilities** | 5 | ICE Over-72-Hour Facility List |
| **Data centres** | 20 | FracTracker Alliance FOIA records |
| **Racial covenants (aggregate)** | 2,567 cells | Mapping Prejudice, Univ. of Minnesota — 34,741 covenants across 8 counties |

The covenants layer is a deliberate aggregate: each record is a fixed 250-metre
cell reporting how many covenants were recorded inside it, never a row for one
property. The per-property data is Mapping Prejudice's to publish, not ours to
copy.

Plus the features that make it usable: a **"near me"** view that answers every
one of those questions about a single place at once, filters and search, a
**records-request generator** built on Minnesota's actual public records
statute, per-layer **downloads**, a **sources & methodology** page, and
English/Spanish throughout.

And the step in between: **who has to answer you**. Pick any of Minnesota's
2,757 cities, townships and unorganized territories — not just the 914
incorporated places — and the site names the offices that must answer a data
request for that ground, each with the statute that says so, and addresses the
letter to the one you choose. It also says plainly when the cameras near you
belong to a government you did not elect, which outside the bigger cities is
the ordinary case: a township board has an agenda and an election behind it,
and the readers inside its borders were bought by a county sheriff.

**The payoff:** three Minnesota counties have *both* a 287(g) agreement *and* a
jail holding people under ICE contract. Sherburne has the full stack — mapped
cameras, a Jail Enforcement agreement, and an ICE-contract jail. The site
computes that from the shipped data, so it updates when reality does.

## Contributing — we need you

**This map is only as good as the community that builds it.** Several layers
are literally community data, and the most useful contributions require no
coding at all.

### 🎯 Map a camera (highest impact, no coding)

The camera layer comes from **OpenStreetMap**, so a camera you add there
improves this map, [DeFlock](https://deflock.me), and every other project built
on the same open data — instead of disappearing into one site's private
database.

1. Get a free [OpenStreetMap account](https://www.openstreetmap.org/user/new)
2. Follow [DeFlock's mapping guide](https://deflock.me/how-to-map)
3. Tag the node `man_made=surveillance`, `surveillance:type=ALPR`

Our ingest re-queries OpenStreetMap on every refresh, so your addition shows up
here without anyone needing to approve it.

### 📢 Add a community campaign

Organising against a data centre? The upstream data records the *facility* but
not whether anyone is *fighting* it — which is often exactly what an organizer
needs. That field is community-maintained in
[`data/community/data-center-campaigns.json`](data/community/data-center-campaigns.json).
Open a PR with the campaign, the group, and a public source.

### 🐛 Tell us what's wrong

Found a bad location, a misleading label, a dataset we've misread? [**Open an
issue**](https://github.com/NgabantuDev/get-flocked/issues). Corrections to the
underlying records usually belong upstream (OpenStreetMap for cameras, the
publishing agency for the rest) and flow here automatically — we'll help you
work out which is which.

### 🌍 Translate

Spanish covers the UI and key guidance; the long-form pages are still English.
Given who this is for, finishing that translation — or adding Hmong, Somali, or
Karen, all widely spoken in Minnesota — is high-value work.

### 💻 Write code

Adding a whole new layer is **two files**: one ingest script that emits the
shared schema, plus one entry in
[`src/layers/registry.ts`](src/layers/registry.ts). The map, legend, filters,
detail panels, sources page and downloads all generate from that registry.

Particularly wanted: **extending the ingest nationally** (the geocoding already
keys on Census identifiers, so it mostly needs a national county reference).

### One rule for all contributions

Contributions describe **devices, buildings, agencies, and policies — never
people**. No photographs of people or licence plates, nothing identifying a
private individual, an officer, or an agent, and nothing obtained by
trespassing. Contributions describing a person will be rejected.

## Quick start

```bash
npm install
npm run data     # rebuild every layer from upstream public sources
npm run dev
```

`npm run data` needs a network connection and **no API keys, tokens, or
accounts** — deliberately. Anyone can reproduce every dataset in this
repository from scratch and check our work.

## How it's built

Static [Astro](https://astro.build) + TypeScript + Tailwind, with
[MapLibre](https://maplibre.org) and OpenStreetMap tiles. No backend, no
database, no accounts — which keeps it cheap to host, trivial to mirror, and
hard to take down.

```
scripts/ingest/     Node ETL — one script per layer, dependency-free
src/layers/         the schema (types.ts) and layer registry (registry.ts)
src/lib/            map controller, i18n, shared geometry
src/components/     map UI and page content
public/data/        generated GeoJSON + CSV — the published open datasets
data/community/     community-maintained overlays
```

<details>
<summary><strong>Design decisions worth knowing</strong></summary>

**Geocoding without a geocoder.** ICE publishes 287(g) agreements with only a
county name and facilities with only a city. Both resolve against US Census
reference geography. Because the join key is a Census GEOID rather than
anything Minnesota-specific, going national is mostly a matter of building a
national county reference. A 287(g) dot therefore marks a **jurisdiction, not a
building** — and where several agencies share a county, dots are spread on a
small deterministic circle so each stays clickable, flagged on every record.

**Location lookup that phones nobody.** Sending a typed address to a geocoding
service would hand a third party exactly the data this project promises not to
collect. So we ship the place index instead and resolve in-browser. The trade
is precision — town-level, not street-level — and the UI says so.

**Honest confidence.** Every record carries a `confidence` value.
`probabilistic` on the camera layer isn't decoration: that layer is
crowd-sourced, incomplete, and historical. **The absence of a dot is not
evidence that no camera exists.**

**Null over invented.** Where an upstream field doesn't exist, it stays `null`
and the gap is documented. Placeholder data in a civic transparency tool is
worse than a visible hole.

**No spreadsheet dependency.** ICE and Census ship `.xlsx`/`.zip`, read here by
a small `zlib`-based reader rather than a large, historically CVE-prone parser.

</details>

## Built on other people's work

Where an authoritative open dataset already exists, we integrate and attribute
rather than rebuild. This project would not exist without:

[**DeFlock**](https://deflock.me) and the OpenStreetMap volunteers who map
cameras · [**Mapping Inequality**](https://dsl.richmond.edu/panorama/redlining/)
(Univ. of Richmond) · [**Mapping
Prejudice**](https://mappingprejudice.umn.edu/) (Univ. of Minnesota) ·
[**FracTracker Alliance**](https://www.fractracker.org/) · [**EFF Atlas of
Surveillance**](https://atlasofsurveillance.org/) · the **U.S. Census Bureau**

## Deploying / mirroring

The build is plain static files, so it runs anywhere — and **mirrors are
welcome**. Grassroots ALPR mapping has drawn legal threats before; the
practical answer is being easy to copy.

```bash
npm install && npm run data && npm run build   # dist/ is the whole site
```

This project deploys to **Cloudflare Pages** (`wrangler.jsonc`), which builds a
preview URL for every pull request — so a contributor's fix can be reviewed by
clicking a link. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for setup, and
note the one thing you must change before real traffic: **point
`PUBLIC_TILE_URL` at your own tiles** rather than OpenStreetMap's volunteer
servers.

## Licence

Code **MIT**. Data we compile **CC BY 4.0**. Upstream layers keep their own
terms — the camera layer is ODbL share-alike, redlining is CC BY-NC-SA — and
those aren't ours to relax. Read [LICENSE-DATA.md](LICENSE-DATA.md) before
redistributing.

## Not legal advice

The records-request tools are informational. This map is not real-time, does
not track anyone, and every layer is incomplete in ways each one documents. If
you're facing enforcement action, talk to a lawyer.

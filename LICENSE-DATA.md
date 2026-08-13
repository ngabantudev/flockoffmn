# Data licensing

The **code** in this repository is MIT (see `LICENSE`). Data is a separate
question, and it is not uniform. Read this before redistributing anything from
`public/data/`.

## What we license

The work this project does itself — normalising sources into one schema,
geocoding records that arrive without coordinates, joining layers on Census
county identifiers, and the compiled outputs that result — is released under
**[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)**.

Attribute it as: *FlockOff contributors*, with a link to this repository.

## What we cannot license

Every layer is derived from an upstream dataset, and **repackaging it here does
not relicense it**. Where an upstream licence is more restrictive than CC BY
4.0, the upstream licence governs that layer.

| Layer | File | Upstream licence | Practical effect |
|---|---|---|---|
| ALPR cameras | `alpr.geojson` | [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) | **Share-alike.** Derived databases must stay open under ODbL. Attribution to OpenStreetMap contributors required. |
| ALPR corridors | `alpr-corridors.geojson` | [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) | **Share-alike.** This layer *is* the derived database the row above warns about — built from the camera layer and OpenStreetMap road geometry, so ODbL follows it. Attribution to OpenStreetMap contributors required. |
| 287(g) agreements | `287g.geojson` | Public domain (US federal work) | Free for any use. |
| Detention facilities | `detention.geojson` | Public domain (US federal work) | Free for any use. |
| Redlining zones | `redlining.geojson` | [CC BY-NC 2.5](https://creativecommons.org/licenses/by-nc/2.5/) | **Non-commercial.** Not usable commercially. (The project's pre-2023 terms were CC BY-NC-SA 4.0; the current site states CC BY-NC 2.5.) |
| Racial covenants | `covenants.geojson` | [CC0 1.0](https://creativecommons.org/public-domain/cc0/) | Free for any use. Citation requested by the upstream project, not required by the licence. What we publish is the parcel outlines with all personal fields stripped, not the full upstream research file (see below). |
| Data centers | `data-centers.geojson` | FracTracker Alliance terms, plus transcribed facts from four all-rights-reserved trackers (see below) | Attribution required, non-commercial. |
| Cumulative impacts (MPCA) | `ej-cumulative.geojson` | No formal licence published; public government data under [Minn. Stat. ch. 13](https://www.revisor.mn.gov/statutes/cite/13) | Attribute MPCA. Draft data (CI-MAP, December 2025); see the layer's `knownGaps`. |
| County, place and jurisdiction reference | `reference/*` | Public domain (US federal work) | Free for any use. |
| Flight sighting log | D1 table `flight_sightings` (via `functions/api/flight-log/*`) | [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) | **Share-alike, likely.** Attribution to adsb.lol required always. If this persisted table counts as a Derivative Database (plausible — see below), ODbL's offer-back clause applies. Not a static file in `public/data/`, so it is not covered by the CC BY 4.0 grant above either. |
| Basemap tile archive | `minnesota.pmtiles` (R2-hosted, not in this repo — see below) | [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) (data) + [CC BY](https://github.com/openmaptiles/openmaptiles/#license) (OpenMapTiles schema) | **Attribution only, not share-alike.** A rendered tile archive is a Produced Work under ODbL, not a Derivative Database — see below for why that distinction is the one that lets this ship at all. Two separate attributions required: OpenStreetMap contributors (data) and OpenMapTiles (schema) — see below. |

**Combining layers:** the most restrictive term governs the combination. A
product mixing the camera layer with the redlining layer inherits both ODbL
share-alike *and* CC BY-NC-SA non-commercial restrictions.

## Required attributions

Reproduce these when redistributing the corresponding layer:

- **Cameras** — © OpenStreetMap contributors, ODbL. Mapped by DeFlock volunteers.
- **287(g), detention** — U.S. Immigration and Customs Enforcement.
- **Redlining** — Robert K. Nelson, LaDale Winling, et al., "Mapping Inequality:
  Redlining in New Deal America," *American Panorama*, ed. Robert K. Nelson and
  Edward L. Ayers.
- **Racial covenants** — Corey, Michael; Petersen, Penny; Delegard, Kirsten;
  Gillette, Rebecca; Mattke, Ryan; Ehrman-Solberg, Kevin; Mills, Marguerite;
  crowdsourcing community mapmakers. (2026). *U.S. Racial Covenants Series*,
  hosted by Mapping Prejudice, University of Minnesota Libraries.
- **Cumulative impacts** — Minnesota Pollution Control Agency, Cumulative
  Impacts Mapping and Analysis Platform (CI-MAP), draft.
- **Data centers** — FracTracker Alliance; More Than Just Parks Data Center
  Tracker; Cleanview; Baxtel; PoweredByWho.
- **County, place and jurisdiction geography** — U.S. Census Bureau.
- **Flight sighting log** — © adsb.lol contributors, ODbL 1.0. Model notice
  text per the license: "Contains information from adsb.lol, which is made
  available here under the Open Database License (ODbL)."
- **Basemap** — © OpenMapTiles (tile schema, CC BY) © OpenStreetMap
  contributors (data, ODbL 1.0); Geofabrik credited as extract provenance,
  not a license holder. Rendered into the map's attribution control
  automatically (see `src/lib/mapStyle.ts`'s `TILE_ATTRIBUTION`).

## The data-center trackers

The data-center layer is the one place here where a source carries no open
licence, so the reasoning is written down rather than assumed.

FracTracker's FOIA permit file is the spine of the layer. Status, capacity and
the whole hyperscale build-out come from four trackers, none of which publishes
an API or a reuse licence:

| Tracker | Terms as stated | What we take |
|---|---|---|
| [More Than Just Parks](https://morethanjustparks.com/data-center-tracker/state/minnesota) | Beta preview; compiled from public records; publisher disclaims reliance | Project names, cities, statuses, megawatt figures |
| [Cleanview](https://cleanview.co/data-centers/minnesota) | Proprietary platform, free web access, no reuse licence stated | Independent statuses and capacities for the large projects |
| [Baxtel](https://baxtel.com/data-center/minnesota) | © all rights reserved; detailed specifications sold | Corroboration that an operator runs a site. Nothing paywalled |
| [PoweredByWho](https://poweredbywho.com/map) | Public-records journalism; explicitly not comprehensive | Context only; no figure in the layer rests on it |

What we reproduce is individual facts — that Meta is building at Rosemount, that
a tracker puts it at 308 MW — each attributed to the tracker asserting it, in a
file anyone can read. Facts are not copyrightable; a compilation can be, so we
do not copy any tracker's compilation, and we do not scrape their pages. Where
they disagree we publish the disagreement with both attributions rather than
laundering it into a single confident number.

That reasoning is ours, not legal advice. **If you redistribute this layer
commercially, the four trackers' terms are yours to resolve, not ours** — the
non-commercial restriction inherited from FracTracker already bites first.

## The covenant parcels

CC0 is the least restrictive dedication there is. Mapping Prejudice place no
condition on reuse of the covenant data, and the full research file could
lawfully be republished here in full.

We publish the parcel outlines but not the full file, and the reason is not
licensing. This layer shipped for a time as a 250-metre aggregate — counts per
grid cell, no parcel geometry. In August 2026 the project owner revisited that
decision: Mapping Prejudice draw these same lot outlines on their own public
map, and a covenant is a fact about land recorded in a public county index, so
the layer now shows the lots the source shows.

The line that did not move is personal data. The upstream record carries the
seller and buyer named in the original deed, the present-day street address,
the county parcel PIN and the deed document number. None of that is ingested;
`scripts/ingest/covenants.mjs` fails the build rather than write a file
containing a name, an address, or a parcel identifier, and it drops or
redacts clause text that embeds an address or a document number.

So `covenants.geojson` is still not a copy of the upstream dataset and should
not be used as one. **If you want the full per-property research data, get it
from Mapping Prejudice directly** — it is public, better maintained, and
theirs.

## The flight sighting log

**Vetted.** adsb.lol licenses both its live API and its historical trace
data under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/),
stated on their own docs (`adsb.lol/docs/open-data/api/`,
`adsb.lol/docs/open-data/historical/`) and in the `globe_history` repo's
`LICENSE-ODbL.txt`. This is the same license this project already handles
for the ALPR/OpenStreetMap layers above, so the same obligations apply:

- **Extraction** (ODbL's term for storing/persisting Contents into another
  medium) and **Re-utilisation** (redistributing/republishing them) are both
  explicitly permitted, including commercially, indefinitely.
- **Attribution is required, always** — see "Required attributions" below.
- **Share-alike likely applies.** ODbL distinguishes a "Produced Work" (only
  needs attribution) from a "Derivative Database" (must itself be ODbL-licensed,
  keep notices intact, and — per §4.6 — offer recipients a free, machine-readable
  copy if distributed online). A systematically stored, queryable
  hex/callsign/timestamp history reads more like the latter than the former.
  Treating it that way is the safer call, matching how this project already
  treats the ALPR layer's ODbL obligations.
- **Practical follow-up this implies:** add a bulk CSV/JSON export of the
  `flight_sightings` table (satisfies the §4.6 offer-back obligation, and is
  independently useful to legal teams doing bulk analysis rather than
  one-record-at-a-time lookups).

adsb.lol's data license does not depend on or inherit ADS-B Exchange's terms
— it is a separate project (github.com/adsblol) with its own ODbL grant, not
merely a "drop-in API-compatible" alias of ADSBX's own policies.

## The basemap tile archive

`minnesota.pmtiles` isn't in this repo — it's a ~150-350MB binary, built by
`scripts/tiles/build-basemap.mjs` from Geofabrik's Minnesota OSM extract and
hosted on a public Cloudflare R2 bucket that `src/lib/mapStyle.ts` reads at
runtime (see `docs/DEPLOYMENT.md` § Base map tiles for the full build/upload
runbook). It replaced a MapTiler-hosted raster basemap in August 2026 after
MapTiler's free-tier request ceiling turned out to have nothing caching
tile requests in front of it.

Two licenses stack here, not one. The tile *schema* planetiler emits —
layer names like `water`, `transportation`, `place` — is the OpenMapTiles
schema, released under CC BY; planetiler's own build output states this
requires a visible "© OpenMapTiles © OpenStreetMap contributors" credit.
Separately, the underlying *data* is OpenStreetMap's, under ODbL. Both are
satisfied by `TILE_ATTRIBUTION` in `mapStyle.ts`.

The ODbL distinction that matters for the data half is **Produced Work vs.
Derivative Database**. ODbL's share-alike obligation attaches to a *Derivative
Database* — a database built from the licensed data that is itself still
queryable/re-extractable. A *Produced Work* — the visible/rendered/printed
output of using a database, where the underlying data can't practically be
re-extracted from the output — only needs attribution. A rendered map image
(or, as here, a rendered vector tile set meant for direct display) is the
textbook Produced Work example ODbL's own FAQ uses. That's a genuinely
different case from this project's ALPR/corridor layers above, which *are*
Derivative Databases (they keep the queryable OSM road geometry itself,
joined against camera data) and do inherit share-alike. The basemap doesn't
carry forward a re-extractable copy of OSM's database — it carries forward a
rendering of it — so it ships under attribution alone. The source `.osm.pbf`
extract itself is never modified or redistributed, so no offer-back
obligation is triggered either way.

## A note on scope

No dataset here names or identifies a private individual, and none ever will.
If you extend this project, that boundary comes with the data. See the "what
this is and is not" page, or `src/layers/types.ts`, where the schema is
deliberately built without any field that could carry a personal identifier.

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
| 287(g) agreements | `287g.geojson` | Public domain (US federal work) | Free for any use. |
| Detention facilities | `detention.geojson` | Public domain (US federal work) | Free for any use. |
| Police & sheriff jurisdictions | `agency-jurisdictions.geojson` | No formal licence published; MESB disclaims warranty | Attribute MESB. Metro region only — see the layer's `knownGaps`. Carries a cross-referenced fact from a second Tier 1 source (BCA) as an attribute; see below. |
| Police & sheriff buildings | `agency-buildings.geojson` | No formal licence published; U-Spatial/USGS disclaim warranty | Attribute U-Spatial (University of Minnesota) and USGS. |
| BCA reported-LPR-use agencies (reference) | `reference/bca-alpr-agencies.json` | Public government data (Minn. Stat. ch. 13) | Free for any use. Not a public map layer — joined into the jurisdiction layer's attributes. |
| ALPR Cameras (BCA Reported) | `alpr-reported.geojson` | Public government data (Minn. Stat. ch. 13) for the filings; [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) for the road geometry used to place them | Attribute the BCA **and** OpenStreetMap contributors. The positions are derived against OSM road geometry, so ODbL attribution travels with them. |
| Redlining zones | `redlining.geojson` | [CC BY-NC 2.5](https://creativecommons.org/licenses/by-nc/2.5/) | **Non-commercial.** Not usable commercially. (The project's pre-2023 terms were CC BY-NC-SA 4.0; the current site states CC BY-NC 2.5.) |
| HOLC appraisal, block by block | `holc-detail.geojson` | **Mixed.** Geometry and class: public domain under the [MGDPA](https://www.revisor.mn.gov/statutes/cite/13). The `miArea` field only: Mapping Inequality, CC BY-NC 2.5 | Free for any use **once `miArea` is dropped**; with it, non-commercial. See below — this is the one file here whose licence varies by column, and it is deliberate. |
| HOLC area ↔ census tract crosswalk (reference) | `reference/holc-tract-crosswalk.json` | CC BY-NC, version unstated upstream (repo has no `LICENSE` file; the parent project states [2.5](https://creativecommons.org/licenses/by-nc/2.5/)) | **Non-commercial.** Not a public map layer — read by the redlining ingest to put each graded area's 2020 tracts and coverage shares on it. |
| Racial covenants | `covenants.geojson` | [CC0 1.0](https://creativecommons.org/public-domain/cc0/) | Free for any use. Citation requested by the upstream project, not required by the licence. What we publish is the parcel outlines with all personal fields stripped, not the full upstream research file (see below). |
| Data centers | `data-centers.geojson` | FracTracker Alliance terms, plus transcribed facts from four all-rights-reserved trackers (see below) | Attribution required, non-commercial. |
| Cumulative impacts (MPCA) | `ej-cumulative.geojson` | No formal licence published; public government data under [Minn. Stat. ch. 13](https://www.revisor.mn.gov/statutes/cite/13) | Attribute MPCA. Draft data (CI-MAP, December 2025); see the layer's `knownGaps`. |
| County, place and jurisdiction reference | `reference/*` | Public domain (US federal work) | Free for any use. |
| Basemap tile archive | `minnesota.pmtiles` (R2-hosted, not in this repo — see below) | [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) (data) + [CC BY](https://github.com/openmaptiles/openmaptiles/#license) (OpenMapTiles schema) | **Attribution only, not share-alike.** A rendered tile archive is a Produced Work under ODbL, not a Derivative Database — see below for why that distinction is the one that lets this ship at all. Two separate attributions required: OpenStreetMap contributors (data) and OpenMapTiles (schema) — see below. |

**Combining layers:** the most restrictive term governs the combination. A
product mixing the camera layer with the redlining layer inherits both ODbL
share-alike *and* CC BY-NC-SA non-commercial restrictions.

## Required attributions

Reproduce these when redistributing the corresponding layer:

- **Cameras** — © OpenStreetMap contributors, ODbL. Mapped by DeFlock volunteers.
- **287(g), detention** — U.S. Immigration and Customs Enforcement.
- **Police & sheriff jurisdictions** — Metropolitan Emergency Services Board,
  MESB Region PSAPs and Emergency Response Agencies. ALPR-reporting status
  cross-referenced from the Minnesota Bureau of Criminal Apprehension.
- **Police & sheriff buildings** — U-Spatial, University of Minnesota;
  U.S. Geological Survey.
- **ALPR Cameras (BCA Reported)** — Minnesota Bureau of Criminal
  Apprehension, published under Minn. Stat. § 13.824; positions resolved
  against © OpenStreetMap contributors, ODbL.
- **Redlining** — Robert K. Nelson, LaDale Winling, et al., "Mapping Inequality:
  Redlining in New Deal America," *American Panorama*, ed. Robert K. Nelson and
  Edward L. Ayers.
- **HOLC appraisal, block by block** — Metropolitan Council, "Historic Home
  Owners' Loan Corporation Neighborhood Appraisal Map." Area identifiers on each
  block from Mapping Inequality (see Redlining above).
- **HOLC area ↔ census tract crosswalk** — Robert K. Nelson, LaDale Winling,
  et al., "Mapping Inequality: Redlining in New Deal America," crosswalked
  against NHGIS 2020 census tracts by the Digital Scholarship Lab, University of
  Richmond.
- **Racial covenants** — Corey, Michael; Petersen, Penny; Delegard, Kirsten;
  Gillette, Rebecca; Mattke, Ryan; Ehrman-Solberg, Kevin; Mills, Marguerite;
  crowdsourcing community mapmakers. (2026). *U.S. Racial Covenants Series*,
  hosted by Mapping Prejudice, University of Minnesota Libraries.
- **Cumulative impacts** — Minnesota Pollution Control Agency, Cumulative
  Impacts Mapping and Analysis Platform (CI-MAP), draft.
- **Data centers** — FracTracker Alliance; More Than Just Parks Data Center
  Tracker; Cleanview; Baxtel; PoweredByWho.
- **County, place and jurisdiction geography** — U.S. Census Bureau.
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

## The two HOLC layers

`redlining.geojson` and `holc-detail.geojson` are two independent digitisations
of the same 1930s appraisal map, and they are kept as two files on purpose.

Mapping Inequality drew the graded neighbourhood *areas* across eight Minnesota
cities, each carrying the identifier HOLC printed on it — which is what lets the
transcribed appraiser survey sheets attach to them. That prose is the
evidentiary core of the layer and nothing else here can substitute for it. The
Metropolitan Council traced the *colour* on the Minneapolis–St. Paul sheet block
by block: two cities instead of eight, one attribute and no area identifier, but
roughly seventy times the resolution, and lakes and parks excluded rather than
absorbed into a neighbourhood outline.

Merging them into one file was considered and rejected, and the reason is
concrete rather than tidiness. The Met Council file is public domain under Minn.
Stat. ch. 13; Mapping Inequality's is CC BY-NC. Under the combining rule above,
one merged file would be governed by the more restrictive term, so a merge would
place public-domain government data under a non-commercial restriction
permanently, and nobody downstream could undo it. It would also destroy the
distinction between a graded *area* and a block fragment, which is what makes
"how many areas were graded D" answerable at all.

The two are joined in the interface instead. Each source is asked only what it
can answer: the Metropolitan Council says what colour a block is, Mapping
Inequality says which area that block belongs to and what the appraiser wrote
about it. So a park inside area D3 reads "Park / Open Space, in HOLC area D3" —
the finer tracing is more specific about the ground, not a correction of the
coarser one.

**Why one field carries a different licence.** That design puts exactly one
Mapping Inequality-derived value into `holc-detail.geojson`: `miArea`, the
identifier HOLC itself printed on the surrounding area, resolved per block by
containment. The identifier is a historical fact and facts are not
copyrightable; the compilation it was read out of is licensed. Rather than
argue that distinction either way, the table above states it plainly — the
geometry and the class are public-domain government data, and a commercial
reuser who drops `miArea` is taking nothing of Mapping Inequality's. Both
publishers are named in the file's own provenance regardless.

**Why the crosswalk is not a layer.** The HOLC-area-to-census-tract overlap
shipped briefly as a third drawn layer and was close to useless as one: 922
slivers that are just the redlining areas chopped along tract lines, showing
nothing the redlining layer does not already show. Its value was never the
geometry — it is the join key and the coverage share. So the geometry is
discarded at ingest and what survives is the table, read by `redlining.mjs` to
put each area's tracts and shares on the area itself. Blocks need none of it: a
block sits inside exactly one tract and resolves its own.

**Why the agreement rate is recomputed rather than remembered.** The
Metropolitan Council's metadata states plainly that its source image was
non-georeferenced and its accuracy unknown. `scripts/ingest/holc-detail.mjs`
therefore tests every polygon against the independently georeferenced areas on
every run and writes the measured rate into the file's own provenance and known
gaps — a check a reader can see, rather than a number someone typed once and
nobody revisited.

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
different case from this project's ALPR layer above, which *is* a Derivative
Database (it keeps the queryable OSM point data itself) and does inherit
share-alike. The basemap doesn't
carry forward a re-extractable copy of OSM's database — it carries forward a
rendering of it — so it ships under attribution alone. The source `.osm.pbf`
extract itself is never modified or redistributed, so no offer-back
obligation is triggered either way.

## A note on scope

No dataset here names or identifies a private individual, and none ever will.
If you extend this project, that boundary comes with the data. See the "what
this is and is not" page, or `src/layers/types.ts`, where the schema is
deliberately built without any field that could carry a personal identifier.

# Data licensing

The **code** in this repository is MIT (see `LICENSE`). Data is a separate
question, and it is not uniform. Read this before redistributing anything from
`public/data/`.

## What we license

The work this project does itself — normalising sources into one schema,
geocoding records that arrive without coordinates, joining layers on Census
county identifiers, and the compiled outputs that result — is released under
**[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)**.

Attribute it as: *get-flocked contributors*, with a link to this repository.

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
| Redlining zones | `redlining.geojson` | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) | **Non-commercial and share-alike.** Not usable commercially. |
| Data centres | `data-centers.geojson` | FracTracker Alliance terms, plus transcribed facts from four all-rights-reserved trackers (see below) | Attribution required, non-commercial. |
| County, place and jurisdiction reference | `reference/*` | Public domain (US federal work) | Free for any use. |

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
- **Data centres** — FracTracker Alliance; More Than Just Parks Data Center
  Tracker; Cleanview; Baxtel; PoweredByWho.
- **County, place and jurisdiction geography** — U.S. Census Bureau.

## The data-centre trackers

The data-centre layer is the one place here where a source carries no open
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

## A note on scope

No dataset here describes a private individual, and none ever will. If you
extend this project, that boundary comes with the data. See the "what this is
and is not" page, or `src/layers/types.ts`, where the schema is deliberately
built without any field that could carry a personal identifier.

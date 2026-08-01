# Data centres — multi-source build-out

**Date:** 2026-08-01
**Layer:** `data_center` (L4)
**Status:** approved

## Why

The `data_center` layer ships 20 Minnesota facilities drawn from FracTracker's
FOIA permit file. Almost all of them are small enterprise server rooms — a
UnitedHealth IT closet in Golden Valley, the General Mills machine room on 2nd
Street. The permit file carries no status and no power source, so both fields
are hardcoded `null`, which leaves two registered filters wired to nothing.

What the layer does not show is the part that matters: the hyperscale build-out.
Meta at Rosemount, Microsoft at Becker, Cielo at Chisago, Scannell at
Monticello, and the string of proposals that were withdrawn after people
organised against them.

This layer is **contextual, not authoritative**. The site's subject is mass
surveillance infrastructure; data centres appear because they are the physical
substrate that storage, analytics and plate-reader networks run on, and because
they impose local costs — power, water, land, abatements — that give people a
reason to show up to a council meeting. The layer is informational. It is not a
facility registry and must not present itself as one.

## Sources

Four public trackers, none of which publishes an API or an open licence:

| Key | Site | Character |
|---|---|---|
| `mtjp` | morethanjustparks.com/data-center-tracker/state/minnesota | Beta preview; compiled from public records; publisher disclaims reliance |
| `cleanview` | cleanview.co/data-centers/minnesota | Proprietary platform, free web access, no stated reuse licence |
| `baxtel` | baxtel.com/data-center/minnesota | © all rights reserved; detailed specs paywalled |
| `poweredbywho` | poweredbywho.com/map | Public-records journalism; explicitly not comprehensive |

We transcribe individual facts — a project name, a city, a megawatt figure —
and cite each one to the tracker that asserts it. We do not reproduce any
tracker's compilation, and we do not scrape their markup.

The four disagree. Cleanview lists Meta Rosemount as operating; MoreThanJustParks
lists it as under construction and separately as proposed. Becker is Microsoft
per Cleanview, Amazon-cancelled and Google-cancelled per MoreThanJustParks. The
design records the disagreement rather than resolving it.

## Decisions

1. **Curated JSON, not scraping.** A reviewable file under `data/community/`,
   refreshed by pull request. Keeps ETL dependency-free and deterministic, and
   avoids parsing copyrighted beta markup that breaks on every redesign.
2. **Conflicts are shown, not resolved.** `status` takes the most conservative
   claim; `statusDisputed` marks the disagreement; the detail panel lists what
   each source says with its link.
3. **Coordinates are hand-entered with a stated precision.** `site` where a
   public record identifies the parcel, `city` otherwise. No cloud geocoder,
   per the client constraints.
4. **Cancelled and withdrawn projects ship**, excluded from the default filter
   state. A withdrawn proposal is where opposition worked; it should be findable
   without reading as live infrastructure.
5. **Curated entries enrich matching permit records in place**, so one building
   is one dot.

## Architecture

```
FracTracker ArcGIS query (MN permit records)
        │
        ├─ data/community/data-center-projects.json
        │     ├─ match on slugId, then name+city
        │     │     → fill null status/powerSource/capacityMw on the permit
        │     │       feature, attach claims, keep the permit geometry
        │     └─ no match
        │           → new feature, origin 'curated', coords from the file
        │
        └─ data/community/data-center-campaigns.json  (existing, unchanged)
                │
                ▼
        public/data/data-centers.{geojson,csv}
```

### Files

| File | Change |
|---|---|
| `data/community/data-center-projects.json` | new — curated projects |
| `scripts/ingest/data-centers.mjs` | merge curated projects onto the permit base |
| `src/layers/registry.ts` | filters, detail fields, four-source provenance |
| `src/layers/types.ts` | `SourceRef`, `Provenance.secondarySources`, `FilterDefinition.defaultExcluded` |
| `src/components/pages/Sources.astro` | render secondary sources |
| `LICENSE-DATA.md` | record the four trackers and the transcription rationale |

The two schema additions are generic capabilities available to every layer, not
data-centre special cases. The sources page can currently render exactly one
citation per layer, which is why four sources cannot be credited today.

### Curated entry schema

```jsonc
{
  "name": "Meta Rosemount Campus",
  "operator": "Meta Platforms",
  "city": "Rosemount",
  "county": "Dakota County",
  "coordinates": [-93.0234, 44.7391],
  "locationPrecision": "site",
  "capacityMw": 308,
  "status": "under-construction",
  "statusDisputed": true,
  "powerSource": null,
  "claims": [
    { "field": "status", "value": "operating", "source": "cleanview", "url": "..." },
    { "field": "status", "value": "under-construction", "source": "mtjp", "url": "..." }
  ],
  "sourceDate": "2026-07"
}
```

Rules, enforced by the ingest rather than by convention:

- Every non-null field must be backed by at least one entry in `claims`. A field
  with no claim fails the build. This is the no-fabrication rule made mechanical.
- `statusDisputed` is computed, not authored: set when `claims` holds two
  different values for `status`.
- `county` is verified against the coordinate by point-in-polygon. A mismatch
  fails the build, which catches a mistyped coordinate.
- No individual is named anywhere. Operators are companies; opposition is groups.

**Status values:** `operating`, `under-construction`, `proposed`, `cancelled`,
`withdrawn`. Conflict resolution takes the lowest claimed value on the ordering
`proposed < under-construction < operating`, so a disagreement never renders as
"operating".

### New attributes

`capacityMw`, `statusDisputed`, `disputedNote`, `locationPrecision`, `origin`
(`permit` | `curated`), `sourceUrls`.

`status` and `powerSource` stop being uniformly null, which makes the two
already-registered filters function for the first time.

## Known gaps

- The four sources disagree on status and operator for several projects. The
  disagreement is displayed, not resolved.
- The curated file refreshes by pull request, not on a schedule.
- Capacity figures are as announced by developers and are routinely revised.
- Coverage is not complete. Baxtel claims to track 75 Minnesota facilities but
  gates most behind payment; MoreThanJustParks summarises 60 operational sites
  while naming a fraction. The curated file covers the projects the sources name
  explicitly — the hyperscale and proposed build-out — and the layer states this
  rather than implying a full census.
- This is a contextual layer. It is not a facility registry and should not be
  cited as one.

## Verification

- `npm run data:datacenters` completes; claim-backing and county assertions pass.
- `npm run check` stays at 0 errors.
- `npm run build` succeeds.
- Spot-check the merged output for the three conflict cases: Rosemount, Becker,
  Monticello.
- The DOM record list stays in sync with drawn features.

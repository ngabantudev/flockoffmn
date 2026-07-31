# Working in this repository

## The one rule

**Transparency for systems; privacy for people.** Every record describes an
institution, a piece of infrastructure, a contract, or a historical policy.
Nothing describes, names, or tracks a private individual — not detainees, not
officers, not agents, not residents.

This is enforced structurally: `src/layers/types.ts` has no field that could
carry a personal name, case number, or individual identifier. Do not add one.
If an upstream source mixes individual records into systemic data, take the
systemic part and drop the rest. When in doubt, leave it out.

Aggregate, de-identified statistics about the *system* (facility-level counts,
court-level rates) are systemic data and may appear as clearly-labelled
aggregate layers — counts and rates only, never rows about people.

## Development

```bash
npm install
npm run data      # rebuild all layers from upstream (needs network, no keys)
npm run dev
npm run check     # astro check — keep this at zero errors
npm run build
```

When starting the dev server for a long session, use background mode:

```
astro dev --background
```

Manage it with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Architecture

The layer registry is the source of truth. `src/layers/registry.ts` drives the
map, legend, filters, detail panels, sources page, downloads, and the "near me"
view. **Adding a layer is two files**: an ingest script that emits the shared
schema to `public/data/`, and one registry entry. If you find yourself editing
a component to add a layer, the abstraction has been bypassed — fix that
instead.

- `scripts/ingest/` — Node ETL, deliberately dependency-free. `lib/util.mjs`
  carries a small ZIP/XLSX reader so the project does not take on a spreadsheet
  parser. `counties.mjs` must run before anything else; every other layer uses
  its output to geocode or to tag a county.
- `src/lib/geo.mjs` — shared by the ingest scripts *and* the browser, on
  purpose. Build-time county assignment and the in-browser "near me" lookup
  must not drift apart.
- `src/lib/authority.mjs` — shared for the same reason: which office has to
  answer a request is named beside a record on one page and written onto a
  letter on another, and those have to be the same office. It returns
  **offices, never individuals**, and every office it names is the statutory
  default in Minn. Stat. § 13.02, subd. 16(b), cited in place. If you add an
  office, cite the statute next to it or do not add it.
- `src/layers/data.ts` — build-time reader. Pages show what the generated files
  actually contain, not what the registry claims, so counts and dates cannot go
  stale.

## Conventions that matter here

**State honest limits everywhere.** Every layer carries `limitations` and
`knownGaps`, and they are rendered next to the data, not buried on an about
page. A layer whose caveats are not written is not finished.

**`confidence` is load-bearing.** `probabilistic` on the camera layer means the
record may be stale or wrong. Do not present probabilistic data with the same
visual confidence as a signed federal record.

**Never fabricate a record.** If an upstream field does not exist — power source
and operating status on data centres, for instance — leave it `null` and say so
in `knownGaps`. Placeholder or inferred data in a civic transparency tool is
worse than a gap. Community-sourced fields live in `data/community/` and stay
null until a contributor cites a public source.

**Prefer failing loudly at ingest.** Scripts throw rather than write a partial
or empty layer over good data. `build-all.mjs` keeps the previous file when a
source is unreachable.

**No third-party anything in the browser.** No analytics, no fonts, no embeds,
no geocoding calls. The "near me" lookup ships a static place index precisely
so a typed address never leaves the device. See `docs/DEPLOYMENT.md`.

**Accessibility is not optional.** The map canvas is unreadable to a screen
reader, so the record list beside it is the accessible equivalent and must stay
in sync with what is drawn. Keep focus visible, respect
`prefers-reduced-motion`, and label every control.

## Adding or changing a data source

1. Write the ingest script; it must need no API key or credential.
2. Record real provenance — source URL, licence, attribution, source date.
3. Write the `knownGaps` honestly, including anything you inferred or displaced.
4. Check the licence before adding it to `LICENSE-DATA.md`. Upstream terms are
   not ours to relax; several layers here are share-alike or non-commercial.

## Documentation

- Astro: https://docs.astro.build
- [Routing](https://docs.astro.build/en/guides/routing/) ·
  [Components](https://docs.astro.build/en/basics/astro-components/) ·
  [Styling](https://docs.astro.build/en/guides/styling/) ·
  [i18n](https://docs.astro.build/en/guides/internationalization/)
- MapLibre GL JS: https://maplibre.org/maplibre-gl-js/docs/

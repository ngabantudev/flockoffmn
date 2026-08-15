# Map sprites

MapLibre renders a style's icon-based layers (road shields, POI markers,
etc.) from a spritesheet — a single image plus a JSON index mapping names to
pixel positions — served from the URL in the style's `sprite` property.

## What is here

`ofm.json`, `ofm@2x.json`, `ofm.png`, `ofm@2x.png` — one shared sprite set,
used by all four basemap styles (`src/lib/basemapStyles/*.json`). Mirrored
from OpenFreeMap (`tiles.openfreemap.org/sprites/ofm_f384/ofm`, MIT-licensed)
by `scripts/tiles/mirror-basemap-styles.mjs` rather than fetched live, for
the same reason `public/fonts/README.md` vendors glyphs instead of pointing
at a third-party font server: a visitor's browser should never announce
itself to OpenFreeMap just to draw an icon, on every pan and zoom.

Re-run the mirror script to refresh these if OpenFreeMap's sprite set
changes upstream (new icons, a redesign) — no automatic schedule; see
`docs/DEPLOYMENT.md`'s "Refreshing the four basemap styles" section.

## Licence

OpenFreeMap's sprite assets are part of the same MIT-licensed project as the
basemap styles themselves. Not covered by this project's own MIT code
licence or CC BY 4.0 data licence — it's a third project's asset, mirrored
under its own terms.

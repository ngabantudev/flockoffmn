# Map glyphs

MapLibre renders map text from pre-baked signed-distance-field glyph ranges
(`.pbf`), served from the URL in the style's `glyphs` property.

These are vendored rather than fetched from MapLibre's public demo glyph server
because loading them from a third party would make every visitor's browser
announce itself to that host just to draw a number on a cluster bubble — which
is precisely what the "no third-party fonts, scripts, or embeds" rule on the
*What this is* page rules out. The basemap tile host is the one external
request this site makes, and it is disclosed and attributed.

## What is here

- `Noto Sans Regular/0-255.pbf` — Basic Latin and Latin-1 Supplement.

Only one range is vendored because the only text drawn on the map is cluster
counts, which are digits. Every label a reader needs in prose lives in the HTML
beside the map, not baked into the canvas — which is also what makes that
content reachable by a screen reader.

If you add a map layer that renders text outside this range (place labels, or
any non-Latin script), fetch the additional ranges and drop them in alongside:

```bash
curl -o "public/fonts/Noto Sans Regular/256-511.pbf" \
  "https://demotiles.maplibre.org/font/Noto%20Sans%20Regular/256-511.pbf"
```

Missing ranges fail quietly — the text simply does not draw — so check the
network tab if a label goes missing.

## Licence

Noto Sans is licensed under the
[SIL Open Font License 1.1](https://openfontlicense.org/), which permits
redistribution including as part of a larger work. It is not covered by this
project's MIT code licence or CC BY 4.0 data licence.

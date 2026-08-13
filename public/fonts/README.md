# Map glyphs

MapLibre renders map text from pre-baked signed-distance-field glyph ranges
(`.pbf`), served from the URL in the style's `glyphs` property.

These are vendored rather than fetched from MapLibre's public demo glyph server
because loading them from a third party would make every visitor's browser
announce itself to that host just to draw a number on a cluster bubble — which
is precisely what the "no third-party fonts, scripts, or embeds" rule on the
*What this is* page rules out. The self-hosted basemap archive (see
src/lib/mapStyle.ts) is the one external request this site makes, and it is
disclosed and attributed.

## What is here

- `Noto Sans Regular/0-255.pbf` — Basic Latin and Latin-1 Supplement.
- `Noto Sans Regular/256-511.pbf` — Latin Extended-A, which covers the
  macrons in Dakota and Ojibwe place names (e.g. Bdóte, Mní Sóta) that the
  basemap's `base-place-label`/`base-transportation-name` layers draw
  (mapStyle.ts). Missing this range means those specific names would
  silently fail to render while every ASCII name kept working — the kind of
  gap that's easy not to notice, which is exactly why it's vendored now
  instead of waiting to be reported.

Two ranges are vendored because the basemap now draws place and road-name
labels (it didn't before — the old MapTiler raster tiles baked labels into
the image instead), on top of the cluster-count digits every other layer on
this map has always needed.

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

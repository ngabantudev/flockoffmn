#!/usr/bin/env bash
# scripts/build-pmtiles.sh
#
# Converts the raw GeoJSON pulled by fetch-flock-cameras.mjs / fetch-city-wards.mjs
# into PMTiles archives, via tippecanoe -> mbtiles -> `pmtiles convert`.
# Layer names (-l) must match the fallbackLayerName values in
# src/data/mapLayers.ts so MapParent.astro's dynamic source-layer discovery
# has a working fallback if a PMTiles archive ever ships without vector_layers
# metadata.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RAW="$ROOT/data/raw"
TILES="$ROOT/data/tiles"

mkdir -p "$TILES"

for cmd in tippecanoe pmtiles; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "error: '$cmd' is required but not installed (brew install $cmd)" >&2
    exit 1
  fi
done

build_layer() {
  local input="$1" layer_id="$2" layer_name="$3" extra_flags="$4"
  local mbtiles="$TILES/$layer_id.mbtiles"
  local pmtiles_file="$TILES/$layer_id.pmtiles"

  if [ ! -f "$input" ]; then
    echo "skip: $input not found (run the matching fetch-*.mjs script first)"
    return
  fi

  echo "==> building $layer_id.pmtiles from $(basename "$input")"
  rm -f "$mbtiles" "$pmtiles_file"
  # shellcheck disable=SC2086
  tippecanoe \
    --output="$mbtiles" \
    --layer="$layer_name" \
    --name="$layer_name" \
    --force \
    $extra_flags \
    "$input"

  pmtiles convert "$mbtiles" "$pmtiles_file"
  rm -f "$mbtiles"
  echo "==> wrote $pmtiles_file"
}

# --drop-rate=1 disables tippecanoe's default dot-density thinning, which
# otherwise silently drops the large majority of points at every zoom below
# maxzoom (it's built for huge POI datasets where losing detail while zoomed
# out is fine — wrong for a transparency tool where every camera should be
# countable). --cluster-distance merges nearby points into a single feature
# carrying an accurate point_count instead of dropping them, so zoomed-out
# views stay readable without losing data — src/data/mapLayers.ts renders
# those as numbered bubbles. --drop-densest-as-needed stays on purely as a
# safety valve for an individual tile that's literally too many bytes;
# irrelevant at MN scale but will matter once this covers the whole country.
#
# --cluster-maxzoom=7 forces clustering to stop entirely by z8 — individual
# cameras should be identifiable from a regional/metro view, not just once
# you've zoomed all the way to street level. Without an explicit cutoff,
# tippecanoe's own default reaches z24, and since we only generate real
# tile data up to --maximum-zoom, any camera still bundled into a bubble at
# the tileset's maxzoom can never resolve into an individual dot (MapLibre
# just re-renders the same frozen tile bigger as you zoom further in).
# --maximum-zoom is forced to 10 explicitly rather than left to -zg's guess
# — -zg kept re-guessing a much deeper zoom ("most features distinct by
# then"), which reintroduces the exact stuck-bubble problem since no tile
# data existed past the clustering cutoff. Forcing 10 gives real per-point
# tile data a couple of zoom levels past the cutoff.
build_layer "$RAW/flock-cameras.geojson" "flock-cameras" "mn_flock_cameras" \
  "--drop-rate=1 --cluster-distance=50 --cluster-maxzoom=7 --maximum-zoom=10 --drop-densest-as-needed"

build_layer "$RAW/city-wards.geojson" "city-wards" "mn_city_wards" \
  "-zg --detect-shared-borders"

echo "done."

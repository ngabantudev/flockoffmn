#!/usr/bin/env bash
# scripts/upload-pmtiles.sh
#
# Uploads built PMTiles archives to the project's R2 bucket. Requires the
# bucket to already exist and `wrangler` to be authenticated
# (`wrangler login`). Bucket name comes from R2_BUCKET_NAME so it isn't
# hardcoded before the bucket is actually provisioned.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TILES="$ROOT/data/tiles"

: "${R2_BUCKET_NAME:?Set R2_BUCKET_NAME to the target R2 bucket name}"

if ! command -v wrangler >/dev/null 2>&1 && ! npx --no-install wrangler --version >/dev/null 2>&1; then
  echo "error: wrangler is required (installed as a devDependency; try 'npx wrangler --version')" >&2
  exit 1
fi

shopt -s nullglob
files=("$TILES"/*.pmtiles)
if [ ${#files[@]} -eq 0 ]; then
  echo "error: no .pmtiles files found in $TILES (run build-pmtiles.sh first)" >&2
  exit 1
fi

for file in "${files[@]}"; do
  name="$(basename "$file")"
  echo "==> uploading $name to r2://$R2_BUCKET_NAME/$name"
  npx wrangler r2 object put "$R2_BUCKET_NAME/$name" --file="$file" --remote
done

echo "done."

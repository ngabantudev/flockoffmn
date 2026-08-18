# scripts/ingest/national/

Ingest scripts that work for **any US state** — they key off Census
identifiers (`STATE_FIPS`, `STATE_USPS`, `STATE_ISO`, `STATE_NAME`) rather
than anything Minnesota-specific. Set those in `.env` (see
`.env.example`) and run.

Forking this project for another state? Start here, then read
[PORTING.md](../../../PORTING.md) at the repo root for the full
layer-by-layer breakdown, including the one coupling in this folder worth
knowing about (`demographics.mjs` borrows tract geometry from `../mn/ej-cumulative.mjs`).

See `../mn/README.md` for the scripts built against Minnesota-specific
sources instead.

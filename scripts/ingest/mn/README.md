# scripts/ingest/mn/

Ingest scripts built against a **Minnesota-specific** statute, agency, or
research partnership — the Metropolitan Emergency Services Board, the BCA's
Minn. Stat. § 13.824 filings, MnDOT, MPCA's CI-MAP, Mapping Prejudice's
county-by-county covenant work, and the hand-transcribed public-records
vendor-contracts file. Nothing in `../national/` depends on any of these.

Forking this project for another state? Each of these is either a template
to adapt to your own state's equivalent source, or a layer to drop — see
[PORTING.md](../../../PORTING.md) at the repo root for the specific call on
each script. `vendor-contracts.mjs` is a special case: it can never be
ported by running code against a different state, only by filing your own
state's public-records request and transcribing the result the same way.

See `../national/README.md` for the scripts that work for any US state.

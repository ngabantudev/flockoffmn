# Contributing to FlockOff

Thanks for being here. This project is community data, community-corrected,
and meant to outlive any one maintainer — that only works if reporting a
problem or adding a source is easy. This file is the quick reference; the
[README's "Contributing" section](README.md#contributing--we-need-you) has
the fuller walkthrough for mapping a camera, adding a campaign, or writing
code.

## Setup

```bash
npm install
npm run data      # rebuild all layers from upstream (network required, no keys)
npm run dev        # start the local dev server
npm run check      # type-check — must stay at 0 errors before you open a PR
```

No account, no API key, and no config file is required to get the site
running locally. `CENSUS_API_KEY` in `.env` (see `.env.example`) is only
needed if you're re-running the demographics ingest yourself.

## Reporting a bad record

[Open an issue](https://github.com/ngabantudev/flockoffmn/issues) — use the
**Data correction** template. Tell us the layer, the feature, and what's
wrong (wrong location, stale contract, dead link, misread document). If the
error originates upstream (OpenStreetMap for cameras, the publishing agency
for everything else), we'll help route it there, since fixing it at the
source fixes it for every project built on that data, not just this one.

## Suggesting a new source or layer

Use the **New source** issue template. A layer is added with exactly two
files — an ingest script under `scripts/ingest/` and one entry in
[`src/layers/registry.ts`](src/layers/registry.ts) — so a good source
suggestion is one we can act on directly: a link to the primary record, what
agency or body publishes it, and how often it updates.

## The one rule for all contributions

This project documents **systems, not people** — see
[AGENTS.md §1](AGENTS.md) for the full policy. In short:

- Devices, buildings, agencies, contracts, votes, and dollars: in scope.
- Detainees, rank-and-file officers, private individuals, and anyone
  captured by a surveillance system: never in scope, in any field, at any
  aggregation level.
- Any free-text submission is reviewed by a person before it's published.
  Submissions describing a person, rather than equipment or a location, are
  rejected outright — this isn't a judgment call made per-submission, it's a
  standing rule (see AGENTS.md §0.10).

When in doubt, leave it out and open an issue instead — we'd rather talk it
through than publish something that shouldn't be there.

## Sourcing

Every claim on the site resolves to a citable primary record. If you're
adding or correcting data, include the source URL, document type, and date
you're citing. `null` plus a note in `knownGaps` beats a guess — see
AGENTS.md §3 for the full provenance rules and the source-tiering system
(government primary records first, journalism and trackers as leads only).

## AI tooling disclosure

This project uses [Claude Code](https://claude.com/claude-code) as a
development tool for code, ingest scripts, and drafting. **Every data field,
editorial claim, and published record is human-reviewed** — nothing is
published because a model produced it; it's published because a person
checked it against a primary source. If you're reviewing a PR that touches
data or claims and something looks unsourced or off, say so — that review is
exactly how this rule holds.

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).

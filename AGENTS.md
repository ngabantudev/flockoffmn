# CLAUDE.md — Repository Architecture & AI Behavior Rules

This repository hosts a map-first civic transparency platform built with Astro, MapLibre
GL JS, and custom spatial ETL layers. These rules govern all code generation,
refactoring, and data ingestion.

The subject of this site is **the apparatus**: surveillance infrastructure, enforcement
agreements, detention contracts, the money that funds them, and the public officials who
authorize them. Never the people it is aimed at.

This repo imports the cross-project durability standard: @DURABILITY.md — see Part 3 for
where this repo departs from it and why.

---

## Part 0: Guiding Principles

These are load-bearing. When a design decision is ambiguous, resolve it toward these.

**0.1 — Connection is the product.** Nothing here is an isolated incident. An ALPR camera
is a vendor contract is a data-sharing agreement is a 287(g) MOA is a council vote is a
detention bed-day invoice. A map of unrelated pins fails the mission even when every pin
is accurate. The registry must model **relations as first-class objects**, not just point
layers: `device → vendor → contract → approving body → agency → agreement → facility`.
Every detail panel answers "what is this connected to?" before it answers "what is this?"

**0.2 — Receipts, not rhetoric.** The antidote to being told you didn't see what you saw
is a document with a number on it. Every published claim resolves to a citable primary
record — contract, MOA, invoice, roll call, permit, statute. The About page can be as
angry as it wants; the data layers stay literal, sourced, and boring. Polemic that
outruns its citations is the one thing that gets the whole project dismissed.

**0.3 — The metaphors do not become code.** "Parasitic fungus," "web of institutional
power," "boiling water" are framing for readers, not an inference engine. Never generate
an edge, score, network, or relationship that isn't in a document. If two things are
connected only by suspicion, they are not connected in the graph. Suspicion belongs in
bylined prose, marked as the author's argument.

**0.4 — Make the routine visible.** This apparatus advances through consent agendas,
auto-renewing contracts, unanimous voice votes, grant acceptances, and four-page staff
reports nobody reads. It is designed to be unremarkable. Design bias therefore runs
toward surfacing the boring and unopposed: flag approvals passed on consent, with no
discussion, with no public comment, or under a spending threshold that avoided a vote
entirely. What slipped through quietly is the story.

**0.5 — Show the water heating.** Point-in-time snapshots hide gradual change, and
gradual change is the mechanism. Every ingest is versioned and diffed; layers expose a
time axis and cumulative counters — cameras deployed, agencies onboarded, agreements
signed, dollars obligated, jurisdictions added, year over year. A public change feed is a
core feature, not an add-on. "It's only a few cameras" is answered with a curve.

**0.6 — Every record ends in an action.** A user who finds something must immediately see
what can be done: which body decides next, when the contract renews, when the comment
period closes, where to file a data practices request, which office to contact, how to
export and share the record. Transparency that terminates in despair is a failure state.

**0.7 — Build for the people it's aimed at.** Prioritize the communities carrying the
enforcement, not the ones reading about it. That means: fast on old phones and bad
connections, fully usable by screen reader, no login, no paywall, no tracking, no
fingerprinting, plain-language summaries beside every technical field, and bulk export
under a permissive license so anyone can take the data and go. Assume some visitors have
reason to fear being logged. Give them nothing to log.

**0.8 — Outlive the author.** Assume no maintainer. Static output, no vendor lock-in, no
API keys, reproducible builds, mirrored and hashed source documents, dependency-free ETL,
and a `RUNBOOK.md` that lets a stranger rebuild everything from scratch. Every technical
choice is evaluated on whether it still works in ten years with nobody watching.

**0.9 — Translate the jargon.** ALPR, 287(g), IGSA, MOA, CAD/RMS, fusion center, LPR
hotlist, detainer — every acronym and term of art gets a glossary entry, rendered inline
in plain language. Institutional language is a wall; the site's job is a door.

**0.10 — The inch.** §1b is the floor. It does not move, and it will at some point be
tactically expensive to hold — after something awful happens, when naming one officer or
publishing one sighting would feel not just justified but obligatory. That moment is
foreseeable, so it is decided here, in advance, rather than at 2am by whoever is at the
keyboard. Anyone reading this later, including a future maintainer or a future version of
the original author: this is a rule, not a judgment call. Reopening it is not an
improvement to the project; it is the end of the project as described in this document.
The floor is what makes everything above it legitimate.

**0.11 — No masks.** Every argument on the site is bylined and accountable. No anonymous
collective voice, no hero framing, no vigilante or insurgent iconography, no borrowed
symbols from fiction. The project's power comes from being more accurate and more boring
than its opposition — permit numbers, docket IDs, roll calls — not from being more
theatrical. Theatrics invite readers to file the evidence under fiction, which forfeits
the only advantage the project actually has. Anyone can fork the repo and take the data;
nobody here needs to be a symbol.

---

## Part 1: Project Architecture & Ethical Guardrails

### 1. The Core Policy: Privacy & Compliance

**Transparency for power; privacy for people.** Scrutiny scales with authority. The line
is not "individuals vs. institutions" — it is **whether the person is exercising public
power or spending public money.**

**1a. Named, in their official capacity.** Elected officials and senior appointed
decision-makers: legislators, county commissioners, councilmembers, mayors, sheriffs,
county attorneys, police chiefs, agency commissioners, city and county administrators,
and the board members of public and quasi-public bodies. Also: registered lobbyists and
their principals, and corporate officers named in filings, in their corporate role.

For these people the site may publish, sourced: votes and vote dates, sponsorships,
motions and seconds, recusals, contracts and agreements they signed, public statements
made in official settings, campaign finance receipts (MN Campaign Finance Board),
Statements of Economic Interest, lobbying disclosures, and official contact information
as published by their own body.

**A sheriff who signed a 287(g) agreement is named, because the signature is the act.**

**1b. Out of scope, permanently, for everyone.** (See §0.10 — this section is the floor,
and it does not move under pressure, urgency, or provocation.)

* **Detainees and anyone subject to enforcement.** No names, no case numbers, no A-
  numbers, no charges, no facility assignments, no dates of custody, no aggregation fine
  enough to re-identify. This is not negotiable and no future feature request reopens it.
* **Rank-and-file officers, agents, deputies, corrections staff, and civilian
  employees.** No names, no badge numbers, no photos, no shift patterns, no vehicle
  identifiers, no home information. They implement; they do not decide. Record the
  office, never the person. **The site does not build the thing it opposes.**
* **No sighting or spotting features about people.** Community-submitted reports may
  cover *equipment and locations* — a camera on a pole, a plate reader at an
  intersection. They may never cover individuals, vehicles occupied by individuals,
  enforcement activity in progress, or "who was seen where." Any submission form must
  structurally reject person-level content, and any free-text field must be reviewed
  before publication.
* **People captured by surveillance systems.** Plate numbers, faces, device identifiers,
  and location traces are never ingested, cached, mirrored, or displayed, in any form,
  including as examples, test fixtures, or screenshots.
* **Residents, commenters, petitioners, and witnesses.** Aggregate counts only, never
  enumerated — including supportive ones.
* **Private life of officials.** Home address, personal phone or email, vehicle, family
  members, children, health, religion, immigration status, sexual orientation, private
  conduct. Never named, never mapped, never counted. Only the official portrait published
  by the office itself.

**1c. Assertion discipline — the rule that keeps the site standing.**

Record the vote. Record the contract. Record the contribution. Record the date of each.
Place them adjacent and let the reader do the arithmetic. **Do not compute, publish, or
imply a causal claim.** No corruption scores, no "bought by" labels, no derived influence
rankings, no auto-generated accusations, no complicity indexes. Two documented facts side
by side are devastating and unfalsifiable; one inferred motive is a defamation exposure
and hands the other side a way to make the story about you instead of them.

Where the author wants to argue a connection, that argument lives in clearly bylined
prose marked as opinion, physically separate from the data layer, citing the same
documents.

**1d. Structural enforcement.**

* `src/layers/types.ts` carries a `PersonRole` discriminated union — `elected`,
  `appointed_senior`, `lobbyist`, `corporate_officer`. There is no variant for a private
  individual, a detainee, or a line officer, **by construction**. If an upstream source
  mixes individual records into systemic data, ingest the systemic attributes and drop
  the rest.
* Every person record requires `officeHeld`, `jurisdiction`, `termDates`, and a
  `sourceUrl` for each attributed act. A person with no attributed official act gets no
  record. Officials leave the active layer when they leave office; their acts remain,
  dated and attributed to the office they held.
* **Aggregates Only:** Facility-level counts and court-level rates are systemic data and
  may appear as clearly labeled aggregate layers. Aggregates must be checked for
  re-identification risk before publication; suppress cells below a documented threshold.
* **Public Offices Only:** `src/lib/authority.mjs` returns offices, never individuals.
  Every office named must be the statutory default in Minn. Stat. § 13.02, subd. 16(b),
  cited in place. Cite the statute next to any new office added.
* When in doubt, leave it out.

### 2. Architecture & Layer Ingestion

The layer registry is the single source of truth. `src/layers/registry.ts` drives the
map, legend, filters, detail panels, sources page, downloads, and "near me" view.

* **Two-File Additions:** Adding a layer requires **exactly two files**:
  1. An ingest script in `scripts/ingest/national/` (works for any US state via env
     vars) or `scripts/ingest/mn/` (built against a Minnesota-specific statute, agency,
     or dataset — see PORTING.md) that emits the shared schema to `public/data/`.
  2. One entry in `src/layers/registry.ts`.
  * *Do NOT edit UI components directly to add layers.*
* **Relations Are Layers Too:** Per §0.1, edges between features are registry entries
  with their own provenance, not ad-hoc joins buried in components. An undocumented edge
  is a bug.
* **Dependency-Free ETL:** `scripts/ingest/` scripts run on Node and must remain
  dependency-free (`lib/util.mjs` handles ZIP/XLSX/PDF-text decoding). `counties.mjs`
  must run before other layers.
* **Shared Libraries:** `src/lib/geo.mjs` and `src/lib/authority.mjs` are shared between
  ingest scripts and the browser to prevent drift between build-time assignment and
  in-browser execution.
* **Build Readers:** `src/layers/data.ts` reads static outputs directly at build time so
  UI counts and dates never drift from generated JSON.
* **Versioned Snapshots:** Per §0.5, every ingest writes a dated snapshot and a diff
  against the prior run. Snapshots are append-only; layers are never silently overwritten.
* **Good-Citizen Fetcher:** Scheduled fetchers identify themselves with a descriptive
  User-Agent and contact address, respect robots.txt and rate limits, and back off on
  error. No ToS-questionable techniques: no internal or private API scraping, no
  residential-proxy block evasion, no credentialed-portal automation. If a source cannot
  be fetched politely, it gets a `knownGaps` entry and a manual workflow, not a
  workaround.

### 3. Data Provenance & Citation Rules

* **Source Citations:** Every layer, feature, relation, or policy reference must be
  backed by cited sources and links (public data portals, official documents, statutory
  citations, docket and contract numbers).
* **Source Tiering:** Tier 1 = government primary records (contracts, MOAs, dockets,
  permits, roll calls, MGDPA responses). Tier 2 = federal records and regulated filings.
  Tier 3 = first-party non-governmental (vendor documentation, operator-submitted
  registries). Tier 4 = journalism, advocacy trackers, aggregators — **lead lists only**,
  never the sole basis of a published feature. Unresolved Tier 4 leads are `knownGaps`
  entries, not map pins.
* **Confidence Enum:** `confirmed` (Tier 1/2 document names it directly), `corroborated`
  (two independent lower-tier sources agree), `reported` (credible secondary reporting,
  not yet documented), `lead` (unresolved — not rendered).
* **Missing Sources:** Never fabricate or infer data. If an upstream field, primary
  source, or link does not exist, leave the field `null`, explicitly state
  `"No source found"` in the documentation/UI link field, and detail the gap in
  `knownGaps`.
* **Provenance Record:** Ingest scripts must record primary URL, document type, document
  identifier, issue date, license type, attribution text, fetch timestamp, and content
  hash. Where licensing permits, mirror the source document under `public/data/docs/` — a
  citation that 404s in eighteen months is not a citation.
* **Redaction Is Data:** When a records response withholds material, record `redacted:
  true` with the claimed statutory basis and the date. The fact that something was
  withheld is publishable and is often the most useful thing on the page.
* **Coverage Honesty:** Every registry entry carries a `coverage` field describing what
  the layer structurally cannot see (agencies outside a reporting mandate, contracts
  below a disclosure threshold, jurisdictions that denied requests). The site renders a
  persistent, plain-language **"What this map can't see"** section derived from those
  fields. Claiming completeness we cannot back is the fastest way to lose the argument.
* **Upstream licenses** must be checked against `LICENSE-DATA.md`.

### 4. Client Constraints & Accessibility

* **Zero Third-Party Assets:** No external analytics, external fonts, remote embeds, or
  cloud geocoding APIs. All spatial operations (including "near me") run locally
  on-device against static indexes. Per §0.7, "near me" never transmits a location — no
  server round trip, ever.
* **No Visitor Logging Beyond The Minimum:** No cookies, no fingerprinting, no session
  identifiers, no third-party embeds. Document the hosting provider's log retention on
  the privacy page in plain language, including what the project cannot control.
* **Accessibility Sync:** The DOM record list beside the MapLibre canvas is the primary
  screen-reader interface and must stay perfectly in sync with drawn features. Respect
  `prefers-reduced-motion` and label all controls.
* **Plain Language:** Per §0.9, every jargon term renders with an inline gloss sourced
  from the glossary. No unexplained acronyms in user-facing copy.

---

## Part 2: Commands & Workflow

```bash
npm install
npm run data      # Rebuild all layers from upstream (network required, no keys)
npm run diff      # Diff latest snapshot against prior run; emits the change feed
npm run dev       # Start Astro dev server
npm run check     # Run astro check & type verification — MUST STAY AT 0 ERRORS
npm run build     # Production build
```

---

## Part 3: DURABILITY.md — Exceptions For This Repo

DURABILITY.md is written project-agnostic, for products with pricing, accounts, and a
contributor economy. This repo has none of those by design (§0.7 — no login, no paywall).
Per DURABILITY.md's own closing section, exceptions are recorded here, not edited into
that file.

**Pillar 3 (Goodwill) is mostly inert here.** No pricing, no signup, no cancellation flow
exists or ever will. Skip those Definition-of-Done items — they are not unmet, they are
not applicable. The parts that do apply — no selling or leaking user data, no engagement
bait, no dark patterns — are already covered by §0.7/§4 and stay in force.

**The "lifeforce rule" (Pillar 2) is subordinate to §1b, not the other way around.**
DURABILITY.md treats every step between a visitor and their first contribution as a bug
until proven necessary, and warns against silently rejecting a newcomer. §1b requires
mandatory human review of every free-text submission field before publication, and any
submission form must structurally reject person-level content. Where these conflict, §1b
wins: the review queue is not a bug to be optimized away, and a submission withheld for
containing person-level content is not owed the fast, explanatory turnaround DURABILITY.md
asks for — it is simply not published. Acknowledge good-faith equipment/location reports
quickly; do not loosen the review gate to hit a time-to-first-contribution target.

**"Credit contributors visibly" does not apply to submitters.** DURABILITY.md's Marketplace
precedent assumes named creators opting into recognition. §1b requires residents,
commenters, and petitioners be counted only in aggregate, never enumerated — including
supportive ones. Do not build a contributor leaderboard, byline, or credit surface for
anyone submitting camera or location reports. (Bylines for the site's own authors, per
§0.11, are unaffected — that's the site's own accountable voice, not a contributor-credit
system.)

**Distribution artifacts (badges, embeds, shareable pages) answer to §0.11 first.**
Shareable public pages and exports are encouraged (§0.6); gamified badges or streak-style
engagement surfaces are not, per §0.11's rejection of theatrics and borrowed iconography.
A distribution feature that reads as a symbol or a game-style reward rather than a
document fails here regardless of what it does for sharing.

**Everything else in DURABILITY.md stands as written** — in particular Pillar 1 (systems
over content, boring/vendor-able tech, data outlives apps) and the versioning/change-feed
requirements, which restate §0.5 and §0.8 rather than compete with them.
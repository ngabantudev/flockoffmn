# CLAUDE.md — Repository Architecture & AI Behavior Rules

This repository hosts a map-first civic transparency platform built with Astro, MapLibre GL JS, and custom spatial ETL layers. These rules govern all code generation, refactoring, and data ingestion.

---

## Part 1: Project Architecture & Ethical Guardrails

### 1. The Core Policy: Privacy & Compliance
**Transparency for systems; privacy for people.** Every record describes an institution, a piece of infrastructure, a contract, or a historical policy. Nothing describes, names, or tracks a private individual — not detainees, not officers, not agents, not residents.

* **Structural Enforcement:** `src/layers/types.ts` must never carry a personal name, case number, or individual identifier. If an upstream source mixes individual records into systemic data, ingest the systemic attributes and drop the rest. When in doubt, leave it out.
* **Aggregates Only:** Facility-level counts and court-level rates are systemic data and may appear as clearly labeled aggregate layers.
* **Public Offices Only:** `src/lib/authority.mjs` returns offices, never individuals. Every office named must be the statutory default in Minn. Stat. § 13.02, subd. 16(b), cited in place. Cite the statute next to any new office added.

### 2. Architecture & Layer Ingestion
The layer registry is the single source of truth. `src/layers/registry.ts` drives the map, legend, filters, detail panels, sources page, downloads, and "near me" view.

* **Two-File Additions:** Adding a layer requires **exactly two files**:
  1. An ingest script in `scripts/ingest/` that emits the shared schema to `public/data/`.
  2. One entry in `src/layers/registry.ts`.
  * *Do NOT edit UI components directly to add layers.*
* **Dependency-Free ETL:** `scripts/ingest/` scripts run on Node and must remain dependency-free (`lib/util.mjs` handles ZIP/XLSX decoding). `counties.mjs` must run before other layers.
* **Shared Libraries:** `src/lib/geo.mjs` and `src/lib/authority.mjs` are shared between ingest scripts and the browser to prevent drift between build-time assignment and in-browser execution.
* **Build Readers:** `src/layers/data.ts` reads static outputs directly at build time so UI counts and dates never drift from generated JSON.

### 3. Data Provenance & Citation Rules
* **Source Citations:** Every layer, feature, or policy reference must be backed by cited sources and links (public data portals, official docs, statutory citations).
* **Missing Sources:** Never fabricate or infer data. If an upstream field, primary source, or link does not exist, leave the field `null`, explicitly state `"No source found"` in the documentation/UI link field, and detail the gap in `knownGaps`.
* **Provenance Record:** Ingest scripts must record primary URL, license type, attribution text, and fetch timestamp. Upstream licenses must be checked against `LICENSE-DATA.md`.

### 4. Client Constraints & Accessibility
* **Zero Third-Party Assets:** No external analytics, external fonts, remote embeds, or cloud geocoding APIs. All spatial operations (including "near me") run locally on-device against static indexes.
* **Accessibility Sync:** The DOM record list beside the MapLibre canvas is the primary screen-reader interface and must stay perfectly in sync with drawn features. Respect `prefers-reduced-motion` and label all controls.

---

## Part 2: Commands & Workflow

```bash
npm install
npm run data      # Rebuild all layers from upstream (network required, no keys)
npm run dev       # Start Astro dev server
npm run check     # Run astro check & type verification — MUST STAY AT 0 ERRORS
npm run build     # Production build
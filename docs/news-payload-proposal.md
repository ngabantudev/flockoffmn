# Proposal: stop shipping the news rail to phones that never render it

Status: **draft, awaiting review**
Author: prepared for review by @ngabantudev
Date: 2026-08-22
Scope: `src/components/news/NewsFeed.astro`, `scripts/ingest/mn/news.mjs`, `dist/_headers`

---

## 1. Why this exists

Raising `RAIL_LIMIT` from 60 to 200 restored the 30D chip, but it did so by
permitting the rail to grow. That is a ceiling, not an answer, and the question
it dodges is the one worth asking: the rail is `xl`-only, so every headline it
renders is downloaded and parsed by phones that will never display a single one.

The question under review is whether the already-published, already-cacheable
`/data/news.json` can carry that weight instead of the HTML document.

---

## 2. Measured baseline

All figures gzipped at level 9, from `dist/` at commit `6a2d7c5`.

### Map page (`/`)

| Component | Transfer (gz) | Share of the 420 KB baseline |
|---|---:|---:|
| JavaScript (`_astro/*.js`) | 329 KB | 78% |
| HTML document | 71 KB | 17% |
| CSS | 20 KB | 5% |
| **subtotal before map tiles and layer data** | **420 KB** | |

### Inside that 71 KB HTML document

Measured by removal — build the document, delete the region, re-compress, take
the difference. This avoids the nested-element regex error that produced a
9×-wrong figure for this same page earlier in the project.

| Region | Raw | Gzipped | Share of doc (gz) |
|---|---:|---:|---:|
| Inline `<script>` | 82 KB | 26 KB | 37% |
| **News rail rows (61)** | **65 KB** | **17 KB** | **24%** |
| Filter checkboxes (847 inputs) | 521 KB | 16 KB | 23% |

### Correction to the figure in commit `6a2d7c5`

That commit cited "~230 B gzipped per row" and framed a 200-row rail as "about
46 KB against the map page's ~889 KB transfer."

Measured: **278 B gz per row**, and the honest denominator is the 420 KB
baseline above, not 889 KB. The rail is **24% of the HTML document**, and at the
new 200 ceiling it would be **~56 KB gz — very nearly doubling the document.**
The ceiling is not load-bearing today at 61 stories, but it is considerably more
permissive than that commit message implied. This changes the decision below and
is stated here rather than left in a commit message.

---

## 3. What the bytes actually are

| Field | Raw | % of items JSON |
|---|---:|---:|
| `url` | 33.2 KB | **60%** |
| `title` | 8.6 KB | 15% |
| everything else | 13.8 KB | 25% |

Every one of the 106 links is a Google News redirect token averaging **313 B**,
and it is base64 — it barely compresses. Strip the `url` field from a 61-item
rail payload and it falls from **15.1 KB gz to 2.8 KB gz**. Roughly **82% of the
rail's weight is opaque redirect tokens**, not markup and not headlines.

### Resolving those URLs is blocked by §2 — tested, not assumed

Fixing this at the source would shrink the published dataset from 26 KB gz to
5 KB gz *and* satisfy §0.2 and §3 ("a citation that 404s in eighteen months is
not a citation"). A Google redirect token is exactly such a citation. Three
routes were tested:

| Route | Result |
|---|---|
| Decode the token locally (base64 protobuf) | **0 of 106 decodable.** Google moved to server-side mapping; the payload no longer contains the URL. |
| Follow the link with a plain `GET` | **No redirect.** Returns a 581 KB JS-driven interstitial, no `Location`, no `meta refresh`. |
| Read the publisher link from the RSS feed | Feed carries `<source url="https://www.echopress.com">` — the **publisher homepage only**, never the article deep link. |

The only remaining route is Google's undocumented `batchexecute` endpoint.
**§2 forbids it** ("no internal or private API scraping"). Recommend recording
this as a `knownGaps` entry rather than working around it.

**Consequence: the URL bytes are irreducible.** Any option below moves them;
none removes them.

---

## 4. Options

### A — Do nothing beyond the ceiling already raised

Zero work, zero risk. Phones keep downloading and parsing 65 KB raw / 17 KB gz
of rail markup they never see, and `RAIL_LIMIT` continues to govern how much
coverage the rail may offer — a UI decision made by a payload constant.

### B — Viewport-gated hydration from the cached `/data/news.json`  ← recommended

Ship the rail as an empty shell. On `xl` viewports only, after the map is
interactive, fetch `/data/news.json`, slice, and render the rows client-side.

This is **not a new architecture.** `MapView.astro`, `NearMe.astro` and
`Act.astro` already fetch `/data/reference/*.json` exactly this way, and
`/data/*` already carries `Cache-Control: public, max-age=3600,
stale-while-revalidate=86400` with `Access-Control-Allow-Origin: *`. The cache
this proposal wants is already built and already configured; the pages simply
inline a second, uncacheable copy of the same headlines instead of using it.

| Scenario | Today | Option B | Δ |
|---|---:|---:|---:|
| Phone visitor (`< 80rem`) | 17 KB | **0 KB** | **−17 KB** |
| Desktop, first visit | 17 KB | 26 KB | +9 KB |
| Desktop, second page view (within TTL) | 17 KB | 0 KB | −17 KB |
| Desktop, next deploy, news unchanged | 17 KB | 0 KB | −17 KB |

The desktop first-visit regression is real and is the honest cost. It is repaid
on the second page view, and on every deploy — the site redeploys far more often
than the 06:00 UTC news cron changes `news.json`.

Also: `RAIL_LIMIT` can be **deleted**. Once the rail's rows are not in the HTML,
its window stops being a payload decision, and 1Y / All become offerable.

**Constraints honoured.** Same-origin fetch of a static asset already permitted
by `connect-src 'self'`; no third party, nothing new disclosed, §0.7 intact.
The map page already requires JS for MapLibre, so the rail is not losing
robustness it had. `/news` is untouched — see the hard constraint below.

**Costs.** No-JS desktop readers get a shell with an archive link instead of
headlines. One more fetch on the map page (gate it behind idle time so it never
competes with tiles). Rail tests must await hydration rather than reading
server-rendered HTML.

### C — Ship rows inside `<template>`, clone on `xl`

Avoids DOM construction and layout on phones, needs no fetch. But **the bytes
still ship** — the 17 KB gz is unchanged. Solves the smaller half of the problem.

### D — Drop `url` from rail rows, resolve on click — considered and rejected

Numerically the most attractive: the rail falls to **2.8 KB gz**. Rejected on
§4 grounds. Rows would stop being real `href`s, which breaks middle-click,
open-in-new-tab, copy-link-address, and the link semantics screen readers rely
on. An accessibility regression is not an acceptable price for 12 KB.

---

## 5. Hard constraint on any option

**`/news` stays fully server-rendered.** It is the no-JS, screen-reader,
archival surface, and §4 makes the DOM record list the primary accessibility
interface. Nothing here proposes hydrating it. The asymmetry that makes Option B
defensible is precisely that the rail lives on a page that is already a JS
application, while the archive is a durable document.

---

## 6. Separate finding, larger than the rail

If the goal is §0.7 — the reader on an old phone — the rail is not the right
target. **The filter sidebar ships 521 KB of raw HTML: 847 `<input>` elements
and 846 `<label>`s.** It compresses to 16 KB, so it is nearly invisible in
transfer figures, but raw bytes are what a slow device must parse, and that is
8× the rail's raw cost. Recommend scoping this separately.

---

## 7. Recommendation

Take **Option B**, reuse `/data/news.json` rather than emitting a second
rail-scoped file (one artifact, no drift, §0.8), gate the fetch on
`matchMedia('(min-width: 80rem)')` plus idle time, and delete `RAIL_LIMIT`.

Consider raising `/data/*` to `max-age=21600` — the cron writes once a day, so a
1-hour TTL revalidates ~24× more often than the data changes.

---

## 8. Decisions needed

1. **Option A, B, C, or D?**
2. If B: reuse `news.json` (26 KB, no drift) or emit a trimmed `news-rail.json`
   (15 KB, second artifact to keep in sync)?
3. Accept that no-JS desktop loses rail headlines, keeping an archive link?
4. File the Google-URL resolution block as a `knownGaps` entry?
5. Scope the 521 KB filter sidebar as separate work?

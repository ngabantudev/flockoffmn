# Research note: Flock cameras at The Quarry (Home Depot, Minneapolis)

**Status:** lead — not yet a registry entry. No map/UI change accompanies this note.
**Opened from:** a r/Minneapolis post (2026-08-19) reporting Flock Safety-style ALPR
camera units at The Quarry retail center, New Brighton Blvd., Minneapolis, near the
Home Depot anchor tenant, plus a Telaid service crew observed working on them.

Per [`civic-standards:sourcing`](../../CLAUDE.md) Tier rules: the Reddit post is Tier 4
(non-governmental, uncorroborated) and is used here **only as a lead**, not as a cited
fact. Nothing below is sourced to it. The two SEC filings it links to were fetched
directly from sec.gov and read in full; findings from them are cited with confidence
per the repo's enum (`confirmed` / `corroborated` / `reported` / `lead`).

## What the two filings actually are

Both documents are exhibits to **The Home Depot, Inc.'s 2026 Annual Meeting proxy
materials** (CIK 0000354950), not a routine 10-K/8-K risk disclosure:

1. [`hd-20260406.htm`](https://www.sec.gov/Archives/edgar/data/354950/000035495026000090/hd-20260406.htm)
   (accession 0000354950-26-000090) — **The Home Depot 2026 Proxy Statement**. Contains,
   as Item 8 on the proxy card, a shareholder proposal titled "Report on Customer Data
   Privacy Risks" submitted by two individual shareholder-proponents (represented by
   Zevin Asset Management), followed by **the Home Depot Board's own response and
   recommendation to vote against it**. Per CLAUDE.md §1b, petitioners are recorded in
   aggregate only, never enumerated, so their names are omitted from this note — the
   linked filing itself is the citation for anyone who needs to verify the proposal's
   original signatories. Tier 1/2: this is Home Depot's own SEC filing; the proposal
   text itself is written by the proponents (the filing explicitly disclaims "the
   Company is not responsible for the accuracy or content of the proposal"), but the
   Board's response is Home Depot's own statement.
2. [`i54262px14a6g.htm`](https://www.sec.gov/Archives/edgar/data/354950/000121465926005483/i54262px14a6g.htm)
   (accession 0001214659-26-005483) — a **Notice of Exempt Solicitation** (SEC Form
   PX14A6G) filed independently by Zevin Asset Management, LLC, urging shareholders to
   vote FOR Item 8. This is advocacy material by a shareholder activist investor, filed
   as a real SEC exhibit — Tier 2 as a regulated filing, but its claims are Zevin's
   argument, not Home Depot's admission, and are labeled as such
   below.

## Confirmed (Home Depot's own words, Board response, Tier 1)

- Home Depot **uses Automated License Plate Recognition (ALPR) technology, vendor Flock
  Safety, in its parking lots company-wide** — stated both in the shareholder proposal
  (footnote citing homedepot.com/privacy/privacy-and-security-statement#ALPR) and
  confirmed independently by the Board's own response, which describes ALPR technology
  "deployed by the Company," reviewed by its Privacy and Data Governance Committee.
- Purpose stated by the Board: "to protect the safety of customers and associates and
  to detect and prevent organized retail crime."
- Access policy stated by the Board: "the Company may permit law enforcement agencies
  to access the still images captured by ALPR technology for authorized purposes only
  ... Since the inception of its use of ALPR technology, the Company has not authorized
  any law enforcement agency other than local and state law enforcement agencies to
  access this data." Home Depot's statement asserts it has not itself authorized
  federal access, and says any onward sharing by an authorized agency to unauthorized
  parties would violate its terms and could trigger suspension.
- The Board's response does not name Flock Safety directly in that specific paragraph,
  but does elsewhere in the same filing (in describing the proposal being responded to)
  and does not dispute the proposal's identification of Flock Safety as the ALPR vendor.

## Reported (Zevin Asset Management's advocacy claim, Tier 2 filing, not Home Depot's own assertion)

- Zevin's PX14A6G argues Home Depot's access controls are not as clean as the Board's
  response suggests: "Home Depot grants query access of license plate data to local law
  enforcement through Flock Safety's database. Because Flock's architecture enables
  local agencies to search on behalf of federal authorities using their own
  credentials, the audit infrastructure it relies on is structurally compromised."
  This is Zevin's characterization, made to support a "vote FOR" recommendation on a
  proposal Home Depot's own board opposed — it is not an independent finding and is not
  something this project can restate as fact without a primary document naming a
  specific instance.

## Not established by these filings — do not overstate

- **Neither filing mentions The Quarry, Minneapolis, New Brighton Blvd., Sterling
  Organization, or Telaid at all.** They establish that Home Depot uses Flock ALPR
  cameras as a corporate policy, not that the specific units reportedly seen at this
  Minneapolis location are Home Depot's, company-owned vs. property-management-owned,
  or connected to any particular enforcement request.
- No document has been found establishing who purchased or owns the physical camera
  units at The Quarry, who owns the resulting data, retention period, or whether this
  specific site's feed participates in Flock's broader network. Per §1c of CLAUDE.md,
  this project does not compute or imply that link from proximity and vendor
  plausibility alone — a Home Depot store having a corporate ALPR policy is not a
  citable record that *this* parking lot's cameras are that program's cameras.
- Telaid's role, if any, is unconfirmed by any primary document reviewed here; the
  Reddit post's observation of a Telaid crew servicing equipment is not independently
  verifiable from this desk.

## Open questions (candidates for public-records requests, not for the registry yet)

- Minneapolis/Hennepin County permit or property records for camera installations at
  1520–1730 New Brighton Blvd.
- Whether Home Depot's ALPR contract is store-specific or corporate-wide, and whether
  Sterling Organization (property owner/manager) or Home Depot is the contracting party
  for equipment at a leased anchor site.
- A Telaid service/maintenance contract naming this site.
- Whether any Minnesota law enforcement agency has queried Flock's network via a Home
  Depot-authorized ALPR camera, which would require an MGDPA data-practices request to
  a specific agency, not a corporate filing.

## Second pass: public-record and crowdsource follow-up (2026-08-19)

Pursued the open questions above with public web searches. Results, tiered per this
repo's rules:

- **Site identity (Tier 3, property owner's own materials).** Sterling Organization's
  own property page and leasing brochure for "Quarry Retail" confirm: 281,480 sq ft
  grocery-anchored center at 1520–1730 New Brighton Blvd., anchors include Cub, Home
  Depot (listed at 1620 New Brighton Blvd.), Target (shadow-anchor), Office Depot,
  Michaels, PetSmart, Five Below. Sterling Organization is confirmed as the owning/
  leasing entity, consistent with the Reddit post. Source: sterlingorganization.com
  property page and leasing brochure PDF (their own site, not an independent filing —
  cited as Tier 3, first-party non-governmental).
- **Parcel identifiers found, owner-of-record NOT resolved.** Commercial listing
  aggregator (LoopNet, Tier 4) gives Hennepin County APNs 13-029-24-12-0016 (1520) and
  13-029-24-11-0034 (1730). Hennepin County's actual property-information system
  (propertyinformation.hennepin.us) requires an interactive parcel-ID search; the old
  direct-query URL pattern (`www16.co.hennepin.mn.us/pins/pidresult.jsp?pid=...`) now
  just returns the generic search landing page, not parcel data. Per the "Good-Citizen
  Fetcher" rule (no scraping workarounds, no automating a form meant for a human), this
  needs a manual lookup by a person at that site with the two APNs above, not a script.
  **Not resolved in this pass — logged as a `knownGaps`-style manual task, not
  fabricated.**
- **Crowdsourced ALPR trackers (Tier 4, lead-only, corroborating but not sufficient).**
  `deflocktheusa.com`'s Minneapolis page lists "The Home Depot" as one of four named
  ALPR *operators* reported in Minneapolis (alongside Minneapolis PD, University of MN
  PD) — but gives no street address tying that specifically to The Quarry, and the site
  is community-submitted, not a primary source. `unflocked.org` and `findingflock.com`
  show aggregate counts for the area but no address-level detail was retrievable via
  fetch (their interactive map likely has it; not pulled here). These are consistent
  with the Reddit report but remain Tier 4 leads, not citations, per §0.3/§1c — proximity
  plus a matching operator name is still not a document naming this site.
- **Telaid:** no public reporting or filing found connecting Telaid to Home Depot or to
  this site specifically. Telaid's own site was not checked for a client list (unlikely
  to name a specific store) and doing so would not change this from a Tier 4 gap.
- **Naming clarification worth flagging for future ingest work:** "New Brighton Blvd"
  is a street in Minneapolis (Hennepin County); it is easy to confuse with the separate
  city of **New Brighton, MN** (Ramsey County), which runs its own independent Flock
  Safety program and public transparency portal (newbrightonmn.gov/686/Flock-
  Transparency-Portal). These are unrelated municipalities/programs. Any future ingest
  work on either must not conflate the two because of the shared road name.

## Third pass: owner-of-record resolved via Hennepin County GIS (2026-08-19)

The second pass ruled out `propertyinformation.hennepin.us` because its interactive
parcel-ID search isn't a fetchable URL and automating a human-facing form is out per
the Good-Citizen Fetcher rule. That constraint is specific to that interactive site,
not to Hennepin County data generally — the county separately publishes its parcel
layer as an open, unauthenticated GIS REST service intended for programmatic queries
(`gis.hennepin.us/arcgis/rest/services/HennepinData/LAND_PROPERTY/MapServer/1`, part of
the public [Hennepin GIS Open Data](https://gis-hennepin.hub.arcgis.com/pages/open-data)
program). Querying it by PID is a normal use of a published API, not a scrape
workaround, so this pass used it directly instead of leaving the lookup as a manual
task.

**Confirmed (Tier 1, Hennepin County parcel record, `confirmed`).** Both APNs from the
second pass resolve to the same owner-of-record:

| PID | Address | OWNER_NM | TAXPAYER_NM_1 | Mkt. value (total) |
|---|---|---|---|---|
| 1302924120016 | 1520 New Brighton Blvd, Minneapolis 55413 | SUP II QUARRY RETAIL LLC | C/O STERLING ORGANIZATION | $9,628,000 |
| 1302924110034 | 1730 New Brighton Blvd, Minneapolis 55413 | SUP II QUARRY RETAIL LLC | C/O STERLING ORGANIZATION | $3,106,000 |

Fetched 2026-08-19 via the service's `/query` endpoint (`f=json`, `outFields` limited to
owner/address/value fields). This is a government primary record — Hennepin County's own
tax-parcel system — so it clears the bar for `confirmed`, not `corroborated` or `lead`.

**What this resolves and what it still doesn't:**

- **Resolves:** the property owner of record for both Quarry parcels is **SUP II Quarry
  Retail LLC**, a special-purpose entity, taxed care-of Sterling Organization. This
  independently confirms Sterling Organization's role (previously Tier 3, their own
  marketing materials) with a Tier 1 government record, and gives an exact legal-entity
  name for any future permit, contract, or lien search — e.g. a Minneapolis camera/
  equipment permit or a Telaid service contract would more plausibly be filed under
  "SUP II Quarry Retail LLC" than under "Home Depot" or "Sterling Organization."
- **Does not resolve:** who purchased, owns, or operates the ALPR camera units
  themselves. A landlord LLC owning the land under a leased anchor store is standard
  commercial real estate structure and says nothing about whether Home Depot (the
  tenant, with its own corporate Flock ALPR policy per the Confirmed section above) or
  the landlord installed and contracts for this specific equipment. Per §1c, ownership
  of the parcel is not evidence of who owns the camera — that link is not computed here.
- Updates the second-pass "Parcel identifiers found, owner-of-record NOT resolved"
  bullet above: owner-of-record **is** now resolved; the open question narrows to
  camera/equipment ownership specifically.

## Next step

This stays a documented lead (this file) rather than a map/registry entry until a
Tier 1–2 record ties the specific Quarry ALPR camera units — not just the parcel — to
an owner, contract, or access record. With the owner-of-record now known, the most
productive next actions are: (1) a Minneapolis building-permit or right-of-way search
for camera/equipment work filed under "SUP II Quarry Retail LLC" or "Sterling
Organization" at 1520–1730 New Brighton Blvd, and (2) an MGDPA data-practices request
to Minneapolis PD asking whether it has queried Flock data originating from this
address. No `src/layers/registry.ts` or ingest-script changes were made in this PR.

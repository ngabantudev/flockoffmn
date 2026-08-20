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

1. `hd-20260406.htm` (accession 0000354950-26-000090) — **The Home Depot 2026 Proxy
   Statement**. Contains, as Item 8 on the proxy card, a shareholder proposal titled
   "Report on Customer Data Privacy Risks" submitted by Neil Fisher and Meryl Loonin
   (represented by Zevin Asset Management), followed by **the Home Depot Board's own
   response and recommendation to vote against it**. Tier 1/2: this is Home Depot's own
   SEC filing; the proposal text itself is written by the proponents (the filing
   explicitly disclaims "the Company is not responsible for the accuracy or content of
   the proposal"), but the Board's response is Home Depot's own statement.
2. `i54262px14a6g.htm` (accession 0001214659-26-005483) — a **Notice of Exempt
   Solicitation** (SEC Form PX14A6G) filed independently by Zevin Asset Management, LLC,
   urging shareholders to vote FOR Item 8. This is advocacy material by a shareholder
   activist investor, filed as a real SEC exhibit — Tier 2 as a regulated filing, but
   its claims are Zevin's argument, not Home Depot's admission, and are labeled as such
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

## Next step

This stays a documented lead (this file) rather than a map/registry entry until a
Tier 1–2 record ties the specific Quarry cameras to an owner, contract, or access
record. No `src/layers/registry.ts` or ingest-script changes were made in this PR.

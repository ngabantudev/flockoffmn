# University of Minnesota Police Dept. — Flock Safety records (MuckRock #26-978)

Released by UMPD on 2026-07-09 in response to a Minnesota Government Data
Practices Act request filed via MuckRock (requester `MN50501`), tracking
number 26-978. Original request:
<https://www.muckrock.com/foi/minneapolis-1607/flock-safety-contract-information-communication-records-and-access-logs-university-of-minnesota-police-department-212163/>

Six files were released in one archive. Four are mirrored here unaltered.
Two are **not** mirrored in their original form — see below.

## Mirrored unaltered

| File here | Original filename | SHA-256 |
|---|---|---|
| `flock-services-agreement-2023-01-25.pdf` | `Flock-UMPD_Services Agmt_executed (1).pdf` | `61847d286fda57e167d59ffb7dc14d9c03dd20076ae612672c19281a4132a227` |
| `flock-order-expansion-2025-12-02.pdf` | `MN - University of Minnesota Campus PD - Law Enforcement Agreement - .pdf` | `b7a4c3db8ca28f1f543f1e8f283a9e0c365968d1e60c66c8748a2a2bb391d6f7` |
| `network-audit-2026-05-02_2026-06-01.csv` | `5_2_2026-6_1_2026-University of Minnesota MN PD (Twin Cities)-Network-Audit.csv` | `9dd71ca71df1fd34e9ff080b5d6729e3a9ae8452b1ce27d83c8bbd375088e80c` |
| `network-audit-2026-06-02_2026-07-02.csv` | `6_2_2026-7_2_2026-University of Minnesota MN PD (Twin Cities)-Network-Audit.csv` | `38987a066307153d4bd6d59f030dbf3f088af108e51ffdf1722255d707a968e6` |

The two "Network-Audit" files log every search run against UMPD's Flock
network — by UMPD itself and by every outside agency with query access.
UMPD's own redaction masks `Name`, `License Plate`, `Case #`, and `Filters`
on every row with `***`; that redaction held up on inspection, so these
files carry no individual-level or plate-level data and are republished
whole.

## Not mirrored as released — redaction failure

The two files UMPD labelled `Audit_Redacted.csv` (in-house search logs, as
opposed to the network-wide logs above) were **not actually redacted**: every
row carries the full name of the individual UMPD staff member who ran the
search, plus a specific case number. That is exactly the rank-and-file
personal data this project does not publish, regardless of what an agency
released (see `CLAUDE.md` §1b) — so the two original files are not mirrored
here at all. If you need them as UMPD released them, request them yourself
via the MuckRock link above; the request is public.

What *is* here is a derivative this project produced by removing the `Name`
and `Case #` columns — not replacing them with a pseudonym, removing them —
so no row can be tied to an individual or to a specific investigation.
Everything else in the original file is untouched: organization, search
count, time frame, reason category, search timestamp, search type.

| File here | Derived from (not mirrored) | Columns removed | SHA-256 |
|---|---|---|---|
| `agency-search-log-derived-2026-05-01_2026-06-01.csv` | `5_1_2026-6_1_2026-...-Audit_Redacted.csv` | `Name`, `Case #` | `88f433fbae46a87a568e8cd8c49c36737ab45f9e0c077d0b70fc51a5bd8df073` |
| `agency-search-log-derived-2026-06-02_2026-07-02.csv` | `6_2_2026-7_2_2026-...-Audit_redacted.csv` | `Name`, `Case #` | `b9e2760a8411833a4e7d6255bc8efe6c62e36d5ed3a0fc8bed0c055c808eb7b7` |

Fetched 2026-08-14. License: public government data under the Minnesota
Government Data Practices Act, Minn. Stat. ch. 13.

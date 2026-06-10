# octaplus

SDKs and analysis tooling for the Octaplus dynamic-tariff quotations API
(Belgian day-ahead electricity prices, EUR/MWh, hourly and quarter-hourly).

| Folder | What it is |
|---|---|
| `python/` | Python SDK (`httpx`, sync + async clients) |
| `rust/` | Rust SDK (async `reqwest` client) |
| `js/` | JavaScript SDK (zero-dep ESM, Node ≥ 18 + browsers) |
| `web/` | Price Observatory — Vue 3 + d3 analysis dashboard (static site) |
| `scripts/` | Dataset snapshot downloader (feeds `web/public/data/`) |
| `fixtures/` | Real API responses captured 10/06/2026, shared by all three test suites |

All three SDKs are idiomatic twins: same models, same error taxonomy, same
no-data semantics (an unpublished day is data with `available == false`, not an
error), same earliest-date discovery. See each folder's README.

## Data availability

Hourly data starts **2023-04-11**, quarter-hourly **2025-11-01** (EU day-ahead
switch to 15-minute trading units). The operator backfills history, so the SDKs
can discover the live floor: `get_earliest_validity_date()` /
`getEarliestValidityDate()`.

## The dashboard

`web/` ships with a full historical snapshot and tops it up live in the browser
(the API allows cross-origin requests). `.github/workflows/deploy.yml` builds
and deploys it to GitHub Pages, refreshing the snapshot daily after the ~14:30
CET publication.

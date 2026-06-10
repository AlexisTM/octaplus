# octaplus

Async Rust client for the Octaplus dynamic-tariff quotations API.

## Quickstart

```rust
use octaplus::{Client, Granularity};

let client = Client::new(); // or .with_base_url(...) / .with_timeout(...)
let day = client.get_day(chrono::Local::now().date_naive(), Granularity::Hour).await?;
if day.is_available() {
    for p in &day.prices {
        println!("{} {} EUR/MWh", p.time_range, p.price);
    }
}
```

`get_quotations(start, end, granularity)` returns one `DayQuotations` per day in
the inclusive range; `end: None` means just the start day. Granularities:
`Granularity::Hour` (24 points/day) and `Granularity::QuarterHour` (96/day).

## Data availability

Hourly data starts on **2023-04-11**, quarter-hourly on **2025-11-01** (the EU day-ahead
switch to 15-minute trading units). Days before the floor come back in-fault, exactly like
unpublished future days. The floors are exposed as
`Granularity::Hour.known_earliest_validity_date()` etc. — but they are hints observed on
10/06/2026; the operator has backfilled history before. For ground truth:

```rust
let earliest = client.get_earliest_validity_date(Granularity::QuarterHour).await?; // Option<NaiveDate>
```

This probes the live API (2 requests when the known floor still holds, ~15 when it moved),
assuming availability is contiguous from the floor through today. `Ok(None)` means no day
has data at all.

## Errors and "no data yet"

A day whose prices are not yet published (e.g. tomorrow before ~14:30 CET) is
**not** an error: it comes back as a `DayQuotations` with `in_fault == true`,
empty `prices`, and `is_available() == false`.

`Error` distinguishes:

- `InvalidDateRange` — `end < start` (usage error, no request is made)
- `Transport` — DNS/connect/timeout failures
- `Status` — non-2xx HTTP response
- `InvalidResponse` — 2xx but unparseable/unexpected body

## Caveats

- Prices on the wire use a comma decimal separator (`"112,7175"`); the SDK
  parses them to `f64` (EUR/MWh).
- `time_range` is kept as an opaque string: `"24:00"`/`"24"` are not valid
  times-of-day, and DST-change days have 23/25 hours (92/100 quarters), so do
  not assume 24/96 points per day.

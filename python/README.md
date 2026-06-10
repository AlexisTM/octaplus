# octaplus

Python SDK for the Octaplus dynamic-tariff quotations API (day-ahead electricity prices, EUR/MWh).

## Quickstart

```python
from datetime import date
from octaplus import OctaplusClient, Granularity

with OctaplusClient() as client:
    day = client.get_day(date.today())                 # hourly by default
    week = client.get_quotations(date(2026, 6, 10),
                                 date(2026, 6, 14),
                                 Granularity.QUARTER_HOUR)

if day.available:
    for p in day.prices:
        print(p.time_range, p.price)
```

`AsyncOctaplusClient` offers the same surface with `async`/`await` and `async with`.

## No-data semantics

A day whose prices are not yet published (typically tomorrow before ~14:30 CET) is **not an
error**: it comes back as a `DayQuotations` with `available == False` (`in_fault == True`)
and empty `prices`. Always check `day.available` before reading prices.

## Data availability

Hourly data starts on **2023-04-11**, quarter-hourly on **2025-11-01** (the EU day-ahead
switch to 15-minute trading units). Days before the floor come back in-fault, exactly like
unpublished future days. The floors are exposed as
`Granularity.HOUR.known_earliest_validity_date` etc. — but they are hints observed on
10/06/2026; the operator has backfilled history before. For ground truth:

```python
earliest = client.get_earliest_validity_date(Granularity.QUARTER_HOUR)  # date | None
```

This probes the live API (2 requests when the known floor still holds, ~15 when it moved),
assuming availability is contiguous from the floor through today. Returns `None` if no day
has data at all.

## Errors

- `TransportError` — DNS, connection, timeout failures.
- `APIStatusError` — non-2xx HTTP status (carries `.status_code`).
- `InvalidResponseError` — body that cannot be parsed (bad JSON, shape, price, or date).
- `InvalidDateRangeError` — `end < start` in `get_quotations` (also a `ValueError`).

All subclass `OctaplusError`.

## Caveats

- The API uses Belgian comma decimals (`"112,7175"`); the SDK parses these to plain `float`s.
- `time_range` is an opaque string (`"23 - 24"`, `"23:45 - 24:00"`): the end label `24` is not a
  valid time-of-day, and DST days have 23/25 hours (92/100 quarters). Use `position` for ordering;
  do not assume 24/96 points per day.

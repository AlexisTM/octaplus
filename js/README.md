# octaplus

JavaScript SDK for the Octaplus dynamic-tariff quotations API (day-ahead electricity prices,
EUR/MWh). ESM only, zero runtime dependencies (uses global `fetch`), Node >= 18 and evergreen
browsers.

## Quickstart

```js
import { OctaplusClient, Granularity } from 'octaplus';

const client = new OctaplusClient();
const day = await client.getDay(new Date());            // hourly by default
const week = await client.getQuotations('2026-06-10',
                                        '2026-06-14',
                                        Granularity.QUARTER_HOUR);

if (day.available) {
  for (const p of day.prices) console.log(p.timeRange, p.price);
}
```

Works as-is in the browser (`<script type="module">`): the API reflects any `Origin` header,
so direct cross-origin calls from a static page are fine.

Dates are `'YYYY-MM-DD'` strings; JS `Date` objects are also accepted and use the **local**
year/month/day (never `toISOString()`, which shifts across midnight UTC).

## No-data semantics

A day whose prices are not yet published (typically tomorrow before ~14:30 CET) is **not an
error**: it comes back as a day object with `available === false` (`inFault === true`) and
empty `prices`. Always check `day.available` before reading prices.

## Data availability

Hourly data starts on **2023-04-11**, quarter-hourly on **2025-11-01** (the EU day-ahead
switch to 15-minute trading units). Days before the floor come back in-fault, exactly like
unpublished future days. The floors are exposed as
`knownEarliestValidityDate(Granularity.HOUR)` etc. — but they are hints observed on
10/06/2026; the operator has backfilled history before. For ground truth:

```js
const earliest = await client.getEarliestValidityDate(Granularity.QUARTER_HOUR); // 'YYYY-MM-DD' | null
```

This probes the live API (2 requests when the known floor still holds, ~15 when it moved),
assuming availability is contiguous from the floor through today. Resolves to `null` if no
day has data at all.

## Errors

- `TransportError` — DNS, connection, timeout/abort failures.
- `ApiStatusError` — non-2xx HTTP status (carries `.status`).
- `InvalidResponseError` — body that cannot be parsed (bad JSON, shape, price, or date).
- `InvalidDateRangeError` — `end < start` in `getQuotations`, thrown before any request.

All extend `OctaplusError`.

## Caveats

- The API uses Belgian comma decimals (`"112,7175"`); the SDK parses these to plain `Number`s.
  Negative prices occur in this market — handle `price < 0`.
- `timeRange` is an opaque string (`"23 - 24"`, `"23:45 - 24:00"`): the end label `24` is not a
  valid time-of-day, and DST days have 23/25 hours (92/100 quarters). Use `position` for
  ordering; do not assume 24/96 points per day.

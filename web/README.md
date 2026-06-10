# Octaplus Price Observatory

Single-page analysis dashboard for Belgian day-ahead electricity prices
(EUR/MWh, hourly and quarter-hourly), in a dark control-room idiom.
Vue 3 + Vite + d3 v7, data via the sibling [`octaplus`](../js) JS SDK.

## What it shows

- **KPI strip** — mean, median, P5/P95, min/max (with dates), negative-price
  share, mean daily spread, for the current selection.
- **A · Timeline** — daily aggregate line with min–max band and amber rolling
  mean; the mini strip below is a d3 brush over the full history that drives
  the global date range. Live-fetched days render as a dotted cyan segment.
- **B · Heatmap** — date × time-of-day price matrix on canvas (one snapshot can
  hold ~27k quarter-hour slots; SVG rects would melt), linear or quantile color
  scale, negatives always red.
- **C · Daily profile** — mean price per time-of-day slot, weekday vs weekend,
  with the rail's hour band shaded.
- **D · Distribution** — slot-price histogram with P5/P50/P95 markers and a
  red-tinted negative region.
- **E · Spread & volatility** — daily max–min spread bars + rolling std-dev of
  daily means on a secondary axis.
- **F · Cheap-window finder** — where the cheapest N-hour window starts across
  the selected days, plus median savings vs day mean and a today/tomorrow
  callout. The practical widget for shifting EV charging / boiler / laundry.

## Controls (left rail + masthead)

Granularity (HOUR / QUARTER-HOUR), unit (EUR/MWh ↔ c€/kWh, ÷10), date presets
(7D…ALL) and from/to inputs, rolling window (1–30 d), aggregate
(mean/median/min/max), hour band (dual range, filters KPIs + distribution),
weekday chips, best-window length (1–12 h), color scale (linear/quantile).
All panels derive from one shared filtered selection.

## Data architecture: snapshot + live top-up

At build/deploy time `../scripts/download-dataset.mjs` writes compact
snapshots to `public/data/{hour,quarter_hour}.json`. On load the app reads the
snapshot, then tops up live from `srv.octaplus.be` (the API reflects any
Origin, so the browser calls it directly) — only the days after the snapshot's
latest date through tomorrow. The masthead chip shows the result, e.g.
`SNAPSHOT 2026-06-10 + LIVE Δ2d`; RELOAD LIVE re-runs the top-up. A failed
live fetch never breaks the page — the snapshot stands and the chip flags it.
Missing snapshot files are also fine (a recent live window is fetched
instead), so dev and CI work before any snapshot exists.

## Run

```sh
npm install
npm run dev       # local dev server
npm test          # vitest: src/lib/analysis.js unit tests
npm run build     # static build in dist/ (base './', path-agnostic)
npm run preview
```

## Caveats

- DST days have 23/25 hours (92/100 quarters); slot i of an N-point day maps
  to fractional hour i·24/N everywhere (profile, heatmap, window finder).
- Beyond DST, ~1% of days have a sporadic blank hour upstream (e.g. 2024-12-16
  at 17–18; 2025-03-30 at 19–20 on top of the DST skip). The snapshot then
  carries a `pos` array (1-based slot positions) so position/timeRange stay
  truthful after the hole; index-based binning still treats those few days as
  uniform N-slot days, so their bins after the hole shift by one slot.
- 2025-10-26 (fall DST) has only 24 points: upstream never published the 25th
  hour for that day (2023-10-29 and 2024-10-27 do have 25). Not a pipeline
  regression — don't flag it.
- Negative prices are real market data, not errors; color scales and stats
  treat `price < 0` explicitly.
- Tomorrow's prices publish ~14:30 CET; before that the day is simply absent.

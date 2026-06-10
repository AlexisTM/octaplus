// Pure analysis over DayQuotations[] (octaplus shape). No Vue, no d3, no I/O.
// All prices are EUR/MWh internally; convert only at display time.

export function slotHour(i, n) {
  return (i * 24) / n;
}

/** ISO weekday from 'YYYY-MM-DD': 1=Mon .. 7=Sun. */
export function isoWeekday(isoDate) {
  const d = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

export function isoAddDays(isoDate, n) {
  const t = new Date(`${isoDate}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

function medianOfSorted(s) {
  const n = s.length;
  const m = n >> 1;
  return n % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const availableDays = (days) => days.filter((d) => d.available && d.prices.length > 0);

/** Per available day: {date, mean, min, max, median, count}. */
export function dailyAggregates(days) {
  return availableDays(days).map((d) => {
    const v = d.prices.map((p) => p.price);
    const sorted = [...v].sort((a, b) => a - b);
    return {
      date: d.validityDate,
      mean: mean(v),
      min: sorted[0],
      max: sorted[sorted.length - 1],
      median: medianOfSorted(sorted),
      count: v.length,
    };
  });
}

/** Trailing mean; partial windows at the head (index i averages the last min(i+1, window) values). */
export function rollingMean(values, window) {
  const w = Math.max(1, window);
  const out = new Array(values.length);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= w) sum -= values[i - w];
    out[i] = sum / Math.min(i + 1, w);
  }
  return out;
}

/** Trailing population std-dev, same edge semantics as rollingMean. */
export function rollingStd(values, window) {
  const w = Math.max(1, window);
  const out = new Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const from = Math.max(0, i - w + 1);
    const slice = values.slice(from, i + 1);
    const m = mean(slice);
    out[i] = Math.sqrt(mean(slice.map((x) => (x - m) ** 2)));
  }
  return out;
}

function modalSlotCount(days) {
  const freq = new Map();
  for (const d of days) freq.set(d.prices.length, (freq.get(d.prices.length) ?? 0) + 1);
  let best = 0;
  let bestN = 0;
  for (const [n, c] of freq) {
    if (c > bestN || (c === bestN && n > best)) {
      best = n;
      bestN = c;
    }
  }
  return best;
}

/**
 * Mean price per time-of-day bin. Slot i of an N-point day covers fractional
 * hour i*24/N, so 23/25-point DST days and both granularities bin correctly.
 * Returns [{hour, mean|null, count}] with `slots` bins (default: modal day length).
 */
export function profileByTimeOfDay(days, { weekdays = null, slots = null } = {}) {
  let avail = availableDays(days);
  if (weekdays) {
    const set = weekdays instanceof Set ? weekdays : new Set(weekdays);
    avail = avail.filter((d) => set.has(isoWeekday(d.validityDate)));
  }
  const s = slots ?? (avail.length ? modalSlotCount(avail) : 24);
  if (!s) return [];
  const sums = new Array(s).fill(0);
  const counts = new Array(s).fill(0);
  for (const d of avail) {
    const n = d.prices.length;
    for (let i = 0; i < n; i++) {
      const bin = Math.min(s - 1, Math.floor((slotHour(i, n) * s) / 24));
      sums[bin] += d.prices[i].price;
      counts[bin] += 1;
    }
  }
  return sums.map((sum, i) => ({
    hour: (i * 24) / s,
    mean: counts[i] ? sum / counts[i] : null,
    count: counts[i],
  }));
}

/** Uniform bins over [min, max]; the max value lands in the last bin. */
export function histogram(values, binCount) {
  if (values.length === 0) return { bins: [], min: NaN, max: NaN, total: 0 };
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === max) {
    return { bins: [{ x0: min, x1: max, count: values.length }], min, max, total: values.length };
  }
  const k = Math.max(1, binCount);
  const width = (max - min) / k;
  const bins = Array.from({ length: k }, (_, i) => ({
    x0: min + i * width,
    x1: min + (i + 1) * width,
    count: 0,
  }));
  for (const v of values) {
    bins[Math.min(k - 1, Math.floor((v - min) / width))].count += 1;
  }
  return { bins, min, max, total: values.length };
}

/** Linear-interpolated quantiles (R-7, same as d3.quantile). ps in [0,1]. */
export function percentiles(values, ps) {
  if (values.length === 0) return ps.map(() => null);
  const s = [...values].sort((a, b) => a - b);
  return ps.map((p) => {
    const h = (s.length - 1) * p;
    const lo = Math.floor(h);
    const hi = Math.ceil(h);
    return s[lo] + (h - lo) * (s[hi] - s[lo]);
  });
}

/** Negative-price counts and shares, overall and per day. */
export function negativeStats(days) {
  const perDay = availableDays(days).map((d) => {
    const count = d.prices.reduce((acc, p) => acc + (p.price < 0 ? 1 : 0), 0);
    return { date: d.validityDate, count, total: d.prices.length, share: count / d.prices.length };
  });
  const negativeCount = perDay.reduce((a, d) => a + d.count, 0);
  const totalCount = perDay.reduce((a, d) => a + d.total, 0);
  return { negativeCount, totalCount, share: totalCount ? negativeCount / totalCount : 0, perDay };
}

/** Per-day max-min spread: [{date, spread, min, max}]. */
export function dailySpread(days) {
  return dailyAggregates(days).map((d) => ({
    date: d.date,
    spread: d.max - d.min,
    min: d.min,
    max: d.max,
  }));
}

/**
 * Cheapest n consecutive slots by sliding sum, O(N).
 * Ties resolve to the earliest start. Returns null when n > length or n < 1.
 */
export function bestWindow(prices, n) {
  const len = prices.length;
  if (n < 1 || n > len) return null;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += prices[i];
  let bestSum = sum;
  let startIndex = 0;
  for (let i = n; i < len; i++) {
    sum += prices[i] - prices[i - n];
    if (sum < bestSum) {
      bestSum = sum;
      startIndex = i - n + 1;
    }
  }
  return { startIndex, avg: bestSum / n };
}

/**
 * Best-window starts across days for a window of `hours` (slot count derived
 * per day, so HOUR and QUARTER_HOUR both work). Returns 24 hourly start-bin
 * counts plus per-day results with savings vs the day mean.
 */
export function bestWindowDistribution(days, hours) {
  const counts = new Array(24).fill(0);
  const results = [];
  for (const d of availableDays(days)) {
    const n = d.prices.length;
    const windowSlots = Math.max(1, Math.round((hours * n) / 24));
    const w = bestWindow(d.prices.map((p) => p.price), windowSlots);
    if (!w) continue;
    const startHour = slotHour(w.startIndex, n);
    counts[Math.min(23, Math.floor(startHour))] += 1;
    const dayMean = mean(d.prices.map((p) => p.price));
    results.push({
      date: d.validityDate,
      startIndex: w.startIndex,
      startHour,
      windowSlots,
      avg: w.avg,
      dayMean,
      savingsAbs: dayMean - w.avg,
      savingsPct: dayMean > 0 ? ((dayMean - w.avg) / dayMean) * 100 : null,
    });
  }
  return { counts, results };
}

/** Flat filtered slot records for KPIs/distribution: [{date, weekday, hour, price, timeRange, position}]. */
export function slotRecords(days, { weekdays = null, hourBand = null } = {}) {
  const set = weekdays ? (weekdays instanceof Set ? weekdays : new Set(weekdays)) : null;
  const [h0, h1] = hourBand ?? [0, 24];
  const out = [];
  for (const d of availableDays(days)) {
    const wd = isoWeekday(d.validityDate);
    if (set && !set.has(wd)) continue;
    const n = d.prices.length;
    for (let i = 0; i < n; i++) {
      const hour = slotHour(i, n);
      if (hour < h0 || hour >= h1) continue;
      const p = d.prices[i];
      out.push({
        date: d.validityDate,
        weekday: wd,
        hour,
        price: p.price,
        timeRange: p.timeRange,
        position: p.position,
      });
    }
  }
  return out;
}

// --- units & formatters ---------------------------------------------------

/** EUR/MWh -> euro-cents per kWh. 100 EUR/MWh = 10 c€/kWh. */
export function eurMwhToCentsKwh(v) {
  return v / 10;
}

export function convertPrice(v, unit) {
  if (v == null || Number.isNaN(v)) return null;
  return unit === 'kwh' ? eurMwhToCentsKwh(v) : v;
}

export function unitLabel(unit) {
  return unit === 'kwh' ? 'c€/kWh' : 'EUR/MWh';
}

export function fmtNum(v, digits = 2) {
  if (v == null || Number.isNaN(v) || !Number.isFinite(v)) return '—';
  return v.toFixed(digits);
}

export function fmtPct(v, digits = 1) {
  if (v == null || Number.isNaN(v) || !Number.isFinite(v)) return '—';
  return `${v.toFixed(digits)}%`;
}

/** Fractional hour -> 'HH:MM'. */
export function fmtHour(h) {
  if (h == null || Number.isNaN(h)) return '—';
  const totalMin = Math.round(h * 60);
  const hh = String(Math.floor(totalMin / 60)).padStart(2, '0');
  const mm = String(totalMin % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

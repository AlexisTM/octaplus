import { interpolateRgbBasis, scaleLinear, scaleQuantile, scaleSequential } from 'd3';
import { percentiles } from './analysis.js';

// graphite -> slate -> teal -> amber: matches the amber/cyan terminal identity
export const PRICE_RAMP = interpolateRgbBasis([
  '#11151c',
  '#1b2a3a',
  '#2c4a5e',
  '#3e6e74',
  '#73905f',
  '#c09b39',
  '#ffb000',
  '#ffdd7a',
]);

const NEGATIVE_RAMP = interpolateRgbBasis(['#4a1a1d', '#a8322f', '#ff4d4f']);

/**
 * Price -> color. Positive prices follow PRICE_RAMP (linear to P98 to resist
 * spikes, or quantile over the observed distribution); negatives are always red,
 * deeper red the more negative.
 */
export function makePriceColor(prices, mode = 'linear') {
  const pos = [];
  let negMin = 0;
  for (const p of prices) {
    if (p < 0) {
      if (p < negMin) negMin = p;
    } else {
      pos.push(p);
    }
  }
  const negScale =
    negMin < 0
      ? scaleLinear().domain([negMin, 0]).range([1, 0]).clamp(true)
      : () => 1;

  let posColor;
  if (mode === 'quantile' && pos.length > 1) {
    const steps = Array.from({ length: 9 }, (_, i) => PRICE_RAMP(i / 8));
    const q = scaleQuantile().domain(pos).range(steps);
    posColor = (p) => q(p);
  } else {
    const [hi] = pos.length ? percentiles(pos, [0.98]) : [1];
    const s = scaleSequential(PRICE_RAMP).domain([0, hi || 1]).clamp(true);
    posColor = (p) => s(p);
  }
  return (p) => (p < 0 ? NEGATIVE_RAMP(negScale(p)) : posColor(p));
}

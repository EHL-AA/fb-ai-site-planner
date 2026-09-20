import { RawPlace } from '../types';
import { SignalSource, PriceLevelSignal, measured, proxy, unavailable, clamp100 } from './types';

export const PRICE_LEVEL_LABEL = 'Google Places price level';
const MIN_SAMPLE = 3;

/** Mean Google price band (1 = inexpensive … 4 = very expensive) of nearby businesses, as an affluence index. */
export function priceLevel(places: RawPlace[]): PriceLevelSignal | null {
  const levels = places.map(p => p.priceLevel).filter((l): l is 1 | 2 | 3 | 4 => l != null);
  if (levels.length < MIN_SAMPLE) return null;
  const mean = levels.reduce((a, b) => a + b, 0) / levels.length;
  return {
    meanLevel: Math.round(mean * 10) / 10,
    index0to100: clamp100(((mean - 1) / 3) * 100),
    sample: levels.length,
  };
}

export const priceLevelSource: SignalSource<'priceLevel'> = {
  id: 'priceLevel',
  label: PRICE_LEVEL_LABEL,
  async enrich(nodes, ctx) {
    const suburbWide = priceLevel(ctx.swept ?? []);
    return nodes.map(node => {
      const v = priceLevel(node.nearby ?? node.places);
      if (v) return measured(v, PRICE_LEVEL_LABEL, `Average Google price band across ${v.sample} businesses within 600 m (1 = inexpensive, 4 = very expensive).`);
      if (suburbWide) return proxy(suburbWide, PRICE_LEVEL_LABEL, `Suburb-wide average: only ${suburbWide.sample} businesses in the whole sweep carry a Google price band, none near this site.`);
      return unavailable<PriceLevelSignal>(PRICE_LEVEL_LABEL, 'Fewer than 3 businesses in the suburb carry a Google price band.');
    });
  },
};

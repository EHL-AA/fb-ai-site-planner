import { describe, it, expect } from 'vitest';
import { priceLevel, priceLevelSource } from './price-level';
import { CallBudget, SignalContext } from './types';
import { RawPlace } from '../types';

const ctx: SignalContext = {
  selection: { placeId: 'p', suburb: 'S', city: 'C', center: { lat: -26.1, lng: 28.05 }, viewport: { north: 0, south: 0, east: 0, west: 0 } },
  mapsApiKey: '', fetchImpl: fetch, budget: new CallBudget(), now: new Date(), retail: [], swept: [],
};
const place = (priceLevel?: 1 | 2 | 3 | 4): RawPlace => ({ lat: -26.1, lng: 28.05, types: ['restaurant'], priceLevel });

describe('priceLevel', () => {
  it('averages the Google price band and scales 1..4 to 0..100', () => {
    expect(priceLevel([place(1), place(2), place(3), place(undefined)])).toEqual({ meanLevel: 2, index0to100: 33, sample: 3 });
    expect(priceLevel([place(4), place(4), place(4)])).toEqual({ meanLevel: 4, index0to100: 100, sample: 3 });
  });
  it('returns null below the sample threshold', () => {
    expect(priceLevel([place(2), place(2)])).toBeNull();
  });
});

describe('priceLevelSource', () => {
  it('prefers the wider nearby set over cluster members', async () => {
    const [a] = await priceLevelSource.enrich([
      { id: 'a', label: 'a', lat: 0, lng: 0, places: [place(1)], nearby: [place(1), place(3), place(3), place(3)] },
    ], ctx);
    expect(a.value?.sample).toBe(4);
  });
  it('falls back to a suburb-wide proxy when the node sample is thin', async () => {
    const [a] = await priceLevelSource.enrich([
      { id: 'a', label: 'a', lat: 0, lng: 0, places: [place(2)] },
    ], { ...ctx, swept: [place(2), place(3), place(4), place(undefined)] });
    expect(a.provenance).toBe('proxy');
    expect(a.value).toEqual({ meanLevel: 3, index0to100: 67, sample: 3 });
    expect(a.note).toMatch(/Suburb-wide/);
  });
  it('is measured when enough bands exist, unavailable otherwise, with no API calls', async () => {
    const budget = new CallBudget();
    const [a, b] = await priceLevelSource.enrich([
      { id: 'a', label: 'a', lat: 0, lng: 0, places: [place(1), place(1), place(2)] },
      { id: 'b', label: 'b', lat: 0, lng: 0, places: [place(3)] },
    ], { ...ctx, budget });
    expect(a.provenance).toBe('measured');
    expect(a.value?.meanLevel).toBe(1.3);
    expect(b.provenance).toBe('unavailable');
    expect(budget.used).toBe(0);
  });
});

import { describe, it, expect } from 'vitest';
import { isOpenAt, isOpenOnDay, tradeHours, tradeHoursSource } from './trade-hours';
import { CallBudget, SignalContext } from './types';
import { RawPlace } from '../types';

const ctx: SignalContext = {
  selection: { placeId: 'p', suburb: 'S', city: 'C', center: { lat: -26.1, lng: 28.05 }, viewport: { north: 0, south: 0, east: 0, west: 0 } },
  mapsApiKey: '', fetchImpl: fetch, budget: new CallBudget(), now: new Date(), retail: [], swept: [],
};
const place = (periods: RawPlace['openPeriods']): RawPlace => ({ lat: -26.1, lng: 28.05, types: ['restaurant'], openPeriods: periods });
// Mon–Sat 09:00–17:00
const dayShop = [1, 2, 3, 4, 5, 6].map(d => ({ openDay: d, openMinute: 540, closeDay: d, closeMinute: 1020 }));
// Every day 10:00–23:00
const lateShop = [0, 1, 2, 3, 4, 5, 6].map(d => ({ openDay: d, openMinute: 600, closeDay: d, closeMinute: 1380 }));
// Fri/Sat 18:00–02:00 (overnight)
const bar = [5, 6].map(d => ({ openDay: d, openMinute: 1080, closeDay: (d + 1) % 7, closeMinute: 120 }));
const allHours = [{ openDay: 0, openMinute: 0 }];

describe('isOpenAt', () => {
  it('handles same-day, overnight and 24-hour periods', () => {
    expect(isOpenAt(dayShop, 3, 20 * 60)).toBe(false);
    expect(isOpenAt(lateShop, 3, 20 * 60)).toBe(true);
    expect(isOpenAt(bar, 6, 1 * 60)).toBe(true);   // Sat 01:00 falls inside Fri 18:00–Sat 02:00
    expect(isOpenAt(bar, 3, 20 * 60)).toBe(false);
    expect(isOpenAt(allHours, 3, 20 * 60)).toBe(true);
    expect(isOpenAt(undefined, 3, 20 * 60)).toBe(false);
  });
});

describe('isOpenOnDay', () => {
  it('detects Sunday trading', () => {
    expect(isOpenOnDay(dayShop, 0)).toBe(false);
    expect(isOpenOnDay(lateShop, 0)).toBe(true);
    expect(isOpenOnDay(allHours, 0)).toBe(true);
  });
});

describe('tradeHours', () => {
  it('returns shares open late and on Sunday', () => {
    const v = tradeHours([place(dayShop), place(lateShop), place(lateShop), place(bar), place(undefined)]);
    expect(v).toEqual({ openLate0to100: 50, openSunday0to100: 50, sample: 4 });
  });
  it('returns null below the sample threshold', () => {
    expect(tradeHours([place(lateShop), place(lateShop)])).toBeNull();
  });
});

describe('tradeHoursSource', () => {
  it('produces measured / unavailable per node without any API call', async () => {
    const budget = new CallBudget();
    const [a, b] = await tradeHoursSource.enrich([
      { id: 'a', label: 'a', lat: 0, lng: 0, places: [place(lateShop), place(lateShop), place(dayShop)] },
      { id: 'b', label: 'b', lat: 0, lng: 0, places: [place(undefined)] },
    ], { ...ctx, budget });
    expect(a.provenance).toBe('measured');
    expect(a.value?.openLate0to100).toBe(67);
    expect(b.provenance).toBe('unavailable');
    expect(budget.used).toBe(0);
  });
});

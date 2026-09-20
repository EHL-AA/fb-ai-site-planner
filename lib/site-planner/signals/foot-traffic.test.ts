import { describe, it, expect } from 'vitest';
import { csvFootTrafficProvider, nullFootTrafficProvider, footTrafficSource } from './foot-traffic';
import { CallBudget, SignalContext } from './types';

const ctxWith = (rows: any[]): SignalContext => ({
  selection: { placeId: 'p', suburb: 'S', city: 'C', center: { lat: -26.1, lng: 28.05 }, viewport: { north: 0, south: 0, east: 0, west: 0 } },
  mapsApiKey: '', fetchImpl: fetch, budget: new CallBudget(), now: new Date(), retail: [], footTrafficRows: rows,
});
const node = { id: 'n', label: 'n', lat: -26.1, lng: 28.05, places: [] };

describe('csvFootTrafficProvider', () => {
  it('matches the nearest row within 300m', async () => {
    const rows = [{ lat: -26.1015, lng: 28.05, dailyVisits: 4200, peakHour: 13 }, { lat: -26.2, lng: 28.2, dailyVisits: 99 }];
    const [v] = await csvFootTrafficProvider.lookup([node], ctxWith(rows));
    expect(v).toEqual({ dailyVisits: 4200, peakHour: 13 });
  });
  it('returns null when nothing is within 300m', async () => {
    const [v] = await csvFootTrafficProvider.lookup([node], ctxWith([{ lat: -26.2, lng: 28.2, dailyVisits: 99 }]));
    expect(v).toBeNull();
  });
});

describe('footTrafficSource', () => {
  it('uses the null provider when no rows are uploaded', async () => {
    const [sig] = await footTrafficSource.enrich([node], ctxWith([]));
    expect(sig.provenance).toBe('unavailable');
    expect(sig.source).toBe(nullFootTrafficProvider.label);
  });
  it('reports measured visits from CSV rows', async () => {
    const [sig] = await footTrafficSource.enrich([node], ctxWith([{ lat: -26.1, lng: 28.05, dailyVisits: 1000 }]));
    expect(sig.provenance).toBe('measured');
    expect(sig.value?.dailyVisits).toBe(1000);
  });
});

import { describe, it, expect } from 'vitest';
import { densityIndices, placesDensitySource, DENSITY_TYPES } from './places-density';
import { CallBudget, SignalContext } from './types';

const ctxWith = (fetchImpl: any): SignalContext => ({
  selection: { placeId: 'p', suburb: 'S', city: 'C', center: { lat: -26.1, lng: 28.05 }, viewport: { north: 0, south: 0, east: 0, west: 0 } },
  mapsApiKey: 'k', fetchImpl, budget: new CallBudget(), now: new Date(), retail: [], footTrafficRows: [],
});
const node = (id: string) => ({ id, label: id, lat: -26.1, lng: 28.05, places: [] });

describe('densityIndices', () => {
  it('log-scales daytime and evening sums against the max node', () => {
    const out = densityIndices([
      { corporate_office: 40, school: 5, university: 0, bar: 10, restaurant: 30, cafe: 10 },
      { corporate_office: 0, school: 1, university: 0, bar: 0, restaurant: 2, cafe: 1 },
    ]);
    expect(out[0]).toEqual({ daytimeIndex0to100: 100, eveningIndex0to100: 100 });
    expect(out[1].daytimeIndex0to100).toBeLessThan(30);
    expect(out[1].eveningIndex0to100).toBeLessThan(50);
  });
});

describe('placesDensitySource', () => {
  it('requests one count per type and returns measured signals', async () => {
    const types: string[] = [];
    const fetchImpl = async (_: string, init: any) => {
      const body = JSON.parse(init.body);
      types.push(body.filter.typeFilter.includedTypes[0]);
      return { ok: true, json: async () => ({ count: '12' }) } as any;
    };
    const [sig] = await placesDensitySource.enrich([node('a')], ctxWith(fetchImpl));
    expect(types.sort()).toEqual([...DENSITY_TYPES].sort());
    expect(sig.provenance).toBe('measured');
    expect(sig.value?.counts.restaurant).toBe(12);
  });
  it('marks unavailable with an enable note when the API is disabled', async () => {
    const fetchImpl = async () => ({ ok: false, status: 403, json: async () => ({ error: { status: 'PERMISSION_DENIED', details: [{ reason: 'SERVICE_DISABLED' }] } }) } as any);
    const [sig] = await placesDensitySource.enrich([node('a')], ctxWith(fetchImpl));
    expect(sig.provenance).toBe('unavailable');
    expect(sig.note).toMatch(/Enable Places Aggregate API/);
  });
});

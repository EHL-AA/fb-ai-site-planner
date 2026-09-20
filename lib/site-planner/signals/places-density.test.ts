import { describe, it, expect, vi } from 'vitest';
import { densityIndices, placesDensitySource, DENSITY_TYPES } from './places-density';
import { CallBudget, SignalContext } from './types';

const ctxWith = (fetchImpl: any): SignalContext => ({
  selection: { placeId: 'p', suburb: 'S', city: 'C', center: { lat: -26.1, lng: 28.05 }, viewport: { north: 0, south: 0, east: 0, west: 0 } },
  mapsApiKey: 'k', fetchImpl, budget: new CallBudget(), now: new Date(), retail: [], swept: [],
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
  it('returns mixed measured/unavailable signals for multi-node with per-node failures', async () => {
    const fetchImpl = async (_: string, init: any) => {
      const body = JSON.parse(init.body);
      const lat = body.filter.locationFilter.circle.latLng.latitude;
      // Node A (lat -26.1) succeeds
      if (lat === -26.1) {
        return { ok: true, json: async () => ({ count: '5' }) } as any;
      }
      // Node B (lat -26.2) fails
      return { ok: false, status: 500, json: async () => ({}) } as any;
    };
    const nodeA = node('a');
    const nodeB = { ...node('b'), lat: -26.2 };
    const sigs = await placesDensitySource.enrich([nodeA, nodeB], ctxWith(fetchImpl));
    expect(sigs[0].provenance).toBe('measured');
    expect(sigs[1].provenance).toBe('unavailable');
  });
  it('respects budget exhaustion and returns unavailable without calling fetchImpl', async () => {
    const budget = new CallBudget(0);
    const ctx = {
      selection: { placeId: 'p', suburb: 'S', city: 'C', center: { lat: -26.1, lng: 28.05 }, viewport: { north: 0, south: 0, east: 0, west: 0 } },
      mapsApiKey: 'k',
      fetchImpl: async () => { throw new Error('fetchImpl should not be called'); },
      budget,
      now: new Date(),
      retail: [], swept: [],
    };
    const sigs = await placesDensitySource.enrich([node('a')], ctx);
    expect(sigs[0].provenance).toBe('unavailable');
  });
  it('short-circuits all nodes on probe SERVICE_DISABLED, using only 1 budget', async () => {
    const budget = new CallBudget();
    const fetchImpl = async () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: { status: 'PERMISSION_DENIED', details: [{ reason: 'SERVICE_DISABLED' }] } }),
    } as any);
    const ctx = {
      selection: { placeId: 'p', suburb: 'S', city: 'C', center: { lat: -26.1, lng: 28.05 }, viewport: { north: 0, south: 0, east: 0, west: 0 } },
      mapsApiKey: 'k',
      fetchImpl,
      budget,
      now: new Date(),
      retail: [], swept: [],
    };
    const sigs = await placesDensitySource.enrich([node('a'), node('b')], ctx);
    expect(sigs[0].provenance).toBe('unavailable');
    expect(sigs[1].provenance).toBe('unavailable');
    expect(budget.used).toBe(1);
  });
  it('keeps all 8 type counts on node 0 when only the probe call fails non-fatally', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      let calls = 0;
      const fetchImpl = async () => {
        calls++;
        if (calls === 1) return { ok: false, status: 500 } as any;
        return { ok: true, json: async () => ({ count: '3' }) } as any;
      };
      const budget = new CallBudget();
      const ctx = { ...ctxWith(fetchImpl), budget };
      const [sig] = await placesDensitySource.enrich([node('a')], ctx);
      expect(sig.provenance).toBe('measured');
      expect(Object.keys(sig.value!.counts).sort()).toEqual([...DENSITY_TYPES].sort());
      expect(budget.used).toBe(9);
    } finally {
      spy.mockRestore();
    }
  });
  it('silences console.warn on countPlaces errors', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const fetchImpl = async () => {
        throw new Error('network error');
      };
      const sigs = await placesDensitySource.enrich([node('a')], ctxWith(fetchImpl));
      expect(sigs[0].provenance).toBe('unavailable');
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});

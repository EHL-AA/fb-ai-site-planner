import { describe, it, expect } from 'vitest';
import { gatherSignals } from './index';
import { CallBudget, SignalContext, SignalSource, measured } from './types';

const ctx: SignalContext = {
  selection: { placeId: 'p', suburb: 'S', city: 'C', center: { lat: -26.1, lng: 28.05 }, viewport: { north: 0, south: 0, east: 0, west: 0 } },
  mapsApiKey: '', fetchImpl: fetch, budget: new CallBudget(), now: new Date(), retail: [], swept: [],
};
const nodes = [{ id: 'a', label: 'a', lat: -26.1, lng: 28.05, places: [] }, { id: 'b', label: 'b', lat: -26.2, lng: 28.1, places: [] }];

describe('gatherSignals', () => {
  it('collects every source per node and converts a rejected source to unavailable', async () => {
    const good: SignalSource<'affluence'> = { id: 'affluence', label: 'G', enrich: async ns => ns.map(() => measured({ index0to100: 50, premiumAnchors: 1, valueAnchors: 1 }, 'G')) };
    const bad: SignalSource<'congestion'> = { id: 'congestion', label: 'B', enrich: async () => { throw new Error('boom'); } };
    const out = await gatherSignals(nodes, ctx, [good, bad]);
    expect(out).toHaveLength(2);
    expect(out[0].affluence.provenance).toBe('measured');
    expect(out[0].congestion.provenance).toBe('unavailable');
    expect(out[1].census.provenance).toBe('unavailable'); // source not supplied → unavailable
  });

  it('converts a synchronous throw from a source to unavailable for every node', async () => {
    const sync: SignalSource<'affluence'> = {
      id: 'affluence',
      label: 'Sync',
      enrich: (() => { throw new Error('sync'); }) as any,
    };
    const out = await gatherSignals(nodes, ctx, [sync]);
    expect(out).toHaveLength(2);
    expect(out[0].affluence.provenance).toBe('unavailable');
    expect(out[1].affluence.provenance).toBe('unavailable');
  });
});

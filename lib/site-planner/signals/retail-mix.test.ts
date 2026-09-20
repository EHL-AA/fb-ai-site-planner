import { describe, it, expect } from 'vitest';
import { classifyAnchor, retailMixSource } from './retail-mix';
import { CallBudget, SignalContext } from './types';

const rec = (b: string, lat: number, lng: number) => ({ b, n: b, a: '', lat, lng });
const ctxWith = (retail: any[]): SignalContext => ({
  selection: { placeId: 'p', suburb: 'S', city: 'C', center: { lat: -26.1, lng: 28.05 }, viewport: { north: 0, south: 0, east: 0, west: 0 } },
  mapsApiKey: '', fetchImpl: fetch, budget: new CallBudget(), now: new Date(), retail, footTrafficRows: [],
});
const node = { id: 'n', label: 'n', lat: -26.1, lng: 28.05, places: [] };

describe('classifyAnchor', () => {
  it('splits premium vs value and ignores neutral brands', () => {
    expect(classifyAnchor('Woolworths')).toBe('premium');
    expect(classifyAnchor('Checkers')).toBe('premium');
    expect(classifyAnchor('Boxer')).toBe('value');
    expect(classifyAnchor('Usave')).toBe('value');
    expect(classifyAnchor('Shoprite')).toBe('value');
    expect(classifyAnchor('Spar')).toBeNull();
    expect(classifyAnchor('Pick N Pay')).toBeNull();
  });
});

describe('retailMixSource', () => {
  it('scores premium share within 2km', async () => {
    const retail = [rec('Woolworths', -26.101, 28.05), rec('Checkers', -26.105, 28.05), rec('Boxer', -26.108, 28.05), rec('Boxer', -26.3, 28.5)];
    const [sig] = await retailMixSource.enrich([node], ctxWith(retail));
    expect(sig.provenance).toBe('proxy');
    expect(sig.value).toEqual({ index0to100: 67, premiumAnchors: 2, valueAnchors: 1 });
  });
  it('is unavailable with fewer than 2 anchors nearby', async () => {
    const [sig] = await retailMixSource.enrich([node], ctxWith([rec('Woolworths', -26.101, 28.05)]));
    expect(sig.provenance).toBe('unavailable');
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { nearestWard, censusSource, _resetCensusCache, CensusWard } from './census';
import { CallBudget, SignalContext } from './types';

const wards: CensusWard[] = [
  { ward: '79800001', muni: 'JHB', lat: -26.10, lng: 28.05, population: 12000, households: 4000, areaKm2: 4 },
  { ward: '79800002', muni: 'JHB', lat: -26.30, lng: 28.30, population: 5000, households: 1500, areaKm2: 20 },
];
const ctxWith = (fetchImpl: any): SignalContext => ({
  selection: { placeId: 'p', suburb: 'S', city: 'C', center: { lat: -26.1, lng: 28.05 }, viewport: { north: 0, south: 0, east: 0, west: 0 } },
  mapsApiKey: '', fetchImpl, budget: new CallBudget(), now: new Date(), retail: [], footTrafficRows: [],
});
const node = { id: 'n', label: 'n', lat: -26.101, lng: 28.051, places: [] };

beforeEach(() => _resetCensusCache());

describe('nearestWard', () => {
  it('picks the closest ward within maxM', () => {
    expect(nearestWard(wards, -26.101, 28.051)?.ward).toBe('79800001');
    expect(nearestWard(wards, -27.0, 29.0, 15000)).toBeNull();
  });
});

describe('censusSource', () => {
  it('joins nodes to the nearest ward and derives density', async () => {
    const fetchImpl = async () => ({ ok: true, json: async () => wards } as any);
    const [sig] = await censusSource.enrich([node], ctxWith(fetchImpl));
    expect(sig.provenance).toBe('measured');
    expect(sig.value).toEqual({ ward: '79800001', population: 12000, households: 4000, densityPerKm2: 3000 });
  });
  it('is unavailable when the file is missing or empty', async () => {
    const fetchImpl = async () => ({ ok: false, status: 404, json: async () => ({}) } as any);
    const [sig] = await censusSource.enrich([node], ctxWith(fetchImpl));
    expect(sig.provenance).toBe('unavailable');
    expect(sig.note).toMatch(/census-wards\.json/);
  });
});

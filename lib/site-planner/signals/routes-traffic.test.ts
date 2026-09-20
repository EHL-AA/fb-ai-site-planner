import { describe, it, expect, vi } from 'vitest';
import { legEndpoints, nextWeekdayPeakIso, nextWeekdaySlotIso, congestionIndex, routesTrafficSource } from './routes-traffic';
import { CallBudget, SignalContext } from './types';
import { haversineMeters } from '../geo';

const ctxWith = (fetchImpl: any, max = 250): SignalContext => ({
  selection: { placeId: 'p', suburb: 'S', city: 'C', center: { lat: -26.1, lng: 28.05 }, viewport: { north: 0, south: 0, east: 0, west: 0 } },
  mapsApiKey: 'k', fetchImpl, budget: new CallBudget(max), now: new Date('2026-09-20T08:00:00Z'), retail: [], swept: [],
});
const node = { id: 'n1', label: 'n1', lat: -26.1, lng: 28.05, places: [] };

describe('legEndpoints', () => {
  it('places four points ~1500m away on the compass', () => {
    const pts = legEndpoints({ lat: -26.1, lng: 28.05 }, 1500);
    expect(pts).toHaveLength(4);
    for (const p of pts) expect(haversineMeters(-26.1, 28.05, p.lat, p.lng)).toBeCloseTo(1500, -2);
    expect(pts[0].lat).toBeGreaterThan(-26.1); // N
    expect(pts[1].lng).toBeGreaterThan(28.05); // E
  });
});

describe('nextWeekdayPeakIso', () => {
  it('returns 15:30Z on the next weekday strictly after now', () => {
    expect(nextWeekdayPeakIso(new Date('2026-09-20T08:00:00Z'))).toBe('2026-09-21T15:30:00.000Z'); // Sunday -> Monday
    expect(nextWeekdayPeakIso(new Date('2026-09-25T16:00:00Z'))).toBe('2026-09-28T15:30:00.000Z'); // Fri after peak -> Monday
    expect(nextWeekdayPeakIso(new Date('2026-09-22T10:00:00Z'))).toBe('2026-09-22T15:30:00.000Z'); // Tue before peak -> same day
  });
});

describe('nextWeekdaySlotIso', () => {
  it('returns 05:30Z / 10:30Z / 15:30Z for morning / midday / evening', () => {
    const now = new Date('2026-09-22T08:00:00Z'); // Tuesday 10:00 SAST
    expect(nextWeekdaySlotIso(now, 'morning')).toBe('2026-09-23T05:30:00.000Z'); // already past → Wed
    expect(nextWeekdaySlotIso(now, 'midday')).toBe('2026-09-22T10:30:00.000Z');
    expect(nextWeekdaySlotIso(now, 'evening')).toBe('2026-09-22T15:30:00.000Z');
  });
});

describe('congestionIndex', () => {
  it('maps ratio 1.0 -> 0, 1.3 -> 50, >=1.6 -> 100', () => {
    expect(congestionIndex([1])).toBe(0);
    expect(congestionIndex([1.3])).toBe(50);
    expect(congestionIndex([1.6, 2.0])).toBe(100);
    expect(congestionIndex([])).toBe(0);
  });
});

describe('routesTrafficSource', () => {
  it('computes three slot indices from 4 legs each + drive time from centre', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      return { ok: true, json: async () => ({ routes: [{ duration: '780s', staticDuration: '600s' }] }) } as any;
    };
    const [sig] = await routesTrafficSource.enrich([node], ctxWith(fetchImpl));
    expect(calls).toBe(13);
    expect(sig.provenance).toBe('measured');
    expect(sig.value).toEqual({ index0to100: 50, slots: { morning: 50, midday: 50, evening: 50 }, driveMinutesFromCentre: 13 });
  });
  it('becomes unavailable on HTTP error without throwing', async () => {
    const fetchImpl = async () => ({ ok: false, status: 403, json: async () => ({ error: { status: 'PERMISSION_DENIED' } }) } as any);
    const [sig] = await routesTrafficSource.enrich([node], ctxWith(fetchImpl));
    expect(sig.provenance).toBe('unavailable');
    expect(sig.value).toBeNull();
  });
  it('becomes unavailable when the budget is exhausted', async () => {
    const [sig] = await routesTrafficSource.enrich([node], ctxWith(async () => { throw new Error('no'); }, 0));
    expect(sig.provenance).toBe('unavailable');
  });
  it('becomes unavailable when fetchImpl throws with default budget', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const [sig] = await routesTrafficSource.enrich([node], ctxWith(async () => { throw new Error('network down'); }));
    expect(sig.provenance).toBe('unavailable');
    expect(sig.value).toBeNull();
    warnSpy.mockRestore();
  });
});

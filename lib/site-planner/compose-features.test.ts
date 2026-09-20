import { describe, it, expect } from 'vitest';
import { blendTraffic, blendDemographics, accessibilityBonus, flattenSources, composeFeatures } from './compose-features';
import { NodeSignals, measured, proxy, unavailable } from './signals/types';
import { CandidateNode } from './types';

const none = (): NodeSignals => ({
  congestion: unavailable('R', 'x'), density: unavailable('D', 'x'), affluence: unavailable('A', 'x'),
  census: unavailable('C', 'x'), footTraffic: unavailable('F', 'x'),
});
const poi = (reviews: number, types: string[] = ['restaurant']) => ({ lat: -26.1, lng: 28.05, userRatingCount: reviews, rating: 4.2, types, primaryType: types[0] });
const node = (id: string, places: any[]): CandidateNode => ({ id, label: id, lat: -26.1, lng: 28.05, places });

describe('blendTraffic', () => {
  it('returns the review score alone when nothing else is available', () => {
    expect(blendTraffic(60, none(), 0)).toBe(60);
  });
  it('renormalises over available signals', () => {
    const s = none();
    s.congestion = measured({ index0to100: 100, driveMinutesFromCentre: 5 }, 'R');
    // review 0.2 → 60, congestion 0.2 → 100 → (60*0.2 + 100*0.2)/0.4 = 80
    expect(blendTraffic(60, s, 0)).toBe(80);
  });
  it('weights measured foot traffic highest', () => {
    const s = none();
    s.footTraffic = measured({ dailyVisits: 10000 }, 'F');
    // review 0.2 → 20, foot 0.4 → 100 (max) → (20*0.2 + 100*0.4)/0.6 = 73
    expect(blendTraffic(20, s, 10000)).toBe(73);
  });
});

describe('blendDemographics', () => {
  it('uses affluence + census density when present, else the base proxy', () => {
    const base = { source: 'proxy' as const, affluenceProxy0to100: 40 };
    expect(blendDemographics(base, none(), 0)).toBe(40);
    const s = none();
    s.affluence = proxy({ index0to100: 80, premiumAnchors: 4, valueAnchors: 1 }, 'A');
    s.census = measured({ ward: 'w', population: 10000, households: 3000, densityPerKm2: 5000 }, 'C');
    // affluence 0.6 → 80, density 0.4 → 100 (max) → 88
    expect(blendDemographics(base, s, 5000)).toBe(88);
  });
  it('lets uploaded LSM override affluence', () => {
    const base = { source: 'csv' as const, lsm: 9, affluenceProxy0to100: 10 };
    const s = none();
    s.affluence = proxy({ index0to100: 20, premiumAnchors: 1, valueAnchors: 4 }, 'A');
    expect(blendDemographics(base, s, 0)).toBe(90); // LSM 9 → 90
  });
});

describe('accessibilityBonus', () => {
  it('is 20 at <=5 min, 0 at >=15, linear between, 0 when unknown', () => {
    expect(accessibilityBonus(3)).toBe(20);
    expect(accessibilityBonus(10)).toBe(10);
    expect(accessibilityBonus(15)).toBe(0);
    expect(accessibilityBonus(null)).toBe(0);
  });
});

describe('flattenSources', () => {
  it('prepends the review-density proxy row, then one row per signal', () => {
    const rows = flattenSources(none());
    expect(rows).toHaveLength(6);
    expect(rows[0]).toEqual({
      label: 'Google Places review density',
      provenance: 'proxy',
      note: 'Review-count density of nearby businesses from the Places sweep; always present.',
    });
    expect(rows[1]).toEqual({ label: 'R', provenance: 'unavailable', note: 'x' });
  });
});

describe('composeFeatures', () => {
  it('attaches signals + sources and blends the scores', () => {
    const s = none();
    s.congestion = measured({ index0to100: 100, driveMinutesFromCentre: 4 }, 'R');
    const fv = composeFeatures([node('a', [poi(500)])], [s], { competitors: [], stores: [], demographics: [] });
    expect(fv[0].signals).toBe(s);
    expect(fv[0].sources).toHaveLength(6);
    expect(fv[0].trafficProxy.score0to100).toBeGreaterThan(50);
    expect(fv[0].accessibility.score0to100).toBeGreaterThanOrEqual(20);
  });
});

import { describe, it, expect } from 'vitest';
import { siteCodePrefix, toDisplaySites } from './display';
import { FeatureVector } from './types';

describe('siteCodePrefix', () => {
  it('maps known South African cities to their common codes', () => {
    expect(siteCodePrefix('Johannesburg')).toBe('JHB');
    expect(siteCodePrefix('Cape Town')).toBe('CPT');
    expect(siteCodePrefix('  durban ')).toBe('DBN');
  });
  it('falls back to the first three letters, or SITE when empty', () => {
    expect(siteCodePrefix('Stellenbosch')).toBe('STE');
    expect(siteCodePrefix('')).toBe('SITE');
    expect(siteCodePrefix(undefined)).toBe('SITE');
  });
});

describe('toDisplaySites', () => {
  const fv: FeatureVector = {
    id: 'n1', label: 'Near X', lat: -34, lng: 18.5,
    trafficProxy: { poiCount: 1, totalReviews: 10, anchorTypes: [], score0to100: 50 },
    accessibility: { transitStopsNearby: 0, majorRoadAdjacent: false, score0to100: 0 },
    competition: { competitorsWithin1km: 0, nearestCompetitorM: null },
    cannibalisation: { ownStoresWithin2km: 0, nearestOwnStoreM: null },
    demographics: { source: 'proxy', affluenceProxy0to100: 40 },
  };
  const result = { overallSummary: '', ranked: [{ id: 'n1', rank: 1, compositeScore0to100: 70, breakdown: { traffic: 50, demographics: 40, competition: 90, accessibility: 0 }, rationale: 'r', risks: '' }] };
  it('uses the city for the site code', () => {
    expect(toDisplaySites([fv], result, 'Mitchells Plain', 'Cape Town')[0].code).toBe('CPT-001');
    expect(toDisplaySites([fv], result, 'Rosebank')[0].code).toBe('SITE-001');
  });
});

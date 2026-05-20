import { describe, it, expect } from 'vitest';
import { buildPrompt, validateRankedResult } from './reasoning';
import { FeatureVector, DEFAULT_WEIGHTS } from './types';

const fv: FeatureVector = {
  id: 'n1', label: 'Rosebank Mall', lat: -26.14, lng: 28.04,
  trafficProxy: { poiCount: 12, totalReviews: 5000, anchorTypes: ['shopping_mall'], score0to100: 88 },
  accessibility: { transitStopsNearby: 2, majorRoadAdjacent: true, score0to100: 70 },
  competition: { competitorsWithin1km: 1, nearestCompetitorM: 320 },
  cannibalisation: { ownStoresWithin2km: 0, nearestOwnStoreM: null },
  demographics: { source: 'csv', lsm: 9, affluenceProxy0to100: 80 },
};

describe('buildPrompt', () => {
  it('embeds brand, weights and each candidate id', () => {
    const p = buildPrompt({ brand: 'Steers', suburb: 'Rosebank', features: [fv], weights: DEFAULT_WEIGHTS, constraints: 'avoid malls' });
    expect(p).toContain('Steers');
    expect(p).toContain('Rosebank');
    expect(p).toContain('n1');
    expect(p).toContain('avoid malls');
    expect(p).toContain('0.4'); // traffic weight
  });
});

describe('validateRankedResult', () => {
  it('accepts a well-formed result', () => {
    const ok = validateRankedResult({
      overallSummary: 'x',
      ranked: [{ id: 'n1', rank: 1, compositeScore0to100: 90, breakdown: { traffic: 88, demographics: 80, competition: 70, accessibility: 70 }, rationale: 'good', risks: 'none' }],
    });
    expect(ok.ranked[0].id).toBe('n1');
  });
  it('throws on a missing ranked array', () => {
    expect(() => validateRankedResult({ overallSummary: 'x' })).toThrow();
  });
  it('throws when a ranked item lacks an id', () => {
    expect(() => validateRankedResult({ overallSummary: 'x', ranked: [{ rank: 1 }] })).toThrow();
  });
});

import { describe, it, expect } from 'vitest';
import { computeFeatures } from './features';
import { CandidateNode } from './types';

const node = (id: string, lat: number, lng: number, places: any[]): CandidateNode => ({
  id, label: id, lat, lng, places,
});

const poi = (reviews: number, types: string[] = ['restaurant']) => ({
  lat: -26.1, lng: 28.05, userRatingCount: reviews, rating: 4.2, types, primaryType: types[0],
});

describe('computeFeatures', () => {
  it('gives the busiest node a higher traffic score than a quiet one', () => {
    const busy = node('busy', -26.10, 28.05, [poi(2000), poi(1500), poi(900)]);
    const quiet = node('quiet', -26.20, 28.15, [poi(20)]);
    const fv = computeFeatures([busy, quiet], { competitors: [], stores: [], demographics: [] });
    const b = fv.find(f => f.id === 'busy')!;
    const q = fv.find(f => f.id === 'quiet')!;
    expect(b.trafficProxy.score0to100).toBeGreaterThan(q.trafficProxy.score0to100);
    expect(b.trafficProxy.totalReviews).toBe(4400);
  });

  it('counts competitors within 1km and own stores within 2km', () => {
    const n = node('n', -26.100, 28.050, [poi(500)]);
    const fv = computeFeatures([n], {
      competitors: [{ name: 'C1', lat: -26.103, lng: 28.050 }], // ~330m
      stores: [{ name: 'S1', lat: -26.110, lng: 28.050 }],      // ~1.1km
      demographics: [],
    });
    expect(fv[0].competition.competitorsWithin1km).toBe(1);
    expect(fv[0].competition.nearestCompetitorM).toBeGreaterThan(300);
    expect(fv[0].cannibalisation.ownStoresWithin2km).toBe(1);
  });

  it('detects anchor types (mall/supermarket/transit)', () => {
    const n = node('n', -26.1, 28.05, [poi(100, ['shopping_mall']), poi(50, ['supermarket'])]);
    const fv = computeFeatures([n], { competitors: [], stores: [], demographics: [] });
    expect(fv[0].trafficProxy.anchorTypes).toEqual(expect.arrayContaining(['shopping_mall', 'supermarket']));
  });

  it('uses csv demographics when present and proxy otherwise', () => {
    const n = node('Rosebank', -26.14, 28.04, [poi(100)]);
    const withCsv = computeFeatures([n], { competitors: [], stores: [], demographics: [{ suburb: 'Rosebank', lsm: 9 }] }, 'Rosebank');
    expect(withCsv[0].demographics.source).toBe('csv');
    const noCsv = computeFeatures([n], { competitors: [], stores: [], demographics: [] });
    expect(noCsv[0].demographics.source).toBe('proxy');
  });
});

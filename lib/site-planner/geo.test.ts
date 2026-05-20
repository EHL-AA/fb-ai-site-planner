import { describe, it, expect } from 'vitest';
import { haversineMeters, gridPoints, clusterPoints } from './geo';

describe('haversineMeters', () => {
  it('returns ~0 for the same point', () => {
    expect(haversineMeters(-26.1, 28.05, -26.1, 28.05)).toBeLessThan(1);
  });
  it('computes a known distance (~1.11km per 0.01deg lat)', () => {
    const d = haversineMeters(-26.10, 28.05, -26.11, 28.05);
    expect(d).toBeGreaterThan(1090);
    expect(d).toBeLessThan(1130);
  });
});

describe('gridPoints', () => {
  it('returns an NxN grid of points inside the bounds', () => {
    const pts = gridPoints({ south: -26.2, west: 28.0, north: -26.0, east: 28.2 }, 3);
    expect(pts).toHaveLength(9);
    for (const p of pts) {
      expect(p.lat).toBeGreaterThanOrEqual(-26.2);
      expect(p.lat).toBeLessThanOrEqual(-26.0);
      expect(p.lng).toBeGreaterThanOrEqual(28.0);
      expect(p.lng).toBeLessThanOrEqual(28.2);
    }
  });
});

describe('clusterPoints', () => {
  it('groups nearby points into one cluster and keeps far ones separate', () => {
    const pts = [
      { lat: -26.100, lng: 28.050, weight: 10 },
      { lat: -26.1005, lng: 28.0505, weight: 5 },
      { lat: -26.200, lng: 28.150, weight: 8 },
    ];
    const clusters = clusterPoints(pts, 200); // 200m radius
    expect(clusters).toHaveLength(2);
    const big = clusters.find(c => c.members.length === 2)!;
    expect(big.totalWeight).toBe(15);
  });
});

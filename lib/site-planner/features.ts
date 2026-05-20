import { haversineMeters } from './geo';
import {
  CandidateNode, FeatureVector, CompetitorRecord, StoreRecord, DemographicRecord,
} from './types';

const ANCHOR_TYPES = ['shopping_mall', 'supermarket', 'department_store', 'transit_station', 'bus_station', 'train_station', 'subway_station'];
const TRANSIT_TYPES = ['transit_station', 'bus_station', 'train_station', 'subway_station'];

export interface FeatureInputs {
  competitors: CompetitorRecord[];
  stores: StoreRecord[];
  demographics: DemographicRecord[];
}

/** Map a value through log scaling into 0..100 relative to the max in the set. */
function logScore(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.round((Math.log1p(value) / Math.log1p(max)) * 100);
}

export function computeFeatures(
  nodes: CandidateNode[],
  inputs: FeatureInputs,
  suburb?: string,
): FeatureVector[] {
  const reviewTotals = nodes.map(n =>
    n.places.reduce((s, p) => s + (p.userRatingCount ?? 0), 0),
  );
  const maxReviews = Math.max(1, ...reviewTotals);

  // Affluence proxy: presence of premium anchors + average rating across node POIs.
  const PREMIUM = ['shopping_mall', 'department_store', 'jewelry_store', 'car_dealer'];

  return nodes.map((node, idx) => {
    const totalReviews = reviewTotals[idx];
    const poiCount = node.places.length;
    const anchorTypes = [
      ...new Set(node.places.flatMap(p => p.types.filter(t => ANCHOR_TYPES.includes(t)))),
    ];
    const transitStopsNearby = node.places.filter(p => p.types.some(t => TRANSIT_TYPES.includes(t))).length;

    const trafficScore = Math.min(100, logScore(totalReviews, maxReviews) + Math.min(15, poiCount) + anchorTypes.length * 5);

    const accessibilityScore = Math.min(100, transitStopsNearby * 25 + (anchorTypes.length > 0 ? 20 : 0));

    const competitorDistances = inputs.competitors
      .filter(c => Number.isFinite(c.lat) && Number.isFinite(c.lng))
      .map(c => haversineMeters(node.lat, node.lng, c.lat, c.lng));
    const competitorsWithin1km = competitorDistances.filter(d => d <= 1000).length;
    const nearestCompetitorM = competitorDistances.length ? Math.round(Math.min(...competitorDistances)) : null;

    const storeDistances = inputs.stores
      .filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lng))
      .map(s => haversineMeters(node.lat, node.lng, s.lat, s.lng));
    const ownStoresWithin2km = storeDistances.filter(d => d <= 2000).length;
    const nearestOwnStoreM = storeDistances.length ? Math.round(Math.min(...storeDistances)) : null;

    const csvDemo = suburb
      ? inputs.demographics.find(d => d.suburb.trim().toLowerCase() === suburb.trim().toLowerCase())
      : undefined;

    const avgRating = poiCount ? node.places.reduce((s, p) => s + (p.rating ?? 0), 0) / poiCount : 0;
    const premiumAnchors = node.places.filter(p => p.types.some(t => PREMIUM.includes(t))).length;
    const affluenceProxy0to100 = Math.min(100, Math.round(avgRating * 12 + premiumAnchors * 10));

    return {
      id: node.id,
      label: node.label,
      lat: node.lat,
      lng: node.lng,
      trafficProxy: { poiCount, totalReviews, anchorTypes, score0to100: trafficScore },
      accessibility: { transitStopsNearby, majorRoadAdjacent: anchorTypes.length > 0, score0to100: accessibilityScore },
      competition: { competitorsWithin1km, nearestCompetitorM },
      cannibalisation: { ownStoresWithin2km, nearestOwnStoreM },
      demographics: csvDemo
        ? { source: 'csv', population: csvDemo.population, income: csvDemo.income, lsm: csvDemo.lsm, affluenceProxy0to100 }
        : { source: 'proxy', affluenceProxy0to100 },
    };
  });
}

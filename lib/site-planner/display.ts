import { FeatureVector, RankedResult, RankedSite } from './types';

export interface BrandMeta {
  name: string;
  category: string;
  color: string;
  ink: string;
  glyph: string;
}

/** Famous Brands marques. `name` matches the value stored in the planner store. */
export const BRANDS: BrandMeta[] = [
  { name: 'Steers', category: 'Flame-grilled burgers', color: '#ffb617', ink: '#1a1208', glyph: 'S' },
  { name: 'Debonairs Pizza', category: 'Pizza', color: '#e14a3d', ink: '#fff', glyph: 'D' },
  { name: 'Wimpy', category: 'Diners', color: '#e0211a', ink: '#fff', glyph: 'W' },
  { name: 'Mugg & Bean', category: 'Cafés', color: '#7a5230', ink: '#fff', glyph: 'M' },
  { name: 'Fishaways', category: 'Seafood', color: '#1f8fd6', ink: '#fff', glyph: 'F' },
  { name: 'Milky Lane', category: 'Desserts', color: '#d96aa3', ink: '#fff', glyph: 'ML' },
];

export function brandByName(name: string): BrandMeta {
  return BRANDS.find(b => b.name === name) ?? BRANDS[0];
}

export type Tier = 'A+' | 'A' | 'B' | 'C';

export function tierFor(score: number): Tier {
  if (score >= 90) return 'A+';
  if (score >= 78) return 'A';
  if (score >= 65) return 'B';
  return 'C';
}

/** Tier colour token (CSS var string). */
export function tierColor(tier: Tier): string {
  if (tier === 'A+' || tier === 'A') return 'var(--accent)';
  if (tier === 'B') return '#c9a560';
  return 'var(--ink-3)';
}

export interface DisplaySite {
  id: string;
  code: string;
  rank: number;
  name: string;
  suburb: string;
  address: string;
  lat: number;
  lng: number;
  score: number;
  tier: Tier;
  breakdown: RankedSite['breakdown'];
  rationale: string;
  risks: string;
  // real signals
  totalReviews: number;
  poiCount: number;
  anchorTypes: string[];
  trafficScore: number;
  accessibilityScore: number;
  transitStopsNearby: number;
  competitorsWithin1km: number;
  nearestCompetitorM: number | null;
  ownStoresWithin2km: number;
  nearestOwnStoreM: number | null;
  demographics: FeatureVector['demographics'];
}

/** Join the Pro ranking with the per-node feature signals into display rows,
 *  ordered best-first. Returns [] until a ranking exists. */
export function toDisplaySites(
  features: FeatureVector[],
  result: RankedResult | null,
  suburb: string,
): DisplaySite[] {
  if (!result) return [];
  const featureById = new Map(features.map(f => [f.id, f]));

  return [...result.ranked]
    .sort((a, b) => a.rank - b.rank)
    .map(site => {
      const f = featureById.get(site.id);
      const score = Math.round(site.compositeScore0to100);
      const tier = tierFor(score);
      const codeNum = String(site.rank).padStart(3, '0');
      return {
        id: site.id,
        code: `JHB-${codeNum}`,
        rank: site.rank,
        name: f?.label ?? site.id,
        suburb: suburb || '',
        address: f ? `${f.lat.toFixed(4)}, ${f.lng.toFixed(4)}` : '',
        lat: f?.lat ?? 0,
        lng: f?.lng ?? 0,
        score,
        tier,
        breakdown: site.breakdown,
        rationale: site.rationale,
        risks: site.risks,
        totalReviews: f?.trafficProxy.totalReviews ?? 0,
        poiCount: f?.trafficProxy.poiCount ?? 0,
        anchorTypes: f?.trafficProxy.anchorTypes ?? [],
        trafficScore: f?.trafficProxy.score0to100 ?? 0,
        accessibilityScore: f?.accessibility.score0to100 ?? 0,
        transitStopsNearby: f?.accessibility.transitStopsNearby ?? 0,
        competitorsWithin1km: f?.competition.competitorsWithin1km ?? 0,
        nearestCompetitorM: f?.competition.nearestCompetitorM ?? null,
        ownStoresWithin2km: f?.cannibalisation.ownStoresWithin2km ?? 0,
        nearestOwnStoreM: f?.cannibalisation.nearestOwnStoreM ?? null,
        demographics: f?.demographics ?? { source: 'proxy', affluenceProxy0to100: 0 },
      };
    });
}

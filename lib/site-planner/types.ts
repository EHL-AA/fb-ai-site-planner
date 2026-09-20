import { LatLng, Bounds } from './geo';

export interface CompetitorRecord { name: string; lat: number; lng: number; brand?: string; category?: string; }
export interface StoreRecord { name: string; lat: number; lng: number; storeId?: string; monthlySales?: number; format?: string; }
export interface DemographicRecord { suburb: string; population?: number; income?: number; lsm?: number; households?: number; density?: number; }

export interface RawPlace {
  lat: number; lng: number;
  rating?: number;
  userRatingCount?: number;
  types: string[];
  primaryType?: string;
  displayName?: string;
}

export interface CandidateNode {
  id: string;
  label: string;
  lat: number;
  lng: number;
  places: RawPlace[]; // POIs that formed this node
}

export interface FeatureVector {
  id: string;
  label: string;
  lat: number;
  lng: number;
  trafficProxy: { poiCount: number; totalReviews: number; anchorTypes: string[]; score0to100: number };
  accessibility: { transitStopsNearby: number; majorRoadAdjacent: boolean; score0to100: number };
  competition: { competitorsWithin1km: number; nearestCompetitorM: number | null };
  cannibalisation: { ownStoresWithin2km: number; nearestOwnStoreM: number | null };
  demographics: { source: 'csv' | 'proxy'; population?: number; income?: number; lsm?: number; affluenceProxy0to100: number };
  /** Provenance-tagged signals gathered by lib/site-planner/signals (absent in legacy paths/tests). */
  signals?: import('./signals/types').NodeSignals;
  /** Flattened, de-duplicated source list for UI + prompt. */
  sources?: SourceRow[];
}

export interface RankedSite {
  id: string;
  rank: number;
  compositeScore0to100: number;
  breakdown: { traffic: number; demographics: number; competition: number; accessibility: number };
  rationale: string;
  risks: string;
}

export interface RankedResult {
  overallSummary: string;
  ranked: RankedSite[];
}

export interface ScoringWeights { traffic: number; demographics: number; competition: number; accessibility: number; }
export const DEFAULT_WEIGHTS: ScoringWeights = { traffic: 0.4, demographics: 0.25, competition: 0.2, accessibility: 0.15 };

/** Result of picking a suburb from Places autocomplete. */
export interface SuburbSelection {
  placeId: string;
  suburb: string;
  city: string;
  center: LatLng;
  viewport: Bounds;
}

/** One row of a vendor foot-traffic export. */
export interface FootTrafficRecord { lat: number; lng: number; dailyVisits: number; peakHour?: number; }

/** Flattened provenance row for UI + prompt. */
export interface SourceRow { label: string; provenance: 'measured' | 'proxy' | 'unavailable'; note?: string; }

export type { LatLng };

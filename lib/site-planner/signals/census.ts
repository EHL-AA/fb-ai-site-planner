import { haversineMeters } from '../geo';
import { SignalSource, CensusSignal, measured, unavailable } from './types';

export const CENSUS_LABEL = 'Stats SA Census 2022 (ward level)';
const URL = '/data/census-wards.json';

export interface CensusWard { ward: string; muni: string; lat: number; lng: number; population: number; households: number; areaKm2: number; }

let cache: CensusWard[] | null = null;
export function _resetCensusCache() { cache = null; }

export async function loadCensusWards(fetchImpl: typeof fetch): Promise<CensusWard[]> {
  if (cache) return cache;
  try {
    const res = await fetchImpl(URL);
    if (!res.ok) return (cache = []);
    const json = await res.json();
    cache = Array.isArray(json) ? json.filter(w => Number.isFinite(w?.lat) && Number.isFinite(w?.lng)) : [];
  } catch {
    cache = [];
  }
  return cache;
}

export function nearestWard(wards: CensusWard[], lat: number, lng: number, maxM = 15000): CensusWard | null {
  let best: CensusWard | null = null;
  let bestD = Infinity;
  for (const w of wards) {
    const d = haversineMeters(lat, lng, w.lat, w.lng);
    if (d < bestD) { bestD = d; best = w; }
  }
  return bestD <= maxM ? best : null;
}

export const censusSource: SignalSource<'census'> = {
  id: 'census',
  label: CENSUS_LABEL,
  async enrich(nodes, ctx) {
    const wards = await loadCensusWards(ctx.fetchImpl);
    if (!wards.length) {
      return nodes.map(() => unavailable<CensusSignal>(CENSUS_LABEL, 'No census data bundled (public/data/census-wards.json is empty). See README → Census data.'));
    }
    return nodes.map(node => {
      const w = nearestWard(wards, node.lat, node.lng);
      if (!w) return unavailable<CensusSignal>(CENSUS_LABEL, 'No ward centroid within 15 km.');
      const densityPerKm2 = w.areaKm2 > 0 ? Math.round(w.population / w.areaKm2) : 0;
      return measured(
        { ward: w.ward, population: w.population, households: w.households, densityPerKm2 },
        CENSUS_LABEL,
        'Nearest ward centroid; Census 2022 income was not released by Stats SA.',
      );
    });
  },
};

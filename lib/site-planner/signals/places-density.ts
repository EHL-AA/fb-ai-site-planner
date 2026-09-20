import { LatLng } from '../geo';
import { CandidateNode } from '../types';
import { SignalSource, SignalContext, Signal, DensitySignal, measured, unavailable, logScore } from './types';

export const DENSITY_SOURCE_LABEL = 'Google Places Aggregate API (1 km counts)';
const ENDPOINT = 'https://areainsights.googleapis.com/v1:computeInsights';
export const DENSITY_TYPES = ['corporate_office', 'school', 'university', 'gym', 'supermarket', 'bar', 'restaurant', 'cafe'] as const;
export const DAYTIME_TYPES = ['corporate_office', 'school', 'university'];
export const EVENING_TYPES = ['bar', 'restaurant', 'cafe'];
const RADIUS_M = 1000;

/** Returns a count, `null` on a non-fatal failure, or `'disabled'` when the API is not enabled on the project. */
export async function countPlaces(ctx: SignalContext, center: LatLng, type: string, radiusM = RADIUS_M): Promise<number | null | 'disabled'> {
  if (!ctx.budget.take('aggregate')) return null;
  const res = await ctx.fetchImpl(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': ctx.mapsApiKey },
    body: JSON.stringify({
      insights: ['INSIGHT_COUNT'],
      filter: {
        locationFilter: { circle: { latLng: { latitude: center.lat, longitude: center.lng }, radius: radiusM } },
        typeFilter: { includedTypes: [type] },
      },
    }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason = json?.error?.details?.find((d: any) => d?.reason)?.reason;
    if (reason === 'SERVICE_DISABLED' || res.status === 401 || res.status === 403) return 'disabled';
    return null;
  }
  const n = Number(json?.count ?? 0);
  return Number.isFinite(n) ? n : null;
}

const sum = (c: Record<string, number>, keys: string[]) => keys.reduce((s, k) => s + (c[k] ?? 0), 0);

export function densityIndices(countsPerNode: Record<string, number>[]): Array<{ daytimeIndex0to100: number; eveningIndex0to100: number }> {
  const day = countsPerNode.map(c => sum(c, DAYTIME_TYPES));
  const eve = countsPerNode.map(c => sum(c, EVENING_TYPES));
  const maxDay = Math.max(0, ...day);
  const maxEve = Math.max(0, ...eve);
  return countsPerNode.map((_, i) => ({
    daytimeIndex0to100: logScore(day[i], maxDay),
    eveningIndex0to100: logScore(eve[i], maxEve),
  }));
}

export const placesDensitySource: SignalSource<'density'> = {
  id: 'density',
  label: DENSITY_SOURCE_LABEL,
  async enrich(nodes: CandidateNode[], ctx: SignalContext): Promise<Signal<DensitySignal | null>[]> {
    if (nodes.length === 0) return [];

    // Probe with first node and first type to detect API disabled before fan-out
    let probeResult: number | null | 'disabled' = null;
    try {
      probeResult = await countPlaces(ctx, { lat: nodes[0].lat, lng: nodes[0].lng }, DENSITY_TYPES[0]);
    } catch (e) {
      console.warn('probe call failed', e);
    }
    if (probeResult === 'disabled') {
      const note = 'Enable Places Aggregate API on the Maps project and allow it on the API key (Cloud console → APIs & Services) to collect density counts.';
      return nodes.map(() => unavailable<DensitySignal>(DENSITY_SOURCE_LABEL, note));
    }

    let disabled = false;
    const counts: Array<Record<string, number> | null> = await Promise.all(nodes.map(async (node, nodeIdx) => {
      const c: Record<string, number> = {};
      let any = false;

      // Reuse probe result for first node, first type
      if (nodeIdx === 0 && probeResult !== null) {
        c[DENSITY_TYPES[0]] = probeResult;
        any = true;
      }

      await Promise.all(DENSITY_TYPES.map(async (t, typeIdx) => {
        // Skip first type of first node only when the probe already filled it in
        if (nodeIdx === 0 && typeIdx === 0 && probeResult !== null) return;

        try {
          const n = await countPlaces(ctx, { lat: node.lat, lng: node.lng }, t);
          if (n === 'disabled') { disabled = true; return; }
          if (n != null) { c[t] = n; any = true; }
        } catch (e) { console.warn('countPlaces failed', t, e); }
      }));
      return any ? c : null;
    }));

    if (disabled || counts.every(c => c === null)) {
      const note = disabled
        ? 'Enable Places Aggregate API on the Maps project and allow it on the API key (Cloud console → APIs & Services) to collect density counts.'
        : 'Places Aggregate API returned no counts.';
      return nodes.map(() => unavailable<DensitySignal>(DENSITY_SOURCE_LABEL, note));
    }
    const filled = counts.map(c => c ?? {});
    const idx = densityIndices(filled);
    return filled.map((c, i) => counts[i]
      ? measured({ ...idx[i], counts: c }, DENSITY_SOURCE_LABEL, 'Counts of offices/schools (daytime) and bars/restaurants/cafés (evening) within 1 km.')
      : unavailable<DensitySignal>(DENSITY_SOURCE_LABEL, 'No counts for this node.'));
  },
};

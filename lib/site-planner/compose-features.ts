import { computeFeatures, FeatureInputs } from './features';
import { CandidateNode, FeatureVector, SourceRow } from './types';
import { NodeSignals, clamp100, logScore } from './signals/types';

const TRAFFIC_W = { footTraffic: 0.4, congestion: 0.2, density: 0.2, review: 0.2 };
const DEMO_W = { affluence: 0.6, census: 0.4 };

function weightedMean(parts: Array<[value: number, weight: number] | null>): number | null {
  const live = parts.filter((p): p is [number, number] => !!p);
  const w = live.reduce((s, [, x]) => s + x, 0);
  if (w === 0) return null;
  return clamp100(live.reduce((s, [v, x]) => s + v * x, 0) / w);
}

export function blendTraffic(reviewScore: number, s: NodeSignals, footMax: number): number {
  const foot = s.footTraffic.value ? logScore(s.footTraffic.value.dailyVisits, footMax) : null;
  const cong = s.congestion.value ? s.congestion.value.index0to100 : null;
  const dens = s.density.value ? (s.density.value.daytimeIndex0to100 + s.density.value.eveningIndex0to100) / 2 : null;
  return weightedMean([
    foot != null ? [foot, TRAFFIC_W.footTraffic] : null,
    cong != null ? [cong, TRAFFIC_W.congestion] : null,
    dens != null ? [dens, TRAFFIC_W.density] : null,
    [reviewScore, TRAFFIC_W.review],
  ]) ?? reviewScore;
}

export function blendDemographics(base: FeatureVector['demographics'], s: NodeSignals, densityMax: number): number {
  // Uploaded LSM (1-10) or income override the retail-mix affluence proxy.
  const lsmScore = base.lsm != null ? clamp100(base.lsm * 10) : null;
  const affl = lsmScore ?? (s.affluence.value ? s.affluence.value.index0to100 : null);
  const dens = s.census.value ? logScore(s.census.value.densityPerKm2, densityMax) : null;
  return weightedMean([
    affl != null ? [affl, DEMO_W.affluence] : null,
    dens != null ? [dens, DEMO_W.census] : null,
  ]) ?? base.affluenceProxy0to100;
}

export function accessibilityBonus(driveMinutes: number | null): number {
  if (driveMinutes == null) return 0;
  if (driveMinutes <= 5) return 20;
  if (driveMinutes >= 15) return 0;
  return Math.round(20 * (15 - driveMinutes) / 10);
}

const REVIEW_DENSITY_ROW: SourceRow = {
  label: 'Google Places review density',
  provenance: 'proxy',
  note: 'Review-count density of nearby businesses from the Places sweep; always present.',
};

export function flattenSources(s: NodeSignals): SourceRow[] {
  return [
    REVIEW_DENSITY_ROW,
    ...(['congestion', 'density', 'affluence', 'census', 'footTraffic'] as const).map(k => ({
      label: s[k].source, provenance: s[k].provenance, note: s[k].note,
    })),
  ];
}

/** computeFeatures + provenance-tagged signals → blended scores. */
export function composeFeatures(nodes: CandidateNode[], signals: NodeSignals[], inputs: FeatureInputs, suburb?: string): FeatureVector[] {
  const base = computeFeatures(nodes, inputs, suburb);
  const footMax = Math.max(0, ...signals.map(s => s.footTraffic.value?.dailyVisits ?? 0));
  const densityMax = Math.max(0, ...signals.map(s => s.census.value?.densityPerKm2 ?? 0));
  return base.map((f, i) => {
    const s = signals[i];
    const drive = s.congestion.value?.driveMinutesFromCentre ?? null;
    return {
      ...f,
      trafficProxy: { ...f.trafficProxy, score0to100: blendTraffic(f.trafficProxy.score0to100, s, footMax) },
      accessibility: { ...f.accessibility, score0to100: clamp100(f.accessibility.score0to100 + accessibilityBonus(drive)) },
      demographics: { ...f.demographics, affluenceProxy0to100: blendDemographics(f.demographics, s, densityMax) },
      signals: s,
      sources: flattenSources(s),
    };
  });
}

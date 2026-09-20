import { CandidateNode, SuburbSelection, RawPlace } from '../types';
import { PlaceRec } from '../places-data';

export type Provenance = 'measured' | 'proxy' | 'unavailable';

export interface Signal<T> {
  value: T;
  provenance: Provenance;
  /** Human label, e.g. "Google Routes API (live traffic)". */
  source: string;
  /** Short caveat shown in the UI and the prompt. */
  note?: string;
}

export function measured<T>(value: T, source: string, note?: string): Signal<T> {
  return { value, provenance: 'measured', source, note };
}
export function proxy<T>(value: T, source: string, note?: string): Signal<T> {
  return { value, provenance: 'proxy', source, note };
}
export function unavailable<T>(source: string, note: string): Signal<T | null> {
  return { value: null, provenance: 'unavailable', source, note };
}

/** Counts external API calls for one analysis run and caps them. */
export class CallBudget {
  private counts: Record<string, number> = {};
  private total = 0;
  constructor(readonly max = 300) {}
  /** Reserve one call. Returns false (and does not count) when the budget is spent. */
  take(api: string): boolean {
    if (this.total >= this.max) return false;
    this.total++;
    this.counts[api] = (this.counts[api] ?? 0) + 1;
    return true;
  }
  get used(): number { return this.total; }
  get byApi(): Readonly<Record<string, number>> { return { ...this.counts }; }
}

export interface SignalContext {
  selection: SuburbSelection;
  mapsApiKey: string;
  fetchImpl: typeof fetch;
  budget: CallBudget;
  now: Date;
  /** Bundled retail anchors (public/data/retail.json). */
  retail: PlaceRec[];
  /** Every POI the suburb sweep returned; suburb-wide fallback for sparse per-node samples. */
  swept: RawPlace[];
}

/** Live-vs-free-flow congestion at three weekday departure slots (SAST). `index0to100` is the busiest slot. */
export interface CongestionSignal {
  index0to100: number;
  slots: { morning: number | null; midday: number | null; evening: number | null };
  driveMinutesFromCentre: number | null;
}
export interface DensitySignal { daytimeIndex0to100: number; eveningIndex0to100: number; counts: Record<string, number>; }
export interface AffluenceSignal { index0to100: number; premiumAnchors: number; valueAnchors: number; }
export interface CensusSignal { ward: string; population: number; households: number; densityPerKm2: number; }
export interface TradeHoursSignal { openLate0to100: number; openSunday0to100: number; sample: number; }
export interface PriceLevelSignal { meanLevel: number; index0to100: number; sample: number; }

export interface NodeSignals {
  congestion: Signal<CongestionSignal | null>;
  density: Signal<DensitySignal | null>;
  affluence: Signal<AffluenceSignal | null>;
  census: Signal<CensusSignal | null>;
  tradeHours: Signal<TradeHoursSignal | null>;
  priceLevel: Signal<PriceLevelSignal | null>;
}

export interface SignalSource<K extends keyof NodeSignals> {
  id: K;
  label: string;
  /** One signal per node, same order. MUST NOT reject — return `unavailable` instead. */
  enrich(nodes: CandidateNode[], ctx: SignalContext): Promise<NodeSignals[K][]>;
}

/** Clamp to [0, 100] and round. */
export function clamp100(n: number): number {
  return Math.round(Math.max(0, Math.min(100, n)));
}

/** log1p-scale `value` against `max` into 0..100 (0 when max <= 0). */
export function logScore(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  return clamp100((Math.log1p(value) / Math.log1p(max)) * 100);
}

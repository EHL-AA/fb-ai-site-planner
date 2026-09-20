import { CandidateNode } from '../types';
import { NodeSignals, SignalContext, SignalSource, unavailable } from './types';
import { routesTrafficSource } from './routes-traffic';
import { placesDensitySource } from './places-density';
import { retailMixSource } from './retail-mix';
import { censusSource } from './census';
import { footTrafficSource } from './foot-traffic';

export { CallBudget } from './types';
export type { NodeSignals, SignalContext, SignalSource } from './types';

export const ALL_SOURCES: SignalSource<keyof NodeSignals>[] = [
  routesTrafficSource, placesDensitySource, retailMixSource, censusSource, footTrafficSource,
];

const KEYS: (keyof NodeSignals)[] = ['congestion', 'density', 'affluence', 'census', 'footTraffic'];

/** Run every source; a rejected or missing source becomes `unavailable` for all nodes. */
export async function gatherSignals(
  nodes: CandidateNode[],
  ctx: SignalContext,
  sources: SignalSource<keyof NodeSignals>[] = ALL_SOURCES,
): Promise<NodeSignals[]> {
  const perKey = new Map<keyof NodeSignals, unknown[]>();
  const settled = await Promise.allSettled(sources.map(s => Promise.resolve().then(() => s.enrich(nodes, ctx))));
  settled.forEach((r, i) => {
    const src = sources[i];
    if (r.status === 'fulfilled' && r.value.length === nodes.length) perKey.set(src.id, r.value);
    else {
      console.warn(`signal source ${src.id} failed`, r.status === 'rejected' ? r.reason : 'length mismatch');
      perKey.set(src.id, nodes.map(() => unavailable(src.label, 'Source failed.')));
    }
  });
  return nodes.map((_, i) => {
    const out = {} as NodeSignals;
    for (const k of KEYS) {
      const arr = perKey.get(k);
      (out as any)[k] = arr ? arr[i] : unavailable(k, 'Source not run.');
    }
    return out;
  });
}

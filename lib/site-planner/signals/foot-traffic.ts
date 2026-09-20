import { haversineMeters } from '../geo';
import { CandidateNode } from '../types';
import { SignalSource, SignalContext, FootTrafficSignal, measured, unavailable } from './types';

export interface FootTrafficProvider {
  id: string;
  label: string;
  lookup(nodes: CandidateNode[], ctx: SignalContext): Promise<Array<FootTrafficSignal | null>>;
}

export const nullFootTrafficProvider: FootTrafficProvider = {
  id: 'none',
  label: 'Foot traffic (no feed connected)',
  async lookup(nodes) { return nodes.map(() => null); },
};

const MATCH_M = 300;

export const csvFootTrafficProvider: FootTrafficProvider = {
  id: 'csv',
  label: 'Foot traffic (uploaded vendor export)',
  async lookup(nodes, ctx) {
    return nodes.map(node => {
      let best: FootTrafficSignal | null = null;
      let bestD = MATCH_M;
      for (const r of ctx.footTrafficRows) {
        const d = haversineMeters(node.lat, node.lng, r.lat, r.lng);
        if (d <= bestD) { bestD = d; best = { dailyVisits: r.dailyVisits, peakHour: r.peakHour }; }
      }
      return best;
    });
  },
};

export function footTrafficSourceFor(provider: FootTrafficProvider): SignalSource<'footTraffic'> {
  return {
    id: 'footTraffic',
    label: provider.label,
    async enrich(nodes, ctx) {
      try {
        const vals = await provider.lookup(nodes, ctx);
        return vals.map(v => v
          ? measured(v, provider.label, 'Device-based daily visits from the connected feed.')
          : unavailable<FootTrafficSignal>(provider.label, provider.id === 'none' ? 'No foot-traffic feed connected. Upload a vendor export or connect a provider.' : 'No feed point within 300 m of this site.'));
      } catch (e) {
        console.warn('foot traffic provider failed', e);
        return nodes.map(() => unavailable<FootTrafficSignal>(provider.label, 'Foot-traffic lookup failed.'));
      }
    },
  };
}

/** Picks the CSV provider when rows were uploaded, otherwise the null provider. */
export const footTrafficSource: SignalSource<'footTraffic'> = {
  id: 'footTraffic',
  label: 'Foot traffic',
  enrich(nodes, ctx) {
    const provider = ctx.footTrafficRows.length ? csvFootTrafficProvider : nullFootTrafficProvider;
    return footTrafficSourceFor(provider).enrich(nodes, ctx);
  },
};

import { haversineMeters } from '../geo';
import { SignalSource, AffluenceSignal, proxy, unavailable } from './types';

export const RETAIL_MIX_LABEL = 'Retail anchor mix (bundled FB dataset)';
const PREMIUM = ['woolworths', 'checkers'];
const VALUE = ['boxer', 'usave', 'shoprite'];
const RADIUS_M = 2000;

export function classifyAnchor(brand: string): 'premium' | 'value' | null {
  const b = brand.trim().toLowerCase();
  if (PREMIUM.some(p => b.startsWith(p))) return 'premium';
  if (VALUE.some(v => b.startsWith(v))) return 'value';
  return null;
}

export const retailMixSource: SignalSource<'affluence'> = {
  id: 'affluence',
  label: RETAIL_MIX_LABEL,
  async enrich(nodes, ctx) {
    return nodes.map(node => {
      let premium = 0, value = 0;
      for (const r of ctx.retail) {
        const cls = classifyAnchor(r.b);
        if (!cls) continue;
        if (haversineMeters(node.lat, node.lng, r.lat, r.lng) > RADIUS_M) continue;
        if (cls === 'premium') premium++; else value++;
      }
      const total = premium + value;
      if (total < 2) return unavailable<AffluenceSignal>(RETAIL_MIX_LABEL, 'Fewer than 2 classifiable grocery anchors within 2 km.');
      return proxy(
        { index0to100: Math.round((premium / total) * 100), premiumAnchors: premium, valueAnchors: value },
        RETAIL_MIX_LABEL,
        'Share of Woolworths/Checkers vs Boxer/Usave/Shoprite within 2 km — a South African income proxy, not census income.',
      );
    });
  },
};

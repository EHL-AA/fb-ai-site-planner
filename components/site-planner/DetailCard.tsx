import React, { useMemo } from 'react';
import Icon from './Icon';
import { usePlannerStore } from '@/lib/site-planner/data-store';
import { tierColor, toDisplaySites } from '@/lib/site-planner/display';

function Stat({ label, value, sub, tone = 'default' }: { label: string; value: string; sub?: string; tone?: 'default' | 'good' | 'warn' | 'bad' }) {
  const color = { default: 'var(--ink)', good: 'var(--good)', warn: 'var(--warn)', bad: 'var(--bad)' }[tone];
  return (
    <div style={{ padding: '12px 14px', borderRight: '1px solid var(--line)', flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 10, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: 0.7 }}>{label}</div>
      <div className="mono" style={{ fontSize: 18, fontWeight: 600, color, marginTop: 4, lineHeight: 1.1, letterSpacing: -0.4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

const METRICS = [
  { key: 'traffic', label: 'Traffic & footfall' },
  { key: 'demographics', label: 'Demographic fit' },
  { key: 'competition', label: 'Competitive position' },
  { key: 'accessibility', label: 'Visibility & access' },
] as const;

export default function DetailCard() {
  const { selectedSiteId, features, result, suburb, brand } = usePlannerStore();
  const site = useMemo(() => {
    const all = toDisplaySites(features, result, suburb);
    return all.find(s => s.id === selectedSiteId) ?? null;
  }, [features, result, suburb, selectedSiteId]);

  if (!site) return null;
  const color = tierColor(site.tier);
  const cannibalTone = site.ownStoresWithin2km >= 2 ? 'bad' : site.ownStoresWithin2km === 1 ? 'warn' : 'good';
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${site.lat},${site.lng}`;
  const demandValue = site.demographics.lsm != null ? `LSM ${site.demographics.lsm}`
    : site.demographics.income != null ? `R${Math.round(site.demographics.income / 1000)}k`
    : `${site.demographics.affluenceProxy0to100}/100`;

  return (
    <div style={{
      position: 'absolute', left: 16, right: 16, bottom: 16, zIndex: 40,
      background: 'rgba(20,18,16,0.94)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
      border: '1px solid var(--line-2)', borderRadius: 16, boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
      animation: 'slideUp .26s cubic-bezier(.2,.8,.2,1)', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid var(--line)' }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: color, color: 'var(--accent-ink)', display: 'grid', placeItems: 'center', fontFamily: 'Geist Mono', fontSize: 22, fontWeight: 700, letterSpacing: -1, flexShrink: 0 }}>{site.score}</div>
        <div style={{ marginLeft: 14, flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 17, fontWeight: 600 }}>{site.name}</span>
            <span className="mono" style={{ fontSize: 11, fontWeight: 700, color, border: `1px solid ${color}`, borderRadius: 4, padding: '1px 5px' }}>{site.tier}</span>
            <span style={{ fontSize: 11, color: 'var(--ink-2)', background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: 4, padding: '1px 6px' }}>Rank {site.rank}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 3 }}>
            <span className="mono">{site.code}</span> · {brand} · <span className="mono">{site.address}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <a href={mapsUrl} target="_blank" rel="noreferrer" style={{ height: 32, padding: '0 14px', background: 'linear-gradient(135deg, var(--accent), var(--accent-2))', color: 'var(--accent-ink)', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            Open in Maps <Icon name="chevron" size={12} />
          </a>
          <button onClick={() => usePlannerStore.getState().selectSite(null)} style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--ink-2)', cursor: 'pointer', height: 32, width: 32, display: 'grid', placeItems: 'center' }} aria-label="Close"><Icon name="close" size={14} /></button>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
        <Stat label="Foot proxy" value={`${(site.totalReviews / 1000).toFixed(1)}k`} sub="rated POIs nearby" />
        <Stat label="Commercial density" value={`${site.poiCount}`} sub="businesses clustered" />
        <Stat label="Demand" value={demandValue} sub={site.demographics.source === 'csv' ? 'from your CSV' : 'maps proxy'} />
        <Stat label="Competitors" value={`${site.competitorsWithin1km}`} sub={site.nearestCompetitorM != null ? `nearest ${site.nearestCompetitorM}m` : 'within 1km'} />
        <Stat label="Cannibalisation" value={`${site.ownStoresWithin2km}`} sub={site.nearestOwnStoreM != null ? `nearest ${site.nearestOwnStoreM}m` : 'own stores <2km'} tone={cannibalTone} />
        <Stat label="Transit" value={`${site.transitStopsNearby}`} sub="stops nearby" />
      </div>

      {/* Lower: planner take + score breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px' }}>
        <div style={{ padding: '14px 18px', borderRight: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ width: 18, height: 18, borderRadius: 18, background: 'linear-gradient(135deg, var(--accent), var(--accent-2))', display: 'grid', placeItems: 'center', color: 'var(--accent-ink)' }}><Icon name="sparkle" size={10} stroke={2.4} /></span>
            <span style={{ fontSize: 11, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: 1 }}>Planner take</span>
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--ink-2)' }}>{site.rationale}</div>
          {site.risks && (
            <div style={{ marginTop: 12, fontSize: 12.5, lineHeight: 1.5, color: 'var(--bad)', display: 'flex', gap: 8, background: 'rgba(239,106,94,0.08)', borderLeft: '2px solid var(--bad)', borderRadius: '0 8px 8px 0', padding: '9px 12px' }}>
              <Icon name="warning" size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{site.risks}</span>
            </div>
          )}
        </div>
        <div style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Score breakdown</div>
          {METRICS.map(m => {
            const v = Math.round(site.breakdown[m.key]);
            return (
              <div key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--ink-2)', flex: 1 }}>{m.label}</span>
                <div style={{ width: 110, height: 4, background: 'var(--bg-3)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${v}%`, height: '100%', background: color, borderRadius: 4 }} />
                </div>
                <span className="mono" style={{ fontSize: 11, color: 'var(--ink)', minWidth: 24, textAlign: 'right' }}>{v}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

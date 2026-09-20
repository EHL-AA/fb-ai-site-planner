import React, { useMemo } from 'react';
import Icon from './Icon';
import { usePlannerStore } from '@/lib/site-planner/data-store';
import { tierColor, toDisplaySites } from '@/lib/site-planner/display';

type Tone = 'default' | 'good' | 'warn' | 'bad' | 'muted';
const TONE: Record<Tone, string> = {
  default: 'var(--ink)', good: 'var(--good)', warn: 'var(--warn)', bad: 'var(--bad)', muted: 'var(--ink-4)',
};

function Stat({ label, value, sub, tone = 'default' }: { label: string; value: string; sub?: string; tone?: Tone }) {
  return (
    <div className="dc-stat">
      <div className="dc-stat-label">{label}</div>
      <div className="mono dc-stat-value" style={{ color: TONE[tone] }}>{value}</div>
      {sub && <div className="dc-stat-sub">{sub}</div>}
    </div>
  );
}

function ProvBadge({ p }: { p: 'measured' | 'proxy' | 'unavailable' }) {
  const c = p === 'measured' ? 'var(--good)' : p === 'proxy' ? 'var(--warn)' : 'var(--ink-4)';
  return <span className="mono dc-badge" style={{ color: c, borderColor: c }}>{p}</span>;
}

const METRICS = [
  { key: 'traffic', label: 'Traffic & footfall' },
  { key: 'demographics', label: 'Demographic fit' },
  { key: 'competition', label: 'Competitive position' },
  { key: 'accessibility', label: 'Visibility & access' },
] as const;

const fmtK = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`);

export default function DetailCard() {
  const { selectedSiteId, features, result, suburb, city, brand } = usePlannerStore();
  const site = useMemo(() => {
    const all = toDisplaySites(features, result, suburb, city);
    return all.find(s => s.id === selectedSiteId) ?? null;
  }, [features, result, suburb, city, selectedSiteId]);

  if (!site) return null;
  const color = tierColor(site.tier);
  const cannibalTone: Tone = site.ownStoresWithin2km >= 2 ? 'bad' : site.ownStoresWithin2km === 1 ? 'warn' : 'good';
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${site.lat},${site.lng}`;
  const demandValue = site.demographics.lsm != null ? `LSM ${site.demographics.lsm}`
    : site.demographics.income != null ? `R${Math.round(site.demographics.income / 1000)}k`
    : `${site.demographics.affluenceProxy0to100}`;
  const sig = site.signals;

  return (
    <div className="dc-card">
      {/* Header */}
      <div className="dc-header">
        <div className="mono dc-score" style={{ background: color }}>{site.score}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="dc-title-row">
            <span className="dc-title">{site.name}</span>
            <span className="mono dc-tier" style={{ color, borderColor: color }}>{site.tier}</span>
            <span className="dc-rank">Rank {site.rank}</span>
          </div>
          <div className="dc-subtitle">
            <span className="mono">{site.code}</span> · {brand} · <span className="mono">{site.address}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <a href={mapsUrl} target="_blank" rel="noreferrer" className="dc-open">
            Open in Maps <Icon name="chevron" size={12} />
          </a>
          <button onClick={() => usePlannerStore.getState().selectSite(null)} className="dc-close" aria-label="Close"><Icon name="close" size={14} /></button>
        </div>
      </div>

      <div className="dc-body">
        {/* Signals grid */}
        <div className="dc-stats">
          <Stat label="Foot proxy" value={fmtK(site.totalReviews)} sub={`reviews · ${site.poiCount} POIs`} />
          <Stat
            label="Foot traffic"
            value={sig?.footTraffic.value ? `${fmtK(sig.footTraffic.value.dailyVisits)}/day` : 'n/a'}
            sub={sig?.footTraffic.value ? 'vendor feed' : 'no feed connected'}
            tone={sig?.footTraffic.value ? 'default' : 'muted'} />
          <Stat
            label="Congestion"
            value={sig?.congestion.value ? `${sig.congestion.value.index0to100}` : 'n/a'}
            sub={sig?.congestion.value?.driveMinutesFromCentre != null ? `${sig.congestion.value.driveMinutesFromCentre} min from centre` : 'weekday 17:30'}
            tone={sig?.congestion.value ? 'default' : 'muted'} />
          <Stat
            label="Day / evening"
            value={sig?.density.value ? `${sig.density.value.daytimeIndex0to100} / ${sig.density.value.eveningIndex0to100}` : 'n/a'}
            sub="density within 1 km"
            tone={sig?.density.value ? 'default' : 'muted'} />
          <Stat label="Demand" value={demandValue} sub={site.demographics.source === 'csv' ? 'from your CSV' : 'blended proxy'} />
          <Stat
            label="Affluence"
            value={sig?.affluence.value ? `${sig.affluence.value.index0to100}` : 'n/a'}
            sub={sig?.affluence.value ? `${sig.affluence.value.premiumAnchors} premium · ${sig.affluence.value.valueAnchors} value` : 'retail mix'}
            tone={sig?.affluence.value ? 'default' : 'muted'} />
          <Stat
            label="Ward pop."
            value={sig?.census.value ? fmtK(sig.census.value.population) : 'n/a'}
            sub={sig?.census.value ? `${sig.census.value.densityPerKm2}/km²` : 'census not loaded'}
            tone={sig?.census.value ? 'default' : 'muted'} />
          <Stat label="Competitors" value={`${site.competitorsWithin1km}`} sub={site.nearestCompetitorM != null ? `nearest ${site.nearestCompetitorM} m` : 'within 1 km'} />
          <Stat label="Cannibalisation" value={`${site.ownStoresWithin2km}`} sub={site.nearestOwnStoreM != null ? `nearest ${site.nearestOwnStoreM} m` : 'own stores within 2 km'} tone={cannibalTone} />
          <Stat label="Transit" value={`${site.transitStopsNearby}`} sub="stops nearby" />
        </div>

        {/* Planner take + right rail */}
        <div className="dc-lower">
          <div className="dc-take">
            <div className="dc-section-head">
              <span className="dc-spark"><Icon name="sparkle" size={10} stroke={2.4} /></span>
              <span className="dc-section-title">Planner take</span>
            </div>
            <p className="dc-rationale">{site.rationale}</p>
            {site.risks && (
              <div className="dc-risk">
                <Icon name="warning" size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{site.risks}</span>
              </div>
            )}
          </div>

          <div className="dc-rail">
            <div>
              <div className="dc-section-title">Score breakdown</div>
              {METRICS.map(m => {
                const v = Math.round(site.breakdown[m.key]);
                return (
                  <div key={m.key} className="dc-bar-row">
                    <span className="dc-bar-label">{m.label}</span>
                    <div className="dc-bar"><div style={{ width: `${v}%`, background: color }} /></div>
                    <span className="mono dc-bar-value">{v}</span>
                  </div>
                );
              })}
            </div>

            <div>
              <div className="dc-section-title">Data sources</div>
              {site.sources.map(s => (
                <div key={s.label} className="dc-source" title={s.provenance !== 'unavailable' ? s.note : undefined}>
                  <div className="dc-source-row">
                    <ProvBadge p={s.provenance} />
                    <span className="dc-source-label" style={{ color: s.provenance === 'unavailable' ? 'var(--ink-3)' : 'var(--ink-2)' }}>{s.label}</span>
                  </div>
                  {s.provenance === 'unavailable' && s.note && <div className="dc-source-note">{s.note}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

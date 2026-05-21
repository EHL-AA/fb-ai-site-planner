import React, { useMemo, useState } from 'react';
import Icon from './Icon';
import { usePlanner } from '@/contexts/PlannerContext';
import { usePlannerStore } from '@/lib/site-planner/data-store';
import { useMapStore, useUI } from '@/lib/state';
import { BRANDS, brandByName, tierColor, toDisplaySites, DisplaySite } from '@/lib/site-planner/display';

const iconBtn: React.CSSProperties = {
  background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 8, padding: 6,
  color: 'var(--ink-2)', cursor: 'pointer', display: 'inline-grid', placeItems: 'center', height: 28,
};

function BrandChip({ name, selected, onClick }: { name: string; selected: boolean; onClick: () => void }) {
  const b = brandByName(name);
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 11px 6px 6px', borderRadius: 999,
      background: selected ? 'var(--bg-3)' : 'transparent',
      border: `1px solid ${selected ? 'var(--line-2)' : 'var(--line)'}`,
      color: 'var(--ink)', cursor: 'pointer', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap',
    }}>
      <span style={{
        width: 22, height: 22, borderRadius: 22, background: b.color, color: b.ink,
        display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700,
      }}>{b.glyph}</span>
      {b.name}
    </button>
  );
}

function SiteCard({ site, selected, onClick }: { site: DisplaySite; selected: boolean; onClick: () => void }) {
  const color = tierColor(site.tier);
  const demoVal = site.demographics.lsm != null ? `LSM ${site.demographics.lsm}` : `${site.demographics.affluenceProxy0to100}`;
  return (
    <button onClick={onClick} style={{
      textAlign: 'left', width: '100%', background: selected ? 'var(--bg-2)' : 'var(--bg-1)',
      border: `1px solid ${selected ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 12, padding: 14,
      cursor: 'pointer', color: 'var(--ink)', display: 'block',
      boxShadow: selected ? '0 0 0 3px rgba(245,165,36,0.10)' : 'none',
      transition: 'border-color .15s ease, background .15s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', letterSpacing: 0.5 }}>{site.code}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--ink-2)', fontSize: 11 }}>
          <span style={{ width: 6, height: 6, borderRadius: 6, background: site.rank === 1 ? 'var(--accent)' : 'var(--ink-3)' }} />
          Rank {site.rank}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10, background: color, color: 'var(--accent-ink)',
          display: 'grid', placeItems: 'center', fontFamily: 'Geist Mono', fontSize: 16, fontWeight: 700, flexShrink: 0,
        }}>{site.score}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{site.name}</div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }} className="mono">{site.address}</div>
        </div>
        <div className="mono" style={{ fontSize: 11, fontWeight: 700, color, border: `1px solid ${color}`, borderRadius: 4, padding: '1px 5px' }}>{site.tier}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 12 }}>
        {[
          { l: 'Foot proxy', v: `${(site.totalReviews / 1000).toFixed(1)}k`, s: 'reviews' },
          { l: 'Competitors', v: `${site.competitorsWithin1km}`, s: '<1km' },
          { l: 'Demand', v: demoVal, s: site.demographics.source === 'csv' ? 'csv' : 'proxy' },
        ].map(m => (
          <div key={m.l}>
            <div style={{ fontSize: 10, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{m.l}</div>
            <div className="mono" style={{ fontSize: 13, marginTop: 2 }}>{m.v}<span style={{ color: 'var(--ink-3)', fontSize: 10 }}> {m.s}</span></div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10, height: 4, borderRadius: 4, background: 'var(--bg-3)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${site.score}%`, background: color, borderRadius: 4 }} />
      </div>
    </button>
  );
}

export default function SitesSidebar() {
  const { runAnalysis } = usePlanner();
  const { brand, setBrand, suburb: storeSuburb, features, result, status, selectedSiteId, selectSite } = usePlannerStore();
  const { toggleSidebar } = useUI();

  const [city, setCity] = useState('Johannesburg');
  const [suburb, setSuburb] = useState('');
  const [filters, setFilters] = useState({ aplus: false, lowCannibal: false, lowComp: false });
  const busy = status === 'detecting' || status === 'reasoning';

  const sites = useMemo(() => toDisplaySites(features, result, storeSuburb), [features, result, storeSuburb]);
  const filtered = useMemo(() => sites.filter(s => {
    if (filters.aplus && s.tier !== 'A+') return false;
    if (filters.lowCannibal && s.ownStoresWithin2km > 0) return false;
    if (filters.lowComp && s.competitorsWithin1km > 3) return false;
    return true;
  }), [sites, filters]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!suburb.trim() || busy) return;
    runAnalysis(city.trim(), suburb.trim());
  };

  const flyTo = (s: DisplaySite) => {
    selectSite(s.id);
    useMapStore.getState().setPreventAutoFrame(true);
    useMapStore.getState().setCameraTarget({ center: { lat: s.lat, lng: s.lng, altitude: 300 }, range: 800, tilt: 55, heading: 0, roll: 0 });
  };

  return (
    <aside className="sp-left-rail" style={{
      width: 384, height: '100%', background: 'var(--bg-1)', borderRight: '1px solid var(--line)',
      display: 'flex', flexDirection: 'column', flexShrink: 0,
    }}>
      {/* Brand bar */}
      <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg, var(--accent), var(--accent-2))', display: 'grid', placeItems: 'center', color: 'var(--accent-ink)', fontWeight: 700, fontSize: 13 }}>FB</div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--ink-3)', letterSpacing: 1.2, textTransform: 'uppercase' }}>Famous Brands</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: -1 }}>Site Planner</div>
          </div>
        </div>
        <button style={iconBtn} onClick={toggleSidebar} title="Data & weights" aria-label="Data and weights"><Icon name="settings" size={15} /></button>
      </div>

      {/* Brand picker */}
      <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--line)' }}>
        <div style={{ fontSize: 10, color: 'var(--ink-3)', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>Planning for</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {BRANDS.map(b => <BrandChip key={b.name} name={b.name} selected={b.name === brand} onClick={() => setBrand(b.name)} />)}
        </div>
      </div>

      {/* Search → runs analysis */}
      <form onSubmit={onSubmit} style={{ padding: '12px 18px', borderBottom: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 10, padding: '8px 10px', flex: 1 }}>
            <Icon name="map" size={14} style={{ color: 'var(--ink-3)' }} />
            <input value={city} onChange={e => setCity(e.target.value)} placeholder="City" disabled={busy}
              style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--ink)', fontSize: 13, flex: 1, padding: 0, minWidth: 0 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 10, padding: '8px 10px', flex: 1.3 }}>
            <Icon name="search" size={14} style={{ color: 'var(--ink-3)' }} />
            <input value={suburb} onChange={e => setSuburb(e.target.value)} placeholder="Suburb…" disabled={busy}
              style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--ink)', fontSize: 13, flex: 1, padding: 0, minWidth: 0 }} />
          </div>
        </div>
        <button type="submit" disabled={busy || !suburb.trim()} style={{
          width: '100%', justifyContent: 'center',
          background: busy || !suburb.trim() ? 'var(--bg-3)' : 'linear-gradient(135deg, var(--accent), var(--accent-2))',
          color: busy || !suburb.trim() ? 'var(--ink-3)' : 'var(--accent-ink)',
          border: 'none', borderRadius: 10, padding: '10px', fontSize: 13, fontWeight: 600,
          cursor: busy || !suburb.trim() ? 'not-allowed' : 'pointer',
        }}>{busy ? 'Analysing…' : 'Find sites'}</button>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {([['aplus', 'A+ only'], ['lowComp', 'Low competition'], ['lowCannibal', 'No cannibalisation']] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setFilters(f => ({ ...f, [k]: !f[k] }))} style={{
              fontSize: 11, fontWeight: 500, padding: '4px 9px', borderRadius: 999,
              background: filters[k] ? 'rgba(245,165,36,0.14)' : 'var(--bg-2)',
              border: `1px solid ${filters[k] ? 'var(--accent)' : 'var(--line)'}`,
              color: filters[k] ? 'var(--accent)' : 'var(--ink-2)', cursor: 'pointer',
            }}>{l}</button>
          ))}
        </div>
      </form>

      {/* Count */}
      {sites.length > 0 && (
        <div style={{ padding: '10px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
            <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{filtered.length}</span> candidate{filtered.length === 1 ? '' : 's'} · <span className="mono">{storeSuburb}</span>
          </span>
        </div>
      )}

      {/* List / states */}
      <div className="sp-scroll" style={{ flex: 1, overflowY: 'auto', padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {busy && sites.length === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 26, height: 26, border: '3px solid var(--bg-3)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'fp-spin .8s linear infinite' }} />
            {status === 'detecting' ? 'Scanning Google Places…' : 'Gemini 2.5 Pro is ranking sites…'}
          </div>
        )}
        {status === 'error' && (
          <div style={{ padding: '24px 18px', textAlign: 'center', color: 'var(--bad)', fontSize: 13 }}>
            {usePlannerStore.getState().errorMessage}
          </div>
        )}
        {!busy && sites.length === 0 && status !== 'error' && (
          <div style={{ padding: '36px 18px', color: 'var(--ink-3)', fontSize: 13, lineHeight: 1.6 }}>
            <p style={{ margin: 0, color: 'var(--ink-2)', fontSize: 15, fontWeight: 600 }}>Scout a suburb</p>
            <p style={{ margin: '8px 0 0' }}>Set the brand and a city + suburb above, then <strong style={{ color: 'var(--ink)' }}>Find sites</strong>. I’ll detect the busiest commercial nodes and rank them for a new store.</p>
          </div>
        )}
        {filtered.map(s => (
          <SiteCard key={s.id} site={s} selected={s.id === selectedSiteId} onClick={() => flyTo(s)} />
        ))}
        {sites.length > 0 && filtered.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>No sites match those filters.</div>
        )}
      </div>
    </aside>
  );
}

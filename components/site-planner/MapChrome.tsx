import React from 'react';
import Icon from './Icon';
import { usePlannerStore } from '@/lib/site-planner/data-store';
import { useMapStore } from '@/lib/state';

const glass: React.CSSProperties = {
  background: 'rgba(20,18,16,0.85)', border: '1px solid var(--line-2)', borderRadius: 10,
  backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
};

function LegendRow({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{swatch}<span>{label}</span></div>;
}

export default function MapChrome() {
  const { city, suburb, features, dataLayers, toggleLayer, competitorsData, retailData } = usePlannerStore();
  const hasResult = features.length > 0;
  const hasData = competitorsData.length > 0 || retailData.length > 0;

  const recenter = () => {
    const ms = useMapStore.getState();
    ms.setPreventAutoFrame(false);
    ms.setMarkers([...ms.markers]); // re-trigger framing of all candidates
  };

  return (
    <>
      {/* Breadcrumb */}
      {(city || suburb) && (
        <div style={{ position: 'absolute', left: 16, top: 16, zIndex: 30, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px 8px 10px', boxShadow: '0 8px 24px rgba(0,0,0,0.35)', ...glass }}>
          <Icon name="map" size={14} style={{ color: 'var(--ink-3)' }} />
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{city || 'Map'} ›</span>
          <span style={{ fontSize: 12, color: 'var(--ink)', fontWeight: 600 }}>{suburb || 'pick a suburb'}</span>
        </div>
      )}

      {/* Data layer toggles (top-left, under breadcrumb) */}
      {hasData && (
        <div style={{ position: 'absolute', left: 16, top: 62, zIndex: 30, display: 'flex', gap: 2, padding: 4, ...glass }}>
          {([
            { key: 'competitors' as const, icon: 'users' as const, label: 'Competitors', dot: '#e14a3d' },
            { key: 'retail' as const, icon: 'store' as const, label: 'Retail anchors', dot: '#1f8fd6' },
          ]).map(t => {
            const active = dataLayers[t.key];
            return (
              <button key={t.key} onClick={() => toggleLayer(t.key)} title={`${active ? 'Hide' : 'Show'} ${t.label.toLowerCase()}`} style={{
                display: 'flex', alignItems: 'center', gap: 7, height: 30, padding: '0 11px', borderRadius: 8, cursor: 'pointer',
                background: active ? 'var(--accent)' : 'transparent',
                color: active ? 'var(--accent-ink)' : 'var(--ink-2)',
                border: `1px solid ${active ? 'var(--accent)' : 'transparent'}`, fontSize: 12, fontWeight: 500,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: 8, background: active ? 'var(--accent-ink)' : t.dot }} />
                {t.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Recenter (top-right) */}
      {hasResult && (
        <div style={{ position: 'absolute', right: 16, top: 70, zIndex: 30, display: 'flex', flexDirection: 'column', gap: 2, padding: 4, ...glass }}>
          <button onClick={recenter} title="Frame all candidates" style={{
            width: 36, height: 36, borderRadius: 9, background: 'transparent', color: 'var(--ink-2)',
            border: 'none', display: 'grid', placeItems: 'center', cursor: 'pointer',
          }}><Icon name="crosshair" size={15} /></button>
        </div>
      )}

      {/* Legend (bottom-left) */}
      {hasResult && (
        <div style={{ position: 'absolute', left: 16, bottom: 16, zIndex: 30, padding: '10px 12px', fontSize: 11, color: 'var(--ink-2)', display: 'flex', flexDirection: 'column', gap: 5, minWidth: 160, ...glass }}>
          <div style={{ fontSize: 10, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>Legend</div>
          <LegendRow swatch={<div style={{ width: 14, height: 14, borderRadius: 4, background: 'var(--accent)' }} />} label="#1 recommended" />
          <LegendRow swatch={<div style={{ width: 14, height: 14, borderRadius: 4, background: '#0f9d58' }} />} label="Top 3 candidate" />
          <LegendRow swatch={<div style={{ width: 14, height: 14, borderRadius: 4, background: '#5f6368' }} />} label="Other candidate" />
        </div>
      )}

      {/* Scale (bottom-right) */}
      <div style={{ position: 'absolute', right: 16, bottom: 16, zIndex: 30, fontSize: 10, color: 'var(--ink-3)', fontFamily: 'Geist Mono', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>500m</span>
        <div style={{ display: 'flex', height: 6 }}>
          <div style={{ width: 22, background: 'var(--ink-3)' }} />
          <div style={{ width: 22, borderRight: '1px solid var(--ink-3)', borderTop: '1px solid var(--ink-3)', borderBottom: '1px solid var(--ink-3)' }} />
          <div style={{ width: 22, background: 'var(--ink-3)' }} />
        </div>
      </div>
    </>
  );
}

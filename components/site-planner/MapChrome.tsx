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
  const { city, suburb, features, dataLayers, toggleLayer, competitorsData, retailData, existingStores, brand, apiCalls, queryLayers, removeQueryLayer, clearQueryLayers, viewLabel } = usePlannerStore();
  const hasResult = features.length > 0;
  const hasData = competitorsData.length > 0 || retailData.length > 0 || existingStores.length > 0;

  const recenter = () => {
    const ms = useMapStore.getState();
    ms.setPreventAutoFrame(false);
    ms.setMarkers([...ms.markers]); // re-trigger framing of all candidates
  };

  return (
    <>
      {/* Breadcrumb */}
      {(city || suburb || viewLabel) && (
        <div style={{ position: 'absolute', left: 16, top: 16, zIndex: 30, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px 8px 10px', boxShadow: '0 8px 24px rgba(0,0,0,0.35)', ...glass }}>
          <Icon name="map" size={14} style={{ color: 'var(--ink-3)' }} />
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{city || 'Map'} ›</span>
          <span style={{ fontSize: 12, color: 'var(--ink)', fontWeight: 600 }}>{suburb || viewLabel || 'pick a suburb'}</span>
          {apiCalls > 0 && <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', marginLeft: 6 }}>· {apiCalls} API calls</span>}
        </div>
      )}

      {/* Data layer toggles (top-left, under breadcrumb) */}
      {hasData && (
        <div style={{ position: 'absolute', left: 16, top: 62, zIndex: 30, display: 'flex', gap: 2, padding: 4, ...glass }}>
          {([
            { key: 'existing' as const, icon: 'store' as const, label: `Existing ${brand}`, dot: '#34c759', show: existingStores.length > 0 },
            { key: 'competitors' as const, icon: 'users' as const, label: 'Competitors', dot: '#e14a3d', show: competitorsData.length > 0 },
            { key: 'retail' as const, icon: 'store' as const, label: 'Retail anchors', dot: '#1f8fd6', show: retailData.length > 0 },
          ]).filter(t => t.show).map(t => {
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

      {/* Chat query layers (top-left, under the data toggles): one chip per query, in its pin colour */}
      {queryLayers.length > 0 && (
        <div style={{ position: 'absolute', left: 16, top: hasData ? 108 : 62, zIndex: 30, display: 'flex', flexWrap: 'wrap', gap: 2, padding: 4, maxWidth: 'calc(100% - 32px)', ...glass }}>
          {queryLayers.map(l => (
            <span key={l.label} title={`${l.points.length} ${l.label} · ${l.colorName} pins`} style={{
              display: 'flex', alignItems: 'center', gap: 7, height: 30, padding: '0 6px 0 11px', borderRadius: 8,
              color: 'var(--ink)', fontSize: 12, fontWeight: 500, border: `1px solid ${l.color}55`, background: `${l.color}22`,
            }}>
              <span style={{ width: 8, height: 8, borderRadius: 8, background: l.color, outline: '1px solid rgba(255,255,255,0.25)' }} />
              {l.label}
              <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)' }}>{l.points.length}</span>
              <button onClick={() => removeQueryLayer(l.label)} title={`Remove ${l.label}`} style={{
                width: 20, height: 20, borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--ink-3)',
                display: 'grid', placeItems: 'center', cursor: 'pointer', fontSize: 14, lineHeight: 1,
              }}>×</button>
            </span>
          ))}
          {queryLayers.length > 1 && (
            <button onClick={clearQueryLayers} title="Remove all query pins" style={{
              height: 30, padding: '0 10px', borderRadius: 8, border: '1px solid transparent', background: 'transparent',
              color: 'var(--ink-3)', fontSize: 12, cursor: 'pointer',
            }}>Clear all</button>
          )}
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
      {(hasResult || queryLayers.length > 0) && (
        <div style={{ position: 'absolute', left: 16, bottom: 16, zIndex: 30, padding: '10px 12px', fontSize: 11, color: 'var(--ink-2)', display: 'flex', flexDirection: 'column', gap: 5, minWidth: 160, ...glass }}>
          <div style={{ fontSize: 10, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>Legend</div>
          {hasResult && <LegendRow swatch={<div style={{ width: 14, height: 14, borderRadius: 4, background: '#f5a524' }} />} label="#1 recommended" />}
          {hasResult && <LegendRow swatch={<div style={{ width: 14, height: 14, borderRadius: 4, background: '#ff7a1a' }} />} label="Top 3 candidate" />}
          {hasResult && <LegendRow swatch={<div style={{ width: 14, height: 14, borderRadius: 4, background: '#8a8278' }} />} label="Other candidate" />}
          {hasResult && existingStores.length > 0 && <LegendRow swatch={<div style={{ width: 14, height: 14, borderRadius: 4, background: '#34c759' }} />} label={`Existing ${brand}`} />}
          {queryLayers.map(l => (
            <LegendRow key={l.label} swatch={<div style={{ width: 14, height: 14, borderRadius: 14, background: l.color }} />} label={l.label} />
          ))}
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

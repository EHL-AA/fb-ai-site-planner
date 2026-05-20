import React from 'react';
import { usePlannerStore } from '@/lib/site-planner/data-store';
import { useMapStore } from '@/lib/state';

export default function RankedPanel() {
  const { result, features, status, errorMessage, selectSite, selectedSiteId } = usePlannerStore();

  if (status === 'error') return <div className="ranked-panel error">{errorMessage}</div>;
  if (status === 'detecting') return <div className="ranked-panel">Detecting commercial nodes…</div>;
  if (status === 'reasoning' && !result) return <div className="ranked-panel">Gemini 2.5 Pro is ranking sites…</div>;
  if (!result) return null;

  const featureById = new Map(features.map(f => [f.id, f]));

  const flyTo = (id: string) => {
    const f = featureById.get(id);
    if (!f) return;
    selectSite(id);
    // Prevent the marker auto-frame effect from fighting this direct fly-to.
    useMapStore.getState().setPreventAutoFrame(true);
    useMapStore.getState().setCameraTarget({ center: { lat: f.lat, lng: f.lng, altitude: 300 }, range: 800, tilt: 55, heading: 0, roll: 0 });
  };

  return (
    <div className="ranked-panel">
      <p className="overall-summary">{result.overallSummary}</p>
      <ol className="ranked-list">
        {[...result.ranked].sort((a, b) => a.rank - b.rank).map(site => {
          const f = featureById.get(site.id);
          return (
            <li key={site.id} className={`ranked-item ${selectedSiteId === site.id ? 'selected' : ''}`} onClick={() => flyTo(site.id)}>
              <div className="ranked-head">
                <span className="rank-badge">{site.rank}</span>
                <span className="ranked-label">{f?.label ?? site.id}</span>
                <span className="ranked-score">{Math.round(site.compositeScore0to100)}</span>
              </div>
              <div className="ranked-bars">
                {(['traffic', 'demographics', 'competition', 'accessibility'] as const).map(k => (
                  <div key={k} className="bar"><span>{k}</span><i style={{ width: `${site.breakdown[k]}%` }} /></div>
                ))}
              </div>
              <p className="ranked-rationale">{site.rationale}</p>
              {site.risks && <p className="ranked-risks">⚠ {site.risks}</p>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

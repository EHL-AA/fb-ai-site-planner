import React from 'react';
import { usePlannerStore } from '@/lib/site-planner/data-store';
import { useMapStore } from '@/lib/state';

const METRICS = ['traffic', 'demographics', 'competition', 'accessibility'] as const;

export default function RankedPanel() {
  const { result, features, status, errorMessage, selectSite, selectedSiteId } = usePlannerStore();

  if (status === 'error') {
    return (
      <div className="rank-state error">
        <span className="icon">error</span>
        <p>{errorMessage}</p>
      </div>
    );
  }

  if (!result) {
    if (status === 'detecting' || status === 'reasoning') {
      return (
        <div className="rank-state">
          <span className="spinner" />
          <p>Analysing the area…</p>
        </div>
      );
    }
    return (
      <div className="rank-state welcome">
        <span className="icon">explore</span>
        <p className="rank-state-title">Pick a suburb to scout</p>
        <p className="rank-state-hint">
          Choose a brand and a city + suburb above, then “Find sites”. I’ll detect the busiest
          commercial nodes and rank them for a new store.
        </p>
      </div>
    );
  }

  const featureById = new Map(features.map(f => [f.id, f]));

  const flyTo = (id: string) => {
    const f = featureById.get(id);
    if (!f) return;
    selectSite(id);
    useMapStore.getState().setPreventAutoFrame(true);
    useMapStore
      .getState()
      .setCameraTarget({ center: { lat: f.lat, lng: f.lng, altitude: 300 }, range: 800, tilt: 55, heading: 0, roll: 0 });
  };

  return (
    <div className="ranked">
      {result.overallSummary && (
        <div className="ranked-summary">
          <span className="ranked-summary-label">Assessment</span>
          <p>{result.overallSummary}</p>
        </div>
      )}

      <ol className="ranked-list">
        {[...result.ranked]
          .sort((a, b) => a.rank - b.rank)
          .map(site => {
            const f = featureById.get(site.id);
            const tier = site.rank === 1 ? 'gold' : site.rank <= 3 ? 'green' : 'grey';
            return (
              <li
                key={site.id}
                className={`site-card ${selectedSiteId === site.id ? 'selected' : ''}`}
                onClick={() => flyTo(site.id)}
              >
                <div className="site-head">
                  <span className={`rank-medallion ${tier}`}>{site.rank}</span>
                  <span className="site-label">{f?.label ?? site.id}</span>
                  <span className="site-score">
                    {Math.round(site.compositeScore0to100)}
                    <small>/100</small>
                  </span>
                </div>

                <div className="site-bars">
                  {METRICS.map(k => (
                    <div key={k} className="metric">
                      <span className="metric-name">{k}</span>
                      <span className="metric-track">
                        <i style={{ width: `${Math.max(2, site.breakdown[k])}%` }} />
                      </span>
                      <span className="metric-val">{Math.round(site.breakdown[k])}</span>
                    </div>
                  ))}
                </div>

                <p className="site-rationale">{site.rationale}</p>
                {site.risks && (
                  <p className="site-risks">
                    <span className="icon">warning</span>
                    {site.risks}
                  </p>
                )}
              </li>
            );
          })}
      </ol>
    </div>
  );
}

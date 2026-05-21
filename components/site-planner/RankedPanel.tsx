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
      <div className="onboard">
        <p className="onboard-lead">
          Find the best place to open a <strong>{usePlannerStore.getState().brand}</strong>.
        </p>
        <ol className="onboard-steps">
          <li>
            <span className="step-no">1</span>
            <div>
              <h4>Choose a location</h4>
              <p>Set the brand, city and suburb above, then <strong>Find sites</strong>.</p>
            </div>
          </li>
          <li>
            <span className="step-no">2</span>
            <div>
              <h4>Review ranked sites</h4>
              <p>I detect the busiest commercial nodes and score each on traffic, demographics, competition and accessibility.</p>
            </div>
          </li>
          <li>
            <span className="step-no">3</span>
            <div>
              <h4>Refine in plain language</h4>
              <p>Add your competitor &amp; store CSVs (<span className="inline-icon icon">tune</span>), then ask the assistant to re-rank.</p>
            </div>
          </li>
        </ol>
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

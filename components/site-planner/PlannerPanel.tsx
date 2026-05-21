import React from 'react';
import SuburbSearch from './SuburbSearch';
import RankedPanel from './RankedPanel';
import { usePlannerStore } from '@/lib/site-planner/data-store';

export default function PlannerPanel() {
  const { status, result } = usePlannerStore();
  const rankedCount = result?.ranked.length ?? 0;

  const statusLabel =
    status === 'detecting'
      ? 'Scanning Google Places for commercial nodes…'
      : status === 'reasoning'
        ? 'Gemini 2.5 Pro is scoring the candidates…'
        : null;

  return (
    <div className="rail">
      <header className="rail-head">
        <div className="brand-mark">
          <span className="brand-kicker">Famous Brands</span>
          <span className="brand-title">Site Planner</span>
        </div>
      </header>

      <SuburbSearch />

      {statusLabel && (
        <div className="rail-status">
          <span className="pulse-dot" />
          <span>{statusLabel}</span>
        </div>
      )}

      {rankedCount > 0 && (
        <div className="rail-section-label">
          <span>Ranked sites</span>
          <span className="rail-count">{rankedCount}</span>
        </div>
      )}

      <div className="rail-body">
        <RankedPanel />
      </div>
    </div>
  );
}

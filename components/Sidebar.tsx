/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
import c from 'classnames';
import { useUI } from '@/lib/state';
import DataUpload from '@/components/site-planner/DataUpload';
import { usePlannerStore } from '@/lib/site-planner/data-store';
import { ScoringWeights } from '@/lib/site-planner/types';

const WEIGHT_FIELDS: { key: keyof ScoringWeights; label: string }[] = [
  { key: 'traffic', label: 'Traffic' },
  { key: 'demographics', label: 'Demographics' },
  { key: 'competition', label: 'Competition' },
  { key: 'accessibility', label: 'Accessibility' },
];

export default function Sidebar() {
  const { isSidebarOpen, toggleSidebar } = useUI();
  const { weights, setWeights, uploadErrors, reset, brand, suburb, city, features, result } =
    usePlannerStore();

  const handleExport = () => {
    const payload = { brand, city, suburb, weights, features, result };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `site-analysis-${suburb || 'export'}-${timestamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <aside className={c('sidebar', { open: isSidebarOpen })}>
      <div className="sidebar-header">
        <h3>Data &amp; weights</h3>
        <button onClick={toggleSidebar} className="close-button" aria-label="Close settings">
          <span className="icon">close</span>
        </button>
      </div>
      <div className="sidebar-content">
        <div className="sidebar-section">
          <h4>Your data</h4>
          <DataUpload />
        </div>

        <div className="sidebar-section">
          <h4>Scoring weights</h4>
          {WEIGHT_FIELDS.map(({ key, label }) => (
            <label key={key} className="weight-slider">
              <span>{label}: {weights[key].toFixed(2)}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={weights[key]}
                onChange={e => setWeights({ ...weights, [key]: Number(e.target.value) })}
              />
            </label>
          ))}
        </div>

        {uploadErrors.length > 0 && (
          <div className="sidebar-section upload-errors">
            <h4>Upload notes ({uploadErrors.length})</h4>
            <ul>
              {uploadErrors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="sidebar-actions">
          <button onClick={handleExport} title="Export the current analysis as JSON" disabled={!result}>
            <span className="icon">download</span>
            Export analysis
          </button>
          <button onClick={reset} title="Clear candidates, ranking and chat">
            <span className="icon">refresh</span>
            Reset
          </button>
        </div>
      </div>
    </aside>
  );
}

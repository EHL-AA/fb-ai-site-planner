import React, { useState } from 'react';
import { usePlanner } from '@/contexts/PlannerContext';
import { usePlannerStore, FAMOUS_BRANDS } from '@/lib/site-planner/data-store';
import { useUI } from '@/lib/state';

export default function SuburbSearch() {
  const { runAnalysis } = usePlanner();
  const { brand, setBrand, status } = usePlannerStore();
  const { toggleSidebar } = useUI();
  const [city, setCity] = useState('Johannesburg');
  const [suburb, setSuburb] = useState('');
  const busy = status === 'detecting' || status === 'reasoning';

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!suburb.trim()) return;
    runAnalysis(city.trim(), suburb.trim());
  };

  return (
    <form className="search" onSubmit={onSubmit}>
      <label className="field brand-field">
        <span className="field-label">Brand</span>
        <select value={brand} onChange={e => setBrand(e.target.value)} disabled={busy}>
          {FAMOUS_BRANDS.map(b => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
      </label>

      <div className="field-row">
        <label className="field">
          <span className="field-label">City</span>
          <input value={city} onChange={e => setCity(e.target.value)} placeholder="Johannesburg" disabled={busy} />
        </label>
        <label className="field">
          <span className="field-label">Suburb</span>
          <input value={suburb} onChange={e => setSuburb(e.target.value)} placeholder="e.g. Rosebank" disabled={busy} />
        </label>
      </div>

      <div className="search-actions">
        <button type="submit" className="btn-primary" disabled={busy || !suburb.trim()}>
          {busy ? 'Analysing…' : 'Find sites'}
        </button>
        <button
          type="button"
          className="btn-icon"
          onClick={toggleSidebar}
          title="Data & weights"
          aria-label="Open data and weights panel"
        >
          <span className="icon">tune</span>
        </button>
      </div>
    </form>
  );
}

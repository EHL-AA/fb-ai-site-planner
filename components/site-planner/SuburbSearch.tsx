import React, { useState } from 'react';
import { usePlanner } from '@/contexts/PlannerContext';
import { usePlannerStore, FAMOUS_BRANDS } from '@/lib/site-planner/data-store';

export default function SuburbSearch() {
  const { runAnalysis } = usePlanner();
  const { brand, setBrand, status } = usePlannerStore();
  const [city, setCity] = useState('Johannesburg');
  const [suburb, setSuburb] = useState('');
  const busy = status === 'detecting' || status === 'reasoning';

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!suburb.trim()) return;
    runAnalysis(city.trim(), suburb.trim());
  };

  return (
    <form className="suburb-search" onSubmit={onSubmit}>
      <select value={brand} onChange={e => setBrand(e.target.value)} disabled={busy} aria-label="Brand">
        {FAMOUS_BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
      </select>
      <input value={city} onChange={e => setCity(e.target.value)} placeholder="City" disabled={busy} aria-label="City" />
      <input value={suburb} onChange={e => setSuburb(e.target.value)} placeholder="Suburb (e.g. Rosebank)" disabled={busy} aria-label="Suburb" />
      <button type="submit" disabled={busy || !suburb.trim()}>
        {busy ? 'Analysing…' : 'Find sites'}
      </button>
    </form>
  );
}

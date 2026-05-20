import React from 'react';
import { parseCompetitors, parseStores, parseDemographics } from '@/lib/site-planner/csv';
import { usePlannerStore } from '@/lib/site-planner/data-store';

type Kind = 'competitors' | 'stores' | 'demographics';

export default function DataUpload() {
  const { competitors, stores, demographics, setCompetitors, setStores, setDemographics, addUploadErrors } = usePlannerStore();

  const onFile = (kind: Kind) => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    if (kind === 'competitors') {
      const { records, errors } = parseCompetitors(text);
      setCompetitors(records);
      if (errors.length) addUploadErrors(errors.map(x => `competitors: ${x}`));
    }
    if (kind === 'stores') {
      const { records, errors } = parseStores(text);
      setStores(records);
      if (errors.length) addUploadErrors(errors.map(x => `stores: ${x}`));
    }
    if (kind === 'demographics') {
      const { records, errors } = parseDemographics(text);
      setDemographics(records);
      if (errors.length) addUploadErrors(errors.map(x => `demographics: ${x}`));
    }
    e.target.value = '';
  };

  const row = (kind: Kind, label: string, count: number) => (
    <label className="upload-row">
      <span>{label} <strong>({count})</strong></span>
      <input type="file" accept=".csv,text/csv" onChange={onFile(kind)} />
    </label>
  );

  return (
    <div className="data-upload">
      {row('competitors', 'Competitor locations', competitors.length)}
      {row('stores', 'Your existing stores', stores.length)}
      {row('demographics', 'Demographics (optional)', demographics.length)}
    </div>
  );
}

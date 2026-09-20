import React from 'react';
import { parseCompetitors, parseStores, parseDemographics, parseFootTraffic } from '@/lib/site-planner/csv';
import { usePlannerStore } from '@/lib/site-planner/data-store';

type Kind = 'competitors' | 'stores' | 'demographics' | 'footTraffic';

export default function DataUpload() {
  const {
    competitors, stores, demographics, footTraffic,
    setCompetitors, setStores, setDemographics, setFootTraffic, addUploadErrors,
  } = usePlannerStore();

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
    if (kind === 'footTraffic') {
      const { records, errors } = parseFootTraffic(text);
      setFootTraffic(records);
      if (errors.length) addUploadErrors(errors.map(x => `foot traffic: ${x}`));
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
      {row('footTraffic', 'Foot traffic (vendor export: lat, lng, daily_visits)', footTraffic.length)}
    </div>
  );
}

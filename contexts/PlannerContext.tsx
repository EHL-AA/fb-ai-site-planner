import React, { createContext, FC, ReactNode, useContext, useCallback } from 'react';
import { detectCommercialNodes } from '@/lib/site-planner/node-detection';
import { computeFeatures } from '@/lib/site-planner/features';
import { analyzeSuburb, rerank } from '@/lib/site-planner/reasoning';
import { queryPlaces } from '@/lib/site-planner/places-data';
import { usePlannerStore } from '@/lib/site-planner/data-store';
import { useMapStore, MapMarker } from '@/lib/state';
import { FeatureVector, RankedResult, CompetitorRecord } from '@/lib/site-planner/types';

interface PlannerContextValue {
  placesLib: google.maps.PlacesLibrary | null;
  geocoder: google.maps.Geocoder | null;
  runAnalysis: (city: string, suburb: string) => Promise<void>;
  ask: (message: string) => Promise<void>;
}

const Ctx = createContext<PlannerContextValue | undefined>(undefined);

function markersFor(features: FeatureVector[], result?: RankedResult | null): MapMarker[] {
  const rankById = new Map((result?.ranked ?? []).map(r => [r.id, r.rank]));
  return features.map(f => ({
    position: { lat: f.lat, lng: f.lng, altitude: 1 },
    label: f.label,
    showLabel: true,
    rank: rankById.get(f.id),
    kind: 'candidate' as const,
  }));
}

export const PlannerProvider: FC<{
  children: ReactNode;
  placesLib: google.maps.PlacesLibrary | null;
  geocoder: google.maps.Geocoder | null;
}> = ({ children, placesLib, geocoder }) => {
  const runAnalysis = useCallback(async (city: string, suburb: string) => {
    const s = usePlannerStore.getState();
    if (!placesLib || !geocoder) { s.setError('Map libraries not ready yet.'); s.setStatus('error'); return; }
    s.setLocation(city, suburb);
    s.setError(null);
    s.setStatus('detecting');
    try {
      const query = `${suburb}, ${city}`;
      const geo = await geocoder.geocode({ address: query });
      if (geo.results?.[0]) {
        const loc = geo.results[0].geometry.location;
        s.setViewCenter({ lat: loc.lat(), lng: loc.lng() });
        useMapStore.getState().setCameraTarget({
          center: { lat: loc.lat(), lng: loc.lng(), altitude: 5000 },
          range: 15000, tilt: 25, heading: 0, roll: 0,
        });
      }

      const nodes = await detectCommercialNodes({ placesLib, geocoder, query });
      if (!nodes.length) { s.setError(`No commercial nodes found in ${query}. Try a larger or busier suburb.`); s.setStatus('error'); return; }
      s.setCandidates(nodes);

      // Use uploaded competitor CSV if present, else the bundled FB competitor data.
      const competitors: CompetitorRecord[] = s.competitors.length
        ? s.competitors
        : s.competitorsData.map(p => ({ name: p.n, lat: p.lat, lng: p.lng, brand: p.b }));

      const features = computeFeatures(nodes, { competitors, stores: s.stores, demographics: s.demographics }, suburb);
      s.setFeatures(features);
      useMapStore.getState().setMarkers(markersFor(features));

      s.setStatus('reasoning');
      const result = await analyzeSuburb({ brand: s.brand, suburb, features, weights: s.weights });
      s.setResult(result);
      useMapStore.getState().setMarkers(markersFor(features, result));
      s.setStatus('done');
    } catch (e: any) {
      s.setError(e?.message ?? 'Analysis failed.');
      s.setStatus('error');
    }
  }, [placesLib, geocoder]);

  const doRerank = useCallback(async (message: string) => {
    const s = usePlannerStore.getState();
    s.setStatus('reasoning');
    try {
      const result = await rerank({ brand: s.brand, suburb: s.suburb, features: s.features, weights: s.weights }, message);
      s.setResult(result);
      s.addChat({ role: 'agent', text: result.overallSummary });
      useMapStore.getState().setMarkers(markersFor(s.features, result));
      s.setStatus('done');
    } catch (e: any) {
      s.addChat({ role: 'agent', text: `Sorry — re-ranking failed: ${e?.message ?? 'unknown error'}` });
      s.setStatus('done');
    }
  }, []);

  const ask = useCallback(async (message: string) => {
    const s = usePlannerStore.getState();
    s.addChat({ role: 'user', text: message });

    // 1) A query over your competitor / retail data ("show all burger places")
    const haveData = s.competitorsData.length > 0 || s.retailData.length > 0;
    const q = haveData ? queryPlaces(message, { competitors: s.competitorsData, retail: s.retailData }, s.viewCenter) : null;
    if (q) {
      s.setQueryLayer({ label: q.label, points: q.points });
      // Fly to the extent of the matched points.
      if (q.points.length) {
        const lat = q.points.reduce((a, p) => a + p.lat, 0) / q.points.length;
        const lng = q.points.reduce((a, p) => a + p.lng, 0) / q.points.length;
        useMapStore.getState().setPreventAutoFrame(true);
        useMapStore.getState().setCameraTarget({ center: { lat, lng, altitude: 4000 }, range: s.viewCenter ? 9000 : 60000, tilt: 25, heading: 0, roll: 0 });
      }
      const brands = q.topBrands.map(([b, n]) => `${b} (${n})`).join(', ');
      const where = s.suburb ? ` near ${s.suburb}` : ' (nationwide — pick a suburb to focus)';
      s.addChat({ role: 'agent', text: `Showing **${q.points.length}** of ${q.total} ${q.label}${where} on the map.${brands ? ` Top brands: ${brands}.` : ''}` });
      return;
    }

    // 2) Re-rank the current candidate sites
    if (s.features.length) { await doRerank(message); return; }

    // 3) Guidance
    s.addChat({
      role: 'agent',
      text: 'I can map your data — try **“show all burger places”** or **“pizza places”**, or a brand like **“where are the KFCs”**. To rank store locations, set a city + suburb and hit **Find sites**.',
    });
  }, [doRerank]);

  return <Ctx.Provider value={{ placesLib, geocoder, runAnalysis, ask }}>{children}</Ctx.Provider>;
};

export const usePlanner = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('usePlanner must be used within PlannerProvider');
  return c;
};

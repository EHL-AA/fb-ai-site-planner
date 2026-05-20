import React, { createContext, FC, ReactNode, useContext, useCallback } from 'react';
import { detectCommercialNodes } from '@/lib/site-planner/node-detection';
import { computeFeatures } from '@/lib/site-planner/features';
import { analyzeSuburb, rerank } from '@/lib/site-planner/reasoning';
import { usePlannerStore } from '@/lib/site-planner/data-store';
import { useMapStore, MapMarker } from '@/lib/state';
import { FeatureVector, RankedResult } from '@/lib/site-planner/types';

interface PlannerContextValue {
  placesLib: google.maps.PlacesLibrary | null;
  geocoder: google.maps.Geocoder | null;
  runAnalysis: (city: string, suburb: string) => Promise<void>;
  sendChat: (message: string) => Promise<void>;
}

const Ctx = createContext<PlannerContextValue | undefined>(undefined);

/** Build the marker list for a set of features, applying ranks from a result if present. */
function markersFor(features: FeatureVector[], result?: RankedResult | null): MapMarker[] {
  const rankById = new Map((result?.ranked ?? []).map(r => [r.id, r.rank]));
  return features.map(f => ({
    position: { lat: f.lat, lng: f.lng, altitude: 1 },
    label: f.label,
    showLabel: true,
    rank: rankById.get(f.id),
  }));
}

export const PlannerProvider: FC<{
  children: ReactNode;
  placesLib: google.maps.PlacesLibrary | null;
  geocoder: google.maps.Geocoder | null;
}> = ({ children, placesLib, geocoder }) => {
  const runAnalysis = useCallback(async (city: string, suburb: string) => {
    const s = usePlannerStore.getState();
    if (!placesLib || !geocoder) {
      s.setError('Map libraries not ready yet.');
      s.setStatus('error');
      return;
    }
    s.setLocation(city, suburb);
    s.setError(null);
    s.setStatus('detecting');
    try {
      const query = `${suburb}, ${city}`;
      // Fly the map to the suburb.
      const geo = await geocoder.geocode({ address: query });
      if (geo.results?.[0]) {
        const loc = geo.results[0].geometry.location;
        useMapStore.getState().setCameraTarget({
          center: { lat: loc.lat(), lng: loc.lng(), altitude: 5000 },
          range: 15000, tilt: 25, heading: 0, roll: 0,
        });
      }

      const nodes = await detectCommercialNodes({ placesLib, geocoder, query });
      if (!nodes.length) {
        s.setError(`No commercial nodes found in ${query}. Try a larger or busier suburb.`);
        s.setStatus('error');
        return;
      }
      s.setCandidates(nodes);

      const features = computeFeatures(
        nodes,
        { competitors: s.competitors, stores: s.stores, demographics: s.demographics },
        suburb,
      );
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

  const sendChat = useCallback(async (message: string) => {
    const s = usePlannerStore.getState();
    if (!s.features.length) return;
    s.addChat({ role: 'user', text: message });
    s.setStatus('reasoning');
    try {
      const result = await rerank(
        { brand: s.brand, suburb: s.suburb, features: s.features, weights: s.weights },
        message,
      );
      s.setResult(result);
      s.addChat({ role: 'agent', text: result.overallSummary });
      useMapStore.getState().setMarkers(markersFor(s.features, result));
      s.setStatus('done');
    } catch (e: any) {
      s.addChat({ role: 'agent', text: `Sorry — re-ranking failed: ${e?.message ?? 'unknown error'}` });
      s.setStatus('done');
    }
  }, []);

  return <Ctx.Provider value={{ placesLib, geocoder, runAnalysis, sendChat }}>{children}</Ctx.Provider>;
};

export const usePlanner = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('usePlanner must be used within PlannerProvider');
  return c;
};

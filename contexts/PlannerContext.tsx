import React, { createContext, FC, ReactNode, useContext, useCallback } from 'react';
import { detectCommercialNodes, findBrandStores } from '@/lib/site-planner/node-detection';
import { analyzeSuburb, rerank, answerQuestion, answerMapQuestion, classifyIntent, describeRankChanges } from '@/lib/site-planner/reasoning';
import { queryPlaces, parseFocusRequest, splitLocation, knownQueryTerms, nearby, datasetSummary } from '@/lib/site-planner/places-data';
import { haversineMeters } from '@/lib/site-planner/geo';
import { usePlannerStore } from '@/lib/site-planner/data-store';
import { gatherSignals, CallBudget } from '@/lib/site-planner/signals';
import { composeFeatures } from '@/lib/site-planner/compose-features';
import { useMapStore, MapMarker } from '@/lib/state';
import { FeatureVector, RankedResult, CompetitorRecord, StoreRecord, SuburbSelection } from '@/lib/site-planner/types';

interface PlannerContextValue {
  placesLib: google.maps.PlacesLibrary | null;
  geocoder: google.maps.Geocoder | null;
  runAnalysis: (selection: SuburbSelection) => Promise<void>;
  ask: (message: string) => Promise<void>;
  /** Re-rank the current candidates using the weights currently set in the store (the sliders). */
  rerankWithWeights: () => Promise<void>;
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
  mapsApiKey: string;
}> = ({ children, placesLib, geocoder, mapsApiKey }) => {
  const runAnalysis = useCallback(async (selection: SuburbSelection) => {
    const s = usePlannerStore.getState();
    if (!placesLib) { s.setError('Map libraries not ready yet.'); s.setStatus('error'); return; }
    s.setSelection(selection);
    s.setError(null);
    s.setStatus('detecting');
    s.setApiCalls(0);
    try {
      const { center, viewport, suburb } = selection;
      s.setViewCenter(center);
      useMapStore.getState().setCameraTarget({
        center: { lat: center.lat, lng: center.lng, altitude: 5000 },
        range: 15000, tilt: 25, heading: 0, roll: 0,
      });

      const { nodes, swept } = await detectCommercialNodes({ placesLib, center, viewport });
      if (!nodes.length) { s.setError(`No commercial nodes found in ${suburb}. Try a larger or busier suburb.`); s.setStatus('error'); return; }
      s.setCandidates(nodes);

      const existingStores = await findBrandStores(placesLib, s.brand, center);
      s.setExistingStores(existingStores);

      // Use uploaded competitor CSV if present, else the bundled FB competitor data.
      const competitors: CompetitorRecord[] = s.competitors.length
        ? s.competitors
        : s.competitorsData.map(p => ({ name: p.n, lat: p.lat, lng: p.lng, brand: p.b }));

      // Own stores for cannibalisation = uploaded CSV + the brand's existing outlets we found.
      const stores: StoreRecord[] = [
        ...s.stores,
        ...existingStores.map(p => ({ name: p.n, lat: p.lat, lng: p.lng })),
      ];

      s.setStatus('enriching');
      const budget = new CallBudget();
      const signals = await gatherSignals(nodes, {
        selection, mapsApiKey, fetchImpl: fetch.bind(window), budget, now: new Date(),
        retail: s.retailData, swept,
      });
      s.setApiCalls(budget.used);
      const features = composeFeatures(nodes, signals, { competitors, stores, demographics: s.demographics }, suburb);
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
  }, [placesLib, mapsApiKey]);

  const doRerank = useCallback(async (message: string) => {
    const s = usePlannerStore.getState();
    s.setStatus('reasoning');
    s.setChatActivity('reranking');
    try {
      const before = s.result;
      const result = await rerank({ brand: s.brand, suburb: s.suburb, features: s.features, weights: s.weights }, message);
      s.setResult(result);
      const moves = describeRankChanges(before, result, s.features);
      let weightsLine = '';
      if (result.appliedWeights) {
        const w = result.appliedWeights;
        const changed = (['traffic', 'demographics', 'competition', 'accessibility'] as const).some(k => Math.abs(w[k] - s.weights[k]) >= 0.02);
        s.setWeights(w);
        if (changed) weightsLine = `**Weights now:** traffic ${w.traffic.toFixed(2)} · demographics ${w.demographics.toFixed(2)} · competition ${w.competition.toFixed(2)} · accessibility ${w.accessibility.toFixed(2)} (sliders updated).`;
      }
      s.addChat({ role: 'agent', text: [moves, weightsLine, result.overallSummary].filter(Boolean).join('\n\n') });
      useMapStore.getState().setMarkers(markersFor(s.features, result));
      s.setStatus('done');
    } catch (e: any) {
      s.addChat({ role: 'agent', text: `Sorry — re-ranking failed: ${e?.message ?? 'unknown error'}` });
      s.setStatus('done');
    } finally {
      usePlannerStore.getState().setChatActivity(null);
    }
  }, []);

  const rerankWithWeights = useCallback(async () => {
    const s = usePlannerStore.getState();
    if (!s.features.length) return;
    const w = s.weights;
    s.addChat({ role: 'user', text: `Re-rank with weights: traffic ${w.traffic.toFixed(2)}, demographics ${w.demographics.toFixed(2)}, competition ${w.competition.toFixed(2)}, accessibility ${w.accessibility.toFixed(2)}` });
    await doRerank('Apply the scoring weights exactly as given; do not reinterpret them.');
  }, [doRerank]);

  /** Geocodes a place name (South Africa first) into a centre, label and a
   *  sensible radius / camera range from its viewport. */
  const geocodePlace = useCallback(async (place: string) => {
    if (!geocoder) return null;
    try {
      // Google resolves "Cape Town CBD" to the whole city; "City Centre" gives the actual centre.
      const address = place.replace(/\b(cbd|central business district|city center|downtown|town centre|town center)\b/i, 'City Centre');
      const { results } = await geocoder.geocode({ address: `${address}, South Africa` });
      const r = results[0];
      if (!r) return null;
      const center = { lat: r.geometry.location.lat(), lng: r.geometry.location.lng() };
      const vp = r.geometry.viewport;
      const ne = vp.getNorthEast(), sw = vp.getSouthWest();
      const diag = haversineMeters(ne.lat(), ne.lng(), sw.lat(), sw.lng());
      const label = r.address_components?.[0]?.long_name || place;
      return { center, label, radiusM: Math.max(5000, diag / 2), range: Math.min(120000, Math.max(3000, diag)) };
    } catch {
      return null;
    }
  }, [geocoder]);

  const ask = useCallback(async (message: string) => {
    const s = usePlannerStore.getState();
    s.addChat({ role: 'user', text: message });

    // 0) "clear the map" / "remove the pins" → drop every chat query layer.
    if (s.queryLayers.length && /\b(clear|remove|hide|reset)\b.*\b(map|pins?|markers?|layers?|places|results?)\b/i.test(message)) {
      s.clearQueryLayers();
      s.addChat({ role: 'agent', text: 'Cleared the query pins from the map.' });
      return;
    }

    const data = { competitors: s.competitorsData, retail: s.retailData };
    const haveData = data.competitors.length > 0 || data.retail.length > 0;

    // 0.5) "lets narrow this to the cape town cbd" / "focus on sandton" → refocus the
    //      map there and re-run every active query against the new centre.
    //      "show burger places in cape town" → focus first, then run the query.
    const focusPlace = parseFocusRequest(message);
    const split = focusPlace ? { query: message, place: null } : splitLocation(message, haveData ? knownQueryTerms(data) : []);
    const place = focusPlace ?? split.place;
    let focused: Awaited<ReturnType<typeof geocodePlace>> = null;
    if (place) {
      focused = await geocodePlace(place);
      if (!focused) {
        s.addChat({ role: 'agent', text: geocoder ? `I couldn't find **${place}** — try a suburb or city name.` : 'Map libraries are still loading — try again in a moment.' });
        return;
      }
      s.setViewFocus({ center: focused.center, label: focused.label, radiusM: focused.radiusM });
      useMapStore.getState().setPreventAutoFrame(true);
      useMapStore.getState().setCameraTarget({ center: { ...focused.center, altitude: 4000 }, range: focused.range, tilt: 25, heading: 0, roll: 0 });
      // Every active query layer now follows the new focus.
      const st = usePlannerStore.getState();
      const parts: string[] = [];
      for (const layer of st.queryLayers) {
        const rq = queryPlaces(layer.query, data, focused.center, focused.radiusM);
        if (!rq) continue;
        st.addQueryLayer({ label: layer.label, points: rq.points, query: layer.query, brand: rq.brand });
        parts.push(`**${rq.points.length}** ${layer.label} (${layer.colorName})`);
      }
      if (focusPlace) {
        const summary = parts.length ? ` Showing ${parts.join(', ')} there.` : ' Ask me to show places, e.g. “show all burger places”.';
        s.addChat({ role: 'agent', text: `Focused on **${focused.label}**.${summary}` });
        return;
      }
    }

    // 1) A query over your competitor / retail data ("show all burger places").
    //    Each query gets its own pin colour and stacks with earlier ones.
    const st = usePlannerStore.getState();
    const q = haveData ? queryPlaces(split.query, data, st.viewCenter, st.viewRadiusM ?? Infinity) : null;
    if (q) {
      const layer = s.addQueryLayer({ label: q.label, points: q.points, query: split.query, brand: q.brand });
      // Fly to the extent of the matched points (unless we just focused on a place).
      if (q.points.length && !focused) {
        const lat = q.points.reduce((a, p) => a + p.lat, 0) / q.points.length;
        const lng = q.points.reduce((a, p) => a + p.lng, 0) / q.points.length;
        useMapStore.getState().setPreventAutoFrame(true);
        useMapStore.getState().setCameraTarget({ center: { lat, lng, altitude: 4000 }, range: st.viewCenter ? 9000 : 60000, tilt: 25, heading: 0, roll: 0 });
      }
      const brands = q.topBrands.map(([b, n]) => `${b} (${n})`).join(', ');
      const near = st.suburb || st.viewLabel;
      const where = near ? ` near ${near}` : ' (nationwide — say “focus on Sandton” or pick a suburb to narrow it)';
      const others = usePlannerStore.getState().queryLayers.filter(l => l.label !== layer.label);
      const alongside = others.length ? ` Still showing ${others.map(l => `${l.label} (${l.colorName})`).join(', ')}; say "clear the map" to remove them.` : '';
      s.addChat({ role: 'agent', text: `Showing **${q.points.length}** of ${q.total} ${q.label}${where} as **${layer.colorName}** pins.${brands ? ` Top brands: ${brands}.` : ''}${alongside}` });
      return;
    }

    // Competitor / retail outlets + layers around the current focus, for both question paths.
    const mapContext = () => {
      const cur = usePlannerStore.getState();
      const center = focused?.center ?? cur.viewCenter;
      const radiusM = focused?.radiusM ?? cur.viewRadiusM ?? 6000;
      const focusLabel = focused?.label ?? cur.viewLabel ?? (cur.suburb ? `${cur.suburb}, ${cur.city}` : null);
      return {
        brand: cur.brand,
        focus: center && focusLabel ? { label: focusLabel, center, radiusM } : null,
        layers: cur.queryLayers.map(l => {
          const rq = queryPlaces(l.query, data, null);
          return { label: l.label, colorName: l.colorName, count: l.points.length, total: rq?.total ?? l.points.length, topBrands: rq?.topBrands ?? [], sample: nearby(l.points, center, 12) };
        }),
        nearbyCompetitors: center ? nearby(data.competitors, center, 60, radiusM) : [],
        nearbyRetail: center ? nearby(data.retail, center, 30, radiusM) : [],
        existingStores: cur.existingStores,
        dataset: haveData ? datasetSummary(data) : undefined,
        history: cur.chat.slice(0, -1),
      };
    };

    // 2) A question about the current ranking → answer it without touching the ranking
    if (s.features.length && classifyIntent(message) === 'question') {
      s.setStatus('reasoning');
      s.setChatActivity('answering');
      try {
        const text = await answerQuestion(
          { brand: s.brand, suburb: s.suburb, features: s.features, weights: s.weights, result: s.result, history: s.chat.slice(0, -1), map: mapContext() },
          split.query,
        );
        const lead = focused && !focusPlace ? `Focused on **${focused.label}**. ` : '';
        s.addChat({ role: 'agent', text: lead + text });
      } catch (e: any) {
        s.addChat({ role: 'agent', text: `Sorry — I couldn't answer that: ${e?.message ?? 'unknown error'}` });
      } finally {
        s.setStatus('done');
        s.setChatActivity(null);
      }
      return;
    }

    // 3) An instruction → re-rank the current candidate sites
    if (s.features.length) { await doRerank(message); return; }

    // 4) Anything else → an ad-hoc answer from the competitor / retail data around
    //    the current focus ("where would a Debonairs work in Sea Point?").
    const cur = usePlannerStore.getState();
    s.setStatus('reasoning');
    s.setChatActivity('answering');
    try {
      const text = await answerMapQuestion(mapContext(), split.query);
      const lead = focused && !focusPlace ? `Focused on **${focused.label}**. ` : '';
      s.addChat({ role: 'agent', text: lead + text });
    } catch (e: any) {
      s.addChat({
        role: 'agent',
        text: `Sorry — I couldn't answer that (${e?.message ?? 'unknown error'}). I can map your data — try **“show all burger places”** or **“where are the KFCs”**, narrow it with **“focus on Cape Town CBD”**, or set a suburb and hit **Find sites** for a scored ranking.`,
      });
    } finally {
      usePlannerStore.getState().setStatus(cur.features.length ? 'done' : 'idle');
      usePlannerStore.getState().setChatActivity(null);
    }
  }, [doRerank, geocodePlace, geocoder]);

  return <Ctx.Provider value={{ placesLib, geocoder, runAnalysis, ask, rerankWithWeights }}>{children}</Ctx.Provider>;
};

export const usePlanner = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('usePlanner must be used within PlannerProvider');
  return c;
};

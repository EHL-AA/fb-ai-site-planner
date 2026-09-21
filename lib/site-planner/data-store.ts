import { create } from 'zustand';
import { brandColor } from './brand-colors';
import { useMapStore } from '@/lib/state';
import { PlaceRec } from './places-data';
import {
  CompetitorRecord, StoreRecord, DemographicRecord,
  CandidateNode, FeatureVector, RankedResult, ScoringWeights, DEFAULT_WEIGHTS,
  SuburbSelection,
} from './types';

export type AnalysisStatus = 'idle' | 'detecting' | 'enriching' | 'reasoning' | 'done' | 'error';
/** What the chat is doing right now, for the status line under the thread. */
export type ChatActivity = 'answering' | 'reranking' | null;

/** True while an analysis run is in flight and chat should be blocked. */
export function isAnalysisBusy(status: AnalysisStatus): boolean {
  return status === 'detecting' || status === 'enriching' || status === 'reasoning';
}
export interface ChatMessage { role: 'user' | 'agent'; text: string; }
export interface DataLayers { existing: boolean; competitors: boolean; retail: boolean; }
/** A chat "show me …" result plotted on the map. Each layer keeps its own colour
 *  so successive queries (burger places, then KFCs) stay distinguishable. */
export interface QueryLayer { label: string; points: PlaceRec[]; color: string; colorName: string; /** the original chat request, re-run when the map is refocused */ query: string; /** single brand the layer shows, if any (drives brand colour + pin initial) */ brand?: string; }

/** Distinct pin colours for successive chat queries; chosen to read on the light
 *  roadmap and not clash with the fixed data layers (green / red / blue) or the
 *  gold / orange / grey ranked pins. Cycles when exhausted. */
export const QUERY_PALETTE: { color: string; name: string }[] = [
  { color: '#8e5cf6', name: 'purple' },
  { color: '#14b8a6', name: 'teal' },
  { color: '#ec4899', name: 'pink' },
  { color: '#f5a524', name: 'gold' },
  { color: '#4f46e5', name: 'indigo' },
  { color: '#84cc16', name: 'lime' },
];
export const MAX_QUERY_LAYERS = QUERY_PALETTE.length;
export interface LatLngLite { lat: number; lng: number; }

interface PlannerState {
  brand: string;
  suburb: string;
  city: string;
  selection: SuburbSelection | null;
  weights: ScoringWeights;

  competitors: CompetitorRecord[];
  stores: StoreRecord[];
  demographics: DemographicRecord[];
  uploadErrors: string[];

  candidates: CandidateNode[];
  features: FeatureVector[];
  result: RankedResult | null;
  status: AnalysisStatus;
  errorMessage: string | null;
  selectedSiteId: string | null;
  chat: ChatMessage[];
  apiCalls: number;
  chatActivity: ChatActivity;

  // Bundled Famous Brands datasets + map layers
  competitorsData: PlaceRec[];
  retailData: PlaceRec[];
  existingStores: PlaceRec[];   // selected brand's existing outlets (from Places)
  dataLayers: DataLayers;
  queryLayers: QueryLayer[];
  viewCenter: LatLngLite | null;
  /** Human label for a chat-focused area ("Cape Town City Centre"); null when the focus came from suburb selection. */
  viewLabel: string | null;
  /** Radius (m) for chat-focused queries; null = nearest 300 without a cut-off. */
  viewRadiusM: number | null;

  setBrand: (b: string) => void;
  setSelection: (s: SuburbSelection | null) => void;
  setWeights: (w: ScoringWeights) => void;
  setCompetitors: (r: CompetitorRecord[]) => void;
  setStores: (r: StoreRecord[]) => void;
  setDemographics: (r: DemographicRecord[]) => void;
  addUploadErrors: (e: string[]) => void;
  setCandidates: (c: CandidateNode[]) => void;
  setFeatures: (f: FeatureVector[]) => void;
  setResult: (r: RankedResult | null) => void;
  setStatus: (s: AnalysisStatus) => void;
  setApiCalls: (n: number) => void;
  setChatActivity: (a: ChatActivity) => void;
  setError: (m: string | null) => void;
  selectSite: (id: string | null) => void;
  addChat: (m: ChatMessage) => void;
  setPlacesData: (competitors: PlaceRec[], retail: PlaceRec[]) => void;
  setExistingStores: (s: PlaceRec[]) => void;
  toggleLayer: (key: keyof DataLayers) => void;
  /** Adds a query layer with the next free colour; a repeated label replaces the
   *  earlier layer in place (keeping its colour). Returns the stored layer. */
  addQueryLayer: (q: { label: string; points: PlaceRec[]; query: string; brand?: string }) => QueryLayer;
  removeQueryLayer: (label: string) => void;
  clearQueryLayers: () => void;
  setViewCenter: (c: LatLngLite | null) => void;
  setViewFocus: (f: { center: LatLngLite; label: string; radiusM: number } | null) => void;
  reset: () => void;
}

export const usePlannerStore = create<PlannerState>(set => ({
  brand: 'Steers',
  suburb: '',
  city: '',
  selection: null,
  weights: DEFAULT_WEIGHTS,
  competitors: [],
  stores: [],
  demographics: [],
  uploadErrors: [],
  candidates: [],
  features: [],
  result: null,
  status: 'idle',
  errorMessage: null,
  selectedSiteId: null,
  chat: [],
  apiCalls: 0,
  chatActivity: null,
  competitorsData: [],
  retailData: [],
  existingStores: [],
  dataLayers: { existing: true, competitors: false, retail: false },
  queryLayers: [],
  viewCenter: null,
  viewLabel: null,
  viewRadiusM: null,

  setBrand: brand => set({ brand }),
  setSelection: selection => set({ selection, city: selection?.city ?? '', suburb: selection?.suburb ?? '' }),
  setWeights: weights => set({ weights }),
  setCompetitors: competitors => set({ competitors }),
  setStores: stores => set({ stores }),
  setDemographics: demographics => set({ demographics }),
  addUploadErrors: e => set(s => ({ uploadErrors: [...s.uploadErrors, ...e] })),
  setCandidates: candidates => set({ candidates }),
  setFeatures: features => set({ features }),
  setResult: result => set({ result }),
  setStatus: status => set({ status }),
  setApiCalls: apiCalls => set({ apiCalls }),
  setChatActivity: chatActivity => set({ chatActivity }),
  setError: errorMessage => set({ errorMessage }),
  selectSite: selectedSiteId => set({ selectedSiteId }),
  addChat: m => set(s => ({ chat: [...s.chat, m] })),
  setPlacesData: (competitorsData, retailData) => set({ competitorsData, retailData }),
  setExistingStores: existingStores => set({ existingStores }),
  toggleLayer: key => set(s => ({ dataLayers: { ...s.dataLayers, [key]: !s.dataLayers[key] } })),
  addQueryLayer: q => {
    let stored: QueryLayer | undefined;
    set(s => {
      const existing = s.queryLayers.find(l => l.label === q.label);
      if (existing) {
        stored = { ...existing, points: q.points, query: q.query, brand: q.brand ?? existing.brand };
        return { queryLayers: s.queryLayers.map(l => (l === existing ? stored! : l)) };
      }
      // Oldest layer drops off once every palette colour is in use.
      const kept = s.queryLayers.slice(-(MAX_QUERY_LAYERS - 1));
      const used = new Set(kept.map(l => l.color));
      // A single named brand gets its brand colour (KFC red…) unless another
      // active layer already uses that exact colour; otherwise the next palette colour.
      const bc = brandColor(q.brand);
      const pick = bc && !used.has(bc.color)
        ? bc
        : (QUERY_PALETTE.find(c => !used.has(c.color)) ?? QUERY_PALETTE[kept.length % QUERY_PALETTE.length]);
      stored = { label: q.label, points: q.points, query: q.query, brand: q.brand, color: pick.color, colorName: pick.name };
      return { queryLayers: [...kept, stored] };
    });
    return stored!;
  },
  removeQueryLayer: label => set(s => ({ queryLayers: s.queryLayers.filter(l => l.label !== label) })),
  clearQueryLayers: () => set({ queryLayers: [] }),
  setViewCenter: viewCenter => set({ viewCenter, viewLabel: null, viewRadiusM: null }),
  setViewFocus: f => set(f ? { viewCenter: f.center, viewLabel: f.label, viewRadiusM: f.radiusM } : { viewCenter: null, viewLabel: null, viewRadiusM: null }),
  reset: () => {
    useMapStore.getState().setMarkers([]);
    set({ candidates: [], features: [], result: null, status: 'idle', errorMessage: null, selectedSiteId: null, chat: [], uploadErrors: [], queryLayers: [], apiCalls: 0, chatActivity: null, selection: null, city: '', suburb: '', viewCenter: null, viewLabel: null, viewRadiusM: null, existingStores: [], weights: DEFAULT_WEIGHTS });
  },
}));

export const FAMOUS_BRANDS = ['Steers', 'Debonairs Pizza', 'Wimpy', 'Mugg & Bean', 'Fishaways', 'Milky Lane'];

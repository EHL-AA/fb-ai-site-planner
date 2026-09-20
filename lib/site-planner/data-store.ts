import { create } from 'zustand';
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
export interface QueryLayer { label: string; points: PlaceRec[]; }
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
  queryLayer: QueryLayer | null;
  viewCenter: LatLngLite | null;

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
  setQueryLayer: (q: QueryLayer | null) => void;
  setViewCenter: (c: LatLngLite | null) => void;
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
  queryLayer: null,
  viewCenter: null,

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
  setQueryLayer: queryLayer => set({ queryLayer }),
  setViewCenter: viewCenter => set({ viewCenter }),
  reset: () => {
    useMapStore.getState().setMarkers([]);
    set({ candidates: [], features: [], result: null, status: 'idle', errorMessage: null, selectedSiteId: null, chat: [], uploadErrors: [], queryLayer: null, apiCalls: 0, chatActivity: null, selection: null, city: '', suburb: '', viewCenter: null, existingStores: [], weights: DEFAULT_WEIGHTS });
  },
}));

export const FAMOUS_BRANDS = ['Steers', 'Debonairs Pizza', 'Wimpy', 'Mugg & Bean', 'Fishaways', 'Milky Lane'];

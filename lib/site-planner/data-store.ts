import { create } from 'zustand';
import { useMapStore } from '@/lib/state';
import { PlaceRec } from './places-data';
import {
  CompetitorRecord, StoreRecord, DemographicRecord,
  CandidateNode, FeatureVector, RankedResult, ScoringWeights, DEFAULT_WEIGHTS,
} from './types';

export type AnalysisStatus = 'idle' | 'detecting' | 'reasoning' | 'done' | 'error';
export interface ChatMessage { role: 'user' | 'agent'; text: string; }
export interface DataLayers { competitors: boolean; retail: boolean; }
export interface QueryLayer { label: string; points: PlaceRec[]; }
export interface LatLngLite { lat: number; lng: number; }

interface PlannerState {
  brand: string;
  suburb: string;
  city: string;
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

  // Bundled Famous Brands datasets + map layers
  competitorsData: PlaceRec[];
  retailData: PlaceRec[];
  dataLayers: DataLayers;
  queryLayer: QueryLayer | null;
  viewCenter: LatLngLite | null;

  setBrand: (b: string) => void;
  setLocation: (city: string, suburb: string) => void;
  setWeights: (w: ScoringWeights) => void;
  setCompetitors: (r: CompetitorRecord[]) => void;
  setStores: (r: StoreRecord[]) => void;
  setDemographics: (r: DemographicRecord[]) => void;
  addUploadErrors: (e: string[]) => void;
  setCandidates: (c: CandidateNode[]) => void;
  setFeatures: (f: FeatureVector[]) => void;
  setResult: (r: RankedResult | null) => void;
  setStatus: (s: AnalysisStatus) => void;
  setError: (m: string | null) => void;
  selectSite: (id: string | null) => void;
  addChat: (m: ChatMessage) => void;
  setPlacesData: (competitors: PlaceRec[], retail: PlaceRec[]) => void;
  toggleLayer: (key: keyof DataLayers) => void;
  setQueryLayer: (q: QueryLayer | null) => void;
  setViewCenter: (c: LatLngLite | null) => void;
  reset: () => void;
}

export const usePlannerStore = create<PlannerState>(set => ({
  brand: 'Steers',
  suburb: '',
  city: '',
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
  competitorsData: [],
  retailData: [],
  dataLayers: { competitors: false, retail: false },
  queryLayer: null,
  viewCenter: null,

  setBrand: brand => set({ brand }),
  setLocation: (city, suburb) => set({ city, suburb }),
  setWeights: weights => set({ weights }),
  setCompetitors: competitors => set({ competitors }),
  setStores: stores => set({ stores }),
  setDemographics: demographics => set({ demographics }),
  addUploadErrors: e => set(s => ({ uploadErrors: [...s.uploadErrors, ...e] })),
  setCandidates: candidates => set({ candidates }),
  setFeatures: features => set({ features }),
  setResult: result => set({ result }),
  setStatus: status => set({ status }),
  setError: errorMessage => set({ errorMessage }),
  selectSite: selectedSiteId => set({ selectedSiteId }),
  addChat: m => set(s => ({ chat: [...s.chat, m] })),
  setPlacesData: (competitorsData, retailData) => set({ competitorsData, retailData }),
  toggleLayer: key => set(s => ({ dataLayers: { ...s.dataLayers, [key]: !s.dataLayers[key] } })),
  setQueryLayer: queryLayer => set({ queryLayer }),
  setViewCenter: viewCenter => set({ viewCenter }),
  reset: () => {
    useMapStore.getState().setMarkers([]);
    set({ candidates: [], features: [], result: null, status: 'idle', errorMessage: null, selectedSiteId: null, chat: [], uploadErrors: [], queryLayer: null });
  },
}));

export const FAMOUS_BRANDS = ['Steers', 'Debonairs Pizza', 'Wimpy', 'Mugg & Bean', 'Fishaways', 'Milky Lane'];

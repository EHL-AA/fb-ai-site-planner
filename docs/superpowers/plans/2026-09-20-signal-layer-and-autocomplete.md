# Signal Layer + Suburb Autocomplete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace free-text City/Suburb with a Places autocomplete, and replace the single review-density traffic proxy with five provenance-tagged signal sources (Routes congestion, Places Aggregate density, retail-mix affluence, census density, pluggable foot traffic) that feed the Gemini ranking and the UI.

**Architecture:** A `lib/site-planner/signals/` package where every source implements `SignalSource<K>` and returns one `Signal<T>` per candidate node, never throwing (failures become `unavailable`). `gatherSignals` runs them with `Promise.allSettled`; `composeFeatures` blends available signals into the existing `FeatureVector` scores and attaches a `signals` block plus a flattened `sources` list. The prompt and the detail card both render that provenance. Autocomplete replaces geocoding on the entry path.

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, Vitest 3, Zustand 5, `@vis.gl/react-google-maps` (Places JS library: `AutocompleteSuggestion`, `Place.fetchFields`), Google Routes API v2 (REST), Google Places Aggregate API v1 (REST), Gemini 3.8 Flash via `@google/genai`.

**Spec:** `docs/superpowers/specs/2026-09-20-signal-layer-and-autocomplete-design.md`

## Global Constraints

- Client-only; keys are injected at build time via `vite.config.ts` `define` (`process.env.MAPS_API_KEY`, `process.env.GEMINI_API_KEY`). No new backend.
- Every signal source's `enrich` **must never reject**; it returns `unavailable` signals instead.
- No signal failure aborts a run. Only node detection (no POIs) or the reasoning call can fail a run.
- Use `haversineMeters` from `lib/site-planner/geo.ts` for all distances.
- Tests are Vitest, pure logic only, with `fetch` injected via `SignalContext.fetchImpl`. Do not call real APIs from tests.
- Routes leg: 4 legs × 1500 m (N, E, S, W) + 1 leg from suburb centre, departure next weekday 17:30 `Africa/Johannesburg` (15:30 UTC), `routingPreference: 'TRAFFIC_AWARE'`, `travelMode: 'DRIVE'`, field mask `routes.duration,routes.staticDuration`.
- Congestion index = `clamp((meanRatio − 1) / 0.6, 0, 1) × 100` where `ratio = duration / staticDuration`.
- Places Aggregate: `INSIGHT_COUNT`, 1 km circle, one type per request. Types: `corporate_office, school, university, gym, supermarket, bar, restaurant, cafe`.
- Retail mix: premium = `Woolworths, Checkers`; value = `Boxer, Usave, Shoprite`; 2 km radius; `< 2` anchors → unavailable.
- Blend weights (renormalised over available signals): traffic = footTraffic 0.40, congestion 0.20, density 0.20, reviewDensity 0.20; demographics = affluence 0.60, census density 0.40.
- Commit after every task with a `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` trailer. Work on branch `feat/signal-layer-autocomplete`.
- Run `npx vitest run` before each commit; all tests must pass.

---

## File map

| Path | Responsibility |
|---|---|
| `lib/site-planner/types.ts` | Add `SuburbSelection`, `FootTrafficRecord`, `SourceRow`; extend `FeatureVector` with optional `signals`, `sources`. |
| `lib/site-planner/signals/types.ts` | `Provenance`, `Signal<T>`, constructors, `CallBudget`, `SignalContext`, `NodeSignals`, `SignalSource<K>`. |
| `lib/site-planner/signals/routes-traffic.ts` | Routes API congestion + drive-time-from-centre source. |
| `lib/site-planner/signals/places-density.ts` | Places Aggregate daytime/evening density source. |
| `lib/site-planner/signals/retail-mix.ts` | Affluence proxy from bundled retail anchors. |
| `lib/site-planner/signals/census.ts` | Nearest-ward census join from `public/data/census-wards.json`. |
| `lib/site-planner/signals/foot-traffic.ts` | `FootTrafficProvider` interface, null + CSV providers, source. |
| `lib/site-planner/signals/index.ts` | `gatherSignals` orchestration, `ALL_SOURCES`. |
| `lib/site-planner/compose-features.ts` | Blend signals into `FeatureVector` scores; attach `signals` + `sources`. |
| `lib/site-planner/suburb-autocomplete.ts` | Places autocomplete wrapper → `SuburbSelection`. |
| `lib/site-planner/csv.ts` | Add `parseFootTraffic`. |
| `lib/site-planner/node-detection.ts` | Accept `viewport` instead of geocoding. |
| `lib/site-planner/reasoning.ts` | Provenance block in prompt + system instruction. |
| `lib/site-planner/data-store.ts` | `selection`, `footTraffic`, `apiCalls`. |
| `lib/site-planner/display.ts` | Expose `signals`/`sources` on `DisplaySite`. |
| `components/site-planner/SuburbSearch.tsx` | Autocomplete input + dropdown. |
| `components/site-planner/SitesSidebar.tsx` | Swap City/Suburb inputs for `SuburbSearch`. |
| `components/site-planner/DetailCard.tsx` | Signal stats + "Data sources" section. |
| `components/site-planner/MapChrome.tsx` | API call count. |
| `components/site-planner/DataUpload.tsx` | Foot-traffic CSV row. |
| `contexts/PlannerContext.tsx` | New `runAnalysis(selection)`; wire `gatherSignals` + `composeFeatures`. |
| `App.tsx` | Pass `mapsApiKey` to `PlannerProvider`. |
| `scripts/prepare-census.mjs` | Offline: SuperWEB2 CSV + centroids CSV → `census-wards.json`. |
| `README.md` | Data sources + census prep section. |

---

### Task 1: Signal primitives

**Files:**
- Create: `lib/site-planner/signals/types.ts`
- Test: `lib/site-planner/signals/types.test.ts`
- Modify: `lib/site-planner/types.ts`

**Interfaces:**
- Produces (used by every later task):

```ts
export type Provenance = 'measured' | 'proxy' | 'unavailable';
export interface Signal<T> { value: T; provenance: Provenance; source: string; note?: string }
export function measured<T>(value: T, source: string, note?: string): Signal<T>;
export function proxy<T>(value: T, source: string, note?: string): Signal<T>;
export function unavailable<T>(source: string, note: string): Signal<T | null>;
export class CallBudget { constructor(max?: number); take(api: string): boolean; readonly used: number; readonly byApi: Readonly<Record<string, number>> }
export interface SignalContext { selection: SuburbSelection; mapsApiKey: string; fetchImpl: typeof fetch; budget: CallBudget; now: Date; retail: PlaceRec[]; footTrafficRows: FootTrafficRecord[] }
export interface NodeSignals { congestion; density; affluence; census; footTraffic }   // each Signal<X | null>
export interface SignalSource<K extends keyof NodeSignals> { id: K; label: string; enrich(nodes: CandidateNode[], ctx: SignalContext): Promise<NodeSignals[K][]> }
```

- [ ] **Step 1: Add shared types to `lib/site-planner/types.ts`**

Append after `DEFAULT_WEIGHTS`:

```ts
import type { Bounds } from './geo';

/** Result of picking a suburb from Places autocomplete. */
export interface SuburbSelection {
  placeId: string;
  suburb: string;
  city: string;
  center: LatLng;
  viewport: Bounds;
}

/** One row of a vendor foot-traffic export. */
export interface FootTrafficRecord { lat: number; lng: number; dailyVisits: number; peakHour?: number; }

/** Flattened provenance row for UI + prompt. */
export interface SourceRow { label: string; provenance: 'measured' | 'proxy' | 'unavailable'; note?: string; }
```

And extend `FeatureVector` (keep every existing field; add two optional ones at the end):

```ts
  /** Provenance-tagged signals gathered by lib/site-planner/signals (absent in legacy paths/tests). */
  signals?: import('./signals/types').NodeSignals;
  /** Flattened, de-duplicated source list for UI + prompt. */
  sources?: SourceRow[];
```

Move the `import { LatLng } from './geo';` line to also import `Bounds`: `import { LatLng, Bounds } from './geo';` and drop the separate `import type` line.

- [ ] **Step 2: Write the failing test**

`lib/site-planner/signals/types.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { measured, proxy, unavailable, CallBudget } from './types';

describe('signal constructors', () => {
  it('tag provenance and carry source/note', () => {
    expect(measured(5, 'Routes')).toEqual({ value: 5, provenance: 'measured', source: 'Routes', note: undefined });
    expect(proxy(5, 'Reviews', 'n')).toMatchObject({ provenance: 'proxy', note: 'n' });
    expect(unavailable('X', 'off')).toEqual({ value: null, provenance: 'unavailable', source: 'X', note: 'off' });
  });
});

describe('CallBudget', () => {
  it('counts calls per API and refuses past max', () => {
    const b = new CallBudget(2);
    expect(b.take('routes')).toBe(true);
    expect(b.take('aggregate')).toBe(true);
    expect(b.take('routes')).toBe(false);
    expect(b.used).toBe(2);
    expect(b.byApi).toEqual({ routes: 1, aggregate: 1 });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run lib/site-planner/signals/types.test.ts`
Expected: FAIL — cannot resolve `./types`.

- [ ] **Step 4: Implement `lib/site-planner/signals/types.ts`**

```ts
import { CandidateNode, SuburbSelection, FootTrafficRecord } from '../types';
import { PlaceRec } from '../places-data';

export type Provenance = 'measured' | 'proxy' | 'unavailable';

export interface Signal<T> {
  value: T;
  provenance: Provenance;
  /** Human label, e.g. "Google Routes API (live traffic)". */
  source: string;
  /** Short caveat shown in the UI and the prompt. */
  note?: string;
}

export function measured<T>(value: T, source: string, note?: string): Signal<T> {
  return { value, provenance: 'measured', source, note };
}
export function proxy<T>(value: T, source: string, note?: string): Signal<T> {
  return { value, provenance: 'proxy', source, note };
}
export function unavailable<T>(source: string, note: string): Signal<T | null> {
  return { value: null, provenance: 'unavailable', source, note };
}

/** Counts external API calls for one analysis run and caps them. */
export class CallBudget {
  private counts: Record<string, number> = {};
  private total = 0;
  constructor(readonly max = 250) {}
  /** Reserve one call. Returns false (and does not count) when the budget is spent. */
  take(api: string): boolean {
    if (this.total >= this.max) return false;
    this.total++;
    this.counts[api] = (this.counts[api] ?? 0) + 1;
    return true;
  }
  get used(): number { return this.total; }
  get byApi(): Readonly<Record<string, number>> { return { ...this.counts }; }
}

export interface SignalContext {
  selection: SuburbSelection;
  mapsApiKey: string;
  fetchImpl: typeof fetch;
  budget: CallBudget;
  now: Date;
  /** Bundled retail anchors (public/data/retail.json). */
  retail: PlaceRec[];
  /** Uploaded vendor foot-traffic rows (may be empty). */
  footTrafficRows: FootTrafficRecord[];
}

export interface CongestionSignal { index0to100: number; driveMinutesFromCentre: number | null; }
export interface DensitySignal { daytimeIndex0to100: number; eveningIndex0to100: number; counts: Record<string, number>; }
export interface AffluenceSignal { index0to100: number; premiumAnchors: number; valueAnchors: number; }
export interface CensusSignal { ward: string; population: number; households: number; densityPerKm2: number; }
export interface FootTrafficSignal { dailyVisits: number; peakHour?: number; }

export interface NodeSignals {
  congestion: Signal<CongestionSignal | null>;
  density: Signal<DensitySignal | null>;
  affluence: Signal<AffluenceSignal | null>;
  census: Signal<CensusSignal | null>;
  footTraffic: Signal<FootTrafficSignal | null>;
}

export interface SignalSource<K extends keyof NodeSignals> {
  id: K;
  label: string;
  /** One signal per node, same order. MUST NOT reject — return `unavailable` instead. */
  enrich(nodes: CandidateNode[], ctx: SignalContext): Promise<NodeSignals[K][]>;
}

/** Clamp to [0, 100] and round. */
export function clamp100(n: number): number {
  return Math.round(Math.max(0, Math.min(100, n)));
}

/** log1p-scale `value` against `max` into 0..100 (0 when max <= 0). */
export function logScore(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  return clamp100((Math.log1p(value) / Math.log1p(max)) * 100);
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run`
Expected: all pass (existing 23 + 2 new).

- [ ] **Step 6: Commit**

```bash
git add lib/site-planner/types.ts lib/site-planner/signals/types.ts lib/site-planner/signals/types.test.ts
git commit -m "feat(signals): signal primitives, CallBudget, SuburbSelection type

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Suburb autocomplete library

**Files:**
- Create: `lib/site-planner/suburb-autocomplete.ts`
- Test: `lib/site-planner/suburb-autocomplete.test.ts`

**Interfaces:**
- Consumes: `SuburbSelection` (Task 1).
- Produces:

```ts
export interface SuburbSuggestion { placeId: string; mainText: string; secondaryText: string; toPlace: () => PlaceLike }
export function cityFromAddressComponents(components: AddressComponentLike[]): string;
export function fetchSuburbSuggestions(placesLib: PlacesLibLike, input: string, token: unknown): Promise<SuburbSuggestion[]>;
export function resolveSuburb(s: SuburbSuggestion): Promise<SuburbSelection>;
export function newSessionToken(placesLib: PlacesLibLike): unknown;
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { cityFromAddressComponents, resolveSuburb, fetchSuburbSuggestions } from './suburb-autocomplete';

describe('cityFromAddressComponents', () => {
  it('prefers locality, then admin level 2, then admin level 1', () => {
    expect(cityFromAddressComponents([
      { types: ['sublocality'], longText: 'Rosebank' },
      { types: ['locality', 'political'], longText: 'Johannesburg' },
      { types: ['administrative_area_level_2'], longText: 'City of Johannesburg' },
    ])).toBe('Johannesburg');
    expect(cityFromAddressComponents([
      { types: ['administrative_area_level_2'], longText: 'City of Cape Town' },
      { types: ['administrative_area_level_1'], longText: 'Western Cape' },
    ])).toBe('City of Cape Town');
    expect(cityFromAddressComponents([{ types: ['administrative_area_level_1'], longText: 'Gauteng' }])).toBe('Gauteng');
    expect(cityFromAddressComponents([])).toBe('');
  });
});

describe('fetchSuburbSuggestions', () => {
  it('maps predictions and restricts to SA suburb types', async () => {
    let seen: any;
    const placesLib = {
      AutocompleteSuggestion: {
        fetchAutocompleteSuggestions: async (req: any) => {
          seen = req;
          return { suggestions: [{ placePrediction: { placeId: 'p1', mainText: { text: 'Rosebank' }, secondaryText: { text: 'Johannesburg, South Africa' }, toPlace: () => ({}) } }] };
        },
      },
    };
    const out = await fetchSuburbSuggestions(placesLib as any, 'Rose', 'tok');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ placeId: 'p1', mainText: 'Rosebank', secondaryText: 'Johannesburg, South Africa' });
    expect(seen.includedRegionCodes).toEqual(['za']);
    expect(seen.includedPrimaryTypes).toEqual(['sublocality', 'locality', 'neighborhood']);
    expect(seen.sessionToken).toBe('tok');
  });
  it('returns [] for input under 2 chars without calling the API', async () => {
    const placesLib = { AutocompleteSuggestion: { fetchAutocompleteSuggestions: async () => { throw new Error('should not call'); } } };
    expect(await fetchSuburbSuggestions(placesLib as any, 'R', 'tok')).toEqual([]);
  });
});

describe('resolveSuburb', () => {
  it('fetches fields and builds a SuburbSelection', async () => {
    const place = {
      fetchFields: async (_: any) => {},
      displayName: 'Rosebank',
      location: { lat: () => -26.146, lng: () => 28.041 },
      viewport: { toJSON: () => ({ north: -26.13, south: -26.16, east: 28.06, west: 28.02 }) },
      addressComponents: [{ types: ['locality'], longText: 'Johannesburg' }],
    };
    const sel = await resolveSuburb({ placeId: 'p1', mainText: 'Rosebank', secondaryText: '', toPlace: () => place as any });
    expect(sel).toEqual({
      placeId: 'p1', suburb: 'Rosebank', city: 'Johannesburg',
      center: { lat: -26.146, lng: 28.041 },
      viewport: { north: -26.13, south: -26.16, east: 28.06, west: 28.02 },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/site-planner/suburb-autocomplete.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/site-planner/suburb-autocomplete.ts`**

```ts
import { SuburbSelection } from './types';

/** Minimal structural types so this module is testable without google.maps typings. */
export interface AddressComponentLike { types: string[]; longText?: string | null; }
export interface PlaceLike {
  fetchFields(opts: { fields: string[] }): Promise<unknown>;
  displayName?: string | null;
  location?: { lat(): number; lng(): number } | null;
  viewport?: { toJSON(): { north: number; south: number; east: number; west: number } } | null;
  addressComponents?: AddressComponentLike[] | null;
}
interface PredictionLike {
  placeId: string;
  mainText?: { text: string } | null;
  secondaryText?: { text: string } | null;
  toPlace(): PlaceLike;
}
export interface PlacesLibLike {
  AutocompleteSuggestion: { fetchAutocompleteSuggestions(req: Record<string, unknown>): Promise<{ suggestions: Array<{ placePrediction?: PredictionLike | null }> }> };
  AutocompleteSessionToken?: new () => unknown;
}

export interface SuburbSuggestion { placeId: string; mainText: string; secondaryText: string; toPlace: () => PlaceLike; }

const CITY_TYPES = ['locality', 'administrative_area_level_2', 'administrative_area_level_1'];

export function cityFromAddressComponents(components: AddressComponentLike[]): string {
  for (const t of CITY_TYPES) {
    const hit = components.find(c => c.types.includes(t) && c.longText);
    if (hit) return hit.longText as string;
  }
  return '';
}

export function newSessionToken(placesLib: PlacesLibLike): unknown {
  return placesLib.AutocompleteSessionToken ? new placesLib.AutocompleteSessionToken() : undefined;
}

export async function fetchSuburbSuggestions(placesLib: PlacesLibLike, input: string, token: unknown): Promise<SuburbSuggestion[]> {
  const q = input.trim();
  if (q.length < 2) return [];
  const { suggestions } = await placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
    input: q,
    includedRegionCodes: ['za'],
    includedPrimaryTypes: ['sublocality', 'locality', 'neighborhood'],
    sessionToken: token,
  });
  return suggestions
    .map(s => s.placePrediction)
    .filter((p): p is PredictionLike => !!p)
    .map(p => ({
      placeId: p.placeId,
      mainText: p.mainText?.text ?? '',
      secondaryText: p.secondaryText?.text ?? '',
      toPlace: () => p.toPlace(),
    }));
}

export async function resolveSuburb(s: SuburbSuggestion): Promise<SuburbSelection> {
  const place = s.toPlace();
  await place.fetchFields({ fields: ['location', 'viewport', 'addressComponents', 'displayName'] });
  if (!place.location || !place.viewport) throw new Error(`Could not resolve "${s.mainText}".`);
  return {
    placeId: s.placeId,
    suburb: place.displayName || s.mainText,
    city: cityFromAddressComponents(place.addressComponents ?? []),
    center: { lat: place.location.lat(), lng: place.location.lng() },
    viewport: place.viewport.toJSON(),
  };
}
```

- [ ] **Step 4: Run tests** — `npx vitest run` — Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add lib/site-planner/suburb-autocomplete.ts lib/site-planner/suburb-autocomplete.test.ts
git commit -m "feat: Places autocomplete wrapper for suburb selection

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Suburb search UI + viewport-driven detection

**Files:**
- Create: `components/site-planner/SuburbSearch.tsx`
- Modify: `components/site-planner/SitesSidebar.tsx` (state at ~line 84; form at ~lines 136-154)
- Modify: `lib/site-planner/data-store.ts`
- Modify: `lib/site-planner/node-detection.ts` (`DetectOptions`, `detectCommercialNodes`)
- Modify: `contexts/PlannerContext.tsx` (`runAnalysis`)
- Modify: `App.tsx` (`PlannerProvider` props)

**Interfaces:**
- Consumes: Task 2 exports; `SuburbSelection`.
- Produces: `runAnalysis(selection: SuburbSelection): Promise<void>`; store fields `selection: SuburbSelection | null`, `setSelection`; `detectCommercialNodes({ placesLib, center, viewport, ... })`; `PlannerProvider` prop `mapsApiKey: string`.

- [ ] **Step 1: Store — add selection**

In `data-store.ts` `PlannerState` add `selection: SuburbSelection | null;` and `setSelection: (s: SuburbSelection | null) => void;`. Import `SuburbSelection` from `./types`. Initial `selection: null`. Implement:

```ts
  setSelection: selection => set({ selection, city: selection?.city ?? '', suburb: selection?.suburb ?? '' }),
```

Keep `setLocation` (used by nothing after this task; delete it and its interface line).

- [ ] **Step 2: node-detection — take viewport, stop geocoding**

Replace `DetectOptions` and the top of `detectCommercialNodes`:

```ts
export interface DetectOptions {
  placesLib: google.maps.PlacesLibrary;
  center: LatLng;
  viewport: Bounds;
  gridSize?: number;        // sampling resolution (default 2 -> 4 Places calls)
  searchRadiusM?: number;   // per-point radius (default 1000)
  clusterRadiusM?: number;  // node merge radius (default 250)
  maxNodes?: number;        // top-N nodes to keep (default 8)
}
```

```ts
export async function detectCommercialNodes(opts: DetectOptions): Promise<CandidateNode[]> {
  const { placesLib, viewport: bounds } = opts;
  const gridSize = opts.gridSize ?? 2;
  const searchRadiusM = opts.searchRadiusM ?? 1000;
  const clusterRadiusM = opts.clusterRadiusM ?? 250;
  const maxNodes = opts.maxNodes ?? 8;
  // (delete the geocoder.geocode block and the `vp`/`bounds` lines; everything from `const seen = new Map` down is unchanged)
```

Remove `geocoder` from the destructure and the `Bounds` construction. `Bounds` and `LatLng` are already imported from `./geo`.

- [ ] **Step 3: PlannerContext — new runAnalysis**

Change the provider props to `{ children; placesLib; geocoder; mapsApiKey: string }` (geocoder stays for future CSV geocoding; it is no longer required by `runAnalysis`). Replace `runAnalysis`:

```ts
  const runAnalysis = useCallback(async (selection: SuburbSelection) => {
    const s = usePlannerStore.getState();
    if (!placesLib) { s.setError('Map libraries not ready yet.'); s.setStatus('error'); return; }
    s.setSelection(selection);
    s.setError(null);
    s.setStatus('detecting');
    try {
      const { center, viewport, suburb } = selection;
      s.setViewCenter(center);
      useMapStore.getState().setCameraTarget({
        center: { lat: center.lat, lng: center.lng, altitude: 5000 },
        range: 15000, tilt: 25, heading: 0, roll: 0,
      });

      const nodes = await detectCommercialNodes({ placesLib, center, viewport });
      if (!nodes.length) { s.setError(`No commercial nodes found in ${suburb}. Try a larger or busier suburb.`); s.setStatus('error'); return; }
      s.setCandidates(nodes);

      const existingStores = await findBrandStores(placesLib, s.brand, center);
      s.setExistingStores(existingStores);

      const competitors: CompetitorRecord[] = s.competitors.length
        ? s.competitors
        : s.competitorsData.map(p => ({ name: p.n, lat: p.lat, lng: p.lng, brand: p.b }));
      const stores: StoreRecord[] = [
        ...s.stores,
        ...existingStores.map(p => ({ name: p.n, lat: p.lat, lng: p.lng })),
      ];

      const features = computeFeatures(nodes, { competitors, stores, demographics: s.demographics }, suburb);
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
  }, [placesLib]);
```

Update `PlannerContextValue.runAnalysis` type to `(selection: SuburbSelection) => Promise<void>` and import `SuburbSelection` from `@/lib/site-planner/types`. (Task 9 replaces `computeFeatures` here with `gatherSignals` + `composeFeatures`; `mapsApiKey` is accepted now so App.tsx changes once.)

- [ ] **Step 4: App.tsx — pass the key**

```tsx
<PlannerProvider placesLib={placesLib} geocoder={geocoder} mapsApiKey={MAPS_API_KEY ?? ''}>
```

- [ ] **Step 5: SuburbSearch component**

`components/site-planner/SuburbSearch.tsx`:

```tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon';
import { usePlanner } from '@/contexts/PlannerContext';
import { fetchSuburbSuggestions, newSessionToken, resolveSuburb, SuburbSuggestion } from '@/lib/site-planner/suburb-autocomplete';
import { SuburbSelection } from '@/lib/site-planner/types';

interface Props {
  disabled?: boolean;
  value: SuburbSelection | null;
  onSelect: (s: SuburbSelection | null) => void;
}

export default function SuburbSearch({ disabled, value, onSelect }: Props) {
  const { placesLib } = usePlanner();
  const [text, setText] = useState(value ? `${value.suburb}, ${value.city}` : '');
  const [items, setItems] = useState<SuburbSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const token = useRef<unknown>(undefined);
  const timer = useRef<number | undefined>(undefined);
  const lib = placesLib as any;

  useEffect(() => { if (value) setText(`${value.suburb}, ${value.city}`); }, [value]);

  const search = (q: string) => {
    window.clearTimeout(timer.current);
    if (!lib) return;
    timer.current = window.setTimeout(async () => {
      try {
        if (!token.current) token.current = newSessionToken(lib);
        const out = await fetchSuburbSuggestions(lib, q, token.current);
        setItems(out); setOpen(out.length > 0); setActive(0); setError(null);
      } catch (e) {
        console.warn('autocomplete failed', e);
        setItems([]); setOpen(true); setError('Search unavailable');
      }
    }, 200);
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setText(e.target.value);
    onSelect(null);
    search(e.target.value);
  };

  const pick = async (s: SuburbSuggestion) => {
    setOpen(false);
    try {
      const sel = await resolveSuburb(s);
      token.current = undefined; // fetchFields ends the billing session
      onSelect(sel);
    } catch (e: any) {
      setError(e?.message ?? 'Could not resolve suburb');
      setOpen(true);
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || items.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => (a + 1) % items.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => (a - 1 + items.length) % items.length); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(items[active]); }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  const listId = useMemo(() => `suburb-list-${Math.random().toString(36).slice(2, 8)}`, []);

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-2)', border: `1px solid ${value ? 'var(--accent)' : 'var(--line-2)'}`, borderRadius: 10, padding: '8px 10px' }}>
        <Icon name="search" size={14} style={{ color: 'var(--ink-3)', flexShrink: 0 }} />
        <input
          value={text} onChange={onChange} onKeyDown={onKey} onFocus={() => items.length && setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          placeholder="Search a suburb…" disabled={disabled || !lib}
          role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
          style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--ink)', fontSize: 13, flex: 1, padding: 0, minWidth: 0 }} />
        {value && <Icon name="check" size={14} style={{ color: 'var(--accent)' }} />}
      </div>
      {open && (
        <ul id={listId} role="listbox" style={{ position: 'absolute', left: 0, right: 0, top: 'calc(100% + 4px)', zIndex: 50, margin: 0, padding: 4, listStyle: 'none', background: 'var(--bg-1)', border: '1px solid var(--line-2)', borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.45)', maxHeight: 260, overflowY: 'auto' }}>
          {error && <li style={{ padding: '8px 10px', fontSize: 12, color: 'var(--bad)' }}>{error}</li>}
          {items.map((s, i) => (
            <li key={s.placeId} role="option" aria-selected={i === active}
              onMouseDown={e => { e.preventDefault(); pick(s); }} onMouseEnter={() => setActive(i)}
              style={{ padding: '8px 10px', borderRadius: 7, cursor: 'pointer', background: i === active ? 'var(--bg-3)' : 'transparent' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{s.mainText}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{s.secondaryText}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

If `Icon` has no `check` glyph, add one to `components/site-planner/Icon.tsx` following the existing pattern (a 24×24 stroke path `M20 6L9 17l-5-5`).

- [ ] **Step 6: SitesSidebar — swap inputs**

Replace `const [city, setCity] = useState('Johannesburg'); const [suburb, setSuburb] = useState('');` with:

```ts
  const [selection, setSelection] = useState<SuburbSelection | null>(null);
```

Import `SuburbSearch` and `SuburbSelection`. Replace `onSubmit`:

```ts
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selection || busy) return;
    runAnalysis(selection);
  };
```

Replace the two input `<div>`s inside `<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>` with:

```tsx
          <SuburbSearch disabled={busy} value={selection} onSelect={setSelection} />
```

Replace every `!suburb.trim()` in the submit button with `!selection`. Update the empty-state copy at ~line 193 to: `Set the brand and search a suburb above, then <strong>Find sites</strong>. …`.

- [ ] **Step 7: Verify**

Run: `npx vitest run` — Expected: pass.
Run: `npx vite build` — Expected: `✓ built`.
Manual: `npm run dev`, sign in, type "Rosebank", pick "Rosebank, Johannesburg", confirm border turns accent and "Find sites" enables; run and confirm the map flies and candidates appear.

- [ ] **Step 8: Commit**

```bash
git add components/site-planner/SuburbSearch.tsx components/site-planner/SitesSidebar.tsx components/site-planner/Icon.tsx lib/site-planner/data-store.ts lib/site-planner/node-detection.ts contexts/PlannerContext.tsx App.tsx
git commit -m "feat: suburb autocomplete replaces City/Suburb inputs; detection uses place viewport

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Routes traffic source

**Files:**
- Create: `lib/site-planner/signals/routes-traffic.ts`
- Test: `lib/site-planner/signals/routes-traffic.test.ts`

**Interfaces:**
- Consumes: Task 1 (`SignalSource`, `SignalContext`, `measured`, `unavailable`, `clamp100`).
- Produces:

```ts
export function legEndpoints(center: LatLng, distanceM?: number): LatLng[];        // [N, E, S, W]
export function nextWeekdayPeakIso(now: Date): string;                              // next weekday 15:30:00Z
export function congestionIndex(ratios: number[]): number;
export async function computeRoute(ctx: SignalContext, origin: LatLng, dest: LatLng, departureIso: string): Promise<{ durationS: number; staticS: number } | null>;
export const routesTrafficSource: SignalSource<'congestion'>;
export const ROUTES_SOURCE_LABEL = 'Google Routes API (live traffic)';
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { legEndpoints, nextWeekdayPeakIso, congestionIndex, routesTrafficSource } from './routes-traffic';
import { CallBudget, SignalContext } from './types';
import { haversineMeters } from '../geo';

const ctxWith = (fetchImpl: any, max = 250): SignalContext => ({
  selection: { placeId: 'p', suburb: 'S', city: 'C', center: { lat: -26.1, lng: 28.05 }, viewport: { north: 0, south: 0, east: 0, west: 0 } },
  mapsApiKey: 'k', fetchImpl, budget: new CallBudget(max), now: new Date('2026-09-20T08:00:00Z'), retail: [], footTrafficRows: [],
});
const node = { id: 'n1', label: 'n1', lat: -26.1, lng: 28.05, places: [] };

describe('legEndpoints', () => {
  it('places four points ~1500m away on the compass', () => {
    const pts = legEndpoints({ lat: -26.1, lng: 28.05 }, 1500);
    expect(pts).toHaveLength(4);
    for (const p of pts) expect(haversineMeters(-26.1, 28.05, p.lat, p.lng)).toBeCloseTo(1500, -2);
    expect(pts[0].lat).toBeGreaterThan(-26.1); // N
    expect(pts[1].lng).toBeGreaterThan(28.05); // E
  });
});

describe('nextWeekdayPeakIso', () => {
  it('returns 15:30Z on the next weekday strictly after now', () => {
    expect(nextWeekdayPeakIso(new Date('2026-09-20T08:00:00Z'))).toBe('2026-09-21T15:30:00.000Z'); // Sunday -> Monday
    expect(nextWeekdayPeakIso(new Date('2026-09-25T16:00:00Z'))).toBe('2026-09-28T15:30:00.000Z'); // Fri after peak -> Monday
    expect(nextWeekdayPeakIso(new Date('2026-09-22T10:00:00Z'))).toBe('2026-09-22T15:30:00.000Z'); // Tue before peak -> same day
  });
});

describe('congestionIndex', () => {
  it('maps ratio 1.0 -> 0, 1.3 -> 50, >=1.6 -> 100', () => {
    expect(congestionIndex([1])).toBe(0);
    expect(congestionIndex([1.3])).toBe(50);
    expect(congestionIndex([1.6, 2.0])).toBe(100);
    expect(congestionIndex([])).toBe(0);
  });
});

describe('routesTrafficSource', () => {
  it('computes index from 4 legs + drive time from centre', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      return { ok: true, json: async () => ({ routes: [{ duration: '780s', staticDuration: '600s' }] }) } as any;
    };
    const [sig] = await routesTrafficSource.enrich([node], ctxWith(fetchImpl));
    expect(calls).toBe(5);
    expect(sig.provenance).toBe('measured');
    expect(sig.value).toEqual({ index0to100: 50, driveMinutesFromCentre: 13 });
  });
  it('becomes unavailable on HTTP error without throwing', async () => {
    const fetchImpl = async () => ({ ok: false, status: 403, json: async () => ({ error: { status: 'PERMISSION_DENIED' } }) } as any);
    const [sig] = await routesTrafficSource.enrich([node], ctxWith(fetchImpl));
    expect(sig.provenance).toBe('unavailable');
    expect(sig.value).toBeNull();
  });
  it('becomes unavailable when the budget is exhausted', async () => {
    const [sig] = await routesTrafficSource.enrich([node], ctxWith(async () => { throw new Error('no'); }, 0));
    expect(sig.provenance).toBe('unavailable');
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run lib/site-planner/signals/routes-traffic.test.ts` — Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
import { LatLng } from '../geo';
import { CandidateNode } from '../types';
import { SignalSource, SignalContext, Signal, CongestionSignal, measured, unavailable, clamp100 } from './types';

export const ROUTES_SOURCE_LABEL = 'Google Routes API (live traffic)';
const ENDPOINT = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const M_PER_DEG_LAT = 111_320;

/** Four points `distanceM` from `center` at N, E, S, W bearings. */
export function legEndpoints(center: LatLng, distanceM = 1500): LatLng[] {
  const dLat = distanceM / M_PER_DEG_LAT;
  const dLng = distanceM / (M_PER_DEG_LAT * Math.cos((center.lat * Math.PI) / 180));
  return [
    { lat: center.lat + dLat, lng: center.lng },
    { lat: center.lat, lng: center.lng + dLng },
    { lat: center.lat - dLat, lng: center.lng },
    { lat: center.lat, lng: center.lng - dLng },
  ];
}

/** Next weekday 17:30 Africa/Johannesburg (= 15:30Z, SAST has no DST) strictly after `now`. */
export function nextWeekdayPeakIso(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 15, 30, 0, 0));
  if (d <= now) d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

export function congestionIndex(ratios: number[]): number {
  if (!ratios.length) return 0;
  const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  return clamp100(((mean - 1) / 0.6) * 100);
}

const secs = (s: unknown): number | null => {
  if (typeof s !== 'string') return null;
  const n = parseFloat(s.replace(/s$/, ''));
  return Number.isFinite(n) ? n : null;
};

export async function computeRoute(ctx: SignalContext, origin: LatLng, dest: LatLng, departureIso: string): Promise<{ durationS: number; staticS: number } | null> {
  if (!ctx.budget.take('routes')) return null;
  const res = await ctx.fetchImpl(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': ctx.mapsApiKey,
      'X-Goog-FieldMask': 'routes.duration,routes.staticDuration',
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
      destination: { location: { latLng: { latitude: dest.lat, longitude: dest.lng } } },
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
      departureTime: departureIso,
    }),
  });
  if (!res.ok) return null;
  const json: any = await res.json();
  const r = json?.routes?.[0];
  const durationS = secs(r?.duration);
  const staticS = secs(r?.staticDuration);
  if (durationS == null || staticS == null || staticS <= 0) return null;
  return { durationS, staticS };
}

async function enrichNode(node: CandidateNode, ctx: SignalContext, departureIso: string): Promise<Signal<CongestionSignal | null>> {
  try {
    const legs = legEndpoints({ lat: node.lat, lng: node.lng });
    const [legResults, fromCentre] = await Promise.all([
      Promise.all(legs.map(dest => computeRoute(ctx, { lat: node.lat, lng: node.lng }, dest, departureIso))),
      computeRoute(ctx, ctx.selection.center, { lat: node.lat, lng: node.lng }, departureIso),
    ]);
    const ratios = legResults.filter((r): r is { durationS: number; staticS: number } => !!r).map(r => r.durationS / r.staticS);
    if (!ratios.length) return unavailable(ROUTES_SOURCE_LABEL, 'Routes API returned no traffic-aware routes (check key/quota).');
    return measured(
      { index0to100: congestionIndex(ratios), driveMinutesFromCentre: fromCentre ? Math.round(fromCentre.durationS / 60) : null },
      ROUTES_SOURCE_LABEL,
      'Weekday 17:30 live vs free-flow drive time on 4 × 1.5 km legs.',
    );
  } catch (e) {
    console.warn('routesTrafficSource failed for', node.id, e);
    return unavailable(ROUTES_SOURCE_LABEL, 'Routes API request failed.');
  }
}

export const routesTrafficSource: SignalSource<'congestion'> = {
  id: 'congestion',
  label: ROUTES_SOURCE_LABEL,
  async enrich(nodes, ctx) {
    const departureIso = nextWeekdayPeakIso(ctx.now);
    return Promise.all(nodes.map(n => enrichNode(n, ctx, departureIso)));
  },
};
```

- [ ] **Step 4: Run tests** — `npx vitest run` — Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add lib/site-planner/signals/routes-traffic.ts lib/site-planner/signals/routes-traffic.test.ts
git commit -m "feat(signals): Routes API congestion + drive-time source

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Places Aggregate density source

**Files:**
- Create: `lib/site-planner/signals/places-density.ts`
- Test: `lib/site-planner/signals/places-density.test.ts`

**Interfaces:**
- Produces:

```ts
export const DENSITY_TYPES = ['corporate_office','school','university','gym','supermarket','bar','restaurant','cafe'] as const;
export const DAYTIME_TYPES = ['corporate_office','school','university'];
export const EVENING_TYPES = ['bar','restaurant','cafe'];
export async function countPlaces(ctx, center: LatLng, type: string, radiusM: number): Promise<number | null | 'disabled'>;
export function densityIndices(countsPerNode: Record<string, number>[]): Array<{ daytimeIndex0to100: number; eveningIndex0to100: number }>;
export const placesDensitySource: SignalSource<'density'>;
export const DENSITY_SOURCE_LABEL = 'Google Places Aggregate API (1 km counts)';
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { densityIndices, placesDensitySource, DENSITY_TYPES } from './places-density';
import { CallBudget, SignalContext } from './types';

const ctxWith = (fetchImpl: any): SignalContext => ({
  selection: { placeId: 'p', suburb: 'S', city: 'C', center: { lat: -26.1, lng: 28.05 }, viewport: { north: 0, south: 0, east: 0, west: 0 } },
  mapsApiKey: 'k', fetchImpl, budget: new CallBudget(), now: new Date(), retail: [], footTrafficRows: [],
});
const node = (id: string) => ({ id, label: id, lat: -26.1, lng: 28.05, places: [] });

describe('densityIndices', () => {
  it('log-scales daytime and evening sums against the max node', () => {
    const out = densityIndices([
      { corporate_office: 40, school: 5, university: 0, bar: 10, restaurant: 30, cafe: 10 },
      { corporate_office: 0, school: 1, university: 0, bar: 0, restaurant: 2, cafe: 1 },
    ]);
    expect(out[0]).toEqual({ daytimeIndex0to100: 100, eveningIndex0to100: 100 });
    expect(out[1].daytimeIndex0to100).toBeLessThan(30);
    expect(out[1].eveningIndex0to100).toBeLessThan(50);
  });
});

describe('placesDensitySource', () => {
  it('requests one count per type and returns measured signals', async () => {
    const types: string[] = [];
    const fetchImpl = async (_: string, init: any) => {
      const body = JSON.parse(init.body);
      types.push(body.filter.typeFilter.includedTypes[0]);
      return { ok: true, json: async () => ({ count: '12' }) } as any;
    };
    const [sig] = await placesDensitySource.enrich([node('a')], ctxWith(fetchImpl));
    expect(types.sort()).toEqual([...DENSITY_TYPES].sort());
    expect(sig.provenance).toBe('measured');
    expect(sig.value?.counts.restaurant).toBe(12);
  });
  it('marks unavailable with an enable note when the API is disabled', async () => {
    const fetchImpl = async () => ({ ok: false, status: 403, json: async () => ({ error: { status: 'PERMISSION_DENIED', details: [{ reason: 'SERVICE_DISABLED' }] } }) } as any);
    const [sig] = await placesDensitySource.enrich([node('a')], ctxWith(fetchImpl));
    expect(sig.provenance).toBe('unavailable');
    expect(sig.note).toMatch(/Enable Places Aggregate API/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
import { LatLng } from '../geo';
import { CandidateNode } from '../types';
import { SignalSource, SignalContext, Signal, DensitySignal, measured, unavailable, logScore } from './types';

export const DENSITY_SOURCE_LABEL = 'Google Places Aggregate API (1 km counts)';
const ENDPOINT = 'https://areainsights.googleapis.com/v1:computeInsights';
export const DENSITY_TYPES = ['corporate_office', 'school', 'university', 'gym', 'supermarket', 'bar', 'restaurant', 'cafe'] as const;
export const DAYTIME_TYPES = ['corporate_office', 'school', 'university'];
export const EVENING_TYPES = ['bar', 'restaurant', 'cafe'];
const RADIUS_M = 1000;

/** Returns a count, `null` on a non-fatal failure, or `'disabled'` when the API is not enabled on the project. */
export async function countPlaces(ctx: SignalContext, center: LatLng, type: string, radiusM = RADIUS_M): Promise<number | null | 'disabled'> {
  if (!ctx.budget.take('aggregate')) return null;
  const res = await ctx.fetchImpl(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': ctx.mapsApiKey },
    body: JSON.stringify({
      insights: ['INSIGHT_COUNT'],
      filter: {
        locationFilter: { circle: { latLng: { latitude: center.lat, longitude: center.lng }, radius: radiusM } },
        typeFilter: { includedTypes: [type] },
      },
    }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason = json?.error?.details?.find((d: any) => d?.reason)?.reason;
    return reason === 'SERVICE_DISABLED' ? 'disabled' : null;
  }
  const n = Number(json?.count ?? 0);
  return Number.isFinite(n) ? n : null;
}

const sum = (c: Record<string, number>, keys: string[]) => keys.reduce((s, k) => s + (c[k] ?? 0), 0);

export function densityIndices(countsPerNode: Record<string, number>[]): Array<{ daytimeIndex0to100: number; eveningIndex0to100: number }> {
  const day = countsPerNode.map(c => sum(c, DAYTIME_TYPES));
  const eve = countsPerNode.map(c => sum(c, EVENING_TYPES));
  const maxDay = Math.max(0, ...day);
  const maxEve = Math.max(0, ...eve);
  return countsPerNode.map((_, i) => ({
    daytimeIndex0to100: logScore(day[i], maxDay),
    eveningIndex0to100: logScore(eve[i], maxEve),
  }));
}

export const placesDensitySource: SignalSource<'density'> = {
  id: 'density',
  label: DENSITY_SOURCE_LABEL,
  async enrich(nodes: CandidateNode[], ctx: SignalContext): Promise<Signal<DensitySignal | null>[]> {
    let disabled = false;
    const counts: Array<Record<string, number> | null> = await Promise.all(nodes.map(async node => {
      const c: Record<string, number> = {};
      let any = false;
      await Promise.all(DENSITY_TYPES.map(async t => {
        try {
          const n = await countPlaces(ctx, { lat: node.lat, lng: node.lng }, t);
          if (n === 'disabled') { disabled = true; return; }
          if (n != null) { c[t] = n; any = true; }
        } catch (e) { console.warn('countPlaces failed', t, e); }
      }));
      return any ? c : null;
    }));
    if (disabled || counts.every(c => c === null)) {
      const note = disabled
        ? 'Enable Places Aggregate API on the Maps project (Cloud console → APIs) to collect density counts.'
        : 'Places Aggregate API returned no counts.';
      return nodes.map(() => unavailable<DensitySignal>(DENSITY_SOURCE_LABEL, note));
    }
    const filled = counts.map(c => c ?? {});
    const idx = densityIndices(filled);
    return filled.map((c, i) => counts[i]
      ? measured({ ...idx[i], counts: c }, DENSITY_SOURCE_LABEL, 'Counts of offices/schools (daytime) and bars/restaurants/cafés (evening) within 1 km.')
      : unavailable<DensitySignal>(DENSITY_SOURCE_LABEL, 'No counts for this node.'));
  },
};
```

- [ ] **Step 4: Run tests** — `npx vitest run` — Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add lib/site-planner/signals/places-density.ts lib/site-planner/signals/places-density.test.ts
git commit -m "feat(signals): Places Aggregate daytime/evening density source

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Retail-mix affluence source

**Files:**
- Create: `lib/site-planner/signals/retail-mix.ts`
- Test: `lib/site-planner/signals/retail-mix.test.ts`

**Interfaces:**
- Produces: `export const retailMixSource: SignalSource<'affluence'>; export const RETAIL_MIX_LABEL = 'Retail anchor mix (bundled FB dataset)'; export function classifyAnchor(brand: string): 'premium' | 'value' | null;`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { classifyAnchor, retailMixSource } from './retail-mix';
import { CallBudget, SignalContext } from './types';

const rec = (b: string, lat: number, lng: number) => ({ b, n: b, a: '', lat, lng });
const ctxWith = (retail: any[]): SignalContext => ({
  selection: { placeId: 'p', suburb: 'S', city: 'C', center: { lat: -26.1, lng: 28.05 }, viewport: { north: 0, south: 0, east: 0, west: 0 } },
  mapsApiKey: '', fetchImpl: fetch, budget: new CallBudget(), now: new Date(), retail, footTrafficRows: [],
});
const node = { id: 'n', label: 'n', lat: -26.1, lng: 28.05, places: [] };

describe('classifyAnchor', () => {
  it('splits premium vs value and ignores neutral brands', () => {
    expect(classifyAnchor('Woolworths')).toBe('premium');
    expect(classifyAnchor('Checkers')).toBe('premium');
    expect(classifyAnchor('Boxer')).toBe('value');
    expect(classifyAnchor('Usave')).toBe('value');
    expect(classifyAnchor('Shoprite')).toBe('value');
    expect(classifyAnchor('Spar')).toBeNull();
    expect(classifyAnchor('Pick N Pay')).toBeNull();
  });
});

describe('retailMixSource', () => {
  it('scores premium share within 2km', async () => {
    const retail = [rec('Woolworths', -26.101, 28.05), rec('Checkers', -26.105, 28.05), rec('Boxer', -26.108, 28.05), rec('Boxer', -26.3, 28.5)];
    const [sig] = await retailMixSource.enrich([node], ctxWith(retail));
    expect(sig.provenance).toBe('proxy');
    expect(sig.value).toEqual({ index0to100: 67, premiumAnchors: 2, valueAnchors: 1 });
  });
  it('is unavailable with fewer than 2 anchors nearby', async () => {
    const [sig] = await retailMixSource.enrich([node], ctxWith([rec('Woolworths', -26.101, 28.05)]));
    expect(sig.provenance).toBe('unavailable');
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
import { haversineMeters } from '../geo';
import { SignalSource, AffluenceSignal, proxy, unavailable } from './types';

export const RETAIL_MIX_LABEL = 'Retail anchor mix (bundled FB dataset)';
const PREMIUM = ['woolworths', 'checkers'];
const VALUE = ['boxer', 'usave', 'shoprite'];
const RADIUS_M = 2000;

export function classifyAnchor(brand: string): 'premium' | 'value' | null {
  const b = brand.trim().toLowerCase();
  if (PREMIUM.some(p => b.startsWith(p))) return 'premium';
  if (VALUE.some(v => b.startsWith(v))) return 'value';
  return null;
}

export const retailMixSource: SignalSource<'affluence'> = {
  id: 'affluence',
  label: RETAIL_MIX_LABEL,
  async enrich(nodes, ctx) {
    return nodes.map(node => {
      let premium = 0, value = 0;
      for (const r of ctx.retail) {
        const cls = classifyAnchor(r.b);
        if (!cls) continue;
        if (haversineMeters(node.lat, node.lng, r.lat, r.lng) > RADIUS_M) continue;
        if (cls === 'premium') premium++; else value++;
      }
      const total = premium + value;
      if (total < 2) return unavailable<AffluenceSignal>(RETAIL_MIX_LABEL, 'Fewer than 2 classifiable grocery anchors within 2 km.');
      return proxy(
        { index0to100: Math.round((premium / total) * 100), premiumAnchors: premium, valueAnchors: value },
        RETAIL_MIX_LABEL,
        'Share of Woolworths/Checkers vs Boxer/Usave/Shoprite within 2 km — a South African income proxy, not census income.',
      );
    });
  },
};
```

- [ ] **Step 4: Run tests** — Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add lib/site-planner/signals/retail-mix.ts lib/site-planner/signals/retail-mix.test.ts
git commit -m "feat(signals): retail-mix affluence proxy from bundled anchors

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Census ward source + prep script

**Files:**
- Create: `lib/site-planner/signals/census.ts`
- Create: `scripts/prepare-census.mjs`
- Create: `public/data/census-wards.json` (empty array `[]` until real data is prepared)
- Test: `lib/site-planner/signals/census.test.ts`
- Modify: `README.md` (append a "Census data" section)

**Interfaces:**
- Produces:

```ts
export interface CensusWard { ward: string; muni: string; lat: number; lng: number; population: number; households: number; areaKm2: number; }
export async function loadCensusWards(fetchImpl: typeof fetch): Promise<CensusWard[]>;   // cached; [] on failure
export function nearestWard(wards: CensusWard[], lat: number, lng: number, maxM?: number): CensusWard | null;
export const censusSource: SignalSource<'census'>;
export const CENSUS_LABEL = 'Stats SA Census 2022 (ward level)';
export function _resetCensusCache(): void;   // tests only
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { nearestWard, censusSource, _resetCensusCache, CensusWard } from './census';
import { CallBudget, SignalContext } from './types';

const wards: CensusWard[] = [
  { ward: '79800001', muni: 'JHB', lat: -26.10, lng: 28.05, population: 12000, households: 4000, areaKm2: 4 },
  { ward: '79800002', muni: 'JHB', lat: -26.30, lng: 28.30, population: 5000, households: 1500, areaKm2: 20 },
];
const ctxWith = (fetchImpl: any): SignalContext => ({
  selection: { placeId: 'p', suburb: 'S', city: 'C', center: { lat: -26.1, lng: 28.05 }, viewport: { north: 0, south: 0, east: 0, west: 0 } },
  mapsApiKey: '', fetchImpl, budget: new CallBudget(), now: new Date(), retail: [], footTrafficRows: [],
});
const node = { id: 'n', label: 'n', lat: -26.101, lng: 28.051, places: [] };

beforeEach(() => _resetCensusCache());

describe('nearestWard', () => {
  it('picks the closest ward within maxM', () => {
    expect(nearestWard(wards, -26.101, 28.051)?.ward).toBe('79800001');
    expect(nearestWard(wards, -27.0, 29.0, 15000)).toBeNull();
  });
});

describe('censusSource', () => {
  it('joins nodes to the nearest ward and derives density', async () => {
    const fetchImpl = async () => ({ ok: true, json: async () => wards } as any);
    const [sig] = await censusSource.enrich([node], ctxWith(fetchImpl));
    expect(sig.provenance).toBe('measured');
    expect(sig.value).toEqual({ ward: '79800001', population: 12000, households: 4000, densityPerKm2: 3000 });
  });
  it('is unavailable when the file is missing or empty', async () => {
    const fetchImpl = async () => ({ ok: false, status: 404, json: async () => ({}) } as any);
    const [sig] = await censusSource.enrich([node], ctxWith(fetchImpl));
    expect(sig.provenance).toBe('unavailable');
    expect(sig.note).toMatch(/census-wards\.json/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Expected: FAIL, module not found.

- [ ] **Step 3: Implement `census.ts`**

```ts
import { haversineMeters } from '../geo';
import { SignalSource, CensusSignal, measured, unavailable } from './types';

export const CENSUS_LABEL = 'Stats SA Census 2022 (ward level)';
const URL = '/data/census-wards.json';

export interface CensusWard { ward: string; muni: string; lat: number; lng: number; population: number; households: number; areaKm2: number; }

let cache: CensusWard[] | null = null;
export function _resetCensusCache() { cache = null; }

export async function loadCensusWards(fetchImpl: typeof fetch): Promise<CensusWard[]> {
  if (cache) return cache;
  try {
    const res = await fetchImpl(URL);
    if (!res.ok) return (cache = []);
    const json = await res.json();
    cache = Array.isArray(json) ? json.filter(w => Number.isFinite(w?.lat) && Number.isFinite(w?.lng)) : [];
  } catch {
    cache = [];
  }
  return cache;
}

export function nearestWard(wards: CensusWard[], lat: number, lng: number, maxM = 15000): CensusWard | null {
  let best: CensusWard | null = null;
  let bestD = Infinity;
  for (const w of wards) {
    const d = haversineMeters(lat, lng, w.lat, w.lng);
    if (d < bestD) { bestD = d; best = w; }
  }
  return bestD <= maxM ? best : null;
}

export const censusSource: SignalSource<'census'> = {
  id: 'census',
  label: CENSUS_LABEL,
  async enrich(nodes, ctx) {
    const wards = await loadCensusWards(ctx.fetchImpl);
    if (!wards.length) {
      return nodes.map(() => unavailable<CensusSignal>(CENSUS_LABEL, 'No census data bundled (public/data/census-wards.json is empty). See README → Census data.'));
    }
    return nodes.map(node => {
      const w = nearestWard(wards, node.lat, node.lng);
      if (!w) return unavailable<CensusSignal>(CENSUS_LABEL, 'No ward centroid within 15 km.');
      const densityPerKm2 = w.areaKm2 > 0 ? Math.round(w.population / w.areaKm2) : 0;
      return measured(
        { ward: w.ward, population: w.population, households: w.households, densityPerKm2 },
        CENSUS_LABEL,
        'Nearest ward centroid; Census 2022 income was not released by Stats SA.',
      );
    });
  },
};
```

- [ ] **Step 4: Prep script `scripts/prepare-census.mjs`**

```js
#!/usr/bin/env node
// Joins a Stats SA SuperWEB2 ward export with ward centroids into public/data/census-wards.json.
// Usage: node scripts/prepare-census.mjs <wards.csv> <centroids.csv>
//   wards.csv     columns (any order, case-insensitive): ward, population, households   [muni optional]
//   centroids.csv columns: ward, lat, lng, area_km2
import { readFileSync, writeFileSync } from 'node:fs';
import Papa from 'papaparse';

const [wardsPath, centroidsPath] = process.argv.slice(2);
if (!wardsPath || !centroidsPath) {
  console.error('Usage: node scripts/prepare-census.mjs <wards.csv> <centroids.csv>');
  process.exit(1);
}
const read = p => Papa.parse(readFileSync(p, 'utf8'), { header: true, skipEmptyLines: true, transformHeader: h => h.trim().toLowerCase() }).data;
const num = v => { const n = parseFloat(String(v ?? '').replace(/[, ]/g, '')); return Number.isFinite(n) ? n : 0; };

const centroids = new Map(read(centroidsPath).map(r => [String(r.ward).trim(), r]));
const out = [];
for (const r of read(wardsPath)) {
  const ward = String(r.ward ?? '').trim();
  const c = centroids.get(ward);
  if (!ward || !c) continue;
  out.push({ ward, muni: String(r.muni ?? '').trim(), lat: num(c.lat), lng: num(c.lng), population: num(r.population), households: num(r.households), areaKm2: num(c.area_km2) });
}
writeFileSync(new URL('../public/data/census-wards.json', import.meta.url), JSON.stringify(out));
console.log(`wrote ${out.length} wards`);
```

Create `public/data/census-wards.json` containing `[]`.

- [ ] **Step 5: README section** — append:

```markdown
## Census data (optional)

The planner joins each candidate site to the nearest Stats SA ward centroid for
population and household density. Income is not available (Stats SA withheld
Census 2022 income). To bundle the data:

1. SuperWEB2 (https://superweb.statssa.gov.za/webapi) → Census 2022 → table by
   **Ward (2020 boundaries)** with Population and Households → Download Table →
   CSV. Save as `wards.csv` with columns `ward, population, households`.
2. Ward centroids + area from the Municipal Demarcation Board 2020 ward
   boundaries (compute centroid and area in QGIS or similar). Save as
   `centroids.csv` with columns `ward, lat, lng, area_km2`.
3. `node scripts/prepare-census.mjs wards.csv centroids.csv` → writes
   `public/data/census-wards.json`.

Until that file is populated, the census signal reports **unavailable** and the
ranking proceeds without it.
```

- [ ] **Step 6: Run tests** — Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add lib/site-planner/signals/census.ts lib/site-planner/signals/census.test.ts scripts/prepare-census.mjs public/data/census-wards.json README.md
git commit -m "feat(signals): census ward source + offline prep script

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Foot-traffic adapter + CSV upload

**Files:**
- Create: `lib/site-planner/signals/foot-traffic.ts`
- Test: `lib/site-planner/signals/foot-traffic.test.ts`
- Modify: `lib/site-planner/csv.ts` (add `parseFootTraffic`), `lib/site-planner/csv.test.ts`
- Modify: `lib/site-planner/data-store.ts` (`footTraffic`, `setFootTraffic`)
- Modify: `components/site-planner/DataUpload.tsx`

**Interfaces:**
- Produces:

```ts
export interface FootTrafficProvider { id: string; label: string; lookup(nodes: CandidateNode[], ctx: SignalContext): Promise<Array<FootTrafficSignal | null>> }
export const nullFootTrafficProvider: FootTrafficProvider;
export const csvFootTrafficProvider: FootTrafficProvider;      // uses ctx.footTrafficRows, nearest within 300 m
export function footTrafficSourceFor(provider: FootTrafficProvider): SignalSource<'footTraffic'>;
export const footTrafficSource: SignalSource<'footTraffic'>;   // csv provider when rows exist, else null provider
export function parseFootTraffic(csv: string): ParseResult<FootTrafficRecord>;   // in csv.ts
```

- [ ] **Step 1: Write the failing tests**

`foot-traffic.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { csvFootTrafficProvider, nullFootTrafficProvider, footTrafficSource } from './foot-traffic';
import { CallBudget, SignalContext } from './types';

const ctxWith = (rows: any[]): SignalContext => ({
  selection: { placeId: 'p', suburb: 'S', city: 'C', center: { lat: -26.1, lng: 28.05 }, viewport: { north: 0, south: 0, east: 0, west: 0 } },
  mapsApiKey: '', fetchImpl: fetch, budget: new CallBudget(), now: new Date(), retail: [], footTrafficRows: rows,
});
const node = { id: 'n', label: 'n', lat: -26.1, lng: 28.05, places: [] };

describe('csvFootTrafficProvider', () => {
  it('matches the nearest row within 300m', async () => {
    const rows = [{ lat: -26.1015, lng: 28.05, dailyVisits: 4200, peakHour: 13 }, { lat: -26.2, lng: 28.2, dailyVisits: 99 }];
    const [v] = await csvFootTrafficProvider.lookup([node], ctxWith(rows));
    expect(v).toEqual({ dailyVisits: 4200, peakHour: 13 });
  });
  it('returns null when nothing is within 300m', async () => {
    const [v] = await csvFootTrafficProvider.lookup([node], ctxWith([{ lat: -26.2, lng: 28.2, dailyVisits: 99 }]));
    expect(v).toBeNull();
  });
});

describe('footTrafficSource', () => {
  it('uses the null provider when no rows are uploaded', async () => {
    const [sig] = await footTrafficSource.enrich([node], ctxWith([]));
    expect(sig.provenance).toBe('unavailable');
    expect(sig.source).toBe(nullFootTrafficProvider.label);
  });
  it('reports measured visits from CSV rows', async () => {
    const [sig] = await footTrafficSource.enrich([node], ctxWith([{ lat: -26.1, lng: 28.05, dailyVisits: 1000 }]));
    expect(sig.provenance).toBe('measured');
    expect(sig.value?.dailyVisits).toBe(1000);
  });
});
```

Append to `csv.test.ts`:

```ts
describe('parseFootTraffic', () => {
  it('parses lat/lng/daily_visits with optional peak_hour', () => {
    const { records, errors } = parseFootTraffic('lat,lng,daily_visits,peak_hour\n-26.1,28.05,4200,13\n-26.2,28.2,abc,');
    expect(records).toEqual([{ lat: -26.1, lng: 28.05, dailyVisits: 4200, peakHour: 13 }]);
    expect(errors).toHaveLength(1);
  });
});
```

(Add `parseFootTraffic` to the existing import line in `csv.test.ts`.)

- [ ] **Step 2: Run tests to verify they fail** — Expected: FAIL.

- [ ] **Step 3: `parseFootTraffic` in `csv.ts`**

Read the existing `resolveHeaders` alias map at ~line 25 and add aliases: `daily_visits` ← `['daily_visits','visits','dailyvisits','footfall','visitors']`, `peak_hour` ← `['peak_hour','peakhour','peak']`. Then append:

```ts
export function parseFootTraffic(csv: string): ParseResult<FootTrafficRecord> {
  return parse<FootTrafficRecord>(csv, (row, map) => {
    const { lat, lng, address, error } = coords(row, map);
    if (error) return { record: { lat: NaN, lng: NaN, dailyVisits: 0, address }, rowError: error };
    const dailyVisits = Number(row[map.daily_visits]);
    if (!Number.isFinite(dailyVisits)) return { record: { lat, lng, dailyVisits: 0 }, rowError: 'daily_visits is not a number' };
    const peak = row[map.peak_hour] != null && row[map.peak_hour] !== '' ? Number(row[map.peak_hour]) : undefined;
    return { record: { lat, lng, dailyVisits, peakHour: Number.isFinite(peak as number) ? peak : undefined } };
  });
}
```

Match the exact shape of `coords()` and `parse()` in the file — if `parse` drops rows with `rowError`, the record content on error rows is irrelevant. Import `FootTrafficRecord` from `./types`.

- [ ] **Step 4: Implement `foot-traffic.ts`**

```ts
import { haversineMeters } from '../geo';
import { CandidateNode } from '../types';
import { SignalSource, SignalContext, FootTrafficSignal, measured, unavailable } from './types';

export interface FootTrafficProvider {
  id: string;
  label: string;
  lookup(nodes: CandidateNode[], ctx: SignalContext): Promise<Array<FootTrafficSignal | null>>;
}

export const nullFootTrafficProvider: FootTrafficProvider = {
  id: 'none',
  label: 'Foot traffic (no feed connected)',
  async lookup(nodes) { return nodes.map(() => null); },
};

const MATCH_M = 300;

export const csvFootTrafficProvider: FootTrafficProvider = {
  id: 'csv',
  label: 'Foot traffic (uploaded vendor export)',
  async lookup(nodes, ctx) {
    return nodes.map(node => {
      let best: FootTrafficSignal | null = null;
      let bestD = MATCH_M;
      for (const r of ctx.footTrafficRows) {
        const d = haversineMeters(node.lat, node.lng, r.lat, r.lng);
        if (d <= bestD) { bestD = d; best = { dailyVisits: r.dailyVisits, peakHour: r.peakHour }; }
      }
      return best;
    });
  },
};

export function footTrafficSourceFor(provider: FootTrafficProvider): SignalSource<'footTraffic'> {
  return {
    id: 'footTraffic',
    label: provider.label,
    async enrich(nodes, ctx) {
      try {
        const vals = await provider.lookup(nodes, ctx);
        return vals.map(v => v
          ? measured(v, provider.label, 'Device-based daily visits from the connected feed.')
          : unavailable<FootTrafficSignal>(provider.label, provider.id === 'none' ? 'No foot-traffic feed connected. Upload a vendor export or connect a provider.' : 'No feed point within 300 m of this site.'));
      } catch (e) {
        console.warn('foot traffic provider failed', e);
        return nodes.map(() => unavailable<FootTrafficSignal>(provider.label, 'Foot-traffic lookup failed.'));
      }
    },
  };
}

/** Picks the CSV provider when rows were uploaded, otherwise the null provider. */
export const footTrafficSource: SignalSource<'footTraffic'> = {
  id: 'footTraffic',
  label: 'Foot traffic',
  enrich(nodes, ctx) {
    const provider = ctx.footTrafficRows.length ? csvFootTrafficProvider : nullFootTrafficProvider;
    return footTrafficSourceFor(provider).enrich(nodes, ctx);
  },
};
```

- [ ] **Step 5: Store + upload UI**

`data-store.ts`: add `footTraffic: FootTrafficRecord[]` (initial `[]`) and `setFootTraffic: (r: FootTrafficRecord[]) => void` → `set({ footTraffic })`. Import `FootTrafficRecord`.

`DataUpload.tsx`: extend `Kind` with `'footTraffic'`, destructure `footTraffic, setFootTraffic`, add branch:

```ts
    if (kind === 'footTraffic') {
      const { records, errors } = parseFootTraffic(text);
      setFootTraffic(records);
      if (errors.length) addUploadErrors(errors.map(x => `foot traffic: ${x}`));
    }
```

and row: `{row('footTraffic', 'Foot traffic (vendor export: lat, lng, daily_visits)', footTraffic.length)}`.

- [ ] **Step 6: Run tests** — Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add lib/site-planner/signals/foot-traffic.ts lib/site-planner/signals/foot-traffic.test.ts lib/site-planner/csv.ts lib/site-planner/csv.test.ts lib/site-planner/data-store.ts components/site-planner/DataUpload.tsx
git commit -m "feat(signals): pluggable foot-traffic provider with CSV upload

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Orchestration + feature blending, wired into the run

**Files:**
- Create: `lib/site-planner/signals/index.ts`
- Create: `lib/site-planner/compose-features.ts`
- Test: `lib/site-planner/signals/index.test.ts`, `lib/site-planner/compose-features.test.ts`
- Modify: `lib/site-planner/data-store.ts` (`apiCalls`, `setApiCalls`)
- Modify: `contexts/PlannerContext.tsx` (`runAnalysis`)

**Interfaces:**
- Consumes: all sources (Tasks 4–8), `computeFeatures` (existing), `FeatureInputs` (existing).
- Produces:

```ts
export const ALL_SOURCES: SignalSource<keyof NodeSignals>[];
export async function gatherSignals(nodes: CandidateNode[], ctx: SignalContext, sources?: SignalSource<any>[]): Promise<NodeSignals[]>;
export function blendTraffic(reviewScore: number, s: NodeSignals, footMax: number): number;
export function blendDemographics(base: FeatureVector['demographics'], s: NodeSignals, densityMax: number): number;
export function accessibilityBonus(driveMinutes: number | null): number;    // 20 at <=5 min → 0 at >=15
export function flattenSources(s: NodeSignals): SourceRow[];
export function composeFeatures(nodes: CandidateNode[], signals: NodeSignals[], inputs: FeatureInputs, suburb?: string): FeatureVector[];
```

- [ ] **Step 1: Write the failing tests**

`signals/index.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { gatherSignals } from './index';
import { CallBudget, SignalContext, SignalSource, measured } from './types';

const ctx: SignalContext = {
  selection: { placeId: 'p', suburb: 'S', city: 'C', center: { lat: -26.1, lng: 28.05 }, viewport: { north: 0, south: 0, east: 0, west: 0 } },
  mapsApiKey: '', fetchImpl: fetch, budget: new CallBudget(), now: new Date(), retail: [], footTrafficRows: [],
};
const nodes = [{ id: 'a', label: 'a', lat: -26.1, lng: 28.05, places: [] }, { id: 'b', label: 'b', lat: -26.2, lng: 28.1, places: [] }];

describe('gatherSignals', () => {
  it('collects every source per node and converts a rejected source to unavailable', async () => {
    const good: SignalSource<'affluence'> = { id: 'affluence', label: 'G', enrich: async ns => ns.map(() => measured({ index0to100: 50, premiumAnchors: 1, valueAnchors: 1 }, 'G')) };
    const bad: SignalSource<'congestion'> = { id: 'congestion', label: 'B', enrich: async () => { throw new Error('boom'); } };
    const out = await gatherSignals(nodes, ctx, [good, bad]);
    expect(out).toHaveLength(2);
    expect(out[0].affluence.provenance).toBe('measured');
    expect(out[0].congestion.provenance).toBe('unavailable');
    expect(out[1].census.provenance).toBe('unavailable'); // source not supplied → unavailable
  });
});
```

`compose-features.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { blendTraffic, blendDemographics, accessibilityBonus, flattenSources, composeFeatures } from './compose-features';
import { NodeSignals, measured, proxy, unavailable } from './signals/types';
import { CandidateNode } from './types';

const none = (): NodeSignals => ({
  congestion: unavailable('R', 'x'), density: unavailable('D', 'x'), affluence: unavailable('A', 'x'),
  census: unavailable('C', 'x'), footTraffic: unavailable('F', 'x'),
});
const poi = (reviews: number, types: string[] = ['restaurant']) => ({ lat: -26.1, lng: 28.05, userRatingCount: reviews, rating: 4.2, types, primaryType: types[0] });
const node = (id: string, places: any[]): CandidateNode => ({ id, label: id, lat: -26.1, lng: 28.05, places });

describe('blendTraffic', () => {
  it('returns the review score alone when nothing else is available', () => {
    expect(blendTraffic(60, none(), 0)).toBe(60);
  });
  it('renormalises over available signals', () => {
    const s = none();
    s.congestion = measured({ index0to100: 100, driveMinutesFromCentre: 5 }, 'R');
    // review 0.2 → 60, congestion 0.2 → 100 → (60*0.2 + 100*0.2)/0.4 = 80
    expect(blendTraffic(60, s, 0)).toBe(80);
  });
  it('weights measured foot traffic highest', () => {
    const s = none();
    s.footTraffic = measured({ dailyVisits: 10000 }, 'F');
    // review 0.2 → 20, foot 0.4 → 100 (max) → (20*0.2 + 100*0.4)/0.6 = 73
    expect(blendTraffic(20, s, 10000)).toBe(73);
  });
});

describe('blendDemographics', () => {
  it('uses affluence + census density when present, else the base proxy', () => {
    const base = { source: 'proxy' as const, affluenceProxy0to100: 40 };
    expect(blendDemographics(base, none(), 0)).toBe(40);
    const s = none();
    s.affluence = proxy({ index0to100: 80, premiumAnchors: 4, valueAnchors: 1 }, 'A');
    s.census = measured({ ward: 'w', population: 10000, households: 3000, densityPerKm2: 5000 }, 'C');
    // affluence 0.6 → 80, density 0.4 → 100 (max) → 88
    expect(blendDemographics(base, s, 5000)).toBe(88);
  });
  it('lets uploaded LSM override affluence', () => {
    const base = { source: 'csv' as const, lsm: 9, affluenceProxy0to100: 10 };
    const s = none();
    s.affluence = proxy({ index0to100: 20, premiumAnchors: 1, valueAnchors: 4 }, 'A');
    expect(blendDemographics(base, s, 0)).toBe(90); // LSM 9 → 90
  });
});

describe('accessibilityBonus', () => {
  it('is 20 at <=5 min, 0 at >=15, linear between, 0 when unknown', () => {
    expect(accessibilityBonus(3)).toBe(20);
    expect(accessibilityBonus(10)).toBe(10);
    expect(accessibilityBonus(15)).toBe(0);
    expect(accessibilityBonus(null)).toBe(0);
  });
});

describe('flattenSources', () => {
  it('lists one row per signal', () => {
    const rows = flattenSources(none());
    expect(rows).toHaveLength(5);
    expect(rows[0]).toEqual({ label: 'R', provenance: 'unavailable', note: 'x' });
  });
});

describe('composeFeatures', () => {
  it('attaches signals + sources and blends the scores', () => {
    const s = none();
    s.congestion = measured({ index0to100: 100, driveMinutesFromCentre: 4 }, 'R');
    const fv = composeFeatures([node('a', [poi(500)])], [s], { competitors: [], stores: [], demographics: [] });
    expect(fv[0].signals).toBe(s);
    expect(fv[0].sources).toHaveLength(5);
    expect(fv[0].trafficProxy.score0to100).toBeGreaterThan(50);
    expect(fv[0].accessibility.score0to100).toBeGreaterThanOrEqual(20);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail** — Expected: FAIL.

- [ ] **Step 3: Implement `signals/index.ts`**

```ts
import { CandidateNode } from '../types';
import { NodeSignals, SignalContext, SignalSource, unavailable } from './types';
import { routesTrafficSource } from './routes-traffic';
import { placesDensitySource } from './places-density';
import { retailMixSource } from './retail-mix';
import { censusSource } from './census';
import { footTrafficSource } from './foot-traffic';

export { CallBudget } from './types';
export type { NodeSignals, SignalContext, SignalSource } from './types';

export const ALL_SOURCES: SignalSource<keyof NodeSignals>[] = [
  routesTrafficSource, placesDensitySource, retailMixSource, censusSource, footTrafficSource,
];

const KEYS: (keyof NodeSignals)[] = ['congestion', 'density', 'affluence', 'census', 'footTraffic'];

/** Run every source; a rejected or missing source becomes `unavailable` for all nodes. */
export async function gatherSignals(
  nodes: CandidateNode[],
  ctx: SignalContext,
  sources: SignalSource<keyof NodeSignals>[] = ALL_SOURCES,
): Promise<NodeSignals[]> {
  const perKey = new Map<keyof NodeSignals, unknown[]>();
  const settled = await Promise.allSettled(sources.map(s => s.enrich(nodes, ctx)));
  settled.forEach((r, i) => {
    const src = sources[i];
    if (r.status === 'fulfilled' && r.value.length === nodes.length) perKey.set(src.id, r.value);
    else {
      console.warn(`signal source ${src.id} failed`, r.status === 'rejected' ? r.reason : 'length mismatch');
      perKey.set(src.id, nodes.map(() => unavailable(src.label, 'Source failed.')));
    }
  });
  return nodes.map((_, i) => {
    const out = {} as NodeSignals;
    for (const k of KEYS) {
      const arr = perKey.get(k);
      (out as any)[k] = arr ? arr[i] : unavailable(k, 'Source not run.');
    }
    return out;
  });
}
```

- [ ] **Step 4: Implement `compose-features.ts`**

```ts
import { computeFeatures, FeatureInputs } from './features';
import { CandidateNode, FeatureVector, SourceRow } from './types';
import { NodeSignals, clamp100, logScore } from './signals/types';

const TRAFFIC_W = { footTraffic: 0.4, congestion: 0.2, density: 0.2, review: 0.2 };
const DEMO_W = { affluence: 0.6, census: 0.4 };

function weightedMean(parts: Array<[value: number, weight: number] | null>): number | null {
  const live = parts.filter((p): p is [number, number] => !!p);
  const w = live.reduce((s, [, x]) => s + x, 0);
  if (w === 0) return null;
  return clamp100(live.reduce((s, [v, x]) => s + v * x, 0) / w);
}

export function blendTraffic(reviewScore: number, s: NodeSignals, footMax: number): number {
  const foot = s.footTraffic.value ? logScore(s.footTraffic.value.dailyVisits, footMax) : null;
  const cong = s.congestion.value ? s.congestion.value.index0to100 : null;
  const dens = s.density.value ? (s.density.value.daytimeIndex0to100 + s.density.value.eveningIndex0to100) / 2 : null;
  return weightedMean([
    foot != null ? [foot, TRAFFIC_W.footTraffic] : null,
    cong != null ? [cong, TRAFFIC_W.congestion] : null,
    dens != null ? [dens, TRAFFIC_W.density] : null,
    [reviewScore, TRAFFIC_W.review],
  ]) ?? reviewScore;
}

export function blendDemographics(base: FeatureVector['demographics'], s: NodeSignals, densityMax: number): number {
  // Uploaded LSM (1-10) or income override the retail-mix affluence proxy.
  const lsmScore = base.lsm != null ? clamp100(base.lsm * 10) : null;
  const affl = lsmScore ?? (s.affluence.value ? s.affluence.value.index0to100 : null);
  const dens = s.census.value ? logScore(s.census.value.densityPerKm2, densityMax) : null;
  return weightedMean([
    affl != null ? [affl, DEMO_W.affluence] : null,
    dens != null ? [dens, DEMO_W.census] : null,
  ]) ?? base.affluenceProxy0to100;
}

export function accessibilityBonus(driveMinutes: number | null): number {
  if (driveMinutes == null) return 0;
  if (driveMinutes <= 5) return 20;
  if (driveMinutes >= 15) return 0;
  return Math.round(20 * (15 - driveMinutes) / 10);
}

export function flattenSources(s: NodeSignals): SourceRow[] {
  return (['congestion', 'density', 'affluence', 'census', 'footTraffic'] as const).map(k => ({
    label: s[k].source, provenance: s[k].provenance, note: s[k].note,
  }));
}

/** computeFeatures + provenance-tagged signals → blended scores. */
export function composeFeatures(nodes: CandidateNode[], signals: NodeSignals[], inputs: FeatureInputs, suburb?: string): FeatureVector[] {
  const base = computeFeatures(nodes, inputs, suburb);
  const footMax = Math.max(0, ...signals.map(s => s.footTraffic.value?.dailyVisits ?? 0));
  const densityMax = Math.max(0, ...signals.map(s => s.census.value?.densityPerKm2 ?? 0));
  return base.map((f, i) => {
    const s = signals[i];
    const drive = s.congestion.value?.driveMinutesFromCentre ?? null;
    return {
      ...f,
      trafficProxy: { ...f.trafficProxy, score0to100: blendTraffic(f.trafficProxy.score0to100, s, footMax) },
      accessibility: { ...f.accessibility, score0to100: clamp100(f.accessibility.score0to100 + accessibilityBonus(drive)) },
      demographics: { ...f.demographics, affluenceProxy0to100: blendDemographics(f.demographics, s, densityMax) },
      signals: s,
      sources: flattenSources(s),
    };
  });
}
```

Export `FeatureInputs` from `features.ts` if it is not already exported (it is declared `export interface FeatureInputs` — verify).

- [ ] **Step 5: Store + PlannerContext wiring**

`data-store.ts`: add `apiCalls: number` (initial `0`) and `setApiCalls: (n: number) => void`. Reset it to `0` in `reset()`.

`PlannerContext.tsx`: import `gatherSignals, CallBudget` from `@/lib/site-planner/signals` and `composeFeatures` from `@/lib/site-planner/compose-features`. In `runAnalysis`, replace the `computeFeatures(...)` line with:

```ts
      const budget = new CallBudget();
      const signals = await gatherSignals(nodes, {
        selection, mapsApiKey, fetchImpl: fetch.bind(window), budget, now: new Date(),
        retail: s.retailData, footTrafficRows: s.footTraffic,
      });
      s.setApiCalls(budget.used);
      const features = composeFeatures(nodes, signals, { competitors, stores, demographics: s.demographics }, suburb);
```

Add `s.setStatus('enriching')` before `gatherSignals` and add `'enriching'` to `AnalysisStatus` in `data-store.ts`. Update `SitesSidebar` `busy` to include `'enriching'` and its status text: `status === 'detecting' ? 'Scanning Google Places…' : status === 'enriching' ? 'Gathering traffic, density and demographic signals…' : \`${REASONING_MODEL_LABEL} is ranking sites…\``. `AssistantPanel` `busy` stays `status === 'reasoning'`.

`mapsApiKey` comes from the provider prop (Task 3); add it to the `useCallback` deps.

- [ ] **Step 6: Run tests + build** — `npx vitest run` and `npx vite build` — Expected: pass, built.

- [ ] **Step 7: Commit**

```bash
git add lib/site-planner/signals/index.ts lib/site-planner/signals/index.test.ts lib/site-planner/compose-features.ts lib/site-planner/compose-features.test.ts lib/site-planner/data-store.ts contexts/PlannerContext.tsx components/site-planner/SitesSidebar.tsx
git commit -m "feat(signals): gather all sources and blend into feature scores

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Provenance in the prompt

**Files:**
- Modify: `lib/site-planner/reasoning.ts` (`SYSTEM`, `buildPrompt`)
- Test: `lib/site-planner/reasoning.test.ts`

- [ ] **Step 1: Write the failing test** — append to `reasoning.test.ts`:

```ts
describe('buildPrompt provenance', () => {
  it('lists each data source with its provenance and omits the block when absent', () => {
    const withSources = { ...fv, sources: [
      { label: 'Google Routes API (live traffic)', provenance: 'measured' as const, note: 'peak' },
      { label: 'Foot traffic (no feed connected)', provenance: 'unavailable' as const, note: 'none' },
    ] };
    const p = buildPrompt({ brand: 'Steers', suburb: 'Rosebank', features: [withSources], weights: DEFAULT_WEIGHTS });
    expect(p).toContain('Data provenance');
    expect(p).toContain('- Google Routes API (live traffic): measured — peak');
    expect(p).toContain('- Foot traffic (no feed connected): unavailable — none');
    expect(buildPrompt({ brand: 'Steers', suburb: 'Rosebank', features: [fv], weights: DEFAULT_WEIGHTS })).not.toContain('Data provenance');
  });
});
```

- [ ] **Step 2: Run to verify it fails** — Expected: FAIL on `Data provenance`.

- [ ] **Step 3: Implement**

In `SYSTEM`, append a paragraph:

```
Each candidate carries a "sources" list. Signals marked "proxy" are indirect estimates; signals marked
"unavailable" were not collected for this run. Never treat a proxy as measured foot traffic. When a
ranking rests mainly on proxies, say so plainly in the rationale and in overallSummary.
```

Add a helper and use it in `buildPrompt`:

```ts
export function provenanceBlock(features: FeatureVector[]): string {
  const seen = new Map<string, { provenance: string; note?: string }>();
  for (const f of features) for (const s of f.sources ?? []) if (!seen.has(s.label)) seen.set(s.label, s);
  if (!seen.size) return '';
  const lines = [...seen.entries()].map(([label, s]) => `- ${label}: ${s.provenance}${s.note ? ` — ${s.note}` : ''}`);
  return ['Data provenance (applies to every candidate):', ...lines].join('\n');
}
```

In `buildPrompt`, insert `provenanceBlock(features)` between the constraints line and `Candidate sites (JSON):`. The `.filter(Boolean)` already drops it when empty.

- [ ] **Step 4: Run tests** — Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add lib/site-planner/reasoning.ts lib/site-planner/reasoning.test.ts
git commit -m "feat: pass signal provenance to the reasoning model

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Provenance + signals in the UI

**Files:**
- Modify: `lib/site-planner/display.ts` (`DisplaySite`, `toDisplaySites`)
- Modify: `components/site-planner/DetailCard.tsx`
- Modify: `components/site-planner/MapChrome.tsx`
- Modify: `components/site-planner/AssistantPanel.tsx` (guidance copy only)

- [ ] **Step 1: display.ts**

Add to `DisplaySite`: `signals?: NodeSignals; sources: SourceRow[];`. Import `NodeSignals` from `./signals/types` and `SourceRow` from `./types`. In the mapper add `signals: f?.signals, sources: f?.sources ?? [],`.

- [ ] **Step 2: DetailCard — signal stats**

Add a `ProvBadge` component and a second stats row after the existing one:

```tsx
function ProvBadge({ p }: { p: 'measured' | 'proxy' | 'unavailable' }) {
  const c = p === 'measured' ? 'var(--good)' : p === 'proxy' ? 'var(--warn)' : 'var(--ink-3)';
  return <span className="mono" style={{ fontSize: 9, color: c, border: `1px solid ${c}`, borderRadius: 3, padding: '0 4px', textTransform: 'uppercase', letterSpacing: 0.5 }}>{p}</span>;
}
```

```tsx
      {/* Signal stats row */}
      {site.signals && (
        <div style={{ display: 'flex', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
          <Stat label="Foot traffic" value={site.signals.footTraffic.value ? `${(site.signals.footTraffic.value.dailyVisits / 1000).toFixed(1)}k/day` : '—'} sub={site.signals.footTraffic.value ? 'vendor feed' : 'no feed connected'} />
          <Stat label="Congestion" value={site.signals.congestion.value ? `${site.signals.congestion.value.index0to100}` : '—'} sub={site.signals.congestion.value?.driveMinutesFromCentre != null ? `${site.signals.congestion.value.driveMinutesFromCentre} min from centre` : 'weekday 17:30'} />
          <Stat label="Day / evening" value={site.signals.density.value ? `${site.signals.density.value.daytimeIndex0to100} / ${site.signals.density.value.eveningIndex0to100}` : '—'} sub="density within 1km" />
          <Stat label="Affluence" value={site.signals.affluence.value ? `${site.signals.affluence.value.index0to100}` : '—'} sub={site.signals.affluence.value ? `${site.signals.affluence.value.premiumAnchors} premium · ${site.signals.affluence.value.valueAnchors} value` : 'retail mix'} />
          <Stat label="Ward pop." value={site.signals.census.value ? `${(site.signals.census.value.population / 1000).toFixed(1)}k` : '—'} sub={site.signals.census.value ? `${site.signals.census.value.densityPerKm2}/km²` : 'census'} />
        </div>
      )}
```

- [ ] **Step 3: DetailCard — Data sources section**

Change the lower grid to `gridTemplateColumns: '1fr 320px 300px'` and append a third column:

```tsx
        <div style={{ padding: '14px 18px', borderLeft: '1px solid var(--line)' }}>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Data sources</div>
          {site.sources.map(s => (
            <div key={s.label} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--ink-2)', flex: 1 }}>{s.label}</span>
                <ProvBadge p={s.provenance} />
              </div>
              {s.note && <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 1, lineHeight: 1.4 }}>{s.note}</div>}
            </div>
          ))}
          {site.sources.length === 0 && <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>Review-density proxy only.</div>}
        </div>
```

Also add a row for the always-present review proxy at the top of that list:

```tsx
          <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--ink-2)', flex: 1 }}>Google Places review density</span><ProvBadge p="proxy" />
          </div>
```

- [ ] **Step 4: MapChrome — API call count**

Destructure `apiCalls` from the store and, inside the breadcrumb `div` after the suburb span, add:

```tsx
          {apiCalls > 0 && <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', marginLeft: 6 }}>· {apiCalls} API calls</span>}
```

- [ ] **Step 5: AssistantPanel guidance** — in the guidance/suggestions text (search for the suggestions array near line 25), add a suggestion string `'Why is site 2 ranked above site 1?'` and, in the empty-state copy, mention: "Every ranking shows its data sources — ask which signals are measured vs proxies."

- [ ] **Step 6: Verify** — `npx vitest run`, `npx vite build`. Manual: run a suburb, open a site, confirm the signal row, sources column with badges, and "N API calls" in the breadcrumb.

- [ ] **Step 7: Commit**

```bash
git add lib/site-planner/display.ts components/site-planner/DetailCard.tsx components/site-planner/MapChrome.tsx components/site-planner/AssistantPanel.tsx
git commit -m "feat(ui): signal stats, data-source provenance badges, API call count

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: End-to-end verification and spec sync

**Files:**
- Modify: `README.md` (architecture section: mention signal layer + autocomplete; remove the "replace key in App.tsx" instruction, point at `.env`)
- Modify: `docs/superpowers/specs/2026-09-20-signal-layer-and-autocomplete-design.md` (§3.2 Aggregate 1 km only; §3.5 additive `signals`/`sources` shape) — if not already patched.

- [ ] **Step 1: Full verification**

Run: `npx vitest run` — Expected: all pass.
Run: `npx vite build` — Expected: built; `grep -c gemini-3.8-flash dist/assets/*.js` ≥ 1.
Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v map-3d-types` — Expected: no errors outside the pre-existing `map-3d-types.ts` ones.

- [ ] **Step 2: Manual run** — `npm run dev`; sign in; search "Rosebank" → pick; Find sites. Confirm: status passes through Scanning → Gathering signals → ranking; breadcrumb shows API calls; detail card shows congestion (measured), density (measured if the Aggregate API is enabled, else unavailable with the enable note), affluence (proxy), census (unavailable until data is prepared), foot traffic (no feed). Ask the chat "Why is site 2 ranked above site 1?" and confirm the answer references provenance.

- [ ] **Step 3: README + spec edits** as listed above.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/superpowers/specs/2026-09-20-signal-layer-and-autocomplete-design.md
git commit -m "docs: README + spec sync for signal layer and autocomplete

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

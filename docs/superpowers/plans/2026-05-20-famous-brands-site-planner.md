# Famous Brands Site Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pivot the "Chat with Maps Live" voice itinerary demo into a client-only store site-selection tool that ranks where Famous Brands should open a store in a chosen suburb, using Gemini 2.5 Pro reasoning over Maps-derived + uploaded signals.

**Architecture:** Client-only React+Vite. The app orchestrates: pick a suburb → detect commercial nodes from Google Places → compute per-node feature vectors (traffic proxy / accessibility / competition / cannibalisation / demographics) → send the structured table to Gemini 2.5 Pro (thinking on, JSON schema out) → render a ranked panel + rank-styled markers on the existing 3D map → refine via text chat. The voice / Live API layer is removed.

**Tech Stack:** React 19, Vite 6, TypeScript, Zustand, `@google/genai` (Gemini 2.5 Pro), `@vis.gl/react-google-maps` (3D maps + Places + Geocoding), `papaparse` (CSV), `vitest` (tests).

**Spec:** `docs/superpowers/specs/2026-05-20-famous-brands-site-planner-design.md`

---

## File Structure

**New (`lib/site-planner/`):**
- `geo.ts` — pure geo helpers: haversine distance, grid point generation, spatial bucketing/clustering.
- `csv.ts` — parse + column-map + validate uploaded CSVs into typed records.
- `types.ts` — shared types: `CandidateNode`, `FeatureVector`, `CompetitorRecord`, `StoreRecord`, `DemographicRecord`, `RankedResult`.
- `features.ts` — pure feature computation + 0–100 score normalisation from raw signals + uploaded data.
- `node-detection.ts` — Places search across a suburb + cluster into candidate nodes (browser; uses `geo.ts`).
- `reasoning.ts` — Gemini 2.5 Pro client: response schema, prompt builder, `analyzeSuburb`, `rerank`, response validation.
- `data-store.ts` — Zustand store for planner state (suburb, uploads, candidates, ranking, weights, brand, chat).

**New (`components/site-planner/`):**
- `SuburbSearch.tsx`, `DataUpload.tsx`, `RankedPanel.tsx`, `ChatComposer.tsx`.

**Modified:** `App.tsx`, `contexts/LiveAPIContext.tsx`→`contexts/PlannerContext.tsx`, `components/streaming-console/StreamingConsole.tsx`, `components/Sidebar.tsx`, `lib/state.ts`, `lib/map-controller.ts`, `lib/constants.ts`, `metadata.json`, `package.json`, `vite.config.ts`.

**Removed:** `lib/audio-recorder.ts`, `lib/audio-streamer.ts`, `lib/audioworklet-registry.ts`, `lib/worklets/*`, `lib/genai-live-client.ts`, `hooks/use-live-api.ts`, `components/ControlTray.tsx`, `lib/tools/*`.

---

## Phase 0 — Tooling & cleanup

### Task 1: Add test tooling and dependencies

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install dependencies**

Run:
```bash
npm install papaparse@^5.4.1 && \
npm install -D vitest@^3.0.0 @types/papaparse@^5.3.14 && \
npm install @google/genai@latest
```
Expected: installs succeed; `package.json` gains `papaparse`, `vitest`, `@types/papaparse`.

- [ ] **Step 2: Add the test script**

In `package.json`, add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Verify the runner works**

Run: `npm test`
Expected: vitest runs and reports "No test files found" (exit 0) — tooling is wired.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest + papaparse, bump @google/genai"
```

---

### Task 2: Remove the voice / Live API layer

**Files:**
- Delete: `lib/audio-recorder.ts`, `lib/audio-streamer.ts`, `lib/audioworklet-registry.ts`, `lib/worklets/audio-processing.ts`, `lib/worklets/vol-meter.ts`, `lib/genai-live-client.ts`, `hooks/use-live-api.ts`, `lib/tools/itinerary-planner.ts`, `lib/tools/tool-registry.ts`
- Modify: `metadata.json`

> This task intentionally breaks the build (App.tsx still imports removed files). Phase 4 rebuilds the wiring. Commit anyway — it's a clean checkpoint of "voice removed".

- [ ] **Step 1: Delete the voice + tool files**

Run:
```bash
git rm lib/audio-recorder.ts lib/audio-streamer.ts lib/audioworklet-registry.ts \
  lib/worklets/audio-processing.ts lib/worklets/vol-meter.ts \
  lib/genai-live-client.ts hooks/use-live-api.ts \
  lib/tools/itinerary-planner.ts lib/tools/tool-registry.ts
```
Expected: files removed; `lib/worklets/` and `lib/tools/` become empty.

- [ ] **Step 2: Remove the microphone permission**

Replace `metadata.json` contents with:
```json
{
  "name": "Famous Brands Site Planner",
  "description": "Rank where to open a store in a chosen suburb using Gemini 2.5 Pro reasoning over Maps-derived and uploaded signals.",
  "requestFramePermissions": []
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: remove voice/Live API layer and itinerary tools"
```

---

## Phase 1 — Pure logic (TDD)

### Task 3: Geo helpers

**Files:**
- Create: `lib/site-planner/geo.ts`
- Test: `lib/site-planner/geo.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/site-planner/geo.test.ts
import { describe, it, expect } from 'vitest';
import { haversineMeters, gridPoints, clusterPoints } from './geo';

describe('haversineMeters', () => {
  it('returns ~0 for the same point', () => {
    expect(haversineMeters(-26.1, 28.05, -26.1, 28.05)).toBeLessThan(1);
  });
  it('computes a known distance (~1.11km per 0.01deg lat)', () => {
    const d = haversineMeters(-26.10, 28.05, -26.11, 28.05);
    expect(d).toBeGreaterThan(1090);
    expect(d).toBeLessThan(1130);
  });
});

describe('gridPoints', () => {
  it('returns an NxN grid of points inside the bounds', () => {
    const pts = gridPoints({ south: -26.2, west: 28.0, north: -26.0, east: 28.2 }, 3);
    expect(pts).toHaveLength(9);
    for (const p of pts) {
      expect(p.lat).toBeGreaterThanOrEqual(-26.2);
      expect(p.lat).toBeLessThanOrEqual(-26.0);
      expect(p.lng).toBeGreaterThanOrEqual(28.0);
      expect(p.lng).toBeLessThanOrEqual(28.2);
    }
  });
});

describe('clusterPoints', () => {
  it('groups nearby points into one cluster and keeps far ones separate', () => {
    const pts = [
      { lat: -26.100, lng: 28.050, weight: 10 },
      { lat: -26.1005, lng: 28.0505, weight: 5 },
      { lat: -26.200, lng: 28.150, weight: 8 },
    ];
    const clusters = clusterPoints(pts, 200); // 200m radius
    expect(clusters).toHaveLength(2);
    const big = clusters.find(c => c.members.length === 2)!;
    expect(big.totalWeight).toBe(15);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/site-planner/geo.test.ts`
Expected: FAIL — "Failed to resolve import './geo'".

- [ ] **Step 3: Write the implementation**

```ts
// lib/site-planner/geo.ts
export interface LatLng { lat: number; lng: number; }
export interface Bounds { south: number; west: number; north: number; east: number; }
export interface WeightedPoint extends LatLng { weight: number; }
export interface Cluster { lat: number; lng: number; totalWeight: number; members: WeightedPoint[]; }

const R = 6371000; // earth radius (m)
const toRad = (d: number) => (d * Math.PI) / 180;

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Evenly spaced NxN points inside bounds (cell centres). */
export function gridPoints(b: Bounds, n: number): LatLng[] {
  const pts: LatLng[] = [];
  const latStep = (b.north - b.south) / n;
  const lngStep = (b.east - b.west) / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      pts.push({
        lat: b.south + latStep * (i + 0.5),
        lng: b.west + lngStep * (j + 0.5),
      });
    }
  }
  return pts;
}

/** Greedy agglomerative clustering: a point joins the first cluster whose
 *  centroid is within `radiusM`, otherwise it seeds a new cluster. */
export function clusterPoints(points: WeightedPoint[], radiusM: number): Cluster[] {
  const clusters: Cluster[] = [];
  // Highest-weight points seed first for stabler centroids.
  const sorted = [...points].sort((a, b) => b.weight - a.weight);
  for (const p of sorted) {
    const hit = clusters.find(c => haversineMeters(c.lat, c.lng, p.lat, p.lng) <= radiusM);
    if (hit) {
      hit.members.push(p);
      hit.totalWeight += p.weight;
      // Recompute weighted centroid.
      hit.lat = hit.members.reduce((s, m) => s + m.lat * m.weight, 0) / hit.totalWeight;
      hit.lng = hit.members.reduce((s, m) => s + m.lng * m.weight, 0) / hit.totalWeight;
    } else {
      clusters.push({ lat: p.lat, lng: p.lng, totalWeight: p.weight, members: [p] });
    }
  }
  return clusters;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/site-planner/geo.test.ts`
Expected: PASS (3 files of assertions green).

- [ ] **Step 5: Commit**

```bash
git add lib/site-planner/geo.ts lib/site-planner/geo.test.ts
git commit -m "feat: geo helpers (haversine, grid, clustering)"
```

---

### Task 4: Shared types

**Files:**
- Create: `lib/site-planner/types.ts`

> Pure type module — no test. Defines the contracts every later task imports.

- [ ] **Step 1: Write the types**

```ts
// lib/site-planner/types.ts
import { LatLng } from './geo';

export interface CompetitorRecord { name: string; lat: number; lng: number; brand?: string; category?: string; }
export interface StoreRecord { name: string; lat: number; lng: number; storeId?: string; monthlySales?: number; format?: string; }
export interface DemographicRecord { suburb: string; population?: number; income?: number; lsm?: number; households?: number; density?: number; }

export interface RawPlace {
  lat: number; lng: number;
  rating?: number;
  userRatingCount?: number;
  types: string[];
  primaryType?: string;
  displayName?: string;
}

export interface CandidateNode {
  id: string;
  label: string;
  lat: number;
  lng: number;
  places: RawPlace[]; // POIs that formed this node
}

export interface FeatureVector {
  id: string;
  label: string;
  lat: number;
  lng: number;
  trafficProxy: { poiCount: number; totalReviews: number; anchorTypes: string[]; score0to100: number };
  accessibility: { transitStopsNearby: number; majorRoadAdjacent: boolean; score0to100: number };
  competition: { competitorsWithin1km: number; nearestCompetitorM: number | null };
  cannibalisation: { ownStoresWithin2km: number; nearestOwnStoreM: number | null };
  demographics: { source: 'csv' | 'proxy'; population?: number; income?: number; lsm?: number; affluenceProxy0to100: number };
}

export interface RankedSite {
  id: string;
  rank: number;
  compositeScore0to100: number;
  breakdown: { traffic: number; demographics: number; competition: number; accessibility: number };
  rationale: string;
  risks: string;
}

export interface RankedResult {
  overallSummary: string;
  ranked: RankedSite[];
}

export interface ScoringWeights { traffic: number; demographics: number; competition: number; accessibility: number; }
export const DEFAULT_WEIGHTS: ScoringWeights = { traffic: 0.4, demographics: 0.25, competition: 0.2, accessibility: 0.15 };

export type { LatLng };
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors from `types.ts` (pre-existing App.tsx errors from Task 2 are expected and ignored).

- [ ] **Step 3: Commit**

```bash
git add lib/site-planner/types.ts
git commit -m "feat: site-planner shared types"
```

---

### Task 5: CSV parsing + column mapping

**Files:**
- Create: `lib/site-planner/csv.ts`
- Test: `lib/site-planner/csv.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/site-planner/csv.test.ts
import { describe, it, expect } from 'vitest';
import { parseCompetitors, parseStores } from './csv';

describe('parseCompetitors', () => {
  it('maps standard headers and coerces numbers', () => {
    const csv = 'name,lat,lng,brand\nNandos Rosebank,-26.14,28.04,Nandos\n';
    const { records, errors } = parseCompetitors(csv);
    expect(errors).toHaveLength(0);
    expect(records).toEqual([{ name: 'Nandos Rosebank', lat: -26.14, lng: 28.04, brand: 'Nandos' }]);
  });

  it('matches case-insensitive / aliased headers (Latitude/Longitude)', () => {
    const csv = 'Name,Latitude,Longitude\nKFC,-26.2,28.1\n';
    const { records, errors } = parseCompetitors(csv);
    expect(errors).toHaveLength(0);
    expect(records[0]).toMatchObject({ name: 'KFC', lat: -26.2, lng: 28.1 });
  });

  it('reports a per-row error for an unparseable coordinate but keeps good rows', () => {
    const csv = 'name,lat,lng\nGood,-26.1,28.0\nBad,abc,28.0\n';
    const { records, errors } = parseCompetitors(csv);
    expect(records).toHaveLength(1);
    expect(records[0].name).toBe('Good');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('row 2');
  });

  it('flags rows missing both coordinates and address for geocoding', () => {
    const csv = 'name,address\nMug & Bean,Shop 5 Mall of Africa\n';
    const { records, errors } = parseCompetitors(csv);
    expect(records[0].lat).toBeNaN();
    expect(records[0].lng).toBeNaN();
    expect((records[0] as any).address).toBe('Shop 5 Mall of Africa');
  });
});

describe('parseStores', () => {
  it('parses optional monthly_sales as a number', () => {
    const csv = 'name,lat,lng,monthly_sales\nSteers CBD,-26.2,28.04,150000\n';
    const { records } = parseStores(csv);
    expect(records[0].monthlySales).toBe(150000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/site-planner/csv.test.ts`
Expected: FAIL — "Failed to resolve import './csv'".

- [ ] **Step 3: Write the implementation**

```ts
// lib/site-planner/csv.ts
import Papa from 'papaparse';
import { CompetitorRecord, StoreRecord, DemographicRecord } from './types';

export interface ParseResult<T> { records: (T & { address?: string })[]; errors: string[]; }

const ALIASES: Record<string, string[]> = {
  name: ['name', 'store', 'store_name', 'location', 'title'],
  lat: ['lat', 'latitude', 'y'],
  lng: ['lng', 'lon', 'long', 'longitude', 'x'],
  address: ['address', 'addr', 'street'],
  brand: ['brand', 'chain'],
  category: ['category', 'type', 'cuisine'],
  store_id: ['store_id', 'id', 'code'],
  monthly_sales: ['monthly_sales', 'sales', 'revenue', 'turnover'],
  format: ['format', 'store_format'],
  suburb: ['suburb', 'area', 'neighbourhood', 'neighborhood'],
  population: ['population', 'pop'],
  income: ['income', 'avg_income', 'median_income'],
  lsm: ['lsm', 'living_standard'],
  households: ['households', 'hh'],
  density: ['density', 'pop_density'],
};

/** Build a map of canonical-field -> actual header present in the file. */
function resolveHeaders(headers: string[]): Record<string, string> {
  const lower = headers.map(h => ({ raw: h, norm: h.trim().toLowerCase() }));
  const out: Record<string, string> = {};
  for (const [canonical, aliases] of Object.entries(ALIASES)) {
    const match = lower.find(h => aliases.includes(h.norm));
    if (match) out[canonical] = match.raw;
  }
  return out;
}

const num = (v: unknown): number => {
  if (v === undefined || v === null || String(v).trim() === '') return NaN;
  const n = Number(String(v).replace(/[, ]/g, ''));
  return Number.isFinite(n) ? n : NaN;
};

function parse<T>(csv: string, build: (row: any, map: Record<string, string>) => { record: T & { address?: string }; rowError?: string }): ParseResult<T> {
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
  const headerMap = resolveHeaders(parsed.meta.fields ?? []);
  const records: (T & { address?: string })[] = [];
  const errors: string[] = [];
  parsed.data.forEach((row, i) => {
    const { record, rowError } = build(row, headerMap);
    if (rowError) errors.push(`row ${i + 1}: ${rowError}`);
    records.push(record);
  });
  return { records, errors };
}

function coords(row: any, map: Record<string, string>) {
  const lat = num(row[map.lat]);
  const lng = num(row[map.lng]);
  const address = map.address ? String(row[map.address] ?? '').trim() : '';
  const missingCoords = Number.isNaN(lat) || Number.isNaN(lng);
  const hasRawCoordText = map.lat && String(row[map.lat] ?? '').trim() !== '';
  let rowError: string | undefined;
  if (missingCoords && !address) {
    rowError = hasRawCoordText ? 'unparseable lat/lng and no address' : 'missing lat/lng and no address';
  }
  return { lat, lng, address: address || undefined, rowError };
}

export function parseCompetitors(csv: string): ParseResult<CompetitorRecord> {
  return parse<CompetitorRecord>(csv, (row, map) => {
    const { lat, lng, address, rowError } = coords(row, map);
    return {
      record: {
        name: String(row[map.name] ?? '').trim() || 'Unnamed',
        lat, lng, address,
        brand: map.brand ? String(row[map.brand] ?? '').trim() || undefined : undefined,
        category: map.category ? String(row[map.category] ?? '').trim() || undefined : undefined,
      },
      rowError,
    };
  });
}

export function parseStores(csv: string): ParseResult<StoreRecord> {
  return parse<StoreRecord>(csv, (row, map) => {
    const { lat, lng, address, rowError } = coords(row, map);
    const sales = map.monthly_sales ? num(row[map.monthly_sales]) : NaN;
    return {
      record: {
        name: String(row[map.name] ?? '').trim() || 'Unnamed',
        lat, lng, address,
        storeId: map.store_id ? String(row[map.store_id] ?? '').trim() || undefined : undefined,
        monthlySales: Number.isNaN(sales) ? undefined : sales,
        format: map.format ? String(row[map.format] ?? '').trim() || undefined : undefined,
      },
      rowError,
    };
  });
}

export function parseDemographics(csv: string): ParseResult<DemographicRecord> {
  return parse<DemographicRecord>(csv, (row, map) => {
    const suburb = String(row[map.suburb] ?? '').trim();
    return {
      record: {
        suburb,
        population: map.population ? num(row[map.population]) || undefined : undefined,
        income: map.income ? num(row[map.income]) || undefined : undefined,
        lsm: map.lsm ? num(row[map.lsm]) || undefined : undefined,
        households: map.households ? num(row[map.households]) || undefined : undefined,
        density: map.density ? num(row[map.density]) || undefined : undefined,
      },
      rowError: suburb ? undefined : 'missing suburb/area name',
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/site-planner/csv.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/site-planner/csv.ts lib/site-planner/csv.test.ts
git commit -m "feat: CSV parsing with header aliasing + per-row errors"
```

---

### Task 6: Feature computation + score normalisation

**Files:**
- Create: `lib/site-planner/features.ts`
- Test: `lib/site-planner/features.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/site-planner/features.test.ts
import { describe, it, expect } from 'vitest';
import { computeFeatures } from './features';
import { CandidateNode } from './types';

const node = (id: string, lat: number, lng: number, places: any[]): CandidateNode => ({
  id, label: id, lat, lng, places,
});

const poi = (reviews: number, types: string[] = ['restaurant']) => ({
  lat: -26.1, lng: 28.05, userRatingCount: reviews, rating: 4.2, types, primaryType: types[0],
});

describe('computeFeatures', () => {
  it('gives the busiest node a higher traffic score than a quiet one', () => {
    const busy = node('busy', -26.10, 28.05, [poi(2000), poi(1500), poi(900)]);
    const quiet = node('quiet', -26.20, 28.15, [poi(20)]);
    const fv = computeFeatures([busy, quiet], { competitors: [], stores: [], demographics: [] });
    const b = fv.find(f => f.id === 'busy')!;
    const q = fv.find(f => f.id === 'quiet')!;
    expect(b.trafficProxy.score0to100).toBeGreaterThan(q.trafficProxy.score0to100);
    expect(b.trafficProxy.totalReviews).toBe(4400);
  });

  it('counts competitors within 1km and own stores within 2km', () => {
    const n = node('n', -26.100, 28.050, [poi(500)]);
    const fv = computeFeatures([n], {
      competitors: [{ name: 'C1', lat: -26.103, lng: 28.050 }], // ~330m
      stores: [{ name: 'S1', lat: -26.110, lng: 28.050 }],      // ~1.1km
      demographics: [],
    });
    expect(fv[0].competition.competitorsWithin1km).toBe(1);
    expect(fv[0].competition.nearestCompetitorM).toBeGreaterThan(300);
    expect(fv[0].cannibalisation.ownStoresWithin2km).toBe(1);
  });

  it('detects anchor types (mall/supermarket/transit)', () => {
    const n = node('n', -26.1, 28.05, [poi(100, ['shopping_mall']), poi(50, ['supermarket'])]);
    const fv = computeFeatures([n], { competitors: [], stores: [], demographics: [] });
    expect(fv[0].trafficProxy.anchorTypes).toEqual(expect.arrayContaining(['shopping_mall', 'supermarket']));
  });

  it('uses csv demographics when present and proxy otherwise', () => {
    const n = node('Rosebank', -26.14, 28.04, [poi(100)]);
    const withCsv = computeFeatures([n], { competitors: [], stores: [], demographics: [{ suburb: 'Rosebank', lsm: 9 }] }, 'Rosebank');
    expect(withCsv[0].demographics.source).toBe('csv');
    const noCsv = computeFeatures([n], { competitors: [], stores: [], demographics: [] });
    expect(noCsv[0].demographics.source).toBe('proxy');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/site-planner/features.test.ts`
Expected: FAIL — "Failed to resolve import './features'".

- [ ] **Step 3: Write the implementation**

```ts
// lib/site-planner/features.ts
import { haversineMeters } from './geo';
import {
  CandidateNode, FeatureVector, CompetitorRecord, StoreRecord, DemographicRecord,
} from './types';

const ANCHOR_TYPES = ['shopping_mall', 'supermarket', 'department_store', 'transit_station', 'bus_station', 'train_station', 'subway_station'];
const TRANSIT_TYPES = ['transit_station', 'bus_station', 'train_station', 'subway_station'];

export interface FeatureInputs {
  competitors: CompetitorRecord[];
  stores: StoreRecord[];
  demographics: DemographicRecord[];
}

/** Map a value through log scaling into 0..100 relative to the max in the set. */
function logScore(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.round((Math.log1p(value) / Math.log1p(max)) * 100);
}

export function computeFeatures(
  nodes: CandidateNode[],
  inputs: FeatureInputs,
  suburb?: string,
): FeatureVector[] {
  const reviewTotals = nodes.map(n =>
    n.places.reduce((s, p) => s + (p.userRatingCount ?? 0), 0),
  );
  const maxReviews = Math.max(1, ...reviewTotals);

  // Affluence proxy: presence of premium anchors + average rating across node POIs.
  const PREMIUM = ['shopping_mall', 'department_store', 'jewelry_store', 'car_dealer'];

  return nodes.map((node, idx) => {
    const totalReviews = reviewTotals[idx];
    const poiCount = node.places.length;
    const anchorTypes = [
      ...new Set(node.places.flatMap(p => p.types.filter(t => ANCHOR_TYPES.includes(t)))),
    ];
    const transitStopsNearby = node.places.filter(p => p.types.some(t => TRANSIT_TYPES.includes(t))).length;

    const trafficScore = Math.min(100, logScore(totalReviews, maxReviews) + Math.min(15, poiCount) + anchorTypes.length * 5);

    const accessibilityScore = Math.min(100, transitStopsNearby * 25 + (anchorTypes.length > 0 ? 20 : 0));

    const competitorDistances = inputs.competitors
      .filter(c => Number.isFinite(c.lat) && Number.isFinite(c.lng))
      .map(c => haversineMeters(node.lat, node.lng, c.lat, c.lng));
    const competitorsWithin1km = competitorDistances.filter(d => d <= 1000).length;
    const nearestCompetitorM = competitorDistances.length ? Math.round(Math.min(...competitorDistances)) : null;

    const storeDistances = inputs.stores
      .filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lng))
      .map(s => haversineMeters(node.lat, node.lng, s.lat, s.lng));
    const ownStoresWithin2km = storeDistances.filter(d => d <= 2000).length;
    const nearestOwnStoreM = storeDistances.length ? Math.round(Math.min(...storeDistances)) : null;

    const csvDemo = suburb
      ? inputs.demographics.find(d => d.suburb.trim().toLowerCase() === suburb.trim().toLowerCase())
      : undefined;

    const avgRating = poiCount ? node.places.reduce((s, p) => s + (p.rating ?? 0), 0) / poiCount : 0;
    const premiumAnchors = node.places.filter(p => p.types.some(t => PREMIUM.includes(t))).length;
    const affluenceProxy0to100 = Math.min(100, Math.round(avgRating * 12 + premiumAnchors * 10));

    return {
      id: node.id,
      label: node.label,
      lat: node.lat,
      lng: node.lng,
      trafficProxy: { poiCount, totalReviews, anchorTypes, score0to100: trafficScore },
      accessibility: { transitStopsNearby, majorRoadAdjacent: anchorTypes.length > 0, score0to100: accessibilityScore },
      competition: { competitorsWithin1km, nearestCompetitorM },
      cannibalisation: { ownStoresWithin2km, nearestOwnStoreM },
      demographics: csvDemo
        ? { source: 'csv', population: csvDemo.population, income: csvDemo.income, lsm: csvDemo.lsm, affluenceProxy0to100 }
        : { source: 'proxy', affluenceProxy0to100 },
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/site-planner/features.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/site-planner/features.ts lib/site-planner/features.test.ts
git commit -m "feat: per-node feature computation + score normalisation"
```

---

### Task 7: Pro reasoning client (schema + validation)

**Files:**
- Create: `lib/site-planner/reasoning.ts`
- Test: `lib/site-planner/reasoning.test.ts`

> The network call to Gemini is verified manually (Phase 4). Here we TDD the pure pieces: the prompt builder includes the right signals, and the response validator rejects malformed model output.

- [ ] **Step 1: Write the failing test**

```ts
// lib/site-planner/reasoning.test.ts
import { describe, it, expect } from 'vitest';
import { buildPrompt, validateRankedResult } from './reasoning';
import { FeatureVector, DEFAULT_WEIGHTS } from './types';

const fv: FeatureVector = {
  id: 'n1', label: 'Rosebank Mall', lat: -26.14, lng: 28.04,
  trafficProxy: { poiCount: 12, totalReviews: 5000, anchorTypes: ['shopping_mall'], score0to100: 88 },
  accessibility: { transitStopsNearby: 2, majorRoadAdjacent: true, score0to100: 70 },
  competition: { competitorsWithin1km: 1, nearestCompetitorM: 320 },
  cannibalisation: { ownStoresWithin2km: 0, nearestOwnStoreM: null },
  demographics: { source: 'csv', lsm: 9, affluenceProxy0to100: 80 },
};

describe('buildPrompt', () => {
  it('embeds brand, weights and each candidate id', () => {
    const p = buildPrompt({ brand: 'Steers', suburb: 'Rosebank', features: [fv], weights: DEFAULT_WEIGHTS, constraints: 'avoid malls' });
    expect(p).toContain('Steers');
    expect(p).toContain('Rosebank');
    expect(p).toContain('n1');
    expect(p).toContain('avoid malls');
    expect(p).toContain('0.4'); // traffic weight
  });
});

describe('validateRankedResult', () => {
  it('accepts a well-formed result', () => {
    const ok = validateRankedResult({
      overallSummary: 'x',
      ranked: [{ id: 'n1', rank: 1, compositeScore0to100: 90, breakdown: { traffic: 88, demographics: 80, competition: 70, accessibility: 70 }, rationale: 'good', risks: 'none' }],
    });
    expect(ok.ranked[0].id).toBe('n1');
  });
  it('throws on a missing ranked array', () => {
    expect(() => validateRankedResult({ overallSummary: 'x' })).toThrow();
  });
  it('throws when a ranked item lacks an id', () => {
    expect(() => validateRankedResult({ overallSummary: 'x', ranked: [{ rank: 1 }] })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/site-planner/reasoning.test.ts`
Expected: FAIL — "Failed to resolve import './reasoning'".

- [ ] **Step 3: Write the implementation**

```ts
// lib/site-planner/reasoning.ts
import { GoogleGenAI } from '@google/genai';
import { FeatureVector, RankedResult, ScoringWeights } from './types';

const API_KEY = process.env.API_KEY as string;
export const REASONING_MODEL = 'gemini-2.5-pro';

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    overallSummary: { type: 'STRING' },
    ranked: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'STRING' },
          rank: { type: 'NUMBER' },
          compositeScore0to100: { type: 'NUMBER' },
          breakdown: {
            type: 'OBJECT',
            properties: {
              traffic: { type: 'NUMBER' },
              demographics: { type: 'NUMBER' },
              competition: { type: 'NUMBER' },
              accessibility: { type: 'NUMBER' },
            },
            required: ['traffic', 'demographics', 'competition', 'accessibility'],
          },
          rationale: { type: 'STRING' },
          risks: { type: 'STRING' },
        },
        required: ['id', 'rank', 'compositeScore0to100', 'breakdown', 'rationale', 'risks'],
      },
    },
  },
  required: ['overallSummary', 'ranked'],
};

const SYSTEM = `You are a retail site-selection analyst for Famous Brands, a South African
quick-service-restaurant group. You receive candidate commercial sites in a suburb, each with
pre-computed signals (traffic proxy from Google Places review density, accessibility, nearby
competitor count, cannibalisation against existing Famous Brands stores, and demographics).
Score each site 0-100 as a weighted composite using the provided weights, rank them best-first,
and explain each ranking in plain business language. Penalise high cannibalisation and excessive
direct competition. Reward high traffic, good accessibility, and target-customer demographic fit.
Be specific about why a site wins or loses. Never invent data not present in the candidate.`;

export interface PromptInput {
  brand: string;
  suburb: string;
  features: FeatureVector[];
  weights: ScoringWeights;
  constraints?: string;
}

export function buildPrompt({ brand, suburb, features, weights, constraints }: PromptInput): string {
  return [
    `Brand to place: ${brand}`,
    `Suburb under analysis: ${suburb}`,
    `Scoring weights (sum 1.0): traffic=${weights.traffic}, demographics=${weights.demographics}, competition=${weights.competition}, accessibility=${weights.accessibility}`,
    constraints ? `Additional user constraints: ${constraints}` : '',
    `Candidate sites (JSON):`,
    JSON.stringify(features, null, 2),
    `Return the ranked result strictly as JSON matching the schema. Include every candidate id exactly once.`,
  ].filter(Boolean).join('\n\n');
}

export function validateRankedResult(data: any): RankedResult {
  if (!data || typeof data !== 'object') throw new Error('reasoning result is not an object');
  if (typeof data.overallSummary !== 'string') throw new Error('reasoning result missing overallSummary');
  if (!Array.isArray(data.ranked)) throw new Error('reasoning result missing ranked array');
  for (const item of data.ranked) {
    if (!item || typeof item.id !== 'string') throw new Error('ranked item missing id');
    if (typeof item.rank !== 'number') throw new Error(`ranked item ${item.id} missing rank`);
    if (!item.breakdown || typeof item.breakdown !== 'object') throw new Error(`ranked item ${item.id} missing breakdown`);
  }
  return data as RankedResult;
}

async function callPro(prompt: string): Promise<RankedResult> {
  if (!API_KEY) throw new Error('Missing required environment variable: API_KEY');
  const ai = new GoogleGenAI({ apiKey: API_KEY });
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await ai.models.generateContent({
        model: REASONING_MODEL,
        contents: prompt,
        config: {
          systemInstruction: SYSTEM,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA as any,
        },
      });
      return validateRankedResult(JSON.parse(res.text ?? ''));
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Pro reasoning failed');
}

/** First-pass ranking of detected candidates. */
export function analyzeSuburb(input: PromptInput): Promise<RankedResult> {
  return callPro(buildPrompt(input));
}

/** Re-rank the same candidates with an added natural-language constraint from chat. */
export function rerank(input: PromptInput, userMessage: string): Promise<RankedResult> {
  return callPro(buildPrompt({ ...input, constraints: [input.constraints, userMessage].filter(Boolean).join('; ') }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/site-planner/reasoning.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/site-planner/reasoning.ts lib/site-planner/reasoning.test.ts
git commit -m "feat: Gemini 2.5 Pro reasoning client (prompt + schema + validation)"
```

---

## Phase 2 — State

### Task 8: Planner Zustand store + state.ts cleanup

**Files:**
- Create: `lib/site-planner/data-store.ts`
- Modify: `lib/state.ts`

- [ ] **Step 1: Create the planner store**

```ts
// lib/site-planner/data-store.ts
import { create } from 'zustand';
import {
  CompetitorRecord, StoreRecord, DemographicRecord,
  CandidateNode, FeatureVector, RankedResult, ScoringWeights, DEFAULT_WEIGHTS,
} from './types';

export type AnalysisStatus = 'idle' | 'detecting' | 'reasoning' | 'done' | 'error';
export interface ChatMessage { role: 'user' | 'agent'; text: string; }

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
  reset: () => set({ candidates: [], features: [], result: null, status: 'idle', errorMessage: null, selectedSiteId: null, chat: [] }),
}));

export const FAMOUS_BRANDS = ['Steers', 'Debonairs Pizza', 'Wimpy', 'Mugg & Bean', 'Fishaways', 'Milky Lane'];
```

- [ ] **Step 2: Trim `lib/state.ts`**

In `lib/state.ts`: delete the `useSettings`, `personas`, `SCAVENGER_HUNT_PERSONA`, `useTools`, `Template`, `toolsets`, `systemPrompts` exports and the imports of `./tools/itinerary-planner` and `SYSTEM_INSTRUCTIONS`/`SCAVENGER_HUNT_PROMPT`. **Keep** `useMapStore`, `MapMarker`, `useUI`, `useLogStore`, `ConversationTurn` (still used by the chat transcript). Add to `MapMarker` a `rank?: number` field:

```ts
export interface MapMarker {
  position: { lat: number; lng: number; altitude: number };
  label: string;
  showLabel: boolean;
  rank?: number;
}
```

- [ ] **Step 3: Type-check the new store**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep site-planner || echo "no site-planner type errors"`
Expected: "no site-planner type errors".

- [ ] **Step 4: Commit**

```bash
git add lib/site-planner/data-store.ts lib/state.ts
git commit -m "feat: planner store; trim itinerary/voice state"
```

---

## Phase 3 — Maps integration

### Task 9: Commercial node detection from Places

**Files:**
- Create: `lib/site-planner/node-detection.ts`

> Browser-only (Google Places). No unit test — verified in Phase 4's run-through. Reuses the tested `geo.ts` clustering.

- [ ] **Step 1: Write the implementation**

```ts
// lib/site-planner/node-detection.ts
import { gridPoints, clusterPoints, Bounds, WeightedPoint } from './geo';
import { CandidateNode, RawPlace } from './types';

const SEARCH_TYPES = ['restaurant', 'shopping_mall', 'supermarket', 'cafe', 'store', 'transit_station'];

export interface DetectOptions {
  placesLib: google.maps.PlacesLibrary;
  geocoder: google.maps.Geocoder;
  query: string;            // "Rosebank, Johannesburg"
  gridSize?: number;        // sampling resolution (default 3 -> 9 points)
  searchRadiusM?: number;   // per-point radius (default 800)
  clusterRadiusM?: number;  // node merge radius (default 250)
  maxNodes?: number;        // top-N nodes to keep (default 8)
}

/** Geocode the suburb, sweep Places across it, and cluster POIs into nodes. */
export async function detectCommercialNodes(opts: DetectOptions): Promise<CandidateNode[]> {
  const { placesLib, geocoder, query } = opts;
  const gridSize = opts.gridSize ?? 3;
  const searchRadiusM = opts.searchRadiusM ?? 800;
  const clusterRadiusM = opts.clusterRadiusM ?? 250;
  const maxNodes = opts.maxNodes ?? 8;

  const geo = await geocoder.geocode({ address: query });
  if (!geo.results?.length) throw new Error(`Could not find "${query}".`);
  const vp = geo.results[0].geometry.viewport.toJSON(); // {north,south,east,west}
  const bounds: Bounds = { north: vp.north, south: vp.south, east: vp.east, west: vp.west };

  const seen = new Map<string, RawPlace>();
  for (const pt of gridPoints(bounds, gridSize)) {
    const { places } = await placesLib.Place.searchNearby({
      locationRestriction: { center: { lat: pt.lat, lng: pt.lng }, radius: searchRadiusM },
      includedTypes: SEARCH_TYPES,
      maxResultCount: 20,
      fields: ['location', 'displayName', 'rating', 'userRatingCount', 'types', 'primaryType'],
    });
    for (const p of places ?? []) {
      const loc = p.location;
      if (!loc) continue;
      const key = `${loc.lat().toFixed(5)},${loc.lng().toFixed(5)}`;
      if (seen.has(key)) continue;
      seen.set(key, {
        lat: loc.lat(), lng: loc.lng(),
        rating: p.rating ?? undefined,
        userRatingCount: p.userRatingCount ?? undefined,
        types: p.types ?? [],
        primaryType: p.primaryType ?? undefined,
        displayName: p.displayName ?? undefined,
      });
    }
  }

  const weighted: (WeightedPoint & { place: RawPlace })[] = [...seen.values()].map(p => ({
    lat: p.lat, lng: p.lng, weight: 1 + (p.userRatingCount ?? 0), place: p,
  }));

  const clusters = clusterPoints(weighted, clusterRadiusM)
    .map((c, i) => ({
      id: `node-${i + 1}`,
      label: '',
      lat: c.lat,
      lng: c.lng,
      places: c.members.map(m => (m as any).place as RawPlace),
    }))
    .sort((a, b) =>
      b.places.reduce((s, p) => s + (p.userRatingCount ?? 0), 0) -
      a.places.reduce((s, p) => s + (p.userRatingCount ?? 0), 0),
    )
    .slice(0, maxNodes);

  // Label each node by its highest-reviewed POI for human readability.
  for (const node of clusters) {
    const top = [...node.places].sort((a, b) => (b.userRatingCount ?? 0) - (a.userRatingCount ?? 0))[0];
    node.label = top?.displayName ? `Near ${top.displayName}` : `${node.lat.toFixed(3)}, ${node.lng.toFixed(3)}`;
  }
  return clusters;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep node-detection || echo "ok"`
Expected: "ok" (no errors in this file).

- [ ] **Step 3: Commit**

```bash
git add lib/site-planner/node-detection.ts
git commit -m "feat: commercial-node detection via Places sweep + clustering"
```

---

### Task 10: Rank-styled markers in MapController

**Files:**
- Modify: `lib/map-controller.ts`

- [ ] **Step 1: Read the current addMarkers implementation**

Run: `sed -n '1,200p' lib/map-controller.ts`
Expected: shows the `addMarkers(markers: MapMarker[])` method that creates `Marker3DElement`s.

- [ ] **Step 2: Update addMarkers to show rank + colour**

In `addMarkers`, when a marker has a numeric `rank`, prefix its label with the rank and tint top sites. Replace the marker label/glyph construction with:

```ts
// inside addMarkers(), per marker:
const rankPrefix = typeof marker.rank === 'number' ? `${marker.rank}. ` : '';
const label = `${rankPrefix}${marker.label}`;
// Colour: 1st = gold, 2-3 = green, rest = grey. Apply to the marker element
// background/style consistent with how the existing Marker3DElement is styled.
const color = marker.rank === 1 ? '#f4b400' : (marker.rank && marker.rank <= 3 ? '#0f9d58' : '#5f6368');
```

Use `label` for the marker's title/label and apply `color` wherever the existing code sets marker colour (follow the existing `Marker3DElement` construction pattern already in the file).

- [ ] **Step 3: Manual verify (deferred)**

Marker styling is verified visually in Task 17's run-through. No automated test.

- [ ] **Step 4: Commit**

```bash
git add lib/map-controller.ts
git commit -m "feat: rank-numbered, colour-tinted map markers"
```

---

## Phase 4 — UI & wiring

### Task 11: Planner context (replaces LiveAPIContext)

**Files:**
- Create: `contexts/PlannerContext.tsx`
- Delete: `contexts/LiveAPIContext.tsx`

- [ ] **Step 1: Create the context exposing map libs + an orchestration runner**

```tsx
// contexts/PlannerContext.tsx
import React, { createContext, FC, ReactNode, useContext, useCallback } from 'react';
import { detectCommercialNodes } from '@/lib/site-planner/node-detection';
import { computeFeatures } from '@/lib/site-planner/features';
import { analyzeSuburb, rerank } from '@/lib/site-planner/reasoning';
import { usePlannerStore } from '@/lib/site-planner/data-store';
import { useMapStore } from '@/lib/state';

interface PlannerContextValue {
  placesLib: google.maps.PlacesLibrary | null;
  geocoder: google.maps.Geocoder | null;
  runAnalysis: (city: string, suburb: string) => Promise<void>;
  sendChat: (message: string) => Promise<void>;
}

const Ctx = createContext<PlannerContextValue | undefined>(undefined);

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
      if (!nodes.length) { s.setError(`No commercial nodes found in ${query}. Try a larger or busier suburb.`); s.setStatus('error'); return; }
      s.setCandidates(nodes);
      const features = computeFeatures(nodes, { competitors: s.competitors, stores: s.stores, demographics: s.demographics }, suburb);
      s.setFeatures(features);
      // Markers for all candidates.
      useMapStore.getState().setMarkers(features.map(f => ({ position: { lat: f.lat, lng: f.lng, altitude: 1 }, label: f.label, showLabel: true })));

      s.setStatus('reasoning');
      const result = await analyzeSuburb({ brand: s.brand, suburb, features, weights: s.weights });
      s.setResult(result);
      // Re-label markers with ranks.
      const rankById = new Map(result.ranked.map(r => [r.id, r.rank]));
      useMapStore.getState().setMarkers(features.map(f => ({ position: { lat: f.lat, lng: f.lng, altitude: 1 }, label: f.label, showLabel: true, rank: rankById.get(f.id) })));
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
      const result = await rerank({ brand: s.brand, suburb: s.suburb, features: s.features, weights: s.weights }, message);
      s.setResult(result);
      s.addChat({ role: 'agent', text: result.overallSummary });
      const rankById = new Map(result.ranked.map(r => [r.id, r.rank]));
      useMapStore.getState().setMarkers(s.features.map(f => ({ position: { lat: f.lat, lng: f.lng, altitude: 1 }, label: f.label, showLabel: true, rank: rankById.get(f.id) })));
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
```

- [ ] **Step 2: Delete the old context**

Run: `git rm contexts/LiveAPIContext.tsx`

- [ ] **Step 3: Commit**

```bash
git add contexts/PlannerContext.tsx
git commit -m "feat: PlannerProvider orchestrating detect -> features -> Pro"
```

---

### Task 12: SuburbSearch component

**Files:**
- Create: `components/site-planner/SuburbSearch.tsx`

- [ ] **Step 1: Write the component**

```tsx
// components/site-planner/SuburbSearch.tsx
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
```

- [ ] **Step 2: Commit**

```bash
git add components/site-planner/SuburbSearch.tsx
git commit -m "feat: suburb + brand search entry point"
```

---

### Task 13: DataUpload component

**Files:**
- Create: `components/site-planner/DataUpload.tsx`

- [ ] **Step 1: Write the component**

```tsx
// components/site-planner/DataUpload.tsx
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
    if (kind === 'competitors') { const { records, errors } = parseCompetitors(text); setCompetitors(records); if (errors.length) addUploadErrors(errors.map(x => `competitors: ${x}`)); }
    if (kind === 'stores') { const { records, errors } = parseStores(text); setStores(records); if (errors.length) addUploadErrors(errors.map(x => `stores: ${x}`)); }
    if (kind === 'demographics') { const { records, errors } = parseDemographics(text); setDemographics(records); if (errors.length) addUploadErrors(errors.map(x => `demographics: ${x}`)); }
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
```

- [ ] **Step 2: Commit**

```bash
git add components/site-planner/DataUpload.tsx
git commit -m "feat: CSV upload UI for competitors/stores/demographics"
```

---

### Task 14: RankedPanel component

**Files:**
- Create: `components/site-planner/RankedPanel.tsx`

- [ ] **Step 1: Write the component**

```tsx
// components/site-planner/RankedPanel.tsx
import React from 'react';
import { usePlannerStore } from '@/lib/site-planner/data-store';
import { useMapStore } from '@/lib/state';

export default function RankedPanel() {
  const { result, features, status, errorMessage, selectSite, selectedSiteId } = usePlannerStore();

  if (status === 'error') return <div className="ranked-panel error">{errorMessage}</div>;
  if (status === 'detecting') return <div className="ranked-panel">Detecting commercial nodes…</div>;
  if (status === 'reasoning' && !result) return <div className="ranked-panel">Gemini 2.5 Pro is ranking sites…</div>;
  if (!result) return null;

  const featureById = new Map(features.map(f => [f.id, f]));

  const flyTo = (id: string) => {
    const f = featureById.get(id);
    if (!f) return;
    selectSite(id);
    useMapStore.getState().setCameraTarget({ center: { lat: f.lat, lng: f.lng, altitude: 300 }, range: 800, tilt: 55, heading: 0, roll: 0 });
  };

  return (
    <div className="ranked-panel">
      <p className="overall-summary">{result.overallSummary}</p>
      <ol className="ranked-list">
        {[...result.ranked].sort((a, b) => a.rank - b.rank).map(site => {
          const f = featureById.get(site.id);
          return (
            <li key={site.id} className={`ranked-item ${selectedSiteId === site.id ? 'selected' : ''}`} onClick={() => flyTo(site.id)}>
              <div className="ranked-head">
                <span className="rank-badge">{site.rank}</span>
                <span className="ranked-label">{f?.label ?? site.id}</span>
                <span className="ranked-score">{Math.round(site.compositeScore0to100)}</span>
              </div>
              <div className="ranked-bars">
                {(['traffic', 'demographics', 'competition', 'accessibility'] as const).map(k => (
                  <div key={k} className="bar"><span>{k}</span><i style={{ width: `${site.breakdown[k]}%` }} /></div>
                ))}
              </div>
              <p className="ranked-rationale">{site.rationale}</p>
              {site.risks && <p className="ranked-risks">⚠ {site.risks}</p>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/site-planner/RankedPanel.tsx
git commit -m "feat: ranked candidates panel with scores + fly-to"
```

---

### Task 15: ChatComposer + transcript repurpose

**Files:**
- Create: `components/site-planner/ChatComposer.tsx`
- Modify: `components/streaming-console/StreamingConsole.tsx`

- [ ] **Step 1: Write the ChatComposer (text-only, replaces ControlTray)**

```tsx
// components/site-planner/ChatComposer.tsx
import React, { useState, FormEvent } from 'react';
import { usePlanner } from '@/contexts/PlannerContext';
import { usePlannerStore } from '@/lib/site-planner/data-store';

export default function ChatComposer() {
  const { sendChat } = usePlanner();
  const { status, features } = usePlannerStore();
  const [text, setText] = useState('');
  const disabled = !features.length || status === 'reasoning' || status === 'detecting';

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || disabled) return;
    sendChat(text.trim());
    setText('');
  };

  return (
    <form className="chat-composer" onSubmit={onSubmit}>
      <input
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={features.length ? 'Refine: e.g. "weight foot traffic higher"' : 'Find sites first…'}
        disabled={disabled}
        aria-label="Refine ranking"
      />
      <button type="submit" disabled={disabled || !text.trim()}>Send</button>
    </form>
  );
}
```

- [ ] **Step 2: Replace StreamingConsole body with a planner chat transcript**

Replace the entire contents of `components/streaming-console/StreamingConsole.tsx` with a component that renders `usePlannerStore().chat` (no Live API, no transcription handlers):

```tsx
// components/streaming-console/StreamingConsole.tsx
import React, { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { usePlannerStore } from '@/lib/site-planner/data-store';

export default function StreamingConsole() {
  const chat = usePlannerStore(s => s.chat);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [chat]);

  if (!chat.length) return <div className="transcription-container" />;

  return (
    <div className="transcription-container">
      <div className="transcription-view" ref={scrollRef}>
        {chat.map((t, i) => (
          <div key={i} className={`transcription-entry ${t.role}`}>
            <div className="avatar"><span className="icon">{t.role === 'user' ? 'person' : 'auto_awesome'}</span></div>
            <div className="message-bubble">
              <div className="transcription-text-content">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{t.text}</ReactMarkdown>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add components/site-planner/ChatComposer.tsx components/streaming-console/StreamingConsole.tsx
git commit -m "feat: text chat composer + planner chat transcript"
```

---

### Task 16: App.tsx + Sidebar rewire

**Files:**
- Modify: `App.tsx`, `components/Sidebar.tsx`

- [ ] **Step 1: Rewrite App.tsx to use PlannerProvider and the new layout**

Replace the `LiveAPIProvider` import/usage with `PlannerProvider`, drop the voice props, and render `SuburbSearch`, `StreamingConsole`, `ChatComposer`, `RankedPanel`, and `Map3D`. Keep the existing `geocoder`/`placesLib`/`maps3dLib`/`elevationLib`/`MapController`/marker-framing effects from the current `AppComponent` (markers, cameraTarget, padding). The provider replaces the LiveAPI block:

```tsx
// in AppComponent's return — replace the <LiveAPIProvider> wrapper:
return (
  <PlannerProvider placesLib={placesLib} geocoder={geocoder}>
    <ErrorScreen />
    <Sidebar />
    <div className="streaming-console">
      <div className="console-panel" ref={consolePanelRef}>
        <SuburbSearch />
        <RankedPanel />
        <StreamingConsole />
        <ChatComposer ref={controlTrayRef as any} />
      </div>
      <div className="map-panel">
        <Map3D ref={element => setMap(element ?? null)} onCameraChange={handleCameraChange} {...viewProps} />
      </div>
    </div>
  </PlannerProvider>
);
```

Update imports at the top of `App.tsx`: remove `ControlTray`, `LiveAPIProvider`; add `PlannerProvider` from `@/contexts/PlannerContext`, `SuburbSearch`, `RankedPanel`, `ChatComposer` from `@/components/site-planner/*`. Keep `StreamingConsole`, `ErrorScreen`, `Sidebar`, `Map3D`, `useMapStore`, `MapController`. (For the `controlTrayRef` padding measurement, point the ref at the `ChatComposer` wrapper or drop the ref if not needed.)

- [ ] **Step 2: Rewrite Sidebar.tsx as the data + weights panel**

Replace the voice/model/persona settings in `components/Sidebar.tsx` with: the `DataUpload` component, four weight sliders bound to `usePlannerStore().weights`/`setWeights` (traffic, demographics, competition, accessibility), an upload-errors list, and the existing Export Logs / Reset buttons (Reset now calls `usePlannerStore.getState().reset()`):

```tsx
// core of the new Sidebar body
import DataUpload from '@/components/site-planner/DataUpload';
import { usePlannerStore } from '@/lib/site-planner/data-store';
// ...
const { weights, setWeights, uploadErrors, reset } = usePlannerStore();
const slider = (key: keyof typeof weights, label: string) => (
  <label>{label}: {weights[key].toFixed(2)}
    <input type="range" min={0} max={1} step={0.05} value={weights[key]}
      onChange={e => setWeights({ ...weights, [key]: Number(e.target.value) })} />
  </label>
);
// render: <DataUpload/>, slider('traffic','Traffic'), slider('demographics','Demographics'),
// slider('competition','Competition'), slider('accessibility','Accessibility'),
// {uploadErrors.length > 0 && <ul>{uploadErrors.map((e,i)=><li key={i}>{e}</li>)}</ul>}
// and a Reset button calling reset().
```

Remove imports of `AVAILABLE_VOICES_*`, `MODELS_WITH_LIMITED_VOICES`, `DEFAULT_VOICE`, `useSettings`, `useTools`, `personas`, and `useLiveAPIContext`.

- [ ] **Step 3: Strip voice constants from lib/constants.ts**

In `lib/constants.ts` delete `DEFAULT_LIVE_API_MODEL`, `DEFAULT_VOICE`, `VoiceOption`, `AVAILABLE_VOICES_FULL`, `AVAILABLE_VOICES_LIMITED`, `MODELS_WITH_LIMITED_VOICES`, `SYSTEM_INSTRUCTIONS`, and `SCAVENGER_HUNT_PROMPT` (all now unused). The file may end up empty — that's fine; delete it and remove any remaining imports if so.

- [ ] **Step 4: Type-check the whole project**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add App.tsx components/Sidebar.tsx lib/constants.ts
git commit -m "feat: rewire App + Sidebar for site planning; drop voice constants"
```

---

## Phase 5 — Verification

### Task 17: Full run-through + tests green

**Files:** none (verification)

- [ ] **Step 1: Run the unit suite**

Run: `npm test`
Expected: all `lib/site-planner/*.test.ts` PASS.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Start the dev server**

Run: `npm run dev`
Expected: Vite serves on `http://localhost:3000` with no console import errors.

- [ ] **Step 4: Manual flow (record results)**

Verify in the browser:
1. Pick brand "Steers", city "Johannesburg", suburb "Rosebank" → map flies there; status shows "Detecting…".
2. Candidates appear as markers; panel shows "Gemini 2.5 Pro is ranking sites…", then a ranked list with scores + rationale.
3. Markers re-label with rank numbers (1 gold, 2–3 green).
4. Click a ranked item → map flies to that site.
5. Upload a small competitors CSV + stores CSV in the sidebar, re-run → competition/cannibalisation reflected in rationale.
6. Type "weight foot traffic higher and avoid anything within 2km of an existing store" → ranking updates; chat shows the new summary.
7. Confirm no microphone prompt and no audio controls anywhere.

- [ ] **Step 5: Commit any fixes found during the run-through**

```bash
git add -A
git commit -m "fix: issues found during site-planner run-through"
```

---

## Self-review notes

- **Spec coverage:** suburb-first flow (T11/T12), node detection (T9), feature enrichment incl. competition/cannibalisation/demographics (T6), Pro reasoning + JSON schema (T7), ranked panel + map markers (T10/T14), chat re-rank (T11/T15), CSV uploads (T5/T13), voice removal (T2), weights (T16), error handling (T7 retry, T11 status/error, T5 per-row), Vitest (T1). South Africa brand list in T8.
- **Out of scope (per spec):** paid traffic feeds, real-estate listings, backend, chat-driven suburb switch, multi-country demographics — none included.
- **Type consistency:** `FeatureVector`, `CandidateNode`, `RankedResult`, `ScoringWeights` defined once in `types.ts` (T4) and imported everywhere; `computeFeatures(nodes, inputs, suburb?)`, `analyzeSuburb(input)`, `rerank(input, msg)`, `clusterPoints(points, radiusM)`, `gridPoints(bounds, n)` signatures match across tasks.

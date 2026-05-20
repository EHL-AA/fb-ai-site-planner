# Famous Brands Site Planner — Design Spec

**Date:** 2026-05-20
**Status:** Approved (design); pending implementation plan
**Owner:** ethan@automationarchitects.ai

## 1. Summary

Transform the existing **"Chat with Maps Live"** itinerary-planner demo into a
**store site-selection tool for Famous Brands (South Africa)**. The user picks a
city/suburb, the app auto-detects candidate commercial sites, enriches each with
traffic/competition/demographic signals, and **Gemini 2.5 Pro (thinking on)**
produces a ranked list of where to open a store with written reasoning. Voice is
removed entirely. The existing 3D map is kept and repurposed to display ranked
candidate sites.

### What stays
- React 19 + Vite + TypeScript shell, client-only (no backend).
- `@vis.gl/react-google-maps` 3D map (`Map3D`), `MapController`, `look-at` camera
  framing, and the `frameEstablishingShot` / `frameLocations` camera logic
  (called directly by the app instead of via model tool-calls).
- Zustand state pattern.

### What goes
- The entire voice / Gemini **Live API** layer: audio recorder, audio streamer,
  audio worklets, `genai-live-client`, `use-live-api`, the WebSocket tool-call
  dispatcher, voice constants, and the `microphone` permission.

### What's new
- Suburb-first entry flow.
- Commercial-node detection from Google Places.
- Per-node feature computation (traffic proxy, accessibility, competition,
  cannibalisation, demographics).
- CSV upload (competitors, own stores, optional demographics).
- Gemini 2.5 Pro reasoning client with a strict JSON response schema.
- Ranked-candidates side panel + rank-styled map markers.
- Text chat for refinement / re-ranking.

## 2. Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Optimisation objective | **Composite score**: traffic + demographics + competition + accessibility |
| Traffic data | **Proxy from Maps signals** (Places review-count density, anchors, transit). No paid feed. |
| Other data sources | Demographics/census, competitors (user has data), own store list |
| Model & UX | **Gemini 2.5 Pro chat + ranked panel**, on the 3D map |
| Candidate sites | **Auto-find commercial nodes** from Places clustering |
| Data input | **CSV / file upload in browser** |
| Backend | **Client-only** (API key in bundle; acceptable for internal tool) |
| Market | **South Africa** (Famous Brands) |
| Reasoning approach | **A — Signals → Pro reasoning**: code gathers signals; Pro scores/ranks/explains; chat re-ranks |

## 3. End-to-end flow

1. **Start on geography.** Suburb search box (City → Suburb) is the entry point.
   Selecting a suburb geocodes it and flies the map there using existing
   `frameEstablishingShot` camera logic.
2. **Auto-detect candidate sites.** Search Google Places across the suburb,
   cluster businesses into **commercial nodes** (high reviewed-business density =
   traffic proxy), pick the top ~5–10 nodes as candidate sites.
3. **Enrich each candidate** with traffic proxy, accessibility, competition (from
   uploaded competitor CSV), cannibalisation (from uploaded own-stores CSV), and
   demographics (uploaded suburb-level CSV, or affluence proxy if absent).
4. **Pro reasons.** Structured candidate table + brand context + current weights
   go to Gemini 2.5 Pro (thinking on); it returns a ranked list with composite
   score, per-site rationale, risks, and an overall summary.
5. **See it.** Ranked candidates render as numbered/colour-coded markers on the
   3D map and in a ranked side panel (score + reasoning; click a site to fly to it).
6. **Refine by chat.** Text chat re-ranks the *same* candidates against new
   constraints (e.g. "weight foot traffic higher", "exclude anything within 2km of
   an existing store", "only high-LSM areas").

## 4. Architecture & data flow

Client-only; the **app orchestrates** (no model tool-call loop).

```
Suburb pick ──► node-detection.ts ──► features.ts ──┐
(Geocode +      (Places search +     (per-node       │
 Places)         clustering)          feature vector)│
                                                      ▼
Uploaded CSVs ──► data-store.ts ───────────► reasoning.ts (Gemini 2.5 Pro,
(competitors,     (Zustand: parsed data,      thinking on, JSON schema out)
 stores, demo)     candidates, weights)             │
                                                     ▼
                                         Ranked sites + rationale
                                          │                   │
                                          ▼                   ▼
                                   RankedPanel.tsx       MapController
                                   (list + scores)       (ranked markers)
                                          ▲
                                   ChatComposer ──► reasoning.ts (re-rank
                                   (refine)          with same candidates)
```

## 5. Data model

### 5.1 Uploaded CSVs (parsed in-browser, lenient column matching)

| File | Required columns | Optional |
|---|---|---|
| **Competitors** | `name`, `lat`, `lng` (or `address` to geocode) | `brand`, `category` |
| **Your stores** | `name`, `lat`, `lng` (or `address`) | `store_id`, `monthly_sales`, `format` |
| **Demographics** (optional) | `suburb` (or `area`), one of `population` / `income` / `lsm` | `households`, `age_band`, `density` |

CSV handling: drag-drop upload; a column-mapping step when headers don't match the
expected names; geocode `address` rows when lat/lng are absent; per-row error
reporting that never hard-fails the whole file.

### 5.2 Candidate feature vector (computed per detected node)

```ts
{
  id: string,
  label: string,
  lat: number,
  lng: number,
  trafficProxy:   { poiCount: number, totalReviews: number, anchorTypes: string[], score0to100: number },
  accessibility:  { transitStopsNearby: number, majorRoadAdjacent: boolean, score0to100: number },
  competition:    { competitorsWithin1km: number, nearestCompetitorM: number | null },
  cannibalisation:{ ownStoresWithin2km: number, nearestOwnStoreM: number | null },
  demographics:   { source: 'csv' | 'proxy', population?: number, income?: number, lsm?: number, affluenceProxy0to100: number }
}
```

### 5.3 Pro input/output

`reasoning.ts` calls `gemini-2.5-pro` with `thinkingConfig` enabled and a strict
`responseSchema` (`responseMimeType: 'application/json'`) so output is reliable.
Prompt carries brand context (which Famous Brands marque, target customer) and the
current weight settings. Chat refinement re-sends the same candidate vectors +
conversation history + updated constraints.

```ts
// Output schema
{
  overallSummary: string,
  ranked: [
    {
      id: string,
      rank: number,
      compositeScore0to100: number,
      breakdown: { traffic: number, demographics: number, competition: number, accessibility: number },
      rationale: string,
      risks: string
    }
  ]
}
```

## 6. File-level change plan

### Remove (voice / Live layer)
- `lib/audio-recorder.ts`
- `lib/audio-streamer.ts`
- `lib/audioworklet-registry.ts`
- `lib/worklets/audio-processing.ts`, `lib/worklets/vol-meter.ts`
- `lib/genai-live-client.ts`
- `hooks/use-live-api.ts`
- WebSocket tool-call dispatcher (was inside `use-live-api`)
- Voice constants in `lib/constants.ts` (`AVAILABLE_VOICES_*`, `DEFAULT_VOICE`,
  `MODELS_WITH_LIMITED_VOICES`, voice-related model list)
- `microphone` permission in `metadata.json`

### Create
- `lib/site-planner/node-detection.ts` — geocode suburb, Places search, cluster into nodes
- `lib/site-planner/features.ts` — per-node feature vector + score normalisation
- `lib/site-planner/reasoning.ts` — Gemini 2.5 Pro client + response schema + re-rank
- `lib/site-planner/data-store.ts` — Zustand store: uploads, candidates, ranking, weights, suburb, brand
- `lib/site-planner/csv.ts` — CSV parsing + column mapping + geocoding fallback
- `components/site-planner/SuburbSearch.tsx` — City/suburb entry
- `components/site-planner/RankedPanel.tsx` — ranked candidates list (scores + reasoning + fly-to)
- `components/site-planner/DataUpload.tsx` — CSV upload UI
- `components/site-planner/ChatComposer.tsx` — text-only chat input

### Modify / repurpose
- `App.tsx` — remove `LiveAPIProvider` voice wiring; add suburb-start + planner
  state; keep `Map3D`
- `contexts/LiveAPIContext.tsx` → lightweight planner context
- `components/streaming-console/StreamingConsole.tsx` → chat transcript (no Live
  transcription handlers)
- `components/ControlTray.tsx` → folded into `ChatComposer` (text only; mic /
  speaker / connect buttons removed)
- `components/Sidebar.tsx` → data uploads + weight sliders + brand selector
  (voice/model-voice settings removed)
- `lib/state.ts` — markers → ranked candidates; settings → Pro model; voice removed
- `lib/map-controller.ts` — rank-styled markers (number + colour by rank)
- `lib/maps-grounding.ts` — kept as **optional** per-node enrichment (e.g. "anchor
  tenants / vibe"); no longer on the critical path

## 7. Error handling

- **No Places results** for an obscure suburb → message + manual-address fallback.
- **CSV parse errors** → per-row error report; never hard-fail the whole file.
- **Missing demographics** → proceed with affluence proxy; flag the gap in the
  rationale.
- **Pro API error / invalid JSON** → one retry, then graceful error in the panel.
- **Places quota/cost** → cap searches per suburb and surface the call count.

## 8. Testing

The repo has no test framework today. Add **Vitest** for the pure logic:
- CSV parsing + column mapping
- node clustering / commercial-node detection
- feature computation + score normalisation
- Pro-response schema validation

UI is verified manually via the run flow (suburb pick → candidates → rank → chat).

## 9. Out of scope (v1)

- Paid foot-traffic providers (Placer.ai, Unacast, SafeGraph) — left as a future
  pluggable source.
- Real estate / available-site listings.
- Backend / key hiding / multi-user persistence.
- Chat-driven suburb switching (suburb change is a UI action in v1).
- Global / multi-country demographics.

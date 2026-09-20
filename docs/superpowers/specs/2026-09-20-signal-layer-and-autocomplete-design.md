# Signal Layer + Suburb Autocomplete — Design Spec

**Date:** 2026-09-20
**Status:** Approved (design); implementation plan to follow
**Owner:** ethan@automationarchitects.ai
**Builds on:** `2026-05-20-famous-brands-site-planner-design.md`

> **Revision 2026-09-20 (b) — foot traffic removed, traffic/affluence signals from Google added.**
> After the first live runs the owner ruled that a foot-traffic feed will not be
> sourced. The `footTraffic` key, its adapter (§3.3), CSV upload and 0.40 weight
> are removed. In their place, three zero-cost signals derived from data Google
> already returns: (1) Routes congestion is now measured at **three weekday
> departure slots** (07:30 / 12:30 / 17:30 SAST; 13 calls per node), exposing
> morning/lunch/evening busyness; (2) **`tradeHours`** — share of businesses
> within 600 m open after 20:00 and on Sundays, from `regularOpeningHours`;
> (3) **`priceLevel`** — mean Google price band within 600 m, with a suburb-wide
> `proxy` fallback when fewer than 3 nearby businesses carry one. Each node now
> carries `nearby` (all swept POIs within 600 m) and `SignalContext.swept` holds
> the whole sweep. Blend weights (§3.6): traffic = peak 0.25, lunch 0.15,
> tradeHours 0.15, density 0.20, review 0.25; demographics = priceLevel 0.40,
> retailMix 0.20, census 0.40 (an uploaded LSM replaces both Google affluence
> parts at 0.60). Sections below describe the original design; where they
> mention foot traffic, this note supersedes them.

## 1. Summary

Two changes to the Famous Brands Site Planner:

1. **Suburb autocomplete.** Replace the free-text City + Suburb inputs with a
   single Google Places autocomplete box restricted to South African suburbs.
   Selecting a suggestion yields a place ID, viewport and address components,
   which feed node detection directly.
2. **Pluggable signal layer.** Replace the single review-density traffic proxy
   with a set of independent, provenance-tagged signal sources (Routes traffic,
   Places Aggregate density, retail-mix affluence, Stats SA census density, and
   a foot-traffic adapter). Each signal records where it came from and whether
   it is measured or a proxy. Gemini receives that provenance and the UI shows
   it.

Google exposes no official foot-traffic API. Popular-times scraping is
excluded (Terms of Service). A paid mobility vendor is the correct long-term
source; the adapter interface exists so one can be added without touching the
rest of the app.

### Verified before design (2026-09-20, project's Maps key)

| Capability | Result |
|---|---|
| Routes API `computeRoutes`, `TRAFFIC_AWARE` | Works. Returns `duration` (live) and `staticDuration` (free-flow). |
| Places Autocomplete (New), `includedRegionCodes: ['za']` | Works. "Rosebank" → Johannesburg sublocality + place ID. |
| Places Aggregate API `computeInsights` | **Disabled on project 483512146018.** Must be enabled in Cloud console. Free preview tier. |
| Stats SA Census 2022 | Ward-level population + households available as CSV via SuperWEB2. Income **not released**. |

## 2. Suburb autocomplete

### Behaviour

- One input, placeholder "Search a suburb…", replaces City + Suburb.
- Typing (≥ 2 chars, debounced 200 ms) calls
  `google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions` with:
  - `includedRegionCodes: ['za']`
  - `includedPrimaryTypes: ['sublocality', 'locality', 'neighborhood']`
  - `sessionToken` (one `AutocompleteSessionToken` per typing session)
- Suggestions render as a dropdown under the input: main text bold, secondary
  text muted. Keyboard: ↑/↓/Enter/Esc. Click selects.
- Selecting calls `prediction.toPlace().fetchFields({ fields: ['location',
  'viewport', 'addressComponents', 'displayName'] })`, which closes the session.
- City is derived from `addressComponents` (first of `locality`,
  `administrative_area_level_2`, `administrative_area_level_1`). Suburb is
  `displayName`.
- "Find sites" is enabled only after a selection (not on raw text).

### Data flow change

`runAnalysis(city, suburb)` becomes `runAnalysis(selection: SuburbSelection)`:

```ts
interface SuburbSelection {
  placeId: string;
  suburb: string;        // displayName
  city: string;          // derived
  center: LatLng;
  viewport: Bounds;      // {north,south,east,west}
}
```

`detectCommercialNodes` accepts `viewport` + `center` and no longer geocodes.
The `geocoder` dependency is removed from `PlannerContext` and
`detectCommercialNodes`. (Geocoder stays available for CSV address rows.)

### Files

- **Create** `components/site-planner/SuburbSearch.tsx` — input + dropdown.
- **Create** `lib/site-planner/suburb-autocomplete.ts` — thin wrapper around the
  Places calls returning `SuburbSelection`; testable via an injected `placesLib`.
- **Modify** `components/site-planner/SitesSidebar.tsx` — swap inputs.
- **Modify** `contexts/PlannerContext.tsx`, `lib/site-planner/node-detection.ts`
  — new signature.
- **Modify** `lib/site-planner/data-store.ts` — store `selection`.

## 3. Signal layer

### 3.1 Interface

```ts
// lib/site-planner/signals/types.ts
export type Provenance = 'measured' | 'proxy' | 'unavailable';

export interface Signal<T> {
  value: T;
  provenance: Provenance;
  source: string;         // human label, e.g. "Google Routes API (live traffic)"
  note?: string;          // short caveat shown in UI / prompt
}

export interface SignalContext {
  selection: SuburbSelection;
  mapsApiKey: string;
  fetchImpl: typeof fetch;             // required (no ambient fetch fallback; tests inject a fake)
  budget: CallBudget;                  // tracks API calls per run
  now: Date;
  retail: PlaceRec[];                  // bundled retail anchors (public/data/retail.json)
  footTrafficRows: FootTrafficRecord[]; // uploaded vendor foot-traffic rows (may be empty)
}

export interface SignalSource<K extends keyof NodeSignals> {
  id: K;
  label: string;
  /** Enrich every node. Must never throw; return `unavailable` signals instead. */
  enrich(nodes: CandidateNode[], ctx: SignalContext): Promise<NodeSignals[K][]>;
}
```

`NodeSignals` (defined in 3.5) is the per-node record of signals keyed by
source id. Each source returns one entry per node in the same order.

### 3.2 Sources

| id | Source | Signal(s) per node | Provenance | API calls / node |
|---|---|---|---|---|
| (base score) | Existing Places sweep — folded into `trafficProxy`, not a `NodeSignals` key; listed as a `proxy` row in `sources` | `poiCount`, `totalReviews`, `anchorTypes`, `transitStopsNearby` | proxy | 0 (reuses detection data) |
| `routesTraffic` | Routes API `computeRoutes` | `congestionIndex0to100` (mean of live/static ratio on 4 × 1.5 km legs N/E/S/W at fixed weekday 17:30 SAST departure), `driveMinutesFromCentre` | measured | 5 |
| `placesDensity` | Places Aggregate `computeInsights` | counts within 1 km for: `corporate_office`, `school`, `university`, `gym`, `supermarket`, `bar`, `restaurant`, `cafe`; derived `daytimeIndex0to100` (offices+schools+universities), `eveningIndex0to100` (bars+restaurants+cafes), log-scaled against the busiest node | measured (counts) / proxy (indices) | 8 |
| `retailMix` | Bundled `retail.json` | within 2 km: `premiumAnchors` (Woolworths, Checkers), `valueAnchors` (Boxer, Usave, Shoprite), `affluenceIndex0to100 = premium / (premium+value)` scaled, `unavailable` if < 2 anchors | proxy | 0 |
| `census` | Bundled Stats SA ward CSV | nearest ward: `population`, `households`, `densityPerKm2` | measured | 0 |
| `tradeHours` | Places sweep `regularOpeningHours` | within 600 m: `openLate0to100`, `openSunday0to100`, `sample` | measured | 0 |
| `priceLevel` | Places sweep `priceLevel` | within 600 m: `meanLevel` (1–4), `index0to100`, `sample`; suburb-wide fallback | measured / proxy (fallback) | 0 |
| ~~`footTraffic`~~ | removed in revision (b) | — | — | — |

Spar and Pick n Pay are deliberately unclassified: they straddle the
premium/value line in South Africa. This excludes roughly half of bundled
anchors and makes the `< 2 anchors → unavailable` threshold fire more often;
revisit if a better income proxy becomes available.

Per-node API calls ≈ 13; 8 nodes ≈ 104 calls per run. Both Routes and Aggregate
free tiers cover this comfortably. `CallBudget` counts calls and the UI shows
"N API calls" for the run.

**Routes leg timing.** Departure time is the next weekday at 17:30
`Africa/Johannesburg`. `routingPreference: TRAFFIC_AWARE`,
`travelMode: DRIVE`, field mask `routes.duration,routes.staticDuration`.
Congestion ratio = `duration / staticDuration`; index = clamp((ratio − 1) / 0.6) × 100.

**Places Aggregate.** `insights: ['INSIGHT_COUNT']`, `locationFilter.circle`,
`typeFilter.includedTypes` one type per request; requests for a node run in
parallel with `Promise.allSettled`. A `SERVICE_DISABLED` response marks every
`placesDensity` signal `unavailable` with note "Enable Places Aggregate API on
the Maps project." and does **not** fail the run.

Before fanning out, the source probes with a single call (first node, first
type). If that probe comes back `SERVICE_DISABLED`, it short-circuits: no
further calls are made and every node's `density` signal is `unavailable`.

**Census.** `public/data/census-wards.json`: `[{ ward, muni, lat, lng,
population, households, areaKm2 }]` prepared offline from Stats SA SuperWEB2
(ward-level, Census 2022) + MDB 2020 ward centroids. If the file is missing or
empty, signals are `unavailable`. Data-prep script lives in
`scripts/prepare-census.mjs` and is documented in the README.

### 3.3 Foot-traffic adapter

```ts
// lib/site-planner/signals/foot-traffic.ts
export interface FootTrafficProvider {
  id: string;
  label: string;
  lookup(nodes: CandidateNode[], ctx: SignalContext): Promise<Array<{ dailyVisits: number; peakHour?: number } | null>>;
}
```

Implementations at launch:

- `NullFootTrafficProvider` — returns `null` for every node → `unavailable`,
  note "No foot-traffic feed connected."
- `CsvFootTrafficProvider` — uses a user-uploaded CSV (`lat`, `lng`,
  `daily_visits`, optional `peak_hour`) via the existing upload UI; matches the
  nearest point within 300 m.

The active provider is chosen in `signals/index.ts`. A vendor API provider is
added by implementing the interface only.

### 3.4 Orchestration

`lib/site-planner/signals/index.ts` exports
`gatherSignals(nodes, ctx): Promise<NodeSignals[]>`. It runs all sources with
`Promise.allSettled`; a rejected source becomes `unavailable` for every node
(defensive — sources are also required not to throw). It then calls
`composeFeatures(nodes, signals, inputs, suburb)` (the successor of
`computeFeatures`), which produces the extended `FeatureVector`.

### 3.5 Extended feature vector

The existing `FeatureVector` keeps every current field (so `display.ts`,
`DetailCard`, and the feature tests keep working). Two optional fields are
added, and the three existing scores become blended values:

```ts
export interface FeatureVector {
  // ...existing fields unchanged: trafficProxy, accessibility, competition, cannibalisation, demographics
  /** Provenance-tagged signals from lib/site-planner/signals (absent on legacy paths). */
  signals?: NodeSignals;
  /** Flattened source list for UI + prompt. */
  sources?: SourceRow[];   // { label, provenance, note? }
}

export interface NodeSignals {
  congestion:  Signal<{ index0to100: number; driveMinutesFromCentre: number | null } | null>;
  density:     Signal<{ daytimeIndex0to100: number; eveningIndex0to100: number; counts: Record<string, number> } | null>;
  affluence:   Signal<{ index0to100: number; premiumAnchors: number; valueAnchors: number } | null>;
  census:      Signal<{ ward: string; population: number; households: number; densityPerKm2: number } | null>;
  footTraffic: Signal<{ dailyVisits: number; peakHour?: number } | null>;
}
```

`trafficProxy.score0to100`, `demographics.affluenceProxy0to100` and
`accessibility.score0to100` are overwritten with the blended values from 3.6.
The `reviewDensity` signal is the existing `trafficProxy` data and is always a
`proxy`.

### 3.6 Scoring blend (pure, unit-tested)

Traffic score = weighted mean over **available** signals, weights renormalised:

| Signal | Weight if available |
|---|---|
| footTraffic (log-scaled vs max in set) | 0.40 |
| congestion index | 0.20 |
| density (mean of daytime, evening) | 0.20 |
| reviewDensity (existing log score) | 0.20 |

Demographics score = renormalised mean of `affluence.index` (0.6) and
census `densityPerKm2` log-scaled vs max (0.4). Uploaded CSV `lsm`
overrides affluence when present (income override deferred).

Accessibility score = existing formula + up to 20 points for
`driveMinutesFromCentre ≤ 5`, linearly to 0 at 15 min.

The four user weights (traffic / demographics / competition / accessibility)
and their sliders are unchanged.

### 3.7 Prompt changes

`buildPrompt` appends a **Data provenance** block listing each source with its
provenance and note, and adds to the system instruction: *"Signals marked
`proxy` are indirect estimates; signals marked `unavailable` were not collected.
Do not treat proxies as measured foot traffic, and say so in the rationale when
a ranking rests mainly on proxies."*

## 4. UI

- **SuburbSearch** replaces City + Suburb (section 2).
- **DetailCard** gains a "Data sources" section: one row per source with a
  badge (`measured` green, `proxy` amber, `unavailable` grey) and the note.
- **DetailCard** signal rows: congestion index, daytime/evening density,
  affluence index, ward population, foot traffic (or "not connected").
- **MapChrome** status line shows "N API calls" after a run.
- **Sidebar → DataUpload** adds a "Foot traffic (vendor export)" upload.
- **AssistantPanel** guidance text mentions provenance ("ask *why is site 2
  ranked above 1*").

## 5. Error handling

| Failure | Behaviour |
|---|---|
| Autocomplete request fails | Dropdown shows "Search unavailable"; input stays editable; "Find sites" disabled. |
| Routes API error / quota | `congestion` = `unavailable`; run continues. |
| Places Aggregate disabled / error | `density` = `unavailable` with enable-API note; run continues. |
| Census file missing | `census` = `unavailable`; run continues. |
| All traffic signals unavailable | Traffic score falls back to `reviewDensity` alone and the prompt says so. |

No signal failure aborts a run. Only node detection (no POIs) or the reasoning
call can fail the run, as today.

## 6. Testing

Vitest, pure logic only:

- `suburb-autocomplete.test.ts` — city derivation from address components;
  selection shape.
- `signals/routes-traffic.test.ts` — congestion index from mocked responses;
  leg geometry; departure-time computation.
- `signals/places-density.test.ts` — index derivation; `SERVICE_DISABLED` →
  unavailable.
- `signals/retail-mix.test.ts` — premium/value classification; < 2 anchors →
  unavailable.
- `signals/census.test.ts` — nearest-ward join; missing file → unavailable.
- `signals/foot-traffic.test.ts` — CSV provider nearest-match within 300 m;
  null provider.
- `compose-features.test.ts` — blend with all/some/none available; weight
  renormalisation; CSV LSM override.
- `reasoning.test.ts` — prompt includes provenance block.

Manual: pick "Rosebank", run, confirm detail card sources and API call count.

## 7. Out of scope

- Vendor foot-traffic API integration (interface only).
- Ward boundary polygons (centroid join only).
- Re-enabling voice.
- Backend / key hiding.

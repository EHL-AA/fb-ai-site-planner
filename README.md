# Famous Brands Site Planner

A React/TypeScript/Vite app that helps Famous Brands pick new retail sites. Pick
a suburb (Places autocomplete), and the app scans it for candidate nodes,
gathers traffic, trading-hours, affluence, and census signals for
each one, and asks Gemini to rank them with a written rationale you can
interrogate in chat — all rendered on a photorealistic 3D map. It uses both
the Gemini API and Google Maps Platform services; review the Terms of Service
applicable to your region before using it in production.

## Setup

1. Copy `.env.example` to `.env` and fill in:
   - `GEMINI_API_KEY` — from [Google AI Studio](https://aistudio.google.com/apikey), used for Gemini 3.8 Flash ranking.
   - `MAPS_API_KEY` — your own Google Maps Platform key, with **billing enabled**, from a project with these APIs enabled: Maps JavaScript API, Places API (New), Geocoding API, Routes API, Places Aggregate API, and Map Tiles API (for photorealistic 3D). If the key has API restrictions, the same APIs must be allowed on the key itself, otherwise the Routes and density signals show as unavailable.
   - `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_APP_ID` — from your Firebase project's web app config, used for the sign-in screen.
2. Install and run:

```bash
npm install
npm run dev     # start the dev server
npm test        # run the vitest suite
npm run build   # production build
```

For local UI testing without signing in (for example with Playwright), open `http://localhost:3000/?devauth=1`. The bypass only exists under the Vite dev server and is removed from production builds.

## Architecture

**Entry flow:** suburb autocomplete (`components/site-planner/SuburbSearch.tsx`,
`lib/site-planner/suburb-autocomplete.ts`) → candidate node detection from a
Places sweep of the suburb (`lib/site-planner/node-detection.ts`) → the signal
layer gathers per-node data (`lib/site-planner/signals/`, orchestrated by
`gatherSignals` in `signals/index.ts`) → signals are blended into a feature
vector (`lib/site-planner/compose-features.ts`) → Gemini 3.8 Flash ranks the
nodes with per-signal provenance in its prompt (`lib/site-planner/reasoning.ts`)
→ results render on the 3D map with a ranked list and a per-site detail card.

**Signal sources**, each tagged with its provenance so the UI and the model
both know how much to trust it:

| Source | What it measures | Provenance |
|---|---|---|
| Routes congestion | Live vs. free-flow drive-time ratio on 4 legs out of the node at weekday 07:30, 12:30 and 17:30 (Routes API) | measured |
| Opening hours | Share of businesses within 600 m open after 20:00 on weekdays and on Sundays (Places sweep) | measured |
| Price band | Average Google price band (1–4) of businesses within 600 m; suburb-wide average when fewer than 3 nearby carry one | measured, or proxy for the suburb-wide fallback |
| Places Aggregate density | Daytime/evening place-type counts within 1 km | measured (unavailable until the Places Aggregate API is enabled) |
| Retail-mix affluence | Ratio of premium to value anchor brands within 2 km | proxy |
| Census wards | Nearest Stats SA ward's population/household density | measured (unavailable until the census data file is prepared — see below) |

Foot traffic is deliberately not a signal: Google exposes no visitation data, and scraping popular times breaks its terms. Vehicle congestion, trading hours and price bands stand in for "how busy and how affluent is this node".

**Data sources & provenance.** Every signal carries a `measured` / `proxy` /
`unavailable` tag. Both the site detail card and the Gemini prompt show this
provenance, so a ranking rationale can be checked against which numbers are
real measurements versus proxies versus missing data.

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
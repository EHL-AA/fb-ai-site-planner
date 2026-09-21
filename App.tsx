/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
/// <reference types="vite/client" />
import React, { useState, useEffect, useRef } from 'react';

import Sidebar from './components/Sidebar';
import SitesSidebar from './components/site-planner/SitesSidebar';
import AssistantPanel from './components/site-planner/AssistantPanel';
import MapChrome from './components/site-planner/MapChrome';
import DetailCard from './components/site-planner/DetailCard';
import { PlannerProvider } from './contexts/PlannerContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LoginScreen from './components/auth/LoginScreen';
import UserMenu from './components/auth/UserMenu';
import { APIProvider, Map, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { useMapStore, MapMarker } from './lib/state';
import { MapController } from './lib/map-controller';
import { usePlannerStore } from './lib/site-planner/data-store';
import { loadPlacesData, nearby } from './lib/site-planner/places-data';

const API_KEY = process.env.GEMINI_API_KEY as string;
if (typeof API_KEY !== 'string') {
  throw new Error('Missing required environment variable: GEMINI_API_KEY');
}

// Google Maps Platform key. Prefer your own billed key via MAPS_API_KEY in .env;
// falls back to the shared AI Studio demo key (low daily Places quota).
const MAPS_API_KEY =
  process.env.MAPS_API_KEY 

const INITIAL_CENTER = { lat: -26.1076, lng: 28.0567 }; // Sandton, Johannesburg
const INITIAL_ZOOM = 13;

// Map ID for the standard roadmap. Advanced markers need one; Google's
// DEMO_MAP_ID works for development. Set MAPS_MAP_ID in .env for a styled map.
const MAP_ID = process.env.MAPS_MAP_ID || 'DEMO_MAP_ID';

/** Hands the underlying google.maps.Map instance up to the app once it exists. */
function MapHandle({ onReady }: { onReady: (map: google.maps.Map | null) => void }) {
  const map = useMap();
  useEffect(() => {
    onReady(map);
    return () => onReady(null);
  }, [map, onReady]);
  return null;
}

/**
 * The main application component. It is the primary view controller: it lays out
 * the planner UI and reacts to global map state (ranked candidate markers and
 * camera targets) to drive the map.
 */
function AppComponent() {
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const placesLib = useMapsLibrary('places');
  const geocodingLib = useMapsLibrary('geocoding');
  // The marker library provides AdvancedMarkerElement + PinElement for the pins.
  const markerLib = useMapsLibrary('marker');
  const [geocoder, setGeocoder] = useState<google.maps.Geocoder | null>(null);
  const { markers, dataMarkers, cameraTarget, setCameraTarget, preventAutoFrame } = useMapStore();
  const mapController = useRef<MapController | null>(null);
  // Read through a ref so flipping preventAutoFrame back to false (after a fly-to
  // lands) doesn't itself re-run the marker effect and re-frame over the fly-to.
  const preventAutoFrameRef = useRef(preventAutoFrame);
  preventAutoFrameRef.current = preventAutoFrame;

  // Planner data layers (your competitor / retail data + chat query results).
  const dataLayers = usePlannerStore(s => s.dataLayers);
  const queryLayers = usePlannerStore(s => s.queryLayers);
  const viewCenter = usePlannerStore(s => s.viewCenter);
  const competitorsData = usePlannerStore(s => s.competitorsData);
  const retailData = usePlannerStore(s => s.retailData);
  const existingStores = usePlannerStore(s => s.existingStores);

  // Load the bundled Famous Brands datasets once.
  useEffect(() => {
    loadPlacesData()
      .then(({ competitors, retail }) => usePlannerStore.getState().setPlacesData(competitors, retail))
      .catch(err => console.warn('Failed to load places data:', err));
  }, []);

  // Recompute the data-marker layer when toggles, query, centre or data change.
  useEffect(() => {
    const out: MapMarker[] = [];
    if (dataLayers.existing) {
      for (const p of existingStores) {
        out.push({ position: { lat: p.lat, lng: p.lng, altitude: 1 }, label: p.n || p.b, showLabel: false, kind: 'existing' });
      }
    }
    if (dataLayers.competitors) {
      for (const p of nearby(competitorsData, viewCenter, 250, 6000)) {
        out.push({ position: { lat: p.lat, lng: p.lng, altitude: 1 }, label: p.n || p.b, showLabel: false, kind: 'competitor' });
      }
    }
    if (dataLayers.retail) {
      for (const p of nearby(retailData, viewCenter, 250, 6000)) {
        out.push({ position: { lat: p.lat, lng: p.lng, altitude: 1 }, label: p.n || p.b, showLabel: false, kind: 'retail' });
      }
    }
    for (const layer of queryLayers) {
      for (const p of layer.points) {
        out.push({ position: { lat: p.lat, lng: p.lng, altitude: 1 }, label: `${p.n || p.b} · ${layer.label}`, showLabel: false, kind: 'query', color: layer.color, glyph: layer.brand ? layer.brand[0].toUpperCase() : undefined });
      }
    }
    useMapStore.getState().setDataMarkers(out);
  }, [dataLayers, queryLayers, viewCenter, competitorsData, retailData, existingStores]);

  // Padding ensures framed map content isn't hidden behind the side rails.
  const [padding, setPadding] = useState<[number, number, number, number]>([0.05, 0.05, 0.05, 0.05]);

  // Instantiate the Geocoder once the library is loaded.
  useEffect(() => {
    if (geocodingLib) {
      setGeocoder(new geocodingLib.Geocoder());
    }
  }, [geocodingLib]);

  // Instantiate the MapController once the map and marker library are ready.
  useEffect(() => {
    if (map && markerLib) {
      mapController.current = new MapController({ map });
    }
    return () => {
      mapController.current?.clearMap();
      mapController.current = null;
    };
  }, [map, markerLib]);

  // Responsive padding from the left rail + right chat dock widths, so framed
  // map content stays clear of both side panels.
  useEffect(() => {
    const calculatePadding = () => {
      const vw = window.innerWidth;
      const leftEl = document.querySelector('.sp-left-rail') as HTMLElement | null;
      const rightEl = document.querySelector('.sp-right-rail') as HTMLElement | null;
      const isStacked = window.matchMedia('(max-width: 900px)').matches;

      const left = !isStacked && leftEl ? leftEl.offsetWidth / vw + 0.02 : 0.05;
      const right = !isStacked && rightEl ? rightEl.offsetWidth / vw + 0.02 : 0.05;
      setPadding([0.05, right, 0.05, left]);
    };

    window.addEventListener('resize', calculatePadding);
    const timeoutId = setTimeout(calculatePadding, 200);

    return () => {
      window.removeEventListener('resize', calculatePadding);
      clearTimeout(timeoutId);
    };
  }, []);

  // Reactively render candidate markers + data-layer markers; frame candidates
  // (or, if there are none, the data layer) unless a direct fly-to is in play.
  // `map`/`markerLib` are deps so the first render happens once the controller exists.
  useEffect(() => {
    if (!mapController.current) return;
    const controller = mapController.current;
    controller.clearMap();

    if (markers.length > 0) controller.addMarkers(markers);
    if (dataMarkers.length > 0) controller.addDataMarkers(dataMarkers);

    if (!preventAutoFrameRef.current) {
      const toFrame = markers.length > 0 ? markers : dataMarkers;
      if (toFrame.length > 0) controller.frameEntities(toFrame.map(m => ({ position: m.position })), padding);
    }
  }, [markers, dataMarkers, padding, map, markerLib]);

  // React to direct camera-fly requests (suburb fly-to, ranked-site fly-to).
  useEffect(() => {
    if (cameraTarget && mapController.current) {
      mapController.current.flyTo(cameraTarget);
      setCameraTarget(null);
      useMapStore.getState().setPreventAutoFrame(false);
    }
  }, [cameraTarget, setCameraTarget, map, markerLib]);

  return (
    <PlannerProvider placesLib={placesLib} geocoder={geocoder} mapsApiKey={MAPS_API_KEY ?? ''}>
      <div style={{ display: 'flex', width: '100vw', height: '100vh', background: 'var(--bg)' }}>
        <SitesSidebar />
        <main className="map-stage">
          <Map
            mapId={MAP_ID}
            defaultCenter={INITIAL_CENTER}
            defaultZoom={INITIAL_ZOOM}
            gestureHandling="greedy"
            disableDefaultUI
            zoomControl
            clickableIcons={false}
            style={{ width: '100%', height: '100%' }}>
            <MapHandle onReady={setMap} />
          </Map>
          <MapChrome />
          <DetailCard />
        </main>
        <AssistantPanel />
      </div>
      <UserMenu />
      <Sidebar />
    </PlannerProvider>
  );
}

/**
 * Gates the app behind Firebase Authentication: shows a brief loading state
 * while the initial auth check resolves, the login screen when signed out, and
 * the full planner once a user is signed in.
 */
/**
 * Dev-only auth bypass for local UI testing (e.g. Playwright): active only under
 * the Vite dev server (`import.meta.env.DEV`) AND when the URL carries `?devauth=1`.
 * `import.meta.env.DEV` is a compile-time constant, so this branch is removed
 * from production builds.
 */
const DEV_AUTH_BYPASS =
  import.meta.env.DEV && new URLSearchParams(window.location.search).get('devauth') === '1';

function AuthGate() {
  const { user, initializing } = useAuth();

  if (DEV_AUTH_BYPASS) return <AppComponent />;

  if (initializing) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          background: 'var(--bg, #0c0a08)',
          color: 'var(--ink-3, #8a8278)',
          fontSize: 14,
        }}>
        Loading…
      </div>
    );
  }

  if (!user) return <LoginScreen />;

  return <AppComponent />;
}

/**
 * Root component. Provides the Google Maps Platform context for the map.
 */
function App() {
  return (
    <div className="App">
      <AuthProvider>
        <APIProvider
          version={'weekly'}
          apiKey={MAPS_API_KEY}
          solutionChannel={'gmp_aistudio_itineraryapplet_v1.0.0'}>
          <AuthGate />
        </APIProvider>
      </AuthProvider>
    </div>
  );
}

export default App;

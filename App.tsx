/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useCallback, useState, useEffect, useRef } from 'react';

import Sidebar from './components/Sidebar';
import SitesSidebar from './components/site-planner/SitesSidebar';
import AssistantPanel from './components/site-planner/AssistantPanel';
import MapChrome from './components/site-planner/MapChrome';
import DetailCard from './components/site-planner/DetailCard';
import { PlannerProvider } from './contexts/PlannerContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LoginScreen from './components/auth/LoginScreen';
import UserMenu from './components/auth/UserMenu';
import { APIProvider, useMapsLibrary } from '@vis.gl/react-google-maps';
import { Map3D, Map3DCameraProps } from './components/map-3d';
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

const INITIAL_VIEW_PROPS = {
  center: { lat: -26.1076, lng: 28.0567, altitude: 1000 }, // Sandton, Johannesburg
  range: 3000,
  heading: 0,
  tilt: 30,
  roll: 0,
};

/**
 * The main application component. It is the primary view controller: it lays out
 * the planner UI and reacts to global map state (ranked candidate markers and
 * camera targets) to drive the 3D map.
 */
function AppComponent() {
  const [map, setMap] = useState<google.maps.maps3d.Map3DElement | null>(null);
  const placesLib = useMapsLibrary('places');
  const geocodingLib = useMapsLibrary('geocoding');
  // Loading the marker library lets MapController colour-tint ranked pins.
  useMapsLibrary('marker');
  const [geocoder, setGeocoder] = useState<google.maps.Geocoder | null>(null);
  const [viewProps, setViewProps] = useState(INITIAL_VIEW_PROPS);
  const { markers, dataMarkers, cameraTarget, setCameraTarget, preventAutoFrame } = useMapStore();
  const mapController = useRef<MapController | null>(null);

  // Planner data layers (your competitor / retail data + chat query results).
  const dataLayers = usePlannerStore(s => s.dataLayers);
  const queryLayer = usePlannerStore(s => s.queryLayer);
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
    if (queryLayer) {
      for (const p of queryLayer.points) {
        out.push({ position: { lat: p.lat, lng: p.lng, altitude: 1 }, label: p.n || p.b, showLabel: false, kind: 'query' });
      }
    }
    useMapStore.getState().setDataMarkers(out);
  }, [dataLayers, queryLayer, viewCenter, competitorsData, retailData, existingStores]);

  const maps3dLib = useMapsLibrary('maps3d');
  const elevationLib = useMapsLibrary('elevation');

  // Padding ensures framed map content isn't hidden behind the side rails.
  const [padding, setPadding] = useState<[number, number, number, number]>([0.05, 0.05, 0.05, 0.05]);

  // Instantiate the Geocoder once the library is loaded.
  useEffect(() => {
    if (geocodingLib) {
      setGeocoder(new geocodingLib.Geocoder());
    }
  }, [geocodingLib]);

  // Instantiate the MapController once the map element and libraries are ready.
  useEffect(() => {
    if (map && maps3dLib && elevationLib) {
      mapController.current = new MapController({ map, maps3dLib, elevationLib });
    }
    return () => {
      mapController.current = null;
    };
  }, [map, maps3dLib, elevationLib]);

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

  // Hide the alpha API banner once the map loads.
  useEffect(() => {
    if (map) {
      const banner = document.querySelector('.vAygCK-api-load-alpha-banner') as HTMLElement;
      if (banner) banner.style.display = 'none';
    }
  }, [map]);

  // Reactively render candidate markers + data-layer markers; frame candidates
  // (or, if there are none, the data layer) unless a direct fly-to is in play.
  useEffect(() => {
    if (!mapController.current) return;
    const controller = mapController.current;
    controller.clearMap();

    if (markers.length > 0) controller.addMarkers(markers);
    if (dataMarkers.length > 0) controller.addDataMarkers(dataMarkers);

    if (!preventAutoFrame) {
      const toFrame = markers.length > 0 ? markers : dataMarkers;
      if (toFrame.length > 0) controller.frameEntities(toFrame.map(m => ({ position: m.position })), padding);
    }
  }, [markers, dataMarkers, padding, preventAutoFrame]);

  // React to direct camera-fly requests (suburb fly-to, ranked-site fly-to).
  useEffect(() => {
    if (cameraTarget && mapController.current) {
      mapController.current.flyTo(cameraTarget);
      setCameraTarget(null);
      useMapStore.getState().setPreventAutoFrame(false);
    }
  }, [cameraTarget, setCameraTarget]);

  const handleCameraChange = useCallback((props: Map3DCameraProps) => {
    setViewProps(oldProps => ({ ...oldProps, ...props }));
  }, []);

  return (
    <PlannerProvider placesLib={placesLib} geocoder={geocoder}>
      <div style={{ display: 'flex', width: '100vw', height: '100vh', background: 'var(--bg)' }}>
        <SitesSidebar />
        <main className="map-stage">
          <Map3D
            ref={element => setMap(element ?? null)}
            onCameraChange={handleCameraChange}
            {...viewProps}
          />
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
function AuthGate() {
  const { user, initializing } = useAuth();

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
 * Root component. Provides the Google Maps Platform context for the 3D map.
 */
function App() {
  return (
    <div className="App">
      <AuthProvider>
        <APIProvider
          version={'alpha'}
          apiKey={MAPS_API_KEY}
          solutionChannel={'gmp_aistudio_itineraryapplet_v1.0.0'}>
          <AuthGate />
        </APIProvider>
      </AuthProvider>
    </div>
  );
}

export default App;

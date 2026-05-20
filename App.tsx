/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useCallback, useState, useEffect, useRef } from 'react';

import StreamingConsole from './components/streaming-console/StreamingConsole';
import Sidebar from './components/Sidebar';
import SuburbSearch from './components/site-planner/SuburbSearch';
import RankedPanel from './components/site-planner/RankedPanel';
import ChatComposer from './components/site-planner/ChatComposer';
import { PlannerProvider } from './contexts/PlannerContext';
import { APIProvider, useMapsLibrary } from '@vis.gl/react-google-maps';
import { Map3D, Map3DCameraProps } from './components/map-3d';
import { useMapStore } from './lib/state';
import { MapController } from './lib/map-controller';

const API_KEY = process.env.GEMINI_API_KEY as string;
if (typeof API_KEY !== 'string') {
  throw new Error('Missing required environment variable: GEMINI_API_KEY');
}

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
  const { markers, cameraTarget, setCameraTarget, preventAutoFrame } = useMapStore();
  const mapController = useRef<MapController | null>(null);

  const maps3dLib = useMapsLibrary('maps3d');
  const elevationLib = useMapsLibrary('elevation');

  const consolePanelRef = useRef<HTMLDivElement>(null);
  // Padding state ensures map content isn't hidden behind the console panel.
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

  // Calculate responsive padding from the console panel width (desktop).
  useEffect(() => {
    const calculatePadding = () => {
      const consoleEl = consolePanelRef.current;
      const vw = window.innerWidth;
      if (!consoleEl) return;

      const isMobile = window.matchMedia('(max-width: 768px)').matches;
      const top = 0.05;
      const right = 0.05;
      const bottom = 0.05;
      let left = 0.05;
      if (!isMobile) {
        left = Math.max(left, consoleEl.offsetWidth / vw + 0.02);
      }
      setPadding([top, right, bottom, left]);
    };

    const observer = new ResizeObserver(calculatePadding);
    if (consolePanelRef.current) observer.observe(consolePanelRef.current);
    window.addEventListener('resize', calculatePadding);
    const timeoutId = setTimeout(calculatePadding, 100);

    return () => {
      window.removeEventListener('resize', calculatePadding);
      observer.disconnect();
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

  // Reactively render ranked candidate markers and frame them on the map.
  useEffect(() => {
    if (!mapController.current) return;
    const controller = mapController.current;
    controller.clearMap();

    if (markers.length > 0) {
      controller.addMarkers(markers);
    }

    const allEntities = markers.map(m => ({ position: m.position }));
    if (allEntities.length > 0 && !preventAutoFrame) {
      controller.frameEntities(allEntities, padding);
    }
  }, [markers, padding, preventAutoFrame]);

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
      <Sidebar />
      <div className="streaming-console">
        <div className="console-panel" ref={consolePanelRef}>
          <SuburbSearch />
          <RankedPanel />
          <StreamingConsole />
          <ChatComposer />
        </div>
        <div className="map-panel">
          <Map3D
            ref={element => setMap(element ?? null)}
            onCameraChange={handleCameraChange}
            {...viewProps}
          />
        </div>
      </div>
    </PlannerProvider>
  );
}

/**
 * Root component. Provides the Google Maps Platform context for the 3D map.
 */
function App() {
  return (
    <div className="App">
      <APIProvider
        version={'alpha'}
        apiKey={'AIzaSyCYTvt7YMcKjSNTnBa42djlndCeDvZHkr0'}
        solutionChannel={'gmp_aistudio_itineraryapplet_v1.0.0'}>
        <AppComponent />
      </APIProvider>
    </div>
  );
}

export default App;

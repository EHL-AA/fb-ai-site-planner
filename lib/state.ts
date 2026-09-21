/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { create } from 'zustand';
/**
 * A camera target. Kept in the shape the 3D map used so callers stay unchanged:
 * `range` is metres of visible ground (converted to a zoom level on the 2D map);
 * `altitude`, `tilt`, `heading` and `roll` are accepted but ignored there.
 */
export type CameraTarget = {
  center: { lat: number; lng: number; altitude?: number };
  range: number;
  heading?: number;
  tilt?: number;
  roll?: number;
};

/**
 * UI
 */
export const useUI = create<{
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
}>(set => ({
  isSidebarOpen: false,
  toggleSidebar: () => set(state => ({ isSidebarOpen: !state.isSidebarOpen })),
}));

/**
 * Map Entities
 */
export interface MapMarker {
  position: {
    lat: number;
    lng: number;
    altitude: number;
  };
  label: string;
  showLabel: boolean;
  /** 1-based rank from the site-planner ranking; controls marker label + colour. */
  rank?: number;
  /** Marker layer kind; controls styling. Candidate ranking by default. */
  kind?: 'candidate' | 'competitor' | 'retail' | 'query' | 'existing';
  /** Pin colour override (used by chat query layers so each query is distinct). */
  color?: string;
  /** Short glyph inside the pin (brand initial for brand layers). */
  glyph?: string;
}

export const useMapStore = create<{
  markers: MapMarker[];        // ranked candidate sites (auto-framed)
  dataMarkers: MapMarker[];    // your data layers + chat query results
  cameraTarget: CameraTarget | null;
  preventAutoFrame: boolean;
  setMarkers: (markers: MapMarker[]) => void;
  setDataMarkers: (markers: MapMarker[]) => void;
  clearMarkers: () => void;
  setCameraTarget: (target: CameraTarget | null) => void;
  setPreventAutoFrame: (prevent: boolean) => void;
}>(set => ({
  markers: [],
  dataMarkers: [],
  cameraTarget: null,
  preventAutoFrame: false,
  setMarkers: markers => set({ markers }),
  setDataMarkers: dataMarkers => set({ dataMarkers }),
  clearMarkers: () => set({ markers: [] }),
  setCameraTarget: target => set({ cameraTarget: target }),
  setPreventAutoFrame: prevent => set({ preventAutoFrame: prevent }),
}));

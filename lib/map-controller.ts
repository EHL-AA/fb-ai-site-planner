/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MapMarker, CameraTarget } from './state';
import { glyphColorFor } from './site-planner/brand-colors';

type MapControllerDependencies = {
  map: google.maps.Map;
};

/**
 * Centralises all interactions with the standard (2D roadmap) Google Map:
 * marker rendering, camera moves and framing.
 *
 * Camera targets keep the `{ center, range, tilt, heading, roll }` shape used
 * by the earlier 3D map so callers don't change; `range` (metres) is converted
 * to a zoom level and the other 3D-only fields are ignored.
 */
export class MapController {
  private map: google.maps.Map;
  private markers: google.maps.marker.AdvancedMarkerElement[] = [];

  constructor(deps: MapControllerDependencies) {
    this.map = deps.map;
  }

  /** Removes every marker this controller has placed on the map. */
  clearMap() {
    for (const m of this.markers) m.map = null;
    this.markers = [];
  }

  /**
   * Adds ranked candidate markers. When a marker carries a `rank`, the pin shows
   * the rank number and is colour-tinted: 1st gold, 2nd–3rd orange, the rest grey.
   */
  addMarkers(markers: MapMarker[]) {
    const { AdvancedMarkerElement, PinElement } = google.maps.marker;
    for (const markerData of markers) {
      const hasRank = typeof markerData.rank === 'number';
      const label = hasRank ? `${markerData.rank}. ${markerData.label}` : markerData.label;

      let content: HTMLElement | undefined;
      if (hasRank) {
        const rank = markerData.rank as number;
        const background = rank === 1 ? '#f5a524' : rank <= 3 ? '#ff7a1a' : '#8a8278';
        content = new PinElement({
          background,
          borderColor: '#202124',
          glyphColor: '#ffffff',
          glyphText: String(rank),
        } as google.maps.marker.PinElementOptions);
      }

      const marker = new AdvancedMarkerElement({
        map: this.map,
        position: { lat: markerData.position.lat, lng: markerData.position.lng },
        title: label,
        content,
        zIndex: hasRank ? 1000 - (markerData.rank as number) : 0,
      });
      this.markers.push(marker);
    }
  }

  /**
   * Adds lightweight data-layer markers (competitor / retail data and chat
   * query results) as small coloured pins. The place name shows on hover via
   * the native marker title.
   */
  addDataMarkers(markers: MapMarker[]) {
    const { AdvancedMarkerElement, PinElement } = google.maps.marker;
    for (const m of markers) {
      const background =
        m.color ? m.color :
        m.kind === 'existing' ? '#34c759' :
        m.kind === 'query' ? '#f5a524' :
        m.kind === 'retail' ? '#1f8fd6' :
        '#e14a3d';
      // `glyphText` replaces the deprecated `glyph`; the installed typings predate it.
      const pin = m.glyph
        ? new PinElement({ background, borderColor: '#1a1208', glyphColor: glyphColorFor(background), glyphText: m.glyph, scale: 0.8 } as google.maps.marker.PinElementOptions)
        : new PinElement({ background, borderColor: '#1a1208', glyphColor: '#1a1208', glyphText: '', scale: 0.65 } as google.maps.marker.PinElementOptions);
      const marker = new AdvancedMarkerElement({
        map: this.map,
        position: { lat: m.position.lat, lng: m.position.lng },
        title: m.label,
        content: pin,
      });
      this.markers.push(marker);
    }
  }

  /**
   * Moves the camera to a target. `range` (metres of visible ground) is turned
   * into a zoom level so the same targets that framed the 3D view frame the
   * 2D one at a comparable scale.
   */
  flyTo(cameraProps: CameraTarget) {
    const { lat, lng } = cameraProps.center;
    const zoom = this.zoomForRange(cameraProps.range, lat);
    this.map.moveCamera({ center: { lat, lng }, zoom });
  }

  /**
   * Fits the map to a set of entities, leaving `padding` (fractions of the
   * viewport: top, right, bottom, left) clear so framed content isn't hidden
   * behind the side rails.
   */
  async frameEntities(
    entities: { position: { lat: number; lng: number } }[],
    padding: [number, number, number, number],
  ) {
    if (entities.length === 0) return;

    const div = this.map.getDiv();
    const w = div.clientWidth || 1;
    const h = div.clientHeight || 1;
    const [top, right, bottom, left] = padding;

    if (entities.length === 1) {
      this.map.moveCamera({ center: entities[0].position, zoom: 15 });
      return;
    }

    const bounds = new google.maps.LatLngBounds();
    for (const e of entities) bounds.extend(e.position);
    this.map.fitBounds(bounds, { top: top * h, right: right * w, bottom: bottom * h, left: left * w });

    // Don't zoom in past street level when candidates are tightly clustered.
    google.maps.event.addListenerOnce(this.map, 'idle', () => {
      const z = this.map.getZoom();
      if (typeof z === 'number' && z > 17) this.map.setZoom(17);
    });
  }

  /**
   * Approximates the 2D zoom whose visible height matches a 3D camera `range`
   * (metres). Uses the Web Mercator ground resolution at the given latitude.
   */
  private zoomForRange(range: number, lat: number): number {
    const h = this.map.getDiv().clientHeight || 800;
    // A 3D camera at `range` with a ~45° FOV sees roughly 0.83 × range vertically.
    const visibleMetres = Math.max(range, 50) * 0.83;
    const metresPerPx = visibleMetres / h;
    const zoom = Math.log2((156543.03392 * Math.cos((lat * Math.PI) / 180)) / metresPerPx);
    return Math.min(20, Math.max(3, Math.round(zoom * 10) / 10));
  }
}

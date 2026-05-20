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

interface WeightedPlacePoint extends WeightedPoint { place: RawPlace; }

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

  const weighted: WeightedPlacePoint[] = [...seen.values()].map(p => ({
    lat: p.lat, lng: p.lng, weight: 1 + (p.userRatingCount ?? 0), place: p,
  }));

  const clusters = clusterPoints(weighted, clusterRadiusM)
    .map((c, i) => ({
      id: `node-${i + 1}`,
      label: '',
      lat: c.lat,
      lng: c.lng,
      places: c.members.map(m => (m as WeightedPlacePoint).place),
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

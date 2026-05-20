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

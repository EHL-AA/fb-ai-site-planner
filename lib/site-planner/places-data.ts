import { haversineMeters, LatLng } from './geo';

/** A place record from the bundled Famous Brands datasets. */
export interface PlaceRec {
  b: string;   // brand
  n: string;   // store name
  a: string;   // address
  lat: number;
  lng: number;
  c?: string;  // category (competitors, lowercased)
  t?: string;  // store type (retail anchors)
  r?: number;  // reviews count (competitors)
}

export interface PlacesData {
  competitors: PlaceRec[];
  retail: PlaceRec[];
}

let cache: PlacesData | null = null;

/** Fetch + cache the bundled competitor and retail-anchor datasets. */
export async function loadPlacesData(): Promise<PlacesData> {
  if (cache) return cache;
  const [competitors, retail] = await Promise.all([
    fetch('/data/competitors.json').then(r => (r.ok ? r.json() : [])),
    fetch('/data/retail.json').then(r => (r.ok ? r.json() : [])),
  ]);
  cache = { competitors, retail };
  return cache;
}

/** Nearest `cap` records to `center` (or first `cap` if no center). */
export function nearby(data: PlaceRec[], center: LatLng | null, cap = 300, radiusM = Infinity): PlaceRec[] {
  if (!center) return data.slice(0, cap);
  return data
    .map(p => ({ p, d: haversineMeters(center.lat, center.lng, p.lat, p.lng) }))
    .filter(x => x.d <= radiusM)
    .sort((a, b) => a.d - b.d)
    .slice(0, cap)
    .map(x => x.p);
}

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  burger: ['hamburger', 'burger'],
  pizza: ['pizza'],
  chicken: ['chicken', 'fried chicken'],
  coffee: ['coffee', 'café', 'cafe', 'espresso'],
  seafood: ['seafood', 'fish'],
  sushi: ['sushi'],
  breakfast: ['breakfast'],
  steakhouse: ['steak'],
};

const RETAIL_HINTS = ['supermarket', 'grocery', 'grocer', 'anchor', 'retail', 'spar', 'shoprite', 'pick n pay', 'picknpay', 'checkers', 'woolworths', 'boxer', 'usave'];

export interface PlaceQuery {
  label: string;
  dataset: 'competitors' | 'retail';
  points: PlaceRec[];   // capped + sorted by proximity
  total: number;        // total matches before capping
  topBrands: [string, number][];
}

/** Only messages that explicitly ask to see places on the map are map queries;
 *  a question that merely mentions "pizza" or a brand is answered, not plotted. */
const MAP_INTENT = /\b(show|map|plot|display|highlight|where (are|is)|list|find|mark|put .* on the map|pin)\b/i;
export function hasMapIntent(message: string): boolean {
  const m = message.trim();
  if (/^\s*(why|how|should|would|could|is|are|does|do|can|compare|explain|tell me why)\b/i.test(m)) return false;
  return MAP_INTENT.test(m);
}

/** Interpret a free-text request like "show all burger places" into a
 *  filtered set of places. Returns null if the message isn't a place query. */
export function queryPlaces(message: string, data: PlacesData, center: LatLng | null): PlaceQuery | null {
  if (!hasMapIntent(message)) return null;
  const m = message.toLowerCase();

  const retailIntent = RETAIL_HINTS.some(h => m.includes(h));
  const matchedCats = Object.entries(CATEGORY_KEYWORDS)
    .filter(([, kws]) => kws.some(k => m.includes(k)))
    .map(([cat]) => cat);

  // Brand match against whatever's in the data; several brands may be named at once.
  const brandSet = new Set<string>();
  for (const p of data.competitors) if (p.b) brandSet.add(p.b.toLowerCase());
  for (const p of data.retail) if (p.b) brandSet.add(p.b.toLowerCase());
  const matchedBrands = [...brandSet].filter(b => b.length > 2 && m.includes(b));
  const matchedBrand = matchedBrands[0];

  let dataset: 'competitors' | 'retail';
  let pool: PlaceRec[];
  let label: string;

  if (retailIntent && matchedCats.length === 0) {
    dataset = 'retail';
    pool = data.retail;
    if (matchedBrand) {
      pool = pool.filter(p => p.b.toLowerCase() === matchedBrand);
      label = `${pool[0]?.b ?? matchedBrand} stores`;
    } else {
      label = 'retail anchors';
    }
  } else if (matchedBrands.length > 0) {
    // Named brands win over category words ("KFCs and Chicken Lickens" is two brands, not "chicken").
    dataset = 'competitors';
    pool = data.competitors.filter(p => matchedBrands.includes(p.b.toLowerCase()));
    const names = [...new Set(pool.map(p => p.b))];
    label = `${(names.length ? names : matchedBrands).join(' / ')} places`;
  } else if (matchedCats.length > 0) {
    dataset = 'competitors';
    const kws = matchedCats.flatMap(c => CATEGORY_KEYWORDS[c]);
    pool = data.competitors.filter(p => kws.length > 0 && p.c && kws.some(k => p.c!.includes(k)));
    label = `${matchedCats.join(' / ')} places`;
  } else {
    return null;
  }

  const total = pool.length;
  const points = nearby(pool, center, 300);
  const brandCount = new Map<string, number>();
  for (const p of points) brandCount.set(p.b, (brandCount.get(p.b) ?? 0) + 1);
  const topBrands = [...brandCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  return { label, dataset, points, total, topBrands };
}

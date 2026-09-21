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
  /** The one brand the query names, as spelled in the data (e.g. "KFC"); undefined for categories / multi-brand. */
  brand?: string;
  dataset: 'competitors' | 'retail';
  points: PlaceRec[];   // capped + sorted by proximity
  total: number;        // total matches before capping
  topBrands: [string, number][];
}

/** Only messages that explicitly ask to see places on the map are map queries;
 *  a question that merely mentions "pizza" or a brand is answered, not plotted. */
const MAP_INTENT = /\b(show|map|plot|display|highlight|see|view|where (are|is)|list|find|mark|put .* on the map|pin|locations?|outlets)\b/i;
/** "can you", "please", "I'd like to see", "let's" … in front of an instruction don't make it a question. */
const POLITE_PREFIX = /^\s*(?:(?:ok|okay|please|now|also|and|hey|hi|so)[,\s]+)*(?:(?:can|could|would|will) (?:you|u)(?: please)?|please|i(?: would|'d) like (?:you )?to|i want (?:you )?to|i need (?:you )?to|let'?s|lets|let me)\s+/i;
export function hasMapIntent(message: string): boolean {
  const m = message.trim().replace(POLITE_PREFIX, '');
  if (/^\s*(why|how|should|would|could|is|are|does|do|can|compare|explain|tell me why)\b/i.test(m)) return false;
  return MAP_INTENT.test(m);
}

/** Nationwide brand tallies for the reasoning prompts, so the model can quote
 *  counts and suggest "show all McDonald's" even before the map is focused. */
export function datasetSummary(data: PlacesData): { competitors: number; retail: number; topBrands: [string, number][]; retailBrands: [string, number][] } {
  const tally = (recs: PlaceRec[]) => {
    const m = new Map<string, number>();
    for (const p of recs) m.set(p.b, (m.get(p.b) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]) as [string, number][];
  };
  return { competitors: data.competitors.length, retail: data.retail.length, topBrands: tally(data.competitors).slice(0, 30), retailBrands: tally(data.retail) };
}

/** Words that can follow "in / near / around" without being a place. */
const NOT_A_PLACE = new Set(['map', 'the map', 'area', 'view', 'data', 'dataset', 'results', 'list', 'this area', 'my data', 'here']);

/** Brand names and category keywords present in the data, lowercased, so a
 *  trailing "in KFC" isn't mistaken for a location. */
export function knownQueryTerms(data: PlacesData): string[] {
  const out = new Set<string>();
  for (const p of data.competitors) if (p.b) out.add(p.b.toLowerCase());
  for (const p of data.retail) if (p.b) out.add(p.b.toLowerCase());
  for (const kws of Object.values(CATEGORY_KEYWORDS)) for (const k of kws) out.add(k);
  for (const h of RETAIL_HINTS) out.add(h);
  return [...out];
}

const FOCUS_PREFIX = String.raw`(?:(?:ok|okay|now|please|lets?|let's|can (?:you|we)|could (?:you|we)|i want to|i'd like to|i would like to)\s+)*`;
const FOCUS_VERB = String.raw`(?:narrow|focus|zoom(?: in)?|limit|restrict|centre|center|go|move|jump|look|filter|concentrate)`;
const FOCUS_FILLER = String.raw`(?:\s+(?:this|it|that|these|them|the map|the results|the view|the search|down|in|us))*`;
const FOCUS_RE = new RegExp(
  String.raw`^\s*${FOCUS_PREFIX}${FOCUS_VERB}${FOCUS_FILLER}\s*(?:to|on|in|around|near|at|towards?)\s+(?:the\s+)?(.+?)\s*[.?!]*\s*$`, 'i');
const ONLY_RE = /^\s*(?:only|just)\s+(?:in|around|near)\s+(?:the\s+)?(.+?)\s*[.?!]*\s*$/i;

/** "lets narrow this to the cape town cbd" / "focus on sandton" / "only in durban"
 *  → the place to focus the map on. Null when the message isn't a focus request. */
export function parseFocusRequest(message: string): string | null {
  const m = message.match(FOCUS_RE) ?? message.match(ONLY_RE);
  if (!m) return null;
  const place = m[1].trim();
  if (!place || NOT_A_PLACE.has(place.toLowerCase())) return null;
  return place;
}

const TRAILING_RE = /^(.*?\S)\s+(?:in|near|around|within|at)\s+(?:the\s+)?([a-z][a-z0-9' .&-]{2,})\s*[.?!]*\s*$/i;

/** Splits "show all burger places in cape town" into the place query and the
 *  location. The location is dropped when it's a known brand / category word. */
export function splitLocation(message: string, knownTerms: string[] = []): { query: string; place: string | null } {
  const m = message.match(TRAILING_RE);
  if (!m) return { query: message, place: null };
  const place = m[2].trim();
  const lower = place.toLowerCase();
  if (NOT_A_PLACE.has(lower) || knownTerms.some(t => lower === t || lower.includes(t))) return { query: message, place: null };
  return { query: m[1], place };
}

/** Interpret a free-text request like "show all burger places" into a
 *  filtered set of places. Returns null if the message isn't a place query.
 *  `radiusM` limits matches to that distance from `center` (when a center is set). */
export function queryPlaces(message: string, data: PlacesData, center: LatLng | null, radiusM = Infinity): PlaceQuery | null {
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
  let brand: string | undefined;

  if (retailIntent && matchedCats.length === 0) {
    dataset = 'retail';
    pool = data.retail;
    if (matchedBrand) {
      pool = pool.filter(p => p.b.toLowerCase() === matchedBrand);
      brand = pool[0]?.b ?? matchedBrand;
      label = `${brand} stores`;
    } else {
      label = 'retail anchors';
    }
  } else if (matchedBrands.length > 0) {
    // Named brands win over category words ("KFCs and Chicken Lickens" is two brands, not "chicken").
    dataset = 'competitors';
    pool = data.competitors.filter(p => matchedBrands.includes(p.b.toLowerCase()));
    const names = [...new Set(pool.map(p => p.b))];
    if (matchedBrands.length === 1) brand = names[0] ?? matchedBrands[0];
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
  const points = nearby(pool, center, 300, radiusM);
  const brandCount = new Map<string, number>();
  for (const p of points) brandCount.set(p.b, (brandCount.get(p.b) ?? 0) + 1);
  const topBrands = [...brandCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  return { label, brand, dataset, points, total, topBrands };
}

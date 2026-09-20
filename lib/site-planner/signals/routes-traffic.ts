import { LatLng } from '../geo';
import { CandidateNode } from '../types';
import { SignalSource, SignalContext, Signal, CongestionSignal, measured, unavailable, clamp100 } from './types';

export const ROUTES_SOURCE_LABEL = 'Google Routes API (live traffic)';
const ENDPOINT = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const M_PER_DEG_LAT = 111_320;

/** Four points `distanceM` from `center` at N, E, S, W bearings. */
export function legEndpoints(center: LatLng, distanceM = 1500): LatLng[] {
  const dLat = distanceM / M_PER_DEG_LAT;
  const dLng = distanceM / (M_PER_DEG_LAT * Math.cos((center.lat * Math.PI) / 180));
  return [
    { lat: center.lat + dLat, lng: center.lng },
    { lat: center.lat, lng: center.lng + dLng },
    { lat: center.lat - dLat, lng: center.lng },
    { lat: center.lat, lng: center.lng - dLng },
  ];
}

/** Departure slots, weekday local time (SAST = UTC+2, no DST). */
export const SLOTS = { morning: { h: 5, m: 30 }, midday: { h: 10, m: 30 }, evening: { h: 15, m: 30 } } as const;
export type SlotName = keyof typeof SLOTS;

/** Next weekday at the given UTC time strictly after `now`. */
export function nextWeekdaySlotIso(now: Date, slot: SlotName): string {
  const { h, m } = SLOTS[slot];
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m, 0, 0));
  if (d <= now) d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

/** Next weekday 17:30 Africa/Johannesburg (= 15:30Z) strictly after `now`. */
export function nextWeekdayPeakIso(now: Date): string {
  return nextWeekdaySlotIso(now, 'evening');
}


export function congestionIndex(ratios: number[]): number {
  if (!ratios.length) return 0;
  const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  return clamp100(((mean - 1) / 0.6) * 100);
}

const secs = (s: unknown): number | null => {
  if (typeof s !== 'string') return null;
  const n = parseFloat(s.replace(/s$/, ''));
  return Number.isFinite(n) ? n : null;
};

export async function computeRoute(ctx: SignalContext, origin: LatLng, dest: LatLng, departureIso: string): Promise<{ durationS: number; staticS: number } | null> {
  if (!ctx.budget.take('routes')) return null;
  const res = await ctx.fetchImpl(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': ctx.mapsApiKey,
      'X-Goog-FieldMask': 'routes.duration,routes.staticDuration',
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
      destination: { location: { latLng: { latitude: dest.lat, longitude: dest.lng } } },
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
      departureTime: departureIso,
    }),
  });
  if (!res.ok) return null;
  const json: any = await res.json();
  const r = json?.routes?.[0];
  const durationS = secs(r?.duration);
  const staticS = secs(r?.staticDuration);
  if (durationS == null || staticS == null || staticS <= 0) return null;
  return { durationS, staticS };
}

type Leg = { durationS: number; staticS: number } | null;

async function slotIndex(ctx: SignalContext, origin: LatLng, legs: LatLng[], departureIso: string): Promise<number | null> {
  const results: Leg[] = await Promise.all(legs.map(dest => computeRoute(ctx, origin, dest, departureIso)));
  const ratios = results.filter((r): r is NonNullable<Leg> => !!r).map(r => r.durationS / r.staticS);
  return ratios.length ? congestionIndex(ratios) : null;
}

async function enrichNode(node: CandidateNode, ctx: SignalContext, departures: Record<SlotName, string>): Promise<Signal<CongestionSignal | null>> {
  try {
    const origin = { lat: node.lat, lng: node.lng };
    const legs = legEndpoints(origin);
    const [morning, midday, evening, fromCentre] = await Promise.all([
      slotIndex(ctx, origin, legs, departures.morning),
      slotIndex(ctx, origin, legs, departures.midday),
      slotIndex(ctx, origin, legs, departures.evening),
      computeRoute(ctx, ctx.selection.center, origin, departures.evening),
    ]);
    const live = [morning, midday, evening].filter((v): v is number => v != null);
    if (!live.length) return unavailable(ROUTES_SOURCE_LABEL, 'Routes API returned no traffic-aware routes (check key/quota).');
    return measured(
      {
        index0to100: Math.max(...live),
        slots: { morning, midday, evening },
        driveMinutesFromCentre: fromCentre ? Math.round(fromCentre.durationS / 60) : null,
      },
      ROUTES_SOURCE_LABEL,
      'Live vs free-flow drive time on 4 × 1.5 km legs at weekday 07:30, 12:30 and 17:30.',
    );
  } catch (e) {
    console.warn('routesTrafficSource failed for', node.id, e);
    return unavailable(ROUTES_SOURCE_LABEL, 'Routes API request failed.');
  }
}

export const routesTrafficSource: SignalSource<'congestion'> = {
  id: 'congestion',
  label: ROUTES_SOURCE_LABEL,
  async enrich(nodes, ctx) {
    const departures = {
      morning: nextWeekdaySlotIso(ctx.now, 'morning'),
      midday: nextWeekdaySlotIso(ctx.now, 'midday'),
      evening: nextWeekdaySlotIso(ctx.now, 'evening'),
    };
    return Promise.all(nodes.map(n => enrichNode(n, ctx, departures)));
  },
};

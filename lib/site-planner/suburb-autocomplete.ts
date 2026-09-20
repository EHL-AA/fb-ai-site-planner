import { SuburbSelection } from './types';

/** Minimal structural types so this module is testable without google.maps typings. */
export interface AddressComponentLike { types: string[]; longText?: string | null; }
export interface PlaceLike {
  fetchFields(opts: { fields: string[] }): Promise<unknown>;
  displayName?: string | null;
  location?: { lat(): number; lng(): number } | null;
  viewport?: { toJSON(): { north: number; south: number; east: number; west: number } } | null;
  addressComponents?: AddressComponentLike[] | null;
}
interface PredictionLike {
  placeId: string;
  mainText?: { text: string } | null;
  secondaryText?: { text: string } | null;
  toPlace(): PlaceLike;
}
export interface PlacesLibLike {
  AutocompleteSuggestion: { fetchAutocompleteSuggestions(req: Record<string, unknown>): Promise<{ suggestions: Array<{ placePrediction?: PredictionLike | null }> }> };
  AutocompleteSessionToken?: new () => unknown;
}

export interface SuburbSuggestion { placeId: string; mainText: string; secondaryText: string; toPlace: () => PlaceLike; }

const CITY_TYPES = ['locality', 'administrative_area_level_2', 'administrative_area_level_1'];

export function cityFromAddressComponents(components: AddressComponentLike[]): string {
  for (const t of CITY_TYPES) {
    const hit = components.find(c => c.types.includes(t) && c.longText);
    if (hit) return hit.longText as string;
  }
  return '';
}

export function newSessionToken(placesLib: PlacesLibLike): unknown {
  return placesLib.AutocompleteSessionToken ? new placesLib.AutocompleteSessionToken() : undefined;
}

export async function fetchSuburbSuggestions(placesLib: PlacesLibLike, input: string, token: unknown): Promise<SuburbSuggestion[]> {
  const q = input.trim();
  if (q.length < 2) return [];
  const { suggestions } = await placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
    input: q,
    includedRegionCodes: ['za'],
    includedPrimaryTypes: ['sublocality', 'locality', 'neighborhood'],
    sessionToken: token,
  });
  return suggestions
    .map(s => s.placePrediction)
    .filter((p): p is PredictionLike => !!p)
    .map(p => ({
      placeId: p.placeId,
      mainText: p.mainText?.text ?? '',
      secondaryText: p.secondaryText?.text ?? '',
      toPlace: () => p.toPlace(),
    }));
}

export async function resolveSuburb(s: SuburbSuggestion): Promise<SuburbSelection> {
  const place = s.toPlace();
  await place.fetchFields({ fields: ['location', 'viewport', 'addressComponents', 'displayName'] });
  if (!place.location || !place.viewport) throw new Error(`Could not resolve "${s.mainText}".`);
  return {
    placeId: s.placeId,
    suburb: place.displayName || s.mainText,
    city: cityFromAddressComponents(place.addressComponents ?? []),
    center: { lat: place.location.lat(), lng: place.location.lng() },
    viewport: place.viewport.toJSON(),
  };
}

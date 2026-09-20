import { describe, it, expect } from 'vitest';
import { cityFromAddressComponents, resolveSuburb, fetchSuburbSuggestions } from './suburb-autocomplete';

describe('cityFromAddressComponents', () => {
  it('prefers locality, then admin level 2, then admin level 1', () => {
    expect(cityFromAddressComponents([
      { types: ['sublocality'], longText: 'Rosebank' },
      { types: ['locality', 'political'], longText: 'Johannesburg' },
      { types: ['administrative_area_level_2'], longText: 'City of Johannesburg' },
    ])).toBe('Johannesburg');
    expect(cityFromAddressComponents([
      { types: ['administrative_area_level_2'], longText: 'City of Cape Town' },
      { types: ['administrative_area_level_1'], longText: 'Western Cape' },
    ])).toBe('City of Cape Town');
    expect(cityFromAddressComponents([{ types: ['administrative_area_level_1'], longText: 'Gauteng' }])).toBe('Gauteng');
    expect(cityFromAddressComponents([])).toBe('');
  });
});

describe('fetchSuburbSuggestions', () => {
  it('maps predictions and restricts to SA suburb types', async () => {
    let seen: any;
    const placesLib = {
      AutocompleteSuggestion: {
        fetchAutocompleteSuggestions: async (req: any) => {
          seen = req;
          return { suggestions: [{ placePrediction: { placeId: 'p1', mainText: { text: 'Rosebank' }, secondaryText: { text: 'Johannesburg, South Africa' }, toPlace: () => ({}) } }] };
        },
      },
    };
    const out = await fetchSuburbSuggestions(placesLib as any, 'Rose', 'tok');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ placeId: 'p1', mainText: 'Rosebank', secondaryText: 'Johannesburg, South Africa' });
    expect(seen.includedRegionCodes).toEqual(['za']);
    expect(seen.includedPrimaryTypes).toEqual(['sublocality', 'locality', 'neighborhood']);
    expect(seen.sessionToken).toBe('tok');
  });
  it('returns [] for input under 2 chars without calling the API', async () => {
    const placesLib = { AutocompleteSuggestion: { fetchAutocompleteSuggestions: async () => { throw new Error('should not call'); } } };
    expect(await fetchSuburbSuggestions(placesLib as any, 'R', 'tok')).toEqual([]);
  });
});

describe('resolveSuburb', () => {
  it('fetches fields and builds a SuburbSelection', async () => {
    const place = {
      fetchFields: async (_: any) => {},
      displayName: 'Rosebank',
      location: { lat: () => -26.146, lng: () => 28.041 },
      viewport: { toJSON: () => ({ north: -26.13, south: -26.16, east: 28.06, west: 28.02 }) },
      addressComponents: [{ types: ['locality'], longText: 'Johannesburg' }],
    };
    const sel = await resolveSuburb({ placeId: 'p1', mainText: 'Rosebank', secondaryText: '', toPlace: () => place as any });
    expect(sel).toEqual({
      placeId: 'p1', suburb: 'Rosebank', city: 'Johannesburg',
      center: { lat: -26.146, lng: 28.041 },
      viewport: { north: -26.13, south: -26.16, east: 28.06, west: 28.02 },
    });
  });
});

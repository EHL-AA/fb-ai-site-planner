import { describe, it, expect } from 'vitest';
import { hasMapIntent, queryPlaces, parseFocusRequest, splitLocation, knownQueryTerms, datasetSummary, PlacesData } from './places-data';

const data: PlacesData = {
  competitors: [
    { b: 'KFC', n: 'KFC A', a: '', lat: -34.0, lng: 18.5, c: 'fast food restaurant, chicken restaurant' },
    { b: 'Chicken Licken', n: 'CL A', a: '', lat: -34.01, lng: 18.5, c: 'chicken restaurant' },
    { b: 'Hungry Lion', n: 'HL A', a: '', lat: -34.02, lng: 18.5, c: 'chicken restaurant' },
    { b: 'Romans Pizza', n: 'RP A', a: '', lat: -34.03, lng: 18.5, c: 'pizza restaurant' },
  ],
  retail: [{ b: 'Woolworths', n: 'WW', a: '', lat: -34.0, lng: 18.5 }],
};

describe('hasMapIntent', () => {
  it('requires an explicit ask to see places, and never fires on questions', () => {
    expect(hasMapIntent('show all burger places')).toBe(true);
    expect(hasMapIntent('Where are the KFCs')).toBe(true);
    expect(hasMapIntent('Would site 1 work better as a Debonairs Pizza?')).toBe(false);
    expect(hasMapIntent('Why is there so much pizza competition?')).toBe(false);
    expect(hasMapIntent('Weight traffic higher')).toBe(false);
  });
  it('treats polite requests and "locations" asks as map intent', () => {
    expect(hasMapIntent("Can you display McDonald's locations")).toBe(true);
    expect(hasMapIntent("could you please show me the McDonald's")).toBe(true);
    expect(hasMapIntent("I'd like to see the KFCs")).toBe(true);
    expect(hasMapIntent("McDonald's locations in Cape Town")).toBe(true);
    expect(hasMapIntent('Can you explain why site 2 is lower?')).toBe(false);
    expect(hasMapIntent('Could site 1 work as a Debonairs?')).toBe(false);
  });
});

describe('datasetSummary', () => {
  it('tallies brands nationwide', () => {
    const d = datasetSummary(data);
    expect(d.competitors).toBe(4);
    expect(d.retail).toBe(1);
    expect(d.topBrands[0]).toEqual(['KFC', 1]);
    expect(d.retailBrands).toEqual([['Woolworths', 1]]);
  });
});

describe('queryPlaces', () => {
  it('returns null for questions that merely mention a category', () => {
    expect(queryPlaces('Would site 1 work better as a Debonairs Pizza instead of a Steers?', data, null)).toBeNull();
  });
  it('prefers named brands over the category word and supports several brands', () => {
    const q = queryPlaces('Show me the KFCs and Chicken Lickens near these sites', data, null)!;
    expect(q.points.map(p => p.b).sort()).toEqual(['Chicken Licken', 'KFC']);
    expect(q.label).toMatch(/KFC/);
  });
  it('still maps a plain category request', () => {
    const q = queryPlaces('show all chicken places', data, null)!;
    expect(q.total).toBe(3);
  });
});

describe('parseFocusRequest', () => {
  it('extracts the place from narrowing / focusing requests', () => {
    expect(parseFocusRequest('lets narrow this to the cape town cbd')).toBe('cape town cbd');
    expect(parseFocusRequest("Let's focus on Sandton")).toBe('Sandton');
    expect(parseFocusRequest('zoom in to Durban North.')).toBe('Durban North');
    expect(parseFocusRequest('can you narrow it down to Rosebank?')).toBe('Rosebank');
    expect(parseFocusRequest('only in Stellenbosch')).toBe('Stellenbosch');
  });
  it('ignores place queries, questions and re-rank instructions', () => {
    expect(parseFocusRequest('show all burger places')).toBeNull();
    expect(parseFocusRequest('focus on traffic')).toBe('traffic'); // handled downstream: geocode fails → friendly reply
    expect(parseFocusRequest('why is site 2 ranked lower?')).toBeNull();
    expect(parseFocusRequest('narrow the map')).toBeNull();
  });
});

describe('splitLocation', () => {
  const known = knownQueryTerms(data);
  it('peels a trailing location off a place query', () => {
    expect(splitLocation('show all burger places in cape town', known)).toEqual({ query: 'show all burger places', place: 'cape town' });
    expect(splitLocation('where are the KFCs near Sandton?', known)).toEqual({ query: 'where are the KFCs', place: 'Sandton' });
  });
  it('does not treat brands, categories or "the map" as a location', () => {
    expect(splitLocation('show chicken places in KFC', known).place).toBeNull();
    expect(splitLocation('show pizza places on the map', known).place).toBeNull();
    expect(splitLocation('show all burger places', known).place).toBeNull();
  });
});

describe('queryPlaces radius', () => {
  it('limits matches to the radius when one is given', () => {
    const far: PlacesData = { competitors: [...data.competitors, { b: 'KFC', n: 'KFC far', a: '', lat: -26.1, lng: 28.0, c: 'chicken restaurant' }], retail: [] };
    const all = queryPlaces('show KFCs', far, { lat: -34.0, lng: 18.5 })!;
    const near = queryPlaces('show KFCs', far, { lat: -34.0, lng: 18.5 }, 20000)!;
    expect(all.points).toHaveLength(2);
    expect(near.points).toHaveLength(1);
  });
});

describe('queryPlaces brand', () => {
  it('reports the single named brand, but not for categories or multi-brand asks', () => {
    expect(queryPlaces('show all KFCs', data, null)?.brand).toBe('KFC');
    expect(queryPlaces('show chicken places', data, null)?.brand).toBeUndefined();
    expect(queryPlaces('show KFC and Hungry Lion', data, null)?.brand).toBeUndefined();
    expect(queryPlaces('show woolworths stores', data, null)?.brand).toBe('Woolworths');
  });
});

describe('queryPlaces with polite phrasing', () => {
  it('plots "can you display the McDonald\'s locations"', () => {
    const d: PlacesData = { competitors: [{ b: "McDonald's", n: 'McD', a: '', lat: -34, lng: 18.5, c: 'hamburger restaurant' }], retail: [] };
    const q = queryPlaces("Can you display McDonald's locations", d, null);
    expect(q?.brand).toBe("McDonald's");
    expect(q?.points).toHaveLength(1);
  });
});

import { describe, it, expect } from 'vitest';
import { hasMapIntent, queryPlaces, PlacesData } from './places-data';

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

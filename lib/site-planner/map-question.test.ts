import { describe, it, expect } from 'vitest';
import { buildMapQuestionPrompt, buildAnswerPrompt } from './reasoning';
import { DEFAULT_WEIGHTS } from './types';

const rec = (b: string, n: string, lat: number, lng: number, c?: string) => ({ b, n, a: `${n} address`, lat, lng, c });

describe('buildMapQuestionPrompt', () => {
  it('grounds the model in the focus area, layers, nearby data and the question', () => {
    const center = { lat: -33.92, lng: 18.38 };
    const prompt = buildMapQuestionPrompt({
      brand: 'Debonairs Pizza',
      focus: { label: 'Sea Point', center, radiusM: 5000 },
      layers: [{ label: 'burger places', colorName: 'purple', count: 20, total: 984, topBrands: [['Burger King', 9]], sample: [rec('Burger King', 'BK Sea Point', -33.915, 18.385, 'hamburger restaurant')] }],
      nearbyCompetitors: [rec('Romans Pizza', 'Romans Sea Point', -33.916, 18.384, 'pizza restaurant'), rec('KFC', 'KFC Main Rd', -33.918, 18.386, 'chicken restaurant')],
      nearbyRetail: [{ b: 'Woolworths', n: 'Woolworths Sea Point', a: 'Main Rd', lat: -33.917, lng: 18.383, t: 'supermarket' }],
      existingStores: [],
      history: [{ role: 'user', text: 'show all burger places' }, { role: 'agent', text: 'Showing 20…' }],
    }, 'best placement for a Debonairs in Sea Point?');

    expect(prompt).toContain('Selected brand: Debonairs Pizza');
    expect(prompt).toContain('Map focus: Sea Point');
    expect(prompt).toContain('Layer "burger places" (purple pins): 20 shown of 984');
    expect(prompt).toContain('Romans Pizza — Romans Sea Point');
    expect(prompt).toMatch(/KFC — KFC Main Rd.*\(0\.\d km\)/);
    expect(prompt).toContain('Woolworths — Woolworths Sea Point');
    expect(prompt).toContain('Brand tally: Romans Pizza (1), KFC (1)');
    expect(prompt).toContain('Existing Debonairs Pizza stores: not loaded');
    expect(prompt).toContain('Planner: show all burger places');
    expect(prompt).toContain("Planner's question: best placement for a Debonairs in Sea Point?");
  });

  it('says when there is no focus so the model does not invent distances', () => {
    const prompt = buildMapQuestionPrompt({ brand: 'Steers', focus: null, layers: [], nearbyCompetitors: [], nearbyRetail: [], existingStores: [] }, 'what now?');
    expect(prompt).toContain('Map focus: none');
    expect(prompt).toContain('No query layers on the map.');
  });

  it('always carries the nationwide brand counts so nothing is "not loaded"', () => {
    const prompt = buildMapQuestionPrompt({
      brand: 'Steers', focus: null, layers: [], nearbyCompetitors: [], nearbyRetail: [], existingStores: [],
      dataset: { competitors: 6431, retail: 7029, topBrands: [['KFC', 1198], ["McDonald's", 415]], retailBrands: [['Spar', 1937]] },
    }, "can you display the McDonald's locations");
    expect(prompt).toContain('Bundled dataset (nationwide, always available): 6431 competitor outlets, 7029 retail anchors');
    expect(prompt).toContain("McDonald's (415)");
  });

  it('gives the ranking-question prompt the same outlet data so brands are never "unavailable"', () => {
    const center = { lat: -33.92, lng: 18.38 };
    const prompt = buildAnswerPrompt({
      brand: 'Debonairs Pizza', suburb: 'Sea Point', features: [], weights: DEFAULT_WEIGHTS, result: null,
      map: {
        brand: 'Debonairs Pizza', focus: { label: 'Sea Point', center, radiusM: 5000 }, layers: [],
        nearbyCompetitors: [rec("McDonald's", "McDonald's Seapoint Drive-Thru", -33.915, 18.385, 'hamburger restaurant')],
        nearbyRetail: [], existingStores: [],
      },
    }, "which McDonald's are near site 3?");
    expect(prompt).toContain('Competitor / retail outlets and map layers around the suburb');
    expect(prompt).toContain("McDonald's — McDonald's Seapoint Drive-Thru");
  });
});

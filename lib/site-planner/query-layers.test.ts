import { describe, it, expect, beforeEach } from 'vitest';
import { usePlannerStore, QUERY_PALETTE, MAX_QUERY_LAYERS } from './data-store';
import { brandColor, glyphColorFor } from './brand-colors';

const pt = (lat: number) => ({ n: 'x', b: 'B', lat, lng: 0 } as any);

describe('chat query layers', () => {
  beforeEach(() => usePlannerStore.getState().clearQueryLayers());

  it('gives successive queries distinct colours and stacks them', () => {
    const s = usePlannerStore.getState();
    const a = s.addQueryLayer({ label: 'burger places', points: [pt(1)], query: 'q' });
    const b = s.addQueryLayer({ label: 'KFC places', points: [pt(2)], query: 'q' });
    expect(a.color).not.toBe(b.color);
    expect(a.colorName).not.toBe(b.colorName);
    expect(usePlannerStore.getState().queryLayers.map(l => l.label)).toEqual(['burger places', 'KFC places']);
  });

  it('re-running the same query replaces it in place and keeps its colour', () => {
    const s = usePlannerStore.getState();
    const a = s.addQueryLayer({ label: 'burger places', points: [pt(1)], query: 'q' });
    s.addQueryLayer({ label: 'KFC places', points: [pt(2)], query: 'q' });
    const a2 = s.addQueryLayer({ label: 'burger places', points: [pt(3), pt(4)], query: 'q' });
    expect(a2.color).toBe(a.color);
    const layers = usePlannerStore.getState().queryLayers;
    expect(layers.map(l => l.label)).toEqual(['burger places', 'KFC places']);
    expect(layers[0].points).toHaveLength(2);
  });

  it('drops the oldest layer once every palette colour is in use', () => {
    const s = usePlannerStore.getState();
    for (let i = 0; i <= MAX_QUERY_LAYERS; i++) s.addQueryLayer({ label: `q${i}`, points: [pt(i)], query: 'q' });
    const layers = usePlannerStore.getState().queryLayers;
    expect(layers).toHaveLength(MAX_QUERY_LAYERS);
    expect(layers[0].label).toBe('q1');
    expect(new Set(layers.map(l => l.color)).size).toBe(QUERY_PALETTE.length);
  });

  it('removes a single layer by label', () => {
    const s = usePlannerStore.getState();
    s.addQueryLayer({ label: 'a', points: [], query: 'q' });
    s.addQueryLayer({ label: 'b', points: [], query: 'q' });
    s.removeQueryLayer('a');
    expect(usePlannerStore.getState().queryLayers.map(l => l.label)).toEqual(['b']);
  });

  it('uses the brand colour for a single named major brand', () => {
    const s = usePlannerStore.getState();
    const kfc = s.addQueryLayer({ label: 'KFC places', points: [], query: 'show all KFCs', brand: 'KFC' });
    expect(kfc.color).toBe('#e4002b');
    expect(kfc.colorName).toBe('KFC red');
    const mcd = s.addQueryLayer({ label: "McDonald's places", points: [], query: 'show mcdonalds', brand: "McDonald's" });
    expect(mcd.colorName).toBe("McDonald's yellow");
  });

  it('falls back to the palette for categories, unknown brands and colour clashes', () => {
    const s = usePlannerStore.getState();
    const cat = s.addQueryLayer({ label: 'burger places', points: [], query: 'show burger places' });
    expect(QUERY_PALETTE.map(c => c.color)).toContain(cat.color);
    const unknown = s.addQueryLayer({ label: 'Pedros places', points: [], query: 'show pedros', brand: 'Pedros' });
    expect(QUERY_PALETTE.map(c => c.color)).toContain(unknown.color);
    s.addQueryLayer({ label: 'Boxer stores', points: [], query: 'show boxer', brand: 'Boxer' });
    // Fake a clash: a second layer whose brand colour is already on the map.
    usePlannerStore.setState(st => ({ queryLayers: [...st.queryLayers, { label: 'x', points: [], query: 'x', color: '#e4002b', colorName: 'KFC red' }] }));
    const kfc = s.addQueryLayer({ label: 'KFC places', points: [], query: 'show KFC', brand: 'KFC' });
    expect(kfc.color).not.toBe('#e4002b');
  });
});

describe('brand colours', () => {
  it('looks brands up case-insensitively', () => {
    expect(brandColor('kfc')?.name).toBe('KFC red');
    expect(brandColor('Pick N Pay')?.name).toBe('Pick n Pay blue');
    expect(brandColor('Pedros')).toBeNull();
    expect(brandColor(undefined)).toBeNull();
  });
  it('picks dark glyphs on light pins and white on dark ones', () => {
    expect(glyphColorFor('#ffc72c')).toBe('#1a1208');
    expect(glyphColorFor('#e4002b')).toBe('#ffffff');
  });
});

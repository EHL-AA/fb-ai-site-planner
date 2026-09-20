import { describe, it, expect } from 'vitest';
import { buildPrompt, validateRankedResult, REASONING_MODEL, isInvalidKeyError, classifyIntent, rankingTable, buildAnswerPrompt, describeRankChanges } from './reasoning';
import { FeatureVector, DEFAULT_WEIGHTS } from './types';

const fv: FeatureVector = {
  id: 'n1', label: 'Rosebank Mall', lat: -26.14, lng: 28.04,
  trafficProxy: { poiCount: 12, totalReviews: 5000, anchorTypes: ['shopping_mall'], score0to100: 88 },
  accessibility: { transitStopsNearby: 2, majorRoadAdjacent: true, score0to100: 70 },
  competition: { competitorsWithin1km: 1, nearestCompetitorM: 320 },
  cannibalisation: { ownStoresWithin2km: 0, nearestOwnStoreM: null },
  demographics: { source: 'csv', lsm: 9, affluenceProxy0to100: 80 },
};

describe('REASONING_MODEL', () => {
  it('is the current Gemini 3.8 Flash reasoning model', () => {
    expect(REASONING_MODEL).toBe('gemini-3.8-flash');
  });
});

describe('isInvalidKeyError', () => {
  it('recognises the Gemini API_KEY_INVALID error payload', () => {
    expect(isInvalidKeyError(new Error('API key not valid. Please pass a valid API key.'))).toBe(true);
    expect(isInvalidKeyError(new Error('{"error":{"status":"INVALID_ARGUMENT","details":[{"reason":"API_KEY_INVALID"}]}}'))).toBe(true);
  });
  it('ignores unrelated errors so they still get retried', () => {
    expect(isInvalidKeyError(new Error('RESOURCE_EXHAUSTED'))).toBe(false);
    expect(isInvalidKeyError(new Error('network down'))).toBe(false);
  });
});

describe('buildPrompt', () => {
  it('embeds brand, weights and each candidate id', () => {
    const p = buildPrompt({ brand: 'Steers', suburb: 'Rosebank', features: [fv], weights: DEFAULT_WEIGHTS, constraints: 'avoid malls' });
    expect(p).toContain('Steers');
    expect(p).toContain('Rosebank');
    expect(p).toContain('n1');
    expect(p).toContain('avoid malls');
    expect(p).toContain('0.4'); // traffic weight
  });
});

describe('validateRankedResult', () => {
  it('accepts a well-formed result', () => {
    const ok = validateRankedResult({
      overallSummary: 'x',
      ranked: [{ id: 'n1', rank: 1, compositeScore0to100: 90, breakdown: { traffic: 88, demographics: 80, competition: 70, accessibility: 70 }, rationale: 'good', risks: 'none' }],
    });
    expect(ok.ranked[0].id).toBe('n1');
  });
  it('throws on a missing ranked array', () => {
    expect(() => validateRankedResult({ overallSummary: 'x' })).toThrow();
  });
  it('throws when a ranked item lacks an id', () => {
    expect(() => validateRankedResult({ overallSummary: 'x', ranked: [{ rank: 1 }] })).toThrow();
  });
});

describe('buildPrompt provenance', () => {
  it('lists each data source with its provenance and omits the block when absent', () => {
    const withSources = { ...fv, sources: [
      { label: 'Google Routes API (live traffic)', provenance: 'measured' as const, note: 'peak' },
      { label: 'Foot traffic (no feed connected)', provenance: 'unavailable' as const, note: 'none' },
    ] };
    const p = buildPrompt({ brand: 'Steers', suburb: 'Rosebank', features: [withSources], weights: DEFAULT_WEIGHTS });
    expect(p).toContain('Data provenance');
    expect(p).toContain('- Google Routes API (live traffic): measured — peak');
    expect(p).toContain('- Foot traffic (no feed connected): unavailable — none');
    expect(buildPrompt({ brand: 'Steers', suburb: 'Rosebank', features: [fv], weights: DEFAULT_WEIGHTS })).not.toContain('Data provenance');
  });
});

describe('classifyIntent', () => {
  it('treats questions as questions and instructions as re-ranks', () => {
    expect(classifyIntent('Why is site 1 ranked above site 2?')).toBe('question');
    expect(classifyIntent('Which sites have the strongest lunch trade')).toBe('question');
    expect(classifyIntent('Should we weight traffic higher?')).toBe('question');
    expect(classifyIntent('Weight traffic higher')).toBe('rerank');
    expect(classifyIntent('Exclude anything within 2 km of an existing Steers')).toBe('rerank');
    expect(classifyIntent('Avoid cannibalisation')).toBe('rerank');
    expect(classifyIntent('re-rank with demographics at 40%')).toBe('rerank');
    expect(classifyIntent('thanks')).toBe('question');
  });
});

describe('rankingTable / buildAnswerPrompt', () => {
  const result = { overallSummary: 's', ranked: [
    { id: 'n2', rank: 1, compositeScore0to100: 70, breakdown: { traffic: 1, demographics: 1, competition: 1, accessibility: 1 }, rationale: 'busy', risks: '' },
    { id: 'n1', rank: 2, compositeScore0to100: 60, breakdown: { traffic: 1, demographics: 1, competition: 1, accessibility: 1 }, rationale: 'quiet', risks: '' },
  ] };
  it('maps Site N to the node at rank N, not to node ids', () => {
    const t = rankingTable([fv, { ...fv, id: 'n2', label: 'Near Mall' }], result);
    expect(t.split('\n')[0]).toContain('Site 1 (rank 1) = n2 "Near Mall"');
    expect(t.split('\n')[1]).toContain('Site 2 (rank 2) = n1 "Rosebank Mall"');
  });
  it('includes the ranking, provenance, history and the question', () => {
    const p = buildAnswerPrompt({ brand: 'Steers', suburb: 'Rosebank', features: [fv], weights: DEFAULT_WEIGHTS, result, history: [{ role: 'user', text: 'hi' }, { role: 'agent', text: 'hello' }] }, 'Why is site 1 top?');
    expect(p).toContain('Current ranking');
    expect(p).toContain('Planner: hi');
    expect(p).toContain("Planner's question: Why is site 1 top?");
  });
});

describe('describeRankChanges', () => {
  const mk = (order: string[]) => ({ overallSummary: '', ranked: order.map((id, i) => ({ id, rank: i + 1, compositeScore0to100: 50, breakdown: { traffic: 1, demographics: 1, competition: 1, accessibility: 1 }, rationale: '', risks: '' })) });
  const feats = [{ ...fv, id: 'a', label: 'A' }, { ...fv, id: 'b', label: 'B' }, { ...fv, id: 'c', label: 'C' }];
  it('lists movements up and down by site name', () => {
    expect(describeRankChanges(mk(['a', 'b', 'c']), mk(['c', 'a', 'b']), feats)).toBe('**Moved up:** C 3→1. **Moved down:** A 1→2, B 2→3.');
    expect(describeRankChanges(mk(['a', 'b', 'c']), mk(['a', 'b', 'c']), feats)).toBe('Ranking unchanged.');
    expect(describeRankChanges(null, mk(['a']), feats)).toBe('');
  });
});

describe('validateRankedResult appliedWeights', () => {
  const base = { overallSummary: 'x', ranked: [{ id: 'n1', rank: 1, compositeScore0to100: 90, breakdown: { traffic: 1, demographics: 1, competition: 1, accessibility: 1 }, rationale: 'g', risks: '' }] };
  it('normalises applied weights to sum 1 and rounds to 2 dp', () => {
    const r = validateRankedResult({ ...base, appliedWeights: { traffic: 2, demographics: 1, competition: 0.5, accessibility: 0.5 } });
    expect(r.appliedWeights).toEqual({ traffic: 0.5, demographics: 0.25, competition: 0.13, accessibility: 0.13 });
  });
  it('drops malformed applied weights instead of failing', () => {
    const r = validateRankedResult({ ...base, appliedWeights: { traffic: 'a', demographics: 1, competition: 1, accessibility: 1 } });
    expect(r.appliedWeights).toBeUndefined();
    expect(validateRankedResult(base).appliedWeights).toBeUndefined();
  });
});

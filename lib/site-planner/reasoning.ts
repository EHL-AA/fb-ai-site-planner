import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { FeatureVector, RankedResult, ScoringWeights } from './types';

const API_KEY = process.env.API_KEY as string;
export const REASONING_MODEL = 'gemini-3.8-flash';
/** Human-readable model name for UI badges/status text. */
export const REASONING_MODEL_LABEL = 'Gemini 3.8 Flash';

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    overallSummary: { type: 'STRING' },
    ranked: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'STRING' },
          rank: { type: 'NUMBER' },
          compositeScore0to100: { type: 'NUMBER' },
          breakdown: {
            type: 'OBJECT',
            properties: {
              traffic: { type: 'NUMBER' },
              demographics: { type: 'NUMBER' },
              competition: { type: 'NUMBER' },
              accessibility: { type: 'NUMBER' },
            },
            required: ['traffic', 'demographics', 'competition', 'accessibility'],
          },
          rationale: { type: 'STRING' },
          risks: { type: 'STRING' },
        },
        required: ['id', 'rank', 'compositeScore0to100', 'breakdown', 'rationale', 'risks'],
      },
    },
  },
  required: ['overallSummary', 'ranked'],
};

const SYSTEM = `You are a retail site-selection analyst for Famous Brands, a South African
quick-service-restaurant group. You receive candidate commercial sites in a suburb, each with
pre-computed signals (Google Places review density, Routes live congestion at morning/lunch/evening,
opening-hours evening and Sunday trade, price-band affluence, accessibility, nearby competitor count,
cannibalisation against existing Famous Brands stores, and demographics).
Score each site 0-100 as a weighted composite using the provided weights, rank them best-first,
and explain each ranking in plain business language. Penalise high cannibalisation and excessive
direct competition. Reward high traffic, good accessibility, and target-customer demographic fit.
Be specific about why a site wins or loses. Never invent data not present in the candidate.

Each candidate carries a "sources" list. Signals marked "proxy" are indirect estimates; signals marked
"unavailable" were not collected for this run. Never treat a proxy as measured footfall; no source in this app measures foot traffic directly. When a
ranking rests mainly on proxies, say so plainly in the rationale and in overallSummary.`;

export interface PromptInput {
  brand: string;
  suburb: string;
  features: FeatureVector[];
  weights: ScoringWeights;
  constraints?: string;
}

export function provenanceBlock(features: FeatureVector[]): string {
  const seen = new Map<string, { provenance: string; note?: string }>();
  for (const f of features) for (const s of f.sources ?? []) if (!seen.has(s.label)) seen.set(s.label, s);
  if (!seen.size) return '';
  const lines = [...seen.entries()].map(([label, s]) => `- ${label}: ${s.provenance}${s.note ? ` — ${s.note}` : ''}`);
  return ['Data provenance (applies to every candidate):', ...lines].join('\n');
}

export function buildPrompt({ brand, suburb, features, weights, constraints }: PromptInput): string {
  return [
    `Brand to place: ${brand}`,
    `Suburb under analysis: ${suburb}`,
    `Scoring weights (sum 1.0): traffic=${weights.traffic}, demographics=${weights.demographics}, competition=${weights.competition}, accessibility=${weights.accessibility}`,
    constraints ? `Additional user constraints: ${constraints}` : '',
    provenanceBlock(features),
    `Candidate sites (JSON):`,
    JSON.stringify(features.map(({ sources, ...rest }) => rest), null, 2),
    `Return the ranked result strictly as JSON matching the schema. Include every candidate id exactly once.`,
  ].filter(Boolean).join('\n\n');
}

export function validateRankedResult(data: any): RankedResult {
  if (!data || typeof data !== 'object') throw new Error('reasoning result is not an object');
  if (typeof data.overallSummary !== 'string') throw new Error('reasoning result missing overallSummary');
  if (!Array.isArray(data.ranked)) throw new Error('reasoning result missing ranked array');
  for (const item of data.ranked) {
    if (!item || typeof item.id !== 'string') throw new Error('ranked item missing id');
    if (typeof item.rank !== 'number') throw new Error(`ranked item ${item.id} missing rank`);
    if (typeof item.compositeScore0to100 !== 'number') throw new Error(`ranked item ${item.id} missing compositeScore0to100`);
    if (!item.breakdown || typeof item.breakdown !== 'object') throw new Error(`ranked item ${item.id} missing breakdown`);
    if (typeof item.rationale !== 'string') throw new Error(`ranked item ${item.id} missing rationale`);
    if (typeof item.risks !== 'string') throw new Error(`ranked item ${item.id} missing risks`);
  }
  return data as RankedResult;
}

/** True when the Gemini API rejected the key itself (as opposed to quota, network, etc.). */
export function isInvalidKeyError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e ?? '');
  return /API_KEY_INVALID|API key not valid/i.test(msg);
}

async function callPro(prompt: string): Promise<RankedResult> {
  if (!API_KEY) throw new Error('Missing required environment variable: API_KEY');
  const ai = new GoogleGenAI({ apiKey: API_KEY });
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await ai.models.generateContent({
        model: REASONING_MODEL,
        contents: prompt,
        config: {
          systemInstruction: SYSTEM,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA as any,
          // Gemini 3 models use thinkingLevel (2.5 used thinkingBudget). HIGH = deepest reasoning.
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
        },
      });
      if (!res.text) throw new Error('Empty response from the reasoning model.');
      return validateRankedResult(JSON.parse(res.text));
    } catch (e) {
      lastErr = e;
      // An invalid key will never succeed on retry; surface the actionable fix instead.
      if (isInvalidKeyError(e)) {
        throw new Error(
          'Gemini API key rejected (API_KEY_INVALID). Create a key at https://aistudio.google.com/apikey, set GEMINI_API_KEY in .env, then restart the dev server / rebuild.',
        );
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Reasoning model call failed');
}

/** First-pass ranking of detected candidates. */
export function analyzeSuburb(input: PromptInput): Promise<RankedResult> {
  return callPro(buildPrompt(input));
}

/** Re-rank the same candidates with an added natural-language constraint from chat. */
export function rerank(input: PromptInput, userMessage: string): Promise<RankedResult> {
  return callPro(buildPrompt({ ...input, constraints: [input.constraints, userMessage].filter(Boolean).join('; ') }));
}

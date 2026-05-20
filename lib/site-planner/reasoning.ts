import { GoogleGenAI } from '@google/genai';
import { FeatureVector, RankedResult, ScoringWeights } from './types';

const API_KEY = process.env.API_KEY as string;
export const REASONING_MODEL = 'gemini-2.5-pro';

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
pre-computed signals (traffic proxy from Google Places review density, accessibility, nearby
competitor count, cannibalisation against existing Famous Brands stores, and demographics).
Score each site 0-100 as a weighted composite using the provided weights, rank them best-first,
and explain each ranking in plain business language. Penalise high cannibalisation and excessive
direct competition. Reward high traffic, good accessibility, and target-customer demographic fit.
Be specific about why a site wins or loses. Never invent data not present in the candidate.`;

export interface PromptInput {
  brand: string;
  suburb: string;
  features: FeatureVector[];
  weights: ScoringWeights;
  constraints?: string;
}

export function buildPrompt({ brand, suburb, features, weights, constraints }: PromptInput): string {
  return [
    `Brand to place: ${brand}`,
    `Suburb under analysis: ${suburb}`,
    `Scoring weights (sum 1.0): traffic=${weights.traffic}, demographics=${weights.demographics}, competition=${weights.competition}, accessibility=${weights.accessibility}`,
    constraints ? `Additional user constraints: ${constraints}` : '',
    `Candidate sites (JSON):`,
    JSON.stringify(features, null, 2),
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
          thinkingConfig: { thinkingBudget: -1 }, // -1 = dynamic ("thinking on")
        },
      });
      return validateRankedResult(JSON.parse(res.text ?? ''));
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Pro reasoning failed');
}

/** First-pass ranking of detected candidates. */
export function analyzeSuburb(input: PromptInput): Promise<RankedResult> {
  return callPro(buildPrompt(input));
}

/** Re-rank the same candidates with an added natural-language constraint from chat. */
export function rerank(input: PromptInput, userMessage: string): Promise<RankedResult> {
  return callPro(buildPrompt({ ...input, constraints: [input.constraints, userMessage].filter(Boolean).join('; ') }));
}

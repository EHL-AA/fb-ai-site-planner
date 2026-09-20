import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { FeatureVector, RankedResult, ScoringWeights } from './types';

export interface ChatTurn { role: 'user' | 'agent'; text: string; }

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
    appliedWeights: {
      type: 'OBJECT',
      properties: {
        traffic: { type: 'NUMBER' }, demographics: { type: 'NUMBER' }, competition: { type: 'NUMBER' }, accessibility: { type: 'NUMBER' },
      },
      required: ['traffic', 'demographics', 'competition', 'accessibility'],
    },
  },
  required: ['overallSummary', 'ranked', 'appliedWeights'],
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
In overallSummary, rationale and risks, always call a site by its label (e.g. "Near Nabielah Hardware"), never by
its node id. Keep overallSummary under 90 words and, when the request was a change, lead with what moved and why.
A signal marked unavailable was not measured; never describe it as zero or absent.

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
    `Return the ranked result strictly as JSON matching the schema. Include every candidate id exactly once. In appliedWeights, return the four pillar weights you actually used (if the constraints asked you to weight something higher or lower, reflect that; otherwise return the given weights).`,
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
  const w = data.appliedWeights;
  if (w && typeof w === 'object') {
    const keys = ['traffic', 'demographics', 'competition', 'accessibility'] as const;
    const vals = keys.map(k => (typeof w[k] === 'number' && Number.isFinite(w[k]) && w[k] >= 0 ? w[k] : NaN));
    const sum = vals.reduce((a, b) => a + b, 0);
    if (vals.every(Number.isFinite) && sum > 0) {
      data.appliedWeights = Object.fromEntries(keys.map((k, i) => [k, Math.round((vals[i] / sum) * 100) / 100]));
    } else {
      delete data.appliedWeights;
    }
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


// ---------------------------------------------------------------------------
// Chat: questions are answered; only explicit instructions re-rank.
// ---------------------------------------------------------------------------

export type ChatIntent = 'rerank' | 'question';

const RERANK_VERBS = /\b(re-?rank|rank (them |it |these )?again|re-?score|weight|weigh|prioriti[sz]e|de-?prioriti[sz]e|exclude|ignore|only (consider|include|keep|look at)|avoid|drop|remove|penali[sz]e|boost|favou?r|focus on|filter (out|to)|assume|treat)\b/i;
const QUESTION_OPENERS = /^\s*(why|what|which|how|who|when|where|is|are|does|do|did|can|could|should|would|will|explain|compare|tell|describe|summari[sz]e)\b/i;

/** Instructions that change the scoring re-rank; everything else is a question about the current ranking. */
export function classifyIntent(message: string): ChatIntent {
  const m = message.trim();
  if (!m) return 'question';
  if (QUESTION_OPENERS.test(m) || m.endsWith('?')) return 'question';
  return RERANK_VERBS.test(m) ? 'rerank' : 'question';
}

/** "Rank 1 · node-6 · Near X · score 45" lines so the model resolves "site 2" to the right place. */
export function rankingTable(features: FeatureVector[], result: RankedResult | null): string {
  if (!result) return 'No ranking yet.';
  const byId = new Map(features.map(f => [f.id, f]));
  return [...result.ranked]
    .sort((a, b) => a.rank - b.rank)
    .map(r => `Site ${r.rank} (rank ${r.rank}) = ${r.id} "${byId.get(r.id)?.label ?? r.id}" — score ${Math.round(r.compositeScore0to100)}; rationale: ${r.rationale}`)
    .join('\n');
}

const SYSTEM_QA = `You are the same Famous Brands site-selection analyst, now answering a property planner's
question about a ranking you already produced. Rules:
- "Site N" and "rank N" always mean the row with rank N in the ranking table you are given, never a node id.
- Do not change or propose a new ranking; explain the one that exists. If the user seems to want a change, say
  they can ask you to re-rank with an instruction such as "weight traffic higher".
- Be concrete: quote the actual numbers for the sites involved (reviews, congestion by time of day, trade hours,
  price band, competitors, distances). Never invent data.
- Keep it short: under 140 words, markdown, one short lead sentence then 2–5 bullets. Refer to sites as
  "Site 2 (Near X)".
- If the data cannot answer the question, say exactly what is missing and what would unlock it (e.g. enable the
  Places Aggregate API; load census wards; the app measures vehicle congestion, not pedestrian footfall).
- If the user's premise is wrong, correct it gently and factually ("It's the other way round: …"), never call it incorrect.
- "unavailable" means not measured for that site; never present it as zero.
- Stats SA did not release Census 2022 income; loading the census unlocks population and density only. Income or LSM
  comes from a demographics CSV the planner uploads.
- You cannot change the brand. The ranking, existing-store layer and cannibalisation are specific to the brand the planner
  selected; to assess another Famous Brands marque, tell them to pick it in the brand chips and press Find sites.`;

export function buildAnswerPrompt(input: PromptInput & { result: RankedResult | null; history?: ChatTurn[] }, question: string): string {
  const history = (input.history ?? []).slice(-6).map(t => `${t.role === 'user' ? 'Planner' : 'Analyst'}: ${t.text}`).join('\n');
  return [
    `Brand: ${input.brand}. Suburb: ${input.suburb}.`,
    `Scoring weights: traffic=${input.weights.traffic}, demographics=${input.weights.demographics}, competition=${input.weights.competition}, accessibility=${input.weights.accessibility}`,
    'Current ranking (authoritative):',
    rankingTable(input.features, input.result),
    provenanceBlock(input.features),
    'Candidate signals (JSON, keyed by node id):',
    JSON.stringify(input.features.map(({ sources, ...rest }) => rest)),
    history ? `Recent conversation:\n${history}` : '',
    `Planner's question: ${question}`,
  ].filter(Boolean).join('\n\n');
}

/** Answer a question about the current ranking without changing it. */
export async function answerQuestion(input: PromptInput & { result: RankedResult | null; history?: ChatTurn[] }, question: string): Promise<string> {
  if (!API_KEY) throw new Error('Missing required environment variable: API_KEY');
  const ai = new GoogleGenAI({ apiKey: API_KEY });
  const res = await ai.models.generateContent({
    model: REASONING_MODEL,
    contents: buildAnswerPrompt(input, question),
    config: { systemInstruction: SYSTEM_QA, thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
  });
  const text = res.text?.trim();
  if (!text) throw new Error('Empty answer from the reasoning model.');
  return text;
}

/** Human summary of rank movements between two rankings, for the chat reply after a re-rank. */
export function describeRankChanges(before: RankedResult | null, after: RankedResult, features: FeatureVector[]): string {
  if (!before) return '';
  const name = (id: string) => features.find(f => f.id === id)?.label ?? id;
  const prev = new Map(before.ranked.map(r => [r.id, r.rank]));
  const moves = after.ranked
    .map(r => ({ id: r.id, from: prev.get(r.id), to: r.rank }))
    .filter(m => m.from != null && m.from !== m.to)
    .sort((a, b) => a.to - b.to);
  if (!moves.length) return 'Ranking unchanged.';
  const up = moves.filter(m => m.to < (m.from as number)).map(m => `${name(m.id)} ${m.from}→${m.to}`);
  const down = moves.filter(m => m.to > (m.from as number)).map(m => `${name(m.id)} ${m.from}→${m.to}`);
  return [up.length ? `**Moved up:** ${up.join(', ')}.` : '', down.length ? `**Moved down:** ${down.join(', ')}.` : ''].filter(Boolean).join(' ');
}

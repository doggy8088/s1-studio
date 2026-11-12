import { describe, expect, test } from 'bun:test';
import type { S1RequestPayload } from '@/types/systemone';
import {
  GEMINI_DECISIONS_ENDPOINT,
  buildGeminiDecisionsEndpoint,
  detectImageMimeType,
  isGeminiDecisionsProfile,
  normalizeGeminiDecisionsModel,
  normalizeGeminiUsage,
  toGeminiDecisionsRequest,
  validateGeminiDecisionsPayload,
} from '@/lib/gemini-decisions';
import {
  formatEndpointPreviewUrl,
  getDefaultModelsForProfile,
  getSelectableModelsForProfile,
  isProfileEndpointAndKeyValid,
  normalizeS1ResponsePayload,
} from '@/lib/s1-utils';
import { DEFAULT_PROFILES } from '@/lib/presets';

const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const geminiProfile = DEFAULT_PROFILES.find(
  (p) => p.id === 'gemini-decisions-api'
)!;

/** Real response captured from POST /v1beta/decisions (gemini-decision-1). */
const LIVE_RESPONSE = {
  answers: {
    is_damaged: { confidence: 0.979, noul: 0.979, type: 'noul' },
    urgency: {
      confidence: 0.4959,
      score: 0.827,
      probabilities: { '0': 0.3385, '1': 0.4959, '2': 0.1656 },
      legend: { '1': 'Soon', '2': 'Urgent', '0': 'Routine' },
      type: 'score',
    },
    topic: {
      confidence: 0.7777,
      choice: 'product',
      probabilities: { billing: 0.0066, shipping: 0.2158, product: 0.7777 },
      type: 'choice',
    },
  },
  usage: {
    total_tokens: 220,
    total_input_tokens: 220,
    input_tokens_by_modality: [{ modality: 'text', tokens: 220 }],
    total_output_tokens: 0,
  },
};

const basePayload: S1RequestPayload = {
  model: 'gemini-decision-1',
  state: 'The blue mug I ordered on Monday arrived cracked on Wednesday.',
  questions: {
    is_damaged: {
      type: 'noul',
      instructions: 'Did the item arrive damaged?',
      criteria: { true: 'Broken or cracked', false: 'Intact' },
    },
    topic: {
      type: 'choice',
      instructions: 'Topic?',
      criteria: { billing: null, shipping: 'Delivery issues', product: 'Quality' },
    },
    urgency: {
      type: 'score',
      instructions: 'How urgent?',
      criteria: ['Routine', 'Soon', 'Urgent'],
    },
  },
};

describe('Gemini profile detection & endpoint', () => {
  test('built-in Gemini profile exists, is direct mode, and sits before the simulator', () => {
    expect(geminiProfile).toBeDefined();
    expect(geminiProfile.useProxy).toBe(false);
    expect(geminiProfile.defaultModel).toBe('gemini-decision-1');
    const ids = DEFAULT_PROFILES.map((p) => p.id);
    expect(ids.indexOf('gemini-decisions-api')).toBe(
      ids.indexOf('s1-builtin-simulator') - 1
    );
  });

  test('detects by id or by host only', () => {
    expect(isGeminiDecisionsProfile(geminiProfile)).toBe(true);
    expect(
      isGeminiDecisionsProfile({
        id: 'custom',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      })
    ).toBe(true);
    expect(
      isGeminiDecisionsProfile({ id: 'x', baseUrl: 'https://ollama.com' })
    ).toBe(false);
    expect(
      isGeminiDecisionsProfile({
        id: 'x',
        baseUrl: 'https://evil.example/generativelanguage.googleapis.com',
      })
    ).toBe(false);
  });

  test('resolves the decisions endpoint from any Gemini base URL', () => {
    for (const base of [
      'https://generativelanguage.googleapis.com',
      'https://generativelanguage.googleapis.com/',
      'https://generativelanguage.googleapis.com/v1beta',
      'https://generativelanguage.googleapis.com/v1beta/decisions',
    ]) {
      expect(buildGeminiDecisionsEndpoint(base)).toBe(GEMINI_DECISIONS_ENDPOINT);
      expect(formatEndpointPreviewUrl(base)).toBe(GEMINI_DECISIONS_ENDPOINT);
    }
  });

  test('models are fixed to gemini-decision-1 and require an API key', () => {
    expect(getDefaultModelsForProfile(geminiProfile)).toEqual(['gemini-decision-1']);
    expect(getSelectableModelsForProfile(geminiProfile)).toEqual(['gemini-decision-1']);
    expect(isProfileEndpointAndKeyValid(geminiProfile)).toBe(false);
    expect(isProfileEndpointAndKeyValid({ ...geminiProfile, apiKey: 'k' })).toBe(true);
    expect(normalizeGeminiDecisionsModel('models/gemini-decision-1')).toBe('gemini-decision-1');
    expect(normalizeGeminiDecisionsModel('clef')).toBe('gemini-decision-1');
  });
});

describe('toGeminiDecisionsRequest', () => {
  test('maps state → input and S1 criteria → Gemini criteria', () => {
    const body = toGeminiDecisionsRequest(basePayload);
    expect(body).toEqual({
      model: 'gemini-decision-1',
      input: basePayload.state as string,
      questions: {
        is_damaged: {
          type: 'noul',
          instructions: 'Did the item arrive damaged?',
          criteria: { true_description: 'Broken or cracked', false_description: 'Intact' },
        },
        topic: {
          type: 'choice',
          instructions: 'Topic?',
          criteria: { billing: '', shipping: 'Delivery issues', product: 'Quality' },
        },
        urgency: {
          type: 'score',
          instructions: 'How urgent?',
          criteria: ['Routine', 'Soon', 'Urgent'],
        },
      },
    });
    expect(JSON.stringify(body)).not.toContain('"state"');
    expect(JSON.stringify(body)).not.toContain('"images"');
  });

  test('preserves choice option order (affects tie-breaking)', () => {
    const body = toGeminiDecisionsRequest(basePayload);
    const topic = body.questions.topic as { criteria: Record<string, string> };
    expect(Object.keys(topic.criteria)).toEqual(['billing', 'shipping', 'product']);
  });

  test('omits noul criteria when none given', () => {
    const body = toGeminiDecisionsRequest({
      state: 'x',
      questions: { q: { type: 'noul', instructions: 'ok?' } },
    });
    expect(body.questions.q).toEqual({ type: 'noul', instructions: 'ok?' });
  });

  test('JSON state is serialized as text', () => {
    const body = toGeminiDecisionsRequest({
      state: { user: 'a', items: [1, 2] },
      questions: { q: { type: 'noul', instructions: 'ok?' } },
    });
    expect(typeof body.input).toBe('string');
    expect(JSON.parse(body.input as string)).toEqual({ user: 'a', items: [1, 2] });
  });

  test('images become content blocks with sniffed MIME types', () => {
    const body = toGeminiDecisionsRequest({
      state: 'Look at this',
      images: [PNG_B64, '/9j/4AAQSkZJRg', `data:image/webp;base64,UklGRabc`],
      questions: { q: { type: 'noul', instructions: 'ok?' } },
    });
    expect(body.input).toEqual([
      { type: 'text', text: 'Look at this\n' },
      { type: 'image', data: PNG_B64, mime_type: 'image/png' },
      { type: 'image', data: '/9j/4AAQSkZJRg', mime_type: 'image/jpeg' },
      { type: 'image', data: 'UklGRabc', mime_type: 'image/webp' },
    ]);
  });

  test('MIME sniffing covers common formats', () => {
    expect(detectImageMimeType('R0lGODlh')).toBe('image/gif');
    expect(detectImageMimeType('UklGRxxxx')).toBe('image/webp');
    expect(detectImageMimeType('Qk02')).toBe('image/bmp');
    expect(detectImageMimeType('unknown')).toBe('image/png');
  });
});

describe('validateGeminiDecisionsPayload', () => {
  test('accepts valid payload', () => {
    expect(validateGeminiDecisionsPayload(basePayload)).toEqual([]);
  });

  test('rejects dotted or too-long question keys', () => {
    const issues = validateGeminiDecisionsPayload({
      state: 'x',
      questions: {
        'a.b': { type: 'noul', instructions: 'x' },
        ['k'.repeat(65)]: { type: 'noul', instructions: 'x' },
      },
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('a.b');
  });

  test('rejects empty input but allows image-only input', () => {
    const q = { q: { type: 'noul' as const, instructions: 'x' } };
    expect(validateGeminiDecisionsPayload({ state: '  ', questions: q })).toHaveLength(1);
    expect(
      validateGeminiDecisionsPayload({ state: '', images: [PNG_B64], questions: q })
    ).toEqual([]);
  });
});

describe('response normalization', () => {
  test('Gemini answers populate nouls/choices/scores with index scale', () => {
    const norm = normalizeS1ResponsePayload(
      { ...LIVE_RESPONSE, usage: normalizeGeminiUsage(LIVE_RESPONSE.usage) },
      basePayload.questions,
      { scoreScale: 'index' }
    );
    expect(norm.nouls?.is_damaged.noul).toBeCloseTo(0.979);
    expect(norm.choices?.topic.choice).toBe('product');
    expect(norm.choices?.topic.probabilities?.shipping).toBeCloseTo(0.2158);
    expect(norm.scores?.urgency.score).toBeCloseTo(0.827);
    expect(norm.scores?.urgency.scoreScale).toBe('index');
    expect(norm.usage?.input_tokens).toBe(220);
    expect(norm.usage?.output_tokens).toBe(0);
  });

  test('legacy callers get no scoreScale (unchanged behaviour)', () => {
    const norm = normalizeS1ResponsePayload(LIVE_RESPONSE, basePayload.questions);
    expect(norm.scores?.urgency.scoreScale).toBeUndefined();
  });

  test('usage mapping keeps existing input_tokens', () => {
    expect(normalizeGeminiUsage({ input_tokens: 5, total_input_tokens: 9 })).toEqual({
      input_tokens: 5,
      total_input_tokens: 9,
    });
    expect(normalizeGeminiUsage(undefined)).toBeUndefined();
  });
});

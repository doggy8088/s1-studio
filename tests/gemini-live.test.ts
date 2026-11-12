/**
 * Live integration test against the real Gemini Decisions API.
 * Runs only when GEMINI_API_KEY is set (skipped in CI unless the secret is configured).
 *
 *   GEMINI_API_KEY=... bun test tests/gemini-live.test.ts
 */
import { describe, expect, test } from 'bun:test';
import { DEFAULT_PROFILES } from '@/lib/presets';
import { executeSystemOneRequest } from '@/lib/s1-utils';

const apiKey = process.env.GEMINI_API_KEY?.trim();
const PNG_1PX =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

describe.skipIf(!apiKey)('Gemini Decisions API (live)', () => {
  const profile = {
    ...DEFAULT_PROFILES.find((p) => p.id === 'gemini-decisions-api')!,
    apiKey: apiKey ?? '',
  };

  test(
    'noul + choice + score with S1-shaped payload',
    async () => {
      const run = await executeSystemOneRequest(profile, {
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
            instructions: 'What is the topic?',
            criteria: { billing: null, shipping: 'Delivery issues', product: 'Product quality' },
          },
          urgency: {
            type: 'score',
            instructions: 'How urgent is this?',
            criteria: ['Routine', 'Soon', 'Urgent'],
          },
        },
      });
      expect(run.error).toBeUndefined();
      expect(run.status).toBe(200);
      expect(run.response?.nouls?.is_damaged.noul).toBeGreaterThan(0.5);
      expect(['billing', 'shipping', 'product']).toContain(
        run.response?.choices?.topic.choice ?? ''
      );
      const score = run.response?.scores?.urgency;
      expect(score?.scoreScale).toBe('index');
      expect(score?.score).toBeGreaterThanOrEqual(0);
      expect(score?.score).toBeLessThanOrEqual(2);
      expect(run.response?.usage?.input_tokens).toBeGreaterThan(0);
    },
    30_000
  );

  test(
    'multimodal input (JSON state + image)',
    async () => {
      const run = await executeSystemOneRequest(profile, {
        state: { ticket: 'Customer attached a photo' },
        images: [PNG_1PX],
        questions: {
          has_image: { type: 'noul', instructions: 'Is an image included in the input?' },
        },
      });
      expect(run.error).toBeUndefined();
      expect(run.status).toBe(200);
      expect(typeof run.response?.nouls?.has_image.noul).toBe('number');
    },
    30_000
  );

  test(
    'invalid API key surfaces a readable error',
    async () => {
      const run = await executeSystemOneRequest(
        { ...profile, apiKey: 'invalid-key' },
        { state: 'x', questions: { q: { type: 'noul', instructions: 'ok?' } } }
      );
      expect(run.status).toBe(400);
      expect(run.error).toContain('API key not valid');
    },
    30_000
  );
});

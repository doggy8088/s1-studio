import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { EndpointProfile, S1RequestPayload } from '@/types/systemone';
import { DEFAULT_PROFILES } from '@/lib/presets';
import { executeSystemOneRequest } from '@/lib/s1-utils';
import {
  generateCurlSnippet,
  generatePythonSnippet,
  generateTypeScriptSnippet,
  getProfileApiKeyEnvVar,
} from '@/lib/code-exporter';

type Captured = { url: string; init: RequestInit };
let calls: Captured[] = [];
let nextResponse: () => Response;
const realFetch = globalThis.fetch;

beforeEach(() => {
  calls = [];
  nextResponse = () =>
    new Response(
      JSON.stringify({
        answers: { ok: { type: 'noul', noul: 0.9, confidence: 0.9 } },
        usage: { total_input_tokens: 10, total_output_tokens: 0, total_tokens: 10 },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return nextResponse();
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

const profile = (id: string, patch: Partial<EndpointProfile> = {}) => ({
  ...DEFAULT_PROFILES.find((p) => p.id === id)!,
  ...patch,
});

const payload: S1RequestPayload = {
  model: 'gemini-decision-1',
  state: 'hello',
  questions: { ok: { type: 'noul', instructions: 'ok?' } },
};

const headersOf = (c: Captured) => c.init.headers as Record<string, string>;
const bodyOf = (c: Captured) => JSON.parse(String(c.init.body));

describe('executeSystemOneRequest → Gemini Decisions', () => {
  test('direct mode calls /v1beta/decisions with x-goog-api-key and Gemini body', async () => {
    const run = await executeSystemOneRequest(
      profile('gemini-decisions-api', { apiKey: 'AIzaTEST' }),
      payload
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://generativelanguage.googleapis.com/v1beta/decisions');
    expect(headersOf(calls[0])['x-goog-api-key']).toBe('AIzaTEST');
    expect(headersOf(calls[0]).Authorization).toBeUndefined();
    expect(bodyOf(calls[0])).toEqual({
      model: 'gemini-decision-1',
      input: 'hello',
      questions: { ok: { type: 'noul', instructions: 'ok?' } },
    });
    expect(run.status).toBe(200);
    expect(run.error).toBeUndefined();
    expect(run.model).toBe('gemini-decision-1');
    expect(run.response?.nouls?.ok.noul).toBe(0.9);
    expect(run.response?.usage?.input_tokens).toBe(10);
  });

  test('proxy mode goes through /api/proxy with Bearer + target header', async () => {
    await executeSystemOneRequest(
      profile('gemini-decisions-api', { apiKey: 'AIzaTEST', useProxy: true }),
      payload
    );
    expect(calls[0].url).toBe('/api/proxy');
    expect(headersOf(calls[0])['x-s1-target-url']).toBe(
      'https://generativelanguage.googleapis.com/v1beta/decisions'
    );
    expect(headersOf(calls[0]).Authorization).toBe('Bearer AIzaTEST');
    expect(bodyOf(calls[0]).input).toBe('hello');
  });

  test('missing key fails locally without a network call', async () => {
    const run = await executeSystemOneRequest(profile('gemini-decisions-api'), payload);
    expect(calls).toHaveLength(0);
    expect(run.status).toBe(401);
    expect(run.error).toContain('GEMINI_API_KEY');
  });

  test('invalid question key fails locally', async () => {
    const run = await executeSystemOneRequest(
      profile('gemini-decisions-api', { apiKey: 'k' }),
      { ...payload, questions: { 'a.b': { type: 'noul', instructions: 'x' } } }
    );
    expect(calls).toHaveLength(0);
    expect(run.status).toBe(400);
    expect(run.error).toContain('a.b');
  });

  test('surfaces Gemini error envelopes', async () => {
    nextResponse = () =>
      new Response(
        JSON.stringify({
          error: { message: 'Request blocked due to safety violations', code: 'safety' },
        }),
        { status: 400 }
      );
    const run = await executeSystemOneRequest(
      profile('gemini-decisions-api', { apiKey: 'k' }),
      payload
    );
    expect(run.status).toBe(400);
    expect(run.error).toBe('[safety] Request blocked due to safety violations');
  });

  test('surfaces Google RPC error envelopes', async () => {
    nextResponse = () =>
      new Response(
        JSON.stringify({
          error: { code: 400, message: 'API key not valid.', status: 'INVALID_ARGUMENT' },
        }),
        { status: 400 }
      );
    const run = await executeSystemOneRequest(
      profile('gemini-decisions-api', { apiKey: 'bad' }),
      payload
    );
    expect(run.error).toBe('[INVALID_ARGUMENT] API key not valid.');
  });
});

describe('regression: existing providers are unchanged', () => {
  const s1Payload: S1RequestPayload = { ...payload, model: 'clef:27b' };

  test('Ollama Cloud still posts S1 body with Bearer via proxy', async () => {
    await executeSystemOneRequest(profile('ollama-cloud-clef', { apiKey: 'sk' }), s1Payload);
    expect(calls[0].url).toBe('/api/proxy');
    expect(headersOf(calls[0])['x-s1-target-url']).toBe('https://ollama.com/v1/systemone');
    expect(headersOf(calls[0]).Authorization).toBe('Bearer sk');
    expect(headersOf(calls[0])['x-goog-api-key']).toBeUndefined();
    expect(bodyOf(calls[0])).toEqual({
      model: 'clef:27b',
      state: 'hello',
      questions: s1Payload.questions,
    });
  });

  test('Cloudflare Workers AI still composes /ai/run URL and data-URI images', async () => {
    await executeSystemOneRequest(
      profile('cloudflare-workers-ai-clef', { apiKey: 'cf', cloudflareAccountId: 'acct' }),
      { ...s1Payload, model: '@cf/cloudflare/clef', images: ['iVBORw0KGgo'] }
    );
    expect(headersOf(calls[0])['x-s1-target-url']).toBe(
      'https://api.cloudflare.com/client/v4/accounts/acct/ai/run/@cf/cloudflare/clef'
    );
    const body = bodyOf(calls[0]);
    expect(body.model).toBe('clef');
    expect(body.state).toBe('hello');
    expect(body.images).toEqual(['data:image/png;base64,iVBORw0KGgo']);
  });

  test('Built-in simulator still calls the local mock route directly', async () => {
    await executeSystemOneRequest(profile('s1-builtin-simulator'), {
      ...s1Payload,
      model: 'clef-simulator-1.0',
    });
    expect(calls[0].url).toBe('/api/mock-systemone/v1/systemone');
    expect(bodyOf(calls[0]).state).toBe('hello');
  });

  test('legacy score rendering semantics: no scoreScale for non-Gemini', async () => {
    nextResponse = () =>
      new Response(
        JSON.stringify({ answers: { s: { type: 'score', score: 0.4, confidence: 0.5 } } }),
        { status: 200 }
      );
    const run = await executeSystemOneRequest(profile('typesafe-ai-jev', { apiKey: 'k' }), {
      ...s1Payload,
      questions: { s: { type: 'score', instructions: 'x', criteria: ['a', 'b'] } },
    });
    expect(run.response?.scores?.s.score).toBe(0.4);
    expect(run.response?.scores?.s.scoreScale).toBeUndefined();
  });
});

describe('code exporter', () => {
  const gem = profile('gemini-decisions-api', { apiKey: 'AIzaSECRET' });
  const opts = { includeRawApiKey: false };

  test('Gemini env var and cURL use x-goog-api-key + decisions body', () => {
    expect(getProfileApiKeyEnvVar(gem)).toBe('GEMINI_API_KEY');
    const curl = generateCurlSnippet(gem, payload, opts);
    expect(curl).toContain('https://generativelanguage.googleapis.com/v1beta/decisions');
    expect(curl).toContain('-H "x-goog-api-key: $GEMINI_API_KEY"');
    expect(curl).toContain('"input": "hello"');
    expect(curl).not.toContain('Authorization');
    expect(curl).not.toContain('"state"');
    expect(curl).not.toContain('AIzaSECRET');
    expect(generateCurlSnippet(gem, payload, { includeRawApiKey: true })).toContain(
      'x-goog-api-key: AIzaSECRET'
    );
  });

  test('Gemini Python / TS snippets use the official SDKs', () => {
    const py = generatePythonSnippet(gem, payload, opts);
    expect(py).toContain('from google import genai');
    expect(py).toContain('client.decisions.create(');
    expect(py).toContain('"api_version": "v1beta"');
    expect(py).not.toContain('typesafe');
    const ts = generateTypeScriptSnippet(gem, payload, opts, 'sdk');
    expect(ts).toContain('@google/genai');
    expect(ts).toContain('ai.decisions.create(');
    const tsFetch = generateTypeScriptSnippet(gem, payload, opts, 'fetch');
    expect(tsFetch).toContain('"x-goog-api-key": API_KEY');
    expect(tsFetch).toContain('process.env.GEMINI_API_KEY');
  });

  test('non-Gemini cURL is unchanged', () => {
    const curl = generateCurlSnippet(profile('ollama-cloud-clef'), { ...payload, model: 'clef:27b' }, opts);
    expect(curl).toBe(`curl -s -X POST "https://ollama.com/v1/systemone" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $OLLAMA_API_KEY" \\
  -d '{
  "model": "clef:27b",
  "state": "hello",
  "questions": {
    "ok": {
      "type": "noul",
      "instructions": "ok?"
    }
  }
}' | jq`);
  });
});

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

  const scoreAnswer = () =>
    new Response(
      JSON.stringify({ answers: { s: { type: 'score', score: 0.4, confidence: 0.5 } } }),
      { status: 200 }
    );
  const scorePayload: S1RequestPayload = {
    ...s1Payload,
    questions: { s: { type: 'score', instructions: 'x', criteria: ['a', 'b', 'c'] } },
  };

  // Ollama, Cloudflare and TypeSafe document score as a probability-weighted
  // level index (0 .. levels-1), so even a value <= 1 is an index.
  for (const [id, patch] of [
    ['typesafe-ai-jev', { apiKey: 'k' }],
    ['ollama-cloud-clef', { apiKey: 'k' }],
    ['local-ollama-clef', {}],
    ['cloudflare-workers-ai-clef', { apiKey: 'k', cloudflareAccountId: 'acct' }],
  ] as const) {
    test(`${id}: score is marked as level index (scoreScale=index)`, async () => {
      nextResponse = scoreAnswer;
      const run = await executeSystemOneRequest(profile(id, patch), scorePayload);
      expect(run.response?.scores?.s.score).toBe(0.4);
      expect(run.response?.scores?.s.scoreScale).toBe('index');
    });
  }

  test('custom profile pointing at the simulator by absolute URL is unit scale', async () => {
    nextResponse = scoreAnswer;
    const run = await executeSystemOneRequest(
      { ...profile('s1-builtin-simulator'), id: 'custom-sim', baseUrl: 'http://localhost:3000/api/mock-systemone' },
      scorePayload
    );
    expect(run.response?.scores?.s.scoreScale).toBe('unit');
  });

  test('built-in simulator keeps its 0-1 score (scoreScale=unit)', async () => {
    nextResponse = scoreAnswer;
    const run = await executeSystemOneRequest(profile('s1-builtin-simulator'), scorePayload);
    expect(run.response?.scores?.s.scoreScale).toBe('unit');
  });

  test('TypeSafe without images: body and headers unchanged', async () => {
    await executeSystemOneRequest(profile('typesafe-ai-jev', { apiKey: 'k' }), {
      ...s1Payload,
      model: 'jev-latest',
    });
    expect(headersOf(calls[0])['x-s1-target-url']).toBe('https://api.typesafe.ai/v1/systemone');
    expect(headersOf(calls[0])['TypeSafe-Danger-Zone-Images']).toBeUndefined();
    expect(bodyOf(calls[0])).toEqual({
      model: 'jev-latest',
      state: 'hello',
      questions: s1Payload.questions,
    });
  });

  test('TypeSafe with images: sends assets + references + opt-in header', async () => {
    await executeSystemOneRequest(profile('typesafe-ai-jev', { apiKey: 'k' }), {
      ...s1Payload,
      model: 'jev-latest',
      images: ['iVBORw0KGgoAAA', 'data:image/jpeg;base64,/9j/4AAQ'],
    });
    expect(headersOf(calls[0])['TypeSafe-Danger-Zone-Images']).toBe('true');
    const body = bodyOf(calls[0]);
    expect(body.images).toBeUndefined();
    const refs = Object.keys(body.assets);
    expect(refs).toHaveLength(2);
    expect(new Set(refs).size).toBe(2);
    expect(body.assets[refs[0]]).toEqual({ type: 'image', format: 'png', data_base64: 'iVBORw0KGgoAAA' });
    expect(body.assets[refs[1]]).toEqual({ type: 'image', format: 'jpeg', data_base64: '/9j/4AAQ' });
    for (const ref of refs) expect(body.state).toContain(ref);
    expect(body.state.startsWith('hello\n\n')).toBe(true);
  });

  test('TypeSafe rejects WebP before sending', async () => {
    const run = await executeSystemOneRequest(profile('typesafe-ai-jev', { apiKey: 'k' }), {
      ...s1Payload,
      images: ['iVBORw0KGgoAAA', 'UklGRiQAAABXRUJQ'],
    });
    expect(calls).toHaveLength(0);
    expect(run.status).toBe(400);
    expect(run.error).toContain('第 2 張');
  });

  test('Ollama images are still sent as a plain images array', async () => {
    await executeSystemOneRequest(profile('ollama-cloud-clef', { apiKey: 'sk' }), {
      ...s1Payload,
      images: ['UklGRiQAAABXRUJQ'],
    });
    expect(bodyOf(calls[0]).images).toEqual(['UklGRiQAAABXRUJQ']);
    expect(bodyOf(calls[0]).assets).toBeUndefined();
    expect(headersOf(calls[0])['TypeSafe-Danger-Zone-Images']).toBeUndefined();
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

describe('code exporter: TypeSafe AI official SDKs', () => {
  const ts = profile('typesafe-ai-jev', { apiKey: 'tsk-SECRET' });
  const opts = { includeRawApiKey: false };
  const tsPayload: S1RequestPayload = {
    model: 'jev-latest',
    state: 'The parcel is true to size.',
    questions: {
      ok: { type: 'noul', instructions: 'ok?', criteria: { true: 'yes', false: 'no' } },
      team: { type: 'choice', instructions: 'team?', criteria: { billing: null, tech: null } },
      s: { type: 'score', instructions: 'urgent?', criteria: ['low', 'mid', 'high'] },
    },
  };

  test('Python uses typesafe_sdk TypeSafeClient.system_one', () => {
    const py = generatePythonSnippet(ts, tsPayload, opts);
    expect(py).toContain('# pip install typesafe-sdk');
    expect(py).toContain('from typesafe_sdk import TypeSafeClient');
    expect(py).toContain('client.system_one(');
    expect(py).toContain('api_key=os.environ["TYPESAFE_API_KEY"]');
    expect(py).toContain('base_url="https://api.typesafe.ai"');
    expect(py).toContain('model="jev-latest"');
    expect(py).toContain("result.nouls['ok'].noul");
    expect(py).toContain("result.choices['team'].choice");
    expect(py).toContain("result.scores['s'].score");
    expect(py).not.toContain('from typesafe import');
    expect(py).not.toContain('systemone.evaluate');
    expect(py).not.toContain('images=');
    expect(py).not.toContain('tsk-SECRET');
    // Python literal must not rewrite true/false inside strings or keys
    expect(py).toContain('"The parcel is true to size."');
    expect(py).toContain('"true": "yes"');
    expect(py).toContain('"billing": None');
  });

  test('TypeScript uses @typesafe-ai/sdk systemOne with baseURL', () => {
    const code = generateTypeScriptSnippet(ts, tsPayload, opts, 'sdk');
    expect(code).toContain('import { TypeSafeClient } from "@typesafe-ai/sdk"');
    expect(code).toContain('baseURL: "https://api.typesafe.ai"');
    expect(code).toContain('apiKey: process.env.TYPESAFE_API_KEY');
    expect(code).toContain('client.systemOne(');
    expect(code).toContain('result.answers');
    expect(code).not.toContain('@typesafe/sdk');
    expect(code).not.toContain('systemone.evaluate');
  });

  test('snippets with images use assets + Image.from_base64 / Image.fromBase64 + header', () => {
    const withImg = { ...tsPayload, images: ['iVBORw0KGgoAAA'] };
    const py = generatePythonSnippet(ts, withImg, opts);
    expect(py).toContain('from typesafe_sdk import Image, TypeSafeClient');
    expect(py).toContain('"<s1-image-1>": Image.from_base64("iVBORw0KGgoAAA")');
    expect(py).toContain('assets=assets,');
    expect(py).toContain('extra_headers={"TypeSafe-Danger-Zone-Images": "true"}');
    expect(py).toContain('Image 1: <s1-image-1>');
    const code = generateTypeScriptSnippet(ts, withImg, opts, 'sdk');
    expect(code).toContain('import { Image, TypeSafeClient } from "@typesafe-ai/sdk"');
    expect(code).toContain('"<s1-image-1>": Image.fromBase64("iVBORw0KGgoAAA")');
    expect(code).toContain('{ headers: { "TypeSafe-Danger-Zone-Images": "true" } }');
    const curl = generateCurlSnippet(ts, withImg, opts);
    expect(curl).toContain('-H "TypeSafe-Danger-Zone-Images: true"');
    expect(curl).toContain('"assets"');
    expect(curl).not.toContain('"images"');
    const fetchCode = generateTypeScriptSnippet(ts, withImg, opts, 'fetch');
    expect(fetchCode).toContain('"TypeSafe-Danger-Zone-Images": "true",');
  });

  test('WebP images: snippets carry a warning; empty images never leak into the SDK call', () => {
    const webp = { ...tsPayload, images: ['UklGRiQAAABXRUJQ'] };
    expect(generateCurlSnippet(ts, webp, opts)).toStartWith('# 注意：TypeSafe AI 只接受 PNG 或 JPEG');
    expect(generatePythonSnippet(ts, webp, opts)).toStartWith('# 注意：');
    expect(generateTypeScriptSnippet(ts, webp, opts, 'sdk')).toStartWith('// 注意：');
    expect(generateTypeScriptSnippet(ts, webp, opts, 'fetch')).toStartWith('// 注意：');
    expect(generateCurlSnippet(ts, tsPayload, opts)).toStartWith('curl ');
    const emptyImages = generateTypeScriptSnippet(ts, { ...tsPayload, images: [] }, opts, 'sdk');
    expect(emptyImages).not.toContain('"images"');
  });

  test('raw key is embedded only when requested', () => {
    expect(generatePythonSnippet(ts, tsPayload, { includeRawApiKey: true })).toContain(
      'api_key="tsk-SECRET"'
    );
    expect(
      generateTypeScriptSnippet(ts, tsPayload, { includeRawApiKey: true }, 'sdk')
    ).toContain('apiKey: "tsk-SECRET"');
  });

  test('non-TypeSafe providers do not use the TypeSafe SDK', () => {
    const ollama = profile('ollama-cloud-clef');
    const py = generatePythonSnippet(ollama, { ...tsPayload, model: 'clef:27b' }, opts);
    expect(py).toContain('import requests');
    expect(py).toContain('ENDPOINT = "https://ollama.com/v1/systemone"');
    expect(py).toContain('os.environ.get("OLLAMA_API_KEY", "")');
    expect(py).not.toContain('typesafe');
    const tsSdk = generateTypeScriptSnippet(ollama, tsPayload, opts, 'sdk');
    expect(tsSdk).toContain('fetch(ENDPOINT');
    expect(tsSdk).not.toContain('@typesafe');

    const cf = profile('cloudflare-workers-ai-clef', { cloudflareAccountId: 'acct' });
    const cfPy = generatePythonSnippet(cf, { ...tsPayload, model: '@cf/cloudflare/clef' }, opts);
    expect(cfPy).toContain('/accounts/acct/ai/run/@cf/cloudflare/clef');
    expect(cfPy).toContain('(data.get("result") or {}).get("answers", {})');

    const sim = profile('s1-builtin-simulator');
    const simPy = generatePythonSnippet(sim, tsPayload, opts);
    expect(simPy).toContain('ENDPOINT = "http://localhost:3000/api/mock-systemone/v1/systemone"');
    expect(simPy).not.toContain('API_KEY');
  });
});

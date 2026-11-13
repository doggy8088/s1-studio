import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { NextRequest } from 'next/server';
import { POST as nextProxyPost } from '@/app/api/proxy/route';
import {
  onRequestOptions as cfProxyOptions,
  onRequestPost as cfProxyPost,
} from '../functions/api/proxy';

type Captured = { url: string; init: RequestInit };
let calls: Captured[] = [];
const realFetch = globalThis.fetch;

beforeEach(() => {
  calls = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return new Response('{"answers":{}}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

function proxyRequest(target: string, auth = 'Bearer KEY123'): Request {
  return new Request('http://localhost:3000/api/proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: auth,
      'x-s1-target-url': target,
    },
    body: '{"x":1}',
  });
}

const runtimes = [
  {
    name: 'Next.js /api/proxy',
    call: (req: Request) => nextProxyPost(new NextRequest(req)),
  },
  {
    name: 'Cloudflare Pages /api/proxy',
    call: (req: Request) => cfProxyPost({ request: req }),
  },
];

for (const rt of runtimes) {
  describe(rt.name, () => {
    test('Gemini target: forwards to /v1beta/decisions with x-goog-api-key only', async () => {
      const res = await rt.call(
        proxyRequest('https://generativelanguage.googleapis.com/v1beta/decisions')
      );
      expect(res.status).toBe(200);
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe(
        'https://generativelanguage.googleapis.com/v1beta/decisions'
      );
      const h = calls[0].init.headers as Record<string, string>;
      expect(h['x-goog-api-key']).toBe('KEY123');
      expect(h.Authorization).toBeUndefined();
      expect(calls[0].init.body).toBe('{"x":1}');
    });

    test('Gemini base URL without path resolves to /v1beta/decisions', async () => {
      await rt.call(proxyRequest('https://generativelanguage.googleapis.com'));
      expect(calls[0].url).toBe(
        'https://generativelanguage.googleapis.com/v1beta/decisions'
      );
    });

    test('SystemOne base URL ending in /v1 does not double the /v1 segment', async () => {
      await rt.call(proxyRequest('https://api.typesafe.ai/v1'));
      expect(calls[0].url).toBe('https://api.typesafe.ai/v1/systemone');
    });

    test('SystemOne target: unchanged /v1/systemone + Authorization', async () => {
      await rt.call(proxyRequest('https://ollama.com'));
      expect(calls[0].url).toBe('https://ollama.com/v1/systemone');
      const h = calls[0].init.headers as Record<string, string>;
      expect(h.Authorization).toBe('Bearer KEY123');
      expect(h['x-goog-api-key']).toBeUndefined();
    });

    test('Cloudflare /ai/run target: unchanged', async () => {
      const cf =
        'https://api.cloudflare.com/client/v4/accounts/acct/ai/run/@cf/cloudflare/clef';
      await rt.call(proxyRequest(cf));
      expect(calls[0].url).toBe(cf);
    });

    test('TypeSafe image opt-in header is forwarded when present', async () => {
      const req = proxyRequest('https://api.typesafe.ai');
      req.headers.set('TypeSafe-Danger-Zone-Images', 'true');
      await rt.call(req);
      expect(calls[0].url).toBe('https://api.typesafe.ai/v1/systemone');
      const h = calls[0].init.headers as Record<string, string>;
      expect(h['TypeSafe-Danger-Zone-Images']).toBe('true');
      expect(h.Authorization).toBe('Bearer KEY123');
    });

    test('TypeSafe image header is not added when absent', async () => {
      await rt.call(proxyRequest('https://api.typesafe.ai'));
      const h = calls[0].init.headers as Record<string, string>;
      expect(h['TypeSafe-Danger-Zone-Images']).toBeUndefined();
    });
  });
}

test('Cloudflare proxy CORS preflight allows x-goog-api-key and TypeSafe image header', async () => {
  const res = await cfProxyOptions();
  const allowed = res.headers.get('Access-Control-Allow-Headers');
  expect(allowed).toContain('x-goog-api-key');
  expect(allowed).toContain('TypeSafe-Danger-Zone-Images');
});

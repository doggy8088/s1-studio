import { NextRequest, NextResponse } from 'next/server';

const TYPESAFE_IMAGES_HEADER = 'TypeSafe-Danger-Zone-Images';

function extractClefAndJevModels(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const obj = payload as Record<string, unknown>;
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(obj.data)
      ? obj.data
      : Array.isArray(obj.models)
        ? obj.models
        : Array.isArray(obj.result)
          ? obj.result
          : [];

  const matched: string[] = [];
  for (const item of list) {
    if (typeof item === 'string') {
      if (/(clef|jev)/i.test(item)) matched.push(item.trim());
    } else if (item && typeof item === 'object') {
      const rec = item as Record<string, unknown>;
      const rawId = String(rec.id ?? rec.name ?? rec.model ?? '').trim();
      if (rawId && /(clef|jev)/i.test(rawId)) {
        matched.push(rawId);
      }
    }
  }
  return Array.from(new Set(matched));
}

// Keep these Gemini helpers identical to functions/api/proxy.ts
const GEMINI_API_HOST = 'generativelanguage.googleapis.com';
const GEMINI_DECISIONS_ENDPOINT = `https://${GEMINI_API_HOST}/v1beta/decisions`;

function isGeminiApiHost(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase() === GEMINI_API_HOST;
  } catch {
    return false;
  }
}

function resolveGeminiDecisionsEndpoint(cleanedBase: string): string {
  if (/\/v1beta\/decisions$/i.test(cleanedBase)) return cleanedBase;
  if (/\/v1beta$/i.test(cleanedBase)) return `${cleanedBase}/decisions`;
  return GEMINI_DECISIONS_ENDPOINT;
}

function extractGeminiApiKey(
  authHeader: string | null,
  googApiKeyHeader: string | null
): string {
  const direct = (googApiKeyHeader || '').trim();
  if (direct) return direct;
  return (authHeader || '').replace(/^Bearer\s+/i, '').trim();
}

export async function POST(req: NextRequest) {
  try {
    const targetBaseUrl = req.headers.get('x-s1-target-url');
    const proxyAction = req.headers.get('x-s1-proxy-action');
    const authHeader = req.headers.get('authorization');

    if (!targetBaseUrl) {
      return NextResponse.json(
        { error: 'Missing x-s1-target-url header in proxy request.' },
        { status: 400 }
      );
    }

    const cleanedBase = targetBaseUrl.trim().replace(/\/+$/, '');

    // Action: Discover /models (and filter clef / jev models)
    if (proxyAction === 'models') {
      const rootBase = cleanedBase
        .replace(/\/v1\/systemone$/i, '')
        .replace(/\/v1$/i, '')
        .replace(/\/+$/, '');

      const forwardHeaders: Record<string, string> = {
        Accept: 'application/json',
      };
      if (authHeader && authHeader.trim().length > 0) {
        forwardHeaders['Authorization'] = authHeader;
      }

      const candidateUrls = [
        `${rootBase}/v1/models`,
        `${rootBase}/models`,
        `${rootBase}/api/tags`,
      ];

      const discovered = new Set<string>();
      for (const urlStr of candidateUrls) {
        try {
          const parsed = new URL(urlStr);
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            continue;
          }
          const res = await fetch(parsed.toString(), {
            method: 'GET',
            headers: forwardHeaders,
          });
          if (!res.ok) continue;
          const json = await res.json();
          for (const m of extractClefAndJevModels(json)) {
            discovered.add(m);
          }
          if (discovered.size > 0) break;
        } catch {
          // Try next candidate
        }
      }

      return NextResponse.json({
        models: Array.from(discovered),
      });
    }

    // Action: Pull model via Ollama HTTP REST API (POST /api/pull)
    if (proxyAction === 'ollama-pull') {
      const rootBase = cleanedBase
        .replace(/\/v1\/systemone$/i, '')
        .replace(/\/v1$/i, '')
        .replace(/\/+$/, '');
      const pullUrl = `${rootBase}/api/pull`;
      const bodyText = await req.text();

      const forwardHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };
      if (authHeader && authHeader.trim().length > 0) {
        forwardHeaders['Authorization'] = authHeader;
      }

      const upstreamRes = await fetch(pullUrl, {
        method: 'POST',
        headers: forwardHeaders,
        body: bodyText || JSON.stringify({ model: 'clef', stream: true }),
      });

      return new NextResponse(upstreamRes.body, {
        status: upstreamRes.status,
        statusText: upstreamRes.statusText,
        headers: {
          'Content-Type':
            upstreamRes.headers.get('Content-Type') || 'application/x-ndjson',
        },
      });
    }

    // Gemini Decisions API: POST /v1beta/decisions with x-goog-api-key auth
    const isGeminiTarget = isGeminiApiHost(cleanedBase);

    // Normalize URL and ensure /v1/systemone path (unless Cloudflare Workers AI /ai/run/ or Gemini endpoint)
    const targetEndpoint = isGeminiTarget
      ? resolveGeminiDecisionsEndpoint(cleanedBase)
      : cleanedBase.endsWith('/v1/systemone') || cleanedBase.includes('/ai/run/')
        ? cleanedBase
        : `${cleanedBase}/v1/systemone`;

    // Validate URL protocol
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(targetEndpoint);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return NextResponse.json(
          { error: 'Invalid protocol. Only http and https are supported.' },
          { status: 400 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: `Invalid target URL: ${targetEndpoint}` },
        { status: 400 }
      );
    }

    const bodyText = await req.text();

    const forwardHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (isGeminiTarget) {
      const geminiKey = extractGeminiApiKey(
        authHeader,
        req.headers.get('x-goog-api-key')
      );
      if (geminiKey) {
        forwardHeaders['x-goog-api-key'] = geminiKey;
      }
    } else if (authHeader && authHeader.trim().length > 0) {
      forwardHeaders['Authorization'] = authHeader;
    }

    // TypeSafe AI image opt-in header (https://docs.typesafe.ai/images)
    const typeSafeImages = req.headers.get(TYPESAFE_IMAGES_HEADER);
    if (typeSafeImages && typeSafeImages.trim().length > 0) {
      forwardHeaders[TYPESAFE_IMAGES_HEADER] = typeSafeImages.trim();
    }

    const startTime = performance.now();
    const upstreamResponse = await fetch(parsedUrl.toString(), {
      method: 'POST',
      headers: forwardHeaders,
      body: bodyText,
    });
    const latencyMs = Math.round(performance.now() - startTime);

    const responseText = await upstreamResponse.text();

    return new NextResponse(responseText, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: {
        'Content-Type':
          upstreamResponse.headers.get('Content-Type') || 'application/json',
        'X-S1-Upstream-Latency': String(latencyMs),
      },
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Unknown upstream proxy error';
    return NextResponse.json(
      {
        error: `Proxy connection failed: ${message}`,
        hint: 'Ensure the target endpoint is reachable and running (e.g., Ollama at http://localhost:11434 or valid cloud endpoint).',
      },
      { status: 502 }
    );
  }
}

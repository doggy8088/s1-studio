/**
 * Cloudflare Pages Function: Stateless CORS Proxy for /v1/systemone and /models discovery
 * Automatically mounted at POST /api/proxy on Cloudflare Pages.
 */

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

export const onRequestOptions = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers':
        'Content-Type, Authorization, x-s1-target-url, x-s1-proxy-action',
    },
  });
};

export const onRequestPost = async (context: { request: Request }) => {
  const { request } = context;

  try {
    const targetBaseUrl = request.headers.get('x-s1-target-url');
    const proxyAction = request.headers.get('x-s1-proxy-action');
    const authHeader = request.headers.get('authorization');

    if (!targetBaseUrl) {
      return Response.json(
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
          if (
            (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
            parsed.hostname === 'localhost' ||
            parsed.hostname === '127.0.0.1'
          ) {
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

      return Response.json(
        { models: Array.from(discovered) },
        {
          headers: {
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    const targetEndpoint =
      cleanedBase.endsWith('/v1/systemone') || cleanedBase.includes('/ai/run/')
        ? cleanedBase
        : `${cleanedBase}/v1/systemone`;

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(targetEndpoint);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return Response.json(
          { error: 'Invalid protocol. Only http and https are supported.' },
          { status: 400 }
        );
      }
    } catch {
      return Response.json(
        { error: `Invalid target URL: ${targetEndpoint}` },
        { status: 400 }
      );
    }

    // Warn nicely if user tries to proxy to localhost from Cloudflare's edge network
    if (
      parsedUrl.hostname === 'localhost' ||
      parsedUrl.hostname === '127.0.0.1'
    ) {
      return Response.json(
        {
          error:
            'Cloudflare Edge Proxy cannot reach your local machine (localhost / 127.0.0.1).',
          hint: '測試本機 Ollama 時，請將右上角切換為「Proxy: OFF」(Direct Mode)，並以 OLLAMA_ORIGINS="*" ollama serve 啟動本機服務。',
        },
        { status: 400 }
      );
    }

    const bodyText = await request.text();

    const forwardHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (authHeader && authHeader.trim().length > 0) {
      forwardHeaders['Authorization'] = authHeader;
    }

    const startTime = Date.now();
    const upstreamResponse = await fetch(parsedUrl.toString(), {
      method: 'POST',
      headers: forwardHeaders,
      body: bodyText,
    });
    const latencyMs = Math.max(1, Date.now() - startTime);

    const responseText = await upstreamResponse.text();

    return new Response(responseText, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: {
        'Content-Type':
          upstreamResponse.headers.get('Content-Type') || 'application/json',
        'X-S1-Upstream-Latency': String(latencyMs),
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Unknown upstream proxy error';
    return Response.json(
      {
        error: `Cloudflare Edge Proxy connection failed: ${message}`,
        hint: 'Ensure the target cloud endpoint URL is publicly reachable.',
      },
      { status: 502 }
    );
  }
};

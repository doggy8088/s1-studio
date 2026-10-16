/**
 * Cloudflare Pages Function: Stateless CORS Proxy for /v1/systemone
 * Automatically mounted at POST /api/proxy on Cloudflare Pages.
 */

export const onRequestOptions = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers':
        'Content-Type, Authorization, x-s1-target-url',
    },
  });
};

export const onRequestPost = async (context: { request: Request }) => {
  const { request } = context;

  try {
    const targetBaseUrl = request.headers.get('x-s1-target-url');
    const authHeader = request.headers.get('authorization');

    if (!targetBaseUrl) {
      return Response.json(
        { error: 'Missing x-s1-target-url header in proxy request.' },
        { status: 400 }
      );
    }

    const cleanedBase = targetBaseUrl.trim().replace(/\/+$/, '');
    const targetEndpoint = cleanedBase.endsWith('/v1/systemone')
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

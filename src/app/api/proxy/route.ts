import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const targetBaseUrl = req.headers.get('x-s1-target-url');
    const authHeader = req.headers.get('authorization');

    if (!targetBaseUrl) {
      return NextResponse.json(
        { error: 'Missing x-s1-target-url header in proxy request.' },
        { status: 400 }
      );
    }

    // Normalize URL and ensure /v1/systemone path (unless Cloudflare Workers AI /ai/run/ endpoint)
    const cleanedBase = targetBaseUrl.trim().replace(/\/+$/, '');
    const targetEndpoint =
      cleanedBase.endsWith('/v1/systemone') || cleanedBase.includes('/ai/run/')
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

    if (authHeader && authHeader.trim().length > 0) {
      forwardHeaders['Authorization'] = authHeader;
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

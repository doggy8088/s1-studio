import { EndpointProfile, S1RequestPayload } from '@/types/systemone';

export interface CodeGenOptions {
  includeRawApiKey: boolean;
  noulThresholds?: Record<string, number>;
}

function getEndpointUrl(baseUrl: string): string {
  const clean = baseUrl.trim().replace(/\/+$/, '');
  if (clean.startsWith('/')) {
    return `http://localhost:3000${clean}/v1/systemone`;
  }
  return clean.endsWith('/v1/systemone') ? clean : `${clean}/v1/systemone`;
}

/**
 * 1. cURL Exporter (with -s and | jq pipeline)
 */
export function generateCurlSnippet(
  profile: EndpointProfile,
  payload: S1RequestPayload,
  options: CodeGenOptions
): string {
  const endpoint = getEndpointUrl(profile.baseUrl);
  const jsonPayload = JSON.stringify(payload, null, 2);
  const escapedBody = jsonPayload.replace(/'/g, `'\\''`);

  const hasAuth = Boolean(profile.apiKey && profile.apiKey.trim());
  const authHeaderLine = hasAuth
    ? options.includeRawApiKey
      ? `  -H "Authorization: Bearer ${profile.apiKey.trim()}" \\\n`
      : `  -H "Authorization: Bearer $API_KEY" \\\n`
    : '';

  return `curl -s -X POST "${endpoint}" \\
  -H "Content-Type: application/json" \\
${authHeaderLine}  -d '${escapedBody}' | jq`;
}

/**
 * 2. Python Exporter (using typesafe-sdk TypeSafeClient)
 */
export function generatePythonSnippet(
  profile: EndpointProfile,
  payload: S1RequestPayload,
  options: CodeGenOptions
): string {
  const baseUrlClean = profile.baseUrl.trim().replace(/\/+$/, '');
  const resolvedBaseUrl = baseUrlClean.startsWith('/')
    ? `http://localhost:3000${baseUrlClean}`
    : baseUrlClean;

  const apiKeyExpr =
    profile.apiKey && profile.apiKey.trim()
      ? options.includeRawApiKey
        ? `"${profile.apiKey.trim()}"`
        : `os.environ.get("TYPESAFE_API_KEY", "")`
      : `os.environ.get("TYPESAFE_API_KEY", "")`;

  const payloadJson = JSON.stringify(payload, null, 4)
    .replace(/\btrue\b/g, 'True')
    .replace(/\bfalse\b/g, 'False')
    .replace(/\bnull\b/g, 'None');

  const noulChecks: string[] = [];
  for (const [key, q] of Object.entries(payload.questions)) {
    if (q.type === 'noul') {
      const th = (options.noulThresholds?.[key] ?? 0.5).toFixed(2);
      noulChecks.push(
        `print(f"[NOUL] ${key}: {result.nouls['${key}'].noul:.3f} -> {'PASS' if result.nouls['${key}'].noul >= ${th} else 'REJECT'} (threshold=${th})")`
      );
    } else if (q.type === 'choice') {
      noulChecks.push(
        `print(f"[CHOICE] ${key}: winner={result.choices['${key}'].choice} (confidence={result.choices['${key}'].confidence:.3f})")`
      );
    } else if (q.type === 'score') {
      noulChecks.push(
        `print(f"[SCORE] ${key}: score={result.scores['${key}'].score:.3f} (confidence={result.scores['${key}'].confidence:.3f})")`
      );
    }
  }

  return `import os
from typesafe import TypeSafeClient

client = TypeSafeClient(
    base_url="${resolvedBaseUrl}",
    api_key=${apiKeyExpr},
)

request_payload = ${payloadJson}

result = client.systemone.evaluate(
    model=request_payload.get("model"),
    state=request_payload["state"],
    images=request_payload.get("images"),
    questions=request_payload["questions"],
)

${noulChecks.length > 0 ? noulChecks.join('\n') : 'print(result)'}
`;
}

/**
 * 3. TypeScript Exporter (@typesafe/sdk & Native fetch)
 */
export function generateTypeScriptSnippet(
  profile: EndpointProfile,
  payload: S1RequestPayload,
  options: CodeGenOptions,
  variant: 'sdk' | 'fetch' = 'sdk'
): string {
  const baseUrlClean = profile.baseUrl.trim().replace(/\/+$/, '');
  const resolvedBaseUrl = baseUrlClean.startsWith('/')
    ? `http://localhost:3000${baseUrlClean}`
    : baseUrlClean;

  const apiKeyExpr =
    profile.apiKey && profile.apiKey.trim()
      ? options.includeRawApiKey
        ? `"${profile.apiKey.trim()}"`
        : `process.env.TYPESAFE_API_KEY ?? ""`
      : `process.env.TYPESAFE_API_KEY ?? ""`;

  const payloadStr = JSON.stringify(payload, null, 2);

  if (variant === 'sdk') {
    return `import { TypeSafeClient } from "@typesafe/sdk";

const client = new TypeSafeClient({
  baseUrl: "${resolvedBaseUrl}",
  apiKey: ${apiKeyExpr},
});

async function runDecision() {
  const response = await client.systemone.evaluate(${payloadStr});

  console.log("SystemOne Decision Response:", JSON.stringify(response, null, 2));
  return response;
}

runDecision().catch(console.error);
`;
  }

  const endpoint = getEndpointUrl(profile.baseUrl);
  return `const ENDPOINT = "${endpoint}";
const API_KEY = ${apiKeyExpr};

async function evaluateSystemOne() {
  const payload = ${payloadStr};

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(API_KEY ? { Authorization: \`Bearer \${API_KEY}\` } : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(\`HTTP \${response.status}: \${await response.text()}\`);
  }

  const data = await response.json();
  console.log("SystemOne Result:", data);
  return data;
}

evaluateSystemOne().catch(console.error);
`;
}

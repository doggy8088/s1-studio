import { EndpointProfile, S1RequestPayload } from '@/types/systemone';
import {
  buildCloudflareEndpointUrl,
  extractCloudflareAccountId,
  formatEndpointPreviewUrl,
  getCloudflarePayloadModelSelector,
  isCloudflareProfile,
} from './s1-utils';

export interface CodeGenOptions {
  includeRawApiKey: boolean;
  noulThresholds?: Record<string, number>;
}

/**
 * Resolve the shell / environment variable name for a given EndpointProfile:
 * - Custom Profile named `LLMShare` -> `LLMSHARE_API_KEY`
 * - Cloudflare Workers AI -> `CLOUDFLARE_API_KEY`
 * - Ollama Cloud -> `OLLAMA_API_KEY`
 * - TypeSafe AI -> `TYPESAFE_API_KEY`
 * - Fallback -> `API_KEY`
 */
export function getProfileApiKeyEnvVar(profile: EndpointProfile): string {
  const id = (profile.id || '').toLowerCase();
  const name = (profile.name || '').toLowerCase();
  const url = (profile.baseUrl || '').toLowerCase();

  if (name.includes('llmshare') || url.includes('llmshare')) {
    return 'LLMSHARE_API_KEY';
  }
  if (
    id.includes('cloudflare') ||
    name.includes('cloudflare') ||
    url.includes('cloudflare.com')
  ) {
    return 'CLOUDFLARE_API_KEY';
  }
  if (
    id === 'ollama-cloud-clef' ||
    name.includes('ollama cloud') ||
    url.includes('ollama.com')
  ) {
    return 'OLLAMA_API_KEY';
  }
  if (
    id === 'typesafe-ai-jev' ||
    name.includes('typesafe') ||
    url.includes('typesafe.ai')
  ) {
    return 'TYPESAFE_API_KEY';
  }
  return 'API_KEY';
}

export function shouldIncludeAuthInSnippet(profile: EndpointProfile): boolean {
  if (profile.apiKey && profile.apiKey.trim().length > 0) return true;
  if (getProfileApiKeyEnvVar(profile) !== 'API_KEY') return true;
  const url = (profile.baseUrl || '').trim().toLowerCase();
  if (
    url.startsWith('/') ||
    url.includes('localhost') ||
    url.includes('127.0.0.1')
  ) {
    return false;
  }
  return true;
}

export function getEndpointUrl(
  baseUrl: string,
  model?: string,
  cloudflareAccountId?: string
): string {
  const clean = baseUrl.trim().replace(/\/+$/, '');
  if (clean.startsWith('/')) {
    return `http://localhost:3000${clean}/v1/systemone`;
  }
  return formatEndpointPreviewUrl(clean, model, cloudflareAccountId);
}

function normalizePayloadForProfile(
  profile: EndpointProfile,
  payload: S1RequestPayload
): S1RequestPayload {
  if (!isCloudflareProfile(profile)) return payload;
  const modelToUse = payload.model || profile.defaultModel;
  return {
    ...payload,
    ...(modelToUse
      ? { model: getCloudflarePayloadModelSelector(modelToUse) }
      : {}),
  };
}

/**
 * 1. cURL Exporter (with -s and | jq pipeline)
 */
export function generateCurlSnippet(
  profile: EndpointProfile,
  payload: S1RequestPayload,
  options: CodeGenOptions
): string {
  const modelToUse = payload.model || profile.defaultModel;
  const endpoint = isCloudflareProfile(profile)
    ? buildCloudflareEndpointUrl(extractCloudflareAccountId(profile), modelToUse)
    : getEndpointUrl(profile.baseUrl, modelToUse, profile.cloudflareAccountId);
  const normalizedPayload = normalizePayloadForProfile(profile, payload);
  const jsonPayload = JSON.stringify(normalizedPayload, null, 2);
  const escapedBody = jsonPayload.replace(/'/g, `'\\''`);

  const envVarName = getProfileApiKeyEnvVar(profile);
  const hasRawKey = Boolean(profile.apiKey && profile.apiKey.trim());
  const includeAuth = shouldIncludeAuthInSnippet(profile);

  const authHeaderLine = includeAuth
    ? options.includeRawApiKey && hasRawKey
      ? `  -H "Authorization: Bearer ${profile.apiKey.trim()}" \\\n`
      : `  -H "Authorization: Bearer $${envVarName}" \\\n`
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

  const envVarName = getProfileApiKeyEnvVar(profile);
  const apiKeyExpr =
    profile.apiKey && profile.apiKey.trim() && options.includeRawApiKey
      ? `"${profile.apiKey.trim()}"`
      : `os.environ.get("${envVarName}", "")`;

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

  const envVarName = getProfileApiKeyEnvVar(profile);
  const apiKeyExpr =
    profile.apiKey && profile.apiKey.trim() && options.includeRawApiKey
      ? `"${profile.apiKey.trim()}"`
      : `process.env.${envVarName} ?? ""`;

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

  const modelToUse = payload.model || profile.defaultModel;
  const endpoint = isCloudflareProfile(profile)
    ? buildCloudflareEndpointUrl(extractCloudflareAccountId(profile), modelToUse)
    : getEndpointUrl(profile.baseUrl, modelToUse, profile.cloudflareAccountId);
  const fetchPayloadStr = JSON.stringify(
    normalizePayloadForProfile(profile, payload),
    null,
    2
  );
  return `const ENDPOINT = "${endpoint}";
const API_KEY = ${apiKeyExpr};

async function evaluateSystemOne() {
  const payload = ${fetchPayloadStr};

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

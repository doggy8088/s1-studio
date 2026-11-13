import { EndpointProfile, S1RequestPayload } from '@/types/systemone';
import {
  buildCloudflareEndpointUrl,
  extractCloudflareAccountId,
  formatEndpointPreviewUrl,
  getCloudflarePayloadModelSelector,
  isCloudflareProfile,
  stripLocalOllamaStatusSuffix,
} from './s1-utils';
import {
  GEMINI_API_KEY_ENV_VAR,
  buildGeminiDecisionsEndpoint,
  isGeminiDecisionsProfile,
  toGeminiDecisionsRequest,
} from './gemini-decisions';
import {
  TYPESAFE_IMAGES_HEADER,
  TypeSafeRequest,
  isTypeSafeProfile,
  toTypeSafeApiRoot,
  toTypeSafeRequest,
  typeSafeRequestHeaders,
} from './typesafe';

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
  if (isGeminiDecisionsProfile(profile)) {
    return GEMINI_API_KEY_ENV_VAR;
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

/** Readable, deterministic image references for exported snippets. */
const snippetAssetRef = (index: number) => `<s1-image-${index + 1}>`;

function isTypeSafeSdkProfile(profile: EndpointProfile): boolean {
  return !isCloudflareProfile(profile) && isTypeSafeProfile(profile);
}

function normalizePayloadForProfile(
  profile: EndpointProfile,
  payload: S1RequestPayload
): S1RequestPayload | TypeSafeRequest {
  const rawModel = stripLocalOllamaStatusSuffix(
    payload.model || profile.defaultModel || ''
  );
  if (isCloudflareProfile(profile)) {
    return {
      ...payload,
      ...(rawModel ? { model: getCloudflarePayloadModelSelector(rawModel) } : {}),
    };
  }
  const withModel: S1RequestPayload = {
    ...payload,
    ...(rawModel ? { model: rawModel } : {}),
  };
  // TypeSafe AI expects images as `assets` + references (https://docs.typesafe.ai/images).
  return isTypeSafeProfile(profile)
    ? toTypeSafeRequest(withModel, { createRef: snippetAssetRef })
    : withModel;
}

/** Provider-specific request headers besides Content-Type and auth. */
function extraSnippetHeaders(
  profile: EndpointProfile,
  payload: S1RequestPayload
): Record<string, string> {
  return isTypeSafeSdkProfile(profile) ? typeSafeRequestHeaders(payload) : {};
}

/**
 * Serialize a JSON value as a Python literal.
 * Unlike a regex over JSON text, this never rewrites `true`/`false`/`null`
 * inside strings or keys (for example noul criteria keys "true"/"false").
 */
function toPythonLiteral(value: unknown, indent = 0): string {
  const pad = ' '.repeat(indent);
  const inner = ' '.repeat(indent + 4);
  if (value === null || value === undefined) return 'None';
  if (value === true) return 'True';
  if (value === false) return 'False';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'None';
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const items = value.map((v) => `${inner}${toPythonLiteral(v, indent + 4)}`);
    return `[\n${items.join(',\n')},\n${pad}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return '{}';
    const items = entries.map(
      ([k, v]) => `${inner}${JSON.stringify(k)}: ${toPythonLiteral(v, indent + 4)}`
    );
    return `{\n${items.join(',\n')},\n${pad}}`;
  }
  return 'None';
}

/**
 * 1. cURL Exporter (with -s and | jq pipeline)
 */
export function generateCurlSnippet(
  profile: EndpointProfile,
  payload: S1RequestPayload,
  options: CodeGenOptions
): string {
  if (isGeminiDecisionsProfile(profile)) {
    return generateGeminiCurlSnippet(profile, payload, options);
  }
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
  const extraHeaderLines = Object.entries(extraSnippetHeaders(profile, payload))
    .map(([k, v]) => `  -H "${k}: ${v}" \\\n`)
    .join('');

  return `curl -s -X POST "${endpoint}" \\
  -H "Content-Type: application/json" \\
${authHeaderLine}${extraHeaderLines}  -d '${escapedBody}' | jq`;
}

/**
 * 2. Python Exporter
 * - TypeSafe AI: official `typesafe-sdk` (`TypeSafeClient.system_one`)
 * - Other SystemOne endpoints (Ollama, Cloudflare, simulator, custom): `requests`
 */
export function generatePythonSnippet(
  profile: EndpointProfile,
  payload: S1RequestPayload,
  options: CodeGenOptions
): string {
  if (isGeminiDecisionsProfile(profile)) {
    return generateGeminiPythonSnippet(profile, payload, options);
  }
  if (isTypeSafeSdkProfile(profile)) {
    return generateTypeSafePythonSnippet(profile, payload, options);
  }
  return generateHttpPythonSnippet(profile, payload, options);
}

function rawApiKey(profile: EndpointProfile, options: CodeGenOptions): string | undefined {
  const raw = (profile.apiKey || '').trim();
  return options.includeRawApiKey && raw ? raw : undefined;
}

function generateTypeSafePythonSnippet(
  profile: EndpointProfile,
  payload: S1RequestPayload,
  options: CodeGenOptions
): string {
  const body = normalizePayloadForProfile(profile, payload) as TypeSafeRequest;
  const rawKey = rawApiKey(profile, options);
  const apiKeyExpr = rawKey
    ? JSON.stringify(rawKey)
    : `os.environ["${getProfileApiKeyEnvVar(profile)}"]`;
  const assets = Object.entries(body.assets ?? {});
  const hasImages = assets.length > 0;

  const checks: string[] = [];
  for (const [key, q] of Object.entries(payload.questions)) {
    if (q.type === 'noul') {
      const th = (options.noulThresholds?.[key] ?? 0.5).toFixed(2);
      checks.push(
        `print(f"[NOUL] ${key}: {result.nouls['${key}'].noul:.3f} -> {'PASS' if result.nouls['${key}'].noul >= ${th} else 'REJECT'} (threshold=${th})")`
      );
    } else if (q.type === 'choice') {
      checks.push(
        `print(f"[CHOICE] ${key}: winner={result.choices['${key}'].choice} (confidence={result.choices['${key}'].confidence:.3f})")`
      );
    } else if (q.type === 'score') {
      checks.push(
        `print(f"[SCORE] ${key}: score={result.scores['${key}'].score:.3f} (confidence={result.scores['${key}'].confidence:.3f})")`
      );
    }
  }

  const callArgs = [
    '        state=state,',
    '        questions=questions,',
    ...(body.model ? [`        model=${JSON.stringify(body.model)},`] : []),
    ...(hasImages
      ? [
          '        assets=assets,',
          `        extra_headers={"${TYPESAFE_IMAGES_HEADER}": "true"},`,
        ]
      : []),
  ];
  const assetsBlock = hasImages
    ? `\n# 圖片以 assets 傳送，並在 state 中以參照字串引用（https://docs.typesafe.ai/images）
assets = {
${assets
  .map(([ref, a]) => `    ${JSON.stringify(ref)}: Image.from_base64(${JSON.stringify(a.data_base64)}),`)
  .join('\n')}
}
`
    : '';

  return `# pip install typesafe-sdk
import os

from typesafe_sdk import ${hasImages ? 'Image, ' : ''}TypeSafeClient

state = ${toPythonLiteral(body.state)}

questions = ${toPythonLiteral(body.questions)}
${assetsBlock}
with TypeSafeClient(
    api_key=${apiKeyExpr},
    base_url=${JSON.stringify(toTypeSafeApiRoot(profile.baseUrl) || 'https://api.typesafe.ai')},
) as client:
    result = client.system_one(
${callArgs.join('\n')}
    )

${checks.length > 0 ? checks.join('\n') : 'print(result)'}
`;
}

function generateHttpPythonSnippet(
  profile: EndpointProfile,
  payload: S1RequestPayload,
  options: CodeGenOptions
): string {
  const modelToUse = payload.model || profile.defaultModel;
  const endpoint = isCloudflareProfile(profile)
    ? buildCloudflareEndpointUrl(extractCloudflareAccountId(profile), modelToUse)
    : getEndpointUrl(profile.baseUrl, modelToUse, profile.cloudflareAccountId);
  const body = normalizePayloadForProfile(profile, payload);
  const includeAuth = shouldIncludeAuthInSnippet(profile);
  const rawKey = rawApiKey(profile, options);
  const apiKeyExpr = rawKey
    ? JSON.stringify(rawKey)
    : `os.environ.get("${getProfileApiKeyEnvVar(profile)}", "")`;

  const checks: string[] = [];
  for (const [key, q] of Object.entries(payload.questions)) {
    const ref = `answers['${key}']`;
    if (q.type === 'noul') {
      const th = (options.noulThresholds?.[key] ?? 0.5).toFixed(2);
      checks.push(
        `print(f"[NOUL] ${key}: {${ref}['noul']:.3f} -> {'PASS' if ${ref}['noul'] >= ${th} else 'REJECT'} (threshold=${th})")`
      );
    } else if (q.type === 'choice') {
      checks.push(
        `print(f"[CHOICE] ${key}: winner={${ref}['choice']} (confidence={${ref}.get('confidence', 0):.3f})")`
      );
    } else if (q.type === 'score') {
      checks.push(
        `print(f"[SCORE] ${key}: score={${ref}['score']:.3f} (confidence={${ref}.get('confidence', 0):.3f})")`
      );
    }
  }

  const authLines = includeAuth
    ? `API_KEY = ${apiKeyExpr}\n`
    : '';
  const authHeader = includeAuth
    ? `if API_KEY:\n    headers["Authorization"] = f"Bearer {API_KEY}"\n`
    : '';

  return `# pip install requests
${includeAuth && !rawKey ? 'import os\n\n' : ''}import requests

ENDPOINT = ${JSON.stringify(endpoint)}
${authLines}
payload = ${toPythonLiteral(body)}

headers = {"Content-Type": "application/json"}
${authHeader}
response = requests.post(ENDPOINT, json=payload, headers=headers, timeout=60)
response.raise_for_status()
data = response.json()

# Cloudflare Workers AI 會把結果包在 result 之中
answers = data.get("answers") or (data.get("result") or {}).get("answers", {})

${checks.length > 0 ? checks.join('\n') : 'print(data)'}
`;
}

/**
 * 3. TypeScript Exporter
 * - `sdk`: official `@typesafe-ai/sdk` for TypeSafe AI; other SystemOne
 *   endpoints have no official SDK, so they get the native fetch version.
 * - `fetch`: native fetch for every provider.
 */
export function generateTypeScriptSnippet(
  profile: EndpointProfile,
  payload: S1RequestPayload,
  options: CodeGenOptions,
  variant: 'sdk' | 'fetch' = 'sdk'
): string {
  if (isGeminiDecisionsProfile(profile)) {
    return generateGeminiTypeScriptSnippet(profile, payload, options, variant);
  }
  if (variant === 'sdk') {
    if (isTypeSafeSdkProfile(profile)) {
      return generateTypeSafeTypeScriptSnippet(profile, payload, options);
    }
    return `// 此端點沒有官方 TypeScript SDK，以下使用原生 fetch。\n${generateFetchTypeScriptSnippet(profile, payload, options)}`;
  }
  return generateFetchTypeScriptSnippet(profile, payload, options);
}

function indentBlock(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return text
    .split('\n')
    .map((line, i) => (i === 0 ? line : `${pad}${line}`))
    .join('\n');
}

function generateTypeSafeTypeScriptSnippet(
  profile: EndpointProfile,
  payload: S1RequestPayload,
  options: CodeGenOptions
): string {
  const body = normalizePayloadForProfile(profile, payload) as TypeSafeRequest;
  const rawKey = rawApiKey(profile, options);
  const apiKeyExpr = rawKey
    ? JSON.stringify(rawKey)
    : `process.env.${getProfileApiKeyEnvVar(profile)}`;
  const assets = Object.entries(body.assets ?? {});
  const hasImages = assets.length > 0;

  const { assets: _assets, ...request } = body;
  void _assets;
  let requestStr = JSON.stringify(request, null, 2);
  if (hasImages) {
    const assetLines = assets
      .map(([ref, a]) => `    ${JSON.stringify(ref)}: Image.fromBase64(${JSON.stringify(a.data_base64)}),`)
      .join('\n');
    requestStr = `${requestStr.replace(/\n}$/, '')},\n  "assets": {\n${assetLines}\n  }\n}`;
  }
  const callOptions = hasImages
    ? `,\n    { headers: { "${TYPESAFE_IMAGES_HEADER}": "true" } }`
    : '';

  return `// npm install @typesafe-ai/sdk（需要 Node.js 22 以上）
import { ${hasImages ? 'Image, ' : ''}TypeSafeClient } from "@typesafe-ai/sdk";

const client = new TypeSafeClient({
  apiKey: ${apiKeyExpr},
  baseURL: ${JSON.stringify(toTypeSafeApiRoot(profile.baseUrl) || 'https://api.typesafe.ai')},
});

async function runDecision() {
  const result = await client.systemOne(
    ${indentBlock(requestStr, 4)}${callOptions}
  );

  console.log("SystemOne Answers:", JSON.stringify(result.answers, null, 2));
  return result;
}

runDecision().catch(console.error);
`;
}

function generateFetchTypeScriptSnippet(
  profile: EndpointProfile,
  payload: S1RequestPayload,
  options: CodeGenOptions
): string {
  const envVarName = getProfileApiKeyEnvVar(profile);
  const rawKey = rawApiKey(profile, options);
  const apiKeyExpr = rawKey
    ? `"${rawKey}"`
    : `process.env.${envVarName} ?? ""`;

  const modelToUse = payload.model || profile.defaultModel;
  const endpoint = isCloudflareProfile(profile)
    ? buildCloudflareEndpointUrl(extractCloudflareAccountId(profile), modelToUse)
    : getEndpointUrl(profile.baseUrl, modelToUse, profile.cloudflareAccountId);
  const fetchPayloadStr = JSON.stringify(
    normalizePayloadForProfile(profile, payload),
    null,
    2
  );
  const extraHeaderLines = Object.entries(extraSnippetHeaders(profile, payload))
    .map(([k, v]) => `      "${k}": "${v}",\n`)
    .join('');
  return `const ENDPOINT = "${endpoint}";
const API_KEY = ${apiKeyExpr};

async function evaluateSystemOne() {
  const payload = ${fetchPayloadStr};

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
${extraHeaderLines}      ...(API_KEY ? { Authorization: \`Bearer \${API_KEY}\` } : {}),
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

// ---------------------------------------------------------------------------
// Gemini Decisions API snippets (POST /v1beta/decisions, x-goog-api-key)
// ---------------------------------------------------------------------------

function geminiApiKeyLiteral(
  profile: EndpointProfile,
  options: CodeGenOptions
): string | undefined {
  const raw = (profile.apiKey || '').trim();
  return options.includeRawApiKey && raw ? raw : undefined;
}

function generateGeminiCurlSnippet(
  profile: EndpointProfile,
  payload: S1RequestPayload,
  options: CodeGenOptions
): string {
  const endpoint = buildGeminiDecisionsEndpoint(profile.baseUrl);
  const body = toGeminiDecisionsRequest(
    payload,
    payload.model || profile.defaultModel
  );
  const escapedBody = JSON.stringify(body, null, 2).replace(/'/g, `'\\''`);
  const rawKey = geminiApiKeyLiteral(profile, options);
  const keyValue = rawKey ?? `$${GEMINI_API_KEY_ENV_VAR}`;

  return `curl -s -X POST "${endpoint}" \\
  -H "Content-Type: application/json" \\
  -H "x-goog-api-key: ${keyValue}" \\
  -d '${escapedBody}' | jq`;
}

function generateGeminiPythonSnippet(
  profile: EndpointProfile,
  payload: S1RequestPayload,
  options: CodeGenOptions
): string {
  const body = toGeminiDecisionsRequest(
    payload,
    payload.model || profile.defaultModel
  );
  const rawKey = geminiApiKeyLiteral(profile, options);
  const clientArgs = rawKey
    ? `api_key="${rawKey}", http_options={"api_version": "v1beta"}`
    : `http_options={"api_version": "v1beta"}`;

  const checks: string[] = [];
  for (const [key, q] of Object.entries(payload.questions)) {
    const ref = `result.answers['${key}']`;
    if (q.type === 'noul') {
      const th = (options.noulThresholds?.[key] ?? 0.5).toFixed(2);
      checks.push(
        `print(f"[NOUL] ${key}: {${ref}.noul:.3f} -> {'PASS' if ${ref}.noul >= ${th} else 'REJECT'} (threshold=${th})")`
      );
    } else if (q.type === 'choice') {
      checks.push(
        `print(f"[CHOICE] ${key}: winner={${ref}.choice} (confidence={${ref}.confidence:.3f})")`
      );
    } else {
      checks.push(
        `print(f"[SCORE] ${key}: score={${ref}.score:.3f} (confidence={${ref}.confidence:.3f})")`
      );
    }
  }

  const envNote = rawKey
    ? ''
    : `# 預設讀取環境變數 ${GEMINI_API_KEY_ENV_VAR}\n`;

  return `# pip install -U "google-genai>=3.2"
${envNote}from google import genai

client = genai.Client(${clientArgs})

request_payload = ${toPythonLiteral(body)}

result = client.decisions.create(
    model=request_payload["model"],
    input=request_payload["input"],
    questions=request_payload["questions"],
)

${checks.length > 0 ? checks.join('\n') : 'print(result)'}
`;
}

function generateGeminiTypeScriptSnippet(
  profile: EndpointProfile,
  payload: S1RequestPayload,
  options: CodeGenOptions,
  variant: 'sdk' | 'fetch'
): string {
  const body = toGeminiDecisionsRequest(
    payload,
    payload.model || profile.defaultModel
  );
  const payloadStr = JSON.stringify(body, null, 2);
  const rawKey = geminiApiKeyLiteral(profile, options);
  const apiKeyExpr = rawKey
    ? `"${rawKey}"`
    : `process.env.${GEMINI_API_KEY_ENV_VAR} ?? ""`;

  if (variant === 'sdk') {
    return `// npm install @google/genai@latest
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: ${apiKeyExpr},
  apiVersion: "v1beta",
});

async function runDecision() {
  const result = await ai.decisions.create(${payloadStr});

  console.log("Gemini Decisions Response:", JSON.stringify(result, null, 2));
  return result;
}

runDecision().catch(console.error);
`;
  }

  const endpoint = buildGeminiDecisionsEndpoint(profile.baseUrl);
  return `const ENDPOINT = "${endpoint}";
const API_KEY = ${apiKeyExpr};

async function evaluateGeminiDecision() {
  const payload = ${payloadStr};

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": API_KEY,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(\`HTTP \${response.status}: \${await response.text()}\`);
  }

  const data = await response.json();
  console.log("Gemini Decisions Result:", data);
  return data;
}

evaluateGeminiDecision().catch(console.error);
`;
}

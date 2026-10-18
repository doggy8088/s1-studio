import type { EndpointProfile, S1PresetDefinition } from '@/types/systemone';
import {
  buildCloudflareEndpointUrl,
  extractCloudflareAccountId,
  getDefaultModelsForProfile,
  isCloudflareProfile,
  normalizeCloudflareModelId,
} from '@/lib/s1-utils';

/**
 * Query parameters accepted by the Profile deep-link importer.
 * API keys and other credentials are intentionally NOT accepted.
 */
export const PROFILE_LINK_QUERY_KEYS = [
  'profile',
  'baseUrl',
  'model',
  'proxy',
  'accountId',
  'preset',
] as const;

/** Query parameters that must never be imported from a URL. */
export const SENSITIVE_LINK_QUERY_KEYS = [
  'apikey',
  'api_key',
  'api-key',
  'key',
  'token',
  'access_token',
  'accesstoken',
  'secret',
  'client_secret',
  'clientsecret',
  'password',
  'authorization',
  'auth',
  'bearer',
  'credential',
  'credentials',
  'sig',
  'signature',
] as const;

const MAX_PROFILE_NAME_LENGTH = 80;
const MAX_BASE_URL_LENGTH = 2048;
const MAX_MODEL_LENGTH = 200;
const MAX_ACCOUNT_ID_LENGTH = 80;
const MAX_PRESET_LENGTH = 200;

export interface ProfileUrlSpec {
  name: string;
  baseUrl?: string;
  model?: string;
  useProxy?: boolean;
  cloudflareAccountId?: string;
}

export interface ProfileConflictField {
  key: 'baseUrl' | 'defaultModel' | 'useProxy' | 'cloudflareAccountId';
  label: string;
  before: string;
  after: string;
}

export interface ProfileImportConflict {
  existing: EndpointProfile;
  proposed: EndpointProfile;
  changedFields: ProfileConflictField[];
}

export type ProfileImportPlan =
  | { kind: 'switch'; profileId: string }
  | { kind: 'create'; profile: EndpointProfile }
  | { kind: 'conflict'; conflict: ProfileImportConflict }
  | { kind: 'error'; error: string };

export interface ProfileLinkSearchResult {
  hasAnyImportParam: boolean;
  profile: ProfileUrlSpec | null;
  preset: string | null;
  warnings: string[];
  errors: string[];
}

type BaseUrlValidation =
  | { ok: true; value: string }
  | { ok: false; error: string };

function normalizeUrlPathname(pathname: string): string {
  return pathname
    .replace(/%24/gi, '$')
    .replace(/%40/gi, '@')
    .replace(/\/+$/, '');
}

function firstParamMap(search: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const [key, value] of new URLSearchParams(search)) {
    const normalizedKey = key.trim().toLowerCase();
    if (!map.has(normalizedKey)) {
      map.set(normalizedKey, value);
    }
  }
  return map;
}

/**
 * Accept only HTTP(S) endpoints or same-origin `/api/...` paths.
 * Credentials, query strings and fragments are rejected so secrets never
 * travel through a shareable deep link.
 */
export function validateProfileBaseUrl(raw: string): BaseUrlValidation {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: 'baseUrl 不可為空。' };
  }
  if (trimmed.length > MAX_BASE_URL_LENGTH) {
    return {
      ok: false,
      error: `baseUrl 不可超過 ${MAX_BASE_URL_LENGTH} 個字元。`,
    };
  }
  if (/[\u0000-\u001f\u007f\\]/.test(trimmed)) {
    return {
      ok: false,
      error: 'baseUrl 不可包含控制字元或反斜線。',
    };
  }

  if (trimmed.startsWith('/')) {
    if (!trimmed.startsWith('/api/')) {
      return {
        ok: false,
        error: 'baseUrl 僅接受 http(s) 網址，或以 /api/ 開頭的站內路徑。',
      };
    }
    return { ok: true, value: trimmed.replace(/\/+$/, '') || '/api' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: 'baseUrl 不是有效的網址。' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'baseUrl 僅接受 http 或 https 協定。' };
  }

  if (parsed.username || parsed.password) {
    return {
      ok: false,
      error:
        'baseUrl 不可包含帳號或密碼；請改由本機 Profile 設定 API Key。',
    };
  }

  if (parsed.search || parsed.hash) {
    const sensitiveSet = new Set(
      SENSITIVE_LINK_QUERY_KEYS.map((key) => key.toLowerCase())
    );
    const sensitiveKeys = Array.from(parsed.searchParams.keys()).filter((key) =>
      sensitiveSet.has(key.toLowerCase())
    );
    if (sensitiveKeys.length > 0) {
      return {
        ok: false,
        error: `baseUrl 含有敏感查詢參數（${sensitiveKeys.join(
          ', '
        )}），請改由本機 Profile 設定 API Key。`,
      };
    }
    return {
      ok: false,
      error:
        'baseUrl 不可包含查詢字串（?...）或片段（#...）；請僅提供端點根網址。',
    };
  }

  const pathname = normalizeUrlPathname(parsed.pathname);
  return {
    ok: true,
    value: `${parsed.protocol}//${parsed.host}${pathname}`,
  };
}

function parseProxyParam(raw: string): boolean | undefined {
  switch (raw.trim().toLowerCase()) {
    case '1':
    case 'true':
    case 'yes':
    case 'on':
      return true;
    case '0':
    case 'false':
    case 'no':
    case 'off':
      return false;
    default:
      return undefined;
  }
}

/**
 * Parse and validate the query string used by Profile deep links.
 * Unknown parameters are ignored, sensitive parameters are reported as
 * warnings (never imported), and malformed profile parameters are errors.
 */
export function parseProfileLinkSearch(
  search: string
): ProfileLinkSearchResult {
  const params = firstParamMap(search);
  const sensitiveSet = new Set(
    SENSITIVE_LINK_QUERY_KEYS.map((key) => key.toLowerCase())
  );
  const importKeySet = new Set(
    [...PROFILE_LINK_QUERY_KEYS, ...SENSITIVE_LINK_QUERY_KEYS].map((key) =>
      key.toLowerCase()
    )
  );

  const hasAnyImportParam = Array.from(params.keys()).some((key) =>
    importKeySet.has(key)
  );

  const warnings: string[] = [];
  const errors: string[] = [];
  let profile: ProfileUrlSpec | null = null;
  let preset: string | null = null;

  const presentSensitive = Array.from(params.keys()).filter((key) =>
    sensitiveSet.has(key)
  );
  if (presentSensitive.length > 0) {
    warnings.push(
      `網址含有敏感參數（${presentSensitive.join(
        ', '
      )}），已忽略並從網址移除。請勿在連結中傳遞 API Key、權杖或密碼。`
    );
  }

  const profileRaw = params.get('profile');
  const baseUrlRaw = params.get('baseurl');
  const modelRaw = params.get('model');
  const proxyRaw = params.get('proxy');
  const accountIdRaw = params.get('accountid');
  const presetRaw = params.get('preset');

  const hasProfileField = [
    baseUrlRaw,
    modelRaw,
    proxyRaw,
    accountIdRaw,
  ].some((value) => value !== undefined);

  if (profileRaw === undefined && hasProfileField) {
    errors.push(
      '網址包含 Profile 設定參數，但缺少必填的 profile 名稱參數。'
    );
  }

  if (profileRaw !== undefined) {
    const name = profileRaw.trim();
    if (!name) {
      errors.push('profile 名稱不可為空。');
    } else if (name.length > MAX_PROFILE_NAME_LENGTH) {
      errors.push(
        `profile 名稱不可超過 ${MAX_PROFILE_NAME_LENGTH} 個字元。`
      );
    } else if (/[\u0000-\u001f\u007f]/.test(name)) {
      errors.push('profile 名稱不可包含控制字元。');
    } else {
      const spec: ProfileUrlSpec = { name };
      let valid = true;

      if (baseUrlRaw !== undefined) {
        const result = validateProfileBaseUrl(baseUrlRaw);
        if (result.ok) {
          spec.baseUrl = result.value;
        } else {
          errors.push(result.error);
          valid = false;
        }
      }

      if (modelRaw !== undefined && modelRaw.trim().length > 0) {
        const model = modelRaw.trim();
        if (model.length > MAX_MODEL_LENGTH) {
          errors.push(`model 不可超過 ${MAX_MODEL_LENGTH} 個字元。`);
          valid = false;
        } else if (!/^[A-Za-z0-9@._:/+-]+$/.test(model)) {
          errors.push(
            'model 僅接受英數字與 @ . _ : / + - 字元，請確認模型識別碼格式。'
          );
          valid = false;
        } else {
          spec.model = model;
        }
      }

      if (proxyRaw !== undefined) {
        const parsedProxy = parseProxyParam(proxyRaw);
        if (parsedProxy === undefined) {
          errors.push(
            'proxy 參數無效；請使用 1/0、true/false、on/off 或 yes/no。'
          );
          valid = false;
        } else {
          spec.useProxy = parsedProxy;
        }
      }

      if (accountIdRaw !== undefined && accountIdRaw.trim().length > 0) {
        const accountId = accountIdRaw.trim();
        const accountIdPattern = new RegExp(
          `^[A-Za-z0-9_$-]{1,${MAX_ACCOUNT_ID_LENGTH}}$`
        );
        if (!accountIdPattern.test(accountId)) {
          errors.push(
            `accountId 僅接受英數字、底線、$ 與連字號，且長度需在 1–${MAX_ACCOUNT_ID_LENGTH} 字元內。`
          );
          valid = false;
        } else {
          spec.cloudflareAccountId = accountId;
        }
      }

      if (valid) {
        profile = spec;
      }
    }
  }

  if (presetRaw !== undefined) {
    const trimmed = presetRaw.trim();
    if (!trimmed) {
      warnings.push('preset 參數為空，已忽略。');
    } else if (trimmed.length > MAX_PRESET_LENGTH) {
      warnings.push(
        `preset 名稱不可超過 ${MAX_PRESET_LENGTH} 個字元，已忽略。`
      );
    } else if (/[\u0000-\u001f\u007f]/.test(trimmed)) {
      warnings.push('preset 名稱不可包含控制字元，已忽略。');
    } else {
      preset = trimmed;
    }
  }

  return { hasAnyImportParam, profile, preset, warnings, errors };
}

function defaultProxyForBaseUrl(baseUrl: string): boolean {
  const trimmed = baseUrl.trim();
  if (trimmed.startsWith('/api/')) return false;

  try {
    const host = new URL(trimmed).hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '[::1]' ||
      host === '[::]' ||
      host.endsWith('.localhost')
    ) {
      return false;
    }
    if (
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      /^169\.254\./.test(host)
    ) {
      return false;
    }
    if (
      host.startsWith('[fc') ||
      host.startsWith('[fd') ||
      host.startsWith('[fe80:')
    ) {
      return false;
    }
  } catch {
    // Fall through to Proxy Mode for malformed URLs.
  }

  return true;
}

function normalizeProfileName(name: string): string {
  return name.trim().toLowerCase();
}

function findProfileByName(
  profiles: EndpointProfile[],
  name: string
): EndpointProfile | undefined {
  const trimmed = name.trim();
  const exact = profiles.find((profile) => profile.name.trim() === trimmed);
  if (exact) return exact;

  const normalized = normalizeProfileName(trimmed);
  return profiles.find(
    (profile) => normalizeProfileName(profile.name) === normalized
  );
}

function canonicalBaseUrl(value: string): string {
  const trimmed = (value || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/')) {
    return trimmed.replace(/\/+$/, '');
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return trimmed.replace(/\/+$/, '');
    }
    return `${parsed.protocol}//${parsed.host}${normalizeUrlPathname(
      parsed.pathname
    )}${parsed.search}`;
  } catch {
    return trimmed.replace(/\/+$/, '');
  }
}

function canonicalModel(
  profile: EndpointProfile,
  model: string | undefined
): string {
  const trimmed = (model || '').trim();
  return isCloudflareProfile(profile)
    ? normalizeCloudflareModelId(trimmed)
    : trimmed;
}

export function extractCloudflareModelFromBaseUrl(
  baseUrl: string
): string | undefined {
  const match = (baseUrl || '').match(
    /\/ai\/run\/(@cf\/[^/?#]+\/[^/?#]+)/i
  );
  return match?.[1];
}

function inferSpecifiedModel(
  spec: ProfileUrlSpec,
  existing?: EndpointProfile
): string | undefined {
  if (spec.model !== undefined) return spec.model;
  if (!spec.baseUrl) return undefined;

  const cloudflareLike = isCloudflareProfile({
    id: existing?.id ?? '',
    name: spec.name,
    baseUrl: spec.baseUrl,
  });
  return cloudflareLike
    ? extractCloudflareModelFromBaseUrl(spec.baseUrl)
    : undefined;
}

function mergeProfileFromSpec(
  existing: EndpointProfile,
  spec: ProfileUrlSpec,
  desiredModel: string | undefined
): EndpointProfile {
  const merged: EndpointProfile = {
    ...existing,
    baseUrl: spec.baseUrl ?? existing.baseUrl,
    defaultModel: desiredModel ?? existing.defaultModel,
    useProxy: spec.useProxy ?? existing.useProxy,
    apiKey: existing.apiKey,
  };

  if (spec.cloudflareAccountId !== undefined) {
    merged.cloudflareAccountId = spec.cloudflareAccountId;
  }

  if (isCloudflareProfile(merged)) {
    const accountFromSpecUrl = spec.baseUrl
      ? extractCloudflareAccountId({ baseUrl: spec.baseUrl })
      : '';
    const existingAccount = extractCloudflareAccountId(existing);
    const account =
      spec.cloudflareAccountId !== undefined
        ? spec.cloudflareAccountId
        : accountFromSpecUrl ||
          existingAccount ||
          extractCloudflareAccountId(merged);
    const model = normalizeCloudflareModelId(merged.defaultModel);
    merged.defaultModel = model;
    merged.cloudflareAccountId = account;
    merged.baseUrl = buildCloudflareEndpointUrl(account, model);
  }

  return merged;
}

function buildNewProfileFromSpec(
  spec: ProfileUrlSpec,
  id: string,
  inferredModel: string | undefined
): EndpointProfile {
  const baseUrl = spec.baseUrl as string;
  const profile: EndpointProfile = {
    id,
    name: spec.name.trim(),
    baseUrl,
    apiKey: '',
    defaultModel: 'clef',
    useProxy: spec.useProxy ?? defaultProxyForBaseUrl(baseUrl),
  };

  const explicitModel = inferredModel?.trim();
  if (explicitModel) {
    profile.defaultModel = explicitModel;
  } else {
    profile.defaultModel =
      getDefaultModelsForProfile(profile)[0] || 'clef';
  }

  if (spec.cloudflareAccountId !== undefined) {
    profile.cloudflareAccountId = spec.cloudflareAccountId;
  }

  if (isCloudflareProfile(profile)) {
    const account =
      spec.cloudflareAccountId !== undefined
        ? spec.cloudflareAccountId
        : extractCloudflareAccountId(profile);
    const model = normalizeCloudflareModelId(
      inferredModel ?? extractCloudflareModelFromBaseUrl(baseUrl)
    );
    profile.defaultModel = model;
    profile.cloudflareAccountId = account;
    profile.baseUrl = buildCloudflareEndpointUrl(account, model);
  }

  return profile;
}

/**
 * Compare the URL spec with any existing profile of the same name.
 *
 * - Same content (API key is always excluded) -> switch to it.
 * - Different content -> return a conflict so the UI can ask before overwriting.
 * - Unknown name + baseUrl -> create a new profile with an empty API key.
 *
 * When a conflict is overwritten, the existing API key is always preserved.
 */
export function planProfileUrlImport(
  profiles: EndpointProfile[],
  spec: ProfileUrlSpec,
  newId: string
): ProfileImportPlan {
  const existing = findProfileByName(profiles, spec.name);
  const desiredModel = inferSpecifiedModel(spec, existing);

  if (!existing) {
    if (!spec.baseUrl) {
      return {
        kind: 'error',
        error: `找不到名為「${spec.name}」的 Profile，且網址未提供必填的 baseUrl。`,
      };
    }
    return {
      kind: 'create',
      profile: buildNewProfileFromSpec(spec, newId, desiredModel),
    };
  }

  const proposed = mergeProfileFromSpec(existing, spec, desiredModel);
  const changedFields: ProfileConflictField[] = [];

  if (
    spec.baseUrl !== undefined &&
    canonicalBaseUrl(existing.baseUrl) !== canonicalBaseUrl(proposed.baseUrl)
  ) {
    changedFields.push({
      key: 'baseUrl',
      label: '端點網址',
      before: existing.baseUrl,
      after: proposed.baseUrl,
    });
  }

  if (
    desiredModel !== undefined &&
    canonicalModel(existing, existing.defaultModel) !==
      canonicalModel(proposed, proposed.defaultModel)
  ) {
    changedFields.push({
      key: 'defaultModel',
      label: '預設模型',
      before: existing.defaultModel || '(未設定)',
      after: proposed.defaultModel || '(未設定)',
    });
  }

  if (
    spec.useProxy !== undefined &&
    existing.useProxy !== proposed.useProxy
  ) {
    changedFields.push({
      key: 'useProxy',
      label: 'CORS 傳送模式',
      before: existing.useProxy ? 'Proxy Mode' : 'Direct Mode',
      after: proposed.useProxy ? 'Proxy Mode' : 'Direct Mode',
    });
  }

  if (spec.cloudflareAccountId !== undefined) {
    const before = isCloudflareProfile(existing)
      ? extractCloudflareAccountId(existing)
      : (existing.cloudflareAccountId || '').trim();
    const after = isCloudflareProfile(proposed)
      ? extractCloudflareAccountId(proposed)
      : (proposed.cloudflareAccountId || '').trim();
    if (before !== after) {
      changedFields.push({
        key: 'cloudflareAccountId',
        label: 'Cloudflare Account ID',
        before: before || '(未設定)',
        after: after || '(未設定)',
      });
    }
  }

  if (changedFields.length === 0) {
    return { kind: 'switch', profileId: existing.id };
  }

  return {
    kind: 'conflict',
    conflict: { existing, proposed, changedFields },
  };
}

/**
 * Resolve a scene preset by exact ID first, then by full name.
 * Built-in presets take precedence over custom presets.
 */
export function resolvePresetFromQuery(
  query: string,
  builtInPresets: S1PresetDefinition[],
  customPresets: S1PresetDefinition[] = []
): { preset?: S1PresetDefinition; error?: string } {
  const trimmed = query.trim();
  if (!trimmed) {
    return { error: '場景範本名稱為空。' };
  }

  const byId =
    builtInPresets.find((preset) => preset.id === trimmed) ||
    customPresets.find((preset) => preset.id === trimmed);
  if (byId) return { preset: byId };

  const normalized = trimmed.toLowerCase();
  const byName =
    builtInPresets.find(
      (preset) => preset.name.trim().toLowerCase() === normalized
    ) ||
    customPresets.find(
      (preset) => preset.name.trim().toLowerCase() === normalized
    );
  if (byName) return { preset: byName };

  return {
    error: `找不到名為「${trimmed}」的場景範本；請改用範本 ID 或確認名稱是否正確。`,
  };
}

/**
 * Remove all deep-link and credential-related query parameters from a URL,
 * preserving unrelated parameters and the hash.
 */
export function buildUrlWithoutProfileLinkParams(href: string): string {
  let parsed: URL;
  try {
    parsed = new URL(href, 'http://s1-studio.local');
  } catch {
    return href;
  }

  const removeKeys = new Set(
    [...PROFILE_LINK_QUERY_KEYS, ...SENSITIVE_LINK_QUERY_KEYS].map((key) =>
      key.toLowerCase()
    )
  );

  for (const key of Array.from(parsed.searchParams.keys())) {
    if (removeKeys.has(key.toLowerCase())) {
      parsed.searchParams.delete(key);
    }
  }

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function createImportedProfileId(): string {
  try {
    if (
      typeof crypto !== 'undefined' &&
      typeof crypto.randomUUID === 'function'
    ) {
      return `profile-import-${crypto.randomUUID()}`;
    }
  } catch {
    // Fall through to the timestamp-based ID.
  }

  return `profile-import-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

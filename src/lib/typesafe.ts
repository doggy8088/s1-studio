import type { EndpointProfile, S1RequestPayload } from '@/types/systemone';

/**
 * TypeSafe AI System One (https://docs.typesafe.ai/)
 *
 * The request body follows the SystemOne protocol, except for images:
 * TypeSafe expects a top-level `assets` map keyed by a reference string,
 * and each reference must appear in `state`, `instructions` or `criteria`.
 * Images also require the `TypeSafe-Danger-Zone-Images: true` header.
 * See https://docs.typesafe.ai/images
 *
 * S1 Studio keeps storing the SystemOne shape (`images: string[]`) and
 * converts it here only when the request is sent.
 */

export const TYPESAFE_PROFILE_ID = 'typesafe-ai-jev';
export const TYPESAFE_API_KEY_ENV_VAR = 'TYPESAFE_API_KEY';
export const TYPESAFE_IMAGES_HEADER = 'TypeSafe-Danger-Zone-Images';

export type TypeSafeImageFormat = 'png' | 'jpeg';

export interface TypeSafeImageAsset {
  type: 'image';
  format: TypeSafeImageFormat;
  data_base64: string;
}

export type TypeSafeRequest = Omit<S1RequestPayload, 'images' | 'state'> & {
  state: unknown;
  images?: string[];
  assets?: Record<string, TypeSafeImageAsset>;
};

/** True when the URL's hostname is `typesafe.ai` or one of its subdomains. */
export function isTypeSafeApiUrl(url?: string): boolean {
  const raw = (url || '').trim();
  if (!/^https?:\/\//i.test(raw)) return false;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return host === 'typesafe.ai' || host.endsWith('.typesafe.ai');
  } catch {
    return false;
  }
}

export function isTypeSafeProfile(
  profile: Pick<EndpointProfile, 'id' | 'baseUrl'>
): boolean {
  return profile.id === TYPESAFE_PROFILE_ID || isTypeSafeApiUrl(profile.baseUrl);
}

function stripDataUriPrefix(img: string): string {
  const trimmed = img.trim();
  const idx = trimmed.indexOf('base64,');
  return trimmed.startsWith('data:') && idx >= 0 ? trimmed.slice(idx + 7) : trimmed;
}

/**
 * Detect the image format from its bytes (base64 magic numbers).
 * TypeSafe accepts PNG and JPEG only; anything else returns `null`.
 */
export function detectTypeSafeImageFormat(image: string): TypeSafeImageFormat | null {
  const b64 = stripDataUriPrefix(image);
  if (b64.startsWith('iVBORw0KGgo')) return 'png';
  if (b64.startsWith('/9j/')) return 'jpeg';
  return null;
}

/** Returns a zh-TW error message when any image is not PNG or JPEG, else `null`. */
export function validateTypeSafeImages(images?: string[]): string | null {
  if (!Array.isArray(images) || images.length === 0) return null;
  const bad = images
    .map((img, i) => (detectTypeSafeImageFormat(img) ? null : i + 1))
    .filter((n): n is number => n !== null);
  if (bad.length === 0) return null;
  return `TypeSafe AI 只接受 PNG 或 JPEG 圖片，第 ${bad.join('、')} 張圖片不是這兩種格式（例如 WebP、GIF），請轉檔後再試。`;
}

function randomId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  // randomUUID is unavailable in insecure (plain http) browser contexts.
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

/** A fresh reference per image per request, as recommended by TypeSafe. */
export function createTypeSafeAssetRef(): string {
  return `<s1-image-${randomId()}>`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function uniqueKey(obj: Record<string, unknown>, base: string): string {
  if (!(base in obj)) return base;
  let n = 2;
  while (`${base}_${n}` in obj) n += 1;
  return `${base}_${n}`;
}

/**
 * Write the asset references into `state` so every asset is referenced:
 * - string state: append one `Image N: <ref>` line per image
 * - object state: add an `images` field (or `images_2`, … when taken)
 * - any other JSON value: wrap as `{ "state": value, "images": [...] }`
 */
export function attachImageRefsToState(state: unknown, refs: string[]): unknown {
  if (refs.length === 0) return state;
  if (typeof state === 'string') {
    const lines = refs.map((ref, i) => `Image ${i + 1}: ${ref}`).join('\n');
    return state.trim() ? `${state}\n\n${lines}` : lines;
  }
  if (isPlainObject(state)) {
    return { ...state, [uniqueKey(state, 'images')]: refs };
  }
  if (state === undefined || state === null) {
    return { images: refs };
  }
  return { state, images: refs };
}

/**
 * Convert a SystemOne payload into the TypeSafe wire format.
 * Payloads without images are returned unchanged.
 */
export function toTypeSafeRequest(
  payload: S1RequestPayload,
  options: { createRef?: (index: number) => string } = {}
): TypeSafeRequest {
  const images = payload.images;
  if (!Array.isArray(images) || images.length === 0) {
    return payload;
  }
  const createRef = options.createRef ?? (() => createTypeSafeAssetRef());
  const refs = images.map((_, i) => createRef(i));
  const assets: Record<string, TypeSafeImageAsset> = {};
  images.forEach((img, i) => {
    assets[refs[i]] = {
      type: 'image',
      format: detectTypeSafeImageFormat(img) ?? 'png',
      data_base64: stripDataUriPrefix(img),
    };
  });

  const { images: _omit, ...rest } = payload;
  void _omit;
  return {
    ...rest,
    state: attachImageRefsToState(payload.state, refs),
    assets,
  };
}

/** Extra request headers TypeSafe needs for this payload. */
export function typeSafeRequestHeaders(
  payload: Partial<S1RequestPayload>
): Record<string, string> {
  return Array.isArray(payload.images) && payload.images.length > 0
    ? { [TYPESAFE_IMAGES_HEADER]: 'true' }
    : {};
}

/** The SDK `base_url` / `baseURL` is the API root (no `/v1/systemone`). */
export function toTypeSafeApiRoot(baseUrl?: string): string {
  return (baseUrl || '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/v1\/systemone$/i, '')
    .replace(/\/v1$/i, '');
}

import type { EndpointProfile, S1RequestPayload } from '@/types/systemone';
import {
  toSystemOneAssetRequest,
  validateSystemOneImages,
  type SystemOneAssetRequest,
} from './systemone-assets';

export {
  attachImageRefsToState,
  detectSystemOneImageFormat as detectTypeSafeImageFormat,
  type SystemOneImageAsset as TypeSafeImageAsset,
  type SystemOneImageFormat as TypeSafeImageFormat,
} from './systemone-assets';

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

export type TypeSafeRequest = SystemOneAssetRequest;

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

export function validateTypeSafeImages(images?: string[]): string | null {
  return validateSystemOneImages('TypeSafe AI', images);
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

/** Convert images to TypeSafe assets only when sending or exporting a request. */
export function toTypeSafeRequest(
  payload: S1RequestPayload,
  options: { createRef?: (index: number) => string } = {}
): TypeSafeRequest {
  return toSystemOneAssetRequest(payload, options.createRef ?? createTypeSafeAssetRef);
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

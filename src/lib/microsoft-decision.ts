import type { EndpointProfile, S1RequestPayload } from '@/types/systemone';
import { toSystemOneAssetRequest, validateSystemOneImages } from './systemone-assets';

export const MICROSOFT_DECISION_PROFILE_ID = 'microsoft-foundry-decision';
export const MICROSOFT_DECISION_NAME = 'Microsoft Decision 1.1 (Foundry)';
export const MICROSOFT_DECISION_MODEL = 'Microsoft-Decision-1.1';
export const FOUNDRY_BASE_URL_TEMPLATE = 'https://your-resource.services.ai.azure.com';
export const FOUNDRY_DECISION_PATH = '/providers/microsoft/v1/systemone';
export const FOUNDRY_API_KEY_HEADER = 'api-key';
export const FOUNDRY_API_KEY_ENV_VAR = 'AZURE_API_KEY';

export function resolveFoundryDecisionEndpoint(baseUrl: string): string | undefined {
  try {
    const url = new URL(baseUrl.trim());
    if (
      url.protocol !== 'https:' || url.port || url.username || url.password ||
      url.search || url.hash ||
      !/^[a-z0-9-]+\.(?:services\.ai|cognitiveservices)\.azure\.com$/.test(url.hostname)
    ) return undefined;

    const path = url.pathname.replace(/\/+$/, '');
    if (path && path !== FOUNDRY_DECISION_PATH) return undefined;
    return url.origin + FOUNDRY_DECISION_PATH;
  } catch {
    return undefined;
  }
}

export function isMicrosoftDecisionProfile(
  profile: Pick<EndpointProfile, 'id' | 'baseUrl'>
): boolean {
  return profile.id === MICROSOFT_DECISION_PROFILE_ID ||
    Boolean(resolveFoundryDecisionEndpoint(profile.baseUrl));
}

export function validateMicrosoftDecisionImages(images?: string[]): string | null {
  return validateSystemOneImages(MICROSOFT_DECISION_NAME, images);
}

export function toMicrosoftDecisionRequest(payload: S1RequestPayload) {
  return toSystemOneAssetRequest(
    payload,
    (index) => `s1-image-${index + 1}`,
    (name) => `image:${name}`
  );
}

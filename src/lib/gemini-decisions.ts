/**
 * Gemini Decisions API adapter (Google AI Studio / Gemini Developer API, v1beta).
 *
 * S1 Studio keeps every request in the SystemOne shape (`state`, `images`, `questions`)
 * so history entries, presets and other providers stay untouched. This module translates
 * that shape to the Gemini Decisions wire format only when a request is actually sent:
 *
 *   POST https://generativelanguage.googleapis.com/v1beta/decisions
 *   x-goog-api-key: $GEMINI_API_KEY
 *   { "model": "gemini-decision-1", "input": ..., "questions": { ... } }
 *
 * Docs: https://aistudio.google.com/docs/decisions-api
 */
import type {
  EndpointProfile,
  S1Question,
  S1RequestPayload,
} from '@/types/systemone';

export const GEMINI_DECISIONS_PROFILE_ID = 'gemini-decisions-api';
export const GEMINI_API_HOST = 'generativelanguage.googleapis.com';
export const GEMINI_API_BASE_URL = `https://${GEMINI_API_HOST}`;
export const GEMINI_DECISIONS_ENDPOINT = `${GEMINI_API_BASE_URL}/v1beta/decisions`;
export const GEMINI_DECISIONS_MODEL = 'gemini-decision-1';
export const GEMINI_DECISIONS_MODELS = [GEMINI_DECISIONS_MODEL] as const;
export const GEMINI_API_KEY_ENV_VAR = 'GEMINI_API_KEY';

/** Gemini question keys: `[A-Za-z0-9_-]+`, 1–64 characters (stricter than SystemOne). */
export const GEMINI_QUESTION_KEY_REGEX = /^[A-Za-z0-9_-]{1,64}$/;

export type GeminiTextBlock = { type: 'text'; text: string };
export type GeminiImageBlock = {
  type: 'image';
  data: string;
  mime_type: string;
};
export type GeminiContentBlock = GeminiTextBlock | GeminiImageBlock;

export type GeminiQuestion =
  | {
      type: 'noul';
      instructions: string;
      criteria?: { true_description?: string; false_description?: string };
    }
  | { type: 'choice'; instructions: string; criteria: Record<string, string> }
  | { type: 'score'; instructions: string; criteria: string[] };

export interface GeminiDecisionsRequest {
  model: string;
  input: string | GeminiContentBlock[];
  questions: Record<string, GeminiQuestion>;
}

function hostOf(url: string): string {
  try {
    return new URL(url.trim()).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/** True when a URL points at the Gemini Developer API host. */
export function isGeminiApiUrl(url?: string): boolean {
  return hostOf(url || '') === GEMINI_API_HOST;
}

/** True when a profile targets the Gemini Decisions API. */
export function isGeminiDecisionsProfile(
  profile: Pick<EndpointProfile, 'id' | 'baseUrl'>
): boolean {
  return (
    profile.id === GEMINI_DECISIONS_PROFILE_ID ||
    isGeminiApiUrl(profile.baseUrl)
  );
}

/**
 * Resolve the Decisions endpoint from any Gemini base URL
 * (`https://generativelanguage.googleapis.com`, `.../v1beta`, or the full `.../v1beta/decisions`).
 */
export function buildGeminiDecisionsEndpoint(baseUrl?: string): string {
  const clean = (baseUrl || '').trim().replace(/\/+$/, '');
  if (!isGeminiApiUrl(clean)) return GEMINI_DECISIONS_ENDPOINT;
  if (/\/v1beta\/decisions$/i.test(clean)) return clean;
  if (/\/v1beta$/i.test(clean)) return `${clean}/decisions`;
  return GEMINI_DECISIONS_ENDPOINT;
}

/** Only `gemini-decision-1` is accepted by the API; anything else falls back to it. */
export function normalizeGeminiDecisionsModel(model?: string): string {
  const m = (model || '').trim().replace(/^models\//, '');
  return m.startsWith('gemini-decision') ? m : GEMINI_DECISIONS_MODEL;
}

/**
 * Detect an image MIME type from the leading bytes of a raw base64 string.
 * `S1RequestPayload.images` carries no MIME type, so sniff the magic number.
 */
export function detectImageMimeType(rawBase64: string): string {
  const b = rawBase64.trim();
  if (b.startsWith('data:')) {
    const m = b.match(/^data:([^;,]+)[;,]/);
    if (m) return m[1];
  }
  if (b.startsWith('iVBORw0KGgo')) return 'image/png';
  if (b.startsWith('/9j/')) return 'image/jpeg';
  if (b.startsWith('R0lGOD')) return 'image/gif';
  if (b.startsWith('UklGR')) return 'image/webp';
  if (b.startsWith('Qk')) return 'image/bmp';
  if (b.startsWith('SUkq') || b.startsWith('TU0AK')) return 'image/tiff';
  return 'image/png';
}

function stripDataUriPrefix(img: string): string {
  const idx = img.indexOf('base64,');
  return img.startsWith('data:') && idx >= 0 ? img.slice(idx + 7) : img;
}

/** Serialize the SystemOne `state` into the text Gemini receives as `input`. */
export function stateToInputText(state: S1RequestPayload['state']): string {
  if (typeof state === 'string') return state;
  if (state === undefined || state === null) return '';
  return JSON.stringify(state, null, 2);
}

export function toGeminiQuestion(q: S1Question): GeminiQuestion {
  if (q.type === 'noul') {
    const t = q.criteria?.true?.trim();
    const f = q.criteria?.false?.trim();
    return {
      type: 'noul',
      instructions: q.instructions,
      ...(t || f
        ? {
            criteria: {
              ...(t ? { true_description: t } : {}),
              ...(f ? { false_description: f } : {}),
            },
          }
        : {}),
    };
  }
  if (q.type === 'choice') {
    const criteria: Record<string, string> = {};
    for (const [key, desc] of Object.entries(q.criteria || {})) {
      criteria[key] = desc ?? '';
    }
    return { type: 'choice', instructions: q.instructions, criteria };
  }
  return {
    type: 'score',
    instructions: q.instructions,
    criteria: [...(q.criteria || [])],
  };
}

/** Translate a SystemOne request payload into a Gemini Decisions request body. */
export function toGeminiDecisionsRequest(
  payload: S1RequestPayload,
  model?: string
): GeminiDecisionsRequest {
  const text = stateToInputText(payload.state);
  const images = (payload.images || []).filter((img) => img && img.trim());

  let input: GeminiDecisionsRequest['input'];
  if (images.length === 0) {
    input = text;
  } else {
    const blocks: GeminiContentBlock[] = [];
    if (text) {
      // Adjacent blocks are concatenated without a separator, so end text with a newline.
      blocks.push({ type: 'text', text: text.endsWith('\n') ? text : `${text}\n` });
    }
    for (const img of images) {
      blocks.push({
        type: 'image',
        data: stripDataUriPrefix(img.trim()),
        mime_type: detectImageMimeType(img),
      });
    }
    input = blocks;
  }

  const questions: Record<string, GeminiQuestion> = {};
  for (const [key, q] of Object.entries(payload.questions || {})) {
    questions[key] = toGeminiQuestion(q);
  }

  return {
    model: normalizeGeminiDecisionsModel(model ?? payload.model),
    input,
    questions,
  };
}

/**
 * Client-side checks for Gemini-only constraints, returned as zh-TW messages.
 * Returns an empty array when the payload can be sent.
 */
export function validateGeminiDecisionsPayload(
  payload: S1RequestPayload
): string[] {
  const issues: string[] = [];
  const text = stateToInputText(payload.state).trim();
  const hasImages = (payload.images || []).some((img) => img && img.trim());
  if (!text && !hasImages) {
    issues.push('Gemini Decisions API 的 input 不可為空，請填入 State 內容或上傳圖片。');
  }
  const invalidKeys = Object.keys(payload.questions || {}).filter(
    (k) => !GEMINI_QUESTION_KEY_REGEX.test(k)
  );
  if (invalidKeys.length > 0) {
    issues.push(
      `Gemini Decisions API 的 Question Key 僅允許英數、_ 與 -（1~64 字元，不可含「.」），不符合的 Key：${invalidKeys.join(', ')}。`
    );
  }
  return issues;
}

/**
 * Map Gemini usage (`total_input_tokens`, `total_output_tokens`, ...) onto the
 * `input_tokens` / `output_tokens` fields S1 Studio already displays, keeping the originals.
 */
export function normalizeGeminiUsage(
  usage: unknown
): Record<string, unknown> | undefined {
  if (!usage || typeof usage !== 'object') return undefined;
  const u = usage as Record<string, unknown>;
  return {
    ...u,
    ...(typeof u.input_tokens !== 'number' && typeof u.total_input_tokens === 'number'
      ? { input_tokens: u.total_input_tokens }
      : {}),
    ...(typeof u.output_tokens !== 'number' && typeof u.total_output_tokens === 'number'
      ? { output_tokens: u.total_output_tokens }
      : {}),
  };
}

import type { S1RequestPayload } from '@/types/systemone';

export type SystemOneImageFormat = 'png' | 'jpeg';

export interface SystemOneImageAsset {
  type: 'image';
  format: SystemOneImageFormat;
  data_base64: string;
}

export type SystemOneAssetRequest = Omit<S1RequestPayload, 'images' | 'state'> & {
  state: unknown;
  images?: string[];
  assets?: Record<string, SystemOneImageAsset>;
};

function stripDataUriPrefix(img: string): string {
  const trimmed = img.trim();
  const idx = trimmed.indexOf('base64,');
  return trimmed.startsWith('data:') && idx >= 0 ? trimmed.slice(idx + 7) : trimmed;
}

/**
 * Detect the image format from its bytes (base64 magic numbers).
 * The asset providers accept PNG and JPEG only; anything else returns `null`.
 */
export function detectSystemOneImageFormat(image: string): SystemOneImageFormat | null {
  const b64 = stripDataUriPrefix(image);
  if (b64.startsWith('iVBORw0KGgo')) return 'png';
  if (b64.startsWith('/9j/')) return 'jpeg';
  return null;
}

/** Returns a zh-TW error message when any image is not PNG or JPEG, else `null`. */
export function validateSystemOneImages(
  providerName: string,
  images?: string[]
): string | null {
  if (!Array.isArray(images) || images.length === 0) return null;
  const bad = images
    .map((img, i) => (detectSystemOneImageFormat(img) ? null : i + 1))
    .filter((n): n is number => n !== null);
  if (bad.length === 0) return null;
  return `${providerName} 只接受 PNG 或 JPEG 圖片，第 ${bad.join('、')} 張圖片不是這兩種格式（例如 WebP、GIF），請轉檔後再試。`;
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

/** Move image data into named assets and attach their references to the state. */
export function toSystemOneAssetRequest(
  payload: S1RequestPayload,
  createAssetName: (index: number) => string,
  assetReference: (name: string) => string = (name) => name
): SystemOneAssetRequest {
  const { images, ...rest } = payload;
  if (!Array.isArray(images) || images.length === 0) return payload;

  const names = images.map((_, i) => createAssetName(i));
  const assets: Record<string, SystemOneImageAsset> = {};
  images.forEach((img, i) => {
    assets[names[i]] = {
      type: 'image',
      format: detectSystemOneImageFormat(img) ?? 'png',
      data_base64: stripDataUriPrefix(img),
    };
  });

  return {
    ...rest,
    state: attachImageRefsToState(payload.state, names.map(assetReference)),
    assets,
  };
}

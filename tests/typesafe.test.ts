import { describe, expect, test } from 'bun:test';
import type { QuestionBuilderItem } from '@/types/systemone';
import { DEFAULT_PROFILES } from '@/lib/presets';
import {
  getScoreLevelLimitForProfile,
  validateQuestionsBuilder,
} from '@/lib/s1-utils';
import {
  attachImageRefsToState,
  detectTypeSafeImageFormat,
  isTypeSafeProfile,
  toTypeSafeApiRoot,
  toTypeSafeRequest,
  typeSafeRequestHeaders,
  validateTypeSafeImages,
} from '@/lib/typesafe';

const ref = (i: number) => `<img-${i}>`;

describe('TypeSafe detection', () => {
  test('matches the built-in profile and typesafe.ai hosts only', () => {
    expect(isTypeSafeProfile({ id: 'typesafe-ai-jev', baseUrl: '' })).toBe(true);
    expect(isTypeSafeProfile({ id: 'x', baseUrl: 'https://api.typesafe.ai' })).toBe(true);
    expect(isTypeSafeProfile({ id: 'x', baseUrl: 'https://evil.example/api.typesafe.ai' })).toBe(false);
    expect(isTypeSafeProfile({ id: 'x', baseUrl: 'https://typesafe.ai.evil.example' })).toBe(false);
    expect(isTypeSafeProfile({ id: 'x', baseUrl: '/api/mock-systemone' })).toBe(false);
  });

  test('API root strips /v1 and /v1/systemone', () => {
    expect(toTypeSafeApiRoot('https://api.typesafe.ai/')).toBe('https://api.typesafe.ai');
    expect(toTypeSafeApiRoot('https://api.typesafe.ai/v1')).toBe('https://api.typesafe.ai');
    expect(toTypeSafeApiRoot('https://api.typesafe.ai/v1/systemone')).toBe('https://api.typesafe.ai');
  });
});

describe('TypeSafe image conversion', () => {
  test('format detection: PNG and JPEG only', () => {
    expect(detectTypeSafeImageFormat('iVBORw0KGgoAAA')).toBe('png');
    expect(detectTypeSafeImageFormat('/9j/4AAQ')).toBe('jpeg');
    expect(detectTypeSafeImageFormat('data:image/png;base64,iVBORw0KGgo')).toBe('png');
    expect(detectTypeSafeImageFormat('UklGRiQAAABXRUJQ')).toBeNull();
    expect(detectTypeSafeImageFormat('R0lGODlh')).toBeNull();
    expect(validateTypeSafeImages(['iVBORw0KGgo', '/9j/x'])).toBeNull();
    expect(validateTypeSafeImages(['UklGR', 'iVBORw0KGgo', 'R0lGOD'])).toContain('第 1、3 張');
    expect(validateTypeSafeImages(undefined)).toBeNull();
  });

  test('payload without images is returned unchanged', () => {
    const p = { state: 'hi', questions: { q: { type: 'noul' as const, instructions: 'q?' } } };
    expect(toTypeSafeRequest(p)).toBe(p);
    expect(typeSafeRequestHeaders(p)).toEqual({});
    expect(typeSafeRequestHeaders({ images: [] })).toEqual({});
  });

  test('string state gets one reference line per image', () => {
    const out = toTypeSafeRequest(
      {
        model: 'jev-latest',
        state: 'Broken mug',
        images: ['iVBORw0KGgoA', 'data:image/jpeg;base64,/9j/B'],
        questions: { q: { type: 'noul', instructions: 'damaged?' } },
      },
      { createRef: ref }
    );
    expect(out).toEqual({
      model: 'jev-latest',
      state: 'Broken mug\n\nImage 1: <img-0>\nImage 2: <img-1>',
      questions: { q: { type: 'noul', instructions: 'damaged?' } },
      assets: {
        '<img-0>': { type: 'image', format: 'png', data_base64: 'iVBORw0KGgoA' },
        '<img-1>': { type: 'image', format: 'jpeg', data_base64: '/9j/B' },
      },
    });
    expect('images' in out).toBe(false);
  });

  test('object, array and empty states', () => {
    expect(attachImageRefsToState({ a: 1 }, ['r'])).toEqual({ a: 1, images: ['r'] });
    expect(attachImageRefsToState({ images: 'x', images_2: 1 }, ['r'])).toEqual({
      images: 'x',
      images_2: 1,
      images_3: ['r'],
    });
    expect(attachImageRefsToState([1, 2], ['r'])).toEqual({ state: [1, 2], images: ['r'] });
    expect(attachImageRefsToState('', ['r'])).toBe('Image 1: r');
  });

  test('default references are unique per image', () => {
    const out = toTypeSafeRequest({
      state: 's',
      images: ['iVBORw0KGgo', 'iVBORw0KGgo'],
      questions: {},
    });
    const refs = Object.keys(out.assets ?? {});
    expect(refs).toHaveLength(2);
    expect(refs[0]).not.toBe(refs[1]);
    expect(refs[0]).toMatch(/^<s1-image-.+>$/);
  });

  test('header is set only when images are present', () => {
    expect(typeSafeRequestHeaders({ images: ['iVBORw0KGgo'] })).toEqual({
      'TypeSafe-Danger-Zone-Images': 'true',
    });
  });
});

describe('score level limits per provider', () => {
  const byId = (id: string) => DEFAULT_PROFILES.find((p) => p.id === id)!;

  test('documented limits', () => {
    expect(getScoreLevelLimitForProfile(byId('local-ollama-clef'))?.max).toBe(10);
    expect(getScoreLevelLimitForProfile(byId('ollama-cloud-clef'))?.max).toBe(10);
    expect(getScoreLevelLimitForProfile(byId('cloudflare-workers-ai-clef'))?.max).toBe(10);
    expect(getScoreLevelLimitForProfile(byId('gemini-decisions-api'))?.max).toBe(255);
    expect(getScoreLevelLimitForProfile(byId('typesafe-ai-jev'))).toBeUndefined();
    expect(getScoreLevelLimitForProfile(byId('s1-builtin-simulator'))).toBeUndefined();
    expect(
      getScoreLevelLimitForProfile({ id: 'c', name: 'custom', baseUrl: 'https://ollama.com' })?.max
    ).toBe(10);
  });

  const scoreItem = (levels: number): QuestionBuilderItem =>
    ({
      id: 'q1',
      key: 'urgency',
      type: 'score',
      instructions: 'How urgent?',
      choiceCriteria: [],
      scoreCriteria: Array.from({ length: levels }, (_, i) => ({ id: `l${i}`, label: `L${i}` })),
    }) as unknown as QuestionBuilderItem;

  test('validator flags levels above the provider limit', () => {
    const limit = getScoreLevelLimitForProfile(byId('ollama-cloud-clef'));
    expect(validateQuestionsBuilder([scoreItem(10)], { scoreLevelLimit: limit })).toHaveLength(0);
    const issues = validateQuestionsBuilder([scoreItem(11)], { scoreLevelLimit: limit });
    expect(issues).toHaveLength(1);
    expect(issues[0].field).toBe('criteria');
    expect(issues[0].message).toContain('Ollama 最多只接受 10 個等級');
  });

  test('no limit when the provider has none (backwards compatible call)', () => {
    expect(validateQuestionsBuilder([scoreItem(11)])).toHaveLength(0);
    expect(
      validateQuestionsBuilder([scoreItem(11)], {
        scoreLevelLimit: getScoreLevelLimitForProfile(byId('typesafe-ai-jev')),
      })
    ).toHaveLength(0);
  });
});

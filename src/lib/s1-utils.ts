import {
  EndpointProfile,
  ExecutionRunMeta,
  QuestionBuilderItem,
  S1Question,
  S1RequestPayload,
  S1ResponsePayload,
} from '@/types/systemone';

export const QUESTION_KEY_REGEX = /^[a-zA-Z0-9_.-]{1,100}$/;
export const MAX_QUESTIONS = 64;
export const MAX_IMAGES = 4;
export const MAX_SINGLE_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MiB
export const MAX_TOTAL_IMAGES_BYTES = 8 * 1024 * 1024; // 8 MiB
export const MAX_IMAGE_MEGAPIXELS = 16_000_000; // 16 MP

/**
 * Convert a Record<string, S1Question> into QuestionBuilderItem[] for GUI editing
 */
export function questionsRecordToBuilderItems(
  questions: Record<string, S1Question>
): QuestionBuilderItem[] {
  return Object.entries(questions).map(([key, q], idx) => {
    const baseId = `q-${idx}-${key}`;

    if (q.type === 'choice') {
      const choiceCriteria = Object.entries(q.criteria || {}).map(
        ([cKey, desc], cIdx) => ({
          id: `c-${idx}-${cIdx}-${cKey}`,
          key: cKey,
          description: String(desc ?? ''),
        })
      );
      return {
        id: baseId,
        key,
        type: 'choice',
        instructions: q.instructions || '',
        choiceCriteria:
          choiceCriteria.length > 0
            ? choiceCriteria
            : [
                { id: `c-def-1`, key: 'option_a', description: 'First option' },
                { id: `c-def-2`, key: 'option_b', description: 'Second option' },
              ],
        scoreCriteria: [
          { id: `s-def-1`, label: 'Low' },
          { id: `s-def-2`, label: 'Medium' },
          { id: `s-def-3`, label: 'High' },
        ],
      };
    }

    if (q.type === 'score') {
      const scoreCriteria = (q.criteria || []).map((label, sIdx) => ({
        id: `s-${idx}-${sIdx}`,
        label: String(label ?? ''),
      }));
      return {
        id: baseId,
        key,
        type: 'score',
        instructions: q.instructions || '',
        choiceCriteria: [
          { id: `c-def-1`, key: 'option_a', description: 'First option' },
          { id: `c-def-2`, key: 'option_b', description: 'Second option' },
        ],
        scoreCriteria:
          scoreCriteria.length >= 2
            ? scoreCriteria
            : [
                { id: `s-def-1`, label: 'Routine' },
                { id: `s-def-2`, label: 'Soon' },
                { id: `s-def-3`, label: 'Urgent' },
              ],
      };
    }

    return {
      id: baseId,
      key,
      type: 'noul',
      instructions: q.instructions || '',
      choiceCriteria: [
        { id: `c-def-1`, key: 'option_a', description: 'First option' },
        { id: `c-def-2`, key: 'option_b', description: 'Second option' },
      ],
      scoreCriteria: [
        { id: `s-def-1`, label: 'Routine' },
        { id: `s-def-2`, label: 'Soon' },
        { id: `s-def-3`, label: 'Urgent' },
      ],
    };
  });
}

/**
 * Convert GUI QuestionBuilderItem[] into Record<string, S1Question> preserving exact key order
 */
export function builderItemsToQuestionsRecord(
  items: QuestionBuilderItem[]
): Record<string, S1Question> {
  const result: Record<string, S1Question> = {};

  for (const item of items) {
    const trimmedKey = item.key.trim();
    if (!trimmedKey) continue;

    if (item.type === 'noul') {
      result[trimmedKey] = {
        type: 'noul',
        instructions: item.instructions,
      };
    } else if (item.type === 'choice') {
      const criteria: Record<string, string> = {};
      for (const c of item.choiceCriteria) {
        const ck = c.key.trim();
        if (ck) {
          criteria[ck] = c.description;
        }
      }
      result[trimmedKey] = {
        type: 'choice',
        instructions: item.instructions,
        criteria,
      };
    } else if (item.type === 'score') {
      result[trimmedKey] = {
        type: 'score',
        instructions: item.instructions,
        criteria: item.scoreCriteria.map((s) => s.label),
      };
    }
  }

  return result;
}

export interface ValidationIssue {
  questionId?: string;
  field: string;
  message: string;
}

/**
 * Validate Questions Builder items against SystemOne constraints
 */
export function validateQuestionsBuilder(
  items: QuestionBuilderItem[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (items.length === 0) {
    issues.push({
      field: 'questions',
      message: '至少需要定義 1 個問題 (At least 1 question is required).',
    });
  }

  if (items.length > MAX_QUESTIONS) {
    issues.push({
      field: 'questions',
      message: `單次請求最多可新增 ${MAX_QUESTIONS} 個問題 (目前 ${items.length} 個).`,
    });
  }

  const seenKeys = new Set<string>();

  for (const item of items) {
    const key = item.key.trim();
    if (!key) {
      issues.push({
        questionId: item.id,
        field: 'key',
        message: 'Question Key 不可為空.',
      });
    } else {
      if (!QUESTION_KEY_REGEX.test(key)) {
        issues.push({
          questionId: item.id,
          field: 'key',
          message: `Question Key "${key}" 格式不符，僅允許英數與 _ . - 且長度 1~100 字元.`,
        });
      }
      if (seenKeys.has(key)) {
        issues.push({
          questionId: item.id,
          field: 'key',
          message: `Question Key "${key}" 重複，每個問題識別碼必須唯一.`,
        });
      }
      seenKeys.add(key);
    }

    if (!item.instructions.trim()) {
      issues.push({
        questionId: item.id,
        field: 'instructions',
        message: `問題 "${key || '未命名'}" 的評估指示 (Instructions) 不可為空.`,
      });
    }

    if (item.type === 'choice') {
      const validCriteria = item.choiceCriteria.filter((c) => c.key.trim());
      if (validCriteria.length < 2) {
        issues.push({
          questionId: item.id,
          field: 'criteria',
          message: `Choice 問題 "${key || '未命名'}" 至少需要 2 個有效選項.`,
        });
      }
      const cKeys = new Set<string>();
      for (const c of validCriteria) {
        const ck = c.key.trim();
        if (cKeys.has(ck)) {
          issues.push({
            questionId: item.id,
            field: 'criteria',
            message: `Choice 問題 "${key}" 中包含重複的選項 Key: "${ck}".`,
          });
        }
        cKeys.add(ck);
      }
    }

    if (item.type === 'score') {
      const validLevels = item.scoreCriteria.filter((s) => s.label.trim());
      if (validLevels.length < 2) {
        issues.push({
          questionId: item.id,
          field: 'criteria',
          message: `Score 問題 "${key || '未命名'}" 最少需要 2 個等級 (Levels).`,
        });
      }
    }
  }

  return issues;
}

/**
 * Bimodal Detection for Score Results:
 * Detects when a model assigns high probability to opposing ends (e.g., first & last levels)
 * with a dip in the middle, causing the expected score to land near ~0.5 while the distribution is polarized.
 */
export interface BimodalAnalysis {
  isBimodal: boolean;
  reason?: string;
  lowEndProb: number;
  highEndProb: number;
  middleProbSum: number;
}

export function detectBimodalDistribution(
  probabilities?: number[]
): BimodalAnalysis {
  if (!probabilities || probabilities.length < 2) {
    return {
      isBimodal: false,
      lowEndProb: 0,
      highEndProb: 0,
      middleProbSum: 0,
    };
  }

  const n = probabilities.length;
  const lowEndProb = probabilities[0] ?? 0;
  const highEndProb = probabilities[n - 1] ?? 0;
  const middleProbs = n > 2 ? probabilities.slice(1, n - 1) : [];
  const middleProbSum = middleProbs.reduce((a, b) => a + b, 0);
  const maxMiddle = middleProbs.length > 0 ? Math.max(...middleProbs) : 0;

  // Case 1: 3 or more levels where both ends have >= 30% probability and exceed the middle peak
  if (
    n >= 3 &&
    lowEndProb >= 0.3 &&
    highEndProb >= 0.3 &&
    lowEndProb > maxMiddle &&
    highEndProb > maxMiddle
  ) {
    return {
      isBimodal: true,
      reason: `首尾兩端等級機率各達 ${(lowEndProb * 100).toFixed(1)}% 與 ${(highEndProb * 100).toFixed(1)}%（中間總和僅 ${(middleProbSum * 100).toFixed(1)}%），平均分可能掩蓋模型的兩極化分歧！`,
      lowEndProb,
      highEndProb,
      middleProbSum,
    };
  }

  // Case 2: Any number of levels where two non-adjacent peaks exist with a valley between them
  if (n >= 4) {
    let peaks: number[] = [];
    for (let i = 0; i < n; i++) {
      const left = i > 0 ? probabilities[i - 1] : -1;
      const right = i < n - 1 ? probabilities[i + 1] : -1;
      if (probabilities[i] >= 0.28 && probabilities[i] > left && probabilities[i] > right) {
        peaks.push(i);
      }
    }
    if (peaks.length >= 2 && peaks[peaks.length - 1] - peaks[0] >= 2) {
      return {
        isBimodal: true,
        reason: `偵測到雙峰分佈（峰值位於等級 #${peaks[0] + 1} 與 #${peaks[peaks.length - 1] + 1}），請勿僅依賴平均期望值判斷模型信心。`,
        lowEndProb,
        highEndProb,
        middleProbSum,
      };
    }
  }

  return {
    isBimodal: false,
    lowEndProb,
    highEndProb,
    middleProbSum,
  };
}

/**
 * Execute a /v1/systemone API call using either Direct Mode or Proxy Mode
 */
export async function executeSystemOneRequest(
  profile: EndpointProfile,
  payload: S1RequestPayload,
  overrideModel?: string
): Promise<ExecutionRunMeta> {
  const modelToUse = (overrideModel ?? payload.model ?? profile.defaultModel).trim();
  const finalPayload: S1RequestPayload = {
    ...payload,
    ...(modelToUse ? { model: modelToUse } : {}),
  };

  const baseUrlClean = profile.baseUrl.trim().replace(/\/+$/, '');
  const isInternalMock = baseUrlClean.startsWith('/api/');

  const targetEndpoint = baseUrlClean.endsWith('/v1/systemone')
    ? baseUrlClean
    : `${baseUrlClean}/v1/systemone`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (profile.apiKey && profile.apiKey.trim().length > 0) {
    headers['Authorization'] = `Bearer ${profile.apiKey.trim()}`;
  }

  const startTime = performance.now();

  try {
    let response: Response;

    if (profile.useProxy && !isInternalMock) {
      headers['x-s1-target-url'] = baseUrlClean;
      response = await fetch('/api/proxy', {
        method: 'POST',
        headers,
        body: JSON.stringify(finalPayload),
      });
    } else {
      response = await fetch(targetEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(finalPayload),
      });
    }

    const clientLatency = Math.round(performance.now() - startTime);
    const upstreamHeader = response.headers.get('X-S1-Upstream-Latency');
    const latencyMs = upstreamHeader ? Number(upstreamHeader) : clientLatency;

    const rawResponseText = await response.text();
    let parsedJson: S1ResponsePayload | undefined;
    let errorMsg: string | undefined;

    try {
      const parsed = JSON.parse(rawResponseText);
      if (response.ok) {
        parsedJson = parsed as S1ResponsePayload;
      } else {
        errorMsg =
          parsed?.error?.message ||
          parsed?.error ||
          parsed?.message ||
          `HTTP ${response.status}: ${response.statusText}`;
      }
    } catch {
      if (!response.ok) {
        errorMsg = rawResponseText || `HTTP ${response.status} ${response.statusText}`;
      } else {
        errorMsg = 'Response body is not valid JSON.';
      }
    }

    return {
      profileId: profile.id,
      profileName: profile.name,
      model: modelToUse || '(default)',
      status: response.status,
      statusText: response.statusText || (response.ok ? 'OK' : 'Error'),
      latencyMs,
      response: parsedJson,
      rawResponseText,
      error: errorMsg,
      timestamp: Date.now(),
    };
  } catch (err: unknown) {
    const latencyMs = Math.round(performance.now() - startTime);
    const msg =
      err instanceof Error ? err.message : 'Network or CORS error occurred';
    return {
      profileId: profile.id,
      profileName: profile.name,
      model: modelToUse || '(default)',
      status: 0,
      statusText: 'Network Error',
      latencyMs,
      error: profile.useProxy
        ? `Request failed: ${msg}`
        : `Direct fetch failed (${msg}). 若目標端點阻擋瀏覽器跨域請求 (CORS)，請開啟右上角「Proxy: ON」代理模式。`,
      timestamp: Date.now(),
    };
  }
}

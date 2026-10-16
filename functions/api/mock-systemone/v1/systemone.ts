/**
 * Cloudflare Pages Function: Built-in Sandbox Simulator for /v1/systemone
 * Automatically mounted at POST /api/mock-systemone/v1/systemone on Cloudflare Pages.
 */

interface NoulQuestion {
  type: 'noul';
  instructions: string;
}

interface ChoiceQuestion {
  type: 'choice';
  instructions: string;
  criteria: Record<string, string | null>;
}

interface ScoreQuestion {
  type: 'score';
  instructions: string;
  criteria: string[];
}

type S1Question = NoulQuestion | ChoiceQuestion | ScoreQuestion;

interface S1RequestPayload {
  model?: string;
  state: string | Record<string, unknown> | unknown[];
  images?: string[];
  questions: Record<string, S1Question>;
}

function hashString(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

export const onRequestPost = async (context: { request: Request }) => {
  try {
    const payload = (await context.request.json()) as S1RequestPayload;
    const stateStr =
      typeof payload.state === 'string'
        ? payload.state
        : JSON.stringify(payload.state ?? '');
    const lowerState = stateStr.toLowerCase();

    const answers: Record<string, unknown> = {};
    const nouls: Record<string, unknown> = {};
    const choices: Record<string, unknown> = {};
    const scores: Record<string, unknown> = {};

    for (const [key, q] of Object.entries(payload.questions || {})) {
      if (q.type === 'noul') {
        let prob = 0.5;
        const lowerKey = key.toLowerCase();
        const lowerInst = q.instructions.toLowerCase();

        if (
          lowerKey.includes('refund') ||
          lowerInst.includes('refund') ||
          lowerInst.includes('reimburse')
        ) {
          prob =
            lowerState.includes('refund') ||
            lowerState.includes('charged twice') ||
            lowerState.includes('money back')
              ? 0.996
              : 0.084;
        } else if (
          lowerKey.includes('injection') ||
          lowerKey.includes('jailbreak') ||
          lowerKey.includes('harm') ||
          lowerInst.includes('injection') ||
          lowerInst.includes('override') ||
          lowerInst.includes('harm')
        ) {
          prob =
            lowerState.includes('ignore previous') ||
            lowerState.includes('system prompt') ||
            lowerState.includes('dan ') ||
            lowerState.includes('bypass') ||
            lowerState.includes('all-customers') ||
            lowerState.includes('drop table') ||
            lowerState.includes('rm -rf')
              ? 0.988
              : 0.031;
        } else {
          const h = hashString(`${stateStr}:${key}:${q.instructions}`);
          prob = Number(((h % 960) / 1000 + 0.02).toFixed(3));
        }

        const item = { type: 'noul', noul: prob };
        answers[key] = item;
        nouls[key] = item;
      } else if (q.type === 'choice') {
        const optionKeys = Object.keys(q.criteria || {});
        if (optionKeys.length === 0) continue;

        const rawWeights = optionKeys.map((optKey, idx) => {
          const desc = (q.criteria[optKey] || '').toLowerCase();
          let score = 0.15;

          if (lowerState.includes(optKey.toLowerCase())) score += 3.8;
          if (
            optKey === 'billing' &&
            (lowerState.includes('charged') ||
              lowerState.includes('invoice') ||
              lowerState.includes('refund') ||
              lowerState.includes('payment'))
          ) {
            score += 5.2;
          }
          if (
            optKey === 'technical' &&
            (lowerState.includes('bug') ||
              lowerState.includes('crash') ||
              lowerState.includes('error') ||
              lowerState.includes('500'))
          ) {
            score += 5.0;
          }
          const words = desc.split(/\W+/).filter((w) => w.length > 4);
          for (const w of words) {
            if (lowerState.includes(w)) score += 1.4;
          }
          const h = hashString(`${stateStr}:${key}:${optKey}:${idx}`);
          score += (h % 100) / 250;
          return score;
        });

        const total = rawWeights.reduce((acc, v) => acc + v, 0) || 1;
        const probabilities: Record<string, number> = {};
        let bestKey = optionKeys[0];
        let bestProb = -1;

        optionKeys.forEach((optKey, idx) => {
          const p = Number((rawWeights[idx] / total).toFixed(4));
          probabilities[optKey] = p;
          if (p > bestProb) {
            bestProb = p;
            bestKey = optKey;
          }
        });

        const sorted = [...Object.values(probabilities)].sort((a, b) => b - a);
        const margin = sorted.length > 1 ? sorted[0] - sorted[1] : sorted[0];
        const confidence = Number(
          Math.min(0.995, Math.max(0.35, 0.55 + margin * 0.45)).toFixed(3)
        );

        const item = {
          type: 'choice',
          choice: bestKey,
          confidence,
          probabilities,
        };
        answers[key] = item;
        choices[key] = item;
      } else if (q.type === 'score') {
        const levels = q.criteria || [];
        if (levels.length < 2) continue;

        let rawProbs: number[] = [];

        if (
          lowerState.includes('bimodal') ||
          lowerState.includes('ambiguous') ||
          lowerState.includes('polarized') ||
          key.toLowerCase().includes('bimodal')
        ) {
          rawProbs = levels.map((_, idx) => {
            if (idx === 0) return 0.47;
            if (idx === levels.length - 1) return 0.48;
            return 0.05 / Math.max(1, levels.length - 2);
          });
        } else if (
          key.toLowerCase().includes('urgency') &&
          (lowerState.includes('charged twice') ||
            lowerState.includes('immediately') ||
            lowerState.includes('urgent'))
        ) {
          if (levels.length === 3) {
            rawProbs = [0.05, 0.49, 0.46];
          } else {
            rawProbs = levels.map((_, i) => (i + 1) * (i + 1));
          }
        } else {
          rawProbs = levels.map((lvl, idx) => {
            const h = hashString(`${stateStr}:${key}:${lvl}:${idx}`);
            let w = ((h % 100) + 10) / 100;
            if (lowerState.includes(lvl.toLowerCase())) w += 2.5;
            return w;
          });
        }

        const sum = rawProbs.reduce((a, b) => a + b, 0) || 1;
        const probArray = rawProbs.map((p) => Number((p / sum).toFixed(4)));

        const legend: Record<string, string> = {};
        const probMap: Record<string, number> = {};
        levels.forEach((lbl, idx) => {
          legend[String(idx)] = lbl;
          probMap[String(idx)] = probArray[idx];
        });

        const maxIdx = levels.length - 1;
        const expectedScore = probArray.reduce(
          (acc, p, idx) => acc + p * (idx / maxIdx),
          0
        );
        const variance = probArray.reduce((acc, p, idx) => {
          const pos = idx / maxIdx;
          return acc + p * Math.pow(pos - expectedScore, 2);
        }, 0);
        const confidence = Number(
          Math.max(0.22, Math.min(0.98, 1 - variance * 2.2)).toFixed(3)
        );

        const item = {
          type: 'score',
          score: Number(expectedScore.toFixed(3)),
          legend,
          probabilities: probMap,
          confidence,
        };
        answers[key] = item;
        scores[key] = item;
      }
    }

    return Response.json(
      {
        model: payload.model || 'clef',
        answers,
        nouls,
        choices,
        scores,
        usage: {
          input_tokens: Math.max(32, Math.round(stateStr.length / 3.5) + 48),
          output_tokens: Object.keys(payload.questions || {}).length,
        },
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid request JSON';
    return Response.json({ error: message }, { status: 400 });
  }
};

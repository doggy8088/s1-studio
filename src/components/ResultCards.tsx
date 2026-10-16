'use client';

import React from 'react';
import {
  ChoiceResult,
  ExecutionRunMeta,
  NoulResult,
  S1Question,
  ScoreResult,
} from '@/types/systemone';
import {
  detectBimodalDistribution,
  normalizeScoreProbabilities,
} from '@/lib/s1-utils';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Trophy,
  Sliders,
  Gauge,
  Split,
  Clock,
  Activity,
} from 'lucide-react';

interface ResultCardsProps {
  questions: Record<string, S1Question>;
  primaryRun: ExecutionRunMeta | null;
  compareRun?: ExecutionRunMeta | null;
  isCompareMode: boolean;
  noulThresholds: Record<string, number>;
  onThresholdChange: (key: string, threshold: number) => void;
}

export function ResultCards({
  questions,
  primaryRun,
  compareRun,
  isCompareMode,
  noulThresholds,
  onThresholdChange,
}: ResultCardsProps) {
  if (!primaryRun) {
    return (
      <div className="flex h-72 flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 bg-slate-900/30 p-6 text-center">
        <Activity className="h-8 w-8 text-slate-600" />
        <p className="mt-2 text-sm font-medium text-slate-300">
          尚無評估結果 (No Evaluation Results Yet)
        </p>
        <p className="mt-1 max-w-md text-xs text-slate-500">
          點擊右上角{' '}
          <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 font-mono text-indigo-300">
            Run (⌘+↵)
          </span>{' '}
          發送請求至 `/v1/systemone` 端點，即可檢視 Noul、Choice、Score
          機率分佈診斷卡與兩極化警示。
        </p>
      </div>
    );
  }

  const questionEntries = Object.entries(questions);

  return (
    <div className="space-y-4">
      {/* If A/B Compare Mode is active and both runs exist, show summary comparison header */}
      {isCompareMode && compareRun && (
        <div className="grid grid-cols-1 gap-3 rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-3.5 sm:grid-cols-2">
          <RunMetaBadge label="端點 A (Primary)" run={primaryRun} accent="indigo" />
          <RunMetaBadge label="端點 B (Compare)" run={compareRun} accent="cyan" />
        </div>
      )}

      {/* Error banner if primary or compare failed */}
      {primaryRun.error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-xs text-rose-200">
          <div className="font-semibold text-rose-300">
            [{primaryRun.profileName}] 請求失敗 ({primaryRun.status}{' '}
            {primaryRun.statusText})
          </div>
          <div className="mt-1 font-mono">{primaryRun.error}</div>
        </div>
      )}

      {isCompareMode && compareRun?.error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-xs text-rose-200">
          <div className="font-semibold text-rose-300">
            [{compareRun.profileName}] 請求失敗 ({compareRun.status}{' '}
            {compareRun.statusText})
          </div>
          <div className="mt-1 font-mono">{compareRun.error}</div>
        </div>
      )}

      {/* Render Diagnostic Cards for each question */}
      {questionEntries.map(([key, question]) => {
        const threshold = noulThresholds[key] ?? 0.5;

        if (isCompareMode && compareRun) {
          return (
            <div
              key={key}
              className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 shadow"
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <PrimitiveBadge type={question.type} />
                  <span className="font-mono text-sm font-bold text-slate-100">
                    {key}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded bg-indigo-500/15 px-2 py-0.5 text-[10px] font-medium text-indigo-300">
                    <Split className="h-3 w-3" />
                    A/B 並排對比
                  </span>
                </div>
                <span className="text-xs text-slate-400">
                  {question.instructions}
                </span>
              </div>

              {question.type === 'noul' && (
                <div className="mb-3 flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2">
                  <Sliders className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-xs font-medium text-slate-300">
                    共用 Threshold 模擬滑桿:
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={threshold}
                    onChange={(e) =>
                      onThresholdChange(key, parseFloat(e.target.value))
                    }
                    className="h-1.5 flex-1 cursor-pointer accent-emerald-400"
                  />
                  <span className="w-12 text-right font-mono text-xs font-semibold text-emerald-300">
                    {threshold.toFixed(2)}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-indigo-500/25 bg-slate-950/60 p-3">
                  <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-indigo-300">
                    <span>[A] {primaryRun.profileName}</span>
                    <span className="font-mono text-slate-400">
                      {primaryRun.model} · {primaryRun.latencyMs}ms
                    </span>
                  </div>
                  <SingleQuestionDiagnostic
                    qKey={key}
                    question={question}
                    run={primaryRun}
                    threshold={threshold}
                    onThresholdChange={(val) => onThresholdChange(key, val)}
                    hideSlider
                  />
                </div>

                <div className="rounded-lg border border-cyan-500/25 bg-slate-950/60 p-3">
                  <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-cyan-300">
                    <span>[B] {compareRun.profileName}</span>
                    <span className="font-mono text-slate-400">
                      {compareRun.model} · {compareRun.latencyMs}ms
                    </span>
                  </div>
                  <SingleQuestionDiagnostic
                    qKey={key}
                    question={question}
                    run={compareRun}
                    threshold={threshold}
                    onThresholdChange={(val) => onThresholdChange(key, val)}
                    hideSlider
                  />
                </div>
              </div>
            </div>
          );
        }

        return (
          <div
            key={key}
            className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 shadow transition hover:border-slate-700"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
              <div className="flex items-center gap-2">
                <PrimitiveBadge type={question.type} />
                <span className="font-mono text-sm font-bold text-slate-100">
                  {key}
                </span>
              </div>
              <span className="text-xs text-slate-400">
                {question.instructions}
              </span>
            </div>

            <SingleQuestionDiagnostic
              qKey={key}
              question={question}
              run={primaryRun}
              threshold={threshold}
              onThresholdChange={(val) => onThresholdChange(key, val)}
            />
          </div>
        );
      })}
    </div>
  );
}

function RunMetaBadge({
  label,
  run,
  accent,
}: {
  label: string;
  run: ExecutionRunMeta;
  accent: 'indigo' | 'cyan';
}) {
  const isOk = run.status >= 200 && run.status < 300;
  return (
    <div
      className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
        accent === 'indigo'
          ? 'border-indigo-500/30 bg-indigo-950/40'
          : 'border-cyan-500/30 bg-cyan-950/40'
      }`}
    >
      <div>
        <div className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
          {label}
        </div>
        <div className="text-xs font-bold text-slate-100">
          {run.profileName}{' '}
          <span className="font-mono font-normal text-slate-400">
            ({run.model})
          </span>
        </div>
      </div>
      <div className="text-right">
        <div
          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold ${
            isOk
              ? 'bg-emerald-500/20 text-emerald-300'
              : 'bg-rose-500/20 text-rose-300'
          }`}
        >
          {run.status || 'ERR'} {run.statusText}
        </div>
        <div className="mt-0.5 flex items-center justify-end gap-1 font-mono text-[11px] text-slate-400">
          <Clock className="h-3 w-3" />
          {run.latencyMs} ms
        </div>
      </div>
    </div>
  );
}

function PrimitiveBadge({ type }: { type: 'noul' | 'choice' | 'score' }) {
  if (type === 'noul') {
    return (
      <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 font-mono text-[11px] font-bold tracking-wider text-emerald-300 uppercase ring-1 ring-emerald-500/40">
        NOUL
      </span>
    );
  }
  if (type === 'choice') {
    return (
      <span className="rounded-md bg-indigo-500/20 px-2 py-0.5 font-mono text-[11px] font-bold tracking-wider text-indigo-300 uppercase ring-1 ring-indigo-500/40">
        CHOICE
      </span>
    );
  }
  return (
    <span className="rounded-md bg-amber-500/20 px-2 py-0.5 font-mono text-[11px] font-bold tracking-wider text-amber-300 uppercase ring-1 ring-amber-500/40">
      SCORE
    </span>
  );
}

function SingleQuestionDiagnostic({
  qKey,
  question,
  run,
  threshold,
  onThresholdChange,
  hideSlider = false,
}: {
  qKey: string;
  question: S1Question;
  run: ExecutionRunMeta;
  threshold: number;
  onThresholdChange: (val: number) => void;
  hideSlider?: boolean;
}) {
  if (!run.response) {
    return (
      <div className="py-3 text-xs text-slate-500">
        無結構化回應資料 (No structured response payload)
      </div>
    );
  }

  if (question.type === 'noul') {
    const noulRes: NoulResult | undefined = run.response.nouls?.[qKey];
    if (!noulRes) {
      return (
        <div className="py-2 text-xs text-slate-500">
          回應中未包含 `nouls[&quot;{qKey}&quot;]`
        </div>
      );
    }

    const prob = Math.max(0, Math.min(1, Number(noulRes.noul ?? 0)));
    const isPass = prob >= threshold;

    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <span className="text-xs text-slate-400">Probability:</span>
            <span className="font-mono text-xl font-bold text-slate-100">
              {prob.toFixed(3)}
            </span>
            <span className="font-mono text-xs text-slate-400">
              ({(prob * 100).toFixed(1)}%)
            </span>
          </div>

          <div
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 font-mono text-xs font-bold ring-1 ${
              isPass
                ? 'bg-emerald-500/20 text-emerald-300 ring-emerald-500/40'
                : 'bg-rose-500/20 text-rose-300 ring-rose-500/40'
            }`}
          >
            {isPass ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                TRUE (PASS &ge; {threshold.toFixed(2)})
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 text-rose-400" />
                FALSE (REJECT &lt; {threshold.toFixed(2)})
              </>
            )}
          </div>
        </div>

        {/* Horizontal Progress Bar with Threshold Marker */}
        <div className="relative h-5 w-full overflow-hidden rounded-lg bg-slate-950 ring-1 ring-slate-800">
          <div
            className={`h-full transition-all duration-300 ${
              isPass
                ? 'bg-gradient-to-r from-emerald-600 to-emerald-400'
                : 'bg-gradient-to-r from-rose-600 to-amber-500'
            }`}
            style={{ width: `${Math.min(100, Math.max(0, prob * 100))}%` }}
          />
          {/* Threshold vertical line */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_6px_rgba(255,255,255,0.9)]"
            style={{ left: `${threshold * 100}%` }}
            title={`Threshold: ${threshold.toFixed(2)}`}
          />
        </div>

        {/* Interactive Threshold Slider */}
        {!hideSlider && (
          <div className="flex items-center gap-3 rounded-lg border border-slate-800/90 bg-slate-950/70 px-3 py-2">
            <Sliders className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-xs font-medium text-slate-300">
              Threshold 模擬滑桿:
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={threshold}
              onChange={(e) => onThresholdChange(parseFloat(e.target.value))}
              className="h-1.5 flex-1 cursor-pointer accent-emerald-400"
            />
            <span className="w-12 text-right font-mono text-xs font-semibold text-emerald-300">
              {threshold.toFixed(2)}
            </span>
          </div>
        )}
      </div>
    );
  }

  if (question.type === 'choice') {
    const choiceRes: ChoiceResult | undefined = run.response.choices?.[qKey];
    if (!choiceRes) {
      return (
        <div className="py-2 text-xs text-slate-500">
          回應中未包含 `choices[&quot;{qKey}&quot;]`
        </div>
      );
    }

    const criteriaKeys = Object.keys(question.criteria || {});
    const probs = choiceRes.probabilities || {};

    // Ensure all criteria keys are shown in order
    const allKeys = Array.from(
      new Set([...criteriaKeys, ...Object.keys(probs)])
    );

    // Find 1st and 2nd place margin
    const sortedProbs = allKeys
      .map((k) => probs[k] ?? 0)
      .sort((a, b) => b - a);
    const marginPct =
      sortedProbs.length >= 2
        ? ((sortedProbs[0] - sortedProbs[1]) * 100).toFixed(1)
        : '100.0';

    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Winner:</span>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500/20 px-2.5 py-1 font-mono text-sm font-bold text-indigo-200 ring-1 ring-indigo-500/40">
              <Trophy className="h-3.5 w-3.5 text-amber-400" />
              {choiceRes.choice}
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="text-slate-400">
              領先幅度:{' '}
              <strong className="font-mono text-slate-200">+{marginPct}%</strong>
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-2.5 py-1 font-mono text-xs text-slate-200">
              <Gauge className="h-3.5 w-3.5 text-indigo-400" />
              Confidence: {Number(choiceRes.confidence ?? 0).toFixed(3)}
            </span>
          </div>
        </div>

        {/* Horizontal Probability Bars */}
        <div className="space-y-2 pt-1">
          {allKeys.map((optKey, idx) => {
            const p = Math.max(0, Math.min(1, Number(probs[optKey] ?? 0)));
            const pct = (p * 100).toFixed(1);
            const isWinner = optKey === choiceRes.choice;

            return (
              <div key={optKey} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-slate-500">
                      #{idx + 1}
                    </span>
                    <span
                      className={`font-mono ${
                        isWinner
                          ? 'font-bold text-indigo-300'
                          : 'font-medium text-slate-300'
                      }`}
                    >
                      {optKey}
                    </span>
                    {question.criteria?.[optKey] && (
                      <span className="hidden max-w-xs truncate text-[11px] text-slate-500 sm:inline">
                        — {question.criteria[optKey]}
                      </span>
                    )}
                  </div>
                  <span
                    className={`font-mono text-xs ${
                      isWinner
                        ? 'font-bold text-indigo-200'
                        : 'text-slate-400'
                    }`}
                  >
                    {pct}%
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-950 ring-1 ring-slate-800/90">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      isWinner
                        ? 'bg-gradient-to-r from-indigo-500 to-cyan-400'
                        : 'bg-slate-700'
                    }`}
                    style={{ width: `${Math.max(1, p * 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Score Question
  const scoreRes: ScoreResult | undefined = run.response.scores?.[qKey];
  if (!scoreRes) {
    return (
      <div className="py-2 text-xs text-slate-500">
        回應中未包含 `answers[&quot;{qKey}&quot;]` 或 `scores[&quot;{qKey}&quot;]`
      </div>
    );
  }

  const levels = question.criteria || [];
  const probs = normalizeScoreProbabilities(
    scoreRes.probabilities,
    levels.length
  );
  const bimodal = detectBimodalDistribution(probs);
  const maxLevelIndex = Math.max(1, levels.length - 1);
  // If score > 1 (or levels > 2), calculate normalized percentage position across levels
  const rawScore = Number(scoreRes.score ?? 0);
  const pointerPercent =
    rawScore > 1
      ? Math.min(100, Math.max(0, (rawScore / maxLevelIndex) * 100))
      : Math.min(100, Math.max(0, rawScore * 100));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="text-xs text-slate-400">Expected Score:</span>
          <span className="font-mono text-xl font-bold text-amber-300">
            {rawScore.toFixed(3)}
          </span>
          <span className="text-[11px] text-slate-500">
            (Level 0 ~ {maxLevelIndex})
          </span>
        </div>

        <span className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-2.5 py-1 font-mono text-xs text-slate-200">
          <Gauge className="h-3.5 w-3.5 text-amber-400" />
          Confidence: {Number(scoreRes.confidence ?? 0).toFixed(3)}
        </span>
      </div>

      {/* Bimodal Detection Warning Banner */}
      {bimodal.isBimodal && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/50 bg-amber-500/15 px-3 py-2.5 text-xs text-amber-200 shadow-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div>
            <div className="font-bold text-amber-300">
              ⚠️ 分佈兩極化警示 (Bimodal Distribution Detected)
            </div>
            <p className="mt-0.5 text-[11px] leading-relaxed text-amber-100/90">
              {bimodal.reason}
            </p>
          </div>
        </div>
      )}

      {/* Score Expected Value Pointer Bar */}
      <div className="relative h-2.5 w-full rounded-full bg-gradient-to-r from-slate-800 via-amber-500/40 to-amber-400 ring-1 ring-slate-800">
        <div
          className="absolute -top-1 h-4 w-2 -translate-x-1/2 rounded bg-white shadow"
          style={{
            left: `${pointerPercent}%`,
          }}
          title={`Expected Score: ${rawScore.toFixed(3)}`}
        />
      </div>

      {/* Ordered Levels Bar Chart */}
      <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-3 md:grid-cols-5">
        {levels.map((label, idx) => {
          const p = Math.max(0, Math.min(1, Number(probs[idx] ?? 0)));
          const pct = (p * 100).toFixed(1);
          const isPeak = p >= Math.max(...probs, 0.01) - 0.001;

          return (
            <div
              key={`${label}-${idx}`}
              className={`flex flex-col justify-between rounded-lg border p-2.5 ${
                isPeak
                  ? 'border-amber-500/50 bg-amber-500/10'
                  : 'border-slate-800 bg-slate-950/60'
              }`}
            >
              <div className="flex items-center justify-between text-[10px] text-slate-400">
                <span className="font-mono">Lv.{idx}</span>
                <span
                  className={`font-mono font-bold ${
                    isPeak ? 'text-amber-300' : 'text-slate-300'
                  }`}
                >
                  {pct}%
                </span>
              </div>

              {/* Vertical mini bar */}
              <div className="my-2 flex h-14 w-full items-end overflow-hidden rounded bg-slate-900 p-1">
                <div
                  className={`w-full rounded transition-all duration-300 ${
                    isPeak
                      ? 'bg-gradient-to-t from-amber-600 to-amber-300'
                      : 'bg-slate-700'
                  }`}
                  style={{ height: `${Math.max(4, p * 100)}%` }}
                />
              </div>

              <div
                className="truncate text-center text-xs font-medium text-slate-200"
                title={label}
              >
                {label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

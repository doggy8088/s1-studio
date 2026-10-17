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
  Play,
  Settings2,
  Sparkles,
} from 'lucide-react';

interface ResultCardsProps {
  questions: Record<string, S1Question>;
  primaryRun: ExecutionRunMeta | null;
  compareRun?: ExecutionRunMeta | null;
  isCompareMode: boolean;
  noulThresholds: Record<string, number>;
  onThresholdChange: (key: string, threshold: number) => void;
  onRunNow?: () => void;
  onSwitchToSimulator?: () => void;
  onOpenProfileSettings?: () => void;
  isRunning?: boolean;
}

const THRESHOLD_PRESETS = [0.3, 0.5, 0.7, 0.8, 0.9];

export function ResultCards({
  questions,
  primaryRun,
  compareRun,
  isCompareMode,
  noulThresholds,
  onThresholdChange,
  onRunNow,
  onSwitchToSimulator,
  onOpenProfileSettings,
  isRunning = false,
}: ResultCardsProps) {
  const questionEntries = Object.entries(questions);

  if (!primaryRun) {
    return (
      <div className="overflow-hidden rounded-2xl border border-[#252934] bg-[#14171f]">
        {/* Art-directed Hardware Telemetry Hero Banner */}
        <div className="relative h-56 w-full overflow-hidden border-b border-[#232732] bg-[#0b0c0e] sm:h-64">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/s1-telemetry-hero.jpg"
            alt="System-1 Precision Telemetry Instrument"
            className="h-full w-full object-cover object-center opacity-85"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#14171f] via-[#14171f]/35 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-4 p-5">
            <div>
              <span className="inline-flex items-center gap-2 rounded-md border border-amber-500/30 bg-black/75 px-2.5 py-1 font-mono text-xs font-semibold text-amber-300 backdrop-blur-md">
                <span className="h-2 w-2 rounded-full bg-amber-400" />
                TELEMETRY STANDBY · READY TO EVALUATE
              </span>
              <h3 className="mt-2 text-lg font-bold tracking-tight text-zinc-100 sm:text-xl">
                結構化決策診斷面板（已載入 {questionEntries.length} 道問題）
              </h3>
            </div>

            {onRunNow && (
              <button
                type="button"
                onClick={onRunNow}
                disabled={isRunning}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-zinc-950 shadow-lg shadow-amber-500/20 transition hover:bg-amber-400 disabled:opacity-50"
              >
                <Play className="h-4 w-4 fill-current" />
                <span>立即執行評估 (⌘+↵)</span>
              </button>
            )}
          </div>
        </div>

        {/* 3 Primitives Legend matching the 3 hardware modules */}
        <div className="grid grid-cols-1 divide-y divide-[#232732] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="p-4">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              <span className="font-mono text-xs font-bold tracking-wider text-emerald-300">
                01 · NOUL GATE
              </span>
            </div>
            <p className="mt-1.5 text-sm font-semibold text-zinc-100">
              二元機率閘門 (Boolean)
            </p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-400">
              回傳 0.000 ~ 1.000 肯定機率，支援即時調整 Threshold 切點模擬 PASS / REJECT。
            </p>
          </div>

          <div className="p-4">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-sky-400" />
              <span className="font-mono text-xs font-bold tracking-wider text-sky-300">
                02 · CHOICE ROUTER
              </span>
            </div>
            <p className="mt-1.5 text-sm font-semibold text-zinc-100">
              多選一決策路由 (Selection)
            </p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-400">
              比較各候選方案機率分佈、領先幅度與信心指數 (Confidence)，同分時依序優先。
            </p>
          </div>

          <div className="p-4">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span className="font-mono text-xs font-bold tracking-wider text-amber-300">
                03 · SCORE SPECTRUM
              </span>
            </div>
            <p className="mt-1.5 text-sm font-semibold text-zinc-100">
              有序程度量表 (Graded Scale)
            </p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-400">
              計算連續期望分數並繪製各等級機率圖，自動偵測模型猶豫或兩極化分佈 (Bimodal)。
            </p>
          </div>
        </div>
      </div>
    );
  }

  // If single mode failed with an error and has no structured response, show a dedicated actionable recovery card
  if (!isCompareMode && primaryRun.error && !primaryRun.response) {
    return (
      <div className="rounded-2xl border border-rose-500/40 bg-[#161217] p-6">
        <div className="flex items-start gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-rose-500/40 bg-rose-500/15 text-rose-400">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-rose-200">
                無法連線至端點：{primaryRun.profileName}
              </h3>
              <span className="telemetry-num rounded-md bg-rose-500/20 px-2 py-0.5 font-mono text-xs font-bold text-rose-300">
                {primaryRun.status || 'ERR'} {primaryRun.statusText}
              </span>
            </div>
            <p className="mt-1.5 font-mono text-xs text-rose-300/90">
              {primaryRun.error}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-zinc-300">
              若您尚未在本機啟動 Ollama (`ollama serve`) 或尚未設定遠端 API Key，可一鍵切換至
              <strong className="mx-1 text-amber-300">
                內建沙盒模擬器(Demo)
              </strong>
              立即體驗完整的 Noul、Choice 與 Score 結構化決策診斷。
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              {onSwitchToSimulator && (
                <button
                  type="button"
                  onClick={onSwitchToSimulator}
                  className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-zinc-950 shadow-md transition hover:bg-amber-400"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>切換至內建沙盒模擬器(Demo) 並立即執行</span>
                </button>
              )}
              {onOpenProfileSettings && (
                <button
                  type="button"
                  onClick={onOpenProfileSettings}
                  className="inline-flex items-center gap-2 rounded-xl border border-[#323746] bg-[#1a1d26] px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-[#232734]"
                >
                  <Settings2 className="h-4 w-4 text-amber-400" />
                  <span>檢查端點與連線設定</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* If A/B Compare Mode is active and both runs exist, show summary comparison header */}
      {isCompareMode && compareRun ? (
        <div className="grid grid-cols-1 gap-3 rounded-xl border border-[#2a2f3d] bg-[#14171f] p-4 sm:grid-cols-2">
          <RunMetaBadge
            label="端點 A (Primary)"
            run={primaryRun}
            accent="amber"
          />
          <RunMetaBadge
            label="端點 B (Compare)"
            run={compareRun}
            accent="sky"
          />
        </div>
      ) : (
        /* Single Run Telemetry & Executive Summary Bar */
        primaryRun.response && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#262b38] bg-[#0d0e12] px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="telemetry-num inline-flex items-center gap-1 rounded-md bg-emerald-500/20 px-2.5 py-1 font-mono text-xs font-bold text-emerald-300 ring-1 ring-emerald-500/35">
                {primaryRun.status} {primaryRun.statusText}
              </span>
              <span className="rounded-md bg-[#181b22] px-2.5 py-1 font-mono text-xs font-semibold text-zinc-200 ring-1 ring-[#2b303d]">
                Model: {primaryRun.response.model || primaryRun.model}
              </span>
              <span className="telemetry-num inline-flex items-center gap-1 rounded-md bg-[#181b22] px-2.5 py-1 font-mono text-xs font-semibold text-amber-300 ring-1 ring-[#2b303d]">
                <Clock className="h-3.5 w-3.5" />
                {primaryRun.latencyMs} ms
              </span>
            </div>

            {/* Quick Decision Chips */}
            <div className="flex flex-wrap items-center gap-2">
              {questionEntries.map(([qKey, q]) => {
                if (q.type === 'noul') {
                  const p = Number(primaryRun.response?.nouls?.[qKey]?.noul ?? 0);
                  const th = noulThresholds[qKey] ?? 0.5;
                  const pass = p >= th;
                  return (
                    <span
                      key={qKey}
                      className={`telemetry-num rounded-md px-2.5 py-1 font-mono text-xs font-semibold ${
                        pass
                          ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30'
                          : 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30'
                      }`}
                    >
                      {qKey}: {pass ? 'TRUE' : 'FALSE'} ({(p * 100).toFixed(0)}%)
                    </span>
                  );
                }
                if (q.type === 'choice') {
                  const w = primaryRun.response?.choices?.[qKey]?.choice ?? '-';
                  return (
                    <span
                      key={qKey}
                      className="rounded-md bg-sky-500/15 px-2.5 py-1 font-mono text-xs font-semibold text-sky-300 ring-1 ring-sky-500/30"
                    >
                      {qKey} → {w}
                    </span>
                  );
                }
                const sc = Number(
                  primaryRun.response?.scores?.[qKey]?.score ?? 0
                );
                return (
                  <span
                    key={qKey}
                    className="telemetry-num rounded-md bg-amber-500/15 px-2.5 py-1 font-mono text-xs font-semibold text-amber-300 ring-1 ring-amber-500/30"
                  >
                    {qKey}: {sc.toFixed(2)}
                  </span>
                );
              })}
            </div>
          </div>
        )
      )}

      {/* Error banner if primary or compare failed in compare mode */}
      {primaryRun.error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
          <div className="font-semibold text-rose-300">
            [{primaryRun.profileName}] 請求失敗 ({primaryRun.status}{' '}
            {primaryRun.statusText})
          </div>
          <div className="mt-1 font-mono text-xs">{primaryRun.error}</div>
        </div>
      )}

      {isCompareMode && compareRun?.error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
          <div className="font-semibold text-rose-300">
            [{compareRun.profileName}] 請求失敗 ({compareRun.status}{' '}
            {compareRun.statusText})
          </div>
          <div className="mt-1 font-mono text-xs">{compareRun.error}</div>
        </div>
      )}

      {/* Render Diagnostic Cards for each question */}
      {questionEntries.map(([key, question]) => {
        const threshold = noulThresholds[key] ?? 0.5;
        const leftBorder =
          question.type === 'noul'
            ? 'border-l-emerald-500'
            : question.type === 'choice'
              ? 'border-l-sky-500'
              : 'border-l-amber-500';

        if (isCompareMode && compareRun) {
          return (
            <div
              key={key}
              className={`rounded-xl border border-[#262a36] border-l-4 ${leftBorder} bg-[#14171f] p-5 shadow-sm`}
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-[#222632] pb-3">
                <div className="flex items-center gap-2.5">
                  <PrimitiveBadge type={question.type} />
                  <span className="font-mono text-base font-bold text-zinc-100">
                    {key}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-sky-500/15 px-2.5 py-0.5 text-xs font-semibold text-sky-300">
                    <Split className="h-3.5 w-3.5" />
                    A/B 並排對比
                  </span>
                </div>
                <span className="text-sm text-zinc-300">
                  {question.instructions}
                </span>
              </div>

              {question.type === 'noul' && (
                <ThresholdControlBar
                  threshold={threshold}
                  onChange={(val) => onThresholdChange(key, val)}
                  label="共用 Threshold 切點模擬"
                />
              )}

              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-amber-500/25 bg-[#0d0e12] p-4">
                  <div className="mb-3 flex items-center justify-between text-xs font-semibold text-amber-300">
                    <span>[A] {primaryRun.profileName}</span>
                    <span className="telemetry-num font-mono text-zinc-400">
                      {primaryRun.model} · {primaryRun.latencyMs} ms
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

                <div className="rounded-xl border border-sky-500/25 bg-[#0d0e12] p-4">
                  <div className="mb-3 flex items-center justify-between text-xs font-semibold text-sky-300">
                    <span>[B] {compareRun.profileName}</span>
                    <span className="telemetry-num font-mono text-zinc-400">
                      {compareRun.model} · {compareRun.latencyMs} ms
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
            className={`rounded-xl border border-[#262a36] border-l-4 ${leftBorder} bg-[#14171f] p-5 shadow-sm transition hover:border-[#343948]`}
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-[#222632] pb-3">
              <div className="flex items-center gap-2.5">
                <PrimitiveBadge type={question.type} />
                <span className="font-mono text-base font-bold text-zinc-100">
                  {key}
                </span>
              </div>
              <span className="text-sm text-zinc-300">
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

function ThresholdControlBar({
  threshold,
  onChange,
  label = 'Threshold 決策切點模擬',
}: {
  threshold: number;
  onChange: (val: number) => void;
  label?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#252935] bg-[#0d0e12] px-3.5 py-2.5">
      <div className="flex items-center gap-2">
        <Sliders className="h-4 w-4 text-emerald-400" />
        <span className="text-xs font-semibold text-zinc-300">{label}:</span>
      </div>

      <div className="flex min-w-[180px] flex-1 items-center gap-3">
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={threshold}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          aria-label={label}
          className="h-2 flex-1 cursor-pointer accent-emerald-400"
        />
        <span className="telemetry-num w-14 rounded-md bg-emerald-500/15 px-2 py-0.5 text-center font-mono text-sm font-bold text-emerald-300 ring-1 ring-emerald-500/30">
          {threshold.toFixed(2)}
        </span>
      </div>

      <div className="flex items-center gap-1">
        {THRESHOLD_PRESETS.map((preset) => {
          const isActive = Math.abs(threshold - preset) < 0.005;
          return (
            <button
              key={preset}
              type="button"
              onClick={() => onChange(preset)}
              className={`telemetry-num rounded px-2 py-1 font-mono text-xs font-medium transition ${
                isActive
                  ? 'bg-emerald-500 font-bold text-zinc-950'
                  : 'bg-[#181b22] text-zinc-400 hover:bg-[#232732] hover:text-zinc-200'
              }`}
            >
              {preset.toFixed(2)}
            </button>
          );
        })}
      </div>
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
  accent: 'amber' | 'sky';
}) {
  const isOk = run.status >= 200 && run.status < 300;
  return (
    <div
      className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
        accent === 'amber'
          ? 'border-amber-500/30 bg-amber-950/20'
          : 'border-sky-500/30 bg-sky-950/20'
      }`}
    >
      <div>
        <div className="text-xs font-semibold tracking-wider text-zinc-400 uppercase">
          {label}
        </div>
        <div className="mt-0.5 text-sm font-bold text-zinc-100">
          {run.profileName}{' '}
          <span className="font-mono font-normal text-zinc-400">
            ({run.model})
          </span>
        </div>
      </div>
      <div className="text-right">
        <div
          className={`telemetry-num inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-xs font-bold ${
            isOk
              ? 'bg-emerald-500/20 text-emerald-300'
              : 'bg-rose-500/20 text-rose-300'
          }`}
        >
          {run.status || 'ERR'} {run.statusText}
        </div>
        <div className="telemetry-num mt-1 flex items-center justify-end gap-1 font-mono text-xs text-zinc-400">
          <Clock className="h-3.5 w-3.5" />
          {run.latencyMs} ms
        </div>
      </div>
    </div>
  );
}

function PrimitiveBadge({ type }: { type: 'noul' | 'choice' | 'score' }) {
  if (type === 'noul') {
    return (
      <span className="rounded-md bg-emerald-500/15 px-2.5 py-1 font-mono text-xs font-bold tracking-wider text-emerald-300 uppercase ring-1 ring-emerald-500/35">
        NOUL
      </span>
    );
  }
  if (type === 'choice') {
    return (
      <span className="rounded-md bg-sky-500/15 px-2.5 py-1 font-mono text-xs font-bold tracking-wider text-sky-300 uppercase ring-1 ring-sky-500/35">
        CHOICE
      </span>
    );
  }
  return (
    <span className="rounded-md bg-amber-500/15 px-2.5 py-1 font-mono text-xs font-bold tracking-wider text-amber-300 uppercase ring-1 ring-amber-500/35">
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
      <div className="py-4 text-sm text-zinc-500">
        無結構化回應資料 (No structured response payload)
      </div>
    );
  }

  if (question.type === 'noul') {
    const noulRes: NoulResult | undefined = run.response.nouls?.[qKey];
    if (!noulRes) {
      return (
        <div className="py-2 text-sm text-zinc-500">
          回應中未包含 `nouls[&quot;{qKey}&quot;]`
        </div>
      );
    }

    const prob = Math.max(0, Math.min(1, Number(noulRes.noul ?? 0)));
    const isPass = prob >= threshold;

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-2.5">
            <span className="text-sm font-medium text-zinc-400">
              Probability 肯定機率:
            </span>
            <span className="telemetry-num font-mono text-2xl font-bold text-zinc-100 sm:text-3xl">
              {prob.toFixed(3)}
            </span>
            <span className="telemetry-num font-mono text-sm font-semibold text-zinc-400">
              ({(prob * 100).toFixed(1)}%)
            </span>
          </div>

          <div
            className={`telemetry-num inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 font-mono text-sm font-bold ring-1 ${
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
        <div className="relative h-6 w-full overflow-hidden rounded-lg bg-[#0b0c0e] ring-1 ring-[#272c38]">
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
            className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_8px_rgba(255,255,255,0.95)]"
            style={{ left: `${threshold * 100}%` }}
            title={`Threshold: ${threshold.toFixed(2)}`}
          />
        </div>

        {/* Interactive Threshold Slider + Quick Presets */}
        {!hideSlider && (
          <ThresholdControlBar
            threshold={threshold}
            onChange={onThresholdChange}
          />
        )}
      </div>
    );
  }

  if (question.type === 'choice') {
    const choiceRes: ChoiceResult | undefined = run.response.choices?.[qKey];
    if (!choiceRes) {
      return (
        <div className="py-2 text-sm text-zinc-500">
          回應中未包含 `choices[&quot;{qKey}&quot;]`
        </div>
      );
    }

    const criteriaKeys = Object.keys(question.criteria || {});
    const probs = choiceRes.probabilities || {};

    const allKeys = Array.from(
      new Set([...criteriaKeys, ...Object.keys(probs)])
    );

    const sortedProbs = allKeys
      .map((k) => probs[k] ?? 0)
      .sort((a, b) => b - a);
    const marginPct =
      sortedProbs.length >= 2
        ? ((sortedProbs[0] - sortedProbs[1]) * 100).toFixed(1)
        : '100.0';

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="text-sm font-medium text-zinc-400">
              Selected Route 勝出選項:
            </span>
            <span className="inline-flex items-center gap-2 rounded-lg bg-sky-500/15 px-3.5 py-1.5 font-mono text-base font-bold text-sky-200 ring-1 ring-sky-500/40">
              <Trophy className="h-4 w-4 text-amber-400" />
              {choiceRes.choice}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-zinc-400">
              領先差距:{' '}
              <strong className="telemetry-num font-mono text-zinc-100">
                +{marginPct}%
              </strong>
            </span>
            <span className="telemetry-num inline-flex items-center gap-1.5 rounded-lg border border-[#2a2f3d] bg-[#0d0e12] px-3 py-1 font-mono text-xs font-semibold text-zinc-200">
              <Gauge className="h-4 w-4 text-sky-400" />
              Confidence: {Number(choiceRes.confidence ?? 0).toFixed(3)}
            </span>
          </div>
        </div>

        {/* Horizontal Probability Bars */}
        <div className="space-y-3 pt-1">
          {allKeys.map((optKey, idx) => {
            const p = Math.max(0, Math.min(1, Number(probs[optKey] ?? 0)));
            const pct = (p * 100).toFixed(1);
            const isWinner = optKey === choiceRes.choice;

            return (
              <div key={optKey} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="telemetry-num font-mono text-xs font-semibold text-zinc-500">
                      #{idx + 1}
                    </span>
                    <span
                      className={`font-mono ${
                        isWinner
                          ? 'font-bold text-sky-300'
                          : 'font-medium text-zinc-200'
                      }`}
                    >
                      {optKey}
                    </span>
                    {question.criteria?.[optKey] && (
                      <span className="hidden truncate text-xs text-zinc-400 sm:inline">
                        — {question.criteria[optKey]}
                      </span>
                    )}
                  </div>
                  <span
                    className={`telemetry-num shrink-0 font-mono text-sm ${
                      isWinner ? 'font-bold text-sky-200' : 'text-zinc-400'
                    }`}
                  >
                    {pct}%
                  </span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-[#0b0c0e] ring-1 ring-[#252a36]">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      isWinner
                        ? 'bg-gradient-to-r from-sky-500 to-emerald-400'
                        : 'bg-[#2c3242]'
                    }`}
                    style={{ width: `${Math.max(1.5, p * 100)}%` }}
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
      <div className="py-2 text-sm text-zinc-500">
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
  const rawScore = Number(scoreRes.score ?? 0);
  const pointerPercent =
    rawScore > 1
      ? Math.min(100, Math.max(0, (rawScore / maxLevelIndex) * 100))
      : Math.min(100, Math.max(0, rawScore * 100));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2.5">
          <span className="text-sm font-medium text-zinc-400">
            Expected Score 期望評分:
          </span>
          <span className="telemetry-num font-mono text-2xl font-bold text-amber-300 sm:text-3xl">
            {rawScore.toFixed(3)}
          </span>
          <span className="font-mono text-xs text-zinc-400">
            (Scale: 0.000 ~ 1.000 · {levels.length} 級)
          </span>
        </div>

        <span className="telemetry-num inline-flex items-center gap-1.5 rounded-lg border border-[#2a2f3d] bg-[#0d0e12] px-3 py-1 font-mono text-xs font-semibold text-zinc-200">
          <Gauge className="h-4 w-4 text-amber-400" />
          Confidence: {Number(scoreRes.confidence ?? 0).toFixed(3)}
        </span>
      </div>

      {/* Bimodal Detection Warning Banner */}
      {bimodal.isBimodal && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/45 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <div>
            <div className="font-bold text-amber-300">
              分佈兩極化警示 (Bimodal Distribution Detected)
            </div>
            <p className="mt-1 text-xs leading-relaxed text-amber-100/90">
              {bimodal.reason}
            </p>
          </div>
        </div>
      )}

      {/* Score Expected Value Pointer Bar */}
      <div className="relative h-3 w-full rounded-full bg-gradient-to-r from-[#1c2029] via-amber-500/40 to-amber-400 ring-1 ring-[#2a2f3c]">
        <div
          className="absolute -top-1.5 h-6 w-2.5 -translate-x-1/2 rounded-sm bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)]"
          style={{
            left: `${pointerPercent}%`,
          }}
          title={`Expected Score: ${rawScore.toFixed(3)}`}
        />
      </div>

      {/* Ordered Levels Bar Chart */}
      <div className="grid grid-cols-2 gap-2.5 pt-1 sm:grid-cols-3 md:grid-cols-5">
        {levels.map((label, idx) => {
          const p = Math.max(0, Math.min(1, Number(probs[idx] ?? 0)));
          const pct = (p * 100).toFixed(1);
          const isPeak = p >= Math.max(...probs, 0.01) - 0.001;

          return (
            <div
              key={`${label}-${idx}`}
              className={`flex flex-col justify-between rounded-xl border p-3 ${
                isPeak
                  ? 'border-amber-500/50 bg-amber-500/10'
                  : 'border-[#242834] bg-[#0d0e12]'
              }`}
            >
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span className="font-mono font-medium">Lv.{idx}</span>
                <span
                  className={`telemetry-num font-mono font-bold ${
                    isPeak ? 'text-amber-300' : 'text-zinc-200'
                  }`}
                >
                  {pct}%
                </span>
              </div>

              {/* Vertical bar */}
              <div className="my-2.5 flex h-16 w-full items-end overflow-hidden rounded-lg bg-[#14171f] p-1">
                <div
                  className={`w-full rounded transition-all duration-300 ${
                    isPeak
                      ? 'bg-gradient-to-t from-amber-600 to-amber-300'
                      : 'bg-[#2c3242]'
                  }`}
                  style={{ height: `${Math.max(5, p * 100)}%` }}
                />
              </div>

              <div
                className="truncate text-center text-sm font-semibold text-zinc-100"
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

'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  EndpointProfile,
  ExecutionRunMeta,
  QuestionBuilderItem,
  S1Question,
  S1RequestPayload,
  UploadedImageItem,
} from '@/types/systemone';
import { BUILT_IN_PRESETS, DEFAULT_PROFILES } from '@/lib/presets';
import {
  addHistoryEntry,
  loadActiveProfileId,
  loadProfilesFromLocalStorage,
  saveActiveProfileId,
  saveProfilesToLocalStorage,
} from '@/lib/db';
import {
  builderItemsToQuestionsRecord,
  executeSystemOneRequest,
  questionsRecordToBuilderItems,
  validateQuestionsBuilder,
} from '@/lib/s1-utils';
import { generateCurlSnippet } from '@/lib/code-exporter';
import { JsonCodeEditor } from './JsonCodeEditor';
import { ImageDropzone } from './ImageDropzone';
import { QuestionsBuilder } from './QuestionsBuilder';
import { ResultCards } from './ResultCards';
import { CodeExportPanel } from './CodeExportPanel';
import { ProfileManagerModal } from './ProfileManagerModal';
import { PresetsAndHistoryModal } from './PresetsAndHistoryModal';
import {
  Play,
  Settings2,
  Bookmark,
  History,
  Split,
  Terminal,
  Copy,
  Check,
  ShieldCheck,
  Globe,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
  Sparkles,
  FileJson,
  Code2,
  Layers,
  Clock,
} from 'lucide-react';

export function S1StudioApp() {
  // -------------------------------------------------------------------------
  // 1. Endpoint Profiles & Compare Mode State
  // -------------------------------------------------------------------------
  const [profiles, setProfiles] = useState<EndpointProfile[]>(() =>
    loadProfilesFromLocalStorage()
  );
  const [activeProfileId, setActiveProfileId] = useState<string>(() => {
    const loaded = loadProfilesFromLocalStorage();
    const saved = loadActiveProfileId();
    return loaded.some((p) => p.id === saved) ? saved : loaded[0].id;
  });
  const [isCompareMode, setIsCompareMode] = useState<boolean>(false);
  const [compareProfileId, setCompareProfileId] = useState<string>(
    DEFAULT_PROFILES[3]?.id || DEFAULT_PROFILES[1].id
  );
  const [showInlineApiKey, setShowInlineApiKey] = useState<boolean>(false);

  // Modals
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [presetsHistoryModal, setPresetsHistoryModal] = useState<{
    open: boolean;
    tab: 'presets' | 'history';
  }>({ open: false, tab: 'presets' });

  // -------------------------------------------------------------------------
  // 2. Request Builder State (State, Images, Questions)
  // -------------------------------------------------------------------------
  const initialPreset = BUILT_IN_PRESETS[0];
  const [stateMode, setStateMode] = useState<'text' | 'json'>(
    initialPreset.stateMode
  );
  const [stateText, setStateText] = useState<string>(initialPreset.stateText);
  const [images, setImages] = useState<UploadedImageItem[]>(
    initialPreset.images || []
  );
  const [questionItems, setQuestionItems] = useState<QuestionBuilderItem[]>(
    () => questionsRecordToBuilderItems(initialPreset.questions)
  );

  // -------------------------------------------------------------------------
  // 3. Evaluation Results & Right Panel Tabs
  // -------------------------------------------------------------------------
  const [rightTab, setRightTab] = useState<'visual' | 'raw' | 'code'>('visual');
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [primaryRun, setPrimaryRun] = useState<ExecutionRunMeta | null>(null);
  const [compareRun, setCompareRun] = useState<ExecutionRunMeta | null>(null);
  const [noulThresholds, setNoulThresholds] = useState<Record<string, number>>({
    refund: 0.8,
    prompt_injection: 0.5,
  });
  const [copiedCurlQuick, setCopiedCurlQuick] = useState(false);

  const activeProfile = useMemo(
    () => profiles.find((p) => p.id === activeProfileId) || profiles[0],
    [profiles, activeProfileId]
  );

  const compareProfile = useMemo(
    () =>
      profiles.find((p) => p.id === compareProfileId) ||
      profiles.find((p) => p.id !== activeProfile.id) ||
      profiles[0],
    [profiles, compareProfileId, activeProfile.id]
  );

  const handleSaveProfiles = (
    updated: EndpointProfile[],
    nextActiveId?: string
  ) => {
    setProfiles(updated);
    saveProfilesToLocalStorage(updated);
    if (nextActiveId) {
      setActiveProfileId(nextActiveId);
      saveActiveProfileId(nextActiveId);
    }
  };

  const updateActiveProfileInline = (patch: Partial<EndpointProfile>) => {
    const next = profiles.map((p) =>
      p.id === activeProfile.id ? { ...p, ...patch } : p
    );
    handleSaveProfiles(next);
  };

  // -------------------------------------------------------------------------
  // 4. Construct Payload & Validate State / Questions
  // -------------------------------------------------------------------------
  const stateJsonValidation = useMemo(() => {
    if (stateMode === 'text') {
      return { valid: true, parsed: stateText, error: null as string | null };
    }
    try {
      const parsed = JSON.parse(stateText);
      return { valid: true, parsed, error: null as string | null };
    } catch (err) {
      return {
        valid: false,
        parsed: stateText,
        error: err instanceof Error ? err.message : 'Invalid JSON in State',
      };
    }
  }, [stateMode, stateText]);

  const questionsRecord = useMemo(
    () => builderItemsToQuestionsRecord(questionItems),
    [questionItems]
  );

  const validationIssues = useMemo(
    () => validateQuestionsBuilder(questionItems),
    [questionItems]
  );

  const constructedPayload: S1RequestPayload = useMemo(() => {
    const payload: S1RequestPayload = {
      ...(activeProfile.defaultModel.trim()
        ? { model: activeProfile.defaultModel.trim() }
        : {}),
      state:
        stateMode === 'json' && stateJsonValidation.valid
          ? stateJsonValidation.parsed
          : stateText,
      questions: questionsRecord,
    };

    if (images.length > 0) {
      payload.images = images.map((img) => img.rawBase64);
    }

    return payload;
  }, [
    activeProfile.defaultModel,
    stateMode,
    stateJsonValidation,
    stateText,
    questionsRecord,
    images,
  ]);

  // -------------------------------------------------------------------------
  // 5. Execute Request (Single or A/B Parallel Compare)
  // -------------------------------------------------------------------------
  const handleRunEvaluation = useCallback(async () => {
    if (isRunning) return;
    if (stateMode === 'json' && !stateJsonValidation.valid) {
      return;
    }
    if (validationIssues.length > 0) {
      return;
    }

    setIsRunning(true);
    try {
      if (isCompareMode && compareProfile) {
        const [resA, resB] = await Promise.all([
          executeSystemOneRequest(activeProfile, constructedPayload),
          executeSystemOneRequest(
            compareProfile,
            constructedPayload,
            compareProfile.defaultModel
          ),
        ]);
        setPrimaryRun(resA);
        setCompareRun(resB);

        await addHistoryEntry({
          timestamp: Date.now(),
          profileName: activeProfile.name,
          model: activeProfile.defaultModel || '(default)',
          stateMode,
          stateText,
          imagesCount: images.length,
          requestPayload: constructedPayload,
          primaryRun: resA,
          compareRun: resB,
        });
      } else {
        const resA = await executeSystemOneRequest(
          activeProfile,
          constructedPayload
        );
        setPrimaryRun(resA);
        setCompareRun(null);

        await addHistoryEntry({
          timestamp: Date.now(),
          profileName: activeProfile.name,
          model: activeProfile.defaultModel || '(default)',
          stateMode,
          stateText,
          imagesCount: images.length,
          requestPayload: constructedPayload,
          primaryRun: resA,
        });
      }
    } finally {
      setIsRunning(false);
    }
  }, [
    isRunning,
    stateMode,
    stateJsonValidation.valid,
    validationIssues.length,
    isCompareMode,
    compareProfile,
    activeProfile,
    constructedPayload,
    stateText,
    images.length,
  ]);

  // Keyboard shortcut Cmd+Enter / Ctrl+Enter to Run
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleRunEvaluation();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleRunEvaluation]);

  const handleQuickCopyCurl = async () => {
    const curl = generateCurlSnippet(activeProfile, constructedPayload, {
      includeRawApiKey: false,
      noulThresholds,
    });
    await navigator.clipboard.writeText(curl);
    setCopiedCurlQuick(true);
    setTimeout(() => setCopiedCurlQuick(false), 1800);
  };

  const applyPresetData = (data: {
    stateMode: 'text' | 'json';
    stateText: string;
    images?: UploadedImageItem[];
    questions: Record<string, S1Question>;
  }) => {
    setStateMode(data.stateMode);
    setStateText(data.stateText);
    setImages(data.images || []);
    setQuestionItems(questionsRecordToBuilderItems(data.questions));
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100 selection:bg-indigo-500/30">
      {/* ================================================================= */}
      {/* TOP NAVIGATION & ENDPOINT BAR                                     */}
      {/* ================================================================= */}
      <header className="sticky top-0 z-30 border-b border-slate-800/90 bg-slate-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1680px] flex-wrap items-center justify-between gap-3 px-4 py-2.5">
          {/* Brand & Quick Preset Switcher */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-500 font-mono text-sm font-black text-white shadow">
                S1
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold tracking-tight text-white">
                    S1 Studio
                  </span>
                  <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-indigo-300">
                    /v1/systemone
                  </span>
                </div>
                <p className="hidden text-[10px] text-slate-400 sm:block">
                  Vendor-Neutral Decision Primitives Sandbox
                </p>
              </div>
            </div>

            <div className="h-5 w-px bg-slate-800" />

            {/* Presets & History Triggers */}
            <button
              type="button"
              onClick={() =>
                setPresetsHistoryModal({ open: true, tab: 'presets' })
              }
              className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition hover:border-indigo-500/50 hover:bg-slate-800"
            >
              <Bookmark className="h-3.5 w-3.5 text-indigo-400" />
              <span>Presets 範本</span>
            </button>

            <button
              type="button"
              onClick={() =>
                setPresetsHistoryModal({ open: true, tab: 'history' })
              }
              className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition hover:border-indigo-500/50 hover:bg-slate-800"
            >
              <History className="h-3.5 w-3.5 text-cyan-400" />
              <span>History</span>
            </button>
          </div>

          {/* Endpoint Profile Controls & Run Action */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Primary Profile Selector */}
            <div className="flex items-center rounded-lg border border-slate-800 bg-slate-900 p-1">
              <span className="px-2 text-[11px] font-medium text-slate-400">
                Profile:
              </span>
              <select
                value={activeProfile.id}
                onChange={(e) => {
                  setActiveProfileId(e.target.value);
                  saveActiveProfileId(e.target.value);
                }}
                aria-label="Select active endpoint profile"
                className="rounded bg-slate-950 px-2 py-1 text-xs font-semibold text-indigo-200 focus:outline-none"
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>

              {/* Inline Model input */}
              <input
                type="text"
                value={activeProfile.defaultModel}
                onChange={(e) =>
                  updateActiveProfileInline({ defaultModel: e.target.value })
                }
                placeholder="Model (e.g. clef)"
                title="當前模型名稱 (Model Name)"
                className="ml-1.5 w-28 rounded border border-slate-800 bg-slate-950 px-2 py-1 font-mono text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
              />

              {/* Inline API Key quick field */}
              <div className="relative ml-1.5 hidden items-center lg:flex">
                <input
                  type={showInlineApiKey ? 'text' : 'password'}
                  value={activeProfile.apiKey}
                  onChange={(e) =>
                    updateActiveProfileInline({ apiKey: e.target.value })
                  }
                  placeholder="API Key (選填)"
                  className="w-28 rounded border border-slate-800 bg-slate-950 py-1 pr-6 pl-2 font-mono text-[11px] text-slate-300 focus:border-indigo-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowInlineApiKey((s) => !s)}
                  className="absolute right-1.5 text-slate-500 hover:text-slate-300"
                  title="顯示/隱藏 API Key"
                >
                  {showInlineApiKey ? (
                    <EyeOff className="h-3 w-3" />
                  ) : (
                    <Eye className="h-3 w-3" />
                  )}
                </button>
              </div>

              {/* Manage Profiles Modal Button */}
              <button
                type="button"
                onClick={() => setIsProfileModalOpen(true)}
                className="ml-1 rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                title="管理所有端點設定檔 (Endpoint Profiles)"
              >
                <Settings2 className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* CORS Proxy Toggle */}
            <button
              type="button"
              onClick={() =>
                updateActiveProfileInline({
                  useProxy: !activeProfile.useProxy,
                })
              }
              title={
                activeProfile.useProxy
                  ? 'Proxy Mode: 透過內建無狀態 Edge API 轉發請求以解決 CORS 阻擋'
                  : 'Direct Mode: 由瀏覽器直接 fetch 呼叫目標端點'
              }
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                activeProfile.useProxy
                  ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                  : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
              }`}
            >
              {activeProfile.useProxy ? (
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Globe className="h-3.5 w-3.5 text-amber-400" />
              )}
              <span>Proxy: {activeProfile.useProxy ? 'ON' : 'OFF'}</span>
            </button>

            {/* A/B Compare Mode Toggle */}
            <button
              type="button"
              onClick={() => setIsCompareMode((v) => !v)}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                isCompareMode
                  ? 'border-cyan-500/50 bg-cyan-500/20 text-cyan-200'
                  : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
              }`}
              title="開啟 A/B 端點對比模式，平行發送請求至兩個 Profile"
            >
              <Split className="h-3.5 w-3.5" />
              <span>A/B 對比</span>
            </button>

            {isCompareMode && (
              <select
                value={compareProfile.id}
                onChange={(e) => setCompareProfileId(e.target.value)}
                aria-label="Select secondary comparison endpoint profile"
                className="rounded-lg border border-cyan-500/40 bg-cyan-950/50 px-2.5 py-1.5 text-xs font-semibold text-cyan-200 focus:outline-none"
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    vs: {p.name} ({p.defaultModel})
                  </option>
                ))}
              </select>
            )}

            {/* Quick Copy cURL | jq button */}
            <button
              type="button"
              onClick={handleQuickCopyCurl}
              className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition hover:border-slate-700 hover:bg-slate-800"
              title="一鍵複製 curl -s ... | jq 指令"
            >
              {copiedCurlQuick ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-emerald-300">Copied cURL</span>
                </>
              ) : (
                <>
                  <Terminal className="h-3.5 w-3.5 text-slate-400" />
                  <span className="hidden xl:inline">cURL | jq</span>
                </>
              )}
            </button>

            {/* Primary Run Button */}
            <button
              type="button"
              onClick={handleRunEvaluation}
              disabled={
                isRunning ||
                (stateMode === 'json' && !stateJsonValidation.valid) ||
                validationIssues.length > 0
              }
              className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-indigo-500 px-4 py-1.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/25 transition hover:from-indigo-500 hover:to-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Evaluating...</span>
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 fill-current" />
                  <span>Run (⌘+↵)</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Quick Built-in Preset Bar */}
        <div className="border-t border-slate-900 bg-slate-950/80 px-4 py-1.5">
          <div className="mx-auto flex max-w-[1680px] flex-wrap items-center justify-between gap-2 text-[11px]">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="flex items-center gap-1 font-medium text-slate-400">
                <Sparkles className="h-3 w-3 text-amber-400" />
                快速載入測試場景：
              </span>
              {BUILT_IN_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() =>
                    applyPresetData({
                      stateMode: preset.stateMode,
                      stateText: preset.stateText,
                      images: preset.images || [],
                      questions: preset.questions,
                    })
                  }
                  className="rounded-md border border-slate-800/90 bg-slate-900/90 px-2 py-0.5 text-slate-300 transition hover:border-indigo-500/50 hover:bg-indigo-500/15 hover:text-indigo-200"
                >
                  {preset.name.split(' (')[0]}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 text-slate-500">
              <span>
                當前目標：
                <code className="ml-1 font-mono text-slate-300">
                  {activeProfile.baseUrl.replace(/\/+$/, '')}/v1/systemone
                </code>
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* ================================================================= */}
      {/* MAIN TWO-COLUMN DESKTOP WORKSPACE                                 */}
      {/* ================================================================= */}
      <main className="mx-auto grid w-full max-w-[1680px] flex-1 grid-cols-1 gap-5 p-4 lg:grid-cols-12">
        {/* --------------------------------------------------------------- */}
        {/* LEFT COLUMN: REQUEST BUILDER (State + Multimodal + Questions)   */}
        {/* --------------------------------------------------------------- */}
        <section className="space-y-4 lg:col-span-6">
          {/* 1. State Input Card */}
          <div className="rounded-xl border border-slate-800/90 bg-slate-900/50 p-4 shadow">
            <div className="mb-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-semibold tracking-wide text-slate-200 uppercase">
                  State 狀態輸入
                </h2>
                <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                  {stateMode === 'json'
                    ? 'JSON Object / Array'
                    : 'Plain Text String'}
                </span>
              </div>

              {/* Text | JSON Mode Switcher */}
              <div className="inline-flex rounded-lg border border-slate-800 bg-slate-950 p-0.5">
                <button
                  type="button"
                  onClick={() => setStateMode('text')}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    stateMode === 'text'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Text Mode
                </button>
                <button
                  type="button"
                  onClick={() => {
                    // Format nicely if valid JSON, otherwise wrap string into JSON object if plain text
                    if (stateMode === 'text') {
                      try {
                        JSON.parse(stateText);
                      } catch {
                        // Keep raw text so user can edit or wrap
                      }
                    }
                    setStateMode('json');
                  }}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    stateMode === 'json'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  JSON Mode
                </button>
              </div>
            </div>

            {stateMode === 'text' ? (
              <textarea
                rows={5}
                value={stateText}
                onChange={(e) => setStateText(e.target.value)}
                placeholder="輸入待評估的純文字狀態 (State)..."
                className="w-full rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-100 focus:border-indigo-500 focus:outline-none"
              />
            ) : (
              <div className="space-y-2">
                <JsonCodeEditor
                  value={stateText}
                  onChange={setStateText}
                  minHeight="130px"
                  maxHeight="320px"
                />
                {!stateJsonValidation.valid && (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                    <div className="flex items-center gap-1.5">
                      <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                      <span>
                        JSON 格式錯誤：{stateJsonValidation.error}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setStateText(
                          JSON.stringify({ content: stateText }, null, 2)
                        )
                      }
                      className="shrink-0 rounded bg-rose-500/20 px-2 py-1 text-[11px] font-semibold text-rose-200 hover:bg-rose-500/30"
                    >
                      自動封裝為 JSON 物件
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 2. Multimodal Images Dropzone */}
          <ImageDropzone images={images} onChange={setImages} />

          {/* 3. Questions Builder */}
          <div className="rounded-xl border border-slate-800/90 bg-slate-900/50 p-4 shadow">
            <QuestionsBuilder
              items={questionItems}
              onChange={setQuestionItems}
            />

            {/* Validation Issues Summary */}
            {validationIssues.length > 0 && (
              <div className="mt-3 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">
                <div className="flex items-center gap-1.5 font-semibold text-rose-300">
                  <AlertCircle className="h-4 w-4" />
                  請修正以下問題設定後再發送請求：
                </div>
                <ul className="mt-1.5 list-inside list-disc space-y-1 text-[11px]">
                  {validationIssues.map((iss, idx) => (
                    <li key={idx}>{iss.message}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>

        {/* --------------------------------------------------------------- */}
        {/* RIGHT COLUMN: EVALUATION RESULTS, RAW PAYLOAD & CODE EXPORTER   */}
        {/* --------------------------------------------------------------- */}
        <section className="space-y-4 lg:col-span-6">
          <div className="rounded-xl border border-slate-800/90 bg-slate-900/50 p-4 shadow">
            {/* Status Bar & Right View Switcher */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-xs font-semibold tracking-wide text-slate-200 uppercase">
                  Evaluation Results 評估結果
                </h2>

                {primaryRun && (
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-xs font-bold ${
                        primaryRun.status >= 200 && primaryRun.status < 300
                          ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40'
                          : 'bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/40'
                      }`}
                    >
                      Status: {primaryRun.status || 'ERR'}{' '}
                      {primaryRun.statusText}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-2 py-0.5 font-mono text-xs text-slate-300">
                      <Clock className="h-3 w-3 text-indigo-400" />
                      Latency: {primaryRun.latencyMs} ms
                    </span>
                  </div>
                )}
              </div>

              {/* Tabs: Visual Cards | Raw Response | Code Exporter */}
              <div className="inline-flex rounded-lg border border-slate-800 bg-slate-950 p-0.5">
                <button
                  type="button"
                  onClick={() => setRightTab('visual')}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    rightTab === 'visual'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Layers className="h-3.5 w-3.5" />
                  Visual Cards
                </button>
                <button
                  type="button"
                  onClick={() => setRightTab('raw')}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    rightTab === 'raw'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <FileJson className="h-3.5 w-3.5" />
                  Raw Payload
                </button>
                <button
                  type="button"
                  onClick={() => setRightTab('code')}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    rightTab === 'code'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Code2 className="h-3.5 w-3.5" />
                  Code Exporter
                </button>
              </div>
            </div>

            {/* Tab Contents */}
            {rightTab === 'visual' && (
              <ResultCards
                questions={questionsRecord}
                primaryRun={primaryRun}
                compareRun={compareRun}
                isCompareMode={isCompareMode}
                noulThresholds={noulThresholds}
                onThresholdChange={(key, val) =>
                  setNoulThresholds((prev) => ({ ...prev, [key]: val }))
                }
              />
            )}

            {rightTab === 'raw' && (
              <div className="space-y-4">
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-xs text-slate-400">
                    <span className="font-semibold text-slate-300">
                      Raw Request Payload (`POST /v1/systemone`)
                    </span>
                    <CopyTextButton
                      text={JSON.stringify(constructedPayload, null, 2)}
                    />
                  </div>
                  <JsonCodeEditor
                    value={JSON.stringify(constructedPayload, null, 2)}
                    readOnly
                    minHeight="180px"
                    maxHeight="320px"
                  />
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between text-xs text-slate-400">
                    <span className="font-semibold text-slate-300">
                      Raw Response Body ({primaryRun?.profileName || 'Primary'})
                    </span>
                    {primaryRun?.rawResponseText && (
                      <CopyTextButton text={primaryRun.rawResponseText} />
                    )}
                  </div>
                  <JsonCodeEditor
                    value={
                      primaryRun?.response
                        ? JSON.stringify(primaryRun.response, null, 2)
                        : primaryRun?.rawResponseText ||
                          '// 尚未執行請求，點擊右上角 Run (⌘+↵) 後顯示回應內容'
                    }
                    readOnly
                    minHeight="180px"
                    maxHeight="360px"
                  />
                </div>

                {isCompareMode && compareRun && (
                  <div>
                    <div className="mb-1.5 flex items-center justify-between text-xs text-cyan-300">
                      <span className="font-semibold">
                        Raw Response Body ([Compare] {compareRun.profileName})
                      </span>
                      {compareRun.rawResponseText && (
                        <CopyTextButton text={compareRun.rawResponseText} />
                      )}
                    </div>
                    <JsonCodeEditor
                      value={
                        compareRun.response
                          ? JSON.stringify(compareRun.response, null, 2)
                          : compareRun.rawResponseText || '// 無回應內容'
                      }
                      readOnly
                      minHeight="160px"
                      maxHeight="320px"
                    />
                  </div>
                )}
              </div>
            )}

            {rightTab === 'code' && (
              <CodeExportPanel
                profile={activeProfile}
                payload={constructedPayload}
                noulThresholds={noulThresholds}
              />
            )}
          </div>
        </section>
      </main>

      {/* ================================================================= */}
      {/* MODALS                                                            */}
      {/* ================================================================= */}
      <ProfileManagerModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        profiles={profiles}
        activeProfileId={activeProfile.id}
        onSaveProfiles={handleSaveProfiles}
      />

      <PresetsAndHistoryModal
        isOpen={presetsHistoryModal.open}
        initialTab={presetsHistoryModal.tab}
        onClose={() =>
          setPresetsHistoryModal((prev) => ({ ...prev, open: false }))
        }
        currentStateMode={stateMode}
        currentStateText={stateText}
        currentImages={images}
        currentQuestions={questionsRecord}
        currentPayload={constructedPayload}
        onApplyPresetOrHistory={applyPresetData}
      />
    </div>
  );
}

function CopyTextButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300 hover:bg-slate-700"
    >
      {copied ? (
        <>
          <Check className="h-3 w-3 text-emerald-400" />
          Copied
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" />
          Copy JSON
        </>
      )}
    </button>
  );
}

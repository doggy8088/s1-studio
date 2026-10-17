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
  LOCAL_OLLAMA_NOT_DOWNLOADED_MODEL,
  buildCloudflareEndpointUrl,
  builderItemsToQuestionsRecord,
  executeSystemOneRequest,
  extractCloudflareAccountId,
  fetchModelsForProfile,
  formatEndpointPreviewUrl,
  getCachedModelsForProfile,
  getDefaultModelsForProfile,
  getSelectableModelsForProfile,
  isCloudflareProfile,
  isLocalOllamaProfile,
  isProfileEndpointAndKeyValid,
  pullLocalOllamaModel,
  questionsRecordToBuilderItems,
  validateQuestionsBuilder,
} from '@/lib/s1-utils';
import {
  generateCurlSnippet,
  getProfileApiKeyEnvVar,
} from '@/lib/code-exporter';
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
  AlertCircle,
  Loader2,
  FileJson,
  Code2,
  Layers,
  Server,
  KeyRound,
  Download,
} from 'lucide-react';

export function S1StudioApp() {
  // -------------------------------------------------------------------------
  // 1. Endpoint Profiles & Compare Mode State (Hydration-safe)
  // -------------------------------------------------------------------------
  const [profiles, setProfiles] = useState<EndpointProfile[]>(DEFAULT_PROFILES);
  const [activeProfileId, setActiveProfileId] = useState<string>(
    DEFAULT_PROFILES[0].id
  );
  const [isCompareMode, setIsCompareMode] = useState<boolean>(false);
  const [compareProfileId, setCompareProfileId] = useState<string>(
    DEFAULT_PROFILES[3]?.id || DEFAULT_PROFILES[1].id
  );

  // Hydrate saved profiles & activeProfileId on client mount to avoid SSR hydration mismatch
  useEffect(() => {
    queueMicrotask(() => {
      const loaded = loadProfilesFromLocalStorage();
      const saved = loadActiveProfileId();
      setProfiles(loaded);
      if (loaded.some((p) => p.id === saved)) {
        setActiveProfileId(saved);
      } else if (loaded[0]) {
        setActiveProfileId(loaded[0].id);
      }
    });
  }, []);

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
  const [activePresetId, setActivePresetId] = useState<string | null>(
    initialPreset.id
  );
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
    const next = profiles.map((p) => {
      if (p.id !== activeProfile.id) return p;
      const merged: EndpointProfile = { ...p, ...patch };
      if (isCloudflareProfile(merged)) {
        const acct = extractCloudflareAccountId(merged);
        merged.baseUrl = buildCloudflareEndpointUrl(acct, merged.defaultModel);
      }
      return merged;
    });
    handleSaveProfiles(next);
  };

  const [discoveredModelsByProfile, setDiscoveredModelsByProfile] = useState<
    Record<string, string[]>
  >({});
  const [pullingInlineClef, setPullingInlineClef] = useState(false);
  const [pullInlineStatus, setPullInlineStatus] = useState<string | null>(null);

  const isActiveLocalOllama = useMemo(
    () => isLocalOllamaProfile(activeProfile),
    [activeProfile]
  );

  const activeDiscoveredModels = useMemo(
    () =>
      discoveredModelsByProfile[activeProfile.id] ??
      (!isActiveLocalOllama
        ? getCachedModelsForProfile(activeProfile)
        : undefined),
    [discoveredModelsByProfile, activeProfile, isActiveLocalOllama]
  );

  const isActiveEndpointAndKeyValid = useMemo(
    () => isProfileEndpointAndKeyValid(activeProfile, activeDiscoveredModels),
    [activeProfile, activeDiscoveredModels]
  );

  useEffect(() => {
    const url = activeProfile.baseUrl.trim();
    if (
      !url ||
      url.startsWith('/api/') ||
      isCloudflareProfile(activeProfile)
    ) {
      return;
    }
    const isLocalhost = url.includes('localhost') || url.includes('127.0.0.1');
    const hasKey = Boolean(
      activeProfile.apiKey && activeProfile.apiKey.trim().length > 0
    );
    if (!isLocalhost && !hasKey) return;

    if (!isActiveLocalOllama) {
      const cached = getCachedModelsForProfile(activeProfile);
      if (cached && cached.length > 0) {
        return;
      }
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      const models = await fetchModelsForProfile(activeProfile, {
        forceRefresh: isActiveLocalOllama,
      });
      if (cancelled) return;
      setDiscoveredModelsByProfile((prev) => ({
        ...prev,
        [activeProfile.id]: models,
      }));
      if (isActiveLocalOllama) {
        const nextDefault =
          models.length === 0
            ? LOCAL_OLLAMA_NOT_DOWNLOADED_MODEL
            : activeProfile.defaultModel ===
                  LOCAL_OLLAMA_NOT_DOWNLOADED_MODEL ||
                !models.includes(activeProfile.defaultModel)
              ? models[0]
              : activeProfile.defaultModel;
        if (nextDefault !== activeProfile.defaultModel) {
          setProfiles((curr) => {
            const updated = curr.map((p) =>
              p.id === activeProfile.id ? { ...p, defaultModel: nextDefault } : p
            );
            saveProfilesToLocalStorage(updated);
            return updated;
          });
        }
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeProfile, isActiveLocalOllama]);

  const handleInlinePullClef = async () => {
    if (pullingInlineClef) return;
    setPullingInlineClef(true);
    setPullInlineStatus('拉取中...');
    try {
      await pullLocalOllamaModel(activeProfile, 'clef', (status, pct) => {
        setPullInlineStatus(
          pct !== undefined ? `${status} (${pct}%)` : status
        );
      });
      const models = await fetchModelsForProfile(activeProfile, {
        forceRefresh: true,
      });
      setDiscoveredModelsByProfile((prev) => ({
        ...prev,
        [activeProfile.id]: models,
      }));
      const nextModel = models[0] || 'clef';
      updateActiveProfileInline({ defaultModel: nextModel });
      setPullInlineStatus(null);
    } catch {
      setIsProfileModalOpen(true);
    } finally {
      setPullingInlineClef(false);
    }
  };

  const activeSelectableModels = useMemo(
    () => getSelectableModelsForProfile(activeProfile, activeDiscoveredModels),
    [activeProfile, activeDiscoveredModels]
  );

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
  const runWithProfile = useCallback(
    async (targetProfile: EndpointProfile) => {
      if (isRunning) return;
      if (stateMode === 'json' && !stateJsonValidation.valid) {
        return;
      }
      if (validationIssues.length > 0) {
        return;
      }

      const payloadForTarget: S1RequestPayload = {
        ...constructedPayload,
        ...(targetProfile.defaultModel.trim()
          ? { model: targetProfile.defaultModel.trim() }
          : {}),
      };

      setIsRunning(true);
      try {
        if (isCompareMode && compareProfile) {
          const [resA, resB] = await Promise.all([
            executeSystemOneRequest(targetProfile, payloadForTarget),
            executeSystemOneRequest(
              compareProfile,
              payloadForTarget,
              compareProfile.defaultModel
            ),
          ]);
          setPrimaryRun(resA);
          setCompareRun(resB);

          await addHistoryEntry({
            timestamp: Date.now(),
            profileName: targetProfile.name,
            model: targetProfile.defaultModel || '(default)',
            stateMode,
            stateText,
            imagesCount: images.length,
            requestPayload: payloadForTarget,
            primaryRun: resA,
            compareRun: resB,
          });
        } else {
          const resA = await executeSystemOneRequest(
            targetProfile,
            payloadForTarget
          );
          setPrimaryRun(resA);
          setCompareRun(null);

          await addHistoryEntry({
            timestamp: Date.now(),
            profileName: targetProfile.name,
            model: targetProfile.defaultModel || '(default)',
            stateMode,
            stateText,
            imagesCount: images.length,
            requestPayload: payloadForTarget,
            primaryRun: resA,
          });
        }
      } finally {
        setIsRunning(false);
      }
    },
    [
      isRunning,
      stateMode,
      stateJsonValidation.valid,
      validationIssues.length,
      constructedPayload,
      isCompareMode,
      compareProfile,
      stateText,
      images.length,
    ]
  );

  const handleRunEvaluation = useCallback(async () => {
    await runWithProfile(activeProfile);
  }, [runWithProfile, activeProfile]);

  const handleSwitchToSimulatorAndRun = useCallback(async () => {
    const sim =
      profiles.find((p) => p.id === 's1-builtin-simulator') ||
      DEFAULT_PROFILES.find((p) => p.id === 's1-builtin-simulator');
    if (!sim) return;
    setActiveProfileId(sim.id);
    saveActiveProfileId(sim.id);
    await runWithProfile(sim);
  }, [profiles, runWithProfile]);

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
    presetId?: string;
    stateMode: 'text' | 'json';
    stateText: string;
    images?: UploadedImageItem[];
    questions: Record<string, S1Question>;
  }) => {
    setActivePresetId(data.presetId ?? null);
    setStateMode(data.stateMode);
    setStateText(data.stateText);
    setImages(data.images || []);
    setQuestionItems(questionsRecordToBuilderItems(data.questions));
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#0b0c0e] text-zinc-100">
      {/* ================================================================= */}
      {/* STICKY TIER 1: STUDIO BRAND BAR & PRIMARY ACTIONS                 */}
      {/* ================================================================= */}
      <header className="sticky top-0 z-30 border-b border-[#232732] bg-[#0b0c0e]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1720px] flex-wrap items-center justify-between gap-4 px-5 py-3">
          {/* Brand Emblem + Title */}
          <div className="flex items-center gap-3.5">
            <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#2d3240] bg-[#0b0c0e] shadow-md">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/s1-app-icon-sm.png"
                alt="S1 Studio Optical Prism Emblem"
                className="h-full w-full object-cover"
              />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <span className="text-lg font-bold tracking-tight text-zinc-100">
                  S1 Studio
                </span>
                <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-xs font-semibold text-amber-300">
                  /v1/systemone
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Vendor-Neutral Structured Decision Primitives Workbench
              </p>
            </div>
          </div>

          {/* Right Action Cluster: Presets, History, Copy cURL, Evaluate */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() =>
                setPresetsHistoryModal({ open: true, tab: 'presets' })
              }
              className="flex items-center gap-2 rounded-xl border border-[#282d3a] bg-[#14171f] px-3.5 py-2 text-sm font-medium text-zinc-200 transition hover:border-[#383f52] hover:bg-[#1b1f2a]"
            >
              <Bookmark className="h-4 w-4 text-amber-400" />
              <span>場景範本 Presets</span>
            </button>

            <button
              type="button"
              onClick={() =>
                setPresetsHistoryModal({ open: true, tab: 'history' })
              }
              className="flex items-center gap-2 rounded-xl border border-[#282d3a] bg-[#14171f] px-3.5 py-2 text-sm font-medium text-zinc-200 transition hover:border-[#383f52] hover:bg-[#1b1f2a]"
            >
              <History className="h-4 w-4 text-sky-400" />
              <span>歷史紀錄 History</span>
            </button>

            <button
              type="button"
              onClick={handleQuickCopyCurl}
              className="flex items-center gap-2 rounded-xl border border-[#282d3a] bg-[#14171f] px-3.5 py-2 text-sm font-medium text-zinc-200 transition hover:border-[#383f52] hover:bg-[#1b1f2a]"
              title={`一鍵複製 curl -s ... | jq 指令 (使用 $${getProfileApiKeyEnvVar(activeProfile)})`}
            >
              {copiedCurlQuick ? (
                <>
                  <Check className="h-4 w-4 text-emerald-400" />
                  <span className="text-emerald-300">已複製 cURL</span>
                </>
              ) : (
                <>
                  <Terminal className="h-4 w-4 text-zinc-400" />
                  <span className="hidden sm:inline">cURL | jq</span>
                </>
              )}
            </button>

            {/* Primary Evaluate CTA */}
            <button
              type="button"
              onClick={handleRunEvaluation}
              disabled={
                isRunning ||
                (stateMode === 'json' && !stateJsonValidation.valid) ||
                validationIssues.length > 0
              }
              className="flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2 text-sm font-bold text-zinc-950 shadow-lg shadow-amber-500/20 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>評估中...</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 fill-current" />
                  <span>執行評估 (⌘+↵)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* ================================================================= */}
      {/* SUB-HEADER: ENDPOINT TELEMETRY BAR & SCENARIO QUICK-SWITCHER      */}
      {/* ================================================================= */}
      <div className="border-b border-[#1f232e] bg-[#101218]">
        {/* Connection Strip */}
        <div className="mx-auto flex max-w-[1720px] flex-wrap items-center justify-between gap-3 px-5 py-2.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#262b38] bg-[#0b0c0e] px-3 py-1.5">
              <Server className="h-4 w-4 text-amber-400" />
              <span className="text-xs font-semibold text-zinc-400">
                Profile:
              </span>
              <select
                value={activeProfile.id}
                onChange={(e) => {
                  setActiveProfileId(e.target.value);
                  saveActiveProfileId(e.target.value);
                }}
                aria-label="Select active endpoint profile"
                className="rounded-lg bg-[#151821] px-2.5 py-1 text-sm font-semibold text-zinc-100 ring-1 ring-[#2a2f3d] focus:outline-none"
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>

              <div className="h-4 w-px bg-[#252934]" />

              {/* Inline Model selector: dropdown (<select>) when Endpoint & API Key are valid, otherwise input */}
              <span className="text-xs font-semibold text-zinc-400">
                Model:
              </span>
              {isActiveEndpointAndKeyValid ? (
                <select
                  value={activeProfile.defaultModel}
                  onChange={(e) =>
                    updateActiveProfileInline({ defaultModel: e.target.value })
                  }
                  aria-label="Select active model"
                  title="當前模型名稱 (Model Name)"
                  className="rounded-lg border border-[#282d3a] bg-[#14171f] px-2.5 py-1 font-mono text-sm font-medium text-amber-300 focus:border-amber-500 focus:outline-none"
                >
                  {activeSelectableModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              ) : isActiveLocalOllama ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={LOCAL_OLLAMA_NOT_DOWNLOADED_MODEL}
                    title="本機 Ollama 尚未下載 clef 模型"
                    className="w-40 rounded-lg border border-amber-500/40 bg-[#14171f] px-2.5 py-1 font-mono text-sm font-medium text-amber-300 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void handleInlinePullClef()}
                    disabled={pullingInlineClef}
                    title="透過 HTTP 呼叫本機 Ollama REST API (POST /api/pull) 直接拉取 clef 模型"
                    className="inline-flex items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-300 transition hover:bg-amber-500/25 disabled:opacity-50"
                  >
                    {pullingInlineClef ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    <span>
                      {pullingInlineClef
                        ? pullInlineStatus || '拉取中...'
                        : '拉取 clef 模型'}
                    </span>
                  </button>
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    list="s1-models-datalist"
                    value={activeProfile.defaultModel}
                    onChange={(e) =>
                      updateActiveProfileInline({
                        defaultModel: e.target.value,
                      })
                    }
                    placeholder="@cf/cloudflare/clef / clef:27b"
                    title="當前模型名稱 (Model Name)"
                    className={`${
                      isCloudflareProfile(activeProfile) ? 'w-56' : 'w-36'
                    } rounded-lg border border-[#282d3a] bg-[#14171f] px-2.5 py-1 font-mono text-sm font-medium text-amber-300 focus:border-amber-500 focus:outline-none`}
                  />
                  <datalist id="s1-models-datalist">
                    {getDefaultModelsForProfile(activeProfile).map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </>
              )}

              {/* Manage Profiles & API Key Modal Button */}
              <button
                type="button"
                onClick={() => setIsProfileModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#2b303d] bg-[#171a22] px-2.5 py-1 text-xs font-semibold text-zinc-200 transition hover:bg-[#222632] hover:text-zinc-100"
                title="設定端點網址與 API Key (Endpoint Profiles)"
              >
                <Settings2 className="h-3.5 w-3.5 text-amber-400" />
                <span>端點與金鑰設定</span>
                {activeProfile.apiKey && (
                  <KeyRound className="h-3 w-3 text-emerald-400" />
                )}
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
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition ${
                activeProfile.useProxy
                  ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                  : 'border-[#282d3a] bg-[#14171f] text-zinc-300 hover:text-zinc-100'
              }`}
            >
              {activeProfile.useProxy ? (
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
              ) : (
                <Globe className="h-4 w-4 text-amber-400" />
              )}
              <span>Proxy: {activeProfile.useProxy ? 'ON' : 'OFF'}</span>
            </button>

            {/* A/B Compare Mode Toggle */}
            <button
              type="button"
              onClick={() => setIsCompareMode((v) => !v)}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition ${
                isCompareMode
                  ? 'border-sky-500/50 bg-sky-500/20 text-sky-200'
                  : 'border-[#282d3a] bg-[#14171f] text-zinc-300 hover:text-zinc-100'
              }`}
              title="開啟 A/B 端點對比模式，平行發送請求至兩個 Profile"
            >
              <Split className="h-4 w-4 text-sky-400" />
              <span>A/B 對比</span>
            </button>

            {isCompareMode && (
              <select
                value={compareProfile.id}
                onChange={(e) => setCompareProfileId(e.target.value)}
                aria-label="Select secondary comparison endpoint profile"
                className="rounded-xl border border-sky-500/40 bg-sky-950/40 px-3 py-2 text-xs font-bold text-sky-200 focus:outline-none"
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    vs: {p.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Right: Target Endpoint URL readout inline */}
          <button
            type="button"
            onClick={() => setIsProfileModalOpen(true)}
            title={formatEndpointPreviewUrl(
              activeProfile.baseUrl,
              activeProfile.defaultModel,
              activeProfile.cloudflareAccountId
            )}
            className="hidden items-center gap-1.5 rounded-lg border border-[#252934] bg-[#0b0c0e] px-2.5 py-1.5 font-mono text-xs text-zinc-300 transition hover:border-[#383f52] hover:text-zinc-100 xl:flex"
          >
            <span className="font-sans text-zinc-500">POST</span>
            <span className="max-w-[260px] truncate">
              {formatEndpointPreviewUrl(
                activeProfile.baseUrl,
                activeProfile.defaultModel,
                activeProfile.cloudflareAccountId
              )}
            </span>
          </button>
        </div>

          {/* Scenario Quick-Switcher Strip */}
          <div className="border-t border-[#1b1f28] bg-[#0d0f14] px-5 py-2">
            <div className="mx-auto flex max-w-[1720px] flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-zinc-400">
                  快速載入測試場景：
                </span>
                {BUILT_IN_PRESETS.map((preset) => {
                  const isSelected = activePresetId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() =>
                        applyPresetData({
                          presetId: preset.id,
                          stateMode: preset.stateMode,
                          stateText: preset.stateText,
                          images: preset.images || [],
                          questions: preset.questions,
                        })
                      }
                      className={`rounded-lg border px-3 py-1 text-xs font-medium transition ${
                        isSelected
                          ? 'border-amber-500/50 bg-amber-500/15 font-semibold text-amber-200'
                          : 'border-[#242834] bg-[#14171f] text-zinc-300 hover:border-[#353b4b] hover:text-zinc-100'
                      }`}
                    >
                      {preset.name.split(' (')[0]}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setIsProfileModalOpen(true)}
                title={formatEndpointPreviewUrl(
                  activeProfile.baseUrl,
                  activeProfile.defaultModel,
                  activeProfile.cloudflareAccountId
                )}
                className="hidden items-center gap-1.5 rounded border border-[#222632] bg-[#0b0c0e] px-2.5 py-0.5 font-mono text-xs text-zinc-300 transition hover:border-[#383f52] hover:text-zinc-100 md:inline-flex xl:hidden"
              >
                <span className="font-sans text-zinc-500">POST</span>
                <span className="max-w-[260px] truncate">
                  {formatEndpointPreviewUrl(
                    activeProfile.baseUrl,
                    activeProfile.defaultModel,
                    activeProfile.cloudflareAccountId
                  )}
                </span>
              </button>
            </div>
          </div>
        </div>

      {/* ================================================================= */}
      {/* MAIN TWO-COLUMN DESKTOP WORKSPACE                                 */}
      {/* ================================================================= */}
      <main className="bg-instrument-grid mx-auto grid w-full max-w-[1720px] flex-1 grid-cols-1 items-start gap-6 p-5 lg:grid-cols-12">
        {/* --------------------------------------------------------------- */}
        {/* LEFT COLUMN: REQUEST BUILDER (State + Multimodal + Questions)   */}
        {/* --------------------------------------------------------------- */}
        <section className="space-y-5 lg:col-span-6">
          {/* 01. State Input Card */}
          <div className="rounded-2xl border border-[#232730] bg-[#12141a] p-5 shadow-sm">
            <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-md border border-[#2c313d] bg-[#171a21] font-mono text-xs font-bold text-amber-400">
                  01
                </span>
                <div>
                  <h2 className="text-base font-semibold tracking-tight text-zinc-100">
                    State Context 狀態輸入
                  </h2>
                </div>
              </div>

              {/* Text | JSON Mode Switcher */}
              <div className="inline-flex rounded-lg border border-[#282c37] bg-[#0d0e12] p-1">
                <button
                  type="button"
                  onClick={() => setStateMode('text')}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    stateMode === 'text'
                      ? 'bg-[#222631] text-zinc-100 shadow-sm ring-1 ring-[#353b49]'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Text 純文字
                </button>
                <button
                  type="button"
                  onClick={() => setStateMode('json')}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    stateMode === 'json'
                      ? 'bg-[#222631] text-zinc-100 shadow-sm ring-1 ring-[#353b49]'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  JSON 結構
                </button>
              </div>
            </div>

            {stateMode === 'text' ? (
              <textarea
                rows={4}
                value={stateText}
                onChange={(e) => {
                  setStateText(e.target.value);
                  setActivePresetId(null);
                }}
                placeholder="輸入待評估的純文字狀態 (State)..."
                className="w-full rounded-xl border border-[#282d39] bg-[#0d0e12] p-4 font-mono text-sm leading-relaxed text-zinc-100 transition focus:border-amber-500/70 focus:outline-none"
              />
            ) : (
              <div className="space-y-3">
                <JsonCodeEditor
                  value={stateText}
                  onChange={(val) => {
                    setStateText(val);
                    setActivePresetId(null);
                  }}
                  minHeight="135px"
                  maxHeight="320px"
                />
                {!stateJsonValidation.valid && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                    <div className="flex items-center gap-2">
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
                      className="shrink-0 rounded-lg bg-rose-500/20 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/30"
                    >
                      自動封裝為 JSON 物件
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 02. Multimodal Images Dropzone (Compact when 0 images) */}
          <ImageDropzone images={images} onChange={setImages} />

          {/* 03. Questions Builder */}
          <div className="rounded-2xl border border-[#232730] bg-[#12141a] p-5 shadow-sm">
            <QuestionsBuilder
              items={questionItems}
              onChange={setQuestionItems}
            />

            {/* Validation Issues Summary */}
            {validationIssues.length > 0 && (
              <div className="mt-4 rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
                <div className="flex items-center gap-2 font-semibold text-rose-300">
                  <AlertCircle className="h-4 w-4" />
                  請修正以下問題設定後再發送請求：
                </div>
                <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
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
        <section className="space-y-5 lg:sticky lg:top-20 lg:col-span-6">
          <div className="rounded-2xl border border-[#232730] bg-[#12141a] p-5 shadow-sm">
            {/* Single-Row Header: 04 Title + View Switcher Tabs */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-[#232732] pb-3.5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-md border border-[#2c313d] bg-[#171a21] font-mono text-xs font-bold text-amber-400">
                  04
                </span>
                <h2 className="text-base font-semibold tracking-tight text-zinc-100">
                  Telemetry 評估診斷結果
                </h2>
              </div>

              {/* Tabs: Visual Cards | Raw Response | Code Exporter */}
              <div className="inline-flex rounded-lg border border-[#282c37] bg-[#0d0e12] p-1">
                <button
                  type="button"
                  onClick={() => setRightTab('visual')}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition sm:text-sm ${
                    rightTab === 'visual'
                      ? 'bg-[#222631] text-zinc-100 shadow-sm ring-1 ring-[#353b49]'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Layers className="h-3.5 w-3.5 text-amber-400" />
                  視覺診斷卡
                </button>
                <button
                  type="button"
                  onClick={() => setRightTab('raw')}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition sm:text-sm ${
                    rightTab === 'raw'
                      ? 'bg-[#222631] text-zinc-100 shadow-sm ring-1 ring-[#353b49]'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <FileJson className="h-3.5 w-3.5 text-sky-400" />
                  Raw JSON
                </button>
                <button
                  type="button"
                  onClick={() => setRightTab('code')}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition sm:text-sm ${
                    rightTab === 'code'
                      ? 'bg-[#222631] text-zinc-100 shadow-sm ring-1 ring-[#353b49]'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Code2 className="h-3.5 w-3.5 text-emerald-400" />
                  匯出程式碼
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
                onRunNow={handleRunEvaluation}
                onSwitchToSimulator={handleSwitchToSimulatorAndRun}
                onOpenProfileSettings={() => setIsProfileModalOpen(true)}
                isRunning={isRunning}
              />
            )}

            {rightTab === 'raw' && (
              <div className="space-y-5">
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm text-zinc-300">
                    <span className="font-semibold">
                      Raw Request Payload (`POST /v1/systemone`)
                    </span>
                    <CopyTextButton
                      text={JSON.stringify(constructedPayload, null, 2)}
                    />
                  </div>
                  <JsonCodeEditor
                    value={JSON.stringify(constructedPayload, null, 2)}
                    readOnly
                    minHeight="200px"
                    maxHeight="340px"
                  />
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between text-sm text-zinc-300">
                    <span className="font-semibold">
                      Raw Response Body ({primaryRun?.profileName || 'Primary'})
                    </span>
                    {primaryRun?.rawResponseText && (
                      <CopyTextButton text={primaryRun.rawResponseText} />
                    )}
                  </div>
                  <JsonCodeEditor
                    value={
                      primaryRun?.rawResponseText
                        ? (() => {
                            try {
                              return JSON.stringify(
                                JSON.parse(primaryRun.rawResponseText),
                                null,
                                2
                              );
                            } catch {
                              return primaryRun.rawResponseText;
                            }
                          })()
                        : '// 尚未執行請求，點擊右上角「執行評估 (⌘+↵)」後顯示回應內容'
                    }
                    readOnly
                    minHeight="200px"
                    maxHeight="380px"
                  />
                </div>

                {isCompareMode && compareRun && (
                  <div>
                    <div className="mb-2 flex items-center justify-between text-sm text-sky-300">
                      <span className="font-semibold">
                        Raw Response Body ([Compare] {compareRun.profileName})
                      </span>
                      {compareRun.rawResponseText && (
                        <CopyTextButton text={compareRun.rawResponseText} />
                      )}
                    </div>
                    <JsonCodeEditor
                      value={
                        compareRun.rawResponseText
                          ? (() => {
                              try {
                                return JSON.stringify(
                                  JSON.parse(compareRun.rawResponseText),
                                  null,
                                  2
                                );
                              } catch {
                                return compareRun.rawResponseText;
                              }
                            })()
                          : '// 無回應內容'
                      }
                      readOnly
                      minHeight="180px"
                      maxHeight="340px"
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
      {/* FOOTER: VERSION INFO & COPYRIGHT                                  */}
      {/* ================================================================= */}
      <footer className="mt-auto border-t border-[#1e222b] bg-[#0b0c0e] py-4 text-sm text-zinc-400">
        <div className="mx-auto flex max-w-[1720px] flex-wrap items-center justify-between gap-3 px-5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-bold text-zinc-100">S1 Studio</span>
            <span className="telemetry-num rounded-md border border-[#2b303d] bg-[#14171f] px-2.5 py-0.5 font-mono text-xs font-medium text-amber-300">
              v{process.env.NEXT_PUBLIC_APP_VERSION || '0.1.0'}
              {process.env.NEXT_PUBLIC_GIT_SHA
                ? ` (${process.env.NEXT_PUBLIC_GIT_SHA})`
                : ''}
            </span>
            <span className="hidden text-zinc-600 sm:inline">·</span>
            <a
              href="https://github.com/doggy8088/s1-studio"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden text-zinc-400 underline-offset-4 transition hover:text-amber-300 hover:underline sm:inline"
            >
              GitHub Repository
            </a>
          </div>

          <div className="flex items-center gap-1.5 text-zinc-400">
            <span>Copyright © 2026</span>
            <a
              href="https://blog.miniasp.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-zinc-100 underline-offset-4 transition hover:text-amber-300 hover:underline"
            >
              Will 保哥
            </a>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-500">All rights reserved.</span>
          </div>
        </div>
      </footer>

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
      className="inline-flex items-center gap-1.5 rounded-lg border border-[#2c313f] bg-[#161922] px-3 py-1 text-xs font-medium text-zinc-200 transition hover:bg-[#202430]"
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 text-emerald-400" />
          Copied
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" />
          Copy JSON
        </>
      )}
    </button>
  );
}

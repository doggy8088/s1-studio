'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  EndpointProfile,
  ExecutionRunMeta,
  QuestionBuilderItem,
  S1PresetDefinition,
  S1Question,
  S1RequestPayload,
  UploadedImageItem,
} from '@/types/systemone';
import { BUILT_IN_PRESETS, DEFAULT_PROFILES } from '@/lib/presets';
import {
  addHistoryEntry,
  loadActiveProfileId,
  loadCustomPresets,
  loadProfilesFromLocalStorage,
  saveActiveProfileId,
  saveProfilesToLocalStorage,
} from '@/lib/db';
import {
  buildUrlWithoutProfileLinkParams,
  createImportedProfileId,
  parseProfileLinkSearch,
  planProfileUrlImport,
  resolvePresetFromQuery,
  type ProfileImportConflict,
} from '@/lib/profile-link';
import {
  LocalOllamaDiagnosis,
  buildCloudflareEndpointUrl,
  builderItemsToQuestionsRecord,
  copyTextToClipboard,
  diagnoseLocalOllama,
  executeSystemOneRequest,
  extractCloudflareAccountId,
  fetchModelsForProfile,
  formatEndpointPreviewUrl,
  getCachedModelsForProfile,
  getDefaultModelsForProfile,
  getLocalOllamaStatusModelDisplay,
  getSelectableModelsForProfile,
  isCloudflareProfile,
  isLocalOllamaPlaceholderModel,
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
import { ProfileImportConflictModal } from './ProfileImportConflictModal';
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
  RefreshCw,
  AlertTriangle,
  Sun,
  Moon,
  Info,
  X,
} from 'lucide-react';

type UrlNoticeTone = 'success' | 'info' | 'warning' | 'error';

interface UrlNotice {
  tone: UrlNoticeTone;
  title: string;
  message: string;
}

const URL_NOTICE_PRIORITY: Record<UrlNoticeTone, number> = {
  info: 0,
  success: 1,
  warning: 2,
  error: 3,
};

function mergeUrlNotice(
  previous: UrlNotice | null,
  tone: UrlNoticeTone,
  title: string,
  message: string
): UrlNotice {
  if (!previous) {
    return { tone, title, message };
  }
  return {
    tone:
      URL_NOTICE_PRIORITY[tone] > URL_NOTICE_PRIORITY[previous.tone]
        ? tone
        : previous.tone,
    title: previous.title,
    message: `${previous.message}\n${message}`,
  };
}

function UrlImportNoticeCard({
  notice,
  onClose,
}: {
  notice: UrlNotice;
  onClose: () => void;
}) {
  const { frame, iconColor, Icon } = {
    success: {
      frame: 'border-emerald-500/40 bg-[#0d1a15]/95',
      iconColor: 'text-emerald-400',
      Icon: Check,
    },
    info: {
      frame: 'border-sky-500/40 bg-[#0d1520]/95',
      iconColor: 'text-sky-400',
      Icon: Info,
    },
    warning: {
      frame: 'border-amber-500/40 bg-[#1b1710]/95',
      iconColor: 'text-amber-400',
      Icon: AlertTriangle,
    },
    error: {
      frame: 'border-rose-500/40 bg-[#1d1114]/95',
      iconColor: 'text-rose-400',
      Icon: AlertCircle,
    },
  }[notice.tone];

  return (
    <div
      className={`fixed right-4 bottom-4 left-4 z-[60] max-w-md rounded-2xl border p-4 shadow-2xl backdrop-blur-md sm:left-auto ${frame}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${iconColor}`} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-zinc-100">{notice.title}</div>
          <p className="mt-1 max-h-[35vh] overflow-y-auto text-xs leading-relaxed break-words whitespace-pre-line text-zinc-300">
            {notice.message}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-zinc-400 transition hover:bg-white/10 hover:text-zinc-100"
          aria-label="關閉通知"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function S1StudioApp() {
  // -------------------------------------------------------------------------
  // 1. Endpoint Profiles, Theme & Compare Mode State (Hydration-safe)
  // -------------------------------------------------------------------------
  const [profiles, setProfiles] = useState<EndpointProfile[]>(DEFAULT_PROFILES);
  const [activeProfileId, setActiveProfileId] = useState<string>(
    DEFAULT_PROFILES[0].id
  );
  const [isCompareMode, setIsCompareMode] = useState<boolean>(false);
  const [compareProfileId, setCompareProfileId] = useState<string>(
    DEFAULT_PROFILES[3]?.id || DEFAULT_PROFILES[1].id
  );
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>('dark');
  const [urlNotice, setUrlNotice] = useState<UrlNotice | null>(null);
  const [profileImportConflict, setProfileImportConflict] =
    useState<ProfileImportConflict | null>(null);

  const toggleThemeMode = useCallback(() => {
    setThemeMode((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      if (typeof document !== 'undefined') {
        document.documentElement.dataset.theme = next;
      }
      try {
        localStorage.setItem('s1_studio_theme_v1', next);
      } catch {
        // ignore storage errors
      }
      return next;
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

  const hasHydratedClientStateRef = useRef(false);

  // Hydrate saved profiles, theme, deep-link imports and preset on client mount.
  useEffect(() => {
    queueMicrotask(() => {
      if (hasHydratedClientStateRef.current) return;
      hasHydratedClientStateRef.current = true;

      const loadedProfiles = loadProfilesFromLocalStorage();
      const savedActiveId = loadActiveProfileId();
      let nextProfiles = loadedProfiles;
      let nextActiveId = loadedProfiles.some((p) => p.id === savedActiveId)
        ? savedActiveId
        : loadedProfiles[0]?.id || DEFAULT_PROFILES[0].id;

      const link = parseProfileLinkSearch(
        typeof window === 'undefined' ? '' : window.location.search
      );

      if (link.hasAnyImportParam && typeof window !== 'undefined') {
        try {
          window.history.replaceState(
            window.history.state,
            '',
            buildUrlWithoutProfileLinkParams(window.location.href)
          );
        } catch {
          // Ignore URL rewriting failures in restricted browsing contexts.
        }
      }

      if (link.errors.length > 0) {
        setUrlNotice((prev) =>
          mergeUrlNotice(
            prev,
            'error',
            '網址參數格式有誤',
            link.errors.join('\n')
          )
        );
      } else if (link.profile) {
        const plan = planProfileUrlImport(
          loadedProfiles,
          link.profile,
          createImportedProfileId()
        );

        if (plan.kind === 'create') {
          nextProfiles = [...loadedProfiles, plan.profile];
          nextActiveId = plan.profile.id;
          setUrlNotice((prev) =>
            mergeUrlNotice(
              prev,
              'success',
              '已從網址建立 Profile',
              `已新增「${plan.profile.name}」並切換為當前端點。\n端點：${plan.profile.baseUrl}\n新 Profile 的 API Key 一律留空，請至「端點與金鑰設定」填入。\n提醒：僅匯入您信任的端點；執行評估時 State 與圖片會傳送至該端點。`
            )
          );
        } else if (plan.kind === 'switch') {
          const matched = loadedProfiles.find(
            (profile) => profile.id === plan.profileId
          );
          nextActiveId = plan.profileId;
          if (plan.profileId !== savedActiveId) {
            setUrlNotice((prev) =>
              mergeUrlNotice(
                prev,
                'info',
                '已切換 Profile',
                `設定內容相同，已直接切換至「${
                  matched?.name || plan.profileId
                }」。`
              )
            );
          }
        } else if (plan.kind === 'conflict') {
          setProfileImportConflict(plan.conflict);
          setUrlNotice((prev) =>
            mergeUrlNotice(
              prev,
              'warning',
              'Profile 設定衝突',
              `「${plan.conflict.existing.name}」已存在但設定不同，請在對話框中確認是否覆寫。`
            )
          );
        } else {
          setUrlNotice((prev) =>
            mergeUrlNotice(prev, 'error', '無法匯入 Profile', plan.error)
          );
        }
      }

      if (link.warnings.length > 0) {
        setUrlNotice((prev) =>
          mergeUrlNotice(
            prev,
            'warning',
            prev?.title || '已忽略敏感參數',
            link.warnings.join('\n')
          )
        );
      }

      setProfiles(nextProfiles);
      setActiveProfileId(nextActiveId);
      if (nextProfiles !== loadedProfiles) {
        saveProfilesToLocalStorage(nextProfiles);
      }
      if (nextActiveId !== savedActiveId) {
        saveActiveProfileId(nextActiveId);
      }

      try {
        const currentAttr = document.documentElement.dataset.theme;
        const storedTheme = localStorage.getItem('s1_studio_theme_v1');
        if (currentAttr === 'light' || storedTheme === 'light') {
          setThemeMode('light');
          document.documentElement.dataset.theme = 'light';
        } else {
          setThemeMode('dark');
          document.documentElement.dataset.theme = 'dark';
        }
      } catch {
        // ignore storage restrictions
      }

      const presetQuery = link.preset;
      if (presetQuery) {
        const applyPreset = (preset: S1PresetDefinition) => {
          setActivePresetId(preset.id);
          setStateMode(preset.stateMode);
          setStateText(preset.stateText);
          setImages(preset.images || []);
          setQuestionItems(
            questionsRecordToBuilderItems(preset.questions)
          );
          setUrlNotice((prev) =>
            mergeUrlNotice(
              prev,
              'info',
              prev?.title || '已載入場景範本',
              `已載入場景範本「${preset.name}」，可直接執行評估。`
            )
          );
        };

        // Built-in presets resolve synchronously; custom presets need IndexedDB.
        const builtInResolved = resolvePresetFromQuery(
          presetQuery,
          BUILT_IN_PRESETS,
          []
        );
        if (builtInResolved.preset) {
          applyPreset(builtInResolved.preset);
        } else {
          void (async () => {
            let customPresets: S1PresetDefinition[] = [];
            try {
              customPresets = await loadCustomPresets();
            } catch {
              customPresets = [];
            }

            const resolved = resolvePresetFromQuery(
              presetQuery,
              BUILT_IN_PRESETS,
              customPresets
            );

            if (resolved.preset) {
              applyPreset(resolved.preset);
            } else {
              setUrlNotice((prev) =>
                mergeUrlNotice(
                  prev,
                  'warning',
                  prev?.title || '找不到場景範本',
                  resolved.error || '找不到指定的場景範本。'
                )
              );
            }
          })();
        }
      }
    });
  }, []);

  // Auto-dismiss deep-link notices.
  useEffect(() => {
    if (!urlNotice) return;
    const timer = setTimeout(() => setUrlNotice(null), 12000);
    return () => clearTimeout(timer);
  }, [urlNotice]);

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

  const handleOverwriteProfileImport = () => {
    const conflict = profileImportConflict;
    if (!conflict) return;

    const liveExisting = profiles.find((p) => p.id === conflict.existing.id);
    const nextProfile: EndpointProfile = {
      ...conflict.proposed,
      apiKey: liveExisting?.apiKey ?? conflict.existing.apiKey,
    };
    const nextProfiles = profiles.some((p) => p.id === nextProfile.id)
      ? profiles.map((p) => (p.id === nextProfile.id ? nextProfile : p))
      : [...profiles, nextProfile];

    handleSaveProfiles(nextProfiles, nextProfile.id);
    setProfileImportConflict(null);
    setUrlNotice({
      tone: 'success',
      title: '已覆寫 Profile 設定',
      message: `已套用網址設定至「${nextProfile.name}」並切換。本機原有的 API Key 已保留。`,
    });
  };

  const handleKeepExistingProfileImport = () => {
    const conflict = profileImportConflict;
    if (!conflict) return;

    setActiveProfileId(conflict.existing.id);
    saveActiveProfileId(conflict.existing.id);
    setProfileImportConflict(null);
    setUrlNotice({
      tone: 'info',
      title: '已保留現有 Profile',
      message: `已切換至「${conflict.existing.name}」，原有設定未變更。`,
    });
  };

  const handleCancelProfileImport = () => {
    setProfileImportConflict(null);
    setUrlNotice({
      tone: 'info',
      title: '已取消 Profile 匯入',
      message: '本機 Profile 設定未變更。',
    });
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
  const [localOllamaDiagByProfile, setLocalOllamaDiagByProfile] = useState<
    Record<string, LocalOllamaDiagnosis>
  >({});
  const [recheckingLocalOllama, setRecheckingLocalOllama] = useState(false);
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

  const activeLocalOllamaDiag = localOllamaDiagByProfile[activeProfile.id];

  const isActiveEndpointAndKeyValid = useMemo(
    () => isProfileEndpointAndKeyValid(activeProfile, activeDiscoveredModels),
    [activeProfile, activeDiscoveredModels]
  );

  const refreshActiveLocalOllama = useCallback(
    async (targetProf: EndpointProfile) => {
      setRecheckingLocalOllama(true);
      try {
        const diag = await diagnoseLocalOllama(targetProf);
        setLocalOllamaDiagByProfile((prev) => ({
          ...prev,
          [targetProf.id]: diag,
        }));
        setDiscoveredModelsByProfile((prev) => ({
          ...prev,
          [targetProf.id]: diag.models,
        }));
        const nextDefault =
          diag.models.length === 0
            ? getLocalOllamaStatusModelDisplay(diag.status)
            : isLocalOllamaPlaceholderModel(targetProf.defaultModel) ||
                !diag.models.includes(targetProf.defaultModel)
              ? diag.models[0]
              : targetProf.defaultModel;
        if (nextDefault !== targetProf.defaultModel) {
          setProfiles((curr) => {
            const updated = curr.map((p) =>
              p.id === targetProf.id ? { ...p, defaultModel: nextDefault } : p
            );
            saveProfilesToLocalStorage(updated);
            return updated;
          });
        }
      } finally {
        setRecheckingLocalOllama(false);
      }
    },
    []
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
      if (isActiveLocalOllama) {
        await refreshActiveLocalOllama(activeProfile);
        return;
      }
      const models = await fetchModelsForProfile(activeProfile, {
        forceRefresh: false,
      });
      if (cancelled) return;
      setDiscoveredModelsByProfile((prev) => ({
        ...prev,
        [activeProfile.id]: models,
      }));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeProfile, isActiveLocalOllama, refreshActiveLocalOllama]);

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
      await refreshActiveLocalOllama(activeProfile);
      setPullInlineStatus(null);
    } catch {
      await refreshActiveLocalOllama(activeProfile);
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
    await copyTextToClipboard(curl);
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
      {/* Skip to Main Content Link for Keyboard Accessibility */}
      <a
        href="#main-workbench"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-amber-500 focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-zinc-950"
      >
        跳至主要工作區 (Skip to main workbench)
      </a>

      {/* Screen-reader live region for asynchronous evaluation status */}
      <div className="sr-only" role="status" aria-live="polite">
        {isRunning
          ? `正在發送請求至 ${activeProfile.name}...`
          : primaryRun
            ? `評估完成：${primaryRun.profileName} (${primaryRun.status} ${primaryRun.statusText}, ${primaryRun.latencyMs} ms)`
            : ''}
      </div>

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
                <h1 className="text-lg font-bold tracking-tight text-zinc-100">
                  S1 Studio
                </h1>
                <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-xs font-semibold text-amber-300">
                  /v1/systemone
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Vendor-Neutral Structured Decision Primitives Workbench
              </p>
            </div>
          </div>

          {/* Right Action Cluster: Theme, Presets, History, Copy cURL, Evaluate */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={toggleThemeMode}
              aria-label={
                themeMode === 'dark'
                  ? '切換至淺色主題 (Switch to Light Theme)'
                  : '切換至深色主題 (Switch to Dark Theme)'
              }
              aria-pressed={themeMode === 'light'}
              title={
                themeMode === 'dark'
                  ? '目前為深色主題，點擊切換為淺色主題'
                  : '目前為淺色主題，點擊切換為深色主題'
              }
              className="flex items-center gap-1.5 rounded-xl border border-[#282d3a] bg-[#14171f] px-3 py-2 text-sm font-medium text-zinc-200 transition hover:border-[#383f52] hover:bg-[#1b1f2a]"
            >
              {themeMode === 'dark' ? (
                <Sun className="h-4 w-4 text-amber-400" />
              ) : (
                <Moon className="h-4 w-4 text-sky-400" />
              )}
              <span className="hidden md:inline">
                {themeMode === 'dark' ? '淺色' : '深色'}
              </span>
            </button>

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
                <div className="flex flex-wrap items-center gap-1.5">
                  <input
                    type="text"
                    readOnly
                    value={
                      recheckingLocalOllama
                        ? '正在檢測本機 Ollama...'
                        : getLocalOllamaStatusModelDisplay(
                            activeLocalOllamaDiag?.status
                          )
                    }
                    title={
                      activeLocalOllamaDiag?.status === 'unreachable'
                        ? `無法連線至本機 Ollama (${activeProfile.baseUrl})`
                        : activeLocalOllamaDiag?.status === 'cors_blocked'
                          ? '本機 Ollama 已啟動，但被 CORS 跨域限制阻擋 (HTTP 403)'
                          : '本機 Ollama 尚未下載 clef 模型'
                    }
                    className={`w-52 rounded-lg border bg-[#14171f] px-2.5 py-1 font-mono text-sm font-medium focus:outline-none ${
                      activeLocalOllamaDiag?.status === 'unreachable'
                        ? 'border-rose-500/40 text-rose-300'
                        : 'border-amber-500/40 text-amber-300'
                    }`}
                  />

                  {activeLocalOllamaDiag?.status === 'unreachable' ? (
                    <button
                      type="button"
                      onClick={() => setIsProfileModalOpen(true)}
                      title="查看本機 Ollama 啟動指令與連線診斷"
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/15 px-2.5 py-1 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/25"
                    >
                      <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
                      <span>查看啟動說明</span>
                    </button>
                  ) : activeLocalOllamaDiag?.status === 'cors_blocked' ? (
                    <button
                      type="button"
                      onClick={() => setIsProfileModalOpen(true)}
                      title="查看並複製 OLLAMA_ORIGINS 跨域設定指令"
                      className="inline-flex items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-200 transition hover:bg-amber-500/25"
                    >
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                      <span>解除 CORS 阻擋</span>
                    </button>
                  ) : (
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
                  )}

                  <button
                    type="button"
                    onClick={() => void refreshActiveLocalOllama(activeProfile)}
                    disabled={recheckingLocalOllama}
                    title="重新檢測本機 Ollama 連線與模型清單"
                    className="inline-flex items-center gap-1 rounded-lg border border-[#282d3a] bg-[#14171f] px-2 py-1 text-xs font-medium text-zinc-300 transition hover:border-amber-500/40 hover:text-amber-200 disabled:opacity-50"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${
                        recheckingLocalOllama ? 'animate-spin' : ''
                      }`}
                    />
                    <span className="hidden xl:inline">重新檢測</span>
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
              aria-pressed={activeProfile.useProxy}
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
              aria-pressed={isCompareMode}
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
      <main
        id="main-workbench"
        className="bg-instrument-grid mx-auto grid w-full max-w-[1720px] flex-1 grid-cols-1 items-start gap-6 p-5 lg:grid-cols-12"
      >
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
      {/* FOOTER: VERSION INFO, LICENSE, REFERENCES & COPYRIGHT             */}
      {/* ================================================================= */}
      <footer className="mt-auto border-t border-[#1e222b] bg-[#0b0c0e] py-4 text-sm text-zinc-400">
        <div className="mx-auto flex max-w-[1720px] flex-col gap-2 px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="font-bold text-zinc-100">S1 Studio</span>
              <span className="telemetry-num rounded-md border border-[#2b303d] bg-[#14171f] px-2.5 py-0.5 font-mono text-xs font-medium text-amber-300">
                v{process.env.NEXT_PUBLIC_APP_VERSION || '0.1.0'}
                {process.env.NEXT_PUBLIC_GIT_SHA
                  ? ` (${process.env.NEXT_PUBLIC_GIT_SHA})`
                  : ''}
              </span>
              <span className="text-zinc-600">·</span>
              <a
                href="https://github.com/doggy8088/s1-studio"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-300 underline underline-offset-4 transition hover:text-amber-300"
              >
                GitHub Repository
              </a>
              <span className="text-zinc-600">·</span>
              <a
                href="https://github.com/doggy8088/s1-studio/blob/main/LICENSE"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-300 underline underline-offset-4 transition hover:text-amber-300"
              >
                MIT License
              </a>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-zinc-400">
              <span>Copyright © 2026</span>
              <a
                href="https://blog.miniasp.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-zinc-100 underline underline-offset-4 transition hover:text-amber-300"
              >
                Will 保哥
              </a>
              <span className="text-zinc-600">·</span>
              <span className="text-zinc-400">All rights reserved.</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
            <div className="flex flex-wrap items-center gap-1.5">
              <span>參考規格與相容端點：</span>
              <a
                href="https://ollama.com/library/clef"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-300 underline underline-offset-4 transition hover:text-amber-300"
              >
                Ollama clef
              </a>
              <span>·</span>
              <a
                href="https://developers.cloudflare.com/workers-ai/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-300 underline underline-offset-4 transition hover:text-amber-300"
              >
                Cloudflare Workers AI
              </a>
              <span>·</span>
              <a
                href="https://www.typesafe.ai/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-300 underline underline-offset-4 transition hover:text-amber-300"
              >
                TypeSafe AI
              </a>
            </div>
            <span className="text-zinc-400">
              All third-party trademarks (Ollama, Cloudflare, TypeSafe AI) belong
              to their respective owners.
            </span>
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

      <ProfileImportConflictModal
        conflict={profileImportConflict}
        onOverwrite={handleOverwriteProfileImport}
        onKeepExisting={handleKeepExistingProfileImport}
        onCancel={handleCancelProfileImport}
      />

      {urlNotice && (
        <UrlImportNoticeCard
          notice={urlNotice}
          onClose={() => setUrlNotice(null)}
        />
      )}
    </div>
  );
}

function CopyTextButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await copyTextToClipboard(text);
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

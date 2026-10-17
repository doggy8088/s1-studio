'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { EndpointProfile } from '@/types/systemone';
import {
  BASE_URL_TEMPLATES,
  BUILT_IN_PROFILE_IDS,
  CLOUDFLARE_BUILT_IN_MODELS,
  DEFAULT_PROFILES,
} from '@/lib/presets';
import { getProfileApiKeyEnvVar } from '@/lib/code-exporter';
import {
  LocalOllamaDiagnosis,
  buildCloudflareEndpointUrl,
  copyTextToClipboard,
  diagnoseLocalOllama,
  extractCloudflareAccountId,
  fetchModelsForProfile,
  getCachedModelsForProfile,
  getDefaultModelsForProfile,
  getLocalOllamaStatusModelDisplay,
  getSelectableModelsForProfile,
  isCloudflareProfile,
  isLocalOllamaPlaceholderModel,
  isLocalOllamaProfile,
  isProfileEndpointAndKeyValid,
  normalizeCloudflareModelId,
  pullLocalOllamaModel,
} from '@/lib/s1-utils';
import {
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Server,
  ShieldCheck,
  Globe,
  X,
  RotateCcw,
  Lock,
  RefreshCw,
  Download,
  Loader2,
  AlertTriangle,
  Copy,
  Check,
  ExternalLink,
  Terminal,
} from 'lucide-react';

interface ProfileManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  profiles: EndpointProfile[];
  activeProfileId: string;
  onSaveProfiles: (
    updated: EndpointProfile[],
    nextActiveId?: string
  ) => void;
}

export function ProfileManagerModal({
  isOpen,
  onClose,
  profiles,
  activeProfileId,
  onSaveProfiles,
}: ProfileManagerModalProps) {
  const [selectedId, setSelectedId] = useState<string>(activeProfileId);
  const [prevSyncKey, setPrevSyncKey] = useState(
    `${isOpen}:${activeProfileId}`
  );
  const [showKey, setShowKey] = useState(false);
  const [discoveredModelsByProfile, setDiscoveredModelsByProfile] = useState<
    Record<string, string[]>
  >({});
  const [localOllamaDiagByProfile, setLocalOllamaDiagByProfile] = useState<
    Record<string, LocalOllamaDiagnosis>
  >({});
  const [loadingModelsId, setLoadingModelsId] = useState<string | null>(null);
  const [pullingClef, setPullingClef] = useState(false);
  const [pullStatusText, setPullStatusText] = useState<string | null>(null);
  const [pullErrorText, setPullErrorText] = useState<string | null>(null);
  const [copiedCmdKey, setCopiedCmdKey] = useState<string | null>(null);

  const handleCopyCommand = async (key: string, cmd: string) => {
    const ok = await copyTextToClipboard(cmd);
    if (ok) {
      setCopiedCmdKey(key);
      setTimeout(() => {
        setCopiedCmdKey((curr) => (curr === key ? null : curr));
      }, 2000);
    }
  };

  const currentSyncKey = `${isOpen}:${activeProfileId}`;
  if (currentSyncKey !== prevSyncKey) {
    setPrevSyncKey(currentSyncKey);
    setSelectedId(activeProfileId);
  }

  const currentProfile = useMemo(
    () => profiles.find((p) => p.id === selectedId) || profiles[0],
    [profiles, selectedId]
  );

  const isBuiltInProfile = BUILT_IN_PROFILE_IDS.has(currentProfile.id);
  const isCf = isCloudflareProfile(currentProfile);
  const isLocalOllama = isLocalOllamaProfile(currentProfile);
  const cfAccountId = isCf ? extractCloudflareAccountId(currentProfile) : '';

  const canFetchRemoteModels = useMemo(() => {
    if (isCf) return false;
    const url = currentProfile.baseUrl.trim();
    if (!url || url.startsWith('/api/')) return false;
    const isLocalhost =
      url.includes('localhost') || url.includes('127.0.0.1');
    const hasKey = Boolean(
      currentProfile.apiKey && currentProfile.apiKey.trim().length > 0
    );
    return isLocalhost || hasKey;
  }, [isCf, currentProfile.baseUrl, currentProfile.apiKey]);

  const loadModels = useCallback(
    async (profileToFetch: EndpointProfile, forceRefresh = false) => {
      setLoadingModelsId(profileToFetch.id);
      setPullErrorText(null);
      try {
        if (isLocalOllamaProfile(profileToFetch)) {
          const diag = await diagnoseLocalOllama(profileToFetch);
          setLocalOllamaDiagByProfile((prev) => ({
            ...prev,
            [profileToFetch.id]: diag,
          }));
          setDiscoveredModelsByProfile((prev) => ({
            ...prev,
            [profileToFetch.id]: diag.models,
          }));

          const targetDefault =
            diag.models.length === 0
              ? getLocalOllamaStatusModelDisplay(diag.status)
              : isLocalOllamaPlaceholderModel(profileToFetch.defaultModel) ||
                  !diag.models.includes(profileToFetch.defaultModel)
                ? diag.models[0]
                : profileToFetch.defaultModel;

          if (targetDefault !== profileToFetch.defaultModel) {
            onSaveProfiles(
              profiles.map((p) =>
                p.id === profileToFetch.id
                  ? { ...p, defaultModel: targetDefault }
                  : p
              )
            );
          }
          return;
        }

        const models = await fetchModelsForProfile(profileToFetch, {
          forceRefresh,
        });
        setDiscoveredModelsByProfile((prev) => ({
          ...prev,
          [profileToFetch.id]: models,
        }));
      } finally {
        setLoadingModelsId((curr) =>
          curr === profileToFetch.id ? null : curr
        );
      }
    },
    [onSaveProfiles, profiles]
  );

  useEffect(() => {
    if (!isOpen || !canFetchRemoteModels) return;
    if (!isLocalOllama) {
      const cached = getCachedModelsForProfile(currentProfile);
      if (cached && cached.length > 0) {
        return;
      }
    }
    const timer = setTimeout(() => {
      void loadModels(currentProfile, isLocalOllama);
    }, 250);
    return () => clearTimeout(timer);
  }, [isOpen, canFetchRemoteModels, isLocalOllama, currentProfile, loadModels]);

  const handlePullLocalClef = async () => {
    if (pullingClef) return;
    setPullingClef(true);
    setPullErrorText(null);
    setPullStatusText('正在連線至本機 Ollama REST API (POST /api/pull)...');
    try {
      await pullLocalOllamaModel(currentProfile, 'clef', (status, pct) => {
        setPullStatusText(
          pct !== undefined
            ? `正在拉取 clef 模型：${status} (${pct}%)`
            : `正在拉取 clef 模型：${status}`
        );
      });
      setPullStatusText('clef 模型拉取完成！正在更新模型清單...');
      await loadModels(currentProfile, true);
      setPullStatusText(null);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : '無法連線至本機 Ollama';
      const diag = await diagnoseLocalOllama(currentProfile);
      setLocalOllamaDiagByProfile((prev) => ({
        ...prev,
        [currentProfile.id]: diag,
      }));
      if (diag.status === 'cors_blocked') {
        setPullErrorText(
          `拉取失敗：本機 Ollama 拒絕跨域請求 (HTTP 403 Forbidden)。請先點擊下方按鈕複製 OLLAMA_ORIGINS 設定指令並重啟 Ollama。`
        );
      } else if (diag.status === 'unreachable') {
        setPullErrorText(
          `拉取失敗：無法連線至 ${currentProfile.baseUrl}，請先確認本機已啟動 ollama serve。`
        );
      } else {
        setPullErrorText(`拉取失敗：${msg}`);
      }
      setPullStatusText(null);
    } finally {
      setPullingClef(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const currentDiscoveredModels =
    discoveredModelsByProfile[currentProfile.id] ??
    (!isLocalOllama ? getCachedModelsForProfile(currentProfile) : undefined);
  const currentLocalOllamaDiag = localOllamaDiagByProfile[currentProfile.id];

  const isEndpointAndKeyValid = isProfileEndpointAndKeyValid(
    currentProfile,
    currentDiscoveredModels
  );
  const commonModelsList = isCf
    ? [...CLOUDFLARE_BUILT_IN_MODELS]
    : currentDiscoveredModels?.length
      ? currentDiscoveredModels
      : getDefaultModelsForProfile(currentProfile);
  const selectableModels = getSelectableModelsForProfile(
    currentProfile,
    currentDiscoveredModels
  );

  const handleUpdateCurrent = (patch: Partial<EndpointProfile>) => {
    const next = profiles.map((p) => {
      if (p.id !== currentProfile.id) return p;
      const merged: EndpointProfile = { ...p, ...patch };
      if (isCloudflareProfile(merged)) {
        const nextModel = normalizeCloudflareModelId(merged.defaultModel);
        const nextAcct =
          patch.cloudflareAccountId !== undefined
            ? patch.cloudflareAccountId.trim()
            : extractCloudflareAccountId(merged);
        merged.defaultModel = nextModel;
        merged.cloudflareAccountId = nextAcct;
        merged.baseUrl = buildCloudflareEndpointUrl(nextAcct, nextModel);
      }
      return merged;
    });
    onSaveProfiles(next);
  };

  const handleAddNew = () => {
    const newProfile: EndpointProfile = {
      id: `profile-${Date.now()}`,
      name: `Custom Endpoint #${profiles.length + 1}`,
      baseUrl: 'http://localhost:11434',
      apiKey: '',
      defaultModel: 'clef',
      useProxy: false,
    };
    const next = [...profiles, newProfile];
    onSaveProfiles(next, newProfile.id);
    setSelectedId(newProfile.id);
  };

  const handleDelete = (id: string) => {
    if (profiles.length <= 1) return;
    const next = profiles.filter((p) => p.id !== id);
    const nextActive = activeProfileId === id ? next[0].id : activeProfileId;
    onSaveProfiles(next, nextActive);
    setSelectedId(next[0].id);
  };

  const handleResetDefaults = () => {
    const existingById = new Map(profiles.map((p) => [p.id, p]));
    const restoredDefaults: EndpointProfile[] = DEFAULT_PROFILES.map((def) => {
      const existing = existingById.get(def.id);
      const preservedApiKey = existing?.apiKey ?? def.apiKey;
      const preservedAcct = existing
        ? extractCloudflareAccountId(existing)
        : def.cloudflareAccountId ?? '';

      if (isCloudflareProfile(def)) {
        return {
          ...def,
          apiKey: preservedApiKey,
          cloudflareAccountId: preservedAcct,
          baseUrl: buildCloudflareEndpointUrl(preservedAcct, def.defaultModel),
        };
      }

      return {
        ...def,
        apiKey: preservedApiKey,
      };
    });

    const nextActiveId = restoredDefaults.some((p) => p.id === activeProfileId)
      ? activeProfileId
      : restoredDefaults[0].id;
    const nextSelectedId = restoredDefaults.some((p) => p.id === selectedId)
      ? selectedId
      : restoredDefaults[0].id;

    onSaveProfiles(restoredDefaults, nextActiveId);
    setSelectedId(nextSelectedId);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[#2a2f3d] bg-[#12141a] text-zinc-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#232732] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-400">
              <Server className="h-5 w-5" />
            </div>
            <div>
              <h2 id="profile-modal-title" className="text-lg font-bold">
                端點與連線設定檔 (Endpoint Profiles)
              </h2>
              <p className="text-xs text-zinc-400">
                管理多組 `/v1/systemone` 服務端點、模型識別碼與 CORS 代理轉發設定
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-400 transition hover:bg-[#1e222d] hover:text-zinc-100"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="grid flex-1 grid-cols-1 overflow-y-auto md:grid-cols-12">
          {/* Left list */}
          <div className="flex flex-col justify-between border-b border-[#232732] bg-[#0d0e12] p-4 md:col-span-5 md:border-r md:border-b-0">
            <div className="space-y-2">
              <div className="px-2 py-1 text-xs font-semibold tracking-wider text-zinc-400 uppercase">
                已儲存設定檔 ({profiles.length})
              </div>
              {profiles.map((p) => {
                const isSelected = p.id === currentProfile.id;
                const isActive = p.id === activeProfileId;
                const isBuiltIn = BUILT_IN_PROFILE_IDS.has(p.id);
                return (
                  <div
                    key={p.id}
                    onClick={() => setSelectedId(p.id)}
                    className={`group flex cursor-pointer items-center justify-between rounded-xl px-3.5 py-3 text-left transition ${
                      isSelected
                        ? 'bg-amber-500/15 text-amber-100 ring-1 ring-amber-500/40'
                        : 'text-zinc-300 hover:bg-[#161922]'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-semibold">
                          {p.name}
                        </span>
                        {isBuiltIn && (
                          <span className="shrink-0 rounded-md border border-sky-500/30 bg-sky-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-sky-300">
                            內建
                          </span>
                        )}
                        {isActive && (
                          <span className="shrink-0 rounded-md bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-300">
                            使用中
                          </span>
                        )}
                      </div>
                      <div className="mt-1 truncate font-mono text-xs text-zinc-400">
                        {p.baseUrl} · {p.defaultModel || 'no-model'}
                      </div>
                    </div>
                    {!isBuiltIn && profiles.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(p.id);
                        }}
                        className="ml-2 rounded-lg p-1.5 text-zinc-500 opacity-0 transition hover:bg-rose-500/20 hover:text-rose-300 group-hover:opacity-100"
                        title="刪除此自訂 Profile"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-5 flex flex-col gap-2.5 border-t border-[#232732] pt-4">
              <button
                type="button"
                onClick={handleAddNew}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1e222d] px-4 py-2.5 text-sm font-semibold text-zinc-100 ring-1 ring-[#323846] transition hover:bg-[#262b38]"
              >
                <Plus className="h-4 w-4 text-amber-400" />
                新增自訂端點設定檔
              </button>
              <button
                type="button"
                onClick={handleResetDefaults}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#232732] bg-[#12141a] px-3 py-2 text-xs font-medium text-zinc-400 transition hover:bg-[#1a1d26] hover:text-zinc-200"
                title="重置預設端點範本設定（保留已填寫的 API Key 與 CLOUDFLARE_ACCOUNT_ID）"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                重置為預設端點範本
              </button>
            </div>
          </div>

          {/* Right editor */}
          <div className="space-y-5 p-6 md:col-span-7">
            {/* 1. Profile Name */}
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <label className="block text-sm font-semibold text-zinc-200">
                    Profile Name 設定檔名稱
                  </label>
                  {isBuiltInProfile && (
                    <span className="rounded-md border border-sky-500/30 bg-sky-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-sky-300">
                      內建範本
                    </span>
                  )}
                </div>
                <span className="font-mono text-xs text-amber-300/90">
                  cURL 變數：${getProfileApiKeyEnvVar(currentProfile)}
                </span>
              </div>
              <input
                type="text"
                value={currentProfile.name}
                onChange={(e) =>
                  handleUpdateCurrent({ name: e.target.value })
                }
                placeholder="例：LLMShare、Ollama Cloud、Cloudflare Workers AI、TypeSafe AI"
                className="mt-1.5 w-full rounded-xl border border-[#2b303d] bg-[#0d0e12] px-3.5 py-2.5 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none"
              />
            </div>

            {/* 2. CLOUDFLARE_ACCOUNT_ID (for Cloudflare) OR Base URL (for other profiles) */}
            {isCf ? (
              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-semibold text-zinc-200">
                    CLOUDFLARE_ACCOUNT_ID 帳戶識別碼
                  </label>
                  <span className="font-mono text-xs text-zinc-400">
                    端點將自動組成
                  </span>
                </div>
                <input
                  type="text"
                  value={cfAccountId}
                  onChange={(e) =>
                    handleUpdateCurrent({
                      cloudflareAccountId: e.target.value,
                    })
                  }
                  placeholder="輸入您的 Cloudflare Account ID（留空則於 cURL 使用 $CLOUDFLARE_ACCOUNT_ID）"
                  className="mt-1.5 w-full rounded-xl border border-[#2b303d] bg-[#0d0e12] px-3.5 py-2.5 font-mono text-sm text-zinc-100 focus:border-amber-500 focus:outline-none"
                />
                <div className="mt-2 rounded-lg border border-[#232732] bg-[#090a0d] px-3 py-2 font-mono text-xs break-all text-zinc-400">
                  <span className="text-zinc-500">自動組成端點：</span>{' '}
                  <span className="text-amber-300/90">
                    {buildCloudflareEndpointUrl(
                      cfAccountId,
                      currentProfile.defaultModel
                    )}
                  </span>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-semibold text-zinc-200">
                    Base URL 端點根網址
                  </label>
                  <span className="font-mono text-xs text-zinc-400">
                    自動附加 /v1/systemone
                  </span>
                </div>
                <input
                  type="text"
                  value={currentProfile.baseUrl}
                  onChange={(e) =>
                    handleUpdateCurrent({ baseUrl: e.target.value })
                  }
                  placeholder="http://localhost:11434"
                  className="mt-1.5 w-full rounded-xl border border-[#2b303d] bg-[#0d0e12] px-3.5 py-2.5 font-mono text-sm text-zinc-100 focus:border-amber-500 focus:outline-none"
                />

                {/* Quick Templates: ONLY shown for non-built-in custom profiles */}
                {!isBuiltInProfile && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-zinc-400">
                      快速套用位址：
                    </span>
                    {BASE_URL_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.url}
                        type="button"
                        onClick={() =>
                          handleUpdateCurrent({
                            baseUrl: tpl.url,
                            defaultModel: tpl.defaultModel,
                            useProxy:
                              !tpl.url.includes('localhost') &&
                              !tpl.url.includes('127.0.0.1') &&
                              !tpl.url.startsWith('/api/'),
                          })
                        }
                        className="rounded-lg border border-[#2c313f] bg-[#181b22] px-2.5 py-1 text-xs font-medium text-zinc-300 transition hover:border-amber-500/50 hover:bg-amber-500/10 hover:text-amber-200"
                      >
                        {tpl.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 3. API Key (placed BEFORE Model Name as requested) */}
            <div>
              <label className="block text-sm font-semibold text-zinc-200">
                API Key 金鑰（選填，僅儲存於本機瀏覽器 LocalStorage）
              </label>
              <div className="relative mt-1.5">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={currentProfile.apiKey}
                  onChange={(e) =>
                    handleUpdateCurrent({ apiKey: e.target.value })
                  }
                  placeholder={`sk-... 或留空（複製 cURL 時預設使用 $${getProfileApiKeyEnvVar(currentProfile)}）`}
                  className="w-full rounded-xl border border-[#2b303d] bg-[#0d0e12] py-2.5 pr-10 pl-3.5 font-mono text-sm text-zinc-100 focus:border-amber-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((s) => !s)}
                  className="absolute inset-y-0 right-3 flex items-center text-zinc-400 hover:text-zinc-200"
                  title={showKey ? '隱藏金鑰' : '顯示金鑰'}
                >
                  {showKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* 4. Model Name (placed AFTER API Key, with dynamic /models discovery for clef/jev) */}
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-sm font-semibold text-zinc-200">
                  Model Name 預設模型名稱
                </label>
                {canFetchRemoteModels && (
                  <button
                    type="button"
                    onClick={() => void loadModels(currentProfile, true)}
                    disabled={loadingModelsId === currentProfile.id}
                    className="inline-flex items-center gap-1 text-xs font-medium text-amber-300/90 transition hover:text-amber-200 disabled:opacity-50"
                    title="從 /models 端點重新載入並篩選 clef / jev 相關模型"
                  >
                    <RefreshCw
                      className={`h-3 w-3 ${
                        loadingModelsId === currentProfile.id
                          ? 'animate-spin'
                          : ''
                      }`}
                    />
                    <span>
                      {loadingModelsId === currentProfile.id
                        ? '正在查詢 /models...'
                        : currentDiscoveredModels?.length
                          ? `已從 /models 篩選 (${currentDiscoveredModels.length})`
                          : '從 /models 取得模型'}
                    </span>
                  </button>
                )}
              </div>
              {isEndpointAndKeyValid ? (
                <select
                  value={currentProfile.defaultModel}
                  onChange={(e) =>
                    handleUpdateCurrent({ defaultModel: e.target.value })
                  }
                  aria-label="Select default model"
                  className="mt-1.5 w-full rounded-xl border border-[#2b303d] bg-[#0d0e12] px-3.5 py-2.5 font-mono text-sm text-amber-300 focus:border-amber-500 focus:outline-none"
                >
                  {selectableModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              ) : isLocalOllama ? (
                <>
                  <input
                    type="text"
                    readOnly
                    value={
                      loadingModelsId === currentProfile.id
                        ? '正在檢測本機 Ollama 連線與模型狀態...'
                        : getLocalOllamaStatusModelDisplay(
                            currentLocalOllamaDiag?.status
                          )
                    }
                    aria-label="Local Ollama model status"
                    className={`mt-1.5 w-full rounded-xl border bg-[#0d0e12] px-3.5 py-2.5 font-mono text-sm focus:outline-none ${
                      currentLocalOllamaDiag?.status === 'unreachable'
                        ? 'border-rose-500/40 text-rose-300'
                        : 'border-amber-500/40 text-amber-300'
                    }`}
                  />

                  {/* Case 1: Unreachable (ollama serve is not running or port refused) */}
                  {currentLocalOllamaDiag?.status === 'unreachable' && (
                    <div className="mt-2.5 rounded-xl border border-rose-500/35 bg-rose-500/10 p-3.5 text-xs">
                      <div className="flex items-start gap-2.5">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                        <div className="space-y-1.5">
                          <div className="font-semibold text-rose-200">
                            無法連線至本機 Ollama（{currentProfile.baseUrl}）
                          </div>
                          <p className="leading-relaxed text-rose-200/80">
                            偵測不到本機 Ollama 服務回應（Connection Refused）。請確認本機已安裝並啟動{' '}
                            <code className="rounded bg-black/40 px-1 py-0.5 font-mono text-rose-100">
                              ollama serve
                            </code>{' '}
                            或開啟 Ollama 應用程式。
                          </p>
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => void loadModels(currentProfile, true)}
                              disabled={loadingModelsId === currentProfile.id}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-400/40 bg-rose-500/20 px-2.5 py-1.5 font-medium text-rose-100 transition hover:bg-rose-500/30 disabled:opacity-50"
                            >
                              <RefreshCw
                                className={`h-3.5 w-3.5 ${
                                  loadingModelsId === currentProfile.id
                                    ? 'animate-spin'
                                    : ''
                                }`}
                              />
                              <span>重新檢測連線</span>
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                void handleCopyCommand(
                                  'serve-cli',
                                  'OLLAMA_ORIGINS="*" ollama serve'
                                )
                              }
                              className="inline-flex items-center gap-1.5 rounded-lg border border-[#2c313f] bg-[#14171f] px-2.5 py-1.5 font-mono text-zinc-200 transition hover:border-amber-500/50 hover:text-amber-200"
                              title='複製 OLLAMA_ORIGINS="*" ollama serve 啟動指令'
                            >
                              {copiedCmdKey === 'serve-cli' ? (
                                <>
                                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                                  <span className="text-emerald-300">
                                    已複製啟動指令
                                  </span>
                                </>
                              ) : (
                                <>
                                  <Terminal className="h-3.5 w-3.5 text-amber-400" />
                                  <span>
                                    複製指令: OLLAMA_ORIGINS=&quot;*&quot; ollama serve
                                  </span>
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                void handleCopyCommand(
                                  'mac-open-ollama',
                                  'launchctl setenv OLLAMA_ORIGINS "*" && open -a Ollama'
                                )
                              }
                              className="inline-flex items-center gap-1.5 rounded-lg border border-[#2c313f] bg-[#14171f] px-2.5 py-1.5 font-medium text-zinc-200 transition hover:border-amber-500/50 hover:text-amber-200"
                              title="複製 macOS 啟動 Ollama.app 指令"
                            >
                              {copiedCmdKey === 'mac-open-ollama' ? (
                                <>
                                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                                  <span className="text-emerald-300">
                                    已複製 macOS 啟動指令
                                  </span>
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3.5 w-3.5 text-zinc-400" />
                                  <span>複製 macOS 啟動 Ollama.app 指令</span>
                                </>
                              )}
                            </button>

                            <a
                              href="https://ollama.com/download"
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-lg border border-[#2c313f] bg-[#14171f] px-2.5 py-1.5 font-medium text-zinc-300 transition hover:border-amber-500/50 hover:text-amber-200"
                            >
                              <span>下載 Ollama</span>
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Case 2: Reachable, but CORS Blocked (HTTP 403 Forbidden due to OLLAMA_ORIGINS) */}
                  {currentLocalOllamaDiag?.status === 'cors_blocked' && (
                    <div className="mt-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs">
                      <div className="flex items-start gap-2.5">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                        <div className="space-y-1.5">
                          <div className="font-semibold text-amber-200">
                            本機 Ollama 已啟動，但被 CORS 跨域限制阻擋 (HTTP 403 Forbidden)
                          </div>
                          <p className="leading-relaxed text-amber-100/80">
                            已偵測到本機{' '}
                            <code className="rounded bg-black/40 px-1 py-0.5 font-mono text-amber-200">
                              {currentProfile.baseUrl}
                            </code>{' '}
                            正在運作，但 Ollama 預設僅允許{' '}
                            <code className="rounded bg-black/40 px-1 py-0.5 font-mono text-amber-200">
                              localhost
                            </code>{' '}
                            來源。請設定{' '}
                            <code className="rounded bg-black/40 px-1 py-0.5 font-mono text-amber-200">
                              OLLAMA_ORIGINS=&quot;*&quot;
                            </code>{' '}
                            並重新啟動本機 Ollama 即可解除阻擋。
                          </p>
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() =>
                                void handleCopyCommand(
                                  'mac-cors-restart',
                                  'launchctl setenv OLLAMA_ORIGINS "*" && killall Ollama 2>/dev/null; pkill -x ollama 2>/dev/null; sleep 1 && open -a Ollama'
                                )
                              }
                              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/50 bg-amber-500/20 px-2.5 py-1.5 font-semibold text-amber-100 transition hover:bg-amber-500/30"
                              title="複製 macOS 設定 OLLAMA_ORIGINS 並自動重啟 Ollama.app 的終端機指令"
                            >
                              {copiedCmdKey === 'mac-cors-restart' ? (
                                <>
                                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                                  <span className="text-emerald-300">
                                    已複製！請貼至終端機執行
                                  </span>
                                </>
                              ) : (
                                <>
                                  <Terminal className="h-3.5 w-3.5 text-amber-300" />
                                  <span>
                                    複製 macOS 設定 OLLAMA_ORIGINS 並重啟指令
                                  </span>
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                void handleCopyCommand(
                                  'cors-serve-cli',
                                  'OLLAMA_ORIGINS="*" ollama serve'
                                )
                              }
                              className="inline-flex items-center gap-1.5 rounded-lg border border-[#2c313f] bg-[#14171f] px-2.5 py-1.5 font-mono text-zinc-200 transition hover:border-amber-500/50 hover:text-amber-200"
                            >
                              {copiedCmdKey === 'cors-serve-cli' ? (
                                <>
                                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                                  <span className="text-emerald-300">
                                    已複製 CLI 指令
                                  </span>
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3.5 w-3.5 text-zinc-400" />
                                  <span>
                                    複製 CLI: OLLAMA_ORIGINS=&quot;*&quot; ollama serve
                                  </span>
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => void loadModels(currentProfile, true)}
                              disabled={loadingModelsId === currentProfile.id}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-[#2c313f] bg-[#14171f] px-2.5 py-1.5 font-medium text-amber-300 transition hover:border-amber-500/50 hover:bg-amber-500/10 disabled:opacity-50"
                            >
                              <RefreshCw
                                className={`h-3.5 w-3.5 ${
                                  loadingModelsId === currentProfile.id
                                    ? 'animate-spin'
                                    : ''
                                }`}
                              />
                              <span>我已重啟 Ollama，重新檢測</span>
                            </button>

                            <a
                              href="https://docs.ollama.com/faq#how-do-i-configure-ollama-server"
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-lg border border-[#2c313f] bg-[#14171f] px-2.5 py-1.5 font-medium text-zinc-300 transition hover:border-amber-500/50 hover:text-amber-200"
                            >
                              <span>官方 CORS 設定說明</span>
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Case 3: Reachable & CORS OK, but `clef` model is not downloaded yet */}
                  {(!currentLocalOllamaDiag ||
                    currentLocalOllamaDiag.status === 'model_missing') && (
                    <div className="mt-2.5 rounded-xl border border-amber-500/35 bg-amber-500/10 p-3.5 text-xs">
                      <div className="flex items-start gap-2.5">
                        <Download className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                        <div className="space-y-2">
                          <div className="font-semibold text-amber-200">
                            {currentLocalOllamaDiag?.status === 'model_missing'
                              ? `已成功連線至本機 Ollama${
                                  currentLocalOllamaDiag.allModelsCount > 0
                                    ? `（目前已安裝 ${currentLocalOllamaDiag.allModelsCount} 個其他模型）`
                                    : ''
                                }，但尚未下載 clef 模型`
                              : '尚未在本機 Ollama 偵測到 clef 模型'}
                          </div>
                          <p className="leading-relaxed text-amber-100/80">
                            您可以直接點擊下方按鈕透過 HTTP REST API（
                            <code className="rounded bg-black/40 px-1 py-0.5 font-mono text-amber-200">
                              POST /api/pull
                            </code>
                            ）自動拉取{' '}
                            <code className="rounded bg-black/40 px-1 py-0.5 font-mono text-amber-200">
                              clef
                            </code>{' '}
                            模型，或複製 CLI 指令至終端機下載。
                          </p>
                          <div className="flex flex-wrap items-center gap-2 pt-0.5">
                            <button
                              type="button"
                              onClick={() => void handlePullLocalClef()}
                              disabled={pullingClef}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/50 bg-amber-500/20 px-3 py-1.5 font-semibold text-amber-100 transition hover:bg-amber-500/30 disabled:opacity-50"
                            >
                              {pullingClef ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Download className="h-3.5 w-3.5" />
                              )}
                              <span>
                                {pullingClef
                                  ? pullStatusText ||
                                    '正在透過 HTTP REST API 拉取 clef 模型...'
                                  : '透過 HTTP API (POST /api/pull) 直接拉取 clef 模型'}
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                void handleCopyCommand(
                                  'ollama-pull-clef',
                                  'ollama pull clef'
                                )
                              }
                              className="inline-flex items-center gap-1.5 rounded-lg border border-[#2c313f] bg-[#14171f] px-2.5 py-1.5 font-mono text-zinc-200 transition hover:border-amber-500/50 hover:text-amber-200"
                            >
                              {copiedCmdKey === 'ollama-pull-clef' ? (
                                <>
                                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                                  <span className="text-emerald-300">
                                    已複製指令
                                  </span>
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3.5 w-3.5 text-zinc-400" />
                                  <span>複製 CLI: ollama pull clef</span>
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => void loadModels(currentProfile, true)}
                              disabled={loadingModelsId === currentProfile.id}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-[#2c313f] bg-[#14171f] px-2.5 py-1.5 font-medium text-zinc-200 transition hover:border-amber-500/50 hover:text-amber-200 disabled:opacity-50"
                            >
                              <RefreshCw
                                className={`h-3.5 w-3.5 ${
                                  loadingModelsId === currentProfile.id
                                    ? 'animate-spin'
                                    : ''
                                }`}
                              />
                              <span>重新檢測 /models</span>
                            </button>

                            <a
                              href="https://ollama.com/library/clef"
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-lg border border-[#2c313f] bg-[#14171f] px-2.5 py-1.5 font-medium text-zinc-300 transition hover:border-amber-500/50 hover:text-amber-200"
                            >
                              <span>Ollama clef 模型頁</span>
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {pullErrorText && (
                    <div className="mt-2 text-xs font-medium text-rose-400">
                      {pullErrorText}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <input
                    type="text"
                    value={currentProfile.defaultModel}
                    onChange={(e) =>
                      handleUpdateCurrent({ defaultModel: e.target.value })
                    }
                    placeholder={
                      isCf
                        ? '@cf/cloudflare/clef / @cf/cloudflare/clef-omni / @cf/cloudflare/clef-flash'
                        : 'clef:27b / clef / jev-latest'
                    }
                    className="mt-1.5 w-full rounded-xl border border-[#2b303d] bg-[#0d0e12] px-3.5 py-2.5 font-mono text-sm text-zinc-100 focus:border-amber-500 focus:outline-none"
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-zinc-400">常用模型：</span>
                    {commonModelsList.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() =>
                          handleUpdateCurrent({ defaultModel: m })
                        }
                        className={`rounded-md px-2.5 py-1 font-mono text-xs font-medium transition ${
                          currentProfile.defaultModel === m
                            ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40'
                            : 'bg-[#181b22] text-zinc-300 hover:bg-[#222631]'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="rounded-xl border border-[#262b38] bg-[#0d0e12] p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  {currentProfile.useProxy ? (
                    <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                  ) : (
                    <Globe className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                  )}
                  <div>
                    <div className="text-sm font-semibold text-zinc-100">
                      CORS 發送模式：
                      {currentProfile.useProxy ? 'Proxy Mode' : 'Direct Mode'}
                    </div>
                    <div className="mt-1 text-xs leading-relaxed text-zinc-400">
                      {currentProfile.useProxy
                        ? '由內建無狀態 Edge API 代轉請求，解決雲端或跨網域 CORS 阻擋，伺服器絕不留存任何金鑰。'
                        : '由瀏覽器 fetch 直接呼叫目標端點，適合本機 localhost 或已設定 OLLAMA_ORIGINS=* 的服務。'}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    handleUpdateCurrent({ useProxy: !currentProfile.useProxy })
                  }
                  className={`shrink-0 rounded-lg px-3.5 py-2 text-xs font-bold transition ${
                    currentProfile.useProxy
                      ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40'
                      : 'bg-[#1c202a] text-zinc-300 ring-1 ring-[#2f3545]'
                  }`}
                >
                  {currentProfile.useProxy ? 'Proxy: ON' : 'Direct Mode'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#232732] bg-[#0d0e12] px-6 py-4">
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <Lock className="h-3.5 w-3.5 text-emerald-400" />
            <span>所有連線設定與 API Key 皆僅保存於您的瀏覽器本機端</span>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[#2c313f] bg-[#161922] px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-[#1f2330]"
            >
              關閉
            </button>
            <button
              type="button"
              onClick={() => {
                onSaveProfiles(profiles, currentProfile.id);
                onClose();
              }}
              className="rounded-xl bg-amber-500 px-5 py-2 text-sm font-bold text-zinc-950 transition hover:bg-amber-400"
            >
              設為當前使用端點
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import { EndpointProfile } from '@/types/systemone';
import { BASE_URL_TEMPLATES, DEFAULT_PROFILES } from '@/lib/presets';
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
  const [showKey, setShowKey] = useState(false);

  if (!isOpen) return null;

  const currentProfile =
    profiles.find((p) => p.id === selectedId) || profiles[0];

  const handleUpdateCurrent = (patch: Partial<EndpointProfile>) => {
    const next = profiles.map((p) =>
      p.id === currentProfile.id ? { ...p, ...patch } : p
    );
    onSaveProfiles(next);
  };

  const handleAddNew = () => {
    const newProfile: EndpointProfile = {
      id: `profile-${Date.now()}`,
      name: `Custom Endpoint #${profiles.length + 1}`,
      baseUrl: 'http://localhost:11434',
      apiKey: '',
      defaultModel: 'clef',
      useProxy: true,
    };
    const next = [...profiles, newProfile];
    onSaveProfiles(next, newProfile.id);
    setSelectedId(newProfile.id);
  };

  const handleDelete = (id: string) => {
    if (profiles.length <= 1) return;
    const next = profiles.filter((p) => p.id !== id);
    const nextActive =
      activeProfileId === id ? next[0].id : activeProfileId;
    onSaveProfiles(next, nextActive);
    setSelectedId(next[0].id);
  };

  const handleResetDefaults = () => {
    onSaveProfiles(DEFAULT_PROFILES, DEFAULT_PROFILES[0].id);
    setSelectedId(DEFAULT_PROFILES[0].id);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
    >
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900 text-slate-100 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <Server className="h-5 w-5 text-indigo-400" />
            <h2 id="profile-modal-title" className="text-base font-semibold">
              端點與連線管理 (Endpoint Profiles)
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="grid flex-1 grid-cols-1 overflow-y-auto md:grid-cols-12">
          {/* Left list */}
          <div className="flex flex-col justify-between border-b border-slate-800 bg-slate-950/60 p-3 md:col-span-5 md:border-b-0 md:border-r">
            <div className="space-y-1.5">
              <div className="px-2 py-1 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                已儲存設定檔 ({profiles.length})
              </div>
              {profiles.map((p) => {
                const isSelected = p.id === currentProfile.id;
                const isActive = p.id === activeProfileId;
                return (
                  <div
                    key={p.id}
                    onClick={() => setSelectedId(p.id)}
                    className={`group flex cursor-pointer items-center justify-between rounded-lg px-3 py-2.5 text-left transition ${
                      isSelected
                        ? 'bg-indigo-600/20 text-indigo-200 ring-1 ring-indigo-500/40'
                        : 'text-slate-300 hover:bg-slate-800/70'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-xs font-medium">
                          {p.name}
                        </span>
                        {isActive && (
                          <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-slate-500">
                        {p.baseUrl} · {p.defaultModel || 'no-model'}
                      </div>
                    </div>
                    {profiles.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(p.id);
                        }}
                        className="ml-2 rounded p-1 text-slate-500 opacity-0 transition hover:bg-rose-500/20 hover:text-rose-300 group-hover:opacity-100"
                        title="刪除此 Profile"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex flex-col gap-2 pt-3 border-t border-slate-800/80">
              <button
                type="button"
                onClick={handleAddNew}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-indigo-500"
              >
                <Plus className="h-3.5 w-3.5" />
                新增 Profile
              </button>
              <button
                type="button"
                onClick={handleResetDefaults}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-[11px] text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
              >
                <RotateCcw className="h-3 w-3" />
                重置為預設範本
              </button>
            </div>
          </div>

          {/* Right editor */}
          <div className="space-y-4 p-5 md:col-span-7">
            <div>
              <label className="block text-xs font-medium text-slate-300">
                Profile Name (自訂名稱)
              </label>
              <input
                type="text"
                value={currentProfile.name}
                onChange={(e) =>
                  handleUpdateCurrent({ name: e.target.value })
                }
                placeholder="例：Ollama Cloud、Local Clef、TypeSafe Jev"
                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-medium text-slate-300">
                  Base URL (端點根網址)
                </label>
                <span className="text-[11px] text-slate-500">
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
                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100 focus:border-indigo-500 focus:outline-none"
              />

              {/* Quick Templates */}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-slate-400">快速套用範本：</span>
                {BASE_URL_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.url}
                    type="button"
                    onClick={() =>
                      handleUpdateCurrent({
                        baseUrl: tpl.url,
                        defaultModel: tpl.defaultModel,
                      })
                    }
                    className="rounded-md border border-slate-700/80 bg-slate-800/80 px-2 py-1 text-[11px] text-slate-300 transition hover:border-indigo-500/60 hover:bg-indigo-500/15 hover:text-indigo-200"
                  >
                    {tpl.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-medium text-slate-300">
                  Model Name (預設模型識別碼)
                </label>
              </div>
              <input
                type="text"
                value={currentProfile.defaultModel}
                onChange={(e) =>
                  handleUpdateCurrent({ defaultModel: e.target.value })
                }
                placeholder="clef:cloud / clef / clef-flash / jev-1.13.0"
                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100 focus:border-indigo-500 focus:outline-none"
              />
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {['clef', 'clef-flash', 'clef:cloud', 'jev-1.13.0'].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => handleUpdateCurrent({ defaultModel: m })}
                    className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300">
                API Key (選填，僅儲存在瀏覽器 LocalStorage)
              </label>
              <div className="relative mt-1.5">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={currentProfile.apiKey}
                  onChange={(e) =>
                    handleUpdateCurrent({ apiKey: e.target.value })
                  }
                  placeholder="sk-... 或留空（本機 Ollama 免填）"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pr-9 pl-3 font-mono text-xs text-slate-100 focus:border-indigo-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((s) => !s)}
                  className="absolute inset-y-0 right-2 flex items-center text-slate-400 hover:text-slate-200"
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

            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {currentProfile.useProxy ? (
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <Globe className="h-4 w-4 text-amber-400" />
                  )}
                  <div>
                    <div className="text-xs font-medium text-slate-200">
                      CORS 發送模式：
                      {currentProfile.useProxy
                        ? 'Proxy Mode (無狀態代理轉發)'
                        : 'Direct Mode (瀏覽器直連)'}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {currentProfile.useProxy
                        ? '由內建無狀態 Edge API 代轉請求，解決雲端或本機 CORS 阻擋，不留存任何金鑰。'
                        : '由瀏覽器 fetch 直接連線目標端點，適合已設定 OLLAMA_ORIGINS=* 的服務。'}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    handleUpdateCurrent({ useProxy: !currentProfile.useProxy })
                  }
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    currentProfile.useProxy
                      ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {currentProfile.useProxy ? 'Proxy: ON' : 'Direct'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-800 bg-slate-950 px-5 py-3">
          <div className="text-[11px] text-slate-400">
            🔒 所有連線設定與 API Key 皆僅保留於本機瀏覽器端
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onSaveProfiles(profiles, currentProfile.id);
                onClose();
              }}
              className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
            >
              設為當前使用並關閉
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

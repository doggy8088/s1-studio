'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  clearAllHistory,
  deleteCustomPreset,
  deleteHistoryEntry,
  saveCustomPreset,
} from '@/lib/db';
import { BUILT_IN_PRESETS } from '@/lib/presets';
import {
  S1ExportFileFormat,
  S1HistoryEntry,
  S1PresetDefinition,
  S1Question,
  S1RequestPayload,
  UploadedImageItem,
} from '@/types/systemone';
import {
  Bookmark,
  History,
  Download,
  Upload,
  Trash2,
  RotateCcw,
  Plus,
  X,
  Clock,
  FileJson,
  Split,
  Layers,
} from 'lucide-react';

interface PresetsAndHistoryModalProps {
  isOpen: boolean;
  initialTab: 'presets' | 'history';
  onClose: () => void;
  currentStateMode: 'text' | 'json';
  currentStateText: string;
  currentImages: UploadedImageItem[];
  currentQuestions: Record<string, S1Question>;
  currentPayload: S1RequestPayload;
  onApplyPresetOrHistory: (data: {
    presetId?: string;
    stateMode: 'text' | 'json';
    stateText: string;
    images?: UploadedImageItem[];
    questions: Record<string, S1Question>;
  }) => void;
}

export function PresetsAndHistoryModal({
  isOpen,
  initialTab,
  onClose,
  currentStateMode,
  currentStateText,
  currentImages,
  currentQuestions,
  currentPayload,
  onApplyPresetOrHistory,
}: PresetsAndHistoryModalProps) {
  const [tab, setTab] = useState<'presets' | 'history'>(initialTab);
  const [prevSyncKey, setPrevSyncKey] = useState(`${isOpen}:${initialTab}`);
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetDesc, setNewPresetDesc] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const currentSyncKey = `${isOpen}:${initialTab}`;
  if (currentSyncKey !== prevSyncKey) {
    setPrevSyncKey(currentSyncKey);
    setTab(initialTab);
  }

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const historyList = useLiveQuery(
    () => db.history.orderBy('timestamp').reverse().limit(50).toArray(),
    []
  );

  const customPresets = useLiveQuery(
    () => db.customPresets.orderBy('createdAt').reverse().toArray(),
    []
  );

  if (!isOpen) return null;

  const handleSaveCurrentAsPreset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPresetName.trim()) return;

    const preset: S1PresetDefinition = {
      id: `custom-${Date.now()}`,
      name: newPresetName.trim(),
      description:
        newPresetDesc.trim() ||
        `包含 ${Object.keys(currentQuestions).length} 個決策問題的自訂範本`,
      category: 'custom',
      stateMode: currentStateMode,
      stateText: currentStateText,
      images: currentImages,
      questions: currentQuestions,
      createdAt: Date.now(),
      isBuiltIn: false,
    };

    await saveCustomPreset(preset);
    setNewPresetName('');
    setNewPresetDesc('');
  };

  const handleExportS1Json = () => {
    const exportObj: S1ExportFileFormat = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      name: 's1-studio-test-definition',
      stateMode: currentStateMode,
      stateText: currentStateText,
      payload: currentPayload,
    };

    const blob = new Blob([JSON.stringify(exportObj, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `test-case-${new Date().toISOString().slice(0, 10)}.s1.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportS1Json = async (file: File) => {
    setImportError(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (parsed && parsed.payload && parsed.payload.questions) {
        const exp = parsed as S1ExportFileFormat;
        const importedImages: UploadedImageItem[] = (
          exp.payload.images || []
        ).map((b64, idx) => ({
          id: `imp-${Date.now()}-${idx}`,
          name: `imported-image-${idx + 1}.png`,
          mimeType: 'image/png',
          sizeBytes: Math.round((b64.length * 3) / 4),
          rawBase64: b64,
          previewDataUrl: `data:image/png;base64,${b64}`,
        }));

        onApplyPresetOrHistory({
          stateMode: exp.stateMode || 'json',
          stateText:
            exp.stateText ??
            (typeof exp.payload.state === 'string'
              ? exp.payload.state
              : JSON.stringify(exp.payload.state, null, 2)),
          images: importedImages,
          questions: exp.payload.questions,
        });
        onClose();
        return;
      }

      if (parsed && parsed.questions && 'state' in parsed) {
        const rawPayload = parsed as S1RequestPayload;
        const isStringState = typeof rawPayload.state === 'string';
        const importedImages: UploadedImageItem[] = (
          rawPayload.images || []
        ).map((b64, idx) => ({
          id: `imp-${Date.now()}-${idx}`,
          name: `imported-image-${idx + 1}.png`,
          mimeType: 'image/png',
          sizeBytes: Math.round((b64.length * 3) / 4),
          rawBase64: b64,
          previewDataUrl: `data:image/png;base64,${b64}`,
        }));

        onApplyPresetOrHistory({
          stateMode: isStringState ? 'text' : 'json',
          stateText: isStringState
            ? (rawPayload.state as string)
            : JSON.stringify(rawPayload.state, null, 2),
          images: importedImages,
          questions: rawPayload.questions,
        });
        onClose();
        return;
      }

      setImportError(
        '檔案格式不符合 .s1.json 或 /v1/systemone Request Payload 規範。'
      );
    } catch (err) {
      setImportError(
        `匯入失敗: ${err instanceof Error ? err.message : 'Invalid JSON'}`
      );
    }
  };

  const handleRestoreHistory = (entry: S1HistoryEntry) => {
    const restoredImages: UploadedImageItem[] = (
      entry.requestPayload.images || []
    ).map((b64, idx) => ({
      id: `hist-img-${idx}`,
      name: `restored-image-${idx + 1}.png`,
      mimeType: 'image/png',
      sizeBytes: Math.round((b64.length * 3) / 4),
      rawBase64: b64,
      previewDataUrl: `data:image/png;base64,${b64}`,
    }));

    onApplyPresetOrHistory({
      stateMode: entry.stateMode,
      stateText: entry.stateText,
      images: restoredImages,
      questions: entry.requestPayload.questions,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[#2a2f3d] bg-[#12141a] text-zinc-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#232732] px-6 py-4">
          <div className="inline-flex rounded-xl border border-[#282d3a] bg-[#0d0e12] p-1">
            <button
              type="button"
              onClick={() => setTab('presets')}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                tab === 'presets'
                  ? 'bg-amber-500 text-zinc-950 font-bold'
                  : 'text-zinc-300 hover:text-zinc-100'
              }`}
            >
              <Bookmark className="h-4 w-4" />
              測試場景範本 (Presets)
            </button>
            <button
              type="button"
              onClick={() => setTab('history')}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                tab === 'history'
                  ? 'bg-amber-500 text-zinc-950 font-bold'
                  : 'text-zinc-300 hover:text-zinc-100'
              }`}
            >
              <History className="h-4 w-4" />
              執行歷史紀錄 ({historyList?.length ?? 0}/50)
            </button>
          </div>

          <div className="flex items-center gap-2.5">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.s1.json,application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  handleImportS1Json(file);
                  e.target.value = '';
                }
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 rounded-xl border border-[#2c313f] bg-[#171a22] px-3.5 py-2 text-sm font-medium text-zinc-200 transition hover:bg-[#202430]"
            >
              <Upload className="h-4 w-4 text-sky-400" />
              匯入 `.s1.json`
            </button>
            <button
              type="button"
              onClick={handleExportS1Json}
              className="flex items-center gap-2 rounded-xl border border-[#2c313f] bg-[#171a22] px-3.5 py-2 text-sm font-medium text-zinc-200 transition hover:bg-[#202430]"
            >
              <Download className="h-4 w-4 text-emerald-400" />
              匯出 `.s1.json`
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-zinc-400 transition hover:bg-[#1e222d] hover:text-zinc-100"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {importError && (
          <div className="border-b border-rose-500/40 bg-rose-500/10 px-6 py-3 text-sm text-rose-200">
            {importError}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {tab === 'presets' ? (
            <div className="space-y-6">
              {/* Save current state as custom preset */}
              <form
                onSubmit={handleSaveCurrentAsPreset}
                className="rounded-xl border border-[#262b38] bg-[#0d0e12] p-4"
              >
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-300">
                  <Plus className="h-4 w-4" />
                  將當前編輯狀態儲存為自訂範本（保存於本機 IndexedDB）
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                  <input
                    type="text"
                    required
                    value={newPresetName}
                    onChange={(e) => setNewPresetName(e.target.value)}
                    placeholder="範本名稱 (例：電商退貨詐欺風險評估)"
                    className="rounded-xl border border-[#2b303d] bg-[#14171f] px-3.5 py-2 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none sm:col-span-4"
                  />
                  <input
                    type="text"
                    value={newPresetDesc}
                    onChange={(e) => setNewPresetDesc(e.target.value)}
                    placeholder="簡短說明 (選填)"
                    className="rounded-xl border border-[#2b303d] bg-[#14171f] px-3.5 py-2 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none sm:col-span-6"
                  />
                  <button
                    type="submit"
                    className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-zinc-950 transition hover:bg-amber-400 sm:col-span-2"
                  >
                    儲存範本
                  </button>
                </div>
              </form>

              {/* Built-in Presets */}
              <div className="space-y-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold tracking-wider text-zinc-300 uppercase">
                  <Layers className="h-4 w-4 text-amber-400" />
                  內建真實測試場景 (Built-in Scenarios)
                </h3>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {BUILT_IN_PRESETS.map((preset) => (
                    <div
                      key={preset.id}
                      className="flex flex-col justify-between rounded-xl border border-[#262b38] bg-[#0d0e12] p-5 transition hover:border-amber-500/45"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="rounded-md bg-amber-500/15 px-2.5 py-0.5 font-mono text-xs font-semibold text-amber-300 uppercase ring-1 ring-amber-500/30">
                            {preset.category}
                          </span>
                          <span className="telemetry-num font-mono text-xs text-zinc-400">
                            {Object.keys(preset.questions).length} Questions
                          </span>
                        </div>
                        <h4 className="mt-3 text-base font-bold text-zinc-100">
                          {preset.name}
                        </h4>
                        <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
                          {preset.description}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          onApplyPresetOrHistory({
                            presetId: preset.id,
                            stateMode: preset.stateMode,
                            stateText: preset.stateText,
                            images: preset.images || [],
                            questions: preset.questions,
                          });
                          onClose();
                        }}
                        className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-[#2c313f] bg-[#181b22] py-2.5 text-sm font-semibold text-zinc-100 transition hover:border-amber-500 hover:bg-amber-500 hover:text-zinc-950"
                      >
                        <FileJson className="h-4 w-4" />
                        載入此測試場景
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Custom Presets */}
              {customPresets && customPresets.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold tracking-wider text-zinc-300 uppercase">
                    自訂範本 ({customPresets.length})
                  </h3>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {customPresets.map((preset) => (
                      <div
                        key={preset.id}
                        className="flex items-center justify-between rounded-xl border border-[#262b38] bg-[#0d0e12] p-4"
                      >
                        <div className="min-w-0 flex-1 pr-3">
                          <div className="truncate text-sm font-bold text-zinc-100">
                            {preset.name}
                          </div>
                          <div className="mt-1 truncate text-xs text-zinc-400">
                            {preset.description}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              onApplyPresetOrHistory({
                                presetId: preset.id,
                                stateMode: preset.stateMode,
                                stateText: preset.stateText,
                                images: preset.images || [],
                                questions: preset.questions,
                              });
                              onClose();
                            }}
                            className="rounded-lg bg-amber-500 px-3.5 py-2 text-xs font-bold text-zinc-950 hover:bg-amber-400"
                          >
                            套用
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteCustomPreset(preset.id)}
                            className="rounded-lg p-2 text-zinc-400 hover:bg-rose-500/20 hover:text-rose-300"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-zinc-400">
                  自動於本機 IndexedDB 保存最近 50 筆測試請求與回應紀錄。
                </p>
                {historyList && historyList.length > 0 && (
                  <button
                    type="button"
                    onClick={() => clearAllHistory()}
                    className="flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/20"
                  >
                    <Trash2 className="h-4 w-4" />
                    清空全部紀錄
                  </button>
                )}
              </div>

              {!historyList || historyList.length === 0 ? (
                <div className="flex h-52 flex-col items-center justify-center rounded-xl border border-dashed border-[#282d3a] text-sm text-zinc-400">
                  尚無歷史測試紀錄，執行一次 Evaluate 後即會自動記錄。
                </div>
              ) : (
                <div className="space-y-2.5">
                  {historyList.map((entry) => {
                    const qKeys = Object.keys(
                      entry.requestPayload.questions || {}
                    );
                    const isSuccess =
                      entry.primaryRun.status >= 200 &&
                      entry.primaryRun.status < 300;

                    return (
                      <div
                        key={entry.id}
                        className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#262b38] bg-[#0d0e12] p-4 transition hover:border-[#353b4b]"
                      >
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <span
                              className={`telemetry-num rounded-md px-2 py-0.5 font-mono text-xs font-bold ${
                                isSuccess
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : 'bg-rose-500/20 text-rose-300'
                              }`}
                            >
                              {entry.primaryRun.status || 'ERR'}
                            </span>
                            <span className="text-sm font-bold text-zinc-100">
                              {entry.profileName}
                            </span>
                            <span className="rounded-md bg-[#181b22] px-2 py-0.5 font-mono text-xs text-amber-300 ring-1 ring-[#2b303d]">
                              {entry.model}
                            </span>
                            {entry.compareRun && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-sky-500/20 px-2 py-0.5 text-xs font-semibold text-sky-300">
                                <Split className="h-3.5 w-3.5" />
                                vs {entry.compareRun.profileName}
                              </span>
                            )}
                            <span className="telemetry-num flex items-center gap-1 font-mono text-xs text-zinc-400">
                              <Clock className="h-3.5 w-3.5" />
                              {entry.primaryRun.latencyMs} ms
                            </span>
                            <span className="text-xs text-zinc-500">
                              {new Date(entry.timestamp).toLocaleString()}
                            </span>
                          </div>

                          <div className="truncate font-mono text-xs text-zinc-400">
                            Questions ({qKeys.length}): {qKeys.join(', ')} ·
                            State: {entry.stateText.slice(0, 90)}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleRestoreHistory(entry)}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-bold text-zinc-950 hover:bg-amber-400"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            還原此狀態
                          </button>
                          {entry.id !== undefined && (
                            <button
                              type="button"
                              onClick={() => deleteHistoryEntry(entry.id!)}
                              className="rounded-lg p-2 text-zinc-500 hover:bg-rose-500/20 hover:text-rose-300"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { useEffect } from 'react';
import { AlertTriangle, ArrowRight, ShieldCheck, X } from 'lucide-react';
import type { ProfileImportConflict } from '@/lib/profile-link';

interface ProfileImportConflictModalProps {
  conflict: ProfileImportConflict | null;
  onOverwrite: () => void;
  onKeepExisting: () => void;
  onCancel: () => void;
}

export function ProfileImportConflictModal({
  conflict,
  onOverwrite,
  onKeepExisting,
  onCancel,
}: ProfileImportConflictModalProps) {
  useEffect(() => {
    if (!conflict) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [conflict, onCancel]);

  if (!conflict) return null;

  const { existing, changedFields } = conflict;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-import-conflict-title"
      aria-describedby="profile-import-conflict-desc"
      onClick={onCancel}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-amber-500/30 bg-[#12141a] text-zinc-100 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#232732] px-6 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-400">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="profile-import-conflict-title"
                className="text-lg font-bold"
              >
                Profile 設定衝突
              </h2>
              <p
                id="profile-import-conflict-desc"
                className="mt-1 text-xs text-zinc-400"
              >
                網址帶入的設定與本機既有 Profile 不同，請確認是否覆寫。
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-2 text-zinc-400 transition hover:bg-[#1e222d] hover:text-zinc-100"
            aria-label="關閉衝突確認視窗"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-6 py-5">
          <p className="text-sm leading-relaxed text-zinc-300">
            本機已存在名為「
            <span className="font-semibold text-amber-200">{existing.name}</span>
            」的 Profile，但下列設定與網址不同：
          </p>

          <div className="space-y-2">
            {changedFields.map((field) => (
              <div
                key={field.key}
                className="rounded-xl border border-[#2a2f3d] bg-[#0d0e12] p-3"
              >
                <div className="text-xs font-semibold tracking-wide text-zinc-400">
                  {field.label}
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                  <div className="rounded-lg bg-[#171a22] p-2">
                    <div className="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">
                      目前設定
                    </div>
                    <div className="mt-1 break-all font-mono text-xs text-zinc-300">
                      {field.before}
                    </div>
                  </div>
                  <ArrowRight className="mx-auto hidden h-4 w-4 text-zinc-600 sm:block" />
                  <div className="rounded-lg bg-amber-500/10 p-2 ring-1 ring-amber-500/25">
                    <div className="text-[10px] font-semibold tracking-wider text-amber-400/80 uppercase">
                      網址設定
                    </div>
                    <div className="mt-1 break-all font-mono text-xs text-amber-200">
                      {field.after}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <p className="text-xs leading-relaxed text-emerald-100/80">
              API Key 不會從網址傳入。選擇「覆寫並切換」時只會更新上方欄位，
              本機已儲存的 API Key 會完整保留。
            </p>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <p className="text-xs leading-relaxed text-amber-100/80">
              請確認連結來源與端點可信。執行評估時，State 與圖片會傳送至這個
              Profile 所設定的端點。
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#232732] bg-[#0d0e12] px-6 py-4">
          <span className="text-xs text-zinc-500">按 ESC 可取消匯入</span>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onKeepExisting}
              className="rounded-xl border border-[#2c313f] bg-[#161922] px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-[#1f2330]"
            >
              保留現有並切換
            </button>
            <button
              type="button"
              onClick={onOverwrite}
              className="rounded-xl bg-amber-500 px-5 py-2 text-sm font-bold text-zinc-950 transition hover:bg-amber-400"
            >
              覆寫並切換
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

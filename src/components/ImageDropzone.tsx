'use client';

import React, { useRef, useState } from 'react';
import { UploadedImageItem } from '@/types/systemone';
import {
  MAX_IMAGE_MEGAPIXELS,
  MAX_IMAGES,
  MAX_SINGLE_IMAGE_BYTES,
  MAX_TOTAL_IMAGES_BYTES,
} from '@/lib/s1-utils';
import {
  ImagePlus,
  Trash2,
  AlertTriangle,
  ClipboardPaste,
  CheckCircle2,
} from 'lucide-react';

interface ImageDropzoneProps {
  images: UploadedImageItem[];
  onChange: (images: UploadedImageItem[]) => void;
}

const ACCEPTED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

export function ImageDropzone({ images, onChange }: ImageDropzoneProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [warningMsg, setWarningMsg] = useState<string | null>(null);

  const totalSizeBytes = images.reduce((acc, img) => acc + img.sizeBytes, 0);

  const processFiles = async (fileList: FileList | File[]) => {
    setWarningMsg(null);
    const files = Array.from(fileList);
    if (files.length === 0) return;

    const warnings: string[] = [];
    const currentList = [...images];
    let runningTotalBytes = totalSizeBytes;

    for (const file of files) {
      if (currentList.length >= MAX_IMAGES) {
        warnings.push(
          `單次請求最多上傳 ${MAX_IMAGES} 張圖片（已忽略超出的檔案 "${file.name}"）。`
        );
        break;
      }

      if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
        warnings.push(
          `檔案 "${file.name}" 格式不支援（僅接受 PNG、JPEG、WebP）。`
        );
        continue;
      }

      if (file.size > MAX_SINGLE_IMAGE_BYTES) {
        warnings.push(
          `檔案 "${file.name}" (${formatBytes(file.size)}) 超過單張 4 MiB 上限。`
        );
        continue;
      }

      if (runningTotalBytes + file.size > MAX_TOTAL_IMAGES_BYTES) {
        warnings.push(
          `加入 "${file.name}" 後總容量將超過 8 MiB 上限（目前累計 ${formatBytes(runningTotalBytes)}）。`
        );
        continue;
      }

      try {
        const item = await readFileToUploadedImage(file);
        if (
          item.width &&
          item.height &&
          item.width * item.height > MAX_IMAGE_MEGAPIXELS
        ) {
          const mp = ((item.width * item.height) / 1_000_000).toFixed(1);
          warnings.push(
            `圖片 "${file.name}" 解析度 (${item.width}x${item.height}, ${mp} MP) 超過 16 MP 上限。`
          );
          continue;
        }

        currentList.push(item);
        runningTotalBytes += file.size;
      } catch (err) {
        warnings.push(
          `讀取圖片 "${file.name}" 失敗: ${err instanceof Error ? err.message : 'Unknown error'}`
        );
      }
    }

    if (warnings.length > 0) {
      setWarningMsg(warnings.join(' '));
    }

    onChange(currentList);
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) imageFiles.push(f);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      await processFiles(imageFiles);
    }
  };

  const handleRemove = (id: string) => {
    setWarningMsg(null);
    onChange(images.filter((img) => img.id !== id));
  };

  return (
    <div
      onPaste={handlePaste}
      className="space-y-2 rounded-xl border border-slate-800/90 bg-slate-900/50 p-3.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-200">
            Images 視覺輸入
          </span>
          <span
            className={`rounded-full px-2 py-0.5 font-mono text-[11px] font-medium ${
              images.length >= MAX_IMAGES
                ? 'bg-amber-500/20 text-amber-300'
                : 'bg-slate-800 text-slate-400'
            }`}
          >
            {images.length}/{MAX_IMAGES}
          </span>
          <span className="text-[11px] text-slate-500">
            ({formatBytes(totalSizeBytes)} / 8.00 MiB)
          </span>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <span className="hidden sm:inline-flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-emerald-400" />
            自動剝除 data:image/...;base64, 前綴
          </span>
          {images.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setWarningMsg(null);
                onChange([]);
              }}
              className="text-rose-400 hover:text-rose-300 underline"
            >
              清空全部
            </button>
          )}
        </div>
      </div>

      {/* Dropzone area */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={async (e) => {
          e.preventDefault();
          setIsDragging(false);
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            await processFiles(e.dataTransfer.files);
          }
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-4 py-3 text-center transition ${
          isDragging
            ? 'border-indigo-400 bg-indigo-500/10'
            : 'border-slate-700/80 bg-slate-950/50 hover:border-slate-600 hover:bg-slate-900/70'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          onChange={async (e) => {
            if (e.target.files) {
              await processFiles(e.target.files);
              e.target.value = '';
            }
          }}
        />
        <div className="flex items-center gap-2 text-xs text-slate-300">
          <ImagePlus className="h-4 w-4 text-indigo-400" />
          <span>
            拖曳或點擊上傳 PNG / JPG / WebP，或於此區塊按{' '}
            <kbd className="rounded border border-slate-700 bg-slate-800 px-1 py-0.5 font-mono text-[10px]">
              ⌘V
            </kbd>{' '}
            貼上剪貼簿截圖
          </span>
          <ClipboardPaste className="h-3.5 w-3.5 text-slate-500" />
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          支援 clef 多模態模型 · 上限 4 張 · 單張 ≤ 4 MiB (16 MP) · 總計 ≤ 8 MiB
        </p>
      </div>

      {/* Warning banner */}
      {warningMsg && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div className="flex-1">{warningMsg}</div>
        </div>
      )}

      {/* Thumbnails grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-4">
          {images.map((img, idx) => (
            <div
              key={img.id}
              className="group relative flex flex-col overflow-hidden rounded-lg border border-slate-800 bg-slate-950 p-1.5"
            >
              <div className="relative flex h-20 w-full items-center justify-center overflow-hidden rounded bg-slate-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.previewDataUrl}
                  alt={img.name}
                  className="max-h-full max-w-full object-contain"
                />
                <span className="absolute top-1 left-1 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-slate-200">
                  #{idx + 1}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove(img.id);
                  }}
                  className="absolute top-1 right-1 rounded bg-rose-600/90 p-1 text-white opacity-0 transition hover:bg-rose-500 group-hover:opacity-100"
                  title="移除圖片"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400">
                <span className="truncate font-medium text-slate-300">
                  {img.name}
                </span>
                <span className="shrink-0 font-mono text-slate-500">
                  {formatBytes(img.sizeBytes)}
                </span>
              </div>
              <div className="truncate font-mono text-[9px] text-slate-600">
                raw base64: {img.rawBase64.slice(0, 18)}...
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function readFileToUploadedImage(file: File): Promise<UploadedImageItem> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      // Strip `data:image/...;base64,` prefix to comply with /v1/systemone spec
      const rawBase64 = dataUrl.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');

      const imgEl = new Image();
      imgEl.onload = () => {
        resolve({
          id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: file.name || 'clipboard-image.png',
          mimeType: file.type,
          sizeBytes: file.size,
          width: imgEl.naturalWidth,
          height: imgEl.naturalHeight,
          rawBase64,
          previewDataUrl: dataUrl,
        });
      };
      imgEl.onerror = () => {
        resolve({
          id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: file.name || 'clipboard-image.png',
          mimeType: file.type,
          sizeBytes: file.size,
          rawBase64,
          previewDataUrl: dataUrl,
        });
      };
      imgEl.src = dataUrl;
    };
    reader.onerror = () => reject(new Error('FileReader error'));
    reader.readAsDataURL(file);
  });
}

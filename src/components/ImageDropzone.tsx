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
  ChevronDown,
  ChevronUp,
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
  const [isExpanded, setIsExpanded] = useState(false);
  const [warningMsg, setWarningMsg] = useState<string | null>(null);

  const totalSizeBytes = images.reduce((acc, img) => acc + img.sizeBytes, 0);
  const showFullDropzone = images.length > 0 || isExpanded || isDragging;

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
      className={`rounded-2xl border transition ${
        isDragging
          ? 'border-amber-400 bg-amber-500/10 p-4'
          : 'border-[#232730] bg-[#12141a] px-5 py-3.5 shadow-sm'
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

      {/* Compact Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-md border border-[#2c313d] bg-[#171a21] font-mono text-xs font-bold text-amber-400">
            02
          </span>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-base font-semibold tracking-tight text-zinc-100">
              Multimodal Vision 視覺附件
            </h2>
            <span
              className={`telemetry-num rounded-md px-2 py-0.5 font-mono text-xs font-semibold ${
                images.length > 0
                  ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40'
                  : 'bg-[#1a1d26] text-zinc-400 ring-1 ring-[#2b303c]'
              }`}
            >
              {images.length} / {MAX_IMAGES}
            </span>
            {images.length > 0 && (
              <span className="telemetry-num font-mono text-xs text-zinc-400">
                ({formatBytes(totalSizeBytes)} / 8.00 MiB)
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#2c313f] bg-[#171a22] px-3 py-1.5 text-xs font-semibold text-zinc-200 transition hover:border-amber-500/50 hover:bg-[#1e222d] hover:text-amber-200"
          >
            <ImagePlus className="h-3.5 w-3.5 text-amber-400" />
            <span>選擇圖片上傳</span>
          </button>

          {images.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                setWarningMsg(null);
                onChange([]);
              }}
              className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-xs font-medium text-rose-300 transition hover:bg-rose-500/20"
            >
              清空 ({images.length})
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsExpanded((v) => !v)}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-zinc-400 transition hover:bg-[#1a1d26] hover:text-zinc-200"
              title={isExpanded ? '收合拖曳區' : '展開拖曳與剪貼簿貼上區'}
            >
              <span>{isExpanded ? '收合' : '展開拖曳區'}</span>
              {isExpanded ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Expandable Dropzone + Thumbnails */}
      {showFullDropzone && (
        <div className="mt-3 space-y-3">
          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[#2c313e] bg-[#0d0e12]/80 px-4 py-3 text-center transition hover:border-[#3d4456] hover:bg-[#151820]"
          >
            <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-zinc-200">
              <ImagePlus className="h-4 w-4 text-amber-400" />
              <span>
                拖曳或點擊上傳 PNG / JPG / WebP，或按{' '}
                <kbd className="rounded border border-[#323846] bg-[#181b22] px-1.5 py-0.5 font-mono text-xs text-zinc-200">
                  ⌘V
                </kbd>{' '}
                直接貼上截圖
              </span>
              <ClipboardPaste className="h-4 w-4 text-zinc-500" />
            </div>
            <p className="mt-1 text-xs text-zinc-400">
              支援 clef 多模態模型 · 自動剝除 data URL 前綴 · 上限 4 張 (總計 ≤ 8 MiB)
            </p>
          </div>

          {images.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {images.map((img, idx) => (
                <div
                  key={img.id}
                  className="group relative flex flex-col overflow-hidden rounded-xl border border-[#282d39] bg-[#0d0e12] p-2"
                >
                  <div className="relative flex h-24 w-full items-center justify-center overflow-hidden rounded-lg bg-[#14171f]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.previewDataUrl}
                      alt={img.name}
                      className="max-h-full max-w-full object-contain"
                    />
                    <span className="telemetry-num absolute top-1.5 left-1.5 rounded bg-black/80 px-2 py-0.5 font-mono text-xs font-semibold text-zinc-200">
                      #{idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemove(img.id);
                      }}
                      className="absolute top-1.5 right-1.5 rounded-md bg-rose-600 p-1.5 text-white opacity-0 transition hover:bg-rose-500 group-hover:opacity-100"
                      title="移除圖片"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-zinc-300">
                    <span className="truncate font-medium">{img.name}</span>
                    <span className="telemetry-num shrink-0 font-mono text-zinc-400">
                      {formatBytes(img.sizeBytes)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Warning banner */}
      {warningMsg && (
        <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div className="flex-1">{warningMsg}</div>
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
      const rawBase64 = dataUrl.replace(
        /^data:image\/[a-zA-Z0-9+.-]+;base64,/,
        ''
      );

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

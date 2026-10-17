'use client';

import React, { useState } from 'react';
import { EndpointProfile, S1RequestPayload } from '@/types/systemone';
import {
  generateCurlSnippet,
  generatePythonSnippet,
  generateTypeScriptSnippet,
} from '@/lib/code-exporter';
import { Check, Copy, Terminal, Code, KeyRound } from 'lucide-react';

interface CodeExportPanelProps {
  profile: EndpointProfile;
  payload: S1RequestPayload;
  noulThresholds: Record<string, number>;
}

export function CodeExportPanel({
  profile,
  payload,
  noulThresholds,
}: CodeExportPanelProps) {
  const [lang, setLang] = useState<'curl' | 'python' | 'ts-sdk' | 'ts-fetch'>(
    'curl'
  );
  const [includeRawKey, setIncludeRawKey] = useState(false);
  const [copied, setCopied] = useState(false);

  const snippet = (() => {
    const opts = {
      includeRawApiKey: includeRawKey,
      noulThresholds,
    };
    if (lang === 'curl') return generateCurlSnippet(profile, payload, opts);
    if (lang === 'python') return generatePythonSnippet(profile, payload, opts);
    if (lang === 'ts-sdk')
      return generateTypeScriptSnippet(profile, payload, opts, 'sdk');
    return generateTypeScriptSnippet(profile, payload, opts, 'fetch');
  })();

  const handleCopy = async () => {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="space-y-4 rounded-xl border border-[#252934] bg-[#14171f] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap gap-1 rounded-lg border border-[#282c37] bg-[#0d0e12] p-1">
          <button
            type="button"
            onClick={() => setLang('curl')}
            className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium transition ${
              lang === 'curl'
                ? 'bg-[#222631] text-zinc-100 ring-1 ring-[#353b49]'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Terminal className="h-4 w-4 text-amber-400" />
            cURL + jq
          </button>
          <button
            type="button"
            onClick={() => setLang('python')}
            className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium transition ${
              lang === 'python'
                ? 'bg-[#222631] text-zinc-100 ring-1 ring-[#353b49]'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Code className="h-4 w-4 text-sky-400" />
            Python SDK
          </button>
          <button
            type="button"
            onClick={() => setLang('ts-sdk')}
            className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium transition ${
              lang === 'ts-sdk'
                ? 'bg-[#222631] text-zinc-100 ring-1 ring-[#353b49]'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Code className="h-4 w-4 text-emerald-400" />
            TypeScript SDK
          </button>
          <button
            type="button"
            onClick={() => setLang('ts-fetch')}
            className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium transition ${
              lang === 'ts-fetch'
                ? 'bg-[#222631] text-zinc-100 ring-1 ring-[#353b49]'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Code className="h-4 w-4 text-amber-400" />
            Native fetch
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {profile.apiKey && (
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[#2b303d] bg-[#0d0e12] px-3 py-2 text-xs font-medium text-zinc-300">
              <input
                type="checkbox"
                checked={includeRawKey}
                onChange={(e) => setIncludeRawKey(e.target.checked)}
                className="accent-amber-500"
              />
              <KeyRound className="h-3.5 w-3.5 text-amber-400" />
              帶入實際 API Key (預設使用 $API_KEY)
            </label>
          )}

          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-zinc-950 transition hover:bg-amber-400"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4" />
                已複製程式碼
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                複製程式碼
              </>
            )}
          </button>
        </div>
      </div>

      <pre className="max-h-[560px] overflow-auto rounded-xl border border-[#242834] bg-[#0b0c0f] p-4 font-mono text-sm leading-relaxed text-zinc-200">
        <code>{snippet}</code>
      </pre>
    </div>
  );
}

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
    <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex flex-wrap gap-1 rounded-lg border border-slate-800 bg-slate-950 p-1">
          <button
            type="button"
            onClick={() => setLang('curl')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition ${
              lang === 'curl'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="h-3.5 w-3.5" />
            cURL + jq
          </button>
          <button
            type="button"
            onClick={() => setLang('python')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition ${
              lang === 'python'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code className="h-3.5 w-3.5" />
            Python (typesafe-sdk)
          </button>
          <button
            type="button"
            onClick={() => setLang('ts-sdk')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition ${
              lang === 'ts-sdk'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code className="h-3.5 w-3.5" />
            TypeScript (@typesafe/sdk)
          </button>
          <button
            type="button"
            onClick={() => setLang('ts-fetch')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition ${
              lang === 'ts-fetch'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code className="h-3.5 w-3.5" />
            TypeScript (Native fetch)
          </button>
        </div>

        <div className="flex items-center gap-2">
          {profile.apiKey && (
            <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 text-[11px] text-slate-300">
              <input
                type="checkbox"
                checked={includeRawKey}
                onChange={(e) => setIncludeRawKey(e.target.checked)}
                className="accent-indigo-500"
              />
              <KeyRound className="h-3 w-3 text-amber-400" />
              帶入實際 API Key (預設使用 $API_KEY)
            </label>
          )}

          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-300" />
                已複製!
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                複製程式碼
              </>
            )}
          </button>
        </div>
      </div>

      <pre className="max-h-[500px] overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-200">
        <code>{snippet}</code>
      </pre>
    </div>
  );
}

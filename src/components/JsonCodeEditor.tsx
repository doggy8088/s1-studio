'use client';

import React, { useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { oneDark } from '@codemirror/theme-one-dark';

interface JsonCodeEditorProps {
  value: string;
  onChange?: (val: string) => void;
  readOnly?: boolean;
  minHeight?: string;
  maxHeight?: string;
  placeholder?: string;
}

export function JsonCodeEditor({
  value,
  onChange,
  readOnly = false,
  minHeight = '180px',
  maxHeight = '460px',
  placeholder,
}: JsonCodeEditorProps) {
  const extensions = useMemo(() => [json()], []);

  return (
    <div className="overflow-hidden rounded-xl border border-[#262932] bg-[#0d0e12] text-sm leading-relaxed shadow-inner [&_.cm-editor]:!bg-[#0d0e12] [&_.cm-gutters]:!border-r-[#1e2028] [&_.cm-gutters]:!bg-[#111318] [&_.cm-scroller]:!font-mono [&_.cm-scroller]:!text-[14px] [&_.cm-scroller]:!leading-relaxed">
      <CodeMirror
        value={value}
        height="auto"
        minHeight={minHeight}
        maxHeight={maxHeight}
        theme={oneDark}
        extensions={extensions}
        editable={!readOnly}
        readOnly={readOnly}
        placeholder={placeholder}
        onChange={(val) => {
          if (onChange) onChange(val);
        }}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: !readOnly,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: true,
        }}
      />
    </div>
  );
}

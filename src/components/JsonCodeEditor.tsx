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
  minHeight = '160px',
  maxHeight = '420px',
  placeholder,
}: JsonCodeEditorProps) {
  const extensions = useMemo(() => [json()], []);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-800 bg-[#282c34] text-xs shadow-inner">
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

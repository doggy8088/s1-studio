'use client';

import React, { useState } from 'react';
import {
  ChoiceCriterionItem,
  QuestionBuilderItem,
  QuestionType,
  S1Question,
  ScoreCriterionItem,
} from '@/types/systemone';
import {
  builderItemsToQuestionsRecord,
  MAX_QUESTIONS,
  QUESTION_KEY_REGEX,
  questionsRecordToBuilderItems,
} from '@/lib/s1-utils';
import { JsonCodeEditor } from './JsonCodeEditor';
import {
  Plus,
  Trash2,
  GripVertical,
  ArrowUp,
  ArrowDown,
  AlertCircle,
  Code2,
  LayoutList,
  CheckCircle2,
  CopyPlus,
} from 'lucide-react';

interface QuestionsBuilderProps {
  items: QuestionBuilderItem[];
  onChange: (items: QuestionBuilderItem[]) => void;
}

const PRIMITIVE_META: Record<
  QuestionType,
  {
    label: string;
    shortDesc: string;
    borderAccent: string;
    activePill: string;
    dotColor: string;
  }
> = {
  noul: {
    label: 'NOUL',
    shortDesc: 'Boolean Gate',
    borderAccent: 'border-l-emerald-500',
    activePill:
      'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/40',
    dotColor: 'bg-emerald-400',
  },
  choice: {
    label: 'CHOICE',
    shortDesc: 'Discrete Route',
    borderAccent: 'border-l-sky-500',
    activePill: 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/40',
    dotColor: 'bg-sky-400',
  },
  score: {
    label: 'SCORE',
    shortDesc: 'Graded Spectrum',
    borderAccent: 'border-l-amber-500',
    activePill: 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/40',
    dotColor: 'bg-amber-400',
  },
};

export function QuestionsBuilder({ items, onChange }: QuestionsBuilderProps) {
  const [mode, setMode] = useState<'ui' | 'json'>('ui');
  const [rawJsonText, setRawJsonText] = useState<string>('');
  const [rawJsonError, setRawJsonError] = useState<string | null>(null);

  // Drag state for choice / score criteria
  const [dragState, setDragState] = useState<{
    questionId: string;
    fromIndex: number;
  } | null>(null);

  const handleSwitchMode = (targetMode: 'ui' | 'json') => {
    if (targetMode === mode) return;
    if (targetMode === 'json') {
      const record = builderItemsToQuestionsRecord(items);
      setRawJsonText(JSON.stringify(record, null, 2));
      setRawJsonError(null);
      setMode('json');
    } else {
      try {
        const parsed = JSON.parse(rawJsonText);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          setRawJsonError('Questions JSON 必須為 Key-Object 結構。');
          return;
        }
        const converted = questionsRecordToBuilderItems(
          parsed as Record<string, S1Question>
        );
        onChange(converted);
        setRawJsonError(null);
        setMode('ui');
      } catch (err) {
        setRawJsonError(
          `JSON 語法錯誤，請修正後再切換回表單模式：${
            err instanceof Error ? err.message : 'Invalid JSON'
          }`
        );
      }
    }
  };

  const handleRawJsonChange = (val: string) => {
    setRawJsonText(val);
    try {
      const parsed = JSON.parse(val);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [k, q] of Object.entries(parsed)) {
          const qObj = q as Record<string, unknown>;
          if (
            !qObj ||
            typeof qObj !== 'object' ||
            !['noul', 'choice', 'score'].includes(String(qObj.type))
          ) {
            setRawJsonError(
              `問題 "${k}" 的 type 必須是 "noul"、"choice" 或 "score"。`
            );
            return;
          }
        }
        setRawJsonError(null);
        const converted = questionsRecordToBuilderItems(
          parsed as Record<string, S1Question>
        );
        onChange(converted);
      } else {
        setRawJsonError('根節點必須是 JSON Object (Record<string, S1Question>)。');
      }
    } catch (err) {
      setRawJsonError(err instanceof Error ? err.message : 'JSON 解析失敗');
    }
  };

  const handleUpdateQuestion = (
    id: string,
    patch: Partial<QuestionBuilderItem>
  ) => {
    onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const handleAddQuestion = (defaultType: QuestionType = 'noul') => {
    if (items.length >= MAX_QUESTIONS) return;
    const nextIdx = items.length + 1;
    const uid =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID().slice(0, 8)
        : String(nextIdx);
    const newItem: QuestionBuilderItem = {
      id: `q-${uid}`,
      key: `question_${nextIdx}`,
      type: defaultType,
      instructions:
        defaultType === 'noul'
          ? 'Evaluate whether this condition holds true.'
          : defaultType === 'choice'
            ? 'Select the single most appropriate route for this input.'
            : 'Rate the severity or priority level on the ordered scale.',
      choiceCriteria: [
        {
          id: `c-${uid}-1`,
          key: 'option_a',
          description: 'First choice criterion',
        },
        {
          id: `c-${uid}-2`,
          key: 'option_b',
          description: 'Second choice criterion',
        },
      ],
      scoreCriteria: [
        { id: `s-${uid}-1`, label: 'Routine' },
        { id: `s-${uid}-2`, label: 'Soon' },
        { id: `s-${uid}-3`, label: 'Urgent' },
      ],
    };
    onChange([...items, newItem]);
  };

  const handleDuplicateQuestion = (item: QuestionBuilderItem, index: number) => {
    if (items.length >= MAX_QUESTIONS) return;
    const uid =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID().slice(0, 8)
        : `${index + 1}-copy`;
    const cloned: QuestionBuilderItem = {
      ...item,
      id: `q-${uid}`,
      key: `${item.key}_copy`,
      choiceCriteria: item.choiceCriteria.map((c, idx) => ({
        ...c,
        id: `c-${uid}-${idx}`,
      })),
      scoreCriteria: item.scoreCriteria.map((s, idx) => ({
        ...s,
        id: `s-${uid}-${idx}`,
      })),
    };
    const next = [...items];
    next.splice(index + 1, 0, cloned);
    onChange(next);
  };

  const handleRemoveQuestion = (id: string) => {
    onChange(items.filter((item) => item.id !== id));
  };

  const reorderArray = <T,>(arr: T[], fromIdx: number, toIdx: number): T[] => {
    if (toIdx < 0 || toIdx >= arr.length || fromIdx === toIdx) return arr;
    const copy = [...arr];
    const [moved] = copy.splice(fromIdx, 1);
    copy.splice(toIdx, 0, moved);
    return copy;
  };

  const keyCounts: Record<string, number> = {};
  for (const item of items) {
    const k = item.key.trim();
    if (k) keyCounts[k] = (keyCounts[k] || 0) + 1;
  }

  return (
    <div className="space-y-4">
      {/* Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-md border border-[#2c313d] bg-[#171a21] font-mono text-xs font-bold text-amber-400">
            03
          </span>
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-semibold tracking-tight text-zinc-100">
              Decision Questions 決策問題定義
            </h2>
            <span
              className={`telemetry-num rounded-md px-2 py-0.5 font-mono text-xs font-semibold ${
                items.length >= MAX_QUESTIONS
                  ? 'bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/40'
                  : 'bg-[#1a1d26] text-zinc-300 ring-1 ring-[#2b303c]'
              }`}
              title={`單次請求可平行評估最多 ${MAX_QUESTIONS} 道結構化決策原語（Noul · Choice · Score）`}
            >
              {items.length} / {MAX_QUESTIONS}
            </span>
          </div>
        </div>

        {/* UI | Raw JSON Toggle */}
        <div className="inline-flex rounded-lg border border-[#282c37] bg-[#0d0e12] p-1">
          <button
            type="button"
            onClick={() => handleSwitchMode('ui')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
              mode === 'ui'
                ? 'bg-[#222631] text-zinc-100 shadow-sm ring-1 ring-[#353b49]'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <LayoutList className="h-4 w-4 text-amber-400" />
            視覺表單
          </button>
          <button
            type="button"
            onClick={() => handleSwitchMode('json')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
              mode === 'json'
                ? 'bg-[#222631] text-zinc-100 shadow-sm ring-1 ring-[#353b49]'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Code2 className="h-4 w-4 text-sky-400" />
            Raw JSON
          </button>
        </div>
      </div>

      {mode === 'json' ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>直接編輯 questions 物件（即時雙向同步至視覺表單）</span>
            {rawJsonError ? (
              <span className="flex items-center gap-1.5 font-medium text-rose-400">
                <AlertCircle className="h-4 w-4" />
                語法或結構待修正
              </span>
            ) : (
              <span className="flex items-center gap-1.5 font-medium text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                JSON 已同步 ({items.length} 題)
              </span>
            )}
          </div>
          <JsonCodeEditor
            value={rawJsonText}
            onChange={handleRawJsonChange}
            minHeight="320px"
            maxHeight="580px"
          />
          {rawJsonError && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {rawJsonError}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item, qIdx) => {
            const trimmedKey = item.key.trim();
            const isRegexInvalid =
              trimmedKey.length === 0 || !QUESTION_KEY_REGEX.test(trimmedKey);
            const isDuplicate =
              trimmedKey.length > 0 && keyCounts[trimmedKey] > 1;
            const hasKeyError = isRegexInvalid || isDuplicate;
            const meta = PRIMITIVE_META[item.type];

            return (
              <div
                key={item.id}
                className={`rounded-xl border border-[#252934] border-l-4 ${meta.borderAccent} bg-[#14171f] p-4 shadow-sm transition hover:border-[#323746]`}
              >
                {/* Header bar of Question Card: Number + Key Input + Segmented Primitive Switcher + Actions */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  {/* Left: Question Index + Key Input */}
                  <div className="flex flex-1 items-start gap-3">
                    <span className="telemetry-num mt-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#2b303d] bg-[#0d0e12] font-mono text-xs font-bold text-zinc-300">
                      #{qIdx + 1}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <label className="text-xs font-semibold text-zinc-300">
                          Question Key 識別鍵名
                        </label>
                        <span className="font-mono text-xs text-zinc-500">
                          a-z, 0-9, _, ., -
                        </span>
                      </div>
                      <input
                        type="text"
                        required
                        pattern="^[a-zA-Z0-9_.-]{1,100}$"
                        value={item.key}
                        onChange={(e) =>
                          handleUpdateQuestion(item.id, { key: e.target.value })
                        }
                        placeholder="e.g. team, refund, urgency"
                        className={`mt-1.5 w-full rounded-lg border px-3.5 py-2 font-mono text-sm font-medium transition focus:outline-none ${
                          hasKeyError
                            ? 'border-rose-500 bg-rose-950/30 text-rose-200'
                            : 'border-[#2a2f3d] bg-[#0d0e12] text-zinc-100 focus:border-amber-500/70'
                        }`}
                      />
                      {isRegexInvalid && (
                        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-rose-400">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                          僅限英數、底線 `_`、點 `.`、連字號 `-` (1~100 字元)
                        </p>
                      )}
                      {isDuplicate && (
                        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-rose-400">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                          Question Key &ldquo;{trimmedKey}&rdquo; 重複，請使用唯一鍵名
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right: 1-Click Segmented Primitive Type Selector + Duplicate/Delete */}
                  <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold text-zinc-400">
                        Primitive 決策型別
                      </span>
                      <div
                        className="mt-1.5 inline-flex rounded-lg border border-[#292e3b] bg-[#0d0e12] p-1"
                        role="group"
                        aria-label="Select question primitive type"
                      >
                        {(['noul', 'choice', 'score'] as QuestionType[]).map(
                          (t) => {
                            const active = item.type === t;
                            const m = PRIMITIVE_META[t];
                            return (
                              <button
                                key={t}
                                type="button"
                                onClick={() =>
                                  handleUpdateQuestion(item.id, { type: t })
                                }
                                title={`${m.label} — ${m.shortDesc}`}
                                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-mono text-xs font-bold transition ${
                                  active
                                    ? m.activePill
                                    : 'text-zinc-400 hover:bg-[#181b22] hover:text-zinc-200'
                                }`}
                              >
                                <span
                                  className={`h-2 w-2 rounded-full ${
                                    active ? m.dotColor : 'bg-zinc-600'
                                  }`}
                                />
                                {m.label}
                              </button>
                            );
                          }
                        )}
                      </div>
                    </div>

                    <div className="mt-5 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleDuplicateQuestion(item, qIdx)}
                        disabled={items.length >= MAX_QUESTIONS}
                        className="rounded-lg border border-transparent p-2 text-zinc-400 transition hover:border-[#2e3340] hover:bg-[#1c2029] hover:text-zinc-100 disabled:opacity-30"
                        title="複製此問題 (Duplicate Question)"
                      >
                        <CopyPlus className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveQuestion(item.id)}
                        disabled={items.length <= 1}
                        className="rounded-lg border border-transparent p-2 text-zinc-400 transition hover:border-rose-500/30 hover:bg-rose-500/15 hover:text-rose-300 disabled:opacity-30"
                        title="刪除此問題"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Instructions field */}
                <div className="mt-3.5">
                  <label className="block text-xs font-semibold text-zinc-300">
                    Instructions 評估指示
                  </label>
                  <input
                    type="text"
                    required
                    value={item.instructions}
                    onChange={(e) =>
                      handleUpdateQuestion(item.id, {
                        instructions: e.target.value,
                      })
                    }
                    placeholder="輸入針對該問題的明確評估指示..."
                    className="mt-1.5 w-full rounded-lg border border-[#2a2f3d] bg-[#0d0e12] px-3.5 py-2.5 text-sm text-zinc-100 transition focus:border-amber-500/70 focus:outline-none"
                  />
                </div>

                {/* Type-specific Criteria Builder */}
                {item.type === 'choice' && (
                  <div className="mt-4 space-y-3 rounded-xl border border-[#242936] bg-[#0d0e12]/90 p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-sky-400" />
                        <span className="text-xs font-semibold text-sky-300">
                          Choice Criteria 候選路由清單（支援拖曳或上下排序）
                        </span>
                      </div>
                      <span className="text-xs text-zinc-400">
                        同分 (Tie-breaking) 時優先選擇排在前面的選項
                      </span>
                    </div>

                    <div className="space-y-2">
                      {item.choiceCriteria.map((crit, cIdx) => (
                        <div
                          key={crit.id}
                          draggable
                          onDragStart={() =>
                            setDragState({
                              questionId: item.id,
                              fromIndex: cIdx,
                            })
                          }
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => {
                            if (
                              dragState &&
                              dragState.questionId === item.id &&
                              dragState.fromIndex !== cIdx
                            ) {
                              handleUpdateQuestion(item.id, {
                                choiceCriteria: reorderArray(
                                  item.choiceCriteria,
                                  dragState.fromIndex,
                                  cIdx
                                ),
                              });
                            }
                            setDragState(null);
                          }}
                          className="flex flex-wrap items-center gap-2 rounded-lg border border-[#222632] bg-[#14171f] p-2 sm:flex-nowrap"
                        >
                          <span
                            className="cursor-grab px-1 text-zinc-500 hover:text-zinc-300"
                            title="拖曳調整優先順序"
                          >
                            <GripVertical className="h-4 w-4" />
                          </span>
                          <span className="telemetry-num w-5 text-center font-mono text-xs font-semibold text-zinc-400">
                            #{cIdx + 1}
                          </span>
                          <input
                            type="text"
                            value={crit.key}
                            onChange={(e) => {
                              const next: ChoiceCriterionItem[] =
                                item.choiceCriteria.map((c) =>
                                  c.id === crit.id
                                    ? { ...c, key: e.target.value }
                                    : c
                                );
                              handleUpdateQuestion(item.id, {
                                choiceCriteria: next,
                              });
                            }}
                            placeholder="Option key"
                            className="w-28 shrink-0 rounded-md border border-[#2b303d] bg-[#0d0e12] px-2.5 py-1.5 font-mono text-sm font-medium text-sky-200 focus:border-sky-500 focus:outline-none"
                          />
                          <input
                            type="text"
                            value={crit.description}
                            onChange={(e) => {
                              const next: ChoiceCriterionItem[] =
                                item.choiceCriteria.map((c) =>
                                  c.id === crit.id
                                    ? { ...c, description: e.target.value }
                                    : c
                                );
                              handleUpdateQuestion(item.id, {
                                choiceCriteria: next,
                              });
                            }}
                            placeholder="Criterion description..."
                            className="min-w-[160px] flex-1 rounded-md border border-[#2b303d] bg-[#0d0e12] px-3 py-1.5 text-sm text-zinc-100 focus:border-sky-500 focus:outline-none"
                          />
                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateQuestion(item.id, {
                                  choiceCriteria: reorderArray(
                                    item.choiceCriteria,
                                    cIdx,
                                    cIdx - 1
                                  ),
                                })
                              }
                              disabled={cIdx === 0}
                              className="rounded p-1.5 text-zinc-400 hover:bg-[#222632] hover:text-zinc-100 disabled:opacity-25"
                              title="上移"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateQuestion(item.id, {
                                  choiceCriteria: reorderArray(
                                    item.choiceCriteria,
                                    cIdx,
                                    cIdx + 1
                                  ),
                                })
                              }
                              disabled={cIdx === item.choiceCriteria.length - 1}
                              className="rounded p-1.5 text-zinc-400 hover:bg-[#222632] hover:text-zinc-100 disabled:opacity-25"
                              title="下移"
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={item.choiceCriteria.length <= 2}
                              onClick={() =>
                                handleUpdateQuestion(item.id, {
                                  choiceCriteria: item.choiceCriteria.filter(
                                    (c) => c.id !== crit.id
                                  ),
                                })
                              }
                              className="rounded p-1.5 text-zinc-400 hover:bg-rose-500/20 hover:text-rose-300 disabled:opacity-25"
                              title="刪除選項 (最少保留 2 個)"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const nextIdx = item.choiceCriteria.length + 1;
                        handleUpdateQuestion(item.id, {
                          choiceCriteria: [
                            ...item.choiceCriteria,
                            {
                              id: `c-${Date.now()}-${nextIdx}`,
                              key: `option_${nextIdx}`,
                              description: '',
                            },
                          ],
                        });
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-300 transition hover:bg-sky-500/20"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      新增選項 (Add Choice Option)
                    </button>
                  </div>
                )}

                {item.type === 'score' && (
                  <div className="mt-4 space-y-3 rounded-xl border border-[#242936] bg-[#0d0e12]/90 p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-amber-400" />
                        <span className="text-xs font-semibold text-amber-300">
                          Score Criteria 有序等級定義（由低至高 · 最少 2 級）
                        </span>
                      </div>
                      <span className="text-xs text-zinc-400">
                        計算期望值時自動對應索引權重 0.000 ~ 1.000
                      </span>
                    </div>

                    <div className="space-y-2">
                      {item.scoreCriteria.map((sc, sIdx) => {
                        const weightPct =
                          item.scoreCriteria.length > 1
                            ? (
                                (sIdx / (item.scoreCriteria.length - 1)) *
                                100
                              ).toFixed(0)
                            : '0';
                        return (
                          <div
                            key={sc.id}
                            draggable
                            onDragStart={() =>
                              setDragState({
                                questionId: item.id,
                                fromIndex: sIdx,
                              })
                            }
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={() => {
                              if (
                                dragState &&
                                dragState.questionId === item.id &&
                                dragState.fromIndex !== sIdx
                              ) {
                                handleUpdateQuestion(item.id, {
                                  scoreCriteria: reorderArray(
                                    item.scoreCriteria,
                                    dragState.fromIndex,
                                    sIdx
                                  ),
                                });
                              }
                              setDragState(null);
                            }}
                            className="flex items-center gap-2 rounded-lg border border-[#222632] bg-[#14171f] p-2"
                          >
                            <span
                              className="cursor-grab px-1 text-zinc-500 hover:text-zinc-300"
                              title="拖曳調整等級順序"
                            >
                              <GripVertical className="h-4 w-4" />
                            </span>
                            <span className="telemetry-num w-20 shrink-0 rounded-md bg-amber-500/15 px-2 py-1 text-center font-mono text-xs font-semibold text-amber-300 ring-1 ring-amber-500/30">
                              Lv.{sIdx} ({weightPct}%)
                            </span>
                            <input
                              type="text"
                              value={sc.label}
                              onChange={(e) => {
                                const next: ScoreCriterionItem[] =
                                  item.scoreCriteria.map((s) =>
                                    s.id === sc.id
                                      ? { ...s, label: e.target.value }
                                      : s
                                  );
                                handleUpdateQuestion(item.id, {
                                  scoreCriteria: next,
                                });
                              }}
                              placeholder="Level label (e.g. Routine, Soon, Urgent)"
                              className="min-w-0 flex-1 rounded-md border border-[#2b303d] bg-[#0d0e12] px-3 py-1.5 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none"
                            />
                            <div className="flex items-center gap-0.5">
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateQuestion(item.id, {
                                    scoreCriteria: reorderArray(
                                      item.scoreCriteria,
                                      sIdx,
                                      sIdx - 1
                                    ),
                                  })
                                }
                                disabled={sIdx === 0}
                                className="rounded p-1.5 text-zinc-400 hover:bg-[#222632] hover:text-zinc-100 disabled:opacity-25"
                                title="上移"
                              >
                                <ArrowUp className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateQuestion(item.id, {
                                    scoreCriteria: reorderArray(
                                      item.scoreCriteria,
                                      sIdx,
                                      sIdx + 1
                                    ),
                                  })
                                }
                                disabled={sIdx === item.scoreCriteria.length - 1}
                                className="rounded p-1.5 text-zinc-400 hover:bg-[#222632] hover:text-zinc-100 disabled:opacity-25"
                                title="下移"
                              >
                                <ArrowDown className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={item.scoreCriteria.length <= 2}
                                onClick={() =>
                                  handleUpdateQuestion(item.id, {
                                    scoreCriteria: item.scoreCriteria.filter(
                                      (s) => s.id !== sc.id
                                    ),
                                  })
                                }
                                className="rounded p-1.5 text-zinc-400 hover:bg-rose-500/20 hover:text-rose-300 disabled:opacity-25"
                                title="刪除等級 (最少保留 2 個等級)"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const nextIdx = item.scoreCriteria.length + 1;
                        handleUpdateQuestion(item.id, {
                          scoreCriteria: [
                            ...item.scoreCriteria,
                            {
                              id: `s-${Date.now()}-${nextIdx}`,
                              label: `Level ${nextIdx}`,
                            },
                          ],
                        });
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 transition hover:bg-amber-500/20"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      新增評分等級 (Add Score Level)
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {/* Quick-Add Bar for the 3 Primitives */}
          <div className="grid grid-cols-1 gap-2.5 pt-1 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => handleAddQuestion('noul')}
              disabled={items.length >= MAX_QUESTIONS}
              className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-emerald-500/35 bg-emerald-500/5 py-3 text-sm font-semibold text-emerald-300 transition hover:border-emerald-500/60 hover:bg-emerald-500/10 disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
              <span>新增 NOUL 是非題</span>
            </button>
            <button
              type="button"
              onClick={() => handleAddQuestion('choice')}
              disabled={items.length >= MAX_QUESTIONS}
              className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-sky-500/35 bg-sky-500/5 py-3 text-sm font-semibold text-sky-300 transition hover:border-sky-500/60 hover:bg-sky-500/10 disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
              <span>新增 CHOICE 選擇題</span>
            </button>
            <button
              type="button"
              onClick={() => handleAddQuestion('score')}
              disabled={items.length >= MAX_QUESTIONS}
              className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-amber-500/35 bg-amber-500/5 py-3 text-sm font-semibold text-amber-300 transition hover:border-amber-500/60 hover:bg-amber-500/10 disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
              <span>新增 SCORE 評分題</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

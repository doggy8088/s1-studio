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
  HelpCircle,
} from 'lucide-react';

interface QuestionsBuilderProps {
  items: QuestionBuilderItem[];
  onChange: (items: QuestionBuilderItem[]) => void;
}

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
      // Validate raw JSON before switching back to UI if possible, or keep synchronized
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
        // Validate each entry lightly
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

  const handleAddQuestion = () => {
    if (items.length >= MAX_QUESTIONS) return;
    const nextIdx = items.length + 1;
    const newItem: QuestionBuilderItem = {
      id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      key: `question_${nextIdx}`,
      type: 'noul',
      instructions: 'Evaluate whether this condition holds true.',
      choiceCriteria: [
        { id: `c-${Date.now()}-1`, key: 'option_a', description: 'First choice criterion' },
        { id: `c-${Date.now()}-2`, key: 'option_b', description: 'Second choice criterion' },
      ],
      scoreCriteria: [
        { id: `s-${Date.now()}-1`, label: 'Routine' },
        { id: `s-${Date.now()}-2`, label: 'Soon' },
        { id: `s-${Date.now()}-3`, label: 'Urgent' },
      ],
    };
    onChange([...items, newItem]);
  };

  const handleRemoveQuestion = (id: string) => {
    onChange(items.filter((item) => item.id !== id));
  };

  // Reorder helper for Choice or Score criteria
  const reorderArray = <T,>(arr: T[], fromIdx: number, toIdx: number): T[] => {
    if (toIdx < 0 || toIdx >= arr.length || fromIdx === toIdx) return arr;
    const copy = [...arr];
    const [moved] = copy.splice(fromIdx, 1);
    copy.splice(toIdx, 0, moved);
    return copy;
  };

  // Count duplicate keys for immediate visual feedback
  const keyCounts: Record<string, number> = {};
  for (const item of items) {
    const k = item.key.trim();
    if (k) keyCounts[k] = (keyCounts[k] || 0) + 1;
  }

  return (
    <div className="space-y-3">
      {/* Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold tracking-wide text-slate-200 uppercase">
            Questions 決策問題建構器
          </h2>
          <span
            className={`rounded-full px-2 py-0.5 font-mono text-[11px] font-medium ${
              items.length >= MAX_QUESTIONS
                ? 'bg-rose-500/20 text-rose-300'
                : 'bg-slate-800 text-slate-300'
            }`}
          >
            {items.length}/{MAX_QUESTIONS}
          </span>
        </div>

        {/* UI | Raw JSON Toggle */}
        <div className="inline-flex rounded-lg border border-slate-800 bg-slate-950 p-0.5">
          <button
            type="button"
            onClick={() => handleSwitchMode('ui')}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition ${
              mode === 'ui'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <LayoutList className="h-3.5 w-3.5" />
            UI 表單
          </button>
          <button
            type="button"
            onClick={() => handleSwitchMode('json')}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition ${
              mode === 'json'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code2 className="h-3.5 w-3.5" />
            Raw JSON
          </button>
        </div>
      </div>

      {mode === 'json' ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>直接編輯 questions 物件（即時雙向同步至 GUI 表單）</span>
            {rawJsonError ? (
              <span className="flex items-center gap-1 text-rose-400">
                <AlertCircle className="h-3.5 w-3.5" />
                語法或結構待修正
              </span>
            ) : (
              <span className="flex items-center gap-1 text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                JSON 已同步 ({items.length} 題)
              </span>
            )}
          </div>
          <JsonCodeEditor
            value={rawJsonText}
            onChange={handleRawJsonChange}
            minHeight="280px"
            maxHeight="520px"
          />
          {rawJsonError && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {rawJsonError}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item, qIdx) => {
            const trimmedKey = item.key.trim();
            const isRegexInvalid =
              trimmedKey.length === 0 || !QUESTION_KEY_REGEX.test(trimmedKey);
            const isDuplicate = trimmedKey.length > 0 && keyCounts[trimmedKey] > 1;
            const hasKeyError = isRegexInvalid || isDuplicate;

            return (
              <div
                key={item.id}
                className="rounded-xl border border-slate-800/90 bg-slate-900/60 p-3.5 shadow-sm transition hover:border-slate-700/90"
              >
                {/* Top row: Index + Key + Type Selector + Delete */}
                <div className="flex flex-wrap items-start gap-2.5">
                  <span className="mt-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-800 font-mono text-[11px] font-semibold text-slate-300">
                    {qIdx + 1}
                  </span>

                  {/* Question Key input with pattern & validation */}
                  <div className="min-w-[180px] flex-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-medium text-slate-400">
                        Question Key
                      </label>
                      <span className="font-mono text-[10px] text-slate-500">
                        ^[a-zA-Z0-9_.-]&#123;1,100&#125;$
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
                      className={`mt-1 w-full rounded-lg border px-2.5 py-1.5 font-mono text-xs transition focus:outline-none ${
                        hasKeyError
                          ? 'border-rose-500 bg-rose-950/30 text-rose-200'
                          : 'border-slate-700/90 bg-slate-950 text-slate-100 focus:border-indigo-500'
                      }`}
                    />
                    {isRegexInvalid && (
                      <p className="mt-1 flex items-center gap-1 text-[11px] text-rose-400">
                        <AlertCircle className="h-3 w-3 shrink-0" />
                        僅限英數、底線 `_`、點 `.`、連字號 `-` (1~100 字元)
                      </p>
                    )}
                    {isDuplicate && (
                      <p className="mt-1 flex items-center gap-1 text-[11px] text-rose-400">
                        <AlertCircle className="h-3 w-3 shrink-0" />
                        Question Key &ldquo;{trimmedKey}&rdquo; 重複，請使用唯一名稱
                      </p>
                    )}
                  </div>

                  {/* Question Type Selector */}
                  <div className="w-36 shrink-0">
                    <label className="text-[11px] font-medium text-slate-400">
                      Primitive Type
                    </label>
                    <select
                      value={item.type}
                      onChange={(e) =>
                        handleUpdateQuestion(item.id, {
                          type: e.target.value as QuestionType,
                        })
                      }
                      className="mt-1 w-full rounded-lg border border-slate-700/90 bg-slate-950 px-2.5 py-1.5 text-xs font-semibold text-slate-100 focus:border-indigo-500 focus:outline-none"
                    >
                      <option value="noul">noul (Boolean %)</option>
                      <option value="choice">choice (Selection)</option>
                      <option value="score">score (Ordered Levels)</option>
                    </select>
                  </div>

                  {/* Delete button */}
                  <button
                    type="button"
                    onClick={() => handleRemoveQuestion(item.id)}
                    disabled={items.length <= 1}
                    className="mt-6 rounded-lg p-1.5 text-slate-500 transition hover:bg-rose-500/15 hover:text-rose-300 disabled:opacity-30"
                    title="刪除此問題"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Instructions field */}
                <div className="mt-3">
                  <label className="block text-[11px] font-medium text-slate-400">
                    Instructions (評估指示)
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
                    className="mt-1 w-full rounded-lg border border-slate-700/90 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                {/* Type-specific Criteria Builder */}
                {item.type === 'choice' && (
                  <div className="mt-3 space-y-2 rounded-lg border border-slate-800/80 bg-slate-950/60 p-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="text-[11px] font-semibold text-indigo-300">
                        Choice Criteria (Key-Value 清單 · 支援拖曳排序)
                      </span>
                      <span className="flex items-center gap-1 text-[10px] text-slate-400">
                        <HelpCircle className="h-3 w-3 text-indigo-400" />
                        SystemOne 規範：同分 (Tie-breaking) 時優先選擇排在前面的選項
                      </span>
                    </div>

                    <div className="space-y-1.5">
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
                          className="flex items-center gap-1.5 rounded-md border border-slate-800/90 bg-slate-900/90 p-1.5"
                        >
                          <span
                            className="cursor-grab px-1 text-slate-500 hover:text-slate-300"
                            title="拖曳調整優先順序"
                          >
                            <GripVertical className="h-3.5 w-3.5" />
                          </span>
                          <span className="w-4 text-center font-mono text-[10px] text-slate-500">
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
                            className="w-28 shrink-0 rounded border border-slate-700/80 bg-slate-950 px-2 py-1 font-mono text-xs text-indigo-200 focus:border-indigo-500 focus:outline-none sm:w-36"
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
                            className="min-w-0 flex-1 rounded border border-slate-700/80 bg-slate-950 px-2 py-1 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
                          />
                          <div className="flex items-center">
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
                              className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-25"
                              title="上移"
                            >
                              <ArrowUp className="h-3 w-3" />
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
                              className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-25"
                              title="下移"
                            >
                              <ArrowDown className="h-3 w-3" />
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
                              className="rounded p-1 text-slate-500 hover:bg-rose-500/20 hover:text-rose-300 disabled:opacity-25"
                              title="刪除選項 (最少保留 2 個)"
                            >
                              <Trash2 className="h-3 w-3" />
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
                      className="inline-flex items-center gap-1 rounded-md border border-slate-700/80 bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-indigo-300 hover:border-indigo-500/50 hover:bg-indigo-500/10"
                    >
                      <Plus className="h-3 w-3" />
                      Add Criterion
                    </button>
                  </div>
                )}

                {item.type === 'score' && (
                  <div className="mt-3 space-y-2 rounded-lg border border-slate-800/80 bg-slate-950/60 p-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="text-[11px] font-semibold text-amber-300">
                        Score Criteria (有序等級陣列 · 由低到高排列 · 最少 2 個等級)
                      </span>
                      <span className="text-[10px] text-slate-400">
                        計算期望值時自動將索引對應至 0.000 ~ 1.000
                      </span>
                    </div>

                    <div className="space-y-1.5">
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
                            className="flex items-center gap-1.5 rounded-md border border-slate-800/90 bg-slate-900/90 p-1.5"
                          >
                            <span
                              className="cursor-grab px-1 text-slate-500 hover:text-slate-300"
                              title="拖曳調整等級順序"
                            >
                              <GripVertical className="h-3.5 w-3.5" />
                            </span>
                            <span className="w-16 shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-center font-mono text-[10px] text-amber-300">
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
                              className="min-w-0 flex-1 rounded border border-slate-700/80 bg-slate-950 px-2.5 py-1 text-xs text-slate-100 focus:border-indigo-500 focus:outline-none"
                            />
                            <div className="flex items-center">
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
                                className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-25"
                                title="上移"
                              >
                                <ArrowUp className="h-3 w-3" />
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
                                className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-25"
                                title="下移"
                              >
                                <ArrowDown className="h-3 w-3" />
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
                                className="rounded p-1 text-slate-500 hover:bg-rose-500/20 hover:text-rose-300 disabled:opacity-25"
                                title="刪除等級 (最少保留 2 個等級)"
                              >
                                <Trash2 className="h-3 w-3" />
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
                      className="inline-flex items-center gap-1 rounded-md border border-slate-700/80 bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-amber-300 hover:border-amber-500/50 hover:bg-amber-500/10"
                    >
                      <Plus className="h-3 w-3" />
                      Add Score Level
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          <button
            type="button"
            onClick={handleAddQuestion}
            disabled={items.length >= MAX_QUESTIONS}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-700 bg-slate-900/40 py-2.5 text-xs font-semibold text-indigo-300 transition hover:border-indigo-500/60 hover:bg-indigo-500/10 disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
            Add Question ({items.length}/{MAX_QUESTIONS})
          </button>
        </div>
      )}
    </div>
  );
}

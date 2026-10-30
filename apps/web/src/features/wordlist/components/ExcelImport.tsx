"use client";

import { useEffect, useRef, useState } from "react";
import type {
  CustomWord,
  WordlistCandidate,
  WordlistImportMatch
} from "@tsz/types";
import { Button, Input } from "@tsz/ui/components";
import { api } from "@/lib/request";
import { downloadExcelTemplate, readExcelFile } from "../excel-client";
import {
  importFieldLabels,
  validateExcelRow,
  type ExcelRow,
  type ImportField
} from "../excel-rows";

type PreviewRow = ExcelRow & {
  match?: WordlistImportMatch;
  selected?: WordlistCandidate;
  custom?: boolean;
};
export type ImportedWord = {
  candidate?: WordlistCandidate;
  customWord?: CustomWord;
  authorNote: string;
};

export function ExcelImport({
  existingIds,
  remaining,
  onAppend,
  onCancel
}: {
  existingIds: Set<string>;
  remaining: number;
  onAppend: (words: ImportedWord[]) => void;
  onCancel: () => void;
}) {
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [page, setPage] = useState(1);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  async function perform(
    label: string,
    task: (signal: AbortSignal) => Promise<void>
  ) {
    controller.current?.abort();
    const operation = new AbortController();
    controller.current = operation;
    setBusy(label);
    setError("");
    try {
      await task(operation.signal);
    } catch (cause) {
      if (!operation.signal.aborted)
        setError(cause instanceof Error ? cause.message : "操作失败，请重试");
    } finally {
      if (!operation.signal.aborted) setBusy("");
    }
  }

  const positions = new Map<string, number>();
  const problems = new Map<number, string[]>();
  for (const row of rows) {
    const messages = Object.entries(validateExcelRow(row)).map(
      ([field, message]) =>
        `${importFieldLabels[field as ImportField]}：${message}`
    );
    if (row.custom) {
      if ([...row.word].length > 50)
        messages.push("自定义词条名称不能超过 50 字");
      if (!row.gloss.trim()) messages.push("自定义释义不能为空");
    } else if (!row.selected)
      messages.push(row.match ? "尚未选定平台词条" : "尚未匹配词条");
    else {
      const id = row.selected.entry_id;
      if (existingIds.has(id)) messages.push("与编辑器已有词条重复");
      if (positions.has(id))
        messages.push(`与文件第 ${positions.get(id)} 行重复`);
      else positions.set(id, row.rowNumber);
    }
    if (messages.length) problems.set(row.rowNumber, messages);
  }
  const filtered = onlyProblems
    ? rows.filter((row) => problems.has(row.rowNumber))
    : rows;
  const pages = Math.max(1, Math.ceil(filtered.length / 50));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * 50, currentPage * 50);
  const unmatched = rows.filter((row) => !row.match && !row.custom);
  const invalid = rows.some(
    (row) => Object.keys(validateExcelRow(row)).length > 0
  );

  function edit(rowNumber: number, field: ImportField, value: string) {
    setRows((current) =>
      current.map((row) => {
        if (row.rowNumber !== rowNumber) return row;
        const invalidFields = { ...row.invalidFields };
        delete invalidFields[field];
        return {
          ...row,
          [field]: value,
          invalidFields,
          ...(field === "word" ? { match: undefined, selected: undefined } : {})
        };
      })
    );
  }

  async function matchRows(signal: AbortSignal) {
    for (let start = 0; start < unmatched.length; start += 100) {
      const batch = unmatched.slice(start, start + 100);
      const result = await api.wordList.matchImport(
        { words: batch.map((row) => row.word) },
        { signal }
      );
      if (signal.aborted) return;
      if (
        result.items.length !== batch.length ||
        result.items.some(
          (item) =>
            (item.status === "matched" && item.candidates.length !== 1) ||
            (item.status === "ambiguous" && item.candidates.length < 2) ||
            (item.status === "unmatched" && item.candidates.length !== 0)
        )
      )
        throw new Error("匹配结果不完整，请重试");
      const matches = new Map(
        batch.map((row, index) => [row.rowNumber, result.items[index]!])
      );
      setRows((current) =>
        current.map((row) => {
          const match = matches.get(row.rowNumber);
          return match
            ? {
                ...row,
                match,
                selected:
                  match.status === "matched" ? match.candidates[0] : undefined
              }
            : row;
        })
      );
      setBusy(
        `正在匹配 ${Math.min(start + 100, unmatched.length)} / ${unmatched.length} 行…`
      );
    }
  }

  return (
    <section aria-labelledby="excel-import-title" className="space-y-6">
      <h1 id="excel-import-title" className="text-3xl font-bold tracking-tight">
        Excel 导入
      </h1>
      <p className="text-sm leading-6 text-foreground-muted">
        使用一个工作表，表头为「词条名称 / 释义 / 注释」。支持 .xls、.xlsx，最多
        10 MB、10000 行。
        匹配平台词条时释义仅供核对；未匹配的行可选择创建自定义词条并填写释义。注释会随词表展示给读者。
      </p>
      <fieldset disabled={!!busy} className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            void perform("正在生成模板…", async (signal) => {
              await downloadExcelTemplate(signal);
            })
          }
        >
          下载 Excel 模板
        </Button>
        <label className="min-w-0 text-sm">
          <span className="mb-2 block font-medium">选择 Excel 文件</span>
          <input
            type="file"
            accept=".xls,.xlsx"
            className="block w-full max-w-sm text-sm"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              if (
                rows.length &&
                !window.confirm("重新选择文件将清除当前导入预览，是否继续？")
              )
                return;
              setRows([]);
              setPage(1);
              setOnlyProblems(false);
              setFileName(file.name);
              void perform("正在读取文件…", async (signal) => {
                const parsed = await readExcelFile(file, signal);
                if (!signal.aborted) setRows(parsed);
              });
            }}
          />
        </label>
      </fieldset>
      {fileName && (
        <p className="break-all text-sm font-medium">文件：{fileName}</p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-2xl bg-danger/5 p-4 text-sm text-danger"
        >
          {error}
        </p>
      )}
      {busy && (
        <p role="status" className="text-sm text-foreground-muted">
          {busy}
        </p>
      )}
      {rows.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>
              共 {rows.length} 行，{problems.size} 行待处理
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!!busy || invalid || unmatched.length === 0}
              onClick={() => void perform("正在匹配词条…", matchRows)}
            >
              匹配词条
            </Button>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={onlyProblems}
                onChange={(event) => {
                  setOnlyProblems(event.target.checked);
                  setPage(1);
                }}
              />
              仅看待处理行
            </label>
          </div>
          {rows.length > remaining && (
            <p role="alert" className="text-sm text-danger">
              追加后超过 10000 个词条，请删除部分导入行。
            </p>
          )}
          <fieldset disabled={!!busy} className="space-y-4">
            {visible.map((row) => (
              <section
                key={row.rowNumber}
                aria-label={`文件第 ${row.rowNumber} 行`}
                className="glass space-y-3 rounded-3xl p-5"
              >
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-medium">第 {row.rowNumber} 行</h2>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (
                        window.confirm(
                          `删除文件第 ${row.rowNumber} 行及其注释？`
                        )
                      )
                        setRows((current) =>
                          current.filter(
                            (item) => item.rowNumber !== row.rowNumber
                          )
                        );
                    }}
                  >
                    删除此行
                  </Button>
                </div>
                {(["word", "gloss", "note"] as const).map((field) => (
                  <label key={field} className="block text-sm font-medium">
                    {importFieldLabels[field]}
                    {field === "gloss" &&
                      (row.custom ? "（自定义释义，必填）" : "（仅供核对）")}
                    {field === "note" ? (
                      <textarea
                        aria-label={`第 ${row.rowNumber} 行注释`}
                        value={row.note}
                        className="mt-2 min-h-24 w-full rounded-2xl border border-border bg-surface p-3 text-sm font-normal"
                        onChange={(event) =>
                          edit(row.rowNumber, field, event.target.value)
                        }
                      />
                    ) : (
                      <Input
                        aria-label={`第 ${row.rowNumber} 行${importFieldLabels[field]}`}
                        className="mt-2 font-normal"
                        value={row[field]}
                        onChange={(event) =>
                          edit(row.rowNumber, field, event.target.value)
                        }
                      />
                    )}
                  </label>
                ))}
                {row.custom ? (
                  <p className="text-sm text-foreground-muted">
                    自定义词条，可用于拼写练习。
                  </p>
                ) : row.selected ? (
                  <p className="text-sm text-success">
                    已选定：{row.selected.label} ·{" "}
                    {row.selected.glosses.join("；") || "暂无释义"}
                  </p>
                ) : (
                  <>
                    {row.match?.status === "ambiguous" && (
                      <p className="text-sm text-foreground-muted">
                        请人工选择词条；也可修改词条名称后重新匹配。
                      </p>
                    )}
                    {row.match?.status === "unmatched" && (
                      <p className="text-sm text-foreground-muted">
                        没有精确匹配，可创建自定义词条、查找候选或修改词条名称。
                      </p>
                    )}
                    {row.match?.status === "unmatched" && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setRows((current) =>
                            current.map((item) =>
                              item.rowNumber === row.rowNumber
                                ? { ...item, custom: true, selected: undefined }
                                : item
                            )
                          )
                        }
                      >
                        创建自定义词条
                      </Button>
                    )}
                    {row.match?.candidates.map((candidate) => (
                      <Button
                        key={candidate.entry_id}
                        type="button"
                        variant="outline"
                        className="mr-2 h-auto min-h-11 whitespace-normal text-left"
                        onClick={() =>
                          setRows((current) =>
                            current.map((item) =>
                              item.rowNumber === row.rowNumber
                                ? { ...item, selected: candidate }
                                : item
                            )
                          )
                        }
                      >
                        {candidate.label} · {candidate.glosses.join("；")}
                      </Button>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!!validateExcelRow(row).word}
                      onClick={() =>
                        void perform(
                          `正在查找第 ${row.rowNumber} 行候选…`,
                          async (signal) => {
                            const result = await api.wordList.suggestions(
                              { q: row.word },
                              { signal }
                            );
                            if (!signal.aborted)
                              setRows((current) =>
                                current.map((item) =>
                                  item.rowNumber === row.rowNumber
                                    ? {
                                        ...item,
                                        match: {
                                          status: result.items.length
                                            ? "ambiguous"
                                            : "unmatched",
                                          candidates: result.items
                                        }
                                      }
                                    : item
                                )
                              );
                          }
                        )
                      }
                    >
                      查找候选
                    </Button>
                  </>
                )}
                {problems.has(row.rowNumber) && (
                  <p className="text-sm text-danger">
                    {problems.get(row.rowNumber)!.join("；")}
                  </p>
                )}
              </section>
            ))}
          </fieldset>
          <div className="flex items-center gap-3 text-sm">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
            >
              上一页
            </Button>
            <span>
              {currentPage} / {pages} 页
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentPage >= pages}
              onClick={() => setPage(currentPage + 1)}
            >
              下一页
            </Button>
          </div>
        </>
      )}
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          disabled={
            !!busy ||
            !rows.length ||
            problems.size > 0 ||
            rows.length > remaining
          }
          onClick={() =>
            onAppend(
              rows.map((row) => ({
                ...(row.custom
                  ? { customWord: { word: row.word, definition: row.gloss } }
                  : { candidate: row.selected! }),
                authorNote: row.note
              }))
            )
          }
        >
          确认追加到词表
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          取消导入
        </Button>
      </div>
      <p className="text-sm text-foreground-muted">
        确认追加后仍需保存词表。取消导入不会修改编辑器中的内容。
      </p>
    </section>
  );
}

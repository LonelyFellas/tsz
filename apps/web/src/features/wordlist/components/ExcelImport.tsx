"use client";
import {
  LocalWebError,
  type WebNotice,
  webErrorText,
  localText
} from "@/i18n/catalog";
import { useWebText } from "@/i18n/client";
import { webWordlistExcel as webWordlist } from "@/i18n/messages/wordlist/excel";

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
  validateExcelRow,
  type ExcelRow,
  type ImportField
} from "../excel-rows";

const importFieldMessages = {
  word: localText(webWordlist, "webWordlistExcel:entry_name"),
  gloss: localText(webWordlist, "webWordlistExcel:definitions"),
  note: localText(webWordlist, "webWordlistExcel:note_3")
};

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
  const uiText = useWebText(webWordlist);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [error, setError] = useState<WebNotice>("");
  const [busy, setBusy] = useState<WebNotice>("");
  const [page, setPage] = useState(1);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  async function perform(
    label: WebNotice,
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
        setError(
          webErrorText(
            cause,
            localText(
              webWordlist,
              "webWordlistExcel:operation_failed_try_again"
            )
          )
        );
    } finally {
      if (!operation.signal.aborted) setBusy("");
    }
  }

  const positions = new Map<string, number>();
  const problems = new Map<number, string[]>();
  for (const row of rows) {
    const messages = Object.entries(validateExcelRow(row)).map(
      ([field, message]) =>
        `${uiText(importFieldMessages[field as ImportField])}: ${uiText(message)}`
    );
    if (row.custom) {
      if ([...row.word].length > 50)
        messages.push(
          uiText(
            "webWordlistExcel:custom_entry_names_must_not_exceed_50_characters"
          )
        );
      if (!row.gloss.trim())
        messages.push(
          uiText("webWordlistExcel:a_custom_definition_is_required")
        );
    } else if (!row.selected)
      messages.push(
        uiText(
          row.match
            ? "webWordlistExcel:no_platform_entry_selected"
            : "webWordlistExcel:no_entry_matched"
        )
      );
    else {
      const id = row.selected.entry_id;
      if (existingIds.has(id))
        messages.push(
          uiText("webWordlistExcel:duplicates_an_existing_editor_entry")
        );
      if (positions.has(id))
        messages.push(
          uiText("webWordlistExcel:duplicates_file_row_v0", {
            v0: positions.get(id)!
          })
        );
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
        throw new LocalWebError(
          localText(
            webWordlist,
            "webWordlistExcel:matching_results_are_incomplete_try_again"
          )
        );
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
        localText(webWordlist, "webWordlistExcel:matching_row_v0_v1", {
          v0: Math.min(start + 100, unmatched.length),
          v1: unmatched.length
        })
      );
    }
  }

  return (
    <section aria-labelledby="excel-import-title" className="space-y-6">
      <h1 id="excel-import-title" className="text-3xl font-bold tracking-tight">
        {uiText("webWordlistExcel:excel_import")}
      </h1>
      <p className="text-sm leading-6 text-foreground-muted">
        {uiText(
          "webWordlistExcel:use_one_worksheet_with_the_headers_accepts_xls_and_xlsx_up_to_10_mb_and"
        )}
      </p>
      <fieldset disabled={!!busy} className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            void perform(
              localText(webWordlist, "webWordlistExcel:generating_template"),
              async (signal) => {
                await downloadExcelTemplate(signal);
              }
            )
          }
        >
          {uiText("webWordlistExcel:download_excel_template")}
        </Button>
        <label className="min-w-0 text-sm">
          <span className="mb-2 block font-medium">
            {uiText("webWordlistExcel:choose_excel_file")}
          </span>
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
                !window.confirm(
                  uiText(
                    "webWordlistExcel:choosing_another_file_clears_the_current_import_preview_continue"
                  )
                )
              )
                return;
              setRows([]);
              setPage(1);
              setOnlyProblems(false);
              setFileName(file.name);
              void perform(
                localText(webWordlist, "webWordlistExcel:reading_file"),
                async (signal) => {
                  const parsed = await readExcelFile(file, signal);
                  if (!signal.aborted) setRows(parsed);
                }
              );
            }}
          />
        </label>
      </fieldset>
      {fileName && (
        <p className="break-all text-sm font-medium">
          {uiText("webWordlistExcel:file_v0", { v0: fileName })}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-2xl bg-danger/5 p-4 text-sm text-danger"
        >
          {uiText(error)}
        </p>
      )}
      {busy && (
        <p role="status" className="text-sm text-foreground-muted">
          {uiText(busy)}
        </p>
      )}
      {rows.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>
              {uiText("webWordlistExcel:v0_rows_in_total_v1_need_attention", {
                v0: rows.length,
                v1: problems.size
              })}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!!busy || invalid || unmatched.length === 0}
              onClick={() =>
                void perform(
                  localText(webWordlist, "webWordlistExcel:matching_entries"),
                  matchRows
                )
              }
            >
              {uiText("webWordlistExcel:match_entries")}
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
              {uiText("webWordlistExcel:show_only_rows_needing_attention")}
            </label>
          </div>
          {rows.length > remaining && (
            <p role="alert" className="text-sm text-danger">
              {uiText(
                "webWordlistExcel:appending_would_exceed_10_000_entries_remove_some_import_rows"
              )}
            </p>
          )}
          <fieldset disabled={!!busy} className="space-y-4">
            {visible.map((row) => (
              <section
                key={row.rowNumber}
                aria-label={uiText("webWordlistExcel:file_row_v0", {
                  v0: row.rowNumber
                })}
                className="glass space-y-3 rounded-3xl p-5"
              >
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-medium">
                    {uiText("webWordlistExcel:row_v0", { v0: row.rowNumber })}
                  </h2>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (
                        window.confirm(
                          uiText(
                            "webWordlistExcel:delete_file_row_v0_and_its_notes",
                            {
                              v0: row.rowNumber
                            }
                          )
                        )
                      )
                        setRows((current) =>
                          current.filter(
                            (item) => item.rowNumber !== row.rowNumber
                          )
                        );
                    }}
                  >
                    {uiText("webWordlistExcel:delete_row")}
                  </Button>
                </div>
                {(["word", "gloss", "note"] as const).map((field) => (
                  <label key={field} className="block text-sm font-medium">
                    {uiText(importFieldMessages[field])}
                    {field === "gloss" &&
                      (row.custom
                        ? uiText(
                            "webWordlistExcel:custom_definition_required_2"
                          )
                        : uiText("webWordlistExcel:for_verification_only"))}
                    {field === "note" ? (
                      <textarea
                        aria-label={uiText(
                          "webWordlistExcel:notes_for_row_v0",
                          {
                            v0: row.rowNumber
                          }
                        )}
                        value={row.note}
                        className="mt-2 min-h-24 w-full rounded-2xl border border-border bg-surface p-3 text-sm font-normal"
                        onChange={(event) =>
                          edit(row.rowNumber, field, event.target.value)
                        }
                      />
                    ) : (
                      <Input
                        aria-label={uiText("webWordlistExcel:row_v0_v1", {
                          v0: row.rowNumber,
                          v1: uiText(importFieldMessages[field])
                        })}
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
                    {uiText(
                      "webWordlistExcel:custom_entry_eligible_for_spelling_practice"
                    )}
                  </p>
                ) : row.selected ? (
                  <p className="text-sm text-success">
                    {uiText("webWordlistExcel:selected_v0", {
                      v0: row.selected.label
                    })}
                    {row.selected.glosses.join("；") ||
                      uiText("webWordlistExcel:no_definitions_yet")}
                  </p>
                ) : (
                  <>
                    {row.match?.status === "ambiguous" && (
                      <p className="text-sm text-foreground-muted">
                        {uiText(
                          "webWordlistExcel:select_an_entry_manually_or_edit_its_name_and_match_again"
                        )}
                      </p>
                    )}
                    {row.match?.status === "unmatched" && (
                      <p className="text-sm text-foreground-muted">
                        {uiText(
                          "webWordlistExcel:no_exact_match_create_a_custom_entry_find_candidates_or_edit_the_entry_n"
                        )}
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
                        {uiText("webWordlistExcel:create_custom_entry")}
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
                          localText(
                            webWordlist,
                            "webWordlistExcel:finding_candidates_for_row_v0",
                            {
                              v0: row.rowNumber
                            }
                          ),
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
                      {uiText("webWordlistExcel:find_candidates")}
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
              {uiText("webWordlistExcel:previous_page")}
            </Button>
            <span>
              {uiText("webWordlistExcel:page_v0_of_v1", {
                v0: currentPage,
                v1: pages
              })}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentPage >= pages}
              onClick={() => setPage(currentPage + 1)}
            >
              {uiText("webWordlistExcel:next_page")}
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
          {uiText("webWordlistExcel:confirm_append_to_word_list")}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {uiText("webWordlistExcel:cancel_import")}
        </Button>
      </div>
      <p className="text-sm text-foreground-muted">
        {uiText(
          "webWordlistExcel:you_still_need_to_save_the_list_after_appending_cancelling_import_does_n"
        )}
      </p>
    </section>
  );
}

"use client";

import { unavailableReasonLabels } from "../availability";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Modifier
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { HttpError } from "@tsz/api-client";
import type {
  CreateWordlist,
  CustomWord,
  MyWordlistItem,
  WordlistCandidate,
  WordlistEditSnapshot,
  WordlistEntry
} from "@tsz/types";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";
import { wordListKeys } from "../hooks/useWordLists";
import { Button, Input, FormField } from "@tsz/ui/components";
import { cn } from "@tsz/ui/lib/cn";
import { ArrowLeft, Plus, Pencil } from "lucide-react";
import { PageNotice, PageShell, Pager } from "@/features/shell/Page";
import { ExcelImport } from "./ExcelImport";
import { SortableWordRow } from "./SortableWordRow";
import { createWordRowPreview, WordRowDragPreview } from "./WordRowDragPreview";
const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });
type Row = {
  id: string;
  entryId: string | null;
  itemId?: string;
  customWord?: CustomWord;
  text?: string;
  candidate?: WordlistCandidate;
  note?: string;
  authorNote?: string;
  noteRevision?: number;
  noteVersions?: Record<string, number | undefined>;
  noteDirty?: boolean;
};
type RowField = "word" | "definition" | "author-note" | "private-note";
const rowKey = (row: Row) => row.entryId ?? row.itemId!;
const itemKey = (item: MyWordlistItem) => item.item_id ?? item.entry_id!;
const emptyRow = (): Row => ({
  id: crypto.randomUUID(),
  entryId: null,
  text: "",
  note: ""
});
const field =
  "min-h-20 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm font-normal leading-6 text-foreground outline-hidden transition-shadow placeholder:text-foreground-subtle focus:border-primary/50 focus:ring-4 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger aria-invalid:focus:border-danger aria-invalid:focus:ring-danger/15";
function glosses(entry?: WordlistEntry | null) {
  return (
    entry?.pos.flatMap((pos) =>
      pos.senses.flatMap((sense) =>
        sense.definitions.flatMap((definition) =>
          definition.texts.map((text) => text.content.text)
        )
      )
    ) ?? []
  );
}
export function WordListCreator({
  id,
  folderId,
  embedded = false,
  onSaved,
  onCancel
}: {
  id?: string;
  folderId?: string;
  embedded?: boolean;
  onSaved?: (id: string) => void;
  onCancel?: () => void;
}) {
  const userId = useUserStore((s) => s.user?.id);
  const snapshot = useQuery({
    queryKey: [...wordListKeys.mine(userId), "edit", id],
    queryFn: ({ signal }) => api.wordList.edit(id!, { signal }),
    enabled: !!userId && !!id,
    refetchOnWindowFocus: false,
    refetchOnMount: "always"
  });
  if (!userId) return null;
  if (id && snapshot.isError)
    return (
      <PageShell size="lg" embedded={embedded}>
        <PageNotice tone="error">
          读取编辑数据失败。
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-2"
            onClick={() => void snapshot.refetch()}
          >
            重试
          </Button>
        </PageNotice>
      </PageShell>
    );
  if (id && !snapshot.data)
    return (
      <PageShell size="lg" embedded={embedded}>
        <PageNotice>正在读取词表…</PageNotice>
      </PageShell>
    );
  return (
    <Editor
      key={`${userId}:${id ?? "new"}`}
      userId={userId}
      folderId={folderId}
      embedded={embedded}
      onSaved={onSaved}
      onCancel={onCancel}
      id={id}
      initial={snapshot.data}
    />
  );
}
function Editor({
  userId,
  folderId,
  embedded,
  onSaved,
  onCancel,
  id,
  initial: snapshot
}: {
  userId: string;
  folderId?: string;
  embedded?: boolean;
  onSaved?: (id: string) => void;
  onCancel?: () => void;
  id?: string;
  initial?: WordlistEditSnapshot;
}) {
  const [initial] = useState(snapshot);
  const [originalIds] = useState(
    () =>
      new Set(initial?.items?.map((item) => item.item_id) ?? initial?.entry_ids)
  );
  const router = useRouter();
  const client = useQueryClient();
  const [name, setName] = useState(initial?.wordlist.name ?? "");
  const [rows, setRows] = useState<Row[]>(() =>
    initial
      ? (
          initial.items ??
          initial.entry_ids.map((entry_id) => ({ item_id: entry_id, entry_id }))
        ).map((item) => ({
          id: crypto.randomUUID(),
          entryId: item.entry_id ?? null,
          itemId: item.item_id,
          customWord: "custom_word" in item ? item.custom_word : undefined
        }))
      : [emptyRow()]
  );
  const [page, setPage] = useState(1);
  const [dirty, setDirty] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [nameInvalid, setNameInvalid] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const saveButton = useRef<HTMLButtonElement>(null);
  const savingRef = useRef(false);
  const pending = useRef<CreateWordlist | null>(null);
  const [dragPreview, setDragPreview] = useState<HTMLElement | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );
  const allowLeave = useRef(false);
  const locked =
    initial?.wordlist.state === "published" ||
    initial?.wordlist.state === "pending";
  const [session] = useState(() => crypto.randomUUID());
  const [filter, setFilter] = useState("");
  const [errorRow, setErrorRow] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<RowField>("word");
  const loaded = useQuery({
    queryKey: [...wordListKeys.mine(userId), "edit-items", id, session],
    queryFn: async ({ signal }) => {
      const items: MyWordlistItem[] = [];
      const ids =
        initial!.items?.map((item) => item.item_id) ?? initial!.entry_ids;
      for (
        let batch = 1;
        batch <= Math.max(1, Math.ceil(ids.length / 100));
        batch++
      ) {
        const data = await api.wordList.myItems(
          id!,
          { page: batch, page_size: 100 },
          { signal }
        );
        if (
          data.revision !== initial!.wordlist.revision ||
          data.pagination.total !== ids.length ||
          data.items.length !== Math.min(100, ids.length - items.length) ||
          data.items.some(
            (item, offset) => itemKey(item) !== ids[items.length + offset]
          )
        ) {
          throw new Error("词表版本已变化，请重新打开后编辑。");
        }
        items.push(...data.items);
      }
      return items;
    },
    enabled: !!id,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false
  });
  const loadingItems = !!id && !loaded.data;
  // Only this editing session's complete, revision-checked response supplies notes.
  const cache = new Map(loaded.data?.map((item) => [itemKey(item), item]));
  function authorNoteFor(row: Row) {
    return row.authorNote ?? cache.get(rowKey(row))?.author_note ?? "";
  }
  function noteRevisionFor(entryId: string) {
    return originalIds.has(entryId) ? cache.get(entryId)?.note_revision : 1;
  }
  useEffect(() => {
    if (!dirty && !importOpen && !saving) return;
    const prevent = (e: BeforeUnloadEvent) => {
      if (!allowLeave.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const click = (e: MouseEvent) => {
      const link =
        e.target instanceof Element
          ? e.target.closest("a[href], [data-leaves-page]")
          : null;
      if (
        !link ||
        (link instanceof HTMLAnchorElement &&
          (link.target === "_blank" ||
            link.hasAttribute("download") ||
            link.href === window.location.href)) ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey ||
        e.altKey
      )
        return;
      if (savingRef.current || !window.confirm("尚未保存，确定离开？")) {
        e.preventDefault();
        e.stopPropagation();
      } else {
        allowLeave.current = true;
      }
    };
    const navigate = (e: NavigateEvent) => {
      if (
        e.navigationType !== "traverse" ||
        allowLeave.current ||
        e.hashChange ||
        !e.cancelable
      )
        return;
      if (savingRef.current || !window.confirm("尚未保存，确定离开？"))
        e.preventDefault();
      else allowLeave.current = true;
    };
    const restoreProtection = () => {
      allowLeave.current = false;
    };
    window.addEventListener("tsz:page-leave-finished", restoreProtection);
    window.addEventListener("beforeunload", prevent);
    if (window.navigation)
      window.navigation.addEventListener("navigate", navigate);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("tsz:page-leave-finished", restoreProtection);
      window.removeEventListener("beforeunload", prevent);
      document.removeEventListener("click", click, true);
      window.navigation?.removeEventListener("navigate", navigate);
    };
  }, [dirty, importOpen, saving]);
  function change(rowId: string, patch: Partial<Row>) {
    setRows((current) =>
      current.map((row) => (row.id === rowId ? { ...row, ...patch } : row))
    );
    setDirty(true);
    setError("");
    setErrorRow(null);
  }
  function move(rowId: string, target: string) {
    setRows((current) => {
      const a = current.findIndex((r) => r.id === rowId),
        b = current.findIndex((r) => r.id === target);
      if (a < 0 || b < 0) return current;
      const next = [...current];
      const [row] = next.splice(a, 1);
      next.splice(b, 0, row!);
      return next;
    });
    setDirty(true);
  }
  function invalidRow(message: string, row: Row, target: RowField = "word") {
    setError(message);
    setErrorRow(row.id);
    setErrorField(target);
    setFilter("");
    setPage(Math.floor(rows.indexOf(row) / 50) + 1);
    requestAnimationFrame(() => {
      document.getElementById(`${target}-${row.id}`)?.focus();
    });
  }
  async function save() {
    if (savingRef.current || loadingItems) return;
    if (!name.trim() || [...name].length > 100) {
      setError("名称须为 1–100 字");
      setNameInvalid(true);
      nameInput.current?.focus();
      return;
    }
    const unmatched = rows.find((r) => !r.entryId && !r.customWord);
    if (unmatched) {
      invalidRow("每行都需选定平台词条或填写自定义词汇", unmatched);
      return;
    }
    const invalidCustom = rows.find(
      (row) =>
        row.customWord &&
        (!row.customWord.word.trim() ||
          [...row.customWord.word].length > 50 ||
          !row.customWord.definition.trim() ||
          [...row.customWord.definition].length > 200)
    );
    if (invalidCustom) {
      invalidRow(
        "自定义词汇须为 1–50 字，释义须为 1–200 字",
        invalidCustom,
        !invalidCustom.customWord!.word.trim() ||
          [...invalidCustom.customWord!.word].length > 50
          ? "word"
          : "definition"
      );
      return;
    }
    const seenIds = new Set<string>();
    const duplicate = rows.find((row) => {
      if (seenIds.has(rowKey(row))) return true;
      seenIds.add(rowKey(row));
      return false;
    });
    if (duplicate) {
      invalidRow("词条不能重复", duplicate);
      return;
    }
    const longNote = rows.find(
      (r) =>
        [...(r.note ?? "")].length > 1000 || [...authorNoteFor(r)].length > 1000
    );
    if (longNote) {
      invalidRow(
        "备注不能超过 1000 字",
        longNote,
        [...authorNoteFor(longNote)].length > 1000
          ? "author-note"
          : "private-note"
      );
      return;
    }
    if (
      rows.some(
        (r) =>
          r.noteDirty &&
          rowKey(r) &&
          (r.noteRevision ?? noteRevisionFor(rowKey(r))) === undefined
      )
    ) {
      setError("词义和备注尚未读取完成，请稍后重试");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      let result;
      if (id && initial) {
        const same =
          name === initial.wordlist.name &&
          JSON.stringify(rows.map(rowKey)) ===
            JSON.stringify(
              initial.items?.map((item) => item.item_id) ?? initial.entry_ids
            ) &&
          rows.every(
            (row) =>
              authorNoteFor(row) ===
                (cache.get(rowKey(row))?.author_note ?? "") &&
              JSON.stringify(row.customWord) ===
                JSON.stringify(cache.get(rowKey(row))?.custom_word)
          );
        result = await api.wordList.update(id, {
          expected_revision: initial.wordlist.revision,
          content: same
            ? null
            : {
                name,
                ...(rows.some((row) => row.customWord) ||
                initial.items?.some((item) => item.custom_word)
                  ? {
                      items: rows.map((row) => ({
                        item_id: rowKey(row),
                        ...(row.entryId
                          ? { entry_id: row.entryId }
                          : { custom_word: row.customWord! }),
                        author_note: authorNoteFor(row)
                      }))
                    }
                  : {
                      entry_ids: rows.map((r) => r.entryId!),
                      ...(rows.some((row) => authorNoteFor(row)) ||
                      loaded.data?.some((item) => item.author_note)
                        ? {
                            author_notes: rows.map((row) => ({
                              entry_id: row.entryId!,
                              author_note: authorNoteFor(row)
                            }))
                          }
                        : {})
                    })
              },
          note_updates: rows
            .filter(
              (r) =>
                r.note !== undefined &&
                (r.noteDirty || !originalIds.has(rowKey(r)))
            )
            .map((r) => ({
              ...(r.entryId ? { entry_id: r.entryId } : { item_id: rowKey(r) }),
              private_note: r.note!,
              expected_note_revision:
                r.noteRevision ?? noteRevisionFor(rowKey(r))!
            }))
        });
      } else {
        pending.current ??= {
          idempotency_key: crypto.randomUUID(),
          ...(folderId ? { folder_id: folderId } : {}),
          name,
          items: rows.map((r) => ({
            ...(r.entryId
              ? { entry_id: r.entryId }
              : { item_id: rowKey(r), custom_word: r.customWord! }),
            private_note: r.note ?? "",
            ...(authorNoteFor(r) ? { author_note: authorNoteFor(r) } : {})
          }))
        };
        result = await api.wordList.create(pending.current);
      }
      allowLeave.current = true;
      setDirty(false);
      await client.invalidateQueries({ queryKey: wordListKeys.all });
      if (onSaved) onSaved(result.id);
      else router.push(`/account/wordlists/${result.id}`);
    } catch (e) {
      const unknown =
        !(e instanceof HttpError) || e.status >= 500 || e.status === 408;
      if (!id && !unknown) pending.current = null;
      setUncertain(!id && unknown);
      setError(
        e instanceof HttpError && e.status === 413
          ? "词表内容过大，请减少词条或缩短注释后重试。当前编辑内容仍保留。"
          : unknown
            ? "保存结果未确认，请重试。"
            : "保存失败：内容、版本或词条状态已变化。请检查输入；版本冲突时重新打开词表。"
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  useEffect(() => {
    if (error && !saving && !nameInvalid && !errorRow)
      saveButton.current?.focus();
  }, [error, saving, nameInvalid, errorRow]);
  const searchTerm = filter.trim().toLowerCase();
  const matches = rows.filter((row) => {
    if (!searchTerm) return true;
    const stored = cache.get(rowKey(row));
    return [
      row.customWord?.word ??
        row.text ??
        stored?.entry?.label ??
        stored?.entry_label ??
        "",
      row.customWord?.definition ?? "",
      authorNoteFor(row),
      row.note ?? stored?.private_note ?? "",
      ...(row.candidate?.glosses ?? glosses(stored?.entry))
    ]
      .join(" ")
      .toLowerCase()
      .includes(searchTerm);
  });
  const pages = Math.max(1, Math.ceil(matches.length / 50));
  const currentPage = Math.min(page, pages);
  const visible = matches.slice((currentPage - 1) * 50, currentPage * 50);
  const replaceEmpty =
    rows.length === 1 &&
    !rows[0]!.entryId &&
    !rows[0]!.customWord &&
    !rows[0]!.text &&
    !rows[0]!.note &&
    !rows[0]!.authorNote;
  function cancel() {
    if (savingRef.current || (dirty && !window.confirm("尚未保存，确定离开？")))
      return;
    allowLeave.current = true;
    if (onCancel) onCancel();
    else router.push(id ? `/account/wordlists/${id}` : "/account/wordlists");
  }
  if (importOpen)
    return (
      <PageShell size="lg" embedded={embedded}>
        <ExcelImport
          existingIds={
            new Set(rows.flatMap((row) => (row.entryId ? [row.entryId] : [])))
          }
          remaining={10000 - (replaceEmpty ? 0 : rows.length)}
          onCancel={() => setImportOpen(false)}
          onAppend={(words) => {
            setRows((current) => [
              ...(replaceEmpty ? [] : current),
              ...words.map(({ candidate, customWord, authorNote }) => ({
                id: crypto.randomUUID(),
                entryId: candidate?.entry_id ?? null,
                itemId: customWord ? crypto.randomUUID() : undefined,
                text: candidate?.label ?? customWord?.word,
                customWord,
                candidate,
                note: "",
                authorNote
              }))
            ]);
            setFilter("");
            setPage(Math.floor((replaceEmpty ? 0 : rows.length) / 50) + 1);
            setDirty(true);
            setError("");
            setErrorRow(null);
            setImportOpen(false);
          }}
        />
      </PageShell>
    );
  return (
    <PageShell size="lg" embedded={embedded}>
      {!embedded && (
        <button
          type="button"
          disabled={saving}
          className="-ml-3 mb-5 inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm text-foreground-muted transition-colors hover:bg-surface/80 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
          onClick={cancel}
        >
          <ArrowLeft className="size-4" strokeWidth={1.8} aria-hidden />
          返回
        </button>
      )}
      <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-[34px]">
        {id ? "编辑词表" : "创建词表"}
      </h1>
      {locked && (
        <p className="mt-3 text-sm leading-6 text-foreground-muted">
          公开或审核中的词表仅可修改已有私密备注；编辑内容需先撤回。
        </p>
      )}
      <header className="mt-6 flex flex-wrap items-end gap-3">
        <div className="min-w-0 basis-full sm:flex-1 sm:basis-auto">
          <FormField htmlFor="wordlist-name" label="词表名称">
            <Input
              id="wordlist-name"
              ref={nameInput}
              aria-label="词表名称"
              aria-invalid={nameInvalid}
              aria-describedby={error ? "wordlist-save-error" : undefined}
              placeholder="输入词表名称"
              value={name}
              maxLength={100}
              disabled={locked || saving || uncertain}
              onChange={(e) => {
                setName(e.target.value);
                setDirty(true);
                setNameInvalid(false);
                setError("");
              }}
            />
          </FormField>
        </div>
        {embedded && (
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={cancel}
          >
            取消
          </Button>
        )}
      </header>
      {loadingItems && (
        <p
          role={loaded.isError ? "alert" : "status"}
          className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl bg-muted/70 px-4 py-3 text-sm text-foreground-muted"
        >
          {loaded.isError
            ? loaded.error instanceof Error
              ? loaded.error.message
              : "词义和备注读取失败"
            : "正在读取词条…"}
          {loaded.isError && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loaded.refetch()}
            >
              重试读取
            </Button>
          )}
        </p>
      )}
      <section
        aria-label="词条编辑"
        aria-busy={saving}
        className="sticky top-16 z-20 my-6 border-b border-border/70 bg-surface py-3"
      >
        <div className="flex flex-wrap items-center gap-3">
          <Input
            id="wordlist-filter"
            aria-label="表内搜索"
            className="min-w-40 flex-1 sm:max-w-sm"
            value={filter}
            disabled={loadingItems}
            placeholder="搜索词条、释义或备注"
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(1);
            }}
          />
          <div className="ml-auto flex flex-wrap justify-end gap-1 sm:gap-2">
            {!locked && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  aria-label="Excel 导入"
                  className="min-h-11 px-2 sm:px-3"
                  disabled={
                    locked ||
                    saving ||
                    uncertain ||
                    loadingItems ||
                    rows.length >= 10000
                  }
                  onClick={() => setImportOpen(true)}
                >
                  <span className="hidden sm:inline">Excel 导入</span>
                  <span className="sm:hidden">导入</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 px-3"
                  disabled={
                    locked ||
                    saving ||
                    uncertain ||
                    loadingItems ||
                    rows.length >= 10000
                  }
                  onClick={() => {
                    setFilter("");
                    const row = emptyRow();
                    setRows((rs) => [...rs, row]);
                    setPage(Math.ceil((rows.length + 1) / 50));
                    setDirty(true);
                    requestAnimationFrame(() =>
                      document
                        .querySelector<HTMLInputElement>(`#row-${row.id} input`)
                        ?.focus()
                    );
                  }}
                >
                  <Plus className="size-4" aria-hidden />
                  添加词条
                </Button>
              </>
            )}
            <Button
              type="button"
              ref={saveButton}
              disabled={saving || loadingItems}
              onClick={() => void save()}
            >
              {saving
                ? "保存中…"
                : uncertain
                  ? "重试保存"
                  : locked
                    ? "保存备注"
                    : "保存"}
            </Button>
          </div>
        </div>
        {error && (
          <p
            id="wordlist-save-error"
            role="alert"
            className="mt-3 rounded-2xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
          >
            {error}
          </p>
        )}
      </section>
      {matches.length === 0 && (
        <PageNotice>
          {filter.trim() ? "未找到匹配词条" : "暂无词条"}
          {filter.trim() && (
            <Button
              type="button"
              variant="ghost"
              className="ml-2"
              onClick={() => {
                setFilter("");
                setPage(1);
              }}
            >
              清空搜索
            </Button>
          )}
        </PageNotice>
      )}
      <DndContext
        id="wordlist-entry-sort"
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[verticalOnly]}
        autoScroll={{ threshold: { x: 0, y: 0.12 }, acceleration: 8 }}
        accessibility={{
          screenReaderInstructions: {
            draggable:
              "按空格键拿起词条，用上下方向键排序，再按空格键放下，Esc 取消。"
          },
          announcements: {
            onDragStart: ({ active }) =>
              `已拿起第 ${rows.findIndex((row) => row.id === active.id) + 1} 个词条。`,
            onDragOver: ({ over }) =>
              over
                ? `目标位置：第 ${rows.findIndex((row) => row.id === over.id) + 1} 位。`
                : undefined,
            onDragEnd: ({ over }) =>
              over
                ? `已放到第 ${rows.findIndex((row) => row.id === over.id) + 1} 位。`
                : "已取消排序。",
            onDragCancel: () => "已取消排序。"
          }
        }}
        onDragStart={({ active }) => {
          const source = document.getElementById(`row-${active.id}`);
          setDragPreview(source ? createWordRowPreview(source) : null);
        }}
        onDragCancel={() => setDragPreview(null)}
        onDragEnd={({ active, over }) => {
          setDragPreview(null);
          if (
            over &&
            active.id !== over.id &&
            !locked &&
            !saving &&
            !uncertain &&
            !loadingItems &&
            !filter.trim()
          )
            move(String(active.id), String(over.id));
        }}
      >
        <fieldset
          disabled={saving || uncertain || loadingItems}
          className="space-y-4"
        >
          <SortableContext
            items={visible.map((row) => row.id)}
            strategy={verticalListSortingStrategy}
          >
            {visible.map((row) => (
              <SortableWordRow
                key={row.id}
                id={row.id}
                index={rows.indexOf(row) + 1}
                total={rows.length}
                editable={!locked}
                disabled={
                  !!locked ||
                  saving ||
                  uncertain ||
                  loadingItems ||
                  !!filter.trim()
                }
                invalid={errorRow === row.id}
                onMove={(direction) =>
                  move(row.id, rows[rows.indexOf(row) + direction]!.id)
                }
                onRemove={() => {
                  if (!window.confirm("删除此词条及其备注？")) return;
                  const next = rows.filter((r) => r.id !== row.id);
                  const target =
                    next[Math.min(rows.indexOf(row), next.length - 1)]!;
                  setRows(next);
                  setDirty(true);
                  setError("");
                  setErrorRow(null);
                  requestAnimationFrame(() =>
                    document.getElementById(`word-${target.id}`)?.focus()
                  );
                }}
              >
                <WordRow
                  row={row}
                  stored={cache.get(rowKey(row))}
                  noteRevisionFor={noteRevisionFor}
                  invalidField={errorRow === row.id ? errorField : undefined}
                  locked={!!locked}
                  index={rows.indexOf(row) + 1}
                  change={(patch) => change(row.id, patch)}
                />
              </SortableWordRow>
            ))}
          </SortableContext>
        </fieldset>
        {typeof document !== "undefined" &&
          createPortal(
            <DragOverlay
              zIndex={40}
              dropAnimation={
                window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
                  ? null
                  : { duration: 180, easing: "ease-out" }
              }
            >
              {dragPreview && <WordRowDragPreview snapshot={dragPreview} />}
            </DragOverlay>,
            document.body
          )}
      </DndContext>
      {!loadingItems && (
        <p className="mt-4 text-right text-xs tabular-nums text-foreground-muted">
          共 {rows.length} 个词条
        </p>
      )}
      <Pager page={currentPage} total={pages} onChange={setPage} />
    </PageShell>
  );
}
function WordRow({
  row,
  stored,
  noteRevisionFor,
  invalidField,
  locked,
  index,
  change
}: {
  row: Row;
  stored?: MyWordlistItem;
  noteRevisionFor: (entryId: string) => number | undefined;
  invalidField?: RowField;
  locked: boolean;
  index: number;
  change: (patch: Partial<Row>) => void;
}) {
  const userId = useUserStore((s) => s.user?.id);
  const inputRef = useRef<HTMLInputElement>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [composing, setComposing] = useState(false);
  const text =
    row.customWord?.word ??
    row.text ??
    stored?.entry?.label ??
    stored?.entry_label ??
    (stored ? "内容不可用" : row.entryId ? "正在读取词条…" : "");
  const [searchText, setSearchText] = useState(text);
  useEffect(() => {
    if (composing) return;
    const timer = setTimeout(() => setSearchText(text), 250);
    return () => clearTimeout(timer);
  }, [text, composing]);
  const search = useQuery({
    queryKey: [...wordListKeys.mine(userId), "suggestions", searchText],
    enabled:
      !row.entryId &&
      !row.customWord &&
      !composing &&
      searchText.trim().length > 0 &&
      searchText === text,
    queryFn: ({ signal }) =>
      api.wordList.suggestions({ q: searchText }, { signal })
  });
  const suggestions =
    !row.entryId &&
    !row.customWord &&
    !composing &&
    !dismissed &&
    searchText === text
      ? (search.data?.items ?? [])
      : [];
  function selectCandidate(candidate: WordlistCandidate) {
    change({
      entryId: candidate.entry_id,
      text: candidate.label,
      candidate,
      customWord: undefined,
      itemId: undefined,
      noteRevision:
        row.noteVersions?.[candidate.entry_id] ??
        noteRevisionFor(candidate.entry_id)
    });
    setDismissed(true);
    inputRef.current?.focus();
  }
  function focusCandidate(index: number) {
    const candidate = suggestions[index];
    if (candidate)
      document
        .getElementById(`candidate-${row.id}-${candidate.entry_id}`)
        ?.focus();
  }
  const authorNote = row.authorNote ?? stored?.author_note ?? "";
  const showAuthorNote = noteOpen || !!authorNote;
  const hasPrivateNote = !!(stored?.private_note || row.note || row.noteDirty);
  const note = row.note ?? stored?.private_note ?? "";
  const unloaded =
    rowKey(row) &&
    (row.noteRevision ?? noteRevisionFor(rowKey(row))) === undefined;
  return (
    <section className="min-w-0 px-4 pb-4 sm:px-5 sm:pb-5">
      <Input
        id={`word-${row.id}`}
        ref={inputRef}
        aria-label={`词条 ${index}`}
        aria-invalid={invalidField === "word"}
        aria-describedby={
          invalidField === "word" ? "wordlist-save-error" : undefined
        }
        className="tsz-words mt-1"
        value={text}
        disabled={locked}
        placeholder="输入单词或短语"
        maxLength={row.customWord ? 50 : undefined}
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={() => setComposing(false)}
        onKeyDown={(e) => {
          if (composing || e.nativeEvent.isComposing || e.keyCode === 229)
            return;
          if (e.key === "ArrowDown" && suggestions.length) {
            e.preventDefault();
            focusCandidate(0);
          } else if (e.key === "ArrowUp" && suggestions.length) {
            e.preventDefault();
            focusCandidate(suggestions.length - 1);
          } else if (e.key === "Enter" && suggestions.length === 1) {
            e.preventDefault();
            selectCandidate(suggestions[0]!);
          } else if (e.key === "Escape") {
            e.preventDefault();
            setDismissed(true);
          }
        }}
        onChange={(e) => {
          setDismissed(false);
          if (row.customWord) {
            change({
              customWord: { ...row.customWord, word: e.target.value }
            });
            return;
          }
          change({
            text: e.target.value,
            entryId: null,
            candidate: undefined,
            noteRevision: row.noteRevision ?? stored?.note_revision,
            noteVersions: row.entryId
              ? {
                  ...row.noteVersions,
                  [row.entryId]:
                    row.noteRevision ?? noteRevisionFor(row.entryId)
                }
              : row.noteVersions,
            note: row.note ?? stored?.private_note ?? "",
            authorNote: row.authorNote ?? stored?.author_note ?? ""
          });
        }}
      />
      {!row.entryId &&
        !row.customWord &&
        !composing &&
        !dismissed &&
        searchText === text &&
        search.isFetching && (
          <p role="status" className="mt-2 text-sm text-foreground-muted">
            正在搜索…
          </p>
        )}
      {!row.entryId &&
        !row.customWord &&
        !composing &&
        !dismissed &&
        searchText === text &&
        search.isError && (
          <p role="alert" className="mt-2 text-sm text-danger">
            搜索失败，请重试输入。
          </p>
        )}
      {suggestions.length > 0 && (
        <div
          aria-label="候选词条"
          className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-border bg-surface p-1"
        >
          {suggestions.map((candidate, candidateIndex) => (
            <Button
              id={`candidate-${row.id}-${candidate.entry_id}`}
              type="button"
              variant="ghost"
              key={candidate.entry_id}
              className="h-auto min-h-11 w-full justify-start rounded-lg whitespace-normal px-3 py-2.5 text-left"
              onClick={() => selectCandidate(candidate)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  focusCandidate(
                    Math.min(candidateIndex + 1, suggestions.length - 1)
                  );
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  if (candidateIndex === 0) inputRef.current?.focus();
                  else focusCandidate(candidateIndex - 1);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setDismissed(true);
                  inputRef.current?.focus();
                }
              }}
            >
              <span className="tsz-words min-w-0 break-words font-medium">
                {candidate.label}
              </span>
              <span className="ml-3 min-w-0 break-words text-sm font-normal text-foreground-muted">
                {candidate.glosses.join("；")}
              </span>
            </Button>
          ))}
        </div>
      )}
      {!row.entryId &&
        !row.customWord &&
        !composing &&
        !dismissed &&
        searchText === text &&
        search.isSuccess &&
        !search.isFetching &&
        search.data.items.length === 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-foreground-muted">
            <span>没有匹配词条。</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11"
              disabled={locked}
              onClick={() => {
                change({
                  itemId: crypto.randomUUID(),
                  noteRevision: 1,
                  customWord: { word: text, definition: "" }
                });
                requestAnimationFrame(() =>
                  document.getElementById(`definition-${row.id}`)?.focus()
                );
              }}
            >
              创建自定义词汇
            </Button>
          </div>
        )}
      {row.customWord && (
        <div className="mt-4">
          <label className="block text-sm font-medium">
            自定义释义（必填）
            <textarea
              className={cn(field, "mt-2")}
              id={`definition-${row.id}`}
              aria-label={`自定义释义 ${index}`}
              aria-invalid={invalidField === "definition"}
              aria-describedby={
                invalidField === "definition"
                  ? "wordlist-save-error"
                  : undefined
              }
              maxLength={200}
              disabled={locked}
              value={row.customWord.definition}
              placeholder="填写词汇的释义"
              onChange={(event) =>
                change({
                  customWord: {
                    ...row.customWord!,
                    definition: event.target.value
                  }
                })
              }
            />
          </label>
          <p className="mt-2 text-xs text-foreground-muted">
            自定义词汇可阅读，暂不参与学习出题。
          </p>
        </div>
      )}
      {(row.candidate || (row.entryId && stored?.entry)) && (
        <p className="mt-3 whitespace-pre-wrap break-words rounded-2xl bg-muted/70 px-4 py-2.5 text-sm leading-6 text-foreground-muted">
          {(row.candidate?.glosses ?? glosses(stored?.entry)).join("；")}
        </p>
      )}
      {stored && !stored.entry && !stored.custom_word && (
        <p className="mt-3 text-sm text-danger">
          内容不可用
          {stored.unavailable_reason
            ? `（${unavailableReasonLabels[stored.unavailable_reason]}）`
            : ""}
          ，请删除或替换此项。
        </p>
      )}
      <div
        className={cn(
          "mt-3 grid gap-4",
          hasPrivateNote && showAuthorNote && "lg:grid-cols-2"
        )}
      >
        {showAuthorNote ? (
          <div className="min-w-0 text-sm font-medium">
            <label htmlFor={`author-note-${row.id}`}>注</label>
            <textarea
              className={cn(field, "mt-2")}
              id={`author-note-${row.id}`}
              aria-label={`注 ${index}`}
              aria-invalid={invalidField === "author-note"}
              aria-describedby={
                invalidField === "author-note"
                  ? `wordlist-save-error author-note-${row.id}-message`
                  : `author-note-${row.id}-message`
              }
              maxLength={1000}
              disabled={locked}
              placeholder="给读者的补充说明"
              value={authorNote}
              onChange={(e) => {
                setNoteOpen(true);
                change({ authorNote: e.target.value });
              }}
            />
            <div className="mt-2 flex items-center justify-between gap-2 text-xs text-foreground-muted">
              <span id={`author-note-${row.id}-message`}>随词表公开。</span>
              {!authorNote && !locked && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-11 px-3 text-xs"
                  aria-label={`收起注释 ${index}`}
                  onClick={() => {
                    setNoteOpen(false);
                    requestAnimationFrame(() =>
                      document.getElementById(`add-note-${row.id}`)?.focus()
                    );
                  }}
                >
                  收起
                </Button>
              )}
            </div>
          </div>
        ) : !locked ? (
          <Button
            id={`add-note-${row.id}`}
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11 justify-self-start px-3"
            onClick={() => {
              setNoteOpen(true);
              requestAnimationFrame(() =>
                document.getElementById(`author-note-${row.id}`)?.focus()
              );
            }}
          >
            <Pencil className="size-4" aria-hidden />
            添加注释
          </Button>
        ) : null}
        {hasPrivateNote && (
          <label className="block min-w-0 text-sm font-medium">
            已有私密备注（仅自己可见）
            <textarea
              className={cn(field, "mt-2")}
              id={`private-note-${row.id}`}
              aria-label={`私密备注 ${index}`}
              aria-invalid={invalidField === "private-note"}
              aria-describedby={
                invalidField === "private-note"
                  ? "wordlist-save-error"
                  : undefined
              }
              maxLength={1000}
              disabled={!!unloaded}
              placeholder={unloaded ? "正在读取备注…" : "仅自己可见"}
              value={note}
              onChange={(e) =>
                change({
                  note: e.target.value,
                  noteDirty: true,
                  noteRevision: row.noteRevision ?? noteRevisionFor(rowKey(row))
                })
              }
            />
          </label>
        )}
      </div>
    </section>
  );
}

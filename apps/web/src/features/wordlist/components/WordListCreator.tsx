"use client";

import { unavailableReasonLabels } from "../availability";
import { useEffect, useRef, useState } from "react";
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
import { ArrowLeft } from "lucide-react";
import { PageNotice, PageShell } from "@/features/shell/Page";
import { ExcelImport } from "./ExcelImport";
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
const rowKey = (row: Row) => row.entryId ?? row.itemId!;
const itemKey = (item: MyWordlistItem) => item.item_id ?? item.entry_id!;
const emptyRow = (): Row => ({
  id: crypto.randomUUID(),
  entryId: null,
  text: "",
  note: ""
});
const field =
  "min-h-24 w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm font-normal leading-6 text-foreground outline-hidden transition-shadow placeholder:text-foreground-subtle focus:border-primary/50 focus:ring-4 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-50";
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
  const [uncertain, setUncertain] = useState(false);
  const pending = useRef<CreateWordlist | null>(null);
  const drag = useRef<string | null>(null);
  const allowLeave = useRef(false);
  const locked =
    initial?.wordlist.state === "published" ||
    initial?.wordlist.state === "pending";
  const [session] = useState(() => crypto.randomUUID());
  const [filter, setFilter] = useState("");
  const [errorRow, setErrorRow] = useState<string | null>(null);
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
    if (!dirty && !importOpen) return;
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
      if (!window.confirm("尚未保存，确定离开？")) {
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
      if (!window.confirm("尚未保存，确定离开？")) e.preventDefault();
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
  }, [dirty, importOpen]);
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
  function invalidRow(message: string, row: Row) {
    setError(message);
    setErrorRow(row.id);
    setFilter("");
    setPage(Math.floor(rows.indexOf(row) / 50) + 1);
    requestAnimationFrame(() =>
      document.getElementById(`row-${row.id}`)?.focus()
    );
  }
  async function save() {
    if (saving || loadingItems) return;
    if (!name.trim() || [...name].length > 100) {
      setError("名称须为 1–100 字");
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
      invalidRow("自定义词汇须为 1–50 字，释义须为 1–200 字", invalidCustom);
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
      invalidRow("备注不能超过 1000 字", longNote);
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
      const unknown = !(e instanceof HttpError) || e.status >= 500;
      if (!id && !unknown) pending.current = null;
      setUncertain(!id && unknown);
      setError(
        e instanceof HttpError && e.status === 413
          ? "词表内容过大，请减少词条或缩短注释后重试。当前编辑内容仍保留。"
          : unknown
            ? "保存结果暂未确认，请保留当前内容并重试。创建重试使用同一个请求键。"
            : "保存失败：内容、版本或词条状态已变化。请检查输入；版本冲突时重新打开词表。"
      );
    } finally {
      setSaving(false);
    }
  }
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
      <button
        type="button"
        className="-ml-3 mb-5 inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm text-foreground-muted transition-colors hover:bg-surface/80 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
        onClick={() => {
          if (!dirty || window.confirm("尚未保存，确定离开？")) {
            allowLeave.current = true;
            if (onCancel) onCancel();
            else
              router.push(
                id ? `/account/wordlists/${id}` : "/account/wordlists"
              );
          }
        }}
      >
        <ArrowLeft className="size-4" strokeWidth={1.8} aria-hidden />
        返回
      </button>
      <p className="mb-3 text-xs font-medium tracking-[0.2em] text-foreground-muted">
        词表编辑器
      </p>
      <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-[34px]">
        {id ? "编辑词表" : "创建词表"}
      </h1>
      <p className="mt-3 max-w-xl text-sm leading-6 text-foreground-muted">
        可选取平台词条，找不到时填写自定义词汇和释义。“注”随词表展示。
        {locked && "修改名称、选词或“注”前请先撤回；已有私密备注仍可单独修改。"}
      </p>
      <header className="glass sticky top-20 z-20 mt-8 flex flex-col gap-4 rounded-3xl p-4 sm:flex-row sm:items-end sm:p-5">
        <div className="min-w-0 flex-1">
          <FormField htmlFor="wordlist-name" label="词表名称">
            <Input
              id="wordlist-name"
              aria-label="词表名称"
              placeholder="词表名称（最多 100 字）"
              value={name}
              maxLength={100}
              disabled={locked || saving || uncertain}
              onChange={(e) => {
                setName(e.target.value);
                setDirty(true);
              }}
            />
          </FormField>
        </div>
        <Button
          type="button"
          disabled={saving || loadingItems}
          onClick={() => void save()}
        >
          {saving ? "保存中…" : uncertain ? "重试保存" : "保存私密词表"}
        </Button>
      </header>
      {error && (
        <p
          role="alert"
          className="mt-6 rounded-2xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          {error}
        </p>
      )}
      {loadingItems && (
        <p
          role={loaded.isError ? "alert" : "status"}
          className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl bg-muted/70 px-4 py-3 text-sm text-foreground-muted"
        >
          {loaded.isError
            ? loaded.error instanceof Error
              ? loaded.error.message
              : "词义和备注读取失败"
            : "正在自动读取整张词表的词义和备注…"}
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
      <div className="my-8">
        <FormField
          htmlFor="wordlist-filter"
          label="表内搜索"
          hint="搜索整张词表的词条、释义和备注"
        >
          <Input
            id="wordlist-filter"
            value={filter}
            disabled={loadingItems}
            placeholder="搜索本词表"
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(1);
            }}
          />
        </FormField>
      </div>
      <fieldset
        disabled={saving || uncertain || loadingItems}
        className="space-y-4"
      >
        {visible.map((row) => (
          <div
            key={row.id}
            id={`row-${row.id}`}
            tabIndex={-1}
            className={cn(
              "glass rounded-3xl p-2 outline-hidden",
              errorRow === row.id && "ring-2 ring-danger"
            )}
            draggable={
              !locked &&
              !saving &&
              !uncertain &&
              !loadingItems &&
              !filter.trim()
            }
            onDragStart={() => {
              drag.current = row.id;
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (
                drag.current &&
                !locked &&
                !saving &&
                !uncertain &&
                !loadingItems &&
                !filter.trim()
              )
                move(drag.current, row.id);
              drag.current = null;
            }}
          >
            <WordRow
              row={row}
              stored={cache.get(rowKey(row))}
              noteRevisionFor={noteRevisionFor}
              locked={!!locked}
              index={rows.indexOf(row) + 1}
              change={(patch) => change(row.id, patch)}
            />
            <div className="flex flex-wrap gap-2 px-3 pb-2 pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={locked || !!filter.trim() || rows.indexOf(row) === 0}
                onClick={() => move(row.id, rows[rows.indexOf(row) - 1]!.id)}
              >
                上移
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={
                  locked ||
                  !!filter.trim() ||
                  rows.indexOf(row) === rows.length - 1
                }
                onClick={() => move(row.id, rows[rows.indexOf(row) + 1]!.id)}
              >
                下移
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-auto text-foreground-muted hover:text-danger"
                disabled={locked || rows.length === 1}
                onClick={() => {
                  if (window.confirm("删除此行及其备注？")) {
                    setRows((rs) => rs.filter((r) => r.id !== row.id));
                    setDirty(true);
                  }
                }}
              >
                删除
              </Button>
            </div>
          </div>
        ))}
      </fieldset>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={
            locked ||
            saving ||
            uncertain ||
            loadingItems ||
            rows.length >= 10000
          }
          onClick={() => setImportOpen(true)}
        >
          Excel 导入
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={
            locked ||
            saving ||
            uncertain ||
            loadingItems ||
            rows.length >= 10000
          }
          onClick={() => {
            setFilter("");
            setRows((rs) => [...rs, emptyRow()]);
            setPage(Math.ceil((rows.length + 1) / 50));
            setDirty(true);
          }}
        >
          增加一行
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={currentPage === 1}
          onClick={() => setPage(currentPage - 1)}
        >
          上一页
        </Button>
        <span className="px-1 text-sm tabular-nums text-foreground-muted">
          {currentPage} / {pages} 页 · {matches.length} / {rows.length} 个词条
        </span>
        <Button
          type="button"
          variant="outline"
          disabled={currentPage >= pages}
          onClick={() => setPage(currentPage + 1)}
        >
          下一页
        </Button>
      </div>
    </PageShell>
  );
}
function WordRow({
  row,
  stored,
  noteRevisionFor,
  locked,
  index,
  change
}: {
  row: Row;
  stored?: MyWordlistItem;
  noteRevisionFor: (entryId: string) => number | undefined;
  locked: boolean;
  index: number;
  change: (patch: Partial<Row>) => void;
}) {
  const userId = useUserStore((s) => s.user?.id);
  const [blurred, setBlurred] = useState(false);
  const text =
    row.customWord?.word ??
    row.text ??
    stored?.entry?.label ??
    stored?.entry_label ??
    (stored ? "内容不可用" : row.entryId ? "正在读取词条…" : "");
  const [searchText, setSearchText] = useState(text);
  useEffect(() => {
    const timer = setTimeout(() => setSearchText(text), 250);
    return () => clearTimeout(timer);
  }, [text]);
  const search = useQuery({
    queryKey: [...wordListKeys.mine(userId), "suggestions", searchText],
    enabled:
      !row.entryId &&
      !row.customWord &&
      searchText.trim().length > 0 &&
      searchText === text,
    queryFn: ({ signal }) =>
      api.wordList.suggestions({ q: searchText }, { signal })
  });
  const note = row.note ?? stored?.private_note ?? "";
  const unloaded =
    rowKey(row) &&
    (row.noteRevision ?? noteRevisionFor(rowKey(row))) === undefined;
  return (
    <section className="rounded-[20px] bg-surface/70 p-5">
      <label className="block text-sm font-medium">
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden
            className="inline-flex size-6 items-center justify-center rounded-full bg-primary-muted text-xs tabular-nums text-primary"
          >
            {index}
          </span>
          词条 {index}
        </span>
        <Input
          className="tsz-words mt-2"
          value={text}
          disabled={locked}
          placeholder="输入单词或短语"
          maxLength={row.customWord ? 50 : undefined}
          onBlur={() => setBlurred(true)}
          onChange={(e) => {
            setBlurred(false);
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
      </label>
      {!row.entryId &&
        !row.customWord &&
        searchText === text &&
        search.isFetching && (
          <p className="mt-2 text-sm text-foreground-muted">正在搜索…</p>
        )}
      {!row.entryId &&
        !row.customWord &&
        searchText === text &&
        search.isError && (
          <p role="alert" className="mt-2 text-sm text-danger">
            搜索失败，请重试输入。
          </p>
        )}
      {!row.entryId &&
        !row.customWord &&
        searchText === text &&
        search.data?.items.map((candidate) => (
          <Button
            type="button"
            variant="ghost"
            key={candidate.entry_id}
            className="mt-2 h-auto min-h-11 w-full justify-start rounded-2xl whitespace-normal py-2.5 text-left"
            onClick={() =>
              change({
                entryId: candidate.entry_id,
                text: candidate.label,
                candidate,
                customWord: undefined,
                itemId: undefined,
                noteRevision:
                  row.noteVersions?.[candidate.entry_id] ??
                  noteRevisionFor(candidate.entry_id)
              })
            }
          >
            <span className="tsz-words font-medium">{candidate.label}</span>
            <span className="ml-3 text-sm font-normal text-foreground-muted">
              {candidate.glosses.join("；")}
            </span>
          </Button>
        ))}
      {!row.entryId &&
        !row.customWord &&
        searchText === text &&
        search.isSuccess &&
        search.data.items.length === 0 && (
          <p className="mt-2 text-sm text-foreground-muted">
            没有匹配词条。
            {blurred && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="ml-2"
                disabled={locked}
                onClick={() =>
                  change({
                    itemId: crypto.randomUUID(),
                    noteRevision: 1,
                    customWord: { word: text, definition: "" }
                  })
                }
              >
                创建自定义词汇
              </Button>
            )}
          </p>
        )}
      {row.customWord && (
        <div className="mt-4">
          <label className="block text-sm font-medium">
            自定义释义（必填）
            <textarea
              className={cn(field, "mt-2")}
              aria-label={`自定义释义 ${index}`}
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
      {(row.candidate || stored?.entry) && (
        <p className="mt-3 rounded-2xl bg-muted/70 px-4 py-2.5 text-sm leading-6 text-foreground-muted">
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
      <label className="mt-5 block text-sm font-medium">
        注
        <textarea
          className={cn(field, "mt-2")}
          aria-label={`注 ${index}`}
          aria-describedby={`author-note-${row.id}-message`}
          maxLength={1000}
          disabled={locked}
          placeholder="给读者的补充说明"
          value={row.authorNote ?? stored?.author_note ?? ""}
          onChange={(e) => change({ authorNote: e.target.value })}
        />
        <span
          id={`author-note-${row.id}-message`}
          className="mt-2 block text-xs text-foreground-muted"
        >
          随词表展示，公开词表的读者也能看到。
        </span>
      </label>
      {(stored?.private_note || row.note || row.noteDirty) && (
        <label className="mt-5 block text-sm font-medium">
          已有私密备注（仅自己可见）
          <textarea
            className={cn(field, "mt-2")}
            aria-label={`私密备注 ${index}`}
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
    </section>
  );
}

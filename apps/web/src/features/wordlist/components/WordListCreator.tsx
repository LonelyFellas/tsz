"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { HttpError } from "@tsz/api-client";
import type {
  CreateWordlist,
  MyWordlistItem,
  WordlistCandidate,
  WordlistEditSnapshot,
  WordlistEntry
} from "@tsz/types";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";
import { wordListKeys } from "../hooks/useWordLists";
import { Button, Input, FormField } from "@tsz/ui/components";
type Row = {
  id: string;
  entryId: string | null;
  text?: string;
  candidate?: WordlistCandidate;
  note?: string;
  noteRevision?: number;
  noteVersions?: Record<string, number | undefined>;
  noteDirty?: boolean;
};
const emptyRow = (): Row => ({
  id: crypto.randomUUID(),
  entryId: null,
  text: "",
  note: ""
});
const field =
  "w-full rounded-2xl border border-border bg-surface px-4 py-3 text-foreground focus-visible:outline-primary";
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
export function WordListCreator({ id }: { id?: string }) {
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
      <p role="alert" className="p-8">
        读取编辑数据失败。
        <Button
          type="button"
          variant="outline"
          onClick={() => void snapshot.refetch()}
        >
          重试
        </Button>
      </p>
    );
  if (id && !snapshot.data) return <p className="p-8">正在读取词表…</p>;
  return (
    <Editor
      key={`${userId}:${id ?? "new"}`}
      userId={userId}
      id={id}
      initial={snapshot.data}
    />
  );
}
function Editor({
  userId,
  id,
  initial: snapshot
}: {
  userId: string;
  id?: string;
  initial?: WordlistEditSnapshot;
}) {
  const [initial] = useState(snapshot);
  const [originalIds] = useState(() => new Set(initial?.entry_ids));
  const router = useRouter();
  const client = useQueryClient();
  const [name, setName] = useState(initial?.wordlist.name ?? "");
  const [rows, setRows] = useState<Row[]>(() =>
    initial
      ? initial.entry_ids.map((entryId) => ({
          id: crypto.randomUUID(),
          entryId
        }))
      : [emptyRow()]
  );
  const [page, setPage] = useState(1);
  const [dirty, setDirty] = useState(false);
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
      const ids = initial!.entry_ids;
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
            (item, offset) => item.entry_id !== ids[items.length + offset]
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
  const cache = new Map(loaded.data?.map((item) => [item.entry_id, item]));
  function noteRevisionFor(entryId: string) {
    return originalIds.has(entryId) ? cache.get(entryId)?.note_revision : 1;
  }
  useEffect(() => {
    if (!dirty) return;
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
  }, [dirty]);
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
    const unmatched = rows.find((r) => !r.entryId);
    if (unmatched) {
      invalidRow("每行都需选定平台词条，请选择候选或删除未匹配行", unmatched);
      return;
    }
    const seenIds = new Set<string | null>();
    const duplicate = rows.find((row) => {
      if (seenIds.has(row.entryId)) return true;
      seenIds.add(row.entryId);
      return false;
    });
    if (duplicate) {
      invalidRow("词条不能重复", duplicate);
      return;
    }
    const longNote = rows.find((r) => [...(r.note ?? "")].length > 1000);
    if (longNote) {
      invalidRow("备注不能超过 1000 字", longNote);
      return;
    }
    if (
      rows.some(
        (r) =>
          r.noteDirty &&
          r.entryId &&
          (r.noteRevision ?? noteRevisionFor(r.entryId)) === undefined
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
          JSON.stringify(rows.map((r) => r.entryId)) ===
            JSON.stringify(initial.entry_ids);
        result = await api.wordList.update(id, {
          expected_revision: initial.wordlist.revision,
          content: same
            ? null
            : {
                name,
                entry_ids: rows.map((r) => r.entryId!)
              },
          note_updates: rows
            .filter(
              (r) =>
                r.note !== undefined &&
                (r.noteDirty || !originalIds.has(r.entryId!))
            )
            .map((r) => ({
              entry_id: r.entryId!,
              private_note: r.note!,
              expected_note_revision:
                r.noteRevision ?? noteRevisionFor(r.entryId!)!
            }))
        });
      } else {
        pending.current ??= {
          idempotency_key: crypto.randomUUID(),
          name,
          items: rows.map((r) => ({
            entry_id: r.entryId!,
            private_note: r.note ?? ""
          }))
        };
        result = await api.wordList.create(pending.current);
      }
      allowLeave.current = true;
      setDirty(false);
      await client.invalidateQueries({ queryKey: wordListKeys.all });
      router.push(`/account/wordlists/${result.id}`);
    } catch (e) {
      const unknown = !(e instanceof HttpError) || e.status >= 500;
      if (!id && !unknown) pending.current = null;
      setUncertain(!id && unknown);
      setError(
        unknown
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
    const stored = row.entryId ? cache.get(row.entryId) : undefined;
    return [
      row.text ?? stored?.entry?.label ?? "",
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
  return (
    <div className="mx-auto max-w-5xl px-6 pb-16 animate-in">
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-border bg-background/95 py-4 backdrop-blur">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (!dirty || window.confirm("尚未保存，确定离开？")) {
              allowLeave.current = true;
              router.push(
                id ? `/account/wordlists/${id}` : "/account/wordlists"
              );
            }
          }}
        >
          返回
        </Button>
        <div className="min-w-40 flex-1">
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
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">
        {id ? "编辑词表" : "创建词表"}
      </h1>
      <p className="my-4 text-sm text-foreground-muted">
        从平台已发布词库逐行选词。备注仅自己可见。
        {locked && "当前只能修改备注；修改名称或选词前请先撤回。"}
      </p>
      {error && (
        <p role="alert" className="my-4 text-danger">
          {error}
        </p>
      )}
      {loadingItems && (
        <p role={loaded.isError ? "alert" : "status"} className="my-4 text-sm">
          {loaded.isError
            ? loaded.error instanceof Error
              ? loaded.error.message
              : "词义和备注读取失败"
            : "正在自动读取整张词表的词义和备注…"}
          {loaded.isError && (
            <Button
              type="button"
              variant="outline"
              onClick={() => void loaded.refetch()}
            >
              重试读取
            </Button>
          )}
        </p>
      )}
      <div className="my-6">
        <FormField
          htmlFor="wordlist-filter"
          label="表内搜索"
          hint="搜索整张词表的词条、释义和私密备注"
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
            className={
              errorRow === row.id ? "rounded-3xl ring-2 ring-danger" : ""
            }
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
              stored={row.entryId ? cache.get(row.entryId) : undefined}
              noteRevisionFor={noteRevisionFor}
              locked={!!locked}
              index={rows.indexOf(row) + 1}
              change={(patch) => change(row.id, patch)}
            />
            <div className="mt-2 flex gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={locked || !!filter.trim() || rows.indexOf(row) === 0}
                onClick={() => move(row.id, rows[rows.indexOf(row) - 1]!.id)}
              >
                上移
              </Button>
              <Button
                type="button"
                variant="outline"
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
                variant="outline"
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
      <div className="mt-6 flex flex-wrap gap-3">
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
        <span className="py-2">
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
    </div>
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
  const text =
    row.text ??
    stored?.entry?.label ??
    (stored ? "内容不可用" : row.entryId ? "正在读取词条…" : "");
  const [searchText, setSearchText] = useState(text);
  useEffect(() => {
    const timer = setTimeout(() => setSearchText(text), 250);
    return () => clearTimeout(timer);
  }, [text]);
  const search = useQuery({
    queryKey: [...wordListKeys.mine(userId), "suggestions", searchText],
    enabled:
      !row.entryId && searchText.trim().length > 0 && searchText === text,
    queryFn: ({ signal }) =>
      api.wordList.suggestions({ q: searchText }, { signal })
  });
  const note = row.note ?? stored?.private_note ?? "";
  const unloaded =
    row.entryId &&
    (row.noteRevision ?? noteRevisionFor(row.entryId)) === undefined;
  return (
    <section className="rounded-3xl border border-border bg-surface p-5">
      <label className="mb-2 block text-sm">
        词条 {index}
        <Input
          className="mt-2"
          value={text}
          disabled={locked}
          placeholder="输入单词或短语"
          onChange={(e) =>
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
              note: row.note ?? stored?.private_note ?? ""
            })
          }
        />
      </label>
      {!row.entryId && searchText === text && search.isFetching && (
        <p>正在搜索…</p>
      )}
      {!row.entryId && searchText === text && search.isError && (
        <p role="alert">搜索失败，请重试输入。</p>
      )}
      {!row.entryId &&
        searchText === text &&
        search.data?.items.map((candidate) => (
          <Button
            type="button"
            variant="ghost"
            key={candidate.entry_id}
            className="my-2 h-auto w-full justify-start whitespace-normal text-left"
            onClick={() =>
              change({
                entryId: candidate.entry_id,
                text: candidate.label,
                candidate,
                noteRevision:
                  row.noteVersions?.[candidate.entry_id] ??
                  noteRevisionFor(candidate.entry_id)
              })
            }
          >
            {candidate.label}
            <span className="ml-3 text-sm text-foreground-muted">
              {candidate.glosses.join("；")}
            </span>
          </Button>
        ))}
      {!row.entryId &&
        searchText === text &&
        search.isSuccess &&
        search.data.items.length === 0 && (
          <p>没有匹配词条，请修改输入或删除此行。</p>
        )}
      {(row.candidate || stored?.entry) && (
        <p className="my-3 text-sm text-foreground-muted">
          {(row.candidate?.glosses ?? glosses(stored?.entry)).join("；")}
        </p>
      )}
      {stored && !stored.entry && <p>内容不可用，请删除或替换此项。</p>}
      <label className="mt-3 block text-sm">
        私密备注
        <textarea
          className={`${field} mt-2`}
          aria-label={`私密备注 ${index}`}
          maxLength={1000}
          disabled={!!unloaded}
          placeholder={unloaded ? "正在读取备注…" : "仅自己可见"}
          value={note}
          onChange={(e) =>
            change({
              note: e.target.value,
              noteDirty: true,
              noteRevision: row.noteRevision ?? noteRevisionFor(row.entryId!)
            })
          }
        />
      </label>
    </section>
  );
}

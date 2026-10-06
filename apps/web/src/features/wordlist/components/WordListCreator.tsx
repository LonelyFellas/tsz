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
  MyWordlistItems
} from "@tsz/types";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";
import { wordListKeys } from "../hooks/useWordLists";
import { buttonClass } from "../reading";
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
const field = "w-full rounded-xl border border-border bg-background px-3 py-2";
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
        <button onClick={() => void snapshot.refetch()}>重试</button>
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
  const locked =
    initial?.wordlist.state === "published" ||
    initial?.wordlist.state === "pending";
  const [loadPage, setLoadPage] = useState(1);
  const loaded = useQuery({
    queryKey: [...wordListKeys.mine(userId), "edit-items", id, loadPage],
    queryFn: ({ signal }) =>
      api.wordList.myItems(id!, { page: loadPage, page_size: 100 }, { signal }),
    enabled: !!id,
    refetchOnWindowFocus: false
  });
  // Keep loaded pages for stable row IDs when users reorder the full lightweight snapshot.
  const cache = new Map<string, MyWordlistItem>();
  for (const [, data] of client.getQueriesData<MyWordlistItems>({
    queryKey: [...wordListKeys.mine(userId), "edit-items", id]
  }))
    if (data) for (const item of data.items) cache.set(item.entry_id, item);
  if (loaded.data)
    for (const item of loaded.data.items) cache.set(item.entry_id, item);
  function noteRevisionFor(entryId: string) {
    return originalIds.has(entryId) ? cache.get(entryId)?.note_revision : 1;
  }
  useEffect(() => {
    if (!dirty) return;
    const prevent = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  function change(rowId: string, patch: Partial<Row>) {
    setRows((current) =>
      current.map((row) => (row.id === rowId ? { ...row, ...patch } : row))
    );
    setDirty(true);
    setError("");
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
  async function save() {
    if (!name.trim() || [...name].length > 100) {
      setError("名称须为 1–100 字");
      return;
    }
    if (rows.some((r) => !r.entryId)) {
      setError("每行都需选定平台词条，请选择候选或删除未匹配行");
      return;
    }
    if (new Set(rows.map((r) => r.entryId)).size !== rows.length) {
      setError("词条不能重复");
      return;
    }
    if (rows.some((r) => [...(r.note ?? "")].length > 1000)) {
      setError("备注不能超过 1000 字");
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
      setError("请先加载所选词条的备注批次，再保存备注");
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
  const visible = rows.slice((page - 1) * 50, page * 50);
  return (
    <div className="mx-auto max-w-5xl px-4 pb-16">
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-border bg-background/95 py-4 backdrop-blur">
        <button
          className={buttonClass}
          onClick={() => {
            if (!dirty || window.confirm("尚未保存，确定离开？"))
              router.push(
                id ? `/account/wordlists/${id}` : "/account/wordlists"
              );
          }}
        >
          返回
        </button>
        <input
          aria-label="词表名称"
          placeholder="词表名称（最多 100 字）"
          value={name}
          maxLength={100}
          disabled={locked || saving || uncertain}
          onChange={(e) => {
            setName(e.target.value);
            setDirty(true);
          }}
          className={`${field} min-w-40 flex-1`}
        />
        <button
          className={`${buttonClass} bg-primary text-white`}
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? "保存中…" : uncertain ? "重试保存" : "保存私密词表"}
        </button>
      </header>
      <h1 className="mt-6 text-2xl font-semibold">
        {id ? "编辑词表" : "创建词表"}
      </h1>
      <p className="my-4 text-sm text-foreground-muted">
        从平台已发布词库逐行选词。备注仅自己可见。
        {locked && "当前只能修改备注；修改名称或选词前请先撤回。"}
      </p>
      {error && (
        <p role="alert" className="my-4 text-red-600">
          {error}
        </p>
      )}
      {id && (
        <div className="mb-4 flex flex-wrap gap-3 text-sm">
          <span>词义和备注分批读取：</span>
          <button
            className={buttonClass}
            disabled={loadPage === 1}
            onClick={() => setLoadPage(loadPage - 1)}
          >
            上一批
          </button>
          <span>第 {loadPage} 批</span>
          <button
            className={buttonClass}
            disabled={
              loadPage >= Math.ceil((initial?.entry_ids.length ?? 0) / 100)
            }
            onClick={() => setLoadPage(loadPage + 1)}
          >
            下一批
          </button>
          {loaded.isError && (
            <span role="alert">
              本批加载失败，
              <button onClick={() => void loaded.refetch()}>重试</button>
            </span>
          )}
        </div>
      )}
      <fieldset disabled={saving || uncertain} className="space-y-4">
        {visible.map((row, index) => (
          <div
            key={row.id}
            draggable={!locked}
            onDragStart={() => {
              drag.current = row.id;
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (drag.current && !locked) move(drag.current, row.id);
              drag.current = null;
            }}
          >
            <WordRow
              row={row}
              stored={row.entryId ? cache.get(row.entryId) : undefined}
              noteRevisionFor={noteRevisionFor}
              locked={!!locked}
              index={(page - 1) * 50 + index + 1}
              change={(patch) => change(row.id, patch)}
            />
            <div className="mt-2 flex gap-3">
              <button
                className={buttonClass}
                disabled={locked || rows.indexOf(row) === 0}
                onClick={() => move(row.id, rows[rows.indexOf(row) - 1]!.id)}
              >
                上移
              </button>
              <button
                className={buttonClass}
                disabled={locked || rows.indexOf(row) === rows.length - 1}
                onClick={() => move(row.id, rows[rows.indexOf(row) + 1]!.id)}
              >
                下移
              </button>
              <button
                className={buttonClass}
                disabled={locked || rows.length === 1}
                onClick={() => {
                  if (window.confirm("删除此行及其备注？")) {
                    setRows((rs) => rs.filter((r) => r.id !== row.id));
                    setDirty(true);
                  }
                }}
              >
                删除
              </button>
            </div>
          </div>
        ))}
      </fieldset>
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          className={buttonClass}
          disabled={locked || saving || uncertain || rows.length >= 10000}
          onClick={() => {
            setRows((rs) => [...rs, emptyRow()]);
            setPage(Math.ceil((rows.length + 1) / 50));
            setDirty(true);
          }}
        >
          增加一行
        </button>
        <button
          className={buttonClass}
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
        >
          上一页
        </button>
        <span className="py-2">
          {page} / {Math.ceil(rows.length / 50)} 页 · {rows.length} 个词条
        </span>
        <button
          className={buttonClass}
          disabled={page >= Math.ceil(rows.length / 50)}
          onClick={() => setPage(page + 1)}
        >
          下一页
        </button>
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
  const text = row.text ?? stored?.entry?.label ?? row.entryId ?? "";
  const search = useQuery({
    queryKey: [...wordListKeys.mine(userId), "catalog", row.id, text],
    enabled: !row.entryId && text.trim().length > 0,
    queryFn: ({ signal }) =>
      api.wordList.catalog({ q: text, page_size: 3 }, { signal })
  });
  const note = row.note ?? stored?.private_note ?? "";
  const unloaded =
    row.entryId &&
    (row.noteRevision ?? noteRevisionFor(row.entryId)) === undefined;
  return (
    <section className="rounded-3xl border border-border bg-surface p-5">
      <label className="mb-2 block text-sm">
        词条 {index}
        <input
          className={`${field} mt-2`}
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
      {!row.entryId && search.isFetching && <p>正在搜索…</p>}
      {!row.entryId && search.isError && (
        <p role="alert">搜索失败，请重试输入。</p>
      )}
      {!row.entryId &&
        search.data?.items.map((candidate) => (
          <button
            key={candidate.entry_id}
            className="block w-full rounded-xl p-3 text-left hover:bg-background"
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
          </button>
        ))}
      {!row.entryId && search.isSuccess && search.data.items.length === 0 && (
        <p>没有匹配词条，请修改输入或删除此行。</p>
      )}
      {row.candidate && (
        <p className="my-3 text-sm text-foreground-muted">
          {row.candidate.glosses.join("；")}
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
          placeholder={unloaded ? "请加载此条目的备注批次" : "仅自己可见"}
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

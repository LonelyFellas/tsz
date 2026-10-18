"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { LibrarySpace, Wordlist } from "@tsz/types";
import { Button, Input } from "@tsz/ui/components";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";
import { LibraryDialog } from "@/features/wordlist/components/LibraryDialog";
import { PageNotice, Pager, Segmented } from "@/features/shell/Page";
export interface SelectedSource {
  wordlist: Wordlist;
  personalName?: string;
}
export function PlanSourcePicker({
  userId,
  selected,
  onConfirm,
  onClose
}: {
  userId: string;
  selected: SelectedSource[];
  onConfirm: (items: SelectedSource[]) => void;
  onClose: () => void;
}) {
  const [space, setSpace] = useState<LibrarySpace | "public">("owned");
  const [parent, setParent] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState(selected);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [nodes, setNodes] = useState<
    Record<string, { space: LibrarySpace; version: string; name: string }>
  >({});
  const library = useQuery({
    queryKey: ["plan-sources", userId, space, parent, search, page],
    enabled: space !== "public",
    queryFn: ({ signal }) =>
      api.wordList.library.list(
        space as LibrarySpace,
        { parent_id: parent, q: search, page, page_size: 20 },
        { signal }
      )
  });
  const publicLists = useQuery({
    queryKey: ["plan-sources", userId, "public", search, page],
    enabled: space === "public",
    queryFn: ({ signal }) =>
      api.wordList.list({ q: search, page, page_size: 20 }, { signal })
  });
  const data = space === "public" ? publicLists : library;
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const c = new AbortController();
    controller.current = c;
    return () => c.abort();
  }, []);
  const [expandedNotice, setExpandedNotice] = useState(false);
  const current = () =>
    !controller.current?.signal.aborted &&
    useUserStore.getState().user?.id === userId;
  function toggle(w: Wordlist, personalName?: string) {
    setError("");
    setDraft((old) =>
      old.some((s) => s.wordlist.id === w.id)
        ? old.filter((s) => s.wordlist.id !== w.id)
        : [...old, { wordlist: w, personalName }]
    );
  }
  async function confirm() {
    setBusy(true);
    setError("");
    try {
      const result = new Map(draft.map((s) => [s.wordlist.id, s]));
      for (const s of ["owned", "favorites"] as const) {
        const chosen = Object.entries(nodes).filter(([, n]) => n.space === s);
        if (!chosen.length) continue;
        const versions = new Set(chosen.map(([, n]) => n.version));
        if (versions.size !== 1)
          throw new Error("目录已变化，请取消文件夹选择并重新选择。");
        const expanded = await api.wordList.library.selection(
          s,
          {
            expected_version: chosen[0]![1].version,
            node_ids: chosen.map(([id]) => id)
          },
          { signal: controller.current?.signal }
        );
        for (const w of expanded.wordlists) result.set(w.id, { wordlist: w });
      }
      if (result.size > 5) throw new Error("最多选择 5 份词表，请减少选择。");
      if (current()) {
        if (Object.keys(nodes).length) {
          setDraft([...result.values()]);
          setNodes({});
          setExpandedNotice(true);
        } else onConfirm([...result.values()]);
      }
    } catch (e) {
      if (current())
        setError(e instanceof Error ? e.message : "选择失败，请重试。");
    } finally {
      if (current()) setBusy(false);
    }
  }
  return (
    <LibraryDialog title="选择词表" busy={busy} onClose={onClose}>
      <div className="space-y-5">
        <Segmented
          label="词表来源"
          value={space}
          options={[
            { value: "owned", label: "我创建的" },
            { value: "favorites", label: "我收藏的" },
            { value: "public", label: "公开词表" }
          ]}
          onChange={(s) => {
            setSpace(s);
            setParent(undefined);
            setPage(1);
            setSearch("");
          }}
        />
        <Input
          aria-label="搜索词表或文件夹"
          value={search}
          disabled={busy}
          placeholder="搜索词表或文件夹"
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        {space !== "public" && (
          <nav aria-label="词表目录" className="flex flex-wrap gap-2 text-sm">
            <button
              type="button"
              onClick={() => {
                setParent(undefined);
                setPage(1);
              }}
            >
              根目录
            </button>
            {library.data?.ancestors.map((c) => (
              <button
                type="button"
                key={c.id}
                onClick={() => {
                  setParent(c.id);
                  setPage(1);
                }}
              >
                {" "}
                / {c.name}
              </button>
            ))}
          </nav>
        )}
        {data.isError ? (
          <PageNotice tone="error">
            {data.error instanceof Error ? data.error.message : "读取失败"}
            <Button variant="link" onClick={() => void data.refetch()}>
              重试
            </Button>
          </PageNotice>
        ) : data.isPending ? (
          <PageNotice>正在读取词表…</PageNotice>
        ) : (
          <ul className="space-y-3">
            {space === "public"
              ? publicLists.data?.items.map((w) => (
                  <li key={w.id}>
                    <SourceChoice
                      item={{ wordlist: w }}
                      checked={draft.some((s) => s.wordlist.id === w.id)}
                      disabled={busy}
                      toggle={() => toggle(w)}
                    />
                  </li>
                ))
              : library.data?.items.map((n) => (
                  <li key={n.id}>
                    {n.wordlist_id === null ? (
                      <div className="flex items-center gap-3 rounded-2xl border border-border p-3">
                        <input
                          type="checkbox"
                          aria-label={`选择文件夹 ${n.name}`}
                          checked={!!nodes[n.id]}
                          disabled={busy}
                          onChange={() =>
                            setNodes((old) => {
                              const next = { ...old };
                              if (next[n.id]) delete next[n.id];
                              else
                                next[n.id] = {
                                  space: space as LibrarySpace,
                                  version: library.data!.version,
                                  name: n.name
                                };
                              return next;
                            })
                          }
                        />
                        <button
                          type="button"
                          className="min-h-10 min-w-0 flex-1 text-left"
                          onClick={() => {
                            setParent(n.id);
                            setSearch("");
                            setPage(1);
                          }}
                        >
                          文件夹 · {n.name} →
                        </button>
                      </div>
                    ) : n.wordlist ? (
                      <SourceChoice
                        item={{ wordlist: n.wordlist, personalName: n.name }}
                        checked={draft.some(
                          (s) => s.wordlist.id === n.wordlist_id
                        )}
                        disabled={busy}
                        toggle={() => toggle(n.wordlist!, n.name)}
                      />
                    ) : (
                      <p className="text-sm text-foreground-muted">
                        {n.name} · 来源不可用
                      </p>
                    )}
                  </li>
                ))}
          </ul>
        )}
        {data.data && (
          <Pager
            page={page}
            total={data.data.pagination.total_pages}
            disabled={busy}
            onChange={setPage}
          />
        )}
        {draft.length > 0 && (
          <section aria-label="待确认词表" className="space-y-2">
            <h3 className="text-sm font-medium">待确认词表</h3>
            <ul className="space-y-2">
              {draft.map((s) => (
                <li
                  key={s.wordlist.id}
                  className="flex items-start gap-3 rounded-2xl bg-muted/70 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 break-words text-sm">
                      {s.wordlist.name}
                    </p>
                    <p className="text-xs text-foreground-muted">
                      {s.wordlist.owner_name} · {s.wordlist.item_count} 个词条
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    aria-label={`取消选择 ${s.wordlist.name}`}
                    onClick={() =>
                      setDraft((old) =>
                        old.filter((i) => i.wordlist.id !== s.wordlist.id)
                      )
                    }
                  >
                    移除
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {expandedNotice && (
          <p role="status" className="text-sm text-foreground-muted">
            文件夹已展开，请核对待确认词表后再次确认选择。
          </p>
        )}
        <p className="text-sm text-foreground-muted">
          已选 {draft.length} 份词表
          {Object.keys(nodes).length > 0 &&
            `，另有 ${Object.keys(nodes).length} 个文件夹待展开`}
          。确认时展开全部子文件夹并去重，最多 5 份。
        </p>
        {Object.entries(nodes).map(([id, n]) => (
          <Button
            key={id}
            size="sm"
            variant="outline"
            onClick={() =>
              setNodes((old) => {
                const next = { ...old };
                delete next[id];
                return next;
              })
            }
          >
            移除文件夹 {n.name}
          </Button>
        ))}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="sticky bottom-0 flex justify-end gap-3 bg-surface py-3">
          <Button variant="outline" disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button disabled={busy} onClick={() => void confirm()}>
            {busy ? "正在展开…" : "确认选择"}
          </Button>
        </div>
      </div>
    </LibraryDialog>
  );
}
export function SourceChoice({
  item,
  checked,
  disabled,
  toggle
}: {
  item: SelectedSource;
  checked: boolean;
  disabled: boolean;
  toggle: () => void;
}) {
  const w = item.wordlist;
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border p-4">
      <input
        className="mt-1"
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={toggle}
      />
      <span className="min-w-0">
        <span className="line-clamp-2 break-words font-medium">{w.name}</span>
        {item.personalName && item.personalName !== w.name && (
          <span className="block text-sm text-foreground-muted">
            备注：{item.personalName}
          </span>
        )}
        <span className="mt-1 block text-xs text-foreground-muted">
          {w.owner_name} · {w.state === "published" ? "公开" : "非公开"} ·{" "}
          {w.item_count} 个词条
        </span>
      </span>
    </label>
  );
}

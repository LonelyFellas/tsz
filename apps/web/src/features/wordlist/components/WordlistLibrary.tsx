"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Folder,
  FolderPlus,
  GripVertical,
  Trash2
} from "lucide-react";
import { Button, Input } from "@tsz/ui/components";
import type {
  LibraryAction,
  LibraryImpact,
  LibraryItem,
  LibraryOperation,
  LibrarySpace
} from "@tsz/types";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";
import {
  PageHeader,
  PageNotice,
  Pager,
  buttonClass,
  primaryButtonClass,
  panelClass
} from "@/features/shell/Page";
import { wordListKeys } from "../hooks/useWordLists";
import { LIBRARY_DRAG_TYPE, libraryDragIds } from "../library-drag";
import { LibraryTree, type LibraryTreeAction } from "./LibraryTree";
import { WordListDetail } from "./WordListDetail";
import { WordListCreator } from "./WordListCreator";
import { ResponsiveExplorer } from "./ResponsiveExplorer";
import { LibraryDialog } from "./LibraryDialog";
import { LibraryFolderPicker } from "./LibraryFolderPicker";

type Modal = { expectedVersion: string } & (
  | { kind: "create"; parentId?: string | null }
  | { kind: "rename"; item: LibraryItem }
  | { kind: "move"; ids: string[] }
  | { kind: "restore"; ids: string[] }
  | { kind: "confirm"; input: LibraryOperation; impact: LibraryImpact }
);
export function WordlistLibrary() {
  const userId = useUserStore((s) => s.user?.id);
  return userId ? <Library key={userId} userId={userId} /> : null;
}
function Library({ userId }: { userId: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const client = useQueryClient();
  const space: LibrarySpace =
    params.get("space") === "favorites" ? "favorites" : "owned";
  const parent = params.get("folder") ?? undefined;
  const trash = params.get("trash") === "true";
  const locateId = params.get("wordlist") ?? undefined;
  const mode = params.get("mode") ?? "read";
  const location = `${space}:${parent ?? "root"}:${trash}:${locateId ?? ""}:${mode}`;
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const resizeOrigin = useRef({ x: 0, width: 260 });
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [modal, setModal] = useState<Modal | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const result = useQuery({
    queryKey: [
      ...wordListKeys.mine(userId),
      "library",
      locateId,
      space,
      parent,
      trash,
      query,
      page
    ],
    queryFn: ({ signal }) =>
      api.wordList.library.list(
        space,
        { parent_id: parent, wordlist_id: locateId, trash, q: query, page },
        { signal }
      ),
    refetchOnMount: "always"
  });
  const current = useRef(location);
  useEffect(() => {
    if (current.current === location) return;
    current.current = location;
    setSelected([]);
    setModal(null);
    setQuery("");
    setPage(1);
    setError("");
    setNotice("");
  }, [location]);
  function go(folder?: string, targetTrash = trash, targetSpace = space) {
    if (working.current) return;
    setSelected([]);
    setModal(null);
    setQuery("");
    setPage(1);
    setNotice("");
    const p = new URLSearchParams({ space: targetSpace });
    if (folder) p.set("folder", folder);
    if (targetTrash) p.set("trash", "true");
    router.push(`/account/wordlists?${p}`);
  }
  const alive = () =>
    mounted.current && useUserStore.getState().user?.id === userId;
  async function run(
    task: () => Promise<unknown>,
    message: string,
    close = true
  ) {
    if (working.current || !alive()) return;
    working.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await task();
      if (!alive()) return;
      if (close) {
        setModal(null);
        setSelected([]);
      }
      setNotice(message);
      await client.invalidateQueries({ queryKey: wordListKeys.all });
    } catch (e) {
      if (!alive()) return;
      setError(
        e instanceof Error
          ? `操作未完成：${e.message}。请刷新后重试。`
          : "操作未完成，请刷新后重试。"
      );
      await result.refetch();
    } finally {
      working.current = false;
      if (alive()) setBusy(false);
    }
  }
  function operation(
    action: LibraryAction,
    ids: string[],
    expectedVersion = result.data!.version
  ): LibraryOperation {
    return { expected_version: expectedVersion, action, ids };
  }
  async function confirm(
    action: "trash" | "purge",
    ids: string[],
    empty = false
  ) {
    if (!result.data) return;
    const input = { ...operation(action, ids), empty_trash: empty };
    await run(
      async () => {
        const impact = await api.wordList.library.preview(space, input);
        if (alive())
          setModal({
            expectedVersion: result.data!.version,
            kind: "confirm",
            input,
            impact
          });
      },
      "",
      false
    );
  }
  function move(ids: string[], target: string | null) {
    if (!result.data) return;
    void run(
      () =>
        api.wordList.library.operate(space, {
          ...operation("move", ids),
          target_id: target
        }),
      "已移动"
    );
  }
  function toggle(id: string) {
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id]
    );
  }
  function onDrop(data: DataTransfer, target: string | null) {
    const ids = libraryDragIds(data, space);
    if (!trash && ids.length) move(ids, target);
  }
  const items = result.data?.items ?? [];
  const activeItem = locateId
    ? items.find((item) => item.wordlist_id === locateId)
    : undefined;
  const currentFolder = activeItem ? activeItem.parent_id : (parent ?? null);
  const workspaceHref = (
    id?: string,
    nextMode = "read",
    folder: string | null = currentFolder
  ) => {
    const p = new URLSearchParams({ space });
    if (folder) p.set("folder", folder);
    if (trash) p.set("trash", "true");
    if (id) p.set("wordlist", id);
    if (nextMode !== "read") p.set("mode", nextMode);
    return `/account/wordlists?${p}`;
  };
  const openWordlist = (item: LibraryItem) => {
    if (!working.current && item.wordlist_id) {
      router.push(workspaceHref(item.wordlist_id, "read", item.parent_id));
    }
  };
  function treeAction(action: LibraryTreeAction, item: LibraryItem) {
    if (!result.data || working.current) return;
    window.dispatchEvent(new Event("tsz:page-leave-finished"));
    setError("");
    if (action === "trash" || action === "purge") {
      void confirm(action, [item.id]);
      return;
    }
    if (action === "rename") {
      setName(item.name);
      setModal({ kind: "rename", item, expectedVersion: result.data.version });
    } else
      setModal({
        kind: action,
        ids: [item.id],
        expectedVersion: result.data.version
      });
  }
  return (
    <div
      style={{ marginLeft: "calc(0px - min(50vw - 1rem, 800px))" }}
      className="relative left-1/2 w-[calc(100vw-2rem)] max-w-[1600px] py-6 sm:py-8"
    >
      <PageHeader
        eyebrow="我的学习"
        title="我的词表"
        description="在左侧整理目录，在右侧阅读和编辑词表。"
        actions={
          <Link href="/wordlists" className={buttonClass}>
            浏览公开词表
          </Link>
        }
      />
      <div
        style={{ "--explorer-width": `${sidebarWidth}px` } as CSSProperties}
        className="grid min-h-[70dvh] overflow-hidden rounded-3xl border border-border/70 bg-surface/80 shadow-glass lg:grid-cols-[var(--explorer-width)_minmax(0,1fr)]"
      >
        <ResponsiveExplorer overlayActive={!!modal}>
          {({ closeDrawer }) => (
            <>
              <div className="flex h-11 items-center px-4">
                <h2 className="text-[11px] font-medium tracking-[0.12em] text-foreground-muted">
                  资源管理器
                </h2>
              </div>
              <div
                data-leaves-page
                role="group"
                aria-label="我的词表分类"
                className="flex border-b border-border/70 px-2"
              >
                {(
                  [
                    ["owned", "我创建的"],
                    ["favorites", "我收藏的"]
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    disabled={busy}
                    aria-pressed={space === value}
                    onClick={() => go(undefined, false, value)}
                    className={`min-h-9 flex-1 border-b-2 px-2 text-xs transition-colors ${space === value ? "border-primary text-foreground" : "border-transparent text-foreground-muted hover:text-foreground"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div
                data-explorer-scroll
                className="min-h-0 flex-1 overflow-auto"
              >
                <LibraryTree
                  key={`${userId}:${space}:${trash}`}
                  userId={userId}
                  space={space}
                  trash={trash}
                  selectedFolder={currentFolder ?? undefined}
                  selectedWordlist={locateId}
                  ancestorIds={(
                    activeItem?.path ??
                    result.data?.ancestors ??
                    []
                  ).map((p) => p.id)}
                  disabled={busy}
                  onFolder={(id) => {
                    go(id);
                  }}
                  onWordlist={(item) => {
                    openWordlist(item);
                    closeDrawer();
                  }}
                  onMove={move}
                  onCreateFolder={(folder) => {
                    if (!result.data) return;
                    setError("");
                    setName("");
                    setModal({
                      kind: "create",
                      parentId: folder ?? null,
                      expectedVersion: result.data.version
                    });
                  }}
                  onCreateWordlist={(folder) => {
                    router.push(
                      workspaceHref(undefined, "new", folder ?? null)
                    );
                    closeDrawer();
                  }}
                  onAction={treeAction}
                  onRefresh={() =>
                    void client.invalidateQueries({
                      queryKey: wordListKeys.mine(userId)
                    })
                  }
                />
              </div>
              <button
                data-leaves-page
                disabled={busy}
                onClick={() => go(undefined, !trash)}
                className={`flex h-10 w-full items-center gap-2 border-t border-border/70 px-4 text-left text-xs hover:bg-foreground/5 ${trash ? "text-primary" : "text-foreground-muted"}`}
              >
                <Trash2 className="size-3.5" aria-hidden />
                {trash ? "返回文件夹" : "回收站"}
              </button>
              <div
                role="separator"
                aria-label="调整目录宽度"
                aria-orientation="vertical"
                aria-valuemin={200}
                aria-valuemax={420}
                aria-valuenow={sidebarWidth}
                tabIndex={0}
                className="absolute inset-y-0 -right-1 z-10 hidden w-2 touch-none cursor-col-resize hover:bg-primary/30 focus-visible:bg-primary/40 focus-visible:outline-none lg:block"
                onPointerDown={(event) => {
                  event.preventDefault();
                  resizeOrigin.current = {
                    x: event.clientX,
                    width: sidebarWidth
                  };
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={(event) => {
                  if (event.currentTarget.hasPointerCapture(event.pointerId))
                    setSidebarWidth(
                      Math.max(
                        200,
                        Math.min(
                          420,
                          resizeOrigin.current.width +
                            event.clientX -
                            resizeOrigin.current.x
                        )
                      )
                    );
                }}
                onPointerUp={(event) =>
                  event.currentTarget.releasePointerCapture(event.pointerId)
                }
                onKeyDown={(event) => {
                  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                    event.preventDefault();
                    setSidebarWidth((width) =>
                      Math.max(
                        200,
                        Math.min(
                          420,
                          width + (event.key === "ArrowRight" ? 16 : -16)
                        )
                      )
                    );
                  }
                }}
              />
            </>
          )}
        </ResponsiveExplorer>
        <section aria-label="内容区域" className="min-w-0 p-4 sm:p-6 lg:p-8">
          {error && <PageNotice tone="error">{error}</PageNotice>}
          {notice && (
            <p role="status" className="mb-4 text-sm text-success">
              {notice}
            </p>
          )}

          {locateId || mode === "new" ? (
            <>
              <div className="mb-6 flex items-center justify-between gap-3 border-b border-border pb-3">
                <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                  <BookOpen
                    className="size-4 shrink-0 text-primary"
                    aria-hidden
                  />
                  <span className="truncate">
                    {mode === "new" ? "新建词表" : (activeItem?.name ?? "词表")}
                  </span>
                  {mode === "edit" && (
                    <span className="text-xs text-foreground-muted">编辑</span>
                  )}
                </span>
                <Button
                  data-leaves-page
                  variant="ghost"
                  size="sm"
                  onClick={() => go(currentFolder ?? undefined)}
                >
                  关闭词表
                </Button>
              </div>
              {mode === "new" && space === "owned" && !trash ? (
                <WordListCreator
                  embedded
                  folderId={parent}
                  onSaved={(id) => router.push(workspaceHref(id))}
                  onCancel={() => go(currentFolder ?? undefined)}
                />
              ) : result.isPending ? (
                <PageNotice>正在读取词表…</PageNotice>
              ) : !activeItem ? (
                <PageNotice tone="error">
                  词表不存在或已移入回收站，请在左侧重新选择。
                </PageNotice>
              ) : trash ? (
                <PageNotice>
                  此词表在回收站中，恢复后可以打开。
                  <Button
                    variant="outline"
                    onClick={() =>
                      setModal({
                        kind: "restore",
                        ids: [activeItem.id],
                        expectedVersion: result.data!.version
                      })
                    }
                  >
                    恢复词表
                  </Button>
                </PageNotice>
              ) : !activeItem.wordlist ? (
                <PageNotice>
                  原词表暂不可用，收藏位置和个人备注仍然保留。
                </PageNotice>
              ) : mode === "edit" && space === "owned" ? (
                <WordListCreator
                  key={locateId}
                  embedded
                  id={locateId}
                  onSaved={(id) => router.push(workspaceHref(id))}
                  onCancel={() => router.push(workspaceHref(locateId))}
                />
              ) : (
                <WordListDetail
                  embedded
                  id={locateId!}
                  mine={space === "owned"}
                  editHref={workspaceHref(locateId, "edit")}
                />
              )}
            </>
          ) : (
            <>
              <nav
                aria-label="当前文件夹路径"
                className="mb-5 flex flex-wrap items-center gap-2 text-sm"
              >
                <button
                  disabled={busy}
                  className="text-primary"
                  onClick={() => go()}
                  onDragOver={(e) => {
                    if (!trash) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    onDrop(e.dataTransfer, null);
                  }}
                >
                  {space === "owned" ? "我创建的" : "我收藏的"}
                  {trash ? " / 回收站" : ""}
                </button>
                {result.data?.ancestors.map((p) => (
                  <button
                    disabled={busy}
                    className="text-primary"
                    key={p.id}
                    onClick={() => go(p.id)}
                    onDragOver={(e) => {
                      if (!trash) e.preventDefault();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      onDrop(e.dataTransfer, p.id);
                    }}
                  >
                    / {p.name}
                  </button>
                ))}
              </nav>
              <div className="mb-5 flex flex-wrap gap-3">
                <Input
                  aria-label="搜索词表和文件夹"
                  placeholder={
                    trash ? "搜索回收站" : "搜索此系统的词表和文件夹"
                  }
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(1);
                    setSelected([]);
                  }}
                  className="min-w-48 flex-1"
                />
                {!trash && (
                  <>
                    <Button
                      disabled={busy || !result.data}
                      variant="outline"
                      onClick={() => {
                        setName("");
                        setModal({
                          expectedVersion: result.data!.version,
                          kind: "create"
                        });
                      }}
                    >
                      <FolderPlus className="size-4" aria-hidden />
                      新建文件夹
                    </Button>
                    {space === "owned" && (
                      <Link
                        className={primaryButtonClass}
                        href={workspaceHref(undefined, "new")}
                      >
                        创建词表
                      </Link>
                    )}
                  </>
                )}
                {trash && (
                  <Button
                    variant="outline"
                    disabled={busy || !result.data}
                    onClick={() => void confirm("purge", [], true)}
                  >
                    清空回收站
                  </Button>
                )}
              </div>
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    aria-label="选择当前页全部项目"
                    disabled={busy || !items.length}
                    checked={
                      items.length > 0 &&
                      items.every((i) => selected.includes(i.id))
                    }
                    onChange={(e) =>
                      setSelected(
                        e.target.checked ? items.map((i) => i.id) : []
                      )
                    }
                  />
                  全选本页
                </label>
                {selected.length > 0 && (
                  <>
                    <span className="text-sm text-foreground-muted">
                      已选 {selected.length} 项
                    </span>
                    {trash ? (
                      <>
                        <Button
                          disabled={busy}
                          variant="outline"
                          onClick={() =>
                            setModal({
                              expectedVersion: result.data!.version,
                              kind: "restore",
                              ids: selected
                            })
                          }
                        >
                          恢复
                        </Button>
                        <Button
                          disabled={busy}
                          variant="outline"
                          onClick={() => void confirm("purge", selected)}
                        >
                          彻底删除
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          disabled={busy}
                          variant="outline"
                          onClick={() =>
                            setModal({
                              expectedVersion: result.data!.version,
                              kind: "move",
                              ids: selected
                            })
                          }
                        >
                          移动到…
                        </Button>
                        <Button
                          disabled={busy}
                          variant="outline"
                          onClick={() => void confirm("trash", selected)}
                        >
                          删除
                        </Button>
                      </>
                    )}
                  </>
                )}
              </div>
              {result.isError ? (
                <PageNotice tone="error">
                  目录读取失败。
                  <Button variant="ghost" onClick={() => void result.refetch()}>
                    重试
                  </Button>
                  <Button variant="ghost" onClick={() => go()}>
                    返回根目录
                  </Button>
                </PageNotice>
              ) : result.isPending ? (
                <PageNotice>正在加载目录…</PageNotice>
              ) : !items.length ? (
                <PageNotice>
                  {query
                    ? "没有找到匹配项目"
                    : trash
                      ? "回收站为空"
                      : "此文件夹为空"}
                </PageNotice>
              ) : (
                <ul className="space-y-3" aria-label="目录项目">
                  {items.map((item) => (
                    <li
                      key={item.id}
                      draggable={!trash && !busy}
                      onDragStart={(event) => {
                        event.dataTransfer.setData(
                          LIBRARY_DRAG_TYPE,
                          JSON.stringify({
                            space,
                            ids: selected.includes(item.id)
                              ? selected
                              : [item.id]
                          })
                        );
                      }}
                      onDragOver={(e) => {
                        if (!trash && !item.wordlist_id) e.preventDefault();
                      }}
                      onDrop={(e) => {
                        if (!item.wordlist_id) {
                          e.preventDefault();
                          onDrop(e.dataTransfer, item.id);
                        }
                      }}
                      className={`${panelClass} flex flex-wrap items-center gap-4 !p-4`}
                    >
                      {!trash && (
                        <span
                          draggable={!busy}
                          aria-label={`拖动 ${item.name}`}
                          title="拖动到左侧文件夹"
                          className="cursor-grab text-foreground-subtle active:cursor-grabbing"
                        >
                          <GripVertical className="size-4" aria-hidden />
                        </span>
                      )}
                      <input
                        type="checkbox"
                        aria-label={`选择 ${item.name}`}
                        disabled={busy}
                        checked={selected.includes(item.id)}
                        onChange={() => toggle(item.id)}
                      />
                      {item.wordlist_id ? (
                        <BookOpen
                          className="size-6 shrink-0 text-foreground-muted"
                          aria-hidden
                        />
                      ) : (
                        <Folder
                          className="size-6 shrink-0 text-primary"
                          aria-hidden
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        {!item.wordlist_id ? (
                          <button
                            disabled={busy}
                            onClick={() => go(item.id)}
                            className="break-words text-left font-bold hover:text-primary"
                          >
                            {item.name}
                          </button>
                        ) : !trash && item.wordlist ? (
                          <Link
                            className="break-words font-bold hover:text-primary"
                            draggable={false}
                            href={workspaceHref(
                              item.wordlist_id,
                              "read",
                              item.parent_id
                            )}
                          >
                            {item.name}
                          </Link>
                        ) : (
                          <span className="break-words font-bold">
                            {item.name}
                          </span>
                        )}
                        {item.wordlist_id && (
                          <p className="mt-1 text-xs text-foreground-muted">
                            {item.wordlist
                              ? `${space === "favorites" ? `${item.wordlist.name} · ${item.wordlist.owner_name} · ` : ""}${item.wordlist.item_count} 个词条`
                              : "原词表不可用"}
                          </p>
                        )}
                        {(query || locateId) && (
                          <button
                            className="mt-1 block text-left text-xs text-primary"
                            onClick={() =>
                              go(
                                trash
                                  ? item.path.at(-1)?.id
                                  : (item.parent_id ?? undefined)
                              )
                            }
                          >
                            {item.path.map((p) => p.name).join(" / ") ||
                              "根目录"}{" "}
                            · 打开所在位置
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {trash ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() =>
                                setModal({
                                  expectedVersion: result.data!.version,
                                  kind: "restore",
                                  ids: [item.id]
                                })
                              }
                            >
                              恢复
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() => void confirm("purge", [item.id])}
                            >
                              彻底删除
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() => {
                                setName(item.name);
                                setModal({
                                  expectedVersion: result.data!.version,
                                  kind: "rename",
                                  item
                                });
                              }}
                            >
                              {space === "favorites" && item.wordlist_id
                                ? "备注名"
                                : "重命名"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() =>
                                setModal({
                                  expectedVersion: result.data!.version,
                                  kind: "move",
                                  ids: [item.id]
                                })
                              }
                            >
                              移动
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() => void confirm("trash", [item.id])}
                            >
                              删除
                            </Button>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {result.data && (
                <Pager
                  page={page}
                  total={result.data.pagination.total_pages}
                  onChange={(v) => {
                    setPage(v);
                    setSelected([]);
                  }}
                />
              )}
            </>
          )}
        </section>
      </div>
      {modal && (
        <LibraryDialog
          busy={busy}
          title={
            modal.kind === "create"
              ? "新建文件夹"
              : modal.kind === "rename"
                ? "修改名称"
                : modal.kind === "move"
                  ? "移动到"
                  : modal.kind === "restore"
                    ? "恢复到"
                    : modal.input.action === "trash"
                      ? "移入回收站"
                      : "彻底删除"
          }
          onClose={() => setModal(null)}
        >
          {error && (
            <p role="alert" className="mb-4 text-sm text-danger">
              {error}
            </p>
          )}
          {(modal.kind === "create" || modal.kind === "rename") && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!result.data) return;
                void run(
                  () =>
                    modal.kind === "create"
                      ? api.wordList.library.createFolder(space, {
                          expected_version: modal.expectedVersion,
                          parent_id:
                            modal.parentId === undefined
                              ? (parent ?? null)
                              : modal.parentId,
                          name
                        })
                      : api.wordList.library.rename(space, modal.item!.id, {
                          expected_version: modal.expectedVersion,
                          name
                        }),
                  "已保存名称"
                );
              }}
            >
              <label className="text-sm" htmlFor="library-name">
                名称
              </label>
              <Input
                id="library-name"
                autoFocus
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Button
                className="mt-4"
                disabled={busy || !name.trim()}
                type="submit"
              >
                保存
              </Button>
            </form>
          )}
          {(modal.kind === "move" || modal.kind === "restore") && (
            <>
              {modal.kind === "restore" && (
                <Button
                  className="mb-4"
                  disabled={busy}
                  variant="outline"
                  onClick={() =>
                    void run(
                      () =>
                        api.wordList.library.operate(space, {
                          ...operation(
                            "restore",
                            modal.ids,
                            modal.expectedVersion
                          ),
                          original_location: true
                        }),
                      "已恢复；原位置不可用时放回根目录"
                    )
                  }
                >
                  恢复到原位置
                </Button>
              )}
              <LibraryFolderPicker
                space={space}
                busy={busy}
                exclude={modal.ids}
                onPick={(target) =>
                  void run(
                    () =>
                      api.wordList.library.operate(space, {
                        ...operation(
                          modal.kind === "move" ? "move" : "restore",
                          modal.ids,
                          modal.expectedVersion
                        ),
                        target_id: target
                      }),
                    modal.kind === "move" ? "已移动" : "已恢复"
                  )
                }
              />
            </>
          )}
          {modal.kind === "confirm" && (
            <>
              <p className="mb-3">
                将{modal.input.action === "trash" ? "移入回收站" : "彻底删除"}{" "}
                {modal.impact.folder_count} 个文件夹和{" "}
                {modal.impact.wordlist_count} 份词表。
              </p>
              <p className="mb-5 text-sm text-foreground-muted">
                {modal.input.action === "purge"
                  ? "此操作不可恢复。"
                  : space === "owned"
                    ? "公开词表将停止公开，恢复后为私密状态。"
                    : "只移除你的收藏，不影响原作者词表。"}
              </p>
              <Button
                disabled={busy}
                onClick={() =>
                  void run(
                    async () => {
                      await api.wordList.library.operate(space, modal.input);
                      if (modal.input.empty_trash && alive())
                        router.push(
                          `/account/wordlists?space=${space}&trash=true`
                        );
                    },
                    modal.input.action === "trash"
                      ? "已移入回收站"
                      : "已彻底删除"
                  )
                }
              >
                确认{modal.input.action === "trash" ? "删除" : "彻底删除"}
              </Button>
            </>
          )}
        </LibraryDialog>
      )}
    </div>
  );
}

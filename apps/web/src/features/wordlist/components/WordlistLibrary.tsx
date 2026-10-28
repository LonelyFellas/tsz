"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  LoaderCircle,
  ChevronRight,
  FolderInput,
  FilePenLine,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  X,
  Folder,
  FolderPlus,
  GripVertical,
  Trash2
} from "lucide-react";
import {
  Button,
  Input,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator
} from "@tsz/ui/components";
import { cn } from "@tsz/ui/lib/cn";
import { SearchField } from "@/features/shell/SearchField";
import { STATE_LABEL } from "../reading";
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
  Segmented
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
  const [searchTerm, setSearchTerm] = useState(query.trim());
  const [composing, setComposing] = useState(false);
  useEffect(() => {
    if (composing) return;
    const timer = setTimeout(() => setSearchTerm(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query, composing]);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const [modal, setModal] = useState<Modal | null>(null);
  const dialogOpener = useRef<HTMLElement | null>(null);
  function rememberOpener(target: EventTarget | null) {
    if (modal || !(target instanceof Element)) return;
    const control = target.closest<HTMLElement>("button,a");
    if (control && !control.closest('[role="menu"]'))
      dialogOpener.current = control;
  }
  const [name, setName] = useState("");
  const nameInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (
      error &&
      !busy &&
      (modal?.kind === "create" || modal?.kind === "rename")
    )
      nameInput.current?.focus();
  }, [error, busy, modal]);
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
      searchTerm,
      page
    ],
    queryFn: ({ signal }) =>
      api.wordList.library.list(
        space,
        {
          parent_id: parent,
          wordlist_id: locateId,
          trash,
          q: searchTerm,
          page
        },
        { signal }
      ),
    refetchOnMount: "always",
    meta: { libraryLocation: location },
    placeholderData: (previous, previousQuery) =>
      previousQuery?.meta?.libraryLocation === location ? previous : undefined
  });
  const searchPending =
    composing || query.trim() !== searchTerm || result.isPlaceholderData;
  const current = useRef(location);
  useEffect(() => {
    if (current.current === location) return;
    current.current = location;
    setSelected([]);
    setModal(null);
    setQuery("");
    setSearchTerm("");
    setComposing(false);
    setPage(1);
    setError("");
    setNotice("");
  }, [location]);
  function go(folder?: string, targetTrash = trash, targetSpace = space) {
    if (working.current) return;
    setSelected([]);
    setModal(null);
    setQuery("");
    setSearchTerm("");
    setComposing(false);
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
      const detail =
        e instanceof Error ? e.message.trim().replace(/[。.!！]+$/u, "") : "";
      setError(detail ? `操作未完成：${detail}。` : "操作未完成，请稍后重试。");
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
  const allSelected =
    items.length > 0 && items.every((item) => selected.includes(item.id));
  const partlySelected =
    !allSelected && items.some((item) => selected.includes(item.id));
  const spaceLabel = space === "owned" ? "创建" : "收藏";
  const folderName = result.data?.ancestors.at(-1)?.name;
  function clearSearch() {
    setQuery("");
    setSearchTerm("");
    setComposing(false);
    setPage(1);
    setSelected([]);
    searchInput.current?.focus();
  }
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
      style={{ marginLeft: "calc(0px - min(50vw - 1.5rem, 780px))" }}
      onPointerDownCapture={(event) => rememberOpener(event.target)}
      onFocusCapture={(event) => rememberOpener(event.target)}
      className="relative left-1/2 w-[calc(100vw-3rem)] max-w-[1560px] py-6 sm:py-8"
    >
      {!locateId && mode !== "new" && (
        <PageHeader
          eyebrow="我的学习"
          title="我的词表"
          actions={
            <Button asChild variant="ghost" size="compact">
              <Link href="/wordlists">浏览公开词表</Link>
            </Button>
          }
        />
      )}
      <div
        style={{ "--explorer-width": `${sidebarWidth}px` } as CSSProperties}
        className="grid min-h-[70dvh] grid-rows-[auto_1fr] overflow-clip rounded-3xl border border-border/70 bg-surface/80 shadow-glass lg:grid-cols-[var(--explorer-width)_minmax(0,1fr)] lg:grid-rows-1"
      >
        <ResponsiveExplorer overlayActive={!!modal}>
          {({ closeDrawer }) => (
            <>
              <div className="flex h-11 items-center px-4">
                <h2 className="text-[11px] font-medium tracking-[0.12em] text-foreground-muted">
                  词表目录
                </h2>
              </div>
              <div data-leaves-page className="px-3 pb-4">
                <Segmented
                  label="我的词表分类"
                  value={space}
                  options={[
                    { value: "owned", label: "创建" },
                    { value: "favorites", label: "收藏" }
                  ]}
                  disabled={busy}
                  onChange={(value) => go(undefined, false, value)}
                />
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
                    closeDrawer();
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
              <div className="shrink-0 border-t border-border/60 p-2">
                <button
                  type="button"
                  data-leaves-page
                  disabled={busy}
                  onClick={() => {
                    go(undefined, !trash);
                    closeDrawer();
                  }}
                  aria-pressed={trash}
                  className="flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 text-left text-[13px] text-foreground-muted transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40 aria-pressed:bg-primary-muted aria-pressed:text-primary lg:min-h-10"
                >
                  {trash ? (
                    <ArrowLeft
                      className="size-4 shrink-0"
                      strokeWidth={1.7}
                      aria-hidden
                    />
                  ) : (
                    <Trash2
                      className="size-4 shrink-0"
                      strokeWidth={1.7}
                      aria-hidden
                    />
                  )}
                  {trash ? "返回词表" : "回收站"}
                </button>
              </div>
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
        <section
          aria-label="内容区域"
          className="min-w-0 p-4 sm:p-6 lg:p-8"
          aria-busy={busy || result.isFetching}
        >
          {error && !modal && <PageNotice tone="error">{error}</PageNotice>}
          {notice && (
            <div
              role="status"
              className="mb-4 flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/70 py-2 pl-4 pr-1 text-sm"
            >
              <CheckCircle2
                className="size-5 shrink-0 text-success"
                aria-hidden
              />
              <span className="min-w-0 flex-1">{notice}</span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="关闭操作提示"
                onClick={() => setNotice("")}
              >
                <X className="size-4" aria-hidden />
              </Button>
            </div>
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
                    <span className="shrink-0 whitespace-nowrap text-xs text-foreground-muted">
                      编辑
                    </span>
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
              {(parent || trash) && (
                <nav
                  aria-label="当前文件夹路径"
                  className="-ml-2 mb-3 flex flex-wrap items-center gap-1 text-sm"
                >
                  <button
                    disabled={busy}
                    className="min-h-10 rounded-lg px-2 text-foreground-muted transition-colors hover:bg-muted hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
                    aria-current={!parent ? "page" : undefined}
                    onClick={() => go()}
                    onDragOver={(e) => {
                      if (!trash) e.preventDefault();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      onDrop(e.dataTransfer, null);
                    }}
                  >
                    {space === "owned" ? "创建" : "收藏"}
                    {trash ? " / 回收站" : ""}
                  </button>
                  {result.data?.ancestors.map((p) => (
                    <span
                      key={p.id}
                      className="flex min-w-0 items-center gap-1"
                    >
                      <ChevronRight
                        className="size-3.5 shrink-0 text-foreground-subtle"
                        aria-hidden
                      />
                      <button
                        disabled={busy}
                        aria-current={p.id === parent ? "page" : undefined}
                        className="min-h-10 min-w-0 break-words rounded-lg px-2 text-left text-foreground-muted transition-colors hover:bg-muted hover:text-primary focus-visible:outline-2 focus-visible:outline-primary aria-[current=page]:text-foreground"
                        onClick={() => go(p.id)}
                        onDragOver={(e) => {
                          if (!trash) e.preventDefault();
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          onDrop(e.dataTransfer, p.id);
                        }}
                      >
                        {p.name}
                      </button>
                    </span>
                  ))}
                </nav>
              )}
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="break-words text-xl font-semibold tracking-tight">
                    {query
                      ? "搜索结果"
                      : trash
                        ? "回收站"
                        : (folderName ?? spaceLabel)}
                  </h2>
                  {(query || trash || space === "favorites") && (
                    <p className="mt-1 text-xs leading-5 text-foreground-muted">
                      {query
                        ? `在${trash ? "回收站" : `「${spaceLabel}」全部目录`}中搜索`
                        : trash
                          ? "移入回收站的项目可以恢复；彻底删除后无法找回。"
                          : space === "favorites"
                            ? "收藏的内容随原作者更新，备注名仅自己可见。"
                            : null}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {!trash && (
                    <>
                      <Button
                        disabled={busy || !result.data}
                        variant="outline"
                        size="sm"
                        className="min-h-11 px-3 sm:min-h-10 sm:px-4"
                        onClick={() => {
                          setName("");
                          setError("");
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
                        <Button
                          asChild
                          size="sm"
                          className="min-h-11 px-3 sm:min-h-10 sm:px-4"
                        >
                          <Link
                            href={workspaceHref(undefined, "new")}
                            aria-disabled={busy}
                            onClick={(event) => {
                              if (busy) event.preventDefault();
                            }}
                          >
                            <Plus className="size-4" aria-hidden />
                            创建词表
                          </Link>
                        </Button>
                      )}
                    </>
                  )}
                  {trash && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-11 sm:min-h-10"
                      disabled={
                        busy ||
                        !result.data ||
                        (!query && !result.data.pagination.total)
                      }
                      onClick={() => void confirm("purge", [], true)}
                    >
                      清空回收站
                    </Button>
                  )}
                </div>
              </div>
              <SearchField
                ref={searchInput}
                className="mb-4 w-full sm:max-w-sm"
                maxLength={100}
                aria-label="搜索词表和文件夹"
                placeholder={trash ? "搜索回收站" : "搜索词表和文件夹"}
                value={query}
                disabled={busy}
                onValueChange={(value) => {
                  setQuery(value);
                  setPage(1);
                  setSelected([]);
                }}
                onClear={clearSearch}
                onCompositionStart={() => setComposing(true)}
                onCompositionEnd={(event) => {
                  setQuery(event.currentTarget.value);
                  setComposing(false);
                }}
              />
              {items.length > 0 && (
                <div
                  className={cn(
                    "mb-2 flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-transparent px-2 py-1",
                    selected.length > 0 &&
                      "sticky top-20 z-20 border-primary/20 bg-surface/95 shadow-glass backdrop-blur-xl"
                  )}
                >
                  <label className="flex min-h-11 cursor-pointer items-center gap-2 px-2 text-sm sm:min-h-9">
                    <input
                      type="checkbox"
                      aria-label="选择当前页全部项目"
                      disabled={busy || searchPending || !items.length}
                      className="size-4 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      ref={(element) => {
                        if (element) element.indeterminate = partlySelected;
                      }}
                      checked={allSelected}
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
                      <Button
                        size="compact"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setSelected([])}
                      >
                        取消选择
                      </Button>
                      {trash ? (
                        <>
                          <Button
                            disabled={busy}
                            variant="outline"
                            size="compact"
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
                            variant="ghost"
                            size="compact"
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
                            size="compact"
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
                            variant="ghost"
                            size="compact"
                            onClick={() => void confirm("trash", selected)}
                          >
                            删除
                          </Button>
                        </>
                      )}
                    </>
                  )}
                  {!selected.length && result.data && (
                    <span
                      aria-live="polite"
                      className="ml-auto flex items-center gap-2 pr-2 text-xs tabular-nums text-foreground-muted"
                    >
                      {searchPending || result.isFetching ? (
                        <>
                          <LoaderCircle
                            className="size-3.5 animate-spin motion-reduce:animate-none"
                            aria-hidden
                          />
                          正在更新…
                        </>
                      ) : (
                        <>
                          {query ? "找到" : "共"} {result.data.pagination.total}{" "}
                          项
                        </>
                      )}
                    </span>
                  )}
                </div>
              )}
              {!items.length &&
                !result.isPending &&
                (searchPending || result.isFetching) && (
                  <p
                    role="status"
                    className="my-4 text-sm text-foreground-muted"
                  >
                    正在更新…
                  </p>
                )}
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
                <div className="flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center">
                  <span className="mb-3 text-foreground-subtle">
                    {query ? (
                      <Search className="size-6" aria-hidden />
                    ) : trash ? (
                      <Trash2 className="size-6" aria-hidden />
                    ) : (
                      <BookOpen className="size-6" aria-hidden />
                    )}
                  </span>
                  <h3 className="text-sm font-medium text-foreground-muted">
                    {query
                      ? "未找到匹配项目"
                      : trash
                        ? "回收站为空"
                        : parent
                          ? "此文件夹为空"
                          : space === "favorites"
                            ? "暂无收藏"
                            : "暂无词表"}
                  </h3>
                  {query ? (
                    <Button
                      className="mt-5"
                      variant="outline"
                      onClick={clearSearch}
                    >
                      清空搜索
                    </Button>
                  ) : null}
                </div>
              ) : (
                <ul
                  className={cn(
                    "divide-y divide-border/60 transition-opacity",
                    searchPending && "opacity-50"
                  )}
                  inert={busy || searchPending}
                  aria-label="目录项目"
                  aria-busy={searchPending || result.isFetching}
                >
                  {items.map((item) => (
                    <li
                      key={item.id}
                      draggable={!trash && !busy && !searchPending}
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
                        if (
                          !trash &&
                          !busy &&
                          !item.wordlist_id &&
                          Array.from(e.dataTransfer.types).includes(
                            LIBRARY_DRAG_TYPE
                          )
                        ) {
                          e.preventDefault();
                          setDropTarget(item.id);
                        }
                      }}
                      onDragLeave={(e) => {
                        if (
                          !e.currentTarget.contains(
                            e.relatedTarget as Node | null
                          )
                        )
                          setDropTarget(null);
                      }}
                      onDragEnd={() => setDropTarget(null)}
                      onDrop={(e) => {
                        setDropTarget(null);
                        if (!item.wordlist_id && !busy) {
                          e.preventDefault();
                          onDrop(e.dataTransfer, item.id);
                        }
                      }}
                      className={cn(
                        "group flex items-center gap-2 rounded-xl px-1 py-2 transition-colors sm:gap-3 sm:px-3",
                        selected.includes(item.id)
                          ? "bg-primary-muted/70"
                          : "hover:bg-muted/60 focus-within:bg-muted/60",
                        dropTarget === item.id &&
                          "bg-primary-muted outline-2 -outline-offset-2 outline-primary"
                      )}
                    >
                      {!trash && (
                        <span
                          draggable={!busy}
                          aria-label={`拖动 ${item.name}`}
                          title="拖动到左侧文件夹"
                          className="hidden cursor-grab text-foreground-subtle opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 sm:block active:cursor-grabbing"
                        >
                          <GripVertical className="size-4" aria-hidden />
                        </span>
                      )}
                      <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center">
                        <input
                          className="size-4 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                          type="checkbox"
                          aria-label={`选择 ${item.name}`}
                          disabled={busy}
                          checked={selected.includes(item.id)}
                          onChange={() => toggle(item.id)}
                        />
                      </label>
                      <span
                        className={cn(
                          "flex size-6 shrink-0 items-center justify-center sm:size-8",
                          item.wordlist_id
                            ? "text-foreground-muted"
                            : "text-primary"
                        )}
                      >
                        {item.wordlist_id ? (
                          <BookOpen className="size-5" aria-hidden />
                        ) : (
                          <Folder className="size-5" aria-hidden />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        {!item.wordlist_id ? (
                          <button
                            disabled={busy}
                            onClick={() => go(item.id)}
                            className="flex min-h-11 w-full items-center gap-2 break-words rounded-lg text-left text-sm font-medium hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
                          >
                            <span className="min-w-0 flex-1 break-words">
                              {item.name}
                            </span>
                            <ChevronRight
                              className="size-4 shrink-0 text-foreground-subtle"
                              aria-hidden
                            />
                          </button>
                        ) : !trash && item.wordlist ? (
                          <Link
                            aria-disabled={busy || searchPending}
                            onClick={(event) => {
                              if (busy || searchPending) event.preventDefault();
                            }}
                            title={item.name}
                            className="line-clamp-2 min-h-8 break-words rounded-lg py-1 text-sm font-medium leading-6 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
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
                          <span className="break-words text-sm font-medium">
                            {item.name}
                          </span>
                        )}
                        {item.wordlist_id && (
                          <p className="mt-1 break-words text-xs leading-5 text-foreground-muted">
                            {item.wordlist
                              ? `${space === "favorites" ? `${item.wordlist.name} · ${item.wordlist.owner_name} · ` : ""}${item.wordlist.item_count} 个词条`
                              : "原词表不可用"}
                            {space === "owned" && item.wordlist && (
                              <span> · {STATE_LABEL[item.wordlist.state]}</span>
                            )}
                          </p>
                        )}
                        {(query || locateId) && (
                          <button
                            disabled={busy}
                            className="mt-1 block min-h-8 max-w-full break-words rounded text-left text-xs text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary"
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
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={busy}
                            className="size-11 shrink-0"
                            aria-label={`${item.name}的更多操作`}
                          >
                            <MoreHorizontal className="size-5" aria-hidden />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="min-w-44"
                          onCloseAutoFocus={(event) => {
                            const dialog =
                              document.querySelector<HTMLDialogElement>(
                                "dialog[open]"
                              );
                            if (dialog) {
                              event.preventDefault();
                              (
                                dialog.querySelector<HTMLElement>(
                                  "input:not(:disabled)"
                                ) ?? dialog
                              ).focus();
                            }
                          }}
                        >
                          {trash ? (
                            <>
                              <DropdownMenuItem
                                onSelect={() => treeAction("restore", item)}
                              >
                                <RotateCcw
                                  className="mr-2 size-4"
                                  aria-hidden
                                />
                                恢复
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-danger data-[highlighted]:bg-danger/10 data-[highlighted]:text-danger"
                                onSelect={() => treeAction("purge", item)}
                              >
                                <Trash2 className="mr-2 size-4" aria-hidden />
                                彻底删除
                              </DropdownMenuItem>
                            </>
                          ) : (
                            <>
                              {space === "owned" &&
                                item.wordlist_id &&
                                item.wordlist && (
                                  <>
                                    <DropdownMenuItem asChild>
                                      <Link
                                        href={workspaceHref(
                                          item.wordlist_id,
                                          "edit",
                                          item.parent_id
                                        )}
                                      >
                                        <FilePenLine
                                          className="mr-2 size-4"
                                          aria-hidden
                                        />
                                        编辑词表
                                      </Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                  </>
                                )}
                              <DropdownMenuItem
                                onSelect={() => treeAction("rename", item)}
                              >
                                <Pencil className="mr-2 size-4" aria-hidden />
                                {space === "favorites" && item.wordlist_id
                                  ? "备注名"
                                  : "重命名"}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() => treeAction("move", item)}
                              >
                                <FolderInput
                                  className="mr-2 size-4"
                                  aria-hidden
                                />
                                移动
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-danger data-[highlighted]:bg-danger/10 data-[highlighted]:text-danger"
                                onSelect={() => treeAction("trash", item)}
                              >
                                <Trash2 className="mr-2 size-4" aria-hidden />
                                移入回收站
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
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
          returnFocusRef={dialogOpener}
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
            <p
              id="library-form-error"
              role="alert"
              className="mb-4 rounded-2xl bg-danger/5 px-4 py-3 text-sm text-danger"
            >
              {error}
            </p>
          )}
          {(modal.kind === "create" || modal.kind === "rename") && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (
                  !result.data ||
                  !name.trim() ||
                  (modal.kind === "rename" && name.trim() === modal.item.name)
                )
                  return;
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
              <label
                className="mb-2 block px-4 text-sm font-medium"
                htmlFor="library-name"
              >
                名称
              </label>
              <Input
                id="library-name"
                ref={nameInput}
                disabled={busy}
                aria-describedby={
                  error ? "library-form-error" : "library-name-hint"
                }
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <p
                id="library-name-hint"
                className="mt-2 px-4 text-xs text-foreground-muted"
              >
                {modal.kind === "rename" &&
                space === "favorites" &&
                modal.item.wordlist_id
                  ? "备注名仅自己可见，不会修改原词表。"
                  : "最多 100 个字符。"}
              </p>
              <div className="mt-6 flex justify-end gap-2 border-t border-border/60 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setModal(null)}
                >
                  取消
                </Button>
                <Button
                  disabled={
                    busy ||
                    !name.trim() ||
                    (modal.kind === "rename" && name.trim() === modal.item.name)
                  }
                  type="submit"
                >
                  {busy && (
                    <LoaderCircle
                      className="size-4 animate-spin motion-reduce:animate-none"
                      aria-hidden
                    />
                  )}
                  {busy ? "保存中…" : "保存"}
                </Button>
              </div>
            </form>
          )}
          {(modal.kind === "move" || modal.kind === "restore") && (
            <>
              <p className="mb-3 text-sm text-foreground-muted">
                已选择 {modal.ids.length} 项，浏览文件夹后确认目标位置。
              </p>
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
                actionLabel={
                  modal.kind === "move" ? "移动到这里" : "恢复到这里"
                }
                pendingLabel={modal.kind === "move" ? "移动中…" : "恢复中…"}
                onCancel={() => setModal(null)}
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
              <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-border/60 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setModal(null)}
                >
                  取消
                </Button>
                <Button
                  variant="destructive"
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
                  {busy && (
                    <LoaderCircle
                      className="size-4 animate-spin motion-reduce:animate-none"
                      aria-hidden
                    />
                  )}
                  {busy
                    ? "删除中…"
                    : `确认${modal.input.action === "trash" ? "删除" : "彻底删除"}`}
                </Button>
              </div>
            </>
          )}
        </LibraryDialog>
      )}
    </div>
  );
}

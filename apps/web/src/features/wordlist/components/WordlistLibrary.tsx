"use client";
import { localText } from "@/i18n/catalog";
import { type WebNotice } from "@/i18n/catalog";
import { useWebText } from "@/i18n/client";
import { webWordlistLibrary as webWordlist } from "@/i18n/messages/wordlist/library";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  LoaderCircle,
  Plus,
  X,
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
import { PageHeader, PageNotice, Segmented } from "@/features/shell/Page";
import { wordListKeys } from "../hooks/useWordLists";
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
  const uiText = useWebText(webWordlist);
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
  const [error, setError] = useState<WebNotice>("");
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
      trash
    ],
    queryFn: ({ signal }) =>
      api.wordList.library.list(
        space,
        {
          parent_id: parent,
          wordlist_id: locateId,
          trash
        },
        { signal }
      ),
    refetchOnMount: "always"
  });
  const trashRoot = useQuery({
    queryKey: [
      ...wordListKeys.mine(userId),
      "library-tree",
      space,
      true,
      undefined,
      1
    ],
    queryFn: ({ signal }) =>
      api.wordList.library.list(space, { trash: true, page: 1 }, { signal }),
    enabled: trash
  });
  const current = useRef(location);
  useEffect(() => {
    if (current.current === location) return;
    current.current = location;
    setModal(null);
    setError("");
    setNotice("");
  }, [location]);
  function go(folder?: string, targetTrash = trash, targetSpace = space) {
    if (working.current) return;
    setModal(null);
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
      }
      setNotice(message);
      await client.invalidateQueries({ queryKey: wordListKeys.all });
    } catch (e) {
      if (!alive()) return;
      const detail =
        e instanceof Error ? e.message.trim().replace(/[。.!！]+$/u, "") : "";
      setError(
        detail
          ? localText("操作未完成：{{v0}}。", { v0: detail })
          : "操作未完成，请稍后重试。"
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
      style={{ marginLeft: "calc(0px - min(50vw - 1.5rem, 780px))" }}
      onPointerDownCapture={(event) => rememberOpener(event.target)}
      onFocusCapture={(event) => rememberOpener(event.target)}
      className="relative left-1/2 w-[calc(100vw-3rem)] max-w-[1560px] py-6 sm:py-8"
    >
      {!locateId && mode !== "new" && (
        <PageHeader
          eyebrow={uiText("我的学习")}
          title={uiText("我的词表")}
          actions={
            <Button asChild variant="ghost" size="compact">
              <Link href="/wordlists">{uiText("浏览公开词表")}</Link>
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
                  {uiText("词表目录")}
                </h2>
              </div>
              <div data-leaves-page className="px-3 pb-4">
                <Segmented
                  label={uiText("我的词表分类")}
                  value={space}
                  options={[
                    { value: "owned", label: uiText("创建") },
                    { value: "favorites", label: uiText("收藏") }
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
                    if (!locateId && mode !== "new") go(id);
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
                  {trash ? uiText("返回词表") : uiText("回收站")}
                </button>
                {trash && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-1 min-h-11 w-full justify-start px-3 text-foreground-muted"
                    disabled={
                      busy || !result.data || !trashRoot.data?.pagination.total
                    }
                    onClick={() => void confirm("purge", [], true)}
                  >
                    <Trash2 className="size-4 shrink-0" aria-hidden />
                    {uiText("清空回收站")}
                  </Button>
                )}
              </div>
              <div
                role="separator"
                aria-label={uiText("调整目录宽度")}
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
          aria-label={uiText("内容区域")}
          className="min-w-0 p-4 sm:p-6 lg:p-8"
          aria-busy={busy || result.isFetching}
        >
          {error && !modal && (
            <PageNotice tone="error">{uiText(error)}</PageNotice>
          )}
          {notice && (
            <div
              role="status"
              className="mb-4 flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/70 py-2 pl-4 pr-1 text-sm"
            >
              <CheckCircle2
                className="size-5 shrink-0 text-success"
                aria-hidden
              />
              <span className="min-w-0 flex-1">{uiText(notice)}</span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={uiText("关闭操作提示")}
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
                    {mode === "new"
                      ? uiText("新建词表")
                      : (activeItem?.name ?? uiText("词表"))}
                  </span>
                  {mode === "edit" && (
                    <span className="shrink-0 whitespace-nowrap text-xs text-foreground-muted">
                      {uiText("编辑")}
                    </span>
                  )}
                </span>
                <Button
                  data-leaves-page
                  variant="ghost"
                  size="sm"
                  onClick={() => go(currentFolder ?? undefined)}
                >
                  {uiText("关闭词表")}
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
                <PageNotice>{uiText("正在读取词表…")}</PageNotice>
              ) : !activeItem ? (
                <PageNotice tone="error">
                  {uiText("词表不存在或已移入回收站，请在左侧重新选择。")}
                </PageNotice>
              ) : trash ? (
                <PageNotice>
                  {uiText("此词表在回收站中，恢复后可以打开。")}
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
                    {uiText("恢复词表")}
                  </Button>
                </PageNotice>
              ) : !activeItem.wordlist ? (
                <PageNotice>
                  {uiText("原词表暂不可用，收藏位置和个人备注仍然保留。")}
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
            <div className="flex min-h-80 flex-col items-center justify-center px-6 py-12 text-center">
              <BookOpen
                className="mb-4 size-8 text-foreground-muted"
                aria-hidden
              />
              <h2 className="text-lg font-semibold">
                {uiText("从左侧选择词表")}
              </h2>
              <p className="mt-2 text-sm leading-6 text-foreground-muted">
                {trash
                  ? uiText("恢复词表后即可查看内容。")
                  : space === "favorites"
                    ? uiText("打开词表后，在这里查看词条内容。")
                    : uiText("打开词表后，在这里查看和编辑词条内容。")}
              </p>
              {!trash && space === "owned" && (
                <Button asChild className="mt-6" size="sm">
                  <Link href={workspaceHref(undefined, "new")}>
                    <Plus className="size-4" aria-hidden />
                    {uiText("创建词表")}
                  </Link>
                </Button>
              )}
            </div>
          )}
        </section>
      </div>
      {modal && (
        <LibraryDialog
          returnFocusRef={dialogOpener}
          busy={busy}
          title={
            modal.kind === "create"
              ? uiText("新建文件夹")
              : modal.kind === "rename"
                ? uiText("修改名称")
                : modal.kind === "move"
                  ? uiText("移动到")
                  : modal.kind === "restore"
                    ? uiText("恢复到")
                    : modal.input.action === "trash"
                      ? uiText("移入回收站")
                      : uiText("彻底删除")
          }
          onClose={() => setModal(null)}
        >
          {error && (
            <p
              id="library-form-error"
              role="alert"
              className="mb-4 rounded-2xl bg-danger/5 px-4 py-3 text-sm text-danger"
            >
              {uiText(error)}
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
                {uiText("名称")}
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
                  ? uiText("备注名仅自己可见，不会修改原词表。")
                  : uiText("最多 100 个字符。")}
              </p>
              <div className="mt-6 flex justify-end gap-2 border-t border-border/60 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setModal(null)}
                >
                  {uiText("取消")}
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
                  {busy ? uiText("保存中…") : uiText("保存")}
                </Button>
              </div>
            </form>
          )}
          {(modal.kind === "move" || modal.kind === "restore") && (
            <>
              <p className="mb-3 text-sm text-foreground-muted">
                {uiText("已选择 {{v0}} 项，浏览文件夹后确认目标位置。", {
                  v0: modal.ids.length
                })}
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
                  {uiText("恢复到原位置")}
                </Button>
              )}
              <LibraryFolderPicker
                actionLabel={
                  modal.kind === "move"
                    ? uiText("移动到这里")
                    : uiText("恢复到这里")
                }
                pendingLabel={
                  modal.kind === "move" ? uiText("移动中…") : uiText("恢复中…")
                }
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
                {uiText(
                  modal.input.action === "trash"
                    ? "将移入回收站 {{v0}} 个文件夹和 {{v1}} 份词表。"
                    : "将彻底删除 {{v0}} 个文件夹和 {{v1}} 份词表。",
                  {
                    v0: modal.impact.folder_count,
                    v1: modal.impact.wordlist_count
                  }
                )}
              </p>
              <p className="mb-5 text-sm text-foreground-muted">
                {modal.input.action === "purge"
                  ? uiText("此操作不可恢复。")
                  : space === "owned"
                    ? uiText("公开词表将停止公开，恢复后为私密状态。")
                    : uiText("只移除你的收藏，不影响原作者词表。")}
              </p>
              <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-border/60 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setModal(null)}
                >
                  {uiText("取消")}
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
                    ? uiText("删除中…")
                    : uiText("确认{{v0}}", {
                        v0: uiText(
                          modal.input.action === "trash" ? "删除" : "彻底删除"
                        )
                      })}
                </Button>
              </div>
            </>
          )}
        </LibraryDialog>
      )}
    </div>
  );
}

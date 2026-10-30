"use client";
import { LIBRARY_DRAG_TYPE, libraryDragIds } from "../library-drag";
import { useState, type DragEvent, type KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  FileText,
  FolderPlus,
  ListCollapse,
  MoreHorizontal,
  RefreshCw
} from "lucide-react";
import type { LibraryItem, LibrarySpace } from "@tsz/types";
import { api } from "@/lib/request";
import { wordListKeys } from "../hooks/useWordLists";
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator
} from "@tsz/ui/components";

export type LibraryTreeAction =
  "rename" | "move" | "trash" | "restore" | "purge";
type Props = {
  userId: string;
  space: LibrarySpace;
  trash: boolean;
  selectedFolder?: string;
  selectedWordlist?: string;
  ancestorIds: string[];
  disabled: boolean;
  onFolder: (id?: string) => void;
  onWordlist: (item: LibraryItem) => void;
  onMove: (ids: string[], target: string | null) => void;
  onCreateFolder: (parent?: string) => void;
  onCreateWordlist: (parent?: string) => void;
  onAction: (action: LibraryTreeAction, item: LibraryItem) => void;
  onRefresh: () => void;
};
type TreeProps = Props & {
  expanded: Set<string>;
  toggle: (id: string, open?: boolean) => void;
};
const iconButton =
  "inline-flex size-10 shrink-0 items-center justify-center rounded-xl lg:size-7 lg:rounded-lg text-foreground-muted hover:bg-foreground/10 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-40";
export function LibraryTree(props: Props) {
  const [expansion, setExpansion] = useState(() => new Map<string, boolean>());
  const [rootDragOver, setRootDragOver] = useState(false);
  function dragOverRoot(event: DragEvent<HTMLElement>) {
    if (
      props.trash ||
      props.disabled ||
      !Array.from(event.dataTransfer.types).includes(LIBRARY_DRAG_TYPE)
    )
      return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setRootDragOver(true);
  }
  function leaveRoot(event: DragEvent<HTMLElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null))
      setRootDragOver(false);
  }
  function dropAtRoot(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setRootDragOver(false);
    if (props.trash || props.disabled) return;
    const ids = libraryDragIds(event.dataTransfer, props.space);
    if (ids.length) props.onMove(ids, null);
  }
  const expanded = new Set([
    ...props.ancestorIds.filter((id) => expansion.get(id) !== false),
    ...[...expansion].filter(([, open]) => open).map(([id]) => id)
  ]);
  const toggle = (id: string, open?: boolean) =>
    setExpansion((previous) =>
      new Map(previous).set(id, open ?? !expanded.has(id))
    );
  function navigate(event: KeyboardEvent<HTMLElement>) {
    if (
      !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) ||
      !(event.target instanceof HTMLElement) ||
      !event.target.matches("[data-explorer-item]")
    )
      return;
    const rows = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
        "[data-explorer-item]"
      )
    ];
    const index = rows.indexOf(event.target as HTMLButtonElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? rows.length - 1
          : Math.max(
              0,
              Math.min(
                rows.length - 1,
                index + (event.key === "ArrowDown" ? 1 : -1)
              )
            );
    event.preventDefault();
    rows[next]?.focus();
  }
  return (
    <nav
      aria-label="工程目录"
      className="flex min-h-full min-w-0 flex-col"
      onKeyDown={navigate}
      onDragEnd={() => setRootDragOver(false)}
    >
      <div className="flex min-h-11 shrink-0 items-center border-y border-border/60 bg-muted/60 pl-2 pr-1">
        <button
          data-leaves-page
          data-explorer-item
          disabled={props.disabled}
          onClick={() => props.onFolder()}
          onDragOver={dragOverRoot}
          onDragLeave={leaveRoot}
          onDrop={dropAtRoot}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left text-xs font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
        >
          <ChevronDown className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            {props.trash ? "回收站" : props.space === "owned" ? "创建" : "收藏"}
          </span>
        </button>
        {!props.trash && (
          <button
            className={iconButton}
            aria-label="在当前目录新建文件夹"
            title="新建文件夹"
            disabled={props.disabled}
            onClick={() => props.onCreateFolder(props.selectedFolder)}
          >
            <FolderPlus className="size-3.5" aria-hidden />
          </button>
        )}
        <button
          className={iconButton}
          aria-label="刷新目录"
          title="刷新目录"
          disabled={props.disabled}
          onClick={props.onRefresh}
        >
          <RefreshCw className="size-3.5" aria-hidden />
        </button>
        <button
          className={iconButton}
          aria-label="全部折叠"
          title="全部折叠"
          onClick={() =>
            setExpansion(new Map([...expanded].map((id) => [id, false])))
          }
        >
          <ListCollapse className="size-3.5" aria-hidden />
        </button>
      </div>
      <div className="shrink-0 overflow-x-auto py-1">
        <TreeLevel {...props} expanded={expanded} toggle={toggle} depth={0} />
      </div>
      <div
        role="region"
        aria-label="根目录放置区域"
        onDragOver={dragOverRoot}
        onDragLeave={leaveRoot}
        onDrop={dropAtRoot}
        className={`min-h-32 flex-1 px-3 py-4 text-center text-xs ${rootDragOver ? "bg-primary-muted text-primary outline-2 -outline-offset-2 outline-primary" : ""}`}
      >
        {rootDragOver && "松开以移到根目录"}
      </div>
    </nav>
  );
}
function TreeLevel(props: TreeProps & { parent?: string; depth: number }) {
  const [page, setPage] = useState(1);
  const result = useQuery({
    queryKey: [
      ...wordListKeys.mine(props.userId),
      "library-tree",
      props.space,
      props.trash,
      props.parent,
      page
    ],
    queryFn: ({ signal }) =>
      api.wordList.library.list(
        props.space,
        { parent_id: props.parent, trash: props.trash, page },
        { signal }
      )
  });
  if (result.isError)
    return (
      <Button size="sm" variant="ghost" onClick={() => void result.refetch()}>
        重试目录
      </Button>
    );
  if (!result.data)
    return <p className="px-6 py-2 text-xs text-foreground-subtle">加载中…</p>;
  return (
    <ul className={props.depth ? "ml-3 border-l border-border/70" : ""}>
      {result.data.items.map((item) => (
        <TreeItem key={item.id} {...props} item={item} />
      ))}
      {!result.data.items.length && (
        <li className="px-6 py-2 text-xs text-foreground-subtle">空文件夹</li>
      )}
      {result.data.pagination.total_pages > 1 && (
        <li className="flex items-center justify-between px-2 py-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            上一页
          </Button>
          <span className="text-xs">
            {page}/{result.data.pagination.total_pages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={page === result.data.pagination.total_pages}
            onClick={() => setPage(page + 1)}
          >
            下一页
          </Button>
        </li>
      )}
    </ul>
  );
}
function TreeItem(props: TreeProps & { item: LibraryItem; depth: number }) {
  const { item } = props;
  const folder = !item.wordlist_id;
  const open = props.expanded.has(item.id);
  const selected = folder
    ? !props.selectedWordlist && props.selectedFolder === item.id
    : props.selectedWordlist === item.wordlist_id;
  const [menuOpen, setMenuOpen] = useState(false);
  const action = (kind: LibraryTreeAction) => props.onAction(kind, item);
  return (
    <li>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <div
          className={`group relative flex min-h-11 items-center border-l-2 pr-1 lg:min-h-9 ${selected ? "border-primary bg-primary/12 text-foreground" : "border-transparent hover:bg-foreground/5"} ${menuOpen ? "bg-foreground/5" : ""}`}
          onContextMenu={(event) => {
            event.preventDefault();
            if (!props.disabled) setMenuOpen(true);
          }}
          draggable={!props.trash && !props.disabled}
          onDragStart={(event) =>
            event.dataTransfer.setData(
              LIBRARY_DRAG_TYPE,
              JSON.stringify({ space: props.space, ids: [item.id] })
            )
          }
          onDragOver={(event) => {
            if (folder && !props.trash) event.preventDefault();
          }}
          onDrop={(event) => {
            if (!folder || props.trash) return;
            event.preventDefault();
            const ids = libraryDragIds(event.dataTransfer, props.space);
            if (ids.length) props.onMove(ids, item.id);
          }}
        >
          {folder ? (
            <button
              tabIndex={-1}
              aria-label={`${open ? "收起" : "展开"} ${item.name}`}
              aria-expanded={open}
              className="flex size-11 shrink-0 items-center justify-center rounded-lg text-foreground-muted focus-visible:outline-2 focus-visible:outline-primary lg:size-7"
              onClick={() => props.toggle(item.id)}
            >
              {open ? (
                <ChevronDown className="size-3.5" />
              ) : (
                <ChevronRight className="size-3.5" />
              )}
            </button>
          ) : (
            <span className="w-11 shrink-0 lg:w-7" />
          )}
          <button
            data-leaves-page
            data-explorer-item
            aria-current={selected ? "page" : undefined}
            title={item.name}
            disabled={props.disabled}
            className="flex min-w-0 flex-1 items-center gap-1.5 self-stretch text-left text-[13px] leading-7 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
            onClick={() => {
              if (folder) {
                props.toggle(item.id);
                props.onFolder(item.id);
              } else props.onWordlist(item);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" && folder) {
                event.preventDefault();
                props.toggle(item.id, true);
              }
              if (event.key === "ArrowLeft") {
                event.preventDefault();
                if (folder && open) props.toggle(item.id, false);
                else
                  event.currentTarget
                    .closest("ul")
                    ?.closest("li")
                    ?.querySelector<HTMLButtonElement>("[data-explorer-item]")
                    ?.focus();
              }
            }}
          >
            {folder ? (
              open ? (
                <FolderOpen
                  className="size-4 shrink-0 text-primary"
                  aria-hidden
                />
              ) : (
                <Folder className="size-4 shrink-0 text-primary" aria-hidden />
              )
            ) : (
              <FileText className="size-4 shrink-0 text-primary" aria-hidden />
            )}
            <span className="truncate">{item.name}</span>
          </button>
          <DropdownMenuTrigger asChild>
            <button
              data-explorer-menu
              className={`${iconButton} size-11 lg:size-7 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 data-[state=open]:opacity-100`}
              aria-label={`${item.name}的操作`}
              disabled={props.disabled}
            >
              <MoreHorizontal className="size-3.5" aria-hidden />
            </button>
          </DropdownMenuTrigger>
        </div>
        <DropdownMenuContent
          onCloseAutoFocus={(event) => {
            const dialog =
              document.querySelector<HTMLDialogElement>("dialog[open]");
            if (dialog) {
              event.preventDefault();
              (
                dialog.querySelector<HTMLElement>("input:not(:disabled)") ??
                dialog
              ).focus();
            }
          }}
          data-explorer-popup
          align="end"
          className="min-w-44"
          sideOffset={2}
        >
          {!props.trash && folder && (
            <>
              {props.space === "owned" && (
                <DropdownMenuItem
                  data-leaves-page
                  onSelect={() => props.onCreateWordlist(item.id)}
                >
                  新建词表
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => props.onCreateFolder(item.id)}>
                新建子文件夹
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {props.trash ? (
            <>
              <DropdownMenuItem onSelect={() => action("restore")}>
                恢复…
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => action("purge")}
                className="text-danger"
              >
                彻底删除…
              </DropdownMenuItem>
            </>
          ) : (
            <>
              <DropdownMenuItem
                data-leaves-page
                onSelect={() => action("rename")}
              >
                {props.space === "favorites" && !folder
                  ? "修改备注名…"
                  : "重命名…"}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => action("move")}>
                移动到…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                data-leaves-page
                onSelect={() => action("trash")}
                className="text-danger"
              >
                移入回收站
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {folder && open && (
        <TreeLevel {...props} parent={item.id} depth={props.depth + 1} />
      )}
    </li>
  );
}

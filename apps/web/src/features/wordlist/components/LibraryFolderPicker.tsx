"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Folder, FolderInput, LoaderCircle } from "lucide-react";
import { Button } from "@tsz/ui/components";
import type { LibrarySpace } from "@tsz/types";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";
import { PageNotice, Pager } from "@/features/shell/Page";
import { wordListKeys } from "../hooks/useWordLists";

export function LibraryFolderPicker({
  space,
  busy,
  exclude = [],
  actionLabel = "选择当前文件夹",
  pendingLabel = "处理中…",
  onCancel,
  onPick
}: {
  space: LibrarySpace;
  busy: boolean;
  exclude?: string[];
  actionLabel?: string;
  pendingLabel?: string;
  onCancel?: () => void;
  onPick: (id: string | null) => void;
}) {
  const userId = useUserStore((s) => s.user?.id);
  const [parent, setParent] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const result = useQuery({
    queryKey: [
      ...wordListKeys.mine(userId),
      "library-picker",
      space,
      parent,
      page
    ],
    enabled: !!userId,
    queryFn: ({ signal }) =>
      api.wordList.library.list(space, { parent_id: parent, page }, { signal })
  });
  const go = (id?: string) => {
    if (busy) return;
    setParent(id);
    setPage(1);
  };
  const currentName = result.data?.ancestors.at(-1)?.name ?? "根目录";
  return (
    <div className="space-y-4" aria-busy={busy || result.isFetching}>
      <nav
        aria-label="目标文件夹路径"
        className="-ml-2 flex flex-wrap items-center gap-1 text-sm"
      >
        <button
          type="button"
          disabled={busy}
          onClick={() => go()}
          aria-current={!parent ? "location" : undefined}
          className="min-h-11 rounded-lg px-2 text-foreground-muted hover:bg-muted hover:text-primary focus-visible:outline-2 focus-visible:outline-primary aria-[current=location]:text-foreground disabled:opacity-50"
        >
          根目录
        </button>
        {result.data?.ancestors.map((crumb) => (
          <span key={crumb.id} className="flex min-w-0 items-center gap-1">
            <ChevronRight
              className="size-3.5 shrink-0 text-foreground-subtle"
              aria-hidden
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => go(crumb.id)}
              aria-current={parent === crumb.id ? "location" : undefined}
              className="min-h-11 min-w-0 break-words rounded-lg px-2 text-left text-foreground-muted hover:bg-muted hover:text-primary focus-visible:outline-2 focus-visible:outline-primary aria-[current=location]:text-foreground disabled:opacity-50"
            >
              {crumb.name}
            </button>
          </span>
        ))}
      </nav>
      {result.isError ? (
        <PageNotice tone="error">
          目录加载失败。
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => void result.refetch()}
          >
            重试
          </Button>
        </PageNotice>
      ) : result.isPending ? (
        <PageNotice>正在加载文件夹…</PageNotice>
      ) : (
        <>
          <ul
            aria-label="目标文件夹"
            className="max-h-64 space-y-1 overflow-y-auto rounded-2xl border border-border/60 p-1"
          >
            {result.data.items
              .filter((item) => !item.wordlist_id)
              .map((item) => {
                const excluded = exclude.includes(item.id);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      disabled={busy || excluded}
                      onClick={() => go(item.id)}
                      title={excluded ? "不能移入自身或子文件夹" : undefined}
                      className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-primary-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Folder
                        className="size-5 shrink-0 text-primary"
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 break-words">
                        {item.name}
                      </span>
                      <ChevronRight
                        className="size-4 shrink-0 text-foreground-subtle"
                        aria-hidden
                      />
                    </button>
                  </li>
                );
              })}
            {!result.data.items.some((item) => !item.wordlist_id) && (
              <li className="px-4 py-8 text-center text-sm text-foreground-muted">
                此页没有子文件夹，可以使用当前位置。
              </li>
            )}
          </ul>
          <Pager
            page={page}
            total={result.data.pagination.total_pages}
            disabled={busy || result.isFetching}
            onChange={setPage}
          />
          <div className="flex items-start gap-3 rounded-2xl bg-muted/70 px-4 py-3 text-sm">
            <FolderInput
              className="mt-0.5 size-5 shrink-0 text-foreground-muted"
              aria-hidden
            />
            <div className="min-w-0">
              <p className="text-xs text-foreground-muted">目标位置</p>
              <p className="mt-1 break-words font-medium">
                {space === "owned" ? "创建" : "收藏"} / {currentName}
              </p>
            </div>
          </div>
        </>
      )}
      <div className="flex flex-wrap justify-end gap-2 border-t border-border/60 pt-4">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onCancel}
          >
            取消
          </Button>
        )}
        <Button
          type="button"
          disabled={busy || !result.data || result.isFetching || result.isError}
          onClick={() => onPick(parent ?? null)}
        >
          {busy && (
            <LoaderCircle
              className="size-4 animate-spin motion-reduce:animate-none"
              aria-hidden
            />
          )}
          {busy ? pendingLabel : actionLabel}
        </Button>
      </div>
    </div>
  );
}

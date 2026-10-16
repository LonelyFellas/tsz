"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Folder } from "lucide-react";
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
  onPick
}: {
  space: LibrarySpace;
  busy: boolean;
  exclude?: string[];
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
    setParent(id);
    setPage(1);
  };
  return (
    <div className="space-y-4">
      <nav aria-label="目标文件夹路径" className="flex flex-wrap gap-2 text-sm">
        <button disabled={busy} onClick={() => go()} className="text-primary">
          根目录
        </button>
        {result.data?.ancestors.map((p) => (
          <button
            disabled={busy}
            key={p.id}
            onClick={() => go(p.id)}
            className="text-primary"
          >
            / {p.name}
          </button>
        ))}
      </nav>
      {result.isError ? (
        <PageNotice tone="error">
          目录加载失败。
          <Button variant="ghost" onClick={() => void result.refetch()}>
            重试
          </Button>
        </PageNotice>
      ) : result.isPending ? (
        <PageNotice>正在加载文件夹…</PageNotice>
      ) : (
        <>
          <ul className="max-h-64 space-y-2 overflow-y-auto">
            {result.data.items
              .filter((i) => !i.wordlist_id)
              .map((i) => (
                <li key={i.id}>
                  <button
                    disabled={busy || exclude.includes(i.id)}
                    onClick={() => go(i.id)}
                    className="flex w-full items-center gap-3 rounded-2xl bg-muted p-3 text-left disabled:opacity-50"
                  >
                    <Folder className="size-5 text-primary" aria-hidden />
                    {i.name}
                  </button>
                </li>
              ))}
          </ul>
          {!result.data.items.some((i) => !i.wordlist_id) && (
            <p className="text-sm text-foreground-muted">此页没有子文件夹。</p>
          )}
          <Pager
            page={page}
            total={result.data.pagination.total_pages}
            onChange={setPage}
          />
          <Button
            disabled={busy || result.isFetching}
            onClick={() => onPick(parent ?? null)}
          >
            选择当前文件夹
          </Button>
        </>
      )}
    </div>
  );
}

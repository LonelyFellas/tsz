"use client";

import { Button, Card } from "@tsz/ui";
import Link from "next/link";
import { useWordLists } from "../hooks/useWordLists";

// 词表浏览 —— 师生共用。数据走 TanStack Query。
// 是否能发布公开、能否建任务等差异交给各操作内部的权限判断。
export function WordListBrowser() {
  const { data: lists, isPending, isError, error } = useWordLists();

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">词表</h1>
        <Link href="/wordlists/new">
          <Button>创建词表</Button>
        </Link>
      </div>

      {isPending ? (
        <p className="text-gray-500">加载中…</p>
      ) : isError ? (
        <p className="text-red-500">加载失败:{(error as Error).message}</p>
      ) : lists.length === 0 ? (
        <p className="text-gray-500">暂无词表。</p>
      ) : (
        <ul className="grid gap-3">
          {lists.map((l) => (
            <li key={l.id}>
              <Link href={`/wordlists/${l.id}`}>
                <Card className="transition-colors hover:border-blue-300">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{l.name}</span>
                    <span className="text-xs text-gray-400">
                      {l.visibility === "public" ? "公开" : "私密"}
                      {l.reviewStatus === "pending" && " · 审核中"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-400">
                    {l.wordIds.length + l.customWords.length} 个词
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

"use client";
import Link from "next/link";
import { useState } from "react";
import { useWordLists } from "../hooks/useWordLists";
import { STATE_LABEL, buttonClass } from "../reading";
export function WordListBrowser({ mine = false }: { mine?: boolean }) {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const result = useWordLists(mine, page, q);
  return (
    <div className="animate-in mx-auto max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">
          {mine ? "我的词表" : "公开词表"}
        </h1>
        <div className="flex gap-3">
          <Link
            className={buttonClass}
            href={mine ? "/wordlists" : "/account/wordlists"}
          >
            {mine ? "浏览公开词表" : "我的词表"}
          </Link>
          <Link className={buttonClass} href="/wordlists/new">
            创建词表
          </Link>
        </div>
      </div>
      <input
        className="my-6 w-full rounded-full border border-border bg-surface px-5 py-3"
        aria-label="搜索词表"
        placeholder="搜索词表名称"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setPage(1);
        }}
      />
      {result.isError ? (
        <p role="alert">
          词表加载失败，请
          <button onClick={() => void result.refetch()}>重试</button>。
        </p>
      ) : result.isPending ? (
        <p>正在加载词表…</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {result.data.items.map((list) => (
              <Link
                key={list.id}
                href={`${mine ? "/account" : ""}/wordlists/${list.id}`}
                className="rounded-3xl border border-border bg-surface p-6 transition hover:border-primary"
              >
                <h2 className="text-xl font-semibold">{list.name}</h2>
                <p className="mt-3 text-sm text-foreground-muted">
                  {list.owner_name} · {list.item_count} 个词条 ·{" "}
                  {STATE_LABEL[list.state]}
                </p>
              </Link>
            ))}
          </div>
          {result.data.items.length === 0 && <p>暂无词表</p>}
          <div className="mt-6 flex items-center gap-4">
            <button
              className={buttonClass}
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              上一页
            </button>
            <span>第 {page} 页</span>
            <button
              className={buttonClass}
              disabled={page >= result.data.pagination.total_pages}
              onClick={() => setPage(page + 1)}
            >
              下一页
            </button>
          </div>
        </>
      )}
    </div>
  );
}

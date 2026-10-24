"use client";
import Link from "next/link";
import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { useWordlistInteractions } from "../hooks/useWordlistInteractions";
import { WordlistInteractions } from "./WordlistInteractions";
import { WordlistFavorites } from "./WordlistFavorites";
import { useWordLists } from "../hooks/useWordLists";
import { cn } from "@tsz/ui/lib/cn";
import { STATE_LABEL, buttonClass, primaryButtonClass } from "../reading";
import {
  PageHeader,
  PageNotice,
  PageShell,
  Pager,
  Segmented,
  listCardClass
} from "@/features/shell/Page";
export function WordListBrowser({ mine = false }: { mine?: boolean }) {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [recommended, setRecommended] = useState(false);
  const [favorites, setFavorites] = useState(false);
  const result = useWordLists(mine, page, q, recommended, !favorites);
  const interactions = useWordlistInteractions(
    !mine ? (result.data?.items.map((w) => w.id) ?? []) : []
  );
  return (
    <PageShell size="lg">
      <PageHeader
        eyebrow={mine ? "我的学习" : "词库广场"}
        title={mine ? "我的词表" : "公开词表"}
        description={
          mine
            ? "管理自己创建和收藏的词表。收藏引用原词表，内容随作者更新。"
            : "浏览平台精选和其他用户公开的词表，挑一份开始学习。"
        }
        actions={
          <>
            <Link
              className={buttonClass}
              href={mine ? "/wordlists" : "/account/wordlists"}
            >
              {mine ? "浏览公开词表" : "我的词表"}
            </Link>
            <Link
              className={cn(primaryButtonClass, "min-h-10 px-5")}
              href="/wordlists/new"
            >
              <Plus className="size-4" strokeWidth={2} aria-hidden />
              创建词表
            </Link>
          </>
        }
      />
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center">
        {mine && (
          <Segmented
            label="我的词表分类"
            value={favorites}
            options={[
              { value: false, label: "创建" },
              { value: true, label: "收藏" }
            ]}
            onChange={(value) => {
              setFavorites(value);
              setPage(1);
            }}
          />
        )}
        {!mine && (
          <Segmented
            label="词表分类"
            value={recommended}
            options={[
              { value: false, label: "全部公开词表" },
              { value: true, label: "系统推荐" }
            ]}
            onChange={(value) => {
              setRecommended(value);
              setPage(1);
            }}
          />
        )}
        <label className="glass relative flex min-h-11 flex-1 items-center rounded-full pl-11 pr-5 transition-shadow focus-within:ring-4 focus-within:ring-primary/15">
          <Search
            className="absolute left-4 size-4 text-foreground-subtle"
            strokeWidth={1.8}
            aria-hidden
          />
          <input
            className="w-full bg-transparent py-2.5 text-sm text-foreground outline-hidden placeholder:text-foreground-subtle"
            aria-label="搜索词表"
            placeholder="搜索词表名称"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </label>
      </div>
      {favorites ? (
        <WordlistFavorites page={page} q={q} onPageChange={setPage} />
      ) : result.isError ? (
        <PageNotice tone="error">
          词表加载失败，请
          <button
            className="mx-1 font-medium text-primary underline-offset-4 hover:underline"
            onClick={() => void result.refetch()}
          >
            重试
          </button>
          。
        </PageNotice>
      ) : result.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2" aria-busy>
          <p className="sr-only">正在加载词表…</p>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="glass h-[132px] animate-pulse rounded-3xl"
            />
          ))}
        </div>
      ) : (
        <>
          {result.data.items.length === 0 ? (
            <PageNotice>
              {q ? `没有找到包含「${q}」的词表` : "暂无词表"}
            </PageNotice>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {result.data.items.map((list) => (
                <li key={list.id}>
                  <div className={cn(listCardClass, "group h-full")}>
                    <Link
                      href={`${mine ? "/account" : ""}/wordlists/${list.id}`}
                      className="block rounded-xl focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <h2 className="text-lg font-bold tracking-tight text-foreground transition-colors group-hover:text-primary">
                          {list.name}
                        </h2>
                        <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs text-foreground-muted">
                          {STATE_LABEL[list.state]}
                        </span>
                      </div>
                      <p className="mt-6 flex items-baseline gap-1.5">
                        <span className="text-3xl font-bold tabular-nums tracking-tight text-foreground">
                          {list.item_count}
                        </span>
                        <span className="text-sm text-foreground-muted">
                          个词条
                        </span>
                      </p>
                      <p className="mt-2 truncate text-sm text-foreground-muted">
                        {list.owner_user_id === null
                          ? `平台 · ${list.owner_name}`
                          : list.owner_name}
                      </p>
                    </Link>
                    {!mine && (
                      <WordlistInteractions
                        list={list}
                        stats={interactions.stats.data?.items.find(
                          (s) => s.wordlist_id === list.id
                        )}
                        state={interactions.states.data?.items.find(
                          (s) => s.wordlist_id === list.id
                        )}
                        tipState={interactions.tips.data?.items.find(
                          (s) => s.wordlist_id === list.id
                        )}
                        tipFailed={interactions.tips.isError}
                        failed={
                          interactions.stats.isError ||
                          (!!interactions.userId && interactions.states.isError)
                        }
                        onRetry={() => {
                          void interactions.stats.refetch();
                          if (interactions.userId) {
                            void interactions.states.refetch();
                            void interactions.tips.refetch();
                          }
                        }}
                      />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Pager
            page={page}
            total={result.data.pagination.total_pages}
            onChange={setPage}
          />
        </>
      )}
    </PageShell>
  );
}

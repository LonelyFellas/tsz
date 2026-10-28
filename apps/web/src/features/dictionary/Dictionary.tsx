"use client";
import { selectTexts } from "@/features/wordlist/reading";
import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { Button } from "@tsz/ui/components";
import { cn } from "@tsz/ui/lib/cn";
import { SearchField } from "@/features/shell/SearchField";
import type { CEFRLevel, DictionaryEntry, EnglishVariant } from "@tsz/types";
import { useUserStore } from "@/stores/user";
import { api } from "@/lib/request";
import {
  addHistory,
  normalizeTerm,
  readHistory,
  historySnapshot,
  parseHistory,
  subscribeHistory,
  writeHistory
} from "./history";
import { dictionaryDefinition, dictionarySpellings, POS_ABBR } from "./reading";
import { TargetAudio, Texts } from "./Content";

export function Dictionary({
  query = "",
  page = 1
}: {
  query?: string;
  page?: number;
}) {
  const userId = useUserStore((s) => s.user?.id);
  // The keyed body prevents one account's local history appearing for another.
  return (
    <DictionaryBody key={userId} userId={userId} query={query} page={page} />
  );
}
function DictionaryBody({
  userId,
  query,
  page
}: {
  userId?: string;
  query: string;
  page: number;
}) {
  const router = useRouter();
  const [input, setInput] = useState(query);
  const snapshot = useSyncExternalStore(
    subscribeHistory,
    () => historySnapshot(userId),
    () => "[]"
  );
  const history = parseHistory(snapshot);
  const [invalid, setInvalid] = useState(false);
  const profile = useQuery({
    queryKey: ["student-home", userId, "profile"],
    enabled: !!userId,
    queryFn: ({ signal }) => api.auth.me({ signal }),
    refetchOnMount: "always"
  });
  const results = useQuery({
    queryKey: ["dictionary", userId, "search", query, page],
    enabled: !!userId && !!query,
    queryFn: ({ signal }) => api.dictionary.search(query, page, { signal }),
    staleTime: 0
  });
  const level: CEFRLevel = profile.data?.learning_settings?.cefr_level ?? "C2";
  const variant = profile.data?.learning_settings?.english_variant ?? null;
  function search(term: string) {
    const q = normalizeTerm(term);
    if (!q || q.length > 100) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (userId) writeHistory(userId, addHistory(readHistory(userId), q));
    if (q === query && page === 1) {
      void results.refetch();
      return;
    }
    router.push(`/dictionary?${new URLSearchParams({ q })}`);
  }
  function remove(term: string) {
    const next = history.filter((t) => t !== term);
    if (userId) writeHistory(userId, next);
  }
  return (
    <div
      className={`animate-in px-6 pb-16 ${query ? "pt-8 sm:pt-12" : "flex min-h-[70vh] flex-col justify-center py-12"}`}
    >
      <div className={query ? "" : "mx-auto w-full max-w-2xl"}>
        <h1 className="mb-6 text-3xl font-semibold tracking-tight">词典</h1>
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            search(input);
          }}
          className="max-w-2xl"
        >
          <label
            htmlFor="dictionary-search"
            className="mb-2 block px-4 text-sm font-medium"
          >
            查找英文词条
          </label>
          <div className="flex gap-2">
            <SearchField
              id="dictionary-search"
              value={input}
              maxLength={100}
              onValueChange={(value) => {
                setInput(value);
                setInvalid(false);
              }}
              placeholder="输入词条关键词，快速查词"
              autoComplete="off"
              aria-invalid={invalid}
              aria-describedby={
                invalid ? "dictionary-search-message" : undefined
              }
              className="min-w-0 flex-1"
            />
            <Button type="submit" aria-label="查询">
              <Search className="size-5" aria-hidden />
              <span className="hidden sm:inline">查询</span>
            </Button>
          </div>
          {invalid && (
            <p
              id="dictionary-search-message"
              role="alert"
              className="mt-2 px-4 text-sm text-danger"
            >
              请输入 1–100 个字符的词条关键词
            </p>
          )}
        </form>
        {history.length > 0 && (
          <div
            aria-label="搜索历史"
            className="mt-4 flex max-w-full gap-2 overflow-x-auto pb-2"
          >
            {history.map((term) => (
              <div
                key={term}
                className="inline-flex shrink-0 items-center rounded-full border border-border bg-surface"
              >
                <button
                  type="button"
                  className="min-h-11 max-w-48 truncate rounded-l-full py-2 pl-4 pr-1 text-sm hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
                  onClick={() => search(term)}
                >
                  {term}
                </button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`删除历史 ${term}`}
                  onClick={() => remove(term)}
                >
                  <X className="size-4" aria-hidden />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
      {query && (
        <section
          aria-label="查询结果"
          aria-busy={results.isFetching}
          className="mt-8"
        >
          {(results.isPending || profile.isPending) && (
            <p role="status" className="text-sm text-foreground-muted">
              查询中…
            </p>
          )}
          {(results.isError || profile.isError) && (
            <div
              role="alert"
              className="rounded-2xl border border-border bg-surface p-6"
            >
              <p>查询暂时失败，请重试。</p>
              <Button
                type="button"
                variant="outline"
                className="mt-3"
                onClick={() => {
                  void results.refetch();
                  void profile.refetch();
                }}
              >
                重新查询
              </Button>
            </div>
          )}
          {results.isSuccess && profile.isSuccess && (
            <>
              <p role="status" className="mb-4 text-sm text-foreground-muted">
                {results.data.pagination.total
                  ? `找到 ${results.data.pagination.total} 条词条`
                  : `没有找到“${query}”，试试其他拼写或更短的关键词。`}
              </p>
              {results.data.items.length > 0 && (
                <div className="overflow-hidden rounded-3xl border border-border bg-surface">
                  <div
                    aria-hidden
                    className="hidden grid-cols-[1fr_1fr_3fr] gap-5 border-b border-border bg-muted px-6 py-4 text-sm font-medium md:grid"
                  >
                    <span>名称</span>
                    <span>其他拼写形式</span>
                    <div className="grid grid-cols-[3rem_1fr_1fr] gap-4">
                      <span>词性</span>
                      <span>多维释义</span>
                      <span>语法结构</span>
                    </div>
                  </div>
                  {results.data.items.map((item) => (
                    <Result
                      key={item.content.entry_id}
                      item={item}
                      level={level}
                      variant={variant}
                      query={query}
                      page={page}
                    />
                  ))}
                </div>
              )}
              {results.data.pagination.total_pages > 1 && (
                <nav
                  aria-label="结果分页"
                  className="mt-6 flex items-center justify-center gap-4"
                >
                  <Button asChild variant="outline" disabled={page <= 1}>
                    <Link
                      aria-disabled={page <= 1}
                      tabIndex={page <= 1 ? -1 : undefined}
                      className={
                        page <= 1 ? "pointer-events-none opacity-40" : ""
                      }
                      href={`/dictionary?${new URLSearchParams({ q: query, page: String(Math.max(1, page - 1)) })}`}
                    >
                      上一页
                    </Link>
                  </Button>
                  <span className="text-sm">
                    {page} / {results.data.pagination.total_pages}
                  </span>
                  <Button asChild variant="outline">
                    <Link
                      aria-disabled={
                        page >= results.data.pagination.total_pages
                      }
                      tabIndex={
                        page >= results.data.pagination.total_pages
                          ? -1
                          : undefined
                      }
                      className={
                        page >= results.data.pagination.total_pages
                          ? "pointer-events-none opacity-40"
                          : ""
                      }
                      href={`/dictionary?${new URLSearchParams({ q: query, page: String(page + 1) })}`}
                    >
                      下一页
                    </Link>
                  </Button>
                </nav>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
function Result({
  item,
  level,
  variant,
  query,
  page
}: {
  item: DictionaryEntry;
  level: CEFRLevel;
  variant: EnglishVariant | null;
  query: string;
  page: number;
}) {
  const entry = item.content;
  const spelling = dictionarySpellings(entry, variant);
  return (
    <article className="grid gap-4 border-b border-border p-6 last:border-b-0 md:grid-cols-[1fr_1fr_3fr] md:gap-5">
      <Link
        href={`/dictionary/${entry.entry_id}?${new URLSearchParams({ q: query, page: String(page) })}`}
        className="tsz-words break-words font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary"
      >
        {spelling.primary}
        <span className="sr-only">，查看词条详情</span>
      </Link>
      <p
        className={cn(
          "tsz-words break-words text-sm text-foreground-muted",
          !spelling.alternate && "hidden md:block"
        )}
      >
        {spelling.alternate || "—"}
      </p>
      <div className="space-y-4">
        {entry.pos.slice(0, 2).map((pos) => {
          const definition = dictionaryDefinition(
            pos.senses[0]?.definitions ?? [],
            level
          );
          const grammar = pos.grammar_structures.find(
            (g) => g.id === definition?.grammar_structure_id
          );
          return (
            <div
              key={pos.pos_id}
              className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm leading-6 md:grid-cols-[3rem_1fr_1fr] md:gap-4"
            >
              <p className="font-medium">
                {POS_ABBR[pos.pos] ?? pos.label ?? pos.pos}
              </p>
              <div className="flex flex-wrap items-start gap-x-2 gap-y-1 md:block">
                {definition ? (
                  <>
                    <span className="mb-1 inline-block rounded-full bg-primary-muted px-2 text-xs text-primary">
                      {definition.level}
                    </span>
                    <Texts
                      texts={definition.texts}
                      variant={variant}
                      textRole="definition"
                    />
                  </>
                ) : (
                  <p className="text-foreground-muted">暂无释义</p>
                )}
              </div>
              <div className="col-span-2 md:col-span-1">
                {grammar && (
                  <p className="mb-1 text-xs text-foreground-muted md:hidden">
                    语法结构
                  </p>
                )}
                {grammar && (
                  <Texts texts={grammar.variants} variant={variant} />
                )}
                {grammar && (
                  <TargetAudio
                    entryId={entry.entry_id}
                    audio={item.audio}
                    targetId={grammar.id}
                    sourceDialects={selectTexts(grammar.variants, variant).map(
                      (text) => text.dialect
                    )}
                    variant={variant}
                    label="播放语法结构"
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}

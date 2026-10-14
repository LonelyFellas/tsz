"use client";
import { TipPanel } from "./WordlistTips";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient
} from "@tanstack/react-query";
import { ReadingEntry } from "./ReadingEntry";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem
} from "@tsz/ui/components";
import type {
  CEFRLevel,
  WordlistView,
  WordlistSort,
  MyWordlistItem,
  SubmitWordlist
} from "@tsz/types";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";
import { useTeacherIdentity } from "@/features/teacher-certification/TeacherIdentityProvider";
import { wordListKeys } from "../hooks/useWordLists";
import { STATE_LABEL, buttonClass, textButtonClass } from "../reading";
import { Search } from "lucide-react";
import {
  PageHeader,
  PageNotice,
  PageShell,
  Segmented,
  panelClass
} from "@/features/shell/Page";
import "@tsz/voice-editor/styles.css";
const SORT_LABELS: Record<WordlistSort, string> = {
  author: "作者顺序",
  label_asc: "词面 A–Z",
  label_desc: "词面 Z–A"
};
const CONTENT_CHANGED = "词表内容已变化，请重新加载词条。";
export function WordListDetail({
  id,
  mine = false
}: {
  id: string;
  mine?: boolean;
}) {
  const userId = useUserStore((s) => s.user?.id);
  return (
    <Detail
      key={`${userId ?? "guest"}:${id}:${mine}`}
      id={id}
      mine={mine}
      userId={userId}
    />
  );
}
function Detail({
  id,
  mine,
  userId
}: {
  id: string;
  mine: boolean;
  userId?: string;
}) {
  const client = useQueryClient();
  const identity = useTeacherIdentity();
  const hydrated = useUserStore((s) => s.hydrated);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [view, setView] = useState<WordlistView>("standard");
  const [sort, setSort] = useState<WordlistSort>("author");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submit, setSubmit] = useState<SubmitWordlist | null>(null);
  const keys = mine ? wordListKeys.mine(userId) : wordListKeys.public;
  const meta = useQuery({
    queryKey: [...keys, "detail", id],
    enabled: !mine || !!userId,
    refetchOnMount: "always",
    queryFn: ({ signal }) =>
      mine
        ? api.wordList.myDetail(id, { signal })
        : api.wordList.get(id, { signal })
  });
  const availability = useQuery({
    queryKey: [...keys, "availability", id, meta.data?.revision],
    enabled: meta.isSuccess,
    refetchOnMount: "always",
    queryFn: ({ signal }) =>
      mine
        ? api.wordList.myAvailability(id, { signal })
        : api.wordList.availability(id, { signal })
  });
  const items = useInfiniteQuery({
    queryKey: [...keys, "items", "infinite", id, q, view, sort],
    enabled: meta.isSuccess,
    refetchOnMount: "always",
    initialPageParam: { page: 1, revision: null as number | null },
    queryFn: async ({ signal, pageParam }) => {
      const result = await (mine
        ? api.wordList.myItems(
            id,
            {
              page: pageParam.page,
              q,
              ...(view === "full" ? { view } : {}),
              ...(sort !== "author" ? { sort } : {})
            },
            { signal }
          )
        : api.wordList.items(
            id,
            {
              page: pageParam.page,
              q,
              ...(view === "full" ? { view } : {}),
              ...(sort !== "author" ? { sort } : {})
            },
            { signal }
          ));
      if (pageParam.revision !== null && result.revision !== pageParam.revision)
        throw new Error(CONTENT_CHANGED);
      return result;
    },
    getNextPageParam: (lastPage) =>
      lastPage.pagination.page < lastPage.pagination.total_pages
        ? { page: lastPage.pagination.page + 1, revision: lastPage.revision }
        : undefined
  });
  const profile = useQuery({
    queryKey: [...wordListKeys.mine(userId), "reading-settings"],
    enabled: !!userId,
    refetchOnMount: "always",
    queryFn: ({ signal }) => api.auth.me({ signal })
  });
  const reviews = useQuery({
    queryKey: [...keys, "reviews", id],
    enabled: mine && !!userId,
    queryFn: ({ signal }) => api.wordList.reviews(id, { signal })
  });
  const ready = hydrated && (!userId || (identity.ready && profile.isSuccess));
  const level: CEFRLevel =
    identity.identity === "teacher"
      ? "C2"
      : (profile.data?.learning_settings?.cefr_level ?? "C2");
  const variant = profile.data?.learning_settings?.english_variant ?? null;
  const loadedItems = items.data?.pages.flatMap((page) => page.items) ?? [];
  const unavailableItems = loadedItems.filter((item) => !item.entry);
  const availabilityData =
    availability.data?.revision === meta.data?.revision
      ? availability.data
      : undefined;
  useEffect(() => {
    const target = loadMoreRef.current;
    if (
      !target ||
      !ready ||
      !items.hasNextPage ||
      items.isFetching ||
      items.isError
    )
      return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting)
          void items.fetchNextPage({ cancelRefetch: false });
      },
      { rootMargin: "200px" }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [
    ready,
    items.hasNextPage,
    items.isFetching,
    items.isError,
    items.fetchNextPage
  ]);
  async function action(kind: "submit" | "withdraw") {
    if (!meta.data) return;
    if (
      kind === "withdraw" &&
      !window.confirm(
        "撤回后将立即转为私密并取消推荐。修改完成后可再次设为公开。继续？"
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      if (kind === "submit") {
        const payload = (submit?.expected_revision === meta.data.revision
          ? submit
          : null) ?? {
          expected_revision: meta.data.revision,
          idempotency_key: crypto.randomUUID()
        };
        setSubmit(payload);
        await api.wordList.publish(id, payload);
        setSubmit(null);
      } else
        await api.wordList.withdraw(id, {
          expected_revision: meta.data.revision
        });
      await client.invalidateQueries({ queryKey: wordListKeys.all });
    } catch {
      setError("操作结果未确认，请刷新核对。公开重试会复用原请求键。");
    } finally {
      setBusy(false);
    }
  }
  const back = {
    href: mine ? "/account/wordlists" : "/wordlists",
    label: "返回词表"
  };
  if (meta.isError)
    return (
      <PageShell size="lg">
        <PageHeader back={back} title="词表" />
        <PageNotice tone="error">
          词表不存在、不可访问或暂时无法加载。
          <button
            className={textButtonClass}
            onClick={() => void meta.refetch()}
          >
            重试
          </button>
        </PageNotice>
      </PageShell>
    );
  if (!meta.data)
    return (
      <PageShell size="lg">
        <PageNotice>正在读取词表…</PageNotice>
      </PageShell>
    );
  const list = meta.data;
  return (
    <PageShell size="lg">
      <PageHeader
        back={back}
        eyebrow={mine ? "我的词表" : "词库广场"}
        title={list.name}
        description={`${list.owner_name} · ${STATE_LABEL[list.state]} · ${list.item_count} 个词条`}
      />
      <section className="glass rounded-3xl p-2">
        <div className="rounded-[20px] bg-surface/70 p-6 sm:p-8">
          <p className="break-all text-xs text-foreground-subtle">
            ID：{list.id}
          </p>
          <div className="mt-6 flex flex-wrap gap-3 empty:hidden">
            {mine ? (
              <>
                <Link
                  className={buttonClass}
                  href={`/account/wordlists/${id}/edit`}
                >
                  {list.state === "pending" || list.state === "published"
                    ? "查看创编内容"
                    : "编辑词表"}
                </Link>
                {list.state === "pending" || list.state === "published" ? (
                  <button
                    className={buttonClass}
                    disabled={busy}
                    onClick={() => void action("withdraw")}
                  >
                    撤回为私密
                  </button>
                ) : (
                  <button
                    className={buttonClass}
                    disabled={busy}
                    onClick={() => void action("submit")}
                  >
                    设为公开
                  </button>
                )}
                {list.state === "published" && (
                  <Link className={buttonClass} href={`/wordlists/${id}`}>
                    查看公开页面
                  </Link>
                )}
              </>
            ) : (
              list.owner_user_id === userId && (
                <Link className={buttonClass} href={`/account/wordlists/${id}`}>
                  管理我的词表
                </Link>
              )
            )}
          </div>
          {error && (
            <p role="alert" className="mt-4 text-sm text-danger">
              {error}
            </p>
          )}
          {mine && reviews.data?.withdraw_reason && (
            <p className="mt-4 rounded-2xl bg-muted/70 px-4 py-3 text-sm leading-6">
              下架原因：{reviews.data.withdraw_reason}
            </p>
          )}
          {mine && reviews.data?.items[0]?.reason && (
            <p className="mt-4 rounded-2xl bg-muted/70 px-4 py-3 text-sm leading-6">
              审核意见：{reviews.data.items[0].reason}
            </p>
          )}
          {mine && reviews.isError && (
            <p role="alert" className="mt-4 text-sm text-danger">
              审核记录加载失败。
            </p>
          )}
          {availabilityData ? (
            <p className="mt-4 text-sm text-foreground-muted">
              整张词表：{availabilityData.available_count} 个可用词条
              {availabilityData.unavailable_count > 0 &&
                `，${availabilityData.unavailable_count} 个暂不可用，不参与出题`}
            </p>
          ) : availability.isError ||
            (availability.isSuccess && !availabilityData) ? (
            <p role="alert" className="mt-4 text-sm text-foreground-muted">
              可用数量暂时无法读取，已加载的词条仍可阅读。{" "}
              <button
                className={textButtonClass}
                onClick={() => void availability.refetch()}
              >
                重试
              </button>
            </p>
          ) : null}
          {!mine &&
            list.state === "published" &&
            list.owner_user_id !== null && <TipPanel list={list} />}
        </div>
      </section>
      <div className="mb-6 mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <label className="glass relative flex min-h-11 min-w-40 flex-1 items-center rounded-full pl-11 pr-5 transition-shadow focus-within:ring-4 focus-within:ring-primary/15">
          <Search
            className="absolute left-4 size-4 text-foreground-subtle"
            strokeWidth={1.8}
            aria-hidden
          />
          <input
            aria-label="搜索词条"
            placeholder="搜索词面"
            className="w-full bg-transparent py-2.5 text-sm text-foreground outline-hidden placeholder:text-foreground-subtle"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
            }}
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            label="阅读模式"
            value={view}
            options={[
              { value: "standard", label: "标准模式" },
              { value: "full", label: "完整模式" }
            ]}
            onChange={setView}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className={buttonClass}>
                排序：{SORT_LABELS[sort]}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {Object.entries(SORT_LABELS).map(([value, label]) => (
                <DropdownMenuItem
                  key={value}
                  role="menuitemradio"
                  aria-checked={sort === value}
                  onSelect={() => {
                    setSort(value as WordlistSort);
                  }}
                >
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {ready && (
            <span className="rounded-full bg-muted px-3 py-1.5 text-xs font-medium tracking-wide text-foreground-muted">
              {`释义等级 ${level}${!profile.data?.learning_settings && identity.identity !== "teacher" ? " 预览" : ""}`}
            </span>
          )}
        </div>
      </div>
      {!ready ? (
        profile.isError || identity.error ? (
          <PageNotice tone="error">
            阅读设置读取失败，请刷新；尚未显示未确认等级的释义。
          </PageNotice>
        ) : (
          <PageNotice>正在读取阅读设置…</PageNotice>
        )
      ) : items.isError && !items.data ? (
        <PageNotice tone="error">
          {view === "full"
            ? "完整内容暂不可用，可切回标准模式，或"
            : "条目加载失败，"}
          <button
            className={textButtonClass}
            onClick={() => void items.refetch()}
          >
            重试
          </button>
          。
        </PageNotice>
      ) : !items.data ? (
        <PageNotice>正在读取条目…</PageNotice>
      ) : (
        <>
          {(unavailableItems.length > 0 ||
            (availabilityData?.unavailable_count ?? 0) > 0) && (
            <details className="mb-6 rounded-2xl border border-border/60 bg-muted/70 px-4 py-3 text-sm leading-6">
              <summary className="cursor-pointer font-medium">
                查看暂不可用的词条
                {availabilityData
                  ? `（整张词表共 ${availabilityData.unavailable_count} 个）`
                  : `（已加载 ${unavailableItems.length} 个）`}
              </summary>
              <p className="mt-3 text-foreground-muted">
                这些词条目前不能阅读或用于出题。引用和备注仍保留，内容恢复可用后会重新显示。
              </p>
              {mine && (
                <p className="mt-2">
                  <Link
                    className={textButtonClass}
                    href={`/account/wordlists/${id}/edit`}
                  >
                    移除或替换
                  </Link>
                  {(list.state === "published" || list.state === "pending") &&
                    " · 请先撤回为私密，再编辑词表。"}
                </p>
              )}
              <ul className="mt-3 space-y-2">
                {unavailableItems.map((item) => (
                  <li
                    key={item.entry_id}
                    className="border-t border-border/60 pt-2"
                  >
                    原位置 {item.position + 1} · 词条暂不可用
                    {item.author_note && (
                      <p className="whitespace-pre-wrap">
                        注：{item.author_note}
                      </p>
                    )}
                    {mine &&
                      "private_note" in item &&
                      (item as MyWordlistItem).private_note && (
                        <p className="whitespace-pre-wrap text-foreground-muted">
                          私密备注：{(item as MyWordlistItem).private_note}
                        </p>
                      )}
                  </li>
                ))}
              </ul>
              {(availabilityData?.unavailable_count ?? 0) >
                unavailableItems.length && (
                <p className="mt-2 text-foreground-muted">
                  这里只列出当前已加载且符合搜索条件的项目；其他项目会随词条加载显示。
                </p>
              )}
            </details>
          )}
          <div className="space-y-4">
            {loadedItems.map((item) =>
              item.entry ? (
                <section key={item.entry_id} className={panelClass}>
                  <div className="mb-3 text-xs font-medium tabular-nums tracking-wide text-foreground-subtle">
                    {String(item.position + 1).padStart(2, "0")}
                  </div>
                  <ReadingEntry
                    full={view === "full"}
                    entry={item.entry}
                    level={level}
                    variant={variant}
                  />
                  {item.author_note && (
                    <p className="mt-5 whitespace-pre-wrap rounded-2xl bg-muted/70 px-4 py-3 text-sm leading-6">
                      注：{item.author_note}
                    </p>
                  )}
                  {mine &&
                    "private_note" in item &&
                    (item as MyWordlistItem).private_note && (
                      <p className="mt-3 whitespace-pre-wrap rounded-2xl border border-dashed border-border px-4 py-3 text-sm leading-6 text-foreground-muted">
                        私密备注：{(item as MyWordlistItem).private_note}
                      </p>
                    )}
                </section>
              ) : null
            )}
          </div>
          {loadedItems.length > 0 &&
            loadedItems.every((item) => !item.entry) && (
              <PageNotice>当前已加载的词条均不可用。</PageNotice>
            )}
          {loadedItems.length === 0 ? (
            <PageNotice>没有匹配词条</PageNotice>
          ) : (
            <div
              ref={loadMoreRef}
              className="mt-6 py-4 text-center text-sm text-foreground-muted"
            >
              {items.isError ? (
                <p role="alert">
                  {items.error.message === CONTENT_CHANGED
                    ? CONTENT_CHANGED
                    : "后续词条加载失败，已加载的内容仍可阅读。"}{" "}
                  <button
                    className={textButtonClass}
                    disabled={items.isFetching}
                    onClick={() =>
                      void (items.isFetchNextPageError &&
                      items.error.message !== CONTENT_CHANGED
                        ? items.fetchNextPage({ cancelRefetch: false })
                        : items.refetch())
                    }
                  >
                    {items.error.message === CONTENT_CHANGED
                      ? "重新加载"
                      : "重试"}
                  </button>
                </p>
              ) : (
                <p role="status">
                  {items.isFetchingNextPage
                    ? "正在加载更多词条…"
                    : items.hasNextPage
                      ? "继续向下滚动，自动加载更多词条"
                      : `已加载全部 ${loadedItems.length} 个词条`}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}

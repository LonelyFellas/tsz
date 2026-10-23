"use client";
import { unavailableReasonLabels } from "../availability";
import { DetailInteractions } from "./WordlistInteractions";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { HttpError } from "@tsz/api-client";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient
} from "@tanstack/react-query";
import { ReadingEntry } from "./ReadingEntry";
import { AudioButton } from "@/features/audio/AudioButton";
import { audioStatusLabels, useCustomAudio } from "../hooks/useCustomAudio";
import {
  Button,
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
  Segmented
} from "@/features/shell/Page";
import "@tsz/voice-editor/reader.css";
const SORT_LABELS: Record<WordlistSort, string> = {
  author: "作者顺序",
  label_asc: "词面 A–Z",
  label_desc: "词面 Z–A"
};
const CONTENT_CHANGED = "词表内容已变化，请重新加载词条。";
export function WordListDetail({
  id,
  mine = false,
  embedded = false,
  editHref
}: {
  id: string;
  mine?: boolean;
  embedded?: boolean;
  editHref?: string;
}) {
  const userId = useUserStore((s) => s.user?.id);
  return (
    <Detail
      key={`${userId ?? "guest"}:${id}:${mine}`}
      id={id}
      mine={mine}
      userId={userId}
      embedded={embedded}
      editHref={editHref}
    />
  );
}
function Detail({
  id,
  mine,
  userId,
  embedded,
  editHref
}: {
  id: string;
  mine: boolean;
  userId?: string;
  embedded?: boolean;
  editHref?: string;
}) {
  const client = useQueryClient();
  const identity = useTeacherIdentity();
  const hydrated = useUserStore((s) => s.hydrated);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const lastAvailabilityRefresh = useRef(0);
  const [unavailableOpen, setUnavailableOpen] = useState<boolean>();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [composing, setComposing] = useState(false);
  useEffect(() => {
    if (composing) return;
    const timer = setTimeout(() => setQ(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query, composing]);
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
    queryKey: [
      ...keys,
      "items",
      "infinite",
      id,
      meta.data?.revision,
      q,
      view,
      sort
    ],
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
        : undefined,
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey.at(-2) === view &&
      previousQuery.queryKey.at(-4) === meta.data?.revision &&
      previousQuery.queryKey.at(-1) === sort
        ? previous
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
  const updatingSearch =
    composing || query.trim() !== q || items.isPlaceholderData;
  const level: CEFRLevel =
    identity.identity === "teacher"
      ? "C2"
      : (profile.data?.learning_settings?.cefr_level ?? "C2");
  const variant = profile.data?.learning_settings?.english_variant ?? null;
  const loadedItems = items.data?.pages.flatMap((page) => page.items) ?? [];
  const customIds = loadedItems.flatMap((item) =>
    item.custom_word && item.item_id ? [item.item_id] : []
  );
  const audio = useCustomAudio(
    id,
    customIds,
    mine,
    userId,
    customIds.length > 0 && !updatingSearch
  );
  const audioByItem = new Map(
    audio.data?.items.map((item) => [item.item_id, item])
  );
  const locales =
    variant === "AmE"
      ? (["en-US", "en-GB"] as const)
      : (["en-GB", "en-US"] as const);
  const unavailableItems = loadedItems.filter(
    (item) => !item.entry && !item.custom_word
  );
  const availabilityVersionChanged =
    !!availability.data && availability.data.revision !== meta.data?.revision;
  const availabilityCountsChanged =
    !!availability.data &&
    (availability.data.unavailable_count < unavailableItems.length ||
      availability.data.available_count <
        loadedItems.length - unavailableItems.length);
  const availabilityData =
    !availabilityVersionChanged && !availabilityCountsChanged
      ? availability.data
      : undefined;
  const allUnavailable = availabilityData?.available_count === 0;
  const showPublicationCheck =
    mine &&
    !!meta.data &&
    meta.data.state !== "pending" &&
    meta.data.state !== "published";
  const publicationHasUnavailable =
    (availabilityData?.unavailable_count ?? 0) > 0 ||
    unavailableItems.length > 0;
  const canSubmit =
    !!availabilityData &&
    !availability.isFetching &&
    !availability.isError &&
    !publicationHasUnavailable;
  const unavailableExpanded =
    unavailableOpen ?? (showPublicationCheck && publicationHasUnavailable);
  const {
    dataUpdatedAt: itemsUpdatedAt,
    hasNextPage,
    isFetching,
    isError,
    fetchNextPage
  } = items;
  const { isFetching: availabilityFetching, refetch: refetchAvailability } =
    availability;
  useEffect(() => {
    if (
      availabilityCountsChanged &&
      !availabilityVersionChanged &&
      !availabilityFetching &&
      lastAvailabilityRefresh.current !== itemsUpdatedAt
    ) {
      lastAvailabilityRefresh.current = itemsUpdatedAt;
      void refetchAvailability();
    }
  }, [
    availabilityCountsChanged,
    availabilityVersionChanged,
    availabilityFetching,
    itemsUpdatedAt,
    refetchAvailability
  ]);
  useEffect(() => {
    const target = loadMoreRef.current;
    if (
      !target ||
      !ready ||
      updatingSearch ||
      allUnavailable ||
      !hasNextPage ||
      isFetching ||
      isError
    )
      return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void fetchNextPage({ cancelRefetch: false });
      },
      { rootMargin: "200px" }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [
    meta.isSuccess,
    ready,
    updatingSearch,
    allUnavailable,
    hasNextPage,
    isFetching,
    isError,
    fetchNextPage
  ]);
  async function reloadWordlist() {
    const revision = meta.data?.revision;
    const result = await meta.refetch();
    if (result.isSuccess && result.data.revision === revision) {
      await Promise.all([
        refetchAvailability(),
        client.resetQueries({ queryKey: [...keys, "items", "infinite", id] })
      ]);
    }
  }
  async function action(kind: "submit" | "withdraw") {
    if (busy || !meta.data || (kind === "submit" && !canSubmit)) return;
    if (
      kind === "withdraw" &&
      !window.confirm(
        "撤回后将立即转为私密并取消推荐。修改完成后可再次申请公开。继续？"
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
    } catch (cause) {
      const rejected =
        cause instanceof HttpError &&
        cause.status >= 400 &&
        cause.status < 500 &&
        cause.status !== 408;
      if (kind === "submit" && rejected) setSubmit(null);
      if (!rejected) {
        setError(
          kind === "submit"
            ? "暂时无法确认申请是否成功，请刷新页面查看词表状态后再试。"
            : "暂时无法确认是否已撤回，请刷新页面查看词表状态后再试。"
        );
      } else if (
        kind === "submit" &&
        cause.status === 400 &&
        cause.code === "validation_failed"
      ) {
        setError(
          "申请公开失败：词表中有暂不可用的词条。请在下方查看原因，移除或替换后再申请。"
        );
        setUnavailableOpen(true);
        void client.invalidateQueries({ queryKey: wordListKeys.all });
      } else if (cause.status === 409) {
        setError("词表已发生变化，请刷新页面后再操作。");
      } else {
        setError(
          kind === "submit"
            ? "申请公开失败，请刷新页面后再试。"
            : "撤回失败，请刷新页面后再试。"
        );
      }
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
      <PageShell size="lg" embedded={embedded}>
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
      <PageShell size="lg" embedded={embedded}>
        <PageNotice>正在读取词表…</PageNotice>
      </PageShell>
    );
  const list = meta.data;
  return (
    <PageShell size="lg" embedded={embedded}>
      <PageHeader
        back={embedded ? undefined : back}
        eyebrow={embedded ? undefined : mine ? "我的词表" : "词库广场"}
        title={list.name}
        description={
          <span className="break-words">{`${list.owner_name} · ${STATE_LABEL[list.state]} · ${list.item_count} 个词条`}</span>
        }
        actions={
          mine && (
            <Button asChild>
              <Link href={editHref ?? `/account/wordlists/${id}/edit`}>
                {list.state === "pending" || list.state === "published"
                  ? "查看与编辑"
                  : "编辑词表"}
              </Link>
            </Button>
          )
        }
      />
      <section className="border-b border-border/70 pb-5">
        <div>
          <h2 className="sr-only">词表概况</h2>
          <div className="flex flex-wrap gap-2 empty:hidden">
            {mine ? (
              <>
                {list.state === "pending" || list.state === "published" ? (
                  <button
                    className={buttonClass}
                    disabled={busy}
                    onClick={() => void action("withdraw")}
                  >
                    {busy ? "处理中…" : "撤回为私密"}
                  </button>
                ) : (
                  <button
                    className={buttonClass}
                    disabled={busy || !canSubmit}
                    aria-describedby={
                      !canSubmit
                        ? "publication-availability-message"
                        : undefined
                    }
                    onClick={() => void action("submit")}
                  >
                    {busy ? "提交中…" : "申请公开"}
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
          {mine &&
            list.state !== "published" &&
            (list.state === "pending" || canSubmit) && (
              <p className="mt-4 text-sm leading-6 text-foreground-muted">
                {list.state === "pending"
                  ? "公开申请正在审核中，审核通过前仅你可见。"
                  : "公开后可被其他用户搜索和使用，需审核。"}
              </p>
            )}
          {showPublicationCheck && !canSubmit && (
            <p
              id="publication-availability-message"
              role="status"
              className="mt-4 text-sm text-foreground-muted"
            >
              {publicationHasUnavailable
                ? "有不可用词条，移除或替换后可申请公开。"
                : availability.isError ||
                    (availability.isSuccess && !availabilityData)
                  ? "暂时无法确认词条是否全部可用，请在下方重试后再申请。"
                  : "正在检查词条可用性，请稍候。"}
            </p>
          )}
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
          {availabilityData && (
            <p className="mt-4 text-sm text-foreground-muted">
              整张词表：{availabilityData.available_count} 个可用词条
              {!!availabilityData.custom_count &&
                `，其中 ${availabilityData.custom_count} 个自定义词汇暂不参与学习出题`}
              {availabilityData.unavailable_count > 0 &&
                `，${availabilityData.unavailable_count} 个暂不可用，不参与出题`}
            </p>
          )}
          {(availability.isError ||
            (availability.isSuccess && !availabilityData)) && (
            <p role="alert" className="mt-4 text-sm text-foreground-muted">
              {availabilityVersionChanged
                ? "词表内容已变化，请重新加载词表。"
                : "可用数量暂时无法读取，已加载的词条仍可阅读。"}{" "}
              <button
                className={textButtonClass}
                disabled={availabilityFetching}
                onClick={() =>
                  void (availabilityVersionChanged
                    ? reloadWordlist()
                    : refetchAvailability())
                }
              >
                {availabilityVersionChanged ? "重新加载词表" : "重试"}
              </button>
            </p>
          )}
          {!mine && list.state === "published" && (
            <DetailInteractions list={list} />
          )}
        </div>
      </section>
      <div className="mb-5 mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <label className="relative flex min-h-11 min-w-40 flex-1 items-center border border-border bg-surface sm:max-w-sm rounded-full pl-11 pr-5 transition-shadow focus-within:ring-4 focus-within:ring-primary/15">
          <Search
            className="absolute left-4 size-4 text-foreground-subtle"
            strokeWidth={1.8}
            aria-hidden
          />
          <input
            aria-label="搜索词条"
            placeholder="搜索词面"
            className="w-full bg-transparent py-2.5 text-sm text-foreground outline-hidden placeholder:text-foreground-subtle"
            value={query}
            onCompositionStart={() => setComposing(true)}
            onCompositionEnd={(event) => {
              setComposing(false);
              setQuery(event.currentTarget.value);
            }}
            onChange={(e) => {
              setQuery(e.target.value);
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
      {updatingSearch && (
        <p role="status" className="mb-5 text-xs text-foreground-muted">
          正在搜索…
        </p>
      )}
      {!ready ? (
        profile.isError || identity.error ? (
          <PageNotice tone="error">
            阅读设置读取失败，请刷新；尚未显示未确认等级的释义。
          </PageNotice>
        ) : (
          <PageNotice>正在读取阅读设置…</PageNotice>
        )
      ) : items.isError && loadedItems.length === 0 ? (
        <PageNotice tone="error">
          {view === "full"
            ? "完整内容暂不可用，可切回标准模式，或"
            : "条目加载失败，"}
          <button
            className={textButtonClass}
            disabled={items.isFetching}
            onClick={() => void items.refetch()}
          >
            {items.isFetching ? "重试中…" : "重试"}
          </button>
          。
        </PageNotice>
      ) : !items.data ? (
        <PageNotice>正在读取条目…</PageNotice>
      ) : (
        <>
          {(unavailableItems.length > 0 ||
            (availabilityData?.unavailable_count ?? 0) > 0) && (
            <details
              className="mb-6 break-words rounded-2xl border border-border/60 bg-muted/70 px-4 py-3 text-sm leading-6"
              open={unavailableExpanded}
              onToggle={(event) => setUnavailableOpen(event.currentTarget.open)}
            >
              <summary className="cursor-pointer font-medium">
                查看暂不可用的词条
                {availabilityData
                  ? `（整张词表共 ${availabilityData.unavailable_count} 个）`
                  : `（已加载 ${unavailableItems.length} 个）`}
              </summary>
              <p className="mt-3 text-foreground-muted">
                引用和备注已保留，词条恢复后可继续阅读。
              </p>
              {mine && (
                <p className="mt-2">
                  <Link
                    className={textButtonClass}
                    href={editHref ?? `/account/wordlists/${id}/edit`}
                  >
                    移除或替换
                  </Link>
                  {(list.state === "published" || list.state === "pending") &&
                    " · 请先撤回为私密，再编辑词表。"}
                </p>
              )}
              {unavailableExpanded && (
                <ul className="mt-3 space-y-2">
                  {unavailableItems.map((item) => (
                    <li
                      key={item.item_id ?? item.entry_id}
                      className="border-t border-border/60 pt-2"
                    >
                      {mine &&
                        typeof (item as MyWordlistItem).entry_label ===
                          "string" && (
                          <span className="tsz-words">
                            {(item as MyWordlistItem).entry_label} ·{" "}
                          </span>
                        )}
                      原位置 {item.position + 1} · 词条暂不可用
                      {mine && (item as MyWordlistItem).unavailable_reason && (
                        <p className="text-foreground-muted">
                          原因：
                          {
                            unavailableReasonLabels[
                              (item as MyWordlistItem).unavailable_reason!
                            ]
                          }
                        </p>
                      )}
                      {item.author_note && (
                        <p className="whitespace-pre-wrap">
                          注：{item.author_note}
                        </p>
                      )}
                      {mine &&
                        "private_note" in item &&
                        (item as MyWordlistItem).private_note && (
                          <p className="whitespace-pre-wrap rounded-2xl border border-dashed border-border px-4 py-3 text-foreground-muted">
                            私密备注：{(item as MyWordlistItem).private_note}
                          </p>
                        )}
                    </li>
                  ))}
                </ul>
              )}
              {unavailableExpanded &&
                (allUnavailable ||
                  (showPublicationCheck &&
                    (availabilityData?.unavailable_count ?? 0) >
                      unavailableItems.length)) &&
                hasNextPage &&
                !isError && (
                  <button
                    className={textButtonClass}
                    disabled={isFetching || updatingSearch}
                    onClick={() => void fetchNextPage({ cancelRefetch: false })}
                  >
                    {allUnavailable
                      ? "加载更多不可用词条"
                      : "加载更多词条以查看原因"}
                  </button>
                )}
              {(availabilityData?.unavailable_count ?? 0) >
                unavailableItems.length && (
                <p className="mt-2 text-foreground-muted">
                  这里只列出当前已加载且符合搜索条件的项目；其他项目会随词条加载显示。
                  {showPublicationCheck && q.trim() && (
                    <button
                      className={textButtonClass}
                      onClick={() => {
                        setQuery("");
                        setQ("");
                      }}
                    >
                      清空搜索查看原因
                    </button>
                  )}
                </p>
              )}
            </details>
          )}
          {audio.isError && customIds.length > 0 && (
            <p role="status" className="mb-4 text-sm text-foreground-muted">
              语音暂不可用，词表内容仍可阅读。
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => void audio.refetch()}
              >
                重试读取语音
              </Button>
            </p>
          )}
          <div aria-busy={updatingSearch}>
            {loadedItems.map((item) =>
              item.entry || item.custom_word ? (
                <section
                  key={item.item_id ?? item.entry_id}
                  className="min-w-0 break-words border-b border-border/60 py-6 last:border-b-0"
                >
                  <div className="mb-3 text-xs font-medium tabular-nums tracking-wide text-foreground-subtle">
                    {String(item.position + 1).padStart(2, "0")}
                  </div>
                  {item.custom_word ? (
                    <div>
                      <h2 className="tsz-words break-words text-xl font-semibold">
                        {item.custom_word.word}
                      </h2>
                      {audioByItem.get(item.item_id!)?.word ===
                        item.custom_word.word &&
                        (audioByItem.get(item.item_id!)?.status === "ready" ? (
                          <div className="flex flex-wrap items-center gap-3">
                            {locales.map((locale) => (
                              <span
                                key={locale}
                                className="inline-flex items-center text-xs text-foreground-muted"
                              >
                                {locale === "en-GB" ? "英式" : "美式"}
                                <AudioButton
                                  label={`播放 ${item.custom_word!.word} ${locale === "en-GB" ? "英式" : "美式"}语音`}
                                  sign={(signal) =>
                                    mine
                                      ? api.wordList.myCustomAudioUrl(
                                          id,
                                          item.item_id!,
                                          locale,
                                          { signal }
                                        )
                                      : api.wordList.customAudioUrl(
                                          id,
                                          item.item_id!,
                                          locale,
                                          { signal }
                                        )
                                  }
                                />
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-2 text-xs text-foreground-muted">
                            {
                              audioStatusLabels[
                                audioByItem.get(item.item_id!)!.status
                              ]
                            }
                          </p>
                        ))}
                      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">
                        {item.custom_word.definition}
                      </p>
                      <p className="mt-2 text-xs text-foreground-muted">
                        自定义词汇
                      </p>
                    </div>
                  ) : (
                    item.entry && (
                      <ReadingEntry
                        full={view === "full"}
                        entry={item.entry}
                        level={level}
                        variant={variant}
                      />
                    )
                  )}
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
            loadedItems.every((item) => !item.entry && !item.custom_word) && (
              <PageNotice>当前已加载的词条均不可用。</PageNotice>
            )}
          {loadedItems.length === 0 ? (
            <PageNotice>
              {q ? "未找到匹配词条" : "暂无词条"}
              {q && (
                <Button
                  type="button"
                  variant="ghost"
                  className="ml-2"
                  onClick={() => {
                    setQuery("");
                    setQ("");
                  }}
                >
                  清空搜索
                </Button>
              )}
            </PageNotice>
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
                      ? allUnavailable
                        ? "展开上方列表，按需加载不可用词条"
                        : "继续向下滚动，自动加载更多词条"
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

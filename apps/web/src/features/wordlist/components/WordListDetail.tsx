"use client";
import { localText, type WebNotice } from "@/i18n/catalog";

import { useWebText } from "@/i18n/client";
import { webWordlistDetail as webWordlist } from "@/i18n/messages/wordlist/detail";

import { DetailInteractions } from "./WordlistInteractions";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { HttpError } from "@tsz/api-client";
import { wordlistAudioWord } from "@tsz/shared";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient
} from "@tanstack/react-query";
import { ReadingEntry, ReadingTable } from "./ReadingEntry";
import { AudioButton } from "@/features/audio/AudioButton";
import { useCustomAudio } from "../hooks/useCustomAudio";
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
import { buttonClass, textButtonClass } from "../reading";
import { SearchField } from "@/features/shell/SearchField";
import {
  PageHeader,
  PageNotice,
  PageShell,
  Segmented
} from "@/features/shell/Page";

const stateMessages = {
  draft: localText(webWordlist, "webWordlistDetail:private_draft"),
  pending: localText(webWordlist, "webWordlistDetail:pending_review"),
  published: localText(webWordlist, "webWordlistDetail:published"),
  rejected: localText(webWordlist, "webWordlistDetail:rejected"),
  withdrawn: localText(webWordlist, "webWordlistDetail:withdrawn")
};
const audioStatusMessages = {
  queued: localText(webWordlist, "webWordlistDetail:audio_queued"),
  processing: localText(webWordlist, "webWordlistDetail:generating_audio"),
  ready: localText(webWordlist, "webWordlistDetail:audio_generated"),
  refunding: localText(
    webWordlist,
    "webWordlistDetail:audio_incomplete_refund_processing"
  ),
  refunded: localText(
    webWordlist,
    "webWordlistDetail:audio_incomplete_refunded"
  )
};
const unavailableReasonMessages = {
  archived: localText(webWordlist, "webWordlistDetail:moved_to_trash"),
  unpublished: localText(webWordlist, "webWordlistDetail:not_published"),
  unsupported_schema: localText(
    webWordlist,
    "webWordlistDetail:this_publication_version_is_not_supported_yet"
  )
};
const SORT_LABELS: Record<WordlistSort, WebNotice> = {
  author: localText(webWordlist, "webWordlistDetail:author_order"),
  label_asc: localText(webWordlist, "webWordlistDetail:spelling_a_z"),
  label_desc: localText(webWordlist, "webWordlistDetail:spelling_z_a")
};
class WordlistContentChangedError extends Error {}
const CONTENT_CHANGED = localText(
  webWordlist,
  "webWordlistDetail:the_word_list_changed_reload_its_entries"
);
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
  const uiText = useWebText(webWordlist);
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
  const [view, setView] = useState<WordlistView | "simple">("standard");
  const requestView = view === "full" ? "full" : "standard";
  const [sort, setSort] = useState<WordlistSort>("author");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<WebNotice>("");
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
      requestView,
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
              // 三种展示模式的词面都需要完整数据中的英美拼写。
              view: "full",
              ...(sort !== "author" ? { sort } : {})
            },
            { signal }
          )
        : api.wordList.items(
            id,
            {
              page: pageParam.page,
              q,
              view: "full",
              ...(sort !== "author" ? { sort } : {})
            },
            { signal }
          ));
      if (pageParam.revision !== null && result.revision !== pageParam.revision)
        throw new WordlistContentChangedError();
      return result;
    },
    getNextPageParam: (lastPage) =>
      lastPage.pagination.page < lastPage.pagination.total_pages
        ? { page: lastPage.pagination.page + 1, revision: lastPage.revision }
        : undefined,
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey.at(-2) === requestView &&
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
        uiText(
          "webWordlistDetail:withdrawing_makes_this_list_private_and_removes_recommendations_immediat"
        )
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
            ? localText(
                webWordlist,
                "webWordlistDetail:could_not_confirm_the_publication_request_reload_to_check_the_list_statu"
              )
            : localText(
                webWordlist,
                "webWordlistDetail:could_not_confirm_withdrawal_reload_to_check_the_list_status_before_tryi"
              )
        );
      } else if (
        kind === "submit" &&
        cause.status === 400 &&
        cause.code === "validation_failed"
      ) {
        setError(
          localText(
            webWordlist,
            "webWordlistDetail:cannot_request_publication_the_list_contains_unavailable_entries_check_t"
          )
        );
        setUnavailableOpen(true);
        void client.invalidateQueries({ queryKey: wordListKeys.all });
      } else if (cause.status === 409) {
        setError(
          localText(
            webWordlist,
            "webWordlistDetail:the_word_list_changed_reload_before_continuing"
          )
        );
      } else {
        setError(
          kind === "submit"
            ? localText(
                webWordlist,
                "webWordlistDetail:could_not_request_publication_reload_and_try_again"
              )
            : localText(
                webWordlist,
                "webWordlistDetail:could_not_withdraw_reload_and_try_again"
              )
        );
      }
    } finally {
      setBusy(false);
    }
  }
  const back = {
    href: mine ? "/account/wordlists" : "/wordlists",
    label: uiText("webWordlistDetail:back_to_word_list")
  };
  if (meta.isError)
    return (
      <PageShell size="lg" embedded={embedded}>
        <PageHeader back={back} title={uiText("webWordlistDetail:word_list")} />
        <PageNotice tone="error">
          {uiText(
            "webWordlistDetail:the_word_list_does_not_exist_is_inaccessible_or_cannot_be_loaded"
          )}
          <button
            className={textButtonClass}
            onClick={() => void meta.refetch()}
          >
            {uiText("webWordlistDetail:retry")}
          </button>
        </PageNotice>
      </PageShell>
    );
  if (!meta.data)
    return (
      <PageShell size="lg" embedded={embedded}>
        <PageNotice>{uiText("webWordlistDetail:loading_word_list")}</PageNotice>
      </PageShell>
    );
  const list = meta.data;
  return (
    <PageShell size="xl" embedded={embedded}>
      <PageHeader
        back={embedded ? undefined : back}
        eyebrow={
          embedded
            ? undefined
            : mine
              ? uiText("webWordlistDetail:my_word_lists")
              : uiText("webWordlistDetail:word_list_library")
        }
        title={list.name}
        description={
          <span className="break-words">
            {uiText("webWordlistDetail:v0_v1_v2_entries", {
              v0: list.owner_name,
              v1: uiText(stateMessages[list.state]),
              v2: list.item_count
            })}
          </span>
        }
        actions={
          <>
            <Button asChild>
              <Link
                href={`/student/practice/new?${new URLSearchParams({ wordlist: id, source: mine ? "owned" : "public" })}`}
              >
                {uiText("webWordlistDetail:start_practice")}
              </Link>
            </Button>
            {mine && (
              <Button asChild variant="outline">
                <Link href={editHref ?? `/account/wordlists/${id}/edit`}>
                  {list.state === "pending" || list.state === "published"
                    ? uiText("webWordlistDetail:view_and_edit")
                    : uiText("webWordlistDetail:edit_word_list")}
                </Link>
              </Button>
            )}
          </>
        }
      />
      <section className="border-b border-border/70 pb-5">
        <div>
          <h2 className="sr-only">
            {uiText("webWordlistDetail:word_list_overview")}
          </h2>
          <div className="flex flex-wrap gap-2 empty:hidden">
            {mine ? (
              <>
                {list.state === "pending" || list.state === "published" ? (
                  <button
                    className={buttonClass}
                    disabled={busy}
                    onClick={() => void action("withdraw")}
                  >
                    {busy
                      ? uiText("webWordlistDetail:processing")
                      : uiText("webWordlistDetail:withdraw_to_private")}
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
                    {busy
                      ? uiText("webWordlistDetail:submitting")
                      : uiText("webWordlistDetail:request_publication")}
                  </button>
                )}
                {list.state === "published" && (
                  <Link className={buttonClass} href={`/wordlists/${id}`}>
                    {uiText("webWordlistDetail:view_public_page")}
                  </Link>
                )}
              </>
            ) : (
              list.owner_user_id === userId && (
                <Link className={buttonClass} href={`/account/wordlists/${id}`}>
                  {uiText("webWordlistDetail:manage_my_word_lists")}
                </Link>
              )
            )}
          </div>
          {mine &&
            list.state !== "published" &&
            (list.state === "pending" || canSubmit) && (
              <p className="mt-4 text-sm leading-6 text-foreground-muted">
                {list.state === "pending"
                  ? uiText(
                      "webWordlistDetail:publication_is_under_review_only_you_can_view_the_list_until_approved"
                    )
                  : uiText(
                      "webWordlistDetail:once_approved_other_users_can_find_and_use_this_list"
                    )}
              </p>
            )}
          {showPublicationCheck && !canSubmit && (
            <p
              id="publication-availability-message"
              role="status"
              className="mt-4 text-sm text-foreground-muted"
            >
              {publicationHasUnavailable
                ? uiText(
                    "webWordlistDetail:remove_or_replace_unavailable_entries_before_requesting_publication"
                  )
                : availability.isError ||
                    (availability.isSuccess && !availabilityData)
                  ? uiText(
                      "webWordlistDetail:could_not_confirm_all_entries_are_available_retry_below_before_applying"
                    )
                  : uiText(
                      "webWordlistDetail:checking_entry_availability_please_wait"
                    )}
            </p>
          )}
          {error && (
            <p role="alert" className="mt-4 text-sm text-danger">
              {uiText(error)}
            </p>
          )}
          {mine && reviews.data?.withdraw_reason && (
            <p className="mt-4 rounded-2xl bg-muted/70 px-4 py-3 text-sm leading-6">
              {uiText("webWordlistDetail:withdrawal_reason_v0", {
                v0: reviews.data.withdraw_reason
              })}
            </p>
          )}
          {mine && reviews.data?.items[0]?.reason && (
            <p className="mt-4 rounded-2xl bg-muted/70 px-4 py-3 text-sm leading-6">
              {uiText("webWordlistDetail:review_comments_v0", {
                v0: reviews.data.items[0].reason
              })}
            </p>
          )}
          {mine && reviews.isError && (
            <p role="alert" className="mt-4 text-sm text-danger">
              {uiText("webWordlistDetail:could_not_load_review_history")}
            </p>
          )}
          {availabilityData && (
            <p className="mt-4 text-sm text-foreground-muted">
              {uiText(
                "webWordlistDetail:entire_word_list_v0_available_entries",
                {
                  v0: availabilityData.available_count
                }
              )}
              {!!availabilityData.custom_count &&
                uiText(
                  "webWordlistDetail:including_v0_custom_entries_eligible_for_spelling_practice",
                  {
                    v0: availabilityData.custom_count
                  }
                )}
              {availabilityData.unavailable_count > 0 &&
                uiText(
                  "webWordlistDetail:v0_unavailable_and_excluded_from_questions",
                  {
                    v0: availabilityData.unavailable_count
                  }
                )}
            </p>
          )}
          {(availability.isError ||
            (availability.isSuccess && !availabilityData)) && (
            <p role="alert" className="mt-4 text-sm text-foreground-muted">
              {availabilityVersionChanged
                ? uiText("webWordlistDetail:the_word_list_changed_reload_it")
                : uiText(
                    "webWordlistDetail:could_not_read_the_available_count_loaded_entries_can_still_be_read"
                  )}{" "}
              <button
                className={textButtonClass}
                disabled={availabilityFetching}
                onClick={() =>
                  void (availabilityVersionChanged
                    ? reloadWordlist()
                    : refetchAvailability())
                }
              >
                {availabilityVersionChanged
                  ? uiText("webWordlistDetail:reload_word_list")
                  : uiText("webWordlistDetail:retry")}
              </button>
            </p>
          )}
          {!mine && list.state === "published" && (
            <DetailInteractions list={list} />
          )}
        </div>
      </section>
      <div className="mb-5 mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <SearchField
          className="min-w-40 flex-1 sm:max-w-sm"
          aria-label={uiText("webWordlistDetail:search_entries")}
          placeholder={uiText("webWordlistDetail:search_spellings")}
          value={query}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={(event) => {
            setComposing(false);
            setQuery(event.currentTarget.value);
          }}
          onValueChange={setQuery}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            label={uiText("webWordlistDetail:reading_mode")}
            value={view}
            options={[
              { value: "simple", label: uiText("webWordlistDetail:compact") },
              {
                value: "standard",
                label: uiText("webWordlistDetail:standard")
              },
              { value: "full", label: uiText("webWordlistDetail:full") }
            ]}
            onChange={setView}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className={buttonClass}>
                {uiText("webWordlistDetail:sort_v0", {
                  v0: uiText(SORT_LABELS[sort])
                })}
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
                  {uiText(label)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {ready && (
            <span className="rounded-full bg-muted px-3 py-1.5 text-xs font-medium tracking-wide text-foreground-muted">
              {uiText("webWordlistDetail:definition_level_v0_v1", {
                v0: level,
                v1:
                  !profile.data?.learning_settings &&
                  identity.identity !== "teacher"
                    ? uiText("webWordlistDetail:preview_suffix")
                    : ""
              })}
            </span>
          )}
        </div>
      </div>
      {updatingSearch && (
        <p role="status" className="mb-5 text-xs text-foreground-muted">
          {uiText("webWordlistDetail:searching")}
        </p>
      )}
      {!ready ? (
        profile.isError || identity.error ? (
          <PageNotice tone="error">
            {uiText(
              "webWordlistDetail:could_not_read_reading_settings_reload_definitions_for_unconfirmed_level"
            )}
          </PageNotice>
        ) : (
          <PageNotice>
            {uiText("webWordlistDetail:loading_reading_settings")}
          </PageNotice>
        )
      ) : items.isError && loadedItems.length === 0 ? (
        <PageNotice tone="error">
          {view === "full"
            ? uiText(
                "webWordlistDetail:full_content_is_unavailable_switch_to_standard_mode_or"
              )
            : uiText("webWordlistDetail:could_not_load_entries")}
          <button
            className={textButtonClass}
            disabled={items.isFetching}
            onClick={() => void items.refetch()}
          >
            {items.isFetching
              ? uiText("webWordlistDetail:retrying")
              : uiText("webWordlistDetail:retry")}
          </button>
          。
        </PageNotice>
      ) : !items.data ? (
        <PageNotice>{uiText("webWordlistDetail:loading_entries")}</PageNotice>
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
                {uiText("webWordlistDetail:view_unavailable_entries")}
                {availabilityData
                  ? uiText("webWordlistDetail:v0_in_the_entire_list", {
                      v0: availabilityData.unavailable_count
                    })
                  : uiText("webWordlistDetail:v0_loaded", {
                      v0: unavailableItems.length
                    })}
              </summary>
              <p className="mt-3 text-foreground-muted">
                {uiText(
                  "webWordlistDetail:references_and_notes_are_preserved_reading_resumes_when_entries_return"
                )}
              </p>
              {mine && (
                <p className="mt-2">
                  <Link
                    className={textButtonClass}
                    href={editHref ?? `/account/wordlists/${id}/edit`}
                  >
                    {uiText("webWordlistDetail:remove_or_replace")}
                  </Link>
                  {(list.state === "published" || list.state === "pending") &&
                    uiText(
                      "webWordlistDetail:withdraw_to_private_before_editing_the_list"
                    )}
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
                      {uiText(
                        "webWordlistDetail:original_position_v0_entry_unavailable",
                        {
                          v0: item.position + 1
                        }
                      )}
                      {mine && (item as MyWordlistItem).unavailable_reason && (
                        <p className="text-foreground-muted">
                          {uiText("webWordlistDetail:reason_v0", {
                            v0: uiText(
                              unavailableReasonMessages[
                                (item as MyWordlistItem).unavailable_reason!
                              ]
                            )
                          })}
                        </p>
                      )}
                      {item.author_note && (
                        <p className="whitespace-pre-wrap">
                          {uiText("webWordlistDetail:note_v0", {
                            v0: item.author_note
                          })}
                        </p>
                      )}
                      {mine &&
                        "private_note" in item &&
                        (item as MyWordlistItem).private_note && (
                          <p className="whitespace-pre-wrap rounded-2xl border border-dashed border-border px-4 py-3 text-foreground-muted">
                            {uiText("webWordlistDetail:private_note_v0", {
                              v0: (item as MyWordlistItem).private_note
                            })}
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
                      ? uiText(
                          "webWordlistDetail:load_more_unavailable_entries"
                        )
                      : uiText(
                          "webWordlistDetail:load_more_entries_to_see_reasons"
                        )}
                  </button>
                )}
              {(availabilityData?.unavailable_count ?? 0) >
                unavailableItems.length && (
                <p className="mt-2 text-foreground-muted">
                  {uiText(
                    "webWordlistDetail:only_loaded_items_matching_the_current_search_are_shown_here_other_items"
                  )}
                  {showPublicationCheck && q.trim() && (
                    <button
                      className={textButtonClass}
                      onClick={() => {
                        setQuery("");
                        setQ("");
                      }}
                    >
                      {uiText("webWordlistDetail:clear_search_to_see_reasons")}
                    </button>
                  )}
                </p>
              )}
            </details>
          )}
          {audio.isError && customIds.length > 0 && (
            <p role="status" className="mb-4 text-sm text-foreground-muted">
              {uiText(
                "webWordlistDetail:audio_is_unavailable_the_list_content_can_still_be_read"
              )}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => void audio.refetch()}
              >
                {uiText("webWordlistDetail:retry_loading_audio")}
              </Button>
            </p>
          )}
          <div aria-busy={updatingSearch}>
            <ReadingTable full={view === "full"} simple={view === "simple"}>
              {loadedItems.map((item) =>
                item.entry || item.custom_word ? (
                  <tbody
                    key={item.item_id ?? item.entry_id}
                    className="break-words border-b border-border/60 last:border-b-0"
                  >
                    {item.custom_word ? (
                      <tr>
                        <td className="sticky left-0 z-10 border-r border-border/60 bg-surface">
                          <h2 className="tsz-words break-words text-xl font-bold tracking-tight">
                            {item.custom_word.word}
                          </h2>
                          {audioByItem.get(item.item_id!)?.word ===
                            wordlistAudioWord(item.custom_word.word) &&
                            (audioByItem.get(item.item_id!)?.status ===
                            "ready" ? (
                              <div className="flex flex-wrap items-center gap-3">
                                {locales.map((locale) => (
                                  <span
                                    key={locale}
                                    className="inline-flex items-center text-xs text-foreground-muted"
                                  >
                                    {locale === "en-GB"
                                      ? uiText("webWordlistDetail:british")
                                      : uiText("webWordlistDetail:american")}
                                    <AudioButton
                                      label={uiText(
                                        "webWordlistDetail:play_v0_v1_audio",
                                        {
                                          v0: item.custom_word!.word,
                                          v1: uiText(
                                            locale === "en-GB"
                                              ? "webWordlistDetail:british"
                                              : "webWordlistDetail:american"
                                          )
                                        }
                                      )}
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
                                {uiText(
                                  audioStatusMessages[
                                    audioByItem.get(item.item_id!)!.status
                                  ]
                                )}
                              </p>
                            ))}
                          <p className="mt-2 text-xs text-foreground-muted">
                            {uiText("webWordlistDetail:custom_entry")}
                          </p>
                        </td>
                        <td />
                        {view === "full" && (
                          <>
                            <td />
                            <td />
                          </>
                        )}
                        <td className="whitespace-pre-wrap">
                          {item.custom_word.definition}
                        </td>
                        {view !== "simple" && <td />}
                      </tr>
                    ) : (
                      item.entry && (
                        <ReadingEntry
                          full={view === "full"}
                          simple={view === "simple"}
                          entry={item.entry}
                          level={level}
                          variant={variant}
                        />
                      )
                    )}
                    {!!(
                      item.author_note ||
                      (mine && "private_note" in item && item.private_note)
                    ) && (
                      <tr>
                        <td
                          colSpan={
                            view === "full" ? 6 : view === "simple" ? 3 : 4
                          }
                        >
                          {item.author_note && (
                            <p className="whitespace-pre-wrap rounded-2xl bg-muted/70 px-4 py-3">
                              {uiText("webWordlistDetail:note_v0", {
                                v0: item.author_note
                              })}
                            </p>
                          )}
                          {mine &&
                            "private_note" in item &&
                            (item as MyWordlistItem).private_note && (
                              <p className="mt-3 whitespace-pre-wrap rounded-2xl border border-dashed border-border px-4 py-3 text-foreground-muted">
                                {uiText("webWordlistDetail:private_note_v0", {
                                  v0: (item as MyWordlistItem).private_note
                                })}
                              </p>
                            )}
                        </td>
                      </tr>
                    )}
                  </tbody>
                ) : null
              )}
            </ReadingTable>
          </div>
          {loadedItems.length > 0 &&
            loadedItems.every((item) => !item.entry && !item.custom_word) && (
              <PageNotice>
                {uiText("webWordlistDetail:all_loaded_entries_are_unavailable")}
              </PageNotice>
            )}
          {loadedItems.length === 0 ? (
            <PageNotice>
              {q
                ? uiText("webWordlistDetail:no_matching_entries")
                : uiText("webWordlistDetail:no_entries_yet")}
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
                  {uiText("webWordlistDetail:clear_search")}
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
                  {items.error instanceof WordlistContentChangedError
                    ? uiText(CONTENT_CHANGED)
                    : uiText(
                        "webWordlistDetail:could_not_load_more_entries_loaded_content_can_still_be_read"
                      )}{" "}
                  <button
                    className={textButtonClass}
                    disabled={items.isFetching}
                    onClick={() =>
                      void (items.isFetchNextPageError &&
                      !(items.error instanceof WordlistContentChangedError)
                        ? items.fetchNextPage({ cancelRefetch: false })
                        : items.refetch())
                    }
                  >
                    {items.error instanceof WordlistContentChangedError
                      ? uiText("webWordlistDetail:reload")
                      : uiText("webWordlistDetail:retry")}
                  </button>
                </p>
              ) : (
                <p role="status">
                  {items.isFetchingNextPage
                    ? uiText("webWordlistDetail:loading_more_entries")
                    : items.hasNextPage
                      ? allUnavailable
                        ? uiText(
                            "webWordlistDetail:expand_the_list_above_to_load_unavailable_entries_as_needed"
                          )
                        : uiText(
                            "webWordlistDetail:scroll_down_to_load_more_entries_automatically"
                          )
                      : uiText("webWordlistDetail:all_v0_entries_loaded", {
                          v0: loadedItems.length
                        })}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}

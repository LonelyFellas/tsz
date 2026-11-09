"use client";
import { localText } from "@/i18n/catalog";
import { useWebText } from "@/i18n/client";
import { webWordlistBrowser as webWordlist } from "@/i18n/messages/wordlist/browser";

import Link from "next/link";
import { useState } from "react";
import { Plus } from "lucide-react";
import { SearchField } from "@/features/shell/SearchField";
import { useWordlistInteractions } from "../hooks/useWordlistInteractions";
import { WordlistInteractions } from "./WordlistInteractions";
import { WordlistFavorites } from "./WordlistFavorites";
import { useWordLists } from "../hooks/useWordLists";
import { cn } from "@tsz/ui/lib/cn";
import { buttonClass, primaryButtonClass } from "../reading";
import {
  PageHeader,
  PageNotice,
  PageShell,
  Pager,
  Segmented,
  listCardClass
} from "@/features/shell/Page";

const stateMessages = {
  draft: localText(webWordlist, "webWordlistBrowser:private_draft"),
  pending: localText(webWordlist, "webWordlistBrowser:pending_review"),
  published: localText(webWordlist, "webWordlistBrowser:published"),
  rejected: localText(webWordlist, "webWordlistBrowser:rejected"),
  withdrawn: localText(webWordlist, "webWordlistBrowser:withdrawn")
};
export function WordListBrowser({ mine = false }: { mine?: boolean }) {
  const uiText = useWebText(webWordlist);
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
        eyebrow={
          mine
            ? uiText("webWordlistBrowser:my_learning")
            : uiText("webWordlistBrowser:word_list_library")
        }
        title={
          mine
            ? uiText("webWordlistBrowser:my_word_lists")
            : uiText("webWordlistBrowser:public_word_lists")
        }
        description={
          mine
            ? uiText(
                "webWordlistBrowser:manage_your_own_and_favourited_lists_favourites_refer_to_the_original_li"
              )
            : uiText(
                "webWordlistBrowser:browse_recommended_and_public_word_lists_and_choose_one_to_start_learnin"
              )
        }
        actions={
          <>
            <Link
              className={buttonClass}
              href={mine ? "/wordlists" : "/account/wordlists"}
            >
              {mine
                ? uiText("webWordlistBrowser:browse_public_word_lists")
                : uiText("webWordlistBrowser:my_word_lists")}
            </Link>
            <Link
              className={cn(primaryButtonClass, "min-h-10 px-5")}
              href="/wordlists/new"
            >
              <Plus className="size-4" strokeWidth={2} aria-hidden />
              {uiText("webWordlistBrowser:create_word_list")}
            </Link>
          </>
        }
      />
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center">
        {mine && (
          <Segmented
            label={uiText("webWordlistBrowser:my_word_list_categories")}
            value={favorites}
            options={[
              { value: false, label: uiText("webWordlistBrowser:create") },
              { value: true, label: uiText("webWordlistBrowser:favourites") }
            ]}
            onChange={(value) => {
              setFavorites(value);
              setPage(1);
            }}
          />
        )}
        {!mine && (
          <Segmented
            label={uiText("webWordlistBrowser:word_list_categories")}
            value={recommended}
            options={[
              {
                value: false,
                label: uiText("webWordlistBrowser:all_public_word_lists")
              },
              { value: true, label: uiText("webWordlistBrowser:recommended") }
            ]}
            onChange={(value) => {
              setRecommended(value);
              setPage(1);
            }}
          />
        )}
        <SearchField
          className="flex-1"
          aria-label={uiText("webWordlistBrowser:search_word_lists")}
          placeholder={uiText("webWordlistBrowser:search_word_list_names")}
          value={q}
          onValueChange={(value) => {
            setQ(value);
            setPage(1);
          }}
        />
      </div>
      {favorites ? (
        <WordlistFavorites page={page} q={q} onPageChange={setPage} />
      ) : result.isError ? (
        <PageNotice tone="error">
          {uiText("webWordlistBrowser:could_not_load_word_lists_please")}
          <button
            className="mx-1 font-medium text-primary underline-offset-4 hover:underline"
            onClick={() => void result.refetch()}
          >
            {uiText("webWordlistBrowser:retry")}
          </button>
          。
        </PageNotice>
      ) : result.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2" aria-busy>
          <p className="sr-only">
            {uiText("webWordlistBrowser:loading_word_lists")}
          </p>
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
              {q
                ? uiText("webWordlistBrowser:no_word_lists_contain_v0", {
                    v0: q
                  })
                : uiText("webWordlistBrowser:no_word_lists")}
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
                          {uiText(stateMessages[list.state])}
                        </span>
                      </div>
                      <p className="mt-6 flex items-baseline gap-1.5">
                        <span className="text-3xl font-bold tabular-nums tracking-tight text-foreground">
                          {list.item_count}
                        </span>
                        <span className="text-sm text-foreground-muted">
                          {uiText("webWordlistBrowser:entries_2", {
                            count: list.item_count
                          })}
                        </span>
                      </p>
                      <p className="mt-2 truncate text-sm text-foreground-muted">
                        {list.owner_user_id === null
                          ? uiText("webWordlistBrowser:platform_v0", {
                              v0: list.owner_name
                            })
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

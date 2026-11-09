"use client";
import { localText, type WebNotice } from "@/i18n/catalog";

import { useWebText } from "@/i18n/client";
import { webWordlistBrowser as webWordlist } from "@/i18n/messages/wordlist/browser";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";
import { PageNotice, Pager, panelClass } from "@/features/shell/Page";
import { buttonClass } from "../reading";
import { wordListKeys } from "../hooks/useWordLists";
import { useWordlistInteractions } from "../hooks/useWordlistInteractions";
import { WordlistInteractions } from "./WordlistInteractions";

export function WordlistFavorites(props: {
  page: number;
  q: string;
  onPageChange: (page: number) => void;
}) {
  const userId = useUserStore((s) => s.user?.id);
  return userId ? <Favorites key={userId} {...props} userId={userId} /> : null;
}
function Favorites({
  page,
  q,
  onPageChange,
  userId
}: {
  page: number;
  q: string;
  onPageChange: (page: number) => void;
  userId: string;
}) {
  const uiText = useWebText(webWordlist);
  const result = useQuery({
    queryKey: [...wordListKeys.mine(userId), "favorites", page, q],
    refetchOnMount: "always",
    queryFn: ({ signal }) => api.wordList.favorites({ page, q }, { signal })
  });
  const interactions = useWordlistInteractions(
    result.data?.items.flatMap((item) =>
      item.wordlist ? [item.wordlist_id] : []
    ) ?? []
  );
  if (result.isError)
    return (
      <PageNotice tone="error">
        {uiText("webWordlistBrowser:could_not_load_favourites")}
        <button
          type="button"
          className={buttonClass}
          onClick={() => void result.refetch()}
        >
          {uiText("webWordlistBrowser:retry")}
        </button>
      </PageNotice>
    );
  if (result.isPending)
    return (
      <PageNotice>{uiText("webWordlistBrowser:loading_favourites")}</PageNotice>
    );
  return (
    <>
      {!result.data.items.length ? (
        <PageNotice>
          {q
            ? uiText("webWordlistBrowser:no_matching_favourites")
            : uiText(
                "webWordlistBrowser:no_favourites_yet_browse_public_word_lists_and_save_some"
              )}
        </PageNotice>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {result.data.items.map(({ wordlist_id, wordlist }) => (
            <li key={wordlist_id} className={panelClass}>
              {wordlist ? (
                <>
                  <Link
                    href={`/wordlists/${wordlist.id}`}
                    className="block rounded-xl text-primary focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <h2 className="text-lg font-bold">{wordlist.name}</h2>
                  </Link>
                  <p className="mt-2 text-sm text-foreground-muted">
                    {uiText("webWordlistBrowser:v0_entries_v1", {
                      v0: wordlist.item_count,
                      v1: wordlist.owner_name
                    })}
                  </p>
                  <WordlistInteractions
                    list={wordlist}
                    stats={interactions.stats.data?.items.find(
                      (s) => s.wordlist_id === wordlist_id
                    )}
                    state={interactions.states.data?.items.find(
                      (s) => s.wordlist_id === wordlist_id
                    )}
                    tipState={interactions.tips.data?.items.find(
                      (s) => s.wordlist_id === wordlist_id
                    )}
                    tipFailed={interactions.tips.isError}
                    failed={
                      interactions.stats.isError || interactions.states.isError
                    }
                    onRetry={() => {
                      void interactions.stats.refetch();
                      void interactions.states.refetch();
                      void interactions.tips.refetch();
                    }}
                  />
                </>
              ) : (
                <UnavailableFavorite id={wordlist_id} userId={userId} />
              )}
            </li>
          ))}
        </ul>
      )}
      <Pager
        page={page}
        total={result.data.pagination.total_pages}
        onChange={onPageChange}
      />
    </>
  );
}
function UnavailableFavorite({ id, userId }: { id: string; userId: string }) {
  const uiText = useWebText(webWordlist);
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<WebNotice>("");
  async function remove() {
    if (busy || useUserStore.getState().user?.id !== userId) return;
    setBusy(true);
    setError("");
    try {
      await api.wordList.setInteraction(id, {
        kind: "favorite",
        active: false
      });
      if (useUserStore.getState().user?.id === userId)
        await client.invalidateQueries({ queryKey: wordListKeys.all });
    } catch {
      setError(
        localText(webWordlist, "webWordlistBrowser:could_not_remove_try_again")
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h2 className="font-medium">
        {uiText("webWordlistBrowser:word_list_unavailable")}
      </h2>
      <button
        type="button"
        className={`${buttonClass} mt-4`}
        disabled={busy}
        onClick={() => void remove()}
      >
        {busy
          ? uiText("webWordlistBrowser:removing")
          : uiText("webWordlistBrowser:remove_favourite")}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {uiText(error)}
        </p>
      )}
    </>
  );
}

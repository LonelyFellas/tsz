"use client";
import { LibraryDialog } from "./LibraryDialog";
import { LibraryFolderPicker } from "./LibraryFolderPicker";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Heart, Bookmark, Coins } from "lucide-react";
import type {
  Wordlist,
  WordlistInteractionState,
  WordlistInteractionStats,
  WordlistTipState
} from "@tsz/types";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";
import { wordListKeys } from "../hooks/useWordLists";
import { useWordlistInteractions } from "../hooks/useWordlistInteractions";
import { buttonClass } from "../reading";
import { TipPanel } from "./WordlistTips";

const interactionClass =
  "relative inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-sm px-1 text-sm tabular-nums text-foreground-muted transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-9 aria-pressed:text-primary after:pointer-events-none after:absolute after:left-1/2 after:top-full after:z-30 after:mt-1 after:-translate-x-1/2 after:whitespace-nowrap after:rounded-md after:bg-foreground after:px-2 after:py-1 after:text-xs after:font-normal after:text-background after:opacity-0 after:content-[attr(data-tooltip)] hover:after:opacity-100 focus:after:opacity-100";

export function WordlistInteractions(props: {
  list: Wordlist;
  stats?: WordlistInteractionStats;
  state?: WordlistInteractionState;
  tipState?: WordlistTipState;
  tipFailed?: boolean;
  failed: boolean;
  onRetry: () => void;
}) {
  const userId = useUserStore((s) => s.user?.id);
  return (
    <InteractionControls
      key={`${userId ?? "guest"}:${props.list.id}`}
      {...props}
      userId={userId}
    />
  );
}
function InteractionControls({
  list,
  stats,
  state,
  tipState,
  tipFailed = false,
  failed,
  onRetry,
  userId
}: {
  list: Wordlist;
  stats?: WordlistInteractionStats;
  state?: WordlistInteractionState;
  tipState?: WordlistTipState;
  tipFailed?: boolean;
  failed: boolean;
  onRetry: () => void;
  userId?: string;
}) {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tipOpen, setTipOpen] = useState(false);
  const [favoriteOpen, setFavoriteOpen] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const own = userId === list.owner_user_id;
  async function change(
    kind: "like" | "favorite",
    active: boolean,
    folderId?: string | null
  ) {
    if (
      request.current ||
      !userId ||
      useUserStore.getState().user?.id !== userId
    )
      return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    try {
      await api.wordList.setInteraction(
        list.id,
        { kind, active, ...(folderId ? { folder_id: folderId } : {}) },
        { signal: controller.signal }
      );
      if (
        controller.signal.aborted ||
        useUserStore.getState().user?.id !== userId
      )
        return;
      setFavoriteOpen(false);
      await client.invalidateQueries({ queryKey: wordListKeys.all });
    } catch {
      if (
        !controller.signal.aborted &&
        useUserStore.getState().user?.id === userId
      ) {
        setError("操作结果未确认，请刷新状态后重试。");
        onRetry();
      }
    } finally {
      if (!controller.signal.aborted) {
        request.current = null;
        setBusy(false);
      }
    }
  }
  const controls = [
    {
      kind: "like" as const,
      label: "点赞",
      activeLabel: "取消点赞",
      active: state?.liked,
      count: stats?.like_count,
      Icon: Heart
    },
    {
      kind: "favorite" as const,
      label: "收藏",
      activeLabel: "取消收藏",
      active: state?.favorited,
      count: stats?.favorite_count,
      Icon: Bookmark
    }
  ];
  return (
    <div className="mt-5">
      <div
        className="flex flex-wrap items-center gap-x-6 gap-y-1"
        aria-label="词表互动"
        aria-busy={busy}
      >
        {controls.map(({ kind, label, activeLabel, active, count, Icon }) =>
          userId ? (
            <button
              key={kind}
              type="button"
              className={interactionClass}
              data-tooltip={
                own ? `不能给自己的词表${label}` : active ? activeLabel : label
              }
              disabled={busy || own || !stats || !state || failed}
              aria-pressed={active ?? false}
              aria-label={
                own ? `不能给自己的词表${label}` : active ? activeLabel : label
              }
              onClick={() =>
                kind === "favorite"
                  ? setFavoriteOpen(true)
                  : void change(kind, !active)
              }
            >
              <Icon
                className={`size-5 ${active ? "fill-primary" : ""}`}
                aria-hidden
              />
              {count ?? "—"}
            </button>
          ) : (
            <Link
              key={kind}
              className={interactionClass}
              data-tooltip={`登录后${label}`}
              href={`/login?redirect=${encodeURIComponent(`/wordlists/${list.id}`)}`}
              aria-label={`登录后${label}`}
            >
              <Icon className="size-5" aria-hidden />
              {count ?? "—"}
            </Link>
          )
        )}
        {userId || list.owner_user_id === null ? (
          <button
            type="button"
            className={interactionClass}
            data-tooltip={
              list.owner_user_id === null
                ? "平台词表不可投币"
                : own
                  ? "不能给自己的词表投币"
                  : tipState && BigInt(tipState.tip_amount) > 0n
                    ? "已投币"
                    : "投币"
            }
            disabled={list.owner_user_id === null || own || !stats || busy}
            aria-haspopup="dialog"
            aria-expanded={tipOpen}
            aria-pressed={!!tipState && BigInt(tipState.tip_amount) > 0n}
            aria-label={
              own
                ? "不能给自己的词表投币"
                : `${tipState && BigInt(tipState.tip_amount) > 0n ? "已投币" : "投币"} ${stats?.tip_amount ?? "—"}`
            }
            onClick={() => setTipOpen(true)}
          >
            <Coins className="size-5" aria-hidden />
            {stats?.tip_amount ?? "—"}
          </button>
        ) : (
          <Link
            className={interactionClass}
            data-tooltip="登录后投币"
            href={`/login?redirect=${encodeURIComponent(`/wordlists/${list.id}`)}`}
            aria-label="登录后投币"
          >
            <Coins className="size-5" aria-hidden />
            {stats?.tip_amount ?? "—"}
          </Link>
        )}
      </div>
      {failed && (
        <p role="alert" className="mt-2 text-sm text-danger">
          互动状态加载失败。
          <button type="button" className={buttonClass} onClick={onRetry}>
            重试
          </button>
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
      {favoriteOpen && (
        <LibraryDialog
          title={state?.favorited ? "移入收藏回收站" : "收藏到文件夹"}
          busy={busy}
          onClose={() => setFavoriteOpen(false)}
        >
          {error && (
            <p role="alert" className="mb-3 text-sm text-danger">
              {error}
            </p>
          )}
          {state?.favorited ? (
            <>
              <p className="mb-4">这份收藏将移入「收藏」回收站，可以恢复。</p>
              <button
                disabled={busy}
                className={buttonClass}
                onClick={() => void change("favorite", false)}
              >
                确认移入回收站
              </button>
              <Link
                className={buttonClass}
                href={`/account/wordlists?space=favorites&wordlist=${list.id}`}
              >
                定位已收藏词表
              </Link>
            </>
          ) : (
            <LibraryFolderPicker
              space="favorites"
              busy={busy}
              onPick={(folder) => void change("favorite", true, folder)}
            />
          )}
        </LibraryDialog>
      )}
      {tipOpen && (
        <TipPanel
          list={list}
          tipped={tipState?.tip_amount}
          failed={tipFailed}
          onRetry={onRetry}
          onClose={() => setTipOpen(false)}
        />
      )}
    </div>
  );
}
export function DetailInteractions({ list }: { list: Wordlist }) {
  const { stats, states, tips, userId } = useWordlistInteractions([list.id]);
  return (
    <WordlistInteractions
      list={list}
      stats={stats.data?.items[0]}
      state={states.data?.items[0]}
      tipState={tips.data?.items[0]}
      tipFailed={tips.isError}
      failed={stats.isError || (!!userId && states.isError)}
      onRetry={() => {
        void stats.refetch();
        if (userId) {
          void states.refetch();
          void tips.refetch();
        }
      }}
    />
  );
}

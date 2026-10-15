"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Heart, Bookmark, Coins } from "lucide-react";
import type {
  Wordlist,
  WordlistInteractionState,
  WordlistInteractionStats
} from "@tsz/types";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";
import { wordListKeys } from "../hooks/useWordLists";
import { useWordlistInteractions } from "../hooks/useWordlistInteractions";
import { buttonClass } from "../reading";
import { TipPanel } from "./WordlistTips";

export function WordlistInteractions(props: {
  list: Wordlist;
  stats?: WordlistInteractionStats;
  state?: WordlistInteractionState;
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
  failed,
  onRetry,
  userId
}: {
  list: Wordlist;
  stats?: WordlistInteractionStats;
  state?: WordlistInteractionState;
  failed: boolean;
  onRetry: () => void;
  userId?: string;
}) {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tipOpen, setTipOpen] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const own = userId === list.owner_user_id;
  async function change(kind: "like" | "favorite", active: boolean) {
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
        { kind, active },
        { signal: controller.signal }
      );
      if (
        controller.signal.aborted ||
        useUserStore.getState().user?.id !== userId
      )
        return;
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
      <div className="flex flex-wrap gap-2" aria-label="词表互动">
        {controls.map(({ kind, label, activeLabel, active, count, Icon }) =>
          userId ? (
            <button
              key={kind}
              type="button"
              className={buttonClass}
              disabled={busy || own || !stats || !state || failed}
              aria-pressed={active ?? false}
              aria-label={
                own ? `不能给自己的词表${label}` : active ? activeLabel : label
              }
              onClick={() => void change(kind, !active)}
            >
              <Icon
                className={`size-4 ${active ? "fill-primary text-primary" : ""}`}
                aria-hidden
              />
              {label} {count ?? "—"}
            </button>
          ) : (
            <Link
              key={kind}
              className={buttonClass}
              href={`/login?redirect=${encodeURIComponent(`/wordlists/${list.id}`)}`}
              aria-label={`登录后${label}`}
            >
              <Icon className="size-4" aria-hidden />
              {label} {count ?? "—"}
            </Link>
          )
        )}
        <button
          type="button"
          className={buttonClass}
          disabled={list.owner_user_id === null || own || !stats}
          aria-expanded={tipOpen}
          onClick={() => setTipOpen(!tipOpen)}
        >
          <Coins className="size-4" aria-hidden />
          投币 {stats?.tip_amount ?? "—"}
        </button>
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
      {tipOpen && <TipPanel list={list} />}
    </div>
  );
}
export function DetailInteractions({ list }: { list: Wordlist }) {
  const { stats, states, userId } = useWordlistInteractions([list.id]);
  return (
    <WordlistInteractions
      list={list}
      stats={stats.data?.items[0]}
      state={states.data?.items[0]}
      failed={stats.isError || (!!userId && states.isError)}
      onRetry={() => {
        void stats.refetch();
        if (userId) void states.refetch();
      }}
    />
  );
}

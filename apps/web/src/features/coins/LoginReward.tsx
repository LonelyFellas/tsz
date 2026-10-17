"use client";

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HttpError } from "@tsz/api-client";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";

function useLoginReward() {
  const user = useUserStore((s) => s.user);
  const hydrated = useUserStore((s) => s.hydrated);
  const connectionError = useUserStore((s) => s.connectionError);
  const refreshUnconfirmed = useUserStore((s) => s.refreshUnconfirmed);
  return useQuery({
    queryKey: ["login-reward", user?.id],
    enabled:
      hydrated && !!user?.phone && !connectionError && !refreshUnconfirmed,
    queryFn: ({ signal }) => api.loginReward.claim({ signal }),
    staleTime: (query) =>
      query.state.data?.status === "awarded"
        ? Math.min(
            60_000,
            Date.parse(query.state.data.next_day_starts_at) -
              Date.parse(query.state.data.server_time)
          )
        : 0,
    retry: (count, error) =>
      count < 2 &&
      (!(error instanceof HttpError) ||
        error.status >= 500 ||
        error.status === 409),
    refetchInterval: (query) => {
      const d = query.state.data;
      if (!d || query.state.status === "error") return false;
      // Use server time + elapsed client duration, not the client's timezone/clock offset.
      return Math.max(
        1000,
        query.state.dataUpdatedAt +
          Date.parse(d.next_day_starts_at) -
          Date.parse(d.server_time) -
          Date.now() +
          100
      );
    },
    refetchIntervalInBackground: false
  });
}

/** Business side effect after session restoration; never changes auth or blocks login. */
export function DailyLoginReward() {
  const id = useUserStore((s) => s.user?.id);
  const q = useLoginReward();
  const client = useQueryClient();
  const seen = useRef<string | null>(null);
  const operation = !q.isError ? q.data?.operation_id : null;
  useEffect(() => {
    if (
      !id ||
      !operation ||
      seen.current === operation ||
      useUserStore.getState().user?.id !== id
    )
      return;
    seen.current = operation;
    void client.invalidateQueries({ queryKey: ["coins", "user", id] });
  }, [id, operation, client]);
  return null;
}

export function LoginRewardSummary({ onAward }: { onAward?: () => void }) {
  const q = useLoginReward();
  const phone = useUserStore((s) => s.user?.phone);
  const seen = useRef<string | null>(null);
  const operation = !q.isError ? q.data?.operation_id : null;
  useEffect(() => {
    if (!operation || seen.current === operation) return;
    seen.current = operation;
    onAward?.();
  }, [operation, onAward]);
  return (
    <section
      aria-label="每日登录奖励"
      className="glass space-y-3 rounded-3xl p-5 sm:p-6"
    >
      <h2 className="text-base font-bold tracking-tight text-foreground">
        每日登录奖励
      </h2>
      {!phone ? (
        <p className="text-sm text-foreground-muted">
          绑定手机号后，每日首次访问自动领取 1 天生币。
        </p>
      ) : q.isError ? (
        <p role="alert" className="text-sm text-foreground-muted">
          {q.error instanceof HttpError && q.error.status === 404
            ? "登录奖励功能尚未就绪。"
            : "登录奖励结算暂未确认，登录和学习不受影响。"}
          <button
            className="ml-2 font-medium text-primary hover:underline"
            onClick={() => void q.refetch()}
          >
            重试
          </button>
        </p>
      ) : !q.data ? (
        <p className="text-sm text-foreground-muted">正在确认今日登录奖励…</p>
      ) : q.data.status === "awarded" ? (
        <p role="status" className="text-sm font-medium text-success">
          {q.data.business_day} 登录奖励已到账 1 天生币。
        </p>
      ) : (
        <p role="status" className="text-sm text-foreground-muted">
          钱包暂停或关闭，暂不能获得登录奖励；恢复后当天再次访问可领取。
        </p>
      )}
      <p className="text-xs leading-5 text-foreground-muted">
        北京时间 04:00 换日，每个账号每天最多 1
        币；保持登录也可获得，无需退出重登。
      </p>
    </section>
  );
}

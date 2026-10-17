"use client";

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { LoginRewardDay } from "@tsz/types";
import { HttpError } from "@tsz/api-client";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";

function useLoginReward() {
  const user = useUserStore((s) => s.user);
  return useQuery({
    queryKey: ["login-reward", user?.id],
    // Settlement is a write: only the visit/activity bridge or an explicit retry may trigger it.
    enabled: false,
    queryFn: ({ signal }) => api.loginReward.claim({ signal }),
    retry: (count, error) =>
      count < 2 &&
      (!(error instanceof HttpError) ||
        error.status >= 500 ||
        error.status === 409)
  });
}

/** Business side effect after session restoration; never changes auth or blocks login. */
export function DailyLoginReward() {
  const id = useUserStore((s) => s.user?.id);
  const eligible = useUserStore(
    (s) =>
      s.hydrated &&
      !!s.user?.phone &&
      !s.connectionError &&
      !s.refreshUnconfirmed
  );
  const q = useLoginReward();
  const client = useQueryClient();
  const refetch = q.refetch;
  useEffect(() => {
    if (!id || !eligible) return;
    let lastAttempt = -Infinity;
    const visit = (event?: Event) => {
      const session = useUserStore.getState();
      if (
        document.visibilityState !== "visible" ||
        session.user?.id !== id ||
        !session.hydrated ||
        !session.user?.phone ||
        session.connectionError ||
        session.refreshUnconfirmed
      )
        return;
      const state = client.getQueryState<LoginRewardDay>(["login-reward", id]);
      if (state?.fetchStatus === "fetching") return;
      const data = state?.data;
      if (
        data?.status === "awarded" &&
        Date.now() <
          state!.dataUpdatedAt +
            Date.parse(data.next_day_starts_at) -
            Date.parse(data.server_time)
      )
        return;
      const returning =
        !event || event.type === "focus" || event.type === "visibilitychange";
      if (
        !returning &&
        (data?.status !== "awarded" || state?.status === "error") &&
        Date.now() - lastAttempt < 60_000
      )
        return;
      lastAttempt = Date.now();
      void refetch({ cancelRefetch: false });
    };
    visit();
    window.addEventListener("focus", visit);
    window.addEventListener("pointerdown", visit);
    window.addEventListener("keydown", visit);
    window.addEventListener("wheel", visit, { passive: true });
    document.addEventListener("visibilitychange", visit);
    return () => {
      window.removeEventListener("focus", visit);
      window.removeEventListener("pointerdown", visit);
      window.removeEventListener("keydown", visit);
      window.removeEventListener("wheel", visit);
      document.removeEventListener("visibilitychange", visit);
    };
  }, [id, eligible, client, refetch]);
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
    void client.invalidateQueries({ queryKey: ["learning-rewards", id] });
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
      ) : q.data.status === "reward_disabled" ? (
        <p className="text-sm text-foreground-muted">每日登录奖励暂未开启。</p>
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
        币；当天打开、返回页面或操作时自动结算，无需退出重登。
      </p>
    </section>
  );
}

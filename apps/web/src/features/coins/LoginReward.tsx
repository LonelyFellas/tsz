"use client";
import { useWebText } from "@/i18n/client";
import { webCoinsRewards as webCoins } from "@/i18n/messages/coins/rewards";

import { useEffect, useRef } from "react";
import { CalendarCheck, Check, ChevronDown } from "lucide-react";
import { Button } from "@tsz/ui/components";
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
      const nextDay = data
        ? state!.dataUpdatedAt +
          Date.parse(data.next_day_starts_at) -
          Date.parse(data.server_time)
        : Infinity;
      const now = Date.now();
      if (data?.status === "awarded" && now < nextDay) return;
      // A previous-day disabled/error attempt must not suppress the first visit of a new day.
      const crossedDay = now >= nextDay && lastAttempt < nextDay;
      const returning =
        !event || event.type === "focus" || event.type === "visibilitychange";
      if (
        !returning &&
        !crossedDay &&
        (data?.status !== "awarded" || state?.status === "error") &&
        now - lastAttempt < 60_000
      )
        return;
      lastAttempt = now;
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
  const uiText = useWebText(webCoins);
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
      aria-label={uiText("webCoinsRewards:daily_sign_in_reward")}
      className="min-w-0 space-y-3"
    >
      <div className="flex items-center gap-2 text-foreground">
        <CalendarCheck
          className="size-4 text-foreground-muted"
          strokeWidth={1.8}
          aria-hidden
        />
        <h3 className="text-sm font-medium">
          {uiText("webCoinsRewards:daily_sign_in_reward")}
        </h3>
      </div>
      {!phone ? (
        <p className="text-sm text-foreground-muted">
          {uiText(
            "webCoinsRewards:bind_a_phone_number_to_receive_1_automatically_on_your_first_visit_each"
          )}
        </p>
      ) : q.isError ? (
        <p role="alert" className="text-sm text-foreground-muted">
          {q.error instanceof HttpError && q.error.status === 404
            ? uiText("webCoinsRewards:login_rewards_are_not_available_yet")
            : uiText(
                "webCoinsRewards:login_reward_settlement_is_unconfirmed_sign_in_and_learning_are_unaffect"
              )}
          <Button
            type="button"
            variant="link"
            size="compact"
            disabled={q.isFetching}
            onClick={() => void q.refetch()}
          >
            {uiText("webCoinsRewards:retry")}
          </Button>
        </p>
      ) : !q.data ? (
        <p className="text-sm text-foreground-muted">
          {uiText("webCoinsRewards:checking_today_s_login_reward")}
        </p>
      ) : q.data.status === "reward_disabled" ? (
        <p className="text-sm text-foreground-muted">
          {uiText("webCoinsRewards:daily_login_rewards_are_disabled")}
        </p>
      ) : q.data.status === "awarded" ? (
        <p
          role="status"
          className="flex items-start gap-1.5 text-sm leading-6 text-foreground"
        >
          <Check
            className="mt-1 size-4 shrink-0 text-success"
            strokeWidth={1.8}
            aria-hidden
          />
          <span>
            {uiText("webCoinsRewards:v0_login_reward_credited_1", {
              v0: q.data.business_day
            })}
          </span>
        </p>
      ) : (
        <p role="status" className="text-sm text-foreground-muted">
          {uiText(
            "webCoinsRewards:your_wallet_is_paused_or_closed_so_login_rewards_are_unavailable_visit_a"
          )}
        </p>
      )}
      <details className="group/login-rules">
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-sm text-xs text-foreground-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary sm:min-h-8 [&::-webkit-details-marker]:hidden">
          {uiText("webCoinsRewards:login_reward_rules")}
          <ChevronDown
            className="size-3.5 group-open/login-rules:rotate-180"
            aria-hidden
          />
        </summary>
        <p className="mt-1 text-xs leading-5 text-foreground-muted">
          {uiText(
            "webCoinsRewards:the_business_day_changes_at_04_00_beijing_time_each_account_can_receive"
          )}
        </p>
      </details>
    </section>
  );
}

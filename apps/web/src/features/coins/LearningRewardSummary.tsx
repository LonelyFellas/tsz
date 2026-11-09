"use client";
import { useWebText } from "@/i18n/client";
import { webCoinsRewards as webCoins } from "@/i18n/messages/coins/rewards";

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HttpError } from "@tsz/api-client";
import { formatCoins } from "@tsz/shared";
import { Button } from "@tsz/ui/components";
import Link from "next/link";
import { BookOpen, ChevronDown, Coins } from "lucide-react";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";

export function LearningRewardSummary({
  userId,
  businessDay,
  completionId,
  onAward,
  embedded = false,
  taskList = false
}: {
  userId: string;
  businessDay?: string;
  completionId?: string | null;
  onAward?: () => void;
  embedded?: boolean;
  taskList?: boolean;
}) {
  const uiText = useWebText(webCoins);
  const client = useQueryClient();
  const seen = useRef<string | null>(null);
  const q = useQuery({
    queryKey: [
      "learning-rewards",
      userId,
      businessDay ?? "today",
      completionId ?? null
    ],
    refetchOnMount: "always",
    queryFn: ({ signal }) => api.learningRewards.day(businessDay, { signal })
  });
  const operation = !q.isError ? q.data?.operation_id : null;
  useEffect(() => {
    if (
      !operation ||
      seen.current === operation ||
      useUserStore.getState().user?.id !== userId
    )
      return;
    seen.current = operation;
    void client.invalidateQueries({ queryKey: ["coins", "user", userId] });
    onAward?.();
  }, [operation, client, userId, onAward]);
  const d = q.data;
  const progress =
    d && d.minimum_units
      ? Math.min(100, Math.round((d.qualifying_units / d.minimum_units) * 100))
      : 0;
  const Heading = embedded ? "h3" : "h2";
  const rules = d && d.status !== "reward_disabled" && (
    <p className="text-xs leading-5 text-foreground-muted">
      {uiText(
        "webCoinsRewards:complete_v0_different_questions_across_completed_daily_tasks_to_earn_up",
        { v0: d.minimum_units!, v1: formatCoins(d.daily_amount!) }
      )}
    </p>
  );
  return (
    <section
      aria-label={uiText("webCoinsRewards:daily_learning_reward")}
      className={
        embedded ? "space-y-3" : "glass space-y-4 rounded-3xl p-5 sm:p-6"
      }
    >
      <div
        className={
          embedded ? "flex items-center gap-2" : "flex items-center gap-3"
        }
      >
        {embedded ? (
          <BookOpen
            className="size-4 shrink-0 text-foreground-muted"
            strokeWidth={1.8}
            aria-hidden
          />
        ) : (
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-muted text-primary"
            aria-hidden
          >
            <Coins className="size-[18px]" strokeWidth={1.8} />
          </span>
        )}
        <Heading
          className={
            embedded
              ? "text-sm font-medium text-foreground"
              : "text-base font-bold tracking-tight text-foreground"
          }
        >
          {uiText("webCoinsRewards:daily_learning_reward")}
          {d && !q.isError && (
            <span className="ml-2 text-sm font-normal tabular-nums text-foreground-muted">
              <span className="sr-only"> · </span>
              {d.business_day}
            </span>
          )}
        </Heading>
      </div>
      {q.isError ? (
        <p role="alert" className="text-sm text-foreground-muted">
          {q.error instanceof HttpError && q.error.status === 404
            ? uiText("webCoinsRewards:rewards_are_not_available_yet")
            : uiText(
                "webCoinsRewards:could_not_read_reward_status_your_learning_progress_is_unaffected"
              )}
          <button
            className="ml-2 font-medium text-primary underline-offset-4 hover:underline"
            onClick={() => void q.refetch()}
          >
            {uiText("webCoinsRewards:retry")}
          </button>
        </p>
      ) : !d ? (
        <p className="text-sm text-foreground-muted">
          {uiText("webCoinsRewards:loading_reward_status")}
        </p>
      ) : d.status === "reward_disabled" ? (
        <p className="text-sm text-foreground-muted">
          {uiText(
            "webCoinsRewards:daily_learning_rewards_are_disabled_completed_learning_is_still_recorded"
          )}
        </p>
      ) : (
        <>
          {d.status === "awarded" ? (
            <p
              role="status"
              className={
                embedded
                  ? "text-sm leading-6 text-success"
                  : "rounded-2xl bg-success/10 px-4 py-3 text-sm font-medium text-success"
              }
            >
              {uiText(
                "webCoinsRewards:this_day_s_reward_of_v0_has_been_credited_further_learning_will_not_earn",
                {
                  v0: formatCoins(d.awarded_amount)
                }
              )}
            </p>
          ) : d.status === "wallet_unavailable" ? (
            <p
              role="status"
              className="rounded-2xl bg-muted px-4 py-3 text-sm text-foreground-muted"
            >
              {uiText(
                "webCoinsRewards:your_wallet_was_paused_or_closed_when_you_qualified_so_no_reward_was_iss"
              )}
            </p>
          ) : (
            <div className="space-y-2">
              <div
                className="h-1.5 overflow-hidden rounded-full bg-muted"
                aria-hidden
              >
                <div
                  className={`h-full rounded-full transition-[width] duration-500 ${
                    d.status === "threshold_not_met"
                      ? "bg-foreground-subtle"
                      : "bg-primary"
                  }`}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-sm font-medium tabular-nums text-foreground">
                {uiText("webCoinsRewards:reward_progress_v0_v1", {
                  v0: d.qualifying_units,
                  v1: String(d.minimum_units)
                })}
                {d.status === "threshold_not_met"
                  ? uiText(
                      "webCoinsRewards:this_day_s_threshold_was_not_reached"
                    )
                  : uiText(
                      "webCoinsRewards:the_reward_settles_automatically_when_you_qualify"
                    )}
              </p>
            </div>
          )}
          {embedded || taskList ? (
            <details className="group/learning-rules">
              <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-sm text-xs text-foreground-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary sm:min-h-8 [&::-webkit-details-marker]:hidden">
                {uiText("webCoinsRewards:learning_reward_rules")}
                <ChevronDown
                  className="size-3.5 group-open/learning-rules:rotate-180"
                  aria-hidden
                />
              </summary>
              <div className="mt-1">{rules}</div>
            </details>
          ) : (
            rules
          )}
        </>
      )}
      {!taskList &&
        (embedded ? (
          <Button asChild size="compact">
            <Link href="/student/practice">
              {uiText("webCoinsRewards:start_learning")}
            </Link>
          </Button>
        ) : (
          <Link
            href="/student/practice"
            className="inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {uiText("webCoinsRewards:view_daily_learning_tasks")}
          </Link>
        ))}
    </section>
  );
}

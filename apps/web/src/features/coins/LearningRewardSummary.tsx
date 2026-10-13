"use client";
import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HttpError } from "@tsz/api-client";
import { formatCoins } from "@tsz/shared";
import Link from "next/link";
import { Coins } from "lucide-react";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";

export function LearningRewardSummary({
  userId,
  businessDay,
  completionId,
  onAward
}: {
  userId: string;
  businessDay?: string;
  completionId?: string | null;
  onAward?: () => void;
}) {
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
  return (
    <section
      aria-label="每日学习奖励"
      className="glass space-y-4 rounded-3xl p-5 sm:p-6"
    >
      <div className="flex items-center gap-3">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-muted text-primary"
          aria-hidden
        >
          <Coins className="size-[18px]" strokeWidth={1.8} />
        </span>
        <h2 className="text-base font-bold tracking-tight text-foreground">
          每日学习奖励
          {d && !q.isError && (
            <span className="ml-2 text-sm font-normal tabular-nums text-foreground-muted">
              {d.business_day}
            </span>
          )}
        </h2>
      </div>
      {q.isError ? (
        <p role="alert" className="text-sm text-foreground-muted">
          {q.error instanceof HttpError && q.error.status === 404
            ? "奖励功能尚未就绪。"
            : "奖励状态暂时无法读取，学习进度不受影响。"}
          <button
            className="ml-2 font-medium text-primary underline-offset-4 hover:underline"
            onClick={() => void q.refetch()}
          >
            重试
          </button>
        </p>
      ) : !d ? (
        <p className="text-sm text-foreground-muted">正在读取奖励状态…</p>
      ) : d.status === "reward_disabled" ? (
        <p className="text-sm text-foreground-muted">
          每日学习奖励暂未开启，学习完成仍正常记录。
        </p>
      ) : (
        <>
          {d.status === "awarded" ? (
            <p
              role="status"
              className="rounded-2xl bg-success/10 px-4 py-3 text-sm font-medium text-success"
            >
              该日奖励已到账 {formatCoins(d.awarded_amount)}
              ，继续学习不会重复发放。
            </p>
          ) : d.status === "wallet_unavailable" ? (
            <p
              role="status"
              className="rounded-2xl bg-muted px-4 py-3 text-sm text-foreground-muted"
            >
              达标时钱包暂停或关闭，该日未发奖励；恢复后不补发。
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
                奖励进度 {d.qualifying_units}/{d.minimum_units}
                {d.status === "threshold_not_met"
                  ? "，该日未达标。"
                  : "，达标后自动结算。"}
              </p>
            </div>
          )}
          <p className="text-xs leading-5 text-foreground-muted">
            已完成的每日任务累计 {d.minimum_units}{" "}
            道不同题目，每个业务日最多获得 {formatCoins(d.daily_amount!)}
            。北京时间 04:00 换日，合法错误作答也计入。
          </p>
        </>
      )}
      <Link
        href="/student/practice"
        className="inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        查看每日学习任务 →
      </Link>
    </section>
  );
}

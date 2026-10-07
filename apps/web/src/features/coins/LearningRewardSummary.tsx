"use client";
import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HttpError } from "@tsz/api-client";
import { formatCoins } from "@tsz/shared";
import Link from "next/link";
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
  return (
    <section
      aria-label="每日学习奖励"
      className="space-y-3 rounded-3xl border border-border p-5"
    >
      <h2 className="font-semibold">
        每日学习奖励{d && !q.isError ? ` · ${d.business_day}` : ""}
      </h2>
      {q.isError ? (
        <p role="alert">
          {q.error instanceof HttpError && q.error.status === 404
            ? "奖励功能尚未就绪。"
            : "奖励状态暂时无法读取，学习进度不受影响。"}
          <button
            className="ml-2 text-primary"
            onClick={() => void q.refetch()}
          >
            重试
          </button>
        </p>
      ) : !d ? (
        <p>正在读取奖励状态…</p>
      ) : (
        <>
          {d.status === "reward_disabled" ? (
            <p>每日学习奖励暂未开启，学习完成仍正常记录。</p>
          ) : (
            <>
              <p>
                已完成的每日任务累计 {d.minimum_units}{" "}
                道不同题目，每个业务日最多获得 {formatCoins(d.daily_amount!)}
                。北京时间 04:00 换日，合法错误作答也计入。
              </p>
              {d.status === "awarded" ? (
                <p role="status">
                  该日奖励已到账 {formatCoins(d.awarded_amount)}
                  ，继续学习不会重复发放。
                </p>
              ) : d.status === "wallet_unavailable" ? (
                <p role="status">
                  达标时钱包暂停或关闭，该日未发奖励；恢复后不补发。
                </p>
              ) : (
                <p>
                  奖励进度 {d.qualifying_units}/{d.minimum_units}
                  {d.status === "threshold_not_met"
                    ? "，该日未达标。"
                    : "，达标后自动结算。"}
                </p>
              )}
            </>
          )}
        </>
      )}
      <Link
        href="/student/practice"
        className="inline-block text-sm text-primary"
      >
        查看每日学习任务 →
      </Link>
    </section>
  );
}

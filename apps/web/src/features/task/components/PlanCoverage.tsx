"use client";
import { type WebNotice, webErrorText } from "@/i18n/catalog";
import { useWebText } from "@/i18n/client";
import { webTask } from "@/i18n/messages/task";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChoiceScopePreview } from "./ChoiceScopePreview";
import { LearningProgressBar } from "./LearningProgressBar";
import { Pager } from "@/features/shell/Page";
import { HttpError } from "@tsz/api-client";
import type {
  LearningPlan,
  CycleOperation,
  LearningCyclePreview,
  CreateLearningCycle
} from "@tsz/types";
import { Button } from "@tsz/ui/components";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";
import { LibraryDialog } from "@/features/wordlist/components/LibraryDialog";
export const planStatusLabels: Record<LearningPlan["status"], string> = {
  archived: "已归档",
  schedule_ended: "计划已结束",
  cycle_completed: "本轮已完成",
  not_started: "尚未开始",
  today_completed: "今日已完成",
  source_blocked: "来源阻塞",
  ready: "可以学习",
  review_waiting: "等待下次复习"
};
export function PlanCoverage({
  plan,
  userId,
  refresh
}: {
  plan: LearningPlan;
  userId: string;
  refresh: () => Promise<unknown>;
}) {
  const uiText = useWebText(webTask);
  const [preview, setPreview] = useState<LearningCyclePreview | null>(null);
  const [acceptedPreview, setAcceptedPreview] = useState<string | null>(null);
  const [operation, setOperation] = useState<CycleOperation>("next");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<WebNotice>("");
  const [unknown, setUnknown] = useState(false);
  const intent = useRef<CreateLearningCycle | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const c = new AbortController();
    controller.current = c;
    return () => c.abort();
  }, []);
  const current = () =>
    !controller.current?.signal.aborted &&
    useUserStore.getState().user?.id === userId;
  const c = plan.current_cycle;
  const [historyPage, setHistoryPage] = useState(1);
  const history = useQuery({
    queryKey: [
      "learning-plans",
      userId,
      "v1",
      "cycles",
      plan.task.id,
      c?.id,
      c?.covered_count,
      c?.state,
      historyPage
    ],
    enabled: plan.mode === "coverage_v1",
    queryFn: ({ signal }) =>
      api.learningPlans.cycles(plan.task.id, { page: historyPage }, { signal })
  });
  async function inspect(operation: CycleOperation) {
    if (!c) return;
    setBusy(true);
    setError("");
    setOperation(operation);
    setAcceptedPreview(null);
    try {
      const p = await api.learningPlans.cyclePreview(
        plan.task.id,
        {
          operation,
          after_cycle_id: c.id,
          expected_revision: plan.task.revision
        },
        { signal: controller.current?.signal }
      );
      if (current()) setPreview(p);
    } catch (e) {
      if (current()) setError(webErrorText(e, "预览失败"));
    } finally {
      if (current()) setBusy(false);
    }
  }
  async function create() {
    if (!c || !preview) return;
    if (
      preview.preview.choice?.unavailable_count &&
      acceptedPreview !== preview.preview.preview_fingerprint &&
      !intent.current
    ) {
      setError("请确认仅使用可用内容开启新轮。");
      return;
    }
    setBusy(true);
    setError("");
    intent.current ??= {
      ...(preview.preview.choice?.unavailable_count
        ? { accept_partial_choice: true }
        : {}),
      operation,
      after_cycle_id: c.id,
      expected_revision: plan.task.revision,
      preview_fingerprint: preview.preview.preview_fingerprint,
      idempotency_key: crypto.randomUUID()
    };
    try {
      await api.learningPlans.cycleCreate(plan.task.id, intent.current, {
        signal: controller.current?.signal
      });
      if (current()) {
        intent.current = null;
        setUnknown(false);
        setPreview(null);
        await refresh();
      }
    } catch (e) {
      if (current()) {
        setError(webErrorText(e, "创建失败"));
        const definite =
          e instanceof HttpError && e.status < 500 && e.status !== 408;
        setUnknown(!definite);
        if (definite) {
          intent.current = null;
          setPreview(null);
          await refresh();
        }
      }
    } finally {
      if (current()) setBusy(false);
    }
  }
  const confirmation = preview && c && (
    <LibraryDialog
      title={
        operation === "refresh_sources"
          ? uiText("重新确认来源")
          : operation === "next"
            ? uiText("开启下一轮")
            : uiText("放弃受阻轮次")
      }
      busy={busy || unknown}
      onClose={() => setPreview(null)}
    >
      <div className="space-y-4 text-sm">
        <p>
          {operation === "refresh_sources"
            ? uiText("当前已跨天确认：")
            : uiText("原轮进度：")}
          {uiText("{{v0}}/{{v1}}，不可用 {{v2}} 题。", {
            v0: preview.previous_covered_count,
            v1: preview.previous_total_count,
            v2: preview.previous_blocked_count
          })}
        </p>
        {operation === "restart_blocked" && (
          <p>
            {uiText(
              "确认后将取消本轮及未完成批次，历史记录保留；新轮进度从零开始。"
            )}
          </p>
        )}
        {operation === "refresh_sources" ? (
          <>
            <p>
              {uiText(
                "将结束当前未完成批次，保留所有作答历史。内容未变的掌握状态和复习日期保持，内容有变的词义需要重新练习。"
              )}
            </p>
            {preview.source_refresh && (
              <p>
                {uiText(
                  "可重新确认 {{v0}} 个词义，其中 {{v1}} 个内容有变；仍不可用 {{v2}} 个，继续保留原进度。",
                  {
                    v0: preview.source_refresh.refreshed_count,
                    v1: preview.source_refresh.changed_content_count,
                    v2: preview.source_refresh.unavailable_count
                  }
                )}
              </p>
            )}
          </>
        ) : (
          <p>
            {uiText("新轮共 {{v0}} 题，最早从 {{v1}} 开始。", {
              v0: preview.preview.eligible_count,
              v1: preview.earliest_day
            })}
          </p>
        )}
        {preview.preview.choice && (
          <ChoiceScopePreview
            preview={preview.preview.choice}
            eligibleCount={preview.preview.eligible_count}
          />
        )}
        {!!preview.preview.choice?.unavailable_count &&
          preview.preview.can_create && (
            <label className="flex min-h-11 items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 size-4 accent-primary"
                disabled={busy || unknown}
                checked={
                  acceptedPreview === preview.preview.preview_fingerprint
                }
                onChange={(e) =>
                  setAcceptedPreview(
                    e.target.checked
                      ? preview.preview.preview_fingerprint
                      : null
                  )
                }
              />
              {uiText(
                "仅使用可出单选的内容开启新轮，暂不可用内容不纳入新轮学习范围"
              )}
            </label>
          )}
        {preview.preview.reasons.map((r) => (
          <p key={r} className="text-danger">
            {r}
          </p>
        ))}
        {error && (
          <p role="alert" className="text-danger">
            {uiText(error)}
          </p>
        )}
        {unknown && <p>{uiText("结果未确认；请重试原请求。")}</p>}
        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            disabled={busy || unknown}
            onClick={() => setPreview(null)}
          >
            {uiText("取消")}
          </Button>
          <Button
            disabled={busy || !preview.preview.can_create}
            onClick={() => void create()}
          >
            {busy
              ? uiText("正在创建…")
              : unknown
                ? uiText("重试原请求")
                : operation === "refresh_sources"
                  ? uiText("确认更新来源")
                  : uiText("确认开启新轮")}
          </Button>
        </div>
      </div>
    </LibraryDialog>
  );
  if (plan.mastery)
    return (
      <section aria-label={uiText("单词掌握情况")} className="space-y-4">
        <h2 className="text-lg font-semibold">
          {uiText(planStatusLabels[plan.status])}
        </h2>
        <LearningProgressBar
          label={uiText("跨天确认进度")}
          max={c?.total_count ?? 1}
          value={plan.mastery.mastered_count}
        />
        <p className="text-sm text-foreground-muted">
          {uiText("未学词义 {{v0}} · 待巩固 {{v1}} · 已跨天确认 {{v2}}", {
            v0: plan.mastery.new_count,
            v1: plan.mastery.learning_count,
            v2: plan.mastery.mastered_count
          })}
        </p>
        <p className="text-sm text-foreground-muted">
          {uiText("到期复习 {{v0}} 题", { v0: plan.mastery.due_count })}
          {plan.mastery.next_review_day &&
            uiText("· 下次复习：{{v0}}", { v0: plan.mastery.next_review_day })}
        </p>
        <p className="text-sm text-foreground-muted">
          {uiText(
            "每次最多 20 个新词，含错题重练最多 30 题。当天答对先记熟悉，跨天再次答对后延长复习间隔。"
          )}
        </p>
        {!!c?.blocked_count && (
          <p className="text-sm text-danger">
            {uiText("有 {{v0}} 题来源不可用，掌握进度已保留。", {
              v0: c.blocked_count
            })}
          </p>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={busy || unknown}
          onClick={() => void refresh()}
        >
          {uiText("刷新学习安排")}
        </Button>
        {plan.task.state === "active" && plan.status !== "schedule_ended" && (
          <Button
            type="button"
            variant="outline"
            disabled={busy || unknown || !c}
            onClick={() => void inspect("refresh_sources")}
          >
            {uiText("重新确认来源")}
          </Button>
        )}
        {error && !preview && (
          <p role="alert" className="text-sm text-danger">
            {uiText(error)}
          </p>
        )}
        {confirmation}
      </section>
    );
  if (!c)
    return (
      <p className="text-sm text-foreground-muted">
        {uiText("原有抽题模式 · 保留原任务与历史行为。")}
      </p>
    );
  return (
    <section className="space-y-4" aria-label={uiText("覆盖轮次")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">
          {uiText("第 {{v0}} 轮 ·{{v1}}", {
            v0: c.cycle_number,
            v1: uiText(planStatusLabels[plan.status])
          })}
        </h2>
        <p className="text-sm text-foreground-muted">
          {uiText("本轮已覆盖 {{v0}}/{{v1}} 题", {
            v0: c.covered_count,
            v1: c.total_count
          })}
        </p>
      </div>
      <LearningProgressBar
        label={uiText("本轮覆盖进度")}
        max={c.total_count}
        value={c.covered_count}
      />
      <p className="text-sm text-foreground-muted">
        {uiText("已覆盖 {{v0}} · 仍可答 {{v1}} · 不可用 {{v2}}", {
          v0: c.covered_count,
          v1: c.available_remaining_count,
          v2: c.blocked_count
        })}
      </p>
      {plan.task.task_type === "daily" && (
        <p className="text-sm text-foreground-muted">
          {plan.current_run
            ? uiText("今日已答 {{v0}}/{{v1}} 题", {
                v0: plan.current_run.answered_count,
                v1: plan.current_run.target_count
              })
            : plan.can_start
              ? uiText("今日尚未开始，可答 {{v0}} 题", {
                  v0: plan.today_available_count
                })
              : uiText("今日尚不可开始")}
          {plan.estimated_learning_days !== null &&
            uiText("· 从 {{v0}} 起还需 {{v1}} 个学习日", {
              v0: plan.estimate_from_day,
              v1: plan.estimated_learning_days
            })}
        </p>
      )}
      {plan.status === "not_started" && (
        <p className="text-sm">
          {uiText("开始学习日：{{v0}}", { v0: c.earliest_day })}
        </p>
      )}
      {plan.schedule && (
        <p className="text-sm text-foreground-muted">
          {uiText("日期计划：{{v0}} 至 {{v1}}，北京时间 04:00 换日。", {
            v0: plan.schedule.start_date,
            v1: plan.schedule.end_date
          })}
        </p>
      )}
      {plan.schedule_at_risk && (
        <p className="text-sm text-danger">
          {uiText("按今日实际剩余额度，可能无法在计划结束前覆盖全部内容。")}
        </p>
      )}
      {plan.reasons.map((reason) => (
        <p key={reason} className="text-sm text-foreground-muted">
          {reason}
        </p>
      ))}
      {c.blocked_count > 0 && (
        <p className="text-sm text-foreground-muted">
          {uiText(
            "不可用题目仍保留在本轮总数中；其余合法题目可以继续。检查来源不会重置进度。"
          )}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          type="button"
          disabled={busy || unknown}
          onClick={() => void refresh()}
        >
          {uiText("检查来源")}
        </Button>
        {plan.can_start_next_cycle && (
          <Button
            type="button"
            disabled={busy || unknown}
            onClick={() => void inspect("next")}
          >
            {uiText("开启下一轮")}
          </Button>
        )}
        {plan.can_restart_blocked_cycle && (
          <Button
            type="button"
            variant="outline"
            disabled={busy || unknown}
            onClick={() => void inspect("restart_blocked")}
          >
            {uiText("放弃本轮并重新生成")}
          </Button>
        )}
      </div>
      {error && !preview && (
        <p role="alert" className="text-sm text-danger">
          {uiText(error)}
        </p>
      )}
      {confirmation}
      <details className="border-t border-border/60 pt-4">
        <summary className="cursor-pointer text-sm font-medium">
          {uiText("覆盖轮次历史")}
        </summary>
        {history.isError ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            {uiText("轮次历史读取失败")}
          </p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {history.data?.items.map((h) => (
              <li key={h.id}>
                {uiText("第 {{v0}} 轮 · ", { v0: h.cycle_number })}
                {h.state === "completed"
                  ? uiText("已完成")
                  : h.state === "cancelled"
                    ? uiText("已取消")
                    : uiText("进行中")}
                {uiText(" · 覆盖 {{v0}}/{{v1}} 题", {
                  v0: h.covered_count,
                  v1: h.total_count
                })}
              </li>
            ))}
          </ul>
        )}
        {history.data && (
          <Pager
            page={historyPage}
            total={history.data.pagination.total_pages}
            onChange={setHistoryPage}
          />
        )}
      </details>
      {plan.sources.length > 0 && (
        <ul className="space-y-2">
          {plan.sources.map((s) => (
            <li key={s.id} className="rounded-2xl bg-muted/70 p-3 text-sm">
              <p className="line-clamp-2 break-words">
                {s.name ?? uiText("来源不可用")}
              </p>
              {s.available && (
                <p className="text-xs text-foreground-muted">
                  {s.personal_note &&
                    s.personal_note !== s.name &&
                    uiText("备注：{{v0}} ·", { v0: s.personal_note })}
                  {s.author_name} ·{" "}
                  {s.state === "published" ? uiText("公开") : uiText("非公开")}
                  {uiText(" · {{v0}} 个词条", { v0: s.item_count })}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

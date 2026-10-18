import { HttpError } from "@tsz/api-client";
import type {
  LearningPageQuery,
  LearningPlan,
  LearningTaskDetail
} from "@tsz/types";
import { api } from "@/lib/request";
type Options = { signal?: AbortSignal };
export const missingPlans = (e: unknown) =>
  e instanceof HttpError && e.status === 404;
function legacy(value: LearningTaskDetail): LearningPlan {
  const r = value.current_run;
  return {
    ...value,
    mode: "legacy_v1",
    schedule: null,
    sources: [],
    current_cycle: null,
    today_available_count: 0,
    estimated_learning_days: null,
    estimate_from_day: null,
    schedule_at_risk: false,
    status:
      value.task.state === "archived"
        ? "archived"
        : r?.state === "completed"
          ? "today_completed"
          : "ready",
    can_start:
      value.task.state === "active" &&
      (!value.task.ends_at || value.task.ends_at > value.server_time) &&
      !(value.task.task_type === "daily" && r?.state === "completed"),
    can_start_next_cycle: false,
    can_restart_blocked_cycle: false,
    reasons: ["原有抽题模式"],
    next_day_at: value.server_time
  };
}
export async function listPlans(query: LearningPageQuery, options?: Options) {
  try {
    return await api.learningPlans.list(query, options);
  } catch (e) {
    if (!missingPlans(e)) throw e;
    const old = await api.learning.list(query, options);
    return { ...old, items: old.items.map(legacy) };
  }
}
export async function detailPlan(id: string, options?: Options) {
  try {
    return await api.learningPlans.detail(id, options);
  } catch (e) {
    if (!missingPlans(e)) throw e;
    // A missing resource does not imply that the API itself is absent.
    try {
      await api.learningPlans.list({ page: 1, page_size: 1 }, options);
    } catch (probe) {
      if (missingPlans(probe))
        return legacy(await api.learning.detail(id, options));
      throw probe;
    }
    throw e;
  }
}
export async function historyPlans(
  id: string,
  query: LearningPageQuery,
  options?: Options
) {
  try {
    return await api.learningPlans.history(id, query, options);
  } catch (e) {
    if (!missingPlans(e)) throw e;
    try {
      await api.learningPlans.list({ page: 1, page_size: 1 }, options);
    } catch (probe) {
      if (!missingPlans(probe)) throw probe;
      const old = await api.learning.history(id, query, options);
      return {
        ...old,
        items: old.items.map((run) => ({ run, cycle_id: null }))
      };
    }
    throw e;
  }
}

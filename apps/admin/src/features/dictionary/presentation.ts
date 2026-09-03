import type { AdminWordListItemAny, Dialect } from "@tsz/types";
import { reportClientError } from "@/lib/telemetry";

const KNOWN_PRESENTATION_STRATEGIES = new Set([
  "legacy_headwords_v1",
  "surface_summary_v1",
  "short_uuid_v1"
]);

export interface UnknownPresentationStrategyObservation {
  entry_id: string;
  strategy_version: string;
}

export type PresentationStrategyReporter = (
  observation: UnknownPresentationStrategyObservation
) => void;

/** 交给浏览器标准 error 观测入口，便于现有前端监控捕获，不伪造业务指标。 */
export const reportUnknownPresentationStrategy: PresentationStrategyReporter = (
  observation
) => {
  const error = new Error(
    `Unknown word-list presentation strategy: ${observation.strategy_version} (entry ${observation.entry_id})`
  );
  error.name = "UnknownPresentationStrategyError";
  reportClientError(error);
};

/** Unknown non-empty versions remain displayable but are observable by the host. */
export function observeWordListPresentation(
  record: AdminWordListItemAny,
  report: PresentationStrategyReporter
): boolean {
  if (
    record.schema_version !== 3 ||
    record.presentation.strategy_version === "" ||
    KNOWN_PRESENTATION_STRATEGIES.has(record.presentation.strategy_version)
  ) {
    return false;
  }
  report({
    entry_id: record.id,
    strategy_version: record.presentation.strategy_version
  });
  return true;
}

/** 列表展示名由各 schema 的服务端响应决定；V3 禁止从具体词形反推。 */
export function wordListLabel(record: AdminWordListItemAny): string {
  return record.schema_version === 2
    ? record.headword
    : record.presentation.label;
}

/** 两个 schema 的方言摘要都由服务端给出（V3 按词性当前设置聚合），不从 matched surfaces 猜测。 */
export function wordListDialects(record: AdminWordListItemAny): Dialect[] {
  return record.dialects;
}

import type { AdminWordListItemAny, WordCreationStep } from "@tsz/types";

const WIZARD_STEPS: readonly WordCreationStep[] = [
  "basics",
  "forms",
  "meanings",
  "preview"
];

type WordRouteRecord = Pick<
  AdminWordListItemAny,
  | "id"
  | "schema_version"
  | "status"
  | "max_reachable_step"
  | "has_unpublished_changes"
>;

function isWizardStep(value: unknown): value is WordCreationStep {
  return WIZARD_STEPS.includes(value as WordCreationStep);
}

/** 旧结构词条被置灰时给出的原因。 */
export const LEGACY_SCHEMA_BLOCKED_HINT =
  "旧结构词条，新版向导已不支持打开；需要处理请联系维护者迁移";

/**
 * schema 与状态共同决定既有词条的唯一详情入口。
 *
 * 只有 V3 有向导：V1/V2 向导已整条下线，列表遇到旧结构的行返回 `undefined`，
 * 由调用方置灰入口并说明原因——这里抛异常会把整张表一起炸掉。
 */
export function getWordRowRoute(record: WordRouteRecord): string | undefined {
  if (record.schema_version !== 3) return undefined;
  const wizardPrefix = `/words/${record.id}/v3/wizard`;
  if (record.status === "published" && !record.has_unpublished_changes) {
    return `${wizardPrefix}/preview`;
  }
  const step = isWizardStep(record.max_reachable_step)
    ? record.max_reachable_step
    : "basics";
  const route = `${wizardPrefix}/${step}`;
  return record.status === "published" ? `${route}?mode=edit` : route;
}

/**
 * 行入口的动作文案。
 *
 * `writable=false`（别人的未发布草稿）时草稿态落到「查看」——路由不变，
 * 进去就是只读的预览页（见 resolveV3StepAccess），文案先把这件事说清楚，
 * 免得点进去才发现改不动。
 */
export function getWordRowActionLabel(
  record: WordRouteRecord,
  writable = true
): "编辑" | "继续创建" | "继续编辑" | "查看" {
  if (record.status === "archived") return "查看";
  if (record.status !== "published") return writable ? "继续创建" : "查看";
  return record.has_unpublished_changes ? "继续编辑" : "查看";
}

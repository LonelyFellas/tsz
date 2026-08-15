import type { AdminWordListItem, WordCreationStep } from "@tsz/types";

const WIZARD_STEPS: readonly WordCreationStep[] = [
  "basics",
  "forms",
  "meanings",
  "preview"
];

type WordRouteRecord = Pick<
  AdminWordListItem,
  | "id"
  | "schema_version"
  | "status"
  | "max_reachable_step"
  | "has_unpublished_changes"
>;

function isWizardStep(value: unknown): value is WordCreationStep {
  return WIZARD_STEPS.includes(value as WordCreationStep);
}

/** V2 状态决定词条唯一详情入口。 */
export function getWordRowRoute(record: WordRouteRecord): string {
  if (record.status === "published" && !record.has_unpublished_changes) {
    return `/words/${record.id}/wizard/preview`;
  }
  const step = isWizardStep(record.max_reachable_step)
    ? record.max_reachable_step
    : "basics";
  const route = `/words/${record.id}/wizard/${step}`;
  return record.status === "published" ? `${route}?mode=edit` : route;
}

export function getWordRowActionLabel(
  record: WordRouteRecord
): "编辑" | "继续创建" | "继续编辑" | "查看" {
  if (record.status === "archived") return "查看";
  if (record.status !== "published") return "继续创建";
  return record.has_unpublished_changes ? "继续编辑" : "查看";
}

import type { AdminWordListItem, WordCreationStep } from "@tsz/types";

const WIZARD_STEPS: readonly WordCreationStep[] = [
  "basics",
  "forms",
  "meanings",
  "preview"
];

type WordRouteRecord = Pick<
  AdminWordListItem,
  "id" | "schema_version" | "status" | "max_reachable_step"
>;

function isWizardStep(value: unknown): value is WordCreationStep {
  return WIZARD_STEPS.includes(value as WordCreationStep);
}

/** 版本与状态共同决定词条唯一详情入口，列表和 legacy guard 共用。 */
export function getWordRowRoute(record: WordRouteRecord): string {
  if (record.schema_version !== 2) return `/words/${record.id}/edit`;
  if (record.status === "published") {
    return `/words/${record.id}/wizard/preview`;
  }
  const step = isWizardStep(record.max_reachable_step)
    ? record.max_reachable_step
    : "basics";
  return `/words/${record.id}/wizard/${step}`;
}

export function getWordRowActionLabel(
  record: WordRouteRecord
): "编辑" | "继续创建" | "查看" {
  if (record.schema_version !== 2) return "编辑";
  return record.status === "published" ? "查看" : "继续创建";
}

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

/** schema 与状态共同决定既有词条的唯一详情入口。 */
export function getWordRowRoute(record: WordRouteRecord): string {
  if (record.schema_version !== 2 && record.schema_version !== 3) {
    throw new Error(
      `unsupported schema_version: ${String(record.schema_version)}`
    );
  }
  const wizardPrefix =
    record.schema_version === 3
      ? `/words/${record.id}/v3/wizard`
      : `/words/${record.id}/wizard`;
  if (record.status === "published" && !record.has_unpublished_changes) {
    return `${wizardPrefix}/preview`;
  }
  const step = isWizardStep(record.max_reachable_step)
    ? record.max_reachable_step
    : "basics";
  const route = `${wizardPrefix}/${step}`;
  return record.status === "published" ? `${route}?mode=edit` : route;
}

export function getWordRowActionLabel(
  record: WordRouteRecord
): "编辑" | "继续创建" | "继续编辑" | "查看" {
  if (record.status === "archived") return "查看";
  if (record.status !== "published") return "继续创建";
  return record.has_unpublished_changes ? "继续编辑" : "查看";
}

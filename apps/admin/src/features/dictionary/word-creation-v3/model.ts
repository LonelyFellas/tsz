import type {
  DraftFormsStepContentV3,
  V3DraftValidationIssue
} from "@tsz/types";

export function variantRegularity(
  content: DraftFormsStepContentV3,
  formId: string,
  variant: { is_regular?: boolean }
): boolean {
  return (
    variant.is_regular ??
    content.pos.every((pos) =>
      pos.form_groups.every(
        (group) =>
          !group.members.some((member) => member.form_id === formId) ||
          group.is_regular
      )
    )
  );
}

/** Server issue consumer only; no client-side pronunciation normalization. */
export function issuesForPronunciation(
  issues: readonly V3DraftValidationIssue[],
  pronunciationId: string
): V3DraftValidationIssue[] {
  return issues.filter(
    (item) => item.node_location.pronunciation_id === pronunciationId
  );
}

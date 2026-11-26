import { useMutation, useQuery } from "@tanstack/react-query";
import type { NextPublication, FormTypeCatalogItem } from "@tsz/types";
import { expandFormContents, regionalVariants } from "@tsz/shared";
import { Alert, Button, Card, Space, Tag } from "@tsz/ui/admin/display";
import { usePermission } from "@/lib/auth";
import type { LexiconNextRequests } from "@/pages/LexiconNext";
import { useLexiconEditorTranslation } from "@/features/dictionary/i18n/editor";

export function AssessmentReview({
  publication,
  lifecycle,
  types,
  requests,
  onRefresh
}: {
  publication: NextPublication;
  lifecycle: number;
  types?: FormTypeCatalogItem[];
  requests: Pick<LexiconNextRequests, "assessment" | "reviewAssessment">;
  onRefresh: () => Promise<unknown>;
}) {
  const { t } = useLexiconEditorTranslation();
  const canReview = usePermission("words.review_assessment");
  const review = useQuery({
    queryKey: [
      "admin-lexicon-next",
      "assessment",
      publication.entry_id,
      publication.id,
      lifecycle
    ],
    queryFn: () => requests.assessment(publication.entry_id),
    retry: false
  });
  const state = review.data;
  const current =
    state?.publication_id === publication.id &&
    state.lifecycle_revision === lifecycle;
  const mutation = useMutation({
    mutationFn: () => {
      if (!state || !current) throw new Error(t("assessment_changed"));
      return requests.reviewAssessment(publication.entry_id, {
        publication_id: publication.id,
        lifecycle_revision: lifecycle,
        expected_version: state.version,
        approved: !state.approved
      });
    },
    onSettled: async () => {
      await Promise.all([review.refetch(), onRefresh()]);
    }
  });
  const draft = publication.snapshot.draft;
  const excluded = new Set(
    draft.form_question_eligibility
      ?.filter((setting) => !setting.eligible)
      .map((setting) => setting.form_id)
  );
  const names = new Map(types?.map((type) => [type.code, type.short_name_zh]));
  const forms = draft.form_editor
    ? expandFormContents(draft.form_editor).pos.flatMap((pos) => pos.forms)
    : [];
  return (
    <Card
      title={t("assessment_review")}
      extra={
        state &&
        current && (
          <Tag color={state.approved ? "success" : "default"}>
            {state.approved
              ? t("assessment_approved")
              : t("assessment_pending")}
          </Tag>
        )
      }
    >
      <Space direction="vertical">
        {forms.map((form) => (
          <Space key={form.id}>
            <span>{names.get(form.form_type) ?? form.form_type}</span>
            <strong>
              {[
                ...new Set(
                  regionalVariants(form.regional_variants)
                    .map((v) => v.spelling)
                    .filter(Boolean)
                )
              ].join(" / ")}
            </strong>
            <span>
              {excluded.has(form.id)
                ? t("assessment_excluded")
                : t("question_eligible")}
            </span>
          </Space>
        ))}
        {review.error && (
          <Alert
            type="error"
            title={review.error.message}
            action={
              <Button onClick={() => void review.refetch()}>
                {t("retry")}
              </Button>
            }
          />
        )}
        {state && !current && (
          <Alert
            type="warning"
            title={t("assessment_changed")}
            action={
              <Button onClick={() => void onRefresh()}>{t("retry")}</Button>
            }
          />
        )}
        {mutation.error && (
          <Alert type="error" title={mutation.error.message} />
        )}
        {canReview && (
          <Button
            loading={mutation.isPending}
            disabled={!current || review.isFetching || !!review.error}
            onClick={() => mutation.mutate()}
          >
            {state?.approved ? t("assessment_revoke") : t("assessment_approve")}
          </Button>
        )}
      </Space>
    </Card>
  );
}

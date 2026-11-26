import {
  FormTypeLabelsProvider,
  useFormTypeLabel
} from "@/features/dictionary/part-of-speech/FormTypeLabels";
import {
  PartOfSpeechLabelsProvider,
  usePartOfSpeechLabel
} from "@/features/dictionary/part-of-speech/PartOfSpeechLabels";
import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  NextPublication,
  PartOfSpeechCatalogResponse,
  WordPosFormsV3
} from "@tsz/types";
import { expandFormContents, regionalVariants } from "@tsz/shared";
import { Alert, Button, Card, Space, Tag } from "@tsz/ui/admin/display";
import { usePermission } from "@/lib/auth";
import type { LexiconNextRequests } from "@/pages/LexiconNext";
import { useLexiconEditorTranslation } from "@/features/dictionary/i18n/editor";

export function AssessmentReview({
  publication,
  lifecycle,
  catalog,
  requests,
  onRefresh
}: {
  publication: NextPublication;
  lifecycle: number;
  catalog?: PartOfSpeechCatalogResponse;
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
  const positions = draft.form_editor
    ? expandFormContents(draft.form_editor).pos
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
        <PartOfSpeechLabelsProvider items={catalog?.items}>
          <FormTypeLabelsProvider items={catalog?.form_types}>
            {positions.map((pos) => (
              <AssessmentPosForms
                key={pos.pos_id}
                pos={pos}
                excluded={excluded}
              />
            ))}
          </FormTypeLabelsProvider>
        </PartOfSpeechLabelsProvider>
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

function AssessmentPosForms({
  pos,
  excluded
}: {
  pos: WordPosFormsV3;
  excluded: ReadonlySet<string>;
}) {
  const { t } = useLexiconEditorTranslation();
  const posLabel = usePartOfSpeechLabel();
  const formLabel = useFormTypeLabel();
  const forms = new Map(pos.forms.map((form) => [form.id, form]));
  return (
    <section aria-label={posLabel(pos.pos)}>
      <strong>{posLabel(pos.pos)}</strong>
      {pos.form_groups.map((group, index) => {
        const members = group.members.flatMap(
          (member) => forms.get(member.form_id) ?? []
        );
        const counts = new Map<string, number>();
        for (const form of members)
          counts.set(form.form_type, (counts.get(form.form_type) ?? 0) + 1);
        const seen = new Map<string, number>();
        const heading = t("form_group_heading", { group: index + 1 });
        return (
          <section key={group.id} aria-label={heading}>
            <div>{heading}</div>
            <Space direction="vertical">
              {members.map((form) => {
                const ordinal = (seen.get(form.form_type) ?? 0) + 1;
                seen.set(form.form_type, ordinal);
                return (
                  <Space key={form.id}>
                    <span>
                      {formLabel(form.form_type)}
                      {counts.get(form.form_type)! > 1 && <sup>{ordinal}</sup>}
                    </span>
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
                );
              })}
            </Space>
          </section>
        );
      })}
    </section>
  );
}

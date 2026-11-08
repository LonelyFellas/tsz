import { useSentenceTranslation } from "./i18n";
import {
  useLexiconEditorTranslation,
  defaultLexiconEditorTranslation,
  type LexiconEditorTranslation,
  useLexiconEditorMessageState,
  createLexiconEditorMessage
} from "../dictionary/i18n/editor";
import { useCallback, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Alert, Button, List, Space, Typography } from "@tsz/ui/admin/display";
import { Input } from "@tsz/ui/admin/forms";
import { Modal } from "@tsz/ui/admin/overlays";
import { HttpError } from "@tsz/api-client";
import type { SharedSentence, SentencePublication } from "@tsz/types";
import { api } from "@/lib/auth";
import { V3EnglishTextPreview } from "../dictionary/word-creation-v3/components/V3EnglishTextPreview";
import { PublicationAudioReviewPanel } from "../dictionary/PublicationAudioReviewPanel";

export type SentencePublicationAction =
  "publish" | "history" | "withdraw" | "restore";
function publicationTitles(
  t: LexiconEditorTranslation = defaultLexiconEditorTranslation
) {
  return {
    publish: t("panel_publish_example_draft"),
    history: t("panel_example_publication_history"),
    withdraw: t("panel_withdraw_example"),
    restore: t("panel_restore_original_publication")
  };
}

/** 打开时冻结双 revision；确定性失败要求重新加载，未知结果复用原幂等请求。 */
export function SentencePublicationModal({
  sentence,
  action,
  canPublish,
  onClose,
  onChanged
}: {
  sentence: SharedSentence;
  action: SentencePublicationAction;
  canPublish: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useLexiconEditorTranslation();
  const { t: sentenceT, i18n } = useSentenceTranslation();
  const audioScope = `${sentence.id}:${sentence.revision}`;
  const [reviewedAudio, setReviewedAudio] = useState<string>();
  const audioReady = reviewedAudio === audioScope;
  const onAudioReady = useCallback(
    (ready: boolean) => setReviewedAudio(ready ? audioScope : undefined),
    [audioScope]
  );
  const canAct =
    canPublish &&
    (action !== "history" ||
      !sentence.current_publication_id ||
      !!sentence.withdrawn_at);
  const [reason, setReason] = useState("");
  const [selected, setSelected] = useState<SentencePublication>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useLexiconEditorMessageState();
  const [blocked, setBlocked] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const key = useRef(crypto.randomUUID());
  const busy = useRef(false);
  const impact = useQuery({
    queryKey: [
      "sentence-withdrawal-impact",
      sentence.id,
      sentence.lifecycle_revision
    ],
    queryFn: () => api.sentences.withdrawalImpact(sentence.id),
    enabled: action === "withdraw",
    staleTime: Infinity,
    refetchOnWindowFocus: false
  });
  const history = useInfiniteQuery({
    queryKey: [
      "sentence-publications",
      sentence.id,
      sentence.lifecycle_revision
    ],
    queryFn: ({ pageParam }) =>
      api.sentences.publications(sentence.id, pageParam),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) =>
      last.length === 50 ? last.at(-1)?.publication_number : undefined,
    enabled: action === "history"
  });
  const input = {
    base_revision: sentence.revision,
    base_lifecycle_revision: sentence.lifecycle_revision
  };
  const submit = async () => {
    if (busy.current || blocked || !canAct) return;
    if (action === "publish" && !audioReady) return;
    if (action === "history" && !selected) return;
    if (action === "withdraw" && (!impact.data || !reason.trim())) return;
    busy.current = true;
    setPending(true);
    setError(undefined);
    try {
      if (action === "publish")
        await api.sentences.publish(sentence.id, key.current, input);
      else if (action === "restore")
        await api.sentences.restore(sentence.id, key.current, input);
      else if (action === "withdraw")
        await api.sentences.withdraw(sentence.id, key.current, {
          ...input,
          reason: reason.trim(),
          impact_fingerprint: impact.data!.fingerprint
        });
      else
        await api.sentences.rollback(
          sentence.id,
          selected!.id,
          key.current,
          input
        );
      onChanged();
      onClose();
    } catch (failure) {
      if (failure instanceof HttpError && failure.status < 500) {
        setBlocked(true);
        setError(
          createLexiconEditorMessage(
            "panel_close_this_window_refresh_and_confirm_again",
            {
              p0: failure.message
            }
          )
        );
      } else {
        setUncertain(true);
        setError(
          createLexiconEditorMessage(
            "panel_the_result_is_unknown_retry_to_confirm_retries_reuse_the_original_request_a"
          )
        );
      }
    } finally {
      busy.current = false;
      setPending(false);
    }
  };
  return (
    <Modal
      open
      title={publicationTitles(t)[action]}
      width={800}
      onCancel={onClose}
      closable={!pending}
      keyboard={!pending}
      mask={{ closable: false }}
      cancelButtonProps={{ disabled: pending }}
      okText={
        action === "history"
          ? t("panel_restore_selected_history_to_draft")
          : t("panel_confirm")
      }
      confirmLoading={pending}
      okButtonProps={{
        disabled:
          !canAct ||
          blocked ||
          (action === "publish" && !audioReady) ||
          (action === "history" && !selected) ||
          (action === "withdraw" &&
            (!impact.data || impact.isError || !reason.trim()))
      }}
      onOk={() => void submit()}
    >
      <Space orientation="vertical" style={{ width: "100%" }}>
        <Alert
          type="info"
          title={
            action === "withdraw"
              ? t(
                  "panel_withdrawal_hides_this_example_publicly_drafts_history_and_links_are_retaine"
                )
              : action === "restore"
                ? t(
                    "panel_the_current_publication_will_be_checked_again_before_restoring_the_draft_wi"
                  )
                : action === "history"
                  ? t(
                      "panel_restoring_history_overwrites_the_current_draft_withdraw_a_published_example"
                    )
                  : t(
                      "panel_publish_the_current_draft_as_a_public_example_withdrawn_examples_become_pub"
                    )
          }
          description={t(
            "panel_publication_withdrawal_or_history_restoration_permission_is_required_ordina"
          )}
        />
        {action === "publish" && (
          <>
            <V3EnglishTextPreview
              value={sentence.content.sentence.en_text}
              hideCommonDialect
            />
            <PublicationAudioReviewPanel
              owner="sentence"
              id={sentence.id}
              revision={sentence.revision}
              canConfirm={canAct}
              onReady={onAudioReady}
            />
          </>
        )}
        {action === "withdraw" && (
          <>
            {impact.isPending && (
              <Typography.Text>
                {t("panel_checking_withdrawal_impact")}
              </Typography.Text>
            )}
            {impact.isError && (
              <Alert
                type="error"
                title={t("panel_could_not_load_impact_confirmation")}
                action={
                  <Button onClick={() => void impact.refetch()}>
                    {t("panel_try_again")}
                  </Button>
                }
              />
            )}
            {impact.data && (
              <>
                <Typography.Text>
                  {sentenceT("withdrawal_impact", {
                    count: impact.data.targets.length
                  })}
                </Typography.Text>
                <List
                  size="small"
                  dataSource={impact.data.targets}
                  renderItem={(target) => (
                    <List.Item>
                      {target.entry_id} / {target.sense_id}
                      {target.hidden ? t("panel_host_hidden") : ""}
                    </List.Item>
                  )}
                />
              </>
            )}
            <Input.TextArea
              aria-label={t("panel_withdrawal_reason")}
              value={reason}
              maxLength={2000}
              disabled={pending || uncertain || blocked}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t("panel_enter_a_withdrawal_reason")}
            />
          </>
        )}
        {action === "history" && (
          <>
            {history.isError && (
              <Alert
                type="error"
                title={t("panel_could_not_load_publication_history")}
                action={
                  <Button onClick={() => void history.refetch()}>
                    {t("panel_try_again")}
                  </Button>
                }
              />
            )}
            <List
              loading={history.isPending}
              dataSource={history.data?.pages.flat() ?? []}
              renderItem={(publication) => (
                <List.Item
                  actions={
                    canAct
                      ? [
                          <Button
                            key="select"
                            disabled={pending || uncertain || blocked}
                            onClick={() => setSelected(publication)}
                          >
                            {selected?.id === publication.id
                              ? t("panel_selected")
                              : t("panel_select_to_restore")}
                          </Button>
                        ]
                      : []
                  }
                >
                  <Space orientation="vertical">
                    <Typography.Text>
                      {sentenceT("publication_metadata", {
                        number: publication.publication_number,
                        date: new Date(publication.published_at).toLocaleString(
                          i18n.language
                        )
                      })}
                    </Typography.Text>
                    <V3EnglishTextPreview
                      value={publication.snapshot.sentence.en_text}
                      hideCommonDialect
                    />
                  </Space>
                </List.Item>
              )}
            />
            {history.hasNextPage && (
              <Button
                loading={history.isFetchingNextPage}
                onClick={() => void history.fetchNextPage()}
              >
                {t("panel_load_earlier_history")}
              </Button>
            )}
          </>
        )}
        {error && <Alert type="error" title={error} />}
      </Space>
    </Modal>
  );
}

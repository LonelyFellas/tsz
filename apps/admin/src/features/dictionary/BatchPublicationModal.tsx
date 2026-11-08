import {
  useLexiconEditorTranslation,
  useLexiconEditorMessageState,
  createLexiconEditorMessage as uiMessage
} from "./i18n/editor";
import { useCallback, useRef, useState } from "react";
import { Alert, List, Space, Typography, Button } from "@tsz/ui/admin/display";
import { Modal } from "@tsz/ui/admin/overlays";
import { Select, Input } from "@tsz/ui/admin/forms";
import { Pagination } from "@tsz/ui/admin/table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HttpError } from "@tsz/api-client";
import type {
  AdminWordListItemAny,
  BatchPublicationInputV3,
  SharedSentence,
  SurfaceMatchPageV3
} from "@tsz/types";
import { canAdminResourceAction, hasAdminPermission } from "@tsz/shared/auth";
import { canPublishEntry } from "./entryWritePermission";
import { api, useAuthStore } from "@/lib/auth";
import { wordKeys } from "./api";
import { editableEnglishText } from "./word-creation-v3/meaningsModel";
import { wordListLabel } from "./presentation";
import { LifecycleSurfaceConfirmation } from "./LifecycleSurfaceConfirmation";
import { useSurfaceSnapshot } from "./useSurfaceSnapshot";
import {
  BatchPublicationAudioReviewPanel,
  publicationAudioScope,
  type PublicationAudioTarget
} from "./BatchPublicationAudioReviewPanel";
import {
  canAcknowledgeSurfaceSnapshot,
  isSurfaceMatchPageAny
} from "./surfaceSnapshot";

/** rows 是打开确认框时冻结的显式范围；版本冲突不得自动换成新 revision 重试。 */
export function BatchPublicationModal({
  rows,
  sentences = [],
  onClose,
  onPublished
}: {
  rows: AdminWordListItemAny[];
  sentences?: SharedSentence[];
  onClose: () => void;
  onPublished: () => void;
}) {
  const { t } = useLexiconEditorTranslation();
  const profile = useAuthStore((state) => state.profile);
  const canReadSentences = hasAdminPermission(profile, "sentences.access");
  const canPublishSentence = (sentence: SharedSentence) =>
    canAdminResourceAction(
      profile,
      "sentences",
      "publish",
      sentence.created_by_admin_id
    );
  const qc = useQueryClient();
  const [sentenceRows, setSentenceRows] = useState(sentences);
  const allowed =
    rows.every((row) => canPublishEntry(profile, row)) &&
    sentenceRows.every(canPublishSentence);
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [started, setStarted] = useState(false);
  const candidates = useQuery({
    enabled: canReadSentences,
    queryKey: ["shared-sentences", "batch-candidates", keyword, page],
    queryFn: () =>
      api.sentences.list({
        view: "draft",
        q: keyword || undefined,
        page,
        page_size: 20
      })
  });
  const [input, setInput] = useState<BatchPublicationInputV3>(() => ({
    schema_version: 3,
    sentences: sentences.map((row) => ({
      sentence_id: row.id,
      base_revision: row.revision,
      base_lifecycle_revision: row.lifecycle_revision
    })),
    items: rows.map((row) => ({
      entry_id: row.id,
      base_revision: row.revision!,
      base_lifecycle_revision: row.lifecycle_revision!
    }))
  }));
  const key = useRef(crypto.randomUUID());
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useLexiconEditorMessageState();
  const [audioReadyScope, setAudioReadyScope] = useState<string>();
  const [attemptLocked, setAttemptLocked] = useState(false);
  const audioTargets: PublicationAudioTarget[] = [
    ...input.items.map((item) => ({
      owner: "entry" as const,
      id: item.entry_id,
      revision: item.base_revision,
      lifecycleRevision: item.base_lifecycle_revision,
      label: wordListLabel(rows.find((row) => row.id === item.entry_id)!)
    })),
    ...(input.sentences ?? []).map((item) => ({
      owner: "sentence" as const,
      id: item.sentence_id,
      revision: item.base_revision,
      lifecycleRevision: item.base_lifecycle_revision,
      label: editableEnglishText(
        sentenceRows.find((row) => row.id === item.sentence_id)!.content
          .sentence.en_text
      )
        .map((v) => v.text)
        .join(" / ")
        .slice(0, 100)
    }))
  ];
  const audioScope = publicationAudioScope(audioTargets);
  const audioReady = audioReadyScope === audioScope;
  const onAudioReady = useCallback(
    (ready: boolean) => setAudioReadyScope(ready ? audioScope : undefined),
    [audioScope]
  );
  const [conflict, setConflict] = useState(false);
  const [surface, setSurface] = useState<{
    entryId: string;
    page: SurfaceMatchPageV3;
  }>();
  const snapshot = useSurfaceSnapshot(
    surface?.page,
    surface?.page.snapshot_id ?? "batch-none"
  );

  const submit = async (request = input) => {
    if (
      busy.current ||
      !allowed ||
      !audioReady ||
      conflict ||
      request.items.length + (request.sentences?.length ?? 0) === 0
    )
      return;
    setStarted(true);
    setAttemptLocked(true);
    busy.current = true;
    setPending(true);
    setError(undefined);
    try {
      await api.words.publishBatchV3(key.current, request);
      await qc.invalidateQueries({ queryKey: wordKeys.all });
      await qc.invalidateQueries({ queryKey: ["shared-sentences"] });
      onPublished();
    } catch (failure) {
      if (failure instanceof HttpError && failure.status < 500) {
        const entryId = failure.meta?.word_id;
        const page = failure.meta?.surface_match_page;
        key.current = crypto.randomUUID();
        if (
          entryId &&
          rows.some((row) => row.id === entryId) &&
          isSurfaceMatchPageAny(page)
        ) {
          setSurface({ entryId, page });
        } else {
          setSurface(undefined);
          const name = rows.find((row) => row.id === entryId);
          const sentenceId = failure.meta?.sentence_id;
          const message = failure.field_issues[0]?.message ?? failure.message;
          setError(
            name
              ? uiMessage("batch_entry_error", {
                  label: wordListLabel(name),
                  message
                })
              : sentenceId
                ? uiMessage("batch_sentence_error", { id: sentenceId, message })
                : message
          );
          // Reopen from refreshed, explicitly reselected records after deterministic failures.
          setConflict(true);
        }
      } else {
        setError(uiMessage("batch_unknown_result"));
      }
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  return (
    <Modal
      open
      title={t("batch_title", {
        entries: t("batch_entry_count", { count: rows.length }),
        sentences: t("batch_sentence_count", { count: sentenceRows.length })
      })}
      width={720}
      onCancel={onClose}
      cancelButtonProps={{ disabled: pending }}
      closable={!pending}
      keyboard={!pending}
      mask={{ closable: false }}
      cancelText={t("batch_cancel")}
      okText={t("batch_publish")}
      confirmLoading={pending}
      okButtonProps={{
        "aria-label": t("batch_publish"),
        disabled:
          !allowed ||
          !audioReady ||
          conflict ||
          Boolean(surface) ||
          rows.length + sentenceRows.length === 0 ||
          rows.length + sentenceRows.length > 50
      }}
      onOk={() => void submit()}
    >
      <Space orientation="vertical" style={{ width: "100%" }}>
        <Alert
          type="info"
          title={t("batch_atomic_title")}
          description={t("batch_atomic_help")}
        />
        <List
          size="small"
          dataSource={rows}
          renderItem={(row) => <List.Item>{wordListLabel(row)}</List.Item>}
        />
        <BatchPublicationAudioReviewPanel
          targets={audioTargets}
          allowed={allowed}
          locked={attemptLocked || pending || conflict}
          onStart={() => setStarted(true)}
          onReady={onAudioReady}
        />
        <Typography.Text>{t("batch_sentences")}</Typography.Text>
        <Input
          aria-label={t("batch_search_label")}
          placeholder={t("batch_search_placeholder")}
          disabled={started || !canReadSentences}
          value={keyword}
          onChange={(event) => {
            setKeyword(event.target.value);
            setPage(1);
          }}
        />
        <Select
          mode="multiple"
          aria-label={t("batch_select_sentences")}
          style={{ width: "100%" }}
          disabled={started || !canReadSentences}
          loading={candidates.isFetching}
          value={sentenceRows.map((row) => row.id)}
          optionFilterProp="label"
          options={Array.from(
            new Map(
              [...sentenceRows, ...(candidates.data?.items ?? [])].map(
                (row) => [row.id, row]
              )
            ).values()
          ).map((row) => ({
            value: row.id,
            disabled: !canPublishSentence(row),
            label: t(
              row.withdrawn_at
                ? "batch_candidate_withdrawn"
                : "batch_candidate",
              {
                text: editableEnglishText(row.content.sentence.en_text)
                  .map((variant) => variant.text)
                  .join(" / ")
                  .slice(0, 100),
                id: row.id.slice(0, 8),
                revision: row.revision
              }
            )
          }))}
          onChange={(ids: string[]) => {
            const available = new Map(
              [...sentenceRows, ...(candidates.data?.items ?? [])].map(
                (row) => [row.id, row]
              )
            );
            const selected = ids.map((id) => available.get(id)!);
            setSentenceRows(selected);
            key.current = crypto.randomUUID();
            setInput((current) => ({
              ...current,
              sentences: selected.map((row) => ({
                sentence_id: row.id,
                base_revision: row.revision,
                base_lifecycle_revision: row.lifecycle_revision
              }))
            }));
          }}
        />
        {candidates.isError && (
          <Alert
            type="error"
            title={t("batch_candidates_failed")}
            action={
              <Button onClick={() => void candidates.refetch()}>
                {t("batch_retry")}
              </Button>
            }
          />
        )}
        <Pagination
          size="small"
          current={page}
          pageSize={20}
          total={candidates.data?.total}
          disabled={started || !canReadSentences}
          showSizeChanger={false}
          onChange={setPage}
        />
        {rows.length + sentenceRows.length > 50 && (
          <Alert type="warning" title={t("batch_too_many")} />
        )}
        {error && <Alert type="error" title={error} />}
        {conflict && <Typography.Text>{t("batch_reselect")}</Typography.Text>}
        {surface && (
          <LifecycleSurfaceConfirmation
            action="publish"
            state={snapshot}
            confirming={pending}
            onConfirm={() => {
              if (!canAcknowledgeSurfaceSnapshot(snapshot)) return;
              const token = snapshot.surface_confirmation_token;
              if (!token) return;
              const next = {
                ...input,
                items: input.items.map((item) =>
                  item.entry_id === surface.entryId
                    ? { ...item, confirmed_surface_match_token: token }
                    : item
                )
              };
              key.current = crypto.randomUUID();
              setInput(next);
              setSurface(undefined);
              void submit(next);
            }}
            onRestart={() => {
              setSurface(undefined);
              setConflict(true);
              setError(uiMessage("batch_surface_expired"));
            }}
          />
        )}
      </Space>
    </Modal>
  );
}

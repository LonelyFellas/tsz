import {
  useLexiconEditorTranslation,
  useLexiconEditorMessageState,
  createLexiconEditorMessage
} from "../dictionary/i18n/editor";
import { useDraftRecovery } from "@/features/recovery/useDraftRecovery";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { expandFormContents } from "@tsz/shared";
import { UNSAFE_DataRouterContext, useBlocker } from "react-router-dom";
import {
  currentSentenceCandidates,
  savedSenseTargets,
  sameSentenceTarget,
  matchesSentenceTarget
} from "./associationModel";
import { Alert, Button, Flex, Space, Typography } from "@tsz/ui/admin/display";
import { App, Modal } from "@tsz/ui/admin/overlays";
import { Radio, Select } from "@tsz/ui/admin/forms";
import type {
  AdminWordV3,
  Dialect,
  RichTextVariantV3,
  SharedSentence,
  SharedSentenceAnnotation,
  SharedSentenceContent
} from "@tsz/types";
import { HttpError } from "@tsz/api-client";
import { DraftComparison } from "../dictionary/DraftComparison";
import { canAdminResourceAction, hasAdminPermission } from "@tsz/shared/auth";
import { api, useAuthStore } from "@/lib/auth";
import { env } from "@/lib/env";
import { PronunciationPreviewProvider } from "../dictionary/word-creation/PronunciationPreview";
import { V3VoiceTextField } from "../dictionary/word-creation-v3/components/V3VoiceTextField";
import { useReadingPreviewAdapter } from "../dictionary/word-creation-v3/components/useReadingPreviewAdapter";
import { V3SentenceTranslationsField } from "../dictionary/word-creation-v3/components/V3SentenceTranslationsField";
import { editableEnglishText } from "../dictionary/word-creation-v3/meaningsModel";
import { SharedSentenceAssociationPicker } from "./SharedSentenceAssociationPicker";
import { newSentence } from "./model";
import "./SentenceEditor.css";
import { VoiceEditorModal } from "../dictionary/word-creation-v3/components/VoiceEditorModal";
import { V3EditorTitle } from "../dictionary/word-creation-v3/components/V3EditorTitle";
import { dialectLabel } from "../dictionary/word-creation-v3/presentation";
const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"].map((value) => ({
  value,
  label: value
}));

export function SentenceEditor({
  sentence,
  sourceWord,
  sourceSenseId,
  rowIndex,
  initialLevel,
  registerLeaveGuard,
  onClose,
  onSaved
}: {
  sentence?: SharedSentence;
  sourceWord?: AdminWordV3;
  sourceSenseId?: string;
  rowIndex?: number;
  initialLevel?: SharedSentence["content"]["sentence"]["level"];
  registerLeaveGuard?: (guard?: () => Promise<boolean>) => void;
  onClose: () => void;
  onSaved: (sentence: SharedSentence) => void;
}) {
  const { t } = useLexiconEditorTranslation();
  const readingForms = useMemo(
    () => (sourceWord ? expandFormContents(sourceWord.forms) : undefined),
    [sourceWord]
  );
  const createReadingPreviewAdapter = useReadingPreviewAdapter(
    sourceWord?.id,
    readingForms
  );
  const profile = useAuthStore((state) => state.profile);
  const [recoveredCreation, setRecoveredCreation] = useState<SharedSentence>();
  const storedSentence = sentence ?? recoveredCreation;
  const canEdit = storedSentence
    ? canAdminResourceAction(
        profile,
        "sentences",
        "edit",
        storedSentence.created_by_admin_id
      )
    : hasAdminPermission(profile, "sentences.create");
  const canAssociate = storedSentence
    ? canAdminResourceAction(
        profile,
        "sentences",
        "associate",
        storedSentence.created_by_admin_id
      )
    : hasAdminPermission(profile, "sentences.create");
  const allowed = canEdit || canAssociate;
  const { modal } = App.useApp();
  const sourceEntryId = sourceWord?.id;
  const currentTargets =
    sourceWord && sourceSenseId
      ? savedSenseTargets(sourceWord, sourceSenseId)
      : [];
  const contextLabel = currentTargets[0]
    ? `${currentTargets[0].surface.headword} · ${currentTargets[0].gloss}`
    : t("panel_current_meaning");
  const [content, setContent] = useState<SharedSentenceContent>(() => {
    if (sentence) return structuredClone(sentence.content);
    const fresh = newSentence();
    if (initialLevel) fresh.sentence.level = initialLevel;
    return fresh;
  });
  const [pendingEditor, setPendingEditor] = useState(false);
  const initialContent = useRef(JSON.stringify(content));
  const dirty =
    pendingEditor || JSON.stringify(content) !== initialContent.current;
  const router = useContext(UNSAFE_DataRouterContext);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  const [targetLabels, setTargetLabels] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (sentence?.entries ?? []).flatMap((entry) =>
        entry.senses.map((sense) => [
          `${entry.id}:${sense.id}`,
          `${entry.headword} · ${sense.gloss}`
        ])
      )
    )
  );
  const [saving, setSaving] = useState(false);
  const saveActionRef = useRef<(() => Promise<boolean>) | null>(null);
  const afterLeaveSave = useRef<(() => void) | undefined>(undefined);
  const saveBeforeLeave = async (afterSave?: () => void) => {
    let accepted = false;
    afterLeaveSave.current = () => {
      accepted = true;
      afterSave?.();
    };
    try {
      if (env.VOICE_EDITOR && !saveActionRef.current) {
        setError(
          createLexiconEditorMessage(
            "panel_text_or_voices_are_still_being_prepared_try_saving_again_shortly"
          )
        );
        return false;
      }
      // 成功回调可能立即卸载编辑器；离开结果以业务保存成功为准。
      const saved = env.VOICE_EDITOR
        ? await saveActionRef.current?.()
        : await finish(afterLeaveSave.current);
      return saved === true || accepted;
    } finally {
      afterLeaveSave.current = undefined;
    }
  };
  const [dialect, setDialect] = useState<Dialect>("common");
  const [pendingAnnotation, setPendingAnnotation] = useState(false);
  const [error, setError] = useLexiconEditorMessageState("");
  const [baseRevision, setBaseRevision] = useState(sentence?.revision ?? 0);
  const [conflict, setConflict] = useState(false);
  const [latest, setLatest] = useState<SharedSentence>();
  const recovery = useDraftRecovery({
    entity: `sentence:${sentence?.id ?? `new:${sourceEntryId}:${sourceSenseId}`}`,
    revision: baseRevision,
    value: content,
    dirty,
    busy: saving,
    restore: setContent
  });
  const refreshConflict = async () => {
    if (!storedSentence || saving) return;
    setSaving(true);
    try {
      setLatest(await api.sentences.get(storedSentence.id, "draft"));
      setError("");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : createLexiconEditorMessage(
              "panel_could_not_fetch_the_latest_draft_try_again"
            )
      );
    } finally {
      setSaving(false);
    }
  };
  const resolveConflict = (discard: boolean) => {
    if (!latest) return;
    setBaseRevision(latest.revision);
    initialContent.current = JSON.stringify(latest.content);
    if (discard) {
      setContent(structuredClone(latest.content));
      recovery.discard();
    }
    setConflict(false);
    setError("");
  };
  const finish = async (afterSave?: () => void) => {
    if (conflict || saving || !allowed) return false;
    if (pendingEditor) {
      setError(
        createLexiconEditorMessage(
          "panel_complete_pending_text_operations_before_saving_the_example"
        )
      );
      return false;
    }
    if (pendingAnnotation) {
      setError(
        createLexiconEditorMessage(
          "panel_confirm_the_current_annotation_or_cancel_the_selected_segments_first"
        )
      );
      return;
    }
    if (!canSave) {
      setError(
        sourceEntryId
          ? createLexiconEditorMessage(
              "panel_enter_the_text_and_translation_and_link_the_current_meaning_within_the_sent"
            )
          : createLexiconEditorMessage(
              "panel_enter_example_text_and_at_least_one_translation"
            )
      );
      return false;
    }
    setSaving(true);
    setError("");
    try {
      const next = structuredClone(content);
      // Empty starter rows are editing affordances, not published translations.
      if (canEdit) {
        next.sentence.zh_translations = next.sentence.zh_translations.filter(
          (t) => t.content.text.trim()
        );
        if (!next.sentence.zh_translations.length) {
          setError(
            createLexiconEditorMessage("panel_enter_at_least_one_translation")
          );
          return;
        }
        const alias =
          next.sentence.zh_translations.find(
            (t) => t.id === next.sentence.zh_text_id
          ) ?? next.sentence.zh_translations[0]!;
        next.sentence.zh_text_id = alias.id;
        next.sentence.zh_text = alias.content;
      }
      let saved: SharedSentence;
      if (storedSentence)
        saved = await api.sentences.update(storedSentence.id, {
          base_revision: baseRevision,
          ...(sourceEntryId
            ? {
                context_entry_id: sourceEntryId,
                context_sense_id: sourceSenseId
              }
            : {}),
          content: next
        });
      else {
        const createInput = {
          ...(sourceEntryId && sourceSenseId
            ? { source_entry_id: sourceEntryId, source_sense_id: sourceSenseId }
            : {}),
          content: next
        };
        try {
          saved = await api.sentences.create(createInput);
        } catch (createError) {
          if (
            createError instanceof HttpError &&
            createError.status >= 400 &&
            createError.status < 500 &&
            createError.code !== "idempotency_conflict"
          )
            throw createError;
          let existing: SharedSentence;
          try {
            existing = await api.sentences.get(next.sentence.id, "draft");
          } catch {
            throw createError;
          }
          if (!existing) throw createError;
          const canUpdate =
            canAdminResourceAction(
              profile,
              "sentences",
              "edit",
              existing.created_by_admin_id
            ) ||
            canAdminResourceAction(
              profile,
              "sentences",
              "associate",
              existing.created_by_admin_id
            );
          if (
            existing.revision === 1 &&
            existing.created_by_admin_id === profile?.id &&
            !canUpdate
          ) {
            const cannotUpdate = new Error(
              t(
                "panel_the_example_was_created_but_your_account_cannot_edit_it_new_input_is_retain"
              )
            );
            if (
              createError instanceof HttpError &&
              createError.code === "idempotency_conflict"
            )
              throw cannotUpdate;
            // 用原创建请求确认服务端结果，不把创建权限升级为编辑权限。
            try {
              saved = await api.sentences.create(createInput);
            } catch (retryError) {
              if (
                retryError instanceof HttpError &&
                retryError.code === "idempotency_conflict"
              )
                throw cannotUpdate;
              throw retryError;
            }
          } else {
            if (
              existing.revision !== 1 ||
              existing.created_by_admin_id !== profile?.id
            ) {
              setRecoveredCreation(existing);
              setBaseRevision(existing.revision);
              initialContent.current = JSON.stringify(existing.content);
              setConflict(true);
              setLatest(existing);
              setError(
                createLexiconEditorMessage(
                  "panel_the_example_was_created_and_its_content_has_changed_compare_drafts_before_s"
                )
              );
              return false;
            }
            try {
              saved = await api.sentences.update(existing.id, {
                base_revision: existing.revision,
                ...(sourceEntryId
                  ? {
                      context_entry_id: sourceEntryId,
                      context_sense_id: sourceSenseId
                    }
                  : {}),
                content: next
              });
            } catch (updateError) {
              if (
                updateError instanceof HttpError &&
                updateError.code === "revision_conflict"
              ) {
                setRecoveredCreation(existing);
                setBaseRevision(existing.revision);
                initialContent.current = JSON.stringify(existing.content);
              }
              throw updateError;
            }
          }
        }
      }
      recovery.discard();
      afterSave?.();
      onSaved(saved);
      return true;
    } catch (e) {
      if (!sentence && e instanceof HttpError && e.status === 403) {
        // 拒绝保存不应锁住新建时的输入；仍可恢复原请求或修正无权修改的字段。
        setRecoveredCreation(undefined);
      }
      if (
        e instanceof HttpError &&
        e.status === 409 &&
        e.code === "revision_conflict"
      ) {
        setConflict(true);
        setLatest(undefined);
      }
      setError(
        e instanceof Error
          ? e.message
          : createLexiconEditorMessage(
              "panel_saving_failed_input_is_retained_try_again"
            )
      );
    } finally {
      setSaving(false);
    }
  };
  const close = () =>
    modal.confirm({
      title: t("panel_discard_this_unfinished_example_edit"),
      content: t(
        "panel_unsaved_changes_and_local_backups_will_be_discarded_previously_saved_exampl"
      ),
      onOk: () => {
        recovery.discard();
        onClose();
      }
    });
  const rows = editableEnglishText(content.sentence.en_text);
  const row = rows.find((item) => item.dialect === dialect) ?? rows[0]!;
  const currentLinked = content.annotations.some((annotation) => {
    const source = rows.find(
      (item) => item.dialect === annotation.source_dialect
    );
    return (
      !!source &&
      currentTargets.some(
        (candidate) =>
          sameSentenceTarget(
            annotation.target,
            candidate.target,
            annotation.source_dialect
          ) &&
          matchesSentenceTarget(
            source.text,
            annotation.source_segments,
            annotation.source_dialect,
            candidate.surface
          )
      )
    );
  });
  const possible = currentLinked
    ? []
    : currentTargets.flatMap((candidate) =>
        currentSentenceCandidates(
          row.text,
          row.dialect,
          candidate.surface,
          content.annotations
        ).map((segments) => ({ ...candidate, segments }))
      );
  // 一个片段对应多个词形身份时，交给完整选择器确认，不替用户猜。
  const candidates = possible.filter(
    (candidate) =>
      possible.filter(
        (other) =>
          JSON.stringify(other.segments) === JSON.stringify(candidate.segments)
      ).length === 1
  );
  const canSave =
    !pendingEditor &&
    !pendingAnnotation &&
    !content.annotations.some(
      (annotation) => annotation.target.state === "entry_only"
    ) &&
    content.sentence.zh_translations.some((t) => t.content.text.trim()) &&
    rows.some((r) => r.text.trim()) &&
    (!sourceEntryId || currentLinked);
  useEffect(() => {
    if (!registerLeaveGuard) return;
    registerLeaveGuard(
      dirty
        ? () =>
            new Promise<boolean>((resolve) => {
              const dialog = modal.confirm({
                title: t("panel_this_example_has_unsaved_changes"),
                content: t(
                  "panel_examples_are_saved_separately_saving_the_meaning_does_not_save_these_change"
                ),
                onCancel: () => resolve(false),
                footer: (
                  <Space>
                    <Button
                      onClick={() => {
                        dialog.destroy();
                        resolve(false);
                      }}
                    >
                      {t("panel_continue_editing")}
                    </Button>
                    <Button
                      disabled={saving}
                      onClick={() => {
                        recovery.discard();
                        dialog.destroy();
                        resolve(true);
                      }}
                    >
                      {t("panel_discard_changes")}
                    </Button>
                    <Button
                      type="primary"
                      disabled={!canSave || saving}
                      onClick={async () => {
                        dialog.update({
                          closable: false,
                          footer: null,
                          content: t("panel_saving_example")
                        });
                        const saved = await saveBeforeLeave();
                        dialog.destroy();
                        resolve(saved === true);
                      }}
                    >
                      {t("panel_save_example_and_leave")}
                    </Button>
                  </Space>
                )
              });
            })
        : undefined
    );
    return () => registerLeaveGuard(undefined);
  });
  const english = content.sentence.en_text;
  const slot =
    english.mode === "unified"
      ? undefined
      : english[row.dialect === "us" ? "us" : "uk"];
  const variant =
    english.mode === "unified"
      ? english.common
      : slot!.state === "ready"
        ? slot!.variant
        : undefined;
  const changeVariant = (
    patch: Partial<RichTextVariantV3>,
    annotations?: SharedSentenceAnnotation[]
  ) => {
    setContent((current) => {
      const next = structuredClone(current);
      const target = next.sentence.en_text;
      if (target.mode === "unified") Object.assign(target.common, patch);
      else {
        const targetSlot = target[row.dialect === "us" ? "us" : "uk"];
        if (targetSlot.state === "ready")
          Object.assign(targetSlot.variant, patch);
      }
      if (annotations)
        next.annotations = [
          ...next.annotations.filter(
            (item) => item.source_dialect !== row.dialect
          ),
          ...annotations
        ];
      const nextRows = editableEnglishText(next.sentence.en_text);
      next.annotations = next.annotations.filter((annotation) => {
        const source = nextRows.find(
          (item) => item.dialect === annotation.source_dialect
        );
        return (
          source &&
          annotation.source_segments.every(
            (segment) =>
              Array.from(source.text)
                .slice(segment.start, segment.end)
                .join("") === segment.surface
          )
        );
      });
      return next;
    });
  };
  return (
    <PronunciationPreviewProvider>
      <VoiceEditorModal
        open
        centered
        styles={{
          body: {
            maxHeight: "min(70vh, calc(100dvh - 160px))",
            overflowY: "auto"
          }
        }}
        title={
          <V3EditorTitle
            index={rowIndex}
            title={t("panel_examples_2")}
            details={t("panel_label_4", {
              p0: sentence ? "" : t("panel_new"),
              p1: content.sentence.level,
              p2: dialectLabel(row.dialect, t)
            })}
          />
        }
        footer={
          <Flex justify="end" gap="small">
            <Button
              aria-label={t("panel_cancel_example_editing")}
              disabled={saving}
              onClick={close}
            >
              {t("panel_cancel")}
            </Button>
            <Button
              type="primary"
              aria-label={t("panel_save_example")}
              loading={saving}
              disabled={conflict || !allowed || !canSave}
              onClick={() => void saveBeforeLeave()}
            >
              {t("panel_save_draft")}
            </Button>
          </Flex>
        }
        onCancel={close}
        closable={!saving}
        keyboard={!saving}
      >
        <Flex className="sentence-editor" vertical gap="middle">
          {recovery.notice}
          {router && !registerLeaveGuard && (
            <SentenceNavigationGuard
              dirty={dirty}
              saving={saving}
              canSave={canSave}
              discard={recovery.discard}
              save={saveBeforeLeave}
            />
          )}
          <Flex
            className="sentence-editor-meta"
            justify="space-between"
            align="center"
            wrap
            gap="small"
          >
            <Typography.Text type="secondary">
              {sentence
                ? t("sentence_publish_impact", {
                    entries: t("publication_entry_count", {
                      count: sentence.entries.length
                    }),
                    meanings: t("preview_meaning_count", {
                      count: sentence.entries.reduce(
                        (count, entry) => count + entry.senses.length,
                        0
                      )
                    })
                  })
                : t(
                    "panel_examples_are_saved_separately_as_drafts_after_publishing_their_links_determ"
                  )}
            </Typography.Text>
            <Space>
              <Typography.Text>{t("panel_level")}</Typography.Text>
              <Select
                aria-label={t("panel_example_level")}
                value={content.sentence.level}
                options={LEVELS}
                disabled={saving || !canEdit}
                onChange={(level) =>
                  setContent((current) => ({
                    ...current,
                    sentence: { ...current.sentence, level }
                  }))
                }
              />
            </Space>
          </Flex>
          {error && (
            <Alert
              type="error"
              title={error}
              description={t("panel_input_is_retained")}
            />
          )}
          {conflict && (
            <Alert
              type="warning"
              title={t("panel_example_version_conflict")}
              description={t(
                "panel_local_input_is_retained_compare_the_latest_draft_and_choose_whether_to_keep"
              )}
              action={
                <Space wrap>
                  <Button
                    loading={saving}
                    onClick={() => void refreshConflict()}
                  >
                    {t("panel_refresh_and_compare")}
                  </Button>
                  {latest && (
                    <>
                      <Button
                        disabled={saving}
                        onClick={() => resolveConflict(false)}
                      >
                        {t("panel_keep_local_changes")}
                      </Button>
                      <Button
                        disabled={saving}
                        danger
                        onClick={() =>
                          modal.confirm({
                            title: t("panel_discard_local_changes"),
                            content: t(
                              "panel_unsaved_input_will_be_discarded_and_replaced_with_revision",
                              { p0: latest.revision }
                            ),
                            onOk: () => resolveConflict(true)
                          })
                        }
                      >
                        {t("panel_discard_local_changes_2")}
                      </Button>
                    </>
                  )}
                </Space>
              }
            />
          )}
          {latest && (
            <DraftComparison local={content} remote={latest.content} />
          )}
          {content.annotations.some(
            (annotation) => annotation.target.state === "entry_only"
          ) && (
            <Alert
              type="warning"
              title={t("panel_select_meanings_for_historical_links")}
              description={t(
                "panel_click_the_original_linked_segments_to_select_a_specific_meaning_or_clear_th"
              )}
            />
          )}
          {!sourceEntryId &&
            !content.annotations.some(
              (annotation) => annotation.target.state === "linked"
            ) && (
              <Alert
                type="info"
                title={t(
                  "panel_no_specific_meaning_is_linked_so_this_will_not_be_used_for_the_correspondin"
                )}
              />
            )}
          {sourceEntryId && (
            <Alert
              type={currentLinked ? "success" : "info"}
              title={
                currentLinked
                  ? t("panel_current_meaning_linked", { p0: contextLabel })
                  : t("panel_link_the_current_meaning", { p0: contextLabel })
              }
              description={
                !currentLinked
                  ? t(
                      "panel_link_at_least_one_word_or_phrase_to_this_meaning_before_completing"
                    )
                  : undefined
              }
            />
          )}
          {candidates.length > 0 && (
            <Flex
              wrap
              gap="small"
              aria-label={t("panel_matching_positions_for_current_meaning")}
            >
              {candidates.map(({ segments, target, gloss, surface }) => (
                <Button
                  key={segments[0]!.start}
                  size="small"
                  disabled={
                    !canAssociate ||
                    saving ||
                    pendingEditor ||
                    pendingAnnotation
                  }
                  onClick={() => {
                    setTargetLabels((labels) => ({
                      ...labels,
                      [`${sourceEntryId}:${sourceSenseId}`]: `${surface.headword} · ${gloss}`
                    }));
                    setContent((current) => ({
                      ...current,
                      annotations: [
                        ...current.annotations,
                        {
                          id: crypto.randomUUID(),
                          source_dialect: row.dialect,
                          source_segments: segments,
                          target
                        }
                      ]
                    }));
                  }}
                >
                  {t("panel_confirm_link")}{" "}
                  {segments.map((s) => s.surface).join(" … ")}
                  {t("panel_position")} {segments[0]!.start + 1}）
                </Button>
              ))}
            </Flex>
          )}
          {rows.length > 1 && (
            <Radio.Group
              aria-label={t("panel_example_dialect")}
              value={row.dialect}
              disabled={saving || pendingEditor}
              onChange={(event) => setDialect(event.target.value)}
              options={rows.map((item) => ({
                value: item.dialect,
                label:
                  item.dialect === "uk"
                    ? t("panel_british")
                    : t("panel_american")
              }))}
            />
          )}
          {variant && (
            <V3VoiceTextField<SharedSentenceAnnotation>
              key={row.variant_id}
              mode="association"
              presentation="editor"
              showDone={false}
              showSaveButton={false}
              collapseVoiceSettings
              afterText={
                <V3SentenceTranslationsField
                  sentence={content.sentence}
                  index={0}
                  disabled={saving || !canEdit}
                  onChange={(zh_translations) =>
                    setContent((current) => ({
                      ...current,
                      sentence: { ...current.sentence, zh_translations }
                    }))
                  }
                />
              }
              saveActionRef={saveActionRef}
              onSave={() =>
                finish(afterLeaveSave.current).then((value) => value === true)
              }
              doneLoading={saving}
              doneDisabled={conflict || !allowed || !canSave}
              onCommit={(result) =>
                changeVariant(
                  {
                    value: result.value,
                    reading_links: result.readingLinks,
                    voice_profile: result.voiceProfile,
                    audio_assets: result.audioAssets
                  },
                  result.textLinks
                )
              }
              restoreTextLinksOnCorrection
              audioUploadEnabled
              value={variant.value}
              textLinks={content.annotations.filter(
                (item) => item.source_dialect === row.dialect
              )}
              readingLinks={variant.reading_links}
              createReadingPreviewAdapter={createReadingPreviewAdapter}
              ariaLabel={t("panel_example_text")}
              nodeId={row.variant_id}
              field="value"
              placeholder={t("panel_enter_an_english_example")}
              dialect={row.dialect}
              readOnly={saving}
              contentReadOnly={!canEdit}
              associationsReadOnly={!canAssociate}
              onAssociationPendingChange={setPendingAnnotation}
              onDraftPendingChange={setPendingEditor}
              onAssociationsChange={(annotations) =>
                changeVariant({}, annotations)
              }
              onChange={(value, annotations, reading_links) =>
                changeVariant({ value, reading_links }, annotations)
              }
              voiceProfile={variant.voice_profile}
              onVoiceProfileChange={(voice_profile) =>
                changeVariant({ voice_profile })
              }
              audioAssets={variant.audio_assets}
              onAudioAssetsChange={(audio_assets) =>
                changeVariant({ audio_assets })
              }
              renderAssociationPicker={(props) => (
                <SharedSentenceAssociationPicker
                  {...props}
                  key={`${props.kind}:${props.selected?.id ?? props.segments.map((segment) => `${segment.start}:${segment.end}`).join(",")}`}
                  dialect={row.dialect}
                  labels={targetLabels}
                  sourceEntryId={sourceEntryId}
                  sourceSenseId={sourceSenseId}
                  sourcePosId={
                    sourceWord?.meanings.pos.find((pos) =>
                      pos.senses.some((sense) => sense.id === sourceSenseId)
                    )?.pos_id
                  }
                  sourceForms={sourceWord?.forms}
                  onTargetLabel={(id, label) =>
                    setTargetLabels((current) => ({
                      ...current,
                      [id]: label
                    }))
                  }
                />
              )}
            />
          )}
        </Flex>
      </VoiceEditorModal>
    </PronunciationPreviewProvider>
  );
}

function SentenceNavigationGuard({
  dirty,
  saving,
  canSave,
  discard,
  save
}: {
  dirty: boolean;
  saving: boolean;
  canSave: boolean;
  discard: () => void;
  save: (afterSave?: () => void) => Promise<boolean | undefined>;
}) {
  const { t } = useLexiconEditorTranslation();
  const blocker = useBlocker(dirty);
  return blocker.state === "blocked" ? (
    <Modal
      open
      title={t("panel_this_example_has_unsaved_changes")}
      closable={!saving}
      onCancel={() => blocker.reset()}
      footer={
        <Space>
          <Button disabled={saving} onClick={() => blocker.reset()}>
            {t("panel_continue_editing")}
          </Button>
          <Button
            disabled={saving}
            onClick={() => {
              discard();
              blocker.proceed();
            }}
          >
            {t("panel_discard_changes")}
          </Button>
          <Button
            type="primary"
            loading={saving}
            disabled={!canSave}
            onClick={async () => {
              if (!(await save(blocker.proceed))) blocker.reset();
            }}
          >
            {t("panel_save_example_and_leave")}
          </Button>
        </Space>
      }
    >
      {t(
        "panel_examples_are_saved_separately_saving_the_meaning_does_not_save_these_change"
      )}
    </Modal>
  ) : null;
}

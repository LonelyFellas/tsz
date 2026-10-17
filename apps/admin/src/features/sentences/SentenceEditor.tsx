import { AdminDialog } from "@/components/AdminDialog";
import { Select as MuiSelect, MenuItem as MuiMenuItem } from "@mui/material";
import {
  Alert as MuiAlert,
  AlertTitle as MuiAlertTitle,
  Button as MuiButton,
  Stack as MuiStack,
  Typography as MuiTypography
} from "@mui/material";
import { useDraftRecovery } from "@/features/recovery/useDraftRecovery";
import { useContext, useEffect, useRef, useState } from "react";
import { UNSAFE_DataRouterContext, useBlocker } from "react-router-dom";
import {
  currentSentenceCandidates,
  savedSenseTargets,
  sameSentenceTarget,
  matchesSentenceTarget
} from "./associationModel";
import { RadioGroup, FormControlLabel, Radio } from "@mui/material";
import { ConfirmDialog } from "@/components/ConfirmDialog";
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
import { PronunciationPreviewProvider } from "../dictionary/word-creation/PronunciationPreview";
import { V3VoiceTextField } from "../dictionary/word-creation-v3/components/V3VoiceTextField";
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
  const profile = useAuthStore((state) => state.profile);
  const canEdit = sentence
    ? canAdminResourceAction(
        profile,
        "sentences",
        "edit",
        sentence.created_by_admin_id
      )
    : hasAdminPermission(profile, "sentences.create");
  const canAssociate = sentence
    ? canAdminResourceAction(
        profile,
        "sentences",
        "associate",
        sentence.created_by_admin_id
      )
    : hasAdminPermission(profile, "sentences.create");
  const allowed = canEdit || canAssociate;
  const [confirmation, setConfirmation] = useState<{
    title: string;
    content: string;
    run: () => void;
  }>();
  const [leaveRequested, setLeaveRequested] = useState(false);
  const [leaveSaving, setLeaveSaving] = useState(false);
  const leaveResolver = useRef<((leave: boolean) => void) | undefined>(
    undefined
  );
  const settleLeave = (leave: boolean) => {
    const resolve = leaveResolver.current;
    leaveResolver.current = undefined;
    setLeaveRequested(false);
    resolve?.(leave);
  };
  useEffect(
    () => () => {
      leaveResolver.current?.(false);
    },
    []
  );
  const sourceEntryId = sourceWord?.id;
  const currentTargets =
    sourceWord && sourceSenseId
      ? savedSenseTargets(sourceWord, sourceSenseId)
      : [];
  const contextLabel = currentTargets[0]
    ? `${currentTargets[0].surface.headword} · ${currentTargets[0].gloss}`
    : "当前词义";
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
  const [dialect, setDialect] = useState<Dialect>("common");
  const [pendingAnnotation, setPendingAnnotation] = useState(false);
  const [error, setError] = useState("");
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
    if (!sentence || saving) return;
    setSaving(true);
    try {
      setLatest(await api.sentences.get(sentence.id, "draft"));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "获取最新草稿失败，请重试");
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
      setError("请先处理正文中的未完成操作，再保存例句。");
      return false;
    }
    if (pendingAnnotation) {
      setError("请先确认当前句内标注，或取消所选片段。");
      return;
    }
    if (!canSave) {
      setError("请填写译文，并确认句中已有效关联当前词义");
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
          setError("请至少填写一条译文");
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
      if (sentence)
        saved = await api.sentences.update(sentence.id, {
          base_revision: baseRevision,
          ...(sourceEntryId
            ? {
                context_entry_id: sourceEntryId,
                context_sense_id: sourceSenseId
              }
            : {}),
          content: next
        });
      else if (sourceEntryId && sourceSenseId)
        saved = await api.sentences.create({
          source_entry_id: sourceEntryId,
          source_sense_id: sourceSenseId,
          content: next
        });
      else throw new Error("请先保存词义，再从具体词义内创建例句");
      recovery.discard();
      afterSave?.();
      onSaved(saved);
      return true;
    } catch (e) {
      if (
        e instanceof HttpError &&
        e.status === 409 &&
        e.code === "revision_conflict"
      ) {
        setConflict(true);
        setLatest(undefined);
      }
      setError(e instanceof Error ? e.message : "保存失败，输入已保留，请重试");
    } finally {
      setSaving(false);
    }
  };
  const close = () =>
    setConfirmation({
      title: "放弃本次未完成的例句编辑？",
      content: "尚未点完成的修改不会保存。此前已经完成的例句不受影响。",
      run: () => {
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
              leaveResolver.current?.(false);
              leaveResolver.current = resolve;
              setLeaveRequested(true);
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
    const next = structuredClone(content);
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
    setContent(next);
  };
  return (
    <PronunciationPreviewProvider>
      <ConfirmDialog
        open={!!confirmation}
        title={confirmation?.title ?? ""}
        onClose={() => setConfirmation(undefined)}
        onConfirm={() => {
          const action = confirmation;
          setConfirmation(undefined);
          action?.run();
        }}
      >
        {confirmation?.content}
      </ConfirmDialog>
      <AdminDialog
        open={leaveRequested}
        title="例句还有未保存的修改"
        closeDisabled={leaveSaving}
        escapeDisabled={leaveSaving}
        backdropDismiss={false}
        onClose={() => settleLeave(false)}
        actions={
          <>
            <MuiButton
              disabled={leaveSaving}
              onClick={() => settleLeave(false)}
            >
              继续编辑
            </MuiButton>
            <MuiButton
              disabled={saving || leaveSaving}
              onClick={() => settleLeave(true)}
            >
              放弃修改
            </MuiButton>
            <MuiButton
              disabled={!canSave || saving}
              loading={leaveSaving}
              variant="contained"
              onClick={async () => {
                setLeaveSaving(true);
                try {
                  const saved = await finish(() => settleLeave(true));
                  if (saved !== true) settleLeave(false);
                } finally {
                  setLeaveSaving(false);
                }
              }}
            >
              保存例句后离开
            </MuiButton>
          </>
        }
      >
        例句独立保存，词义保存不会代为保存这里的修改。
      </AdminDialog>
      <VoiceEditorModal
        open
        contentSx={{
          maxHeight: "min(70vh, calc(100dvh - 160px))",
          overflowY: "auto"
        }}
        title={
          <V3EditorTitle
            index={rowIndex}
            title="多维例句"
            details={`${sentence ? "" : "新建 · "}${content.sentence.level} · ${dialectLabel(row.dialect)}`}
          />
        }
        footer={
          <MuiStack direction="row" spacing={1} justifyContent={"end"}>
            <MuiButton
              aria-label="取消例句编辑"
              disabled={saving}
              onClick={close}
            >
              取消
            </MuiButton>
            <MuiButton
              aria-label="完成例句编辑"
              loading={saving}
              disabled={!canSave}
              onClick={() => void finish()}
              variant={"contained"}
            >
              完成
            </MuiButton>
          </MuiStack>
        }
        onClose={close}
        closeDisabled={saving}
        escapeDisabled={saving}
      >
        <MuiStack className="sentence-editor" direction="column" spacing={2}>
          {recovery.notice}
          {router && !registerLeaveGuard && (
            <SentenceNavigationGuard
              dirty={dirty}
              saving={saving}
              canSave={canSave}
              save={finish}
            />
          )}
          <MuiStack
            direction="row"
            alignItems={"center"}
            justifyContent={"space-between"}
          >
            <MuiTypography component="span" color="text.secondary">
              {sentence
                ? `保存仅更新草稿；发布后影响 ${sentence.entries.length} 个词条的 ${sentence.entries.reduce((count, entry) => count + entry.senses.length, 0)} 个词义`
                : "例句独立保存为草稿，发布后按句内关联展示到对应词义。"}
            </MuiTypography>
            <MuiStack direction="row" spacing={1} alignItems="center">
              <MuiTypography component="span">等级</MuiTypography>
              <MuiSelect
                data-admin-select
                disabled={saving || !canEdit}
                size="small"
                value={content.sentence.level ?? ""}
                SelectDisplayProps={{
                  "aria-label": "例句等级"
                }}
                onChange={(event) =>
                  ((level: NonNullable<string>) =>
                    setContent((current) => ({
                      ...current,
                      sentence: { ...current.sentence, level }
                    })))(event.target.value as NonNullable<string>)
                }
                displayEmpty
              >
                {LEVELS.map((option) => (
                  <MuiMenuItem
                    key={String(option.value)}
                    value={option.value}
                    disabled={Boolean("disabled" in option && option.disabled)}
                  >
                    {option.label}
                  </MuiMenuItem>
                ))}
              </MuiSelect>
            </MuiStack>
          </MuiStack>
          {error && (
            <MuiAlert severity={"error"}>
              <MuiAlertTitle>{error}</MuiAlertTitle>
              {"输入已保留。"}
            </MuiAlert>
          )}
          {conflict && (
            <MuiAlert
              action={
                <MuiStack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  useFlexGap
                  flexWrap="wrap"
                >
                  <MuiButton
                    loading={saving}
                    onClick={() => void refreshConflict()}
                  >
                    刷新并比较
                  </MuiButton>
                  {latest && (
                    <>
                      <MuiButton
                        disabled={saving}
                        onClick={() => resolveConflict(false)}
                      >
                        保留本地修改
                      </MuiButton>
                      <MuiButton
                        disabled={saving}
                        onClick={() =>
                          setConfirmation({
                            title: "放弃本地修改？",
                            content: `未保存的输入会被丢弃，改用第 ${latest.revision} 版内容。`,
                            run: () => resolveConflict(true)
                          })
                        }
                        color={"error"}
                      >
                        放弃本地修改
                      </MuiButton>
                    </>
                  )}
                </MuiStack>
              }
              severity={"warning"}
            >
              <MuiAlertTitle>{"例句版本冲突"}</MuiAlertTitle>
              {
                "本地输入仍已保留。比较最新草稿并选择保留或放弃后，才能再次保存。"
              }
            </MuiAlert>
          )}
          {latest && (
            <DraftComparison local={content} remote={latest.content} />
          )}
          {content.annotations.some(
            (annotation) => annotation.target.state === "entry_only"
          ) && (
            <MuiAlert severity={"warning"}>
              <MuiAlertTitle>{"旧关联待选择词义"}</MuiAlertTitle>
              {"请点击原来的关联片段，补选具体词义或清除关联后再完成。"}
            </MuiAlert>
          )}
          {sourceEntryId && (
            <MuiAlert severity={currentLinked ? "success" : "info"}>
              <MuiAlertTitle>
                {currentLinked
                  ? `已关联当前词义：${contextLabel}`
                  : `请关联当前词义：${contextLabel}`}
              </MuiAlertTitle>
              {!currentLinked
                ? "至少一处单词或短语关联到此词义后才能完成。"
                : undefined}
            </MuiAlert>
          )}
          {candidates.length > 0 && (
            <MuiStack
              aria-label="当前词义匹配位置"
              direction="row"
              spacing={1}
              useFlexGap
              flexWrap="wrap"
            >
              {candidates.map(({ segments, target, gloss, surface }) => (
                <MuiButton
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
                  确认关联 {segments.map((s) => s.surface).join(" … ")}（位置{" "}
                  {segments[0]!.start + 1}）
                </MuiButton>
              ))}
            </MuiStack>
          )}
          {rows.length > 1 && (
            <RadioGroup
              row
              aria-label="例句方言"
              value={row.dialect}
              onChange={(_, value) => setDialect(value as Dialect)}
            >
              {rows.map((item) => (
                <FormControlLabel
                  key={item.dialect}
                  value={item.dialect}
                  disabled={saving || pendingEditor}
                  control={<Radio />}
                  label={item.dialect === "uk" ? "英式" : "美式"}
                />
              ))}
            </RadioGroup>
          )}
          {variant && (
            <V3VoiceTextField<SharedSentenceAnnotation>
              key={row.variant_id}
              mode="association"
              presentation="editor"
              showDone={false}
              restoreTextLinksOnCorrection
              audioUploadEnabled
              value={variant.value}
              textLinks={content.annotations.filter(
                (item) => item.source_dialect === row.dialect
              )}
              ariaLabel="例句正文"
              nodeId={row.variant_id}
              field="value"
              placeholder="请输入英文例句"
              dialect={row.dialect}
              readOnly={saving}
              contentReadOnly={!canEdit}
              associationsReadOnly={!canAssociate}
              onAssociationPendingChange={setPendingAnnotation}
              onDraftPendingChange={setPendingEditor}
              onAssociationsChange={(annotations) =>
                changeVariant({}, annotations)
              }
              onChange={(value, annotations) =>
                changeVariant({ value }, annotations)
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
        </MuiStack>
      </VoiceEditorModal>
    </PronunciationPreviewProvider>
  );
}
function SentenceNavigationGuard({
  dirty,
  saving,
  canSave,
  save
}: {
  dirty: boolean;
  saving: boolean;
  canSave: boolean;
  save: (afterSave?: () => void) => Promise<boolean | undefined>;
}) {
  const blocker = useBlocker(dirty);
  return blocker.state === "blocked" ? (
    <AdminDialog
      open
      title="例句还有未保存的修改"
      closeDisabled={!!saving}
      onClose={() => blocker.reset()}
      actions={
        <MuiStack direction="row" spacing={1} alignItems="center">
          <MuiButton disabled={saving} onClick={() => blocker.reset()}>
            继续编辑
          </MuiButton>
          <MuiButton disabled={saving} onClick={() => blocker.proceed()}>
            放弃修改
          </MuiButton>
          <MuiButton
            loading={saving}
            disabled={!canSave}
            onClick={async () => {
              if (!(await save(blocker.proceed))) blocker.reset();
            }}
            variant={"contained"}
          >
            保存例句后离开
          </MuiButton>
        </MuiStack>
      }
    >
      例句独立保存，词义保存不会代为保存这里的修改。
    </AdminDialog>
  ) : null;
}

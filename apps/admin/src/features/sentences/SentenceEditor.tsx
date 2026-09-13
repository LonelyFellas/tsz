import { useContext, useEffect, useRef, useState } from "react";
import { UNSAFE_DataRouterContext, useBlocker } from "react-router-dom";
import {
  currentSentenceCandidates,
  savedSenseTargets,
  sameSentenceTarget,
  matchesSentenceTarget
} from "./associationModel";
import {
  Alert,
  App,
  Button,
  Flex,
  Modal,
  Radio,
  Select,
  Space,
  Typography
} from "antd";
import type {
  AdminWordV3,
  Dialect,
  RichTextVariantV3,
  SharedSentence,
  SharedSentenceAnnotation,
  SharedSentenceContent
} from "@tsz/types";
import { api } from "@/lib/auth";
import { PronunciationPreviewProvider } from "../dictionary/word-creation/PronunciationPreview";
import { V3VoiceTextField } from "../dictionary/word-creation-v3/components/V3VoiceTextField";
import { V3SentenceTranslationsField } from "../dictionary/word-creation-v3/components/V3SentenceTranslationsField";
import { editableEnglishText } from "../dictionary/word-creation-v3/meaningsModel";
import { SharedSentenceAssociationPicker } from "./SharedSentenceAssociationPicker";
import { newSentence } from "./model";
const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"].map((value) => ({
  value,
  label: value
}));

export function SentenceEditor({
  sentence,
  sourceWord,
  sourceSenseId,
  initialLevel,
  registerLeaveGuard,
  onClose,
  onSaved
}: {
  sentence?: SharedSentence;
  sourceWord?: AdminWordV3;
  sourceSenseId?: string;
  initialLevel?: SharedSentence["content"]["sentence"]["level"];
  registerLeaveGuard?: (guard?: () => Promise<boolean>) => void;
  onClose: () => void;
  onSaved: (sentence: SharedSentence) => void;
}) {
  const { modal } = App.useApp();
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
  const initialContent = useRef(JSON.stringify(content));
  const dirty = JSON.stringify(content) !== initialContent.current;
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
  const finish = async (afterSave?: () => void) => {
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
      let saved: SharedSentence;
      if (sentence)
        saved = await api.sentences.update(sentence.id, {
          base_revision: sentence.revision,
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
      afterSave?.();
      onSaved(saved);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败，输入已保留，请重试");
    } finally {
      setSaving(false);
    }
  };
  const close = () =>
    modal.confirm({
      title: "放弃本次未完成的例句编辑？",
      content: "尚未点完成的修改不会保存。此前已经完成的例句不受影响。",
      onOk: onClose
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
          sameSentenceTarget(annotation.target, candidate.target) &&
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
                title: "例句还有未保存的修改",
                content: "例句独立保存，词义保存不会代为保存这里的修改。",
                onCancel: () => resolve(false),
                footer: (
                  <Space>
                    <Button
                      onClick={() => {
                        dialog.destroy();
                        resolve(false);
                      }}
                    >
                      继续编辑
                    </Button>
                    <Button
                      disabled={saving}
                      onClick={() => {
                        dialog.destroy();
                        resolve(true);
                      }}
                    >
                      放弃修改
                    </Button>
                    <Button
                      type="primary"
                      disabled={!canSave || saving}
                      onClick={async () => {
                        dialog.update({
                          closable: false,
                          footer: null,
                          content: "正在保存例句…"
                        });
                        const saved = await finish();
                        dialog.destroy();
                        resolve(saved === true);
                      }}
                    >
                      保存例句后离开
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
      <Flex vertical gap="middle">
        {router && (
          <SentenceNavigationGuard
            dirty={dirty}
            saving={saving}
            canSave={canSave}
            save={finish}
          />
        )}
        <Flex justify="space-between" align="center">
          <Typography.Text type="secondary">
            {sentence
              ? `修改会同步影响 ${sentence.entries.length} 个词条的 ${sentence.entries.reduce((count, entry) => count + entry.senses.length, 0)} 个词义`
              : "例句独立保存到例句库，句内关联决定展示在哪些词义下。"}
          </Typography.Text>
          <Space>
            <Typography.Text>等级</Typography.Text>
            <Select
              aria-label="例句等级"
              value={content.sentence.level}
              options={LEVELS}
              disabled={saving}
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
            description="输入已保留；版本冲突时请保留内容，重新打开最新例句再编辑。"
          />
        )}
        {content.annotations.some(
          (annotation) => annotation.target.state === "entry_only"
        ) && (
          <Alert
            type="warning"
            title="旧关联待选择词义"
            description="请点击原来的关联片段，补选具体词义或清除关联后再完成。"
          />
        )}
        {sourceEntryId && (
          <Alert
            type={currentLinked ? "success" : "info"}
            title={
              currentLinked
                ? `已关联当前词义：${contextLabel}`
                : `请关联当前词义：${contextLabel}`
            }
            description={
              !currentLinked
                ? "至少一处单词或短语关联到此词义后才能完成。"
                : undefined
            }
          />
        )}
        {candidates.length > 0 && (
          <Flex wrap gap="small" aria-label="当前词义匹配位置">
            {candidates.map(({ segments, target, gloss, surface }) => (
              <Button
                key={segments[0]!.start}
                size="small"
                disabled={saving || pendingAnnotation}
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
              </Button>
            ))}
          </Flex>
        )}
        {rows.length > 1 && (
          <Radio.Group
            aria-label="例句方言"
            value={row.dialect}
            disabled={saving}
            onChange={(event) => setDialect(event.target.value)}
            options={rows.map((item) => ({
              value: item.dialect,
              label: item.dialect === "uk" ? "英式" : "美式"
            }))}
          />
        )}
        {variant && (
          <V3VoiceTextField<SharedSentenceAnnotation>
            key={row.variant_id}
            mode="association"
            presentation="editor"
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
            onAssociationPendingChange={setPendingAnnotation}
            showDone={false}
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
                onTargetLabel={(id, label) =>
                  setTargetLabels((current) => ({ ...current, [id]: label }))
                }
              />
            )}
          />
        )}
        <V3SentenceTranslationsField
          sentence={content.sentence}
          index={0}
          disabled={saving}
          onChange={(zh_translations) =>
            setContent((current) => ({
              ...current,
              sentence: { ...current.sentence, zh_translations }
            }))
          }
        />
        <Flex justify="end" gap="small">
          <Button disabled={saving} onClick={close}>
            取消
          </Button>
          <Button
            aria-label="完成例句编辑"
            type="primary"
            loading={saving}
            disabled={!canSave}
            onClick={() => void finish()}
          >
            完成
          </Button>
        </Flex>
      </Flex>
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
    <Modal
      open
      title="例句还有未保存的修改"
      closable={!saving}
      onCancel={() => blocker.reset()}
      footer={
        <Space>
          <Button disabled={saving} onClick={() => blocker.reset()}>
            继续编辑
          </Button>
          <Button disabled={saving} onClick={() => blocker.proceed()}>
            放弃修改
          </Button>
          <Button
            type="primary"
            loading={saving}
            disabled={!canSave}
            onClick={async () => {
              if (!(await save(blocker.proceed))) blocker.reset();
            }}
          >
            保存例句后离开
          </Button>
        </Space>
      }
    >
      例句独立保存，词义保存不会代为保存这里的修改。
    </Modal>
  ) : null;
}

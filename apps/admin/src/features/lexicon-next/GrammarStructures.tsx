import { lazy, Suspense, useLayoutEffect, useMemo, useState } from "react";
import type {
  NextGrammarStructure,
  NextGrammarVariant,
  PartOfSpeechCatalogItem
} from "@tsz/types";
import { Button, Card, Space } from "@tsz/ui/admin/display";
import { Select } from "@tsz/ui/admin/forms";
import { App } from "@tsz/ui/admin/overlays";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { RichTextReadOnly } from "@tsz/voice-editor/reader";
import { toRichTextV2, withDefaultVoiceProfile } from "@tsz/voice-editor/core";
import { VoiceEditorModal } from "@/features/dictionary/word-creation-v3/components/VoiceEditorModal";
import { usePermission } from "@/lib/auth";
import { env } from "@/lib/env";
import {
  adminAudioUploadAdapter,
  adminVoicePreviewAdapter,
  loadAdminVoiceRecommendations,
  voicePreviewIsMock
} from "@/features/dictionary/voice-editor/dataSource";
import {
  PronunciationPreviewControls,
  PronunciationPreviewProvider
} from "@/features/dictionary/word-creation/PronunciationPreview";
import { EntryDialectContext } from "@/features/settings/useDialectPreference";
import { localeLabels } from "./model";
import "@tsz/voice-editor/styles.css";
const VoiceEditor = lazy(() =>
  import("@tsz/voice-editor/editor").then((module) => ({
    default: module.VoiceEditor
  }))
);

function GrammarText({
  variant,
  label,
  disabled,
  audioAvailable,
  onChange,
  registerLeaveGuard
}: {
  variant: NextGrammarVariant;
  label: string;
  disabled: boolean;
  audioAvailable: boolean;
  onChange: (value: NextGrammarVariant) => void;
  registerLeaveGuard?: (guard?: () => Promise<boolean>) => void;
}) {
  const [draft, setDraft] = useState<NextGrammarVariant>();
  const canGenerate = usePermission("speech.generate");
  const canUpload = usePermission("speech.upload_audio");
  const previewAdapter = useMemo(
    () =>
      canGenerate
        ? adminVoicePreviewAdapter
        : { ...adminVoicePreviewAdapter, generateAudio: undefined },
    [canGenerate]
  );
  const dirty =
    draft !== undefined && JSON.stringify(draft) !== JSON.stringify(variant);
  const { modal, message } = App.useApp();
  useLayoutEffect(() => {
    if (draft === undefined || !registerLeaveGuard) return;
    registerLeaveGuard(async () => {
      if (!dirty) {
        setDraft(undefined);
        return true;
      }
      return new Promise<boolean>((resolve) =>
        modal.confirm({
          title: "放弃语法结构修改？",
          content: "尚未完成的正文、标注和配音修改将被丢弃。",
          okText: "放弃修改",
          cancelText: "继续编辑",
          onOk: () => {
            setDraft(undefined);
            resolve(true);
          },
          onCancel: () => resolve(false)
        })
      );
    });
    return () => registerLeaveGuard(undefined);
  }, [draft, dirty, modal, registerLeaveGuard]);
  return (
    <>
      <Space.Compact block>
        {audioAvailable && (
          <PronunciationPreviewControls
            pronunciationId={variant.id}
            recommendationArea="grammar"
            playbackOnly
            assetOnly={disabled}
            dialect={
              variant.locale === "en-GB"
                ? "uk"
                : variant.locale === "en-US"
                  ? "us"
                  : "common"
            }
            ariaLabelPrefix={label}
            content={toRichTextV2(variant.content)}
            voiceProfile={variant.voice_profile}
            audioAssets={variant.audio_assets}
          />
        )}
        <Button
          className="lexicon-next-grammar-text"
          block
          icon={<Pencil />}
          iconPlacement="end"
          aria-label={`编辑${label}`}
          disabled={disabled}
          onClick={() => setDraft(structuredClone(variant))}
        >
          <RichTextReadOnly
            className={
              variant.content.text
                ? "tsz-words lexicon-next-grammar-content"
                : "lexicon-next-grammar-empty"
            }
            value={variant.content}
            emptyText="未填写语法结构"
          />
        </Button>
      </Space.Compact>
      <VoiceEditorModal
        width={audioAvailable ? 1200 : 960}
        open={draft !== undefined}
        title={label}
        footer={null}
        keyboard={!dirty}
        onCancel={() => setDraft(undefined)}
      >
        {draft && (
          <Suspense fallback={<span role="status">正在加载编辑器</span>}>
            <VoiceEditor
              mode="grammar"
              readOnly={disabled}
              value={toRichTextV2(draft.content)}
              contextLabel={label}
              contextKey={variant.id}
              locale={
                variant.locale === "en-GB" || variant.locale === "en-US"
                  ? variant.locale
                  : undefined
              }
              speechSettingsEnabled={audioAvailable}
              showAudioUpload={audioAvailable}
              previewEnabled={audioAvailable && env.VOICE_PREVIEW}
              previewAdapter={audioAvailable ? previewAdapter : undefined}
              previewIsMock={voicePreviewIsMock}
              recommendationArea={audioAvailable ? "grammar" : undefined}
              loadRecommendations={
                audioAvailable ? loadAdminVoiceRecommendations : undefined
              }
              voiceProfile={
                audioAvailable
                  ? withDefaultVoiceProfile(draft.voice_profile, "grammar")
                  : undefined
              }
              onVoiceProfileChange={
                audioAvailable
                  ? (voice_profile) =>
                      setDraft(
                        (current) => current && { ...current, voice_profile }
                      )
                  : undefined
              }
              audioAssets={draft.audio_assets}
              audioUploadAllowed={canUpload}
              audioUploadAdapter={
                audioAvailable && env.VOICE_AUDIO_UPLOAD
                  ? adminAudioUploadAdapter
                  : undefined
              }
              onAudioAssetsChange={(audio_assets) =>
                setDraft((current) => current && { ...current, audio_assets })
              }
              onChange={(content) =>
                setDraft((current) => current && { ...current, content })
              }
              renderActions={(canComplete, prepareComplete, captureResult) => (
                <Space>
                  <Button onClick={() => setDraft(undefined)}>取消</Button>
                  <Button
                    type="primary"
                    disabled={disabled || !canComplete}
                    onClick={() => {
                      try {
                        if (prepareComplete && !prepareComplete()) return;
                        const result = captureResult?.(true);
                        onChange(
                          result
                            ? {
                                ...draft,
                                content: result.value,
                                ...(audioAvailable
                                  ? {
                                      voice_profile:
                                        result.voiceProfile ?? undefined,
                                      audio_assets: result.audioAssets ?? []
                                    }
                                  : {})
                              }
                            : draft
                        );
                        setDraft(undefined);
                      } catch (error) {
                        message.error(
                          error instanceof Error
                            ? error.message
                            : "无法完成语法结构编辑，请检查配音设置"
                        );
                      }
                    }}
                  >
                    完成
                  </Button>
                </Space>
              )}
            />
          </Suspense>
        )}
      </VoiceEditorModal>
    </>
  );
}

export function GrammarStructures({
  rows,
  pos,
  catalog,
  target,
  disabled,
  referenceCount,
  audioAvailable = false,
  registerLeaveGuard,
  onChange
}: {
  rows: NextGrammarStructure[];
  pos: string;
  catalog?: PartOfSpeechCatalogItem;
  target: string;
  disabled: boolean;
  referenceCount: (id: string) => number;
  audioAvailable?: boolean;
  registerLeaveGuard?: (guard?: () => Promise<boolean>) => void;
  onChange: (
    update: (rows: NextGrammarStructure[]) => NextGrammarStructure[]
  ) => void;
}) {
  const { modal } = App.useApp();
  const card = (
    <Card
      className="lexicon-next-grammar"
      size="small"
      title={`语法结构 · ${localeLabels[target] ?? target}`}
    >
      {rows.some((row) => row.part_of_speech === pos) && (
        <div className="lexicon-next-grammar-heading" aria-hidden="true">
          <span>细分词性</span>
          <span>语法结构</span>
        </div>
      )}
      {rows
        .filter((row) => row.part_of_speech === pos)
        .map((row, index) => {
          const variant =
            row.variants.find((v) => v.locale === target) ??
            row.variants.find((v) => v.locale === "en");
          const subParts = catalog?.sub_parts ?? [];
          return (
            <div key={row.id} className="lexicon-next-grammar-row">
              <span className="lexicon-next-grammar-index">{index + 1}</span>
              <Select
                aria-label={`语法结构 ${index + 1} 细分词性`}
                disabled={disabled}
                placeholder="请选择细分词性"
                value={row.sub_pos || undefined}
                options={[
                  ...(!catalog?.sub_pos_required
                    ? [{ value: "", label: "不指定细分词性" }]
                    : []),
                  ...(row.sub_pos &&
                  !subParts.some((part) => part.code === row.sub_pos)
                    ? [
                        {
                          value: row.sub_pos,
                          label: "已失效的细分词性",
                          disabled: true
                        }
                      ]
                    : []),
                  ...subParts.map((part) => ({
                    value: part.code,
                    label: part.name_zh
                  }))
                ]}
                onChange={(sub_pos: string) =>
                  onChange((rows) =>
                    rows.map((item) =>
                      item.id === row.id ? { ...item, sub_pos } : item
                    )
                  )
                }
              />
              {variant ? (
                <GrammarText
                  variant={variant}
                  audioAvailable={audioAvailable}
                  registerLeaveGuard={registerLeaveGuard}
                  label={`语法结构 ${index + 1} ${localeLabels[target] ?? target}内容`}
                  disabled={disabled}
                  onChange={(variant) =>
                    onChange((rows) =>
                      rows.map((item) =>
                        item.id === row.id
                          ? {
                              ...item,
                              variants: item.variants.map((v) =>
                                v.id === variant.id ? variant : v
                              )
                            }
                          : item
                      )
                    )
                  }
                />
              ) : (
                <Button
                  disabled={disabled}
                  onClick={() =>
                    onChange((rows) =>
                      rows.map((item) =>
                        item.id === row.id
                          ? {
                              ...item,
                              variants: [
                                ...item.variants,
                                {
                                  id: crypto.randomUUID(),
                                  locale: target,
                                  content: {
                                    version: 2,
                                    text: "",
                                    annotations: []
                                  }
                                }
                              ]
                            }
                          : item
                      )
                    )
                  }
                >
                  添加{localeLabels[target]}内容
                </Button>
              )}
              <Button
                icon={<Trash2 />}
                type="text"
                danger
                disabled={disabled}
                aria-label={`删除语法结构 ${index + 1}`}
                onClick={() => {
                  const count = referenceCount(row.id);
                  const remove = () =>
                    onChange((rows) =>
                      rows.filter((item) => item.id !== row.id)
                    );
                  if (count)
                    modal.confirm({
                      title: "删除语法结构？",
                      content: `将清除 ${count} 条释义的语法结构关联，释义正文保留。`,
                      okText: "删除",
                      cancelText: "取消",
                      okButtonProps: { danger: true },
                      onOk: remove
                    });
                  else remove();
                }}
              />
            </div>
          );
        })}
      <Button
        block
        type="dashed"
        icon={<Plus />}
        disabled={disabled || !pos}
        onClick={() =>
          onChange((rows) => [
            ...rows,
            {
              id: crypto.randomUUID(),
              part_of_speech: pos,
              variants: ["en-GB", "en-US"].map((locale) => ({
                id: crypto.randomUUID(),
                locale,
                content: { version: 2, text: "", annotations: [] }
              }))
            }
          ])
        }
      >
        添加语法结构
      </Button>
    </Card>
  );
  return audioAvailable ? (
    <EntryDialectContext.Provider
      value={target === "en-US" ? "en-US" : "en-GB"}
    >
      <PronunciationPreviewProvider readOnly={disabled}>
        {card}
      </PronunciationPreviewProvider>
    </EntryDialectContext.Provider>
  ) : (
    card
  );
}

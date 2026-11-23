import {
  lazy,
  Suspense,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type { ComponentType } from "react";
import { flushSync } from "react-dom";
import type {
  GrammarFormLinkV3,
  NextGrammarStructure,
  NextGrammarVariant,
  PartOfSpeechCatalogItem
} from "@tsz/types";
import {
  EmptyState,
  Alert,
  Button,
  Card,
  Flex,
  Space,
  Typography
} from "@tsz/ui/admin/display";
import { Select } from "@tsz/ui/admin/forms";
import { App } from "@tsz/ui/admin/overlays";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { RichTextReadOnly } from "@tsz/voice-editor/reader";
import { toRichTextV2, withDefaultVoiceProfile } from "@tsz/voice-editor/core";
import { VoiceEditorModal } from "@/features/dictionary/word-creation-v3/components/VoiceEditorModal";
import { V3GrammarFormPicker } from "@/features/dictionary/word-creation-v3/components/V3GrammarFormPicker";
import type { AssociationPickerProps } from "@tsz/voice-editor/types";
import type { VoiceEditorProps } from "@tsz/voice-editor/types";
import type { LexiconNextRequests } from "@/pages/LexiconNext";
import { NextTargetPicker } from "./NextTargetPicker";
import { useSelectedVoiceAudio } from "@/features/dictionary/word-creation-v3/useSelectedVoiceAudio";
import { usePermission } from "@/lib/auth";
import { env } from "@/lib/env";
import {
  adminAudioUploadAdapter,
  adminGrammarVoicePreviewAdapter,
  loadAdminVoiceRecommendations,
  voicePreviewIsMock
} from "@/features/dictionary/voice-editor/dataSource";
import {
  PronunciationPreviewControls,
  PronunciationPreviewProvider
} from "@/features/dictionary/word-creation/PronunciationPreview";
import { EntryDialectContext } from "@/features/settings/useDialectPreference";
import { useLexiconEditorTranslation } from "@/features/dictionary/i18n/editor";
import { V3SortableRowIndex } from "@/features/dictionary/word-creation-v3/components/V3SortableRowIndex";
import {
  reorderVisibleRows,
  sortableRowClass,
  useSortableRows
} from "@/features/dictionary/word-creation-v3/sortableRows";
import { localeLabels, newGrammarStructure } from "./model";
import "@tsz/voice-editor/styles.css";
const VoiceEditor = lazy(() =>
  import("@tsz/voice-editor/editor").then((module) => ({
    default: module.VoiceEditor
  }))
);
const GrammarVoiceEditor = VoiceEditor as unknown as ComponentType<
  VoiceEditorProps<GrammarFormLinkV3>
>;

function CombinedGrammarFormPicker({
  pickerProps,
  requests,
  target,
  medium
}: {
  pickerProps: AssociationPickerProps<GrammarFormLinkV3>;
  requests?: LexiconNextRequests;
  target: string;
  medium?: string;
}) {
  const [source, setSource] = useState<"v3" | "lexicon_next">("v3");
  if (pickerProps.selected?.target_source === "lexicon_next") {
    return (
      <Flex vertical gap="small">
        <Typography.Text type="secondary">
          已关联新版词条的具体词形。
        </Typography.Text>
        <Button size="small" onClick={() => pickerProps.onSelect(undefined)}>
          清除关联
        </Button>
        {pickerProps.onCancel && (
          <Button size="small" onClick={pickerProps.onCancel}>
            关闭
          </Button>
        )}
      </Flex>
    );
  }
  if (source === "lexicon_next" && requests) {
    return (
      <Flex vertical gap="small">
        <Button size="small" onClick={() => setSource("v3")}>
          选择 V3 词条
        </Button>
        <NextTargetPicker
          literal={pickerProps.segments
            .map((segment) => segment.surface)
            .join(" ")}
          targetLocale={target}
          mediumLocale={medium ?? "zh-Hans"}
          requests={requests}
          onSelect={(choice) => {
            pickerProps.onSelect({
              id: pickerProps.selected?.id ?? crypto.randomUUID(),
              source_segments: pickerProps.segments,
              target_source: "lexicon_next",
              target_word_id: choice.target_word_id,
              target_pos_id: choice.target_pos_id,
              target_form_id: choice.target_form_id,
              target_variant_id: choice.target_variant_id,
              target_dialect: choice.target_dialect
            });
          }}
          onCancel={pickerProps.onCancel}
        />
      </Flex>
    );
  }
  return (
    <Flex vertical gap="small">
      {requests && (
        <Button size="small" onClick={() => setSource("lexicon_next")}>
          选择新版词条
        </Button>
      )}
      <V3GrammarFormPicker {...pickerProps} />
    </Flex>
  );
}

function GrammarText({
  variant,
  label,
  disabled,
  audioAvailable,
  formLinksAvailable,
  requests,
  target,
  medium,
  onChange,
  registerLeaveGuard
}: {
  variant: NextGrammarVariant;
  label: string;
  disabled: boolean;
  audioAvailable: boolean;
  formLinksAvailable: boolean;
  requests?: LexiconNextRequests;
  target: string;
  medium?: string;
  onChange: (value: NextGrammarVariant) => void;
  registerLeaveGuard?: (guard?: () => Promise<boolean>) => void;
}) {
  const [draft, setDraft] = useState<NextGrammarVariant>();
  const [applying, setApplying] = useState(false);
  const applyingRef = useRef(false);
  const [audioFailed, setAudioFailed] = useState(false);
  const canGenerate = usePermission("speech.generate");
  const canUpload = usePermission("speech.upload_audio");
  const generateAvailable =
    audioAvailable && canGenerate && env.VOICE_PREVIEW && !voicePreviewIsMock;
  const previewAdapter = useMemo(
    () =>
      generateAvailable
        ? adminGrammarVoicePreviewAdapter
        : { ...adminGrammarVoicePreviewAdapter, generateAudio: undefined },
    [generateAvailable]
  );
  const current = draft ?? variant;
  const profile = useMemo(
    () => withDefaultVoiceProfile(current.voice_profile, "grammar"),
    [current.voice_profile]
  );
  const content = useMemo(
    () => toRichTextV2(current.content),
    [current.content]
  );
  const audio = useSelectedVoiceAudio({
    target: `grammar:${variant.id}`,
    content,
    profile,
    adapter: adminGrammarVoicePreviewAdapter,
    locale:
      variant.locale === "en-GB" || variant.locale === "en-US"
        ? variant.locale
        : undefined,
    enabled: !!draft && !disabled && generateAvailable,
    defer: true,
    onChange: (voice_profile) =>
      setDraft((value) => value && { ...value, voice_profile })
  });
  const latest = useRef({ draft, disabled, onChange, generate: audio.retry });
  useLayoutEffect(() => {
    latest.current = { draft, disabled, onChange, generate: audio.retry };
  });
  const dirty =
    draft !== undefined && JSON.stringify(draft) !== JSON.stringify(variant);
  const { modal, message } = App.useApp();
  useLayoutEffect(() => {
    if (draft === undefined || !registerLeaveGuard) return;
    registerLeaveGuard(async () => {
      if (applyingRef.current) return false;
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
            previewAdapter={previewAdapter}
          />
        )}
        <Button
          className="lexicon-next-grammar-text"
          block
          icon={<Pencil />}
          iconPlacement="end"
          aria-label={`编辑${label}`}
          data-v3-field="variants"
          disabled={disabled}
          onClick={() => {
            setAudioFailed(false);
            setDraft(structuredClone(variant));
          }}
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
        keyboard={!dirty && !applying}
        closable={!applying}
        onCancel={() => {
          if (!applyingRef.current) setDraft(undefined);
        }}
      >
        {draft && audioFailed && Boolean(audio.error) && (
          <Alert
            type="error"
            showIcon
            title={
              audio.error instanceof Error
                ? audio.error.message
                : "配音生成未完成，请重试"
            }
          />
        )}
        {draft && (
          <Suspense fallback={<span role="status">正在加载编辑器</span>}>
            <GrammarVoiceEditor
              mode="grammar"
              readOnly={disabled || applying}
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
              deferAudioGeneration
              deferContentVoiceResolution={generateAvailable}
              previewIsMock={voicePreviewIsMock}
              recommendationArea={audioAvailable ? "grammar" : undefined}
              loadRecommendations={
                audioAvailable ? loadAdminVoiceRecommendations : undefined
              }
              voiceProfile={audioAvailable ? profile : undefined}
              onVoiceProfileChange={
                audioAvailable
                  ? (voice_profile) =>
                      setDraft(
                        (current) => current && { ...current, voice_profile }
                      )
                  : undefined
              }
              audioAssets={draft.audio_assets}
              textLinks={
                formLinksAvailable ? (draft.form_links ?? []) : undefined
              }
              renderAssociationPicker={
                formLinksAvailable
                  ? (
                      pickerProps: AssociationPickerProps<GrammarFormLinkV3>
                    ) => (
                      <CombinedGrammarFormPicker
                        pickerProps={pickerProps}
                        requests={requests}
                        target={target}
                        medium={medium}
                      />
                    )
                  : undefined
              }
              audioUploadAllowed={canUpload}
              audioUploadAdapter={
                audioAvailable && env.VOICE_AUDIO_UPLOAD
                  ? adminAudioUploadAdapter
                  : undefined
              }
              onAudioAssetsChange={(audio_assets) =>
                setDraft((current) => current && { ...current, audio_assets })
              }
              onChange={(content, form_links) =>
                setDraft(
                  (current) =>
                    current && {
                      ...current,
                      content,
                      ...(formLinksAvailable
                        ? { form_links: form_links ?? [] }
                        : {})
                    }
                )
              }
              renderActions={(canComplete, prepareComplete, captureResult) => (
                <Space>
                  <Button
                    disabled={applying}
                    onClick={() => setDraft(undefined)}
                  >
                    取消
                  </Button>
                  <Button
                    type="primary"
                    loading={applying}
                    disabled={disabled || !canComplete || applying}
                    onClick={async () => {
                      if (applyingRef.current) return;
                      applyingRef.current = true;
                      setApplying(true);
                      setAudioFailed(false);
                      try {
                        if (prepareComplete && !prepareComplete()) return;
                        const result = captureResult?.(true);
                        const next = result
                          ? {
                              ...draft,
                              content: result.value,
                              ...(formLinksAvailable
                                ? {
                                    form_links:
                                      draft.form_links ?? result.textLinks ?? []
                                  }
                                : {}),
                              ...(audioAvailable
                                ? {
                                    voice_profile:
                                      result.voiceProfile ?? undefined,
                                    audio_assets: result.audioAssets ?? []
                                  }
                                : {})
                            }
                          : draft;
                        flushSync(() => setDraft(next));
                        if (
                          generateAvailable &&
                          !(await latest.current.generate())
                        ) {
                          setAudioFailed(true);
                          return;
                        }
                        if (!latest.current.draft || latest.current.disabled)
                          return;
                        latest.current.onChange(latest.current.draft);
                        setDraft(undefined);
                      } catch (error) {
                        message.error(
                          error instanceof Error
                            ? error.message
                            : "无法完成语法结构编辑，请检查配音设置"
                        );
                      } finally {
                        applyingRef.current = false;
                        setApplying(false);
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
  formLinksAvailable = false,
  requests,
  medium = "zh-Hans",
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
  formLinksAvailable?: boolean;
  requests?: LexiconNextRequests;
  medium?: string;
  registerLeaveGuard?: (guard?: () => Promise<boolean>) => void;
  onChange: (
    update: (rows: NextGrammarStructure[]) => NextGrammarStructure[]
  ) => void;
}) {
  const { modal } = App.useApp();
  const { t } = useLexiconEditorTranslation();
  const headingId = useId();
  const visibleRows = rows.filter((row) => row.part_of_speech === pos);
  const sorting = useSortableRows({
    items: disabled || !pos ? [] : visibleRows,
    scopeId: headingId,
    dragType: "application/x-tsz-next-grammar",
    onChange: (next) => onChange((current) => reorderVisibleRows(current, next))
  });
  const card = (
    <Card
      className="lexicon-next-grammar"
      size="small"
      aria-labelledby={headingId}
      title={
        <div className="lexicon-next-section-caption">
          <h2 id={headingId} className="lexicon-next-section-title">
            语法结构 · {localeLabels[target] ?? target}
          </h2>
          {visibleRows.length === 0 && (
            <EmptyState description={t("no_grammar")} />
          )}
        </div>
      }
    >
      {visibleRows.length > 0 && (
        <div className="lexicon-next-grammar-heading" aria-hidden="true">
          <span>细分词性</span>
          <span>语法结构</span>
        </div>
      )}
      {visibleRows.map((row, index) => {
        const variant = row.variants.find((v) => v.locale === target);
        const subParts = catalog?.sub_parts ?? [];
        return (
          <div
            key={row.id}
            data-v3-node-id={row.id}
            className={sortableRowClass(
              "lexicon-next-grammar-row word-sortable-row",
              sorting,
              index
            )}
            onDragLeave={sorting.handleDragLeave}
            onDragOver={(event) => sorting.handleDragOver(event, index)}
            onDrop={(event) => sorting.handleDrop(event, index)}
          >
            <V3SortableRowIndex
              dragImageSelector=".lexicon-next-grammar-row"
              index={index}
              indexLabel={t("grammar_index", { index: index + 1 })}
              label={t("drag_grammar", { index: index + 1 })}
              singleItemTitle={t("two_grammar_required")}
              sorting={sorting}
            />
            <Select
              aria-label={`语法结构 ${index + 1} 细分词性`}
              data-v3-field="sub_pos"
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
                formLinksAvailable={formLinksAvailable}
                requests={requests}
                target={target}
                medium={medium}
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
                aria-label={`编辑语法结构 ${index + 1} ${localeLabels[target] ?? target}内容`}
                disabled={disabled}
                onClick={() =>
                  onChange((rows) =>
                    rows.map((item) =>
                      item.id === row.id
                        ? {
                            ...item,
                            variants: [
                              ...(item.variants.some(
                                (variant) =>
                                  variant.locale === "en-GB" ||
                                  variant.locale === "en-US"
                              )
                                ? item.variants.filter(
                                    (variant) => variant.locale !== "en"
                                  )
                                : item.variants),
                              {
                                id: crypto.randomUUID(),
                                locale: target,
                                content: item.variants.find(
                                  (variant) => variant.locale === "en"
                                )?.content ?? {
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
              disabled={disabled || visibleRows.length <= 1}
              aria-label={`删除语法结构 ${index + 1}`}
              onClick={() => {
                const count = referenceCount(row.id);
                const remove = () =>
                  onChange((rows) => rows.filter((item) => item.id !== row.id));
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
        className="word-section-add-button"
        size="large"
        type="dashed"
        icon={<Plus aria-hidden />}
        disabled={disabled || !pos}
        onClick={() => onChange((rows) => [...rows, newGrammarStructure(pos)])}
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

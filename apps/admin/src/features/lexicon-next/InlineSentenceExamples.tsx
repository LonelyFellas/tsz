import {
  lazy,
  Suspense,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type {
  NextSentence,
  NextSentenceSource,
  NextSentenceVariant,
  RichTextV2
} from "@tsz/types";
import { Alert, Button, Card, Empty, Space, Tag } from "@tsz/ui/admin/display";
import {
  Checkbox,
  Input,
  InputNumber,
  Select,
  Slider
} from "@tsz/ui/admin/forms";
import { App, Popover } from "@tsz/ui/admin/overlays";
import { ChevronDown, Plus, Settings2, Trash2, Volume2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { canAdminResourceAction } from "@tsz/shared/auth";
import {
  editRichText,
  toRichTextV2,
  withDefaultVoiceProfile
} from "@tsz/voice-editor/core";
import {
  PronunciationPreviewControls,
  PronunciationPreviewProvider
} from "@/features/dictionary/word-creation/PronunciationPreview";
import { VoiceEditorModal } from "@/features/dictionary/word-creation-v3/components/VoiceEditorModal";
import { EntryDialectContext } from "@/features/settings/useDialectPreference";
import {
  adminAudioUploadAdapter,
  adminVoicePreviewAdapter,
  loadAdminVoiceRecommendations,
  voicePreviewIsMock
} from "@/features/dictionary/voice-editor/dataSource";
import { useAuthStore, usePermission } from "@/lib/auth";
import { env } from "@/lib/env";
import type { LexiconNextRequests } from "@/pages/LexiconNext";
import {
  SenseSectionBody,
  SenseSectionTitle
} from "@/features/dictionary/word-creation-v3/components/V3SenseSection";
import { SentenceSourceFields, SentenceSources } from "./SentenceDetails";
import {
  freedomCategory,
  sentenceLevels,
  sentenceStyles,
  translationStyle,
  sentenceError
} from "./sentenceModel";
import {
  cleanSentenceVariant,
  newSentenceVariant,
  scopedSentenceVariant,
  useSentenceDraftWorkspace
} from "./sentenceDrafts";
import { localeLabels } from "./model";
import "./sentences.css";
const VoiceEditor = lazy(() =>
  import("@tsz/voice-editor/editor").then((m) => ({ default: m.VoiceEditor }))
);

function Sources({
  rows,
  label,
  disabled,
  onChange,
  compact = false
}: {
  compact?: boolean;
  rows: NextSentenceSource[];
  label: string;
  disabled: boolean;
  onChange: (rows: NextSentenceSource[]) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="next-sentence-source-summary">
      {!compact && rows.length > 0 && <SentenceSources rows={rows} />}
      <Popover
        title={label}
        trigger="click"
        open={open}
        onOpenChange={setOpen}
        content={
          <div className="next-sentence-source-popover">
            <SentenceSourceFields
              rows={rows}
              label={label}
              disabled={disabled}
              onChange={onChange}
            />
            <Button size="small" onClick={() => setOpen(false)}>
              收起来源
            </Button>
          </div>
        }
      >
        <Button
          size="small"
          type="link"
          disabled={disabled}
          aria-label={`编辑${label}`}
        >
          来源
        </Button>
      </Popover>
    </div>
  );
}
function Taxonomy({
  values,
  options,
  label,
  disabled,
  onChange
}: {
  values: string[];
  options: { id: string; name_zh: string }[];
  label: string;
  disabled: boolean;
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const all = options.length > 0 && options.every((v) => values.includes(v.id));
  return (
    <label className="next-sentence-taxonomy">
      <span>{label}</span>
      <Popover
        title={label}
        trigger="click"
        open={open}
        onOpenChange={setOpen}
        content={
          <div className="lexicon-next-taxonomy-options">
            <Checkbox
              checked={all}
              indeterminate={!all && values.length > 0}
              disabled={disabled || !options.length}
              onChange={(e) =>
                onChange(e.target.checked ? options.map((v) => v.id) : [])
              }
            >
              通用（全选）
            </Checkbox>
            {options.map((v) => (
              <Checkbox
                key={v.id}
                checked={values.includes(v.id)}
                disabled={disabled}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [...values, v.id]
                      : values.filter((id) => id !== v.id)
                  )
                }
              >
                {v.name_zh}
              </Checkbox>
            ))}
            <Button size="small" onClick={() => setOpen(false)}>
              确认
            </Button>
          </div>
        }
      >
        <Button
          aria-label={`选择${label}`}
          disabled={disabled}
          aria-expanded={open}
        >
          {all
            ? "通用"
            : !values.length
              ? "未选择"
              : values.length === 1
                ? (options.find((v) => v.id === values[0])?.name_zh ??
                  "配置不存在")
                : "部分选择"}
          <ChevronDown size={14} />
        </Button>
      </Popover>
    </label>
  );
}

function InlineSentenceCard({
  source,
  target,
  medium,
  requests,
  disabled,
  onRemove,
  registerLeaveGuard
}: {
  source: NextSentence;
  target: string;
  medium: string;
  requests: LexiconNextRequests;
  disabled: boolean;
  onRemove: () => void;
  registerLeaveGuard?: (guard?: () => Promise<boolean>) => void;
}) {
  const workspace = useSentenceDraftWorkspace()!;
  const actor = useAuthStore((s) => s.profile);
  const canCreate = usePermission("sentences.create");
  const editable =
    !disabled &&
    (source.revision === 0
      ? canCreate
      : canAdminResourceAction(actor, "sentences", "edit", source.owner_id));
  const catalog = useQuery({
    queryKey: ["admin-lexicon-next", "equivalent-catalog"],
    queryFn: requests.equivalentCatalog,
    staleTime: 5 * 60 * 1000,
    retry: false
  });
  const saved = source.draft.variants.find((v) => v.locale === target);
  const [blank] = useState(() => newSentenceVariant(target));
  const [translationPlaceholder] = useState(() => ({
    id: crypto.randomUUID(),
    locale: medium,
    style: "balanced_fluency" as const,
    content: { version: 2 as const, text: "", annotations: [] },
    metadata: { freedom: null, sources: [] }
  }));
  const scoped = saved ? scopedSentenceVariant(saved, medium) : blank;
  const value = scoped.translations.length
    ? scoped
    : { ...scoped, translations: [translationPlaceholder] };
  const metadata = value.metadata ?? {
    register_ids: [],
    domain_ids: [],
    sources: []
  };
  const update = (next: NextSentenceVariant) => workspace.update(source, next);
  const [advanced, setAdvanced] = useState<NextSentenceVariant>();
  const [advancedDirty, setAdvancedDirty] = useState(false);
  const advancedInitial = useRef("");
  const { modal } = App.useApp();
  const [localError, setLocalError] = useState<string>();
  const canUpload = usePermission("speech.upload_audio");
  const previewAdapter = useMemo(
    () => ({ ...adminVoicePreviewAdapter, generateAudio: undefined }),
    []
  );
  useLayoutEffect(() => {
    if (!advanced || !registerLeaveGuard) return;
    registerLeaveGuard(async () => {
      if (!advancedDirty) {
        setAdvanced(undefined);
        return true;
      }
      return new Promise<boolean>((resolve) =>
        modal.confirm({
          title: "放弃尚未应用的标注与配音设置？",
          okText: "放弃设置",
          cancelText: "继续编辑",
          onOk: () => {
            setAdvanced(undefined);
            resolve(true);
          },
          onCancel: () => resolve(false)
        })
      );
    });
    return () => registerLeaveGuard(undefined);
  }, [advanced, advancedDirty, modal, registerLeaveGuard]);
  const setAdvancedValue = (patch: Partial<NextSentenceVariant>) =>
    setAdvanced((current) => (current ? { ...current, ...patch } : current));
  useLayoutEffect(() => {
    if (advanced)
      setAdvancedDirty(JSON.stringify(advanced) !== advancedInitial.current);
  }, [advanced]);
  const original = workspace.base
    .find((v) => v.id === source.id)
    ?.draft.variants.find((v) => v.locale === target);
  const fieldError = workspace.attempted
    ? !value.content.text.trim()
      ? "请填写例句原文，或移除空白例句。"
      : sentenceError(cleanSentenceVariant(value))
    : undefined;
  const changed =
    !original ||
    JSON.stringify([original.content, original.voice_profile]) !==
      JSON.stringify([value.content, value.voice_profile]);
  return (
    <Card
      size="small"
      className="next-sentence-inline-card"
      data-sentence-id={source.id}
    >
      <div className="next-sentence-entry-grid">
        <label className="next-sentence-grade">
          <span>难度级别</span>
          <Select
            aria-label="例句等级"
            value={value.level}
            disabled={!editable}
            options={sentenceLevels.map((value) => ({ value, label: value }))}
            onChange={(level) => update({ ...value, level })}
          />
        </label>
        <div className="next-sentence-entry-content">
          <div className="next-sentence-original">
            {changed ? (
              <Button icon={<Volume2 />} disabled aria-label="例句修改待保存" />
            ) : (
              <PronunciationPreviewControls
                pronunciationId={value.id}
                recommendationArea="example"
                playbackOnly
                assetOnly
                dialect={target === "en-GB" ? "uk" : "us"}
                ariaLabelPrefix="例句"
                content={toRichTextV2(value.content)}
                voiceProfile={value.voice_profile}
                audioAssets={value.audio_assets}
              />
            )}
            <Input.TextArea
              aria-label={`${localeLabels[target]}例句原文`}
              aria-invalid={workspace.attempted && !value.content.text.trim()}
              status={
                workspace.attempted && !value.content.text.trim()
                  ? "error"
                  : undefined
              }
              value={value.content.text}
              rows={2}
              disabled={!editable}
              placeholder={`输入${localeLabels[target]}例句`}
              onChange={(e) =>
                update({
                  ...value,
                  content: editRichText(value.content, e.target.value)
                })
              }
            />
            <Button
              icon={<Settings2 />}
              aria-label="标注与配音设置"
              disabled={!editable}
              onClick={() => {
                const next = structuredClone(value);
                advancedInitial.current = JSON.stringify(next);
                setAdvanced(next);
                setAdvancedDirty(false);
              }}
            >
              设置
            </Button>
          </div>
          <Sources
            rows={metadata.sources}
            label="原文来源"
            disabled={!editable}
            onChange={(sources) =>
              update({ ...value, metadata: { ...metadata, sources } })
            }
          />
          {source.revision > 0 && (
            <span className="next-sentence-shared">
              保存将同步更新引用此例句的所有义项。
            </span>
          )}
          {catalog.isError && (
            <Alert
              type="error"
              title="语体与领域目录加载失败"
              action={
                <Button onClick={() => void catalog.refetch()}>重试</Button>
              }
            />
          )}
          <div className="next-sentence-taxonomies">
            <Taxonomy
              label="语体色彩"
              values={metadata.register_ids}
              options={catalog.data?.registers ?? []}
              disabled={!editable || !catalog.data}
              onChange={(register_ids) =>
                update({ ...value, metadata: { ...metadata, register_ids } })
              }
            />
            <Taxonomy
              label="行业领域"
              values={metadata.domain_ids}
              options={catalog.data?.domains ?? []}
              disabled={!editable || !catalog.data}
              onChange={(domain_ids) =>
                update({ ...value, metadata: { ...metadata, domain_ids } })
              }
            />
          </div>
          <div className="next-sentence-translation-stack">
            {value.translations.map((row, index) => {
              const kind = translationStyle(row);
              const freedom = row.metadata?.freedom;
              const setFreedom = (freedom: number | null) =>
                update({
                  ...value,
                  translations: value.translations.map((v) =>
                    v.id === row.id
                      ? {
                          ...v,
                          style:
                            freedom == null
                              ? v.style
                              : (freedomCategory(freedom) ?? v.style),
                          metadata: {
                            sources: v.metadata?.sources ?? [],
                            freedom
                          }
                        }
                      : v
                  )
                });
              return (
                <div className="next-sentence-inline-translation" key={row.id}>
                  <Tag>{kind ? sentenceStyles[kind] : "待评估"}</Tag>
                  <div
                    className={`next-sentence-inline-freedom${freedom == null ? " is-unassessed" : ""}`}
                  >
                    {freedom == null ? (
                      <span>待评估</span>
                    ) : (
                      <Slider
                        ariaLabelForHandle={`译文 ${index + 1} 自由度滑块`}
                        min={0}
                        max={100}
                        step={0.1}
                        value={freedom}
                        disabled={!editable}
                        onChange={setFreedom}
                      />
                    )}
                    <label>
                      自由度
                      <InputNumber
                        aria-label={`译文 ${index + 1} 自由度`}
                        aria-invalid={
                          workspace.attempted &&
                          freedom != null &&
                          !freedomCategory(freedom)
                        }
                        status={
                          workspace.attempted &&
                          freedom != null &&
                          !freedomCategory(freedom)
                            ? "error"
                            : undefined
                        }
                        value={freedom ?? null}
                        min={0}
                        max={100}
                        step={0.1}
                        disabled={!editable}
                        placeholder="—"
                        onChange={(v) =>
                          setFreedom(v === null ? null : Number(v))
                        }
                      />
                      <span>%</span>
                    </label>
                  </div>
                  <div>
                    <Input.TextArea
                      rows={2}
                      aria-label={`译文 ${index + 1} ${localeLabels[medium]}正文`}
                      aria-invalid={
                        workspace.attempted &&
                        !row.content.text.trim() &&
                        (freedom != null || !!row.metadata?.sources.length)
                      }
                      value={row.content.text}
                      disabled={!editable}
                      onChange={(e) =>
                        update({
                          ...value,
                          translations: value.translations.map((v) =>
                            v.id === row.id
                              ? {
                                  ...v,
                                  content: editRichText(
                                    v.content,
                                    e.target.value
                                  )
                                }
                              : v
                          )
                        })
                      }
                    />
                  </div>
                  <div className="next-sentence-translation-actions">
                    {" "}
                    <Sources
                      compact
                      label={`译文 ${index + 1} 来源`}
                      rows={row.metadata?.sources ?? []}
                      disabled={!editable}
                      onChange={(sources) =>
                        update({
                          ...value,
                          translations: value.translations.map((v) =>
                            v.id === row.id
                              ? {
                                  ...v,
                                  metadata: {
                                    freedom: v.metadata?.freedom ?? null,
                                    sources
                                  }
                                }
                              : v
                          )
                        })
                      }
                    />{" "}
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<Trash2 />}
                      aria-label={`移除译文 ${index + 1}`}
                      disabled={!editable}
                      onClick={() =>
                        update({
                          ...value,
                          translations: value.translations.filter(
                            (v) => v.id !== row.id
                          )
                        })
                      }
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <Button
            type="link"
            size="small"
            icon={<Plus />}
            disabled={!editable}
            onClick={() =>
              update({
                ...value,
                translations: [
                  ...value.translations,
                  {
                    id: crypto.randomUUID(),
                    locale: medium,
                    style: "balanced_fluency",
                    content: { version: 2, text: "", annotations: [] },
                    metadata: { freedom: null, sources: [] }
                  }
                ]
              })
            }
          >
            添加译文
          </Button>
        </div>
      </div>
      {fieldError && <Alert type="error" title={fieldError} />}
      {!editable && !disabled && (
        <span className="lexicon-next-muted">没有此例句的编辑权限。</span>
      )}
      <div className="next-sentence-inline-actions">
        <Button
          type="text"
          danger
          size="small"
          disabled={disabled}
          icon={<Trash2 />}
          onClick={onRemove}
        >
          移除引用
        </Button>
      </div>
      <VoiceEditorModal
        open={!!advanced}
        title="标注与配音设置"
        width={960}
        footer={null}
        onCancel={() => setAdvanced(undefined)}
      >
        {advanced && (
          <Suspense fallback={<span role="status">正在加载编辑器</span>}>
            <VoiceEditor
              mode="grammar"
              locale={target as "en-GB" | "en-US"}
              recommendationArea="example"
              value={toRichTextV2(advanced.content)}
              voiceProfile={withDefaultVoiceProfile(
                advanced.voice_profile,
                "example"
              )}
              onChange={(content: RichTextV2) => setAdvancedValue({ content })}
              onVoiceProfileChange={(voice_profile) =>
                setAdvancedValue({ voice_profile })
              }
              speechSettingsEnabled
              previewEnabled={env.VOICE_PREVIEW}
              previewAdapter={previewAdapter}
              previewIsMock={voicePreviewIsMock}
              loadRecommendations={loadAdminVoiceRecommendations}
              showAudioUpload
              audioUploadAllowed={canUpload}
              audioUploadAdapter={
                env.VOICE_AUDIO_UPLOAD ? adminAudioUploadAdapter : undefined
              }
              audioAssets={advanced.audio_assets}
              onAudioAssetsChange={(audio_assets) =>
                setAdvancedValue({ audio_assets })
              }
              renderActions={(ready, prepare, capture) => (
                <Space>
                  <Button onClick={() => setAdvanced(undefined)}>
                    取消设置
                  </Button>
                  <Button
                    type="primary"
                    disabled={!ready}
                    onClick={() => {
                      if (prepare && !prepare()) return;
                      try {
                        const next = capture?.(true);
                        update({
                          ...advanced,
                          content: next?.value ?? advanced.content,
                          voice_profile:
                            next?.voiceProfile ?? advanced.voice_profile,
                          audio_assets:
                            next?.audioAssets ?? advanced.audio_assets
                        });
                        setAdvanced(undefined);
                      } catch {
                        setLocalError("设置尚未完成，请检查标注后重试。");
                      }
                    }}
                  >
                    应用设置
                  </Button>
                  {localError && <span role="alert">{localError}</span>}
                </Space>
              )}
            />
          </Suspense>
        )}
      </VoiceEditorModal>
    </Card>
  );
}

export function InlineSentenceExamples({
  ids = [],
  target,
  medium,
  requests,
  disabled,
  onChange,
  onPick,
  registerLeaveGuard
}: {
  ids?: string[];
  target: string;
  medium: string;
  requests: LexiconNextRequests;
  disabled: boolean;
  onChange: (ids: string[]) => void;
  onPick: () => void;
  registerLeaveGuard?: (guard?: () => Promise<boolean>) => void;
}) {
  const catalog = useQuery({
    queryKey: ["admin-lexicon-next", "equivalent-catalog"],
    queryFn: requests.equivalentCatalog,
    staleTime: 5 * 60 * 1000,
    retry: false
  });
  const workspace = useSentenceDraftWorkspace()!;
  const actor = useAuthStore((s) => s.profile);
  const canRead = usePermission("sentences.access");
  const canCreate = usePermission("sentences.create");
  const [collapsed, setCollapsed] = useState(false);
  return (
    <>
      <SenseSectionTitle
        label="多维例句"
        count={ids.length}
        unit="条"
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
        extra={
          <div
            className="next-sentence-header-actions"
            onClick={(event) => event.stopPropagation()}
          >
            <Space>
              <Button
                type="link"
                size="small"
                icon={<Plus />}
                disabled={
                  disabled || !canRead || !canCreate || catalog.isPending
                }
                onClick={() => {
                  const id = workspace.add(
                    target,
                    actor?.id ?? "",
                    catalog.data
                  );
                  onChange([...ids, id]);
                  setCollapsed(false);
                }}
              >
                添加例句
              </Button>
              <Button
                type="link"
                size="small"
                disabled={disabled || !canRead}
                onClick={onPick}
              >
                引用已有例句
              </Button>
            </Space>
          </div>
        }
      />
      <SenseSectionBody collapsed={collapsed}>
        <EntryDialectContext.Provider
          value={target === "en-GB" ? "en-GB" : "en-US"}
        >
          <PronunciationPreviewProvider>
            <div className="next-sentence-inline-list">
              {!canRead ? (
                <Alert type="warning" title="没有例句查看权限" />
              ) : (
                ids.map((id) =>
                  workspace.resources[id] ? (
                    <InlineSentenceCard
                      key={`${id}:${target}:${medium}`}
                      source={workspace.resources[id]!}
                      target={target}
                      medium={medium}
                      requests={requests}
                      disabled={disabled}
                      onRemove={() => onChange(ids.filter((v) => v !== id))}
                      registerLeaveGuard={registerLeaveGuard}
                    />
                  ) : (
                    <Alert
                      key={id}
                      type="error"
                      title="关联例句未加载，请重新加载词条。"
                    />
                  )
                )
              )}
              {!ids.length && (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="尚未添加例句"
                />
              )}
            </div>
          </PronunciationPreviewProvider>
        </EntryDialectContext.Provider>
      </SenseSectionBody>
    </>
  );
}

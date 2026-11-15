import {
  lazy,
  Suspense,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { flushSync } from "react-dom";
import type {
  NextSentence,
  NextSentenceTranslation,
  NextSentenceTranslationStyle,
  NextSentenceVariant
} from "@tsz/types";
import { Alert, Button, Flex, Space } from "@tsz/ui/admin/display";
import { Select } from "@tsz/ui/admin/forms";
import { App } from "@tsz/ui/admin/overlays";
import { RichTextReadOnly } from "@tsz/voice-editor/reader";
import { toRichTextV2, withDefaultVoiceProfile } from "@tsz/voice-editor/core";
import { VoiceEditorModal } from "@/features/dictionary/word-creation-v3/components/VoiceEditorModal";
import { useSelectedVoiceAudio } from "@/features/dictionary/word-creation-v3/useSelectedVoiceAudio";
import {
  adminAudioUploadAdapter,
  adminVoicePreviewAdapter,
  loadAdminVoiceRecommendations,
  voicePreviewIsMock
} from "@/features/dictionary/voice-editor/dataSource";
import { env } from "@/lib/env";
import { usePermission } from "@/lib/auth";
import type { LexiconNextRequests } from "@/pages/LexiconNext";
import { localeLabels } from "./model";
import "@tsz/voice-editor/styles.css";
const VoiceEditor = lazy(() =>
  import("@tsz/voice-editor/editor").then((module) => ({
    default: module.VoiceEditor
  }))
);
export const sentenceStyles: Record<NextSentenceTranslationStyle, string> = {
  word_for_word: "逐词直译",
  balanced_fluency: "均衡意译",
  adapted_creation: "改编创作"
};
const blank = () => ({ version: 2 as const, text: "", annotations: [] });
function newVariant(locale: string): NextSentenceVariant {
  return {
    id: crypto.randomUUID(),
    locale,
    level: "A1",
    content: blank(),
    translations: []
  };
}

function TranslationField({
  value,
  disabled,
  onOpenChange,
  onChange
}: {
  value: NextSentenceTranslation;
  disabled: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (row: NextSentenceTranslation) => void;
}) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState(value.content);
  return (
    <>
      <Button
        block
        disabled={disabled}
        onClick={() => {
          setContent(value.content);
          setOpen(true);
          onOpenChange(true);
        }}
        aria-label={`编辑${sentenceStyles[value.style]}`}
      >
        <RichTextReadOnly
          value={value.content}
          emptyText={`未填写${sentenceStyles[value.style]}`}
        />
      </Button>
      <VoiceEditorModal
        open={open}
        title={sentenceStyles[value.style]}
        footer={null}
        onCancel={() => {
          setOpen(false);
          onOpenChange(false);
        }}
      >
        {open && (
          <Suspense fallback={<span role="status">正在加载编辑器</span>}>
            <VoiceEditor
              value={toRichTextV2(content)}
              onChange={setContent}
              speechSettingsEnabled={false}
              previewEnabled={false}
              showAudioUpload={false}
              renderActions={(ready, prepare, capture) => (
                <Space>
                  <Button
                    onClick={() => {
                      setOpen(false);
                      onOpenChange(false);
                    }}
                  >
                    取消
                  </Button>
                  <Button
                    type="primary"
                    disabled={!ready}
                    onClick={() => {
                      if (prepare && !prepare()) return;
                      onChange({
                        ...value,
                        content: capture?.(true)?.value ?? content
                      });
                      setOpen(false);
                      onOpenChange(false);
                    }}
                  >
                    完成译文
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

export function NextSentenceEditor({
  source,
  target,
  medium,
  requests,
  onSaved,
  onClose,
  registerLeaveGuard
}: {
  source: NextSentence | null;
  target: "en-GB" | "en-US";
  medium: string;
  requests: LexiconNextRequests;
  onSaved: (sentence: NextSentence) => void;
  onClose: () => void;
  registerLeaveGuard?: (guard?: () => Promise<boolean>) => void;
}) {
  const [base, setBase] = useState(source);
  const [id] = useState(() => source?.id ?? crypto.randomUUID());
  const [draft, setDraft] = useState<NextSentenceVariant>(() => {
    const saved = source?.draft.variants.find((v) => v.locale === target);
    const variant = saved ? structuredClone(saved) : newVariant(target);
    variant.translations = variant.translations.filter(
      (v) => v.locale === medium
    );
    return variant;
  });
  const [translationOpen, setTranslationOpen] = useState(false);
  const initial = useRef(JSON.stringify(draft));
  const [applying, setApplying] = useState(false);
  const applyingRef = useRef(false);
  const [error, setError] = useState<string>();
  const canGenerate = usePermission("speech.generate");
  const canUpload = usePermission("speech.upload_audio");
  const generationAvailable =
    canGenerate && env.VOICE_PREVIEW && !voicePreviewIsMock;
  const previewAdapter = useMemo(
    () => ({ ...adminVoicePreviewAdapter, generateAudio: undefined }),
    []
  );
  const profile = useMemo(
    () => withDefaultVoiceProfile(draft.voice_profile, "example"),
    [draft.voice_profile]
  );
  const content = useMemo(() => toRichTextV2(draft.content), [draft.content]);
  const audio = useSelectedVoiceAudio({
    target: `next-sentence:${id}:${target}`,
    content,
    profile,
    adapter: adminVoicePreviewAdapter,
    locale: target,
    enabled: generationAvailable,
    defer: true,
    onChange: (voice_profile) =>
      setDraft((current) => ({ ...current, voice_profile }))
  });
  const latest = useRef({ draft, generate: audio.retry });
  useLayoutEffect(() => {
    latest.current = { draft, generate: audio.retry };
  });
  const { modal } = App.useApp();
  const dirty = translationOpen || JSON.stringify(draft) !== initial.current;
  useLayoutEffect(() => {
    if (!registerLeaveGuard) return;
    registerLeaveGuard(async () => {
      if (applyingRef.current) return false;
      if (!dirty) {
        onClose();
        return true;
      }
      return new Promise<boolean>((resolve) =>
        modal.confirm({
          title: "放弃例句修改？",
          content: "尚未完成的正文、译文和配音修改将被丢弃。",
          okText: "放弃修改",
          cancelText: "继续编辑",
          onOk: () => {
            onClose();
            resolve(true);
          },
          onCancel: () => resolve(false)
        })
      );
    });
    return () => registerLeaveGuard(undefined);
  }, [dirty, modal, onClose, registerLeaveGuard]);
  return (
    <VoiceEditorModal
      open
      title={`${localeLabels[target]}例句`}
      width={1200}
      footer={null}
      keyboard={!dirty && !applying}
      closable={!applying}
      onCancel={() => {
        if (!applyingRef.current) onClose();
      }}
    >
      <Flex vertical gap={16}>
        {base && (
          <Alert
            type="info"
            showIcon
            title="保存将同步更新引用此例句的所有义项。"
          />
        )}
        {error && (
          <Alert
            type="error"
            showIcon
            title={error}
            action={
              <Button
                disabled={applying}
                onClick={() =>
                  modal.confirm({
                    title: "重新加载例句？",
                    content: "将丢弃尚未保存的修改并读取服务器版本。",
                    okText: "重新加载",
                    cancelText: "继续编辑",
                    onOk: async () => {
                      try {
                        const current = await requests.sentence(id);
                        const saved = current.draft.variants.find(
                          (v) => v.locale === target
                        );
                        const next = saved
                          ? structuredClone(saved)
                          : newVariant(target);
                        next.translations = next.translations.filter(
                          (v) => v.locale === medium
                        );
                        setBase(current);
                        setDraft(next);
                        initial.current = JSON.stringify(next);
                        setError(undefined);
                      } catch (reason) {
                        setError(
                          reason instanceof Error
                            ? reason.message
                            : "无法读取例句，请重试"
                        );
                      }
                    }
                  })
                }
              >
                重新加载
              </Button>
            }
          />
        )}
        <Space>
          <span>例句等级</span>
          <Select
            aria-label="例句等级"
            disabled={applying}
            value={draft.level}
            options={["A1", "A2", "B1", "B2", "C1", "C2"].map((value) => ({
              value,
              label: value
            }))}
            onChange={(level) => setDraft((current) => ({ ...current, level }))}
          />
        </Space>
        <Suspense fallback={<span role="status">正在加载编辑器</span>}>
          <VoiceEditor
            mode="grammar"
            readOnly={applying}
            value={content}
            contextKey={draft.id}
            contextLabel={`${localeLabels[target]}例句`}
            locale={target}
            recommendationArea="example"
            speechSettingsEnabled
            previewEnabled={env.VOICE_PREVIEW}
            previewAdapter={previewAdapter}
            previewIsMock={voicePreviewIsMock}
            loadRecommendations={loadAdminVoiceRecommendations}
            voiceProfile={profile}
            onVoiceProfileChange={(voice_profile) =>
              setDraft((current) => ({ ...current, voice_profile }))
            }
            audioAssets={draft.audio_assets}
            showAudioUpload
            audioUploadAllowed={canUpload}
            audioUploadAdapter={
              env.VOICE_AUDIO_UPLOAD ? adminAudioUploadAdapter : undefined
            }
            onAudioAssetsChange={(audio_assets) =>
              setDraft((current) => ({ ...current, audio_assets }))
            }
            onChange={(content) =>
              setDraft((current) => ({ ...current, content }))
            }
            renderActions={(canComplete, prepare, capture) => (
              <Space>
                <Button disabled={applying} onClick={onClose}>
                  取消
                </Button>
                <Button
                  type="primary"
                  loading={applying}
                  disabled={
                    applying || !canComplete || !draft.content.text.trim()
                  }
                  onClick={async () => {
                    if (applyingRef.current) return;
                    applyingRef.current = true;
                    setApplying(true);
                    setError(undefined);
                    try {
                      if (prepare && !prepare()) return;
                      const result = capture?.(true);
                      if (result)
                        flushSync(() =>
                          setDraft((current) => ({
                            ...current,
                            content: result.value,
                            voice_profile: result.voiceProfile ?? undefined,
                            audio_assets: result.audioAssets ?? []
                          }))
                        );
                      if (
                        generationAvailable &&
                        !(await latest.current.generate())
                      )
                        throw new Error(
                          "配音生成未完成，请重试或取消对应音色后完成。"
                        );
                      const variant = latest.current.draft;
                      const scope = {
                        target_locale: target,
                        medium_locale: medium,
                        variant
                      };
                      const saved = base
                        ? await requests.saveSentence(id, {
                            ...scope,
                            expected_revision: base.revision
                          })
                        : await requests.createSentence({
                            id,
                            target_language: "en",
                            ...scope
                          });
                      onSaved(saved);
                    } catch (reason) {
                      setError(
                        reason instanceof Error
                          ? reason.message
                          : "无法保存例句，请重试"
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
        <Flex vertical gap={8}>
          <strong>{localeLabels[medium]}译文</strong>
          {draft.translations.map((row) => (
            <Space.Compact key={row.id} block>
              <Select
                aria-label="译文风格"
                value={row.style}
                disabled={applying}
                options={Object.entries(sentenceStyles).map(
                  ([value, label]) => ({ value, label })
                )}
                onChange={(style) =>
                  setDraft((current) => ({
                    ...current,
                    translations: current.translations.map((v) =>
                      v.id === row.id ? { ...v, style } : v
                    )
                  }))
                }
              />
              <TranslationField
                onOpenChange={setTranslationOpen}
                value={row}
                disabled={applying}
                onChange={(next) =>
                  setDraft((current) => ({
                    ...current,
                    translations: current.translations.map((v) =>
                      v.id === next.id ? next : v
                    )
                  }))
                }
              />
              <Button
                danger
                disabled={applying}
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    translations: current.translations.filter(
                      (v) => v.id !== row.id
                    )
                  }))
                }
              >
                移除译文
              </Button>
            </Space.Compact>
          ))}
          <Button
            disabled={applying}
            onClick={() =>
              setDraft((current) => ({
                ...current,
                translations: [
                  ...current.translations,
                  {
                    id: crypto.randomUUID(),
                    locale: medium,
                    style: "balanced_fluency",
                    content: blank()
                  }
                ]
              }))
            }
          >
            添加译文
          </Button>
        </Flex>
      </Flex>
    </VoiceEditorModal>
  );
}

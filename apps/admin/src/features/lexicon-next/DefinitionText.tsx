import {
  lazy,
  Suspense,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { flushSync } from "react-dom";
import type { NextDefinition } from "@tsz/types";
import { Alert, Button, Space } from "@tsz/ui/admin/display";
import { App } from "@tsz/ui/admin/overlays";
import { Pencil } from "lucide-react";
import { RichTextReadOnly } from "@tsz/voice-editor/reader";
import { toRichTextV2, withDefaultVoiceProfile } from "@tsz/voice-editor/core";
import { VoiceEditorModal } from "@/features/dictionary/word-creation-v3/components/VoiceEditorModal";
import { useSelectedVoiceAudio } from "@/features/dictionary/word-creation-v3/useSelectedVoiceAudio";
import { usePermission } from "@/lib/auth";
import { env } from "@/lib/env";
import {
  adminAudioUploadAdapter,
  adminVoicePreviewAdapter,
  loadAdminVoiceRecommendations,
  voicePreviewIsMock
} from "@/features/dictionary/voice-editor/dataSource";
import { PronunciationPreviewControls } from "@/features/dictionary/word-creation/PronunciationPreview";
import "@tsz/voice-editor/styles.css";
const VoiceEditor = lazy(() =>
  import("@tsz/voice-editor/editor").then((module) => ({
    default: module.VoiceEditor
  }))
);

export function DefinitionText({
  definition,
  label,
  disabled,
  onChange,
  registerLeaveGuard
}: {
  definition: NextDefinition;
  label: string;
  disabled: boolean;
  onChange: (value: NextDefinition) => void;
  registerLeaveGuard?: (guard?: () => Promise<boolean>) => void;
}) {
  const [draft, setDraft] = useState<NextDefinition>();
  const [applying, setApplying] = useState(false);
  const applyingRef = useRef(false);
  const [audioFailed, setAudioFailed] = useState(false);
  const canGenerate = usePermission("speech.generate");
  const canUpload = usePermission("speech.upload_audio");
  // 与 Step 2 一致，正式音频由应用草稿动作统一生成；编辑器仅处理正文、设置和试听。
  const previewAdapter = useMemo(
    () => ({ ...adminVoicePreviewAdapter, generateAudio: undefined }),
    []
  );
  const current = draft ?? definition;
  const profile = useMemo(
    () => withDefaultVoiceProfile(current.voice_profile, "meaning"),
    [current.voice_profile]
  );
  const content = useMemo(
    () =>
      toRichTextV2(
        current.content ?? { version: 2, text: current.text, annotations: [] }
      ),
    [current.content, current.text]
  );
  const generateAvailable =
    canGenerate && env.VOICE_PREVIEW && !voicePreviewIsMock;
  const audio = useSelectedVoiceAudio({
    target: `definition:${definition.id}`,
    content,
    profile,
    adapter: adminVoicePreviewAdapter,
    locale:
      definition.locale === "en-GB" || definition.locale === "en-US"
        ? definition.locale
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
    draft !== undefined && JSON.stringify(draft) !== JSON.stringify(definition);
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
          title: "放弃释义修改？",
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
        <PronunciationPreviewControls
          pronunciationId={definition.id}
          recommendationArea="meaning"
          playbackOnly
          assetOnly={disabled}
          dialect={
            definition.locale === "en-GB"
              ? "uk"
              : definition.locale === "en-US"
                ? "us"
                : "common"
          }
          ariaLabelPrefix={label}
          content={toRichTextV2(
            definition.content ?? {
              version: 2,
              text: definition.text,
              annotations: []
            }
          )}
          voiceProfile={definition.voice_profile}
          audioAssets={definition.audio_assets}
        />
        <Button
          className="lexicon-next-grammar-text"
          block
          icon={<Pencil />}
          iconPlacement="end"
          aria-label={`编辑${label}`}
          disabled={disabled}
          onClick={() => {
            setAudioFailed(false);
            setDraft(structuredClone(definition));
          }}
        >
          <RichTextReadOnly
            className={
              definition.text
                ? "tsz-words lexicon-next-grammar-content"
                : "lexicon-next-grammar-empty"
            }
            value={
              definition.content ?? {
                version: 2,
                text: definition.text,
                annotations: []
              }
            }
            emptyText="未填写英文释义"
          />
        </Button>
      </Space.Compact>
      <VoiceEditorModal
        width={1200}
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
            <VoiceEditor
              mode="grammar"
              readOnly={disabled || applying}
              value={toRichTextV2(
                draft.content ?? {
                  version: 2,
                  text: draft.text,
                  annotations: []
                }
              )}
              contextLabel={label}
              contextKey={definition.id}
              locale={
                definition.locale === "en-GB" || definition.locale === "en-US"
                  ? definition.locale
                  : undefined
              }
              speechSettingsEnabled
              showAudioUpload
              previewEnabled={env.VOICE_PREVIEW}
              previewAdapter={previewAdapter}
              previewIsMock={voicePreviewIsMock}
              recommendationArea="meaning"
              loadRecommendations={loadAdminVoiceRecommendations}
              voiceProfile={profile}
              onVoiceProfileChange={(voice_profile) =>
                setDraft((current) => current && { ...current, voice_profile })
              }
              audioAssets={draft.audio_assets}
              audioUploadAllowed={canUpload}
              audioUploadAdapter={
                env.VOICE_AUDIO_UPLOAD ? adminAudioUploadAdapter : undefined
              }
              onAudioAssetsChange={(audio_assets) =>
                setDraft((current) => current && { ...current, audio_assets })
              }
              onChange={(content) =>
                setDraft(
                  (current) =>
                    current && { ...current, text: content.text, content }
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
                              text: result.value.text,
                              content: result.value,
                              voice_profile: result.voiceProfile ?? undefined,
                              audio_assets: result.audioAssets ?? []
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
                        const applied = latest.current.draft;
                        latest.current.onChange({
                          ...definition,
                          text: applied.content?.text ?? applied.text,
                          content: applied.content,
                          voice_profile: applied.voice_profile,
                          audio_assets: applied.audio_assets
                        });
                        setDraft(undefined);
                      } catch (error) {
                        message.error(
                          error instanceof Error
                            ? error.message
                            : "无法完成释义编辑，请检查配音设置"
                        );
                      } finally {
                        applyingRef.current = false;
                        setApplying(false);
                      }
                    }}
                  >
                    应用正文与配音
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

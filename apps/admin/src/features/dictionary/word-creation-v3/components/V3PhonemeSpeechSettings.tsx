import { useVoiceSave } from "../voiceSaveContext";
import { flushSync } from "react-dom";
import { EditOutlined } from "@ant-design/icons";
import { HttpError } from "@tsz/api-client";
import { Alert, Button, Space, Typography } from "antd";
import {
  lazy,
  Suspense,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type {
  AudioAssetV3,
  PhonemeLocaleV3,
  PronunciationSynthesisCandidateV3,
  RichTextV2,
  VoiceProfileV3
} from "@tsz/types";
import type { VoicePreviewAdapter } from "@tsz/voice-editor/types";
import { toRichTextV2 } from "@tsz/voice-editor/core";
import {
  editSynthesisUpsWords,
  pronunciationSynthesisContent,
  synthesisInputIssue,
  mapSynthesisSpeechContent
} from "@tsz/shared";
import { env } from "@/lib/env";
import { api, usePermission } from "@/lib/auth";
import {
  adminAudioUploadAdapter,
  adminVoicePreviewAdapter,
  loadAdminVoiceRecommendations,
  voicePreviewIsMock
} from "../../voice-editor/dataSource";
import { useContentEditPermissions } from "../../contentEditPermissions";
import { VoiceEditorModal } from "./VoiceEditorModal";
import "@tsz/voice-editor/styles.css";

const VoiceEditor = lazy(() =>
  import("@tsz/voice-editor/editor").then((module) => ({
    default: module.VoiceEditor
  }))
);

export function V3PhonemeSpeechSettings({
  spelling,
  candidate,
  alphabet,
  locale,
  label,
  fallbackVoiceProfile,
  audioAssets = [],
  nodeId,
  field,
  onChange
}: {
  spelling: string;
  candidate: PronunciationSynthesisCandidateV3;
  alphabet: "ipa" | "ups";
  locale: PhonemeLocaleV3;
  label: string;
  fallbackVoiceProfile?: VoiceProfileV3;
  audioAssets?: AudioAssetV3[];
  nodeId: string;
  field: string;
  onChange: (
    candidate: PronunciationSynthesisCandidateV3,
    audioAssets: AudioAssetV3[]
  ) => void;
}) {
  const businessSave = useVoiceSave();
  const businessSaveRef = useRef(businessSave);
  useLayoutEffect(() => {
    businessSaveRef.current = businessSave;
  });
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [saveError, setSaveError] = useState("");
  const targetKey = JSON.stringify([nodeId, alphabet, locale]);
  const activeTarget = useRef<string | null>(targetKey);
  useLayoutEffect(() => {
    activeTarget.current = targetKey;
    return () => {
      activeTarget.current = null;
    };
  }, [targetKey]);
  const { edit: canEdit } = useContentEditPermissions();
  const canUploadAudio = usePermission("speech.upload_audio");
  const [open, setOpen] = useState(false);
  const wordHistory = useRef(
    new Map<string, PronunciationSynthesisCandidateV3["ups_words"]>()
  );
  const capture = () => {
    wordHistory.current.clear();
    wordHistory.current.set(candidate.ups, candidate.ups_words);
    const speech = candidate[`${alphabet}_speech`];
    return structuredClone({
      content:
        speech?.content.text === spelling
          ? (mapSynthesisSpeechContent(
              speech.content,
              spelling,
              candidate,
              alphabet,
              false
            ) ?? {
              version: 2 as const,
              text: candidate[alphabet],
              annotations: []
            })
          : { version: 2 as const, text: candidate[alphabet], annotations: [] },
      voice_profile: speech?.voice_profile ?? fallbackVoiceProfile,
      audio_assets: audioAssets,
      ups_words: candidate.ups_words
    });
  };
  const [draft, setDraft] = useState<{
    content: RichTextV2;
    voice_profile: VoiceProfileV3 | undefined;
    audio_assets: AudioAssetV3[];
    ups_words: PronunciationSynthesisCandidateV3["ups_words"];
  }>(capture);
  const [source, setSource] = useState("");
  const editedCandidate = {
    ...candidate,
    [alphabet]: draft.content.text,
    ...(alphabet === "ups" ? { ups_words: draft.ups_words } : {})
  };
  const pauseIssue = mapSynthesisSpeechContent(
    draft.content,
    spelling,
    editedCandidate,
    alphabet,
    true
  )
    ? undefined
    : "停顿须在词间，特殊读法须选完整词界；短语 UPS 请保留逐词边界或从 IPA 重新转换";
  const inputIssue =
    synthesisInputIssue(alphabet, draft.content.text) ?? pauseIssue;
  const resolveCandidate = (content: RichTextV2) => ({
    ...editedCandidate,
    [`${alphabet}_speech`]: {
      content: mapSynthesisSpeechContent(
        content,
        spelling,
        editedCandidate,
        alphabet,
        true
      ) ?? { version: 2 as const, text: spelling, annotations: [] },
      voice_profile: draft.voice_profile ?? { voices: [] }
    }
  });
  const sourceKey = JSON.stringify([
    nodeId,
    alphabet,
    locale,
    spelling,
    candidate[alphabet],
    alphabet === "ups" ? candidate.ups_words : undefined
  ]);
  const latest = useRef({
    spelling,
    alphabet,
    locale,
    inputIssue,
    resolveCandidate
  });
  useLayoutEffect(() => {
    latest.current = {
      spelling,
      alphabet,
      locale,
      inputIssue,
      resolveCandidate
    };
  });
  const adapter = useMemo<VoicePreviewAdapter>(
    () => ({
      listVoices: (input) => adminVoicePreviewAdapter.listVoices(input),
      resolveAudio: adminVoicePreviewAdapter.resolveAudio,
      synthesizeSsml: adminVoicePreviewAdapter.synthesizeSsml,
      async renderSsml(input, options) {
        const { alphabet, locale, inputIssue, resolveCandidate } =
          latest.current;
        if (inputIssue) throw new Error(inputIssue);
        const candidate = resolveCandidate(input.content);
        return (
          await api.speech.renderSsml(
            {
              source: {
                kind: "phoneme",
                phoneme_locale: locale,
                content: candidate[`${alphabet}_speech`]!.content,
                alphabet,
                phoneme: input.content.text,
                ups_words: alphabet === "ups" ? (candidate.ups_words ?? []) : []
              },
              setting: input.setting
            },
            options?.signal
          )
        ).ssml;
      },
      async resolveVoices(input, options) {
        const { alphabet, locale, inputIssue, resolveCandidate } =
          latest.current;
        if (inputIssue) throw new Error(inputIssue);
        const candidate = resolveCandidate(input.content);
        return (
          await api.speech.resolve(
            {
              profile: input.profile,
              accent: input.accent,
              source: {
                kind: "phoneme",
                phoneme_locale: locale,
                content: candidate[`${alphabet}_speech`]!.content,
                alphabet,
                phoneme: input.content.text,
                ups_words: alphabet === "ups" ? (candidate.ups_words ?? []) : []
              }
            },
            options?.signal
          )
        ).voices;
      },
      async generateAudio(input, options) {
        const { alphabet, locale, inputIssue, resolveCandidate } =
          latest.current;
        if (inputIssue) throw new Error(inputIssue);
        const candidate = resolveCandidate(input.content);
        try {
          const result = await api.speech.generateAudio(
            {
              request_id: input.requestId,
              source: {
                kind: "phoneme",
                phoneme_locale: locale,
                content: candidate[`${alphabet}_speech`]!.content,
                alphabet,
                phoneme: input.content.text,
                ups_words: alphabet === "ups" ? (candidate.ups_words ?? []) : []
              },
              setting: input.setting,
              ...(input.profile ? { profile: input.profile } : {})
            },
            options?.signal
          );
          return result.asset;
        } catch (error) {
          if (
            error instanceof HttpError &&
            error.status === 422 &&
            /phoneme_locale/.test(error.message)
          )
            throw new Error(
              "当前后端尚未支持精确地区音素生成，请升级服务后重试；现有配置与音频已保留"
            );
          throw error;
        }
      },
      async synthesize(input, options) {
        const { spelling, alphabet, locale, inputIssue, resolveCandidate } =
          latest.current;
        if (inputIssue) throw new Error(inputIssue);
        const content = pronunciationSynthesisContent(spelling, {
          alphabet,
          ...resolveCandidate(input.content),
          use_spelling: false,
          ipa_locale: locale,
          ups_locale: locale
        });
        if (!content)
          throw new Error(
            "音素与词形词界不一致，请检查对应音素；短语 UPS 可重新从 IPA 转换"
          );
        return adminVoicePreviewAdapter.synthesize(
          { ...input, content },
          options
        );
      }
    }),
    []
  );
  return (
    <>
      <Button
        icon={<EditOutlined />}
        aria-label={`打开${label} TTS 设置器`}
        data-v3-node-id={nodeId}
        data-v3-field={field}
        disabled={!canEdit}
        onClick={() => {
          setDraft(capture());
          setSaveError("");
          setSource(sourceKey);
          setOpen(true);
        }}
      />
      {open && (
        <VoiceEditorModal
          width={1200}
          title={`${label} · 音标、停顿与音色`}
          open
          footer={null}
          onCancel={() => {
            if (!savingRef.current) setOpen(false);
          }}
          closable={!saving}
          keyboard={!saving}
        >
          {saveError && <Alert type="error" showIcon title={saveError} />}
          <Suspense
            fallback={<Typography.Text>正在加载 TTS 设置…</Typography.Text>}
          >
            <VoiceEditor
              readOnly={!canEdit || saving || source !== sourceKey}
              mode="phoneme-settings"
              autoRecommend={
                candidate[`${alphabet}_speech`]?.voice_profile == null &&
                fallbackVoiceProfile == null
              }
              loadRecommendations={loadAdminVoiceRecommendations}
              recommendationArea="azure"
              locale={locale}
              language="en"
              contextLabel={`${label}音标编辑`}
              inputDataAttributes={{
                "data-v3-node-id": nodeId,
                "data-v3-field": field
              }}
              value={draft.content}
              onChange={(content) =>
                setDraft((current) => {
                  const ups_words =
                    alphabet !== "ups"
                      ? current.ups_words
                      : wordHistory.current.has(content.text)
                        ? wordHistory.current.get(content.text)
                        : editSynthesisUpsWords(
                            spelling,
                            {
                              ...candidate,
                              ups: current.content.text,
                              ups_words: current.ups_words
                            },
                            content.text
                          );
                  if (alphabet === "ups")
                    wordHistory.current.set(content.text, ups_words);
                  return {
                    ...current,
                    content: toRichTextV2(content),
                    ups_words
                  };
                })
              }
              audioUploadAdapter={
                env.VOICE_AUDIO_UPLOAD ? adminAudioUploadAdapter : undefined
              }
              audioUploadAllowed={canUploadAudio}
              audioAssets={draft.audio_assets}
              onAudioAssetsChange={(audio_assets) =>
                setDraft((current) => ({ ...current, audio_assets }))
              }
              voiceProfile={draft.voice_profile}
              onVoiceProfileChange={(voice_profile) =>
                setDraft((current) => ({ ...current, voice_profile }))
              }
              previewAdapter={adapter}
              previewEnabled={env.VOICE_PREVIEW && source === sourceKey}
              previewIsMock={voicePreviewIsMock}
              renderActions={(canComplete, prepareComplete, captureResult) => (
                <Space>
                  <Button
                    aria-label={`取消${label}设置`}
                    disabled={saving}
                    onClick={() => setOpen(false)}
                  >
                    取消
                  </Button>
                  <Button
                    type="primary"
                    aria-label={
                      businessSave ? `保存${label}修改` : `完成${label}设置`
                    }
                    loading={saving}
                    disabled={
                      !canEdit ||
                      !canComplete ||
                      Boolean(inputIssue) ||
                      source !== sourceKey
                    }
                    onClick={async () => {
                      if (
                        savingRef.current ||
                        (prepareComplete && !prepareComplete())
                      )
                        return;
                      savingRef.current = true;
                      setSaving(true);
                      setSaveError("");
                      try {
                        const result = captureResult?.(!!businessSave);
                        const next = resolveCandidate(
                          toRichTextV2(result?.value ?? draft.content)
                        );
                        if (result?.voiceProfile)
                          next[`${alphabet}_speech`]!.voice_profile =
                            result.voiceProfile;
                        flushSync(() => {
                          setSource(
                            JSON.stringify([
                              nodeId,
                              alphabet,
                              locale,
                              spelling,
                              next[alphabet],
                              alphabet === "ups" ? next.ups_words : undefined
                            ])
                          );
                          onChange(
                            next,
                            result?.audioAssets ?? draft.audio_assets
                          );
                        });
                        if (
                          businessSaveRef.current &&
                          !(await businessSaveRef.current.save("azure"))
                        ) {
                          if (activeTarget.current !== targetKey) return;
                          setSaveError(
                            "保存未完成，全部修改已保留；请处理业务校验或版本冲突后重试。"
                          );
                          return;
                        }
                        if (activeTarget.current === targetKey) setOpen(false);
                      } catch (error) {
                        if (activeTarget.current !== targetKey) return;
                        setSaveError(
                          error instanceof Error
                            ? error.message
                            : "保存失败，修改已保留"
                        );
                      } finally {
                        savingRef.current = false;
                        setSaving(false);
                      }
                    }}
                  >
                    {businessSave ? "保存修改" : "完成"}
                  </Button>
                </Space>
              )}
            />
            {inputIssue && <Alert type="warning" title={inputIssue} showIcon />}
          </Suspense>
        </VoiceEditorModal>
      )}
    </>
  );
}
